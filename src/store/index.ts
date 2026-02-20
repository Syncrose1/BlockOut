import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Task, Category, TimeBlock, PomodoroState, PomodoroSession, ViewMode, StreakData, DragState, TaskChain, ChainTask, ChainTemplate } from '../types';
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
  poolViewMode: 'all' | 'unassigned';
  showNewBlockModal: boolean;
  showNewCategoryModal: boolean;
  showNewTaskModal: boolean;
  editingTaskId: string | null;
  focusMode: boolean;
  completionSurveyTaskId: string | null; // task pending duration survey
  chainTaskCompletionSurveyId: string | null; // CT pending duration survey
  pomodoroSettingsOpen: boolean;

  // Drag and drop
  drag: DragState;

  // Selection
  selectedTaskIds: string[];
  lastSelectedTaskId: string | null;

  // Pomodoro
  pomodoro: PomodoroState;

  // Sync
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  syncSettingsOpen: boolean;
  conflictState: {
    local: Record<string, unknown>;
    remote: Record<string, unknown>;
    // Present when auto-merge succeeded — describes what was combined
    merged?: Record<string, unknown>;
    mergeInfo?: {
      localTasksAdded: number;
      cloudTasksAdded: number;
      completionsFromLocal: number;
      categoriesFromLocal: number;
      blocksFromLocal: number;
    };
  } | null;

  // Task Chains
  taskChains: Record<string, TaskChain>; // key: YYYY-MM-DD
  chainTemplates: Record<string, ChainTemplate>;
  chainTasks: Record<string, ChainTask>; // CTs that exist in chains
  selectedChainDate: string; // YYYY-MM-DD, defaults to today
  showTaskChainModal: boolean;

  // Actions — Categories
  addCategory: (name: string) => string;
  addSubcategory: (categoryId: string, name: string) => void;
  deleteSubcategory: (categoryId: string, subcategoryId: string) => void;
  renameCategory: (id: string, name: string) => void;
  deleteCategory: (id: string) => void;

  // Actions — Tasks
  addTask: (task: Omit<Task, 'id' | 'createdAt' | 'completed' | 'completedAt'>) => string;
  toggleTask: (id: string) => void;
  updateTask: (id: string, updates: Partial<Task>) => void;
  deleteTask: (id: string) => void;
  setTaskActualDuration: (taskId: string, minutes: number | null) => void;

  // Actions — Time Blocks
  addTimeBlock: (block: Omit<TimeBlock, 'id' | 'createdAt' | 'taskIds'>) => string;
  deleteTimeBlock: (id: string) => void;
  renameTimeBlock: (id: string, name: string) => void;
  assignTaskToBlock: (taskId: string, blockId: string) => void;
  removeTaskFromBlock: (taskId: string, blockId: string) => void;
  setActiveBlock: (id: string | null) => void;

  // Actions — UI
  setViewMode: (mode: ViewMode) => void;
  setSelectedCategory: (id: string | null) => void;
  setShowTimelessPool: (show: boolean) => void;
  setPoolViewMode: (mode: 'all' | 'unassigned') => void;
  setShowNewBlockModal: (show: boolean) => void;
  setShowNewCategoryModal: (show: boolean) => void;
  setShowNewTaskModal: (show: boolean) => void;
  setEditingTaskId: (id: string | null) => void;
  setCompletionSurveyTask: (id: string | null) => void;
  setChainTaskCompletionSurveyId: (id: string | null) => void;
  setPomodoroSettingsOpen: (open: boolean) => void;

  // Actions — Focus mode
  enterFocusMode: (categoryId: string) => void;
  exitFocusMode: () => void;

  // Actions — Drag and drop
  setDraggedTask: (taskId: string | null) => void;
  setDraggedTasks: (taskIds: string[]) => void;
  setDragOverBlock: (blockId: string | null) => void;
  setDragOverPool: (over: boolean) => void;
  setIsDragging: (isDragging: boolean) => void;

  // Actions — Selection
  toggleTaskSelection: (taskId: string, isShiftClick?: boolean, isCtrlClick?: boolean) => void;
  selectAllTasksInCategory: (categoryId: string) => void;
  clearTaskSelection: () => void;
  setLastSelectedTask: (taskId: string | null) => void;

  // Actions — Bulk Operations
  bulkMoveTasksToCategory: (taskIds: string[], categoryId: string, subcategoryId?: string) => void;
  bulkDeleteTasks: (taskIds: string[]) => void;
  bulkAssignTasksToBlock: (taskIds: string[], blockId: string) => void;

  // Actions — Pomodoro
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resetPomodoro: () => void;
  tickPomodoro: () => void;
  setPomodoroDurations: (work: number, brk: number, longBrk: number) => void;
  setFocusedTask: (taskId: string | undefined) => void;

  // Actions — Sync
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'error') => void;
  setSyncSettingsOpen: (open: boolean) => void;
  setConflictState: (state: BlockOutState['conflictState']) => void;

  // Actions — Task Chains
  setSelectedChainDate: (date: string) => void;
  setShowTaskChainModal: (show: boolean) => void;
  addChainTask: (chainDate: string, title: string, afterIndex?: number) => void;
  addRealTaskToChain: (chainDate: string, taskId: string, afterIndex?: number) => void;
  removeChainLink: (chainDate: string, index: number) => void;
  reorderChainLink: (chainDate: string, fromIndex: number, toIndex: number) => void;
  completeChainTask: (ctId: string) => void;
  uncompleteChainTask: (ctId: string) => void;
  promoteCTtoTask: (ctId: string, categoryId: string) => string;
  replacePlaceholderWithTask: (chainDate: string, linkIndex: number, taskId: string) => void;
  saveChainAsTemplate: (chainDate: string, name: string) => void;
  loadTemplateAsChain: (templateId: string, date: string) => void;
  updateTemplate: (templateId: string, updates: Partial<ChainTemplate>) => void;
  deleteTemplate: (templateId: string) => void;
  setChainTaskDuration: (ctId: string, minutes: number) => void;
  updateChainTaskTitle: (ctId: string, title: string) => void;
  updateChainTaskNotes: (ctId: string, notes: string) => void;

  // Persistence
  loadData: (data: {
    tasks: Record<string, Task>;
    categories: Record<string, Category>;
    timeBlocks: Record<string, TimeBlock>;
    activeBlockId: string | null;
    streak?: StreakData;
    pomodoroSessions?: PomodoroSession[];
  }) => void;
  getSerializableState: () => {
    tasks: Record<string, Task>;
    categories: Record<string, Category>;
    timeBlocks: Record<string, TimeBlock>;
    activeBlockId: string | null;
    streak: StreakData;
    pomodoroSessions: PomodoroSession[];
  };
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
  poolViewMode: 'all',
  showNewBlockModal: false,
  showNewCategoryModal: false,
  showNewTaskModal: false,
  editingTaskId: null,
  focusMode: false,
  completionSurveyTaskId: null,
  chainTaskCompletionSurveyId: null,
  pomodoroSettingsOpen: false,
  syncStatus: 'idle',
  syncSettingsOpen: false,
  conflictState: null,

  // Task Chains
  taskChains: {},
  chainTemplates: {},
  chainTasks: {},
  selectedChainDate: todayStr(),
  showTaskChainModal: false,

  drag: {
    draggedTaskId: null,
    draggedTaskIds: [],
    dragOverBlockId: null,
    dragOverPool: false,
    isDragging: false,
  },

  selectedTaskIds: [],
  lastSelectedTaskId: null,

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
    sessions: [],
    currentSessionStart: undefined,
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

  deleteSubcategory: (categoryId, subcategoryId) => {
    set((state) => {
      const cat = state.categories[categoryId];
      if (!cat) return state;
      return {
        categories: {
          ...state.categories,
          [categoryId]: {
            ...cat,
            subcategories: cat.subcategories.filter((s) => s.id !== subcategoryId),
          },
        },
        // Clear subcategoryId from tasks that referenced it
        tasks: Object.fromEntries(
          Object.entries(state.tasks).map(([tid, t]) =>
            t.subcategoryId === subcategoryId ? [tid, { ...t, subcategoryId: undefined }] : [tid, t]
          )
        ),
      };
    });
  },

  renameCategory: (id, name) => {
    set((state) => {
      const cat = state.categories[id];
      if (!cat) return state;
      return { categories: { ...state.categories, [id]: { ...cat, name } } };
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

      // Check if dependencies are met before allowing completion
      if (nowCompleted && task.dependsOn && task.dependsOn.length > 0) {
        const allMet = task.dependsOn.every((depId) => state.tasks[depId]?.completed);
        if (!allMet) return state; // block completion if deps unmet
      }

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
        // Trigger completion survey when task is marked done
        completionSurveyTaskId: nowCompleted ? id : state.completionSurveyTaskId,
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
      // Also remove from any tasks' dependsOn arrays
      const cleanedTasks = { ...rest };
      Object.keys(cleanedTasks).forEach((tid) => {
        if (cleanedTasks[tid].dependsOn?.includes(id)) {
          cleanedTasks[tid] = {
            ...cleanedTasks[tid],
            dependsOn: cleanedTasks[tid].dependsOn!.filter((dep) => dep !== id),
          };
        }
      });
      return { tasks: cleanedTasks, timeBlocks };
    });
  },

  setTaskActualDuration: (taskId, minutes) => {
    set((state) => {
      const task = state.tasks[taskId];
      if (!task) return state;
      return {
        tasks: {
          ...state.tasks,
          [taskId]: { ...task, actualDuration: minutes ?? undefined },
        },
        completionSurveyTaskId: null,
      };
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

  renameTimeBlock: (id, name) => {
    set((state) => {
      const block = state.timeBlocks[id];
      if (!block) return state;
      return {
        timeBlocks: {
          ...state.timeBlocks,
          [id]: { ...block, name },
        },
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
  setPoolViewMode: (mode: 'all' | 'unassigned') => set({ poolViewMode: mode }),
  setShowNewBlockModal: (show) => set({ showNewBlockModal: show }),
  setShowNewCategoryModal: (show) => set({ showNewCategoryModal: show }),
  setShowNewTaskModal: (show) => set({ showNewTaskModal: show }),
  setEditingTaskId: (id) => set({ editingTaskId: id }),
  setCompletionSurveyTask: (id) => set({ completionSurveyTaskId: id }),
  setChainTaskCompletionSurveyId: (id) => set({ chainTaskCompletionSurveyId: id }),
  setPomodoroSettingsOpen: (open) => set({ pomodoroSettingsOpen: open }),
  setSyncStatus: (status) => set({ syncStatus: status }),
  setSyncSettingsOpen: (open) => set({ syncSettingsOpen: open }),
  setConflictState: (state) => set({ conflictState: state }),

  // Focus mode
  enterFocusMode: (categoryId) => set((state) => ({
    focusMode: true,
    pomodoro: { ...state.pomodoro, focusedCategoryId: categoryId },
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
  setIsDragging: (isDragging: boolean) => set((state) => ({
    drag: { ...state.drag, isDragging },
  })),
  setDraggedTasks: (taskIds) => set((state) => ({
    drag: { ...state.drag, draggedTaskIds: taskIds },
  })),

  // Selection
  toggleTaskSelection: (taskId, isShiftClick, isCtrlClick) => set((state) => {
    const currentSelection = state.selectedTaskIds;
    const isMultiSelect = isShiftClick || isCtrlClick;
    
    if (isMultiSelect) {
      // Multi-select mode: toggle this task in/out of selection
      const isSelected = currentSelection.includes(taskId);
      let newSelection: string[];
      
      if (isSelected) {
        // Remove from selection
        newSelection = currentSelection.filter(id => id !== taskId);
        
        // Collapse selection if removing would leave only 1 task
        if (newSelection.length === 1) {
          return {
            selectedTaskIds: [],
            lastSelectedTaskId: null,
          };
        }
      } else {
        // Add to selection
        newSelection = [...currentSelection, taskId];
      }
      
      return {
        selectedTaskIds: newSelection,
        lastSelectedTaskId: taskId,
      };
    } else {
      // Single click without modifiers: clear selection (don't select anything)
      return {
        selectedTaskIds: [],
        lastSelectedTaskId: null,
      };
    }
  }),
  
  selectAllTasksInCategory: (categoryId) => set((state) => {
    const categoryTaskIds = Object.entries(state.tasks)
      .filter(([_, task]) => task.categoryId === categoryId)
      .map(([id]) => id);
    
    // Add to existing selection (don't clear)
    const newSelection = [...new Set([...state.selectedTaskIds, ...categoryTaskIds])];
    return {
      selectedTaskIds: newSelection,
    };
  }),
  
  clearTaskSelection: () => set({ selectedTaskIds: [], lastSelectedTaskId: null }),
  
  setLastSelectedTask: (taskId) => set({ lastSelectedTaskId: taskId }),

  // Bulk Operations
  bulkMoveTasksToCategory: (taskIds, categoryId, subcategoryId) => set((state) => {
    const newTasks = { ...state.tasks };
    taskIds.forEach(id => {
      if (newTasks[id]) {
        newTasks[id] = { ...newTasks[id], categoryId, subcategoryId };
      }
    });
    return { tasks: newTasks };
  }),
  
  bulkDeleteTasks: (taskIds) => set((state) => {
    const newTasks = { ...state.tasks };
    const newBlocks = { ...state.timeBlocks };
    
    // Remove tasks from all blocks
    Object.keys(newBlocks).forEach(blockId => {
      newBlocks[blockId] = {
        ...newBlocks[blockId],
        taskIds: newBlocks[blockId].taskIds.filter(id => !taskIds.includes(id))
      };
    });
    
    // Delete tasks
    taskIds.forEach(id => delete newTasks[id]);
    
    return { 
      tasks: newTasks, 
      timeBlocks: newBlocks,
      selectedTaskIds: state.selectedTaskIds.filter(id => !taskIds.includes(id))
    };
  }),
  
  bulkAssignTasksToBlock: (taskIds, blockId) => set((state) => {
    const block = state.timeBlocks[blockId];
    if (!block) return state;
    
    const newBlocks = { ...state.timeBlocks };
    newBlocks[blockId] = {
      ...block,
      taskIds: [...new Set([...block.taskIds, ...taskIds])]
    };
    
    return { timeBlocks: newBlocks };
  }),

  // Pomodoro
  startPomodoro: () => set((state) => ({
    pomodoro: {
      ...state.pomodoro,
      isRunning: true,
      currentSessionStart: state.pomodoro.currentSessionStart ?? Date.now(),
    },
  })),
  pausePomodoro: () => set((state) => ({ pomodoro: { ...state.pomodoro, isRunning: false } })),
  resetPomodoro: () =>
    set((state) => ({
      pomodoro: {
        ...state.pomodoro,
        isRunning: false,
        currentSessionStart: undefined,
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
        // Record the completed session
        const completedSession: PomodoroSession = {
          id: uuid(),
          startTime: p.currentSessionStart ?? (Date.now() - (p.mode === 'work' ? p.workDuration : p.mode === 'break' ? p.breakDuration : p.longBreakDuration) * 1000),
          endTime: Date.now(),
          mode: p.mode,
          categoryId: p.focusedCategoryId,
        };

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
              sessions: [...p.sessions, completedSession],
              currentSessionStart: undefined,
            },
          };
        } else {
          return {
            pomodoro: {
              ...p,
              isRunning: false,
              mode: 'work',
              timeRemaining: p.workDuration,
              sessions: [...p.sessions, completedSession],
              currentSessionStart: undefined,
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
        timeRemaining: state.pomodoro.mode === 'work' ? work
          : state.pomodoro.mode === 'break' ? brk : longBrk,
      },
    })),

  setFocusedTask: (taskId) =>
    set((state) => ({ pomodoro: { ...state.pomodoro, focusedTaskId: taskId } })),

  // Task Chains
  setSelectedChainDate: (date) => set({ selectedChainDate: date }),
  setShowTaskChainModal: (show) => set({ showTaskChainModal: show }),

  addChainTask: (chainDate, title, afterIndex) => set((state) => {
    const ctId = uuid();
    const newCT: ChainTask = { id: ctId, title, type: 'ct', completed: false };
    
    const existingChain = state.taskChains[chainDate];
    const newLink = { id: uuid(), type: 'ct' as const, taskId: ctId };
    
    let newLinks;
    if (existingChain) {
      newLinks = [...existingChain.links];
      if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < newLinks.length) {
        newLinks.splice(afterIndex + 1, 0, newLink);
      } else {
        newLinks.push(newLink);
      }
    } else {
      newLinks = [newLink];
    }
    
    return {
      chainTasks: { ...state.chainTasks, [ctId]: newCT },
      taskChains: {
        ...state.taskChains,
        [chainDate]: {
          id: existingChain?.id || uuid(),
          date: chainDate,
          links: newLinks,
          createdAt: existingChain?.createdAt || Date.now(),
        },
      },
    };
  }),

  addRealTaskToChain: (chainDate, taskId, afterIndex) => set((state) => {
    const existingChain = state.taskChains[chainDate];
    const newLink = { id: uuid(), type: 'realtask' as const, taskId };
    
    let newLinks;
    if (existingChain) {
      newLinks = [...existingChain.links];
      if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < newLinks.length) {
        newLinks.splice(afterIndex + 1, 0, newLink);
      } else {
        newLinks.push(newLink);
      }
    } else {
      newLinks = [newLink];
    }
    
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: {
          id: existingChain?.id || uuid(),
          date: chainDate,
          links: newLinks,
          createdAt: existingChain?.createdAt || Date.now(),
        },
      },
    };
  }),

  removeChainLink: (chainDate, index) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain) return state;
    
    const link = chain.links[index];
    const newLinks = chain.links.filter((_, i) => i !== index);
    
    // If it's a CT, we could optionally delete it from chainTasks, but let's keep it for history
    
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, links: newLinks },
      },
    };
  }),

  reorderChainLink: (chainDate, fromIndex, toIndex) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain) return state;
    
    const links = [...chain.links];
    const [moved] = links.splice(fromIndex, 1);
    links.splice(toIndex, 0, moved);
    
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, links },
      },
    };
  }),

  completeChainTask: (ctId) => set((state) => {
    const ct = state.chainTasks[ctId];
    if (!ct) return state;
    
    return {
      chainTasks: {
        ...state.chainTasks,
        [ctId]: { ...ct, completed: true, completedAt: Date.now() },
      },
    };
  }),

  uncompleteChainTask: (ctId) => set((state) => {
    const ct = state.chainTasks[ctId];
    if (!ct) return state;
    
    const { completedAt, ...rest } = ct;
    return {
      chainTasks: {
        ...state.chainTasks,
        [ctId]: { ...rest, completed: false },
      },
    };
  }),

  promoteCTtoTask: (ctId, categoryId) => {
    const ct = get().chainTasks[ctId];
    if (!ct) return '';
    
    const taskId = get().addTask({
      title: ct.title,
      categoryId,
      weight: 3,
    });
    
    // Update the chain link to point to the real task
    set((state) => {
      const newTaskChains = { ...state.taskChains };
      Object.keys(newTaskChains).forEach((date) => {
        const chain = newTaskChains[date];
        const linkIndex = chain.links.findIndex((l) => l.taskId === ctId && l.type === 'ct');
        if (linkIndex !== -1) {
          chain.links[linkIndex] = { ...chain.links[linkIndex], type: 'realtask' as const, taskId };
        }
      });
      return { taskChains: newTaskChains };
    });
    
    return taskId;
  },

  saveChainAsTemplate: (chainDate, name) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain) return state;
    
    const templateLinks = chain.links.map((link) => {
      if (link.type === 'ct') {
        const ct = state.chainTasks[link.taskId];
        return { type: 'ct' as const, ctTitle: ct?.title || 'Chain Task' };
      } else {
        const task = state.tasks[link.taskId];
        return { type: 'realtask' as const, realTaskPlaceholder: task?.title || 'Insert Real Task' };
      }
    });
    
    const template: ChainTemplate = {
      id: uuid(),
      name,
      links: templateLinks,
      createdAt: Date.now(),
    };
    
    return {
      chainTemplates: { ...state.chainTemplates, [template.id]: template },
    };
  }),

  loadTemplateAsChain: (templateId, date) => set((state) => {
    const template = state.chainTemplates[templateId];
    if (!template) return state;
    
    const newChainTasks: Record<string, ChainTask> = {};
    const newLinks = template.links.map((link) => {
      if (link.type === 'ct') {
        const ctId = uuid();
        newChainTasks[ctId] = { id: ctId, title: link.ctTitle || 'Chain Task', type: 'ct', completed: false };
        return { id: uuid(), type: 'ct' as const, taskId: ctId };
      } else {
        // For real task placeholders, we create an empty slot with placeholder text
        // User will need to fill in the actual task later
        return { 
          id: uuid(), 
          type: 'realtask' as const, 
          taskId: '',
          placeholder: link.realTaskPlaceholder || 'Insert Real Task'
        };
      }
    });
    
    const chain: TaskChain = {
      id: uuid(),
      date,
      links: newLinks,
      createdAt: Date.now(),
    };
    
    return {
      chainTasks: { ...state.chainTasks, ...newChainTasks },
      taskChains: { ...state.taskChains, [date]: chain },
    };
  }),

  updateTemplate: (templateId, updates) => set((state) => {
    const template = state.chainTemplates[templateId];
    if (!template) return state;
    
    return {
      chainTemplates: {
        ...state.chainTemplates,
        [templateId]: { ...template, ...updates, updatedAt: Date.now() },
      },
    };
  }),

  deleteTemplate: (templateId) => set((state) => {
    const { [templateId]: _, ...rest } = state.chainTemplates;
    return { chainTemplates: rest };
  }),

  setChainTaskDuration: (ctId, minutes) => set((state) => {
    const ct = state.chainTasks[ctId];
    if (!ct) return state;
    
    return {
      chainTasks: {
        ...state.chainTasks,
        [ctId]: { ...ct, actualDuration: minutes },
      },
    };
  }),

  updateChainTaskTitle: (ctId, title) => set((state) => {
    const ct = state.chainTasks[ctId];
    if (!ct) return state;
    
    return {
      chainTasks: {
        ...state.chainTasks,
        [ctId]: { ...ct, title },
      },
    };
  }),

  updateChainTaskNotes: (ctId, notes) => set((state) => {
    const ct = state.chainTasks[ctId];
    if (!ct) return state;
    
    return {
      chainTasks: {
        ...state.chainTasks,
        [ctId]: { ...ct, notes },
      },
    };
  }),

  replacePlaceholderWithTask: (chainDate, linkIndex, taskId) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain || !chain.links[linkIndex]) return state;
    
    const newLinks = [...chain.links];
    newLinks[linkIndex] = {
      ...newLinks[linkIndex],
      type: 'realtask' as const,
      taskId,
      placeholder: undefined,
    };
    
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, links: newLinks },
      },
    };
  }),

  // Persistence
  loadData: (data) => {
    const streak = data.streak || { completionDates: [], currentStreak: 0, longestStreak: 0 };
    const { currentStreak, longestStreak } = calcStreak(streak.completionDates);
    set((state) => ({
      tasks: data.tasks,
      categories: data.categories,
      timeBlocks: data.timeBlocks,
      activeBlockId: data.activeBlockId,
      streak: { completionDates: streak.completionDates, currentStreak, longestStreak },
      pomodoro: {
        ...state.pomodoro,
        sessions: data.pomodoroSessions || [],
      },
      // Task chains - load if provided, otherwise keep existing
      ...(data as any).taskChains && { taskChains: (data as any).taskChains },
      ...(data as any).chainTemplates && { chainTemplates: (data as any).chainTemplates },
      ...(data as any).chainTasks && { chainTasks: (data as any).chainTasks },
    }));
  },
  getSerializableState: () => {
    const s = get();
    return {
      tasks: s.tasks,
      categories: s.categories,
      timeBlocks: s.timeBlocks,
      activeBlockId: s.activeBlockId,
      streak: s.streak,
      pomodoroSessions: s.pomodoro.sessions,
      taskChains: s.taskChains,
      chainTemplates: s.chainTemplates,
      chainTasks: s.chainTasks,
    };
  },
}));
