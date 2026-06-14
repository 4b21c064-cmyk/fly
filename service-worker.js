const CACHE_NAME ='zenflight-v6'; 
const ASSETS = [
  'index.html',
  'style.css',     
  'control.js',    
  'manifest.json'
];


self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS);
    })
  );
});

// 攔截請求，實現離線也能秒開 App
self.addEventListener('fetch', (e) => {
  e.respondWith(
    caches.match(e.request).then((response) => {
      return response || fetch(e.request);
    })
  );
});