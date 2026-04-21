-- ============================================================================
-- Co-Focus: Invites + Online Status
-- ============================================================================

-- ─── Online status: last_seen_at on profiles ─────────────────────────────────
alter table cofocus_user_profiles
  add column if not exists last_seen_at timestamptz;

-- ─── Timer mode: allow 'shared' alongside 'locked' ──────────────────────────
-- Drop the old check constraint and add a new one that accepts 'shared'
alter table cofocus_sessions
  drop constraint if exists cofocus_sessions_timer_mode_check;
alter table cofocus_sessions
  add constraint cofocus_sessions_timer_mode_check
  check (timer_mode in ('locked', 'shared', 'independent'));

-- ─── Invites ─────────────────────────────────────────────────────────────────
create table if not exists cofocus_invites (
  id            uuid primary key default gen_random_uuid(),
  from_user_id  uuid not null references auth.users(id) on delete cascade,
  to_user_id    uuid not null references auth.users(id) on delete cascade,
  session_id    uuid references cofocus_sessions(id) on delete set null,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined', 'expired')),
  timer_mode    text not null default 'shared'
                check (timer_mode in ('shared', 'independent')),
  created_at    timestamptz not null default now()
);

alter table cofocus_invites enable row level security;

-- Sender and recipient can see the invite
create policy "cofocus_invites_select" on cofocus_invites
  for select to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Only the sender can create
create policy "cofocus_invites_insert" on cofocus_invites
  for insert to authenticated
  with check (auth.uid() = from_user_id);

-- Either side can update (accept/decline/expire)
create policy "cofocus_invites_update" on cofocus_invites
  for update to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

-- Either side can delete
create policy "cofocus_invites_delete" on cofocus_invites
  for delete to authenticated
  using (auth.uid() = from_user_id or auth.uid() = to_user_id);

create index cofocus_invites_to_user_idx on cofocus_invites (to_user_id, status)
  where status = 'pending';
create index cofocus_invites_from_user_idx on cofocus_invites (from_user_id, status);

-- Enable realtime on cofocus_invites so clients get INSERT/UPDATE notifications
alter publication supabase_realtime add table cofocus_invites;

-- ─── Security-definer helper: add a participant to a session ─────────────────
-- Needed when user A accepts an invite and needs to add user B (the inviter)
-- to the session, bypassing the RLS rule that only allows self-insert.
create or replace function cofocus_add_participant(p_session_id uuid, p_user_id uuid)
returns void
language sql
security definer
as $$
  insert into cofocus_session_participants (session_id, user_id)
  values (p_session_id, p_user_id)
  on conflict (session_id, user_id) do update set left_at = null;
$$;

-- ─── Update session: allow any participant to update timer_mode ──────────────
-- Drop old update policy (host-only) and replace with participant-based
drop policy if exists "cofocus_sessions_update" on cofocus_sessions;
create policy "cofocus_sessions_update" on cofocus_sessions
  for update to authenticated using (
    auth.uid() = host_id
    or cofocus_is_session_member(id, auth.uid())
  );
