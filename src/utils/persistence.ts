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

// ─── Cloud sync config (persisted in localStorage — it's configuration, not data) ─

const CLOUD_URL_KEY = 'blockout-cloud-url';
const CLOUD_TOKEN_KEY = 'blockout-cloud-token';

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

  // Record last-synced time
  localStorage.setItem('blockout-last-synced', String(Date.now()));
  useStore.getState().setSyncStatus('synced');
}

// ─── Load ─────────────────────────────────────────────────────────────────────

export async function loadData(): Promise<void> {
  let local: Record<string, unknown> | null = null;
  let remote: Record<string, unknown> | null = null;

  // 1. Read local IndexedDB
  try {
    local = await idbRead();
  } catch (e) {
    console.warn('[BlockOut] IndexedDB read failed', e);
  }

  // 2. Read remote (if configured)
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
      console.warn('[BlockOut] Cloud load failed', e);
    }
  }

  // 3. Pick whichever is newer
  const localTs = (local?.lastModified as number) ?? 0;
  const remoteTs = (remote?.lastModified as number) ?? 0;
  const winner = remoteTs > localTs ? remote : local;

  if (winner) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      useStore.getState().loadData(winner as any);
    } catch (e) {
      console.warn('[BlockOut] Failed to load state', e);
    }
  }
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

  // Also push on page unload (best-effort)
  const handleUnload = () => {
    const { url } = getCloudConfig();
    if (!url) return;
    const data = useStore.getState().getSerializableState();
    const payload = { ...data, lastModified: Date.now() };
    const { token } = getCloudConfig();
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    // sendBeacon doesn't support custom headers, use keepalive fetch
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

export function getLastSyncedTime(): number | null {
  const v = localStorage.getItem('blockout-last-synced');
  return v ? parseInt(v, 10) : null;
}
