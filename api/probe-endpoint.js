// Best-effort capability probe for a BYOK model endpoint. Given an endpoint id
// (owner-scoped), it pings the user's provider with CHEAP minimal calls to detect
// what the model can do, then stores the flags on model_endpoints.capabilities so
// callers (Syncra/Tether) can route tasks appropriately. api_key never leaves the
// server; only the resolved flags are returned.
//
// Probes (each independent, failures just mean "capability absent"):
//   chat / streaming — a 1-token chat completion (streamed; falls back to non-stream)
//   tools            — the same call with a trivial function tool attached
//   vision           — the same call with a 1×1 image part
//   image            — inferred from the model id (no generation call → no cost)
//   embeddings       — inferred from the model id
//
// maxDuration is bumped in vercel.json (probes make a few network calls).

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
const SAFE_COLUMNS = 'id, name, base_url, model_id, is_default, created_at, capabilities, probed_at, probe_note';

// 1×1 transparent PNG (data URI) — the smallest possible image for a vision probe.
const TINY_PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

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

// Run a probe with a hard timeout so one slow provider can't hang the whole request.
function withTimeout(promise, ms) {
  return Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(new Error('probe timeout')), ms)),
  ]);
}

async function probeChat(client, model) {
  // Try streaming first (confirms chat + streaming in one call); fall back to non-stream.
  try {
    const stream = await withTimeout(
      client.chat.completions.create({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1, stream: true }),
      12000,
    );
    for await (const _ of stream) break; // one chunk is enough
    return { chat: true, streaming: true };
  } catch (_) {
    try {
      await withTimeout(
        client.chat.completions.create({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
        12000,
      );
      return { chat: true, streaming: false };
    } catch (_) {
      return { chat: false, streaming: false };
    }
  }
}

async function probeTools(client, model) {
  try {
    await withTimeout(client.chat.completions.create({
      model, max_tokens: 1, messages: [{ role: 'user', content: 'ping' }],
      tools: [{ type: 'function', function: { name: 'noop', description: 'probe', parameters: { type: 'object', properties: {} } } }],
    }), 12000);
    return true;
  } catch (_) { return false; }
}

async function probeVision(client, model) {
  try {
    await withTimeout(client.chat.completions.create({
      model, max_tokens: 1,
      messages: [{ role: 'user', content: [
        { type: 'text', text: 'hi' },
        { type: 'image_url', image_url: { url: TINY_PNG } },
      ] }],
    }), 12000);
    return true;
  } catch (_) { return false; }
}

// Image-gen + embeddings are inferred from the model id (a generation call would
// cost money / produce an artefact, so we don't make one during a probe).
function inferFromName(modelId) {
  const id = (modelId || '').toLowerCase();
  const out = [];
  if (/(dall-?e|gpt-image|stable.?diffusion|sdxl|\bsd\d?\b|flux|imagen|midjourney|playground|kandinsky|ideogram)/.test(id)) out.push('image');
  if (/embed/.test(id)) out.push('embeddings');
  return out;
}

module.exports = async (req, res) => {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Server not configured.' });

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Sign in first.' });

  const id = (req.query && req.query.id) || null;
  if (!id) return res.status(400).json({ error: 'Endpoint id required.' });

  const { data: ep, error } = await sb
    .from('model_endpoints').select('*')
    .eq('id', id).eq('owner_id', user.id).single();
  if (error || !ep) return res.status(404).json({ error: 'Endpoint not found.' });

  const client = new OpenAI({ apiKey: ep.api_key, baseURL: ep.base_url });
  const caps = new Set();
  const notes = [];

  const inferred = inferFromName(ep.model_id);
  inferred.forEach((c) => caps.add(c));

  // If the model id looks like an image/embedding model, skip the chat-style probes
  // (they'd just error and waste calls); otherwise run them.
  const looksGenerative = inferred.includes('image') || inferred.includes('embeddings');
  if (!looksGenerative) {
    const chat = await probeChat(client, ep.model_id);
    if (chat.chat) caps.add('chat');
    if (chat.streaming) caps.add('streaming');
    if (chat.chat) {
      // Only bother probing tools/vision if the model talks at all.
      const [tools, vision] = await Promise.all([
        probeTools(client, ep.model_id),
        probeVision(client, ep.model_id),
      ]);
      if (tools) caps.add('tools');
      if (vision) caps.add('vision');
    } else {
      notes.push('chat probe failed (check base_url / api_key / model id)');
    }
  } else {
    notes.push(`inferred from model id: ${inferred.join(', ')}`);
  }

  const capabilities = Array.from(caps);
  const probe_note = notes.join('; ') || `detected: ${capabilities.join(', ') || 'none'}`;

  const { data, error: upErr } = await sb
    .from('model_endpoints')
    .update({ capabilities, probed_at: new Date().toISOString(), probe_note })
    .eq('id', id).eq('owner_id', user.id)
    .select(SAFE_COLUMNS).single();
  if (upErr) return res.status(500).json({ error: 'Failed to save probe result.' });

  return res.json(data);
};
