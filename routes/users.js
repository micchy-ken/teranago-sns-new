/**
 * routes/users.js (本番環境・MS SQL Server 連携 メンバー管理モジュール)
 * 寺岡オートドアSNS ユーザー管理・所属・表示順・アバター・設定モジュール
 * 最終更新: 2026年10月1日 (パラメータ競合完全防止・ガード実装版)
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sql from 'mssql';
import { getPool } from '../db.js';
import { encryptText, maskEmail } from './safety.js';
import { uploadDir, dataDir } from '../config.js';

const router = Router();
const userPrefsFile = path.join(dataDir, 'user_preferences.json');

// 予約語（ユーザーIDと誤認させてはならないエンドポイント名）
const RESERVED_USER_IDS = new Set([
  'invite',
  'invitations',
  'reorder',
  'preferences',
  'settings',
  'notification-settings',
  'reset-password',
  'force-change-password',
  'upload-avatar',
  'personal-email'
]);

function isReservedUserId(id) {
  if (!id) return false;
  return RESERVED_USER_IDS.has(String(id).toLowerCase());
}

// =============================================================
// ローカル preferences バックアップ永続化
// =============================================================
function loadAllUserPrefs() {
  try {
    if (fs.existsSync(userPrefsFile)) {
      const content = fs.readFileSync(userPrefsFile, 'utf8');
      return JSON.parse(content) || {};
    }
  } catch (e) {
    console.warn('[Users] Failed to read user_preferences.json:', e.message);
  }
  return {};
}

function saveUserPrefs(userId, prefs) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    const all = loadAllUserPrefs();
    all[String(userId)] = {
      ...(all[String(userId)] || {}),
      ...prefs,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(userPrefsFile, JSON.stringify(all, null, 2), 'utf8');
  } catch (e) {
    console.error('[Users] Failed to write user_preferences.json:', e.message);
  }
}

// dbo.Users の実在カラム一覧のキャッシュと動的検出
let userTableColumnsCache = null;

async function getUserTableColumns(pool) {
  if (userTableColumnsCache || !pool) return userTableColumnsCache;
  try {
    const res = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
    if (res.recordset && res.recordset.length > 0) {
      userTableColumnsCache = new Set(res.recordset.map(r => r.COLUMN_NAME.toLowerCase()));
      return userTableColumnsCache;
    }
  } catch (err) {
    console.warn('[Users] Failed to query Users columns:', err.message);
  }
  return null;
}

// preferences カラム存在チェックフラグ
let hasPreferencesCol = false;
let isPreferencesColumnChecked = false;

async function checkPreferencesColumn(pool) {
  if (isPreferencesColumnChecked || !pool) return hasPreferencesCol;
  try {
    const res = await pool.request().query("SELECT COL_LENGTH('dbo.Users', 'preferences') AS colLen");
    const len = res.recordset && res.recordset[0] && res.recordset[0].colLen;
    if (len !== null && len !== undefined) {
      hasPreferencesCol = true;
    } else {
      try {
        await pool.request().query("ALTER TABLE dbo.Users ADD preferences NVARCHAR(MAX) NULL;");
        hasPreferencesCol = true;
      } catch (alterErr) {
        console.warn('[Users] Cannot add preferences column (using JSON storage fallback):', alterErr.message);
        hasPreferencesCol = false;
      }
    }
    isPreferencesColumnChecked = true;
  } catch (err) {
    console.warn('[Users] Column check failed:', err.message);
    hasPreferencesCol = false;
  }
  return hasPreferencesCol;
}

// =============================================================
// 1. ユーザー表示順の一括更新 API (PUT & POST /users/reorder)
// ※ /users/:id より前に必ず定義
// =============================================================
const reorderPaths = [
  '/users/reorder',
  '/users/reorder/',
  '/api/users/reorder',
  '/api/users/reorder/'
];

async function reorderUsersHandler(req, res) {
  try {
    const body = req.body || {};
    const orders = Array.isArray(body) 
      ? body 
      : (Array.isArray(body.userOrders) ? body.userOrders : (Array.isArray(body.orders) ? body.orders : []));

    if (!orders || orders.length === 0) {
      return res.status(400).json({ error: '並び順データ (userOrders) が配列で指定されていません。' });
    }

    const pool = await getPool();
    const cols = await getUserTableColumns(pool);
    const hasSortOrderCol = cols ? cols.has('sortorder') : false;

    if (hasSortOrderCol) {
      const transaction = new sql.Transaction(pool);
      await transaction.begin();
      try {
        for (const item of orders) {
          if (!item.id) continue;
          const sOrder = (item.sortOrder !== undefined && item.sortOrder !== null && item.sortOrder !== '') 
            ? parseInt(item.sortOrder, 10) 
            : null;
          await transaction.request()
            .input('id', sql.VarChar, String(item.id))
            .input('sortOrder', sql.Int, sOrder)
            .query('UPDATE dbo.Users SET sortOrder = @sortOrder WHERE id = @id');
        }
        await transaction.commit();
      } catch (txErr) {
        await transaction.rollback();
        throw txErr;
      }
    } else {
      for (const item of orders) {
        if (!item.id) continue;
        saveUserPrefs(String(item.id), { sortOrder: item.sortOrder });
      }
    }

    res.json({ success: true, count: orders.length, message: 'ユーザーの並び順を更新しました。' });
  } catch (err) {
    console.error('[Users] Reorder users error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.put(reorderPaths, reorderUsersHandler);
router.post(reorderPaths, reorderUsersHandler);

// =============================================================
// 2. ユーザー一覧取得 (GET /users & /api/users)
// =============================================================
router.get(['/users', '/users/', '/api/users', '/api/users/'], async (req, res) => {
  try {
    const pool = await getPool();
    const cols = await getUserTableColumns(pool);
    const hasCol = cols ? cols.has('preferences') : await checkPreferencesColumn(pool);
    const hasRolesCol = cols ? cols.has('roles') : false;
    const hasSortOrderCol = cols ? cols.has('sortorder') : false;
    const hasMustChangeCol = cols ? cols.has('mustchangepassword') : false;
    const allFilePrefs = loadAllUserPrefs();

    const orderClause = hasSortOrderCol ? 'ORDER BY ISNULL(sortOrder, 999999) ASC, name ASC' : 'ORDER BY name ASC';
    const result = await pool.request().query(`SELECT * FROM dbo.Users ${orderClause}`);
    const users = (result.recordset || []).map(row => {
      const uId = String(row.id);
      let prefs = {};

      if (hasCol && row.preferences) {
        try {
          prefs = typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences;
        } catch (_) {}
      }

      if (allFilePrefs[uId]) {
        prefs = {
          ...prefs,
          ...allFilePrefs[uId]
        };
      }

      let resolvedRoles = [row.role || 'user'];
      if (hasRolesCol && row.roles) {
        try {
          resolvedRoles = typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles;
        } catch (_) {}
      } else if (prefs && Array.isArray(prefs.roles)) {
        resolvedRoles = prefs.roles;
      }

      const mustChangePassword = hasMustChangeCol 
        ? Boolean(row.mustChangePassword) 
        : (prefs.mustChangePassword !== undefined ? Boolean(prefs.mustChangePassword) : false);

      return {
        ...row,
        sortOrder: row.sortOrder !== undefined && row.sortOrder !== null ? Number(row.sortOrder) : undefined,
        roles: resolvedRoles,
        preferences: prefs,
        mustChangePassword
      };
    });
    res.json(users);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// =============================================================
// 3. 単一ユーザー取得 (GET /users/:id & /api/users/:id)
// =============================================================
router.get(['/users/:id', '/api/users/:id'], async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    if (isReservedUserId(userId)) {
      return next();
    }

    const pool = await getPool();
    const cols = await getUserTableColumns(pool);
    const hasCol = cols ? cols.has('preferences') : await checkPreferencesColumn(pool);
    const hasRolesCol = cols ? cols.has('roles') : false;
    const hasMustChangeCol = cols ? cols.has('mustchangepassword') : false;
    const allFilePrefs = loadAllUserPrefs();

    const result = await pool.request()
      .input('id', sql.VarChar, userId)
      .query('SELECT * FROM dbo.Users WHERE id = @id');
    
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }
    const row = result.recordset[0];
    let prefs = {};
    if (hasCol && row.preferences) {
      try {
        prefs = typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences;
      } catch (_) {}
    }

    if (allFilePrefs[userId]) {
      prefs = {
        ...prefs,
        ...allFilePrefs[userId]
      };
    }

    let resolvedRoles = [row.role || 'user'];
    if (hasRolesCol && row.roles) {
      try {
        resolvedRoles = typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles;
      } catch (_) {}
    } else if (prefs && Array.isArray(prefs.roles)) {
      resolvedRoles = prefs.roles;
    }

    const mustChangePassword = hasMustChangeCol 
      ? Boolean(row.mustChangePassword) 
      : (prefs.mustChangePassword !== undefined ? Boolean(prefs.mustChangePassword) : false);

    res.json({
      ...row,
      sortOrder: row.sortOrder !== undefined && row.sortOrder !== null ? Number(row.sortOrder) : undefined,
      roles: resolvedRoles,
      preferences: prefs,
      mustChangePassword
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 4. ユーザー保存・更新用ヘルパー関数 (POST / PUT 共通)
// =============================================================
async function saveOrUpdateUser(req, res, targetUserId = null, next = null) {
  try {
    const rawId = targetUserId || req.body?.id;
    if (rawId && isReservedUserId(rawId)) {
      if (typeof next === 'function') return next();
      return res.status(400).json({ error: '不正なユーザーIDです' });
    }

    const u = req.body || {};
    const pool = await getPool();
    const cols = await getUserTableColumns(pool);
    const hasRolesCol = cols ? cols.has('roles') : false;
    const hasCol = cols ? cols.has('preferences') : await checkPreferencesColumn(pool);
    const hasSortOrderCol = cols ? cols.has('sortorder') : false;
    const hasPersonalEmailEncryptedCol = cols ? cols.has('personalemailencrypted') : false;
    const hasPersonalEmailMaskedCol = cols ? cols.has('personalemailmasked') : false;
    const hasMustChangeCol = cols ? cols.has('mustchangepassword') : false;
    const userId = rawId || `u-${Date.now()}`;
    
    const rolesArr = Array.isArray(u.roles) 
      ? u.roles 
      : (typeof u.roles === 'string' ? [u.roles] : [u.role || 'user']);
    const rolesStr = JSON.stringify(rolesArr);

    const parsedSortOrder = (u.sortOrder !== undefined && u.sortOrder !== null && u.sortOrder !== '')
      ? parseInt(u.sortOrder, 10)
      : null;

    let incomingPrefs = null;
    if (u.preferences !== undefined) {
      incomingPrefs = typeof u.preferences === 'string' ? JSON.parse(u.preferences || '{}') : (u.preferences || {});
    } else {
      incomingPrefs = {};
    }

    if (!hasRolesCol) {
      incomingPrefs.roles = rolesArr;
    }
    if (!hasSortOrderCol && parsedSortOrder !== null) {
      incomingPrefs.sortOrder = parsedSortOrder;
    }
    if (u.mustChangePassword !== undefined) {
      incomingPrefs.mustChangePassword = Boolean(u.mustChangePassword);
    }

    saveUserPrefs(userId, incomingPrefs);

    const allFilePrefs = loadAllUserPrefs();
    const mergedPrefs = {
      ...(allFilePrefs[userId] || {}),
      ...(incomingPrefs || {})
    };
    if (!hasRolesCol) {
      mergedPrefs.roles = rolesArr;
    }
    const prefStr = JSON.stringify(mergedPrefs);

    const reqBuilder = pool.request()
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
      .input('supervisorId', sql.VarChar, u.supervisorId || null);

    if (hasSortOrderCol) reqBuilder.input('sortOrder', sql.Int, parsedSortOrder);
    if (hasRolesCol) reqBuilder.input('roles', sql.NVarChar, rolesStr);
    if (hasCol) reqBuilder.input('preferences', sql.NVarChar, prefStr);
    if (hasPersonalEmailEncryptedCol && u.personalEmailEncrypted !== undefined) {
      reqBuilder.input('personalEmailEncrypted', sql.NVarChar, u.personalEmailEncrypted || null);
    }
    if (hasPersonalEmailMaskedCol && u.personalEmailMasked !== undefined) {
      reqBuilder.input('personalEmailMasked', sql.NVarChar, u.personalEmailMasked || null);
    }
    if (hasMustChangeCol) {
      reqBuilder.input('mustChangePassword', sql.Bit, u.mustChangePassword ? 1 : 0);
    }

    const updateSets = [
      'loginId = @loginId',
      'password = @password',
      'name = @name',
      'kanaName = @kanaName',
      'department = @department',
      'office = @office',
      'division = @division',
      'position = @position',
      'role = @role',
      'isAdmin = @isAdmin',
      'avatarUrl = @avatarUrl',
      'email = @email',
      'mobileEmail = @mobileEmail',
      'phone = @phone',
      'phoneOutside = @phoneOutside',
      'phoneExtension = @phoneExtension',
      'mobilePhone = @mobilePhone',
      'icalUrl = @icalUrl',
      'supervisorId = @supervisorId'
    ];
    if (hasSortOrderCol) updateSets.push('sortOrder = @sortOrder');
    if (hasRolesCol) updateSets.push('roles = @roles');
    if (hasCol) updateSets.push('preferences = @preferences');
    if (hasPersonalEmailEncryptedCol && u.personalEmailEncrypted !== undefined) updateSets.push('personalEmailEncrypted = @personalEmailEncrypted');
    if (hasPersonalEmailMaskedCol && u.personalEmailMasked !== undefined) updateSets.push('personalEmailMasked = @personalEmailMasked');
    if (hasMustChangeCol) updateSets.push('mustChangePassword = @mustChangePassword');

    const insertCols = [
      'id', 'loginId', 'password', 'name', 'kanaName', 'department', 'office', 'division', 'position',
      'role', 'isAdmin', 'avatarUrl', 'email', 'mobileEmail', 'phone', 'phoneOutside', 'phoneExtension', 'mobilePhone', 'icalUrl', 'supervisorId'
    ];
    const insertVals = [
      '@id', '@loginId', '@password', '@name', '@kanaName', '@department', '@office', '@division', '@position',
      '@role', '@isAdmin', '@avatarUrl', '@email', '@mobileEmail', '@phone', '@phoneOutside', '@phoneExtension', '@mobilePhone', '@icalUrl', '@supervisorId'
    ];
    if (hasSortOrderCol) { insertCols.push('sortOrder'); insertVals.push('@sortOrder'); }
    if (hasRolesCol) { insertCols.push('roles'); insertVals.push('@roles'); }
    if (hasCol) { insertCols.push('preferences'); insertVals.push('@preferences'); }
    if (hasPersonalEmailEncryptedCol && u.personalEmailEncrypted !== undefined) { insertCols.push('personalEmailEncrypted'); insertVals.push('@personalEmailEncrypted'); }
    if (hasPersonalEmailMaskedCol && u.personalEmailMasked !== undefined) { insertCols.push('personalEmailMasked'); insertVals.push('@personalEmailMasked'); }
    if (hasMustChangeCol) { insertCols.push('mustChangePassword'); insertVals.push('@mustChangePassword'); }

    const queryStr = `
      IF EXISTS (SELECT 1 FROM dbo.Users WHERE id = @id)
        UPDATE dbo.Users 
        SET ${updateSets.join(', ')}
        WHERE id = @id;
      ELSE
        INSERT INTO dbo.Users (${insertCols.join(', ')})
        VALUES (${insertVals.join(', ')});
    `;

    await reqBuilder.query(queryStr);

    res.json({ id: userId, sortOrder: parsedSortOrder, preferences: mergedPrefs, roles: rolesArr, success: true, message: 'ユーザー保存成功' });
  } catch (err) { 
    console.error('[Users] saveOrUpdateUser error:', err);
    res.status(500).json({ error: err.message }); 
  }
}

router.post(['/users', '/users/', '/api/users', '/api/users/'], (req, res) => saveOrUpdateUser(req, res));
router.put(['/users/:id', '/api/users/:id'], (req, res, next) => saveOrUpdateUser(req, res, req.params.id, next));
router.post(['/users/:id', '/api/users/:id'], (req, res, next) => saveOrUpdateUser(req, res, req.params.id, next));

// =============================================================
// 5. 個人設定・通知権限の更新 (PUT & POST)
// =============================================================
const preferencesPaths = [
  '/users/:id/preferences',
  '/users/:id/preferences/',
  '/users/:id/settings',
  '/users/:id/notification-settings',
  '/api/users/:id/preferences',
  '/api/users/:id/preferences/',
  '/api/users/:id/settings',
  '/api/users/:id/notification-settings'
];

async function updatePreferencesHandler(req, res) {
  try {
    const userId = String(req.params.id);
    const body = req.body || {};
    const pool = await getPool();
    const cols = await getUserTableColumns(pool);
    const hasCol = cols ? cols.has('preferences') : await checkPreferencesColumn(pool);

    const incomingPrefs = (body.preferences && typeof body.preferences === 'object') ? body.preferences : body;
    const allFilePrefs = loadAllUserPrefs();
    let currentPrefs = allFilePrefs[userId] || {};

    if (hasCol) {
      try {
        const curRes = await pool.request()
          .input('checkId', sql.VarChar, userId)
          .query('SELECT preferences FROM dbo.Users WHERE id = @checkId');
        if (curRes.recordset && curRes.recordset.length > 0 && curRes.recordset[0].preferences) {
          const dbPrefs = typeof curRes.recordset[0].preferences === 'string'
            ? JSON.parse(curRes.recordset[0].preferences)
            : curRes.recordset[0].preferences;
          currentPrefs = { ...dbPrefs, ...currentPrefs };
        }
      } catch (_) {}
    }

    const mergedPrefs = {
      ...currentPrefs,
      ...incomingPrefs,
      emailNotifications: {
        ...(currentPrefs.emailNotifications || {}),
        ...(incomingPrefs.emailNotifications || {})
      }
    };

    saveUserPrefs(userId, mergedPrefs);

    if (hasCol) {
      try {
        const prefStr = JSON.stringify(mergedPrefs);
        await pool.request()
          .input('id', sql.VarChar, userId)
          .input('preferences', sql.NVarChar, prefStr)
          .query('UPDATE dbo.Users SET preferences = @preferences WHERE id = @id');
      } catch (sqlErr) {
        console.warn('[Users] Failed to update preferences in SQL Server, saved in JSON:', sqlErr.message);
      }
    }

    res.json({
      success: true,
      preferences: mergedPrefs,
      message: '個人設定・通知設定・マイページ並び順を保存しました。'
    });
  } catch (err) { 
    console.error('[Users] Update preferences error:', err);
    res.status(500).json({ error: err.message }); 
  }
}

router.put(preferencesPaths, updatePreferencesHandler);
router.post(preferencesPaths, updatePreferencesHandler);

// =============================================================
// 6. ユーザー削除 (DELETE /users/:id & /api/users/:id)
// =============================================================
router.delete(['/users/:id', '/api/users/:id'], async (req, res, next) => {
  try {
    const userId = String(req.params.id);
    if (isReservedUserId(userId)) return next();

    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, userId).query('DELETE FROM dbo.Users WHERE id = @id');
    res.json({ success: true, message: 'ユーザー削除完了' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// =============================================================
// 7. 個人メールアドレス AES-256-GCM 暗号化保存
// =============================================================
router.post(['/users/:id/personal-email', '/api/users/:id/personal-email'], async (req, res) => {
  try {
    const userId = req.params.id;
    const { personalEmail } = req.body || {};
    const emailTrimmed = personalEmail ? String(personalEmail).trim() : '';

    if (emailTrimmed && (!emailTrimmed.includes('@') || !emailTrimmed.includes('.'))) {
      return res.status(400).json({ error: '有効なメールアドレス形式で入力してください。' });
    }

    const encrypted = emailTrimmed ? encryptText(emailTrimmed) : null;
    const masked = emailTrimmed ? maskEmail(emailTrimmed) : null;

    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('id', sql.VarChar, userId)
        .input('personalEmailEncrypted', sql.NVarChar, encrypted)
        .input('personalEmailMasked', sql.NVarChar, masked)
        .query('UPDATE dbo.Users SET personalEmailEncrypted = @personalEmailEncrypted, personalEmailMasked = @personalEmailMasked WHERE id = @id');
    }

    res.json({ success: true, personalEmailMasked: masked });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// =============================================================
// 8. アバター画像アップロード
// =============================================================
const avatarStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    cb(null, 'avatar-' + uniqueSuffix + ext);
  }
});

const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (!file.mimetype.startsWith('image/')) {
      return cb(new Error('画像ファイルのみアップロード可能です。'), false);
    }
    cb(null, true);
  }
});

router.post(['/upload-avatar', '/users/upload-avatar', '/api/upload-avatar', '/api/users/upload-avatar'], uploadAvatar.single('avatar'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルがアップロードされていません。' });
    }
    const avatarUrl = `/uploads/${req.file.filename}`;
    res.json({ avatarUrl });
  } catch (error) {
    console.error('アバターアップロードエラー:', error);
    res.status(500).json({ error: 'サーバーエラーが発生しました。' });
  }
});

export default router;
