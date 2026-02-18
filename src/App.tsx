import { useEffect } from 'react';
import { useStore } from './store';
import { loadFromServer, debouncedSave } from './utils/persistence';
import { Sidebar } from './components/Sidebar';
import { Topbar } from './components/Topbar';
import { Treemap } from './components/Treemap';
import { Kanban } from './components/Kanban';
import { Timeline } from './components/Timeline';
import { Pomodoro } from './components/Pomodoro';
import {
  NewBlockModal,
  NewCategoryModal,
  NewTaskModal,
  TaskCompletionSurvey,
  PomodoroSettingsModal,
} from './components/Modals';

export function App() {
  const viewMode = useStore((s) => s.viewMode);

  // Load data on mount
  useEffect(() => {
    loadFromServer();
  }, []);

  // Auto-save on any state change
  useEffect(() => {
    const unsub = useStore.subscribe(() => {
      debouncedSave();
    });
    return unsub;
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
      <TaskCompletionSurvey />
      <PomodoroSettingsModal />
    </div>
  );
}
