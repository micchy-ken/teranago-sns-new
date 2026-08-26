import express from 'express';
import path from 'path';
import fs from 'fs';
import net from 'net';
import multer from 'multer';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import { simpleParser } from 'mailparser';
import { createServer as createViteServer } from 'vite';
import { expandRecurringEvents } from './src/utils/recurrenceUtils';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  const dataDir = path.join(process.cwd(), 'data');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // ==========================================
  // Web Push (VAPID) 設定・初期化
  // ==========================================
  const vapidKeysPath = path.join(dataDir, 'vapid-keys.json');
  let vapidKeys: { publicKey: string; privateKey: string };

  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    vapidKeys = {
      publicKey: process.env.VAPID_PUBLIC_KEY,
      privateKey: process.env.VAPID_PRIVATE_KEY
    };
    console.log('[WebPush] VAPID keys loaded from environment variables.');
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
    console.log('[WebPush] VAPID keys loaded. Public Key:', vapidKeys.publicKey);
  } catch (e) {
    console.error('[WebPush] Failed to set VAPID details:', e);
  }

  // Push Subscription 保存管理
  const subscriptionsPath = path.join(dataDir, 'push-subscriptions.json');
  interface StoredSubscription {
    id: string;
    userId: string;
    subscription: webpush.PushSubscription;
    userAgent?: string;
    createdAt: string;
    lastActiveAt: string;
  }

  function loadSubscriptions(): StoredSubscription[] {
    if (!fs.existsSync(subscriptionsPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(subscriptionsPath, 'utf8'));
    } catch (e) {
      return [];
    }
  }

  function saveSubscriptions(subs: StoredSubscription[]) {
    try {
      fs.writeFileSync(subscriptionsPath, JSON.stringify(subs, null, 2), 'utf8');
    } catch (e) {
      console.error('[WebPush] Failed to save subscriptions:', e);
    }
  }

  // Push通知送信ヘルパー関数 (高優先度 & 確実な配信)
  async function sendPushNotificationToUser(params: {
    targetUserId?: string;
    targetUserIds?: string[];
    excludeUserId?: string;
    title: string;
    body: string;
    icon?: string;
    badge?: string;
    url?: string;
    data?: any;
    tag?: string;
    requireInteraction?: boolean;
    renotify?: boolean;
    silent?: boolean;
  }) {
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
    let targets: StoredSubscription[] = [];

    if (targetUserId === 'all') {
      targets = allSubs.filter(s => !excludeUserId || s.userId !== String(excludeUserId));
    } else if (Array.isArray(targetUserIds) && targetUserIds.length > 0) {
      const idSet = new Set(targetUserIds.map(String));
      targets = allSubs.filter(s => idSet.has(s.userId) && (!excludeUserId || s.userId !== String(excludeUserId)));
    } else if (targetUserId) {
      targets = allSubs.filter(s => s.userId === String(targetUserId));
    }

    if (targets.length === 0) return { sentCount: 0, failureCount: 0, totalTargets: 0 };

    const notificationTag = tag || `notif_${Date.now()}`;
    const payload = JSON.stringify({
      title,
      body,
      icon,
      badge,
      url,
      data: {
        ...data,
        url
      },
      tag: notificationTag,
      requireInteraction,
      renotify,
      silent
    });

    const staleEndpoints: string[] = [];
    let sentCount = 0;
    let failureCount = 0;

    // Web Push標準オプション (高優先度、24時間TTL、トピック集約)
    const pushOptions: webpush.RequestOptions = {
      TTL: 86400, // 24時間保持 (オフライン復帰時にも確実に配信)
      urgency: 'high', // 最高優先度
      topic: notificationTag.replace(/[^a-zA-Z0-9_-]/g, '').substring(0, 32) || undefined
    };

    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, payload, pushOptions);
          sentCount++;
        } catch (err: any) {
          failureCount++;
          console.error(`[WebPush] Push failed for user ${sub.userId}:`, err.statusCode || err.message);
          if (err.statusCode === 404 || err.statusCode === 410) {
            staleEndpoints.push(sub.subscription.endpoint);
          }
        }
      })
    );

    if (staleEndpoints.length > 0) {
      const remainingSubs = allSubs.filter(s => !staleEndpoints.includes(s.subscription.endpoint));
      saveSubscriptions(remainingSubs);
      console.log(`[WebPush] Pruned ${staleEndpoints.length} stale subscriptions.`);
    }

    return { sentCount, failureCount, totalTargets: targets.length };
  }

  // ==========================================
  // Web Push API エンドポイント
  // ==========================================

  // VAPID公開鍵取得
  app.get('/api/push/vapid-public-key', (req, res) => {
    res.json({ publicKey: vapidKeys.publicKey });
  });

  // Service Worker ファイルの明示的サーブ (/sw.js)
  app.get('/sw.js', (req, res) => {
    res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    res.setHeader('Service-Worker-Allowed', '/');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    const swPath = path.join(process.cwd(), 'public', 'sw.js');
    if (fs.existsSync(swPath)) {
      res.sendFile(swPath);
    } else {
      res.status(404).send('// Service Worker file not found');
    }
  });

  // 端末のPush通知購読登録
  app.post('/api/push/subscribe', (req, res) => {
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
    } catch (err: any) {
      console.error('[WebPush] Subscribe error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 端末のPush通知購読解除
  app.post('/api/push/unsubscribe', (req, res) => {
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
    } catch (err: any) {
      console.error('[WebPush] Unsubscribe error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ユーザーの通知購読状態確認
  app.get('/api/push/status/:userId', (req, res) => {
    try {
      const userId = String(req.params.userId);
      const allSubs = loadSubscriptions();
      const userSubs = allSubs.filter(s => s.userId === userId);
      res.json({
        isSubscribed: userSubs.length > 0,
        subscriptionCount: userSubs.length
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // プッシュ通知送信 API
  app.post('/api/push/send', async (req, res) => {
    try {
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
        requireInteraction,
        renotify,
        silent
      } = req.body;

      if (!title || !body) {
        return res.status(400).json({ error: 'タイトルと本文は必須です。' });
      }

      const result = await sendPushNotificationToUser({
        targetUserId,
        targetUserIds,
        excludeUserId,
        title,
        body,
        icon,
        badge,
        url,
        data,
        tag,
        requireInteraction,
        renotify,
        silent
      });

      res.json({
        success: true,
        sentCount: result.sentCount,
        failureCount: result.failureCount,
        totalTargets: result.totalTargets
      });
    } catch (err: any) {
      console.error('[WebPush] Send notification error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // テスト通知送信 API
  app.post('/api/push/test', async (req, res) => {
    try {
      const { userId } = req.body;
      if (!userId) {
        return res.status(400).json({ error: 'ユーザーIDが必要です。' });
      }

      const allSubs = loadSubscriptions();
      const targets = allSubs.filter(s => s.userId === String(userId));

      if (targets.length === 0) {
        return res.status(404).json({
          error: 'このユーザーに登録された通知先端末が見つかりません。まず「通知を有効にする」を実行してください。'
        });
      }

      const payload = JSON.stringify({
        title: '🎉 Web Push通知テスト',
        body: 'スマートフォンへのプッシュ通知連携が正常に動作しています！',
        icon: '/icon.svg',
        badge: '/icon.svg',
        url: '/',
        tag: 'test-notification',
        renotify: true
      });

      let sentCount = 0;
      const staleEndpoints: string[] = [];

      await Promise.all(
        targets.map(async (sub) => {
          try {
            await webpush.sendNotification(sub.subscription, payload);
            sentCount++;
          } catch (err: any) {
            console.error(`[WebPush] Test push error:`, err.statusCode || err.message);
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

      res.json({
        success: true,
        message: `${sentCount}台の端末にテスト通知を送信しました。`,
        sentCount
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // SMTP メール通知設定・送信処理
  // ==========================================
  const smtpConfig = {
    host: process.env.SMTP_HOST || '111.89.134.68',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER || 'nagoya-soumu2',
      pass: process.env.SMTP_PASS || 'km5WitaN'
    },
    tls: {
      rejectUnauthorized: false
    }
  };

  const smtpFromEmail = process.env.SMTP_FROM_EMAIL || 'nagoya-soumu2@teraoka-ads.co.jp';
  const smtpFromName = process.env.SMTP_FROM_NAME || 'Aipo送信用（このメールには返信できません）';
  const smtpFromFormatted = `"${smtpFromName}" <${smtpFromEmail}>`;

  async function sendEmailNotification(options: {
    to: string | string[];
    subject: string;
    text?: string;
    html?: string;
  }) {
    if (!options.to || (Array.isArray(options.to) && options.to.length === 0)) {
      throw new Error('送信先メールアドレスが指定されていません。');
    }

    const transporter = nodemailer.createTransport(smtpConfig);
    const mailOptions = {
      from: smtpFromFormatted,
      to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
      subject: options.subject,
      text: options.text || '',
      html: options.html || (options.text ? `<p style="white-space: pre-wrap;">${options.text}</p>` : '')
    };

    const info = await transporter.sendMail(mailOptions);
    console.log('[Email] Notification sent successfully:', info.messageId, 'to:', options.to);
    return info;
  }

  // SMTP / POP3 メールサーバー設定情報取得 API
  app.get(['/api/email/config', '/api/email/config/'], (req, res) => {
    res.json({
      host: smtpConfig.host,
      port: smtpConfig.port,
      secure: smtpConfig.secure,
      user: smtpConfig.auth.user,
      fromEmail: smtpFromEmail,
      fromName: smtpFromName,
      isConfigured: !!(smtpConfig.host && smtpConfig.auth.user),
      inbound: {
        host: pop3Config.host,
        port: pop3Config.port,
        secure: pop3Config.secure,
        user: pop3Config.user,
        defaultTag: pop3Config.defaultTag,
        deleteAfterImport: pop3Config.deleteAfterImport,
        checkIntervalSec: pop3Config.checkIntervalSec,
        status: pop3State.lastCheckStatus,
        lastCheckedAt: pop3State.lastCheckedAt,
        totalImportedCount: pop3State.totalImportedCount
      }
    });
  });

  // 汎用メール送信 API (GET / POST 両対応)
  app.all(['/api/email/send', '/api/email/send/'], async (req, res) => {
    try {
      const to = req.body?.to || req.query?.to;
      const subject = req.body?.subject || req.query?.subject;
      const text = req.body?.text || req.query?.text;
      const html = req.body?.html || req.query?.html;

      if (!to || !subject) {
        return res.status(400).json({ error: '宛先 (to) および件名 (subject) は必須です。POST (JSON) または GET (?to=...&subject=...) で送信してください。' });
      }
      const info = await sendEmailNotification({ to, subject, text, html });
      res.json({ success: true, messageId: info.messageId, message: 'メールを正常に送信しました。' });
    } catch (err: any) {
      console.error('[Email] Send error:', err);
      res.status(500).json({ error: err.message || 'メールの送信に失敗しました。' });
    }
  });

  // テストメール送信 API (GET / POST 両対応)
  app.all(['/api/email/test', '/api/email/test/'], async (req, res) => {
    try {
      const to = req.body?.to || req.query?.to;
      const recipientName = req.body?.recipientName || req.query?.recipientName;
      const targetUser = req.body?.targetUser || req.query?.targetUser;

      if (!to) {
        return res.status(400).json({
          error: '送信先のメールアドレスを指定してください。',
          usage: 'POST (JSON: { "to": "user@example.com" }) または GET (?to=user@example.com) でアクセス可能です。'
        });
      }

      const nameStr = recipientName ? `${recipientName} 様` : (targetUser?.name ? `${targetUser.name} 様` : '管理者 様');
      const nowStr = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

      const subject = '【テストメール】寺岡オートドアSNS メール通知連携テスト';
      const text = `${nameStr}\n\n寺岡オートドアSNS からのメール通知送信テストです。\n本メールを受信できている場合、SMTPメール通知機能（${smtpConfig.host}:${smtpConfig.port}）の設定および連携は正常に機能しています。\n\n送信日時: ${nowStr}\n差出人: ${smtpFromFormatted}\n送信先: ${to}`;
      const html = `
        <div style="font-family: sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
          <div style="background-color: #2563eb; color: #ffffff; padding: 12px 16px; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 600;">📧 寺岡オートドアSNS メール通知テスト</h2>
          </div>
          <p style="font-size: 15px; font-weight: 600; color: #0f172a;">${nameStr}</p>
          <p>寺岡オートドアSNSシステムからのテストメール送信通知です。</p>
          <p>このメールが届いている場合、設定されたSMTPメールサーバー（<b>${smtpConfig.host}:${smtpConfig.port}</b>）との連携は正常に完了しています。</p>
          <div style="background-color: #f8fafc; padding: 16px; border-radius: 8px; border: 1px solid #f1f5f9; margin: 20px 0;">
            <p style="margin: 0 0 8px 0; font-size: 13px; font-weight: 600; color: #475569;">【通信設定詳細】</p>
            <ul style="margin: 0; padding-left: 20px; font-size: 13px; color: #64748b;">
              <li><b>送信日時:</b> ${nowStr}</li>
              <li><b>SMTP サーバー:</b> ${smtpConfig.host}:${smtpConfig.port} (認証ユーザー: ${smtpConfig.auth.user})</li>
              <li><b>差出人アドレス:</b> ${smtpFromFormatted}</li>
              <li><b>テスト送信先:</b> ${to}</li>
            </ul>
          </div>
          <p style="font-size: 12px; color: #94a3b8; margin-bottom: 0;">※本メールはシステムテスト目的で自動配信されています。返信はできません。</p>
        </div>
      `;

      const info = await sendEmailNotification({ to, subject, text, html });
      res.json({
        success: true,
        messageId: info.messageId,
        message: `${to} へテストメールを正常に送信しました。`
      });
    } catch (err: any) {
      console.error('[Email] Test email error:', err);
      res.status(500).json({ error: err.message || 'テストメールの送信に失敗しました。' });
    }
  });

  // 外部ファイル（NAS共有用）ストレージディレクトリ
  const externalFilesDir = path.join(process.cwd(), 'data', 'external-files');
  if (!fs.existsSync(externalFilesDir)) {
    fs.mkdirSync(externalFilesDir, { recursive: true });
  }

  // 掲示板添付ファイル用ストレージディレクトリ（/app/bulletinsfiles または ./bulletinsfiles）
  const bulletinsFilesDir = process.env.BULLETINS_FILES_DIR ||
    (fs.existsSync('/app/bulletinsfiles') ? '/app/bulletinsfiles' : path.join(process.cwd(), 'bulletinsfiles'));

  if (!fs.existsSync(bulletinsFilesDir)) {
    try {
      fs.mkdirSync(bulletinsFilesDir, { recursive: true });
    } catch (e) {
      console.error('掲示板添付用ディレクトリの作成に失敗しました:', e);
    }
  }

  // 静的ファイル配信
  const publicDir = path.join(process.cwd(), 'public');
  app.use('/public', express.static(publicDir, { maxAge: '1d' }));
  app.use('/external-files', express.static(externalFilesDir));
  app.use('/bulletinsfiles', express.static(bulletinsFilesDir));
  app.use('/api/bulletinsfiles', express.static(bulletinsFilesDir));

  // PWA・静的アイコン・マニフェスト等の明示的エンドポイント（開発/本番問わずバイナリとして確実に返却）
  const publicStaticFiles = ['pwa-192x192.png', 'pwa-512x512.png', 'icon.svg', 'manifest.json'];
  publicStaticFiles.forEach(fileName => {
    const handleStaticAsset = (req: express.Request, res: express.Response) => {
      const filePath = path.join(publicDir, fileName);
      if (fs.existsSync(filePath)) {
        if (fileName.endsWith('.png')) {
          res.setHeader('Content-Type', 'image/png');
        } else if (fileName.endsWith('.svg')) {
          res.setHeader('Content-Type', 'image/svg+xml');
        } else if (fileName.endsWith('.json')) {
          res.setHeader('Content-Type', 'application/manifest+json; charset=utf-8');
        }
        res.setHeader('Cache-Control', 'public, max-age=86400');
        if (req.query.download === '1') {
          return res.download(filePath, fileName);
        }
        res.sendFile(filePath);
      } else {
        res.status(404).send('Not found');
      }
    };
    app.get(`/${fileName}`, handleStaticAsset);
    app.get(`/public/${fileName}`, handleStaticAsset);
    app.get(`/teranago-sns-new/${fileName}`, handleStaticAsset);
    app.get(`/teranago-sns-new/public/${fileName}`, handleStaticAsset);
  });

  // 公開ファイル直接ダウンロード用 API
  app.get('/api/public-files/download/:filename', (req, res) => {
    const fileName = path.basename(req.params.filename);
    const filePath = path.join(publicDir, fileName);
    if (fs.existsSync(filePath)) {
      res.download(filePath, fileName);
    } else {
      res.status(404).json({ error: 'ファイルが見つかりません' });
    }
  });

  // ==========================================
  // 掲示板添付ファイルアップロード API (/app/bulletinsfiles へ保存)
  // ==========================================
  const bulletinsStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      if (!fs.existsSync(bulletinsFilesDir)) {
        fs.mkdirSync(bulletinsFilesDir, { recursive: true });
      }
      cb(null, bulletinsFilesDir);
    },
    filename: function (req, file, cb) {
      let originalName = file.originalname;
      try {
        originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch (e) {
        originalName = file.originalname;
      }
      const ext = path.extname(originalName);
      const baseName = path.basename(originalName, ext);
      const timeStamp = Date.now();
      const safeFilename = `${timeStamp}_${baseName}${ext}`;
      cb(null, safeFilename);
    }
  });
  const uploadBulletins = multer({ storage: bulletinsStorage });

  const handleBulletinUpload = (req: express.Request, res: express.Response) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ファイルが選択されていません。' });
      }
      const fileUrl = `/bulletinsfiles/${encodeURIComponent(req.file.filename)}`;
      res.json({
        message: 'アップロード成功',
        url: fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  };

  app.post('/api/upload', uploadBulletins.single('file'), handleBulletinUpload);
  app.post('/api/bulletins/upload', uploadBulletins.single('file'), handleBulletinUpload);

  // 掲示板添付ファイル一覧取得 API
  app.get('/api/bulletinsfiles/list', (req, res) => {
    try {
      if (!fs.existsSync(bulletinsFilesDir)) {
        return res.json([]);
      }
      const filenames = fs.readdirSync(bulletinsFilesDir);
      const result = filenames.map(filename => {
        const filePath = path.join(bulletinsFilesDir, filename);
        let stat;
        try {
          stat = fs.statSync(filePath);
        } catch (e) {
          return null;
        }
        if (stat.isDirectory()) return null;

        const ext = path.extname(filename).toLowerCase().replace('.', '');
        // ファイル名からタイムスタンプ接頭辞(例: 172345678_元ファイル名.pdf)を取り除いた表示用ファイル名
        const displayName = filename.includes('_') ? filename.substring(filename.indexOf('_') + 1) : filename;

        return {
          name: displayName,
          rawFilename: filename,
          path: filename,
          url: `/bulletinsfiles/${encodeURIComponent(filename)}`,
          size: stat.size,
          mtime: stat.mtime.toISOString(),
          isDirectory: false,
          extension: ext,
          source: 'bulletin'
        };
      }).filter(Boolean);

      // 新しい順にソート
      result.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());

      res.json(result);
    } catch (err: any) {
      console.error('掲示板添付ファイル一覧取得エラー:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/bulletins/file/:filename', (req, res) => {
    try {
      const filename = decodeURIComponent(req.params.filename);
      const safePath = path.join(bulletinsFilesDir, path.basename(filename));
      if (fs.existsSync(safePath)) {
        if (req.query.download === '1') {
          return res.download(safePath, filename);
        }
        res.sendFile(safePath);
      } else {
        res.status(404).json({ error: '添付ファイルが見つかりません' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 掲示板添付ファイルの削除 API
  app.delete('/api/bulletins/file', (req, res) => {
    try {
      const fileUrl = (req.query.fileUrl || req.body?.fileUrl || '') as string;
      const filenameParam = (req.query.filename || req.body?.filename || '') as string;

      let filename = filenameParam;
      if (!filename && fileUrl) {
        const urlParts = fileUrl.split('/bulletinsfiles/');
        if (urlParts.length > 1) {
          filename = decodeURIComponent(urlParts[urlParts.length - 1].split('?')[0]);
        } else {
          filename = path.basename(fileUrl.split('?')[0]);
        }
      }

      if (!filename) {
        return res.status(400).json({ error: 'ファイル名が指定されていません。' });
      }

      const safeFilename = path.basename(filename);
      const targetPath = path.join(bulletinsFilesDir, safeFilename);

      if (fs.existsSync(targetPath)) {
        fs.unlinkSync(targetPath);
        console.log(`[Bulletins] 添付ファイルを削除しました: ${targetPath}`);
        return res.json({ message: '添付ファイルを削除しました', filename: safeFilename });
      } else {
        return res.status(404).json({ error: '対象の添付ファイルが存在しません', filename: safeFilename });
      }
    } catch (err: any) {
      console.error('添付ファイル削除エラー:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 掲示板添付ファイルの一括削除 API
  app.post('/api/bulletins/delete-multiple', (req, res) => {
    try {
      const fileUrls: string[] = req.body?.fileUrls || [];
      const deleted: string[] = [];
      const errors: string[] = [];

      fileUrls.forEach(fileUrl => {
        if (!fileUrl) return;
        let filename = '';
        const urlParts = fileUrl.split('/bulletinsfiles/');
        if (urlParts.length > 1) {
          filename = decodeURIComponent(urlParts[urlParts.length - 1].split('?')[0]);
        } else {
          filename = path.basename(fileUrl.split('?')[0]);
        }

        if (filename) {
          const safeFilename = path.basename(filename);
          const targetPath = path.join(bulletinsFilesDir, safeFilename);
          if (fs.existsSync(targetPath)) {
            try {
              fs.unlinkSync(targetPath);
              deleted.push(safeFilename);
            } catch (e: any) {
              errors.push(`${safeFilename}: ${e.message}`);
            }
          }
        }
      });

      res.json({ message: '添付ファイル一括削除完了', deleted, errors });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 外部NAS同期・外部ファイル連携用 API
  // ==========================================
  const externalStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const subDir = typeof req.body.folder === 'string' ? req.body.folder.replace(/\.\./g, '') : '';
      const targetPath = path.join(externalFilesDir, subDir);
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
      cb(null, targetPath);
    },
    filename: function (req, file, cb) {
      let originalName = file.originalname;
      try {
        originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch (e) {
        originalName = file.originalname;
      }
      cb(null, originalName);
    }
  });
  const uploadExternal = multer({ storage: externalStorage });

  app.post('/api/external-files/upload', uploadExternal.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ファイルが選択されていません。' });
      }
      const relPath = req.body.folder ? (req.body.folder + '/' + req.file.filename).replace(/\\/g, '/') : req.file.filename;
      res.json({
        message: 'アップロード完了しました。',
        file: {
          name: req.file.filename,
          path: relPath,
          url: '/api/external-files/serve?path=' + encodeURIComponent(relPath),
          size: req.file.size,
          mtime: new Date().toISOString(),
          isDirectory: false,
          extension: path.extname(req.file.filename).replace('.', '').toLowerCase()
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  function getAllFilesRecursive(dirPath: string, relativeRoot = ""): any[] {
    let results: any[] = [];
    if (!fs.existsSync(dirPath)) return results;
    try {
      const list = fs.readdirSync(dirPath);
      list.forEach((file) => {
        if (file.startsWith('.') || file === '@eaDir' || file === 'thumbs.db') return;
        
        const filePath = path.join(dirPath, file);
        const relPath = relativeRoot ? path.join(relativeRoot, file) : file;
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          results.push({
            name: file,
            path: relPath.replace(/\\/g, '/'),
            size: 0,
            mtime: stat.mtime,
            isDirectory: true,
            extension: ''
          });
          results = results.concat(getAllFilesRecursive(filePath, relPath));
        } else {
          const ext = path.extname(file).replace('.', '').toLowerCase();
          results.push({
            name: file,
            path: relPath.replace(/\\/g, '/'),
            url: '/api/external-files/serve?path=' + encodeURIComponent(relPath.replace(/\\/g, '/')),
            size: stat.size,
            mtime: stat.mtime,
            isDirectory: false,
            extension: ext
          });
        }
      });
    } catch (e) {
      console.error('Error scanning folder:', e);
    }
    return results;
  }

  app.get('/api/external-files/list', (req, res) => {
    try {
      const allFiles = getAllFilesRecursive(externalFilesDir);
      const query = typeof req.query.q === 'string' ? req.query.q.toLowerCase().trim() : '';
      
      if (query) {
        const filtered = allFiles.filter(f => 
          f.name.toLowerCase().includes(query) || 
          f.path.toLowerCase().includes(query)
        );
        return res.json(filtered);
      }
      
      res.json(allFiles);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/external-files/serve', (req, res) => {
    try {
      const targetRelPath = req.query.path;
      if (!targetRelPath || typeof targetRelPath !== 'string') {
        return res.status(400).json({ error: 'ファイルパスが指定されていません' });
      }
      const sanitizedPath = targetRelPath.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '/') {
        return res.status(400).json({ error: '有効なファイルパスが指定されていません' });
      }
      const safePath = path.join(externalFilesDir, sanitizedPath);
      
      if (fs.existsSync(safePath)) {
        const filename = path.basename(safePath);
        if (req.query.download === '1') {
          return res.download(safePath, filename);
        }
        res.sendFile(safePath);
      } else {
        res.status(404).json({ error: 'ファイルが見つかりません' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/external-files/folder', (req, res) => {
    try {
      const { folder } = req.body;
      if (!folder || typeof folder !== 'string') {
        return res.status(400).json({ error: 'フォルダ名が指定されていません' });
      }
      const sanitizedPath = folder.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '/') {
        return res.status(400).json({ error: '有効なフォルダ名が指定されていません' });
      }
      const safePath = path.join(externalFilesDir, sanitizedPath);
      if (!fs.existsSync(safePath)) {
        fs.mkdirSync(safePath, { recursive: true });
        res.json({ message: 'フォルダを作成しました', path: sanitizedPath });
      } else {
        res.status(400).json({ error: '既に同名のフォルダ・ファイルが存在します' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 既読状態保存管理
  const readStatusesPath = path.join(dataDir, 'read-statuses.json');
  interface StoredReadStatus {
    userId: string;
    targetType: 'event' | 'topic' | 'memo' | 'workflow' | 'chat';
    targetId: string;
    readAt: string;
  }

  // ==========================================
  // OGP (Open Graph Protocol) メタデータ取得 API
  // ==========================================
  const ogpCache = new Map<string, { data: any; timestamp: number }>();
  const OGP_CACHE_TTL = 1000 * 60 * 60; // 1時間キャッシュ

  function decodeHtmlEntities(str: string): string {
    return str
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#039;/g, "'")
      .replace(/&#x27;/g, "'")
      .replace(/&nbsp;/g, ' ')
      .replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
      .trim();
  }

  app.get('/api/ogp', async (req, res) => {
    const rawUrl = req.query.url as string;
    if (!rawUrl || typeof rawUrl !== 'string') {
      return res.status(400).json({ error: 'URLが必要です' });
    }

    let targetUrl = rawUrl.trim();
    if (!/^https?:\/\//i.test(targetUrl)) {
      targetUrl = 'https://' + targetUrl;
    }

    // Check cache
    const cached = ogpCache.get(targetUrl);
    if (cached && Date.now() - cached.timestamp < OGP_CACHE_TTL) {
      return res.json(cached.data);
    }

    try {
      const parsedUrl = new URL(targetUrl);
      const hostname = parsedUrl.hostname;

      // Fetch with timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4500);

      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
        },
        redirect: 'follow',
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.includes('text/html') && !contentType.includes('application/xhtml+xml')) {
        const result = {
          url: targetUrl,
          hostname,
          title: hostname,
          description: '',
          image: contentType.startsWith('image/') ? targetUrl : '',
          siteName: hostname,
          favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
        };
        ogpCache.set(targetUrl, { data: result, timestamp: Date.now() });
        return res.json(result);
      }

      const html = await response.text();

      const getMetaContent = (propertyOrName: string) => {
        const regex1 = new RegExp(`<meta[^>]+(?:property|name)=["']${propertyOrName}["'][^>]+content=["']([^"']*)["']`, 'i');
        const regex2 = new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']${propertyOrName}["']`, 'i');
        const match = html.match(regex1) || html.match(regex2);
        return match ? decodeHtmlEntities(match[1]) : '';
      };

      const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
      const rawTitle = getMetaContent('og:title') || getMetaContent('twitter:title') || (titleMatch ? decodeHtmlEntities(titleMatch[1]) : '') || hostname;
      const title = rawTitle.replace(/\s+/g, ' ').trim();

      const description = (getMetaContent('og:description') || getMetaContent('twitter:description') || getMetaContent('description') || '').replace(/\s+/g, ' ').trim();
      
      let image = getMetaContent('og:image:secure_url') || getMetaContent('og:image') || getMetaContent('twitter:image') || '';
      if (image && !/^https?:\/\//i.test(image)) {
        try {
          image = new URL(image, targetUrl).toString();
        } catch {
          // ignore
        }
      }

      const siteName = getMetaContent('og:site_name') || hostname;

      let favicon = '';
      const iconMatch = html.match(/<link[^>]+rel=["'](?:shortcut )?icon["'][^>]+href=["']([^"']*)["']/i) ||
                         html.match(/<link[^>]+href=["']([^"']*)["'][^>]+rel=["'](?:shortcut )?icon["']/i);
      if (iconMatch && iconMatch[1]) {
        try {
          favicon = new URL(iconMatch[1], targetUrl).toString();
        } catch {
          favicon = '';
        }
      }
      if (!favicon) {
        favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`;
      }

      const result = {
        url: targetUrl,
        hostname,
        title,
        description,
        image,
        siteName,
        favicon,
      };

      ogpCache.set(targetUrl, { data: result, timestamp: Date.now() });
      res.json(result);
    } catch (err: any) {
      try {
        const parsedUrl = new URL(targetUrl);
        const fallback = {
          url: targetUrl,
          hostname: parsedUrl.hostname,
          title: parsedUrl.hostname,
          description: '',
          image: '',
          siteName: parsedUrl.hostname,
          favicon: `https://www.google.com/s2/favicons?domain=${parsedUrl.hostname}&sz=64`,
        };
        ogpCache.set(targetUrl, { data: fallback, timestamp: Date.now() });
        return res.json(fallback);
      } catch {
        return res.status(400).json({ error: '無効なURLです' });
      }
    }
  });

  function loadReadStatuses(): StoredReadStatus[] {
    if (!fs.existsSync(readStatusesPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(readStatusesPath, 'utf8'));
    } catch (e) {
      return [];
    }
  }

  function saveReadStatuses(items: StoredReadStatus[]) {
    try {
      fs.writeFileSync(readStatusesPath, JSON.stringify(items, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save read statuses:', e);
    }
  }

  app.get('/api/read-statuses/:userId', (req, res) => {
    try {
      const { userId } = req.params;
      const items = loadReadStatuses();
      const userItems = items.filter((item) => item.userId === userId);

      const readMap: Record<string, string[]> = {
        event: [],
        topic: [],
        memo: [],
        workflow: [],
        chat: [],
        report: [],
      };

      userItems.forEach((row) => {
        if (readMap[row.targetType]) {
          readMap[row.targetType].push(row.targetId);
        }
      });

      res.json(readMap);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/read-statuses', (req, res) => {
    try {
      const { userId, targetType, targetId, isRead } = req.body;
      if (!userId || !targetType || !targetId) {
        return res.status(400).json({ error: 'パラメータが不足しています' });
      }

      let items = loadReadStatuses();
      if (isRead !== false) {
        const exists = items.some((i) => i.userId === userId && i.targetType === targetType && i.targetId === targetId);
        if (!exists) {
          items.push({
            userId,
            targetType,
            targetId,
            readAt: new Date().toISOString(),
          });
          saveReadStatuses(items);
        }
      } else {
        items = items.filter((i) => !(i.userId === userId && i.targetType === targetType && i.targetId === targetId));
        saveReadStatuses(items);
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/external-files', (req, res) => {
    try {
      const targetRelPath = req.query.path;
      if (!targetRelPath || typeof targetRelPath !== 'string') {
        return res.status(400).json({ error: 'ファイルパスが指定されていません' });
      }
      const sanitizedPath = targetRelPath.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
      
      if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '/') {
        return res.status(400).json({ error: 'ルートディレクトリを削除することはできません。' });
      }

      const safePath = path.join(externalFilesDir, sanitizedPath);
      if (path.resolve(safePath) === path.resolve(externalFilesDir)) {
        return res.status(400).json({ error: 'ルートディレクトリを削除することはできません。' });
      }
      
      if (fs.existsSync(safePath)) {
        const stat = fs.statSync(safePath);
        if (stat.isDirectory()) {
          if (typeof fs.rmSync === 'function') {
            fs.rmSync(safePath, { recursive: true, force: true });
          } else {
            fs.rmdirSync(safePath, { recursive: true });
          }
        } else {
          fs.unlinkSync(safePath);
        }
        res.json({ message: '削除に成功しました' });
      } else {
        res.status(404).json({ error: 'ファイルが見つかりません' });
      }
    } catch (err: any) {
      console.error('ファイル削除エラー:', err);
      res.status(500).json({ error: 'ファイル削除処理中にエラーが発生しました: ' + err.message });
    }
  });

  // ==========================================
  // 点検スケジューラー: 下書き保存・自動保存・翌月繰越 API
  // ==========================================
  const inspectionDraftsPath = path.join(dataDir, 'inspection_drafts.json');

  interface StoredInspectionDraft {
    targetYearMonth: string; // 'YYYY-MM'
    items: any[];
    lastSavedAt: string;     // ISO string
    savedByUserId?: string;
    savedByUserName?: string;
  }

  function loadInspectionDrafts(): StoredInspectionDraft[] {
    if (!fs.existsSync(inspectionDraftsPath)) return [];
    try {
      return JSON.parse(fs.readFileSync(inspectionDraftsPath, 'utf8'));
    } catch (e) {
      return [];
    }
  }

  function saveInspectionDrafts(drafts: StoredInspectionDraft[]) {
    try {
      fs.writeFileSync(inspectionDraftsPath, JSON.stringify(drafts, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save inspection drafts:', e);
    }
  }

  function getPreviousYearMonth(yearMonth: string): string {
    const [y, m] = yearMonth.split('-').map(Number);
    if (!y || !m) return '';
    const date = new Date(y, m - 2, 1);
    const prevY = date.getFullYear();
    const prevM = String(date.getMonth() + 1).padStart(2, '0');
    return `${prevY}-${prevM}`;
  }

  // 指定年月の下書き保存状態取得 (クエリ, パス, ヘッダー, フォールバック対応)
  app.get(['/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], (req, res) => {
    try {
      const targetYearMonth = (req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || (req.body && req.body.targetYearMonth) || new Date().toISOString().slice(0, 7)) as string;

      const drafts = loadInspectionDrafts();
      const draft = drafts.find((d) => d.targetYearMonth === targetYearMonth);

      if (!draft) {
        return res.json({
          exists: false,
          targetYearMonth,
          items: [],
          lastSavedAt: null,
          savedByUserId: null,
          savedByUserName: null,
          allAvailableMonths: drafts.map((d) => d.targetYearMonth)
        });
      }

      res.json({
        exists: true,
        targetYearMonth: draft.targetYearMonth,
        items: draft.items || [],
        lastSavedAt: draft.lastSavedAt,
        savedByUserId: draft.savedByUserId,
        savedByUserName: draft.savedByUserName,
        allAvailableMonths: drafts.map((d) => d.targetYearMonth),
        storage: 'file'
      });
    } catch (err: any) {
      console.error('Get inspection draft error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 下書き自動保存・一時保存
  app.post(['/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], (req, res) => {
    try {
      const targetYearMonth = (req.body?.targetYearMonth || req.params?.targetYearMonth || req.query?.targetYearMonth || req.headers['x-target-year-month'] || new Date().toISOString().slice(0, 7)) as string;
      const items = Array.isArray(req.body?.items) ? req.body.items : [];
      const savedByUserId = req.body?.savedByUserId || null;
      const savedByUserName = req.body?.savedByUserName || null;

      const drafts = loadInspectionDrafts();
      const nowIso = req.body?.lastSavedAt || new Date().toISOString();

      const existingIndex = drafts.findIndex((d) => d.targetYearMonth === targetYearMonth);
      const newDraft: StoredInspectionDraft = {
        targetYearMonth,
        items,
        lastSavedAt: nowIso,
        savedByUserId,
        savedByUserName
      };

      if (existingIndex >= 0) {
        drafts[existingIndex] = newDraft;
      } else {
        drafts.push(newDraft);
      }

      saveInspectionDrafts(drafts);

      res.json({
        success: true,
        targetYearMonth,
        itemCount: items.length,
        lastSavedAt: nowIso,
        savedByUserName
      });
    } catch (err: any) {
      console.error('Save inspection draft error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 指定年月の下書きクリア
  app.delete(['/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], (req, res) => {
    try {
      const targetYearMonth = (req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || req.body?.targetYearMonth) as string;
      if (!targetYearMonth) {
        return res.json({ success: true, message: '対象年月なし' });
      }

      let drafts = loadInspectionDrafts();
      drafts = drafts.filter((d) => d.targetYearMonth !== targetYearMonth);
      saveInspectionDrafts(drafts);

      res.json({ success: true, message: `${targetYearMonth} の下書きをクリアしました。` });
    } catch (err: any) {
      console.error('Delete inspection draft error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 前月からの「翌月繰越 (carried_over)」アイテムの自動取得 API
  app.get(['/api/inspection/carry-overs', '/api/inspection/carry-overs/:targetYearMonth'], (req, res) => {
    try {
      const targetYearMonth = (req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || (req.body && req.body.targetYearMonth) || new Date().toISOString().slice(0, 7)) as string;

      const prevMonth = getPreviousYearMonth(targetYearMonth);
      if (!prevMonth) {
        return res.json({ currentMonth: targetYearMonth, prevMonth: '', carriedOverCount: 0, carriedOverItems: [] });
      }

      const drafts = loadInspectionDrafts();
      const prevDraft = drafts.find((d) => d.targetYearMonth === prevMonth);

      if (!prevDraft || !Array.isArray(prevDraft.items)) {
        return res.json({ currentMonth: targetYearMonth, prevMonth, carriedOverCount: 0, carriedOverItems: [] });
      }

      // 前月のアイテムのうち status が 'carried_over' のものを抽出
      const carriedOverItems = prevDraft.items.filter((item: any) => item.status === 'carried_over');

      res.json({
        currentMonth: targetYearMonth,
        prevMonth,
        carriedOverCount: carriedOverItems.length,
        carriedOverItems: carriedOverItems.map((item: any) => ({
          ...item,
          // 当月用としてステータスを pending にリセットし、繰越元年月を記録
          status: 'pending',
          targetYearMonth: targetYearMonth,
          carriedOverFrom: prevMonth,
          assignedDate: undefined,
          assignedStartTime: undefined,
          assignedEndTime: undefined
        }))
      });
    } catch (err: any) {
      console.error('Get carry-over items error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 通知 (Notifications) API & ヘルパー
  // ==========================================
  const notificationsPath = path.join(dataDir, 'notifications.json');

  interface StoredNotification {
    id: string;
    user_id: string; // 通知先ユーザーID
    sender_id?: string; // 通知元・作成者ユーザーID
    type: string; // 'work_report' | 'work_report_submit' | 'work_report_review' | 'workflow' | 'memo' | etc.
    title: string;
    contents?: string;
    target_id?: string; // 関連ID (週報ID等)
    is_read: number; // 0: 未読, 1: 既読 (bit互換)
    created_at: string; // ISO string / datetimeoffset
    // 互換用プロパティ
    userId?: string;
    senderId?: string;
    senderName?: string;
    senderAvatar?: string;
    content?: string;
    targetId?: string;
    isRead?: boolean;
    createdAt?: string;
  }

  function loadNotifications(): StoredNotification[] {
    if (!fs.existsSync(notificationsPath)) {
      return [];
    }
    try {
      return JSON.parse(fs.readFileSync(notificationsPath, 'utf8'));
    } catch (e) {
      return [];
    }
  }

  function saveNotifications(items: StoredNotification[]) {
    try {
      fs.writeFileSync(notificationsPath, JSON.stringify(items, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save notifications:', e);
    }
  }

  function createNotification(payload: {
    user_id: string;
    sender_id?: string;
    type: string;
    title: string;
    contents?: string;
    target_id?: string;
    sender_name?: string;
  }): StoredNotification {
    const list = loadNotifications();
    const nowIso = new Date().toISOString();
    const newNotif: StoredNotification = {
      id: `notif_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      user_id: String(payload.user_id),
      sender_id: payload.sender_id ? String(payload.sender_id) : undefined,
      type: payload.type,
      title: payload.title,
      contents: payload.contents || '',
      target_id: payload.target_id || undefined,
      is_read: 0,
      created_at: nowIso,
      // 互換用
      userId: String(payload.user_id),
      senderId: payload.sender_id ? String(payload.sender_id) : undefined,
      senderName: payload.sender_name,
      content: payload.contents || '',
      targetId: payload.target_id || undefined,
      isRead: false,
      createdAt: nowIso,
    };
    list.unshift(newNotif);
    saveNotifications(list);
    return newNotif;
  }

  // 通知一覧取得 API
  app.get(['/api/notifications', '/api/notifications/:userId'], (req, res) => {
    try {
      let list = loadNotifications();
      const targetUserId = req.params.userId || req.query.userId || req.query.user_id;

      if (targetUserId) {
        list = list.filter(n => (n.user_id === String(targetUserId) || n.userId === String(targetUserId)));
      }

      // 未読優先、作成日時降順
      list.sort((a, b) => {
        const timeA = new Date(a.created_at || a.createdAt || 0).getTime();
        const timeB = new Date(b.created_at || b.createdAt || 0).getTime();
        return timeB - timeA;
      });

      res.json(list.map(n => ({
        ...n,
        userId: n.user_id || n.userId,
        senderId: n.sender_id || n.senderId,
        content: n.contents || n.content,
        targetId: n.target_id || n.targetId,
        isRead: Boolean(n.is_read || n.isRead),
        createdAt: n.created_at || n.createdAt
      })));
    } catch (err: any) {
      console.error('Get notifications error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 通知作成 API
  app.post('/api/notifications', (req, res) => {
    try {
      const data = req.body || {};
      const user_id = data.user_id || data.userId;
      if (!user_id) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      const notif = createNotification({
        user_id,
        sender_id: data.sender_id || data.senderId,
        type: data.type || 'system',
        title: data.title || '通知',
        contents: data.contents || data.content || '',
        target_id: data.target_id || data.targetId,
        sender_name: data.sender_name || data.senderName
      });

      res.status(201).json({ success: true, notification: notif });
    } catch (err: any) {
      console.error('Create notification error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 通知既読化 API
  app.put(['/api/notifications/:id/read', '/api/notifications/:id'], (req, res) => {
    try {
      const { id } = req.params;
      const list = loadNotifications();
      const idx = list.findIndex(n => n.id === id);
      if (idx !== -1) {
        list[idx].is_read = 1;
        list[idx].isRead = true;
        saveNotifications(list);
      }
      res.json({ success: true, message: '既読に更新しました' });
    } catch (err: any) {
      console.error('Mark notification read error:', err);
      res.status(500).json({ error: err.message });
    }
  });
  app.post('/api/notifications/:id/read', (req, res) => {
    try {
      const { id } = req.params;
      const list = loadNotifications();
      const idx = list.findIndex(n => n.id === id);
      if (idx !== -1) {
        list[idx].is_read = 1;
        list[idx].isRead = true;
        saveNotifications(list);
      }
      res.json({ success: true, message: '既読に更新しました' });
    } catch (err: any) {
      console.error('Mark notification read error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 全件既読化 API
  app.post('/api/notifications/mark-all-read', (req, res) => {
    try {
      const targetUserId = req.body?.user_id || req.body?.userId || req.query.userId;
      const list = loadNotifications();
      list.forEach(n => {
        if (!targetUserId || n.user_id === String(targetUserId) || n.userId === String(targetUserId)) {
          n.is_read = 1;
          n.isRead = true;
        }
      });
      saveNotifications(list);
      res.json({ success: true, message: 'すべての通知を既読にしました' });
    } catch (err: any) {
      console.error('Mark all notifications read error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 通知削除 API
  app.delete('/api/notifications/:id', (req, res) => {
    try {
      const { id } = req.params;
      let list = loadNotifications();
      const prevCount = list.length;
      list = list.filter(n => n.id !== id);
      saveNotifications(list);
      res.json({ success: true, deleted: prevCount - list.length });
    } catch (err: any) {
      console.error('Delete notification error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // ユーザー情報・マイ設定 (Users & Preferences) API
  // ==========================================
  const usersPath = path.join(dataDir, 'users.json');

  const defaultInitialUsers = [
    {
      id: 'u1',
      loginId: 'yamamichi',
      password: 'password123',
      name: '山道 健介',
      office: '名古屋支店',
      division: '総務部',
      position: '課長補佐',
      department: '名古屋支店 総務部 課長補佐',
      email: 'yamamichi@teraoka-ads.co.jp',
      mobileEmail: 'yamamichi.mobile@teraoka-ads.co.jp',
      avatarUrl: '',
      isAdmin: true,
      role: 'admin'
    },
    {
      id: 'u2',
      loginId: 'teraoka',
      password: 'password123',
      name: '寺岡 伸悟',
      office: '本社',
      division: '役員',
      position: '代表取締役社長',
      department: '本社 役員 代表取締役社長',
      email: 'teraoka@teraoka-ads.co.jp',
      avatarUrl: '',
      isAdmin: true,
      role: 'admin'
    },
    {
      id: 'u3',
      loginId: 'kato',
      password: 'password123',
      name: '加藤 翼',
      office: '名古屋支店',
      division: '営業部',
      position: '主任',
      department: '名古屋支店 営業部 主任',
      email: 'kato@teraoka-ads.co.jp',
      avatarUrl: '',
      isAdmin: false,
      role: 'user'
    },
    {
      id: 'u4',
      loginId: 'mizuno',
      password: 'password123',
      name: '水野 浩二',
      office: '名古屋支店',
      division: '工務部',
      position: '係長',
      department: '名古屋支店 工務部 係長',
      email: 'mizuno@teraoka-ads.co.jp',
      avatarUrl: '',
      isAdmin: false,
      role: 'user'
    },
    {
      id: 'u5',
      loginId: 'ito',
      password: 'password123',
      name: '伊藤 美咲',
      office: '本社',
      division: '管理部',
      position: '一般',
      department: '本社 管理部 一般',
      email: 'ito@teraoka-ads.co.jp',
      avatarUrl: '',
      isAdmin: false,
      role: 'user'
    },
    {
      id: 'u6',
      loginId: 'suzuki',
      password: 'password123',
      name: '鈴木 大輔',
      office: '静岡営業所',
      division: '営業部',
      position: '所長',
      department: '静岡営業所 営業部 所長',
      email: 'suzuki@teraoka-ads.co.jp',
      avatarUrl: '',
      isAdmin: false,
      role: 'user'
    },
    {
      id: 'u7',
      loginId: 'sato',
      password: 'password123',
      name: '佐藤 雅人',
      office: '三河営業所',
      division: '保守部',
      position: '主任',
      department: '三河営業所 保守部 主任',
      email: 'sato@teraoka-ads.co.jp',
      avatarUrl: '',
      isAdmin: false,
      role: 'user'
    }
  ];

  function loadUsers(): any[] {
    if (!fs.existsSync(usersPath)) {
      try {
        fs.writeFileSync(usersPath, JSON.stringify(defaultInitialUsers, null, 2), 'utf8');
        return defaultInitialUsers;
      } catch (e) {
        return defaultInitialUsers;
      }
    }
    try {
      const data = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
      if (!Array.isArray(data) || data.length === 0) {
        fs.writeFileSync(usersPath, JSON.stringify(defaultInitialUsers, null, 2), 'utf8');
        return defaultInitialUsers;
      }
      return data;
    } catch (e) {
      return defaultInitialUsers;
    }
  }

  function saveUsers(users: any[]) {
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
  }

  // ユーザー一覧取得 API
  app.get(['/api/users', '/api/users/'], (req, res) => {
    try {
      const users = loadUsers();
      res.json(users);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 単一ユーザー取得 API
  app.get('/api/users/:id', (req, res) => {
    try {
      const users = loadUsers();
      const user = users.find((u: any) => u.id === req.params.id);
      if (!user) return res.status(404).json({ error: 'ユーザーが見つかりません' });
      res.json(user);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ユーザー保存・更新 API (POST / PUT)
  app.post(['/api/users', '/api/users/'], (req, res) => {
    try {
      const u = req.body;
      if (!u || !u.id) {
        return res.status(400).json({ error: 'ユーザーIDが必要です' });
      }
      const users = loadUsers();
      const idx = users.findIndex((item: any) => item.id === u.id);
      if (idx >= 0) {
        users[idx] = { ...users[idx], ...u };
      } else {
        users.push(u);
      }
      saveUsers(users);
      res.json({ success: true, user: users[idx >= 0 ? idx : users.length - 1] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put('/api/users/:id', (req, res) => {
    try {
      const u = req.body;
      u.id = req.params.id;
      const users = loadUsers();
      const idx = users.findIndex((item: any) => item.id === u.id);
      if (idx >= 0) {
        users[idx] = { ...users[idx], ...u };
      } else {
        users.push(u);
      }
      saveUsers(users);
      res.json({ success: true, user: users[idx >= 0 ? idx : users.length - 1] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 個人設定・通知設定の保存 API
  app.put('/api/users/:id/preferences', (req, res) => {
    try {
      const userId = req.params.id;
      const preferences = req.body;
      const users = loadUsers();
      const idx = users.findIndex((item: any) => item.id === userId);
      if (idx >= 0) {
        users[idx].preferences = preferences;
        saveUsers(users);
        res.json({ success: true, preferences, message: '個人設定・通知設定を保存しました。' });
      } else {
        const newUser = { id: userId, preferences };
        users.push(newUser);
        saveUsers(users);
        res.json({ success: true, preferences, message: '個人設定・通知設定を保存しました。' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 伝言メモ (Memos) API
  // ==========================================
  const memosPath = path.join(dataDir, 'memos.json');

  function loadMemos(): any[] {
    if (!fs.existsSync(memosPath)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(memosPath, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveMemos(memosList: any[]) {
    try {
      fs.writeFileSync(memosPath, JSON.stringify(memosList, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save memos:', e);
    }
  }

  // 伝言メモ一覧取得
  app.get(['/api/memos', '/api/memos/'], (req, res) => {
    try {
      const memosList = loadMemos();
      res.json(memosList);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 伝言メモ新規作成
  app.post(['/api/memos', '/api/memos/'], (req, res) => {
    try {
      const memosList = loadMemos();
      const newMemo = {
        id: req.body.id || `memo-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        ...req.body,
        createdAt: req.body.createdAt || new Date().toISOString()
      };
      memosList.unshift(newMemo);
      saveMemos(memosList);
      res.status(201).json(newMemo);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 伝言メモ更新（ステータス変更等）
  app.put('/api/memos/:id', (req, res) => {
    try {
      const memoId = req.params.id;
      const memosList = loadMemos();
      const idx = memosList.findIndex((m: any) => String(m.id) === String(memoId));
      if (idx === -1) {
        return res.status(404).json({ error: '伝言メモが見つかりません' });
      }
      memosList[idx] = {
        ...memosList[idx],
        ...req.body,
        updatedAt: new Date().toISOString()
      };
      saveMemos(memosList);
      res.json(memosList[idx]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 伝言メモ削除
  app.delete('/api/memos/:id', (req, res) => {
    try {
      const memoId = req.params.id;
      let memosList = loadMemos();
      const beforeLen = memosList.length;
      memosList = memosList.filter((m: any) => String(m.id) !== String(memoId));
      saveMemos(memosList);
      res.json({ success: true, deletedCount: beforeLen - memosList.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // カレンダー (Events / Calendar) JSON ストレージ & API
  // ==========================================
  const eventsPath = path.join(dataDir, 'events.json');

  function loadEvents(): any[] {
    if (!fs.existsSync(eventsPath)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveEvents(eventsList: any[]) {
    try {
      fs.writeFileSync(eventsPath, JSON.stringify(eventsList, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save events:', e);
    }
  }

  // カレンダー予定一覧取得
  app.get(['/api/events', '/api/events/', '/events', '/events/'], (req, res) => {
    try {
      const list = loadEvents();
      res.json(list);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // カレンダー予定新規作成
  app.post(['/api/events', '/api/events/', '/events', '/events/'], (req, res) => {
    try {
      const list = loadEvents();
      const newEvent = {
        id: req.body.id || `e-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
        ...req.body,
        createdAt: req.body.createdAt || new Date().toISOString()
      };
      list.push(newEvent);
      saveEvents(list);
      res.status(201).json(newEvent);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // カレンダー予定更新
  app.put(['/api/events/:id', '/events/:id'], (req, res) => {
    try {
      const eventId = req.params.id;
      const list = loadEvents();
      const idx = list.findIndex((e: any) => String(e.id) === String(eventId));
      if (idx === -1) {
        const newEv = { id: eventId, ...req.body, updatedAt: new Date().toISOString() };
        list.push(newEv);
        saveEvents(list);
        return res.json(newEv);
      }
      list[idx] = {
        ...list[idx],
        ...req.body,
        updatedAt: new Date().toISOString()
      };
      saveEvents(list);
      res.json(list[idx]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // カレンダー予定削除
  app.delete(['/api/events/:id', '/events/:id'], (req, res) => {
    try {
      const eventId = req.params.id;
      let list = loadEvents();
      list = list.filter((e: any) => String(e.id) !== String(eventId));
      saveEvents(list);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post(['/api/events/:id/delete', '/events/:id/delete'], (req, res) => {
    try {
      const eventId = req.params.id;
      let list = loadEvents();
      list = list.filter((e: any) => String(e.id) !== String(eventId));
      saveEvents(list);
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 掲示板 (Bulletin Board) JSON ストレージ & API
  // ==========================================
  const bulletinsPath = path.join(dataDir, 'bulletins.json');
  const bulletinCommentsPath = path.join(dataDir, 'bulletin_comments.json');
  const bulletinViewersPath = path.join(dataDir, 'bulletin_viewers.json');

  function loadBulletins(): any[] {
    if (!fs.existsSync(bulletinsPath)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(bulletinsPath, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveBulletins(bulletinsList: any[]) {
    try {
      fs.writeFileSync(bulletinsPath, JSON.stringify(bulletinsList, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save bulletins:', e);
    }
  }

  function loadBulletinComments(): any[] {
    if (!fs.existsSync(bulletinCommentsPath)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(bulletinCommentsPath, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveBulletinComments(commentsList: any[]) {
    try {
      fs.writeFileSync(bulletinCommentsPath, JSON.stringify(commentsList, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save bulletin comments:', e);
    }
  }

  function loadBulletinViewers(): any[] {
    if (!fs.existsSync(bulletinViewersPath)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(bulletinViewersPath, 'utf8'));
      return Array.isArray(raw) ? raw : [];
    } catch (e) {
      return [];
    }
  }

  function saveBulletinViewers(viewersList: any[]) {
    try {
      fs.writeFileSync(bulletinViewersPath, JSON.stringify(viewersList, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save bulletin viewers:', e);
    }
  }

  // 掲示板トピック一覧取得 (GET /api/bulletins & /api/board)
  app.get(['/api/bulletins', '/api/bulletins/', '/api/board', '/api/board/'], (req, res) => {
    try {
      const allBulletins = loadBulletins();
      const allComments = loadBulletinComments();
      const allViewers = loadBulletinViewers();

      // 各トピックにコメントと既読者情報をマージ
      const merged = allBulletins.map((topic: any) => {
        const topicComments = allComments.filter((c: any) => String(c.topicId || c.topic_id) === String(topic.id));
        const topicViewers = allViewers.filter((v: any) => String(v.topicId || v.topic_id) === String(topic.id));
        return {
          ...topic,
          comments: topicComments,
          commentsCount: topicComments.length,
          viewers: topicViewers
        };
      });

      res.json(merged);
    } catch (err: any) {
      console.error('Failed to get bulletins:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 掲示板トピック新規作成 (POST /api/bulletins & /api/board)
  app.post(['/api/bulletins', '/api/bulletins/', '/api/board', '/api/board/'], async (req, res) => {
    try {
      const bulletinsList = loadBulletins();
      const nowIso = new Date().toISOString();
      const newTopic = {
        id: req.body.id || `topic-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        title: req.body.title || '（無題）',
        content: req.body.content || '',
        category: req.body.category || 'general',
        tags: Array.isArray(req.body.tags) ? req.body.tags : (req.body.tags ? [req.body.tags] : []),
        office: req.body.office || '全社',
        division: req.body.division || '全部署',
        scope: req.body.scope || '全社',
        author: req.body.author || { id: 'unknown', name: '匿名' },
        attachments: req.body.attachments || [],
        hasPeriod: !!req.body.hasPeriod,
        startDate: req.body.startDate || null,
        endDate: req.body.endDate || null,
        isPinned: !!req.body.isPinned,
        views: 0,
        createdAt: req.body.createdAt || nowIso,
        updatedAt: nowIso
      };

      bulletinsList.unshift(newTopic);
      saveBulletins(bulletinsList);

      // 自動通知作成
      try {
        const authorName = newTopic.author?.name || 'メンバー';
        const allUsers = loadUsers();
        allUsers.forEach((u: any) => {
          if (String(u.id) !== String(newTopic.author?.id)) {
            createNotification({
              user_id: String(u.id),
              type: 'bulletin',
              title: `【掲示板】${authorName}さんが新しいトピックを投稿しました`,
              contents: `${newTopic.title}`,
              sender_id: newTopic.author?.id,
              sender_name: authorName,
              target_id: newTopic.id
            });
          }
        });
      } catch (notifErr) {
        console.warn('Failed to create bulletin notification:', notifErr);
      }

      // Web Push 通知
      try {
        await sendPushNotificationToUser({
          excludeUserId: newTopic.author?.id,
          title: `【掲示板】${newTopic.author?.name || '社員'}さんの新規投稿`,
          body: `${newTopic.title}`,
          url: `/?tab=board&topicId=${newTopic.id}`,
          data: { topicId: newTopic.id, tab: 'board' }
        });
      } catch (pushErr) {}

      res.status(201).json(newTopic);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 掲示板トピック更新 (PUT /api/bulletins/:id & /api/board/:id)
  app.put(['/api/bulletins/:id', '/api/board/:id'], (req, res) => {
    try {
      const topicId = req.params.id;
      const bulletinsList = loadBulletins();
      const idx = bulletinsList.findIndex((t: any) => String(t.id) === String(topicId));
      if (idx === -1) {
        return res.status(404).json({ error: 'トピックが見つかりません' });
      }
      bulletinsList[idx] = {
        ...bulletinsList[idx],
        ...req.body,
        updatedAt: new Date().toISOString()
      };
      saveBulletins(bulletinsList);
      res.json(bulletinsList[idx]);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 掲示板トピック削除 (DELETE /api/bulletins/:id & /api/board/:id)
  app.delete(['/api/bulletins/:id', '/api/board/:id'], (req, res) => {
    try {
      const topicId = req.params.id;
      let bulletinsList = loadBulletins();
      const beforeLen = bulletinsList.length;
      bulletinsList = bulletinsList.filter((t: any) => String(t.id) !== String(topicId));
      saveBulletins(bulletinsList);

      // 関連コメント・既読情報も削除
      let commentsList = loadBulletinComments();
      commentsList = commentsList.filter((c: any) => String(c.topicId || c.topic_id) !== String(topicId));
      saveBulletinComments(commentsList);

      let viewersList = loadBulletinViewers();
      viewersList = viewersList.filter((v: any) => String(v.topicId || v.topic_id) !== String(topicId));
      saveBulletinViewers(viewersList);

      res.json({ success: true, deletedCount: beforeLen - bulletinsList.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 掲示板コメント投稿 (POST /api/bulletins/:id/comments & /api/board/:id/comments)
  app.post(['/api/bulletins/:id/comments', '/api/board/:id/comments'], async (req, res) => {
    try {
      const topicId = req.params.id;
      const commentsList = loadBulletinComments();
      const nowIso = new Date().toISOString();
      const newComment = {
        id: req.body.id || `comment-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        topicId: topicId,
        content: req.body.content || '',
        author: req.body.author || { id: 'unknown', name: '匿名' },
        attachments: req.body.attachments || [],
        createdAt: req.body.createdAt || nowIso
      };

      commentsList.push(newComment);
      saveBulletinComments(commentsList);

      // トピック作成者への通知
      const bulletinsList = loadBulletins();
      const targetTopic = bulletinsList.find((t: any) => String(t.id) === String(topicId));
      if (targetTopic && targetTopic.author?.id && targetTopic.author.id !== newComment.author?.id) {
        try {
          createNotification({
            user_id: String(targetTopic.author.id),
            type: 'bulletin_comment',
            title: `【掲示板】${newComment.author?.name || 'メンバー'}さんがコメントしました`,
            contents: `「${targetTopic.title}」に新しいコメントがあります`,
            sender_id: newComment.author?.id,
            sender_name: newComment.author?.name,
            target_id: String(topicId)
          });
          await sendPushNotificationToUser({
            targetUserId: targetTopic.author.id,
            title: `【掲示板】${newComment.author?.name || '社員'}さんからのコメント`,
            body: `「${targetTopic.title}」に返信がありました。`,
            url: `/?tab=board&topicId=${topicId}`
          });
        } catch (e) {}
      }

      res.status(201).json(newComment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 既読登録 (POST /api/bulletins/:id/viewers & /api/topics/:id/viewers)
  app.post(['/api/bulletins/:id/viewers', '/api/topics/:id/viewers'], (req, res) => {
    try {
      const topicId = req.params.id;
      const user = req.body.user;
      if (!user || !user.id) {
        return res.status(400).json({ error: 'ユーザー情報が必要です' });
      }

      const viewersList = loadBulletinViewers();
      const existingIdx = viewersList.findIndex(
        (v: any) => String(v.topicId || v.topic_id) === String(topicId) && String(v.user?.id || v.userId) === String(user.id)
      );

      const nowIso = new Date().toISOString();
      if (existingIdx >= 0) {
        viewersList[existingIdx].viewedAt = nowIso;
      } else {
        viewersList.push({
          id: `viewer-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          topicId: topicId,
          user: user,
          viewedAt: nowIso
        });
      }
      saveBulletinViewers(viewersList);
      res.json({ success: true, viewersCount: viewersList.filter((v: any) => String(v.topicId || v.topic_id) === String(topicId)).length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // POP3 メール受信・掲示板自動投稿 (Inbound Mail Polling Engine)
  // ==========================================
  const pop3Config = {
    host: process.env.POP3_HOST || process.env.SMTP_HOST || '111.89.134.68',
    port: Number(process.env.POP3_PORT || 110),
    secure: false, // ポート110・セキュリティなし (平文TCP)
    user: process.env.POP3_USER || process.env.SMTP_USER || 'nagoya-soumu2',
    pass: process.env.POP3_PASS || process.env.SMTP_PASS || 'EJ2brys7',
    fromAddress: process.env.SMTP_FROM_EMAIL || 'nagoya-soumu2@teraoka-ads.co.jp',
    deleteAfterImport: process.env.POP3_DELETE_AFTER_IMPORT !== 'false', // サーバーのメールボックス容量圧迫防止のため取り込み後/不要メールを自動削除
    checkIntervalSec: Number(process.env.POP3_CHECK_INTERVAL_SEC || 60), // 60秒ごと自動巡回
    defaultTag: process.env.POP3_DEFAULT_TAG || '社内メール'
  };

  interface Pop3LogEntry {
    timestamp: string;
    type: 'info' | 'success' | 'warn' | 'error';
    message: string;
  }

  const pop3State = {
    isPolling: false,
    lastCheckedAt: null as string | null,
    lastCheckStatus: 'idle' as 'idle' | 'checking' | 'success' | 'error',
    lastCheckMessage: '起動待機中',
    totalImportedCount: 0,
    logs: [] as Pop3LogEntry[]
  };

  function addPop3Log(type: 'info' | 'success' | 'warn' | 'error', message: string) {
    const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    pop3State.logs.unshift({ timestamp, type, message });
    if (pop3State.logs.length > 50) {
      pop3State.logs = pop3State.logs.slice(0, 50);
    }
    console.log(`[POP3 ${type.toUpperCase()}] ${message}`);
  }

  // POP3 Socket クライアント実装
  class Pop3SocketClient {
    private socket: net.Socket | null = null;
    private buffer = '';
    private isMultiline = false;
    private currentResolve: ((res: any) => void) | null = null;
    private currentReject: ((err: any) => void) | null = null;

    async connect(host: string, port: number, timeoutMs = 12000): Promise<string> {
      return new Promise((resolve, reject) => {
        const sock = net.createConnection({ host, port });
        this.socket = sock;
        sock.setTimeout(timeoutMs);

        let initialResolved = false;

        sock.on('connect', () => {});

        sock.on('data', (chunk) => {
          this.buffer += chunk.toString('latin1');
          this.processBuffer();
        });

        sock.on('timeout', () => {
          sock.destroy(new Error(`POP3 接続タイムアウト (${host}:${port})`));
        });

        sock.on('error', (err) => {
          if (!initialResolved) {
            initialResolved = true;
            reject(err);
          } else if (this.currentReject) {
            const r = this.currentReject;
            this.currentReject = null;
            this.currentResolve = null;
            r(err);
          }
        });

        sock.on('close', () => {
          if (this.currentReject) {
            const r = this.currentReject;
            this.currentReject = null;
            this.currentResolve = null;
            r(new Error('POP3 接続が切断されました'));
          }
        });

        this.currentResolve = (greeting: string) => {
          initialResolved = true;
          resolve(greeting);
        };
        this.currentReject = (err: any) => {
          initialResolved = true;
          reject(err);
        };
      });
    }

    private processBuffer() {
      if (!this.currentResolve) return;

      if (this.isMultiline) {
        let termIndex = this.buffer.indexOf('\r\n.\r\n');
        let termLen = 5;
        if (termIndex === -1) {
          termIndex = this.buffer.indexOf('\n.\n');
          termLen = 3;
        }
        if (termIndex === -1 && (this.buffer === '.\r\n' || this.buffer.startsWith('.\r\n'))) {
          termIndex = 0;
          termLen = 3;
        }

        if (termIndex !== -1) {
          const fullContent = this.buffer.slice(0, termIndex);
          this.buffer = this.buffer.slice(termIndex + termLen);
          this.isMultiline = false;

          const lines = fullContent.split(/\r?\n/);
          const header = lines[0] || '';
          const bodyLines = lines.slice(1).map(l => l.startsWith('..') ? l.substring(1) : l);

          const r = this.currentResolve;
          this.currentResolve = null;
          this.currentReject = null;
          r({
            header,
            body: bodyLines,
            raw: Buffer.from(bodyLines.join('\r\n'), 'latin1')
          });
        }
      } else {
        const lineEnd = this.buffer.indexOf('\r\n');
        if (lineEnd !== -1) {
          const line = this.buffer.slice(0, lineEnd);
          this.buffer = this.buffer.slice(lineEnd + 2);

          const r = this.currentResolve;
          this.currentResolve = null;
          this.currentReject = null;
          r(line);
        }
      }
    }

    async sendCommand(cmd: string): Promise<string> {
      if (!this.socket) throw new Error('POP3 ソケットが初期化されていません');
      return new Promise((resolve, reject) => {
        this.isMultiline = false;
        this.currentResolve = (res: string) => {
          if (res && res.startsWith('-ERR')) {
            reject(new Error(`POP3 コマンドエラー (${cmd}): ${res}`));
          } else {
            resolve(res);
          }
        };
        this.currentReject = reject;
        this.socket!.write(cmd + '\r\n');
      });
    }

    async sendMultilineCommand(cmd: string): Promise<{ header: string; body: string[]; raw: Buffer }> {
      if (!this.socket) throw new Error('POP3 ソケットが初期化されていません');
      return new Promise((resolve, reject) => {
        this.isMultiline = true;
        this.currentResolve = (res: { header: string; body: string[]; raw: Buffer }) => {
          if (res.header && res.header.startsWith('-ERR')) {
            reject(new Error(`POP3 コマンドエラー (${cmd}): ${res.header}`));
          } else {
            resolve(res);
          }
        };
        this.currentReject = reject;
        this.socket!.write(cmd + '\r\n');
      });
    }

    close() {
      if (this.socket) {
        try {
          this.socket.destroy();
        } catch (_) {}
        this.socket = null;
      }
    }
  }

  // 送信者アドレスのホワイトリスト判定（登録メンバーのPCメール & 携帯メール & ログインID照合）
  function matchSenderToWhitelist(candidateAddresses: string[], allUsers: any[]): any | null {
    if (!candidateAddresses || candidateAddresses.length === 0) return null;

    for (const rawAddr of candidateAddresses) {
      if (!rawAddr) continue;
      // <user@example.com> などのブラケットや引用符を除去
      const cleanAddr = rawAddr.replace(/[<>\"\'\s]/g, '').trim().toLowerCase();
      if (!cleanAddr) continue;

      const addrUserPart = cleanAddr.split('@')[0] || '';

      // 1. メールアドレス完全一致 (PCメール / 携帯メール)
      const exactMatch = allUsers.find(u => {
        const pc = (u.email || '').replace(/[<>\"\'\s]/g, '').trim().toLowerCase();
        const mobile = (u.mobileEmail || '').replace(/[<>\"\'\s]/g, '').trim().toLowerCase();
        return (pc && pc === cleanAddr) || (mobile && mobile === cleanAddr);
      });
      if (exactMatch) return exactMatch;

      // 2. ユーザー名・ログインID一致 (例: yamamichi@teraoka-ads.co.jp -> loginId: yamamichi)
      if (addrUserPart) {
        const loginMatch = allUsers.find(u => {
          const loginId = (u.loginId || u.username || '').trim().toLowerCase();
          return loginId && loginId === addrUserPart;
        });
        if (loginMatch) return loginMatch;
      }

      // 3. 部分一致 (ヘッダー内の name <address> またはドメイン・ユーザー名一致)
      const partialMatch = allUsers.find(u => {
        const pc = (u.email || '').replace(/[<>\"\'\s]/g, '').trim().toLowerCase();
        const mobile = (u.mobileEmail || '').replace(/[<>\"\'\s]/g, '').trim().toLowerCase();
        return (pc && (cleanAddr.includes(pc) || pc.includes(cleanAddr))) ||
               (mobile && (cleanAddr.includes(mobile) || mobile.includes(cleanAddr)));
      });
      if (partialMatch) return partialMatch;
    }
    return null;
  }

  // MIMEヘッダー文字化け解読・デコードヘルパー
  function decodeMimeHeader(str?: string): string {
    if (!str) return '';
    try {
      let text = str;
      text = text.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, encoding, encText) => {
        try {
          if (encoding.toUpperCase() === 'B') {
            return Buffer.from(encText, 'base64').toString('utf8');
          } else if (encoding.toUpperCase() === 'Q') {
            const qDecoded = encText.replace(/_/g, ' ').replace(/=([0-9A-F]{2})/gi, (__: string, hex: string) =>
              String.fromCharCode(parseInt(hex, 16))
            );
            return Buffer.from(qDecoded, 'latin1').toString('utf8');
          }
        } catch (e) {
          return encText;
        }
        return encText;
      });
      return text.trim();
    } catch (e) {
      return str || '';
    }
  }

  // Content-Typeからの拡張子推定ヘルパー
  function getExtensionFromMimeType(contentType?: string): string {
    if (!contentType) return '.bin';
    const ct = contentType.toLowerCase();
    if (ct.includes('image/jpeg') || ct.includes('image/jpg')) return '.jpg';
    if (ct.includes('image/png')) return '.png';
    if (ct.includes('image/gif')) return '.gif';
    if (ct.includes('image/webp')) return '.webp';
    if (ct.includes('image/svg')) return '.svg';
    if (ct.includes('application/pdf')) return '.pdf';
    if (ct.includes('spreadsheetml') || ct.includes('excel') || ct.includes('xls')) return '.xlsx';
    if (ct.includes('wordprocessingml') || ct.includes('msword') || ct.includes('doc')) return '.docx';
    if (ct.includes('presentationml') || ct.includes('powerpoint') || ct.includes('ppt')) return '.pptx';
    if (ct.includes('text/plain')) return '.txt';
    if (ct.includes('text/csv')) return '.csv';
    if (ct.includes('zip') || ct.includes('compressed')) return '.zip';
    return '.bin';
  }

  // ファイルサイズ整形ヘルパー
  function formatAttachmentSize(bytes: number): string {
    if (!bytes || isNaN(bytes)) return '0 KB';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  // 1通のRawメールをパースして掲示板トピックへ変換・登録
  async function processIncomingEmail(rawEmailBuffer: Buffer): Promise<{ imported: boolean; reason: string; topicId?: string }> {
    try {
      const parsed = await simpleParser(rawEmailBuffer);
      const allUsers = loadUsers();

      // 送信元メールアドレスの候補リストを抽出
      const candidateSenders: string[] = [];
      if (parsed.from?.value) {
        parsed.from.value.forEach(v => {
          if (v.address) candidateSenders.push(v.address);
        });
      }
      if (parsed.from?.text) {
        const matches = parsed.from.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
        if (matches) candidateSenders.push(...matches);
      }
      if (parsed.replyTo?.value) {
        parsed.replyTo.value.forEach(v => {
          if (v.address) candidateSenders.push(v.address);
        });
      }

      // ホワイトリスト照合
      const matchedUser = matchSenderToWhitelist(candidateSenders, allUsers);
      if (!matchedUser) {
        const senderStr = candidateSenders.join(', ') || parsed.from?.text || '不明な送信元';
        addPop3Log('warn', `ホワイトリスト外の送信元 (${senderStr}) からのメールのため、掲示板への掲載をスキップしました。`);
        return { imported: false, reason: `ホワイトリスト外 (${senderStr})` };
      }

      // 添付ファイルの保存処理
      const attachmentsList: any[] = [];
      if (parsed.attachments && parsed.attachments.length > 0) {
        for (let i = 0; i < parsed.attachments.length; i++) {
          const att = parsed.attachments[i];
          try {
            // MIMEヘッダーデコードを適用
            let decodedFilename = decodeMimeHeader(att.filename);
            if (!decodedFilename) {
              decodedFilename = `email_attachment_${Date.now()}_${i}`;
            }

            let ext = path.extname(decodedFilename);
            if (!ext || ext.length > 10 || ext.includes('=')) {
              ext = getExtensionFromMimeType(att.contentType);
              if (!path.extname(decodedFilename)) {
                decodedFilename = `${decodedFilename}${ext}`;
              }
            }

            const cleanBase = path.basename(decodedFilename, ext)
              .replace(/[^a-zA-Z0-9_\-\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\uFF65-\uFF9F\uFF01-\uFF5E]/g, '_') || 'file';
            
            const safeSavedFilename = `${Date.now()}_${i}_${cleanBase}${ext}`;
            const filePath = path.join(bulletinsFilesDir, safeSavedFilename);

            fs.writeFileSync(filePath, att.content);
            attachmentsList.push({
              id: `att_mail_${Date.now()}_${i}`,
              name: decodedFilename,
              size: formatAttachmentSize(att.size || att.content?.length || 0),
              url: `/bulletinsfiles/${encodeURIComponent(safeSavedFilename)}`,
              type: att.contentType || 'application/octet-stream'
            });
          } catch (attErr) {
            console.error('[POP3] 添付ファイル保存エラー:', attErr);
          }
        }
      }

      // 本文の抽出と整形
      const rawText = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, '') : '') || '（本文なし）';
      const mailSubject = (parsed.subject || '（無題の社内メール）').trim();
      const mailDateStr = parsed.date ? new Date(parsed.date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
      const fromDisplay = parsed.from?.text || `${matchedUser.name} <${matchedUser.email || matchedUser.mobileEmail}>`;

      // ─── 本文1行目から特定のタブ（タグ／拠点／部署）の解析 ───
      // メール投稿時のデフォルトは必ず「全社」「全部署」
      let targetOffice = '全社';
      let targetDivision = '全部署';
      const extractedTags = new Set<string>();
      extractedTags.add('社内メール');

      // 登録ユーザー一覧から既知の拠点名・部署名リストを動的に収集
      const knownOffices = new Set<string>(['本社', '名古屋支店', '静岡営業所', '三河営業所', '三重営業所', '岐阜営業所', '東京支店', '大阪支店']);
      const knownDivisions = new Set<string>(['管理', '営業', '設計', '工務', '保守', '総務', '製造', '開発', 'IT', '人事', '経理', '管理部', '営業部', '設計部', '工務部', '保守部', '総務部']);
      allUsers.forEach((u: any) => {
        if (u.office && u.office.trim() && u.office !== '全社') knownOffices.add(u.office.trim());
        if (u.division && u.division.trim() && u.division !== '全部署') knownDivisions.add(u.division.trim());
        if (u.department && u.department.trim() && u.department !== '全部署') knownDivisions.add(u.department.trim());
      });

      // 本文を行ごとに分割し、最初の非空行（1行目）をチェック
      const lines = rawText.split(/\r?\n/);
      let firstLineIndex = -1;
      for (let idx = 0; idx < lines.length; idx++) {
        if (lines[idx].trim().length > 0) {
          firstLineIndex = idx;
          break;
        }
      }

      let isFirstLineHeaderInstruction = false;
      let bodyTextForContent = rawText;

      if (firstLineIndex !== -1) {
        const firstLineRaw = lines[firstLineIndex].trim();

        // 1行目のフォーマットパターンを判定:
        // パターンA: [タブ名/宛先] または 【タブ名/宛先】 または (タブ名/宛先)
        // パターンB: タブ: ○○ / タグ: ○○ / カテゴリ: ○○ / 宛先: ○○ / 拠点: ○○ / 部署: ○○
        // パターンC: #タグ名
        // パターンD: 単一の短いキーワード行（例: "重要", "お知らせ", "保守", "名古屋支店"）
        let extractedDirective = '';
        const bracketMatch = firstLineRaw.match(/^[\[【\(「](.+?)[\]】\)」]$/);
        const prefixMatch = firstLineRaw.match(/^(?:タブ|タグ|カテゴリ|カテゴリー|宛先|対象|公開範囲|拠点|部署|scope)[\s:：]+(.+)$/i);
        const hashMatch = firstLineRaw.match(/^#([^\s#　]+)$/);

        if (bracketMatch) {
          extractedDirective = bracketMatch[1].trim();
          isFirstLineHeaderInstruction = true;
        } else if (prefixMatch) {
          extractedDirective = prefixMatch[1].trim();
          isFirstLineHeaderInstruction = true;
        } else if (hashMatch) {
          extractedDirective = hashMatch[1].trim();
          isFirstLineHeaderInstruction = true;
        } else if (firstLineRaw.length <= 20 && !/[。、!?！？]/.test(firstLineRaw)) {
          // 短い単語1行のみで、既知の拠点・部署・重要タグに合致する場合
          const candidate = firstLineRaw.replace(/^[#＃]/, '').trim();
          const matchOffice = Array.from(knownOffices).find(o => candidate === o || candidate.includes(o));
          const matchDiv = Array.from(knownDivisions).find(d => candidate === d || candidate.includes(d));
          if (matchOffice || matchDiv || ['重要', 'お知らせ', '緊急', '連絡', '社内連絡', '議事録', '保守', '工務', '営業', '総務', 'IT', '人事'].includes(candidate)) {
            extractedDirective = candidate;
            isFirstLineHeaderInstruction = true;
          }
        }

        if (extractedDirective) {
          // 抽出された文字列から拠点、部署、タグを特定
          // 1. 拠点判定
          for (const officeName of Array.from(knownOffices)) {
            if (extractedDirective.includes(officeName)) {
              targetOffice = officeName;
              break;
            }
          }

          // 2. 部署判定
          for (const divName of Array.from(knownDivisions)) {
            if (extractedDirective.includes(divName)) {
              targetDivision = divName;
              break;
            }
          }

          // 3. タグ判定（スラッシュや記号で分割してタグとして登録）
          const tagTokens = extractedDirective
            .split(/[\/\s,、|｜・]+/)
            .map(t => t.replace(/^[#＃\[\]【】\(\)]/, '').trim())
            .filter(Boolean);

          tagTokens.forEach(token => {
            if (token && token !== '全社' && token !== '全部署') {
              extractedTags.add(token);
            }
          });

          // 1行目が明示的な指定行の場合は、本文からその行を除いてすっきり表示
          if (isFirstLineHeaderInstruction) {
            const remainingLines = [...lines];
            remainingLines.splice(firstLineIndex, 1);
            while (remainingLines.length > 0 && remainingLines[0].trim() === '') {
              remainingLines.shift();
            }
            bodyTextForContent = remainingLines.join('\n');
          }
        }
      }

      // 件名および本文からの #ハッシュタグ も抽出
      const tagMatches = `${mailSubject} ${rawText}`.match(/#([^\s#　]+)/g);
      if (tagMatches) {
        tagMatches.forEach(t => {
          const cleanTag = t.replace(/^#/, '').trim();
          if (cleanTag && cleanTag !== '社内メール') {
            extractedTags.add(cleanTag);
          }
        });
      }

      // 本文先頭にメールヘッダー風の分かりやすいヘッダーバナーを付与
      const targetDisplay = (targetOffice === '全社' && targetDivision === '全部署')
        ? '全社 / 全部署'
        : `${targetOffice} / ${targetDivision}`;

      const formattedContent = `${bodyTextForContent}\n\n───────────────\n📧 メール受信情報\n差出人: ${fromDisplay}\n宛先: ${targetDisplay}\n送信日時: ${mailDateStr}\n添付ファイル: ${attachmentsList.length} 件`;

      // 掲示板トピック作成
      const topicId = `topic_mail_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
      const nowIso = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();
      const newTopic = {
        id: topicId,
        title: mailSubject,
        content: formattedContent,
        category: 'general',
        tags: Array.from(extractedTags),
        office: targetOffice,
        division: targetDivision,
        scope: (targetOffice === '全社' && targetDivision === '全部署') ? '全社' : '特定部署',
        authorId: matchedUser.id,
        author_id: matchedUser.id,
        author: {
          id: matchedUser.id,
          name: matchedUser.name,
          department: matchedUser.department || matchedUser.division,
          office: matchedUser.office,
          avatarUrl: matchedUser.avatarUrl || '',
          position: matchedUser.position || ''
        },
        attachments: attachmentsList,
        hasPeriod: false,
        isPinned: false,
        views: 0,
        likes: 0,
        comments: [],
        commentsCount: 0,
        viewers: [],
        createdAt: nowIso,
        created_at: nowIso,
        updatedAt: new Date().toISOString(),
        updated_at: new Date().toISOString()
      };

      const bulletinsList = loadBulletins();
      // 重複登録防止
      if (!bulletinsList.some((b: any) => String(b.id) === String(newTopic.id))) {
        bulletinsList.unshift(newTopic);
        saveBulletins(bulletinsList);
      }

      // ルートの bulletins.json にもフォールバック保存
      try {
        const rootBPath = path.join(process.cwd(), 'bulletins.json');
        let rList = [];
        if (fs.existsSync(rootBPath)) {
          rList = JSON.parse(fs.readFileSync(rootBPath, 'utf8'));
        }
        if (!Array.isArray(rList)) rList = [];
        if (!rList.some((b: any) => String(b.id) === String(newTopic.id))) {
          rList.unshift(newTopic);
          fs.writeFileSync(rootBPath, JSON.stringify(rList, null, 2), 'utf8');
        }
      } catch (_) {}

      pop3State.totalImportedCount++;
      addPop3Log('success', `メールを掲示板へ掲載しました: 「${mailSubject}」（投稿者: ${matchedUser.name}様, 宛先: ${targetDisplay}, タグ: #${Array.from(extractedTags).join(' #')}）`);

      // 社内メンバーへのアプリ内通知 & Web Push
      try {
        const allUsers = loadUsers();
        allUsers.forEach((u: any) => {
          if (String(u.id) !== String(matchedUser.id)) {
            createNotification({
              user_id: String(u.id),
              type: 'bulletin',
              title: `【掲示板】${matchedUser.name}さんからメール投稿がありました`,
              contents: `${mailSubject}`,
              sender_id: matchedUser.id,
              sender_name: matchedUser.name,
              target_id: topicId
            });
          }
        });
      } catch (notifErr) {}

      try {
        await sendPushNotificationToUser({
          excludeUserId: matchedUser.id,
          title: `【掲示板】${matchedUser.name}さんからのメール投稿`,
          body: `${mailSubject}`,
          url: `/?tab=board&topicId=${topicId}`,
          data: { topicId, tab: 'board' }
        });
      } catch (pushErr) {}

      return { imported: true, reason: '成功', topicId };
    } catch (err: any) {
      console.error('[POP3] メールパース・投稿エラー:', err);
      addPop3Log('error', `メールパースエラー: ${err.message}`);
      return { imported: false, reason: `パースエラー: ${err.message}` };
    }
  }

  // POP3 メールボックス巡回・受信実行関数
  let lastPollStartedAt = 0;
  async function pollPop3InboundEmails(): Promise<{ checked: boolean; found: number; imported: number; deleted: number; message: string }> {
    // 30秒以上経過していたらロックを自動解除（安全弁）
    if (pop3State.isPolling && Date.now() - lastPollStartedAt > 30000) {
      console.warn('[POP3] 前回のポーリング処理がタイムアウトしたため、ロックを強制解除しました。');
      pop3State.isPolling = false;
    }

    if (pop3State.isPolling) {
      return { checked: true, found: 0, imported: 0, deleted: 0, message: '現在POP3メール受信巡回を実行中です。数秒後に再確認してください。' };
    }

    pop3State.isPolling = true;
    lastPollStartedAt = Date.now();
    pop3State.lastCheckStatus = 'checking';
    const client = new Pop3SocketClient();

    try {
      addPop3Log('info', `POP3 サーバー (${pop3Config.host}:${pop3Config.port}) への接続を開始します (ユーザー: ${pop3Config.user})...`);
      
      await client.connect(pop3Config.host, pop3Config.port, 12000);
      await client.sendCommand(`USER ${pop3Config.user}`);
      await client.sendCommand(`PASS ${pop3Config.pass}`);

      // メール件数確認 (STAT)
      const statRes = await client.sendCommand('STAT');
      const statParts = statRes.split(' ');
      const msgCount = parseInt(statParts[1] || '0', 10);

      pop3State.lastCheckedAt = new Date().toISOString();

      if (msgCount === 0) {
        await client.sendCommand('QUIT');
        client.close();
        pop3State.lastCheckStatus = 'success';
        pop3State.lastCheckMessage = '新着メールはありません (0 件)';
        return { checked: true, found: 0, imported: 0, deleted: 0, message: '新着メールはありません (0 件)' };
      }

      addPop3Log('info', `POP3 サーバー上に ${msgCount} 件の未処理メールを検出しました。受信・解析を開始します。`);

      let importedCount = 0;
      let deletedCount = 0;

      for (let i = 1; i <= msgCount; i++) {
        try {
          const retrRes = await client.sendMultilineCommand(`RETR ${i}`);
          const res = await processIncomingEmail(retrRes.raw);
          if (res.imported) {
            importedCount++;
          }

          // 掲示板取り込み後、またはホワイトリスト外のスパムメールはサーバー容量圧迫を防ぐため削除
          if (pop3Config.deleteAfterImport) {
            await client.sendCommand(`DELE ${i}`);
            deletedCount++;
          }
        } catch (msgErr: any) {
          addPop3Log('error', `メール #${i} の取得エラー: ${msgErr.message}`);
        }
      }

      // QUIT でサーバー側の削除を確定して切断
      await client.sendCommand('QUIT');
      client.close();

      pop3State.lastCheckStatus = 'success';
      const summaryMsg = `受信完了: 検出 ${msgCount} 件, 掲示板掲載 ${importedCount} 件, サーバー削除 ${deletedCount} 件`;
      pop3State.lastCheckMessage = summaryMsg;
      addPop3Log('success', summaryMsg);

      return { checked: true, found: msgCount, imported: importedCount, deleted: deletedCount, message: summaryMsg };
    } catch (err: any) {
      client.close();
      pop3State.lastCheckedAt = new Date().toISOString();
      pop3State.lastCheckStatus = 'error';
      const errMsg = `POP3 接続・受信エラー: ${err.message}`;
      pop3State.lastCheckMessage = errMsg;
      addPop3Log('error', errMsg);
      return { checked: true, found: 0, imported: 0, deleted: 0, message: errMsg };
    } finally {
      pop3State.isPolling = false;
    }
  }

  // POP3 定期ポーリングタイマー (60秒間隔)
  if (pop3Config.checkIntervalSec > 0) {
    setInterval(() => {
      pollPop3InboundEmails().catch(e => {
        console.error('[POP3 Background Interval Error]', e);
      });
    }, pop3Config.checkIntervalSec * 1000);
    console.log(`[POP3] Background inbound mail worker started (Interval: ${pop3Config.checkIntervalSec}s, Host: ${pop3Config.host}:${pop3Config.port})`);
  }

  // POP3 稼働状況・設定取得 API
  app.get(['/api/email/inbound/status', '/api/email/inbound/status/'], (req, res) => {
    const allUsers = loadUsers();
    const whitelistUsers = allUsers.filter(u => !!(u.email?.trim() || u.mobileEmail?.trim()));
    res.json({
      config: {
        host: pop3Config.host,
        port: pop3Config.port,
        secure: pop3Config.secure,
        user: pop3Config.user,
        fromAddress: pop3Config.fromAddress,
        deleteAfterImport: pop3Config.deleteAfterImport,
        checkIntervalSec: pop3Config.checkIntervalSec,
        defaultTag: pop3Config.defaultTag
      },
      whitelist: {
        totalMembers: allUsers.length,
        whitelistedMembersCount: whitelistUsers.length,
        members: whitelistUsers.map(u => ({
          id: u.id,
          name: u.name,
          department: u.department || u.division,
          email: u.email,
          mobileEmail: u.mobileEmail
        }))
      },
      state: pop3State
    });
  });

  // POP3 即時メール受信実行 API
  app.post(['/api/email/inbound/check-now', '/api/email/inbound/check-now/'], async (req, res) => {
    try {
      const result = await pollPop3InboundEmails();
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POP3 メール投稿テスト・シミュレーター API
  app.post(['/api/email/inbound/simulate', '/api/email/inbound/simulate/'], async (req, res) => {
    try {
      const senderEmail = req.body.senderEmail || req.body.from;
      const subject = req.body.subject || '【連絡】社内メールからのテスト投稿';
      const body = req.body.body || req.body.text || '社内メール受信連携のテスト投稿です。';

      if (!senderEmail) {
        return res.status(400).json({ error: '送信者メールアドレス (senderEmail) を指定してください。' });
      }

      // RFC822 形式の擬似メールバッファを作成
      const mockRawEmail = [
        `From: "テスト送信者" <${senderEmail}>`,
        `To: <${pop3Config.fromAddress}>`,
        `Subject: ${subject}`,
        `Date: ${new Date().toUTCString()}`,
        `Message-ID: <simulated-${Date.now()}@teraoka-ads.co.jp>`,
        `Content-Type: text/plain; charset=utf-8`,
        ``,
        body
      ].join('\r\n');

      const processRes = await processIncomingEmail(Buffer.from(mockRawEmail, 'utf8'));
      res.json({
        success: processRes.imported,
        message: processRes.imported ? 'テストメールを掲示板へ正常に投稿しました。' : `投稿スキップ: ${processRes.reason}`,
        details: processRes
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // 日報・週報 (Work Reports / Daily Reports) API
  // ==========================================
  const workReportsPath = path.join(dataDir, 'work_reports.json');

  interface StoredWorkReport {
    id: string;
    // 新カラム定義 (WorkReports テーブル仕様)
    author_id: string;
    supervisor_id?: string;
    week_start_date?: string; // YYYY-MM-DD
    week_label?: string; // e.g. '2026年8月17日週'
    tasks: string;
    achievements?: string;
    issues?: string;
    continued_items?: string;
    next_week_plans?: string;
    status: 'draft' | 'submitted' | 'reviewed';
    review_feedback?: string;
    reviewed_at?: string;
    createdAt: string;
    updated_at?: string;
    // 互換性用プロパティ
    authorId?: string;
    authorName?: string;
    authorDepartment?: string;
    authorAvatarUrl?: string;
    author?: any;
    reportType?: 'daily' | 'weekly';
    date?: string; // YYYY-MM-DD
    reportDate?: string;
    weekStartDate?: string;
    weekLabel?: string;
    department?: string;
    results?: string;
    ongoingProjects?: string;
    tomorrowPlan?: string;
    supervisorId?: string;
    supervisorName?: string;
    supervisor?: any;
    feedbackComment?: string;
    submittedAt?: string;
    reviewedAt?: string;
    updatedAt?: string;
  }

  function loadWorkReports(): StoredWorkReport[] {
    if (!fs.existsSync(workReportsPath)) {
      return [];
    }
    try {
      const raw = JSON.parse(fs.readFileSync(workReportsPath, 'utf8'));
      if (!Array.isArray(raw)) return [];
      return raw.map(r => normalizeWorkReport(r));
    } catch (e) {
      return [];
    }
  }

  function normalizeWorkReport(r: any): StoredWorkReport {
    const author_id = r.author_id || r.authorId || (r.author && r.author.id) || 'u1';
    const supervisor_id = r.supervisor_id || r.supervisorId || (r.supervisor && r.supervisor.id) || undefined;
    const week_start_date = r.week_start_date || r.weekStartDate || (r.date ? r.date.slice(0, 10) : undefined) || (r.reportDate ? r.reportDate.slice(0, 10) : undefined);
    const week_label = r.week_label || r.weekLabel || (week_start_date ? `${week_start_date}週` : undefined);
    const tasks = r.tasks || r.content || '';
    const achievements = r.achievements !== undefined ? r.achievements : (r.results || '');
    const issues = r.issues || '';
    const continued_items = r.continued_items !== undefined ? r.continued_items : (r.ongoingProjects || '');
    const next_week_plans = r.next_week_plans !== undefined ? r.next_week_plans : (r.tomorrowPlan || '');
    const status = r.status || 'submitted';
    const review_feedback = r.review_feedback !== undefined ? r.review_feedback : (r.feedbackComment || '');
    const reviewed_at = r.reviewed_at || r.reviewedAt || undefined;
    const createdAt = r.createdAt || r.created_at || new Date().toISOString();
    const updated_at = r.updated_at || r.updatedAt || r.createdAt || new Date().toISOString();

    return {
      id: String(r.id),
      author_id,
      supervisor_id,
      week_start_date,
      week_label,
      tasks,
      achievements,
      issues,
      continued_items,
      next_week_plans,
      status,
      review_feedback,
      reviewed_at,
      createdAt,
      updated_at,
      // 互換用
      authorId: author_id,
      authorName: r.authorName || (r.author && r.author.name) || undefined,
      authorDepartment: r.authorDepartment || r.department || (r.author && r.author.department) || undefined,
      authorAvatarUrl: r.authorAvatarUrl || (r.author && r.author.avatarUrl) || undefined,
      author: r.author || undefined,
      reportType: r.reportType || 'weekly',
      date: r.date || r.reportDate || week_start_date,
      reportDate: r.reportDate || r.date || week_start_date,
      weekStartDate: week_start_date,
      weekLabel: week_label,
      department: r.department || r.authorDepartment || (r.author && r.author.department) || '',
      results: achievements,
      ongoingProjects: continued_items,
      tomorrowPlan: next_week_plans,
      supervisorId: supervisor_id,
      supervisorName: r.supervisorName || (r.supervisor && r.supervisor.name) || undefined,
      supervisor: r.supervisor || undefined,
      feedbackComment: review_feedback,
      submittedAt: r.submittedAt || (status === 'submitted' ? (r.createdAt || createdAt) : undefined),
      reviewedAt: reviewed_at,
      updatedAt: updated_at
    };
  }

  function saveWorkReports(items: StoredWorkReport[]) {
    try {
      fs.writeFileSync(workReportsPath, JSON.stringify(items, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save work reports:', e);
    }
  }

  // 日報・週報一覧取得 API
  app.get(['/api/work-reports', '/api/daily-reports', '/api/reports'], (req, res) => {
    try {
      let reports = loadWorkReports();
      const { authorId, author_id, supervisorId, supervisor_id, department, reportType, status, weekStartDate, week_start_date } = req.query;

      const targetAuthor = author_id || authorId;
      const targetSupervisor = supervisor_id || supervisorId;
      const targetWeekStart = week_start_date || weekStartDate;

      if (targetAuthor) {
        reports = reports.filter(r => r.author_id === String(targetAuthor) || r.authorId === String(targetAuthor));
      }
      if (targetSupervisor) {
        reports = reports.filter(r => r.supervisor_id === String(targetSupervisor) || r.supervisorId === String(targetSupervisor));
      }
      if (department) {
        reports = reports.filter(r => r.department === String(department));
      }
      if (reportType) {
        reports = reports.filter(r => r.reportType === String(reportType));
      }
      if (status) {
        reports = reports.filter(r => r.status === String(status));
      }
      if (targetWeekStart) {
        reports = reports.filter(r => r.week_start_date === String(targetWeekStart) || r.weekStartDate === String(targetWeekStart));
      }

      // 新しい順にソート (week_start_date or createdAt desc)
      reports.sort((a, b) => {
        const timeA = new Date(a.week_start_date || a.date || a.createdAt).getTime();
        const timeB = new Date(b.week_start_date || b.date || b.createdAt).getTime();
        return timeB - timeA;
      });

      res.json(reports);
    } catch (err: any) {
      console.error('Get work reports error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 日報・週報 作成 / 登録 API (新旧カラム両対応 & notifications 連動)
  app.post(['/api/work-reports', '/api/daily-reports', '/api/reports'], async (req, res) => {
    try {
      const data = req.body || {};
      const reports = loadWorkReports();
      const nowIso = new Date().toISOString();

      const newId = data.id && !data.id.startsWith('r-temp-') ? data.id : `rep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const existingIdx = reports.findIndex(r => r.id === newId);

      const isSubmitting = data.status === 'submitted' || data.isSubmitting;
      const status = data.status || (isSubmitting ? 'submitted' : 'draft');

      const author_id = String(data.author_id || data.authorId || (data.author && data.author.id) || 'u1');
      const authorName = data.authorName || (data.author && data.author.name) || '社員';
      const supervisor_id = data.supervisor_id || data.supervisorId || (data.supervisor && data.supervisor.id) || undefined;
      const week_start_date = data.week_start_date || data.weekStartDate || (data.date ? data.date.slice(0, 10) : undefined) || (data.reportDate ? data.reportDate.slice(0, 10) : undefined) || nowIso.slice(0, 10);
      const week_label = data.week_label || data.weekLabel || (week_start_date ? `${week_start_date}週` : undefined);
      const tasks = data.tasks || data.content || '';
      const achievements = data.achievements !== undefined ? data.achievements : (data.results || '');
      const issues = data.issues || '';
      const continued_items = data.continued_items !== undefined ? data.continued_items : (data.ongoingProjects || '');
      const next_week_plans = data.next_week_plans !== undefined ? data.next_week_plans : (data.tomorrowPlan || '');
      const review_feedback = data.review_feedback !== undefined ? data.review_feedback : (data.feedbackComment || '');
      const reviewed_at = data.reviewed_at || data.reviewedAt || undefined;
      const createdAt = data.createdAt || data.created_at || (existingIdx >= 0 ? reports[existingIdx].createdAt : nowIso);
      const updated_at = nowIso;

      const newReport: StoredWorkReport = {
        id: newId,
        author_id,
        supervisor_id,
        week_start_date,
        week_label,
        tasks,
        achievements,
        issues,
        continued_items,
        next_week_plans,
        status,
        review_feedback,
        reviewed_at,
        createdAt,
        updated_at,
        // 互換用
        authorId: author_id,
        authorName,
        authorDepartment: data.authorDepartment || data.department || (data.author && data.author.department) || '',
        authorAvatarUrl: data.authorAvatarUrl || (data.author && data.author.avatarUrl) || '',
        author: data.author || undefined,
        reportType: data.reportType || 'weekly',
        date: data.date || data.reportDate || week_start_date,
        reportDate: data.reportDate || data.date || week_start_date,
        weekStartDate: week_start_date,
        weekLabel: week_label,
        department: data.department || (data.author && data.author.department) || '',
        results: achievements,
        ongoingProjects: continued_items,
        tomorrowPlan: next_week_plans,
        supervisorId: supervisor_id,
        supervisorName: data.supervisorName || (data.supervisor && data.supervisor.name) || undefined,
        supervisor: data.supervisor || undefined,
        feedbackComment: review_feedback,
        submittedAt: status === 'submitted' ? (data.submittedAt || nowIso) : undefined,
        reviewedAt: reviewed_at,
        updatedAt: updated_at
      };

      if (existingIdx >= 0) {
        reports[existingIdx] = newReport;
      } else {
        reports.unshift(newReport);
      }

      saveWorkReports(reports);

      // 上長へ提出された場合は notifications テーブル・JSON へレコード自動作成 & Push通知
      if (status === 'submitted' && supervisor_id && supervisor_id !== author_id) {
        try {
          createNotification({
            user_id: supervisor_id,
            sender_id: author_id,
            type: 'work_report',
            title: `【週報】${authorName}さんより提出`,
            contents: `${week_label || week_start_date || '最新'}の週報が提出されました。確認をお願いします。`,
            target_id: newId,
            sender_name: authorName
          });
        } catch (notifErr) {
          console.warn('Failed to auto-create notification:', notifErr);
        }

        try {
          await sendPushNotificationToUser({
            targetUserId: supervisor_id,
            title: `【週報】${authorName}さんより提出`,
            body: `${week_label || week_start_date || '最新'}の週報が提出されました。確認をお願いします。`,
            url: '/?tab=daily_report',
            data: { reportId: newReport.id, tab: 'daily_report' },
            tag: `report_submit_${newReport.id}`
          });
        } catch (pushErr) {
          console.warn('[Push] Report supervisor notify error:', pushErr);
        }
      }

      res.json({ success: true, report: newReport });
    } catch (err: any) {
      console.error('Save work report error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 日報・週報 更新 API
  app.put(['/api/work-reports/:id', '/api/daily-reports/:id', '/api/reports/:id'], async (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body || {};
      const reports = loadWorkReports();
      const idx = reports.findIndex(r => r.id === id);

      if (idx === -1) {
        return res.status(404).json({ error: '対象の報告が見つかりません' });
      }

      const prevStatus = reports[idx].status;
      const nextStatus = data.status || prevStatus;
      const nowIso = new Date().toISOString();

      const merged = {
        ...reports[idx],
        ...data,
        id,
        status: nextStatus,
        achievements: data.achievements !== undefined ? data.achievements : (data.results !== undefined ? data.results : reports[idx].achievements),
        continued_items: data.continued_items !== undefined ? data.continued_items : (data.ongoingProjects !== undefined ? data.ongoingProjects : reports[idx].continued_items),
        next_week_plans: data.next_week_plans !== undefined ? data.next_week_plans : (data.tomorrowPlan !== undefined ? data.tomorrowPlan : reports[idx].next_week_plans),
        review_feedback: data.review_feedback !== undefined ? data.review_feedback : (data.feedbackComment !== undefined ? data.feedbackComment : reports[idx].review_feedback),
        author_id: data.author_id || data.authorId || reports[idx].author_id,
        supervisor_id: data.supervisor_id !== undefined ? data.supervisor_id : (data.supervisorId !== undefined ? data.supervisorId : reports[idx].supervisor_id),
        week_start_date: data.week_start_date || data.weekStartDate || reports[idx].week_start_date,
        week_label: data.week_label || data.weekLabel || reports[idx].week_label,
        submittedAt: nextStatus === 'submitted' && prevStatus !== 'submitted' ? nowIso : (data.submittedAt || reports[idx].submittedAt),
        updated_at: nowIso,
        updatedAt: nowIso
      };

      const updatedReport = normalizeWorkReport(merged);
      reports[idx] = updatedReport;
      saveWorkReports(reports);

      if (nextStatus === 'submitted' && prevStatus !== 'submitted' && updatedReport.supervisor_id) {
        try {
          createNotification({
            user_id: updatedReport.supervisor_id,
            sender_id: updatedReport.author_id,
            type: 'work_report',
            title: `【週報】${updatedReport.authorName || '社員'}さんより提出`,
            contents: `${updatedReport.week_label || updatedReport.week_start_date || '最新'}の週報が提出されました。確認をお願いします。`,
            target_id: updatedReport.id,
            sender_name: updatedReport.authorName
          });
        } catch (notifErr) {}

        try {
          await sendPushNotificationToUser({
            targetUserId: updatedReport.supervisor_id,
            title: `【週報】${updatedReport.authorName || '社員'}さんより提出`,
            body: `${updatedReport.week_label || updatedReport.week_start_date || '最新'}の週報が提出されました。確認をお願いします。`,
            url: '/?tab=daily_report',
            data: { reportId: updatedReport.id, tab: 'daily_report' }
          });
        } catch (pushErr) {}
      }

      res.json({ success: true, report: updatedReport });
    } catch (err: any) {
      console.error('Update work report error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 上長への報告・提出 API
  app.post(['/api/work-reports/:id/submit', '/api/daily-reports/:id/submit', '/api/reports/:id/submit'], async (req, res) => {
    try {
      const { id } = req.params;
      const { supervisorId, supervisor_id, supervisorName } = req.body || {};
      const reports = loadWorkReports();
      const idx = reports.findIndex(r => r.id === id);

      if (idx === -1) {
        return res.status(404).json({ error: '対象の報告が見つかりません' });
      }

      const nowIso = new Date().toISOString();
      const targetSupId = supervisor_id || supervisorId || reports[idx].supervisor_id;
      reports[idx].status = 'submitted';
      reports[idx].submittedAt = nowIso;
      reports[idx].updated_at = nowIso;
      reports[idx].updatedAt = nowIso;
      if (targetSupId) {
        reports[idx].supervisor_id = targetSupId;
        reports[idx].supervisorId = targetSupId;
      }
      if (supervisorName) reports[idx].supervisorName = supervisorName;

      saveWorkReports(reports);

      if (targetSupId) {
        try {
          createNotification({
            user_id: targetSupId,
            sender_id: reports[idx].author_id,
            type: 'work_report',
            title: `【週報】${reports[idx].authorName || '社員'}さんより提出`,
            contents: `${reports[idx].week_label || reports[idx].week_start_date || '最新'}の週報が提出されました。確認をお願いします。`,
            target_id: reports[idx].id,
            sender_name: reports[idx].authorName
          });
        } catch (notifErr) {}

        try {
          await sendPushNotificationToUser({
            targetUserId: targetSupId,
            title: `【週報】${reports[idx].authorName || '社員'}さんより提出`,
            body: `${reports[idx].week_label || reports[idx].week_start_date || '最新'}の週報が提出されました。確認をお願いします。`,
            url: '/?tab=daily_report',
            data: { reportId: reports[idx].id, tab: 'daily_report' },
            tag: `report_submit_${reports[idx].id}`
          });
        } catch (pushErr) {}
      }

      res.json({ success: true, report: reports[idx] });
    } catch (err: any) {
      console.error('Submit work report error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 上長による確認・承認・フィードバック API (notifications 連動)
  app.post(['/api/work-reports/:id/review', '/api/daily-reports/:id/review', '/api/reports/:id/review'], async (req, res) => {
    try {
      const { id } = req.params;
      const { feedbackComment, review_feedback, reviewerUserId, reviewerName } = req.body || {};
      const reports = loadWorkReports();
      const idx = reports.findIndex(r => r.id === id);

      if (idx === -1) {
        return res.status(404).json({ error: '対象の報告が見つかりません' });
      }

      const nowIso = new Date().toISOString();
      const comment = review_feedback !== undefined ? review_feedback : (feedbackComment !== undefined ? feedbackComment : '');
      reports[idx].status = 'reviewed';
      reports[idx].reviewed_at = nowIso;
      reports[idx].reviewedAt = nowIso;
      reports[idx].review_feedback = comment;
      reports[idx].feedbackComment = comment;
      reports[idx].updated_at = nowIso;
      reports[idx].updatedAt = nowIso;

      saveWorkReports(reports);

      // 提出者本人へ確認完了の通知を notifications に作成 & Push通知
      if (reports[idx].author_id) {
        const periodName = reports[idx].week_label || reports[idx].week_start_date || '';
        try {
          createNotification({
            user_id: reports[idx].author_id,
            sender_id: reviewerUserId || reports[idx].supervisor_id,
            type: 'work_report_review',
            title: `【週報】${reviewerName || '上長'}が週報を確認しました`,
            contents: `${periodName}の週報が確認されました。${comment ? `コメント: 「${comment}」` : ''}`,
            target_id: reports[idx].id,
            sender_name: reviewerName || '上長'
          });
        } catch (notifErr) {
          console.warn('Failed to auto-create review notification:', notifErr);
        }

        try {
          await sendPushNotificationToUser({
            targetUserId: reports[idx].author_id,
            title: `【週報】${reviewerName || '上長'}が週報を確認しました`,
            body: `${periodName}の週報が確認されました。${comment ? `「${comment}」` : ''}`,
            url: '/?tab=daily_report',
            data: { reportId: reports[idx].id, tab: 'daily_report' },
            tag: `report_reviewed_${reports[idx].id}`
          });
        } catch (pushErr) {}
      }

      res.json({ success: true, report: reports[idx] });
    } catch (err: any) {
      console.error('Review work report error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // 日報・週報 削除 API
  app.delete(['/api/work-reports/:id', '/api/daily-reports/:id', '/api/reports/:id'], (req, res) => {
    try {
      const { id } = req.params;
      let reports = loadWorkReports();
      const initialCount = reports.length;
      reports = reports.filter(r => r.id !== id);
      saveWorkReports(reports);
      res.json({ success: true, deleted: initialCount - reports.length });
    } catch (err: any) {
      console.error('Delete work report error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ==========================================
  // ワークフロー (Workflows / Applications) JSON ストレージ & API
  // ==========================================
  const workflowsPath = path.join(dataDir, 'workflows.json');

  interface StoredWorkflow {
    id: string;
    title: string;
    applicantId: string;
    approverId?: string;
    status: string; // 'pending' | 'approved' | 'rejected' | 'draft'
    category?: string;
    type?: string;
    purchaseOrderNumber?: string | null;
    constructionDate?: string | null;
    linkedInventoryIssueId?: string | null;
    details?: string | any;
    createdAt: string;
    updatedAt?: string;
  }

  function getInitialWorkflowsSample(): StoredWorkflow[] {
    const initial: StoredWorkflow[] = [
      {
        id: 'wf-101',
        title: '備品（モニタ・キーボード）購入申請',
        applicantId: 'u2',
        approverId: 'u1',
        status: 'pending',
        category: 'purchase_order',
        type: 'purchase_order',
        purchaseOrderNumber: 'PO-2026-0801',
        constructionDate: null,
        linkedInventoryIssueId: null,
        createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
        details: JSON.stringify({
          flowId: 'flow-1',
          flowName: '標準承認フロー',
          currentStepIndex: 1,
          totalSteps: 2,
          reason: '開発受託業務用モニターおよびキーボードの購入',
          amount: 45000,
          expenseType: '備品消耗品費',
          purchaseItems: [
            { name: '4K 27インチモニター', count: 1, price: 35000 },
            { name: 'メカニカルキーボード', count: 1, price: 10000 }
          ],
          stepsConfig: [
            { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' },
            { stepNumber: 2, approverType: 'department_head', stepName: '最終承認（部長）' }
          ],
          history: []
        })
      }
    ];
    try {
      fs.writeFileSync(workflowsPath, JSON.stringify(initial, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to write initial workflows sample:', e);
    }
    return initial;
  }

  function loadWorkflows(): StoredWorkflow[] {
    if (!fs.existsSync(workflowsPath)) {
      return getInitialWorkflowsSample();
    }
    try {
      const raw = JSON.parse(fs.readFileSync(workflowsPath, 'utf8'));
      if (!Array.isArray(raw) || raw.length === 0) {
        return getInitialWorkflowsSample();
      }
      return raw;
    } catch (e) {
      return getInitialWorkflowsSample();
    }
  }

  function saveWorkflows(items: StoredWorkflow[]) {
    try {
      fs.writeFileSync(workflowsPath, JSON.stringify(items, null, 2), 'utf8');
    } catch (e) {
      console.error('Failed to save workflows:', e);
    }
  }

  // ワークフロー一覧取得 API
  app.get(['/api/workflows', '/api/workflows/', '/workflows', '/workflows/'], (req, res) => {
    try {
      const list = loadWorkflows();
      res.json(list);
    } catch (err: any) {
      console.error('Get workflows error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ワークフロー新規作成 API
  app.post(['/api/workflows', '/api/workflows/', '/workflows', '/workflows/'], (req, res) => {
    try {
      const data = req.body || {};
      const list = loadWorkflows();
      const nowIso = new Date().toISOString();

      const newId = data.id || `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const applicantId = String(data.applicantId || (data.applicant && data.applicant.id) || 'u1');
      const approverId = data.approverId || (data.approver && data.approver.id) || undefined;
      const status = data.status || 'pending';
      const category = data.category || data.type || 'other';

      let detailsStr = '';
      if (typeof data.details === 'string') {
        detailsStr = data.details;
      } else if (typeof data.details === 'object' && data.details !== null) {
        detailsStr = JSON.stringify(data.details);
      } else {
        const { id, title, applicantId: _a, approverId: _ap, status: _s, category: _c, type: _t, ...rest } = data;
        detailsStr = JSON.stringify(rest);
      }

      const newWorkflow: StoredWorkflow = {
        id: newId,
        title: data.title || '無題の申請',
        applicantId,
        approverId,
        status,
        category,
        type: category,
        purchaseOrderNumber: data.purchaseOrderNumber || null,
        constructionDate: data.constructionDate || null,
        linkedInventoryIssueId: data.linkedInventoryIssueId || null,
        details: detailsStr,
        createdAt: data.createdAt || nowIso,
        updatedAt: nowIso
      };

      const existingIdx = list.findIndex(w => w.id === newId);
      if (existingIdx >= 0) {
        list[existingIdx] = newWorkflow;
      } else {
        list.unshift(newWorkflow);
      }

      saveWorkflows(list);
      res.status(201).json(newWorkflow);
    } catch (err: any) {
      console.error('Create workflow error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ワークフロー更新 API (承認 / 却下 / 変更)
  app.put(['/api/workflows/:id', '/workflows/:id'], (req, res) => {
    try {
      const { id } = req.params;
      const data = req.body || {};
      const list = loadWorkflows();
      const idx = list.findIndex(w => w.id === id);

      const nowIso = new Date().toISOString();

      let detailsStr = '';
      if (typeof data.details === 'string') {
        detailsStr = data.details;
      } else if (typeof data.details === 'object' && data.details !== null) {
        detailsStr = JSON.stringify(data.details);
      }

      if (idx === -1) {
        const newWorkflow: StoredWorkflow = {
          id,
          title: data.title || '無題の申請',
          applicantId: String(data.applicantId || 'u1'),
          approverId: data.approverId || undefined,
          status: data.status || 'pending',
          category: data.category || data.type || 'other',
          type: data.category || data.type || 'other',
          purchaseOrderNumber: data.purchaseOrderNumber || null,
          constructionDate: data.constructionDate || null,
          linkedInventoryIssueId: data.linkedInventoryIssueId || null,
          details: detailsStr || JSON.stringify(data),
          createdAt: data.createdAt || nowIso,
          updatedAt: nowIso
        };
        list.unshift(newWorkflow);
        saveWorkflows(list);
        return res.json(newWorkflow);
      }

      const existing = list[idx];

      // details 内の status 等も更新されて送られてくるため、detailsObj があればパースして同期
      let mergedDetailsStr = detailsStr || existing.details;
      if (detailsStr) {
        try {
          const parsedDetails = JSON.parse(detailsStr);
          parsedDetails.status = data.status || existing.status;
          mergedDetailsStr = JSON.stringify(parsedDetails);
        } catch (e) {}
      }

      const updatedWorkflow: StoredWorkflow = {
        ...existing,
        title: data.title !== undefined ? data.title : existing.title,
        applicantId: data.applicantId ? String(data.applicantId) : existing.applicantId,
        approverId: data.approverId !== undefined ? data.approverId : existing.approverId,
        status: data.status !== undefined ? data.status : existing.status,
        category: data.category || data.type || existing.category,
        type: data.category || data.type || existing.type,
        purchaseOrderNumber: data.purchaseOrderNumber !== undefined ? data.purchaseOrderNumber : existing.purchaseOrderNumber,
        constructionDate: data.constructionDate !== undefined ? data.constructionDate : existing.constructionDate,
        linkedInventoryIssueId: data.linkedInventoryIssueId !== undefined ? data.linkedInventoryIssueId : existing.linkedInventoryIssueId,
        details: mergedDetailsStr,
        updatedAt: nowIso
      };

      list[idx] = updatedWorkflow;
      saveWorkflows(list);

      res.json(updatedWorkflow);
    } catch (err: any) {
      console.error('Update workflow error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ワークフロー削除 API
  app.delete(['/api/workflows/:id', '/workflows/:id'], (req, res) => {
    try {
      const { id } = req.params;
      let list = loadWorkflows();
      const initialCount = list.length;
      list = list.filter(w => w.id !== id);
      saveWorkflows(list);
      res.json({ success: true, deleted: initialCount - list.length });
    } catch (err: any) {
      console.error('Delete workflow error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.post(['/api/workflows/:id/delete', '/workflows/:id/delete'], (req, res) => {
    try {
      const { id } = req.params;
      let list = loadWorkflows();
      const initialCount = list.length;
      list = list.filter(w => w.id !== id);
      saveWorkflows(list);
      res.json({ success: true, deleted: initialCount - list.length });
    } catch (err: any) {
      console.error('Delete workflow error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // Helper functions for iCal timezone & dates
  function getJstDateString(dateInput: Date | string | undefined): string {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    // JST offset (+9 hours)
    const jstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
    const yyyy = jstDate.getUTCFullYear();
    const mm = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(jstDate.getUTCDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  function addDaysJstFormatted(dateStr: string, days: number): string {
    const [y, m, d] = dateStr.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');
    return `${year}${month}${day}`;
  }

  function formatToUtc(dateInput: Date | string | undefined): string {
    if (!dateInput) return '';
    const d = new Date(dateInput);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    const yyyy = d.getUTCFullYear();
    const mm = pad(d.getUTCMonth() + 1);
    const dd = pad(d.getUTCDate());
    const hh = pad(d.getUTCHours());
    const min = pad(d.getUTCMinutes());
    const ss = pad(d.getUTCSeconds());
    return `${yyyy}${mm}${dd}T${hh}${min}${ss}Z`;
  }

  // ==========================================
  // iCal (ICS) カレンダー外部連携 API
  // ==========================================
  app.get(['/api/ical', '/api/ical/'], (req, res) => {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.send(`
      <div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; line-height: 1.6;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">iCalカレンダー同期機能</h2>
        <p>このエンドポイントは、各ユーザー専用のiCal形式カレンダーを提供します。</p>
        <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 14px; margin: 16px 0;">
          <strong>URLフォーマット:</strong><br>
          /api/ical/user_【ユーザーID】_calendar.ics
        </div>
        <p><strong>例 (u1の場合):</strong><br>
          <a href="/api/ical/user_u1_calendar.ics" style="color: #2563eb; text-decoration: underline;">/api/ical/user_u1_calendar.ics</a>
        </p>
        <p style="color: #6b7280; font-size: 13px; margin-top: 24px; border-top: 1px solid #e5e7eb; padding-top: 16px;">
          ※GoogleカレンダーやOutlook、Mac標準カレンダーなどの「URLで追加」機能に上記URLを設定することで同期が可能です。
        </p>
      </div>
    `);
  });

  app.get(['/api/ical/user_:userId_calendar.ics', '/ical/user_:userId_calendar.ics'], (req, res) => {
    try {
      let rawUserId = (req.params as any).userId || (req.params as any).userId_calendar || '';
      if (rawUserId.endsWith('_calendar')) {
        rawUserId = rawUserId.substring(0, rawUserId.length - '_calendar'.length);
      }
      const userId = rawUserId;

      const allRawEvents = loadEvents();

      // Normalization
      const normalizedEvents = allRawEvents.map((e: any) => {
        let detailsObj: any = {};
        if (e.description && typeof e.description === 'string' && e.description.startsWith('{')) {
          try { detailsObj = JSON.parse(e.description); } catch (_) {}
        }
        return {
          id: String(e.id),
          title: e.title || '予定',
          start: e.startAt || e.start || new Date().toISOString(),
          end: e.endAt || e.end || e.startAt || e.start || new Date().toISOString(),
          isAllDay: e.isAllDay === true || e.isAllDay === 1 || e.isAllDay === 'true' || e.isAllDay === '1',
          type: e.category || e.type || 'personal',
          office: e.office || '全社',
          division: e.division || '全部署',
          location: e.location || detailsObj.location || '',
          memo: e.memo || detailsObj.memo || e.description || '',
          attendees: e.attendees || detailsObj.attendees || [],
          createdBy: e.createdBy || detailsObj.createdBy,
          createdById: e.createdById || e.userId || detailsObj.createdById || detailsObj.userId,
          recurrence: e.recurrence || detailsObj.recurrence,
          recurrenceParentId: e.recurrenceParentId || detailsObj.recurrenceParentId,
          recurrenceOriginalDate: e.recurrenceOriginalDate || detailsObj.recurrenceOriginalDate || e.instanceDate || detailsObj.instanceDate,
          recurrenceExceptions: e.recurrenceExceptions || detailsObj.recurrenceExceptions,
        };
      });

      // Filter events relevant to user
      const userEvents = normalizedEvents.filter((e: any) => {
        const isCreator = String(e.createdById) === String(userId) || String(e.createdBy?.id) === String(userId);

        let attendeesList: any[] = [];
        if (Array.isArray(e.attendees)) {
          attendeesList = e.attendees;
        } else if (typeof e.attendees === 'string') {
          try {
            const p = JSON.parse(e.attendees);
            if (Array.isArray(p)) attendeesList = p;
          } catch (_) {}
        }

        let isAttendee = false;
        if (attendeesList.length > 0) {
          isAttendee = attendeesList.some((att: any) => {
            if (!att) return false;
            if (typeof att === 'object') {
              return String(att.id) === String(userId) || String(att.name) === String(userId);
            }
            return String(att) === String(userId);
          });
        }

        if (isAttendee || isCreator) return true;
        if (attendeesList.length === 0 && (!e.office || e.office === '全社')) return true;

        return false;
      });

      // Expand recurring events (-6 months ~ +18 months)
      const viewStart = new Date();
      viewStart.setMonth(viewStart.getMonth() - 6);
      const viewEnd = new Date();
      viewEnd.setMonth(viewEnd.getMonth() + 18);

      const expandedEvents = expandRecurringEvents(userEvents as any[], viewStart, viewEnd);

      // 同一スロット・類似タイトルでの重複（過去の親レコード残骸や分割重複）を安全に排除
      const seenSlotMap = new Map<string, any>();
      for (const evt of expandedEvents) {
        const startKey = evt.start ? new Date(evt.start).toISOString() : '';
        const endKey = evt.end ? new Date(evt.end).toISOString() : startKey;
        const normTitle = (evt.title || '').trim().replace(/\s+/g, ' ');
        const slotKey = `${startKey}_${endKey}_${normTitle}`;

        if (seenSlotMap.has(slotKey)) {
          const prev = seenSlotMap.get(slotKey);
          // 場所情報があるもの、またはより新しいレコードを優先採用
          const prevScore = (prev.location ? 2 : 0) + (String(prev.id).includes('split') ? 1 : 0);
          const currScore = (evt.location ? 2 : 0) + (String(evt.id).includes('split') ? 1 : 0);
          if (currScore >= prevScore) {
            seenSlotMap.set(slotKey, evt);
          }
        } else {
          seenSlotMap.set(slotKey, evt);
        }
      }
      const finalEvents = Array.from(seenSlotMap.values());

      const nowStr = formatToUtc(new Date());
      let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Company SNS Calendar//JA\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:社内カレンダー同期\r\nX-WR-TIMEZONE:Asia/Tokyo\r\n";

      for (const evt of finalEvents) {
        const isAllDay = evt.isAllDay === true || (evt as any).isAllDay === 1 || (evt as any).isAllDay === 'true';
        let dtStartLine = '';
        let dtEndLine = '';

        if (isAllDay) {
          const startJst = getJstDateString(evt.start);
          const endJst = evt.end ? getJstDateString(evt.end) : startJst;
          if (startJst) {
            const startClean = startJst.replace(/-/g, '');
            dtStartLine = `DTSTART;VALUE=DATE:${startClean}\r\n`;

            // Non-inclusive DTEND
            const endCleanNext = addDaysJstFormatted(endJst || startJst, 1);
            dtEndLine = `DTEND;VALUE=DATE:${endCleanNext}\r\n`;
          }
        } else {
          const startD = evt.start ? new Date(evt.start) : null;
          const endD = evt.end ? new Date(evt.end) : startD;
          if (startD && endD) {
            dtStartLine = `DTSTART:${formatToUtc(startD)}\r\n`;
            dtEndLine = `DTEND:${formatToUtc(endD)}\r\n`;
          }
        }

        let descText = evt.memo || (evt as any).description || '';
        if (typeof descText === 'string' && descText.startsWith('{')) {
          try {
            const parsed = JSON.parse(descText);
            descText = parsed.memo || '';
          } catch (_) {}
        }

        const summaryEscaped = (evt.title || '').replace(/\r\n|\r|\n/g, ' ').replace(/[,;]/g, '\\$&');
        const descEscaped = String(descText).replace(/\r\n|\r|\n/g, '\\n').replace(/[,;]/g, '\\$&');
        const locEscaped = (evt.location || '').replace(/\r\n|\r|\n/g, ' ').replace(/[,;]/g, '\\$&');

        icsContent += "BEGIN:VEVENT\r\n";
        icsContent += `UID:evt-${evt.id}@company-sns\r\n`;
        icsContent += `DTSTAMP:${nowStr}\r\n`;
        icsContent += `SUMMARY:${summaryEscaped}\r\n`;
        if (descText) icsContent += `DESCRIPTION:${descEscaped}\r\n`;
        if (evt.location) icsContent += `LOCATION:${locEscaped}\r\n`;
        if (dtStartLine) icsContent += dtStartLine;
        if (dtEndLine) icsContent += dtEndLine;
        icsContent += "END:VEVENT\r\n";
      }

      icsContent += "END:VCALENDAR\r\n";

      // Folding 75 octets
      const lines = icsContent.split("\r\n");
      const foldedLines = lines.map(line => {
        if (!line) return '';
        const buf = Buffer.from(line, 'utf-8');
        if (buf.length <= 72) return line;

        let result = '';
        let currentBytes = 0;
        let currentStr = '';

        for (let i = 0; i < line.length; i++) {
          const char = line[i];
          const charBytes = Buffer.from(char, 'utf-8').length;

          if (currentBytes + charBytes > 72) {
            result += currentStr + "\r\n ";
            currentStr = char;
            currentBytes = charBytes;
          } else {
            currentStr += char;
            currentBytes += charBytes;
          }
        }
        result += currentStr;
        return result;
      });
      const finalIcs = foldedLines.join("\r\n");

      res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
      res.setHeader('Content-Disposition', 'inline; filename="user_' + userId + '_calendar.ics"');
      res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate');
      res.send(finalIcs);
    } catch (err: any) {
      console.error('[iCal Export Error]', err);
      res.status(500).send(err.message);
    }
  });

  // Vite開発用ミドルウェア または プロダクション静的ファイルサーブ
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
