import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ command }) => ({
  plugins: [react()],
  server: {
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  build: {
    outDir: 'dist',
  },
  // Force a production NODE_ENV for ALL builds (web + Electron). `react-dom`
  // selects its dev vs prod bundle on `process.env.NODE_ENV === 'production'`;
  // if the build runs with NODE_ENV unset (as on some CI/Vercel setups), Vite
  // would otherwise resolve it to "development" and ship the dev React build —
  // ~4× larger, much slower, and noisy with dev-only console warnings. Pinning
  // it here makes the output deterministic no matter the ambient env.
  define: command === 'build' ? { 'process.env.NODE_ENV': '"production"' } : {},
  // Three targets (VERCEL env takes precedence so `vite preview` matches the
  // web build it's serving):
  //   web build/preview (Vercel) → '/blockout/'  served under the sub-path
  //                                (proxied at syncratic.app/blockout + at
  //                                 blockout.syncratic.app/blockout)
  //   Electron build (no VERCEL, build) → './'    relative for file:// loading
  //   dev server (serve)               → '/'      absolute from root
  base: process.env.VERCEL ? '/blockout/' : command === 'build' ? './' : '/',
}));
