import { useEffect, useRef, useState, useCallback } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence, useMotionValue } from 'framer-motion';

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
  const x = useMotionValue(pomodoro.widgetX || 0);
  const y = useMotionValue(pomodoro.widgetY || 0);
  const widgetRef = useRef<HTMLDivElement>(null);
  const [dragConstraints, setDragConstraints] = useState({ top: -800, left: -1200, right: 0, bottom: 0 });
  
  // Resize state
  const [scale, setScale] = useState(pomodoro.widgetScale || 1);
  const [isResizing, setIsResizing] = useState(false);
  const resizeStartRef = useRef({ x: 0, scale: 1 });
  
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
    // Account for CSS zoom when calculating constraints
    const html = document.documentElement;
    const zoomStyle = (html as any).style?.zoom || getComputedStyle(html).zoom;
    const zoom = zoomStyle ? parseFloat(zoomStyle) : 1;
    // The widget is fixed at bottom:20px right:20px — allow dragging to all four edges with an 8px margin
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

  // Timer tick
  useEffect(() => {
    if (!pomodoro.isRunning) return;
    const interval = setInterval(tickPomodoro, 1000);
    return () => clearInterval(interval);
  }, [pomodoro.isRunning, tickPomodoro]);

  // Resize handlers
  const handleResizeStart = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);
    resizeStartRef.current = { x: e.clientX, scale };
  };

  useEffect(() => {
    if (!isResizing) {
      // Save scale when resizing ends
      if (scale !== pomodoro.widgetScale) {
        saveWidgetScale(scale);
      }
      return;
    }

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizeStartRef.current.x;
      // Scale based on drag distance (100px drag = 0.5 scale change)
      const scaleDelta = deltaX / 200;
      const newScale = Math.min(1.75, Math.max(1, resizeStartRef.current.scale + scaleDelta));
      setScale(newScale);
    };

    const handleMouseUp = () => {
      setIsResizing(false);
    };

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
        dragConstraints={dragConstraints}
        onDragStart={updateConstraints}
        onDragEnd={() => {
          // Use the motion values (accumulated position) not info.offset (delta from drag start)
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
          {focusMode && (
            <button className="pomodoro-btn" onClick={exitFocusMode} title="Exit focus mode" style={{ fontSize: 12 }}>
              &times;
            </button>
          )}
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
    </AnimatePresence>
  );
}
