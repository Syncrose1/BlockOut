import { useStore } from '../store';
import { useMemo, useState } from 'react';
import { debouncedSave } from '../utils/persistence';
import { CategorySettingsModal, BlockSettingsModal } from './Modals';
import { AnalyticsModal } from './AnalyticsModal';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const getViewMode = (): string => (localStorage.getItem('blockout-view-mode') as any) || 'treemap';

function formatCountdown(endDate: number): string {
  const now = Date.now();
  const diff = endDate - now;
  if (diff <= 0) return 'ended';
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  if (days > 7) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    return remainingDays > 0 ? `${weeks}w ${remainingDays}d` : `${weeks}w`;
  }
  if (days > 0) return `${days}d`;
  const hours = Math.floor(diff / (1000 * 60 * 60));
  return `${hours}h`;
}

export function Sidebar() {
  const [categorySettingsId, setCategorySettingsId] = useState<string | null>(null);
  const [blockSettingsId, setBlockSettingsId] = useState<string | null>(null);
  const [showAnalyticsModal, setShowAnalyticsModal] = useState(false);

  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const categories = useStore((s) => s.categories);
  const tasks = useStore((s) => s.tasks);
  const streak = useStore((s) => s.streak);
  const drag = useStore((s) => s.drag);
  const setActiveBlock = useStore((s) => s.setActiveBlock);
  const setShowTimelessPool = useStore((s) => s.setShowTimelessPool);
  const poolViewMode = useStore((s) => s.poolViewMode);
  const setPoolViewMode = useStore((s) => s.setPoolViewMode);
  const setShowNewBlockModal = useStore((s) => s.setShowNewBlockModal);
  const setShowNewCategoryModal = useStore((s) => s.setShowNewCategoryModal);
  const setViewMode = useStore((s) => s.setViewMode);
  const viewMode = useStore((s) => s.viewMode);
  const setDragOverBlock = useStore((s) => s.setDragOverBlock);
  const setDragOverPool = useStore((s) => s.setDragOverPool);
  const setDraggedTask = useStore((s) => s.setDraggedTask);
  const assignTaskToBlock = useStore((s) => s.assignTaskToBlock);
  const removeTaskFromBlock = useStore((s) => s.removeTaskFromBlock);
  const bulkAssignTasksToBlock = useStore((s) => s.bulkAssignTasksToBlock);
  const draggedTaskIds = useStore((s) => s.drag.draggedTaskIds);
  const enterFocusMode = useStore((s) => s.enterFocusMode);
  const exitFocusMode = useStore((s) => s.exitFocusMode);
  const focusMode = useStore((s) => s.focusMode);
  const pomodoro = useStore((s) => s.pomodoro);

  const sortedBlocks = useMemo(() => {
    return Object.values(timeBlocks).sort((a, b) => b.createdAt - a.createdAt);
  }, [timeBlocks]);

  const activeBlocks = sortedBlocks.filter((b) => b.endDate > Date.now());
  const archivedBlocks = sortedBlocks.filter((b) => b.endDate <= Date.now());

  const totalTasks = Object.keys(tasks).length;
  const unassignedTasks = useMemo(() => {
    const now = Date.now();
    const activeAssignedIds = new Set(
      Object.values(timeBlocks)
        .filter((b) => b.endDate > now)
        .flatMap((b) => b.taskIds)
    );
    return Object.values(tasks).filter((t) => !activeAssignedIds.has(t.id)).length;
  }, [tasks, timeBlocks]);

  // Drag handlers for blocks
  const handleDragOver = (e: React.DragEvent, blockId: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverBlock(blockId);
  };

  const handleDragOverPool = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverPool(true);
  };

  const handleDrop = (e: React.DragEvent, blockId: string) => {
    e.preventDefault();
    // Check for multiple dragged tasks first
    const taskIds = draggedTaskIds.length > 0 ? draggedTaskIds : (drag.draggedTaskId ? [drag.draggedTaskId] : []);
    
    if (taskIds.length > 0) {
      if (taskIds.length === 1) {
        assignTaskToBlock(taskIds[0], blockId);
      } else {
        bulkAssignTasksToBlock(taskIds, blockId);
      }
      debouncedSave();
    }
    setDraggedTask(null);
    setDragOverBlock(null);
  };

  const handleDropPool = (e: React.DragEvent) => {
    e.preventDefault();
    // Check for multiple dragged tasks first
    const taskIds = draggedTaskIds.length > 0 ? draggedTaskIds : (drag.draggedTaskId ? [drag.draggedTaskId] : []);
    
    if (taskIds.length > 0) {
      // Remove all dragged tasks from all blocks (send back to pool)
      taskIds.forEach((taskId) => {
        Object.values(timeBlocks).forEach((block) => {
          if (block.taskIds.includes(taskId)) {
            removeTaskFromBlock(taskId, block.id);
          }
        });
      });
      debouncedSave();
    }
    setDraggedTask(null);
    setDragOverPool(false);
  };

  const handleDragLeave = () => {
    setDragOverBlock(null);
    setDragOverPool(false);
  };

  // Helper to check if a block is a valid drop target for the dragged task(s)
  const isValidDropTarget = (blockId: string | 'pool'): boolean => {
    // Check for multiple dragged tasks first
    const taskIds = draggedTaskIds.length > 0 ? draggedTaskIds : (drag.draggedTaskId ? [drag.draggedTaskId] : []);
    if (taskIds.length === 0) return false;
    
    if (blockId === 'pool') {
      // Pool is valid if ANY dragged task is currently in a block
      return Object.values(timeBlocks).some(b => taskIds.some(taskId => b.taskIds.includes(taskId)));
    } else {
      // Block is valid if it doesn't already contain ALL the dragged tasks
      const block = timeBlocks[blockId];
      if (!block) return false;
      return taskIds.some(taskId => !block.taskIds.includes(taskId));
    }
  };

  // Helper to get block item class with drag states
  const getBlockItemClass = (blockId: string, isActive: boolean) => {
    const isDragOver = drag.dragOverBlockId === blockId;
    const isDraggingGlobal = drag.isDragging;
    const isValidTarget = isValidDropTarget(blockId);
    
    let className = 'sidebar-item';
    if (isActive) className += ' active';
    if (isDragOver) className += ' drag-over';
    if (isDraggingGlobal && isValidTarget && !isDragOver) className += ' drag-preview';
    
    return className;
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header" style={{ textAlign: 'center' }}>
        <div className="sidebar-logo" style={{ justifyContent: 'center' }}>
          <img src="/bo-logo-v3.png" alt="" height="24" style={{ imageRendering: 'pixelated' }} />
          BlockOut
        </div>
        {/* Streak display */}
        {streak.currentStreak > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', marginTop: 8 }}>
            <button
              onClick={() => setShowAnalyticsModal(true)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                padding: '6px 10px',
                background: 'transparent',
                border: '1px solid hsl(210, 80%, 55%)',
                borderRadius: 'var(--radius-sm)',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'hsla(210, 80%, 55%, 0.1)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'transparent';
              }}
            >
              <span style={{
                fontSize: 11,
                fontWeight: 700,
                color: 'hsl(210, 80%, 60%)',
                letterSpacing: '0.25em',
                fontFamily: 'var(--font-mono)',
                textTransform: 'uppercase',
              }}>
                {streak.currentStreak}<span style={{ textTransform: 'lowercase' }}>d</span> streak
              </span>
            </button>
          </div>
        )}
      </div>

      <div className="sidebar-scroll">
        {/* Task Chain */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Workflow</div>
          <button
            className={`sidebar-item ${viewMode === 'taskchain' ? 'active' : ''}`}
            onClick={() => setViewMode('taskchain')}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
              <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
              <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
            </svg>
            Task Chain
          </button>
        </div>

        {/* Timeless Pool */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Pool</div>
          <button
            className={`sidebar-item ${showTimelessPool && poolViewMode === 'all' && viewMode !== 'taskchain' ? 'active' : ''} ${drag.dragOverPool ? 'drag-over' : ''} ${drag.isDragging && !drag.dragOverPool ? 'drag-preview' : ''}`}
            onClick={() => {
              setPoolViewMode('all');
              setShowTimelessPool(true);
              setViewMode('treemap');
            }}
            onDragOver={handleDragOverPool}
            onDrop={handleDropPool}
            onDragLeave={handleDragLeave}
          >
            <span style={{ fontSize: 16 }}>&#x2B22;</span>
            All Tasks
            <span className="block-countdown">{totalTasks}</span>
          </button>
          {unassignedTasks > 0 && (
            <button
              className={`sidebar-item ${showTimelessPool && poolViewMode === 'unassigned' && viewMode !== 'taskchain' ? 'active' : ''}`}
              onClick={() => {
                setPoolViewMode('unassigned');
                setShowTimelessPool(true);
                setViewMode('treemap');
              }}
              style={{ paddingLeft: 40, fontSize: 12 }}
            >
              Unassigned
              <span className="block-countdown">{unassignedTasks}</span>
            </button>
          )}
        </div>

        {/* Active Blocks */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Active Blocks</div>
          {activeBlocks.length === 0 && (
            <div style={{ padding: '4px 16px', fontSize: 12, color: 'var(--text-tertiary)' }}>
              No active blocks
            </div>
          )}
          {activeBlocks.map((block) => {
            const completedCount = block.taskIds.filter((id) => tasks[id]?.completed).length;
            const total = block.taskIds.length;
            const isActive = activeBlockId === block.id && !showTimelessPool && viewMode !== 'taskchain';
            return (
              <div key={block.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <button
                  className={getBlockItemClass(block.id, isActive)}
                  onClick={() => {
                    setActiveBlock(block.id);
                    setViewMode('treemap');
                  }}
                  onDragOver={(e) => handleDragOver(e, block.id)}
                  onDrop={(e) => handleDrop(e, block.id)}
                  onDragLeave={handleDragLeave}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  <span className="dot" style={{ background: 'var(--accent)', flexShrink: 0 }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                    {block.name}
                  </span>
                  <span className="block-countdown" style={{ flexShrink: 0 }}>
                    {total > 0 ? `${completedCount}/${total}` : ''} {formatCountdown(block.endDate)}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setBlockSettingsId(block.id); }}
                  title="Block settings"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-tertiary)', padding: '4px',
                    fontSize: 13, lineHeight: 1,
                    opacity: 0.6,
                    width: 24,
                    height: 24,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                >
                  ⚙
                </button>
              </div>
            );
          })}
          <button
            className="sidebar-item"
            onClick={() => setShowNewBlockModal(true)}
            style={{ color: 'var(--accent)' }}
          >
            + New Block
          </button>
        </div>

        {/* Archived Blocks */}
        {archivedBlocks.length > 0 && (
          <div className="sidebar-section">
            <div className="sidebar-section-title">Archived</div>
            {archivedBlocks.map((block) => {
              const isActive = activeBlockId === block.id && !showTimelessPool && viewMode !== 'taskchain';
              return (
                <div key={block.id} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    className={getBlockItemClass(block.id, isActive)}
                    onClick={() => {
                      setActiveBlock(block.id);
                      setViewMode('treemap');
                    }}
                    style={{ flex: 1, opacity: 0.6, minWidth: 0 }}
                  >
                    <span className="dot" style={{ background: 'var(--text-tertiary)', flexShrink: 0 }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
                      {block.name}
                    </span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setBlockSettingsId(block.id); }}
                    title="Block settings"
                    style={{
                      background: 'none', border: 'none', cursor: 'pointer',
                      color: 'var(--text-tertiary)', padding: '4px',
                      fontSize: 13, lineHeight: 1,
                      opacity: 0.6,
                      width: 24,
                      height: 24,
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      flexShrink: 0,
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                    onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                  >
                    ⚙
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {/* Categories — click to enter focus mode */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Categories</div>
          {Object.values(categories).map((cat) => {
            const isFocused = focusMode && pomodoro.focusedCategoryId === cat.id;
            return (
              <div key={cat.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  className={`sidebar-item ${isFocused ? 'active' : ''}`}
                  style={{ flex: 1 }}
                  onClick={() => {
                    if (focusMode && pomodoro.focusedCategoryId === cat.id) {
                      exitFocusMode();
                    } else {
                      enterFocusMode(cat.id);
                    }
                  }}
                  title="Click to enter focus mode for this category"
                >
                  <span className="dot" style={{
                    background: cat.color,
                    boxShadow: isFocused ? `0 0 8px ${cat.color}` : 'none',
                  }} />
                  {cat.name}
                  <span className="block-countdown">
                    {Object.values(tasks).filter((t) => t.categoryId === cat.id).length}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setCategorySettingsId(cat.id); }}
                  title="Category settings"
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-tertiary)', padding: '4px 6px',
                    fontSize: 13, lineHeight: 1, flexShrink: 0,
                    opacity: 0.6,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.6')}
                >
                  ⚙
                </button>
              </div>
            );
          })}
          <button
            className="sidebar-item"
            onClick={() => setShowNewCategoryModal(true)}
            style={{ color: 'var(--accent)' }}
          >
            + New Category
          </button>
        </div>
      </div>

      {/* Footer - Help & Tour */}
      <div
        style={{
          marginTop: 'auto',
          padding: '16px',
          borderTop: '1px solid var(--border)',
          fontSize: 12,
        }}
      >
        <button
          onClick={() => {
            // Reset onboarding state and restart
            localStorage.removeItem('blockout-onboarding');
            window.location.reload();
          }}
          style={{
            background: 'none',
            border: 'none',
            color: 'var(--text-tertiary)',
            cursor: 'pointer',
            fontSize: 12,
            padding: 0,
            display: 'flex',
            alignItems: 'center',
            gap: 6,
          }}
        >
          <span>?</span>
          Restart Tour
        </button>
      </div>

      {categorySettingsId && (
        <CategorySettingsModal
          categoryId={categorySettingsId}
          onClose={() => setCategorySettingsId(null)}
        />
      )}

      {blockSettingsId && (
        <BlockSettingsModal
          blockId={blockSettingsId}
          onClose={() => setBlockSettingsId(null)}
        />
      )}

      <AnalyticsModal open={showAnalyticsModal} onClose={() => setShowAnalyticsModal(false)} />
    </div>
  );
}
