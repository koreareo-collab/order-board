// Lets the tablet install the board as an app and open it without a connection.
// Only the page itself and its icons are cached; order data always comes live from GitHub
// (and the page keeps its own last copy for offline use).
const CACHE = 'order-board-v1';
const SHELL = ['./', './manifest.webmanifest', './board-assets/icon-192.png', './board-assets/icon-512.png'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return; // GitHub API etc.: straight to network
  // network first, so a new version of the page shows up right away; cache when offline
  e.respondWith(
    fetch(e.request).then(r => { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); return r; })
      .catch(() => caches.match(e.request).then(r => r || caches.match('./')))
  );
});
