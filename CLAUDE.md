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

## ⚠️ Known issue (separate from routing)

BlockOut has **severe save/persistence bugs** still to be diagnosed — multiple
competing layers (IndexedDB + Dropbox + R2 + Vercel KV in `api/data.js`, whose
memory store resets on cold start). If sync misbehaves *after* a successful
Dropbox reconnect, it's this, not the OAuth wiring.
