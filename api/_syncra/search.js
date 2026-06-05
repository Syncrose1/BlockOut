// Syncra search + scrape proxy — a self-contained "compatibility module" any Syncratic app
// can expose so Syncra (the global agent) can search the web/images and read pages without
// holding any api_key. Mirrors api/_syncra/tunnel.js: verifies the caller's Supabase JWT,
// then calls the provider with the key injected server-side and returns normalised results.
//
// Stack (cheap, Google-quality):
//   web / images  -> Serper (google.serper.dev) — Google SERP, ~$1/1k, generous free credits.
//                    SERPER_API_KEY (env, required for search).
//   scrape        -> Jina Reader (r.jina.ai) — returns clean LLM-ready markdown of any URL.
//                    Keyless; JINA_API_KEY (env, optional) raises rate limits.
//
// One stateless authenticated call per request; the agent loop lives in Syncra (the client).
// Drop-in: copy into another app's api/_syncra/ + a one-line endpoint. Depends only on
// @supabase/supabase-js (already used) + global fetch (Node 18+ on Vercel).

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SERPER_KEY = process.env.SERPER_API_KEY || '';
const JINA_KEY = process.env.JINA_API_KEY || '';

const MAX_COUNT = 10;
const MAX_SCRAPE_CHARS = 12000; // cap returned page text so it doesn't blow the model's window

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

// ── Serper (Google) ─────────────────────────────────────────────────────────────
async function serper(path, payload) {
  const r = await fetch(`https://google.serper.dev/${path}`, {
    method: 'POST',
    headers: { 'X-API-KEY': SERPER_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!r.ok) throw new Error(`Serper ${path} failed (${r.status})`);
  return r.json();
}

async function searchWeb(query, count) {
  const data = await serper('search', { q: query, num: count });
  const results = [];
  // Surface a direct answer / knowledge graph first when Google provides one.
  if (data.answerBox) {
    const a = data.answerBox;
    results.push({
      title: a.title || 'Answer',
      url: a.link || a.url || '',
      description: a.answer || a.snippet || (Array.isArray(a.snippetHighlighted) ? a.snippetHighlighted.join(' ') : ''),
    });
  }
  if (data.knowledgeGraph && data.knowledgeGraph.description) {
    const k = data.knowledgeGraph;
    results.push({
      title: k.title || 'Overview',
      url: (k.descriptionLink) || (k.website) || '',
      description: k.description,
    });
  }
  for (const x of data.organic || []) {
    results.push({ title: x.title || '', url: x.link || '', description: x.snippet || '' });
  }
  return results.slice(0, count);
}

async function searchImages(query, count) {
  const data = await serper('images', { q: query, num: count });
  return (data.images || []).slice(0, count).map((x) => ({
    title: x.title || '',
    image_url: x.imageUrl || '',
    thumbnail: x.thumbnailUrl || x.imageUrl || '',
    source_url: x.link || x.source || '',
  })).filter((x) => x.image_url);
}

// ── Jina Reader (scrape → markdown) ───────────────────────────────────────────────
async function scrape(url) {
  const headers = { 'X-Return-Format': 'markdown' };
  if (JINA_KEY) headers.Authorization = `Bearer ${JINA_KEY}`;
  const r = await fetch(`https://r.jina.ai/${url}`, { headers });
  if (!r.ok) throw new Error(`Scrape failed (${r.status})`);
  const text = await r.text();
  return text.length > MAX_SCRAPE_CHARS ? `${text.slice(0, MAX_SCRAPE_CHARS)}\n\n…[truncated]` : text;
}

async function handleSearch(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Sign in to use Syncra.' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
  if (!body) return res.status(400).json({ error: 'Invalid JSON.' });

  const type = body.type === 'images' ? 'images' : body.type === 'scrape' ? 'scrape' : 'web';

  try {
    if (type === 'scrape') {
      const url = typeof body.url === 'string' ? body.url.trim() : '';
      if (!/^https?:\/\//.test(url)) return res.status(400).json({ error: 'A valid http(s) url is required.' });
      const content = await scrape(url);
      return res.json({ type, url, content });
    }

    if (!SERPER_KEY) {
      return res.status(503).json({ error: 'NOT_CONFIGURED', message: 'Search is not configured on this server (no SERPER_API_KEY).' });
    }
    const query = typeof body.query === 'string' ? body.query.trim() : '';
    if (!query) return res.status(400).json({ error: 'A query is required.' });
    const count = Math.min(Math.max(Number(body.count) || 5, 1), MAX_COUNT);
    const results = type === 'images' ? await searchImages(query, count) : await searchWeb(query, count);
    return res.json({ type, query, results });
  } catch (e) {
    return res.status(502).json({ error: 'SEARCH_FAILED', message: e instanceof Error ? e.message : 'Search failed.' });
  }
}

module.exports = { handleSearch, getSupabase, getUserFromToken };
