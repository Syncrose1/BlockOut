import { createClient, type SupabaseClient, type User, type Session } from '@supabase/supabase-js';

// ─── Supabase client ────────────────────────────────────────────────────────

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

let _client: SupabaseClient | null = null;

export function getSupabaseClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return null;
  if (!_client) {
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true,
      },
    });
  }
  return _client;
}

export function isSupabaseConfigured(): boolean {
  return !!(SUPABASE_URL && SUPABASE_ANON_KEY);
}

// ─── Auth helpers ───────────────────────────────────────────────────────────

export async function signUp(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { user: null, error: 'Supabase not configured' };

  const { data, error } = await client.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: window.location.origin },
  });
  if (error) return { user: null, error: error.message };
  return { user: data.user, error: null };
}

export async function signIn(email: string, password: string): Promise<{ user: User | null; error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { user: null, error: 'Supabase not configured' };

  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return { user: null, error: error.message };
  return { user: data.user, error: null };
}

export async function signOut(): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: 'Supabase not configured' };

  const { error } = await client.auth.signOut();
  return { error: error?.message || null };
}

export async function getSession(): Promise<{ session: Session | null; user: User | null }> {
  const client = getSupabaseClient();
  if (!client) return { session: null, user: null };

  const { data } = await client.auth.getSession();
  return { session: data.session, user: data.session?.user || null };
}

export async function getAccessToken(): Promise<string | null> {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data } = await client.auth.getSession();
  return data.session?.access_token || null;
}

export function onAuthStateChange(callback: (user: User | null) => void): (() => void) | null {
  const client = getSupabaseClient();
  if (!client) return null;

  const { data: { subscription } } = client.auth.onAuthStateChange((_event, session) => {
    callback(session?.user || null);
  });

  return () => subscription.unsubscribe();
}

export async function resetPassword(email: string): Promise<{ error: string | null }> {
  const client = getSupabaseClient();
  if (!client) return { error: 'Supabase not configured' };

  const { error } = await client.auth.resetPasswordForEmail(email);
  return { error: error?.message || null };
}
