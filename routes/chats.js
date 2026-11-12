import { Router } from 'express';
import sql from 'mssql';
import fs from 'fs';
import path from 'path';
import { getPool } from '../db.js';
import * as configModule from '../config.js';

const router = Router();

// app.use('/api/chats', chatsRouter) マウント時にも内部で /chats プレフィックスへ正規化
router.use((req, res, next) => {
  if (req.baseUrl && /\/chats\/?$/i.test(req.baseUrl) && !/^\/chats(\/|\?|$)/i.test(req.url)) {
    req.url = '/chats' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

// 安全なJSONパースヘルパー
function safeParseJSON(str, fallback = null) {
  if (typeof configModule.safeParseJSON === 'function') {
    return configModule.safeParseJSON(str, fallback);
  }
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

const baseDataDir = configModule.dataDir || path.join(process.cwd(), 'data');
const QUIZZES_FILE = path.join(baseDataDir, 'chat-quizzes.json');
const ANSWERS_FILE = path.join(baseDataDir, 'chat-quiz-answers.json');

// クイズ集計レスポンス生成ヘルパー（未回答者向けマスク＆割合計算・初回描画用）
function buildQuizResponse(quiz, answers, viewerUserId) {
  const options = Array.isArray(quiz.options) ? quiz.options : safeParseJSON(quiz.options, []);
  const viewerIdStr = viewerUserId ? String(viewerUserId) : '';
  const myAnswer = viewerIdStr
    ? answers.find((a) => String(a.userId) === viewerIdStr)
    : null;
  const hasAnswered = Boolean(myAnswer);
  const isAuthor = Boolean(viewerIdStr && String(quiz.createdById) === viewerIdStr);
  const canSeeAnswers = hasAnswered || isAuthor;

  const totalAnswers = answers.length;

  const results = options.map((opt) => {
    const optAnswers = answers.filter((a) => String(a.selectedOptionId) === String(opt.id));
    const count = optAnswers.length;
    const percent = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
    const voters = optAnswers.map((a) => ({
      userId: String(a.userId),
      userName: a.userName || 'メンバー',
      userAvatar: a.userAvatar || '',
      userDepartment: a.userDepartment || '',
      answeredAt: a.answeredAt instanceof Date ? a.answeredAt.toISOString() : String(a.answeredAt || ''),
    }));

    return {
      id: opt.id,
      text: opt.text,
      count: canSeeAnswers ? count : 0,
      percent: canSeeAnswers ? percent : 0,
      voters: canSeeAnswers ? voters : [],
    };
  });

  return {
    id: String(quiz.id),
    messageId: String(quiz.messageId || ''),
    roomId: String(quiz.roomId || ''),
    question: quiz.question || '',
    options,
    correctOptionId: canSeeAnswers ? (quiz.correctOptionId || null) : null,
    isSurvey: Boolean(quiz.isSurvey),
    explanation: canSeeAnswers ? (quiz.explanation || '') : null,
    createdById: String(quiz.createdById || ''),
    createdByName: quiz.createdByName || '出題者',
    createdAt: quiz.createdAt instanceof Date ? quiz.createdAt.toISOString() : String(quiz.createdAt || ''),
    hasAnswered,
    myAnswerOptionId: myAnswer ? String(myAnswer.selectedOptionId) : null,
    totalAnswers,
    results: canSeeAnswers
      ? results
      : results.map((r) => ({ id: r.id, text: r.text, count: 0, percent: 0, voters: [] })),
    viewerUserId: viewerIdStr,
  };
}

// メッセージ配列内の全クイズに対して一括（バッチ）でクイズ本体＆回答状況を付与するヘルパー
async function attachQuizzesToMessages(pool, messages, viewerUserId) {
  if (!Array.isArray(messages) || messages.length === 0) return messages;

  const quizMsgs = messages.filter(
    (m) => m && (m.type === 'quiz' || m.quizId || (typeof m.id === 'string' && m.id.startsWith('m_quiz_')))
  );
  if (quizMsgs.length === 0) return messages;

  const lookupSet = new Set();
  for (const m of quizMsgs) {
    if (m.quizId) lookupSet.add(String(m.quizId));
    if (m.id) lookupSet.add(String(m.id));
  }
  const lookupIds = Array.from(lookupSet).filter(Boolean).slice(0, 200);
  if (lookupIds.length === 0) return messages;

  const quizByIdMap = new Map();
  const quizByMsgIdMap = new Map();
  const answersByQuizIdMap = new Map();

  // 1. MS SQL Server (dbo.ChatQuizzes & dbo.ChatQuizAnswers) から一括取得
  if (pool) {
    try {
      const qReq = pool.request();
      const paramNames = lookupIds.map((id, idx) => {
        const pName = `qid${idx}`;
        qReq.input(pName, sql.NVarChar(64), id);
        return `@${pName}`;
      });
      const inClause = paramNames.join(', ');

      const quizRes = await qReq.query(`
        IF OBJECT_ID('dbo.ChatQuizzes', 'U') IS NOT NULL
        BEGIN
          SELECT * FROM dbo.ChatQuizzes
          WHERE id IN (${inClause}) OR messageId IN (${inClause})
        END
      `);

      const quizRows = (quizRes && quizRes.recordset) ? quizRes.recordset : [];
      const actualQuizIds = [];

      for (const row of quizRows) {
        const qObj = {
          id: String(row.id),
          messageId: String(row.messageId || ''),
          roomId: String(row.roomId || ''),
          question: row.question || '',
          options: safeParseJSON(row.options, []),
          correctOptionId: row.correctOptionId ? String(row.correctOptionId) : null,
          isSurvey: Boolean(row.isSurvey),
          explanation: row.explanation || '',
          createdById: String(row.createdById || ''),
          createdByName: row.createdByName || '出題者',
          createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt || ''),
        };
        quizByIdMap.set(qObj.id, qObj);
        if (qObj.messageId) quizByMsgIdMap.set(qObj.messageId, qObj);
        actualQuizIds.push(qObj.id);
      }

      if (actualQuizIds.length > 0) {
        const aReq = pool.request();
        const aParamNames = actualQuizIds.slice(0, 200).map((id, idx) => {
          const pName = `aqid${idx}`;
          aReq.input(pName, sql.NVarChar(64), id);
          return `@${pName}`;
        });
        const ansRes = await aReq.query(`
          IF OBJECT_ID('dbo.ChatQuizAnswers', 'U') IS NOT NULL
          BEGIN
            SELECT * FROM dbo.ChatQuizAnswers
            WHERE quizId IN (${aParamNames.join(', ')})
            ORDER BY answeredAt ASC
          END
        `);
        const ansRows = (ansRes && ansRes.recordset) ? ansRes.recordset : [];
        for (const a of ansRows) {
          const qId = String(a.quizId);
          if (!answersByQuizIdMap.has(qId)) {
            answersByQuizIdMap.set(qId, []);
          }
          answersByQuizIdMap.get(qId).push({
            id: String(a.id),
            quizId: qId,
            userId: String(a.userId),
            userName: a.userName || 'メンバー',
            userAvatar: a.userAvatar || '',
            userDepartment: a.userDepartment || '',
            selectedOptionId: String(a.selectedOptionId),
            answeredAt: a.answeredAt instanceof Date ? a.answeredAt.toISOString() : String(a.answeredAt || ''),
          });
        }
      }
    } catch (dbQuizErr) {
      console.warn('[Chats] Batch quiz load notice:', dbQuizErr.message);
    }
  }

  // 2. ローカルJSONフォールバック (DBに未登録のクイズがある場合のみ補完)
  const hasUnresolved = quizMsgs.some((m) => {
    const q = (m.quizId && quizByIdMap.get(String(m.quizId))) || quizByMsgIdMap.get(String(m.id)) || quizByIdMap.get(String(m.id));
    return !q;
  });

  if (hasUnresolved) {
    try {
      if (fs.existsSync(QUIZZES_FILE)) {
        const rawQuizzes = await fs.promises.readFile(QUIZZES_FILE, 'utf8');
        const localQuizzes = safeParseJSON(rawQuizzes, []);
        let localAnswers = [];
        if (fs.existsSync(ANSWERS_FILE)) {
          const rawAnswers = await fs.promises.readFile(ANSWERS_FILE, 'utf8');
          localAnswers = safeParseJSON(rawAnswers, []);
        }
        for (const lq of (Array.isArray(localQuizzes) ? localQuizzes : [])) {
          if (!lq || !lq.id) continue;
          const qId = String(lq.id);
          if (!quizByIdMap.has(qId)) {
            quizByIdMap.set(qId, lq);
            if (lq.messageId) quizByMsgIdMap.set(String(lq.messageId), lq);
            const ansForLq = (Array.isArray(localAnswers) ? localAnswers : []).filter(
              (a) => a && String(a.quizId) === qId
            );
            answersByQuizIdMap.set(qId, ansForLq);
          }
        }
      }
    } catch (_) {}
  }

  // 3. 各クイズメッセージへ msg.quiz を同期付与
  for (const m of quizMsgs) {
    const matchedQuiz =
      (m.quizId && quizByIdMap.get(String(m.quizId))) ||
      quizByMsgIdMap.get(String(m.id)) ||
      quizByIdMap.get(String(m.id));

    if (matchedQuiz) {
      const answers = answersByQuizIdMap.get(String(matchedQuiz.id)) || [];
      m.type = 'quiz';
      m.quizId = String(matchedQuiz.id);
      m.quiz = buildQuizResponse(matchedQuiz, answers, viewerUserId);
    }
  }

  return messages;
}

// スキーマ拡張・インデックス作成・カラム一覧キャッシュ（プロセス起動後1回のみ実行）
let isChatSchemaEnsured = false;
let cachedRoomColumns = null;

async function ensureChatSchemaOnce(pool) {
  if (isChatSchemaEnsured && Array.isArray(cachedRoomColumns)) {
    return cachedRoomColumns;
  }
  try {
    await pool.request().query(`
      IF COL_LENGTH('dbo.ChatMessages', 'imagesJson') IS NULL ALTER TABLE dbo.ChatMessages ADD imagesJson NVARCHAR(MAX) NULL;
      IF COL_LENGTH('dbo.ChatMessages', 'thumbnailUrl') IS NULL ALTER TABLE dbo.ChatMessages ADD thumbnailUrl NVARCHAR(MAX) NULL;
      IF COL_LENGTH('dbo.ChatMessages', 'quizId') IS NULL ALTER TABLE dbo.ChatMessages ADD quizId NVARCHAR(64) NULL;
      IF COL_LENGTH('dbo.ChatMessages', 'viewersJson') IS NULL ALTER TABLE dbo.ChatMessages ADD viewersJson NVARCHAR(MAX) NULL;

      IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_ChatMessages_RoomId_CreatedAt' AND object_id = OBJECT_ID('dbo.ChatMessages'))
      BEGIN
        CREATE NONCLUSTERED INDEX IX_ChatMessages_RoomId_CreatedAt
        ON dbo.ChatMessages (roomId ASC, createdAt DESC);
      END
    `);
  } catch (err) {
    console.warn('[Chats] Schema/Index initialization notice:', err.message);
  }

  try {
    const columnsRes = await pool.request().query(
      "SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ChatRooms' AND TABLE_SCHEMA = 'dbo'"
    );
    cachedRoomColumns = (columnsRes.recordset || []).map(row => row.COLUMN_NAME);
    isChatSchemaEnsured = true;
  } catch (_) {
    cachedRoomColumns = ['id', 'name', 'type', 'avatarUrl', 'lastMessage', 'updatedAt', 'participantsJson', 'adminIdsJson'];
  }
  return cachedRoomColumns;
}

// DBメッセージ行をフロントエンド形式へ変換する共通ヘルパー
function mapMessageRow(m) {
  const parsedImages = safeParseJSON(m.imagesJson || m.images, null);
  return {
    id: String(m.id),
    roomId: String(m.roomId),
    sender: {
      id: String(m.senderId),
      name: m.senderName || '不明',
      avatarUrl: m.senderAvatar || '',
      department: m.senderDepartment || ''
    },
    content: m.message || m.content || '',
    createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
    type: m.type || 'text',
    imageUrl: m.imageUrl || null,
    thumbnailUrl: m.thumbnailUrl || null,
    images: Array.isArray(parsedImages) ? parsedImages : undefined,
    stampId: m.stampId || null,
    stampText: m.stampText || null,
    stampCategory: m.stampCategory || null,
    attachments: safeParseJSON(m.attachments || m.attachmentsJson, []),
    quizId: m.quizId ? String(m.quizId) : null,
    viewers: safeParseJSON(m.viewersJson || m.viewers, []).map(v => ({
      ...v,
      user: v.user ? { ...v.user, id: String(v.user.id) } : { id: String(v.userId || v.id || '') }
    }))
  };
}

// チャットルーム一覧 & 各ルームの最新N件メッセージ高速取得 (O(M) Map集計 + クイズ一括同梱)
router.get(['/chats', '/chats/', '/chats/rooms', '/chats/rooms/'], async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.json([]);

    await ensureChatSchemaOnce(pool);

    const viewerUserId = req.query.userId ? String(req.query.userId) : '';
    const allMessages = req.query.allMessages === 'true';
    const parsedLimit = parseInt(String(req.query.msgLimit || '50'), 10);
    const msgLimit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 500) : 50;

    const roomsResult = await pool.request().query('SELECT * FROM dbo.ChatRooms ORDER BY updatedAt DESC');

    let msgsResult;
    if (allMessages) {
      msgsResult = await pool.request().query(`
        SELECT
          m.*,
          u.name AS senderName,
          u.avatarUrl AS senderAvatar,
          u.department AS senderDepartment,
          COUNT(1) OVER (PARTITION BY m.roomId) AS totalRoomMsgs
        FROM dbo.ChatMessages m
        LEFT JOIN dbo.Users u ON m.senderId = u.id
        ORDER BY m.createdAt ASC
      `);
    } else {
      msgsResult = await pool.request()
        .input('msgLimit', sql.Int, msgLimit)
        .query(`
          WITH RankedMessages AS (
            SELECT
              m.*,
              u.name AS senderName,
              u.avatarUrl AS senderAvatar,
              u.department AS senderDepartment,
              ROW_NUMBER() OVER (PARTITION BY m.roomId ORDER BY m.createdAt DESC) AS rn,
              COUNT(1) OVER (PARTITION BY m.roomId) AS totalRoomMsgs
            FROM dbo.ChatMessages m
            LEFT JOIN dbo.Users u ON m.senderId = u.id
          )
          SELECT *
          FROM RankedMessages
          WHERE rn <= @msgLimit
          ORDER BY roomId ASC, createdAt ASC
        `);
    }

    // O(M) でルームごとにメッセージをグループ化
    const messagesByRoomMap = new Map();
    const totalCountByRoomMap = new Map();
    const allMappedMessages = [];

    for (const m of (msgsResult.recordset || [])) {
      const rId = String(m.roomId);
      if (!messagesByRoomMap.has(rId)) {
        messagesByRoomMap.set(rId, []);
      }
      const mappedMsg = mapMessageRow(m);
      messagesByRoomMap.get(rId).push(mappedMsg);
      allMappedMessages.push(mappedMsg);
      if (m.totalRoomMsgs !== undefined && m.totalRoomMsgs !== null) {
        totalCountByRoomMap.set(rId, Number(m.totalRoomMsgs));
      }
    }

    // クイズメッセージが含まれる場合、一括でクイズ本体・回答状況を同梱（初回描画時のサイズ確定用）
    await attachQuizzesToMessages(pool, allMappedMessages, viewerUserId);

    const rooms = (roomsResult.recordset || []).map(r => {
      const rId = String(r.id);
      const participants = safeParseJSON(r.participantsJson || r.participants, []);
      const adminIds = safeParseJSON(r.adminIdsJson || r.adminIds, []);
      const isoUpdatedAt = r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString();
      const roomMessages = messagesByRoomMap.get(rId) || [];
      const totalMessagesCount = totalCountByRoomMap.has(rId) ? totalCountByRoomMap.get(rId) : roomMessages.length;

      return {
        id: rId,
        name: r.name,
        type: r.type,
        avatarUrl: r.avatarUrl || null,
        lastMessage: r.lastMessage || '',
        updatedAt: isoUpdatedAt,
        lastUpdated: isoUpdatedAt,
        participants,
        adminIds,
        messages: roomMessages,
        totalMessagesCount,
        hasMoreMessages: totalMessagesCount > roomMessages.length
      };
    });

    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 特定ルームの過去メッセージ履歴ページネーション取得 API (上スクロール時の遅延読み込み用 + クイズ一括同梱)
router.get(['/chats/:roomId/messages', '/chats/rooms/:roomId/messages', '/rooms/:roomId/messages', '/:roomId/messages'], async (req, res) => {
  const { roomId } = req.params;
  const beforeStr = req.query.before ? String(req.query.before) : null;
  const viewerUserId = req.query.userId ? String(req.query.userId) : '';
  const parsedLimit = parseInt(String(req.query.limit || '50'), 10);
  const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 200) : 50;

  try {
    const pool = await getPool();
    if (!pool) return res.json({ messages: [], hasMore: false });

    await ensureChatSchemaOnce(pool);

    const request = pool.request()
      .input('roomId', sql.VarChar, String(roomId))
      .input('fetchCount', sql.Int, limit + 1);

    let whereClause = 'WHERE m.roomId = @roomId';
    if (beforeStr) {
      const beforeDate = new Date(beforeStr);
      if (!isNaN(beforeDate.getTime())) {
        request.input('beforeDate', sql.DateTime2, beforeDate);
        whereClause += ' AND m.createdAt < @beforeDate';
      }
    }

    const result = await request.query(`
      SELECT TOP (@fetchCount)
        m.*,
        u.name AS senderName,
        u.avatarUrl AS senderAvatar,
        u.department AS senderDepartment
      FROM dbo.ChatMessages m
      LEFT JOIN dbo.Users u ON m.senderId = u.id
      ${whereClause}
      ORDER BY m.createdAt DESC
    `);

    const rows = result.recordset || [];
    const hasMore = rows.length > limit;
    const slicedRows = hasMore ? rows.slice(0, limit) : rows;
    // 時系列順（古い順 -> 新しい順）に並び替えて返却
    const messages = slicedRows.reverse().map(mapMessageRow);

    // 過去履歴内のクイズメッセージにも一括でクイズ本体・回答状況を同梱
    await attachQuizzesToMessages(pool, messages, viewerUserId);

    res.json({
      roomId: String(roomId),
      messages,
      hasMore
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新規チャットルーム作成
router.post(['/chats/rooms', '/chats/room', '/rooms', '/room'], async (req, res) => {
  try {
    const { id, name, type, avatarUrl, participants, adminIds } = req.body;
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    const roomId = id || `c_${Date.now()}`;
    const roomName = name || (type === 'dm' ? 'ダイレクトトーク' : 'グループトーク');
    const roomType = type || 'group';
    const participantsStr = participants ? (typeof participants === 'object' ? JSON.stringify(participants) : participants) : '[]';
    const adminIdsStr = adminIds ? (typeof adminIds === 'object' ? JSON.stringify(adminIds) : adminIds) : '[]';

    const dbColumns = await ensureChatSchemaOnce(pool);

    const insertCols = ['id', 'name', 'type', 'avatarUrl', 'lastMessage', 'updatedAt'];
    const insertVals = ['@id', '@name', '@type', '@avatarUrl', "''", 'GETDATE()'];

    if (dbColumns.includes('last_updated')) {
      insertCols.push('last_updated');
      insertVals.push('GETDATE()');
    }

    const request = pool.request()
      .input('id', sql.VarChar, roomId)
      .input('name', sql.NVarChar, roomName)
      .input('type', sql.NVarChar, roomType)
      .input('avatarUrl', sql.VarChar, avatarUrl || null);

    if (participants !== undefined) {
      const colName = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (colName) {
        insertCols.push(colName);
        insertVals.push('@participantsJson');
        request.input('participantsJson', sql.NVarChar, participantsStr);
      }
    }

    if (adminIds !== undefined) {
      const colName = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (colName) {
        insertCols.push(colName);
        insertVals.push('@adminIdsJson');
        request.input('adminIdsJson', sql.NVarChar, adminIdsStr);
      }
    }

    await request.query(`INSERT INTO dbo.ChatRooms (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')})`);
    res.status(201).json({ success: true, id: roomId, message: 'チャットルーム作成完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// メッセージ送信
router.post(['/chats', '/chats/', '/chats/message', '/chats/message/'], async (req, res) => {
  try {
    const { senderId, roomId, message, content, attachments, roomName, roomType, participants, type, imageUrl, thumbnailUrl, images, stampId, stampText, stampCategory, adminIds } = req.body;
    const msgContent = message || content || '';
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    const dbColumns = await ensureChatSchemaOnce(pool);

    const id = req.body.id || `c-${Date.now()}`;
    const targetRoomId = roomId || 'r1';
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;
    const imagesStr = images ? (typeof images === 'object' ? JSON.stringify(images) : images) : null;
    const msgType = type || 'text';

    // ルームが存在しない場合の自動作成
    const roomCheck = await pool.request()
      .input('roomId', sql.VarChar, String(targetRoomId))
      .query('SELECT 1 FROM dbo.ChatRooms WHERE id = @roomId');

    if ((roomCheck.recordset || []).length === 0) {
      const rName = roomName || (roomType === 'dm' ? 'ダイレクトトーク' : '新規グループトーク');
      const rType = roomType || 'group';
      const participantsStr = participants ? (typeof participants === 'object' ? JSON.stringify(participants) : participants) : '[]';
      const admins = adminIds ? (Array.isArray(adminIds) ? adminIds : [adminIds]) : (rType === 'group' && senderId ? [senderId] : []);
      const adminIdsStr = JSON.stringify(admins);

      const insertCols = ['id', 'name', 'type', 'lastMessage', 'updatedAt'];
      const insertVals = ['@roomId', '@name', '@type', "''", 'GETDATE()'];

      if (dbColumns.includes('last_updated')) {
        insertCols.push('last_updated');
        insertVals.push('GETDATE()');
      }

      const request = pool.request()
        .input('roomId', sql.VarChar, String(targetRoomId))
        .input('name', sql.NVarChar, rName)
        .input('type', sql.NVarChar, rType);

      const partCol = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (partCol) {
        insertCols.push(partCol);
        insertVals.push('@participantsJson');
        request.input('participantsJson', sql.NVarChar, participantsStr);
      }

      const adminCol = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (adminCol) {
        insertCols.push(adminCol);
        insertVals.push('@adminIdsJson');
        request.input('adminIdsJson', sql.NVarChar, adminIdsStr);
      }

      await request.query(`INSERT INTO dbo.ChatRooms (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')})`);
    }

    // 送信者を初期既読者に追加
    let initialViewers = [];
    if (senderId) {
      const userRes = await pool.request()
        .input('userId', sql.VarChar, String(senderId))
        .query('SELECT id, name, avatarUrl, department FROM dbo.Users WHERE id = @userId');
      if (userRes.recordset && userRes.recordset.length > 0) {
        const u = userRes.recordset[0];
        initialViewers.push({
          user: { id: String(u.id), name: u.name, avatarUrl: u.avatarUrl || '', department: u.department || '' },
          viewedAt: new Date().toISOString()
        });
      } else {
        initialViewers.push({
          user: { id: String(senderId), name: req.body.senderName || 'ユーザー', avatarUrl: req.body.senderAvatar || '', department: req.body.senderDepartment || '' },
          viewedAt: new Date().toISOString()
        });
      }
    }
    const viewersStr = JSON.stringify(initialViewers);

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('senderId', sql.VarChar, senderId || 'u1')
      .input('roomId', sql.VarChar, String(targetRoomId))
      .input('message', sql.NVarChar, msgContent)
      .input('content', sql.NVarChar, msgContent)
      .input('attachments', sql.NVarChar, attachStr)
      .input('type', sql.VarChar, msgType)
      .input('imageUrl', sql.NVarChar, imageUrl || null)
      .input('thumbnailUrl', sql.NVarChar, thumbnailUrl || null)
      .input('imagesJson', sql.NVarChar, imagesStr)
      .input('stampId', sql.VarChar, stampId || null)
      .input('stampText', sql.NVarChar, stampText || null)
      .input('stampCategory', sql.NVarChar, stampCategory || null)
      .input('viewersJson', sql.NVarChar, viewersStr)
      .query(`
        INSERT INTO dbo.ChatMessages (id, senderId, roomId, message, content, createdAt, attachments, type, imageUrl, thumbnailUrl, imagesJson, stampId, stampText, stampCategory, viewersJson) 
        VALUES (@id, @senderId, @roomId, @message, @content, GETDATE(), @attachments, @type, @imageUrl, @thumbnailUrl, @imagesJson, @stampId, @stampText, @stampCategory, @viewersJson)
      `);

    const updateRoomSql = dbColumns.includes('last_updated')
      ? 'UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE(), last_updated = GETDATE() WHERE id = @roomId'
      : 'UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE() WHERE id = @roomId';

    await pool.request()
      .input('roomId', sql.VarChar, String(targetRoomId))
      .input('lastMessage', sql.NVarChar, msgContent)
      .query(updateRoomSql);

    res.status(201).json({ id, message: 'メッセージ送信完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 複数メッセージ一括既読追加 API (ルーム入室時のN件並列POST防止用)
router.post(['/chats/:roomId/viewers/batch', '/chats/messages/viewers/batch', '/:roomId/viewers/batch', '/messages/viewers/batch'], async (req, res) => {
  const roomId = req.params.roomId || req.body.roomId;
  const { messageIds, user } = req.body;
  if (!user || !user.id) return res.status(400).json({ success: false, error: 'User is required' });

  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    await ensureChatSchemaOnce(pool);

    const targetIds = Array.isArray(messageIds) ? messageIds.map(id => String(id)).filter(Boolean) : [];
    if (targetIds.length === 0 && !roomId) {
      return res.json({ success: true, updatedCount: 0 });
    }

    const request = pool.request();
    let selectQuery = 'SELECT id, viewersJson FROM dbo.ChatMessages WHERE ';
    if (roomId) {
      request.input('roomId', sql.VarChar, String(roomId));
      selectQuery += 'roomId = @roomId';
    } else {
      const paramNames = targetIds.slice(0, 100).map((id, idx) => {
        const pName = `mId${idx}`;
        request.input(pName, sql.VarChar, id);
        return `@${pName}`;
      });
      selectQuery += `id IN (${paramNames.join(', ')})`;
    }

    const result = await request.query(selectQuery);
    const rows = result.recordset || [];
    const targetIdSet = targetIds.length > 0 ? new Set(targetIds) : null;
    const userIdStr = String(user.id);
    const nowIso = new Date().toISOString();
    const viewerEntry = {
      user: {
        id: userIdStr,
        name: user.name || '',
        avatarUrl: user.avatarUrl || '',
        department: user.department || ''
      },
      viewedAt: nowIso
    };

    let updatedCount = 0;
    for (const row of rows) {
      const msgId = String(row.id);
      if (targetIdSet && !targetIdSet.has(msgId)) continue;

      const currentViewers = safeParseJSON(row.viewersJson, []);
      const alreadyExists = currentViewers.some(
        v => v && String(v.user?.id || v.userId || v.id || '') === userIdStr
      );
      if (!alreadyExists) {
        const newViewers = [...currentViewers, viewerEntry];
        await pool.request()
          .input('messageId', sql.VarChar, msgId)
          .input('viewersJson', sql.NVarChar, JSON.stringify(newViewers))
          .query('UPDATE dbo.ChatMessages SET viewersJson = @viewersJson WHERE id = @messageId');
        updatedCount++;
      }
    }

    return res.status(200).json({ success: true, updatedCount, viewedAt: nowIso });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// メッセージ既読追加 API (単一メッセージ用・後方互換維持)
router.post(['/chats/messages/:messageId/viewers', '/messages/:messageId/viewers'], async (req, res) => {
  const { messageId } = req.params;
  const { user } = req.body;
  if (!user || !user.id) return res.status(400).json({ success: false, error: 'User is required' });
  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    const result = await pool.request()
      .input('messageId', sql.VarChar, messageId)
      .query('SELECT viewersJson FROM dbo.ChatMessages WHERE id = @messageId');
    
    if (result.recordset && result.recordset.length > 0) {
      const currentViewers = safeParseJSON(result.recordset[0].viewersJson, []);
      const alreadyExists = currentViewers.some(v => v && String(v.user?.id || v.userId || v.id || '') === String(user.id));
      if (!alreadyExists) {
        const newViewers = [...currentViewers, {
          user: { id: String(user.id), name: user.name || '', avatarUrl: user.avatarUrl || '', department: user.department || '' },
          viewedAt: new Date().toISOString()
        }];
        await pool.request()
          .input('messageId', sql.VarChar, String(messageId))
          .input('viewersJson', sql.NVarChar, JSON.stringify(newViewers))
          .query('UPDATE dbo.ChatMessages SET viewersJson = @viewersJson WHERE id = @messageId');
        return res.status(200).json({ success: true, viewers: newViewers });
      }
      return res.status(200).json({ success: true, viewers: currentViewers, message: 'Already marked as read' });
    } else {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// チャットルーム更新
router.put(['/chats/:roomId', '/chats/:roomId/', '/chats/rooms/:roomId'], async (req, res) => {
  const { roomId } = req.params;
  const { name, avatarUrl, participants, adminIds } = req.body;
  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    const dbColumns = await ensureChatSchemaOnce(pool);

    let query = 'UPDATE dbo.ChatRooms SET updatedAt = GETDATE()';
    if (dbColumns.includes('last_updated')) {
      query += ', last_updated = GETDATE()';
    }
    const request = pool.request().input('roomId', sql.VarChar, roomId);
    
    if (name !== undefined) {
      query += ', name = @name';
      request.input('name', sql.NVarChar, name);
    }
    if (avatarUrl !== undefined) {
      query += ', avatarUrl = @avatarUrl';
      request.input('avatarUrl', sql.VarChar, avatarUrl || null);
    }
    if (participants !== undefined) {
      const colName = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (colName) {
        query += `, ${colName} = @participantsJson`;
        request.input('participantsJson', sql.NVarChar, JSON.stringify(participants));
      }
    }
    if (adminIds !== undefined) {
      const colName = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (colName) {
        query += `, ${colName} = @adminIdsJson`;
        request.input('adminIdsJson', sql.NVarChar, JSON.stringify(adminIds));
      }
    }
    query += ' WHERE id = @roomId';
    await request.query(query);
    res.status(200).json({ success: true, message: 'チャットルーム情報を更新しました。' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// チャットルーム削除
router.delete(['/chats/:roomId', '/chats/:roomId/', '/chats/rooms/:roomId'], async (req, res) => {
  const { roomId } = req.params;
  try {
    const pool = await getPool(); 
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    await pool.request().input('roomId', sql.VarChar, roomId).query('DELETE FROM dbo.ChatMessages WHERE roomId = @roomId');
    await pool.request().input('roomId', sql.VarChar, roomId).query('DELETE FROM dbo.ChatRooms WHERE id = @roomId');
    await pool.request().input('roomId', sql.VarChar, roomId).query("DELETE FROM dbo.UserReadStatuses WHERE targetType = 'chat' AND targetId = @roomId");
    res.status(200).json({ success: true, message: 'チャットルームとメッセージを削除しました。' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 個別メッセージ削除
router.delete(['/chats/messages/:messageId', '/messages/:messageId'], async (req, res) => {
  const { messageId } = req.params;
  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    const dbColumns = await ensureChatSchemaOnce(pool);

    const msgResult = await pool.request().input('messageId', sql.VarChar, messageId).query('SELECT roomId FROM dbo.ChatMessages WHERE id = @messageId');
    if (msgResult.recordset && msgResult.recordset.length > 0) {
      const roomId = msgResult.recordset[0].roomId;
      await pool.request().input('messageId', sql.VarChar, messageId).query('DELETE FROM dbo.ChatMessages WHERE id = @messageId');
      const latestResult = await pool.request().input('roomId', sql.VarChar, roomId).query('SELECT TOP 1 message FROM dbo.ChatMessages WHERE roomId = @roomId ORDER BY createdAt DESC');
      const lastMsg = (latestResult.recordset && latestResult.recordset.length > 0) ? latestResult.recordset[0].message : '';

      const updateRoomSql = dbColumns.includes('last_updated')
        ? 'UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE(), last_updated = GETDATE() WHERE id = @roomId'
        : 'UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE() WHERE id = @roomId';

      await pool.request()
        .input('roomId', sql.VarChar, roomId)
        .input('lastMessage', sql.NVarChar, lastMsg)
        .query(updateRoomSql);
    }
    res.status(200).json({ success: true, message: 'メッセージを削除しました。' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
