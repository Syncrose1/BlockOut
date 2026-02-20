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
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; taskId: string; linkIndex: number } | null>(null);
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
      // For CTs, show a simple context menu
      setContextMenu({ x: e.clientX, y: e.clientY, taskId: link.taskId, linkIndex: index });
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
            <span>📅</span>
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
        >
          📋 Load Template
        </button>
        {currentChain && currentChain.links.length > 0 && (
          <button 
            className="btn btn-ghost btn-sm"
            onClick={() => setShowSaveTemplate(true)}
          >
            💾 Save as Template
          </button>
        )}
      </div>

      {/* Main Chain Area */}
      <div style={{ 
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        gap: 12,
        overflow: 'auto',
        paddingRight: 8,
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

        {/* Chain Links */}
        {currentChain && currentChain.links.map((link, index) => {
          const isCT = link.type === 'ct';
          const ct = isCT ? chainTasks[link.taskId] : null;
          const mainTask = !isCT && link.taskId ? tasks[link.taskId] : null;
          const isPlaceholder = !isCT && !link.taskId;
          
          const task = ct || mainTask;
          const isCompleted = task?.completed || false;
          const isSelected = mainTask && selectedTaskIds.includes(mainTask.id);
          
          // Determine colors based on completion and type
          let bgColor = 'var(--bg-secondary)';
          let borderColor = 'var(--border)';
          let accentColor = 'var(--accent)';
          
          if (isSelected) {
            bgColor = 'hsla(210, 100%, 65%, 0.1)';
            borderColor = 'hsl(210, 100%, 65%)';
            accentColor = 'hsl(210, 100%, 65%)';
          } else if (isCompleted) {
            bgColor = 'hsla(140, 60%, 40%, 0.1)';
            borderColor = 'hsla(140, 60%, 40%, 0.3)';
            accentColor = 'hsl(140, 60%, 40%)';
          } else if (isCT) {
            accentColor = 'hsl(200, 70%, 50%)';
          } else if (mainTask) {
            accentColor = 'hsl(270, 60%, 50%)';
          } else {
            // Placeholder
            accentColor = 'var(--text-tertiary)';
          }
          
          return (
            <div key={link.id}>
              {/* Chain Link Card */}
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                onDoubleClick={() => handleDoubleClick(link)}
                onClick={(e) => handleTaskClick(link, index, e)}
                onContextMenu={(e) => handleRightClick(link, index, e)}
                style={{
                  display: 'flex',
                  alignItems: 'stretch',
                  background: bgColor,
                  border: `2px solid ${borderColor}`,
                  borderRadius: 'var(--radius-lg)',
                  overflow: 'hidden',
                  transition: 'all 0.2s ease',
                  cursor: mainTask ? 'pointer' : 'default',
                }}
              >
                {/* Completion Status Bar */}
                <div style={{
                  width: 6,
                  background: isCompleted ? accentColor : 'transparent',
                  transition: 'background 0.3s ease',
                }} />
                
                {/* Main Content */}
                <div style={{
                  flex: 1,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 16,
                  padding: '16px 20px',
                }}>
                  {/* Type Icon */}
                  <div style={{
                    width: 36,
                    height: 36,
                    borderRadius: '50%',
                    background: isSelected
                      ? 'hsla(210, 100%, 65%, 0.2)'
                      : isCompleted 
                        ? 'hsla(140, 60%, 40%, 0.2)' 
                        : isCT 
                          ? 'hsla(200, 70%, 50%, 0.2)' 
                          : isPlaceholder 
                            ? 'var(--bg-tertiary)' 
                            : 'hsla(270, 60%, 50%, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: 14,
                    fontWeight: 600,
                    flexShrink: 0,
                    color: isSelected
                      ? 'hsl(210, 100%, 65%)'
                      : isCompleted
                        ? 'hsl(140, 60%, 40%)'
                        : isCT
                          ? 'hsl(200, 70%, 50%)'
                          : isPlaceholder
                            ? 'var(--text-tertiary)'
                            : 'hsl(270, 60%, 50%)',
                  }}>
                    {isCompleted ? '✓' : isCT ? 'CT' : isPlaceholder ? '?' : 'M'}
                  </div>
                  
                  {/* Task Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    {isPlaceholder ? (
                      <>
                        <div style={{ 
                          color: 'var(--text-tertiary)', 
                          fontStyle: 'italic',
                          fontSize: 14,
                        }}>
                          Insert Main Task
                        </div>
                        {link.placeholder && (
                          <div style={{ 
                            color: 'var(--text-secondary)', 
                            fontSize: 12,
                            marginTop: 2,
                          }}>
                            e.g. {link.placeholder}
                          </div>
                        )}
                      </>
                    ) : (
                      <>
                        <div style={{ 
                          fontSize: 15,
                          fontWeight: 500,
                          textDecoration: isCompleted ? 'line-through' : 'none',
                          color: isCompleted ? 'var(--text-secondary)' : 'var(--text-primary)',
                        }}>
                          {task?.title || 'Unknown Task'}
                        </div>
                        {isCT && ct?.actualDuration && (
                          <div style={{ 
                            fontSize: 12, 
                            color: 'var(--text-secondary)',
                            marginTop: 2,
                          }}>
                            ⏱️ {ct.actualDuration} minutes
                          </div>
                        )}
                      </>
                    )}
                  </div>
                  
                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                    {!isPlaceholder && (
                      <button
                        className="btn btn-sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isCT) {
                            handleCompleteCT(link.taskId);
                          } else {
                            handleCompleteMainTask(link.taskId);
                          }
                        }}
                        style={{
                          background: isCompleted ? 'transparent' : accentColor,
                          color: isCompleted ? 'var(--text-secondary)' : 'white',
                          border: isCompleted ? '1px solid var(--border)' : 'none',
                        }}
                      >
                        {isCompleted ? 'Undo' : 'Complete'}
                      </button>
                    )}
                    
                    {isPlaceholder && (
                      <button
                        className="btn btn-sm btn-primary"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReplacingPlaceholderIndex(index);
                        }}
                      >
                        Select
                      </button>
                    )}
                    
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeChainLink(selectedChainDate, index);
                        debouncedSave();
                      }}
                      style={{ color: 'var(--text-tertiary)' }}
                    >
                      ×
                    </button>
                  </div>
                </div>
              </motion.div>
              
              {/* Insert Button Between Tasks */}
              {!insertAfterIndex && !replacingPlaceholderIndex && (
                <div style={{
                  display: 'flex',
                  justifyContent: 'center',
                  padding: '8px 0',
                }}>
                  <button
                    className="btn btn-ghost btn-xs"
                    onClick={() => setInsertAfterIndex(index)}
                    style={{
                      opacity: 0.5,
                      transition: 'opacity 0.2s',
                    }}
                    onMouseEnter={(e) => e.currentTarget.style.opacity = '1'}
                    onMouseLeave={(e) => e.currentTarget.style.opacity = '0.5'}
                  >
                    + Insert Task Here
                  </button>
                </div>
              )}
            </div>
          );
        })}
        
        {/* Add at End Button */}
        {currentChain && currentChain.links.length > 0 && !insertAfterIndex && !replacingPlaceholderIndex && (
          <button
            className="btn btn-ghost"
            onClick={() => setInsertAfterIndex(currentChain.links.length - 1)}
            style={{
              padding: '12px',
              border: '2px dashed var(--border)',
              borderRadius: 'var(--radius-lg)',
              marginTop: 8,
            }}
          >
            + Add Task to End
          </button>
        )}

        {/* Add Task Interface */}
        {(insertAfterIndex !== null || replacingPlaceholderIndex !== null) && (
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
                >
                  ✓ Mark All Complete
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
