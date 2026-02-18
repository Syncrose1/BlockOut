import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Task, Category, Subcategory, TimeBlock, PomodoroState, ViewMode } from '../types';
import { getCategoryColor } from '../utils/colors';

interface BlockOutState {
  // Data
  tasks: Record<string, Task>;
  categories: Record<string, Category>;
  timeBlocks: Record<string, TimeBlock>;
  activeBlockId: string | null;

  // UI
  viewMode: ViewMode;
  selectedCategoryId: string | null;
  showTimelessPool: boolean;
  showNewBlockModal: boolean;
  showNewCategoryModal: boolean;
  showNewTaskModal: boolean;
  editingTaskId: string | null;

  // Pomodoro
  pomodoro: PomodoroState;

  // Actions — Categories
  addCategory: (name: string) => string;
  addSubcategory: (categoryId: string, name: string) => void;
  deleteCategory: (id: string) => void;

  // Actions — Tasks
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>) => string;
  toggleTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;

  // Actions — Time Blocks
  addTimeBlock: (block: Omit<TimeBlock, 'id' | 'createdAt' | 'taskIds'>) => string;
  deleteTimeBlock: (id: string) => void;
  assignTaskToBlock: (taskId: string, blockId: string) => void;
  removeTaskFromBlock: (taskId: string, blockId: string) => void;
  setActiveBlock: (id: string | null) => void;

  // Actions — UI
  setViewMode: (mode: ViewMode) => void;
  setSelectedCategory: (id: string | null) => void;
  setShowTimelessPool: (show: boolean) => void;
  setShowNewBlockModal: (show: boolean) => void;
  setShowNewCategoryModal: (show: boolean) => void;
  setShowNewTaskModal: (show: boolean) => void;
  setEditingTaskId: (id: string | null) => void;

  // Actions — Pomodoro
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resetPomodoro: () => void;
  tickPomodoro: () => void;
  setPomodoroDurations: (work: number, brk: number, longBrk: number) => void;
  setFocusedTask: (taskId: string | undefined) => void;

  // Persistence
  loadData: (data: { tasks: Record<string, Task>; categories: Record<string, Category>; timeBlocks: Record<string, TimeBlock>; activeBlockId: string | null }) => void;
  getSerializableState: () => { tasks: Record<string, Task>; categories: Record<string, Category>; timeBlocks: Record<string, TimeBlock>; activeBlockId: string | null };
}

export const useStore = create<BlockOutState>((set, get) => ({
  tasks: {},
  categories: {},
  timeBlocks: {},
  activeBlockId: null,

  viewMode: 'treemap',
  selectedCategoryId: null,
  showTimelessPool: false,
  showNewBlockModal: false,
  showNewCategoryModal: false,
  showNewTaskModal: false,
  editingTaskId: null,

  pomodoro: {
    isRunning: false,
    mode: 'work',
    timeRemaining: 25 * 60,
    workDuration: 25 * 60,
    breakDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    sessionsCompleted: 0,
    focusedTaskId: undefined,
  },

  // Categories
  addCategory: (name) => {
    const id = uuid();
    set((state) => {
      const index = Object.keys(state.categories).length;
      return {
        categories: {
          ...state.categories,
          [id]: {
            id,
            name,
            color: getCategoryColor(index),
            subcategories: [],
          },
        },
      };
    });
    return id;
  },

  addSubcategory: (categoryId, name) => {
    const subId = uuid();
    set((state) => {
      const cat = state.categories[categoryId];
      if (!cat) return state;
      return {
        categories: {
          ...state.categories,
          [categoryId]: {
            ...cat,
            subcategories: [...cat.subcategories, { id: subId, name, categoryId }],
          },
        },
      };
    });
  },

  deleteCategory: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.categories;
      // Remove tasks in this category
      const tasks = { ...state.tasks };
      Object.keys(tasks).forEach((tid) => {
        if (tasks[tid].categoryId === id) delete tasks[tid];
      });
      return { categories: rest, tasks };
    });
  },

  // Tasks
  addTask: (task) => {
    const id = uuid();
    set((state) => ({
      tasks: {
        ...state.tasks,
        [id]: {
          ...task,
          id,
          completed: false,
          createdAt: Date.now(),
          weight: task.weight || 1,
        },
      },
    }));
    return id;
  },

  toggleTask: (id) => {
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            completed: !task.completed,
            completedAt: !task.completed ? Date.now() : undefined,
          },
        },
      };
    });
  },

  updateTask: (id, updates) => {
    set((state) => {
      const task = state.tasks[id];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [id]: { ...task, ...updates },
        },
      };
    });
  },

  deleteTask: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.tasks;
      // Also remove from any time blocks
      const timeBlocks = { ...state.timeBlocks };
      Object.keys(timeBlocks).forEach((bid) => {
        timeBlocks[bid] = {
          ...timeBlocks[bid],
          taskIds: timeBlocks[bid].taskIds.filter((tid) => tid !== id),
        };
      });
      return { tasks: rest, timeBlocks };
    });
  },

  // Time Blocks
  addTimeBlock: (block) => {
    const id = uuid();
    set((state) => ({
      timeBlocks: {
        ...state.timeBlocks,
        [id]: { ...block, id, taskIds: [], createdAt: Date.now() },
      },
      activeBlockId: id,
    }));
    return id;
  },

  deleteTimeBlock: (id) => {
    set((state) => {
      const { [id]: _, ...rest } = state.timeBlocks;
      return {
        timeBlocks: rest,
        activeBlockId: state.activeBlockId === id ? null : state.activeBlockId,
      };
    });
  },

  assignTaskToBlock: (taskId, blockId) => {
    set((state) => {
      const block = state.timeBlocks[blockId];
      if (!block || block.taskIds.includes(taskId)) return state;
      return {
        timeBlocks: {
          ...state.timeBlocks,
          [blockId]: { ...block, taskIds: [...block.taskIds, taskId] },
        },
      };
    });
  },

  removeTaskFromBlock: (taskId, blockId) => {
    set((state) => {
      const block = state.timeBlocks[blockId];
      if (!block) return state;
      return {
        timeBlocks: {
          ...state.timeBlocks,
          [blockId]: { ...block, taskIds: block.taskIds.filter((id) => id !== taskId) },
        },
      };
    });
  },

  setActiveBlock: (id) => set({ activeBlockId: id, showTimelessPool: false }),

  // UI
  setViewMode: (mode) => set({ viewMode: mode }),
  setSelectedCategory: (id) => set({ selectedCategoryId: id }),
  setShowTimelessPool: (show) => set({ showTimelessPool: show, activeBlockId: show ? null : get().activeBlockId }),
  setShowNewBlockModal: (show) => set({ showNewBlockModal: show }),
  setShowNewCategoryModal: (show) => set({ showNewCategoryModal: show }),
  setShowNewTaskModal: (show) => set({ showNewTaskModal: show }),
  setEditingTaskId: (id) => set({ editingTaskId: id }),

  // Pomodoro
  startPomodoro: () => set((state) => ({ pomodoro: { ...state.pomodoro, isRunning: true } })),
  pausePomodoro: () => set((state) => ({ pomodoro: { ...state.pomodoro, isRunning: false } })),
  resetPomodoro: () =>
    set((state) => ({
      pomodoro: {
        ...state.pomodoro,
        isRunning: false,
        timeRemaining: state.pomodoro.mode === 'work'
          ? state.pomodoro.workDuration
          : state.pomodoro.mode === 'break'
          ? state.pomodoro.breakDuration
          : state.pomodoro.longBreakDuration,
      },
    })),
  tickPomodoro: () =>
    set((state) => {
      const p = state.pomodoro;
      if (!p.isRunning) return state;
      const next = p.timeRemaining - 1;
      if (next <= 0) {
        // Timer finished — switch mode
        if (p.mode === 'work') {
          const sessions = p.sessionsCompleted + 1;
          const nextMode = sessions % 4 === 0 ? 'longBreak' : 'break';
          return {
            pomodoro: {
              ...p,
              isRunning: false,
              mode: nextMode,
              timeRemaining: nextMode === 'longBreak' ? p.longBreakDuration : p.breakDuration,
              sessionsCompleted: sessions,
            },
          };
        } else {
          return {
            pomodoro: {
              ...p,
              isRunning: false,
              mode: 'work',
              timeRemaining: p.workDuration,
            },
          };
        }
      }
      return { pomodoro: { ...p, timeRemaining: next } };
    }),

  setPomodoroDurations: (work, brk, longBrk) =>
    set((state) => ({
      pomodoro: {
        ...state.pomodoro,
        workDuration: work,
        breakDuration: brk,
        longBreakDuration: longBrk,
        timeRemaining: work,
      },
    })),

  setFocusedTask: (taskId) =>
    set((state) => ({ pomodoro: { ...state.pomodoro, focusedTaskId: taskId } })),

  // Persistence
  loadData: (data) => set(data),
  getSerializableState: () => {
    const s = get();
    return {
      tasks: s.tasks,
      categories: s.categories,
      timeBlocks: s.timeBlocks,
      activeBlockId: s.activeBlockId,
    };
  },
}));
