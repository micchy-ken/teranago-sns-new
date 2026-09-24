import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import sql from 'mssql';
import { getPool } from '../db.js';
import { encryptText, maskEmail, decryptText } from './safety.js';
import { uploadDir, dataDir } from '../config.js';

const router = Router();
const userPrefsFile = path.join(dataDir, 'user_preferences.json');

// =============================================================
// ローカル preferences バックアップ永続化 (SQL Serverカラム未作成時も100%保護)
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
      // カラムが無ければ ALTER TABLE を試みる
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
// 1. ユーザー一覧取得 (GET /users)
// =============================================================
router.get(['/users', '/users/'], async (req, res) => {
  try {
    const pool = await getPool();
    const hasCol = await checkPreferencesColumn(pool);
    const allFilePrefs = loadAllUserPrefs();

    const result = await pool.request().query('SELECT * FROM dbo.Users ORDER BY name ASC');
    const users = (result.recordset || []).map(row => {
      const uId = String(row.id);
      let prefs = {};

      // 1. SQL Server の preferences カラムから取得
      if (hasCol && row.preferences) {
        try {
          prefs = typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences;
        } catch (_) {}
      }

      // 2. ローカルバックアップ JSON とマージ（ローカルが新しければ優先）
      if (allFilePrefs[uId]) {
        prefs = {
          ...prefs,
          ...allFilePrefs[uId]
        };
      }

      return {
        ...row,
        preferences: prefs
      };
    });
    res.json(users);
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// =============================================================
// 2. 単一ユーザー取得 (GET /users/:id)
// =============================================================
router.get('/users/:id', async (req, res) => {
  try {
    const pool = await getPool();
    const hasCol = await checkPreferencesColumn(pool);
    const userId = String(req.params.id);
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

    res.json({
      ...row,
      preferences: prefs
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 3. ユーザー保存・更新用ヘルパー関数 (POST / PUT 共通)
// =============================================================
async function saveOrUpdateUser(req, res, targetUserId = null) {
  try {
    const u = req.body || {};
    const pool = await getPool();
    const hasCol = await checkPreferencesColumn(pool);
    const userId = targetUserId || u.id || `u-${Date.now()}`;
    
    // roles (配列または文字列) の安全な文字列化
    const rolesStr = Array.isArray(u.roles) 
      ? JSON.stringify(u.roles) 
      : (typeof u.roles === 'string' ? u.roles : JSON.stringify([u.role || 'user']));

    // preferences の処理 & ローカル二重保存
    let incomingPrefs = null;
    if (u.preferences !== undefined) {
      incomingPrefs = typeof u.preferences === 'string' ? JSON.parse(u.preferences || '{}') : (u.preferences || {});
      saveUserPrefs(userId, incomingPrefs);
    }

    const allFilePrefs = loadAllUserPrefs();
    const mergedPrefs = {
      ...(allFilePrefs[userId] || {}),
      ...(incomingPrefs || {})
    };
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
      .input('roles', sql.NVarChar, rolesStr)
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

    if (hasCol) {
      reqBuilder.input('preferences', sql.NVarChar, prefStr);
      await reqBuilder.query(`
        IF EXISTS (SELECT 1 FROM dbo.Users WHERE id = @id)
          UPDATE dbo.Users 
          SET loginId = @loginId, password = @password, name = @name, kanaName = @kanaName,
              department = @department, office = @office, division = @division, position = @position,
              role = @role, roles = @roles, isAdmin = @isAdmin, avatarUrl = @avatarUrl, email = @email,
              mobileEmail = @mobileEmail, phone = @phone, phoneOutside = @phoneOutside,
              phoneExtension = @phoneExtension, mobilePhone = @mobilePhone, icalUrl = @icalUrl,
              supervisorId = @supervisorId,
              preferences = @preferences
          WHERE id = @id;
        ELSE
          INSERT INTO dbo.Users (id, loginId, password, name, kanaName, department, office, division, position, role, roles, isAdmin, avatarUrl, email, mobileEmail, phone, phoneOutside, phoneExtension, mobilePhone, icalUrl, supervisorId, preferences)
          VALUES (@id, @loginId, @password, @name, @kanaName, @department, @office, @division, @position, @role, @roles, @isAdmin, @avatarUrl, @email, @mobileEmail, @phone, @phoneOutside, @phoneExtension, @mobilePhone, @icalUrl, @supervisorId, @preferences);
      `);
    } else {
      // preferences カラムが無い場合は他の基本情報のみ更新し、SQLエラーを完全回避
      await reqBuilder.query(`
        IF EXISTS (SELECT 1 FROM dbo.Users WHERE id = @id)
          UPDATE dbo.Users 
          SET loginId = @loginId, password = @password, name = @name, kanaName = @kanaName,
              department = @department, office = @office, division = @division, position = @position,
              role = @role, roles = @roles, isAdmin = @isAdmin, avatarUrl = @avatarUrl, email = @email,
              mobileEmail = @mobileEmail, phone = @phone, phoneOutside = @phoneOutside,
              phoneExtension = @phoneExtension, mobilePhone = @mobilePhone, icalUrl = @icalUrl,
              supervisorId = @supervisorId
          WHERE id = @id;
        ELSE
          INSERT INTO dbo.Users (id, loginId, password, name, kanaName, department, office, division, position, role, roles, isAdmin, avatarUrl, email, mobileEmail, phone, phoneOutside, phoneExtension, mobilePhone, icalUrl, supervisorId)
          VALUES (@id, @loginId, @password, @name, @kanaName, @department, @office, @division, @position, @role, @roles, @isAdmin, @avatarUrl, @email, @mobileEmail, @phone, @phoneOutside, @phoneExtension, @mobilePhone, @icalUrl, @supervisorId);
      `);
    }

    res.json({ id: userId, preferences: mergedPrefs, message: 'ユーザー保存成功' });
  } catch (err) { 
    console.error('[Users] saveOrUpdateUser error:', err);
    res.status(500).json({ error: err.message }); 
  }
}

// ユーザー作成・更新 (POST /users)
router.post(['/users', '/users/'], (req, res) => saveOrUpdateUser(req, res));

// ユーザー更新 (PUT /users/:id, POST /users/:id)
router.put('/users/:id', (req, res) => saveOrUpdateUser(req, res, req.params.id));
router.post('/users/:id', (req, res) => saveOrUpdateUser(req, res, req.params.id));

// =============================================================
// 4. 個人設定・通知権限・マイページ並び順の更新 (PUT & POST)
// エンドポイント: /users/:id/preferences, /users/:id/settings, /users/:id/notification-settings
// =============================================================
const preferencesPaths = [
  '/users/:id/preferences',
  '/users/:id/preferences/',
  '/users/:id/settings',
  '/users/:id/notification-settings'
];

async function updatePreferencesHandler(req, res) {
  try {
    const userId = String(req.params.id);
    const body = req.body || {};
    const pool = await getPool();
    const hasCol = await checkPreferencesColumn(pool);

    // 送信データが { preferences: {...} } の場合と、直接 { mypageSectionOrder: [...], emailNotifications: ... } の両方を許容
    const incomingPrefs = (body.preferences && typeof body.preferences === 'object') ? body.preferences : body;

    // 既存の preferences を取得して部分マージ (既存設定が消えないように保護)
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

    // ディープマージ（emailNotifications 等の階層化オブジェクトも保護）
    const mergedPrefs = {
      ...currentPrefs,
      ...incomingPrefs,
      emailNotifications: {
        ...(currentPrefs.emailNotifications || {}),
        ...(incomingPrefs.emailNotifications || {})
      }
    };

    // 1. ローカル JSON に必ず保存
    saveUserPrefs(userId, mergedPrefs);

    // 2. SQL Server カラムが存在すればそちらも更新
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
// 5. ユーザー削除 (DELETE /users/:id)
// =============================================================
router.delete('/users/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query('DELETE FROM dbo.Users WHERE id = @id');
    res.json({ message: 'ユーザー削除完了' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
});

// =============================================================
// 6. 個人メールアドレス AES-256-GCM 暗号化保存 (POST /users/:id/personal-email)
// =============================================================
router.post('/users/:id/personal-email', async (req, res) => {
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
// 7. アバター画像アップロード (POST /upload-avatar, POST /users/upload-avatar)
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

router.post(['/upload-avatar', '/users/upload-avatar'], uploadAvatar.single('avatar'), (req, res) => {
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
