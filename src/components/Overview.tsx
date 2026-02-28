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
  const currentDay = today.getDay(); // 0 = Sunday, 1 = Monday, etc.
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
  const addChainTask = store.addChainTask;
  
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [createEnd, setCreateEnd] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [blockName, setBlockName] = useState('');
  const [pendingBlock, setPendingBlock] = useState<Partial<ScheduleBlock> | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

  // Get all tasks sorted by weight
  const allTasks = useMemo(() => {
    return Object.values(tasks).sort((a, b) => (b.weight || 0) - (a.weight || 0));
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
        setShowCreateModal(true);
      }
    }
    setIsCreating(false);
    setCreateStart(null);
    setCreateEnd(null);
  }, [isCreating, createStart, createEnd]);

  const createBlock = (type: BlockType = 'placeholder') => {
    if (!pendingBlock || !blockName.trim()) return;
    
    const newBlock: ScheduleBlock = {
      id: Math.random().toString(36).substr(2, 9),
      dayIndex: pendingBlock.dayIndex!,
      startSlot: pendingBlock.startSlot!,
      endSlot: pendingBlock.endSlot!,
      type,
      name: blockName,
    };
    
    setBlocks(prev => [...prev, newBlock]);
    setShowCreateModal(false);
    setBlockName('');
    setPendingBlock(null);
    
    // Auto-create task chain for this day if it doesn't exist
    autoCreateTaskChain(newBlock.dayIndex, newBlock.name);
    
    debouncedSave();
  };

  const autoCreateTaskChain = (dayIndex: number, blockName: string) => {
    const dateStr = getDateForDayIndex(dayIndex);
    const existingChain = taskChains[dateStr];
    
    if (!existingChain || existingChain.links.length === 0) {
      // Create a new chain task for this block
      addChainTask(dateStr, blockName);
    }
  };

  const assignTaskToBlock = (blockId: string, taskId: string, type: 'main-task' | 'chain-task') => {
    setBlocks(prev => prev.map(b => {
      if (b.id === blockId) {
        const task = tasks[taskId];
        return {
          ...b,
          type,
          taskId,
          name: task?.title || b.name,
        };
      }
      return b;
    }));
    setShowAssignModal(false);
    setSelectedBlockId(null);
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

  return (
    <div 
      style={{ height: '100%', overflow: 'auto', padding: '20px', background: 'var(--bg-primary)' }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Weekly Schedule Overview</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Click and drag to create blocks. Click blocks to assign tasks.
          </p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => setBlocks([])} disabled={blocks.length === 0}>
          Clear All
        </button>
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
                    cursor: 'pointer',
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelectedBlockId(block.id);
                    setShowAssignModal(true);
                  }}
                >
                  <div style={{ fontWeight: 600, lineHeight: 1.2 }}>
                    {block.type === 'placeholder' ? '[PLACEHOLDER]' : block.type === 'main-task' ? '[MT]' : '[CT]'}
                  </div>
                  <div style={{ fontSize: 10, opacity: 0.9 }}>
                    {TIME_SLOTS[block.startSlot]?.label} - {TIME_SLOTS[block.endSlot]?.label}
                  </div>
                  <div style={{ fontSize: 10, marginTop: 4, fontStyle: 'italic', opacity: 0.8 }}>{block.name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Create Block Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreateModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 400, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0' }}>Create Schedule Block</h3>
              <input type="text" placeholder="Block name..." value={blockName} onChange={(e) => setBlockName(e.target.value)} style={{ width: '100%', padding: '10px 12px', marginBottom: 16, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }} autoFocus />
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                <button className="btn btn-ghost btn-sm" style={{ flex: 1 }} onClick={() => createBlock('placeholder')} disabled={!blockName.trim()}>Placeholder</button>
                <button className="btn btn-primary btn-sm" style={{ flex: 1 }} onClick={() => createBlock('main-task')} disabled={!blockName.trim()}>Link to MT</button>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Assign Task Modal */}
      <AnimatePresence>
        {showAssignModal && selectedBlockId && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowAssignModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 450, maxHeight: '70vh', border: '1px solid var(--border)', overflow: 'auto' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0' }}>Assign Task</h3>
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--text-secondary)' }}>Select a main task to link to this block:</p>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {allTasks.length === 0 ? (
                  <p style={{ color: 'var(--text-tertiary)', fontSize: 13 }}>No tasks available. Create tasks first.</p>
                ) : (
                  allTasks.map(task => {
                    const category = categories[task.categoryId];
                    return (
                      <button
                        key={task.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: 12,
                          padding: '10px 12px',
                          background: 'var(--bg-primary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          textAlign: 'left',
                        }}
                        onClick={() => assignTaskToBlock(selectedBlockId, task.id, 'main-task')}
                      >
                        <div style={{ width: 12, height: 12, borderRadius: 2, background: category?.color || 'var(--accent)' }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 14, fontWeight: 500 }}>{task.title}</div>
                          <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>{category?.name || 'Uncategorized'}</div>
                        </div>
                      </button>
                    );
                  })
                )}
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <button className="btn btn-ghost btn-sm" onClick={() => {
                  deleteBlock(selectedBlockId);
                  setShowAssignModal(false);
                }}>Delete Block</button>
                <button className="btn btn-ghost" onClick={() => setShowAssignModal(false)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
