import { useStore } from '../store';

const TUTORIAL_STORAGE_KEY = 'blockout-tutorial-shown';

export function hasShownTutorial(): boolean {
  return localStorage.getItem(TUTORIAL_STORAGE_KEY) === 'true';
}

export function markTutorialShown(): void {
  localStorage.setItem(TUTORIAL_STORAGE_KEY, 'true');
}

export function loadTutorialData(): void {
  if (hasShownTutorial()) return;

  const store = useStore.getState();
  
  // Calculate dates - 4 weeks from now
  const now = Date.now();
  const fourWeeks = 4 * 7 * 24 * 60 * 60 * 1000;
  const startDate = now;
  const endDate = now + fourWeeks;

  // Add categories and get their IDs
  const revisionId = store.addCategory('Revision');
  const ankiId = store.addCategory('ANKI Flashcards');
  const signoffsId = store.addCategory('Sign Offs');

  // Add tasks using the store's addTask method
  const cardioTaskId = store.addTask({
    title: 'Cardiovascular Pathology',
    categoryId: revisionId,
    notes: 'Study the pathology of cardiovascular diseases including hypertension, coronary artery disease, and heart failure. Focus on clinical presentations and management.',
    weight: 8,
  });

  const respiratoryTaskId = store.addTask({
    title: 'Respiratory Anatomy',
    categoryId: revisionId,
    notes: 'Review respiratory system anatomy including lung lobes, bronchi, alveoli structure, and the mechanics of breathing. Essential for understanding respiratory physiology.',
    weight: 7,
  });

  const neonatalTaskId = store.addTask({
    title: 'Neonatal Physiology',
    categoryId: revisionId,
    notes: 'Understand the physiological adaptations at birth, fetal circulation transition, and common neonatal conditions. Critical for pediatric rotations.',
    weight: 6,
  });

  const ankingCardioId = store.addTask({
    title: 'Anking Cardio',
    categoryId: ankiId,
    notes: 'Complete Anki flashcards for cardiovascular topics. Focus on high-yield cards and pathophysiology. Review daily for spaced repetition.',
    weight: 9,
  });

  const ankingEmergencyId = store.addTask({
    title: 'Anking Emergency Med',
    categoryId: ankiId,
    notes: 'Emergency medicine Anki cards covering ACLS protocols, toxicology, and critical care scenarios. Essential for clinical rotations.',
    weight: 8,
  });

  const venepunctureId = store.addTask({
    title: 'Venepuncture',
    categoryId: signoffsId,
    notes: 'Practice and get signed off on venepuncture technique. Learn proper site selection, needle angles, and patient comfort measures. Required clinical skill.',
    weight: 10,
  });

  const abgId = store.addTask({
    title: 'Arterial Blood Gas',
    categoryId: signoffsId,
    notes: 'Arterial blood gas sampling and interpretation. Learn radial artery puncture technique and ABG analysis including compensation mechanisms.',
    weight: 9,
  });

  const ecgId = store.addTask({
    title: 'ECG Placement and Interpretation',
    categoryId: signoffsId,
    notes: '12-lead ECG electrode placement and basic rhythm interpretation. Practice recognizing common arrhythmias, ischemia, and electrolyte abnormalities.',
    weight: 10,
  });

  // Create time block
  const blockId = store.addTimeBlock({
    name: 'Exam in 4 weeks',
    startDate,
    endDate,
  });

  // Assign tasks to the block
  const taskIds = [
    cardioTaskId,
    respiratoryTaskId,
    neonatalTaskId,
    ankingCardioId,
    ankingEmergencyId,
    venepunctureId,
    abgId,
    ecgId,
  ];
  
  taskIds.forEach(taskId => {
    store.assignTaskToBlock(taskId, blockId);
  });

  // Mark tutorial as shown
  markTutorialShown();
}

export function clearTutorialData(): void {
  localStorage.removeItem(TUTORIAL_STORAGE_KEY);
}
