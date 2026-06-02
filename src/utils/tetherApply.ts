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
  | 'create_task' | 'update_task' | 'create_category'
  | 'create_subcategory' | 'assign_to_block' | 'create_block'
  // Destructive — gated behind a typed confirmation, never part of "apply all":
  | 'delete_tasks' | 'delete_category'
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

const DESTRUCTIVE_TYPES = new Set<StagedActionType>(['delete_tasks', 'delete_category']);
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
  'create_category', 'create_subcategory', 'create_block',
  'create_task', 'assign_to_block', 'update_task',
  'delete_tasks', 'delete_category',
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
          const task = useStore.getState().tasks[taskId];
          if (!task) { results.push(skip(action, 'task not found')); break; }
          const updates: Record<string, unknown> = {};
          if (p.title != null) updates.title = String(p.title);
          if (p.weight != null) updates.weight = Number(p.weight);
          if (p.notes != null) updates.notes = String(p.notes);
          if (p.dueDate != null) updates.dueDate = parseDue(p.dueDate);
          if (p.categoryName != null) {
            const catId = findCategoryId(p.categoryName);
            if (catId) { updates.categoryId = catId; updates.subcategoryId = undefined; }
          }
          if (p.subcategoryName != null && (updates.categoryId || task.categoryId)) {
            const sid = findSubcategoryId(String(updates.categoryId || task.categoryId), p.subcategoryName);
            if (sid) updates.subcategoryId = sid;
          }
          if (Object.keys(updates).length) store.updateTask(taskId, updates);
          // Completion has side-effects (streaks, completedAt) — route via toggle.
          if (p.completed != null && !!p.completed !== !!task.completed) store.toggleTask(taskId);
          results.push({ id: action.id, ok: true, message: 'Updated.' });
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
