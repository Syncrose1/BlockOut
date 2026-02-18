import { useState, useMemo, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import {
  debouncedSave,
  getCloudConfig,
  setCloudConfig,
  saveToCloud,
  getLastSyncedTime,
} from '../utils/persistence';

// ─── Calendar Date Picker ────────────────────────────────────────────────────

const MONTH_NAMES = [
  'January','February','March','April','May','June',
  'July','August','September','October','November','December'
];
const DAY_NAMES = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function CalendarPicker({ value, onChange }: { value: Date | null; onChange: (d: Date) => void }) {
  const [viewDate, setViewDate] = useState(() => {
    const d = value || new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstWeekday = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const prevMonth = () => setViewDate(new Date(year, month - 1, 1));
  const nextMonth = () => setViewDate(new Date(year, month + 1, 1));

  const isSelected = (day: number) => {
    if (!value) return false;
    return value.getFullYear() === year && value.getMonth() === month && value.getDate() === day;
  };
  const isToday = (day: number) => {
    const d = new Date(year, month, day);
    return d.getTime() === today.getTime();
  };

  return (
    <div className="calendar-picker">
      <div className="calendar-nav">
        <button className="calendar-nav-btn" onClick={prevMonth}>‹</button>
        <span className="calendar-month-label">{MONTH_NAMES[month]} {year}</span>
        <button className="calendar-nav-btn" onClick={nextMonth}>›</button>
      </div>
      <div className="calendar-grid">
        {DAY_NAMES.map((d) => (
          <div key={d} className="calendar-day-name">{d}</div>
        ))}
        {cells.map((day, i) => {
          if (day === null) return <div key={`e-${i}`} />;
          const sel = isSelected(day);
          const tod = isToday(day);
          return (
            <button
              key={day}
              className={`calendar-day${sel ? ' selected' : ''}${tod ? ' today' : ''}`}
              onClick={() => onChange(new Date(year, month, day))}
            >
              {day}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── New Time Block Modal ────────────────────────────────────────────────────

export function NewBlockModal() {
  const show = useStore((s) => s.showNewBlockModal);
  const setShow = useStore((s) => s.setShowNewBlockModal);
  const addTimeBlock = useStore((s) => s.addTimeBlock);

  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState<Date | null>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 42); // 6 weeks default
    return d;
  });

  if (!show) return null;

  const handleCreate = () => {
    if (!name.trim() || !deadline) return;
    const now = Date.now();
    addTimeBlock({
      name: name.trim(),
      startDate: now,
      endDate: deadline.getTime(),
    });
    debouncedSave();
    setName('');
    setDeadline(null);
    setShow(false);
  };

  const countdown = deadline ? (() => {
    const ms = deadline.getTime() - Date.now();
    if (ms <= 0) return 'in the past';
    const days = Math.floor(ms / 86400000);
    const weeks = Math.floor(days / 7);
    const remDays = days % 7;
    if (weeks > 0) return `${weeks}w ${remDays}d`;
    return `${days}d`;
  })() : null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setShow(false)}
      >
        <motion.div
          className="modal modal-wide"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>New Time Block</h2>
          <div className="modal-field">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Paediatrics Placement"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="modal-field">
            <label style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span>Deadline</span>
              {countdown && (
                <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--accent)', fontSize: 11 }}>
                  {countdown} from now
                </span>
              )}
            </label>
            <CalendarPicker value={deadline} onChange={setDeadline} />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate} disabled={!name.trim() || !deadline}>
              Create Block
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── New Category Modal ──────────────────────────────────────────────────────

export function NewCategoryModal() {
  const show = useStore((s) => s.showNewCategoryModal);
  const setShow = useStore((s) => s.setShowNewCategoryModal);
  const addCategory = useStore((s) => s.addCategory);
  const addSubcategory = useStore((s) => s.addSubcategory);

  const [name, setName] = useState('');
  const [subcategories, setSubcategories] = useState<string[]>([]);
  const [subInput, setSubInput] = useState('');

  if (!show) return null;

  const handleAddSub = () => {
    if (subInput.trim() && !subcategories.includes(subInput.trim())) {
      setSubcategories([...subcategories, subInput.trim()]);
      setSubInput('');
    }
  };

  const handleCreate = () => {
    if (!name.trim()) return;
    const catId = addCategory(name.trim());
    subcategories.forEach((sub) => addSubcategory(catId, sub));
    debouncedSave();
    setName('');
    setSubcategories([]);
    setSubInput('');
    setShow(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setShow(false)}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>New Category</h2>
          <div className="modal-field">
            <label>Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Revision, Research, Sign-offs"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && (subInput ? handleAddSub() : handleCreate())}
            />
          </div>

          <div className="modal-field">
            <label>Subcategories (optional)</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                value={subInput}
                onChange={(e) => setSubInput(e.target.value)}
                placeholder="e.g. Cardiology, Respiratory"
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSub())}
                style={{ flex: 1 }}
              />
              <button className="btn btn-ghost btn-sm" onClick={handleAddSub} type="button">Add</button>
            </div>
            {subcategories.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
                {subcategories.map((sub, i) => (
                  <span key={i} className="tag">
                    {sub}
                    <button
                      onClick={() => setSubcategories(subcategories.filter((_, j) => j !== i))}
                      style={{ fontSize: 12, color: 'var(--text-tertiary)', cursor: 'pointer', background: 'none', border: 'none', marginLeft: 2 }}
                    >&times;</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 8 }}>
            A colour will be automatically assigned. Categories persist across all time blocks.
          </p>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate}>Create Category</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── New Task Modal ──────────────────────────────────────────────────────────

export function NewTaskModal() {
  const show = useStore((s) => s.showNewTaskModal);
  const setShow = useStore((s) => s.setShowNewTaskModal);
  const categories = useStore((s) => s.categories);
  const tasks = useStore((s) => s.tasks);
  const addTask = useStore((s) => s.addTask);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const assignTaskToBlock = useStore((s) => s.assignTaskToBlock);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [weight, setWeight] = useState(1);
  const [assignToBlock, setAssignToBlock] = useState(true);
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [showDeps, setShowDeps] = useState(false);

  const catList = useMemo(() => Object.values(categories), [categories]);
  const taskList = useMemo(() => Object.values(tasks), [tasks]);
  const selectedCat = categoryId ? categories[categoryId] : null;
  const subcategories = selectedCat?.subcategories || [];

  if (!show) return null;

  const toggleDep = (taskId: string) => {
    setDependsOn((prev) =>
      prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]
    );
  };

  const handleCreate = () => {
    if (!title.trim() || !categoryId) return;
    const taskId = addTask({
      title: title.trim(),
      categoryId,
      subcategoryId: subcategoryId || undefined,
      weight,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    });
    if (assignToBlock && activeBlockId) {
      assignTaskToBlock(taskId, activeBlockId);
    }
    debouncedSave();
    setTitle('');
    setWeight(1);
    setDependsOn([]);
    // Keep category for rapid entry
  };

  const handleClose = () => {
    setTitle('');
    setCategoryId('');
    setSubcategoryId('');
    setWeight(1);
    setDependsOn([]);
    setShowDeps(false);
    setShow(false);
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleClose}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Add Task</h2>
          <div className="modal-field">
            <label>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Study respiratory physiology"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          <div className="modal-field">
            <label>Category</label>
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }}>
              <option value="">Select category...</option>
              {catList.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          {subcategories.length > 0 && (
            <div className="modal-field">
              <label>Subcategory</label>
              <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                <option value="">None (general)</option>
                {subcategories.map((sub) => (
                  <option key={sub.id} value={sub.id}>{sub.name}</option>
                ))}
              </select>
            </div>
          )}
          <div className="modal-field">
            <label>Weight (effort: 1–5)</label>
            <div className="weight-picker">
              {[1, 2, 3, 4, 5].map((w) => (
                <button
                  key={w}
                  className={`weight-btn${weight === w ? ' active' : ''}`}
                  onClick={() => setWeight(w)}
                  type="button"
                >
                  {w}
                </button>
              ))}
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Larger weight = bigger tile on the treemap
            </p>
          </div>

          {/* Chain-quest dependencies */}
          {taskList.length > 0 && (
            <div className="modal-field">
              <button
                className="dep-toggle"
                onClick={() => setShowDeps(!showDeps)}
                type="button"
              >
                <span className="dep-toggle-icon">{showDeps ? '▾' : '▸'}</span>
                Dependencies
                {dependsOn.length > 0 && (
                  <span className="dep-badge">{dependsOn.length}</span>
                )}
              </button>
              <AnimatePresence>
                {showDeps && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={{ duration: 0.2 }}
                    style={{ overflow: 'hidden' }}
                  >
                    <div className="dep-list">
                      <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                        Select tasks that must be completed before this one can be started.
                      </p>
                      {taskList.map((task) => {
                        const cat = categories[task.categoryId];
                        const selected = dependsOn.includes(task.id);
                        return (
                          <div
                            key={task.id}
                            className={`dep-item${selected ? ' selected' : ''}`}
                            onClick={() => toggleDep(task.id)}
                          >
                            <div className={`check${selected ? ' done' : ''}`}
                              style={selected ? { borderColor: cat?.color, background: cat?.color } : {}}
                            >
                              {selected && <span style={{ fontSize: 9, color: 'white' }}>✓</span>}
                            </div>
                            <span className="dot" style={{ background: cat?.color || 'gray', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, flex: 1 }}>{task.title}</span>
                            {task.completed && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>done</span>}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {activeBlockId && (
            <div className="modal-field" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={assignToBlock}
                onChange={(e) => setAssignToBlock(e.target.checked)}
                style={{ width: 'auto' }}
              />
              <label style={{ marginBottom: 0 }}>Assign to active block</label>
            </div>
          )}
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={handleClose}>Done</button>
            <button className="btn btn-primary" onClick={handleCreate}>
              Add Task
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Assign Tasks Modal ──────────────────────────────────────────────────────

export function AssignTasksModal({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const assignTaskToBlock = useStore((s) => s.assignTaskToBlock);
  const removeTaskFromBlock = useStore((s) => s.removeTaskFromBlock);

  const block = timeBlocks[blockId];
  if (!block) return null;

  const assignedSet = new Set(block.taskIds);
  const allTasks = Object.values(tasks);

  const toggleAssign = (taskId: string) => {
    if (assignedSet.has(taskId)) {
      removeTaskFromBlock(taskId, blockId);
    } else {
      assignTaskToBlock(taskId, blockId);
    }
    debouncedSave();
  };

  return (
    <motion.div
      className="modal-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
    >
      <motion.div
        className="modal"
        style={{ maxHeight: '70vh', display: 'flex', flexDirection: 'column' }}
        initial={{ scale: 0.92, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.92, opacity: 0, y: 20 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Assign Tasks to {block.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          Pull tasks from your pool into this time block. You can also drag tasks from the treemap or kanban onto blocks in the sidebar.
        </p>
        <div style={{ overflow: 'auto', flex: 1 }}>
          {allTasks.length === 0 && (
            <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No tasks yet. Create some first!</p>
          )}
          {allTasks.map((task) => {
            const cat = categories[task.categoryId];
            return (
              <div
                key={task.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '6px 0',
                  borderBottom: '1px solid var(--border)',
                  cursor: 'pointer',
                }}
                onClick={() => toggleAssign(task.id)}
              >
                <div
                  className={`check ${assignedSet.has(task.id) ? 'done' : ''}`}
                  style={assignedSet.has(task.id) ? { borderColor: cat?.color, background: cat?.color } : {}}
                >
                  {assignedSet.has(task.id) && <span style={{ fontSize: 10, color: 'white' }}>&#x2713;</span>}
                </div>
                <span className="dot" style={{ background: cat?.color || 'gray', width: 6, height: 6, borderRadius: '50%' }} />
                <span style={{ fontSize: 13, flex: 1 }}>{task.title}</span>
                <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>{cat?.name}</span>
              </div>
            );
          })}
        </div>
        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─── Task Completion Survey ──────────────────────────────────────────────────

const DURATION_OPTIONS = [
  { label: '< 15 min', value: 10 },
  { label: '30 min', value: 30 },
  { label: '1 hour', value: 60 },
  { label: '2 hours', value: 120 },
  { label: '4 hours', value: 240 },
  { label: 'Full day', value: 480 },
];

export function TaskCompletionSurvey() {
  const taskId = useStore((s) => s.completionSurveyTaskId);
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const setTaskActualDuration = useStore((s) => s.setTaskActualDuration);
  const setCompletionSurveyTask = useStore((s) => s.setCompletionSurveyTask);
  const [customMinutes, setCustomMinutes] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  if (!taskId) return null;
  const task = tasks[taskId];
  if (!task) return null;
  const cat = task.categoryId ? categories[task.categoryId] : null;

  const handleSelect = (minutes: number) => {
    setTaskActualDuration(taskId, minutes);
    debouncedSave();
    setShowCustom(false);
    setCustomMinutes('');
  };

  const handleCustomSubmit = () => {
    const mins = parseInt(customMinutes);
    if (mins > 0) handleSelect(mins);
  };

  const handleSkip = () => {
    setCompletionSurveyTask(null);
    setShowCustom(false);
    setCustomMinutes('');
  };

  return (
    <AnimatePresence>
      <motion.div
        className="survey-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={handleSkip}
      >
        <motion.div
          className="survey-card"
          initial={{ scale: 0.85, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.85, opacity: 0, y: 40 }}
          transition={{ type: 'spring', damping: 22, stiffness: 350 }}
          onClick={(e) => e.stopPropagation()}
          style={{ '--cat-color': cat?.color || 'var(--accent)' } as React.CSSProperties}
        >
          <div className="survey-checkmark">
            <svg width="32" height="32" viewBox="0 0 32 32">
              <circle cx="16" cy="16" r="14" fill="none" stroke={cat?.color || 'var(--accent)'} strokeWidth="2" />
              <motion.path
                d="M9 16 L14 21 L23 11"
                fill="none"
                stroke={cat?.color || 'var(--accent)'}
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4, delay: 0.1 }}
              />
            </svg>
          </div>
          <div className="survey-title">Task complete!</div>
          <div className="survey-task-name">{task.title}</div>
          <div className="survey-question">How long did this take?</div>
          <div className="survey-options">
            {DURATION_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className="survey-option"
                style={{ '--hover-color': cat?.color || 'var(--accent)' } as React.CSSProperties}
                onClick={() => handleSelect(opt.value)}
              >
                {opt.label}
              </button>
            ))}
            <button
              className="survey-option survey-option-custom"
              style={{ '--hover-color': cat?.color || 'var(--accent)' } as React.CSSProperties}
              onClick={() => setShowCustom(!showCustom)}
            >
              Custom
            </button>
          </div>
          <AnimatePresence>
            {showCustom && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                style={{ overflow: 'hidden' }}
              >
                <div className="survey-custom-input">
                  <input
                    type="number"
                    value={customMinutes}
                    onChange={(e) => setCustomMinutes(e.target.value)}
                    placeholder="Minutes..."
                    autoFocus
                    onKeyDown={(e) => e.key === 'Enter' && handleCustomSubmit()}
                    style={{ width: '100%', textAlign: 'center' }}
                  />
                  <button className="btn btn-primary btn-sm" onClick={handleCustomSubmit}>
                    Save
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <button className="survey-skip" onClick={handleSkip}>Skip</button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Category Settings Modal ─────────────────────────────────────────────────

export function CategorySettingsModal({
  categoryId,
  onClose,
}: {
  categoryId: string;
  onClose: () => void;
}) {
  const categories = useStore((s) => s.categories);
  const tasks = useStore((s) => s.tasks);
  const renameCategory = useStore((s) => s.renameCategory);
  const addSubcategory = useStore((s) => s.addSubcategory);
  const deleteSubcategory = useStore((s) => s.deleteSubcategory);
  const deleteCategory = useStore((s) => s.deleteCategory);
  const exitFocusMode = useStore((s) => s.exitFocusMode);
  const pomodoro = useStore((s) => s.pomodoro);

  const cat = categories[categoryId];

  const [nameInput, setNameInput] = useState(cat?.name ?? '');
  const [subInput, setSubInput] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (!cat) return null;

  const allCatTasks = Object.values(tasks).filter((t) => t.categoryId === categoryId);
  const activeTasks = allCatTasks.filter((t) => !t.completed);
  const completedTasks = allCatTasks.filter((t) => t.completed);

  const subCounts = (subId: string) => {
    const sub = allCatTasks.filter((t) => t.subcategoryId === subId);
    return { active: sub.filter((t) => !t.completed).length, completed: sub.filter((t) => t.completed).length };
  };

  const handleRename = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== cat.name) {
      renameCategory(categoryId, trimmed);
      debouncedSave();
    }
  };

  const handleAddSub = () => {
    if (subInput.trim()) {
      addSubcategory(categoryId, subInput.trim());
      debouncedSave();
      setSubInput('');
    }
  };

  const handleDeleteSub = (subId: string) => {
    deleteSubcategory(categoryId, subId);
    debouncedSave();
  };

  const handleDeleteCategory = () => {
    if (pomodoro.focusedCategoryId === categoryId) exitFocusMode();
    deleteCategory(categoryId);
    debouncedSave();
    onClose();
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          {!confirmDelete ? (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <span style={{
                  width: 12, height: 12, borderRadius: '50%',
                  background: cat.color, flexShrink: 0, display: 'inline-block',
                }} />
                <h2 style={{ margin: 0 }}>Category Settings</h2>
              </div>

              <div className="modal-field">
                <label>Category ID</label>
                <div style={{
                  fontFamily: 'monospace', fontSize: 11,
                  color: 'var(--text-tertiary)', padding: '4px 0',
                  wordBreak: 'break-all',
                }}>
                  {categoryId}
                </div>
              </div>

              <div className="modal-field">
                <label>Name</label>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleRename()}
                    style={{ flex: 1 }}
                  />
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleRename}
                    disabled={!nameInput.trim() || nameInput.trim() === cat.name}
                  >
                    Rename
                  </button>
                </div>
              </div>

              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 14 }}>
                {activeTasks.length} active task{activeTasks.length !== 1 ? 's' : ''}
                {completedTasks.length > 0 && ` · ${completedTasks.length} completed`}
              </div>

              <div className="modal-field">
                <label>Subcategories</label>
                {cat.subcategories.length === 0 ? (
                  <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '4px 0 8px' }}>
                    No subcategories yet.
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
                    {cat.subcategories.map((sub) => {
                      const counts = subCounts(sub.id);
                      return (
                        <div
                          key={sub.id}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 8,
                            background: 'var(--surface-2)', borderRadius: 6,
                            padding: '5px 8px',
                          }}
                        >
                          <span style={{ flex: 1, fontSize: 13 }}>{sub.name}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)', whiteSpace: 'nowrap' }}>
                            {counts.active} active{counts.completed > 0 ? ` · ${counts.completed} completed` : ''}
                          </span>
                          <button
                            style={{
                              background: 'none', border: 'none', cursor: 'pointer',
                              color: 'var(--text-tertiary)', fontSize: 16, lineHeight: 1, padding: '0 2px',
                            }}
                            title="Remove subcategory"
                            onClick={() => handleDeleteSub(sub.id)}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
                <div style={{ display: 'flex', gap: 6, marginTop: 2 }}>
                  <input
                    value={subInput}
                    onChange={(e) => setSubInput(e.target.value)}
                    placeholder="New subcategory name"
                    onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddSub())}
                    style={{ flex: 1 }}
                  />
                  <button className="btn btn-ghost btn-sm" onClick={handleAddSub}>Add</button>
                </div>
              </div>

              <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: 8 }}>
                <button
                  className="btn"
                  style={{ color: 'var(--danger, #e05c5c)', background: 'none', border: '1px solid var(--danger, #e05c5c)' }}
                  onClick={() => setConfirmDelete(true)}
                >
                  Delete Category
                </button>
                <button className="btn btn-ghost" onClick={onClose}>Close</button>
              </div>
            </>
          ) : (
            <>
              <h2>Delete &ldquo;{cat.name}&rdquo;?</h2>
              <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: 10 }}>
                This action is <strong>permanent</strong> and cannot be undone.
              </p>
              {(activeTasks.length > 0 || completedTasks.length > 0) && (
                <div style={{
                  background: 'var(--surface-2)', borderRadius: 8,
                  padding: '10px 14px', marginBottom: 16, fontSize: 13,
                }}>
                  The following will also be permanently deleted:
                  <ul style={{ margin: '6px 0 0', paddingLeft: 18 }}>
                    {activeTasks.length > 0 && (
                      <li>{activeTasks.length} active task{activeTasks.length !== 1 ? 's' : ''}</li>
                    )}
                    {completedTasks.length > 0 && (
                      <li>{completedTasks.length} completed task{completedTasks.length !== 1 ? 's' : ''}</li>
                    )}
                  </ul>
                </div>
              )}
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Go back</button>
                <button
                  className="btn btn-primary"
                  style={{ background: 'var(--danger, #e05c5c)', borderColor: 'var(--danger, #e05c5c)' }}
                  onClick={handleDeleteCategory}
                >
                  Delete permanently
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Pomodoro Settings Modal ─────────────────────────────────────────────────

export function PomodoroSettingsModal() {
  const open = useStore((s) => s.pomodoroSettingsOpen);
  const setPomodoroSettingsOpen = useStore((s) => s.setPomodoroSettingsOpen);
  const pomodoro = useStore((s) => s.pomodoro);
  const setPomodoroDurations = useStore((s) => s.setPomodoroDurations);

  const [work, setWork] = useState(Math.round(pomodoro.workDuration / 60));
  const [brk, setBrk] = useState(Math.round(pomodoro.breakDuration / 60));
  const [longBrk, setLongBrk] = useState(Math.round(pomodoro.longBreakDuration / 60));

  if (!open) return null;

  const handleSave = () => {
    setPomodoroDurations(
      Math.max(1, work) * 60,
      Math.max(1, brk) * 60,
      Math.max(1, longBrk) * 60
    );
    debouncedSave();
    setPomodoroSettingsOpen(false);
  };

  const totalSessions = pomodoro.sessions.length;
  const workSessions = pomodoro.sessions.filter((s) => s.mode === 'work').length;
  const totalFocusMinutes = Math.round(
    pomodoro.sessions
      .filter((s) => s.mode === 'work')
      .reduce((sum, s) => sum + (s.endTime - s.startTime) / 60000, 0)
  );

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setPomodoroSettingsOpen(false)}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Pomodoro Settings</h2>

          {/* Analytics summary */}
          {totalSessions > 0 && (
            <div className="pomo-stats">
              <div className="pomo-stat">
                <span className="pomo-stat-value">{workSessions}</span>
                <span className="pomo-stat-label">sessions</span>
              </div>
              <div className="pomo-stat">
                <span className="pomo-stat-value">{totalFocusMinutes}</span>
                <span className="pomo-stat-label">focus mins</span>
              </div>
              <div className="pomo-stat">
                <span className="pomo-stat-value">{totalSessions - workSessions}</span>
                <span className="pomo-stat-label">breaks</span>
              </div>
            </div>
          )}

          <div className="modal-field">
            <label>Focus duration (minutes)</label>
            <div className="duration-input-row">
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={work}
                onChange={(e) => setWork(parseInt(e.target.value))}
                className="duration-slider"
              />
              <span className="duration-value">{work}m</span>
            </div>
          </div>
          <div className="modal-field">
            <label>Short break (minutes)</label>
            <div className="duration-input-row">
              <input
                type="range"
                min={1}
                max={30}
                step={1}
                value={brk}
                onChange={(e) => setBrk(parseInt(e.target.value))}
                className="duration-slider"
              />
              <span className="duration-value">{brk}m</span>
            </div>
          </div>
          <div className="modal-field">
            <label>Long break (minutes)</label>
            <div className="duration-input-row">
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={longBrk}
                onChange={(e) => setLongBrk(parseInt(e.target.value))}
                className="duration-slider"
              />
              <span className="duration-value">{longBrk}m</span>
            </div>
          </div>

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setPomodoroSettingsOpen(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Sync Settings Modal ──────────────────────────────────────────────────────

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SyncSettingsModal() {
  const open = useStore((s) => s.syncSettingsOpen);
  const setSyncSettingsOpen = useStore((s) => s.setSyncSettingsOpen);
  const syncStatus = useStore((s) => s.syncStatus);
  const setSyncStatus = useStore((s) => s.setSyncStatus);

  const [url, setUrl] = useState(() => getCloudConfig().url);
  const [token, setToken] = useState(() => getCloudConfig().token);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<'ok' | 'fail' | null>(null);
  const [lastSynced, setLastSynced] = useState<number | null>(getLastSyncedTime);

  // Refresh lastSynced display whenever modal opens
  useEffect(() => {
    if (open) {
      const cfg = getCloudConfig();
      setUrl(cfg.url);
      setToken(cfg.token);
      setLastSynced(getLastSyncedTime());
      setTestResult(null);
    }
  }, [open]);

  if (!open) return null;

  const handleSave = () => {
    setCloudConfig(url, token);
    setSyncSettingsOpen(false);
  };

  const handleTestAndSync = async () => {
    setTesting(true);
    setTestResult(null);
    // Save config first so saveToCloud picks it up
    setCloudConfig(url, token);
    try {
      setSyncStatus('syncing');
      await saveToCloud();
      setTestResult('ok');
      setLastSynced(getLastSyncedTime());
    } catch {
      setTestResult('fail');
      setSyncStatus('error');
    } finally {
      setTesting(false);
    }
  };

  const hasUrl = url.trim().length > 0;

  const statusDot: Record<string, string> = {
    idle: 'var(--text-tertiary)',
    syncing: 'hsl(48, 90%, 60%)',
    synced: 'hsl(140, 60%, 50%)',
    error: 'hsl(0, 72%, 62%)',
  };
  const statusLabel: Record<string, string> = {
    idle: 'not configured',
    syncing: 'syncing…',
    synced: 'synced',
    error: 'sync error',
  };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setSyncSettingsOpen(false)}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Cloud Sync</h2>

          {/* Status */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 18, fontSize: 13 }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: statusDot[syncStatus], flexShrink: 0,
            }} />
            <span style={{ color: 'var(--text-secondary)' }}>
              {statusLabel[syncStatus]}
              {lastSynced && syncStatus !== 'syncing'
                ? ` · last synced ${formatRelativeTime(lastSynced)}`
                : ''}
            </span>
          </div>

          <div className="modal-field">
            <label>Remote server URL</label>
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://blockout.yourdomain.com"
              autoFocus
            />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Your self-hosted BlockOut server. Leave blank to disable cloud sync.
            </div>
          </div>

          <div className="modal-field">
            <label>Token (optional)</label>
            <input
              value={token}
              onChange={(e) => setToken(e.target.value)}
              type="password"
              placeholder="Set via BLOCKOUT_TOKEN on the server"
            />
            <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 4 }}>
              Must match the <code>BLOCKOUT_TOKEN</code> env variable on your server.
            </div>
          </div>

          {testResult === 'ok' && (
            <div style={{ fontSize: 13, color: 'hsl(140, 60%, 50%)', marginBottom: 12 }}>
              Connection successful — data pushed to server.
            </div>
          )}
          {testResult === 'fail' && (
            <div style={{ fontSize: 13, color: 'hsl(0, 72%, 62%)', marginBottom: 12 }}>
              Connection failed. Check the URL and token.
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            Data syncs automatically every 5 minutes and on page close.
            Local (IndexedDB) is always the primary store — cloud is a backup.
          </div>

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setSyncSettingsOpen(false)}>Cancel</button>
            {hasUrl && (
              <button
                className="btn btn-ghost"
                onClick={handleTestAndSync}
                disabled={testing}
              >
                {testing ? 'Testing…' : 'Test & sync now'}
              </button>
            )}
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
