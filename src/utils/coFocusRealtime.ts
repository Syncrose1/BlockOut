/**
 * Co-Focus Realtime channel management.
 * Handles Supabase Realtime: presence tracking, broadcast events, and subscriptions.
 *
 * Disconnect resilience:
 * - The subscribe-status callback flips an `isConnected` flag. While
 *   disconnected, the empty-room poll is suppressed (otherwise our own brief
 *   internet hiccup makes us see 0 presences and self-broadcast `room:empty`,
 *   kicking us out of the room we never actually left).
 * - Empty-room only fires after presence has been observed at zero for at
 *   least EMPTY_ROOM_GRACE_MS while connected — a single sample is not enough.
 * - Channel errors trigger an exponential reconnect (3s, 6s, 12s, 24s, 30s),
 *   keeping local session state intact across attempts. Hard failure only
 *   tears down state after MAX_RECONNECT_ATTEMPTS.
 */

import { getSupabaseClient } from './coFocusSync';
import type { CoFocusPresence, ChatMessage } from '../types/coFocus';

let channel: any = null;
let currentSessionId: string | null = null;
let isConnected = false;
let zeroSinceTs: number | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempts = 0;
let presencePollTimer: ReturnType<typeof setInterval> | null = null;
let onTeardown: (() => void) | null = null;

const PRESENCE_POLL_MS = 5000;
const EMPTY_ROOM_GRACE_MS = 30_000;
const MAX_RECONNECT_ATTEMPTS = 5;
const RECONNECT_BACKOFF_MS = [3000, 6000, 12000, 24000, 30000];

export type PresenceCallback = (presences: Record<string, CoFocusPresence>) => void;
export type BroadcastCallback = (event: string, payload: any) => void;
export type ConnectionCallback = (status: 'connected' | 'reconnecting' | 'disconnected') => void;

let onPresenceSync: PresenceCallback | null = null;
let onBroadcast: BroadcastCallback | null = null;
let onConnectionChange: ConnectionCallback | null = null;

export function subscribeToSession(
  sessionId: string,
  presenceCb: PresenceCallback,
  broadcastCb: BroadcastCallback,
  connectionCb?: ConnectionCallback,
) {
  const sb = getSupabaseClient();
  if (!sb) return;

  // Clean up previous channel without firing teardown callback (we're swapping)
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }
  if (presencePollTimer) { clearInterval(presencePollTimer); presencePollTimer = null; }
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }

  currentSessionId = sessionId;
  onPresenceSync = presenceCb;
  onBroadcast = broadcastCb;
  onConnectionChange = connectionCb ?? null;
  isConnected = false;
  zeroSinceTs = null;

  channel = sb.channel(`cofocus:${sessionId}`, {
    config: { presence: { key: '' } }, // key set on track()
  });

  channel
    .on('presence', { event: 'sync' }, () => {
      if (!channel || !onPresenceSync) return;
      const state = channel.presenceState();
      const participants: Record<string, CoFocusPresence> = {};
      for (const [_key, presences] of Object.entries(state)) {
        for (const p of presences as any[]) {
          if (p.userId) {
            participants[p.userId] = p;
          }
        }
      }
      onPresenceSync(participants);
    })
    .on('broadcast', { event: 'timer:sync' }, ({ payload }: any) => {
      onBroadcast?.('timer:sync', payload);
    })
    .on('broadcast', { event: 'chat:message' }, ({ payload }: any) => {
      onBroadcast?.('chat:message', payload);
    })
    .on('broadcast', { event: 'session:end' }, ({ payload }: any) => {
      onBroadcast?.('session:end', payload);
    })
    .on('broadcast', { event: 'scene:change' }, ({ payload }: any) => {
      onBroadcast?.('scene:change', payload);
    })
    .on('broadcast', { event: 'timerMode:change' }, ({ payload }: any) => {
      onBroadcast?.('timerMode:change', payload);
    })
    .subscribe((status: string) => {
      if (status === 'SUBSCRIBED') {
        isConnected = true;
        reconnectAttempts = 0;
        zeroSinceTs = null;
        onConnectionChange?.('connected');
      } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
        isConnected = false;
        onConnectionChange?.('reconnecting');
        scheduleReconnect(sessionId);
      }
    });

  presencePollTimer = setInterval(() => {
    if (!channel || !isConnected) {
      // Do not interpret "I'm offline" as "the room is empty."
      zeroSinceTs = null;
      return;
    }
    const state = channel.presenceState();
    const participantCount = Object.values(state).flat().length;
    if (participantCount === 0) {
      if (zeroSinceTs === null) zeroSinceTs = Date.now();
      else if (Date.now() - zeroSinceTs >= EMPTY_ROOM_GRACE_MS) {
        zeroSinceTs = null;
        onBroadcast?.('room:empty', {});
      }
    } else {
      zeroSinceTs = null;
    }
  }, PRESENCE_POLL_MS);
}

function scheduleReconnect(sessionId: string) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
    console.warn('[CoFocus] Max reconnect attempts exhausted — tearing down session');
    onConnectionChange?.('disconnected');
    onTeardown?.();
    return;
  }
  const delay = RECONNECT_BACKOFF_MS[Math.min(reconnectAttempts, RECONNECT_BACKOFF_MS.length - 1)];
  reconnectAttempts += 1;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (currentSessionId !== sessionId) return; // user moved on
    if (!onPresenceSync || !onBroadcast) return;
    console.log(`[CoFocus] Reconnect attempt ${reconnectAttempts}...`);
    subscribeToSession(sessionId, onPresenceSync, onBroadcast, onConnectionChange ?? undefined);
  }, delay);
}

export function setOnTeardown(cb: (() => void) | null) {
  onTeardown = cb;
}

export function trackPresence(userId: string, presence: CoFocusPresence) {
  if (!channel) return;
  channel.track({ ...presence, userId });
}

export function broadcastTimerSync(payload: {
  action: 'start' | 'pause' | 'reset' | 'skip';
  timeRemaining: number;
  mode: string;
}) {
  if (!channel) return;
  channel.send({ type: 'broadcast', event: 'timer:sync', payload });
}

export function broadcastChatMessage(message: Omit<ChatMessage, 'id' | 'sessionId'>) {
  if (!channel) return;
  channel.send({ type: 'broadcast', event: 'chat:message', payload: message });
}

export function broadcastSessionEnd(reason: string) {
  if (!channel) return;
  channel.send({ type: 'broadcast', event: 'session:end', payload: { reason } });
}

export function broadcastSceneChange(sceneKey: string) {
  if (!channel) return;
  channel.send({ type: 'broadcast', event: 'scene:change', payload: { sceneKey } });
}

export function broadcastTimerModeChange(timerMode: 'shared' | 'independent') {
  if (!channel) return;
  channel.send({ type: 'broadcast', event: 'timerMode:change', payload: { timerMode } });
}

export function unsubscribeFromSession() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (presencePollTimer) { clearInterval(presencePollTimer); presencePollTimer = null; }
  const sb = getSupabaseClient();
  if (channel && sb) {
    try { channel.untrack(); } catch { /* ignore */ }
    sb.removeChannel(channel);
  }
  channel = null;
  currentSessionId = null;
  isConnected = false;
  zeroSinceTs = null;
  reconnectAttempts = 0;
  onPresenceSync = null;
  onBroadcast = null;
  onConnectionChange = null;
}

export function getCurrentSessionId() {
  return currentSessionId;
}

export function getConnectionState(): 'connected' | 'reconnecting' | 'disconnected' {
  if (!currentSessionId) return 'disconnected';
  return isConnected ? 'connected' : 'reconnecting';
}
