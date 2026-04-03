import { create } from 'zustand';
import { v4 as uuid } from 'uuid';
import type { Task, Category, TimeBlock, PomodoroState, PomodoroSession, ViewMode, StreakData, DragState, TaskChain, ChainTask, ChainTemplate, ChainLink, TaskGroup, ScheduleBlock } from '../types';
import { getCategoryColor } from '../utils/colors';
// Safe circular dep: analytics.ts uses useStore only inside function bodies,
// so by the time any action below runs, both modules are fully initialized.
import { logActivity } from '../utils/analytics';

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
  completionSurveyTaskId: string | null;
  chainTaskCompletionSurveyId: string | null;
  dependencyBlockedTaskId: string | null;
  pomodoroSettingsOpen: boolean;

  // Drag and drop
  drag: DragState;

  // Selection
  selectedTaskIds: string[];
  lastSelectedTaskId: string | null;

  // Pomodoro state
  pomodoro: PomodoroState;

  // Sync
  syncStatus: 'idle' | 'syncing' | 'synced' | 'error';
  syncSettingsOpen: boolean;
  conflictState: {
    local: Record<string, unknown>;
    remote: Record<string, unknown>;
    merged?: Record<string, unknown>;
    mergeInfo?: {
      localTasksAdded: number;
      cloudTasksAdded: number;
      completionsFromLocal: number;
      categoriesFromLocal: number;
      blocksFromLocal: number;
      overviewBlocksFromLocal: number;
      overviewBlocksUpdatedFromLocal: number;
      overviewBlocksDeleted: number;
    };
  } | null;

  // Task Chains
  taskChains: Record<string, TaskChain>;
  chainTemplates: Record<string, ChainTemplate>;
  chainTasks: Record<string, ChainTask>;
  selectedChainDate: string;
  showTaskChainModal: boolean;

  // Overview blocks
  overviewBlocks: ScheduleBlock[];

  // Pomodoro actions
  startPomodoro: () => void;
  pausePomodoro: () => void;
  resetPomodoro: () => void;
  skipPomodoro: () => void;
  resetAllPomodoro: () => void;
  tickPomodoro: () => void;
  setPomodoroDurations: (work: number, brk: number, longBrk: number) => void;
  setFocusedTask: (taskId: string | undefined) => void;
  setTimerMode: (mode: import('../types').TimerMode) => void;
  setCountdownDuration: (seconds: number) => void;

  // Actions — Sync
  setSyncStatus: (status: 'idle' | 'syncing' | 'synced' | 'error') => void;
  setSyncSettingsOpen: (open: boolean) => void;
  setConflictState: (state: BlockOutState['conflictState']) => void;

  // Actions — Task Chains
  setSelectedChainDate: (date: string) => void;
  setShowTaskChainModal: (show: boolean) => void;
  addChainTask: (chainDate: string, title: string, afterIndex?: number, groupId?: string) => string;
  addRealTaskToChain: (chainDate: string, taskId: string, afterIndex?: number, groupId?: string) => void;
  removeChainLink: (chainDate: string, index: number, groupId?: string) => void;
  reorderChainLink: (chainDate: string, fromIndex: number, toIndex: number, groupId?: string) => void;
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
  
  // Subtask actions
  addSubtaskToChain: (chainDate: string, parentLinkId: string, title: string, subType: 'ct' | 'realtask', taskId?: string) => void;
  removeSubtaskFromChain: (chainDate: string, linkIndex: number) => void;
  toggleSubtaskExpansion: (chainDate: string, linkId: string) => void;

  // Task Group actions
  addTaskGroup: (chainDate: string, name: string, color?: string) => string;
  removeTaskGroup: (chainDate: string, groupId: string) => void;
  renameTaskGroup: (chainDate: string, groupId: string, name: string) => void;
  setTaskGroupColor: (chainDate: string, groupId: string, color: string) => void;
  toggleTaskGroupCollapsed: (chainDate: string, groupId: string) => void;
  migrateChainToGroups: (chainDate: string) => void;

  // Overview blocks actions
  setOverviewBlocks: (blocks: ScheduleBlock[]) => void;

  // Persistence
  loadData: (data: {
    tasks: Record<string, Task>;
    categories: Record<string, Category>;
    timeBlocks: Record<string, TimeBlock>;
    activeBlockId: string | null;
    streak?: StreakData;
    pomodoroSessions?: PomodoroSession[];
    overviewBlocks?: ScheduleBlock[];
  }) => void;
  getSerializableState: () => {
    tasks: Record<string, Task>;
    categories: Record<string, Category>;
    timeBlocks: Record<string, TimeBlock>;
    activeBlockId: string | null;
    streak: StreakData;
    pomodoroSessions: PomodoroSession[];
    overviewBlocks: ScheduleBlock[];
  };
}

export const useStore = create<BlockOutState>((set, get) => ({
  tasks: {},
  categories: {},
  timeBlocks: {},
  activeBlockId: null,
  streak: { completionDates: [], currentStreak: 0, longestStreak: 0 },

  viewMode: (localStorage.getItem('blockout-view-mode') as ViewMode) || 'treemap',
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
  dependencyBlockedTaskId: null,
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

  // Overview blocks
  overviewBlocks: [],
  setOverviewBlocks: (blocks) => set({ overviewBlocks: blocks }),

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
    timerMode: 'pomodoro',
    timeRemaining: 25 * 60,
    workDuration: 25 * 60,
    breakDuration: 5 * 60,
    longBreakDuration: 15 * 60,
    countdownDuration: 25 * 60,
    sessionsCompleted: 0,
    focusedTaskId: undefined,
    focusedCategoryId: undefined,
    sessions: [],
    currentSessionStart: undefined,
    widgetX: 0,
    widgetY: 0,
    widgetScale: 1,
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
    logActivity(id, 'created');
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
        if (!allMet) return { ...state, dependencyBlockedTaskId: id }; // surface block to UI
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
    // Log after set so we read the committed state, not a stale closure.
    const committed = get().tasks[id];
    if (committed) logActivity(id, committed.completed ? 'completed' : 'started');
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
    logActivity(id, 'edited', { newValue: updates });
  },

  deleteTask: (id) => {
    logActivity(id, 'deleted'); // log before set — task won't exist in store after
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
    logActivity(taskId, 'moved', { toBlockId: blockId });
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
  setViewMode: (mode) => {
    localStorage.setItem('blockout-view-mode', mode);
    set({ viewMode: mode });
  },
  setSelectedCategory: (id) => set({ selectedCategoryId: id }),
  setShowTimelessPool: (show) => set({ showTimelessPool: show, activeBlockId: show ? null : get().activeBlockId }),
  setPoolViewMode: (mode: 'all' | 'unassigned') => set({ poolViewMode: mode }),
  setShowNewBlockModal: (show) => set({ showNewBlockModal: show }),
  setShowNewCategoryModal: (show) => set({ showNewCategoryModal: show }),
  setShowNewTaskModal: (show) => set({ showNewTaskModal: show }),
  setEditingTaskId: (id) => set({ editingTaskId: id }),
  setCompletionSurveyTask: (id) => set({ completionSurveyTaskId: id }),
  setChainTaskCompletionSurveyId: (id) => set({ chainTaskCompletionSurveyId: id }),
  setDependencyBlockedTaskId: (id) => set({ dependencyBlockedTaskId: id }),
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
  skipPomodoro: () =>
    set((state) => {
      const p = state.pomodoro;
      // Skip without recording a session
      if (p.mode === 'work') {
        // Always go to short break when skipping (long break is earned by completing 4 sessions)
        return {
          pomodoro: {
            ...p,
            isRunning: false,
            mode: 'break',
            timeRemaining: p.breakDuration,
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
            currentSessionStart: undefined,
          },
        };
      }
    }),
  resetAllPomodoro: () =>
    set((state) => ({
      pomodoro: {
        ...state.pomodoro,
        isRunning: false,
        mode: 'work',
        timeRemaining: state.pomodoro.workDuration,
        sessionsCompleted: 0,
        currentSessionStart: undefined,
        focusedTaskId: undefined,
        focusedCategoryId: undefined,
      },
    })),
  tickPomodoro: () =>
    set((state) => {
      const p = state.pomodoro;
      if (!p.isRunning) return state;

      if (p.timerMode === 'stopwatch') {
        // Stopwatch: increment time
        return { pomodoro: { ...p, timeRemaining: p.timeRemaining + 1 } };
      }

      if (p.timerMode === 'countdown') {
        // Countdown: decrement until 0
        const next = p.timeRemaining - 1;
        if (next <= 0) {
          import('../utils/pomodoroNotifications').then(({ playCompletionSound, sendPomodoroNotification }) => {
            playCompletionSound();
            sendPomodoroNotification('work');
          });

          const completedSession: PomodoroSession = {
            id: uuid(),
            startTime: p.currentSessionStart ?? (Date.now() - p.countdownDuration * 1000),
            endTime: Date.now(),
            mode: 'countdown',
            categoryId: p.focusedCategoryId,
          };

          return {
            pomodoro: {
              ...p,
              isRunning: false,
              timeRemaining: p.countdownDuration,
              sessions: [...p.sessions, completedSession],
              currentSessionStart: undefined,
            },
          };
        }
        return { pomodoro: { ...p, timeRemaining: next } };
      }

      // Pomodoro mode: decrement and handle mode switches
      const next = p.timeRemaining - 1;
      if (next <= 0) {
        import('../utils/pomodoroNotifications').then(({ playCompletionSound, sendPomodoroNotification }) => {
          playCompletionSound();
          const nextMode = p.mode === 'work'
            ? (p.sessionsCompleted + 1) % 4 === 0 ? 'longBreak' : 'break'
            : 'work';
          sendPomodoroNotification(nextMode);
        });

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

  setTimerMode: (mode) =>
    set((state) => ({
      pomodoro: {
        ...state.pomodoro,
        timerMode: mode,
        isRunning: false,
        currentSessionStart: undefined,
        timeRemaining:
          mode === 'pomodoro'
            ? state.pomodoro.workDuration
            : mode === 'countdown'
            ? state.pomodoro.countdownDuration
            : 0,
        mode: mode === 'pomodoro' ? 'work' : 'work',
      },
    })),

  setCountdownDuration: (seconds) =>
    set((state) => ({
      pomodoro: {
        ...state.pomodoro,
        countdownDuration: seconds,
        timeRemaining:
          state.pomodoro.timerMode === 'countdown' && !state.pomodoro.isRunning
            ? seconds
            : state.pomodoro.timeRemaining,
      },
    })),

  // Task Chains
  setSelectedChainDate: (date) => set({ selectedChainDate: date }),
  setShowTaskChainModal: (show) => set({ showTaskChainModal: show }),

  addChainTask: (chainDate, title, afterIndex, groupId) => {
    const ctId = uuid();
    set((state) => {
      const newCT: ChainTask = { id: ctId, title, type: 'ct', completed: false };

      const existingChain = state.taskChains[chainDate];
      const newLink: ChainLink = { id: uuid(), type: 'ct' as const, taskId: ctId };

      if (groupId && existingChain?.groups) {
        // Operate on the group's links
        const newGroups = existingChain.groups.map((g) => {
          if (g.id !== groupId) return g;
          const groupLinks = [...g.links];
          if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < groupLinks.length) {
            let insertIndex = afterIndex + 1;
            const parentLinkId = groupLinks[afterIndex]?.id;
            while (insertIndex < groupLinks.length && groupLinks[insertIndex].parentId === parentLinkId) {
              insertIndex++;
            }
            groupLinks.splice(insertIndex, 0, newLink);
          } else {
            groupLinks.push(newLink);
          }
          return { ...g, links: groupLinks };
        });
        return {
          chainTasks: { ...state.chainTasks, [ctId]: newCT },
          taskChains: {
            ...state.taskChains,
            [chainDate]: { ...existingChain, groups: newGroups },
          },
        };
      }

      let newLinks;
      if (existingChain) {
        newLinks = [...existingChain.links];
        if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < newLinks.length) {
          // Find the actual index in the raw links array and skip past any subtasks
          let insertIndex = afterIndex + 1;
          const parentLinkId = newLinks[afterIndex]?.id;

          // Skip all subtasks that belong to this parent
          while (insertIndex < newLinks.length && newLinks[insertIndex].parentId === parentLinkId) {
            insertIndex++;
          }

          newLinks.splice(insertIndex, 0, newLink);
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
    });
    return ctId;
  },

  addRealTaskToChain: (chainDate, taskId, afterIndex, groupId) => set((state) => {
    const existingChain = state.taskChains[chainDate];
    const newLink: ChainLink = { id: uuid(), type: 'realtask' as const, taskId };

    if (groupId && existingChain?.groups) {
      const newGroups = existingChain.groups.map((g) => {
        if (g.id !== groupId) return g;
        const groupLinks = [...g.links];
        if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < groupLinks.length) {
          let insertIndex = afterIndex + 1;
          const parentLinkId = groupLinks[afterIndex]?.id;
          while (insertIndex < groupLinks.length && groupLinks[insertIndex].parentId === parentLinkId) {
            insertIndex++;
          }
          groupLinks.splice(insertIndex, 0, newLink);
        } else {
          groupLinks.push(newLink);
        }
        return { ...g, links: groupLinks };
      });
      return {
        taskChains: {
          ...state.taskChains,
          [chainDate]: { ...existingChain, groups: newGroups },
        },
      };
    }

    let newLinks;
    if (existingChain) {
      newLinks = [...existingChain.links];
      if (afterIndex !== undefined && afterIndex >= 0 && afterIndex < newLinks.length) {
        // Find the actual index in the raw links array and skip past any subtasks
        let insertIndex = afterIndex + 1;
        const parentLinkId = newLinks[afterIndex]?.id;

        // Skip all subtasks that belong to this parent
        while (insertIndex < newLinks.length && newLinks[insertIndex].parentId === parentLinkId) {
          insertIndex++;
        }

        newLinks.splice(insertIndex, 0, newLink);
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

  removeChainLink: (chainDate, index, groupId) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain) return state;

    if (groupId && chain.groups) {
      const newGroups = chain.groups.map((g) => {
        if (g.id !== groupId) return g;
        return { ...g, links: g.links.filter((_, i) => i !== index) };
      });
      return {
        taskChains: {
          ...state.taskChains,
          [chainDate]: { ...chain, groups: newGroups },
        },
      };
    }

    const newLinks = chain.links.filter((_, i) => i !== index);

    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, links: newLinks },
      },
    };
  }),

  reorderChainLink: (chainDate, fromIndex, toIndex, groupId) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain) return state;

    if (groupId && chain.groups) {
      const newGroups = chain.groups.map((g) => {
        if (g.id !== groupId) return g;
        const links = [...g.links];
        const [moved] = links.splice(fromIndex, 1);
        links.splice(toIndex, 0, moved);
        return { ...g, links };
      });
      return {
        taskChains: {
          ...state.taskChains,
          [chainDate]: { ...chain, groups: newGroups },
        },
      };
    }

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
    
    // Build a map of link IDs to their index for parent lookup
    const linkIdToIndex = new Map(chain.links.map((link, index) => [link.id, index]));
    
    const templateLinks = chain.links.map((link) => {
      if (link.type === 'subtask') {
        // For subtasks, store parent index and subtype info
        const parentIndex = link.parentId ? linkIdToIndex.get(link.parentId) : undefined;
        const parentLink = link.parentId ? chain.links.find(l => l.id === link.parentId) : null;
        
        if (link.subType === 'ct') {
          const ct = state.chainTasks[link.taskId];
          return { 
            type: 'subtask' as const, 
            subType: 'ct' as const,
            ctTitle: ct?.title || 'Subtask',
            parentIndex 
          };
        } else {
          const task = state.tasks[link.taskId];
          return { 
            type: 'subtask' as const, 
            subType: 'realtask' as const,
            realTaskPlaceholder: task?.title || 'Insert Real Task',
            parentIndex 
          };
        }
      } else if (link.type === 'ct') {
        const ct = state.chainTasks[link.taskId];
        return { type: 'ct' as const, ctTitle: ct?.title || 'Chain Task' };
      } else {
        const task = state.tasks[link.taskId];
        return { type: 'realtask' as const, realTaskPlaceholder: task?.title || 'Insert Real Task' };
      }
    });
    
    const templateGroups = chain.groups ? chain.groups.map(group => {
      const groupLinkIdToIndex = new Map(group.links.map((link, i) => [link.id, i]));
      return {
        name: group.name,
        color: group.color,
        links: group.links.map(link => {
          if (link.type === 'subtask') {
            const parentIndex = link.parentId ? groupLinkIdToIndex.get(link.parentId) : undefined;
            if (link.subType === 'ct') {
              const ct = state.chainTasks[link.taskId];
              return { type: 'subtask' as const, subType: 'ct' as const, ctTitle: ct?.title || 'Subtask', parentIndex };
            } else {
              const task = state.tasks[link.taskId];
              return { type: 'subtask' as const, subType: 'realtask' as const, realTaskPlaceholder: task?.title || 'Insert Real Task', parentIndex };
            }
          } else if (link.type === 'ct') {
            const ct = state.chainTasks[link.taskId];
            return { type: 'ct' as const, ctTitle: ct?.title || 'Chain Task' };
          } else {
            const task = state.tasks[link.taskId];
            return { type: 'realtask' as const, realTaskPlaceholder: task?.title || 'Insert Real Task' };
          }
        }),
      };
    }) : undefined;

    const template: ChainTemplate = {
      id: uuid(),
      name,
      links: templateLinks,
      groups: templateGroups,
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
    const parentIdMap: Record<number, string> = {}; // Map template link index to new link ID
    
    // First pass: create all links and track parent IDs
    const newLinks = template.links.map((link, index) => {
      const newLinkId = uuid();
      
      if (link.type === 'ct') {
        const ctId = uuid();
        newChainTasks[ctId] = { id: ctId, title: link.ctTitle || 'Chain Task', type: 'ct', completed: false };
        const linkObj = { id: newLinkId, type: 'ct' as const, taskId: ctId };
        parentIdMap[index] = newLinkId;
        return linkObj;
      } else if (link.type === 'realtask') {
        // For real task placeholders, we create an empty slot with placeholder text
        const linkObj = { 
          id: newLinkId, 
          type: 'realtask' as const, 
          taskId: '',
          placeholder: link.realTaskPlaceholder || 'Insert Real Task'
        };
        parentIdMap[index] = newLinkId;
        return linkObj;
      } else if (link.type === 'subtask') {
        // Subtask - find its parent
        const parentTemplateIndex = link.parentIndex;
        const parentId = parentTemplateIndex !== undefined ? parentIdMap[parentTemplateIndex] : undefined;
        
        if (link.subType === 'ct') {
          const ctId = uuid();
          newChainTasks[ctId] = { id: ctId, title: link.ctTitle || 'Subtask', type: 'ct', completed: false };
          return { 
            id: newLinkId, 
            type: 'subtask' as const, 
            taskId: ctId,
            parentId,
            subType: 'ct' as const
          };
        } else {
          // Real task placeholder subtask
          return { 
            id: newLinkId, 
            type: 'subtask' as const, 
            taskId: '',
            parentId,
            subType: 'realtask' as const,
            placeholder: link.realTaskPlaceholder || 'Insert Real Task'
          };
        }
      }
      
      return { id: newLinkId, type: 'ct' as const, taskId: '' };
    });
    
    let newGroups: TaskGroup[] | undefined;
    if (template.groups) {
      newGroups = template.groups.map(groupTemplate => {
        const groupParentIdMap: Record<number, string> = {};
        const groupLinks = groupTemplate.links.map((link, index) => {
          const newLinkId = uuid();
          if (link.type === 'ct') {
            const ctId = uuid();
            newChainTasks[ctId] = { id: ctId, title: link.ctTitle || 'Chain Task', type: 'ct', completed: false };
            const linkObj = { id: newLinkId, type: 'ct' as const, taskId: ctId };
            groupParentIdMap[index] = newLinkId;
            return linkObj;
          } else if (link.type === 'realtask') {
            const linkObj = { id: newLinkId, type: 'realtask' as const, taskId: '', placeholder: link.realTaskPlaceholder || 'Insert Real Task' };
            groupParentIdMap[index] = newLinkId;
            return linkObj;
          } else if (link.type === 'subtask') {
            const parentTemplateIndex = link.parentIndex;
            const parentId = parentTemplateIndex !== undefined ? groupParentIdMap[parentTemplateIndex] : undefined;
            if (link.subType === 'ct') {
              const ctId = uuid();
              newChainTasks[ctId] = { id: ctId, title: link.ctTitle || 'Subtask', type: 'ct', completed: false };
              return { id: newLinkId, type: 'subtask' as const, taskId: ctId, parentId, subType: 'ct' as const };
            } else {
              return { id: newLinkId, type: 'subtask' as const, taskId: '', parentId, subType: 'realtask' as const, placeholder: link.realTaskPlaceholder || 'Insert Real Task' };
            }
          }
          return { id: newLinkId, type: 'ct' as const, taskId: '' };
        });
        return {
          id: uuid(),
          name: groupTemplate.name,
          color: groupTemplate.color,
          links: groupLinks,
        };
      });
    }

    const chain: TaskChain = {
      id: uuid(),
      date,
      links: newGroups ? [] : newLinks,
      groups: newGroups,
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

  // Subtask actions
  addSubtaskToChain: (chainDate, parentLinkId, title, subType, taskId) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain) return state;
    
    const parentIndex = chain.links.findIndex(l => l.id === parentLinkId);
    if (parentIndex === -1) return state;
    
    let newLink: { id: string; type: 'subtask'; taskId: string; parentId: string; subType: 'ct' | 'realtask' };
    let subtaskId = '';
    
    if (subType === 'ct') {
      subtaskId = uuid();
      newLink = {
        id: uuid(),
        type: 'subtask' as const,
        taskId: subtaskId,
        parentId: parentLinkId,
        subType,
      };
    } else {
      newLink = {
        id: uuid(),
        type: 'subtask' as const,
        taskId: taskId!,
        parentId: parentLinkId,
        subType,
      };
    }
    
    const newLinks = [...chain.links];
    newLinks.splice(parentIndex + 1, 0, newLink);
    
    const updates: Partial<BlockOutState> = {
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, links: newLinks },
      },
    };
    
    if (subType === 'ct' && subtaskId) {
      updates.chainTasks = {
        ...state.chainTasks,
        [subtaskId]: {
          id: subtaskId,
          title,
          type: 'ct',
          completed: false,
        },
      };
    }
    
    return { ...state, ...updates };
  }),

  removeSubtaskFromChain: (chainDate, linkIndex) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain || !chain.links[linkIndex]) return state;
    
    const link = chain.links[linkIndex];
    
    // Collect all indices to remove (this subtask and any nested subtasks)
    const indicesToRemove: number[] = [linkIndex];
    const parentIds = new Set([link.id]);
    
    for (let i = linkIndex + 1; i < chain.links.length; i++) {
      if (parentIds.has(chain.links[i].parentId || '')) {
        indicesToRemove.push(i);
        parentIds.add(chain.links[i].id);
      } else {
        break;
      }
    }
    
    // Build new links array
    const newLinks = chain.links.filter((_, i) => !indicesToRemove.includes(i));
    
    // Collect chain task IDs to delete
    const chainTaskIdsToDelete = indicesToRemove
      .filter(i => chain.links[i].type === 'ct' || chain.links[i].type === 'subtask')
      .map(i => chain.links[i].taskId);
    
    const { ...remainingChainTasks } = state.chainTasks;
    chainTaskIdsToDelete.forEach(id => delete remainingChainTasks[id]);
    
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, links: newLinks },
      },
      chainTasks: remainingChainTasks,
    };
  }),

  toggleSubtaskExpansion: (chainDate, linkId) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain) return state;
    
    const linkIndex = chain.links.findIndex(l => l.id === linkId);
    if (linkIndex === -1) return state;
    
    const newLinks = [...chain.links];
    const link = newLinks[linkIndex];
    
    // Toggle expansion by showing/hiding child subtasks
    const isExpanded = !link.expanded;
    newLinks[linkIndex] = { ...link, expanded: isExpanded };
    
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, links: newLinks },
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

  // Task Group actions
  addTaskGroup: (chainDate, name, color) => {
    const groupId = uuid();
    set((state) => {
      const existingChain = state.taskChains[chainDate];
      const newGroup: TaskGroup = { id: groupId, name, color, links: [] };
      const groups = existingChain?.groups ? [...existingChain.groups, newGroup] : [newGroup];
      return {
        taskChains: {
          ...state.taskChains,
          [chainDate]: {
            id: existingChain?.id || uuid(),
            date: chainDate,
            links: existingChain?.links || [],
            groups,
            createdAt: existingChain?.createdAt || Date.now(),
          },
        },
      };
    });
    return groupId;
  },

  removeTaskGroup: (chainDate, groupId) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain?.groups) return state;
    const group = chain.groups.find(g => g.id === groupId);
    const ctIdsToDelete = group?.links
      .filter(l => l.type === 'ct')
      .map(l => l.taskId) || [];
    const newChainTasks = { ...state.chainTasks };
    ctIdsToDelete.forEach(id => { delete newChainTasks[id]; });
    return {
      chainTasks: newChainTasks,
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, groups: chain.groups.filter(g => g.id !== groupId) },
      },
    };
  }),

  renameTaskGroup: (chainDate, groupId, name) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain?.groups) return state;
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: {
          ...chain,
          groups: chain.groups.map(g => g.id === groupId ? { ...g, name } : g),
        },
      },
    };
  }),

  setTaskGroupColor: (chainDate, groupId, color) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain?.groups) return state;
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: {
          ...chain,
          groups: chain.groups.map(g => g.id === groupId ? { ...g, color } : g),
        },
      },
    };
  }),

  toggleTaskGroupCollapsed: (chainDate, groupId) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain?.groups) return state;
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: {
          ...chain,
          groups: chain.groups.map(g => g.id === groupId ? { ...g, collapsed: !g.collapsed } : g),
        },
      },
    };
  }),

  migrateChainToGroups: (chainDate) => set((state) => {
    const chain = state.taskChains[chainDate];
    if (!chain || chain.groups) return state; // already has groups or no chain
    const defaultGroup: TaskGroup = {
      id: uuid(),
      name: 'Default',
      links: chain.links || [],
    };
    return {
      taskChains: {
        ...state.taskChains,
        [chainDate]: { ...chain, groups: [defaultGroup], links: [] },
      },
    };
  }),

  // Persistence
  loadData: (data) => {
    const streak = data.streak || { completionDates: [], currentStreak: 0, longestStreak: 0 };
    const { currentStreak, longestStreak } = calcStreak(streak.completionDates);
    const pomodoroData = (data as any).pomodoro;
    set((state) => ({
      tasks: data.tasks,
      categories: data.categories,
      timeBlocks: data.timeBlocks,
      activeBlockId: data.activeBlockId,
      streak: { completionDates: streak.completionDates, currentStreak, longestStreak },
      pomodoro: {
        ...state.pomodoro,
        sessions: data.pomodoroSessions || [],
        // Restore pomodoro timer state if available
        ...(pomodoroData && {
          isRunning: pomodoroData.isRunning ?? false,
          mode: pomodoroData.mode ?? 'work',
          timerMode: pomodoroData.timerMode ?? 'pomodoro',
          timeRemaining: pomodoroData.timeRemaining ?? 25 * 60,
          workDuration: pomodoroData.workDuration ?? 25 * 60,
          breakDuration: pomodoroData.breakDuration ?? 5 * 60,
          longBreakDuration: pomodoroData.longBreakDuration ?? 15 * 60,
          countdownDuration: pomodoroData.countdownDuration ?? 25 * 60,
          sessionsCompleted: pomodoroData.sessionsCompleted ?? 0,
          focusedTaskId: pomodoroData.focusedTaskId,
          focusedCategoryId: pomodoroData.focusedCategoryId,
          widgetX: pomodoroData.widgetX ?? 0,
          widgetY: pomodoroData.widgetY ?? 0,
          widgetScale: pomodoroData.widgetScale ?? 1,
        }),
      },
      // Task chains - load if provided, otherwise keep existing
      ...(data as any).taskChains && { taskChains: (data as any).taskChains },
      ...(data as any).chainTemplates && { chainTemplates: (data as any).chainTemplates },
      ...(data as any).chainTasks && { chainTasks: (data as any).chainTasks },
      // Overview blocks - load if provided, otherwise keep existing
      ...(data as any).overviewBlocks !== undefined && { overviewBlocks: (data as any).overviewBlocks },
      // Track lastModified for cloud sync
      lastModified: (data as any).lastModified || Date.now(),
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
      pomodoro: {
        isRunning: s.pomodoro.isRunning,
        mode: s.pomodoro.mode,
        timerMode: s.pomodoro.timerMode,
        timeRemaining: s.pomodoro.timeRemaining,
        workDuration: s.pomodoro.workDuration,
        breakDuration: s.pomodoro.breakDuration,
        longBreakDuration: s.pomodoro.longBreakDuration,
        countdownDuration: s.pomodoro.countdownDuration,
        sessionsCompleted: s.pomodoro.sessionsCompleted,
        focusedTaskId: s.pomodoro.focusedTaskId,
        focusedCategoryId: s.pomodoro.focusedCategoryId,
        widgetX: s.pomodoro.widgetX,
        widgetY: s.pomodoro.widgetY,
        widgetScale: s.pomodoro.widgetScale,
      },
      taskChains: s.taskChains,
      chainTemplates: s.chainTemplates,
      chainTasks: s.chainTasks,
      overviewBlocks: s.overviewBlocks,
      lastModified: s.lastModified || Date.now(),
    };
  },
}));
