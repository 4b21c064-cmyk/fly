const CACHE_NAME = 'zenflight-v4'; // 🛠️ 滿血迭代升級至 v4 法規！
const ASSETS = [
  'index.html',
  'manifest.json'
];

// 安裝並快取網頁資源
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