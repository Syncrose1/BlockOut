import { useEffect } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function Pomodoro() {
  const pomodoro = useStore((s) => s.pomodoro);
  const startPomodoro = useStore((s) => s.startPomodoro);
  const pausePomodoro = useStore((s) => s.pausePomodoro);
  const resetPomodoro = useStore((s) => s.resetPomodoro);
  const tickPomodoro = useStore((s) => s.tickPomodoro);

  // Timer tick
  useEffect(() => {
    if (!pomodoro.isRunning) return;
    const interval = setInterval(tickPomodoro, 1000);
    return () => clearInterval(interval);
  }, [pomodoro.isRunning, tickPomodoro]);

  // Audio notification on timer end
  useEffect(() => {
    if (pomodoro.timeRemaining === 0 && !pomodoro.isRunning) {
      // Play a subtle notification sound using Web Audio API
      try {
        const ctx = new AudioContext();
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = pomodoro.mode === 'work' ? 440 : 523;
        osc.type = 'sine';
        gain.gain.value = 0.1;
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.5);
        osc.start();
        osc.stop(ctx.currentTime + 0.5);
      } catch {
        // Audio not available
      }
    }
  }, [pomodoro.timeRemaining, pomodoro.isRunning, pomodoro.mode]);

  const modeLabel = pomodoro.mode === 'work' ? 'Focus' : pomodoro.mode === 'break' ? 'Break' : 'Long Break';

  // Progress for ring
  const totalTime =
    pomodoro.mode === 'work'
      ? pomodoro.workDuration
      : pomodoro.mode === 'break'
      ? pomodoro.breakDuration
      : pomodoro.longBreakDuration;
  const progress = 1 - pomodoro.timeRemaining / totalTime;

  return (
    <AnimatePresence>
      <motion.div
        className="pomodoro-widget"
        initial={{ y: 100, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
      >
        {/* Mini progress ring */}
        <svg width="44" height="44" viewBox="0 0 44 44" style={{ flexShrink: 0 }}>
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke="var(--bg-tertiary)"
            strokeWidth="3"
          />
          <circle
            cx="22"
            cy="22"
            r="18"
            fill="none"
            stroke={pomodoro.mode === 'work' ? 'hsl(0, 72%, 62%)' : 'hsl(120, 60%, 50%)'}
            strokeWidth="3"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 18}`}
            strokeDashoffset={`${2 * Math.PI * 18 * (1 - progress)}`}
            transform="rotate(-90 22 22)"
            style={{ transition: 'stroke-dashoffset 1s linear' }}
          />
        </svg>

        <div>
          <div className={`pomodoro-mode ${pomodoro.mode}`}>{modeLabel}</div>
          <div className="pomodoro-timer">{formatTime(pomodoro.timeRemaining)}</div>
          <div className="pomodoro-sessions">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className={`pip ${i < pomodoro.sessionsCompleted % 4 ? 'filled' : ''}`}
              />
            ))}
          </div>
        </div>

        <div className="pomodoro-controls">
          {pomodoro.isRunning ? (
            <button className="pomodoro-btn" onClick={pausePomodoro} title="Pause">
              ⏸
            </button>
          ) : (
            <button className="pomodoro-btn" onClick={startPomodoro} title="Start">
              ▶
            </button>
          )}
          <button className="pomodoro-btn" onClick={resetPomodoro} title="Reset">
            ↺
          </button>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
