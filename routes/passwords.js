/**
 * routes/passwords.js
 * 寺岡オートドアSNS パスワード管理・リセット・強制変更モジュール (Express Router & MS SQL Server)
 * 最終更新: 2026年10月1日 (モジュール分割・独立化版)
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

// =============================================================
// メール送信ヘルパー (Nodemailer)
// =============================================================
function getSmtpTransporter() {
  const smtpHost = process.env.SMTP_HOST || '192.168.1.100';
  const smtpPort = parseInt(process.env.SMTP_PORT || '587', 10);
  const smtpUser = process.env.SMTP_USER || '';
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
  const fromAddress = process.env.SMTP_FROM || 'teraoka-sns@teranago.synology.me';
  const fromName = process.env.SMTP_FROM_NAME || 'TERANAGO SNS システム';
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
    console.warn(`[Mail:Passwords] Send error to ${to} (Simulated):`, err.message);
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
// 1. パスワード設定依頼メール送信 API (POST /users/:id/request-password-reset)
// =============================================================
const requestResetPaths = [
  '/users/:id/request-password-reset',
  '/users/:id/request-password-reset/',
  '/api/users/:id/request-password-reset',
  '/api/users/:id/request-password-reset/'
];

router.post(requestResetPaths, async (req, res) => {
  try {
    const userId = req.params.id;
    const { baseUrl, senderName = '管理者' } = req.body || {};
    const pool = await getPool();

    const uRes = await pool.request().input('id', sql.VarChar, userId).query('SELECT * FROM dbo.Users WHERE id = @id');
    if (!uRes.recordset || uRes.recordset.length === 0) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }
    const user = uRes.recordset[0];
    const targetEmail = user.email || user.mobileEmail;

    if (!targetEmail || !targetEmail.includes('@')) {
      return res.status(400).json({ error: 'このユーザーにはメールアドレスが登録されていません。' });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(); // 24時間有効

    // preferences にトークンと有効期限、強制変更フラグを保存
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
// 2. パスワード再設定トークン検証 API (GET /users/reset-password/verify)
// =============================================================
const verifyResetPaths = [
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
    const uRes = await pool.request().input('id', sql.VarChar, matchedUserId).query('SELECT id, name, loginId, email FROM dbo.Users WHERE id = @id');
    const user = (uRes.recordset && uRes.recordset[0]) || { id: matchedUserId, name: 'メンバー' };

    res.json({
      success: true,
      user: {
        id: user.id,
        name: user.name,
        loginId: user.loginId,
        email: user.email
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 3. パスワード再設定実行 API (POST /users/reset-password)
// =============================================================
const executeResetPaths = [
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

    const pool = await getPool();
    const uColRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
    const userCols = new Set((uColRes.recordset || []).map(r => r.COLUMN_NAME.toLowerCase()));
    const hasMustChangeCol = userCols.has('mustchangepassword');

    // パスワード更新
    if (hasMustChangeCol) {
      await pool.request()
        .input('id', sql.VarChar, matchedUserId)
        .input('password', sql.VarChar, newPassword)
        .input('mustChangePassword', sql.Bit, 0)
        .query('UPDATE dbo.Users SET password = @password, mustChangePassword = @mustChangePassword WHERE id = @id');
    } else {
      await pool.request()
        .input('id', sql.VarChar, matchedUserId)
        .input('password', sql.VarChar, newPassword)
        .query('UPDATE dbo.Users SET password = @password WHERE id = @id');
    }

    // トークン削除 & フラグクリア
    delete matchedPref.resetPasswordToken;
    delete matchedPref.resetPasswordExpires;
    matchedPref.mustChangePassword = false;
    matchedPref.passwordChangedAt = new Date().toISOString();
    saveUserPrefs(matchedUserId, matchedPref);

    const userRes = await pool.request().input('id', sql.VarChar, matchedUserId).query('SELECT * FROM dbo.Users WHERE id = @id');
    const user = userRes.recordset && userRes.recordset[0];

    res.json({
      success: true,
      message: 'パスワードを設定しました。新しいパスワードでログインしてください。',
      user
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 4. 初回ログイン時・強制パスワード変更 API (POST /users/force-change-password)
// =============================================================
const forceChangePaths = [
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
    const uColRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
    const userCols = new Set((uColRes.recordset || []).map(r => r.COLUMN_NAME.toLowerCase()));
    const hasMustChangeCol = userCols.has('mustchangepassword');

    const uRes = await pool.request().input('id', sql.VarChar, userId).query('SELECT * FROM dbo.Users WHERE id = @id');
    if (!uRes.recordset || uRes.recordset.length === 0) {
      return res.status(404).json({ error: 'ユーザーが見つかりません' });
    }
    const user = uRes.recordset[0];

    if (currentPassword && user.password && user.password !== currentPassword) {
      return res.status(400).json({ error: '現在のパスワードが一致しません' });
    }

    if (hasMustChangeCol) {
      await pool.request()
        .input('id', sql.VarChar, userId)
        .input('password', sql.VarChar, newPassword)
        .input('mustChangePassword', sql.Bit, 0)
        .query('UPDATE dbo.Users SET password = @password, mustChangePassword = @mustChangePassword WHERE id = @id');
    } else {
      await pool.request()
        .input('id', sql.VarChar, userId)
        .input('password', sql.VarChar, newPassword)
        .query('UPDATE dbo.Users SET password = @password WHERE id = @id');
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
        password: newPassword,
        mustChangePassword: false
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
