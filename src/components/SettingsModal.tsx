import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '../store';
import { getTheme, setTheme, type Theme } from '../utils/theme';
import { getSession, isSupabaseConfigured } from '../utils/supabase';
import { TetherEndpoints } from './Tether/TetherEndpoints';

export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [theme, setThemeState] = useState<Theme>(getTheme());
  const synamonEnabled = useStore((s) => s.synamonEnabled);
  const setSynamonEnabled = useStore((s) => s.setSynamonEnabled);
  const setTetherOpen = useStore((s) => s.setTetherOpen);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);

  useEffect(() => {
    if (!open) return;
    if (!isSupabaseConfigured()) { setSignedIn(false); return; }
    getSession().then(({ user }) => setSignedIn(!!user));
  }, [open]);

  if (!open) return null;

  const choose = (t: Theme) => { setTheme(t); setThemeState(t); };

  const themeBtn = (t: Theme, label: React.ReactNode, icon: React.ReactNode) => (
    <button
      onClick={() => choose(t)}
      style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
        padding: '10px 12px', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
        fontSize: 13, fontWeight: 600,
        background: theme === t ? 'var(--accent-subtle)' : 'var(--bg-tertiary)',
        border: `1px solid ${theme === t ? 'var(--accent-border)' : 'var(--border)'}`,
        color: theme === t ? 'var(--accent)' : 'var(--text-secondary)',
      }}
    >
      {icon}{label}
    </button>
  );

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal"
          initial={{ scale: 0.92, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.92, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>Settings</h2>

          {/* Theme */}
          <div className="modal-field">
            <label>Appearance</label>
            <div style={{ display: 'flex', gap: 8 }}>
              {themeBtn('light',
                <span>Light</span>,
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>,
              )}
              {themeBtn('dark',
                <span>Dark</span>,
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>,
              )}
            </div>
          </div>

          {/* Companion */}
          <div className="modal-field" style={{ marginTop: 18 }}>
            <label>Companion</label>
            <label style={{
              display: 'flex', alignItems: 'flex-start', gap: 10,
              padding: '10px 12px', background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)', cursor: 'pointer',
              textTransform: 'none', letterSpacing: 'normal', fontWeight: 400,
            }}>
              <input
                type="checkbox"
                checked={synamonEnabled}
                onChange={(e) => setSynamonEnabled(e.target.checked)}
                style={{ marginTop: 2, flexShrink: 0, cursor: 'pointer', width: 'auto' }}
              />
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
                  Show Synamon companion
                </div>
                <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 2, lineHeight: 1.4 }}>
                  Hide the panel, sidebar button, and adopt prompt if you'd rather use BlockOut without the creature companion. Your data is preserved if you turn it back on.
                </div>
              </div>
            </label>
          </div>

          {/* Tether AI — BYOK model endpoints */}
          <div className="modal-field" style={{ marginTop: 18 }}>
            <label>Tether AI models</label>
            {signedIn === null ? (
              <div style={{ fontSize: 12, color: 'var(--text-tertiary)', padding: '6px 0' }}>Checking…</div>
            ) : signedIn ? (
              <div style={{
                maxHeight: 300, overflowY: 'auto', padding: 12,
                background: 'var(--bg-tertiary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-sm)',
              }}>
                <TetherEndpoints embedded />
              </div>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-tertiary)', lineHeight: 1.5, margin: 0 }}>
                Sign in (Cloud Sync) to connect a bring-your-own-key AI model for Tether. Models are shared across Syncratic apps.
              </p>
            )}
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
              Tether is your Syncratic AI assistant.{' '}
              <button
                onClick={() => { onClose(); setTetherOpen(true); }}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', font: 'inherit', fontSize: 11 }}
              >
                Open Tether →
              </button>
            </p>
          </div>

          {/* Onboarding */}
          <div className="modal-field" style={{ marginTop: 18 }}>
            <label>Onboarding</label>
            <button
              className="btn btn-secondary btn-sm"
              style={{ width: '100%' }}
              onClick={() => { localStorage.removeItem('blockout-onboarding'); window.location.reload(); }}
            >
              Restart tour
            </button>
            <p style={{ fontSize: 11, color: 'var(--text-tertiary)', marginTop: 8, lineHeight: 1.5 }}>
              Replays the welcome walkthrough. Your data is unaffected.
            </p>
          </div>

          <div className="modal-actions">
            <button className="btn btn-primary" onClick={onClose}>Done</button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
