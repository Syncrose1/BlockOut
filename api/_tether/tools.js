// Tether READ tools (phase 1). Pure functions over the snapshot the client sends
// — no DB, no mutation. Each returns a compact projection to keep the model's
// context (and the user's BYOK token spend) small.

// ── helpers ──────────────────────────────────────────────────────────────────

const DAY_MS = 24 * 60 * 60 * 1000;

function toISO(ms) {
  if (!ms && ms !== 0) return null;
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

// Accept an ISO date (YYYY-MM-DD) or epoch ms; return epoch ms or null.
function parseWhen(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : t;
}

function categoryMaps(snapshot) {
  const cats = Object.values(snapshot.categories || {});
  const byId = {};
  const nameToId = {};
  const subById = {}; // subId -> {name, categoryId}
  for (const c of cats) {
    byId[c.id] = c;
    nameToId[(c.name || '').toLowerCase()] = c.id;
    for (const s of c.subcategories || []) subById[s.id] = { name: s.name, categoryId: c.id };
  }
  return { byId, nameToId, subById };
}

// taskId -> [block names]
function blockIndex(snapshot) {
  const idx = {};
  for (const b of Object.values(snapshot.timeBlocks || {})) {
    for (const tid of b.taskIds || []) (idx[tid] = idx[tid] || []).push(b.name);
  }
  return idx;
}

function projectTask(t, maps, blocks) {
  const cat = maps.byId[t.categoryId];
  const sub = t.subcategoryId ? maps.subById[t.subcategoryId] : null;
  return {
    id: t.id,
    title: t.title,
    category: cat ? cat.name : null,
    subcategory: sub ? sub.name : null,
    weight: t.weight,
    completed: !!t.completed,
    dueDate: toISO(t.dueDate),
    createdAt: toISO(t.createdAt),
    blocks: blocks[t.id] || [],
  };
}

// ── handlers ─────────────────────────────────────────────────────────────────

function listCategories(snapshot) {
  const tasks = Object.values(snapshot.tasks || {});
  // Aggregate counts AND unfinished effort per category/subcategory so questions
  // like "which category has the heaviest unfinished workload" are ONE call, not
  // a list_tasks per category (which burns the iteration budget).
  const agg = (pred) => {
    const sel = tasks.filter(pred);
    const active = sel.filter((t) => !t.completed);
    return {
      taskCount: sel.length,
      unfinishedCount: active.length,
      unfinishedWeight: active.reduce((sum, t) => sum + (t.weight || 0), 0),
    };
  };
  return Object.values(snapshot.categories || {}).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    ...agg((t) => t.categoryId === c.id),
    subcategories: (c.subcategories || []).map((s) => ({
      id: s.id,
      name: s.name,
      ...agg((t) => t.subcategoryId === s.id),
    })),
  }));
}

function listTasks(snapshot, input) {
  const maps = categoryMaps(snapshot);
  const blocks = blockIndex(snapshot);
  const now = Date.now();
  let tasks = Object.values(snapshot.tasks || {});

  const f = input || {};

  // Single-task detail: `taskId` short-circuits filters and returns the full task
  // (notes + dependencies). Keeps one versatile read tool instead of a separate get.
  if (f.taskId) {
    const t = (snapshot.tasks || {})[f.taskId];
    if (!t) throw new Error('Task not found');
    return { task: { ...projectTask(t, maps, blocks), notes: t.notes || null, dependsOn: t.dependsOn || [] } };
  }

  // category / subcategory (by id or name)
  let catId = f.categoryId || null;
  if (!catId && f.categoryName) catId = maps.nameToId[String(f.categoryName).toLowerCase()] || '__none__';
  if (catId) tasks = tasks.filter((t) => t.categoryId === catId);

  if (f.subcategoryId) tasks = tasks.filter((t) => t.subcategoryId === f.subcategoryId);
  else if (f.subcategoryName) {
    const sn = String(f.subcategoryName).toLowerCase();
    const subIds = Object.entries(maps.subById).filter(([, v]) => (v.name || '').toLowerCase() === sn).map(([id]) => id);
    tasks = tasks.filter((t) => subIds.includes(t.subcategoryId));
  }

  // status
  if (f.status === 'active') tasks = tasks.filter((t) => !t.completed);
  else if (f.status === 'completed') tasks = tasks.filter((t) => t.completed);

  // created window
  const createdAfter = parseWhen(f.createdAfter);
  const createdBefore = parseWhen(f.createdBefore);
  if (createdAfter != null) tasks = tasks.filter((t) => (t.createdAt || 0) >= createdAfter);
  if (createdBefore != null) tasks = tasks.filter((t) => (t.createdAt || 0) <= createdBefore);

  // due filters
  if (typeof f.dueWithinDays === 'number') {
    const end = now + f.dueWithinDays * DAY_MS;
    tasks = tasks.filter((t) => t.dueDate && t.dueDate >= now && t.dueDate <= end);
  }
  const dueBefore = parseWhen(f.dueBefore);
  if (dueBefore != null) tasks = tasks.filter((t) => t.dueDate && t.dueDate <= dueBefore);
  if (f.overdue) tasks = tasks.filter((t) => t.dueDate && t.dueDate < now && !t.completed);

  // block assignment
  if (f.assignedToBlockId) {
    const b = (snapshot.timeBlocks || {})[f.assignedToBlockId];
    const ids = new Set(b ? b.taskIds || [] : []);
    tasks = tasks.filter((t) => ids.has(t.id));
  }
  if (f.unassigned) tasks = tasks.filter((t) => !(blocks[t.id] && blocks[t.id].length));

  // free-text
  if (f.query) {
    const q = String(f.query).toLowerCase();
    tasks = tasks.filter((t) => (t.title || '').toLowerCase().includes(q) || (t.notes || '').toLowerCase().includes(q));
  }

  const total = tasks.length;
  const limit = Math.min(typeof f.limit === 'number' ? f.limit : 50, 200);
  const projected = tasks.slice(0, limit).map((t) => projectTask(t, maps, blocks));
  return { total, returned: projected.length, truncated: total > projected.length, tasks: projected };
}

function listTimeBlocks(snapshot) {
  const tasks = snapshot.tasks || {};
  return Object.values(snapshot.timeBlocks || {}).map((b) => {
    const ids = b.taskIds || [];
    const done = ids.filter((id) => tasks[id] && tasks[id].completed).length;
    return {
      id: b.id,
      name: b.name,
      startDate: toISO(b.startDate),
      endDate: toISO(b.endDate),
      taskCount: ids.length,
      completed: done,
    };
  });
}

function resolveChainLink(snapshot, link) {
  if (link.type === 'ct') {
    const ct = (snapshot.chainTasks || {})[link.taskId];
    return { kind: 'step', title: ct ? ct.title : '(missing)', completed: ct ? !!ct.completed : false, durationMin: ct ? ct.actualDuration : undefined };
  }
  if (link.type === 'realtask') {
    const t = (snapshot.tasks || {})[link.taskId];
    return { kind: 'task', title: t ? t.title : (link.placeholder || '(unfilled)'), completed: t ? !!t.completed : false };
  }
  return { kind: link.type, title: '(subtask)' };
}

function chainSummary(snapshot, chain) {
  const links = chain.links || [];
  const groups = (chain.groups || []).map((g) => ({
    name: g.name, readonly: !!g.readonly,
    steps: (g.links || []).map((l) => resolveChainLink(snapshot, l)),
  }));
  return {
    date: chain.date,
    steps: links.map((l) => resolveChainLink(snapshot, l)),
    groups,
  };
}

// One versatile chain reader: pass `date` for a single day's full chain, or
// `from`/`to` (either optional) for a range of summaries.
function getTaskChains(snapshot, input) {
  const f = input || {};
  if (f.date) {
    const c = (snapshot.taskChains || {})[f.date];
    if (!c) return { date: f.date, exists: false, steps: [], groups: [] };
    return { exists: true, ...chainSummary(snapshot, c) };
  }
  const from = f.from ? Date.parse(f.from) : null;
  const to = f.to ? Date.parse(f.to) : null;
  return {
    chains: Object.values(snapshot.taskChains || {})
      .filter((c) => {
        const d = Date.parse(c.date);
        if (from != null && d < from) return false;
        if (to != null && d > to) return false;
        return true;
      })
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((c) => {
        const all = [...(c.links || []), ...((c.groups || []).flatMap((g) => g.links || []))];
        const resolved = all.map((l) => resolveChainLink(snapshot, l));
        return { date: c.date, stepCount: resolved.length, completed: resolved.filter((r) => r.completed).length };
      }),
  };
}

function listChainTemplates(snapshot) {
  return Object.values(snapshot.chainTemplates || {}).map((t) => ({
    id: t.id, name: t.name, stepCount: (t.links || []).length,
  }));
}

// Weekly schedule. slot 0 = 6:00 AM, 30-min slots.
function slotToTime(slot) {
  const mins = 6 * 60 + slot * 30;
  const h = Math.floor(mins / 60), m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function getWeekOverview(snapshot, input) {
  const blocks = snapshot.overviewBlocks || [];
  const weekDate = input && input.weekDate ? input.weekDate : null;
  const tasks = snapshot.tasks || {};
  const filtered = weekDate ? blocks.filter((b) => b.weekDate === weekDate) : blocks;
  return {
    weekDate: weekDate || '(all weeks)',
    blocks: filtered
      .sort((a, b) => a.dayIndex - b.dayIndex || a.startSlot - b.startSlot)
      .map((b) => ({
        id: b.id,
        day: DAYS[b.dayIndex] || `Day ${b.dayIndex}`,
        start: slotToTime(b.startSlot),
        end: slotToTime(b.endSlot),
        type: b.type,
        name: b.type === 'mt' && b.taskId && tasks[b.taskId] ? tasks[b.taskId].title : b.name,
        completed: !!b.completed,
        weekDate: b.weekDate,
      })),
  };
}

// App status / settings — lets Tether act as a guide (theme, companion, sync).
// Reads from snapshot.settings, which the client supplies.
function getAppStatus(snapshot) {
  const s = (snapshot && snapshot.settings) || {};
  const sync = s.sync || {};
  return {
    theme: s.theme === 'dark' ? 'dark' : 'light',
    synamonCompanionVisible: s.synamonEnabled !== false,
    sync: {
      // User-facing framing (the app presents the account as primary "Cloud Sync").
      cloudSyncEnabled: !!sync.accountSignedIn,
      dropboxBackupConnected: !!sync.dropboxConnected,
      lastSyncedAt: sync.lastSyncedAt || null,
      status: sync.status || 'idle',
    },
  };
}

// ── registry ─────────────────────────────────────────────────────────────────

const HANDLERS = {
  get_app_status: getAppStatus,
  list_categories: listCategories,
  list_tasks: listTasks,
  list_time_blocks: listTimeBlocks,
  get_task_chains: getTaskChains,
  list_chain_templates: listChainTemplates,
  get_week_overview: getWeekOverview,
};

function executeReadTool(snapshot, name, input) {
  const h = HANDLERS[name];
  if (!h) throw new Error(`Unknown tool: ${name}`);
  return h(snapshot, input || {});
}

// ── WRITE tools (phase 2) ─────────────────────────────────────────────────────
// These NEVER mutate. They validate the model's request and return a normalized
// "staged action" — a proposal the client renders for approval and only then
// applies through the Zustand store. The agent loop emits each as a
// `staged_action` SSE event and tells the model it was queued (not applied).

const crypto = require('crypto');
const newId = () => (crypto.randomUUID ? crypto.randomUUID() : 'sa-' + Math.random().toString(36).slice(2));

const WRITE_TOOLS = new Set([
  'propose_create_task', 'propose_update_task', 'propose_create_category',
  'propose_create_subcategory', 'propose_assign_to_block', 'propose_create_block',
  // Task Chains (daily plans).
  'propose_add_chain_steps', 'propose_add_tasks_to_chain', 'propose_complete_chain_step',
  'propose_apply_chain_template',
  // Weekview (weekly schedule).
  'propose_schedule_block',
  // Destructive — staged AND gated behind a typed confirmation on the client.
  'propose_delete_tasks', 'propose_delete_category',
  'propose_remove_chain_steps', 'propose_remove_schedule_blocks',
  // Immediate (reversible UI/preference) actions — applied without the approval gate.
  'set_theme', 'set_synamon_companion', 'switch_view', 'open_sync_settings',
]);

function reqStr(v, label) {
  if (typeof v !== 'string' || !v.trim()) throw new Error(`${label} is required`);
  return v.trim();
}

// Build a staged action {id, type, summary, payload}. Throws on invalid input.
function buildStagedAction(name, input) {
  const i = input || {};
  switch (name) {
    case 'propose_create_task': {
      const title = reqStr(i.title, 'title');
      const payload = {
        title,
        categoryName: i.categoryName ? String(i.categoryName) : undefined,
        subcategoryName: i.subcategoryName ? String(i.subcategoryName) : undefined,
        weight: typeof i.weight === 'number' ? Math.max(1, Math.min(10, Math.round(i.weight))) : undefined,
        notes: i.notes ? String(i.notes) : undefined,
        dueDate: i.dueDate ? String(i.dueDate) : undefined,
        blockName: i.blockName ? String(i.blockName) : undefined,
      };
      const bits = [payload.categoryName && `in ${payload.categoryName}`, payload.weight && `weight ${payload.weight}`, payload.dueDate && `due ${payload.dueDate}`, payload.blockName && `→ ${payload.blockName}`].filter(Boolean);
      return { id: newId(), type: 'create_task', summary: `Create task “${title}”${bits.length ? ' (' + bits.join(', ') + ')' : ''}`, payload };
    }
    case 'propose_update_task': {
      const taskId = reqStr(i.taskId, 'taskId');
      const payload = { taskId };
      const changes = [];
      if (i.title != null) { payload.title = String(i.title); changes.push(`title → “${payload.title}”`); }
      if (i.weight != null) { payload.weight = Math.max(1, Math.min(10, Math.round(Number(i.weight)))); changes.push(`weight → ${payload.weight}`); }
      if (i.notes != null) { payload.notes = String(i.notes); changes.push('notes'); }
      if (i.dueDate != null) { payload.dueDate = String(i.dueDate); changes.push(`due → ${payload.dueDate}`); }
      if (i.categoryName != null) { payload.categoryName = String(i.categoryName); changes.push(`category → ${payload.categoryName}`); }
      if (i.subcategoryName != null) { payload.subcategoryName = String(i.subcategoryName); changes.push(`subcategory → ${payload.subcategoryName}`); }
      if (i.completed != null) { payload.completed = !!i.completed; changes.push(payload.completed ? 'mark complete' : 'mark incomplete'); }
      if (changes.length === 0) throw new Error('No changes specified');
      return { id: newId(), type: 'update_task', summary: `Update task: ${changes.join(', ')}`, payload, refTaskId: taskId };
    }
    case 'propose_create_category': {
      const name2 = reqStr(i.name, 'name');
      const subs = Array.isArray(i.subcategories) ? i.subcategories.map(String).filter(Boolean) : [];
      return { id: newId(), type: 'create_category', summary: `Create category “${name2}”${subs.length ? ` with ${subs.length} subcategor${subs.length > 1 ? 'ies' : 'y'}` : ''}`, payload: { name: name2, subcategories: subs } };
    }
    case 'propose_create_subcategory': {
      const name2 = reqStr(i.name, 'name');
      const categoryName = reqStr(i.categoryName, 'categoryName');
      return { id: newId(), type: 'create_subcategory', summary: `Add subcategory “${name2}” to ${categoryName}`, payload: { categoryName, name: name2 } };
    }
    case 'propose_assign_to_block': {
      const taskId = reqStr(i.taskId, 'taskId');
      const blockName = reqStr(i.blockName, 'blockName');
      return { id: newId(), type: 'assign_to_block', summary: `Assign task to time block “${blockName}”`, payload: { taskId, blockName }, refTaskId: taskId };
    }
    case 'propose_create_block': {
      const name2 = reqStr(i.name, 'name');
      const startDate = reqStr(i.startDate, 'startDate');
      const endDate = reqStr(i.endDate, 'endDate');
      return { id: newId(), type: 'create_block', summary: `Create time block “${name2}” (${startDate} → ${endDate})`, payload: { name: name2, startDate, endDate } };
    }

    // ── Task Chains (daily plans) ──
    case 'propose_add_chain_steps': {
      const date = reqStr(i.date, 'date');
      const raw = Array.isArray(i.steps) ? i.steps : [];
      const steps = raw.map((s) => ({
        title: reqStr(s && s.title, 'step title'),
        notes: s && s.notes ? String(s.notes) : undefined,
        durationMinutes: s && typeof s.durationMinutes === 'number' ? Math.max(1, Math.round(s.durationMinutes)) : undefined,
      }));
      if (!steps.length) throw new Error('steps (a non-empty array) is required');
      const n = steps.length;
      return { id: newId(), type: 'add_chain_steps', summary: `Add ${n} step${n > 1 ? 's' : ''} to the ${date} chain: ${steps.map((s) => `“${s.title}”`).join(', ')}`, payload: { date, steps } };
    }
    case 'propose_add_tasks_to_chain': {
      const date = reqStr(i.date, 'date');
      const taskIds = Array.isArray(i.taskIds) ? i.taskIds.map(String).filter(Boolean) : [];
      if (!taskIds.length) throw new Error('taskIds (a non-empty array) is required');
      return { id: newId(), type: 'add_tasks_to_chain', summary: `Add ${taskIds.length} existing task${taskIds.length > 1 ? 's' : ''} to the ${date} chain`, payload: { date, taskIds } };
    }
    case 'propose_complete_chain_step': {
      const date = reqStr(i.date, 'date');
      const stepTitle = reqStr(i.stepTitle, 'stepTitle');
      return { id: newId(), type: 'complete_chain_step', summary: `Mark chain step “${stepTitle}” (${date}) complete`, payload: { date, stepTitle } };
    }
    case 'propose_apply_chain_template': {
      const templateName = reqStr(i.templateName, 'templateName');
      const date = reqStr(i.date, 'date');
      const mode = i.mode === 'append' ? 'append' : 'load';
      return { id: newId(), type: 'apply_chain_template', summary: `${mode === 'append' ? 'Append' : 'Load'} template “${templateName}” ${mode === 'append' ? 'onto' : 'as'} the ${date} chain`, payload: { templateName, date, mode } };
    }

    // ── Weekview (weekly schedule) ──
    case 'propose_schedule_block': {
      const day = reqStr(i.day, 'day');
      const startTime = reqStr(i.startTime, 'startTime');
      const endTime = reqStr(i.endTime, 'endTime');
      const name = i.taskTitle ? String(i.taskTitle) : reqStr(i.name, 'name');
      const payload = { day, startTime, endTime, name, taskTitle: i.taskTitle ? String(i.taskTitle) : undefined, weekDate: i.weekDate ? String(i.weekDate) : undefined };
      const wk = payload.weekDate ? ` (week of ${payload.weekDate})` : '';
      return { id: newId(), type: 'schedule_block', summary: `Schedule “${name}” on ${day} ${startTime}–${endTime}${wk}`, payload };
    }

    // ── Destructive (typed-confirmation gated on the client) ──
    case 'propose_remove_chain_steps': {
      const date = reqStr(i.date, 'date');
      const titles = Array.isArray(i.stepTitles) ? i.stepTitles.map(String).filter(Boolean) : [];
      if (!titles.length) throw new Error('stepTitles (a non-empty array) is required');
      const n = titles.length;
      return { id: newId(), type: 'remove_chain_steps', destructive: true, summary: `Remove ${n} step${n > 1 ? 's' : ''} from the ${date} chain`, payload: { date, stepTitles: titles } };
    }
    case 'propose_remove_schedule_blocks': {
      const blocks = Array.isArray(i.blocks) ? i.blocks : [];
      const norm = blocks.map((b) => ({ day: reqStr(b && b.day, 'day'), startTime: reqStr(b && b.startTime, 'startTime'), weekDate: b && b.weekDate ? String(b.weekDate) : undefined }));
      if (!norm.length) throw new Error('blocks (a non-empty array) is required');
      const n = norm.length;
      return { id: newId(), type: 'remove_schedule_blocks', destructive: true, summary: `Remove ${n} schedule block${n > 1 ? 's' : ''}`, payload: { blocks: norm } };
    }
    case 'propose_delete_tasks': {
      const ids = Array.isArray(i.taskIds) ? i.taskIds.map(String).filter(Boolean) : [];
      if (!ids.length) throw new Error('taskIds (a non-empty array) is required');
      const n = ids.length;
      return { id: newId(), type: 'delete_tasks', destructive: true, summary: `Delete ${n} task${n > 1 ? 's' : ''}`, payload: { taskIds: ids } };
    }
    case 'propose_delete_category': {
      const categoryName = reqStr(i.categoryName, 'categoryName');
      return { id: newId(), type: 'delete_category', destructive: true, summary: `Delete category “${categoryName}” and all its tasks`, payload: { categoryName } };
    }

    // ── Immediate (reversible) settings & navigation ──
    case 'set_theme': {
      const theme = i.theme === 'dark' ? 'dark' : 'light';
      return { id: newId(), type: 'set_theme', immediate: true, summary: `Switched to ${theme} theme`, payload: { theme } };
    }
    case 'set_synamon_companion': {
      const visible = !!i.visible;
      return { id: newId(), type: 'set_synamon', immediate: true, summary: visible ? 'Showed the Synamon companion' : 'Hid the Synamon companion', payload: { visible } };
    }
    case 'switch_view': {
      const view = String(i.view || '');
      const labels = { treemap: 'Treemap', taskchain: 'Task Chain', overview: 'Weekview', cofocus: 'Co-Focus' };
      if (!labels[view]) throw new Error('view must be treemap | taskchain | overview | cofocus');
      return { id: newId(), type: 'switch_view', immediate: true, summary: `Opened the ${labels[view]} view`, payload: { view } };
    }
    case 'open_sync_settings': {
      return { id: newId(), type: 'open_sync_settings', immediate: true, summary: 'Opened Cloud Sync settings', payload: {} };
    }
    default:
      throw new Error(`Unknown write tool: ${name}`);
  }
}

const writeToolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'propose_create_task',
      description: 'PROPOSE creating a task (staged for the user to approve — not applied immediately). Reference category/subcategory/block by NAME.',
      parameters: {
        type: 'object',
        properties: {
          title: { type: 'string' },
          categoryName: { type: 'string', description: 'Existing or newly-proposed category name.' },
          subcategoryName: { type: 'string' },
          weight: { type: 'number', description: 'Effort 1–10 (default 1).' },
          notes: { type: 'string' },
          dueDate: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
          blockName: { type: 'string', description: 'Optionally also assign to this time block.' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_update_task',
      description: 'PROPOSE updating an existing task (staged). Use a real taskId from a read tool. Only include fields to change.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string' },
          title: { type: 'string' },
          weight: { type: 'number' },
          notes: { type: 'string' },
          dueDate: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
          categoryName: { type: 'string' },
          subcategoryName: { type: 'string' },
          completed: { type: 'boolean' },
        },
        required: ['taskId'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_category',
      description: 'PROPOSE creating a category (staged), optionally with subcategories.',
      parameters: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          subcategories: { type: 'array', items: { type: 'string' } },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_subcategory',
      description: 'PROPOSE adding a subcategory to a category (staged).',
      parameters: { type: 'object', properties: { categoryName: { type: 'string' }, name: { type: 'string' } }, required: ['categoryName', 'name'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_assign_to_block',
      description: 'PROPOSE assigning an existing task to a time block (staged). Use a real taskId.',
      parameters: { type: 'object', properties: { taskId: { type: 'string' }, blockName: { type: 'string' } }, required: ['taskId', 'blockName'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_create_block',
      description: 'PROPOSE creating a time block (staged). Dates are ISO YYYY-MM-DD.',
      parameters: { type: 'object', properties: { name: { type: 'string' }, startDate: { type: 'string' }, endDate: { type: 'string' } }, required: ['name', 'startDate', 'endDate'] },
    },
  },
  // ── Task Chains. NOTE: you must call get_task_chains for the target date
  //    before editing that day's chain (read-before-edit). ──
  {
    type: 'function',
    function: {
      name: 'propose_add_chain_steps',
      description: "PROPOSE adding one or more steps to a day's Task Chain (staged). Read get_task_chains for that date first. Batch all steps for a day in one call.",
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: 'ISO date YYYY-MM-DD.' },
          steps: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                notes: { type: 'string' },
                durationMinutes: { type: 'number' },
              },
              required: ['title'],
            },
          },
        },
        required: ['date', 'steps'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_add_tasks_to_chain',
      description: "PROPOSE adding existing tasks (by taskId) into a day's Task Chain (staged). Read get_task_chains for that date first.",
      parameters: { type: 'object', properties: { date: { type: 'string' }, taskIds: { type: 'array', items: { type: 'string' } } }, required: ['date', 'taskIds'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_complete_chain_step',
      description: "PROPOSE marking a chain step complete, identified by its title within that day's chain (staged). Read get_task_chains for that date first.",
      parameters: { type: 'object', properties: { date: { type: 'string' }, stepTitle: { type: 'string' } }, required: ['date', 'stepTitle'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_apply_chain_template',
      description: "PROPOSE applying a saved chain template to a date (staged). mode 'load' replaces the day's chain; 'append' adds to it. Read get_task_chains for that date and list_chain_templates first.",
      parameters: { type: 'object', properties: { templateName: { type: 'string' }, date: { type: 'string' }, mode: { type: 'string', enum: ['load', 'append'] } }, required: ['templateName', 'date'] },
    },
  },
  // ── Weekview. NOTE: call get_week_overview before scheduling/removing blocks. ──
  {
    type: 'function',
    function: {
      name: 'propose_schedule_block',
      description: 'PROPOSE adding a block to the weekly schedule (staged). Times are natural ("09:00", "14:30"); day is Monday–Sunday. Optionally bind to an existing task by taskTitle. Read get_week_overview first. Schedule is 6:00 AM–11:30 PM in 30-min steps.',
      parameters: {
        type: 'object',
        properties: {
          day: { type: 'string', description: 'Monday … Sunday.' },
          startTime: { type: 'string', description: 'e.g. "09:00".' },
          endTime: { type: 'string', description: 'e.g. "10:30".' },
          name: { type: 'string', description: 'Block label (omit if taskTitle given).' },
          taskTitle: { type: 'string', description: 'Bind to this existing task instead of a plain label.' },
          weekDate: { type: 'string', description: "Monday of the target week (YYYY-MM-DD). Omit for this week." },
        },
        required: ['day', 'startTime', 'endTime'],
      },
    },
  },
  // Destructive — staged, then gated behind a typed deletion confirmation client-side.
  {
    type: 'function',
    function: {
      name: 'propose_remove_chain_steps',
      description: "PROPOSE removing steps from a day's chain by their titles (staged → typed confirmation). Read get_task_chains for that date first.",
      parameters: { type: 'object', properties: { date: { type: 'string' }, stepTitles: { type: 'array', items: { type: 'string' } } }, required: ['date', 'stepTitles'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_remove_schedule_blocks',
      description: 'PROPOSE removing schedule blocks, each identified by day + startTime (+ optional weekDate) (staged → typed confirmation). Read get_week_overview first.',
      parameters: {
        type: 'object',
        properties: {
          blocks: {
            type: 'array',
            items: { type: 'object', properties: { day: { type: 'string' }, startTime: { type: 'string' }, weekDate: { type: 'string' } }, required: ['day', 'startTime'] },
          },
        },
        required: ['blocks'],
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_tasks',
      description: 'PROPOSE deleting one or more tasks. Staged — the user must confirm by typing a deletion phrase before anything is removed. Use real taskIds from a read. Be conservative; only when clearly asked.',
      parameters: { type: 'object', properties: { taskIds: { type: 'array', items: { type: 'string' } } }, required: ['taskIds'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'propose_delete_category',
      description: 'PROPOSE deleting a category AND every task inside it (cascade). Staged — the user must confirm by typing a deletion phrase. Use sparingly; explain the consequence.',
      parameters: { type: 'object', properties: { categoryName: { type: 'string' } }, required: ['categoryName'] },
    },
  },
  // Immediate, reversible UI/preference actions (apply without the approval gate).
  {
    type: 'function',
    function: {
      name: 'set_theme',
      description: 'Switch the app theme. Applies immediately (reversible).',
      parameters: { type: 'object', properties: { theme: { type: 'string', enum: ['light', 'dark'] } }, required: ['theme'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'set_synamon_companion',
      description: 'Show or hide the Synamon companion across the app. Applies immediately (reversible). Does not delete companion data.',
      parameters: { type: 'object', properties: { visible: { type: 'boolean' } }, required: ['visible'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'switch_view',
      description: 'Navigate the user to a view: treemap (tasks), taskchain, overview (Weekview), or cofocus. Applies immediately.',
      parameters: { type: 'object', properties: { view: { type: 'string', enum: ['treemap', 'taskchain', 'overview', 'cofocus'] } }, required: ['view'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'open_sync_settings',
      description: 'Open the Cloud Sync settings panel for the user (e.g. to connect cloud sync or a Dropbox backup). You cannot enter their credentials — this just guides them there.',
      parameters: { type: 'object', properties: {} },
    },
  },
];

// OpenAI tool-schema definitions for the read tools.
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'get_app_status',
      description: "Get the user's app settings & sync status: theme (light/dark), whether the Synamon companion is shown, and cloud-sync/Dropbox-backup state with last-synced time. Use this to answer 'is my data backed up?' and to guide setup.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: "List the user's categories and subcategories, each with taskCount, unfinishedCount, and unfinishedWeight (summed effort of incomplete tasks). Use unfinishedWeight/unfinishedCount to answer 'which category is heaviest / has the most to do' in ONE call — do not list_tasks per category for that.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'Read tasks. Pass taskId for one task in full (notes + dependencies), or any combination of filters for a list of compact projections. Prefer filters over listing everything.',
      parameters: {
        type: 'object',
        properties: {
          taskId: { type: 'string', description: 'Return just this task, in full. Ignores other filters.' },
          categoryName: { type: 'string', description: 'Filter by category name.' },
          subcategoryName: { type: 'string', description: 'Filter by subcategory name.' },
          status: { type: 'string', enum: ['active', 'completed', 'all'], description: 'Default all.' },
          createdAfter: { type: 'string', description: 'ISO date (YYYY-MM-DD); only tasks created on/after.' },
          createdBefore: { type: 'string', description: 'ISO date; only tasks created on/before.' },
          dueWithinDays: { type: 'number', description: 'Only tasks due within N days from now (e.g. 7).' },
          dueBefore: { type: 'string', description: 'ISO date; tasks due on/before.' },
          overdue: { type: 'boolean', description: 'Only incomplete tasks past their due date.' },
          assignedToBlockId: { type: 'string', description: 'Only tasks in this time block.' },
          unassigned: { type: 'boolean', description: 'Only tasks not in any time block.' },
          query: { type: 'string', description: 'Case-insensitive substring on title/notes.' },
          limit: { type: 'number', description: 'Max tasks to return (default 50, cap 200).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_time_blocks',
      description: 'List time blocks (date-ranged task buckets) with counts. For the tasks inside one, call list_tasks with assignedToBlockId.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_chains',
      description: "Read daily Task Chains (ordered per-day plans). Pass date for one day's full chain (steps + groups), or from/to (either optional) for a range of summaries.",
      parameters: {
        type: 'object',
        properties: {
          date: { type: 'string', description: "ISO date YYYY-MM-DD — return this day's full chain." },
          from: { type: 'string', description: 'ISO date inclusive (range mode).' },
          to: { type: 'string', description: 'ISO date inclusive (range mode).' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_chain_templates',
      description: 'List reusable Task Chain templates.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_week_overview',
      description: 'Get the weekly schedule ("Weekview") blocks, resolved to days and times. Optional weekDate (Monday, YYYY-MM-DD).',
      parameters: { type: 'object', properties: { weekDate: { type: 'string' } } },
    },
  },
];

// ── Read-before-edit gate (Claude-Code style) ────────────────────────────────
// Chains and Weekview are addressed by date / title / day+time — values a model
// can hallucinate — so a write to them must be preceded by the matching READ in
// the same turn. (Task/category writes already need a real id/name from a read,
// so they're implicitly gated and not listed here.)
//
// `seen` is accumulated by the agent loop from read-tool calls:
//   { chainDates:Set, chainAll:bool, week:bool }
function recordRead(seen, name, input) {
  if (name === 'get_task_chains') {
    if (input && input.date) seen.chainDates.add(input.date);
    else seen.chainAll = true; // range/all read surfaced the list of chains
  } else if (name === 'get_week_overview') {
    seen.week = true;
  }
}

// Returns an error string if a write isn't allowed yet (read first), else null.
function requireReadBeforeWrite(seen, name, input) {
  const chainWrites = new Set([
    'propose_add_chain_steps', 'propose_add_tasks_to_chain', 'propose_complete_chain_step',
    'propose_apply_chain_template', 'propose_remove_chain_steps',
  ]);
  if (chainWrites.has(name)) {
    const date = input && input.date;
    if (date && !seen.chainDates.has(date)) {
      return `Read first: call get_task_chains with date "${date}" before editing that day's chain.`;
    }
  }
  if (name === 'propose_schedule_block' || name === 'propose_remove_schedule_blocks') {
    if (!seen.week) {
      return 'Read first: call get_week_overview before changing the weekly schedule.';
    }
  }
  return null;
}

module.exports = {
  toolDefinitions, executeReadTool, writeToolDefinitions, buildStagedAction, WRITE_TOOLS,
  recordRead, requireReadBeforeWrite,
};
