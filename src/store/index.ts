import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Task, Category, TimeBlock, PomodoroState, ViewMode, StreakData, DragState } from '../types';
import { getCategoryColor } from '../utils/colors';

function todayStr(): string {
  return new Date().toISOString().slice(0, 10);
}

function calcStreak(dates: string[]): { currentStreak: number; longestStreak: number } {
  if (dates.length === 0) return { currentStreak: 0, longestStreak: 0 };
  const sorted = [...new Set(dates)].sort().reverse();
  const today = todayStr();
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);

  let currentStreak = 0;
  if (sorted[0] === today || sorted[0] === yesterday) {
    currentStreak = 1;
    for (let i = 1; i < sorted.length; i++) {
      const prev = new Date(sorted[i - 1]);
      const curr = new Date(sorted[i]);
      const diff = (prev.getTime() - curr.getTime()) / 86400000;
      if (diff === 1) {
        currentStreak++;
      } else {
        break;
      }
    }
  }

  const asc = [...new Set(dates)].sort();
  let longestStreak = asc.length > 0 ? 1 : 0;
  let run = 1;
  for (let i = 1; i < asc.length; i++) {
    const prev = new Date(asc[i - 1]);
    const curr = new Date(asc[i]);
    if ((curr.getTime() - prev.getTime()) / 86400000 === 1) {
      run++;
      longestStreak = Math.max(longestStreak, run);
    } else {
      run = 1;
    }
  }

  return { currentStreak, longestStreak };
}

interface BlockOutState {
  // Data
  tasks: Record<string, Task>;
  categories: Record<string, Category>;
  timeBlocks: Record<string, TimeBlock>;
  activeBlockId: string | null;
  streak: StreakData;

  // UI
  viewMode: ViewMode;
  selectedCategoryId: string | null;
  showTimelessPool: boolean;
  showNewBlockModal: boolean;
  showNewCategoryModal: boolean;
  showNewTaskModal: boolean;
  editingTaskId: string | null;
  focusMode: boolean;

  // Drag and drop
  drag: DragState;

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

  // Actions — Focus mode
  enterFocusMode: (categoryId: string) => void;
  exitFocusMode: () => void;

  // Actions — Drag and drop
  setDraggedTask: (taskId: string | null) => void;
  setDragOverBlock: (blockId: string | null) => void;
  setDragOverPool: (over: boolean) => void;

  // Actions — Pomodoro
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resetPomodoro: () => void;
  tickPomodoro: () => void;
  setPomodoroDurations: (work: number, brk: number, longBrk: number) => void;
  setFocusedTask: (taskId: string | undefined) => void;

  // Persistence
  loadData: (data: { tasks: Record<string, Task>; categories: Record<string, Category>; timeBlocks: Record<string, TimeBlock>; activeBlockId: string | null; streak?: StreakData }) => void;
  getSerializableState: () => { tasks: Record<string, Task>; categories: Record<string, Category>; timeBlocks: Record<string, TimeBlock>; activeBlockId: string | null; streak: StreakData };
}

export const useStore = create<BlockOutState>((set, get) => ({
  tasks: {},
  categories: {},
  timeBlocks: {},
  activeBlockId: null,
  streak: { completionDates: [], currentStreak: 0, longestStreak: 0 },

  viewMode: 'treemap',
  selectedCategoryId: null,
  showTimelessPool: false,
  showNewBlockModal: false,
  showNewCategoryModal: false,
  showNewTaskModal: false,
  editingTaskId: null,
  focusMode: false,

  drag: {
    draggedTaskId: null,
    dragOverBlockId: null,
    dragOverPool: false,
  },

  pomodoro: {
    isRunning: false,
    mode: 'work',
    timeRemaining: 25 * 60,
    workDuration: 25 * 60,
    breakDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    sessionsCompleted: 0,
    focusedTaskId: undefined,
    focusedCategoryId: undefined,
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
      const wasCompleted = task.completed;
      const nowCompleted = !wasCompleted;

      let streak = state.streak;
      if (nowCompleted) {
        const today = todayStr();
        const dates = streak.completionDates.includes(today)
          ? streak.completionDates
          : [...streak.completionDates, today];
        const { currentStreak, longestStreak } = calcStreak(dates);
        streak = { completionDates: dates, currentStreak, longestStreak };
      }

      return {
        tasks: {
          ...state.tasks,
          [id]: {
            ...task,
            completed: nowCompleted,
            completedAt: nowCompleted ? Date.now() : undefined,
          },
        },
        streak,
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

  // Focus mode
  enterFocusMode: (categoryId) => set((state) => ({
    focusMode: true,
    pomodoro: { ...state.pomodoro, focusedCategoryId: categoryId, isRunning: true },
  })),
  exitFocusMode: () => set((state) => ({
    focusMode: false,
    pomodoro: { ...state.pomodoro, focusedCategoryId: undefined },
  })),

  // Drag and drop
  setDraggedTask: (taskId) => set((state) => ({
    drag: { ...state.drag, draggedTaskId: taskId },
  })),
  setDragOverBlock: (blockId) => set((state) => ({
    drag: { ...state.drag, dragOverBlockId: blockId, dragOverPool: false },
  })),
  setDragOverPool: (over) => set((state) => ({
    drag: { ...state.drag, dragOverPool: over, dragOverBlockId: null },
  })),

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
  loadData: (data) => {
    const streak = data.streak || { completionDates: [], currentStreak: 0, longestStreak: 0 };
    const { currentStreak, longestStreak } = calcStreak(streak.completionDates);
    set({
      tasks: data.tasks,
      categories: data.categories,
      timeBlocks: data.timeBlocks,
      activeBlockId: data.activeBlockId,
      streak: { completionDates: streak.completionDates, currentStreak, longestStreak },
    });
  },
  getSerializableState: () => {
    const s = get();
    return {
      tasks: s.tasks,
      categories: s.categories,
      timeBlocks: s.timeBlocks,
      activeBlockId: s.activeBlockId,
      streak: s.streak,
    };
  },
}));
