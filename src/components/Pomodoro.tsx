import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence, useMotionValue, animate } from 'framer-motion';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

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

  // Drag offset from natural position (bottom-right corner)
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const widgetRef = useRef<HTMLDivElement>(null);
  // 'home' = bottom-right (natural), 'alt' = top-left
  const dockedCorner = useRef<'home' | 'alt'>('home');

  // Timer tick
  useEffect(() => {
    if (!pomodoro.isRunning) return;
    const interval = setInterval(tickPomodoro, 1000);
    return () => clearInterval(interval);
  }, [pomodoro.isRunning, tickPomodoro]);

  // Audio notification on timer end
  useEffect(() => {
    if (pomodoro.timeRemaining === 0 && !pomodoro.isRunning) {
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
  }, [pomodoro.timeRemaining, pomodoro.isRunning, pomodoro.mode]);

  const swapCorner = () => {
    const el = widgetRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ww = window.innerWidth;
    const wh = window.innerHeight;

    if (dockedCorner.current === 'home') {
      // Move to top-left.
      // Widget CSS: position fixed, bottom:20, right:20.
      // Natural left edge: ww - rect.width - 20.  Target left edge: 20.
      // dx = 20 - (ww - rect.width - 20) = rect.width + 40 - ww
      // Natural top edge: wh - rect.height - 20. Target top edge: 20.
      // dy = 20 - (wh - rect.height - 20) = rect.height + 40 - wh
      const targetX = rect.width + 40 - ww;
      const targetY = rect.height + 40 - wh;
      animate(x, targetX, { type: 'spring', damping: 24, stiffness: 300 });
      animate(y, targetY, { type: 'spring', damping: 24, stiffness: 300 });
      dockedCorner.current = 'alt';
    } else {
      animate(x, 0, { type: 'spring', damping: 24, stiffness: 300 });
      animate(y, 0, { type: 'spring', damping: 24, stiffness: 300 });
      dockedCorner.current = 'home';
    }
  };

  const modeLabel = pomodoro.mode === 'work' ? 'Focus' : pomodoro.mode === 'break' ? 'Break' : 'Long Break';
  const focusedCategory = pomodoro.focusedCategoryId ? categories[pomodoro.focusedCategoryId] : null;

  const totalTime =
    pomodoro.mode === 'work'
      ? pomodoro.workDuration
      : pomodoro.mode === 'break'
      ? pomodoro.breakDuration
      : pomodoro.longBreakDuration;
  const progress = 1 - pomodoro.timeRemaining / totalTime;

  const ringColor = focusedCategory
    ? focusedCategory.color
    : pomodoro.mode === 'work'
    ? 'hsl(0, 72%, 62%)'
    : 'hsl(120, 60%, 50%)';

  const todayStr = new Date().toISOString().slice(0, 10);
  const todaySessions = pomodoro.sessions.filter(
    (s) => s.mode === 'work' && new Date(s.endTime).toISOString().slice(0, 10) === todayStr
  ).length;

  return (
    <AnimatePresence>
      <motion.div
        ref={widgetRef}
        className="pomodoro-widget"
        drag
        dragMomentum={false}
        dragElastic={0}
        dragConstraints={{ top: -4000, left: -4000, right: 0, bottom: 0 }}
        style={{ x, y, cursor: 'grab', touchAction: 'none' }}
        whileDrag={{ cursor: 'grabbing' }}
        initial={{ y: 60, opacity: 0 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        onDragEnd={() => {
          // After a free drag, clear docked corner so the swap button
          // snaps back to home rather than jumping to a stale alt position
          dockedCorner.current = 'home';
        }}
      >
        {/* Drag handle strip — a visual hint on the left edge */}
        <div
          className="pomodoro-grip"
          title="Drag to move"
          style={{
            display: 'flex',
            flexDirection: 'column',
            gap: 3,
            padding: '2px 4px',
            marginRight: -4,
            opacity: 0.3,
            flexShrink: 0,
            userSelect: 'none',
            pointerEvents: 'none',
          }}
        >
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 14,
                height: 2,
                borderRadius: 1,
                background: 'var(--text-tertiary)',
              }}
            />
          ))}
        </div>

        {/* Mini progress ring */}
        <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
          <circle cx="22" cy="22" r="18" fill="none" stroke="var(--bg-tertiary)" strokeWidth="3" />
          <circle
            cx="22" cy="22" r="18"
            fill="none"
            stroke={ringColor}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 18}`}
            strokeDashoffset={`${2 * Math.PI * 18 * (1 - progress)}`}
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
          {pomodoro.isRunning && (
            <circle
              cx="22" cy="22" r="18"
              fill="none"
              stroke={ringColor}
              strokeWidth="1"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 18}`}
              strokeDashoffset={`${2 * Math.PI * 18 * (1 - progress)}`}
              transform="rotate(-90 22 22)"
              style={{
                filter: `drop-shadow(0 0 4px ${ringColor})`,
                transition: 'stroke-dashoffset 1s linear',
                opacity: 0.6,
              }}
            />
          )}
        </svg>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span className={`pomodoro-mode ${pomodoro.mode}`}>{modeLabel}</span>
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
          <div className="pomodoro-timer">{formatTime(pomodoro.timeRemaining)}</div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
            {todaySessions > 0 && (
              <span style={{ fontSize: 9, color: 'var(--text-tertiary)', fontFamily: 'var(--font-mono)' }}>
                {todaySessions} today
              </span>
            )}
          </div>
        </div>

        <div className="pomodoro-controls">
          {pomodoro.isRunning ? (
            <button className="pomodoro-btn" onClick={pausePomodoro} title="Pause">&#x23F8;</button>
          ) : (
            <button className="pomodoro-btn" onClick={startPomodoro} title="Start">&#x25B6;</button>
          )}
          <button className="pomodoro-btn" onClick={resetPomodoro} title="Reset">&#x21BA;</button>
          <button
            className="pomodoro-btn"
            onClick={() => setPomodoroSettingsOpen(true)}
            title="Settings"
            style={{ fontSize: 13 }}
          >
            ⚙
          </button>
          {/* Corner swap button */}
          <button
            className="pomodoro-btn"
            onClick={swapCorner}
            title="Move to opposite corner"
            style={{ fontSize: 13, opacity: 0.6 }}
          >
            ⇱
          </button>
          {focusMode && (
            <button className="pomodoro-btn" onClick={exitFocusMode} title="Exit focus mode" style={{ fontSize: 12 }}>
              &times;
            </button>
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
