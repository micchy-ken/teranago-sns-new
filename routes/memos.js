/**
 * routes/memos.js (本番環境・MS SQL Server & 伝言メモ & 受領者別対応ステータス管理 & コメント機能[公開・非公開] 完全修正版)
 * 寺岡オートドアSNS / 寺子屋SNS 伝言メモ管理モジュール
 * 
 * 最終更新: 2026年10月22日 (ロックフリー非閉塞DB接続・コメント機能[公開・非公開/宛先担当者閲覧]・ルーター干渉完全防止版)
 */
import { Router } from 'express';
import sql from 'mssql';
import { getPool } from '../db.js';

const router = Router();

// 安全なJSONパースヘルパー
function safeParseJSON(str, fallback = null) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

// テーブルスキーマ自動補正（ロック防止・個別TRY-CATCH付きSQL実行）
let schemaChecked = false;
async function ensureMemosSchema(pool) {
  if (schemaChecked || !pool) return;
  try {
    await pool.request().query(`
      IF OBJECT_ID('dbo.Memos', 'U') IS NOT NULL
      BEGIN
        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'details') IS NULL ALTER TABLE dbo.Memos ADD details NVARCHAR(MAX) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'toUsersJson') IS NULL ALTER TABLE dbo.Memos ADD toUsersJson NVARCHAR(MAX) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'requirementType') IS NULL ALTER TABLE dbo.Memos ADD requirementType NVARCHAR(50) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'requirementText') IS NULL ALTER TABLE dbo.Memos ADD requirementText NVARCHAR(200) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'recipientStatusesJson') IS NULL ALTER TABLE dbo.Memos ADD recipientStatusesJson NVARCHAR(MAX) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'status') IS NULL ALTER TABLE dbo.Memos ADD status NVARCHAR(50) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'fromName') IS NULL ALTER TABLE dbo.Memos ADD fromName NVARCHAR(100) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'fromCompany') IS NULL ALTER TABLE dbo.Memos ADD fromCompany NVARCHAR(100) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'fromPhone') IS NULL ALTER TABLE dbo.Memos ADD fromPhone NVARCHAR(50) NULL;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'isRead') IS NULL ALTER TABLE dbo.Memos ADD isRead BIT DEFAULT 0;
        END TRY BEGIN CATCH END CATCH;

        BEGIN TRY
          IF COL_LENGTH('dbo.Memos', 'commentsJson') IS NULL ALTER TABLE dbo.Memos ADD commentsJson NVARCHAR(MAX) NULL;
        END TRY BEGIN CATCH END CATCH;
      END
    `);
    schemaChecked = true;
  } catch (err) {
    console.warn('[Memos Schema Warning]:', err.message);
  }
}

// ==========================================
// 1. 伝言メモ一覧取得 API
// 対応URL: GET /api/memos, /memos, /
// ==========================================
router.get(['/memos', '/memos/', '/'], async (req, res) => {
  try {
    const pool = await getPool();
    if (pool) {
      await ensureMemosSchema(pool);

      const result = await pool.request().query(`
        SELECT m.*, 
               uSender.name AS senderName, uSender.department AS senderDepartment, uSender.avatarUrl AS senderAvatarUrl,
               uReceiver.name AS receiverName
        FROM dbo.Memos m
        LEFT JOIN dbo.Users uSender ON m.senderId = uSender.id
        LEFT JOIN dbo.Users uReceiver ON m.receiverId = uReceiver.id
        ORDER BY m.createdAt DESC
      `);

      const memos = (result.recordset || []).map(row => {
        let detailsObj = {};
        if (row.details) {
          detailsObj = safeParseJSON(row.details, {});
        } else if (row.content && typeof row.content === 'string' && row.content.trim().startsWith('{')) {
          detailsObj = safeParseJSON(row.content, {});
        }

        // recipientStatuses の抽出・正規化
        let parsedRecipientStatuses = null;
        const repSource = row.recipientStatusesJson || row.recipient_statuses_json || row.recipientStatuses || detailsObj.recipientStatuses || detailsObj.recipientStatusesJson;
        if (repSource) {
          const parsed = safeParseJSON(repSource, null);
          if (Array.isArray(parsed)) {
            parsedRecipientStatuses = parsed;
          } else if (parsed && typeof parsed === 'object') {
            parsedRecipientStatuses = Object.entries(parsed).map(([uid, val]) => ({
              userId: uid,
              userName: val.userName || val.name || '担当者',
              avatarUrl: val.avatarUrl || '',
              department: val.department || '',
              office: val.office || '',
              division: val.division || '',
              isViewed: !!(val.isRead || val.isViewed),
              viewedAt: val.readAt || val.viewedAt || undefined,
              isHandled: val.isHandled !== undefined ? !!val.isHandled : !!(val.isRead || val.isViewed),
              handledAt: val.handledAt || undefined,
              handledByUserId: val.handledByUserId || undefined,
              handledByUserName: val.handledByUserName || undefined
            }));
          }
        }

        // デフォルトの recipientStatus
        if (!parsedRecipientStatuses || parsedRecipientStatuses.length === 0) {
          const defaultUser = {
            userId: row.receiverId || row.toUserId || 'u1',
            userName: row.receiverName || '担当者',
            avatarUrl: '',
            department: '',
            office: '',
            division: '',
            isViewed: !!row.isRead,
            isHandled: row.status === 'handled' || detailsObj.status === 'handled' || !!row.isRead
          };
          parsedRecipientStatuses = [defaultUser];
        }

        // 全体の status 判定
        const allHandled = parsedRecipientStatuses.length > 0 && parsedRecipientStatuses.every(s => s.isHandled);
        const anyViewed = parsedRecipientStatuses.some(s => s.isViewed || s.isHandled);
        const effectiveStatus = row.status || detailsObj.status || (allHandled ? 'handled' : (anyViewed || row.isRead ? 'read' : 'unread'));

        const recipientStatusesJsonStr = JSON.stringify(parsedRecipientStatuses);

        // コメント一覧の抽出・正規化
        let parsedComments = safeParseJSON(row.commentsJson || detailsObj.comments || detailsObj.commentsJson, []);
        if (!Array.isArray(parsedComments)) {
          parsedComments = [];
        }
        const commentsJsonStr = JSON.stringify(parsedComments);

        return {
          id: String(row.id),
          senderId: row.senderId,
          sender: {
            id: row.senderId,
            name: row.senderName || row.fromName || detailsObj.fromName || '不詳',
            department: row.senderDepartment || '',
            avatarUrl: row.senderAvatarUrl || ''
          },
          receiverId: row.receiverId,
          toUserId: row.receiverId,
          toUserName: row.receiverName || '',
          content: row.content || detailsObj.content || '',
          isRead: !!(row.isRead || allHandled || effectiveStatus === 'handled'),
          fromName: row.fromName || detailsObj.fromName || '',
          fromCompany: row.fromCompany || detailsObj.fromCompany || '',
          fromPhone: row.fromPhone || detailsObj.fromPhone || '',
          createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : new Date().toISOString(),
          requirementType: row.requirementType || detailsObj.requirementType || 'phone_called',
          requirementText: row.requirementText || detailsObj.requirementText || '',
          status: effectiveStatus,
          recipientStatuses: parsedRecipientStatuses,
          recipientStatusesJson: recipientStatusesJsonStr,
          recipient_statuses_json: recipientStatusesJsonStr,
          comments: parsedComments,
          commentsJson: commentsJsonStr,
          details: {
            ...detailsObj,
            requirementType: row.requirementType || detailsObj.requirementType || 'phone_called',
            requirementText: row.requirementText || detailsObj.requirementText || '',
            targetOffices: detailsObj.targetOffices || [],
            targetDivisions: detailsObj.targetDivisions || [],
            recipientStatuses: parsedRecipientStatuses,
            status: effectiveStatus,
            comments: parsedComments
          },
          targetOffices: detailsObj.targetOffices || [],
          targetDivisions: detailsObj.targetDivisions || [],
          toUsers: detailsObj.toUsers || [],
          toUsersJson: row.toUsersJson || detailsObj.toUsersJson || ''
        };
      });

      return res.json(memos);
    }
    res.json([]);
  } catch (err) {
    console.error('Fetch memos error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. 伝言メモ単一取得 API
// 対応URL: GET /api/memos/:id, /memos/:id
// ==========================================
router.get(['/memos/:id', '/memos/:id/', '/:id'], async (req, res, next) => {
  const { id } = req.params;
  // 他の固定パス（read-statuses 等）への誤マッチ防止
  if (id === 'read-statuses' || id === 'comments' || id === 'health') {
    return next();
  }

  try {
    const pool = await getPool();
    if (pool) {
      await ensureMemosSchema(pool);

      const result = await pool.request()
        .input('id', sql.VarChar(100), String(id).trim())
        .query(`
          SELECT m.*, 
                 uSender.name AS senderName, uSender.department AS senderDepartment, uSender.avatarUrl AS senderAvatarUrl,
                 uReceiver.name AS receiverName
          FROM dbo.Memos m
          LEFT JOIN dbo.Users uSender ON m.senderId = uSender.id
          LEFT JOIN dbo.Users uReceiver ON m.receiverId = uReceiver.id
          WHERE m.id = @id
        `);

      if (result.recordset && result.recordset.length > 0) {
        const row = result.recordset[0];
        const detailsObj = safeParseJSON(row.details, {});
        const repSource = row.recipientStatusesJson || detailsObj.recipientStatuses || detailsObj.recipientStatusesJson;
        const parsedRecipientStatuses = safeParseJSON(repSource, []);
        let parsedComments = safeParseJSON(row.commentsJson || detailsObj.comments || detailsObj.commentsJson, []);
        if (!Array.isArray(parsedComments)) parsedComments = [];

        return res.json({
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
          isRead: !!row.isRead,
          fromName: row.fromName || '',
          fromCompany: row.fromCompany || '',
          fromPhone: row.fromPhone || '',
          createdAt: row.createdAt,
          requirementType: row.requirementType || detailsObj.requirementType || 'phone_called',
          requirementText: row.requirementText || detailsObj.requirementText || '',
          status: row.status || detailsObj.status || (row.isRead ? 'read' : 'unread'),
          recipientStatuses: parsedRecipientStatuses,
          recipientStatusesJson: JSON.stringify(parsedRecipientStatuses),
          comments: parsedComments,
          commentsJson: JSON.stringify(parsedComments),
          details: {
            ...detailsObj,
            comments: parsedComments
          }
        });
      }
      return res.status(404).json({ error: '伝言メモが見つかりません' });
    }
    res.status(404).json({ error: 'DB接続が利用できません' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. 伝言メモ新規作成 API
// 対応URL: POST /api/memos, /memos, /
// ==========================================
router.post(['/memos', '/memos/', '/'], async (req, res) => {
  try {
    const {
      senderId,
      receiverId,
      toUserId,
      content,
      fromName,
      fromCompany,
      fromPhone,
      requirementType = 'phone_called',
      requirementText = '電話がありました',
      details,
      status = 'unread',
      isRead = 0,
      recipientStatuses,
      recipientStatusesJson,
      recipient_statuses_json,
      toUsers,
      toUsersJson,
      targetOffices,
      targetDivisions,
      comments,
      commentsJson
    } = req.body || {};

    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    await ensureMemosSchema(pool);

    const id = req.body?.id || `memo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const targetReceiver = receiverId || toUserId || (toUsers && toUsers[0]?.id) || 'u1';

    // recipientStatuses の決定
    let finalStatuses = recipientStatuses;
    if (typeof finalStatuses === 'string') {
      finalStatuses = safeParseJSON(finalStatuses, null);
    }
    if (!finalStatuses && (recipientStatusesJson || recipient_statuses_json)) {
      finalStatuses = safeParseJSON(recipientStatusesJson || recipient_statuses_json, null);
    }
    if (!finalStatuses && details && details.recipientStatuses) {
      finalStatuses = details.recipientStatuses;
    }
    if (!finalStatuses && toUsers && Array.isArray(toUsers)) {
      finalStatuses = toUsers.map(u => ({
        userId: u.id,
        userName: u.name || '担当者',
        avatarUrl: u.avatarUrl || '',
        department: u.department || '',
        office: u.office || '',
        division: u.division || '',
        isViewed: false,
        isHandled: false
      }));
    }
    if (!finalStatuses || !Array.isArray(finalStatuses) || finalStatuses.length === 0) {
      finalStatuses = [{
        userId: targetReceiver,
        userName: '担当者',
        avatarUrl: '',
        department: '',
        office: '',
        division: '',
        isViewed: false,
        isHandled: false
      }];
    }

    const statusesJsonStr = JSON.stringify(finalStatuses);
    const toUsersJsonStr = toUsersJson ? (typeof toUsersJson === 'string' ? toUsersJson : JSON.stringify(toUsersJson)) : (toUsers ? JSON.stringify(toUsers) : null);

    let finalComments = comments;
    if (typeof finalComments === 'string') {
      finalComments = safeParseJSON(finalComments, []);
    }
    if (!finalComments && commentsJson) {
      finalComments = safeParseJSON(commentsJson, []);
    }
    if (!finalComments && details && details.comments) {
      finalComments = details.comments;
    }
    if (!Array.isArray(finalComments)) finalComments = [];
    const finalCommentsJsonStr = JSON.stringify(finalComments);

    const mergedDetails = {
      ...(details || {}),
      requirementType,
      requirementText,
      targetOffices: targetOffices || details?.targetOffices || [],
      targetDivisions: targetDivisions || details?.targetDivisions || [],
      recipientStatuses: finalStatuses,
      toUsers: toUsers || details?.toUsers || [],
      status: status || 'unread',
      comments: finalComments
    };

    const detailsJsonStr = JSON.stringify(mergedDetails);
    const effectiveIsRead = (isRead === 1 || isRead === true || status === 'handled') ? 1 : 0;

    await pool.request()
      .input('id', sql.VarChar(100), String(id))
      .input('senderId', sql.VarChar(100), String(senderId || 'u1'))
      .input('receiverId', sql.VarChar(100), String(targetReceiver))
      .input('content', sql.NVarChar(sql.MAX), content || '')
      .input('fromName', sql.NVarChar(100), fromName || '')
      .input('fromCompany', sql.NVarChar(100), fromCompany || '')
      .input('fromPhone', sql.NVarChar(50), fromPhone || '')
      .input('requirementType', sql.NVarChar(50), requirementType)
      .input('requirementText', sql.NVarChar(200), requirementText)
      .input('details', sql.NVarChar(sql.MAX), detailsJsonStr)
      .input('toUsersJson', sql.NVarChar(sql.MAX), toUsersJsonStr)
      .input('recipientStatusesJson', sql.NVarChar(sql.MAX), statusesJsonStr)
      .input('status', sql.NVarChar(50), status || 'unread')
      .input('isRead', sql.Bit, effectiveIsRead)
      .input('commentsJson', sql.NVarChar(sql.MAX), finalCommentsJsonStr)
      .query(`
        INSERT INTO dbo.Memos (
          id, senderId, receiverId, content, isRead, createdAt,
          fromName, fromCompany, fromPhone, requirementType, requirementText,
          details, toUsersJson, recipientStatusesJson, status, commentsJson
        )
        VALUES (
          @id, @senderId, @receiverId, @content, @isRead, GETDATE(),
          @fromName, @fromCompany, @fromPhone, @requirementType, @requirementText,
          @details, @toUsersJson, @recipientStatusesJson, @status, @commentsJson
        )
      `);

    res.status(201).json({
      id,
      success: true,
      message: '伝言メモ作成完了',
      memo: {
        id,
        senderId,
        receiverId: targetReceiver,
        content,
        fromName,
        fromCompany,
        fromPhone,
        requirementType,
        requirementText,
        status: status || 'unread',
        isRead: effectiveIsRead === 1,
        recipientStatuses: finalStatuses,
        recipientStatusesJson: statusesJsonStr,
        comments: finalComments,
        commentsJson: finalCommentsJsonStr,
        details: mergedDetails
      }
    });
  } catch (err) {
    console.error('Create memo error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. 伝言メモ更新 API (「対応完了」・ステータス更新)
// 対応URL: PUT / PATCH /api/memos/:id, /memos/:id
// ==========================================
async function handleUpdateMemo(req, res) {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    await ensureMemosSchema(pool);

    // 既存レコードの取得
    const currentRes = await pool.request()
      .input('id', sql.VarChar(100), String(id).trim())
      .query('SELECT * FROM dbo.Memos WHERE id = @id');

    if (!currentRes.recordset || currentRes.recordset.length === 0) {
      return res.status(404).json({ error: '対象の伝言メモが見つかりません' });
    }

    const current = currentRes.recordset[0];
    const currentDetails = safeParseJSON(current.details, {});

    const {
      isRead,
      status,
      recipientStatuses,
      recipientStatusesJson,
      recipient_statuses_json,
      details,
      requirementType,
      requirementText,
      content,
      fromName,
      fromCompany,
      fromPhone,
      comments,
      commentsJson
    } = req.body || {};

    // 受領者ステータスの抽出・正規化
    let updatedRecipientStatuses = recipientStatuses;
    if (typeof updatedRecipientStatuses === 'string') {
      updatedRecipientStatuses = safeParseJSON(updatedRecipientStatuses, null);
    }
    if (!updatedRecipientStatuses && (recipientStatusesJson || recipient_statuses_json)) {
      updatedRecipientStatuses = safeParseJSON(recipientStatusesJson || recipient_statuses_json, null);
    }
    if (!updatedRecipientStatuses && details && details.recipientStatuses) {
      updatedRecipientStatuses = details.recipientStatuses;
    }
    if (!updatedRecipientStatuses) {
      const existingRep = current.recipientStatusesJson || currentDetails.recipientStatuses;
      updatedRecipientStatuses = safeParseJSON(existingRep, []);
    }

    // コメントの抽出・更新
    let updatedComments = comments;
    if (typeof updatedComments === 'string') {
      updatedComments = safeParseJSON(updatedComments, null);
    }
    if (!updatedComments && commentsJson) {
      updatedComments = safeParseJSON(commentsJson, null);
    }
    if (!updatedComments && details && details.comments) {
      updatedComments = details.comments;
    }
    if (!updatedComments) {
      const existingComments = current.commentsJson || currentDetails.comments;
      updatedComments = safeParseJSON(existingComments, []);
    }
    if (!Array.isArray(updatedComments)) updatedComments = [];
    const updatedCommentsJsonStr = JSON.stringify(updatedComments);

    // 全員が対応完了しているかチェック
    const allHandled = Array.isArray(updatedRecipientStatuses) &&
      updatedRecipientStatuses.length > 0 &&
      updatedRecipientStatuses.every(s => s.isHandled);

    let nextStatus = status;
    if (!nextStatus) {
      if (allHandled) {
        nextStatus = 'handled';
      } else if (isRead === 1 || isRead === true) {
        nextStatus = 'read';
      } else {
        nextStatus = current.status || currentDetails.status || 'unread';
      }
    }

    const nextIsRead = (isRead === 1 || isRead === true || nextStatus === 'handled' || allHandled) ? 1 : 0;
    const nextStatusesJson = JSON.stringify(updatedRecipientStatuses || []);

    const mergedDetails = {
      ...currentDetails,
      ...(details || {}),
      status: nextStatus,
      recipientStatuses: updatedRecipientStatuses,
      requirementType: requirementType || details?.requirementType || current.requirementType || currentDetails.requirementType || 'phone_called',
      requirementText: requirementText || details?.requirementText || current.requirementText || currentDetails.requirementText || '',
      comments: updatedComments
    };
    const nextDetailsJson = JSON.stringify(mergedDetails);

    // SQL UPDATE 実行
    await pool.request()
      .input('id', sql.VarChar(100), String(id).trim())
      .input('isRead', sql.Bit, nextIsRead)
      .input('status', sql.NVarChar(50), nextStatus)
      .input('recipientStatusesJson', sql.NVarChar(sql.MAX), nextStatusesJson)
      .input('details', sql.NVarChar(sql.MAX), nextDetailsJson)
      .input('fromName', sql.NVarChar(100), fromName !== undefined ? fromName : current.fromName)
      .input('fromCompany', sql.NVarChar(100), fromCompany !== undefined ? fromCompany : current.fromCompany)
      .input('fromPhone', sql.NVarChar(50), fromPhone !== undefined ? fromPhone : current.fromPhone)
      .input('content', sql.NVarChar(sql.MAX), content !== undefined ? content : current.content)
      .input('commentsJson', sql.NVarChar(sql.MAX), updatedCommentsJsonStr)
      .query(`
        UPDATE dbo.Memos
        SET isRead = @isRead,
            status = @status,
            recipientStatusesJson = @recipientStatusesJson,
            details = @details,
            fromName = @fromName,
            fromCompany = @fromCompany,
            fromPhone = @fromPhone,
            content = @content,
            commentsJson = @commentsJson
        WHERE id = @id
      `);

    res.json({
      success: true,
      message: '伝言メモ更新完了',
      id: String(id),
      status: nextStatus,
      isRead: nextIsRead === 1,
      recipientStatuses: updatedRecipientStatuses,
      recipientStatusesJson: nextStatusesJson,
      comments: updatedComments,
      commentsJson: updatedCommentsJsonStr,
      details: mergedDetails
    });
  } catch (err) {
    console.error('Update memo error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.put(['/memos/:id', '/memos/:id/', '/:id'], handleUpdateMemo);
router.patch(['/memos/:id', '/memos/:id/', '/:id'], handleUpdateMemo);

// ==========================================
// 5. 伝言メモ既読・簡易対応完了 API
// 対応URL: PUT/POST /api/memos/:id/read, /memos/:id/read
// ==========================================
async function handleMarkRead(req, res) {
  try {
    const { id } = req.params;
    const { userId, isHandled } = req.body || {};
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    await ensureMemosSchema(pool);

    const nowIso = new Date().toISOString();

    const currentRes = await pool.request()
      .input('id', sql.VarChar(100), String(id).trim())
      .query('SELECT * FROM dbo.Memos WHERE id = @id');

    if (currentRes.recordset && currentRes.recordset.length > 0) {
      const current = currentRes.recordset[0];
      const currentDetails = safeParseJSON(current.details, {});
      let statuses = safeParseJSON(current.recipientStatusesJson || currentDetails.recipientStatuses, []);

      if (userId && Array.isArray(statuses)) {
        statuses = statuses.map(st => {
          if (st.userId === String(userId)) {
            return {
              ...st,
              isViewed: true,
              viewedAt: st.viewedAt || nowIso,
              isHandled: isHandled !== undefined ? !!isHandled : st.isHandled,
              handledAt: (isHandled || (isHandled === undefined && st.isHandled)) ? (st.handledAt || nowIso) : undefined
            };
          }
          return st;
        });
      }

      const allHandled = Array.isArray(statuses) && statuses.length > 0 && statuses.every(s => s.isHandled);
      const nextStatus = allHandled ? 'handled' : 'read';
      const statusesJson = JSON.stringify(statuses);
      const nextDetails = JSON.stringify({
        ...currentDetails,
        status: nextStatus,
        recipientStatuses: statuses
      });

      await pool.request()
        .input('id', sql.VarChar(100), String(id).trim())
        .input('isRead', sql.Bit, 1)
        .input('status', sql.NVarChar(50), nextStatus)
        .input('recipientStatusesJson', sql.NVarChar(sql.MAX), statusesJson)
        .input('details', sql.NVarChar(sql.MAX), nextDetails)
        .query(`
          UPDATE dbo.Memos
          SET isRead = @isRead,
              status = @status,
              recipientStatusesJson = @recipientStatusesJson,
              details = @details
          WHERE id = @id
        `);
    } else {
      await pool.request()
        .input('id', sql.VarChar(100), String(id).trim())
        .query('UPDATE dbo.Memos SET isRead = 1, status = \'read\' WHERE id = @id');
    }

    res.json({ success: true, message: '既読状態更新完了' });
  } catch (err) {
    console.error('Memo mark read error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.put(['/memos/:id/read', '/memos/:id/read/', '/:id/read'], handleMarkRead);
router.post(['/memos/:id/read', '/memos/:id/read/', '/:id/read'], handleMarkRead);

// ==========================================
// 6. 伝言メモコメント追加 API (★新機能: 公開・非公開対応★)
// 対応URL: POST /api/memos/:id/comments, /memos/:id/comments
// ==========================================
router.post([
  '/memos/:id/comments',
  '/memos/:id/comments/',
  '/:id/comments',
  '/:id/comments/'
], async (req, res) => {
  try {
    const { id } = req.params;
    const { content, isPrivate = false, author } = req.body || {};

    if (!content || !String(content).trim()) {
      return res.status(400).json({ error: 'コメント本文を入力してください' });
    }

    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    await ensureMemosSchema(pool);

    const currentRes = await pool.request()
      .input('id', sql.VarChar(100), String(id).trim())
      .query('SELECT * FROM dbo.Memos WHERE id = @id');

    if (!currentRes.recordset || currentRes.recordset.length === 0) {
      return res.status(404).json({ error: '対象の伝言メモが見つかりません' });
    }

    const current = currentRes.recordset[0];
    const currentDetails = safeParseJSON(current.details, {});
    let comments = safeParseJSON(current.commentsJson || currentDetails.comments || currentDetails.commentsJson, []);
    if (!Array.isArray(comments)) comments = [];

    const newComment = {
      id: `mcomm-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      memoId: String(id).trim(),
      author: author || { id: 'unknown', name: '担当者' },
      content: String(content).trim(),
      isPrivate: Boolean(isPrivate), // true = 宛先担当者（自分）のみ閲覧可能
      createdAt: new Date().toISOString()
    };

    comments.push(newComment);
    const commentsJsonStr = JSON.stringify(comments);
    const nextDetailsJson = JSON.stringify({
      ...currentDetails,
      comments
    });

    await pool.request()
      .input('id', sql.VarChar(100), String(id).trim())
      .input('commentsJson', sql.NVarChar(sql.MAX), commentsJsonStr)
      .input('details', sql.NVarChar(sql.MAX), nextDetailsJson)
      .query(`
        UPDATE dbo.Memos
        SET commentsJson = @commentsJson,
            details = @details
        WHERE id = @id
      `);

    res.status(201).json({
      success: true,
      message: 'コメントを追加しました',
      comment: newComment,
      comments
    });
  } catch (err) {
    console.error('Add memo comment error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. 伝言メモコメント削除 API
// 対応URL: DELETE/POST /api/memos/:id/comments/:commentId
// ==========================================
async function handleDeleteComment(req, res) {
  try {
    const { id, commentId } = req.params;
    const { userId, role } = req.body || {};

    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    await ensureMemosSchema(pool);

    const currentRes = await pool.request()
      .input('id', sql.VarChar(100), String(id).trim())
      .query('SELECT * FROM dbo.Memos WHERE id = @id');

    if (!currentRes.recordset || currentRes.recordset.length === 0) {
      return res.status(404).json({ error: '対象の伝言メモが見つかりません' });
    }

    const current = currentRes.recordset[0];
    const currentDetails = safeParseJSON(current.details, {});
    let comments = safeParseJSON(current.commentsJson || currentDetails.comments, []);
    if (!Array.isArray(comments)) comments = [];

    const targetIndex = comments.findIndex(c => String(c.id) === String(commentId));
    if (targetIndex === -1) {
      return res.status(404).json({ error: '対象のコメントが見つかりません' });
    }

    const targetComment = comments[targetIndex];
    // 権限チェック: 投稿者本人または管理者
    if (userId && targetComment.author?.id !== String(userId) && role !== 'admin') {
      return res.status(403).json({ error: 'コメントを削除する権限がありません' });
    }

    comments.splice(targetIndex, 1);
    const commentsJsonStr = JSON.stringify(comments);
    const nextDetailsJson = JSON.stringify({
      ...currentDetails,
      comments
    });

    await pool.request()
      .input('id', sql.VarChar(100), String(id).trim())
      .input('commentsJson', sql.NVarChar(sql.MAX), commentsJsonStr)
      .input('details', sql.NVarChar(sql.MAX), nextDetailsJson)
      .query(`
        UPDATE dbo.Memos
        SET commentsJson = @commentsJson,
            details = @details
        WHERE id = @id
      `);

    res.json({
      success: true,
      message: 'コメントを削除しました',
      comments
    });
  } catch (err) {
    console.error('Delete memo comment error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.delete([
  '/memos/:id/comments/:commentId',
  '/memos/:id/comments/:commentId/',
  '/:id/comments/:commentId'
], handleDeleteComment);

router.post([
  '/memos/:id/comments/:commentId/delete',
  '/memos/:id/comments/:commentId/delete/',
  '/:id/comments/:commentId/delete'
], handleDeleteComment);

// ==========================================
// 8. 伝言メモ削除 API
// 対応URL: DELETE/POST /api/memos/:id, /memos/:id
// ==========================================
async function handleDeleteMemo(req, res) {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    await pool.request()
      .input('id', sql.VarChar(100), String(id).trim())
      .query('DELETE FROM dbo.Memos WHERE id = @id');

    res.json({ success: true, message: '伝言メモ削除完了' });
  } catch (err) {
    console.error('Delete memo error:', err);
    res.status(500).json({ error: err.message });
  }
}

router.delete(['/memos/:id', '/memos/:id/', '/:id'], handleDeleteMemo);
router.post(['/memos/:id/delete', '/memos/:id/delete/', '/:id/delete'], handleDeleteMemo);

// ==========================================
// 9. 既読・未読ステータス管理 API (UserReadStatuses)
// ==========================================
router.get(['/read-statuses/:userId', '/read-statuses/:userId/'], async (req, res) => {
  try {
    const { userId } = req.params;
    const pool = await getPool();
    if (!pool) return res.json({ event: [], topic: [], memo: [], workflow: [], chat: [], report: [] });

    const result = await pool.request()
      .input('userId', sql.VarChar(100), String(userId).trim())
      .query('SELECT targetType, targetId FROM dbo.UserReadStatuses WHERE userId = @userId');

    const readMap = { event: [], topic: [], memo: [], workflow: [], chat: [], report: [] };
    (result.recordset || []).forEach(row => {
      if (readMap[row.targetType]) {
        readMap[row.targetType].push(String(row.targetId));
      }
    });
    res.json(readMap);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post(['/read-statuses', '/read-statuses/'], async (req, res) => {
  try {
    const { userId, targetType, targetId, isRead } = req.body || {};
    const pool = await getPool();
    if (!pool) return res.status(500).json({ error: 'DB接続が利用できません' });

    if (isRead) {
      await pool.request()
        .input('userId', sql.VarChar(100), String(userId).trim())
        .input('targetType', sql.VarChar(50), String(targetType))
        .input('targetId', sql.VarChar(100), String(targetId).trim())
        .query(`
          IF NOT EXISTS (SELECT 1 FROM dbo.UserReadStatuses WHERE userId = @userId AND targetType = @targetType AND targetId = @targetId)
          BEGIN
            INSERT INTO dbo.UserReadStatuses (userId, targetType, targetId, readAt)
            VALUES (@userId, @targetType, @targetId, GETDATE())
          END
          ELSE
          BEGIN
            UPDATE dbo.UserReadStatuses 
            SET readAt = GETDATE() 
            WHERE userId = @userId AND targetType = @targetType AND targetId = @targetId
          END
        `);
    } else {
      await pool.request()
        .input('userId', sql.VarChar(100), String(userId).trim())
        .input('targetType', sql.VarChar(50), String(targetType))
        .input('targetId', sql.VarChar(100), String(targetId).trim())
        .query('DELETE FROM dbo.UserReadStatuses WHERE userId = @userId AND targetType = @targetType AND targetId = @targetId');
    }
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

export default router;
if (typeof module !== 'undefined' && module.exports) {
  module.exports = router;
}
