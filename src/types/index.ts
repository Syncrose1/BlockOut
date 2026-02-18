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
}

export type ViewMode = 'treemap' | 'kanban' | 'timeline';

export interface TreemapNode {
  id: string;
  name: string;
  value: number;
  color: string;
  completed: boolean;
  children?: TreemapNode[];
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  depth?: number;
  categoryId?: string;
}
