// The cross-app mutation module.
//
// BlockOut had no test harness, so this is a plain node script in the style Finalist uses — no framework,
// runnable with `node scripts/_test-mutate.mjs`.
//
// ★ WHAT IS BEING PROTECTED IS SOMEONE'S REAL PLANNING DATA. The R2 blob is a dumb overwrite with no
// validation, so every guard in apply.js is the only thing between a caller's bug and 349 lost tasks. The
// operations themselves are the easy part; these tests are mostly about the four invariants:
//
//   1. keys this module has never heard of survive a write
//   2. an empty snapshot is never written, before OR after the edits
//   3. lastModified and version both move forward
//   4. a stale caller is refused rather than allowed to clobber
//
// The ops are pure functions over a plain object, so they are tested directly. The R2 and Supabase halves
// are I/O and are exercised by using the endpoint.

import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { OPS, isEmptySnapshot, OP_NAMES } = require('../api/_mutate/apply.js');

let fail = 0;
const ok = (name, cond, note = '') => {
  if (!cond) fail++;
  console.log(`  ${cond ? '✓' : '✗'} ${name}${note ? `  ${note}` : ''}`);
};

/** A snapshot shaped like the real one, including state this module must never touch. */
const seed = () => ({
  tasks: {
    t1: { id: 't1', title: 'Clerk two patients', categoryId: 'c1', completed: false, weight: 5, createdAt: 1 },
    t2: { id: 't2', title: 'Food shop', categoryId: 'c2', completed: false, weight: 3, createdAt: 1 },
  },
  categories: {
    c1: { id: 'c1', name: 'Medicine', color: '#0f7355', subcategories: [] },
    c2: { id: 'c2', name: 'Life', color: '#a8763e', subcategories: [] },
  },
  timeBlocks: { tb1: { id: 'tb1', name: 'This week', taskIds: ['t1', 't2'], startDate: 1, endDate: 2, createdAt: 1 } },
  taskChains: {
    '2026-07-27': {
      id: 'ch1', date: '2026-07-27', createdAt: 1,
      links: [{ id: 'l1', type: 'ct', taskId: 'ct1' }, { id: 'l2', type: 'realtask', taskId: 't1' }],
      groups: [{ id: 'g1', name: 'Evening', links: [{ id: 'l3', type: 'ct', taskId: 'ct2' }] }],
    },
  },
  chainTasks: {
    ct1: { id: 'ct1', title: 'Bloods round', type: 'ct', completed: false },
    ct2: { id: 'ct2', title: 'Sign-off hunt', type: 'ct', completed: false },
  },
  chainTemplates: {
    tpl1: { id: 'tpl1', name: 'Ward morning', links: [{ type: 'ct', ctTitle: 'Handover' }, { type: 'realtask', realTaskPlaceholder: 'Clerk the new admission' }], createdAt: 1 },
  },
  overviewBlocks: [
    { id: 'b1', dayIndex: 0, startSlot: 4, endSlot: 8, type: 'mt', name: 'Ward', taskId: 't1', weekDate: '2026-07-27', completed: false, createdAt: 1, updatedAt: 1 },
  ],
  // ★ STATE THIS MODULE MUST NEVER UNDERSTAND OR DESTROY.
  synamon: { active: 'cindrel', dex: { cindrel: { seen: 4 } } },
  coFocus: { sessionId: 'abc', participants: ['x'] },
  pomodoro: { isRunning: false, sessionsCompleted: 12, timer: { sessions: [1, 2] } },
  streak: { completionDates: ['2026-07-20'], currentStreak: 3, longestStreak: 9 },
  activeBlockId: 'tb1',
  lastModified: 1000,
  version: 7,
});

console.log('── the contract ──');
{
  ok('every operation is exported by name', OP_NAMES.length >= 15, `${OP_NAMES.length} ops`);
  for (const need of [
    'create_task', 'update_task', 'set_task_completed', 'delete_task',
    'add_chain_step', 'add_chain_subtask', 'add_task_to_chain', 'set_chain_step_completed', 'remove_chain_step',
    'reorder_chain', 'apply_chain_template', 'save_chain_template',
    'schedule_block', 'update_block', 'set_block_completed', 'delete_block',
  ]) {
    ok(`${need} exists`, typeof OPS[need] === 'function');
  }
}

console.log('\n── ★ invariant 1: keys this module never heard of survive ──');
{
  // Every op edits in place from the stored blob, so an unknown key is carried through untouched.
  const untouched = ['synamon', 'coFocus', 'pomodoro', 'streak', 'activeBlockId'];
  const lost = [];
  for (const name of OP_NAMES) {
    const s = seed();
    const before = JSON.stringify(Object.fromEntries(untouched.map((k) => [k, s[k]])));
    // Give each op a payload that will succeed; failures are covered separately.
    const payload = {
      create_task: { title: 'x', categoryName: 'Medicine' },
      update_task: { taskId: 't1', title: 'y' },
      set_task_completed: { taskId: 't1' },
      delete_task: { taskId: 't2' },
      add_chain_step: { date: '2026-07-27', title: 'x' },
      add_chain_subtask: { date: '2026-07-27', parentLinkId: 'l1', title: 'x' },
      add_task_to_chain: { date: '2026-07-27', taskId: 't2' },
      set_chain_step_completed: { date: '2026-07-27', linkId: 'l1' },
      remove_chain_step: { date: '2026-07-27', linkId: 'l1' },
      reorder_chain: { date: '2026-07-27', linkIds: ['l2', 'l1'] },
      apply_chain_template: { date: '2026-07-28', templateName: 'Ward morning' },
      save_chain_template: { name: 'New', steps: [{ title: 'a' }] },
      schedule_block: { weekDate: '2026-07-27', dayIndex: 1, startSlot: 4, endSlot: 6, name: 'x' },
      update_block: { blockId: 'b1', name: 'z' },
      set_block_completed: { blockId: 'b1' },
      delete_block: { blockId: 'b1' },
    }[name];
    // A `continue` here silently exempted any new operation from this invariant, which is how
    // add_chain_subtask escaped it. Fail instead: adding an op means declaring a payload for it.
    if (!payload) { lost.push(`${name} (no test payload declared)`); continue; }
    OPS[name](s, payload);
    const after = JSON.stringify(Object.fromEntries(untouched.map((k) => [k, s[k]])));
    if (before !== after) lost.push(name);
  }
  ok('no operation disturbs synamon, coFocus, pomodoro, streak or activeBlockId',
    lost.length === 0, lost.join(', '));
}

console.log('\n── ★ invariant 2: the empty guard ──');
{
  ok('an empty object is empty', isEmptySnapshot({}));
  ok('null is empty', isEmptySnapshot(null));
  ok('no tasks and no categories is empty', isEmptySnapshot({ tasks: {}, categories: {} }));
  // Matches persistence.ts: categories alone are enough to count as populated.
  ok('categories alone is NOT empty', !isEmptySnapshot({ tasks: {}, categories: { c: {} } }));
  ok('tasks alone is NOT empty', !isEmptySnapshot({ tasks: { t: {} }, categories: {} }));
  ok('a real snapshot is not empty', !isEmptySnapshot(seed()));
}

console.log('\n── tasks ──');
{
  const s = seed();
  const r = OPS.create_task(s, { title: 'New thing', categoryName: 'Medicine', subcategoryName: 'CPSA', weight: 99 });
  ok('a created task lands in an existing category by name',
    s.tasks[r.taskId].categoryId === 'c1', s.tasks[r.taskId].categoryId);
  ok('weight is clamped to BlockOut\'s 1–10 scale', s.tasks[r.taskId].weight === 10, String(s.tasks[r.taskId].weight));
  ok('a subcategory is created on the category', s.categories.c1.subcategories.length === 1);
  ok('and reused, not duplicated, on a second task',
    (OPS.create_task(s, { title: 'Another', categoryName: 'Medicine', subcategoryName: 'CPSA' }),
      s.categories.c1.subcategories.length === 1));

  const s2 = seed();
  OPS.create_task(s2, { title: 'x', categoryName: 'Brand New' });
  ok('an unknown category is created', !!Object.values(s2.categories).find((c) => c.name === 'Brand New'));

  const s3 = seed();
  OPS.set_task_completed(s3, { taskId: 't1', actualDuration: 42 });
  ok('completing a task stamps it', s3.tasks.t1.completed === true && !!s3.tasks.t1.completedAt);
  ok('and records the duration', s3.tasks.t1.actualDuration === 42);
  OPS.set_task_completed(s3, { taskId: 't1', completed: false });
  // ★ completedAt must be CLEARED, or BlockOut's streak counts a day the user did not finish anything.
  ok('reopening clears completedAt', s3.tasks.t1.completed === false && s3.tasks.t1.completedAt === undefined);

  ok('an unknown taskId throws rather than no-oping',
    (() => { try { OPS.update_task(seed(), { taskId: 'ghost' }); return false; } catch { return true; } })());
}

console.log('\n── ★ a deleted task leaves no dangling references ──');
{
  const s = seed();
  OPS.delete_task(s, { taskId: 't1' });
  ok('the task is gone', !s.tasks.t1);
  // Each of these would render an empty row in BlockOut's own UI if left behind.
  ok('removed from time blocks', !s.timeBlocks.tb1.taskIds.includes('t1'), s.timeBlocks.tb1.taskIds.join(','));
  ok('removed from schedule blocks', !s.overviewBlocks.some((b) => b.taskId === 't1'));
  ok('removed from chain links', !(s.taskChains['2026-07-27'].links || []).some((l) => l.taskId === 't1'));
  ok('but the other task is untouched', !!s.tasks.t2);
  ok('and chain tasks are untouched', !!s.chainTasks.ct1);
}

console.log('\n── chains ──');
{
  const s = seed();
  const r = OPS.add_chain_step(s, { date: '2026-07-27', title: '20 AKT cards', notes: 'from Finalist' });
  ok('a step creates a chain task', s.chainTasks[r.chainTaskId].title === '20 AKT cards');
  ok('and a link pointing at it', s.taskChains['2026-07-27'].links.some((l) => l.taskId === r.chainTaskId));
  ok('notes carry', s.chainTasks[r.chainTaskId].notes === 'from Finalist');

  OPS.add_chain_step(s, { date: '2026-08-05', title: 'On a new date' });
  ok('a chain is created for a date that had none', !!s.taskChains['2026-08-05']);

  // Completion has to reach whichever kind of thing the step points at.
  const s2 = seed();
  OPS.set_chain_step_completed(s2, { date: '2026-07-27', linkId: 'l1', actualDuration: 30 });
  ok('completing a ct step completes the chain task',
    s2.chainTasks.ct1.completed === true && s2.chainTasks.ct1.actualDuration === 30);
  OPS.set_chain_step_completed(s2, { date: '2026-07-27', linkId: 'l2' });
  ok('completing a realtask step completes the POOL task', s2.tasks.t1.completed === true);
  // A step inside a group must be findable, or half a chain is uncompletable.
  OPS.set_chain_step_completed(s2, { date: '2026-07-27', linkId: 'l3' });
  ok('a step inside a group is reachable', s2.chainTasks.ct2.completed === true);

  const s3 = seed();
  OPS.remove_chain_step(s3, { date: '2026-07-27', linkId: 'l1' });
  ok('removing a step drops the link', !s3.taskChains['2026-07-27'].links.some((l) => l.id === 'l1'));
  // A chain task exists only for its step; a pool task does not.
  ok('and deletes its chain task', !s3.chainTasks.ct1);
  const s4 = seed();
  OPS.remove_chain_step(s4, { date: '2026-07-27', linkId: 'l2' });
  ok('but removing a realtask step keeps the pool task', !!s4.tasks.t1);

  // ★ A REORDER MUST NOT LOSE A STEP — a stale client list would otherwise delete whatever it omitted.
  const s5 = seed();
  OPS.reorder_chain(s5, { date: '2026-07-27', linkIds: ['l2'] });
  ok('a partial reorder keeps the unmentioned steps',
    s5.taskChains['2026-07-27'].links.length === 2, String(s5.taskChains['2026-07-27'].links.length));
  ok('and puts the named one first', s5.taskChains['2026-07-27'].links[0].id === 'l2');

  ok('an unknown linkId throws',
    (() => { try { OPS.remove_chain_step(seed(), { date: '2026-07-27', linkId: 'ghost' }); return false; } catch { return true; } })());
  ok('a bad date throws',
    (() => { try { OPS.add_chain_step(seed(), { date: '27/07/2026', title: 'x' }); return false; } catch { return true; } })());
}

console.log('\n── subtasks ──');
{
  const s = seed();
  const r = OPS.add_chain_subtask(s, { date: '2026-07-27', parentLinkId: 'l1', title: 'Check the notes' });
  ok('a subtask creates its chain task', s.chainTasks[r.chainTaskId].title === 'Check the notes');
  const links = s.taskChains['2026-07-27'].links;
  ok('it is a subtask link pointing at its parent',
    links.some((l) => l.type === 'subtask' && l.parentId === 'l1' && l.subType === 'ct'));
  // ★ INSERTED AFTER THE PARENT, NOT APPENDED. Appending would file it under whatever step happens to be
  // last, which is a different step's child as far as the UI is concerned.
  ok('it sits directly after its parent', links[1].parentId === 'l1', links.map((l) => l.type).join(' '));

  OPS.add_chain_subtask(s, { date: '2026-07-27', parentLinkId: 'l1', title: 'And another' });
  const after = s.taskChains['2026-07-27'].links;
  ok('a second subtask goes after the first, not between',
    after[1].parentId === 'l1' && after[2].parentId === 'l1' && after[3].id === 'l2',
    after.map((l) => l.type).join(' '));

  // BlockOut draws one level of nesting; a subtask of a subtask has no depth to render at.
  const subId = after[1].id;
  ok('a subtask cannot have subtasks',
    (() => { try { OPS.add_chain_subtask(s, { date: '2026-07-27', parentLinkId: subId, title: 'x' }); return false; } catch { return true; } })());

  ok('an unknown parent throws',
    (() => { try { OPS.add_chain_subtask(seed(), { date: '2026-07-27', parentLinkId: 'ghost', title: 'x' }); return false; } catch { return true; } })());
  ok('a missing title throws',
    (() => { try { OPS.add_chain_subtask(seed(), { date: '2026-07-27', parentLinkId: 'l1', title: '  ' }); return false; } catch { return true; } })());
  ok('a date with no chain throws',
    (() => { try { OPS.add_chain_subtask(seed(), { date: '2026-08-09', parentLinkId: 'l1', title: 'x' }); return false; } catch { return true; } })());

  // Removing the parent must take its children with it — already covered by remove_chain_step, asserted
  // here against a subtask this operation created.
  const s2 = seed();
  OPS.add_chain_subtask(s2, { date: '2026-07-27', parentLinkId: 'l1', title: 'child' });
  OPS.remove_chain_step(s2, { date: '2026-07-27', linkId: 'l1' });
  ok('removing a parent removes its subtasks',
    !s2.taskChains['2026-07-27'].links.some((l) => l.parentId === 'l1'),
    s2.taskChains['2026-07-27'].links.map((l) => l.type).join(' '));
}

console.log('\n── templates ──');
{
  const s = seed();
  const r = OPS.apply_chain_template(s, { date: '2026-07-30', templateName: 'ward morning' });
  ok('a template is matched case-insensitively', /Loaded/.test(r.summary), r.summary);
  ok('and produces steps', s.taskChains['2026-07-30'].links.length === 2, String(s.taskChains['2026-07-30'].links.length));
  // ★ A TEMPLATE'S realtask SLOT IS A PLACEHOLDER, NOT A TASK. Creating a pool task from it would invent
  // work the user never asked for.
  ok('a realtask placeholder does NOT become a pool task',
    Object.keys(s.tasks).length === 2, `${Object.keys(s.tasks).length} tasks`);
  ok('it becomes a chain step carrying the placeholder text',
    Object.values(s.chainTasks).some((c) => c.title === 'Clerk the new admission'));

  const s2 = seed();
  OPS.apply_chain_template(s2, { date: '2026-07-27', templateName: 'Ward morning', mode: 'load' });
  ok('load REPLACES the existing chain', s2.taskChains['2026-07-27'].links.length === 2);
  const s3 = seed();
  OPS.apply_chain_template(s3, { date: '2026-07-27', templateName: 'Ward morning', mode: 'append' });
  ok('append keeps what was there', s3.taskChains['2026-07-27'].links.length === 4);

  const s4 = seed();
  const t = OPS.save_chain_template(s4, { name: 'Evening revision', steps: [{ title: 'Cards' }, { title: 'One station' }] });
  ok('a template is saved', s4.chainTemplates[t.templateId].links.length === 2);
  OPS.save_chain_template(s4, { name: 'evening revision', steps: [{ title: 'Only this' }] });
  ok('re-saving by name overwrites rather than duplicating',
    Object.keys(s4.chainTemplates).length === 2, `${Object.keys(s4.chainTemplates).length} templates`);

  ok('an unknown template throws',
    (() => { try { OPS.apply_chain_template(seed(), { date: '2026-07-27', templateName: 'nope' }); return false; } catch { return true; } })());
}

console.log('\n── calendar blocks ──');
{
  const s = seed();
  const r = OPS.schedule_block(s, { weekDate: '2026-07-27', dayIndex: 2, startSlot: 26, endSlot: 29, name: 'Revision' });
  ok('a block is added', s.overviewBlocks.some((b) => b.id === r.blockId));
  ok('a nameless block with a task takes the task title',
    (() => {
      const s2 = seed();
      const rr = OPS.schedule_block(s2, { weekDate: '2026-07-27', dayIndex: 1, startSlot: 4, endSlot: 6, taskId: 't1' });
      const b = s2.overviewBlocks.find((x) => x.id === rr.blockId);
      return b.name === 'Clerk two patients' && b.type === 'mt';
    })());

  for (const [label, bad] of [
    ['inverted slots', { weekDate: '2026-07-27', dayIndex: 0, startSlot: 8, endSlot: 4, name: 'x' }],
    ['zero-length', { weekDate: '2026-07-27', dayIndex: 0, startSlot: 4, endSlot: 4, name: 'x' }],
    ['dayIndex 7', { weekDate: '2026-07-27', dayIndex: 7, startSlot: 4, endSlot: 6, name: 'x' }],
    ['bad weekDate', { weekDate: 'monday', dayIndex: 0, startSlot: 4, endSlot: 6, name: 'x' }],
    ['no name and no task', { weekDate: '2026-07-27', dayIndex: 0, startSlot: 4, endSlot: 6 }],
    ['unknown taskId', { weekDate: '2026-07-27', dayIndex: 0, startSlot: 4, endSlot: 6, taskId: 'ghost' }],
  ]) {
    ok(`${label} is rejected`,
      (() => { try { OPS.schedule_block(seed(), bad); return false; } catch { return true; } })());
  }

  // ★ AN 'mt' BLOCK IS A TASK ON THE CALENDAR, so completing the block must complete the task — or the
  // treemap and the week view disagree about the same thing.
  const s3 = seed();
  OPS.set_block_completed(s3, { blockId: 'b1', actualDuration: 95 });
  ok('completing an mt block completes its task', s3.tasks.t1.completed === true);
  ok('and records the duration on the block', s3.overviewBlocks[0].actualDuration === 95);
  OPS.set_block_completed(s3, { blockId: 'b1', completed: false });
  ok('reopening reopens both', s3.tasks.t1.completed === false && s3.overviewBlocks[0].completed === false);
  ok('and clears both stamps',
    s3.tasks.t1.completedAt === undefined && s3.overviewBlocks[0].completedAt === undefined);

  const s4 = seed();
  OPS.delete_block(s4, { blockId: 'b1' });
  ok('a block is deleted', s4.overviewBlocks.length === 0);
  ok('but its task survives — a block is not the task', !!s4.tasks.t1);
  ok('deleting an unknown block throws',
    (() => { try { OPS.delete_block(seed(), { blockId: 'ghost' }); return false; } catch { return true; } })());
}

console.log('\n── ★ a failing op leaves the snapshot untouched ──');
{
  // applyMutations only writes after every op succeeds, so a bad op in a batch cannot half-apply. The
  // ops themselves must therefore throw BEFORE mutating.
  const s = seed();
  const before = JSON.stringify(s);
  for (const [name, payload] of [
    ['update_task', { taskId: 'ghost', title: 'x' }],
    ['set_task_completed', { taskId: 'ghost' }],
    ['delete_task', { taskId: 'ghost' }],
    ['set_chain_step_completed', { date: '2026-07-27', linkId: 'ghost' }],
    ['remove_chain_step', { date: 'nope', linkId: 'l1' }],
    ['add_chain_step', { date: '2026-07-27', title: '' }],
    ['schedule_block', { weekDate: 'x', dayIndex: 0, startSlot: 1, endSlot: 2, name: 'y' }],
    ['save_chain_template', { name: '', steps: [] }],
  ]) {
    try { OPS[name](s, payload); } catch { /* expected */ }
  }
  ok('eight failing operations changed nothing', JSON.stringify(s) === before);
}

console.log(fail ? `\n${fail} FAILED` : '\nall passed');
process.exit(fail ? 1 : 0);
