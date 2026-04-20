/**
 * Co-Focus state slice — imported and spread into the main Zustand store.
 * Handles: friends, sessions, realtime presence, chat, timer sync.
 */

import { v4 as uuid } from 'uuid';
import type {
  CoFocusState, Friend, CoFocusParticipant, ChatMessage, CoFocusPresence,
} from '../types/coFocus';
import { initialCoFocusState } from '../types/coFocus';
import * as sync from '../utils/coFocusSync';
import * as rt from '../utils/coFocusRealtime';

export { initialCoFocusState };

// Assign slot indices to participants (stable: sorted by join order / userId)
function assignSlots(participants: Record<string, CoFocusPresence>): Record<string, CoFocusParticipant> {
  const sorted = Object.entries(participants).sort(([a], [b]) => a.localeCompare(b));
  const result: Record<string, CoFocusParticipant> = {};
  sorted.forEach(([userId, p], idx) => {
    result[userId] = { ...p, slotIndex: idx % 5 };
  });
  return result;
}

export function makeCoFocusActions(set: (fn: (s: any) => any) => void, get: () => any) {
  // ─── Presence sync handler ──────────────────────────────────────────────
  function handlePresenceSync(presences: Record<string, CoFocusPresence>) {
    set((s: any) => ({
      coFocus: {
        ...s.coFocus,
        participants: assignSlots(presences),
      },
    }));
  }

  // ─── Broadcast handler ─────────────────────────────────────────────────
  function handleBroadcast(event: string, payload: any) {
    const state = get();
    if (event === 'timer:sync' && state.coFocus.sessionTimerMode === 'locked' && !state.coFocus.isHost) {
      // Apply host's timer action
      const { action, timeRemaining, mode } = payload;
      if (action === 'start') state.startPomodoro();
      else if (action === 'pause') state.pausePomodoro();
      else if (action === 'reset') state.resetPomodoro();
      else if (action === 'skip') state.skipPomodoro();
      // Snap time to host's value
      set((s: any) => ({
        pomodoro: { ...s.pomodoro, timeRemaining },
      }));
    } else if (event === 'chat:message') {
      const msg: ChatMessage = {
        id: uuid(),
        sessionId: state.coFocus.activeSessionId || '',
        userId: payload.userId,
        displayName: payload.displayName,
        content: payload.content,
        createdAt: payload.timestamp || new Date().toISOString(),
      };
      set((s: any) => ({
        coFocus: {
          ...s.coFocus,
          chatMessages: [...s.coFocus.chatMessages, msg],
          unreadCount: s.coFocus.chatOpen ? s.coFocus.unreadCount : s.coFocus.unreadCount + 1,
        },
      }));
    } else if (event === 'session:end') {
      // Host ended — clean up
      rt.unsubscribeFromSession();
      set((s: any) => ({
        coFocus: {
          ...s.coFocus,
          activeSessionId: null,
          isHost: false,
          sessionHostId: null,
          sessionInviteCode: null,
          participants: {},
          chatMessages: [],
          unreadCount: 0,
        },
      }));
    } else if (event === 'scene:change') {
      // Another participant changed the scene
      const { sceneKey } = payload;
      if (sceneKey) {
        set((s: any) => ({
          coFocus: { ...s.coFocus, sessionSceneKey: sceneKey },
        }));
      }
    } else if (event === 'room:empty') {
      // All participants left (tab close detection) — close the room
      const isHost = state.coFocus.isHost;
      if (isHost) {
        // Host detected empty room — end session
        rt.broadcastSessionEnd('Room empty — all participants left');
        const sessionId = state.coFocus.activeSessionId;
        if (sessionId) sync.endSession(sessionId);
      }
      rt.unsubscribeFromSession();
      set((s: any) => ({
        coFocus: {
          ...s.coFocus,
          activeSessionId: null,
          isHost: false,
          sessionHostId: null,
          sessionInviteCode: null,
          participants: {},
          chatMessages: [],
          unreadCount: 0,
        },
      }));
    }
  }

  return {
    // ─── Profile ──────────────────────────────────────────────────────────
    initCoFocusProfile: async () => {
      const sb = sync.getSupabaseClient();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const profile = await sync.ensureProfile(user.id, user.email?.split('@')[0] || '');
      if (profile) {
        set((s: any) => ({
          coFocus: {
            ...s.coFocus,
            myInviteCode: profile.invite_code,
            myDisplayName: profile.display_name,
          },
        }));
      }
    },

    updateCoFocusDisplayName: async (name: string) => {
      const sb = sync.getSupabaseClient();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      await sync.updateDisplayName(user.id, name);
      set((s: any) => ({
        coFocus: { ...s.coFocus, myDisplayName: name },
      }));
    },

    // ─── Friends ──────────────────────────────────────────────────────────
    loadFriends: async () => {
      const sb = sync.getSupabaseClient();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const friends = await sync.loadFriends(user.id);
      set((s: any) => ({
        coFocus: { ...s.coFocus, friends, friendsLoaded: true },
      }));
    },

    sendFriendRequest: async (emailOrCode: string) => {
      const sb = sync.getSupabaseClient();
      if (!sb) return { error: 'Not connected' };
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return { error: 'Not signed in' };

      const isEmail = emailOrCode.includes('@');
      const result = isEmail
        ? await sync.sendFriendRequestByEmail(user.id, emailOrCode)
        : await sync.sendFriendRequestByCode(user.id, emailOrCode);

      if (!result.error) {
        // Reload friends list
        const friends = await sync.loadFriends(user.id);
        set((s: any) => ({ coFocus: { ...s.coFocus, friends } }));
      }
      return result;
    },

    acceptFriendRequest: async (requestId: string, friendUserId: string) => {
      const sb = sync.getSupabaseClient();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      await sync.acceptFriendRequest(requestId, user.id, friendUserId);
      const friends = await sync.loadFriends(user.id);
      set((s: any) => ({ coFocus: { ...s.coFocus, friends } }));
    },

    rejectFriendRequest: async (requestId: string) => {
      const sb = sync.getSupabaseClient();
      if (!sb) return;
      await sync.rejectFriendRequest(requestId);
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      const friends = await sync.loadFriends(user.id);
      set((s: any) => ({ coFocus: { ...s.coFocus, friends } }));
    },

    removeFriend: async (friendUserId: string) => {
      const sb = sync.getSupabaseClient();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;
      await sync.removeFriend(user.id, friendUserId);
      const friends = await sync.loadFriends(user.id);
      set((s: any) => ({ coFocus: { ...s.coFocus, friends } }));
    },

    // ─── Session ──────────────────────────────────────────────────────────
    createSession: async (timerMode: 'locked' | 'independent') => {
      // Guard: already in a session
      if (get().coFocus.activeSessionId) return null;

      const sb = sync.getSupabaseClient();
      if (!sb) return null;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return null;

      const sceneKey = get().coFocus.sessionSceneKey || 'campfire';
      const session = await sync.createSession(user.id, timerMode, sceneKey);
      if (!session) return null;

      set((s: any) => ({
        coFocus: {
          ...s.coFocus,
          activeSessionId: session.id,
          isHost: true,
          sessionHostId: user.id,
          sessionTimerMode: timerMode,
          sessionInviteCode: session.invite_code,
          sessionSceneKey: session.scene_key,
          chatMessages: [],
          unreadCount: 0,
          coFocusPanelOpen: true,
        },
      }));

      // Subscribe to realtime
      rt.subscribeToSession(session.id, handlePresenceSync, handleBroadcast);
      return session;
    },

    joinSession: async (inviteCode: string) => {
      // Guard: already in a session
      if (get().coFocus.activeSessionId) return { error: 'Already in a session' };

      const sb = sync.getSupabaseClient();
      if (!sb) return { error: 'Not connected' };
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return { error: 'Not signed in' };

      const { session, error } = await sync.joinSessionByCode(user.id, inviteCode);
      if (error || !session) return { error: error || 'Unknown error' };

      // Load recent messages
      const messages = await sync.loadRecentMessages(session.id);

      set((s: any) => ({
        coFocus: {
          ...s.coFocus,
          activeSessionId: session.id,
          isHost: false,
          sessionHostId: session.host_id,
          sessionTimerMode: session.timer_mode,
          sessionInviteCode: session.invite_code,
          sessionSceneKey: session.scene_key,
          chatMessages: messages.map((m: any) => ({
            id: m.id,
            sessionId: m.session_id,
            userId: m.user_id,
            displayName: '',
            content: m.content,
            createdAt: m.created_at,
          })),
          unreadCount: 0,
          coFocusPanelOpen: true,
        },
      }));

      rt.subscribeToSession(session.id, handlePresenceSync, handleBroadcast);
      return { error: null };
    },

    leaveSession: async () => {
      const state = get();
      const sessionId = state.coFocus.activeSessionId;
      if (!sessionId) return;

      const sb = sync.getSupabaseClient();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      if (state.coFocus.isHost) {
        // Host ending — broadcast and close
        rt.broadcastSessionEnd('Host ended the session');
        await sync.endSession(sessionId);
      } else {
        await sync.leaveSession(sessionId, user.id);
      }

      rt.unsubscribeFromSession();
      set((s: any) => ({
        coFocus: {
          ...s.coFocus,
          activeSessionId: null,
          isHost: false,
          sessionHostId: null,
          sessionInviteCode: null,
          participants: {},
          chatMessages: [],
          unreadCount: 0,
        },
      }));
    },

    // ─── Timer Broadcast (locked mode, host only) ─────────────────────────
    broadcastTimerAction: (action: 'start' | 'pause' | 'reset' | 'skip') => {
      const state = get();
      if (!state.coFocus.isHost || state.coFocus.sessionTimerMode !== 'locked') return;
      rt.broadcastTimerSync({
        action,
        timeRemaining: state.pomodoro.timeRemaining,
        mode: state.pomodoro.mode,
      });
    },

    // ─── Chat ─────────────────────────────────────────────────────────────
    sendChatMessage: async (content: string) => {
      const state = get();
      const sessionId = state.coFocus.activeSessionId;
      if (!sessionId || !content.trim()) return;

      const sb = sync.getSupabaseClient();
      if (!sb) return;
      const { data: { user } } = await sb.auth.getUser();
      if (!user) return;

      const displayName = state.coFocus.myDisplayName || 'Anonymous';

      // Broadcast to channel
      rt.broadcastChatMessage({
        userId: user.id,
        displayName,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      });

      // Persist to DB
      await sync.sendMessage(sessionId, user.id, content.trim());

      // Add to local state
      const msg: ChatMessage = {
        id: uuid(),
        sessionId,
        userId: user.id,
        displayName,
        content: content.trim(),
        createdAt: new Date().toISOString(),
      };
      set((s: any) => ({
        coFocus: {
          ...s.coFocus,
          chatMessages: [...s.coFocus.chatMessages, msg],
        },
      }));
    },

    setChatOpen: (open: boolean) => {
      set((s: any) => ({
        coFocus: {
          ...s.coFocus,
          chatOpen: open,
          unreadCount: open ? 0 : s.coFocus.unreadCount,
        },
      }));
    },

    // ─── UI toggles ──────────────────────────────────────────────────────
    setCoFocusPanelOpen: (open: boolean) => {
      set((s: any) => ({
        coFocus: { ...s.coFocus, coFocusPanelOpen: open },
      }));
    },

    setShowFriendModal: (show: boolean) => {
      set((s: any) => ({
        coFocus: { ...s.coFocus, showFriendModal: show },
      }));
    },

    setShowSessionModal: (show: boolean) => {
      set((s: any) => ({
        coFocus: { ...s.coFocus, showSessionModal: show },
      }));
    },

    setTaskChainSharing: (sharing: boolean) => {
      set((s: any) => ({
        coFocus: { ...s.coFocus, taskChainSharing: sharing },
      }));
    },

    // ─── Audio ─────────────────────────────────────────────────────────
    setAudioNoiseType: (type: 'off' | 'white' | 'brown' | 'pink') => {
      localStorage.setItem('cofocus-noise-type', type);
      set((s: any) => ({ coFocus: { ...s.coFocus, audioNoiseType: type } }));
    },
    setAudioNoiseVolume: (vol: number) => {
      localStorage.setItem('cofocus-noise-vol', String(vol));
      set((s: any) => ({ coFocus: { ...s.coFocus, audioNoiseVolume: vol } }));
    },
    setAudioAmbientOn: (on: boolean) => {
      localStorage.setItem('cofocus-ambient-on', String(on));
      set((s: any) => ({ coFocus: { ...s.coFocus, audioAmbientOn: on } }));
    },
    setAudioAmbientVolume: (vol: number) => {
      localStorage.setItem('cofocus-ambient-vol', String(vol));
      set((s: any) => ({ coFocus: { ...s.coFocus, audioAmbientVolume: vol } }));
    },

    // ─── Visual ─────────────────────────────────────────────────────────
    setSceneBlur: (blur: number) => {
      localStorage.setItem('cofocus-scene-blur', String(blur));
      set((s: any) => ({ coFocus: { ...s.coFocus, sceneBlur: blur } }));
    },
    setCreatureBlurEnabled: (enabled: boolean) => {
      localStorage.setItem('cofocus-creature-blur', String(enabled));
      set((s: any) => ({ coFocus: { ...s.coFocus, creatureBlurEnabled: enabled } }));
    },

    // ─── Noise params ───────────────────────────────────────────────────
    setNoiseLowCut: (hz: number) => {
      localStorage.setItem('cofocus-noise-lowcut', String(hz));
      set((s: any) => ({ coFocus: { ...s.coFocus, noiseLowCut: hz } }));
    },
    setNoiseHighCut: (hz: number) => {
      localStorage.setItem('cofocus-noise-highcut', String(hz));
      set((s: any) => ({ coFocus: { ...s.coFocus, noiseHighCut: hz } }));
    },
  };
}
