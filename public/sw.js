// ============================
//  SERVICE WORKER - FINAL SAFE VERSION
// ============================
const CACHE_VERSION = 'k3-v7'; 
const CACHE_NAME = `k3-cache-${CACHE_VERSION}`;

// Semua asset static yang ingin dicache
const ASSETS = [
  '/',
  '/index.html',
  '/main.js',
  '/router.js',
  '/db.js',
  '/manifest.json',

  // pages
  '/pages/dashboard.html',
  '/pages/input.html',
  '/pages/rekap.html',
  '/pages/detail.html',
  '/pages/grafik.html',
  '/pages/users.html',
  '/pages/settings.html',

  // icons (hanya jika memang ada)
  '/icon-192.png',
  '/icon-512.png'
];


// ============================
//  INSTALL - SAFE CACHING
// ============================
self.addEventListener('install', event => {
  console.log('[SW] Installing…');

  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE_NAME);

      for (const asset of ASSETS) {
        try {
          const res = await fetch(asset, { cache: "no-cache" });

          if (res.ok) {
            await cache.put(asset, res.clone());
            console.log('[SW] Cached:', asset);
          } else {
            console.warn('[SW] Skip (not found):', asset);
          }

        } catch (err) {
          console.warn('[SW] Skip (fetch error):', asset, err);
        }
      }

      console.log('[SW] Install complete.');
      self.skipWaiting();
    })()
  );
});


// ============================
//  ACTIVATE - DELETE OLD CACHES
// ============================
self.addEventListener('activate', event => {
  console.log('[SW] Activating…');

  event.waitUntil(
    (async () => {
      const keys = await caches.keys();

      for (const key of keys) {
        if (key !== CACHE_NAME) {
          console.log('[SW] Deleting old cache:', key);
          await caches.delete(key);
        }
      }

      console.log('[SW] Ready.');
      self.clients.claim();
    })()
  );
});


// ============================
//  FETCH - CACHE FIRST + NETWORK FALLBACK
// ============================
self.addEventListener('fetch', event => {

  // Jangan intercept request non-HTTP
  if (!event.request.url.startsWith('http')) return;

  event.respondWith(
    (async () => {
      const cacheMatch = await caches.match(event.request);
      if (cacheMatch) {
        return cacheMatch; // Cache first
      }

      try {
        const fetchResponse = await fetch(event.request);
        return fetchResponse;
      } catch (err) {
        console.warn('[SW] Network fail:', event.request.url);
        
        // fallback: tampilkan offline page (?) jika mau
        return new Response('<h3>Offline</h3>', {
          headers: { 'Content-Type': 'text/html' }
        });
      }
    })()
  );
});


// ============================
//  MESSAGE HANDLER (optional for future sync)
// ============================
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
