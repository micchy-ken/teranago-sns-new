import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { safeParseJSON, dataDir } from '../config.js';

const router = Router();

// ==========================================
// カレンダー行事・予定 (dbo.Events & events.json ハイブリッド)
// ==========================================
const eventsFilePath = path.join(dataDir, 'events.json');

function loadEventsFromFile() {
  if (!fs.existsSync(eventsFilePath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(eventsFilePath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveEventsToFile(events) {
  try {
    fs.writeFileSync(eventsFilePath, JSON.stringify(events, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save events to file:', e);
  }
}

async function ensureEventsColumns(pool) {
  if (!pool) return;
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Events') AND name = 'isPrivate')
      BEGIN
        ALTER TABLE dbo.Events ADD isPrivate BIT NULL DEFAULT 0;
      END
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Events') AND name = 'siteId')
      BEGIN
        ALTER TABLE dbo.Events ADD siteId VARCHAR(50) NULL;
      END
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Events') AND name = 'siteCode')
      BEGIN
        ALTER TABLE dbo.Events ADD siteCode VARCHAR(50) NULL;
      END
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Events') AND name = 'siteName')
      BEGIN
        ALTER TABLE dbo.Events ADD siteName NVARCHAR(200) NULL;
      END
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Events') AND name = 'constructionPhase')
      BEGIN
        ALTER TABLE dbo.Events ADD constructionPhase VARCHAR(20) NULL;
      END
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Events') AND name = 'createdAt')
      BEGIN
        ALTER TABLE dbo.Events ADD createdAt DATETIME2 NULL DEFAULT SYSUTCDATETIME();
      END
      IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.Events') AND name = 'updatedAt')
      BEGIN
        ALTER TABLE dbo.Events ADD updatedAt DATETIME2 NULL DEFAULT SYSUTCDATETIME();
      END
    `);
  } catch (_) {}
}

// 日時文字列を安全にパース（タイムゾーンオフセットがない場合は JST +09:00 として解釈）
function parseEventDate(val) {
  if (!val) return new Date();
  if (val instanceof Date) return isNaN(val.getTime()) ? new Date() : val;
  const s = String(val).trim();
  if (!s) return new Date();
  if (s.endsWith('Z') || s.includes('+') || (s.includes('-') && s.length > 19 && s[19] === '-')) {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d;
  }
  const normalized = s.replace(' ', 'T');
  if (normalized.length === 10) {
    const dDateOnly = new Date(`${normalized}T00:00:00+09:00`);
    if (!isNaN(dDateOnly.getTime())) return dDateOnly;
  }
  const dJst = new Date(`${normalized}${normalized.length === 16 ? ':00' : ''}+09:00`);
  if (!isNaN(dJst.getTime())) return dJst;
  const fallback = new Date(s);
  return isNaN(fallback.getTime()) ? new Date() : fallback;
}

router.get(['/events', '/api/events'], async (req, res) => {
  try {
    let events = [];
    let fromSql = false;
    try {
      const pool = await getPool();
      if (pool) {
        await ensureEventsColumns(pool);
        const result = await pool.request().query`SELECT * FROM dbo.Events ORDER BY startAt ASC`;
        if (result && result.recordset) {
          events = result.recordset.map(row => {
            let detailsObj = {};
            if (row.description && typeof row.description === 'string' && row.description.startsWith('{')) {
              try { detailsObj = JSON.parse(row.description); } catch (_) {}
            }
            const rawCreated = row.createdAt || detailsObj.createdAt || detailsObj.registeredAt;
            const parsedCreated = rawCreated ? new Date(rawCreated).toISOString() : null;
            const nowIso = new Date().toISOString();

            return {
              id: String(row.id),
              title: row.title,
              startAt: row.startAt,
              endAt: row.endAt,
              start: row.startAt,
              end: row.endAt,
              isAllDay: !!row.isAllDay,
              isPrivate: !!(row.isPrivate || row.isSecret),
              category: row.category || 'general',
              type: row.category || 'general',
              description: row.description || '',
              location: row.location || '',
              office: row.office || '',
              division: row.division || '',
              attachments: safeParseJSON(row.attachments, []),
              recurrence: safeParseJSON(row.recurrence, null),
              recurrenceParentId: row.recurrenceParentId || null,
              recurrenceOriginalDate: row.recurrenceOriginalDate || null,
              recurrenceExceptions: safeParseJSON(row.recurrenceExceptions, []),
              siteId: row.siteId || detailsObj.siteId || null,
              siteCode: row.siteCode || detailsObj.siteCode || null,
              siteName: row.siteName || detailsObj.siteName || null,
              constructionPhase: row.constructionPhase || detailsObj.constructionPhase || null,
              createdBy: detailsObj.createdBy || detailsObj.creator || row.createdBy || null,
              createdById: detailsObj.createdById || detailsObj.creatorId || row.createdById || null,
              attendees: detailsObj.attendees || detailsObj.participants || [],
              createdAt: (parsedCreated && new Date(parsedCreated).getTime() <= Date.now()) ? parsedCreated : nowIso,
              updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : nowIso
            };
          });
          fromSql = true;
        }
      }
    } catch (sqlErr) {
      console.warn('[routes/events] SQL Server query failed, falling back to file:', sqlErr.message);
    }

    if (!fromSql || events.length === 0) {
      const fileEvents = loadEventsFromFile();
      if (fileEvents.length > 0) {
        events = fileEvents;
      }
    }

    res.json(events);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.post(['/events', '/api/events'], async (req, res) => {
  try {
    const { 
      title, startAt, endAt, start, end, isAllDay, isPrivate, category, type, 
      description, location, office, division, attachments, 
      recurrence, recurrenceParentId, recurrenceOriginalDate, recurrenceExceptions,
      siteId, siteCode, siteName, constructionPhase
    } = req.body;

    const id = req.body.id || `e-${Date.now()}`;
    const effectiveCategory = category || type || 'general';
    const effectiveStart = startAt || start || new Date().toISOString();
    const effectiveEnd = endAt || end || effectiveStart;

    // ファイル保存（冗長バックアップ）
    const fileEvents = loadEventsFromFile();
    const newFileEvent = {
      id: String(id),
      title: title || '予定',
      start: effectiveStart,
      end: effectiveEnd,
      startAt: effectiveStart,
      endAt: effectiveEnd,
      isAllDay: !!isAllDay,
      isPrivate: !!isPrivate,
      type: effectiveCategory,
      category: effectiveCategory,
      description: typeof description === 'object' ? JSON.stringify(description) : (description || ''),
      location: location || '',
      office: office || '',
      division: division || '',
      attachments: attachments || [],
      recurrence: recurrence || null,
      recurrenceParentId: recurrenceParentId || null,
      recurrenceOriginalDate: recurrenceOriginalDate || null,
      recurrenceExceptions: recurrenceExceptions || [],
      siteId: siteId || null,
      siteCode: siteCode || null,
      siteName: siteName || null,
      constructionPhase: constructionPhase || null,
      updatedAt: new Date().toISOString()
    };
    const fIdx = fileEvents.findIndex(e => String(e.id) === String(id));
    if (fIdx >= 0) {
      fileEvents[fIdx] = newFileEvent;
    } else {
      fileEvents.push(newFileEvent);
    }
    saveEventsToFile(fileEvents);

    // SQL Server 保存
    try {
      const pool = await getPool();
      if (pool) {
        await ensureEventsColumns(pool);
        await pool.request()
          .input('id', sql.VarChar, String(id))
          .input('title', sql.NVarChar, title || '予定')
          .input('startAt', sql.DateTime2, parseEventDate(effectiveStart))
          .input('endAt', sql.DateTime2, parseEventDate(effectiveEnd))
          .input('isAllDay', sql.Bit, isAllDay ? 1 : 0)
          .input('isPrivate', sql.Bit, isPrivate ? 1 : 0)
          .input('category', sql.NVarChar, effectiveCategory)
          .input('description', sql.NVarChar, typeof description === 'object' ? JSON.stringify(description) : (description || ''))
          .input('location', sql.NVarChar, location || '')
          .input('office', sql.NVarChar, office || '')
          .input('division', sql.NVarChar, division || '')
          .input('attachments', sql.NVarChar, attachments ? JSON.stringify(attachments) : null)
          .input('recurrence', sql.NVarChar, recurrence ? JSON.stringify(recurrence) : null)
          .input('recurrenceParentId', sql.VarChar, recurrenceParentId || null)
          .input('recurrenceOriginalDate', sql.VarChar, recurrenceOriginalDate || null)
          .input('recurrenceExceptions', sql.NVarChar, recurrenceExceptions ? JSON.stringify(recurrenceExceptions) : null)
          .input('siteId', sql.VarChar, siteId || null)
          .input('siteCode', sql.VarChar, siteCode || null)
          .input('siteName', sql.NVarChar, siteName || null)
          .input('constructionPhase', sql.VarChar, constructionPhase || null)
          .query(`
            INSERT INTO dbo.Events (id, title, startAt, endAt, isAllDay, isPrivate, category, description, location, office, division, attachments, recurrence, recurrenceParentId, recurrenceOriginalDate, recurrenceExceptions, siteId, siteCode, siteName, constructionPhase) 
            VALUES (@id, @title, @startAt, @endAt, @isAllDay, @isPrivate, @category, @description, @location, @office, @division, @attachments, @recurrence, @recurrenceParentId, @recurrenceOriginalDate, @recurrenceExceptions, @siteId, @siteCode, @siteName, @constructionPhase)
          `);
      }
    } catch (sqlErr) {
      console.warn('[routes/events] SQL Server insert failed, used file fallback:', sqlErr.message);
    }

    res.status(201).json({ id, message: '予定登録完了', event: newFileEvent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.put(['/events/:id', '/api/events/:id'], async (req, res) => {
  try {
    const { 
      title, startAt, endAt, start, end, isAllDay, isPrivate, category, type, 
      description, location, office, division, attachments, 
      recurrence, recurrenceParentId, recurrenceOriginalDate, recurrenceExceptions,
      siteId, siteCode, siteName, constructionPhase
    } = req.body;

    const id = req.params.id;
    const effectiveCategory = category || type || 'general';
    const effectiveStart = startAt || start || new Date().toISOString();
    const effectiveEnd = endAt || end || effectiveStart;

    // ファイル更新
    const fileEvents = loadEventsFromFile();
    const fIdx = fileEvents.findIndex(e => String(e.id) === String(id));
    const updatedFileEvent = {
      ...(fIdx >= 0 ? fileEvents[fIdx] : {}),
      id: String(id),
      title: title || '予定',
      start: effectiveStart,
      end: effectiveEnd,
      startAt: effectiveStart,
      endAt: effectiveEnd,
      isAllDay: !!isAllDay,
      isPrivate: !!isPrivate,
      type: effectiveCategory,
      category: effectiveCategory,
      description: typeof description === 'object' ? JSON.stringify(description) : (description || ''),
      location: location || '',
      office: office || '',
      division: division || '',
      attachments: attachments !== undefined ? attachments : (fIdx >= 0 ? fileEvents[fIdx].attachments : []),
      recurrence: recurrence !== undefined ? recurrence : (fIdx >= 0 ? fileEvents[fIdx].recurrence : null),
      recurrenceParentId: recurrenceParentId || null,
      recurrenceOriginalDate: recurrenceOriginalDate || null,
      recurrenceExceptions: recurrenceExceptions !== undefined ? recurrenceExceptions : (fIdx >= 0 ? fileEvents[fIdx].recurrenceExceptions : []),
      siteId: siteId !== undefined ? siteId : (fIdx >= 0 ? fileEvents[fIdx].siteId : null),
      siteCode: siteCode !== undefined ? siteCode : (fIdx >= 0 ? fileEvents[fIdx].siteCode : null),
      siteName: siteName !== undefined ? siteName : (fIdx >= 0 ? fileEvents[fIdx].siteName : null),
      constructionPhase: constructionPhase !== undefined ? constructionPhase : (fIdx >= 0 ? fileEvents[fIdx].constructionPhase : null),
      updatedAt: new Date().toISOString()
    };
    if (fIdx >= 0) {
      fileEvents[fIdx] = updatedFileEvent;
    } else {
      fileEvents.push(updatedFileEvent);
    }
    saveEventsToFile(fileEvents);

    // SQL Server 更新
    try {
      const pool = await getPool();
      if (pool) {
        await ensureEventsColumns(pool);
        await pool.request()
          .input('id', sql.VarChar, String(id))
          .input('title', sql.NVarChar, title || '予定')
          .input('startAt', sql.DateTime2, parseEventDate(effectiveStart))
          .input('endAt', sql.DateTime2, parseEventDate(effectiveEnd))
          .input('isAllDay', sql.Bit, isAllDay ? 1 : 0)
          .input('isPrivate', sql.Bit, isPrivate ? 1 : 0)
          .input('category', sql.NVarChar, effectiveCategory)
          .input('description', sql.NVarChar, typeof description === 'object' ? JSON.stringify(description) : (description || ''))
          .input('location', sql.NVarChar, location || '')
          .input('office', sql.NVarChar, office || '')
          .input('division', sql.NVarChar, division || '')
          .input('attachments', sql.NVarChar, attachments ? JSON.stringify(attachments) : null)
          .input('recurrence', sql.NVarChar, recurrence ? JSON.stringify(recurrence) : null)
          .input('recurrenceParentId', sql.VarChar, recurrenceParentId || null)
          .input('recurrenceOriginalDate', sql.VarChar, recurrenceOriginalDate || null)
          .input('recurrenceExceptions', sql.NVarChar, recurrenceExceptions ? JSON.stringify(recurrenceExceptions) : null)
          .input('siteId', sql.VarChar, updatedFileEvent.siteId || null)
          .input('siteCode', sql.VarChar, updatedFileEvent.siteCode || null)
          .input('siteName', sql.NVarChar, updatedFileEvent.siteName || null)
          .input('constructionPhase', sql.VarChar, updatedFileEvent.constructionPhase || null)
          .query(`
            UPDATE dbo.Events 
            SET title = @title, startAt = @startAt, endAt = @endAt, isAllDay = @isAllDay, isPrivate = @isPrivate,
                category = @category, description = @description, location = @location, office = @office, division = @division, 
                attachments = @attachments, recurrence = @recurrence, recurrenceParentId = @recurrenceParentId, 
                recurrenceOriginalDate = @recurrenceOriginalDate, recurrenceExceptions = @recurrenceExceptions,
                siteId = @siteId, siteCode = @siteCode, siteName = @siteName, constructionPhase = @constructionPhase
            WHERE id = @id
          `);
      }
    } catch (sqlErr) {
      console.warn('[routes/events] SQL Server update failed, used file fallback:', sqlErr.message);
    }

    res.json({ message: '予定更新完了', event: updatedFileEvent });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

router.delete(['/events/:id', '/api/events/:id'], async (req, res) => {
  try {
    const id = req.params.id;

    // ファイルから削除
    const fileEvents = loadEventsFromFile();
    const filtered = fileEvents.filter(e => String(e.id) !== String(id));
    saveEventsToFile(filtered);

    // SQL Server から削除
    try {
      const pool = await getPool();
      if (pool) {
        await pool.request()
          .input('id', sql.VarChar, String(id))
          .query`DELETE FROM dbo.Events WHERE id = @id`;
      }
    } catch (sqlErr) {
      console.warn('[routes/events] SQL Server delete failed, used file fallback:', sqlErr.message);
    }

    res.json({ message: '予定削除完了', id });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 点検スケジューラー: 下書き保存・自動保存・翌月繰越 (SQL & File 冗長化)
// ==========================================
const inspectionDraftsPath = path.join(dataDir, 'inspection_drafts.json');

function loadInspectionDraftsFromFile() {
  if (!fs.existsSync(inspectionDraftsPath)) return [];
  try {
    const raw = JSON.parse(fs.readFileSync(inspectionDraftsPath, 'utf8'));
    return Array.isArray(raw) ? raw : [];
  } catch (e) {
    return [];
  }
}

function saveInspectionDraftsToFile(drafts) {
  try {
    fs.writeFileSync(inspectionDraftsPath, JSON.stringify(drafts, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save inspection drafts:', e);
  }
}

function getPreviousYearMonth(yearMonthStr) {
  if (!yearMonthStr) return '';
  let str = String(yearMonthStr);
  try { str = decodeURIComponent(str); } catch (_) {}
  const [ymPart, ...suffixParts] = str.split('_');
  const suffix = suffixParts.length > 0 ? '_' + suffixParts.join('_') : '';

  const [y, m] = ymPart.split('-').map(Number);
  if (!y || !m) return '';
  const date = new Date(y, m - 2, 1);
  const prevY = date.getFullYear();
  const prevM = String(date.getMonth() + 1).padStart(2, '0');
  return `${prevY}-${prevM}${suffix}`;
}

function normalizeYmParam(raw) {
  if (!raw) return new Date().toISOString().slice(0, 7);
  let str = String(raw);
  try { str = decodeURIComponent(str); } catch (_) {}
  return str;
}

const ensureInspectionDraftsTable = async (pool) => {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionDrafts' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.InspectionDrafts (
          targetYearMonth NVARCHAR(100) NOT NULL PRIMARY KEY,
          itemsJson NVARCHAR(MAX) NOT NULL,
          currentStep VARCHAR(50) NULL,
          lastSavedAt DATETIME2 NOT NULL DEFAULT GETDATE(),
          savedByUserId VARCHAR(50) NULL,
          savedByUserName NVARCHAR(100) NULL,
          updatedBy NVARCHAR(100) NULL
        );
      END
      ELSE
      BEGIN
        IF EXISTS (
          SELECT * FROM sys.columns 
          WHERE object_id = OBJECT_ID('dbo.InspectionDrafts') 
            AND name = 'targetYearMonth' 
            AND (max_length < 200 OR system_type_id = 167)
        )
        BEGIN
          DECLARE @pkName NVARCHAR(200);
          SELECT @pkName = name FROM sys.key_constraints WHERE parent_object_id = OBJECT_ID('dbo.InspectionDrafts') AND type = 'PK';
          IF @pkName IS NOT NULL
            EXEC('ALTER TABLE dbo.InspectionDrafts DROP CONSTRAINT ' + @pkName);
          
          ALTER TABLE dbo.InspectionDrafts ALTER COLUMN targetYearMonth NVARCHAR(100) NOT NULL;
          ALTER TABLE dbo.InspectionDrafts ADD CONSTRAINT PK_InspectionDrafts PRIMARY KEY (targetYearMonth);
        END
      END
    `);
  } catch (e) {
    console.warn('[SQL] ensureInspectionDraftsTable warning:', e.message);
  }
};

// 指定年月の下書き保存状態取得
router.get(['/inspection/drafts', '/inspection/drafts/:targetYearMonth', '/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], async (req, res) => {
  try {
    const targetYearMonth = normalizeYmParam(req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || (req.body && req.body.targetYearMonth));

    // 1. SQL Server から検索
    try {
      const pool = await getPool();
      if (pool) {
        await ensureInspectionDraftsTable(pool);
        const sqlRes = await pool.request()
          .input('targetYearMonth', sql.NVarChar(100), String(targetYearMonth))
          .query('SELECT * FROM dbo.InspectionDrafts WHERE targetYearMonth = @targetYearMonth');
        
        if (sqlRes.recordset && sqlRes.recordset.length > 0) {
          const row = sqlRes.recordset[0];
          let items = [];
          try { items = JSON.parse(row.itemsJson); } catch (_) { items = []; }
          return res.json({
            exists: true,
            targetYearMonth: row.targetYearMonth,
            items: Array.isArray(items) ? items : [],
            currentStep: row.currentStep || 'assign_date',
            lastSavedAt: row.lastSavedAt,
            savedByUserId: row.savedByUserId,
            savedByUserName: row.savedByUserName,
            storage: 'sql'
          });
        }
      }
    } catch (sqlErr) {
      console.warn('[SQL] Draft fetch notice, checking JSON file fallback:', sqlErr.message);
    }

    // 2. JSON ファイルから検索
    const drafts = loadInspectionDraftsFromFile();
    const draft = drafts.find(d => d.targetYearMonth === targetYearMonth);
    if (!draft) {
      return res.json({
        exists: false,
        targetYearMonth,
        items: [],
        lastSavedAt: null,
        savedByUserId: null,
        savedByUserName: null,
        allAvailableMonths: drafts.map(d => d.targetYearMonth),
        storage: 'none'
      });
    }

    res.json({
      exists: true,
      targetYearMonth: draft.targetYearMonth,
      items: draft.items || [],
      lastSavedAt: draft.lastSavedAt,
      savedByUserId: draft.savedByUserId,
      savedByUserName: draft.savedByUserName,
      allAvailableMonths: drafts.map(d => d.targetYearMonth),
      storage: 'file'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 下書き自動保存・一時保存
router.post(['/inspection/drafts', '/inspection/drafts/:targetYearMonth', '/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], async (req, res) => {
  try {
    const targetYearMonth = normalizeYmParam(req.body?.targetYearMonth || req.params?.targetYearMonth || req.query?.targetYearMonth || req.headers['x-target-year-month']);
    const items = Array.isArray(req.body?.items) ? req.body.items : [];
    const currentStep = req.body?.currentStep || 'assign_date';
    const nowIso = req.body?.lastSavedAt || new Date().toISOString();
    const savedByUserId = req.body?.savedByUserId || null;
    const savedByUserName = req.body?.savedByUserName || null;
    const itemsJson = JSON.stringify(items);

    let savedToSql = false;

    // 1. SQL Server 保存
    try {
      const pool = await getPool();
      if (pool) {
        await ensureInspectionDraftsTable(pool);
        await pool.request()
          .input('targetYearMonth', sql.NVarChar(100), String(targetYearMonth))
          .input('itemsJson', sql.NVarChar(sql.MAX), itemsJson)
          .input('currentStep', sql.VarChar, currentStep)
          .input('savedByUserId', sql.VarChar, savedByUserId)
          .input('savedByUserName', sql.NVarChar, savedByUserName)
          .input('updatedBy', sql.NVarChar, savedByUserName || 'system')
          .query(`
            IF EXISTS (SELECT 1 FROM dbo.InspectionDrafts WHERE targetYearMonth = @targetYearMonth)
            BEGIN
              UPDATE dbo.InspectionDrafts
              SET itemsJson = @itemsJson, currentStep = @currentStep, lastSavedAt = GETDATE(),
                  savedByUserId = @savedByUserId, savedByUserName = @savedByUserName, updatedBy = @updatedBy
              WHERE targetYearMonth = @targetYearMonth
            END
            ELSE
            BEGIN
              INSERT INTO dbo.InspectionDrafts (targetYearMonth, itemsJson, currentStep, lastSavedAt, savedByUserId, savedByUserName, updatedBy)
              VALUES (@targetYearMonth, @itemsJson, @currentStep, GETDATE(), @savedByUserId, @savedByUserName, @updatedBy)
            END
          `);
        savedToSql = true;
      }
    } catch (sqlErr) {
      console.warn('[SQL] Draft save error:', sqlErr.message);
    }

    // 2. ファイル保存
    try {
      const drafts = loadInspectionDraftsFromFile();
      const existingIndex = drafts.findIndex(d => d.targetYearMonth === targetYearMonth);
      const newDraft = {
        targetYearMonth,
        items,
        currentStep,
        lastSavedAt: nowIso,
        savedByUserId,
        savedByUserName
      };
      if (existingIndex >= 0) {
        drafts[existingIndex] = newDraft;
      } else {
        drafts.push(newDraft);
      }
      saveInspectionDraftsToFile(drafts);
    } catch (_) {}

    res.json({
      success: true,
      targetYearMonth,
      itemCount: items.length,
      lastSavedAt: nowIso,
      savedByUserName,
      storage: savedToSql ? 'sql' : 'file'
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 下書きクリア
router.delete(['/inspection/drafts', '/inspection/drafts/:targetYearMonth', '/api/inspection/drafts', '/api/inspection/drafts/:targetYearMonth'], async (req, res) => {
  try {
    const targetYearMonth = normalizeYmParam(req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || req.body?.targetYearMonth);
    if (!targetYearMonth) {
      return res.json({ success: true, message: '対象年月なし' });
    }

    try {
      const pool = await getPool();
      if (pool) {
        await ensureInspectionDraftsTable(pool);
        await pool.request()
          .input('targetYearMonth', sql.NVarChar(100), String(targetYearMonth))
          .query('DELETE FROM dbo.InspectionDrafts WHERE targetYearMonth = @targetYearMonth');
      }
    } catch (_) {}

    try {
      let drafts = loadInspectionDraftsFromFile();
      drafts = drafts.filter(d => d.targetYearMonth !== targetYearMonth);
      saveInspectionDraftsToFile(drafts);
    } catch (_) {}

    res.json({ success: true, message: `${targetYearMonth} の下書きをクリアしました。` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 翌月繰越 (carried_over) 自動取得 API
router.get(['/inspection/carry-overs', '/inspection/carry-overs/:targetYearMonth', '/api/inspection/carry-overs', '/api/inspection/carry-overs/:targetYearMonth'], async (req, res) => {
  try {
    const targetYearMonth = normalizeYmParam(req.params.targetYearMonth || req.query.targetYearMonth || req.headers['x-target-year-month'] || (req.body && req.body.targetYearMonth));
    const prevMonth = getPreviousYearMonth(targetYearMonth);
    if (!prevMonth) {
      return res.json({ currentMonth: targetYearMonth, prevMonth: '', carriedOverCount: 0, carriedOverItems: [] });
    }

    let prevItems = null;

    try {
      const pool = await getPool();
      if (pool) {
        await ensureInspectionDraftsTable(pool);
        const sqlRes = await pool.request()
          .input('targetYearMonth', sql.NVarChar(100), String(prevMonth))
          .query('SELECT itemsJson FROM dbo.InspectionDrafts WHERE targetYearMonth = @targetYearMonth');
        if (sqlRes.recordset && sqlRes.recordset.length > 0) {
          try { prevItems = JSON.parse(sqlRes.recordset[0].itemsJson); } catch (_) { prevItems = null; }
        }
      }
    } catch (_) {}

    if (!prevItems) {
      const drafts = loadInspectionDraftsFromFile();
      const prevDraft = drafts.find(d => d.targetYearMonth === prevMonth);
      if (prevDraft && Array.isArray(prevDraft.items)) {
        prevItems = prevDraft.items;
      }
    }

    if (!Array.isArray(prevItems)) {
      return res.json({ currentMonth: targetYearMonth, prevMonth, carriedOverCount: 0, carriedOverItems: [] });
    }

    const carriedOverItems = prevItems.filter(item => item.status === 'carried_over');
    res.json({
      currentMonth: targetYearMonth,
      prevMonth,
      carriedOverCount: carriedOverItems.length,
      carriedOverItems: carriedOverItems.map(item => ({
        ...item,
        status: 'pending',
        targetYearMonth,
        carriedOverFrom: prevMonth,
        assignedDate: undefined,
        assignedStartTime: undefined,
        assignedEndTime: undefined
      }))
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
