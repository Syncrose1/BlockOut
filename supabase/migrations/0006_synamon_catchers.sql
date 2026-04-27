-- ─────────────────────────────────────────────────────────────────────────────
-- Synamon — Synacatchers (PR #3f)
--
-- Each owned creature has exactly one catcher attached, bound at catch time.
-- 'vanilla' is the common no-effect floor invariant; it is the default for
-- existing rows and the destination of destructive transfer rollback.
--
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table synamon_creatures
  add column if not exists catcher_id text not null default 'vanilla';
