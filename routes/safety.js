/**
 * routes/safety.js (本番環境・MS SQL Server & 暗号化完全連携版)
 * 寺岡オートドアSNS 安否確認モジュール (MS SQL Server & AES-256-GCM暗号化対応)
 * 最終更新: 2026年8月28日 (回答直通URL・集計ダッシュボード個別削除・リマインド・個人メール登録対応 完全版)
 */
import { Router } from 'express';
import crypto from 'crypto';
import sql from 'mssql';
import { getPool } from '../db.js';
import { sendEmailNotification } from './email.js';

const router = Router();

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

// -------------------------------------------------------------
// 1. 安否確認イベント一覧取得
// 対応URL: /api/safety-events, /api/safety/events, /api/events
// -------------------------------------------------------------
router.get(['/safety-events', '/safety-events/', '/safety/events', '/safety/events/', '/events', '/events/'], async (req, res) => {
  try {
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query('SELECT * FROM dbo.SafetyEvents ORDER BY createdAt DESC');
      return res.json(result.recordset || []);
    }
    res.json([]);
  } catch (err) {
    console.error('Fetch safety events error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 1-2. 特定の安否確認イベント詳細取得
// 対応URL: /api/safety-events/:id, /api/safety/events/:id, /api/events/:id
// -------------------------------------------------------------
router.get(['/safety-events/:id', '/safety-events/:id/', '/safety/events/:id', '/safety/events/:id/', '/events/:id', '/events/:id/'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (pool) {
      const result = await pool.request()
        .input('id', sql.NVarChar(100), id)
        .query('SELECT * FROM dbo.SafetyEvents WHERE id = @id');
      if (result.recordset && result.recordset.length > 0) {
        return res.json(result.recordset[0]);
      }
      return res.status(404).json({ error: '安否確認イベントが見つかりません。' });
    }
    res.status(404).json({ error: '安否確認イベントが見つかりません。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 2. 安否確認の一斉発動 (回答用URL・直通ボタン付きメール配信)
// 対応URL: /api/safety-events, /api/safety/events, /api/events
// -------------------------------------------------------------
router.post(['/safety-events', '/safety-events/', '/safety/events', '/safety/events/', '/events', '/events/'], async (req, res) => {
  try {
    const {
      title,
      type,
      disasterType,
      severity,
      level,
      targetOffice,
      targetDivision,
      targetScope = 'all',
      targetOffices,
      targetDivisions,
      message,
      notifyWebPush = true,
      notifyCompanyEmail = true,
      notifyPersonalEmail = true,
      channels,
      isDrill = false,
      isTest = false,
      appBaseUrl,
      createdBy,
      createdById,
      createdByName
    } = req.body || {};

    const eventType = type || disasterType || 'earthquake';
    const eventSeverity = severity || level || 'warning';
    const eventOffice = targetOffice || (targetOffices && targetOffices[0]) || '全社';
    const eventDivision = targetDivision || (targetDivisions && targetDivisions[0]) || '全部署';
    const pushFlag = channels?.webPush !== undefined ? channels.webPush : !!notifyWebPush;
    const compMailFlag = channels?.companyEmail !== undefined ? channels.companyEmail : !!notifyCompanyEmail;
    const persMailFlag = channels?.personalEmail !== undefined ? channels.personalEmail : !!notifyPersonalEmail;
    const drillFlag = !!(isDrill || isTest);

    const newId = `safety_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const pool = await getPool();
    let targetUsers = [];

    if (pool) {
      // ① イベントのDB登録
      await pool.request()
        .input('id', sql.NVarChar(100), newId)
        .input('title', sql.NVarChar(200), title || '緊急安否確認')
        .input('type', sql.NVarChar(50), eventType)
        .input('severity', sql.NVarChar(50), eventSeverity)
        .input('targetOffice', sql.NVarChar(100), eventOffice)
        .input('targetDivision', sql.NVarChar(100), eventDivision)
        .input('message', sql.NVarChar(sql.MAX), message || '')
        .input('notifyWebPush', sql.Bit, pushFlag ? 1 : 0)
        .input('notifyCompanyEmail', sql.Bit, compMailFlag ? 1 : 0)
        .input('notifyPersonalEmail', sql.Bit, persMailFlag ? 1 : 0)
        .input('isDrill', sql.Bit, drillFlag ? 1 : 0)
        .input('status', sql.NVarChar(50), 'active')
        .input('createdBy', sql.NVarChar(100), createdBy || createdById || 'admin')
        .input('createdByName', sql.NVarChar(100), createdByName || '管理者')
        .input('createdAt', sql.DateTimeOffset, nowIso)
        .input('updatedAt', sql.DateTimeOffset, nowIso)
        .query(`
          INSERT INTO dbo.SafetyEvents (id, title, type, severity, targetOffice, targetDivision, message, notifyWebPush, notifyCompanyEmail, notifyPersonalEmail, isDrill, status, createdBy, createdByName, createdAt, updatedAt)
          VALUES (@id, @title, @type, @severity, @targetOffice, @targetDivision, @message, @notifyWebPush, @notifyCompanyEmail, @notifyPersonalEmail, @isDrill, @status, @createdBy, @createdByName, @createdAt, @updatedAt)
        `);

      // ② 対象ユーザー一覧の取得
      const usersResult = await pool.request().query('SELECT * FROM dbo.Users');
      const allUsers = (usersResult.recordset || []).map(u => ({
        id: String(u.id),
        name: u.name,
        email: u.email,
        mobileEmail: u.mobileEmail || u.mobile_email || '',
        personalEmailEncrypted: u.personalEmailEncrypted || u.personal_email_encrypted || '',
        office: u.office || '',
        division: u.division || u.department || ''
      }));

      targetUsers = allUsers.filter((u) => {
        const uOffice = u.office || '';
        const uDivision = u.division || '';
        if (targetScope === 'offices' && targetOffices && targetOffices.length > 0) {
          return targetOffices.includes(uOffice);
        }
        if (targetScope === 'divisions' && targetDivisions && targetDivisions.length > 0) {
          return targetDivisions.includes(uDivision);
        }
        const matchOffice = (!targetOffice || targetOffice === '全社' || uOffice === targetOffice);
        const matchDivision = (!targetDivision || targetDivision === '全部署' || uDivision === targetDivision);
        return matchOffice && matchDivision;
      });
    }

    // クライアントへ即座に応答
    res.status(201).json({
      success: true,
      eventId: newId,
      event: { id: newId, title, type: eventType, status: 'active' },
      totalTargets: targetUsers.length,
      targetUserCount: targetUsers.length,
      message: '安否確認を発動しました。'
    });

    // バックグラウンドで回答用URL直通リンク付きメール一斉配信
    (async () => {
      if ((compMailFlag || persMailFlag) && targetUsers.length > 0) {
        const resolvedBaseUrl = (appBaseUrl && typeof appBaseUrl === 'string' && appBaseUrl.startsWith('http'))
          ? appBaseUrl.replace(/\/+$/, '')
          : 'https://micchy-ken.github.io/teranago-sns-new';

        const directAnswerLink = `${resolvedBaseUrl}/?tab=safety_confirmation&safetyEventId=${newId}`;
        const nowJst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
        const mailSubject = `【緊急安否確認】${drillFlag ? '【訓練】' : ''}${title}`;

        for (const u of targetUsers) {
          const emailAddresses = [];
          if (compMailFlag) {
            if (u.email && u.email.includes('@')) emailAddresses.push(u.email.trim());
            if (u.mobileEmail && u.mobileEmail.includes('@') && u.mobileEmail.trim() !== u.email?.trim()) {
              emailAddresses.push(u.mobileEmail.trim());
            }
          }
          if (persMailFlag && u.personalEmailEncrypted) {
            const dec = decryptText(u.personalEmailEncrypted);
            if (dec && dec.includes('@') && !emailAddresses.includes(dec)) {
              emailAddresses.push(dec.trim());
            }
          }

          const textBody = `${u.name} 様\n\n【緊急安否確認】${drillFlag ? '【訓練】' : ''}${title}\n\n${message ? `■ 本部からの連絡事項:\n${message}\n\n` : ''}至急、以下のURLを開き現在の安否状況をご回答ください。\n（スマートフォンまたはPCから1タップで簡単に回答・報告できます）\n\n▼ 安否回答用URL:\n${directAnswerLink}\n\n発動日時: ${nowJst}\n発信本部: ${createdByName || '安否確認本部'}`;

          const htmlBody = `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 2px solid #dc2626; border-radius: 16px; background-color: #ffffff; margin: 0 auto;">
              <div style="background-color: #dc2626; color: #ffffff; padding: 16px 20px; border-radius: 12px 12px 0 0; margin: -24px -24px 20px -24px;">
                <h2 style="margin: 0; font-size: 18px; font-weight: 800;">🚨 【緊急安否確認】${drillFlag ? '【訓練】' : ''}${title}</h2>
              </div>
              <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0;">${u.name} 様</p>
              <p style="font-size: 14px; color: #334155;">安否確認が発動されました。身の安全を確保した上で、速やかに以下のURLより現在の安否状況・出社可否をご回答ください。</p>
              ${message ? `
                <div style="background-color: #fef2f2; padding: 14px 16px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 16px 0;">
                  <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #991b1b;">本部からの連絡事項:</p>
                  <p style="margin: 0; font-size: 14px; color: #991b1b; white-space: pre-wrap; font-weight: 600;">${message}</p>
                </div>
              ` : ''}
              <div style="text-align: center; margin: 28px 0; background-color: #fff1f2; padding: 20px; border-radius: 12px; border: 1px dashed #f43f5e;">
                <a href="${directAnswerLink}" style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 15px 36px; font-size: 16px; font-weight: 800; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4);">
                  👉 今すぐ安否状況を回答する (1タップ報告)
                </a>
                <p style="font-size: 12px; color: #475569; margin: 14px 0 4px 0; font-weight: 700;">
                  ※ボタンが開けない場合は下記の回答URLを直接ブラウザで開いてください：
                </p>
                <a href="${directAnswerLink}" style="font-size: 12px; color: #dc2626; word-break: break-all; text-decoration: underline; font-weight: 600;">
                  ${directAnswerLink}
                </a>
              </div>
              <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
                <p style="margin: 0 0 4px 0;"><b>発動日時:</b> ${nowJst}</p>
                <p style="margin: 0;"><b>発信本部:</b> ${createdByName || '安否確認本部'} (寺岡オートドアSNS 安否確認システム)</p>
              </div>
            </div>
          `;

          for (const addr of emailAddresses) {
            try {
              await sendEmailNotification({
                to: addr,
                subject: mailSubject,
                text: textBody,
                html: htmlBody
              });
            } catch (mErr) {
              console.warn(`[Safety Mail Fail] ${addr}:`, mErr.message);
            }
          }
        }
      }
    })().catch((bgErr) => console.error('[Safety Background Delivery Error]:', bgErr));

  } catch (err) {
    console.error('Safety trigger fatal error:', err);
    res.status(500).json({ error: '発動処理エラー: ' + err.message });
  }
});

// -------------------------------------------------------------
// 3. 個人メール（緊急連絡先）登録依頼メール一斉送信
// 対応URL: /api/safety/request-registration, /api/request-registration
// -------------------------------------------------------------
router.post([
  '/safety/request-registration',
  '/safety/request-registration/',
  '/request-registration',
  '/request-registration/'
], async (req, res) => {
  try {
    const {
      userIds = [],
      appBaseUrl,
      customMessage = '',
      sendToCompanyEmail = true,
      sendToMobileEmail = true,
      senderName = '安否確認管理者'
    } = req.body || {};

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: '送信対象の社員が選択されていません。' });
    }

    const pool = await getPool();
    let targetUsers = [];

    if (pool) {
      const usersResult = await pool.request().query('SELECT * FROM dbo.Users');
      const allUsers = (usersResult.recordset || []).map(u => ({
        id: String(u.id),
        name: u.name,
        email: u.email,
        mobileEmail: u.mobileEmail || u.mobile_email || '',
        personalEmailEncrypted: u.personalEmailEncrypted || u.personal_email_encrypted || '',
        office: u.office || '',
        division: u.division || u.department || ''
      }));
      targetUsers = allUsers.filter(u => userIds.includes(String(u.id)));
    }

    if (targetUsers.length === 0) {
      return res.status(404).json({ error: '該当するユーザーが見つかりませんでした。' });
    }

    let baseUrl = appBaseUrl || 'https://micchy-ken.github.io/teranago-sns-new';
    if (baseUrl.endsWith('/')) {
      baseUrl = baseUrl.slice(0, -1);
    }
    const directRegistrationUrl = `${baseUrl}/?tab=mypage&openEmergencyContact=true`;

    let sentCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const u of targetUsers) {
      const targetEmails = [];

      if (sendToCompanyEmail && u.email && u.email.includes('@')) {
        targetEmails.push(u.email.trim());
      }
      if (sendToMobileEmail && u.mobileEmail && u.mobileEmail.includes('@')) {
        const mob = u.mobileEmail.trim();
        if (!targetEmails.includes(mob)) {
          targetEmails.push(mob);
        }
      }

      if (targetEmails.length === 0) {
        skippedCount++;
        results.push({ userId: u.id, name: u.name, sentEmails: [], error: '送信可能なアドレスがありません' });
        continue;
      }

      const nowJst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
      const subject = '【安否確認・緊急連絡先登録のお願い】個人メールアドレスの登録手続きについて';

      const textBody = `${u.name} 様\n\n寺岡オートドアSNS 安否確認システムより、緊急連絡先（個人メールアドレス）登録のお願いです。\n\n大地震や自然災害などの有事発生時、会社のPCメールや携帯電話が使用できない場合でも確実に安否確認通知をお届けできるよう、ご自身の個人メールアドレス（Gmailや携帯キャリアメール等）の事前登録をお願いしております。\n\n${customMessage ? `【連絡事項・依頼メッセージ】\n${customMessage}\n\n` : ''}▼ 以下のリンクをクリックすると、個人設定の緊急連絡先登録画面が直接開きます。\n${directRegistrationUrl}\n\n※ご登録いただいた個人メールアドレスは AES-256-GCM により最高水準で暗号化されて保管され、管理者やデータベース上でも平文は一切表示・閲覧できない仕様となっておりますのでご安心ください。\n\n送信日時: ${nowJst}\n発信元: ${senderName}`;

      const htmlBody = `
        <div style="font-family: sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 1px solid #cbd5e1; border-radius: 12px; background-color: #ffffff; margin: auto;">
          <div style="background-color: #4f46e5; color: #ffffff; padding: 16px 20px; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 700;">
              🛡️ 【安否確認】緊急連絡先（個人メール）登録のお願い
            </h2>
          </div>
          <p style="font-size: 15px; font-weight: 600; color: #0f172a;">${u.name} 様</p>
          <p style="font-size: 14px; color: #334155;">
            大地震や自然災害発生時、会社のPCメールや社用携帯が使用できない場合でも確実に安否確認通知をお届けするため、ご自身の個人メールアドレスの事前登録をお願いいたします。
          </p>
          ${customMessage ? `
            <div style="background-color: #f1f5f9; padding: 12px 16px; border-radius: 8px; border-left: 4px solid #4f46e5; margin: 16px 0;">
              <p style="margin: 0; font-size: 13px; font-weight: 600; color: #334155;">【管理者からのメッセージ】</p>
              <p style="margin: 4px 0 0 0; font-size: 13px; color: #475569; white-space: pre-wrap;">${customMessage}</p>
            </div>
          ` : ''}
          <div style="text-align: center; margin: 28px 0;">
            <a href="${directRegistrationUrl}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; font-weight: 700; font-size: 15px; padding: 12px 28px; border-radius: 8px; text-decoration: none;">
              👉 個人設定を開いて個人メールを登録する
            </a>
          </div>
          <div style="background-color: #ecfdf5; padding: 12px 16px; border-radius: 8px; border: 1px solid #a7f3d0; margin: 16px 0;">
            <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #065f46;">🔒 個人情報の暗号化保護について</p>
            <p style="margin: 0; font-size: 11px; color: #047857; line-height: 1.5;">
              個人メールアドレスは AES-256-GCM で暗号化されて保管され、管理者やデータベース上でも伏字表示され閲覧できない仕組みになっています。
            </p>
          </div>
          <div style="border-top: 1px solid #e2e8f0; padding-top: 12px; font-size: 11px; color: #94a3b8;">
            <p style="margin: 0 0 2px 0;">送信日時: ${nowJst}</p>
            <p style="margin: 0;">発信元: ${senderName}</p>
          </div>
        </div>
      `;

      const sentToThisUser = [];
      for (const addr of targetEmails) {
        try {
          await sendEmailNotification({
            to: addr,
            subject,
            text: textBody,
            html: htmlBody
          });
          sentToThisUser.push(addr);
        } catch (mErr) {
          console.warn(`[RequestRegistration Mail Fail] ${addr}:`, mErr.message);
        }
      }

      if (sentToThisUser.length > 0) {
        sentCount++;
        results.push({ userId: u.id, name: u.name, sentEmails: sentToThisUser });
      } else {
        skippedCount++;
        results.push({ userId: u.id, name: u.name, sentEmails: [], error: '送信失敗' });
      }
    }

    res.json({
      success: true,
      message: `${sentCount} 名の社員宛に登録依頼メールを送信しました。`,
      sentCount,
      skippedCount,
      totalRequested: targetUsers.length,
      directUrl: directRegistrationUrl,
      results
    });
  } catch (err) {
    console.error('Request registration error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 4. 安否回答の送信・更新 (MERGE)
// 対応URL: /api/safety-events/:id/respond, /api/safety/events/:id/respond, /api/events/:id/respond
// -------------------------------------------------------------
router.post([
  '/safety-events/:id/respond',
  '/safety-events/:id/respond/',
  '/safety/events/:id/respond',
  '/safety/events/:id/respond/',
  '/events/:id/respond',
  '/events/:id/respond/',
  '/safety-events/:id/responses',
  '/safety/events/:id/responses',
  '/events/:id/responses'
], async (req, res) => {
  try {
    const { id } = req.params;
    const {
      userId,
      userName,
      userOffice,
      userDivision,
      status,
      safetyStatus,
      familyStatus,
      houseStatus,
      workAvailability,
      canWork,
      currentLocation,
      location,
      comment,
      locationCoordinates
    } = req.body || {};

    const nowIso = new Date().toISOString();
    const respId = `resp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const effectiveStatus = status || safetyStatus || 'safe';
    const effectiveCanWork = canWork || workAvailability || 'available';
    const effectiveLocation = currentLocation || location || '自宅';
    const effectiveOffice = userOffice || req.body?.office || '';
    const effectiveDivision = userDivision || req.body?.division || '';
    const effectiveComment = comment || req.body?.message || '';

    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(100), respId)
        .input('eventId', sql.NVarChar(100), id)
        .input('userId', sql.NVarChar(100), String(userId))
        .input('userName', sql.NVarChar(100), userName || '')
        .input('userOffice', sql.NVarChar(100), effectiveOffice)
        .input('userDivision', sql.NVarChar(100), effectiveDivision)
        .input('status', sql.NVarChar(50), effectiveStatus)
        .input('canWork', sql.NVarChar(50), effectiveCanWork)
        .input('currentLocation', sql.NVarChar(100), effectiveLocation)
        .input('comment', sql.NVarChar(sql.MAX), effectiveComment)
        .input('locationCoordinates', sql.NVarChar(200), locationCoordinates || null)
        .input('respondedAt', sql.DateTimeOffset, nowIso)
        .query(`
          MERGE dbo.SafetyResponses AS target
          USING (SELECT @eventId AS eventId, @userId AS userId) AS source
          ON (target.eventId = source.eventId AND target.userId = source.userId)
          WHEN MATCHED THEN
            UPDATE SET 
              userName = @userName,
              userOffice = @userOffice,
              userDivision = @userDivision,
              status = @status,
              canWork = @canWork,
              currentLocation = @currentLocation,
              comment = @comment,
              locationCoordinates = @locationCoordinates,
              respondedAt = @respondedAt
          WHEN NOT MATCHED THEN
            INSERT (id, eventId, userId, userName, userOffice, userDivision, status, canWork, currentLocation, comment, locationCoordinates, respondedAt)
            VALUES (@id, @eventId, @userId, @userName, @userOffice, @userDivision, @status, @canWork, @currentLocation, @comment, @locationCoordinates, @respondedAt);
        `);
    }
    res.json({
      success: true,
      message: '安否確認の回答を受け付けました。',
      response: {
        id: respId,
        eventId: id,
        userId: String(userId),
        userName: userName || '',
        office: effectiveOffice,
        division: effectiveDivision,
        userOffice: effectiveOffice,
        userDivision: effectiveDivision,
        safetyStatus: effectiveStatus,
        status: effectiveStatus,
        familyStatus: familyStatus || 'all_safe',
        houseStatus: houseStatus || 'no_damage',
        workAvailability: effectiveCanWork,
        canWork: effectiveCanWork,
        locationStatus: effectiveLocation,
        currentLocation: effectiveLocation,
        location: effectiveLocation,
        message: effectiveComment,
        comment: effectiveComment,
        locationCoordinates: locationCoordinates || undefined,
        respondedAt: nowIso
      }
    });
  } catch (err) {
    console.error('Safety respond error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 5. 指定イベントの回答一覧取得
// 対応URL: /api/safety-events/:id/responses, /api/safety/events/:id/responses, /api/events/:id/responses
// -------------------------------------------------------------
router.get([
  '/safety-events/:id/responses',
  '/safety-events/:id/responses/',
  '/safety/events/:id/responses',
  '/safety/events/:id/responses/',
  '/events/:id/responses',
  '/events/:id/responses/'
], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (pool) {
      const result = await pool.request()
        .input('eventId', sql.NVarChar(100), id)
        .query('SELECT * FROM dbo.SafetyResponses WHERE eventId = @eventId ORDER BY respondedAt DESC');
      return res.json(result.recordset || []);
    }
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 6. 未回答者へのリマインド一斉送信 (回答URL直通リンク付き)
// 対応URL: /api/safety-events/:id/remind, /api/safety/events/:id/remind, /api/events/:id/remind
// -------------------------------------------------------------
router.post([
  '/safety-events/:id/remind',
  '/safety-events/:id/remind/',
  '/safety/events/:id/remind',
  '/safety/events/:id/remind/',
  '/events/:id/remind',
  '/events/:id/remind/'
], async (req, res) => {
  try {
    const { id } = req.params;
    const { appBaseUrl, senderName } = req.body || {};

    const pool = await getPool();
    if (!pool) {
      return res.status(500).json({ error: 'DB接続が利用できません。' });
    }

    // イベント情報取得
    const eventRes = await pool.request()
      .input('id', sql.NVarChar(100), id)
      .query('SELECT * FROM dbo.SafetyEvents WHERE id = @id');
    const event = (eventRes.recordset || [])[0];

    if (!event) {
      return res.status(404).json({ error: '対象の安否確認イベントが見つかりません。' });
    }

    // 回答済みユーザー取得
    const respRes = await pool.request()
      .input('eventId', sql.NVarChar(100), id)
      .query('SELECT userId FROM dbo.SafetyResponses WHERE eventId = @eventId');
    const answeredUserIds = new Set((respRes.recordset || []).map(r => String(r.userId)));

    // 全ユーザーから対象かつ未回答のユーザーを抽出
    const usersRes = await pool.request().query('SELECT * FROM dbo.Users');
    const allUsers = (usersRes.recordset || []).map(u => ({
      id: String(u.id),
      name: u.name,
      email: u.email,
      mobileEmail: u.mobileEmail || u.mobile_email || '',
      personalEmailEncrypted: u.personalEmailEncrypted || u.personal_email_encrypted || '',
      office: u.office || '',
      division: u.division || u.department || ''
    }));

    const targetUsers = allUsers.filter((u) => {
      const matchOffice = (!event.targetOffice || event.targetOffice === '全社' || u.office === event.targetOffice);
      const matchDivision = (!event.targetDivision || event.targetDivision === '全部署' || u.division === event.targetDivision);
      return matchOffice && matchDivision;
    });

    const unansweredUsers = targetUsers.filter(u => !answeredUserIds.has(String(u.id)));

    if (unansweredUsers.length === 0) {
      return res.json({
        success: true,
        message: '対象の全社員が回答済みです。未回答者はいません。',
        remindedCount: 0
      });
    }

    const resolvedBaseUrl = (appBaseUrl && typeof appBaseUrl === 'string' && appBaseUrl.startsWith('http'))
      ? appBaseUrl.replace(/\/+$/, '')
      : 'https://micchy-ken.github.io/teranago-sns-new';

    const directAnswerLink = `${resolvedBaseUrl}/?tab=safety_confirmation&safetyEventId=${event.id}`;
    const nowJst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    let remindedCount = 0;
    const mailSubject = `【再送・至急】⚠️【安否確認】未回答の確認 (${event.title})`;

    for (const u of unansweredUsers) {
      const emailAddresses = [];
      if (u.email && u.email.includes('@')) emailAddresses.push(u.email.trim());
      if (u.mobileEmail && u.mobileEmail.includes('@') && !emailAddresses.includes(u.mobileEmail.trim())) {
        emailAddresses.push(u.mobileEmail.trim());
      }
      if (u.personalEmailEncrypted) {
        const dec = decryptText(u.personalEmailEncrypted);
        if (dec && dec.includes('@') && !emailAddresses.includes(dec)) {
          emailAddresses.push(dec.trim());
        }
      }

      if (emailAddresses.length === 0) continue;

      const textBody = `${u.name} 様\n\n【安否確認システムからの再送連絡】\n\n発動中の安否確認（${event.title}）について、まだ回答が確認できておりません。\n\n身の安全を確保した上で、至急以下のURLより安否状況をご回答ください。\n\n▼ 安否回答用URL:\n${directAnswerLink}\n\n発動本部: ${senderName || event.createdByName || '安否確認本部'}\n送信日時: ${nowJst}`;

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 2px solid #e11d48; border-radius: 16px; background-color: #ffffff; margin: 0 auto;">
          <div style="background-color: #e11d48; color: #ffffff; padding: 16px 20px; border-radius: 12px 12px 0 0; margin: -24px -24px 20px -24px;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 800;">⚠️ 【再送・至急】安否状況のご回答をお願いします</h2>
          </div>
          <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0;">${u.name} 様</p>
          <p style="font-size: 14px; color: #334155;">
            発動中の安否確認<strong>「${event.title}」</strong>について、まだご回答をいただいておりません。<br>
            会社の安全確認および支援体制確保のため、至急現在の状況をご回答ください。
          </p>
          <div style="text-align: center; margin: 28px 0; background-color: #fff1f2; padding: 20px; border-radius: 12px; border: 1px dashed #f43f5e;">
            <a href="${directAnswerLink}" style="display: inline-block; background-color: #e11d48; color: #ffffff; padding: 15px 36px; font-size: 16px; font-weight: 800; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.4);">
              👉 今すぐ安否状況を回答する
            </a>
            <p style="font-size: 12px; color: #475569; margin: 14px 0 4px 0; font-weight: 700;">
              ※ボタンが開けない場合は下記の回答URLを直接開いてください：
            </p>
            <a href="${directAnswerLink}" style="font-size: 12px; color: #e11d48; word-break: break-all; text-decoration: underline; font-weight: 600;">
              ${directAnswerLink}
            </a>
          </div>
          <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
            <p style="margin: 0 0 4px 0;">送信日時: ${nowJst}</p>
            <p style="margin: 0;">発信元: ${senderName || event.createdByName || '安否確認本部'}</p>
          </div>
        </div>
      `;

      let sentSuccess = false;
      for (const addr of emailAddresses) {
        try {
          await sendEmailNotification({
            to: addr,
            subject: mailSubject,
            text: textBody,
            html: htmlBody
          });
          sentSuccess = true;
        } catch (mErr) {
          console.warn(`[Safety Remind Fail] ${addr}:`, mErr.message);
        }
      }
      if (sentSuccess) remindedCount++;
    }

    res.json({
      success: true,
      message: `未回答者 ${unansweredUsers.length} 名にリマインド通知を再送しました。`,
      remindedCount
    });
  } catch (err) {
    console.error('Safety remind error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 7. 安否確認イベント更新 (ステータス変更・終了・アーカイブ)
// 対応URL: /api/safety-events/:id, /api/safety/events/:id, /api/events/:id
// -------------------------------------------------------------
router.put([
  '/safety-events/:id',
  '/safety-events/:id/',
  '/safety/events/:id',
  '/safety/events/:id/',
  '/events/:id',
  '/events/:id/'
], async (req, res) => {
  try {
    const { id } = req.params;
    const { status, title, message } = req.body || {};
    const nowIso = new Date().toISOString();

    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(100), id)
        .input('status', sql.NVarChar(50), status || 'closed')
        .input('updatedAt', sql.DateTimeOffset, nowIso)
        .query(`
          UPDATE dbo.SafetyEvents
          SET status = @status, updatedAt = @updatedAt
          WHERE id = @id
        `);
      return res.json({ success: true, message: '安否確認イベントを更新しました。' });
    }
    res.status(500).json({ error: 'DB接続が利用できません。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 8. 安否確認イベント個別削除 API (全集計回答データも完全カスケード削除)
// 対応URL: /api/safety-events/:id, /api/safety/events/:id, /api/events/:id
// -------------------------------------------------------------
router.delete([
  '/safety-events/:id',
  '/safety-events/:id/',
  '/safety/events/:id',
  '/safety/events/:id/',
  '/events/:id',
  '/events/:id/',
  '/safety-events/:id/delete',
  '/safety/events/:id/delete',
  '/events/:id/delete'
], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(100), id)
        .query(`
          DELETE FROM dbo.SafetyResponses WHERE eventId = @id;
          DELETE FROM dbo.SafetyEvents WHERE id = @id;
        `);
      return res.json({ success: true, message: '安否確認イベントおよび全回答データを完全に削除しました。' });
    }
    res.status(500).json({ error: 'DB接続が利用できません。' });
  } catch (err) {
    console.error('Delete safety event error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post([
  '/safety-events/:id/delete',
  '/safety/events/:id/delete',
  '/events/:id/delete'
], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(100), id)
        .query(`
          DELETE FROM dbo.SafetyResponses WHERE eventId = @id;
          DELETE FROM dbo.SafetyEvents WHERE id = @id;
        `);
      return res.json({ success: true, message: '安否確認イベントおよび全回答データを完全に削除しました。' });
    }
    res.status(500).json({ error: 'DB接続が利用できません。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 9. 個別回答レコード削除 API (特定ユーザーの回答取り消し・未回答リセット)
// 対応URL: /api/safety-events/:eventId/responses/:userId
// -------------------------------------------------------------
router.delete([
  '/safety-events/:eventId/responses/:userId',
  '/safety-events/:eventId/responses/:userId/',
  '/safety/events/:eventId/responses/:userId',
  '/safety/events/:eventId/responses/:userId/',
  '/events/:eventId/responses/:userId',
  '/events/:eventId/responses/:userId/',
  '/safety-events/:eventId/responses/:userId/delete',
  '/safety/events/:eventId/responses/:userId/delete',
  '/events/:eventId/responses/:userId/delete',
  '/safety-responses/:id',
  '/safety/responses/:id'
], async (req, res) => {
  try {
    const { eventId, userId, id } = req.params;
    const pool = await getPool();
    if (pool) {
      if (id) {
        await pool.request()
          .input('id', sql.NVarChar(100), id)
          .query('DELETE FROM dbo.SafetyResponses WHERE id = @id');
      } else if (eventId && userId) {
        await pool.request()
          .input('eventId', sql.NVarChar(100), eventId)
          .input('userId', sql.NVarChar(100), String(userId))
          .query('DELETE FROM dbo.SafetyResponses WHERE eventId = @eventId AND userId = @userId');
      }
      return res.json({ success: true, message: '安否回答レコードを削除し、未回答にリセットしました。' });
    }
    res.status(500).json({ error: 'DB接続が利用できません。' });
  } catch (err) {
    console.error('Delete safety response error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post([
  '/safety-events/:eventId/responses/:userId/delete',
  '/safety/events/:eventId/responses/:userId/delete',
  '/events/:eventId/responses/:userId/delete',
  '/safety-responses/:id/delete',
  '/safety/responses/:id/delete'
], async (req, res) => {
  try {
    const { eventId, userId, id } = req.params;
    const pool = await getPool();
    if (pool) {
      if (id) {
        await pool.request()
          .input('id', sql.NVarChar(100), id)
          .query('DELETE FROM dbo.SafetyResponses WHERE id = @id');
      } else if (eventId && userId) {
        await pool.request()
          .input('eventId', sql.NVarChar(100), eventId)
          .input('userId', sql.NVarChar(100), String(userId))
          .query('DELETE FROM dbo.SafetyResponses WHERE eventId = @eventId AND userId = @userId');
      }
      return res.json({ success: true, message: '安否回答レコードを削除し、未回答にリセットしました。' });
    }
    res.status(500).json({ error: 'DB接続が利用できません。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 10. 個人メールアドレス登録・暗号化保存 API (マイページ・個人設定用)
// 対応URL: /api/safety/personal-email, /api/safety-personal-email, /api/personal-email
// -------------------------------------------------------------
router.post([
  '/safety/personal-email',
  '/safety/personal-email/',
  '/safety-personal-email',
  '/safety-personal-email/',
  '/personal-email',
  '/personal-email/'
], async (req, res) => {
  try {
    const { userId, email } = req.body || {};
    if (!userId) {
      return res.status(400).json({ error: 'ユーザーIDが指定されていません。' });
    }

    const encrypted = email ? encryptText(email.trim()) : '';
    const masked = email ? maskEmail(email.trim()) : '';
    const nowIso = new Date().toISOString();

    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('userId', sql.NVarChar(100), String(userId))
        .input('personalEmailEncrypted', sql.NVarChar(500), encrypted)
        .input('updatedAt', sql.DateTimeOffset, nowIso)
        .query(`
          UPDATE dbo.Users
          SET personalEmailEncrypted = @personalEmailEncrypted,
              updatedAt = @updatedAt
          WHERE id = @userId
        `);

      return res.json({
        success: true,
        message: email ? '個人メールアドレスを暗号化して安全に保存しました。' : '個人メールアドレスの登録を解除しました。',
        personalEmailMasked: masked
      });
    }
    res.status(500).json({ error: 'DB接続が利用できません。' });
  } catch (err) {
    console.error('Save personal email error:', err);
    res.status(500).json({ error: err.message });
  }
});

// -------------------------------------------------------------
// 11. 安否確認対象者・個人メール登録状況一覧取得 API
// 対応URL: /api/safety-targets, /api/safety/targets, /api/targets
// -------------------------------------------------------------
router.get([
  '/safety-targets',
  '/safety-targets/',
  '/safety/targets',
  '/safety/targets/',
  '/targets',
  '/targets/'
], async (req, res) => {
  try {
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query('SELECT * FROM dbo.Users ORDER BY name ASC');
      const users = (result.recordset || []).map(u => ({
        id: String(u.id),
        name: u.name,
        email: u.email || '',
        mobileEmail: u.mobileEmail || u.mobile_email || '',
        hasPersonalEmail: !!(u.personalEmailEncrypted || u.personal_email_encrypted),
        personalEmailMasked: (u.personalEmailEncrypted || u.personal_email_encrypted)
          ? maskEmail(decryptText(u.personalEmailEncrypted || u.personal_email_encrypted))
          : '未登録',
        office: u.office || '',
        division: u.division || u.department || '',
        role: u.role || 'user'
      }));
      return res.json(users);
    }
    res.json([]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
