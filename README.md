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

## License

ISC
