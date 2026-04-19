import type {
  OwnedSynamon, SynamonSpecies, SynamonBaseStats,
  BattleParticipant, SynamonType,
} from '../types/synamon';

// ─── XP & Leveling ───────────────────────────────────────────────────────────

export function xpForLevel(level: number): number {
  return Math.floor((4 / 5) * Math.pow(level, 3));
}

export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < 100 && xpForLevel(level + 1) <= xp) level++;
  return level;
}

export function xpForTaskCompletion(taskWeight: number = 1): number {
  return 8 + (taskWeight - 1) * 4; // 8, 12, 16, 20, 24
}

export function xpForPomodoroSession(): number {
  return 20;
}

export function xpForChainStep(): number {
  return 5;
}

export function xpForBattleWin(opponentLevel: number, playerLevel: number): number {
  const levelDiff = Math.max(1, opponentLevel - playerLevel + 10);
  return Math.floor(15 * levelDiff / 10);
}

// ─── Stat Calculation ─────────────────────────────────────────────────────────

export function calcStat(base: number, level: number): number {
  return Math.floor(((2 * base * level) / 100) + 5);
}

export function calcHp(base: number, level: number): number {
  return Math.floor(((2 * base * level) / 100) + level + 10);
}

export function getBattleStats(
  synamon: OwnedSynamon,
  species: SynamonSpecies,
): Omit<BattleParticipant, 'uid' | 'name' | 'stage' | 'type' | 'secondaryType'> {
  const stats = species.baseStats;
  const lvl = synamon.level;
  const maxHp = calcHp(stats.hp, lvl);
  return {
    speciesId: species.id,
    level: lvl,
    maxHp,
    currentHp: maxHp,
    atk: calcStat(stats.atk, lvl),
    def: calcStat(stats.def, lvl),
    spd: calcStat(stats.spd, lvl),
  };
}

// ─── Type Effectiveness ───────────────────────────────────────────────────────

// Type chart: attacker → defender → multiplier
// 12 types: Ignis, Aqua, Terra, Ventus, Umbra, Lux, Sonus, Arcanus, Flying, Ferrous, Venom, Natura
const TYPE_CHART: Partial<Record<SynamonType, Partial<Record<SynamonType, number>>>> = {
  // Elemental
  Ignis:   { Terra: 0.5, Aqua: 0.5, Ignis: 0.5, Natura: 2, Ferrous: 2, Flying: 0.5 },
  Aqua:    { Ignis: 2, Terra: 2, Aqua: 0.5, Ventus: 0.5, Sonus: 0.5 },
  Terra:   { Ignis: 2, Lux: 0.5, Ventus: 2, Flying: 0 },
  Ventus:  { Terra: 0.5, Natura: 2, Sonus: 2, Flying: 2 },
  Umbra:   { Lux: 0.5, Arcanus: 2, Umbra: 0.5 },
  Lux:     { Umbra: 2, Arcanus: 0.5, Lux: 0.5 },
  Sonus:   { Ferrous: 2, Arcanus: 2, Sonus: 0.5, Terra: 0.5 },
  Arcanus: { Umbra: 0, Arcanus: 0.5, Lux: 2 },
  // Trait
  Flying:  { Natura: 2, Terra: 0, Ventus: 0.5, Ferrous: 0.5 },
  Ferrous: { Lux: 2, Terra: 2, Ferrous: 0.5, Ignis: 0.5, Aqua: 0.5 },
  Venom:   { Natura: 2, Venom: 0.5, Terra: 0.5, Ferrous: 0 },
  Natura:  { Aqua: 2, Terra: 2, Ignis: 0.5, Natura: 0.5, Flying: 0.5, Venom: 0.5 },
};

export function typeEffectiveness(attackerType: SynamonType, defenderType: SynamonType): number {
  return TYPE_CHART[attackerType]?.[defenderType] ?? 1;
}

// Dual-type defence: multiply both effectiveness values
export function typeEffectivenessVs(
  attackerType: SynamonType,
  defenderPrimary: SynamonType,
  defenderSecondary?: SynamonType,
): number {
  const primary = typeEffectiveness(attackerType, defenderPrimary);
  const secondary = defenderSecondary ? typeEffectiveness(attackerType, defenderSecondary) : 1;
  return primary * secondary;
}

// ─── Damage Formula ───────────────────────────────────────────────────────────

export function calcDamage(
  attackerAtk: number,
  defenderDef: number,
  attackerType: SynamonType,
  defenderPrimary: SynamonType,
  defenderSecondary?: SynamonType,
  randomFactor = true,
): number {
  const effectiveness = typeEffectivenessVs(attackerType, defenderPrimary, defenderSecondary);
  const random = randomFactor ? 0.85 + Math.random() * 0.15 : 1;
  const base = Math.max(1, Math.floor(
    ((attackerAtk * 0.4) - (defenderDef * 0.2)) * effectiveness * random
  ));
  return Math.max(1, base);
}

// ─── Idle Decay ───────────────────────────────────────────────────────────────

const HUNGER_HOURS_TO_ZERO = 16;
const HAPPINESS_HOURS_TO_ZERO = 24;
const ENERGY_REGEN_HOURS = 8;

export function applyIdleDecay(
  synamon: OwnedSynamon,
  nowMs: number,
): Partial<OwnedSynamon> {
  const hoursElapsed = (nowMs - synamon.lastTickAt) / (1000 * 60 * 60);
  if (hoursElapsed < 0.01) return {};

  const hungerDecay = (hoursElapsed / HUNGER_HOURS_TO_ZERO) * 100;
  const happinessDecay = synamon.hunger <= 10
    ? (hoursElapsed / (HAPPINESS_HOURS_TO_ZERO / 3)) * 100
    : (hoursElapsed / HAPPINESS_HOURS_TO_ZERO) * 100;
  const energyRegen = (hoursElapsed / ENERGY_REGEN_HOURS) * 100;

  return {
    hunger: Math.max(0, synamon.hunger - hungerDecay),
    happiness: Math.max(0, synamon.happiness - happinessDecay),
    energy: Math.min(100, synamon.energy + energyRegen),
    lastTickAt: nowMs,
  };
}

// ─── Evolution Check ──────────────────────────────────────────────────────────

export function shouldEvolve(
  synamon: OwnedSynamon,
  species: SynamonSpecies,
): boolean {
  const currentStageData = species.stages.find(s => s.stage === synamon.stage);
  if (!currentStageData?.evolveAt) return false;
  const nextStageData = species.stages.find(s => s.stage === synamon.stage + 1);
  if (!nextStageData?.sprite) return false;
  return synamon.level >= currentStageData.evolveAt;
}

// ─── Feed / Play ──────────────────────────────────────────────────────────────

export function feedSynamon(synamon: OwnedSynamon): Partial<OwnedSynamon> {
  return {
    hunger: Math.min(100, synamon.hunger + 35),
    happiness: Math.min(100, synamon.happiness + 5),
    lastFedAt: Date.now(),
  };
}

export function playWithSynamon(synamon: OwnedSynamon): Partial<OwnedSynamon> {
  return {
    happiness: Math.min(100, synamon.happiness + 25),
    energy: Math.max(0, synamon.energy - 10),
    lastPlayedAt: Date.now(),
  };
}

// ─── Mood Helpers ─────────────────────────────────────────────────────────────

export type SynamonMood = 'happy' | 'content' | 'hungry' | 'sad' | 'exhausted';

export function getSynamonMood(synamon: OwnedSynamon): SynamonMood {
  if (synamon.energy < 15) return 'exhausted';
  if (synamon.hunger < 20) return 'hungry';
  if (synamon.happiness < 25) return 'sad';
  if (synamon.happiness > 70 && synamon.hunger > 60) return 'happy';
  return 'content';
}

export function getMoodLabel(mood: SynamonMood): string {
  switch (mood) {
    case 'happy': return 'Happy!';
    case 'content': return 'Content';
    case 'hungry': return 'Hungry...';
    case 'sad': return 'Feeling blue';
    case 'exhausted': return 'Exhausted';
  }
}
