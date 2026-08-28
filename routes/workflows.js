/**
 * routes/workflows.js (本番環境・MS SQL Server & JSON ストレージ ハイブリッド対応版)
 * 寺岡オートドアSNS / 寺子屋SNS ワークフロー・各種申請APIモジュール
 * 
 * 最終更新: 2026年8月28日 (購入申請の目的・時期・購入元・購入方法・手配依頼先連携および通知対応版)
 */
import { Router } from 'express';
import path from 'path';
import fs from 'fs';
import sql from 'mssql';
import { getPool } from '../db.js';
import { dataDir } from '../config.js';
import { sendEmailNotification } from './email.js';

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
      approverId: 'u1',
      status: 'pending',
      category: 'purchase_order',
      type: 'purchase_order',
      purchaseOrderNumber: 'PO-2026-0801',
      constructionDate: null,
      linkedInventoryIssueId: null,
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

    // 1. MS SQL Server からの取得を試行
    if (pool) {
      try {
        const result = await pool.request().query(`
          SELECT 
            id, title, applicantId, approverId, status, category, type,
            purchaseOrderNumber, constructionDate, linkedInventoryIssueId,
            details, createdAt, updatedAt
          FROM dbo.Workflows
          ORDER BY createdAt DESC
        `);
        if (result.recordset) {
          workflows = result.recordset.map(row => ({
            id: String(row.id),
            title: row.title || '無題の申請',
            applicantId: String(row.applicantId),
            approverId: row.approverId ? String(row.approverId) : undefined,
            status: row.status || 'pending',
            category: row.category || row.type || 'other',
            type: row.type || row.category || 'other',
            purchaseOrderNumber: row.purchaseOrderNumber || null,
            constructionDate: row.constructionDate ? (typeof row.constructionDate === 'string' ? row.constructionDate.slice(0, 10) : new Date(row.constructionDate).toISOString().slice(0, 10)) : null,
            linkedInventoryIssueId: row.linkedInventoryIssueId || null,
            details: row.details || '{}',
            createdAt: row.createdAt ? (typeof row.createdAt === 'string' ? row.createdAt : new Date(row.createdAt).toISOString()) : new Date().toISOString(),
            updatedAt: row.updatedAt ? (typeof row.updatedAt === 'string' ? row.updatedAt : new Date(row.updatedAt).toISOString()) : undefined
          }));
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
    const data = req.body || {};
    const nowIso = new Date().toISOString();
    const newId = data.id || `wf-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const applicantId = String(data.applicantId || (data.applicant && data.applicant.id) || 'u1');
    const approverId = data.approverId || (data.approver && data.approver.id) || undefined;
    const status = data.status || 'pending';
    const category = data.category || data.type || 'other';

    let detailsStr = '';
    if (typeof data.details === 'string') {
      detailsStr = data.details;
    } else if (typeof data.details === 'object' && data.details !== null) {
      detailsStr = JSON.stringify(data.details);
    } else {
      const { id, title, applicantId: _a, approverId: _ap, status: _s, category: _c, type: _t, ...rest } = data;
      detailsStr = JSON.stringify(rest);
    }

    const newWorkflow = {
      id: newId,
      title: data.title || '無題の申請',
      applicantId,
      approverId,
      status,
      category,
      type: category,
      purchaseOrderNumber: data.purchaseOrderNumber || null,
      constructionDate: data.constructionDate || null,
      linkedInventoryIssueId: data.linkedInventoryIssueId || null,
      details: detailsStr,
      createdAt: data.createdAt || nowIso,
      updatedAt: nowIso
    };

    // 1. MS SQL Server へ保存
    const pool = await getPool();
    if (pool) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(100), newId)
          .input('title', sql.NVarChar(sql.MAX), newWorkflow.title)
          .input('applicantId', sql.NVarChar(100), applicantId)
          .input('approverId', sql.NVarChar(100), approverId || null)
          .input('status', sql.NVarChar(50), status)
          .input('category', sql.NVarChar(50), category)
          .input('type', sql.NVarChar(50), category)
          .input('purchaseOrderNumber', sql.NVarChar(100), newWorkflow.purchaseOrderNumber)
          .input('constructionDate', sql.NVarChar(50), newWorkflow.constructionDate)
          .input('linkedInventoryIssueId', sql.NVarChar(100), newWorkflow.linkedInventoryIssueId)
          .input('details', sql.NVarChar(sql.MAX), detailsStr)
          .input('createdAt', sql.DateTime2, new Date(newWorkflow.createdAt))
          .input('updatedAt', sql.DateTime2, new Date(nowIso))
          .query(`
            MERGE dbo.Workflows AS target
            USING (SELECT @id AS id) AS source
            ON (target.id = source.id)
            WHEN MATCHED THEN
              UPDATE SET 
                title = @title,
                applicantId = @applicantId,
                approverId = @approverId,
                status = @status,
                category = @category,
                type = @type,
                purchaseOrderNumber = @purchaseOrderNumber,
                constructionDate = @constructionDate,
                linkedInventoryIssueId = @linkedInventoryIssueId,
                details = @details,
                updatedAt = @updatedAt
            WHEN NOT MATCHED THEN
              INSERT (id, title, applicantId, approverId, status, category, type, purchaseOrderNumber, constructionDate, linkedInventoryIssueId, details, createdAt, updatedAt)
              VALUES (@id, @title, @applicantId, @approverId, @status, @category, @type, @purchaseOrderNumber, @constructionDate, @linkedInventoryIssueId, @details, @createdAt, @updatedAt);
          `);
      } catch (dbErr) {
        console.warn('[Workflows] DB insert warning:', dbErr.message);
      }
    }

    // 2. JSON ファイルへも二重保存
    const fileList = loadWorkflowsFromFile();
    const existingIdx = fileList.findIndex(w => w.id === newId);
    if (existingIdx >= 0) {
      fileList[existingIdx] = newWorkflow;
    } else {
      fileList.unshift(newWorkflow);
    }
    saveWorkflowsToFile(fileList);

    res.status(201).json(newWorkflow);
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
    const { id } = req.params;
    const data = req.body || {};
    const fileList = loadWorkflowsFromFile();
    const idx = fileList.findIndex(w => w.id === id);
    const nowIso = new Date().toISOString();

    let detailsStr = '';
    if (typeof data.details === 'string') {
      detailsStr = data.details;
    } else if (typeof data.details === 'object' && data.details !== null) {
      detailsStr = JSON.stringify(data.details);
    }

    let existing = idx >= 0 ? fileList[idx] : null;

    let mergedDetailsStr = detailsStr || (existing ? existing.details : '{}');
    if (detailsStr) {
      try {
        const parsedDetails = JSON.parse(detailsStr);
        parsedDetails.status = data.status || (existing ? existing.status : 'pending');
        mergedDetailsStr = JSON.stringify(parsedDetails);
      } catch (e) {}
    }

    const updatedWorkflow = {
      id,
      title: data.title !== undefined ? data.title : (existing ? existing.title : '無題の申請'),
      applicantId: data.applicantId ? String(data.applicantId) : (existing ? existing.applicantId : 'u1'),
      approverId: data.approverId !== undefined ? data.approverId : (existing ? existing.approverId : undefined),
      status: data.status !== undefined ? data.status : (existing ? existing.status : 'pending'),
      category: data.category || data.type || (existing ? existing.category : 'other'),
      type: data.category || data.type || (existing ? existing.type : 'other'),
      purchaseOrderNumber: data.purchaseOrderNumber !== undefined ? data.purchaseOrderNumber : (existing ? existing.purchaseOrderNumber : null),
      constructionDate: data.constructionDate !== undefined ? data.constructionDate : (existing ? existing.constructionDate : null),
      linkedInventoryIssueId: data.linkedInventoryIssueId !== undefined ? data.linkedInventoryIssueId : (existing ? existing.linkedInventoryIssueId : null),
      details: mergedDetailsStr,
      createdAt: data.createdAt || (existing ? existing.createdAt : nowIso),
      updatedAt: nowIso
    };

    // 1. MS SQL Server へ反映
    const pool = await getPool();
    if (pool) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(100), id)
          .input('title', sql.NVarChar(sql.MAX), updatedWorkflow.title)
          .input('applicantId', sql.NVarChar(100), updatedWorkflow.applicantId)
          .input('approverId', sql.NVarChar(100), updatedWorkflow.approverId || null)
          .input('status', sql.NVarChar(50), updatedWorkflow.status)
          .input('category', sql.NVarChar(50), updatedWorkflow.category)
          .input('type', sql.NVarChar(50), updatedWorkflow.type)
          .input('purchaseOrderNumber', sql.NVarChar(100), updatedWorkflow.purchaseOrderNumber)
          .input('constructionDate', sql.NVarChar(50), updatedWorkflow.constructionDate)
          .input('linkedInventoryIssueId', sql.NVarChar(100), updatedWorkflow.linkedInventoryIssueId)
          .input('details', sql.NVarChar(sql.MAX), mergedDetailsStr)
          .input('updatedAt', sql.DateTime2, new Date(nowIso))
          .query(`
            UPDATE dbo.Workflows
            SET 
              title = @title,
              applicantId = @applicantId,
              approverId = @approverId,
              status = @status,
              category = @category,
              type = @type,
              purchaseOrderNumber = @purchaseOrderNumber,
              constructionDate = @constructionDate,
              linkedInventoryIssueId = @linkedInventoryIssueId,
              details = @details,
              updatedAt = @updatedAt
            WHERE id = @id;
          `);
      } catch (dbErr) {
        console.warn('[Workflows] DB update warning:', dbErr.message);
      }
    }

    // 2. JSON ファイルへ反映
    if (idx >= 0) {
      fileList[idx] = updatedWorkflow;
    } else {
      fileList.unshift(updatedWorkflow);
    }
    saveWorkflowsToFile(fileList);

    res.json(updatedWorkflow);
  } catch (err) {
    console.error('Update workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

/**
 * ワークフロー削除 API
 * DELETE /api/workflows/:id
 */
router.delete(['/workflows/:id', '/:id'], async (req, res) => {
  try {
    const { id } = req.params;

    // 1. MS SQL Server から削除
    const pool = await getPool();
    if (pool) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(100), id)
          .query('DELETE FROM dbo.Workflows WHERE id = @id');
      } catch (dbErr) {
        console.warn('[Workflows] DB delete warning:', dbErr.message);
      }
    }

    // 2. JSON ファイルから削除
    let fileList = loadWorkflowsFromFile();
    const initialCount = fileList.length;
    fileList = fileList.filter(w => w.id !== id);
    saveWorkflowsToFile(fileList);

    res.json({ success: true, deleted: initialCount - fileList.length });
  } catch (err) {
    console.error('Delete workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST 経由の削除互換
router.post(['/workflows/:id/delete', '/:id/delete'], async (req, res) => {
  try {
    const { id } = req.params;

    const pool = await getPool();
    if (pool) {
      try {
        await pool.request()
          .input('id', sql.NVarChar(100), id)
          .query('DELETE FROM dbo.Workflows WHERE id = @id');
      } catch (dbErr) {
        console.warn('[Workflows] DB delete warning:', dbErr.message);
      }
    }

    let fileList = loadWorkflowsFromFile();
    const initialCount = fileList.length;
    fileList = fileList.filter(w => w.id !== id);
    saveWorkflowsToFile(fileList);

    res.json({ success: true, deleted: initialCount - fileList.length });
  } catch (err) {
    console.error('Delete workflow error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
