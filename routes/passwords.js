/**
 * routes/passwords.js
 * 寺岡オートドアSNS パスワード管理・リセット・強制変更・一括設定依頼モジュール (Express Router & MS SQL Server)
 * 最終更新: 2026年10月30日 (パスワードscryptハッシュ化・一括設定依頼メール送信API・仮ID自動修復対応版)
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import nodemailer from 'nodemailer';
import sql from 'mssql';
import { getPool } from '../db.js';
import { dataDir } from '../config.js';

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

function loadUsers() {
  try {
    if (fs.existsSync(usersFile)) {
      return JSON.parse(fs.readFileSync(usersFile, 'utf8')) || [];
    }
  } catch (e) {
    console.warn('[Passwords] Failed to read users.json:', e.message);
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
    console.error('[Passwords] Failed to write users.json:', e.message);
  }
}

// =============================================================
// メール送信ヘルパー (Nodemailer - 実環境 SMTP 設定完全準拠)
// =============================================================
function getSmtpTransporter() {
  const smtpHost = process.env.SMTP_HOST || '111.89.134.68';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER || 'nagoya-soumu2';
  const smtpPass = process.env.SMTP_PASS || '';
  const smtpSecure = process.env.SMTP_SECURE === 'true' || smtpPort === 465;

  return nodemailer.createTransport({
    host: smtpHost,
    port: smtpPort,
    secure: smtpSecure,
    auth: smtpUser ? { user: smtpUser, pass: smtpPass } : undefined,
    tls: { rejectUnauthorized: false }
  });
}

async function sendMail({ to, subject, text, html }) {
  const fromAddress = process.env.SMTP_FROM_EMAIL || process.env.SMTP_FROM || 'nagoya-soumu2@teraoka-ads.co.jp';
  const fromName = process.env.SMTP_FROM_NAME || 'Aipo送信用（このメールには返信できません）';
  const transporter = getSmtpTransporter();

  try {
    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromAddress}>`,
      to,
      subject,
      text,
      html
    });
    console.log(`[Mail:Passwords] Sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.warn(`[Mail:Passwords] Send error to ${to}:`, err.message);
    return { simulated: true, error: err.message };
  }
}

// =============================================================
// ローカル preferences 読み書きヘルパー
// =============================================================
function loadAllUserPrefs() {
  try {
    if (fs.existsSync(userPrefsFile)) {
      const content = fs.readFileSync(userPrefsFile, 'utf8');
      return JSON.parse(content) || {};
    }
  } catch (e) {
    console.warn('[Passwords] Failed to read user_preferences.json:', e.message);
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
    console.error('[Passwords] Failed to write user_preferences.json:', e.message);
  }
}

// =============================================================
// 1. パスワード設定依頼メール送信 API (個別)
// =============================================================
const requestResetPaths = [
  '/passwords/request-reset',
  '/passwords/request-reset/',
  '/passwords/request-reset/:id',
  '/api/passwords/request-reset',
  '/api/passwords/request-reset/',
  '/api/passwords/request-reset/:id',
  '/users/:id/request-password-reset',
  '/users/:id/request-password-reset/',
  '/api/users/:id/request-password-reset',
  '/api/users/:id/request-password-reset/'
];

router.post(requestResetPaths, async (req, res) => {
  try {
    const userId = req.params.id || req.body?.userId;
    const { baseUrl, senderName = '管理者' } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'ユーザーIDが指定されていません' });
    }

    const pool = await getPool();
    let user = null;
    if (pool) {
      const uRes = await pool.request().input('id', sql.VarChar, userId).query('SELECT * FROM dbo.Users WHERE id = @id');
      if (uRes.recordset && uRes.recordset.length > 0) {
        user = uRes.recordset[0];
      }
    }
    if (!user) {
      const fileUsers = loadUsers();
      user = fileUsers.find(u => String(u.id) === String(userId));
    }
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    const targetEmail = (user.mobileEmail || user.email || '').trim();

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ error: 'このユーザーにはメールアドレスが登録されていません。' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24時間有効

    const allPrefs = loadAllUserPrefs();
    const curPref = allPrefs[userId] || {};
    curPref.resetPasswordToken = token;
    curPref.resetPasswordExpires = expiresAt;
    curPref.mustChangePassword = true;
    saveUserPrefs(userId, curPref);

    const appBaseUrl = baseUrl || 'https://micchy-ken.github.io/teranago-sns-new/';
    const resetUrl = `${appBaseUrl}${appBaseUrl.includes('?') ? '&' : '?'}mode=reset-password&token=${token}`;

    const subject = `【TERANAGO SNS】パスワード設定のお願い`;
    const text = `${user.name} 様\n\n${senderName}様より、TERANAGO 社内SNS・グループウェアのパスワード設定依頼が届いています。\n以下のリンクを開き、新しいパスワードを設定してください。\n\n▼ パスワード設定URL:\n${resetUrl}\n\n※有効期限: 24時間以内\n※心当たりのない場合は管理者までご連絡ください。`;
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color: #ffffff; padding: 24px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">パスワード設定のお願い</h2>
          <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">TERANAGO 社内ポータル</p>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6; font-size: 14px;">
          <p><b>${user.name}</b> 様</p>
          <p>管理者（${senderName}）より、パスワード設定の依頼が届いています。</p>
          <p>下のボタンをクリックして、新しいパスワードを設定してください。</p>
          
          <div style="text-align: center; margin: 28px 0;">
            <a href="${resetUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px;">
              🔑 新しいパスワードを設定する
            </a>
          </div>

          <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #64748b;">
            <p style="margin: 0 0 4px 0;"><b>ボタンが開けない場合:</b> 以下のURLをブラウザに貼り付けてください。</p>
            <p style="margin: 0; word-break: break-all; color: #4f46e5;">${resetUrl}</p>
            <p style="margin: 8px 0 0 0; color: #e11d48;">※有効期限: <b>24時間以内</b></p>
          </div>
        </div>
      </div>
    `;

    const mailRes = await sendMail({ to: targetEmail, subject, text, html });

    res.json({
      success: true,
      message: `${user.name} 様（${targetEmail}）へパスワード設定案内メールを送信しました。`,
      targetEmail,
      simulated: mailRes?.simulated
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 1-2. パスワード未設定ユーザーへ一括パスワード設定依頼メール送信 API
// =============================================================
const requestResetBulkPaths = [
  '/passwords/request-reset-bulk',
  '/passwords/request-reset-bulk/',
  '/api/passwords/request-reset-bulk',
  '/api/passwords/request-reset-bulk/',
  '/users/request-password-reset-bulk',
  '/users/request-password-reset-bulk/',
  '/api/users/request-password-reset-bulk',
  '/api/users/request-password-reset-bulk/'
];

router.post(requestResetBulkPaths, async (req, res) => {
  try {
    const { senderName = '管理者', baseUrl } = req.body || {};
    const pool = await getPool();
    let allUsers = [];

    if (pool) {
      const uRes = await pool.request().query('SELECT * FROM dbo.Users');
      allUsers = uRes.recordset || [];
    } else {
      allUsers = loadUsers();
    }

    const allPrefs = loadAllUserPrefs();
    let sentCount = 0;
    let skippedCount = 0;
    const sentUsers = [];

    for (const user of allUsers) {
      const uId = String(user.id);
      const curPref = allPrefs[uId] || {};
      const rawPw = user.password || '';
      const isTestPw = !rawPw || rawPw === 'test' || verifyPassword('test', rawPw).isValid;
      const isPasswordDefault = isTestPw || user.mustChangePassword === true || curPref.mustChangePassword === true;

      const targetEmail = (user.mobileEmail || user.email || '').trim();

      if (isPasswordDefault && targetEmail && targetEmail.includes('@')) {
        const token = crypto.randomBytes(24).toString('hex');
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

        curPref.resetPasswordToken = token;
        curPref.resetPasswordExpires = expiresAt;
        curPref.mustChangePassword = true;
        saveUserPrefs(uId, curPref);

        const appBaseUrl = baseUrl || 'https://micchy-ken.github.io/teranago-sns-new/';
        const resetUrl = `${appBaseUrl}${appBaseUrl.includes('?') ? '&' : '?'}mode=reset-password&token=${token}`;

        const subject = `【TERANAGO SNS】パスワード設定のお願い`;
        const text = `${user.name} 様\n\n${senderName}様より、TERANAGO 社内SNS・グループウェアのパスワード設定依頼が届いています。\n以下のリンクを開き、新しいパスワードを設定してください。\n\n▼ パスワード設定URL:\n${resetUrl}\n\n※有効期限: 24時間以内\n※心当たりのない場合は管理者までご連絡ください。`;
        const html = `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
            <div style="background: linear-gradient(135deg, #e11d48 0%, #4f46e5 100%); color: #ffffff; padding: 24px; text-align: center;">
              <h2 style="margin: 0; font-size: 20px; font-weight: 700;">パスワード設定のお願い</h2>
              <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">TERANAGO 社内ポータル</p>
            </div>
            <div style="padding: 24px; color: #334155; line-height: 1.6; font-size: 14px;">
              <p><b>${user.name}</b> 様</p>
              <p>管理者（${senderName}）より、パスワード設定の依頼が届いています。</p>
              <p>下のボタンをクリックして、新しいパスワードを設定してください。</p>
              <div style="text-align: center; margin: 28px 0;">
                <a href="${resetUrl}" style="display: inline-block; background-color: #e11d48; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px;">
                  🔑 新しいパスワードを設定する
                </a>
              </div>
              <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #64748b;">
                <p style="margin: 0 0 4px 0;"><b>ボタンが開けない場合:</b> 以下のURLをブラウザに貼り付けてください。</p>
                <p style="margin: 0; word-break: break-all; color: #4f46e5;">${resetUrl}</p>
                <p style="margin: 8px 0 0 0; color: #e11d48;">※有効期限: <b>24時間以内</b></p>
              </div>
            </div>
          </div>
        `;

        try {
          await sendMail({ to: targetEmail, subject, text, html });
          sentCount++;
          sentUsers.push(`${user.name} (${targetEmail})`);
        } catch (e) {
          console.error(`[Bulk Reset] Failed to send to ${user.name}:`, e);
        }
      } else if (isPasswordDefault) {
        skippedCount++;
      }
    }

    res.json({
      success: true,
      sentCount,
      skippedCount,
      message: `${sentCount}名に一括パスワード設定依頼メールを送信しました。` + (skippedCount > 0 ? ` (${skippedCount}名はメールアドレス未設定のためスキップされました)` : ''),
      sentUsers
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 2. パスワード再設定トークン検証 API (GET /passwords/verify)
// =============================================================
const verifyResetPaths = [
  '/passwords/verify',
  '/passwords/verify/',
  '/api/passwords/verify',
  '/api/passwords/verify/',
  '/users/reset-password/verify',
  '/users/reset-password/verify/',
  '/api/users/reset-password/verify',
  '/api/users/reset-password/verify/'
];

router.get(verifyResetPaths, async (req, res) => {
  try {
    const token = req.query.token || req.query.t;
    if (!token) return res.status(400).json({ error: 'トークンが必要です' });

    const allPrefs = loadAllUserPrefs();
    let matchedUserId = null;
    let matchedPref = null;

    for (const [uId, pref] of Object.entries(allPrefs)) {
      if (pref.resetPasswordToken === token) {
        matchedUserId = uId;
        matchedPref = pref;
        break;
      }
    }

    if (!matchedUserId || !matchedPref) {
      return res.status(404).json({ error: '無効なパスワード設定リンクです。' });
    }

    if (new Date(matchedPref.resetPasswordExpires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'リンクの有効期限が切れています。管理者に再発行を依頼してください。' });
    }

    const pool = await getPool();
    let user = null;
    if (pool) {
      const uRes = await pool.request().input('id', sql.VarChar, matchedUserId).query('SELECT id, name, loginId, email FROM dbo.Users WHERE id = @id');
      if (uRes.recordset && uRes.recordset.length > 0) user = uRes.recordset[0];
    }
    if (!user) {
      const fileUsers = loadUsers();
      user = fileUsers.find(u => String(u.id) === String(matchedUserId));
    }
    if (!user) {
      user = { id: matchedUserId, name: 'メンバー' };
    }

    // loginId が未設定または仮ID(user_xxxx)の場合、メールアドレスの@前(例: koga)を推奨ログインIDとして返却
    const rawLoginId = user.loginId || '';
    const emailPrefix = user.email ? user.email.split('@')[0] : '';
    const resolvedLoginId = (rawLoginId && !rawLoginId.startsWith('user_')) 
      ? rawLoginId 
      : (emailPrefix || rawLoginId || user.id);

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        loginId: resolvedLoginId,
        email: user.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 3. パスワード再設定実行 API (POST /passwords/reset - scryptハッシュ化)
// =============================================================
const executeResetPaths = [
  '/passwords/reset',
  '/passwords/reset/',
  '/api/passwords/reset',
  '/api/passwords/reset/',
  '/users/reset-password',
  '/users/reset-password/',
  '/api/users/reset-password',
  '/api/users/reset-password/'
];

router.post(executeResetPaths, async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token) return res.status(400).json({ error: 'トークンが必要です' });
    if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: 'パスワードは4文字以上で入力してください' });

    const allPrefs = loadAllUserPrefs();
    let matchedUserId = null;
    let matchedPref = null;

    for (const [uId, pref] of Object.entries(allPrefs)) {
      if (pref.resetPasswordToken === token) {
        matchedUserId = uId;
        matchedPref = pref;
        break;
      }
    }

    if (!matchedUserId || !matchedPref) {
      return res.status(404).json({ error: '無効なパスワード設定リンクです。' });
    }

    if (new Date(matchedPref.resetPasswordExpires).getTime() < Date.now()) {
      return res.status(400).json({ error: 'リンクの有効期限が切れています。' });
    }

    const hashedPassword = hashPassword(newPassword);

    const pool = await getPool();
    let user = null;
    if (pool) {
      const uColRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
      const userCols = new Set((uColRes.recordset || []).map(r => r.COLUMN_NAME.toLowerCase()));
      const hasMustChangeCol = userCols.has('mustchangepassword');

      if (hasMustChangeCol) {
        await pool.request()
          .input('id', sql.VarChar, matchedUserId)
          .input('password', sql.VarChar, hashedPassword)
          .input('mustChangePassword', sql.Bit, 0)
          .query('UPDATE dbo.Users SET password = @password, mustChangePassword = @mustChangePassword WHERE id = @id');
      } else {
        await pool.request()
          .input('id', sql.VarChar, matchedUserId)
          .input('password', sql.VarChar, hashedPassword)
          .query('UPDATE dbo.Users SET password = @password WHERE id = @id');
      }

      const userRes = await pool.request().input('id', sql.VarChar, matchedUserId).query('SELECT * FROM dbo.Users WHERE id = @id');
      user = userRes.recordset && userRes.recordset[0];
    }

    // users.json にも確実に反映
    const fileUsers = loadUsers();
    const fIdx = fileUsers.findIndex(u => String(u.id) === String(matchedUserId));
    if (fIdx !== -1) {
      fileUsers[fIdx].password = hashedPassword;
      fileUsers[fIdx].mustChangePassword = false;
      saveUsers(fileUsers);
      if (!user) user = fileUsers[fIdx];
    }

    // トークン削除 & フラグクリア
    delete matchedPref.resetPasswordToken;
    delete matchedPref.resetPasswordExpires;
    matchedPref.mustChangePassword = false;
    matchedPref.passwordChangedAt = new Date().toISOString();
    saveUserPrefs(matchedUserId, matchedPref);

    const returnUser = user ? { ...user } : { id: matchedUserId };
    delete returnUser.password;
    delete returnUser.passwordHash;
    returnUser.passwordMasked = '••••••••';

    // 仮ID(user_xxxx)だった場合、emailの@前をログインIDとして返却
    if ((!returnUser.loginId || returnUser.loginId.startsWith('user_')) && returnUser.email) {
      returnUser.loginId = returnUser.email.split('@')[0];
    }

    res.json({
      success: true,
      message: 'パスワードを設定しました。新しいパスワードでログインしてください。',
      user: returnUser
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 4. 初回ログイン時・強制パスワード変更 API (POST /passwords/force-change - scryptハッシュ化)
// =============================================================
const forceChangePaths = [
  '/passwords/force-change',
  '/passwords/force-change/',
  '/api/passwords/force-change',
  '/api/passwords/force-change/',
  '/users/force-change-password',
  '/users/force-change-password/',
  '/api/users/force-change-password',
  '/api/users/force-change-password/'
];

router.post(forceChangePaths, async (req, res) => {
  try {
    const { userId, newPassword, currentPassword } = req.body || {};
    if (!userId) return res.status(400).json({ error: 'ユーザーIDが必要です' });
    if (!newPassword || newPassword.length < 4) return res.status(400).json({ error: '新しいパスワードは4文字以上で入力してください' });

    const pool = await getPool();
    let user = null;
    if (pool) {
      const uRes = await pool.request().input('id', sql.VarChar, userId).query('SELECT * FROM dbo.Users WHERE id = @id');
      if (uRes.recordset && uRes.recordset.length > 0) user = uRes.recordset[0];
    }
    if (!user) {
      const fileUsers = loadUsers();
      user = fileUsers.find(u => String(u.id) === String(userId));
    }
    if (!user) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }

    if (currentPassword && user.password && !verifyPassword(currentPassword, user.password).isValid) {
      return res.status(400).json({ error: '現在のパスワードが一致しません' });
    }

    const hashedPassword = hashPassword(newPassword);

    if (pool) {
      const uColRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
      const userCols = new Set((uColRes.recordset || []).map(r => r.COLUMN_NAME.toLowerCase()));
      const hasMustChangeCol = userCols.has('mustchangepassword');

      if (hasMustChangeCol) {
        await pool.request()
          .input('id', sql.VarChar, userId)
          .input('password', sql.VarChar, hashedPassword)
          .input('mustChangePassword', sql.Bit, 0)
          .query('UPDATE dbo.Users SET password = @password, mustChangePassword = @mustChangePassword WHERE id = @id');
      } else {
        await pool.request()
          .input('id', sql.VarChar, userId)
          .input('password', sql.VarChar, hashedPassword)
          .query('UPDATE dbo.Users SET password = @password WHERE id = @id');
      }
    }

    const fileUsers = loadUsers();
    const fIdx = fileUsers.findIndex(u => String(u.id) === String(userId));
    if (fIdx !== -1) {
      fileUsers[fIdx].password = hashedPassword;
      fileUsers[fIdx].mustChangePassword = false;
      saveUsers(fileUsers);
    }

    const allPrefs = loadAllUserPrefs();
    const curPref = allPrefs[userId] || {};
    curPref.mustChangePassword = false;
    curPref.passwordChangedAt = new Date().toISOString();
    saveUserPrefs(userId, curPref);

    res.json({
      success: true,
      message: 'パスワードを変更しました。',
      user: {
        ...user,
        password: '••••••••',
        mustChangePassword: false
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
