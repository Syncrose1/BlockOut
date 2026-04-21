import { useState } from 'react';
import { useStore } from '../store';

export function CoFocusInviteModal() {
  const show = useStore((s) => s.coFocus.showInviteModal);
  const invites = useStore((s) => s.coFocus.pendingInvites);
  const setShowInviteModal = useStore((s) => s.setShowInviteModal);
  const acceptCoFocusInvite = useStore((s) => s.acceptCoFocusInvite);
  const declineCoFocusInvite = useStore((s) => s.declineCoFocusInvite);

  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!show) return null;

  const handleAccept = async (inviteId: string) => {
    setLoading(inviteId);
    setError(null);
    const result = await acceptCoFocusInvite(inviteId);
    setLoading(null);
    if (result.error) {
      setError(result.error);
    }
  };

  const handleDecline = async (inviteId: string) => {
    await declineCoFocusInvite(inviteId);
  };

  return (
    <>
      <div
        onClick={() => setShowInviteModal(false)}
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
        maxHeight: '70vh',
        background: 'var(--bg-secondary)',
        border: '1px solid hsl(45, 90%, 50%)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5), 0 0 20px hsla(45, 90%, 50%, 0.15)',
        zIndex: 10001,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
          background: 'linear-gradient(135deg, hsla(45, 90%, 50%, 0.1), transparent)',
        }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'hsl(45, 90%, 60%)' }}>
            Co-Focus Invitations
          </h3>
          <button
            onClick={() => setShowInviteModal(false)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-tertiary)', fontSize: 18,
              cursor: 'pointer', padding: 4,
            }}
          >&times;</button>
        </div>

        {/* Invite list */}
        <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1 }}>
          {invites.length === 0 && (
            <div style={{
              textAlign: 'center', padding: 24,
              color: 'var(--text-tertiary)', fontSize: 13,
            }}>No pending invitations</div>
          )}
          {invites.map(invite => {
            const isLoading = loading === invite.id;
            const timeDiff = Date.now() - new Date(invite.createdAt).getTime();
            const minutesAgo = Math.floor(timeDiff / 60000);
            const timeStr = minutesAgo < 1 ? 'Just now'
              : minutesAgo < 60 ? `${minutesAgo}m ago`
              : `${Math.floor(minutesAgo / 60)}h ago`;

            return (
              <div key={invite.id} style={{
                padding: '14px 0',
                borderBottom: '1px solid var(--border)',
              }}>
                <div style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  marginBottom: 8,
                }}>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 600 }}>
                      {invite.fromDisplayName}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      {invite.sessionId ? 'Invited you to their session' : 'Wants to co-focus with you'}
                      {' · '}{timeStr}
                    </div>
                  </div>
                </div>
                <div style={{
                  display: 'flex', gap: 8,
                  fontSize: 12, color: 'var(--text-secondary)',
                  marginBottom: 10,
                }}>
                  <span style={{
                    padding: '2px 8px',
                    background: 'var(--bg-tertiary)',
                    borderRadius: 'var(--radius-sm)',
                    fontSize: 10,
                  }}>
                    {invite.timerMode === 'shared' ? 'Shared Timer' : 'Independent'}
                  </span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    onClick={() => handleAccept(invite.id)}
                    disabled={isLoading}
                    style={{
                      flex: 1, padding: '8px 16px',
                      background: 'hsl(45, 90%, 50%)',
                      border: 'none',
                      borderRadius: 'var(--radius-sm)',
                      color: 'hsl(45, 90%, 10%)',
                      fontSize: 13, fontWeight: 700,
                      cursor: isLoading ? 'wait' : 'pointer',
                      opacity: isLoading ? 0.6 : 1,
                    }}
                  >{isLoading ? 'Joining...' : 'Accept'}</button>
                  <button
                    onClick={() => handleDecline(invite.id)}
                    style={{
                      padding: '8px 16px',
                      background: 'var(--bg-tertiary)',
                      border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-sm)',
                      color: 'var(--text-secondary)',
                      fontSize: 13, fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >Decline</button>
                </div>
              </div>
            );
          })}
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
