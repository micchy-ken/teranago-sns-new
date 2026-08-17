const CACHE_NAME = 'teranago-sns-v1';
const ASSETS_TO_CACHE = [
  '/',
  '/index.html',
  '/manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(ASSETS_TO_CACHE);
    }).then(() => self.skipWaiting())
  );
});

// Activate event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event (Network First with Cache Fallback)
self.addEventListener('fetch', (event) => {
  // Skip non-GET requests and API requests
  if (event.request.method !== 'GET' || event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        // Clone and store in cache if valid
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
        // Fallback to cache when offline
        return caches.match(event.request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('/index.html');
          }
        });
      })
  );
});

// ==========================================
// Web Push Notification Events
// ==========================================

// Push Event: バックグラウンドでの通知受信
self.addEventListener('push', (event) => {
  let notificationData = {
    title: '社内グループウェア 新着通知',
    body: '新しい連絡があります。',
    icon: '/icon.svg',
    badge: '/icon.svg',
    data: { url: '/' },
  };

  if (event.data) {
    try {
      const payload = event.data.json();
      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon || '/icon.svg',
        badge: payload.badge || '/icon.svg',
        data: payload.data || { url: payload.url || '/' },
        tag: payload.tag || 'general-notification',
        renotify: !!payload.renotify,
        vibrate: [100, 50, 100],
      };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  event.waitUntil(
    self.registration.showNotification(notificationData.title, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      tag: notificationData.tag,
      renotify: notificationData.renotify,
      vibrate: [100, 50, 100],
      actions: [
        { action: 'open', title: '確認する' },
        { action: 'close', title: '閉じる' }
      ]
    })
  );
});

// Notification Click Event: 通知タップ時の挙動
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const targetUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : '/';

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既に開いているタブがあればフォーカスしてURLを遷移
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.includes(self.location.origin)) {
            client.focus();
            if (targetUrl !== '/') {
              client.navigate(targetUrl);
            }
            return;
          }
        }
      }
      // 新しいウィンドウ/PWA画面を開く
      if (clients.openWindow) {
        return clients.openWindow(targetUrl);
      }
    })
  );
});

