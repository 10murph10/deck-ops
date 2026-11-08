/* Offline cache for the web app. The Android app ships its files inside the app and doesn't use this. */
const CACHE = 'deckops-1.4.1';
const SHELL = ['./', 'index.html', 'styles.css', 'content.js', 'content-ext.js', 'tutor.js', 'app.js', 'cap.js', 'manifest.webmanifest',
  'icons/icon-192.png', 'icons/icon-512.png', 'fonts/vt323.woff2', 'fonts/martian.woff2'];
self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => Promise.all(SHELL.map(u => c.add(u).catch(() => {})))).then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', e => {
  const u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  // network first so updates land, cache when offline
  e.respondWith(fetch(e.request).then(r => {
    if (r.ok) { const copy = r.clone(); caches.open(CACHE).then(c => c.put(e.request, copy)); }
    return r;
  }).catch(() => caches.match(e.request, { ignoreSearch: true }).then(r => r || caches.match('index.html'))));
});
