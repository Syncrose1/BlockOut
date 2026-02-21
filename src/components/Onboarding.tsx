import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

interface TourStep {
  id: string;
  target: string;
  title: string;
  content: string;
  position: 'top' | 'bottom' | 'left' | 'right';
}

const TOUR_STEPS: TourStep[] = [
  {
    id: 'welcome',
    target: '.sidebar',
    title: 'Welcome to BlockOut!',
    content: 'A visual task manager for time-blocked productivity. Let\'s get you started!',
    position: 'right',
  },
  {
    id: 'create-category',
    target: '.sidebar-section:nth-child(3)',
    title: 'Step 1: Create Categories',
    content: 'Categories organize your tasks by type (e.g., "Study", "Clinical", "Personal"). Click "+ New Category" below!',
    position: 'right',
  },
  {
    id: 'create-task',
    target: '.topbar .btn-primary',
    title: 'Step 2: Create Tasks',
    content: 'Click the "+ Task" button to add tasks. Assign them to categories and set importance - larger tiles = more important!',
    position: 'bottom',
  },
  {
    id: 'pool',
    target: '.sidebar-item',
    title: 'The Task Pool',
    content: 'New tasks start here in the Task Pool. Drag them to time blocks to organize them into specific time periods.',
    position: 'right',
  },
  {
    id: 'create-block',
    target: '.sidebar-section-title',
    title: 'Step 3: Time Blocks',
    content: 'Create time blocks for periods like "Exam Season" or "Project Week". Drag tasks from the pool into blocks!',
    position: 'right',
  },
  {
    id: 'treemap',
    target: '.treemap-container',
    title: 'The Treemap',
    content: 'Visualize your tasks! Larger tiles = higher importance. Drag to rearrange, double-click to complete, right-click to edit or delete.',
    position: 'left',
  },
  {
    id: 'taskchain',
    target: '.view-switcher',
    title: 'Task Chains',
    content: 'Click "Task Chain" (the glowing cyan button) to build ordered daily workflows. Create templates, set sequences, and track daily progress!',
    position: 'bottom',
  },
  {
    id: 'pomodoro',
    target: '.pomodoro-widget',
    title: 'Pomodoro Timer',
    content: 'This draggable timer tracks your work sessions. Click it to start/pause, drag it anywhere on screen. Customize durations in settings.',
    position: 'top',
  },
  {
    id: 'sync',
    target: '.topbar',
    title: 'Cloud Sync',
    content: 'Connect Dropbox to sync across devices. Click "Sync" in the top bar to set up. Your data stays private in your own Dropbox!',
    position: 'bottom',
  },
  {
    id: 'export',
    target: '.topbar .btn-ghost',
    title: 'Export & Backup',
    content: 'Export your treemap as PNG or backup all data as JSON. Regular backups recommended!',
    position: 'bottom',
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
      setTimeout(() => setIsOpen(true), 1000);
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
  
  // Calculate position based on target element
  const getPosition = () => {
    const target = document.querySelector(step.target);
    if (!target) return { top: '50%', left: '50%' };
    
    const rect = target.getBoundingClientRect();
    const tooltipWidth = 320;
    const tooltipHeight = 200;
    const padding = 16;

    let top = 0;
    let left = 0;

    switch (step.position) {
      case 'right':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.right + padding;
        break;
      case 'left':
        top = rect.top + rect.height / 2 - tooltipHeight / 2;
        left = rect.left - tooltipWidth - padding;
        break;
      case 'bottom':
        top = rect.bottom + padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
      case 'top':
        top = rect.top - tooltipHeight - padding;
        left = rect.left + rect.width / 2 - tooltipWidth / 2;
        break;
    }

    // Keep on screen
    top = Math.max(10, Math.min(top, window.innerHeight - tooltipHeight - 10));
    left = Math.max(10, Math.min(left, window.innerWidth - tooltipWidth - 10));

    return { top: `${top}px`, left: `${left}px` };
  };

  const position = getPosition();

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
        {/* Spotlight overlay - blocks clicks outside tooltip but doesn't dismiss */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.5)',
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
            ...position,
            width: 320,
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            padding: 20,
            pointerEvents: 'auto',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ marginBottom: 12 }}>
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

          <p style={{ margin: '0 0 20px', fontSize: 14, lineHeight: 1.5 }}>
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
                    padding: '8px 16px',
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
                  padding: '8px 16px',
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
