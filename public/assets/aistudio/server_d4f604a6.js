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

const app = express();

// =====================================================================
// 1. セキュリティ応答ヘッダーの付与
// =====================================================================
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// =====================================================================
// 2. 簡易レートリミット（連打・DoS防御）
// =====================================================================
const rateLimitMap = new Map();
app.use((req, res, next) => {
  const ip = (req.headers['x-forwarded-for'])?.split(',')[0]?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
  const now = Date.now();
  const windowMs = 15 * 60 * 1000; // 15分間
  const maxRequests = 1000; // 15分間に最大1000リクエスト

  const record = rateLimitMap.get(ip) || { count: 0, resetAt: now + windowMs };
  if (now > record.resetAt) {
    record.count = 0;
    record.resetAt = now + windowMs;
  }
  record.count += 1;
  rateLimitMap.set(ip, record);

  if (record.count > maxRequests) {
    return res.status(429).json({ error: 'Too Many Requests - リクエスト数が一時的に超過しました。時間をおいて再試行してください。' });
  }
  next();
});

// =====================================================================
// 3. CORS オリジン制限（全開放 '*' の廃止とホワイトリスト化）
// =====================================================================
const allowedOrigins = [
  'https://micchy-ken.github.io',
  'https://sns.teranago.synology.me',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('https://micchy-ken.github.io') ||
      origin.endsWith('.run.app') ||
      origin.endsWith('.googleusercontent.com') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      callback(null, true);
    } else {
      callback(new Error('CORS Policy Violation: Access denied from this origin.'));
    }
  },
  credentials: true
}));

// =====================================================================
// 4. ペイロード容量上限の最適化（50MB → 10MB でDoS緩和）
// =====================================================================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// リバースプロキシ対応ミドルウェア
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
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (AWS/クラウド メタデータAPI)
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

// ルーティング登録
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

// DB初期接続 & サーバー起動
getPool().catch(() => {});
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 寺子屋 SNS サーバーがポート ${PORT} で正常に起動しました`);
});