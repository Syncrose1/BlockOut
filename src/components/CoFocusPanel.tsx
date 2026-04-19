import { useState, useMemo, useEffect, useRef } from 'react';
import { useStore } from '../store';
import { useIsMobile } from '../hooks/useIsMobile';
import { getSpecies } from '../store/synamonSlice';
import { getSynamonMood } from '../utils/synamonMath';
import { CoFocusParticipantCard } from './CoFocusParticipantCard';
import { CoFocusChat } from './CoFocusChat';
import { CoFocusScene } from './CoFocusScene';

export function CoFocusPanel() {
  const panelOpen = useStore((s) => s.coFocus.coFocusPanelOpen);
  const activeSessionId = useStore((s) => s.coFocus.activeSessionId);
  const isHost = useStore((s) => s.coFocus.isHost);
  const sessionTimerMode = useStore((s) => s.coFocus.sessionTimerMode);
  const sessionInviteCode = useStore((s) => s.coFocus.sessionInviteCode);
  const participants = useStore((s) => s.coFocus.participants);
  const chatOpen = useStore((s) => s.coFocus.chatOpen);
  const unreadCount = useStore((s) => s.coFocus.unreadCount);

  const setCoFocusPanelOpen = useStore((s) => s.setCoFocusPanelOpen);
  const setShowSessionModal = useStore((s) => s.setShowSessionModal);
  const leaveSession = useStore((s) => s.leaveSession);
  const setChatOpen = useStore((s) => s.setChatOpen);

  const sessionSceneKey = useStore((s) => s.coFocus.sessionSceneKey);
  const sessionHostId = useStore((s) => s.coFocus.sessionHostId);
  const collection = useStore((s) => s.synamon.collection);

  const isMobile = useIsMobile();
  const [codeCopied, setCodeCopied] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const [panelWidth, setPanelWidth] = useState(480);

  // Track actual panel width for scene sizing
  useEffect(() => {
    if (!panelOpen || !panelRef.current) return;
    const obs = new ResizeObserver(entries => {
      for (const e of entries) setPanelWidth(Math.round(e.contentRect.width));
    });
    obs.observe(panelRef.current);
    return () => obs.disconnect();
  }, [panelOpen]);

  // Build creature data for the scene from participants' Synamon info
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

  if (!panelOpen) return null;

  const participantList = Object.values(participants);
  // Sort by slot index for consistent ordering
  participantList.sort((a, b) => a.slotIndex - b.slotIndex);

  const handleCopyCode = () => {
    if (sessionInviteCode) {
      navigator.clipboard.writeText(sessionInviteCode);
      setCodeCopied(true);
      setTimeout(() => setCodeCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={() => setCoFocusPanelOpen(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.4)',
          backdropFilter: 'blur(2px)',
          zIndex: 9980,
        }}
      />

      {/* Panel - slides in from right */}
      <div ref={panelRef} style={{
        position: 'fixed',
        top: 0, right: 0, bottom: 0,
        width: isMobile ? '100vw' : 480, maxWidth: '100vw',
        background: 'var(--bg-secondary)',
        borderLeft: isMobile ? 'none' : '1px solid var(--border)',
        boxShadow: '-10px 0 40px rgba(0,0,0,0.3)',
        zIndex: 9981,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '14px 20px',
          borderBottom: '1px solid var(--border)',
          flexShrink: 0,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>
              Co-Focus
            </h3>
            {activeSessionId && (
              <span style={{
                fontSize: 10, padding: '2px 8px',
                background: 'hsl(142, 50%, 25%)',
                color: 'hsl(142, 72%, 70%)',
                borderRadius: 10, fontWeight: 600,
              }}>LIVE</span>
            )}
          </div>
          <button
            onClick={() => setCoFocusPanelOpen(false)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-tertiary)', fontSize: 20,
              cursor: 'pointer', padding: 4,
            }}
          >&times;</button>
        </div>

        {/* Content */}
        {!activeSessionId ? (
          /* No active session — show create/join */
          <div style={{
            flex: 1, display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            gap: 16, padding: 24,
          }}>
            <div style={{
              fontSize: 14, color: 'var(--text-secondary)',
              textAlign: 'center', maxWidth: 300,
            }}>
              Start a focus session with friends. Everyone sees each other's timers and Synamon companions.
            </div>
            <button
              onClick={() => setShowSessionModal(true)}
              style={{
                padding: '12px 32px',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-md)',
                color: 'white',
                fontSize: 14, fontWeight: 600,
                cursor: 'pointer',
              }}
            >Start or Join Session</button>
          </div>
        ) : (
          /* Active session */
          <>
            {/* Campfire scene with participant creatures */}
            <div style={{
              flex: '0 0 55%',
              background: 'hsl(220, 20%, 8%)',
              position: 'relative',
              overflow: 'hidden',
            }}>
              <CoFocusScene
                sceneKey={sessionSceneKey}
                creatures={sceneCreatures}
                width={panelWidth}
                height={Math.round(panelWidth * 0.55)}
              />
            </div>

            {/* Session info bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '8px 16px',
              borderBottom: '1px solid var(--border)',
              fontSize: 11, color: 'var(--text-tertiary)',
              flexShrink: 0,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{sessionTimerMode === 'locked' ? 'Locked Timer' : 'Independent'}</span>
                <span style={{ color: 'var(--border)' }}>|</span>
                <span>{participantList.length}/5 participants</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {sessionInviteCode && (
                  <button
                    onClick={handleCopyCode}
                    style={{
                      padding: '3px 8px',
                      background: codeCopied ? 'hsl(142, 72%, 45%)' : 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: codeCopied ? 'white' : 'var(--text-secondary)',
                      fontSize: 10, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >{codeCopied ? 'Copied!' : `Code: ${sessionInviteCode}`}</button>
                )}
              </div>
            </div>

            {/* Participant cards */}
            <div style={{
              padding: '12px 16px',
              display: 'flex', gap: 8,
              overflowX: 'auto',
              flexShrink: 0,
            }}>
              {participantList.map(p => (
                <CoFocusParticipantCard
                  key={p.userId}
                  participant={p}
                  isHost={p.userId === sessionHostId}
                />
              ))}
              {participantList.length === 0 && (
                <div style={{
                  fontSize: 12, color: 'var(--text-tertiary)',
                  padding: 16, textAlign: 'center', width: '100%',
                }}>
                  Waiting for participants...
                </div>
              )}
            </div>

            {/* Chat area (collapsible) */}
            {chatOpen && (
              <div style={{ flex: 1, borderTop: '1px solid var(--border)', overflow: 'hidden' }}>
                <CoFocusChat />
              </div>
            )}

            {/* Bottom bar */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 16px',
              borderTop: '1px solid var(--border)',
              flexShrink: 0,
            }}>
              <button
                onClick={() => setChatOpen(!chatOpen)}
                style={{
                  position: 'relative',
                  padding: '6px 14px',
                  background: chatOpen ? 'var(--accent)' : 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-md)',
                  color: chatOpen ? 'white' : 'var(--text-secondary)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Chat
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

              <button
                onClick={leaveSession}
                style={{
                  padding: '6px 14px',
                  background: 'hsl(0, 40%, 20%)',
                  border: '1px solid hsl(0, 40%, 35%)',
                  borderRadius: 'var(--radius-md)',
                  color: 'hsl(0, 72%, 70%)',
                  fontSize: 12, fontWeight: 600,
                  cursor: 'pointer',
                }}
              >{isHost ? 'End Session' : 'Leave Session'}</button>
            </div>
          </>
        )}
      </div>
    </>
  );
}
