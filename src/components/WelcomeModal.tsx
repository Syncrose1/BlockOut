import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { clearTutorialData } from '../utils/tutorial';

const WELCOME_MODAL_KEY = 'blockout-welcome-shown';

export function useWelcomeModal() {
  const [isOpen, setIsOpen] = useState(false);
  const [hasSeenModal, setHasSeenModal] = useState(false);

  useEffect(() => {
    const shown = localStorage.getItem(WELCOME_MODAL_KEY);
    if (!shown) {
      // Show after a delay to let the app fully load
      const timer = setTimeout(() => {
        setIsOpen(true);
      }, 2000);
      return () => clearTimeout(timer);
    } else {
      setHasSeenModal(true);
    }
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
          {/* Left side - Screenshot placeholder */}
          <div
            style={{
              width: '50%',
              background: 'var(--bg-tertiary)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 40,
              borderRight: '1px solid var(--border)',
            }}
          >
            <div
              style={{
                width: '100%',
                height: '100%',
                background: 'var(--bg-primary)',
                borderRadius: 'var(--radius-md)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 16,
              }}
            >
              <div
                style={{
                  fontSize: 48,
                  color: 'var(--accent)',
                }}
              >
                <svg
                  width="64"
                  height="64"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                >
                  <rect x="2" y="3" width="20" height="14" rx="2" />
                  <line x1="8" y1="21" x2="16" y2="21" />
                  <line x1="12" y1="17" x2="12" y2="21" />
                </svg>
              </div>
              <div
                style={{
                  color: 'var(--text-secondary)',
                  fontSize: 14,
                  textAlign: 'center',
                }}
              >
                Video tutorial coming soon
              </div>
            </div>
          </div>

          {/* Right side - Welcome content */}
          <div
            style={{
              width: '50%',
              padding: 40,
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
                Welcome to BlockOut
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
                  BlockOut is a visual task manager designed for focused productivity. 
                </p>
                <p style={{ margin: '0 0 12px 0' }}>
                  <strong>Key Features:</strong>
                </p>
                
                <ul
                  style={{
                    margin: 0,
                    paddingLeft: 20,
                    color: 'var(--text-secondary)',
                  }}
                >
                  <li style={{ marginBottom: 8 }}>Visual treemap prioritization</li>
                  <li style={{ marginBottom: 8 }}>Time blocks with countdowns</li>
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
