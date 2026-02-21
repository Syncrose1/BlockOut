import { useMemo } from 'react';
import { useStore } from '../store';
import { debouncedSave } from '../utils/persistence';
import type { Task, Category } from '../types';

export function Timeline() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const toggleTask = useStore((s) => s.toggleTask);

  const block = activeBlockId ? timeBlocks[activeBlockId] : null;

  const visibleTasks = useMemo(() => {
    if (showTimelessPool) return Object.values(tasks);
    if (block) {
      return block.taskIds.map((id) => tasks[id]).filter(Boolean);
    }
    return [];
  }, [tasks, block, showTimelessPool]);

  const rows = useMemo(() => {
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
        <div className="empty-state-icon">&#x2500;</div>
        <h3>No tasks to display</h3>
        <p>Add tasks to see them on the timeline.</p>
      </div>
    );
  }

  // For the timeline, spread tasks evenly across the block duration
  const totalDuration = block ? block.endDate - block.startDate : 1;

  return (
    <div className="timeline-container">
      {/* Under construction notice */}
      <div style={{
        background: 'hsl(45, 90%, 50%, 0.15)',
        border: '1px solid hsl(45, 90%, 50%, 0.3)',
        borderRadius: 'var(--radius-md)',
        padding: '12px 16px',
        margin: '16px 16px 0',
        color: 'hsl(45, 90%, 60%)',
        fontSize: '14px',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
      }}>
        <span style={{ fontSize: '18px' }}>🚧</span>
        <span>Timeline is still under construction. Treemap is fully functional in the meantime.</span>
      </div>
      
      {/* Week headers */}
      {block && (
        <div style={{ display: 'flex', marginBottom: 12, paddingLeft: 140 }}>
          {Array.from({ length: Math.ceil(totalDuration / (7 * 24 * 60 * 60 * 1000)) }).map((_, i) => (
            <div
              key={i}
              style={{
                flex: 1,
                fontSize: 11,
                color: 'var(--text-tertiary)',
                fontFamily: 'var(--font-mono)',
                borderLeft: '1px solid var(--border)',
                paddingLeft: 6,
              }}
            >
              Week {i + 1}
            </div>
          ))}
        </div>
      )}

      {rows.map(({ category, tasks: catTasks }) => (
        <div key={category.id}>
          <div className="timeline-row" style={{ marginBottom: 4 }}>
            <div className="timeline-label" style={{ color: category.color, fontWeight: 600 }}>
              {category.name}
            </div>
            <div className="timeline-track" style={{ background: 'transparent', height: 4 }}>
              <div style={{ width: '100%', height: '100%', background: category.color, opacity: 0.15, borderRadius: 2 }} />
            </div>
          </div>
          {catTasks.map((task, i) => {
            // Spread tasks evenly within their category
            const taskStart = i / catTasks.length;
            const taskWidth = Math.max(1 / catTasks.length, 0.05);
            return (
              <div key={task.id} className="timeline-row">
                <div className="timeline-label" style={{ fontSize: 11 }} />
                <div className="timeline-track">
                  <div
                    className="timeline-task-bar"
                    style={{
                      left: `${taskStart * 100}%`,
                      width: `${taskWidth * 100}%`,
                      background: task.completed ? category.color : 'var(--bg-hover)',
                      opacity: task.completed ? 1 : 0.7,
                      borderLeft: `3px solid ${category.color}`,
                    }}
                    onClick={() => {
                      toggleTask(task.id);
                      debouncedSave();
                    }}
                    title={task.title}
                  >
                    {task.title}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
