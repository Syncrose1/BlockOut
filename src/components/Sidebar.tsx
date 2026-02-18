import { useStore } from '../store';
import { useMemo } from 'react';

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
  const timeBlocks = useStore((s) => s.timeBlocks);
  const activeBlockId = useStore((s) => s.activeBlockId);
  const showTimelessPool = useStore((s) => s.showTimelessPool);
  const categories = useStore((s) => s.categories);
  const tasks = useStore((s) => s.tasks);
  const setActiveBlock = useStore((s) => s.setActiveBlock);
  const setShowTimelessPool = useStore((s) => s.setShowTimelessPool);
  const setShowNewBlockModal = useStore((s) => s.setShowNewBlockModal);
  const setShowNewCategoryModal = useStore((s) => s.setShowNewCategoryModal);

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

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <div className="sidebar-logo">
          <div className="logo-icon">B</div>
          BlockOut
        </div>
      </div>

      <div className="sidebar-scroll">
        {/* Timeless Pool */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Pool</div>
          <button
            className={`sidebar-item ${showTimelessPool ? 'active' : ''}`}
            onClick={() => setShowTimelessPool(true)}
          >
            <span style={{ fontSize: 16 }}>&#x2B22;</span>
            All Tasks
            <span className="block-countdown">{totalTasks}</span>
          </button>
          {unassignedTasks > 0 && (
            <button
              className={`sidebar-item ${showTimelessPool ? '' : ''}`}
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
            return (
              <button
                key={block.id}
                className={`sidebar-item ${activeBlockId === block.id && !showTimelessPool ? 'active' : ''}`}
                onClick={() => setActiveBlock(block.id)}
              >
                <span className="dot" style={{ background: 'var(--accent)' }} />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {block.name}
                </span>
                <span className="block-countdown">
                  {total > 0 ? `${completedCount}/${total}` : ''} {formatCountdown(block.endDate)}
                </span>
              </button>
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
            {archivedBlocks.map((block) => (
              <button
                key={block.id}
                className={`sidebar-item ${activeBlockId === block.id && !showTimelessPool ? 'active' : ''}`}
                onClick={() => setActiveBlock(block.id)}
                style={{ opacity: 0.6 }}
              >
                <span className="dot" style={{ background: 'var(--text-tertiary)' }} />
                {block.name}
              </button>
            ))}
          </div>
        )}

        {/* Categories */}
        <div className="sidebar-section">
          <div className="sidebar-section-title">Categories</div>
          {Object.values(categories).map((cat) => (
            <div key={cat.id} className="sidebar-item" style={{ cursor: 'default' }}>
              <span className="dot" style={{ background: cat.color }} />
              {cat.name}
              <span className="block-countdown">
                {Object.values(tasks).filter((t) => t.categoryId === cat.id).length}
              </span>
            </div>
          ))}
          <button
            className="sidebar-item"
            onClick={() => setShowNewCategoryModal(true)}
            style={{ color: 'var(--accent)' }}
          >
            + New Category
          </button>
        </div>
      </div>
    </div>
  );
}
