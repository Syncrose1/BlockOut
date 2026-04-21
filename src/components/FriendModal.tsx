import { useState, useEffect } from 'react';
import { useStore } from '../store';

export function FriendModal() {
  const show = useStore((s) => s.coFocus.showFriendModal);
  const friends = useStore((s) => s.coFocus.friends);
  const friendsLoaded = useStore((s) => s.coFocus.friendsLoaded);
  const friendOnlineStatus = useStore((s) => s.coFocus.friendOnlineStatus);
  const myInviteCode = useStore((s) => s.coFocus.myInviteCode);
  const activeSessionId = useStore((s) => s.coFocus.activeSessionId);
  const setShowFriendModal = useStore((s) => s.setShowFriendModal);
  const loadFriends = useStore((s) => s.loadFriends);
  const sendFriendRequest = useStore((s) => s.sendFriendRequest);
  const acceptFriendRequest = useStore((s) => s.acceptFriendRequest);
  const rejectFriendRequest = useStore((s) => s.rejectFriendRequest);
  const removeFriend = useStore((s) => s.removeFriend);
  const refreshFriendOnlineStatus = useStore((s) => s.refreshFriendOnlineStatus);
  const sendCoFocusInvite = useStore((s) => s.sendCoFocusInvite);

  const [tab, setTab] = useState<'add' | 'requests' | 'friends'>('friends');
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [inviteSent, setInviteSent] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (show && !friendsLoaded) loadFriends();
  }, [show]);

  // Refresh online status when modal opens and periodically
  useEffect(() => {
    if (!show || !friendsLoaded) return;
    refreshFriendOnlineStatus();
    const interval = setInterval(refreshFriendOnlineStatus, 30000);
    return () => clearInterval(interval);
  }, [show, friendsLoaded]);

  if (!show) return null;

  const accepted = friends.filter(f => f.status === 'accepted');
  const incoming = friends.filter(f => f.status === 'pending' && f.direction === 'incoming');
  const outgoing = friends.filter(f => f.status === 'pending' && f.direction === 'outgoing');

  const handleSend = async () => {
    if (!input.trim()) return;
    setSending(true);
    setFeedback(null);
    const result = await sendFriendRequest(input.trim());
    setSending(false);
    if (result.error) {
      setFeedback(result.error);
    } else {
      setFeedback('Request sent!');
      setInput('');
    }
  };

  const handleCopyCode = () => {
    if (myInviteCode) {
      navigator.clipboard.writeText(myInviteCode);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleInvite = async (friendUserId: string) => {
    setInviteSent(prev => ({ ...prev, [friendUserId]: true }));
    await sendCoFocusInvite(friendUserId);
    setTimeout(() => {
      setInviteSent(prev => ({ ...prev, [friendUserId]: false }));
    }, 3000);
  };

  return (
    <>
      <div
        onClick={() => setShowFriendModal(false)}
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
        width: 420, maxWidth: '90vw',
        maxHeight: '80vh',
        background: 'var(--bg-secondary)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
        zIndex: 10001,
        display: 'flex', flexDirection: 'column',
        overflow: 'hidden',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          padding: '16px 20px',
          borderBottom: '1px solid var(--border)',
        }}>
          <h3 style={{ margin: 0, fontSize: 16, color: 'var(--text-primary)' }}>Friends</h3>
          <button
            onClick={() => setShowFriendModal(false)}
            style={{
              background: 'none', border: 'none',
              color: 'var(--text-tertiary)', fontSize: 18,
              cursor: 'pointer', padding: 4,
            }}
          >&times;</button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', borderBottom: '1px solid var(--border)',
        }}>
          {(['friends', 'requests', 'add'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '10px 0',
                background: 'none', border: 'none',
                borderBottom: tab === t ? '2px solid var(--accent)' : '2px solid transparent',
                color: tab === t ? 'var(--accent)' : 'var(--text-secondary)',
                fontSize: 13, fontWeight: 600,
                cursor: 'pointer',
                textTransform: 'capitalize',
              }}
            >
              {t === 'requests' ? `Requests${incoming.length ? ` (${incoming.length})` : ''}` : t === 'add' ? 'Add Friend' : `Friends (${accepted.length})`}
            </button>
          ))}
        </div>

        {/* Content */}
        <div style={{ padding: '16px 20px', overflow: 'auto', flex: 1 }}>
          {tab === 'add' && (
            <div>
              {/* My invite code */}
              {myInviteCode && (
                <div style={{ marginBottom: 16 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                    My invite code
                  </div>
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                  }}>
                    <code style={{
                      flex: 1, padding: '8px 12px',
                      background: 'var(--bg-tertiary)',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 14, fontWeight: 600,
                      color: 'var(--accent)',
                      letterSpacing: 1,
                    }}>{myInviteCode}</code>
                    <button
                      onClick={handleCopyCode}
                      style={{
                        padding: '8px 12px',
                        background: copied ? 'hsl(142, 72%, 45%)' : 'var(--bg-tertiary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: copied ? 'white' : 'var(--text-secondary)',
                        fontSize: 12, fontWeight: 600,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >{copied ? 'Copied' : 'Copy'}</button>
                  </div>
                </div>
              )}

              {/* Add by email or code */}
              <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 4 }}>
                Add by email or invite code
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSend()}
                  placeholder="Email or invite code..."
                  style={{
                    flex: 1, padding: '8px 12px',
                    background: 'var(--bg-tertiary)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-sm)',
                    color: 'var(--text-primary)',
                    fontSize: 13,
                    outline: 'none',
                  }}
                />
                <button
                  onClick={handleSend}
                  disabled={sending || !input.trim()}
                  style={{
                    padding: '8px 16px',
                    background: 'var(--accent)',
                    border: 'none',
                    borderRadius: 'var(--radius-sm)',
                    color: 'white',
                    fontSize: 13, fontWeight: 600,
                    cursor: sending ? 'wait' : 'pointer',
                    opacity: sending || !input.trim() ? 0.5 : 1,
                  }}
                >{sending ? '...' : 'Send'}</button>
              </div>
              {feedback && (
                <div style={{
                  marginTop: 8, fontSize: 12,
                  color: feedback.includes('sent') ? 'hsl(142, 72%, 50%)' : 'hsl(0, 72%, 55%)',
                }}>{feedback}</div>
              )}
            </div>
          )}

          {tab === 'requests' && (
            <div>
              {incoming.length === 0 && outgoing.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: 24,
                  color: 'var(--text-tertiary)', fontSize: 13,
                }}>No pending requests</div>
              )}
              {incoming.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {f.displayName || 'Unknown user'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Wants to be your friend
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      onClick={() => acceptFriendRequest(f.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'hsl(142, 72%, 45%)',
                        border: 'none', borderRadius: 'var(--radius-sm)',
                        color: 'white', fontSize: 12, fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >Accept</button>
                    <button
                      onClick={() => rejectFriendRequest(f.id)}
                      style={{
                        padding: '6px 12px',
                        background: 'var(--bg-tertiary)',
                        border: '1px solid var(--border)',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--text-secondary)', fontSize: 12,
                        cursor: 'pointer',
                      }}
                    >Decline</button>
                  </div>
                </div>
              ))}
              {outgoing.map(f => (
                <div key={f.id} style={{
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  padding: '10px 0',
                  borderBottom: '1px solid var(--border)',
                }}>
                  <div>
                    <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                      {f.displayName || 'Unknown user'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)' }}>
                      Pending...
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {tab === 'friends' && (
            <div>
              {accepted.length === 0 && (
                <div style={{
                  textAlign: 'center', padding: 24,
                  color: 'var(--text-tertiary)', fontSize: 13,
                }}>
                  No friends yet. Add someone to get started!
                </div>
              )}
              {accepted.map(f => {
                const isOnline = friendOnlineStatus[f.userId] ?? false;
                const alreadyInvited = inviteSent[f.userId] ?? false;
                return (
                  <div key={f.id} style={{
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                    padding: '10px 0',
                    borderBottom: '1px solid var(--border)',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {/* Online status dot */}
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%',
                        background: isOnline ? 'hsl(142, 72%, 50%)' : 'var(--text-tertiary)',
                        opacity: isOnline ? 1 : 0.3,
                        flexShrink: 0,
                      }} />
                      <div>
                        <div style={{ fontSize: 14, color: 'var(--text-primary)', fontWeight: 500 }}>
                          {f.displayName || 'Unknown user'}
                        </div>
                        <div style={{ fontSize: 10, color: isOnline ? 'hsl(142, 72%, 50%)' : 'var(--text-tertiary)' }}>
                          {isOnline ? 'Online' : 'Offline'}
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 6 }}>
                      {/* Co-Focus invite button (only for online friends) */}
                      {isOnline && (
                        <button
                          onClick={() => handleInvite(f.userId)}
                          disabled={alreadyInvited}
                          style={{
                            padding: '6px 10px',
                            background: alreadyInvited ? 'hsl(142, 72%, 45%)' : 'hsl(45, 90%, 50%)',
                            border: 'none',
                            borderRadius: 'var(--radius-sm)',
                            color: alreadyInvited ? 'white' : 'hsl(45, 90%, 10%)',
                            fontSize: 11, fontWeight: 600,
                            cursor: alreadyInvited ? 'default' : 'pointer',
                            opacity: alreadyInvited ? 0.8 : 1,
                          }}
                        >{alreadyInvited ? 'Sent!' : 'Co-Focus'}</button>
                      )}
                      <button
                        onClick={() => removeFriend(f.userId)}
                        style={{
                          padding: '6px 12px',
                          background: 'var(--bg-tertiary)',
                          border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-sm)',
                          color: 'hsl(0, 60%, 55%)',
                          fontSize: 11, cursor: 'pointer',
                        }}
                      >Remove</button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
