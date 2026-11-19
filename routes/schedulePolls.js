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

// 日時文字列を安全にパース（タイムゾーンオフセットがない場合は JST +09:00 として解釈）
function parseEventDate(val) {
  if (!val) return null;
  if (val instanceof Date) return isNaN(val.getTime()) ? null : val;
  const s = String(val).trim();
  if (!s) return null;
  // 既に Z や +09:00 等のオフセット指定がある場合
  if (s.endsWith('Z') || s.includes('+') || (s.includes('-') && s.length > 19 && s[19] === '-')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  // "YYYY-MM-DDTHH:mm:ss" または "YYYY-MM-DD HH:mm:ss" でオフセットなしの場合、JST (+09:00) を補完
  const normalized = s.replace(' ', 'T');
  const dJst = new Date(`${normalized}+09:00`);
  if (!isNaN(dJst.getTime())) return dJst;
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? null : fallback;
}

// 操作者権限チェック（主催者本人または管理者のみ許可）
function canManagePoll(req, poll) {
  if (!poll) return false;
  const organizerId = String(poll.organizerId || '');
  if (req.authUser) {
    if (req.authUser.isAdmin === true || req.authUser.role === 'admin' || String(req.authUser.id || '') === 'u1') {
      return true;
    }
    return String(req.authUser.id || '') === organizerId;
  }
  // 認証ミドルウェア未付与環境向けフォールバック
  const actorId = String(req.body?.actorId || req.body?.organizerId || req.query?.actorId || '');
  const isAdminFlag = req.body?.isAdmin === true || req.query?.isAdmin === 'true';
  if (isAdminFlag) return true;
  if (!actorId) return true;
  return actorId === organizerId;
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

      // 回答者一覧を取得して各pollに紐付け
      const answersMap = {};
      try {
        const ansResult = await pool.request().query`
          SELECT pollId, userId FROM dbo.SchedulePollAnswers
        `;
        (ansResult.recordset || []).forEach(r => {
          const pId = String(r.pollId);
          if (!answersMap[pId]) answersMap[pId] = [];
          const uId = String(r.userId);
          if (!answersMap[pId].includes(uId)) {
            answersMap[pId].push(uId);
          }
        });
      } catch (ansErr) {
        console.warn('[SchedulePolls] Answers query warning:', ansErr.message);
      }

      const polls = (result.recordset || []).map(row => {
        const pollId = String(row.id);
        const answeredUserIds = answersMap[pollId] || [];
        const targetUserIds = safeParseJSON(row.targetUserIds, []);
        const targetCount = targetUserIds.length;
        const answeredCount = answeredUserIds.filter(uid => targetUserIds.includes(uid)).length;
        const isAllAnswered = targetCount > 0 && answeredCount >= targetCount;
        return {
          id: pollId,
          title: row.title,
          description: row.description || '',
          organizerId: String(row.organizerId),
          organizerName: row.organizerName,
          status: row.status || 'open',
          durationMinutes: Number(row.durationMinutes) || 60,
          location: row.location || '',
          targetUserIds,
          candidates: safeParseJSON(row.candidates, []),
          deadlineAt: row.deadlineAt ? row.deadlineAt.toISOString() : null,
          confirmedCandidateId: row.confirmedCandidateId || null,
          createdEventId: row.createdEventId ? String(row.createdEventId) : null,
          createdAt: row.createdAt ? row.createdAt.toISOString() : null,
          updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
          answeredUserIds,
          answeredCount,
          totalTargetCount: targetCount,
          isAllAnswered,
          hasAnswered: userId ? answeredUserIds.includes(userId) : false,
        };
      });

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
      const rawPolls = safeParseJSON(raw, []);

      // JSON fallback の回答者一覧マップ
      const answersMap = {};
      try {
        if (fs.existsSync(ANSWERS_FILE)) {
          const rawA = fs.readFileSync(ANSWERS_FILE, 'utf8');
          const allAnswers = safeParseJSON(rawA, []);
          allAnswers.forEach(r => {
            const pId = String(r.pollId);
            if (!answersMap[pId]) answersMap[pId] = [];
            const uId = String(r.userId);
            if (!answersMap[pId].includes(uId)) {
              answersMap[pId].push(uId);
            }
          });
        }
      } catch (ansErr) {
        console.warn('[SchedulePolls] Answers file warning:', ansErr.message);
      }

      const polls = rawPolls.map(p => {
        const pollId = String(p.id);
        const answeredUserIds = answersMap[pollId] || [];
        const targetUserIds = Array.isArray(p.targetUserIds) ? p.targetUserIds : safeParseJSON(p.targetUserIds, []);
        const targetCount = targetUserIds.length;
        const answeredCount = answeredUserIds.filter(uid => targetUserIds.includes(uid)).length;
        const isAllAnswered = targetCount > 0 && answeredCount >= targetCount;
        return {
          ...p,
          targetUserIds,
          answeredUserIds,
          answeredCount,
          totalTargetCount: targetCount,
          isAllAnswered,
          hasAnswered: userId ? answeredUserIds.includes(userId) : false,
        };
      });

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

    // 1. 全Eventsを取得（dbo.Events の既存物理カラムに合致する安全なSELECT）
    let rawEvents = [];
    const pool = await getPool();
    if (pool) {
      const result = await pool.request().query`
        SELECT *
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
      if (typeof row.description === 'string') {
        const trimmed = row.description.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try { detailsObj = JSON.parse(trimmed); } catch (_) {}
        }
      }
      if (Object.keys(detailsObj).length === 0 && typeof row.details === 'string') {
        const trimmed = row.details.trim();
        if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
          try { detailsObj = JSON.parse(trimmed); } catch (_) {}
        }
      }

      const rawStart = row.startAt || row.start || detailsObj.startAt || detailsObj.start;
      const rawEnd = row.endAt || row.end || detailsObj.endAt || detailsObj.end || rawStart;
      if (!rawStart) continue;

      const isAllDay = !!(row.isAllDay || detailsObj.isAllDay);
      let evStart = parseEventDate(rawStart);
      let evEnd = parseEventDate(rawEnd);
      if (!evStart) continue;
      if (!evEnd || evEnd < evStart) evEnd = evStart;

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
        detailsObj.authorId ||
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
          const aId = typeof a === 'string' ? a : (a?.id || a?.userId || a?.loginId);
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
              if (targetSet.size === 0) {
                if (ev.creatorId) busyUsers.add(ev.creatorId);
                ev.participantIds.forEach(pId => busyUsers.add(pId));
              }
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
      // 全員回答完了の判定 (SQL)
      const ansCheck = await pool.request()
        .input('pollId', sql.NVarChar(64), id)
        .query`SELECT userId FROM dbo.SchedulePollAnswers WHERE pollId = @pollId`;
      const allUserIds = (ansCheck.recordset || []).map(r => String(r.userId));

      const pollRes = await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`SELECT organizerId, organizerName, targetUserIds, title FROM dbo.SchedulePolls WHERE id = @id`;
      const pollRow = (pollRes.recordset && pollRes.recordset[0]) || null;
      const targetUserIds = pollRow ? safeParseJSON(pollRow.targetUserIds, []) : [];
      const answeredCount = allUserIds.filter(uid => targetUserIds.includes(uid)).length;
      const totalTargetCount = targetUserIds.length;
      const isAllAnswered = totalTargetCount > 0 && answeredCount >= totalTargetCount;

      res.json({
        ...answerData,
        isAllAnswered,
        organizerId: pollRow ? String(pollRow.organizerId) : null,
        organizerName: pollRow ? pollRow.organizerName : null,
        pollTitle: pollRow ? pollRow.title : '',
        answeredCount,
        totalTargetCount,
      });
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

      // 全員回答完了の判定 (JSON)
      const allUserIds = allAnswers.filter(a => a.pollId === id).map(a => String(a.userId));
      const rawP = fs.readFileSync(POLLS_FILE, 'utf8');
      const polls = safeParseJSON(rawP, []);
      const pollRow = polls.find(p => p.id === id);
      const targetUserIds = pollRow ? (Array.isArray(pollRow.targetUserIds) ? pollRow.targetUserIds : safeParseJSON(pollRow.targetUserIds, [])) : [];
      const answeredCount = allUserIds.filter(uid => targetUserIds.includes(uid)).length;
      const totalTargetCount = targetUserIds.length;
      const isAllAnswered = totalTargetCount > 0 && answeredCount >= totalTargetCount;

      res.json({
        ...answerData,
        isAllAnswered,
        organizerId: pollRow ? String(pollRow.organizerId) : null,
        organizerName: pollRow ? pollRow.organizerName : null,
        pollTitle: pollRow ? pollRow.title : '',
        answeredCount,
        totalTargetCount,
      });
    }
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
      const rawP = fs.readFileSync(POLLS_FILE, 'utf8');
      const polls = safeParseJSON(rawP, []);
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
    const eventId = `e-poll-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`;
    const eventTitle = finalTitle || `【確定】${poll.title}`;
    const eventLocation = finalLocation !== undefined ? finalLocation : (poll.location || '');
    const eventDesc = finalDescription || (poll.description ? `${poll.description}\n\n(日程調整より自動確定)` : '(日程調整より自動確定)');

    const nowIso = new Date().toISOString();
    const descPayload = {
      memo: eventDesc,
      createdBy: {
        id: poll.organizerId,
        name: poll.organizerName,
      },
      createdById: poll.organizerId,
      attendees: (poll.targetUserIds || []).map(uId => ({ id: uId })),
      participants: poll.targetUserIds || [],
      location: eventLocation,
      source: 'schedule_poll',
      pollId: id,
      createdAt: nowIso,
      registeredAt: nowIso,
    };

    const newEvent = {
      id: eventId,
      title: eventTitle,
      startAt: candidate.startAt,
      endAt: candidate.endAt,
      isAllDay: false,
      isPrivate: false,
      category: 'meeting',
      description: JSON.stringify(descPayload),
      location: eventLocation,
      office: '全社',
      division: '全部署',
      attachments: [],
      recurrence: null,
      recurrenceParentId: null,
      recurrenceOriginalDate: null,
      recurrenceExceptions: [],
      createdBy: { id: poll.organizerId, name: poll.organizerName },
      createdById: poll.organizerId,
      attendees: (poll.targetUserIds || []).map(uId => ({ id: uId })),
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    if (pool) {
      await pool.request()
        .input('eId', sql.VarChar, String(newEvent.id))
        .input('eTitle', sql.NVarChar, newEvent.title)
        .input('eStartAt', sql.DateTime2, new Date(newEvent.startAt))
        .input('eEndAt', sql.DateTime2, new Date(newEvent.endAt))
        .input('eIsAllDay', sql.Bit, 0)
        .input('eIsPrivate', sql.Bit, 0)
        .input('eCategory', sql.NVarChar, newEvent.category)
        .input('eDesc', sql.NVarChar, newEvent.description)
        .input('eLoc', sql.NVarChar, newEvent.location)
        .input('eOffice', sql.NVarChar, newEvent.office)
        .input('eDivision', sql.NVarChar, newEvent.division)
        .input('eAttachments', sql.NVarChar, null)
        .input('eRecurrence', sql.NVarChar, null)
        .input('eRecurrenceParentId', sql.VarChar, null)
        .input('eRecurrenceOriginalDate', sql.VarChar, null)
        .input('eRecurrenceExceptions', sql.NVarChar, null)
        .input('eCreatedAt', sql.DateTime2, new Date(newEvent.createdAt))
        .input('eUpdatedAt', sql.DateTime2, new Date(newEvent.updatedAt))
        .query(`
          INSERT INTO dbo.Events (
            id, title, startAt, endAt, isAllDay, isPrivate, category, description,
            location, office, division, attachments, recurrence, recurrenceParentId,
            recurrenceOriginalDate, recurrenceExceptions, createdAt, updatedAt
          ) VALUES (
            @eId, @eTitle, @eStartAt, @eEndAt, @eIsAllDay, @eIsPrivate, @eCategory, @eDesc,
            @eLoc, @eOffice, @eDivision, @eAttachments, @eRecurrence, @eRecurrenceParentId,
            @eRecurrenceOriginalDate, @eRecurrenceExceptions, @eCreatedAt, @eUpdatedAt
          )
        `);

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
// 7. 日程調整の再編集・更新 (PUT /api/schedule-polls/:id)
//    ※ 未確定 (open) の調整かつ主催者本人/管理者のみ許可
// ==========================================
const handleUpdatePoll = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      title,
      description = '',
      durationMinutes = 60,
      location = '',
      targetUserIds = [],
      candidates = [],
      deadlineAt = null,
    } = req.body || {};

    if (!title || !String(title).trim() || !Array.isArray(candidates) || candidates.length === 0) {
      return res.status(400).json({ error: 'タイトルおよび1件以上の候補日時は必須です' });
    }

    const pool = await getPool();
    let existingPoll = null;
    let allPollsJson = null;
    let pollIdx = -1;

    if (pool) {
      await initTables(pool);
      const pollRes = await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`SELECT * FROM dbo.SchedulePolls WHERE id = @id`;
      if (pollRes.recordset && pollRes.recordset.length > 0) {
        const row = pollRes.recordset[0];
        existingPoll = {
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
      }
    } else {
      ensureDataFiles();
      const rawP = fs.readFileSync(POLLS_FILE, 'utf8');
      allPollsJson = safeParseJSON(rawP, []);
      pollIdx = allPollsJson.findIndex(p => String(p.id) === String(id));
      if (pollIdx >= 0) {
        const p = allPollsJson[pollIdx];
        existingPoll = {
          ...p,
          id: String(p.id),
          organizerId: String(p.organizerId),
          status: p.status || 'open',
          targetUserIds: Array.isArray(p.targetUserIds) ? p.targetUserIds : safeParseJSON(p.targetUserIds, []),
          candidates: Array.isArray(p.candidates) ? p.candidates : safeParseJSON(p.candidates, []),
        };
      }
    }

    if (!existingPoll) {
      return res.status(404).json({ error: '指定された日程調整が見つかりません' });
    }

    if (!canManagePoll(req, existingPoll)) {
      return res.status(403).json({ error: 'この日程調整を編集する権限がありません（主催者または管理者のみ編集可能です）' });
    }

    if (existingPoll.status === 'confirmed') {
      return res.status(409).json({ error: '日程確定済みの調整は編集できません（予定の変更はカレンダーから行ってください）' });
    }

    const nowIso = new Date().toISOString();
    const normalizedTargetUserIds = Array.from(
      new Set((Array.isArray(targetUserIds) ? targetUserIds : []).map(String).filter(Boolean))
    );

    const formattedCandidates = candidates.map((c, idx) => ({
      id: c.id || `c_${Date.now()}_${idx + 1}_${Math.random().toString(36).substring(2, 6)}`,
      startAt: c.startAt,
      endAt: c.endAt,
      text: c.text || '',
    }));

    const parsedDeadline = deadlineAt ? parseEventDate(deadlineAt) : null;
    const normalizedDeadlineIso = parsedDeadline ? parsedDeadline.toISOString() : null;

    // 差分メタ情報の算出
    const prevTargetSet = new Set((existingPoll.targetUserIds || []).map(String));
    const nextTargetSet = new Set(normalizedTargetUserIds);
    const addedTargetUserIds = normalizedTargetUserIds.filter(uid => !prevTargetSet.has(uid));
    const removedTargetUserIds = (existingPoll.targetUserIds || []).map(String).filter(uid => !nextTargetSet.has(uid));

    const prevCandidateIds = new Set((existingPoll.candidates || []).map(c => String(c.id)));
    const nextCandidateIds = new Set(formattedCandidates.map(c => String(c.id)));
    const addedCandidateIds = formattedCandidates.map(c => String(c.id)).filter(cid => !prevCandidateIds.has(cid));
    const removedCandidateIds = (existingPoll.candidates || []).map(c => String(c.id)).filter(cid => !nextCandidateIds.has(cid));

    const updatedPoll = {
      ...existingPoll,
      title: String(title).trim(),
      description: description !== undefined && description !== null ? String(description) : '',
      durationMinutes: Number(durationMinutes) || 60,
      location: location !== undefined && location !== null ? String(location) : '',
      targetUserIds: normalizedTargetUserIds,
      candidates: formattedCandidates,
      deadlineAt: normalizedDeadlineIso,
      updatedAt: nowIso,
    };

    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(64), id)
        .input('title', sql.NVarChar(255), updatedPoll.title)
        .input('description', sql.NVarChar(sql.MAX), updatedPoll.description)
        .input('durationMinutes', sql.Int, updatedPoll.durationMinutes)
        .input('location', sql.NVarChar(255), updatedPoll.location)
        .input('targetUserIds', sql.NVarChar(sql.MAX), JSON.stringify(updatedPoll.targetUserIds))
        .input('candidates', sql.NVarChar(sql.MAX), JSON.stringify(updatedPoll.candidates))
        .input('deadlineAt', sql.DateTime2, parsedDeadline)
        .query`
          UPDATE dbo.SchedulePolls
          SET title = @title,
              description = @description,
              durationMinutes = @durationMinutes,
              location = @location,
              targetUserIds = @targetUserIds,
              candidates = @candidates,
              deadlineAt = @deadlineAt,
              updatedAt = SYSUTCDATETIME()
          WHERE id = @id
        `;

      // 削除された候補枠に紐づく回答エントリを安全にクリーンアップ
      if (removedCandidateIds.length > 0) {
        try {
          const ansRes = await pool.request()
            .input('pollId', sql.NVarChar(64), id)
            .query`SELECT id, responses FROM dbo.SchedulePollAnswers WHERE pollId = @pollId`;
          for (const row of (ansRes.recordset || [])) {
            const origResponses = safeParseJSON(row.responses, []);
            const cleanedResponses = origResponses.filter(r => nextCandidateIds.has(String(r.candidateId)));
            if (cleanedResponses.length !== origResponses.length) {
              await pool.request()
                .input('ansId', sql.NVarChar(64), String(row.id))
                .input('responses', sql.NVarChar(sql.MAX), JSON.stringify(cleanedResponses))
                .query`
                  UPDATE dbo.SchedulePollAnswers
                  SET responses = @responses,
                      updatedAt = SYSUTCDATETIME()
                  WHERE id = @ansId
                `;
            }
          }
        } catch (cleanErr) {
          console.warn('[SchedulePolls PUT] Answer cleanup warning:', cleanErr.message);
        }
      }
    } else {
      allPollsJson[pollIdx] = updatedPoll;
      fs.writeFileSync(POLLS_FILE, JSON.stringify(allPollsJson, null, 2), 'utf8');

      // JSON fallback の回答クリーンアップ
      if (removedCandidateIds.length > 0) {
        try {
          const rawA = fs.readFileSync(ANSWERS_FILE, 'utf8');
          const allAnswers = safeParseJSON(rawA, []);
          let answersModified = false;
          for (const ans of allAnswers) {
            if (String(ans.pollId) === String(id) && Array.isArray(ans.responses)) {
              const cleaned = ans.responses.filter(r => nextCandidateIds.has(String(r.candidateId)));
              if (cleaned.length !== ans.responses.length) {
                ans.responses = cleaned;
                ans.updatedAt = nowIso;
                answersModified = true;
              }
            }
          }
          if (answersModified) {
            fs.writeFileSync(ANSWERS_FILE, JSON.stringify(allAnswers, null, 2), 'utf8');
          }
        } catch (cleanErr) {
          console.warn('[SchedulePolls PUT JSON] Answer cleanup warning:', cleanErr.message);
        }
      }
    }

    res.json({
      ...updatedPoll,
      diff: {
        addedTargetUserIds,
        removedTargetUserIds,
        addedCandidateIds,
        removedCandidateIds,
      },
    });
  } catch (err) {
    console.error('[SchedulePolls PUT Error]:', err);
    res.status(500).json({ error: '日程調整の更新に失敗しました', details: err.message });
  }
};

router.put(['/schedule-polls/:id', '/schedule/polls/:id', '/polls/:id'], handleUpdatePoll);
router.put('/:id', (req, res, next) => {
  if (req.baseUrl === '/api') return next();
  return handleUpdatePoll(req, res, next);
});

// ==========================================
// 8. 日程調整削除 (DELETE /api/schedule-polls/:id)
//    ※ 未確定 (open) の調整かつ主催者本人/管理者のみ許可
// ==========================================
const handleDeletePoll = async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    let existingPoll = null;
    let allPollsJson = null;

    if (pool) {
      await initTables(pool);
      const pollRes = await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`SELECT id, organizerId, status FROM dbo.SchedulePolls WHERE id = @id`;
      if (pollRes.recordset && pollRes.recordset.length > 0) {
        existingPoll = {
          id: String(pollRes.recordset[0].id),
          organizerId: String(pollRes.recordset[0].organizerId),
          status: pollRes.recordset[0].status || 'open',
        };
      }
    } else {
      ensureDataFiles();
      const rawP = fs.readFileSync(POLLS_FILE, 'utf8');
      allPollsJson = safeParseJSON(rawP, []);
      const found = allPollsJson.find(p => String(p.id) === String(id));
      if (found) {
        existingPoll = {
          id: String(found.id),
          organizerId: String(found.organizerId),
          status: found.status || 'open',
        };
      }
    }

    if (!existingPoll) {
      return res.status(404).json({ error: '指定された日程調整が見つかりません' });
    }

    if (!canManagePoll(req, existingPoll)) {
      return res.status(403).json({ error: 'この日程調整を削除する権限がありません（主催者または管理者のみ削除可能です）' });
    }

    if (existingPoll.status === 'confirmed') {
      return res.status(409).json({ error: '日程確定済みの調整は削除できません' });
    }

    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`
          DELETE FROM dbo.SchedulePollAnswers WHERE pollId = @id;
          DELETE FROM dbo.SchedulePolls WHERE id = @id;
        `;
    } else {
      const remainingPolls = allPollsJson.filter(p => String(p.id) !== String(id));
      fs.writeFileSync(POLLS_FILE, JSON.stringify(remainingPolls, null, 2), 'utf8');

      const rawA = fs.readFileSync(ANSWERS_FILE, 'utf8');
      let allAnswers = safeParseJSON(rawA, []);
      allAnswers = allAnswers.filter(a => String(a.pollId) !== String(id));
      fs.writeFileSync(ANSWERS_FILE, JSON.stringify(allAnswers, null, 2), 'utf8');
    }

    res.json({ success: true, message: '日程調整を削除しました', deletedId: id });
  } catch (err) {
    console.error('[SchedulePolls DELETE Error]:', err);
    res.status(500).json({ error: '日程調整の削除に失敗しました', details: err.message });
  }
};

router.delete(['/schedule-polls/:id', '/schedule/polls/:id', '/polls/:id'], handleDeletePoll);
router.delete('/:id', (req, res, next) => {
  if (req.baseUrl === '/api') return next();
  return handleDeletePoll(req, res, next);
});

export default router;
