import { Router } from 'express';
import sql from 'mssql';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { bulletinsFilesDir, safeParseJSON } from '../config.js';

const router = Router();

// ==========================================
// 添付ファイル ストレージ設定 & アップロード
// ==========================================
const bulletinsStorage = multer.diskStorage({
  destination: function (req, file, cb) { 
    if (!fs.existsSync(bulletinsFilesDir)) {
      try { fs.mkdirSync(bulletinsFilesDir, { recursive: true }); } catch (_) {}
    }
    cb(null, bulletinsFilesDir); 
  },
  filename: function (req, file, cb) {
    let originalName = file.originalname;
    try { originalName = Buffer.from(file.originalname, 'latin1').toString('utf8'); } catch (e) {}
    cb(null, `${Date.now()}_${path.basename(originalName)}`);
  }
});
const uploadBulletins = multer({ storage: bulletinsStorage, limits: { fileSize: 50 * 1024 * 1024 } });

router.post(['/upload', '/bulletins/upload'], uploadBulletins.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'ファイルがありません' });
  const fileUrl = `/bulletinsfiles/${encodeURIComponent(req.file.filename)}`;
  res.json({
    url: fileUrl,
    fileUrl: fileUrl,
    filename: req.file.filename,
    name: req.file.originalname,
    size: (req.file.size / 1024 / 1024).toFixed(2) + ' MB'
  });
});

// 非同期I/O (fs.promises) による添付ファイル一覧取得（イベントループのブロッキングを完全防止）
router.get(['/bulletinsfiles/list', '/bulletins/files/list'], async (req, res) => {
  try {
    if (!fs.existsSync(bulletinsFilesDir)) return res.json([]);
    const filenames = await fs.promises.readdir(bulletinsFilesDir);
    const items = await Promise.all(
      filenames.map(async (filename) => {
        const filePath = path.join(bulletinsFilesDir, filename);
        try {
          const stat = await fs.promises.stat(filePath);
          if (stat.isDirectory()) return null;
          const ext = path.extname(filename).toLowerCase().replace('.', '');
          const displayName = filename.includes('_') ? filename.substring(filename.indexOf('_') + 1) : filename;
          return {
            name: displayName,
            rawFilename: filename,
            path: filename,
            url: `/bulletinsfiles/${encodeURIComponent(filename)}`,
            size: stat.size,
            mtime: stat.mtime.toISOString(),
            isDirectory: false,
            extension: ext,
            source: 'bulletin'
          };
        } catch (_) {
          return null;
        }
      })
    );
    const result = items.filter(Boolean);
    result.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// DBテーブル・カラム・高速化インデックス自動初期化関数
// ==========================================
async function ensureBulletinTables(pool) {
  if (!pool) return;
  try {
    await pool.request().query(`
      IF OBJECT_ID('dbo.Bulletins', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Bulletins (
          id VARCHAR(50) PRIMARY KEY,
          title NVARCHAR(200) NOT NULL,
          content NVARCHAR(MAX) NOT NULL,
          category NVARCHAR(50) NOT NULL,
          authorId VARCHAR(50) NOT NULL,
          createdAt DATETIME2 NOT NULL DEFAULT GETDATE(),
          views INT NOT NULL DEFAULT 0,
          likes INT NOT NULL DEFAULT 0,
          office NVARCHAR(100) NULL,
          division NVARCHAR(100) NULL,
          scope NVARCHAR(50) NULL DEFAULT N'全社',
          isStrictScope BIT NULL DEFAULT 0,
          tags NVARCHAR(500) NULL,
          isPinned BIT NULL DEFAULT 0,
          pinnedUntil VARCHAR(40) NULL,
          hasPeriod BIT NULL DEFAULT 0,
          startDate VARCHAR(20) NULL,
          endDate VARCHAR(20) NULL,
          attachments NVARCHAR(MAX) NULL,
          poll NVARCHAR(MAX) NULL
        );
      END;

      IF OBJECT_ID('dbo.BoardComments', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.BoardComments (
          id VARCHAR(50) PRIMARY KEY,
          bulletinId VARCHAR(50) NULL,
          topicId VARCHAR(50) NULL,
          topic_id VARCHAR(50) NULL,
          authorId VARCHAR(50) NULL,
          author_id VARCHAR(50) NULL,
          content NVARCHAR(MAX) NOT NULL,
          createdAt DATETIME2 NULL DEFAULT GETDATE(),
          created_at DATETIME2 NULL DEFAULT GETDATE(),
          attachments NVARCHAR(MAX) NULL
        );
      END;

      IF OBJECT_ID('dbo.BoardViewers', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.BoardViewers (
          bulletinId VARCHAR(50) NULL,
          topicId VARCHAR(50) NULL,
          userId VARCHAR(50) NOT NULL,
          viewedAt DATETIME2 NULL DEFAULT GETDATE()
        );
      END;

      IF COL_LENGTH('dbo.Bulletins', 'hasPeriod') IS NULL ALTER TABLE dbo.Bulletins ADD hasPeriod BIT NULL DEFAULT 0;
      IF COL_LENGTH('dbo.Bulletins', 'startDate') IS NULL ALTER TABLE dbo.Bulletins ADD startDate VARCHAR(20) NULL;
      IF COL_LENGTH('dbo.Bulletins', 'endDate') IS NULL ALTER TABLE dbo.Bulletins ADD endDate VARCHAR(20) NULL;
      IF COL_LENGTH('dbo.Bulletins', 'office') IS NULL ALTER TABLE dbo.Bulletins ADD office NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.Bulletins', 'division') IS NULL ALTER TABLE dbo.Bulletins ADD division NVARCHAR(100) NULL;
      IF COL_LENGTH('dbo.Bulletins', 'scope') IS NULL ALTER TABLE dbo.Bulletins ADD scope NVARCHAR(50) DEFAULT N'全社';
      IF COL_LENGTH('dbo.Bulletins', 'tags') IS NULL ALTER TABLE dbo.Bulletins ADD tags NVARCHAR(500) NULL;
      IF COL_LENGTH('dbo.Bulletins', 'attachments') IS NULL ALTER TABLE dbo.Bulletins ADD attachments NVARCHAR(MAX) NULL;
      IF COL_LENGTH('dbo.Bulletins', 'pinnedUntil') IS NULL ALTER TABLE dbo.Bulletins ADD pinnedUntil VARCHAR(40) NULL;
      IF COL_LENGTH('dbo.Bulletins', 'poll') IS NULL ALTER TABLE dbo.Bulletins ADD poll NVARCHAR(MAX) NULL;
      IF COL_LENGTH('dbo.Bulletins', 'isStrictScope') IS NULL ALTER TABLE dbo.Bulletins ADD isStrictScope BIT NULL DEFAULT 0;

      IF COL_LENGTH('dbo.BoardComments', 'bulletinId') IS NULL ALTER TABLE dbo.BoardComments ADD bulletinId VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'topicId') IS NULL ALTER TABLE dbo.BoardComments ADD topicId VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'topic_id') IS NULL ALTER TABLE dbo.BoardComments ADD topic_id VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'authorId') IS NULL ALTER TABLE dbo.BoardComments ADD authorId VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'author_id') IS NULL ALTER TABLE dbo.BoardComments ADD author_id VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'attachments') IS NULL ALTER TABLE dbo.BoardComments ADD attachments NVARCHAR(MAX) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'created_at') IS NULL ALTER TABLE dbo.BoardComments ADD created_at DATETIME2 NULL;

      IF COL_LENGTH('dbo.BoardViewers', 'bulletinId') IS NULL ALTER TABLE dbo.BoardViewers ADD bulletinId VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardViewers', 'topicId') IS NULL ALTER TABLE dbo.BoardViewers ADD topicId VARCHAR(50) NULL;
    `);

    // 旧環境での NOT NULL 制約の緩和・旧カラムデータの topicId 正規化・インデックス作成
    try {
      await pool.request().query(`
        ALTER TABLE dbo.BoardComments ALTER COLUMN authorId VARCHAR(50) NULL;
        ALTER TABLE dbo.BoardComments ALTER COLUMN author_id VARCHAR(50) NULL;
        ALTER TABLE dbo.BoardComments ALTER COLUMN topicId VARCHAR(50) NULL;
        ALTER TABLE dbo.BoardComments ALTER COLUMN topic_id VARCHAR(50) NULL;
        ALTER TABLE dbo.BoardComments ALTER COLUMN bulletinId VARCHAR(50) NULL;
      `);
    } catch (_) {}

    // 過去データの topicId 統一補正 & 非クラスター化インデックスの自動生成
    try {
      await pool.request().query(`
        UPDATE dbo.BoardComments
        SET topicId = COALESCE(NULLIF(topic_id, ''), NULLIF(bulletinId, ''))
        WHERE (topicId IS NULL OR topicId = '')
          AND COALESCE(NULLIF(topic_id, ''), NULLIF(bulletinId, '')) IS NOT NULL;

        UPDATE dbo.BoardViewers
        SET topicId = bulletinId
        WHERE (topicId IS NULL OR topicId = '')
          AND bulletinId IS NOT NULL AND bulletinId <> '';

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_Bulletins_Pinned_CreatedAt' AND object_id = OBJECT_ID('dbo.Bulletins'))
        BEGIN
          CREATE NONCLUSTERED INDEX IX_Bulletins_Pinned_CreatedAt
          ON dbo.Bulletins (isPinned DESC, createdAt DESC)
          INCLUDE (category, office, division, scope, authorId, views, likes);
        END;

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BoardComments_TopicId_CreatedAt' AND object_id = OBJECT_ID('dbo.BoardComments'))
        BEGIN
          CREATE NONCLUSTERED INDEX IX_BoardComments_TopicId_CreatedAt
          ON dbo.BoardComments (topicId ASC, createdAt ASC);
        END;

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_BoardViewers_TopicId_UserId' AND object_id = OBJECT_ID('dbo.BoardViewers'))
        BEGIN
          CREATE NONCLUSTERED INDEX IX_BoardViewers_TopicId_UserId
          ON dbo.BoardViewers (topicId ASC, userId ASC)
          INCLUDE (viewedAt);
        END;
      `);
    } catch (_) {}
  } catch (e) {
    console.warn('[routes/bulletins] ensureBulletinTables warning:', e.message);
  }
}

let isTablesEnsured = false;
async function ensureBulletinTablesOnce(pool) {
  if (isTablesEnsured || !pool) return;
  try {
    await ensureBulletinTables(pool);
    isTablesEnsured = true;
  } catch (e) {
    console.warn('[routes/bulletins] ensureBulletinTables warning:', e.message);
  }
}

// ピン留め・アンケート整形共通ヘルパー
function formatPollAndPinState(row, nowMs) {
  const pollObj = safeParseJSON(row.poll, null);
  let isPollAutoPinned = false;
  if (pollObj && pollObj.autoPinUntilDeadline && pollObj.deadline && !pollObj.isClosed) {
    const trimmed = String(pollObj.deadline).trim();
    const deadlineMs = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
      ? new Date(`${trimmed}T23:59:59.999+09:00`).getTime()
      : new Date(trimmed).getTime();
    if (!isNaN(deadlineMs) && deadlineMs > nowMs) {
      isPollAutoPinned = true;
    }
  }

  const isCurrentlyPinned = isPollAutoPinned || (!!row.isPinned && (!row.pinnedUntil || new Date(row.pinnedUntil).getTime() > nowMs));

  let safePoll = null;
  if (pollObj) {
    safePoll = {
      ...pollObj,
      id: pollObj.id || `poll-${row.id}`,
      title: pollObj.title || pollObj.question || 'アンケート / 意思決定投票',
      question: pollObj.question || pollObj.title || 'アンケート / 意思決定投票',
      deadline: pollObj.deadline || null,
      autoPinUntilDeadline: !!pollObj.autoPinUntilDeadline,
      allowMultiple: !!pollObj.allowMultiple,
      isAnonymous: !!pollObj.isAnonymous,
      options: Array.isArray(pollObj.options) ? pollObj.options : [],
      votes: Array.isArray(pollObj.votes) ? pollObj.votes : []
    };
  }

  return { pollObj, safePoll, isCurrentlyPinned };
}

// ==========================================
// 掲示板サマリー取得 (GET /api/bulletins/summary & /api/board/summary)
// マイページ・速報表示用（最新N件・単一クエリ高速取得・DBロック完全排除）
// ==========================================
router.get([
  '/bulletins/summary',
  '/bulletins/summary/',
  '/board/summary',
  '/board/summary/',
  '/summary',
  '/summary/'
], async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(500).json({ error: 'Database connection failed' });
    }
    await ensureBulletinTablesOnce(pool);

    const limit = Math.min(Math.max(parseInt(req.query.limit, 10) || 20, 1), 100);

    // 最新N件のトピック＋コメント件数集計を高速取得
    const result = await pool.request().query(`
      SELECT TOP (${limit})
        b.*,
        u.name AS authorName,
        u.department AS authorDepartment,
        u.avatarUrl AS authorAvatarUrl,
        (
          SELECT COUNT(1)
          FROM dbo.BoardComments c
          WHERE c.topicId = b.id OR c.topic_id = b.id OR c.bulletinId = b.id
        ) AS calcCommentsCount
      FROM dbo.Bulletins b
      LEFT JOIN dbo.Users u ON b.authorId = u.id
      ORDER BY b.isPinned DESC, b.createdAt DESC
    `);
    const bulletins = result.recordset || [];

    const nowMs = Date.now();
    const formatted = bulletins.map(row => {
      const { safePoll, isCurrentlyPinned } = formatPollAndPinState(row, nowMs);

      return {
        id: String(row.id),
        category: row.category,
        title: row.title,
        content: row.content,
        authorId: row.authorId,
        author: {
          id: row.authorId,
          name: row.authorName || '不明',
          department: row.authorDepartment || '',
          avatarUrl: row.authorAvatarUrl || ''
        },
        createdAt: row.createdAt,
        views: row.views || 0,
        likes: row.likes || 0,
        office: row.office || '全社',
        division: row.division || '全部署',
        scope: row.scope || '全社',
        isStrictScope: !!row.isStrictScope,
        tags: row.tags ? (typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : row.tags) : [],
        isPinned: isCurrentlyPinned,
        pinnedUntil: row.pinnedUntil || null,
        pinnedDuration: row.pinnedDuration || (row.pinnedUntil ? undefined : (isCurrentlyPinned ? 'forever' : undefined)),
        hasPeriod: !!row.hasPeriod,
        startDate: row.startDate || '',
        endDate: row.endDate || '',
        attachments: safeParseJSON(row.attachments, []),
        poll: safePoll,
        comments: [],
        viewers: [],
        commentsCount: Number(row.calcCommentsCount) || 0
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 掲示板トピック一覧取得 (GET /api/bulletins & /api/board)
// 【高速化対応】
// - コメント本文・添付ファイルの全件取得を廃止し、SQL GROUP BY で件数のみ O(1) マップ集計
// - 閲覧者（足跡）は Users JOIN を省いた軽量IDリストを Map で O(1) マージ（O(N*M)ループ完全排除）
// - ?limit=&offset= によるページネーション取得にも対応（省略時は全件返却）
// ==========================================
router.get(['/bulletins', '/bulletins/', '/board', '/board/'], async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(500).json({ error: 'Database connection failed' });
    }
    await ensureBulletinTablesOnce(pool);

    const limitParam = parseInt(req.query.limit, 10);
    const offsetParam = Math.max(parseInt(req.query.offset, 10) || 0, 0);
    const includeComments = req.query.includeComments === 'true' || req.query.includeComments === '1';

    let bulletinsQuery = `
      SELECT b.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
      FROM dbo.Bulletins b
      LEFT JOIN dbo.Users u ON b.authorId = u.id
      ORDER BY b.isPinned DESC, b.createdAt DESC
    `;
    if (!isNaN(limitParam) && limitParam > 0) {
      const safeLimit = Math.min(limitParam, 500);
      bulletinsQuery += ` OFFSET ${offsetParam} ROWS FETCH NEXT ${safeLimit} ROWS ONLY`;
    }

    // ① トピック本体と ② コメント件数集計と ③ 軽量閲覧者リストを並列取得
    const [bulletinsRes, commentsAggRes, viewersRes] = await Promise.all([
      pool.request().query(bulletinsQuery),
      includeComments
        ? pool.request().query(`
            SELECT c.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
            FROM dbo.BoardComments c
            LEFT JOIN dbo.Users u ON COALESCE(NULLIF(c.authorId, ''), NULLIF(c.author_id, '')) = u.id
            ORDER BY COALESCE(c.createdAt, c.created_at) ASC
          `)
        : pool.request().query(`
            SELECT COALESCE(NULLIF(topicId, ''), NULLIF(topic_id, ''), NULLIF(bulletinId, '')) AS tid,
                   COUNT(1) AS cnt
            FROM dbo.BoardComments
            GROUP BY COALESCE(NULLIF(topicId, ''), NULLIF(topic_id, ''), NULLIF(bulletinId, ''))
          `),
      pool.request().query(`
        SELECT COALESCE(NULLIF(topicId, ''), NULLIF(bulletinId, '')) AS tid,
               userId,
               viewedAt
        FROM dbo.BoardViewers
      `)
    ]);

    const bulletins = bulletinsRes.recordset || [];

    // O(1) ルックアップ用 Map 構築（従来の O(Bulletins * Comments) ネストループを完全排除）
    const commentsCountMap = new Map();
    const commentsListMap = new Map();

    if (includeComments) {
      for (const c of (commentsAggRes.recordset || [])) {
        const tid = String(c.topicId || c.topic_id || c.bulletinId || '');
        if (!tid) continue;
        let list = commentsListMap.get(tid);
        if (!list) {
          list = [];
          commentsListMap.set(tid, list);
        }
        list.push({
          id: String(c.id),
          content: c.content,
          createdAt: c.createdAt || c.created_at || new Date(),
          author: {
            id: c.authorId || c.author_id,
            name: c.authorName || '不明',
            department: c.authorDepartment || '',
            avatarUrl: c.authorAvatarUrl || ''
          },
          attachments: safeParseJSON(c.attachments || c.attachmentsJson, [])
        });
      }
    } else {
      for (const row of (commentsAggRes.recordset || [])) {
        if (row.tid) {
          commentsCountMap.set(String(row.tid), Number(row.cnt) || 0);
        }
      }
    }

    // 閲覧者（足跡）も O(V) の1パスで Map 化（Users JOIN の重複ペイロードも削減）
    const viewersMap = new Map();
    for (const v of (viewersRes.recordset || [])) {
      const tid = String(v.tid || '');
      const uid = String(v.userId || '');
      if (!tid || !uid) continue;
      let list = viewersMap.get(tid);
      if (!list) {
        list = [];
        viewersMap.set(tid, list);
      }
      list.push({
        viewedAt: v.viewedAt || new Date(),
        userId: uid,
        user: { id: uid }
      });
    }

    const nowMs = Date.now();
    const formatted = bulletins.map(row => {
      const topicIdStr = String(row.id);
      const topicComments = includeComments ? (commentsListMap.get(topicIdStr) || []) : [];
      const commentsCount = includeComments
        ? topicComments.length
        : (commentsCountMap.get(topicIdStr) || 0);
      const topicViewers = viewersMap.get(topicIdStr) || [];

      const { pollObj, isCurrentlyPinned } = formatPollAndPinState(row, nowMs);

      return {
        id: topicIdStr,
        category: row.category,
        title: row.title,
        content: row.content,
        authorId: row.authorId,
        author: {
          id: row.authorId,
          name: row.authorName || '不明',
          department: row.authorDepartment || '',
          avatarUrl: row.authorAvatarUrl || ''
        },
        createdAt: row.createdAt,
        views: topicViewers.length || row.views || 0,
        likes: row.likes || 0,
        office: row.office || '全社',
        division: row.division || '全部署',
        scope: row.scope || '全社',
        isStrictScope: !!row.isStrictScope,
        tags: row.tags ? (typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : row.tags) : [],
        isPinned: isCurrentlyPinned,
        pinnedUntil: row.pinnedUntil || null,
        pinnedDuration: row.pinnedDuration || (row.pinnedUntil ? undefined : (isCurrentlyPinned ? 'forever' : undefined)),
        hasPeriod: !!row.hasPeriod,
        startDate: row.startDate || '',
        endDate: row.endDate || '',
        attachments: safeParseJSON(row.attachments, []),
        poll: pollObj,
        comments: topicComments,
        viewers: topicViewers,
        commentsCount
      };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 掲示板トピック単体詳細・コメント・閲覧者取得 API (オンデマンド遅延ロード用)
// GET /api/bulletins/:id/detail, /api/bulletins/:id, /api/board/:id/detail
// ==========================================
router.get([
  '/bulletins/:id/detail',
  '/board/:id/detail',
  '/:id/detail',
  '/bulletins/:id',
  '/board/:id'
], async (req, res, next) => {
  const topicId = String(req.params.id || '');
  // 予約語パスの誤マッチ防止
  if (!topicId || topicId === 'summary' || topicId === 'upload' || topicId === 'files') {
    return next();
  }

  try {
    const pool = await getPool();
    if (!pool) {
      return res.status(500).json({ error: 'Database connection failed' });
    }
    await ensureBulletinTablesOnce(pool);

    // インデックスを活用して対象トピック1件分のデータ・コメント・閲覧者を並列取得
    const [topicRes, commentsRes, viewersRes] = await Promise.all([
      pool.request()
        .input('id', sql.VarChar, topicId)
        .query(`
          SELECT b.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
          FROM dbo.Bulletins b
          LEFT JOIN dbo.Users u ON b.authorId = u.id
          WHERE b.id = @id
        `),
      pool.request()
        .input('topicId', sql.VarChar, topicId)
        .query(`
          SELECT c.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
          FROM dbo.BoardComments c
          LEFT JOIN dbo.Users u ON COALESCE(NULLIF(c.authorId, ''), NULLIF(c.author_id, '')) = u.id
          WHERE c.topicId = @topicId OR c.topic_id = @topicId OR c.bulletinId = @topicId
          ORDER BY COALESCE(c.createdAt, c.created_at) ASC
        `),
      pool.request()
        .input('topicId', sql.VarChar, topicId)
        .query(`
          SELECT v.*, u.name AS userName, u.department AS userDepartment, u.avatarUrl AS userAvatarUrl
          FROM dbo.BoardViewers v
          LEFT JOIN dbo.Users u ON v.userId = u.id
          WHERE v.topicId = @topicId OR v.bulletinId = @topicId
          ORDER BY v.viewedAt DESC
        `)
    ]);

    if (!topicRes.recordset || topicRes.recordset.length === 0) {
      return res.status(404).json({ error: 'トピックが見つかりません' });
    }

    const row = topicRes.recordset[0];
    const topicComments = (commentsRes.recordset || []).map(c => ({
      id: String(c.id),
      content: c.content,
      createdAt: c.createdAt || c.created_at || new Date(),
      author: {
        id: c.authorId || c.author_id,
        name: c.authorName || '不明',
        department: c.authorDepartment || '',
        avatarUrl: c.authorAvatarUrl || ''
      },
      attachments: safeParseJSON(c.attachments || c.attachmentsJson, [])
    }));

    // 同一ユーザーの重複足跡を排除しつつ最新閲覧日時を保持
    const seenViewerUsers = new Set();
    const topicViewers = [];
    for (const v of (viewersRes.recordset || [])) {
      const uid = String(v.userId || v.user_id || '');
      if (!uid || seenViewerUsers.has(uid)) continue;
      seenViewerUsers.add(uid);
      topicViewers.push({
        viewedAt: v.viewedAt || v.viewed_at || new Date(),
        user: {
          id: uid,
          name: v.userName || '不明',
          department: v.userDepartment || '',
          avatarUrl: v.userAvatarUrl || ''
        }
      });
    }

    const { pollObj, isCurrentlyPinned } = formatPollAndPinState(row, Date.now());

    res.json({
      id: String(row.id),
      category: row.category,
      title: row.title,
      content: row.content,
      authorId: row.authorId,
      author: {
        id: row.authorId,
        name: row.authorName || '不明',
        department: row.authorDepartment || '',
        avatarUrl: row.authorAvatarUrl || ''
      },
      createdAt: row.createdAt,
      views: topicViewers.length || row.views || 0,
      likes: row.likes || 0,
      office: row.office || '全社',
      division: row.division || '全部署',
      scope: row.scope || '全社',
      isStrictScope: !!row.isStrictScope,
      tags: row.tags ? (typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : row.tags) : [],
      isPinned: isCurrentlyPinned,
      pinnedUntil: row.pinnedUntil || null,
      pinnedDuration: row.pinnedDuration || (row.pinnedUntil ? undefined : (isCurrentlyPinned ? 'forever' : undefined)),
      hasPeriod: !!row.hasPeriod,
      startDate: row.startDate || '',
      endDate: row.endDate || '',
      attachments: safeParseJSON(row.attachments, []),
      poll: pollObj,
      comments: topicComments,
      viewers: topicViewers,
      commentsCount: topicComments.length
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 掲示板トピック新規作成 (POST /api/bulletins & /api/board)
// ==========================================
router.post(['/bulletins', '/bulletins/', '/board', '/board/'], async (req, res) => {
  try {
    const { title, content, category, authorId, isPinned, office, division, scope, isStrictScope, tags, attachments, hasPeriod, startDate, endDate, pinnedUntil, poll } = req.body;
    const pool = await getPool();
    const id = req.body.id || `b-${Date.now()}`;

    if (pool) {
      await ensureBulletinTablesOnce(pool);
    }

    const finalPinned = isPinned ? 1 : 0;
    const finalPinnedUntil = isPinned ? (pinnedUntil || null) : null;
    const pollStr = poll ? (typeof poll === 'object' ? JSON.stringify(poll) : String(poll)) : null;

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '')
      .input('content', sql.NVarChar, content || '')
      .input('category', sql.NVarChar, category || 'general')
      .input('authorId', sql.VarChar, authorId || req.body.author?.id || 'u1')
      .input('isPinned', sql.Bit, finalPinned)
      .input('pinnedUntil', sql.VarChar, finalPinnedUntil)
      .input('office', sql.NVarChar, office || '全社')
      .input('division', sql.NVarChar, division || '全部署')
      .input('scope', sql.NVarChar, scope || '全社')
      .input('isStrictScope', sql.Bit, isStrictScope ? 1 : 0)
      .input('tags', sql.NVarChar, Array.isArray(tags) ? tags.join(',') : (tags || ''))
      .input('hasPeriod', sql.Bit, hasPeriod ? 1 : 0)
      .input('startDate', sql.VarChar, startDate || null)
      .input('endDate', sql.VarChar, endDate || null)
      .input('attachments', sql.NVarChar, attachments ? JSON.stringify(attachments) : null)
      .input('poll', sql.NVarChar, pollStr)
      .query(`
        INSERT INTO dbo.Bulletins (id, title, content, category, authorId, isPinned, pinnedUntil, office, division, scope, isStrictScope, tags, attachments, hasPeriod, startDate, endDate, poll, createdAt, views, likes)
        VALUES (@id, @title, @content, @category, @authorId, @isPinned, @pinnedUntil, @office, @division, @scope, @isStrictScope, @tags, @attachments, @hasPeriod, @startDate, @endDate, @poll, GETDATE(), 0, 0)
      `);
    res.status(201).json({ id, message: '掲示板トピック作成完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 掲示板トピック更新 (PUT /api/bulletins/:id & /api/board/:id)
// ==========================================
router.put(['/bulletins/:id', '/board/:id'], async (req, res) => {
  try {
    const id = req.params.id;
    const { title, content, category, isPinned, office, division, scope, isStrictScope, tags, attachments, hasPeriod, startDate, endDate, pinnedUntil, poll, skipChildSync } = req.body;
    const pool = await getPool();

    if (pool) {
      await ensureBulletinTablesOnce(pool);
    }

    const finalPinned = isPinned ? 1 : 0;
    const finalPinnedUntil = isPinned ? (pinnedUntil || null) : null;

    // アンケート更新時の保護: 既存DBにoptionsが存在する場合、空または欠落したoptionsで上書きして消失させない
    let finalPoll = poll;
    if (poll !== undefined && poll !== null) {
      try {
        const existingCheck = await pool.request()
          .input('checkId', sql.VarChar, String(id))
          .query('SELECT poll FROM dbo.Bulletins WHERE id = @checkId');
        if (existingCheck.recordset && existingCheck.recordset.length > 0) {
          const dbPoll = safeParseJSON(existingCheck.recordset[0].poll, null);
          if (dbPoll) {
            const incomingOptions = Array.isArray(poll.options) ? poll.options : [];
            const existingOptions = Array.isArray(dbPoll.options) ? dbPoll.options : [];

            if (incomingOptions.length === 0 && existingOptions.length > 0) {
              finalPoll = {
                ...dbPoll,
                ...poll,
                options: existingOptions,
                title: poll.title || poll.question || dbPoll.title || dbPoll.question || 'アンケート / 意思決定投票',
                question: poll.question || poll.title || dbPoll.question || dbPoll.title || 'アンケート / 意思決定投票',
                votes: Array.isArray(poll.votes) && poll.votes.length > 0 ? poll.votes : (dbPoll.votes || [])
              };
            }
          }
        }
      } catch (checkErr) {
        console.warn('[PUT /bulletins/:id] Error checking existing poll for options protection:', checkErr.message);
      }
    }
    const pollStr = finalPoll !== undefined ? (finalPoll ? JSON.stringify(finalPoll) : null) : undefined;

    const request = pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '')
      .input('content', sql.NVarChar, content || '')
      .input('category', sql.NVarChar, category || 'general')
      .input('isPinned', sql.Bit, finalPinned)
      .input('pinnedUntil', sql.VarChar, finalPinnedUntil)
      .input('office', sql.NVarChar, office || '全社')
      .input('division', sql.NVarChar, division || '全部署')
      .input('scope', sql.NVarChar, scope || '全社')
      .input('isStrictScope', sql.Bit, isStrictScope ? 1 : 0)
      .input('tags', sql.NVarChar, Array.isArray(tags) ? tags.join(',') : (tags || ''))
      .input('hasPeriod', sql.Bit, hasPeriod ? 1 : 0)
      .input('startDate', sql.VarChar, startDate || null)
      .input('endDate', sql.VarChar, endDate || null)
      .input('attachments', sql.NVarChar, attachments ? JSON.stringify(attachments) : null);

    if (pollStr !== undefined) {
      request.input('poll', sql.NVarChar, pollStr);
    }

    await request.query(`
      UPDATE dbo.Bulletins
      SET 
        title = @title,
        content = @content,
        category = @category,
        isPinned = @isPinned,
        pinnedUntil = @pinnedUntil,
        office = @office,
        division = @division,
        scope = @scope,
        isStrictScope = @isStrictScope,
        tags = @tags,
        attachments = @attachments,
        hasPeriod = @hasPeriod,
        startDate = @startDate,
        endDate = @endDate
        ${pollStr !== undefined ? ', poll = @poll' : ''}
      WHERE id = @id
    `);

    // skipChildSync 指定時（トピック本文・設定のみの編集時）は N+1 ループを完全スキップ
    if (!skipChildSync) {
      // 閲覧者の差分のみ追加（既存IDを1クエリで取得して未登録分のみINSERT）
      if (Array.isArray(req.body.viewers) && req.body.viewers.length > 0) {
        try {
          const existingViewersRes = await pool.request()
            .input('topicId', sql.VarChar, String(id))
            .query('SELECT userId FROM dbo.BoardViewers WHERE topicId = @topicId OR bulletinId = @topicId');
          const existingUserIds = new Set((existingViewersRes.recordset || []).map(r => String(r.userId)));

          for (const v of req.body.viewers) {
            const uid = v?.user?.id || v?.userId || v?.user_id || (typeof v?.user === 'string' ? v?.user : null);
            if (uid && !existingUserIds.has(String(uid))) {
              existingUserIds.add(String(uid));
              const dateVal = v.viewedAt || v.viewed_at ? new Date(v.viewedAt || v.viewed_at) : new Date();
              try {
                await pool.request()
                  .input('topicId', sql.VarChar, String(id))
                  .input('userId', sql.VarChar, String(uid))
                  .input('viewedAt', sql.DateTime, dateVal)
                  .query(`
                    INSERT INTO dbo.BoardViewers (topicId, bulletinId, userId, viewedAt)
                    VALUES (@topicId, @topicId, @userId, @viewedAt)
                  `);
              } catch (_) {}
            }
          }
        } catch (_) {}
      }

      // コメント配列の差分のみ追加（既存IDを1クエリで取得して新規コメントのみINSERT）
      if (Array.isArray(req.body.comments) && req.body.comments.length > 0) {
        try {
          const existingCommentsRes = await pool.request()
            .input('topicId', sql.VarChar, String(id))
            .query('SELECT id FROM dbo.BoardComments WHERE topicId = @topicId OR topic_id = @topicId OR bulletinId = @topicId');
          const existingCommentIds = new Set((existingCommentsRes.recordset || []).map(r => String(r.id)));

          for (const c of req.body.comments) {
            const cid = String(c.id || `cm-${Date.now()}`);
            if (!existingCommentIds.has(cid)) {
              existingCommentIds.add(cid);
              const aid = c.authorId || c.author?.id || 'u1';
              const dateVal = c.createdAt ? new Date(c.createdAt) : new Date();
              const attachStr = c.attachments ? (typeof c.attachments === 'object' ? JSON.stringify(c.attachments) : c.attachments) : null;
              try {
                await pool.request()
                  .input('id', sql.VarChar, cid)
                  .input('topicId', sql.VarChar, String(id))
                  .input('authorId', sql.VarChar, String(aid))
                  .input('content', sql.NVarChar, c.content || '')
                  .input('createdAt', sql.DateTime2, dateVal)
                  .input('attachments', sql.NVarChar, attachStr)
                  .query(`
                    INSERT INTO dbo.BoardComments (id, topicId, bulletinId, topic_id, authorId, author_id, content, createdAt, created_at, attachments)
                    VALUES (@id, @topicId, @topicId, @topicId, @authorId, @authorId, @content, @createdAt, @createdAt, @attachments)
                  `);
              } catch (_) {}
            }
          }
        } catch (_) {}
      }
    }

    res.json({ success: true, message: '掲示板トピック更新完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// アンケート投票 API (POST /api/bulletins/:id/poll/vote & /api/board/:id/poll/vote)
// ==========================================
router.post(['/bulletins/:id/poll/vote', '/board/:id/poll/vote', '/:id/poll/vote'], async (req, res) => {
  try {
    const topicId = req.params.id;
    const { userId, userName, userAvatarUrl, selectedOptionIds, comment } = req.body;
    if (!userId || !Array.isArray(selectedOptionIds) || selectedOptionIds.length === 0) {
      return res.status(400).json({ error: '投票者情報および選択肢が必要です' });
    }

    const pool = await getPool();
    if (pool) {
      await ensureBulletinTablesOnce(pool);
      const result = await pool.request()
        .input('id', sql.VarChar, String(topicId))
        .query('SELECT poll FROM dbo.Bulletins WHERE id = @id');

      if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ error: 'トピックが見つかりません' });
      }

      const currentPoll = safeParseJSON(result.recordset[0].poll, null);
      if (!currentPoll) {
        return res.status(400).json({ error: 'このトピックにはアンケートが設定されていません' });
      }

      // 締め切りチェック
      if (currentPoll.isClosed) {
        return res.status(400).json({ error: 'アンケートは締め切られました' });
      }
      if (currentPoll.deadline) {
        const trimmed = String(currentPoll.deadline).trim();
        const deadlineMs = /^\d{4}-\d{2}-\d{2}$/.test(trimmed)
          ? new Date(`${trimmed}T23:59:59.999+09:00`).getTime()
          : new Date(trimmed).getTime();
        if (!isNaN(deadlineMs) && Date.now() > deadlineMs) {
          return res.status(400).json({ error: '回答期限を過ぎているため投票できません' });
        }
      }

      // 投票リストの更新
      const votes = Array.isArray(currentPoll.votes) ? [...currentPoll.votes] : [];
      const nowIso = new Date().toISOString();
      const existingVoteIdx = votes.findIndex(v => String(v.userId) === String(userId));
      const voteRecord = {
        id: existingVoteIdx >= 0 ? votes[existingVoteIdx].id : `vote-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
        userId: String(userId),
        userName: userName || '匿名',
        userAvatarUrl: userAvatarUrl || '',
        selectedOptionIds: selectedOptionIds.map(String),
        comment: (comment || '').trim() || undefined,
        votedAt: nowIso
      };

      if (existingVoteIdx >= 0) {
        votes[existingVoteIdx] = voteRecord;
      } else {
        votes.push(voteRecord);
      }

      currentPoll.votes = votes;
      const updatedPollStr = JSON.stringify(currentPoll);

      await pool.request()
        .input('id', sql.VarChar, String(topicId))
        .input('poll', sql.NVarChar, updatedPollStr)
        .query('UPDATE dbo.Bulletins SET poll = @poll WHERE id = @id');

      return res.json({ success: true, poll: currentPoll, vote: voteRecord });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// アンケート締め切り & ピン留め解除 API (POST /api/bulletins/:id/poll/close)
// ==========================================
router.post(['/bulletins/:id/poll/close', '/board/:id/poll/close', '/:id/poll/close'], async (req, res) => {
  try {
    const topicId = req.params.id;
    const { closedAt, closedById } = req.body;
    const pool = await getPool();

    if (pool) {
      await ensureBulletinTablesOnce(pool);
      const result = await pool.request()
        .input('id', sql.VarChar, String(topicId))
        .query('SELECT poll FROM dbo.Bulletins WHERE id = @id');

      if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ error: 'トピックが見つかりません' });
      }

      const currentPoll = safeParseJSON(result.recordset[0].poll, null);
      if (!currentPoll) {
        return res.status(400).json({ error: 'このトピックにはアンケートが設定されていません' });
      }

      const nowIso = closedAt || new Date().toISOString();
      currentPoll.isClosed = true;
      currentPoll.closedAt = nowIso;
      currentPoll.closedById = closedById || null;
      currentPoll.autoPinUntilDeadline = false;

      const updatedPollStr = JSON.stringify(currentPoll);

      // アンケート締め切りとともにピン留めも即時解除
      await pool.request()
        .input('id', sql.VarChar, String(topicId))
        .input('poll', sql.NVarChar, updatedPollStr)
        .query(`
          UPDATE dbo.Bulletins
          SET poll = @poll,
              isPinned = 0,
              pinnedUntil = NULL
          WHERE id = @id
        `);

      return res.json({ success: true, message: 'アンケートは締め切られました', poll: currentPoll });
    }

    res.json({ success: true, message: 'アンケートは締め切られました' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// コメント個別追加 API (POST /api/bulletins/:id/comments)
// ==========================================
router.post(['/bulletins/:id/comments', '/board/:id/comments', '/:id/comments'], async (req, res) => {
  try {
    const { id: commentId, author, authorId, content, createdAt, attachments } = req.body;
    const topicId = req.params.id;
    const pool = await getPool();
    if (pool) {
      await ensureBulletinTablesOnce(pool);
      const cid = commentId || `cm-${Date.now()}`;
      const aid = authorId || author?.id || 'u1';
      const dateVal = createdAt ? new Date(createdAt) : new Date();
      const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;

      await pool.request()
        .input('id', sql.VarChar, String(cid))
        .input('topicId', sql.VarChar, String(topicId))
        .input('authorId', sql.VarChar, String(aid))
        .input('content', sql.NVarChar, content || '')
        .input('createdAt', sql.DateTime2, dateVal)
        .input('attachments', sql.NVarChar, attachStr)
        .query(`
          IF EXISTS (SELECT 1 FROM dbo.BoardComments WHERE id = @id)
          BEGIN
            UPDATE dbo.BoardComments
            SET topicId = @topicId, bulletinId = @topicId, topic_id = @topicId,
                authorId = @authorId, author_id = @authorId,
                content = @content, createdAt = @createdAt, created_at = @createdAt,
                attachments = @attachments
            WHERE id = @id
          END
          ELSE
          BEGIN
            INSERT INTO dbo.BoardComments (id, topicId, bulletinId, topic_id, authorId, author_id, content, createdAt, created_at, attachments)
            VALUES (@id, @topicId, @topicId, @topicId, @authorId, @authorId, @content, @createdAt, @createdAt, @attachments)
          END
        `);
    }
    res.status(201).json({ success: true, message: 'コメント投稿完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// コメント個別削除 API (DELETE /api/bulletins/:topicId/comments/:commentId 等)
// ==========================================
router.delete([
  '/bulletins/:topicId/comments/:commentId',
  '/board/:topicId/comments/:commentId',
  '/bulletins/comments/:commentId',
  '/board/comments/:commentId',
  '/comments/:commentId',
  '/:topicId/comments/:commentId'
], async (req, res) => {
  try {
    const commentId = req.params.commentId || req.params.id;
    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('id', sql.VarChar, String(commentId))
        .query('DELETE FROM dbo.BoardComments WHERE id = @id');
    }
    res.json({ success: true, message: 'コメント削除完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 閲覧者（足跡）追加 API (POST /api/bulletins/:id/viewers)
// ==========================================
router.post(['/bulletins/:id/viewers', '/topics/:id/viewers', '/board/:id/viewers', '/:id/viewers'], async (req, res) => {
  try {
    const { userId, user_id, user, viewedAt, viewed_at } = req.body;
    const topicId = req.params.id;
    const pool = await getPool();
    const uid = userId || user_id || user?.id || (typeof user === 'string' ? user : null);
    if (!uid) {
      return res.status(400).json({ error: 'ユーザーIDが必要です' });
    }
    const dateVal = viewedAt || viewed_at ? new Date(viewedAt || viewed_at) : new Date();

    if (pool) {
      await ensureBulletinTablesOnce(pool);
      await pool.request()
        .input('topicId', sql.VarChar, String(topicId))
        .input('userId', sql.VarChar, String(uid))
        .input('viewedAt', sql.DateTime, dateVal)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.BoardViewers WHERE (topicId = @topicId OR bulletinId = @topicId) AND userId = @userId)
          BEGIN
            INSERT INTO dbo.BoardViewers (topicId, bulletinId, userId, viewedAt)
            VALUES (@topicId, @topicId, @userId, @viewedAt);

            UPDATE dbo.Bulletins
            SET views = ISNULL(views, 0) + 1
            WHERE id = @topicId;
          END
        `);
    }
    res.status(200).json({ success: true, message: '閲覧情報記録完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 掲示板トピック削除 API (DELETE /api/bulletins/:id)
// ==========================================
router.delete(['/bulletins/:id', '/board/:id', '/:id'], async (req, res) => {
  try {
    const id = req.params.id;
    const pool = await getPool();
    if (pool) {
      await pool.request().input('id', sql.VarChar, String(id)).query('DELETE FROM dbo.Bulletins WHERE id = @id');
      await pool.request().input('topicId', sql.VarChar, String(id)).query('DELETE FROM dbo.BoardComments WHERE topicId = @topicId OR topic_id = @topicId OR bulletinId = @topicId');
      await pool.request().input('topicId', sql.VarChar, String(id)).query('DELETE FROM dbo.BoardViewers WHERE topicId = @topicId OR bulletinId = @topicId');
    }
    res.json({ success: true, message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
