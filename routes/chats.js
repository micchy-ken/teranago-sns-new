import { Router } from 'express';
import sql from 'mssql';
import { getPool } from '../db.js';
import { safeParseJSON as configSafeParse } from '../config.js';

const router = Router();

// 安全なJSONパースヘルパー
function safeParseJSON(str, fallback = null) {
  if (typeof configSafeParse === 'function') {
    return configSafeParse(str, fallback);
  }
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

// チャットルーム一覧 & 各メッセージの閲覧者(viewers)マージ取得
router.get(['/chats', '/chats/rooms', '/', '/rooms'], async (req, res) => {
  try {
    const pool = await getPool();
    if (!pool) return res.json([]);

    const roomsResult = await pool.request().query('SELECT * FROM dbo.ChatRooms ORDER BY updatedAt DESC');
    const msgsResult = await pool.request().query(`
      SELECT m.*, u.name AS senderName, u.avatarUrl AS senderAvatar, u.department AS senderDepartment
      FROM dbo.ChatMessages m
      LEFT JOIN dbo.Users u ON m.senderId = u.id
      ORDER BY m.createdAt ASC
    `);

    const rooms = (roomsResult.recordset || []).map(r => {
      const participants = safeParseJSON(r.participantsJson || r.participants, []);
      const adminIds = safeParseJSON(r.adminIdsJson || r.adminIds, []);
      const isoUpdatedAt = r.updatedAt ? new Date(r.updatedAt).toISOString() : new Date().toISOString();

      return {
        id: String(r.id),
        name: r.name,
        type: r.type,
        avatarUrl: r.avatarUrl || null,
        lastMessage: r.lastMessage || '',
        updatedAt: isoUpdatedAt,
        lastUpdated: isoUpdatedAt,
        participants: participants,
        adminIds: adminIds,
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
            content: m.message || m.content || '',
            createdAt: m.createdAt ? new Date(m.createdAt).toISOString() : new Date().toISOString(),
            type: m.type || 'text',
            imageUrl: m.imageUrl || null,
            stampId: m.stampId || null,
            stampText: m.stampText || null,
            stampCategory: m.stampCategory || null,
            attachments: safeParseJSON(m.attachments || m.attachmentsJson, []),
            viewers: safeParseJSON(m.viewersJson || m.viewers, [])
          }))
      };
    });
    res.json(rooms);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 新規チャットルーム作成
router.post(['/chats/rooms', '/chats/room', '/rooms', '/room'], async (req, res) => {
  try {
    const { id, name, type, avatarUrl, participants, adminIds } = req.body;
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    const roomId = id || `c_${Date.now()}`;
    const roomName = name || (type === 'dm' ? 'ダイレクトトーク' : 'グループトーク');
    const roomType = type || 'group';
    const participantsStr = participants ? (typeof participants === 'object' ? JSON.stringify(participants) : participants) : '[]';
    const adminIdsStr = adminIds ? (typeof adminIds === 'object' ? JSON.stringify(adminIds) : adminIds) : '[]';

    const columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ChatRooms' AND TABLE_SCHEMA = 'dbo'");
    const dbColumns = (columnsRes.recordset || []).map(row => row.COLUMN_NAME);

    const insertCols = ['id', 'name', 'type', 'avatarUrl', 'lastMessage', 'updatedAt'];
    const insertVals = ['@id', '@name', '@type', '@avatarUrl', "''", 'GETDATE()'];

    if (dbColumns.includes('last_updated')) {
      insertCols.push('last_updated');
      insertVals.push('GETDATE()');
    }

    const request = pool.request()
      .input('id', sql.VarChar, roomId)
      .input('name', sql.NVarChar, roomName)
      .input('type', sql.NVarChar, roomType)
      .input('avatarUrl', sql.VarChar, avatarUrl || null);

    if (participants !== undefined) {
      const colName = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (colName) {
        insertCols.push(colName);
        insertVals.push('@participantsJson');
        request.input('participantsJson', sql.NVarChar, participantsStr);
      }
    }

    if (adminIds !== undefined) {
      const colName = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (colName) {
        insertCols.push(colName);
        insertVals.push('@adminIdsJson');
        request.input('adminIdsJson', sql.NVarChar, adminIdsStr);
      }
    }

    await request.query(`INSERT INTO dbo.ChatRooms (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')})`);
    res.status(201).json({ success: true, id: roomId, message: 'チャットルーム作成完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// メッセージ送信
router.post(['/chats', '/chats/message', '/', '/message'], async (req, res) => {
  try {
    const { senderId, roomId, message, content, attachments, roomName, roomType, participants, type, imageUrl, stampId, stampText, stampCategory, adminIds } = req.body;
    const msgContent = message || content || '';
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    const id = req.body.id || `c-${Date.now()}`;
    const targetRoomId = roomId || 'r1';
    const attachStr = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;
    const msgType = type || 'text';

    // ルームが存在しない場合の自動作成
    const roomCheck = await pool.request()
      .input('roomId', sql.VarChar, String(targetRoomId))
      .query('SELECT 1 FROM dbo.ChatRooms WHERE id = @roomId');

    if ((roomCheck.recordset || []).length === 0) {
      const rName = roomName || (roomType === 'dm' ? 'ダイレクトトーク' : '新規グループトーク');
      const rType = roomType || 'group';
      const participantsStr = participants ? (typeof participants === 'object' ? JSON.stringify(participants) : participants) : '[]';
      const admins = adminIds ? (Array.isArray(adminIds) ? adminIds : [adminIds]) : (rType === 'group' && senderId ? [senderId] : []);
      const adminIdsStr = JSON.stringify(admins);

      const columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ChatRooms' AND TABLE_SCHEMA = 'dbo'");
      const dbColumns = (columnsRes.recordset || []).map(row => row.COLUMN_NAME);

      const insertCols = ['id', 'name', 'type', 'lastMessage', 'updatedAt'];
      const insertVals = ['@roomId', '@name', '@type', "''", 'GETDATE()'];

      if (dbColumns.includes('last_updated')) {
        insertCols.push('last_updated');
        insertVals.push('GETDATE()');
      }

      const request = pool.request()
        .input('roomId', sql.VarChar, String(targetRoomId))
        .input('name', sql.NVarChar, rName)
        .input('type', sql.NVarChar, rType);

      const partCol = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (partCol) {
        insertCols.push(partCol);
        insertVals.push('@participantsJson');
        request.input('participantsJson', sql.NVarChar, participantsStr);
      }

      const adminCol = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (adminCol) {
        insertCols.push(adminCol);
        insertVals.push('@adminIdsJson');
        request.input('adminIdsJson', sql.NVarChar, adminIdsStr);
      }

      await request.query(`INSERT INTO dbo.ChatRooms (${insertCols.join(', ')}) VALUES (${insertVals.join(', ')})`);
    }

    // 送信者を初期既読者に追加
    let initialViewers = [];
    if (senderId) {
      const userRes = await pool.request()
        .input('userId', sql.VarChar, senderId)
        .query('SELECT id, name, avatarUrl, department FROM dbo.Users WHERE id = @userId');
      if (userRes.recordset && userRes.recordset.length > 0) {
        const u = userRes.recordset[0];
        initialViewers.push({
          user: { id: u.id, name: u.name, avatarUrl: u.avatarUrl || '', department: u.department || '' },
          viewedAt: new Date().toISOString()
        });
      }
    }
    const viewersStr = JSON.stringify(initialViewers);

    await pool.request()
      .input('id', sql.VarChar, String(id))
      .input('senderId', sql.VarChar, senderId || 'u1')
      .input('roomId', sql.VarChar, String(targetRoomId))
      .input('message', sql.NVarChar, msgContent)
      .input('content', sql.NVarChar, msgContent)
      .input('attachments', sql.NVarChar, attachStr)
      .input('type', sql.VarChar, msgType)
      .input('imageUrl', sql.NVarChar, imageUrl || null)
      .input('stampId', sql.VarChar, stampId || null)
      .input('stampText', sql.NVarChar, stampText || null)
      .input('stampCategory', sql.NVarChar, stampCategory || null)
      .input('viewersJson', sql.NVarChar, viewersStr)
      .query(`
        INSERT INTO dbo.ChatMessages (id, senderId, roomId, message, content, createdAt, attachments, type, imageUrl, stampId, stampText, stampCategory, viewersJson) 
        VALUES (@id, @senderId, @roomId, @message, @content, GETDATE(), @attachments, @type, @imageUrl, @stampId, @stampText, @stampCategory, @viewersJson)
      `);

    await pool.request()
      .input('roomId', sql.VarChar, String(targetRoomId))
      .input('lastMessage', sql.NVarChar, msgContent)
      .query(`
        IF COL_LENGTH('dbo.ChatRooms', 'last_updated') IS NOT NULL
          UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE(), last_updated = GETDATE() WHERE id = @roomId
        ELSE
          UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE() WHERE id = @roomId
      `);

    res.status(201).json({ id, message: 'メッセージ送信完了' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// メッセージ既読追加 API
router.post(['/chats/messages/:messageId/viewers', '/messages/:messageId/viewers'], async (req, res) => {
  const { messageId } = req.params;
  const { user } = req.body;
  if (!user || !user.id) return res.status(400).json({ success: false, error: 'User is required' });
  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    const result = await pool.request()
      .input('messageId', sql.VarChar, messageId)
      .query('SELECT viewersJson FROM dbo.ChatMessages WHERE id = @messageId');
    
    if (result.recordset && result.recordset.length > 0) {
      const currentViewers = safeParseJSON(result.recordset[0].viewersJson, []);
      const alreadyExists = currentViewers.some(v => v.user && String(v.user.id) === String(user.id));
      if (!alreadyExists) {
        const newViewers = [...currentViewers, { user, viewedAt: new Date().toISOString() }];
        await pool.request()
          .input('messageId', sql.VarChar, messageId)
          .input('viewersJson', sql.NVarChar, JSON.stringify(newViewers))
          .query('UPDATE dbo.ChatMessages SET viewersJson = @viewersJson WHERE id = @messageId');
        return res.status(200).json({ success: true, viewers: newViewers });
      }
      return res.status(200).json({ success: true, viewers: currentViewers, message: 'Already marked as read' });
    } else {
      return res.status(404).json({ success: false, error: 'Message not found' });
    }
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// チャットルーム更新
router.put(['/chats/:roomId', '/:roomId'], async (req, res) => {
  const { roomId } = req.params;
  const { name, participants, adminIds } = req.body;
  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    const columnsRes = await pool.request().query("SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_NAME = 'ChatRooms' AND TABLE_SCHEMA = 'dbo'");
    const dbColumns = (columnsRes.recordset || []).map(row => row.COLUMN_NAME);

    let query = 'UPDATE dbo.ChatRooms SET updatedAt = GETDATE()';
    if (dbColumns.includes('last_updated')) {
      query += ', last_updated = GETDATE()';
    }
    const request = pool.request().input('roomId', sql.VarChar, roomId);
    
    if (name !== undefined) {
      query += ', name = @name';
      request.input('name', sql.NVarChar, name);
    }
    if (participants !== undefined) {
      const colName = dbColumns.includes('participantsJson') ? 'participantsJson' : (dbColumns.includes('participants') ? 'participants' : null);
      if (colName) {
        query += `, ${colName} = @participantsJson`;
        request.input('participantsJson', sql.NVarChar, JSON.stringify(participants));
      }
    }
    if (adminIds !== undefined) {
      const colName = dbColumns.includes('adminIdsJson') ? 'adminIdsJson' : (dbColumns.includes('adminIds') ? 'adminIds' : null);
      if (colName) {
        query += `, ${colName} = @adminIdsJson`;
        request.input('adminIdsJson', sql.NVarChar, JSON.stringify(adminIds));
      }
    }
    query += ' WHERE id = @roomId';
    await request.query(query);
    res.status(200).json({ success: true, message: 'チャットルーム情報を更新しました。' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// チャットルーム削除
router.delete(['/chats/:roomId', '/:roomId'], async (req, res) => {
  const { roomId } = req.params;
  try {
    const pool = await getPool(); 
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    await pool.request().input('roomId', sql.VarChar, roomId).query('DELETE FROM dbo.ChatMessages WHERE roomId = @roomId');
    await pool.request().input('roomId', sql.VarChar, roomId).query('DELETE FROM dbo.ChatRooms WHERE id = @roomId');
    await pool.request().input('roomId', sql.VarChar, roomId).query("DELETE FROM dbo.UserReadStatuses WHERE targetType = 'chat' AND targetId = @roomId");
    res.status(200).json({ success: true, message: 'チャットルームとメッセージを削除しました。' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 個別メッセージ削除
router.delete(['/chats/messages/:messageId', '/messages/:messageId'], async (req, res) => {
  const { messageId } = req.params;
  try {
    const pool = await getPool();
    if (!pool) return res.status(500).json({ success: false, error: 'DB接続が利用できません' });

    const msgResult = await pool.request().input('messageId', sql.VarChar, messageId).query('SELECT roomId FROM dbo.ChatMessages WHERE id = @messageId');
    if (msgResult.recordset && msgResult.recordset.length > 0) {
      const roomId = msgResult.recordset[0].roomId;
      await pool.request().input('messageId', sql.VarChar, messageId).query('DELETE FROM dbo.ChatMessages WHERE id = @messageId');
      const latestResult = await pool.request().input('roomId', sql.VarChar, roomId).query('SELECT TOP 1 message FROM dbo.ChatMessages WHERE roomId = @roomId ORDER BY createdAt DESC');
      const lastMsg = (latestResult.recordset && latestResult.recordset.length > 0) ? latestResult.recordset[0].message : '';
      await pool.request()
        .input('roomId', sql.VarChar, roomId)
        .input('lastMessage', sql.NVarChar, lastMsg)
        .query(`
          IF COL_LENGTH('dbo.ChatRooms', 'last_updated') IS NOT NULL
            UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE(), last_updated = GETDATE() WHERE id = @roomId
          ELSE
            UPDATE dbo.ChatRooms SET lastMessage = @lastMessage, updatedAt = GETDATE() WHERE id = @roomId
        `);
    }
    res.status(200).json({ success: true, message: 'メッセージを削除しました。' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
