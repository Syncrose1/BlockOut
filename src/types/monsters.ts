// ─── Monster Types ──────────────────────────────────────────────────────────

export type MonsterType =
  | 'fire' | 'water' | 'grass' | 'electric' | 'dark'
  | 'light' | 'earth' | 'wind' | 'poison' | 'psychic';

export interface MonsterBaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface MonsterStageAssets {
  stage: number;
  name: string;
  sprite: string | null;          // path to sprite PNG, null = not yet generated
  idleFrames: string[];           // paths to idle animation frames
  attackFrames: string[];         // paths to attack animation frames
  evolveAt?: number;              // level required to evolve to next stage
}

export interface MonsterSpecies {
  id: string;                     // slug, e.g. "emberfox"
  name: string;                   // display name, e.g. "Emberfox"
  type: MonsterType;
  baseStats: MonsterBaseStats;
  stages: MonsterStageAssets[];
}

// ─── Owned Monster Instance ──────────────────────────────────────────────────

export interface OwnedMonster {
  uid: string;                    // unique instance ID (uuid)
  speciesId: string;
  stage: number;                  // current evolution stage (1, 2, 3...)
  level: number;
  xp: number;                     // total XP accumulated
  nickname?: string;

  // Tamagotchi stats (0–100, decay over real time)
  hunger: number;                 // decreases ~1/hr; 0 = starving
  happiness: number;              // decreases ~0.5/hr; 0 = depressed
  energy: number;                 // decreases with battles, recovers with rest

  caughtAt: number;               // timestamp
  lastTickAt: number;             // timestamp of last idle decay tick
  lastFedAt?: number;
  lastPlayedAt?: number;

  // Battle stats (recalculated from species+level on demand)
  currentHp?: number;             // only set during active battle
}

// ─── Battle Types ────────────────────────────────────────────────────────────

export type BattleParticipant = {
  uid: string;                    // OwnedMonster uid
  speciesId: string;
  name: string;
  stage: number;
  level: number;
  maxHp: number;
  currentHp: number;
  atk: number;
  def: number;
  spd: number;
  type: MonsterType;
};

export type BattleEventType =
  | 'attack'
  | 'miss'
  | 'super_effective'
  | 'not_very_effective'
  | 'fainted';

export interface BattleEvent {
  turn: number;
  actorUid: string;               // who acted
  targetUid: string;
  type: BattleEventType;
  damage?: number;
  message: string;
}

export type BattleOutcome = 'player_win' | 'player_lose' | 'ongoing';

export interface BattleState {
  isActive: boolean;
  player: BattleParticipant | null;
  opponent: BattleParticipant | null;
  turn: number;
  log: BattleEvent[];
  outcome: BattleOutcome;
  xpReward: number;               // XP given to winner at end
  animating: boolean;             // true while an attack animation plays
}

// ─── Monster Store State ─────────────────────────────────────────────────────

export interface MonsterState {
  collection: Record<string, OwnedMonster>;     // uid → OwnedMonster
  activeMonsterUid: string | null;              // shown in widget
  starterChosen: boolean;
  discoveredSpecies: string[];                  // species IDs the player has seen
  totalBattlesWon: number;
  totalBattlesLost: number;

  // Widget UI
  monsterWidgetOpen: boolean;
  monsterWidgetX: number;
  monsterWidgetY: number;

  // Modal UI
  showCollection: boolean;
  showBattle: boolean;
  showEvolution: boolean;          // plays the evolution cutscene
  evolutionTarget: { uid: string; fromStage: number; toStage: number } | null;

  // Battle
  battle: BattleState;

  // Pending XP notification for widget (flash +XP text)
  pendingXpGain: number;
}
