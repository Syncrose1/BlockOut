import { useMemo } from 'react';
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
        return (
          <div key={category.id} className="kanban-column">
            <div className="kanban-column-header">
              <span className="dot" style={{ background: category.color }} />
              {category.name}
              <span className="count">{completed}/{colTasks.length}</span>
            </div>
            <div className="kanban-column-body">
              {colTasks
                .sort((a, b) => (a.completed === b.completed ? 0 : a.completed ? 1 : -1))
                .map((task) => (
                  <div
                    key={task.id}
                    className={`kanban-card ${task.completed ? 'completed' : ''}`}
                    onClick={() => {
                      toggleTask(task.id);
                      debouncedSave();
                    }}
                  >
                    <div
                      className={`check ${task.completed ? 'done' : ''}`}
                      style={task.completed ? { borderColor: category.color, background: category.color } : {}}
                    >
                      {task.completed && <span style={{ fontSize: 10, color: 'white' }}>✓</span>}
                    </div>
                    {task.title}
                  </div>
                ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
