-- ─────────────────────────────────────────────────────────────────────────────
-- model_endpoints — capability flags (VLM / image-gen / tools / streaming)
--
-- The shared BYOK model_endpoints table only described a single chat model per
-- row. To use endpoints APPROPRIATELY (route a vision task to a VLM, an image
-- request to an image model, skip tools on a model that can't do them), each row
-- now carries a set of CAPABILITY flags. Flags can be set by the user (they know
-- their endpoint) and/or filled in by a best-effort probe (api/probe-endpoint.js)
-- that pings the provider with cheap minimal calls.
--
-- capabilities — any of: 'chat', 'vision', 'tools', 'image', 'embeddings',
--   'streaming'. Empty = unknown (treated as plain chat by callers).
-- probed_at    — when the probe last ran (null = never probed).
-- probe_note   — short human-readable result/error from the last probe.
--
-- Shared table (also used by Binder); this ALTER targets the one shared row set.
-- Safe to re-run.
-- ─────────────────────────────────────────────────────────────────────────────

alter table public.model_endpoints
  add column if not exists capabilities text[] not null default '{}',
  add column if not exists probed_at timestamptz,
  add column if not exists probe_note text;

-- Existing rows predate probing; assume they're at least chat-capable so callers
-- that filter on 'chat' don't suddenly see zero usable endpoints.
update public.model_endpoints
  set capabilities = array['chat']
  where capabilities = '{}';
