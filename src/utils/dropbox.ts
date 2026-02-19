// Dropbox sync integration for BlockOut
// Uses Dropbox OAuth 2.0 PKCE flow for secure authentication
// NO TOKENS ARE STORED IN CODE - each user authenticates with their own account

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY || '';

interface DropboxToken {
  access_token: string;
  expires_at?: number;
}

interface DropboxFileMetadata {
  rev: string;
  server_modified: string;
}

// Storage keys
const DROPBOX_TOKEN_KEY = 'blockout-dropbox-token';
const DROPBOX_PKCE_VERIFIER_KEY = 'blockout-dropbox-pkce-verifier';
const DROPBOX_FILE_PATH = '/blockout-data.json';
const DROPBOX_LAST_SYNC_VERSION_KEY = 'blockout-dropbox-last-version';
const DROPBOX_LAST_SYNC_AT_KEY = 'blockout-dropbox-last-sync-at';

// Check if Dropbox is configured (user has authenticated)
export function isDropboxConfigured(): boolean {
  return !!getDropboxToken();
}

// Get stored token
function getDropboxToken(): string | null {
  try {
    const stored = localStorage.getItem(DROPBOX_TOKEN_KEY);
    if (!stored) return null;
    const token: DropboxToken = JSON.parse(stored);
    // Check if token is expired
    if (token.expires_at && Date.now() > token.expires_at) {
      clearDropboxConfig();
      return null;
    }
    return token.access_token;
  } catch {
    return null;
  }
}

// Store token with expiration
function setDropboxToken(accessToken: string, expiresIn?: number): void {
  const token: DropboxToken = {
    access_token: accessToken,
    expires_at: expiresIn ? Date.now() + (expiresIn * 1000) : undefined,
  };
  localStorage.setItem(DROPBOX_TOKEN_KEY, JSON.stringify(token));
}

// Clear token and sync metadata
export function clearDropboxConfig(): void {
  localStorage.removeItem(DROPBOX_TOKEN_KEY);
  localStorage.removeItem(DROPBOX_LAST_SYNC_VERSION_KEY);
  localStorage.removeItem(DROPBOX_LAST_SYNC_AT_KEY);
}

// Version tracking for conflict resolution
function getLastSyncedVersion(): number {
  return parseInt(localStorage.getItem(DROPBOX_LAST_SYNC_VERSION_KEY) ?? '0', 10);
}

function getLastSyncedAt(): number {
  return parseInt(localStorage.getItem(DROPBOX_LAST_SYNC_AT_KEY) ?? '0', 10);
}

function recordSuccessfulSync(version: number): void {
  localStorage.setItem(DROPBOX_LAST_SYNC_VERSION_KEY, String(version));
  localStorage.setItem(DROPBOX_LAST_SYNC_AT_KEY, String(Date.now()));
}

// Generate PKCE code verifier and challenge
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 128);
  
  // For 'plain' method, challenge = verifier
  const challenge = verifier;
  
  return { verifier, challenge };
}

// Start OAuth flow
export function startDropboxAuth(): void {
  if (!DROPBOX_APP_KEY) {
    alert('Dropbox App Key not configured. Please set VITE_DROPBOX_APP_KEY in your .env file');
    return;
  }

  const redirectUri = `${window.location.origin}/`;
  const { verifier, challenge } = generatePKCE();
  
  // Store verifier for callback (use localStorage as it persists through redirects)
  localStorage.setItem(DROPBOX_PKCE_VERIFIER_KEY, verifier);
  
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'plain',
    token_access_type: 'offline',
  });

  window.location.href = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

// Handle OAuth callback
export async function handleDropboxCallback(code: string): Promise<boolean> {
  const verifier = localStorage.getItem(DROPBOX_PKCE_VERIFIER_KEY);
  if (!verifier) {
    console.error('PKCE verifier not found in localStorage');
    return false;
  }

  try {
    const redirectUri = `${window.location.origin}/`;
    
    const response = await fetch('https://api.dropboxapi.com/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        code,
        grant_type: 'authorization_code',
        client_id: DROPBOX_APP_KEY,
        redirect_uri: redirectUri,
        code_verifier: verifier,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OAuth error response:', errorText);
      throw new Error(`OAuth error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    setDropboxToken(data.access_token, data.expires_in);
    
    // Clean up
    localStorage.removeItem(DROPBOX_PKCE_VERIFIER_KEY);
    
    return true;
  } catch (error) {
    console.error('Failed to complete Dropbox OAuth:', error);
    return false;
  }
}

// Dropbox API wrapper
class DropboxAPI {
  private accessToken: string;

  constructor(accessToken: string) {
    this.accessToken = accessToken;
  }

  private async request(path: string, options: RequestInit = {}): Promise<Response> {
    const response = await fetch(`https://api.dropboxapi.com/2${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dropbox API error: ${error}`);
    }

    return response;
  }

  private async contentRequest(path: string, options: RequestInit = {}): Promise<Response> {
    const response = await fetch(`https://content.dropboxapi.com/2${path}`, {
      ...options,
      headers: {
        'Authorization': `Bearer ${this.accessToken}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Dropbox API error: ${error}`);
    }

    return response;
  }

  async uploadFile(path: string, content: string): Promise<DropboxFileMetadata> {
    const blob = new Blob([content], { type: 'application/json' });
    
    const args = JSON.stringify({
      path,
      mode: 'overwrite',
      autorename: false,
    });

    const response = await this.contentRequest('/files/upload', {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': args,
        'Content-Type': 'application/octet-stream',
      },
      body: blob,
    });

    // Return metadata for version tracking
    const resultHeader = response.headers.get('dropbox-api-result');
    if (resultHeader) {
      return JSON.parse(resultHeader);
    }
    return { rev: '', server_modified: new Date().toISOString() };
  }

  async downloadFile(path: string): Promise<{ content: string; metadata: DropboxFileMetadata } | null> {
    try {
      const args = JSON.stringify({ path });
      
      const response = await this.contentRequest('/files/download', {
        method: 'POST',
        headers: {
          'Dropbox-API-Arg': args,
        },
      });

      const content = await response.text();
      const resultHeader = response.headers.get('dropbox-api-result');
      const metadata = resultHeader ? JSON.parse(resultHeader) : { rev: '', server_modified: new Date().toISOString() };

      return { content, metadata };
    } catch (error) {
      if (error instanceof Error && error.message.includes('not_found')) {
        return null;
      }
      throw error;
    }
  }
}

// Sync result types
export interface SyncResult {
  success: boolean;
  action: 'uploaded' | 'downloaded' | 'merged' | 'unchanged' | 'error';
  remoteVersion?: number;
  localVersion?: number;
  mergeInfo?: {
    localTasksAdded: number;
    cloudTasksAdded: number;
    completionsFromLocal: number;
    categoriesFromLocal: number;
    blocksFromLocal: number;
  };
  error?: string;
}

// Merge function (same logic as persistence.ts)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = Record<string, any>;

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

  // Tasks
  const mergedTasks: AnyRecord = { ...remoteTasks };
  for (const id of Object.keys(remoteTasks)) {
    if (!localTasks[id]) cloudTasksAdded++;
  }
  for (const [id, task] of Object.entries(localTasks)) {
    if (!remoteTasks[id] && task.createdAt > lastSyncedAt) {
      mergedTasks[id] = task;
      localTasksAdded++;
    }
  }
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

  // Categories
  const mergedCats: AnyRecord = { ...remoteCats };
  for (const [id, cat] of Object.entries(localCats)) {
    if (!remoteCats[id]) {
      mergedCats[id] = cat;
      categoriesFromLocal++;
    }
  }

  // TimeBlocks
  const mergedBlocks: AnyRecord = { ...remoteBlocks };
  for (const [id, block] of Object.entries(localBlocks)) {
    if (!remoteBlocks[id] && block.createdAt > lastSyncedAt) {
      mergedBlocks[id] = block;
      blocksFromLocal++;
    } else if (remoteBlocks[id]) {
      const unionIds = [...new Set([...remoteBlocks[id].taskIds, ...block.taskIds])];
      mergedBlocks[id] = { ...remoteBlocks[id], taskIds: unionIds };
    }
  }

  // Pomodoro sessions
  const remoteSessions: AnyRecord[] = remote.pomodoroSessions ?? [];
  const localSessions: AnyRecord[] = local.pomodoroSessions ?? [];
  const remoteSessionIds = new Set(remoteSessions.map((s) => s.id));
  const newLocalSessions = localSessions.filter(
    (s) => !remoteSessionIds.has(s.id) && s.startTime > lastSyncedAt
  );

  // Streak
  const localDates: string[] = local.streak?.completionDates ?? [];
  const remoteDates: string[] = remote.streak?.completionDates ?? [];
  const mergedDates = [...new Set([...localDates, ...remoteDates])];

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
    lastModified: Date.now(),
  };

  return { merged, info: { localTasksAdded, cloudTasksAdded, completionsFromLocal, categoriesFromLocal, blocksFromLocal } };
}

// Smart sync with conflict resolution (mirrors self-hosted architecture)
export async function syncToDropboxWithResolution(localData: AnyRecord): Promise<SyncResult> {
  const token = getDropboxToken();
  if (!token) {
    return { success: false, action: 'error', error: 'Not authenticated with Dropbox' };
  }

  const dropbox = new DropboxAPI(token);
  const lastSyncedVersion = getLastSyncedVersion();
  const lastSyncedAt = getLastSyncedAt();
  const localLastModified = localData.lastModified ?? 0;

  try {
    // First, download remote to check for conflicts
    const remoteResult = await dropbox.downloadFile(DROPBOX_FILE_PATH);
    
    if (!remoteResult) {
      // File doesn't exist - upload initial data
      const payload = { ...localData, version: 1, lastModified: Date.now() };
      const metadata = await dropbox.uploadFile(DROPBOX_FILE_PATH, JSON.stringify(payload, null, 2));
      recordSuccessfulSync(1);
      return { success: true, action: 'uploaded', remoteVersion: 1 };
    }

    const remoteData = JSON.parse(remoteResult.content);
    const remoteVersion = remoteData.version ?? 0;
    const remoteLastModified = remoteData.lastModified ?? 0;

    // Detect conflicts
    const remoteHasNewWrites = remoteVersion > lastSyncedVersion;
    const localHasUnpushedChanges = localLastModified > lastSyncedAt && lastSyncedAt > 0;

    // Case D: First time connecting to Dropbox with existing remote content
    if (lastSyncedVersion === 0 && remoteVersion > 0) {
      const remoteHasContent =
        Object.keys(remoteData.tasks ?? {}).length > 0 ||
        Object.keys(remoteData.categories ?? {}).length > 0;
      
      if (remoteHasContent) {
        // Return remote data for caller to apply
        return { 
          success: true, 
          action: 'downloaded', 
          remoteVersion,
          localVersion: 0
        };
      }
    }

    // Case C: Both have changes - merge required
    if (remoteHasNewWrites && localHasUnpushedChanges) {
      const { merged, info } = mergeSnapshots(localData, remoteData, lastSyncedAt);
      const newVersion = Math.max(remoteVersion, lastSyncedVersion) + 1;
      const payload = { ...merged, version: newVersion, lastModified: Date.now() };
      
      await dropbox.uploadFile(DROPBOX_FILE_PATH, JSON.stringify(payload, null, 2));
      recordSuccessfulSync(newVersion);
      
      return {
        success: true,
        action: 'merged',
        remoteVersion: newVersion,
        localVersion: lastSyncedVersion,
        mergeInfo: info,
      };
    }

    // Case B: Remote has changes, local unchanged - download
    if (remoteHasNewWrites) {
      recordSuccessfulSync(remoteVersion);
      return {
        success: true,
        action: 'downloaded',
        remoteVersion,
        localVersion: lastSyncedVersion,
      };
    }

    // Case A: Remote unchanged or local is newer - upload
    if (localLastModified >= remoteLastModified) {
      const newVersion = Math.max(remoteVersion, lastSyncedVersion) + 1;
      const payload = { ...localData, version: newVersion, lastModified: Date.now() };
      
      await dropbox.uploadFile(DROPBOX_FILE_PATH, JSON.stringify(payload, null, 2));
      recordSuccessfulSync(newVersion);
      
      return {
        success: true,
        action: 'uploaded',
        remoteVersion: newVersion,
        localVersion: lastSyncedVersion,
      };
    }

    // Remote is newer despite version check - download it
    recordSuccessfulSync(remoteVersion);
    return {
      success: true,
      action: 'downloaded',
      remoteVersion,
      localVersion: lastSyncedVersion,
    };

  } catch (error) {
    console.error('Dropbox sync error:', error);
    return { 
      success: false, 
      action: 'error', 
      error: error instanceof Error ? error.message : 'Unknown error' 
    };
  }
}

// Download from Dropbox (for initial load or force refresh)
export async function syncFromDropbox(): Promise<AnyRecord | null> {
  const token = getDropboxToken();
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }

  const dropbox = new DropboxAPI(token);
  const result = await dropbox.downloadFile(DROPBOX_FILE_PATH);
  
  if (!result) {
    return null;
  }

  const data = JSON.parse(result.content);
  const version = data.version ?? 0;
  recordSuccessfulSync(version);
  
  return data;
}

// Legacy simple upload (kept for compatibility)
export async function syncToDropbox(data: object): Promise<void> {
  const result = await syncToDropboxWithResolution(data as AnyRecord);
  if (!result.success) {
    throw new Error(result.error || 'Sync failed');
  }
}

// Get Dropbox config (for UI display)
export function getDropboxConfig(): { isConfigured: boolean } {
  return {
    isConfigured: isDropboxConfigured(),
  };
}

// Export types for persistence.ts
export type { AnyRecord };
export { mergeSnapshots, getLastSyncedVersion as getDropboxLastSyncedVersion };
