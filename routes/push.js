import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import webpush from 'web-push';

const router = Router();

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

// VAPID キー初期化
const vapidKeysPath = path.join(dataDir, 'vapid-keys.json');
let vapidKeys;

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  vapidKeys = {
    publicKey: process.env.VAPID_PUBLIC_KEY,
    privateKey: process.env.VAPID_PRIVATE_KEY
  };
} else if (fs.existsSync(vapidKeysPath)) {
  try {
    vapidKeys = JSON.parse(fs.readFileSync(vapidKeysPath, 'utf8'));
  } catch (e) {
    vapidKeys = webpush.generateVAPIDKeys();
    fs.writeFileSync(vapidKeysPath, JSON.stringify(vapidKeys, null, 2), 'utf8');
  }
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  fs.writeFileSync(vapidKeysPath, JSON.stringify(vapidKeys, null, 2), 'utf8');
}

try {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
} catch (e) {
  console.error('[WebPush Router] Failed to set VAPID details:', e);
}

// Push Subscriptions JSON
const subscriptionsPath = path.join(dataDir, 'push-subscriptions.json');

function loadSubscriptions() {
  if (!fs.existsSync(subscriptionsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(subscriptionsPath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveSubscriptions(subs) {
  try {
    fs.writeFileSync(subscriptionsPath, JSON.stringify(subs, null, 2), 'utf8');
  } catch (e) {
    console.error('[WebPush Router] Failed to save subscriptions:', e);
  }
}

// 共有ディープリンクURLの自動解決ヘルパー
function resolveDeepLinkUrl(url, data = {}) {
  // すでにクエリパラメータ付きURLまたは絶対URLが指定されている場合はそれを尊重
  if (url && url !== '/' && url !== '' && url !== '/index.html') {
    return url;
  }

  // data に詳細識別情報がある場合は自動的に共有リンクパラメータを構築
  const tab = data.tab || data.category;
  if (data.topicId || data.bulletinId) {
    return `/?tab=board&topicId=${data.topicId || data.bulletinId}`;
  }
  if (data.eventId) {
    return `/?tab=calendar&eventId=${data.eventId}`;
  }
  if (data.applicationId || data.appId) {
    return `/?tab=workflow&appId=${data.applicationId || data.appId}`;
  }
  if (data.memoId) {
    return `/?tab=memo&memoId=${data.memoId}`;
  }
  if (data.chatRoomId || data.roomId) {
    return `/?tab=chat&chatRoomId=${data.chatRoomId || data.roomId}`;
  }
  if (data.reportId) {
    return `/?tab=daily_report&reportId=${data.reportId}`;
  }
  if (data.safetyEventId) {
    return `/?tab=safety_confirmation&safetyEventId=${data.safetyEventId}`;
  }

  if (tab) {
    return `/?tab=${tab}`;
  }

  return url || '/';
}

export async function sendPushNotificationToUser(params) {
  const {
    targetUserId,
    targetUserIds,
    excludeUserId,
    title,
    body,
    icon = '/icon.svg',
    badge = '/icon.svg',
    url = '/',
    data = {},
    tag,
    requireInteraction = true,
    renotify = true,
    silent = false
  } = params;

  const allSubs = loadSubscriptions();
  let targets = [];

  if (targetUserId === 'all') {
    targets = allSubs.filter(s => !excludeUserId || s.userId !== String(excludeUserId));
  } else if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
    const idSet = new Set(targetUserIds.map(String));
    targets = allSubs.filter(s => idSet.has(s.userId) && (!excludeUserId || s.userId !== String(excludeUserId)));
  } else if (targetUserId) {
    targets = allSubs.filter(s => s.userId === String(targetUserId));
  }

  if (targets.length === 0) return { sentCount: 0, failureCount: 0, totalTargets: 0 };

  const finalUrl = resolveDeepLinkUrl(url, data);
  const notificationTag = tag || `notif_${Date.now()}`;
  const payload = JSON.stringify({
    title,
    body,
    icon,
    badge,
    url: finalUrl,
    data: { ...data, url: finalUrl },
    tag: notificationTag,
    requireInteraction,
    renotify,
    silent
  });

  const staleEndpoints = [];
  let sentCount = 0;
  let failureCount = 0;

  const pushOptions = {
    TTL: 86400,
    urgency: 'high',
    topic: notificationTag.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 32) || undefined
  };

  await Promise.all(
    targets.map(async (sub) => {
      try {
        await webpush.sendNotification(sub.subscription, payload, pushOptions);
        sentCount++;
      } catch (err) {
        failureCount++;
        if (err.statusCode === 404 || err.statusCode === 410) {
          staleEndpoints.push(sub.subscription.endpoint);
        }
      }
    })
  );

  if (staleEndpoints.length > 0) {
    const remainingSubs = allSubs.filter(s => !staleEndpoints.includes(s.subscription.endpoint));
    saveSubscriptions(remainingSubs);
  }

  return { sentCount, failureCount, totalTargets: targets.length };
}

// -------------------------------------------------------------
// Endpoints (ルーティング耐障害性: アレイパス指定)
// -------------------------------------------------------------

// VAPID公開鍵取得
router.get(['/vapid-public-key', '/push/vapid-public-key', '/api/push/vapid-public-key'], (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// 購読登録
router.post(['/subscribe', '/push/subscribe', '/api/push/subscribe'], (req, res) => {
  try {
    const { userId, subscription, userAgent } = req.body;
    if (!userId || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'ユーザーIDおよび購読情報が必要です。' });
    }

    const allSubs = loadSubscriptions();
    const existingIdx = allSubs.findIndex(s => s.subscription.endpoint === subscription.endpoint);
    const now = new Date().toISOString();

    if (existingIdx >= 0) {
      allSubs[existingIdx] = {
        ...allSubs[existingIdx],
        userId: String(userId),
        subscription,
        userAgent: userAgent || allSubs[existingIdx].userAgent,
        lastActiveAt: now
      };
    } else {
      allSubs.push({
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        userId: String(userId),
        subscription,
        userAgent,
        createdAt: now,
        lastActiveAt: now
      });
    }

    saveSubscriptions(allSubs);
    const userSubCount = allSubs.filter(s => s.userId === String(userId)).length;
    res.json({ success: true, message: '通知の購読を登録しました。', count: userSubCount });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 購読解除
router.post(['/unsubscribe', '/push/unsubscribe', '/api/push/unsubscribe'], (req, res) => {
  try {
    const { endpoint, userId } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: '解除対象のエンドポイントが必要です。' });
    }

    let allSubs = loadSubscriptions();
    const initialCount = allSubs.length;
    allSubs = allSubs.filter(s => {
      if (s.subscription.endpoint === endpoint) return false;
      if (userId && s.userId === String(userId) && !endpoint) return false;
      return true;
    });

    saveSubscriptions(allSubs);
    res.json({ success: true, message: '通知の購読を解除しました。', removed: initialCount - allSubs.length });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 購読ステータス確認
router.get(['/status/:userId', '/push/status/:userId', '/api/push/status/:userId'], (req, res) => {
  try {
    const userId = String(req.params.userId);
    const allSubs = loadSubscriptions();
    const userSubs = allSubs.filter(s => s.userId === userId);
    res.json({
      isSubscribed: userSubs.length > 0,
      subscriptionCount: userSubs.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// プッシュ通知送信 API
router.post(['/send', '/push/send', '/api/push/send'], async (req, res) => {
  try {
    const { targetUserId, targetUserIds, excludeUserId, title, body, icon, badge, url, data, tag, requireInteraction, renotify, silent } = req.body;
    if (!title || !body) {
      return res.status(400).json({ error: 'タイトルと本文は必須です。' });
    }

    const result = await sendPushNotificationToUser({
      targetUserId, targetUserIds, excludeUserId, title, body, icon, badge, url, data, tag, requireInteraction, renotify, silent
    });

    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// テスト通知 API
router.post(['/test', '/push/test', '/api/push/test'], async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) {
      return res.status(400).json({ error: 'ユーザーIDが必要です。' });
    }

    const allSubs = loadSubscriptions();
    const targets = allSubs.filter(s => s.userId === String(userId));

    if (targets.length === 0) {
      return res.status(404).json({ error: 'このユーザーの通知購読端末が見つかりません。' });
    }

    const result = await sendPushNotificationToUser({
      targetUserId: String(userId),
      title: '🔔 テスト通知 (寺子屋SNS)',
      body: 'Web Push通知が正常に機能しています！この端末で通知を問題なく受信用に設定できました。',
      url: '/?tab=mypage',
      tag: `test_push_${Date.now()}`
    });

    res.json({
      success: true,
      message: `テスト通知を送信しました（成功: ${result.sentCount}台, 失敗: ${result.failureCount}台）`,
      ...result
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
