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
      const stat = fs.statSync(filePath);
      if (stat.isDirectory()) return null;
      return {
        name: filename,
        rawFilename: filename,
        url: `/bulletinsfiles/${encodeURIComponent(filename)}`,
        size: stat.size,
        mtime: stat.mtime.toISOString(),
        isDirectory: false
      };
    }).filter(Boolean);
    res.json(result);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ==========================================
// 掲示板トピック一覧取得 (GET /api/bulletins & /api/board)
// ==========================================
router.get(['/bulletins', '/bulletins/', '/board', '/board/'], async (req, res) => {
  try {
    const pool = await getPool();
    
    // カラム安全保障（hasPeriod, startDate, endDate 等の動的作成）
    try {
      await pool.request().query(`
        IF COL_LENGTH('dbo.Bulletins', 'hasPeriod') IS NULL ALTER TABLE dbo.Bulletins ADD hasPeriod BIT NULL DEFAULT 0;
        IF COL_LENGTH('dbo.Bulletins', 'startDate') IS NULL ALTER TABLE dbo.Bulletins ADD startDate VARCHAR(20) NULL;
        IF COL_LENGTH('dbo.Bulletins', 'endDate') IS NULL ALTER TABLE dbo.Bulletins ADD endDate VARCHAR(20) NULL;
        IF COL_LENGTH('dbo.Bulletins', 'office') IS NULL ALTER TABLE dbo.Bulletins ADD office NVARCHAR(100) NULL;
        IF COL_LENGTH('dbo.Bulletins', 'division') IS NULL ALTER TABLE dbo.Bulletins ADD division NVARCHAR(100) NULL;
        IF COL_LENGTH('dbo.Bulletins', 'scope') IS NULL ALTER TABLE dbo.Bulletins ADD scope NVARCHAR(50) DEFAULT N'全社';
        IF COL_LENGTH('dbo.Bulletins', 'tags') IS NULL ALTER TABLE dbo.Bulletins ADD tags NVARCHAR(500) NULL;
        IF COL_LENGTH('dbo.Bulletins', 'attachments') IS NULL ALTER TABLE dbo.Bulletins ADD attachments NVARCHAR(MAX) NULL;
      `);
    } catch (_) {}

    // ① トピック本体
    const result = await pool.request().query(`
      SELECT b.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
      FROM dbo.Bulletins b
      LEFT JOIN dbo.Users u ON b.authorId = u.id
      ORDER BY b.isPinned DESC, b.createdAt DESC
    `);
    const bulletins = result.recordset || [];

    // ② コメント
    const commentsResult = await pool.request().query(`
      SELECT c.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
      FROM dbo.BoardComments c
      LEFT JOIN dbo.Users u ON c.authorId = u.id
      ORDER BY c.createdAt ASC
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
    const formatted = bulletins.map(row => {
      const topicComments = allComments
        .filter(c => String(c.topicId) === String(row.id) || String(c.topic_id) === String(row.id) || String(c.bulletinId) === String(row.id))
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
        .filter(v => String(v.topicId) === String(row.id) || String(v.topic_id) === String(row.id) || String(v.bulletinId) === String(row.id))
        .map(v => ({
          viewedAt: v.viewedAt || v.viewed_at || new Date(),
          user: {
            id: v.userId || v.user_id,
            name: v.userName || '不明',
            department: v.userDepartment || '',
            avatarUrl: v.userAvatarUrl || ''
          }
        }));

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
        isPinned: !!row.isPinned,
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
    const { title, content, category, authorId, isPinned, office, division, scope, tags, attachments, hasPeriod, startDate, endDate } = req.body;
    const pool = await getPool();
    const id = req.body.id || `b-${Date.now()}`;

    try {
      await pool.request().query(`
        IF COL_LENGTH('dbo.Bulletins', 'hasPeriod') IS NULL ALTER TABLE dbo.Bulletins ADD hasPeriod BIT NULL DEFAULT 0;
        IF COL_LENGTH('dbo.Bulletins', 'startDate') IS NULL ALTER TABLE dbo.Bulletins ADD startDate VARCHAR(20) NULL;
        IF COL_LENGTH('dbo.Bulletins', 'endDate') IS NULL ALTER TABLE dbo.Bulletins ADD endDate VARCHAR(20) NULL;
      `);
    } catch (_) {}

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '')
      .input('content', sql.NVarChar, content || '')
      .input('category', sql.NVarChar, category || 'general')
      .input('authorId', sql.VarChar, authorId || 'u1')
      .input('isPinned', sql.Bit, isPinned ? 1 : 0)
      .input('office', sql.NVarChar, office || '全社')
      .input('division', sql.NVarChar, division || '全部署')
      .input('scope', sql.NVarChar, scope || '全社')
      .input('tags', sql.NVarChar, Array.isArray(tags) ? tags.join(',') : (tags || ''))
      .input('hasPeriod', sql.Bit, hasPeriod ? 1 : 0)
      .input('startDate', sql.VarChar, startDate || null)
      .input('endDate', sql.VarChar, endDate || null)
      .input('attachments', sql.NVarChar, attachments ? JSON.stringify(attachments) : null)
      .query(`
        INSERT INTO dbo.Bulletins (id, title, content, category, authorId, isPinned, office, division, scope, tags, attachments, hasPeriod, startDate, endDate, createdAt, views, likes)
        VALUES (@id, @title, @content, @category, @authorId, @isPinned, @office, @division, @scope, @tags, @attachments, @hasPeriod, @startDate, @endDate, GETDATE(), 0, 0)
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
    const { title, content, category, isPinned, office, division, scope, tags, attachments, hasPeriod, startDate, endDate } = req.body;
    const pool = await getPool();

    try {
      await pool.request().query(`
        IF COL_LENGTH('dbo.Bulletins', 'hasPeriod') IS NULL ALTER TABLE dbo.Bulletins ADD hasPeriod BIT NULL DEFAULT 0;
        IF COL_LENGTH('dbo.Bulletins', 'startDate') IS NULL ALTER TABLE dbo.Bulletins ADD startDate VARCHAR(20) NULL;
        IF COL_LENGTH('dbo.Bulletins', 'endDate') IS NULL ALTER TABLE dbo.Bulletins ADD endDate VARCHAR(20) NULL;
      `);
    } catch (_) {}

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '')
      .input('content', sql.NVarChar, content || '')
      .input('category', sql.NVarChar, category || 'general')
      .input('isPinned', sql.Bit, isPinned ? 1 : 0)
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
    const cid = commentId || `cm-${Date.now()}`;
    const aid = authorId || author?.id || 'u1';
    const dateVal = createdAt ? new Date(createdAt) : new Date();
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;

    await pool.request()
      .input('id', sql.VarChar, cid)
      .input('topicId', sql.VarChar, String(topicId))
      .input('authorId', sql.VarChar, String(aid))
      .input('content', sql.NVarChar, content || '')
      .input('createdAt', sql.DateTime, dateVal)
      .input('attachments', sql.NVarChar, attachStr)
      .query(`
        INSERT INTO dbo.BoardComments (id, topicId, authorId, content, createdAt, attachments)
        VALUES (@id, @topicId, @authorId, @content, @createdAt, @attachments)
      `);
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
    await pool.request()
      .input('id', sql.VarChar, String(commentId))
      .query('DELETE FROM dbo.BoardComments WHERE id = @id');
    res.json({ success: true, message: 'コメント削除完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 閲覧者（足跡）追加 API (POST /api/bulletins/:id/viewers)
// ==========================================
router.post(['/bulletins/:id/viewers', '/topics/:id/viewers', '/board/:id/viewers'], async (req, res) => {
  try {
    const { userId, user_id, viewedAt, viewed_at } = req.body;
    const topicId = req.params.id;
    const pool = await getPool();
    const uid = userId || user_id || 'u1';
    const dateVal = viewedAt || viewed_at ? new Date(viewedAt || viewed_at) : new Date();

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
    await pool.request().input('id', sql.VarChar, String(id)).query('DELETE FROM dbo.Bulletins WHERE id = @id');
    await pool.request().input('topicId', sql.VarChar, String(id)).query('DELETE FROM dbo.BoardComments WHERE topicId = @topicId');
    await pool.request().input('topicId', sql.VarChar, String(id)).query('DELETE FROM dbo.BoardViewers WHERE topicId = @topicId');
    res.json({ success: true, message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

export default router;
