-- ─────────────────────────────────────────────────────────────────────────────
-- Synamon — catcher inventory (PR #3g)
--
-- Catchers are now player-spent items used to catch wild creatures, with
-- catch rates that vary by catcher rarity and the wild's battle state.
-- This column is the unbound inventory; the catcher attached to a caught
-- creature still lives on synamon_creatures.catcher_id.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table synamon_user_state
  add column if not exists owned_catcher_ids text[] not null default '{}';
