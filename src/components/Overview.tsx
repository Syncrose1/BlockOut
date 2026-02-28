import { useState, useRef, useMemo, useEffect } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { debouncedSave } from '../utils/persistence';

// Days of the week
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

// Time slots - 30 minute intervals from 6 AM to 11 PM
const START_HOUR = 6;
const END_HOUR = 23;
const SLOTS_PER_HOUR = 2; // 30 min intervals

interface TimeSlot {
  hour: number;
  minute: number;
  label: string;
}

interface ScheduleBlock {
  id: string;
  dayIndex: number; // 0-6 (Mon-Sun)
  startSlot: number; // Slot index
  endSlot: number; // Slot index
  type: 'placeholder' | 'main-task' | 'chain-task';
  name: string;
  taskId?: string;
  chainTaskId?: string;
  color?: string;
}

// Generate time slots
function generateTimeSlots(): TimeSlot[] {
  const slots: TimeSlot[] = [];
  for (let hour = START_HOUR; hour <= END_HOUR; hour++) {
    for (let minute = 0; minute < 60; minute += 30) {
      const label = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push({ hour, minute, label });
    }
  }
  return slots;
}

const TIME_SLOTS = generateTimeSlots();

export function Overview() {
  const store = useStore();
  const tasks = store.tasks;
  const categories = store.categories;
  const timeBlocks = store.timeBlocks;
  const activeBlockId = store.activeBlockId;
  
  // State for schedule blocks
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [createEnd, setCreateEnd] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [showPlaceholderModal, setShowPlaceholderModal] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<Partial<ScheduleBlock> | null>(null);
  const [showTemplates, setShowTemplates] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  
  const containerRef = useRef<HTMLDivElement>(null);

  // Get active block tasks for assignment
  const activeTasks = useMemo(() => {
    if (!activeBlockId) return [];
    const block = timeBlocks[activeBlockId];
    if (!block) return [];
    return block.taskIds
      .map(id => tasks[id])
      .filter(Boolean)
      .sort((a, b) => (b.weight || 0) - (a.weight || 0));
  }, [tasks, timeBlocks, activeBlockId]);

  // Handle mouse down on a slot (start creating block)
  const handleSlotMouseDown = (dayIndex: number, slotIndex: number) => {
    setIsCreating(true);
    setCreateStart({ dayIndex, slotIndex });
    setCreateEnd({ dayIndex, slotIndex });
  };

  // Handle mouse move while creating
  const handleSlotMouseEnter = (dayIndex: number, slotIndex: number) => {
    if (isCreating && createStart && dayIndex === createStart.dayIndex) {
      setCreateEnd({ dayIndex, slotIndex });
    }
  };

  // Handle mouse up (finish creating)
  const handleMouseUp = () => {
    if (isCreating && createStart && createEnd) {
      const startSlot = Math.min(createStart.slotIndex, createEnd.slotIndex);
      const endSlot = Math.max(createStart.slotIndex, createEnd.slotIndex);
      
      if (endSlot > startSlot) {
        // Show placeholder name input
        setPendingBlock({
          dayIndex: createStart.dayIndex,
          startSlot,
          endSlot,
          type: 'placeholder',
        });
        setShowPlaceholderModal(true);
      }
    }
    setIsCreating(false);
    setCreateStart(null);
    setCreateEnd(null);
  };

  // Create the block
  const createBlock = (name: string) => {
    if (!pendingBlock) return;
    
    const newBlock: ScheduleBlock = {
      id: Math.random().toString(36).substr(2, 9),
      dayIndex: pendingBlock.dayIndex!,
      startSlot: pendingBlock.startSlot!,
      endSlot: pendingBlock.endSlot!,
      type: 'placeholder',
      name,
    };
    
    setBlocks(prev => [...prev, newBlock]);
    setShowPlaceholderModal(false);
    setPendingBlock(null);
    debouncedSave();
  };

  // Delete a block
  const deleteBlock = (blockId: string) => {
    setBlocks(prev => prev.filter(b => b.id !== blockId));
    debouncedSave();
  };

  // Assign task to placeholder
  const assignTaskToBlock = (blockId: string, taskId: string, type: 'main-task' | 'chain-task') => {
    setBlocks(prev => prev.map(b => {
      if (b.id === blockId) {
        const task = tasks[taskId];
        const category = categories[task?.categoryId || ''];
        return {
          ...b,
          type,
          taskId,
          name: task?.title || b.name,
          color: category?.color,
        };
      }
      return b;
    }));
    debouncedSave();
  };

  // Convert placeholder back to assignable state
  const resetBlock = (blockId: string) => {
    setBlocks(prev => prev.map(b => 
      b.id === blockId 
        ? { ...b, type: 'placeholder', taskId: undefined, chainTaskId: undefined, color: undefined }
        : b
    ));
    debouncedSave();
  };

  // Check if a slot is being created
  const isSlotInCreation = (dayIndex: number, slotIndex: number) => {
    if (!isCreating || !createStart || !createEnd) return false;
    if (dayIndex !== createStart.dayIndex) return false;
    const start = Math.min(createStart.slotIndex, createEnd.slotIndex);
    const end = Math.max(createStart.slotIndex, createEnd.slotIndex);
    return slotIndex >= start && slotIndex <= end;
  };

  // Get block for a specific slot
  const getBlockAtSlot = (dayIndex: number, slotIndex: number) => {
    return blocks.find(b => 
      b.dayIndex === dayIndex && 
      slotIndex >= b.startSlot && 
      slotIndex < b.endSlot
    );
  };

  // Get slot time label
  const getSlotTime = (slotIndex: number) => {
    const slot = TIME_SLOTS[slotIndex];
    if (!slot) return '';
    return slot.label;
  };

  // Get block height in slots
  const getBlockHeight = (block: ScheduleBlock) => {
    return (block.endSlot - block.startSlot) * 40; // 40px per slot
  };

  return (
    <div 
      className="overview-container"
      ref={containerRef}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      style={{
        height: '100%',
        overflow: 'auto',
        padding: '20px',
        background: 'var(--bg-primary)',
      }}
    >
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
        paddingBottom: 16,
        borderBottom: '1px solid var(--border)',
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>
            Weekly Schedule Overview
          </h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
            Click and drag on any day to create schedule blocks
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button 
            className="btn btn-ghost btn-sm"
            onClick={() => setShowTemplates(true)}
          >
            Load Template
          </button>
          <button 
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSaveTemplate(true)}
            disabled={blocks.length === 0}
          >
            Save as Template
          </button>
          <button 
            className="btn btn-ghost btn-sm"
            onClick={() => setBlocks([])}
            disabled={blocks.length === 0}
          >
            Clear All
          </button>
        </div>
      </div>

      {/* Calendar Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: '80px repeat(7, 1fr)',
        gap: 1,
        background: 'var(--border)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-md)',
        overflow: 'hidden',
      }}>
        {/* Time column header */}
        <div style={{
          background: 'var(--bg-secondary)',
          padding: '12px 8px',
          fontWeight: 600,
          fontSize: 12,
          textAlign: 'center',
          borderBottom: '1px solid var(--border)',
        }}>
          Time
        </div>
        
        {/* Day headers */}
        {DAYS.map(day => (
          <div key={day} style={{
            background: 'var(--bg-secondary)',
            padding: '12px 8px',
            fontWeight: 600,
            fontSize: 13,
            textAlign: 'center',
            borderBottom: '1px solid var(--border)',
          }}>
            {day}
          </div>
        ))}

        {/* Time slots */}
        {TIME_SLOTS.map((slot, slotIndex) => (
          <>
            {/* Time label */}
            <div key={`time-${slotIndex}`} style={{
              background: 'var(--bg-secondary)',
              padding: '8px',
              fontSize: 11,
              color: 'var(--text-secondary)',
              textAlign: 'center',
              borderBottom: '1px solid var(--border-dim)',
              height: 40,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              {slot.minute === 0 ? slot.label : ''}
            </div>
            
            {/* Day slots */}
            {DAYS.map((_, dayIndex) => {
              const block = getBlockAtSlot(dayIndex, slotIndex);
              const isCreatingHere = isSlotInCreation(dayIndex, slotIndex);
              const isBlockStart = block && block.startSlot === slotIndex;
              
              if (block && !isBlockStart) return null; // Block continuation, render only at start
              
              return (
                <div
                  key={`${dayIndex}-${slotIndex}`}
                  style={{
                    background: isCreatingHere 
                      ? 'rgba(var(--accent-rgb), 0.2)' 
                      : 'var(--bg-primary)',
                    borderBottom: '1px solid var(--border-dim)',
                    height: block ? getBlockHeight(block) : 40,
                    position: 'relative',
                    cursor: isCreating ? 'crosshair' : 'pointer',
                  }}
                  onMouseDown={() => !block && handleSlotMouseDown(dayIndex, slotIndex)}
                  onMouseEnter={() => handleSlotMouseEnter(dayIndex, slotIndex)}
                >
                  {block && (
                    <div
                      style={{
                        position: 'absolute',
                        inset: 2,
                        background: block.color || 'var(--accent)',
                        borderRadius: 'var(--radius-sm)',
                        padding: '6px 8px',
                        fontSize: 12,
                        color: 'white',
                        overflow: 'hidden',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 2,
                      }}
                      onClick={(e) => {
                        e.stopPropagation();
                        if (block.type === 'placeholder') {
                          // Show task assignment modal
                        }
                      }}
                    >
                      <div style={{ fontWeight: 600, lineHeight: 1.2 }}>
                        {block.type === 'placeholder' ? '[PLACEHOLDER]' : block.name}
                      </div>
                      <div style={{ fontSize: 10, opacity: 0.9 }}>
                        {getSlotTime(block.startSlot)} - {getSlotTime(block.endSlot)}
                      </div>
                      {block.type === 'placeholder' && (
                        <div style={{ 
                          fontSize: 10, 
                          marginTop: 'auto',
                          fontStyle: 'italic',
                          opacity: 0.8,
                        }}>
                          {block.name}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </>
        ))}
      </div>

      {/* Placeholder Name Modal */}
      <AnimatePresence>
        {showPlaceholderModal && pendingBlock && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 100,
            }}
            onClick={() => {
              setShowPlaceholderModal(false);
              setPendingBlock(null);
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              style={{
                background: 'var(--bg-secondary)',
                padding: 24,
                borderRadius: 'var(--radius-lg)',
                width: 400,
                border: '1px solid var(--border)',
              }}
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 16px 0' }}>Create Schedule Block</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: 14, color: 'var(--text-secondary)' }}>
                {DAYS[pendingBlock.dayIndex!]} {getSlotTime(pendingBlock.startSlot!)} - {getSlotTime(pendingBlock.endSlot!)}
              </p>
              <input
                type="text"
                placeholder="e.g., Clinical Examination Practice"
                value={templateName}
                onChange={(e) => setTemplateName(e.target.value)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  marginBottom: 16,
                  background: 'var(--bg-primary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button 
                  className="btn btn-ghost"
                  onClick={() => {
                    setShowPlaceholderModal(false);
                    setPendingBlock(null);
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary"
                  onClick={() => createBlock(templateName || 'Untitled Block')}
                  disabled={!templateName.trim()}
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
