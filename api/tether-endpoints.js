// CRUD for the user's BYOK model endpoints (the SHARED model_endpoints table —
// the same rows Binder uses, so "set up once, use everywhere" holds).
// Service-role client → EVERY query is manually owner-scoped. api_key is write-
// only: it is never returned by GET.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const URL_REGEX = /^https?:\/\/.+/;
const MAX_ENDPOINTS = 20;
const SAFE_COLUMNS = 'id, name, base_url, model_id, is_default, created_at, capabilities, probed_at, probe_note'; // no api_key
const VALID_CAPS = ['chat', 'vision', 'tools', 'image', 'embeddings', 'streaming'];

// Normalise a user-supplied capabilities list → a clean, de-duped array of known flags.
function cleanCapabilities(raw) {
  if (!Array.isArray(raw)) return null;
  const set = new Set();
  for (const c of raw) {
    if (typeof c === 'string' && VALID_CAPS.includes(c)) set.add(c);
  }
  return Array.from(set);
}

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
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Server not configured.' });

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  // GET — list (never includes api_key)
  if (req.method === 'GET') {
    const { data, error } = await sb
      .from('model_endpoints').select(SAFE_COLUMNS)
      .eq('owner_id', user.id).order('created_at');
    if (error) return res.status(500).json({ error: 'Failed to load endpoints.' });
    return res.json(data || []);
  }

  // POST — create
  if (req.method === 'POST') {
    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
    if (!body) return res.status(400).json({ error: 'Invalid JSON.' });

    const { name, base_url, api_key, model_id } = body;
    const is_default = !!body.is_default;
    if (!name || typeof name !== 'string' || name.length > 100) return res.status(400).json({ error: 'Name required (max 100).' });
    if (!base_url || typeof base_url !== 'string' || !URL_REGEX.test(base_url)) return res.status(400).json({ error: 'Valid https base URL required.' });
    if (!api_key || typeof api_key !== 'string') return res.status(400).json({ error: 'API key required.' });
    if (!model_id || typeof model_id !== 'string' || model_id.length > 200) return res.status(400).json({ error: 'Model id required (max 200).' });

    const { count } = await sb.from('model_endpoints')
      .select('id', { count: 'exact', head: true }).eq('owner_id', user.id);
    if (count != null && count >= MAX_ENDPOINTS) return res.status(400).json({ error: `Max ${MAX_ENDPOINTS} endpoints.` });

    if (is_default) {
      await sb.from('model_endpoints').update({ is_default: false }).eq('owner_id', user.id);
    }

    const caps = cleanCapabilities(body.capabilities);
    const { data, error } = await sb.from('model_endpoints').insert({
      owner_id: user.id,
      name: name.trim(),
      base_url: base_url.trim().replace(/\/+$/, ''),
      api_key,
      model_id: model_id.trim(),
      is_default,
      ...(caps ? { capabilities: caps } : {}),
    }).select(SAFE_COLUMNS).single();
    if (error) return res.status(500).json({ error: 'Failed to create endpoint.' });
    return res.status(201).json(data);
  }

  // PATCH — edit an endpoint (owner-scoped). api_key updated only if provided;
  // setting is_default true clears the others first.
  if (req.method === 'PATCH') {
    const id = (req.query && req.query.id) || null;
    if (!id) return res.status(400).json({ error: 'Endpoint id required.' });

    let body;
    try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
    if (!body) return res.status(400).json({ error: 'Invalid JSON.' });

    const patch = {};
    if (body.name != null) {
      if (typeof body.name !== 'string' || !body.name.trim() || body.name.length > 100) return res.status(400).json({ error: 'Invalid name.' });
      patch.name = body.name.trim();
    }
    if (body.base_url != null) {
      if (typeof body.base_url !== 'string' || !URL_REGEX.test(body.base_url)) return res.status(400).json({ error: 'Invalid base URL.' });
      patch.base_url = body.base_url.trim().replace(/\/+$/, '');
    }
    if (body.model_id != null) {
      if (typeof body.model_id !== 'string' || !body.model_id.trim() || body.model_id.length > 200) return res.status(400).json({ error: 'Invalid model id.' });
      patch.model_id = body.model_id.trim();
    }
    if (typeof body.api_key === 'string' && body.api_key.trim()) patch.api_key = body.api_key;
    if (body.capabilities != null) {
      const caps = cleanCapabilities(body.capabilities);
      if (caps == null) return res.status(400).json({ error: 'capabilities must be an array.' });
      patch.capabilities = caps;
    }

    if (body.is_default === true) {
      await sb.from('model_endpoints').update({ is_default: false }).eq('owner_id', user.id);
      patch.is_default = true;
    } else if (body.is_default === false) {
      patch.is_default = false;
    }

    if (Object.keys(patch).length === 0) return res.status(400).json({ error: 'Nothing to update.' });

    const { data, error } = await sb
      .from('model_endpoints').update(patch)
      .eq('id', id).eq('owner_id', user.id)
      .select(SAFE_COLUMNS).single();
    if (error) return res.status(500).json({ error: 'Failed to update endpoint.' });
    if (!data) return res.status(404).json({ error: 'Endpoint not found.' });
    return res.json(data);
  }

  // DELETE — by id (owner-scoped)
  if (req.method === 'DELETE') {
    const id = (req.query && req.query.id) || null;
    if (!id) return res.status(400).json({ error: 'Endpoint id required.' });
    const { error } = await sb.from('model_endpoints').delete().eq('id', id).eq('owner_id', user.id);
    if (error) return res.status(500).json({ error: 'Failed to delete endpoint.' });
    return res.json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
