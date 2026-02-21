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

// Domain-specific storage to prevent localhost vs production conflicts
// Each domain gets its own isolated storage namespace
function getDomainPrefix(): string {
  const domain = window.location.hostname.replace(/[^a-zA-Z0-9]/g, '_');
  return `blockout-${domain}`;
}

// Storage keys - now domain-specific
const getStorageKey = (key: string) => `${getDomainPrefix()}-${key}`;
const DROPBOX_TOKEN_KEY = getStorageKey('dropbox-token');
const DROPBOX_PKCE_VERIFIER_KEY = getStorageKey('dropbox-pkce-verifier');
const DROPBOX_PKCE_DOMAIN_KEY = getStorageKey('dropbox-pkce-domain'); // Track which domain initiated auth
const DROPBOX_FILE_PATH = '/blockout-data.json';
const DROPBOX_LAST_SYNC_VERSION_KEY = getStorageKey('dropbox-last-version');
const DROPBOX_LAST_SYNC_AT_KEY = getStorageKey('dropbox-last-sync-at');

// Debug logging helper
function logAuthDebug(message: string, data?: unknown) {
  console.log(`[BlockOut Dropbox] ${message}`, data !== undefined ? data : '');
}

// Check if Dropbox is configured (user has authenticated)
export function isDropboxConfigured(): boolean {
  const token = getDropboxToken();
  const configured = !!token;
  
  logAuthDebug('isDropboxConfigured check', {
    configured,
    domain: window.location.hostname,
    tokenKey: DROPBOX_TOKEN_KEY,
    hasToken: !!token,
    tokenLength: token ? token.length : 0
  });
  
  return configured;
}

// Get Dropbox auth info for debugging
export function getDropboxAuthInfo(): {
  isConfigured: boolean;
  domain: string;
  tokenKey: string;
  lastSyncedAt: number | null;
  lastSyncedVersion: number;
} {
  const token = getDropboxToken();
  const lastSyncedAt = getLastSyncedAt();
  const lastSyncedVersion = getLastSyncedVersion();
  
  const info = {
    isConfigured: !!token,
    domain: window.location.hostname,
    tokenKey: DROPBOX_TOKEN_KEY,
    lastSyncedAt: lastSyncedAt || null,
    lastSyncedVersion
  };
  
  logAuthDebug('Auth info', info);
  return info;
}

// Get stored token
function getDropboxToken(): string | null {
  try {
    const stored = localStorage.getItem(DROPBOX_TOKEN_KEY);
    console.log('[BlockOut] Getting Dropbox token, exists:', !!stored);
    if (!stored) return null;
    const token: DropboxToken = JSON.parse(stored);
    console.log('[BlockOut] Token expires at:', token.expires_at, 'now:', Date.now());
    // Check if token is expired
    if (token.expires_at && Date.now() > token.expires_at) {
      console.log('[BlockOut] Token expired, clearing');
      clearDropboxConfig();
      return null;
    }
    return token.access_token;
  } catch (e) {
    console.error('[BlockOut] Error reading token:', e);
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
  localStorage.removeItem(DROPBOX_PKCE_VERIFIER_KEY);
  localStorage.removeItem(DROPBOX_PKCE_DOMAIN_KEY);
  localStorage.removeItem(DROPBOX_LAST_SYNC_VERSION_KEY);
  localStorage.removeItem(DROPBOX_LAST_SYNC_AT_KEY);
  console.log('[BlockOut] Dropbox config cleared for domain:', window.location.origin);
}

// Force complete re-authentication
export function forceReauth(): void {
  clearDropboxConfig();
  // Also clear any cached data
  localStorage.removeItem('blockout-last-synced-version');
  localStorage.removeItem('blockout-last-synced-at');
  console.log('[BlockOut] Force reauth - all Dropbox data cleared');
  // Redirect to auth
  startDropboxAuth();
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
  const currentDomain = window.location.hostname;
  
  console.log('[BlockOut] Starting Dropbox auth with redirect:', redirectUri);
  console.log('[BlockOut] Current domain:', currentDomain);
  
  const { verifier, challenge } = generatePKCE();
  
  // Store verifier AND domain for callback (use localStorage as it persists through redirects)
  localStorage.setItem(DROPBOX_PKCE_VERIFIER_KEY, verifier);
  localStorage.setItem(DROPBOX_PKCE_DOMAIN_KEY, currentDomain);
  console.log('[BlockOut] PKCE verifier stored for domain:', currentDomain);
  
  const params = new URLSearchParams({
    client_id: DROPBOX_APP_KEY,
    response_type: 'code',
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: 'plain',
    token_access_type: 'offline',
  });

  const authUrl = `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
  console.log('[BlockOut] Redirecting to:', authUrl);
  window.location.href = authUrl;
}

// Handle OAuth callback
export async function handleDropboxCallback(code: string): Promise<{ success: boolean; error?: string }> {
  const verifier = localStorage.getItem(DROPBOX_PKCE_VERIFIER_KEY);
  const storedDomain = localStorage.getItem(DROPBOX_PKCE_DOMAIN_KEY);
  const currentDomain = window.location.hostname;
  
  console.log('[BlockOut] Handling Dropbox callback on domain:', currentDomain);
  console.log('[BlockOut] Stored domain:', storedDomain);
  console.log('[BlockOut] Verifier exists:', !!verifier);
  
  // Check if verifier exists
  if (!verifier) {
    console.error('PKCE verifier not found in localStorage');
    return { 
      success: false, 
      error: 'Authentication session expired. Please try connecting Dropbox again.' 
    };
  }
  
  // Verify domain matches (helpful for debugging)
  if (storedDomain && storedDomain !== currentDomain) {
    console.warn(`[BlockOut] Domain mismatch: started on ${storedDomain}, now on ${currentDomain}`);
    // Don't fail here - just warn, as the domain-specific keys should handle this
  }

  try {
    const redirectUri = `${window.location.origin}/`;
    console.log('[BlockOut] Exchanging code for token with redirect:', redirectUri);
    
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
      const errorData = await response.json().catch(() => ({}));
      const errorText = JSON.stringify(errorData);
      console.error('OAuth error response:', errorText);
      
      // Check for specific error types
      if (errorData.error === 'invalid_redirect_uri' || errorText.includes('redirect_uri')) {
        return { 
          success: false, 
          error: `Redirect URI mismatch. Your current domain (${window.location.origin}) is not authorized in your Dropbox app settings. Please add "${redirectUri}" to your Dropbox app's redirect URIs.` 
        };
      }
      
      if (errorData.error === 'invalid_grant') {
        return { 
          success: false, 
          error: 'Authorization code expired or already used. Please try connecting Dropbox again.' 
        };
      }
      
      return { 
        success: false, 
        error: `Authentication failed: ${errorData.error_description || errorData.error || 'Unknown error'}` 
      };
    }

    const data = await response.json();
    console.log('[BlockOut] Token received, expires in:', data.expires_in);
    setDropboxToken(data.access_token, data.expires_in);
    
    // Clean up
    localStorage.removeItem(DROPBOX_PKCE_VERIFIER_KEY);
    localStorage.removeItem(DROPBOX_PKCE_DOMAIN_KEY);
    
    return { success: true };
  } catch (error) {
    console.error('Failed to complete Dropbox OAuth:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Unknown error during authentication' 
    };
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
    try {
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
    } catch (error) {
      if (error instanceof TypeError && error.message.includes('NetworkError')) {
        throw new Error('CORS/Network error: Cannot connect to Dropbox. Token may be invalid or expired. Please reconnect Dropbox.');
      }
      throw error;
    }
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
  data?: AnyRecord; // The remote/merged data (avoid double download)
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

  // Task Chains - union approach
  const localTaskChains: AnyRecord = local.taskChains ?? {};
  const remoteTaskChains: AnyRecord = remote.taskChains ?? {};
  const mergedTaskChains: AnyRecord = { ...remoteTaskChains };
  for (const [date, chain] of Object.entries(localTaskChains)) {
    if (!remoteTaskChains[date]) {
      mergedTaskChains[date] = chain;
    }
  }

  // Chain Templates - union approach
  const localTemplates: AnyRecord = local.chainTemplates ?? {};
  const remoteTemplates: AnyRecord = remote.chainTemplates ?? {};
  const mergedTemplates: AnyRecord = { ...remoteTemplates };
  for (const [id, template] of Object.entries(localTemplates)) {
    if (!remoteTemplates[id]) {
      mergedTemplates[id] = template;
    }
  }

  // Chain Tasks - union approach
  const localChainTasks: AnyRecord = local.chainTasks ?? {};
  const remoteChainTasks: AnyRecord = remote.chainTasks ?? {};
  const mergedChainTasks: AnyRecord = { ...remoteChainTasks };
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

// Smart sync with conflict resolution (mirrors self-hosted architecture)
export async function syncToDropboxWithResolution(localData: AnyRecord, source: string = 'unknown'): Promise<SyncResult> {
  logAuthDebug('Starting sync', { 
    source, 
    domain: window.location.hostname,
    tasksCount: Object.keys(localData.tasks ?? {}).length,
    lastSyncedVersion: getLastSyncedVersion(),
    lastSyncedAt: getLastSyncedAt()
  });
  
  const token = getDropboxToken();
  if (!token) {
    logAuthDebug('Sync failed - no token');
    return { success: false, action: 'error', error: 'Not authenticated with Dropbox' };
  }

  const dropbox = new DropboxAPI(token);
  const lastSyncedVersion = getLastSyncedVersion();
  const lastSyncedAt = getLastSyncedAt();
  const localLastModified = localData.lastModified ?? 0;

  try {
    logAuthDebug('Downloading remote data to check for conflicts');
    // First, download remote to check for conflicts
    const remoteResult = await dropbox.downloadFile(DROPBOX_FILE_PATH);
    
    if (!remoteResult) {
      logAuthDebug('No remote file exists - uploading initial data');
      const payload = { ...localData, version: 1, lastModified: Date.now() };
      const metadata = await dropbox.uploadFile(DROPBOX_FILE_PATH, JSON.stringify(payload, null, 2));
      recordSuccessfulSync(1);
      logAuthDebug('Initial upload complete', { version: 1 });
      return { success: true, action: 'uploaded', remoteVersion: 1 };
    }

    const remoteData = JSON.parse(remoteResult.content);
    const remoteVersion = remoteData.version ?? 0;
    const remoteLastModified = remoteData.lastModified ?? 0;

    logAuthDebug('Remote data downloaded', { 
      remoteVersion, 
      remoteLastModified,
      localLastModified,
      lastSyncedVersion,
      lastSyncedAt
    });

    // Detect conflicts
    const remoteHasNewWrites = remoteVersion > lastSyncedVersion;
    const localHasUnpushedChanges = localLastModified > lastSyncedAt && lastSyncedAt > 0;

    logAuthDebug('Conflict detection', { 
      remoteHasNewWrites, 
      localHasUnpushedChanges,
      lastSyncedVersion,
      lastSyncedAt
    });

    // Case D: First time connecting to Dropbox with existing remote content
    if (lastSyncedVersion === 0 && remoteVersion > 0) {
      const remoteHasContent =
        Object.keys(remoteData.tasks ?? {}).length > 0 ||
        Object.keys(remoteData.categories ?? {}).length > 0;
      
      if (remoteHasContent) {
        logAuthDebug('First-time sync with existing remote content');
        return { 
          success: true, 
          action: 'downloaded', 
          remoteVersion,
          localVersion: 0,
          data: remoteData  // Return the already-downloaded data
        };
      }
    }

    // Case C: Both have changes - merge required
    if (remoteHasNewWrites && localHasUnpushedChanges) {
      logAuthDebug('Conflict detected - merging changes');
      const { merged, info } = mergeSnapshots(localData, remoteData, lastSyncedAt);
      const newVersion = Math.max(remoteVersion, lastSyncedVersion) + 1;
      const payload = { ...merged, version: newVersion, lastModified: Date.now() };
      
      await dropbox.uploadFile(DROPBOX_FILE_PATH, JSON.stringify(payload, null, 2));
      recordSuccessfulSync(newVersion);
      
      logAuthDebug('Merge complete', { newVersion, mergeInfo: info });
      return {
        success: true,
        action: 'merged',
        remoteVersion: newVersion,
        localVersion: lastSyncedVersion,
        mergeInfo: info,
        data: payload  // Return the merged data that was uploaded
      };
    }

    // Case B: Remote has changes, local unchanged - download
    if (remoteHasNewWrites) {
      logAuthDebug('Remote has new changes - downloading');
      recordSuccessfulSync(remoteVersion);
      return {
        success: true,
        action: 'downloaded',
        remoteVersion,
        localVersion: lastSyncedVersion,
        data: remoteData  // Return the already-downloaded data
      };
    }

    // Case A: Remote unchanged or local is newer - upload
    if (localLastModified >= remoteLastModified) {
      logAuthDebug('Uploading local changes');
      const newVersion = Math.max(remoteVersion, lastSyncedVersion) + 1;
      const payload = { ...localData, version: newVersion, lastModified: Date.now() };
      
      await dropbox.uploadFile(DROPBOX_FILE_PATH, JSON.stringify(payload, null, 2));
      recordSuccessfulSync(newVersion);
      
      logAuthDebug('Upload complete', { newVersion });
      return {
        success: true,
        action: 'uploaded',
        remoteVersion: newVersion,
        localVersion: lastSyncedVersion,
      };
    }

    // Remote is newer despite version check - download it
    logAuthDebug('Remote is newer - downloading', {
      remoteVersion,
      localVersion: lastSyncedVersion,
      hasRemoteData: !!remoteData,
      remoteDataKeys: remoteData ? Object.keys(remoteData) : [],
      taskChainsCount: Object.keys(remoteData?.taskChains || {}).length
    });
    recordSuccessfulSync(remoteVersion);
    return {
      success: true,
      action: 'downloaded',
      remoteVersion,
      localVersion: lastSyncedVersion,
      data: remoteData  // Return the already-downloaded data
    };

  } catch (error) {
    logAuthDebug('Sync error', { error: error instanceof Error ? error.message : 'Unknown' });
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
