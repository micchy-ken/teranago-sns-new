const CACHE_NAME = 'teranago-sns-v1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// Install event
self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      for (const asset of ASSETS_TO_CACHE) {
        try {
          await cache.add(asset);
        } catch (e) {
          // キャッシュ失敗は無視してSWインストールを完了させる
        }
      }
    })
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
            return caches.match('./index.html');
          }
        });
      })
  );
});

// ==========================================
// Web Push Notification Events
// ==========================================

// URL解決ヘルパー (GitHub Pages等のサブディレクトリスコープに対応)
function resolveSwUrl(rawUrl) {
  const defaultUrl = self.registration.scope || './';
  if (!rawUrl || rawUrl === '/' || rawUrl === './') {
    return defaultUrl;
  }
  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }
  try {
    const scopeUrl = new URL(self.registration.scope);
    const scopePath = scopeUrl.pathname.endsWith('/') ? scopeUrl.pathname : (scopeUrl.pathname + '/');
    
    let subPath = rawUrl;
    if (subPath.startsWith('/')) {
      if (scopePath !== '/' && subPath.startsWith(scopePath)) {
        return new URL(subPath, self.location.origin).href;
      }
      subPath = subPath.replace(/^\/+/, '');
    } else if (subPath.startsWith('./')) {
      subPath = subPath.replace(/^\.\/+/, '');
    }
    return new URL(subPath, self.registration.scope).href;
  } catch (e) {
    return defaultUrl;
  }
}

// Push Event: バックグラウンドでの通知受信
self.addEventListener('push', (event) => {
  const defaultScope = self.registration.scope || './';
  const defaultIcon = resolveSwUrl('icon.svg');

  let notificationData = {
    title: '社内グループウェア 新着通知',
    body: '新しい連絡があります。',
    icon: defaultIcon,
    badge: defaultIcon,
    data: { url: defaultScope },
    tag: 'notif_' + Date.now(),
    requireInteraction: true,
    renotify: true,
    silent: false,
    timestamp: Date.now(),
  };

  let payload = null;
  if (event.data) {
    try {
      payload = event.data.json();
      const rawUrl = payload.url || (payload.data && payload.data.url) || defaultScope;
      const targetUrl = resolveSwUrl(rawUrl);

      notificationData = {
        title: payload.title || notificationData.title,
        body: payload.body || notificationData.body,
        icon: payload.icon ? resolveSwUrl(payload.icon) : defaultIcon,
        badge: payload.badge ? resolveSwUrl(payload.badge) : defaultIcon,
        data: {
          ...(payload.data || {}),
          url: targetUrl,
          receivedAt: Date.now()
        },
        tag: payload.tag || ('notif_' + Date.now()),
        requireInteraction: payload.requireInteraction !== undefined ? !!payload.requireInteraction : true,
        renotify: payload.renotify !== undefined ? !!payload.renotify : true,
        silent: false,
        timestamp: payload.timestamp || Date.now(),
        vibrate: [300, 150, 300, 150, 300],
      };
    } catch (e) {
      notificationData.body = event.data.text();
    }
  }

  // アクティブなクライアントタブへ即時メッセージを中継（フォアグラウンド表示中のリアルタイム即時更新）
  const notifyClientsPromise = clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
    clientList.forEach((client) => {
      client.postMessage({
        type: 'PUSH_NOTIFICATION_RECEIVED',
        notification: notificationData,
        payload: payload
      });
    });
  }).catch(() => {});

  const showNotificationPromise = self.registration.showNotification(notificationData.title, {
    body: notificationData.body,
    icon: notificationData.icon,
    badge: notificationData.badge,
    data: notificationData.data,
    tag: notificationData.tag,
    requireInteraction: notificationData.requireInteraction,
    renotify: notificationData.renotify,
    silent: false,
    timestamp: notificationData.timestamp,
    vibrate: [300, 150, 300, 150, 300],
    actions: [
      { action: 'open', title: '確認する' },
      { action: 'close', title: '閉じる' }
    ]
  });

  event.waitUntil(Promise.all([showNotificationPromise, notifyClientsPromise]));
});

// Notification Click Event: 通知タップ時の挙動
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'close') {
    return;
  }

  const rawUrl = (event.notification.data && event.notification.data.url) ? event.notification.data.url : (event.notification.url || '');
  const targetUrl = resolveSwUrl(rawUrl);

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      // 既に開いているタブがあればフォーカスしてURLを遷移
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.startsWith(self.registration.scope) || client.url.includes(self.location.origin)) {
            client.focus();
            if (targetUrl) {
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

