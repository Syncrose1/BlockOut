# Vercel Deployment Settings

This document details all the exact settings needed to deploy BlockOut to Vercel.

## Quick Deploy

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2FSyncrose1%2FBlockOut)

---

## Manual Configuration

If you're importing from GitHub manually, use these exact settings:

### 1. Project Configuration

| Setting | Value |
|---------|-------|
| **Framework Preset** | Vite |
| **Root Directory** | `./` (leave default) |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Install Command** | `npm install` |

### 2. Environment Variables

**Optional - Only if you want cloud sync (not required for basic use):**

```
BLOCKOUT_TOKEN=your-secret-auth-token-here
```

**Note:** You can leave environment variables empty. The app works perfectly with IndexedDB storage only.

### 3. Build & Development Settings

In the Vercel dashboard, go to **Project Settings** → **Build & Development Settings**:

| Setting | Value |
|---------|-------|
| **Framework Preset** | Vite |
| **Build Command** | `npm run build` |
| **Output Directory** | `dist` |
| **Root Directory** | (leave blank) |
| **Development Command** | `npm run dev` (for preview deployments) |
| **Development Port** | `5173` |

### 4. Node.js Version

Vercel will auto-detect from `package.json`, but ensure you're using:
- **Node.js 18.x or higher**

To specify in package.json:
```json
{
  "engines": {
    "node": ">=18.0.0"
  }
}
```

---

## File Structure for Vercel

```
BlockOut/
├── api/                    # Serverless Functions
│   └── data.js            # API endpoint for data sync (auto-detected by Vercel)
├── src/                   # React frontend source
├── dist/                  # Build output (configured as Output Directory)
├── public/                # Static assets
├── vercel.json           # Vercel configuration
├── package.json          # Dependencies & scripts
├── index.html            # Vite entry point
└── vite.config.ts        # Vite configuration
```

---

## vercel.json Configuration

The `vercel.json` file in the repo root handles routing:

```json
{
  "version": 2,
  "name": "blockout",
  "buildCommand": "npm run build",
  "outputDirectory": "dist",
  "framework": "vite",
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "/api/:path*"
    },
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

This ensures:
- API routes work (handled by serverless functions)
- SPA routing works (all routes serve index.html)
- Static assets are served from dist/

---

## Build Process

When you deploy, Vercel runs:

```bash
# 1. Install dependencies
npm install

# 2. Build the app
npm run build
# - Compiles TypeScript
# - Bundles with Vite
# - Outputs to dist/

# 3. Deploy
# - Uploads dist/ folder
# - Sets up API routes from api/ folder
# - Configures routing
```

---

## Common Issues & Solutions

### Issue: "404 - Page Not Found" on refresh

**Solution:** The `vercel.json` rewrite rules handle this. If missing, add:
```json
{
  "rewrites": [
    {
      "source": "/(.*)",
      "destination": "/index.html"
    }
  ]
}
```

### Issue: API routes returning 404

**Solution:** Ensure `api/data.js` exists and vercel.json has:
```json
{
  "rewrites": [
    {
      "source": "/api/:path*",
      "destination": "/api/:path*"
    }
  ]
}
```

### Issue: "Cannot find module"

**Solution:** Ensure all dependencies are in `package.json` (not devDependencies for runtime deps).

### Issue: Build fails

**Solution:** Check that these files exist:
- `index.html` at root
- `vite.config.ts` at root
- `package.json` with build script

---

## Environment Variables Reference

### Optional Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `BLOCKOUT_TOKEN` | No | Auth token for API access. If not set, API is open (but still requires localStorage setup in UI) |
| `SUPABASE_URL` | No | Only if using Supabase for sync |
| `SUPABASE_ANON_KEY` | No | Only if using Supabase for sync |

### No Variables Needed!

For basic usage, **you don't need to set any environment variables**. The app:
- Uses IndexedDB for storage (persists data)
- Works offline
- Syncs to memory-based API (resets on cold start, but local data persists)

---

## Post-Deployment Checklist

After deploying:

- [ ] Visit your deployed URL
- [ ] Create a test task
- [ ] Refresh the page - task should persist (via IndexedDB)
- [ ] Test onboarding tour appears
- [ ] Check all views work (Treemap, Kanban, Timeline)

---

## Custom Domain (Optional)

1. Go to Vercel Dashboard
2. Select your project
3. Go to **Settings** → **Domains**
4. Add your domain
5. Follow DNS instructions

Your BlockOut instance will be available at `https://yourdomain.com`

---

## Updating Your Deployment

When you push to GitHub, Vercel auto-deploys:

```bash
git add .
git commit -m "your changes"
git push origin main
# Vercel automatically redeploys!
```

Or use Vercel CLI:
```bash
vercel --prod
```

---

## Testing Locally Before Deploy

```bash
# Install Vercel CLI
npm i -g vercel

# Test production build locally
vercel dev

# Or manually
npm run build
npm run preview
```
