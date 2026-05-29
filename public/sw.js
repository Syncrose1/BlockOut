// Retired service worker (kill-switch).
//
// The previous SW precached '/' and '/index.html'. That's unsafe now that
// BlockOut is served under the /blockout sub-path and proxied on the
// syncratic.app origin, where caching '/' would capture the wrong shell.
//
// Existing installs will pick this up on their next update check: it clears all
// caches, unregisters itself, and reloads controlled clients. Offline use is
// covered by the Electron desktop build.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));
      await self.registration.unregister();
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((c) => c.navigate(c.url));
    })()
  );
});
