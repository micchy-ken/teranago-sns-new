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
      excludeLunch = true, // 12:00〜13:00 (JST) を除外
    } = req.body;

    if (!startDate || !endDate) {
      return res.status(400).json({ error: 'startDate と endDate は必須です' });
    }

    // 1. 全Eventsを取得（非公開含む）
    let rawEvents = [];
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query`
        SELECT id, title, startAt, endAt, isAllDay, isPrivate, createdById, participants, description
        FROM dbo.Events
      `;
      rawEvents = (result.recordset || []);
    } else {
      if (fs.existsSync(EVENTS_FILE)) {
        const raw = fs.readFileSync(EVENTS_FILE, 'utf8');
        rawEvents = safeParseJSON(raw, []);
      }
    }

    // イベントの正規化（JSTタイムゾーンを厳格考慮）
    const normalizedEvents = [];
    for (const row of rawEvents) {
      let detailsObj = {};
      if (typeof row.description === 'string' && row.description.startsWith('{')) {
        try { detailsObj = JSON.parse(row.description); } catch (_) {}
      }

      const rawStart = row.startAt || row.start || detailsObj.startAt || detailsObj.start;
      const rawEnd = row.endAt || row.end || detailsObj.endAt || detailsObj.end || rawStart;
      if (!rawStart) continue;

      const isAllDay = !!(row.isAllDay || detailsObj.isAllDay);
      let evStart = new Date(rawStart);
      let evEnd = new Date(rawEnd);

      // 終日予定の場合は JST 基準の 00:00:00+09:00 〜 23:59:59.999+09:00 に厳密設定
      if (isAllDay) {
        let startYmd = typeof rawStart === 'string' && rawStart.length >= 10 ? rawStart.slice(0, 10) : null;
        let endYmd = typeof rawEnd === 'string' && rawEnd.length >= 10 ? rawEnd.slice(0, 10) : startYmd;
        if (!startYmd || isNaN(new Date(`${startYmd}T00:00:00+09:00`).getTime())) {
          const jstD = new Date(evStart.getTime() + 9 * 3600 * 1000);
          startYmd = jstD.toISOString().slice(0, 10);
          const jstEndD = new Date(evEnd.getTime() + 9 * 3600 * 1000);
          endYmd = jstEndD.toISOString().slice(0, 10);
        }
        evStart = new Date(`${startYmd}T00:00:00+09:00`);
        evEnd = new Date(`${endYmd}T23:59:59.999+09:00`);
      }

      // ユーザーID（作成者）
      const creatorId = String(
        row.createdById ||
        (typeof row.createdBy === 'object' ? row.createdBy?.id : row.createdBy) ||
        row.userId ||
        detailsObj.createdById ||
        (typeof detailsObj.createdBy === 'object' ? detailsObj.createdBy?.id : detailsObj.createdBy) ||
        detailsObj.userId ||
        ''
      );

      // 参加者IDリスト
      let rawAtt = row.attendees || row.participants || detailsObj.attendees || detailsObj.participants || [];
      if (typeof rawAtt === 'string') {
        try { rawAtt = JSON.parse(rawAtt); } catch (_) { rawAtt = []; }
      }
      const participantIds = new Set();
      if (Array.isArray(rawAtt)) {
        rawAtt.forEach(a => {
          const aId = typeof a === 'string' ? a : (a?.id || a?.userId);
          if (aId) participantIds.add(String(aId));
        });
      }
      if (creatorId) participantIds.add(creatorId);

      normalizedEvents.push({
        id: String(row.id),
        title: row.title,
        evStart,
        evEnd,
        isAllDay,
        creatorId,
        participantIds: Array.from(participantIds),
      });
    }

    // 2. 対象ユーザーのイベントのみを抽出
    const targetSet = new Set((targetUserIds || []).map(String));
    const userEvents = normalizedEvents.filter(ev => {
      if (targetSet.size === 0) return true; // 全員未指定ならすべての予定を対象
      if (targetSet.has(ev.creatorId)) return true;
      return ev.participantIds.some(pId => targetSet.has(pId));
    });

    // 3. JST 日付リストの生成 (start〜end)
    const startYmd = String(startDate).split('T')[0];
    const endYmd = String(endDate).split('T')[0];
    const jstStartDate = new Date(`${startYmd}T12:00:00+09:00`);
    const jstEndDate = new Date(`${endYmd}T12:00:00+09:00`);

    const dateList = [];
    const curDate = new Date(jstStartDate.getTime());
    while (curDate.getTime() <= jstEndDate.getTime()) {
      const y = curDate.getUTCFullYear();
      const m = String(curDate.getUTCMonth() + 1).padStart(2, '0');
      const d = String(curDate.getUTCDate()).padStart(2, '0');
      dateList.push(`${y}-${m}-${d}`);
      curDate.setUTCDate(curDate.getUTCDate() + 1);
    }

    // 4. スロット生成（30分刻み・JST時間基準）
    const startTimeStr = timeRange?.start || '09:00';
    const endTimeStr = timeRange?.end || '18:00';
    const durMs = Number(durationMinutes || 60) * 60 * 1000;
    const suggestedSlots = [];

    for (const dateStr of dateList) {
      // 曜日チェック（JST基準）
      const noonD = new Date(`${dateStr}T12:00:00+09:00`);
      const dayOfWeek = noonD.getUTCDay(); // 0: 日, 6: 土
      if (excludeWeekends && (dayOfWeek === 0 || dayOfWeek === 6)) {
        continue;
      }

      let slotStart = new Date(`${dateStr}T${startTimeStr}:00+09:00`);
      const dayEnd = new Date(`${dateStr}T${endTimeStr}:00+09:00`);

      if (isNaN(slotStart.getTime()) || isNaN(dayEnd.getTime())) continue;

      while (slotStart.getTime() + durMs <= dayEnd.getTime()) {
        const slotEnd = new Date(slotStart.getTime() + durMs);

        // 昼休み (12:00〜13:00 JST) 重複チェック
        let isLunchOverlap = false;
        if (excludeLunch) {
          const lunchStart = new Date(`${dateStr}T12:00:00+09:00`);
          const lunchEnd = new Date(`${dateStr}T13:00:00+09:00`);
          if (slotStart < lunchEnd && slotEnd > lunchStart) {
            isLunchOverlap = true;
          }
        }

        if (!isLunchOverlap) {
          // 対象メンバーの予定と重複しているかチェック
          const busyUsers = new Set();
          for (const ev of userEvents) {
            if (slotStart < ev.evEnd && slotEnd > ev.evStart) {
              if (ev.creatorId && targetSet.has(ev.creatorId)) {
                busyUsers.add(ev.creatorId);
              }
              ev.participantIds.forEach(pId => {
                if (targetSet.has(pId)) busyUsers.add(pId);
              });
            }
          }

          const busyList = Array.from(busyUsers);
          const availableCount = Math.max(0, targetSet.size - busyList.length);

          // 全員または大半が空いているスロットを候補として追加
          if (busyList.length === 0 || (targetSet.size > 2 && busyList.length <= 1)) {
            suggestedSlots.push({
              id: `slot_${slotStart.getTime()}`,
              startAt: slotStart.toISOString(),
              endAt: slotEnd.toISOString(),
              availableCount: targetSet.size > 0 ? availableCount : 0,
              totalCount: targetSet.size,
              busyUserIds: busyList,
              isPerfect: busyList.length === 0,
            });
          }
        }

        // 30分進める
        slotStart = new Date(slotStart.getTime() + 30 * 60 * 1000);
      }
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
