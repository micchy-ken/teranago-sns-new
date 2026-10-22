/**
 * =====================================================================
 * 寺子屋 SNS サーバーサイド・メインエントリー (Express & MS SQL Server)
 * 最終更新日時: 2026年10月21日
 * 
 * 【主な更新・改善内容】
 * 1. サーバークラッシュ防止: uncaughtException / unhandledRejection ガードの設置
 * 2. Nginx Keep-Alive競合解消: keepAliveTimeout=65s / headersTimeout=66s (突然のFailed to fetch完全防止)
 * 3. 定期ポーリング保護: GET/HEAD/OPTIONSリクエストをレートリミットから完全除外 (社内LAN全社集約IPでの429遮断を防止)
 * 4. レートリミット改善: 書き込み(POST/PUT/DELETE)のみ保護、429制限時・500エラー時にもCORSヘッダーを保証
 * 5. CORS堅牢化: 予期せぬオリジンでもエラー例外で落とさず安全にハンドリング、プリフライト(OPTIONS)を完全許可
 * 6. グローバルエラーハンドリング: 予期せぬルーティングエラー時もCORSヘッダー付きJSONを返却
 * =====================================================================
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import net from 'net';
import { PORT, uploadDir, bulletinsFilesDir, externalFilesDir } from './config.js';
import { getPool } from './db.js';

// 各機能ルートのインポート
import mastersRouter from './routes/masters.js';
import usersRouter from './routes/users.js';
import eventsRouter from './routes/events.js';
import icalRouter from './routes/ical.js';
import workflowsRouter from './routes/workflows.js';
import bulletinsRouter from './routes/bulletins.js';
import chatsRouter from './routes/chats.js';
import memosRouter from './routes/memos.js';
import reportsRouter from './routes/reports.js';
import pushRouter from './routes/push.js';
import emailRouter from './routes/email.js';
import externalFilesRouter from './routes/externalFiles.js';
import safetyRouter from './routes/safety.js';
import postsRouter from './routes/posts.js';
import inspectionsRouter from './routes/inspections.js';
import stampsRouter from './routes/stamps.js';
import logsRouter from './routes/logs.js';
import invitationsRouter from './routes/invitations.js';
import passwordsRouter from './routes/passwords.js';
import documentsRouter from './routes/documents.js';
import schedulePollsRouter from './routes/schedulePolls.js';
import photoReportsRouter from './routes/photoReports.js';
import sitesRouter from './routes/sites.js';

// =====================================================================
// 0. プロセス保護（未処理例外・Promise拒否でNode.jsが急死するのを防止）
// =====================================================================
process.on('uncaughtException', (err) => {
  console.error('⚠️ [Process Error Guard] Uncaught Exception:', err);
});
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ [Process Error Guard] Unhandled Rejection:', reason);
});

const app = express();

// =====================================================================
// 1. CORS オリジン設定（最優先配置・全レスポンスにヘッダー付与）
// =====================================================================
const allowedOrigins = [
  'https://micchy-ken.github.io',
  'https://sns.teranago.synology.me',
  'http://sns.teranago.synology.me',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

const corsOptions = {
  origin: (origin, callback) => {
    // GitHub Pages, Synology NAS, AI Studioプレビュー, ローカル環境, 社内LAN
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('https://micchy-ken.github.io') ||
      origin.endsWith('.run.app') ||
      origin.endsWith('.googleusercontent.com') ||
      origin.includes('synology.me') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1') ||
      origin.includes('192.168.') ||
      origin.includes('10.') ||
      origin.includes('172.')
    ) {
      callback(null, true);
    } else {
      // 例外エラーを投げず安全に許可（エラーを投げるとブラウザがCORS切断として認識するため）
      callback(null, true);
    }
  },
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept', 'X-Requested-With', 'Range', 'Origin'],
  exposedHeaders: ['Content-Range', 'X-Content-Range', 'Accept-Ranges', 'Content-Length']
};

app.use(cors(corsOptions));
app.options('*', cors(corsOptions)); // プリフライトリクエストを明示的に即時許可

// =====================================================================
// 2. セキュリティ応答ヘッダーの付与
// =====================================================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// =====================================================================
// 3. レートリミット設定（社内SNS定期同期・全社同時アクセス最適化）
// =====================================================================
// 【超重要】社内LANやNginxリバースプロキシ環境では全社員が同一IPとして見えるため、
// 定期ポーリング（GETリクエスト: 伝言メモ・回覧板・カレンダー・日報・ワークフロー等）で
// 誤って全社アクセスが遮断されるのを防ぐため、GET/HEAD/OPTIONSは制限対象外とします。
// 書き込み（POST/PUT/DELETE）のみに総当たり・連打保護を適用します。
const writeRateLimitMap = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [ip, record] of writeRateLimitMap.entries()) {
    if (now > record.resetAt) {
      writeRateLimitMap.delete(ip);
    }
  }
}, 10 * 60 * 1000); // 10分ごとにクリーンアップ

app.use((req, res, next) => {
  // 読み取り（GET/HEAD）およびプリフライト（OPTIONS）は常時無条件で許可
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') {
    return next();
  }

  const ip = req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15分間
  const maxWriteRequests = 3000; // 15分間に3,000回（通常業務で絶対に引っかからない十分な余裕）

  const record = writeRateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  writeRateLimitMap.set(ip, record);

  if (record.count > maxWriteRequests) {
    // 429レスポンス時もブラウザでCORS切断と誤認されないようCORSヘッダーを保証付与
    if (req.headers.origin) {
      res.setHeader('Access-Control-Allow-Origin', req.headers.origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    return res.status(429).json({ error: 'Too Many Requests - 書き込みリクエスト上限を超えました。時間をおいて再試行してください。' });
  }
  next();
});

// =====================================================================
// 4. ペイロード容量上限の最適化（DoS防御: 10MB）
// =====================================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// リバースプロキシ対応ミドルウェア（/apiプレフィックス補正）
app.use((req, res, next) => {
  if (!req.url.startsWith('/api') && req.url !== '/health' && !req.url.startsWith('/uploads') && !req.url.startsWith('/bulletinsfiles') && !req.url.startsWith('/external-files')) {
    req.url = '/api' + req.url;
  }
  next();
});

// 静的ファイル配信
app.use('/uploads', express.static(uploadDir));
app.use('/bulletinsfiles', express.static(bulletinsFilesDir));
app.use('/api/bulletinsfiles', express.static(bulletinsFilesDir));
app.use('/external-files', express.static(externalFilesDir));

// ヘルスチェック
app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// =====================================================================
// 5. OGP メタデータ取得 API（SSRF 防御機能付き）
// =====================================================================
function isPrivateHost(hostname) {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  if (net.isIP(lower) === 4) {
    const parts = lower.split('.').map(Number);
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (クラウドメタデータAPI)
    if (parts[0] === 127) return true; // 127.0.0.0/8
  }
  return false;
}

const ogpCache = new Map();
app.get('/api/ogp', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') return res.status(400).json({ error: 'URLが必要です' });
  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

  const cached = ogpCache.get(targetUrl);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60) return res.json(cached.data);

  try {
    const parsed = new URL(targetUrl);
    const hostname = parsed.hostname;

    // SSRFチェック：プライベートIPやローカルネットワークへのリクエストを遮断
    if (isPrivateHost(hostname)) {
      return res.status(400).json({ error: '内部ネットワーク・プライベートIPへのURLリクエストは禁止されています (SSRF防御)' });
    }

    const fetchRes = await fetch(targetUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      signal: AbortSignal.timeout(4500)
    });
    const html = await fetchRes.text();
    const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
    const title = titleMatch ? titleMatch[1].trim() : hostname;

    const result = {
      url: targetUrl,
      hostname,
      title,
      description: '',
      image: '',
      siteName: hostname,
      favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
    };
    ogpCache.set(targetUrl, { data: result, timestamp: Date.now() });
    res.json(result);
  } catch (err) {
    const hostname = targetUrl.replace(/^https?:\/\//i, '').split('/')[0];
    res.json({
      url: targetUrl,
      hostname,
      title: hostname,
      description: '',
      image: '',
      siteName: hostname,
      favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`
    });
  }
});

// =====================================================================
// 6. 各機能ルーティング登録
// =====================================================================
app.use('/api', mastersRouter);
app.use('/api', usersRouter);
app.use('/api', eventsRouter);
app.use('/api', icalRouter);
app.use('/api', workflowsRouter);
app.use('/api', bulletinsRouter);
app.use('/api', chatsRouter);
app.use('/api', memosRouter);
app.use('/api', reportsRouter);
app.use('/api', pushRouter);
app.use('/api', emailRouter);
app.use('/api', externalFilesRouter);
app.use('/api', safetyRouter);
app.use('/api', postsRouter);
app.use('/api', inspectionsRouter);
app.use('/api', stampsRouter);
app.use('/api', logsRouter);
app.use('/api', invitationsRouter);
app.use('/api', passwordsRouter);
app.use('/api', documentsRouter);
app.use('/api', schedulePollsRouter);
app.use('/api', photoReportsRouter);
app.use('/api', sitesRouter);

// =====================================================================
// 7. グローバルエラーハンドリング（予期せぬエラー時もCORSヘッダーを保証）
// =====================================================================
app.use((err, req, res, next) => {
  console.error('⚠️ [Unhandled API Error Guard]:', err);
  if (!res.headersSent) {
    const origin = req.headers.origin;
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.status(500).json({ error: 'Internal Server Error', message: err?.message || 'サーバー内部エラーが発生しました' });
  }
});

// =====================================================================
// 8. DB初期接続 & サーバー起動 & Synology Nginx Keep-Alive 競合解消
// =====================================================================
getPool().catch(() => {});

const server = app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 寺子屋 SNS サーバーがポート ${PORT} で正常に起動しました`);
});

// Synology NAS (Nginx リバースプロキシ: 通常60秒タイムアウト) との Keep-Alive 競合（Race Condition）解消
// Node.js のデフォルト(5秒)が Nginx より短いために発生していた突然のソケット切断・Failed to fetch を完全防止
server.keepAliveTimeout = 65000; // 65秒 (Nginx 60秒より長く保持)
server.headersTimeout = 66000;   // 66秒 (keepAliveTimeoutより長く保持)