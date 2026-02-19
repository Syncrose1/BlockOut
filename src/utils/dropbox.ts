// Dropbox sync integration for BlockOut
// Uses Dropbox API v2 to sync data.json file

const DROPBOX_TOKEN_KEY = 'blockout-dropbox-token';
const DROPBOX_FILE_PATH = '/blockout-data.json';

interface DropboxConfig {
  accessToken: string;
}

export function getDropboxConfig(): DropboxConfig {
  return {
    accessToken: localStorage.getItem(DROPBOX_TOKEN_KEY) ?? '',
  };
}

export function setDropboxConfig(accessToken: string): void {
  localStorage.setItem(DROPBOX_TOKEN_KEY, accessToken.trim());
}

export function isDropboxConfigured(): boolean {
  return !!getDropboxConfig().accessToken;
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
      // File not found is OK - return null
      if (error instanceof Error && error.message.includes('not_found')) {
        return null;
      }
      throw error;
    }
  }

  async getFileMetadata(path: string): Promise<{ server_modified: string; size: number } | null> {
    try {
      const response = await this.request('/files/get_metadata', {
        method: 'POST',
        body: JSON.stringify({ path }),
      });

      return await response.json();
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
  const config = getDropboxConfig();
  if (!config.accessToken) {
    throw new Error('Dropbox not configured');
  }

  const dropbox = new DropboxAPI(config.accessToken);
  const jsonData = JSON.stringify(data, null, 2);
  
  await dropbox.uploadFile(DROPBOX_FILE_PATH, jsonData);
}

export async function syncFromDropbox(): Promise<object | null> {
  const config = getDropboxConfig();
  if (!config.accessToken) {
    throw new Error('Dropbox not configured');
  }

  const dropbox = new DropboxAPI(config.accessToken);
  const data = await dropbox.downloadFile(DROPBOX_FILE_PATH);
  
  if (!data) {
    return null;
  }

  return JSON.parse(data);
}

// OAuth flow helpers
export function getDropboxAuthUrl(clientId: string, redirectUri: string): string {
  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'token',
    redirect_uri: redirectUri,
    scope: 'files.content.write files.content.read',
  });

  return `https://www.dropbox.com/oauth2/authorize?${params.toString()}`;
}

// Extract access token from URL hash (after OAuth redirect)
export function extractDropboxTokenFromUrl(): string | null {
  const hash = window.location.hash;
  if (!hash) return null;

  const params = new URLSearchParams(hash.substring(1));
  return params.get('access_token');
}

// Clear Dropbox configuration
export function clearDropboxConfig(): void {
  localStorage.removeItem(DROPBOX_TOKEN_KEY);
}
