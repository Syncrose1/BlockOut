// Tether agent endpoint (phase 1: read-only, SSE).
// Verifies the Supabase JWT, resolves the user's BYOK model endpoint from the
// SHARED model_endpoints table (service-role, owner-scoped), runs the read-only
// agent loop, and streams Server-Sent Events.
//
// The API key lives ONLY here — never returned to the client, never logged.

const { createClient } = require('@supabase/supabase-js');
const { runAgentLoopStreaming } = require('./_tether/agent');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

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

// Resolve the user's model endpoint. ALWAYS owner-scoped (service role bypasses
// RLS). Returns the row incl. api_key, or null.
async function resolveEndpoint(sb, userId, endpointId) {
  const base = sb.from('model_endpoints').select('*').eq('owner_id', userId);
  if (endpointId) {
    const { data } = await base.eq('id', endpointId).single();
    return data || null;
  }
  const { data: def } = await base.eq('is_default', true).single();
  if (def) return def;
  const { data: first } = await sb
    .from('model_endpoints').select('*').eq('owner_id', userId)
    .order('created_at').limit(1).single();
  return first || null;
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

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Sign in to use Tether.' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
  if (!body) return res.status(400).json({ error: 'Invalid JSON body' });

  const { messages, snapshot, resume } = body;
  const endpointId = body.endpoint_id || null;
  // On a continuation hop the conversation lives inside `resume.messages`, so a
  // top-level user message isn't required.
  if (!resume && (!Array.isArray(messages) || !messages.some((m) => m && m.role === 'user'))) {
    return res.status(400).json({ error: 'A user message is required.' });
  }
  if (!snapshot || typeof snapshot !== 'object') {
    return res.status(400).json({ error: 'A data snapshot is required.' });
  }

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Server not configured for Tether.' });

  const endpoint = await resolveEndpoint(sb, user.id, endpointId);
  if (!endpoint) {
    return res.status(503).json({ error: 'NO_ENDPOINT', message: 'No model endpoint configured. Set up Tether first.' });
  }

  // ── SSE ──
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  if (typeof res.flushHeaders === 'function') res.flushHeaders();

  const send = (event) => {
    try { res.write(`event: ${event.type}\ndata: ${JSON.stringify(event.data)}\n\n`); } catch { /* client gone */ }
  };

  try {
    await runAgentLoopStreaming(snapshot, endpoint, messages, send, resume);
  } catch (e) {
    send({ type: 'error', data: { error: e instanceof Error ? e.message : 'Tether failed.' } });
  } finally {
    res.end();
  }
};

// Allow time for a few sequential model round-trips in one invocation.
module.exports.config = { maxDuration: 60 };
