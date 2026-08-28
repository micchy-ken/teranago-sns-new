import { Router } from 'express';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { dataDir } from '../config.js';
import { sendEmailNotification, sendPushNotificationToUser } from '../server.js';

const router = Router();

const safetyEventsPath = path.join(dataDir, 'safety_events.json');
const safetyResponsesPath = path.join(dataDir, 'safety_responses.json');
const usersPath = path.join(dataDir, 'users.json');

// 暗号化キーの取得（環境変数またはデフォルトキー）
const PERSONAL_EMAIL_SECRET_KEY = process.env.PERSONAL_EMAIL_SECRET_KEY || 'teranago-safety-secret-key-32ch!';
const AES_KEY = crypto.createHash('sha256').update(PERSONAL_EMAIL_SECRET_KEY).digest();

/**
 * 復号関数 (AES-256-GCM)
 */
function decryptText(encryptedText) {
  if (!encryptedText || typeof encryptedText !== 'string' || !encryptedText.includes(':')) {
    return null;
  }
  try {
    const parts = encryptedText.split(':');
    if (parts.length < 3) return null;
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const cipherText = parts[2];
    const decipher = crypto.createDecipheriv('aes-256-gcm', AES_KEY, iv);
    decipher.setAuthTag(authTag);
    let decrypted = decipher.update(cipherText, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  } catch (e) {
    console.error('[SafetyModule] Decryption error:', e.message);
    return null;
  }
}

/**
 * 暗号化関数 (AES-256-GCM)
 */
function encryptText(plainText) {
  if (!plainText || typeof plainText !== 'string') return null;
  try {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', AES_KEY, iv);
    let encrypted = cipher.update(plainText.trim(), 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag().toString('hex');
    return `${iv.toString('hex')}:${authTag}:${encrypted}`;
  } catch (e) {
    console.error('[SafetyModule] Encryption error:', e.message);
    return null;
  }
}

/**
 * メールアドレスのマスキング (例: m***y@gmail.com)
 */
function maskEmail(email) {
  if (!email || !email.includes('@')) return '未登録';
  const [local, domain] = email.split('@');
  if (local.length <= 2) {
    return `${local[0]}***@${domain}`;
  }
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

// ==========================================
// ファイル・DB読み書きヘルパー
// ==========================================
function loadSafetyEventsFromFile() {
  if (!fs.existsSync(safetyEventsPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(safetyEventsPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveSafetyEventsToFile(events) {
  try {
    fs.writeFileSync(safetyEventsPath, JSON.stringify(events, null, 2), 'utf8');
  } catch (e) {
    console.error('[SafetyModule] Failed to save safety events:', e);
  }
}

function loadSafetyResponsesFromFile() {
  if (!fs.existsSync(safetyResponsesPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(safetyResponsesPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

function saveSafetyResponsesToFile(responses) {
  try {
    fs.writeFileSync(safetyResponsesPath, JSON.stringify(responses, null, 2), 'utf8');
  } catch (e) {
    console.error('[SafetyModule] Failed to save safety responses:', e);
  }
}

function loadUsersFromFile() {
  if (!fs.existsSync(usersPath)) return [];
  try {
    const data = JSON.parse(fs.readFileSync(usersPath, 'utf8'));
    return Array.isArray(data) ? data : [];
  } catch (e) {
    return [];
  }
}

// =========================================================================
// 1. 個人メール登録依頼メール一斉送信 API
// =========================================================================
router.post(['/safety/request-registration', '/safety-request-registration', '/request-registration'], async (req, res) => {
  try {
    const {
      userIds,
      customMessage = '',
      sendToCompanyEmail = true,
      sendToMobileEmail = true,
      senderName = '安否確認管理者',
      appBaseUrl
    } = req.body || {};

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({ error: '送信対象のユーザーID（userIds）を配列で指定してください。' });
    }

    const allUsers = loadUsersFromFile();
    const targetUsers = allUsers.filter((u) => userIds.includes(String(u.id)));

    if (targetUsers.length === 0) {
      return res.status(404).json({ error: '対象のユーザーが見つかりませんでした。' });
    }

    const resolvedBaseUrl = (appBaseUrl && typeof appBaseUrl === 'string' && appBaseUrl.startsWith('http'))
      ? appBaseUrl.replace(/\/$/, '')
      : 'https://micchy-ken.github.io/teranago-sns-new';

    const directRegistrationLink = `${resolvedBaseUrl}/?tab=mypage&openEmergencyContact=true`;
    const nowJst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    let sentCount = 0;
    let skippedCount = 0;
    const results = [];

    for (const u of targetUsers) {
      const targetEmails = [];
      if (sendToCompanyEmail && u.email && u.email.includes('@')) {
        targetEmails.push(u.email);
      }
      if (sendToMobileEmail && u.mobileEmail && u.mobileEmail.includes('@') && !targetEmails.includes(u.mobileEmail)) {
        targetEmails.push(u.mobileEmail);
      }

      if (targetEmails.length === 0) {
        skippedCount++;
        results.push({ userId: u.id, name: u.name, sentEmails: [], error: '送信先アドレス（PC/携帯）が未設定です' });
        continue;
      }

      const subject = `【重要】安否確認用・個人メールアドレス（緊急連絡先）の登録のお願い`;
      const textBody = `${u.name} 様\n\n寺岡オートドアSNS 安否確認システムよりお知らせです。\n\n大地震や災害時、会社のPCメールや携帯電話網が寸断された場合でも迅速に安否確認を受信・回答できるよう、私用メールアドレス（Gmailや携帯キャリアメール等）の緊急連絡先登録をお願いしております。\n\n登録された個人メールアドレスは最高強度の暗号化（AES-256-GCM）により厳重に保護され、管理者を含め誰にもアドレスが開示されることはありません（有事の緊急一斉発動時のみシステムから自動配信されます）。\n\n以下のURLを開き、マイページから個人メールアドレスのご登録をお願いいたします。\n\n▼ 個人メールアドレス登録画面を開く:\n${directRegistrationLink}\n\n${customMessage ? `【管理者からのメッセージ】\n${customMessage}\n\n` : ''}送信日時: ${nowJst}\n発信元: ${senderName}`;

      const htmlBody = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 2px solid #6366f1; border-radius: 16px; background-color: #ffffff; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #4f46e5 0%, #6366f1 100%); color: #ffffff; padding: 18px 20px; border-radius: 12px 12px 0 0; margin: -24px -24px 20px -24px;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 800; letter-spacing: -0.02em;">🛡️ 【安否確認】個人メールアドレス（緊急連絡先）登録のお願い</h2>
          </div>
          <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0;">${u.name} 様</p>
          <p style="font-size: 14px; color: #334155;">
            大規模地震や自然災害時の迅速な安否確認・連絡網確保のため、<strong>私用メールアドレス（Gmail, iCloud, キャリアメール等）の緊急連絡先登録</strong>へのご協力をお願いいたします。
          </p>
          <div style="background-color: #e0e7ff; border-left: 4px solid #4f46e5; padding: 14px 16px; border-radius: 0 8px 8px 0; margin: 16px 0;">
            <p style="margin: 0; font-size: 13px; color: #3730a3; font-weight: 600;">
              🔒 <strong>安心の暗号化セキュリティ</strong><br>
              登録されたアドレスはAES-256暗号化により保護され、管理者を含む第三者には一切開示されません。災害発生時の緊急安否確認メールの自動配信にのみ使用されます。
            </p>
          </div>
          ${customMessage ? `
            <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; padding: 12px 16px; border-radius: 8px; margin: 16px 0;">
              <p style="margin: 0 0 4px 0; font-size: 12px; font-weight: 700; color: #64748b;">管理者からの連絡事項:</p>
              <p style="margin: 0; font-size: 13px; color: #1e293b; white-space: pre-wrap;">${customMessage}</p>
            </div>
          ` : ''}
          <div style="text-align: center; margin: 28px 0;">
            <a href="${directRegistrationLink}" style="display: inline-block; background-color: #4f46e5; color: #ffffff; padding: 14px 32px; font-size: 15px; font-weight: 800; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 12px rgba(79, 70, 229, 0.3);">
              👉 今すぐ個人メールアドレスを登録する
            </a>
            <p style="font-size: 11px; color: #64748b; margin-top: 10px;">
              ※上記ボタンをクリックすると、社内SNSの個人設定（緊急連絡先）画面が直接開きます。
            </p>
          </div>
          <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
            <p style="margin: 0 0 4px 0;">送信日時: ${nowJst}</p>
            <p style="margin: 0;">発信元: ${senderName} (寺岡オートドアSNS 安否確認システム)</p>
          </div>
        </div>
      `;

      const sentToThisUser = [];
      for (const addr of targetEmails) {
        try {
          if (typeof sendEmailNotification === 'function') {
            await sendEmailNotification({ to: addr, subject, text: textBody, html: htmlBody });
            sentToThisUser.push(addr);
          }
        } catch (mErr) {
          console.error(`[SafetyModule] Mail send failed for ${addr}:`, mErr.message);
        }
      }

      if (sentToThisUser.length > 0) {
        sentCount++;
        results.push({ userId: u.id, name: u.name, sentEmails: sentToThisUser });
      } else {
        skippedCount++;
        results.push({ userId: u.id, name: u.name, sentEmails: [], error: 'メール送信に失敗しました' });
      }
    }

    res.json({
      success: true,
      message: `${sentCount} 名の社員（PC/携帯メール）宛に登録依頼メールを送信しました。`,
      sentCount,
      skippedCount,
      totalRequested: targetUsers.length,
      results
    });
  } catch (err) {
    console.error('[SafetyModule] Request registration error:', err);
    res.status(500).json({ error: err.message || '登録依頼メールの送信中にエラーが発生しました。' });
  }
});

// =========================================================================
// 2. 安否確認イベント一覧取得 API
// =========================================================================
router.get(['/safety-events', '/safety/events'], async (req, res) => {
  try {
    const events = loadSafetyEventsFromFile();
    events.sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());
    res.json(events);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// 3. 安否確認発動 API (POST)
// =========================================================================
router.post(['/safety-events', '/safety/events'], async (req, res) => {
  try {
    const {
      title,
      type,
      disasterType,
      severity,
      level,
      targetOffice,
      targetDivision,
      message,
      notifyWebPush = true,
      notifyCompanyEmail = true,
      notifyPersonalEmail = true,
      isDrill = false,
      isTest = false,
      createdBy,
      createdById,
      createdByName,
      appBaseUrl
    } = req.body || {};

    const eventType = type || disasterType || 'earthquake';
    if (!title || !eventType) {
      return res.status(400).json({ error: 'タイトルおよび災害種別は必須です。' });
    }

    const newId = `safety_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const newEvent = {
      id: newId,
      title,
      type: eventType,
      disasterType: eventType,
      severity: severity || level || 'warning',
      level: level || severity || '警戒',
      targetOffice: targetOffice || '全社',
      targetDivision: targetDivision || '全部署',
      message: message || '',
      notifyWebPush: !!notifyWebPush,
      notifyCompanyEmail: !!notifyCompanyEmail,
      notifyPersonalEmail: !!notifyPersonalEmail,
      isDrill: !!(isDrill || isTest),
      isTest: !!(isDrill || isTest),
      status: 'active',
      createdBy: createdBy || createdById || 'admin',
      createdByName: createdByName || '管理者',
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const events = loadSafetyEventsFromFile();
    events.unshift(newEvent);
    saveSafetyEventsToFile(events);

    // 全社ユーザーを読み込み、対象ユーザーをフィルタリング
    const allUsers = loadUsersFromFile();
    const targetUsers = allUsers.filter((u) => {
      const matchOffice = (!targetOffice || targetOffice === '全社' || u.office === targetOffice);
      const matchDivision = (!targetDivision || targetDivision === '全部署' || u.division === targetDivision);
      return matchOffice && matchDivision;
    });

    console.log(`[SafetyModule] 発動: ${title} (対象者数: ${targetUsers.length} 名)`);

    const resolvedBaseUrl = (appBaseUrl && typeof appBaseUrl === 'string' && appBaseUrl.startsWith('http'))
      ? appBaseUrl.replace(/\/$/, '')
      : 'https://micchy-ken.github.io/teranago-sns-new';

    const directAnswerLink = `${resolvedBaseUrl}/?tab=safety_confirmation&safetyEventId=${newId}`;
    const nowJst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // 1. Web Push 通知の一斉配信
    if (notifyWebPush && typeof sendPushNotificationToUser === 'function') {
      for (const u of targetUsers) {
        try {
          await sendPushNotificationToUser({
            targetUserId: String(u.id),
            title: `🚨【安否確認】${title}`,
            body: message || 'ただちに安否確認画面を開き、状況を回答してください。',
            url: `/?tab=safety_confirmation&safetyEventId=${newId}`,
            data: { eventId: newId, tab: 'safety_confirmation' },
            tag: `safety_${newId}`
          });
        } catch (pushErr) {
          console.warn('[SafetyModule] Push notification error:', pushErr.message);
        }
      }
    }

    // 2. メール一斉配信（会社PC・携帯メール + 暗号化個人メール）
    if (notifyCompanyEmail || notifyPersonalEmail) {
      const mailPromises = targetUsers.map(async (u) => {
        const emailAddresses = [];

        if (notifyCompanyEmail) {
          if (u.email && u.email.includes('@')) emailAddresses.push(u.email);
          if (u.mobileEmail && u.mobileEmail.includes('@') && u.mobileEmail !== u.email) {
            emailAddresses.push(u.mobileEmail);
          }
        }

        if (notifyPersonalEmail && u.personalEmailEncrypted) {
          const decrypted = decryptText(u.personalEmailEncrypted);
          if (decrypted && decrypted.includes('@') && !emailAddresses.includes(decrypted)) {
            emailAddresses.push(decrypted);
          }
        }

        if (emailAddresses.length === 0) return;

        const subject = `【緊急安否確認】${isDrill ? '【訓練】' : ''}${title}`;
        const text = `${u.name} 様\n\n【安否確認システムからの緊急連絡】\n\n${title}\n\n${message || ''}\n\n至急、以下のURLより現在の安否状況をご回答ください。\n1タップで簡単に回答・報告できます。\n\n▼ 安否状況を回答する:\n${directAnswerLink}\n\n発動日時: ${nowJst}\n発信者: ${createdByName || '安否確認本部'}`;

        const html = `
          <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 2px solid #dc2626; border-radius: 16px; background-color: #ffffff; margin: 0 auto;">
            <div style="background-color: #dc2626; color: #ffffff; padding: 16px 20px; border-radius: 12px 12px 0 0; margin: -24px -24px 20px -24px;">
              <h2 style="margin: 0; font-size: 18px; font-weight: 800;">🚨 【緊急安否確認】${isDrill ? '【訓練】' : ''}${title}</h2>
            </div>
            <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0;">${u.name} 様</p>
            <p style="font-size: 14px; color: #334155;">安否確認が発動されました。身の安全を確保した上で、速やかに現在の安否状況・出社可否をご回答ください。</p>
            ${message ? `
              <div style="background-color: #fef2f2; padding: 14px 16px; border-radius: 8px; border-left: 4px solid #dc2626; margin: 16px 0;">
                <p style="margin: 0; font-size: 14px; color: #991b1b; white-space: pre-wrap; font-weight: 600;">${message}</p>
              </div>
            ` : ''}
            <div style="text-align: center; margin: 28px 0;">
              <a href="${directAnswerLink}" style="display: inline-block; background-color: #dc2626; color: #ffffff; padding: 15px 34px; font-size: 16px; font-weight: 800; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4);">
                👉 今すぐ安否状況を回答する (1タップ報告)
              </a>
              <p style="font-size: 11px; color: #64748b; margin-top: 10px;">
                URL: <a href="${directAnswerLink}" style="color: #dc2626; word-break: break-all;">${directAnswerLink}</a>
              </p>
            </div>
            <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
              <p style="margin: 0 0 4px 0;"><b>発動日時:</b> ${nowJst}</p>
              <p style="margin: 0;"><b>発動本部:</b> ${createdByName || '安否確認本部'}</p>
            </div>
          </div>
        `;

        for (const addr of emailAddresses) {
          try {
            if (typeof sendEmailNotification === 'function') {
              await sendEmailNotification({ to: addr, subject, text, html });
            }
          } catch (mailErr) {
            console.warn(`[SafetyModule] Mail error to ${maskEmail(addr)}:`, mailErr.message);
          }
        }
      });

      Promise.all(mailPromises).catch((err) => console.error('[SafetyModule] Batch mail error:', err));
    }

    res.status(201).json({
      success: true,
      message: '安否確認を発動し、対象者へ一斉通知を開始しました。',
      event: newEvent,
      targetUserCount: targetUsers.length
    });
  } catch (err) {
    console.error('[SafetyModule] Safety trigger error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// 4. 安否確認 未回答者へのリマインド一斉送信 API
// =========================================================================
router.post(['/safety-events/:id/remind', '/safety/events/:id/remind'], async (req, res) => {
  try {
    const { id } = req.params;
    const { appBaseUrl, senderName } = req.body || {};

    const events = loadSafetyEventsFromFile();
    const event = events.find((e) => e.id === id);
    if (!event) {
      return res.status(404).json({ error: '対象の安否確認イベントが見つかりません。' });
    }

    const responses = loadSafetyResponsesFromFile().filter((r) => r.eventId === id);
    const answeredUserIds = new Set(responses.map((r) => String(r.userId)));

    const allUsers = loadUsersFromFile();
    const targetUsers = allUsers.filter((u) => {
      const matchOffice = (!event.targetOffice || event.targetOffice === '全社' || u.office === event.targetOffice);
      const matchDivision = (!event.targetDivision || event.targetDivision === '全部署' || u.division === event.targetDivision);
      return matchOffice && matchDivision;
    });

    const unansweredUsers = targetUsers.filter((u) => !answeredUserIds.has(String(u.id)));

    if (unansweredUsers.length === 0) {
      return res.json({
        success: true,
        message: '対象の全社員が回答済みです。未回答者はいません。',
        remindedCount: 0
      });
    }

    const resolvedBaseUrl = (appBaseUrl && typeof appBaseUrl === 'string' && appBaseUrl.startsWith('http'))
      ? appBaseUrl.replace(/\/$/, '')
      : 'https://micchy-ken.github.io/teranago-sns-new';

    const directAnswerLink = `${resolvedBaseUrl}/?tab=safety_confirmation&safetyEventId=${event.id}`;
    const nowJst = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    // WebPush 再送
    if (typeof sendPushNotificationToUser === 'function') {
      for (const u of unansweredUsers) {
        try {
          await sendPushNotificationToUser({
            targetUserId: String(u.id),
            title: `⚠️【未回答・再送】安否確認: ${event.title}`,
            body: 'まだ安否確認の回答が完了していません。至急ご回答をお願いします。',
            url: `/?tab=safety_confirmation&safetyEventId=${event.id}`,
            tag: `safety_remind_${event.id}`
          });
        } catch (_) {}
      }
    }

    // メール再送
    let remindedCount = 0;
    const mailPromises = unansweredUsers.map(async (u) => {
      const emailAddresses = [];
      if (u.email && u.email.includes('@')) emailAddresses.push(u.email);
      if (u.mobileEmail && u.mobileEmail.includes('@') && !emailAddresses.includes(u.mobileEmail)) {
        emailAddresses.push(u.mobileEmail);
      }
      if (u.personalEmailEncrypted) {
        const decrypted = decryptText(u.personalEmailEncrypted);
        if (decrypted && decrypted.includes('@') && !emailAddresses.includes(decrypted)) {
          emailAddresses.push(decrypted);
        }
      }

      if (emailAddresses.length === 0) return;

      const subject = `【再送・至急】⚠️【安否確認】未回答の確認 (${event.title})`;
      const text = `${u.name} 様\n\n【安否確認システムからの再送連絡】\n\n発動中の安否確認（${event.title}）について、まだ回答が確認できておりません。\n\n身の安全を確保した上で、至急以下のURLより安否状況をご回答ください。\n\n▼ 安否状況を回答する:\n${directAnswerLink}\n\n発動本部: ${senderName || event.createdByName || '安否確認本部'}\n送信日時: ${nowJst}`;

      const html = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 600px; border: 2px solid #e11d48; border-radius: 16px; background-color: #ffffff; margin: 0 auto;">
          <div style="background-color: #e11d48; color: #ffffff; padding: 16px 20px; border-radius: 12px 12px 0 0; margin: -24px -24px 20px -24px;">
            <h2 style="margin: 0; font-size: 18px; font-weight: 800;">⚠️ 【再送・至急】安否状況のご回答をお願いします</h2>
          </div>
          <p style="font-size: 16px; font-weight: 700; color: #0f172a; margin-top: 0;">${u.name} 様</p>
          <p style="font-size: 14px; color: #334155;">
            発動中の安否確認<strong>「${event.title}」</strong>について、まだご回答をいただいておりません。<br>
            会社の安全確認および支援体制確保のため、至急現在の状況をご回答ください。
          </p>
          <div style="text-align: center; margin: 28px 0;">
            <a href="${directAnswerLink}" style="display: inline-block; background-color: #e11d48; color: #ffffff; padding: 15px 34px; font-size: 16px; font-weight: 800; text-decoration: none; border-radius: 12px; box-shadow: 0 4px 14px rgba(225, 29, 72, 0.4);">
              👉 今すぐ安否状況を回答する
            </a>
          </div>
          <div style="background-color: #f8fafc; padding: 12px 16px; border-radius: 8px; border: 1px solid #e2e8f0; font-size: 11px; color: #64748b;">
            <p style="margin: 0 0 4px 0;">送信日時: ${nowJst}</p>
            <p style="margin: 0;">発信元: ${senderName || event.createdByName || '安否確認本部'}</p>
          </div>
        </div>
      `;

      let sent = false;
      for (const addr of emailAddresses) {
        try {
          if (typeof sendEmailNotification === 'function') {
            await sendEmailNotification({ to: addr, subject, text, html });
            sent = true;
          }
        } catch (_) {}
      }
      if (sent) remindedCount++;
    });

    await Promise.all(mailPromises);

    res.json({
      success: true,
      message: `未回答者 ${unansweredUsers.length} 名にリマインド通知を再送しました。`,
      remindedCount: unansweredUsers.length
    });
  } catch (err) {
    console.error('[SafetyModule] Remind error:', err);
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// 5. 安否確認イベント更新 API (ステータス完了化・終了など)
// =========================================================================
router.put(['/safety-events/:id', '/safety/events/:id'], (req, res) => {
  try {
    const { id } = req.params;
    const data = req.body || {};
    const events = loadSafetyEventsFromFile();
    const idx = events.findIndex((e) => e.id === id);

    if (idx === -1) {
      return res.status(404).json({ error: '安否確認イベントが見つかりません' });
    }

    events[idx] = {
      ...events[idx],
      ...data,
      id,
      updatedAt: new Date().toISOString()
    };
    saveSafetyEventsToFile(events);

    res.json({ success: true, event: events[idx] });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// 6. 安否確認イベント削除 API
// =========================================================================
router.delete(['/safety-events/:id', '/safety/events/:id', '/safety-events/:id/delete', '/safety/events/:id/delete'], (req, res) => {
  try {
    const { id } = req.params;
    let events = loadSafetyEventsFromFile();
    events = events.filter((e) => e.id !== id);
    saveSafetyEventsToFile(events);

    let responses = loadSafetyResponsesFromFile();
    responses = responses.filter((r) => r.eventId !== id);
    saveSafetyResponsesToFile(responses);

    res.json({ success: true, message: '安否確認イベントおよび回答データを削除しました。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/safety-events/:id/delete', '/safety/events/:id/delete'], (req, res) => {
  try {
    const { id } = req.params;
    let events = loadSafetyEventsFromFile();
    events = events.filter((e) => e.id !== id);
    saveSafetyEventsToFile(events);

    let responses = loadSafetyResponsesFromFile();
    responses = responses.filter((r) => r.eventId !== id);
    saveSafetyResponsesToFile(responses);

    res.json({ success: true, message: '安否確認イベントおよび回答データを削除しました。' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// 7. 安否確認回答一覧取得 API
// =========================================================================
router.get(['/safety-events/:id/responses', '/safety/events/:id/responses'], (req, res) => {
  try {
    const { id } = req.params;
    const responses = loadSafetyResponsesFromFile().filter((r) => r.eventId === id);
    res.json(responses);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// =========================================================================
// 8. 安否確認回答送信 API (ユーザーの回答登録・更新)
// =========================================================================
router.post(['/safety-events/:id/respond', '/safety/events/:id/respond'], (req, res) => {
  try {
    const { id } = req.params;
    const {
      userId,
      userName,
      userOffice,
      userDivision,
      safetyStatus,
      familyStatus,
      houseStatus,
      workAvailability,
      locationStatus,
      message,
      status, // fallback
      canWork, // fallback
      currentLocation, // fallback
      comment // fallback
    } = req.body || {};

    const finalSafetyStatus = safetyStatus || status || 'safe';
    const finalWorkAvailability = workAvailability || canWork || 'available';

    if (!userId) {
      return res.status(400).json({ error: 'ユーザーIDは必須です。' });
    }

    const events = loadSafetyEventsFromFile();
    const event = events.find((e) => e.id === id);
    if (!event) {
      return res.status(404).json({ error: '安否確認イベントが存在しません。' });
    }

    const responses = loadSafetyResponsesFromFile();
    const nowIso = new Date().toISOString();
    const idx = responses.findIndex((r) => r.eventId === id && r.userId === userId);

    const responseRecord = {
      id: idx >= 0 ? responses[idx].id : `resp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      eventId: id,
      userId,
      userName: userName || '社員',
      userOffice: userOffice || '',
      userDivision: userDivision || '',
      safetyStatus: finalSafetyStatus,
      familyStatus: familyStatus || 'all_safe',
      houseStatus: houseStatus || 'no_damage',
      workAvailability: finalWorkAvailability,
      locationStatus: locationStatus || currentLocation || '自宅',
      message: message || comment || '',
      // 後方互換性用
      status: finalSafetyStatus,
      canWork: finalWorkAvailability,
      currentLocation: locationStatus || currentLocation || '自宅',
      comment: message || comment || '',
      respondedAt: nowIso,
      updatedAt: nowIso
    };

    if (idx >= 0) {
      responses[idx] = responseRecord;
    } else {
      responses.unshift(responseRecord);
    }

    saveSafetyResponsesToFile(responses);

    res.json({
      success: true,
      message: '安否確認の回答を受け付けました。',
      response: responseRecord
    });
  } catch (err) {
    console.error('[SafetyModule] Safety respond error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
