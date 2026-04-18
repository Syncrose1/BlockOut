/**
 * Synamon Supabase sync — reads/writes creature data to the shared
 * synamon_creatures, synamon_active_companion, synamon_creature_events,
 * and synamon_user_dex tables.
 *
 * Designed for fire-and-forget writes (care actions, XP gains) with
 * a full pull on app init / auth change.
 */

import { getSupabaseClient, isSupabaseConfigured, getSession } from './supabase';
import type { OwnedSynamon } from '../types/synamon';

const DEBUG = import.meta.env.DEV;

// ─── Types mirroring Supabase rows ──────────────────────────────────────────

interface CreatureRow {
  id: string;
  user_id: string;
  species_id: string;
  nickname: string | null;
  zone_origin: string | null;
  stage: number;
  level: number;
  xp: number;
  happiness: number;
  hunger: number;
  energy: number;
  constitution: string;
  personality: string;
  ivs: Record<string, number>;
  moves: string[];
  caught_at: string;
  last_interaction_at: string;
  last_evolved_at: string | null;
  favorite: boolean;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

interface ActiveCompanionRow {
  user_id: string;
  creature_id: string;
  zone_key: string;
  assigned_at: string;
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function rowToOwnedSynamon(row: CreatureRow): OwnedSynamon {
  return {
    uid: row.id,
    speciesId: row.species_id,
    stage: row.stage,
    level: row.level,
    xp: row.xp,
    nickname: row.nickname ?? undefined,
    zoneKey: row.zone_origin ?? undefined,
    hunger: row.hunger,
    happiness: row.happiness,
    energy: row.energy,
    caughtAt: new Date(row.caught_at).getTime(),
    lastTickAt: new Date(row.last_interaction_at).getTime(),
  };
}

function ownedSynamonToRow(syn: OwnedSynamon, userId: string): Partial<CreatureRow> {
  return {
    id: syn.uid,
    user_id: userId,
    species_id: syn.speciesId,
    nickname: syn.nickname ?? null,
    zone_origin: syn.zoneKey ?? null,
    stage: syn.stage,
    level: syn.level,
    xp: syn.xp,
    happiness: Math.round(syn.happiness),
    hunger: Math.round(syn.hunger),
    energy: Math.round(syn.energy),
    caught_at: new Date(syn.caughtAt).toISOString(),
    last_interaction_at: new Date(syn.lastTickAt).toISOString(),
  };
}

// ─── Read operations ────────────────────────────────────────────────────────

/**
 * Fetch all creatures + active companion for the current user.
 * Returns null if Supabase isn't configured or user isn't authenticated.
 */
export async function fetchSynamonData(): Promise<{
  creatures: OwnedSynamon[];
  activeUid: string | null;
  activeZoneKey: string | null;
  discoveredSpecies: string[];
} | null> {
  if (!isSupabaseConfigured()) return null;
  const client = getSupabaseClient();
  if (!client) return null;

  const { user } = await getSession();
  if (!user) return null;

  try {
    // Parallel fetch: creatures + active companion + dex
    const [creaturesRes, companionRes, dexRes] = await Promise.all([
      client
        .from('synamon_creatures')
        .select('*')
        .eq('user_id', user.id)
        .eq('archived', false)
        .order('caught_at', { ascending: true }),
      client
        .from('synamon_active_companion')
        .select('*')
        .eq('user_id', user.id)
        .maybeSingle(),
      client
        .from('synamon_user_dex')
        .select('species_id')
        .eq('user_id', user.id),
    ]);

    if (creaturesRes.error) {
      console.warn('[SynamonSync] Failed to fetch creatures:', creaturesRes.error.message);
      return null;
    }

    const creatures = (creaturesRes.data as CreatureRow[]).map(rowToOwnedSynamon);
    const companion = companionRes.data as ActiveCompanionRow | null;
    const dexEntries = (dexRes.data ?? []) as { species_id: string }[];

    return {
      creatures,
      activeUid: companion?.creature_id ?? null,
      activeZoneKey: companion?.zone_key ?? null,
      discoveredSpecies: dexEntries.map(d => d.species_id),
    };
  } catch (e) {
    console.warn('[SynamonSync] fetchSynamonData failed:', e);
    return null;
  }
}

// ─── Write operations ───────────────────────────────────────────────────────

/** Upsert a creature row (create or update). */
export async function upsertCreature(syn: OwnedSynamon): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { user } = await getSession();
  if (!user) return false;

  const row = ownedSynamonToRow(syn, user.id);
  const { error } = await client
    .from('synamon_creatures')
    .upsert(row, { onConflict: 'id' });

  if (error) {
    console.warn('[SynamonSync] upsertCreature failed:', error.message);
    return false;
  }
  return true;
}

/** Update only the mutable stats on a creature (hunger, happiness, energy, xp, level, stage). */
export async function updateCreatureStats(uid: string, updates: Partial<{
  hunger: number;
  happiness: number;
  energy: number;
  xp: number;
  level: number;
  stage: number;
  last_interaction_at: string;
}>): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;

  const { error } = await client
    .from('synamon_creatures')
    .update(updates)
    .eq('id', uid);

  if (error) {
    console.warn('[SynamonSync] updateCreatureStats failed:', error.message);
    return false;
  }
  return true;
}

/** Set or update the active companion. */
export async function setActiveCompanion(creatureId: string, zoneKey: string): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { user } = await getSession();
  if (!user) return false;

  const { error } = await client
    .from('synamon_active_companion')
    .upsert({
      user_id: user.id,
      creature_id: creatureId,
      zone_key: zoneKey,
      assigned_at: new Date().toISOString(),
    }, { onConflict: 'user_id' });

  if (error) {
    console.warn('[SynamonSync] setActiveCompanion failed:', error.message);
    return false;
  }
  return true;
}

/** Log a creature event (append-only). */
export async function logCreatureEvent(
  creatureId: string,
  eventType: string,
  payload: Record<string, unknown> = {},
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { user } = await getSession();
  if (!user) return false;

  const { error } = await client
    .from('synamon_creature_events')
    .insert({
      creature_id: creatureId,
      user_id: user.id,
      event_type: eventType,
      payload,
    });

  if (error) {
    console.warn('[SynamonSync] logCreatureEvent failed:', error.message);
    return false;
  }
  return true;
}

/** Upsert a dex entry for a species. */
export async function upsertDexEntry(
  speciesId: string,
  caught: boolean = false,
  highestStage: number = 1,
): Promise<boolean> {
  const client = getSupabaseClient();
  if (!client) return false;
  const { user } = await getSession();
  if (!user) return false;

  const row: Record<string, unknown> = {
    user_id: user.id,
    species_id: speciesId,
    highest_stage_reached: highestStage,
  };
  if (caught) row.first_caught_at = new Date().toISOString();

  const { error } = await client
    .from('synamon_user_dex')
    .upsert(row, { onConflict: 'user_id,species_id' });

  if (error) {
    console.warn('[SynamonSync] upsertDexEntry failed:', error.message);
    return false;
  }
  return true;
}

// ─── Debounced stat sync ────────────────────────────────────────────────────
// Batch stat writes to avoid spamming Supabase on every tick/action.

let _statSyncTimeout: ReturnType<typeof setTimeout> | null = null;
let _pendingStatSync: { uid: string; updates: Record<string, unknown> } | null = null;

/**
 * Queue a debounced stats update for a creature.
 * Multiple calls within 2s are collapsed into one write.
 */
export function debouncedStatSync(uid: string, syn: OwnedSynamon): void {
  _pendingStatSync = {
    uid,
    updates: {
      hunger: Math.round(syn.hunger),
      happiness: Math.round(syn.happiness),
      energy: Math.round(syn.energy),
      xp: syn.xp,
      level: syn.level,
      stage: syn.stage,
      last_interaction_at: new Date().toISOString(),
    },
  };

  if (_statSyncTimeout) clearTimeout(_statSyncTimeout);
  _statSyncTimeout = setTimeout(() => {
    if (_pendingStatSync) {
      updateCreatureStats(_pendingStatSync.uid, _pendingStatSync.updates).then(ok => {
        if (DEBUG && ok) console.log('[SynamonSync] Debounced stat sync complete');
      });
      _pendingStatSync = null;
    }
  }, 2000);
}
