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
  const defaultScope = self.registration.scope || './';
  if (!rawUrl || rawUrl === '/' || rawUrl === './') {
    return defaultScope;
  }
  if (/^https?:\/\//i.test(rawUrl)) {
    return rawUrl;
  }
  try {
    const scopeUrl = new URL(self.registration.scope);
    let scopePath = scopeUrl.pathname;
    if (!scopePath.endsWith('/')) {
      scopePath += '/';
    }

    // GitHub Pagesなどの特定リポジトリ名対応
    if (self.location.pathname.includes('/teranago-sns-new') && !scopePath.includes('/teranago-sns-new/')) {
      scopePath = '/teranago-sns-new/';
    }
    
    let subPath = rawUrl;
    if (subPath.startsWith('/')) {
      if (scopePath !== '/' && subPath.startsWith(scopePath)) {
        return new URL(subPath, self.location.origin).href;
      }
      subPath = subPath.replace(/^\/+/, '');
    } else if (subPath.startsWith('./')) {
      subPath = subPath.replace(/^\.\/+/, '');
    }

    const baseForResolve = new URL(scopePath, self.location.origin).href;
    return new URL(subPath, baseForResolve).href;
  } catch (e) {
    return defaultScope;
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

  const showNotificationPromise = self.registration.getNotifications({ tag: notificationData.tag }).then((existingNotifications) => {
    const isChat = notificationData.tag && notificationData.tag.startsWith('chat-');
    const hasExisting = existingNotifications && existingNotifications.length > 0;

    let finalTitle = notificationData.title;
    let finalRenotify = notificationData.renotify;
    let finalSilent = notificationData.silent || false;
    let finalVibrate = [300, 150, 300, 150, 300];
    let msgCount = 1;

    if (hasExisting) {
      const existingData = existingNotifications[0].data || {};
      msgCount = (existingData.messageCount || 1) + 1;

      if (isChat) {
        // 同じチャットルームで既存の未読通知がある場合：
        // 通知音・バイブの連打を防ぎ、通知カードの本文を最新メッセージに更新
        finalRenotify = false;
        finalSilent = true;
        finalVibrate = [];
        
        // タイトルに新着件数をスマートに付与 (例: 💬 田中 (営業部) [3件])
        if (!finalTitle.includes(`[${msgCount}件`)) {
          finalTitle = `${finalTitle.replace(/\s*\[\d+件\]$/, '')} [${msgCount}件]`;
        }
      } else if (notificationData.renotify === false) {
        finalRenotify = false;
        finalSilent = true;
        finalVibrate = [];
      }
    }

    notificationData.data.messageCount = msgCount;

    return self.registration.showNotification(finalTitle, {
      body: notificationData.body,
      icon: notificationData.icon,
      badge: notificationData.badge,
      data: notificationData.data,
      tag: notificationData.tag,
      requireInteraction: notificationData.requireInteraction,
      renotify: finalRenotify,
      silent: finalSilent,
      timestamp: notificationData.timestamp,
      vibrate: finalVibrate,
      actions: [
        { action: 'open', title: '確認する' },
        { action: 'close', title: '閉じる' }
      ]
    });
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

