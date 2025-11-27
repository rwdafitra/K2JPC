const CACHE_NAME = 'k3-app-shell-v4'; // <--- VERSI BARU
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  // FIX: Tambahkan semua file lokal yang dimuat dari root web
  '/manifest.json',
  '/router.js',
  '/main.js',
  '/db.js',
  '/pages/dashboard.html', 
  '/pages/input.html',
  '/pages/rekap.html',
  '/pages/grafik.html',
  '/pages/users.html',
  '/pages/settings.html',
  // FIX 404 Ikon
  '/favicon.ico',
  '/icon-192.png', // Pastikan file ini ada di public/
  '/icon-512.png', // Pastikan file ini ada di public/
  
  // CDN Links
  'https://cdn.jsdelivr.net/npm/pouchdb@7.3.0/dist/pouchdb.min.js',
  'https://cdn.jsdelivr.net/npm/pouchdb-find@7.3.0/dist/pouchdb.find.min.js', 
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css'
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
          return caches.delete(key);
        }
      }));
    })
  );
  evt.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  evt.respondWith(
    caches.match(evt.request).then(resp => resp || fetch(evt.request).catch(()=>caches.match('/index.html')))
  );
});