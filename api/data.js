// Vercel serverless adapter for BlockOut
// Uses in-memory storage by default (resets on cold start)
// For production, connect to Vercel KV or external database

let dataStore = {
  tasks: {},
  categories: {},
  timeBlocks: {},
  activeBlockId: null,
  lastModified: 0,
  version: 0,
};

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
    return res.json(dataStore);
  }
  
  if (method === 'PUT') {
    try {
      const body = req.body;
      dataStore = {
        ...body,
        lastModified: Date.now(),
        version: (dataStore.version || 0) + 1,
      };
      
      return res.json({
        ok: true,
        lastModified: dataStore.lastModified,
        version: dataStore.version,
      });
    } catch (err) {
      console.error('Error saving:', err);
      return res.status(500).json({ error: 'Failed to save data' });
    }
  }
  
  return res.status(405).json({ error: 'Method not allowed' });
};
