---
name: generate-monsters
description: Generate a pixel art Synamon roster (or similar monster collector) with evolution chains and animations, using the Pixel Lab REST API via generation scripts and the Synadex for review. Orchestrates a phased pipeline with manual review gates between each phase.
license: MIT
metadata:
    skill-author: BlockOut / Custom
---

# Generate Synamon (Monster Roster)

Generate a complete pixel art creature roster with evolution chains, idle/attack animations, and a structured asset manifest — designed for BlockOut's Synamon collector/battler feature.

## Overview

This skill orchestrates a **4-phase pipeline** with review gates after each phase. All generation is done via REST API scripts (not MCP character tools). The Synadex (`public/synamon/index.html`) is the central review and preview hub.

```
Phase 1 — Base Sprites     (all species all stages, review in Synadex)
Phase 2 — Direction Fix    (mirror sprites so all face the same direction)
Phase 3 — Animations       (idle + attack per species+stage, preview in Synadex)
Phase 4 — Manifest check   (validate species.json completeness)
```

---

## Prerequisites

### 1. Pixel Lab MCP Server
```bash
claude mcp add pixellab https://api.pixellab.ai/mcp -t http -H "Authorization: Bearer YOUR_API_TOKEN"
```
Get token at: https://pixellab.ai/account

### 2. tsx (for running scripts)
Scripts use TypeScript. Run with: `npx tsx scripts/path/to/script.ts [args]`

### 3. ImageMagick (for sprite mirroring)
```bash
sudo pacman -S imagemagick   # or apt/brew equivalent
magick --version             # verify
```

### 4. Output structure
```
public/synamon/
  species.json                  — canonical species + sprite + animation paths
  generation-state.json         — sprite generation job tracking
  animation-state.json          — animation generation job tracking
  {speciesId}/
    stage1.png                  — base sprite
    stage2.png
    stage3.png
    stage1-idle/frame0.png ...  — animation frames (after Phase 3)
    stage1-attack/frame0.png ...
  _review/                      — style reference images
    chuffin-mo.png              — primary style ref (cute/chibi)
    murkling-mo.png             — umbra type style ref (lineless/flat)
  index.html                    — Synadex (review + animation preview)
```

---

## Species Definition

Species are defined in `public/synamon/species.json`. Each entry:

```json
{
  "id": "cindrel",
  "name": "Cindrel",
  "type": "Ignis",
  "secondaryType": "Terra",
  "baseStats": { "hp": 39, "atk": 52, "def": 43, "spd": 45 },
  "stages": [
    {
      "stage": 1,
      "name": "Cindrel",
      "sprite": "/synamon/cindrel/stage1.png",
      "idleFrames": [],
      "attackFrames": [],
      "evolveAt": 16
    },
    {
      "stage": 2, "name": "Scaldrix",
      "sprite": "/synamon/cindrel/stage2.png",
      "idleFrames": [], "attackFrames": [], "evolveAt": 36
    },
    {
      "stage": 3, "name": "Pyrathon",
      "sprite": "/synamon/cindrel/stage3.png",
      "idleFrames": [], "attackFrames": []
    }
  ],
  "animations": {},
  "dexEntry": "A palm-sized lizard..."
}
```

### Type system
12 types: Ignis, Aqua, Terra, Ventus, Umbra, Lux, Sonus, Arcanus, Flying, Ferrous, Venom, Natura

---

## Phase 1 — Base Sprites

**Script:** `scripts/generate-synamon.ts`

**How it works:**
- Uses `create_map_object` REST API endpoint (`POST /v2/map-objects`)
- Submits jobs in batches of 5 (API has ~5-6 concurrent job limit)
- Polls `/v2/background-jobs/{background_job_id}` — NOT `/v2/map-objects/{id}`
- Saves base64 image from `last_response.image` or downloads `last_response.storage_url`
- Updates `species.json` after every batch (not just at end)

**Style references:**
- All sprites: use Chuffin (`_review/chuffin-mo.png`) as `background_image` style ref
- Umbra-type sprites: use Murkling (`_review/murkling-mo.png`) — `outline: lineless, shading: flat, detail: low`
- Per-species override: use `refPath` field in the prompt definition to pass a specific sprite as style ref (critical for evolution continuity)

**Running:**
```bash
npx tsx scripts/generate-synamon.ts              # fresh run, all species
npx tsx scripts/generate-synamon.ts --resume     # skip already generated
npx tsx scripts/generate-synamon.ts --species cindrel   # single species
```

**State file:** `public/synamon/generation-state.json`
- Uses `jobId` field (= `background_job_id` from API response)
- States: `pending` → `done` / `failed`

**Synadex live review:**
Open `public/synamon/index.html` in a browser. It fetches `species.json` and renders all sprites. Use ✓/✗ vote buttons per sprite. The page auto-updates if you refresh after each batch.

**REVIEW GATE:** After all sprites generated, do a full pass in the Synadex. Flag any ✗ for redo, then regenerate just those species with `--species`.

**Common issues:**
- "Gen 2/3 syndrome" (darker/grittier evolutions): switch all ref keys to `'default'` (Chuffin), not Scaldrix/Pyrathon
- Wrong facing direction: fix in Phase 2
- Evolution looks unrelated to base: add `refPath` pointing to the stage 1 sprite

---

## Phase 2 — Direction Fix

**Goal:** All sprites should face the same direction (left by convention in this project).

**Tool:** ImageMagick `magick {path} -flop {path}` (horizontal flip in-place)

**Workflow:**
1. View all sprites in Synadex
2. Note which ones face the wrong direction
3. Run `magick` flip on each:
   ```bash
   magick public/synamon/aquill/stage2.png -flop public/synamon/aquill/stage2.png
   ```
4. Refresh Synadex to verify

No script needed — this is a quick manual pass.

---

## Phase 3 — Animations

**Script:** `scripts/generate-animations.ts`

**How it works:**
- Uses `animate-with-text-v3` REST API endpoint (`POST /v2/animate-with-text-v3`)
- Takes the existing base sprite as `first_frame` (base64 PNG)
- Returns `images[]` array — original frame + N animation frames
- Frames saved to `public/synamon/{speciesId}/{stageKey}-{animName}/frame{N}.png`
- Updates `species.json` with both `stage.idleFrames` paths and `sp.animations['stage1-idle']` map

**API response format:**
```json
{
  "images": [
    { "type": "base64", "base64": "...", "format": "png" },
    ...
  ]
}
```
Note: response comes directly (not via background job polling) — or may return a `background_job_id` depending on server load. The script handles both.

**Running:**
```bash
npx tsx scripts/generate-animations.ts                    # all species, idle + attack
npx tsx scripts/generate-animations.ts --resume          # skip already done
npx tsx scripts/generate-animations.ts --species cindrel --anim idle
npx tsx scripts/generate-animations.ts --anim attack     # only attack anims
npx tsx scripts/generate-animations.ts --stage 1         # only stage 1 of each species
```

**Animation prompts (defaults):**
- `idle`: `"breathing idle animation, subtle body rise and fall, slight weight shift"`
- `attack`: `"attack lunge animation, quick forward strike pose, return to stance"`

**State file:** `public/synamon/animation-state.json`

**Synadex animation preview:**
Each card in the Synadex has **Static / Idle / Attack** selector buttons. When animation frames exist for a stage, clicking Idle or Attack cycles through frames at 8fps. A frame counter badge shows `N/total` in the sprite corner. Buttons are dimmed (30% opacity) when no frames exist yet.

**REVIEW GATE:** After generating, open Synadex and preview each animation. Flag bad ones and regenerate.

---

## Phase 4 — Manifest Check

Validate `species.json` is complete:

```bash
# Quick check — count sprites with null paths
node -e "
const s = JSON.parse(require('fs').readFileSync('public/synamon/species.json'));
const missing = [];
s.forEach(sp => sp.stages.forEach(st => {
  if (!st.sprite) missing.push(sp.id + '/stage' + st.stage);
}));
console.log('Missing sprites:', missing.length ? missing : 'none');
console.log('Total species:', s.length);
console.log('Total stages:', s.reduce((n,sp) => n + sp.stages.length, 0));
"
```

Ensure:
- All sprites have paths and files exist on disk
- All `idleFrames` / `attackFrames` arrays are populated (after Phase 3)
- `animations` map on each species is populated

---

## Key Technical Notes

### API endpoints
- **Sprite generation:** `POST /v2/map-objects` → returns `{ background_job_id, object_id, status }`
- **Job polling:** `GET /v2/background-jobs/{background_job_id}` → `{ status, last_response: { image, storage_url } }`
- **Animation:** `POST /v2/animate-with-text-v3` → `{ images: [...] }` (may also return background_job_id)
- **DO NOT** poll `/v2/map-objects/{id}` — that returns 404

### Batch sizing
- Sprite gen: batch size 5 (API concurrent limit ~5-6)
- Animation gen: batch size 3 (heavier endpoint)

### Style consistency tips
- Use the stage 1 sprite as `refPath` for stage 2/3 generation of the same species
- For Umbra-type species: `outline: lineless, shading: flat shading, detail: low detail`
- Avoid using any stage 2/3 sprites as global style references — they bias later generations darker

### species.json swap trick
If stage 2 and 3 sprites need to be physically swapped (e.g. because they were generated in wrong order):
1. `mv public/synamon/{id}/stage2.png public/synamon/{id}/stage3.png`
2. Regenerate stage 2 with `--species {id}`
3. Manually update the sprite paths in `species.json` for that species

---

## Synadex (`public/synamon/index.html`)

Central hub for review and animation preview.

**Features:**
- Grid of all 31 species cards
- Type filter bar + Show: All / Needs redo / Unreviewed
- Progress bar: `✓ {approved} ✗ {redo} / {total}`
- Per-stage ✓/✗ vote buttons (stored in `localStorage` key `synamon-review-v1`)
- Card border: green tint = all approved, red tint = any redo
- Animation selector: Static / Idle / Attack per card — cycles frames at 8fps when frames exist
- Frame counter badge on each sprite while animating

**To open:** serve the `public/` directory or open directly if using a dev server that routes `/synamon/` correctly.

---

## Error Handling

- **429 concurrent limit**: Reduce batch size, wait for current batch to finish before submitting next
- **Evolution looks unrelated to base**: Add `refPath` pointing to stage 1 sprite
- **Wrong direction**: `magick {path} -flop {path}`
- **Animation looks like wrong creature**: Try a more specific action description, or use a different frame_count (4-16)
- **Job timeout**: The script polls for up to 5 minutes per job. If it times out, use `--resume` to retry.
