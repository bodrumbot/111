const CACHE_NAME = 'bodrum-cache-v1';
const IMAGE_CACHE_NAME = 'bodrum-images-v1';

// Asosiy fayllar
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/style.css',
  '/script.js',
  '/menu.js',
  '/firebase-config.js'
];

// Install event - asosiy fayllarni keshlash
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => {
        console.log('Caching static assets');
        return cache.addAll(STATIC_ASSETS);
      })
      .catch((err) => console.log('Cache failed:', err))
  );
  self.skipWaiting();
});

// Activate event - eski keshlarni tozalash
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME && name !== IMAGE_CACHE_NAME)
          .map((name) => caches.delete(name))
      );
    })
  );
  self.clients.claim();
});

// Fetch event - rasmlarni keshlash strategiyasi
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // ImgBB rasmlari uchun maxsus kesh strategiyasi
  if (url.hostname.includes('ibb.co') || url.hostname.includes('imgbb.com')) {
    event.respondWith(handleImageRequest(request));
    return;
  }

  // Statik fayllar uchun Cache First
  if (request.destination === 'document' || 
      request.destination === 'script' || 
      request.destination === 'style') {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Boshqa so'rovlar uchun Network First
  event.respondWith(networkFirst(request));
});

// Rasmlar uchun Stale While Revalidate strategiyasi
async function handleImageRequest(request) {
  const cache = await caches.open(IMAGE_CACHE_NAME);
  
  // Keshdan olish
  const cached = await cache.match(request);
  
  // Networkdan yangilash (background)
  const fetchPromise = fetch(request)
    .then((response) => {
      if (response.ok) {
        cache.put(request, response.clone());
      }
      return response;
    })
    .catch(() => cached);

  // Keshdan qaytarish (agar bo'lsa)
  if (cached) {
    return cached;
  }

  // Agar keshda bo'lmasa, networkdan kutish
  return fetchPromise;
}

// Cache First strategiyasi
async function cacheFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  
  if (cached) {
    return cached;
  }
  
  try {
    const response = await fetch(request);
    cache.put(request, response.clone());
    return response;
  } catch (error) {
    return new Response('Offline', { status: 503 });
  }
}

// Network First strategiyasi
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request);
    return cached || new Response('Offline', { status: 503 });
  }
}