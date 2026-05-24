const CACHE = 'civics-v4'; // bump on every deploy
// NOTE: list ONLY files that exist now. `cache.addAll` is atomic — a single 404
// aborts install. `sessions.js` is added in M5 (Task 12). Final list lands in M7.
const ASSETS = [
  './', './index.html', './styles.css',
  './src/app.js', './src/sm2.js', './src/grading.js', './src/deck.js',
  './src/queue.js', './src/sessions.js', './src/store.js', './src/ui.js',
  './data/citizenship_2025_newhaven.json', './tools/clusters.json',
  './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
];

self.addEventListener('install', (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(caches.match(e.request).then((hit) => hit || fetch(e.request)));
});
