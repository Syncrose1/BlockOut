// Tether — the Syncratic AI assistant panel (phase 1b: read-only chat).
// Right-side slide-in. Gated on: signed in → has a model endpoint → chat.
// Writes/deletes are not wired yet; the agent can only read & advise.

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
import {
  applyStagedActions, isImmediate, isDestructive, resolveDeleteTargets, requiredDeletePhrase,
  type StagedAction, type ApplyResult,
} from '../../utils/tetherApply';

type Gate = 'loading' | 'signed-out' | 'no-endpoint' | 'ready';

interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[]; // tool names used while producing an assistant turn
}

export function TetherPanel() {
  const open = useStore((s) => s.tetherOpen);
  const setOpen = useStore((s) => s.setTetherOpen);
  const setTetherStatus = useStore((s) => s.setTetherStatus);

  const [gate, setGate] = useState<Gate>('loading');
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

  if (!open) return null;

  return (
    <>
      <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.28)', backdropFilter: 'blur(1.5px)', zIndex: 1400 }} />
      <div style={{
        position: 'fixed', top: 0, right: 0, bottom: 0, width: 'min(420px, 100vw)',
        background: 'var(--bg-primary)', borderLeft: '1px solid var(--border)',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.16)', zIndex: 1401,
        display: 'flex', flexDirection: 'column',
      }}>
        {/* Header — lively hero band */}
        <div style={{
          position: 'relative', overflow: 'hidden',
          display: 'flex', alignItems: 'center', gap: 12, padding: '16px 14px 16px 18px',
          borderBottom: '1px solid var(--border)',
          background: 'radial-gradient(120% 140% at 0% 0%, var(--bg-secondary), var(--bg-primary) 70%)',
        }}>
          <TetherFace size={42} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <span style={{ fontWeight: 700, fontSize: 16, letterSpacing: '-0.01em' }}>{showModels ? 'Tether models' : 'Tether'}</span>
              <TetherLight size={8} />
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-tertiary)', marginTop: 1 }}>{showModels ? 'Your connected AI models' : 'Your Syncratic AI assistant'}</div>
          </div>
          {gate === 'ready' && (
            <button className="btn btn-ghost btn-sm" title="Manage models" onClick={() => setShowModels((v) => !v)} style={{ flexShrink: 0 }}>
              {showModels ? '← Chat' : 'Models'}
            </button>
          )}
          <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} style={{ flexShrink: 0 }}>✕</button>
        </div>

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
        {gate === 'signed-out' && <Centered>Sign in (Cloud Sync) to use Tether — it uses your own AI model + key.</Centered>}
        {gate === 'no-endpoint' && <TetherEndpoints onChanged={refreshGate} />}
        {gate === 'ready' && showModels && <TetherEndpoints onChanged={refreshGate} />}
        {gate === 'ready' && !showModels && (
          <>
            <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
              {messages.length === 0 && !streaming && (
                <div style={{ color: 'var(--text-tertiary)', fontSize: 13, lineHeight: 1.6 }}>
                  Ask about your tasks — e.g. <em>“What’s due in the next 7 days?”</em>,
                  <em> “Which category has the most unfinished effort?”</em>, or
                  <em> “Summarise today’s chain.”</em>
                </div>
              )}
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
                    <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 6 }}>
                      🔍 {activeTools.join(' · ')}
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
      </div>
    </>
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
        padding: '8px 12px', borderRadius: 12, fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap',
        background: isUser ? 'var(--accent)' : 'var(--bg-secondary)',
        color: isUser ? '#fff' : 'var(--text-primary)',
        border: isUser ? 'none' : '1px solid var(--border)',
        opacity: streaming ? 0.85 : 1,
      }}>
        {msg.content}
      </div>
      {msg.tools && msg.tools.length > 0 && (
        <div style={{ fontSize: 10, color: 'var(--text-tertiary)', marginTop: 3 }}>🔍 {msg.tools.join(' · ')}</div>
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
        Tether proposes {actions.length} change{actions.length > 1 ? 's' : ''} — review &amp; approve
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
        {remaining > 1 && <div style={{ fontSize: 11, color: 'var(--text-tertiary)', marginBottom: 8 }}>{remaining} deletions queued — confirming one at a time.</div>}

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

