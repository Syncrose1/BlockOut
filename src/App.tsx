import { useEffect, useState, useRef } from 'react';
import { useStore } from './store';
import { loadData, debouncedSave, startPeriodicCloudSync } from './utils/persistence';
import { handleDropboxCallback } from './utils/dropbox';
import { loadTutorialData, hasShownTutorial } from './utils/tutorial';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Treemap } from './components/Treemap';

import { Timeline } from './components/Timeline';
import { TaskChain } from './components/TaskChain';
import { Pomodoro } from './components/Pomodoro';
import { OnboardingTour } from './components/Onboarding';
import { WelcomeModal } from './components/WelcomeModal';
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
  const selectedTaskIds = useStore((s) => s.selectedTaskIds);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
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
        
        const result = await handleDropboxCallback(code);
        if (result.success) {
          setOauthError(null);
        } else {
          setOauthError(result.error || 'Failed to connect to Dropbox. Please try again.');
        }
      }
    };
    
    handleCallback();
  }, []);

  // Load data on mount (IndexedDB first, then merge from cloud if configured)
  useEffect(() => {
    const initializeApp = async () => {
      await loadData();
      
      // Load tutorial data if first time user
      if (!hasShownTutorial()) {
        loadTutorialData();
      }
      
      // After data loads, check if no view is selected
      // If nothing cached, default to "All Tasks" view
      const state = useStore.getState();
      if (!state.activeBlockId && !state.showTimelessPool) {
        console.log('[BlockOut] No cached view found, defaulting to All Tasks');
        useStore.getState().setShowTimelessPool(true);
      }
      
      // Small delay to ensure UI is ready before showing content
      setTimeout(() => {
        setIsFadingOut(true);
        setTimeout(() => setIsLoading(false), 600); // Wait for fade animation to complete
      }, 100);
    };
    
    initializeApp();
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
      {/* Loading overlay */}
      {isLoading && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'var(--bg-primary)',
          zIndex: 9998,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 32,
          opacity: isFadingOut ? 0 : 1,
          visibility: isFadingOut ? 'hidden' : 'visible',
          transition: 'opacity 0.6s ease-out, visibility 0.6s ease-out',
          pointerEvents: isFadingOut ? 'none' : 'auto',
        }}>
          {/* Animated logo/pulse */}
          <div style={{
            position: 'relative',
            width: 80,
            height: 80,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {/* Pulsing rings */}
            <div style={{
              position: 'absolute',
              width: '100%',
              height: '100%',
              borderRadius: '50%',
              border: '2px solid var(--accent)',
              opacity: 0.3,
              animation: 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
            }} />
            <div style={{
              position: 'absolute',
              width: '75%',
              height: '75%',
              borderRadius: '50%',
              border: '2px solid var(--accent)',
              opacity: 0.5,
              animation: 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 0.5s',
            }} />
            <div style={{
              position: 'absolute',
              width: '50%',
              height: '50%',
              borderRadius: '50%',
              border: '2px solid var(--accent)',
              opacity: 0.7,
              animation: 'pulse-ring 2s cubic-bezier(0.4, 0, 0.6, 1) infinite 1s',
            }} />
            {/* Center dot */}
            <div style={{
              width: 16,
              height: 16,
              borderRadius: '50%',
              background: 'var(--accent)',
              boxShadow: '0 0 20px var(--accent)',
              animation: 'pulse-center 1.5s ease-in-out infinite',
            }} />
          </div>
          
          {/* Loading text with typing effect */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 8,
          }}>
            <div style={{
              color: 'var(--text-primary)',
              fontSize: 18,
              fontWeight: 600,
              letterSpacing: '0.05em',
            }}>
              BlockOut
            </div>
            <div style={{
              color: 'var(--text-secondary)',
              fontSize: 13,
              fontWeight: 400,
              display: 'flex',
              alignItems: 'center',
              gap: 4,
            }}>
              <span>Loading</span>
              <span style={{
                animation: 'dots 1.5s steps(4, end) infinite',
                width: 24,
              }}>...</span>
            </div>
          </div>
          
          {/* Progress bar */}
          <div style={{
            width: 200,
            height: 2,
            background: 'var(--bg-tertiary)',
            borderRadius: 1,
            overflow: 'hidden',
            position: 'relative',
          }}>
            <div style={{
              position: 'absolute',
              top: 0,
              left: 0,
              height: '100%',
              width: '40%',
              background: 'linear-gradient(90deg, var(--accent), hsl(210, 80%, 60%))',
              borderRadius: 1,
              animation: 'progress 2s ease-in-out infinite',
            }} />
          </div>
          
          <style>{`
            @keyframes pulse-ring {
              0% { transform: scale(0.8); opacity: 0.8; }
              50% { transform: scale(1.1); opacity: 0.3; }
              100% { transform: scale(0.8); opacity: 0.8; }
            }
            @keyframes pulse-center {
              0%, 100% { transform: scale(1); opacity: 1; }
              50% { transform: scale(1.2); opacity: 0.8; }
            }
            @keyframes dots {
              0%, 20% { content: ''; }
              40% { content: '.'; }
              60% { content: '..'; }
              80%, 100% { content: '...'; }
            }
            @keyframes progress {
              0% { transform: translateX(-100%); }
              50% { transform: translateX(150%); }
              100% { transform: translateX(-100%); }
            }
          `}</style>
        </div>
      )}
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
      <div style={{
        opacity: isFadingOut ? 1 : 0,
        transition: 'opacity 0.6s ease-in',
        display: 'contents',
      }}>
        <Sidebar />
        <div className="main">
          <Topbar />
          {viewMode === 'treemap' && <Treemap />}

          {viewMode === 'timeline' && <Timeline />}
          {viewMode === 'taskchain' && <TaskChain />}
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
        <WelcomeModal />
      </div>
    </div>
  );
}
