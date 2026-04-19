import { useState, useRef, useEffect } from 'react';
import { useStore } from '../store';

export function CoFocusChat() {
  const chatMessages = useStore((s) => s.coFocus.chatMessages);
  const sendChatMessage = useStore((s) => s.sendChatMessage);

  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [chatMessages.length]);

  const handleSend = () => {
    if (!input.trim()) return;
    sendChatMessage(input.trim());
    setInput('');
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column',
      height: '100%',
    }}>
      {/* Messages */}
      <div
        ref={scrollRef}
        style={{
          flex: 1, overflow: 'auto',
          padding: '8px 12px',
        }}
      >
        {chatMessages.length === 0 && (
          <div style={{
            textAlign: 'center',
            padding: 16,
            color: 'var(--text-tertiary)',
            fontSize: 12,
          }}>No messages yet</div>
        )}
        {chatMessages.map(msg => (
          <div key={msg.id} style={{
            marginBottom: 6,
            fontSize: 12,
          }}>
            {msg.isSystem ? (
              <div style={{
                textAlign: 'center',
                color: 'var(--text-tertiary)',
                fontStyle: 'italic',
                fontSize: 11,
              }}>{msg.content}</div>
            ) : (
              <>
                <span style={{
                  fontWeight: 600,
                  color: 'var(--accent)',
                  marginRight: 6,
                }}>{msg.displayName}</span>
                <span style={{ color: 'var(--text-primary)' }}>
                  {msg.content}
                </span>
                <span style={{
                  fontSize: 9, color: 'var(--text-tertiary)',
                  marginLeft: 6,
                }}>
                  {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Input */}
      <div style={{
        padding: '8px 12px',
        borderTop: '1px solid var(--border)',
        display: 'flex', gap: 8,
      }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value.slice(0, 500))}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="Type a message..."
          style={{
            flex: 1, padding: '8px 10px',
            background: 'var(--bg-tertiary)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-sm)',
            color: 'var(--text-primary)',
            fontSize: 12,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={!input.trim()}
          style={{
            padding: '8px 14px',
            background: 'var(--accent)',
            border: 'none',
            borderRadius: 'var(--radius-sm)',
            color: 'white',
            fontSize: 12, fontWeight: 600,
            cursor: !input.trim() ? 'default' : 'pointer',
            opacity: !input.trim() ? 0.4 : 1,
          }}
        >Send</button>
      </div>
    </div>
  );
}
