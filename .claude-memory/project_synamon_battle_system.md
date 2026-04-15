---
name: Synamon Battle System — Stats, Moves, Scaling
description: BST targets, damage formula, type move pools, signature moves per evo stage, and effect animation plan
type: project
---

# Synamon Battle System (Locked — 2026-04-12)

---

## Base Stat Total (BST) Targets

BST values below are the **base values at level 1 of each stage**. Stats scale upward with level within each stage. Evolution gates the next BST tier (+50).

| Stage | BST at Lv1 of stage |
|---|---|
| Stage 1 | 360 |
| Stage 2 | 410 |
| Stage 3 | 460 |

### Stat scaling within a stage

Each individual stat scales linearly with level from its base value:

```
stat(level) = baseStat × (1 + (level - 1) × GROWTH_RATE)
```

`GROWTH_RATE` is a small constant (e.g. 0.02 per level = +2% per level). At level 50 a stat would be ~2× its base. Exact value TBD during implementation — the formula keeps all species proportionally balanced since everyone uses the same rate.

HP uses the same formula but with a flat bonus: `HP(level) = baseHP × (1 + (level-1) × GROWTH_RATE) + level × 5`

### Legendary BST

Omenix and Lunveil are **single-stage** and do not evolve by default. Their BST is fixed at **500** (no range — no stage 2 or 3). If a legendary species in a future generation has evolutions, it follows the same +50 per stage rule.

The 500 BST (vs 360 for normals) is the legendary's permanent advantage. Legendaries are limited to **1 per team** in battle.

### Role Archetypes (BST distribution)

| Archetype | BST | HP | ATK | DEF | SPD | Example species |
|---|---|---|---|---|---|---|
| Tank | 360 | 90 | 60 | 110 | 40 | Peblix, Tremlet, Bassolt |
| Striker | 360 | 60 | 110 | 40 | 90 | Cindrel, Ashpaw, Flintlet |
| Support | 360 | 70 | 50 | 80 | 80 | Aquill, Glassling, Spectrix |
| Balanced | 360 | 75 | 75 | 75 | 75 | Chuffin, Galecub, Tidepup |
| Glass Cannon | 360 | 45 | 120 | 30 | 110 | Fluxling, Buzzlit, Brezzet |
| Bulky Attacker | 360 | 85 | 95 | 65 | 50 | Driftull, Sporik |

---

## Speed Model

SPD is not a continuous initiative stat — it works as an **action threshold**:

```
attacksThisTurn = floor(yourSPD / enemySPD)   minimum 1
```

- SPD 60 vs 59 → you go first, 1 attack each
- SPD 60 vs 29 → you go first, **2 attacks** before they act
- SPD 120 vs 39 → **3 attacks** before they act

The only two meaningful SPD thresholds are:
1. **yourSPD > enemySPD** — you act first
2. **yourSPD ≥ 2× enemySPD** — you get a second action before they act (and so on for 3×, etc.)

This makes SPD constitutions high-stakes. A Skittish Glass Cannon (SPD +40%) can double-act most opponents but folds to one hit. A Sluggish tank (-40% SPD) can still take two hits before acting if the opponent's SPD isn't also low.

Level scaling preserves the ratio — if all stats scale by the same GROWTH_RATE, floor(A/B) stays roughly constant across levels, so the constitution advantage is maintained.

---

## Damage Formula

```
damage = (atk / def) × movePower × typeMultiplier × random(0.85, 1.0)
```

### Move Power Tiers

| Tier | Power | PP | Description |
|---|---|---|---|
| Light | 40 | 20 | Fast, no drawback — e.g. Ember Snap, Bubble Barrage |
| Medium | 65 | 12 | Standard, may have minor effect — e.g. Stone Toss, Vine Whip |
| Heavy | 90 | 6 | Strong, often recoil or cooldown — e.g. Boulder Crash, Flame Lance |
| Signature | 110 | 3 | Species-unique, always has a special effect |

Stage 2 signature power: 100. Stage 3 signature power: 115.

### Type Multipliers
2× super effective, 1× neutral, 0.5× resisted, 0× immune. Full type chart TBD.

---

## Type Move Pools

| Type | Moves |
|---|---|
| Ignis | Ember Snap (L), Scorch Burst (M), Ash Cloud (M), Flame Lance (H) |
| Aqua | Bubble Barrage (L), Tidal Surge (M), Mist Veil (M — lowers accuracy), Depth Charge (H) |
| Terra | Stone Toss (L), Quake Stomp (M), Boulder Crash (H), Dust Screen (M) |
| Ventus | Gust Slash (L), Tailwind (M — speed boost), Cyclone Cutter (H), Whirlwind Throw (M) |
| Umbra | Shadow Lunge (L), Shade Wrap (M — DoT), Void Pulse (M), Dark Echo (H) |
| Lux | Flash Burst (L — blinds), Radiant Beam (M), Prism Strike (H), Aura Flare (M) |
| Sonus | Resonance Wave (L), Screech (M — debuff), Bass Pulse (M), Echo Slam (H) |
| Arcanus | Sigil Bolt (L), Arcane Shift (M — teleport dodge), Runic Seal (M — inflicts Sealed), Void Arc (H) |
| Spiritus | Ether Touch (L), Soul Drain (M — HP drain), Spectral Veil (M — evasion), Astral Surge (H) |
| Normal | Tackle (L), Quick Strike (L), Headbutt (M), Endeavour (H — damage = HP difference) |
| Flying | Wing Slash (L), Updraft (M — evasion), Dive Bomb (H), Tailfeather Blade (M) |
| Ferrous | Iron Bash (L), Magnetise (M — draws next hit to self), Rust Bite (M), Metal Storm (H) |
| Venom | Poison Fang (L), Toxic Cloud (M), Venom Burst (H), Acid Splash (M) |
| Natura | Spore Cloud (M), Vine Whip (L), Seed Bomb (M), Root Lock (H — immobilise) |

L = Light (40), M = Medium (65), H = Heavy (90)

---

## Signature Moves — Per Evo Stage

Every evo stage has its own signature. Power escalates: Stage 1 = 90, Stage 2 = 100, Stage 3 = 115.

| Species Line | Stage 1 Sig | Stage 2 Sig | Stage 3 Sig |
|---|---|---|---|
| Cindrel / Scaldrix / Pyrathon | Cinder Snap — burn DoT | Magma Crash — def down | Pyroclast — AoE burn |
| Aquill / Tidecrest / Abyssant | Barrel Roll — reflect 50% if hit | Tidal Slam — flinch | Abyssal Surge — multi-hit |
| Brezzet / Galekin / Stormveil | Wind Dart — always goes first | Gale Spin — confuse | Storm Break — hits through evasion |
| Glowick / Lanternis | Pulse Glow — lower enemy SPD | Lantern Burst — blind AoE | — |
| Murkling / Void-Drath | Shadowmeld — untargetable 1 turn | Shade Siphon — drain HP | — |
| Peblix / Crustone / Castellus | Shell Roll — def boost + tackle | Stone Crush — ignore def | Fortress Smash — AoE + def down |
| Humtick / Resonar | Chirp Strike — may paralyse | Resonant Screech — AoE debuff | — |
| Crystub / Gemlash / Prismark | Gem Shard — hits 2-3 times | Crystal Edge — crit boost | Prism Cannon — ignores resist |
| Cloakrit / Wraithel | Void Step — dodge + counter | Abyss Clamp — traps target | — |
| Ashpaw / Cinderox / Emberlord | Ember Pounce — burn on contact | Cinder Roar — ATK debuff AoE | Inferno Crush — massive burn |
| Driftull / Misthorn | Steam Vent — always hits | Scalding Surge — burn + def down | — |
| Buzzlit / Echorex / Stridion | Buzz Dive — speed-based damage | Echo Pulse — sound wave stun | Strident Burst — AoE sonic |
| Galecub / Tempestris | Wind Burst — push + flinch | Tempest Spin — evasion + AoE | — |
| Sporik / Mycorath / Terrafung | Spore Pop — random status | Myco Drain — HP siphon | Terra Bloom — AoE root |
| Spectrix / Auraveil | Prism Refract — splits damage | Aura Shield — absorbs one hit | — |
| Flintlet / Scorchback | Flint Click — burn + low damage | Scorchback Lunge — high burn | — |
| Glintfin / Prismaray / Aurorant | Salt Skate — always crits from behind | Prism Flash — blind all | Aurora Wave — massive Lux AoE |
| Runekit / Cipherast | Sigil Brand — Sealed debuff | Cipher Lock — 2-turn lock | — |
| Windmite / Cyclorid / Vortecis | Sail Spin — dodge + counter | Cyclone Core — wind vortex | Vortex Engine — AoE pull + damage |
| Duskrat / Penumbrix | Shadow Scatter — splits into copies | Penumbra Drain — life steal | — |
| Bassolt / Tremovox / Resonarch | Bass Thump — shockwave | Subwave Pulse — AoE stun | Subsonic Roar — AoE ATK debuff all |
| Glassling / Vitramor | Ether Drift — phasing dodge | Vitreous Beam — Spiritus heavy | — |
| Tidepup / Saltwort / Brinelord | Brine Slap — reduces SPD | Salt Crust — def boost + splash | Brinelord Tide — AoE + salt slow |
| Fluxling / Miragent | Flux Flare — random power | Mirage Dash — confuse on dodge | — |
| Lumenox / Halorath / Solance | Inner Glow — ATK boost | Halo Beam — piercing Lux | Solance Flare — AoE blind + burn |
| Scaldit / Steamback | Steam Pop — always hits | Scalding Back — burn on contact | — |
| Darkspore / Noctiveil / Eclipsus | Spore Drift — poison all | Nocti Veil — blind + poison | Eclipse Burst — AoE darkness + poison |
| Chuffin / Galecluck | Puff Up — intimidate (ATK down) | Gale Cluck — wind + flinch | — |
| Tremlet / Quakehorn | Tremor — ground shake | Quake Horn — single heavy hit | — |
| Omenix | Eclipse Stare — inflicts Fear (skip turn) | — | — |
| Lunveil | — | — | Lunar Rend — AoE, ignores type resistances |

---

## Effect Animations (Reusable Overlays)

Transparent-background overlays, played on top of the defending sprite. ~20 total, 8 frames each.

| Effect Key | Used By |
|---|---|
| fx-burn | Ember Snap, Scorch Burst, Cinder Snap, Cinder Roar |
| fx-explosion | Flame Lance, Depth Charge, Boulder Crash |
| fx-bubble | Bubble Barrage |
| fx-splash | Tidal Surge, Acid Splash |
| fx-mist | Mist Veil, Spore Cloud, Ash Cloud |
| fx-rocks | Stone Toss, Boulder Crash |
| fx-quake | Quake Stomp — screen-shake + dust |
| fx-wind | Gust Slash, Cyclone Cutter, Updraft |
| fx-shadow | Shadow Lunge, Shade Wrap, Shadowmeld |
| fx-dark-pulse | Void Pulse, Dark Echo |
| fx-flash | Flash Burst, Radiant Beam, Halo Beam |
| fx-prism | Prism Strike, Aura Flare, Prism Cannon |
| fx-sound-wave | Resonance Wave, Bass Pulse, Echo Slam |
| fx-screech | Screech, Subsonic Roar |
| fx-sigil | Sigil Bolt, Runic Seal, Sigil Brand |
| fx-vine | Vine Whip, Root Lock |
| fx-seed | Seed Bomb |
| fx-poison | Poison Fang, Toxic Cloud, Venom Burst, Spore Drift |
| fx-iron | Iron Bash, Metal Storm |
| fx-magnetise | Magnetise — visual pull/attract |
| fx-ether | Ether Touch, Soul Drain, Spectral Veil |

Generation: use animate-with-text-v3 with a simple coloured particle/shape as first_frame, transparent background. ~160 frames total.
