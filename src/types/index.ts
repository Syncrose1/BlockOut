export interface PomodoroSession {
  id: string;
  startTime: number;
  endTime: number;
  mode: 'work' | 'break' | 'longBreak' | 'stopwatch' | 'countdown';
  categoryId?: string;
}

export interface Task {
  id: string;
  title: string;
  categoryId: string;
  subcategoryId?: string;
  completed: boolean;
  completedAt?: number;
  weight: number; // effort/size, affects treemap tile size
  notes?: string;
  dueDate?: number;
  createdAt: number;
  dependsOn?: string[]; // task IDs that must be completed before this
  actualDuration?: number; // minutes spent (from completion survey)
}

export interface Subcategory {
  id: string;
  name: string;
  categoryId: string;
}

export interface Category {
  id: string;
  name: string;
  color: string; // auto-assigned
  subcategories: Subcategory[];
}

export interface TimeBlock {
  id: string;
  name: string;
  startDate: number;
  endDate: number;
  taskIds: string[]; // references into the global task pool
  createdAt: number;
}

export type TimerMode = 'pomodoro' | 'stopwatch' | 'countdown';

export interface PomodoroState {
  isRunning: boolean;
  mode: 'work' | 'break' | 'longBreak';
  timerMode: TimerMode;
  timeRemaining: number; // seconds (for countdown) or elapsed (for stopwatch)
  workDuration: number; // seconds
  breakDuration: number; // seconds
  longBreakDuration: number; // seconds
  countdownDuration: number; // seconds (custom countdown time)
  sessionsCompleted: number;
  focusedTaskId?: string;
  focusedCategoryId?: string;
  sessions: PomodoroSession[]; // session history for analytics
  currentSessionStart?: number; // timestamp when current session started
  // Widget position and scale (persisted)
  widgetX?: number;
  widgetY?: number;
  widgetScale?: number;
}

export interface StreakData {
  completionDates: string[]; // ISO date strings (YYYY-MM-DD) of days with completions
  currentStreak: number;
  longestStreak: number;
}

export interface DragState {
  draggedTaskId: string | null;
  draggedTaskIds: string[]; // For multiselect drag operations
  dragOverBlockId: string | null;
  dragOverPool: boolean;
  isDragging: boolean; // True when any drag operation is active
}

export interface SelectionState {
  selectedTaskIds: string[];
  lastSelectedTaskId: string | null; // For SHIFT+click range selection
}

export type ViewMode = 'treemap' | 'timeline' | 'taskchain' | 'overview';

export type PoolViewMode = 'all' | 'unassigned'; // For filtering the task pool

// Task Chain types
export interface ChainTask {
  id: string;
  title: string;
  type: 'ct'; // Chain Task
  completed: boolean;
  completedAt?: number;
  actualDuration?: number; // minutes
  notes?: string; // Optional description/notes
}

export interface ChainLink {
  id: string;
  type: 'ct' | 'realtask' | 'subtask';
  taskId: string;
  expanded?: boolean;
  parentId?: string;
  subType?: 'ct' | 'realtask';
  placeholder?: string;
}

export interface TaskGroup {
  id: string;
  name: string;
  color?: string;
  links: ChainLink[];
  collapsed?: boolean;
}

export interface TaskChain {
  id: string;
  date: string; // YYYY-MM-DD
  links: ChainLink[];
  groups?: TaskGroup[];
  createdAt: number;
}

export interface ChainTemplate {
  id: string;
  name: string;
  links: Array<
    | { type: 'ct'; ctTitle: string }
    | { type: 'realtask'; realTaskPlaceholder: string }
    | { type: 'subtask'; subType: 'ct'; ctTitle: string; parentIndex?: number }
    | { type: 'subtask'; subType: 'realtask'; realTaskPlaceholder: string; parentIndex?: number }
  >;
  groups?: Array<{
    name: string;
    color?: string;
    links: Array<
      | { type: 'ct'; ctTitle: string }
      | { type: 'realtask'; realTaskPlaceholder: string }
      | { type: 'subtask'; subType: 'ct'; ctTitle: string; parentIndex?: number }
      | { type: 'subtask'; subType: 'realtask'; realTaskPlaceholder: string; parentIndex?: number }
    >;
  }>;
  createdAt: number;
  updatedAt?: number;
}

export interface ScheduleBlock {
  id: string;
  title: string;
  description?: string;
  startTime: number; // minutes from midnight (e.g., 480 = 8:00 AM)
  duration: number; // minutes
  color?: string;
  isMilestone?: boolean;
  date: string; // YYYY-MM-DD
}
