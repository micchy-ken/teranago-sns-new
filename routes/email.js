import { Router } from 'express';
import nodemailer from 'nodemailer';
import net from 'net';
import path from 'path';
import fs from 'fs';
import sql from 'mssql';
import { simpleParser } from 'mailparser';
import { getPool } from '../db.js';
import { bulletinsFilesDir, dataDir } from '../config.js';

const router = Router();
const bulletinsPath = path.join(dataDir, 'bulletins.json');

// ==========================================
// SMTP 送信設定
// ==========================================
const smtpConfig = {
  host: process.env.SMTP_HOST || '111.89.134.68',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: process.env.SMTP_SECURE === 'true',
  auth: {
    user: process.env.SMTP_USER || 'nagoya-soumu2',
    pass: process.env.SMTP_PASS || 'EJ2brys7'
  },
  tls: {
    rejectUnauthorized: false
  }
};

const smtpFromEmail = process.env.SMTP_FROM_EMAIL || 'nagoya-soumu2@teraoka-ads.co.jp';
const smtpFromName = process.env.SMTP_FROM_NAME || '寺岡SNS';
const smtpFromFormatted = `"${smtpFromName}" <${smtpFromEmail}>`;

export async function sendEmailNotification(options) {
  if (!options.to || (Array.isArray(options.to) && options.to.length === 0)) {
    throw new Error('送信先メールアドレスが指定されていません。');
  }

  const transporter = nodemailer.createTransport(smtpConfig);
  const mailOptions = {
    from: smtpFromFormatted,
    to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
    subject: options.subject,
    text: options.text || '',
    html: options.html || (options.text ? `<p style="white-space: pre-wrap;">${options.text}</p>` : '')
  };

  const info = await transporter.sendMail(mailOptions);
  return info;
}

// SMTP 設定情報取得
router.get(['/email/config', '/email/config/'], (req, res) => {
  res.json({
    host: smtpConfig.host,
    port: smtpConfig.port,
    secure: smtpConfig.secure,
    user: smtpConfig.auth.user,
    fromEmail: smtpFromEmail,
    fromName: smtpFromName,
    isConfigured: !!(smtpConfig.host && smtpConfig.auth.user)
  });
});

// メール送信 API
router.all(['/email/send', '/email/send/'], async (req, res) => {
  try {
    const to = req.body?.to || req.query?.to;
    const subject = req.body?.subject || req.query?.subject;
    const text = req.body?.text || req.query?.text;
    const html = req.body?.html || req.query?.html;

    if (!to || !subject) {
      return res.status(400).json({ error: '宛先 (to) および件名 (subject) は必須です。' });
    }
    const info = await sendEmailNotification({ to, subject, text, html });
    res.json({ success: true, messageId: info.messageId, message: 'メールを正常に送信しました。' });
  } catch (err) {
    res.status(500).json({ error: err.message || 'メールの送信に失敗しました。' });
  }
});

// 管理画面用テストメール
router.all(['/email/test', '/email/test/'], async (req, res) => {
  try {
    const to = req.body?.to || req.query?.to;
    const recipientName = req.body?.recipientName || req.query?.recipientName;
    const targetUser = req.body?.targetUser || req.query?.targetUser;

    if (!to) {
      return res.status(400).json({ error: '送信先のメールアドレスを指定してください。' });
    }

    const nameStr = recipientName ? `${recipientName} 様` : (targetUser?.name ? `${targetUser.name} 様` : '管理者 様');
    const nowStr = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const subject = '【テストメール】寺岡オートドアSNS メール通知連携テスト';
    const text = `${nameStr}\n\n寺岡オートドアSNS からのメール通知送信テストです。\n送信日時: ${nowStr}\n差出人: ${smtpFromFormatted}\n送信先: ${to}`;

    const info = await sendEmailNotification({ to, subject, text });
    res.json({ success: true, messageId: info.messageId, message: `${to} へテストメールを正常に送信しました。` });
  } catch (err) {
    res.status(500).json({ error: err.message || 'テストメールの送信に失敗しました。' });
  }
});

// ★ 安否確認発動画面からのテストメール送信 API
router.post(['/notifications/test-email', '/notifications/test-email/'], async (req, res) => {
  try {
    const { to, subject, text, html } = req.body || {};
    if (!to) {
      return res.status(400).json({ error: '送信先アドレス (to) を指定してください' });
    }

    const testSubject = subject || '【寺岡オートドアSNS】安否確認テスト通知';
    const testText = text || 'これは寺岡オートドアSNS 安否確認システムからのテストメール通知です。';

    try {
      const info = await sendEmailNotification({ to, subject: testSubject, text: testText, html });
      res.json({ success: true, message: `${to} へテストメールを正常に送信しました`, messageId: info?.messageId });
    } catch (smtpErr) {
      console.warn('[Email] SMTP送信エラー/シミュレーション:', smtpErr.message);
      res.json({
        success: true,
        simulated: true,
        message: `${to} 宛てのテスト配信内容を検証しました（SMTP接続エラーまたはテスト環境）`,
        details: smtpErr.message
      });
    }
  } catch (err) {
    console.error('Error in /notifications/test-email:', err);
    res.status(500).json({ error: 'テストメール処理中にエラーが発生しました', details: err.message });
  }
});

// =========================================================
// POP3 メール受信・掲示板自動投稿エンジン
// =========================================================
const pop3Config = {
  host: process.env.POP3_HOST || '111.89.134.68',
  port: Number(process.env.POP3_PORT || 110),
  secure: false,
  user: process.env.POP3_USER || 'nagoya-soumu2',
  pass: process.env.POP3_PASS || 'EJ2brys7',
  fromAddress: process.env.SMTP_FROM_EMAIL || 'nagoya-soumu2@teraoka-ads.co.jp',
  deleteAfterImport: process.env.POP3_DELETE_AFTER_IMPORT !== 'false',
  checkIntervalSec: Number(process.env.POP3_CHECK_INTERVAL_SEC || 60),
  defaultTag: process.env.POP3_DEFAULT_TAG || '社内メール'
};

const pop3State = {
  isPolling: false,
  lastCheckedAt: null,
  lastCheckStatus: 'idle',
  lastCheckMessage: '起動待機中',
  totalImportedCount: 0,
  logs: []
};

function addPop3Log(type, message) {
  const timestamp = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  pop3State.logs.unshift({ timestamp, type, message });
  if (pop3State.logs.length > 50) pop3State.logs = pop3State.logs.slice(0, 50);
  console.log(`[POP3 ${type.toUpperCase()}] ${message}`);
}

function loadBulletins() {
  try {
    if (!fs.existsSync(bulletinsPath)) return [];
    return JSON.parse(fs.readFileSync(bulletinsPath, 'utf8')) || [];
  } catch (e) {
    return [];
  }
}

function saveBulletins(list) {
  try {
    if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
    fs.writeFileSync(bulletinsPath, JSON.stringify(list, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save bulletins:', e);
  }
}

class Pop3SocketClient {
  constructor() {
    this.socket = null;
    this.buffer = '';
    this.isMultiline = false;
    this.currentResolve = null;
    this.currentReject = null;
  }

  async connect(host, port, timeoutMs = 12000) {
    return new Promise((resolve, reject) => {
      const sock = net.createConnection({ host, port });
      this.socket = sock;
      sock.setTimeout(timeoutMs);

      let initialResolved = false;

      sock.on('connect', () => {});

      sock.on('data', (chunk) => {
        this.buffer += chunk.toString('latin1');
        this.processBuffer();
      });

      sock.on('timeout', () => {
        sock.destroy(new Error(`POP3 接続タイムアウト (${host}:${port})`));
      });

      sock.on('error', (err) => {
        if (!initialResolved) {
          initialResolved = true;
          reject(err);
        } else if (this.currentReject) {
          const r = this.currentReject;
          this.currentReject = null;
          this.currentResolve = null;
          r(err);
        }
      });

      sock.on('close', () => {
        if (this.currentReject) {
          const r = this.currentReject;
          this.currentReject = null;
          this.currentResolve = null;
          r(new Error('POP3 接続が切断されました'));
        }
      });

      this.currentResolve = (greeting) => {
        initialResolved = true;
        resolve(greeting);
      };
      this.currentReject = (err) => {
        initialResolved = true;
        reject(err);
      };
    });
  }

  processBuffer() {
    if (!this.currentResolve) return;

    if (this.isMultiline) {
      let termIndex = this.buffer.indexOf('\r\n.\r\n');
      let termLen = 5;
      if (termIndex === -1) {
        termIndex = this.buffer.indexOf('\n.\n');
        termLen = 3;
      }
      if (termIndex === -1 && (this.buffer === '.\r\n' || this.buffer.startsWith('.\r\n'))) {
        termIndex = 0;
        termLen = 3;
      }

      if (termIndex !== -1) {
        const fullContent = this.buffer.slice(0, termIndex);
        this.buffer = this.buffer.slice(termIndex + termLen);
        this.isMultiline = false;

        const lines = fullContent.split(/\r?\n/);
        const header = lines[0] || '';
        const bodyLines = lines.slice(1).map(l => l.startsWith('..') ? l.substring(1) : l);

        const r = this.currentResolve;
        this.currentResolve = null;
        this.currentReject = null;
        r({
          header,
          body: bodyLines,
          raw: Buffer.from(bodyLines.join('\r\n'), 'latin1')
        });
      }
    } else {
      const lineEnd = this.buffer.indexOf('\r\n');
      if (lineEnd !== -1) {
        const line = this.buffer.slice(0, lineEnd);
        this.buffer = this.buffer.slice(lineEnd + 2);

        const r = this.currentResolve;
        this.currentResolve = null;
        this.currentReject = null;
        r(line);
      }
    }
  }

  async sendCommand(cmd) {
    if (!this.socket) throw new Error('POP3 ソケットが初期化されていません');
    return new Promise((resolve, reject) => {
      this.isMultiline = false;
      this.currentResolve = (res) => {
        if (res && res.startsWith('-ERR')) {
          reject(new Error(`POP3 コマンドエラー (${cmd}): ${res}`));
        } else {
          resolve(res);
        }
      };
      this.currentReject = reject;
      this.socket.write(cmd + '\r\n');
    });
  }

  async sendMultilineCommand(cmd) {
    if (!this.socket) throw new Error('POP3 ソケットが初期化されていません');
    return new Promise((resolve, reject) => {
      this.isMultiline = true;
      this.currentResolve = (res) => {
        if (res.header && res.header.startsWith('-ERR')) {
          reject(new Error(`POP3 コマンドエラー (${cmd}): ${res.header}`));
        } else {
          resolve(res);
        }
      };
      this.currentReject = reject;
      this.socket.write(cmd + '\r\n');
    });
  }

  close() {
    if (this.socket) {
      try {
        this.socket.destroy();
      } catch (_) {}
      this.socket = null;
    }
  }
}

function matchSenderToWhitelist(candidateAddresses, allUsers) {
  if (!candidateAddresses || candidateAddresses.length === 0) return null;

  for (const rawAddr of candidateAddresses) {
    if (!rawAddr) continue;
    const cleanAddr = rawAddr.replace(/[<>\"\'\s]/g, '').trim().toLowerCase();
    if (!cleanAddr) continue;

    const addrUserPart = cleanAddr.split('@')[0] || '';

    const exactMatch = allUsers.find(u => {
      const pc = (u.email || '').replace(/[<>\"\'\s]/g, '').trim().toLowerCase();
      const mobile = (u.mobileEmail || u.mobile_email || '').replace(/[<>\"\'\s]/g, '').trim().toLowerCase();
      return (pc && pc === cleanAddr) || (mobile && mobile === cleanAddr);
    });
    if (exactMatch) return exactMatch;

    if (addrUserPart) {
      const loginMatch = allUsers.find(u => {
        const loginId = (u.loginId || u.login_id || u.username || '').trim().toLowerCase();
        return loginId && loginId === addrUserPart;
      });
      if (loginMatch) return loginMatch;
    }
  }
  return null;
}

function formatAttachmentSize(bytes) {
  if (!bytes || isNaN(bytes)) return '0 KB';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

function decodeMimeHeader(str) {
  if (!str) return '';
  try {
    return str.replace(/=\?([^?]+)\?([BQbq])\?([^?]+)\?=/g, (_, charset, encoding, text) => {
      if (encoding.toUpperCase() === 'B') {
        return Buffer.from(text, 'base64').toString('utf8');
      } else if (encoding.toUpperCase() === 'Q') {
        const decoded = text.replace(/_/g, ' ').replace(/=([A-Fa-f0-9]{2})/g, (__, hex) => String.fromCharCode(parseInt(hex, 16)));
        return decoded;
      }
      return text;
    });
  } catch (e) {
    return str;
  }
}

function getExtensionFromMimeType(mime) {
  if (!mime) return '.dat';
  const m = mime.toLowerCase();
  if (m.includes('jpeg') || m.includes('jpg')) return '.jpg';
  if (m.includes('png')) return '.png';
  if (m.includes('gif')) return '.gif';
  if (m.includes('pdf')) return '.pdf';
  if (m.includes('word') || m.includes('docx')) return '.docx';
  if (m.includes('excel') || m.includes('xlsx') || m.includes('spreadsheet')) return '.xlsx';
  if (m.includes('powerpoint') || m.includes('presentation')) return '.pptx';
  if (m.includes('zip')) return '.zip';
  if (m.includes('text/plain')) return '.txt';
  return '.dat';
}

export async function processIncomingEmail(rawEmailBuffer) {
  try {
    const parsed = await simpleParser(rawEmailBuffer);
    let allUsers = [];
    const pool = await getPool();

    if (pool) {
      try {
        const userRes = await pool.request().query('SELECT * FROM dbo.Users');
        allUsers = userRes.recordset.map(u => ({
          id: String(u.id),
          name: u.name,
          email: u.email,
          mobileEmail: u.mobile_email || u.mobileEmail,
          office: u.office,
          division: u.division || u.department,
          department: u.department || u.division,
          loginId: u.login_id || u.loginId,
          avatarUrl: u.avatarUrl || ''
        }));
      } catch (dbErr) {
        console.warn('[POP3] Failed to query Users table:', dbErr.message);
      }
    }

    const candidateSenders = [];
    if (parsed.from?.value) parsed.from.value.forEach(v => { if (v.address) candidateSenders.push(v.address); });
    if (parsed.from?.text) {
      const matches = parsed.from.text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g);
      if (matches) candidateSenders.push(...matches);
    }

    const matchedUser = matchSenderToWhitelist(candidateSenders, allUsers);
    if (!matchedUser) {
      const senderStr = candidateSenders.join(', ') || parsed.from?.text || '不明な送信元';
      addPop3Log('warn', `ホワイトリスト外の送信元 (${senderStr}) からのメールのため、掲示板への掲載をスキップしました。`);
      return { imported: false, reason: `ホワイトリスト外 (${senderStr})` };
    }

    const attachmentsList = [];
    if (parsed.attachments && parsed.attachments.length > 0) {
      if (!fs.existsSync(bulletinsFilesDir)) {
        try { fs.mkdirSync(bulletinsFilesDir, { recursive: true }); } catch (_) {}
      }
      for (let i = 0; i < parsed.attachments.length; i++) {
        const att = parsed.attachments[i];
        try {
          let decodedFilename = decodeMimeHeader(att.filename) || `attachment_${Date.now()}_${i}`;
          let ext = path.extname(decodedFilename);
          if (!ext || ext.length > 10) ext = getExtensionFromMimeType(att.contentType);
          const cleanBase = path.basename(decodedFilename, ext).replace(/[^a-zA-Z0-9_\-\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF]/g, '_') || 'file';
          const safeSavedFilename = `${Date.now()}_${i}_${cleanBase}${ext}`;
          const filePath = path.join(bulletinsFilesDir, safeSavedFilename);
          fs.writeFileSync(filePath, att.content);
          attachmentsList.push({
            id: `att_mail_${Date.now()}_${i}`,
            name: decodedFilename,
            size: formatAttachmentSize(att.size || att.content?.length || 0),
            url: `/bulletinsfiles/${encodeURIComponent(safeSavedFilename)}`,
            type: att.contentType || 'application/octet-stream'
          });
        } catch (attErr) {}
      }
    }

    const rawText = parsed.text || (parsed.html ? parsed.html.replace(/<[^>]+>/g, '') : '') || '（本文なし）';
    const mailSubject = (parsed.subject || '（無題の社内メール）').trim();
    const mailDateStr = parsed.date ? new Date(parsed.date).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' }) : new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    const fromDisplay = parsed.from?.text || `${matchedUser.name} <${matchedUser.email || matchedUser.mobileEmail}>`;

    // ─── 宛先・公開範囲の動的解析（デフォルト: 全社 / 全部署） ───
    let targetOffice = '全社';
    let targetDivision = '全部署';
    const extractedTags = new Set(['社内メール']);

    const lines = rawText.split(/\r?\n/);
    let firstLineIndex = -1;
    for (let idx = 0; idx < lines.length; idx++) {
      if (lines[idx].trim().length > 0) {
        firstLineIndex = idx;
        break;
      }
    }

    let isFirstLineHeaderInstruction = false;
    let bodyTextForContent = rawText;

    if (firstLineIndex !== -1) {
      const firstLineRaw = lines[firstLineIndex].trim();
      const bracketMatch = firstLineRaw.match(/^[\[【\(「](.+?)[\]】\)」]$/);
      const prefixMatch = firstLineRaw.match(/^(?:タブ|タグ|カテゴリ|カテゴリー|宛先|対象|公開範囲|拠点|部署|scope)[\s:：]+(.+)$/i);
      const hashMatch = firstLineRaw.match(/^#([^\s#　]+)$/);

      let extractedDirective = '';
      if (bracketMatch) {
        extractedDirective = bracketMatch[1].trim();
        isFirstLineHeaderInstruction = true;
      } else if (prefixMatch) {
        extractedDirective = prefixMatch[1].trim();
        isFirstLineHeaderInstruction = true;
      } else if (hashMatch) {
        extractedDirective = hashMatch[1].trim();
        isFirstLineHeaderInstruction = true;
      }

      if (extractedDirective) {
        const knownOffices = ['本社', '名古屋支店', '名古屋', '静岡営業所', '静岡', '三河営業所', '三河', '三重営業所', '三重', '岐阜営業所', '岐阜', '東京支店', '東京', '大阪支店', '大阪'];
        const knownDivisions = ['管理部', '管理', '営業部', '営業', '設計部', '設計', '工務部', '工務', '保守部', '保守', '総務部', '総務', '製造部', '製造', '開発部', '開発', 'IT', '人事', '経理'];

        for (const o of knownOffices) {
          if (extractedDirective.includes(o)) {
            targetOffice = o.replace(/支店|営業所$/, '');
            break;
          }
        }
        for (const d of knownDivisions) {
          if (extractedDirective.includes(d)) {
            targetDivision = d.replace(/部$/, '');
            break;
          }
        }

        const tokens = extractedDirective.split(/[\/\s,、|｜・]+/).map(t => t.replace(/^[#＃\[\]【】\(\)]/, '').trim()).filter(Boolean);
        tokens.forEach(t => { if (t && t !== '全社' && t !== '全部署') extractedTags.add(t); });

        if (isFirstLineHeaderInstruction) {
          const remainingLines = [...lines];
          remainingLines.splice(firstLineIndex, 1);
          while (remainingLines.length > 0 && remainingLines[0].trim() === '') remainingLines.shift();
          bodyTextForContent = remainingLines.join('\n');
        }
      }
    }

    const tagMatches = `${mailSubject} ${rawText}`.match(/#([^\s#　]+)/g);
    if (tagMatches) {
      tagMatches.forEach(t => {
        const cleanTag = t.replace(/^#/, '').trim();
        if (cleanTag && cleanTag !== '社内メール') extractedTags.add(cleanTag);
      });
    }

    const targetDisplay = (targetOffice === '全社' && targetDivision === '全部署') ? '全社 / 全部署' : `${targetOffice} / ${targetDivision}`;
    const targetScope = (targetOffice === '全社' && targetDivision === '全部署') ? '全社' : '特定部署';
    const formattedContent = `${bodyTextForContent}\n\n───────────────\n📧 メール受信情報\n差出人: ${fromDisplay}\n宛先: ${targetDisplay}\n送信日時: ${mailDateStr}\n添付ファイル: ${attachmentsList.length} 件`;
    const topicId = `topic_mail_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
    const nowIso = parsed.date ? new Date(parsed.date).toISOString() : new Date().toISOString();

    const newTopic = {
      id: topicId,
      title: mailSubject,
      content: formattedContent,
      category: 'general',
      tags: Array.from(extractedTags),
      office: targetOffice,
      division: targetDivision,
      scope: targetScope,
      authorId: matchedUser.id,
      author: {
        id: matchedUser.id,
        name: matchedUser.name,
        department: matchedUser.department || matchedUser.division || '',
        office: matchedUser.office || '',
        avatarUrl: matchedUser.avatarUrl || '',
        position: matchedUser.position || ''
      },
      attachments: attachmentsList,
      hasPeriod: false,
      isPinned: false,
      views: 0,
      likes: 0,
      comments: [],
      commentsCount: 0,
      viewers: [],
      createdAt: nowIso,
      updatedAt: new Date().toISOString()
    };

    // ① JSON永続化（二重バックアップ）
    const bulletinsList = loadBulletins();
    bulletinsList.unshift(newTopic);
    saveBulletins(bulletinsList);

    // ② MS SQL Server (dbo.Bulletins) 永続化（★ matchedUser.office ではなく targetOffice をバインド！）
    if (pool) {
      try {
        await pool.request()
          .input('id', sql.VarChar(100), String(topicId))
          .input('title', sql.NVarChar(500), mailSubject)
          .input('content', sql.NVarChar(sql.MAX), formattedContent)
          .input('category', sql.NVarChar(100), 'general')
          .input('authorId', sql.VarChar(100), String(matchedUser.id))
          .input('isPinned', sql.Bit, 0)
          .input('office', sql.NVarChar(100), targetOffice)
          .input('division', sql.NVarChar(100), targetDivision)
          .input('scope', sql.NVarChar(100), targetScope)
          .input('tags', sql.NVarChar(sql.MAX), Array.from(extractedTags).join(','))
          .input('attachments', sql.NVarChar(sql.MAX), attachmentsList.length > 0 ? JSON.stringify(attachmentsList) : null)
          .query(`
            IF NOT EXISTS (SELECT 1 FROM dbo.Bulletins WHERE id = @id)
            INSERT INTO dbo.Bulletins (id, title, content, category, authorId, isPinned, office, division, scope, tags, attachments, createdAt, views, likes)
            VALUES (@id, @title, @content, @category, @authorId, @isPinned, @office, @division, @scope, @tags, @attachments, GETDATE(), 0, 0)
          `);
        console.log(`[POP3] SQL Server dbo.Bulletins inserted: ${topicId} (${targetOffice} / ${targetDivision})`);
      } catch (sqlErr) {
        console.warn('[POP3] SQL Server Insert Warning:', sqlErr.message);
      }
    }

    pop3State.totalImportedCount++;
    addPop3Log('success', `メール投稿完了: 「${mailSubject}」（投稿者: ${matchedUser.name}様, 宛先: ${targetDisplay}）`);
    return { imported: true, topicId };
  } catch (err) {
    addPop3Log('error', `メールパースエラー: ${err.message}`);
    return { imported: false, reason: err.message };
  }
}

let lastPollStartedAt = 0;
export async function pollPop3InboundEmails() {
  if (pop3State.isPolling && Date.now() - lastPollStartedAt > 20000) {
    pop3State.isPolling = false;
  }

  if (pop3State.isPolling) {
    return { checked: true, found: 0, imported: 0, deleted: 0, message: 'ポーリング実行中です。' };
  }

  pop3State.isPolling = true;
  lastPollStartedAt = Date.now();
  pop3State.lastCheckStatus = 'checking';
  const client = new Pop3SocketClient();

  try {
    addPop3Log('info', `POP3 サーバー (${pop3Config.host}:${pop3Config.port}) に接続中... (ユーザー: ${pop3Config.user})`);
    await client.connect(pop3Config.host, pop3Config.port, 12000);
    await client.sendCommand(`USER ${pop3Config.user}`);
    await client.sendCommand(`PASS ${pop3Config.pass}`);
    const statRes = await client.sendCommand('STAT');
    const msgCount = parseInt(statRes.split(' ')[1] || '0', 10);
    pop3State.lastCheckedAt = new Date().toISOString();

    if (msgCount === 0) {
      await client.sendCommand('QUIT');
      client.close();
      pop3State.lastCheckStatus = 'success';
      pop3State.lastCheckMessage = '新着メールはありません (0 件)';
      return { checked: true, found: 0, imported: 0, deleted: 0, message: '新着メールはありません (0 件)' };
    }

    addPop3Log('info', `POP3 サーバー上に ${msgCount} 件のメールを検出しました。`);
    let importedCount = 0;
    let deletedCount = 0;

    for (let i = 1; i <= msgCount; i++) {
      try {
        const retrRes = await client.sendMultilineCommand(`RETR ${i}`);
        const res = await processIncomingEmail(retrRes.raw);
        if (res.imported) importedCount++;
        if (pop3Config.deleteAfterImport) {
          await client.sendCommand(`DELE ${i}`);
          deletedCount++;
        }
      } catch (msgErr) {
        addPop3Log('error', `メール #${i} の取得エラー: ${msgErr.message}`);
      }
    }

    await client.sendCommand('QUIT');
    client.close();
    pop3State.lastCheckStatus = 'success';
    const summaryMsg = `受信完了: 検出 ${msgCount} 件, 掲示板掲載 ${importedCount} 件, 削除 ${deletedCount} 件`;
    pop3State.lastCheckMessage = summaryMsg;
    addPop3Log('success', summaryMsg);

    return { checked: true, found: msgCount, imported: importedCount, deleted: deletedCount, message: summaryMsg };
  } catch (err) {
    client.close();
    pop3State.lastCheckedAt = new Date().toISOString();
    pop3State.lastCheckStatus = 'error';
    const errMsg = `POP3 接続・受信エラー: ${err.message}`;
    pop3State.lastCheckMessage = errMsg;
    addPop3Log('error', errMsg);
    return { checked: false, found: 0, imported: 0, deleted: 0, message: errMsg };
  } finally {
    pop3State.isPolling = false;
  }
}

if (pop3Config.checkIntervalSec > 0) {
  setInterval(() => { pollPop3InboundEmails().catch(() => {}); }, pop3Config.checkIntervalSec * 1000);
}

router.get(['/email/inbound/status', '/email/inbound/status/'], async (req, res) => {
  let allUsers = [];
  try {
    const pool = await getPool();
    if (pool) {
      const userRes = await pool.request().query('SELECT * FROM dbo.Users');
      allUsers = userRes.recordset;
    }
  } catch (e) {}

  const whitelistUsers = allUsers.filter(u => !!(u.email?.trim() || u.mobile_email?.trim() || u.mobileEmail?.trim()));
  res.json({
    config: pop3Config,
    whitelist: {
      totalMembers: allUsers.length,
      whitelistedMembersCount: whitelistUsers.length,
      members: whitelistUsers.map(u => ({
        id: u.id,
        name: u.name,
        department: u.department || u.division,
        email: u.email,
        mobileEmail: u.mobile_email || u.mobileEmail
      }))
    },
    state: pop3State
  });
});

router.post(['/email/inbound/check-now', '/email/inbound/check-now/'], async (req, res) => {
  try {
    const result = await pollPop3InboundEmails();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/email/inbound/simulate', '/email/inbound/simulate/'], async (req, res) => {
  try {
    const senderEmail = req.body.senderEmail || req.body.from;
    const subject = req.body.subject || '【連絡】社内メールからのテスト投稿';
    const body = req.body.body || req.body.text || '社内メール受信連携のテスト投稿です。';

    if (!senderEmail) {
      return res.status(400).json({ error: '送信者メールアドレス (senderEmail) を指定してください。' });
    }

    const mockRawEmail = [
      `From: "テスト送信者" <${senderEmail}>`,
      `To: <${pop3Config.fromAddress}>`,
      `Subject: ${subject}`,
      `Date: ${new Date().toUTCString()}`,
      `Message-ID: <simulated-${Date.now()}@teraoka-ads.co.jp>`,
      `Content-Type: text/plain; charset=utf-8`,
      ``,
      body
    ].join('\r\n');

    const processRes = await processIncomingEmail(Buffer.from(mockRawEmail, 'utf8'));
    res.json({
      success: processRes.imported,
      message: processRes.imported ? 'テストメールを掲示板へ正常に投稿しました。' : `投稿スキップ: ${processRes.reason}`,
      details: processRes
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 後方互換性エイリアス
router.get(['/pop3/status', '/email/pop3/status'], (req, res) => {
  res.json({
    config: pop3Config,
    state: pop3State
  });
});

router.post(['/pop3/poll', '/email/pop3/poll', '/pop3/fetch-now'], async (req, res) => {
  try {
    const result = await pollPop3InboundEmails();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
