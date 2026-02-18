const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3001;
const DATA_FILE = path.join(__dirname, '..', 'data.json');

app.use(cors());
app.use(express.json({ limit: '10mb' }));

// Serve static files from the Vite build
const distPath = path.join(__dirname, '..', 'dist');
if (fs.existsSync(distPath)) {
  app.use(express.static(distPath));
}

// API: Get data
app.get('/api/data', (req, res) => {
  try {
    if (fs.existsSync(DATA_FILE)) {
      const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf-8'));
      res.json(data);
    } else {
      res.json({ tasks: {}, categories: {}, timeBlocks: {}, activeBlockId: null });
    }
  } catch (err) {
    console.error('Error reading data:', err);
    res.status(500).json({ error: 'Failed to read data' });
  }
});

// API: Save data
app.put('/api/data', (req, res) => {
  try {
    fs.writeFileSync(DATA_FILE, JSON.stringify(req.body, null, 2));
    res.json({ ok: true });
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
  console.log(`  Accessible across your Tailnet at http://<hostname>:${PORT}\n`);
});
