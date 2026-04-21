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

// ─── Pin SVG Icon ─────────────────────────────────────────────────────────────
function PinIcon({ active, size = 14 }: { active?: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none"
      stroke={active ? 'var(--accent, hsl(240,60%,55%))' : 'rgba(255,255,255,0.35)'}
      strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 17v5" />
      <path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.89A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.89A2 2 0 0 0 5 15.24Z" />
    </svg>
  );
}

// ─── Draggable hook ──────────────────────────────────────────────────────────
function useDraggable(
  initialPos: { x: number; y: number },
  boundsRef: React.RefObject<HTMLElement | null> | null,
) {
  const [pos, setPos] = useState(initialPos);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });
  const elRef = useRef<HTMLDivElement>(null);

  const onPointerDown = useCallback((e: React.PointerEvent) => {
    // Only drag from the header / drag handle
    const target = e.target as HTMLElement;
    if (target.closest('button') || target.closest('input')) return;
    dragging.current = true;
    offset.current = { x: e.clientX - pos.x, y: e.clientY - pos.y };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    e.preventDefault();
  }, [pos]);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return;
    let nx = e.clientX - offset.current.x;
    let ny = e.clientY - offset.current.y;
    // Clamp to bounds
    const bounds = boundsRef?.current;
    const el = elRef.current;
    if (bounds && el) {
      const br = bounds.getBoundingClientRect();
      const er = el.getBoundingClientRect();
      nx = Math.max(0, Math.min(nx, br.width - er.width));
      ny = Math.max(0, Math.min(ny, br.height - er.height));
    }
    setPos({ x: nx, y: ny });
  }, [boundsRef]);

  const onPointerUp = useCallback(() => {
    dragging.current = false;
  }, []);

  return { pos, elRef, onPointerDown, onPointerMove, onPointerUp };
}

// ─── Component ───────────────────────────────────────────────────────────────

interface CoFocusParticipantHUDProps {
  participants: CoFocusParticipant[];
  myUserId: string | null;
  sessionHostId: string | null;
  isMobile?: boolean;
  boundsRef?: React.RefObject<HTMLDivElement | null>;
}

export function CoFocusParticipantHUD({
  participants,
  myUserId,
  sessionHostId,
  isMobile,
  boundsRef,
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
    background: 'rgba(0,0,0,0.5)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    borderRadius: 12,
    border: '1px solid rgba(255,255,255,0.1)',
    color: 'white',
  };

  // Draggable HUD
  const hud = useDraggable({ x: 16, y: 56 }, boundsRef ?? null);
  // Draggable pinned chains
  const pinned = useDraggable({ x: -1, y: 56 }, boundsRef ?? null);

  // Auto-position pinned panel to top-right on first pin
  useEffect(() => {
    if (pinnedParticipants.length > 0 && pinned.pos.x === -1 && boundsRef?.current) {
      const br = boundsRef.current.getBoundingClientRect();
      pinned.pos.x = br.width - (isMobile ? 260 : 360) - 60;
      pinned.pos.y = 56;
    }
  }, [pinnedParticipants.length]);

  return (
    <>
      {/* ─── Draggable participant list ─────────────────────────────────── */}
      <div
        ref={hud.elRef}
        onPointerDown={hud.onPointerDown}
        onPointerMove={hud.onPointerMove}
        onPointerUp={hud.onPointerUp}
        style={{
          position: 'absolute',
          left: hud.pos.x, top: hud.pos.y,
          zIndex: 10,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
          width: isMobile ? 280 : 380,
          ...glassStyle,
          padding: '10px 0',
          cursor: 'grab',
          userSelect: 'none',
          touchAction: 'none',
        }}
      >
        {/* Drag handle */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: '0 14px 6px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          marginBottom: 2,
        }}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
            <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
            <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
            <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
          </svg>
          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            Participants
          </span>
        </div>

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
                  padding: '10px 14px',
                  background: isMe ? 'rgba(255,255,255,0.06)' : 'transparent',
                  border: 'none',
                  color: 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                  gap: 4,
                }}
              >
                {/* Line 1: arrow + name + host badge ... status dot */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  width: '100%',
                }}>
                  <span style={{
                    fontSize: 11,
                    color: 'rgba(255,255,255,0.5)',
                    width: 10,
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
                    fontSize: 16,
                  }}>
                    {p.displayName || 'Anonymous'}
                    {p.userId === sessionHostId && (
                      <span style={{
                        marginLeft: 8,
                        fontSize: 10,
                        padding: '2px 6px',
                        background: 'var(--accent, hsl(240,60%,55%))',
                        borderRadius: 4,
                        fontWeight: 700,
                        verticalAlign: 'middle',
                      }}>HOST</span>
                    )}
                  </span>
                  <span style={{
                    width: 10, height: 10,
                    borderRadius: '50%',
                    background: dotColor,
                    boxShadow: p.isRunning ? `0 0 8px ${dotColor}` : 'none',
                    flexShrink: 0,
                  }} />
                </div>
                {/* Line 2: timer value + mode label + (total focus time) */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  paddingLeft: 18, // align with name (past arrow)
                  fontSize: 14,
                }}>
                  <span style={{
                    fontVariantNumeric: 'tabular-nums',
                    fontWeight: 600,
                    fontSize: 15,
                    color: p.isRunning ? 'white' : 'rgba(255,255,255,0.5)',
                  }}>
                    {formatTime(liveTime)}
                  </span>
                  <span style={{
                    color: 'rgba(255,255,255,0.4)',
                    fontSize: 13,
                  }}>
                    {modeLabel}
                  </span>
                  {focusStr && (
                    <span style={{
                      color: 'rgba(255,255,255,0.35)',
                      fontSize: 12,
                    }}>
                      ({focusStr})
                    </span>
                  )}
                </div>
              </button>

              {/* Expanded: task chain */}
              {isExpanded && p.taskChainVisible && p.taskChainSteps && p.taskChainSteps.length > 0 && (
                <div style={{
                  padding: '6px 14px 10px 36px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 3,
                }}>
                  {p.taskChainSteps.slice(0, 8).map((step, i) => (
                    <div key={i} style={{
                      fontSize: 13,
                      color: step.completed ? 'hsl(142, 60%, 50%)' : 'rgba(255,255,255,0.6)',
                      textDecoration: step.completed ? 'line-through' : 'none',
                      overflow: 'hidden',
                      whiteSpace: 'nowrap',
                      textOverflow: 'ellipsis',
                      paddingLeft: step.isSubtask ? 16 : 0,
                    }}>
                      {step.completed ? '\u2713' : step.isSubtask ? '\u2022' : '\u25CB'} {step.title}
                    </div>
                  ))}
                  {/* Pin button */}
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(p.userId); }}
                    style={{
                      alignSelf: 'flex-end',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: '2px 4px',
                      display: 'flex', alignItems: 'center', gap: 4,
                    }}
                    title={pinnedIds.includes(p.userId) ? 'Unpin' : 'Pin to scene'}
                  >
                    <PinIcon active={pinnedIds.includes(p.userId)} size={14} />
                    <span style={{
                      fontSize: 10,
                      color: pinnedIds.includes(p.userId) ? 'var(--accent, hsl(240,60%,55%))' : 'rgba(255,255,255,0.3)',
                    }}>
                      {pinnedIds.includes(p.userId) ? 'Pinned' : 'Pin'}
                    </span>
                  </button>
                </div>
              )}

              {/* Expanded: no tasks shared */}
              {isExpanded && (!p.taskChainVisible || !p.taskChainSteps?.length) && (
                <div style={{
                  padding: '2px 14px 8px 36px',
                  fontSize: 12,
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

      {/* ─── Draggable pinned chains ───────────────────────────────────── */}
      {pinnedParticipants.length > 0 && (
        <div
          ref={pinned.elRef}
          onPointerDown={pinned.onPointerDown}
          onPointerMove={pinned.onPointerMove}
          onPointerUp={pinned.onPointerUp}
          style={{
            position: 'absolute',
            left: pinned.pos.x >= 0 ? pinned.pos.x : undefined,
            right: pinned.pos.x < 0 ? 60 : undefined,
            top: pinned.pos.y,
            zIndex: 10,
            width: isMobile ? 260 : 340,
            ...glassStyle,
            padding: '10px 0',
            display: 'flex',
            flexDirection: 'column',
            cursor: 'grab',
            userSelect: 'none',
            touchAction: 'none',
          }}
        >
          {/* Drag handle */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '0 12px 6px',
            borderBottom: '1px solid rgba(255,255,255,0.06)',
            marginBottom: 4,
          }}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.3)" strokeWidth="2">
              <circle cx="9" cy="5" r="1"/><circle cx="15" cy="5" r="1"/>
              <circle cx="9" cy="12" r="1"/><circle cx="15" cy="12" r="1"/>
              <circle cx="9" cy="19" r="1"/><circle cx="15" cy="19" r="1"/>
            </svg>
            <PinIcon active size={12} />
            <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Pinned Tasks
            </span>
          </div>

          {pinnedParticipants.map((p, pIdx) => (
            <div key={p.userId}>
              {pIdx > 0 && (
                <div style={{ height: 1, background: 'rgba(255,255,255,0.08)', margin: '6px 12px' }} />
              )}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '4px 12px',
              }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.8)' }}>
                  {p.displayName}'s Tasks
                </span>
                <button
                  onClick={() => togglePin(p.userId)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: 'rgba(255,255,255,0.4)',
                    cursor: 'pointer',
                    padding: '2px',
                    display: 'flex', alignItems: 'center',
                  }}
                  title="Unpin"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
              {p.taskChainSteps?.slice(0, 8).map((step, i) => (
                <div key={i} style={{
                  padding: '1px 12px',
                  paddingLeft: step.isSubtask ? 28 : 12,
                  fontSize: 13,
                  color: step.completed ? 'hsl(142, 60%, 50%)' : 'rgba(255,255,255,0.6)',
                  textDecoration: step.completed ? 'line-through' : 'none',
                  overflow: 'hidden',
                  whiteSpace: 'nowrap',
                  textOverflow: 'ellipsis',
                }}>
                  {step.completed ? '\u2713' : step.isSubtask ? '\u2022' : '\u25CB'} {step.title}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
