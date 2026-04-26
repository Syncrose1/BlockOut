-- ─────────────────────────────────────────────────────────────────────────────
-- Synamon — per-user state (team composition, equipped deck, owned cards)
--
-- Why this exists:
--   These three pieces of state were previously persisted only in localStorage,
--   so signing in on a new device would re-prompt the starter flow and drop
--   any deck/team customisation. This table is the cross-device source of
--   truth — synced on load via fetchUserState, and debounced-upserted whenever
--   the relevant slices of the Zustand store change.
--
--   `team` is an ordered array of creature UUIDs; `equipped_deck` and
--   `owned_card_ids` are card IDs from the local card registry.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists synamon_user_state (
  user_id         uuid primary key references auth.users(id) on delete cascade,
  team            uuid[] not null default '{}',
  equipped_deck   text[] not null default '{}',
  owned_card_ids  text[] not null default '{}',
  updated_at      timestamptz not null default now()
);

-- Auto-touch updated_at on any change.
create or replace function synamon_user_state_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists synamon_user_state_touch on synamon_user_state;
create trigger synamon_user_state_touch
  before update on synamon_user_state
  for each row execute function synamon_user_state_touch_updated_at();

-- RLS — owner-only CRUD.
alter table synamon_user_state enable row level security;

drop policy if exists "user_state_owner_all" on synamon_user_state;
create policy "user_state_owner_all" on synamon_user_state
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
