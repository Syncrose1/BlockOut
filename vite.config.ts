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
  // Three targets (VERCEL env takes precedence so `vite preview` matches the
  // web build it's serving):
  //   web build/preview (Vercel) → '/blockout/'  served under the sub-path
  //                                (proxied at syncratic.app/blockout + at
  //                                 blockout.syncratic.app/blockout)
  //   Electron build (no VERCEL, build) → './'    relative for file:// loading
  //   dev server (serve)               → '/'      absolute from root
  base: process.env.VERCEL ? '/blockout/' : command === 'build' ? './' : '/',
}));
