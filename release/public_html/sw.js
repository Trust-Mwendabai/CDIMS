/* CDIMS service worker. It works under any base path (domain root or a sub-folder) because the base is read from
 * the worker's own scope.
 * - Built assets (hashed, immutable): cache-first.
 * - Page navigations: network-first, falling back to the cached app shell when offline.
 * - /api/: never cached (authenticated, changing data); it simply fails when offline and the app handles that.
 */
const VERSION = 'cdims-v3';
const BASE = new URL(self.registration.scope).pathname; // e.g. "/" or "/CDIMS/"
const SHELL = [BASE, `${BASE}manifest.webmanifest`, `${BASE}icon-192.png`, `${BASE}icon-512.png`];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== VERSION).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (req.method !== 'GET' || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith(`${BASE}api/`) || url.pathname.startsWith(`${BASE}public/`)) return; // network only

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(BASE, copy));
          return res;
        })
        .catch(() => caches.match(BASE)),
    );
    return;
  }

  if (url.pathname.startsWith(`${BASE}assets/`) || SHELL.includes(url.pathname) || /\.(png|svg|woff2?)$/.test(url.pathname)) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) {
          const copy = res.clone();
          caches.open(VERSION).then((c) => c.put(req, copy));
        }
        return res;
      })),
    );
  }
});
