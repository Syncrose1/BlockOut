// Vercel serverless adapter for BlockOut with KV support
// Supports both memory storage (default) and Vercel KV

// Try to use Vercel KV if available
let kv = null;
try {
  const { kv: vercelKv } = require('@vercel/kv');
  kv = vercelKv;
  console.log('[BlockOut] Using Vercel KV for persistence');
} catch {
  console.log('[BlockOut] Vercel KV not configured, using memory storage');
}

// Fallback memory storage (resets on cold start)
let memoryStore = {
  tasks: {},
  categories: {},
  timeBlocks: {},
  activeBlockId: null,
  lastModified: 0,
  version: 0,
};

const DATA_KEY = 'blockout:data';

const setCors = (res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
};

const checkAuth = (req) => {
  const secret = process.env.BLOCKOUT_TOKEN;
  if (!secret) return true;
  
  const auth = req.headers.authorization || '';
  return auth === `Bearer ${secret}`;
};

async function getData() {
  if (kv) {
    try {
      const data = await kv.get(DATA_KEY);
      return data || memoryStore;
    } catch (err) {
      console.error('[BlockOut] KV get error:', err);
      return memoryStore;
    }
  }
  return memoryStore;
}

async function saveData(data) {
  const payload = {
    ...data,
    lastModified: Date.now(),
    version: (data.version || 0) + 1,
  };
  
  if (kv) {
    try {
      await kv.set(DATA_KEY, payload);
      console.log('[BlockOut] Saved to KV, version:', payload.version);
    } catch (err) {
      console.error('[BlockOut] KV save error:', err);
      // Fallback to memory
      memoryStore = payload;
    }
  } else {
    memoryStore = payload;
  }
  
  return payload;
}

module.exports = async (req, res) => {
  setCors(res);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (!checkAuth(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  const { method } = req;
  
  if (method === 'GET') {
    try {
      const data = await getData();
      return res.json(data);
    } catch (err) {
      console.error('[BlockOut] Get error:', err);
      return res.status(500).json({ error: 'Failed to read data' });
    }
  }
  
  if (method === 'PUT') {
    try {
      const body = req.body;
      const saved = await saveData(body);
      
      return res.json({
        ok: true,
        lastModified: saved.lastModified,
        version: saved.version,
      });
    } catch (err) {
      console.error('[BlockOut] Save error:', err);
      return res.status(500).json({ error: 'Failed to save data' });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};
