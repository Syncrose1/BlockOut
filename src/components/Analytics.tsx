import { useMemo } from 'react';
import { useStore } from '../store';
import { calculateDailyStats } from '../utils/analytics';

function getColorForActivity(level: number): string {
  const colors = [
    'var(--bg-tertiary)',     // 0 - no activity
    'hsl(210, 40%, 25%)',     // 1 - low
    'hsl(210, 60%, 35%)',     // 2 - medium-low
    'hsl(210, 70%, 45%)',     // 3 - medium
    'hsl(210, 80%, 55%)',     // 4 - high
    'hsl(210, 90%, 65%)',     // 5 - very high
  ];
  return colors[Math.min(level, colors.length - 1)];
}

export function ActivityHeatmap() {
  const tasks = useStore((s) => s.tasks);
  const timeBlocks = useStore((s) => s.timeBlocks);
  const pomodoro = useStore((s) => s.pomodoro);

  const dailyStats = useMemo(() => {
    return calculateDailyStats(pomodoro.sessions, tasks, timeBlocks);
  }, [pomodoro.sessions, tasks, timeBlocks]);

  // Generate last 365 days
  const days = useMemo(() => {
    const result: { date: string; stats: ReturnType<typeof calculateDailyStats>[string] | null }[] = [];
    const today = new Date();
    
    for (let i = 364; i >= 0; i--) {
      const date = new Date(today);
      date.setDate(date.getDate() - i);
      const dateStr = date.toISOString().slice(0, 10);
      result.push({
        date: dateStr,
        stats: dailyStats[dateStr] || null,
      });
    }
    return result;
  }, [dailyStats]);

  // Calculate activity level for each day
  const getActivityLevel = (stats: typeof dailyStats[string] | null): number => {
    if (!stats) return 0;
    const score = stats.tasksCompleted + Math.floor(stats.pomodoroSessions / 2);
    if (score === 0) return 0;
    if (score === 1) return 1;
    if (score <= 3) return 2;
    if (score <= 5) return 3;
    if (score <= 8) return 4;
    return 5;
  };

  // Group by weeks for display
  const weeks = useMemo(() => {
    const result: typeof days[] = [];
    for (let i = 0; i < days.length; i += 7) {
      result.push(days.slice(i, i + 7));
    }
    return result;
  }, [days]);

  const monthLabels = useMemo(() => {
    const labels: { month: string; index: number }[] = [];
    let currentMonth = '';
    
    days.forEach((day, index) => {
      const month = day.date.slice(0, 7); // YYYY-MM
      if (month !== currentMonth) {
        currentMonth = month;
        labels.push({
          month: new Date(day.date).toLocaleDateString('en-US', { month: 'short' }),
          index: Math.floor(index / 7),
        });
      }
    });
    
    return labels;
  }, [days]);

  const totalTasksCompleted = Object.values(dailyStats).reduce(
    (sum, day) => sum + day.tasksCompleted, 0
  );
  const totalPomodoroSessions = Object.values(dailyStats).reduce(
    (sum, day) => sum + day.pomodoroSessions, 0
  );
  const totalPomodoroMinutes = Object.values(dailyStats).reduce(
    (sum, day) => sum + day.pomodoroMinutes, 0
  );
  const activeDays = Object.values(dailyStats).filter(
    (day) => day.tasksCompleted > 0 || day.pomodoroSessions > 0
  ).length;

  return (
    <div className="activity-heatmap">
      <div style={{ marginBottom: 24 }}>
        <h3 style={{ margin: '0 0 8px', fontSize: 18 }}>Activity Heatmap</h3>
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(4, 1fr)',
            gap: 16,
            fontSize: 13,
            color: 'var(--text-secondary)',
          }}
        >
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {totalTasksCompleted}
            </div>
            Tasks completed
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {totalPomodoroSessions}
            </div>
            Focus sessions
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {Math.round(totalPomodoroMinutes / 60)}h
            </div>
            Focus time
          </div>
          <div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-primary)' }}>
              {activeDays}
            </div>
            Active days
          </div>
        </div>
      </div>

      <div style={{ overflowX: 'auto', paddingBottom: 8 }}>
        <div style={{ display: 'flex', gap: 4, minWidth: 800 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginRight: 8 }}>
            <div style={{ height: 12, fontSize: 10, color: 'var(--text-tertiary)' }}>M</div>
            <div style={{ height: 12, fontSize: 10, color: 'var(--text-tertiary)' }}>W</div>
            <div style={{ height: 12, fontSize: 10, color: 'var(--text-tertiary)' }}>F</div>
          </div>
          
          {weeks.map((week, weekIndex) => (
            <div key={weekIndex} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {week.map((day) => {
                const level = getActivityLevel(day.stats);
                return (
                  <div
                    key={day.date}
                    title={`${day.date}: ${day.stats?.tasksCompleted || 0} tasks, ${day.stats?.pomodoroSessions || 0} sessions`}
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: 2,
                      background: getColorForActivity(level),
                      cursor: 'pointer',
                    }}
                  />
                );
              })}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 4, marginTop: 8, marginLeft: 20, minWidth: 800 }}>
          {monthLabels.map((label, i) => (
            <div
              key={i}
              style={{
                fontSize: 10,
                color: 'var(--text-tertiary)',
                marginLeft: label.index > 0 ? `${(label.index - (monthLabels[i - 1]?.index || 0)) * 16 - 4}px` : 0,
              }}
            >
              {label.month}
            </div>
          ))}
        </div>
      </div>

      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          marginTop: 16,
          fontSize: 12,
          color: 'var(--text-tertiary)',
        }}
      >
        <span>Less</span>
        {[0, 1, 2, 3, 4, 5].map((level) => (
          <div
            key={level}
            style={{
              width: 12,
              height: 12,
              borderRadius: 2,
              background: getColorForActivity(level),
            }}
          />
        ))}
        <span>More</span>
      </div>
    </div>
  );
}

export function CategoryBreakdown() {
  const tasks = useStore((s) => s.tasks);
  const categories = useStore((s) => s.categories);

  const stats = useMemo(() => {
    const categoryStats: Record<
      string,
      { total: number; completed: number; color: string; name: string }
    > = {};

    Object.values(tasks).forEach((task) => {
      const catId = task.categoryId;
      if (!categoryStats[catId]) {
        categoryStats[catId] = {
          total: 0,
          completed: 0,
          color: categories[catId]?.color || 'var(--text-tertiary)',
          name: categories[catId]?.name || 'Unknown',
        };
      }
      categoryStats[catId].total++;
      if (task.completed) {
        categoryStats[catId].completed++;
      }
    });

    return Object.entries(categoryStats).sort((a, b) => b[1].total - a[1].total);
  }, [tasks, categories]);

  const totalTasks = Object.values(tasks).length;

  return (
    <div className="category-breakdown">
      <h3 style={{ margin: '0 0 16px', fontSize: 18 }}>Category Breakdown</h3>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {stats.map(([catId, stat]) => {
          const percentage = totalTasks > 0 ? (stat.total / totalTasks) * 100 : 0;
          const completionRate = stat.total > 0 ? (stat.completed / stat.total) * 100 : 0;

          return (
            <div key={catId}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 4,
                  fontSize: 13,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      width: 12,
                      height: 12,
                      borderRadius: '50%',
                      background: stat.color,
                    }}
                  />
                  <span>{stat.name}</span>
                </div>
                <span style={{ color: 'var(--text-secondary)' }}>
                  {stat.completed}/{stat.total} ({Math.round(completionRate)}%)
                </span>
              </div>

              <div
                style={{
                  height: 8,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 4,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${completionRate}%`,
                    height: '100%',
                    background: stat.color,
                    borderRadius: 4,
                  }}
                />
              </div>

              <div
                style={{
                  height: 4,
                  marginTop: 2,
                  background: 'var(--bg-tertiary)',
                  borderRadius: 2,
                  overflow: 'hidden',
                }}
              >
                <div
                  style={{
                    width: `${percentage}%`,
                    height: '100%',
                    background: stat.color,
                    opacity: 0.3,
                    borderRadius: 2,
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
