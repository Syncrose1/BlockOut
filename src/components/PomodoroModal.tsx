import { useState, useMemo, useEffect } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import type { PomodoroSession, TimerSession, ActiveTimerMode } from '../types';
import { requestNotificationPermission } from '../utils/pomodoroNotifications';
import { TimerModeIcon } from './Pomodoro';

interface PomodoroModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours}h`;
}

function formatTime(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  if (h > 0) return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

const MODE_COLORS: Record<ActiveTimerMode, string> = {
  pomodoro: 'hsl(142, 72%, 62%)',
  timer: 'hsl(265, 72%, 62%)',
  stopwatch: 'hsl(35, 92%, 52%)',
};

const MODE_GRADIENT: Record<ActiveTimerMode, string> = {
  pomodoro: 'linear-gradient(135deg, hsl(142, 72%, 62%) 0%, hsl(142, 72%, 40%) 100%)',
  timer: 'linear-gradient(135deg, hsl(265, 72%, 62%) 0%, hsl(265, 72%, 40%) 100%)',
  stopwatch: 'linear-gradient(135deg, hsl(35, 92%, 52%) 0%, hsl(35, 82%, 40%) 100%)',
};

export function PomodoroModal({ isOpen, onClose }: PomodoroModalProps) {
  const pomodoro = useStore((s) => s.pomodoro);
  const categories = useStore((s) => s.categories);
  const skipPomodoro = useStore((s) => s.skipPomodoro);
  const resetAllPomodoro = useStore((s) => s.resetAllPomodoro);
  const activeMode = pomodoro.activeTimerMode;
  const [selectedView, setSelectedView] = useState<'overview' | 'history' | 'stats'>('overview');

  useEffect(() => {
    requestNotificationPermission();
  }, []);

  // ── Pomodoro Analytics ──────────────────────────────────────────────────
  const pomodoroAnalytics = useMemo(() => {
    const sessions = pomodoro.sessions;
    const now = Date.now();
    const today = new Date().setHours(0, 0, 0, 0);

    const todaySessions = sessions.filter(s => s.startTime >= today);
    const todayMinutes = todaySessions.reduce((acc, s) => acc + ((s.endTime - s.startTime) / 60000), 0);

    const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
    const weekSessions = sessions.filter(s => s.startTime >= weekAgo);
    const weekMinutes = weekSessions.reduce((acc, s) => acc + ((s.endTime - s.startTime) / 60000), 0);

    const totalMinutes = sessions.reduce((acc, s) => acc + ((s.endTime - s.startTime) / 60000), 0);
    const totalSessions = sessions.length;
    const avgMinutes = totalSessions > 0 ? totalMinutes / totalSessions : 0;

    const workSessions = sessions.filter(s => s.mode === 'work').length;
    const breakSessions = sessions.filter(s => s.mode === 'break').length;
    const longBreakSessions = sessions.filter(s => s.mode === 'longBreak').length;

    const categoryStats: Record<string, { count: number; minutes: number; color: string; name: string }> = {};
    sessions.forEach(s => {
      if (s.categoryId && categories[s.categoryId]) {
        const cat = categories[s.categoryId];
        const duration = (s.endTime - s.startTime) / 60000;
        if (!categoryStats[s.categoryId]) {
          categoryStats[s.categoryId] = { count: 0, minutes: 0, color: cat.color, name: cat.name };
        }
        categoryStats[s.categoryId].count++;
        categoryStats[s.categoryId].minutes += duration;
      }
    });

    const dailyStats = [];
    for (let i = 6; i >= 0; i--) {
      const date = new Date(now - (i * 24 * 60 * 60 * 1000));
      const dayStart = date.setHours(0, 0, 0, 0);
      const dayEnd = dayStart + (24 * 60 * 60 * 1000);
      const daySessions = sessions.filter(s => s.startTime >= dayStart && s.startTime < dayEnd);
      const dayMinutes = daySessions.reduce((acc, s) => acc + ((s.endTime - s.startTime) / 60000), 0);
      dailyStats.push({
        day: date.toLocaleDateString('en-US', { weekday: 'short' }),
        minutes: Math.round(dayMinutes),
        sessions: daySessions.length
      });
    }

    return {
      todayMinutes: Math.round(todayMinutes),
      todaySessions: todaySessions.length,
      weekMinutes: Math.round(weekMinutes),
      weekSessions: weekSessions.length,
      totalMinutes: Math.round(totalMinutes),
      totalSessions, avgMinutes: Math.round(avgMinutes),
      workSessions, breakSessions, longBreakSessions,
      categoryStats: Object.values(categoryStats).sort((a, b) => b.minutes - a.minutes),
      dailyStats,
      longestSession: 0,
      shortestSession: 0,
    };
  }, [pomodoro.sessions, categories]);

  // ── Timer Analytics ─────────────────────────────────────────────────────
  const timerAnalytics = useMemo(() => {
    const sessions = pomodoro.timer.sessions;
    return computeGenericAnalytics(sessions);
  }, [pomodoro.timer.sessions]);

  // ── Stopwatch Analytics ─────────────────────────────────────────────────
  const stopwatchAnalytics = useMemo(() => {
    const sessions = pomodoro.stopwatch.sessions;
    return computeGenericAnalytics(sessions);
  }, [pomodoro.stopwatch.sessions]);

  const recentSessions = useMemo(() => {
    if (activeMode === 'pomodoro') {
      return [...pomodoro.sessions].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
    } else if (activeMode === 'timer') {
      return [...pomodoro.timer.sessions].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
    } else {
      return [...pomodoro.stopwatch.sessions].sort((a, b) => b.startTime - a.startTime).slice(0, 10);
    }
  }, [activeMode, pomodoro.sessions, pomodoro.timer.sessions, pomodoro.stopwatch.sessions]);

  const analytics = activeMode === 'pomodoro' ? pomodoroAnalytics
    : activeMode === 'timer' ? timerAnalytics : stopwatchAnalytics;

  const currentTimeRemaining = pomodoro.timeRemaining;
  const currentMode = pomodoro.mode;
  const pomodoroIsRunning = pomodoro.isRunning;

  // Header display per mode
  const headerTime = activeMode === 'pomodoro' ? formatTime(currentTimeRemaining)
    : activeMode === 'timer' ? formatTime(pomodoro.timer.timeRemaining)
    : formatTime(pomodoro.stopwatch.elapsed);

  const headerLabel = activeMode === 'pomodoro'
    ? (currentMode === 'work' ? 'Focus Time' : currentMode === 'break' ? 'Short Break' : 'Long Break')
    : activeMode === 'timer' ? 'Timer' : 'Stopwatch';

  const headerIsRunning = activeMode === 'pomodoro' ? pomodoroIsRunning
    : activeMode === 'timer' ? pomodoro.timer.isRunning
    : pomodoro.stopwatch.isRunning;

  // Gradient based on current mode
  const headerGradient = activeMode === 'pomodoro'
    ? (currentMode === 'work'
      ? 'linear-gradient(135deg, hsl(142, 72%, 62%) 0%, hsl(142, 72%, 40%) 100%)'
      : currentMode === 'break'
      ? 'linear-gradient(135deg, hsl(35, 92%, 52%) 0%, hsl(35, 92%, 40%) 100%)'
      : 'linear-gradient(135deg, hsl(210, 100%, 56%) 0%, hsl(210, 100%, 40%) 100%)')
    : MODE_GRADIENT[activeMode];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            style={{
              position: 'fixed',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.7)',
              backdropFilter: 'blur(8px)',
              zIndex: 9998,
            }}
          />

          <div style={{
            position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            zIndex: 9999, pointerEvents: 'none',
          }}>
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                width: '90vw', maxWidth: '900px',
                height: '85vh', maxHeight: '700px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                display: 'flex', flexDirection: 'column',
                pointerEvents: 'auto', overflow: 'hidden',
              }}
            >
              {/* Title bar with mode switcher */}
              <div style={{
                padding: '24px 32px',
                borderBottom: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                  <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                    {activeMode === 'pomodoro' ? 'Pomodoro Focus' : activeMode === 'timer' ? 'Timer' : 'Stopwatch'}
                  </h2>
                  {/* Mode pills in modal header */}
                  <div style={{ display: 'flex', gap: 4 }}>
                    {(['pomodoro', 'timer', 'stopwatch'] as ActiveTimerMode[]).map((mode) => (
                      <button
                        key={mode}
                        onClick={() => useStore.getState().setActiveTimerMode(mode)}
                        style={{
                          padding: '4px 10px',
                          borderRadius: 12,
                          border: '1px solid',
                          borderColor: activeMode === mode ? MODE_COLORS[mode] + '60' : 'var(--border)',
                          background: activeMode === mode ? MODE_COLORS[mode] + '20' : 'transparent',
                          color: activeMode === mode ? MODE_COLORS[mode] : 'var(--text-tertiary)',
                          fontSize: 12,
                          fontWeight: 600,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          textTransform: 'capitalize',
                        }}
                      >
                        <TimerModeIcon mode={mode} size={12} color={activeMode === mode ? MODE_COLORS[mode] : 'var(--text-tertiary)'} /> {mode}
                      </button>
                    ))}
                  </div>
                </div>
                <button
                  onClick={onClose}
                  style={{
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    padding: '8px 16px',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                    fontSize: 14,
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  Close
                </button>
              </div>

              {/* Timer display banner */}
              <div style={{
                padding: '32px',
                background: headerGradient,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexDirection: 'column', gap: 12,
              }}>
                <div style={{
                  fontSize: 72, fontWeight: 700, color: 'white',
                  fontFamily: 'var(--font-mono)', letterSpacing: -2,
                  textShadow: '0 2px 10px rgba(0,0,0,0.2)',
                }}>
                  {headerTime}
                </div>
                <div style={{
                  fontSize: 18, color: 'white', opacity: 0.9,
                  textTransform: 'uppercase', letterSpacing: 2, fontWeight: 500,
                }}>
                  {headerLabel}
                </div>
                {headerIsRunning && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%',
                      background: 'white', animation: 'pulse 2s infinite',
                    }} />
                    <span style={{ color: 'white', fontSize: 14, opacity: 0.9 }}>
                      {activeMode === 'stopwatch' ? 'Running' : 'Timer Running'}
                    </span>
                  </div>
                )}

                {/* Stopwatch laps table */}
                {activeMode === 'stopwatch' && pomodoro.stopwatch.laps.length > 0 && (
                  <div style={{
                    marginTop: 16, width: '100%', maxWidth: 400,
                    background: 'rgba(0,0,0,0.2)', borderRadius: 8,
                    overflow: 'hidden',
                  }}>
                    {/* Lap table header */}
                    <div style={{
                      display: 'grid', gridTemplateColumns: '48px 1fr 1fr',
                      padding: '6px 12px',
                      borderBottom: '1px solid rgba(255,255,255,0.15)',
                      fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
                      letterSpacing: 1, color: 'rgba(255,255,255,0.5)',
                    }}>
                      <span>#</span>
                      <span style={{ textAlign: 'right' }}>Split</span>
                      <span style={{ textAlign: 'right' }}>Total</span>
                    </div>
                    {/* Lap rows - show most recent first, scrollable */}
                    <div style={{ maxHeight: 120, overflowY: 'auto' }}>
                      {[...pomodoro.stopwatch.laps].reverse().map((lap, revIdx) => {
                        const i = pomodoro.stopwatch.laps.length - 1 - revIdx;
                        const prevLap = i > 0 ? pomodoro.stopwatch.laps[i - 1] : 0;
                        const split = lap - prevLap;
                        // Find best/worst splits for highlighting
                        const allSplits = pomodoro.stopwatch.laps.map((l, idx) =>
                          l - (idx > 0 ? pomodoro.stopwatch.laps[idx - 1] : 0)
                        );
                        const bestSplit = Math.min(...allSplits);
                        const worstSplit = Math.max(...allSplits);
                        const isBest = allSplits.length > 1 && split === bestSplit;
                        const isWorst = allSplits.length > 1 && split === worstSplit;
                        return (
                          <div key={i} style={{
                            display: 'grid', gridTemplateColumns: '48px 1fr 1fr',
                            padding: '5px 12px',
                            borderBottom: revIdx < pomodoro.stopwatch.laps.length - 1 ? '1px solid rgba(255,255,255,0.06)' : 'none',
                            fontSize: 13, fontFamily: 'var(--font-mono)',
                            color: 'white',
                            background: isBest ? 'rgba(100,255,100,0.08)' : isWorst ? 'rgba(255,100,100,0.08)' : 'transparent',
                          }}>
                            <span style={{ opacity: 0.5, fontSize: 11 }}>
                              {i + 1}
                            </span>
                            <span style={{
                              textAlign: 'right', fontWeight: 600,
                              color: isBest ? 'hsl(142, 80%, 70%)' : isWorst ? 'hsl(0, 80%, 70%)' : 'white',
                            }}>
                              {isBest && allSplits.length > 2 ? '▲ ' : ''}{isWorst && allSplits.length > 2 ? '▼ ' : ''}{formatTime(split)}
                            </span>
                            <span style={{ textAlign: 'right', opacity: 0.7 }}>
                              {formatTime(lap)}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Action buttons - pomodoro only */}
                {activeMode === 'pomodoro' && (
                  <div style={{ display: 'flex', gap: 12, marginTop: 16 }}>
                    <button
                      onClick={() => skipPomodoro()}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(255, 255, 255, 0.15)',
                        border: '1px solid rgba(255, 255, 255, 0.3)',
                        borderRadius: 'var(--radius-md)',
                        color: 'white', fontSize: 13, cursor: 'pointer',
                        opacity: 0.8, transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '1';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.25)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.8';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)';
                      }}
                      title="Skip current session (not counted)"
                    >
                      Skip {currentMode === 'work' ? 'Focus' : currentMode === 'break' ? 'Break' : 'Long Break'} →
                    </button>
                    <button
                      onClick={() => {
                        if (confirm('Reset Pomodoro to beginning? This will clear the current cycle.')) {
                          resetAllPomodoro();
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        background: 'rgba(255, 255, 255, 0.1)',
                        border: '1px solid rgba(255, 255, 255, 0.2)',
                        borderRadius: 'var(--radius-md)',
                        color: 'white', fontSize: 13, cursor: 'pointer',
                        opacity: 0.7, transition: 'all 0.2s',
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.opacity = '0.9';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.2)';
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.opacity = '0.7';
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)';
                      }}
                      title="Reset entire Pomodoro session to beginning"
                    >
                      ↺ Reset All
                    </button>
                  </div>
                )}
              </div>

              {/* Tab bar */}
              <div style={{
                display: 'flex',
                borderBottom: '1px solid var(--border)',
                background: 'var(--bg-tertiary)',
              }}>
                {(['overview', 'history', 'stats'] as const).map((view) => (
                  <button
                    key={view}
                    onClick={() => setSelectedView(view)}
                    style={{
                      flex: 1, padding: '16px',
                      background: selectedView === view ? 'var(--bg-secondary)' : 'transparent',
                      border: 'none',
                      borderBottom: selectedView === view ? `2px solid ${MODE_COLORS[activeMode]}` : '2px solid transparent',
                      color: selectedView === view ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: 14,
                      fontWeight: selectedView === view ? 600 : 500,
                      cursor: 'pointer', textTransform: 'capitalize',
                      transition: 'all 0.2s',
                    }}
                  >
                    {view}
                  </button>
                ))}
              </div>

              {/* Tab content */}
              <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
                {selectedView === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                      <StatCard label="Today" value={formatDuration(analytics.todayMinutes)} subvalue={`${analytics.todaySessions} sessions`} />
                      <StatCard label="This Week" value={formatDuration(analytics.weekMinutes)} subvalue={`${analytics.weekSessions} sessions`} />
                      <StatCard label="Total" value={formatDuration(analytics.totalMinutes)} subvalue={`${analytics.totalSessions} sessions`} />
                      <StatCard label="Average" value={formatDuration(analytics.avgMinutes)} subvalue="per session" />
                    </div>

                    {/* Bar chart */}
                    <div style={{
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      padding: 20,
                      border: '1px solid var(--border)',
                    }}>
                      <h3 style={{ margin: '0 0 20px 0', fontSize: 16, color: 'var(--text-primary)' }}>
                        Last 7 Days
                      </h3>
                      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 12, height: 150 }}>
                        {analytics.dailyStats.map((stat, i) => {
                          const maxMinutes = Math.max(...analytics.dailyStats.map(s => s.minutes), 60);
                          const height = maxMinutes > 0 ? (stat.minutes / maxMinutes) * 100 : 0;
                          return (
                            <div key={i} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                              <div style={{ position: 'relative', width: '100%', height: 120, display: 'flex', alignItems: 'flex-end' }}>
                                <div style={{
                                  width: '100%',
                                  height: `${Math.max(height, 4)}%`,
                                  background: stat.minutes > 0 ? MODE_COLORS[activeMode] : 'var(--bg-primary)',
                                  borderRadius: '4px 4px 0 0',
                                  minHeight: 4,
                                  transition: 'height 0.3s ease',
                                }} />
                                {stat.minutes > 0 && (
                                  <div style={{
                                    position: 'absolute', top: -20, left: '50%',
                                    transform: 'translateX(-50%)',
                                    fontSize: 11, color: 'var(--text-secondary)', whiteSpace: 'nowrap',
                                  }}>
                                    {stat.minutes}m
                                  </div>
                                )}
                              </div>
                              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{stat.day}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    {/* Session types - pomodoro only */}
                    {activeMode === 'pomodoro' && (
                      <div style={{
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 20,
                        border: '1px solid var(--border)',
                      }}>
                        <h3 style={{ margin: '0 0 16px 0', fontSize: 16, color: 'var(--text-primary)' }}>
                          Session Types
                        </h3>
                        <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
                          <ModeBadge count={pomodoroAnalytics.workSessions} label="Work" color="hsl(142, 72%, 62%)" />
                          <ModeBadge count={pomodoroAnalytics.breakSessions} label="Break" color="hsl(35, 92%, 52%)" />
                          <ModeBadge count={pomodoroAnalytics.longBreakSessions} label="Long Break" color="hsl(210, 100%, 56%)" />
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {selectedView === 'history' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {recentSessions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                        {activeMode === 'pomodoro' ? 'No sessions yet. Start your first Pomodoro!'
                          : activeMode === 'timer' ? 'No timer sessions yet. Set a duration and go!'
                          : 'No stopwatch sessions yet. Hit start to begin!'}
                      </div>
                    ) : (
                      recentSessions.map((session) => (
                        activeMode === 'pomodoro'
                          ? <PomodoroSessionRow key={session.id} session={session as PomodoroSession} categories={categories} />
                          : <TimerSessionRow key={session.id} session={session as TimerSession} mode={activeMode} />
                      ))
                    )}
                  </div>
                )}

                {selectedView === 'stats' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-md)',
                      padding: 24,
                      border: '1px solid var(--border)',
                    }}>
                      <h3 style={{ margin: '0 0 20px 0', fontSize: 18, color: 'var(--text-primary)' }}>
                        All-Time Statistics
                      </h3>
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 20 }}>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                            Total Time
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatDuration(analytics.totalMinutes)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                            Total Sessions
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {analytics.totalSessions}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                            Average Session
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatDuration(analytics.avgMinutes)}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                            This Week
                          </div>
                          <div style={{ fontSize: 32, fontWeight: 700, color: 'var(--text-primary)' }}>
                            {formatDuration(analytics.weekMinutes)}
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Category Breakdown - pomodoro only */}
                    {activeMode === 'pomodoro' && pomodoroAnalytics.categoryStats.length > 0 && (
                      <div style={{
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 24,
                        border: '1px solid var(--border)',
                      }}>
                        <h3 style={{ margin: '0 0 20px 0', fontSize: 18, color: 'var(--text-primary)' }}>
                          Focus by Category
                        </h3>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                          {pomodoroAnalytics.categoryStats.map((cat) => (
                            <div key={cat.name} style={{
                              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                              padding: '12px 16px', background: 'var(--bg-secondary)',
                              borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <div style={{ width: 12, height: 12, borderRadius: '50%', background: cat.color }} />
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                                  {cat.name}
                                </span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
                                <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
                                  {cat.count} sessions
                                </span>
                                <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)', minWidth: 60, textAlign: 'right' }}>
                                  {formatDuration(Math.round(cat.minutes))}
                                </span>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Longest session - timer/stopwatch */}
                    {activeMode !== 'pomodoro' && analytics.longestSession > 0 && (
                      <div style={{
                        background: 'var(--bg-tertiary)',
                        borderRadius: 'var(--radius-md)',
                        padding: 24,
                        border: '1px solid var(--border)',
                      }}>
                        <h3 style={{ margin: '0 0 12px 0', fontSize: 18, color: 'var(--text-primary)' }}>
                          Records
                        </h3>
                        <div style={{ display: 'flex', gap: 24 }}>
                          <div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                              Longest Session
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: MODE_COLORS[activeMode] }}>
                              {formatDuration(Math.round(analytics.longestSession))}
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize: 12, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
                              Shortest Session
                            </div>
                            <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--text-primary)' }}>
                              {formatDuration(Math.round(analytics.shortestSession))}
                            </div>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}

// ── Shared analytics computation for timer/stopwatch ──────────────────────

function computeGenericAnalytics(sessions: TimerSession[]) {
  const now = Date.now();
  const today = new Date().setHours(0, 0, 0, 0);

  const todaySess = sessions.filter(s => s.startTime >= today);
  const todayMinutes = todaySess.reduce((acc, s) => acc + s.duration / 60, 0);

  const weekAgo = now - (7 * 24 * 60 * 60 * 1000);
  const weekSess = sessions.filter(s => s.startTime >= weekAgo);
  const weekMinutes = weekSess.reduce((acc, s) => acc + s.duration / 60, 0);

  const totalMinutes = sessions.reduce((acc, s) => acc + s.duration / 60, 0);
  const totalSessions = sessions.length;
  const avgMinutes = totalSessions > 0 ? totalMinutes / totalSessions : 0;

  const longestSession = sessions.length > 0
    ? Math.max(...sessions.map(s => s.duration / 60)) : 0;
  const shortestSession = sessions.length > 0
    ? Math.min(...sessions.map(s => s.duration / 60)) : 0;

  const dailyStats = [];
  for (let i = 6; i >= 0; i--) {
    const date = new Date(now - (i * 24 * 60 * 60 * 1000));
    const dayStart = date.setHours(0, 0, 0, 0);
    const dayEnd = dayStart + (24 * 60 * 60 * 1000);
    const daySessions = sessions.filter(s => s.startTime >= dayStart && s.startTime < dayEnd);
    const dayMinutes = daySessions.reduce((acc, s) => acc + s.duration / 60, 0);
    dailyStats.push({
      day: date.toLocaleDateString('en-US', { weekday: 'short' }),
      minutes: Math.round(dayMinutes),
      sessions: daySessions.length,
    });
  }

  return {
    todayMinutes: Math.round(todayMinutes),
    todaySessions: todaySess.length,
    weekMinutes: Math.round(weekMinutes),
    weekSessions: weekSess.length,
    totalMinutes: Math.round(totalMinutes),
    totalSessions,
    avgMinutes: Math.round(avgMinutes),
    longestSession,
    shortestSession,
    dailyStats,
  };
}

// ── Sub-components ────────────────────────────────────────────────────────

function StatCard({ label, value, subvalue }: { label: string; value: string; subvalue: string }) {
  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)',
      padding: 16,
      border: '1px solid var(--border)',
      textAlign: 'center',
    }}>
      <div style={{ fontSize: 11, color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
        {value}
      </div>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
        {subvalue}
      </div>
    </div>
  );
}

function ModeBadge({ count, label, color }: { count: number; label: string; color: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <div style={{ width: 12, height: 12, borderRadius: '50%', background: color }} />
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{count}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
      </div>
    </div>
  );
}

import type { Category } from '../types';

function PomodoroSessionRow({ session, categories }: { session: PomodoroSession; categories: Record<string, Category> }) {
  const duration = Math.round((session.endTime - session.startTime) / 60000);
  const date = new Date(session.startTime);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

  const modeColors = {
    work: 'hsl(142, 72%, 62%)',
    break: 'hsl(35, 92%, 52%)',
    longBreak: 'hsl(210, 100%, 56%)',
  };
  const modeLabels = {
    work: 'Work',
    break: 'Break',
    longBreak: 'Long Break',
  };
  const category = session.categoryId ? categories[session.categoryId] : null;

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 16px', background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{ width: 10, height: 10, borderRadius: '50%', background: modeColors[session.mode] }} />
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
              {modeLabels[session.mode]}
            </span>
            {category && (
              <span style={{
                fontSize: 11, color: category.color,
                background: `${category.color}20`,
                padding: '2px 6px', borderRadius: '4px',
              }}>
                {category.name}
              </span>
            )}
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
            {dateStr} at {timeStr}
          </div>
        </div>
      </div>
      <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
        {duration}m
      </div>
    </div>
  );
}

function TimerSessionRow({ session, mode }: { session: TimerSession; mode: ActiveTimerMode }) {
  const [expanded, setExpanded] = useState(false);
  const duration = Math.round(session.duration / 60);
  const date = new Date(session.startTime);
  const dateStr = date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  const hasLaps = session.laps && session.laps.length > 0;

  return (
    <div style={{
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)', border: '1px solid var(--border)',
      overflow: 'hidden',
    }}>
      {/* Main row */}
      <div
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '12px 16px',
          cursor: hasLaps ? 'pointer' : 'default',
        }}
        onClick={() => hasLaps && setExpanded(!expanded)}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ width: 10, height: 10, borderRadius: '50%', background: MODE_COLORS[mode] }} />
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
                {mode === 'timer' ? 'Timer' : 'Stopwatch'}
              </span>
              {hasLaps && (
                <span style={{
                  fontSize: 11, color: MODE_COLORS[mode],
                  background: `${MODE_COLORS[mode]}20`,
                  padding: '2px 6px', borderRadius: '4px',
                  cursor: 'pointer',
                }}>
                  {session.laps!.length} lap{session.laps!.length !== 1 ? 's' : ''} {expanded ? '▾' : '▸'}
                </span>
              )}
              {session.label && (
                <span style={{
                  fontSize: 11, color: 'var(--text-secondary)',
                  background: 'var(--bg-secondary)',
                  padding: '2px 6px', borderRadius: '4px',
                }}>
                  {session.label}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
              {dateStr} at {timeStr}
            </div>
          </div>
        </div>
        <div style={{ fontSize: 16, fontWeight: 600, color: 'var(--text-primary)' }}>
          {duration < 1 ? `${session.duration}s` : `${duration}m`}
        </div>
      </div>

      {/* Expanded lap table */}
      {expanded && hasLaps && (
        <div style={{
          borderTop: '1px solid var(--border)',
          padding: '0',
        }}>
          {/* Header */}
          <div style={{
            display: 'grid', gridTemplateColumns: '40px 1fr 1fr',
            padding: '6px 16px',
            fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
            letterSpacing: 1, color: 'var(--text-tertiary)',
            borderBottom: '1px solid var(--border)',
          }}>
            <span>#</span>
            <span style={{ textAlign: 'right' }}>Split</span>
            <span style={{ textAlign: 'right' }}>Total</span>
          </div>
          {/* Rows */}
          {session.laps!.map((lap, i) => {
            const prevLap = i > 0 ? session.laps![i - 1] : 0;
            const split = lap - prevLap;
            const allSplits = session.laps!.map((l, idx) =>
              l - (idx > 0 ? session.laps![idx - 1] : 0)
            );
            const bestSplit = Math.min(...allSplits);
            const worstSplit = Math.max(...allSplits);
            const isBest = allSplits.length > 1 && split === bestSplit;
            const isWorst = allSplits.length > 1 && split === worstSplit;
            return (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '40px 1fr 1fr',
                padding: '4px 16px',
                fontSize: 12, fontFamily: 'var(--font-mono)',
                borderBottom: i < session.laps!.length - 1 ? '1px solid var(--border-light, rgba(255,255,255,0.04))' : 'none',
                background: isBest ? `${MODE_COLORS[mode]}10` : isWorst ? 'hsl(0, 60%, 50%, 0.06)' : 'transparent',
              }}>
                <span style={{ color: 'var(--text-tertiary)', fontSize: 11 }}>{i + 1}</span>
                <span style={{
                  textAlign: 'right', fontWeight: 600,
                  color: isBest ? 'hsl(142, 72%, 62%)' : isWorst ? 'hsl(0, 72%, 62%)' : 'var(--text-primary)',
                }}>
                  {isBest && allSplits.length > 2 ? '▲ ' : ''}{isWorst && allSplits.length > 2 ? '▼ ' : ''}{formatTime(split)}
                </span>
                <span style={{ textAlign: 'right', color: 'var(--text-secondary)' }}>
                  {formatTime(lap)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
