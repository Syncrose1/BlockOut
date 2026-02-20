export interface PomodoroSession {
  id: string;
  startTime: number;
  endTime: number;
  mode: 'work' | 'break' | 'longBreak';
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

export type ViewMode = 'treemap' | 'timeline' | 'taskchain';

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
}

export interface TaskChain {
  id: string;
  date: string; // YYYY-MM-DD
  links: ChainLink[];
  createdAt: number;
  completedAt?: number;
}

export interface ChainTemplate {
  id: string;
  name: string;
  links: Array<{
    type: 'ct' | 'realtask';
    ctTitle?: string; // For CT: the title
    realTaskPlaceholder?: string; // For realtask: example task name
  }>;
  createdAt: number;
  updatedAt?: number;
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
