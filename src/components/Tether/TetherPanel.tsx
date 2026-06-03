// Tether — the Syncratic AI assistant panel. Floating card, gated on signed-in →
// has a model endpoint → chat. Streams the agent (reads, staged writes with
// tickbox approval, typed-gated deletes, guide actions), persists conversations
// to localStorage, and manages BYOK model endpoints.

import { useState, useEffect, useRef, useCallback } from 'react';
import { useStore } from '../../store';
import { getSession, onAuthStateChange } from '../../utils/supabase';
import {
  streamTether, listEndpoints, refreshTetherStatus,
  type TetherMessage, type TetherEvent,
} from '../../utils/tether';
import { TetherLight } from './TetherLight';
import { TetherFace } from './TetherFace';
import { TetherEndpoints } from './TetherEndpoints';
import { TetherMarkdown } from './TetherMarkdown';
import { AnimatePresence, motion } from 'framer-motion';
import {
  applyStagedActions, isImmediate, isDestructive, resolveDeleteTargets, requiredDeletePhrase,
  type StagedAction, type ApplyResult,
} from '../../utils/tetherApply';
import {
  type ChatMsg, type TetherConversation,
  newConversationId, listConversations, getActiveId, setActiveId,
  saveConversation, loadConversation, deleteConversation,
} from '../../utils/tetherConversations';

// Border wave-pulse keyframes (injected once). A soft blue-purple glow that blooms
// out from the panel edge: it grows in spread + blur as it pushes outward, holding
// presence through the middle of its travel before dissolving far out — a soft
// wave of force, not a thin line. Two staggered layers give a continuous swell.
if (typeof document !== 'undefined' && !document.getElementById('tether-pulse-kf')) {
  const el = document.createElement('style');
  el.id = 'tether-pulse-kf';
  el.textContent = `
    .tether-glow { animation: tether-glow 3.2s ease-out infinite; }
    .tether-glow.g2 { animation-delay: 1.6s; }
    @keyframes tether-glow {
      0%   { box-shadow: 0 0 0 0 hsla(250,84%,62%,0); }
      26%  { box-shadow: 0 0 20px 4px hsla(250,84%,62%,0.32); }
      60%  { box-shadow: 0 0 36px 16px hsla(250,84%,62%,0.20); }
      100% { box-shadow: 0 0 54px 30px hsla(250,84%,62%,0); }
    }
    @media (prefers-reduced-motion: reduce) { .tether-glow { animation: none !important; box-shadow: none !important; } }
  `;
  document.head.appendChild(el);
}

type Gate = 'loading' | 'signed-out' | 'no-endpoint' | 'ready';

// Vague, friendly activity labels so raw tool names never leak into the UI.
// `recall` is deliberately opaque ("Organising thoughts") — never reveal the
// topic — so it reads as the agent thinking, not a feature loading.
const TOOL_LABELS: Record<string, string> = {
  recall: 'Organising thoughts',
  list_tasks: 'Reading your tasks',
  list_categories: 'Reviewing categories',
  list_time_blocks: 'Reading time blocks',
  get_task_chains: 'Checking your chains',
  list_chain_templates: 'Reading templates',
  get_week_overview: 'Checking your schedule',
  get_app_status: 'Checking your setup',
  list_binder_wiki: 'Searching your Binder wiki',
  read_binder_wiki: 'Reading your Binder wiki',
};
function toolLabel(name: string): string {
  if (TOOL_LABELS[name]) return TOOL_LABELS[name];
  if (name.startsWith('propose_')) return 'Preparing changes';
  if (name.startsWith('set_') || name === 'switch_view' || name === 'open_sync_settings') return 'Adjusting your settings';
  return 'Working';
}
function toolLabels(names: string[]): string[] {
  return [...new Set(names.map(toolLabel))];
}

export function TetherPanel() {
  const open = useStore((s) => s.tetherOpen);
  const setOpen = useStore((s) => s.setTetherOpen);
  const setTetherStatus = useStore((s) => s.setTetherStatus);

  const [gate, setGate] = useState<Gate>('loading');
  const [convoId, setConvoId] = useState<string>(() => getActiveId() || newConversationId());
  const [conversations, setConversations] = useState<TetherConversation[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [streamText, setStreamText] = useState('');
  const [activeTools, setActiveTools] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  // Staged proposals awaiting approval (batch + per-item tickboxes).
  const [pending, setPending] = useState<StagedAction[]>([]);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [applyResults, setApplyResults] = useState<ApplyResult[] | null>(null);
  // Destructive actions are handled one at a time via a typed-confirmation modal —
  // never bundled into "apply all".
  const [deleteQueue, setDeleteQueue] = useState<StagedAction[]>([]);
  const [showModels, setShowModels] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  // ── Auth + endpoint gating ──
  const refreshGate = useCallback(async () => {
    const { user } = await getSession();
    if (!user) { setGate('signed-out'); setTetherStatus('unconfigured'); return; }
    const eps = await listEndpoints();
    const ready = eps.length > 0;
    setGate(ready ? 'ready' : 'no-endpoint');
    // Opening the panel acknowledges any error; sync the light to real state.
    if (useStore.getState().tetherStatus !== 'working') setTetherStatus(ready ? 'ready' : 'unconfigured');
  }, [setTetherStatus]);

  // Keep the light current even when the panel is never opened.
  useEffect(() => { refreshTetherStatus(); }, []);
  useEffect(() => { if (open) refreshGate(); else setShowModels(false); }, [open, refreshGate]);
  useEffect(() => {
    const unsub = onAuthStateChange(() => { refreshTetherStatus(); if (open) refreshGate(); });
    return unsub || undefined;
  }, [open, refreshGate]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, streamText, activeTools, pending, applyResults]);

  // ── Conversation persistence (localStorage) ──
  // On open, restore the active conversation's messages.
  useEffect(() => {
    if (!open) return;
    setConversations(listConversations());
    setMessages(loadConversation(convoId));
    setActiveId(convoId);
  }, [open, convoId]);

  // Persist whenever the message list settles (not mid-stream).
  useEffect(() => {
    if (!streaming && messages.length > 0) {
      saveConversation(convoId, messages);
      setConversations(listConversations());
    }
  }, [messages, streaming, convoId]);

  const startNewChat = () => {
    const id = newConversationId();
    setConvoId(id); setActiveId(id);
    setMessages([]); setPending([]); setApplyResults(null); setDeleteQueue([]);
    setError(null); setShowHistory(false); setShowModels(false);
  };
  const switchChat = (id: string) => {
    setConvoId(id); setActiveId(id);
    setMessages(loadConversation(id));
    setPending([]); setApplyResults(null); setDeleteQueue([]); setError(null); setShowHistory(false);
  };
  const removeChat = (id: string) => {
    deleteConversation(id);
    setConversations(listConversations());
    if (id === convoId) startNewChat();
  };

  const applyApproved = () => {
    const approved = pending.filter((a) => checked[a.id]);
    const results = approved.length ? applyStagedActions(approved) : [];
    setApplyResults((prev) => [...(prev || []), ...results]);
    setPending([]);
  };

  // Confirm (apply) or skip the head of the destructive queue, then advance.
  const resolveDelete = (apply: boolean) => {
    const [head, ...rest] = deleteQueue;
    if (apply && head) setApplyResults((prev) => [...(prev || []), ...applyStagedActions([head])]);
    setDeleteQueue(rest);
  };

  const send = async () => {
    const text = input.trim();
    if (!text || streaming) return;
    setError(null);
    setInput('');
    // Moving on abandons any unresolved proposals from the previous turn.
    setPending([]);
    setApplyResults(null);
    setDeleteQueue([]);

    const history: TetherMessage[] = [
      ...messages.map((m) => ({ role: m.role, content: m.content })),
      { role: 'user', content: text },
    ];
    setMessages((prev) => [...prev, { role: 'user', content: text }]);
    setStreaming(true);
    setStreamText('');
    setActiveTools([]);
    setTetherStatus('working'); // blue + flashing while the request runs

    const toolsUsed: string[] = [];
    const staged: StagedAction[] = [];
    let finalText = '';
    let sawError = false;

    const res = await streamTether(history, (e: TetherEvent) => {
      switch (e.type) {
        case 'thinking':
          finalText = e.data;
          setStreamText(e.data);
          break;
        case 'tool_call':
          toolsUsed.push(e.data.name);
          setActiveTools((t) => [...t, e.data.name]);
          break;
        case 'staged_action':
          staged.push(e.data);
          break;
        case 'complete':
          finalText = e.data.response || finalText;
          break;
        case 'error':
          sawError = true;
          setError(e.data.error || 'Something went wrong.');
          break;
      }
    });

    setStreaming(false);
    setStreamText('');
    setActiveTools([]);
    // Light: red+flashing on failure/timeout (needs the user); blue otherwise.
    setTetherStatus(!res.ok || sawError ? 'error' : 'ready');

    // Three lanes: immediate (apply now), destructive (typed-confirmation modal,
    // one at a time), and ordinary data mutations (tickbox approval batch).
    const immediate = staged.filter(isImmediate);
    const destructive = staged.filter((a) => !isImmediate(a) && isDestructive(a));
    const needsApproval = staged.filter((a) => !isImmediate(a) && !isDestructive(a));
    if (immediate.length) setApplyResults(applyStagedActions(immediate));
    if (needsApproval.length) {
      setPending(needsApproval);
      setChecked(Object.fromEntries(needsApproval.map((a) => [a.id, true])));
    }
    if (destructive.length) setDeleteQueue(destructive);

    if (!res.ok) {
      if (res.reason === 'NO_ENDPOINT') { setGate('no-endpoint'); return; }
      if (res.reason === 'UNAUTHORIZED') { setGate('signed-out'); return; }
      if (!error) setError(res.error || 'Tether request failed.');
      return;
    }
    if (finalText) {
      setMessages((prev) => [...prev, { role: 'assistant', content: finalText, tools: toolsUsed.length ? toolsUsed : undefined }]);
    }
  };

  return (
    <AnimatePresence>
      {open && (
        <>
      <motion.div
        onClick={() => setOpen(false)}
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(1.5px)', zIndex: 1400 }}
      />
      {/* Border wave-pulse: a soft glow that blooms outward from the panel, on a
          loop. Separate fixed elements (outside the panel's overflow:hidden so the
          box-shadow isn't clipped), behind it, non-interactive. Two staggered
          layers for a continuous swell. */}
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        transition={{ duration: 0.2 }}
        aria-hidden
        style={{ position: 'fixed', inset: 0, zIndex: 1401, pointerEvents: 'none' }}
      >
        {['g1', 'g2'].map((g) => (
          <div key={g} className={`tether-glow ${g}`} style={{
            position: 'fixed', top: 16, right: 16, bottom: 16,
            width: 'min(420px, calc(100vw - 32px))',
            borderRadius: 'var(--radius-lg, 16px)',
          }} />
        ))}
      </motion.div>
      <motion.div
        // Fade + gentle scale/slide, matching BlockOut's modal motion.
        initial={{ opacity: 0, scale: 0.96, x: 12 }}
        animate={{ opacity: 1, scale: 1, x: 0 }}
        exit={{ opacity: 0, scale: 0.96, x: 12 }}
        transition={{ type: 'spring', damping: 28, stiffness: 380 }}
        style={{
        // Floating card: detached from the edges with rounded corners, matching
        // BlockOut's modal feel (lighter weight than an edge-to-edge drawer).
        position: 'fixed', top: 16, right: 16, bottom: 16,
        width: 'min(420px, calc(100vw - 32px))',
        background: 'var(--bg-primary)', border: '1px solid var(--border)',
        borderRadius: 'var(--radius-lg, 16px)', overflow: 'hidden',
        boxShadow: '0 24px 64px rgba(0,0,0,0.22)', zIndex: 1402,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header — slim single-row band */}
        <div style={{
          position: 'relative',
          display: 'flex', alignItems: 'center', gap: 10, padding: '12px 12px 12px 16px',
          borderBottom: '1px solid var(--border)',
          background: 'radial-gradient(130% 160% at 0% 0%, var(--bg-secondary), var(--bg-primary) 72%)',
        }}>
          <TetherFace size={32} />
          <span style={{ fontWeight: 700, fontSize: 15.5, letterSpacing: '-0.01em' }}>{showModels ? 'Tether models' : 'Tether'}</span>
          <TetherLight size={7} />
          <div style={{ flex: 1 }} />
          {/* Action cluster */}
          {gate === 'ready' && !showModels && (
            <>
              <IconBtn title="New chat" onClick={startNewChat}>
                <path d="M12 5v14M5 12h14" />
              </IconBtn>
              <IconBtn title="Chat history" onClick={() => { setConversations(listConversations()); setShowHistory((v) => !v); }} round>
                <circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 1.8" />
              </IconBtn>
            </>
          )}
          {gate === 'ready' && (
            <IconBtn title={showModels ? 'Back to chat' : 'Manage models'} onClick={() => { setShowModels((v) => !v); setShowHistory(false); }}>
              {showModels
                ? <path d="M15 18l-6-6 6-6" />
                : <><circle cx="12" cy="12" r="2.6" /><path d="M19.4 13.5a1.7 1.7 0 0 0 .34 1.87l.05.05a2 2 0 1 1-2.83 2.83l-.05-.05a1.7 1.7 0 0 0-2.87 1.2V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-2.87-1.2l-.05.05a2 2 0 1 1-2.83-2.83l.05-.05A1.7 1.7 0 0 0 4.6 13.5H4.5a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.2-2.87l-.05-.05A2 2 0 1 1 8.58 3.8l.05.05a1.7 1.7 0 0 0 1.87.34H10.6a1.7 1.7 0 0 0 1-1.55V2.5a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 2.87 1.2l.05-.05a2 2 0 1 1 2.83 2.83l-.05.05a1.7 1.7 0 0 0-.34 1.87V8.6a1.7 1.7 0 0 0 1.55 1H21.5a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.55 1z" /></>}
            </IconBtn>
          )}
          <div style={{ width: 1, height: 20, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />
          <IconBtn title="Close" onClick={() => setOpen(false)}>
            <path d="M18 6 6 18M6 6l12 12" />
          </IconBtn>
        </div>

        {/* Chat history dropdown */}
        {showHistory && gate === 'ready' && (
          <div style={{
            position: 'absolute', top: 70, right: 12, width: 'min(300px, calc(100% - 24px))', maxHeight: 360, overflowY: 'auto',
            background: 'var(--bg-primary)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md, 11px)',
            boxShadow: '0 12px 32px rgba(0,0,0,0.22)', zIndex: 6, padding: 6,
          }}>
            {conversations.length === 0 && <div style={{ padding: 10, fontSize: 12, color: 'var(--text-tertiary)' }}>No past chats yet.</div>}
            {conversations.map((c) => (
              <div key={c.id} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 8px', borderRadius: 7, cursor: 'pointer',
                background: c.id === convoId ? 'var(--bg-tertiary)' : 'transparent',
              }}>
                <span onClick={() => switchChat(c.id)} style={{ flex: 1, minWidth: 0, fontSize: 12.5, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{c.title}</span>
                <button className="btn btn-ghost btn-sm" title="Delete chat" onClick={() => removeChat(c.id)} style={{ padding: '2px 5px', color: 'hsl(0,72%,55%)', flexShrink: 0 }}>🗑</button>
              </div>
            ))}
          </div>
        )}

        {deleteQueue.length > 0 && (
          <DeletionModal
            action={deleteQueue[0]}
            remaining={deleteQueue.length}
            onConfirm={() => resolveDelete(true)}
            onCancel={() => resolveDelete(false)}
          />
        )}

        {/* Body */}
        {gate === 'loading' && <Centered>Loading…</Centered>}
        {gate === 'signed-out' && <Centered>Sign in (Cloud Sync) to use Tether. It uses your own AI model + key.</Centered>}
        {gate === 'no-endpoint' && <TetherEndpoints onChanged={refreshGate} />}
        {gate === 'ready' && showModels && <TetherEndpoints onChanged={refreshGate} />}
        {gate === 'ready' && !showModels && (
          <>
            <div ref={scrollRef} style={{ position: 'relative', flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {/* Empty-chat hero: the face hovers (∞) dead-centre, then fades out
                  the moment the conversation starts. */}
              <div style={{
                position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column',
                alignItems: 'center', justifyContent: 'center', gap: 20, padding: 24,
                opacity: messages.length === 0 && !streaming ? 1 : 0,
                pointerEvents: messages.length === 0 && !streaming ? 'auto' : 'none',
                transition: 'opacity 0.3s ease',
              }}>
                <TetherFace size={96} variant="hero" />
                <div style={{ color: 'var(--text-tertiary)', fontSize: 12.5, textAlign: 'center', maxWidth: 250, lineHeight: 1.6 }}>
                  Ask about your tasks, plan your week, or have me tidy things up. Just say the word.
                </div>
              </div>
              {messages.map((m, i) => <Bubble key={i} msg={m} />)}

              {pending.length > 0 && (
                <ApprovalCard
                  actions={pending}
                  checked={checked}
                  onToggle={(id) => setChecked((c) => ({ ...c, [id]: !c[id] }))}
                  onApply={applyApproved}
                  onDiscard={() => setPending([])}
                />
              )}

              {applyResults && applyResults.length > 0 && (
                <div style={{ border: '1px solid var(--border)', borderRadius: 10, padding: 12, background: 'var(--bg-secondary)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 8 }}>
                    Applied {applyResults.filter((r) => r.ok).length}/{applyResults.length}
                  </div>
                  {applyResults.map((r) => (
                    <div key={r.id} style={{ fontSize: 12, color: r.ok ? 'var(--text-secondary)' : 'hsl(35,90%,45%)', display: 'flex', gap: 6, marginBottom: 3 }}>
                      <span>{r.ok ? '✓' : '⚠'}</span><span>{r.message}</span>
                    </div>
                  ))}
                </div>
              )}

              {streaming && (
                <div>
                  {activeTools.length > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6, fontStyle: 'italic' }}>
                      {toolLabels(activeTools).join(' · ')}…
                    </div>
                  )}
                  <Bubble msg={{ role: 'assistant', content: streamText || '…' }} streaming />
                </div>
              )}
              {error && <div style={{ fontSize: 12, color: 'hsl(0,72%,55%)' }}>{error}</div>}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', padding: 12, display: 'flex', gap: 8 }}>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }}
                placeholder="Ask Tether…"
                rows={2}
                style={{
                  flex: 1, resize: 'none', padding: '8px 10px', fontSize: 13,
                  borderRadius: 'var(--radius-sm)', border: '1px solid var(--border)',
                  background: 'var(--bg-secondary)', color: 'var(--text-primary)', fontFamily: 'inherit',
                }}
              />
              <button className="btn btn-primary" onClick={send} disabled={streaming || !input.trim()}>
                {streaming ? '…' : 'Send'}
              </button>
            </div>
          </>
        )}
      </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

// Consistent square ghost icon button for the header (stroke="currentColor").
function IconBtn({ title, onClick, children, round }: {
  title: string; onClick: () => void; children: React.ReactNode; round?: boolean;
}) {
  return (
    <button className="btn btn-ghost btn-sm" title={title} onClick={onClick}
      style={{ flexShrink: 0, width: 30, height: 30, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
        strokeWidth={round ? 1.7 : 1.8} strokeLinecap="round" strokeLinejoin="round">
        {children}
      </svg>
    </button>
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24, textAlign: 'center', color: 'var(--text-secondary)', fontSize: 13, lineHeight: 1.6 }}>
      {children}
    </div>
  );
}

function Bubble({ msg, streaming }: { msg: ChatMsg; streaming?: boolean }) {
  const isUser = msg.role === 'user';
  return (
    <div style={{ alignSelf: isUser ? 'flex-end' : 'flex-start', maxWidth: '85%' }}>
      <div style={{
        padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5,
        whiteSpace: isUser ? 'pre-wrap' : 'normal',
        background: isUser ? 'var(--accent)' : 'var(--bg-secondary)',
        color: isUser ? '#fff' : 'var(--text-primary)',
        border: isUser ? 'none' : '1px solid var(--border)',
        opacity: streaming ? 0.85 : 1,
      }}>
        {/* Assistant output is markdown; user text stays literal. */}
        {isUser ? msg.content : <TetherMarkdown content={msg.content} />}
      </div>
      {msg.tools && msg.tools.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3, fontStyle: 'italic' }}>{toolLabels(msg.tools).join(' · ')}</div>
      )}
    </div>
  );
}

// Batch approval with per-item tickboxes — one permission for the whole batch,
// untick the ones you don't want (Claude-Code style). Read tools never reach
// here; only staged create/update proposals do.
const TYPE_TINT: Record<string, string> = {
  create_task: '140,60%,45%', create_category: '140,60%,45%', create_subcategory: '140,60%,45%',
  create_block: '210,80%,55%', assign_to_block: '210,80%,55%', update_task: '35,85%,50%',
  update_tasks: '35,85%,50%', rename_category: '35,85%,50%',
  add_chain_steps: '140,60%,45%', add_tasks_to_chain: '210,80%,55%', complete_chain_step: '35,85%,50%',
  apply_chain_template: '210,80%,55%', schedule_block: '270,60%,55%',
};

function ApprovalCard({ actions, checked, onToggle, onApply, onDiscard }: {
  actions: StagedAction[];
  checked: Record<string, boolean>;
  onToggle: (id: string) => void;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const count = actions.filter((a) => checked[a.id]).length;
  return (
    <div style={{ border: '1px solid var(--accent)', borderRadius: 12, padding: 12, background: 'var(--bg-secondary)' }}>
      <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 10 }}>
        Tether proposes {actions.length} change{actions.length > 1 ? 's' : ''} · review &amp; approve
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {actions.map((a) => {
          const on = !!checked[a.id];
          const tint = TYPE_TINT[a.type] || '210,80%,55%';
          return (
            <label key={a.id} style={{
              display: 'flex', alignItems: 'flex-start', gap: 9, padding: '8px 10px', cursor: 'pointer',
              borderRadius: 8, border: '1px solid var(--border)',
              background: on ? `hsla(${tint},0.08)` : 'transparent', opacity: on ? 1 : 0.55,
            }}>
              <input type="checkbox" checked={on} onChange={() => onToggle(a.id)} style={{ marginTop: 2, accentColor: `hsl(${tint})` }} />
              <span style={{ fontSize: 12.5, lineHeight: 1.4, color: 'var(--text-primary)' }}>{a.summary}</span>
            </label>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
        <button className="btn btn-primary btn-sm" onClick={onApply} disabled={count === 0}>
          Apply {count > 0 ? count : ''}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onDiscard}>Discard</button>
      </div>
    </div>
  );
}

// Typed-confirmation gate for a single destructive action. Lists ONLY the
// targets and requires the exact phrase before Delete is enabled. Destructive
// actions never ride "apply all" — each gets this modal.
function DeletionModal({ action, remaining, onConfirm, onCancel }: {
  action: StagedAction;
  remaining: number;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const targets = resolveDeleteTargets(action);
  const phrase = requiredDeletePhrase(targets.noun, targets.count);
  const [typed, setTyped] = useState('');
  const match = typed === phrase;
  const danger = 'hsl(0,72%,55%)';

  return (
    <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 5, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
      <div style={{ background: 'var(--bg-primary)', border: `1px solid ${danger}`, borderRadius: 12, padding: 16, width: '100%', maxWidth: 360, maxHeight: '90%', overflowY: 'auto' }}>
        <div style={{ fontWeight: 700, fontSize: 14, color: danger, marginBottom: 4 }}>Confirm deletion</div>
        {remaining > 1 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>{remaining} deletions queued · confirming one at a time.</div>}

        <div style={{ fontSize: 12.5, color: 'var(--text-secondary)', margin: '8px 0 4px' }}>
          This will permanently delete:
        </div>
        <ul style={{ margin: '0 0 8px 0', paddingLeft: 18, fontSize: 12.5, color: 'var(--text-primary)' }}>
          {targets.names.map((n, i) => <li key={i}>{n}</li>)}
        </ul>
        {targets.cascade && targets.cascade.length > 0 && (
          <>
            <div style={{ fontSize: 11.5, color: danger, margin: '4px 0' }}>…and everything inside it:</div>
            <ul style={{ margin: '0 0 8px 0', paddingLeft: 18, fontSize: 11.5, color: 'var(--text-secondary)' }}>
              {targets.cascade.map((n, i) => <li key={i}>{n}</li>)}
            </ul>
          </>
        )}

        <div style={{ fontSize: 12, color: 'var(--text-secondary)', margin: '10px 0 4px' }}>
          Type <strong style={{ color: 'var(--text-primary)' }}>{phrase}</strong> to confirm:
        </div>
        <input
          autoFocus
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={phrase}
          style={{ width: '100%', padding: '8px 10px', fontSize: 13, borderRadius: 'var(--radius-sm)', border: `1px solid ${match ? danger : 'var(--border)'}`, background: 'var(--bg-secondary)', color: 'var(--text-primary)' }}
        />
        <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
          <button
            className="btn btn-sm"
            onClick={onConfirm}
            disabled={!match || targets.count === 0}
            style={{ background: match ? danger : 'var(--bg-tertiary)', color: match ? '#fff' : 'var(--text-tertiary)', border: 'none', cursor: match ? 'pointer' : 'not-allowed' }}
          >
            Delete
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

