-- ============================================================================
-- Co-Focus: Live Collaborative Focus Sessions
-- ============================================================================

-- ─── User Profiles ──────────────────────────────────────────────────────────
-- Lightweight public profile for friend discovery (invite codes + email lookup)
create table if not exists cofocus_user_profiles (
  user_id       uuid primary key references auth.users(id) on delete cascade,
  display_name  text not null default '',
  invite_code   text unique not null default encode(gen_random_bytes(6), 'hex'),
  created_at    timestamptz not null default now()
);

alter table cofocus_user_profiles enable row level security;

create policy "cofocus_profiles_select" on cofocus_user_profiles
  for select to authenticated using (true);

create policy "cofocus_profiles_insert" on cofocus_user_profiles
  for insert to authenticated with check (auth.uid() = user_id);

create policy "cofocus_profiles_update" on cofocus_user_profiles
  for update to authenticated using (auth.uid() = user_id);

create policy "cofocus_profiles_delete" on cofocus_user_profiles
  for delete to authenticated using (auth.uid() = user_id);

-- ─── Friends ────────────────────────────────────────────────────────────────
-- Bidirectional friend relationships. Pending = single row; accepted = two rows.
create table if not exists cofocus_friends (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  friend_id     uuid not null references auth.users(id) on delete cascade,
  status        text not null default 'pending'
                check (status in ('pending', 'accepted', 'blocked')),
  created_at    timestamptz not null default now(),
  unique(user_id, friend_id)
);

alter table cofocus_friends enable row level security;

-- Both sides can see the relationship
create policy "cofocus_friends_select" on cofocus_friends
  for select to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

-- Only the sender can create a request
create policy "cofocus_friends_insert" on cofocus_friends
  for insert to authenticated
  with check (auth.uid() = user_id);

-- Only the recipient can accept/reject (update status)
create policy "cofocus_friends_update" on cofocus_friends
  for update to authenticated
  using (auth.uid() = friend_id);

-- Either side can remove the friendship
create policy "cofocus_friends_delete" on cofocus_friends
  for delete to authenticated
  using (auth.uid() = user_id or auth.uid() = friend_id);

create index cofocus_friends_user_idx on cofocus_friends (user_id, status);
create index cofocus_friends_friend_idx on cofocus_friends (friend_id, status);

-- ─── Sessions ───────────────────────────────────────────────────────────────
create table if not exists cofocus_sessions (
  id              uuid primary key default gen_random_uuid(),
  host_id         uuid not null references auth.users(id) on delete cascade,
  timer_mode      text not null default 'locked'
                  check (timer_mode in ('locked', 'independent')),
  scene_key       text not null default 'campfire',
  status          text not null default 'active'
                  check (status in ('active', 'ended')),
  max_participants smallint not null default 5,
  invite_code     text unique not null default encode(gen_random_bytes(4), 'hex'),
  created_at      timestamptz not null default now(),
  ended_at        timestamptz
);

alter table cofocus_sessions enable row level security;

-- Participants can see sessions they're part of (via join table)
create policy "cofocus_sessions_select" on cofocus_sessions
  for select to authenticated using (
    auth.uid() = host_id
    or exists (
      select 1 from cofocus_session_participants
      where session_id = id and user_id = auth.uid() and left_at is null
    )
  );

-- Anyone authenticated can select by invite code (for joining)
create policy "cofocus_sessions_select_by_invite" on cofocus_sessions
  for select to authenticated using (status = 'active');

create policy "cofocus_sessions_insert" on cofocus_sessions
  for insert to authenticated with check (auth.uid() = host_id);

create policy "cofocus_sessions_update" on cofocus_sessions
  for update to authenticated using (auth.uid() = host_id);

create index cofocus_sessions_host_idx on cofocus_sessions (host_id, status);
create index cofocus_sessions_invite_idx on cofocus_sessions (invite_code) where status = 'active';

-- ─── Session Participants ───────────────────────────────────────────────────
create table if not exists cofocus_session_participants (
  session_id  uuid not null references cofocus_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  joined_at   timestamptz not null default now(),
  left_at     timestamptz,
  primary key (session_id, user_id)
);

alter table cofocus_session_participants enable row level security;

create policy "cofocus_participants_select" on cofocus_session_participants
  for select to authenticated using (
    exists (
      select 1 from cofocus_session_participants p2
      where p2.session_id = session_id and p2.user_id = auth.uid()
    )
  );

create policy "cofocus_participants_insert" on cofocus_session_participants
  for insert to authenticated with check (auth.uid() = user_id);

create policy "cofocus_participants_update" on cofocus_session_participants
  for update to authenticated using (auth.uid() = user_id);

create index cofocus_participants_user_idx on cofocus_session_participants (user_id) where left_at is null;

-- ─── Messages ───────────────────────────────────────────────────────────────
create table if not exists cofocus_messages (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references cofocus_sessions(id) on delete cascade,
  user_id     uuid not null references auth.users(id) on delete cascade,
  content     text not null check (char_length(content) <= 500),
  created_at  timestamptz not null default now()
);

alter table cofocus_messages enable row level security;

create policy "cofocus_messages_select" on cofocus_messages
  for select to authenticated using (
    exists (
      select 1 from cofocus_session_participants
      where session_id = cofocus_messages.session_id and user_id = auth.uid() and left_at is null
    )
  );

create policy "cofocus_messages_insert" on cofocus_messages
  for insert to authenticated with check (auth.uid() = user_id);

create index cofocus_messages_session_idx on cofocus_messages (session_id, created_at desc);

-- ─── SQL Function: Find user by email ───────────────────────────────────────
-- Returns user_id if the user has a cofocus profile (safe, doesn't expose auth.users)
create or replace function cofocus_find_user_by_email(lookup_email text)
returns uuid
language sql
security definer
stable
as $$
  select cup.user_id
  from cofocus_user_profiles cup
  join auth.users au on au.id = cup.user_id
  where au.email = lower(lookup_email)
  limit 1;
$$;

-- ─── SQL Function: Find user by invite code ─────────────────────────────────
create or replace function cofocus_find_user_by_invite_code(code text)
returns table(user_id uuid, display_name text)
language sql
security definer
stable
as $$
  select cup.user_id, cup.display_name
  from cofocus_user_profiles cup
  where cup.invite_code = code
  limit 1;
$$;
