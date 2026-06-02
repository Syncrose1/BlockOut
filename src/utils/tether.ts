// Tether client: builds the data snapshot, talks to the BYOK agent endpoint over
// SSE, and manages the user's model endpoints. Base-path-aware and auth'd with
// the Supabase access token (the api_key never lives client-side).

import { useStore } from '../store';
import { getAccessToken } from './supabase';
import { getTheme } from './theme';
import { isDropboxConfigured } from './dropbox';
import { getLastSyncedTime } from './persistence';
import type { StagedAction } from './tetherApply';

// Same derivation as r2sync.ts getApiBase(): '' in dev, '/blockout' on web.
function getApiBase(): string {
  return import.meta.env.BASE_URL.replace(/\/+$/, '');
}

// ── Snapshot ──────────────────────────────────────────────────────────────────
// Only the productivity-relevant slices — keep the payload (and the user's token
// spend) small. Tether reads this; it never sees Synamon/pomodoro/etc.
export function buildSnapshot(): Record<string, unknown> {
  const s = useStore.getState() as unknown as Record<string, unknown>;
  const lastSynced = getLastSyncedTime();
  return {
    tasks: s.tasks,
    categories: s.categories,
    timeBlocks: s.timeBlocks,
    taskChains: s.taskChains,
    chainTasks: s.chainTasks,
    chainTemplates: s.chainTemplates,
    overviewBlocks: s.overviewBlocks,
    // App status so Tether can guide (theme, companion, sync). Reaching this code
    // means the caller already has an access token, so the account is signed in.
    settings: {
      theme: getTheme(),
      synamonEnabled: s.synamonEnabled !== false,
      sync: {
        accountSignedIn: true,
        dropboxConnected: isDropboxConfigured(),
        lastSyncedAt: lastSynced ? new Date(lastSynced).toISOString() : null,
        status: s.syncStatus,
      },
    },
  };
}

// ── SSE chat ──────────────────────────────────────────────────────────────────

export interface TetherMessage {
  role: 'user' | 'assistant';
  content: string;
}

export type TetherEvent =
  | { type: 'thinking'; data: string }
  | { type: 'tool_call'; data: { name: string; input: unknown } }
  | { type: 'tool_result'; data: { tool: string; error?: string } }
  | { type: 'staged_action'; data: StagedAction }
  | { type: 'complete'; data: { response: string } }
  | { type: 'error'; data: { error: string } };

export interface StreamResult {
  ok: boolean;
  /** 'NO_ENDPOINT' when the user hasn't configured a model endpoint yet. */
  reason?: 'NO_ENDPOINT' | 'UNAUTHORIZED' | 'ERROR';
  error?: string;
}

/**
 * POST a conversation to the Tether agent and dispatch SSE events as they
 * arrive. Resolves when the stream ends.
 */
export async function streamTether(
  messages: TetherMessage[],
  onEvent: (e: TetherEvent) => void,
  signal?: AbortSignal,
): Promise<StreamResult> {
  const token = await getAccessToken();
  if (!token) return { ok: false, reason: 'UNAUTHORIZED', error: 'Sign in to use Tether.' };

  let res: Response;
  try {
    res = await fetch(`${getApiBase()}/api/tether`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messages, snapshot: buildSnapshot() }),
      signal,
    });
  } catch (e) {
    return { ok: false, reason: 'ERROR', error: e instanceof Error ? e.message : 'Network error' };
  }

  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    if (res.status === 503 && body.error === 'NO_ENDPOINT') return { ok: false, reason: 'NO_ENDPOINT' };
    if (res.status === 401) return { ok: false, reason: 'UNAUTHORIZED', error: body.error };
    return { ok: false, reason: 'ERROR', error: body.error || `HTTP ${res.status}` };
  }

  const reader = res.body?.getReader();
  if (!reader) return { ok: false, reason: 'ERROR', error: 'No response stream' };

  const decoder = new TextDecoder();
  let buffer = '';

  // Parse the SSE wire format: blocks separated by a blank line, each with an
  // `event:` line and a `data:` line.
  const dispatch = (block: string) => {
    let type = '';
    let dataLine = '';
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) type = line.slice(6).trim();
      else if (line.startsWith('data:')) dataLine += line.slice(5).trim();
    }
    if (!type) return;
    let data: unknown = {};
    try { data = JSON.parse(dataLine || '{}'); } catch { /* keep {} */ }
    onEvent({ type, data } as TetherEvent);
  };

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let sep;
    while ((sep = buffer.indexOf('\n\n')) !== -1) {
      const block = buffer.slice(0, sep);
      buffer = buffer.slice(sep + 2);
      if (block.trim()) dispatch(block);
    }
  }
  if (buffer.trim()) dispatch(buffer);

  return { ok: true };
}

// ── Endpoints (BYOK config) ───────────────────────────────────────────────────

export interface ModelEndpoint {
  id: string;
  name: string;
  base_url: string;
  model_id: string;
  is_default: boolean;
  created_at: string;
}

async function authedFetch(path: string, init?: RequestInit): Promise<Response> {
  const token = await getAccessToken();
  const headers = new Headers(init?.headers);
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(`${getApiBase()}${path}`, { ...init, headers });
}

export async function listEndpoints(): Promise<ModelEndpoint[]> {
  const res = await authedFetch('/api/tether-endpoints');
  if (!res.ok) return [];
  return res.json();
}

export async function createEndpoint(input: {
  name: string; base_url: string; api_key: string; model_id: string; is_default?: boolean;
}): Promise<{ ok: boolean; error?: string; endpoint?: ModelEndpoint }> {
  const res = await authedFetch('/api/tether-endpoints', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, error: body.error || `HTTP ${res.status}` };
  return { ok: true, endpoint: body };
}

export async function deleteEndpoint(id: string): Promise<boolean> {
  const res = await authedFetch(`/api/tether-endpoints?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
  return res.ok;
}
