/**
 * routes/users.js (本番環境・MS SQL Server 連携 メンバー管理 & 認証モジュール)
 * 寺岡オートドアSNS ユーザー管理・所属・表示順・アバター・設定・サーバーサイド認証
 * 最終更新: 2026年10月30日 (パスワードソルト付きscryptハッシュ化・POST /auth/login サーバー認証・平文排除・メールプレフィックス柔軟照合版)
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import crypto from 'crypto';
import sql from 'mssql';
import { getPool } from '../db.js';
import { encryptText, maskEmail } from './safety.js';
import { uploadDir, dataDir } from '../config.js';

const router = Router();
const userPrefsFile = path.join(dataDir, 'user_preferences.json');
const usersFile = path.join(dataDir, 'users.json');

// =============================================================
// セキュア・パスワードハッシュ化 (scrypt) & 認証ヘルパー
// =============================================================
function hashPassword(password) {
  if (!password) return '';
  if (typeof password === 'string' && password.startsWith('scrypt:16384:')) return password;
  const salt = crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return `scrypt:16384:${salt}:${derivedKey.toString('hex')}`;
}

function verifyPassword(passwordInput, storedHashOrPlain) {
  if (!storedHashOrPlain || !passwordInput) return { isValid: false, needsRehash: false };
  if (typeof storedHashOrPlain === 'string' && storedHashOrPlain.startsWith('scrypt:16384:')) {
    const parts = storedHashOrPlain.split(':');
    if (parts.length === 4) {
      const salt = parts[2];
      const originalHashHex = parts[3];
      const testHash = crypto.scryptSync(passwordInput, salt, 64, { N: 16384, r: 8, p: 1 });
      try {
        const isValid = crypto.timingSafeEqual(Buffer.from(originalHashHex, 'hex'), testHash);
        return { isValid, needsRehash: false };
      } catch (_) {
        return { isValid: false, needsRehash: false };
      }
    }
  }
  const isPlainMatch = (passwordInput === storedHashOrPlain);
  return { isValid: isPlainMatch, needsRehash: isPlainMatch };
}

function sanitizeUserForResponse(user) {
  if (!user) return user;
  const copy = { ...user };
  const rawPw = user.password || '';
  const isTestPw = !rawPw || rawPw === 'test' || verifyPassword('test', rawPw).isValid;
  const isPasswordDefault = isTestPw || user.mustChangePassword === true || user.isPasswordDefault === true;

  delete copy.password;
  delete copy.passwordHash;
  return {
    ...copy,
    passwordMasked: '••••••••',
    isPasswordDefault
  };
}

function loadUsers() {
  try {
    if (fs.existsSync(usersFile)) {
      return JSON.parse(fs.readFileSync(usersFile, 'utf8')) || [];
    }
  } catch (e) {
    console.warn('[Users] Failed to read users.json:', e.message);
  }
  return [];
}

function saveUsers(users) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(usersFile, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('[Users] Failed to write users.json:', e.message);
  }
}

// 予約語（ユーザーIDと誤認させてはならないエンドポイント名）
const RESERVED_USER_IDS = new Set([
  'auth',
  'login',
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
// 0. サーバーサイドログイン認証 API (POST /auth/login & /login)
// ※ /users/:id より前に必ず定義
// =============================================================
const loginPaths = [
  '/auth/login',
  '/auth/login/',
  '/api/auth/login',
  '/api/auth/login/',
  '/login',
  '/login/',
  '/api/login',
  '/api/login/'
];

router.post(loginPaths, async (req, res) => {
  try {
    const { loginId, password } = req.body || {};
    if (!loginId || !password) {
      return res.status(400).json({ error: 'ユーザーIDとパスワードを入力してください。' });
    }

    const trimmedInput = String(loginId).trim().toLowerCase();
    const pool = await getPool();

    let allUsers = [];
    if (pool) {
      const cols = await getUserTableColumns(pool);
      const hasCol = cols ? cols.has('preferences') : await checkPreferencesColumn(pool);
      const hasRolesCol = cols ? cols.has('roles') : false;
      const hasSortOrderCol = cols ? cols.has('sortorder') : false;
      const hasMustChangeCol = cols ? cols.has('mustchangepassword') : false;
      const allFilePrefs = loadAllUserPrefs();

      const result = await pool.request().query('SELECT * FROM dbo.Users');
      allUsers = (result.recordset || []).map(row => {
        const uId = String(row.id);
        let prefs = {};
        if (hasCol && row.preferences) {
          try { prefs = typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences; } catch (_) {}
        }
        if (allFilePrefs[uId]) {
          prefs = { ...prefs, ...allFilePrefs[uId] };
        }
        let resolvedRoles = [row.role || 'user'];
        if (hasRolesCol && row.roles) {
          try { resolvedRoles = typeof row.roles === 'string' ? JSON.parse(row.roles) : row.roles; } catch (_) {}
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
    } else {
      allUsers = loadUsers();
    }

    // 柔軟なログイン照合:
    // 1. loginId (完全一致)
    // 2. email (完全一致、または @前のプレフィックス: 例 koga@... -> koga)
    // 3. mobileEmail (完全一致、または @前のプレフィックス)
    // 4. id (主キー一致)
    // 5. name / kanaName
    let matchedUser = allUsers.find(u => {
      const uLoginId = (u.loginId || '').trim().toLowerCase();
      const uEmail = (u.email || '').trim().toLowerCase();
      const uEmailPrefix = uEmail.includes('@') ? uEmail.split('@')[0] : '';
      const uMobile = (u.mobileEmail || '').trim().toLowerCase();
      const uMobilePrefix = uMobile.includes('@') ? uMobile.split('@')[0] : '';
      const uId = String(u.id || '').trim().toLowerCase();
      const uName = String(u.name || '').trim().toLowerCase();

      return (
        (uLoginId && uLoginId === trimmedInput) ||
        (uEmail && uEmail === trimmedInput) ||
        (uEmailPrefix && uEmailPrefix === trimmedInput) ||
        (uMobile && uMobile === trimmedInput) ||
        (uMobilePrefix && uMobilePrefix === trimmedInput) ||
        (uId && uId === trimmedInput) ||
        (uName && uName === trimmedInput)
      );
    });

    if (!matchedUser) {
      return res.status(401).json({ error: 'ユーザーIDまたはパスワードが正しくありません。' });
    }

    const authResult = verifyPassword(String(password).trim(), matchedUser.password);
    if (!authResult.isValid) {
      return res.status(401).json({ error: 'ユーザーIDまたはパスワードが正しくありません。' });
    }

    // 平文パスワードで一致した場合、またはログインIDが仮生成(user_xxxx)でメールプレフィックスで入った場合の自己修復
    const updates = [];
    if (authResult.needsRehash) {
      matchedUser.password = hashPassword(String(password).trim());
      updates.push('password');
    }
    // ログインIDが空欄や仮ID(user_xxxx)で、メールのユーザー名(例: koga)でログインした場合、正式にloginIdを反映
    if ((!matchedUser.loginId || matchedUser.loginId.startsWith('user_')) && trimmedInput && !trimmedInput.startsWith('user_')) {
      matchedUser.loginId = trimmedInput;
      updates.push('loginId');
    }

    if (updates.length > 0) {
      try {
        if (pool) {
          const updateReq = pool.request().input('id', sql.VarChar, String(matchedUser.id));
          const setClauses = [];
          if (updates.includes('password')) {
            updateReq.input('password', sql.VarChar, matchedUser.password);
            setClauses.push('password = @password');
          }
          if (updates.includes('loginId')) {
            updateReq.input('loginId', sql.VarChar, matchedUser.loginId);
            setClauses.push('loginId = @loginId');
          }
          await updateReq.query(`UPDATE dbo.Users SET ${setClauses.join(', ')} WHERE id = @id`);
        }
        const fileUsers = loadUsers();
        const fIdx = fileUsers.findIndex(u => String(u.id) === String(matchedUser.id));
        if (fIdx !== -1) {
          if (updates.includes('password')) fileUsers[fIdx].password = matchedUser.password;
          if (updates.includes('loginId')) fileUsers[fIdx].loginId = matchedUser.loginId;
          saveUsers(fileUsers);
        }
      } catch (patchErr) {
        console.warn('[Auth] Auto-update warning:', patchErr.message);
      }
    }

    res.json({
      success: true,
      message: 'ログインに成功しました。',
      user: sanitizeUserForResponse(matchedUser)
    });
  } catch (err) {
    console.error('[Auth] Login error:', err);
    res.status(500).json({ error: err.message });
  }
});

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
// 2. ユーザー一覧取得 (GET /users & /api/users - 平文パスワード非開示)
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

      const userObj = {
        ...row,
        sortOrder: row.sortOrder !== undefined && row.sortOrder !== null ? Number(row.sortOrder) : undefined,
        roles: resolvedRoles,
        preferences: prefs,
        mustChangePassword
      };

      return sanitizeUserForResponse(userObj);
    });
    res.json(users);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// =============================================================
// 3. 単一ユーザー取得 (GET /users/:id & /api/users/:id - 平文パスワード非開示)
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

    const userObj = {
      ...row,
      sortOrder: row.sortOrder !== undefined && row.sortOrder !== null ? Number(row.sortOrder) : undefined,
      roles: resolvedRoles,
      preferences: prefs,
      mustChangePassword
    };

    res.json(sanitizeUserForResponse(userObj));
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
    
    // 既存パスワードの保持チェック（空欄またはマスク時は既存維持）
    let existingPassword = null;
    if (targetUserId) {
      if (pool) {
        try {
          const exRes = await pool.request().input('exId', sql.VarChar, userId).query('SELECT password FROM dbo.Users WHERE id = @exId');
          if (exRes.recordset && exRes.recordset.length > 0) {
            existingPassword = exRes.recordset[0].password;
          }
        } catch (_) {}
      }
      if (!existingPassword) {
        const fileUsers = loadUsers();
        const fUser = fileUsers.find(fu => String(fu.id) === String(userId));
        if (fUser) existingPassword = fUser.password;
      }
    }

    let finalPassword = u.password;
    if (finalPassword && finalPassword !== '••••••••') {
      finalPassword = hashPassword(String(finalPassword).trim());
    } else if (existingPassword) {
      finalPassword = existingPassword;
    } else {
      finalPassword = hashPassword('test');
    }

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

    const fallbackLoginId = (u.loginId && String(u.loginId).trim()) 
      ? String(u.loginId).trim() 
      : (u.email && u.email.includes('@') ? u.email.split('@')[0] : userId);

    const reqBuilder = pool.request()
      .input('id', sql.VarChar, userId)
      .input('loginId', sql.VarChar, fallbackLoginId)
      .input('password', sql.VarChar, finalPassword)
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

    const candidateFields = [
      { col: 'loginId', set: 'loginId = @loginId' },
      { col: 'password', set: 'password = @password' },
      { col: 'name', set: 'name = @name' },
      { col: 'kanaName', set: 'kanaName = @kanaName' },
      { col: 'department', set: 'department = @department' },
      { col: 'office', set: 'office = @office' },
      { col: 'division', set: 'division = @division' },
      { col: 'position', set: 'position = @position' },
      { col: 'role', set: 'role = @role' },
      { col: 'isAdmin', set: 'isAdmin = @isAdmin' },
      { col: 'avatarUrl', set: 'avatarUrl = @avatarUrl' },
      { col: 'email', set: 'email = @email' },
      { col: 'mobileEmail', set: 'mobileEmail = @mobileEmail' },
      { col: 'phone', set: 'phone = @phone' },
      { col: 'phoneOutside', set: 'phoneOutside = @phoneOutside' },
      { col: 'phoneExtension', set: 'phoneExtension = @phoneExtension' },
      { col: 'mobilePhone', set: 'mobilePhone = @mobilePhone' },
      { col: 'icalUrl', set: 'icalUrl = @icalUrl' },
      { col: 'supervisorId', set: 'supervisorId = @supervisorId' }
    ];

    const updateSets = [];
    const insertCols = ['id'];
    const insertVals = ['@id'];

    for (const f of candidateFields) {
      if (!cols || cols.has(f.col.toLowerCase())) {
        updateSets.push(f.set);
        insertCols.push(f.col);
        insertVals.push(`@${f.col}`);
      }
    }

    if (hasSortOrderCol) { updateSets.push('sortOrder = @sortOrder'); insertCols.push('sortOrder'); insertVals.push('@sortOrder'); }
    if (hasRolesCol) { updateSets.push('roles = @roles'); insertCols.push('roles'); insertVals.push('@roles'); }
    if (hasCol) { updateSets.push('preferences = @preferences'); insertCols.push('preferences'); insertVals.push('@preferences'); }
    if (hasPersonalEmailEncryptedCol && u.personalEmailEncrypted !== undefined) { updateSets.push('personalEmailEncrypted = @personalEmailEncrypted'); insertCols.push('personalEmailEncrypted'); insertVals.push('@personalEmailEncrypted'); }
    if (hasPersonalEmailMaskedCol && u.personalEmailMasked !== undefined) { updateSets.push('personalEmailMasked = @personalEmailMasked'); insertCols.push('personalEmailMasked'); insertVals.push('@personalEmailMasked'); }
    if (hasMustChangeCol) { updateSets.push('mustChangePassword = @mustChangePassword'); insertCols.push('mustChangePassword'); insertVals.push('@mustChangePassword'); }

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

    // users.json にもバックアップ同期
    try {
      const fileUsers = loadUsers();
      const fIdx = fileUsers.findIndex(fu => String(fu.id) === String(userId));
      const savedUserObj = {
        ...u,
        id: userId,
        loginId: fallbackLoginId,
        password: finalPassword,
        sortOrder: parsedSortOrder,
        preferences: mergedPrefs,
        roles: rolesArr
      };
      if (fIdx !== -1) {
        fileUsers[fIdx] = savedUserObj;
      } else {
        fileUsers.push(savedUserObj);
      }
      saveUsers(fileUsers);
    } catch (_) {}

    res.json({ id: userId, loginId: fallbackLoginId, sortOrder: parsedSortOrder, preferences: mergedPrefs, roles: rolesArr, success: true, message: 'ユーザー保存成功' });
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
// 6. ユーザー削除 (DELETE /users/:id & /api/users/:id & /:id)
// =============================================================
router.delete(['/users/:id', '/api/users/:id', '/:id'], async (req, res) => {
  try {
    const userId = String(req.params.id);

    const pool = await getPool();
    if (pool) {
      try {
        await pool.request()
          .input('id', sql.VarChar, userId)
          .query('DELETE FROM dbo.Users WHERE id = @id');
      } catch (dbErr) {
        console.warn('[Users] Failed to delete user from SQL Server:', dbErr.message);
      }
    }

    // users.json からも確実に削除（二重永続化同期）
    const users = loadUsers();
    const filteredUsers = users.filter(u => String(u.id) !== userId && String(u.loginId) !== userId);
    saveUsers(filteredUsers);

    // user_preferences.json からも削除
    const allPrefs = loadAllUserPrefs();
    if (allPrefs[userId]) {
      delete allPrefs[userId];
      try {
        fs.writeFileSync(userPrefsFile, JSON.stringify(allPrefs, null, 2), 'utf8');
      } catch (_) {}
    }

    res.json({ success: true, message: 'ユーザー削除完了', deletedId: userId });
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
