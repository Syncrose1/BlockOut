# Synamon — Asset Hosting Strategy

## Context

Synamon assets total ~MB across:

| Asset class            | Approx size | Count |
|------------------------|-------------|-------|
| Creature sprites       | ~700 KB     | 73 entries × 64×64 idle/attack/etc anims |
| Tamagotchi anims       | ~12 MB      | 31 species × 10 anims × ~7 frames |
| Evo/devo transitions   | ~800 KB     | 84 transitions × 8 frames |
| Battle FX              | ~250 KB     | 21 FX × 12 frames |
| World plates           | ~150 KB     | 6 zones × 256×128 |
| World hero anims       | ~60 KB      | 3 zones × 9 frames each |
| Particle atlas         | <1 KB       | 5 sprites × 8×8 |

Total ~14 MB. Currently shipped under `public/synamon/` as part of BlockOut's
Vite build. With the planned split (Tamagotchi stays in BlockOut, Synamon Full
Experience becomes a separate Syncratic app sharing Supabase auth + creature
data), the assets need to be accessible from **both** apps without duplication.

## Decision: R2 + versioned manifest

Push the entire `public/synamon/` tree to a dedicated **R2** bucket (e.g.
`syncratic-synamon-assets`) behind a custom domain (e.g.
`assets.syncratic.app/synamon/`). Both apps fetch via the CDN URL.

### Why R2 over Supabase Storage

| Concern               | R2                                | Supabase Storage         |
|-----------------------|-----------------------------------|--------------------------|
| Egress fees           | $0                                | Bundled in plan, capped  |
| Cost @ 14 MB × ~1k DAU/mo  | ~$0.001                       | Included                 |
| Edge cache            | Cloudflare global, instant        | CDN via Supabase edge    |
| Custom domain         | Trivial (R2 + Workers)            | Possible                 |
| Auth                  | Public (read-only); signed URLs  | RLS / signed URLs        |
| Static asset use case | Designed for it                   | Designed for user uploads|

Sprites/anims/world plates are static, public, immutable, and small. R2 is the
right tool. Supabase Storage stays for user-uploaded content (avatars, custom
nicknames in future, etc.) where RLS matters.

### Versioned manifest

Each app reads `assets.syncratic.app/synamon/manifest.json` at boot. The
manifest maps logical asset keys to versioned URLs:

```json
{
  "version": "2026.04.17-001",
  "world":   "/synamon/world.json?v=2026.04.17-001",
  "species": "/synamon/species.json?v=2026.04.17-001",
  "fx":      "/synamon/fx.json?v=2026.04.17-001",
  "particles": "/synamon/_world/particles.json?v=2026.04.17-001"
}
```

A fresh upload bumps the version string; clients pick up the change on next
load. Stale clients keep working off the old version (still in R2). Cache
headers: `Cache-Control: public, max-age=31536000, immutable` on all asset
files (the version string in the URL invalidates).

### Sync workflow

A new script `scripts/publish-synamon-assets.ts`:

1. Reads `public/synamon/` recursively.
2. Computes content hash per file → `2026.04.17-001` style version stamp from
   git short-sha or date.
3. Uploads changed files via R2 S3-compatible API
   (using `@aws-sdk/client-s3`).
4. Regenerates `manifest.json` and uploads it.
5. Outputs CDN URLs for sanity check.

Runs locally (manual `npm run synamon:publish`) — assets change rarely (only
on regen runs), so no CI hook needed yet. Add to CI when the cadence picks up.

### Migration path

Until R2 is provisioned, both apps continue to read from BlockOut's
`/synamon/` path (Tamagotchi natively, Synamon Full Experience via a proxy or
local clone). Once R2 is live:

1. Run publish script → assets in R2.
2. Add `VITE_SYNAMON_ASSET_BASE` env var to both apps (default empty for local
   dev fallback).
3. Update fetch sites to prefix with the base URL when set.
4. Optionally, drop `public/synamon/` from the BlockOut build to slim the
   bundle (keep the source files in the repo for regeneration).

### Out of scope for this doc

- User-uploaded content (avatars, custom team art): Supabase Storage with RLS.
- Battle replay GIFs: future, likely R2 with signed expiring URLs for share
  links.
- Localised sprite variants (shiny/regional): same R2 layout, additional
  manifest entries.
