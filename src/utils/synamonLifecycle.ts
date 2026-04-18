/**
 * Synamon lifecycle — bridges the Zustand store with Supabase persistence.
 *
 * - loadSynamonFromSupabase(): called once after auth, populates store
 * - startSynamonSyncListener(): subscribes to store changes, pushes to Supabase
 */

import { useStore } from '../store';
import { getSession, isSupabaseConfigured } from './supabase';
import {
  fetchSynamonData,
  debouncedStatSync,
  logCreatureEvent,
  setActiveCompanion,
} from './synamonSync';
import type { OwnedSynamon } from '../types/synamon';

const DEBUG = import.meta.env.DEV;

// ─── Load from Supabase → Store ─────────────────────────────────────────────

/**
 * Pull all Synamon data from Supabase and merge into the local store.
 * Called once on app init after loadData() completes.
 * No-ops if Supabase isn't configured or user isn't authenticated.
 */
export async function loadSynamonFromSupabase(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const { user } = await getSession();
  if (!user) return;

  const data = await fetchSynamonData();
  if (!data) return;

  if (DEBUG) console.log('[SynamonSync] Loaded from Supabase:', {
    creatures: data.creatures.length,
    activeUid: data.activeUid,
    discoveredSpecies: data.discoveredSpecies.length,
  });

  // Only apply if Supabase has creatures (don't wipe local state if tables are empty)
  if (data.creatures.length === 0) return;

  const collection: Record<string, OwnedSynamon> = {};
  for (const c of data.creatures) {
    // Apply zoneKey from active companion if this is the active one
    if (c.uid === data.activeUid && data.activeZoneKey) {
      c.zoneKey = data.activeZoneKey;
    }
    collection[c.uid] = c;
  }

  useStore.setState((state) => ({
    synamon: {
      ...state.synamon,
      collection: {
        ...state.synamon.collection,
        ...collection,
      },
      activeUid: data.activeUid ?? state.synamon.activeUid,
      starterChosen: data.creatures.length > 0 || state.synamon.starterChosen,
      discoveredSpecies: data.discoveredSpecies.length > 0
        ? [...new Set([...state.synamon.discoveredSpecies, ...data.discoveredSpecies])]
        : state.synamon.discoveredSpecies,
    },
  }));

  // Compute pending events after loading
  useStore.getState().computePendingEvents();
}

// ─── Store → Supabase sync listener ────────────────────────────────────────

let _prevSynamon: typeof useStore extends { getState: () => infer S } ? S extends { synamon: infer T } ? T : never : never;
let _unsubscribe: (() => void) | null = null;

/**
 * Subscribe to Zustand store changes and push Synamon mutations to Supabase.
 * Returns an unsubscribe function.
 */
export function startSynamonSyncListener(): () => void {
  if (_unsubscribe) _unsubscribe();

  _prevSynamon = useStore.getState().synamon;

  _unsubscribe = useStore.subscribe((state) => {
    const curr = state.synamon;
    const prev = _prevSynamon;
    _prevSynamon = curr;

    if (!isSupabaseConfigured()) return;
    if (!curr.activeUid) return;

    const activeSyn = curr.collection[curr.activeUid];
    if (!activeSyn) return;

    const prevActiveSyn = prev?.collection[prev?.activeUid ?? ''];

    // Active companion changed
    if (curr.activeUid !== prev?.activeUid && curr.activeUid) {
      setActiveCompanion(curr.activeUid, activeSyn.zoneKey ?? 'aureum-basin');
    }

    // Stats changed on active creature (hunger, happiness, energy, xp, level, stage)
    if (prevActiveSyn && (
      activeSyn.hunger !== prevActiveSyn.hunger ||
      activeSyn.happiness !== prevActiveSyn.happiness ||
      activeSyn.energy !== prevActiveSyn.energy ||
      activeSyn.xp !== prevActiveSyn.xp ||
      activeSyn.level !== prevActiveSyn.level ||
      activeSyn.stage !== prevActiveSyn.stage
    )) {
      debouncedStatSync(curr.activeUid, activeSyn);
    }

    // Care action events (detect by lastFedAt / lastPlayedAt change)
    if (prevActiveSyn) {
      if (activeSyn.lastFedAt && activeSyn.lastFedAt !== prevActiveSyn.lastFedAt) {
        logCreatureEvent(curr.activeUid, 'fed', {
          hunger: Math.round(activeSyn.hunger),
          happiness: Math.round(activeSyn.happiness),
        });
      }
      if (activeSyn.lastPlayedAt && activeSyn.lastPlayedAt !== prevActiveSyn.lastPlayedAt) {
        logCreatureEvent(curr.activeUid, 'played', {
          happiness: Math.round(activeSyn.happiness),
          energy: Math.round(activeSyn.energy),
        });
      }
    }

    // Stage evolution
    if (prevActiveSyn && activeSyn.stage !== prevActiveSyn.stage) {
      logCreatureEvent(curr.activeUid, 'evolved', {
        fromStage: prevActiveSyn.stage,
        toStage: activeSyn.stage,
      });
    }
  });

  return () => {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  };
}
