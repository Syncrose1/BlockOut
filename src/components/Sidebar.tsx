import { useStore } from '../store';
import { useMemo, useState } from 'react';
import { debouncedSave } from '../utils/persistence';
import { CategorySettingsModal, BlockSettingsModal } from './Modals';

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

  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const categories = useStore((s) => s.categories);
  const tasks = useStore((s) => s.tasks);
  const streak = useStore((s) => s.streak);
  const drag = useStore((s) => s.drag);
  const setActiveBlock = useStore((s) => s.setActiveBlock);
  const setShowTimelessPool = useStore((s) => s.setShowTimelessPool);
  const setShowNewBlockModal = useStore((s) => s.setShowNewBlockModal);
  const setShowNewCategoryModal = useStore((s) => s.setShowNewCategoryModal);
  const setDragOverBlock = useStore((s) => s.setDragOverBlock);
  const setDragOverPool = useStore((s) => s.setDragOverPool);
  const setDraggedTask = useStore((s) => s.setDraggedTask);
  const assignTaskToBlock = useStore((s) => s.assignTaskToBlock);
  const removeTaskFromBlock = useStore((s) => s.removeTaskFromBlock);
  const enterFocusMode = useStore((s) => s.enterFocusMode);
  const focusMode = useStore((s) => s.focusMode);
  const pomodoro = useStore((s) => s.pomodoro);

  const sortedBlocks = useMemo(() => {
    return Object.values(timeBlocks).sort((a, b) => b.createdAt - a.createdAt);
  }, [timeBlocks]);

  const activeBlocks = sortedBlocks.filter((b) => b.endDate > Date.now());
  const archivedBlocks = sortedBlocks.filter((b) => b.endDate <= Date.now());

  const totalTasks = Object.keys(tasks).length;
  const unassignedTasks = useMemo(() => {
    const assignedIds = new Set(
      Object.values(timeBlocks).flatMap((b) => b.taskIds)
    );
    return Object.values(tasks).filter((t) => !assignedIds.has(t.id)).length;
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
    const taskId = drag.draggedTaskId;
    if (taskId) {
      assignTaskToBlock(taskId, blockId);
      debouncedSave();
    }
    setDraggedTask(null);
    setDragOverBlock(null);
  };

  const handleDropPool = (e: React.DragEvent) => {
    e.preventDefault();
    const taskId = drag.draggedTaskId;
    if (taskId) {
      // Remove from all blocks (send back to pool)
      Object.values(timeBlocks).forEach((block) => {
        if (block.taskIds.includes(taskId)) {
          removeTaskFromBlock(taskId, block.id);
        }
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

  // Streak flame levels based on current streak
  const flameLevel = streak.currentStreak === 0 ? 0
    : streak.currentStreak <= 2 ? 1
    : streak.currentStreak <= 6 ? 2
    : streak.currentStreak <= 13 ? 3
    : 4;

  const flameColors = ['var(--text-tertiary)', 'hsl(30, 80%, 55%)', 'hsl(20, 90%, 55%)', 'hsl(10, 95%, 55%)', 'hsl(0, 100%, 55%)'];
  const flameScales = [1, 1, 1.1, 1.2, 1.4];

  // Helper to get block item class with drag states
  const getBlockItemClass = (blockId: string, isActive: boolean) => {
    const isDragOver = drag.dragOverBlockId === blockId;
    const isDraggingGlobal = drag.isDragging;
    
    let className = 'sidebar-item';
    if (isActive) className += ' active';
    if (isDragOver) className += ' drag-over';
    if (isDraggingGlobal && !isDragOver) className += ' drag-preview';
    
    return className;
  };

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <img src="/bo-logo-v3.png" alt="" height="24" style={{ imageRendering: 'pixelated' }} />
          BlockOut
        </div>
        {/* Streak display */}
        {streak.currentStreak > 0 && (
          <div className="streak-display" style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginTop: 8,
            fontSize: 12,
            color: flameColors[flameLevel],
          }}>
            <span style={{
              fontSize: 18 * flameScales[flameLevel],
              filter: `drop-shadow(0 0 ${flameLevel * 3}px ${flameColors[flameLevel]})`,
              transition: 'all 0.3s ease',
              display: 'inline-block',
              animation: flameLevel >= 2 ? 'flame-dance 1.5s ease-in-out infinite' : 'none',
            }}>
              &#x1F525;
            </span>
            <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
              {streak.currentStreak}d streak
            </span>
            {streak.longestStreak > streak.currentStreak && (
              <span style={{ color: 'var(--text-tertiary)', fontSize: 10 }}>
                (best: {streak.longestStreak}d)
              </span>
            )}
          </div>
        )}
      </div>

      <div className="sidebar-scroll">
        {/* Timeless Pool */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Pool</div>
          <button
            className={`sidebar-item ${showTimelessPool ? 'active' : ''} ${drag.dragOverPool ? 'drag-over' : ''} ${drag.isDragging && !drag.dragOverPool ? 'drag-preview' : ''}`}
            onClick={() => setShowTimelessPool(true)}
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
              className="sidebar-item"
              onClick={() => setShowTimelessPool(true)}
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
            const isActive = activeBlockId === block.id && !showTimelessPool;
            return (
              <div key={block.id} style={{ display: 'flex', alignItems: 'center' }}>
                <button
                  className={getBlockItemClass(block.id, isActive)}
                  onClick={() => setActiveBlock(block.id)}
                  onDragOver={(e) => handleDragOver(e, block.id)}
                  onDrop={(e) => handleDrop(e, block.id)}
                  onDragLeave={handleDragLeave}
                  style={{ flex: 1 }}
                >
                  <span className="dot" style={{ background: 'var(--accent)' }} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {block.name}
                  </span>
                  <span className="block-countdown">
                    {total > 0 ? `${completedCount}/${total}` : ''} {formatCountdown(block.endDate)}
                  </span>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); setBlockSettingsId(block.id); }}
                  title="Block settings"
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
              const isActive = activeBlockId === block.id && !showTimelessPool;
              return (
                <div key={block.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <button
                    className={getBlockItemClass(block.id, isActive)}
                    onClick={() => setActiveBlock(block.id)}
                    style={{ flex: 1, opacity: 0.6 }}
                  >
                    <span className="dot" style={{ background: 'var(--text-tertiary)' }} />
                    <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {block.name}
                    </span>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setBlockSettingsId(block.id); }}
                    title="Block settings"
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
                  onClick={() => enterFocusMode(cat.id)}
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
    </div>
  );
}
