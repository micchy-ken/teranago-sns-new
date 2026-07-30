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
const MASTERS_FILE = path.join(DATA_DIR, 'masters_custom.json');

const defaultMasters = {
  offices: [
    { id: 'off-1', name: '東京本社', type: 'headquarters', code: 'HQ01', location: '東京都千代田区', phone: '03-1234-5678' },
    { id: 'off-2', name: '大阪支社', type: 'branch', code: 'BR01', location: '大阪府大阪市北区', phone: '06-8765-4321' },
    { id: 'off-3', name: '名古屋営業所', type: 'office', code: 'OF01', location: '愛知県名古屋市中区', phone: '052-111-2222' }
  ],
  divisions: [
    { id: 'div-1', name: '開発技術部', code: 'DEV', description: 'システム・アプリケーション開発' },
    { id: 'div-2', name: '営業統括部', code: 'SALES', description: '顧客営業・マーケティング' },
    { id: 'div-3', name: '人事総務部', code: 'HR', description: '採用・労務・施設管理' },
    { id: 'div-4', name: '企画マーケティング部', code: 'MKT', description: '新規事業企画・広報' }
  ],
  positions: [
    { id: 'pos-1', name: '一般社員', code: 'P1', description: '一般業務担当' },
    { id: 'pos-2', name: '主任', code: 'P2', description: 'チームリーダー補助' },
    { id: 'pos-3', name: '係長', code: 'P3', description: 'チームリーダー' },
    { id: 'pos-4', name: '課長', code: 'P4', description: '課の責任者' },
    { id: 'pos-5', name: '部長', code: 'P5', description: '部門の責任者' },
    { id: 'pos-6', name: '代表取締役', code: 'P6', description: '最高経営責任者' }
  ],
  itemMasters: [
    { id: 'itm_1', name: 'ノートPC Core i7/16GB', category: 'IT機器', defaultUnitPrice: 180000, unit: '台', code: 'PC-001' },
    { id: 'itm_2', name: '27インチ 4Kモニター', category: 'IT機器', defaultUnitPrice: 45000, unit: '台', code: 'MON-001' },
    { id: 'itm_3', name: 'オフィスチェア エルゴノミクス', category: 'オフィス用品', defaultUnitPrice: 35000, unit: '脚', code: 'CHR-001' },
    { id: 'itm_4', name: 'コピー用紙 A4 (500枚x5冊)', category: '消耗品', defaultUnitPrice: 3200, unit: '箱', code: 'PPR-A4' }
  ],
  approvalFlows: [
    {
      id: 'flow-1',
      name: '標準決裁フロー（直属上長＋部長）',
      description: '一般の申請・経費・物品購入に適用される標準的な2段階承認フロー',
      targetApplicationType: 'all',
      isDefault: true,
      steps: [
        { stepOrder: 1, stepName: '1次承認', approverType: 'supervisor', supervisorLevel: 1, isRequired: true },
        { stepOrder: 2, stepName: '最終承認', approverType: 'position', targetPosition: '部長', isRequired: true }
      ]
    },
    {
      id: 'flow-2',
      name: '役員決裁フロー',
      description: '高額品購入や重要な契約に関する役員承認が必要な特別フロー',
      targetApplicationType: 'expense',
      isDefault: false,
      steps: [
        { stepOrder: 1, stepName: '1次承認', approverType: 'supervisor', supervisorLevel: 1, isRequired: true },
        { stepOrder: 2, stepName: '2次承認', approverType: 'position', targetPosition: '部長', isRequired: true },
        { stepOrder: 3, stepName: '役員承認', approverType: 'position', targetPosition: '代表取締役', isRequired: true }
      ]
    }
  ]
};

function getCustomMasters(): typeof defaultMasters {
  try {
    if (fs.existsSync(MASTERS_FILE)) {
      return JSON.parse(fs.readFileSync(MASTERS_FILE, 'utf-8'));
    }
  } catch (_) {}
  return defaultMasters;
}

function saveCustomMasters(data: typeof defaultMasters) {
  try {
    fs.writeFileSync(MASTERS_FILE, JSON.stringify(data, null, 2), 'utf-8');
  } catch (err: any) {
    console.error('Failed to save masters custom:', err.message);
  }
}

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

        // --- 1. BULLETINS ハンドリング (404 回避 & コメント保存) ---
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

        // --- 4. MASTERS (Offices, Divisions, Positions, ItemMasters, ApprovalFlows) ---
        const masterRouteMap: Record<string, keyof typeof defaultMasters> = {
          '/offices': 'offices',
          '/masters/offices': 'offices',
          '/divisions': 'divisions',
          '/masters/divisions': 'divisions',
          '/positions': 'positions',
          '/masters/positions': 'positions',
          '/item-masters': 'itemMasters',
          '/masters/item-masters': 'itemMasters',
          '/approval-flows': 'approvalFlows',
          '/masters/approval-flows': 'approvalFlows',
        };

        const cleanPath = apiPath.split('?')[0].replace(/\/$/, '');
        const matchedPrefix = Object.keys(masterRouteMap).find(k => cleanPath === k || cleanPath.startsWith(k + '/'));
        const masterKey = matchedPrefix ? masterRouteMap[matchedPrefix] : null;

        if (masterKey) {
          const store = getCustomMasters();
          const items = store[masterKey] || [];

          if (method === 'GET') {
            try {
              const synRes = await fetch(`${SYNOLOGY_BASE}${apiPath}`);
              if (synRes.ok) {
                const synData = await synRes.json();
                if (Array.isArray(synData) && synData.length > 0) {
                  res.statusCode = 200;
                  res.setHeader('Content-Type', 'application/json');
                  return res.end(JSON.stringify(synData));
                }
              }
            } catch (_) {}

            res.statusCode = 200;
            res.setHeader('Content-Type', 'application/json');
            return res.end(JSON.stringify(items));
          }

          if (['POST', 'PUT'].includes(method)) {
            let bodyObj = typeof bodyData === 'string' ? JSON.parse(bodyData) : bodyData;
            if (bodyObj) {
              const itemId = bodyObj.id || `${masterKey.substring(0, 3)}-${Date.now()}`;
              bodyObj.id = itemId;
              const idx = items.findIndex((i: any) => String(i.id) === String(itemId));
              if (idx >= 0) {
                items[idx] = { ...items[idx], ...bodyObj };
              } else {
                items.push(bodyObj);
              }
              store[masterKey] = items as any;
              saveCustomMasters(store);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, item: bodyObj }));
            }
          }

          if (method === 'DELETE') {
            const parts = cleanPath.split('/');
            const targetId = parts[parts.length - 1];
            if (targetId) {
              store[masterKey] = items.filter((i: any) => String(i.id) !== String(targetId)) as any;
              saveCustomMasters(store);

              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              return res.end(JSON.stringify({ success: true, id: targetId }));
            }
          }
        }

        // --- 透過プロキシ処理（Pure Pass-Through to Synology API / SQL Server） ---
        // ※ /users 等は完全に Synology API / SQL Server へ 100% 直通します
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
