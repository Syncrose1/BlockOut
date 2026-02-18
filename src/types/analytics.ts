import type { PomodoroSession } from './index';

// Extended analytics tracking
export interface TaskActivity {
  taskId: string;
  event: 'created' | 'started' | 'completed' | 'edited' | 'moved' | 'deleted' | 'pomodoro_session';
  timestamp: number;
  metadata?: {
    oldValue?: unknown;
    newValue?: unknown;
    pomodoroDuration?: number;
    fromBlockId?: string;
    toBlockId?: string;
  };
}

export interface DailyStats {
  date: string; // YYYY-MM-DD
  tasksCompleted: number;
  tasksCreated: number;
  pomodoroSessions: number;
  pomodoroMinutes: number;
  categoriesWorked: string[];
  blocksWorked: string[];
}

export interface CategoryStats {
  categoryId: string;
  totalTasks: number;
  completedTasks: number;
  totalTimeSpent: number; // minutes
  pomodoroSessions: number;
  lastWorkedAt?: number;
}

export interface BlockStats {
  blockId: string;
  totalTasks: number;
  completedTasks: number;
  completionRate: number;
  totalTimeSpent: number; // minutes
  pomodoroSessions: number;
  categoryBreakdown: Record<string, number>; // categoryId -> task count
}

export interface UserAnalytics {
  // Activity log - comprehensive event tracking
  activityLog: TaskActivity[];
  
  // Daily aggregated stats for heatmap
  dailyStats: Record<string, DailyStats>;
  
  // Category analytics
  categoryStats: Record<string, CategoryStats>;
  
  // Time block analytics
  blockStats: Record<string, BlockStats>;
  
  // Overall metrics
  totalTasksEverCreated: number;
  totalTasksEverCompleted: number;
  totalPomodoroMinutes: number;
  longestStreak: number;
  mostProductiveDay?: string;
  mostProductiveCategory?: string;
  
  // Time tracking
  lastActiveAt: number;
  firstUsedAt: number;
  totalActiveDays: number;
}

// Export/Import format
export interface BlockOutExport {
  version: string;
  exportedAt: number;
  
  // Core data
  tasks: Record<string, unknown>;
  categories: Record<string, unknown>;
  timeBlocks: Record<string, unknown>;
  activeBlockId: string | null;
  pomodoroSessions: PomodoroSession[];
  streak: {
    completionDates: string[];
    currentStreak: number;
    longestStreak: number;
  };
  
  // Analytics data
  analytics?: UserAnalytics;
  
  // Metadata
  exportType: 'full' | 'tasks_only' | 'analytics_only';
  taskCount: number;
  categoryCount: number;
  blockCount: number;
}

// Onboarding state
export interface OnboardingState {
  hasCompletedTour: boolean;
  currentStep: number;
  dismissedAt?: number;
  completedSteps: string[];
}

// Tour step definition
export interface TourStep {
  id: string;
  target: string; // CSS selector
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
  action?: () => void;
}
