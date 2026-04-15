---
name: Synamon Constitutions
description: 16 preset stat modifier profiles assigned at catch/hatch, providing controlled individual variation within archetypes
type: project
---

# Synamon Constitutions (Locked — 2026-04-12)

Each Synamon is assigned one Constitution at catch/hatch. It applies percentage multipliers to base stats. Multipliers are approximately zero-sum — BST is preserved.

Species have a weak personality correlation (e.g. Cindrel more likely to roll Short-fuse/Reckless) but it is not deterministic — any species can roll any constitution.

## Constitution Table

| Constitution | Flavour | HP | ATK | DEF | SPD |
|---|---|---|---|---|---|
| Hardy | Perfectly balanced, no modifier | — | — | — | — |
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
| Vigorous | Robust all-rounder, no real weakness | +10% | +10% | +10% | -20% |
| Frail | Extreme glass cannon | -25% | +30% | -25% | +20% |
| Lumbering | Heavy hitter, poor speed | +15% | +15% | +10% | -40% |
| Timid | Defensive, avoids direct conflict | +10% | -20% | +20% | -10% |
| Spirited | Balanced burst, energetic | — | +10% | -10% | +10% |

## SPD Note

SPD is an action-threshold stat, not a continuous initiative value:

```
attacksThisTurn = floor(yourSPD / enemySPD)   [minimum 1]
```

The two meaningful thresholds: yourSPD > enemySPD (act first), yourSPD ≥ 2× enemySPD (double action). This makes SPD constitutions high-stakes — Skittish (+40% SPD) can double-act most opponents but is paper-thin; Sluggish (-40% SPD) can take 2 hits before acting if the enemy isn't also slow.
