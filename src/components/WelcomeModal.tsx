import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clearTutorialData } from '../utils/tutorial';

const WELCOME_MODAL_KEY = 'blockout-welcome-shown';
const ONBOARDING_KEY = 'blockout-onboarding';

export function useWelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasSeenModal, setHasSeenModal] = useState(false);

  useEffect(() => {
    const shown = localStorage.getItem(WELCOME_MODAL_KEY);
    if (shown) {
      setHasSeenModal(true);
      return;
    }

    // Check every 500ms if onboarding is complete
    const checkInterval = setInterval(() => {
      const onboardingData = localStorage.getItem(ONBOARDING_KEY);
      if (onboardingData) {
        const parsed = JSON.parse(onboardingData);
        if (parsed.hasCompletedTour) {
          clearInterval(checkInterval);
          setIsOpen(true);
        }
      }
    }, 500);

    // Fallback: show after 30 seconds if tour somehow didn't complete
    const fallbackTimer = setTimeout(() => {
      clearInterval(checkInterval);
      setIsOpen(true);
    }, 30000);

    return () => {
      clearInterval(checkInterval);
      clearTimeout(fallbackTimer);
    };
  }, []);

  const closeModal = (keepData: boolean) => {
    if (!keepData) {
      clearTutorialData();
      // Reload the page to start fresh
      window.location.reload();
      return;
    }
    
    localStorage.setItem(WELCOME_MODAL_KEY, 'true');
    setIsOpen(false);
    setHasSeenModal(true);
  };

  return { isOpen, hasSeenModal, closeModal };
}

export function WelcomeModal() {
  const { isOpen, closeModal } = useWelcomeModal();

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        style={{
          position: 'fixed',
          inset: 0,
          zIndex: 9999,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: 'rgba(0, 0, 0, 0.8)',
          backdropFilter: 'blur(4px)',
        }}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.9, opacity: 0 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          style={{
            width: 800,
            maxWidth: '95vw',
            height: 500,
            maxHeight: '90vh',
            background: 'var(--bg-secondary)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
            overflow: 'hidden',
            display: 'flex',
            boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.5)',
          }}
        >
          {/* Left side - Screenshot */}
          <div
            style={{
              width: '50%',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 32,
              borderRight: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-md)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <img
                src="/examples/BlockOut_screenshot"
                alt="BlockOut Screenshot"
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                }}
              />
            </div>
          </div>

          {/* Right side - Welcome content */}
          <div
            style={{
              width: '50%',
              padding: 40,
              paddingBottom: 48,
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <h2
                style={{
                  margin: '0 0 16px 0',
                  fontSize: 28,
                  fontWeight: 700,
                  color: 'var(--text-primary)',
                }}
              >
                Welcome to BlockOut! 🎊
              </h2>

              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 15,
                  lineHeight: 1.7,
                  marginBottom: 24,
                }}
              >
                <p style={{ margin: '0 0 12px 0' }}>
                  BlockOut is a visual task manager designed for medium-term planning and focused productivity.
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                  <strong>Inspired by:</strong>
                </p>
                
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 20,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <li style={{ marginBottom: 8 }}>Clean WinDirStat-like treemap visualisation</li>
                  <li style={{ marginBottom: 8 }}>Timeblocks with countdowns to focus around goals</li>
                  <li style={{ marginBottom: 8 }}>Visual treemap prioritization</li>
                  <li style={{ marginBottom: 8 }}>Task chains for daily workflows</li>
                  <li style={{ marginBottom: 8 }}>Built-in Pomodoro timer</li>
                  <li>Dropbox sync across devices</li>
                </ul>
              </div>
            </div>

            <div>
              <p
                style={{
                  fontSize: 14,
                  color: 'var(--text-tertiary)',
                  marginBottom: 20,
                  textAlign: 'center',
                }}
              >
                We've loaded sample exam preparation data for you.
              </p>

              <div style={{ display: 'flex', gap: 12 }}>
                <button
                  onClick={() => closeModal(true)}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-md)',
                    color: 'white',
                    fontSize: 15,
                    fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'opacity 0.2s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.opacity = '0.9')}
                  onMouseLeave={(e) => (e.currentTarget.style.opacity = '1')}
                >
                  Keep Sample Data
                </button>

                <button
                  onClick={() => closeModal(false)}
                  style={{
                    flex: 1,
                    padding: '14px 20px',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    color: 'var(--text-secondary)',
                    fontSize: 15,
                    fontWeight: 500,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = 'var(--bg-tertiary)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                  }}
                >
                  Start Fresh
                </button>
              </div>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
