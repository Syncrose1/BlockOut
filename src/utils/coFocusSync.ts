/**
 * Co-Focus Supabase CRUD helpers.
 * Handles profiles, friends, sessions, participants, and messages.
 */

import { getSupabaseClient as getBaseClient } from './supabase';

export function getSupabaseClient() {
  return getBaseClient();
}

// ─── Profile ────────────────────────────────────────────────────────────────

export async function ensureProfile(userId: string, displayName?: string) {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const { data: existing } = await (sb as any)
    .from('cofocus_user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (existing) return existing;

  const { data, error } = await (sb as any)
    .from('cofocus_user_profiles')
    .insert({ user_id: userId, display_name: displayName || '' })
    .select()
    .single();

  if (error) console.error('[co-focus] ensureProfile error:', error);
  return data;
}

export async function updateDisplayName(userId: string, displayName: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await (sb as any)
    .from('cofocus_user_profiles')
    .update({ display_name: displayName })
    .eq('user_id', userId);
}

export async function getProfile(userId: string) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await (sb as any)
    .from('cofocus_user_profiles')
    .select('*')
    .eq('user_id', userId)
    .single();
  return data;
}

// ─── Friends ────────────────────────────────────────────────────────────────

export async function loadFriends(userId: string) {
  const sb = getSupabaseClient();
  if (!sb) return [];

  const { data, error } = await (sb as any)
    .from('cofocus_friends')
    .select('*')
    .or(`user_id.eq.${userId},friend_id.eq.${userId}`);

  if (error) { console.error('[co-focus] loadFriends error:', error); return []; }
  if (!data) return [];

  // Collect friend user IDs to look up display names
  const friendUserIds = (data as any[]).map((row: any) =>
    row.user_id === userId ? row.friend_id : row.user_id
  );

  const { data: profiles } = await (sb as any)
    .from('cofocus_user_profiles')
    .select('user_id, display_name')
    .in('user_id', friendUserIds);

  const profileMap: Record<string, string> = {};
  for (const p of (profiles || []) as any[]) {
    profileMap[p.user_id] = p.display_name || '';
  }

  return (data as any[]).map((row: any) => {
    const isOutgoing = row.user_id === userId;
    const friendId = isOutgoing ? row.friend_id : row.user_id;
    return {
      id: row.id,
      userId: friendId,
      displayName: profileMap[friendId] || '',
      status: row.status as 'pending' | 'accepted' | 'blocked',
      direction: isOutgoing ? 'outgoing' as const : 'incoming' as const,
      createdAt: row.created_at,
    };
  });
}

export async function sendFriendRequestByEmail(myUserId: string, email: string) {
  const sb = getSupabaseClient();
  if (!sb) return { error: 'No Supabase client' };

  const { data: foundUserId, error: lookupErr } = await sb
    .rpc('cofocus_find_user_by_email', { lookup_email: email });

  if (lookupErr || !foundUserId) return { error: 'User not found' };
  if (foundUserId === myUserId) return { error: 'Cannot add yourself' };

  return insertFriendRequest(myUserId, foundUserId as string);
}

export async function sendFriendRequestByCode(myUserId: string, code: string) {
  const sb = getSupabaseClient();
  if (!sb) return { error: 'No Supabase client' };

  const { data, error: lookupErr } = await sb
    .rpc('cofocus_find_user_by_invite_code', { code });

  if (lookupErr || !data || (data as any[]).length === 0) return { error: 'Invite code not found' };
  const friendUserId = (data as any[])[0].user_id;
  if (friendUserId === myUserId) return { error: 'Cannot add yourself' };

  return insertFriendRequest(myUserId, friendUserId);
}

async function insertFriendRequest(myUserId: string, friendUserId: string) {
  const sb = getSupabaseClient();
  if (!sb) return { error: 'No Supabase client' };

  // Check if relationship already exists
  const { data: existing } = await (sb as any)
    .from('cofocus_friends')
    .select('id, status')
    .or(`and(user_id.eq.${myUserId},friend_id.eq.${friendUserId}),and(user_id.eq.${friendUserId},friend_id.eq.${myUserId})`);

  if (existing && (existing as any[]).length > 0) {
    return { error: 'Friend request already exists' };
  }

  const { error } = await (sb as any)
    .from('cofocus_friends')
    .insert({ user_id: myUserId, friend_id: friendUserId });

  if (error) return { error: error.message };
  return { error: null };
}

export async function acceptFriendRequest(requestId: string) {
  const sb = getSupabaseClient();
  if (!sb) return;

  // Just update the existing row — no duplicate insert needed.
  // loadFriends already handles bidirectional lookup.
  await (sb as any)
    .from('cofocus_friends')
    .update({ status: 'accepted' })
    .eq('id', requestId);
}

export async function rejectFriendRequest(requestId: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await (sb as any).from('cofocus_friends').delete().eq('id', requestId);
}

export async function removeFriend(myUserId: string, friendUserId: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await (sb as any)
    .from('cofocus_friends')
    .delete()
    .or(`and(user_id.eq.${myUserId},friend_id.eq.${friendUserId}),and(user_id.eq.${friendUserId},friend_id.eq.${myUserId})`);
}

// ─── Sessions ───────────────────────────────────────────────────────────────

export async function createSession(hostId: string, timerMode: 'shared' | 'independent', sceneKey = 'campfire') {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const { data, error } = await (sb as any)
    .from('cofocus_sessions')
    .insert({ host_id: hostId, timer_mode: timerMode, scene_key: sceneKey })
    .select()
    .single();

  if (error) { console.error('[co-focus] createSession error:', error); return null; }

  await (sb as any)
    .from('cofocus_session_participants')
    .insert({ session_id: data.id, user_id: hostId });

  return data;
}

export async function joinSessionByCode(userId: string, inviteCode: string) {
  const sb = getSupabaseClient();
  if (!sb) return { session: null, error: 'No Supabase client' };

  const { data: session, error: findErr } = await (sb as any)
    .from('cofocus_sessions')
    .select('*')
    .eq('invite_code', inviteCode)
    .eq('status', 'active')
    .single();

  if (findErr || !session) return { session: null, error: 'Session not found' };

  const { count } = await (sb as any)
    .from('cofocus_session_participants')
    .select('*', { count: 'exact', head: true })
    .eq('session_id', session.id)
    .is('left_at', null);

  if ((count ?? 0) >= session.max_participants) {
    return { session: null, error: 'Session is full' };
  }

  // Upsert: if user already has a row (e.g. tab closed without leaving), re-activate it
  const { error: joinErr } = await (sb as any)
    .from('cofocus_session_participants')
    .upsert(
      { session_id: session.id, user_id: userId, left_at: null },
      { onConflict: 'session_id,user_id' }
    );

  if (joinErr) return { session: null, error: joinErr.message };
  return { session, error: null };
}

export async function leaveSession(sessionId: string, userId: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await (sb as any)
    .from('cofocus_session_participants')
    .update({ left_at: new Date().toISOString() })
    .eq('session_id', sessionId)
    .eq('user_id', userId);
}

export async function endSession(sessionId: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await (sb as any)
    .from('cofocus_sessions')
    .update({ status: 'ended', ended_at: new Date().toISOString() })
    .eq('id', sessionId);
}

// ─── Messages ───────────────────────────────────────────────────────────────

export async function sendMessage(sessionId: string, userId: string, content: string) {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const { data, error } = await (sb as any)
    .from('cofocus_messages')
    .insert({ session_id: sessionId, user_id: userId, content })
    .select()
    .single();

  if (error) { console.error('[co-focus] sendMessage error:', error); return null; }
  return data;
}

export async function loadRecentMessages(sessionId: string, limit = 50) {
  const sb = getSupabaseClient();
  if (!sb) return [];

  const { data } = await (sb as any)
    .from('cofocus_messages')
    .select('*')
    .eq('session_id', sessionId)
    .order('created_at', { ascending: true })
    .limit(limit);

  return data || [];
}

// ─── Online Heartbeat ────────────────────────────────────────────────────────

let heartbeatTimer: ReturnType<typeof setInterval> | null = null;

export function startOnlineHeartbeat(userId: string) {
  // Send immediately, then every 30s
  updateLastSeen(userId);
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => updateLastSeen(userId), 30000);
}

export function stopOnlineHeartbeat() {
  if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
}

async function updateLastSeen(userId: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await (sb as any)
    .from('cofocus_user_profiles')
    .update({ last_seen_at: new Date().toISOString() })
    .eq('user_id', userId);
}

export async function getFriendOnlineStatuses(friendUserIds: string[]): Promise<Record<string, boolean>> {
  const sb = getSupabaseClient();
  if (!sb || friendUserIds.length === 0) return {};
  const twoMinAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data } = await (sb as any)
    .from('cofocus_user_profiles')
    .select('user_id, last_seen_at')
    .in('user_id', friendUserIds);
  const result: Record<string, boolean> = {};
  for (const row of (data || []) as any[]) {
    result[row.user_id] = !!row.last_seen_at && row.last_seen_at > twoMinAgo;
  }
  return result;
}

// ─── Invites ─────────────────────────────────────────────────────────────────

export async function sendCoFocusInvite(
  fromUserId: string,
  toUserId: string,
  sessionId: string | null,
  timerMode: 'shared' | 'independent' = 'shared',
) {
  const sb = getSupabaseClient();
  if (!sb) return { error: 'No Supabase client' };

  // Expire any existing pending invites from me to this user
  await (sb as any)
    .from('cofocus_invites')
    .update({ status: 'expired' })
    .eq('from_user_id', fromUserId)
    .eq('to_user_id', toUserId)
    .eq('status', 'pending');

  const { data, error } = await (sb as any)
    .from('cofocus_invites')
    .insert({
      from_user_id: fromUserId,
      to_user_id: toUserId,
      session_id: sessionId,
      timer_mode: timerMode,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { error: null, invite: data };
}

export async function loadPendingInvites(userId: string) {
  const sb = getSupabaseClient();
  if (!sb) return [];

  // Load pending invites TO me, with sender display names
  const { data } = await (sb as any)
    .from('cofocus_invites')
    .select('*, cofocus_user_profiles!cofocus_invites_from_user_id_fkey(display_name)')
    .eq('to_user_id', userId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false });

  if (!data) return [];

  return (data as any[]).map(row => ({
    id: row.id,
    fromUserId: row.from_user_id,
    fromDisplayName: row.cofocus_user_profiles?.display_name || 'Someone',
    sessionId: row.session_id,
    timerMode: row.timer_mode,
    createdAt: row.created_at,
  }));
}

export async function respondToInvite(inviteId: string, accept: boolean, sessionId?: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  const update: any = { status: accept ? 'accepted' : 'declined' };
  if (sessionId) update.session_id = sessionId;
  await (sb as any)
    .from('cofocus_invites')
    .update(update)
    .eq('id', inviteId);
}

// Add a participant to a session via security-definer function (bypasses RLS)
export async function addParticipantRpc(sessionId: string, userId: string) {
  const sb = getSupabaseClient();
  if (!sb) return;
  await (sb as any).rpc('cofocus_add_participant', {
    p_session_id: sessionId,
    p_user_id: userId,
  });
}

// Look up a session by ID (for invite acceptance)
export async function getSessionById(sessionId: string) {
  const sb = getSupabaseClient();
  if (!sb) return null;
  const { data } = await (sb as any)
    .from('cofocus_sessions')
    .select('*')
    .eq('id', sessionId)
    .eq('status', 'active')
    .single();
  return data;
}

export async function updateSessionTimerMode(sessionId: string, timerMode: 'shared' | 'independent') {
  const sb = getSupabaseClient();
  if (!sb) return;
  await (sb as any)
    .from('cofocus_sessions')
    .update({ timer_mode: timerMode })
    .eq('id', sessionId);
}

export async function subscribeToInvites(
  userId: string,
  onIncomingInvite: (invite: any) => void,
  onInviteAccepted: (invite: any) => void,
) {
  const sb = getSupabaseClient();
  if (!sb) return null;

  const channel = sb.channel(`cofocus-invites:${userId}`)
    // New incoming invites (I'm the recipient)
    .on(
      'postgres_changes' as any,
      {
        event: 'INSERT',
        schema: 'public',
        table: 'cofocus_invites',
        filter: `to_user_id=eq.${userId}`,
      },
      (payload: any) => {
        if (payload.new?.status === 'pending') {
          onIncomingInvite(payload.new);
        }
      },
    )
    // My sent invite was accepted (I'm the sender) — auto-join the session
    .on(
      'postgres_changes' as any,
      {
        event: 'UPDATE',
        schema: 'public',
        table: 'cofocus_invites',
        filter: `from_user_id=eq.${userId}`,
      },
      (payload: any) => {
        if (payload.new?.status === 'accepted' && payload.new?.session_id) {
          onInviteAccepted(payload.new);
        }
      },
    )
    .subscribe();

  return channel;
}

export function unsubscribeFromInvites(channel: any) {
  const sb = getSupabaseClient();
  if (!sb || !channel) return;
  sb.removeChannel(channel);
}
