import type {
  OwnedMonster, MonsterSpecies, MonsterBaseStats,
  BattleParticipant, MonsterType,
} from '../types/monsters';

// ─── XP & Leveling ──────────────────────────────────────────────────────────

// XP required to reach a given level (uses a "medium-fast" curve similar to Gen I Pokémon)
export function xpForLevel(level: number): number {
  return Math.floor((4 / 5) * Math.pow(level, 3));
}

// Current level from total accumulated XP
export function levelFromXp(xp: number): number {
  let level = 1;
  while (level < 100 && xpForLevel(level + 1) <= xp) level++;
  return level;
}

// XP gained from completing a task (weight 1–5 scales reward)
export function xpForTaskCompletion(taskWeight: number = 1): number {
  return 8 + (taskWeight - 1) * 4; // 8, 12, 16, 20, 24
}

// XP gained from completing a pomodoro work session (25 min default)
export function xpForPomodoroSession(): number {
  return 20;
}

// XP gained from winning a battle
export function xpForBattleWin(opponentLevel: number, playerLevel: number): number {
  const levelDiff = Math.max(1, opponentLevel - playerLevel + 10);
  return Math.floor(15 * levelDiff / 10);
}

// ─── Stat Calculation ────────────────────────────────────────────────────────

// Scale a base stat to a given level (simplified Gen III formula)
export function calcStat(base: number, level: number): number {
  return Math.floor(((2 * base * level) / 100) + 5);
}

export function calcHp(base: number, level: number): number {
  return Math.floor(((2 * base * level) / 100) + level + 10);
}

export function getBattleStats(
  monster: OwnedMonster,
  species: MonsterSpecies,
): Omit<BattleParticipant, 'uid' | 'name' | 'stage' | 'type'> {
  const stats = species.baseStats;
  const lvl = monster.level;
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

// ─── Type Effectiveness ──────────────────────────────────────────────────────

// Simplified type chart (attacker type → defender type → multiplier)
const TYPE_CHART: Partial<Record<MonsterType, Partial<Record<MonsterType, number>>>> = {
  fire:     { grass: 2, water: 0.5, fire: 0.5, earth: 0.5 },
  water:    { fire: 2, grass: 0.5, water: 0.5, electric: 0.5 },
  grass:    { water: 2, fire: 0.5, grass: 0.5, poison: 0.5 },
  electric: { water: 2, grass: 0.5, electric: 0.5, earth: 0 },
  dark:     { psychic: 2, light: 0.5, dark: 0.5 },
  light:    { dark: 2, psychic: 0.5 },
  earth:    { electric: 2, fire: 2, grass: 0.5, wind: 0.5 },
  wind:     { grass: 2, earth: 0 },
  poison:   { grass: 2, poison: 0.5, earth: 0.5 },
  psychic:  { poison: 2, dark: 0, psychic: 0.5 },
};

export function typeEffectiveness(attackerType: MonsterType, defenderType: MonsterType): number {
  return TYPE_CHART[attackerType]?.[defenderType] ?? 1;
}

// ─── Damage Formula ──────────────────────────────────────────────────────────

export function calcDamage(
  attackerAtk: number,
  defenderDef: number,
  attackerType: MonsterType,
  defenderType: MonsterType,
  randomFactor = true,
): number {
  const effectiveness = typeEffectiveness(attackerType, defenderType);
  const random = randomFactor ? 0.85 + Math.random() * 0.15 : 1;
  const base = Math.max(1, Math.floor(
    ((attackerAtk * 0.4) - (defenderDef * 0.2)) * effectiveness * random
  ));
  return Math.max(1, base);
}

// ─── Idle Decay ──────────────────────────────────────────────────────────────

// How many hours until each stat fully depletes from 100 → 0
const HUNGER_HOURS_TO_ZERO = 16;
const HAPPINESS_HOURS_TO_ZERO = 24;
const ENERGY_REGEN_HOURS = 8; // hours to fully recover from 0

export function applyIdleDecay(
  monster: OwnedMonster,
  nowMs: number,
): Partial<OwnedMonster> {
  const hoursElapsed = (nowMs - monster.lastTickAt) / (1000 * 60 * 60);
  if (hoursElapsed < 0.01) return {}; // no meaningful time passed

  const hungerDecay = (hoursElapsed / HUNGER_HOURS_TO_ZERO) * 100;
  const happinessDecay = monster.hunger <= 10
    ? (hoursElapsed / (HAPPINESS_HOURS_TO_ZERO / 3)) * 100  // faster when starving
    : (hoursElapsed / HAPPINESS_HOURS_TO_ZERO) * 100;
  const energyRegen = (hoursElapsed / ENERGY_REGEN_HOURS) * 100;

  return {
    hunger: Math.max(0, monster.hunger - hungerDecay),
    happiness: Math.max(0, monster.happiness - happinessDecay),
    energy: Math.min(100, monster.energy + energyRegen),
    lastTickAt: nowMs,
  };
}

// ─── Evolution Check ─────────────────────────────────────────────────────────

export function shouldEvolve(
  monster: OwnedMonster,
  species: MonsterSpecies,
): boolean {
  const currentStageData = species.stages.find(s => s.stage === monster.stage);
  if (!currentStageData?.evolveAt) return false;
  const nextStageData = species.stages.find(s => s.stage === monster.stage + 1);
  if (!nextStageData?.sprite) return false; // no sprite generated yet
  return monster.level >= currentStageData.evolveAt;
}

// ─── Feed / Play ─────────────────────────────────────────────────────────────

export function feedMonster(monster: OwnedMonster): Partial<OwnedMonster> {
  return {
    hunger: Math.min(100, monster.hunger + 35),
    happiness: Math.min(100, monster.happiness + 5),
    lastFedAt: Date.now(),
  };
}

export function playWithMonster(monster: OwnedMonster): Partial<OwnedMonster> {
  return {
    happiness: Math.min(100, monster.happiness + 25),
    energy: Math.max(0, monster.energy - 10),
    lastPlayedAt: Date.now(),
  };
}

// ─── Mood Helpers ────────────────────────────────────────────────────────────

export type MonsterMood = 'happy' | 'content' | 'hungry' | 'sad' | 'exhausted';

export function getMonsterMood(monster: OwnedMonster): MonsterMood {
  if (monster.energy < 15) return 'exhausted';
  if (monster.hunger < 20) return 'hungry';
  if (monster.happiness < 25) return 'sad';
  if (monster.happiness > 70 && monster.hunger > 60) return 'happy';
  return 'content';
}

export function getMoodLabel(mood: MonsterMood): string {
  switch (mood) {
    case 'happy': return 'Happy!';
    case 'content': return 'Content';
    case 'hungry': return 'Hungry...';
    case 'sad': return 'Feeling blue';
    case 'exhausted': return 'Exhausted';
  }
}
