/**
 * Monster state slice — imported and spread into the main Zustand store.
 * Handles: collection, active monster, XP/leveling, battles, evolution, idle decay.
 */

import { v4 as uuid } from 'uuid';
import type { MonsterState, OwnedMonster, BattleParticipant, BattleState } from '../types/monsters';
import type { MonsterSpecies } from '../types/monsters';
import {
  levelFromXp, xpForLevel, applyIdleDecay, feedMonster, playWithMonster,
  shouldEvolve, getBattleStats, calcDamage, xpForBattleWin,
} from '../utils/monsterMath';

// ─── Species Registry ────────────────────────────────────────────────────────
// Populated at runtime from public/monsters/manifest.json
// Kept separate from Zustand (no need to persist static species data)
let speciesRegistry: Record<string, MonsterSpecies> = {};

export function registerSpecies(species: MonsterSpecies[]) {
  speciesRegistry = {};
  for (const s of species) speciesRegistry[s.id] = s;
}

export function getSpecies(id: string): MonsterSpecies | undefined {
  return speciesRegistry[id];
}

// ─── Initial State ────────────────────────────────────────────────────────────

export const initialMonsterState: MonsterState = {
  collection: {},
  activeMonsterUid: null,
  starterChosen: false,
  discoveredSpecies: [],
  totalBattlesWon: 0,
  totalBattlesLost: 0,

  monsterWidgetOpen: false,
  monsterWidgetX: 80,
  monsterWidgetY: 80,

  showCollection: false,
  showBattle: false,
  showEvolution: false,
  evolutionTarget: null,

  battle: {
    isActive: false,
    player: null,
    opponent: null,
    turn: 0,
    log: [],
    outcome: 'ongoing',
    xpReward: 0,
    animating: false,
  },

  pendingXpGain: 0,
};

// ─── Action Implementations ──────────────────────────────────────────────────

function makeMonsterActions(set: (fn: (s: any) => any) => void, get: () => any) {

  // Give XP to the active monster and handle leveling + evolution trigger
  const giveXpToActive = (amount: number) => {
    set((state: any) => {
      const uid = state.monster.activeMonsterUid;
      if (!uid) return state;
      const mon = state.monster.collection[uid];
      if (!mon) return state;

      const newXp = mon.xp + amount;
      const newLevel = levelFromXp(newXp);
      const leveledUp = newLevel > mon.level;

      const updatedMon: OwnedMonster = { ...mon, xp: newXp, level: newLevel };

      // Check evolution
      const species = getSpecies(mon.speciesId);
      let showEvolution = state.monster.showEvolution;
      let evolutionTarget = state.monster.evolutionTarget;

      if (leveledUp && species && shouldEvolve(updatedMon, species)) {
        showEvolution = true;
        evolutionTarget = { uid, fromStage: mon.stage, toStage: mon.stage + 1 };
      }

      return {
        monster: {
          ...state.monster,
          collection: { ...state.monster.collection, [uid]: updatedMon },
          pendingXpGain: amount,
          showEvolution,
          evolutionTarget,
        },
      };
    });
  };

  return {
    // ── Collection management ──────────────────────────────────────────────
    catchMonster: (speciesId: string, nickname?: string) => {
      set((state: any) => {
        const uid = uuid();
        const now = Date.now();
        const newMon: OwnedMonster = {
          uid,
          speciesId,
          stage: 1,
          level: 1,
          xp: 0,
          nickname,
          hunger: 80,
          happiness: 80,
          energy: 100,
          caughtAt: now,
          lastTickAt: now,
        };

        const discovered = state.monster.discoveredSpecies.includes(speciesId)
          ? state.monster.discoveredSpecies
          : [...state.monster.discoveredSpecies, speciesId];

        return {
          monster: {
            ...state.monster,
            collection: { ...state.monster.collection, [uid]: newMon },
            activeMonsterUid: state.monster.activeMonsterUid ?? uid,
            starterChosen: true,
            discoveredSpecies: discovered,
          },
        };
      });
    },

    releaseMonster: (uid: string) => {
      set((state: any) => {
        const { [uid]: _removed, ...rest } = state.monster.collection;
        const newActiveUid = state.monster.activeMonsterUid === uid
          ? (Object.keys(rest)[0] ?? null)
          : state.monster.activeMonsterUid;
        return {
          monster: {
            ...state.monster,
            collection: rest,
            activeMonsterUid: newActiveUid,
          },
        };
      });
    },

    setActiveMonster: (uid: string) => {
      set((state: any) => ({
        monster: { ...state.monster, activeMonsterUid: uid },
      }));
    },

    nicknameMonster: (uid: string, nickname: string) => {
      set((state: any) => {
        const mon = state.monster.collection[uid];
        if (!mon) return state;
        return {
          monster: {
            ...state.monster,
            collection: { ...state.monster.collection, [uid]: { ...mon, nickname } },
          },
        };
      });
    },

    // ── XP / level gains ──────────────────────────────────────────────────
    giveMonsterXp: (amount: number) => giveXpToActive(amount),

    // ── Tamagotchi interactions ───────────────────────────────────────────
    feedActiveMonster: () => {
      set((state: any) => {
        const uid = state.monster.activeMonsterUid;
        const mon = state.monster.collection[uid];
        if (!mon) return state;
        return {
          monster: {
            ...state.monster,
            collection: {
              ...state.monster.collection,
              [uid]: { ...mon, ...feedMonster(mon) },
            },
          },
        };
      });
    },

    playWithActiveMonster: () => {
      set((state: any) => {
        const uid = state.monster.activeMonsterUid;
        const mon = state.monster.collection[uid];
        if (!mon) return state;
        return {
          monster: {
            ...state.monster,
            collection: {
              ...state.monster.collection,
              [uid]: { ...mon, ...playWithMonster(mon) },
            },
          },
        };
      });
    },

    // Run idle decay — call on app focus or periodically
    tickMonsterDecay: () => {
      set((state: any) => {
        const now = Date.now();
        const updatedCollection: Record<string, OwnedMonster> = {};
        for (const [uid, mon] of Object.entries(state.monster.collection as Record<string, OwnedMonster>)) {
          const decay = applyIdleDecay(mon, now);
          updatedCollection[uid] = Object.keys(decay).length ? { ...mon, ...decay } : mon;
        }
        return { monster: { ...state.monster, collection: updatedCollection } };
      });
    },

    // ── Evolution ────────────────────────────────────────────────────────
    confirmEvolution: (uid: string) => {
      set((state: any) => {
        const mon = state.monster.collection[uid];
        if (!mon) return state;
        return {
          monster: {
            ...state.monster,
            collection: {
              ...state.monster.collection,
              [uid]: { ...mon, stage: mon.stage + 1 },
            },
            showEvolution: false,
            evolutionTarget: null,
          },
        };
      });
    },

    // ── UI toggles ────────────────────────────────────────────────────────
    setMonsterWidgetOpen: (open: boolean) => {
      set((state: any) => ({ monster: { ...state.monster, monsterWidgetOpen: open } }));
    },

    setMonsterWidgetPosition: (x: number, y: number) => {
      set((state: any) => ({ monster: { ...state.monster, monsterWidgetX: x, monsterWidgetY: y } }));
    },

    setShowCollection: (show: boolean) => {
      set((state: any) => ({ monster: { ...state.monster, showCollection: show } }));
    },

    setShowBattle: (show: boolean) => {
      set((state: any) => ({ monster: { ...state.monster, showBattle: show } }));
    },

    clearPendingXp: () => {
      set((state: any) => ({ monster: { ...state.monster, pendingXpGain: 0 } }));
    },

    // ── Battle ───────────────────────────────────────────────────────────
    startBattle: (playerUid: string, opponentUid: string) => {
      set((state: any) => {
        const playerMon = state.monster.collection[playerUid] as OwnedMonster;
        const opponentMon = state.monster.collection[opponentUid] as OwnedMonster;
        if (!playerMon || !opponentMon) return state;

        const playerSpecies = getSpecies(playerMon.speciesId);
        const opponentSpecies = getSpecies(opponentMon.speciesId);
        if (!playerSpecies || !opponentSpecies) return state;

        const playerStats = getBattleStats(playerMon, playerSpecies);
        const opponentStats = getBattleStats(opponentMon, opponentSpecies);

        const toParticipant = (mon: OwnedMonster, species: MonsterSpecies, stats: ReturnType<typeof getBattleStats>): BattleParticipant => ({
          uid: mon.uid,
          speciesId: species.id,
          name: mon.nickname ?? species.stages.find(s => s.stage === mon.stage)?.name ?? species.name,
          stage: mon.stage,
          level: mon.level,
          type: species.type,
          ...stats,
        });

        const battle: BattleState = {
          isActive: true,
          player: toParticipant(playerMon, playerSpecies, playerStats),
          opponent: toParticipant(opponentMon, opponentSpecies, opponentStats),
          turn: 1,
          log: [],
          outcome: 'ongoing',
          xpReward: xpForBattleWin(opponentMon.level, playerMon.level),
          animating: false,
        };

        return {
          monster: { ...state.monster, battle, showBattle: true },
        };
      });
    },

    // Execute one full turn (player attacks, then opponent if still alive)
    executeBattleTurn: () => {
      set((state: any) => {
        const b = state.monster.battle as BattleState;
        if (!b.isActive || b.outcome !== 'ongoing' || !b.player || !b.opponent) return state;

        const log = [...b.log];
        let player = { ...b.player };
        let opponent = { ...b.opponent };
        const turn = b.turn;

        // Determine order by speed
        const playerFirst = player.spd >= opponent.spd;
        const first = playerFirst ? player : opponent;
        const second = playerFirst ? opponent : player;

        const attack = (attacker: BattleParticipant, defender: BattleParticipant): { defender: BattleParticipant; event: any } => {
          const dmg = calcDamage(attacker.atk, defender.def, attacker.type, defender.type);
          const effectiveness = Math.abs(dmg / Math.max(1, calcDamage(attacker.atk, defender.def, attacker.type, defender.type, false)) - 1) < 0.01
            ? 'attack' : dmg > attacker.atk ? 'super_effective' : 'not_very_effective';
          const newHp = Math.max(0, defender.currentHp - dmg);
          const message = `${attacker.name} dealt ${dmg} damage!${effectiveness === 'super_effective' ? ' Super effective!' : effectiveness === 'not_very_effective' ? ' Not very effective.' : ''}`;
          return {
            defender: { ...defender, currentHp: newHp },
            event: { turn, actorUid: attacker.uid, targetUid: defender.uid, type: effectiveness, damage: dmg, message },
          };
        };

        // First attacker hits
        const { defender: secondAfterFirst, event: event1 } = attack(first, second);
        log.push(event1);

        let outcome: BattleOutcome = 'ongoing';
        let updatedPlayer = player;
        let updatedOpponent = opponent;

        if (playerFirst) {
          updatedOpponent = secondAfterFirst;
        } else {
          updatedPlayer = secondAfterFirst;
        }

        if (secondAfterFirst.currentHp <= 0) {
          log.push({ turn, actorUid: first.uid, targetUid: second.uid, type: 'fainted', message: `${second.name} fainted!` });
          outcome = playerFirst ? 'player_win' : 'player_lose';
        } else {
          // Second attacker retaliates
          const secondAttacker = playerFirst ? updatedOpponent : updatedPlayer;
          const secondTarget = playerFirst ? updatedPlayer : updatedOpponent;
          const { defender: targetAfter, event: event2 } = attack(secondAttacker, secondTarget);
          log.push(event2);

          if (playerFirst) updatedPlayer = targetAfter;
          else updatedOpponent = targetAfter;

          if (targetAfter.currentHp <= 0) {
            log.push({ turn, actorUid: secondAttacker.uid, targetUid: targetAfter.uid, type: 'fainted', message: `${targetAfter.name} fainted!` });
            outcome = playerFirst ? 'player_lose' : 'player_win';
          }
        }

        const newBattle: BattleState = {
          ...b,
          player: updatedPlayer,
          opponent: updatedOpponent,
          turn: turn + 1,
          log,
          outcome,
          animating: false,
        };

        // Apply battle results to collection
        let newCollection = state.monster.collection;
        let totalBattlesWon = state.monster.totalBattlesWon;
        let totalBattlesLost = state.monster.totalBattlesLost;

        if (outcome !== 'ongoing') {
          const playerUid = b.player!.uid;
          const playerMon = state.monster.collection[playerUid] as OwnedMonster;
          if (outcome === 'player_win') {
            totalBattlesWon++;
            // Give XP to player monster
            const newXp = playerMon.xp + b.xpReward;
            newCollection = {
              ...newCollection,
              [playerUid]: {
                ...playerMon,
                xp: newXp,
                level: levelFromXp(newXp),
                energy: Math.max(0, playerMon.energy - 20),
              },
            };
          } else {
            totalBattlesLost++;
            // Drain energy on loss, give consolation XP
            const newXp = playerMon.xp + Math.floor(b.xpReward * 0.3);
            newCollection = {
              ...newCollection,
              [playerUid]: {
                ...playerMon,
                xp: newXp,
                level: levelFromXp(newXp),
                energy: Math.max(0, playerMon.energy - 10),
              },
            };
          }
        }

        return {
          monster: {
            ...state.monster,
            battle: newBattle,
            collection: newCollection,
            totalBattlesWon,
            totalBattlesLost,
          },
        };
      });
    },

    endBattle: () => {
      set((state: any) => ({
        monster: {
          ...state.monster,
          showBattle: false,
          battle: {
            ...initialMonsterState.battle,
          },
        },
      }));
    },
  };
}

type MonsterActions = ReturnType<typeof makeMonsterActions>;

export type { MonsterActions };
export { makeMonsterActions };
