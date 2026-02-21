import { useStore } from '../store';
import type { BlockOutExport, UserAnalytics, TaskActivity, DailyStats } from '../types/analytics';
import type { PomodoroSession, Task, Category, TimeBlock, StreakData } from '../types';

const EXPORT_VERSION = '1.0.0';

// Export all data as JSON
export async function exportData(type: 'full' | 'tasks_only' | 'analytics_only' = 'full'): Promise<BlockOutExport> {
  const state = useStore.getState();
  const serializable = state.getSerializableState();
  
  // Get analytics if available
  const analytics = await getAnalyticsData();
  
  const exportData: BlockOutExport = {
    version: EXPORT_VERSION,
    exportedAt: Date.now(),
    tasks: type === 'analytics_only' ? {} : serializable.tasks,
    categories: type === 'analytics_only' ? {} : serializable.categories,
    timeBlocks: type === 'analytics_only' ? {} : serializable.timeBlocks,
    activeBlockId: type === 'analytics_only' ? null : serializable.activeBlockId,
    pomodoroSessions: type === 'tasks_only' ? [] : serializable.pomodoroSessions,
    streak: type === 'analytics_only' ? { completionDates: [], currentStreak: 0, longestStreak: 0 } : serializable.streak,
    analytics: type === 'tasks_only' ? undefined : analytics,
    exportType: type,
    taskCount: Object.keys(serializable.tasks).length,
    categoryCount: Object.keys(serializable.categories).length,
    blockCount: Object.keys(serializable.timeBlocks).length,
  };
  
  return exportData;
}

// Export to file
export async function exportToFile(type: 'full' | 'tasks_only' | 'analytics_only' = 'full'): Promise<void> {
  const data = await exportData(type);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement('a');
  link.download = `blockout-export-${new Date().toISOString().slice(0, 10)}.json`;
  link.href = url;
  link.click();
  
  URL.revokeObjectURL(url);
}

// Import data from file
export async function importFromFile(file: File): Promise<{ success: boolean; error?: string; imported?: BlockOutExport }> {
  try {
    const text = await file.text();
    const data: BlockOutExport = JSON.parse(text);
    
    // Validate version
    if (!data.version) {
      return { success: false, error: 'Invalid export file: missing version' };
    }
    
    // Validate required fields
    if (!data.tasks || !data.categories || !data.timeBlocks) {
      return { success: false, error: 'Invalid export file: missing required data' };
    }
    
    // Apply the data with proper type casting
    useStore.getState().loadData({
      tasks: data.tasks as Record<string, Task>,
      categories: data.categories as Record<string, Category>,
      timeBlocks: data.timeBlocks as Record<string, TimeBlock>,
      activeBlockId: data.activeBlockId,
      streak: data.streak as StreakData,
      pomodoroSessions: data.pomodoroSessions as PomodoroSession[],
    });
    
    // Import analytics if present
    if (data.analytics) {
      await saveAnalyticsData(data.analytics);
    }
    
    return { success: true, imported: data };
  } catch (e) {
    return { success: false, error: `Import failed: ${e instanceof Error ? e.message : 'Unknown error'}` };
  }
}

// Analytics storage
const ANALYTICS_DB_NAME = 'blockout-analytics';
const ANALYTICS_STORE = 'analytics';

async function openAnalyticsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(ANALYTICS_DB_NAME, 1);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(ANALYTICS_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveAnalyticsData(analytics: UserAnalytics): Promise<void> {
  const db = await openAnalyticsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ANALYTICS_STORE, 'readwrite');
    tx.objectStore(ANALYTICS_STORE).put(analytics, 'current');
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function getAnalyticsData(): Promise<UserAnalytics> {
  try {
    const db = await openAnalyticsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(ANALYTICS_STORE, 'readonly');
      const req = tx.objectStore(ANALYTICS_STORE).get('current');
      req.onsuccess = () => {
        resolve(req.result ?? createEmptyAnalytics());
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return createEmptyAnalytics();
  }
}

function createEmptyAnalytics(): UserAnalytics {
  return {
    activityLog: [],
    dailyStats: {},
    categoryStats: {},
    blockStats: {},
    totalTasksEverCreated: 0,
    totalTasksEverCompleted: 0,
    totalPomodoroMinutes: 0,
    longestStreak: 0,
    lastActiveAt: Date.now(),
    firstUsedAt: Date.now(),
    totalActiveDays: 0,
  };
}

// Activity tracking — fire-and-forget, non-critical
export function logActivity(
  taskId: string,
  event: TaskActivity['event'],
  metadata?: TaskActivity['metadata']
): void {
  const activity: TaskActivity = {
    taskId,
    event,
    timestamp: Date.now(),
    metadata,
  };

  getAnalyticsData()
    .then((analytics) => {
      const today = new Date().toISOString().slice(0, 10);
      const updated: UserAnalytics = {
        ...analytics,
        activityLog: [...analytics.activityLog, activity],
        lastActiveAt: Date.now(),
        totalActiveDays: analytics.dailyStats[today]
          ? analytics.totalActiveDays
          : analytics.totalActiveDays + 1,
      };
      return saveAnalyticsData(updated);
    })
    .catch(() => {
      // Analytics are non-critical — silently ignore errors
    });
}

// Calculate daily stats for heatmap
export function calculateDailyStats(
  pomodoroSessions: PomodoroSession[],
  tasks: Record<string, { completed: boolean; completedAt?: number; createdAt: number; categoryId: string }>,
  timeBlocks: Record<string, { taskIds: string[] }>
): Record<string, DailyStats> {
  const dailyStats: Record<string, DailyStats> = {};
  
  // Process pomodoro sessions
  pomodoroSessions.forEach(session => {
    const date = new Date(session.startTime).toISOString().slice(0, 10);
    if (!dailyStats[date]) {
      dailyStats[date] = {
        date,
        tasksCompleted: 0,
        tasksCreated: 0,
        pomodoroSessions: 0,
        pomodoroMinutes: 0,
        categoriesWorked: [],
        blocksWorked: [],
      };
    }
    
    dailyStats[date].pomodoroSessions++;
    if (session.mode === 'work') {
      dailyStats[date].pomodoroMinutes += Math.round((session.endTime - session.startTime) / 60000);
    }
  });
  
  // Process task completions
  Object.values(tasks).forEach(task => {
    if (task.completed && task.completedAt) {
      const date = new Date(task.completedAt).toISOString().slice(0, 10);
      if (!dailyStats[date]) {
        dailyStats[date] = {
          date,
          tasksCompleted: 0,
          tasksCreated: 0,
          pomodoroSessions: 0,
          pomodoroMinutes: 0,
          categoriesWorked: [],
          blocksWorked: [],
        };
      }
      dailyStats[date].tasksCompleted++;
      if (!dailyStats[date].categoriesWorked.includes(task.categoryId)) {
        dailyStats[date].categoriesWorked.push(task.categoryId);
      }
    }
    
    // Track creations
    const createdDate = new Date(task.createdAt).toISOString().slice(0, 10);
    if (!dailyStats[createdDate]) {
      dailyStats[createdDate] = {
        date: createdDate,
        tasksCompleted: 0,
        tasksCreated: 0,
        pomodoroSessions: 0,
        pomodoroMinutes: 0,
        categoriesWorked: [],
        blocksWorked: [],
      };
    }
    dailyStats[createdDate].tasksCreated++;
  });
  
  return dailyStats;
}

// Export specific data formats
export function exportCSV(tasks: Record<string, unknown>, type: 'tasks' | 'pomodoro'): string {
  if (type === 'tasks') {
    const headers = ['ID', 'Title', 'Category', 'Completed', 'Completed At', 'Created At', 'Weight', 'Notes'];
    const rows = Object.values(tasks).map((task: any) => [
      task.id,
      task.title,
      task.categoryId,
      task.completed,
      task.completedAt ? new Date(task.completedAt).toISOString() : '',
      new Date(task.createdAt).toISOString(),
      task.weight,
      task.notes || '',
    ]);
    return [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  }
  
  return '';
}
