/**
 * routes/users.js (本番環境・MS SQL Server & 暗号化 & JSON ストレージ ハイブリッド対応版)
 * 寺岡オートドアSNS / 寺子屋SNS ユーザー管理・個人設定・権限・暗号化メールモジュール
 * 
 * 最終更新: 2026年8月28日 (ユーザー一覧・詳細・CRUD・権限設定・AES-256-GCM個人メール暗号化・テスト送信 完全版)
 */
import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import sql from 'mssql';
import { getPool } from '../db.js';
import { dataDir, safeParseJSON } from '../config.js';
import { sendEmailNotification } from './email.js';

const router = Router();
const usersPath = path.join(dataDir, 'users.json');

// 個人メール暗号化用シークレット
const EMAIL_ENCRYPTION_SECRET = process.env.PERSONAL_EMAIL_SECRET_KEY || 'teraoka-safety-confirmation-secret-2026-auth-v1';
const ENCRYPTION_KEY = crypto.createHash('sha256').update(EMAIL_ENCRYPTION_SECRET).digest();

/**
 * 暗号化関数 (AES-256-GCM)
 */
export function encryptText(plainText) {
  if (!plainText) return '';
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', ENCRYPTION_KEY, iv);
    let encrypted = cipher.update(String(plainText).trim(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (err) {
    console.error('Encryption error:', err);
    return '';
  }
}

/**
 * 復号関数 (AES-256-GCM)
 */
export function decryptText(cipherText) {
  if (!cipherText || typeof cipherText !== 'string' || !cipherText.includes(':')) return '';
  try {
    const parts = cipherText.split(':');
    if (parts.length !== 3) return '';
    const [ivHex, authTagHex, encryptedHex] = parts;
    const decipher = crypto.createDecipheriv('aes-256-gcm', ENCRYPTION_KEY, Buffer.from(ivHex, 'hex'));
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    let decrypted = decipher.update(encryptedHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (err) {
    return '';
  }
}

/**
 * メールアドレスの伏字化 (例: mi***y@gmail.com)
 */
export function maskEmail(email) {
  if (!email || !email.includes('@')) return '';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local.slice(0, 2)}***@${domain}`;
}

/**
 * JSON ファイルからのローカルユーザー読み込み
 */
function loadLocalUsers() {
  try {
    if (fs.existsSync(usersPath)) {
      const content = fs.readFileSync(usersPath, 'utf8');
      const data = JSON.parse(content);
      return Array.isArray(data) ? data : [];
    }
  } catch (e) {
    console.warn('[Users] Load local users failed:', e.message);
  }
  return [];
}

/**
 * JSON ファイルへのローカルユーザー保存
 */
function saveLocalUsers(users) {
  try {
    fs.writeFileSync(usersPath, JSON.stringify(users, null, 2), 'utf8');
  } catch (e) {
    console.error('[Users] Save local users failed:', e.message);
  }
}

// -------------------------------------------------------------
// 1. ユーザー一覧取得 API
// 対応URL: /api/users, /api/users/
// -------------------------------------------------------------
router.get(['/users', '/users/'], async (req, res) => {
  try {
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query('SELECT * FROM dbo.Users ORDER BY name ASC');
      const users = (result.recordset || []).map(row => {
        const encryptedEmail = row.personalEmailEncrypted || row.personal_email_encrypted || '';
        const decEmail = encryptedEmail ? decryptText(encryptedEmail) : '';
        const masked = decEmail ? maskEmail(decEmail) : (row.personalEmailMasked || undefined);

        return {
          id: String(row.id),
          loginId: row.loginId || row.login_id || '',
          name: row.name,
          kanaName: row.kanaName || row.kana_name || '',
          department: row.department || `${row.office || ''} ${row.division || ''}`.trim(),
          office: row.office || '',
          division: row.division || '',
          position: row.position || '',
          avatarUrl: row.avatarUrl || row.avatar_url || '',
          role: row.role || (row.isAdmin ? 'admin' : 'user'),
          isAdmin: !!(row.isAdmin || row.role === 'admin' || String(row.id) === 'u1'),
          email: row.email || '',
          mobileEmail: row.mobileEmail || row.mobile_email || '',
          personalEmailEncrypted: encryptedEmail || undefined,
          personalEmailMasked: masked,
          hasPersonalEmail: !!encryptedEmail,
          supervisorId: row.supervisorId || row.supervisor_id || undefined,
          preferences: typeof row.preferences === 'string' ? safeParseJSON(row.preferences, {}) : (row.preferences || {})
        };
      });
      return res.json(users);
    }

    // JSON フォールバック
    const localUsers = loadLocalUsers();
    res.json(localUsers);
  } catch (err) {
    console.error('[Users] Get users error:', err);
    const localUsers = loadLocalUsers();
    if (localUsers.length > 0) return res.json(localUsers);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. 単一ユーザー情報取得 API
// 対応URL: /api/users/:id
// -------------------------------------------------------------
router.get(['/users/:id', '/users/:id/'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (pool) {
      const result = await pool.request()
        .input('id', sql.NVarChar(100), id)
        .query('SELECT * FROM dbo.Users WHERE id = @id');

      if (result.recordset && result.recordset.length > 0) {
        const row = result.recordset[0];
        const encryptedEmail = row.personalEmailEncrypted || row.personal_email_encrypted || '';
        const decEmail = encryptedEmail ? decryptText(encryptedEmail) : '';
        const masked = decEmail ? maskEmail(decEmail) : (row.personalEmailMasked || undefined);

        return res.json({
          id: String(row.id),
          loginId: row.loginId || row.login_id || '',
          name: row.name,
          kanaName: row.kanaName || row.kana_name || '',
          department: row.department || `${row.office || ''} ${row.division || ''}`.trim(),
          office: row.office || '',
          division: row.division || '',
          position: row.position || '',
          avatarUrl: row.avatarUrl || row.avatar_url || '',
          role: row.role || (row.isAdmin ? 'admin' : 'user'),
          isAdmin: !!(row.isAdmin || row.role === 'admin' || String(row.id) === 'u1'),
          email: row.email || '',
          mobileEmail: row.mobileEmail || row.mobile_email || '',
          personalEmailEncrypted: encryptedEmail || undefined,
          personalEmailMasked: masked,
          hasPersonalEmail: !!encryptedEmail,
          supervisorId: row.supervisorId || row.supervisor_id || undefined,
          preferences: typeof row.preferences === 'string' ? safeParseJSON(row.preferences, {}) : (row.preferences || {})
        });
      }
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    const localUsers = loadLocalUsers();
    const found = localUsers.find(u => String(u.id) === String(id));
    if (!found) return res.status(404).json({ error: 'ユーザーが見つかりません' });
    res.json(found);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 3. ユーザー新規登録・更新 API (POST / PUT)
// 対応URL: /api/users, /api/users/:id
// -------------------------------------------------------------
router.post(['/users', '/users/'], async (req, res) => {
  try {
    const u = req.body;
    if (!u || !u.id) {
      return res.status(400).json({ error: 'ユーザーIDが必要です' });
    }

    const userId = String(u.id);
    const pool = await getPool();
    const nowIso = new Date().toISOString();

    if (pool) {
      const prefStr = typeof u.preferences === 'object' ? JSON.stringify(u.preferences) : (u.preferences || '{}');
      await pool.request()
        .input('id', sql.NVarChar(100), userId)
        .input('loginId', sql.NVarChar(100), u.loginId || userId)
        .input('name', sql.NVarChar(100), u.name || '')
        .input('kanaName', sql.NVarChar(100), u.kanaName || '')
        .input('department', sql.NVarChar(100), u.department || '')
        .input('office', sql.NVarChar(100), u.office || '')
        .input('division', sql.NVarChar(100), u.division || '')
        .input('position', sql.NVarChar(100), u.position || '')
        .input('avatarUrl', sql.NVarChar(sql.MAX), u.avatarUrl || '')
        .input('role', sql.NVarChar(50), u.role || (u.isAdmin ? 'admin' : 'user'))
        .input('isAdmin', sql.Bit, (u.isAdmin || u.role === 'admin') ? 1 : 0)
        .input('email', sql.NVarChar(200), u.email || '')
        .input('mobileEmail', sql.NVarChar(200), u.mobileEmail || u.mobile_email || '')
        .input('supervisorId', sql.NVarChar(100), u.supervisorId || null)
        .input('preferences', sql.NVarChar(sql.MAX), prefStr)
        .input('updatedAt', sql.DateTimeOffset, nowIso)
        .query(`
          MERGE dbo.Users AS target
          USING (SELECT @id AS id) AS source
          ON (target.id = source.id)
          WHEN MATCHED THEN
            UPDATE SET 
              loginId = @loginId,
              name = @name,
              kanaName = @kanaName,
              department = @department,
              office = @office,
              division = @division,
              position = @position,
              avatarUrl = @avatarUrl,
              role = @role,
              isAdmin = @isAdmin,
              email = @email,
              mobileEmail = @mobileEmail,
              supervisorId = @supervisorId,
              preferences = @preferences,
              updatedAt = @updatedAt
          WHEN NOT MATCHED THEN
            INSERT (id, loginId, name, kanaName, department, office, division, position, avatarUrl, role, isAdmin, email, mobileEmail, supervisorId, preferences, updatedAt)
            VALUES (@id, @loginId, @name, @kanaName, @department, @office, @division, @position, @avatarUrl, @role, @isAdmin, @email, @mobileEmail, @supervisorId, @preferences, @updatedAt);
        `);
    }

    // ローカルJSONも同期更新
    const localUsers = loadLocalUsers();
    const idx = localUsers.findIndex(item => String(item.id) === userId);
    if (idx >= 0) {
      localUsers[idx] = { ...localUsers[idx], ...u };
    } else {
      localUsers.push(u);
    }
    saveLocalUsers(localUsers);

    res.json({ success: true, user: u });
  } catch (err) {
    console.error('[Users] Save user error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put(['/users/:id', '/users/:id/'], async (req, res) => {
  try {
    const userId = String(req.params.id);
    const u = { ...req.body, id: userId };
    const pool = await getPool();
    const nowIso = new Date().toISOString();

    if (pool) {
      const prefStr = typeof u.preferences === 'object' ? JSON.stringify(u.preferences) : (u.preferences || '{}');
      await pool.request()
        .input('id', sql.NVarChar(100), userId)
        .input('loginId', sql.NVarChar(100), u.loginId || userId)
        .input('name', sql.NVarChar(100), u.name || '')
        .input('kanaName', sql.NVarChar(100), u.kanaName || '')
        .input('department', sql.NVarChar(100), u.department || '')
        .input('office', sql.NVarChar(100), u.office || '')
        .input('division', sql.NVarChar(100), u.division || '')
        .input('position', sql.NVarChar(100), u.position || '')
        .input('avatarUrl', sql.NVarChar(sql.MAX), u.avatarUrl || '')
        .input('role', sql.NVarChar(50), u.role || (u.isAdmin ? 'admin' : 'user'))
        .input('isAdmin', sql.Bit, (u.isAdmin || u.role === 'admin') ? 1 : 0)
        .input('email', sql.NVarChar(200), u.email || '')
        .input('mobileEmail', sql.NVarChar(200), u.mobileEmail || u.mobile_email || '')
        .input('supervisorId', sql.NVarChar(100), u.supervisorId || null)
        .input('preferences', sql.NVarChar(sql.MAX), prefStr)
        .input('updatedAt', sql.DateTimeOffset, nowIso)
        .query(`
          UPDATE dbo.Users
          SET loginId = @loginId,
              name = @name,
              kanaName = @kanaName,
              department = @department,
              office = @office,
              division = @division,
              position = @position,
              avatarUrl = @avatarUrl,
              role = @role,
              isAdmin = @isAdmin,
              email = @email,
              mobileEmail = @mobileEmail,
              supervisorId = @supervisorId,
              preferences = @preferences,
              updatedAt = @updatedAt
          WHERE id = @id
        `);
    }

    const localUsers = loadLocalUsers();
    const idx = localUsers.findIndex(item => String(item.id) === userId);
    if (idx >= 0) {
      localUsers[idx] = { ...localUsers[idx], ...u };
    } else {
      localUsers.push(u);
    }
    saveLocalUsers(localUsers);

    res.json({ success: true, user: u });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. 個人設定・権限 (preferences) の更新 API
// 対応URL: /api/users/:id/preferences
// -------------------------------------------------------------
router.put(['/users/:id/preferences', '/users/:id/preferences/'], async (req, res) => {
  try {
    const userId = String(req.params.id);
    const preferences = req.body || {};
    const pool = await getPool();
    const nowIso = new Date().toISOString();

    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(100), userId)
        .input('preferences', sql.NVarChar(sql.MAX), JSON.stringify(preferences))
        .input('updatedAt', sql.DateTimeOffset, nowIso)
        .query(`
          UPDATE dbo.Users
          SET preferences = @preferences, updatedAt = @updatedAt
          WHERE id = @id
        `);
    }

    const localUsers = loadLocalUsers();
    const idx = localUsers.findIndex(item => String(item.id) === userId);
    if (idx >= 0) {
      localUsers[idx].preferences = { ...(localUsers[idx].preferences || {}), ...preferences };
      saveLocalUsers(localUsers);
    }

    res.json({ success: true, preferences, message: '個人設定・通知権限を保存しました。' });
  } catch (err) {
    console.error('[Users] Update preferences error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. 個人メールアドレス AES-256-GCM 暗号化保存 API
// 対応URL: /api/users/:id/personal-email, /api/personal-email
// -------------------------------------------------------------
router.post(['/users/:id/personal-email', '/users/:id/personal-email/'], async (req, res) => {
  try {
    const userId = String(req.params.id);
    const { personalEmail } = req.body || {};

    if (!personalEmail) {
      // 登録解除
      const pool = await getPool();
      if (pool) {
        await pool.request()
          .input('id', sql.NVarChar(100), userId)
          .query(`
            UPDATE dbo.Users 
            SET personalEmailEncrypted = NULL, personalEmailMasked = NULL 
            WHERE id = @id
          `);
      }

      const localUsers = loadLocalUsers();
      const idx = localUsers.findIndex(u => String(u.id) === userId);
      if (idx >= 0) {
        delete localUsers[idx].personalEmailEncrypted;
        delete localUsers[idx].personalEmailMasked;
        saveLocalUsers(localUsers);
      }

      return res.json({
        success: true,
        message: '個人メールアドレスの登録を解除しました。',
        personalEmailMasked: undefined
      });
    }

    const emailTrimmed = String(personalEmail).trim();
    if (!emailTrimmed.includes('@') || !emailTrimmed.includes('.')) {
      return res.status(400).json({ error: '有効なメールアドレス形式で入力してください。' });
    }

    const encrypted = encryptText(emailTrimmed);
    const masked = maskEmail(emailTrimmed);
    const nowIso = new Date().toISOString();

    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(100), userId)
        .input('personalEmailEncrypted', sql.NVarChar(500), encrypted)
        .input('personalEmailMasked', sql.NVarChar(200), masked)
        .input('updatedAt', sql.DateTimeOffset, nowIso)
        .query(`
          UPDATE dbo.Users 
          SET personalEmailEncrypted = @personalEmailEncrypted,
              personalEmailMasked = @personalEmailMasked,
              updatedAt = @updatedAt
          WHERE id = @id
        `);
    }

    const localUsers = loadLocalUsers();
    const idx = localUsers.findIndex(u => String(u.id) === userId);
    if (idx >= 0) {
      localUsers[idx].personalEmailEncrypted = encrypted;
      localUsers[idx].personalEmailMasked = masked;
      saveLocalUsers(localUsers);
    }

    res.json({
      success: true,
      message: '個人メールアドレスを暗号化して安全に保存しました。',
      personalEmailMasked: masked
    });
  } catch (err) {
    console.error('[Users] Save personal email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. 個人メールアドレス宛テストメール疎通確認 API
// 対応URL: /api/users/:id/personal-email/test
// -------------------------------------------------------------
router.post(['/users/:id/personal-email/test', '/users/:id/personal-email/test/'], async (req, res) => {
  try {
    const userId = String(req.params.id);
    let targetEmail = '';
    let userName = '';
    let userOffice = '';
    let userDivision = '';

    const pool = await getPool();
    if (pool) {
      const result = await pool.request()
        .input('id', sql.NVarChar(100), userId)
        .query('SELECT * FROM dbo.Users WHERE id = @id');

      if (result.recordset && result.recordset.length > 0) {
        const u = result.recordset[0];
        userName = u.name;
        userOffice = u.office || '';
        userDivision = u.division || '';
        if (req.body?.personalEmail) {
          targetEmail = String(req.body.personalEmail).trim();
        } else if (u.personalEmailEncrypted || u.personal_email_encrypted) {
          targetEmail = decryptText(u.personalEmailEncrypted || u.personal_email_encrypted);
        }
      }
    }

    if (!targetEmail) {
      const localUsers = loadLocalUsers();
      const u = localUsers.find(item => String(item.id) === userId);
      if (u) {
        userName = u.name;
        userOffice = u.office || '';
        userDivision = u.division || '';
        if (req.body?.personalEmail) {
          targetEmail = String(req.body.personalEmail).trim();
        } else if (u.personalEmailEncrypted) {
          targetEmail = decryptText(u.personalEmailEncrypted);
        }
      }
    }

    if (!targetEmail) {
      return res.status(400).json({ error: 'テスト送信先の個人メールアドレスが登録されていないか、復号できませんでした。' });
    }

    const nowStr = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const subject = '【安否確認テスト】緊急連絡先メール疎通確認';
    const text = `${userName} 様\n\n寺岡オートドアSNS 安否確認システムからの緊急連絡先メール通知テストです。\n\n本メールは、緊急安否確認が発動された際にご登録の個人メールアドレスへ確実に通知が届くかをテストするために配信されています。\n\n送信日時: ${nowStr}\n対象ユーザー: ${userName} (${userOffice} ${userDivision})`;
    const html = `
      <div style="font-family: sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; margin: auto;">
        <div style="background-color: #dc2626; color: #ffffff; padding: 14px 18px; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px;">
          <h2 style="margin: 0; font-size: 17px; font-weight: 700;">🚨 安否確認 緊急連絡先メール疎通テスト</h2>
        </div>
        <p style="font-size: 15px; font-weight: 600; color: #0f172a;">${userName} 様</p>
        <p>寺岡オートドアSNS 安否確認システムからの緊急連絡先メール疎通確認です。</p>
        <p>このメールが届いている場合、暗号化保存された個人メールアドレスへの安否確認通知経路は正常に疎通しています。</p>
        <div style="background-color: #fef2f2; padding: 14px 16px; border-radius: 8px; border: 1px solid #fecaca; margin: 18px 0;">
          <p style="margin: 0 0 6px 0; font-size: 13px; font-weight: 700; color: #991b1b;">【通知配信詳細】</p>
          <ul style="margin: 0; padding-left: 18px; font-size: 13px; color: #7f1d1d;">
            <li><b>送信日時:</b> ${nowStr}</li>
            <li><b>対象社員:</b> ${userName} 様</li>
            <li><b>所属:</b> ${userOffice || '全社'} / ${userDivision || '全部署'}</li>
          </ul>
        </div>
        <p style="font-size: 11px; color: #94a3b8; margin-bottom: 0;">※個人メールアドレスは AES-256-GCM で暗号化されており、管理者画面やデータベース上でも平文は保存・表示されません。</p>
      </div>
    `;

    const info = await sendEmailNotification({ to: targetEmail, subject, text, html });
    res.json({
      success: true,
      message: `${maskEmail(targetEmail)} へテストメールを正常に送信しました。`,
      messageId: info.messageId
    });
  } catch (err) {
    console.error('[Users] Test email send error:', err);
    res.status(500).json({ error: err.message || 'テストメール送信に失敗しました。' });
  }
});

// -------------------------------------------------------------
// 7. パスワード変更 API
// 対応URL: /api/users/:id/password, /api/change-password
// -------------------------------------------------------------
router.post(['/users/:id/password', '/users/:id/password/', '/change-password'], async (req, res) => {
  try {
    const userId = String(req.params.id || req.body?.userId || '');
    const { currentPassword, newPassword } = req.body || {};

    if (!userId || !newPassword) {
      return res.status(400).json({ error: 'ユーザーIDおよび新しいパスワードが必要です。' });
    }

    const pool = await getPool();
    const nowIso = new Date().toISOString();

    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(100), userId)
        .input('password', sql.NVarChar(200), String(newPassword).trim())
        .input('updatedAt', sql.DateTimeOffset, nowIso)
        .query(`
          UPDATE dbo.Users
          SET password = @password, updatedAt = @updatedAt
          WHERE id = @id
        `);
    }

    const localUsers = loadLocalUsers();
    const idx = localUsers.findIndex(u => String(u.id) === userId);
    if (idx >= 0) {
      localUsers[idx].password = String(newPassword).trim();
      saveLocalUsers(localUsers);
    }

    res.json({ success: true, message: 'パスワードを正常に変更しました。' });
  } catch (err) {
    console.error('[Users] Change password error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 8. ユーザー削除 API
// 対応URL: /api/users/:id
// -------------------------------------------------------------
router.delete(['/users/:id', '/users/:id/'], async (req, res) => {
  try {
    const userId = String(req.params.id);
    const pool = await getPool();

    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(100), userId)
        .query('DELETE FROM dbo.Users WHERE id = @id');
    }

    const localUsers = loadLocalUsers();
    const filtered = localUsers.filter(u => String(u.id) !== userId);
    saveLocalUsers(filtered);

    res.json({ success: true, message: 'ユーザーを削除しました。' });
  } catch (err) {
    console.error('[Users] Delete user error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
