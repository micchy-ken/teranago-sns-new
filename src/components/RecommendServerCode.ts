export const RECOMMEND_SERVER_JS = `/**
 * =====================================================================
 * 寺子屋 SNS サーバーサイド・バックエンド (Express & MS SQL Server)
 * 最終更新日時 (最終アップデート): 2026年8月21日 (URLリッチリンクカード・OGPメタデータ取得対応版)
 * 
 * 【重要：開発サーバーの再起動ループ対策について】
 * nodemon や tsx watch などのウォッチツールを使用してサーバーを起動している場合、
 * ファイルがアップロードされると「プロジェクト内のファイル変更」と検知され、
 * サーバーが自動的に再起動して接続切断（ループ）を引き起こす原因になります。
 * 
 * 解決策1：nodemon を使用している場合、nodemon.json でアップロード先ディレクトリを監視対象から除外します。
 * {
 *   "ignore": ["uploads/*", "public/uploads/*"]
 * }
 * 
 * 解決策2：本番運用時、または安定動作のため、本コードは uploads ディレクトリを
 * カレントディレクトリに作成するようにしていますが、必要に応じてプロジェクト外の
 * 永続的な共有ディレクトリや、クラウドストレージ（AWS S3 や Azure Blob）に保存する
 * ようカスタマイズしてください。
 * =====================================================================
 */
import express from 'express';
import cors from 'cors';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import webpush from 'web-push';
import nodemailer from 'nodemailer';
import dotenv from 'dotenv';
dotenv.config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// =========================================================
// リバースプロキシ自動パス解決ミドルウェア (Synology NAS / Nginx 等の 404 対策)
// =========================================================
app.use((req, res, next) => {
  // もし '/api/xxx' ではなく '/xxx' で届いた場合、内部的に '/api/xxx' へリライトして、
  // すべての '/api/...' ルートが正しくマッチするようにします
  if (!req.url.startsWith('/api') && req.url !== '/health' && !req.url.startsWith('/uploads') && !req.url.startsWith('/bulletinsfiles') && !req.url.startsWith('/external-files')) {
    req.url = '/api' + req.url;
  }
  next();
});

// =========================================================
// アバター画像・添付ファイルアップロード用・静的配信ディレクトリの設定
// =========================================================
const uploadDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// 掲示板添付ファイル用ディレクトリ (/app/bulletinsfiles または ./bulletinsfiles)
const bulletinsFilesDir = process.env.BULLETINS_FILES_DIR || 
  (fs.existsSync('/app/bulletinsfiles') ? '/app/bulletinsfiles' : path.join(process.cwd(), 'bulletinsfiles'));
if (!fs.existsSync(bulletinsFilesDir)) {
  try {
    fs.mkdirSync(bulletinsFilesDir, { recursive: true });
  } catch (e) {
    console.error('掲示板添付ディレクトリ作成失敗:', e);
  }
}

// 外部NAS同期・外部ファイル連携用ディレクトリ
const externalFilesDir = path.join(process.cwd(), 'external-files');
if (!fs.existsSync(externalFilesDir)) {
  fs.mkdirSync(externalFilesDir, { recursive: true });
}

// 画像・添付ファイルをブラウザに配信する静的配信設定 (http://[サーバーのIP]:[PORT]/uploads/xxx.png でアクセス可能にします)
app.use('/uploads', express.static(uploadDir));
app.use('/bulletinsfiles', express.static(bulletinsFilesDir));
app.use('/api/bulletinsfiles', express.static(bulletinsFilesDir));
app.use('/external-files', express.static(externalFilesDir));

// multer ストレージ（保存ファイル命名規則）の設定
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    // 重複を避けるためタイムスタンプを付与
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 2 * 1024 * 1024 }, // 2MB制限
  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('画像ファイルのみアップロード可能です。'), false);
    }
    cb(null, true);
  }
});

// =========================================================
// SQL Server Connection Configuration
// =========================================================
const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'TE!rana%go2361',
  server: process.env.DB_HOST || '192.168.24.50',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'CompanySNSDB',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let globalPool = null;
async function getPool() {
  if (globalPool && globalPool.connected) return globalPool;
  try {
    globalPool = await sql.connect(dbConfig);
    console.log('✅ Connected to MS SQL Server successfully.');
    // Check and add adminIdsJson column to dbo.ChatRooms
    try {
      await globalPool.request().query("IF COL_LENGTH('dbo.ChatRooms', 'adminIdsJson') IS NULL ALTER TABLE dbo.ChatRooms ADD adminIdsJson NVARCHAR(MAX) NULL");
      console.log('✅ Checked/Added adminIdsJson column to dbo.ChatRooms');
    } catch (e) {
      console.warn('⚠️ Failed to alter ChatRooms table:', e.message);
    }
    // Check and add recurrence columns to dbo.Events & make isGoogleSynced/isIcal nullable
    try {
      await globalPool.request().query("IF COL_LENGTH('dbo.Events', 'recurrence') IS NULL ALTER TABLE dbo.Events ADD recurrence NVARCHAR(MAX) NULL; IF COL_LENGTH('dbo.Events', 'recurrenceParentId') IS NULL ALTER TABLE dbo.Events ADD recurrenceParentId VARCHAR(50) NULL; IF COL_LENGTH('dbo.Events', 'recurrenceOriginalDate') IS NULL ALTER TABLE dbo.Events ADD recurrenceOriginalDate VARCHAR(50) NULL; IF COL_LENGTH('dbo.Events', 'recurrenceExceptions') IS NULL ALTER TABLE dbo.Events ADD recurrenceExceptions NVARCHAR(MAX) NULL; IF COL_LENGTH('dbo.Events', 'isGoogleSynced') IS NOT NULL ALTER TABLE dbo.Events ALTER COLUMN isGoogleSynced BIT NULL; IF COL_LENGTH('dbo.Events', 'isIcal') IS NOT NULL ALTER TABLE dbo.Events ALTER COLUMN isIcal BIT NULL;");
      console.log('✅ Checked/Added recurrence columns and made isGoogleSynced/isIcal nullable in dbo.Events');
    } catch (e) {
      console.warn('⚠️ Failed to alter Events table:', e.message);
    }
    // Check and create dbo.notifications table and check dbo.WorkReports new columns
    try {
      await globalPool.request().query(\`
        IF OBJECT_ID('dbo.notifications', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.notifications (
            id NVARCHAR(100) PRIMARY KEY,
            user_id NVARCHAR(100) NOT NULL,
            sender_id NVARCHAR(100) NULL,
            type NVARCHAR(50) NOT NULL,
            title NVARCHAR(255) NOT NULL,
            contents NVARCHAR(MAX) NULL,
            target_id NVARCHAR(100) NULL,
            is_read BIT DEFAULT 0,
            created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
          );
        END
        ELSE
        BEGIN
          IF COL_LENGTH('dbo.notifications', 'user_id') IS NULL ALTER TABLE dbo.notifications ADD user_id NVARCHAR(100) NULL;
          IF COL_LENGTH('dbo.notifications', 'sender_id') IS NULL ALTER TABLE dbo.notifications ADD sender_id NVARCHAR(100) NULL;
          IF COL_LENGTH('dbo.notifications', 'type') IS NULL ALTER TABLE dbo.notifications ADD type NVARCHAR(50) NULL;
          IF COL_LENGTH('dbo.notifications', 'title') IS NULL ALTER TABLE dbo.notifications ADD title NVARCHAR(255) NULL;
          IF COL_LENGTH('dbo.notifications', 'contents') IS NULL ALTER TABLE dbo.notifications ADD contents NVARCHAR(MAX) NULL;
          IF COL_LENGTH('dbo.notifications', 'target_id') IS NULL ALTER TABLE dbo.notifications ADD target_id NVARCHAR(100) NULL;
          IF COL_LENGTH('dbo.notifications', 'is_read') IS NULL ALTER TABLE dbo.notifications ADD is_read BIT DEFAULT 0;
          IF COL_LENGTH('dbo.notifications', 'created_at') IS NULL ALTER TABLE dbo.notifications ADD created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET();
        END

        IF OBJECT_ID('dbo.WorkReports', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.WorkReports (
            id NVARCHAR(100) PRIMARY KEY,
            author_id NVARCHAR(100) NOT NULL,
            supervisor_id NVARCHAR(100) NULL,
            report_type NVARCHAR(50) DEFAULT N'weekly',
            report_date DATE NULL,
            department NVARCHAR(100) NULL,
            week_start_date DATE NULL,
            week_label NVARCHAR(100) NULL,
            tasks NVARCHAR(MAX) NULL,
            achievements NVARCHAR(MAX) NULL,
            issues NVARCHAR(MAX) NULL,
            continued_items NVARCHAR(MAX) NULL,
            next_week_plans NVARCHAR(MAX) NULL,
            status NVARCHAR(50) DEFAULT N'submitted',
            review_feedback NVARCHAR(MAX) NULL,
            reviewed_at DATETIMEOFFSET NULL,
            maintenance_data NVARCHAR(MAX) NULL,
            construction_data NVARCHAR(MAX) NULL,
            sales_data NVARCHAR(MAX) NULL,
            createdAt DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
            updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
          );
        END
        ELSE
        BEGIN
          IF COL_LENGTH('dbo.WorkReports', 'author_id') IS NULL ALTER TABLE dbo.WorkReports ADD author_id NVARCHAR(100) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'supervisor_id') IS NULL ALTER TABLE dbo.WorkReports ADD supervisor_id NVARCHAR(100) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'week_start_date') IS NULL ALTER TABLE dbo.WorkReports ADD week_start_date DATE NULL;
          IF COL_LENGTH('dbo.WorkReports', 'week_label') IS NULL ALTER TABLE dbo.WorkReports ADD week_label NVARCHAR(100) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'tasks') IS NULL ALTER TABLE dbo.WorkReports ADD tasks NVARCHAR(MAX) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'achievements') IS NULL ALTER TABLE dbo.WorkReports ADD achievements NVARCHAR(MAX) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'issues') IS NULL ALTER TABLE dbo.WorkReports ADD issues NVARCHAR(MAX) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'continued_items') IS NULL ALTER TABLE dbo.WorkReports ADD continued_items NVARCHAR(MAX) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'next_week_plans') IS NULL ALTER TABLE dbo.WorkReports ADD next_week_plans NVARCHAR(MAX) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'status') IS NULL ALTER TABLE dbo.WorkReports ADD status NVARCHAR(50) DEFAULT N'submitted';
          IF COL_LENGTH('dbo.WorkReports', 'review_feedback') IS NULL ALTER TABLE dbo.WorkReports ADD review_feedback NVARCHAR(MAX) NULL;
          IF COL_LENGTH('dbo.WorkReports', 'reviewed_at') IS NULL ALTER TABLE dbo.WorkReports ADD reviewed_at DATETIMEOFFSET NULL;
          IF COL_LENGTH('dbo.WorkReports', 'createdAt') IS NULL ALTER TABLE dbo.WorkReports ADD createdAt DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET();
          IF COL_LENGTH('dbo.WorkReports', 'updated_at') IS NULL ALTER TABLE dbo.WorkReports ADD updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET();
        END

        -- System Settings Table (VAPIDキー等の永続化)
        IF OBJECT_ID('dbo.system_settings', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.system_settings (
            setting_key NVARCHAR(100) PRIMARY KEY,
            setting_value NVARCHAR(MAX) NOT NULL,
            updated_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
          );
        END

        -- Push Subscriptions Table (Web Push 端末購読情報永続化)
        IF OBJECT_ID('dbo.push_subscriptions', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.push_subscriptions (
            id NVARCHAR(100) PRIMARY KEY,
            user_id NVARCHAR(100) NOT NULL,
            endpoint NVARCHAR(1000) NOT NULL,
            p256dh NVARCHAR(500) NULL,
            auth NVARCHAR(500) NULL,
            subscription_json NVARCHAR(MAX) NOT NULL,
            user_agent NVARCHAR(500) NULL,
            created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET(),
            last_active_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET()
          );
        END
        ELSE
        BEGIN
          IF COL_LENGTH('dbo.push_subscriptions', 'user_id') IS NULL ALTER TABLE dbo.push_subscriptions ADD user_id NVARCHAR(100) NULL;
          IF COL_LENGTH('dbo.push_subscriptions', 'endpoint') IS NULL ALTER TABLE dbo.push_subscriptions ADD endpoint NVARCHAR(1000) NULL;
          IF COL_LENGTH('dbo.push_subscriptions', 'p256dh') IS NULL ALTER TABLE dbo.push_subscriptions ADD p256dh NVARCHAR(500) NULL;
          IF COL_LENGTH('dbo.push_subscriptions', 'auth') IS NULL ALTER TABLE dbo.push_subscriptions ADD auth NVARCHAR(500) NULL;
          IF COL_LENGTH('dbo.push_subscriptions', 'subscription_json') IS NULL ALTER TABLE dbo.push_subscriptions ADD subscription_json NVARCHAR(MAX) NULL;
          IF COL_LENGTH('dbo.push_subscriptions', 'user_agent') IS NULL ALTER TABLE dbo.push_subscriptions ADD user_agent NVARCHAR(500) NULL;
          IF COL_LENGTH('dbo.push_subscriptions', 'created_at') IS NULL ALTER TABLE dbo.push_subscriptions ADD created_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET();
          IF COL_LENGTH('dbo.push_subscriptions', 'last_active_at') IS NULL ALTER TABLE dbo.push_subscriptions ADD last_active_at DATETIMEOFFSET DEFAULT SYSDATETIMEOFFSET();
        END
      \`);
      console.log('✅ Checked/Updated dbo.notifications, dbo.WorkReports, dbo.system_settings, dbo.push_subscriptions tables in SQL Server');
    } catch (e) {
      console.warn('⚠️ Failed to check/alter notifications/WorkReports tables:', e.message);
    }
    return globalPool;
  } catch (err) {
    globalPool = null;
    console.error('❌ Database connection error:', err.message);
    throw err;
  }
}
getPool().catch(() => {});

/**
 * 文字列を安全に JSON パースするヘルパー関数
 */
function safeParseJSON(jsonString, fallbackValue = []) {
  if (!jsonString || typeof jsonString !== 'string' || jsonString.trim() === '') {
    return fallbackValue;
  }
  try {
    const parsed = JSON.parse(jsonString);
    return parsed !== null ? parsed : fallbackValue;
  } catch (e) {
    console.error('JSON parse error. Value:', jsonString, 'Error:', e.message);
    return fallbackValue;
  }
}

// --- API Endpoints ---

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date(), lastUpdated: '2026-08-21 (URLリッチリンクカード・OGP取得対応版)' }));

// =========================================================
// OGP (Open Graph Protocol) メタデータ取得 API
// =========================================================
const ogpCache = new Map();
const OGP_CACHE_TTL = 1000 * 60 * 60; // 1時間キャッシュ

function decodeHtmlEntities(str) {
  if (!str || typeof str !== 'string') return '';
  return str
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&#(\\d+);/g, (_, dec) => String.fromCharCode(Number(dec)))
    .trim();
}

app.get('/api/ogp', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') {
    return res.status(400).json({ error: 'URLが必要です' });
  }

  let targetUrl = rawUrl.trim();
  if (!/^https?:\\/\\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  // キャッシュ確認
  const cached = ogpCache.get(targetUrl);
  if (cached && Date.now() - cached.timestamp < OGP_CACHE_TTL) {
    return res.json(cached.data);
  }

  try {
    const parsedUrl = new URL(targetUrl);
    const hostname = parsedUrl.hostname;

    // タイムアウト設定付き fetch
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
        favicon: \`https://www.google.com/s2/favicons?domain=\${hostname}&sz=64\`,
      };
      ogpCache.set(targetUrl, { data: result, timestamp: Date.now() });
      return res.json(result);
    }

    const html = await response.text();

    const getMetaContent = (propertyOrName) => {
      const regex1 = new RegExp(\`<meta[^>]+(?:property|name)=["']\${propertyOrName}["'][^>]+content=["']([^"']*)["']\`, 'i');
      const regex2 = new RegExp(\`<meta[^>]+content=["']([^"']*)["'][^>]+(?:property|name)=["']\${propertyOrName}["']\`, 'i');
      const match = html.match(regex1) || html.match(regex2);
      return match ? decodeHtmlEntities(match[1]) : '';
    };

    const titleMatch = html.match(/<title[^>]*>([^<]*)<\\/title>/i);
    const rawTitle = getMetaContent('og:title') || getMetaContent('twitter:title') || (titleMatch ? decodeHtmlEntities(titleMatch[1]) : '') || hostname;
    const title = rawTitle.replace(/\\s+/g, ' ').trim();

    const description = (getMetaContent('og:description') || getMetaContent('twitter:description') || getMetaContent('description') || '').replace(/\\s+/g, ' ').trim();

    let image = getMetaContent('og:image:secure_url') || getMetaContent('og:image') || getMetaContent('twitter:image') || '';
    if (image && !/^https?:\\/\\//i.test(image)) {
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
      favicon = \`https://www.google.com/s2/favicons?domain=\${hostname}&sz=64\`;
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
  } catch (err) {
    const hostname = targetUrl.replace(/^https?:\\/\\//i, '').split('/')[0];
    const fallbackResult = {
      url: targetUrl,
      hostname,
      title: hostname,
      description: '',
      image: '',
      siteName: hostname,
      favicon: \`https://www.google.com/s2/favicons?domain=\${hostname}&sz=64\`,
    };
    ogpCache.set(targetUrl, { data: fallbackResult, timestamp: Date.now() });
    res.json(fallbackResult);
  }
});

// =========================================================
// Web Push (VAPID) 設定・購読情報管理 (DB永続化 & 自動自己修復対応)
// =========================================================
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (e) {
    console.warn('data directory creation warning:', e.message);
  }
}

const vapidKeysPath = path.join(dataDir, 'vapid-keys.json');
let vapidKeys = null;

// 1. 環境変数からの読み込み (VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY)
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
    try { fs.writeFileSync(vapidKeysPath, JSON.stringify(vapidKeys, null, 2), 'utf8'); } catch (err) {}
  }
} else {
  vapidKeys = webpush.generateVAPIDKeys();
  try { fs.writeFileSync(vapidKeysPath, JSON.stringify(vapidKeys, null, 2), 'utf8'); } catch (err) {}
}

try {
  webpush.setVapidDetails(
    process.env.VAPID_EMAIL || 'mailto:admin@example.com',
    vapidKeys.publicKey,
    vapidKeys.privateKey
  );
  console.log('[WebPush] Initial VAPID keys loaded. Public Key:', vapidKeys.publicKey);
} catch (e) {
  console.error('[WebPush] Failed to set VAPID details:', e.message);
}

// データベース (dbo.system_settings) との VAPID キー自動同期
async function syncVapidKeysWithDB() {
  try {
    const pool = await getPool();
    if (!pool) return;

    if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
      await pool.request()
        .input('key', 'vapid_keys')
        .input('val', JSON.stringify(vapidKeys))
        .query(\`
          IF EXISTS (SELECT 1 FROM dbo.system_settings WHERE setting_key = @key)
            UPDATE dbo.system_settings SET setting_value = @val, updated_at = SYSDATETIMEOFFSET() WHERE setting_key = @key;
          ELSE
            INSERT INTO dbo.system_settings (setting_key, setting_value, updated_at) VALUES (@key, @val, SYSDATETIMEOFFSET());
        \`);
      return;
    }

    const result = await pool.request()
      .input('key', 'vapid_keys')
      .query('SELECT setting_value FROM dbo.system_settings WHERE setting_key = @key');

    if (result.recordset && result.recordset.length > 0 && result.recordset[0].setting_value) {
      const savedKeys = JSON.parse(result.recordset[0].setting_value);
      if (savedKeys.publicKey && savedKeys.privateKey) {
        vapidKeys = savedKeys;
        webpush.setVapidDetails(
          process.env.VAPID_EMAIL || 'mailto:admin@example.com',
          vapidKeys.publicKey,
          vapidKeys.privateKey
        );
        try { fs.writeFileSync(vapidKeysPath, JSON.stringify(vapidKeys, null, 2), 'utf8'); } catch (e) {}
        console.log('✅ [WebPush] Restored persistent VAPID keys from SQL Server (Public Key:', vapidKeys.publicKey, ')');
        return;
      }
    }

    // DB に未保存の場合は現在のキーを保存
    await pool.request()
      .input('key', 'vapid_keys')
      .input('val', JSON.stringify(vapidKeys))
      .query(\`
        IF EXISTS (SELECT 1 FROM dbo.system_settings WHERE setting_key = @key)
          UPDATE dbo.system_settings SET setting_value = @val, updated_at = SYSDATETIMEOFFSET() WHERE setting_key = @key;
        ELSE
          INSERT INTO dbo.system_settings (setting_key, setting_value, updated_at) VALUES (@key, @val, SYSDATETIMEOFFSET());
      \`);
    console.log('✅ [WebPush] Saved persistent VAPID keys into SQL Server database.');
  } catch (err) {
    console.warn('⚠️ [WebPush] VAPID DB sync warning:', err.message);
  }
}

// Push Subscription 保存管理 (ファイル & SQL Server dbo.push_subscriptions 連動)
const subscriptionsPath = path.join(dataDir, 'push-subscriptions.json');

function loadSubscriptionsFromFile() {
  if (!fs.existsSync(subscriptionsPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(subscriptionsPath, 'utf8'));
  } catch (e) {
    return [];
  }
}

function saveSubscriptionsToFile(subs) {
  try {
    fs.writeFileSync(subscriptionsPath, JSON.stringify(subs, null, 2), 'utf8');
  } catch (e) {
    console.error('[WebPush] Failed to save subscriptions to file:', e.message);
  }
}

let cachedSubscriptions = loadSubscriptionsFromFile();

async function getAllSubscriptions() {
  try {
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query('SELECT * FROM dbo.push_subscriptions');
      if (result.recordset) {
        const subs = result.recordset.map(row => {
          let subObj = null;
          try { subObj = JSON.parse(row.subscription_json); } catch (e) {}
          if (!subObj) {
            subObj = {
              endpoint: row.endpoint,
              keys: {
                p256dh: row.p256dh,
                auth: row.auth
              }
            };
          }
          return {
            id: row.id,
            userId: row.user_id,
            subscription: subObj,
            userAgent: row.user_agent,
            createdAt: row.created_at,
            lastActiveAt: row.last_active_at
          };
        });
        cachedSubscriptions = subs;
        saveSubscriptionsToFile(subs);
        return subs;
      }
    }
  } catch (err) {
    console.warn('[WebPush] Failed to load subs from DB, using cache:', err.message);
  }
  return cachedSubscriptions;
}

// 起動時にDBからVAPIDキーおよび購読一覧を取得
syncVapidKeysWithDB().then(() => getAllSubscriptions()).catch(() => {});

// VAPID公開鍵取得
app.get('/api/push/vapid-public-key', async (req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

// 端末のPush通知購読登録
app.post('/api/push/subscribe', async (req, res) => {
  try {
    const { userId, subscription, userAgent } = req.body;
    if (!userId || !subscription || !subscription.endpoint) {
      return res.status(400).json({ error: 'ユーザーIDおよび購読情報が必要です。' });
    }

    const subId = 'sub_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
    const p256dh = subscription.keys?.p256dh || null;
    const auth = subscription.keys?.auth || null;
    const endpoint = subscription.endpoint;
    const subJson = JSON.stringify(subscription);
    const now = new Date().toISOString();

    // 1. SQL Server dbo.push_subscriptions へ永続化
    try {
      const pool = await getPool();
      if (pool) {
        await pool.request()
          .input('id', subId)
          .input('userId', String(userId))
          .input('endpoint', endpoint)
          .input('p256dh', p256dh)
          .input('auth', auth)
          .input('subJson', subJson)
          .input('userAgent', userAgent || null)
          .query(\`
            IF EXISTS (SELECT 1 FROM dbo.push_subscriptions WHERE endpoint = @endpoint)
              UPDATE dbo.push_subscriptions 
              SET user_id = @userId, p256dh = @p256dh, auth = @auth, subscription_json = @subJson, user_agent = @userAgent, last_active_at = SYSDATETIMEOFFSET()
              WHERE endpoint = @endpoint;
            ELSE
              INSERT INTO dbo.push_subscriptions (id, user_id, endpoint, p256dh, auth, subscription_json, user_agent, created_at, last_active_at)
              VALUES (@id, @userId, @endpoint, @p256dh, @auth, @subJson, @userAgent, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());
          \`);
      }
    } catch (dbErr) {
      console.warn('⚠️ [WebPush] Failed to persist subscription to DB:', dbErr.message);
    }

    // 2. メモリキャッシュ & ファイルにも保存
    const allSubs = await getAllSubscriptions();
    const existingIdx = allSubs.findIndex(s => s.subscription && s.subscription.endpoint === endpoint);

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
        id: subId,
        userId: String(userId),
        subscription,
        userAgent,
        createdAt: now,
        lastActiveAt: now
      });
    }

    cachedSubscriptions = allSubs;
    saveSubscriptionsToFile(allSubs);

    const userSubCount = allSubs.filter(s => s.userId === String(userId)).length;
    res.json({ success: true, message: '通知の購読を登録・永続化しました。', count: userSubCount });
  } catch (err) {
    console.error('[WebPush] Subscribe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 端末のPush通知購読解除
app.post('/api/push/unsubscribe', async (req, res) => {
  try {
    const { endpoint, userId } = req.body;
    if (!endpoint) {
      return res.status(400).json({ error: '解除対象のエンドポイントが必要です。' });
    }

    // 1. DBから削除
    try {
      const pool = await getPool();
      if (pool) {
        await pool.request()
          .input('endpoint', endpoint)
          .query('DELETE FROM dbo.push_subscriptions WHERE endpoint = @endpoint');
      }
    } catch (dbErr) {
      console.warn('⚠️ [WebPush] Failed to delete subscription from DB:', dbErr.message);
    }

    // 2. キャッシュ & ファイルから削除
    let allSubs = await getAllSubscriptions();
    const initialCount = allSubs.length;
    allSubs = allSubs.filter(s => {
      if (s.subscription && s.subscription.endpoint === endpoint) return false;
      if (userId && s.userId === String(userId) && !endpoint) return false;
      return true;
    });

    cachedSubscriptions = allSubs;
    saveSubscriptionsToFile(allSubs);
    res.json({ success: true, message: '通知の購読を解除しました。', removed: initialCount - allSubs.length });
  } catch (err) {
    console.error('[WebPush] Unsubscribe error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ユーザーの通知購読状態確認
app.get('/api/push/status/:userId', async (req, res) => {
  try {
    const userId = String(req.params.userId);
    const allSubs = await getAllSubscriptions();
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

    const allSubs = await getAllSubscriptions();
    let targets = [];

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
      tag: tag || ('notif_' + Date.now()),
      requireInteraction: requireInteraction !== undefined ? !!requireInteraction : true,
      renotify: renotify !== undefined ? !!renotify : true,
      silent: silent !== undefined ? !!silent : false,
      priority: 'high',
      timestamp: Date.now()
    });

    const pushOptions = {
      TTL: 60 * 60 * 24 * 7, // 7日間 (端末スリープ復帰時にも確実に配信)
      urgency: 'high', // RFC 8030 高優先度 (バッテリーセーバー制限を回避して即時配信)
      headers: {
        'Urgency': 'high',
        ...(tag ? { 'Topic': String(tag).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) } : {})
      }
    };

    const staleEndpoints = [];
    let sentCount = 0;
    let failureCount = 0;

    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, payload, pushOptions);
          sentCount++;
        } catch (err) {
          failureCount++;
          console.error('[WebPush] Push failed for user ' + sub.userId + ':', err.statusCode || err.message);
          if (err.statusCode === 404 || err.statusCode === 410) {
            if (sub.subscription && sub.subscription.endpoint) {
              staleEndpoints.push(sub.subscription.endpoint);
            }
          }
        }
      })
    );

    if (staleEndpoints.length > 0) {
      try {
        const pool = await getPool();
        if (pool) {
          for (const ep of staleEndpoints) {
            await pool.request().input('endpoint', ep).query('DELETE FROM dbo.push_subscriptions WHERE endpoint = @endpoint');
          }
        }
      } catch (e) {}

      const remainingSubs = allSubs.filter(s => !s.subscription || !staleEndpoints.includes(s.subscription.endpoint));
      cachedSubscriptions = remainingSubs;
      saveSubscriptionsToFile(remainingSubs);
      console.log('[WebPush] Pruned ' + staleEndpoints.length + ' stale subscriptions.');
    }

    res.json({
      success: true,
      sentCount,
      failureCount,
      totalTargets: targets.length
    });
  } catch (err) {
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

    const allSubs = await getAllSubscriptions();
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
      requireInteraction: true,
      renotify: true,
      priority: 'high',
      timestamp: Date.now()
    });

    const pushOptions = {
      TTL: 60 * 60 * 24, // 24時間
      urgency: 'high',
      headers: { 'Urgency': 'high' }
    };

    let sentCount = 0;
    const staleEndpoints = [];

    await Promise.all(
      targets.map(async (sub) => {
        try {
          await webpush.sendNotification(sub.subscription, payload, pushOptions);
          sentCount++;
        } catch (err) {
          console.error('[WebPush] Test push error:', err.statusCode || err.message);
          if (err.statusCode === 404 || err.statusCode === 410) {
            if (sub.subscription && sub.subscription.endpoint) {
              staleEndpoints.push(sub.subscription.endpoint);
            }
          }
        }
      })
    );

    if (staleEndpoints.length > 0) {
      try {
        const pool = await getPool();
        if (pool) {
          for (const ep of staleEndpoints) {
            await pool.request().input('endpoint', ep).query('DELETE FROM dbo.push_subscriptions WHERE endpoint = @endpoint');
          }
        }
      } catch (e) {}

      const remainingSubs = allSubs.filter(s => !s.subscription || !staleEndpoints.includes(s.subscription.endpoint));
      cachedSubscriptions = remainingSubs;
      saveSubscriptionsToFile(remainingSubs);
    }

    res.json({
      success: true,
      message: sentCount + '台の端末にテスト通知を送信しました。',
      sentCount
    });
  } catch (err) {
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
const smtpFromFormatted = \`"\${smtpFromName}" <\${smtpFromEmail}>\`;

async function sendEmailNotification(options) {
  if (!options.to || (Array.isArray(options.to) && options.to.length === 0)) {
    throw new Error('送信先メールアドレスが指定されていません。');
  }

  const transporter = nodemailer.createTransport(smtpConfig);
  const mailOptions = {
    from: smtpFromFormatted,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    text: options.text || '',
    html: options.html || (options.text ? \`<p style="white-space: pre-wrap;">\${options.text}</p>\` : '')
  };

  const info = await transporter.sendMail(mailOptions);
  console.log('[Email] Notification sent successfully:', info.messageId, 'to:', options.to);
  return info;
}

// SMTP 設定情報取得 API
app.get(['/api/email/config', '/api/email/config/'], (req, res) => {
  res.json({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.auth.user,
    fromEmail: smtpFromEmail,
    fromName: smtpFromName,
    isConfigured: !!(smtpConfig.host && smtpConfig.auth.user)
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
  } catch (err) {
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

    const nameStr = recipientName ? \`\${recipientName} 様\` : (targetUser?.name ? \`\${targetUser.name} 様\` : '管理者 様');
    const nowStr = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    const subject = '【テストメール】寺岡オートドアSNS メール通知連携テスト';
    const text = \`\${nameStr}\\n\\n寺岡オートドアSNS からのメール通知送信テストです。\\n本メールを受信できている場合、SMTPメール通知機能（\${smtpConfig.host}:\${smtpConfig.port}）の設定および連携は正常に機能しています。\\n\\n送信日時: \${nowStr}\\n差出人: \${smtpFromFormatted}\\n送信先: \${to}\`;
    const html = \`
      <div style="font-family: sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <div style="background-color: #2563eb; color: #ffffff; padding: 12px 16px; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px;">
          <h2 style="margin: 0; font-size: 16px; font-weight: bold;">寺岡オートドアSNS メール通知テスト</h2>
        </div>
        <p style="font-size: 14px; font-weight: bold; margin-bottom: 16px;">\${nameStr}</p>
        <p style="font-size: 13px; color: #334155; margin-bottom: 16px;">
          寺岡オートドアSNS システムからのメール送信機能テストです。<br>
          このメールが正しく届いている場合、SMTPメールサーバーとの通信（\${smtpConfig.host}:\${smtpConfig.port}）は正常に機能しています。
        </p>
        <div style="background-color: #f8fafc; border: 1px solid #cbd5e1; border-radius: 8px; padding: 12px; font-size: 12px; color: #475569; margin-bottom: 16px;">
          <div style="margin-bottom: 4px;"><strong>送信日時:</strong> \${nowStr}</div>
          <div style="margin-bottom: 4px;"><strong>差出人:</strong> \${smtpFromFormatted}</div>
          <div><strong>宛先アドレス:</strong> \${to}</div>
        </div>
        <p style="font-size: 11px; color: #94a3b8; margin: 0; text-align: center; border-top: 1px solid #f1f5f9; padding-top: 12px;">
          本メールは自動送信テストメールです。返信はできません。
        </p>
      </div>
    \`;

    const info = await sendEmailNotification({ to, subject, text, html });
    res.json({
      success: true,
      messageId: info.messageId,
      message: \`\${to} へテストメールを正常に送信しました。\`
    });
  } catch (err) {
    console.error('[Email] Test email error:', err);
    res.status(500).json({ error: err.message || 'テストメールの送信に失敗しました。' });
  }
});

// =========================================================
// アバター画像アップロードAPI
// =========================================================
app.post('/api/upload-avatar', upload.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません。' });
    }
    // フロント側に返却するファイルの相対URLパス
    const avatarUrl = \`/uploads/\${req.file.filename}\`;
    res.json({ avatarUrl });
  } catch (error) {
    console.error('アバターアップロードエラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  }
});

// =========================================================
// 掲示板添付ファイル・汎用ファイルアップロードAPI (/app/bulletinsfiles へ保存)
// =========================================================
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
    const safeFilename = \`\${timeStamp}_\${baseName}\${ext}\`;
    cb(null, safeFilename);
  }
});

const uploadBulletins = multer({
  storage: bulletinsStorage,
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB制限
});

const handleBulletinUpload = (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません。' });
    }
    const fileUrl = \`/bulletinsfiles/\${encodeURIComponent(req.file.filename)}\`;
    res.json({
      message: 'アップロード成功',
      url: fileUrl,
      fileUrl: fileUrl,
      path: fileUrl,
      filename: req.file.filename,
      name: req.file.originalname,
      originalName: req.file.originalname,
      size: (req.file.size / 1024 / 1024).toFixed(2) + ' MB'
    });
  } catch (error) {
    console.error('ファイルアップロードエラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
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
      const displayName = filename.includes('_') ? filename.substring(filename.indexOf('_') + 1) : filename;

      return {
        name: displayName,
        rawFilename: filename,
        path: filename,
        url: \`/bulletinsfiles/\${encodeURIComponent(filename)}\`,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        isDirectory: false,
        extension: ext,
        source: 'bulletin'
      };
    }).filter(Boolean);

    result.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    res.json(result);
  } catch (err) {
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 掲示板添付ファイルの削除 API
app.delete('/api/bulletins/file', (req, res) => {
  try {
    const fileUrl = req.query.fileUrl || req.body?.fileUrl || '';
    const filenameParam = req.query.filename || req.body?.filename || '';

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
      console.log('[Bulletins] 添付ファイルを削除しました: ' + targetPath);
      return res.json({ message: '添付ファイルを削除しました', filename: safeFilename });
    } else {
      return res.status(404).json({ error: '対象の添付ファイルが存在しません', filename: safeFilename });
    }
  } catch (err) {
    console.error('添付ファイル削除エラー:', err);
    res.status(500).json({ error: err.message });
  }
});

// 掲示板添付ファイルの一括削除 API
app.post('/api/bulletins/delete-multiple', (req, res) => {
  try {
    const fileUrls = req.body?.fileUrls || [];
    const deleted = [];
    const errors = [];

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
          } catch (e) {
            errors.push(safeFilename + ': ' + e.message);
          }
        }
      }
    });

    res.json({ message: '添付ファイル一括削除完了', deleted, errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ------------------------------------------
// 1. Masters (Offices, Divisions, Positions, ItemMasters, ApprovalFlows)
// ------------------------------------------

// --- Offices (拠点マスター) ---
const getOfficesHandler = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`SELECT * FROM dbo.OfficeMaster\`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.get('/api/masters/offices', getOfficesHandler);
app.get('/api/offices', getOfficesHandler);

const saveOfficeHandler = async (req, res) => {
  try {
    const item = req.body;
    const pool = await getPool();
    const id = item.id || \`off-\${Date.now()}\`;
    const check = await pool.request().input('id', sql.VarChar, id).query\`SELECT id FROM dbo.Offices WHERE id = @id\`;

    if (check.recordset.length > 0) {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('type', sql.VarChar, item.type || 'branch')
        .input('code', sql.VarChar, item.code || '')
        .input('location', sql.NVarChar, item.location || '')
        .input('phone', sql.VarChar, item.phone || '')
        .query\`UPDATE dbo.Offices SET name = @name, type = @type, code = @code, location = @location, phone = @phone WHERE id = @id\`;
    } else {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('type', sql.VarChar, item.type || 'branch')
        .input('code', sql.VarChar, item.code || '')
        .input('location', sql.NVarChar, item.location || '')
        .input('phone', sql.VarChar, item.phone || '')
        .query\`INSERT INTO dbo.Offices (id, name, type, code, location, phone) VALUES (@id, @name, @type, @code, @location, @phone)\`;
    }
    res.json({ success: true, id, ...item });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.post('/api/masters/offices', saveOfficeHandler);
app.post('/api/offices', saveOfficeHandler);
app.put('/api/masters/offices/:id', saveOfficeHandler);
app.put('/api/offices/:id', saveOfficeHandler);

const deleteOfficeHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, id).query('DELETE FROM dbo.Offices WHERE id = @id');
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.delete('/api/masters/offices/:id', deleteOfficeHandler);
app.delete('/api/offices/:id', deleteOfficeHandler);


// --- Divisions (部署マスター) ---
const getDivisionsHandler = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`SELECT * FROM dbo.DivisionMaster\`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.get('/api/masters/divisions', getDivisionsHandler);
app.get('/api/divisions', getDivisionsHandler);

const saveDivisionHandler = async (req, res) => {
  try {
    const item = req.body;
    const pool = await getPool();
    const id = item.id || \`div-\${Date.now()}\`;
    const check = await pool.request().input('id', sql.VarChar, id).query\`SELECT id FROM dbo.Divisions WHERE id = @id\`;

    if (check.recordset.length > 0) {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('code', sql.VarChar, item.code || '')
        .input('description', sql.NVarChar, item.description || '')
        .query\`UPDATE dbo.Divisions SET name = @name, code = @code, description = @description WHERE id = @id\`;
    } else {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('code', sql.VarChar, item.code || '')
        .input('description', sql.NVarChar, item.description || '')
        .query\`INSERT INTO dbo.Divisions (id, name, code, description) VALUES (@id, @name, @code, @description)\`;
    }
    res.json({ success: true, id, ...item });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.post('/api/masters/divisions', saveDivisionHandler);
app.post('/api/divisions', saveDivisionHandler);
app.put('/api/masters/divisions/:id', saveDivisionHandler);
app.put('/api/divisions/:id', saveDivisionHandler);

const deleteDivisionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, id).query('DELETE FROM dbo.Divisions WHERE id = @id');
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.delete('/api/masters/divisions/:id', deleteDivisionHandler);
app.delete('/api/divisions/:id', deleteDivisionHandler);


// --- Positions (役職マスター) ---
const getPositionsHandler = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`SELECT * FROM dbo.PositionMaster\`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.get('/api/masters/positions', getPositionsHandler);
app.get('/api/positions', getPositionsHandler);

const savePositionHandler = async (req, res) => {
  try {
    const item = req.body;
    const pool = await getPool();
    const id = item.id || \`pos-\${Date.now()}\`;
    const check = await pool.request().input('id', sql.VarChar, id).query\`SELECT id FROM dbo.Positions WHERE id = @id\`;

    if (check.recordset.length > 0) {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('code', sql.VarChar, item.code || '')
        .input('description', sql.NVarChar, item.description || '')
        .query\`UPDATE dbo.Positions SET name = @name, code = @code, description = @description WHERE id = @id\`;
    } else {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('code', sql.VarChar, item.code || '')
        .input('description', sql.NVarChar, item.description || '')
        .query\`INSERT INTO dbo.Positions (id, name, code, description) VALUES (@id, @name, @code, @description)\`;
    }
    res.json({ success: true, id, ...item });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.post('/api/masters/positions', savePositionHandler);
app.post('/api/positions', savePositionHandler);
app.put('/api/masters/positions/:id', savePositionHandler);
app.put('/api/positions/:id', savePositionHandler);

const deletePositionHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, id).query('DELETE FROM dbo.Positions WHERE id = @id');
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.delete('/api/masters/positions/:id', deletePositionHandler);
app.delete('/api/positions/:id', deletePositionHandler);


// --- ItemMasters (品名マスター) ---
const getItemMastersHandler = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`SELECT * FROM dbo.ItemMasters\`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.get('/api/masters/item-masters', getItemMastersHandler);
app.get('/api/item-masters', getItemMastersHandler);

const saveItemMasterHandler = async (req, res) => {
  try {
    const item = req.body;
    const pool = await getPool();
    const id = item.id || \`itm_\${Date.now()}\`;
    const check = await pool.request().input('id', sql.VarChar, id).query\`SELECT id FROM dbo.ItemMasters WHERE id = @id\`;

    if (check.recordset.length > 0) {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('category', sql.NVarChar, item.category || '')
        .input('defaultUnitPrice', sql.Int, item.defaultUnitPrice || 0)
        .input('unit', sql.NVarChar, item.unit || '')
        .input('code', sql.VarChar, item.code || '')
        .query\`UPDATE dbo.ItemMasters SET name = @name, category = @category, defaultUnitPrice = @defaultUnitPrice, unit = @unit, code = @code WHERE id = @id\`;
    } else {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('category', sql.NVarChar, item.category || '')
        .input('defaultUnitPrice', sql.Int, item.defaultUnitPrice || 0)
        .input('unit', sql.NVarChar, item.unit || '')
        .input('code', sql.VarChar, item.code || '')
        .query\`INSERT INTO dbo.ItemMasters (id, name, category, defaultUnitPrice, unit, code) VALUES (@id, @name, @category, @defaultUnitPrice, @unit, @code)\`;
    }
    res.json({ success: true, id, ...item });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.post('/api/masters/item-masters', saveItemMasterHandler);
app.post('/api/item-masters', saveItemMasterHandler);
app.put('/api/masters/item-masters/:id', saveItemMasterHandler);
app.put('/api/item-masters/:id', saveItemMasterHandler);

const deleteItemMasterHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, id).query('DELETE FROM dbo.ItemMasters WHERE id = @id');
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.delete('/api/masters/item-masters/:id', deleteItemMasterHandler);
app.delete('/api/item-masters/:id', deleteItemMasterHandler);


// --- ApprovalFlows (承認フロー) ---
const getApprovalFlowsHandler = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM dbo.ApprovalFlows');
    const recordset = result.recordset || [];
    
    const formattedFlows = recordset.map(row => {
      let steps = [];
      if (row.stepsJson) {
        steps = safeParseJSON(row.stepsJson, []);
      }
      return {
        id: row.id,
        name: row.name,
        description: row.description || '',
        targetApplicationType: row.targetApplicationType || 'all',
        steps: steps,
        isDefault: row.isDefault === 1 || row.isDefault === true || !!row.isDefault
      };
    });
    res.json(formattedFlows);
  } catch (error) {
    console.error('Failed to fetch approval flows:', error);
    res.status(500).json({ 
      error: '承認フローの取得に失敗しました。', 
      details: error.message 
    });
  }
};
app.get('/api/masters/approval-flows', getApprovalFlowsHandler);
app.get('/api/approval-flows', getApprovalFlowsHandler);

const saveApprovalFlowHandler = async (req, res) => {
  try {
    const item = req.body;
    const pool = await getPool();
    const id = item.id || \`flow-\${Date.now()}\`;
    const check = await pool.request().input('id', sql.VarChar, id).query('SELECT id FROM dbo.ApprovalFlows WHERE id = @id');

    const stepsJson = JSON.stringify(item.steps || []);
    const isDefaultVal = item.isDefault ? 1 : 0;

    if (check.recordset.length > 0) {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('description', sql.NVarChar, item.description || '')
        .input('targetApplicationType', sql.NVarChar, item.targetApplicationType || 'all')
        .input('stepsJson', sql.NVarChar, stepsJson)
        .input('isDefault', sql.Bit, isDefaultVal)
        .query('UPDATE dbo.ApprovalFlows SET name = @name, description = @description, targetApplicationType = @targetApplicationType, stepsJson = @stepsJson, isDefault = @isDefault WHERE id = @id');
    } else {
      await pool.request()
        .input('id', sql.VarChar, id)
        .input('name', sql.NVarChar, item.name || '')
        .input('description', sql.NVarChar, item.description || '')
        .input('targetApplicationType', sql.NVarChar, item.targetApplicationType || 'all')
        .input('stepsJson', sql.NVarChar, stepsJson)
        .input('isDefault', sql.Bit, isDefaultVal)
        .query('INSERT INTO dbo.ApprovalFlows (id, name, description, targetApplicationType, stepsJson, isDefault) VALUES (@id, @name, @description, @targetApplicationType, @stepsJson, @isDefault)');
    }
    res.json({ success: true, id, ...item });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.post('/api/masters/approval-flows', saveApprovalFlowHandler);
app.post('/api/approval-flows', saveApprovalFlowHandler);
app.put('/api/masters/approval-flows/:id', saveApprovalFlowHandler);
app.put('/api/approval-flows/:id', saveApprovalFlowHandler);

const deleteApprovalFlowHandler = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, id).query('DELETE FROM dbo.ApprovalFlows WHERE id = @id');
    res.json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
};
app.delete('/api/masters/approval-flows/:id', deleteApprovalFlowHandler);
app.delete('/api/approval-flows/:id', deleteApprovalFlowHandler);


// ------------------------------------------
// 2. Users (ユーザー情報)
// ------------------------------------------
app.get('/api/users', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`SELECT * FROM dbo.Users\`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
  try {
    const u = req.body;
    const pool = await getPool();
    const userId = u.id || \`u-\${Date.now()}\`;
    const check = await pool.request().input('id', sql.VarChar, userId).query\`SELECT id FROM dbo.Users WHERE id = @id\`;
    
    if (check.recordset.length > 0) {
      await pool.request()
        .input('id', sql.VarChar, userId)
        .input('loginId', sql.VarChar, u.loginId || u.id || userId)
        .input('password', sql.VarChar, u.password || 'password')
        .input('name', sql.NVarChar, u.name || '')
        .input('kanaName', sql.NVarChar, u.kanaName || '')
        .input('department', sql.NVarChar, u.department || '')
        .input('office', sql.NVarChar, u.office || '')
        .input('division', sql.NVarChar, u.division || '')
        .input('position', sql.NVarChar, u.position || '')
        .input('role', sql.VarChar, u.role || 'user')
        .input('isAdmin', sql.Bit, u.isAdmin ? 1 : 0)
        .input('avatarUrl', sql.NVarChar, u.avatarUrl || '')
        .input('email', sql.NVarChar, u.email || '')
        .input('mobileEmail', sql.NVarChar, u.mobileEmail || '')
        .input('phone', sql.NVarChar, u.phone || '')
        .input('phoneOutside', sql.NVarChar, u.phoneOutside || '')
        .input('phoneExtension', sql.NVarChar, u.phoneExtension || '')
        .input('mobilePhone', sql.NVarChar, u.mobilePhone || '')
        .input('icalUrl', sql.NVarChar, u.icalUrl || '')
        .input('supervisorId', sql.VarChar, u.supervisorId || null)
        .input('preferences', sql.NVarChar, typeof u.preferences === 'object' ? JSON.stringify(u.preferences) : (u.preferences || null))
        .query\`
          UPDATE dbo.Users 
          SET loginId = @loginId,
              password = @password,
              name = @name, 
              kanaName = @kanaName,
              department = @department, 
              office = @office, 
              division = @division, 
              position = @position, 
              role = @role, 
              isAdmin = @isAdmin, 
              avatarUrl = @avatarUrl, 
              email = @email,
              mobileEmail = @mobileEmail,
              phone = @phone,
              phoneOutside = @phoneOutside,
              phoneExtension = @phoneExtension,
              mobilePhone = @mobilePhone,
              icalUrl = @icalUrl,
              supervisorId = @supervisorId,
              preferences = @preferences
          WHERE id = @id
        \`;
    } else {
      await pool.request()
        .input('id', sql.VarChar, userId)
        .input('loginId', sql.VarChar, u.loginId || u.id || userId)
        .input('password', sql.VarChar, u.password || 'password')
        .input('name', sql.NVarChar, u.name || '')
        .input('kanaName', sql.NVarChar, u.kanaName || '')
        .input('department', sql.NVarChar, u.department || '')
        .input('office', sql.NVarChar, u.office || '')
        .input('division', sql.NVarChar, u.division || '')
        .input('position', sql.NVarChar, u.position || '')
        .input('role', sql.VarChar, u.role || 'user')
        .input('isAdmin', sql.Bit, u.isAdmin ? 1 : 0)
        .input('avatarUrl', sql.NVarChar, u.avatarUrl || '')
        .input('email', sql.NVarChar, u.email || '')
        .input('mobileEmail', sql.NVarChar, u.mobileEmail || '')
        .input('phone', sql.NVarChar, u.phone || '')
        .input('phoneOutside', sql.NVarChar, u.phoneOutside || '')
        .input('phoneExtension', sql.NVarChar, u.phoneExtension || '')
        .input('mobilePhone', sql.NVarChar, u.mobilePhone || '')
        .input('icalUrl', sql.NVarChar, u.icalUrl || '')
        .input('supervisorId', sql.VarChar, u.supervisorId || null)
        .input('preferences', sql.NVarChar, typeof u.preferences === 'object' ? JSON.stringify(u.preferences) : (u.preferences || null))
        .query\`
          INSERT INTO dbo.Users (id, loginId, password, name, kanaName, department, office, division, position, role, isAdmin, avatarUrl, email, mobileEmail, phone, phoneOutside, phoneExtension, mobilePhone, icalUrl, supervisorId, preferences)
          VALUES (@id, @loginId, @password, @name, @kanaName, @department, @office, @division, @position, @role, @isAdmin, @avatarUrl, @email, @mobileEmail, @phone, @phoneOutside, @phoneExtension, @mobilePhone, @icalUrl, @supervisorId, @preferences)
        \`;
    }
    res.json({ id: userId, message: 'ユーザー保存成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id/preferences', async (req, res) => {
  try {
    const userId = req.params.id;
    const preferences = req.body;
    const pool = await getPool();
    const prefStr = typeof preferences === 'object' ? JSON.stringify(preferences) : preferences;
    await pool.request()
      .input('id', sql.VarChar, userId)
      .input('preferences', sql.NVarChar, prefStr)
      .query('UPDATE dbo.Users SET preferences = @preferences WHERE id = @id');
    res.json({ success: true, message: '個人設定・マイページ並び順を保存しました。' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', async (req, res) => {
  req.body.id = req.params.id;
  app._router.handle({ ...req, method: 'POST', url: '/api/users' }, res);
});

app.delete('/api/users/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query('DELETE FROM dbo.Users WHERE id = @id');
    res.json({ message: 'ユーザー削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 3. Timeline / Posts (タイムライン投稿)
// ------------------------------------------
app.get('/api/posts', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`
      SELECT p.*, 
             u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl, u.office AS authorOffice, u.division AS authorDivision
      FROM dbo.Posts p
      LEFT JOIN dbo.Users u ON p.authorId = u.id
      ORDER BY p.createdAt DESC
    \`;
    
    let tagsMap = {};
    try {
      const tagsResult = await pool.request().query\`SELECT postId, tag FROM dbo.PostTags\`;
      (tagsResult.recordset || []).forEach(row => {
        if (!tagsMap[row.postId]) tagsMap[row.postId] = [];
        tagsMap[row.postId].push(row.tag);
      });
    } catch (_) {}

    const posts = (result.recordset || []).map(row => {
      let tags = tagsMap[row.id] || [];
      if (tags.length === 0 && row.tags) {
        tags = typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()) : row.tags;
      }
      return {
        id: String(row.id),
        author: {
          id: row.authorId,
          name: row.authorName || '不明',
          department: row.authorDepartment || '',
          avatarUrl: row.authorAvatarUrl || '',
          office: row.authorOffice || '',
          division: row.authorDivision || ''
        },
        authorId: row.authorId,
        content: row.content,
        tags: tags,
        createdAt: row.createdAt,
        likes: row.likes || 0,
        isLiked: row.isLiked ? true : false,
        nasLink: row.nasLink || null
      };
    });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { authorId, content, tags, nasLink } = req.body;
    const pool = await getPool();
    const id = req.body.id || \`p-\${Date.now()}\`;
    const tagStr = Array.isArray(tags) ? tags.join(',') : (tags || '');

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('authorId', sql.VarChar, authorId || 'u1')
      .input('content', sql.NVarChar, content || '')
      .input('tags', sql.NVarChar, tagStr)
      .input('nasLink', sql.NVarChar, nasLink || null)
      .query\`
        INSERT INTO dbo.Posts (id, authorId, content, createdAt, likes, isLiked, nasLink, tags) 
        VALUES (@id, @authorId, @content, GETDATE(), 0, 0, @nasLink, @tags)
      \`;

    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (t) {
          try {
            await pool.request()
              .input('postId', sql.VarChar, String(id))
              .input('tag', sql.NVarChar, t)
              .query\`INSERT INTO dbo.PostTags (postId, tag) VALUES (@postId, @tag)\`;
          } catch (_) {}
        }
      }
    }
    res.status(201).json({ id, message: '投稿完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query\`UPDATE dbo.Posts SET likes = likes + 1, isLiked = 1 WHERE id = @id\`;
    res.json({ message: 'いいね完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query('DELETE FROM dbo.Posts WHERE id = @id');
    try {
      await pool.request().input('postId', sql.VarChar, String(req.params.id)).query('DELETE FROM dbo.PostTags WHERE postId = @postId');
    } catch (_) {}
    res.json({ message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 4. Calendar / Events (カレンダー行事)
// ------------------------------------------
app.get('/api/events', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`SELECT * FROM dbo.Events ORDER BY startAt ASC\`;
    const events = (result.recordset || []).map(row => ({
      id: String(row.id),
      title: row.title,
      startAt: row.startAt,
      endAt: row.endAt,
      isAllDay: row.isAllDay ? true : false,
      category: row.category || 'general',
      description: row.description || '',
      location: row.location || '',
      office: row.office || '',
      division: row.division || '',
      attachments: safeParseJSON(row.attachments, []),
      recurrence: safeParseJSON(row.recurrence, null),
      recurrenceParentId: row.recurrenceParentId || null,
      recurrenceOriginalDate: row.recurrenceOriginalDate || null,
      recurrenceExceptions: safeParseJSON(row.recurrenceExceptions, []),
      status: row.status || 'published',
      targetYearMonth: row.targetYearMonth || null,
      draftSavedAt: row.draftSavedAt || null
    }));
    res.json(events);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/events', async (req, res) => {
  try {
    const {
      title,
      startAt,
      endAt,
      isAllDay,
      category,
      description,
      location,
      office,
      division,
      attendees,
      memo,
      attachments,
      recurrence,
      recurrenceParentId,
      recurrenceOriginalDate,
      recurrenceExceptions
    } = req.body;
    const pool = await getPool();
    const id = req.body.id || \`e-\${Date.now()}\`;
    
    let descValue = description;
    if (typeof descValue === 'object') {
      descValue = JSON.stringify(descValue);
    } else if (!descValue && (attendees || memo)) {
      descValue = JSON.stringify({ attendees: attendees || [], memo: memo || '' });
    }

    const parseDate = (val, fallback) => {
      if (!val) return fallback;
      const d = new Date(val);
      return isNaN(d.getTime()) ? fallback : d;
    };

    const validStart = parseDate(startAt, new Date());
    const validEnd = parseDate(endAt, validStart);

    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;
    const recurrenceStr = recurrence ? (typeof recurrence === 'object' ? JSON.stringify(recurrence) : recurrence) : null;
    const exceptionsStr = recurrenceExceptions ? (typeof recurrenceExceptions === 'object' ? JSON.stringify(recurrenceExceptions) : recurrenceExceptions) : null;

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '予定')
      .input('startAt', sql.DateTime2, validStart)
      .input('endAt', sql.DateTime2, validEnd)
      .input('isAllDay', sql.Bit, isAllDay ? 1 : 0)
      .input('category', sql.NVarChar, category || 'general')
      .input('description', sql.NVarChar, descValue || '')
      .input('location', sql.NVarChar, location || '')
      .input('office', sql.NVarChar, office || '')
      .input('division', sql.NVarChar, division || '')
      .input('attachments', sql.NVarChar, attachStr)
      .input('recurrence', sql.NVarChar, recurrenceStr)
      .input('recurrenceParentId', sql.VarChar, recurrenceParentId || null)
      .input('recurrenceOriginalDate', sql.VarChar, recurrenceOriginalDate || null)
      .input('recurrenceExceptions', sql.NVarChar, exceptionsStr)
      .query\`
        INSERT INTO dbo.Events (
          id, title, startAt, endAt, isAllDay, category, description, 
          location, office, division, attachments,
          recurrence, recurrenceParentId, recurrenceOriginalDate, recurrenceExceptions
        ) 
        VALUES (
          @id, @title, @startAt, @endAt, @isAllDay, @category, @description, 
          @location, @office, @division, @attachments,
          @recurrence, @recurrenceParentId, @recurrenceOriginalDate, @recurrenceExceptions
        )
      \`;
    res.status(201).json({ id, message: '予定登録完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const {
      title,
      startAt,
      endAt,
      isAllDay,
      category,
      description,
      location,
      office,
      division,
      attendees,
      memo,
      attachments,
      recurrence,
      recurrenceParentId,
      recurrenceOriginalDate,
      recurrenceExceptions
    } = req.body;
    const pool = await getPool();
    const id = req.params.id;

    let descValue = description;
    if (typeof descValue === 'object') {
      descValue = JSON.stringify(descValue);
    } else if (!descValue && (attendees || memo)) {
      descValue = JSON.stringify({ attendees: attendees || [], memo: memo || '' });
    }

    const parseDate = (val, fallback) => {
      if (!val) return fallback;
      const d = new Date(val);
      return isNaN(d.getTime()) ? fallback : d;
    };

    const validStart = parseDate(startAt, new Date());
    const validEnd = parseDate(endAt, validStart);

    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;
    const recurrenceStr = recurrence !== undefined ? (typeof recurrence === 'object' && recurrence !== null ? JSON.stringify(recurrence) : recurrence) : null;
    const exceptionsStr = recurrenceExceptions !== undefined ? (typeof recurrenceExceptions === 'object' && recurrenceExceptions !== null ? JSON.stringify(recurrenceExceptions) : recurrenceExceptions) : null;

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '予定')
      .input('startAt', sql.DateTime2, validStart)
      .input('endAt', sql.DateTime2, validEnd)
      .input('isAllDay', sql.Bit, isAllDay ? 1 : 0)
      .input('category', sql.NVarChar, category || 'general')
      .input('description', sql.NVarChar, descValue || '')
      .input('location', sql.NVarChar, location || '')
      .input('office', sql.NVarChar, office || '')
      .input('division', sql.NVarChar, division || '')
      .input('attachments', sql.NVarChar, attachStr)
      .input('recurrence', sql.NVarChar, recurrenceStr)
      .input('recurrenceParentId', sql.VarChar, recurrenceParentId || null)
      .input('recurrenceOriginalDate', sql.VarChar, recurrenceOriginalDate || null)
      .input('recurrenceExceptions', sql.NVarChar, exceptionsStr)
      .query\`
        UPDATE dbo.Events 
        SET title = @title, startAt = @startAt, endAt = @endAt, isAllDay = @isAllDay, 
            category = @category, description = @description, location = @location, 
            office = @office, division = @division, attachments = @attachments,
            recurrence = @recurrence, recurrenceParentId = @recurrenceParentId,
            recurrenceOriginalDate = @recurrenceOriginalDate, recurrenceExceptions = @recurrenceExceptions
        WHERE id = @id
      \`;
    res.json({ message: '予定更新完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query('DELETE FROM dbo.Events WHERE id = @id');
    res.json({ message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 4-B. Inspection Drafts & Carry-overs (月間点検スケジューラー 下書き・翌月繰越管理: SQL Server + File 二重冗長化)
// ------------------------------------------
const inspectionDraftsFile = path.join(process.cwd(), 'data', 'inspection-drafts.json');
const loadInspectionDraftsData = () => {
  if (fs.existsSync(inspectionDraftsFile)) {
    try {
      return JSON.parse(fs.readFileSync(inspectionDraftsFile, 'utf8'));
    } catch (e) {
      return [];
    }
  }
  return [];
};
const saveInspectionDraftsData = (drafts) => {
  const dir = path.dirname(inspectionDraftsFile);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(inspectionDraftsFile, JSON.stringify(drafts, null, 2), 'utf8');
};

// SQL Server の dbo.InspectionDrafts 自動初期化
const ensureInspectionDraftsTable = async (pool) => {
  try {
    await pool.request().query(\`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionDrafts' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.InspectionDrafts (
          targetYearMonth VARCHAR(10) NOT NULL PRIMARY KEY,
          itemsJson NVARCHAR(MAX) NOT NULL,
          currentStep VARCHAR(50) NULL,
          lastSavedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
          savedByUserId VARCHAR(50) NULL,
          savedByUserName NVARCHAR(100) NULL,
          updatedBy NVARCHAR(100) NULL
        );
      END
    \`);
  } catch (e) {
    console.warn('[SQL] InspectionDrafts table auto-init notice:', e.message);
  }
};

app.get(['/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], async (req, res) => {
  try {
    const targetYearMonth = req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || (req.body && req.body.targetYearMonth) || new Date().toISOString().slice(0, 7);
    
    // 1. まず SQL Server から検索
    try {
      const pool = await getPool();
      await ensureInspectionDraftsTable(pool);
      const sqlRes = await pool.request()
        .input('targetYearMonth', sql.VarChar, String(targetYearMonth))
        .query('SELECT * FROM dbo.InspectionDrafts WHERE targetYearMonth = @targetYearMonth');
      
      if (sqlRes.recordset && sqlRes.recordset.length > 0) {
        const row = sqlRes.recordset[0];
        let items = [];
        try { items = JSON.parse(row.itemsJson); } catch (_) { items = []; }
        return res.json({
          exists: true,
          targetYearMonth: row.targetYearMonth,
          items: Array.isArray(items) ? items : [],
          currentStep: row.currentStep || 'assign_date',
          lastSavedAt: row.lastSavedAt,
          savedByUserId: row.savedByUserId,
          savedByUserName: row.savedByUserName,
          storage: 'sql'
        });
      }
    } catch (sqlErr) {
      console.warn('[SQL] Draft fetch notice, checking JSON file fallback:', sqlErr.message);
    }

    // 2. SQL になければローカルJSONファイルから検索
    const drafts = loadInspectionDraftsData();
    const draft = drafts.find(d => d.targetYearMonth === targetYearMonth);
    if (!draft) {
      return res.json({ exists: false, targetYearMonth, items: [], lastSavedAt: null, currentStep: 'assign_date', storage: 'none' });
    }
    res.json({ exists: true, ...draft, storage: 'file' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post(['/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], async (req, res) => {
  try {
    const targetYearMonth = req.body?.targetYearMonth || req.params?.targetYearMonth || req.query?.targetYearMonth || req.headers['x-target-year-month'] || new Date().toISOString().slice(0, 7);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const currentStep = req.body?.currentStep || 'assign_date';
    const nowIso = req.body?.lastSavedAt || new Date().toISOString();
    const savedByUserId = req.body?.savedByUserId || null;
    const savedByUserName = req.body?.savedByUserName || null;
    const updatedBy = req.body?.savedByUserName || req.body?.updatedBy || 'system';
    const itemsJson = JSON.stringify(items);

    let savedToSql = false;

    // 1. SQL Server に UPSERT 保存
    try {
      const pool = await getPool();
      await ensureInspectionDraftsTable(pool);
      await pool.request()
        .input('targetYearMonth', sql.VarChar, String(targetYearMonth))
        .input('itemsJson', sql.NVarChar(sql.MAX), itemsJson)
        .input('currentStep', sql.VarChar, currentStep)
        .input('savedByUserId', sql.VarChar, savedByUserId)
        .input('savedByUserName', sql.NVarChar, savedByUserName)
        .input('updatedBy', sql.NVarChar, updatedBy)
        .query(\`
          IF EXISTS (SELECT 1 FROM dbo.InspectionDrafts WHERE targetYearMonth = @targetYearMonth)
          BEGIN
            UPDATE dbo.InspectionDrafts
            SET itemsJson = @itemsJson, currentStep = @currentStep, lastSavedAt = GETDATE(),
                savedByUserId = @savedByUserId, savedByUserName = @savedByUserName, updatedBy = @updatedBy
            WHERE targetYearMonth = @targetYearMonth
          END
          ELSE
          BEGIN
            INSERT INTO dbo.InspectionDrafts (targetYearMonth, itemsJson, currentStep, lastSavedAt, savedByUserId, savedByUserName, updatedBy)
            VALUES (@targetYearMonth, @itemsJson, @currentStep, GETDATE(), @savedByUserId, @savedByUserName, @updatedBy)
          END
        \`);
      savedToSql = true;
    } catch (sqlErr) {
      console.warn('[SQL] Draft save notice, backup to JSON file:', sqlErr.message);
    }

    // 2. ローカルJSONファイルにもバックアップ保存 (二重冗長)
    try {
      const drafts = loadInspectionDraftsData();
      const existingIndex = drafts.findIndex(d => d.targetYearMonth === targetYearMonth);
      const draftPayload = {
        targetYearMonth,
        items,
        currentStep,
        lastSavedAt: nowIso,
        savedByUserId,
        savedByUserName,
        updatedBy
      };
      if (existingIndex >= 0) {
        drafts[existingIndex] = draftPayload;
      } else {
        drafts.push(draftPayload);
      }
      saveInspectionDraftsData(drafts);
    } catch (_) {}

    res.json({
      success: true,
      targetYearMonth,
      itemCount: items.length,
      lastSavedAt: nowIso,
      savedByUserName,
      storage: savedToSql ? 'sql' : 'file'
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete(['/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], async (req, res) => {
  try {
    const targetYearMonth = req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || req.body?.targetYearMonth;
    if (!targetYearMonth) {
      return res.json({ success: true, message: '対象年月なし' });
    }

    // 1. SQL Server から削除
    try {
      const pool = await getPool();
      await ensureInspectionDraftsTable(pool);
      await pool.request()
        .input('targetYearMonth', sql.VarChar, String(targetYearMonth))
        .query('DELETE FROM dbo.InspectionDrafts WHERE targetYearMonth = @targetYearMonth');
    } catch (_) {}

    // 2. JSONファイルから削除
    try {
      let drafts = loadInspectionDraftsData();
      drafts = drafts.filter(d => d.targetYearMonth !== targetYearMonth);
      saveInspectionDraftsData(drafts);
    } catch (_) {}

    res.json({ success: true, message: \`\${targetYearMonth} の下書きをクリアしました。\` });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get(['/api/inspection/carry-overs', '/api/inspection/carry-overs/:targetYearMonth'], async (req, res) => {
  try {
    const targetYearMonth = req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || (req.body && req.body.targetYearMonth) || new Date().toISOString().slice(0, 7);
    const [yearStr, monthStr] = String(targetYearMonth).split('-');
    const year = parseInt(yearStr, 10) || new Date().getFullYear();
    const month = parseInt(monthStr, 10) || (new Date().getMonth() + 1);
    let prevYear = year;
    let prevMonthNum = month - 1;
    if (prevMonthNum <= 0) {
      prevMonthNum = 12;
      prevYear -= 1;
    }
    const prevMonth = \`\${prevYear}-\${String(prevMonthNum).padStart(2, '0')}\`;

    let prevItems = null;

    // 1. SQL Server から前月下書きを検索
    try {
      const pool = await getPool();
      await ensureInspectionDraftsTable(pool);
      const sqlRes = await pool.request()
        .input('targetYearMonth', sql.VarChar, String(prevMonth))
        .query('SELECT itemsJson FROM dbo.InspectionDrafts WHERE targetYearMonth = @targetYearMonth');
      if (sqlRes.recordset && sqlRes.recordset.length > 0) {
        try { prevItems = JSON.parse(sqlRes.recordset[0].itemsJson); } catch (_) { prevItems = null; }
      }
    } catch (_) {}

    // 2. JSONファイルから検索
    if (!prevItems) {
      const drafts = loadInspectionDraftsData();
      const prevDraft = drafts.find(d => d.targetYearMonth === prevMonth);
      if (prevDraft && Array.isArray(prevDraft.items)) {
        prevItems = prevDraft.items;
      }
    }

    if (!Array.isArray(prevItems)) {
      return res.json({ currentMonth: targetYearMonth, prevMonth, carriedOverCount: 0, carriedOverItems: [] });
    }

    const carriedOverItems = prevItems.filter(item => item.status === 'carried_over');
    res.json({
      currentMonth: targetYearMonth,
      prevMonth,
      carriedOverCount: carriedOverItems.length,
      carriedOverItems: carriedOverItems.map(item => ({
        ...item,
        status: 'pending',
        targetYearMonth: targetYearMonth,
        carriedOverFrom: prevMonth,
        assignedDate: undefined,
        assignedStartTime: undefined,
        assignedEndTime: undefined
      }))
    });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 5. Workflows (電子決裁・申請)
// ------------------------------------------
app.get('/api/workflows', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`
      SELECT w.*, u.name AS applicantName, u.department AS applicantDepartment, u.avatarUrl AS applicantAvatarUrl
      FROM dbo.Workflows w
      LEFT JOIN dbo.Users u ON w.applicantId = u.id
      ORDER BY w.createdAt DESC
    \`;
    const list = (result.recordset || []).map(row => ({
      id: String(row.id),
      title: row.title,
      applicantId: row.applicantId,
      applicant: {
        id: row.applicantId,
        name: row.applicantName || '不明',
        department: row.applicantDepartment || '',
        avatarUrl: row.applicantAvatarUrl || ''
      },
      approverId: row.approverId,
      status: row.status,
      createdAt: row.createdAt,
      category: row.category,
      purchaseOrderNumber: row.purchaseOrderNumber || undefined,
      constructionDate: row.constructionDate || undefined,
      linkedInventoryIssueId: row.linkedInventoryIssueId || undefined,
      details: row.details,
      attachments: safeParseJSON(row.attachments, [])
    }));
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workflows', async (req, res) => {
  try {
    const { title, description, applicantId, approverId, status, category, details, attachments, purchaseOrderNumber, constructionDate, linkedInventoryIssueId } = req.body;
    const pool = await getPool();
    const id = req.body.id || \`w-\${Date.now()}\`;
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || '');
    const workflowCategory = category || 'general';
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '無題の申請')
      .input('description', sql.NVarChar, description || title || '')
      .input('applicantId', sql.VarChar, applicantId || 'u1')
      .input('approverId', sql.VarChar, approverId || 'u1')
      .input('status', sql.NVarChar, status || '承認待ち')
      .input('category', sql.NVarChar, workflowCategory)
      .input('type', sql.NVarChar, workflowCategory)
      .input('purchaseOrderNumber', sql.NVarChar, purchaseOrderNumber || null)
      .input('constructionDate', sql.NVarChar, constructionDate || null)
      .input('linkedInventoryIssueId', sql.VarChar, linkedInventoryIssueId || null)
      .input('details', sql.NVarChar, detailsStr)
      .input('attachments', sql.NVarChar, attachStr)
      .query\`
        INSERT INTO dbo.Workflows (id, title, description, applicantId, approverId, status, createdAt, category, type, purchaseOrderNumber, constructionDate, linkedInventoryIssueId, details, attachments) 
        VALUES (@id, @title, @description, @applicantId, @approverId, @status, GETDATE(), @category, @type, @purchaseOrderNumber, @constructionDate, @linkedInventoryIssueId, @details, @attachments)
      \`;
    res.status(201).json({ id, message: '申請完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/workflows/:id', async (req, res) => {
  try {
    const { status, approverId, details, attachments, purchaseOrderNumber, constructionDate, linkedInventoryIssueId } = req.body;
    const pool = await getPool();
    const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null;
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;

    let queryStr = \`UPDATE dbo.Workflows SET status = @status\`;
    if (approverId) queryStr += \`, approverId = @approverId\`;
    if (detailsStr) queryStr += \`, details = @details\`;
    if (attachStr !== null) queryStr += \`, attachments = @attachments\`;
    if (purchaseOrderNumber !== undefined) queryStr += \`, purchaseOrderNumber = @purchaseOrderNumber\`;
    if (constructionDate !== undefined) queryStr += \`, constructionDate = @constructionDate\`;
    if (linkedInventoryIssueId !== undefined) queryStr += \`, linkedInventoryIssueId = @linkedInventoryIssueId\`;
    queryStr += \` WHERE id = @id\`;

    const reqObj = pool.request()
      .input('id', sql.VarChar, String(req.params.id))
      .input('status', sql.NVarChar, status);
    if (approverId) reqObj.input('approverId', sql.VarChar, approverId);
    if (detailsStr) reqObj.input('details', sql.NVarChar, detailsStr);
    if (attachStr !== null) reqObj.input('attachments', sql.NVarChar, attachStr);
    if (purchaseOrderNumber !== undefined) reqObj.input('purchaseOrderNumber', sql.NVarChar, purchaseOrderNumber);
    if (constructionDate !== undefined) reqObj.input('constructionDate', sql.NVarChar, constructionDate);
    if (linkedInventoryIssueId !== undefined) reqObj.input('linkedInventoryIssueId', sql.VarChar, linkedInventoryIssueId);

    await reqObj.query(queryStr);
    res.json({ message: '更新完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/workflows/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.VarChar, String(req.params.id))
      .query('DELETE FROM dbo.Workflows WHERE id = @id');
    res.json({ message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 互換性・リバースプロキシ対策用のPOSTベース削除エンドポイント
app.post('/api/workflows/:id/delete', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.VarChar, String(req.params.id))
      .query('DELETE FROM dbo.Workflows WHERE id = @id');
    res.json({ message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ==========================================
// 6. Bulletins / Board (社内掲示板) - 既存DB連動 (安全・完全・閲覧同期対応版)
// ==========================================

/**
 * 掲示板トピックの一覧取得 (リアルタイムでDBからコメント・閲覧者をマージ)
 */
const handleGetBulletins = async (req, res) => {
  try {
    const pool = await getPool();
    
    // ① トピック(Bulletins)本体の取得
    const result = await pool.request().query(
      \`SELECT b.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
       FROM dbo.Bulletins b
       LEFT JOIN dbo.Users u ON b.authorId = u.id
       ORDER BY b.isPinned DESC, b.createdAt DESC\`
    );
    const bulletins = result.recordset || [];

    // ② コメント(BoardComments)の取得
    const commentsResult = await pool.request().query(
      \`SELECT c.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
       FROM dbo.BoardComments c
       LEFT JOIN dbo.Users u ON c.authorId = u.id
       ORDER BY c.createdAt ASC\`
    );
    const allComments = commentsResult.recordset || [];

    // ③ 閲覧者(BoardViewers)の取得
    const viewersResult = await pool.request().query(
      \`SELECT v.*, u.name AS userName, u.department AS userDepartment, u.avatarUrl AS userAvatarUrl
       FROM dbo.BoardViewers v
       LEFT JOIN dbo.Users u ON v.userId = u.id\`
    );
    const allViewers = viewersResult.recordset || [];

    // ④ 各トピックにコメントと閲覧者をマージ
    const formattedBulletins = bulletins.map(row => {
      let tags = [];
      if (row.tags) {
        tags = typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()) : row.tags;
      }

      const topicComments = allComments
        .filter(c => 
          String(c.topicId) === String(row.id) || 
          String(c.topic_id) === String(row.id) || 
          String(c.bulletinId) === String(row.id)
        )
        .map(c => ({
          id: String(c.id),
          content: c.content,
          createdAt: c.createdAt || c.created_at || new Date(),
          author: {
            id: c.authorId || c.author_id,
            name: c.authorName || '不明',
            department: c.authorDepartment || '',
            avatarUrl: c.authorAvatarUrl || ''
          },
          attachments: safeParseJSON(c.attachments || c.attachmentsJson, [])
        }));

      const topicViewers = allViewers
        .filter(v => 
          String(v.topicId) === String(row.id) || 
          String(v.topic_id) === String(row.id) || 
          String(v.bulletinId) === String(row.id)
        )
        .map(v => ({
          viewedAt: v.viewedAt || v.viewed_at || new Date(),
          user: {
            id: v.userId || v.user_id,
            name: v.userName || '不明',
            department: v.userDepartment || '',
            avatarUrl: v.userAvatarUrl || ''
          }
        }));

      return {
        id: String(row.id),
        category: row.category,
        title: row.title,
        content: row.content,
        authorId: row.authorId,
        author: {
          id: row.authorId,
          name: row.authorName || '不明',
          department: row.authorDepartment || '',
          avatarUrl: row.authorAvatarUrl || ''
        },
        createdAt: row.createdAt,
        views: topicViewers.length || row.views || 0,
        likes: row.likes || 0,
        office: row.office || '',
        division: row.division || '',
        scope: row.scope || '全社',
        tags: tags,
        isPinned: row.isPinned ? true : false,
        attachments: row.attachments ? (typeof row.attachments === 'string' && row.attachments.startsWith('[') ? JSON.parse(row.attachments) : row.attachments) : [],
        comments: topicComments,
        viewers: topicViewers,
        commentsCount: topicComments.length
      };
    });

    res.json(formattedBulletins);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

/**
 * 掲示板トピックの新規作成
 */
const handlePostBulletin = async (req, res) => {
  try {
    const { title, content, category, authorId, isPinned, office, division, scope, tags, attachments } = req.body;
    const pool = await getPool();
    const id = req.body.id || \`b-\${Date.now()}\`;
    const tagStr = Array.isArray(tags) ? tags.join(',') : (tags || '');
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : (content || '');

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '')
      .input('content', sql.NVarChar, contentStr)
      .input('category', sql.NVarChar, category || '')
      .input('authorId', sql.VarChar, authorId || 'u1')
      .input('isPinned', sql.Bit, isPinned ? 1 : 0)
      .input('office', sql.NVarChar, office || '')
      .input('division', sql.NVarChar, division || '')
      .input('scope', sql.NVarChar, scope || '全社')
      .input('tags', sql.NVarChar, tagStr)
      .input('attachments', sql.NVarChar, attachStr)
      .query(
        \`INSERT INTO dbo.Bulletins (id, title, content, category, authorId, isPinned, office, division, scope, tags, attachments, createdAt, views, likes)
         VALUES (@id, @title, @content, @category, @authorId, @isPinned, @office, @division, @scope, @tags, @attachments, GETDATE(), 0, 0)\`
      );

    res.status(201).json({ id, message: '掲示板トピック作成完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * 掲示板トピックの更新（コメント・閲覧者の同期を含む）
 */
const handlePutBulletin = async (req, res) => {
  try {
    const { title, content, category, isPinned, office, division, scope, tags, attachments, comments, viewers } = req.body;
    const pool = await getPool();
    const id = req.params.id;
    const tagStr = Array.isArray(tags) ? tags.join(',') : (tags || '');
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : (content || '');

    // ① トピック(Bulletins)本体のアップデート
    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '')
      .input('content', sql.NVarChar, contentStr)
      .input('category', sql.NVarChar, category || '')
      .input('isPinned', sql.Bit, isPinned ? 1 : 0)
      .input('office', sql.NVarChar, office || '')
      .input('division', sql.NVarChar, division || '')
      .input('scope', sql.NVarChar, scope || '全社')
      .input('tags', sql.NVarChar, tagStr)
      .input('attachments', sql.NVarChar, attachStr)
      .query(
        \`UPDATE dbo.Bulletins 
         SET title = @title, content = @content, category = @category, isPinned = @isPinned,
             office = @office, division = @division, scope = @scope, tags = @tags, attachments = @attachments
         WHERE id = @id\`
      );

    // ② コメント (dbo.BoardComments) の同期（削除・追加・更新）
    if (Array.isArray(comments)) {
      const existingCommentsResult = await pool.request()
        .input('topicId', sql.VarChar, String(id))
        .query(\`SELECT id FROM dbo.BoardComments WHERE topicId = @topicId OR bulletinId = @topicId OR topic_id = @topicId\`);
      const existingCommentIds = (existingCommentsResult.recordset || []).map(r => String(r.id));
      const incomingCommentIds = comments.map(c => String(c.id));

      // 送信されてこなかった既存のコメントを削除
      const toDeleteCommentIds = existingCommentIds.filter(cid => !incomingCommentIds.includes(cid));
      for (const cid of toDeleteCommentIds) {
        await pool.request().input('cid', sql.VarChar, cid).query(\`DELETE FROM dbo.BoardComments WHERE id = @cid\`);
      }

      // コメントの新規追加・内容の更新
      for (const comment of comments) {
        const cid = String(comment.id);
        const authorId = comment.author?.id || comment.authorId;
        const commentContent = comment.content;
        const commentCreatedAt = comment.createdAt ? new Date(comment.createdAt) : new Date();
        const commentAttachments = comment.attachments;
        const attachStr = commentAttachments ? (typeof commentAttachments === 'object' ? JSON.stringify(commentAttachments) : commentAttachments) : null;

        if (existingCommentIds.includes(cid)) {
          // 既存の更新
          await pool.request()
            .input('id', sql.VarChar, cid)
            .input('content', sql.NVarChar, commentContent)
            .input('attachments', sql.NVarChar, attachStr)
            .query(\`UPDATE dbo.BoardComments SET content = @content, attachments = @attachments WHERE id = @id\`);
        } else {
          let inserted = false;

          // 多重カラム複合インサート
          try {
            await pool.request()
              .input('id', sql.VarChar, cid)
              .input('topicId', sql.VarChar, String(id))
              .input('topic_id', sql.VarChar, String(id))
              .input('authorId', sql.VarChar, String(authorId))
              .input('author_id', sql.VarChar, String(authorId))
              .input('content', sql.NVarChar, commentContent)
              .input('createdAt', sql.DateTime, commentCreatedAt)
              .input('created_at', sql.DateTime, commentCreatedAt)
              .input('attachments', sql.NVarChar, attachStr)
              .query(\`
                INSERT INTO dbo.BoardComments (id, topicId, topic_id, authorId, author_id, content, createdAt, created_at, attachments)
                VALUES (@id, @topicId, @topic_id, @authorId, @author_id, @content, @createdAt, @created_at, @attachments)
              \`);
            inserted = true;
          } catch (err) {}

          if (!inserted) {
            try {
              await pool.request()
                .input('id', sql.VarChar, cid)
                .input('topic_id', sql.VarChar, String(id))
                .input('author_id', sql.VarChar, String(authorId))
                .input('content', sql.NVarChar, commentContent)
                .input('created_at', sql.DateTime, commentCreatedAt)
                .input('attachments', sql.NVarChar, attachStr)
                .query(\`
                  INSERT INTO dbo.BoardComments (id, topic_id, author_id, content, created_at, attachments)
                  VALUES (@id, @topic_id, @author_id, @content, @created_at, @attachments)
                \`);
              inserted = true;
            } catch (err) {}
          }

          if (!inserted) {
            try {
              await pool.request()
                .input('id', sql.VarChar, cid)
                .input('topicId', sql.VarChar, String(id))
                .input('authorId', sql.VarChar, String(authorId))
                .input('content', sql.NVarChar, commentContent)
                .input('createdAt', sql.DateTime, commentCreatedAt)
                .input('attachments', sql.NVarChar, attachStr)
                .query(\`
                  INSERT INTO dbo.BoardComments (id, topicId, authorId, content, createdAt, attachments)
                  VALUES (@id, @topicId, @authorId, @content, @createdAt, @attachments)
                \`);
              inserted = true;
            } catch (err) {}
          }
        }
      }
    }

    // ③ 閲覧者 (dbo.BoardViewers) の同期
    if (Array.isArray(viewers)) {
      let existingUserIds = [];
      try {
        const existingViewersResult = await pool.request()
          .input('topicId', sql.VarChar, String(id))
          .query(\`SELECT userId, user_id FROM dbo.BoardViewers WHERE topicId = @topicId OR bulletinId = @topicId OR topic_id = @topicId\`);
        existingUserIds = (existingViewersResult.recordset || []).map(r => String(r.userId || r.user_id));
      } catch (err) {
        try {
          const existingViewersResult = await pool.request()
            .input('topicId', sql.VarChar, String(id))
            .query(\`SELECT user_id FROM dbo.BoardViewers WHERE topic_id = @topicId\`);
          existingUserIds = (existingViewersResult.recordset || []).map(r => String(r.user_id));
        } catch (_) {}
      }

      for (const viewer of viewers) {
        const uid = String(viewer.user?.id || viewer.userId);
        const viewedAt = viewer.viewedAt ? new Date(viewer.viewedAt) : new Date();

        if (!existingUserIds.includes(uid)) {
          let viewerInserted = false;

          // 複合インサート (スネークケースとキャメルケースの両方に同時に値をセット)
          try {
            await pool.request()
              .input('topic_id', sql.VarChar, String(id))
              .input('topicId', sql.VarChar, String(id))
              .input('bulletinId', sql.VarChar, String(id))
              .input('user_id', sql.VarChar, uid)
              .input('userId', sql.VarChar, uid)
              .input('viewed_at', sql.DateTime, viewedAt)
              .input('viewedAt', sql.DateTime, viewedAt)
              .query(\`
                INSERT INTO dbo.BoardViewers (topic_id, topicId, bulletinId, user_id, userId, viewed_at, viewedAt)
                VALUES (@topic_id, @topicId, @bulletinId, @user_id, @userId, @viewed_at, @viewedAt)
              \`);
            viewerInserted = true;
          } catch (err) {}

          // フォールバック1: スネークケース
          if (!viewerInserted) {
            try {
              await pool.request()
                .input('topic_id', sql.VarChar, String(id))
                .input('user_id', sql.VarChar, uid)
                .input('viewed_at', sql.DateTime, viewedAt)
                .query(\`
                  INSERT INTO dbo.BoardViewers (topic_id, user_id, viewed_at)
                  VALUES (@topic_id, @user_id, @viewed_at)
                \`);
              viewerInserted = true;
            } catch (err) {}
          }

          // フォールバック2: キャメルケース
          if (!viewerInserted) {
            try {
              await pool.request()
                .input('topicId', sql.VarChar, String(id))
                .input('userId', sql.VarChar, uid)
                .input('viewedAt', sql.DateTime, viewedAt)
                .query(\`
                  INSERT INTO dbo.BoardViewers (topicId, userId, viewedAt)
                  VALUES (@topicId, @userId, @viewedAt)
                \`);
              viewerInserted = true;
            } catch (err) {}
          }
        }
      }
    }

    res.json({ id, message: '掲示板更新完了' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
};

/**
 * コメントの個別投稿 API
 */
const handleAddComment = async (req, res) => {
  try {
    const { id: commentId, author, authorId, content, createdAt, attachments } = req.body;
    const topicId = req.params.id;
    const pool = await getPool();

    const cid = commentId || \`cm-\${Date.now()}\`;
    const aid = authorId || author?.id || 'u1';
    const commentContent = content || '';
    const dateVal = createdAt ? new Date(createdAt) : new Date();
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;

    let inserted = false;

    try {
      await pool.request()
        .input('id', sql.VarChar, cid)
        .input('topicId', sql.VarChar, String(topicId))
        .input('topic_id', sql.VarChar, String(topicId))
        .input('authorId', sql.VarChar, String(aid))
        .input('author_id', sql.VarChar, String(aid))
        .input('content', sql.NVarChar, commentContent)
        .input('createdAt', sql.DateTime, dateVal)
        .input('created_at', sql.DateTime, dateVal)
        .input('attachments', sql.NVarChar, attachStr)
        .query(\`
          INSERT INTO dbo.BoardComments (id, topicId, topic_id, authorId, author_id, content, createdAt, created_at, attachments)
          VALUES (@id, @topicId, @topic_id, @authorId, @author_id, @content, @createdAt, @created_at, @attachments)
        \`);
      inserted = true;
    } catch (err) {}

    if (!inserted) {
      try {
        await pool.request()
          .input('id', sql.VarChar, cid)
          .input('topic_id', sql.VarChar, String(topicId))
          .input('author_id', sql.VarChar, String(aid))
          .input('content', sql.NVarChar, commentContent)
          .input('created_at', sql.DateTime, dateVal)
          .input('attachments', sql.NVarChar, attachStr)
          .query(\`
            INSERT INTO dbo.BoardComments (id, topic_id, author_id, content, created_at, attachments)
            VALUES (@id, @topic_id, @author_id, @content, @created_at, @attachments)
          \`);
        inserted = true;
      } catch (err) {}
    }

    if (!inserted) {
      try {
        await pool.request()
          .input('id', sql.VarChar, cid)
          .input('topicId', sql.VarChar, String(topicId))
          .input('authorId', sql.VarChar, String(aid))
          .input('content', sql.NVarChar, commentContent)
          .input('createdAt', sql.DateTime, dateVal)
          .input('attachments', sql.NVarChar, attachStr)
          .query(\`
            INSERT INTO dbo.BoardComments (id, topicId, authorId, content, createdAt, attachments)
            VALUES (@id, @topicId, @authorId, @content, @createdAt, @attachments)
          \`);
        inserted = true;
      } catch (err) {}
    }

    if (!inserted) {
      return res.status(500).json({ 
        error: 'BoardComments テーブルへのデータの追加に失敗しました。' 
      });
    }

    res.status(201).json({ success: true, message: 'コメント投稿完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * 閲覧者（足跡）の個別追加 API (BoardViewers テーブルへの安全多重インサート)
 */
const handleAddViewer = async (req, res) => {
  try {
    const { userId, user_id, viewedAt, viewed_at } = req.body;
    const topicId = req.params.id;
    const pool = await getPool();

    const uid = userId || user_id || 'u1';
    const dateVal = viewedAt || viewed_at ? new Date(viewedAt || viewed_at) : new Date();

    let inserted = false;

    // 【100%安全な多重カラムマッピングインサート】
    try {
      await pool.request()
        .input('topic_id', sql.VarChar, String(topicId))
        .input('topicId', sql.VarChar, String(topicId))
        .input('bulletinId', sql.VarChar, String(topicId))
        .input('user_id', sql.VarChar, String(uid))
        .input('userId', sql.VarChar, String(uid))
        .input('viewed_at', sql.DateTime, dateVal)
        .input('viewedAt', sql.DateTime, dateVal)
        .query(\`
          IF NOT EXISTS (
            SELECT 1 FROM dbo.BoardViewers 
            WHERE (topic_id = @topic_id AND user_id = @user_id) 
               OR (topicId = @topicId AND userId = @userId)
          )
          BEGIN
            INSERT INTO dbo.BoardViewers (topic_id, topicId, bulletinId, user_id, userId, viewed_at, viewedAt)
            VALUES (@topic_id, @topicId, @bulletinId, @user_id, @userId, @viewed_at, @viewedAt)
          END
        \`);
      inserted = true;
    } catch (err) {
      console.error('BoardViewers insert main error:', err.message);
    }

    // フォールバック1: スネークケース優先
    if (!inserted) {
      try {
        await pool.request()
          .input('topic_id', sql.VarChar, String(topicId))
          .input('user_id', sql.VarChar, String(uid))
          .input('viewed_at', sql.DateTime, dateVal)
          .query(\`
            IF NOT EXISTS (SELECT 1 FROM dbo.BoardViewers WHERE topic_id = @topic_id AND user_id = @user_id)
            BEGIN
              INSERT INTO dbo.BoardViewers (topic_id, user_id, viewed_at)
              VALUES (@topic_id, @user_id, @viewed_at)
            END
          \`);
        inserted = true;
      } catch (err) {}
    }

    // フォールバック2: キャメルケース優先
    if (!inserted) {
      try {
        await pool.request()
          .input('topicId', sql.VarChar, String(topicId))
          .input('userId', sql.VarChar, String(uid))
          .input('viewedAt', sql.DateTime, dateVal)
          .query(\`
            IF NOT EXISTS (SELECT 1 FROM dbo.BoardViewers WHERE topicId = @topicId AND userId = @userId)
            BEGIN
              INSERT INTO dbo.BoardViewers (topicId, userId, viewedAt)
              VALUES (@topicId, @userId, @viewedAt)
            END
          \`);
        inserted = true;
      } catch (err) {}
    }

    res.status(200).json({ success: true, message: '閲覧情報記録完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};

/**
 * 掲示板トピックの削除 API
 */
const handleDeleteBulletin = async (req, res) => {
  try {
    const id = req.params.id;
    const pool = await getPool();
    
    await pool.request()
      .input('id', sql.VarChar, String(id))
      .query(\`DELETE FROM dbo.Bulletins WHERE id = @id\`);
      
    await pool.request()
      .input('topicId', sql.VarChar, String(id))
      .query(\`DELETE FROM dbo.BoardComments WHERE topicId = @topicId OR bulletinId = @topicId OR topic_id = @topicId\`);
      
    await pool.request()
      .input('topicId', sql.VarChar, String(id))
      .query(\`DELETE FROM dbo.BoardViewers WHERE topicId = @topicId OR bulletinId = @topicId OR topic_id = @topicId\`);

    res.json({ success: true, message: '削除完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};


// ------------------------------------------
// 7. Chats (社内チャット・メッセージ)
// ------------------------------------------
app.get('/api/chats', async (req, res) => {
  try {
    const pool = await getPool();
    const roomsResult = await pool.request().query\`SELECT * FROM dbo.ChatRooms ORDER BY updatedAt DESC\`;
    const msgsResult = await pool.request().query\`
      SELECT m.*, u.name AS senderName, u.avatarUrl AS senderAvatar, u.department AS senderDepartment
      FROM dbo.ChatMessages m
      LEFT JOIN dbo.Users u ON m.senderId = u.id
      ORDER BY m.createdAt ASC
    \`;

    const rooms = (roomsResult.recordset || []).map(r => {
      const participants = safeParseJSON(r.participantsJson || r.participants, []);
      const adminIds = safeParseJSON(r.adminIdsJson || r.adminIds, []);
      return {
        id: String(r.id),
        name: r.name,
        type: r.type,
        avatarUrl: r.avatarUrl || null,
        lastMessage: r.lastMessage || '',
        updatedAt: r.updatedAt,
        participants: participants,
        adminIds: adminIds,
        messages: (msgsResult.recordset || [])
          .filter(m => String(m.roomId) === String(r.id))
          .map(m => ({
            id: String(m.id),
            roomId: String(m.roomId),
            sender: {
              id: m.senderId,
              name: m.senderName || '不明',
              avatarUrl: m.senderAvatar || '',
              department: m.senderDepartment || ''
            },
            content: m.message || m.content || '',
            createdAt: m.createdAt,
            type: m.type || 'text',
            imageUrl: m.imageUrl || null,
            stampId: m.stampId || null,
            stampText: m.stampText || null,
            stampCategory: m.stampCategory || null,
            attachments: safeParseJSON(m.attachments || m.attachmentsJson, []),
            viewers: safeParseJSON(m.viewersJson || m.viewers, [])
          }))
      };
    });
    res.json(rooms);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chats/rooms', async (req, res) => {
  app._router.handle({ ...req, method: 'GET', url: '/api/chats' }, res);
});

// 新規チャットルーム作成専用のエンドポイント
app.post('/api/chats/rooms', async (req, res) => {
  try {
    const { id, name, type, avatarUrl, participants, adminIds } = req.body;
    const pool = await getPool();
    const roomId = id || \`c_\${Date.now()}\`;
    const roomName = name || (type === 'dm' ? 'ダイレクトトーク' : 'グループトーク');
    const roomType = type || 'group';
    const participantsStr = participants ? (typeof participants === 'object' ? JSON.stringify(participants) : participants) : '[]';
    const adminIdsStr = adminIds ? (typeof adminIds === 'object' ? JSON.stringify(adminIds) : adminIds) : '[]';

    // カラム一覧を取得して、存在するカラムを特定する
    const columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ChatRooms' AND TABLE_SCHEMA = 'dbo'");
    const dbColumns = (columnsRes.recordset || []).map(row => row.COLUMN_NAME);

    const insertCols = ['id', 'name', 'type', 'avatarUrl', 'lastMessage', 'updatedAt', 'last_updated'];
    const insertVals = ['@id', '@name', '@type', '@avatarUrl', "''", 'GETDATE()', 'GETDATE()'];

    const request = pool.request()
      .input('id', sql.VarChar, roomId)
      .input('name', sql.NVarChar, roomName)
      .input('type', sql.NVarChar, roomType)
      .input('avatarUrl', sql.VarChar, avatarUrl || null);

    if (participants !== undefined) {
      const colName = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (colName) {
        insertCols.push(colName);
        insertVals.push('@participantsJson');
        request.input('participantsJson', sql.NVarChar, participantsStr);
      }
    }

    if (adminIds !== undefined) {
      const colName = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (colName) {
        insertCols.push(colName);
        insertVals.push('@adminIdsJson');
        request.input('adminIdsJson', sql.NVarChar, adminIdsStr);
      }
    }

    const query = \`INSERT INTO dbo.ChatRooms (\${insertCols.join(', ')}) VALUES (\${insertVals.join(', ')})\`;
    await request.query(query);

    res.status(201).json({ success: true, id: roomId, message: 'チャットルーム作成完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

const handlePostChatMessage = async (req, res) => {
  try {
    const { senderId, roomId, message, content, attachments, roomName, roomType, participants, type, imageUrl, stampId, stampText, stampCategory, adminIds } = req.body;
    const msgContent = message || content || '';
    const pool = await getPool();
    const id = req.body.id || \`c-\${Date.now()}\`;
    const targetRoomId = roomId || 'r1';
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;
    const msgType = type || 'text';

    // トークルームの自動生成（存在しない場合）
    const roomCheck = await pool.request()
      .input('roomId', sql.VarChar, String(targetRoomId))
      .query('SELECT 1 FROM dbo.ChatRooms WHERE id = @roomId');

    if ((roomCheck.recordset || []).length === 0) {
      const rName = roomName || (roomType === 'dm' ? 'ダイレクトトーク' : '新規グループトーク');
      const rType = roomType || 'group';
      const participantsStr = participants ? (typeof participants === 'object' ? JSON.stringify(participants) : participants) : '[]';
      // もしリクエストボディに adminIds があればそれを使う。なければ、グループチャットの場合 senderId を唯一の管理者とする
      const admins = adminIds ? (Array.isArray(adminIds) ? adminIds : [adminIds]) : (rType === 'group' && senderId ? [senderId] : []);
      const adminIdsStr = JSON.stringify(admins);

      const columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ChatRooms' AND TABLE_SCHEMA = 'dbo'");
      const dbColumns = (columnsRes.recordset || []).map(row => row.COLUMN_NAME);

      const insertCols = ['id', 'name', 'type', 'lastMessage', 'updatedAt', 'last_updated'];
      const insertVals = ['@roomId', '@name', '@type', "''", 'GETDATE()', 'GETDATE()'];

      const request = pool.request()
        .input('roomId', sql.VarChar, String(targetRoomId))
        .input('name', sql.NVarChar, rName)
        .input('type', sql.NVarChar, rType);

      const partCol = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (partCol) {
        insertCols.push(partCol);
        insertVals.push('@participantsJson');
        request.input('participantsJson', sql.NVarChar, participantsStr);
      }

      const adminCol = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (adminCol) {
        insertCols.push(adminCol);
        insertVals.push('@adminIdsJson');
        request.input('adminIdsJson', sql.NVarChar, adminIdsStr);
      }

      const insertQuery = \`INSERT INTO dbo.ChatRooms (\${insertCols.join(', ')}) VALUES (\${insertVals.join(', ')})\`;
      await request.query(insertQuery);
    }

    // 送信者を最初の閲覧者にする
    let initialViewers = [];
    if (senderId) {
      const userRes = await pool.request()
        .input('userId', sql.VarChar, senderId)
        .query('SELECT id, name, avatarUrl, department FROM dbo.Users WHERE id = @userId');
      if (userRes.recordset && userRes.recordset.length > 0) {
        const u = userRes.recordset[0];
        initialViewers.push({
          user: {
            id: u.id,
            name: u.name,
            avatarUrl: u.avatarUrl || '',
            department: u.department || ''
          },
          viewedAt: new Date().toISOString()
        });
      }
    }
    const viewersStr = JSON.stringify(initialViewers);

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('senderId', sql.VarChar, senderId || 'u1')
      .input('roomId', sql.VarChar, String(targetRoomId))
      .input('message', sql.NVarChar, msgContent)
      .input('content', sql.NVarChar, msgContent)
      .input('attachments', sql.NVarChar, attachStr)
      .input('type', sql.VarChar, msgType)
      .input('imageUrl', sql.NVarChar, imageUrl || null)
      .input('stampId', sql.VarChar, stampId || null)
      .input('stampText', sql.NVarChar, stampText || null)
      .input('stampCategory', sql.NVarChar, stampCategory || null)
      .input('viewersJson', sql.NVarChar, viewersStr)
      .query\`
        INSERT INTO dbo.ChatMessages (id, senderId, roomId, message, content, createdAt, attachments, type, imageUrl, stampId, stampText, stampCategory, viewersJson) 
        VALUES (@id, @senderId, @roomId, @message, @content, GETDATE(), @attachments, @type, @imageUrl, @stampId, @stampText, @stampCategory, @viewersJson)
      \`;

    await pool.request()
      .input('roomId', sql.VarChar, String(targetRoomId))
      .input('lastMessage', sql.NVarChar, msgContent)
      .query\`
        UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE(), last_updated = GETDATE() WHERE id = @roomId
      \`;

    res.status(201).json({ id, message: 'メッセージ送信完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

app.post('/api/chats', handlePostChatMessage);
app.post('/api/chats/message', handlePostChatMessage);

// メッセージ既読追加用のエンドポイント
app.post('/api/chats/messages/:messageId/viewers', async (req, res) => {
  const { messageId } = req.params;
  const { user } = req.body;
  if (!user || !user.id) {
    return res.status(400).json({ success: false, error: 'User is required' });
  }
  try {
    const pool = await getPool();
    const result = await pool.request()
      .input('messageId', sql.VarChar, messageId)
      .query('SELECT viewersJson FROM dbo.ChatMessages WHERE id = @messageId');
    
    if (result.recordset && result.recordset.length > 0) {
      const currentViewers = safeParseJSON(result.recordset[0].viewersJson, []);
      const alreadyExists = currentViewers.some(v => v.user.id === user.id);
      if (!alreadyExists) {
        const newViewers = [...currentViewers, { user, viewedAt: new Date().toISOString() }];
        await pool.request()
          .input('messageId', sql.VarChar, messageId)
          .input('viewersJson', sql.NVarChar, JSON.stringify(newViewers))
          .query('UPDATE dbo.ChatMessages SET viewersJson = @viewersJson WHERE id = @messageId');
        return res.status(200).json({ success: true, viewers: newViewers });
      }
      return res.status(200).json({ success: true, viewers: currentViewers, message: 'Already marked as read' });
    } else {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
  } catch (err) {
    console.error('Failed to update chat message viewers:', err);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました。' });
  }
});

// チャットルーム情報（ルーム名、参加メンバーなど）更新用のエンドポイント
app.put('/api/chats/:roomId', async (req, res) => {
  const { roomId } = req.params;
  const { name, participants, adminIds } = req.body;
  try {
    const pool = await getPool();
    
    // カラム一覧を取得して、存在するカラムを特定する
    const columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ChatRooms' AND TABLE_SCHEMA = 'dbo'");
    const dbColumns = (columnsRes.recordset || []).map(row => row.COLUMN_NAME);

    let query = 'UPDATE dbo.ChatRooms SET updatedAt = GETDATE(), last_updated = GETDATE()';
    const request = pool.request().input('roomId', sql.VarChar, roomId);
    
    if (name !== undefined) {
      query += ', name = @name';
      request.input('name', sql.NVarChar, name);
    }
    
    if (participants !== undefined) {
      const participantsStr = Array.isArray(participants) ? JSON.stringify(participants) : String(participants);
      // カラム名が 'participantsJson' か 'participants' かを判定
      const colName = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (colName) {
        query += \`, \${colName} = @participantsJson\`;
        request.input('participantsJson', sql.NVarChar, participantsStr);
      }
    }

    if (adminIds !== undefined) {
      const adminIdsStr = Array.isArray(adminIds) ? JSON.stringify(adminIds) : String(adminIds);
      // カラム名が 'adminIdsJson' か 'adminIds' かを判定
      const colName = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (colName) {
        query += \`, \${colName} = @adminIdsJson\`;
        request.input('adminIdsJson', sql.NVarChar, adminIdsStr);
      }
    }
    
    query += ' WHERE id = @roomId';
    await request.query(query);
    
    res.status(200).json({ success: true, message: 'チャットルーム情報を更新しました。' });
  } catch (err) {
    console.error('Failed to update chat room:', err);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました。' });
  }
});

// チャットルーム削除用のエンドポイント
app.delete('/api/chats/:roomId', async (req, res) => {
  const { roomId } = req.params;
  try {
    const pool = await getPool(); 
    
    // 1. チャットメッセージの削除
    await pool.request()
      .input('roomId', sql.VarChar, roomId)
      .query('DELETE FROM dbo.ChatMessages WHERE roomId = @roomId');

    // 2. チャットルームの削除
    await pool.request()
      .input('roomId', sql.VarChar, roomId)
      .query('DELETE FROM dbo.ChatRooms WHERE id = @roomId');

    // 3. 既読ステータスの削除
    await pool.request()
      .input('roomId', sql.VarChar, roomId)
      .query("DELETE FROM dbo.UserReadStatuses WHERE targetType = 'chat' AND targetId = @roomId");

    res.status(200).json({ success: true, message: 'チャットルームとメッセージを削除しました。' });
  } catch (err) {
    console.error('Failed to delete chat room:', err);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました。' });
  }
});

// 個別のチャットメッセージ削除用のエンドポイント
app.delete('/api/chats/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  try {
    const pool = await getPool();
    
    // 対象メッセージの roomId を取得
    const msgResult = await pool.request()
      .input('messageId', sql.VarChar, messageId)
      .query('SELECT roomId FROM dbo.ChatMessages WHERE id = @messageId');
    
    if (msgResult.recordset && msgResult.recordset.length > 0) {
      const roomId = msgResult.recordset[0].roomId;
      
      // メッセージの削除
      await pool.request()
        .input('messageId', sql.VarChar, messageId)
        .query('DELETE FROM dbo.ChatMessages WHERE id = @messageId');
        
      // 部屋に残っている最新メッセージを取得
      const latestResult = await pool.request()
        .input('roomId', sql.VarChar, roomId)
        .query('SELECT TOP 1 message FROM dbo.ChatMessages WHERE roomId = @roomId ORDER BY createdAt DESC');
        
      const lastMsg = (latestResult.recordset && latestResult.recordset.length > 0) 
        ? latestResult.recordset[0].message 
        : '';
        
      // チャットルームの最終メッセージと更新日時を更新
      await pool.request()
        .input('roomId', sql.VarChar, roomId)
        .input('lastMessage', sql.NVarChar, lastMsg)
        .query('UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE(), last_updated = GETDATE() WHERE id = @roomId');
    } else {
      await pool.request()
        .input('messageId', sql.VarChar, messageId)
        .query('DELETE FROM dbo.ChatMessages WHERE id = @messageId');
    }

    res.status(200).json({ success: true, message: 'メッセージを削除しました。' });
  } catch (err) {
    console.error('Failed to delete chat message:', err);
    res.status(500).json({ success: false, error: 'サーバーエラーが発生しました。' });
  }
});


// ------------------------------------------
// 8. Memos (伝言メモ)
// ------------------------------------------
app.get('/api/memos', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query\`
      SELECT m.*, 
             uSender.name AS senderName, uSender.department AS senderDepartment, uSender.avatarUrl AS senderAvatarUrl,
             uReceiver.name AS receiverName
      FROM dbo.Memos m
      LEFT JOIN dbo.Users uSender ON m.senderId = uSender.id
      LEFT JOIN dbo.Users uReceiver ON m.receiverId = uReceiver.id
      ORDER BY m.createdAt DESC
    \`;
    const memos = (result.recordset || []).map(row => ({
      id: String(row.id),
      senderId: row.senderId,
      sender: {
        id: row.senderId,
        name: row.senderName || row.fromName || '不詳',
        department: row.senderDepartment || '',
        avatarUrl: row.senderAvatarUrl || ''
      },
      receiverId: row.receiverId,
      toUserId: row.receiverId,
      toUserName: row.receiverName || '',
      content: row.content,
      isRead: row.isRead ? true : false,
      fromName: row.fromName || '',
      fromCompany: row.fromCompany || '',
      fromPhone: row.fromPhone || '',
      createdAt: row.createdAt,
      details: row.details ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) : null
    }));
    res.json(memos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/memos', async (req, res) => {
  try {
    const { senderId, receiverId, toUserId, content, fromName, fromCompany, fromPhone, requirementType, requirementText, details } = req.body;
    const pool = await getPool();
    const id = req.body.id || \`memo-\${Date.now()}\`;
    const targetReceiver = receiverId || toUserId || 'u1';
    const reqType = requirementType || (details && details.requirementType) || 'phone_called';
    const reqText = requirementText || (details && details.requirementText) || '電話がありました';
    const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null;
    const toUsersJson = JSON.stringify([targetReceiver]);
    const recStatuses = (details && details.recipientStatuses) || [{ userId: targetReceiver, userName: '', isViewed: false, isHandled: false }];
    const recipientStatusesJson = req.body.recipientStatusesJson || JSON.stringify(recStatuses);

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('senderId', sql.VarChar, senderId || 'u1')
      .input('receiverId', sql.VarChar, targetReceiver)
      .input('content', sql.NVarChar, content || '')
      .input('fromName', sql.NVarChar, fromName || '')
      .input('fromCompany', sql.NVarChar, fromCompany || '')
      .input('fromPhone', sql.NVarChar, fromPhone || '')
      .input('requirementType', sql.NVarChar, reqType)
      .input('requirementText', sql.NVarChar, reqText)
      .input('details', sql.NVarChar, detailsStr)
      .input('toUsersJson', sql.NVarChar, toUsersJson)
      .input('recipientStatusesJson', sql.NVarChar, recipientStatusesJson)
      .query('INSERT INTO dbo.Memos (id, senderId, receiverId, content, isRead, createdAt, fromName, fromCompany, fromPhone, requirementType, requirementText, details, toUsersJson, recipientStatusesJson) VALUES (@id, @senderId, @receiverId, @content, 0, GETDATE(), @fromName, @fromCompany, @fromPhone, @requirementType, @requirementText, @details, @toUsersJson, @recipientStatusesJson)');
    res.status(201).json({ id, message: '伝言メモ作成完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/memos/:id/read', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query('UPDATE dbo.Memos SET isRead = 1 WHERE id = @id');
    res.json({ message: '既読状態更新完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/memos/:id', async (req, res) => {
  try {
    const { isRead, details, status } = req.body;
    const pool = await getPool();
    const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null;
    
    let queryStr = 'UPDATE dbo.Memos SET ';
    const updates = [];
    if (isRead !== undefined) updates.push('isRead = @isRead');
    if (detailsStr !== null) updates.push('details = @details');
    if (status !== undefined) updates.push('status = @status');
    
    if (updates.length === 0) {
      return res.json({ message: '更新対象なし' });
    }
    queryStr += updates.join(', ') + ' WHERE id = @id';

    const reqObj = pool.request().input('id', sql.VarChar, String(req.params.id));
    if (isRead !== undefined) reqObj.input('isRead', sql.Bit, isRead ? 1 : 0);
    if (detailsStr !== null) reqObj.input('details', sql.NVarChar, detailsStr);
    if (status !== undefined) reqObj.input('status', sql.NVarChar, String(status));

    await reqObj.query(queryStr);
    res.json({ message: '伝言メモ更新完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/memos/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query('DELETE FROM dbo.Memos WHERE id = @id');
    res.json({ message: '伝言メモ削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/read-statuses/:userId', async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await getPool();
    const result = await pool.request()
      .input('userId', sql.VarChar, userId)
      .query('SELECT targetType, targetId FROM dbo.UserReadStatuses WHERE userId = @userId');
    
    const readMap = { event: [], topic: [], memo: [], workflow: [], chat: [], report: [] };
    (result.recordset || []).forEach(row => {
      if (readMap[row.targetType]) {
        readMap[row.targetType].push(row.targetId);
      }
    });
    res.json(readMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/read-statuses', async (req, res) => {
  try {
    const { userId, targetType, targetId, isRead } = req.body;
    const pool = await getPool();

    if (isRead) {
      await pool.request()
        .input('userId', sql.VarChar, userId)
        .input('targetType', sql.VarChar, targetType)
        .input('targetId', sql.VarChar, targetId)
        .query('IF NOT EXISTS (SELECT 1 FROM dbo.UserReadStatuses WHERE userId = @userId AND targetType = @targetType AND targetId = @targetId) BEGIN INSERT INTO dbo.UserReadStatuses (userId, targetType, targetId, readAt) VALUES (@userId, @targetType, @targetId, GETDATE()) END');
    } else {
      await pool.request()
        .input('userId', sql.VarChar, userId)
        .input('targetType', sql.VarChar, targetType)
        .input('targetId', sql.VarChar, targetId)
        .query('DELETE FROM dbo.UserReadStatuses WHERE userId = @userId AND targetType = @targetType AND targetId = @targetId');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});


// ------------------------------------------
// 9. Work Reports & Daily Reports (日報・週報)
// ------------------------------------------
const handleGetDailyReports = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query('SELECT * FROM dbo.WorkReports');
    
    const usersMap = new Map();
    try {
      const usersRes = await pool.request().query('SELECT id, name, department, avatarUrl FROM dbo.Users');
      for (const u of (usersRes.recordset || [])) {
        usersMap.set(String(u.id), u);
      }
    } catch (uErr) {
      console.warn('Users lookup warning in WorkReports:', uErr.message);
    }

    const reports = (result.recordset || []).map(row => {
      const authId = String(row.author_id || row.authorId || 'u1');
      const supId = row.supervisor_id || row.supervisorId ? String(row.supervisor_id || row.supervisorId) : undefined;
      const rawDate = row.week_start_date || row.weekStartDate || row.report_date || row.reportDate || row.date || row.createdAt;
      const weekDate = rawDate ? (typeof rawDate === 'string' ? rawDate.slice(0, 10) : new Date(rawDate).toISOString().slice(0, 10)) : undefined;
      const weekLbl = row.week_label || row.weekLabel || (weekDate ? (weekDate + '週') : undefined);
      const achieve = row.achievements !== undefined ? row.achievements : (row.results || '');
      const contItems = row.continued_items !== undefined ? row.continued_items : (row.ongoingProjects || '');
      const nxtPlans = row.next_week_plans !== undefined ? row.next_week_plans : (row.tomorrowPlan || '');
      const feed = row.review_feedback !== undefined ? row.review_feedback : (row.feedbackComment || '');
      const reviewedAt = row.reviewed_at || row.reviewedAt || null;
      const updatedAt = row.updated_at || row.updatedAt || row.createdAt || null;
      
      const authorUser = usersMap.get(authId);
      const supervisorUser = supId ? usersMap.get(supId) : undefined;

      let mData = undefined;
      const rawM = row.maintenance_data ?? row.maintenanceData ?? row.Maintenance_Data;
      if (rawM) {
        try {
          mData = typeof rawM === 'string' ? JSON.parse(rawM) : rawM;
          if (typeof mData === 'string') {
            try { mData = JSON.parse(mData); } catch (e) {}
          }
        } catch (e) {}
      }
      let cData = undefined;
      const rawC = row.construction_data ?? row.constructionData ?? row.Construction_Data;
      if (rawC) {
        try {
          cData = typeof rawC === 'string' ? JSON.parse(rawC) : rawC;
          if (typeof cData === 'string') {
            try { cData = JSON.parse(cData); } catch (e) {}
          }
        } catch (e) {}
      }
      let sData = undefined;
      const rawS = row.sales_data ?? row.salesData ?? row.Sales_Data;
      if (rawS) {
        try {
          sData = typeof rawS === 'string' ? JSON.parse(rawS) : rawS;
          if (typeof sData === 'string') {
            try { sData = JSON.parse(sData); } catch (e) {}
          }
        } catch (e) {}
      }

      return {
        id: String(row.id),
        author_id: authId,
        supervisor_id: supId,
        reportType: row.report_type || row.reportType || (mData ? 'maintenance_daily' : 'weekly'),
        reportDate: weekDate,
        date: weekDate,
        week_start_date: weekDate,
        week_label: weekLbl,
        tasks: row.tasks || row.content || '',
        achievements: achieve,
        issues: row.issues || '',
        continued_items: contItems,
        next_week_plans: nxtPlans,
        status: row.status || 'submitted',
        review_feedback: feed,
        reviewed_at: reviewedAt,
        createdAt: row.createdAt,
        updated_at: updatedAt,
        authorId: authId,
        author: {
          id: authId,
          name: authorUser ? authorUser.name : (row.authorName || '社員'),
          department: authorUser ? authorUser.department : (row.authorDepartment || row.department || ''),
          avatarUrl: authorUser ? authorUser.avatarUrl : (row.authorAvatarUrl || '')
        },
        authorName: authorUser ? authorUser.name : (row.authorName || '社員'),
        authorDepartment: authorUser ? authorUser.department : (row.authorDepartment || row.department || ''),
        supervisorName: supervisorUser ? supervisorUser.name : undefined,
        weekStartDate: weekDate,
        weekLabel: weekLbl,
        department: authorUser ? authorUser.department : (row.department || row.authorDepartment || ''),
        results: achieve,
        ongoingProjects: contItems,
        tomorrowPlan: nxtPlans,
        supervisorId: supId,
        supervisor: supervisorUser ? { id: supervisorUser.id, name: supervisorUser.name } : (supId ? { id: supId, name: '' } : undefined),
        feedbackComment: feed,
        submittedAt: row.submittedAt || (row.status === 'submitted' ? row.createdAt : undefined),
        reviewedAt: reviewedAt,
        updatedAt: updatedAt,
        maintenanceData: mData,
        constructionData: cData,
        salesData: sData,
      };
    });

    reports.sort((a, b) => {
      const timeA = new Date(a.week_start_date || a.createdAt || 0).getTime();
      const timeB = new Date(b.week_start_date || b.createdAt || 0).getTime();
      return timeB - timeA;
    });

    res.json(reports);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

app.get('/api/work-reports', handleGetDailyReports);
app.get('/api/daily-reports', handleGetDailyReports);
app.get('/api/reports', handleGetDailyReports);

const handlePostDailyReport = async (req, res) => {
  try {
    const data = req.body || {};
    const pool = await getPool();
    const id = data.id || ('rep_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6));
    
    const author_id = String(data.author_id || data.authorId || (data.author && data.author.id) || 'u1');
    const supervisor_id = data.supervisor_id || data.supervisorId || (data.supervisor && data.supervisor.id) || null;
    const rawWeekDate = data.week_start_date || data.weekStartDate || data.date || data.reportDate || new Date().toISOString().slice(0, 10);
    const formattedWeekDate = rawWeekDate ? new Date(rawWeekDate) : new Date();
    const week_start_date_str = rawWeekDate ? new Date(rawWeekDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10);
    const week_label = data.week_label || data.weekLabel || (week_start_date_str ? (week_start_date_str + '週') : '');
    const tasks = data.tasks || data.content || '';
    const achievements = data.achievements !== undefined ? data.achievements : (data.results || '');
    const issues = data.issues || '';
    const continued_items = data.continued_items !== undefined ? data.continued_items : (data.ongoingProjects || '');
    const next_week_plans = data.next_week_plans !== undefined ? data.next_week_plans : (data.tomorrowPlan || '');
    const repStatus = data.status || (data.isSubmitting ? 'submitted' : 'draft');
    const review_feedback = data.review_feedback !== undefined ? data.review_feedback : (data.feedbackComment || '');

    const report_type = data.report_type || data.reportType || 'weekly';
    const report_date = data.report_date || data.reportDate || data.date || null;
    const department = data.department || null;
    const maintenance_data_str = data.maintenance_data ? (typeof data.maintenance_data === 'string' ? data.maintenance_data : JSON.stringify(data.maintenance_data)) : (data.maintenanceData ? JSON.stringify(data.maintenanceData) : null);
    const construction_data_str = data.construction_data ? (typeof data.construction_data === 'string' ? data.construction_data : JSON.stringify(data.construction_data)) : (data.constructionData ? JSON.stringify(data.constructionData) : null);
    const sales_data_str = data.sales_data ? (typeof data.sales_data === 'string' ? data.sales_data : JSON.stringify(data.sales_data)) : (data.salesData ? JSON.stringify(data.salesData) : null);

    let columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WorkReports' AND TABLE_SCHEMA = 'dbo'");
    let dbCols = (columnsRes.recordset || []).map(r => r.COLUMN_NAME);

    if (!dbCols.includes('maintenance_data') || !dbCols.includes('report_type')) {
      try {
        if (!dbCols.includes('author_id')) await pool.request().query("ALTER TABLE dbo.WorkReports ADD author_id NVARCHAR(100) NULL");
        if (!dbCols.includes('supervisor_id')) await pool.request().query("ALTER TABLE dbo.WorkReports ADD supervisor_id NVARCHAR(100) NULL");
        if (!dbCols.includes('report_type')) await pool.request().query("ALTER TABLE dbo.WorkReports ADD report_type NVARCHAR(50) NULL");
        if (!dbCols.includes('report_date')) await pool.request().query("ALTER TABLE dbo.WorkReports ADD report_date DATE NULL");
        if (!dbCols.includes('department')) await pool.request().query("ALTER TABLE dbo.WorkReports ADD department NVARCHAR(100) NULL");
        if (!dbCols.includes('maintenance_data')) await pool.request().query("ALTER TABLE dbo.WorkReports ADD maintenance_data NVARCHAR(MAX) NULL");
        if (!dbCols.includes('construction_data')) await pool.request().query("ALTER TABLE dbo.WorkReports ADD construction_data NVARCHAR(MAX) NULL");
        if (!dbCols.includes('sales_data')) await pool.request().query("ALTER TABLE dbo.WorkReports ADD sales_data NVARCHAR(MAX) NULL");

        columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WorkReports' AND TABLE_SCHEMA = 'dbo'");
        dbCols = (columnsRes.recordset || []).map(r => r.COLUMN_NAME);
      } catch (colErr) {
        console.warn('Auto alter table warning:', colErr.message);
      }
    }

    const hasNewCols = dbCols.includes('author_id') && dbCols.includes('week_start_date');
    const hasMaintenanceCol = dbCols.includes('maintenance_data');

    if (hasNewCols && hasMaintenanceCol) {
      await pool.request()
        .input('id', sql.NVarChar, String(id))
        .input('author_id', sql.NVarChar, author_id)
        .input('supervisor_id', sql.NVarChar, supervisor_id)
        .input('report_type', sql.NVarChar, report_type)
        .input('report_date', sql.Date, report_date ? new Date(report_date) : null)
        .input('department', sql.NVarChar, department)
        .input('week_start_date', sql.Date, formattedWeekDate)
        .input('week_label', sql.NVarChar, week_label)
        .input('tasks', sql.NVarChar, tasks)
        .input('achievements', sql.NVarChar, achievements)
        .input('issues', sql.NVarChar, issues)
        .input('continued_items', sql.NVarChar, continued_items)
        .input('next_week_plans', sql.NVarChar, next_week_plans)
        .input('status', sql.NVarChar, repStatus)
        .input('review_feedback', sql.NVarChar, review_feedback)
        .input('maintenance_data', sql.NVarChar, maintenance_data_str)
        .input('construction_data', sql.NVarChar, construction_data_str)
        .input('sales_data', sql.NVarChar, sales_data_str)
        .query('MERGE dbo.WorkReports AS target USING (SELECT @id AS id) AS source ON (target.id = source.id) WHEN MATCHED THEN UPDATE SET author_id = @author_id, supervisor_id = @supervisor_id, report_type = @report_type, report_date = @report_date, department = @department, week_start_date = @week_start_date, week_label = @week_label, tasks = @tasks, achievements = @achievements, issues = @issues, continued_items = @continued_items, next_week_plans = @next_week_plans, status = @status, review_feedback = @review_feedback, maintenance_data = @maintenance_data, construction_data = @construction_data, sales_data = @sales_data, updated_at = SYSDATETIMEOFFSET() WHEN NOT MATCHED THEN INSERT (id, author_id, supervisor_id, report_type, report_date, department, week_start_date, week_label, tasks, achievements, issues, continued_items, next_week_plans, status, review_feedback, maintenance_data, construction_data, sales_data, createdAt, updated_at) VALUES (@id, @author_id, @supervisor_id, @report_type, @report_date, @department, @week_start_date, @week_label, @tasks, @achievements, @issues, @continued_items, @next_week_plans, @status, @review_feedback, @maintenance_data, @construction_data, @sales_data, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());');
    } else if (hasNewCols) {
      await pool.request()
        .input('id', sql.NVarChar, String(id))
        .input('author_id', sql.NVarChar, author_id)
        .input('supervisor_id', sql.NVarChar, supervisor_id)
        .input('week_start_date', sql.Date, formattedWeekDate)
        .input('week_label', sql.NVarChar, week_label)
        .input('tasks', sql.NVarChar, tasks)
        .input('achievements', sql.NVarChar, achievements)
        .input('issues', sql.NVarChar, issues)
        .input('continued_items', sql.NVarChar, continued_items)
        .input('next_week_plans', sql.NVarChar, next_week_plans)
        .input('status', sql.NVarChar, repStatus)
        .input('review_feedback', sql.NVarChar, review_feedback)
        .query('MERGE dbo.WorkReports AS target USING (SELECT @id AS id) AS source ON (target.id = source.id) WHEN MATCHED THEN UPDATE SET author_id = @author_id, supervisor_id = @supervisor_id, week_start_date = @week_start_date, week_label = @week_label, tasks = @tasks, achievements = @achievements, issues = @issues, continued_items = @continued_items, next_week_plans = @next_week_plans, status = @status, review_feedback = @review_feedback, updated_at = SYSDATETIMEOFFSET() WHEN NOT MATCHED THEN INSERT (id, author_id, supervisor_id, week_start_date, week_label, tasks, achievements, issues, continued_items, next_week_plans, status, review_feedback, createdAt, updated_at) VALUES (@id, @author_id, @supervisor_id, @week_start_date, @week_label, @tasks, @achievements, @issues, @continued_items, @next_week_plans, @status, @review_feedback, SYSDATETIMEOFFSET(), SYSDATETIMEOFFSET());');
    } else {
      await pool.request()
        .input('id', sql.VarChar, String(id))
        .input('authorId', sql.VarChar, author_id)
        .input('weekStartDate', sql.Date, formattedWeekDate)
        .input('weekLabel', sql.NVarChar, week_label)
        .input('tasks', sql.NVarChar, tasks)
        .input('results', sql.NVarChar, achievements)
        .input('issues', sql.NVarChar, issues)
        .input('ongoingProjects', sql.NVarChar, continued_items)
        .input('tomorrowPlan', sql.NVarChar, next_week_plans)
        .input('supervisorId', sql.VarChar, supervisor_id)
        .input('status', sql.VarChar, repStatus)
        .input('feedbackComment', sql.NVarChar, review_feedback)
        .query('MERGE dbo.WorkReports AS target USING (SELECT @id AS id) AS source ON (target.id = source.id) WHEN MATCHED THEN UPDATE SET authorId = @authorId, weekStartDate = @weekStartDate, weekLabel = @weekLabel, tasks = @tasks, results = @results, issues = @issues, ongoingProjects = @ongoingProjects, tomorrowPlan = @tomorrowPlan, supervisorId = @supervisorId, status = @status, feedbackComment = @feedbackComment, updatedAt = GETDATE() WHEN NOT MATCHED THEN INSERT (id, authorId, weekStartDate, weekLabel, tasks, results, issues, ongoingProjects, tomorrowPlan, supervisorId, status, feedbackComment, createdAt, updatedAt) VALUES (@id, @authorId, @weekStartDate, @weekLabel, @tasks, @results, @issues, @ongoingProjects, @tomorrowPlan, @supervisorId, @status, @feedbackComment, GETDATE(), GETDATE());');
    }

    if (repStatus === 'submitted' && supervisor_id && supervisor_id !== author_id) {
      try {
        const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const authorName = data.authorName || (data.author && data.author.name) || '社員';
        await pool.request()
          .input('notifId', sql.NVarChar, notifId)
          .input('user_id', sql.NVarChar, String(supervisor_id))
          .input('sender_id', sql.NVarChar, String(author_id))
          .input('type', sql.NVarChar, 'work_report')
          .input('title', sql.NVarChar, '【週報】' + authorName + 'さんより提出')
          .input('contents', sql.NVarChar, (week_label || '最新') + 'の週報が提出されました。確認をお願いします。')
          .input('target_id', sql.NVarChar, String(id))
          .query('INSERT INTO dbo.notifications (id, user_id, sender_id, type, title, contents, target_id, is_read, created_at) VALUES (@notifId, @user_id, @sender_id, @type, @title, @contents, @target_id, 0, SYSDATETIMEOFFSET())');
      } catch (notifErr) {
        console.warn('SQL Server notification insert warning:', notifErr.message);
      }
    }

    res.status(201).json({ success: true, id, message: '日報・週報保存完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

app.post('/api/work-reports', handlePostDailyReport);
app.post('/api/daily-reports', handlePostDailyReport);
app.post('/api/reports', handlePostDailyReport);
app.put('/api/work-reports/:id', handlePostDailyReport);
app.put('/api/daily-reports/:id', handlePostDailyReport);

// 上長確認・レビュー API (dbo.notifications 自動連動)
app.post(['/api/work-reports/:id/review', '/api/daily-reports/:id/review'], async (req, res) => {
  try {
    const { feedbackComment, review_feedback, reviewerUserId, reviewerName } = req.body || {};
    const pool = await getPool();
    const comment = review_feedback !== undefined ? review_feedback : (feedbackComment || '');
    const reportId = String(req.params.id);

    // 更新前のレポート情報（提出者）を取得
    const repRes = await pool.request()
      .input('id', sql.NVarChar, reportId)
      .query('SELECT * FROM dbo.WorkReports WHERE id = @id');
    
    const existing = (repRes.recordset && repRes.recordset[0]) || {};
    const author_id = existing.author_id || existing.authorId;
    const week_label = existing.week_label || existing.weekLabel || '';

    // カラム構造に合わせて更新
    const columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'WorkReports' AND TABLE_SCHEMA = 'dbo'");
    const dbCols = (columnsRes.recordset || []).map(r => r.COLUMN_NAME);

    if (dbCols.includes('review_feedback')) {
      await pool.request()
        .input('id', sql.NVarChar, reportId)
        .input('review_feedback', sql.NVarChar, comment)
        .query("UPDATE dbo.WorkReports SET status = 'reviewed', review_feedback = @review_feedback, reviewed_at = SYSDATETIMEOFFSET(), updated_at = SYSDATETIMEOFFSET() WHERE id = @id");
    } else {
      await pool.request()
        .input('id', sql.VarChar, reportId)
        .input('feedbackComment', sql.NVarChar, comment)
        .query("UPDATE dbo.WorkReports SET status = 'reviewed', feedbackComment = @feedbackComment, reviewedAt = GETDATE(), updatedAt = GETDATE() WHERE id = @id");
    }

    // 提出者本人へ notifications レコードを INSERT 連動
    if (author_id) {
      try {
        const notifId = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
        const titleStr = '【週報】' + (reviewerName || '上長') + 'が週報を確認しました';
        const contentsStr = (week_label || '') + 'の週報が確認されました。' + (comment ? ('コメント: 「' + comment + '」') : '');
        await pool.request()
          .input('notifId', sql.NVarChar, notifId)
          .input('user_id', sql.NVarChar, String(author_id))
          .input('sender_id', sql.NVarChar, reviewerUserId ? String(reviewerUserId) : null)
          .input('type', sql.NVarChar, 'work_report_review')
          .input('title', sql.NVarChar, titleStr)
          .input('contents', sql.NVarChar, contentsStr)
          .input('target_id', sql.NVarChar, reportId)
          .query('INSERT INTO dbo.notifications (id, user_id, sender_id, type, title, contents, target_id, is_read, created_at) VALUES (@notifId, @user_id, @sender_id, @type, @title, @contents, @target_id, 0, SYSDATETIMEOFFSET())');
      } catch (notifErr) {
        console.warn('SQL Server review notification insert warning:', notifErr.message);
      }
    }

    res.json({ success: true, message: '確認・レビュー完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// 削除 API
app.delete(['/api/work-reports/:id', '/api/daily-reports/:id', '/api/reports/:id'], async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.NVarChar, String(req.params.id)).query('DELETE FROM dbo.WorkReports WHERE id = @id');
    res.json({ success: true, message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 10. Notifications (通知一覧・既読・削除 API)
// ------------------------------------------
app.get(['/api/notifications', '/api/notifications/:userId'], async (req, res) => {
  try {
    const pool = await getPool();
    const targetUserId = req.params.userId || req.query.userId || req.query.user_id;
    let query = \`
      SELECT n.*, 
             uSender.name AS senderName, uSender.avatarUrl AS senderAvatarUrl, uSender.department AS senderDepartment
      FROM dbo.notifications n
      LEFT JOIN dbo.Users uSender ON n.sender_id = uSender.id
    \`;
    const request = pool.request();
    if (targetUserId) {
      query += ' WHERE n.user_id = @userId';
      request.input('userId', sql.NVarChar, String(targetUserId));
    }
    query += ' ORDER BY n.is_read ASC, n.created_at DESC';
    const result = await request.query(query);

    const list = (result.recordset || []).map(row => ({
      id: String(row.id),
      user_id: row.user_id,
      sender_id: row.sender_id,
      type: row.type,
      title: row.title,
      contents: row.contents,
      target_id: row.target_id,
      is_read: Boolean(row.is_read),
      created_at: row.created_at,
      // 互換用
      userId: row.user_id,
      senderId: row.sender_id,
      senderName: row.senderName,
      senderAvatar: row.senderAvatarUrl,
      content: row.contents,
      targetId: row.target_id,
      isRead: Boolean(row.is_read),
      createdAt: row.created_at
    }));

    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications', async (req, res) => {
  try {
    const { user_id, userId, sender_id, senderId, type, title, contents, content, target_id, targetId } = req.body || {};
    const targetUser = user_id || userId;
    if (!targetUser) return res.status(400).json({ error: 'user_id is required' });

    const pool = await getPool();
    const id = 'notif_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
    await pool.request()
      .input('id', sql.NVarChar, id)
      .input('user_id', sql.NVarChar, String(targetUser))
      .input('sender_id', sql.NVarChar, sender_id || senderId || null)
      .input('type', sql.NVarChar, type || 'system')
      .input('title', sql.NVarChar, title || '通知')
      .input('contents', sql.NVarChar, contents || content || '')
      .input('target_id', sql.NVarChar, target_id || targetId || null)
      .query('INSERT INTO dbo.notifications (id, user_id, sender_id, type, title, contents, target_id, is_read, created_at) VALUES (@id, @user_id, @sender_id, @type, @title, @contents, @target_id, 0, SYSDATETIMEOFFSET())');
    res.status(201).json({ success: true, id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put(['/api/notifications/:id/read', '/api/notifications/:id'], async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, String(req.params.id))
      .query('UPDATE dbo.notifications SET is_read = 1 WHERE id = @id');
    res.json({ success: true, message: '既読に更新しました' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});
app.post('/api/notifications/:id/read', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, String(req.params.id))
      .query('UPDATE dbo.notifications SET is_read = 1 WHERE id = @id');
    res.json({ success: true, message: '既読に更新しました' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/notifications/mark-all-read', async (req, res) => {
  try {
    const targetUserId = req.body?.user_id || req.body?.userId || req.query.userId;
    const pool = await getPool();
    const request = pool.request();
    let query = 'UPDATE dbo.notifications SET is_read = 1';
    if (targetUserId) {
      query += ' WHERE user_id = @userId';
      request.input('userId', sql.NVarChar, String(targetUserId));
    }
    await request.query(query);
    res.json({ success: true, message: 'すべての通知を既読にしました' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/notifications/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request()
      .input('id', sql.NVarChar, String(req.params.id))
      .query('DELETE FROM dbo.notifications WHERE id = @id');
    res.json({ success: true, message: '通知を削除しました' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});


// ==========================================
// 掲示板用 API ルーティング登録一覧
// ==========================================
app.get('/api/bulletins', handleGetBulletins);
app.get('/api/board', handleGetBulletins);

app.post('/api/bulletins', handlePostBulletin);
app.post('/api/board', handlePostBulletin);

app.put('/api/bulletins/:id', handlePutBulletin);
app.put('/api/board/:id', handlePutBulletin);

app.post('/api/bulletins/:id/comments', handleAddComment);
app.post('/api/board/:id/comments', handleAddComment);

app.post('/api/bulletins/:id/viewers', handleAddViewer);
app.post('/api/topics/:id/viewers', handleAddViewer);

app.delete('/api/bulletins/:id', handleDeleteBulletin);
app.delete('/api/board/:id', handleDeleteBulletin);


// ==========================================
// 8. 外部NAS同期・外部ファイル連携用 API
// ==========================================
// パス正規化ヘルパー (テンプレート文字列のエスケープ崩れを100%防ぐため String.fromCharCode を使用)
function normalizePath(inputPath) {
  if (!inputPath || typeof inputPath !== 'string') return '';
  let cleaned = inputPath.split('..').join('').split(String.fromCharCode(92)).join('/');
  while (cleaned.startsWith('/')) {
    cleaned = cleaned.slice(1);
  }
  return cleaned;
}

// 外部ファイル用のmulterストレージ設定 (ファイル名の日本語文字化け対策を含む)
const externalStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const subDir = typeof req.body.folder === 'string' ? normalizePath(req.body.folder) : '';
    const targetPath = path.join(externalFilesDir, subDir);
    if (!fs.existsSync(targetPath)) {
      fs.mkdirSync(targetPath, { recursive: true });
    }
    cb(null, targetPath);
  },
  filename: function (req, file, cb) {
    let originalName = file.originalname;
    try {
      // multipartヘッダーのエンコードに起因する日本語ファイル名の文字化けを防止
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
    const folderPath = req.body.folder ? normalizePath(req.body.folder) : '';
    const filePath = folderPath ? normalizePath(folderPath + '/' + req.file.filename) : req.file.filename;
    res.json({
      message: 'アップロード完了しました。',
      file: {
        name: req.file.filename,
        path: filePath,
        size: req.file.size
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function getAllFilesRecursive(dirPath, relativeRoot = "") {
  let results = [];
  if (!fs.existsSync(dirPath)) return results;
  try {
    const list = fs.readdirSync(dirPath);
    list.forEach((file) => {
      // ドットファイルや隠しファイル、システム一時ファイルは無視
      if (file.startsWith('.') || file === '@eaDir' || file === 'thumbs.db') return;
      
      const filePath = path.join(dirPath, file);
      const relPath = relativeRoot ? path.join(relativeRoot, file) : file;
      const cleanRelPath = normalizePath(relPath);
      const stat = fs.statSync(filePath);
      
      if (stat.isDirectory()) {
        results.push({
          name: file,
          path: cleanRelPath,
          size: 0,
          mtime: stat.mtime,
          isDirectory: true,
          extension: ''
        });
        // 子ディレクトリを再帰的に探索
        results = results.concat(getAllFilesRecursive(filePath, relPath));
      } else {
        const ext = path.extname(file).replace('.', '').toLowerCase();
        results.push({
          name: file,
          path: cleanRelPath,
          url: '/api/external-files/serve?path=' + encodeURIComponent(cleanRelPath),
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 外部ファイル個別取得・プレビュー・ダウンロード用 API (リバースプロキシの追加設定が不要になります)
app.get('/api/external-files/serve', (req, res) => {
  try {
    const targetRelPath = req.query.path;
    if (!targetRelPath || typeof targetRelPath !== 'string') {
      return res.status(400).json({ error: 'ファイルパスが指定されていません' });
    }
    // パス・トラバーサル防止の安全対策および区切り文字の正規化
    const sanitizedPath = normalizePath(targetRelPath);
    if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '/') {
      return res.status(400).json({ error: '有効なファイルパスが指定されていません' });
    }
    const safePath = path.join(externalFilesDir, sanitizedPath);
    
    if (fs.existsSync(safePath)) {
      const filename = path.basename(safePath);
      // download=1 クエリパラメータ指定時は強制ダウンロード
      if (req.query.download === '1') {
        return res.download(safePath, filename);
      }
      res.sendFile(safePath);
    } else {
      res.status(404).json({ error: 'ファイルが見つかりません' });
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新規フォルダ作成 API
app.post('/api/external-files/folder', (req, res) => {
  try {
    const { folder } = req.body;
    if (!folder || typeof folder !== 'string') {
      return res.status(400).json({ error: 'フォルダ名が指定されていません' });
    }
    const sanitizedPath = normalizePath(folder);
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
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ファイル削除 API (必要に応じてWEBアプリ側から削除可能にする)
app.delete('/api/external-files', (req, res) => {
  try {
    const targetRelPath = req.query.path;
    if (!targetRelPath || typeof targetRelPath !== 'string') {
      return res.status(400).json({ error: 'ファイルパスが指定されていません' });
    }
    // パス・トラバーサル防止の安全対策および区切り文字の正規化
    const sanitizedPath = normalizePath(targetRelPath);
    
    // ルートフォルダ自体の誤削除を防ぐセキュリティガード
    if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '/') {
      return res.status(400).json({ error: 'ルートディレクトリを削除することはできません。' });
    }

    const safePath = path.join(externalFilesDir, sanitizedPath);
    
    // 絶対パス解決後に再度ルートディレクトリと一致しないか厳密チェック
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
      res.status(404).json({ error: 'ファイルまたはフォルダが見つかりません' });
    }
  } catch (err) {
    console.error('ファイル削除エラー:', err);
    res.status(500).json({ error: 'ファイル削除処理中にエラーが発生しました: ' + err.message });
  }
});

// iCalプロキシ取得 API (CORS回避用)
app.get('/api/ical-proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send('URLパラメータが指定されていません');
    }
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).send('iCalの取得に失敗しました');
    }
    const text = await response.text();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(text);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// iCal案内およびエクスポート API
app.get(['/api/ical', '/api/ical/'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(\`
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
  \`);
});

// カレンダーiCal(ICS)エクスポート API
app.get('/api/ical/user_:userId_calendar.ics', async (req, res) => {
  try {
    let rawUserId = req.params.userId || req.params.userId_calendar || '';
    if (rawUserId.endsWith('_calendar')) {
      rawUserId = rawUserId.substring(0, rawUserId.length - '_calendar'.length);
    }
    const userId = rawUserId;

    const pool = await getPool();

    // ユーザー情報を取得
    let userName = '';
    let userEmail = '';
    try {
      const userRes = await pool.request()
        .input('userId', sql.VarChar, userId)
        .query('SELECT name, email, office, division FROM dbo.Users WHERE id = @userId');
      if (userRes.recordset && userRes.recordset.length > 0) {
        userName = userRes.recordset[0].name || '';
        userEmail = userRes.recordset[0].email || '';
      }
    } catch (_) {}

    // イベント全件取得
    const result = await pool.request()
      .query('SELECT * FROM dbo.Events ORDER BY startAt ASC');

    // 【重要】個人専用カレンダー: 自分が参加者（attendees）に含まれている予定のみを厳格に抽出
    // ※自分が代理作成・投稿しただけで自身が参加しない予定や、別メンバーの作業予定は除外されます
    const filteredEvents = (result.recordset || []).filter(evt => {
      let isAttendee = false;

      // description JSON または attendees カラムから参加者一覧を取得
      let descObj = null;
      if (evt.description && typeof evt.description === 'string' && evt.description.trim().startsWith('{')) {
        try {
          descObj = JSON.parse(evt.description);
        } catch (_) {}
      }

      const rawAttendees = evt.attendees || (descObj && descObj.attendees) || [];
      let parsedAttendeesList = [];
      if (Array.isArray(rawAttendees)) {
        parsedAttendeesList = rawAttendees;
      } else if (typeof rawAttendees === 'string') {
        try {
          const parsed = JSON.parse(rawAttendees);
          if (Array.isArray(parsed)) parsedAttendeesList = parsed;
        } catch (_) {}
      }

      if (parsedAttendeesList.length > 0) {
        isAttendee = parsedAttendeesList.some((att) => {
          if (!att) return false;
          if (typeof att === 'object') {
            const attId = String(att.id || '');
            const attName = String(att.name || '');
            const attEmail = String(att.email || '');
            return attId === String(userId) ||
                   (userName && attName === userName) ||
                   (userEmail && attEmail === userEmail);
          }
          const attStr = String(att);
          return attStr === String(userId) || (userName && attStr === userName);
        });
      }

      return isAttendee;
    });

    // UTC (末尾に Z) フォーマットヘルパー (ミリ秒を含まない YYYYMMDDTHHMMSSZ)
    const formatToUtc = (dateObj) => {
      const d = new Date(dateObj);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      const mm = pad(d.getUTCMonth() + 1);
      const dd = pad(d.getUTCDate());
      const hh = pad(d.getUTCHours());
      const min = pad(d.getUTCMinutes());
      const ss = pad(d.getUTCSeconds());
      return \`\${yyyy}\${mm}\${dd}T\${hh}\${min}\${ss}Z\`;
    };

    const formatToUtcDate = (dateObj) => {
      const d = new Date(dateObj);
      if (isNaN(d.getTime())) return '';
      const pad = (n) => String(n).padStart(2, '0');
      const yyyy = d.getUTCFullYear();
      const mm = pad(d.getUTCMonth() + 1);
      const dd = pad(d.getUTCDate());
      return \`\${yyyy}\${mm}\${dd}\`;
    };

    const extractLocalDateStr = (dateInput) => {
      if (!dateInput) return '';
      if (dateInput instanceof Date) {
        const y = dateInput.getFullYear();
        const m = String(dateInput.getMonth() + 1).padStart(2, '0');
        const d = String(dateInput.getDate()).padStart(2, '0');
        return \`\${y}-\${m}-\${d}\`;
      }
      const str = String(dateInput);
      const match = str.match(/^(\\d{4})[-/](\\d{2})[-/](\\d{2})/);
      if (match) {
        return \`\${match[1]}-\${match[2]}-\${match[3]}\`;
      }
      const d = new Date(dateInput);
      if (isNaN(d.getTime())) return '';
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const day = String(d.getDate()).padStart(2, '0');
      return \`\${y}-\${m}-\${day}\`;
    };

    let icsContent = "BEGIN:VCALENDAR\\r\\nVERSION:2.0\\r\\nPRODID:-//Company SNS Calendar//JA\\r\\nCALSCALE:GREGORIAN\\r\\nMETHOD:PUBLISH\\r\\nX-WR-CALNAME:社内カレンダー同期\\r\\nX-WR-TIMEZONE:Asia/Tokyo\\r\\n";
    const nowStr = formatToUtc(new Date());

    for (const evt of filteredEvents) {
      const isAllDay = evt.isAllDay === true || evt.isAllDay === 1;
      let dtStartLine = '';
      let dtEndLine = '';

      if (isAllDay) {
        const startStr = extractLocalDateStr(evt.startAt);
        const endStr = evt.endAt ? extractLocalDateStr(evt.endAt) : startStr;
        if (startStr && endStr) {
          const startClean = startStr.replace(/-/g, '');
          dtStartLine = "DTSTART;VALUE=DATE:" + startClean + "\\r\\n";
          
          const parts = endStr.split('-');
          const endYear = parseInt(parts[0], 10);
          const endMonth = parseInt(parts[1], 10) - 1;
          const endDay = parseInt(parts[2], 10);
          
          const nextDate = new Date(endYear, endMonth, endDay + 1, 12, 0, 0);
          const nextYear = nextDate.getFullYear();
          const nextMonth = String(nextDate.getMonth() + 1).padStart(2, '0');
          const nextDay = String(nextDate.getDate()).padStart(2, '0');
          dtEndLine = "DTEND;VALUE=DATE:" + \`\${nextYear}\${nextMonth}\${nextDay}\` + "\\r\\n";
        }
      } else {
        const startD = evt.startAt ? new Date(evt.startAt) : null;
        const endD = evt.endAt ? new Date(evt.endAt) : startD;
        if (startD && endD) {
          dtStartLine = "DTSTART:" + formatToUtc(startD) + "\\r\\n";
          dtEndLine = "DTEND:" + formatToUtc(endD) + "\\r\\n";
        }
      }
      
      let descText = evt.description || '';
      if (descText.startsWith('{')) {
        try {
          const parsed = JSON.parse(descText);
          descText = parsed.memo || '';
        } catch (_) {}
      }

      // 改行のエスケープおよびカンマ等のエスケープ
      const summaryEscaped = (evt.title || '').replace(/\\r\\n|\\r|\\n/g, ' ').replace(/[,;]/g, '\\\\$&');
      const descEscaped = descText.replace(/\\r\\n|\\r|\\n/g, '\\\\n').replace(/[,;]/g, '\\\\$&');
      const locEscaped = (evt.location || '').replace(/\\r\\n|\\r|\\n/g, ' ').replace(/[,;]/g, '\\\\$&');

      icsContent += "BEGIN:VEVENT\\r\\n";
      icsContent += "UID:evt-" + evt.id + "@company-sns\\r\\n";
      icsContent += "DTSTAMP:" + nowStr + "\\r\\n";
      icsContent += "SUMMARY:" + summaryEscaped + "\\r\\n";
      if (descText) icsContent += "DESCRIPTION:" + descEscaped + "\\r\\n";
      if (evt.location) icsContent += "LOCATION:" + locEscaped + "\\r\\n";
      if (dtStartLine) icsContent += dtStartLine;
      if (dtEndLine) icsContent += dtEndLine;
      icsContent += "END:VEVENT\\r\\n";
    }
    icsContent += "END:VCALENDAR\\r\\n";

    // RFC 5545 に準拠した75オクテット（バイト）以内での折りたたみ(Folding)処理
    const lines = icsContent.split("\\r\\n");
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
          result += currentStr + "\\r\\n ";
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
    const finalIcs = foldedLines.join("\\r\\n");

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', 'inline; filename="user_' + userId + '_calendar.ics"');
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(finalIcs);
  } catch (err) {
    res.status(500).send(err.message);
  }
});


// =========================================================
// サーバー起動 (すべての設定が終わった最後に実行)
// =========================================================
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(\`🚀 Company SNS API server listening on port \${PORT} [最終更新: 2026年8月5日 18:00 (自動パス解決＆耐障害性強化版)]\`));`;
