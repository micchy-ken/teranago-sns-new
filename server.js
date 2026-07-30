const express = require('express');
const cors = require('cors');
const sql = require('mssql');
require('dotenv').config();

const app = express();
app.use(cors({ origin: '*' }));
app.use(express.json());

// SQL Server Connection Configuration
const dbConfig = {
  user: process.env.DB_USER || 'sa',
  password: process.env.DB_PASSWORD || 'TE!rana%go2361',
  server: process.env.DB_HOST || '192.168.24.50',
  port: parseInt(process.env.DB_PORT || '1433'),
  database: process.env.DB_NAME || 'CompanySNSDB',
  options: {
    encrypt: process.env.DB_ENCRYPT === 'true',
    trustServerCertificate: true
  },
  pool: { max: 10, min: 0, idleTimeoutMillis: 30000 }
};

let globalPool = null;
async function getPool() {
  if (globalPool && globalPool.connected) return globalPool;
  try {
    globalPool = await sql.connect(dbConfig);
    console.log('✅ Connected to MS SQL Server successfully.');
    return globalPool;
  } catch (err) {
    globalPool = null;
    console.error('❌ Database connection error:', err.message);
    throw err;
  }
}
getPool().catch(() => {});

// --- API Endpoints ---

app.get('/api/health', (req, res) => res.json({ status: 'ok', timestamp: new Date() }));

// ------------------------------------------
// 1. Masters (Offices, Divisions, Positions)
// ------------------------------------------
app.get('/api/masters/offices', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`SELECT * FROM dbo.Offices`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/masters/divisions', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`SELECT * FROM dbo.Divisions`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/masters/positions', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`SELECT * FROM dbo.Positions`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 2. Users (ユーザー情報)
// ------------------------------------------
app.get('/api/users', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`SELECT * FROM dbo.Users`;
    res.json(result.recordset || []);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/users', async (req, res) => {
  try {
    const u = req.body;
    const pool = await getPool();
    const userId = u.id || `u-${Date.now()}`;
    const check = await pool.request().input('id', sql.VarChar, userId).query`SELECT id FROM dbo.Users WHERE id = @id`;
    
    if (check.recordset.length > 0) {
      await pool.request()
        .input('id', sql.VarChar, userId)
        .input('name', sql.NVarChar, u.name || '')
        .input('department', sql.NVarChar, u.department || '')
        .input('office', sql.NVarChar, u.office || '')
        .input('division', sql.NVarChar, u.division || '')
        .input('position', sql.NVarChar, u.position || '')
        .input('role', sql.VarChar, u.role || 'user')
        .input('isAdmin', sql.Bit, u.isAdmin ? 1 : 0)
        .input('avatarUrl', sql.NVarChar, u.avatarUrl || '')
        .input('supervisorId', sql.VarChar, u.supervisorId || null)
        .query`
          UPDATE dbo.Users 
          SET name = @name, department = @department, office = @office, 
              division = @division, position = @position, role = @role, 
              isAdmin = @isAdmin, avatarUrl = @avatarUrl, supervisorId = @supervisorId
          WHERE id = @id
        `;
    } else {
      await pool.request()
        .input('id', sql.VarChar, userId)
        .input('loginId', sql.VarChar, u.loginId || u.id || userId)
        .input('password', sql.VarChar, u.password || 'password')
        .input('name', sql.NVarChar, u.name || '')
        .input('department', sql.NVarChar, u.department || '')
        .input('office', sql.NVarChar, u.office || '')
        .input('division', sql.NVarChar, u.division || '')
        .input('position', sql.NVarChar, u.position || '')
        .input('role', sql.VarChar, u.role || 'user')
        .input('isAdmin', sql.Bit, u.isAdmin ? 1 : 0)
        .input('avatarUrl', sql.NVarChar, u.avatarUrl || '')
        .input('supervisorId', sql.VarChar, u.supervisorId || null)
        .query`
          INSERT INTO dbo.Users (id, loginId, password, name, department, office, division, position, role, isAdmin, avatarUrl, supervisorId)
          VALUES (@id, @loginId, @password, @name, @department, @office, @division, @position, @role, @isAdmin, @avatarUrl, @supervisorId)
        `;
    }
    res.json({ id: userId, message: 'ユーザー保存成功' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/users/:id', async (req, res) => {
  req.body.id = req.params.id;
  app._router.handle({ ...req, method: 'POST', url: '/api/users' }, res);
});

// ------------------------------------------
// 3. Timeline / Posts (タイムライン投稿)
// ------------------------------------------
app.get('/api/posts', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`
      SELECT p.*, 
             u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl, u.office AS authorOffice, u.division AS authorDivision
      FROM dbo.Posts p
      LEFT JOIN dbo.Users u ON p.authorId = u.id
      ORDER BY p.createdAt DESC
    `;
    
    let tagsMap = {};
    try {
      const tagsResult = await pool.request().query`SELECT postId, tag FROM dbo.PostTags`;
      (tagsResult.recordset || []).forEach(row => {
        if (!tagsMap[row.postId]) tagsMap[row.postId] = [];
        tagsMap[row.postId].push(row.tag);
      });
    } catch (_) {}

    const posts = (result.recordset || []).map(row => {
      let tags = tagsMap[row.id] || [];
      if (tags.length === 0 && row.tags) {
        tags = typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()) : row.tags;
      }
      return {
        id: String(row.id),
        author: {
          id: row.authorId,
          name: row.authorName || '不明',
          department: row.authorDepartment || '',
          avatarUrl: row.authorAvatarUrl || '',
          office: row.authorOffice || '',
          division: row.authorDivision || ''
        },
        authorId: row.authorId,
        content: row.content,
        tags: tags,
        createdAt: row.createdAt,
        likes: row.likes || 0,
        isLiked: row.isLiked ? true : false,
        nasLink: row.nasLink || null
      };
    });
    res.json(posts);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/posts', async (req, res) => {
  try {
    const { authorId, content, tags, nasLink } = req.body;
    const pool = await getPool();
    const id = req.body.id || `p-${Date.now()}`;
    const tagStr = Array.isArray(tags) ? tags.join(',') : (tags || '');

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('authorId', sql.VarChar, authorId || 'u1')
      .input('content', sql.NVarChar, content || '')
      .input('tags', sql.NVarChar, tagStr)
      .input('nasLink', sql.NVarChar, nasLink || null)
      .query`
        INSERT INTO dbo.Posts (id, authorId, content, createdAt, likes, isLiked, nasLink, tags) 
        VALUES (@id, @authorId, @content, GETDATE(), 0, 0, @nasLink, @tags)
      `;

    if (Array.isArray(tags)) {
      for (const t of tags) {
        if (t) {
          try {
            await pool.request()
              .input('postId', sql.VarChar, String(id))
              .input('tag', sql.NVarChar, t)
              .query`INSERT INTO dbo.PostTags (postId, tag) VALUES (@postId, @tag)`;
          } catch (_) {}
        }
      }
    }
    res.status(201).json({ id, message: '投稿完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/posts/:id/like', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query`UPDATE dbo.Posts SET likes = likes + 1, isLiked = 1 WHERE id = @id`;
    res.json({ message: 'いいね完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/posts/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query`DELETE FROM dbo.Posts WHERE id = @id`;
    try {
      await pool.request().input('postId', sql.VarChar, String(req.params.id)).query`DELETE FROM dbo.PostTags WHERE postId = @postId`;
    } catch (_) {}
    res.json({ message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 4. Calendar / Events (カレンダー行事)
// ------------------------------------------
app.get('/api/events', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`SELECT * FROM dbo.Events ORDER BY startAt ASC`;
    const events = (result.recordset || []).map(row => ({
      id: String(row.id),
      title: row.title,
      startAt: row.startAt,
      endAt: row.endAt,
      isAllDay: row.isAllDay ? true : false,
      category: row.category || 'general',
      description: row.description || '',
      location: row.location || '',
      office: row.office || '',
      division: row.division || ''
    }));
    res.json(events);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/events', async (req, res) => {
  try {
    const { title, startAt, endAt, isAllDay, category, description, location, office, division, attendees, memo } = req.body;
    const pool = await getPool();
    const id = req.body.id || `e-${Date.now()}`;
    
    let descValue = description;
    if (typeof descValue === 'object') {
      descValue = JSON.stringify(descValue);
    } else if (!descValue && (attendees || memo)) {
      descValue = JSON.stringify({ attendees: attendees || [], memo: memo || '' });
    }

    const parseDate = (val, fallback) => {
      if (!val) return fallback;
      const d = new Date(val);
      return isNaN(d.getTime()) ? fallback : d;
    };

    const validStart = parseDate(startAt, new Date());
    const validEnd = parseDate(endAt, validStart);

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '予定')
      .input('startAt', sql.DateTime2, validStart)
      .input('endAt', sql.DateTime2, validEnd)
      .input('isAllDay', sql.Bit, isAllDay ? 1 : 0)
      .input('category', sql.NVarChar, category || 'general')
      .input('description', sql.NVarChar, descValue || '')
      .input('location', sql.NVarChar, location || '')
      .input('office', sql.NVarChar, office || '')
      .input('division', sql.NVarChar, division || '')
      .query`
        INSERT INTO dbo.Events (id, title, startAt, endAt, isAllDay, category, description, location, office, division) 
        VALUES (@id, @title, @startAt, @endAt, @isAllDay, @category, @description, @location, @office, @division)
      `;
    res.status(201).json({ id, message: '予定登録完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/events/:id', async (req, res) => {
  try {
    const { title, startAt, endAt, isAllDay, category, description, location, office, division, attendees, memo } = req.body;
    const pool = await getPool();
    const id = req.params.id;

    let descValue = description;
    if (typeof descValue === 'object') {
      descValue = JSON.stringify(descValue);
    } else if (!descValue && (attendees || memo)) {
      descValue = JSON.stringify({ attendees: attendees || [], memo: memo || '' });
    }

    const parseDate = (val, fallback) => {
      if (!val) return fallback;
      const d = new Date(val);
      return isNaN(d.getTime()) ? fallback : d;
    };

    const validStart = parseDate(startAt, new Date());
    const validEnd = parseDate(endAt, validStart);

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '予定')
      .input('startAt', sql.DateTime2, validStart)
      .input('endAt', sql.DateTime2, validEnd)
      .input('isAllDay', sql.Bit, isAllDay ? 1 : 0)
      .input('category', sql.NVarChar, category || 'general')
      .input('description', sql.NVarChar, descValue || '')
      .input('location', sql.NVarChar, location || '')
      .input('office', sql.NVarChar, office || '')
      .input('division', sql.NVarChar, division || '')
      .query`
        UPDATE dbo.Events 
        SET title = @title, startAt = @startAt, endAt = @endAt, isAllDay = @isAllDay, 
            category = @category, description = @description, location = @location, 
            office = @office, division = @division
        WHERE id = @id
      `;
    res.json({ message: '予定更新完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/events/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query`DELETE FROM dbo.Events WHERE id = @id`;
    res.json({ message: '削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 5. Workflows (電子決裁・申請)
// ------------------------------------------
app.get('/api/workflows', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`
      SELECT w.*, u.name AS applicantName, u.department AS applicantDepartment, u.avatarUrl AS applicantAvatarUrl
      FROM dbo.Workflows w
      LEFT JOIN dbo.Users u ON w.applicantId = u.id
      ORDER BY w.createdAt DESC
    `;
    const list = (result.recordset || []).map(row => ({
      id: String(row.id),
      title: row.title,
      applicantId: row.applicantId,
      applicant: {
        id: row.applicantId,
        name: row.applicantName || '不明',
        department: row.applicantDepartment || '',
        avatarUrl: row.applicantAvatarUrl || ''
      },
      approverId: row.approverId,
      status: row.status,
      createdAt: row.createdAt,
      category: row.category,
      details: row.details
    }));
    res.json(list);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/workflows', async (req, res) => {
  try {
    const { title, description, applicantId, approverId, status, category, details } = req.body;
    const pool = await getPool();
    const id = req.body.id || `w-${Date.now()}`;
    const detailsStr = typeof details === 'object' ? JSON.stringify(details) : (details || '');
    const workflowCategory = category || 'general';

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title || '無題の申請')
      .input('description', sql.NVarChar, description || title || '')
      .input('applicantId', sql.VarChar, applicantId || 'u1')
      .input('approverId', sql.VarChar, approverId || null)
      .input('status', sql.NVarChar, status || '承認待ち')
      .input('category', sql.NVarChar, workflowCategory)
      .input('type', sql.NVarChar, workflowCategory)
      .input('details', sql.NVarChar, detailsStr)
      .query`
        INSERT INTO dbo.Workflows (id, title, description, applicantId, approverId, status, createdAt, category, type, details) 
        VALUES (@id, @title, @description, @applicantId, @approverId, @status, GETDATE(), @category, @type, @details)
      `;
    res.status(201).json({ id, message: '申請完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/workflows/:id', async (req, res) => {
  try {
    const { status, approverId, details } = req.body;
    const pool = await getPool();
    const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null;

    let queryStr = `UPDATE dbo.Workflows SET status = @status`;
    if (approverId) queryStr += `, approverId = @approverId`;
    if (detailsStr) queryStr += `, details = @details`;
    queryStr += ` WHERE id = @id`;

    const reqObj = pool.request()
      .input('id', sql.VarChar, String(req.params.id))
      .input('status', sql.NVarChar, status);
    if (approverId) reqObj.input('approverId', sql.VarChar, approverId);
    if (detailsStr) reqObj.input('details', sql.NVarChar, detailsStr);

    await reqObj.query(queryStr);
    res.json({ message: '更新完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 6. Bulletins / Board (社内掲示板)
// ------------------------------------------
const handleGetBulletins = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`
      SELECT b.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
      FROM dbo.Bulletins b
      LEFT JOIN dbo.Users u ON b.authorId = u.id
      ORDER BY b.isPinned DESC, b.createdAt DESC
    `;
    const bulletins = (result.recordset || []).map(row => {
      let tags = [];
      if (row.tags) {
        tags = typeof row.tags === 'string' ? row.tags.split(',').map(t => t.trim()) : row.tags;
      }
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
        office: row.office || '',
        division: row.division || '',
        scope: row.scope || '全社',
        tags: tags,
        isPinned: row.isPinned ? true : false,
        attachments: row.attachments ? (typeof row.attachments === 'string' ? JSON.parse(row.attachments) : row.attachments) : []
      };
    });
    res.json(bulletins);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

app.get('/api/bulletins', handleGetBulletins);
app.get('/api/topics', handleGetBulletins);

const handlePostBulletin = async (req, res) => {
  try {
    const { title, content, authorId, category, isPinned, office, division, scope, tags, attachments } = req.body;
    const pool = await getPool();
    const id = req.body.id || `b-${Date.now()}`;
    const tagStr = Array.isArray(tags) ? tags.join(',') : (tags || '');
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;
    const contentStr = typeof content === 'object' ? JSON.stringify(content) : (content || '');

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('title', sql.NVarChar, title)
      .input('content', sql.NVarChar, contentStr)
      .input('authorId', sql.VarChar, authorId || 'u1')
      .input('category', sql.NVarChar, category || '')
      .input('isPinned', sql.Bit, isPinned ? 1 : 0)
      .input('office', sql.NVarChar, office || '')
      .input('division', sql.NVarChar, division || '')
      .input('scope', sql.NVarChar, scope || '全社')
      .input('tags', sql.NVarChar, tagStr)
      .input('attachments', sql.NVarChar, attachStr)
      .query`
        INSERT INTO dbo.Bulletins (id, title, content, authorId, createdAt, category, isPinned, views, likes, office, division, scope, tags, attachments)
        VALUES (@id, @title, @content, @authorId, GETDATE(), @category, @isPinned, 0, 0, @office, @division, @scope, @tags, @attachments)
      `;
    res.status(201).json({ id, message: '掲示板投稿完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

app.post('/api/bulletins', handlePostBulletin);
app.post('/api/topics', handlePostBulletin);

// ------------------------------------------
// 7. Chats (社内チャット・メッセージ)
// ------------------------------------------
app.get('/api/chats', async (req, res) => {
  try {
    const pool = await getPool();
    const roomsResult = await pool.request().query`SELECT * FROM dbo.ChatRooms ORDER BY updatedAt DESC`;
    const msgsResult = await pool.request().query`
      SELECT m.*, u.name AS senderName, u.avatarUrl AS senderAvatar, u.department AS senderDepartment
      FROM dbo.ChatMessages m
      LEFT JOIN dbo.Users u ON m.senderId = u.id
      ORDER BY m.createdAt ASC
    `;

    const rooms = (roomsResult.recordset || []).map(r => ({
      id: String(r.id),
      name: r.name,
      type: r.type,
      avatarUrl: r.avatarUrl || null,
      lastMessage: r.lastMessage || '',
      updatedAt: r.updatedAt,
      messages: (msgsResult.recordset || [])
        .filter(m => String(m.roomId) === String(r.id))
        .map(m => ({
          id: String(m.id),
          roomId: String(m.roomId),
          sender: {
            id: m.senderId,
            name: m.senderName || '不明',
            avatarUrl: m.senderAvatar || '',
            department: m.senderDepartment || ''
          },
          content: m.message,
          createdAt: m.createdAt
        }))
    }));
    res.json(rooms);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.get('/api/chats/rooms', async (req, res) => {
  app._router.handle({ ...req, method: 'GET', url: '/api/chats' }, res);
});

const handlePostChatMessage = async (req, res) => {
  try {
    const { senderId, roomId, message, content } = req.body;
    const msgContent = message || content || '';
    const pool = await getPool();
    const id = req.body.id || `c-${Date.now()}`;
    const targetRoomId = roomId || 'r1';

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('senderId', sql.VarChar, senderId || 'u1')
      .input('roomId', sql.VarChar, String(targetRoomId))
      .input('message', sql.NVarChar, msgContent)
      .input('content', sql.NVarChar, msgContent)
      .query`
        INSERT INTO dbo.ChatMessages (id, senderId, roomId, message, content, createdAt) 
        VALUES (@id, @senderId, @roomId, @message, @content, GETDATE())
      `;

    await pool.request()
      .input('roomId', sql.VarChar, String(targetRoomId))
      .input('lastMessage', sql.NVarChar, msgContent)
      .query`
        UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE(), last_updated = GETDATE() WHERE id = @roomId
      `;

    res.status(201).json({ id, message: 'メッセージ送信完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

app.post('/api/chats', handlePostChatMessage);
app.post('/api/chats/message', handlePostChatMessage);

// ------------------------------------------
// 8. Memos (伝言メモ)
// ------------------------------------------
app.get('/api/memos', async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`
      SELECT m.*, 
             uSender.name AS senderName, uSender.department AS senderDepartment, uSender.avatarUrl AS senderAvatarUrl,
             uReceiver.name AS receiverName
      FROM dbo.Memos m
      LEFT JOIN dbo.Users uSender ON m.senderId = uSender.id
      LEFT JOIN dbo.Users uReceiver ON m.receiverId = uReceiver.id
      ORDER BY m.createdAt DESC
    `;
    const memos = (result.recordset || []).map(row => ({
      id: String(row.id),
      senderId: row.senderId,
      sender: {
        id: row.senderId,
        name: row.senderName || row.fromName || '不詳',
        department: row.senderDepartment || '',
        avatarUrl: row.senderAvatarUrl || ''
      },
      receiverId: row.receiverId,
      toUserId: row.receiverId,
      toUserName: row.receiverName || '',
      content: row.content,
      isRead: row.isRead ? true : false,
      fromName: row.fromName || '',
      fromCompany: row.fromCompany || '',
      fromPhone: row.fromPhone || '',
      createdAt: row.createdAt,
      details: row.details ? (typeof row.details === 'string' ? JSON.parse(row.details) : row.details) : null
    }));
    res.json(memos);
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.post('/api/memos', async (req, res) => {
  try {
    const { senderId, receiverId, toUserId, content, fromName, fromCompany, fromPhone, requirementType, requirementText, details } = req.body;
    const pool = await getPool();
    const id = req.body.id || `memo-${Date.now()}`;
    const targetReceiver = receiverId || toUserId || 'u1';
    const reqType = requirementType || (details && details.requirementType) || 'phone_called';
    const reqText = requirementText || (details && details.requirementText) || '電話がありました';
    const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null;
    const toUsersJson = JSON.stringify([targetReceiver]);

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('senderId', sql.VarChar, senderId || 'u1')
      .input('receiverId', sql.VarChar, targetReceiver)
      .input('content', sql.NVarChar, content || '')
      .input('fromName', sql.NVarChar, fromName || '')
      .input('fromCompany', sql.NVarChar, fromCompany || '')
      .input('fromPhone', sql.NVarChar, fromPhone || '')
      .input('requirementType', sql.NVarChar, reqType)
      .input('requirementText', sql.NVarChar, reqText)
      .input('details', sql.NVarChar, detailsStr)
      .input('toUsersJson', sql.NVarChar, toUsersJson)
      .query`
        INSERT INTO dbo.Memos (id, senderId, receiverId, content, isRead, createdAt, fromName, fromCompany, fromPhone, requirementType, requirementText, details, toUsersJson) 
        VALUES (@id, @senderId, @receiverId, @content, 0, GETDATE(), @fromName, @fromCompany, @fromPhone, @requirementType, @requirementText, @details, @toUsersJson)
      `;
    res.status(201).json({ id, message: '伝言メモ作成完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/memos/:id/read', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query`UPDATE dbo.Memos SET isRead = 1 WHERE id = @id`;
    res.json({ message: '既読状態更新完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.put('/api/memos/:id', async (req, res) => {
  try {
    const { isRead, details, status } = req.body;
    const pool = await getPool();
    const detailsStr = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null;
    
    let queryStr = `UPDATE dbo.Memos SET `;
    const updates = [];
    if (isRead !== undefined) updates.push(`isRead = @isRead`);
    if (detailsStr !== null) updates.push(`details = @details`);
    if (status !== undefined) updates.push(`status = @status`);
    
    if (updates.length === 0) {
      return res.json({ message: '更新対象なし' });
    }
    queryStr += updates.join(', ') + ` WHERE id = @id`;

    const reqObj = pool.request().input('id', sql.VarChar, String(req.params.id));
    if (isRead !== undefined) reqObj.input('isRead', sql.Bit, isRead ? 1 : 0);
    if (detailsStr !== null) reqObj.input('details', sql.NVarChar, detailsStr);
    if (status !== undefined) reqObj.input('status', sql.NVarChar, String(status));

    await reqObj.query(queryStr);
    res.json({ message: '伝言メモ更新完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

app.delete('/api/memos/:id', async (req, res) => {
  try {
    const pool = await getPool();
    await pool.request().input('id', sql.VarChar, String(req.params.id)).query`DELETE FROM dbo.Memos WHERE id = @id`;
    res.json({ message: '伝言メモ削除完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
});

// ------------------------------------------
// 9. Daily Reports (日報)
// ------------------------------------------
const handleGetDailyReports = async (req, res) => {
  try {
    const pool = await getPool();
    const result = await pool.request().query`
      SELECT r.*, u.name AS authorName, u.department AS authorDepartment, u.avatarUrl AS authorAvatarUrl
      FROM dbo.DailyReports r
      LEFT JOIN dbo.Users u ON r.authorId = u.id
      ORDER BY r.createdAt DESC
    `;
    const reports = (result.recordset || []).map(row => ({
      id: String(row.id),
      authorId: row.authorId,
      author: {
        id: row.authorId,
        name: row.authorName || '不明',
        department: row.authorDepartment || '',
        avatarUrl: row.authorAvatarUrl || ''
      },
      reportDate: row.reportDate,
      date: row.reportDate,
      content: row.content || '',
      tasks: row.tasks || row.content || '',
      results: row.results || '',
      issues: row.issues || '',
      tomorrowPlan: row.tomorrowPlan || '',
      createdAt: row.createdAt
    }));
    res.json(reports);
  } catch (err) { res.status(500).json({ error: err.message }); }
};

app.get('/api/daily-reports', handleGetDailyReports);
app.get('/api/reports', handleGetDailyReports);

const handlePostDailyReport = async (req, res) => {
  try {
    const { authorId, reportDate, content, tasks, results, issues, tomorrowPlan } = req.body;
    const pool = await getPool();
    const id = req.body.id || `r-${Date.now()}`;
    const formattedDate = reportDate ? new Date(reportDate) : new Date();

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('authorId', sql.VarChar, authorId || 'u1')
      .input('reportDate', sql.Date, formattedDate)
      .input('content', sql.NVarChar, content || tasks || '')
      .input('tasks', sql.NVarChar, tasks || '')
      .input('results', sql.NVarChar, results || '')
      .input('issues', sql.NVarChar, issues || '')
      .input('tomorrowPlan', sql.NVarChar, tomorrowPlan || '')
      .query`
        INSERT INTO dbo.DailyReports (id, authorId, reportDate, content, createdAt, tasks, results, issues, tomorrowPlan) 
        VALUES (@id, @authorId, @reportDate, @content, GETDATE(), @tasks, @results, @issues, @tomorrowPlan)
      `;
    res.status(201).json({ id, message: '日報作成完了' });
  } catch (err) { res.status(500).json({ error: err.message }); }
};

app.post('/api/daily-reports', handlePostDailyReport);
app.post('/api/reports', handlePostDailyReport);

// Listen on configured port
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`🚀 Company SNS API server listening on port ${PORT}`));
