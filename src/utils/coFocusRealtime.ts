/**
 * Co-Focus Realtime channel management.
 * Handles Supabase Realtime: presence tracking, broadcast events, and subscriptions.
 * Includes presence polling for auto-kick on tab close.
 */

import { getSupabaseClient } from './coFocusSync';
import type { CoFocusPresence, ChatMessage } from '../types/coFocus';

let channel: any = null;
let currentSessionId: string | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let presencePollTimer: ReturnType<typeof setInterval> | null = null;

export type PresenceCallback = (presences: Record<string, CoFocusPresence>) => void;
export type BroadcastCallback = (event: string, payload: any) => void;

let onPresenceSync: PresenceCallback | null = null;
let onBroadcast: BroadcastCallback | null = null;

export function subscribeToSession(
  sessionId: string,
  presenceCb: PresenceCallback,
  broadcastCb: BroadcastCallback,
) {
  const sb = getSupabaseClient();
  if (!sb) return;

  // Clean up previous channel
  if (channel) {
    sb.removeChannel(channel);
    channel = null;
  }
  if (presencePollTimer) { clearInterval(presencePollTimer); presencePollTimer = null; }

  currentSessionId = sessionId;
  onPresenceSync = presenceCb;
  onBroadcast = broadcastCb;

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
      if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
        console.warn('[CoFocus] Channel error/timeout, reconnecting in 3s...');
        scheduleReconnect(sessionId, presenceCb, broadcastCb);
      }
    });

  // Start presence polling every 10 seconds to detect departed participants
  presencePollTimer = setInterval(() => {
    if (!channel) return;
    const state = channel.presenceState();
    const participantCount = Object.values(state).flat().length;
    // If no participants remain (room empty), broadcast should handle cleanup
    // The presence sync event will fire naturally and the callback handles it
    if (participantCount === 0 && onBroadcast) {
      onBroadcast('room:empty', {});
    }
  }, 10000);
}

function scheduleReconnect(
  sessionId: string,
  presenceCb: PresenceCallback,
  broadcastCb: BroadcastCallback,
) {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // Only reconnect if we still expect to be in this session
    if (currentSessionId === sessionId) {
      console.log('[CoFocus] Attempting reconnect...');
      subscribeToSession(sessionId, presenceCb, broadcastCb);
    }
  }, 3000);
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
    channel.untrack();
    sb.removeChannel(channel);
  }
  channel = null;
  currentSessionId = null;
  onPresenceSync = null;
  onBroadcast = null;
}

export function getCurrentSessionId() {
  return currentSessionId;
}
