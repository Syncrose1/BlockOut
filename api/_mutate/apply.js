// Cross-app MUTATION module — lets a sibling Syncratic app change this user's BlockOut data.
//
// **External integration — added for Finalist, not for BlockOut itself.** Finalist embeds BlockOut's
// calendar (see its /timetable) and needs to complete a chain step or a task without making the user
// leave. It cannot do that itself: BlockOut's working store is client-side Zustand, and its R2 blob is a
// dumb overwrite with no validation, so a foreign writer reconstructing the snapshot would have to
// duplicate every invariant in persistence.ts and would drift from them.
//
// So the write lives here, with the app that owns the shape. Same principle as api/tether-binder.js —
// "Binder owns its own writes" — pointed the other way. Self-contained and droppable, like
// api/_syncra/tunnel.js: it depends only on @supabase/supabase-js, @aws-sdk/client-s3 and uuid, all
// already present.
//
// ★ NOTHING HERE IS DOMAIN-SPECIFIC. The operations are BlockOut's own vocabulary — tasks, chain steps,
// schedule blocks. Finalist's medical meaning stays in Finalist. BlockOut remains a general-purpose
// planner and this endpoint would serve any caller.
//
// ★ THE FOUR INVARIANTS THIS EXISTS TO PROTECT
//
//   1. UNKNOWN KEYS SURVIVE. The snapshot holds synamon, cofocus, pomodoro and streak state a caller has
//      no business understanding. Every write starts from the stored blob and edits in place, so a key
//      this module has never heard of is carried through untouched. Rebuilding a snapshot from known
//      fields would silently delete a companion collection.
//   2. AN EMPTY SNAPSHOT NEVER WINS. persistence.ts guards this on the client (`isEmptySnapshot` in
//      `pickFresher`); the same guard is applied here, so a bug upstream cannot blank the account.
//   3. lastModified AND version MOVE FORWARD. R2 is a first-class load source, so the client compares
//      `lastModified` to decide freshness. A write that did not advance it would be ignored; one that
//      did not advance `version` would confuse R2 conflict detection.
//   4. LOST UPDATES ARE DETECTED, NOT RISKED. A caller may pass the `lastModified` it last saw; if the
//      stored blob has moved on, the write is refused with a conflict rather than clobbering whatever
//      the user did in BlockOut in the meantime.

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');
const { v4: uuid } = require('uuid');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || '';

let s3 = null;
function getS3() {
  if (!s3) {
    s3 = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: R2_ACCESS_KEY_ID, secretAccessKey: R2_SECRET_ACCESS_KEY },
    });
  }
  return s3;
}

let supabase = null;
function getSupabase() {
  if (!supabase) {
    const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
    if (SUPABASE_URL && key) supabase = createClient(SUPABASE_URL, key);
  }
  return supabase;
}

function isConfigured() {
  return !!(R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY && R2_BUCKET_NAME && getSupabase());
}

async function readSnapshot(userId) {
  const client = getS3();
  const res = await client.send(new GetObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: `users/${userId}/blockout-data.json`,
  }));
  const text = await res.Body.transformToString();
  return JSON.parse(text);
}

async function writeSnapshot(userId, data) {
  const client = getS3();
  await client.send(new PutObjectCommand({
    Bucket: R2_BUCKET_NAME,
    Key: `users/${userId}/blockout-data.json`,
    Body: JSON.stringify(data),
    ContentType: 'application/json',
  }));
}

// ── invariant 2: never write a blank account ────────────────────────────────
// Mirrors isEmptySnapshot in src/utils/persistence.ts. Kept as its own copy on purpose: this file is
// meant to be droppable, and importing from src/ would tie a serverless function to the Vite build.
function isEmptySnapshot(x) {
  if (!x || typeof x !== 'object') return true;
  const tasks = x.tasks && typeof x.tasks === 'object' ? Object.keys(x.tasks).length : 0;
  const cats = x.categories && typeof x.categories === 'object' ? Object.keys(x.categories).length : 0;
  return tasks === 0 && cats === 0;
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');
const clampWeight = (v) => {
  const n = Number(v);
  if (!Number.isFinite(n)) return 5;
  return Math.max(1, Math.min(10, Math.round(n)));
};
const posInt = (v) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : undefined;
};
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Find a category by name, case-insensitively. Names are the caller's handle; ids are ours. */
function findCategory(snap, name) {
  const want = name.toLowerCase();
  return Object.values(snap.categories || {}).find((c) => String(c.name || '').toLowerCase() === want) || null;
}

function ensureCategory(snap, name) {
  const existing = findCategory(snap, name);
  if (existing) return existing.id;
  const id = uuid();
  snap.categories = snap.categories || {};
  // BlockOut assigns colours itself in the UI; a null-ish colour here is filled in on next edit rather
  // than guessing at its palette.
  snap.categories[id] = { id, name, color: '#7c8b9a', subcategories: [] };
  return id;
}

function ensureSubcategory(snap, categoryId, name) {
  if (!name) return undefined;
  const cat = (snap.categories || {})[categoryId];
  if (!cat) return undefined;
  cat.subcategories = cat.subcategories || [];
  const want = name.toLowerCase();
  const found = cat.subcategories.find((s) => String(s.name || '').toLowerCase() === want);
  if (found) return found.id;
  const id = uuid();
  cat.subcategories.push({ id, name, categoryId });
  return id;
}

/** Locate a chain link by id, across the chain's own links and every group. */
function findLink(chain, linkId) {
  const inRoot = (chain.links || []).findIndex((l) => l && l.id === linkId);
  if (inRoot >= 0) return { list: chain.links, index: inRoot };
  for (const g of chain.groups || []) {
    const i = (g.links || []).findIndex((l) => l && l.id === linkId);
    if (i >= 0) return { list: g.links, index: i };
  }
  return null;
}

// ── the operations ──────────────────────────────────────────────────────────
//
// Each returns a short human summary, which the caller shows back to the user. An unknown op throws, so
// a typo in a caller becomes a 400 rather than a silent no-op.

const OPS = {
  create_task(snap, p) {
    const title = str(p.title);
    if (!title) throw new Error('title is required');
    const categoryId = ensureCategory(snap, str(p.categoryName) || 'General');
    const subcategoryId = ensureSubcategory(snap, categoryId, str(p.subcategoryName));
    const id = uuid();
    snap.tasks = snap.tasks || {};
    snap.tasks[id] = {
      id, title, categoryId,
      ...(subcategoryId ? { subcategoryId } : {}),
      completed: false,
      weight: clampWeight(p.weight),
      ...(str(p.notes) ? { notes: str(p.notes) } : {}),
      ...(posInt(p.dueDate) !== undefined ? { dueDate: posInt(p.dueDate) } : {}),
      createdAt: Date.now(),
    };
    return { summary: `Created task “${title}”`, taskId: id };
  },

  update_task(snap, p) {
    const id = str(p.taskId);
    const task = (snap.tasks || {})[id];
    if (!task) throw new Error('unknown taskId');
    if (str(p.title)) task.title = str(p.title);
    if (p.weight !== undefined) task.weight = clampWeight(p.weight);
    if (p.notes !== undefined) task.notes = str(p.notes) || undefined;
    if (p.dueDate !== undefined) task.dueDate = posInt(p.dueDate);
    return { summary: `Updated “${task.title}”` };
  },

  set_task_completed(snap, p) {
    const id = str(p.taskId);
    const task = (snap.tasks || {})[id];
    if (!task) throw new Error('unknown taskId');
    const done = p.completed !== false;
    task.completed = done;
    // completedAt is cleared on un-completing, or BlockOut's streak maths counts a day it should not.
    if (done) {
      task.completedAt = Date.now();
      if (posInt(p.actualDuration) !== undefined) task.actualDuration = posInt(p.actualDuration);
    } else {
      delete task.completedAt;
    }
    return { summary: `${done ? 'Completed' : 'Reopened'} “${task.title}”` };
  },

  delete_task(snap, p) {
    const id = str(p.taskId);
    const task = (snap.tasks || {})[id];
    if (!task) throw new Error('unknown taskId');
    const title = task.title;
    delete snap.tasks[id];

    // ★ A DELETED TASK MUST NOT LEAVE DANGLING REFERENCES. It can be referenced from time blocks,
    // schedule blocks and chain links; leaving those behind renders empty rows in BlockOut's own UI.
    for (const b of Object.values(snap.timeBlocks || {})) {
      if (Array.isArray(b.taskIds)) b.taskIds = b.taskIds.filter((t) => t !== id);
    }
    snap.overviewBlocks = (snap.overviewBlocks || []).filter((b) => b && b.taskId !== id);
    for (const chain of Object.values(snap.taskChains || {})) {
      const drop = (links) => (links || []).filter((l) => !(l && l.type === 'realtask' && l.taskId === id));
      chain.links = drop(chain.links);
      for (const g of chain.groups || []) g.links = drop(g.links);
    }
    return { summary: `Deleted “${title}”` };
  },

  add_chain_step(snap, p) {
    const date = str(p.date);
    if (!ISO_DATE.test(date)) throw new Error('date must be YYYY-MM-DD');
    const title = str(p.title);
    if (!title) throw new Error('title is required');

    const ctId = uuid();
    snap.chainTasks = snap.chainTasks || {};
    snap.chainTasks[ctId] = {
      id: ctId, title, type: 'ct', completed: false,
      ...(str(p.notes) ? { notes: str(p.notes) } : {}),
    };

    snap.taskChains = snap.taskChains || {};
    const chain = snap.taskChains[date] || { id: uuid(), date, links: [], createdAt: Date.now() };
    chain.links = chain.links || [];
    chain.links.push({ id: uuid(), type: 'ct', taskId: ctId });
    snap.taskChains[date] = chain;
    return { summary: `Added “${title}” to the ${date} chain`, chainTaskId: ctId };
  },

  add_task_to_chain(snap, p) {
    const date = str(p.date);
    if (!ISO_DATE.test(date)) throw new Error('date must be YYYY-MM-DD');
    const taskId = str(p.taskId);
    const task = (snap.tasks || {})[taskId];
    if (!task) throw new Error('unknown taskId');

    snap.taskChains = snap.taskChains || {};
    const chain = snap.taskChains[date] || { id: uuid(), date, links: [], createdAt: Date.now() };
    chain.links = chain.links || [];
    if (findLinkByTask(chain, taskId)) return { summary: `“${task.title}” is already in the ${date} chain` };
    chain.links.push({ id: uuid(), type: 'realtask', taskId });
    snap.taskChains[date] = chain;
    return { summary: `Added “${task.title}” to the ${date} chain` };
  },

  set_chain_step_completed(snap, p) {
    const date = str(p.date);
    const chain = (snap.taskChains || {})[date];
    if (!chain) throw new Error('no chain for that date');
    const at = findLink(chain, str(p.linkId));
    if (!at) throw new Error('unknown linkId');
    const link = at.list[at.index];
    const done = p.completed !== false;

    // A step is either a chain task or a pool task; completing it means completing whichever it is.
    const effective = link.type === 'subtask' ? (link.subType || 'ct') : link.type;
    const target = effective === 'realtask'
      ? (snap.tasks || {})[link.taskId]
      : (snap.chainTasks || {})[link.taskId];
    if (!target) throw new Error('step points at nothing');

    target.completed = done;
    if (done) {
      target.completedAt = Date.now();
      if (posInt(p.actualDuration) !== undefined) target.actualDuration = posInt(p.actualDuration);
    } else {
      delete target.completedAt;
    }
    return { summary: `${done ? 'Completed' : 'Reopened'} “${target.title}”` };
  },

  remove_chain_step(snap, p) {
    const date = str(p.date);
    const chain = (snap.taskChains || {})[date];
    if (!chain) throw new Error('no chain for that date');
    const at = findLink(chain, str(p.linkId));
    if (!at) throw new Error('unknown linkId');
    const [removed] = at.list.splice(at.index, 1);

    // Subtasks hang off their parent link; orphaning them would leave unreachable rows.
    const dropChildren = (links) => (links || []).filter((l) => !(l && l.parentId === removed.id));
    chain.links = dropChildren(chain.links);
    for (const g of chain.groups || []) g.links = dropChildren(g.links);

    // A chain task exists only for its step, so removing the step removes it. A pool task does not.
    if ((removed.type === 'ct' || removed.subType === 'ct') && removed.taskId && snap.chainTasks) {
      delete snap.chainTasks[removed.taskId];
    }
    return { summary: `Removed a step from the ${date} chain` };
  },

  reorder_chain(snap, p) {
    const date = str(p.date);
    const chain = (snap.taskChains || {})[date];
    if (!chain) throw new Error('no chain for that date');
    const wanted = Array.isArray(p.linkIds) ? p.linkIds.filter((x) => typeof x === 'string') : [];
    if (!wanted.length) throw new Error('linkIds is required');

    const current = chain.links || [];
    const byId = new Map(current.map((l) => [l.id, l]));
    const reordered = wanted.map((id) => byId.get(id)).filter(Boolean);
    // ★ A REORDER MUST NOT LOSE A STEP. Any link the caller did not mention keeps its place at the end
    // rather than disappearing, so a stale client list cannot silently delete a step.
    for (const l of current) if (!wanted.includes(l.id)) reordered.push(l);
    chain.links = reordered;
    return { summary: `Reordered the ${date} chain` };
  },

  apply_chain_template(snap, p) {
    const date = str(p.date);
    if (!ISO_DATE.test(date)) throw new Error('date must be YYYY-MM-DD');
    const name = str(p.templateName);
    const template = Object.values(snap.chainTemplates || {})
      .find((t) => String(t.name || '').toLowerCase() === name.toLowerCase());
    if (!template) throw new Error(`no template named “${name}”`);

    const mode = p.mode === 'append' ? 'append' : 'load';
    snap.taskChains = snap.taskChains || {};
    snap.chainTasks = snap.chainTasks || {};
    const chain = snap.taskChains[date] || { id: uuid(), date, links: [], createdAt: Date.now() };
    if (mode === 'load') chain.links = [];
    chain.links = chain.links || [];

    let added = 0;
    for (const entry of template.links || []) {
      const title = str(entry.ctTitle) || str(entry.realTaskPlaceholder);
      if (!title) continue;
      if (entry.type === 'realtask') {
        // A template's realtask slot is a PLACEHOLDER, not a task. Creating a pool task from it would
        // invent work the user never asked for, so it becomes a chain step carrying the placeholder text.
        const ctId = uuid();
        snap.chainTasks[ctId] = { id: ctId, title, type: 'ct', completed: false };
        chain.links.push({ id: uuid(), type: 'ct', taskId: ctId });
      } else {
        const ctId = uuid();
        snap.chainTasks[ctId] = { id: ctId, title, type: 'ct', completed: false };
        chain.links.push({ id: uuid(), type: 'ct', taskId: ctId });
      }
      added++;
    }
    snap.taskChains[date] = chain;
    return { summary: `${mode === 'append' ? 'Appended' : 'Loaded'} “${template.name}” onto the ${date} chain — ${added} steps` };
  },

  save_chain_template(snap, p) {
    const name = str(p.name);
    if (!name) throw new Error('name is required');
    const steps = Array.isArray(p.steps) ? p.steps.map((s) => str(s && s.title)).filter(Boolean) : [];
    if (!steps.length) throw new Error('steps is required');

    snap.chainTemplates = snap.chainTemplates || {};
    // Overwrite by name, so re-saving a template edits it rather than accumulating duplicates.
    const existing = Object.values(snap.chainTemplates)
      .find((t) => String(t.name || '').toLowerCase() === name.toLowerCase());
    const id = existing ? existing.id : uuid();
    snap.chainTemplates[id] = {
      id, name,
      links: steps.map((title) => ({ type: 'ct', ctTitle: title })),
      createdAt: existing ? existing.createdAt : Date.now(),
      updatedAt: Date.now(),
    };
    return { summary: `${existing ? 'Updated' : 'Saved'} template “${name}” — ${steps.length} steps`, templateId: id };
  },

  schedule_block(snap, p) {
    const weekDate = str(p.weekDate);
    if (!ISO_DATE.test(weekDate)) throw new Error('weekDate must be YYYY-MM-DD (the Monday)');
    const dayIndex = Number(p.dayIndex);
    if (!Number.isInteger(dayIndex) || dayIndex < 0 || dayIndex > 6) throw new Error('dayIndex must be 0–6');
    const startSlot = Number(p.startSlot);
    const endSlot = Number(p.endSlot);
    if (!Number.isInteger(startSlot) || !Number.isInteger(endSlot) || endSlot <= startSlot || startSlot < 0) {
      throw new Error('startSlot/endSlot must be whole slots with end after start');
    }
    const name = str(p.name);
    const taskId = str(p.taskId);
    if (taskId && !(snap.tasks || {})[taskId]) throw new Error('unknown taskId');
    if (!name && !taskId) throw new Error('name or taskId is required');

    const id = uuid();
    snap.overviewBlocks = snap.overviewBlocks || [];
    snap.overviewBlocks.push({
      id, dayIndex, startSlot, endSlot,
      type: taskId ? 'mt' : 'ct',
      name: name || (snap.tasks[taskId] || {}).title || 'Block',
      ...(taskId ? { taskId } : {}),
      ...(str(p.color) ? { color: str(p.color) } : {}),
      completed: false,
      weekDate,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { summary: `Scheduled “${name || 'block'}”`, blockId: id };
  },

  update_block(snap, p) {
    const id = str(p.blockId);
    const block = (snap.overviewBlocks || []).find((b) => b && b.id === id);
    if (!block) throw new Error('unknown blockId');
    if (str(p.name)) block.name = str(p.name);
    if (p.startSlot !== undefined || p.endSlot !== undefined) {
      const s = p.startSlot !== undefined ? Number(p.startSlot) : block.startSlot;
      const e = p.endSlot !== undefined ? Number(p.endSlot) : block.endSlot;
      if (!Number.isInteger(s) || !Number.isInteger(e) || e <= s || s < 0) throw new Error('invalid slots');
      block.startSlot = s; block.endSlot = e;
    }
    if (p.dayIndex !== undefined) {
      const d = Number(p.dayIndex);
      if (!Number.isInteger(d) || d < 0 || d > 6) throw new Error('dayIndex must be 0–6');
      block.dayIndex = d;
    }
    block.updatedAt = Date.now();
    return { summary: `Updated “${block.name}”` };
  },

  set_block_completed(snap, p) {
    const id = str(p.blockId);
    const block = (snap.overviewBlocks || []).find((b) => b && b.id === id);
    if (!block) throw new Error('unknown blockId');
    const done = p.completed !== false;
    block.completed = done;
    if (done) {
      block.completedAt = Date.now();
      if (posInt(p.actualDuration) !== undefined) block.actualDuration = posInt(p.actualDuration);
    } else {
      delete block.completedAt;
    }
    block.updatedAt = Date.now();

    // An 'mt' block IS a task on the calendar, so completing the block completes the task — otherwise
    // BlockOut's treemap and its week view would disagree about the same thing.
    if (block.type === 'mt' && block.taskId && (snap.tasks || {})[block.taskId]) {
      const task = snap.tasks[block.taskId];
      task.completed = done;
      if (done) task.completedAt = Date.now(); else delete task.completedAt;
    }
    return { summary: `${done ? 'Completed' : 'Reopened'} “${block.name}”` };
  },

  delete_block(snap, p) {
    const id = str(p.blockId);
    const before = (snap.overviewBlocks || []).length;
    snap.overviewBlocks = (snap.overviewBlocks || []).filter((b) => b && b.id !== id);
    if (snap.overviewBlocks.length === before) throw new Error('unknown blockId');
    return { summary: 'Removed the block' };
  },
};

function findLinkByTask(chain, taskId) {
  const hit = (links) => (links || []).some((l) => l && l.type === 'realtask' && l.taskId === taskId);
  return hit(chain.links) || (chain.groups || []).some((g) => hit(g.links));
}

const OP_NAMES = Object.keys(OPS);

/**
 * Apply a batch of operations to the user's snapshot.
 *
 * Batched on purpose: a UI action is often two changes ("complete this step and record 25 minutes"), and
 * one read-modify-write is both faster and atomic where two would interleave with the user's own edits.
 *
 * `expectedLastModified`, when given, must match the stored blob or the write is refused — invariant 4.
 */
async function applyMutations({ userId, ops, expectedLastModified }) {
  if (!Array.isArray(ops) || !ops.length) {
    return { status: 400, body: { error: 'ops must be a non-empty array' } };
  }
  if (ops.length > 25) {
    return { status: 400, body: { error: 'too many operations in one request (max 25)' } };
  }

  let snap;
  try {
    snap = await readSnapshot(userId);
  } catch (err) {
    if (err && (err.name === 'NoSuchKey' || err.Code === 'NoSuchKey')) {
      // Nothing has ever been synced. Creating a snapshot from a mutation would produce an account whose
      // first ever state came from another app, so this refuses and says what to do.
      return { status: 409, body: { error: 'no-snapshot', message: 'Open BlockOut and sync once before editing from another app.' } };
    }
    return { status: 502, body: { error: 'Could not read your BlockOut data.' } };
  }

  if (isEmptySnapshot(snap)) {
    return { status: 409, body: { error: 'empty-snapshot', message: 'Your stored BlockOut data looks empty; refusing to edit it.' } };
  }

  // Invariant 4 — a caller that tells us what it saw gets protected from a lost update.
  if (expectedLastModified != null) {
    const stored = Number(snap.lastModified) || 0;
    if (Number(expectedLastModified) !== stored) {
      return {
        status: 409,
        body: { error: 'conflict', message: 'Your BlockOut data changed since it was loaded. Refresh and try again.', lastModified: stored },
      };
    }
  }

  const results = [];
  for (const op of ops) {
    const name = op && typeof op.op === 'string' ? op.op : '';
    const fn = OPS[name];
    if (!fn) return { status: 400, body: { error: `unknown operation “${name}”`, known: OP_NAMES } };
    try {
      results.push({ op: name, ...fn(snap, op) });
    } catch (e) {
      // Nothing is written on failure, so a bad op in a batch leaves the snapshot exactly as it was.
      return { status: 400, body: { error: `${name}: ${e.message}`, appliedNone: true } };
    }
  }

  // Invariant 2, checked again AFTER the edits — a delete batch must not be able to empty the account.
  if (isEmptySnapshot(snap)) {
    return { status: 409, body: { error: 'would-empty', message: 'That would leave your BlockOut account empty; refusing.' } };
  }

  // Invariant 3 — both counters move forward, or the client ignores the write.
  snap.lastModified = Date.now();
  snap.version = (Number(snap.version) || 0) + 1;

  try {
    await writeSnapshot(userId, snap);
  } catch {
    return { status: 502, body: { error: 'Could not save to your BlockOut data.' } };
  }

  return {
    status: 200,
    body: { ok: true, results, lastModified: snap.lastModified, version: snap.version },
  };
}

/** Verify a Supabase JWT from any sibling Syncratic app and return its user. */
async function userFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !data || !data.user) return null;
  return data.user;
}

module.exports = { applyMutations, userFromToken, isConfigured, isEmptySnapshot, OP_NAMES, OPS };
