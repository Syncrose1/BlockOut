// ─── Synamon Types ────────────────────────────────────────────────────────────

// 8 elemental types
export type SynamonElementType =
  | 'Ignis' | 'Aqua' | 'Terra' | 'Ventus'
  | 'Umbra' | 'Lux' | 'Sonus' | 'Arcanus';

// 4 physical/trait types
export type SynamonTraitType = 'Flying' | 'Ferrous' | 'Venom' | 'Natura';

export type SynamonType = SynamonElementType | SynamonTraitType;

export interface SynamonBaseStats {
  hp: number;
  atk: number;
  def: number;
  spd: number;
}

export interface SynamonStageAssets {
  stage: number;
  name: string;
  sprite: string | null;          // path to sprite PNG, null = not yet generated
  idleFrames: string[];           // paths to idle animation frames
  attackFrames: string[];         // paths to attack animation frames
  evolveAt?: number;              // level required to evolve to next stage
}

export interface SynamonSpecies {
  id: string;                     // slug, e.g. "cindrel"
  name: string;                   // display name, e.g. "Cindrel"
  type: SynamonType;
  secondaryType?: SynamonType;
  baseStats: SynamonBaseStats;
  stages: SynamonStageAssets[];
  dexEntry?: string;              // pokédex-style description
  animations?: Record<string, string[]>;  // e.g. "stage1-idle" → [frame paths]
}

// ─── Owned Synamon Instance ───────────────────────────────────────────────────

export interface OwnedSynamon {
  uid: string;                    // unique instance ID (uuid)
  speciesId: string;
  stage: number;                  // current evolution stage (1, 2, 3...)
  level: number;
  xp: number;                     // total XP accumulated
  nickname?: string;
  zoneKey?: string;               // world zone the companion lives in

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

// ─── Daily XP Tracking ───────────────────────────────────────────────────────

export interface DailyXp {
  blockout: number;               // XP earned from BlockOut today (cap 100)
  synamon: number;                // XP earned from Synamon app today (cap 100)
  resetDate: string;              // YYYY-MM-DD, resets at midnight
}

// ─── Pending Events ──────────────────────────────────────────────────────────

export type PendingEventType = 'evolution' | 'new_move';

export interface PendingEvent {
  type: PendingEventType;
  message: string;
}

// ─── Battle Types ─────────────────────────────────────────────────────────────

export type BattleParticipant = {
  uid: string;                    // OwnedSynamon uid
  speciesId: string;
  name: string;
  stage: number;
  level: number;
  maxHp: number;
  currentHp: number;
  atk: number;
  def: number;
  spd: number;
  type: SynamonType;
  secondaryType?: SynamonType;
};

export type BattleEventType =
  | 'attack'
  | 'miss'
  | 'super_effective'
  | 'not_very_effective'
  | 'fainted';

export interface BattleEvent {
  turn: number;
  actorUid: string;
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
  xpReward: number;
  animating: boolean;
}

// ─── Synamon Store State ──────────────────────────────────────────────────────

export interface SynamonState {
  collection: Record<string, OwnedSynamon>;     // uid → OwnedSynamon
  activeUid: string | null;                     // shown in widget
  starterChosen: boolean;
  discoveredSpecies: string[];                  // species IDs the player has seen
  totalBattlesWon: number;
  totalBattlesLost: number;

  // Widget UI
  widgetOpen: boolean;
  widgetX: number;
  widgetY: number;

  // Modal UI
  showCollection: boolean;
  showBattle: boolean;
  showEvolution: boolean;
  evolutionTarget: { uid: string; fromStage: number; toStage: number } | null;

  // Battle
  battle: BattleState;

  // Pending XP notification for widget (flash +XP text)
  pendingXpGain: number;

  // Companion panel (slides up from bottom)
  panelOpen: boolean;

  // Daily XP tracking (capped per source)
  dailyXp: DailyXp;

  // Stalled events — resolved in Synamon app, displayed as banners in BlockOut
  pendingEvents: PendingEvent[];

  // Temporary animation override (e.g. 'feed', 'pet', 'play' after care action)
  activeAnimation: string | null;
}
