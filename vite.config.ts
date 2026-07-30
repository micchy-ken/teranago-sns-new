import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, Plugin } from 'vite';

const SYNOLOGY_BASE = 'https://sns.teranago.synology.me/api';

const DATA_DIR = path.resolve(__dirname, 'data');
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}
const BULLETINS_FILE = path.join(DATA_DIR, 'bulletins_custom.json');
const MEMOS_FILE = path.join(DATA_DIR, 'memos_custom.json');

function getCustomBulletins(): Record<string, any> {
  try {
    if (fs.existsSync(BULLETINS_FILE)) {
      return JSON.parse(fs.readFileSync(BULLETINS_FILE, 'utf-8'));
    }
  } catch (_) {}
  return {};
}

function saveCustomBulletins(data: Record<string, any>) {
  try {
    fs.writeFileSync(BULLETINS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('Failed to save bulletins custom:', err.message);
  }
}

function getCustomMemos(): any[] {
  try {
    if (fs.existsSync(MEMOS_FILE)) {
      return JSON.parse(fs.readFileSync(MEMOS_FILE, 'utf-8'));
    }
  } catch (_) {}
  return [];
}

function saveCustomMemos(memos: any[]) {
  try {
    fs.writeFileSync(MEMOS_FILE, JSON.stringify(memos, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('Failed to save memos custom:', err.message);
  }
}

function synologyProxyPlugin(): Plugin {
  return {
    name: 'synology-api-proxy',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const originalUrl = req.url || '';

        if (!originalUrl.includes('/api')) {
          return next();
        }

        const apiIndex = originalUrl.indexOf('/api');
        let apiPath = originalUrl.substring(apiIndex + 4);
        if (apiPath.includes('?')) {
          apiPath = apiPath.split('?')[0];
        }
        if (!apiPath.startsWith('/')) {
          apiPath = '/' + apiPath;
        }

        const method = req.method || 'GET';

        let bodyData: any = null;
        if (['POST', 'PUT', 'PATCH'].includes(method)) {
          const buffers: Buffer[] = [];
          for await (const chunk of req) {
            buffers.push(chunk);
          }
          const raw = Buffer.concat(buffers).toString('utf8');
          if (raw) {
            try { bodyData = JSON.parse(raw); } catch (_) { bodyData = raw; }
          }
        }

        console.log(`[PROXY API] ${method} ${apiPath}`);

        // --- 1. BULLETINS ハンドリング (404 回避 & コメント・いいね保存) ---
        // PUT /bulletins/:id
        if (apiPath.startsWith('/bulletins/') && method === 'PUT') {
          const topicId = apiPath.replace('/bulletins/', '').trim();
          if (topicId && typeof bodyData === 'object' && bodyData !== null) {
            const store = getCustomBulletins();
            store[topicId] = {
              ...(store[topicId] || {}),
              ...bodyData,
              id: topicId,
              updatedAt: new Date().toISOString()
            };
            saveCustomBulletins(store);

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ message: '掲示板を更新しました', topic: store[topicId] }));
          }
        }

        // POST /bulletins/:id/comments
        if (apiPath.includes('/bulletins/') && apiPath.endsWith('/comments') && method === 'POST') {
          const parts = apiPath.split('/');
          const topicId = parts[2];
          if (topicId && typeof bodyData === 'object' && bodyData !== null) {
            const store = getCustomBulletins();
            const topic = store[topicId] || { id: topicId, comments: [] };
            const comments = topic.comments || [];
            const newComment = {
              id: bodyData.id || `c-${Date.now()}`,
              content: bodyData.content || '',
              authorId: bodyData.authorId || 'u1',
              createdAt: bodyData.createdAt || new Date().toISOString(),
              ...bodyData
            };
            comments.push(newComment);
            topic.comments = comments;
            store[topicId] = topic;
            saveCustomBulletins(store);

            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ message: 'コメントを追加しました', comment: newComment }));
          }
        }

        // GET /bulletins - Synology から取得してカスタムデータ（コメント等）と合成
        if (apiPath === '/bulletins' && method === 'GET') {
          try {
            const synRes = await fetch(`${SYNOLOGY_BASE}/bulletins`);
            if (synRes.ok) {
              const synBulletins = await synRes.json();
              const customStore = getCustomBulletins();

              const merged = synBulletins.map((b: any) => {
                const custom = customStore[b.id];
                if (custom) {
                  return {
                    ...b,
                    ...custom,
                    comments: custom.comments || b.comments || []
                  };
                }
                return b;
              });

              // Synology 側にないがローカルで新規作成されたトピックを追加
              const synIds = new Set(synBulletins.map((b: any) => String(b.id)));
              Object.keys(customStore).forEach((id) => {
                if (!synIds.has(id)) {
                  merged.unshift(customStore[id]);
                }
              });

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify(merged));
            }
          } catch (err: any) {
            console.warn('[PROXY WARN] Failed to fetch /bulletins from Synology, returning custom store:', err.message);
            const customStore = getCustomBulletins();
            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(Object.values(customStore)));
          }
        }

        // --- 2. WORKFLOWS 補正 ---
        if (apiPath === '/workflows' && method === 'POST') {
          if (typeof bodyData === 'object' && bodyData !== null) {
            bodyData.approverId = bodyData.approverId || bodyData.applicantId || 'u1';
            bodyData.description = bodyData.description || bodyData.title || '';
          }
        }

        // --- 3. MEMOS ハンドリング ---
        if (apiPath === '/memos' && method === 'POST') {
          if (typeof bodyData === 'object' && bodyData !== null) {
            const targetReceiver = bodyData.receiverId || bodyData.toUserId || 'u1';
            const recStatuses = (bodyData.details && bodyData.details.recipientStatuses) || [
              { userId: targetReceiver, userName: bodyData.toUserName || '', isViewed: false, isHandled: false }
            ];
            const statusJson = JSON.stringify(recStatuses);

            bodyData.recipientStatusesJson = bodyData.recipientStatusesJson || statusJson;
            bodyData.recipientStatuses = bodyData.recipientStatuses || statusJson;
            bodyData.recipient_statuses_json = bodyData.recipient_statuses_json || statusJson;
            bodyData.toUsersJson = bodyData.toUsersJson || JSON.stringify([targetReceiver]);
            bodyData.receiverId = targetReceiver;
            bodyData.senderId = bodyData.senderId || 'u1';
          }
        }

        if (apiPath === '/memos' && method === 'GET') {
          try {
            const synRes = await fetch(`${SYNOLOGY_BASE}/memos`);
            if (synRes.ok) {
              const synMemos = await synRes.json();
              const customMemos = getCustomMemos();
              const synIds = new Set(synMemos.map((m: any) => String(m.id)));
              const localOnly = customMemos.filter((m) => !synIds.has(String(m.id)));

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify([...localOnly, ...synMemos]));
            }
          } catch (_) {}
        }

        // --- 透過プロキシ処理（Pure Pass-Through to Synology API） ---
        try {
          const fetchOptions: RequestInit = {
            method,
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json'
            }
          };

          if (bodyData && ['POST', 'PUT', 'PATCH'].includes(method)) {
            fetchOptions.body = typeof bodyData === 'string' ? bodyData : JSON.stringify(bodyData);
          }

          const synRes = await fetch(`${SYNOLOGY_BASE}${apiPath}`, fetchOptions);
          const resText = await synRes.text();

          // Synology から 500 や 404 が返った場合のフォールバック（メモ新規作成など）
          if (!synRes.ok && apiPath === '/memos' && method === 'POST') {
            console.warn('[PROXY FALLBACK] Memos POST failed on Synology, saving to custom memos store');
            const customMemos = getCustomMemos();
            customMemos.unshift(bodyData);
            saveCustomMemos(customMemos);

            res.statusCode = 201;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify({ id: bodyData.id, message: '伝言メモ作成完了(ローカル保存)' }));
          }

          res.statusCode = synRes.status;
          res.setHeader('Content-Type', 'application/json');
          return res.end(resText);
        } catch (err: any) {
          console.error(`[PROXY ERROR] ${method} ${apiPath}:`, err.message);
          res.statusCode = 500;
          res.setHeader('Content-Type', 'application/json');
          return res.end(JSON.stringify({ error: err.message }));
        }
      });
    }
  };
}

export default defineConfig(() => {
  return {
    base: '/teranago-sns-new/',
    plugins: [react(), tailwindcss(), synologyProxyPlugin()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
