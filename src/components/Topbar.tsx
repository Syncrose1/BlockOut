import { useMemo, useState, useCallback } from 'react';
import { useStore } from '../store';
import { AssignTasksModal } from './Modals';
import { exportTreemapAsImage } from './Treemap';
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
  const focusMode = useStore((s) => s.focusMode);
  const exitFocusMode = useStore((s) => s.exitFocusMode);
  const focusedCategoryId = useStore((s) => s.pomodoro.focusedCategoryId);
  const categories = useStore((s) => s.categories);

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

  const handleExport = useCallback(async () => {
    const dataUrl = await exportTreemapAsImage();
    if (!dataUrl) return;
    const link = document.createElement('a');
    link.download = `blockout-${block?.name || 'treemap'}-${new Date().toISOString().slice(0, 10)}.png`;
    link.href = dataUrl;
    link.click();
  }, [block]);

  const focusedCategory = focusedCategoryId ? categories[focusedCategoryId] : null;

  const syncStatus = useStore((s) => s.syncStatus);
  const setSyncSettingsOpen = useStore((s) => s.setSyncSettingsOpen);

  const syncDotColor: Record<string, string> = {
    idle: 'var(--text-tertiary)',
    syncing: 'hsl(48, 90%, 60%)',
    synced: 'hsl(140, 60%, 50%)',
    error: 'hsl(0, 72%, 62%)',
  };
  const syncTitle: Record<string, string> = {
    idle: 'Cloud sync (not configured)',
    syncing: 'Syncing…',
    synced: 'Synced',
    error: 'Sync error — click to configure',
  };

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

        {/* Focus mode indicator */}
        {focusMode && focusedCategory && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '4px 12px',
            background: focusedCategory.color.replace('62%)', '15%)'),
            border: `1px solid ${focusedCategory.color.replace('62%)', '30%)')}`,
            borderRadius: 'var(--radius-sm)',
            fontSize: 12,
            fontWeight: 600,
            color: focusedCategory.color,
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%',
              background: focusedCategory.color,
              boxShadow: `0 0 8px ${focusedCategory.color}`,
              animation: 'focus-pulse 2s ease-in-out infinite',
            }} />
            Focusing: {focusedCategory.name}
            <button
              onClick={exitFocusMode}
              style={{
                marginLeft: 4,
                fontSize: 14,
                color: 'var(--text-secondary)',
                cursor: 'pointer',
                background: 'none',
                border: 'none',
              }}
              title="Exit focus mode"
            >
              &times;
            </button>
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

        {/* Export button */}
        {viewMode === 'treemap' && total > 0 && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={handleExport}
            title="Export treemap as PNG"
          >
            Export
          </button>
        )}

        {block && !showTimelessPool && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAssign(true)}
          >
            Assign Tasks
          </button>
        )}

        {/* Sync status */}
        <button
          title={syncTitle[syncStatus]}
          onClick={() => setSyncSettingsOpen(true)}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            display: 'flex', alignItems: 'center', gap: 5,
            color: 'var(--text-tertiary)', fontSize: 12, padding: '4px 6px',
          }}
        >
          <span style={{
            width: 7, height: 7, borderRadius: '50%',
            background: syncDotColor[syncStatus],
            display: 'inline-block',
            transition: 'background 0.3s',
          }} />
          Sync
        </button>

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
