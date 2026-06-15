/* Keptly service worker — offline-first */
const VERSION = 'keptly-v5';
const SHELL = [
  '/',
  '/index.html',
  '/app.html',
  '/manifest.json',
  '/privacy.html',
  '/config.js',
  '/privacy.html',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/maskable-192.png',
  '/icons/maskable-512.png',
  '/icons/apple-touch-icon.png'
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Navigations: network first, fall back to cached shell (true offline launch)
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put('/index.html', copy));
        return r;
      }).catch(() => caches.match(e.request).then(h => h || caches.match('/app.html')).then(h => h || caches.match('/index.html')))
    );
    return;
  }

  // Fonts, same-origin assets, and trusted CDN libs: cache first, then network
  const cacheable = url.origin === location.origin ||
    url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com' ||
    url.hostname === 'cdn.jsdelivr.net';
  if (cacheable) {
    e.respondWith(
      caches.match(e.request).then(hit => hit || fetch(e.request).then(r => {
        const copy = r.clone();
        caches.open(VERSION).then(c => c.put(e.request, copy));
        return r;
      }).catch(() => hit))
    );
  }
});
