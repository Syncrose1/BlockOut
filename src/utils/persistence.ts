import { useStore } from '../store';
import { syncToDropbox, syncFromDropbox, isDropboxConfigured, syncToDropboxWithResolution, getDropboxAuthInfo, type SyncResult, type AnyRecord } from './dropbox';

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

// ─── Merge ────────────────────────────────────────────────────────────────────
//
// Strategy:
//   - Remote is the base (cloud changes from other devices are preserved)
//   - Local tasks created after lastSyncedAt are injected (offline creations kept)
//   - Local task completions recorded after lastSyncedAt are overlaid
//   - Categories: union of both sets (no createdAt, so we never silently drop either)
//   - TimeBlocks: locally-created blocks added; shared blocks get taskId union
//   - Pomodoro sessions: append local sessions not already on remote
//   - Streak dates: union of both date sets

// AnyRecord type is imported from dropbox.ts

interface MergeInfo {
  localTasksAdded: number;
  cloudTasksAdded: number;
  completionsFromLocal: number;
  categoriesFromLocal: number;
  blocksFromLocal: number;
}

function mergeSnapshots(
  local: AnyRecord,
  remote: AnyRecord,
  lastSyncedAt: number
): { merged: AnyRecord; info: MergeInfo } {
  const localTasks: AnyRecord = local.tasks ?? {};
  const remoteTasks: AnyRecord = remote.tasks ?? {};
  const localCats: AnyRecord = local.categories ?? {};
  const remoteCats: AnyRecord = remote.categories ?? {};
  const localBlocks: AnyRecord = local.timeBlocks ?? {};
  const remoteBlocks: AnyRecord = remote.timeBlocks ?? {};

  let localTasksAdded = 0;
  let cloudTasksAdded = 0;
  let completionsFromLocal = 0;
  let categoriesFromLocal = 0;
  let blocksFromLocal = 0;

  // ── Tasks ──────────────────────────────────────────────────────────────────
  // Start with remote as base.
  const mergedTasks: AnyRecord = { ...remoteTasks };

  // Count tasks the cloud added that weren't in local.
  for (const id of Object.keys(remoteTasks)) {
    if (!localTasks[id]) cloudTasksAdded++;
  }

  // Inject locally-created tasks (created after last sync, not yet on remote).
  for (const [id, task] of Object.entries(localTasks)) {
    if (!remoteTasks[id] && task.createdAt > lastSyncedAt) {
      mergedTasks[id] = task;
      localTasksAdded++;
    }
  }

  // Overlay local completions: task completed offline that remote still shows incomplete.
  for (const [id, localTask] of Object.entries(localTasks)) {
    if (
      remoteTasks[id] &&
      localTask.completed &&
      !remoteTasks[id].completed &&
      localTask.completedAt &&
      localTask.completedAt > lastSyncedAt
    ) {
      mergedTasks[id] = {
        ...remoteTasks[id],
        completed: true,
        completedAt: localTask.completedAt,
      };
      completionsFromLocal++;
    }
  }

  // ── Categories ─────────────────────────────────────────────────────────────
  // Union: no timestamps on categories so we never drop either side.
  const mergedCats: AnyRecord = { ...remoteCats };
  for (const [id, cat] of Object.entries(localCats)) {
    if (!remoteCats[id]) {
      mergedCats[id] = cat;
      categoriesFromLocal++;
    }
  }

  // ── TimeBlocks ─────────────────────────────────────────────────────────────
  const mergedBlocks: AnyRecord = { ...remoteBlocks };
  for (const [id, block] of Object.entries(localBlocks)) {
    if (!remoteBlocks[id] && block.createdAt > lastSyncedAt) {
      // Created locally while offline — add it.
      mergedBlocks[id] = block;
      blocksFromLocal++;
    } else if (remoteBlocks[id]) {
      // Shared block — union the taskId lists so no assignment is lost.
      const unionIds = [...new Set([...remoteBlocks[id].taskIds, ...block.taskIds])];
      mergedBlocks[id] = { ...remoteBlocks[id], taskIds: unionIds };
    }
  }

  // ── Pomodoro sessions ──────────────────────────────────────────────────────
  const remoteSessions: AnyRecord[] = remote.pomodoroSessions ?? [];
  const localSessions: AnyRecord[] = local.pomodoroSessions ?? [];
  const remoteSessionIds = new Set(remoteSessions.map((s) => s.id));
  const newLocalSessions = localSessions.filter(
    (s) => !remoteSessionIds.has(s.id) && s.startTime > lastSyncedAt
  );

  // ── Streak ─────────────────────────────────────────────────────────────────
  const localDates: string[] = local.streak?.completionDates ?? [];
  const remoteDates: string[] = remote.streak?.completionDates ?? [];
  const mergedDates = [...new Set([...localDates, ...remoteDates])];

  // ── Task Chains ────────────────────────────────────────────────────────────
  // Union approach - preserve both local and remote task chains
  const localTaskChains: AnyRecord = local.taskChains ?? {};
  const remoteTaskChains: AnyRecord = remote.taskChains ?? {};
  const mergedTaskChains: AnyRecord = { ...remoteTaskChains };
  
  // Add local task chains that don't exist in remote
  for (const [date, chain] of Object.entries(localTaskChains)) {
    if (!remoteTaskChains[date]) {
      mergedTaskChains[date] = chain;
    }
  }
  
  // ── Chain Templates ────────────────────────────────────────────────────────
  const localTemplates: AnyRecord = local.chainTemplates ?? {};
  const remoteTemplates: AnyRecord = remote.chainTemplates ?? {};
  const mergedTemplates: AnyRecord = { ...remoteTemplates };
  
  // Add local templates that don't exist in remote
  for (const [id, template] of Object.entries(localTemplates)) {
    if (!remoteTemplates[id]) {
      mergedTemplates[id] = template;
    }
  }
  
  // ── Chain Tasks ─────────────────────────────────────────────────────────────
  const localChainTasks: AnyRecord = local.chainTasks ?? {};
  const remoteChainTasks: AnyRecord = remote.chainTasks ?? {};
  const mergedChainTasks: AnyRecord = { ...remoteChainTasks };
  
  // Add local chain tasks that don't exist in remote
  for (const [id, task] of Object.entries(localChainTasks)) {
    if (!remoteChainTasks[id]) {
      mergedChainTasks[id] = task;
    }
  }

  const merged: AnyRecord = {
    tasks: mergedTasks,
    categories: mergedCats,
    timeBlocks: mergedBlocks,
    activeBlockId: remote.activeBlockId,
    pomodoroSessions: [...remoteSessions, ...newLocalSessions],
    streak: {
      completionDates: mergedDates,
      currentStreak: Math.max(
        local.streak?.currentStreak ?? 0,
        remote.streak?.currentStreak ?? 0
      ),
      longestStreak: Math.max(
        local.streak?.longestStreak ?? 0,
        remote.streak?.longestStreak ?? 0
      ),
    },
    taskChains: mergedTaskChains,
    chainTemplates: mergedTemplates,
    chainTasks: mergedChainTasks,
    lastModified: Date.now(),
  };

  return { merged, info: { localTasksAdded, cloudTasksAdded, completionsFromLocal, categoriesFromLocal, blocksFromLocal } };
}

// ─── Save ─────────────────────────────────────────────────────────────────────

export async function saveLocal(): Promise<void> {
  const data = useStore.getState().getSerializableState();
  const payload = { ...data, lastModified: Date.now() };
  await idbWrite(payload);
}

export async function saveToCloud(): Promise<void> {
  // Check if Dropbox is configured
  if (isDropboxConfigured()) {
    const data = useStore.getState().getSerializableState() as any;
    console.log('[BlockOut] Syncing to Dropbox:', {
      hasTaskChains: !!data.taskChains,
      taskChainCount: Object.keys(data.taskChains || {}).length,
      hasChainTemplates: !!data.chainTemplates,
      chainTemplateCount: Object.keys(data.chainTemplates || {}).length,
    });
    await syncToDropbox(data);
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
              applyData(local);
              break;
              
            case 'downloaded':
              // Remote was newer, use the data that was already downloaded
              if (result.data) {
                applyData(result.data);
                useStore.getState().setSyncStatus('synced');
              } else {
                applyData(local);
              }
              break;
              
            case 'merged':
              // Conflict resolved by merging, use the merged data
              if (result.data) {
                applyData(result.data);
                await idbWrite({ ...result.data, lastModified: Date.now() });
                if (result.mergeInfo) {
                  useStore.getState().setConflictState({ 
                    local, 
                    remote: result.data, 
                    merged: result.data,
                    mergeInfo: result.mergeInfo 
                  });
                }
              }
              useStore.getState().setSyncStatus('synced');
              break;
              
            case 'unchanged':
              applyData(local);
              useStore.getState().setSyncStatus('synced');
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
    if (local) applyData(local);
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

function applyData(data: AnyRecord): void {
  try {
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
      await saveToCloud();
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
        console.log('[BlockOut] Local save complete, cloud sync flagged');
      } else {
        console.log('[BlockOut] Local save complete, skipped cloud flag (sync in progress)');
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
    
    // Check if any cloud sync is configured (Dropbox or self-hosted)
    const { url } = getCloudConfig();
    const hasDropbox = isDropboxConfigured();
    if (!url && !hasDropbox) {
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
    
    console.log('[BlockOut] Cloud sync triggered by periodic check');
    
    // Set flag to prevent debouncedSave from re-triggering cloud sync
    _skipCloudSaveFlag = true;
    
    try {
      useStore.getState().setSyncStatus('syncing');
      await saveToCloud();
      console.log('[BlockOut] Cloud sync completed successfully');
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
        console.log('[BlockOut] Cloud save skip flag cleared');
      }, 2000);
    }
  }, CLOUD_SYNC_CHECK_INTERVAL_MS);

  const handleUnload = () => {
    const { url, token } = getCloudConfig();
    const hasDropbox = isDropboxConfigured();
    if (!url && !hasDropbox) return;
    
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
  console.log('[BlockOut] Cloud sync manually triggered');
}

// Check if cloud sync is pending (for debugging)
export function isCloudSyncPending(): boolean {
  return _cloudSavePending;
}

// Export Dropbox auth info for debugging
export { getDropboxAuthInfo };
