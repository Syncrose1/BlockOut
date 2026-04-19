/**
 * Co-Focus Presence Sync Hook.
 * Watches Zustand timer + Synamon state and calls channel.track() on changes.
 * Debounced to ~1s to avoid flooding the realtime channel.
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

  // Timer state
  const pomodoroMode = useStore((s) => s.pomodoro.mode);
  const pomodoroTimeRemaining = useStore((s) => s.pomodoro.timeRemaining);
  const pomodoroIsRunning = useStore((s) => s.pomodoro.isRunning);
  const activeTimerMode = useStore((s) => s.pomodoro.activeTimerMode);
  const sessionsCompleted = useStore((s) => s.pomodoro.sessionsCompleted);

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
    const species = synamon ? getSpecies(synamon.speciesId) : undefined;
    const mood = synamon ? getSynamonMood(synamon) : undefined;

    // Task chain steps
    let taskChainSteps: { title: string; completed: boolean }[] | undefined;
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
      }
    }

    // Compute total focus time today from sessions
    const todayStr = new Date().toISOString().slice(0, 10);
    const todaySessions = useStore.getState().pomodoro.sessions.filter(s => {
      return new Date(s.startTime).toISOString().slice(0, 10) === todayStr && s.mode === 'work';
    });
    const totalFocusTimeToday = todaySessions.reduce((acc, s) => acc + (s.endTime - s.startTime) / 1000, 0);

    const presence: CoFocusPresence = {
      userId: '', // set by trackPresence
      displayName: myDisplayName,
      timerMode: pomodoroMode,
      timeRemaining: pomodoroTimeRemaining,
      isRunning: pomodoroIsRunning,
      activeTimerMode,
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
      const sb = (window as any).__supabase_user_id;
      // Get user ID from Supabase auth
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
    pomodoroMode, pomodoroTimeRemaining, pomodoroIsRunning,
    activeTimerMode, sessionsCompleted,
    activeUid, collection,
    taskChainSharing, selectedChainDate, taskChains, chainTasks, tasks,
  ]);
}
