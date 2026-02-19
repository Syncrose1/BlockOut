import { useEffect, useState, useRef } from 'react';
import { useStore } from './store';
import { loadData, debouncedSave, startPeriodicCloudSync } from './utils/persistence';
import { handleDropboxCallback } from './utils/dropbox';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Treemap } from './components/Treemap';
import { Kanban } from './components/Kanban';
import { Timeline } from './components/Timeline';
import { Pomodoro } from './components/Pomodoro';
import { OnboardingTour } from './components/Onboarding';
import {
  NewBlockModal,
  NewCategoryModal,
  NewTaskModal,
  TaskEditModal,
  TaskCompletionSurvey,
  PomodoroSettingsModal,
  SyncSettingsModal,
  ConflictResolutionModal,
} from './components/Modals';

export function App() {
  const viewMode = useStore((s) => s.viewMode);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const oauthProcessed = useRef(false);

  // Handle Dropbox OAuth callback on mount
  useEffect(() => {
    const handleCallback = async () => {
      // Prevent double-processing in React StrictMode
      if (oauthProcessed.current) return;
      
      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      const isCallbackRoute = window.location.pathname === '/' || window.location.pathname === '/dropbox-callback';
      
      if (isCallbackRoute && code) {
        oauthProcessed.current = true;
        
        // Clear the code from URL immediately to prevent reuse
        window.history.replaceState({}, '', '/');
        
        const success = await handleDropboxCallback(code);
        if (success) {
          setOauthError(null);
        } else {
          setOauthError('Failed to connect to Dropbox. Please try again.');
        }
      }
    };
    
    handleCallback();
  }, []);

  // Load data on mount (IndexedDB first, then merge from cloud if configured)
  useEffect(() => {
    loadData();
  }, []);

  // Debounced local save on every state change
  useEffect(() => {
    const unsub = useStore.subscribe(() => {
      debouncedSave();
    });
    return unsub;
  }, []);

  // Periodic cloud push + on-unload push
  useEffect(() => {
    return startPeriodicCloudSync();
  }, []);

  return (
    <div className="app">
      {oauthError && (
        <div style={{
          position: 'fixed',
          top: 20,
          left: '50%',
          transform: 'translateX(-50%)',
          background: 'hsl(0, 70%, 50%)',
          color: 'white',
          padding: '12px 24px',
          borderRadius: 'var(--radius-sm)',
          zIndex: 9999,
          boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
        }}>
          {oauthError}
          <button 
            onClick={() => setOauthError(null)}
            style={{ marginLeft: 12, background: 'none', border: 'none', color: 'white', cursor: 'pointer' }}
          >
            ×
          </button>
        </div>
      )}
      <Sidebar />
      <div className="main">
        <Topbar />
        {viewMode === 'treemap' && <Treemap />}
        {viewMode === 'kanban' && <Kanban />}
        {viewMode === 'timeline' && <Timeline />}
      </div>
      <Pomodoro />
      <NewBlockModal />
      <NewCategoryModal />
      <NewTaskModal />
      <TaskEditModal />
      <TaskCompletionSurvey />
      <PomodoroSettingsModal />
      <SyncSettingsModal />
      <ConflictResolutionModal />
      <OnboardingTour />
    </div>
  );
}
