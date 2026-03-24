// Vercel serverless function for R2 cloud sync
// Verifies Supabase JWT, reads/writes user data to Cloudflare R2

const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
const { createClient } = require('@supabase/supabase-js');

// ─── Config ─────────────────────────────────────────────────────────────────

const R2_ACCOUNT_ID = process.env.R2_ACCOUNT_ID || '';
const R2_ACCESS_KEY_ID = process.env.R2_ACCESS_KEY_ID || '';
const R2_SECRET_ACCESS_KEY = process.env.R2_SECRET_ACCESS_KEY || '';
const R2_BUCKET_NAME = process.env.R2_BUCKET_NAME || 'blockout';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
// Fallback: use anon key for JWT verification (less secure but works)
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';

// ─── Clients ────────────────────────────────────────────────────────────────

let s3Client = null;
function getS3Client() {
  if (!s3Client && R2_ACCOUNT_ID && R2_ACCESS_KEY_ID && R2_SECRET_ACCESS_KEY) {
    s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
  }
  return s3Client;
}

let supabase = null;
function getSupabase() {
  if (!supabase) {
    const key = SUPABASE_SERVICE_KEY || SUPABASE_ANON_KEY;
    if (SUPABASE_URL && key) {
      supabase = createClient(SUPABASE_URL, key);
    }
  }
  return supabase;
}

// ─── Auth ───────────────────────────────────────────────────────────────────

async function getUserFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);

  const sb = getSupabase();
  if (!sb) return null;

  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

// ─── CORS ───────────────────────────────────────────────────────────────────

function setCors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, PUT, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// ─── Handler ────────────────────────────────────────────────────────────────

module.exports = async (req, res) => {
  setCors(res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  // Check R2 is configured
  const client = getS3Client();
  if (!client) {
    return res.status(503).json({ error: 'R2 storage not configured on server' });
  }

  // Authenticate
  const user = await getUserFromToken(req.headers.authorization);
  if (!user) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  const key = `users/${user.id}/blockout-data.json`;

  // GET — load user data
  if (req.method === 'GET') {
    try {
      const command = new GetObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
      });
      const response = await client.send(command);
      const body = await response.Body.transformToString();
      const data = JSON.parse(body);
      return res.json(data);
    } catch (err) {
      if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
        return res.status(404).json({ error: 'No data found' });
      }
      console.error('[R2 Sync] GET error:', err);
      return res.status(500).json({ error: 'Failed to read data from R2' });
    }
  }

  // PUT — save user data
  if (req.method === 'PUT') {
    try {
      const body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      const command = new PutObjectCommand({
        Bucket: R2_BUCKET_NAME,
        Key: key,
        Body: body,
        ContentType: 'application/json',
      });
      await client.send(command);
      return res.json({ ok: true, lastModified: Date.now() });
    } catch (err) {
      console.error('[R2 Sync] PUT error:', err);
      return res.status(500).json({ error: 'Failed to save data to R2' });
    }
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
