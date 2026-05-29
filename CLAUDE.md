# BlockOut — agent/contributor notes

React + TypeScript + Vite SPA (treemap task planner) with a Vercel serverless
backend, plus an **Electron desktop build**. Deployed on Vercel.

## Three build targets — base path is conditional

`vite.config.ts` sets `base` per target (don't hardcode it):

- **web (Vercel)** → `/blockout/` — served at `syncratic.app/blockout` (proxy)
  and `blockout.syncratic.app/blockout`. Selected by the `VERCEL` env var.
- **Electron** (`npm run build` without `VERCEL`) → `./` (relative, file://).
- **dev** → `/`.

`vercel.json`: redirects bare `/` → `/blockout`; forwards
`/blockout/api/*` → `/api/*` (serverless functions); strips the `/blockout`
prefix for assets / `synamon` / `cofocus` / top-level files; SPA-fallback rest.

### Base-path gotchas
- **Absolute public-asset and `/api` paths break under the base path.** Route
  public assets through `src/utils/asset.ts` (`asset()`); the API base derives
  from `import.meta.env.BASE_URL` in `src/utils/r2sync.ts` (`getApiBase()`).
- **Raw browser navigations don't get the base** — `window.location.href`,
  `<a href="/...">`, etc. Use `asset()`/base-aware paths. (Vite, unlike Next,
  doesn't rewrite these.)
- **Service worker was retired** (`public/sw.js` is now a self-unregistering
  kill-switch). The old SW precached `/` and would pollute the proxied
  `syncratic.app` origin. Offline use is the Electron app. Do not re-add a SW
  that caches `/` without scoping it to `/blockout/`.

## Dropbox sync (OAuth 2 PKCE) — `src/utils/dropbox.ts`

- The web **authorize** redirect_uri and the **token-exchange** redirect_uri
  MUST be identical: both are `` `${window.location.origin}${import.meta.env.BASE_URL}` ``
  (= `https://syncratic.app/blockout/`). A mismatch → Dropbox rejects the
  exchange. (This bit us once; keep them in sync.)
- `src/App.tsx` detects the OAuth `?code=` return on the **base root**
  (`/blockout/`), not `/`, and cleans the URL back to `BASE_URL`.
- Dropbox app console must list the exact redirect URIs (trailing slash):
  `https://syncratic.app/blockout/` and `https://blockout.syncratic.app/blockout/`.
- The Dropbox token is stored in localStorage **keyed by domain**, so moving
  origins (e.g. subdomain → `syncratic.app/blockout`) requires a reconnect.

## Auth (Supabase — shared project)

- `src/utils/supabase.ts`: `signUp` (`emailRedirectTo`) and `resetPassword`
  (`redirectTo`) both go through `authRedirectTo()` = origin + BASE_URL, so
  email links return into the app, not the host root. Password sign-in needs no
  redirect. Supabase is a SHARED project across Syncratic apps — new redirect
  URLs must be added to its allowlist.

## Synamon integration (nested repo)

Synamon is a **nested git repo** at `./synamon/` (its own repo, like DataMedic
inside BinderPages). It's both a standalone monster-collector/battler at
`synamon.syncratic.app` AND the source of the tamagotchi-companion assets/data
used here. Its assets/data live in `public/synamon/` (sprites per creature,
`world.json`, `species.json`, particle/fx data, procedurally-played audio).

**Base-path gotcha (this bit us):** the data files bake in **root-absolute**
asset paths (`"sprite": "/synamon/cindrel/stage1.png"`, plates, idle frames).
Those bypass `asset()` and 404 under the `/blockout` proxy. Every consumer that
turns a data path into an image MUST resolve it through `asset()`:
- `SynamonScene.tsx` / `CoFocusScene.tsx` — the local `loadImage()` chokepoints.
- `SynamonSprite.tsx` — the UI `<img>`.
The guard used everywhere: `path.startsWith('/') ? asset(path) : path` (prefix
root-absolute data paths, leave http/data URLs alone). If you add a new consumer
of synamon data paths, route it through `asset()` too. Audio is synthesised in
`coFocusAudio.ts` (no `.mp3` loads), so it's unaffected.

## Persistence / sync architecture (`src/utils/persistence.ts`)

Reworked 2026-05-29 (was badly broken — R2 had been bolted in front of the
proven Dropbox sync and short-circuited it). Current model:

- **Local IndexedDB** is the working store + common intermediary;
  `navigator.storage.persist()` is requested on startup to resist eviction.
- **Dropbox = authoritative source of truth** (version-managed): a monotonic
  `version` counter in the stored file + client `lastSynced` bookmarks
  (`blockout-last-synced-version/-at`) → clock-skew-proof conflict detection,
  with field-level `mergeSnapshots` on divergence. `syncToDropboxWithResolution`
  is the original, well-tested design — **don't rewrite it casually.**
- **R2/Supabase = backup AND a first-class load source**, with its OWN parallel
  version vector (`syncToR2WithResolution`, keys `blockout-r2-last-synced-*` —
  separate so the two sequences never corrupt each other). Authoritative only
  when Dropbox isn't connected; otherwise a mirror that converges to Dropbox's
  resolved state.
- **Presentation inverts reality on purpose:** the UI shows the Supabase account
  (R2) as the primary "Cloud Sync" and Dropbox as a "Hardened backup". So the
  thing labelled *backup* (Dropbox) is actually the robust source of truth.
- **`saveToCloud`/`loadData` precedence:** Dropbox → R2 → self-hosted → local.
  `loadData` gathers local+R2, picks the freshest (empty-guarded), reconciles
  against Dropbox, then mirrors the result to R2 so backends converge. Login
  reconciles (load-before-push) — never blind-push local→R2.

Key invariants to preserve: an **empty/evicted snapshot must never win** over a
populated remote (guarded in `pickFresher` + both resolvers); every load/save
ends with all connected backends holding the same resolved state.

`api/data.js` (Vercel KV/memory self-hosted store) is legacy/secondary; its
memory store resets on cold start — don't rely on it.

### Sync modal + "Sync now" + Dropbox rolling backups
- The Cloud Sync modal (`Modals.tsx` `SyncSettingsModal`) presents two method
  cards: "Save to Syncratic Account" (R2) and "Dropbox Backup", plus an
  independent **Sync now** button driven by `syncAllBackends()` in
  persistence.ts. That runner syncs every connected backend in sequence and
  emits `SyncEvent`s (`{backend, phase, message}`) the modal narrates per card.
- Export (JSON + PNG via `exportTreemapAsImage`) + import live in the modal's
  "Download a copy" section — NOT the topbar (the topbar overflow keeps only
  Export/Import-Data + Smart Create).
- **Dropbox rolling backups** (`dropbox.ts`): the live `/blockout-data.json`
  stays the version-managed authoritative file; separately, dated snapshots go
  to `/backups/blockout-<ISO>.json`, written at most once/day, pruned to
  `getBackupKeep()` (user setting, default 10). The "restore an older backup"
  picker lists them. Lowering retention below the current count prompts
  delete-vs-archive; archived snapshots move to `/backups/archive` and are
  excluded from rotation (never silently culled).
- A ~150-line legacy "Dropbox → BlockOut Account Sync" confirm modal in
  Modals.tsx is now unreachable (superseded by the restore picker) — safe to
  delete in a future cleanup.
