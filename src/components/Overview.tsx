import { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { debouncedSave } from '../utils/persistence';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const START_HOUR = 6;
const END_HOUR = 23;

interface ScheduleBlock {
  id: string;
  dayIndex: number;
  startSlot: number;
  endSlot: number;
  name: string;
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

export function Overview() {
  const [blocks, setBlocks] = useState<ScheduleBlock[]>([]);
  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [createEnd, setCreateEnd] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [showModal, setShowModal] = useState(false);
  const [blockName, setBlockName] = useState('');
  const [pendingBlock, setPendingBlock] = useState<Partial<ScheduleBlock> | null>(null);

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
        setShowModal(true);
      }
    }
    setIsCreating(false);
    setCreateStart(null);
    setCreateEnd(null);
  }, [isCreating, createStart, createEnd]);

  const createBlock = () => {
    if (!pendingBlock || !blockName.trim()) return;
    
    const newBlock: ScheduleBlock = {
      id: Math.random().toString(36).substr(2, 9),
      dayIndex: pendingBlock.dayIndex!,
      startSlot: pendingBlock.startSlot!,
      endSlot: pendingBlock.endSlot!,
      name: blockName,
    };
    
    setBlocks(prev => [...prev, newBlock]);
    setShowModal(false);
    setBlockName('');
    setPendingBlock(null);
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

  return (
    <div 
      style={{ height: '100%', overflow: 'auto', padding: '20px', background: 'var(--bg-primary)' }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <h2 style={{ margin: 0, fontSize: 20, fontWeight: 600 }}>Weekly Schedule Overview</h2>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>Click and drag on any day to create schedule blocks</p>
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
                    background: 'var(--accent)',
                    borderRadius: 'var(--radius-sm)',
                    padding: '6px 8px',
                    fontSize: 12,
                    color: 'white',
                    overflow: 'hidden',
                    zIndex: 1,
                  }}
                >
                  <div style={{ fontWeight: 600, lineHeight: 1.2 }}>[PLACEHOLDER]</div>
                  <div style={{ fontSize: 10, opacity: 0.9 }}>{TIME_SLOTS[block.startSlot]?.label} - {TIME_SLOTS[block.endSlot]?.label}</div>
                  <div style={{ fontSize: 10, marginTop: 4, fontStyle: 'italic', opacity: 0.8 }}>{block.name}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <AnimatePresence>
        {showModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 400, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0' }}>Create Schedule Block</h3>
              <input type="text" placeholder="e.g., Clinical Examination Practice" value={blockName} onChange={(e) => setBlockName(e.target.value)} style={{ width: '100%', padding: '10px 12px', marginBottom: 16, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }} autoFocus />
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={createBlock} disabled={!blockName.trim()}>Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
