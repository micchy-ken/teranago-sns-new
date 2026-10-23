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

router.get(['/bulletinsfiles/list', '/bulletins/files/list'], (req, res) => {
  try {
    if (!fs.existsSync(bulletinsFilesDir)) return res.json([]);
    const filenames = fs.readdirSync(bulletinsFilesDir);
    const result = filenames.map(filename => {
      const filePath = path.join(bulletinsFilesDir, filename);
      let stat;
      try {
        stat = fs.statSync(filePath);
      } catch (e) {
        return null;
      }
      if (stat.isDirectory()) return null;
      const ext = path.extname(filename).toLowerCase().replace('.', '');
      return {
        name: filename,
        rawFilename: filename,
        path: filename,
        url: `/bulletinsfiles/${encodeURIComponent(filename)}`,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        isDirectory: false,
        extension: ext,
        source: 'bulletin'
      };
    }).filter(Boolean);
    result.sort((a, b) => new Date(b.mtime).getTime() - new Date(a.mtime).getTime());
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// DBテーブル・カラム安全性自動初期化関数
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
          tags NVARCHAR(500) NULL,
          isPinned BIT NULL DEFAULT 0,
          pinnedUntil VARCHAR(40) NULL,
          hasPeriod BIT NULL DEFAULT 0,
          startDate VARCHAR(20) NULL,
          endDate VARCHAR(20) NULL,
          attachments NVARCHAR(MAX) NULL
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

      IF COL_LENGTH('dbo.BoardComments', 'bulletinId') IS NULL ALTER TABLE dbo.BoardComments ADD bulletinId VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'topicId') IS NULL ALTER TABLE dbo.BoardComments ADD topicId VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'topic_id') IS NULL ALTER TABLE dbo.BoardComments ADD topic_id VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'authorId') IS NULL ALTER TABLE dbo.BoardComments ADD authorId VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'author_id') IS NULL ALTER TABLE dbo.BoardComments ADD author_id VARCHAR(50) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'attachments') IS NULL ALTER TABLE dbo.BoardComments ADD attachments NVARCHAR(MAX) NULL;
      IF COL_LENGTH('dbo.BoardComments', 'created_at') IS NULL ALTER TABLE dbo.BoardComments ADD created_at DATETIME2 NULL;
    `);

    // 旧環境での NOT NULL 制約の緩和（エラー発生時も続行）
    try {
      await pool.request().query(`
        ALTER TABLE dbo.BoardComments ALTER COLUMN authorId VARCHAR(50) NULL;
        ALTER TABLE dbo.BoardComments ALTER COLUMN author_id VARCHAR(50) NULL;
        ALTER TABLE dbo.BoardComments ALTER COLUMN topicId VARCHAR(50) NULL;
        ALTER TABLE dbo.BoardComments ALTER COLUMN topic_id VARCHAR(50) NULL;
        ALTER TABLE dbo.BoardComments ALTER COLUMN bulletinId VARCHAR(50) NULL;
      `);
    } catch (_) {}
  } catch (e) {
    console.warn('[routes/bulletins] ensureBulletinTables warning:', e.message);
  }
}

// ==========================================
// 掲示板トピック一覧取得 (GET /api/bulletins & /api/board)
// ==========================================
router.get(['/bulletins', '/bulletins/', '/board', '/board/'], async (req, res) => {
  try {
    const pool = await getPool();
    if (pool) {
      await ensureBulletinTables(pool);

      // 期限が切れたピン留めの自動解除（DB側同期）
      try {
        await pool.request().query(`
          UPDATE dbo.Bulletins
          SET isPinned = 0
          WHERE isPinned = 1 
            AND pinnedUntil IS NOT NULL 
            AND pinnedUntil != '' 
            AND TRY_CAST(pinnedUntil AS DATETIMEOFFSET) <= GETDATE();
        `);
      } catch (_) {}
    }

    // ① トピック本体（有効なピン留め優先、作成日時降順）
    const result = await pool.request().query(`
      SELECT b.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
      FROM dbo.Bulletins b
      LEFT JOIN dbo.Users u ON b.authorId = u.id
      ORDER BY b.isPinned DESC, b.createdAt DESC
    `);
    const bulletins = result.recordset || [];

    // ② コメント（新旧カラム互換対応）
    const commentsResult = await pool.request().query(`
      SELECT c.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
      FROM dbo.BoardComments c
      LEFT JOIN dbo.Users u ON COALESCE(NULLIF(c.authorId, ''), NULLIF(c.author_id, '')) = u.id
      ORDER BY COALESCE(c.createdAt, c.created_at) ASC
    `);
    const allComments = commentsResult.recordset || [];

    // ③ 閲覧者（足跡）
    const viewersResult = await pool.request().query(`
      SELECT v.*, u.name AS userName, u.department AS userDepartment, u.avatarUrl AS userAvatarUrl
      FROM dbo.BoardViewers v
      LEFT JOIN dbo.Users u ON v.userId = u.id
    `);
    const allViewers = viewersResult.recordset || [];

    // マージ処理
    const nowMs = Date.now();
    const formatted = bulletins.map(row => {
      const topicComments = allComments
        .filter(c => {
          const tid = String(c.topicId || c.topic_id || c.bulletinId || '');
          return tid === String(row.id);
        })
        .map(c => ({
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

      const topicViewers = allViewers
        .filter(v => {
          const vid = String(v.topicId || v.topic_id || v.bulletinId || '');
          return vid === String(row.id);
        })
        .map(v => ({
          viewedAt: v.viewedAt || v.viewed_at || new Date(),
          user: {
            id: v.userId || v.user_id,
            name: v.userName || '不明',
            department: v.userDepartment || '',
            avatarUrl: v.userAvatarUrl || ''
          }
        }));

      // ピン留め期限判定（期限切れの場合は即座に isPinned = false）
      const isCurrentlyPinned = !!row.isPinned && (!row.pinnedUntil || new Date(row.pinnedUntil).getTime() > nowMs);

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
        views: topicViewers.length || row.views || 0,
        likes: row.likes || 0,
        office: row.office || '全社',
        division: row.division || '全部署',
        scope: row.scope || '全社',
        tags: row.tags ? (typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()).filter(Boolean) : row.tags) : [],
        isPinned: isCurrentlyPinned,
        pinnedUntil: row.pinnedUntil || null,
        pinnedDuration: row.pinnedDuration || (row.pinnedUntil ? undefined : (isCurrentlyPinned ? 'forever' : undefined)),
        hasPeriod: !!row.hasPeriod,
        startDate: row.startDate || '',
        endDate: row.endDate || '',
        attachments: safeParseJSON(row.attachments, []),
        comments: topicComments,
        viewers: topicViewers,
        commentsCount: topicComments.length
      };
    });

    res.json(formatted);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 掲示板トピック新規作成 (POST /api/bulletins & /api/board)
// ==========================================
router.post(['/bulletins', '/bulletins/', '/board', '/board/'], async (req, res) => {
  try {
    const { title, content, category, authorId, isPinned, office, division, scope, tags, attachments, hasPeriod, startDate, endDate, pinnedUntil } = req.body;
    const pool = await getPool();
    const id = req.body.id || `b-${Date.now()}`;

    if (pool) {
      await ensureBulletinTables(pool);
    }

    const finalPinned = isPinned ? 1 : 0;
    const finalPinnedUntil = isPinned ? (pinnedUntil || null) : null;

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '')
      .input('content', sql.NVarChar, content || '')
      .input('category', sql.NVarChar, category || 'general')
      .input('authorId', sql.VarChar, authorId || 'u1')
      .input('isPinned', sql.Bit, finalPinned)
      .input('pinnedUntil', sql.VarChar, finalPinnedUntil)
      .input('office', sql.NVarChar, office || '全社')
      .input('division', sql.NVarChar, division || '全部署')
      .input('scope', sql.NVarChar, scope || '全社')
      .input('tags', sql.NVarChar, Array.isArray(tags) ? tags.join(',') : (tags || ''))
      .input('hasPeriod', sql.Bit, hasPeriod ? 1 : 0)
      .input('startDate', sql.VarChar, startDate || null)
      .input('endDate', sql.VarChar, endDate || null)
      .input('attachments', sql.NVarChar, attachments ? JSON.stringify(attachments) : null)
      .query(`
        INSERT INTO dbo.Bulletins (id, title, content, category, authorId, isPinned, pinnedUntil, office, division, scope, tags, attachments, hasPeriod, startDate, endDate, createdAt, views, likes)
        VALUES (@id, @title, @content, @category, @authorId, @isPinned, @pinnedUntil, @office, @division, @scope, @tags, @attachments, @hasPeriod, @startDate, @endDate, GETDATE(), 0, 0)
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
    const { title, content, category, isPinned, office, division, scope, tags, attachments, hasPeriod, startDate, endDate, pinnedUntil } = req.body;
    const pool = await getPool();

    if (pool) {
      await ensureBulletinTables(pool);
    }

    const finalPinned = isPinned ? 1 : 0;
    const finalPinnedUntil = isPinned ? (pinnedUntil || null) : null;

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '')
      .input('content', sql.NVarChar, content || '')
      .input('category', sql.NVarChar, category || 'general')
      .input('isPinned', sql.Bit, finalPinned)
      .input('pinnedUntil', sql.VarChar, finalPinnedUntil)
      .input('office', sql.NVarChar, office || '全社')
      .input('division', sql.NVarChar, division || '全部署')
      .input('scope', sql.NVarChar, scope || '全社')
      .input('tags', sql.NVarChar, Array.isArray(tags) ? tags.join(',') : (tags || ''))
      .input('hasPeriod', sql.Bit, hasPeriod ? 1 : 0)
      .input('startDate', sql.VarChar, startDate || null)
      .input('endDate', sql.VarChar, endDate || null)
      .input('attachments', sql.NVarChar, attachments ? JSON.stringify(attachments) : null)
      .query(`
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
          tags = @tags,
          attachments = @attachments,
          hasPeriod = @hasPeriod,
          startDate = @startDate,
          endDate = @endDate
        WHERE id = @id
      `);

    // 閲覧者の更新
    if (Array.isArray(req.body.viewers) && req.body.viewers.length > 0) {
      for (const v of req.body.viewers) {
        const uid = v?.user?.id || v?.userId || v?.user_id || (typeof v?.user === 'string' ? v?.user : null);
        if (uid) {
          const dateVal = v.viewedAt || v.viewed_at ? new Date(v.viewedAt || v.viewed_at) : new Date();
          try {
            await pool.request()
              .input('topicId', sql.VarChar, String(id))
              .input('userId', sql.VarChar, String(uid))
              .input('viewedAt', sql.DateTime, dateVal)
              .query(`
                IF NOT EXISTS (SELECT 1 FROM dbo.BoardViewers WHERE topicId = @topicId AND userId = @userId)
                BEGIN
                  INSERT INTO dbo.BoardViewers (topicId, userId, viewedAt)
                  VALUES (@topicId, @userId, @viewedAt)
                END
              `);
          } catch (_) {}
        }
      }
    }

    // コメント配列のアップサート（PUT経由でも確実に保存）
    if (Array.isArray(req.body.comments) && req.body.comments.length > 0) {
      for (const c of req.body.comments) {
        const cid = c.id || `cm-${Date.now()}`;
        const aid = c.authorId || c.author?.id || 'u1';
        const dateVal = c.createdAt ? new Date(c.createdAt) : new Date();
        const attachStr = c.attachments ? (typeof c.attachments === 'object' ? JSON.stringify(c.attachments) : c.attachments) : null;
        try {
          await pool.request()
            .input('id', sql.VarChar, String(cid))
            .input('topicId', sql.VarChar, String(id))
            .input('authorId', sql.VarChar, String(aid))
            .input('content', sql.NVarChar, c.content || '')
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
        } catch (_) {}
      }
    }

    res.json({ success: true, message: '掲示板トピック更新完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// コメント個別追加 API (POST /api/bulletins/:id/comments)
// ==========================================
router.post(['/bulletins/:id/comments', '/board/:id/comments'], async (req, res) => {
  try {
    const { id: commentId, author, authorId, content, createdAt, attachments } = req.body;
    const topicId = req.params.id;
    const pool = await getPool();
    if (pool) {
      await ensureBulletinTables(pool);
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
  '/comments/:commentId'
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
      await pool.request()
        .input('topicId', sql.VarChar, String(topicId))
        .input('userId', sql.VarChar, String(uid))
        .input('viewedAt', sql.DateTime, dateVal)
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.BoardViewers WHERE topicId = @topicId AND userId = @userId)
          BEGIN
            INSERT INTO dbo.BoardViewers (topicId, userId, viewedAt)
            VALUES (@topicId, @userId, @viewedAt)
          END
        `);
    }
    res.status(200).json({ success: true, message: '閲覧情報記録完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 掲示板トピック削除 API (DELETE /api/bulletins/:id)
// ==========================================
router.delete(['/bulletins/:id', '/board/:id'], async (req, res) => {
  try {
    const id = req.params.id;
    const pool = await getPool();
    if (pool) {
      await pool.request().input('id', sql.VarChar, String(id)).query('DELETE FROM dbo.Bulletins WHERE id = @id');
      await pool.request().input('topicId', sql.VarChar, String(id)).query('DELETE FROM dbo.BoardComments WHERE topicId = @topicId OR topic_id = @topicId OR bulletinId = @topicId');
      await pool.request().input('topicId', sql.VarChar, String(id)).query('DELETE FROM dbo.BoardViewers WHERE topicId = @topicId OR topic_id = @topicId OR bulletinId = @topicId');
    }
    res.json({ success: true, message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
