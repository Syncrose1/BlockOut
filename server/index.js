const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_DIR = process.env.DATA_DIR || path.join(__dirname, '..');
const DATA_FILE = path.join(DATA_DIR, 'data.json');

// Optional auth token — set BLOCKOUT_TOKEN env variable to require a Bearer token
const SECRET = process.env.BLOCKOUT_TOKEN || '';

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from the Vite build
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

function checkAuth(req, res) {
  if (!SECRET) return true; // token not configured — open access
  const auth = req.headers['authorization'] || '';
  if (auth === `Bearer ${SECRET}`) return true;
  res.status(401).json({ error: 'Unauthorized' });
  return false;
}

// API: Get data
app.get('/api/data', (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      res.json(data);
    } else {
      res.json({ tasks: {}, categories: {}, timeBlocks: {}, activeBlockId: null, lastModified: 0 });
    }
  } catch (err) {
    console.error('Error reading data:', err);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// API: Save data
app.put('/api/data', (req, res) => {
  if (!checkAuth(req, res)) return;
  try {
    // Read the current version from disk so we can increment it
    let currentVersion = 0;
    if (fs.existsSync(DATA_FILE)) {
      try {
        const existing = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
        currentVersion = existing.version ?? 0;
      } catch (_) { /* ignore parse errors */ }
    }
    const payload = {
      ...req.body,
      lastModified: req.body.lastModified ?? Date.now(),
      version: currentVersion + 1,
    };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
    res.json({ ok: true, lastModified: payload.lastModified, version: payload.version });
  } catch (err) {
    console.error('Error writing data:', err);
    res.status(500).json({ error: 'Failed to write data' });
  }
});

// ─── R2 Cloud Sync API ──────────────────────────────────────────────────────
// Mirrors api/r2-sync.js for the self-hosted Express server

let _s3Client = null;
let _supabase = null;

function getS3Client() {
  if (_s3Client) return _s3Client;
  const { R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY } = process.env;
  if (!R2_ACCOUNT_ID || !R2_ACCESS_KEY_ID || !R2_SECRET_ACCESS_KEY) return null;
  try {
    const { S3Client } = require('@aws-sdk/client-s3');
    _s3Client = new S3Client({
      region: 'auto',
      endpoint: `https://${R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: R2_ACCESS_KEY_ID,
        secretAccessKey: R2_SECRET_ACCESS_KEY,
      },
    });
    return _s3Client;
  } catch (e) {
    console.warn('[BlockOut] @aws-sdk/client-s3 not available, R2 sync disabled');
    return null;
  }
}

function getSupabaseAdmin() {
  if (_supabase) return _supabase;
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY || '';
  if (!url || !key) return null;
  try {
    const { createClient } = require('@supabase/supabase-js');
    _supabase = createClient(url, key);
    return _supabase;
  } catch (e) {
    console.warn('[BlockOut] @supabase/supabase-js not available');
    return null;
  }
}

async function getUserFromToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return null;
  const token = authHeader.slice(7);
  const sb = getSupabaseAdmin();
  if (!sb) return null;
  const { data: { user }, error } = await sb.auth.getUser(token);
  if (error || !user) return null;
  return user;
}

const R2_BUCKET = process.env.R2_BUCKET_NAME || 'blockout';

app.get('/api/r2-sync', async (req, res) => {
  const client = getS3Client();
  if (!client) return res.status(503).json({ error: 'R2 storage not configured' });

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });

  const key = `users/${user.id}/blockout-data.json`;
  try {
    const { GetObjectCommand } = require('@aws-sdk/client-s3');
    const response = await client.send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: key }));
    const body = await response.Body.transformToString();
    res.json(JSON.parse(body));
  } catch (err) {
    if (err.name === 'NoSuchKey' || err.$metadata?.httpStatusCode === 404) {
      return res.status(404).json({ error: 'No data found' });
    }
    console.error('[R2 Sync] GET error:', err);
    res.status(500).json({ error: 'Failed to read from R2' });
  }
});

app.put('/api/r2-sync', async (req, res) => {
  const client = getS3Client();
  if (!client) return res.status(503).json({ error: 'R2 storage not configured' });

  const user = await getUserFromToken(req.headers.authorization);
  if (!user) return res.status(401).json({ error: 'Invalid or expired token' });

  const key = `users/${user.id}/blockout-data.json`;
  try {
    const { PutObjectCommand } = require('@aws-sdk/client-s3');
    await client.send(new PutObjectCommand({
      Bucket: R2_BUCKET,
      Key: key,
      Body: JSON.stringify(req.body),
      ContentType: 'application/json',
    }));
    res.json({ ok: true, lastModified: Date.now() });
  } catch (err) {
    console.error('[R2 Sync] PUT error:', err);
    res.status(500).json({ error: 'Failed to save to R2' });
  }
});

// SPA fallback — serve index.html for all non-API routes
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) return next();
  const indexPath = path.join(distPath, 'index.html');
  if (fs.existsSync(indexPath)) {
    res.sendFile(indexPath);
  } else {
    res.status(404).send('Build not found. Run `npm run build` first.');
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  BlockOut server running on http://0.0.0.0:${PORT}`);
  if (SECRET) {
    console.log('  Token auth: enabled (BLOCKOUT_TOKEN is set)');
  } else {
    console.log('  Token auth: disabled (set BLOCKOUT_TOKEN env var to enable)');
  }
  if (getS3Client()) {
    console.log('  R2 cloud storage: enabled');
  } else {
    console.log('  R2 cloud storage: disabled (set R2_* env vars to enable)');
  }
  console.log();
});
