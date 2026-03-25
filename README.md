# BlockOut V3

A visual task management app built for people juggling tasks across different timeframes. Organise work into **time blocks** (e.g. a 6-week clinical placement), assign **categories** that persist across blocks, and see everything as a colour-coded **treemap** inspired by WinDirStat/QDirStat.

## Features

- **Treemap visualisation** — canvas-based squarified treemap; gray tiles pop into colour on completion with particle bursts
- **Mobile-responsive** — collapsible category list replaces the treemap on phones; slide-out sidebar drawer; bottom-sheet modals
- **Time blocks** — define periods with start/end dates and live countdowns
- **Timeless pool** — a master inventory for tasks that don't belong to any block yet
- **Categories & subcategories** — auto-coloured, shared across blocks, with nested treemap regions
- **Task Chain** — daily task scheduling with chain tasks and real task embedding
- **Overview** — weekly schedule grid with drag-and-drop time blocks
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
- **Cloud sync** — multiple sync options: BlockOut Cloud (Supabase + R2), Dropbox, or self-hosted
- **User accounts** — Supabase authentication with email/password sign-in
- **PWA support** — installable on mobile with offline caching
- **Desktop apps** — native Windows and Linux builds via Electron
- **Self-hosted** — runs on your own machine, accessible across a Tailnet

## Prerequisites

- [Node.js](https://nodejs.org/) v18 or later
- npm (comes with Node.js)

## Setup

```bash
# Clone the repository
git clone https://github.com/Syncrose1/BlockOut.git
cd BlockOut

# Copy environment file and fill in your values
cp .env.example .env

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
├── api/
│   ├── data.js              # Vercel serverless: legacy data API
│   └── r2-sync.js           # Vercel serverless: R2 cloud sync endpoint
├── server/
│   └── index.js             # Express server (API + R2 sync + SPA serving)
├── public/
│   ├── manifest.json        # PWA manifest
│   ├── sw.js                # Service worker
│   └── *.svg                # App icons
├── scripts/
│   └── generate-icons.js    # SVG icon generator
└── src/
    ├── main.tsx             # React entry point
    ├── App.tsx              # Root layout + auth state
    ├── hooks/
    │   └── useIsMobile.ts   # Responsive breakpoint hook
    ├── types/index.ts       # TypeScript interfaces
    ├── store/index.ts       # Zustand state management
    ├── utils/
    │   ├── treemap.ts       # Squarified treemap algorithm
    │   ├── colors.ts        # Colour palette
    │   ├── persistence.ts   # IndexedDB + cloud sync orchestration
    │   ├── dropbox.ts       # Dropbox OAuth + sync
    │   ├── supabase.ts      # Supabase auth client
    │   ├── r2sync.ts        # R2 cloud storage client
    │   └── analytics.ts     # Export/import, activity logging
    ├── styles/global.css    # Dark-theme styles + mobile responsive
    └── components/
        ├── Treemap.tsx      # Canvas treemap renderer (desktop)
        ├── MobileTaskList.tsx # Collapsible category list (mobile)
        ├── Sidebar.tsx      # Blocks, pool, categories, streak
        ├── Topbar.tsx       # View switcher, export, auth, focus indicator
        ├── TaskChain.tsx    # Daily task chain editor
        ├── Overview.tsx     # Weekly schedule grid
        ├── Timeline.tsx     # Timeline view
        ├── Pomodoro.tsx     # Pomodoro timer widget
        ├── AuthModal.tsx    # Sign in / sign up modal
        └── Modals.tsx       # All other dialogs
```

## Data storage

All data is persisted to **IndexedDB** in the browser as the primary store. The Express server also stores data in `data.json` as a secondary option. No external database required for basic use.

## Cloud Sync Options

BlockOut supports three concurrent cloud sync methods. You can use any combination:

| Method | Auth | Storage | Best For |
|--------|------|---------|----------|
| **BlockOut Cloud** | Supabase (email/password) | Cloudflare R2 | Multi-device sync with accounts |
| **Dropbox** | OAuth (your own Dropbox) | Dropbox file | Personal backup to your Dropbox |
| **Self-Hosted** | Bearer token | JSON file on server | Full control, Tailnet access |

### Option 1: BlockOut Cloud (Supabase Auth + Cloudflare R2)

This is the recommended approach for multi-user, multi-device sync. Users create accounts and their data is stored in Cloudflare R2 object storage, keyed by user ID.

#### 1. Set up Supabase (Auth)

1. Create a free project at [supabase.com](https://supabase.com)
2. Go to **Project Settings → API**
3. Copy your **Project URL** and **anon (public) key**
4. Add to your `.env`:

```bash
VITE_SUPABASE_URL=https://your-project-id.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGciOi...your-anon-key
```

5. (Optional) Copy the **service_role key** for server-side JWT verification:

```bash
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOi...your-service-role-key
```

> **Note:** The `VITE_` prefixed keys are public and bundled into the frontend. The `SUPABASE_SERVICE_ROLE_KEY` is server-side only and should never be exposed to the client.

#### 2. Set up Cloudflare R2 (Storage)

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com) → **R2**
2. **Create a bucket** named `blockout` (or your preferred name)
3. Go to **R2 → Manage R2 API Tokens → Create API Token**
4. Grant **Object Read & Write** permission for the bucket
5. Add to your `.env`:

```bash
R2_ACCOUNT_ID=your_cloudflare_account_id
R2_ACCESS_KEY_ID=your_r2_access_key_id
R2_SECRET_ACCESS_KEY=your_r2_secret_access_key
R2_BUCKET_NAME=blockout
```

#### 3. How it works

- Users click **Sign In** in the topbar to create an account or log in
- Data syncs automatically every 10 seconds when changes are detected
- Each user's data is stored at `users/{user_id}/blockout-data.json` in R2
- The API route (`/api/r2-sync`) verifies the Supabase JWT before reading/writing
- Existing local data (IndexedDB) is preserved — cloud sync runs alongside it

#### Cost considerations

- **Supabase free tier**: 50,000 monthly active users, unlimited auth
- **Cloudflare R2 free tier**: 10 GB storage, 10 million reads/month, 1 million writes/month
- A typical user's data is 5–50 KB of JSON — you can serve **hundreds of thousands of users** within the free tier
- No egress fees on R2 (unlike S3)

### Option 2: Dropbox Sync

1. Create a Dropbox app at [dropbox.com/developers/apps](https://www.dropbox.com/developers/apps)
2. Choose **Scoped access → App folder**
3. Enable permissions: `files.content.write`, `files.content.read`
4. Copy the App Key to `.env`:

```bash
VITE_DROPBOX_APP_KEY=your_app_key
```

5. Add your redirect URI (e.g. `http://localhost:5173`) in the Dropbox app settings
6. In the app, click **Sync → Dropbox → Connect to Dropbox**

### Option 3: Self-Hosted Server Sync

1. **Start the server with a token:**
```bash
BLOCKOUT_TOKEN=my-secret-token npm start
```

2. **Configure the app:**
   - Click "Sync" in the topbar
   - Select "Self-Hosted"
   - Enter your server URL: `https://blockout.yourdomain.com`
   - Enter your token: `my-secret-token`
   - Click "Test & sync now"

### Environment Variables Reference

#### Frontend (VITE_ prefix — bundled into client)

| Variable | Description | Required |
|----------|-------------|----------|
| `VITE_DROPBOX_APP_KEY` | Dropbox OAuth app key | For Dropbox sync |
| `VITE_SUPABASE_URL` | Supabase project URL | For BlockOut Cloud |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key | For BlockOut Cloud |

#### Server-side (never exposed to client)

| Variable | Description | Required |
|----------|-------------|----------|
| `PORT` | Server port (default: 3001) | No |
| `BLOCKOUT_TOKEN` | Bearer token for self-hosted sync | For self-hosted sync |
| `DATA_DIR` | Where to store data.json (default: project root) | No |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase service role key for JWT verification | Recommended for Cloud |
| `R2_ACCOUNT_ID` | Cloudflare account ID | For BlockOut Cloud |
| `R2_ACCESS_KEY_ID` | R2 API token access key | For BlockOut Cloud |
| `R2_SECRET_ACCESS_KEY` | R2 API token secret key | For BlockOut Cloud |
| `R2_BUCKET_NAME` | R2 bucket name (default: `blockout`) | For BlockOut Cloud |

### Docker Deployment

```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --only=production

COPY . .
RUN npm run build
RUN mkdir -p /data

ENV NODE_ENV=production
ENV PORT=3001
ENV DATA_DIR=/data

EXPOSE 3001

CMD ["node", "server/index.js"]
```

**Docker Compose:**

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
      # BlockOut Cloud (optional)
      - VITE_SUPABASE_URL=${VITE_SUPABASE_URL}
      - VITE_SUPABASE_ANON_KEY=${VITE_SUPABASE_ANON_KEY}
      - SUPABASE_SERVICE_ROLE_KEY=${SUPABASE_SERVICE_ROLE_KEY}
      - R2_ACCOUNT_ID=${R2_ACCOUNT_ID}
      - R2_ACCESS_KEY_ID=${R2_ACCESS_KEY_ID}
      - R2_SECRET_ACCESS_KEY=${R2_SECRET_ACCESS_KEY}
      - R2_BUCKET_NAME=${R2_BUCKET_NAME:-blockout}
    volumes:
      - ./data:/data
    restart: unless-stopped
```

### Tailscale Setup

To access BlockOut across devices on your Tailnet:

1. **Install Tailscale** on your server and all client devices:
```bash
# Ubuntu/Debian
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up
```

2. **Start BlockOut** bound to all interfaces:
```bash
npm start
```

3. **Access from other devices:**
```
http://<tailnet-hostname>:3001
```

### Security Notes

- The `BLOCKOUT_TOKEN` provides basic Bearer token authentication for self-hosted sync
- Supabase handles authentication for BlockOut Cloud — JWTs are verified server-side
- R2 credentials are server-side only — never exposed to the browser
- Always use HTTPS in production (via reverse proxy)
- Data is stored as plain JSON — no encryption at rest

## Vercel Deployment

BlockOut can be deployed to **Vercel** for free hosting with zero configuration.

### One-Click Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSyncrose1%2FBlockOut)

### Manual Setup

1. Import your GitHub repository at [vercel.com/new](https://vercel.com/new)
2. Vercel auto-detects Vite settings
3. Add environment variables if using cloud sync (see table above)
4. Deploy!

### Data Persistence on Vercel

BlockOut uses **IndexedDB** in the browser as the primary store — works perfectly on Vercel with no setup.

For multi-device sync, configure **BlockOut Cloud** (Supabase + R2) or **Dropbox** via the Vercel environment variables dashboard.

### Vercel Environment Variables for Cloud Sync

```bash
# Supabase Auth (public)
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

# Supabase Auth (server-side)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Cloudflare R2 (server-side)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=your_access_key
R2_SECRET_ACCESS_KEY=your_secret_key
R2_BUCKET_NAME=blockout

# Dropbox (public)
VITE_DROPBOX_APP_KEY=your_dropbox_app_key
```

## License

ISC
