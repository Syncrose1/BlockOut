/**
 * Co-Focus Presence Sync Hook.
 * Broadcasts anchor-based timer data on events only (play/pause/reset/skip/mode change).
 * Consumers compute live values locally — no per-second presence updates.
 */

import { useEffect, useRef } from 'react';
import { useStore } from '../store';
import { trackPresence } from '../utils/coFocusRealtime';
import { getSpecies } from '../store/synamonSlice';
import { getSynamonMood, getMoodLabel } from '../utils/synamonMath';
import type { CoFocusPresence } from '../types/coFocus';

export function useCoFocusPresence() {
  const activeSessionId = useStore((s) => s.coFocus.activeSessionId);
  const myDisplayName = useStore((s) => s.coFocus.myDisplayName);
  const taskChainSharing = useStore((s) => s.coFocus.taskChainSharing);

  // Timer state — subscribe to all mode-specific running states
  const pomodoroMode = useStore((s) => s.pomodoro.mode);
  const pomodoroIsRunning = useStore((s) => s.pomodoro.isRunning);
  const activeTimerMode = useStore((s) => s.pomodoro.activeTimerMode);
  const sessionsCompleted = useStore((s) => s.pomodoro.sessionsCompleted);
  const timerIsRunning = useStore((s) => s.pomodoro.timer?.isRunning ?? false);
  const stopwatchIsRunning = useStore((s) => s.pomodoro.stopwatch?.isRunning ?? false);
  const timerTimeRemaining = useStore((s) => s.pomodoro.timer?.timeRemaining ?? 0);
  const stopwatchElapsed = useStore((s) => s.pomodoro.stopwatch?.elapsed ?? 0);

  // Synamon state
  const activeUid = useStore((s) => s.synamon.activeUid);
  const collection = useStore((s) => s.synamon.collection);

  // Task chain state
  const selectedChainDate = useStore((s) => s.selectedChainDate);
  const taskChains = useStore((s) => s.taskChains);
  const chainTasks = useStore((s) => s.chainTasks);
  const tasks = useStore((s) => s.tasks);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPresenceRef = useRef<string>('');

  useEffect(() => {
    if (!activeSessionId) return;

    // Build presence payload
    const synamon = activeUid ? collection[activeUid] : undefined;
    const mood = synamon ? getSynamonMood(synamon) : undefined;

    // Task chain steps
    let taskChainSteps: { title: string; completed: boolean }[] | undefined;
    let lastTaskCompletedAt: number | undefined;
    if (taskChainSharing) {
      const chain = taskChains[selectedChainDate];
      if (chain) {
        const links = chain.groups
          ? chain.groups.flatMap(g => g.links)
          : chain.links;
        taskChainSteps = links
          .filter(l => l.type !== 'subtask')
          .slice(0, 8)
          .map(l => {
            if (l.type === 'ct') {
              const ct = chainTasks[l.taskId];
              return { title: ct?.title || '...', completed: ct?.completed || false };
            } else {
              const task = tasks[l.taskId];
              return { title: task?.title || '...', completed: task?.completed || false };
            }
          });
        // Find most recent completed task timestamp
        const completedTasks = links
          .map(l => {
            const t = l.type === 'ct' ? chainTasks[l.taskId] : tasks[l.taskId];
            return t?.completed && t?.completedAt ? new Date(t.completedAt).getTime() : 0;
          })
          .filter(t => t > 0);
        if (completedTasks.length > 0) {
          lastTaskCompletedAt = Math.max(...completedTasks);
        }
      }
    }

    // Compute effective running state based on active timer mode
    const effectiveIsRunning = activeTimerMode === 'timer' ? timerIsRunning
      : activeTimerMode === 'stopwatch' ? stopwatchIsRunning
      : pomodoroIsRunning;

    // Compute anchor value based on active timer mode
    const state = useStore.getState();
    let anchorValue: number;
    if (activeTimerMode === 'stopwatch') {
      anchorValue = state.pomodoro.stopwatch?.elapsed ?? 0;
    } else if (activeTimerMode === 'timer') {
      anchorValue = state.pomodoro.timer?.timeRemaining ?? 0;
    } else {
      anchorValue = state.pomodoro.timeRemaining;
    }

    // Compute total focus time today from sessions
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySessions = state.pomodoro.sessions.filter(s => {
      return new Date(s.startTime).toISOString().slice(0, 10) === todayStr && s.mode === 'work';
    });
    const totalFocusTimeToday = todaySessions.reduce((acc, s) => acc + (s.endTime - s.startTime) / 1000, 0);

    const presence: CoFocusPresence = {
      userId: '', // set by trackPresence
      displayName: myDisplayName,
      timerMode: pomodoroMode,
      anchorValue,
      anchorTimestamp: Date.now(),
      isRunning: effectiveIsRunning,
      activeTimerMode,
      lastTaskCompletedAt,
      taskChainVisible: taskChainSharing,
      taskChainSteps,
      synamonSpeciesId: synamon?.speciesId,
      synamonStage: synamon?.stage,
      synamonMood: mood ? getMoodLabel(mood) : undefined,
      sessionsCompletedToday: sessionsCompleted,
      totalFocusTimeToday: Math.round(totalFocusTimeToday),
    };

    // Debounce: only send if changed
    const key = JSON.stringify(presence);
    if (key === lastPresenceRef.current) return;

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      lastPresenceRef.current = key;
      import('../utils/coFocusSync').then(({ getSupabaseClient }) => {
        const client = getSupabaseClient();
        if (!client) return;
        client.auth.getUser().then(({ data: { user } }) => {
          if (user) trackPresence(user.id, presence);
        });
      });
    }, 1000);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [
    activeSessionId, myDisplayName,
    pomodoroMode, pomodoroIsRunning,
    activeTimerMode, sessionsCompleted,
    timerIsRunning, stopwatchIsRunning,
    timerTimeRemaining, stopwatchElapsed,
    activeUid, collection,
    taskChainSharing, selectedChainDate, taskChains, chainTasks, tasks,
  ]);
}
