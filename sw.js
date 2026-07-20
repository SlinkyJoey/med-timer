const CACHE = 'medtimer-v15';
const ASSETS = ['./', './index.html', './manifest.json', './firebase-config.js',
                './icon-180.png', './icon-192.png', './icon-512.png'];

self.addEventListener('install', e => {
  // cache:'reload' so a new version always pulls fresh copies from the network —
  // a plain addAll() reads the browser's HTTP cache and can re-cache stale assets
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: 'reload' }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

const withTimeout = (promise, ms) =>
  Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  // leave cross-origin requests (Firebase SDK, RTDB) entirely to the network
  if (new URL(req.url).origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // network-first for the page itself: updates arrive immediately, reload never
    // hangs (4s timeout), and offline still falls back to the cached app
    e.respondWith(
      withTimeout(fetch(req), 4000)
        .then(resp => {
          if (resp.ok) {
            const copy = resp.clone();
            caches.open(CACHE).then(c => { c.put(req, copy); c.put('./index.html', resp.clone()); });
          }
          return resp;
        })
        .catch(() =>
          caches.match(req, { ignoreSearch: true })
            .then(hit => hit || caches.match('./index.html')))
    );
    return;
  }

  // assets: serve from cache instantly, refresh the cache in the background
  e.respondWith(
    caches.match(req, { ignoreSearch: true }).then(hit => {
      const refresh = fetch(req)
        .then(resp => {
          if (resp.ok) caches.open(CACHE).then(c => c.put(req, resp.clone()));
          return resp;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
