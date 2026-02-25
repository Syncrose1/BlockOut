import { useState, useMemo } from 'react';
import { useStore } from '../store';
import { motion, AnimatePresence } from 'framer-motion';
import type { PomodoroSession } from '../types';

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
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function PomodoroModal({ isOpen, onClose }: PomodoroModalProps) {
  const pomodoro = useStore((s) => s.pomodoro);
  const sessions = pomodoro.sessions;
  const [selectedView, setSelectedView] = useState<'overview' | 'history' | 'stats'>('overview');

  const analytics = useMemo(() => {
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
      weekMinutes: Math.round(weekMinutes),
      totalMinutes: Math.round(totalMinutes),
      totalSessions,
      avgMinutes: Math.round(avgMinutes),
      workSessions,
      breakSessions,
      longBreakSessions,
      dailyStats
    };
  }, [sessions]);

  const recentSessions = useMemo(() => {
    return [...sessions]
      .sort((a, b) => b.startTime - a.startTime)
      .slice(0, 10);
  }, [sessions]);

  const currentTimeRemaining = pomodoro.timeRemaining;
  const currentMode = pomodoro.mode;
  const isRunning = pomodoro.isRunning;

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
          
          <div
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              zIndex: 9999,
              pointerEvents: 'none',
            }}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              style={{
                width: '90vw',
                maxWidth: '900px',
                height: '85vh',
                maxHeight: '700px',
                background: 'var(--bg-secondary)',
                borderRadius: 'var(--radius-lg)',
                border: '1px solid var(--border)',
                boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
                display: 'flex',
                flexDirection: 'column',
                pointerEvents: 'auto',
                overflow: 'hidden',
              }}
            >
              <div style={{
                padding: '24px 32px',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
              }}>
                <h2 style={{ margin: 0, fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
                  Pomodoro Focus
                </h2>
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

              <div style={{
                padding: '32px',
                background: currentMode === 'work' 
                  ? 'linear-gradient(135deg, hsl(142, 72%, 62%) 0%, hsl(142, 72%, 40%) 100%)'
                  : currentMode === 'break'
                  ? 'linear-gradient(135deg, hsl(35, 92%, 52%) 0%, hsl(35, 92%, 40%) 100%)'
                  : 'linear-gradient(135deg, hsl(210, 100%, 56%) 0%, hsl(210, 100%, 40%) 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: 12,
              }}>
                <div style={{
                  fontSize: 72,
                  fontWeight: 700,
                  color: 'white',
                  fontFamily: 'var(--font-mono)',
                  letterSpacing: -2,
                  textShadow: '0 2px 10px rgba(0,0,0,0.2)',
                }}>
                  {formatTime(currentTimeRemaining)}
                </div>
                <div style={{
                  fontSize: 18,
                  color: 'white',
                  opacity: 0.9,
                  textTransform: 'uppercase',
                  letterSpacing: 2,
                  fontWeight: 500,
                }}>
                  {currentMode === 'work' ? 'Focus Time' : currentMode === 'break' ? 'Short Break' : 'Long Break'}
                </div>
                {isRunning && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    marginTop: 8,
                  }}>
                    <span style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'white',
                      animation: 'pulse 2s infinite',
                    }} />
                    <span style={{ color: 'white', fontSize: 14, opacity: 0.9 }}>
                      Timer Running
                    </span>
                  </div>
                )}
              </div>

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
                      flex: 1,
                      padding: '16px',
                      background: selectedView === view ? 'var(--bg-secondary)' : 'transparent',
                      border: 'none',
                      borderBottom: selectedView === view ? '2px solid var(--accent)' : '2px solid transparent',
                      color: selectedView === view ? 'var(--text-primary)' : 'var(--text-secondary)',
                      fontSize: 14,
                      fontWeight: selectedView === view ? 600 : 500,
                      cursor: 'pointer',
                      textTransform: 'capitalize',
                      transition: 'all 0.2s',
                    }}
                  >
                    {view}
                  </button>
                ))}
              </div>

              <div style={{
                flex: 1,
                overflow: 'auto',
                padding: '24px 32px',
              }}>
                {selectedView === 'overview' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16 }}>
                      <StatCard
                        label="Today"
                        value={formatDuration(analytics.todayMinutes)}
                        subvalue={`${analytics.dailyStats[6]?.sessions || 0} sessions`}
                      />
                      <StatCard
                        label="This Week"
                        value={formatDuration(analytics.weekMinutes)}
                        subvalue={`${analytics.dailyStats.reduce((acc, day) => acc + day.sessions, 0)} sessions`}
                      />
                      <StatCard
                        label="Total"
                        value={formatDuration(analytics.totalMinutes)}
                        subvalue={`${analytics.totalSessions} sessions`}
                      />
                      <StatCard
                        label="Average"
                        value={formatDuration(analytics.avgMinutes)}
                        subvalue="per session"
                      />
                    </div>

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
                                  background: stat.minutes > 0 ? 'var(--accent)' : 'var(--bg-primary)',
                                  borderRadius: '4px 4px 0 0',
                                  minHeight: 4,
                                  transition: 'height 0.3s ease',
                                }} />
                                {stat.minutes > 0 && (
                                  <div style={{
                                    position: 'absolute',
                                    top: -20,
                                    left: '50%',
                                    transform: 'translateX(-50%)',
                                    fontSize: 11,
                                    color: 'var(--text-secondary)',
                                    whiteSpace: 'nowrap',
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
                        <ModeBadge count={analytics.workSessions} label="Work" color="hsl(142, 72%, 62%)" />
                        <ModeBadge count={analytics.breakSessions} label="Break" color="hsl(35, 92%, 52%)" />
                        <ModeBadge count={analytics.longBreakSessions} label="Long Break" color="hsl(210, 100%, 56%)" />
                      </div>
                    </div>
                  </div>
                )}

                {selectedView === 'history' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                    {recentSessions.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-tertiary)' }}>
                        No sessions yet. Start your first Pomodoro!
                      </div>
                    ) : (
                      recentSessions.map((session) => (
                        <SessionRow key={session.id} session={session} />
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
                            Total Focus Time
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
      <div style={{
        width: 12,
        height: 12,
        borderRadius: '50%',
        background: color,
      }} />
      <div>
        <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--text-primary)' }}>{count}</div>
        <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{label}</div>
      </div>
    </div>
  );
}

function SessionRow({ session }: { session: PomodoroSession }) {
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

  return (
    <div style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '12px 16px',
      background: 'var(--bg-tertiary)',
      borderRadius: 'var(--radius-md)',
      border: '1px solid var(--border)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <div style={{
          width: 10,
          height: 10,
          borderRadius: '50%',
          background: modeColors[session.mode],
        }} />
        <div>
          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-primary)' }}>
            {modeLabels[session.mode]}
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