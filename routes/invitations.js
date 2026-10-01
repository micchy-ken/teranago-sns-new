/**
 * routes/invitations.js
 * 寺岡オートドアSNS ユーザー招待管理モジュール (Express Router & MS SQL Server & JSON Dual Persistence)
 * 最終更新: 2026年10月1日 (ユニークRESTfulパス完全対応版)
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
const invitationsFile = path.join(dataDir, 'invitations.json');
const userPrefsFile = path.join(dataDir, 'user_preferences.json');

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
    console.log(`[Mail:Invitations] Sent to ${to}: ${info.messageId}`);
    return info;
  } catch (err) {
    console.warn(`[Mail:Invitations] Send error to ${to}:`, err.message);
    return { simulated: true, error: err.message };
  }
}

// =============================================================
// JSON永続化ヘルパー (Fallback & 二重保存)
// =============================================================
function loadInvitations() {
  try {
    if (fs.existsSync(invitationsFile)) {
      const content = fs.readFileSync(invitationsFile, 'utf8');
      return JSON.parse(content) || [];
    }
  } catch (e) {
    console.warn('[Invitations] Failed to read invitations.json:', e.message);
  }
  return [];
}

function saveInvitations(invitations) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(invitationsFile, JSON.stringify(invitations, null, 2), 'utf8');
  } catch (e) {
    console.error('[Invitations] Failed to write invitations.json:', e.message);
  }
}

function saveUserPrefs(userId, prefs) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    let all = {};
    if (fs.existsSync(userPrefsFile)) {
      try {
        all = JSON.parse(fs.readFileSync(userPrefsFile, 'utf8')) || {};
      } catch (_) {}
    }
    all[String(userId)] = {
      ...(all[String(userId)] || {}),
      ...prefs,
      updatedAt: new Date().toISOString()
    };
    fs.writeFileSync(userPrefsFile, JSON.stringify(all, null, 2), 'utf8');
  } catch (e) {
    console.error('[Invitations] Failed to write user_preferences.json:', e.message);
  }
}

// =============================================================
// SQL Server dbo.UserInvitations ヘルパー
// =============================================================
let hasUserInvitationsTable = null;

async function checkUserInvitationsTable(pool) {
  if (hasUserInvitationsTable !== null) return hasUserInvitationsTable;
  try {
    const res = await pool.request().query("SELECT OBJECT_ID('dbo.UserInvitations', 'U') AS tblId");
    hasUserInvitationsTable = Boolean(res.recordset && res.recordset[0] && res.recordset[0].tblId);
  } catch (err) {
    console.warn('[Invitations] Table check failed:', err.message);
    hasUserInvitationsTable = false;
  }
  return hasUserInvitationsTable;
}

// =============================================================
// 1. ユーザー一括招待送信 API (POST /invitations & POST /invitations/send)
// =============================================================
const invitePaths = [
  '/invitations',
  '/invitations/',
  '/invitations/send',
  '/invitations/send/',
  '/api/invitations',
  '/api/invitations/',
  '/api/invitations/send',
  '/users/invite',
  '/users/invite/',
  '/api/users/invite',
  '/api/users/invite/'
];

router.post(invitePaths, async (req, res) => {
  try {
    const {
      emails,
      role = 'user',
      office = '',
      division = '',
      position = '',
      department = '',
      expiresInDays = 7,
      createdByName = '管理者',
      baseUrl
    } = req.body || {};

    let emailList = [];
    if (Array.isArray(emails)) {
      emailList = emails;
    } else if (typeof emails === 'string') {
      emailList = emails
        .split(/[\n,;]+/)
        .map(e => e.trim())
        .filter(e => e.length > 0);
    }

    const validEmails = Array.from(new Set(
      emailList
        .map(e => e.toLowerCase().trim())
        .filter(e => e.includes('@') && e.includes('.'))
    ));

    if (validEmails.length === 0) {
      return res.status(400).json({ error: '有効な招待先メールアドレスを1件以上指定してください。' });
    }

    const appBaseUrl = baseUrl || 'https://micchy-ken.github.io/teranago-sns-new/';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + (Number(expiresInDays) || 7) * 24 * 60 * 60 * 1000).toISOString();
    const existingInvitations = loadInvitations();
    const createdInvitations = [];
    const mailResults = [];

    const pool = await getPool();
    const hasTable = pool ? await checkUserInvitationsTable(pool) : false;

    for (const email of validEmails) {
      const token = crypto.randomBytes(24).toString('hex');
      const invId = `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
      const deptString = department || [office, division, position].filter(Boolean).join(' ');

      const newInv = {
        id: invId,
        email,
        token,
        role: role === 'admin' ? 'admin' : 'user',
        office: office || '',
        division: division || '',
        position: position || '',
        department: deptString,
        expiresAt,
        status: 'pending',
        createdAt: now.toISOString(),
        createdByName: createdByName || '管理者'
      };

      // 既存のpending招待をrevokedに更新
      existingInvitations.forEach(inv => {
        if (inv.email.toLowerCase() === email.toLowerCase() && inv.status === 'pending') {
          inv.status = 'revoked';
          inv.revokedAt = now.toISOString();
        }
      });

      existingInvitations.unshift(newInv);
      createdInvitations.push(newInv);

      // SQL Server へ保存
      if (hasTable) {
        try {
          await pool.request()
            .input('oldEmail', sql.NVarChar, email)
            .query("UPDATE dbo.UserInvitations SET status = 'revoked', revokedAt = GETDATE() WHERE LOWER(email) = LOWER(@oldEmail) AND status = 'pending'");

          await pool.request()
            .input('id', sql.VarChar, invId)
            .input('email', sql.NVarChar, email)
            .input('token', sql.VarChar, token)
            .input('role', sql.VarChar, newInv.role)
            .input('office', sql.NVarChar, newInv.office)
            .input('division', sql.NVarChar, newInv.division)
            .input('position', sql.NVarChar, newInv.position)
            .input('department', sql.NVarChar, newInv.department)
            .input('status', sql.VarChar, 'pending')
            .input('expiresAt', sql.DateTime, new Date(expiresAt))
            .input('createdByName', sql.NVarChar, newInv.createdByName)
            .query(`
              INSERT INTO dbo.UserInvitations (id, email, token, role, office, division, position, department, status, expiresAt, createdByName, createdAt)
              VALUES (@id, @email, @token, @role, @office, @division, @position, @department, @status, @expiresAt, @createdByName, GETDATE())
            `);
        } catch (dbErr) {
          console.warn('[Invitations] SQL Server insert failed, fallback to JSON:', dbErr.message);
        }
      }

      // 招待URL
      const inviteUrl = `${appBaseUrl}${appBaseUrl.includes('?') ? '&' : '?'}mode=invite&token=${token}`;

      const subject = `【TERANAGO SNS】社内ポータルへの招待が届きました`;
      const text = `${email} 様\n\n${createdByName}様より、TERANAGO 社内SNS・グループウェアへの招待が届いています。\n以下のリンクを開き、アカウントの初期設定（氏名・パスワード設定等）を完了してください。\n\n▼ アカウント初期登録URL:\n${inviteUrl}\n\n※有効期限: ${new Date(expiresAt).toLocaleDateString('ja-JP')} まで\n※心当たりのない場合は本メールを破棄してください。`;
      
      const html = `
        <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color: #ffffff; padding: 24px; text-align: center;">
            <h2 style="margin: 0; font-size: 20px; font-weight: 700;">TERANAGO 社内ポータルへようこそ</h2>
            <p style="margin: 6px 0 0 0; font-size: 13px; opacity: 0.9;">メンバー招待のお知らせ</p>
          </div>
          <div style="padding: 24px; color: #334155; line-height: 1.6; font-size: 14px;">
            <p style="margin-top: 0;"><b>${email}</b> 様</p>
            <p><b>${createdByName}</b> 様より、社内SNS・グループウェアへの招待が届きました。</p>
            <p>下のボタンをクリックして、氏名やログインパスワード等の必須項目を設定し、アカウントを開設してください。</p>
            
            <div style="text-align: center; margin: 28px 0;">
              <a href="${inviteUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px; box-shadow: 0 4px 6px -1px rgba(79, 70, 229, 0.2);">
                👉 アカウントを登録して参加する
              </a>
            </div>

            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 12px 16px; font-size: 12px; color: #64748b;">
              <p style="margin: 0 0 4px 0;"><b>ボタンが開けない場合:</b> 以下のURLをブラウザに直接貼り付けてください。</p>
              <p style="margin: 0; word-break: break-all; color: #4f46e5;">${inviteUrl}</p>
              <p style="margin: 8px 0 0 0; color: #e11d48;">※有効期限: <b>${new Date(expiresAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</b> まで</p>
            </div>
          </div>
          <div style="border-top: 1px solid #f1f5f9; padding: 14px 24px; font-size: 11px; color: #94a3b8; text-align: center; background-color: #fafafa;">
            TERANAGO 社内SNSシステム 自動配信メール
          </div>
        </div>
      `;

      try {
        const mailRes = await sendMail({ to: email, subject, text, html });
        mailResults.push({ email, success: true, messageId: mailRes?.messageId, simulated: mailRes?.simulated });
      } catch (err) {
        mailResults.push({ email, success: false, error: err.message });
      }
    }

    saveInvitations(existingInvitations);

    res.json({
      success: true,
      message: `${createdInvitations.length}件の招待を送信しました。`,
      sentCount: createdInvitations.length,
      invitations: createdInvitations,
      mailResults
    });
  } catch (err) {
    console.error('[Invitations] Invite error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 2. 招待一覧取得 API (GET /invitations)
// =============================================================
const listPaths = [
  '/invitations',
  '/invitations/',
  '/api/invitations',
  '/api/invitations/',
  '/users/invitations',
  '/users/invitations/',
  '/api/users/invitations',
  '/api/users/invitations/'
];

router.get(listPaths, async (req, res) => {
  try {
    const pool = await getPool();
    const hasTable = pool ? await checkUserInvitationsTable(pool) : false;

    if (hasTable) {
      try {
        const result = await pool.request().query('SELECT * FROM dbo.UserInvitations ORDER BY createdAt DESC');
        const now = Date.now();
        const records = (result.recordset || []).map(inv => {
          if (inv.status === 'pending' && new Date(inv.expiresAt).getTime() < now) {
            return { ...inv, status: 'expired' };
          }
          return inv;
        });
        return res.json(records);
      } catch (dbErr) {
        console.warn('[Invitations] SQL query failed, falling back to JSON:', dbErr.message);
      }
    }

    const list = loadInvitations();
    const now = Date.now();
    const mapped = list.map(inv => {
      if (inv.status === 'pending' && new Date(inv.expiresAt).getTime() < now) {
        return { ...inv, status: 'expired' };
      }
      return inv;
    });
    res.json(mapped);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 3. 招待取消 API (POST & DELETE /invitations/:id/cancel)
// =============================================================
const cancelInvitePaths = [
  '/invitations/:id/cancel',
  '/api/invitations/:id/cancel',
  '/invitations/:id',
  '/api/invitations/:id',
  '/users/invitations/:id/cancel',
  '/api/users/invitations/:id/cancel',
  '/users/invitations/:id',
  '/api/users/invitations/:id'
];

async function cancelInviteHandler(req, res) {
  try {
    const invId = req.params.id;
    const pool = await getPool();
    const hasTable = pool ? await checkUserInvitationsTable(pool) : false;

    if (hasTable) {
      try {
        await pool.request()
          .input('id', sql.VarChar, invId)
          .query("UPDATE dbo.UserInvitations SET status = 'revoked', revokedAt = GETDATE() WHERE id = @id");
      } catch (err) {}
    }

    const list = loadInvitations();
    const target = list.find(i => i.id === invId);
    if (target) {
      target.status = 'revoked';
      target.revokedAt = new Date().toISOString();
      saveInvitations(list);
    }

    res.json({ success: true, message: '招待を取り消しました', invitation: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}

router.post(cancelInvitePaths, cancelInviteHandler);
router.delete(cancelInvitePaths, cancelInviteHandler);

// =============================================================
// 4. 招待再送 API (POST /invitations/:id/resend)
// =============================================================
const resendPaths = [
  '/invitations/:id/resend',
  '/api/invitations/:id/resend',
  '/users/invitations/:id/resend',
  '/api/users/invitations/:id/resend'
];

router.post(resendPaths, async (req, res) => {
  try {
    const invId = req.params.id;
    const { baseUrl } = req.body || {};
    const pool = await getPool();
    const hasTable = pool ? await checkUserInvitationsTable(pool) : false;

    const list = loadInvitations();
    let target = list.find(i => i.id === invId);

    if (hasTable) {
      const qRes = await pool.request().input('id', sql.VarChar, invId).query('SELECT * FROM dbo.UserInvitations WHERE id = @id');
      if (qRes.recordset && qRes.recordset.length > 0) {
        target = qRes.recordset[0];
      }
    }

    if (!target) {
      return res.status(404).json({ error: '招待が見つかりません' });
    }

    const appBaseUrl = baseUrl || 'https://micchy-ken.github.io/teranago-sns-new/';
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
    const token = crypto.randomBytes(24).toString('hex');

    target.token = token;
    target.expiresAt = expiresAt;
    target.status = 'pending';
    target.updatedAt = now.toISOString();

    if (hasTable) {
      try {
        await pool.request()
          .input('id', sql.VarChar, invId)
          .input('token', sql.VarChar, token)
          .input('expiresAt', sql.DateTime, new Date(expiresAt))
          .query("UPDATE dbo.UserInvitations SET token = @token, expiresAt = @expiresAt, status = 'pending', updatedAt = GETDATE() WHERE id = @id");
      } catch (_) {}
    }

    saveInvitations(list);

    const inviteUrl = `${appBaseUrl}${appBaseUrl.includes('?') ? '&' : '?'}mode=invite&token=${token}`;
    const subject = `【再送】【TERANAGO SNS】社内ポータルへの招待が届きました`;
    const text = `${target.email} 様\n\nTERANAGO 社内SNS・グループウェアへの招待リンクを再送いたします。\n以下のリンクを開き、アカウント初期設定を完了してください。\n\n▼ アカウント初期登録URL:\n${inviteUrl}\n\n※有効期限: ${new Date(expiresAt).toLocaleDateString('ja-JP')} まで`;
    const html = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e2e8f0; border-radius: 12px; overflow: hidden; background: #ffffff;">
        <div style="background: linear-gradient(135deg, #4f46e5 0%, #3b82f6 100%); color: #ffffff; padding: 24px; text-align: center;">
          <h2 style="margin: 0; font-size: 20px; font-weight: 700;">【再送】TERANAGO 社内ポータルへの招待</h2>
        </div>
        <div style="padding: 24px; color: #334155; line-height: 1.6; font-size: 14px;">
          <p><b>${target.email}</b> 様</p>
          <p>社内SNS・グループウェアへの招待リンクを再送いたします。下のボタンより登録を完了してください。</p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${inviteUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: bold; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-size: 15px;">
              👉 アカウントを登録して参加する
            </a>
          </div>
          <p style="font-size: 12px; color: #64748b;">有効期限: <b>${new Date(expiresAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</b> まで</p>
        </div>
      </div>
    `;

    await sendMail({ to: target.email, subject, text, html });

    res.json({ success: true, message: '招待メールを再送しました', invitation: target });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 5. 招待トークン検証 API (GET /invitations/verify)
// =============================================================
const verifyPaths = [
  '/invitations/verify',
  '/invitations/verify/',
  '/api/invitations/verify',
  '/api/invitations/verify/',
  '/users/invite/verify',
  '/users/invite/verify/',
  '/api/users/invite/verify',
  '/api/users/invite/verify/'
];

router.get(verifyPaths, async (req, res) => {
  try {
    const token = req.query.token || req.query.t;
    if (!token) {
      return res.status(400).json({ error: 'トークンが指定されていません' });
    }

    const pool = await getPool();
    const hasTable = pool ? await checkUserInvitationsTable(pool) : false;
    let target = null;

    if (hasTable) {
      const qRes = await pool.request().input('token', sql.VarChar, String(token)).query('SELECT * FROM dbo.UserInvitations WHERE token = @token');
      if (qRes.recordset && qRes.recordset.length > 0) {
        target = qRes.recordset[0];
      }
    }

    if (!target) {
      const list = loadInvitations();
      target = list.find(i => i.token === token);
    }

    if (!target) {
      return res.status(404).json({ error: '無効な招待リンクです。URLをご確認ください。' });
    }

    if (target.status === 'accepted') {
      return res.status(400).json({ error: 'この招待はすでに登録が完了しています。ログイン画面よりログインしてください。' });
    }

    if (target.status === 'revoked') {
      return res.status(400).json({ error: 'この招待リンクは管理者により取り消されました。' });
    }

    if (new Date(target.expiresAt).getTime() < Date.now()) {
      target.status = 'expired';
      if (hasTable) {
        try {
          await pool.request().input('token', sql.VarChar, String(token)).query("UPDATE dbo.UserInvitations SET status = 'expired' WHERE token = @token");
        } catch (_) {}
      }
      return res.status(400).json({ error: '招待リンクの有効期限が切れています。管理者に再招待を依頼してください。' });
    }

    res.json({
      success: true,
      invitation: {
        id: target.id,
        email: target.email,
        role: target.role || 'user',
        office: target.office || '',
        division: target.division || '',
        position: target.position || '',
        department: target.department || '',
        expiresAt: target.expiresAt
      }
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =============================================================
// 6. 招待からの新規登録完了 API (POST /invitations/complete)
// =============================================================
const completePaths = [
  '/invitations/complete',
  '/invitations/complete/',
  '/api/invitations/complete',
  '/api/invitations/complete/',
  '/users/invite/complete',
  '/users/invite/complete/',
  '/api/users/invite/complete',
  '/api/users/invite/complete/'
];

router.post(completePaths, async (req, res) => {
  try {
    const {
      token,
      name,
      kanaName,
      loginId,
      password,
      office,
      division,
      position,
      avatarUrl,
      mobileEmail,
      mobilePhone,
      phoneExtension
    } = req.body || {};

    if (!token) return res.status(400).json({ error: '招待トークンが必要です' });
    if (!name || !name.trim()) return res.status(400).json({ error: '氏名は必須です' });
    if (!password || password.length < 4) return res.status(400).json({ error: 'パスワードは4文字以上で入力してください' });

    const pool = await getPool();
    const hasTable = pool ? await checkUserInvitationsTable(pool) : false;
    let inv = null;

    if (hasTable) {
      const qRes = await pool.request().input('token', sql.VarChar, String(token)).query('SELECT * FROM dbo.UserInvitations WHERE token = @token');
      if (qRes.recordset && qRes.recordset.length > 0) {
        inv = qRes.recordset[0];
      }
    }

    const list = loadInvitations();
    const jsonInv = list.find(i => i.token === token);
    if (!inv) inv = jsonInv;

    if (!inv || inv.status !== 'pending') {
      return res.status(400).json({ error: '招待リンクが無効または既に使用されています' });
    }
    if (new Date(inv.expiresAt).getTime() < Date.now()) {
      return res.status(400).json({ error: '招待リンクの有効期限が切れています' });
    }

    // テーブルカラムの検出
    const uColRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'Users'");
    const userCols = new Set((uColRes.recordset || []).map(r => r.COLUMN_NAME.toLowerCase()));
    const hasRolesCol = userCols.has('roles');
    const hasCol = userCols.has('preferences');
    const hasMustChangeCol = userCols.has('mustchangepassword');

    const newUserId = `u-${Date.now()}`;
    const finalLoginId = (loginId || '').trim() || inv.email.split('@')[0] || `user_${Date.now().toString().slice(-4)}`;
    const finalOffice = office || inv.office || '';
    const finalDivision = division || inv.division || '';
    const finalPosition = position || inv.position || '';
    const deptString = [finalOffice, finalDivision, finalPosition].filter(Boolean).join(' ') || inv.department || '未設定';
    const finalRole = inv.role || 'user';
    const isAdmin = finalRole === 'admin';

    const userObj = {
      id: newUserId,
      loginId: finalLoginId,
      password: password,
      name: name.trim(),
      kanaName: (kanaName || '').trim(),
      department: deptString,
      office: finalOffice,
      division: finalDivision,
      position: finalPosition,
      role: finalRole,
      isAdmin,
      avatarUrl: avatarUrl || '',
      email: inv.email,
      mobileEmail: (mobileEmail || '').trim(),
      mobilePhone: (mobilePhone || '').trim(),
      phoneExtension: (phoneExtension || '').trim(),
      phone: (mobilePhone || '').trim() || '',
      mustChangePassword: false,
      roles: [finalRole],
      preferences: {
        roles: [finalRole],
        invitedAt: new Date().toISOString()
      }
    };

    const reqBuilder = pool.request()
      .input('id', sql.VarChar, newUserId)
      .input('loginId', sql.VarChar, finalLoginId)
      .input('password', sql.VarChar, password)
      .input('name', sql.NVarChar, userObj.name)
      .input('kanaName', sql.NVarChar, userObj.kanaName)
      .input('department', sql.NVarChar, userObj.department)
      .input('office', sql.NVarChar, userObj.office)
      .input('division', sql.NVarChar, userObj.division)
      .input('position', sql.NVarChar, userObj.position)
      .input('role', sql.VarChar, userObj.role)
      .input('isAdmin', sql.Bit, isAdmin ? 1 : 0)
      .input('avatarUrl', sql.NVarChar, userObj.avatarUrl)
      .input('email', sql.NVarChar, userObj.email)
      .input('mobileEmail', sql.NVarChar, userObj.mobileEmail)
      .input('phone', sql.NVarChar, userObj.phone)
      .input('phoneOutside', sql.NVarChar, '')
      .input('phoneExtension', sql.NVarChar, userObj.phoneExtension)
      .input('mobilePhone', sql.NVarChar, userObj.mobilePhone)
      .input('icalUrl', sql.NVarChar, '')
      .input('supervisorId', sql.VarChar, null);

    if (hasRolesCol) reqBuilder.input('roles', sql.NVarChar, JSON.stringify([finalRole]));
    if (hasCol) reqBuilder.input('preferences', sql.NVarChar, JSON.stringify(userObj.preferences));
    if (hasMustChangeCol) reqBuilder.input('mustChangePassword', sql.Bit, 0);

    const insertCols = [
      'id', 'loginId', 'password', 'name', 'kanaName', 'department', 'office', 'division', 'position',
      'role', 'isAdmin', 'avatarUrl', 'email', 'mobileEmail', 'phone', 'phoneOutside', 'phoneExtension', 'mobilePhone', 'icalUrl', 'supervisorId'
    ];
    const insertVals = [
      '@id', '@loginId', '@password', '@name', '@kanaName', '@department', '@office', '@division', '@position',
      '@role', '@isAdmin', '@avatarUrl', '@email', '@mobileEmail', '@phone', '@phoneOutside', '@phoneExtension', '@mobilePhone', '@icalUrl', '@supervisorId'
    ];
    if (hasRolesCol) { insertCols.push('roles'); insertVals.push('@roles'); }
    if (hasCol) { insertCols.push('preferences'); insertVals.push('@preferences'); }
    if (hasMustChangeCol) { insertCols.push('mustChangePassword'); insertVals.push('@mustChangePassword'); }

    await reqBuilder.query(`INSERT INTO dbo.Users (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')})`);

    // ローカル preferences 保存
    saveUserPrefs(newUserId, userObj.preferences);

    // 招待ステータスを accepted に更新
    if (hasTable) {
      try {
        await pool.request()
          .input('token', sql.VarChar, String(token))
          .input('acceptedUserId', sql.VarChar, newUserId)
          .query("UPDATE dbo.UserInvitations SET status = 'accepted', acceptedAt = GETDATE(), acceptedUserId = @acceptedUserId WHERE token = @token");
      } catch (_) {}
    }

    if (jsonInv) {
      jsonInv.status = 'accepted';
      jsonInv.acceptedAt = new Date().toISOString();
      jsonInv.acceptedUserId = newUserId;
      saveInvitations(list);
    }

    res.json({
      success: true,
      message: 'アカウント登録が完了しました。',
      user: userObj
    });
  } catch (err) {
    console.error('[Invitations] Invite complete error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
