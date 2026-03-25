import React, { useState, useCallback, useMemo } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { debouncedSave } from '../utils/persistence';
import type { BlockType, ScheduleBlock } from '../types';
import { useIsMobile } from '../hooks/useIsMobile';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const START_HOUR = 6;
const END_HOUR = 23;
const COMPLETION_GREEN = '#22c55e';

// Predefined colors for blocks (excluding completion green)
const BLOCK_COLORS = [
  { name: 'Blue', value: '#3b82f6' },
  { name: 'Red', value: '#ef4444' },
  { name: 'Yellow', value: '#eab308' },
  { name: 'Purple', value: '#a855f7' },
  { name: 'Pink', value: '#ec4899' },
  { name: 'Orange', value: '#f97316' },
  { name: 'Cyan', value: '#06b6d4' },
  { name: 'Gray', value: '#6b7280' },
];

// Template storage key
const TEMPLATES_STORAGE_KEY = 'blockout-overview-templates';

// Re-export types for backward compatibility
export type { BlockType, ScheduleBlock };

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

function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d.setDate(diff));
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function getDateForDayIndex(dayIndex: number, weekStart: Date): string {
  const targetDate = new Date(weekStart);
  targetDate.setDate(weekStart.getDate() + dayIndex);
  return targetDate.toISOString().slice(0, 10);
}

interface WeekTemplateBlock {
  dayIndex: number;
  startSlot: number;
  endSlot: number;
  type: BlockType;
  name: string;
  color?: string;
  taskId?: string; // For MT blocks: reference to real task
}

interface WeekTemplate {
  id: string;
  name: string;
  blocks: WeekTemplateBlock[];
  createdAt: number;
}

export function Overview() {
  const isMobile = useIsMobile();
  const store = useStore();
  const tasks = store.tasks;
  const categories = store.categories;
  const taskChains = store.taskChains;
  const addChainTask = store.addChainTask;
  const addRealTaskToChain = store.addRealTaskToChain;
  const updateChainTaskTitle = store.updateChainTaskTitle;
  const addTask = store.addTask;
  const toggleTask = store.toggleTask;
  
  // Use store for blocks (synced with Dropbox)
  const allBlocks = store.overviewBlocks;
  const setBlocks = store.setOverviewBlocks;
  
  // Week navigation - store the actual week start date
  const [currentWeekStart, setCurrentWeekStart] = useState(() => getWeekStart(new Date()));
  
  // Filter blocks for current week
  const blocks = useMemo(() => {
    const currentWeekStr = currentWeekStart.toISOString().slice(0, 10);
    return allBlocks.filter(block => block.weekDate === currentWeekStr);
  }, [allBlocks, currentWeekStart]);
  
  const [isCreating, setIsCreating] = useState(false);
  const [createStart, setCreateStart] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [createEnd, setCreateEnd] = useState<{ dayIndex: number; slotIndex: number } | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [pendingBlock, setPendingBlock] = useState<{ dayIndex: number; startSlot: number; endSlot: number } | null>(null);
  
  // Edit modal state
  const [showEditModal, setShowEditModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState<ScheduleBlock | null>(null);
  const [editName, setEditName] = useState('');
  const [editStartSlot, setEditStartSlot] = useState(0);
  const [editEndSlot, setEditEndSlot] = useState(0);
  const [editColor, setEditColor] = useState(BLOCK_COLORS[0].value);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; blockId: string } | null>(null);
  
  // Form state for creating blocks
  const [blockName, setBlockName] = useState('');
  const [selectedTaskId, setSelectedTaskId] = useState('');
  const [createMode, setCreateMode] = useState<BlockType>('placeholder');
  const [selectedColor, setSelectedColor] = useState(BLOCK_COLORS[0].value);
  
  // Template modal states
  const [showTemplateModal, setShowTemplateModal] = useState(false);
  const [templateMode, setTemplateMode] = useState<'save' | 'load'>('save');
  const [templateName, setTemplateName] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState('');
  const [templates, setTemplates] = useState<WeekTemplate[]>(() => {
    const saved = localStorage.getItem(TEMPLATES_STORAGE_KEY);
    return saved ? JSON.parse(saved) : [];
  });
  
  // Calendar modal state
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth());
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  
  // Placeholder selection modal state
  const [showPlaceholderSelectModal, setShowPlaceholderSelectModal] = useState(false);
  const [selectingPlaceholderBlock, setSelectingPlaceholderBlock] = useState<ScheduleBlock | null>(null);
  const [placeholderSelectedTaskIds, setPlaceholderSelectedTaskIds] = useState<string[]>([]);
  const [newCTName, setNewCTName] = useState('');
  const [newlyCreatedCTIds, setNewlyCreatedCTIds] = useState<string[]>([]);

  // Trigger sync when blocks change
  const updateBlocks = useCallback((newBlocks: ScheduleBlock[]) => {
    setBlocks(newBlocks);
    debouncedSave();
  }, [setBlocks]);
  
  // Save templates to localStorage
  const saveTemplates = useCallback((newTemplates: WeekTemplate[]) => {
    setTemplates(newTemplates);
    localStorage.setItem(TEMPLATES_STORAGE_KEY, JSON.stringify(newTemplates));
  }, []);

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
        setSelectedColor(BLOCK_COLORS[0].value);
        setShowCreateModal(true);
      }
    }
    setIsCreating(false);
    setCreateStart(null);
    setCreateEnd(null);
  }, [isCreating, createStart, createEnd]);

  const createBlock = () => {
    if (!pendingBlock) return;
    
    const dateStr = getDateForDayIndex(pendingBlock.dayIndex, currentWeekStart);
    const now = Date.now();
    const weekDate = currentWeekStart.toISOString().slice(0, 10);
    let newBlock: ScheduleBlock;
    
    if (createMode === 'mt' && selectedTaskId) {
      const task = tasks[selectedTaskId];
      newBlock = {
        id: Math.random().toString(36).substr(2, 9),
        dayIndex: pendingBlock.dayIndex,
        startSlot: pendingBlock.startSlot,
        endSlot: pendingBlock.endSlot,
        type: 'mt',
        name: task?.title || 'Main Task',
        taskId: selectedTaskId,
        weekDate,
        createdAt: now,
        updatedAt: now,
      };
      
      addRealTaskToChain(dateStr, selectedTaskId);
    } else if (createMode === 'ct') {
      const ctTitle = blockName.trim() || 'Chain Task';
      addChainTask(dateStr, ctTitle);
      
      const chain = taskChains[dateStr];
      const lastLink = chain?.links[chain.links.length - 1];
      const ctId = lastLink?.type === 'ct' ? lastLink.taskId : undefined;
      
      newBlock = {
        id: Math.random().toString(36).substr(2, 9),
        dayIndex: pendingBlock.dayIndex,
        startSlot: pendingBlock.startSlot,
        endSlot: pendingBlock.endSlot,
        type: 'ct',
        name: ctTitle,
        taskId: ctId,
        color: selectedColor,
        weekDate,
        createdAt: now,
        updatedAt: now,
      };
    } else {
      newBlock = {
        id: Math.random().toString(36).substr(2, 9),
        dayIndex: pendingBlock.dayIndex,
        startSlot: pendingBlock.startSlot,
        endSlot: pendingBlock.endSlot,
        type: 'placeholder',
        name: blockName.trim() || 'Placeholder',
        color: selectedColor,
        weekDate,
        createdAt: now,
        updatedAt: now,
      };
      
      if (!taskChains[dateStr] || taskChains[dateStr].links.length === 0) {
        addChainTask(dateStr, newBlock.name);
      }
    }
    
    updateBlocks([...allBlocks, newBlock]);
    setShowCreateModal(false);
    setBlockName('');
    setSelectedTaskId('');
  };

  const openEditModal = (block: ScheduleBlock) => {
    setEditingBlock(block);
    setEditName(block.name);
    setEditStartSlot(block.startSlot);
    setEditEndSlot(block.endSlot);
    // Get the original color (not the completion green)
    const originalColor = block.completed ? undefined : block.color;
    setEditColor(originalColor || BLOCK_COLORS[0].value);
    setShowEditModal(true);
    setContextMenu(null);
  };

  const saveEdit = () => {
    if (!editingBlock) return;
    
    const now = Date.now();
    updateBlocks(allBlocks.map(b => {
      if (b.id === editingBlock.id) {
        const isCompleted = b.completed || false;
        const updated: ScheduleBlock = {
          ...b,
          name: editName,
          startSlot: Math.min(editStartSlot, editEndSlot),
          endSlot: Math.max(editStartSlot, editEndSlot),
          updatedAt: now,
        };
        
        // Only update color if not completed and not a main task
        if (!isCompleted && b.type !== 'mt') {
          updated.color = editColor;
        }
        
        // Update chain task title if applicable
        if (b.type === 'ct' && b.taskId) {
          updateChainTaskTitle(b.taskId, editName);
        }
        
        return updated;
      }
      return b;
    }));
    
    setShowEditModal(false);
    setEditingBlock(null);
  };

  const initiateBlockComplete = (block: ScheduleBlock) => {
    if (block.completed) {
      // Toggle off - uncomplete
      if (block.taskId) {
        // If it has a linked task, uncomplete that too
        toggleTask(block.taskId);
      }
      const now = Date.now();
      updateBlocks(allBlocks.map(b => {
        if (b.id === block.id) {
          return { ...b, completed: false, completedAt: undefined, updatedAt: now };
        }
        return b;
      }));
      debouncedSave();
    } else {
      // Complete the block
      const now = Date.now();
      
      if (block.type === 'mt' && block.taskId) {
        // MT blocks: use toggleTask on existing task
        toggleTask(block.taskId);
        
        // Also mark the block as completed so it turns green
        updateBlocks(allBlocks.map(b => {
          if (b.id === block.id) {
            return { ...b, completed: true, completedAt: now, updatedAt: now };
          }
          return b;
        }));
      } else {
        // CT and Placeholder blocks: create a task and complete it
        // Get first category as default
        const firstCategory = Object.values(categories)[0];
        const categoryId = firstCategory?.id || '';
        
        // Create a new task for this block
        const newTaskId = addTask({
          title: block.name,
          categoryId,
          weight: 3,
        });
        
        // Link the block to the new task
        const now = Date.now();
        updateBlocks(allBlocks.map(b => {
          if (b.id === block.id) {
            return { 
              ...b, 
              taskId: newTaskId,
              completed: true,
              completedAt: now,
              updatedAt: now 
            };
          }
          return b;
        }));
        
        // Complete the task (triggers TaskCompletionSurvey modal)
        toggleTask(newTaskId);
      }
      debouncedSave();
    }
    setContextMenu(null);
  };

  const deleteBlock = useCallback((blockId: string) => {
    // Use allBlocks (current state snapshot) and filter
    const newBlocks = allBlocks.filter((b: ScheduleBlock) => b.id !== blockId);
    updateBlocks(newBlocks);
    setContextMenu(null);
  }, [allBlocks, updateBlocks]);

  const handleBlockContextMenu = (e: React.MouseEvent, block: ScheduleBlock) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, blockId: block.id });
  };

  const openPlaceholderSelectModal = (block: ScheduleBlock) => {
    setSelectingPlaceholderBlock(block);
    setPlaceholderSelectedTaskIds(block.selectedTaskIds || []);
    setNewlyCreatedCTIds([]); // Reset the list of newly created CTs
    setNewCTName('');
    setShowPlaceholderSelectModal(true);
    setContextMenu(null);
  };

  const savePlaceholderSelection = () => {
    if (!selectingPlaceholderBlock) return;
    
    const now = Date.now();
    updateBlocks(allBlocks.map(b => {
      if (b.id === selectingPlaceholderBlock.id) {
        return {
          ...b,
          selectedTaskIds: placeholderSelectedTaskIds,
          updatedAt: now,
        };
      }
      return b;
    }));
    
    setShowPlaceholderSelectModal(false);
    setSelectingPlaceholderBlock(null);
    setPlaceholderSelectedTaskIds([]);
    setNewlyCreatedCTIds([]);
  };

  const togglePlaceholderTaskSelection = (taskId: string) => {
    setPlaceholderSelectedTaskIds(prev => {
      if (prev.includes(taskId)) {
        return prev.filter(id => id !== taskId);
      } else {
        return [...prev, taskId];
      }
    });
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
    // If completed, always show green
    if (block.completed) {
      return COMPLETION_GREEN;
    }
    // If main task, use category color
    if (block.type === 'mt' && block.taskId) {
      const task = store.tasks[block.taskId];
      if (!task) {
        console.log('[Overview] Task not found:', block.taskId);
        return 'var(--accent)';
      }
      const category = store.categories[task.categoryId];
      if (!category) {
        console.log('[Overview] Category not found:', task.categoryId);
        return 'var(--accent)';
      }
      return category.color || 'var(--accent)';
    }
    // Otherwise use custom color or default
    return block.color || 'var(--accent)';
  };

  const getBlockLabel = (block: ScheduleBlock) => {
    switch (block.type) {
      case 'mt': return '[MT]';
      case 'ct': return '[CT]';
      default: return '[PLACEHOLDER]';
    }
  };

  // Helper to get task info from an ID (can be MT or CT)
  const getTaskInfo = (taskId: string): { name: string; type: 'mt' | 'ct'; color?: string; completed?: boolean } | null => {
    // Check if it's a main task
    const mt = tasks[taskId];
    if (mt) {
      const category = categories[mt.categoryId];
      return {
        name: mt.title,
        type: 'mt',
        color: category?.color,
        completed: mt.completed,
      };
    }
    // Check if it's a chain task
    const ct = store.chainTasks[taskId];
    if (ct) {
      return {
        name: ct.title,
        type: 'ct',
        completed: ct.completed,
      };
    }
    return null;
  };

  // Calculate how to split placeholder slots among selected tasks
  // Returns array of { taskId, startSlot, endSlot } for each selected task
  const splitPlaceholderSlots = (placeholder: ScheduleBlock): Array<{ taskId: string; startSlot: number; endSlot: number }> => {
    const selectedIds = placeholder.selectedTaskIds || [];
    if (selectedIds.length === 0) return [];
    
    const totalSlots = placeholder.endSlot - placeholder.startSlot;
    const baseSlots = Math.floor(totalSlots / selectedIds.length);
    const remainder = totalSlots % selectedIds.length;
    
    const result: Array<{ taskId: string; startSlot: number; endSlot: number }> = [];
    let currentSlot = placeholder.startSlot;
    
    selectedIds.forEach((taskId, index) => {
      // First 'remainder' tasks get one extra slot
      const slotsForThisTask = baseSlots + (index < remainder ? 1 : 0);
      result.push({
        taskId,
        startSlot: currentSlot,
        endSlot: currentSlot + slotsForThisTask,
      });
      currentSlot += slotsForThisTask;
    });
    
    return result;
  };

  // Display type names in the UI
  const getDisplayTypeName = (type: BlockType) => {
    switch (type) {
      case 'mt': return 'Main Task';
      case 'ct': return 'Chain Task';
      default: return 'Placeholder';
    }
  };

  // Template functions
  const saveCurrentWeekAsTemplate = () => {
    if (!templateName.trim()) return;
    
    const templateBlocks = blocks.map(b => ({
      dayIndex: b.dayIndex,
      startSlot: b.startSlot,
      endSlot: b.endSlot,
      type: b.type,
      name: b.name,
      color: b.color,
      // Store taskId for MT blocks so we can restore the link
      taskId: b.type === 'mt' ? b.taskId : undefined,
    }));
    
    const newTemplate: WeekTemplate = {
      id: Math.random().toString(36).substr(2, 9),
      name: templateName.trim(),
      blocks: templateBlocks,
      createdAt: Date.now(),
    };
    
    saveTemplates([...templates, newTemplate]);
    setTemplateName('');
    setShowTemplateModal(false);
  };

  const loadTemplate = () => {
    const template = templates.find(t => t.id === selectedTemplateId);
    if (!template) return;
    
    const now = Date.now();
    const weekDate = currentWeekStart.toISOString().slice(0, 10);
    
    // Clear current week's blocks first
    const otherWeeksBlocks = allBlocks.filter(b => b.weekDate !== weekDate);
    
    const newBlocks: ScheduleBlock[] = template.blocks.map(b => {
      // Build block based on type
      const baseBlock = {
        dayIndex: b.dayIndex,
        startSlot: b.startSlot,
        endSlot: b.endSlot,
        type: b.type,
        name: b.name,
        weekDate,
        createdAt: now,
        updatedAt: now,
      };
      
      if (b.type === 'mt' && b.taskId) {
        // MT blocks need taskId but no color (color comes from category)
        return {
          ...baseBlock,
          id: Math.random().toString(36).substr(2, 9),
          taskId: b.taskId,
        } as ScheduleBlock;
      } else {
        // CT and Placeholder blocks use stored color
        return {
          ...baseBlock,
          id: Math.random().toString(36).substr(2, 9),
          color: b.color,
        } as ScheduleBlock;
      }
    });
    
    // Replace current week's blocks with template blocks
    updateBlocks([...otherWeeksBlocks, ...newBlocks]);
    setSelectedTemplateId('');
    setShowTemplateModal(false);
  };

  // Calendar functions
  const generateCalendarDays = () => {
    const firstDay = new Date(calendarYear, calendarMonth, 1);
    const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
    
    const startPadding = firstDay.getDay() === 0 ? 6 : firstDay.getDay() - 1;
    const days = [];
    
    // Previous month padding
    for (let i = 0; i < startPadding; i++) {
      days.push(null);
    }
    
    // Current month days
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(calendarYear, calendarMonth, i));
    }
    
    return days;
  };
  
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const selectWeekFromDate = (date: Date) => {
    setCurrentWeekStart(getWeekStart(date));
    setShowCalendarModal(false);
  };

  const weekRangeText = useMemo(() => {
    const endOfWeek = new Date(currentWeekStart);
    endOfWeek.setDate(currentWeekStart.getDate() + 6);
    return `${currentWeekStart.toLocaleDateString()} - ${endOfWeek.toLocaleDateString()}`;
  }, [currentWeekStart]);

  const isCurrentWeek = useMemo(() => {
    const today = new Date();
    const currentWeek = getWeekStart(today);
    return currentWeek.getTime() === currentWeekStart.getTime();
  }, [currentWeekStart]);

  return (
    <div
      style={{ height: '100%', overflow: 'auto', padding: isMobile ? '12px' : '20px', background: 'var(--bg-primary)' }}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onClick={() => setContextMenu(null)}
    >
      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
          <div>
            <h2 style={{ margin: 0, fontSize: isMobile ? 16 : 20, fontWeight: 600 }}>Weekly Schedule</h2>
            <p style={{ margin: '2px 0 0 0', fontSize: 12, color: 'var(--text-secondary)' }}>{weekRangeText}</p>
          </div>
          {/* Primary nav: Prev/Next/Current */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const prevWeek = new Date(currentWeekStart);
                prevWeek.setDate(prevWeek.getDate() - 7);
                setCurrentWeekStart(prevWeek);
              }}
            >
              ← Prev
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setShowCalendarModal(true)}
            >
              Calendar
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setCurrentWeekStart(getWeekStart(new Date()))}
              disabled={isCurrentWeek}
            >
              Current
            </button>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => {
                const nextWeek = new Date(currentWeekStart);
                nextWeek.setDate(nextWeek.getDate() + 7);
                setCurrentWeekStart(nextWeek);
              }}
            >
              Next →
            </button>
          </div>
        </div>
        {/* Secondary actions */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button className="btn btn-ghost btn-sm" onClick={() => { setTemplateMode('save'); setShowTemplateModal(true); }}>Save Template</button>
          <button className="btn btn-ghost btn-sm" onClick={() => { setTemplateMode('load'); setShowTemplateModal(true); }}>Load Template</button>
          <button className="btn btn-ghost btn-sm" onClick={() => updateBlocks(allBlocks.filter(b => !blocks.find(cb => cb.id === b.id)))} disabled={blocks.length === 0}>Clear Week</button>
        </div>
      </div>

      <div style={{ overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
      <div style={{ display: 'flex', gap: 1, background: 'var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden', minWidth: 700 }}>
        <div style={{ width: 80, flexShrink: 0 }}>
          <div style={{ background: 'var(--bg-secondary)', padding: '12px 8px', fontWeight: 600, fontSize: 12, textAlign: 'center', height: 48 }}>Time</div>
          {TIME_SLOTS.map((slot, i) => (
            <div key={i} style={{ background: 'var(--bg-secondary)', height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--text-secondary)', borderTop: i > 0 ? '1px solid var(--border-dim)' : 'none' }}>
              {slot.minute === 0 ? slot.label : ''}
            </div>
          ))}
        </div>

        {DAYS.map((day, dayIndex) => (
          <div key={day} style={{ flex: 1, minWidth: 90 }}>
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
              
              {/* Half-hourly gridlines */}
              {TIME_SLOTS.map((_, slotIndex) => (
                slotIndex > 0 && (
                  <div
                    key={`grid-${slotIndex}`}
                    style={{
                      position: 'absolute',
                      top: slotIndex * 40,
                      left: 0,
                      right: 0,
                      height: 1,
                      background: 'rgba(255,255,255,0.1)',
                      pointerEvents: 'none',
                    }}
                  />
                )
              ))}
              
              {/* Render blocks - placeholders with selected tasks get expanded */}
              {(() => {
                const renderedElements: React.ReactElement[] = [];
                let keyCounter = 0;
                
                blocks.filter(b => b.dayIndex === dayIndex).forEach(block => {
                  // If placeholder has selected tasks, expand them
                  if (block.type === 'placeholder' && block.selectedTaskIds && block.selectedTaskIds.length > 0) {
                    const slotSplits = splitPlaceholderSlots(block);
                    
                    slotSplits.forEach(({ taskId, startSlot, endSlot }, index) => {
                      const taskInfo = getTaskInfo(taskId);
                      if (!taskInfo) return;
                      
                      const isCompleted = taskInfo.completed || false;
                      const bgColor = isCompleted ? COMPLETION_GREEN : (taskInfo.color || block.color || 'var(--accent)');
                      
                      renderedElements.push(
                        <div
                          key={`${block.id}-task-${index}-${keyCounter++}`}
                          style={{
                            position: 'absolute',
                            top: startSlot * 40,
                            left: 2,
                            right: 2,
                            height: (endSlot - startSlot) * 40 - 4,
                            background: bgColor,
                            borderRadius: 'var(--radius-sm)',
                            padding: '8px 10px',
                            color: 'white',
                            overflow: 'hidden',
                            zIndex: 1,
                            display: 'flex',
                            flexDirection: 'column',
                            cursor: 'pointer',
                            opacity: isCompleted ? 0.8 : 1,
                          }}
                          onDoubleClick={() => initiateBlockComplete({ ...block, taskId, type: taskInfo.type, completed: isCompleted })}
                          onContextMenu={(e) => handleBlockContextMenu(e, block)}
                        >
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 2 }}>
                            <div style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.2, flex: 1 }}>{taskInfo.name}</div>
                            <div style={{ fontSize: 12, opacity: 0.7, marginLeft: 4 }}>[{taskInfo.type.toUpperCase()}]</div>
                          </div>
                          <div style={{ fontSize: 12, opacity: 0.9 }}>{TIME_SLOTS[startSlot]?.label} - {TIME_SLOTS[endSlot]?.label}</div>
                        </div>
                      );
                    });
                  } else {
                    // Regular block rendering (MT, CT, or placeholder without selections)
                    renderedElements.push(
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
                          padding: '8px 10px',
                          color: 'white',
                          overflow: 'hidden',
                          zIndex: 1,
                          display: 'flex',
                          flexDirection: 'column',
                          cursor: 'pointer',
                        }}
                        onDoubleClick={() => initiateBlockComplete(block)}
                        onContextMenu={(e) => handleBlockContextMenu(e, block)}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                          <div style={{ fontWeight: 600, fontSize: 16, lineHeight: 1.2, flex: 1 }}>{block.name}</div>
                          <div style={{ fontSize: 16, opacity: 0.7, marginLeft: 4 }}>{getBlockLabel(block)}</div>
                        </div>
                        <div style={{ fontSize: 16, opacity: 0.9 }}>{TIME_SLOTS[block.startSlot]?.label} - {TIME_SLOTS[block.endSlot]?.label}</div>
                        {block.completed && block.actualDuration && (
                          <div style={{ fontSize: 14, opacity: 0.8, marginTop: 4 }}>✓ {block.actualDuration}m</div>
                        )}
                        {/* Select button for placeholder blocks */}
                        {block.type === 'placeholder' && (
                          <div style={{ 
                            flex: 1, 
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            marginTop: 4 
                          }}>
                            <button
                              style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'white',
                                padding: '12px 48px',
                                fontSize: 18,
                                fontWeight: 500,
                                cursor: 'pointer',
                                opacity: 0.9,
                              }}
                              onClick={(e) => {
                                e.stopPropagation();
                                openPlaceholderSelectModal(block);
                              }}
                            >
                              Select
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  }
                });
                
                return renderedElements;
              })()}
            </div>
          </div>
        ))}
      </div>
      </div>

      {/* Context Menu */}
      <AnimatePresence>
        {contextMenu && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            style={{
              position: 'fixed',
              top: contextMenu.y,
              left: contextMenu.x,
              background: 'var(--bg-secondary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-md)',
              padding: '8px 0',
              zIndex: 200,
              minWidth: 160,
              boxShadow: 'var(--shadow-lg)',
            }}
          >
            {(() => {
              const block = blocks.find(b => b.id === contextMenu.blockId);
              if (!block) return null;
              return (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0 }}
                    onClick={() => openEditModal(block)}
                  >Edit Block</button>
                  {block.type === 'placeholder' && (
                    <button
                      className="btn btn-ghost btn-sm"
                      style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0 }}
                      onClick={() => openPlaceholderSelectModal(block)}
                    >
                      {block.selectedTaskIds && block.selectedTaskIds.length > 0 
                        ? `Select (${block.selectedTaskIds.length})` 
                        : 'Select'}
                    </button>
                  )}
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0 }}
                    onClick={() => initiateBlockComplete(block)}
                  >{block.completed ? 'Uncomplete' : 'Complete'}</button>
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <button
                    className="btn btn-ghost btn-sm"
                    style={{ width: '100%', justifyContent: 'flex-start', borderRadius: 0, color: 'hsl(0, 70%, 60%)' }}
                    onClick={() => deleteBlock(block.id)}
                  >Delete</button>
                </>
              );
            })()}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Create Block Modal */}
      <AnimatePresence>
        {showCreateModal && pendingBlock && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCreateModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 450, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0' }}>Create Schedule Block</h3>
              
              <p style={{ margin: '0 0 12px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                {pendingBlock && DAYS[pendingBlock.dayIndex]} {pendingBlock && TIME_SLOTS[pendingBlock.startSlot]?.label} - {pendingBlock && TIME_SLOTS[pendingBlock.endSlot]?.label}
              </p>

              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['placeholder', 'mt', 'ct'] as BlockType[]).map((mode) => (
                  <button
                    key={mode}
                    className={`btn btn-sm ${createMode === mode ? 'btn-primary' : 'btn-ghost'}`}
                    style={{ flex: 1 }}
                    onClick={() => setCreateMode(mode)}
                  >
                    {getDisplayTypeName(mode)}
                  </button>
                ))}
              </div>

              {(createMode === 'placeholder' || createMode === 'ct') && (
                <>
                  <input
                    type="text"
                    placeholder={createMode === 'placeholder' ? "e.g., Study Session" : "Chain task name..."}
                    value={blockName}
                    onChange={(e) => setBlockName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', marginBottom: 16, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}
                    autoFocus
                  />
                  <div style={{ marginBottom: 16 }}>
                    <label style={{ display: 'block', fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>Color:</label>
                    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      {BLOCK_COLORS.map((color) => (
                        <button
                          key={color.value}
                          onClick={() => setSelectedColor(color.value)}
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: '50%',
                            background: color.value,
                            border: selectedColor === color.value ? '3px solid white' : '2px solid transparent',
                            cursor: 'pointer',
                          }}
                          title={color.name}
                        />
                      ))}
                    </div>
                  </div>
                </>
              )}

              {createMode === 'mt' && (
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
                    <p style={{ margin: '8px 0 0 0', fontSize: 12, color: 'var(--text-tertiary)' }}>No uncompleted tasks available.</p>
                  )}
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowCreateModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={createBlock} disabled={(createMode === 'mt' && !selectedTaskId) || ((createMode === 'placeholder' || createMode === 'ct') && !blockName.trim())}>Create</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Edit Block Modal */}
      <AnimatePresence>
        {showEditModal && editingBlock && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowEditModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 450, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0' }}>Edit Schedule Block</h3>
              
              <div style={{ marginBottom: 16 }}>
                <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>Name:</label>
                <input type="text" value={editName} onChange={(e) => setEditName(e.target.value)} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }} />
              </div>

              <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>Start Time:</label>
                  <select value={editStartSlot} onChange={(e) => setEditStartSlot(parseInt(e.target.value))} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}>
                    {TIME_SLOTS.map((slot, i) => (
                      <option key={i} value={i}>{slot.label}</option>
                    ))}
                  </select>
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 6, color: 'var(--text-secondary)' }}>End Time:</label>
                  <select value={editEndSlot} onChange={(e) => setEditEndSlot(parseInt(e.target.value))} style={{ width: '100%', padding: '10px 12px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}>
                    {TIME_SLOTS.map((slot, i) => (
                      <option key={i} value={i}>{slot.label}</option>
                    ))}
                  </select>
                </div>
              </div>

              {editingBlock?.type !== 'mt' && !editingBlock?.completed && (
                <div style={{ marginBottom: 16 }}>
                  <label style={{ display: 'block', fontSize: 13, marginBottom: 8, color: 'var(--text-secondary)' }}>Color:</label>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {BLOCK_COLORS.map((color) => (
                      <button
                        key={color.value}
                        onClick={() => setEditColor(color.value)}
                        style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: color.value,
                          border: editColor === color.value ? '3px solid white' : '2px solid transparent',
                          cursor: 'pointer',
                        }}
                        title={color.name}
                      />
                    ))}
                  </div>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8, justifyContent: 'space-between' }}>
                <button className="btn btn-ghost btn-sm" style={{ color: 'hsl(0, 70%, 60%)' }} onClick={() => { editingBlock && deleteBlock(editingBlock.id); setShowEditModal(false); }}>Delete</button>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-ghost" onClick={() => setShowEditModal(false)}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveEdit}>Save</button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Template Modal */}
      <AnimatePresence>
        {showTemplateModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowTemplateModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 400, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0' }}>{templateMode === 'save' ? 'Save Week as Template' : 'Load Template'}</h3>
              
              {templateMode === 'save' ? (
                <>
                  <input
                    type="text"
                    placeholder="Template name..."
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', marginBottom: 16, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}
                    autoFocus
                  />
                  <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-secondary)' }}>This will save {blocks.length} blocks as a reusable template.</p>
                  
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowTemplateModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={saveCurrentWeekAsTemplate} disabled={!templateName.trim()}>Save Template</button>
                  </div>
                </>
              ) : (
                <>
                  <select
                    value={selectedTemplateId}
                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                    style={{ width: '100%', padding: '10px 12px', marginBottom: 16, background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}
                  >
                    <option value="">-- Select a template --</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.name} ({template.blocks.length} blocks)
                      </option>
                    ))}
                  </select>
                  
                  {templates.length === 0 && (
                    <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-tertiary)' }}>No templates saved yet. Create one by clicking "Save Template".</p>
                  )}
                  
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button className="btn btn-ghost" onClick={() => setShowTemplateModal(false)}>Cancel</button>
                    <button className="btn btn-primary" onClick={loadTemplate} disabled={!selectedTemplateId}>Load Template</button>
                  </div>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Calendar Modal */}
      <AnimatePresence>
        {showCalendarModal && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} onClick={() => setShowCalendarModal(false)}>
            <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }} exit={{ scale: 0.9 }} style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 340, border: '1px solid var(--border)' }} onClick={e => e.stopPropagation()}>
              <h3 style={{ margin: '0 0 16px 0' }}>Select Week</h3>
              
              {/* Month/Year Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => {
                    if (calendarMonth === 0) {
                      setCalendarMonth(11);
                      setCalendarYear(calendarYear - 1);
                    } else {
                      setCalendarMonth(calendarMonth - 1);
                    }
                  }}
                >
                  ←
                </button>
                
                <div style={{ display: 'flex', gap: 8 }}>
                  <select 
                    value={calendarMonth} 
                    onChange={(e) => setCalendarMonth(parseInt(e.target.value))}
                    style={{ padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}
                  >
                    {monthNames.map((name, i) => (
                      <option key={i} value={i}>{name}</option>
                    ))}
                  </select>
                  
                  <select 
                    value={calendarYear} 
                    onChange={(e) => setCalendarYear(parseInt(e.target.value))}
                    style={{ padding: '4px 8px', background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', color: 'var(--text-primary)', fontSize: 14 }}
                  >
                    {Array.from({ length: 10 }, (_, i) => new Date().getFullYear() - 5 + i).map(year => (
                      <option key={year} value={year}>{year}</option>
                    ))}
                  </select>
                </div>
                
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={() => {
                    if (calendarMonth === 11) {
                      setCalendarMonth(0);
                      setCalendarYear(calendarYear + 1);
                    } else {
                      setCalendarMonth(calendarMonth + 1);
                    }
                  }}
                >
                  →
                </button>
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 16 }}>
                {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((day, i) => (
                  <div key={i} style={{ textAlign: 'center', fontSize: 12, color: 'var(--text-secondary)', padding: '4px' }}>{day}</div>
                ))}
              </div>
              
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {generateCalendarDays().map((date, i) => {
                  if (!date) {
                    return <div key={i} style={{ aspectRatio: '1' }} />;
                  }
                  
                  const isToday = new Date().toDateString() === date.toDateString();
                  const weekStart = getWeekStart(date);
                  const isSelectedWeek = weekStart.getTime() === currentWeekStart.getTime();
                  
                  return (
                    <button
                      key={i}
                      onClick={() => selectWeekFromDate(date)}
                      style={{
                        aspectRatio: '1',
                        borderRadius: 'var(--radius-sm)',
                        border: 'none',
                        background: isSelectedWeek ? 'var(--accent)' : isToday ? 'var(--bg-tertiary)' : 'transparent',
                        color: isSelectedWeek ? 'white' : 'var(--text-primary)',
                        fontSize: 14,
                        cursor: 'pointer',
                      }}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
              
              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-ghost" onClick={() => setShowCalendarModal(false)}>Cancel</button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Placeholder Selection Modal */}
      <AnimatePresence>
        {showPlaceholderSelectModal && selectingPlaceholderBlock && (
          <motion.div 
            initial={{ opacity: 0 }} 
            animate={{ opacity: 1 }} 
            exit={{ opacity: 0 }} 
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }} 
            onClick={() => setShowPlaceholderSelectModal(false)}
          >
            <motion.div 
              initial={{ scale: 0.9 }} 
              animate={{ scale: 1 }} 
              exit={{ scale: 0.9 }} 
              style={{ background: 'var(--bg-secondary)', padding: 24, borderRadius: 'var(--radius-lg)', width: 450, maxHeight: '80vh', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column' }} 
              onClick={e => e.stopPropagation()}
            >
              <h3 style={{ margin: '0 0 16px 0' }}>Select Main Tasks</h3>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--text-secondary)' }}>
                Choose tasks to associate with "{selectingPlaceholderBlock?.name}"
              </p>
              
              {/* Create New Chain Task - Sticky at top */}
              <div style={{ marginBottom: 16, padding: '12px', background: 'var(--bg-primary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)' }}>
                <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--text-secondary)' }}>Create Chain Task</h4>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    type="text"
                    placeholder="Enter chain task name..."
                    value={newCTName}
                    onChange={(e) => setNewCTName(e.target.value)}
                    style={{ 
                      flex: 1, 
                      padding: '8px 12px', 
                      background: 'var(--bg-secondary)', 
                      border: '1px solid var(--border)', 
                      borderRadius: 'var(--radius-sm)', 
                      color: 'var(--text-primary)', 
                      fontSize: 14 
                    }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && newCTName.trim() && selectingPlaceholderBlock) {
                        const ctId = addChainTask(getDateForDayIndex(selectingPlaceholderBlock.dayIndex, currentWeekStart), newCTName.trim());
                        setNewlyCreatedCTIds(prev => [...prev, ctId]);
                        togglePlaceholderTaskSelection(ctId);
                        setNewCTName('');
                      }
                    }}
                  />
                  <button 
                    className="btn btn-primary btn-sm"
                    onClick={() => {
                      if (newCTName.trim() && selectingPlaceholderBlock) {
                        const ctId = addChainTask(getDateForDayIndex(selectingPlaceholderBlock.dayIndex, currentWeekStart), newCTName.trim());
                        setNewlyCreatedCTIds(prev => [...prev, ctId]);
                        togglePlaceholderTaskSelection(ctId);
                        setNewCTName('');
                      }
                    }}
                    disabled={!newCTName.trim()}
                  >
                    Add
                  </button>
                </div>
                <p style={{ margin: '6px 0 0 0', fontSize: 11, color: 'var(--text-tertiary)' }}>
                  Press Enter or click Add to create and select
                </p>
              </div>
              
              {/* Newly Created Chain Tasks */}
              {newlyCreatedCTIds.length > 0 && (
                <div style={{ marginBottom: 16, padding: '12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--accent)' }}>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 13, color: 'var(--accent)' }}>Recently Created (Selected)</h4>
                  {newlyCreatedCTIds.map(ctId => {
                    const ct = store.chainTasks[ctId];
                    if (!ct) return null;
                    return (
                      <div 
                        key={ctId}
                        onClick={() => togglePlaceholderTaskSelection(ctId)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          padding: '8px 12px',
                          marginBottom: 4,
                          borderRadius: 'var(--radius-sm)',
                          cursor: 'pointer',
                          background: placeholderSelectedTaskIds.includes(ctId) ? 'var(--accent)' : 'var(--bg-secondary)',
                          color: placeholderSelectedTaskIds.includes(ctId) ? 'white' : 'var(--text-primary)',
                        }}
                      >
                        <div style={{ 
                          width: 18, 
                          height: 18, 
                          borderRadius: 3, 
                          border: '2px solid',
                          borderColor: placeholderSelectedTaskIds.includes(ctId) ? 'white' : 'var(--border)',
                          marginRight: 10,
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}>
                          {placeholderSelectedTaskIds.includes(ctId) && '✓'}
                        </div>
                        <span style={{ fontSize: 14 }}>{ct.title}</span>
                        <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 8 }}>[CT]</span>
                      </div>
                    );
                  })}
                </div>
              )}
              
              <div style={{ flex: 1, overflow: 'auto' }}>
                {/* Main Tasks (MTs) */}
                <div>
                  <h4 style={{ margin: '0 0 8px 0', fontSize: 14, color: 'var(--text-secondary)' }}>Main Tasks</h4>
                  {uncompletedTasks.length === 0 ? (
                    <p style={{ fontSize: 13, color: 'var(--text-tertiary)', fontStyle: 'italic' }}>No uncompleted tasks available</p>
                  ) : (
                    uncompletedTasks.map(task => {
                      const category = categories[task.categoryId];
                      return (
                        <div 
                          key={task.id}
                          onClick={() => togglePlaceholderTaskSelection(task.id)}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            padding: '8px 12px',
                            marginBottom: 4,
                            borderRadius: 'var(--radius-sm)',
                            cursor: 'pointer',
                            background: placeholderSelectedTaskIds.includes(task.id) ? 'var(--accent)' : 'var(--bg-primary)',
                            color: placeholderSelectedTaskIds.includes(task.id) ? 'white' : 'var(--text-primary)',
                          }}
                        >
                          <div style={{ 
                            width: 18, 
                            height: 18, 
                            borderRadius: 3, 
                            border: '2px solid',
                            borderColor: placeholderSelectedTaskIds.includes(task.id) ? 'white' : 'var(--border)',
                            marginRight: 10,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                          }}>
                            {placeholderSelectedTaskIds.includes(task.id) && '✓'}
                          </div>
                          <div style={{ flex: 1 }}>
                            <span style={{ fontSize: 14 }}>{task.title}</span>
                            {category && (
                              <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 8 }}>({category.name})</span>
                            )}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
              
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
                <button className="btn btn-ghost" onClick={() => setShowPlaceholderSelectModal(false)}>Cancel</button>
                <button className="btn btn-primary" onClick={savePlaceholderSelection}>
                  Save ({placeholderSelectedTaskIds.length} selected)
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}