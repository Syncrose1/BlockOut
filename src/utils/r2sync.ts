import { getAccessToken } from './supabase';
import type { AnyRecord } from './dropbox';

// ─── R2 Cloud Sync ──────────────────────────────────────────────────────────
// Saves/loads user data to Cloudflare R2 via the API route.
// Requires Supabase auth — the JWT is sent as Bearer token,
// and the API route verifies it + uses the user ID as the R2 key.

const DEBUG = import.meta.env.DEV;

function getApiBase(): string {
  // In dev, the Vite proxy handles /api → localhost:3001
  // In production (Vercel), /api routes to serverless functions
  return '';
}

export async function saveToR2(data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { success: false, error: 'Not signed in' };

  try {
    const res = await fetch(`${getApiBase()}/api/r2-sync`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({ ...data, lastModified: Date.now() }),
    });

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { success: false, error: body.error || `HTTP ${res.status}` };
    }

    if (DEBUG) console.log('[BlockOut] Saved to R2 successfully');
    return { success: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[BlockOut] R2 save failed:', msg);
    return { success: false, error: msg };
  }
}

export async function loadFromR2(): Promise<{ data: AnyRecord | null; error?: string }> {
  const token = await getAccessToken();
  if (!token) return { data: null, error: 'Not signed in' };

  try {
    const res = await fetch(`${getApiBase()}/api/r2-sync`, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });

    if (res.status === 404) {
      // No data stored yet — this is fine
      if (DEBUG) console.log('[BlockOut] No R2 data found (first sync)');
      return { data: null };
    }

    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      return { data: null, error: body.error || `HTTP ${res.status}` };
    }

    const data = await res.json();
    if (DEBUG) console.log('[BlockOut] Loaded from R2:', {
      tasks: Object.keys(data.tasks || {}).length,
      categories: Object.keys(data.categories || {}).length,
    });
    return { data: data as AnyRecord };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('[BlockOut] R2 load failed:', msg);
    return { data: null, error: msg };
  }
}

export function isR2SyncAvailable(): boolean {
  // R2 sync is available if Supabase is configured (we check at runtime if user is signed in)
  return !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);
}
