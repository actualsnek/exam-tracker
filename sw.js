const CACHE = 'exam-tracker-v2';
const SHELL = [
  '/',
  '/index.html',
  '/style.css',
  '/app.js',
  '/offline.html',
  '/manifest.json',
  '/icons/icon-192.png',
  '/icons/icon-512.png'
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE).then(c => c.addAll(SHELL))
  );
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  const { request } = e;
  const url = new URL(request.url);

  // Never intercept Firebase, Google APIs, or font requests
  if (
    url.hostname.includes('firebase') ||
    url.hostname.includes('googleapis') ||
    url.hostname.includes('gstatic')
  ) return;

  // HTML navigation → network first, fall back to offline page
  if (request.mode === 'navigate') {
    e.respondWith(
      fetch(request).catch(() => caches.match('/offline.html'))
    );
    return;
  }

  // App shell → cache first, then network
  e.respondWith(
    caches.match(request).then(cached => cached || fetch(request))
  );
});
