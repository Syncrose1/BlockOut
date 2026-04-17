/*
 * Synamon Phase 6 — Recalculate baseStats to BST=360/410/460 archetype system.
 *
 * Usage:
 *   npx tsx scripts/recalc-basestats.ts            # dry run, prints diff
 *   npx tsx scripts/recalc-basestats.ts --write    # writes species.json
 *
 * Three-layer stat model:
 *   Layer 1 — Archetype template (Striker / Tank / Support / Balanced /
 *             Glass Cannon / Bulky Attacker). Stage 1 BST = 360.
 *   Layer 2 — Per-species hand-picked variation within ±15% of template.
 *             BST drift of ±10 allowed. Baked into species.json stage 1.
 *   Layer 3 — Constitution modifiers (see project_synamon_constitutions.md).
 *             Applied at catch/hatch. RUNTIME ONLY — not in species.json.
 *
 * Evolution: stage 1 variation + archetype evo gain block × (stage - 1).
 * Legendaries (Omenix, Lunveil): single-stage, BST=500, bespoke blocks.
 */

import fs from 'node:fs';
import path from 'node:path';

const SPECIES_FILE = path.resolve('public/synamon/species.json');

// --- Archetype templates (Stage 1 BST = 360; legendaries = 500) ---
type StatBlock = { hp: number; atk: number; def: number; spd: number };

const TEMPLATES: Record<string, StatBlock> = {
  tank:           { hp: 105, atk: 65,  def: 135, spd: 55  }, // 360
  striker:        { hp: 70,  atk: 130, def: 50,  spd: 110 }, // 360
  support:        { hp: 90,  atk: 60,  def: 100, spd: 110 }, // 360
  balanced:       { hp: 90,  atk: 90,  def: 90,  spd: 90  }, // 360
  glass_cannon:   { hp: 55,  atk: 140, def: 40,  spd: 125 }, // 360
  bulky_attacker: { hp: 100, atk: 115, def: 80,  spd: 65  }, // 360
  // Legendaries — single-stage, BST = 500, no evolution
  omenix_leg:     { hp: 140, atk: 100, def: 140, spd: 120 }, // 500, mystical support-tank
  lunveil_leg:    { hp: 110, atk: 160, def: 100, spd: 130 }, // 500, offensive apex
};

// --- Evolution gains (+50 BST per stage, weighted by archetype) ---
const EVO_GAINS: Record<string, StatBlock> = {
  tank:           { hp: 20, atk: 10, def: 15, spd: 5  }, // 50
  striker:        { hp: 10, atk: 20, def: 5,  spd: 15 }, // 50
  support:        { hp: 15, atk: 5,  def: 15, spd: 15 }, // 50
  balanced:       { hp: 12, atk: 13, def: 12, spd: 13 }, // 50
  glass_cannon:   { hp: 5,  atk: 25, def: 5,  spd: 15 }, // 50
  bulky_attacker: { hp: 15, atk: 20, def: 10, spd: 5  }, // 50
};

// --- Species → archetype assignments ---
// Confirmed from SYNAMON.md "Role Archetypes" examples. Unlisted species
// assigned based on personality, sig moves, and current stat tendencies.
const SPECIES_ARCHETYPE: Record<string, string> = {
  // Striker (high ATK, high SPD, fragile)
  cindrel:   'striker',    // feisty, restless, ember burst
  ashpaw:    'striker',    // brave, aggressive, wants to fight
  flintlet:  'striker',    // scrappy, independent, pounce
  murkling:  'striker',    // mischievous, shadowmeld assassin
  runekit:   'striker',    // intelligent sigil caster
  duskrat:   'striker',    // skittish shadow assassin
  darkspore: 'striker',    // eerie poisoner

  // Tank (high HP + DEF, low SPD)
  peblix:    'tank',       // stubborn, stony
  tremlet:   'tank',       // timid, gentle earthquake
  bassolt:   'tank',       // grumpy, gruff bassdrum

  // Support (balanced DEF + SPD, low ATK)
  aquill:    'support',    // relaxed, affectionate
  glassling: 'support',    // gentle, dreamy, ether drift
  spectrix:  'support',    // delicate, ethereal prism
  glowick:   'support',    // shy, cautious lantern
  cloakrit:  'support',    // secretive, defensive void
  windmite:  'support',    // stoic, patient dodge-counter

  // Balanced (all equal)
  chuffin:   'balanced',   // charismatic, dramatic normal/flyer
  galecub:   'balanced',   // playful, fast wind cub
  tidepup:   'balanced',   // bouncy, eager
  glintfin:  'balanced',   // graceful, vain
  lumenox:   'balanced',   // warm, steady
  scaldit:   'balanced',   // territorial, proud

  // Glass Cannon (max ATK+SPD, min HP+DEF)
  fluxling:  'glass_cannon', // erratic arcanist
  buzzlit:   'glass_cannon', // energetic, clumsy sonic
  brezzet:   'glass_cannon', // curious wind dart
  humtick:   'glass_cannon', // hyper, chatty, chirp paralyse

  // Bulky Attacker (high HP + ATK, medium DEF)
  driftull:  'bulky_attacker', // lazy, warm, steam vent
  sporik:    'bulky_attacker', // calm philosophical drainer
  crystub:   'bulky_attacker', // gentle, bulky lux gemstone

  // Legendaries (single-stage, BST=500)
  omenix:    'omenix_leg',
  lunveil:   'lunveil_leg',
};

// --- Layer 2: per-species stage-1 variations (hand-picked, ±15% of template,
//     BST drift ±10 allowed). Flavour shift based on type / personality / sig.
//     Legendaries omitted — their template IS the variation.
const SPECIES_VARIATIONS: Record<string, StatBlock> = {
  // ── Strikers (template 70/130/50/110) ────────────────────────────────────
  cindrel:   { hp: 75,  atk: 128, def: 55,  spd: 105 }, // Ignis/Terra ember bruiser — Terra tilt
  ashpaw:    { hp: 75,  atk: 135, def: 55,  spd: 100 }, // Ignis/Ferrous brawler — slight bulk
  flintlet:  { hp: 65,  atk: 125, def: 50,  spd: 120 }, // Ignis/Terra scrappy harasser
  murkling:  { hp: 68,  atk: 125, def: 50,  spd: 120 }, // Umbra ninja, evasive
  runekit:   { hp: 65,  atk: 140, def: 45,  spd: 110 }, // Arcanus caster-striker
  duskrat:   { hp: 62,  atk: 122, def: 48,  spd: 125 }, // Umbra fragile speedster
  darkspore: { hp: 72,  atk: 123, def: 52,  spd: 108 }, // Umbra/Venom DoT, slight bulk

  // ── Tanks (template 105/65/135/55) ───────────────────────────────────────
  peblix:    { hp: 105, atk: 65,  def: 140, spd: 50  }, // Terra/Ferrous classic rock
  tremlet:   { hp: 110, atk: 60,  def: 140, spd: 50  }, // Terra/Ferrous timid wall
  bassolt:   { hp: 100, atk: 72,  def: 130, spd: 60  }, // Sonus/Terra resonator — more atk/spd

  // ── Support (template 90/60/100/110) ─────────────────────────────────────
  aquill:    { hp: 85,  atk: 55,  def: 100, spd: 120 }, // Aqua/Flying graceful
  glassling: { hp: 80,  atk: 55,  def: 95,  spd: 125 }, // Spiritus/Flying phasing dodge
  spectrix:  { hp: 90,  atk: 58,  def: 110, spd: 105 }, // Spiritus/Lux reflecting prism
  glowick:   { hp: 95,  atk: 60,  def: 105, spd: 100 }, // Lux/Natura bulkier quiet support
  cloakrit:  { hp: 85,  atk: 62,  def: 105, spd: 110 }, // Umbra/Venom dodge-counter
  windmite:  { hp: 90,  atk: 58,  def: 100, spd: 115 }, // Ventus/Venom stoic dodger

  // ── Balanced (template 90/90/90/90) ──────────────────────────────────────
  chuffin:   { hp: 92,  atk: 88,  def: 92,  spd: 88  }, // Normal/Flying showy all-round
  galecub:   { hp: 86,  atk: 86,  def: 85,  spd: 103 }, // Ventus zoomies — SPD max within ±15%
  tidepup:   { hp: 95,  atk: 85,  def: 95,  spd: 85  }, // Aqua/Terra bulkier balance
  glintfin:  { hp: 85,  atk: 95,  def: 85,  spd: 95  }, // Lux/Flying graceful crit
  lumenox:   { hp: 95,  atk: 95,  def: 85,  spd: 85  }, // Lux/Ignis warm hitter
  scaldit:   { hp: 95,  atk: 88,  def: 92,  spd: 85  }, // Aqua/Ignis territorial steam

  // ── Glass Cannon (template 55/140/40/125) ────────────────────────────────
  fluxling:  { hp: 52,  atk: 148, def: 38,  spd: 122 }, // Arcanus/Ignis erratic blaster
  buzzlit:   { hp: 55,  atk: 132, def: 38,  spd: 140 }, // Sonus/Flying speed-damage
  brezzet:   { hp: 50,  atk: 128, def: 38,  spd: 143 }, // Ventus/Flying always-first
  humtick:   { hp: 55,  atk: 150, def: 42,  spd: 115 }, // Sonus/Natura paralyse spam

  // ── Bulky Attacker (template 100/115/80/65) ──────────────────────────────
  driftull:  { hp: 110, atk: 115, def: 80,  spd: 58  }, // Aqua/Ignis slow steamroller
  sporik:    { hp: 115, atk: 110, def: 85,  spd: 56  }, // Terra/Natura philosophical drainer
  crystub:   { hp: 100, atk: 120, def: 82,  spd: 62  }, // Lux/Terra multi-hit gem
};

// --- Core recalc ---
function applyGain(base: StatBlock, gain: StatBlock, times: number): StatBlock {
  return {
    hp:  base.hp  + gain.hp  * times,
    atk: base.atk + gain.atk * times,
    def: base.def + gain.def * times,
    spd: base.spd + gain.spd * times,
  };
}

function bst(s: StatBlock): number {
  return s.hp + s.atk + s.def + s.spd;
}

function fmt(s: StatBlock): string {
  return `HP${s.hp} ATK${s.atk} DEF${s.def} SPD${s.spd}`;
}

const VARIATION_MAX_PCT = 0.15;  // Layer 2 per-stat bound
const BST_DRIFT_MAX     = 10;    // Layer 2 total BST drift bound

function validateVariation(speciesId: string, variation: StatBlock, template: StatBlock, targetBST: number): string[] {
  const issues: string[] = [];
  const keys: (keyof StatBlock)[] = ['hp', 'atk', 'def', 'spd'];
  for (const k of keys) {
    const delta = Math.abs(variation[k] - template[k]) / template[k];
    if (delta > VARIATION_MAX_PCT + 1e-9) {
      const pct = (delta * 100).toFixed(1);
      issues.push(`${k} off by ${pct}% (max ${VARIATION_MAX_PCT * 100}%)`);
    }
  }
  const drift = Math.abs(bst(variation) - targetBST);
  if (drift > BST_DRIFT_MAX) {
    issues.push(`BST drift ${drift} (max ${BST_DRIFT_MAX})`);
  }
  return issues;
}

function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');

  const species = JSON.parse(fs.readFileSync(SPECIES_FILE, 'utf8'));
  const archetypeCounts: Record<string, number> = {};
  const allIssues: string[] = [];

  console.log(`\n📊 Synamon Phase 6 — baseStats recalc (3-layer, BST=360/410/460)`);
  console.log(`Mode: ${write ? 'WRITE' : 'dry run'}\n`);

  for (const sp of species) {
    const arch = SPECIES_ARCHETYPE[sp.id];
    if (!arch) {
      console.log(`  ⚠️  No archetype assigned for ${sp.id} — skipping`);
      continue;
    }

    archetypeCounts[arch] = (archetypeCounts[arch] ?? 0) + 1;

    const template = TEMPLATES[arch];
    if (!template) {
      console.log(`  ⚠️  Unknown template ${arch} for ${sp.id} — skipping`);
      continue;
    }

    const isLegendary = arch.endsWith('_leg');
    const evoGain = isLegendary ? null : EVO_GAINS[arch];

    // Stage 1: Layer 1 (template) + Layer 2 (species variation).
    // Legendaries skip Layer 2 — their template is already bespoke.
    const variation = SPECIES_VARIATIONS[sp.id];
    const stage1Stats: StatBlock = isLegendary
      ? { ...template }
      : (variation ?? { ...template });

    // Validate Layer 2 bounds for non-legendaries
    if (!isLegendary) {
      if (!variation) {
        allIssues.push(`${sp.id}: no Layer 2 variation defined (falling back to template)`);
      } else {
        const issues = validateVariation(sp.id, variation, template, 360);
        if (issues.length) {
          allIssues.push(`${sp.id}: ${issues.join(', ')}`);
        }
      }
    }

    const oldBST = bst(sp.baseStats);
    const newBST = bst(stage1Stats);
    console.log(`${sp.id.padEnd(10)} [${arch.padEnd(16)}]  old=${oldBST} new=${newBST}  ${fmt(stage1Stats)}`);
    sp.stages[0].baseStats = stage1Stats;

    // Additional stages: Layer 1 evo gains applied to stage-1 (which includes Layer 2)
    if (!isLegendary && evoGain) {
      for (let i = 1; i < sp.stages.length; i++) {
        const stageStats = applyGain(stage1Stats, evoGain, i);
        const expected = 360 + 50 * i;
        const actual = bst(stageStats);
        console.log(`           stage ${i + 1}: ${fmt(stageStats)}  BST=${actual} (target ${expected}, drift ${actual - expected})`);
        sp.stages[i].baseStats = stageStats;
      }
    }

    // Keep species-level baseStats as stage-1 alias for backwards compat
    sp.baseStats = stage1Stats;
  }

  console.log(`\nArchetype distribution:`);
  for (const [a, n] of Object.entries(archetypeCounts).sort()) {
    console.log(`  ${a.padEnd(16)} ${n}`);
  }

  if (allIssues.length) {
    console.log(`\n⚠️  Validation issues:`);
    for (const msg of allIssues) console.log(`  - ${msg}`);
    if (write) {
      console.log(`\n❌ Refusing to write with validation issues. Fix and retry.`);
      process.exit(1);
    }
  }

  if (write) {
    fs.writeFileSync(SPECIES_FILE, JSON.stringify(species, null, 2));
    console.log(`\n✅ Wrote ${SPECIES_FILE}`);
  } else {
    console.log(`\n💡 Dry run. Re-run with --write to persist.`);
  }
}

main();
