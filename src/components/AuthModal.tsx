import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { signIn, signUp, resetPassword, isSupabaseConfigured } from '../utils/supabase';
import { useIsMobile } from '../hooks/useIsMobile';
import type { User } from '@supabase/supabase-js';

interface AuthModalProps {
  open: boolean;
  onClose: () => void;
  onAuthSuccess: (user: User) => void;
}

export function AuthModal({ open, onClose, onAuthSuccess }: AuthModalProps) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<'signin' | 'signup' | 'reset'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  if (!open || !isSupabaseConfigured()) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    setLoading(true);

    try {
      if (mode === 'reset') {
        const result = await resetPassword(email);
        if (result.error) {
          setError(result.error);
        } else {
          setMessage('Password reset email sent. Check your inbox.');
        }
        return;
      }

      if (mode === 'signup') {
        if (password !== confirmPassword) {
          setError('Passwords do not match');
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters');
          return;
        }
      }

      const result = mode === 'signin'
        ? await signIn(email, password)
        : await signUp(email, password);

      if (result.error) {
        setError(result.error);
      } else if (result.user) {
        if (mode === 'signup') {
          setMessage('Account created! Check your email to confirm, then sign in.');
          setMode('signin');
        } else {
          onAuthSuccess(result.user);
          onClose();
        }
      }
    } finally {
      setLoading(false);
    }
  };

  const switchMode = (newMode: 'signin' | 'signup' | 'reset') => {
    setMode(newMode);
    setError(null);
    setMessage(null);
  };

  const modalAnimation = isMobile
    ? { initial: { y: '100%', opacity: 0 }, animate: { y: 0, opacity: 1 }, exit: { y: '100%', opacity: 0 } }
    : { initial: { scale: 0.92, opacity: 0, y: 20 }, animate: { scale: 1, opacity: 1, y: 0 }, exit: { scale: 0.92, opacity: 0, y: 20 } };

  return (
    <AnimatePresence>
      <motion.div
        className="modal-overlay"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={onClose}
      >
        <motion.div
          className="modal"
          {...modalAnimation}
          transition={{ type: 'spring', damping: 28, stiffness: 380 }}
          onClick={(e) => e.stopPropagation()}
        >
          <h2>
            {mode === 'signin' && 'Sign In'}
            {mode === 'signup' && 'Create Account'}
            {mode === 'reset' && 'Reset Password'}
          </h2>

          <div style={{ fontSize: 12, color: 'var(--text-secondary)', marginBottom: 18 }}>
            {mode === 'signin' && 'Sign in to sync your data across devices via BlockOut Cloud.'}
            {mode === 'signup' && 'Create an account to enable cloud sync with R2 storage.'}
            {mode === 'reset' && 'Enter your email to receive a password reset link.'}
          </div>

          {error && (
            <div style={{
              padding: '8px 12px',
              background: 'hsla(0, 72%, 62%, 0.1)',
              border: '1px solid hsla(0, 72%, 62%, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: 'hsl(0, 72%, 62%)',
              fontSize: 12,
              marginBottom: 14,
            }}>
              {error}
            </div>
          )}

          {message && (
            <div style={{
              padding: '12px 16px',
              background: 'hsla(140, 60%, 50%, 0.1)',
              border: '1px solid hsla(140, 60%, 50%, 0.3)',
              borderRadius: 'var(--radius-sm)',
              color: 'hsl(140, 60%, 50%)',
              fontSize: 14,
              fontWeight: 500,
              marginBottom: 14,
              display: 'flex',
              alignItems: 'flex-start',
              gap: 10,
            }}>
              <span style={{ fontSize: 20, lineHeight: 1 }}>✉</span>
              <span>{message}</span>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="modal-field">
              <label>Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                required
                autoFocus={!isMobile}
                autoComplete="email"
              />
            </div>

            {mode !== 'reset' && (
              <div className="modal-field">
                <label>Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                />
              </div>
            )}

            {mode === 'signup' && (
              <div className="modal-field">
                <label>Confirm Password</label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  autoComplete="new-password"
                />
              </div>
            )}

            <div className="modal-actions" style={{ flexDirection: 'column', gap: 10 }}>
              <button
                type="submit"
                className="btn btn-primary btn-full"
                disabled={loading}
              >
                {loading ? 'Please wait...' : (
                  mode === 'signin' ? 'Sign In' :
                  mode === 'signup' ? 'Create Account' :
                  'Send Reset Email'
                )}
              </button>
            </div>
          </form>

          {/* Mode switcher links */}
          <div style={{ marginTop: 16, textAlign: 'center', color: 'var(--text-tertiary)', display: 'flex', flexWrap: 'wrap', justifyContent: 'center', gap: 4 }}>
            {mode === 'signin' && (
              <>
                <button
                  className="modal-mode-btn"
                  onClick={() => switchMode('signup')}
                  style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '10px 6px' }}
                >
                  Create an account
                </button>
                <span style={{ alignSelf: 'center' }}>|</span>
                <button
                  className="modal-mode-btn"
                  onClick={() => switchMode('reset')}
                  style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '10px 6px' }}
                >
                  Forgot password?
                </button>
              </>
            )}
            {mode === 'signup' && (
              <button
                className="modal-mode-btn"
                onClick={() => switchMode('signin')}
                style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '10px 6px' }}
              >
                Already have an account? Sign in
              </button>
            )}
            {mode === 'reset' && (
              <button
                className="modal-mode-btn"
                onClick={() => switchMode('signin')}
                style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13, padding: '10px 6px' }}
              >
                Back to sign in
              </button>
            )}
          </div>

          <button
            className="modal-close-btn"
            onClick={onClose}
            style={{
              position: 'absolute', top: 8, right: 8,
              background: 'none', border: 'none', color: 'var(--text-tertiary)',
              fontSize: 20, cursor: 'pointer', lineHeight: 1,
            }}
          >
            &times;
          </button>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
