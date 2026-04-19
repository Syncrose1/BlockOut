export interface PomodoroSession {
  id: string;
  startTime: number;
  endTime: number;
  mode: 'work' | 'break' | 'longBreak';
  categoryId?: string;
}

// Unified session type for timer and stopwatch modes
export interface TimerSession {
  id: string;
  startTime: number;
  endTime: number;
  timerType: 'timer' | 'stopwatch';
  duration: number; // seconds elapsed
  categoryId?: string;
  label?: string;
  laps?: number[]; // elapsed seconds at each lap (stopwatch only)
}

export type ActiveTimerMode = 'pomodoro' | 'timer' | 'stopwatch';

export interface TimerCountdownState {
  isRunning: boolean;
  timeRemaining: number; // seconds
  duration: number; // set duration in seconds (default 5min)
  currentSessionStart?: number;
  sessions: TimerSession[];
  presets: number[]; // preset durations in seconds
}

export interface StopwatchState {
  isRunning: boolean;
  elapsed: number; // seconds
  currentSessionStart?: number;
  laps: number[]; // elapsed seconds at each lap mark
  sessions: TimerSession[];
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

export interface PomodoroState {
  isRunning: boolean;
  mode: 'work' | 'break' | 'longBreak';
  timeRemaining: number; // seconds
  workDuration: number; // seconds
  breakDuration: number; // seconds
  longBreakDuration: number; // seconds
  sessionsCompleted: number;
  focusedTaskId?: string;
  focusedCategoryId?: string;
  sessions: PomodoroSession[]; // session history for analytics
  currentSessionStart?: number; // timestamp when current session started
  // Widget position and scale (persisted)
  widgetX?: number;
  widgetY?: number;
  widgetScale?: number;
  // Multi-mode support
  activeTimerMode: ActiveTimerMode;
  timer: TimerCountdownState;
  stopwatch: StopwatchState;
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
  taskId: string; // For CT: chain task ID, for realtask: task ID
  placeholder?: string; // For realtask placeholders: example task name
  parentId?: string; // For subtasks: ID of the parent link
  subType?: 'ct' | 'realtask'; // For subtasks: the actual type
  expanded?: boolean; // For parent tasks: whether subtasks are expanded
}

export interface TaskGroup {
  id: string;
  name: string;
  color?: string;      // accent color for the group header
  collapsed?: boolean;
  readonly?: boolean;  // system-managed group (e.g. "Completed Today")
  links: ChainLink[];
}

export interface TaskChain {
  id: string;
  date: string; // YYYY-MM-DD
  links: ChainLink[];
  groups?: TaskGroup[];
  createdAt: number;
  completedAt?: number;
}

export interface ChainTemplate {
  id: string;
  name: string;
  links: Array<{
    type: 'ct' | 'realtask' | 'subtask';
    ctTitle?: string; // For CT: the title
    realTaskPlaceholder?: string; // For realtask: example task name
    parentIndex?: number; // For subtasks: index of parent link
    subType?: 'ct' | 'realtask'; // For subtasks: type of subtask
  }>;
  groups?: Array<{
    name: string;
    color?: string;
    links: Array<{
      type: 'ct' | 'realtask' | 'subtask';
      ctTitle?: string;
      realTaskPlaceholder?: string;
      parentIndex?: number;
      subType?: 'ct' | 'realtask';
    }>;
  }>;
  createdAt: number;
  updatedAt?: number;
}

// Overview Schedule Block types
export type BlockType = 'placeholder' | 'mt' | 'ct';

export interface ScheduleBlock {
  id: string;
  dayIndex: number; // 0 = Monday, 6 = Sunday
  startSlot: number; // 0 = 6:00 AM, 1 = 6:30 AM, etc.
  endSlot: number; // exclusive
  type: BlockType;
  name: string;
  taskId?: string; // For 'mt' type: reference to real task
  color?: string; // For non-MT blocks: custom color
  completed?: boolean; // Whether the block/task is completed
  completedAt?: number; // When it was completed
  actualDuration?: number; // Duration in minutes when completed
  weekDate: string; // YYYY-MM-DD of the Monday of the week this block belongs to
  selectedTaskIds?: string[]; // For placeholder blocks: IDs of selected CTs/MTs
  createdAt: number;
  updatedAt: number;
}

export interface TreemapNode {
  id: string;
  name: string;
  value: number;
  color: string;
  completed: boolean;
  locked?: boolean; // task has unmet dependencies
  children?: TreemapNode[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  depth?: number;
  categoryId?: string;
  subcategoryId?: string;
}
