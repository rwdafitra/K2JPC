// sw.js
const CACHE_NAME = 'k3-app-shell-v6'; // CACHE NAME DITINGKATKAN

const FILES_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json',
  '/router.js',
  '/main.js',
  '/db.js',
  // Tambahkan files yang di load statis di index.html dan pages
  '/pages/dashboard.html',
  '/pages/input.html',
  '/pages/rekap.html',
  '/pages/grafik.html',
  '/pages/users.html',
  '/pages/detail.html',
  '/pages/settings.html',
  'https://cdn.jsdelivr.net/npm/bootstrap@5.3.2/dist/css/bootstrap.min.css',
  'https://cdn.jsdelivr.net/npm/bootstrap-icons@1.10.5/font/bootstrap-icons.css'
];

self.addEventListener('install', (evt) => {
  evt.waitUntil(caches.open(CACHE_NAME).then((cache)=>cache.addAll(FILES_TO_CACHE)));
  self.skipWaiting();
});

self.addEventListener('activate', (evt) => {
  evt.waitUntil(self.clients.claim());
  // Hapus cache lama saat aktivasi
  evt.waitUntil(
    caches.keys().then((keyList) => {
      return Promise.all(keyList.map((key) => {
        if (key !== CACHE_NAME) {
          return caches.delete(key);
        }
      }));
    })
  );
});

self.addEventListener('fetch', (evt) => {
  if (evt.request.method !== 'GET') return;
  evt.respondWith(
    caches.match(evt.request).then(resp => resp || fetch(evt.request).catch(()=>caches.match('/index.html'))).catch(()=>caches.match('/index.html'))
  );
});