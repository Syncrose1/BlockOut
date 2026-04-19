import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../store';
import { getSpecies } from '../store/synamonSlice';
import { CoFocusParticipantCard } from './CoFocusParticipantCard';
import { CoFocusChat } from './CoFocusChat';
import { CoFocusScene } from './CoFocusScene';

// ─── Scene data type (mirrors CoFocusScene's internal type) ─────────────────
interface SceneOption {
  key: string;
  name: string;
}

let scenesListCache: SceneOption[] | null = null;
async function loadScenesList(): Promise<SceneOption[]> {
  if (scenesListCache) return scenesListCache;
  const res = await fetch('/cofocus/scenes.json');
  const json = await res.json();
  scenesListCache = (json.scenes as any[]).map(s => ({ key: s.key, name: s.name }));
  return scenesListCache!;
}

export function CoFocusView() {
  const activeSessionId = useStore((s) => s.coFocus.activeSessionId);
  const isHost = useStore((s) => s.coFocus.isHost);
  const sessionTimerMode = useStore((s) => s.coFocus.sessionTimerMode);
  const sessionInviteCode = useStore((s) => s.coFocus.sessionInviteCode);
  const sessionSceneKey = useStore((s) => s.coFocus.sessionSceneKey);
  const sessionHostId = useStore((s) => s.coFocus.sessionHostId);
  const participants = useStore((s) => s.coFocus.participants);
  const chatOpen = useStore((s) => s.coFocus.chatOpen);
  const unreadCount = useStore((s) => s.coFocus.unreadCount);
  const myDisplayName = useStore((s) => s.coFocus.myDisplayName);
  const myInviteCode = useStore((s) => s.coFocus.myInviteCode);
  const friends = useStore((s) => s.coFocus.friends);

  const setShowSessionModal = useStore((s) => s.setShowSessionModal);
  const setShowFriendModal = useStore((s) => s.setShowFriendModal);
  const leaveSession = useStore((s) => s.leaveSession);
  const setChatOpen = useStore((s) => s.setChatOpen);
  const updateCoFocusDisplayName = useStore((s) => s.updateCoFocusDisplayName);

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState(myDisplayName);
  const [scenes, setScenes] = useState<SceneOption[]>([]);
  const [fadingOut, setFadingOut] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerSize, setContainerSize] = useState({ w: 800, h: 500 });

  // Load scene list
  useEffect(() => {
    loadScenesList().then(setScenes);
  }, []);

  // Track container size
  useEffect(() => {
    if (!containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) {
        setContainerSize({
          w: Math.round(e.contentRect.width),
          h: Math.round(e.contentRect.height),
        });
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, []);

  // Sync name input when store changes
  useEffect(() => { setNameInput(myDisplayName); }, [myDisplayName]);

  // Build creature data for the scene
  const sceneCreatures = useMemo(() => {
    return Object.values(participants)
      .filter(p => p.synamonSpeciesId)
      .map(p => {
        const species = getSpecies(p.synamonSpeciesId!);
        const stage = p.synamonStage || 1;
        const animKey = `stage${stage}-idle`;
        const frames = species?.animations?.[animKey] || [];
        const staticSprite = species?.stages.find(s => s.stage === stage)?.sprite;
        return {
          slotIndex: p.slotIndex,
          framePaths: frames.length > 0 ? frames : (staticSprite ? [staticSprite] : []),
          stage,
        };
      })
      .filter(c => c.framePaths.length > 0);
  }, [participants]);

  const participantList = useMemo(() => {
    const list = Object.values(participants);
    list.sort((a, b) => a.slotIndex - b.slotIndex);
    return list;
  }, [participants]);

  const handleCopyCode = useCallback(() => {
    if (sessionInviteCode) {
      navigator.clipboard.writeText(sessionInviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  }, [sessionInviteCode]);

  const handleSaveName = useCallback(async () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== myDisplayName) {
      await updateCoFocusDisplayName(trimmed);
    }
    setEditingName(false);
  }, [nameInput, myDisplayName, updateCoFocusDisplayName]);

  const pendingRequests = friends.filter(f => f.status === 'pending' && f.direction === 'incoming').length;

  // Determine current user id
  const myUserId = useStore((s) => {
    // Find ourselves in participants by matching myInviteCode or checking all entries
    for (const [, p] of Object.entries(s.coFocus.participants)) {
      if (p.displayName === s.coFocus.myDisplayName) return p.userId;
    }
    return null;
  });

  return (
    <div
      ref={containerRef}
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        overflow: 'hidden',
        background: 'hsl(220, 20%, 6%)',
      }}
    >
      {/* Scene canvas — fills entire view */}
      <CoFocusScene
        sceneKey={sessionSceneKey}
        creatures={activeSessionId ? sceneCreatures : []}
        width={containerSize.w}
        height={containerSize.h}
        style={{
          position: 'absolute',
          inset: 0,
          opacity: fadingOut ? 0 : 1,
          transition: 'opacity 0.6s ease',
        }}
      />

      {/* ─── HUD Overlays ───────────────────────────────────────────────────── */}

      {/* Top-left: Session info badge */}
      {activeSessionId && (
        <div style={{
          position: 'absolute',
          top: 16, left: 16,
          display: 'flex', alignItems: 'center', gap: 8,
          background: 'rgba(0,0,0,0.6)',
          backdropFilter: 'blur(8px)',
          padding: '8px 14px',
          borderRadius: 'var(--radius-md)',
          zIndex: 10,
        }}>
          <span style={{
            width: 8, height: 8, borderRadius: '50%',
            background: 'hsl(142, 72%, 50%)',
            boxShadow: '0 0 8px hsl(142, 72%, 50%)',
            animation: 'focus-pulse 2s ease-in-out infinite',
          }} />
          <span style={{ fontSize: 12, color: 'white', fontWeight: 600 }}>
            {sessionTimerMode === 'locked' ? 'Locked' : 'Independent'}
          </span>
          <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
          <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)' }}>
            {scenes.find(s => s.key === sessionSceneKey)?.name || sessionSceneKey}
          </span>
          {sessionInviteCode && (
            <>
              <span style={{ color: 'rgba(255,255,255,0.3)' }}>|</span>
              <button
                onClick={handleCopyCode}
                style={{
                  background: codeCopied ? 'hsl(142, 72%, 45%)' : 'rgba(255,255,255,0.1)',
                  border: '1px solid rgba(255,255,255,0.15)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'white',
                  fontSize: 11, fontWeight: 600,
                  padding: '2px 8px',
                  cursor: 'pointer',
                }}
              >
                {codeCopied ? 'Copied!' : sessionInviteCode}
              </button>
            </>
          )}
        </div>
      )}

      {/* Top-right: Sidebar toggle + chat toggle */}
      <div style={{
        position: 'absolute',
        top: 16, right: 16,
        display: 'flex', gap: 8,
        zIndex: 10,
      }}>
        {/* Chat toggle */}
        {activeSessionId && (
          <button
            onClick={() => setChatOpen(!chatOpen)}
            style={{
              position: 'relative',
              width: 36, height: 36,
              background: chatOpen ? 'var(--accent)' : 'rgba(0,0,0,0.6)',
              backdropFilter: 'blur(8px)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: 'var(--radius-md)',
              color: 'white',
              cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
            }}
            title="Toggle chat"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            {unreadCount > 0 && !chatOpen && (
              <span style={{
                position: 'absolute', top: -4, right: -4,
                background: 'hsl(0, 72%, 55%)',
                color: 'white',
                fontSize: 9, fontWeight: 700,
                minWidth: 16, height: 16,
                borderRadius: 8,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                padding: '0 4px',
              }}>{unreadCount}</span>
            )}
          </button>
        )}

        {/* Sidebar toggle */}
        <button
          onClick={() => setSidebarOpen(!sidebarOpen)}
          style={{
            width: 36, height: 36,
            background: sidebarOpen ? 'var(--accent)' : 'rgba(0,0,0,0.6)',
            backdropFilter: 'blur(8px)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: 'var(--radius-md)',
            color: 'white',
            cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
          title="Session settings"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      </div>

      {/* Bottom: Participant cards */}
      {activeSessionId && participantList.length > 0 && (
        <div style={{
          position: 'absolute',
          bottom: 16, left: 16,
          right: sidebarOpen ? 316 : 16,
          display: 'flex', gap: 8,
          overflowX: 'auto',
          zIndex: 10,
          transition: 'right 0.3s ease',
        }}>
          {participantList.map(p => (
            <CoFocusParticipantCard
              key={p.userId}
              participant={p}
              isHost={p.userId === sessionHostId}
              isMe={p.userId === myUserId}
            />
          ))}
        </div>
      )}

      {/* ─── No Session: Center overlay ─────────────────────────────────────── */}
      {!activeSessionId && (
        <div style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 20,
          zIndex: 10,
        }}>
          <div style={{
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(12px)',
            padding: '32px 48px',
            borderRadius: 'var(--radius-lg, 16px)',
            border: '1px solid rgba(255,255,255,0.08)',
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', gap: 16,
            maxWidth: 360,
          }}>
            <h2 style={{
              margin: 0, fontSize: 22, fontWeight: 700,
              color: 'white',
            }}>Co-Focus</h2>
            <p style={{
              margin: 0, fontSize: 13, color: 'rgba(255,255,255,0.6)',
              textAlign: 'center', lineHeight: 1.5,
            }}>
              Start a focus session with friends. Everyone sees each other's timers and Synamon companions around the campfire.
            </p>
            <div style={{ display: 'flex', gap: 12 }}>
              <button
                onClick={() => setShowSessionModal(true)}
                style={{
                  padding: '10px 24px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  fontSize: 13, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >Start or Join</button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Chat panel (bottom-right overlay) ──────────────────────────────── */}
      {activeSessionId && chatOpen && (
        <div style={{
          position: 'absolute',
          bottom: participantList.length > 0 ? 100 : 16,
          right: sidebarOpen ? 316 : 16,
          width: 320,
          height: 280,
          background: 'rgba(0,0,0,0.8)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.1)',
          borderRadius: 'var(--radius-md)',
          overflow: 'hidden',
          zIndex: 15,
          display: 'flex', flexDirection: 'column',
          transition: 'right 0.3s ease',
        }}>
          <CoFocusChat />
        </div>
      )}

      {/* ─── Right Sidebar ──────────────────────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 0, right: 0, bottom: 0,
        width: 300,
        background: 'var(--bg-secondary)',
        borderLeft: '1px solid var(--border)',
        boxShadow: '-4px 0 20px rgba(0,0,0,0.3)',
        transform: sidebarOpen ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 0.3s ease',
        zIndex: 20,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Sidebar header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 16px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <h3 style={{ margin: 0, fontSize: 14, color: 'var(--text-primary)' }}>
            Session Settings
          </h3>
          <button
            onClick={() => setSidebarOpen(false)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-tertiary)', fontSize: 18,
              cursor: 'pointer', padding: 2,
            }}
          >&times;</button>
        </div>

        {/* Sidebar content */}
        <div style={{
          flex: 1, overflow: 'auto',
          padding: 16,
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          {/* Display name */}
          <div>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: 'var(--text-tertiary)', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>Display Name</label>
            {editingName ? (
              <div style={{ display: 'flex', gap: 6 }}>
                <input
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') handleSaveName(); if (e.key === 'Escape') setEditingName(false); }}
                  autoFocus
                  maxLength={20}
                  style={{
                    flex: 1, padding: '6px 10px',
                    background: 'var(--bg-primary)',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 13, outline: 'none',
                  }}
                />
                <button
                  onClick={handleSaveName}
                  style={{
                    padding: '6px 10px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: 'white', fontSize: 11, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >Save</button>
              </div>
            ) : (
              <button
                onClick={() => { setNameInput(myDisplayName); setEditingName(true); }}
                style={{
                  width: '100%', textAlign: 'left',
                  padding: '6px 10px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: 13, cursor: 'pointer',
                }}
              >
                {myDisplayName || 'Set display name...'}
              </button>
            )}
          </div>

          {/* Session actions */}
          <div>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: 'var(--text-tertiary)', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>Session</label>
            {!activeSessionId ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <button
                  onClick={() => setShowSessionModal(true)}
                  style={{
                    padding: '10px 16px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >Create or Join Session</button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {/* Invite code */}
                {sessionInviteCode && (
                  <div style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                  }}>
                    <div>
                      <div style={{ fontSize: 10, color: 'var(--text-tertiary)' }}>Invite Code</div>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>
                        {sessionInviteCode}
                      </div>
                    </div>
                    <button
                      onClick={handleCopyCode}
                      style={{
                        padding: '4px 10px',
                        background: codeCopied ? 'hsl(142, 72%, 45%)' : 'var(--bg-primary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: codeCopied ? 'white' : 'var(--text-secondary)',
                        fontSize: 11, fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >{codeCopied ? 'Copied!' : 'Copy'}</button>
                  </div>
                )}

                {/* Session info */}
                <div style={{
                  fontSize: 12, color: 'var(--text-tertiary)',
                  display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <div>Mode: {sessionTimerMode === 'locked' ? 'Locked Timer' : 'Independent'}</div>
                  <div>Participants: {participantList.length}/5</div>
                </div>

                {/* Leave */}
                <button
                  onClick={leaveSession}
                  style={{
                    padding: '8px 16px',
                    background: 'hsl(0, 40%, 20%)',
                    border: '1px solid hsl(0, 40%, 35%)',
                    borderRadius: 'var(--radius-md)',
                    color: 'hsl(0, 72%, 70%)',
                    fontSize: 12, fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >{isHost ? 'End Session' : 'Leave Session'}</button>
              </div>
            )}
          </div>

          {/* Friends */}
          <div>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: 'var(--text-tertiary)', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>Social</label>
            <button
              onClick={() => setShowFriendModal(true)}
              style={{
                position: 'relative',
                width: '100%',
                padding: '10px 16px',
                background: 'var(--bg-tertiary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                color: 'var(--text-primary)',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              Friends
              {pendingRequests > 0 && (
                <span style={{
                  position: 'absolute', top: 8, right: 12,
                  background: 'hsl(0, 72%, 55%)',
                  color: 'white',
                  fontSize: 9, fontWeight: 700,
                  minWidth: 16, height: 16,
                  borderRadius: 8,
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  padding: '0 4px',
                }}>{pendingRequests}</span>
              )}
            </button>
          </div>

          {/* Scene switcher */}
          <div>
            <label style={{
              display: 'block', fontSize: 11, fontWeight: 600,
              color: 'var(--text-tertiary)', marginBottom: 6,
              textTransform: 'uppercase', letterSpacing: '0.05em',
            }}>Environment</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {scenes.map(scene => (
                <button
                  key={scene.key}
                  onClick={() => {
                    if (scene.key !== sessionSceneKey) {
                      setFadingOut(true);
                      setTimeout(() => {
                        useStore.setState(s => ({
                          coFocus: { ...s.coFocus, sessionSceneKey: scene.key },
                        }));
                        setFadingOut(false);
                      }, 600);
                    }
                  }}
                  style={{
                    padding: '10px 14px',
                    background: scene.key === sessionSceneKey ? 'var(--accent)' : 'var(--bg-tertiary)',
                    border: `1px solid ${scene.key === sessionSceneKey ? 'var(--accent)' : 'var(--border)'}`,
                    borderRadius: 'var(--radius-md)',
                    color: scene.key === sessionSceneKey ? 'white' : 'var(--text-primary)',
                    fontSize: 13, fontWeight: 600,
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  {scene.name}
                </button>
              ))}
            </div>
          </div>

          {/* My invite code */}
          {myInviteCode && (
            <div style={{
              padding: '10px 12px',
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              fontSize: 11, color: 'var(--text-tertiary)',
            }}>
              <div style={{ marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Your Friend Code
              </div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)', letterSpacing: '0.1em' }}>
                {myInviteCode}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
