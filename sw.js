// Quant Theft Auto's service worker. Everything the game loads is fetched from the network first, so a new version shows
// at once, and kept: once you have played (a map you have opened), the game starts with no connection too. Only this
// site and the title font are kept; the co-op broker and the like always go to the network.
const CACHE = 'qta-1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', (e) => {
  const r = e.request;
  if (r.method !== 'GET') return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin && !/^fonts\.(googleapis|gstatic)\.com$/.test(u.hostname)) return;
  e.respondWith(fetch(r).then((res) => {
    if (res.ok || res.type === 'opaque') { const copy = res.clone(); e.waitUntil(caches.open(CACHE).then((c) => c.put(r, copy))); }
    return res;
  }).catch(() => caches.match(r, { ignoreSearch: true }).then((m) => m || caches.match(r).then((m2) => m2 || Response.error()))));
});
