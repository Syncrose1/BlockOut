# Synamon — Design Bible & Development Status

Everything you need to pick this up on another machine. Covers design decisions, current state, what's done, what's next, and how all the tooling works.

---

## Region & Setting

**The Luminal Reaches** — high-altitude plateau ringed by ancient coral-limestone cliffs. A long-dried inland sea left salt flats, bioluminescent mineral veins, and fossilised reef formations. Bisected by the **Resonant Rift** canyon (crystal pillars, perpetual harmonic vibrations). Heart: **Aureum Basin** (geothermal hot spring lake, perpetually misted).

Ecological zones: salt flats, fossilised coral, Resonant Rift canyon, Aureum Basin hot springs, crystal mineral formations, deep canyon shadows/cave networks, high-altitude starlight.

---

## Type System (14 types)

### Primary-eligible (10)
| Type | Identity |
|---|---|
| **Ignis** | Fire / heat. Aggressive, offensive |
| **Aqua** | Water. Fluid, adaptive |
| **Terra** | Earth / stone. Sturdy, grounded |
| **Ventus** | Wind / air. Fast, evasive |
| **Umbra** | Shadow / darkness. Deceptive, drain |
| **Lux** | Light. Radiant, blinding effects |
| **Sonus** | Sound. AoE, status disruption |
| **Arcanus** | Learned/constructed magic. Runes, sigils, spells. Active & wilful |
| **Spiritus** | Innate/transcendent being. Soul-stuff, ethereal matter. Passive & ancient |
| **Normal** | No resistance, no weakness. Broad access. Chuffin only |

### Secondary-only / Trait (4)
| Type | Identity |
|---|---|
| **Flying** | Aerial trait |
| **Ferrous** | Metal / iron trait |
| **Venom** | Poison / toxin trait |
| **Natura** | Plant / organic trait |

**Key distinction:** Arcanus = wilful learned magic (Runekit, Fluxling). Spiritus = passive cosmic presence (Spectrix, Glassling, Omenix, Lunveil). Flying and Ferrous are secondary-only by design.

---

## Full Roster — 31 Species, 73 Entries

| # | Stage 1 | Stage 2 | Stage 3 | Primary | Secondary | Evo Levels |
|---|---|---|---|---|---|---|
| 1 | Cindrel | Scaldrix | Pyrathon | Ignis | Terra | 16→36 |
| 2 | Aquill | Tidecrest | Abyssant | Aqua | Flying | 16→36 |
| 3 | Brezzet | Galekin | Stormveil | Ventus | Flying | 16→36 |
| 4 | Glowick | Lanternis | — | Lux | Natura | 24 |
| 5 | Murkling | Void-Drath | — | Umbra | — | 28 |
| 6 | Peblix | Crustone | Castellus | Terra | Ferrous | 18→38 |
| 7 | Humtick | Resonar | — | Sonus | Natura | 26 |
| 8 | Crystub | Gemlash | Prismark | Lux | Terra | 20→40 |
| 9 | Cloakrit | Wraithel | — | Umbra | Venom | 30 |
| 10 | Ashpaw | Cinderox | Emberlord | Ignis | Ferrous | 20→40 |
| 11 | Driftull | Misthorn | — | Aqua | Ignis | 28 |
| 12 | Buzzlit | Echorex | Stridion | Sonus | Flying | 17→34 |
| 13 | Galecub | Tempestris | — | Ventus | — | 30 |
| 14 | Sporik | Mycorath | Terrafung | Terra | Natura | 21→42 |
| 15 | Spectrix | Auraveil | — | Spiritus | Lux | 32 |
| 16 | Flintlet | Scorchback | — | Ignis | Terra | 22 |
| 17 | Glintfin | Prismaray | Aurorant | Lux | Flying | 18→38 |
| 18 | Runekit | Cipherast | — | Arcanus | — | 27 |
| 19 | Windmite | Cyclorid | Vortecis | Ventus | Venom | 19→37 |
| 20 | Duskrat | Penumbrix | — | Umbra | — | 25 |
| 21 | Bassolt | Tremovox | Resonarch | Sonus | Terra | 22→44 |
| 22 | Glassling | Vitramor | — | Spiritus | Flying | 34 |
| 23 | Tidepup | Saltwort | Brinelord | Aqua | Terra | 19→39 |
| 24 | Fluxling | Miragent | — | Arcanus | Ignis | 29 |
| 25 | Lumenox | Halorath | Solance | Lux | Ignis | 21→42 |
| 26 | Scaldit | Steamback | — | Aqua | Ignis | 24 |
| 27 | Darkspore | Noctiveil | Eclipsus | Umbra | Venom | 16→35 |
| 28 | Chuffin | Galecluck | — | Normal | Flying | 22 |
| 29 | Tremlet | Quakehorn | — | Terra | Ferrous | 30 |
| 30 | Omenix | — | — | Spiritus | Umbra | Legendary |
| 31 | Lunveil | — | — | Spiritus | Umbra | Legendary |

**Legendaries:** Single-stage, uncatchable in normal play. Omenix = face of the moon always turned toward the world. Lunveil = dark side of the moon, obsidian dragon.

---

## Battle System

### BST Targets (Base Stat Total at Lv1 of each stage)
- Stage 1: **360**
- Stage 2: **410** (+50)
- Stage 3: **460** (+50)
- Legendary (single-stage): **500** fixed. Max **1 legendary per team.**

### Level Scaling (within a stage)
```
stat(lv) = baseStat × (1 + (lv − 1) × GROWTH_RATE)
HP(lv)   = baseHP   × (1 + (lv − 1) × GROWTH_RATE) + lv × 5
```
`GROWTH_RATE` ≈ 0.02 (2% per level). Exact value TBD during implementation.

### Role Archetypes (Stage 1 templates, BST=360)
| Archetype | HP | ATK | DEF | SPD | Examples |
|---|---|---|---|---|---|
| Tank | 105 | 65 | 135 | 55 | Peblix, Tremlet, Bassolt |
| Striker | 70 | 130 | 50 | 110 | Cindrel, Ashpaw, Flintlet, Murkling, Runekit, Duskrat, Darkspore |
| Support | 90 | 60 | 100 | 110 | Aquill, Glassling, Spectrix, Glowick, Cloakrit, Windmite |
| Balanced | 90 | 90 | 90 | 90 | Chuffin, Galecub, Tidepup, Glintfin, Lumenox, Scaldit |
| Glass Cannon | 55 | 140 | 40 | 125 | Fluxling, Buzzlit, Brezzet, Humtick |
| Bulky Attacker | 100 | 115 | 80 | 65 | Driftull, Sporik, Crystub |

### Evolution Stat Gains (+50 BST per stage)
| Archetype | +HP | +ATK | +DEF | +SPD |
|---|---|---|---|---|
| Tank | 20 | 10 | 15 | 5 |
| Striker | 10 | 20 | 5 | 15 |
| Support | 15 | 5 | 15 | 15 |
| Balanced | 12 | 13 | 12 | 13 |
| Glass Cannon | 5 | 25 | 5 | 15 |
| Bulky Attacker | 15 | 20 | 10 | 5 |

### Legendaries (BST=500, single-stage)
- **Omenix** — HP140 / ATK100 / DEF140 / SPD120 (mystical support-tank)
- **Lunveil** — HP110 / ATK160 / DEF100 / SPD130 (offensive apex)

### Damage Formula
```
damage = (atk / def) × movePower × typeMultiplier × random(0.85, 1.0)
```
Type multipliers: 2× super effective, 1× neutral, 0.5× resisted, 0× immune.

### Speed Model
```
attacksThisTurn = floor(yourSPD / enemySPD)   [minimum 1]
```
Only two meaningful thresholds: SPD > enemy (act first), SPD ≥ 2× enemy (double action). Level scaling preserves the ratio.

### Move Power Tiers
| Tier | Power | PP | Notes |
|---|---|---|---|
| Light (L) | 40 | 20 | Fast, no drawback |
| Medium (M) | 65 | 12 | Standard, minor effects |
| Heavy (H) | 90 | 6 | Strong, often recoil |
| Signature (S) | 90/100/115 | 3 | Per stage, always has special effect |

### Type Move Pools
| Type | Moves |
|---|---|
| Ignis | Ember Snap (L), Scorch Burst (M), Ash Cloud (M), Flame Lance (H) |
| Aqua | Bubble Barrage (L), Tidal Surge (M), Mist Veil (M), Depth Charge (H) |
| Terra | Stone Toss (L), Quake Stomp (M), Boulder Crash (H), Dust Screen (M) |
| Ventus | Gust Slash (L), Tailwind (M), Cyclone Cutter (H), Whirlwind Throw (M) |
| Umbra | Shadow Lunge (L), Shade Wrap (M), Void Pulse (M), Dark Echo (H) |
| Lux | Flash Burst (L), Radiant Beam (M), Prism Strike (H), Aura Flare (M) |
| Sonus | Resonance Wave (L), Screech (M), Bass Pulse (M), Echo Slam (H) |
| Arcanus | Sigil Bolt (L), Arcane Shift (M), Runic Seal (M), Void Arc (H) |
| Spiritus | Ether Touch (L), Soul Drain (M), Spectral Veil (M), Astral Surge (H) |
| Normal | Tackle (L), Quick Strike (L), Headbutt (M), Endeavour (H) |
| Flying | Wing Slash (L), Updraft (M), Dive Bomb (H), Tailfeather Blade (M) |
| Ferrous | Iron Bash (L), Magnetise (M), Rust Bite (M), Metal Storm (H) |
| Venom | Poison Fang (L), Toxic Cloud (M), Venom Burst (H), Acid Splash (M) |
| Natura | Spore Cloud (M), Vine Whip (L), Seed Bomb (M), Root Lock (H) |

### Signature Moves — Per Evo Stage
| Line | Stage 1 | Stage 2 | Stage 3 |
|---|---|---|---|
| Cindrel line | Cinder Snap — burn DoT | Magma Crash — def down | Pyroclast — AoE burn |
| Aquill line | Barrel Roll — reflect 50% | Tidal Slam — flinch | Abyssal Surge — multi-hit |
| Brezzet line | Wind Dart — always first | Gale Spin — confuse | Storm Break — hits through evasion |
| Glowick line | Pulse Glow — lower SPD | Lantern Burst — blind AoE | — |
| Murkling line | Shadowmeld — untargetable 1t | Shade Siphon — drain HP | — |
| Peblix line | Shell Roll — def boost+tackle | Stone Crush — ignore def | Fortress Smash — AoE+def down |
| Humtick line | Chirp Strike — may paralyse | Resonant Screech — AoE debuff | — |
| Crystub line | Gem Shard — hits 2-3× | Crystal Edge — crit boost | Prism Cannon — ignores resist |
| Cloakrit line | Void Step — dodge+counter | Abyss Clamp — traps target | — |
| Ashpaw line | Ember Pounce — burn on hit | Cinder Roar — ATK debuff AoE | Inferno Crush — massive burn |
| Driftull line | Steam Vent — always hits | Scalding Surge — burn+def down | — |
| Buzzlit line | Buzz Dive — SPD-based dmg | Echo Pulse — sound stun | Strident Burst — AoE sonic |
| Galecub line | Wind Burst — push+flinch | Tempest Spin — evasion+AoE | — |
| Sporik line | Spore Pop — random status | Myco Drain — HP siphon | Terra Bloom — AoE root |
| Spectrix line | Prism Refract — splits dmg | Aura Shield — absorb one hit | — |
| Flintlet line | Flint Click — burn+low dmg | Scorchback Lunge — high burn | — |
| Glintfin line | Salt Skate — always crits rear | Prism Flash — blind all | Aurora Wave — massive Lux AoE |
| Runekit line | Sigil Brand — Sealed debuff | Cipher Lock — 2-turn lock | — |
| Windmite line | Sail Spin — dodge+counter | Cyclone Core — wind vortex | Vortex Engine — AoE pull+dmg |
| Duskrat line | Shadow Scatter — decoy copies | Penumbra Drain — life steal | — |
| Bassolt line | Bass Thump — shockwave | Subwave Pulse — AoE stun | Subsonic Roar — AoE ATK debuff |
| Glassling line | Ether Drift — phasing dodge | Vitreous Beam — Spiritus heavy | — |
| Tidepup line | Brine Slap — reduces SPD | Salt Crust — def boost+splash | Brinelord Tide — AoE+salt slow |
| Fluxling line | Flux Flare — random power | Mirage Dash — confuse on dodge | — |
| Lumenox line | Inner Glow — ATK boost | Halo Beam — piercing Lux | Solance Flare — AoE blind+burn |
| Scaldit line | Steam Pop — always hits | Scalding Back — burn on contact | — |
| Darkspore line | Spore Drift — poison all | Nocti Veil — blind+poison | Eclipse Burst — AoE dark+poison |
| Chuffin line | Puff Up — intimidate ATK down | Gale Cluck — wind+flinch | — |
| Tremlet line | Tremor — ground shake | Quake Horn — single heavy hit | — |
| Omenix ★ | Eclipse Stare — Fear (skip turn) | — | — |
| Lunveil ★ | — | — | Lunar Rend — AoE, ignores resist |

---

## Constitutions (16)

Assigned at catch/hatch. Applies percentage multipliers to base stats — approximately zero-sum (BST preserved). Species have a weak personality correlation but it's not deterministic.

| Constitution | Flavour | HP | ATK | DEF | SPD |
|---|---|---|---|---|---|
| Hardy | No modifier | — | — | — | — |
| Short-fuse | Aggressive, acts before thinking | — | +15% | -20% | +15% |
| Steadfast | Unmovable, endures everything | +15% | — | +20% | -25% |
| Skittish | Flees fast, hard to pin down | -10% | -10% | -20% | +40% |
| Tenacious | Outlasts opponents, never quits | +25% | — | +10% | -25% |
| Reckless | All-in offence, ignores damage | -15% | +25% | -20% | +10% |
| Composed | Methodical, hard to rattle | +10% | -15% | +25% | -20% |
| Nimble | Fast and evasive, light build | -15% | — | -15% | +30% |
| Stoic | Takes hits, rarely retaliates | +20% | -25% | +15% | -10% |
| Cunning | Calculated striker, picks moments | -10% | +20% | — | +10% |
| Sluggish | Slow but devastating | +10% | +20% | +10% | -40% |
| Vigorous | Robust all-rounder | +10% | +10% | +10% | -20% |
| Frail | Extreme glass cannon | -25% | +30% | -25% | +20% |
| Lumbering | Heavy hitter, poor speed | +15% | +15% | +10% | -40% |
| Timid | Defensive, avoids direct conflict | +10% | -20% | +20% | -10% |
| Spirited | Balanced burst, energetic | — | +10% | -10% | +10% |

---

## Personalities — All 31 Base Forms

| Species | Personality | Tamagotchi Behaviour |
|---|---|---|
| Cindrel | Feisty, restless | Needs frequent play, gets bored/destructive fast |
| Aquill | Relaxed, friendly, affectionate | Very easy to keep happy, needs lots of petting |
| Brezzet | Curious, easily distracted | Attention drains fast but refills easily, likes novelty |
| Glowick | Shy, cautious | Needs quiet, dislikes too many interactions |
| Murkling | Mischievous, cryptic | Sometimes ignores you, sometimes overreacts |
| Peblix | Stubborn, steady | Very slow all decay rates, hard to excite or upset |
| Humtick | Hyper, chatty | Constant attention needed, loudly reacts to everything |
| Crystub | Gentle, trusting | Cries easily when neglected, instantly forgives |
| Cloakrit | Secretive, defensive | Hides when stressed, rare but meaningful affection |
| Ashpaw | Brave, aggressive | Wants to fight constantly, neglect → anger not sadness |
| Driftull | Lazy, warm, content | Very low needs, just wants warmth and food |
| Buzzlit | Energetic, clumsy | Knocks things over, gets into trouble |
| Galecub | Playful, fast | Zoomies, hard to get to sleep, needs exercise |
| Sporik | Calm, slow, philosophical | Lowest decay rate, meditative, barely reacts |
| Spectrix | Delicate, ethereal | Even minor neglect causes visible distress |
| Flintlet | Scrappy, independent | Doesn't need much care, rewards attention with loyalty |
| Glintfin | Graceful, vain | Hates being sick/dirty, needs grooming |
| Runekit | Intelligent, aloof | Engages on its own terms, responds to puzzles |
| Windmite | Stoic, patient | Very slow needs, rarely expressive, loyal |
| Duskrat | Nervous, skittish | High anxiety, startles easily, needs calm routine |
| Bassolt | Grumpy, gruff | Hard to please, but secretly appreciates care |
| Glassling | Gentle, dreamy | Drifts off, needs gentle prompting, very peaceful |
| Tidepup | Bouncy, eager | Thrives on routine, excited by everything, fast hunger |
| Fluxling | Erratic, unpredictable | Mood swings, random needs spikes, hard to read |
| Lumenox | Warm, steady | Easy to care for, glows brighter when happy |
| Scaldit | Territorial, proud | Dislikes being touched until trust is high |
| Darkspore | Eerie, independent | Does its own thing, thrives on neglect |
| Chuffin | Charismatic, dramatic | Performs for attention, pouts when ignored |
| Tremlet | Timid, gentle | Meek, sensitive, slow to trust |
| Omenix ★ | Aloof, mysterious, unsettling | Pet dragon energy. Rare intense reactions. |
| Lunveil ★ | Aloof, ancient, unknowable | Keeping it feels like an honour, not a relationship. |

---

## Tamagotchi System

Applies to **all 31 base forms only.** Any evolved form devolves to base in tamagotchi mode.

### Animation Set (12 types)
| Key | Trigger | Description |
|---|---|---|
| `feed` | Player action | Eating — gulp or nibble reaction |
| `pet` | Player action | Pleased wiggle, happy eyes |
| `play` | Player action | Energetic bounce or spin |
| `sleep` | Player action | Curled, breathing, Z-particle overlay |
| `happy` | Persistent state | Upbeat idle variant, bouncier than normal idle |
| `excited` | Persistent state | High energy — after level-up or battle win |
| `sad` | Persistent state | Slumped, slow — when needs are neglected |
| `hungry` | Persistent state | Droopy, occasional stomach gesture |
| `sick` | Persistent state | Shivering, hunched |
| `focused` | **BlockOut session active** | Calm attentive pose, eyes forward, slight lean. Clearly different from idle. |
| `celebrating` | **BlockOut goal hit** | Burst of energy — session complete or goal met. |
| `levelup` | Lifecycle | Flash/star burst, stays in base form |

### MVP Set (Phase 1 — 6 × 31 = 186 animations)
`feed`, `pet`, `sleep`, `happy`, `focused`, `celebrating`

Phase 2 adds: `play`, `excited`, `sad`, `hungry`, `sick`, `levelup`

### Legendary tamagotchi notes
- `pet` → minimal acknowledgement, not enthusiastic
- `happy` → composed/regal rather than bouncy
- `focused` → natural stillness, hard to distinguish from baseline
- Responds to consistency over time, not individual actions

---

## Sprite & Animation Pipeline

### File Structure
```
public/synamon/
  species.json                          ← canonical species data, all frames registered here
  animation-state.json                  ← tracks generation progress
  {speciesId}/
    stage1.png                          ← base sprite
    stage2.png
    stage3.png
    stage1-idle/frame0.png … frameN.png
    stage1-attack/frame0.png … frameN.png
    stage1-focused/frame0.png … frame16.png   ← tamagotchi, base only
    stage1-celebrating/frame0.png … frame16.png
    stage1-to-stage2/frame0.png … frame49.png ← evo transition (50 frames)
    stage2-to-stage1/frame0.png … frame49.png ← devo transition (50 frames)
    …
```

### Frame Counts per Animation Type
| Animation | Frames | Notes |
|---|---|---|
| idle / attack | 6 | frame0 = static, loop frames 1–6 |
| focused / celebrating / sleep | 16 | Long expressive anims |
| happy / feed / pet / sad / hungry / sick | 10 | Medium |
| play / excited / levelup | 12 | Medium-long |
| evo/devo transitions | 50 | 15 scan + 24 dissolve + 10 post + 1 clean |

### Generation Scripts
```bash
# Sprites (Phase 2 — all done)
npx tsx scripts/generate-synamon.ts

# Idle + Attack animations (Phase 3 — all done)
npx tsx scripts/generate-animations.ts --anim idle
npx tsx scripts/generate-animations.ts --anim attack

# Tamagotchi animations (Phase 4 — in progress)
npx tsx scripts/generate-animations.ts --anim focused          # 30/31 done, scaldit pending
npx tsx scripts/generate-animations.ts --anim celebrating      # not started
npx tsx scripts/generate-animations.ts --anim focused --resume # resumes failed jobs
npx tsx scripts/generate-animations.ts --anim focused --species scaldit  # single species

# Evo/Devo transitions (Phase 4 — all done)
npx tsx scripts/generate-transitions.ts
npx tsx scripts/generate-transitions.ts --resume
npx tsx scripts/generate-transitions.ts --species cindrel --type evo
```

### API Used
**PixelLab** — `https://api.pixellab.ai/v2`
- Endpoint for animations: `POST /animate-with-text-v3`
- Endpoint for sprites: `POST /generate-image-pixflux` (and character endpoints)
- API key stored in scripts as `f82b0da8-5d5f-45b3-a9c3-3bb53d725cea`
- Generation limit: ~2000/month (hit limit mid-focused run)
- Resume with `--resume` flag to skip already-completed animations

### Transition Animation Design
- 50 frames per transition (at 8fps = ~6.25 seconds)
- **Dissolve-out**: creature becomes a solid accent-coloured silhouette, then dissolves via scanline wave
- **Scanline flash**: soft double flash at alpha 0.35 and 0.2
- **Silhouette ramp**: 3-frame blend [25%, 85%, 100%] — fast snap feel
- **Dissolve-in**: new form materialises from scanlines
- Alpha threshold < 30 zeroed out to prevent fringe pixels during solid hold
- Accent colour per species derived from type

### Synadex Playback (index.html)
- **Three-phase sequence**: idle loop (until frame 0 completes) → transition plays once → new form idle loops forever
- `playFullSequence(transFrames, transKey)` — handles all three phases
- 8fps playback (`ANIM_FPS = 8`)
- frame0 skipped in animation loops (always static pose — avoids snap-back on loop)

---

## Synadex — `public/synamon/index.html`

Standalone HTML file, no build step. Served at `/synamon/` by the dev server.

### Tabs
- **Dex tab** — sprite review grid, animation preview, transition playback, vote ✓/✗ per sprite
- **Systems tab** — type system, battle scaling, constitutions, move pools, sig moves, FX list, personalities, tamagotchi animation plan

### Key JS globals
```js
ANIM_FPS = 8
TAMAGOTCHI_ANIMS = Set(['focused','celebrating','happy','excited','feed','pet','play','sleep','sad','hungry','sick','levelup'])
ANIM_GROUPS = [
  { label: 'Battle',     anims: ['idle','attack'] },
  { label: 'BlockOut',   anims: ['focused','celebrating'] },
  { label: 'Tamagotchi', anims: ['happy','excited','feed','pet','play','sleep','sad','hungry','sick','levelup'] },
]
TYPE_COLORS = { Ignis, Aqua, Terra, Ventus, Umbra, Lux, Sonus, Arcanus, Spiritus, Normal, Flying, Ferrous, Venom, Natura }
```

### Behaviour notes
- Tamagotchi anims: only stage 1 animates; stages 2/3 hold static sprite
- `getFrames()` only falls back to `idleFrames`/`attackFrames` for `idle`/`attack` keys — all others read from `sp.animations[stageKey-animName]`
- `img.onerror` cleared after first successful load so mid-animation 404s don't trigger the pending state
- Votes persisted to `localStorage` under key `synamon-review-v1`
- `species.json` fetched with `?v=Date.now()` cache-bust

### species.json structure
```jsonc
[
  {
    "id": "cindrel",
    "type": "Ignis",
    "secondaryType": "Terra",
    "stages": [
      {
        "stage": 1,
        "name": "Cindrel",
        "sprite": "/synamon/cindrel/stage1.png",
        "evolveAt": 16,
        "idleFrames": ["/synamon/cindrel/stage1-idle/frame0.png", ...],    // legacy
        "attackFrames": ["/synamon/cindrel/stage1-attack/frame0.png", ...] // legacy
      }
    ],
    "animations": {
      "stage1-idle":        ["/synamon/cindrel/stage1-idle/frame0.png", ...],
      "stage1-attack":      [...],
      "stage1-focused":     [...],
      "stage2-idle":        [...],
      // etc.
    },
    "transitions": {
      "stage1-to-stage2":   ["/synamon/cindrel/stage1-to-stage2/frame0.png", ...],
      "stage2-to-stage1":   [...],
      // etc.
    },
    "baseStats": { "hp": 75, "atk": 128, "def": 55, "spd": 105 },  // stage-1 alias
    "dexEntry": "A palm-sized lizard with ember-orange scales..."
  }
]
```

**Note:** `baseStats` now lives on each stage (plus a species-level alias for stage 1). All 31 species have been recalibrated via `scripts/recalc-basestats.ts` using a 3-layer model:

- **Layer 1** — Archetype template (BST=360 stage 1, +50/stage via evo gain)
- **Layer 2** — Per-species hand-picked variation (±15% per stat, ±10 BST drift), baked into species.json
- **Layer 3** — Constitution modifiers applied at catch/hatch (runtime only — see `project_synamon_constitutions.md`)

Legendaries (Omenix, Lunveil) are single-stage at BST=500 with bespoke templates and no evo gain.

---

## What's Done

| Phase | Content | Status |
|---|---|---|
| Phase 1 | 31 species designed, dex entries written, type system | ✅ Done |
| Phase 2 | 74 sprites generated (all stages all species) | ✅ Done |
| Phase 3 | Idle + attack animations — all 31 species, all stages | ✅ Done |
| Phase 4a | Evo/devo transitions — all 31 species, 86 transitions, 50 frames each | ✅ Done |
| Phase 4b | Focused animations — 31/31 base forms | ✅ Done |
| Phase 4c | Celebrating, happy, excited, sad, sleep, sick, feed, pet, hungry, play — all 31/31 | ✅ Done |
| Phase 4d | Levelup — procedural 18-frame animations per species (no API, ImageMagick+zlib) | ✅ Done |
| Phase 5 | Battle effect animations — 21 shared FX overlays, 12-frame impact bursts at 96×96, hard-transparent final frame | ✅ Done |
| Phase 6 | Recalculate baseStats to 3-layer system (archetype + species variation + constitution) | ✅ Done |
| Phase 7 | Battle system implementation | ⏳ Not started |
| Phase 8a | Tamagotchi world — 6 zone plates via pixflux, 3 hero anims, 5 particle sprites, world.json registry | ✅ Done |
| Phase 8b | Tamagotchi scene renderer — `tamagotchi.html` cinematic viewer (plate + hero + particles + creature + day/night) | ✅ Done |
| Phase 8c | Supabase creature schema — `0001_synamon_creatures.sql` migration (creatures, events, dex, companion) | ✅ Done |
| Phase 8d | Asset hosting strategy — R2 + versioned manifest (see `SYNAMON_HOSTING.md`) | ✅ Done |
| Phase 8e | Tamagotchi full integration — React component in BlockOut, stat decay, interaction loop, notifications | ⏳ Not started |

---

## Immediate Next Steps

1. **Tamagotchi integration (Phase 8e)**: Port `tamagotchi.html` into a React component (`src/components/Synamon/TamagotchiScene.tsx`). Wire up Supabase reads/writes for creature state (happiness, hunger, energy). Add stat-decay ticking (hourly via server cron or client-side on focus).

2. **Provision R2** and run `scripts/publish-synamon-assets.ts` to host shared assets at `assets.syncratic.app/synamon/`.

3. **Battle system (Phase 7)**: Implement turn-based battles consuming per-stage `baseStats` + runtime constitution modifiers.

4. **Implement tamagotchi system** (BlockOut integration — hatch/feed/pet/sleep loops tied to task completion).

---

## Git Info

- **Repo:** `Syncrose1/BlockOut`
- **Active branch:** `claude/expand-timer-functionality-yTGgi`
- **Base branch:** `claude/task-management-app-HxCpF`
- All current work is pushed to remote.

---

## Dev Server

The project uses a standard Node/Vite-style setup. Synamon assets are served statically from `public/`. The Synadex is at `/synamon/index.html` — open it directly in the browser while the dev server runs.
