import { useStore } from '../store';
import { syncToDropbox, syncFromDropbox, isDropboxConfigured, syncToDropboxWithResolution, getDropboxAuthInfo, forceUploadToDropbox, mergeSnapshots, maybeWriteDailyBackup, type AnyRecord } from './dropbox';
import { saveToR2, loadFromR2, isR2SyncAvailable } from './r2sync';
import { getAccessToken } from './supabase';
import { registerSpecies } from '../store/synamonSlice';
import { asset } from './asset';
import type { SynamonSpecies } from '../types/synamon';

const DEBUG = import.meta.env.DEV;

// ─── IndexedDB ───────────────────────────────────────────────────────────────

const DB_NAME = 'blockout';
const DB_VERSION = 1;
const STORE_NAME = 'state';
const STATE_KEY = 'current';

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      req.result.createObjectStore(STORE_NAME);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbWrite(data: object): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(data, STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbRead(): Promise<Record<string, unknown> | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const req = tx.objectStore(STORE_NAME).get(STATE_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => reject(req.error);
  });
}

export async function idbClear(): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(STATE_KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── Sync metadata ────────────────────────────────────────────────────────────

const CLOUD_URL_KEY = 'blockout-cloud-url';
const CLOUD_TOKEN_KEY = 'blockout-cloud-token';
const LAST_SYNCED_VERSION_KEY = 'blockout-last-synced-version';
const LAST_SYNCED_AT_KEY = 'blockout-last-synced-at';

export function getCloudConfig(): { url: string; token: string } {
  return {
    url: localStorage.getItem(CLOUD_URL_KEY) ?? '',
    token: localStorage.getItem(CLOUD_TOKEN_KEY) ?? '',
  };
}

export function setCloudConfig(url: string, token: string): void {
  localStorage.setItem(CLOUD_URL_KEY, url.trim());
  localStorage.setItem(CLOUD_TOKEN_KEY, token.trim());
}

function getLastSyncedVersion(): number {
  return parseInt(localStorage.getItem(LAST_SYNCED_VERSION_KEY) ?? '0', 10);
}

function getLastSyncedAt(): number {
  return parseInt(localStorage.getItem(LAST_SYNCED_AT_KEY) ?? '0', 10);
}

function recordSuccessfulSync(version: number): void {
  localStorage.setItem(LAST_SYNCED_VERSION_KEY, String(version));
  localStorage.setItem(LAST_SYNCED_AT_KEY, String(Date.now()));
}

export function getLastSyncedTime(): number | null {
  const v = localStorage.getItem(LAST_SYNCED_AT_KEY);
  return v ? parseInt(v, 10) : null;
}

// R2 keeps its OWN monotonic version sequence + sync bookmarks, independent of
// Dropbox's (the two cloud files are separate sequences; sharing keys would let
// one's version number corrupt the other's conflict detection). This mirrors
// the proven Dropbox version-vector scheme for R2-authoritative (no-Dropbox) use.
const R2_LAST_SYNCED_VERSION_KEY = 'blockout-r2-last-synced-version';
const R2_LAST_SYNCED_AT_KEY = 'blockout-r2-last-synced-at';

function getR2LastSyncedVersion(): number {
  return parseInt(localStorage.getItem(R2_LAST_SYNCED_VERSION_KEY) ?? '0', 10);
}

function getR2LastSyncedAt(): number {
  return parseInt(localStorage.getItem(R2_LAST_SYNCED_AT_KEY) ?? '0', 10);
}

function recordR2Sync(version: number): void {
  localStorage.setItem(R2_LAST_SYNCED_VERSION_KEY, String(version));
  localStorage.setItem(R2_LAST_SYNCED_AT_KEY, String(Date.now()));
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveLocal(): Promise<void> {
  const data = useStore.getState().getSerializableState();
  const payload = { ...data, lastModified: Date.now() };
  await idbWrite(payload);
}

async function isR2Active(): Promise<boolean> {
  if (!isR2SyncAvailable()) return false;
  const token = await getAccessToken();
  return !!token;
}

/** Task count of a snapshot (0 if none). */
function taskCount(x: AnyRecord | null): number {
  return x?.tasks ? Object.keys(x.tasks as object).length : 0;
}

/** A snapshot is "empty" if it has no tasks and no categories. */
function isEmptySnapshot(x: AnyRecord | null): boolean {
  if (!x) return true;
  return taskCount(x) === 0 && (!x.categories || Object.keys(x.categories as object).length === 0);
}

/**
 * Pick the fresher of two candidate snapshots by lastModified, but never let an
 * EMPTY snapshot win over one with content (guards against an evicted/blank
 * client wiping a good backup). Returns null only if both are null.
 */
function pickFresher(a: AnyRecord | null, b: AnyRecord | null): AnyRecord | null {
  if (!a) return b;
  if (!b) return a;
  if (isEmptySnapshot(a) && !isEmptySnapshot(b)) return b;
  if (isEmptySnapshot(b) && !isEmptySnapshot(a)) return a;
  const am = (a.lastModified as number) ?? 0;
  const bm = (b.lastModified as number) ?? 0;
  return am >= bm ? a : b;
}

/**
 * Mirror the current resolved state to R2 as a best-effort backup. Used when
 * Dropbox is the authoritative store — R2 is a secondary copy, never blocks.
 */
async function mirrorToR2Backup(): Promise<void> {
  if (!(await isR2Active())) return;
  try {
    const data = useStore.getState().getSerializableState();
    const result = await saveToR2(data);
    if (!result.success && DEBUG) console.warn('[BlockOut] R2 backup mirror failed:', result.error);
  } catch (e) {
    if (DEBUG) console.warn('[BlockOut] R2 backup mirror threw:', e);
  }
}

// ── R2 version-vector reconciliation (mirrors the Dropbox scheme) ──
// Used when R2 is the AUTHORITATIVE store (no Dropbox connected). R2 carries its
// own monotonic `version` in the stored blob; this client tracks the last R2
// version it synced. Conflict detection is by version counter (clock-skew-proof),
// not raw timestamps. Same four cases as syncToDropboxWithResolution.
interface R2SyncResult {
  success: boolean;
  action: 'uploaded' | 'downloaded' | 'merged' | 'unchanged' | 'error';
  data?: AnyRecord;
  mergeInfo?: ReturnType<typeof mergeSnapshots>['info'];
  error?: string;
}

function r2HasContent(d: AnyRecord): boolean {
  return Object.keys((d.tasks as object) ?? {}).length > 0 ||
    Object.keys((d.categories as object) ?? {}).length > 0;
}

async function syncToR2WithResolution(
  localData: AnyRecord,
  prefetchedRemote?: AnyRecord | null,
): Promise<R2SyncResult> {
  let remote = prefetchedRemote;
  if (remote === undefined) {
    const r = await loadFromR2();
    remote = r.data;
  }

  const lastSyncedVersion = getR2LastSyncedVersion();
  const lastSyncedAt = getR2LastSyncedAt();
  const localLastModified = (localData.lastModified as number) ?? 0;

  // No remote yet — initial upload.
  if (!remote) {
    const payload = { ...localData, version: 1 };
    const res = await saveToR2(payload);
    if (!res.success) return { success: false, action: 'error', error: res.error };
    recordR2Sync(1);
    return { success: true, action: 'uploaded' };
  }

  const remoteVersion = (remote.version as number) ?? 0;
  const remoteLastModified = (remote.lastModified as number) ?? 0;

  // Never let an empty/evicted local clobber a populated remote — adopt remote.
  if (isEmptySnapshot(localData) && r2HasContent(remote)) {
    recordR2Sync(remoteVersion);
    return { success: true, action: 'downloaded', data: remote };
  }

  const remoteHasNewWrites = remoteVersion > lastSyncedVersion;
  const localHasUnpushedChanges = localLastModified > lastSyncedAt && lastSyncedAt > 0;

  // First-time connect with existing remote content — adopt remote.
  if (lastSyncedVersion === 0 && remoteVersion > 0 && r2HasContent(remote)) {
    recordR2Sync(remoteVersion);
    return { success: true, action: 'downloaded', data: remote };
  }

  // Both diverged — merge, upload as a new version.
  if (remoteHasNewWrites && localHasUnpushedChanges) {
    const { merged, info } = mergeSnapshots(localData, remote, lastSyncedAt);
    const newVersion = Math.max(remoteVersion, lastSyncedVersion) + 1;
    const res = await saveToR2({ ...merged, version: newVersion });
    if (!res.success) return { success: false, action: 'error', error: res.error };
    recordR2Sync(newVersion);
    return { success: true, action: 'merged', data: { ...merged, version: newVersion }, mergeInfo: info };
  }

  // Only remote moved — download.
  if (remoteHasNewWrites) {
    recordR2Sync(remoteVersion);
    return { success: true, action: 'downloaded', data: remote };
  }

  // Remote unchanged — upload local if it's at least as new (else nothing to do).
  if (localLastModified >= remoteLastModified) {
    const newVersion = Math.max(remoteVersion, lastSyncedVersion) + 1;
    const res = await saveToR2({ ...localData, version: newVersion });
    if (!res.success) return { success: false, action: 'error', error: res.error };
    recordR2Sync(newVersion);
    return { success: true, action: 'uploaded' };
  }

  return { success: true, action: 'unchanged' };
}

export async function saveToCloud(): Promise<void> {
  // ── Authoritative store precedence: Dropbox > R2 > self-hosted ──
  // Dropbox is the real source of truth (full version/conflict logic). R2 is
  // presented as the primary "account sync" in the UI but is mechanically a
  // backup mirror when Dropbox is connected. If only R2 is connected, R2 is
  // authoritative. Nothing short-circuits before Dropbox.

  // Dropbox — authoritative when configured (version-managed + conflict resolution)
  if (isDropboxConfigured()) {
    const data = useStore.getState().getSerializableState() as any;
    if (DEBUG) console.log('[BlockOut] Syncing to Dropbox (authoritative):', {
      hasTaskChains: !!data.taskChains,
      taskChainCount: Object.keys(data.taskChains || {}).length,
      hasChainTemplates: !!data.chainTemplates,
      chainTemplateCount: Object.keys(data.chainTemplates || {}).length,
      hasOverviewBlocks: !!(data.overviewBlocks && data.overviewBlocks.length > 0),
      overviewBlocksCount: (data.overviewBlocks || []).length,
    });

    const result = await syncToDropboxWithResolution(data, 'saveToCloud');

    if (!result.success) {
      throw new Error(result.error || 'Sync failed');
    }

    // If remote was downloaded, apply it to the store
    if (result.action === 'downloaded' && result.data) {
      if (DEBUG) console.log('[BlockOut] Remote is newer, applying downloaded data');
      applyData(result.data, 'saveToCloud-downloaded');
    } else if (result.action === 'merged' && result.data) {
      if (DEBUG) console.log('[BlockOut] Merge complete, applying merged data');
      applyData(result.data, 'saveToCloud-merged');
    }

    // Mirror the resolved state to R2 as a secondary backup (best-effort).
    await mirrorToR2Backup();

    useStore.getState().setSyncStatus('synced');
    return;
  }

  // R2 cloud sync — authoritative only when Dropbox is NOT connected.
  // Version-vector reconciliation (same scheme as Dropbox), so R2-only
  // multi-device users get clock-skew-proof conflict detection.
  if (await isR2Active()) {
    const data = useStore.getState().getSerializableState() as AnyRecord;
    const result = await syncToR2WithResolution(data);
    if (!result.success) {
      // No Dropbox to fall back to — surface the error.
      throw new Error(result.error || 'R2 sync failed');
    }
    if (result.action === 'downloaded' && result.data) {
      applyData(result.data, 'saveToCloud-r2-downloaded');
    } else if (result.action === 'merged' && result.data) {
      applyData(result.data, 'saveToCloud-r2-merged');
      if (result.mergeInfo) {
        useStore.getState().setConflictState({ local: data, remote: result.data, merged: result.data, mergeInfo: result.mergeInfo });
      }
    }
    useStore.getState().setSyncStatus('synced');
    return;
  }

  const { url, token } = getCloudConfig();
  if (!url) return;

  const data = useStore.getState().getSerializableState();
  const payload = { ...data, lastModified: Date.now() };

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${url}/api/data`, {
    method: 'PUT',
    headers,
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Cloud save failed: ${res.status}`);

  const json = await res.json();
  const newVersion = json.version ?? getLastSyncedVersion() + 1;
  recordSuccessfulSync(newVersion);
  useStore.getState().setSyncStatus('synced');
}

// ─── Explicit "Sync now" — independent, multi-backend, with live narrative ────
//
// Runs every connected backend in sequence and reports structured progress so
// the UI can narrate what each one did. Honours the architecture: Dropbox is
// authoritative (version/conflict-managed) and the account (R2) receives the
// resolved state as a mirror; if only the account is connected it reconciles on
// its own version vector. Backends are independent — one failing doesn't abort
// the other.

export type SyncBackend = 'account' | 'dropbox';
export type SyncPhase = 'start' | 'working' | 'done' | 'error' | 'skipped';
export interface SyncEvent {
  backend: SyncBackend;
  phase: SyncPhase;
  /** Human-readable line describing the current step / outcome. */
  message: string;
}
type SyncReporter = (e: SyncEvent) => void;

// Map a resolver action → plain-language outcome line.
function narrateAction(action: string): string {
  switch (action) {
    case 'uploaded': return 'Local version uncontested — uploaded to cloud.';
    case 'downloaded': return 'Cloud had newer changes — downloaded them.';
    case 'merged': return 'Local and cloud diverged — merged changes, then uploaded.';
    case 'unchanged': return 'Already up to date.';
    default: return 'Synced.';
  }
}

/** Run an explicit sync across all connected backends with progress reporting. */
export async function syncAllBackends(report: SyncReporter = () => {}): Promise<{ ok: boolean }> {
  const hasDropbox = isDropboxConfigured();
  const hasR2 = await isR2Active();

  if (!hasDropbox && !hasR2) {
    report({ backend: 'account', phase: 'skipped', message: 'No cloud method connected.' });
    return { ok: false };
  }

  let ok = true;
  useStore.getState().setSyncStatus('syncing');

  // ── Dropbox first (authoritative) ──
  if (hasDropbox) {
    report({ backend: 'dropbox', phase: 'start', message: 'Checking Dropbox…' });
    try {
      const data = useStore.getState().getSerializableState() as AnyRecord;
      report({ backend: 'dropbox', phase: 'working', message: 'Comparing local and cloud versions…' });
      const result = await syncToDropboxWithResolution(data, 'sync-now');
      if (!result.success) throw new Error(result.error || 'Sync failed');
      if ((result.action === 'downloaded' || result.action === 'merged') && result.data) {
        applyData(result.data, `dropbox-${result.action}`);
        await idbWrite({ ...result.data, lastModified: Date.now() });
      }
      report({ backend: 'dropbox', phase: 'done', message: narrateAction(result.action) });
      // Roll a dated backup (once/day) from the resolved state.
      maybeWriteDailyBackup(useStore.getState().getSerializableState() as AnyRecord).catch(() => {});
    } catch (e) {
      ok = false;
      report({ backend: 'dropbox', phase: 'error', message: e instanceof Error ? e.message : 'Dropbox sync failed.' });
    }
  }

  // ── Account (R2) ──
  if (hasR2) {
    report({ backend: 'account', phase: 'start', message: 'Checking your account…' });
    try {
      const data = useStore.getState().getSerializableState() as AnyRecord;
      if (hasDropbox) {
        // Dropbox already resolved the authoritative state — mirror it up.
        report({ backend: 'account', phase: 'working', message: 'Saving the resolved version to your account…' });
        const r = await saveToR2(data);
        if (!r.success) throw new Error(r.error || 'Account save failed');
        report({ backend: 'account', phase: 'done', message: 'Backed up to your account.' });
      } else {
        report({ backend: 'account', phase: 'working', message: 'Comparing local and account versions…' });
        const result = await syncToR2WithResolution(data);
        if (!result.success) throw new Error(result.error || 'Account sync failed');
        if ((result.action === 'downloaded' || result.action === 'merged') && result.data) {
          applyData(result.data, `account-${result.action}`);
          await idbWrite({ ...result.data, lastModified: Date.now() });
        }
        report({ backend: 'account', phase: 'done', message: narrateAction(result.action) });
      }
    } catch (e) {
      ok = false;
      report({ backend: 'account', phase: 'error', message: e instanceof Error ? e.message : 'Account sync failed.' });
    }
  }

  useStore.getState().setSyncStatus(ok ? 'synced' : 'error');
  if (ok) recordSuccessfulSync(getLastSyncedVersion());
  return { ok };
}

// ─── Load — version-aware with auto-merge for diverged state ─────────────────
//
// States:
//   A) remote.version == lastSyncedVersion
//      → server unchanged; use local if it has newer edits, else remote
//
//   B) remote.version > lastSyncedVersion, local unchanged
//      → passively offline; silently take remote
//
//   C) remote.version > lastSyncedVersion AND local has edits since last sync
//      → auto-merge: local changes injected on top of remote base, pushed to cloud
//        conflictState populated for the review modal (informational, not blocking)
//
//   D) no cloud configured or fetch failed → local only

export async function loadData(): Promise<void> {
  let local: AnyRecord | null = null;
  let remote: AnyRecord | null = null;

  // Load Synamon species registry
  try {
    const res = await fetch(asset('/synamon/species.json'));
    if (res.ok) {
      const species: SynamonSpecies[] = await res.json();
      registerSpecies(species);
      if (DEBUG) console.log(`[BlockOut] Registered ${species.length} Synamon species`);
    }
  } catch (e) {
    console.warn('[BlockOut] Failed to load Synamon species', e);
  }

  try {
    local = await idbRead();
  } catch (e) {
    console.warn('[BlockOut] IndexedDB read failed', e);
  }

  // ── Cross-backend source gathering ──
  // R2 may legitimately hold NEWER data than Dropbox (e.g. written from an
  // account-only device that has no Dropbox connected). So R2 is a first-class
  // load source, never just a mirror target. We gather it up front and let the
  // freshest client-side snapshot (local vs R2) feed the authoritative
  // reconciliation, then converge every connected backend onto the result.
  const r2Active = await isR2Active();
  let r2Data: AnyRecord | null = null;
  if (r2Active) {
    try {
      const r = await loadFromR2();
      r2Data = r.data ?? null;
      if (DEBUG && r2Data) console.log('[BlockOut] Loaded R2 candidate');
    } catch (e) {
      console.warn('[BlockOut] R2 load failed', e);
    }
  }

  // Freshest client-side candidate across local + R2 (empty-guarded).
  const base = pickFresher(local, r2Data);

  const { url, token } = getCloudConfig();

  // ── Dropbox — authoritative when configured (version-managed + conflict resolution) ──
  // R2 is presented as the primary "account sync" in the UI, but mechanically
  // Dropbox is the source of truth; R2 is mirrored to converge.
  if (isDropboxConfigured()) {
    try {
      if (base && !isEmptySnapshot(base)) {
        // Reconcile the freshest client state (which may have come from R2)
        // against Dropbox using the proven version/conflict logic.
        // NB: an EMPTY base is deliberately excluded here — when local + R2 are
        // both blank (e.g. evicted storage), we must DOWNLOAD Dropbox rather
        // than risk uploading nothing over a good remote save.
        const result = await syncToDropboxWithResolution(base, 'loadData');

        if (result.success) {
          switch (result.action) {
            case 'uploaded':
              applyData(base, 'dropbox-uploaded');
              await idbWrite({ ...base, lastModified: Date.now() });
              await mirrorToR2Backup();
              useStore.getState().setSyncStatus('synced');
              break;

            case 'downloaded':
              if (DEBUG) console.log('[BlockOut] Downloaded case, has data:', !!result.data);
              if (result.data) {
                applyData(result.data, 'dropbox-downloaded');
                await idbWrite({ ...result.data, lastModified: Date.now() });
                await mirrorToR2Backup();
                useStore.getState().setSyncStatus('synced');
              } else {
                console.warn('[BlockOut] No data in download result, using base');
                applyData(base, 'dropbox-download-fallback');
              }
              break;

            case 'merged':
              if (result.data) {
                applyData(result.data, 'dropbox-merged');
                await idbWrite({ ...result.data, lastModified: Date.now() });
                if (result.mergeInfo) {
                  useStore.getState().setConflictState({
                    local: base,
                    remote: result.data,
                    merged: result.data,
                    mergeInfo: result.mergeInfo
                  });
                }
                await mirrorToR2Backup();
              }
              useStore.getState().setSyncStatus('synced');
              break;

            case 'unchanged':
              applyData(base, 'dropbox-unchanged');
              await idbWrite({ ...base, lastModified: Date.now() });
              await mirrorToR2Backup();
              useStore.getState().setSyncStatus('synced');
              break;
          }
          return;
        } else {
          console.warn('[BlockOut] Dropbox sync failed:', result.error);
          // Fall through to local/base.
        }
      } else {
        // No usable client-side data (missing or empty) — download Dropbox as
        // the source of truth, then mirror it down to R2 so they converge.
        remote = await syncFromDropbox();
        if (remote) {
          applyData(remote);
          await idbWrite({ ...remote, lastModified: Date.now() });
          await mirrorToR2Backup();
          useStore.getState().setSyncStatus('synced');
        }
        return;
      }
    } catch (e) {
      console.warn('[BlockOut] Dropbox load failed, using local', e);
    }
  }
  // ── R2 — authoritative only when Dropbox is NOT connected ──
  // Version-vector reconciliation (same scheme as Dropbox), clock-skew-proof.
  else if (r2Active) {
    if (!local && !r2Data) {
      markDataLoaded(); // nothing anywhere yet — allow fresh start
      useStore.getState().setSyncStatus('synced');
      return;
    }
    const result = await syncToR2WithResolution((local ?? {}) as AnyRecord, r2Data);
    if (result.success) {
      switch (result.action) {
        case 'downloaded':
          if (result.data) {
            applyData(result.data, 'r2-downloaded');
            await idbWrite({ ...result.data, lastModified: Date.now() });
          }
          break;
        case 'merged':
          if (result.data) {
            applyData(result.data, 'r2-merged');
            await idbWrite({ ...result.data, lastModified: Date.now() });
            if (result.mergeInfo && local) {
              useStore.getState().setConflictState({ local, remote: result.data, merged: result.data, mergeInfo: result.mergeInfo });
            }
          }
          break;
        case 'uploaded':
        case 'unchanged':
          if (local) applyData(local, 'r2-local-authoritative');
          break;
      }
      useStore.getState().setSyncStatus('synced');
      return;
    }
    // R2 failed — fall through to apply local below.
    console.warn('[BlockOut] R2 sync failed:', result.error);
  }
  // ── Self-hosted ──
  else if (url) {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${url}/api/data`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === 'object') remote = json as AnyRecord;
      }
    } catch (e) {
      console.warn('[BlockOut] Cloud load failed, using local', e);
    }
  }

  if (!remote) {
    if (base) {
      applyData(base, 'local-only');
    } else {
      markDataLoaded(); // Allow saving even when starting fresh
    }
    return;
  }

  if (!local) {
    applyData(remote);
    const rv = (remote.version as number) ?? 0;
    if (rv > 0) recordSuccessfulSync(rv);
    return;
  }

  const lastSyncedVersion = getLastSyncedVersion();
  const lastSyncedAt = getLastSyncedAt();
  const remoteVersion = (remote.version as number) ?? 0;
  const localLastModified = (local.lastModified as number) ?? 0;

  const remoteHasNewWrites = remoteVersion > lastSyncedVersion;
  const localHasUnpushedChanges = localLastModified > lastSyncedAt && lastSyncedAt > 0;

  // First-time connecting to this server: prefer remote if it has content.
  if (lastSyncedVersion === 0 && remoteVersion > 0) {
    const remoteHasContent =
      Object.keys((remote.tasks as object) ?? {}).length > 0 ||
      Object.keys((remote.categories as object) ?? {}).length > 0;
    if (remoteHasContent) {
      applyData(remote);
      recordSuccessfulSync(remoteVersion);
      return;
    }
  }

  if (remoteHasNewWrites && localHasUnpushedChanges) {
    // Case C — auto-merge local changes on top of remote base.
    const { merged, info } = mergeSnapshots(local, remote, lastSyncedAt);

    applyData(merged);
    await idbWrite({ ...merged, lastModified: Date.now() });

    // Inform the review modal what happened (non-blocking).
    useStore.getState().setConflictState({ local, remote, merged, mergeInfo: info });

    // Push merged result to cloud — it is now the authoritative state.
    try {
      useStore.getState().setSyncStatus('syncing');
      await saveToCloud();
    } catch (e) {
      console.warn('[BlockOut] Could not push merged result to cloud', e);
      useStore.getState().setSyncStatus('error');
    }
    return;
  }

  if (remoteHasNewWrites) {
    // Case B — passively offline, server moved ahead.
    applyData(remote);
    recordSuccessfulSync(remoteVersion);
    return;
  }

  // Case A — server unchanged; take whichever has newer lastModified.
  const remoteLastModified = (remote.lastModified as number) ?? 0;
  if (localLastModified >= remoteLastModified) {
    applyData(local);
  } else {
    applyData(remote);
    recordSuccessfulSync(remoteVersion);
  }
}

function applyData(data: AnyRecord, source: string = 'unknown'): void {
  try {
    if (DEBUG) console.log('[BlockOut] Applying data', {
      source,
      tasks: Object.keys(data.tasks || {}).length,
      categories: Object.keys(data.categories || {}).length,
      timeBlocks: Object.keys(data.timeBlocks || {}).length,
      taskChains: Object.keys(data.taskChains || {}).length,
      chainTemplates: Object.keys(data.chainTemplates || {}).length,
      chainTasks: Object.keys(data.chainTasks || {}).length,
      overviewBlocks: (data.overviewBlocks || []).length,
    });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useStore.getState().loadData(data as any);
    markDataLoaded();
  } catch (e) {
    console.warn('[BlockOut] Failed to apply state', e);
  }
}

// ─── Conflict resolution — escape hatches in the review modal ─────────────────

export async function resolveConflict(choice: 'local' | 'remote'): Promise<void> {
  const conflict = useStore.getState().conflictState;
  if (!conflict) return;

  const winner = choice === 'local' ? conflict.local : conflict.remote;
  applyData(winner);
  await idbWrite({ ...(winner as object), lastModified: Date.now() });

  if (choice === 'local') {
    try {
      // Force upload local data to cloud (bypass conflict resolution)
      if (isDropboxConfigured()) {
        const data = useStore.getState().getSerializableState() as any;
        if (DEBUG) console.log('[BlockOut] Force uploading local data to Dropbox');
        await forceUploadToDropbox(data);
      } else {
        await saveToCloud();
      }
    } catch (e) {
      console.warn('[BlockOut] Could not push manual resolution to cloud', e);
    }
  } else {
    const rv = (conflict.remote.version as number) ?? 0;
    if (rv > 0) recordSuccessfulSync(rv);
  }

  useStore.getState().setConflictState(null);
}

// ─── Debounced local save ─────────────────────────────────────────────────────

let localSaveTimeout: ReturnType<typeof setTimeout>;
let _hasLoaded = false;

// Flag-based cloud sync system
// When any local change happens, this flag is set
// A periodic checker (every 10s) looks for this flag and triggers cloud sync
// If sync fails, flag stays raised for retry on next cycle
let _cloudSavePending = false;

// Flag to prevent cloud save flag during sync operations
// Prevents infinite sync loops
let _skipCloudSaveFlag = false;

export function markDataLoaded(): void {
  _hasLoaded = true;
}

export function debouncedSave(): void {
  if (!_hasLoaded) return; // Don't save before initial load completes
  clearTimeout(localSaveTimeout);
  localSaveTimeout = setTimeout(() => {
    saveLocal().then(() => {
      // After successful local save, flag that cloud sync is needed
      // But skip if we're currently syncing (prevents infinite loops)
      if (!_skipCloudSaveFlag) {
        _cloudSavePending = true;
        if (DEBUG) console.log('[BlockOut] Local save complete, cloud sync flagged');
      } else {
        if (DEBUG) console.log('[BlockOut] Local save complete, skipped cloud flag (sync in progress)');
      }
    });
  }, 800);
}

// ─── Cloud sync checker ───────────────────────────────────────────────────────
// Runs every 10 seconds to check if cloud sync is needed
// Batches multiple changes into one sync operation
// Retries on failure every 10 seconds

const CLOUD_SYNC_CHECK_INTERVAL_MS = 10 * 1000; // 10 seconds
let _syncInProgress = false;

export function startPeriodicCloudSync(): () => void {
  const id = setInterval(async () => {
    // Check if cloud sync is needed
    if (!_cloudSavePending) return;
    
    // Check if any cloud sync is configured (R2, Dropbox, or self-hosted)
    const { url } = getCloudConfig();
    const hasDropbox = isDropboxConfigured();
    const hasR2 = isR2SyncAvailable();
    if (!url && !hasDropbox && !hasR2) {
      // No cloud configured, clear the flag to prevent endless checking
      _cloudSavePending = false;
      return;
    }
    
    // Prevent overlapping syncs
    if (_syncInProgress) return;

    // Lower the flag BEFORE attempting sync
    // If sync fails, we'll raise it again
    _cloudSavePending = false;
    _syncInProgress = true;
    
    if (DEBUG) console.log('[BlockOut] Cloud sync triggered by periodic check');
    
    // Set flag to prevent debouncedSave from re-triggering cloud sync
    _skipCloudSaveFlag = true;
    
    try {
      useStore.getState().setSyncStatus('syncing');
      await saveToCloud();
      if (DEBUG) console.log('[BlockOut] Cloud sync completed successfully');
      useStore.getState().setSyncStatus('synced');
    } catch (e) {
      console.warn('[BlockOut] Cloud sync failed, will retry in 10s:', e);
      useStore.getState().setSyncStatus('error');
      // Re-raise the flag so we retry on next cycle
      _cloudSavePending = true;
    } finally {
      _syncInProgress = false;
      // Clear the skip flag after a short delay to allow any pending local saves to complete
      setTimeout(() => {
        _skipCloudSaveFlag = false;
        if (DEBUG) console.log('[BlockOut] Cloud save skip flag cleared');
      }, 2000);
    }
  }, CLOUD_SYNC_CHECK_INTERVAL_MS);

  const handleUnload = () => {
    const { url, token } = getCloudConfig();
    const hasDropbox = isDropboxConfigured();
    const hasR2 = isR2SyncAvailable();
    if (!url && !hasDropbox && !hasR2) return;

    // R2 sync on unload (best-effort)
    if (hasR2) {
      const data = useStore.getState().getSerializableState();
      saveToR2(data).catch(() => {});
      return;
    }
    
    // For Dropbox, use syncToDropbox directly
    if (hasDropbox) {
      const data = useStore.getState().getSerializableState();
      syncToDropbox(data).catch(() => {});
      return;
    }
    
    // Self-hosted sync
    const data = useStore.getState().getSerializableState();
    const payload = { ...data, lastModified: Date.now() };
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    fetch(`${url}/api/data`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
      keepalive: true,
    }).catch(() => {});
  };

  window.addEventListener('beforeunload', handleUnload);

  return () => {
    clearInterval(id);
    window.removeEventListener('beforeunload', handleUnload);
  };
}

// Manually trigger cloud sync (useful for "Sync Now" buttons)
export function triggerCloudSync(): void {
  _cloudSavePending = true;
  if (DEBUG) console.log('[BlockOut] Cloud sync manually triggered');
}

// Check if cloud sync is pending (for debugging)
export function isCloudSyncPending(): boolean {
  return _cloudSavePending;
}

// Export Dropbox auth info for debugging
export { getDropboxAuthInfo };
