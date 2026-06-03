// Cross-app WRITE proxy: lets the BlockOut client (after the user approves a
// cross-site confirmation) create a page in the user's Binder wiki. Binder owns
// its own writes — this just verifies the BlockOut user and forwards the request
// to Binder's POST /api/pages with the same Supabase token (shared project), so
// Binder's own validation / path / revision logic runs there.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
// Binder's API base (its app is served under /binder). Overridable per env.
const BINDER_API_BASE = process.env.BINDER_API_BASE || 'https://syncratic.app/binder';

let supabase = null;
function getSupabase() {
  if (!supabase) {
    const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
    if (SUPABASE_URL && key) supabase = createClient(SUPABASE_URL, key);
  }
  return supabase;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) return res.status(401).json({ error: 'Sign in first.' });
  const token = authHeader.slice(7);

  // Verify the BlockOut user owns this token before doing anything cross-app.
  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Server not configured.' });
  const { data: { user }, error: authErr } = await sb.auth.getUser(token);
  if (authErr || !user) return res.status(401).json({ error: 'Invalid or expired session.' });

  // Same single cross-app gate as the agent route (future Syncratic Pro check).
  if (process.env.TETHER_CROSS_APP === 'off') {
    return res.status(403).json({ error: 'Cross-app integration is not enabled.' });
  }

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
  if (!body) return res.status(400).json({ error: 'Invalid JSON.' });

  const { title, slug, content_md, parent_id, icon } = body;
  if (!title || !slug) return res.status(400).json({ error: 'title and slug are required.' });

  // Forward to Binder's own page-create endpoint with the SAME token (shared
  // Supabase). Binder validates slug/path, computes the path, writes a revision.
  let binderRes;
  try {
    binderRes = await fetch(`${BINDER_API_BASE}/api/pages`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ title, slug, content_md: content_md || '', parent_id: parent_id || undefined, icon: icon || undefined }),
    });
  } catch (e) {
    return res.status(502).json({ error: `Could not reach Binder: ${e instanceof Error ? e.message : 'network error'}` });
  }

  const payload = await binderRes.json().catch(() => ({}));
  if (!binderRes.ok) {
    return res.status(binderRes.status).json({ error: payload.error || `Binder returned ${binderRes.status}` });
  }
  // Return what Binder created (id, title, path) + a viewable URL.
  return res.json({
    ok: true,
    page: payload,
    url: payload && payload.path ? `${BINDER_API_BASE}/wiki/${payload.path}` : undefined,
  });
};
