import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TourStep {
  id: string;
  title: string;
  content: string;
  getPosition: () => { top: string; left: string };
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    title: 'Welcome to BlockOut!',
    content: 'A visual task manager for time-blocked productivity. Let\'s explore your sample data and get you started!',
    getPosition: () => ({ top: '50%', left: '120px' }), // Center of sidebar
  },
  {
    id: 'categories',
    title: 'Your Categories',
    content: 'Tasks are organized into categories. You have three: Revision (for study topics), ANKI Flashcards (for spaced repetition), and Sign Offs (for clinical skills).',
    getPosition: () => ({ top: '40%', left: '280px' }), // Right of categories, lowered
  },
  {
    id: 'timeblock',
    title: 'Time Block: Exam in 4 weeks',
    content: 'This is your active time block. It contains all your exam preparation tasks with a countdown. Tasks in blocks are visually prioritized on the treemap.',
    getPosition: () => ({ top: '60%', left: '280px' }), // Right of Active Blocks, lowered
  },
  {
    id: 'pool',
    title: 'The Task Pool',
    content: 'All unassigned tasks live here. You can see All Tasks or filter to just Unassigned ones. Drag tasks from here into time blocks to organize them!',
    getPosition: () => ({ top: '45%', left: '280px' }), // Right of Pool section
  },
  {
    id: 'treemap',
    title: 'The Treemap',
    content: 'This is your visual task board! Larger tiles = higher importance (weight). The sample tasks show different sizes based on priority. Double-click to complete, right-click to edit.',
    getPosition: () => ({ top: '50%', left: '60%' }), // Center-left of treemap area
  },
  {
    id: 'taskchain',
    title: 'Task Chains',
    content: 'Click "Task Chain" in the sidebar to build ordered daily workflows. Create templates for your morning routine or study sessions, then track daily progress!',
    getPosition: () => ({ top: '35%', left: '280px' }), // Above the Workflow section
  },
  {
    id: 'create-task',
    title: 'Creating Tasks',
    content: 'Click the "+ Task" button in the top bar to add new tasks. Assign them to categories, add notes, and set importance (weight) to control their size on the treemap.',
    getPosition: () => ({ top: '80px', left: '50%' }), // Below top bar
  },
  {
    id: 'pomodoro',
    title: 'Pomodoro Timer',
    content: 'This draggable timer tracks your work sessions. Click to start/pause, drag it anywhere. Perfect for focused study sessions! Customize durations in settings.',
    getPosition: () => ({ top: '75%', left: '75%' }), // Above the timer
  },
  {
    id: 'sync',
    title: 'Cloud Sync',
    content: 'Connect Dropbox to sync across devices. Your data stays private in your own Dropbox. Click "Sync" in the top bar to set up.',
    getPosition: () => ({ top: '100px', left: '75%' }), // Top right area
  },
  {
    id: 'export',
    title: 'Export & Backup',
    content: 'Export your treemap as PNG or backup all data as JSON. Regular backups are recommended!',
    getPosition: () => ({ top: '80px', left: '85%' }), // Near export button
  },
];

const STORAGE_KEY = 'blockout-onboarding';

export function useOnboarding() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [hasCompleted, setHasCompleted] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      setHasCompleted(parsed.hasCompletedTour || false);
    } else {
      // First time user - show tour after a short delay
      setTimeout(() => setIsOpen(true), 1500);
    }
  }, []);

  const saveProgress = useCallback((completed: boolean) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      hasCompletedTour: completed,
      completedAt: completed ? Date.now() : undefined,
    }));
    setHasCompleted(completed);
  }, []);

  const nextStep = useCallback(() => {
    if (currentStep < TOUR_STEPS.length - 1) {
      setCurrentStep(prev => prev + 1);
    } else {
      setIsOpen(false);
      saveProgress(true);
    }
  }, [currentStep, saveProgress]);

  const prevStep = useCallback(() => {
    if (currentStep > 0) {
      setCurrentStep(prev => prev - 1);
    }
  }, [currentStep]);

  const skipTour = useCallback(() => {
    setIsOpen(false);
    saveProgress(true);
  }, [saveProgress]);

  const restartTour = useCallback(() => {
    setCurrentStep(0);
    setIsOpen(true);
  }, []);

  return {
    isOpen,
    currentStep,
    hasCompleted,
    step: TOUR_STEPS[currentStep],
    totalSteps: TOUR_STEPS.length,
    nextStep,
    prevStep,
    skipTour,
    restartTour,
    setIsOpen,
  };
}

export function OnboardingTour() {
  const tour = useOnboarding();

  if (!tour.isOpen) return null;

  const step = tour.step;
  const position = step.getPosition();

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 1000,
          pointerEvents: 'none',
        }}
      >
        {/* Spotlight overlay */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.6)',
            pointerEvents: 'auto',
          }}
          onClick={(e) => e.stopPropagation()}
        />

        {/* Tooltip */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          style={{
            position: 'absolute',
            top: position.top,
            left: position.left,
            transform: 'translate(-50%, -50%)',
            width: 340,
            maxWidth: '90vw',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            padding: 24,
            pointerEvents: 'auto',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ marginBottom: 16 }}>
            <h3 style={{ margin: 0, fontSize: 18, fontWeight: 600 }}>
              {step.title}
            </h3>
            <div
              style={{
                fontSize: 12,
                color: 'var(--text-tertiary)',
                marginTop: 4,
              }}
            >
              Step {tour.currentStep + 1} of {tour.totalSteps}
            </div>
          </div>

          <p style={{ margin: '0 0 24px', fontSize: 14, lineHeight: 1.6 }}>
            {step.content}
          </p>

          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <button
              onClick={tour.skipTour}
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--text-tertiary)',
                fontSize: 13,
                cursor: 'pointer',
              }}
            >
              Skip tour
            </button>

            <div style={{ display: 'flex', gap: 8 }}>
              {tour.currentStep > 0 && (
                <button
                  onClick={tour.prevStep}
                  style={{
                    padding: '10px 18px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    cursor: 'pointer',
                  }}
                >
                  Back
                </button>
              )}
              <button
                onClick={tour.nextStep}
                style={{
                  padding: '10px 18px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-sm)',
                  color: 'white',
                  fontSize: 13,
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                {tour.currentStep === tour.totalSteps - 1 ? 'Finish' : 'Next'}
              </button>
            </div>
          </div>
        </motion.div>

        {/* Progress dots */}
        <div
          style={{
            position: 'fixed',
            bottom: 30,
            left: '50%',
            transform: 'translateX(-50%)',
            display: 'flex',
            gap: 8,
            pointerEvents: 'auto',
          }}
        >
          {Array.from({ length: tour.totalSteps }).map((_, i) => (
            <div
              key={i}
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background:
                  i === tour.currentStep
                    ? 'var(--accent)'
                    : i < tour.currentStep
                    ? 'var(--text-secondary)'
                    : 'var(--text-tertiary)',
              }}
            />
          ))}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
