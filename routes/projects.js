/**
 * routes/projects.js
 * 寺岡オートドアSNS プロジェクト・Todo・資料メモボード APIモジュール
 * （事務・営業・設計向け チーム＆個人ボード / カンバン / リスト / URL・資料・チェックリスト / コメント / 複製 / マイタスク横断集計）
 * 最終更新: 2026年11月17日 (初回完全版・全API一括実装)
 */
import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { dataDir, safeParseJSON } from '../config.js';

const router = Router();

const boardsFilePath = path.join(dataDir, 'project_boards.json');
const cardsFilePath = path.join(dataDir, 'project_cards.json');

// ---------------------------------------------------------------------------
// JST (日本標準時 / UTC+9) ヘルパー
// ---------------------------------------------------------------------------
function getJstNowIso() {
  const now = new Date();
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().replace('Z', '+09:00');
}

function getJstTodayStr() {
  return getJstNowIso().slice(0, 10);
}

function normalizeDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const jstMs = val.getTime() + 9 * 60 * 60 * 1000;
    return new Date(jstMs).toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  const m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  return str.slice(0, 10);
}

function generateId(prefix = 'id') {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// ---------------------------------------------------------------------------
// デフォルト列定義 (メモ・資料列 ＋ Todo進捗列 ＋ 完了列)
// ---------------------------------------------------------------------------
export const DEFAULT_PROJECT_COLUMNS = [
  { id: 'col-memo', title: '📌 資料・メモ', kind: 'memo', color: 'amber', sortOrder: 1 },
  { id: 'col-todo', title: '未着手', kind: 'todo', color: 'slate', sortOrder: 2 },
  { id: 'col-doing', title: '進行中', kind: 'todo', color: 'indigo', sortOrder: 3 },
  { id: 'col-review', title: '確認待ち', kind: 'todo', color: 'sky', sortOrder: 4 },
  { id: 'col-done', title: '完了', kind: 'done', color: 'emerald', sortOrder: 5 },
];

export const DEFAULT_PERSONAL_COLUMNS = [
  { id: 'col-memo', title: '📌 個人メモ・URL', kind: 'memo', color: 'amber', sortOrder: 1 },
  { id: 'col-todo', title: 'やること', kind: 'todo', color: 'slate', sortOrder: 2 },
  { id: 'col-doing', title: '対応中', kind: 'todo', color: 'indigo', sortOrder: 3 },
  { id: 'col-done', title: '完了', kind: 'done', color: 'emerald', sortOrder: 4 },
];

// ---------------------------------------------------------------------------
// Local JSON ファイル読み書きヘルパー
// ---------------------------------------------------------------------------
function loadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`[Projects] Failed to read JSON file (${filePath}):`, e);
    return [];
  }
}

function saveJsonArray(filePath, data) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[Projects] Failed to save JSON file (${filePath}):`, e);
  }
}

function upsertJsonItem(filePath, item) {
  const list = loadJsonArray(filePath);
  const idx = list.findIndex(x => String(x.id) === String(item.id));
  if (idx >= 0) {
    list[idx] = { ...list[idx], ...item };
  } else {
    list.push(item);
  }
  saveJsonArray(filePath, list);
  return list;
}

// ---------------------------------------------------------------------------
// SQL Server スキーマ自動初期化・検証
// ---------------------------------------------------------------------------
let tablesEnsured = false;
let ensurePromise = null;

async function ensureProjectTables(pool) {
  if (!pool || tablesEnsured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      await pool.request().query(`
        IF OBJECT_ID('dbo.ProjectBoards', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.ProjectBoards (
            id NVARCHAR(100) NOT NULL PRIMARY KEY,
            title NVARCHAR(300) NOT NULL,
            description NVARCHAR(MAX) NULL,
            boardType NVARCHAR(50) NOT NULL DEFAULT 'team',
            visibility NVARCHAR(50) NOT NULL DEFAULT 'members',
            ownerId NVARCHAR(100) NOT NULL,
            ownerName NVARCHAR(200) NULL,
            officeId NVARCHAR(100) NULL,
            office NVARCHAR(200) NULL,
            divisionId NVARCHAR(100) NULL,
            division NVARCHAR(200) NULL,
            memberIdsJson NVARCHAR(MAX) NULL,
            columnsJson NVARCHAR(MAX) NULL,
            color NVARCHAR(50) NULL,
            isPinned BIT NOT NULL DEFAULT 0,
            isArchived BIT NOT NULL DEFAULT 0,
            sortOrder INT NOT NULL DEFAULT 0,
            createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
            updatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
          );
          CREATE INDEX IX_ProjectBoards_OwnerId ON dbo.ProjectBoards(ownerId);
        END;

        IF OBJECT_ID('dbo.ProjectCards', 'U') IS NULL
        BEGIN
          CREATE TABLE dbo.ProjectCards (
            id NVARCHAR(100) NOT NULL PRIMARY KEY,
            projectId NVARCHAR(100) NOT NULL,
            columnId NVARCHAR(100) NOT NULL,
            cardType NVARCHAR(30) NOT NULL DEFAULT 'task',
            title NVARCHAR(500) NOT NULL,
            description NVARCHAR(MAX) NULL,
            priority NVARCHAR(30) NOT NULL DEFAULT 'none',
            assigneeIdsJson NVARCHAR(MAX) NULL,
            dueDate NVARCHAR(30) NULL,
            startDate NVARCHAR(30) NULL,
            tagsJson NVARCHAR(MAX) NULL,
            linksJson NVARCHAR(MAX) NULL,
            attachmentsJson NVARCHAR(MAX) NULL,
            checklistJson NVARCHAR(MAX) NULL,
            commentsJson NVARCHAR(MAX) NULL,
            isCompleted BIT NOT NULL DEFAULT 0,
            completedAt NVARCHAR(50) NULL,
            completedBy NVARCHAR(100) NULL,
            isPinned BIT NOT NULL DEFAULT 0,
            isArchived BIT NOT NULL DEFAULT 0,
            sortOrder INT NOT NULL DEFAULT 0,
            createdBy NVARCHAR(100) NULL,
            createdByName NVARCHAR(200) NULL,
            updatedBy NVARCHAR(100) NULL,
            createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
            updatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
          );
          CREATE INDEX IX_ProjectCards_ProjectId ON dbo.ProjectCards(projectId);
          CREATE INDEX IX_ProjectCards_ColumnId ON dbo.ProjectCards(columnId);
        END;
      `);
      tablesEnsured = true;
    } catch (err) {
      console.warn('[Projects] ensureProjectTables warning:', err.message);
    } finally {
      ensurePromise = null;
    }
  })();
  return ensurePromise;
}

// ---------------------------------------------------------------------------
// モデル正規化＆行マッパー
// ---------------------------------------------------------------------------
function normalizeColumns(rawColumns, boardType = 'team') {
  const parsed = Array.isArray(rawColumns)
    ? rawColumns
    : safeParseJSON(rawColumns, null);
  const fallback = boardType === 'personal' ? DEFAULT_PERSONAL_COLUMNS : DEFAULT_PROJECT_COLUMNS;
  if (!Array.isArray(parsed) || parsed.length === 0) {
    return fallback.map(c => ({ ...c }));
  }
  return parsed
    .filter(c => c && typeof c === 'object' && (c.id || c.title))
    .map((c, idx) => ({
      id: String(c.id || `col-${idx + 1}`),
      title: String(c.title || '無題').trim(),
      kind: c.kind === 'memo' || c.kind === 'done' ? c.kind : 'todo',
      color: c.color || 'slate',
      sortOrder: typeof c.sortOrder === 'number' ? c.sortOrder : idx + 1,
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

function mapBoardRow(row) {
  const memberIdsRaw = safeParseJSON(row.memberIdsJson || row.memberIds, []);
  const boardType = row.boardType === 'personal' ? 'personal' : 'team';
  const columns = normalizeColumns(row.columnsJson || row.columns, boardType);
  return {
    id: String(row.id),
    title: String(row.title || '無題のボード'),
    description: row.description ? String(row.description) : '',
    boardType,
    visibility: row.visibility || (boardType === 'personal' ? 'private' : 'members'),
    ownerId: String(row.ownerId || ''),
    ownerName: row.ownerName ? String(row.ownerName) : '',
    officeId: row.officeId ? String(row.officeId) : undefined,
    office: row.office ? String(row.office) : undefined,
    divisionId: row.divisionId ? String(row.divisionId) : undefined,
    division: row.division ? String(row.division) : undefined,
    memberIds: Array.isArray(memberIdsRaw) ? memberIdsRaw.map(String) : [],
    columns,
    color: row.color || (boardType === 'personal' ? 'amber' : 'indigo'),
    isPinned: Boolean(row.isPinned),
    isArchived: Boolean(row.isArchived),
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : parseInt(row.sortOrder || '0', 10),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : getJstNowIso(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : getJstNowIso(),
  };
}

function mapCardRow(row) {
  const assigneeIdsRaw = safeParseJSON(row.assigneeIdsJson || row.assigneeIds, []);
  const tagsRaw = safeParseJSON(row.tagsJson || row.tags, []);
  const linksRaw = safeParseJSON(row.linksJson || row.links, []);
  const attachmentsRaw = safeParseJSON(row.attachmentsJson || row.attachments, []);
  const checklistRaw = safeParseJSON(row.checklistJson || row.checklist, []);
  const commentsRaw = safeParseJSON(row.commentsJson || row.comments, []);

  return {
    id: String(row.id),
    projectId: String(row.projectId || ''),
    columnId: String(row.columnId || 'col-todo'),
    cardType: row.cardType === 'memo' ? 'memo' : 'task',
    title: String(row.title || '無題のカード'),
    description: row.description ? String(row.description) : '',
    priority: ['high', 'medium', 'low', 'none'].includes(row.priority) ? row.priority : 'none',
    assigneeIds: Array.isArray(assigneeIdsRaw) ? assigneeIdsRaw.map(String) : [],
    dueDate: row.dueDate ? normalizeDateStr(row.dueDate) : undefined,
    startDate: row.startDate ? normalizeDateStr(row.startDate) : undefined,
    tags: Array.isArray(tagsRaw) ? tagsRaw.map(String).filter(Boolean) : [],
    links: Array.isArray(linksRaw) ? linksRaw : [],
    attachments: Array.isArray(attachmentsRaw) ? attachmentsRaw : [],
    checklist: Array.isArray(checklistRaw) ? checklistRaw : [],
    comments: Array.isArray(commentsRaw) ? commentsRaw : [],
    isCompleted: Boolean(row.isCompleted),
    completedAt: row.completedAt ? String(row.completedAt) : undefined,
    completedBy: row.completedBy ? String(row.completedBy) : undefined,
    isPinned: Boolean(row.isPinned),
    isArchived: Boolean(row.isArchived),
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : parseInt(row.sortOrder || '0', 10),
    createdBy: row.createdBy ? String(row.createdBy) : undefined,
    createdByName: row.createdByName ? String(row.createdByName) : undefined,
    updatedBy: row.updatedBy ? String(row.updatedBy) : undefined,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : getJstNowIso(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : getJstNowIso(),
  };
}

// ---------------------------------------------------------------------------
// データ取得・保存（SQL Server Primary + Local JSON Fallback）
// ---------------------------------------------------------------------------
async function readAllBoards() {
  const pool = await getPool().catch(() => null);
  if (pool) {
    try {
      await ensureProjectTables(pool);
      const result = await pool.request().query(`
        SELECT * FROM dbo.ProjectBoards
        ORDER BY isPinned DESC, sortOrder ASC, updatedAt DESC
      `);
      const rows = (result.recordset || []).map(mapBoardRow);
      if (rows.length > 0) {
        saveJsonArray(boardsFilePath, rows);
        return rows;
      }
      const localRows = loadJsonArray(boardsFilePath);
      if (localRows.length > 0) {
        return localRows.map(mapBoardRow);
      }
      return [];
    } catch (err) {
      console.warn('[Projects] SQL readAllBoards fallback:', err.message);
    }
  }
  return loadJsonArray(boardsFilePath).map(mapBoardRow);
}

async function readAllCards(projectId = null) {
  const pool = await getPool().catch(() => null);
  if (pool) {
    try {
      await ensureProjectTables(pool);
      const req = pool.request();
      let queryStr = `SELECT * FROM dbo.ProjectCards`;
      if (projectId) {
        req.input('projectId', sql.NVarChar(100), String(projectId));
        queryStr += ` WHERE projectId = @projectId`;
      }
      queryStr += ` ORDER BY isPinned DESC, sortOrder ASC, updatedAt DESC`;
      const result = await req.query(queryStr);
      const rows = (result.recordset || []).map(mapCardRow);

      if (!projectId) {
        if (rows.length > 0) {
          saveJsonArray(cardsFilePath, rows);
          return rows;
        }
        const localRows = loadJsonArray(cardsFilePath);
        if (localRows.length > 0) return localRows.map(mapCardRow);
      }
      if (rows.length > 0) return rows;
      const localFiltered = loadJsonArray(cardsFilePath).map(mapCardRow);
      return projectId ? localFiltered.filter(c => String(c.projectId) === String(projectId)) : localFiltered;
    } catch (err) {
      console.warn('[Projects] SQL readAllCards fallback:', err.message);
    }
  }
  const local = loadJsonArray(cardsFilePath).map(mapCardRow);
  return projectId ? local.filter(c => String(c.projectId) === String(projectId)) : local;
}

async function persistBoard(board) {
  const normalized = mapBoardRow(board);
  upsertJsonItem(boardsFilePath, normalized);

  const pool = await getPool().catch(() => null);
  if (pool) {
    try {
      await ensureProjectTables(pool);
      const req = pool.request();
      req.input('id', sql.NVarChar(100), normalized.id);
      req.input('title', sql.NVarChar(300), normalized.title);
      req.input('description', sql.NVarChar(sql.MAX), normalized.description || '');
      req.input('boardType', sql.NVarChar(50), normalized.boardType);
      req.input('visibility', sql.NVarChar(50), normalized.visibility);
      req.input('ownerId', sql.NVarChar(100), normalized.ownerId);
      req.input('ownerName', sql.NVarChar(200), normalized.ownerName || '');
      req.input('officeId', sql.NVarChar(100), normalized.officeId || null);
      req.input('office', sql.NVarChar(200), normalized.office || null);
      req.input('divisionId', sql.NVarChar(100), normalized.divisionId || null);
      req.input('division', sql.NVarChar(200), normalized.division || null);
      req.input('memberIdsJson', sql.NVarChar(sql.MAX), JSON.stringify(normalized.memberIds || []));
      req.input('columnsJson', sql.NVarChar(sql.MAX), JSON.stringify(normalized.columns || []));
      req.input('color', sql.NVarChar(50), normalized.color || 'indigo');
      req.input('isPinned', sql.Bit, normalized.isPinned ? 1 : 0);
      req.input('isArchived', sql.Bit, normalized.isArchived ? 1 : 0);
      req.input('sortOrder', sql.Int, normalized.sortOrder || 0);

      await req.query(`
        IF EXISTS (SELECT 1 FROM dbo.ProjectBoards WHERE id = @id)
        BEGIN
          UPDATE dbo.ProjectBoards SET
            title = @title,
            description = @description,
            boardType = @boardType,
            visibility = @visibility,
            ownerId = @ownerId,
            ownerName = @ownerName,
            officeId = @officeId,
            office = @office,
            divisionId = @divisionId,
            division = @division,
            memberIdsJson = @memberIdsJson,
            columnsJson = @columnsJson,
            color = @color,
            isPinned = @isPinned,
            isArchived = @isArchived,
            sortOrder = @sortOrder,
            updatedAt = SYSDATETIME()
          WHERE id = @id;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.ProjectBoards (
            id, title, description, boardType, visibility, ownerId, ownerName,
            officeId, office, divisionId, division, memberIdsJson, columnsJson,
            color, isPinned, isArchived, sortOrder, createdAt, updatedAt
          ) VALUES (
            @id, @title, @description, @boardType, @visibility, @ownerId, @ownerName,
            @officeId, @office, @divisionId, @division, @memberIdsJson, @columnsJson,
            @color, @isPinned, @isArchived, @sortOrder, SYSDATETIME(), SYSDATETIME()
          );
        END
      `);
    } catch (err) {
      console.warn('[Projects] SQL persistBoard warning:', err.message);
    }
  }
  return normalized;
}

async function persistCard(card) {
  const normalized = mapCardRow(card);
  upsertJsonItem(cardsFilePath, normalized);

  const pool = await getPool().catch(() => null);
  if (pool) {
    try {
      await ensureProjectTables(pool);
      const req = pool.request();
      req.input('id', sql.NVarChar(100), normalized.id);
      req.input('projectId', sql.NVarChar(100), normalized.projectId);
      req.input('columnId', sql.NVarChar(100), normalized.columnId);
      req.input('cardType', sql.NVarChar(30), normalized.cardType);
      req.input('title', sql.NVarChar(500), normalized.title);
      req.input('description', sql.NVarChar(sql.MAX), normalized.description || '');
      req.input('priority', sql.NVarChar(30), normalized.priority);
      req.input('assigneeIdsJson', sql.NVarChar(sql.MAX), JSON.stringify(normalized.assigneeIds || []));
      req.input('dueDate', sql.NVarChar(30), normalized.dueDate || null);
      req.input('startDate', sql.NVarChar(30), normalized.startDate || null);
      req.input('tagsJson', sql.NVarChar(sql.MAX), JSON.stringify(normalized.tags || []));
      req.input('linksJson', sql.NVarChar(sql.MAX), JSON.stringify(normalized.links || []));
      req.input('attachmentsJson', sql.NVarChar(sql.MAX), JSON.stringify(normalized.attachments || []));
      req.input('checklistJson', sql.NVarChar(sql.MAX), JSON.stringify(normalized.checklist || []));
      req.input('commentsJson', sql.NVarChar(sql.MAX), JSON.stringify(normalized.comments || []));
      req.input('isCompleted', sql.Bit, normalized.isCompleted ? 1 : 0);
      req.input('completedAt', sql.NVarChar(50), normalized.completedAt || null);
      req.input('completedBy', sql.NVarChar(100), normalized.completedBy || null);
      req.input('isPinned', sql.Bit, normalized.isPinned ? 1 : 0);
      req.input('isArchived', sql.Bit, normalized.isArchived ? 1 : 0);
      req.input('sortOrder', sql.Int, normalized.sortOrder || 0);
      req.input('createdBy', sql.NVarChar(100), normalized.createdBy || null);
      req.input('createdByName', sql.NVarChar(200), normalized.createdByName || null);
      req.input('updatedBy', sql.NVarChar(100), normalized.updatedBy || null);

      await req.query(`
        IF EXISTS (SELECT 1 FROM dbo.ProjectCards WHERE id = @id)
        BEGIN
          UPDATE dbo.ProjectCards SET
            projectId = @projectId,
            columnId = @columnId,
            cardType = @cardType,
            title = @title,
            description = @description,
            priority = @priority,
            assigneeIdsJson = @assigneeIdsJson,
            dueDate = @dueDate,
            startDate = @startDate,
            tagsJson = @tagsJson,
            linksJson = @linksJson,
            attachmentsJson = @attachmentsJson,
            checklistJson = @checklistJson,
            commentsJson = @commentsJson,
            isCompleted = @isCompleted,
            completedAt = @completedAt,
            completedBy = @completedBy,
            isPinned = @isPinned,
            isArchived = @isArchived,
            sortOrder = @sortOrder,
            updatedBy = @updatedBy,
            updatedAt = SYSDATETIME()
          WHERE id = @id;
        END
        ELSE
        BEGIN
          INSERT INTO dbo.ProjectCards (
            id, projectId, columnId, cardType, title, description, priority,
            assigneeIdsJson, dueDate, startDate, tagsJson, linksJson, attachmentsJson,
            checklistJson, commentsJson, isCompleted, completedAt, completedBy,
            isPinned, isArchived, sortOrder, createdBy, createdByName, updatedBy,
            createdAt, updatedAt
          ) VALUES (
            @id, @projectId, @columnId, @cardType, @title, @description, @priority,
            @assigneeIdsJson, @dueDate, @startDate, @tagsJson, @linksJson, @attachmentsJson,
            @checklistJson, @commentsJson, @isCompleted, @completedAt, @completedBy,
            @isPinned, @isArchived, @sortOrder, @createdBy, @createdByName, @updatedBy,
            SYSDATETIME(), SYSDATETIME()
          );
        END
      `);
    } catch (err) {
      console.warn('[Projects] SQL persistCard warning:', err.message);
    }
  }
  return normalized;
}

// ---------------------------------------------------------------------------
// 閲覧権限・表記ゆれ吸収ヘルパー
// ---------------------------------------------------------------------------
function normalizeOrgLabel(s) {
  return String(s || '')
    .replace(/[\s　]+/g, '')
    .replace(/(営業所|支店|出張所|事務所|本社|事業部|部|課|グループ|G)$/g, '')
    .trim()
    .toLowerCase();
}

function canAccessBoard(board, ctx = {}) {
  if (!board) return false;
  const userId = ctx.userId ? String(ctx.userId) : '';
  const isAdmin = Boolean(ctx.isAdmin);
  if (board.boardType === 'personal' || board.visibility === 'private') {
    if (!userId) return false;
    return String(board.ownerId) === userId;
  }
  if (!userId) return board.visibility === 'org';
  if (String(board.ownerId) === userId) return true;
  if (Array.isArray(board.memberIds) && board.memberIds.map(String).includes(userId)) return true;
  if (isAdmin) return true;

  if (board.visibility === 'org') return true;
  if (board.visibility === 'office') {
    if (board.officeId && ctx.officeId && String(board.officeId) === String(ctx.officeId)) return true;
    if (board.office && ctx.office) {
      if (board.office === ctx.office || normalizeOrgLabel(board.office) === normalizeOrgLabel(ctx.office)) return true;
    }
    return false;
  }
  if (board.visibility === 'division') {
    const divMatch =
      (board.divisionId && ctx.divisionId && String(board.divisionId) === String(ctx.divisionId)) ||
      (board.division && ctx.division && (board.division === ctx.division || normalizeOrgLabel(board.division) === normalizeOrgLabel(ctx.division)));
    if (!divMatch) return false;
    if (board.officeId || board.office) {
      const offMatch =
        (board.officeId && ctx.officeId && String(board.officeId) === String(ctx.officeId)) ||
        (board.office && ctx.office && (board.office === ctx.office || normalizeOrgLabel(board.office) === normalizeOrgLabel(ctx.office)));
      return Boolean(offMatch);
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// 1. ボード一覧取得 (個人のマイボード自動生成＋カウント集計)
//    GET /api/projects, GET /api/projects/boards
// ---------------------------------------------------------------------------
async function handleGetBoards(req, res) {
  try {
    const userId = req.query.userId ? String(req.query.userId) : '';
    const userName = req.query.userName ? String(req.query.userName) : '';
    const officeId = req.query.officeId ? String(req.query.officeId) : '';
    const office = req.query.office ? String(req.query.office) : '';
    const divisionId = req.query.divisionId ? String(req.query.divisionId) : '';
    const division = req.query.division ? String(req.query.division) : '';
    const isAdmin = req.query.isAdmin === 'true' || req.query.isAdmin === '1';
    const includeArchived = req.query.includeArchived === 'true' || req.query.includeArchived === '1';
    const includeCards = req.query.includeCards === 'true' || req.query.includeCards === '1';
    const ensurePersonal = req.query.ensurePersonal !== 'false' && req.query.ensurePersonal !== '0';

    let allBoards = await readAllBoards();

    // ログインユーザーの「マイボード（個人専用）」が無ければ自動作成
    if (userId && ensurePersonal) {
      const hasPersonal = allBoards.some(
        b => b.boardType === 'personal' && String(b.ownerId) === userId && !b.isArchived
      );
      if (!hasPersonal) {
        const personalBoard = await persistBoard({
          id: `personal-${userId}`,
          title: 'マイボード（個人メモ・Todo）',
          description: '自分専用の非公開ボードです。メモ・URLクリップ・個人Todoとして使えます。',
          boardType: 'personal',
          visibility: 'private',
          ownerId: userId,
          ownerName: userName || '自分',
          memberIds: [userId],
          columns: DEFAULT_PERSONAL_COLUMNS,
          color: 'amber',
          isPinned: true,
          isArchived: false,
          sortOrder: 0,
        });
        allBoards = [personalBoard, ...allBoards];
      }
    }

    const ctx = { userId, officeId, office, divisionId, division, isAdmin };
    let accessible = allBoards.filter(b => canAccessBoard(b, ctx));
    if (!includeArchived) {
      accessible = accessible.filter(b => !b.isArchived);
    }

    // 個人ボードを先頭にしつつピン留め・ソート順で整列
    accessible.sort((a, b) => {
      if (a.boardType !== b.boardType) {
        return a.boardType === 'personal' ? -1 : 1;
      }
      if (a.isPinned !== b.isPinned) {
        return a.isPinned ? -1 : 1;
      }
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });

    const allCards = await readAllCards();
    const accessibleIds = new Set(accessible.map(b => b.id));
    const cardsCountByBoard = {};

    for (const card of allCards) {
      if (!accessibleIds.has(card.projectId) || card.isArchived) continue;
      if (!cardsCountByBoard[card.projectId]) {
        cardsCountByBoard[card.projectId] = { total: 0, activeTasks: 0, completedTasks: 0, memos: 0 };
      }
      const stats = cardsCountByBoard[card.projectId];
      stats.total += 1;
      if (card.cardType === 'memo') {
        stats.memos += 1;
      } else if (card.isCompleted) {
        stats.completedTasks += 1;
      } else {
        stats.activeTasks += 1;
      }
    }

    const responsePayload = {
      boards: accessible,
      cardsCountByBoard,
    };
    if (includeCards) {
      responsePayload.cards = allCards.filter(
        c => accessibleIds.has(c.projectId) && (includeArchived || !c.isArchived)
      );
    }

    return res.json(responsePayload);
  } catch (err) {
    console.error('[Projects] GET boards error:', err);
    return res.status(500).json({ error: 'プロジェクトボードの取得に失敗しました', detail: err.message });
  }
}

router.get(['/', '/boards'], handleGetBoards);

// ---------------------------------------------------------------------------
// 2. ボード作成
//    POST /api/projects, POST /api/projects/boards
// ---------------------------------------------------------------------------
async function handleCreateBoard(req, res) {
  try {
    const body = req.body || {};
    const title = String(body.title || '').trim();
    if (!title) {
      return res.status(400).json({ error: 'ボード名は必須です' });
    }
    const boardType = body.boardType === 'personal' ? 'personal' : 'team';
    const ownerId = String(body.ownerId || body.createdBy || '');
    if (!ownerId) {
      return res.status(400).json({ error: '作成者ID (ownerId) が必要です' });
    }

    const visibility =
      boardType === 'personal'
        ? 'private'
        : ['private', 'members', 'office', 'division', 'org'].includes(body.visibility)
        ? body.visibility
        : 'members';

    const memberSet = new Set(Array.isArray(body.memberIds) ? body.memberIds.map(String) : []);
    memberSet.add(ownerId);

    const existingBoards = await readAllBoards();
    const maxOrder = existingBoards.reduce((acc, b) => Math.max(acc, b.sortOrder || 0), 0);

    const board = await persistBoard({
      id: body.id || generateId('proj'),
      title,
      description: body.description || '',
      boardType,
      visibility,
      ownerId,
      ownerName: body.ownerName || '',
      officeId: body.officeId || undefined,
      office: body.office || undefined,
      divisionId: body.divisionId || undefined,
      division: body.division || undefined,
      memberIds: Array.from(memberSet),
      columns: normalizeColumns(body.columns, boardType),
      color: body.color || (boardType === 'personal' ? 'amber' : 'indigo'),
      isPinned: Boolean(body.isPinned),
      isArchived: false,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : maxOrder + 1,
    });

    return res.status(201).json({ board });
  } catch (err) {
    console.error('[Projects] POST board error:', err);
    return res.status(500).json({ error: 'ボードの作成に失敗しました', detail: err.message });
  }
}

router.post(['/', '/boards'], handleCreateBoard);

// ---------------------------------------------------------------------------
// 3. マイタスク横断サマリー（自分の担当・期限アラート取得）
//    GET /api/projects/my-summary
// ---------------------------------------------------------------------------
router.get('/my-summary', async (req, res) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : '';
    if (!userId) {
      return res.status(400).json({ error: 'userId は必須です' });
    }
    const officeId = req.query.officeId ? String(req.query.officeId) : '';
    const office = req.query.office ? String(req.query.office) : '';
    const divisionId = req.query.divisionId ? String(req.query.divisionId) : '';
    const division = req.query.division ? String(req.query.division) : '';
    const isAdmin = req.query.isAdmin === 'true' || req.query.isAdmin === '1';

    const boards = await readAllBoards();
    const accessibleBoards = boards.filter(
      b => !b.isArchived && canAccessBoard(b, { userId, officeId, office, divisionId, division, isAdmin })
    );
    const boardMap = new Map(accessibleBoards.map(b => [b.id, b]));

    const allCards = await readAllCards();
    const todayStr = getJstTodayStr();
    const soonDate = new Date(`${todayStr}T00:00:00+09:00`);
    soonDate.setDate(soonDate.getDate() + 3);
    const soonStr = normalizeDateStr(soonDate);

    const myTasks = allCards.filter(c => {
      if (c.isArchived || !boardMap.has(c.projectId)) return false;
      if (c.cardType === 'memo') return false;
      const isAssigned = Array.isArray(c.assigneeIds) && c.assigneeIds.map(String).includes(userId);
      const isPersonalOwn = boardMap.get(c.projectId)?.boardType === 'personal' && String(c.createdBy || '') === userId && (!c.assigneeIds || c.assigneeIds.length === 0);
      return (isAssigned || isPersonalOwn) && !c.isCompleted;
    });

    const overdueTasks = myTasks.filter(c => c.dueDate && c.dueDate < todayStr);
    const dueSoonTasks = myTasks.filter(c => c.dueDate && c.dueDate >= todayStr && c.dueDate <= soonStr);

    const priorityRank = { high: 0, medium: 1, low: 2, none: 3 };
    const sorted = [...myTasks].sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate < b.dueDate ? -1 : 1;
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return (priorityRank[a.priority] ?? 3) - (priorityRank[b.priority] ?? 3);
    });

    return res.json({
      myPendingCount: myTasks.length,
      overdueCount: overdueTasks.length,
      dueSoonCount: dueSoonTasks.length,
      tasks: sorted.slice(0, 50).map(t => ({
        ...t,
        projectTitle: boardMap.get(t.projectId)?.title || '',
      })),
    });
  } catch (err) {
    console.error('[Projects] GET my-summary error:', err);
    return res.status(500).json({ error: 'マイタスク集計の取得に失敗しました', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// 4. カード一覧取得 (ボード指定 または 横断検索・マイタスク取得)
//    GET /api/projects/cards, GET /api/projects/items, GET /api/projects/boards/:projectId/cards
// ---------------------------------------------------------------------------
async function handleGetCards(req, res) {
  try {
    const projectId = req.params.projectId || req.query.projectId ? String(req.params.projectId || req.query.projectId) : '';
    const userId = req.query.userId ? String(req.query.userId) : '';
    const officeId = req.query.officeId ? String(req.query.officeId) : '';
    const office = req.query.office ? String(req.query.office) : '';
    const divisionId = req.query.divisionId ? String(req.query.divisionId) : '';
    const division = req.query.division ? String(req.query.division) : '';
    const isAdmin = req.query.isAdmin === 'true' || req.query.isAdmin === '1';
    const includeArchived = req.query.includeArchived === 'true' || req.query.includeArchived === '1';
    const includeCompleted = req.query.includeCompleted !== 'false' && req.query.includeCompleted !== '0';
    const myTasksOnly = req.query.myTasksOnly === 'true' || req.query.myTasksOnly === '1';
    const cardType = req.query.cardType ? String(req.query.cardType) : '';
    const q = req.query.q ? String(req.query.q).trim().toLowerCase() : '';

    const boards = await readAllBoards();
    const accessibleBoards = boards.filter(b =>
      canAccessBoard(b, { userId, officeId, office, divisionId, division, isAdmin })
    );
    const accessibleIds = new Set(accessibleBoards.map(b => b.id));

    if (projectId && userId && !accessibleIds.has(projectId)) {
      return res.status(403).json({ error: 'このボードを閲覧する権限がありません' });
    }

    let cards = await readAllCards(projectId || null);
    if (!projectId) {
      cards = cards.filter(c => accessibleIds.has(c.projectId));
    }
    if (!includeArchived) {
      cards = cards.filter(c => !c.isArchived);
    }
    if (!includeCompleted) {
      cards = cards.filter(c => !c.isCompleted);
    }
    if (cardType === 'task' || cardType === 'memo') {
      cards = cards.filter(c => c.cardType === cardType);
    }
    if (myTasksOnly && userId) {
      cards = cards.filter(
        c => Array.isArray(c.assigneeIds) && c.assigneeIds.map(String).includes(userId)
      );
    }
    if (q) {
      cards = cards.filter(c => {
        const hay = [
          c.title,
          c.description,
          ...(c.tags || []),
          ...(c.links || []).map(l => `${l.label || ''} ${l.url || ''} ${l.title || ''}`),
          ...(c.checklist || []).map(ch => ch.text || ''),
        ]
          .join(' ')
          .toLowerCase();
        return hay.includes(q);
      });
    }

    return res.json({ cards });
  } catch (err) {
    console.error('[Projects] GET cards error:', err);
    return res.status(500).json({ error: 'カードの取得に失敗しました', detail: err.message });
  }
}

router.get(['/cards', '/items', '/boards/:projectId/cards'], handleGetCards);

// ---------------------------------------------------------------------------
// 5. 単一ボード＋配下カード取得
//    GET /api/projects/boards/:id
// ---------------------------------------------------------------------------
router.get('/boards/:id', async (req, res) => {
  try {
    const boardId = String(req.params.id);
    const includeArchived = req.query.includeArchived === 'true' || req.query.includeArchived === '1';
    const boards = await readAllBoards();
    const board = boards.find(b => String(b.id) === boardId);
    if (!board) {
      return res.status(404).json({ error: 'ボードが見つかりません' });
    }
    const cards = (await readAllCards(boardId)).filter(c => includeArchived || !c.isArchived);
    return res.json({ board, cards });
  } catch (err) {
    console.error('[Projects] GET board detail error:', err);
    return res.status(500).json({ error: 'ボード詳細の取得に失敗しました', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// 6. ボード更新 (タイトル・列カスタマイズ・メンバー・アーカイブ・ピン)
//    PUT / PATCH /api/projects/boards/:id
// ---------------------------------------------------------------------------
async function handleUpdateBoard(req, res) {
  try {
    const boardId = String(req.params.id);
    const boards = await readAllBoards();
    const existing = boards.find(b => String(b.id) === boardId);
    if (!existing) {
      return res.status(404).json({ error: 'ボードが見つかりません' });
    }

    const body = req.body || {};
    const nextBoardType = body.boardType !== undefined
      ? (body.boardType === 'personal' ? 'personal' : 'team')
      : existing.boardType;

    const nextVisibility = nextBoardType === 'personal'
      ? 'private'
      : (body.visibility !== undefined ? body.visibility : existing.visibility);

    let nextMemberIds = existing.memberIds || [];
    if (Array.isArray(body.memberIds)) {
      const set = new Set(body.memberIds.map(String));
      if (existing.ownerId) set.add(String(existing.ownerId));
      nextMemberIds = Array.from(set);
    }

    const updated = await persistBoard({
      ...existing,
      title: body.title !== undefined ? (String(body.title).trim() || existing.title) : existing.title,
      description: body.description !== undefined ? String(body.description) : existing.description,
      boardType: nextBoardType,
      visibility: nextVisibility,
      officeId: body.officeId !== undefined ? body.officeId : existing.officeId,
      office: body.office !== undefined ? body.office : existing.office,
      divisionId: body.divisionId !== undefined ? body.divisionId : existing.divisionId,
      division: body.division !== undefined ? body.division : existing.division,
      memberIds: nextMemberIds,
      columns: body.columns !== undefined ? normalizeColumns(body.columns, nextBoardType) : existing.columns,
      color: body.color !== undefined ? body.color : existing.color,
      isPinned: body.isPinned !== undefined ? Boolean(body.isPinned) : existing.isPinned,
      isArchived: body.isArchived !== undefined ? Boolean(body.isArchived) : existing.isArchived,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sortOrder,
    });

    return res.json({ board: updated });
  } catch (err) {
    console.error('[Projects] UPDATE board error:', err);
    return res.status(500).json({ error: 'ボードの更新に失敗しました', detail: err.message });
  }
}

router.put('/boards/:id', handleUpdateBoard);
router.patch('/boards/:id', handleUpdateBoard);

// ---------------------------------------------------------------------------
// 7. ボード複製（テンプレート運用向け）
//    POST /api/projects/boards/:id/clone
// ---------------------------------------------------------------------------
router.post('/boards/:id/clone', async (req, res) => {
  try {
    const sourceId = String(req.params.id);
    const body = req.body || {};
    const boards = await readAllBoards();
    const source = boards.find(b => String(b.id) === sourceId);
    if (!source) {
      return res.status(404).json({ error: '複製元のボードが見つかりません' });
    }

    const ownerId = String(body.ownerId || source.ownerId || '');
    const ownerName = body.ownerName || source.ownerName || '';
    const includeCards = body.includeCards !== false;
    const includeMemoCardsOnly = Boolean(body.includeMemoCardsOnly);

    const newBoardId = generateId('proj');
    const newBoard = await persistBoard({
      ...source,
      id: newBoardId,
      title: body.title ? String(body.title).trim() : `${source.title} (コピー)`,
      boardType: body.boardType || source.boardType,
      visibility: body.visibility || source.visibility,
      ownerId,
      ownerName,
      memberIds: Array.isArray(body.memberIds) ? body.memberIds.map(String) : source.memberIds,
      isPinned: false,
      isArchived: false,
      sortOrder: boards.reduce((acc, b) => Math.max(acc, b.sortOrder || 0), 0) + 1,
    });

    const createdCards = [];
    if (includeCards) {
      const sourceCards = (await readAllCards(sourceId)).filter(c => !c.isArchived);
      const todoCol = newBoard.columns.find(c => c.kind === 'todo') || newBoard.columns[0];
      for (const sc of sourceCards) {
        if (includeMemoCardsOnly && sc.cardType !== 'memo') continue;
        const resetDone = sc.cardType !== 'memo' && Boolean(body.resetCompletion !== false);
        const targetColId = resetDone
          ? (newBoard.columns.find(c => c.id === sc.columnId && c.kind !== 'done')?.id || todoCol?.id || sc.columnId)
          : sc.columnId;
        const clonedCard = await persistCard({
          ...sc,
          id: generateId('card'),
          projectId: newBoardId,
          columnId: targetColId,
          isCompleted: resetDone ? false : sc.isCompleted,
          completedAt: resetDone ? undefined : sc.completedAt,
          completedBy: resetDone ? undefined : sc.completedBy,
          checklist: (sc.checklist || []).map(ch => ({
            ...ch,
            id: generateId('chk'),
            done: resetDone ? false : Boolean(ch.done),
          })),
          comments: [],
          createdBy: ownerId,
          createdByName: ownerName,
          updatedBy: ownerId,
        });
        createdCards.push(clonedCard);
      }
    }

    return res.status(201).json({ board: newBoard, cards: createdCards });
  } catch (err) {
    console.error('[Projects] CLONE board error:', err);
    return res.status(500).json({ error: 'ボードの複製に失敗しました', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// 8. ボード削除 (配下カードもカスケード削除)
//    DELETE /api/projects/boards/:id
// ---------------------------------------------------------------------------
router.delete('/boards/:id', async (req, res) => {
  try {
    const boardId = String(req.params.id);
    const boards = await readAllBoards();
    const target = boards.find(b => String(b.id) === boardId);
    if (!target) {
      return res.status(404).json({ error: 'ボードが見つかりません' });
    }
    if (target.id.startsWith('personal-') && req.query.force !== 'true') {
      return res.status(400).json({ error: '既定のマイボードは削除できません（不要なカードを削除して整理してください）' });
    }

    const nextBoards = boards.filter(b => String(b.id) !== boardId);
    saveJsonArray(boardsFilePath, nextBoards);

    const allCards = await readAllCards();
    const nextCards = allCards.filter(c => String(c.projectId) !== boardId);
    saveJsonArray(cardsFilePath, nextCards);

    const pool = await getPool().catch(() => null);
    if (pool) {
      try {
        await ensureProjectTables(pool);
        const reqSql = pool.request();
        reqSql.input('id', sql.NVarChar(100), boardId);
        await reqSql.query(`
          DELETE FROM dbo.ProjectCards WHERE projectId = @id;
          DELETE FROM dbo.ProjectBoards WHERE id = @id;
        `);
      } catch (err) {
        console.warn('[Projects] SQL DELETE board warning:', err.message);
      }
    }

    return res.json({ success: true, id: boardId });
  } catch (err) {
    console.error('[Projects] DELETE board error:', err);
    return res.status(500).json({ error: 'ボードの削除に失敗しました', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// 9. カード作成
//    POST /api/projects/cards, POST /api/projects/items, POST /api/projects/boards/:projectId/cards
// ---------------------------------------------------------------------------
async function handleCreateCard(req, res) {
  try {
    const body = req.body || {};
    const projectId = String(req.params.projectId || body.projectId || '');
    const title = String(body.title || '').trim();
    if (!projectId) {
      return res.status(400).json({ error: 'projectId は必須です' });
    }
    if (!title) {
      return res.status(400).json({ error: 'タイトルは必須です' });
    }

    const boards = await readAllBoards();
    const board = boards.find(b => String(b.id) === projectId);
    if (!board) {
      return res.status(404).json({ error: '指定されたボードが見つかりません' });
    }

    const cardType = body.cardType === 'memo' ? 'memo' : 'task';
    let columnId = body.columnId ? String(body.columnId) : '';
    if (!columnId || !board.columns.some(c => c.id === columnId)) {
      const preferred =
        board.columns.find(c => c.kind === (cardType === 'memo' ? 'memo' : 'todo')) ||
        board.columns[0];
      columnId = preferred ? preferred.id : 'col-todo';
    }

    const colObj = board.columns.find(c => c.id === columnId);
    const isDoneCol = colObj?.kind === 'done';
    const isCompleted = cardType === 'memo' ? false : (body.isCompleted !== undefined ? Boolean(body.isCompleted) : isDoneCol);

    const existingCards = await readAllCards(projectId);
    const maxOrder = existingCards
      .filter(c => c.columnId === columnId)
      .reduce((acc, c) => Math.max(acc, c.sortOrder || 0), 0);

    const card = await persistCard({
      id: body.id || generateId('card'),
      projectId,
      columnId,
      cardType,
      title,
      description: body.description || '',
      priority: ['high', 'medium', 'low', 'none'].includes(body.priority) ? body.priority : 'none',
      assigneeIds: Array.isArray(body.assigneeIds) ? body.assigneeIds.map(String) : [],
      dueDate: body.dueDate ? normalizeDateStr(body.dueDate) : undefined,
      startDate: body.startDate ? normalizeDateStr(body.startDate) : undefined,
      tags: Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : [],
      links: Array.isArray(body.links) ? body.links : [],
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      checklist: Array.isArray(body.checklist) ? body.checklist : [],
      comments: Array.isArray(body.comments) ? body.comments : [],
      isCompleted,
      completedAt: isCompleted ? (body.completedAt || getJstNowIso()) : undefined,
      completedBy: isCompleted ? (body.completedBy || body.createdBy || undefined) : undefined,
      isPinned: Boolean(body.isPinned),
      isArchived: false,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : maxOrder + 1,
      createdBy: body.createdBy ? String(body.createdBy) : undefined,
      createdByName: body.createdByName ? String(body.createdByName) : undefined,
      updatedBy: body.createdBy ? String(body.createdBy) : undefined,
    });

    return res.status(201).json({ card });
  } catch (err) {
    console.error('[Projects] POST card error:', err);
    return res.status(500).json({ error: 'カードの作成に失敗しました', detail: err.message });
  }
}

router.post(['/cards', '/items', '/boards/:projectId/cards'], handleCreateCard);

// ---------------------------------------------------------------------------
// 10. カード一括並び替え・列移動
//     PUT / PATCH /api/projects/cards/reorder
// ---------------------------------------------------------------------------
async function handleReorderCards(req, res) {
  try {
    const updates = Array.isArray(req.body?.updates) ? req.body.updates : [];
    if (updates.length === 0) {
      return res.json({ updated: [] });
    }
    const allCards = await readAllCards();
    const cardMap = new Map(allCards.map(c => [String(c.id), c]));
    const updatedResults = [];

    for (const u of updates) {
      const target = cardMap.get(String(u.id));
      if (!target) continue;
      const saved = await persistCard({
        ...target,
        columnId: u.columnId !== undefined ? String(u.columnId) : target.columnId,
        sortOrder: u.sortOrder !== undefined ? Number(u.sortOrder) : target.sortOrder,
        isCompleted: u.isCompleted !== undefined ? Boolean(u.isCompleted) : target.isCompleted,
        completedAt: u.completedAt !== undefined ? u.completedAt : target.completedAt,
        completedBy: u.completedBy !== undefined ? u.completedBy : target.completedBy,
        updatedBy: u.updatedBy !== undefined ? String(u.updatedBy) : target.updatedBy,
      });
      updatedResults.push(saved);
    }

    return res.json({ updated: updatedResults });
  } catch (err) {
    console.error('[Projects] REORDER cards error:', err);
    return res.status(500).json({ error: 'カードの並び替え更新に失敗しました', detail: err.message });
  }
}

router.put(['/cards/reorder', '/items/reorder'], handleReorderCards);
router.patch(['/cards/reorder', '/items/reorder'], handleReorderCards);

// ---------------------------------------------------------------------------
// 11. 単一カード詳細取得
//     GET /api/projects/cards/:id, GET /api/projects/items/:id
// ---------------------------------------------------------------------------
router.get(['/cards/:id', '/items/:id'], async (req, res) => {
  try {
    const cardId = String(req.params.id);
    const allCards = await readAllCards();
    const card = allCards.find(c => String(c.id) === cardId);
    if (!card) {
      return res.status(404).json({ error: 'カードが見つかりません' });
    }
    const boards = await readAllBoards();
    const board = boards.find(b => String(b.id) === String(card.projectId));
    return res.json({ card, board });
  } catch (err) {
    console.error('[Projects] GET card detail error:', err);
    return res.status(500).json({ error: 'カード詳細の取得に失敗しました', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// 12. カード更新 (完了トグル / 列移動 / チェックリスト / URL / 添付 / メモ等)
//     PUT / PATCH /api/projects/cards/:id, /api/projects/items/:id
// ---------------------------------------------------------------------------
async function handleUpdateCard(req, res) {
  try {
    const cardId = String(req.params.id);
    const allCards = await readAllCards();
    const existing = allCards.find(c => String(c.id) === cardId);
    if (!existing) {
      return res.status(404).json({ error: 'カードが見つかりません' });
    }

    const body = req.body || {};
    const boards = await readAllBoards();
    const targetProjectId = body.projectId ? String(body.projectId) : existing.projectId;
    const board = boards.find(b => String(b.id) === targetProjectId);

    const nextCardType = body.cardType !== undefined ? (body.cardType === 'memo' ? 'memo' : 'task') : existing.cardType;
    let nextColumnId = body.columnId !== undefined ? String(body.columnId) : existing.columnId;
    let nextIsCompleted = body.isCompleted !== undefined ? Boolean(body.isCompleted) : existing.isCompleted;
    let nextCompletedAt = existing.completedAt;
    let nextCompletedBy = existing.completedBy;

    // 完了切り替え時の列自動追従 (オプション: syncColumn !== false)
    if (body.isCompleted !== undefined && body.columnId === undefined && body.syncColumn !== false && board) {
      if (nextIsCompleted) {
        const doneCol = board.columns.find(c => c.kind === 'done');
        if (doneCol) nextColumnId = doneCol.id;
      } else {
        const currentCol = board.columns.find(c => c.id === nextColumnId);
        if (currentCol?.kind === 'done') {
          const todoCol = board.columns.find(c => c.kind === 'todo') || board.columns[0];
          if (todoCol) nextColumnId = todoCol.id;
        }
      }
    } else if (body.columnId !== undefined && body.isCompleted === undefined && board && nextCardType !== 'memo') {
      const targetCol = board.columns.find(c => c.id === nextColumnId);
      if (targetCol?.kind === 'done') {
        nextIsCompleted = true;
      } else if (existing.isCompleted && targetCol && targetCol.kind !== 'done') {
        nextIsCompleted = false;
      }
    }

    if (nextCardType === 'memo') {
      nextIsCompleted = false;
      nextCompletedAt = undefined;
      nextCompletedBy = undefined;
    } else if (nextIsCompleted && !existing.isCompleted) {
      nextCompletedAt = body.completedAt || getJstNowIso();
      nextCompletedBy = body.completedBy || body.updatedBy || existing.updatedBy || undefined;
    } else if (!nextIsCompleted) {
      nextCompletedAt = undefined;
      nextCompletedBy = undefined;
    }

    const updated = await persistCard({
      ...existing,
      projectId: targetProjectId,
      columnId: nextColumnId,
      cardType: nextCardType,
      title: body.title !== undefined ? (String(body.title).trim() || existing.title) : existing.title,
      description: body.description !== undefined ? String(body.description) : existing.description,
      priority: body.priority !== undefined ? body.priority : existing.priority,
      assigneeIds: body.assigneeIds !== undefined ? (Array.isArray(body.assigneeIds) ? body.assigneeIds.map(String) : []) : existing.assigneeIds,
      dueDate: body.dueDate !== undefined ? (body.dueDate ? normalizeDateStr(body.dueDate) : undefined) : existing.dueDate,
      startDate: body.startDate !== undefined ? (body.startDate ? normalizeDateStr(body.startDate) : undefined) : existing.startDate,
      tags: body.tags !== undefined ? (Array.isArray(body.tags) ? body.tags.map(String).filter(Boolean) : []) : existing.tags,
      links: body.links !== undefined ? (Array.isArray(body.links) ? body.links : []) : existing.links,
      attachments: body.attachments !== undefined ? (Array.isArray(body.attachments) ? body.attachments : []) : existing.attachments,
      checklist: body.checklist !== undefined ? (Array.isArray(body.checklist) ? body.checklist : []) : existing.checklist,
      comments: body.comments !== undefined ? (Array.isArray(body.comments) ? body.comments : []) : existing.comments,
      isCompleted: nextIsCompleted,
      completedAt: nextCompletedAt,
      completedBy: nextCompletedBy,
      isPinned: body.isPinned !== undefined ? Boolean(body.isPinned) : existing.isPinned,
      isArchived: body.isArchived !== undefined ? Boolean(body.isArchived) : existing.isArchived,
      sortOrder: body.sortOrder !== undefined ? Number(body.sortOrder) : existing.sortOrder,
      updatedBy: body.updatedBy ? String(body.updatedBy) : existing.updatedBy,
    });

    return res.json({ card: updated });
  } catch (err) {
    console.error('[Projects] UPDATE card error:', err);
    return res.status(500).json({ error: 'カードの更新に失敗しました', detail: err.message });
  }
}

router.put(['/cards/:id', '/items/:id'], handleUpdateCard);
router.patch(['/cards/:id', '/items/:id'], handleUpdateCard);

// ---------------------------------------------------------------------------
// 13. カード削除
//     DELETE /api/projects/cards/:id, DELETE /api/projects/items/:id
// ---------------------------------------------------------------------------
router.delete(['/cards/:id', '/items/:id'], async (req, res) => {
  try {
    const cardId = String(req.params.id);
    const allCards = await readAllCards();
    const exists = allCards.some(c => String(c.id) === cardId);
    if (!exists) {
      return res.status(404).json({ error: 'カードが見つかりません' });
    }

    const nextCards = allCards.filter(c => String(c.id) !== cardId);
    saveJsonArray(cardsFilePath, nextCards);

    const pool = await getPool().catch(() => null);
    if (pool) {
      try {
        await ensureProjectTables(pool);
        const reqSql = pool.request();
        reqSql.input('id', sql.NVarChar(100), cardId);
        await reqSql.query(`DELETE FROM dbo.ProjectCards WHERE id = @id`);
      } catch (err) {
        console.warn('[Projects] SQL DELETE card warning:', err.message);
      }
    }

    return res.json({ success: true, id: cardId });
  } catch (err) {
    console.error('[Projects] DELETE card error:', err);
    return res.status(500).json({ error: 'カードの削除に失敗しました', detail: err.message });
  }
});

// ---------------------------------------------------------------------------
// 14. カード内コメント追加・削除
//     POST /api/projects/cards/:id/comments
//     DELETE /api/projects/cards/:id/comments/:commentId
// ---------------------------------------------------------------------------
router.post(['/cards/:id/comments', '/items/:id/comments'], async (req, res) => {
  try {
    const cardId = String(req.params.id);
    const body = req.body || {};
    const content = String(body.content || '').trim();
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    if (!content && attachments.length === 0) {
      return res.status(400).json({ error: 'コメント本文または添付ファイルが必要です' });
    }

    const allCards = await readAllCards();
    const existing = allCards.find(c => String(c.id) === cardId);
    if (!existing) {
      return res.status(404).json({ error: 'カードが見つかりません' });
    }

    const newComment = {
      id: body.id || generateId('cmt'),
      authorId: String(body.authorId || ''),
      authorName: String(body.authorName || 'ユーザー'),
      authorAvatar: body.authorAvatar || undefined,
      content,
      attachments,
      createdAt: getJstNowIso(),
    };

    const nextComments = [...(existing.comments || []), newComment];
    const updated = await persistCard({
      ...existing,
      comments: nextComments,
      updatedBy: body.authorId ? String(body.authorId) : existing.updatedBy,
    });

    return res.status(201).json({ comment: newComment, card: updated });
  } catch (err) {
    console.error('[Projects] POST comment error:', err);
    return res.status(500).json({ error: 'コメントの投稿に失敗しました', detail: err.message });
  }
});

router.delete(['/cards/:id/comments/:commentId', '/items/:id/comments/:commentId'], async (req, res) => {
  try {
    const cardId = String(req.params.id);
    const commentId = String(req.params.commentId);
    const allCards = await readAllCards();
    const existing = allCards.find(c => String(c.id) === cardId);
    if (!existing) {
      return res.status(404).json({ error: 'カードが見つかりません' });
    }

    const nextComments = (existing.comments || []).filter(c => String(c.id) !== commentId);
    const updated = await persistCard({
      ...existing,
      comments: nextComments,
    });

    return res.json({ success: true, card: updated });
  } catch (err) {
    console.error('[Projects] DELETE comment error:', err);
    return res.status(500).json({ error: 'コメントの削除に失敗しました', detail: err.message });
  }
});

export default router;
