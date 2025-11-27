const CACHE_NAME = 'k3-app-shell-v3'; // UBAH VERSI CACHE UNTUK MEMAKSA UPDATE
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/router.js',
  '/main.js',
  '/db.js',
  '/pouchdb.min.js',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  // Dependencies baru
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/js/bootstrap.bundle.min.js',
  'https://cdn.jsdelivr.net/npm/pouchdb-find@8.0.0/dist/pouchdb.find.min.js',
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js', // Untuk Grafik
  // File halaman yang di-load oleh router
  '/pages/dashboard.html',
  '/pages/input.html',
  '/pages/rekap.html',  
  '/pages/grafik.html',  
  '/pages/users.html',   
  '/pages/settings.html',
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  // Hapus cache lama
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          console.log('[ServiceWorker] Removing old cache', key);
          return caches.delete(key);
        }
      }));
    })
  );
  self.clients.claim();
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;

  evt.respondWith(
    caches.match(evt.request).then(resp => resp || fetch(evt.request).catch(()=>caches.match('/index.html')))
  );
});