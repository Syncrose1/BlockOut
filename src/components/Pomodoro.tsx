import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';
import { PomodoroModal } from './PomodoroModal';
import { SynamonSprite } from './SynamonSprite';
import { getSpecies } from '../store/synamonSlice';
import type { ActiveTimerMode } from '../types';
import type { OwnedSynamon } from '../types/synamon';

// ── SVG Icons ─────────────────────────────────────────────────────────────

function AppleIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3c-1.5-1.5-4-2-6-1 0 0-.5 3 1.5 5.5" />
      <path d="M17.5 7.5C19.5 6 20 4 20 4c-2.5-1-5 .5-6 2" />
      <path d="M12 6C9 6 6 8.5 6 13c0 5 3 8 6 8s6-3 6-8c0-4.5-3-7-6-7Z" />
    </svg>
  );
}

function LightningIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color} stroke="none">
      <path d="M13 2L4.5 13.5H11.5L11 22L19.5 10.5H12.5L13 2Z" />
    </svg>
  );
}

function StopwatchIcon({ size = 14, color = 'currentColor' }: { size?: number; color?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="14" r="8" />
      <line x1="12" y1="14" x2="12" y2="10" />
      <line x1="10" y1="2" x2="14" y2="2" />
      <line x1="12" y1="2" x2="12" y2="4" />
      <line x1="19.5" y1="7.5" x2="18" y2="9" />
    </svg>
  );
}

export const TimerModeIcon = ({ mode, size = 14, color = 'currentColor' }: { mode: ActiveTimerMode; size?: number; color?: string }) => {
  if (mode === 'pomodoro') return <AppleIcon size={size} color={color} />;
  if (mode === 'timer') return <LightningIcon size={size} color={color} />;
  return <StopwatchIcon size={size} color={color} />;
};

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const MODE_LABELS: Record<ActiveTimerMode, string> = {
  pomodoro: 'Pomodoro',
  timer: 'Timer',
  stopwatch: 'Stopwatch',
};

const MODE_COLORS: Record<ActiveTimerMode, string> = {
  pomodoro: 'hsl(0, 72%, 62%)',
  timer: 'hsl(265, 72%, 62%)',
  stopwatch: 'hsl(35, 92%, 52%)',
};

export function Pomodoro() {
  const pomodoro = useStore((s) => s.pomodoro);
  const categories = useStore((s) => s.categories);
  const focusMode = useStore((s) => s.focusMode);
  const startPomodoro = useStore((s) => s.startPomodoro);
  const pausePomodoro = useStore((s) => s.pausePomodoro);
  const resetPomodoro = useStore((s) => s.resetPomodoro);
  const tickPomodoro = useStore((s) => s.tickPomodoro);
  const exitFocusMode = useStore((s) => s.exitFocusMode);
  const setPomodoroSettingsOpen = useStore((s) => s.setPomodoroSettingsOpen);
  const setActiveTimerMode = useStore((s) => s.setActiveTimerMode);

  // Timer actions
  const startTimer = useStore((s) => s.startTimer);
  const pauseTimer = useStore((s) => s.pauseTimer);
  const resetTimer = useStore((s) => s.resetTimer);
  const tickTimer = useStore((s) => s.tickTimer);
  const setTimerDuration = useStore((s) => s.setTimerDuration);

  // Stopwatch actions
  const startStopwatch = useStore((s) => s.startStopwatch);
  const pauseStopwatch = useStore((s) => s.pauseStopwatch);
  const resetStopwatch = useStore((s) => s.resetStopwatch);
  const tickStopwatch = useStore((s) => s.tickStopwatch);
  const lapStopwatch = useStore((s) => s.lapStopwatch);

  const activeMode = pomodoro.activeTimerMode;

  // Synamon companion
  const activeUid = useStore((s) => s.synamon.activeUid);
  const starterChosen = useStore((s) => s.synamon.starterChosen);
  const synamonCollection = useStore((s) => s.synamon.collection);
  const activeSynamon = activeUid ? synamonCollection[activeUid] as OwnedSynamon | undefined : undefined;
  const hasCompanion = !!activeSynamon && starterChosen;

  const companionIdleFrames = useMemo(() => {
    if (!activeSynamon) return [];
    const species = getSpecies(activeSynamon.speciesId);
    if (!species) return [];
    const idleKey = `stage${activeSynamon.stage}-idle`;
    const frames = species.animations?.[idleKey];
    if (Array.isArray(frames) && frames.length) return frames;
    const stageData = species.stages.find(s => s.stage === activeSynamon.stage);
    if (stageData?.sprite) return [stageData.sprite];
    return [];
  }, [activeSynamon?.speciesId, activeSynamon?.stage]);

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);

  // Drag offset from natural position (bottom-right corner)
  const x = useMotionValue(pomodoro.widgetX || 0);
  const y = useMotionValue(pomodoro.widgetY || 0);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [dragConstraints, setDragConstraints] = useState({ top: -800, left: -1200, right: 0, bottom: 0 });

  // Resize state
  const [scale, setScale] = useState(pomodoro.widgetScale || 1);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, scale: 1 });

  // Dropdown states
  const [showPresets, setShowPresets] = useState(false);
  const [showModeDropdown, setShowModeDropdown] = useState(false);

  // Save position and scale to store
  const saveWidgetPosition = useCallback((newX: number, newY: number) => {
    useStore.setState((state) => ({
      pomodoro: { ...state.pomodoro, widgetX: newX, widgetY: newY },
    }));
  }, []);

  const saveWidgetScale = useCallback((newScale: number) => {
    useStore.setState((state) => ({
      pomodoro: { ...state.pomodoro, widgetScale: newScale },
    }));
  }, []);

  const updateConstraints = useCallback(() => {
    const el = widgetRef.current;
    if (!el) return;
    const { offsetWidth, offsetHeight } = el;
    const html = document.documentElement;
    const zoomStyle = (html as any).style?.zoom || getComputedStyle(html).zoom;
    const zoom = zoomStyle ? parseFloat(zoomStyle) : 1;
    setDragConstraints({
      right: 0,
      bottom: 0,
      left: -((window.innerWidth / zoom) - offsetWidth - 20 - 8),
      top: -((window.innerHeight / zoom) - offsetHeight - 20 - 8),
    });
  }, []);

  useEffect(() => {
    updateConstraints();
    window.addEventListener('resize', updateConstraints);
    return () => window.removeEventListener('resize', updateConstraints);
  }, [updateConstraints]);

  // Pomodoro tick
  useEffect(() => {
    if (activeMode !== 'pomodoro' || !pomodoro.isRunning) return;
    const interval = setInterval(tickPomodoro, 1000);
    return () => clearInterval(interval);
  }, [activeMode, pomodoro.isRunning, tickPomodoro]);

  // Timer tick
  useEffect(() => {
    if (activeMode !== 'timer' || !pomodoro.timer.isRunning) return;
    const interval = setInterval(tickTimer, 1000);
    return () => clearInterval(interval);
  }, [activeMode, pomodoro.timer.isRunning, tickTimer]);

  // Stopwatch tick
  useEffect(() => {
    if (activeMode !== 'stopwatch' || !pomodoro.stopwatch.isRunning) return;
    const interval = setInterval(tickStopwatch, 1000);
    return () => clearInterval(interval);
  }, [activeMode, pomodoro.stopwatch.isRunning, tickStopwatch]);

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = { x: e.clientX, scale };
  };

  useEffect(() => {
    if (!isResizing) {
      if (scale !== pomodoro.widgetScale) saveWidgetScale(scale);
      return;
    }
    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartRef.current.x;
      const scaleDelta = deltaX / 200;
      const newScale = Math.min(1.75, Math.max(1, resizeStartRef.current.scale + scaleDelta));
      setScale(newScale);
    };
    const handleMouseUp = () => setIsResizing(false);
    const handleBlur = () => setIsResizing(false);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('blur', handleBlur);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('blur', handleBlur);
    };
  }, [isResizing, scale, pomodoro.widgetScale, saveWidgetScale]);

  // Audio notification on pomodoro timer end
  useEffect(() => {
    if (activeMode === 'pomodoro' && pomodoro.timeRemaining === 0 && !pomodoro.isRunning) {
      try {
        const ctx = new AudioContext();
        const playNote = (freq: number, delay: number) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.frequency.value = freq;
          osc.type = 'sine';
          gain.gain.setValueAtTime(0, ctx.currentTime + delay);
          gain.gain.linearRampToValueAtTime(0.12, ctx.currentTime + delay + 0.05);
          gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + 0.6);
          osc.start(ctx.currentTime + delay);
          osc.stop(ctx.currentTime + delay + 0.6);
        };
        if (pomodoro.mode === 'work') {
          playNote(523, 0);
          playNote(659, 0.2);
        } else {
          playNote(659, 0);
          playNote(523, 0.2);
        }
      } catch {
        // Audio not available
      }
    }
  }, [activeMode, pomodoro.timeRemaining, pomodoro.isRunning, pomodoro.mode]);

  // Close dropdowns on outside click
  useEffect(() => {
    if (!showPresets && !showModeDropdown) return;
    const handler = () => { setShowPresets(false); setShowModeDropdown(false); };
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [showPresets, showModeDropdown]);

  // Derived values for each mode
  const focusedCategory = pomodoro.focusedCategoryId ? categories[pomodoro.focusedCategoryId] : null;

  // Get current display time, progress, running state per mode
  let displayTime = 0;
  let progress = 0;
  let isRunning = false;
  let ringColor = MODE_COLORS[activeMode];

  if (activeMode === 'pomodoro') {
    const totalTime = pomodoro.mode === 'work' ? pomodoro.workDuration
      : pomodoro.mode === 'break' ? pomodoro.breakDuration : pomodoro.longBreakDuration;
    displayTime = pomodoro.timeRemaining;
    progress = 1 - pomodoro.timeRemaining / totalTime;
    isRunning = pomodoro.isRunning;
    ringColor = focusedCategory ? focusedCategory.color
      : pomodoro.mode === 'work' ? 'hsl(0, 72%, 62%)' : 'hsl(120, 60%, 50%)';
  } else if (activeMode === 'timer') {
    displayTime = pomodoro.timer.timeRemaining;
    progress = pomodoro.timer.duration > 0 ? 1 - pomodoro.timer.timeRemaining / pomodoro.timer.duration : 0;
    isRunning = pomodoro.timer.isRunning;
  } else {
    displayTime = pomodoro.stopwatch.elapsed;
    // Stopwatch: progress cycles every 60 seconds for visual effect
    progress = (pomodoro.stopwatch.elapsed % 60) / 60;
    isRunning = pomodoro.stopwatch.isRunning;
  }

  const modeLabel = activeMode === 'pomodoro'
    ? (pomodoro.mode === 'work' ? 'Focus' : pomodoro.mode === 'break' ? 'Break' : 'Long Break')
    : activeMode === 'timer' ? 'Countdown' : 'Elapsed';

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySessions = activeMode === 'pomodoro'
    ? pomodoro.sessions.filter((s) => s.mode === 'work' && new Date(s.endTime).toISOString().slice(0, 10) === todayStr).length
    : activeMode === 'timer'
    ? pomodoro.timer.sessions.filter((s) => new Date(s.endTime).toISOString().slice(0, 10) === todayStr).length
    : pomodoro.stopwatch.sessions.filter((s) => new Date(s.endTime).toISOString().slice(0, 10) === todayStr).length;

  // Play/pause/reset handlers per mode
  const handlePlay = () => {
    if (activeMode === 'pomodoro') startPomodoro();
    else if (activeMode === 'timer') startTimer();
    else startStopwatch();
  };

  const handlePause = () => {
    if (activeMode === 'pomodoro') pausePomodoro();
    else if (activeMode === 'timer') pauseTimer();
    else pauseStopwatch();
  };

  const handleReset = () => {
    if (activeMode === 'pomodoro') resetPomodoro();
    else if (activeMode === 'timer') resetTimer();
    else resetStopwatch();
  };

  // Check if any mode has something running (for indicator)
  const anyRunning = pomodoro.isRunning || pomodoro.timer.isRunning || pomodoro.stopwatch.isRunning;

  return (
    <AnimatePresence>
      <motion.div
        ref={widgetRef}
        className="pomodoro-widget"
        drag
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={dragConstraints}
        onDragStart={updateConstraints}
        onDragEnd={() => {
          saveWidgetPosition(x.get(), y.get());
        }}
        style={{
          x,
          y,
          cursor: isResizing ? 'ew-resize' : 'grab',
          touchAction: 'none',
        }}
        animate={{
          opacity: 1,
          y: 0,
          scale: scale,
        }}
        initial={{ y: 60, opacity: 0, scale: 1 }}
        whileDrag={{ cursor: 'grabbing' }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        {/* Burger menu / Pokeball icon — opens analytics modal */}
        <div
          className="pomodoro-grip"
          title="View analytics"
          onClick={() => setIsModalOpen(true)}
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: hasCompanion ? 0 : 3,
            padding: '2px 4px',
            opacity: 0.5,
            flexShrink: 0,
            userSelect: 'none',
            cursor: 'pointer',
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.5')}
        >
          {hasCompanion ? (
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="11" stroke="currentColor" strokeWidth="2" />
              <line x1="1" y1="12" x2="23" y2="12" stroke="currentColor" strokeWidth="2" />
              <circle cx="12" cy="12" r="3.5" fill="currentColor" stroke="var(--bg-primary)" strokeWidth="1.5" />
            </svg>
          ) : (
            [0, 1, 2].map((i) => (
              <div
                key={i}
                style={{
                  width: 14,
                  height: 2,
                  borderRadius: 1,
                  background: 'var(--text-tertiary)',
                }}
              />
            ))
          )}
        </div>

        {/* Ring + Synamon creature — ring centered on creature, both overlapping */}
        <div style={{ flexShrink: 0, position: 'relative', width: 56, height: 56 }}>
          {/* Synamon sprite centered */}
          {hasCompanion && companionIdleFrames.length > 0 && (
            <div style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 0,
            }}>
              <SynamonSprite
                frames={companionIdleFrames}
                size={48}
                fps={8}
              />
            </div>
          )}
          {/* Progress ring centered on top */}
          <svg width="56" height="56" viewBox="0 0 56 56" style={{ position: 'relative', zIndex: 1 }}>
            <circle cx="28" cy="28" r="24" fill="none" stroke="var(--bg-tertiary)" strokeWidth="3" opacity="0.5" />
            <circle
              cx="28" cy="28" r="24"
              fill="none"
              stroke={ringColor}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 24}`}
              strokeDashoffset={`${2 * Math.PI * 24 * (1 - progress)}`}
              transform="rotate(-90 28 28)"
              style={{ transition: 'stroke-dashoffset 1s linear' }}
            />
            {isRunning && (
              <circle
                cx="28" cy="28" r="24"
                fill="none"
                stroke={ringColor}
                strokeWidth="1"
                strokeLinecap="round"
                strokeDasharray={`${2 * Math.PI * 24}`}
                strokeDashoffset={`${2 * Math.PI * 24 * (1 - progress)}`}
                transform="rotate(-90 28 28)"
                style={{
                  filter: `drop-shadow(0 0 4px ${ringColor})`,
                  transition: 'stroke-dashoffset 1s linear',
                  opacity: 0.6,
                }}
              />
            )}
          </svg>
        </div>

        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Mode label as dropdown trigger */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <div style={{ position: 'relative' }}>
              <button
                className="timer-mode-dropdown-trigger"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowModeDropdown(!showModeDropdown);
                }}
                style={{ color: activeMode === 'pomodoro'
                  ? (pomodoro.mode === 'work' ? 'hsl(0, 72%, 62%)' : pomodoro.mode === 'break' ? 'hsl(120, 60%, 50%)' : 'hsl(210, 80%, 65%)')
                  : MODE_COLORS[activeMode]
                }}
              >
                <TimerModeIcon mode={activeMode} size={11} />
                {modeLabel}
                <span style={{ fontSize: 8, opacity: 0.6 }}>▾</span>
                {/* Running indicators for background modes */}
                {(activeMode !== 'pomodoro' && pomodoro.isRunning) ||
                 (activeMode !== 'timer' && pomodoro.timer.isRunning) ||
                 (activeMode !== 'stopwatch' && pomodoro.stopwatch.isRunning) ? (
                  <span style={{
                    width: 5, height: 5, borderRadius: '50%',
                    background: 'hsl(35, 92%, 52%)',
                    animation: 'pulse 2s infinite',
                    marginLeft: 2,
                  }} />
                ) : null}
              </button>
              {showModeDropdown && (
                <div className="timer-mode-dropdown" onClick={(e) => e.stopPropagation()}>
                  {(['pomodoro', 'timer', 'stopwatch'] as ActiveTimerMode[]).map((mode) => {
                    const modeRunning = mode === 'pomodoro' ? pomodoro.isRunning
                      : mode === 'timer' ? pomodoro.timer.isRunning
                      : pomodoro.stopwatch.isRunning;
                    return (
                      <button
                        key={mode}
                        className={`timer-mode-dropdown-option ${mode === activeMode ? 'active' : ''}`}
                        onClick={() => { setActiveTimerMode(mode); setShowModeDropdown(false); }}
                      >
                        <TimerModeIcon mode={mode} size={12} color={mode === activeMode ? MODE_COLORS[mode] : 'var(--text-secondary)'} />
                        <span>{MODE_LABELS[mode]}</span>
                        {modeRunning && mode !== activeMode && (
                          <span style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: MODE_COLORS[mode],
                            animation: 'pulse 2s infinite',
                            marginLeft: 'auto',
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
            {focusMode && focusedCategory && (
              <span style={{
                fontSize: 9,
                color: focusedCategory.color,
                fontWeight: 500,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
              }}>
                {focusedCategory.name}
              </span>
            )}
          </div>
          <div className="pomodoro-timer">{formatTime(displayTime)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {/* Pomodoro: session pips */}
            {activeMode === 'pomodoro' && (
              <div className="pomodoro-sessions">
                {Array.from({ length: 4 }).map((_, i) => (
                  <div
                    key={i}
                    className={`pip ${i < pomodoro.sessionsCompleted % 4 ? 'filled' : ''}`}
                    style={i < pomodoro.sessionsCompleted % 4 && focusedCategory
                      ? { background: focusedCategory.color }
                      : {}
                    }
                  />
                ))}
              </div>
            )}
            {/* Timer: show set duration */}
            {activeMode === 'timer' && !pomodoro.timer.isRunning && (
              <div style={{ position: 'relative' }}>
                <button
                  className="timer-preset-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowPresets(!showPresets);
                  }}
                  title="Choose duration"
                >
                  {formatTime(pomodoro.timer.duration)} ▾
                </button>
                {showPresets && (
                  <div className="timer-preset-dropdown" onClick={(e) => e.stopPropagation()}>
                    {pomodoro.timer.presets.map((preset) => (
                      <button
                        key={preset}
                        className={`timer-preset-option ${preset === pomodoro.timer.duration ? 'active' : ''}`}
                        onClick={() => {
                          setTimerDuration(preset);
                          setShowPresets(false);
                        }}
                      >
                        {formatTime(preset)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {/* Stopwatch: lap count */}
            {activeMode === 'stopwatch' && pomodoro.stopwatch.laps.length > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {pomodoro.stopwatch.laps.length} lap{pomodoro.stopwatch.laps.length !== 1 ? 's' : ''}
              </span>
            )}
            {todaySessions > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {todaySessions} today
              </span>
            )}
          </div>
        </div>

        {/* Controls — right column fills first, extra buttons overflow left */}
        <div className="pomodoro-controls-grid">
          {/* Extra button (LAP/exit focus) goes to the left column only when present */}
          {activeMode === 'stopwatch' && isRunning ? (
            <div className="pomodoro-controls-col" style={{ justifyContent: 'flex-end' }}>
              <button className="pomodoro-btn" onClick={lapStopwatch} title="Lap" style={{ fontSize: 10 }}>
                LAP
              </button>
            </div>
          ) : focusMode ? (
            <div className="pomodoro-controls-col" style={{ justifyContent: 'flex-end' }}>
              <button className="pomodoro-btn" onClick={exitFocusMode} title="Exit focus mode" style={{ fontSize: 12 }}>
                &times;
              </button>
            </div>
          ) : null}
          {/* Right column: play/pause, reset, settings — always against the right wall */}
          <div className="pomodoro-controls-col">
            {isRunning ? (
              <button className="pomodoro-btn" onClick={handlePause} title="Pause">&#x23F8;</button>
            ) : (
              <button className="pomodoro-btn" onClick={handlePlay} title="Start">&#x25B6;</button>
            )}
            <button className="pomodoro-btn" onClick={handleReset} title="Reset">&#x21BA;</button>
            <button
              className="pomodoro-btn"
              onClick={() => setPomodoroSettingsOpen(true)}
              title="Settings"
              style={{ fontSize: 13 }}
            >
              ⚙
            </button>
          </div>
        </div>

        {/* Resize handle */}
        <div
          onMouseDown={handleResizeStart}
          title="Drag to resize"
          style={{
            position: 'absolute',
            right: 4,
            bottom: 4,
            width: 12,
            height: 12,
            cursor: 'ew-resize',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: 0.4,
            transition: 'opacity 0.2s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.8')}
          onMouseLeave={(e) => (e.currentTarget.style.opacity = '0.4')}
        >
          <svg width="8" height="8" viewBox="0 0 8 8">
            <path
              d="M0 8 L8 0 M4 8 L8 4"
              stroke="var(--text-tertiary)"
              strokeWidth="1.5"
              fill="none"
            />
          </svg>
        </div>
      </motion.div>

      {/* Analytics Modal */}
      <PomodoroModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </AnimatePresence>
  );
}
