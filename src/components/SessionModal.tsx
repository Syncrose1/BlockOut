import { useState } from 'react';
import { useStore } from '../store';

export function SessionModal() {
  const show = useStore((s) => s.coFocus.showSessionModal);
  const setShowSessionModal = useStore((s) => s.setShowSessionModal);
  const createSession = useStore((s) => s.createSession);
  const joinSession = useStore((s) => s.joinSession);

  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [timerMode, setTimerMode] = useState<'locked' | 'independent'>('locked');
  const [joinCode, setJoinCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!show) return null;

  const handleCreate = async () => {
    setLoading(true);
    setError(null);
    const session = await createSession(timerMode);
    setLoading(false);
    if (!session) {
      setError('Failed to create session');
      return;
    }
    setShowSessionModal(false);
  };

  const handleJoin = async () => {
    if (!joinCode.trim()) return;
    setLoading(true);
    setError(null);
    const result = await joinSession(joinCode.trim());
    setLoading(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setShowSessionModal(false);
  };

  return (
    <>
      <div
        onClick={() => setShowSessionModal(false)}
        style={{
          position: 'fixed', inset: 0,
          background: 'rgba(0,0,0,0.5)',
          backdropFilter: 'blur(4px)',
          zIndex: 10000,
        }}
      />
      <div style={{
        position: 'fixed',
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        width: 380, maxWidth: '90vw',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        zIndex: 10001,
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>
            Co-Focus Session
          </h3>
          <button
            onClick={() => setShowSessionModal(false)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-tertiary)', fontSize: 18,
              cursor: 'pointer', padding: 4,
            }}
          >&times;</button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
          {(['create', 'join'] as const).map(m => (
            <button
              key={m}
              onClick={() => { setMode(m); setError(null); }}
              style={{
                flex: 1, padding: '10px 0',
                background: 'none', border: 'none',
                borderBottom: mode === m ? '2px solid var(--accent)' : '2px solid transparent',
                color: mode === m ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer', textTransform: 'capitalize',
              }}
            >{m === 'create' ? 'Create Session' : 'Join Session'}</button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '20px' }}>
          {mode === 'create' && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 12 }}>
                Timer Mode
              </div>
              <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
                {(['locked', 'independent'] as const).map(m => (
                  <button
                    key={m}
                    onClick={() => setTimerMode(m)}
                    style={{
                      flex: 1, padding: '10px 12px',
                      background: timerMode === m ? 'var(--accent)' : 'var(--bg-tertiary)',
                      border: `1px solid ${timerMode === m ? 'var(--accent)' : 'var(--border)'}`,
                      borderRadius: 'var(--radius-md)',
                      color: timerMode === m ? 'white' : 'var(--text-secondary)',
                      fontSize: 12, fontWeight: 600,
                      cursor: 'pointer',
                      transition: 'all 0.2s',
                    }}
                  >
                    <div>{m === 'locked' ? 'Locked' : 'Independent'}</div>
                    <div style={{
                      fontSize: 10, fontWeight: 400, marginTop: 4,
                      opacity: 0.8,
                    }}>
                      {m === 'locked' ? 'Host controls all timers' : 'Everyone runs their own'}
                    </div>
                  </button>
                ))}
              </div>
              <button
                onClick={handleCreate}
                disabled={loading}
                style={{
                  width: '100%', padding: '12px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading ? 0.6 : 1,
                }}
              >{loading ? 'Creating...' : 'Create Session'}</button>
            </div>
          )}

          {mode === 'join' && (
            <div>
              <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 8 }}>
                Session Invite Code
              </div>
              <input
                value={joinCode}
                onChange={e => setJoinCode(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleJoin()}
                placeholder="Enter invite code..."
                style={{
                  width: '100%', padding: '10px 12px',
                  background: 'var(--bg-tertiary)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius-sm)',
                  color: 'var(--text-primary)',
                  fontSize: 14,
                  outline: 'none',
                  marginBottom: 12,
                  boxSizing: 'border-box',
                }}
              />
              <button
                onClick={handleJoin}
                disabled={loading || !joinCode.trim()}
                style={{
                  width: '100%', padding: '12px',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-md)',
                  color: 'white',
                  fontSize: 14, fontWeight: 600,
                  cursor: loading ? 'wait' : 'pointer',
                  opacity: loading || !joinCode.trim() ? 0.6 : 1,
                }}
              >{loading ? 'Joining...' : 'Join Session'}</button>
            </div>
          )}

          {error && (
            <div style={{
              marginTop: 12, fontSize: 12,
              color: 'hsl(0, 72%, 55%)',
              textAlign: 'center',
            }}>{error}</div>
          )}
        </div>
      </div>
    </>
  );
}
