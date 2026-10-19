const CACHE = 'gorekia-projects-v3';
const ASSETS = [
  './', 'index.html', 'css/styles.css',
  'js/app.js', 'js/store.js', 'js/chart.js', 'js/dates.js', 'js/config.js',
  'manifest.webmanifest', 'assets/icon.svg', 'assets/icon-192.png', 'assets/icon-512.png',
  'assets/fonts/inter-latin-wght-normal.woff2', 'assets/fonts/inter-latin-ext-wght-normal.woff2',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(ASSETS)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))));
  self.clients.claim();
});

// Red primero (siempre ves la última versión) y caché como respaldo sin conexión.
self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  e.respondWith(
    fetch(e.request)
      .then(res => {
        const copy = res.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then(r => r || caches.match('index.html')))
  );
});
