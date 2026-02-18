import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { debouncedSave } from '../utils/persistence';

// New Time Block Modal
export function NewBlockModal() {
  const show = useStore((s) => s.showNewBlockModal);
  const setShow = useStore((s) => s.setShowNewBlockModal);
  const addTimeBlock = useStore((s) => s.addTimeBlock);

  const [name, setName] = useState('');
  const [weeks, setWeeks] = useState(6);

  if (!show) return null;

  const handleCreate = () => {
    if (!name.trim()) return;
    const now = Date.now();
    addTimeBlock({
      name: name.trim(),
      startDate: now,
      endDate: now + weeks * 7 * 24 * 60 * 60 * 1000,
    });
    debouncedSave();
    setName('');
    setWeeks(6);
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
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
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
            <label>Duration (weeks)</label>
            <input
              type="number"
              value={weeks}
              onChange={(e) => setWeeks(parseInt(e.target.value) || 1)}
              min={1}
              max={52}
            />
          </div>
          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={() => setShow(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleCreate}>Create Block</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// New Category Modal
export function NewCategoryModal() {
  const show = useStore((s) => s.showNewCategoryModal);
  const setShow = useStore((s) => s.setShowNewCategoryModal);
  const addCategory = useStore((s) => s.addCategory);

  const [name, setName] = useState('');

  if (!show) return null;

  const handleCreate = () => {
    if (!name.trim()) return;
    addCategory(name.trim());
    debouncedSave();
    setName('');
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
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
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
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            />
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

// New Task Modal
export function NewTaskModal() {
  const show = useStore((s) => s.showNewTaskModal);
  const setShow = useStore((s) => s.setShowNewTaskModal);
  const categories = useStore((s) => s.categories);
  const addTask = useStore((s) => s.addTask);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const assignTaskToBlock = useStore((s) => s.assignTaskToBlock);

  const [title, setTitle] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [weight, setWeight] = useState(1);
  const [assignToBlock, setAssignToBlock] = useState(true);

  const catList = useMemo(() => Object.values(categories), [categories]);

  if (!show) return null;

  const handleCreate = () => {
    if (!title.trim() || !categoryId) return;
    const taskId = addTask({
      title: title.trim(),
      categoryId,
      weight,
    });
    if (assignToBlock && activeBlockId) {
      assignTaskToBlock(taskId, activeBlockId);
    }
    debouncedSave();
    setTitle('');
    setWeight(1);
    // Don't close — allow rapid task entry
  };

  const handleClose = () => {
    setTitle('');
    setCategoryId('');
    setWeight(1);
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
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 400 }}
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
            <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
              <option value="">Select category...</option>
              {catList.map((cat) => (
                <option key={cat.id} value={cat.id}>{cat.name}</option>
              ))}
            </select>
          </div>
          <div className="modal-field">
            <label>Weight (effort: 1-5)</label>
            <input
              type="number"
              value={weight}
              onChange={(e) => setWeight(Math.max(1, Math.min(5, parseInt(e.target.value) || 1)))}
              min={1}
              max={5}
            />
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2 }}>
              Larger weight = bigger tile on the treemap
            </p>
          </div>
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

// Task assignment modal — for assigning pool tasks to a block
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
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 400 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Assign Tasks to {block.name}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-tertiary)', marginBottom: 12 }}>
          Pull tasks from your pool into this time block.
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
                  {assignedSet.has(task.id) && <span style={{ fontSize: 10, color: 'white' }}>✓</span>}
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
