import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import { debouncedSave } from '../utils/persistence';

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

export function TaskChain() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const taskChains = useStore((s) => s.taskChains);
  const chainTasks = useStore((s) => s.chainTasks);
  const chainTemplates = useStore((s) => s.chainTemplates);
  const selectedChainDate = useStore((s) => s.selectedChainDate);
  const timeBlocks = useStore((s) => s.timeBlocks);
  
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

  const [showTemplates, setShowTemplates] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [selectedRealTaskId, setSelectedRealTaskId] = useState('');
  const [templateName, setTemplateName] = useState('');
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [editingDuration, setEditingDuration] = useState<string | null>(null);
  const [durationInput, setDurationInput] = useState('');

  const currentChain = taskChains[selectedChainDate];
  
  // Generate calendar days (current month)
  const calendarDays = useMemo(() => {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const daysInMonth = lastDay.getDate();
    const startDayOfWeek = firstDay.getDay();
    
    const days: Array<{ date: string; day: number; hasChain: boolean }> = [];
    
    // Empty cells for days before month starts
    for (let i = 0; i < startDayOfWeek; i++) {
      days.push({ date: '', day: 0, hasChain: false });
    }
    
    // Days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      days.push({
        date: dateStr,
        day,
        hasChain: !!taskChains[dateStr],
      });
    }
    
    return days;
  }, [taskChains]);

  const handleAddCT = () => {
    if (!newTaskTitle.trim()) return;
    addChainTask(selectedChainDate, newTaskTitle);
    setNewTaskTitle('');
    debouncedSave();
  };

  const handleAddRealTask = () => {
    if (!selectedRealTaskId) return;
    addRealTaskToChain(selectedChainDate, selectedRealTaskId);
    setSelectedRealTaskId('');
    debouncedSave();
  };

  const handleComplete = (link: any, index: number) => {
    if (link.type === 'ct') {
      const ct = chainTasks[link.taskId];
      if (ct?.completed) {
        uncompleteChainTask(link.taskId);
      } else {
        completeChainTask(link.taskId);
        // Prompt for duration
        setEditingDuration(link.taskId);
      }
    } else {
      // Real task
      toggleTask(link.taskId);
    }
    debouncedSave();
  };

  const handleSaveTemplate = () => {
    if (!templateName.trim() || !currentChain) return;
    saveChainAsTemplate(selectedChainDate, templateName);
    setTemplateName('');
    setShowSaveTemplate(false);
    debouncedSave();
  };

  const handleDurationSubmit = (ctId: string) => {
    const minutes = parseInt(durationInput, 10);
    if (!isNaN(minutes) && minutes > 0) {
      setChainTaskDuration(ctId, minutes);
      debouncedSave();
    }
    setEditingDuration(null);
    setDurationInput('');
  };

  // Get uncompleted tasks for the dropdown
  const uncompletedTasks = Object.values(tasks).filter((t) => !t.completed);

  return (
    <div className="taskchain-container" style={{ padding: 20, maxWidth: 900, margin: '0 auto' }}>
      {/* Header with Calendar */}
      <div style={{ display: 'flex', gap: 30, marginBottom: 30 }}>
        {/* Calendar */}
        <div style={{ 
          background: 'var(--bg-secondary)', 
          padding: 16, 
          borderRadius: 'var(--radius-lg)',
          minWidth: 280,
        }}>
          <div style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(7, 1fr)', 
            gap: 4,
            textAlign: 'center',
            fontSize: 12,
          }}>
            {['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'].map((d) => (
              <div key={d} style={{ color: 'var(--text-secondary)', padding: '4px' }}>{d}</div>
            ))}
            {calendarDays.map((day, i) => (
              <button
                key={i}
                onClick={() => day.date && setSelectedChainDate(day.date)}
                style={{
                  padding: '6px',
                  borderRadius: 'var(--radius-sm)',
                  background: day.date === selectedChainDate ? 'var(--accent)' : 'transparent',
                  color: day.date === selectedChainDate ? 'white' : 'var(--text-primary)',
                  border: day.hasChain ? '2px solid var(--accent)' : 'none',
                  cursor: day.date ? 'pointer' : 'default',
                  opacity: day.date ? 1 : 0,
                  fontSize: 13,
                  fontWeight: day.date === selectedChainDate ? 600 : 400,
                }}
              >
                {day.day || ''}
              </button>
            ))}
          </div>
          
          <div style={{ marginTop: 12, fontSize: 12, color: 'var(--text-secondary)', display: 'flex', gap: 12 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, border: '2px solid var(--accent)', borderRadius: 2 }} />
              Has Chain
            </span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <span style={{ width: 8, height: 8, background: 'var(--accent)', borderRadius: 2 }} />
              Selected
            </span>
          </div>
        </div>

        {/* Actions */}
        <div style={{ flex: 1 }}>
          <h2 style={{ marginBottom: 16 }}>
            Task Chain: {new Date(selectedChainDate).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}
          </h2>
          
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button 
              className="btn btn-primary btn-sm"
              onClick={() => setShowTemplates(true)}
            >
              Load Template
            </button>
            {currentChain && (
              <button 
                className="btn btn-ghost btn-sm"
                onClick={() => setShowSaveTemplate(true)}
              >
                Save as Template
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Add Tasks Section */}
      <div style={{ 
        background: 'var(--bg-secondary)', 
        padding: 20, 
        borderRadius: 'var(--radius-lg)',
        marginBottom: 30,
      }}>
        <h3 style={{ marginBottom: 16, fontSize: 16 }}>Add to Chain</h3>
        
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <input
            type="text"
            value={newTaskTitle}
            onChange={(e) => setNewTaskTitle(e.target.value)}
            placeholder="New chain task (CT)"
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
            }}
            onKeyDown={(e) => e.key === 'Enter' && handleAddCT()}
          />
          <button className="btn btn-primary" onClick={handleAddCT}>
            + CT
          </button>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <select
            value={selectedRealTaskId}
            onChange={(e) => setSelectedRealTaskId(e.target.value)}
            style={{
              flex: 1,
              padding: '10px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-primary)',
            }}
          >
            <option value="">Select existing task...</option>
            {uncompletedTasks.map((t) => (
              <option key={t.id} value={t.id}>
                {t.title} ({categories[t.categoryId]?.name || 'Uncategorized'})
              </option>
            ))}
          </select>
          <button 
            className="btn btn-ghost" 
            onClick={handleAddRealTask}
            disabled={!selectedRealTaskId}
          >
            + Real Task
          </button>
        </div>
      </div>

      {/* Chain Flowchart */}
      {currentChain && currentChain.links.length > 0 ? (
        <div style={{ position: 'relative' }}>
          {currentChain.links.map((link, index) => {
            const isCT = link.type === 'ct';
            const ct = isCT ? chainTasks[link.taskId] : null;
            const realTask = !isCT ? tasks[link.taskId] : null;
            const task = ct || realTask;
            
            if (!task) return null;
            
            const isCompleted = task.completed;
            const isEditingDuration = isCT && editingDuration === link.taskId;
            
            return (
              <motion.div
                key={link.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  marginBottom: 8,
                }}
              >
                {/* Connector line */}
                {index > 0 && (
                  <div style={{
                    position: 'absolute',
                    left: 20,
                    top: -16,
                    width: 2,
                    height: 24,
                    background: 'var(--border)',
                  }} />
                )}
                
                {/* Task box */}
                <div
                  style={{
                    flex: 1,
                    display: 'flex',
                    alignItems: 'center',
                    gap: 12,
                    padding: '12px 16px',
                    background: isCT 
                      ? (isCompleted ? 'var(--bg-tertiary)' : 'hsla(200, 70%, 50%, 0.1)') 
                      : (isCompleted ? 'var(--bg-tertiary)' : 'hsla(270, 60%, 50%, 0.1)'),
                    border: `2px solid ${isCT 
                      ? (isCompleted ? 'var(--border)' : 'hsl(200, 70%, 50%)') 
                      : (isCompleted ? 'var(--border)' : 'hsl(270, 60%, 50%)')}`,
                    borderRadius: 'var(--radius-lg)',
                    opacity: isCompleted ? 0.7 : 1,
                  }}
                >
                  {/* Type badge */}
                  <span style={{
                    fontSize: 10,
                    padding: '2px 6px',
                    borderRadius: 'var(--radius-sm)',
                    background: isCT ? 'hsl(200, 70%, 50%)' : 'hsl(270, 60%, 50%)',
                    color: 'white',
                    fontWeight: 600,
                  }}>
                    {isCT ? 'CT' : 'TASK'}
                  </span>
                  
                  {/* Task title */}
                  <span style={{ 
                    flex: 1,
                    textDecoration: isCompleted ? 'line-through' : 'none',
                  }}>
                    {task.title}
                  </span>
                  
                  {/* Duration (for CTs) */}
                  {isCT && (
                    <>
                      {isEditingDuration ? (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            value={durationInput}
                            onChange={(e) => setDurationInput(e.target.value)}
                            placeholder="min"
                            style={{
                              width: 60,
                              padding: '4px 8px',
                              fontSize: 12,
                            }}
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') handleDurationSubmit(link.taskId);
                              if (e.key === 'Escape') {
                                setEditingDuration(null);
                                setDurationInput('');
                              }
                            }}
                          />
                          <button 
                            className="btn btn-xs"
                            onClick={() => handleDurationSubmit(link.taskId)}
                          >
                            ✓
                          </button>
                        </div>
                      ) : (
                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() => {
                            setEditingDuration(link.taskId);
                            setDurationInput(ct?.actualDuration?.toString() || '');
                          }}
                          style={{ fontSize: 12, color: 'var(--text-secondary)' }}
                        >
                          {ct?.actualDuration ? formatDuration(ct.actualDuration) : 'Add time'}
                        </button>
                      )}
                    </>
                  )}
                  
                  {/* Complete button */}
                  <button
                    className={`btn btn-sm ${isCompleted ? 'btn-ghost' : 'btn-primary'}`}
                    onClick={() => handleComplete(link, index)}
                  >
                    {isCompleted ? '↩ Undo' : '✓ Done'}
                  </button>
                  
                  {/* Remove button */}
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={() => {
                      removeChainLink(selectedChainDate, index);
                      debouncedSave();
                    }}
                    style={{ color: 'var(--text-tertiary)' }}
                  >
                    ×
                  </button>
                </div>
              </motion.div>
            );
          })}
        </div>
      ) : (
        <div style={{ 
          textAlign: 'center', 
          padding: 60, 
          color: 'var(--text-secondary)',
          background: 'var(--bg-secondary)',
          borderRadius: 'var(--radius-lg)',
        }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>⛓️</div>
          <h3>No tasks in this chain</h3>
          <p>Add chain tasks (CTs) or existing tasks above to build your workflow.</p>
        </div>
      )}

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
              style={{ maxWidth: 500 }}
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
                        padding: 12,
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-sm)',
                      }}
                    >
                      <div>
                        <strong>{template.name}</strong>
                        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                          {template.links.length} tasks
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
