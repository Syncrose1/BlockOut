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
    const payload = { ...req.body, lastModified: req.body.lastModified ?? Date.now() };
    fs.writeFileSync(DATA_FILE, JSON.stringify(payload, null, 2));
    res.json({ ok: true, lastModified: payload.lastModified });
  } catch (err) {
    console.error('Error writing data:', err);
    res.status(500).json({ error: 'Failed to write data' });
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
  console.log();
});
