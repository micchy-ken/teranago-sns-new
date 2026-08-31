/**
 * routes/workflows.js (本番環境・MS SQL Server & JSON ストレージ ハイブリッド対応版)
 * 寺岡オートドアSNS / 寺子屋SNS ワークフロー・各種申請APIモジュール
 * 
 * 最終更新: 2026年8月30日 (発注申請 purchase_order と 購入申請 purchase_request の完全分離・両立対応版)
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import sql from 'mssql';
import { getPool } from '../db.js';
import { dataDir, safeParseJSON } from '../config.js';

const router = Router();
const workflowsPath = path.join(dataDir, 'workflows.json');

/**
 * 初期サンプルワークフロー
 */
function getInitialWorkflowsSample() {
  const initial = [
    {
      id: 'wf-101',
      title: '備品（モニタ・キーボード）購入申請',
      applicantId: 'u2',
      applicant: {
        id: 'u2',
        name: '山田 太郎',
        department: '開発部',
        avatarUrl: ''
      },
      approverId: 'u1',
      status: 'pending',
      category: 'purchase_order',
      type: 'purchase_order',
      purchaseOrderNumber: 'PO-2026-0801',
      constructionDate: null,
      linkedInventoryIssueId: null,
      description: '業務効率化および開発環境の整備のため、高解像度モニターと周辺機器を導入したく申請いたします。',
      attachments: [],
      createdAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      updatedAt: new Date(Date.now() - 86400000 * 2).toISOString(),
      details: JSON.stringify({
        flowId: 'flow-1',
        flowName: '標準承認フロー',
        currentStepIndex: 1,
        totalSteps: 2,
        reason: '開発受託業務用モニターおよびキーボードの購入',
        purchasePurpose: '業務効率化および開発環境の整備のため、高解像度モニターと周辺機器を導入したく申請いたします。',
        purchaseTiming: 'urgent',
        purchaseVendor: 'Amazon / アスクル',
        purchaseMethod: 'self',
        amount: 45000,
        expenseType: '備品消耗品費',
        purchaseItems: [
          { itemName: '4K 27インチモニター', quantity: 1, unitPrice: 35000, amount: 35000 },
          { itemName: 'メカニカルキーボード', quantity: 1, unitPrice: 10000, amount: 10000 }
        ],
        stepsConfig: [
          { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' },
          { stepNumber: 2, approverType: 'department_head', stepName: '最終承認（部長）' }
        ],
        history: []
      })
    }
  ];
  try {
    fs.writeFileSync(workflowsPath, JSON.stringify(initial, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to write initial workflows sample:', e);
  }
  return initial;
}

/**
 * ファイルからワークフローを読み込み
 */
function loadWorkflowsFromFile() {
  if (!fs.existsSync(workflowsPath)) {
    return getInitialWorkflowsSample();
  }
  try {
    const raw = JSON.parse(fs.readFileSync(workflowsPath, 'utf8'));
    if (!Array.isArray(raw) || raw.length === 0) {
      return getInitialWorkflowsSample();
    }
    return raw;
  } catch (e) {
    return getInitialWorkflowsSample();
  }
}

/**
 * ファイルへワークフローを保存
 */
function saveWorkflowsToFile(items) {
  try {
    fs.writeFileSync(workflowsPath, JSON.stringify(items, null, 2), 'utf8');
  } catch (e) {
    console.error('Failed to save workflows to file:', e);
  }
}

/**
 * ワークフロー一覧取得 API
 * GET /api/workflows
 */
router.get(['/workflows', '/workflows/', ''], async (req, res) => {
  try {
    const pool = await getPool();
    let workflows = [];
    let dbSuccess = false;

    // 1. MS SQL Server からの取得を試行 (Users テーブルと LEFT JOIN)
    if (pool) {
      try {
        const result = await pool.request().query(`
          SELECT 
            w.*, 
            u.name AS applicantName, 
            u.department AS applicantDepartment, 
            u.avatarUrl AS applicantAvatarUrl
          FROM dbo.Workflows w
          LEFT JOIN dbo.Users u ON w.applicantId = u.id
          ORDER BY w.createdAt DESC
        `);

        if (result.recordset) {
          workflows = result.recordset.map(row => {
            const parsedAttachments = safeParseJSON ? safeParseJSON(row.attachments, []) : (typeof row.attachments === 'string' ? JSON.parse(row.attachments || '[]') : (row.attachments || []));
            return {
              id: String(row.id),
              title: row.title || '無題の申請',
              applicantId: String(row.applicantId),
              applicant: {
                id: String(row.applicantId),
                name: row.applicantName || '不明',
                department: row.applicantDepartment || '',
                avatarUrl: row.applicantAvatarUrl || ''
              },
              approverId: row.approverId ? String(row.approverId) : undefined,
              status: row.status || 'pending',
              category: row.category || row.type || 'other',
              type: row.type || row.category || 'other',
              description: row.description || '',
              purchaseOrderNumber: row.purchaseOrderNumber || undefined,
              constructionDate: row.constructionDate ? (typeof row.constructionDate === 'string' ? row.constructionDate.slice(0, 10) : new Date(row.constructionDate).toISOString().slice(0, 10)) : undefined,
              linkedInventoryIssueId: row.linkedInventoryIssueId || undefined,
              details: row.details || '{}',
              attachments: parsedAttachments,
              createdAt: row.createdAt ? (typeof row.createdAt === 'string' ? row.createdAt : new Date(row.createdAt).toISOString()) : new Date().toISOString(),
              updatedAt: row.updatedAt ? (typeof row.updatedAt === 'string' ? row.updatedAt : new Date(row.updatedAt).toISOString()) : undefined
            };
          });
          dbSuccess = true;
        }
      } catch (dbErr) {
        console.warn('[Workflows] DB lookup failed, falling back to JSON:', dbErr.message);
      }
    }

    // 2. DB未接続またはレコードなしの場合は JSON ファイルフォールバック
    if (!dbSuccess || workflows.length === 0) {
      workflows = loadWorkflowsFromFile();
    }

    res.json(workflows);
  } catch (err) {
    console.error('Get workflows error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ワークフロー新規作成 API
 * POST /api/workflows
 */
router.post(['/workflows', '/workflows/', ''], async (req, res) => {
  try {
    const { 
      title, 
      description, 
      applicantId, 
      approverId, 
      status, 
      category, 
      details, 
      attachments, 
      purchaseOrderNumber, 
      constructionDate, 
      linkedInventoryIssueId 
    } = req.body || {};

    const pool = await getPool();
    const id = req.body.id || `w-${Date.now()}`;
    const nowIso = new Date().toISOString();

    const finalApplicantId = String(applicantId || (req.body.applicant && req.body.applicant.id) || 'u1');
    const finalApproverId = approverId || (req.body.approver && req.body.approver.id) || 'u1';
    const finalStatus = status || '承認待ち';
    const finalCategory = category || req.body.type || 'general';
    const finalTitle = title || '無題の申請';
    const finalDesc = description || title || '';

    const detailsStr = typeof details === 'object' && details !== null 
      ? JSON.stringify(details) 
      : (details || '');

    const attachmentsStr = attachments 
      ? (typeof attachments === 'object' ? JSON.stringify(attachments) : String(attachments))
      : null;

    // 1. MS SQL Server へ保存
    if (pool) {
      try {
        await pool.request()
          .input('id', sql.VarChar, String(id))
          .input('title', sql.NVarChar, finalTitle)
          .input('description', sql.NVarChar, finalDesc)
          .input('applicantId', sql.VarChar, finalApplicantId)
          .input('approverId', sql.VarChar, finalApproverId)
          .input('status', sql.NVarChar, finalStatus)
          .input('category', sql.NVarChar, finalCategory)
          .input('type', sql.NVarChar, finalCategory)
          .input('purchaseOrderNumber', sql.NVarChar, purchaseOrderNumber || null)
          .input('constructionDate', sql.NVarChar, constructionDate || null)
          .input('linkedInventoryIssueId', sql.VarChar, linkedInventoryIssueId || null)
          .input('details', sql.NVarChar, detailsStr)
          .input('attachments', sql.NVarChar, attachmentsStr)
          .query(`
            MERGE dbo.Workflows AS target
            USING (SELECT @id AS id) AS source
            ON (target.id = source.id)
            WHEN MATCHED THEN
              UPDATE SET 
                title = @title,
                description = @description,
                applicantId = @applicantId,
                approverId = @approverId,
                status = @status,
                category = @category,
                type = @type,
                purchaseOrderNumber = @purchaseOrderNumber,
                constructionDate = @constructionDate,
                linkedInventoryIssueId = @linkedInventoryIssueId,
                details = @details,
                attachments = @attachments,
                updatedAt = GETDATE()
            WHEN NOT MATCHED THEN
              INSERT (id, title, description, applicantId, approverId, status, createdAt, category, type, purchaseOrderNumber, constructionDate, linkedInventoryIssueId, details, attachments)
              VALUES (@id, @title, @description, @applicantId, @approverId, @status, GETDATE(), @category, @type, @purchaseOrderNumber, @constructionDate, @linkedInventoryIssueId, @details, @attachments);
          `);
      } catch (dbErr) {
        console.warn('[Workflows] DB insert warning:', dbErr.message);
      }
    }

    // 2. JSON ファイルへも二重保存
    const fileList = loadWorkflowsFromFile();
    const newWorkflow = {
      id: String(id),
      title: finalTitle,
      description: finalDesc,
      applicantId: finalApplicantId,
      approverId: finalApproverId,
      status: finalStatus,
      category: finalCategory,
      type: finalCategory,
      purchaseOrderNumber: purchaseOrderNumber || null,
      constructionDate: constructionDate || null,
      linkedInventoryIssueId: linkedInventoryIssueId || null,
      details: detailsStr,
      attachments: attachments || [],
      createdAt: req.body.createdAt || nowIso,
      updatedAt: nowIso
    };

    const existingIdx = fileList.findIndex(w => w.id === String(id));
    if (existingIdx >= 0) {
      fileList[existingIdx] = newWorkflow;
    } else {
      fileList.unshift(newWorkflow);
    }
    saveWorkflowsToFile(fileList);

    res.status(201).json({ id: String(id), message: '申請完了', ...newWorkflow });
  } catch (err) {
    console.error('Create workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ワークフロー更新 API (承認 / 却下 / 編集)
 * PUT /api/workflows/:id
 */
router.put(['/workflows/:id', '/:id'], async (req, res) => {
  try {
    const { 
      status, 
      approverId, 
      details, 
      attachments, 
      purchaseOrderNumber, 
      constructionDate, 
      linkedInventoryIssueId, 
      title, 
      category,
      description 
    } = req.body || {};

    const pool = await getPool();
    const id = req.params.id;
    const nowIso = new Date().toISOString();

    const detailsVal = details ? (typeof details === 'object' ? JSON.stringify(details) : details) : null;
    const attachmentsVal = attachments ? (typeof attachments === 'object' ? JSON.stringify(attachments) : attachments) : null;

    // 1. MS SQL Server へ反映
    if (pool) {
      try {
        await pool.request()
          .input('id', sql.VarChar, String(id))
          .input('status', sql.NVarChar, status || null)
          .input('title', sql.NVarChar, title || null)
          .input('description', sql.NVarChar, description || null)
          .input('category', sql.NVarChar, category || null)
          .input('type', sql.NVarChar, category || null)
          .input('approverId', sql.VarChar, approverId || null)
          .input('details', sql.NVarChar, detailsVal)
          .input('attachments', sql.NVarChar, attachmentsVal)
          .input('purchaseOrderNumber', sql.NVarChar, purchaseOrderNumber || null)
          .input('constructionDate', sql.NVarChar, constructionDate || null)
          .input('linkedInventoryIssueId', sql.VarChar, linkedInventoryIssueId || null)
          .query(`
            UPDATE dbo.Workflows 
            SET status = COALESCE(@status, status),
                title = COALESCE(@title, title),
                description = COALESCE(@description, description),
                category = COALESCE(@category, category),
                type = COALESCE(@type, type),
                approverId = COALESCE(@approverId, approverId),
                details = COALESCE(@details, details),
                attachments = COALESCE(@attachments, attachments),
                purchaseOrderNumber = COALESCE(@purchaseOrderNumber, purchaseOrderNumber),
                constructionDate = COALESCE(@constructionDate, constructionDate),
                linkedInventoryIssueId = COALESCE(@linkedInventoryIssueId, linkedInventoryIssueId),
                updatedAt = GETDATE()
            WHERE id = @id
          `);
      } catch (dbErr) {
        console.warn('[Workflows] DB update warning:', dbErr.message);
      }
    }

    // 2. JSON ファイルへ反映
    const fileList = loadWorkflowsFromFile();
    const idx = fileList.findIndex(w => w.id === String(id));
    if (idx >= 0) {
      const existing = fileList[idx];
      fileList[idx] = {
        ...existing,
        status: status !== undefined ? status : existing.status,
        title: title !== undefined ? title : existing.title,
        description: description !== undefined ? description : existing.description,
        category: category !== undefined ? category : existing.category,
        type: category !== undefined ? category : existing.type,
        approverId: approverId !== undefined ? approverId : existing.approverId,
        details: detailsVal !== null ? detailsVal : existing.details,
        attachments: attachments !== undefined ? attachments : existing.attachments,
        purchaseOrderNumber: purchaseOrderNumber !== undefined ? purchaseOrderNumber : existing.purchaseOrderNumber,
        constructionDate: constructionDate !== undefined ? constructionDate : existing.constructionDate,
        linkedInventoryIssueId: linkedInventoryIssueId !== undefined ? linkedInventoryIssueId : existing.linkedInventoryIssueId,
        updatedAt: nowIso
      };
      saveWorkflowsToFile(fileList);
    }

    res.json({ message: '更新完了' });
  } catch (err) {
    console.error('Update workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ワークフロー削除 API
 * DELETE /api/workflows/:id または POST /api/workflows/:id/delete
 */
router.delete(['/workflows/:id', '/:id'], async (req, res) => {
  try {
    const pool = await getPool();
    const id = req.params.id;

    if (pool) {
      try {
        await pool.request()
          .input('id', sql.VarChar, String(id))
          .query('DELETE FROM dbo.Workflows WHERE id = @id');
      } catch (dbErr) {
        console.warn('[Workflows] DB delete warning:', dbErr.message);
      }
    }

    let fileList = loadWorkflowsFromFile();
    fileList = fileList.filter(w => w.id !== String(id));
    saveWorkflowsToFile(fileList);

    res.json({ message: '削除完了' });
  } catch (err) {
    console.error('Delete workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post(['/workflows/:id/delete', '/:id/delete'], async (req, res) => {
  try {
    const pool = await getPool();
    const id = req.params.id;

    if (pool) {
      try {
        await pool.request()
          .input('id', sql.VarChar, String(id))
          .query('DELETE FROM dbo.Workflows WHERE id = @id');
      } catch (dbErr) {
        console.warn('[Workflows] DB delete warning:', dbErr.message);
      }
    }

    let fileList = loadWorkflowsFromFile();
    fileList = fileList.filter(w => w.id !== String(id));
    saveWorkflowsToFile(fileList);

    res.json({ message: '削除完了' });
  } catch (err) {
    console.error('Delete workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
