// Dropbox sync integration for BlockOut
// Uses Dropbox OAuth 2.0 PKCE flow for secure authentication
// NO TOKENS ARE STORED IN CODE - each user authenticates with their own account

const DROPBOX_APP_KEY = import.meta.env.VITE_DROPBOX_APP_KEY || '';

interface DropboxToken {
  access_token: string;
  expires_at?: number;
}

// Storage keys
const DROPBOX_TOKEN_KEY = 'blockout-dropbox-token';
const DROPBOX_PKCE_VERIFIER_KEY = 'blockout-dropbox-pkce-verifier';
const DROPBOX_FILE_PATH = '/blockout-data.json';

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

// Clear token
export function clearDropboxConfig(): void {
  localStorage.removeItem(DROPBOX_TOKEN_KEY);
}

// Generate PKCE code verifier and challenge
function generatePKCE(): { verifier: string; challenge: string } {
  const verifier = Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map(b => b.toString(36).padStart(2, '0'))
    .join('')
    .substring(0, 128);
  
  // For 'plain' method, challenge = verifier
  // For 'S256', challenge = base64url(sha256(verifier))
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
    code_challenge_method: 'plain', // Using plain for simplicity, use S256 in production
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

  async uploadFile(path: string, content: string): Promise<void> {
    const blob = new Blob([content], { type: 'application/json' });
    
    const args = JSON.stringify({
      path,
      mode: 'overwrite',
      autorename: false,
    });

    await this.contentRequest('/files/upload', {
      method: 'POST',
      headers: {
        'Dropbox-API-Arg': args,
        'Content-Type': 'application/octet-stream',
      },
      body: blob,
    });
  }

  async downloadFile(path: string): Promise<string | null> {
    try {
      const args = JSON.stringify({ path });
      
      const response = await this.contentRequest('/files/download', {
        method: 'POST',
        headers: {
          'Dropbox-API-Arg': args,
        },
      });

      return await response.text();
    } catch (error) {
      if (error instanceof Error && error.message.includes('not_found')) {
        return null;
      }
      throw error;
    }
  }
}

// Sync functions
export async function syncToDropbox(data: object): Promise<void> {
  const token = getDropboxToken();
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }

  const dropbox = new DropboxAPI(token);
  const jsonData = JSON.stringify(data, null, 2);
  
  await dropbox.uploadFile(DROPBOX_FILE_PATH, jsonData);
}

export async function syncFromDropbox(): Promise<object | null> {
  const token = getDropboxToken();
  if (!token) {
    throw new Error('Not authenticated with Dropbox');
  }

  const dropbox = new DropboxAPI(token);
  const data = await dropbox.downloadFile(DROPBOX_FILE_PATH);
  
  if (!data) {
    return null;
  }

  return JSON.parse(data);
}

// Get Dropbox config (for UI display)
export function getDropboxConfig(): { isConfigured: boolean } {
  return {
    isConfigured: isDropboxConfigured(),
  };
}
