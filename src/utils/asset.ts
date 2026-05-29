/**
 * Resolve a public-folder asset path against the app's base URL.
 *
 * BlockOut ships to three targets with different bases (see vite.config.ts):
 *   - dev          → '/'          (BASE_URL '/')
 *   - web (Vercel) → '/blockout/' (served at syncratic.app/blockout + subdomain)
 *   - Electron     → './'         (relative, file://)
 *
 * Hard-coded absolute paths like '/synamon/world.json' or '/bo-logo-v3.png'
 * would 404 once served under the /blockout sub-path, so every public-asset
 * reference must go through here. (Dropbox API paths are NOT assets — leave them.)
 */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, ''); // '', '/blockout', or '.'
  return `${base}/${path.replace(/^\/+/, '')}`;
}

/** Origin-relative API base ('' in dev, '/blockout' on web, '.' in Electron). */
export function apiBase(): string {
  return import.meta.env.BASE_URL.replace(/\/+$/, '');
}
