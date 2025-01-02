const CACHE_NAME = 'enchatto-v1';
const ASSETS_TO_CACHE = [
    '.',
    'index.html',
    'style.css',
    'app.js',
    'manifest.json'
];

// Service Worker to keep connection alive
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => cache.addAll(ASSETS_TO_CACHE))
    );
    self.skipWaiting();
});

self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});

self.addEventListener('fetch', (event) => {
    if (event.request.url.includes('keep-alive')) {
        event.respondWith(new Response('alive'));
    } else {
        event.respondWith(
            caches.match(event.request)
                .then((response) => response || fetch(event.request))
        );
    }
});