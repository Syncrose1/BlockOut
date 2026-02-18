import { useMemo, useCallback, useState } from 'react';
import { useStore } from '../store';
import { debouncedSave } from '../utils/persistence';
import type { Task, Category } from '../types';

export function Kanban() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const toggleTask = useStore((s) => s.toggleTask);
  const focusMode = useStore((s) => s.focusMode);
  const focusedCategoryId = useStore((s) => s.pomodoro.focusedCategoryId);
  const setDraggedTask = useStore((s) => s.setDraggedTask);
  const setEditingTaskId = useStore((s) => s.setEditingTaskId);
  const [hoveredCardId, setHoveredCardId] = useState<string | null>(null);

  const visibleTasks = useMemo(() => {
    if (showTimelessPool) return Object.values(tasks);
    if (activeBlockId && timeBlocks[activeBlockId]) {
      return timeBlocks[activeBlockId].taskIds.map((id) => tasks[id]).filter(Boolean);
    }
    return [];
  }, [tasks, timeBlocks, activeBlockId, showTimelessPool]);

  const columns = useMemo(() => {
    const catMap = new Map<string, { category: Category; tasks: Task[] }>();
    visibleTasks.forEach((task) => {
      const cat = categories[task.categoryId];
      if (!cat) return;
      if (!catMap.has(cat.id)) catMap.set(cat.id, { category: cat, tasks: [] });
      catMap.get(cat.id)!.tasks.push(task);
    });
    return Array.from(catMap.values());
  }, [visibleTasks, categories]);

  const isTaskLocked = useCallback((task: Task): boolean => {
    if (!task.dependsOn || task.dependsOn.length === 0) return false;
    return task.dependsOn.some((depId) => !tasks[depId]?.completed);
  }, [tasks]);

  const handleDragStart = useCallback((e: React.DragEvent, taskId: string) => {
    setDraggedTask(taskId);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', taskId);
  }, [setDraggedTask]);

  const handleDragEnd = useCallback(() => {
    setDraggedTask(null);
  }, [setDraggedTask]);

  if (visibleTasks.length === 0) {
    return (
      <div className="empty-state">
        <div className="empty-state-icon">&#x2637;</div>
        <h3>No tasks to display</h3>
        <p>Add tasks to see them organized by category.</p>
      </div>
    );
  }

  return (
    <div className="kanban-container">
      {columns.map(({ category, tasks: colTasks }) => {
        const completed = colTasks.filter((t) => t.completed).length;
        const isDimmed = focusMode && focusedCategoryId && focusedCategoryId !== category.id;
        return (
          <div
            key={category.id}
            className="kanban-column"
            style={{
              opacity: isDimmed ? 0.2 : 1,
              transition: 'opacity 0.3s ease',
            }}
          >
            <div
              className="kanban-column-header"
              style={{ borderBottom: `2px solid ${category.color}22` }}
            >
              <span className="dot" style={{ background: category.color }} />
              {category.name}
              <span className="count">{completed}/{colTasks.length}</span>
            </div>
            <div className="kanban-column-body">
              {colTasks
                .sort((a, b) => {
                  // locked last, then incomplete, then completed
                  const aLocked = isTaskLocked(a);
                  const bLocked = isTaskLocked(b);
                  if (aLocked !== bLocked) return aLocked ? 1 : -1;
                  return a.completed === b.completed ? 0 : a.completed ? 1 : -1;
                })
                .map((task) => {
                  const locked = isTaskLocked(task);
                  const pendingDeps = locked
                    ? (task.dependsOn || [])
                        .filter((depId) => !tasks[depId]?.completed)
                        .map((depId) => tasks[depId]?.title || 'Unknown')
                    : [];

                  return (
                    <div
                      key={task.id}
                      className={`kanban-card${task.completed ? ' completed' : ''}${locked ? ' locked' : ''}`}
                      draggable={!locked}
                      onDragStart={(e) => !locked && handleDragStart(e, task.id)}
                      onDragEnd={handleDragEnd}
                      onMouseEnter={() => setHoveredCardId(task.id)}
                      onMouseLeave={() => setHoveredCardId(null)}
                      onClick={() => {
                        if (!locked) {
                          toggleTask(task.id);
                          debouncedSave();
                        }
                      }}
                      title={locked ? `Waiting on: ${pendingDeps.join(', ')}` : undefined}
                    >
                      {locked ? (
                        <div className="lock-icon" title={`Requires: ${pendingDeps.join(', ')}`}>
                          🔒
                        </div>
                      ) : (
                        <div
                          className={`check ${task.completed ? 'done' : ''}`}
                          style={task.completed ? { borderColor: category.color, background: category.color } : {}}
                        >
                          {task.completed && <span style={{ fontSize: 10, color: 'white' }}>&#x2713;</span>}
                        </div>
                      )}
                      <span className="kanban-card-title">{task.title}</span>
                      {hoveredCardId === task.id && task.notes && task.notes.trim() !== '' && (
                        <span className="kanban-card-notes" title={task.notes}>
                          {task.notes}
                        </span>
                      )}
                      {hoveredCardId === task.id && task.actualDuration != null && task.actualDuration > 0 && (
                        <span className="task-duration-badge" title="Actual time spent">
                          {task.actualDuration >= 60
                            ? `${(task.actualDuration / 60).toFixed(1)}h`
                            : `${task.actualDuration}m`}
                        </span>
                      )}
                      {hoveredCardId === task.id && (
                        <button
                          className="card-edit-btn"
                          title="Edit task"
                          onClick={(e) => {
                            e.stopPropagation();
                            setEditingTaskId(task.id);
                          }}
                          style={{
                            background: 'none',
                            border: 'none',
                            cursor: 'pointer',
                            padding: '0 3px',
                            color: 'var(--text-tertiary)',
                            fontSize: 16,
                            lineHeight: 1,
                            flexShrink: 0,
                          }}
                        >
                          ···
                        </button>
                      )}
                    </div>
                  );
                })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
