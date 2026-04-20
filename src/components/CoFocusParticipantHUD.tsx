import { useState, useEffect, useRef, useCallback } from 'react';
import type { CoFocusParticipant } from '../types/coFocus';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatTime(seconds: number): string {
  const abs = Math.max(0, Math.round(Math.abs(seconds)));
  const m = Math.floor(abs / 60);
  const s = abs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

function formatFocusTime(totalSeconds: number): string {
  const s = Math.round(totalSeconds);
  if (s < 60) return `${s}s`;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const timerModeLabels: Record<string, string> = {
  pomodoro: 'Pomodoro',
  timer: 'Timer',
  stopwatch: 'Stopwatch',
};

/** Compute live timer value from anchor data */
function computeLiveTime(p: CoFocusParticipant, now: number): number {
  if (!p.isRunning) return p.anchorValue;
  const elapsed = (now - p.anchorTimestamp) / 1000;
  if (p.activeTimerMode === 'stopwatch') {
    return p.anchorValue + elapsed;
  }
  // pomodoro or timer: countdown
  return Math.max(0, p.anchorValue - elapsed);
}

const modeDotColors: Record<string, string> = {
  work: '#ef4444',
  break: '#22c55e',
  longBreak: '#3b82f6',
};

// ─── Component ───────────────────────────────────────────────────────────────

interface CoFocusParticipantHUDProps {
  participants: CoFocusParticipant[];
  myUserId: string | null;
  sessionHostId: string | null;
  isMobile?: boolean;
}

export function CoFocusParticipantHUD({
  participants,
  myUserId,
  sessionHostId,
  isMobile,
}: CoFocusParticipantHUDProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [now, setNow] = useState(Date.now());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Tick every second for live timer updates
  useEffect(() => {
    intervalRef.current = setInterval(() => setNow(Date.now()), 1000);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, []);

  const toggleExpand = useCallback((userId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }, []);

  const togglePin = useCallback((userId: string) => {
    setPinnedIds(prev =>
      prev.includes(userId)
        ? prev.filter(id => id !== userId)
        : [...prev, userId]
    );
  }, []);

  const pinnedParticipants = participants.filter(p => pinnedIds.includes(p.userId));

  const glassStyle: React.CSSProperties = {
    background: 'rgba(0,0,0,0.4)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 10,
    border: '1px solid rgba(255,255,255,0.08)',
    color: 'white',
  };

  return (
    <>
      {/* ─── Top-left: Participant list ─────────────────────────────────── */}
      <div style={{
        position: 'absolute',
        top: 52, left: 16,
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
        maxWidth: isMobile ? 240 : 320,
        ...glassStyle,
        padding: '8px 0',
      }}>
        {participants.map(p => {
          const isExpanded = expandedIds.has(p.userId);
          const liveTime = computeLiveTime(p, now);
          const dotColor = modeDotColors[p.timerMode] || '#888';
          const isMe = p.userId === myUserId;
          const modeLabel = timerModeLabels[p.activeTimerMode] || '';
          const focusStr = p.totalFocusTimeToday > 0 ? formatFocusTime(p.totalFocusTimeToday) : '';

          return (
            <div key={p.userId}>
              {/* Two-line participant row */}
              <button
                onClick={() => toggleExpand(p.userId)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  width: '100%',
                  padding: '8px 12px',
                  background: isMe ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: 2,
                }}
              >
                {/* Line 1: arrow + name + host badge ... status dot */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  width: '100%',
                }}>
                  <span style={{
                    fontSize: 10,
                    color: 'rgba(255,255,255,0.5)',
                    width: 8,
                    flexShrink: 0,
                  }}>
                    {isExpanded ? '\u25BE' : '\u25B8'}
                  </span>
                  <span style={{
                    flex: 1,
                    overflow: 'hidden',
                    whiteSpace: 'nowrap',
                    textOverflow: 'ellipsis',
                    fontWeight: isMe ? 700 : 600,
                    fontSize: 14,
                  }}>
                    {p.displayName || 'Anonymous'}
                    {p.userId === sessionHostId && (
                      <span style={{
                        marginLeft: 6,
                        fontSize: 9,
                        padding: '1px 5px',
                        background: 'var(--accent, hsl(240,60%,55%))',
                        borderRadius: 3,
                        fontWeight: 700,
                        verticalAlign: 'middle',
                      }}>HOST</span>
                    )}
                  </span>
                  <span style={{
                    width: 8, height: 8,
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: p.isRunning ? `0 0 6px ${dotColor}` : 'none',
                    flexShrink: 0,
                  }} />
                </div>
                {/* Line 2: timer value + mode label + total focus time */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  paddingLeft: 14, // align with name (past arrow)
                  fontSize: 13,
                }}>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                    color: p.isRunning ? 'white' : 'rgba(255,255,255,0.5)',
                  }}>
                    {formatTime(liveTime)}
                  </span>
                  <span style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 12,
                  }}>
                    {modeLabel}
                  </span>
                  {focusStr && (
                    <span style={{
                      color: 'rgba(255,255,255,0.3)',
                      fontSize: 11,
                    }}>
                      &middot; {focusStr} today
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded: task chain */}
              {isExpanded && p.taskChainVisible && p.taskChainSteps && p.taskChainSteps.length > 0 && (
                <div style={{
                  padding: '4px 12px 8px 30px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 2,
                }}>
                  {p.taskChainSteps.slice(0, 6).map((step, i) => (
                    <div key={i} style={{
                      fontSize: 11,
                      color: step.completed ? 'hsl(142, 60%, 50%)' : 'rgba(255,255,255,0.55)',
                      textDecoration: step.completed ? 'line-through' : 'none',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                    }}>
                      {step.completed ? '\u2713' : '\u25CB'} {step.title}
                    </div>
                  ))}
                  {/* Pin button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(p.userId); }}
                    style={{
                      alignSelf: 'flex-end',
                      background: 'none',
                      border: 'none',
                      color: pinnedIds.includes(p.userId) ? 'var(--accent, hsl(240,60%,55%))' : 'rgba(255,255,255,0.3)',
                      fontSize: 11,
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                    title={pinnedIds.includes(p.userId) ? 'Unpin' : 'Pin to right'}
                  >
                    {pinnedIds.includes(p.userId) ? '\uD83D\uDCCC' : '\uD83D\uDCCC'}
                  </button>
                </div>
              )}

              {/* Expanded: no tasks shared */}
              {isExpanded && (!p.taskChainVisible || !p.taskChainSteps?.length) && (
                <div style={{
                  padding: '2px 12px 6px 30px',
                  fontSize: 11,
                  color: 'rgba(255,255,255,0.3)',
                  fontStyle: 'italic',
                }}>
                  No task chain shared
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ─── Top-right: Pinned chains ───────────────────────────────────── */}
      {pinnedParticipants.length > 0 && (
        <div style={{
          position: 'absolute',
          top: 52, right: 56,
          zIndex: 10,
          maxWidth: isMobile ? 200 : 240,
          ...glassStyle,
          padding: '8px 0',
          display: 'flex',
          flexDirection: 'column',
        }}>
          <div style={{
            fontSize: 9,
            fontWeight: 700,
            color: 'rgba(255,255,255,0.4)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
            padding: '0 10px 4px',
          }}>Pinned</div>

          {pinnedParticipants.map((p, pIdx) => (
            <div key={p.userId}>
              {pIdx > 0 && (
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '4px 10px' }} />
              )}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '3px 10px',
              }}>
                <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.7)' }}>
                  {p.displayName}'s Tasks
                </span>
                <button
                  onClick={() => togglePin(p.userId)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 12,
                    cursor: 'pointer',
                    padding: '0 2px',
                    lineHeight: 1,
                  }}
                  title="Unpin"
                >&times;</button>
              </div>
              {p.taskChainSteps?.slice(0, 6).map((step, i) => (
                <div key={i} style={{
                  padding: '0 10px',
                  fontSize: 11,
                  color: step.completed ? 'hsl(142, 60%, 50%)' : 'rgba(255,255,255,0.55)',
                  textDecoration: step.completed ? 'line-through' : 'none',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}>
                  {step.completed ? '\u2713' : '\u25CB'} {step.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
