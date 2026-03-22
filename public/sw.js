const CACHE_NAME = 'roomex-v3';

self.addEventListener('install', (event) => {
  console.log('SW: Install event');
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  console.log('SW: Activate event');
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => caches.delete(key))
      );
    }).then(() => {
      console.log('SW: Caches cleared');
      return clients.claim();
    })
  );
});

self.addEventListener('fetch', (event) => {
  // PWA requirement: must have a fetch handler
  // console.log('SW: Fetching', event.request.url);
  event.respondWith(fetch(event.request));
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
