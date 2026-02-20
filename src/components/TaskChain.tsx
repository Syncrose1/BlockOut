import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { debouncedSave } from '../utils/persistence';
import { UnifiedTaskContextMenu } from './Modals';

// Get today's date string
function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TaskChain() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const taskChains = useStore((s) => s.taskChains);
  const chainTasks = useStore((s) => s.chainTasks);
  const chainTemplates = useStore((s) => s.chainTemplates);
  const selectedChainDate = useStore((s) => s.selectedChainDate);
  const chainTaskCompletionSurveyId = useStore((s) => s.chainTaskCompletionSurveyId);
  const selectedTaskIds = useStore((s) => s.selectedTaskIds);
  
  const setSelectedChainDate = useStore((s) => s.setSelectedChainDate);
  const addChainTask = useStore((s) => s.addChainTask);
  const addRealTaskToChain = useStore((s) => s.addRealTaskToChain);
  const removeChainLink = useStore((s) => s.removeChainLink);
  const completeChainTask = useStore((s) => s.completeChainTask);
  const uncompleteChainTask = useStore((s) => s.uncompleteChainTask);
  const toggleTask = useStore((s) => s.toggleTask);
  const saveChainAsTemplate = useStore((s) => s.saveChainAsTemplate);
  const loadTemplateAsChain = useStore((s) => s.loadTemplateAsChain);
  const deleteTemplate = useStore((s) => s.deleteTemplate);
  const setChainTaskDuration = useStore((s) => s.setChainTaskDuration);
  const setChainTaskCompletionSurveyId = useStore((s) => s.setChainTaskCompletionSurveyId);
  const replacePlaceholderWithTask = useStore((s) => s.replacePlaceholderWithTask);
  const toggleTaskSelection = useStore((s) => s.toggleTaskSelection);
  const clearTaskSelection = useStore((s) => s.clearTaskSelection);
  const bulkDeleteTasks = useStore((s) => s.bulkDeleteTasks);
  const updateChainTaskTitle = useStore((s) => s.updateChainTaskTitle);
  const updateChainTaskNotes = useStore((s) => s.updateChainTaskNotes);
  const addSubtaskToChain = useStore((s) => s.addSubtaskToChain);
  const toggleSubtaskExpansion = useStore((s) => s.toggleSubtaskExpansion);

  const [showTemplates, setShowTemplates] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedMainTaskId, setSelectedMainTaskId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [insertAfterIndex, setInsertAfterIndex] = useState<number | null>(null);
  const [replacingPlaceholderIndex, setReplacingPlaceholderIndex] = useState<number | null>(null);
  const [showCalendar, setShowCalendar] = useState(false);
  const [customMinutes, setCustomMinutes] = useState('');
  const [showCustomTime, setShowCustomTime] = useState(false);
  const [showBulkOperations, setShowBulkOperations] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string; linkIndex: number; linkType?: 'ct' | 'realtask' } | null>(null);
  const [editingCTId, setEditingCTId] = useState<string | null>(null);
  const [editingCTTitle, setEditingCTTitle] = useState('');
  const [editingCTNotes, setEditingCTNotes] = useState('');
  const [editingCTLinkIndex, setEditingCTLinkIndex] = useState<number | null>(null);
  const [showCTContextMenu, setShowCTContextMenu] = useState(false);
  
  // Subtask state
  const [addingSubtaskForLinkId, setAddingSubtaskForLinkId] = useState<string | null>(null);
  const [subtaskTitle, setSubtaskTitle] = useState('');
  const [selectedSubtaskMainTaskId, setSelectedSubtaskMainTaskId] = useState('');
  const [subtaskType, setSubtaskType] = useState<'ct' | 'realtask'>('ct');
  
  const containerRef = useRef<HTMLDivElement>(null);
  const shiftPressed = useRef(false);

  const currentChain = taskChains[selectedChainDate];
  
  // Track shift key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftPressed.current = true;
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftPressed.current = false;
    };
    
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // Generate calendar for month navigation
  const calendarDays = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days: Array<{ date: string; day: number; hasChain: boolean; isToday: boolean }> = [];
    
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: '', day: 0, hasChain: false, isToday: false });
    }
    
    const todayString = todayStr();
    
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        day,
        hasChain: !!taskChains[dateStr],
        isToday: dateStr === todayString,
      });
    }
    
    return days;
  }, [taskChains]);

  // Get IDs of all tasks in the current chain for multiselect
  const chainTaskIds = useMemo(() => {
    if (!currentChain) return [];
    return currentChain.links
      .filter((l) => l.type === 'realtask' && l.taskId)
      .map((l) => l.taskId);
  }, [currentChain]);

  // Handle CT completion with survey
  const handleCompleteCT = (ctId: string) => {
    const ct = chainTasks[ctId];
    if (!ct) return;
    
    if (ct.completed) {
      uncompleteChainTask(ctId);
    } else {
      completeChainTask(ctId);
      setChainTaskCompletionSurveyId(ctId);
    }
    debouncedSave();
  };

  // Handle Main Task completion
  const handleCompleteMainTask = (taskId: string) => {
    toggleTask(taskId);
    debouncedSave();
  };

  // Handle adding CT
  const handleAddCT = () => {
    if (!newTaskTitle.trim()) return;
    if (insertAfterIndex !== null) {
      addChainTask(selectedChainDate, newTaskTitle, insertAfterIndex);
    } else {
      addChainTask(selectedChainDate, newTaskTitle);
    }
    setNewTaskTitle('');
    setInsertAfterIndex(null);
    debouncedSave();
  };

  // Handle adding Main Task
  const handleAddMainTask = () => {
    if (!selectedMainTaskId) return;
    
    // If we're replacing a placeholder, use the replace function
    if (replacingPlaceholderIndex !== null) {
      replacePlaceholderWithTask(selectedChainDate, replacingPlaceholderIndex, selectedMainTaskId);
      setReplacingPlaceholderIndex(null);
    } else if (insertAfterIndex !== null) {
      addRealTaskToChain(selectedChainDate, selectedMainTaskId, insertAfterIndex);
    } else {
      addRealTaskToChain(selectedChainDate, selectedMainTaskId);
    }
    
    setSelectedMainTaskId('');
    setInsertAfterIndex(null);
    debouncedSave();
  };

  // Handle double-click to complete
  const handleDoubleClick = (link: any) => {
    if (link.type === 'ct') {
      handleCompleteCT(link.taskId);
    } else if (link.type === 'realtask' && link.taskId) {
      handleCompleteMainTask(link.taskId);
    } else if (link.type === 'subtask') {
      // Handle subtask completion based on subType
      if (link.subType === 'ct') {
        handleCompleteCT(link.taskId);
      } else if (link.subType === 'realtask' && link.taskId) {
        handleCompleteMainTask(link.taskId);
      }
    }
  };

  // Handle click with shift for multiselect (only for main tasks)
  const handleTaskClick = (link: any, index: number, e: React.MouseEvent) => {
    if (link.type === 'realtask' && link.taskId) {
      if (shiftPressed.current || e.shiftKey) {
        e.preventDefault();
        e.stopPropagation();
        toggleTaskSelection(link.taskId, true, false);
      } else if (selectedTaskIds.length > 0) {
        // If we have a selection, clicking without shift should clear it
        // unless we're clicking on an already selected task
        if (!selectedTaskIds.includes(link.taskId)) {
          clearTaskSelection();
        }
      }
    }
  };

  // Handle right-click for context menu
  const handleRightClick = (link: any, index: number, e: React.MouseEvent) => {
    e.preventDefault();
    
    if (link.type === 'realtask' && link.taskId) {
      // For main tasks, show the unified context menu
      if (selectedTaskIds.length > 0 && selectedTaskIds.includes(link.taskId)) {
        // Show bulk operations for selected tasks
        setShowBulkOperations(true);
      } else {
        // Show single task context menu
        setContextMenu({ x: e.clientX, y: e.clientY, taskId: link.taskId, linkIndex: index });
      }
    } else if (link.type === 'ct') {
      // For CTs, open the context menu modal
      const ct = chainTasks[link.taskId];
      if (ct) {
        setEditingCTId(link.taskId);
        setEditingCTTitle(ct.title);
        setEditingCTNotes(ct.notes || '');
        setEditingCTLinkIndex(index);
        setShowCTContextMenu(true);
      }
    }
  };

  // Handle bulk complete
  const handleBulkComplete = () => {
    selectedTaskIds.forEach((taskId) => {
      const task = tasks[taskId];
      if (task && !task.completed) {
        toggleTask(taskId);
      }
    });
    clearTaskSelection();
    setShowBulkOperations(false);
    debouncedSave();
  };

  // Handle bulk delete from chain
  const handleBulkDeleteFromChain = () => {
    // Remove all selected tasks from the chain
    if (currentChain) {
      const indicesToRemove: number[] = [];
      currentChain.links.forEach((link, index) => {
        if (link.type === 'realtask' && selectedTaskIds.includes(link.taskId)) {
          indicesToRemove.push(index);
        }
      });
      
      // Remove from highest index to lowest to maintain correct indices
      indicesToRemove.reverse().forEach((index) => {
        removeChainLink(selectedChainDate, index);
      });
    }
    clearTaskSelection();
    setShowBulkOperations(false);
    debouncedSave();
  };

  // Handle duration selection
  const handleDurationSelect = (minutes: number) => {
    if (chainTaskCompletionSurveyId) {
      setChainTaskDuration(chainTaskCompletionSurveyId, minutes);
      setChainTaskCompletionSurveyId(null);
      debouncedSave();
    }
    setShowCustomTime(false);
    setCustomMinutes('');
  };

  // Handle custom duration
  const handleCustomDuration = () => {
    const mins = parseInt(customMinutes);
    if (mins > 0 && chainTaskCompletionSurveyId) {
      setChainTaskDuration(chainTaskCompletionSurveyId, mins);
      setChainTaskCompletionSurveyId(null);
      debouncedSave();
    }
    setShowCustomTime(false);
    setCustomMinutes('');
  };

  // Handle skip duration
  const handleSkipDuration = () => {
    setChainTaskCompletionSurveyId(null);
    setShowCustomTime(false);
    setCustomMinutes('');
  };

  // Handle save template
  const handleSaveTemplate = () => {
    if (!templateName.trim() || !currentChain) return;
    saveChainAsTemplate(selectedChainDate, templateName);
    setTemplateName('');
    setShowSaveTemplate(false);
    debouncedSave();
  };

  // Click outside to close calendar
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowCalendar(false);
      }
    };
    
    if (showCalendar) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showCalendar]);

  // Get uncompleted tasks for the dropdown
  const uncompletedTasks = Object.values(tasks).filter((t) => !t.completed);
  
  // Get currently surveyed CT
  const surveyedCT = chainTaskCompletionSurveyId ? chainTasks[chainTaskCompletionSurveyId] : null;

  // Get selected CTs for bulk operations
  const selectedCTs = useMemo(() => {
    if (!currentChain) return [];
    return currentChain.links
      .filter((l) => l.type === 'ct' && selectedTaskIds.includes(l.taskId))
      .map((l) => chainTasks[l.taskId])
      .filter(Boolean);
  }, [currentChain, selectedTaskIds, chainTasks]);

  // Calculate chain stats for progress bar
  const chainStats = useMemo(() => {
    if (!currentChain) return { total: 0, completed: 0, active: 0, pending: 0 };
    
    const total = currentChain.links.filter(l => l.type !== 'subtask').length;
    let completed = 0;
    let active = 0;
    
    currentChain.links.forEach((link, index) => {
      if (link.type === 'subtask') return;
      
      const task = link.type === 'ct' ? chainTasks[link.taskId] : tasks[link.taskId];
      if (task?.completed) {
        completed++;
      } else if (!task?.completed && index === completed) {
        active++;
      }
    });
    
    return {
      total,
      completed,
      active: Math.min(active, 1),
      pending: total - completed - Math.min(active, 1)
    };
  }, [currentChain, tasks, chainTasks]);

  // Get subtasks for a parent link
  const getSubtasksForParent = (parentId: string) => {
    if (!currentChain) return [];
    const parentIndex = currentChain.links.findIndex(l => l.id === parentId);
    if (parentIndex === -1) return [];
    
    const subtasks = [];
    for (let i = parentIndex + 1; i < currentChain.links.length; i++) {
      const link = currentChain.links[i];
      if (link.type === 'subtask' && link.parentId === parentId) {
        subtasks.push({ link, index: i });
      } else if (!link.parentId) {
        break;
      }
    }
    return subtasks;
  };

  // Build chain items for V0-style rendering (only parent tasks, with their subtasks)
  const chainItems = useMemo(() => {
    if (!currentChain) return [];
    
    const items: Array<{ link: typeof currentChain.links[0]; index: number; nodeNumber: number; subtasks: ReturnType<typeof getSubtasksForParent> }> = [];
    let nodeNumber = 1;
    
    currentChain.links.forEach((link, index) => {
      // Skip subtasks - they'll be included inside their parents
      if (link.type === 'subtask') return;
      
      const subtasks = getSubtasksForParent(link.id);
      
      items.push({
        link,
        index,
        nodeNumber: nodeNumber++,
        subtasks,
      });
    });
    
    return items;
  }, [currentChain]);

  return (
    <div 
      ref={containerRef}
      className="taskchain-container" 
      style={{ 
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        padding: '20px 30px',
        overflow: 'auto',
      }}
    >
      {/* Header with Calendar */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        marginBottom: 24,
        flexShrink: 0,
      }}>
        <div>
          <h1 style={{ 
            fontSize: 24, 
            fontWeight: 600,
            marginBottom: 4,
            display: 'flex',
            alignItems: 'center',
            gap: 12,
          }}>
            <span style={{ fontSize: 28 }}>⛓️</span>
            Task Chain
          </h1>
          <div style={{ color: 'var(--text-secondary)', fontSize: 14 }}>
            {new Date(selectedChainDate).toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric',
              month: 'long', 
              day: 'numeric' 
            })}
          </div>
        </div>

        {/* Calendar Picker */}
        <div style={{ position: 'relative' }}>
          <button 
            className="btn btn-ghost"
            onClick={() => setShowCalendar(!showCalendar)}
            style={{ display: 'flex', alignItems: 'center', gap: 8 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {showCalendar ? 'Hide Calendar' : 'Select Date'}
          </button>
          
          <AnimatePresence>
            {showCalendar && (
              <motion.div
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                style={{
                  position: 'absolute',
                  top: '100%',
                  right: 0,
                  marginTop: 8,
                  background: 'var(--bg-secondary)',
                  padding: 16,
                  borderRadius: 'var(--radius-lg)',
                  boxShadow: 'var(--shadow-lg)',
                  zIndex: 100,
                  minWidth: 280,
                  border: '1px solid var(--border)',
                }}
              >
                <div style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(7, 1fr)', 
                  gap: 4,
                  textAlign: 'center',
                  fontSize: 11,
                }}>
                  {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
                    <div key={d} style={{ color: 'var(--text-secondary)', padding: '4px', fontWeight: 600 }}>
                      {d}
                    </div>
                  ))}
                  {calendarDays.map((day, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (day.date) {
                          setSelectedChainDate(day.date);
                          setShowCalendar(false);
                        }
                      }}
                      style={{
                        padding: '6px',
                        borderRadius: 'var(--radius-sm)',
                        background: day.date === selectedChainDate 
                          ? 'var(--accent)' 
                          : day.isToday 
                            ? 'var(--bg-tertiary)' 
                            : 'transparent',
                        color: day.date === selectedChainDate ? 'white' : 'var(--text-primary)',
                        border: day.hasChain 
                          ? '2px solid var(--accent)' 
                          : day.isToday 
                            ? '1px solid var(--border)' 
                            : 'none',
                        cursor: day.date ? 'pointer' : 'default',
                        opacity: day.date ? 1 : 0,
                        fontSize: 13,
                        fontWeight: day.date === selectedChainDate || day.isToday ? 600 : 400,
                      }}
                    >
                      {day.day || ''}
                    </button>
                  ))}
                </div>
                
                <div style={{ marginTop: 12, fontSize: 11, color: 'var(--text-secondary)', display: 'flex', gap: 16, justifyContent: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, border: '2px solid var(--accent)', borderRadius: 2 }} />
                    Has Chain
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 2 }} />
                    Selected
                  </span>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Template Actions */}
      <div style={{ 
        display: 'flex', 
        gap: 12, 
        marginBottom: 24,
        flexShrink: 0,
      }}>
        <button 
          className="btn btn-ghost btn-sm"
          onClick={() => setShowTemplates(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1"/>
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/>
            <path d="M12 11h4"/>
            <path d="M12 16h4"/>
            <path d="M8 11h.01"/>
            <path d="M8 16h.01"/>
          </svg>
          Load Template
        </button>
        {currentChain && currentChain.links.length > 0 && (
          <button 
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSaveTemplate(true)}
            style={{ display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
              <polyline points="17 21 17 13 7 13 7 21"/>
              <polyline points="7 3 7 8 15 8"/>
            </svg>
            Save as Template
          </button>
        )}
      </div>

      {/* Workflow Chain Summary */}
      {currentChain && currentChain.links.length > 0 && (
        <div style={{
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: 24,
          border: '1px solid var(--border)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ fontSize: 20 }}>⛓️</span>
            <span style={{ fontWeight: 600, fontSize: 15 }}>Workflow Chain</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {Array.from({ length: chainStats.total }).map((_, i) => (
                <div
                  key={i}
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: i < chainStats.completed 
                      ? 'hsl(140, 60%, 40%)' 
                      : i === chainStats.completed 
                        ? 'var(--accent)' 
                        : 'var(--border)',
                  }}
                />
              ))}
            </div>
          </div>
          
          <div style={{ 
            display: 'flex', 
            alignItems: 'center', 
            gap: 16,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'hsl(140, 60%, 40%)' }} />
              {chainStats.completed} Done
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)' }} />
              {chainStats.active} Active
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border)' }} />
              {chainStats.pending} Pending
            </span>
            <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
              {chainStats.completed}/{chainStats.total}
            </span>
          </div>
        </div>
      )}

      {/* Main Chain Area */}
      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'auto',
        padding: '0 20px 20px 0',
      }}>
        {/* Add First Task Button (when empty) */}
        {(!currentChain || currentChain.links.length === 0) && !insertAfterIndex && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 60,
              background: 'var(--bg-secondary)',
              borderRadius: 'var(--radius-xl)',
              border: '2px dashed var(--border)',
              gap: 16,
            }}
          >
            <div style={{ fontSize: 48 }}>⛓️</div>
            <h3 style={{ color: 'var(--text-secondary)' }}>Start your task chain</h3>
            <p style={{ color: 'var(--text-tertiary)', textAlign: 'center', maxWidth: 400 }}>
              Add chain tasks for quick to-dos or link existing tasks from your pool.
            </p>
            <button 
              className="btn btn-primary"
              onClick={() => setInsertAfterIndex(-1)}
            >
              + Add First Task
            </button>
          </motion.div>
        )}

        {/* Chain Links - V0 Style */}
        {currentChain && chainItems.map(({ link, index, nodeNumber, subtasks }) => {
          const isCT = link.type === 'ct';
          const ct = isCT ? chainTasks[link.taskId] : null;
          const mainTask = link.type === 'realtask' && link.taskId ? tasks[link.taskId] : null;
          const isPlaceholder = link.type === 'realtask' && !link.taskId;
          const task = ct || mainTask;
          const isCompleted = task?.completed || false;
          const isSelected = !!(mainTask && selectedTaskIds.includes(mainTask.id));
          const isLastItem = nodeNumber === chainItems.length;
          const completedCount = chainStats.completed;
          const isActive = !isCompleted && nodeNumber === completedCount + 1;

          const nodeColor = isCompleted
            ? 'hsl(140, 60%, 40%)'
            : isActive ? 'var(--accent)' : 'var(--border)';

          let accentColor = 'var(--accent)';
          if (isSelected) accentColor = 'hsl(210, 100%, 65%)';
          else if (isCompleted) accentColor = 'hsl(140, 60%, 40%)';
          else if (isCT) accentColor = 'hsl(200, 70%, 50%)';
          else if (mainTask) accentColor = 'hsl(270, 60%, 50%)';
          else if (isPlaceholder) accentColor = 'var(--text-tertiary)';

          let cardBg = 'var(--bg-secondary)';
          let cardBorder = 'var(--border)';
          if (isSelected) { cardBg = 'hsla(210, 100%, 65%, 0.08)'; cardBorder = 'hsl(210, 100%, 65%)'; }
          else if (isCompleted) { cardBg = 'hsla(140, 60%, 40%, 0.06)'; cardBorder = 'hsla(140, 60%, 40%, 0.3)'; }

          return (
            <div key={link.id} style={{ display: 'flex', alignItems: 'flex-start' }}>
              {/* Left connector column */}
              <div style={{ width: 56, display: 'flex', flexDirection: 'column', alignItems: 'center', flexShrink: 0 }}>
                {/* Top connector line */}
                {nodeNumber > 1 && (
                  <div style={{ height: 16, width: 2, borderRadius: '9999px', backgroundColor: isCompleted || isActive ? accentColor : 'var(--border)', opacity: isCompleted ? 0.6 : 1 }} />
                )}
                {nodeNumber === 1 && <div style={{ height: 16 }} />}

                {/* Node circle */}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: isCompleted ? 'hsl(140, 60%, 40%)' : isActive ? `${accentColor}18` : 'transparent',
                  border: isActive ? `2px solid ${accentColor}` : isCompleted ? '2px solid hsl(140, 60%, 40%)' : '2px solid #475569',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: isCompleted || isActive ? 'white' : 'var(--text-secondary)',
                  fontWeight: 700, fontSize: 13, flexShrink: 0, transition: 'all 0.3s ease',
                  boxShadow: isActive ? `0 0 20px ${accentColor}40` : isCompleted ? '0 0 10px hsla(140, 60%, 40%, 0.4)' : '0 0 0 1px rgba(71, 85, 105, 0.3)',
                }}>
                  {isCompleted ? (
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                  ) : nodeNumber}
                </div>

                {/* Bottom connector - grows with card height */}
                {!isLastItem && (
                  <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1 }}>
                    {/* Background line that fills entire space */}
                    <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: 2, backgroundColor: '#334155' }} />
                    
                    {/* Content on top of the line */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', flex: 1, position: 'relative', zIndex: 1 }}>
                      {/* Spacer after node */}
                      <div style={{ height: 8, width: 14, backgroundColor: 'var(--bg-primary)' }} />
                      
                      {/* First chain link SVG with background cover */}
                      <div style={{ backgroundColor: 'var(--bg-primary)', padding: '2px 0' }}>
                        <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
                          <path
                            d="M7 0 V4 C7 5.5 10 5.5 10 7 V13 C10 14.5 7 14.5 7 16 V20"
                            stroke="#334155"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M7 0 V4 C7 5.5 4 5.5 4 7 V13 C4 14.5 7 14.5 7 16 V20"
                            stroke="#334155"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      
                      {/* Insert task button with background cover */}
                      {!insertAfterIndex && !replacingPlaceholderIndex && (
                        <div style={{ backgroundColor: 'var(--bg-primary)', padding: '4px 0' }}>
                          <button
                            onClick={() => setInsertAfterIndex(index)}
                            title="Insert task here"
                            style={{
                              width: 24, height: 24, borderRadius: '50%',
                              border: '1px solid rgba(255,255,255,0.4)',
                              background: 'rgba(255,255,255,0.08)',
                              color: 'rgba(255,255,255,0.9)',
                              cursor: 'pointer',
                              display: 'flex', alignItems: 'center', justifyContent: 'center',
                              fontSize: 16, lineHeight: 1, fontWeight: 300,
                              flexShrink: 0, padding: 0,
                              transition: 'all 0.2s ease',
                              boxShadow: '0 0 10px rgba(255,255,255,0.2), inset 0 0 4px rgba(255,255,255,0.1)',
                            }}
                            onMouseEnter={(e) => {
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.8)';
                              e.currentTarget.style.color = 'white';
                              e.currentTarget.style.background = 'rgba(255,255,255,0.2)';
                              e.currentTarget.style.boxShadow = '0 0 16px rgba(255,255,255,0.4), inset 0 0 8px rgba(255,255,255,0.2)';
                            }}
                            onMouseLeave={(e) => {
                              e.currentTarget.style.borderColor = 'rgba(255,255,255,0.4)';
                              e.currentTarget.style.color = 'rgba(255,255,255,0.9)';
                              e.currentTarget.style.background = 'rgba(255,255,255,0.08)';
                              e.currentTarget.style.boxShadow = '0 0 10px rgba(255,255,255,0.2), inset 0 0 4px rgba(255,255,255,0.1)';
                            }}
                          >+</button>
                        </div>
                      )}
                      
                      {/* Second chain link SVG with background cover */}
                      <div style={{ backgroundColor: 'var(--bg-primary)', padding: '2px 0' }}>
                        <svg width="14" height="20" viewBox="0 0 14 20" fill="none">
                          <path
                            d="M7 0 V4 C7 5.5 10 5.5 10 7 V13 C10 14.5 7 14.5 7 16 V20"
                            stroke="#334155"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                          <path
                            d="M7 0 V4 C7 5.5 4 5.5 4 7 V13 C4 14.5 7 14.5 7 16 V20"
                            stroke="#334155"
                            strokeWidth="1.5"
                            strokeLinecap="round"
                          />
                        </svg>
                      </div>
                      
                      {/* Spacer before next node - pushes content up */}
                      <div style={{ flex: 1, minHeight: 8, width: 14, backgroundColor: 'var(--bg-primary)' }} />
                    </div>
                  </div>
                )}
                {isLastItem && <div style={{ height: 20 }} />}
              </div>

              {/* Task card column */}
              <div style={{ flex: 1, marginLeft: 12, paddingBottom: isLastItem ? 0 : 8 }}>
                <motion.div
                  initial={{ opacity: 0, x: -16 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: (nodeNumber - 1) * 0.04 }}
                  onDoubleClick={() => handleDoubleClick(link)}
                  onClick={(e) => handleTaskClick(link, index, e)}
                  onContextMenu={(e) => handleRightClick(link, index, e)}
                  style={{
                    background: cardBg, border: `1.5px solid ${cardBorder}`,
                    borderRadius: 12, overflow: 'hidden',
                    transition: 'border-color 0.2s ease, background 0.2s ease',
                    cursor: mainTask ? 'pointer' : 'default',
                    userSelect: 'none', WebkitUserSelect: 'none',
                  }}
                >
                  {/* Top accent bar */}
                  <div style={{ height: 3, background: isCompleted || isActive ? accentColor : 'transparent', transition: 'background 0.3s ease' }} />

                  {/* Card body */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 16px' }}>
                    {/* Type badge */}
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: isSelected ? 'hsla(210,100%,65%,0.18)'
                        : isCompleted ? 'hsla(140,60%,40%,0.15)'
                        : isCT ? 'hsla(200,70%,50%,0.15)'
                        : isPlaceholder ? 'var(--bg-tertiary)'
                        : 'hsla(270,60%,50%,0.15)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 11, fontWeight: 700, flexShrink: 0, letterSpacing: 0.5,
                      color: isSelected ? 'hsl(210,100%,65%)'
                        : isCompleted ? 'hsl(140,60%,40%)'
                        : isCT ? 'hsl(200,70%,50%)'
                        : isPlaceholder ? 'var(--text-tertiary)'
                        : 'hsl(270,60%,50%)',
                    }}>
                      {isCT ? 'CT' : isPlaceholder ? '?' : 'M'}
                    </div>

                    {/* Info */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {isPlaceholder ? (
                        <>
                          <div style={{ color: 'var(--text-tertiary)', fontStyle: 'italic', fontSize: 14 }}>Insert Main Task</div>
                          {link.placeholder && <div style={{ color: 'var(--text-secondary)', fontSize: 12, marginTop: 2 }}>e.g. {link.placeholder}</div>}
                        </>
                      ) : (
                        <>
                          <div style={{
                            fontSize: 14, fontWeight: 500,
                            textDecoration: isCompleted ? 'line-through' : 'none',
                            color: isCompleted ? 'var(--text-secondary)' : 'var(--text-primary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>{task?.title || 'Unknown Task'}</div>
                          {isCT && ct?.actualDuration && (
                            <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                              </svg>
                              {ct.actualDuration}m
                            </div>
                          )}
                          {isCT && ct?.notes && (
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', marginTop: 2, fontStyle: 'italic' }}>
                              {ct.notes.length > 60 ? ct.notes.slice(0, 60) + '…' : ct.notes}
                            </div>
                          )}
                        </>
                      )}
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                      {!isPlaceholder && (
                        <button
                          className="btn btn-sm"
                          onClick={(e) => { e.stopPropagation(); isCT ? handleCompleteCT(link.taskId) : handleCompleteMainTask(link.taskId); }}
                          style={{
                            background: isCompleted ? 'transparent' : accentColor,
                            color: isCompleted ? 'var(--text-secondary)' : 'white',
                            border: isCompleted ? '1px solid var(--border)' : 'none',
                            fontSize: 12, padding: '4px 10px',
                          }}
                        >{isCompleted ? 'Undo' : 'Done'}</button>
                      )}
                      {isPlaceholder && (
                        <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); setReplacingPlaceholderIndex(index); }}>Select</button>
                      )}
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={(e) => { e.stopPropagation(); setAddingSubtaskForLinkId(link.id); setSubtaskTitle(''); setSelectedSubtaskMainTaskId(''); setSubtaskType('ct'); }}
                        title="Add subtask" style={{ color: 'var(--text-tertiary)', padding: '4px 6px' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                        </svg>
                      </button>
                      <button
                        className="btn btn-ghost btn-xs"
                        onClick={(e) => { e.stopPropagation(); removeChainLink(selectedChainDate, index); debouncedSave(); }}
                        title="Remove from chain" style={{ color: 'var(--text-tertiary)', padding: '4px 6px' }}
                      >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Subtasks nested inside card */}
                  {(subtasks.length > 0 || addingSubtaskForLinkId === link.id) && (
                    <div style={{ borderTop: '1px solid var(--border)', padding: '10px 16px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {subtasks.length > 0 && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                          <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Subtasks</span>
                          <span style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                            {subtasks.filter(({ link: sl }) => {
                              const sc = sl.subType === 'ct' ? chainTasks[sl.taskId] : null;
                              const sm = sl.subType !== 'ct' && sl.taskId ? tasks[sl.taskId] : null;
                              return (sc || sm)?.completed;
                            }).length}/{subtasks.length}
                          </span>
                        </div>
                      )}
                      {subtasks.map(({ link: subLink, index: subIndex }) => {
                        const subIsCT = subLink.subType === 'ct';
                        const subCt = subIsCT ? chainTasks[subLink.taskId] : null;
                        const subMain = !subIsCT && subLink.taskId ? tasks[subLink.taskId] : null;
                        const subTask = subCt || subMain;
                        const subDone = subTask?.completed || false;
                        return (
                          <div key={subLink.id}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 8,
                              padding: '7px 10px',
                              background: subDone ? 'hsla(140,60%,40%,0.06)' : 'var(--bg-tertiary)',
                              borderRadius: 8, border: '1px solid var(--border)',
                            }}
                            onDoubleClick={() => handleDoubleClick(subLink)}
                            onContextMenu={(e) => handleRightClick(subLink, subIndex, e)}
                          >
                            <button
                              onClick={(e) => { e.stopPropagation(); handleDoubleClick(subLink); }}
                              style={{
                                width: 20, height: 20, borderRadius: '50%', padding: 0,
                                border: `2px solid ${subDone ? 'hsl(140,60%,40%)' : 'var(--border)'}`,
                                background: subDone ? 'hsl(140,60%,40%)' : 'transparent',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                cursor: 'pointer', flexShrink: 0, transition: 'all 0.2s',
                              }}
                            >
                              {subDone && <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>}
                            </button>
                            <span style={{
                              flex: 1, fontSize: 13,
                              color: subDone ? 'var(--text-secondary)' : 'var(--text-primary)',
                              textDecoration: subDone ? 'line-through' : 'none',
                              overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                            }}>{subTask?.title || 'Unknown'}</span>
                            <span style={{
                              fontSize: 10, fontWeight: 700, letterSpacing: 0.5, flexShrink: 0,
                              color: subIsCT ? 'hsl(200,70%,50%)' : 'hsl(270,60%,50%)',
                              background: subIsCT ? 'hsla(200,70%,50%,0.12)' : 'hsla(270,60%,50%,0.12)',
                              padding: '2px 6px', borderRadius: 4,
                            }}>{subIsCT ? 'CT' : 'M'}</span>
                            <button
                              className="btn btn-ghost btn-xs"
                              onClick={(e) => { e.stopPropagation(); removeChainLink(selectedChainDate, subIndex); debouncedSave(); }}
                              style={{ color: 'var(--text-tertiary)', padding: '2px 4px', flexShrink: 0 }}
                            >
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                              </svg>
                            </button>
                          </div>
                        );
                      })}

                      {/* Add subtask form or button */}
                      {addingSubtaskForLinkId === link.id ? (
                        <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: 4 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                            <div style={{ display: 'flex', gap: 6 }}>
                              <button className={`btn btn-xs ${subtaskType === 'ct' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSubtaskType('ct')}>CT</button>
                              <button className={`btn btn-xs ${subtaskType === 'realtask' ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setSubtaskType('realtask')}>Main Task</button>
                            </div>
                            <button className="btn btn-ghost btn-xs" onClick={() => { setAddingSubtaskForLinkId(null); setSubtaskTitle(''); setSelectedSubtaskMainTaskId(''); }}>×</button>
                          </div>
                          {subtaskType === 'ct' ? (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <input type="text" value={subtaskTitle} onChange={(e) => setSubtaskTitle(e.target.value)} placeholder="New subtask..." autoFocus
                                style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}
                                onKeyDown={(e) => { if (e.key === 'Enter' && subtaskTitle.trim()) { addSubtaskToChain(selectedChainDate, link.id, subtaskTitle.trim(), 'ct'); setAddingSubtaskForLinkId(null); setSubtaskTitle(''); debouncedSave(); } }}
                              />
                              <button className="btn btn-primary btn-sm" disabled={!subtaskTitle.trim()}
                                onClick={() => { if (subtaskTitle.trim()) { addSubtaskToChain(selectedChainDate, link.id, subtaskTitle.trim(), 'ct'); setAddingSubtaskForLinkId(null); setSubtaskTitle(''); debouncedSave(); } }}>Add</button>
                            </div>
                          ) : (
                            <div style={{ display: 'flex', gap: 6 }}>
                              <select value={selectedSubtaskMainTaskId} onChange={(e) => setSelectedSubtaskMainTaskId(e.target.value)}
                                style={{ flex: 1, padding: '6px 10px', background: 'var(--bg-secondary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}>
                                <option value="">Select task...</option>
                                {Object.values(tasks).filter(t => !t.completed).map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                              </select>
                              <button className="btn btn-ghost btn-sm" disabled={!selectedSubtaskMainTaskId}
                                onClick={() => { const st = tasks[selectedSubtaskMainTaskId]; if (st) { addSubtaskToChain(selectedChainDate, link.id, st.title, 'realtask', selectedSubtaskMainTaskId); setAddingSubtaskForLinkId(null); setSelectedSubtaskMainTaskId(''); debouncedSave(); } }}>Link</button>
                            </div>
                          )}
                        </motion.div>
                      ) : (
                        <button className="btn btn-ghost btn-xs"
                          onClick={() => { setAddingSubtaskForLinkId(link.id); setSubtaskTitle(''); setSelectedSubtaskMainTaskId(''); setSubtaskType('ct'); }}
                          style={{ color: 'var(--text-tertiary)', alignSelf: 'flex-start', fontSize: 12 }}>
                          + Add subtask
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>

                {/* Insert inline modal */}
                {insertAfterIndex === index && !replacingPlaceholderIndex && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
                    style={{ background: 'var(--bg-secondary)', padding: 14, borderRadius: 10, border: '2px solid var(--accent)', marginTop: 8, marginBottom: 4 }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                      <h3 style={{ fontSize: 14, margin: 0 }}>Insert After #{nodeNumber}</h3>
                      <button className="btn btn-ghost btn-sm" onClick={() => { setInsertAfterIndex(null); setNewTaskTitle(''); setSelectedMainTaskId(''); }}>×</button>
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginBottom: 10 }}>
                      <input type="text" value={newTaskTitle} onChange={(e) => setNewTaskTitle(e.target.value)} placeholder="New chain task" autoFocus
                        style={{ flex: 1, padding: '7px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}
                        onKeyDown={(e) => e.key === 'Enter' && handleAddCT()}
                      />
                      <button className="btn btn-primary btn-sm" onClick={handleAddCT} disabled={!newTaskTitle.trim()}>Add CT</button>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10, color: 'var(--text-secondary)', fontSize: 11 }}>
                      <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />OR<div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                    </div>
                    <div style={{ display: 'flex', gap: 8 }}>
                      <select value={selectedMainTaskId} onChange={(e) => setSelectedMainTaskId(e.target.value)}
                        style={{ flex: 1, padding: '7px 10px', background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text-primary)', fontSize: 13 }}>
                        <option value="">Select from task pool...</option>
                        {uncompletedTasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                      </select>
                      <button className="btn btn-ghost btn-sm" onClick={handleAddMainTask} disabled={!selectedMainTaskId}>Link Task</button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>
          );
        })}
        
        {/* Add at End Button / Inline Modal */}
        {currentChain && chainItems.length > 0 && (
          insertAfterIndex === chainItems[chainItems.length - 1].index && !replacingPlaceholderIndex ? (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              style={{
                background: 'var(--bg-secondary)',
                padding: 16,
                borderRadius: 'var(--radius-lg)',
                border: '2px solid var(--accent)',
                marginTop: 8,
              }}
            >
              <div style={{ 
                display: 'flex', 
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 12,
              }}>
                <h3 style={{ fontSize: 15, margin: 0 }}>
                  Add Task to End
                </h3>
                <button 
                  className="btn btn-ghost btn-sm"
                  onClick={() => {
                    setInsertAfterIndex(null);
                    setNewTaskTitle('');
                    setSelectedMainTaskId('');
                  }}
                >
                  ×
                </button>
              </div>
              
              {/* Add CT */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input
                  type="text"
                  value={newTaskTitle}
                  onChange={(e) => setNewTaskTitle(e.target.value)}
                  placeholder="New chain task"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCT()}
                />
                <button 
                  className="btn btn-primary btn-sm" 
                  onClick={handleAddCT}
                  disabled={!newTaskTitle.trim()}
                >
                  Add CT
                </button>
              </div>

              {/* Or divider */}
              <div style={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 8, 
                marginBottom: 12,
                color: 'var(--text-secondary)',
                fontSize: 12,
              }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                OR
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>

              {/* Add Main Task */}
              <div style={{ display: 'flex', gap: 8 }}>
                <select
                  value={selectedMainTaskId}
                  onChange={(e) => setSelectedMainTaskId(e.target.value)}
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                  }}
                >
                  <option value="">Select from task pool...</option>
                  {uncompletedTasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title}
                    </option>
                  ))}
                </select>
                <button 
                  className="btn btn-ghost btn-sm" 
                  onClick={handleAddMainTask}
                  disabled={!selectedMainTaskId}
                >
                  Link Task
                </button>
              </div>
            </motion.div>
          ) : (
            !insertAfterIndex && !replacingPlaceholderIndex && (
              <button
                className="btn btn-ghost"
                onClick={() => setInsertAfterIndex(chainItems[chainItems.length - 1].index)}
                style={{
                  padding: '12px',
                  border: '2px dashed var(--border)',
                  borderRadius: 'var(--radius-lg)',
                  marginTop: 8,
                }}
              >
                + Add Task to End
              </button>
            )
          )
        )}

        {/* Add Task Interface - only for "Add First Task" and placeholder replacement */}
        {((insertAfterIndex === -1 && !currentChain?.links.length) || replacingPlaceholderIndex !== null) && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            style={{
              background: 'var(--bg-secondary)',
              padding: 20,
              borderRadius: 'var(--radius-lg)',
              border: '2px solid var(--accent)',
              marginTop: 8,
            }}
          >
            <div style={{ 
              display: 'flex', 
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 16,
            }}>
              <h3 style={{ fontSize: 16, margin: 0 }}>
                {replacingPlaceholderIndex !== null 
                  ? 'Select Main Task'
                  : insertAfterIndex === -1 
                    ? 'Add First Task' 
                    : insertAfterIndex !== null
                      ? `Insert After Task ${insertAfterIndex + 1}`
                      : 'Add Task'}
              </h3>
              <button 
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setInsertAfterIndex(null);
                  setReplacingPlaceholderIndex(null);
                  setNewTaskTitle('');
                  setSelectedMainTaskId('');
                }}
              >
                Cancel
              </button>
            </div>
            
            {/* Add CT */}
            <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
              <input
                type="text"
                value={newTaskTitle}
                onChange={(e) => setNewTaskTitle(e.target.value)}
                placeholder="New chain task (quick to-do)"
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
                autoFocus
                onKeyDown={(e) => e.key === 'Enter' && handleAddCT()}
              />
              <button 
                className="btn btn-primary" 
                onClick={handleAddCT}
                disabled={!newTaskTitle.trim()}
              >
                Add CT
              </button>
            </div>

            {/* Or divider */}
            <div style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: 12, 
              marginBottom: 16,
              color: 'var(--text-secondary)',
              fontSize: 13,
            }}>
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              OR
              <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            </div>

            {/* Add Main Task */}
            <div style={{ display: 'flex', gap: 12 }}>
              <select
                value={selectedMainTaskId}
                onChange={(e) => setSelectedMainTaskId(e.target.value)}
                style={{
                  flex: 1,
                  padding: '10px 12px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                }}
              >
                <option value="">Select from task pool...</option>
                {uncompletedTasks.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
              <button 
                className="btn btn-ghost" 
                onClick={handleAddMainTask}
                disabled={!selectedMainTaskId}
              >
                {replacingPlaceholderIndex !== null ? 'Replace' : 'Link Task'}
              </button>
            </div>
          </motion.div>
        )}
      </div>

      {/* Duration Survey Modal for CTs */}
      <AnimatePresence>
        {surveyedCT && (
          <motion.div
            className="survey-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={handleSkipDuration}
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              background: 'rgba(0,0,0,0.5)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 1000,
            }}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 40 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 40 }}
              onClick={(e) => e.stopPropagation()}
              style={{
                background: 'var(--bg-secondary)',
                padding: '32px 40px',
                borderRadius: 'var(--radius-xl)',
                maxWidth: 420,
                textAlign: 'center',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ marginBottom: 16 }}>
                <svg width="48" height="48" viewBox="0 0 48 48">
                  <circle cx="24" cy="24" r="20" fill="none" stroke="hsl(140, 60%, 40%)" strokeWidth="2" />
                  <motion.path
                    d="M14 24 L20 30 L34 16"
                    fill="none"
                    stroke="hsl(140, 60%, 40%)"
                    strokeWidth="3"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.4, delay: 0.1 }}
                  />
                </svg>
              </div>
              <div style={{ fontSize: 20, fontWeight: 600, marginBottom: 8 }}>
                Chain Task Complete!
              </div>
              <div style={{ fontSize: 16, color: 'var(--text-secondary)', marginBottom: 24 }}>
                {surveyedCT.title}
              </div>
              <div style={{ fontSize: 14, color: 'var(--text-secondary)', marginBottom: 16 }}>
                How long did this take?
              </div>
              
              {!showCustomTime ? (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', marginBottom: 16 }}>
                  {[5, 15, 30, 45, 60, 90, 120].map((mins) => (
                    <button
                      key={mins}
                      className="btn btn-ghost"
                      onClick={() => handleDurationSelect(mins)}
                      style={{ minWidth: 60 }}
                    >
                      {mins < 60 ? `${mins}m` : `${mins / 60}h`}
                    </button>
                  ))}
                  <button
                    className="btn btn-ghost"
                    onClick={() => setShowCustomTime(true)}
                  >
                    Custom
                  </button>
                </div>
              ) : (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  style={{ marginBottom: 16 }}
                >
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
                    <input
                      type="number"
                      value={customMinutes}
                      onChange={(e) => setCustomMinutes(e.target.value)}
                      placeholder="Minutes"
                      autoFocus
                      style={{
                        width: 100,
                        padding: '8px 12px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-primary)',
                        textAlign: 'center',
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') handleCustomDuration();
                      }}
                    />
                    <button className="btn btn-primary" onClick={handleCustomDuration}>
                      Save
                    </button>
                    <button className="btn btn-ghost" onClick={() => setShowCustomTime(false)}>
                      Back
                    </button>
                  </div>
                </motion.div>
              )}
              
              <button 
                className="btn btn-ghost btn-sm" 
                onClick={handleSkipDuration}
                style={{ color: 'var(--text-tertiary)' }}
              >
                Skip
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Context Menu for Main Tasks */}
      <AnimatePresence>
        {contextMenu && contextMenu.taskId && tasks[contextMenu.taskId] && (
          <UnifiedTaskContextMenu
            open={true}
            onClose={() => setContextMenu(null)}
            taskId={contextMenu.taskId}
            x={contextMenu.x}
            y={contextMenu.y}
          />
        )}
      </AnimatePresence>

      {/* Bulk Operations Modal for Task Chain */}
      <AnimatePresence>
        {showBulkOperations && selectedTaskIds.length > 0 && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowBulkOperations(false)}
          >
            <motion.div
              className="modal"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 500 }}
            >
              <h2>{selectedTaskIds.length} Selected in Chain</h2>
              
              <div style={{ marginBottom: 20 }}>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
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
                  {selectedTaskIds.map((id) => {
                    const task = tasks[id] || chainTasks[id];
                    return task ? (
                      <div key={id} style={{ padding: '2px 0' }}>
                        {task.title}
                      </div>
                    ) : null;
                  })}
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                <button 
                  className="btn btn-primary"
                  onClick={handleBulkComplete}
                  style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12"/>
                  </svg>
                  Mark All Complete
                </button>
                
                <button 
                  className="btn btn-danger"
                  onClick={handleBulkDeleteFromChain}
                >
                  Remove from Chain
                </button>
              </div>

              <div className="modal-actions">
                <button 
                  className="btn btn-ghost" 
                  onClick={() => {
                    clearTaskSelection();
                    setShowBulkOperations(false);
                  }}
                >
                  Clear Selection
                </button>
                <button className="btn btn-ghost" onClick={() => setShowBulkOperations(false)}>
                  Done
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* CT Context Menu Modal */}
      <AnimatePresence>
        {showCTContextMenu && editingCTId && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowCTContextMenu(false)}
          >
            <motion.div
              className="modal"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 500 }}
            >
              <h2>Edit Chain Task</h2>
              
              <div className="modal-field">
                <label>Task Name</label>
                <input
                  type="text"
                  value={editingCTTitle}
                  onChange={(e) => setEditingCTTitle(e.target.value)}
                  placeholder="Task name"
                  autoFocus
                />
              </div>
              
              <div className="modal-field">
                <label>Notes / Description</label>
                <textarea
                  value={editingCTNotes}
                  onChange={(e) => setEditingCTNotes(e.target.value)}
                  placeholder="Add notes or description (optional)"
                  rows={4}
                  style={{
                    width: '100%',
                    padding: '10px 12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 14,
                    resize: 'vertical',
                    minHeight: 80,
                  }}
                />
              </div>

              <div className="modal-actions">
                <button 
                  className="btn btn-danger"
                  onClick={() => {
                    if (editingCTLinkIndex !== null) {
                      removeChainLink(selectedChainDate, editingCTLinkIndex);
                    }
                    setShowCTContextMenu(false);
                    setEditingCTId(null);
                    setEditingCTTitle('');
                    setEditingCTNotes('');
                    setEditingCTLinkIndex(null);
                    debouncedSave();
                  }}
                >
                  Delete
                </button>
                <div style={{ flex: 1 }} />
                <button 
                  className="btn btn-ghost" 
                  onClick={() => {
                    setShowCTContextMenu(false);
                    setEditingCTId(null);
                    setEditingCTTitle('');
                    setEditingCTNotes('');
                    setEditingCTLinkIndex(null);
                  }}
                >
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={() => {
                    if (editingCTTitle.trim()) {
                      updateChainTaskTitle(editingCTId, editingCTTitle.trim());
                      updateChainTaskNotes(editingCTId, editingCTNotes.trim());
                      setShowCTContextMenu(false);
                      setEditingCTId(null);
                      setEditingCTTitle('');
                      setEditingCTNotes('');
                      setEditingCTLinkIndex(null);
                      debouncedSave();
                    }
                  }}
                  disabled={!editingCTTitle.trim()}
                >
                  Save Changes
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Templates Modal */}
      <AnimatePresence>
        {showTemplates && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowTemplates(false)}
          >
            <motion.div
              className="modal"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 500, maxHeight: '80vh', overflow: 'auto' }}
            >
              <h2>Load Template</h2>
              
              {Object.values(chainTemplates).length === 0 ? (
                <p style={{ color: 'var(--text-secondary)', padding: '20px 0' }}>
                  No templates saved yet. Create a task chain and save it as a template first.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 20 }}>
                  {Object.values(chainTemplates).map((template) => (
                    <div
                      key={template.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: 16,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid var(--border)',
                      }}
                    >
                      <div>
                        <strong style={{ fontSize: 15 }}>{template.name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 4 }}>
                          {template.links.length} tasks • Created {new Date(template.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <button
                          className="btn btn-primary btn-sm"
                          onClick={() => {
                            loadTemplateAsChain(template.id, selectedChainDate);
                            setShowTemplates(false);
                            debouncedSave();
                          }}
                        >
                          Load
                        </button>
                        <button
                          className="btn btn-ghost btn-sm"
                          onClick={() => {
                            deleteTemplate(template.id);
                            debouncedSave();
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowTemplates(false)}>
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Save Template Modal */}
      <AnimatePresence>
        {showSaveTemplate && (
          <motion.div
            className="modal-overlay"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowSaveTemplate(false)}
          >
            <motion.div
              className="modal"
              initial={{ scale: 0.92, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.92, opacity: 0, y: 20 }}
              onClick={(e) => e.stopPropagation()}
              style={{ maxWidth: 400 }}
            >
              <h2>Save as Template</h2>
              
              <div className="modal-field">
                <label>Template Name</label>
                <input
                  type="text"
                  value={templateName}
                  onChange={(e) => setTemplateName(e.target.value)}
                  placeholder="e.g., Morning Routine, Study Session"
                  autoFocus
                />
              </div>
              
              <div className="modal-actions">
                <button className="btn btn-ghost" onClick={() => setShowSaveTemplate(false)}>
                  Cancel
                </button>
                <button 
                  className="btn btn-primary" 
                  onClick={handleSaveTemplate}
                  disabled={!templateName.trim()}
                >
                  Save Template
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
