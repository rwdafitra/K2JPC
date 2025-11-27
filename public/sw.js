const CACHE_NAME = 'k3-app-shell-v3'; // <--- UBAH DARI v1 KE v3 UNTUK FORCE UPDATE
const FILES_TO_CACHE = [
  '/',
  '/index.html',
  // FIX: Pastikan semua jalur dimulai dengan / (absolute dari root public)
  '/manifest.json',
  '/router.js',
  '/main.js',
  '/db.js',
  // Jalur pages/x.html harus ditambahkan jika Service Worker akan melayani rute tersebut
  '/pages/dashboard.html', 
  '/pages/input.html',
  '/pages/rekap.html',
  '/pages/grafik.html',
  '/pages/users.html',
  '/pages/settings.html',
  
  // CDN Links
  'https://cdn.jsdelivr.net/npm/pouchdb@7.3.0/dist/pouchdb.min.js',
  'https://cdn.jsdelivr.net/npm/pouchdb-find@7.3.0/dist/pouchdb.find.min.js', // FIX PouchDB Find Path
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
  // Untuk permintaan yang mencari manifest, favicon, dll.
  evt.respondWith(
    caches.match(evt.request).then(resp => resp || fetch(evt.request).catch(()=>caches.match('/index.html')))
  );
});