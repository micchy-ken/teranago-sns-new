/**
 * =====================================================================
 * TERAPO 通知テンプレート集約・永続化モジュール (Express Router + サーバー共通ヘルパー)
 * 最終更新日時: 2026年11月25日 (JST)
 *
 * 機能:
 *  1. 管理者メニュー「様式 ＞ 通知様式（Push・メール）」から編集した
 *     タイトル・本文・件名・CTA文言・URL有無の上書き設定を data/notification-templates.json へ永続化
 *  2. フロントエンド22種（起動時取得）および NAS側直接送信7種（safety.js / invitations.js /
 *     passwords.js / push.js）の双方が同じテンプレート設定を参照できる単一データ源を提供
 *  3. app.use('/api/notification-templates', router) / app.use('/api', router) の
 *     どちらのマウント方式でも動作する耐障害ルーティング
 * =====================================================================
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';

const router = Router();

const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  try {
    fs.mkdirSync(dataDir, { recursive: true });
  } catch (err) {
    console.warn('[NotificationTemplates] Failed to create dataDir:', err.message);
  }
}

const templatesFilePath = path.join(dataDir, 'notification-templates.json');

const FORBIDDEN_KEYS = new Set(['__proto__', 'constructor', 'prototype']);
const VALID_KEY_PATTERN = /^[a-z0-9_]{2,64}$/;

function isValidTemplateKey(key) {
  return typeof key === 'string' && VALID_KEY_PATTERN.test(key) && !FORBIDDEN_KEYS.has(key);
}

function clampString(val, maxLen) {
  if (typeof val !== 'string') return undefined;
  return val.length > maxLen ? val.slice(0, maxLen) : val;
}

/**
 * 上書きデータの厳格なサニタイズ＆バリデーション
 */
export function sanitizeTemplateOverride(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const sanitized = {};

  if (raw.push && typeof raw.push === 'object' && !Array.isArray(raw.push)) {
    const pushObj = {};
    const titleTemplate = clampString(raw.push.titleTemplate, 300);
    const bodyTemplate = clampString(raw.push.bodyTemplate, 2000);
    if (titleTemplate !== undefined) pushObj.titleTemplate = titleTemplate;
    if (bodyTemplate !== undefined) pushObj.bodyTemplate = bodyTemplate;
    if (typeof raw.push.includeUrl === 'boolean') {
      pushObj.includeUrl = raw.push.includeUrl;
    }
    if (Object.keys(pushObj).length > 0) {
      sanitized.push = pushObj;
    }
  }

  if (raw.email && typeof raw.email === 'object' && !Array.isArray(raw.email)) {
    const emailObj = {};
    const subjectTemplate = clampString(raw.email.subjectTemplate, 300);
    const titleTemplate = clampString(raw.email.titleTemplate, 300);
    const headerTitleTemplate = clampString(raw.email.headerTitleTemplate, 300);
    const leadTemplate = clampString(raw.email.leadTemplate, 2000);
    const mainContentTemplate = clampString(raw.email.mainContentTemplate, 4000);
    const ctaLabel = clampString(raw.email.ctaLabel, 150);
    if (subjectTemplate !== undefined) emailObj.subjectTemplate = subjectTemplate;
    if (titleTemplate !== undefined) emailObj.titleTemplate = titleTemplate;
    if (headerTitleTemplate !== undefined) emailObj.headerTitleTemplate = headerTitleTemplate;
    if (leadTemplate !== undefined) emailObj.leadTemplate = leadTemplate;
    if (mainContentTemplate !== undefined) emailObj.mainContentTemplate = mainContentTemplate;
    if (ctaLabel !== undefined) emailObj.ctaLabel = ctaLabel;
    if (typeof raw.email.includeUrl === 'boolean') {
      emailObj.includeUrl = raw.email.includeUrl;
    }
    if (Object.keys(emailObj).length > 0) {
      sanitized.email = emailObj;
    }
  }

  if (!sanitized.push && !sanitized.email) {
    return null;
  }

  return sanitized;
}

/**
 * JSONファイルから安全にテンプレート上書きストアを読み込み
 */
export function loadNotificationTemplatesStore() {
  const emptyStore = {
    version: 1,
    updatedAt: null,
    updatedBy: null,
    templates: {}
  };

  if (!fs.existsSync(templatesFilePath)) {
    return emptyStore;
  }

  try {
    const rawText = fs.readFileSync(templatesFilePath, 'utf8');
    if (!rawText || !rawText.trim()) return emptyStore;
    const parsed = JSON.parse(rawText);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return emptyStore;
    }

    const rawTemplates =
      parsed.templates && typeof parsed.templates === 'object' && !Array.isArray(parsed.templates)
        ? parsed.templates
        : {};

    const cleanTemplates = {};
    for (const [k, v] of Object.entries(rawTemplates)) {
      if (!isValidTemplateKey(k)) continue;
      const cleanVal = sanitizeTemplateOverride(v);
      if (cleanVal) {
        cleanTemplates[k] = cleanVal;
      }
    }

    return {
      version: typeof parsed.version === 'number' ? parsed.version : 1,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
      updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
      templates: cleanTemplates
    };
  } catch (err) {
    console.warn('[NotificationTemplates] Safe parse fallback triggered:', err.message);
    return emptyStore;
  }
}

/**
 * JSONファイルへ安全に保存（アトミック書き込み＋フォールバック）
 */
function saveNotificationTemplatesStore(store) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const payload = JSON.stringify(store, null, 2);
    const tmpPath = `${templatesFilePath}.tmp.${Date.now()}`;
    try {
      fs.writeFileSync(tmpPath, payload, 'utf8');
      fs.renameSync(tmpPath, templatesFilePath);
    } catch (atomicErr) {
      try {
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      } catch (_) {}
      fs.writeFileSync(templatesFilePath, payload, 'utf8');
    }
    return true;
  } catch (err) {
    console.error('[NotificationTemplates] Failed to save store:', err);
    return false;
  }
}

// =====================================================================
// NAS サーバーモジュール向け共通ヘルパー (safety.js / invitations.js / passwords.js / push.js 用)
// =====================================================================

/**
 * 特定キーの上書き設定を取得（未設定時は null）
 */
export function getNotificationTemplateOverride(key) {
  if (!isValidTemplateKey(key)) return null;
  const store = loadNotificationTemplatesStore();
  return store.templates[key] || null;
}

/**
 * {{var}} 形式の変数を安全に展開
 */
export function interpolateNotificationTemplate(template, vars = {}) {
  if (typeof template !== 'string' || !template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, k) => {
    const val = vars[k];
    if (val === undefined || val === null) return '';
    return String(val);
  });
}

/**
 * サーバー側 Web Push 通知用：上書き設定をデフォルト値にマージして展開
 */
export function resolveServerPushTemplate(key, defaults, vars = {}) {
  const override = getNotificationTemplateOverride(key)?.push || {};
  const titleTemplate = override.titleTemplate !== undefined ? override.titleTemplate : (defaults.titleTemplate || '');
  const bodyTemplate = override.bodyTemplate !== undefined ? override.bodyTemplate : (defaults.bodyTemplate || '');
  const includeUrl = override.includeUrl !== undefined ? Boolean(override.includeUrl) : (defaults.includeUrl !== false);

  return {
    title: interpolateNotificationTemplate(titleTemplate, vars),
    body: interpolateNotificationTemplate(bodyTemplate, vars),
    includeUrl,
    url: includeUrl ? (defaults.url || '') : ''
  };
}

/**
 * サーバー側メール通知用：上書き設定をデフォルト値にマージして展開
 */
export function resolveServerEmailTemplate(key, defaults, vars = {}) {
  const override = getNotificationTemplateOverride(key)?.email || {};
  const subjectTemplate = override.subjectTemplate !== undefined ? override.subjectTemplate : (defaults.subjectTemplate || '');
  const headerTitleTemplate = override.headerTitleTemplate !== undefined ? override.headerTitleTemplate : (defaults.headerTitleTemplate || '');
  const leadTemplate = override.leadTemplate !== undefined ? override.leadTemplate : (defaults.leadTemplate || '');
  const mainContentTemplate = override.mainContentTemplate !== undefined ? override.mainContentTemplate : (defaults.mainContentTemplate || '');
  const ctaLabel = override.ctaLabel !== undefined ? override.ctaLabel : (defaults.ctaLabel || '');
  const includeUrl = override.includeUrl !== undefined ? Boolean(override.includeUrl) : (defaults.includeUrl !== false);

  return {
    subject: interpolateNotificationTemplate(subjectTemplate, vars),
    headerTitle: interpolateNotificationTemplate(headerTitleTemplate, vars),
    lead: interpolateNotificationTemplate(leadTemplate, vars),
    mainContent: interpolateNotificationTemplate(mainContentTemplate, vars),
    ctaLabel: interpolateNotificationTemplate(ctaLabel, vars),
    includeUrl,
    url: includeUrl ? (defaults.url || '') : ''
  };
}

// =====================================================================
// 権限判定ヘルパー（管理者のみ変更可）
// =====================================================================

function isAdminRequest(req) {
  if (req.authUser) {
    return Boolean(req.authUser.isAdmin || req.authUser.role === 'admin');
  }
  return false;
}

function getActorName(req) {
  if (req.authUser && req.authUser.name) return String(req.authUser.name);
  if (req.body && typeof req.body.updatedBy === 'string' && req.body.updatedBy.trim()) {
    return req.body.updatedBy.trim().slice(0, 80);
  }
  return '管理者';
}

// =====================================================================
// API エンドポイント（複数マウント方式に完全対応）
// =====================================================================

// 1. 全テンプレート上書き設定を取得（ログイン済みの全社員が参照可能）
router.get(
  ['/', '/notification-templates', '/notification-templates/'],
  (req, res) => {
    try {
      const store = loadNotificationTemplatesStore();
      res.json({
        success: true,
        ...store
      });
    } catch (err) {
      console.error('[NotificationTemplates] GET error:', err);
      res.status(500).json({ error: '通知テンプレート設定の取得に失敗しました。' });
    }
  }
);

// 2. 一括更新（管理者のみ）
router.put(
  ['/', '/notification-templates', '/notification-templates/'],
  (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: '通知テンプレートの編集には管理者権限が必要です。' });
      }

      const incoming = req.body?.templates;
      if (!incoming || typeof incoming !== 'object' || Array.isArray(incoming)) {
        return res.status(400).json({ error: 'templates オブジェクトが必要です。' });
      }

      const cleanTemplates = {};
      for (const [k, v] of Object.entries(incoming)) {
        if (!isValidTemplateKey(k)) continue;
        const cleanVal = sanitizeTemplateOverride(v);
        if (cleanVal) {
          cleanTemplates[k] = cleanVal;
        }
      }

      const nextStore = {
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: getActorName(req),
        templates: cleanTemplates
      };

      if (!saveNotificationTemplatesStore(nextStore)) {
        return res.status(500).json({ error: '通知テンプレートの保存に失敗しました。' });
      }

      res.json({
        success: true,
        message: '通知テンプレート設定を保存しました。',
        ...nextStore
      });
    } catch (err) {
      console.error('[NotificationTemplates] PUT bulk error:', err);
      res.status(500).json({ error: err.message || '保存処理中にエラーが発生しました。' });
    }
  }
);

// 3. 全テンプレートを初期値へリセット（管理者のみ）
router.post(
  ['/reset', '/notification-templates/reset', '/notification-templates/reset/'],
  (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: '通知テンプレートのリセットには管理者権限が必要です。' });
      }

      const nextStore = {
        version: 1,
        updatedAt: new Date().toISOString(),
        updatedBy: getActorName(req),
        templates: {}
      };

      if (!saveNotificationTemplatesStore(nextStore)) {
        return res.status(500).json({ error: 'リセット結果の保存に失敗しました。' });
      }

      res.json({
        success: true,
        message: 'すべての通知テンプレートを初期値に戻しました。',
        ...nextStore
      });
    } catch (err) {
      console.error('[NotificationTemplates] RESET error:', err);
      res.status(500).json({ error: err.message || 'リセット中にエラーが発生しました。' });
    }
  }
);

// 4. 単一テンプレートの上書き保存（管理者のみ）
router.put(
  ['/:key', '/notification-templates/:key'],
  (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: '通知テンプレートの編集には管理者権限が必要です。' });
      }

      const key = String(req.params.key || '').trim();
      if (!isValidTemplateKey(key)) {
        return res.status(400).json({ error: '無効な通知テンプレートキーです。' });
      }

      const candidate = req.body?.override || req.body;
      const cleanVal = sanitizeTemplateOverride(candidate);
      if (!cleanVal) {
        return res.status(400).json({ error: '有効なテンプレート編集内容が指定されていません。' });
      }

      const store = loadNotificationTemplatesStore();
      store.templates[key] = cleanVal;
      store.updatedAt = new Date().toISOString();
      store.updatedBy = getActorName(req);

      if (!saveNotificationTemplatesStore(store)) {
        return res.status(500).json({ error: '通知テンプレートの保存に失敗しました。' });
      }

      res.json({
        success: true,
        key,
        override: cleanVal,
        message: '通知テンプレートを保存しました。',
        ...store
      });
    } catch (err) {
      console.error('[NotificationTemplates] PUT key error:', err);
      res.status(500).json({ error: err.message || '保存処理中にエラーが発生しました。' });
    }
  }
);

// 5. 単一テンプレートの上書きを削除して初期値へ戻す（管理者のみ）
router.delete(
  ['/:key', '/notification-templates/:key'],
  (req, res) => {
    try {
      if (!isAdminRequest(req)) {
        return res.status(403).json({ error: '通知テンプレートのリセットには管理者権限が必要です。' });
      }

      const key = String(req.params.key || '').trim();
      if (!isValidTemplateKey(key)) {
        return res.status(400).json({ error: '無効な通知テンプレートキーです。' });
      }

      const store = loadNotificationTemplatesStore();
      delete store.templates[key];
      store.updatedAt = new Date().toISOString();
      store.updatedBy = getActorName(req);

      if (!saveNotificationTemplatesStore(store)) {
        return res.status(500).json({ error: 'リセット結果の保存に失敗しました。' });
      }

      res.json({
        success: true,
        key,
        message: '選択した通知テンプレートを初期値に戻しました。',
        ...store
      });
    } catch (err) {
      console.error('[NotificationTemplates] DELETE key error:', err);
      res.status(500).json({ error: err.message || '削除処理中にエラーが発生しました。' });
    }
  }
);

export default router;
