const CACHE_NAME = 'k3-app-shell-v5'; // <--- VERSI BARU: WAJIB DINAIKKAN
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  // Jalur file lokal harus dimulai dengan / (root web = public/)
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
  // FIX 404 Ikon: Ikon harus di-cache dan ada di folder public/
  '/favicon.ico',
  '/icon-192.png', 
  '/icon-512.png', 
  
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