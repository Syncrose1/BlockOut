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
  return Object.values(snapshot.categories || {}).map((c) => ({
    id: c.id,
    name: c.name,
    color: c.color,
    taskCount: tasks.filter((t) => t.categoryId === c.id).length,
    subcategories: (c.subcategories || []).map((s) => ({
      id: s.id,
      name: s.name,
      taskCount: tasks.filter((t) => t.subcategoryId === s.id).length,
    })),
  }));
}

function listTasks(snapshot, input) {
  const maps = categoryMaps(snapshot);
  const blocks = blockIndex(snapshot);
  const now = Date.now();
  let tasks = Object.values(snapshot.tasks || {});

  const f = input || {};

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

function getTask(snapshot, input) {
  const t = (snapshot.tasks || {})[input.taskId];
  if (!t) throw new Error('Task not found');
  const maps = categoryMaps(snapshot);
  const blocks = blockIndex(snapshot);
  return { ...projectTask(t, maps, blocks), notes: t.notes || null, dependsOn: t.dependsOn || [] };
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

function getBlock(snapshot, input) {
  const b = (snapshot.timeBlocks || {})[input.blockId];
  if (!b) throw new Error('Block not found');
  const maps = categoryMaps(snapshot);
  const blocks = blockIndex(snapshot);
  const tasks = (b.taskIds || []).map((id) => (snapshot.tasks || {})[id]).filter(Boolean).map((t) => projectTask(t, maps, blocks));
  return { id: b.id, name: b.name, startDate: toISO(b.startDate), endDate: toISO(b.endDate), tasks };
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

function listTaskChains(snapshot, input) {
  const f = input || {};
  const from = f.from ? Date.parse(f.from) : null;
  const to = f.to ? Date.parse(f.to) : null;
  return Object.values(snapshot.taskChains || {})
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
    });
}

function getTaskChain(snapshot, input) {
  const c = (snapshot.taskChains || {})[input.date];
  if (!c) return { date: input.date, exists: false, steps: [], groups: [] };
  return { exists: true, ...chainSummary(snapshot, c) };
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

// ── registry ─────────────────────────────────────────────────────────────────

const HANDLERS = {
  list_categories: listCategories,
  list_tasks: listTasks,
  get_task: getTask,
  list_time_blocks: listTimeBlocks,
  get_block: getBlock,
  list_task_chains: listTaskChains,
  get_task_chain: getTaskChain,
  list_chain_templates: listChainTemplates,
  get_week_overview: getWeekOverview,
};

function executeReadTool(snapshot, name, input) {
  const h = HANDLERS[name];
  if (!h) throw new Error(`Unknown tool: ${name}`);
  return h(snapshot, input || {});
}

// OpenAI tool-schema definitions for the read tools.
const toolDefinitions = [
  {
    type: 'function',
    function: {
      name: 'list_categories',
      description: "List the user's categories and subcategories with task counts.",
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_tasks',
      description: 'List tasks with optional filters. Returns compact projections; prefer filters over listing everything.',
      parameters: {
        type: 'object',
        properties: {
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
      name: 'get_task',
      description: 'Get one task in full (incl. notes and dependencies).',
      parameters: { type: 'object', properties: { taskId: { type: 'string' } }, required: ['taskId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_time_blocks',
      description: 'List time blocks (date-ranged task buckets) with counts.',
      parameters: { type: 'object', properties: {} },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_block',
      description: 'Get one time block and the tasks in it.',
      parameters: { type: 'object', properties: { blockId: { type: 'string' } }, required: ['blockId'] },
    },
  },
  {
    type: 'function',
    function: {
      name: 'list_task_chains',
      description: 'List daily Task Chains (ordered per-day plans) with step counts. Optional date range.',
      parameters: {
        type: 'object',
        properties: {
          from: { type: 'string', description: 'ISO date inclusive.' },
          to: { type: 'string', description: 'ISO date inclusive.' },
        },
      },
    },
  },
  {
    type: 'function',
    function: {
      name: 'get_task_chain',
      description: 'Get a single day\'s Task Chain (its ordered steps and groups).',
      parameters: { type: 'object', properties: { date: { type: 'string', description: 'ISO date YYYY-MM-DD.' } }, required: ['date'] },
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

module.exports = { toolDefinitions, executeReadTool };
