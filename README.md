# BlockOut

A visual task management app built for people juggling tasks across different timeframes. Organise work into **time blocks** (e.g. a 6-week clinical placement), assign **categories** that persist across blocks, and see everything as a colour-coded **treemap** inspired by WinDirStat/QDirStat.

## Features

- **Treemap visualisation** — canvas-based squarified treemap; gray tiles pop into colour on completion with particle bursts
- **Time blocks** — define periods with start/end dates and live countdowns
- **Timeless pool** — a master inventory for tasks that don't belong to any block yet
- **Categories & subcategories** — auto-coloured, shared across blocks, with nested treemap regions
- **Kanban board** — drag cards between To Do / In Progress / Done columns
- **Timeline view** — see blocks laid out chronologically
- **Pomodoro timer** — always-visible widget with audio chimes
- **Focus mode** — click a category to dim everything else and auto-start Pomodoro
- **Drag-and-drop** — move tasks between the pool and blocks from the sidebar
- **Daily streak tracker** — flame icon that grows with consecutive completion days
- **Export as PNG** — capture the treemap as a downloadable image
- **Export/Import JSON** — backup and restore all data, or transfer between instances
- **Activity heatmap** — GitHub-style 365-day visualization of productivity
- **Category analytics** — completion rates and statistics per category
- **Onboarding tour** — guided introduction for new users
- **Cloud sync** — self-hosted sync across devices via your own server
- **PWA support** — installable on mobile with offline caching
- **Self-hosted** — runs on your own machine, accessible across a Tailnet

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)

## Setup

```bash
# Clone the repository
git clone https://github.com/Syncrose1/BlockOut.git
cd BlockOut

# Install dependencies
npm install
```

## Running

### Development (hot-reload)

```bash
npm run dev
```

Opens the Vite dev server at `http://localhost:5173` with hot module replacement. API calls are proxied to the backend on port 3001, so start the server in a second terminal:

```bash
npm run server
```

### Production

```bash
npm start
```

This builds the frontend and starts the Express server on port **3001** (or `PORT` env var), binding to `0.0.0.0` so it's reachable across your network/Tailnet.

Visit `http://localhost:3001` — or `http://<tailnet-hostname>:3001` from other devices.

### Custom port

```bash
PORT=8080 npm start
```

## Project structure

```
BlockOut/
├── index.html              # Entry HTML with PWA meta tags
├── package.json
├── vite.config.ts           # Vite config with API proxy
├── tsconfig.json
├── server/
│   └── index.js             # Express server (API + SPA serving)
├── public/
│   ├── manifest.json        # PWA manifest
│   ├── sw.js                # Service worker
│   └── *.svg                # App icons
├── scripts/
│   └── generate-icons.js    # SVG icon generator
└── src/
    ├── main.tsx             # React entry point
    ├── App.tsx              # Root layout
    ├── types/index.ts       # TypeScript interfaces
    ├── store/index.ts       # Zustand state management
    ├── utils/
    │   ├── treemap.ts       # Squarified treemap algorithm
    │   ├── colors.ts        # Colour palette
    │   └── persistence.ts   # Server + localStorage persistence
    ├── styles/global.css    # Dark-theme styles
    └── components/
        ├── Treemap.tsx      # Canvas treemap renderer
        ├── Sidebar.tsx      # Blocks, pool, categories, streak
        ├── Topbar.tsx       # View switcher, export, focus indicator
        ├── Kanban.tsx       # Kanban board
        ├── Timeline.tsx     # Timeline view
        ├── Pomodoro.tsx     # Pomodoro timer widget
        └── Modals.tsx       # Create/edit dialogs
```

## Data storage

All data is persisted to `data.json` in the project root via the Express API. The frontend also saves to `localStorage` as a fallback. No external database required.

## Cloud Sync Setup

BlockOut supports self-hosted cloud sync so you can access your tasks across multiple devices on your Tailnet.

### Quick Start

1. **Start the server with a token** (for basic auth):
```bash
BLOCKOUT_TOKEN=my-secret-token npm start
```

2. **Configure the app:**
   - Click "Sync" in the topbar
   - Enter your server URL: `https://blockout.yourdomain.com` (or `http://192.168.x.x:3001` for local network)
   - Enter your token: `my-secret-token`
   - Click "Test & sync now"

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3001` |
| `BLOCKOUT_TOKEN` | Optional Bearer token for auth | (none) |
| `DATA_DIR` | Where to store data.json | Project root |

### Docker Deployment

**Dockerfile (create in project root):**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy app files
COPY . .

# Build frontend
RUN npm run build

# Create data directory
RUN mkdir -p /data

# Set environment
ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data

# Expose port
EXPOSE 3001

# Start server
CMD ["node", "server/index.js"]
```

**Build and run:**

```bash
# Build the image
docker build -t blockout .

# Run with data persistence
docker run -d \
  --name blockout \
  -p 3001:3001 \
  -e BLOCKOUT_TOKEN=your-secret-token \
  -v blockout-data:/data \
  --restart unless-stopped \
  blockout
```

**Docker Compose (recommended):**

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  blockout:
    build: .
    container_name: blockout
    ports:
      - "3001:3001"
    environment:
      - BLOCKOUT_TOKEN=${BLOCKOUT_TOKEN:-your-secret-token}
      - PORT=3001
      - DATA_DIR=/data
    volumes:
      - ./data:/data
    restart: unless-stopped
```

Run with:

```bash
# Set your token
export BLOCKOUT_TOKEN=your-secret-token

# Start
docker-compose up -d

# View logs
docker-compose logs -f

# Update after code changes
docker-compose up -d --build
```

### Tailscale Setup

To access BlockOut across devices on your Tailnet:

1. **Install Tailscale** on your server and all client devices:
```bash
# Ubuntu/Debian
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up

# macOS
brew install tailscale
sudo tailscale up

# See https://tailscale.com/download for others
```

2. **Start BlockOut** bound to all interfaces:
```bash
npm start
# or with Docker, it already binds to 0.0.0.0
```

3. **Get your Tailnet hostname:**
```bash
tailscale status
```

4. **Access from other devices:**
```
http://<tailnet-hostname>:3001
```

### Reverse Proxy (HTTPS)

For HTTPS access behind a reverse proxy:

**Nginx example:**

```nginx
server {
    listen 443 ssl;
    server_name blockout.yourdomain.com;

    ssl_certificate /path/to/cert.pem;
    ssl_certificate_key /path/to/key.pem;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### Data Backup

Your data is stored in `data.json` (or `/data/data.json` in Docker). Back up regularly:

```bash
# Local backup
cp data.json data.json.backup.$(date +%Y%m%d)

# Or use the Export feature in the app (JSON export)
```

### Security Notes

- The `BLOCKOUT_TOKEN` provides basic Bearer token authentication
- Without a token, the API is open to anyone who can reach the server
- Always use HTTPS in production (via reverse proxy)
- Bind to localhost only if you don't need network access: `npm run dev`
- Data is stored as plain JSON - no encryption at rest

## Vercel Deployment

BlockOut can be deployed to **Vercel** for free hosting. Note: Data persists only in memory on the serverless backend (resets on cold starts). For production use, connect to an external database.

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSyncrose1%2FBlockOut)

### Manual Setup

1. **Push to GitHub** (already done!)

2. **Install Vercel CLI:**
```bash
npm i -g vercel
```

3. **Login and deploy:**
```bash
vercel login
vercel
```

4. **Set environment variables** (optional):
```bash
vercel env add BLOCKOUT_TOKEN
# Enter your secret token
```

Or via Vercel Dashboard → Project Settings → Environment Variables:
- `BLOCKOUT_TOKEN` = your-secret-token

### Important: Data Persistence on Vercel

**⚠️ The serverless deployment stores data in memory only.** When Vercel's serverless functions cold start, data resets.

**For persistent data on Vercel, you need:**

#### Option A: Use IndexedDB only (simplest)
The app already saves to IndexedDB in the browser. For personal use without sync, this works fine.

#### Option B: Connect to Vercel KV (recommended)
Store data in Vercel's Redis-compatible KV store:

```bash
# Install KV
vercel kv create my-blockout-data

# Get credentials from Vercel dashboard, then:
vercel env add KV_URL
vercel env add KV_REST_API_URL
vercel env add KV_REST_API_TOKEN
```

Then modify `api/data.ts` to use `@vercel/kv` instead of memory storage.

#### Option C: External Database
Connect to MongoDB Atlas, Supabase, or any external DB by modifying the API routes.

### Vercel Project Structure

```
BlockOut/
├── api/
│   └── data.ts           # Serverless API endpoint
├── src/                  # React frontend
├── dist/                 # Build output
├── vercel.json           # Vercel configuration
└── package.json
```

### Development vs Production

| Environment | Storage | Persistence |
|-------------|---------|-------------|
| `npm run dev` | `data.json` file | ✅ Persistent |
| Docker | Volume-mounted file | ✅ Persistent |
| Vercel (default) | Memory only | ⚠️ Resets on cold start |
| Vercel + KV | Redis/KV | ✅ Persistent |

### Custom Domain

1. Go to Vercel Dashboard → Your Project → Settings → Domains
2. Add your domain and follow DNS instructions
3. Your BlockOut instance will be at `https://yourdomain.com`

## License

ISC
