import express from 'express';
import cors from 'cors';
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
      callback(null, true);
    }
  },
  credentials: true
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

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
// OGP メタデータ取得 API (URLカードプレビュー用)
const ogpCache = new Map();
app.get('/api/ogp', async (req, res) => {
  const rawUrl = req.query.url;
  if (!rawUrl || typeof rawUrl !== 'string') return res.status(400).json({ error: 'URLが必要です' });
  let targetUrl = rawUrl.trim();
  if (!/^https?:\/\//i.test(targetUrl)) targetUrl = 'https://' + targetUrl;

  const cached = ogpCache.get(targetUrl);
  if (cached && Date.now() - cached.timestamp < 1000 * 60 * 60) return res.json(cached.data);

  try {
    const hostname = new URL(targetUrl).hostname;
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