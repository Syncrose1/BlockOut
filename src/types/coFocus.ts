// ─── Co-Focus Types ──────────────────────────────────────────────────────────

export interface CoFocusProfile {
  userId: string;
  displayName: string;
  inviteCode: string;
}

export interface Friend {
  id: string;          // row ID in cofocus_friends
  userId: string;      // the friend's user ID
  displayName: string; // from their cofocus profile
  status: 'pending' | 'accepted' | 'blocked';
  direction: 'outgoing' | 'incoming'; // did I send or receive the request?
  createdAt: string;
}

export interface CoFocusSession {
  id: string;
  hostId: string;
  timerMode: 'shared' | 'independent';
  sceneKey: string;
  status: 'active' | 'ended';
  maxParticipants: number;
  inviteCode: string;
  createdAt: string;
  endedAt?: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  userId: string;
  displayName: string;
  content: string;
  createdAt: string;
  isSystem?: boolean;
}

// ─── Presence (ephemeral, via Supabase Realtime) ────────────────────────────

export interface CoFocusPresence {
  userId: string;
  displayName: string;
  timerMode: 'work' | 'break' | 'longBreak';
  anchorValue: number;        // timeRemaining (pomodoro/timer) or elapsed (stopwatch) at moment of event
  anchorTimestamp: number;    // Date.now() when anchor was set
  isRunning: boolean;
  activeTimerMode: 'pomodoro' | 'timer' | 'stopwatch';
  lastTaskCompletedAt?: number; // timestamp of most recent task completion
  taskChainVisible: boolean;
  taskChainSteps?: { title: string; completed: boolean; isSubtask?: boolean }[];
  synamonSpeciesId?: string;
  synamonStage?: number;
  synamonMood?: string;
  sessionsCompletedToday: number;
  totalFocusTimeToday: number;
}

export interface CoFocusParticipant extends CoFocusPresence {
  slotIndex: number;
}

// ─── Invites ─────────────────────────────────────────────────────────────────

export interface CoFocusInvite {
  id: string;
  fromUserId: string;
  fromDisplayName: string;
  sessionId: string | null;
  timerMode: 'shared' | 'independent';
  createdAt: string;
}

// ─── Store State ────────────────────────────────────────────────────────────

export interface CoFocusState {
  // Friends
  friends: Friend[];
  friendsLoaded: boolean;
  friendOnlineStatus: Record<string, boolean>; // userId → isOnline
  myInviteCode: string | null;
  myDisplayName: string;

  // Session
  activeSessionId: string | null;
  isHost: boolean;
  sessionHostId: string | null;
  sessionTimerMode: 'shared' | 'independent';
  sessionInviteCode: string | null;
  sessionSceneKey: string;
  participants: Record<string, CoFocusParticipant>;

  // Invites
  pendingInvites: CoFocusInvite[];
  showInviteModal: boolean;

  // Chat
  chatMessages: ChatMessage[];
  chatOpen: boolean;
  unreadCount: number;

  // Audio
  audioNoiseType: 'off' | 'white' | 'brown' | 'pink';
  audioNoiseVolume: number;
  audioAmbientOn: boolean;
  audioAmbientVolume: number;

  // Visual
  sceneBlur: number;            // 0–5 px, default 0.4
  creatureBlurEnabled: boolean; // default false

  // Noise params
  noiseLowCut: number;   // highpass Hz (20–2000)
  noiseHighCut: number;  // lowpass Hz (200–20000)

  // UI
  coFocusPanelOpen: boolean;
  showFriendModal: boolean;
  showSessionModal: boolean;
  taskChainSharing: boolean;

  // Connection / rejoin
  connectionState: 'connected' | 'reconnecting' | 'disconnected';
  lastInviteCode: string | null;        // remembered across rejoins for the SessionModal hint
  lastSessionEndedNotice: string | null; // human-readable note when a rehydrated session is no longer active
}

export const initialCoFocusState: CoFocusState = {
  friends: [],
  friendsLoaded: false,
  friendOnlineStatus: {},
  myInviteCode: null,
  myDisplayName: '',

  activeSessionId: null,
  isHost: false,
  sessionHostId: null,
  sessionTimerMode: 'shared',
  sessionInviteCode: null,
  sessionSceneKey: 'campfire',
  participants: {},

  pendingInvites: [],
  showInviteModal: false,

  chatMessages: [],
  chatOpen: false,
  unreadCount: 0,

  audioNoiseType: (localStorage.getItem('cofocus-noise-type') as 'off' | 'white' | 'brown' | 'pink') || 'off',
  audioNoiseVolume: parseFloat(localStorage.getItem('cofocus-noise-vol') || '0.3'),
  audioAmbientOn: localStorage.getItem('cofocus-ambient-on') !== 'false',
  audioAmbientVolume: parseFloat(localStorage.getItem('cofocus-ambient-vol') || '0.5'),

  sceneBlur: parseFloat(localStorage.getItem('cofocus-scene-blur') || '0.4'),
  creatureBlurEnabled: localStorage.getItem('cofocus-creature-blur') === 'true',

  noiseLowCut: parseFloat(localStorage.getItem('cofocus-noise-lowcut') || '20'),
  noiseHighCut: parseFloat(localStorage.getItem('cofocus-noise-highcut') || '20000'),

  coFocusPanelOpen: false,
  showFriendModal: false,
  showSessionModal: false,
  taskChainSharing: localStorage.getItem('cofocus-taskchain-sharing') !== 'false',

  connectionState: 'disconnected',
  lastInviteCode: localStorage.getItem('cofocus-last-invite-code'),
  lastSessionEndedNotice: null,
};
