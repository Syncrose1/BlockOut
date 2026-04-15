---
name: Synamon Tamagotchi — Animation Set & Design
description: Required animation types for tamagotchi mode, BlockOut productivity animations, MVP set, and design principles
type: project
---

# Synamon Tamagotchi Design (Locked — 2026-04-12)

## Scope

Tamagotchi mode applies to all 31 base forms (including legendaries Omenix and Lunveil, which devolve to base form in tamagotchi). Any evolved form is devolved to base for tamagotchi. All tamagotchi animations only need to be generated for the 31 base forms.

---

## Animation Set (12 types)

### Care animations (triggered by player actions)
- `feed` — eating, gulp/nibble reaction
- `pet` — pleased wiggle, happy eyes
- `play` — energetic bounce/spin
- `sleep` — curled, breathing, Z-particle overlay

### Emotional state animations (persistent loops, shown while in that state)
- `happy` — upbeat idle variant, brighter/bouncier than normal idle
- `excited` — high energy, can't keep still; used after level-up or battle win
- `sad` — slumped, slow; shown when needs are neglected
- `hungry` — droopy, occasional stomach gesture
- `sick` — shivering, hunched

### BlockOut productivity animations
- `focused` — Synomon settles into a calm, attentive pose: eyes forward, still, slight lean forward. Used while a BlockOut focus session is active. Should feel intentional and purposeful — clearly different from idle.
- `celebrating` — burst of energy/confetti reaction. Triggered when a BlockOut session completes successfully or a goal is hit.

### Lifecycle
- `levelup` — flash/star burst, stays in base form. Different from evo transition.

---

## MVP Animation Set (Phase 1 — ship first)

6 animations × 31 species = 186 animations:
1. `feed`
2. `pet`
3. `sleep`
4. `happy`
5. `focused` ← BlockOut-specific, high priority
6. `celebrating` ← BlockOut-specific, high priority

Remaining 6 (`play`, `excited`, `sad`, `hungry`, `sick`, `levelup`) added in Phase 2.

---

## Legendary Behaviour Note

Omenix and Lunveil are aloof in tamagotchi mode — like keeping a pet dragon, not a pet cat.
- Their `pet` reaction is minimal acknowledgement, not enthusiastic
- `happy` looks composed/regal rather than bouncy
- `focused` looks like natural stillness, hard to distinguish from their baseline
- They respond to consistency over time, not individual actions
- This should inform the animation prompts when generating for these two species

---

## Generation Pipeline

Same `animate-with-text-v3` pipeline as idle/attack.
Script: extend `generate-animations.ts` to support `--anim focused`, `--anim celebrating`, etc.
Prompts need to be per-animation-type with per-species overrides (same pattern as SPECIES_OVERRIDES).
Apply personality notes above when writing per-species prompt overrides.
