// Syncra search proxy — a self-contained "compatibility module" any Syncratic app can
// expose so Syncra (the global agent) can search the web + images without holding a search
// api_key. Mirrors api/_syncra/tunnel.js: verifies the caller's Supabase JWT, then calls the
// search provider with the key injected server-side (env var) and returns normalised results.
//
// The agent loop runs in Syncra (the client); this is a stateless, authenticated proxy for
// ONE search. The search api_key lives ONLY here (Vercel env), never on the device.
//
// Provider = Brave Search (one key covers both web + image search, generous free tier). Set
// BRAVE_SEARCH_API_KEY in the app's environment. Without it the endpoint returns a clear
// NOT_CONFIGURED error (the client surfaces it).
//
// Drop-in: copy into another app's api/_syncra/ + add a one-line endpoint
// (`module.exports = require('./_syncra/search').handleSearch`). Depends only on
// @supabase/supabase-js (already used) + global fetch (Node 18+ on Vercel).

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const BRAVE_KEY = process.env.BRAVE_SEARCH_API_KEY || '';

const MAX_COUNT = 10;

let supabase = null;
function getSupabase() {
  if (!supabase) {
    const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
    if (SUPABASE_URL && key) supabase = createClient(SUPABASE_URL, key);
  }
  return supabase;
}

async function getUserFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const sb = getSupabase();
  if (!sb) return null;
  const { data: { user }, error } = await sb.auth.getUser(authHeader.slice(7));
  if (error || !user) return null;
  return user;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ── Brave Search ──────────────────────────────────────────────────────────────
async function braveWeb(query, count) {
  const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=${count}`;
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY },
  });
  if (!r.ok) throw new Error(`Brave web search failed (${r.status})`);
  const data = await r.json();
  const results = (data.web && data.web.results) || [];
  return results.slice(0, count).map((x) => ({
    title: x.title || '',
    url: x.url || '',
    description: (x.description || '').replace(/<\/?[^>]+>/g, ''), // strip Brave's <strong> tags
  }));
}

async function braveImages(query, count) {
  const url = `https://api.search.brave.com/res/v1/images/search?q=${encodeURIComponent(query)}&count=${count}`;
  const r = await fetch(url, {
    headers: { Accept: 'application/json', 'X-Subscription-Token': BRAVE_KEY },
  });
  if (!r.ok) throw new Error(`Brave image search failed (${r.status})`);
  const data = await r.json();
  const results = data.results || [];
  return results.slice(0, count).map((x) => ({
    title: x.title || '',
    image_url: (x.properties && x.properties.url) || (x.thumbnail && x.thumbnail.src) || '',
    thumbnail: (x.thumbnail && x.thumbnail.src) || '',
    source_url: x.url || '',
  })).filter((x) => x.image_url);
}

async function handleSearch(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Sign in to use Syncra.' });

  if (!BRAVE_KEY) {
    return res.status(503).json({ error: 'NOT_CONFIGURED', message: 'Search is not configured on this server (no BRAVE_SEARCH_API_KEY).' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
  const query = body && typeof body.query === 'string' ? body.query.trim() : '';
  if (!query) return res.status(400).json({ error: 'A query is required.' });

  const type = body.type === 'images' ? 'images' : 'web';
  const count = Math.min(Math.max(Number(body.count) || 5, 1), MAX_COUNT);

  try {
    const results = type === 'images' ? await braveImages(query, count) : await braveWeb(query, count);
    return res.json({ type, query, results });
  } catch (e) {
    return res.status(502).json({ error: 'SEARCH_FAILED', message: e instanceof Error ? e.message : 'Search failed.' });
  }
}

module.exports = { handleSearch, getSupabase, getUserFromToken };
