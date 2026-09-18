/**
 * routes/inspections.js
 * 寺岡オートドアSNS 点検報告書・電子署名・事務確認・CRM点検データ APIモジュール
 * 最終更新: 2026年9月18日 (MS SQL Server dbo.InspectionReports 完全連携・電子署名DB永続化)
 */
import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { dataDir } from '../config.js';

const router = Router();

const reportsFilePath = path.join(dataDir, 'inspection_reports.json');
const crmDataFilePath = path.join(dataDir, 'crm_inspections.json');

// --- ヘルパー関数 (Local JSON フォールバック) ---
function loadJsonFile(filePath, defaultVal = []) {
  if (!fs.existsSync(filePath)) return defaultVal;
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : defaultVal;
  } catch (e) {
    return defaultVal;
  }
}

function saveJsonFile(filePath, data) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[Inspections] Failed to save JSON file (${filePath}):`, e);
  }
}

// DBレコード -> フロントエンド用モデル変換
function mapDbRowToReport(row) {
  let doors = [];
  try {
    if (row.doorsDetailsJson) {
      doors = JSON.parse(row.doorsDetailsJson);
    }
  } catch (e) {
    doors = [];
  }

  let checkResults = {};
  try {
    if (row.checkItemResultsJson) {
      checkResults = JSON.parse(row.checkItemResultsJson);
    }
  } catch (e) {
    checkResults = {};
  }

  return {
    id: String(row.id),
    eventId: row.eventId || undefined,
    jobNo: String(row.jobNo || ''),
    yearMonth: row.inspectionDate ? String(row.inspectionDate).replace(/-/g, '').slice(0, 6) : '',
    customerName: String(row.customerName || ''),
    address: row.address || '',
    phone: '',
    contractType: 'ST',
    category: 'maintenance',
    inspectionDate: row.inspectionDate ? (row.inspectionDate instanceof Date ? row.inspectionDate.toISOString().slice(0, 10) : String(row.inspectionDate).slice(0, 10)) : '',
    startTime: row.startTime || '',
    endTime: row.endTime || '',
    weather: row.weather || '',
    inspectorId: String(row.inspectorId || ''),
    inspectorName: String(row.inspectorName || ''),
    subInspectorName: row.subInspectorName || '',
    office: row.office || '',
    isCrmImported: true,
    totalDoorsCount: Number(row.totalDoorsCount) || (doors.length > 0 ? doors.length : 1),
    doors: doors,
    checkItemResults: checkResults,
    overallRemarks: row.overallSummary || '',
    overallSummary: row.overallSummary || '',
    emergencyRepairMemo: row.emergencyRepairMemo || '',
    status: row.status || 'draft',
    customerSignature: row.customerSignature || '',
    signedCustomerName: row.signedCustomerName || '',
    signedAt: row.signedAt ? (row.signedAt instanceof Date ? row.signedAt.toISOString() : String(row.signedAt)) : null,
    officeConfirmed: Boolean(row.officeConfirmed),
    officeConfirmedAt: row.officeConfirmedAt ? (row.officeConfirmedAt instanceof Date ? row.officeConfirmedAt.toISOString() : String(row.officeConfirmedAt)) : null,
    officeConfirmedById: row.officeConfirmedById || null,
    officeConfirmedByName: row.officeConfirmedByName || null,
    createdAt: row.createdAt ? (row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)) : new Date().toISOString(),
    updatedAt: row.updatedAt ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt)) : new Date().toISOString()
  };
}

// ====================================================================
// 1. 点検報告書 一覧取得 API
// ====================================================================
router.get(['/reports', '/inspection-reports', '/inspections/reports', '/inspections'], async (req, res) => {
  const { date, status, jobNo, inspectorId, yearMonth } = req.query;
  try {
    const pool = await getPool();
    if (pool) {
      let query = 'SELECT * FROM dbo.InspectionReports WHERE 1=1';
      const request = pool.request();

      if (date) {
        query += ' AND inspectionDate = @date';
        request.input('date', sql.NVarChar(20), String(date));
      }
      if (status) {
        query += ' AND status = @status';
        request.input('status', sql.NVarChar(20), String(status));
      }
      if (jobNo) {
        query += ' AND jobNo = @jobNo';
        request.input('jobNo', sql.NVarChar(50), String(jobNo));
      }
      if (inspectorId) {
        query += ' AND inspectorId = @inspectorId';
        request.input('inspectorId', sql.NVarChar(50), String(inspectorId));
      }
      if (yearMonth) {
        query += ' AND REPLACE(inspectionDate, \'-\', \'\') LIKE @yearMonthPrefix';
        request.input('yearMonthPrefix', sql.NVarChar(20), `${yearMonth}%`);
      }

      query += ' ORDER BY updatedAt DESC';
      const result = await request.query(query);

      const reports = (result.recordset || []).map(mapDbRowToReport);
      return res.json({ success: true, reports, source: 'mssql' });
    }
  } catch (err) {
    console.warn('[Inspections] MSSQL fetch failed, falling back to JSON:', err.message);
  }

  // Fallback: Local JSON
  let reports = loadJsonFile(reportsFilePath, []);
  if (date) reports = reports.filter(r => r.inspectionDate === date);
  if (status) reports = reports.filter(r => r.status === status);
  if (jobNo) reports = reports.filter(r => r.jobNo === jobNo);
  if (inspectorId) reports = reports.filter(r => r.inspectorId === inspectorId);

  res.json({ success: true, reports, source: 'json' });
});

// ====================================================================
// 2. 単一報告書の詳細取得 API
// ====================================================================
router.get(['/reports/:id', '/inspection-reports/:id', '/inspections/reports/:id'], async (req, res) => {
  const { id } = req.params;
  try {
    const pool = await getPool();
    if (pool) {
      const result = await pool.request()
        .input('id', sql.NVarChar(50), id)
        .query('SELECT * FROM dbo.InspectionReports WHERE id = @id');
      if (result.recordset && result.recordset.length > 0) {
        const report = mapDbRowToReport(result.recordset[0]);
        return res.json({ success: true, report, source: 'mssql' });
      }
    }
  } catch (err) {
    console.warn('[Inspections] MSSQL detail fetch failed, falling back to JSON:', err.message);
  }

  const reports = loadJsonFile(reportsFilePath, []);
  const report = reports.find(r => r.id === id);
  if (!report) return res.status(404).json({ success: false, error: 'Report not found' });
  res.json({ success: true, report, source: 'json' });
});

// ====================================================================
// 3. 報告書の新規作成・保存・更新 API (Upsert: SQL Server MERGE)
// ====================================================================
router.post(['/reports', '/inspection-reports', '/inspections/reports', '/inspections'], async (req, res) => {
  const report = req.body;
  if (!report || !report.id || !report.jobNo) {
    return res.status(400).json({ success: false, error: 'Invalid report data (id and jobNo required)' });
  }

  const now = new Date().toISOString();
  const doors = report.doors || report.doorsDetails || [];
  const doorsDetailsJson = JSON.stringify(doors);
  const checkItemResultsJson = JSON.stringify(report.checkItemResults || (doors[0] ? doors[0].checkResults : {}));
  const totalDoorsCount = Number(report.totalDoorsCount) || (doors.length > 0 ? doors.length : 1);
  const overallSummary = report.overallRemarks || report.overallSummary || '';

  try {
    const pool = await getPool();
    if (pool) {
      const request = pool.request();
      request.input('id', sql.NVarChar(50), String(report.id));
      request.input('eventId', sql.NVarChar(50), report.eventId ? String(report.eventId) : null);
      request.input('jobNo', sql.NVarChar(50), String(report.jobNo));
      request.input('inspectionDate', sql.NVarChar(20), String(report.inspectionDate || ''));
      request.input('startTime', sql.NVarChar(10), report.startTime || null);
      request.input('endTime', sql.NVarChar(10), report.endTime || null);
      request.input('weather', sql.NVarChar(20), report.weather || null);
      request.input('inspectorId', sql.NVarChar(50), String(report.inspectorId || ''));
      request.input('inspectorName', sql.NVarChar(100), String(report.inspectorName || ''));
      request.input('subInspectorName', sql.NVarChar(100), report.subInspectorName || null);
      request.input('office', sql.NVarChar(100), report.office || null);
      request.input('customerName', sql.NVarChar(255), String(report.customerName || ''));
      request.input('address', sql.NVarChar(500), report.address || null);
      request.input('totalDoorsCount', sql.Int, totalDoorsCount);
      request.input('doorsDetailsJson', sql.NVarChar(sql.MAX), doorsDetailsJson);
      request.input('checkItemResultsJson', sql.NVarChar(sql.MAX), checkItemResultsJson);
      request.input('overallSummary', sql.NVarChar(sql.MAX), overallSummary || null);
      request.input('emergencyRepairMemo', sql.NVarChar(sql.MAX), report.emergencyRepairMemo || null);
      request.input('status', sql.NVarChar(20), String(report.status || 'draft'));
      request.input('customerSignature', sql.NVarChar(sql.MAX), report.customerSignature || null);
      request.input('signedCustomerName', sql.NVarChar(100), report.signedCustomerName || null);
      request.input('signedAt', sql.DateTime2, report.signedAt ? new Date(report.signedAt) : null);
      request.input('officeConfirmed', sql.Bit, report.officeConfirmed ? 1 : 0);
      request.input('officeConfirmedAt', sql.DateTime2, report.officeConfirmedAt ? new Date(report.officeConfirmedAt) : null);
      request.input('officeConfirmedById', sql.NVarChar(50), report.officeConfirmedById || null);
      request.input('officeConfirmedByName', sql.NVarChar(100), report.officeConfirmedByName || null);

      const query = `
        MERGE INTO dbo.InspectionReports AS Target
        USING (SELECT @id AS id) AS Source
        ON Target.id = Source.id
        WHEN MATCHED THEN
          UPDATE SET
            eventId = @eventId,
            jobNo = @jobNo,
            inspectionDate = @inspectionDate,
            startTime = @startTime,
            endTime = @endTime,
            weather = @weather,
            inspectorId = @inspectorId,
            inspectorName = @inspectorName,
            subInspectorName = @subInspectorName,
            office = @office,
            customerName = @customerName,
            address = @address,
            totalDoorsCount = @totalDoorsCount,
            doorsDetailsJson = @doorsDetailsJson,
            checkItemResultsJson = @checkItemResultsJson,
            overallSummary = @overallSummary,
            emergencyRepairMemo = @emergencyRepairMemo,
            status = @status,
            customerSignature = @customerSignature,
            signedCustomerName = @signedCustomerName,
            signedAt = @signedAt,
            officeConfirmed = @officeConfirmed,
            officeConfirmedAt = @officeConfirmedAt,
            officeConfirmedById = @officeConfirmedById,
            officeConfirmedByName = @officeConfirmedByName,
            updatedAt = SYSDATETIME()
        WHEN NOT MATCHED THEN
          INSERT (
            id, eventId, jobNo, inspectionDate, startTime, endTime, weather,
            inspectorId, inspectorName, subInspectorName, office, customerName, address,
            totalDoorsCount, doorsDetailsJson, checkItemResultsJson, overallSummary, emergencyRepairMemo,
            status, customerSignature, signedCustomerName, signedAt,
            officeConfirmed, officeConfirmedAt, officeConfirmedById, officeConfirmedByName,
            createdAt, updatedAt
          ) VALUES (
            @id, @eventId, @jobNo, @inspectionDate, @startTime, @endTime, @weather,
            @inspectorId, @inspectorName, @subInspectorName, @office, @customerName, @address,
            @totalDoorsCount, @doorsDetailsJson, @checkItemResultsJson, @overallSummary, @emergencyRepairMemo,
            @status, @customerSignature, @signedCustomerName, @signedAt,
            @officeConfirmed, @officeConfirmedAt, @officeConfirmedById, @officeConfirmedByName,
            SYSDATETIME(), SYSDATETIME()
          );
      `;
      await request.query(query);
    }
  } catch (err) {
    console.warn('[Inspections] MSSQL report save error, persisting to JSON:', err.message);
  }

  // 二重保持: Local JSON
  const normalizedReport = {
    ...report,
    doors,
    overallRemarks: overallSummary,
    updatedAt: now,
    createdAt: report.createdAt || now
  };
  const reports = loadJsonFile(reportsFilePath, []);
  const idx = reports.findIndex(r => r.id === report.id);
  if (idx >= 0) {
    reports[idx] = { ...reports[idx], ...normalizedReport };
  } else {
    reports.push(normalizedReport);
  }
  saveJsonFile(reportsFilePath, reports);

  res.json({ success: true, report: normalizedReport });
});

// ====================================================================
// 4. 事務確認（検印）トグル API
// ====================================================================
router.put(['/reports/:id/confirm', '/inspection-reports/:id/confirm', '/inspections/reports/:id/confirm'], async (req, res) => {
  const { id } = req.params;
  const { user } = req.body; // 事務担当者ユーザー { id, name }

  const reports = loadJsonFile(reportsFilePath, []);
  const target = reports.find(r => r.id === id);
  const newConfirmed = target ? !target.officeConfirmed : true;
  const now = new Date().toISOString();

  const updateData = {
    officeConfirmed: newConfirmed,
    officeConfirmedAt: newConfirmed ? now : null,
    officeConfirmedById: newConfirmed && user ? user.id : null,
    officeConfirmedByName: newConfirmed && user ? user.name : null,
    updatedAt: now
  };

  try {
    const pool = await getPool();
    if (pool) {
      await pool.request()
        .input('id', sql.NVarChar(50), id)
        .input('officeConfirmed', sql.Bit, newConfirmed ? 1 : 0)
        .input('officeConfirmedAt', sql.DateTime2, newConfirmed ? new Date(now) : null)
        .input('officeConfirmedById', sql.NVarChar(50), updateData.officeConfirmedById)
        .input('officeConfirmedByName', sql.NVarChar(100), updateData.officeConfirmedByName)
        .query(`
          UPDATE dbo.InspectionReports
          SET officeConfirmed = @officeConfirmed,
              officeConfirmedAt = @officeConfirmedAt,
              officeConfirmedById = @officeConfirmedById,
              officeConfirmedByName = @officeConfirmedByName,
              updatedAt = SYSDATETIME()
          WHERE id = @id
        `);
    }
  } catch (err) {
    console.warn('[Inspections] MSSQL confirm update failed:', err.message);
  }

  if (target) {
    Object.assign(target, updateData);
    saveJsonFile(reportsFilePath, reports);
  }

  res.json({ success: true, report: target ? { ...target, ...updateData } : updateData });
});

// ====================================================================
// 5. 前回点検結果の取得 API (前回コピー用)
// ====================================================================
router.get(['/previous/:jobNo', '/inspection-reports/previous/:jobNo', '/inspections/previous/:jobNo'], async (req, res) => {
  const { jobNo } = req.params;
  try {
    const pool = await getPool();
    if (pool) {
      const result = await pool.request()
        .input('jobNo', sql.NVarChar(50), jobNo)
        .query(`
          SELECT TOP 1 * FROM dbo.InspectionReports
          WHERE jobNo = @jobNo AND status = 'signed'
          ORDER BY inspectionDate DESC, updatedAt DESC
        `);
      if (result.recordset && result.recordset.length > 0) {
        const report = mapDbRowToReport(result.recordset[0]);
        return res.json({ success: true, report, source: 'mssql' });
      }
    }
  } catch (err) {
    console.warn('[Inspections] MSSQL previous fetch failed:', err.message);
  }

  const reports = loadJsonFile(reportsFilePath, []);
  const matched = reports
    .filter(r => r.jobNo === jobNo && r.status === 'signed')
    .sort((a, b) => new Date(b.inspectionDate || 0).getTime() - new Date(a.inspectionDate || 0).getTime());

  res.json({ success: true, report: matched[0] || null, source: 'json' });
});

// ====================================================================
// 6. CRM点検データ 一括登録・同期 API
// ====================================================================
router.post(['/crm-data/bulk', '/inspections/crm-data/bulk', '/crm/bulk'], async (req, res) => {
  const { items, yearMonth, importedBy } = req.body;
  if (!Array.isArray(items)) {
    return res.status(400).json({ success: false, error: 'items array is required' });
  }

  try {
    const pool = await getPool();
    if (pool) {
      for (const item of items) {
        if (!item.jobNo) continue;
        await pool.request()
          .input('jobNo', sql.NVarChar(50), String(item.jobNo))
          .input('yearMonth', sql.NVarChar(10), String(item.yearMonth || yearMonth || ''))
          .input('customerName', sql.NVarChar(255), String(item.customerName || ''))
          .input('address', sql.NVarChar(500), item.address || null)
          .input('phone', sql.NVarChar(50), item.phone || null)
          .input('doorsCount', sql.Int, Number(item.doorsCount || item.totalDoorsCount) || 1)
          .input('doorsJson', sql.NVarChar(sql.MAX), JSON.stringify(item.doors || []))
          .input('importedBy', sql.NVarChar(50), importedBy || null)
          .query(`
            MERGE INTO dbo.CrmInspections AS Target
            USING (SELECT @jobNo AS jobNo) AS Source
            ON Target.jobNo = Source.jobNo
            WHEN MATCHED THEN
              UPDATE SET
                yearMonth = @yearMonth,
                customerName = @customerName,
                address = @address,
                phone = @phone,
                doorsCount = @doorsCount,
                doorsJson = @doorsJson,
                importedAt = SYSDATETIME(),
                importedBy = @importedBy
            WHEN NOT MATCHED THEN
              INSERT (jobNo, yearMonth, customerName, address, phone, doorsCount, doorsJson, importedAt, importedBy)
              VALUES (@jobNo, @yearMonth, @customerName, @address, @phone, @doorsCount, @doorsJson, SYSDATETIME(), @importedBy);
          `);
      }
    }
  } catch (err) {
    console.warn('[Inspections] MSSQL CRM bulk save error:', err.message);
  }

  // Local JSON同期
  const existingCrm = loadJsonFile(crmDataFilePath, []);
  const crmMap = new Map(existingCrm.map(i => [i.jobNo, i]));
  for (const it of items) {
    if (it.jobNo) crmMap.set(it.jobNo, it);
  }
  saveJsonFile(crmDataFilePath, Array.from(crmMap.values()));

  res.json({ success: true, count: items.length });
});

// ====================================================================
// 7. CRM点検データ 取得 API
// ====================================================================
router.get(['/crm-data', '/inspections/crm-data'], async (req, res) => {
  const { yearMonth } = req.query;
  try {
    const pool = await getPool();
    if (pool) {
      let query = 'SELECT * FROM dbo.CrmInspections WHERE 1=1';
      const request = pool.request();
      if (yearMonth) {
        query += ' AND yearMonth = @yearMonth';
        request.input('yearMonth', sql.NVarChar(10), String(yearMonth));
      }
      query += ' ORDER BY importedAt DESC';
      const result = await request.query(query);
      const items = (result.recordset || []).map(row => ({
        jobNo: row.jobNo,
        yearMonth: row.yearMonth,
        customerName: row.customerName,
        address: row.address,
        phone: row.phone,
        totalDoorsCount: row.doorsCount,
        doors: row.doorsJson ? JSON.parse(row.doorsJson) : [],
        importedAt: row.importedAt
      }));
      return res.json({ success: true, items, source: 'mssql' });
    }
  } catch (err) {
    console.warn('[Inspections] MSSQL CRM fetch failed:', err.message);
  }

  let items = loadJsonFile(crmDataFilePath, []);
  if (yearMonth) items = items.filter(i => i.yearMonth === yearMonth);
  res.json({ success: true, items, source: 'json' });
});

export default router;
