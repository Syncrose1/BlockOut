-- ─────────────────────────────────────────────────────────────────────────────
-- Synamon — creature persistence (shared across Syncratic ecosystem)
--
-- Design principles:
--   • Single source of truth for owned creatures, accessible from BlockOut
--     (tamagotchi) and the Synamon Full Experience app (battle/exploration).
--   • All mutable runtime state (level, xp, happiness, hunger, energy, stage)
--     stored on the row — UI reads/writes directly. Static stats (BST,
--     archetype) come from the local species.json registry.
--   • Per-creature RNG (constitution, personality, IVs) baked at catch/hatch
--     time and never re-rolled. Moves selected from the species' move pool.
--   • Append-only event log feeds streaks, tamagotchi UX, and
--     "your creature missed you" prompts.
--   • RLS enforces user-scoping; service role bypass for batch jobs.
-- ─────────────────────────────────────────────────────────────────────────────

create extension if not exists "pgcrypto";

-- ─── creatures: owned/active roster ──────────────────────────────────────────
create table if not exists synamon_creatures (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,

  -- Identity
  species_id          text not null,            -- references species.json id e.g. 'cindrel'
  nickname            text,
  zone_origin         text,                     -- where caught/hatched

  -- Progression
  stage               smallint not null default 1 check (stage between 1 and 3),
  level               smallint not null default 1 check (level between 1 and 50),
  xp                  integer  not null default 0,

  -- Tamagotchi state (0..100)
  happiness           smallint not null default 80 check (happiness between 0 and 100),
  hunger              smallint not null default 50 check (hunger between 0 and 100),
  energy              smallint not null default 80 check (energy between 0 and 100),

  -- Per-creature variation, baked at catch/hatch
  constitution        text not null default 'balanced',  -- stat modifier profile
  personality         text not null default 'gentle',    -- behaviour archetype
  ivs                 jsonb not null default '{}'::jsonb, -- {hp, atk, def, spd}

  -- Battle loadout
  moves               text[] not null default '{}',

  -- Lifecycle
  caught_at           timestamptz not null default now(),
  last_interaction_at timestamptz not null default now(),
  last_evolved_at     timestamptz,

  -- UX flags
  favorite            boolean not null default false,
  archived            boolean not null default false,

  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists synamon_creatures_user_idx
  on synamon_creatures (user_id, archived);
create index if not exists synamon_creatures_user_interaction_idx
  on synamon_creatures (user_id, last_interaction_at desc);

-- ─── creature_events: append-only interaction & battle log ───────────────────
create table if not exists synamon_creature_events (
  id           uuid primary key default gen_random_uuid(),
  creature_id  uuid not null references synamon_creatures(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  event_type   text not null,            -- 'fed' | 'pet' | 'played' | 'slept' | 'evolved' | 'leveled_up' | 'battled' | 'captured' | 'sick' | 'recovered'
  payload      jsonb not null default '{}'::jsonb,
  happened_at  timestamptz not null default now()
);

create index if not exists synamon_creature_events_creature_idx
  on synamon_creature_events (creature_id, happened_at desc);
create index if not exists synamon_creature_events_user_recent_idx
  on synamon_creature_events (user_id, happened_at desc);

-- ─── user_dex: discovery & ownership ledger (Synadex completion) ─────────────
create table if not exists synamon_user_dex (
  user_id               uuid not null references auth.users(id) on delete cascade,
  species_id            text not null,
  first_seen_at         timestamptz not null default now(),
  first_caught_at       timestamptz,
  highest_stage_reached smallint not null default 1 check (highest_stage_reached between 1 and 3),
  primary key (user_id, species_id)
);

-- ─── active_companion: which creature is currently the tamagotchi ────────────
create table if not exists synamon_active_companion (
  user_id     uuid primary key references auth.users(id) on delete cascade,
  creature_id uuid not null references synamon_creatures(id) on delete cascade,
  zone_key    text not null default 'aureum-basin',  -- chosen tamagotchi backdrop
  assigned_at timestamptz not null default now()
);

-- ─── updated_at trigger ──────────────────────────────────────────────────────
create or replace function synamon_touch_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end $$ language plpgsql;

drop trigger if exists synamon_creatures_touch on synamon_creatures;
create trigger synamon_creatures_touch
  before update on synamon_creatures
  for each row execute function synamon_touch_updated_at();

-- ─── Row Level Security ──────────────────────────────────────────────────────
alter table synamon_creatures        enable row level security;
alter table synamon_creature_events  enable row level security;
alter table synamon_user_dex         enable row level security;
alter table synamon_active_companion enable row level security;

-- creatures: owner full CRUD
drop policy if exists "creatures_owner_all" on synamon_creatures;
create policy "creatures_owner_all" on synamon_creatures
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- events: owner read + insert (immutable history — no update/delete)
drop policy if exists "events_owner_read"   on synamon_creature_events;
drop policy if exists "events_owner_insert" on synamon_creature_events;
create policy "events_owner_read"   on synamon_creature_events
  for select using (auth.uid() = user_id);
create policy "events_owner_insert" on synamon_creature_events
  for insert with check (auth.uid() = user_id);

-- dex: owner full CRUD
drop policy if exists "dex_owner_all" on synamon_user_dex;
create policy "dex_owner_all" on synamon_user_dex
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- active companion: owner full CRUD
drop policy if exists "companion_owner_all" on synamon_active_companion;
create policy "companion_owner_all" on synamon_active_companion
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
