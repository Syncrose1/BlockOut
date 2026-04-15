---
name: Synamon Phase 2 Sprites — Locked
description: All 74 base sprites generated and approved for 31 species. Generation script, style config, and Pokédex review page are complete.
type: project
---

All 74 front-facing base sprites are generated and locked as of 2026-04-11.

**Why:** Multiple review passes to get consistent style. Key decisions locked in.

**How to apply:** Do not regenerate sprites unless user explicitly requests it. Phase 3 is animations (idle + attack per stage).

## What's locked

- 31 species (30 original + Lunveil, the dark-side-of-moon legendary)
- 74 sprites in `public/synamon/{speciesId}/stage{N}.png`
- `public/synamon/species.json` — all sprite paths populated
- `public/synamon/generation-state.json` — 74 done, 0 failed

## Key style decisions

- All sprites use `create_map_object`, 64×64, transparent background
- Stage 1/2/3 all use Chuffin as style reference (`public/synamon/_review/chuffin-mo.png`)
- Umbra types use Murkling reference, lineless + flat shading + low detail
- Omenix/Lunveil use lineless + flat shading + medium detail
- Stage 2/3 evolutions use their stage 1 sprite as `refPath` where continuity was a problem

## Species changes from original roster

- Tidepug renamed → Tidepup (less pug-faced)
- Galecluck renamed → Galestride (penguin-like, name issue)
- Void-Drath renamed → Voidrath
- Crystub stage 3 redesigned (was horse, now crystal bear)
- Lunveil added as #31 (black dragon, dark side of moon, Arcanus/Umbra)
- Omenix reworked as white dragon (bright side of moon, Arcanus/Umbra)
- Peblix line: stage2/3 sprites were swapped during review (Crustone moved to Castellus slot)
- Bassolt line: stage2/3 sprites were swapped during review (Tremovox moved to Resonarch slot)

## Generation script

`scripts/generate-synamon.ts` — supports `--resume` and `--species=<id>` flags
- Updates `species.json` after every batch (not just at the end)
- Supports `refPath` on prompts to use a specific sprite as style reference
- Batch size 5 to stay within API concurrent job limit
