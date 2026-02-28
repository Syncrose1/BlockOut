import { useState, useCallback, useMemo } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { debouncedSave } from '../utils/persistence';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const START_HOUR = 6;
const END_HOUR = 23;

type BlockType = 'placeholder' | 'main-task' | 'chain-task';

interface ScheduleBlock {
  id: string;
  dayIndex: number;
  startSlot: number;
  endSlot: number;
  type: BlockType;
  name: string;
  taskId?: string;
  chainTaskId?: string;
}

function generateTimeSlots() {
  const slots = [];
  for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      slots.push({
        hour,
        minute,
        label: `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`,
      });
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

function getDateForDayIndex(dayIndex: number): string {
  const today = new Date();
  const currentDay = today.getDay();
  const diff = dayIndex - (currentDay === 0 ? 6 : currentDay - 1);
  const targetDate = new Date(today);
  targetDate.setDate(today.getDate() + diff);
  return targetDate.toISOString().slice(0, 10);
}

export function Overview() {
  const store = useStore();
  const tasks = store.tasks;
  const categories = store.categories;
  const taskChains = store.taskChains;
  const chainTasks = store.chainTasks;
  const addChainTask = store.addChainTask;
  const addRealTaskToChain = store.addRealTaskToChain;
  
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [createEnd, setCreateEnd] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<{ dayIndex: number; startSlot: number; endSlot: number } | null>(null);
  
  // Form state for creating blocks
  const [blockName, setBlockName] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [createMode, setCreateMode] = useState<BlockType>('placeholder');

  // Get all uncompleted tasks
  const uncompletedTasks = useMemo(() => {
    return Object.values(tasks)
      .filter(t => !t.completed)
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));
  }, [tasks]);

  const handleMouseDown = useCallback((dayIndex: number, slotIndex: number) => {
    setIsCreating(true);
    setCreateStart({ dayIndex, slotIndex });
    setCreateEnd({ dayIndex, slotIndex });
  }, []);

  const handleMouseEnter = useCallback((dayIndex: number, slotIndex: number) => {
    if (isCreating && createStart && dayIndex === createStart.dayIndex) {
      setCreateEnd({ dayIndex, slotIndex });
    }
  }, [isCreating, createStart]);

  const handleMouseUp = useCallback(() => {
    if (isCreating && createStart && createEnd) {
      const startSlot = Math.min(createStart.slotIndex, createEnd.slotIndex);
      const endSlot = Math.max(createStart.slotIndex, createEnd.slotIndex);
      
      if (endSlot > startSlot) {
        setPendingBlock({ dayIndex: createStart.dayIndex, startSlot, endSlot });
        setBlockName('');
        setSelectedTaskId('');
        setCreateMode('placeholder');
        setShowCreateModal(true);
      }
    }
    setIsCreating(false);
    setCreateStart(null);
    setCreateEnd(null);
  }, [isCreating, createStart, createEnd]);

  const createBlock = () => {
    if (!pendingBlock) return;
    
    const dateStr = getDateForDayIndex(pendingBlock.dayIndex);
    let newBlock: ScheduleBlock;
    
    if (createMode === 'main-task' && selectedTaskId) {
      const task = tasks[selectedTaskId];
      newBlock = {
        id: Math.random().toString(36).substr(2, 9),
        dayIndex: pendingBlock.dayIndex,
        startSlot: pendingBlock.startSlot,
        endSlot: pendingBlock.endSlot,
        type: 'main-task',
        name: task?.title || 'Main Task',
        taskId: selectedTaskId,
      };
      
      // Add to task chain as real task
      addRealTaskToChain(dateStr, selectedTaskId);
    } else if (createMode === 'chain-task') {
      // Create a chain task
      const ctTitle = blockName.trim() || 'Chain Task';
      addChainTask(dateStr, ctTitle);
      
      // Get the CT ID that was just created
      const chain = taskChains[dateStr];
      const lastLink = chain?.links[chain.links.length - 1];
      const ctId = lastLink?.type === 'ct' ? lastLink.taskId : undefined;
      
      newBlock = {
        id: Math.random().toString(36).substr(2, 9),
        dayIndex: pendingBlock.dayIndex,
        startSlot: pendingBlock.startSlot,
        endSlot: pendingBlock.endSlot,
        type: 'chain-task',
        name: ctTitle,
        chainTaskId: ctId,
      };
    } else {
      // Placeholder
      newBlock = {
        id: Math.random().toString(36).substr(2, 9),
        dayIndex: pendingBlock.dayIndex,
        startSlot: pendingBlock.startSlot,
        endSlot: pendingBlock.endSlot,
        type: 'placeholder',
        name: blockName.trim() || 'Placeholder',
      };
      
      // Auto-create task chain for this day if it doesn't exist
      if (!taskChains[dateStr] || taskChains[dateStr].links.length === 0) {
        addChainTask(dateStr, newBlock.name);
      }
    }
    
    setBlocks(prev => [...prev, newBlock]);
    setShowCreateModal(false);
    setBlockName('');
    setSelectedTaskId('');
    debouncedSave();
  };

  const deleteBlock = (blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    debouncedSave();
  };

  const isCreatingHere = (dayIndex: number, slotIndex: number) => {
    if (!isCreating || !createStart || !createEnd) return false;
    if (dayIndex !== createStart.dayIndex) return false;
    const start = Math.min(createStart.slotIndex, createEnd.slotIndex);
    const end = Math.max(createStart.slotIndex, createEnd.slotIndex);
    return slotIndex >= start && slotIndex <= end;
  };

  const getBlockAtSlot = (dayIndex: number, slotIndex: number) => {
    return blocks.find(b => b.dayIndex === dayIndex && slotIndex >= b.startSlot && slotIndex < b.endSlot);
  };

  const getBlockColor = (block: ScheduleBlock) => {
    if (block.type === 'main-task' && block.taskId) {
      const task = tasks[block.taskId];
      const category = task ? categories[task.categoryId] : null;
      return category?.color || 'var(--accent)';
    }
    return 'var(--accent)';
  };

  const getBlockLabel = (block: ScheduleBlock) => {
    switch (block.type) {
      case 'main-task': return '[MT]';
      case 'chain-task': return '[CT]';
      default: return '[PLACEHOLDER]';
    }
  };

  return (
    <div 
      style={{ height: '100%', overflow: 'auto', padding: '20px', background: 'var(--bg-primary)' }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Weekly Schedule Overview</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Click and drag to create blocks</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setBlocks([])} disabled={blocks.length === 0}>Clear All</button>
      </div>

      <div style={{ display: 'flex', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
        <div style={{ width: 80, flexShrink: 0 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '12px 8px', fontWeight: 600, fontSize: 12, textAlign: 'center', height: 48 }}>Time</div>
          {TIME_SLOTS.map((slot, i) => (
            <div key={i} style={{ background: 'var(--bg-secondary)', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-secondary)', borderTop: i > 0 ? '1px solid var(--border-dim)' : 'none' }}>
              {slot.minute === 0 ? slot.label : ''}
            </div>
          ))}
        </div>

        {DAYS.map((day, dayIndex) => (
          <div key={day} style={{ flex: 1, minWidth: 0 }}>
            <div style={{ background: 'var(--bg-secondary)', padding: '12px 8px', fontWeight: 600, fontSize: 13, textAlign: 'center', height: 48 }}>{day}</div>
            <div style={{ position: 'relative' }}>
              {TIME_SLOTS.map((_, slotIndex) => (
                <div
                  key={slotIndex}
                  style={{
                    height: 40,
                    background: isCreatingHere(dayIndex, slotIndex) ? 'rgba(59, 130, 246, 0.2)' : 'var(--bg-primary)',
                    borderTop: slotIndex > 0 ? '1px solid var(--border-dim)' : 'none',
                    cursor: isCreating ? 'crosshair' : 'pointer',
                  }}
                  onMouseDown={() => !getBlockAtSlot(dayIndex, slotIndex) && handleMouseDown(dayIndex, slotIndex)}
                  onMouseEnter={() => handleMouseEnter(dayIndex, slotIndex)}
                />
              ))}
              
              {blocks.filter(b => b.dayIndex === dayIndex).map(block => (
                <div
                  key={block.id}
                  style={{
                    position: 'absolute',
                    top: block.startSlot * 40,
                    left: 2,
                    right: 2,
                    height: (block.endSlot - block.startSlot) * 40 - 4,
                    background: getBlockColor(block),
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 8px',
                    fontSize: 12,
                    color: 'white',
                    overflow: 'hidden',
                    zIndex: 1,
                  }}
                >
                  <div style={{ fontWeight: 600, lineHeight: 1.2 }}>{getBlockLabel(block)}</div>
                  <div style={{ fontSize: 10, opacity: 0.9 }}>{TIME_SLOTS[block.startSlot]?.label} - {TIME_SLOTS[block.endSlot]?.label}</div>
                  <div style={{ fontSize: 10, marginTop: 4, fontStyle: 'italic', opacity: 0.8 }}>{block.name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create Block Modal */}
      <AnimatePresence>
        {showCreateModal && pendingBlock && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreateModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 450, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0' }}>Create Schedule Block</h3>
              
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {DAYS[pendingBlock.dayIndex]} {TIME_SLOTS[pendingBlock.startSlot]?.label} - {TIME_SLOTS[pendingBlock.endSlot]?.label}
              </p>

              {/* Mode Selection */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['placeholder', 'main-task', 'chain-task'] as BlockType[]).map((mode) => (
                  <button
                    key={mode}
                    className={`btn btn-sm ${createMode === mode ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1 }}
                    onClick={() => setCreateMode(mode)}
                  >
                    {mode === 'placeholder' && 'Placeholder'}
                    {mode === 'main-task' && 'Main Task'}
                    {mode === 'chain-task' && 'Chain Task'}
                  </button>
                ))}
              </div>

              {/* Placeholder / Chain Task Name Input */}
              {(createMode === 'placeholder' || createMode === 'chain-task') && (
                <input
                  type="text"
                  placeholder={createMode === 'placeholder' ? "e.g., Study Session" : "Chain task name..."}
                  value={blockName}
                  onChange={(e) => setBlockName(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', marginBottom: 16, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}
                  autoFocus
                />
              )}

              {/* Main Task Selection */}
              {createMode === 'main-task' && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>Select Task:</label>
                  <select
                    value={selectedTaskId}
                    onChange={(e) => setSelectedTaskId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}
                  >
                    <option value="">-- Select from task pool --</option>
                    {uncompletedTasks.map((task) => {
                      const category = categories[task.categoryId];
                      return (
                        <option key={task.id} value={task.id}>
                          {task.title} {category ? `(${category.name})` : ''}
                        </option>
                      );
                    })}
                  </select>
                  {uncompletedTasks.length === 0 && (
                    <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>No uncompleted tasks available. Create tasks in the treemap first.</p>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button 
                  className="btn btn-primary" 
                  onClick={createBlock}
                  disabled={
                    (createMode === 'main-task' && !selectedTaskId) ||
                    ((createMode === 'placeholder' || createMode === 'chain-task') && !blockName.trim())
                  }
                >
                  Create Block
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
