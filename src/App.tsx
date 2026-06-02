import { useEffect, useState, useRef, useCallback } from 'react';
import { useStore } from './store';
import { loadData, debouncedSave, startPeriodicCloudSync, shouldSeedSampleData } from './utils/persistence';
import { handleDropboxCallback } from './utils/dropbox';
import { loadTutorialData, hasShownTutorial } from './utils/tutorial';
import { loadSynamonFromSupabase, startSynamonSyncListener } from './utils/synamonLifecycle';
import { useIsMobile } from './hooks/useIsMobile';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Treemap } from './components/Treemap';
import { MobileTaskList } from './components/MobileTaskList';
import { CoFocusView } from './components/CoFocusView';
import { TaskChain } from './components/TaskChain';
import { Overview } from './components/Overview';
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
import { FriendModal } from './components/FriendModal';
import { SessionModal } from './components/SessionModal';
import { useCoFocusPresence } from './hooks/useCoFocusPresence';
import { useSynapseTrickle } from './utils/synapseEarn';

// ─── Loading treemap ──────────────────────────────────────────────────────────
// A decorative treemap that GROWS the way the real view does: empty → one block
// filling the box → split in half → the largest cell subdivides each step, with
// existing tiles smoothly resizing (CSS transition) to make room. Loops while the
// app loads. Tiles are placeholders, not real tasks; themed via --accent so it
// tracks light/dark automatically.
type Rect = { x: number; y: number; w: number; h: number };

// STAGES[n] = rects for n+1 visible blocks. Block index i keeps the SAME slot in
// every stage it exists in, so growing the count animates a resize, not a jump.
// Each step splits the largest current cell (the squarified "slice" feel).
const STAGES: Rect[][] = [
  // 1 — fills the box
  [{ x: 0, y: 0, w: 1, h: 1 }],
  // 2 — split into left / right halves
  [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 1 }],
  // 3 — right half splits top / bottom
  [{ x: 0, y: 0, w: 0.5, h: 1 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }],
  // 4 — left half splits top / bottom → four quadrants
  [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.5, h: 0.5 }],
  // 5 — bottom-left quadrant splits left / right
  [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.5, h: 0.5 }, { x: 0, y: 0.5, w: 0.25, h: 0.5 }, { x: 0.25, y: 0.5, w: 0.25, h: 0.5 }],
  // 6 — bottom-right quadrant splits left / right
  [{ x: 0, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0, w: 0.5, h: 0.5 }, { x: 0.5, y: 0.5, w: 0.25, h: 0.5 }, { x: 0, y: 0.5, w: 0.25, h: 0.5 }, { x: 0.25, y: 0.5, w: 0.25, h: 0.5 }, { x: 0.75, y: 0.5, w: 0.25, h: 0.5 }],
];
const MAX_BLOCKS = STAGES.length;
// Per-block accent opacity so the finished treemap reads as varied "weights".
const TILE_OPACITY = [0.85, 0.45, 0.65, 0.55, 0.75, 0.5];

function LoadingTreemap() {
  const BOX_W = 168, BOX_H = 120, GAP = 4;
  const [count, setCount] = useState(0); // 0 = empty; grows to MAX_BLOCKS then resets

  useEffect(() => {
    const id = setInterval(() => {
      setCount((c) => (c >= MAX_BLOCKS ? 0 : c + 1));
    }, 680);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{ position: 'relative', width: BOX_W, height: BOX_H }}>
      {Array.from({ length: MAX_BLOCKS }).map((_, i) => {
        const visible = i < count;
        // When visible, read this block's rect from the current stage; when not yet
        // born, pre-place it at its birth rect (opacity 0) so it only fades in —
        // no positional jump — while siblings resize around it.
        const rect = visible ? STAGES[count - 1][i] : STAGES[i][i];
        return (
          <div key={i} style={{
            position: 'absolute',
            left: rect.x * BOX_W + GAP / 2,
            top: rect.y * BOX_H + GAP / 2,
            width: rect.w * BOX_W - GAP,
            height: rect.h * BOX_H - GAP,
            background: 'var(--accent)',
            opacity: visible ? TILE_OPACITY[i] : 0,
            borderRadius: 4,
            transition: 'left 0.5s ease, top 0.5s ease, width 0.5s ease, height 0.5s ease, opacity 0.4s ease',
          }} />
        );
      })}
    </div>
  );
}

export function App() {
  const viewMode = useStore((s) => s.viewMode);
  const selectedTaskIds = useStore((s) => s.selectedTaskIds);
  const [oauthError, setOauthError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFadingOut, setIsFadingOut] = useState(false);
  const oauthProcessed = useRef(false);
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const closeSidebar = useCallback(() => setSidebarOpen(false), []);

  // Handle Dropbox OAuth callback on mount
  useEffect(() => {
    const handleCallback = async () => {
      // Prevent double-processing in React StrictMode
      if (oauthProcessed.current) return;

      const url = new URL(window.location.href);
      const code = url.searchParams.get('code');
      // Dropbox returns to the app's base root (origin + BASE_URL, e.g.
      // /blockout/ under the proxy; / in dev). Match the base with or without a
      // trailing slash so the ?code is actually picked up.
      const base = import.meta.env.BASE_URL;
      const path = window.location.pathname;
      const isCallbackRoute =
        path === base ||
        path === base.replace(/\/$/, '') ||
        path === '/' ||
        path.endsWith('/dropbox-callback');

      if (isCallbackRoute && code) {
        oauthProcessed.current = true;

        // Clear the code from URL immediately to prevent reuse — preserve the
        // base path so we don't bounce to the host root.
        window.history.replaceState({}, '', base);

        const result = await handleDropboxCallback(code);
        if (result.success) {
          setOauthError(null);
          // Refresh the page to ensure Dropbox sync is properly initialized
          window.location.reload();
        } else {
          setOauthError(result.error || 'Failed to connect to Dropbox. Please try again.');
        }
      }
    };

    handleCallback();
  }, []);

  // Request persistent storage so the browser doesn't evict IndexedDB/
  // localStorage under storage pressure or after inactivity (esp. Firefox).
  // Best-effort: granted silently when the origin is "important" (installed,
  // bookmarked, high engagement); harmless otherwise.
  useEffect(() => {
    if (navigator.storage?.persist) {
      navigator.storage.persisted().then((already) => {
        if (!already) navigator.storage.persist().catch(() => {});
      }).catch(() => {});
    }
  }, []);

  // Load data on mount (IndexedDB first, then merge from cloud if configured)
  useEffect(() => {
    const initializeApp = async () => {
      await loadData();

      // Seed the illustrative tutorial data ONLY for a genuinely new local user:
      // empty store AND no cloud account connected. `shouldSeedSampleData()` is
      // the guard — never inject sample data when signed in or when real data
      // loaded, so it can't sync upward and clobber a real backup (it did once).
      if (!hasShownTutorial() && (await shouldSeedSampleData())) {
        loadTutorialData();
      }

      // Pull Synamon companion data from Supabase (fire-and-forget)
      loadSynamonFromSupabase().catch(e =>
        console.warn('[BlockOut] Synamon Supabase load skipped:', e)
      );

      // Initialize Co-Focus profile, online heartbeat, invite subscription,
      // and re-attach to any active session left over from a previous tab/load.
      useStore.getState().initCoFocusProfile().then(() => {
        useStore.getState().startOnlineHeartbeat();
        useStore.getState().setupInviteSubscription();
        useStore.getState().rehydrateActiveSession();
      });

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

  // Synamon → Supabase sync listener
  useEffect(() => {
    return startSynamonSyncListener();
  }, []);

  // Co-Focus presence sync
  useCoFocusPresence();
  useSynapseTrickle();

  // Close sidebar when navigating on mobile
  useEffect(() => {
    if (isMobile) {
      setSidebarOpen(false);
    }
  }, [viewMode, isMobile]);

  return (
    <div className={`app ${isMobile ? 'mobile' : ''}`}>
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
          {/* Treemap that builds up like the real view: starts empty, blocks are
              ADDED one by one, and each addition resizes the existing tiles to
              make room (squarified-style subdivision). Loops while loading. */}
          <LoadingTreemap />

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
        {/* Mobile: slide-out drawer sidebar */}
        {isMobile ? (
          <>
            {/* Backdrop */}
            {sidebarOpen && (
              <div className="mobile-sidebar-backdrop" onClick={closeSidebar} />
            )}
            <div className={`mobile-sidebar-drawer ${sidebarOpen ? 'open' : ''}`}>
              <Sidebar />
            </div>
          </>
        ) : (
          <Sidebar />
        )}

        <div className="main">
          <Topbar
            isMobile={isMobile}
            onMenuToggle={() => setSidebarOpen((prev) => !prev)}
          />
          {viewMode === 'treemap' && (
            isMobile ? <MobileTaskList /> : <Treemap />
          )}
          {viewMode === 'cofocus' && <CoFocusView />}
          {viewMode === 'taskchain' && <TaskChain />}
          {viewMode === 'overview' && <Overview />}
        </div>
        {!isMobile && <Pomodoro />}
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
        <FriendModal />
        <SessionModal />
      </div>
    </div>
  );
}
