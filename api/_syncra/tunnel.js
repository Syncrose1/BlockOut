// Syncra secure tunnel — a self-contained "compatibility module" any Syncratic app
// can expose so Syncra (the global agent) can run its agent loop OUTSIDE the app.
//
// What it does: verifies the caller's Supabase JWT, resolves THAT user's BYOK model
// endpoint from the SHARED model_endpoints table (service-role, owner-scoped), and
// forwards a single OpenAI-style chat-completion to the user's provider with the
// api_key injected here — streaming the result back as SSE. It runs NO agent loop and
// exposes NO tools of its own: the loop + tool execution live in the client (Syncra),
// which is the only place that can act on the device. The api_key lives ONLY here.
//
// Drop-in: copy this file into another app's `api/_syncra/` and add a one-line
// endpoint (`module.exports = require('./_syncra/tunnel').handleTunnel`). It depends
// only on `@supabase/supabase-js` + `openai`, both already used by Tether.

const { createClient } = require('@supabase/supabase-js');
const OpenAI = require('openai');

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

const MAX_TOKENS_CAP = 4096;

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

// Resolve the user's model endpoint (incl. api_key). ALWAYS owner-scoped — the
// service role bypasses RLS, so every query pins owner_id. Mirrors Tether.
async function resolveEndpoint(sb, userId, endpointId) {
  const base = () => sb.from('model_endpoints').select('*').eq('owner_id', userId);
  if (endpointId) {
    const { data } = await base().eq('id', endpointId).single();
    return data || null;
  }
  const { data: def } = await base().eq('is_default', true).single();
  if (def) return def;
  const { data: first } = await base().order('created_at').limit(1).single();
  return first || null;
}

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Forward ONE chat-completion and stream it back. The server controls model /
// base_url / api_key from the resolved endpoint; the client controls only the
// conversation + tool surface (it owns the loop). Tool-call fragments arrive
// piecemeal and are stitched by index, then emitted once as the final message.
async function streamOneCompletion(endpoint, body, send) {
  const client = new OpenAI({ apiKey: endpoint.api_key, baseURL: endpoint.base_url });

  const params = {
    model: endpoint.model_id,
    messages: body.messages,
    stream: true,
    max_tokens: Math.min(Number(body.max_tokens) || 2048, MAX_TOKENS_CAP),
  };
  if (Array.isArray(body.tools) && body.tools.length) params.tools = body.tools;
  if (body.tool_choice != null) params.tool_choice = body.tool_choice;
  if (body.temperature != null) params.temperature = Number(body.temperature);
  if (body.response_format != null) params.response_format = body.response_format;

  const stream = await client.chat.completions.create(params);
  let content = '';
  const toolCallsByIndex = new Map();
  let finishReason = null;

  for await (const chunk of stream) {
    const choice = chunk.choices && chunk.choices[0];
    if (!choice) continue;
    const delta = choice.delta || {};
    if (delta.content) { content += delta.content; send({ type: 'delta', data: { text: delta.content } }); }
    if (Array.isArray(delta.tool_calls)) {
      for (const tc of delta.tool_calls) {
        const idx = tc.index ?? 0;
        const acc = toolCallsByIndex.get(idx) || { id: undefined, type: 'function', function: { name: '', arguments: '' } };
        if (tc.id) acc.id = tc.id;
        if (tc.type) acc.type = tc.type;
        if (tc.function?.name) acc.function.name += tc.function.name;
        if (tc.function?.arguments) acc.function.arguments += tc.function.arguments;
        toolCallsByIndex.set(idx, acc);
      }
    }
    if (choice.finish_reason) finishReason = choice.finish_reason;
  }

  const tool_calls = [...toolCallsByIndex.entries()].sort((a, b) => a[0] - b[0]).map(([, v]) => v);
  const assistant = { role: 'assistant', content: content || null };
  if (tool_calls.length) assistant.tool_calls = tool_calls;
  // The client appends this message, executes any tool_calls locally, and calls the
  // tunnel again with the updated history — the tunnel itself stays stateless.
  send({ type: 'final', data: { message: assistant, finish_reason: finishReason } });
}

async function handleTunnel(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Sign in to use Syncra.' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
  if (!body || !Array.isArray(body.messages) || body.messages.length === 0) {
    return res.status(400).json({ error: 'A messages array is required.' });
  }

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Server not configured for Syncra.' });

  const endpoint = await resolveEndpoint(sb, user.id, body.endpoint_id || null);
  if (!endpoint) {
    return res.status(503).json({ error: 'NO_ENDPOINT', message: 'No model endpoint configured. Add one in Tether settings.' });
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
    await streamOneCompletion(endpoint, body, send);
  } catch (e) {
    send({ type: 'error', data: { error: e instanceof Error ? e.message : 'Tunnel failed.' } });
  } finally {
    res.end();
  }
}

// Image generation — same auth + owner-scoped endpoint resolution as the chat tunnel, but calls
// images.generate (OpenAI-compatible) with the api_key injected here, and returns ONE JSON result
// (a b64 data URI or a URL). No streaming — generation is a single shot. The client (Syncra) routes
// an image request to its image-capable endpoint and renders what comes back.
async function handleImage(req, res) {
  setCors(res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Sign in to use Syncra.' });

  let body;
  try { body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body; } catch { body = null; }
  const prompt = body && typeof body.prompt === 'string' ? body.prompt.trim() : '';
  if (!prompt) return res.status(400).json({ error: 'A prompt is required.' });

  const sb = getSupabase();
  if (!sb) return res.status(503).json({ error: 'Server not configured for Syncra.' });
  const endpoint = await resolveEndpoint(sb, user.id, body.endpoint_id || null);
  if (!endpoint) return res.status(503).json({ error: 'NO_ENDPOINT', message: 'No model endpoint configured.' });

  try {
    const client = new OpenAI({ apiKey: endpoint.api_key, baseURL: endpoint.base_url });
    const params = { model: endpoint.model_id, prompt, n: 1 };
    if (body.size) params.size = String(body.size);
    // Prefer b64 so the client gets the pixels directly (no second fetch); providers that only
    // return URLs are handled below.
    params.response_format = 'b64_json';
    let result;
    try {
      result = await client.images.generate(params);
    } catch (e) {
      // Some providers reject response_format — retry without it (they'll return a URL).
      delete params.response_format;
      result = await client.images.generate(params);
    }
    const d = (result && result.data && result.data[0]) || {};
    if (d.b64_json) return res.status(200).json({ image: `data:image/png;base64,${d.b64_json}` });
    if (d.url) return res.status(200).json({ image: d.url });
    return res.status(502).json({ error: 'The image model returned no image.' });
  } catch (e) {
    return res.status(502).json({ error: e instanceof Error ? e.message : 'Image generation failed.' });
  }
}

module.exports = { handleTunnel, handleImage, getSupabase, getUserFromToken, resolveEndpoint };
