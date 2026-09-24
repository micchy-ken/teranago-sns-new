import { Router } from 'express';
import path from 'path';
import multer from 'multer';
import sql from 'mssql';
import { getPool } from '../db.js';
import { encryptText, maskEmail, decryptText } from './safety.js';
import { uploadDir } from '../config.js';

const router = Router();

// DB テーブルに preferences カラムが存在するか確認し、無ければ自動追加するセーフティ関数
let isPreferencesColumnChecked = false;
async function ensurePreferencesColumn(pool) {
  if (isPreferencesColumnChecked || !pool) return;
  try {
    await pool.request().query(`
      IF COL_LENGTH('dbo.Users', 'preferences') IS NULL 
      BEGIN
        ALTER TABLE dbo.Users ADD preferences NVARCHAR(MAX) NULL;
      END
    `);
    isPreferencesColumnChecked = true;
  } catch (err) {
    // 権限等でALTER TABLEできない場合は警告ログにとどめる
    console.warn('[Users] Column check preferences warning:', err.message);
  }
}

// =============================================================
// 1. ユーザー一覧取得 (GET /users)
// ※ 決して /:id や / などの他APIを巻き込むワイルドカードは使わない
// =============================================================
router.get(['/users', '/users/'], async (req, res) => {
  try {
    const pool = await getPool();
    await ensurePreferencesColumn(pool);
    const result = await pool.request().query('SELECT * FROM dbo.Users ORDER BY name ASC');
    const users = (result.recordset || []).map(row => {
      let prefs = {};
      if (row.preferences) {
        try {
          prefs = typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences;
        } catch (e) {
          prefs = {};
        }
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
    await ensurePreferencesColumn(pool);
    const result = await pool.request()
      .input('id', sql.VarChar, String(req.params.id))
      .query('SELECT * FROM dbo.Users WHERE id = @id');
    
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }
    const row = result.recordset[0];
    let prefs = {};
    if (row.preferences) {
      try {
        prefs = typeof row.preferences === 'string' ? JSON.parse(row.preferences) : row.preferences;
      } catch (e) {
        prefs = {};
      }
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
    await ensurePreferencesColumn(pool);

    const userId = targetUserId || u.id || `u-${Date.now()}`;
    
    // roles (配列または文字列) の安全な文字列化
    const rolesStr = Array.isArray(u.roles) 
      ? JSON.stringify(u.roles) 
      : (typeof u.roles === 'string' ? u.roles : JSON.stringify([u.role || 'user']));

    // preferences の安全な文字列化（既存設定とマージ）
    let prefStr = null;
    if (u.preferences !== undefined) {
      let incomingPrefs = typeof u.preferences === 'string' ? JSON.parse(u.preferences || '{}') : (u.preferences || {});
      // 既存の preferences を取得してマージ
      try {
        const curRes = await pool.request()
          .input('checkId', sql.VarChar, userId)
          .query('SELECT preferences FROM dbo.Users WHERE id = @checkId');
        if (curRes.recordset && curRes.recordset.length > 0 && curRes.recordset[0].preferences) {
          const curPrefs = JSON.parse(curRes.recordset[0].preferences);
          incomingPrefs = { ...curPrefs, ...incomingPrefs };
        }
      } catch (_) {}
      prefStr = JSON.stringify(incomingPrefs);
    }

    await pool.request()
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
      .input('supervisorId', sql.VarChar, u.supervisorId || null)
      .input('preferences', sql.NVarChar, prefStr)
      .query(`
        IF EXISTS (SELECT 1 FROM dbo.Users WHERE id = @id)
          UPDATE dbo.Users 
          SET loginId = @loginId, password = @password, name = @name, kanaName = @kanaName,
              department = @department, office = @office, division = @division, position = @position,
              role = @role, roles = @roles, isAdmin = @isAdmin, avatarUrl = @avatarUrl, email = @email,
              mobileEmail = @mobileEmail, phone = @phone, phoneOutside = @phoneOutside,
              phoneExtension = @phoneExtension, mobilePhone = @mobilePhone, icalUrl = @icalUrl,
              supervisorId = @supervisorId,
              preferences = COALESCE(@preferences, preferences)
          WHERE id = @id;
        ELSE
          INSERT INTO dbo.Users (id, loginId, password, name, kanaName, department, office, division, position, role, roles, isAdmin, avatarUrl, email, mobileEmail, phone, phoneOutside, phoneExtension, mobilePhone, icalUrl, supervisorId, preferences)
          VALUES (@id, @loginId, @password, @name, @kanaName, @department, @office, @division, @position, @role, @roles, @isAdmin, @avatarUrl, @email, @mobileEmail, @phone, @phoneOutside, @phoneExtension, @mobilePhone, @icalUrl, @supervisorId, @preferences);
      `);
    res.json({ id: userId, message: 'ユーザー保存成功' });
  } catch (err) { 
    res.status(500).json({ error: err.message }); 
  }
}

// ユーザー作成・更新 (POST /users)
router.post(['/users', '/users/'], (req, res) => saveOrUpdateUser(req, res));

// ユーザー更新 (PUT /users/:id)
// ※ 決して '/:id' 単独は使わない（/api/posts, /api/events 等を巻き込むため）
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
    await ensurePreferencesColumn(pool);

    // 送信データが { preferences: {...} } の場合と、直接 { mypageSectionOrder: [...], ... } の両方を許容
    const incomingPrefs = (body.preferences && typeof body.preferences === 'object') ? body.preferences : body;

    // 既存の preferences を取得して部分マージ (既存設定が消えないように保護)
    let currentPrefs = {};
    try {
      const curRes = await pool.request()
        .input('checkId', sql.VarChar, userId)
        .query('SELECT preferences FROM dbo.Users WHERE id = @checkId');
      if (curRes.recordset && curRes.recordset.length > 0 && curRes.recordset[0].preferences) {
        currentPrefs = typeof curRes.recordset[0].preferences === 'string'
          ? JSON.parse(curRes.recordset[0].preferences)
          : curRes.recordset[0].preferences;
      }
    } catch (_) {}

    // ディープマージ（emailNotifications 等の階層化オブジェクトも保護）
    const mergedPrefs = {
      ...currentPrefs,
      ...incomingPrefs,
      emailNotifications: {
        ...(currentPrefs.emailNotifications || {}),
        ...(incomingPrefs.emailNotifications || {})
      }
    };

    const prefStr = JSON.stringify(mergedPrefs);

    await pool.request()
      .input('id', sql.VarChar, userId)
      .input('preferences', sql.NVarChar, prefStr)
      .query('UPDATE dbo.Users SET preferences = @preferences WHERE id = @id');

    res.json({
      success: true,
      preferences: mergedPrefs,
      message: '個人設定・通知設定・マイページ並び順を保存しました。'
    });
  } catch (err) { 
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
