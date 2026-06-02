// Tether conversation persistence (localStorage). Survives reloads and keeps a
// switchable history. Per-device for now; a shared-table (cross-device) version
// can follow once the shared Supabase `tether_conversations.mode` CHECK is
// relaxed to include 'blockout' (a coordinated migration that also touches
// Binder's copy — deferred).

export interface ChatMsg {
  role: 'user' | 'assistant';
  content: string;
  tools?: string[];
}

export interface TetherConversation {
  id: string;
  title: string;
  messages: ChatMsg[];
  updatedAt: number;
}

const LS_LIST = 'tether-conversations';
const LS_ACTIVE = 'tether-active-conversation';
const MAX_CONVERSATIONS = 30;

export function newConversationId(): string {
  return (crypto.randomUUID ? crypto.randomUUID() : 'c-' + Math.random().toString(36).slice(2));
}

export function listConversations(): TetherConversation[] {
  try {
    const raw = localStorage.getItem(LS_LIST);
    if (!raw) return [];
    const arr = JSON.parse(raw);
    return Array.isArray(arr) ? arr.sort((a, b) => b.updatedAt - a.updatedAt) : [];
  } catch { return []; }
}

export function getActiveId(): string | null {
  return localStorage.getItem(LS_ACTIVE);
}

export function setActiveId(id: string | null): void {
  try { if (id) localStorage.setItem(LS_ACTIVE, id); else localStorage.removeItem(LS_ACTIVE); } catch { /* ignore */ }
}

function writeAll(list: TetherConversation[]): void {
  try {
    const trimmed = [...list].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, MAX_CONVERSATIONS);
    localStorage.setItem(LS_LIST, JSON.stringify(trimmed));
  } catch { /* quota — best-effort */ }
}

/** Derive a short title from the first user message. */
function deriveTitle(messages: ChatMsg[]): string {
  const first = messages.find((m) => m.role === 'user');
  if (!first) return 'New chat';
  const t = first.content.trim().replace(/\s+/g, ' ');
  return t.length > 48 ? t.slice(0, 46) + '…' : t;
}

/** Upsert a conversation from its messages. No-op for an empty conversation. */
export function saveConversation(id: string, messages: ChatMsg[]): void {
  if (messages.length === 0) return;
  const list = listConversations();
  const existing = list.find((c) => c.id === id);
  const convo: TetherConversation = {
    id,
    title: existing && existing.title !== 'New chat' ? existing.title : deriveTitle(messages),
    messages,
    updatedAt: Date.now(),
  };
  writeAll([convo, ...list.filter((c) => c.id !== id)]);
}

export function loadConversation(id: string): ChatMsg[] {
  return listConversations().find((c) => c.id === id)?.messages ?? [];
}

export function deleteConversation(id: string): void {
  writeAll(listConversations().filter((c) => c.id !== id));
  if (getActiveId() === id) setActiveId(null);
}
