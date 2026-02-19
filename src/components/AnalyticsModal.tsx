import { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import HeatMap from '@uiw/react-heat-map';
import { useStore } from '../store';

interface HeatmapData {
  date: string;
  count: number;
  tasksCompleted: number;
  pomodoroMinutes: number;
}

export function AnalyticsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const tasks = useStore((s) => s.tasks);
  const pomodoro = useStore((s) => s.pomodoro);
  const streak = useStore((s) => s.streak);
  const [activeTab, setActiveTab] = useState<'heatmap' | 'stats'>('heatmap');

  // Generate last 365 days of data
  const heatmapData = useMemo(() => {
    const data: HeatmapData[] = [];
    const today = new Date();
    
    // Calculate daily stats
    const dailyStats: Record<string, { tasks: number; pomodoroMinutes: number }> = {};
    
    // Count tasks completed per day
    Object.values(tasks).forEach((task) => {
      if (task.completed && task.completedAt) {
        const date = new Date(task.completedAt).toISOString().split('T')[0];
        if (!dailyStats[date]) {
          dailyStats[date] = { tasks: 0, pomodoroMinutes: 0 };
        }
        dailyStats[date].tasks++;
      }
    });
    
    // Count pomodoro minutes per day
    pomodoro.sessions.forEach((session) => {
      if (session.mode === 'work') {
        const date = new Date(session.startTime).toISOString().split('T')[0];
        if (!dailyStats[date]) {
          dailyStats[date] = { tasks: 0, pomodoroMinutes: 0 };
        }
        dailyStats[date].pomodoroMinutes += Math.round(
          (session.endTime - session.startTime) / 60000
        );
      }
    });
    
    // Generate last 365 days - only include days with activity
    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateKey = date.toISOString().split('T')[0];
      const dateStr = dateKey.replace(/-/g, '/');
      const stats = dailyStats[dateKey];
      
      // Only add days that have activity
      if (stats && (stats.tasks > 0 || stats.pomodoroMinutes > 0)) {
        // Calculate intensity based on combined activity (tasks + pomodoro hours)
        const activityScore = stats.tasks + Math.floor(stats.pomodoroMinutes / 60);
        let count = 1;
        if (activityScore >= 2) count = 2;
        if (activityScore >= 5) count = 3;
        if (activityScore >= 10) count = 4;
        
        data.push({
          date: dateStr,
          count,
          tasksCompleted: stats.tasks,
          pomodoroMinutes: stats.pomodoroMinutes,
        });
      }
    }
    
    return data;
  }, [tasks, pomodoro.sessions]);

  // Calculate summary stats
  const summaryStats = useMemo(() => {
    const activeDays = heatmapData.length;
    const totalTasks = heatmapData.reduce((sum, d) => sum + d.tasksCompleted, 0);
    const totalMinutes = heatmapData.reduce((sum, d) => sum + d.pomodoroMinutes, 0);
    const maxTasksInDay = heatmapData.length > 0 ? Math.max(...heatmapData.map((d) => d.tasksCompleted)) : 0;
    const maxMinutesInDay = heatmapData.length > 0 ? Math.max(...heatmapData.map((d) => d.pomodoroMinutes)) : 0;
    
    return {
      activeDays,
      totalTasks,
      totalMinutes,
      maxTasksInDay,
      maxMinutesInDay,
    };
  }, [heatmapData]);

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          onClick={(e) => e.stopPropagation()}
          style={{ maxWidth: 800, maxHeight: '90vh', overflow: 'auto' }}
        >
          <h2 style={{ marginBottom: 8 }}>Analytics</h2>

          {/* Tab Switcher */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 20 }}>
            <button
              className={`btn ${activeTab === 'heatmap' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('heatmap')}
            >
              Activity Heatmap
            </button>
            <button
              className={`btn ${activeTab === 'stats' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setActiveTab('stats')}
            >
              Statistics
            </button>
          </div>

          {activeTab === 'heatmap' && (
            <>
              {/* Summary Cards */}
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(4, 1fr)',
                  gap: 12,
                  marginBottom: 24,
                }}
              >
                <div
                  style={{
                    padding: 16,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: 'hsl(210, 80%, 60%)',
                      marginBottom: 4,
                    }}
                  >
                    {streak.currentStreak}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Current Streak</div>
                </div>

                <div
                  style={{
                    padding: 16,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: 'hsl(210, 80%, 60%)',
                      marginBottom: 4,
                    }}
                  >
                    {summaryStats.activeDays}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Active Days</div>
                </div>

                <div
                  style={{
                    padding: 16,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: 'hsl(210, 80%, 60%)',
                      marginBottom: 4,
                    }}
                  >
                    {summaryStats.totalTasks}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Tasks Done</div>
                </div>

                <div
                  style={{
                    padding: 16,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    textAlign: 'center',
                  }}
                >
                  <div
                    style={{
                      fontSize: 24,
                      fontWeight: 700,
                      color: 'hsl(210, 80%, 60%)',
                      marginBottom: 4,
                    }}
                  >
                    {Math.round(summaryStats.totalMinutes / 60)}h
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Focus Time</div>
                </div>
              </div>

              {/* Heatmap */}
              <div style={{ marginBottom: 20 }}>
                <HeatMap
                  value={heatmapData}
                  width={750}
                  style={{
                    color: 'var(--text-primary)',
                  }}
                  startDate={new Date(Date.now() - 364 * 24 * 60 * 60 * 1000)}
                  rectSize={12}
                  space={2}
                  legendCellSize={0}
                  panelColors={[
                    'var(--bg-tertiary)',
                    'hsl(210, 40%, 35%)',
                    'hsl(210, 60%, 45%)',
                    'hsl(210, 80%, 55%)',
                    'hsl(210, 100%, 65%)',
                  ]}
                  rectRender={(props, data) => {
                    const dayData = heatmapData.find(
                      (d) => d.date === data.date
                    );
                    const hasActivity = dayData && (dayData.tasksCompleted > 0 || dayData.pomodoroMinutes > 0);
                    if (!hasActivity) {
                      return (
                        <g>
                          <rect 
                            {...props} 
                            rx={2} 
                            fill="var(--bg-tertiary)"
                            opacity={0.3}
                          />
                        </g>
                      );
                    }
                    return (
                      <g>
                        <rect 
                          {...props} 
                          rx={2} 
                          fill={props.fill}
                        />
                        <title>{`${data.date}: ${dayData.tasksCompleted} tasks, ${Math.round(dayData.pomodoroMinutes / 60 * 10) / 10}h focused`}</title>
                      </g>
                    );
                  }}
                />
              </div>

              {/* Legend */}
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  fontSize: 12,
                  color: 'var(--text-secondary)',
                }}
              >
                <span>Less</span>
                {[
                  'var(--bg-tertiary)',
                  'hsl(210, 40%, 35%)',
                  'hsl(210, 60%, 45%)',
                  'hsl(210, 80%, 55%)',
                  'hsl(210, 100%, 65%)',
                ].map((color, i) => (
                  <div
                    key={i}
                    style={{
                      width: 12,
                      height: 12,
                      background: color,
                      borderRadius: 2,
                    }}
                  />
                ))}
                <span>More</span>
              </div>
            </>
          )}

          {activeTab === 'stats' && (
            <>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: 16,
                }}
              >
                <div
                  style={{
                    padding: 20,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <h4 style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>
                    All-Time Stats
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Longest Streak</span>
                      <span style={{ fontWeight: 600 }}>{streak.longestStreak} days</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total Tasks Created</span>
                      <span style={{ fontWeight: 600 }}>{Object.keys(tasks).length}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Total Tasks Completed</span>
                      <span style={{ fontWeight: 600 }}>
                        {Object.values(tasks).filter((t) => t.completed).length}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Pomodoro Sessions</span>
                      <span style={{ fontWeight: 600 }}>{pomodoro.sessions.length}</span>
                    </div>
                  </div>
                </div>

                <div
                  style={{
                    padding: 20,
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                  }}
                >
                  <h4 style={{ margin: '0 0 12px', color: 'var(--text-secondary)' }}>
                    Last 365 Days
                  </h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Best Day (Tasks)</span>
                      <span style={{ fontWeight: 600 }}>{summaryStats.maxTasksInDay}</span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Best Day (Focus)</span>
                      <span style={{ fontWeight: 600 }}>
                        {Math.round(summaryStats.maxMinutesInDay / 60)}h
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Avg Tasks/Day</span>
                      <span style={{ fontWeight: 600 }}>
                        {(summaryStats.totalTasks / 365).toFixed(1)}
                      </span>
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                      <span>Avg Focus/Day</span>
                      <span style={{ fontWeight: 600 }}>
                        {Math.round(summaryStats.totalMinutes / 365)}m
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </>
          )}

          <div className="modal-actions">
            <button className="btn btn-ghost" onClick={onClose}>Close</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
