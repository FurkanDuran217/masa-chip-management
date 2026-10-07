// Bu service worker kendini imha eder: tüm cache'leri siler ve kaydını kaldırır.
// Amaç: eski sürümden kalan cache'li HTML/JS yüzünden oluşan beyaz ekranı
// kullanıcıdan hiçbir işlem yapmadan kendiliğinden düzeltmek.
self.addEventListener('install', (e) => {
  self.skipWaiting()
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister()),
  )
})

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
      .then(() => self.registration.unregister()),
  )
})

self.addEventListener('fetch', (e) => {
  e.respondWith(fetch(e.request))
})