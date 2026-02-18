import { useMemo, useState } from 'react';
import { useStore } from '../store';
import { AssignTasksModal } from './Modals';
import type { ViewMode } from '../types';

function formatCountdown(endDate: number): string {
  const now = Date.now();
  const diff = endDate - now;
  if (diff <= 0) return 'Block ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const weeks = Math.floor(days / 7);
  const remainingDays = days % 7;

  if (weeks > 0) {
    return `${weeks}w ${remainingDays}d ${hours}h remaining`;
  }
  if (days > 0) {
    return `${days}d ${hours}h remaining`;
  }
  return `${hours}h remaining`;
}

export function Topbar() {
  const activeBlockId = useStore((s) => s.activeBlockId);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const tasks = useStore((s) => s.tasks);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const setShowNewTaskModal = useStore((s) => s.setShowNewTaskModal);

  const [showAssign, setShowAssign] = useState(false);

  const block = activeBlockId ? timeBlocks[activeBlockId] : null;

  const { completed, total } = useMemo(() => {
    if (showTimelessPool) {
      const all = Object.values(tasks);
      return { completed: all.filter((t) => t.completed).length, total: all.length };
    }
    if (block) {
      const blockTasks = block.taskIds.map((id) => tasks[id]).filter(Boolean);
      return { completed: blockTasks.filter((t) => t.completed).length, total: blockTasks.length };
    }
    return { completed: 0, total: 0 };
  }, [tasks, block, showTimelessPool]);

  const progress = total > 0 ? (completed / total) * 100 : 0;

  const views: { id: ViewMode; label: string }[] = [
    { id: 'treemap', label: 'Treemap' },
    { id: 'kanban', label: 'Kanban' },
    { id: 'timeline', label: 'Timeline' },
  ];

  return (
    <>
      <div className="topbar">
        <div className="topbar-title">
          {showTimelessPool ? 'Task Pool' : block?.name || 'BlockOut'}
        </div>

        {block && !showTimelessPool && (
          <div className="topbar-countdown">
            {formatCountdown(block.endDate)}
          </div>
        )}

        <div className="topbar-progress">
          {total > 0 && (
            <>
              <div className="progress-bar">
                <div className="progress-bar-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="progress-text">{completed}/{total}</span>
            </>
          )}
        </div>

        <div className="view-switcher">
          {views.map((v) => (
            <button
              key={v.id}
              className={viewMode === v.id ? 'active' : ''}
              onClick={() => setViewMode(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {block && !showTimelessPool && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAssign(true)}
          >
            Assign Tasks
          </button>
        )}

        <button
          className="btn btn-primary btn-sm"
          onClick={() => setShowNewTaskModal(true)}
        >
          + Task
        </button>
      </div>

      {showAssign && block && (
        <AssignTasksModal blockId={block.id} onClose={() => setShowAssign(false)} />
      )}
    </>
  );
}
