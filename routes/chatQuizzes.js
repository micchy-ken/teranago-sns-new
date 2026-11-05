/**
 * =====================================================================
 * routes/chatQuizzes.js - チャット内クイズ・アンケート出題＆回答 API ルーター (完全堅牢＆DB永続化版)
 * 最終更新日時: 2026年11月5日
 * 改善内容:
 *  1. dataDir 未定義時の即死完全防止 (process.cwd() / 'data' 自動フォールバック)
 *  2. ensureFiles() の try-catch 完全保護 (パーミッションエラー等でのサーバー即死防止)
 *  3. safeParseJSON の安全なフォールバック関数内蔵
 *  4. MS SQL Server 永続化: dbo.ChatQuizzes, dbo.ChatQuizAnswers に加え、タイムライン表示用の dbo.ChatMessages(type='quiz', quizId) も完全同期INSERT
 *  5. チャットタイムライン内 n択カードUI出題(@quiz)・選択肢動的作成・正誤判定・アンケート対応・二重回答防止
 * =====================================================================
 */
import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import * as configModule from '../config.js';

const router = Router();

// 安全なJSONパースヘルパー（config.jsに無くても落ちない安全設計）
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

// データ保存ディレクトリ（未定義時もクラッシュさせない安全なフォールバック）
const baseDataDir = configModule.dataDir || path.join(process.cwd(), 'data');

// ローカルJSON保存先
const QUIZZES_FILE = path.join(baseDataDir, 'chat-quizzes.json');
const ANSWERS_FILE = path.join(baseDataDir, 'chat-quiz-answers.json');
const CHAT_ROOMS_FILE = path.join(baseDataDir, 'chat-rooms.json');

// 初期ファイル・ディレクトリ確保（エラー発生時もサーバーを絶対に落とさない try-catch 保護）
function ensureFiles() {
  try {
    if (!fs.existsSync(baseDataDir)) {
      fs.mkdirSync(baseDataDir, { recursive: true });
    }
    if (!fs.existsSync(QUIZZES_FILE)) {
      fs.writeFileSync(QUIZZES_FILE, '[]', 'utf8');
    }
    if (!fs.existsSync(ANSWERS_FILE)) {
      fs.writeFileSync(ANSWERS_FILE, '[]', 'utf8');
    }
  } catch (err) {
    console.warn('⚠️ [ChatQuizzes] ensureFiles warning (non-fatal):', err.message);
  }
}
ensureFiles();

// MS SQL Server テーブル初期化 ＆ マイグレーション
async function initTables(pool) {
  if (!pool) return;
  try {
    await pool.request().query(`
      -- クイズ基本テーブル
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ChatQuizzes' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.ChatQuizzes (
          id NVARCHAR(64) PRIMARY KEY,
          messageId NVARCHAR(64) NOT NULL,
          roomId NVARCHAR(64) NOT NULL,
          question NVARCHAR(MAX) NOT NULL,
          options NVARCHAR(MAX) NOT NULL,
          correctOptionId NVARCHAR(64) NULL,
          isSurvey BIT NOT NULL DEFAULT 0,
          explanation NVARCHAR(MAX) NULL,
          createdById NVARCHAR(64) NOT NULL,
          createdByName NVARCHAR(128) NOT NULL,
          createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_ChatQuizzes_messageId ON dbo.ChatQuizzes(messageId);
        CREATE INDEX IX_ChatQuizzes_roomId ON dbo.ChatQuizzes(roomId);
      END

      -- クイズ回答・投票テーブル
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'ChatQuizAnswers' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.ChatQuizAnswers (
          id NVARCHAR(64) PRIMARY KEY,
          quizId NVARCHAR(64) NOT NULL,
          userId NVARCHAR(64) NOT NULL,
          userName NVARCHAR(128) NOT NULL,
          userAvatar NVARCHAR(512) NULL,
          userDepartment NVARCHAR(128) NULL,
          selectedOptionId NVARCHAR(64) NOT NULL,
          answeredAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          CONSTRAINT UQ_ChatQuizAnswers_quiz_user UNIQUE (quizId, userId)
        );
        CREATE INDEX IX_ChatQuizAnswers_quizId ON dbo.ChatQuizAnswers(quizId);
        CREATE INDEX IX_ChatQuizAnswers_userId ON dbo.ChatQuizAnswers(userId);
      END

      -- 既存チャットメッセージテーブルに quizId カラムが存在しない場合は自動拡張
      IF OBJECT_ID('dbo.ChatMessages', 'U') IS NOT NULL AND COL_LENGTH('dbo.ChatMessages', 'quizId') IS NULL
      BEGIN
        ALTER TABLE dbo.ChatMessages ADD quizId NVARCHAR(64) NULL;
      END
    `);
  } catch (err) {
    console.warn('⚠️ [ChatQuizzes] DB table init failed (using JSON fallback):', err.message);
  }
}

// チャットメッセージへクイズを同期・反映するヘルパー (ローカルJSON用)
function attachQuizToChatMessage(roomId, messageId, quizData) {
  try {
    if (!fs.existsSync(CHAT_ROOMS_FILE)) return;
    const raw = fs.readFileSync(CHAT_ROOMS_FILE, 'utf8');
    const rooms = safeParseJSON(raw, []);
    const room = rooms.find((r) => String(r.id) === String(roomId));
    if (room && Array.isArray(room.messages)) {
      const msg = room.messages.find((m) => String(m.id) === String(messageId));
      if (msg) {
        msg.type = 'quiz';
        msg.quizId = quizData.id;
        msg.quiz = quizData;
      }
      fs.writeFileSync(CHAT_ROOMS_FILE, JSON.stringify(rooms, null, 2), 'utf8');
    }
  } catch (err) {
    console.error('⚠️ [ChatQuizzes] attachQuizToChatMessage error:', err);
  }
}

// 集計ヘルパー（未回答者向けマスク＆割合計算）
function buildQuizResponse(quiz, answers, viewerUserId) {
  const options = Array.isArray(quiz.options) ? quiz.options : safeParseJSON(quiz.options, []);
  const myAnswer = answers.find((a) => String(a.userId) === String(viewerUserId));
  const hasAnswered = Boolean(myAnswer);
  const isAuthor = String(quiz.createdById) === String(viewerUserId);
  const canSeeAnswers = hasAnswered || isAuthor;

  const totalAnswers = answers.length;

  const results = options.map((opt) => {
    const optAnswers = answers.filter((a) => String(a.selectedOptionId) === String(opt.id));
    const count = optAnswers.length;
    const percent = totalAnswers > 0 ? Math.round((count / totalAnswers) * 100) : 0;
    const voters = optAnswers.map((a) => ({
      userId: a.userId,
      userName: a.userName,
      userAvatar: a.userAvatar,
      userDepartment: a.userDepartment,
      answeredAt: a.answeredAt,
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
    id: quiz.id,
    messageId: quiz.messageId,
    roomId: quiz.roomId,
    question: quiz.question,
    options,
    // カンニング防止：未回答かつ出題者でない場合は正解・解説を秘匿
    correctOptionId: canSeeAnswers ? quiz.correctOptionId : null,
    isSurvey: Boolean(quiz.isSurvey),
    explanation: canSeeAnswers ? quiz.explanation : null,
    createdById: quiz.createdById,
    createdByName: quiz.createdByName,
    createdAt: quiz.createdAt,
    hasAnswered,
    myAnswerOptionId: myAnswer ? myAnswer.selectedOptionId : null,
    totalAnswers,
    results: canSeeAnswers ? results : results.map((r) => ({ id: r.id, text: r.text, count: 0, percent: 0, voters: [] })),
  };
}

// ==========================================
// 1. クイズ新規出題 (POST /api/chats/quizzes)
// ==========================================
router.post(['/quizzes', '/chats/quizzes', '/api/chats/quizzes', '/api/chat-quizzes'], async (req, res) => {
  try {
    const {
      roomId,
      question,
      options,
      correctOptionId,
      isSurvey = false,
      explanation = '',
      createdById,
      createdByName,
      senderAvatar = '',
      senderDepartment = '',
    } = req.body;

    if (!roomId || !question || !Array.isArray(options) || options.length < 2 || !createdById) {
      return res.status(400).json({ error: '問題文、2つ以上の選択肢、出題者情報は必須です' });
    }

    const quizId = `quiz_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const messageId = `m_quiz_${Date.now()}`;
    const nowIso = new Date().toISOString();
    const contentText = `【${isSurvey ? 'アンケート' : 'クイズ'}出題】${question.trim()}`;

    const normalizedOptions = options.map((opt, idx) => ({
      id: typeof opt === 'string' ? `opt_${idx + 1}` : opt.id || `opt_${idx + 1}`,
      text: typeof opt === 'string' ? opt.trim() : opt.text?.trim() || '',
    }));

    const quizRecord = {
      id: quizId,
      messageId,
      roomId: String(roomId),
      question: question.trim(),
      options: normalizedOptions,
      correctOptionId: isSurvey ? null : (correctOptionId || null),
      isSurvey: Boolean(isSurvey),
      explanation: explanation ? explanation.trim() : null,
      createdById: String(createdById),
      createdByName: createdByName || 'ユーザー',
      createdAt: nowIso,
    };

    const initialViewers = [{
      user: { id: String(createdById), name: createdByName || 'ユーザー', avatarUrl: senderAvatar || '', department: senderDepartment || '' },
      viewedAt: nowIso,
    }];
    const viewersJsonStr = JSON.stringify(initialViewers);

    const pool = await getPool();
    if (pool) {
      await initTables(pool);

      // 1. クイズテーブルに保存
      try {
        await pool.request()
          .input('id', sql.NVarChar(64), quizRecord.id)
          .input('messageId', sql.NVarChar(64), quizRecord.messageId)
          .input('roomId', sql.NVarChar(64), quizRecord.roomId)
          .input('question', sql.NVarChar(sql.MAX), quizRecord.question)
          .input('options', sql.NVarChar(sql.MAX), JSON.stringify(quizRecord.options))
          .input('correctOptionId', sql.NVarChar(64), quizRecord.correctOptionId)
          .input('isSurvey', sql.Bit, quizRecord.isSurvey ? 1 : 0)
          .input('explanation', sql.NVarChar(sql.MAX), quizRecord.explanation)
          .input('createdById', sql.NVarChar(64), quizRecord.createdById)
          .input('createdByName', sql.NVarChar(128), quizRecord.createdByName)
          .query(`
            INSERT INTO dbo.ChatQuizzes (
              id, messageId, roomId, question, options, correctOptionId,
              isSurvey, explanation, createdById, createdByName, createdAt
            ) VALUES (
              @id, @messageId, @roomId, @question, @options, @correctOptionId,
              @isSurvey, @explanation, @createdById, @createdByName, SYSUTCDATETIME()
            )
          `);
      } catch (insertQuizErr) {
        console.warn('⚠️ [ChatQuizzes] Insert into dbo.ChatQuizzes failed:', insertQuizErr.message);
      }

      // 2. チャットタイムライン (dbo.ChatMessages) にメッセージとして保存 (重要!)
      try {
        await pool.request()
          .input('msgId', sql.VarChar, messageId)
          .input('senderId', sql.VarChar, String(createdById))
          .input('roomId', sql.VarChar, String(roomId))
          .input('message', sql.NVarChar, contentText)
          .input('content', sql.NVarChar, contentText)
          .input('type', sql.VarChar, 'quiz')
          .input('quizId', sql.NVarChar(64), quizId)
          .input('viewersJson', sql.NVarChar, viewersJsonStr)
          .query(`
            INSERT INTO dbo.ChatMessages (
              id, senderId, roomId, message, content, type, quizId, viewersJson, createdAt
            ) VALUES (
              @msgId, @senderId, @roomId, @message, @content, @type, @quizId, @viewersJson, SYSUTCDATETIME()
            )
          `);

        // 3. ルームの最終メッセージを更新
        await pool.request()
          .input('roomId', sql.VarChar, String(roomId))
          .input('lastMessage', sql.NVarChar, contentText)
          .query(`
            UPDATE dbo.ChatRooms
            SET lastMessage = @lastMessage, updatedAt = SYSUTCDATETIME()
            WHERE id = @roomId
          `);
      } catch (msgErr) {
        console.warn('⚠️ [ChatQuizzes] Insert into dbo.ChatMessages failed:', msgErr.message);
      }
    }

    // ローカルJSONにも保存（フォールバック用）
    ensureFiles();
    try {
      const rawQuizzes = fs.existsSync(QUIZZES_FILE) ? fs.readFileSync(QUIZZES_FILE, 'utf8') : '[]';
      const quizzes = safeParseJSON(rawQuizzes, []);
      quizzes.unshift(quizRecord);
      fs.writeFileSync(QUIZZES_FILE, JSON.stringify(quizzes, null, 2), 'utf8');
    } catch (_) {}

    // チャットルームのタイムラインにクイズメッセージを追加
    let rawRooms = '[]';
    try {
      if (fs.existsSync(CHAT_ROOMS_FILE)) {
        rawRooms = fs.readFileSync(CHAT_ROOMS_FILE, 'utf8');
      }
    } catch (_) {}
    const rooms = safeParseJSON(rawRooms, []);
    let room = rooms.find((r) => String(r.id) === String(roomId));
    if (!room) {
      room = {
        id: String(roomId),
        name: 'トークルーム',
        type: 'group',
        participants: [],
        messages: [],
        updatedAt: nowIso,
        lastUpdated: nowIso,
      };
      rooms.push(room);
    }

    const quizResponseData = buildQuizResponse(quizRecord, [], createdById);

    const quizMessage = {
      id: messageId,
      roomId: String(roomId),
      sender: {
        id: String(createdById),
        name: createdByName || 'ユーザー',
        avatarUrl: senderAvatar || '',
        department: senderDepartment || '',
      },
      content: contentText,
      createdAt: nowIso,
      type: 'quiz',
      quizId,
      quiz: quizResponseData,
      viewers: initialViewers,
    };

    if (!Array.isArray(room.messages)) {
      room.messages = [];
    }
    room.messages.push(quizMessage);
    room.lastMessage = quizMessage.content;
    room.updatedAt = nowIso;
    room.lastUpdated = nowIso;

    try {
      fs.writeFileSync(CHAT_ROOMS_FILE, JSON.stringify(rooms, null, 2), 'utf8');
    } catch (_) {}

    res.status(201).json({
      success: true,
      quiz: quizResponseData,
      message: quizMessage,
    });
  } catch (err) {
    console.error('⚠️ [ChatQuizzes POST Create Error]:', err);
    res.status(500).json({ error: 'クイズの作成・出題に失敗しました', details: err.message });
  }
});

// ==========================================
// 2. クイズ詳細・回答状況取得 (GET /api/chats/quizzes/:quizId)
// ==========================================
router.get(['/:quizId', '/quizzes/:quizId', '/chats/quizzes/:quizId', '/api/chats/quizzes/:quizId', '/api/chat-quizzes/:quizId'], async (req, res) => {
  try {
    const { quizId } = req.params;
    const { userId } = req.query;

    const pool = await getPool();
    let quiz = null;
    let answers = [];

    if (pool) {
      await initTables(pool);
      // id または messageId のどちらでもヒット可能にする
      const quizRes = await pool.request()
        .input('queryId', sql.NVarChar(64), quizId)
        .query('SELECT * FROM dbo.ChatQuizzes WHERE id = @queryId OR messageId = @queryId');

      if (quizRes.recordset && quizRes.recordset.length > 0) {
        const row = quizRes.recordset[0];
        const actualQuizId = String(row.id);
        quiz = {
          id: actualQuizId,
          messageId: String(row.messageId),
          roomId: String(row.roomId),
          question: row.question,
          options: safeParseJSON(row.options, []),
          correctOptionId: row.correctOptionId ? String(row.correctOptionId) : null,
          isSurvey: Boolean(row.isSurvey),
          explanation: row.explanation,
          createdById: String(row.createdById),
          createdByName: row.createdByName,
          createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
        };

        const answersRes = await pool.request()
          .input('actualQuizId', sql.NVarChar(64), actualQuizId)
          .query('SELECT * FROM dbo.ChatQuizAnswers WHERE quizId = @actualQuizId ORDER BY answeredAt ASC');

        answers = (answersRes.recordset || []).map((a) => ({
          id: String(a.id),
          quizId: String(a.quizId),
          userId: String(a.userId),
          userName: a.userName,
          userAvatar: a.userAvatar,
          userDepartment: a.userDepartment,
          selectedOptionId: String(a.selectedOptionId),
          answeredAt: a.answeredAt ? a.answeredAt.toISOString() : new Date().toISOString(),
        }));
      }
    }

    if (!quiz) {
      ensureFiles();
      let rawQuizzes = '[]';
      try {
        if (fs.existsSync(QUIZZES_FILE)) rawQuizzes = fs.readFileSync(QUIZZES_FILE, 'utf8');
      } catch (_) {}
      const quizzes = safeParseJSON(rawQuizzes, []);
      quiz = quizzes.find((q) => String(q.id) === String(quizId) || String(q.messageId) === String(quizId));

      if (quiz) {
        let rawAnswers = '[]';
        try {
          if (fs.existsSync(ANSWERS_FILE)) rawAnswers = fs.readFileSync(ANSWERS_FILE, 'utf8');
        } catch (_) {}
        const allAnswers = safeParseJSON(rawAnswers, []);
        answers = allAnswers.filter((a) => String(a.quizId) === String(quiz.id));
      }
    }

    if (!quiz) {
      return res.status(404).json({ error: '指定されたクイズが見つかりません' });
    }

    const responseData = buildQuizResponse(quiz, answers, userId);
    res.json(responseData);
  } catch (err) {
    console.error('⚠️ [ChatQuizzes GET Error]:', err);
    res.status(500).json({ error: 'クイズ情報の取得に失敗しました', details: err.message });
  }
});

// ==========================================
// 3. 回答・投票送信 (POST /api/chats/quizzes/:quizId/answer)
// ==========================================
router.post(['/:quizId/answer', '/quizzes/:quizId/answer', '/chats/quizzes/:quizId/answer', '/api/chats/quizzes/:quizId/answer', '/api/chat-quizzes/:quizId/answer'], async (req, res) => {
  try {
    const { quizId } = req.params;
    const { selectedOptionId, userId, userName, userAvatar, userDepartment } = req.body;

    if (!selectedOptionId || !userId) {
      return res.status(400).json({ error: '選択肢IDおよびユーザーIDは必須です' });
    }

    const pool = await getPool();
    let quiz = null;
    let answers = [];

    if (pool) {
      await initTables(pool);
      const quizRes = await pool.request()
        .input('queryId', sql.NVarChar(64), quizId)
        .query('SELECT * FROM dbo.ChatQuizzes WHERE id = @queryId OR messageId = @queryId');

      if (quizRes.recordset && quizRes.recordset.length > 0) {
        const row = quizRes.recordset[0];
        const actualQuizId = String(row.id);
        quiz = {
          id: actualQuizId,
          messageId: String(row.messageId),
          roomId: String(row.roomId),
          question: row.question,
          options: safeParseJSON(row.options, []),
          correctOptionId: row.correctOptionId ? String(row.correctOptionId) : null,
          isSurvey: Boolean(row.isSurvey),
          explanation: row.explanation,
          createdById: String(row.createdById),
          createdByName: row.createdByName,
          createdAt: row.createdAt ? row.createdAt.toISOString() : new Date().toISOString(),
        };

        // 二重投票チェック
        const existingVote = await pool.request()
          .input('actualQuizId', sql.NVarChar(64), actualQuizId)
          .input('userId', sql.NVarChar(64), String(userId))
          .query('SELECT id FROM dbo.ChatQuizAnswers WHERE quizId = @actualQuizId AND userId = @userId');

        if (existingVote.recordset && existingVote.recordset.length > 0) {
          return res.status(409).json({ error: 'この問題には既に回答済みです（二重回答不可）' });
        }

        const answerId = `ans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
        await pool.request()
          .input('id', sql.NVarChar(64), answerId)
          .input('actualQuizId', sql.NVarChar(64), actualQuizId)
          .input('userId', sql.NVarChar(64), String(userId))
          .input('userName', sql.NVarChar(128), userName || 'ユーザー')
          .input('userAvatar', sql.NVarChar(512), userAvatar || null)
          .input('userDepartment', sql.NVarChar(128), userDepartment || null)
          .input('selectedOptionId', sql.NVarChar(64), String(selectedOptionId))
          .query(`
            INSERT INTO dbo.ChatQuizAnswers (
              id, quizId, userId, userName, userAvatar, userDepartment, selectedOptionId, answeredAt
            ) VALUES (
              @id, @actualQuizId, @userId, @userName, @userAvatar, @userDepartment, @selectedOptionId, SYSUTCDATETIME()
            )
          `);

        const allAnswersRes = await pool.request()
          .input('actualQuizId', sql.NVarChar(64), actualQuizId)
          .query('SELECT * FROM dbo.ChatQuizAnswers WHERE quizId = @actualQuizId ORDER BY answeredAt ASC');

        answers = (allAnswersRes.recordset || []).map((a) => ({
          id: String(a.id),
          quizId: String(a.quizId),
          userId: String(a.userId),
          userName: a.userName,
          userAvatar: a.userAvatar,
          userDepartment: a.userDepartment,
          selectedOptionId: String(a.selectedOptionId),
          answeredAt: a.answeredAt ? a.answeredAt.toISOString() : new Date().toISOString(),
        }));
      }
    }

    if (!quiz) {
      ensureFiles();
      let rawQuizzes = '[]';
      try {
        if (fs.existsSync(QUIZZES_FILE)) rawQuizzes = fs.readFileSync(QUIZZES_FILE, 'utf8');
      } catch (_) {}
      const quizzes = safeParseJSON(rawQuizzes, []);
      quiz = quizzes.find((q) => String(q.id) === String(quizId) || String(q.messageId) === String(quizId));

      if (!quiz) {
        return res.status(404).json({ error: '指定されたクイズが見つかりません' });
      }

      const rawAnswers = fs.readFileSync(ANSWERS_FILE, 'utf8');
      const allAnswers = safeParseJSON(rawAnswers, []);

      // 二重投票チェック
      const hasAnswered = allAnswers.some(
        (a) => String(a.quizId) === String(quiz.id) && String(a.userId) === String(userId)
      );
      if (hasAnswered) {
        return res.status(409).json({ error: 'この問題には既に回答済みです（二重回答不可）' });
      }

      const newAnswer = {
        id: `ans_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        quizId: String(quiz.id),
        userId: String(userId),
        userName: userName || 'ユーザー',
        userAvatar: userAvatar || '',
        userDepartment: userDepartment || '',
        selectedOptionId: String(selectedOptionId),
        answeredAt: new Date().toISOString(),
      };

      allAnswers.push(newAnswer);
      try {
        fs.writeFileSync(ANSWERS_FILE, JSON.stringify(allAnswers, null, 2), 'utf8');
      } catch (_) {}
      answers = allAnswers.filter((a) => String(a.quizId) === String(quiz.id));
    }

    // チャットルームメッセージ内キャッシュの更新
    const updatedResponse = buildQuizResponse(quiz, answers, userId);
    attachQuizToChatMessage(quiz.roomId, quiz.messageId, updatedResponse);

    res.json({
      success: true,
      message: '回答を記録しました',
      isCorrect: quiz.isSurvey ? null : (quiz.correctOptionId === selectedOptionId),
      quiz: updatedResponse,
    });
  } catch (err) {
    console.error('⚠️ [ChatQuizzes Answer POST Error]:', err);
    res.status(500).json({ error: '回答の送信に失敗しました', details: err.message });
  }
});

export default router;
