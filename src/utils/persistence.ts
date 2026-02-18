import { useStore } from '../store';

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

// ─── Sync metadata (stored in localStorage — config/tracking, not app data) ──

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

export async function saveToCloud(): Promise<void> {
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
  // Server returns the version it just wrote
  const newVersion = json.version ?? getLastSyncedVersion() + 1;
  recordSuccessfulSync(newVersion);
  useStore.getState().setSyncStatus('synced');
}

// ─── Load — version-aware conflict detection ──────────────────────────────────
//
// States:
//   A) remote.version == lastSyncedVersion
//      → server unchanged since our last sync
//      → use local if it has newer changes, else remote
//
//   B) remote.version > lastSyncedVersion  AND  local unchanged since last sync
//      → we were just passively offline, server moved ahead
//      → silently take remote, update lastSyncedVersion
//
//   C) remote.version > lastSyncedVersion  AND  local has changes since last sync
//      → TRUE CONFLICT: both sides diverged while we were offline
//      → surface conflict UI so the user decides
//
//   D) no cloud configured, or remote fetch failed
//      → use local unconditionally
//
// Edge case: lastSyncedVersion == 0 (never synced with this server before)
//   → treat as case B if only remote has data, or case A if only local has data.
//   → if both have data and remote has tasks/categories, it's a first-time connect:
//      prefer remote (server is the source of truth for first connection).

export async function loadData(): Promise<void> {
  let local: Record<string, unknown> | null = null;
  let remote: Record<string, unknown> | null = null;

  try {
    local = await idbRead();
  } catch (e) {
    console.warn('[BlockOut] IndexedDB read failed', e);
  }

  const { url, token } = getCloudConfig();
  if (url) {
    try {
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(`${url}/api/data`, { headers });
      if (res.ok) {
        const json = await res.json();
        if (json && typeof json === 'object') remote = json;
      }
    } catch (e) {
      console.warn('[BlockOut] Cloud load failed, using local', e);
    }
  }

  // No cloud — just load local
  if (!remote) {
    if (local) applyData(local);
    return;
  }

  // No local data — take remote as-is
  if (!local) {
    applyData(remote);
    const remoteVersion = (remote.version as number) ?? 0;
    if (remoteVersion > 0) recordSuccessfulSync(remoteVersion);
    return;
  }

  const lastSyncedVersion = getLastSyncedVersion();
  const lastSyncedAt = getLastSyncedAt();
  const remoteVersion = (remote.version as number) ?? 0;
  const localLastModified = (local.lastModified as number) ?? 0;

  const remoteHasNewWrites = remoteVersion > lastSyncedVersion;
  // Local has changes if it was modified after the last time we synced with the server
  const localHasUnpushedChanges = localLastModified > lastSyncedAt && lastSyncedAt > 0;

  // First-time connecting to this server (never synced before): prefer remote
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
    // Case C — true conflict: both sides diverged
    useStore.getState().setConflictState({ local, remote });
    // Load local for now so the app isn't empty; user will resolve via modal
    applyData(local);
    return;
  }

  if (remoteHasNewWrites) {
    // Case B — we were passively offline, server moved ahead
    applyData(remote);
    recordSuccessfulSync(remoteVersion);
    return;
  }

  // Case A — server unchanged since our last sync; use whichever has newer lastModified
  const remoteLastModified = (remote.lastModified as number) ?? 0;
  if (localLastModified >= remoteLastModified) {
    applyData(local);
  } else {
    applyData(remote);
    recordSuccessfulSync(remoteVersion);
  }
}

function applyData(data: Record<string, unknown>): void {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    useStore.getState().loadData(data as any);
  } catch (e) {
    console.warn('[BlockOut] Failed to apply state', e);
  }
}

// ─── Conflict resolution — called by the ConflictResolutionModal ──────────────

export async function resolveConflict(choice: 'local' | 'remote'): Promise<void> {
  const conflict = useStore.getState().conflictState;
  if (!conflict) return;

  const winner = choice === 'local' ? conflict.local : conflict.remote;
  applyData(winner);
  await saveLocal();

  if (choice === 'local') {
    // Push local to server so it becomes the new truth
    try {
      await saveToCloud();
    } catch (e) {
      console.warn('[BlockOut] Could not push local conflict resolution to cloud', e);
    }
  } else {
    // Remote wins — update our sync pointer to remote's version
    const remoteVersion = (conflict.remote.version as number) ?? 0;
    if (remoteVersion > 0) recordSuccessfulSync(remoteVersion);
  }

  useStore.getState().setConflictState(null);
}

// ─── Debounced local save (called on every state change) ──────────────────────

let localSaveTimeout: ReturnType<typeof setTimeout>;
export function debouncedSave(): void {
  clearTimeout(localSaveTimeout);
  localSaveTimeout = setTimeout(saveLocal, 800);
}

// ─── Periodic cloud push ─────────────────────────────────────────────────────

const CLOUD_PUSH_INTERVAL_MS = 5 * 60 * 1000; // 5 minutes

export function startPeriodicCloudSync(): () => void {
  const id = setInterval(async () => {
    const { url } = getCloudConfig();
    if (!url) return;
    try {
      useStore.getState().setSyncStatus('syncing');
      await saveToCloud();
    } catch (e) {
      console.warn('[BlockOut] Periodic cloud sync failed', e);
      useStore.getState().setSyncStatus('error');
    }
  }, CLOUD_PUSH_INTERVAL_MS);

  const handleUnload = () => {
    const { url, token } = getCloudConfig();
    if (!url) return;
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
