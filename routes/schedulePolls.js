import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { safeParseJSON, dataDir } from '../config.js';

const router = Router();

const POLLS_FILE = path.join(dataDir, 'schedulePolls.json');
const ANSWERS_FILE = path.join(dataDir, 'schedulePollAnswers.json');
const EVENTS_FILE = path.join(dataDir, 'events.json');

function ensureDataFiles() {
  if (!fs.existsSync(POLLS_FILE)) {
    fs.writeFileSync(POLLS_FILE, '[]', 'utf8');
  }
  if (!fs.existsSync(ANSWERS_FILE)) {
    fs.writeFileSync(ANSWERS_FILE, '[]', 'utf8');
  }
}
ensureDataFiles();

// テーブル自動初期化
async function initTables(pool) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SchedulePolls' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.SchedulePolls (
          id NVARCHAR(64) PRIMARY KEY,
          title NVARCHAR(255) NOT NULL,
          description NVARCHAR(MAX) NULL,
          organizerId NVARCHAR(64) NOT NULL,
          organizerName NVARCHAR(128) NOT NULL,
          status NVARCHAR(32) NOT NULL DEFAULT 'open',
          durationMinutes INT NOT NULL DEFAULT 60,
          location NVARCHAR(255) NULL,
          targetUserIds NVARCHAR(MAX) NOT NULL,
          candidates NVARCHAR(MAX) NOT NULL,
          deadlineAt DATETIME2 NULL,
          confirmedCandidateId NVARCHAR(64) NULL,
          createdEventId NVARCHAR(64) NULL,
          createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_SchedulePolls_organizer ON dbo.SchedulePolls(organizerId);
        CREATE INDEX IX_SchedulePolls_status ON dbo.SchedulePolls(status);
      END

      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'SchedulePollAnswers' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.SchedulePollAnswers (
          id NVARCHAR(64) PRIMARY KEY,
          pollId NVARCHAR(64) NOT NULL,
          userId NVARCHAR(64) NOT NULL,
          userName NVARCHAR(128) NOT NULL,
          responses NVARCHAR(MAX) NOT NULL,
          overallComment NVARCHAR(MAX) NULL,
          answeredAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_SchedulePollAnswers_pollId ON dbo.SchedulePollAnswers(pollId);
        CREATE INDEX IX_SchedulePollAnswers_userId ON dbo.SchedulePollAnswers(userId);
      END
    `);
  } catch (err) {
    console.warn('[SchedulePolls] DB table init failed (using fallback if needed):', err.message);
  }
}

// ==========================================
// 1. 日程調整一覧取得 (GET /api/schedule-polls)
// ==========================================
router.get(['/schedule-polls', '/schedule/polls', '/polls'], async (req, res) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : null;
    const pool = await getPool();

    if (pool) {
      await initTables(pool);
      const result = await pool.request().query`
        SELECT * FROM dbo.SchedulePolls ORDER BY createdAt DESC
      `;
      const polls = (result.recordset || []).map(row => ({
        id: String(row.id),
        title: row.title,
        description: row.description || '',
        organizerId: String(row.organizerId),
        organizerName: row.organizerName,
        status: row.status || 'open',
        durationMinutes: Number(row.durationMinutes) || 60,
        location: row.location || '',
        targetUserIds: safeParseJSON(row.targetUserIds, []),
        candidates: safeParseJSON(row.candidates, []),
        deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
        confirmedCandidateId: row.confirmedCandidateId || null,
        createdEventId: row.createdEventId ? String(row.createdEventId) : null,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      }));

      // ユーザー絞り込み（指定があれば主催者または対象者のみ）
      if (userId) {
        const filtered = polls.filter(p => 
          p.organizerId === userId || (Array.isArray(p.targetUserIds) && p.targetUserIds.includes(userId))
        );
        return res.json(filtered);
      }
      return res.json(polls);
    } else {
      ensureDataFiles();
      const raw = fs.readFileSync(POLLS_FILE, 'utf8');
      const polls = safeParseJSON(raw, []);
      if (userId) {
        const filtered = polls.filter(p => 
          p.organizerId === userId || (Array.isArray(p.targetUserIds) && p.targetUserIds.includes(userId))
        );
        return res.json(filtered);
      }
      return res.json(polls);
    }
  } catch (err) {
    console.error('[SchedulePolls GET Error]:', err);
    res.status(500).json({ error: '日程調整一覧の取得に失敗しました', details: err.message });
  }
});

// ==========================================
// 2. 空き枠自動抽出 API (POST /api/schedule-polls/find-free-slots)
// ==========================================
router.post(['/schedule-polls/find-free-slots', '/schedule/polls/find-free-slots', '/polls/find-free-slots'], async (req, res) => {
  try {
    const {
      targetUserIds = [],
      startDate,
      endDate,
      durationMinutes = 60,
      timeRange = { start: '09:00', end: '18:00' },
      excludeWeekends = true,
      excludeLunch = true, // 12:00〜13:00を除外
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate と endDate は必須です' });
    }

    const startD = new Date(startDate);
    const endD = new Date(endDate);

    // 1. 全Eventsを取得（非公開含む）
    let allEvents = [];
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query`
        SELECT id, title, startAt, endAt, isAllDay, isPrivate, createdById, participants
        FROM dbo.Events
      `;
      allEvents = (result.recordset || []).map(row => ({
        id: String(row.id),
        title: row.title,
        startAt: new Date(row.startAt),
        endAt: new Date(row.endAt),
        isAllDay: !!row.isAllDay,
        isPrivate: !!row.isPrivate,
        createdById: String(row.createdById || ''),
        participants: safeParseJSON(row.participants, []),
      }));
    } else {
      if (fs.existsSync(EVENTS_FILE)) {
        const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
        const list = safeParseJSON(raw, []);
        allEvents = list.map(e => ({
          ...e,
          startAt: new Date(e.startAt),
          endAt: new Date(e.endAt),
        }));
      }
    }

    // 2. 対象ユーザーの関連イベント（作成者または参加者）のみをフィルタ
    const userEvents = allEvents.filter(e => {
      if (targetUserIds.length === 0) return true; // 全員未指定なら全予定
      const isCreator = targetUserIds.includes(e.createdById);
      const isParticipant = Array.isArray(e.participants) && e.participants.some(p => {
        const pId = typeof p === 'string' ? p : (p?.id || p?.userId);
        return targetUserIds.includes(pId);
      });
      return isCreator || isParticipant;
    });

    // 3. スロット生成（30分刻み）
    const [startHour, startMin] = (timeRange.start || '09:00').split(':').map(Number);
    const [endHour, endMin] = (timeRange.end || '18:00').split(':').map(Number);

    const suggestedSlots = [];
    const durMs = Number(durationMinutes) * 60 * 1000;

    // 日付ループ
    const curr = new Date(startD);
    curr.setHours(0, 0, 0, 0);

    const endBoundary = new Date(endD);
    endBoundary.setHours(23, 59, 59, 999);

    while (curr <= endBoundary) {
      const dayOfWeek = curr.getDay(); // 0: 日, 6: 土
      if (!excludeWeekends || (dayOfWeek !== 0 && dayOfWeek !== 6)) {
        const slotStart = new Date(curr);
        slotStart.setHours(startHour, startMin, 0, 0);

        const dayEnd = new Date(curr);
        dayEnd.setHours(endHour, endMin, 0, 0);

        while (slotStart.getTime() + durMs <= dayEnd.getTime()) {
          const slotEnd = new Date(slotStart.getTime() + durMs);

          // 昼休み (12:00〜13:00) 重複チェック
          let isLunchOverlap = false;
          if (excludeLunch) {
            const lunchStart = new Date(curr);
            lunchStart.setHours(12, 0, 0, 0);
            const lunchEnd = new Date(curr);
            lunchEnd.setHours(13, 0, 0, 0);
            if (slotStart < lunchEnd && slotEnd > lunchStart) {
              isLunchOverlap = true;
            }
          }

          if (!isLunchOverlap) {
            // 対象メンバーの予定と重複しているかチェック
            const busyUsers = new Set();
            for (const ev of userEvents) {
              // 終日予定
              if (ev.isAllDay) {
                const evStart = new Date(ev.startAt);
                evStart.setHours(0, 0, 0, 0);
                const evEnd = new Date(ev.endAt);
                evEnd.setHours(23, 59, 59, 999);
                if (slotStart <= evEnd && slotEnd >= evStart) {
                  if (ev.createdById) busyUsers.add(ev.createdById);
                  if (Array.isArray(ev.participants)) {
                    ev.participants.forEach(p => {
                      const pId = typeof p === 'string' ? p : (p?.id || p?.userId);
                      if (pId) busyUsers.add(pId);
                    });
                  }
                }
              } else {
                // 時間帯重複: slotStart < ev.endAt && slotEnd > ev.startAt
                if (slotStart < ev.endAt && slotEnd > ev.startAt) {
                  if (ev.createdById) busyUsers.add(ev.createdById);
                  if (Array.isArray(ev.participants)) {
                    ev.participants.forEach(p => {
                      const pId = typeof p === 'string' ? p : (p?.id || p?.userId);
                      if (pId) busyUsers.add(pId);
                    });
                  }
                }
              }
            }

            const busyList = Array.from(busyUsers).filter(id => targetUserIds.includes(id));
            const availableCount = Math.max(0, targetUserIds.length - busyList.length);

            // 全員または大半が空いているスロットを候補として追加
            if (busyList.length === 0 || (targetUserIds.length > 2 && busyList.length <= 1)) {
              suggestedSlots.push({
                id: `slot_${slotStart.getTime()}`,
                startAt: slotStart.toISOString(),
                endAt: slotEnd.toISOString(),
                availableCount: targetUserIds.length > 0 ? availableCount : 0,
                totalCount: targetUserIds.length,
                busyUserIds: busyList,
                isPerfect: busyList.length === 0,
              });
            }
          }

          // 30分進める
          slotStart.setMinutes(slotStart.getMinutes() + 30);
        }
      }
      curr.setDate(curr.getDate() + 1);
    }

    // スコア順（全員空いている完璧スロット優先、日時順）
    suggestedSlots.sort((a, b) => {
      if (a.isPerfect && !b.isPerfect) return -1;
      if (!a.isPerfect && b.isPerfect) return 1;
      return new Date(a.startAt).getTime() - new Date(b.startAt).getTime();
    });

    res.json({ suggestedSlots: suggestedSlots.slice(0, 30) });
  } catch (err) {
    console.error('[SchedulePolls find-free-slots Error]:', err);
    res.status(500).json({ error: '空き枠の自動抽出に失敗しました', details: err.message });
  }
});

// ==========================================
// 3. 日程調整詳細取得 (GET /api/schedule-polls/:id)
// ==========================================
router.get(['/schedule-polls/:id', '/schedule/polls/:id', '/polls/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    let poll = null;
    let answers = [];

    if (pool) {
      await initTables(pool);
      const pollRes = await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`SELECT * FROM dbo.SchedulePolls WHERE id = @id`;

      if (pollRes.recordset && pollRes.recordset.length > 0) {
        const row = pollRes.recordset[0];
        poll = {
          id: String(row.id),
          title: row.title,
          description: row.description || '',
          organizerId: String(row.organizerId),
          organizerName: row.organizerName,
          status: row.status || 'open',
          durationMinutes: Number(row.durationMinutes) || 60,
          location: row.location || '',
          targetUserIds: safeParseJSON(row.targetUserIds, []),
          candidates: safeParseJSON(row.candidates, []),
          deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
          confirmedCandidateId: row.confirmedCandidateId || null,
          createdEventId: row.createdEventId ? String(row.createdEventId) : null,
          createdAt: row.createdAt ? row.createdAt.toISOString() : null,
          updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
        };

        const ansRes = await pool.request()
          .input('pollId', sql.NVarChar(64), id)
          .query`SELECT * FROM dbo.SchedulePollAnswers WHERE pollId = @pollId ORDER BY answeredAt ASC`;

        answers = (ansRes.recordset || []).map(r => ({
          id: String(r.id),
          pollId: String(r.pollId),
          userId: String(r.userId),
          userName: r.userName,
          responses: safeParseJSON(r.responses, []),
          overallComment: r.overallComment || '',
          answeredAt: r.answeredAt ? r.answeredAt.toISOString() : null,
        }));
      }
    } else {
      ensureDataFiles();
      const rawP = fs.readFileSync(POLLS_FILE, 'utf8');
      const polls = safeParseJSON(rawP, []);
      poll = polls.find(p => p.id === id) || null;

      const rawA = fs.readFileSync(ANSWERS_FILE, 'utf8');
      const allAnswers = safeParseJSON(rawA, []);
      answers = allAnswers.filter(a => a.pollId === id);
    }

    if (!poll) {
      return res.status(404).json({ error: '指定された日程調整が見つかりません' });
    }

    res.json({ poll, answers });
  } catch (err) {
    console.error('[SchedulePolls GET Detail Error]:', err);
    res.status(500).json({ error: '日程調整詳細の取得に失敗しました', details: err.message });
  }
});

// ==========================================
// 4. 新規日程調整作成 (POST /api/schedule-polls)
// ==========================================
router.post(['/schedule-polls', '/schedule/polls', '/polls'], async (req, res) => {
  try {
    const {
      title,
      description = '',
      organizerId,
      organizerName,
      durationMinutes = 60,
      location = '',
      targetUserIds = [],
      candidates = [],
      deadlineAt = null,
    } = req.body;

    if (!title || !organizerId || !organizerName || candidates.length === 0) {
      return res.status(400).json({ error: 'タイトル、主催者情報、および1件以上の候補日時は必須です' });
    }

    const id = `poll_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const formattedCandidates = candidates.map((c, idx) => ({
      id: c.id || `c_${idx + 1}_${Math.random().toString(36).substring(2, 6)}`,
      startAt: c.startAt,
      endAt: c.endAt,
      text: c.text || '',
    }));

    const newPoll = {
      id,
      title,
      description,
      organizerId: String(organizerId),
      organizerName,
      status: 'open',
      durationMinutes: Number(durationMinutes) || 60,
      location,
      targetUserIds: Array.isArray(targetUserIds) ? targetUserIds : [],
      candidates: formattedCandidates,
      deadlineAt: deadlineAt || null,
      confirmedCandidateId: null,
      createdEventId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const pool = await getPool();
    if (pool) {
      await initTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(64), newPoll.id)
        .input('title', sql.NVarChar(255), newPoll.title)
        .input('description', sql.NVarChar(sql.MAX), newPoll.description)
        .input('organizerId', sql.NVarChar(64), newPoll.organizerId)
        .input('organizerName', sql.NVarChar(128), newPoll.organizerName)
        .input('status', sql.NVarChar(32), newPoll.status)
        .input('durationMinutes', sql.Int, newPoll.durationMinutes)
        .input('location', sql.NVarChar(255), newPoll.location)
        .input('targetUserIds', sql.NVarChar(sql.MAX), JSON.stringify(newPoll.targetUserIds))
        .input('candidates', sql.NVarChar(sql.MAX), JSON.stringify(newPoll.candidates))
        .input('deadlineAt', sql.DateTime2, newPoll.deadlineAt ? new Date(newPoll.deadlineAt) : null)
        .query`
          INSERT INTO dbo.SchedulePolls (
            id, title, description, organizerId, organizerName, status, durationMinutes,
            location, targetUserIds, candidates, deadlineAt, createdAt, updatedAt
          ) VALUES (
            @id, @title, @description, @organizerId, @organizerName, @status, @durationMinutes,
            @location, @targetUserIds, @candidates, @deadlineAt, SYSUTCDATETIME(), SYSUTCDATETIME()
          )
        `;
    } else {
      ensureDataFiles();
      const raw = fs.readFileSync(POLLS_FILE, 'utf8');
      const polls = safeParseJSON(raw, []);
      polls.unshift(newPoll);
      fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2), 'utf8');
    }

    res.status(201).json(newPoll);
  } catch (err) {
    console.error('[SchedulePolls POST Error]:', err);
    res.status(500).json({ error: '日程調整の作成に失敗しました', details: err.message });
  }
});

// ==========================================
// 5. メンバー回答登録 (POST /api/schedule-polls/:id/answers)
// ==========================================
router.post(['/schedule-polls/:id/answers', '/schedule/polls/:id/answers', '/polls/:id/answers'], async (req, res) => {
  try {
    const { id } = req.params;
    const { userId, userName, responses = [], overallComment = '' } = req.body;

    if (!userId || !userName) {
      return res.status(400).json({ error: 'userId と userName は必須です' });
    }

    const answerId = `ans_${id}_${userId}`;
    const nowIso = new Date().toISOString();

    const answerData = {
      id: answerId,
      pollId: id,
      userId: String(userId),
      userName,
      responses: Array.isArray(responses) ? responses : [],
      overallComment: overallComment || '',
      answeredAt: nowIso,
      updatedAt: nowIso,
    };

    const pool = await getPool();
    if (pool) {
      await initTables(pool);
      // UPSERT
      await pool.request()
        .input('id', sql.NVarChar(64), answerData.id)
        .input('pollId', sql.NVarChar(64), answerData.pollId)
        .input('userId', sql.NVarChar(64), answerData.userId)
        .input('userName', sql.NVarChar(128), answerData.userName)
        .input('responses', sql.NVarChar(sql.MAX), JSON.stringify(answerData.responses))
        .input('overallComment', sql.NVarChar(sql.MAX), answerData.overallComment)
        .query`
          MERGE INTO dbo.SchedulePollAnswers AS target
          USING (SELECT @id AS id) AS source
          ON (target.pollId = @pollId AND target.userId = @userId)
          WHEN MATCHED THEN
            UPDATE SET 
              userName = @userName,
              responses = @responses,
              overallComment = @overallComment,
              answeredAt = SYSUTCDATETIME(),
              updatedAt = SYSUTCDATETIME()
          WHEN NOT MATCHED THEN
            INSERT (id, pollId, userId, userName, responses, overallComment, answeredAt, updatedAt)
            VALUES (@id, @pollId, @userId, @userName, @responses, @overallComment, SYSUTCDATETIME(), SYSUTCDATETIME());
        `;
    } else {
      ensureDataFiles();
      const raw = fs.readFileSync(ANSWERS_FILE, 'utf8');
      const allAnswers = safeParseJSON(raw, []);
      const idx = allAnswers.findIndex(a => a.pollId === id && a.userId === String(userId));
      if (idx >= 0) {
        allAnswers[idx] = answerData;
      } else {
        allAnswers.push(answerData);
      }
      fs.writeFileSync(ANSWERS_FILE, JSON.stringify(allAnswers, null, 2), 'utf8');
    }

    res.json(answerData);
  } catch (err) {
    console.error('[SchedulePolls Answer POST Error]:', err);
    res.status(500).json({ error: '回答の保存に失敗しました', details: err.message });
  }
});

// ==========================================
// 6. 日程確定＆本番Events自動登録 (POST /api/schedule-polls/:id/confirm)
// ==========================================
router.post(['/schedule-polls/:id/confirm', '/schedule/polls/:id/confirm', '/polls/:id/confirm'], async (req, res) => {
  try {
    const { id } = req.params;
    const { selectedCandidateId, finalTitle, finalLocation, notifyAttendees = true, finalDescription = '' } = req.body;

    if (!selectedCandidateId) {
      return res.status(400).json({ error: '確定する候補日時 (selectedCandidateId) を指定してください' });
    }

    const pool = await getPool();
    let poll = null;

    if (pool) {
      await initTables(pool);
      const pollRes = await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`SELECT * FROM dbo.SchedulePolls WHERE id = @id`;
      if (pollRes.recordset && pollRes.recordset.length > 0) {
        const row = pollRes.recordset[0];
        poll = {
          ...row,
          targetUserIds: safeParseJSON(row.targetUserIds, []),
          candidates: safeParseJSON(row.candidates, []),
        };
      }
    } else {
      ensureDataFiles();
      const raw = fs.readFileSync(POLLS_FILE, 'utf8');
      const polls = safeParseJSON(raw, []);
      poll = polls.find(p => p.id === id);
    }

    if (!poll) {
      return res.status(404).json({ error: '指定された日程調整が見つかりません' });
    }

    const candidate = poll.candidates.find(c => c.id === selectedCandidateId);
    if (!candidate) {
      return res.status(400).json({ error: '指定された候補スロットが存在しません' });
    }

    // 1. 本番 Events テーブルに自動 INSERT
    const eventId = `ev_poll_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const eventTitle = finalTitle || `【確定】${poll.title}`;
    const eventLocation = finalLocation !== undefined ? finalLocation : (poll.location || '');
    const eventDesc = finalDescription || (poll.description ? `${poll.description}\n\n(日程調整より自動確定)` : '(日程調整より自動確定)');

    const newEvent = {
      id: eventId,
      title: eventTitle,
      startAt: candidate.startAt,
      endAt: candidate.endAt,
      isAllDay: false,
      isPrivate: false,
      category: 'meeting',
      description: eventDesc,
      location: eventLocation,
      createdById: poll.organizerId,
      createdByName: poll.organizerName,
      participants: poll.targetUserIds || [],
      attachments: [],
      recurrence: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (pool) {
      await pool.request()
        .input('eId', sql.NVarChar(64), newEvent.id)
        .input('eTitle', sql.NVarChar(255), newEvent.title)
        .input('eStartAt', sql.DateTime2, new Date(newEvent.startAt))
        .input('eEndAt', sql.DateTime2, new Date(newEvent.endAt))
        .input('eIsAllDay', sql.Bit, 0)
        .input('eIsPrivate', sql.Bit, 0)
        .input('eCategory', sql.NVarChar(64), newEvent.category)
        .input('eDesc', sql.NVarChar(sql.MAX), newEvent.description)
        .input('eLoc', sql.NVarChar(255), newEvent.location)
        .input('eCreatedById', sql.NVarChar(64), newEvent.createdById)
        .input('eCreatedByName', sql.NVarChar(128), newEvent.createdByName)
        .input('eParticipants', sql.NVarChar(sql.MAX), JSON.stringify(newEvent.participants))
        .query`
          INSERT INTO dbo.Events (
            id, title, startAt, endAt, isAllDay, isPrivate, category, description,
            location, createdById, createdByName, participants, createdAt, updatedAt
          ) VALUES (
            @eId, @eTitle, @eStartAt, @eEndAt, @eIsAllDay, @eIsPrivate, @eCategory, @eDesc,
            @eLoc, @eCreatedById, @eCreatedByName, @eParticipants, SYSUTCDATETIME(), SYSUTCDATETIME()
          )
        `;

      // 2. SchedulePolls ステータスを 'confirmed' に更新
      await pool.request()
        .input('pId', sql.NVarChar(64), id)
        .input('candId', sql.NVarChar(64), selectedCandidateId)
        .input('createdEventId', sql.NVarChar(64), eventId)
        .query`
          UPDATE dbo.SchedulePolls 
          SET status = 'confirmed',
              confirmedCandidateId = @candId,
              createdEventId = @createdEventId,
              updatedAt = SYSUTCDATETIME()
          WHERE id = @pId
        `;
    } else {
      // Local JSON fallback
      if (fs.existsSync(EVENTS_FILE)) {
        const rawE = fs.readFileSync(EVENTS_FILE, 'utf8');
        const events = safeParseJSON(rawE, []);
        events.push(newEvent);
        fs.writeFileSync(EVENTS_FILE, JSON.stringify(events, null, 2), 'utf8');
      }

      const rawP = fs.readFileSync(POLLS_FILE, 'utf8');
      const polls = safeParseJSON(rawP, []);
      const idx = polls.findIndex(p => p.id === id);
      if (idx >= 0) {
        polls[idx].status = 'confirmed';
        polls[idx].confirmedCandidateId = selectedCandidateId;
        polls[idx].createdEventId = eventId;
        polls[idx].updatedAt = new Date().toISOString();
        fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2), 'utf8');
      }
    }

    res.json({
      success: true,
      message: '日程を確定し、カレンダー予定に自動登録しました',
      confirmedEvent: newEvent,
    });
  } catch (err) {
    console.error('[SchedulePolls Confirm Error]:', err);
    res.status(500).json({ error: '日程の確定に失敗しました', details: err.message });
  }
});

// ==========================================
// 7. 日程調整削除 (DELETE /api/schedule-polls/:id)
// ==========================================
router.delete(['/schedule-polls/:id', '/schedule/polls/:id', '/polls/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    if (pool) {
      await initTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`
          DELETE FROM dbo.SchedulePollAnswers WHERE pollId = @id;
          DELETE FROM dbo.SchedulePolls WHERE id = @id;
        `;
    } else {
      ensureDataFiles();
      const rawP = fs.readFileSync(POLLS_FILE, 'utf8');
      let polls = safeParseJSON(rawP, []);
      polls = polls.filter(p => p.id !== id);
      fs.writeFileSync(POLLS_FILE, JSON.stringify(polls, null, 2), 'utf8');

      const rawA = fs.readFileSync(ANSWERS_FILE, 'utf8');
      let allAnswers = safeParseJSON(rawA, []);
      allAnswers = allAnswers.filter(a => a.pollId !== id);
      fs.writeFileSync(ANSWERS_FILE, JSON.stringify(allAnswers, null, 2), 'utf8');
    }

    res.json({ success: true, message: '日程調整を削除しました' });
  } catch (err) {
    console.error('[SchedulePolls DELETE Error]:', err);
    res.status(500).json({ error: '日程調整の削除に失敗しました', details: err.message });
  }
});

export default router;
