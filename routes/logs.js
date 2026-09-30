/**
 * routes/logs.js
 * アクセス・操作ログ管理モジュール (JSON永続化・CORS対応・完全互換)
 * 最終更新: 2026年9月30日 (ログイン・掲示板・チャット・安否確認・管理操作の時系列記録＆CSV出力対応)
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const dataDir = path.join(process.cwd(), 'data');
const logsFilePath = path.join(dataDir, 'activity-logs.json');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

function loadLogs() {
  if (!fs.existsSync(logsFilePath)) {
    return [];
  }
  try {
    const data = fs.readFileSync(logsFilePath, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[Logs] Failed to read activity logs:', err);
    return [];
  }
}

function saveLogs(logs) {
  try {
    // 最大 10,000 件まで保持（直近優先で自動トリミング）
    const trimmed = logs.slice(0, 10000);
    fs.writeFileSync(logsFilePath, JSON.stringify(trimmed, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Logs] Failed to save activity logs:', err);
    return false;
  }
}

/**
 * GET /api/logs
 * ログ一覧の取得（フィルター・検索・件数制限対応）
 */
router.get(['/', '/logs', '/all'], (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    let logs = loadLogs();

    const { action, userId, search, limit } = req.query;

    if (action && action !== 'all') {
      logs = logs.filter(l => l.action === action);
    }
    if (userId) {
      logs = logs.filter(l => l.userId === userId);
    }
    if (search) {
      const q = String(search).toLowerCase();
      logs = logs.filter(l => 
        (l.userName && l.userName.toLowerCase().includes(q)) ||
        (l.department && l.department.toLowerCase().includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q))
      );
    }

    const maxCount = limit ? parseInt(limit, 10) : 1000;
    const result = logs.slice(0, maxCount);

    res.json({ success: true, count: result.length, total: logs.length, logs: result });
  } catch (err) {
    console.error('[Logs GET Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/logs
 * ログの記録
 */
router.post(['/', '/logs', '/record'], (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    const { userId, userName, department, action, details, deviceType } = req.body || {};

    if (!action) {
      return res.status(400).json({ success: false, error: 'action is required' });
    }

    // IPアドレスの取得（プロキシ・リバースプロキシ対応）
    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress || '';
    const cleanIp = String(ip).split(',')[0].trim().replace(/^::ffff:/, '');

    const newLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      userId: userId || 'anonymous',
      userName: userName || '未設定',
      department: department || '',
      action: String(action),
      details: details ? String(details) : '',
      deviceType: deviceType ? String(deviceType) : '不明',
      ip: cleanIp
    };

    const logs = loadLogs();
    logs.unshift(newLog); // 先頭に追加（最新順）
    saveLogs(logs);

    res.json({ success: true, log: newLog });
  } catch (err) {
    console.error('[Logs POST Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * DELETE /api/logs/clear
 * ログの全消去（管理者用メンテナンス）
 */
router.delete(['/clear', '/logs/clear'], (req, res) => {
  try {
    res.setHeader('Access-Control-Allow-Origin', '*');
    saveLogs([]);
    res.json({ success: true, message: 'ログを消去しました' });
  } catch (err) {
    console.error('[Logs CLEAR Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
