import { useEffect } from 'react';
import { useStore } from './store';
import { loadData, debouncedSave, startPeriodicCloudSync } from './utils/persistence';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Treemap } from './components/Treemap';
import { Kanban } from './components/Kanban';
import { Timeline } from './components/Timeline';
import { Pomodoro } from './components/Pomodoro';
import { OnboardingTour } from './components/Onboarding';
import {
  NewBlockModal,
  NewCategoryModal,
  NewTaskModal,
  TaskEditModal,
  TaskCompletionSurvey,
  PomodoroSettingsModal,
  SyncSettingsModal,
  ConflictResolutionModal,
} from './components/Modals';

export function App() {
  const viewMode = useStore((s) => s.viewMode);

  // Load data on mount (IndexedDB first, then merge from cloud if configured)
  useEffect(() => {
    loadData();
  }, []);

  // Debounced local save on every state change
  useEffect(() => {
    const unsub = useStore.subscribe(() => {
      debouncedSave();
    });
    return unsub;
  }, []);

  // Periodic cloud push + on-unload push
  useEffect(() => {
    return startPeriodicCloudSync();
  }, []);

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <Topbar />
        {viewMode === 'treemap' && <Treemap />}
        {viewMode === 'kanban' && <Kanban />}
        {viewMode === 'timeline' && <Timeline />}
      </div>
      <Pomodoro />
      <NewBlockModal />
      <NewCategoryModal />
      <NewTaskModal />
      <TaskEditModal />
      <TaskCompletionSurvey />
      <PomodoroSettingsModal />
      <SyncSettingsModal />
      <ConflictResolutionModal />
      <OnboardingTour />
    </div>
  );
}
