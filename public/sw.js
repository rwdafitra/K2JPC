// public/sw.js — FORCE UPDATE VERSION

const CACHE_NAME = 'minerba-k3-v10-force'; // Versi dinaikkan
const ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/icon.svg',
  '/db.js',
  '/router.js',
  '/main.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.1/font/bootstrap-icons.css',
  'https://unpkg.com/pouchdb@7.3.1/dist/pouchdb.min.js',
  'https://unpkg.com/pouchdb@7.3.1/dist/pouchdb.find.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.5.28/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js'
];

// Install & Paksa Update
self.addEventListener('install', event => {
  self.skipWaiting(); // PENTING: Paksa SW baru aktif segera
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => cache.addAll(ASSETS))
  );
});

// Activate & Hapus Cache Lama
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys => Promise.all(
      keys.filter(key => key !== CACHE_NAME).map(key => caches.delete(key))
    )).then(() => self.clients.claim()) // PENTING: Ambil alih kontrol halaman segera
  );
});

// Fetch Strategy: Network First (Agar data selalu update), Fallback Cache
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  
  event.respondWith(
    fetch(event.request)
      .then(res => {
        // Jika online, simpan versi terbaru ke cache
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      })
      .catch(() => {
        // Jika offline, ambil dari cache
        return caches.match(event.request).then(cached => {
            if (cached) return cached;
            if (event.request.headers.get('accept').includes('text/html')) {
                return caches.match('/index.html');
            }
        });
      })
  );
});