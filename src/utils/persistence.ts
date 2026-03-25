import { useStore } from '../store';
import { syncToDropbox, syncFromDropbox, isDropboxConfigured, syncToDropboxWithResolution, getDropboxAuthInfo, forceUploadToDropbox, mergeSnapshots, type AnyRecord } from './dropbox';
import { saveToR2, loadFromR2, isR2SyncAvailable } from './r2sync';
import { getAccessToken } from './supabase';

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

export async function saveToCloud(): Promise<void> {
  // Check R2 cloud sync (Supabase auth + R2 storage)
  if (await isR2Active()) {
    const data = useStore.getState().getSerializableState();
    const result = await saveToR2(data);
    if (result.success) {
      useStore.getState().setSyncStatus('synced');
      return;
    }
    // If R2 fails, fall through to other methods
    if (DEBUG) console.warn('[BlockOut] R2 sync failed, trying other methods:', result.error);
  }

  // Check if Dropbox is configured
  if (isDropboxConfigured()) {
    const data = useStore.getState().getSerializableState() as any;
    if (DEBUG) console.log('[BlockOut] Syncing to Dropbox:', {
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

  try {
    local = await idbRead();
  } catch (e) {
    console.warn('[BlockOut] IndexedDB read failed', e);
  }

  // Try R2 cloud sync first (if user is signed in)
  if (await isR2Active()) {
    try {
      const result = await loadFromR2();
      if (result.data) {
        remote = result.data;
        if (DEBUG) console.log('[BlockOut] Loaded remote data from R2');

        if (!local) {
          applyData(remote, 'r2-remote');
          useStore.getState().setSyncStatus('synced');
          return;
        }

        // Simple strategy: use whichever has newer lastModified
        const localMod = (local.lastModified as number) ?? 0;
        const remoteMod = (remote.lastModified as number) ?? 0;

        if (remoteMod > localMod) {
          applyData(remote, 'r2-remote-newer');
          // Also save locally
          await idbWrite({ ...remote, lastModified: Date.now() });
        } else {
          applyData(local, 'r2-local-newer');
          // Push local to R2
          const data = useStore.getState().getSerializableState();
          saveToR2(data).catch((e) => console.warn('[BlockOut] R2 push failed', e));
        }
        useStore.getState().setSyncStatus('synced');
        return;
      }
      // No remote data — use local, push if available
      if (local) {
        applyData(local, 'r2-no-remote');
        const data = useStore.getState().getSerializableState();
        saveToR2(data).catch((e) => console.warn('[BlockOut] R2 initial push failed', e));
        useStore.getState().setSyncStatus('synced');
        return;
      }
    } catch (e) {
      console.warn('[BlockOut] R2 load failed, trying other methods', e);
    }
  }

  const { url, token } = getCloudConfig();

  // Try Dropbox if configured
  if (isDropboxConfigured()) {
    try {
      if (local) {
        // Use smart sync with conflict resolution
        const result = await syncToDropboxWithResolution(local, 'loadData');
        
        if (result.success) {
          switch (result.action) {
            case 'uploaded':
              // Local was newer, uploaded successfully
              useStore.getState().setSyncStatus('synced');
              applyData(local, 'dropbox-uploaded');
              // Back up to R2 if available
              if (isR2SyncAvailable()) saveToR2(useStore.getState().getSerializableState() as Record<string, unknown>).catch(() => {});
              break;

            case 'downloaded':
              // Remote was newer, use the data that was already downloaded
              if (DEBUG) console.log('[BlockOut] Downloaded case, has data:', !!result.data);
              if (result.data) {
                applyData(result.data, 'dropbox-downloaded');
                useStore.getState().setSyncStatus('synced');
                // Back up to R2 if available
                if (isR2SyncAvailable()) saveToR2(useStore.getState().getSerializableState() as Record<string, unknown>).catch(() => {});
              } else {
                console.warn('[BlockOut] No data in download result, using local');
                applyData(local, 'dropbox-download-fallback');
              }
              break;

            case 'merged':
              // Conflict resolved by merging, use the merged data
              if (result.data) {
                applyData(result.data, 'dropbox-merged');
                await idbWrite({ ...result.data, lastModified: Date.now() });
                if (result.mergeInfo) {
                  useStore.getState().setConflictState({
                    local,
                    remote: result.data,
                    merged: result.data,
                    mergeInfo: result.mergeInfo
                  });
                }
                // Back up to R2 if available
                if (isR2SyncAvailable()) saveToR2(useStore.getState().getSerializableState() as Record<string, unknown>).catch(() => {});
              }
              useStore.getState().setSyncStatus('synced');
              break;

            case 'unchanged':
              applyData(local, 'dropbox-unchanged');
              useStore.getState().setSyncStatus('synced');
              // Local is already most up-to-date — back up to R2 if available
              if (isR2SyncAvailable()) saveToR2(useStore.getState().getSerializableState() as Record<string, unknown>).catch(() => {});
              break;
          }
          return;
        } else {
          console.warn('[BlockOut] Dropbox sync failed:', result.error);
          // Fall through to use local data
        }
      } else {
        // No local data, just download
        remote = await syncFromDropbox();
        if (remote) {
          applyData(remote);
          useStore.getState().setSyncStatus('synced');
          // Back up to R2 if available
          if (isR2SyncAvailable()) saveToR2(useStore.getState().getSerializableState() as Record<string, unknown>).catch(() => {});
        }
        return;
      }
    } catch (e) {
      console.warn('[BlockOut] Dropbox load failed, using local', e);
    }
  } else if (url) {
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
    if (local) {
      applyData(local, 'local-only');
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
