import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import webpush from 'web-push';
import { createServer as createViteServer } from 'vite';

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

  if (fs.existsSync(vapidKeysPath)) {
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
      'mailto:admin@example.com',
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
        tag
      } = req.body;

      if (!title || !body) {
        return res.status(400).json({ error: 'タイトルと本文は必須です。' });
      }

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

      if (targets.length === 0) {
        return res.json({ success: true, message: '送信対象の端末がありませんでした。', sentCount: 0 });
      }

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
        tag: tag || `notif_${Date.now()}`,
        renotify: true
      });

      const staleEndpoints: string[] = [];
      let sentCount = 0;
      let failureCount = 0;

      await Promise.all(
        targets.map(async (sub) => {
          try {
            await webpush.sendNotification(sub.subscription, payload);
            sentCount++;
          } catch (err: any) {
            failureCount++;
            console.error(`[WebPush] Push failed for user ${sub.userId}:`, err.statusCode || err.message);
            // 404/410 は購読期限切れ・端末側で解除されたエンドポイント
            if (err.statusCode === 404 || err.statusCode === 410) {
              staleEndpoints.push(sub.subscription.endpoint);
            }
          }
        })
      );

      // 無効になったエンドポイントを削除整理
      if (staleEndpoints.length > 0) {
        const remainingSubs = allSubs.filter(s => !staleEndpoints.includes(s.subscription.endpoint));
        saveSubscriptions(remainingSubs);
        console.log(`[WebPush] Pruned ${staleEndpoints.length} stale subscriptions.`);
      }

      res.json({
        success: true,
        sentCount,
        failureCount,
        totalTargets: targets.length
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
  app.use('/external-files', express.static(externalFilesDir));
  app.use('/bulletinsfiles', express.static(bulletinsFilesDir));
  app.use('/api/bulletinsfiles', express.static(bulletinsFilesDir));

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
