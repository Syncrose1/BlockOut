import { useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { AssignTasksModal, ExportImportModal, AITaskGeneratorModal } from './Modals';
import { exportTreemapAsImage } from './Treemap';
import { exportToFile } from '../utils/analytics';
import { saveToCloud } from '../utils/persistence';
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
  const poolViewMode = useStore((s) => s.poolViewMode);
  const tasks = useStore((s) => s.tasks);
  const viewMode = useStore((s) => s.viewMode);
  const setViewMode = useStore((s) => s.setViewMode);
  const setShowNewTaskModal = useStore((s) => s.setShowNewTaskModal);
  const focusMode = useStore((s) => s.focusMode);
  const exitFocusMode = useStore((s) => s.exitFocusMode);
  const focusedCategoryId = useStore((s) => s.pomodoro.focusedCategoryId);
  const categories = useStore((s) => s.categories);

  const [showAssign, setShowAssign] = useState(false);
  const [showExportImport, setShowExportImport] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [showAITaskGenerator, setShowAITaskGenerator] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

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
    { id: 'timeline', label: 'Timeline' },
    { id: 'taskchain', label: 'Task Chain' },
  ];

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setExportDropdownOpen(false);
      }
    };
    
    if (exportDropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [exportDropdownOpen]);

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

  const [retrying, setRetrying] = useState(false);

  const handleSyncRetry = useCallback(async () => {
    setRetrying(true);
    try {
      await saveToCloud();
    } catch {
      // error state will be set by saveToCloud via setSyncStatus
    } finally {
      setRetrying(false);
    }
  }, []);

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
          {showTimelessPool
            ? poolViewMode === 'unassigned'
              ? 'Unassigned Tasks'
              : 'Task Pool'
            : block?.name || 'BlockOut'}
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
          {views.filter(v => v.id !== 'taskchain').map((v) => (
            <button
              key={v.id}
              className={viewMode === v.id ? 'active' : ''}
              onClick={() => setViewMode(v.id)}
            >
              {v.label}
            </button>
          ))}
        </div>

        {/* Task Chain - separated as it's a function, not a view */}
        <button
          className={`btn btn-ghost btn-sm ${viewMode === 'taskchain' ? 'active' : ''}`}
          onClick={() => setViewMode('taskchain')}
          style={{
            marginLeft: '8px',
            padding: '5px 12px',
            fontSize: '13px',
            fontWeight: 600,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            background: viewMode === 'taskchain' ? 'var(--bg-hover)' : 'transparent',
            color: viewMode === 'taskchain' ? 'var(--text-primary)' : 'var(--text-tertiary)',
          }}
        >
          Task Chain
        </button>

        {/* Export dropdown - always show import, conditionally show PNG export */}
        <div ref={dropdownRef} style={{ position: 'relative' }}>
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setExportDropdownOpen(!exportDropdownOpen)}
            title="Export/Import"
          >
            Export ▼
          </button>
          
          {exportDropdownOpen && (
            <div
              style={{
                position: 'absolute',
                top: '100%',
                right: 0,
                marginTop: 4,
                background: 'var(--bg-secondary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                boxShadow: 'var(--shadow-lg)',
                zIndex: 100,
                minWidth: 160,
              }}
            >
              <button
                onClick={() => {
                  setShowExportImport(true);
                  setExportDropdownOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                📤 Export/Import Data
              </button>
              
              <button
                onClick={() => {
                  exportToFile('full');
                  setExportDropdownOpen(false);
                }}
                style={{
                  display: 'block',
                  width: '100%',
                  padding: '8px 12px',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-primary)',
                  fontSize: 13,
                  textAlign: 'left',
                  cursor: 'pointer',
                  borderBottom: '1px solid var(--border)',
                }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'middle' }}>
                  <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                  <polyline points="17 21 17 13 7 13 7 21"/>
                  <polyline points="7 3 7 8 15 8"/>
                </svg>
                Export JSON
              </button>

              {viewMode === 'treemap' && total > 0 && (
                <button
                  onClick={() => {
                    handleExport();
                    setExportDropdownOpen(false);
                  }}
                  style={{
                    display: 'block',
                    width: '100%',
                    padding: '8px 12px',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    textAlign: 'left',
                    cursor: 'pointer',
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: 6, verticalAlign: 'middle' }}>
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="8.5" cy="8.5" r="1.5"/>
                    <polyline points="21 15 16 10 5 21"/>
                  </svg>
                  Export PNG
                </button>
              )}
            </div>
          )}
        </div>

        {block && !showTimelessPool && (
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => setShowAssign(true)}
          >
            Assign Tasks
          </button>
        )}

        {/* Sync status */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
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
          {syncStatus === 'error' && (
            <button
              title="Retry sync"
              onClick={handleSyncRetry}
              disabled={retrying}
              style={{
                background: 'none',
                border: '1px solid hsl(0, 72%, 62%)',
                borderRadius: 4,
                cursor: retrying ? 'default' : 'pointer',
                color: 'hsl(0, 72%, 62%)',
                fontSize: 11,
                padding: '2px 6px',
                opacity: retrying ? 0.6 : 1,
              }}
            >
              {retrying ? '…' : 'Retry'}
            </button>
          )}
        </div>

        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setShowAITaskGenerator(true)}
          title="Generate tasks with AI"
          style={{ display: 'flex', alignItems: 'center', gap: 6 }}
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L22 12L12 22L2 12L12 2Z" fill="currentColor"/>
          </svg>
          Smart Create
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

      <ExportImportModal open={showExportImport} onClose={() => setShowExportImport(false)} />
      <AITaskGeneratorModal open={showAITaskGenerator} onClose={() => setShowAITaskGenerator(false)} />
    </>
  );
}
