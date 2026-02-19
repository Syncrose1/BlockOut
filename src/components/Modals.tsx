import { useState, useMemo, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import {
  debouncedSave,
  getCloudConfig,
  setCloudConfig,
  saveToCloud,
  getLastSyncedTime,
  resolveConflict,
} from '../utils/persistence';
import { exportToFile, importFromFile } from '../utils/analytics';
import {
  syncToDropbox,
  syncFromDropbox,
  isDropboxConfigured,
  clearDropboxConfig,
  startDropboxAuth,
} from '../utils/dropbox';

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
  const [error, setError] = useState<string | null>(null);

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
    if (!title.trim()) {
      setError('Please enter a task title');
      return;
    }
    if (!categoryId) {
      setError('Please select a category. Create one in the sidebar if needed!');
      return;
    }
    setError(null);
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
    setError(null);
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
              onChange={(e) => { setTitle(e.target.value); setError(null); }}
              placeholder="e.g. Study respiratory physiology"
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
          </div>
          {/* Error message display */}
          {error && (
            <div className="modal-field">
              <div style={{
                padding: '12px 16px',
                background: 'hsla(0, 72%, 62%, 0.1)',
                border: '1px solid hsla(0, 72%, 62%, 0.3)',
                borderRadius: 'var(--radius-sm)',
                color: 'hsl(0, 72%, 62%)',
                fontSize: 13,
                display: 'flex',
                alignItems: 'center',
                gap: 8,
              }}>
                <span>⚠️</span>
                {error}
              </div>
            </div>
          )}

          <div className="modal-field">
            <label>Category</label>
            <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); setError(null); }}>
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
          Pull tasks from your pool into this time block. You can also drag tasks from the treemap onto blocks in the sidebar.
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

// ─── Task Edit Modal ─────────────────────────────────────────────────────────
// Opened via right-click on a treemap tile.

export function TaskEditModal() {
  const editingTaskId = useStore((s) => s.editingTaskId);
  const setEditingTaskId = useStore((s) => s.setEditingTaskId);
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const updateTask = useStore((s) => s.updateTask);
  const deleteTask = useStore((s) => s.deleteTask);

  const task = editingTaskId ? tasks[editingTaskId] : null;

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [subcategoryId, setSubcategoryId] = useState('');
  const [weight, setWeight] = useState(1);
  const [notes, setNotes] = useState('');
  const [dependsOn, setDependsOn] = useState<string[]>([]);
  const [showDeps, setShowDeps] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const catList = useMemo(() => Object.values(categories), [categories]);
  const otherTasks = useMemo(
    () => Object.values(tasks).filter((t) => t.id !== editingTaskId),
    [tasks, editingTaskId]
  );

  // Sync fields whenever the target task changes
  useEffect(() => {
    if (!task) return;
    setTitle(task.title);
    setCategoryId(task.categoryId);
    setSubcategoryId(task.subcategoryId ?? '');
    setWeight(task.weight);
    setNotes(task.notes ?? '');
    setDependsOn(task.dependsOn ?? []);
    setShowDeps(false);
    setConfirmDelete(false);
  }, [editingTaskId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!editingTaskId || !task) return null;

  const selectedCat = categories[categoryId];
  const subcategories = selectedCat?.subcategories ?? [];

  const toggleDep = (id: string) =>
    setDependsOn((prev) => (prev.includes(id) ? prev.filter((d) => d !== id) : [...prev, id]));

  const handleSave = () => {
    updateTask(editingTaskId, {
      title: title.trim() || task.title,
      categoryId,
      subcategoryId: subcategoryId || undefined,
      weight,
      notes: notes.trim() || undefined,
      dependsOn: dependsOn.length > 0 ? dependsOn : undefined,
    });
    debouncedSave();
    setEditingTaskId(null);
  };

  const handleDelete = () => {
    deleteTask(editingTaskId);
    debouncedSave();
    setEditingTaskId(null);
  };

  const close = () => setEditingTaskId(null);

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          style={{ maxWidth: 480 }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
            {selectedCat && (
              <span style={{
                width: 10, height: 10, borderRadius: '50%',
                background: selectedCat.color, flexShrink: 0,
              }} />
            )}
            <h2 style={{ margin: 0 }}>Edit Task</h2>
            {task.completed && (
              <span style={{
                fontSize: 10, color: 'hsl(140,60%,50%)', fontWeight: 600,
                textTransform: 'uppercase', letterSpacing: 0.8, marginLeft: 2,
              }}>Done</span>
            )}
          </div>

          <div className="modal-field">
            <label>Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
            <div className="modal-field">
              <label>Category</label>
              <select value={categoryId} onChange={(e) => { setCategoryId(e.target.value); setSubcategoryId(''); }}>
                {catList.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            {subcategories.length > 0 && (
              <div className="modal-field">
                <label>Subcategory</label>
                <select value={subcategoryId} onChange={(e) => setSubcategoryId(e.target.value)}>
                  <option value="">None</option>
                  {subcategories.map((sub) => <option key={sub.id} value={sub.id}>{sub.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div className="modal-field">
            <label>Weight (effort: 1–5)</label>
            <div className="weight-picker">
              {[1, 2, 3, 4, 5].map((w) => (
                <button
                  key={w}
                  className={`weight-btn${weight === w ? ' active' : ''}`}
                  onClick={() => setWeight(w)}
                  type="button"
                >{w}</button>
              ))}
            </div>
          </div>

          <div className="modal-field">
            <label>Notes</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Details, links, context…"
              rows={3}
              style={{ resize: 'vertical' }}
            />
          </div>

          {/* Dependencies */}
          {otherTasks.length > 0 && (
            <div className="modal-field">
              <button className="dep-toggle" onClick={() => setShowDeps(!showDeps)} type="button">
                <span className="dep-toggle-icon">{showDeps ? '▾' : '▸'}</span>
                Dependencies
                {dependsOn.length > 0 && <span className="dep-badge">{dependsOn.length}</span>}
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
                        Tasks that must be completed before this one can start.
                      </p>
                      {otherTasks.map((t) => {
                        const c = categories[t.categoryId];
                        const sel = dependsOn.includes(t.id);
                        return (
                          <div
                            key={t.id}
                            className={`dep-item${sel ? ' selected' : ''}`}
                            onClick={() => toggleDep(t.id)}
                          >
                            <div
                              className={`check${sel ? ' done' : ''}`}
                              style={sel ? { borderColor: c?.color, background: c?.color } : {}}
                            >
                              {sel && <span style={{ fontSize: 9, color: 'white' }}>✓</span>}
                            </div>
                            <span className="dot" style={{ background: c?.color || 'gray', width: 6, height: 6, borderRadius: '50%', flexShrink: 0 }} />
                            <span style={{ fontSize: 12, flex: 1 }}>{t.title}</span>
                            {t.completed && <span style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>done</span>}
                          </div>
                        );
                      })}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* Meta info */}
          <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 10, display: 'flex', gap: 14 }}>
            <span>Created {new Date(task.createdAt).toLocaleDateString()}</span>
            {task.actualDuration != null && (
              <span>
                Actual time: {task.actualDuration >= 60
                  ? `${(task.actualDuration / 60).toFixed(1)}h`
                  : `${task.actualDuration}m`}
              </span>
            )}
          </div>

          {/* Delete zone */}
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12, marginTop: 4 }}>
            {!confirmDelete ? (
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => setConfirmDelete(true)}
                style={{ color: 'hsl(0, 72%, 62%)' }}
              >
                Delete task
              </button>
            ) : (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 13, color: 'hsl(0, 72%, 62%)' }}>Delete permanently?</span>
                <button className="btn btn-ghost btn-sm" onClick={() => setConfirmDelete(false)}>Cancel</button>
                <button
                  className="btn btn-sm"
                  onClick={handleDelete}
                  style={{ background: 'hsl(0,72%,62%)', color: 'white', border: 'none' }}
                >Delete</button>
              </div>
            )}
          </div>

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={close}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSave}>Save changes</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Merge Review Modal ───────────────────────────────────────────────────────
// Shown after an auto-merge in case C. The merge is already applied and pushed;
// this modal is informational with escape hatches to revert if something looks wrong.

export function ConflictResolutionModal() {
  const conflict = useStore((s) => s.conflictState);
  const setConflictState = useStore((s) => s.setConflictState);
  const [reverting, setReverting] = useState(false);

  if (!conflict) return null;

  const info = conflict.mergeInfo;
  const remoteVersion = (conflict.remote.version as number) ?? '?';

  const handleRevert = async (choice: 'local' | 'remote') => {
    setReverting(true);
    await resolveConflict(choice);
    setReverting(false);
  };

  const mergeLines: string[] = [];
  if (info) {
    if (info.cloudTasksAdded > 0)
      mergeLines.push(`${info.cloudTasksAdded} task${info.cloudTasksAdded !== 1 ? 's' : ''} from cloud`);
    if (info.localTasksAdded > 0)
      mergeLines.push(`${info.localTasksAdded} offline task${info.localTasksAdded !== 1 ? 's' : ''} you created`);
    if (info.completionsFromLocal > 0)
      mergeLines.push(`${info.completionsFromLocal} offline completion${info.completionsFromLocal !== 1 ? 's' : ''}`);
    if (info.categoriesFromLocal > 0)
      mergeLines.push(`${info.categoriesFromLocal} offline categor${info.categoriesFromLocal !== 1 ? 'ies' : 'y'}`);
    if (info.blocksFromLocal > 0)
      mergeLines.push(`${info.blocksFromLocal} offline block${info.blocksFromLocal !== 1 ? 's' : ''}`);
  }

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => setConflictState(null)}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          style={{ maxWidth: 460 }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
            <span style={{
              width: 10, height: 10, borderRadius: '50%', flexShrink: 0,
              background: 'hsl(140, 60%, 50%)', boxShadow: '0 0 8px hsl(140,60%,50%)',
            }} />
            <h2 style={{ margin: 0 }}>Offline changes merged</h2>
          </div>

          <p style={{ color: 'var(--text-secondary)', fontSize: 14, marginBottom: mergeLines.length ? 12 : 16 }}>
            This device had offline edits while the cloud (v{remoteVersion}) received new
            updates. Both were automatically merged and pushed to cloud.
          </p>

          {mergeLines.length > 0 && (
            <div style={{
              background: 'var(--surface-2)', borderRadius: 8,
              padding: '10px 14px', marginBottom: 16, fontSize: 13,
            }}>
              <div style={{ fontWeight: 600, marginBottom: 6 }}>What was combined:</div>
              <ul style={{ margin: 0, paddingLeft: 18 }}>
                {mergeLines.map((line, i) => <li key={i}>{line}</li>)}
              </ul>
            </div>
          )}

          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 16 }}>
            If the result doesn't look right, use the escape hatches below to revert
            to either snapshot — the discarded copy will be overwritten.
          </div>

          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleRevert('remote')}
                disabled={reverting}
                style={{ fontSize: 12 }}
              >
                Revert to cloud only
              </button>
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => handleRevert('local')}
                disabled={reverting}
                style={{ fontSize: 12 }}
              >
                Revert to local only
              </button>
            </div>
            <button
              className="btn btn-primary"
              onClick={() => setConflictState(null)}
              disabled={reverting}
            >
              {reverting ? 'Reverting…' : 'Looks good'}
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Archived Task Warning Modal ─────────────────────────────────────────────

export function ArchivedTaskWarningModal({ taskId, onConfirm, onCancel }: { taskId: string; onConfirm: () => void; onCancel: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const timeBlocks = useStore((s) => s.timeBlocks);

  const task = tasks[taskId];
  const block = Object.values(timeBlocks).find(b => b.taskIds.includes(taskId));

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onCancel}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 420 }}
        >
          <h2 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span>⚠️</span>
            Archived Time Block
          </h2>

          <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
            This task is in <strong>"{block?.name}"</strong> which ended on{' '}
            <strong>{block ? new Date(block.endDate).toLocaleDateString() : 'unknown date'}</strong>.
          </p>

          <div style={{
            padding: 16,
            background: 'var(--bg-tertiary)',
            borderRadius: 'var(--radius-sm)',
            border: '1px solid var(--border)',
            marginBottom: 20,
            fontSize: 13,
          }}>
            <strong>BlockOut works best when you:</strong>
            <ul style={{ margin: '8px 0 0 20px', padding: 0 }}>
              <li>Set realistic deadlines</li>
              <li>Review and complete tasks before the block ends</li>
              <li>Use time blocks to create urgency and focus</li>
            </ul>
          </div>

          <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 20 }}>
            You can still complete and edit this task, but consider creating new time blocks for better organization.
          </p>

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onCancel}>Cancel</button>
            <button className="btn btn-primary" onClick={onConfirm}>
              Continue Anyway
            </button>
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

  const [syncProvider, setSyncProvider] = useState<'self-hosted' | 'dropbox'>(() => {
    // Default to Dropbox unless self-hosted is already configured
    const cfg = getCloudConfig();
    if (cfg.url) return 'self-hosted';
    return 'dropbox';
  });

  // Self-hosted state
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
    if (syncProvider === 'self-hosted') {
      setCloudConfig(url, token);
      clearDropboxConfig();
    } else {
      // Dropbox is configured via OAuth, not manual token
      setCloudConfig('', '');
    }
    setSyncSettingsOpen(false);
  };

  const handleTestAndSync = async () => {
    setTesting(true);
    setTestResult(null);
    
    try {
      setSyncStatus('syncing');
      
      if (syncProvider === 'self-hosted') {
        setCloudConfig(url, token);
        await saveToCloud();
      } else {
        const data = useStore.getState().getSerializableState();
        await syncToDropbox(data);
      }
      
      setTestResult('ok');
      setLastSynced(Date.now());
    } catch (err) {
      console.error('Sync error:', err);
      setTestResult('fail');
      setSyncStatus('error');
    } finally {
      setTesting(false);
    }
  };

  const handleDisconnect = () => {
    if (syncProvider === 'self-hosted') {
      setCloudConfig('', '');
      setUrl('');
      setToken('');
    } else {
      clearDropboxConfig();
    }
    setSyncSettingsOpen(false);
  };

  const isConfigured = syncProvider === 'self-hosted' 
    ? url.trim().length > 0 
    : isDropboxConfigured();

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

          {/* Provider Selection */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              className={`btn ${syncProvider === 'dropbox' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSyncProvider('dropbox')}
            >
              Dropbox
            </button>
            <button
              className={`btn ${syncProvider === 'self-hosted' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setSyncProvider('self-hosted')}
            >
              Self-Hosted
            </button>
          </div>

          {syncProvider === 'self-hosted' ? (
            <>
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
            </>
          ) : (
            <>
              {isDropboxConfigured() ? (
                <div style={{ 
                  padding: 16, 
                  background: 'var(--bg-tertiary)', 
                  borderRadius: 'var(--radius-sm)',
                  textAlign: 'center' 
                }}>
                  <div style={{ fontSize: 14, marginBottom: 8 }}>
                     Connected to Dropbox
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Your data will sync automatically to your Dropbox account
                  </div>
                </div>
              ) : (
                <>
                  <div className="modal-field">
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 16 }}>
                      <strong>Connect with Dropbox:</strong>
                      <ol style={{ margin: '8px 0', paddingLeft: 20 }}>
                        <li>You'll be redirected to Dropbox to authorize this app</li>
                        <li>We only access a single folder (/Apps/BlockOut)</li>
                        <li>No data is stored on our servers - everything stays in your Dropbox</li>
                      </ol>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={startDropboxAuth}
                      style={{ width: '100%' }}
                    >
                      Connect to Dropbox
                    </button>
                  </div>

                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 16 }}>
                    Don't have a Dropbox account?{' '}
                    <a 
                      href="https://www.dropbox.com/register" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      style={{ color: 'var(--accent)' }}
                    >
                      Sign up here
                    </a>
                  </div>
                </>
              )}
            </>
          )}

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
            {isConfigured && (
              <>
                <button
                  className="btn btn-ghost"
                  onClick={handleTestAndSync}
                  disabled={testing}
                >
                  {testing ? 'Testing…' : 'Test & sync now'}
                </button>
                <button 
                  className="btn btn-danger" 
                  onClick={handleDisconnect}
                >
                  Disconnect
                </button>
              </>
            )}
            <button className="btn btn-primary" onClick={handleSave}>Save</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Export/Import Modal ────────────────────────────────────────────────────

export function ExportImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [activeTab, setActiveTab] = useState<'export' | 'import'>('export');
  const [exportType, setExportType] = useState<'full' | 'tasks_only' | 'analytics_only'>('full');
  const [importError, setImportError] = useState<string | null>(null);
  const [importSuccess, setImportSuccess] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const pomodoro = useStore((s) => s.pomodoro);

  const taskCount = Object.keys(tasks).length;
  const categoryCount = Object.keys(categories).length;
  const blockCount = Object.keys(timeBlocks).length;
  const pomodoroSessions = pomodoro.sessions.length;
  const totalPomodoroMinutes = Math.round(
    pomodoro.sessions
      .filter((s) => s.mode === 'work')
      .reduce((acc, s) => acc + (s.endTime - s.startTime) / 60000, 0)
  );

  const handleExport = async () => {
    await exportToFile(exportType);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImportError(null);
    setImportSuccess(null);

    const result = await importFromFile(file);
    if (result.success) {
      setImportSuccess(`Successfully imported ${result.imported?.taskCount || 0} tasks, ${result.imported?.categoryCount || 0} categories, ${result.imported?.blockCount || 0} blocks`);
      debouncedSave();
    } else {
      setImportError(result.error || 'Import failed');
    }
  };

  if (!open) return null;

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
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Export & Import</h2>

          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              className={`btn ${activeTab === 'export' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('export')}
            >
              Export
            </button>
            <button
              className={`btn ${activeTab === 'import' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('import')}
            >
              Import
            </button>
          </div>

          {activeTab === 'export' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <label style={{ display: 'block', marginBottom: 8, fontSize: 13, color: 'var(--text-secondary)' }}>
                  Export Type
                </label>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="exportType"
                      checked={exportType === 'full'}
                      onChange={() => setExportType('full')}
                    />
                    <span>Full Export (Everything)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="exportType"
                      checked={exportType === 'tasks_only'}
                      onChange={() => setExportType('tasks_only')}
                    />
                    <span>Tasks Only (No analytics)</span>
                  </label>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                    <input
                      type="radio"
                      name="exportType"
                      checked={exportType === 'analytics_only'}
                      onChange={() => setExportType('analytics_only')}
                    />
                    <span>Analytics Only</span>
                  </label>
                </div>
              </div>

              <div style={{ 
                background: 'var(--bg-tertiary)', 
                padding: 16, 
                borderRadius: 8, 
                marginBottom: 20,
                fontSize: 13 
              }}>
                <div style={{ marginBottom: 8, fontWeight: 600 }}>Current Data:</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div>{taskCount} tasks</div>
                  <div>{categoryCount} categories</div>
                  <div>{blockCount} time blocks</div>
                  <div>{pomodoroSessions} pomodoro sessions</div>
                  <div>{totalPomodoroMinutes}m focused</div>
                  <div>All data is JSON</div>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                <button className="btn btn-primary" onClick={handleExport}>
                  Export to JSON
                </button>
              </div>
            </>
          )}

          {activeTab === 'import' && (
            <>
              <div style={{ marginBottom: 20 }}>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16 }}>
                  Import a previously exported BlockOut JSON file. This will merge with your current data.
                </p>

                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json"
                  onChange={handleFileSelect}
                  style={{ display: 'none' }}
                />

                <button
                  className="btn btn-primary"
                  onClick={() => fileInputRef.current?.click()}
                  style={{ width: '100%', marginBottom: 16 }}
                >
                  Select JSON File
                </button>

                {importError && (
              <div style={{ 
                padding: 12, 
                background: 'hsla(0, 72%, 62%, 0.1)', 
                border: '1px solid hsla(0, 72%, 62%, 0.3)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 20,
                fontSize: 13,
                color: 'hsl(0, 72%, 62%)'
              }}>
                This action cannot be undone.
              </div>
                )}

                {importSuccess && (
                  <div style={{ 
                    padding: 12, 
                    background: 'hsla(140, 60%, 50%, 0.1)', 
                    border: '1px solid hsla(140, 60%, 50%, 0.3)',
                    borderRadius: 6,
                    color: 'hsl(140, 60%, 50%)',
                    fontSize: 13,
                    marginBottom: 16
                  }}>
                    {importSuccess}
                  </div>
                )}
              </div>

              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={onClose}>Close</button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Block Settings Modal ────────────────────────────────────────────────────

export function BlockSettingsModal({ blockId, onClose }: { blockId: string; onClose: () => void }) {
  const timeBlocks = useStore((s) => s.timeBlocks);
  const deleteTimeBlock = useStore((s) => s.deleteTimeBlock);
  const renameTimeBlock = useStore((s) => s.renameTimeBlock);
  const setActiveBlock = useStore((s) => s.setActiveBlock);
  const activeBlockId = useStore((s) => s.activeBlockId);

  const block = timeBlocks[blockId];
  const [name, setName] = useState(block?.name ?? '');
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  if (!block) return null;

  const handleSave = () => {
    if (name.trim() && name !== block.name) {
      renameTimeBlock(blockId, name.trim());
      debouncedSave();
    }
    onClose();
  };

  const handleDelete = () => {
    deleteTimeBlock(blockId);
    if (activeBlockId === blockId) {
      setActiveBlock(null);
    }
    debouncedSave();
    onClose();
  };

  const isArchived = block.endDate <= Date.now();

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
          {!showDeleteConfirm ? (
            <>
              <h2>Block Settings</h2>
              
              <div className="modal-field">
                <label>Block Name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. 6 Week Placement"
                  autoFocus
                />
              </div>

              <div style={{ 
                padding: 12, 
                background: 'var(--bg-tertiary)', 
                borderRadius: 'var(--radius-sm)',
                marginBottom: 20,
                fontSize: 13
              }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Start Date:</span>
                  <span>{new Date(block.startDate).toLocaleDateString()}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--text-secondary)' }}>End Date:</span>
                  <span style={{ color: isArchived ? 'hsl(0, 72%, 62%)' : 'inherit' }}>
                    {new Date(block.endDate).toLocaleDateString()}
                    {isArchived && ' (Archived)'}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
                  <span style={{ color: 'var(--text-secondary)' }}>Tasks:</span>
                  <span>{block.taskIds.length}</span>
                </div>
              </div>

              <div className="modal-actions">
                <button className="btn btn-danger" onClick={() => setShowDeleteConfirm(true)}>
                  Delete Block
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={onClose}>Cancel</button>
                  <button className="btn btn-primary" onClick={handleSave}>
                    Save Changes
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ color: 'hsl(0, 72%, 62%)' }}>Delete Block?</h2>
              
              <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                This will permanently delete <strong>"{block.name}"</strong> and remove all 
                {block.taskIds.length} task assignments. The tasks themselves will remain in your pool.
              </p>

              <div style={{ 
                padding: 12, 
                background: 'hsla(0, 72%, 62%, 0.1)', 
                border: '1px solid hsla(0, 72%, 62%, 0.3)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 20,
                fontSize: 13,
                color: 'hsl(0, 72%, 62%)'
              }}>
                ⚠️ This action cannot be undone.
              </div>

              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowDeleteConfirm(false)}>
                  Cancel
                </button>
                <button className="btn btn-danger" onClick={handleDelete}>
                  Yes, Delete Block
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Bulk Operations Modal ───────────────────────────────────────────────────
// Shows when multiple tasks are selected in the treemap

export function BulkOperationsModal({ 
  open, 
  onClose 
}: { 
  open: boolean; 
  onClose: () => void;
}) {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const selectedTaskIds = useStore((s) => s.selectedTaskIds);
  const clearTaskSelection = useStore((s) => s.clearTaskSelection);
  const bulkMoveTasksToCategory = useStore((s) => s.bulkMoveTasksToCategory);
  const bulkDeleteTasks = useStore((s) => s.bulkDeleteTasks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const bulkAssignTasksToBlock = useStore((s) => s.bulkAssignTasksToBlock);
  const removeTaskFromBlock = useStore((s) => s.removeTaskFromBlock);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'fromBlock' | 'entirely'>('entirely');

  const selectedTasks = selectedTaskIds.map(id => tasks[id]).filter(Boolean);
  const selectedCount = selectedTasks.length;

  if (!open || selectedCount === 0) return null;

  const handleMoveToCategory = (categoryId: string, subcategoryId?: string) => {
    bulkMoveTasksToCategory(selectedTaskIds, categoryId, subcategoryId);
    debouncedSave();
    clearTaskSelection();
    onClose();
  };

  const handleDelete = () => {
    if (deleteMode === 'fromBlock' && activeBlockId) {
      // Remove from current block only
      selectedTaskIds.forEach(taskId => {
        removeTaskFromBlock(taskId, activeBlockId);
      });
    } else {
      // Delete entirely
      bulkDeleteTasks(selectedTaskIds);
    }
    debouncedSave();
    clearTaskSelection();
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleAssignToBlock = (blockId: string) => {
    bulkAssignTasksToBlock(selectedTaskIds, blockId);
    debouncedSave();
    clearTaskSelection();
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
          style={{ maxWidth: 500 }}
        >
          {!showDeleteConfirm ? (
            <>
              <h2>{selectedCount} Task{selectedCount !== 1 ? 's' : ''} Selected</h2>
              
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 12 }}>
                  <strong>Selected tasks:</strong>
                </div>
                <div style={{ 
                  maxHeight: 120, 
                  overflow: 'auto',
                  padding: 8,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  fontSize: 13
                }}>
                  {selectedTasks.map(task => (
                    <div key={task.id} style={{ padding: '2px 0' }}>
                      {task.title}
                    </div>
                  ))}
                </div>
              </div>

              {/* Move to Category Section */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  <strong>Move to Category:</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {Object.values(categories).map(cat => (
                    <div key={cat.id}>
                      <button
                        className="btn btn-ghost btn-sm"
                        onClick={() => handleMoveToCategory(cat.id)}
                        style={{ 
                          width: '100%', 
                          justifyContent: 'flex-start',
                          borderLeft: `3px solid ${cat.color}`
                        }}
                      >
                        {cat.name}
                      </button>
                      {cat.subcategories.length > 0 && (
                        <div style={{ paddingLeft: 20, marginTop: 4 }}>
                          {cat.subcategories.map(sub => (
                            <button
                              key={sub.id}
                              className="btn btn-ghost btn-sm"
                              onClick={() => handleMoveToCategory(cat.id, sub.id)}
                              style={{ 
                                width: '100%', 
                                justifyContent: 'flex-start',
                                fontSize: 12
                              }}
                            >
                              └ {sub.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Assign to Block Section */}
              {Object.values(timeBlocks).length > 0 && (
                <div style={{ marginBottom: 20 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    <strong>Assign to Time Block:</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.values(timeBlocks)
                      .filter(b => b.endDate > Date.now())
                      .map(block => (
                        <button
                          key={block.id}
                          className="btn btn-ghost btn-sm"
                          onClick={() => handleAssignToBlock(block.id)}
                        >
                          {block.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              <div className="modal-actions">
                <button 
                  className="btn btn-danger" 
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  Delete…
                </button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button 
                    className="btn btn-ghost" 
                    onClick={() => {
                      clearTaskSelection();
                      onClose();
                    }}
                  >
                    Clear Selection
                  </button>
                  <button className="btn btn-primary" onClick={onClose}>
                    Done
                  </button>
                </div>
              </div>
            </>
          ) : (
            <>
              <h2 style={{ color: 'hsl(0, 72%, 62%)' }}>Delete Tasks?</h2>
              
              <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
                How would you like to delete these {selectedCount} selected task{selectedCount !== 1 ? 's' : ''}?
              </p>

              {activeBlockId && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    gap: 8,
                    padding: 12,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    cursor: 'pointer',
                    marginBottom: 8
                  }}>
                    <input
                      type="radio"
                      name="deleteMode"
                      checked={deleteMode === 'fromBlock'}
                      onChange={() => setDeleteMode('fromBlock')}
                    />
                    <div>
                      <div style={{ fontWeight: 600 }}>Remove from this block only</div>
                      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                        Tasks will remain in your pool and other blocks
                      </div>
                    </div>
                  </label>
                </div>
              )}

              <div style={{ marginBottom: 20 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8,
                  padding: 12,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer'
                }}>
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === 'entirely'}
                    onChange={() => setDeleteMode('entirely')}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Delete entirely</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Tasks will be permanently deleted from all blocks
                    </div>
                  </div>
                </label>
              </div>

              <div style={{ 
                padding: 12, 
                background: 'hsla(0, 72%, 62%, 0.1)', 
                border: '1px solid hsla(0, 72%, 62%, 0.3)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 20,
                fontSize: 13,
                color: 'hsl(0, 72%, 62%)'
              }}>
                ⚠️ This action cannot be undone.
              </div>

              <div className="modal-actions">
                <button 
                  className="btn btn-ghost" 
                  onClick={() => setShowDeleteConfirm(false)}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-danger" 
                  onClick={handleDelete}
                >
                  Delete {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ─── Unified Task Context Menu ───────────────────────────────────────────────
// Shows on right-click with both individual task actions and bulk operations

export function UnifiedTaskContextMenu({
  open,
  onClose,
  taskId,
  x,
  y,
}: {
  open: boolean;
  onClose: () => void;
  taskId: string;
  x: number;
  y: number;
}) {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const selectedTaskIds = useStore((s) => s.selectedTaskIds);
  const clearTaskSelection = useStore((s) => s.clearTaskSelection);
  const setEditingTaskId = useStore((s) => s.setEditingTaskId);
  const toggleTask = useStore((s) => s.toggleTask);
  const deleteTask = useStore((s) => s.deleteTask);
  const bulkMoveTasksToCategory = useStore((s) => s.bulkMoveTasksToCategory);
  const bulkDeleteTasks = useStore((s) => s.bulkDeleteTasks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const bulkAssignTasksToBlock = useStore((s) => s.bulkAssignTasksToBlock);
  const removeTaskFromBlock = useStore((s) => s.removeTaskFromBlock);
  const setShowNewTaskModal = useStore((s) => s.setShowNewTaskModal);

  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteMode, setDeleteMode] = useState<'fromBlock' | 'entirely'>('entirely');
  const [showBulkDeleteConfirm, setShowBulkDeleteConfirm] = useState(false);

  const task = tasks[taskId];
  const allSelectedIds = selectedTaskIds.length > 0 ? selectedTaskIds : [taskId];
  const selectedTasks = allSelectedIds.map(id => tasks[id]).filter(Boolean);
  const selectedCount = selectedTasks.length;
  const isMultiSelect = selectedTaskIds.length > 1;

  // Check if task is in an archived block
  const archivedBlock = Object.values(timeBlocks).find(b => 
    b.endDate <= Date.now() && b.taskIds.includes(taskId)
  );
  const isArchived = !!archivedBlock;

  if (!open || !task) return null;

  const handleEdit = () => {
    setEditingTaskId(taskId);
    onClose();
  };

  const handleToggleComplete = () => {
    toggleTask(taskId);
    debouncedSave();
    onClose();
  };

  const handleDeleteSingle = () => {
    if (deleteMode === 'fromBlock' && activeBlockId) {
      removeTaskFromBlock(taskId, activeBlockId);
    } else {
      deleteTask(taskId);
    }
    debouncedSave();
    setShowDeleteConfirm(false);
    onClose();
  };

  const handleBulkMoveToCategory = (categoryId: string, subcategoryId?: string) => {
    bulkMoveTasksToCategory(allSelectedIds, categoryId, subcategoryId);
    debouncedSave();
    clearTaskSelection();
    onClose();
  };

  const handleBulkDelete = () => {
    if (deleteMode === 'fromBlock' && activeBlockId) {
      allSelectedIds.forEach(id => {
        removeTaskFromBlock(id, activeBlockId);
      });
    } else {
      bulkDeleteTasks(allSelectedIds);
    }
    debouncedSave();
    clearTaskSelection();
    setShowBulkDeleteConfirm(false);
    onClose();
  };

  const handleBulkAssignToBlock = (blockId: string) => {
    bulkAssignTasksToBlock(allSelectedIds, blockId);
    debouncedSave();
    clearTaskSelection();
    onClose();
  };

  // Calculate position to keep menu on screen
  const menuWidth = 640;
  const menuHeight = 500;
  const adjustedX = Math.min(x, window.innerWidth - menuWidth - 20);
  const adjustedY = Math.min(y, window.innerHeight - menuHeight - 20);

  if (showDeleteConfirm) {
    return (
      <AnimatePresence>
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowDeleteConfirm(false)}
          style={{ zIndex: 1001 }}
        >
          <motion.div
            className="modal"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 420 }}
          >
            <h2 style={{ color: 'hsl(0, 72%, 62%)' }}>Delete Task?</h2>
            
            <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              How would you like to delete <strong>"{task.title}"</strong>?
            </p>

            {activeBlockId && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8,
                  padding: 12,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  marginBottom: 8
                }}>
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === 'fromBlock'}
                    onChange={() => setDeleteMode('fromBlock')}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Remove from this block only</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Task will remain in your pool and other blocks
                    </div>
                  </div>
                </label>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                padding: 12,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer'
              }}>
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === 'entirely'}
                  onChange={() => setDeleteMode('entirely')}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Delete entirely</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Task will be permanently deleted from all blocks
                  </div>
                </div>
              </label>
            </div>

            <div style={{ 
              padding: 12, 
              background: 'hsla(0, 72%, 62%, 0.1)', 
              border: '1px solid hsla(0, 72%, 62%, 0.3)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 20,
              fontSize: 13,
              color: 'hsl(0, 72%, 62%)'
            }}>
              This action cannot be undone.
            </div>

            <div className="modal-actions">
              <button 
                className="btn btn-ghost" 
                onClick={() => setShowDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleDeleteSingle}
              >
                Delete Task
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  if (showBulkDeleteConfirm) {
    return (
      <AnimatePresence>
        <motion.div
          className="modal-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={() => setShowBulkDeleteConfirm(false)}
          style={{ zIndex: 1001 }}
        >
          <motion.div
            className="modal"
            initial={{ scale: 0.92, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 20 }}
            transition={{ type: 'spring', damping: 28, stiffness: 380 }}
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: 500 }}
          >
            <h2 style={{ color: 'hsl(0, 72%, 62%)' }}>Delete {selectedCount} Tasks?</h2>
            
            <p style={{ fontSize: 14, lineHeight: 1.6, marginBottom: 20 }}>
              How would you like to delete these {selectedCount} selected tasks?
            </p>

            {activeBlockId && (
              <div style={{ marginBottom: 16 }}>
                <label style={{ 
                  display: 'flex', 
                  alignItems: 'center', 
                  gap: 8,
                  padding: 12,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 'var(--radius-sm)',
                  cursor: 'pointer',
                  marginBottom: 8
                }}>
                  <input
                    type="radio"
                    name="deleteMode"
                    checked={deleteMode === 'fromBlock'}
                    onChange={() => setDeleteMode('fromBlock')}
                  />
                  <div>
                    <div style={{ fontWeight: 600 }}>Remove from this block only</div>
                    <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                      Tasks will remain in your pool and other blocks
                    </div>
                  </div>
                </label>
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8,
                padding: 12,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer'
              }}>
                <input
                  type="radio"
                  name="deleteMode"
                  checked={deleteMode === 'entirely'}
                  onChange={() => setDeleteMode('entirely')}
                />
                <div>
                  <div style={{ fontWeight: 600 }}>Delete entirely</div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                    Tasks will be permanently deleted from all blocks
                  </div>
                </div>
              </label>
            </div>

            <div style={{ 
              padding: 12, 
              background: 'hsla(0, 72%, 62%, 0.1)', 
              border: '1px solid hsla(0, 72%, 62%, 0.3)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 20,
              fontSize: 13,
              color: 'hsl(0, 72%, 62%)'
            }}>
              This action cannot be undone.
            </div>

            <div className="modal-actions">
              <button 
                className="btn btn-ghost" 
                onClick={() => setShowBulkDeleteConfirm(false)}
              >
                Cancel
              </button>
              <button 
                className="btn btn-danger" 
                onClick={handleBulkDelete}
              >
                Delete {selectedCount} Tasks
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
        style={{ 
          zIndex: 1000,
          alignItems: 'flex-start',
          paddingTop: adjustedY,
          paddingLeft: adjustedX,
          justifyContent: 'flex-start'
        }}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
          style={{ 
            maxWidth: 640,
            margin: 0,
            maxHeight: '80vh',
            overflow: 'auto'
          }}
        >
          {isArchived && (
            <div style={{
              padding: 12,
              background: 'hsla(30, 70%, 50%, 0.1)',
              border: '1px solid hsla(30, 70%, 50%, 0.3)',
              borderRadius: 'var(--radius-sm)',
              marginBottom: 16,
              fontSize: 13,
              color: 'hsl(30, 70%, 50%)'
            }}>
              <strong>Archived Task</strong>
              <br />
              This task is in "{archivedBlock?.name}" which ended on {new Date(archivedBlock!.endDate).toLocaleDateString()}.
              <br />
              You can still move it to a new block, but editing details requires restoring the time block.
            </div>
          )}

          <div style={{ display: 'flex', gap: 24 }}>
            {/* Left Panel - Individual Task Actions */}
            <div style={{ flex: 1, minWidth: 240 }}>
              <h3 style={{ 
                fontSize: 14, 
                color: 'var(--text-secondary)', 
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}>
                This Task
              </h3>
              
              <div style={{ 
                padding: 12, 
                background: 'var(--bg-tertiary)', 
                borderRadius: 'var(--radius-sm)',
                marginBottom: 16
              }}>
                <div style={{ fontWeight: 600, marginBottom: 4 }}>{task.title}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  {categories[task.categoryId]?.name}
                  {task.subcategoryId && ` › ${categories[task.categoryId]?.subcategories.find(s => s.id === task.subcategoryId)?.name}`}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button 
                  className="btn btn-primary btn-sm"
                  onClick={handleEdit}
                >
                  ✎ Edit Task
                </button>
                
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={handleToggleComplete}
                >
                  {task.completed ? '↩ Mark Incomplete' : '✓ Mark Complete'}
                </button>
                
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    // Duplicate task
                    setShowNewTaskModal(true);
                    onClose();
                  }}
                >
                  ⧉ Duplicate
                </button>
                
                <div style={{ borderTop: '1px solid var(--border)', margin: '8px 0' }} />
                
                <button 
                  className="btn btn-danger btn-sm"
                  onClick={() => setShowDeleteConfirm(true)}
                >
                  🗑 Delete Task…
                </button>
              </div>
            </div>

            {/* Right Panel - Bulk Operations */}
            <div style={{ flex: 1.5, minWidth: 320, borderLeft: '1px solid var(--border)', paddingLeft: 24 }}>
              <h3 style={{ 
                fontSize: 14, 
                color: 'var(--text-secondary)', 
                marginBottom: 12,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}>
                {isMultiSelect ? `${selectedCount} Selected Tasks` : 'Selected Task'}
              </h3>

              {/* Selected Tasks List */}
              <div style={{ 
                maxHeight: 100, 
                overflow: 'auto',
                padding: 8,
                background: 'var(--bg-tertiary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 13,
                marginBottom: 16
              }}>
                {selectedTasks.map(t => (
                  <div key={t.id} style={{ padding: '2px 0' }}>
                    {t.title}
                  </div>
                ))}
              </div>

              {/* Move to Category */}
              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                  <strong>Move to Category:</strong>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflow: 'auto' }}>
                  {Object.values(categories).map(cat => (
                    <div key={cat.id}>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={() => handleBulkMoveToCategory(cat.id)}
                        style={{ 
                          width: '100%', 
                          justifyContent: 'flex-start',
                          borderLeft: `3px solid ${cat.color}`,
                          fontSize: 12
                        }}
                      >
                        {cat.name}
                      </button>
                      {cat.subcategories.length > 0 && (
                        <div style={{ paddingLeft: 16 }}>
                          {cat.subcategories.map(sub => (
                            <button
                              key={sub.id}
                              className="btn btn-ghost btn-xs"
                              onClick={() => handleBulkMoveToCategory(cat.id, sub.id)}
                              style={{ 
                                width: '100%', 
                                justifyContent: 'flex-start',
                                fontSize: 11,
                                padding: '4px 8px'
                              }}
                            >
                              └ {sub.name}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              {/* Assign to Block */}
              {Object.values(timeBlocks).filter(b => b.endDate > Date.now()).length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 8 }}>
                    <strong>Assign to Time Block:</strong>
                  </div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    {Object.values(timeBlocks)
                      .filter(b => b.endDate > Date.now())
                      .map(block => (
                        <button
                          key={block.id}
                          className="btn btn-ghost btn-xs"
                          onClick={() => handleBulkAssignToBlock(block.id)}
                        >
                          {block.name}
                        </button>
                      ))}
                  </div>
                </div>
              )}

              {/* Bulk Delete */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                <button 
                  className="btn btn-danger btn-sm"
                  onClick={() => setShowBulkDeleteConfirm(true)}
                  style={{ width: '100%' }}
                >
                  {isMultiSelect ? `Delete ${selectedCount} Tasks…` : 'Delete Task…'}
                </button>
              </div>
            </div>
          </div>

          <div style={{ 
            borderTop: '1px solid var(--border)', 
            marginTop: 16, 
            paddingTop: 12,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <button 
              className="btn btn-ghost btn-sm" 
              onClick={() => {
                clearTaskSelection();
                onClose();
              }}
            >
              Clear Selection
            </button>
            <button className="btn btn-ghost btn-sm" onClick={onClose}>
              Done
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
