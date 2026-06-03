// Tether apply layer — turns APPROVED staged actions into real store mutations.
//
// Everything here runs on the CLIENT, against the CURRENT store (not the snapshot
// the agent saw), through the same Zustand actions a user's clicks would call —
// so Tether's changes flow through normal persistence/sync. Names are resolved to
// ids at apply-time, actions run in dependency order, and each reports success or
// a skip reason (partial-apply safety).

import { useStore } from '../store';
import { setTheme, type Theme } from './theme';

export type StagedActionType =
  | 'create_task' | 'update_task' | 'update_tasks' | 'rename_category' | 'create_category'
  | 'create_subcategory' | 'assign_to_block' | 'create_block'
  // Task Chains + Weekview:
  | 'add_chain_steps' | 'add_tasks_to_chain' | 'complete_chain_step'
  | 'apply_chain_template' | 'schedule_block'
  // Destructive — gated behind a typed confirmation, never part of "apply all":
  | 'delete_tasks' | 'delete_category' | 'remove_chain_steps' | 'remove_schedule_blocks'
  // Immediate, reversible UI/settings/navigation actions (no approval gate):
  | 'set_theme' | 'set_synamon' | 'switch_view' | 'open_sync_settings';

export interface StagedAction {
  id: string;
  type: StagedActionType;
  summary: string;
  payload: Record<string, unknown>;
  /** Immediate actions apply on receipt (reversible); data mutations need approval. */
  immediate?: boolean;
  /** Destructive actions route to the typed-confirmation deletion modal. */
  destructive?: boolean;
}

// Reversible UI/preference/navigation actions that apply without the approval gate.
const IMMEDIATE_TYPES = new Set<StagedActionType>(['set_theme', 'set_synamon', 'switch_view', 'open_sync_settings']);
export function isImmediate(a: StagedAction): boolean {
  return !!a.immediate || IMMEDIATE_TYPES.has(a.type);
}

const DESTRUCTIVE_TYPES = new Set<StagedActionType>(['delete_tasks', 'delete_category', 'remove_chain_steps', 'remove_schedule_blocks']);
export function isDestructive(a: StagedAction): boolean {
  return !!a.destructive || DESTRUCTIVE_TYPES.has(a.type);
}

export interface DeleteTargets {
  noun: string;        // 'task' | 'category'
  count: number;       // primary entities being deleted
  names: string[];     // their names, for the modal list
  cascade?: string[];  // extra things that disappear (e.g. a category's tasks)
}

/**
 * Resolve, against the CURRENT store, exactly what a delete action will remove —
 * so the confirmation modal lists real names (the action only carries ids).
 */
export function resolveDeleteTargets(action: StagedAction): DeleteTargets {
  const p = action.payload || {};
  if (action.type === 'delete_tasks') {
    const tasks = useStore.getState().tasks;
    const ids = Array.isArray(p.taskIds) ? (p.taskIds as string[]) : [];
    const names = ids.map((id) => tasks[id]?.title).filter(Boolean) as string[];
    return { noun: 'task', count: names.length, names };
  }
  if (action.type === 'remove_chain_steps') {
    const date = String(p.date ?? '');
    const titles = Array.isArray(p.stepTitles) ? (p.stepTitles as string[]) : [];
    const present = chainLinkTitles(date).map((l) => lc(l.title));
    // Only count steps that actually exist in the day's chain.
    const names = titles.filter((t) => present.includes(lc(t)));
    return { noun: 'step', count: names.length, names: names.length ? names : titles };
  }
  if (action.type === 'remove_schedule_blocks') {
    const sel = Array.isArray(p.blocks) ? (p.blocks as Array<Record<string, unknown>>) : [];
    const names = sel.map((b) => `${b.day} ${b.startTime}`);
    return { noun: 'block', count: sel.length, names };
  }
  // delete_category
  const catId = findCategoryId(p.categoryName);
  const state = useStore.getState();
  const cat = catId ? state.categories[catId] : undefined;
  const cascade = cat
    ? [
        ...cat.subcategories.map((s) => `subcategory: ${s.name}`),
        ...Object.values(state.tasks).filter((t) => t.categoryId === cat.id).map((t) => `task: ${t.title}`),
      ]
    : [];
  return { noun: 'category', count: cat ? 1 : 0, names: cat ? [cat.name] : [String(p.categoryName ?? '')], cascade };
}

/** The exact phrase the user must type, count-aware and pluralised. */
export function requiredDeletePhrase(noun: string, count: number): string {
  return count === 1 ? `Delete this 1 ${noun}` : `Delete these ${count} ${noun}s`;
}

export interface ApplyResult {
  id: string;
  ok: boolean;
  message: string; // success detail or skip reason
}

// Apply in dependency order so a "create category" + "create task in it" batch
// resolves correctly regardless of the order the agent emitted them.
const ORDER: StagedActionType[] = [
  'create_category', 'rename_category', 'create_subcategory', 'create_block',
  'create_task', 'assign_to_block', 'update_task', 'update_tasks',
  'add_chain_steps', 'add_tasks_to_chain', 'apply_chain_template', 'complete_chain_step',
  'schedule_block',
  'delete_tasks', 'delete_category', 'remove_chain_steps', 'remove_schedule_blocks',
  'set_theme', 'set_synamon', 'switch_view', 'open_sync_settings',
];

function lc(s: unknown): string { return String(s ?? '').trim().toLowerCase(); }

function parseDue(v: unknown): number | undefined {
  if (v == null || v === '') return undefined;
  const t = Date.parse(String(v));
  return Number.isNaN(t) ? undefined : t;
}

/** Resolve a category by name against the live store (case-insensitive). */
function findCategoryId(name: unknown): string | undefined {
  const n = lc(name);
  if (!n) return undefined;
  const cats = useStore.getState().categories;
  return Object.values(cats).find((c) => lc(c.name) === n)?.id;
}

function findSubcategoryId(categoryId: string, name: unknown): string | undefined {
  const n = lc(name);
  if (!n) return undefined;
  const cat = useStore.getState().categories[categoryId];
  return cat?.subcategories.find((s) => lc(s.name) === n)?.id;
}

function findBlockId(name: unknown): string | undefined {
  const n = lc(name);
  if (!n) return undefined;
  const blocks = useStore.getState().timeBlocks;
  return Object.values(blocks).find((b) => lc(b.name) === n)?.id;
}

/**
 * Apply an edit change-set to one task (shared by single + bulk update). Reads
 * the LIVE store each call so it's correct mid-batch. Returns false if the task
 * is gone. Handles fields, completion (via toggle for side-effects), dependencies,
 * and block add/remove.
 */
function applyTaskChanges(taskId: string, c: Record<string, unknown>): boolean {
  const store = useStore.getState();
  const task = store.tasks[taskId];
  if (!task) return false;

  const updates: Record<string, unknown> = {};
  if (c.title != null) updates.title = String(c.title);
  if (c.weight != null) updates.weight = Number(c.weight);
  if (c.notes != null) updates.notes = String(c.notes);
  if (c.dueDate != null) updates.dueDate = parseDue(c.dueDate); // "" → undefined (clears)
  if (c.categoryName != null) {
    const catId = findCategoryId(c.categoryName);
    if (catId) { updates.categoryId = catId; updates.subcategoryId = undefined; }
  }
  if (c.subcategoryName != null && (updates.categoryId || task.categoryId)) {
    const sid = findSubcategoryId(String(updates.categoryId || task.categoryId), c.subcategoryName);
    if (sid) updates.subcategoryId = sid;
  }
  // Dependencies (prerequisites): clear and/or add taskIds, excluding self + dupes.
  if (c.clearDependencies || Array.isArray(c.addDependencies)) {
    const base = c.clearDependencies ? [] : [...(task.dependsOn || [])];
    const set = new Set(base);
    for (const dep of (Array.isArray(c.addDependencies) ? c.addDependencies : []) as string[]) {
      if (dep && dep !== taskId && store.tasks[dep]) set.add(dep);
    }
    updates.dependsOn = [...set];
  }
  if (Object.keys(updates).length) store.updateTask(taskId, updates);

  // Completion has side-effects (streak, completedAt) — route via toggle.
  if (c.completed != null && !!c.completed !== !!task.completed) store.toggleTask(taskId);

  // Block membership.
  if (c.removeFromBlock != null) {
    const bid = findBlockId(c.removeFromBlock);
    if (bid) store.removeTaskFromBlock(taskId, bid);
  }
  if (c.assignToBlock != null) {
    const bid = findBlockId(c.assignToBlock);
    if (bid) store.assignTaskToBlock(taskId, bid);
  }
  return true;
}

function findTaskIdByTitle(title: unknown): string | undefined {
  const n = lc(title);
  if (!n) return undefined;
  return Object.values(useStore.getState().tasks).find((t) => lc(t.title) === n)?.id;
}

// ── Chain / Weekview resolution (title/date/day+time → store addressing) ──

const DAYS = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
function dayNameToIndex(day: unknown): number {
  const d = lc(day);
  const i = DAYS.findIndex((name) => name === d || name.slice(0, 3) === d.slice(0, 3));
  return i; // -1 if not found
}

// "9:00" / "09:30" → slot (0 = 6:00 AM, 30-min steps), or -1 if invalid/out of range.
function timeToSlot(time: unknown): number {
  const m = String(time ?? '').match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return -1;
  const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
  if (h < 6 || h > 23 || (min !== 0 && min !== 30)) return -1;
  return (h - 6) * 2 + (min >= 30 ? 1 : 0);
}

// Monday (YYYY-MM-DD) of the week containing `date` (defaults to today).
function weekMonday(date?: Date): string {
  const d = date ? new Date(date) : new Date();
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  return `${monday.getFullYear()}-${String(monday.getMonth() + 1).padStart(2, '0')}-${String(monday.getDate()).padStart(2, '0')}`;
}

// ISO date string (YYYY-MM-DD) `n` days after `iso`.
function addDays(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// The Weekview (Overview) filters blocks by getWeekStart(localMonday)
// .toISOString().slice(0,10) — the LOCAL-midnight Monday converted to a UTC date,
// which in timezones ahead of UTC is the PREVIOUS calendar day. A block's weekDate
// must match this exact string or it won't render. Derive it from the block's
// actual local day.
function overviewWeekDateFor(localDateStr: string): string {
  const base = new Date(localDateStr + 'T12:00:00'); // local noon, TZ-edge-safe
  const day = base.getDay();
  const diff = base.getDate() - day + (day === 0 ? -6 : 1); // back to Monday
  const monday = new Date(base);
  monday.setDate(diff);
  monday.setHours(0, 0, 0, 0);
  return monday.toISOString().slice(0, 10);
}

/** Top-level chain links of a date, with their resolved titles (for title→index). */
function chainLinkTitles(date: string): { index: number; title: string; ctId?: string; type: string }[] {
  const chain = useStore.getState().taskChains[date];
  if (!chain) return [];
  const tasks = useStore.getState().tasks;
  const chainTasks = useStore.getState().chainTasks;
  return (chain.links || []).map((l, index) => {
    if (l.type === 'ct') return { index, title: chainTasks[l.taskId]?.title || '', ctId: l.taskId, type: 'ct' };
    if (l.type === 'realtask') return { index, title: tasks[l.taskId]?.title || l.placeholder || '', type: 'realtask' };
    return { index, title: '', type: l.type };
  });
}

// Resolve {day, startTime, weekDate?} → a Weekview block id in the current store.
function findScheduleBlockId(sel: { day: unknown; startTime: unknown; weekDate?: unknown }): string | undefined {
  const dayIndex = dayNameToIndex(sel.day);
  const startSlot = timeToSlot(sel.startTime);
  const week = sel.weekDate ? String(sel.weekDate) : weekMonday();
  if (dayIndex < 0 || startSlot < 0) return undefined;
  return useStore.getState().overviewBlocks.find(
    (b) => b.dayIndex === dayIndex && b.startSlot === startSlot && b.weekDate === week,
  )?.id;
}

/**
 * Apply the approved staged actions. Returns a per-action result list.
 * Newly created categories/blocks are resolvable by later actions in the batch.
 */
export function applyStagedActions(actions: StagedAction[]): ApplyResult[] {
  const store = useStore.getState();
  const results: ApplyResult[] = [];

  const ordered = [...actions].sort((a, b) => ORDER.indexOf(a.type) - ORDER.indexOf(b.type));

  for (const action of ordered) {
    const p = action.payload || {};
    try {
      switch (action.type) {
        case 'create_category': {
          const name = String(p.name || '').trim();
          if (!name) throw new Error('missing name');
          let catId = findCategoryId(name);
          if (catId) {
            results.push({ id: action.id, ok: true, message: `Category “${name}” already existed — reused.` });
          } else {
            catId = store.addCategory(name);
            results.push({ id: action.id, ok: true, message: `Created category “${name}”.` });
          }
          const subs = Array.isArray(p.subcategories) ? p.subcategories : [];
          for (const sub of subs) {
            const sn = String(sub).trim();
            if (sn && !findSubcategoryId(catId, sn)) store.addSubcategory(catId, sn);
          }
          break;
        }

        case 'create_subcategory': {
          const catId = findCategoryId(p.categoryName);
          if (!catId) { results.push(skip(action, `category “${p.categoryName}” not found`)); break; }
          const name = String(p.name || '').trim();
          if (!name) throw new Error('missing name');
          if (findSubcategoryId(catId, name)) { results.push({ id: action.id, ok: true, message: `Subcategory “${name}” already existed.` }); break; }
          store.addSubcategory(catId, name);
          results.push({ id: action.id, ok: true, message: `Added subcategory “${name}”.` });
          break;
        }

        case 'create_block': {
          const name = String(p.name || '').trim();
          const start = parseDue(p.startDate);
          const end = parseDue(p.endDate);
          if (!name || start == null || end == null) throw new Error('missing name/dates');
          store.addTimeBlock({ name, startDate: start, endDate: end });
          results.push({ id: action.id, ok: true, message: `Created time block “${name}”.` });
          break;
        }

        case 'create_task': {
          const title = String(p.title || '').trim();
          if (!title) throw new Error('missing title');
          let categoryId = findCategoryId(p.categoryName);
          if (!categoryId && p.categoryName) {
            // Category wasn't proposed/approved — create it implicitly so the task
            // isn't orphaned. (Treemap requires a category.)
            categoryId = store.addCategory(String(p.categoryName).trim());
          }
          if (!categoryId) { results.push(skip(action, 'no category resolved')); break; }
          const subcategoryId = p.subcategoryName ? findSubcategoryId(categoryId, p.subcategoryName) : undefined;
          const taskId = store.addTask({
            title,
            categoryId,
            ...(subcategoryId ? { subcategoryId } : {}),
            weight: typeof p.weight === 'number' ? p.weight : 1,
            ...(p.notes ? { notes: String(p.notes) } : {}),
            ...(parseDue(p.dueDate) != null ? { dueDate: parseDue(p.dueDate) } : {}),
          });
          let extra = '';
          if (p.blockName) {
            const blockId = findBlockId(p.blockName);
            if (blockId) { store.assignTaskToBlock(taskId, blockId); extra = ` → ${p.blockName}`; }
            else extra = ` (block “${p.blockName}” not found)`;
          }
          results.push({ id: action.id, ok: true, message: `Created “${title}”${extra}.` });
          break;
        }

        case 'assign_to_block': {
          const taskId = String(p.taskId || '');
          if (!store.tasks[taskId] && !useStore.getState().tasks[taskId]) { results.push(skip(action, 'task not found')); break; }
          const blockId = findBlockId(p.blockName);
          if (!blockId) { results.push(skip(action, `block “${p.blockName}” not found`)); break; }
          store.assignTaskToBlock(taskId, blockId);
          results.push({ id: action.id, ok: true, message: `Assigned to “${p.blockName}”.` });
          break;
        }

        case 'update_task': {
          const taskId = String(p.taskId || '');
          if (!applyTaskChanges(taskId, p)) { results.push(skip(action, 'task not found')); break; }
          results.push({ id: action.id, ok: true, message: 'Updated.' });
          break;
        }
        case 'update_tasks': {
          const ids = Array.isArray(p.taskIds) ? (p.taskIds as string[]) : [];
          const set = (p.set as Record<string, unknown>) || {};
          let n = 0;
          for (const id of ids) if (applyTaskChanges(id, set)) n++;
          results.push({ id: action.id, ok: true, message: `Updated ${n} of ${ids.length} task${ids.length === 1 ? '' : 's'}.` });
          break;
        }
        case 'rename_category': {
          const catId = findCategoryId(p.currentName);
          if (!catId) { results.push(skip(action, `category “${p.currentName}” not found`)); break; }
          store.renameCategory(catId, String(p.newName));
          results.push({ id: action.id, ok: true, message: `Renamed to “${p.newName}”.` });
          break;
        }

        // ── Task Chains ──
        case 'add_chain_steps': {
          const date = String(p.date || '');
          const steps = Array.isArray(p.steps) ? (p.steps as Array<Record<string, unknown>>) : [];
          let n = 0;
          for (const s of steps) {
            const title = String(s.title || '').trim();
            if (!title) continue;
            const ctId = store.addChainTask(date, title);
            if (s.notes) store.updateChainTaskNotes(ctId, String(s.notes));
            if (typeof s.durationMinutes === 'number') store.setChainTaskDuration(ctId, s.durationMinutes);
            n++;
          }
          results.push({ id: action.id, ok: true, message: `Added ${n} step${n === 1 ? '' : 's'} to the ${date} chain.` });
          break;
        }
        case 'add_tasks_to_chain': {
          const date = String(p.date || '');
          const ids = Array.isArray(p.taskIds) ? (p.taskIds as string[]) : [];
          let n = 0;
          for (const id of ids) {
            if (useStore.getState().tasks[id]) { store.addRealTaskToChain(date, id); n++; }
          }
          results.push({ id: action.id, ok: true, message: `Added ${n} task${n === 1 ? '' : 's'} to the ${date} chain.` });
          break;
        }
        case 'complete_chain_step': {
          const date = String(p.date || '');
          const link = chainLinkTitles(date).find((l) => l.type === 'ct' && lc(l.title) === lc(p.stepTitle));
          if (!link || !link.ctId) { results.push(skip(action, `step “${p.stepTitle}” not found in the ${date} chain`)); break; }
          store.completeChainTask(link.ctId);
          results.push({ id: action.id, ok: true, message: `Marked “${p.stepTitle}” complete.` });
          break;
        }
        case 'apply_chain_template': {
          const date = String(p.date || '');
          const name = lc(p.templateName);
          const tpl = Object.values(useStore.getState().chainTemplates).find((t) => lc(t.name) === name);
          if (!tpl) { results.push(skip(action, `template “${p.templateName}” not found`)); break; }
          if (p.mode === 'append') store.appendTemplateToChain(tpl.id, date);
          else store.loadTemplateAsChain(tpl.id, date);
          results.push({ id: action.id, ok: true, message: `${p.mode === 'append' ? 'Appended' : 'Loaded'} template “${tpl.name}”.` });
          break;
        }

        // ── Weekview ──
        case 'schedule_block': {
          const dayIndex = dayNameToIndex(p.day);
          const startSlot = timeToSlot(p.startTime);
          const endSlot = timeToSlot(p.endTime);
          if (dayIndex < 0) { results.push(skip(action, `invalid day “${p.day}”`)); break; }
          if (startSlot < 0 || endSlot < 0 || endSlot <= startSlot) { results.push(skip(action, 'invalid time range (06:00–23:30, 30-min steps)')); break; }
          const week = p.weekDate ? String(p.weekDate) : weekMonday();
          const dateStr = addDays(week, dayIndex); // the block's actual day, for the chain
          const taskId = p.taskTitle ? findTaskIdByTitle(p.taskTitle) : undefined;
          const name = String(p.name || 'Block');
          const now = Date.now();
          // Cross-talk (mirrors the Weekview UI): a scheduled block also lands in
          // that day's Task Chain — a real task (mt) or a standalone step (ct).
          let blockTaskId: string | undefined = taskId;
          let blockType: 'mt' | 'ct';
          if (taskId) { blockType = 'mt'; store.addRealTaskToChain(dateStr, taskId); }
          else { blockType = 'ct'; blockTaskId = store.addChainTask(dateStr, name); }
          const block = {
            id: Math.random().toString(36).substr(2, 9),
            dayIndex, startSlot, endSlot,
            type: blockType,
            name,
            ...(blockTaskId ? { taskId: blockTaskId } : {}),
            // Match the Weekview's timezone-shifted week key (derive from the day).
            weekDate: overviewWeekDateFor(dateStr),
            createdAt: now, updatedAt: now,
          };
          store.setOverviewBlocks([...useStore.getState().overviewBlocks, block]);
          results.push({ id: action.id, ok: true, message: `Scheduled “${name}” on ${p.day} ${p.startTime}–${p.endTime} (added to the chain too).` });
          break;
        }

        // ── Destructive (only reached after the typed-confirmation modal) ──
        case 'delete_tasks': {
          const ids = Array.isArray(p.taskIds) ? (p.taskIds as string[]) : [];
          let n = 0;
          for (const id of ids) {
            if (useStore.getState().tasks[id]) { store.deleteTask(id); n++; }
          }
          results.push({ id: action.id, ok: true, message: `Deleted ${n} task${n === 1 ? '' : 's'}.` });
          break;
        }
        case 'delete_category': {
          const catId = findCategoryId(p.categoryName);
          if (!catId) { results.push(skip(action, `category “${p.categoryName}” not found`)); break; }
          const taskCount = Object.values(useStore.getState().tasks).filter((t) => t.categoryId === catId).length;
          store.deleteCategory(catId);
          results.push({ id: action.id, ok: true, message: `Deleted category and ${taskCount} task${taskCount === 1 ? '' : 's'}.` });
          break;
        }
        case 'remove_chain_steps': {
          const date = String(p.date || '');
          const titles = Array.isArray(p.stepTitles) ? (p.stepTitles as string[]).map(lc) : [];
          // Resolve titles → top-level indices, then remove high→low so indices stay valid.
          const indices = chainLinkTitles(date)
            .filter((l) => titles.includes(lc(l.title)))
            .map((l) => l.index)
            .sort((a, b) => b - a);
          for (const idx of indices) store.removeChainLink(date, idx);
          results.push({ id: action.id, ok: true, message: `Removed ${indices.length} step${indices.length === 1 ? '' : 's'} from the ${date} chain.` });
          break;
        }
        case 'remove_schedule_blocks': {
          const sel = Array.isArray(p.blocks) ? (p.blocks as Array<Record<string, unknown>>) : [];
          const ids = sel.map((b) => findScheduleBlockId(b as { day: unknown; startTime: unknown; weekDate?: unknown })).filter(Boolean) as string[];
          if (ids.length) {
            const remaining = useStore.getState().overviewBlocks.filter((b) => !ids.includes(b.id));
            store.setOverviewBlocks(remaining);
          }
          results.push({ id: action.id, ok: true, message: `Removed ${ids.length} schedule block${ids.length === 1 ? '' : 's'}.` });
          break;
        }

        // ── Immediate, reversible UI/settings/navigation ──
        case 'set_theme': {
          const theme: Theme = p.theme === 'dark' ? 'dark' : 'light';
          setTheme(theme);
          results.push({ id: action.id, ok: true, message: `Theme → ${theme}.` });
          break;
        }
        case 'set_synamon': {
          store.setSynamonEnabled(!!p.visible);
          results.push({ id: action.id, ok: true, message: p.visible ? 'Synamon companion shown.' : 'Synamon companion hidden.' });
          break;
        }
        case 'switch_view': {
          const view = String(p.view || '');
          const valid = ['treemap', 'taskchain', 'overview', 'cofocus'];
          if (!valid.includes(view)) { results.push(skip(action, 'invalid view')); break; }
          store.setViewMode(view as 'treemap' | 'taskchain' | 'overview' | 'cofocus');
          results.push({ id: action.id, ok: true, message: 'View switched.' });
          break;
        }
        case 'open_sync_settings': {
          store.setSyncSettingsOpen(true);
          store.setTetherOpen(false); // step aside so the sync panel is visible
          results.push({ id: action.id, ok: true, message: 'Opened Cloud Sync settings.' });
          break;
        }

        default:
          results.push(skip(action, 'unknown action'));
      }
    } catch (e) {
      results.push(skip(action, e instanceof Error ? e.message : 'failed'));
    }
  }

  return results;
}

function skip(action: StagedAction, reason: string): ApplyResult {
  return { id: action.id, ok: false, message: `Skipped — ${reason}.` };
}
