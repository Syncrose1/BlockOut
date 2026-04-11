/**
 * Synamon state slice — imported and spread into the main Zustand store.
 * Handles: collection, active synamon, XP/leveling, battles, evolution, idle decay.
 */

import { v4 as uuid } from 'uuid';
import type { SynamonState, OwnedSynamon, BattleParticipant, BattleState } from '../types/synamon';
import type { SynamonSpecies } from '../types/synamon';
import {
  levelFromXp, xpForLevel, applyIdleDecay, feedSynamon, playWithSynamon,
  shouldEvolve, getBattleStats, calcDamage, xpForBattleWin,
} from '../utils/synamonMath';

// ─── Species Registry ─────────────────────────────────────────────────────────
// Populated at runtime from public/synamon/manifest.json
let speciesRegistry: Record<string, SynamonSpecies> = {};

export function registerSpecies(species: SynamonSpecies[]) {
  speciesRegistry = {};
  for (const s of species) speciesRegistry[s.id] = s;
}

export function getSpecies(id: string): SynamonSpecies | undefined {
  return speciesRegistry[id];
}

// ─── Initial State ────────────────────────────────────────────────────────────

export const initialSynamonState: SynamonState = {
  collection: {},
  activeUid: null,
  starterChosen: false,
  discoveredSpecies: [],
  totalBattlesWon: 0,
  totalBattlesLost: 0,

  widgetOpen: false,
  widgetX: 80,
  widgetY: 80,

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

// ─── Action Implementations ───────────────────────────────────────────────────

function makeSynamonActions(set: (fn: (s: any) => any) => void, get: () => any) {

  const giveXpToActive = (amount: number) => {
    set((state: any) => {
      const uid = state.synamon.activeUid;
      if (!uid) return state;
      const syn = state.synamon.collection[uid];
      if (!syn) return state;

      const newXp = syn.xp + amount;
      const newLevel = levelFromXp(newXp);
      const leveledUp = newLevel > syn.level;

      const updated: OwnedSynamon = { ...syn, xp: newXp, level: newLevel };

      const species = getSpecies(syn.speciesId);
      let showEvolution = state.synamon.showEvolution;
      let evolutionTarget = state.synamon.evolutionTarget;

      if (leveledUp && species && shouldEvolve(updated, species)) {
        showEvolution = true;
        evolutionTarget = { uid, fromStage: syn.stage, toStage: syn.stage + 1 };
      }

      return {
        synamon: {
          ...state.synamon,
          collection: { ...state.synamon.collection, [uid]: updated },
          pendingXpGain: amount,
          showEvolution,
          evolutionTarget,
        },
      };
    });
  };

  return {
    // ── Collection management ─────────────────────────────────────────────
    catchSynamon: (speciesId: string, nickname?: string) => {
      set((state: any) => {
        const uid = uuid();
        const now = Date.now();
        const newSyn: OwnedSynamon = {
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

        const discovered = state.synamon.discoveredSpecies.includes(speciesId)
          ? state.synamon.discoveredSpecies
          : [...state.synamon.discoveredSpecies, speciesId];

        return {
          synamon: {
            ...state.synamon,
            collection: { ...state.synamon.collection, [uid]: newSyn },
            activeUid: state.synamon.activeUid ?? uid,
            starterChosen: true,
            discoveredSpecies: discovered,
          },
        };
      });
    },

    releaseSynamon: (uid: string) => {
      set((state: any) => {
        const { [uid]: _removed, ...rest } = state.synamon.collection;
        const newActiveUid = state.synamon.activeUid === uid
          ? (Object.keys(rest)[0] ?? null)
          : state.synamon.activeUid;
        return {
          synamon: {
            ...state.synamon,
            collection: rest,
            activeUid: newActiveUid,
          },
        };
      });
    },

    setActiveSynamon: (uid: string) => {
      set((state: any) => ({
        synamon: { ...state.synamon, activeUid: uid },
      }));
    },

    nicknameSynamon: (uid: string, nickname: string) => {
      set((state: any) => {
        const syn = state.synamon.collection[uid];
        if (!syn) return state;
        return {
          synamon: {
            ...state.synamon,
            collection: { ...state.synamon.collection, [uid]: { ...syn, nickname } },
          },
        };
      });
    },

    // ── XP / level gains ──────────────────────────────────────────────────
    giveSynamonXp: (amount: number) => giveXpToActive(amount),

    // ── Tamagotchi interactions ───────────────────────────────────────────
    feedActiveSynamon: () => {
      set((state: any) => {
        const uid = state.synamon.activeUid;
        const syn = state.synamon.collection[uid];
        if (!syn) return state;
        return {
          synamon: {
            ...state.synamon,
            collection: {
              ...state.synamon.collection,
              [uid]: { ...syn, ...feedSynamon(syn) },
            },
          },
        };
      });
    },

    playWithActiveSynamon: () => {
      set((state: any) => {
        const uid = state.synamon.activeUid;
        const syn = state.synamon.collection[uid];
        if (!syn) return state;
        return {
          synamon: {
            ...state.synamon,
            collection: {
              ...state.synamon.collection,
              [uid]: { ...syn, ...playWithSynamon(syn) },
            },
          },
        };
      });
    },

    tickSynamonDecay: () => {
      set((state: any) => {
        const now = Date.now();
        const updatedCollection: Record<string, OwnedSynamon> = {};
        for (const [uid, syn] of Object.entries(state.synamon.collection as Record<string, OwnedSynamon>)) {
          const decay = applyIdleDecay(syn, now);
          updatedCollection[uid] = Object.keys(decay).length ? { ...syn, ...decay } : syn;
        }
        return { synamon: { ...state.synamon, collection: updatedCollection } };
      });
    },

    // ── Evolution ─────────────────────────────────────────────────────────
    confirmEvolution: (uid: string) => {
      set((state: any) => {
        const syn = state.synamon.collection[uid];
        if (!syn) return state;
        return {
          synamon: {
            ...state.synamon,
            collection: {
              ...state.synamon.collection,
              [uid]: { ...syn, stage: syn.stage + 1 },
            },
            showEvolution: false,
            evolutionTarget: null,
          },
        };
      });
    },

    // ── UI toggles ────────────────────────────────────────────────────────
    setSynamonWidgetOpen: (open: boolean) => {
      set((state: any) => ({ synamon: { ...state.synamon, widgetOpen: open } }));
    },

    setSynamonWidgetPosition: (x: number, y: number) => {
      set((state: any) => ({ synamon: { ...state.synamon, widgetX: x, widgetY: y } }));
    },

    setShowCollection: (show: boolean) => {
      set((state: any) => ({ synamon: { ...state.synamon, showCollection: show } }));
    },

    setShowBattle: (show: boolean) => {
      set((state: any) => ({ synamon: { ...state.synamon, showBattle: show } }));
    },

    clearPendingXp: () => {
      set((state: any) => ({ synamon: { ...state.synamon, pendingXpGain: 0 } }));
    },

    // ── Battle ────────────────────────────────────────────────────────────
    startBattle: (playerUid: string, opponentUid: string) => {
      set((state: any) => {
        const playerSyn = state.synamon.collection[playerUid] as OwnedSynamon;
        const opponentSyn = state.synamon.collection[opponentUid] as OwnedSynamon;
        if (!playerSyn || !opponentSyn) return state;

        const playerSpecies = getSpecies(playerSyn.speciesId);
        const opponentSpecies = getSpecies(opponentSyn.speciesId);
        if (!playerSpecies || !opponentSpecies) return state;

        const playerStats = getBattleStats(playerSyn, playerSpecies);
        const opponentStats = getBattleStats(opponentSyn, opponentSpecies);

        const toParticipant = (syn: OwnedSynamon, species: SynamonSpecies, stats: ReturnType<typeof getBattleStats>): BattleParticipant => ({
          uid: syn.uid,
          speciesId: species.id,
          name: syn.nickname ?? species.stages.find(s => s.stage === syn.stage)?.name ?? species.name,
          stage: syn.stage,
          level: syn.level,
          type: species.type,
          secondaryType: species.secondaryType,
          ...stats,
        });

        const battle: BattleState = {
          isActive: true,
          player: toParticipant(playerSyn, playerSpecies, playerStats),
          opponent: toParticipant(opponentSyn, opponentSpecies, opponentStats),
          turn: 1,
          log: [],
          outcome: 'ongoing',
          xpReward: xpForBattleWin(opponentSyn.level, playerSyn.level),
          animating: false,
        };

        return {
          synamon: { ...state.synamon, battle, showBattle: true },
        };
      });
    },

    executeBattleTurn: () => {
      set((state: any) => {
        const b = state.synamon.battle as BattleState;
        if (!b.isActive || b.outcome !== 'ongoing' || !b.player || !b.opponent) return state;

        const log = [...b.log];
        let player = { ...b.player };
        let opponent = { ...b.opponent };
        const turn = b.turn;

        type BattleOutcome = 'player_win' | 'player_lose' | 'ongoing';

        const playerFirst = player.spd >= opponent.spd;
        const first = playerFirst ? player : opponent;
        const second = playerFirst ? opponent : player;

        const attack = (attacker: BattleParticipant, defender: BattleParticipant): { defender: BattleParticipant; event: any } => {
          const dmg = calcDamage(attacker.atk, defender.def, attacker.type, defender.type, defender.secondaryType);
          const baseDmg = calcDamage(attacker.atk, defender.def, attacker.type, defender.type, defender.secondaryType, false);
          const effectiveness = dmg > baseDmg * 1.1 ? 'super_effective' : dmg < baseDmg * 0.9 ? 'not_very_effective' : 'attack';
          const newHp = Math.max(0, defender.currentHp - dmg);
          const message = `${attacker.name} dealt ${dmg} damage!${effectiveness === 'super_effective' ? ' Super effective!' : effectiveness === 'not_very_effective' ? ' Not very effective.' : ''}`;
          return {
            defender: { ...defender, currentHp: newHp },
            event: { turn, actorUid: attacker.uid, targetUid: defender.uid, type: effectiveness, damage: dmg, message },
          };
        };

        const { defender: secondAfterFirst, event: event1 } = attack(first, second);
        log.push(event1);

        let outcome: BattleOutcome = 'ongoing';
        let updatedPlayer = player;
        let updatedOpponent = opponent;

        if (playerFirst) updatedOpponent = secondAfterFirst;
        else updatedPlayer = secondAfterFirst;

        if (secondAfterFirst.currentHp <= 0) {
          log.push({ turn, actorUid: first.uid, targetUid: second.uid, type: 'fainted', message: `${second.name} fainted!` });
          outcome = playerFirst ? 'player_win' : 'player_lose';
        } else {
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

        let newCollection = state.synamon.collection;
        let totalBattlesWon = state.synamon.totalBattlesWon;
        let totalBattlesLost = state.synamon.totalBattlesLost;

        if (outcome !== 'ongoing') {
          const playerUid = b.player!.uid;
          const playerSyn = state.synamon.collection[playerUid] as OwnedSynamon;
          if (outcome === 'player_win') {
            totalBattlesWon++;
            const newXp = playerSyn.xp + b.xpReward;
            newCollection = {
              ...newCollection,
              [playerUid]: {
                ...playerSyn,
                xp: newXp,
                level: levelFromXp(newXp),
                energy: Math.max(0, playerSyn.energy - 20),
              },
            };
          } else {
            totalBattlesLost++;
            const newXp = playerSyn.xp + Math.floor(b.xpReward * 0.3);
            newCollection = {
              ...newCollection,
              [playerUid]: {
                ...playerSyn,
                xp: newXp,
                level: levelFromXp(newXp),
                energy: Math.max(0, playerSyn.energy - 10),
              },
            };
          }
        }

        return {
          synamon: {
            ...state.synamon,
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
        synamon: {
          ...state.synamon,
          showBattle: false,
          battle: { ...initialSynamonState.battle },
        },
      }));
    },
  };
}

type SynamonActions = ReturnType<typeof makeSynamonActions>;

export type { SynamonActions };
export { makeSynamonActions };
