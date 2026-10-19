// Service Worker for Terakoya SNS / Groupware
// Version: 2026.10.19.1
const CACHE_NAME = 'teranago-sns-v20261019-1';
const IMAGE_CACHE_NAME = 'teranago-image-cache-v20261019-1';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './manifest.json'
];

// 画像・メディアファイル判定（チャット写真、サムネイル、スタンプ、アバター、添付画像等）
function isMediaRequest(requestUrl) {
  const url = requestUrl.toLowerCase();
  return (
    url.includes('/bulletinsfiles/') ||
    url.includes('/uploads/') ||
    url.includes('/external-files/') ||
    url.includes('/stamps') ||
    /\.(png|jpe?g|webp|gif|svg|ico)(\?.*)?$/i.test(url)
  );
}

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
          if (cache !== CACHE_NAME && cache !== IMAGE_CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') {
    return;
  }

  const reqUrl = event.request.url;

  // 1. チャット画像・写真・スタンプ・アバター等のメディアリクエスト
  // -> Cache-First 戦略: キャッシュにあれば0秒で即座に返却、無ければネットワークから取得してキャッシュ保存
  if (isMediaRequest(reqUrl)) {
    event.respondWith(
      caches.open(IMAGE_CACHE_NAME).then(async (imageCache) => {
        const cachedResponse = await imageCache.match(event.request);
        if (cachedResponse) {
          return cachedResponse;
        }

        try {
          const networkResponse = await fetch(event.request);
          // 正常レスポンスまたはクロスオリジンopaqueレスポンスをキャッシュに保存
          if (networkResponse && (networkResponse.status === 200 || networkResponse.type === 'opaque')) {
            imageCache.put(event.request, networkResponse.clone()).catch(() => {});
          }
          return networkResponse;
        } catch (fetchErr) {
          // オフラインかつキャッシュ無しの場合
          if (cachedResponse) return cachedResponse;
          throw fetchErr;
        }
      })
    );
    return;
  }

  // 2. その他のAPIリクエスト (JSONデータ等) はキャッシュせず常に最新通信
  if (reqUrl.includes('/api/')) {
    return;
  }

  // 3. 一般アセット (HTML, CSS, JS等) -> Network First with Cache Fallback
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        if (response && response.status === 200 && response.type === 'basic') {
          const responseToCache = response.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(event.request, responseToCache);
          });
        }
        return response;
      })
      .catch(() => {
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

  // アクティブなクライアントタブへ即時メッセージを中継
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
        finalRenotify = false;
        finalSilent = true;
        finalVibrate = [];
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
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async (clientList) => {
      // 既に開いているタブがあればフォーカスしてメッセージ送信＆遷移
      for (const client of clientList) {
        if ('focus' in client) {
          if (client.url.startsWith(self.registration.scope) || client.url.includes(self.location.origin)) {
            await client.focus();
            client.postMessage({
              type: 'NOTIFICATION_NAVIGATE',
              url: targetUrl
            });
            if ('navigate' in client && targetUrl) {
              try {
                await client.navigate(targetUrl);
              } catch (e) {
                // navigate非対応または同一URL時は無視
              }
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
