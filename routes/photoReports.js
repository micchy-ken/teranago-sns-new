/**
 * =====================================================================
 * routes/photoReports.js - 点検・写真報告書 API ルーター (完全版)
 * 最終更新日時: 2026年10月4日
 * 機能: 写真報告書(2〜4枚構成)の作成・更新・一覧取得・画像アップロード・MS SQL Server連携
 * =====================================================================
 */
import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { getPool } from '../db.js';
import { safeParseJSON, dataDir } from '../config.js';

const router = Router();

// データ保存用ファイル & アップロード先
const PHOTO_REPORTS_FILE = path.join(dataDir, 'inspectionPhotoReports.json');
const UPLOAD_DIR = path.join(process.cwd(), 'uploads', 'photo-reports');

// ディレクトリ・ファイルの確保
function ensureDirsAndFiles() {
  if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  if (!fs.existsSync(PHOTO_REPORTS_FILE)) {
    fs.writeFileSync(PHOTO_REPORTS_FILE, '[]', 'utf8');
  }
}
ensureDirsAndFiles();

// Multer 設定 (写真アップロード用)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    ensureDirsAndFiles();
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.jpg';
    const uniqueSuffix = `${Date.now()}_${Math.random().toString(36).substring(2, 8)}`;
    cb(null, `photo_${uniqueSuffix}${ext}`);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB (フロントエンドで1200px圧縮されるため十分)
});

// テーブル自動初期化
async function initTables(pool) {
  try {
    await pool.request().query(`
      IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'InspectionPhotoReports' AND schema_id = SCHEMA_ID('dbo'))
      BEGIN
        CREATE TABLE dbo.InspectionPhotoReports (
          id NVARCHAR(64) PRIMARY KEY,
          inspectionReportId NVARCHAR(64) NULL,
          jobNo NVARCHAR(64) NULL,
          title NVARCHAR(255) NOT NULL,
          customerName NVARCHAR(128) NULL,
          buildingName NVARCHAR(128) NULL,
          location NVARCHAR(128) NULL,
          workSubject NVARCHAR(255) NULL,
          workDate NVARCHAR(32) NULL,
          layoutType NVARCHAR(32) NOT NULL DEFAULT '3_items',
          photos NVARCHAR(MAX) NOT NULL,
          createdById NVARCHAR(64) NOT NULL,
          createdByName NVARCHAR(128) NOT NULL,
          createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_InspectionPhotoReports_reportId ON dbo.InspectionPhotoReports(inspectionReportId);
        CREATE INDEX IX_InspectionPhotoReports_jobNo ON dbo.InspectionPhotoReports(jobNo);
        CREATE INDEX IX_InspectionPhotoReports_createdAt ON dbo.InspectionPhotoReports(createdAt DESC);
      END
    `);
  } catch (err) {
    console.warn('[PhotoReports] DB table init failed (using fallback if needed):', err.message);
  }
}

// ==========================================
// 1. 写真報告書一覧取得 (GET /api/photo-reports)
// ==========================================
router.get(['/photo-reports', '/api/photo-reports', '/inspection-photo-reports'], async (req, res) => {
  try {
    const { inspectionReportId, jobNo, userId } = req.query;
    const pool = await getPool();

    if (pool) {
      await initTables(pool);
      let queryStr = `SELECT * FROM dbo.InspectionPhotoReports WHERE 1=1`;
      const request = pool.request();

      if (inspectionReportId) {
        queryStr += ` AND inspectionReportId = @inspectionReportId`;
        request.input('inspectionReportId', sql.NVarChar(64), String(inspectionReportId));
      }
      if (jobNo) {
        queryStr += ` AND jobNo = @jobNo`;
        request.input('jobNo', sql.NVarChar(64), String(jobNo));
      }
      if (userId) {
        queryStr += ` AND createdById = @userId`;
        request.input('userId', sql.NVarChar(64), String(userId));
      }

      queryStr += ` ORDER BY createdAt DESC`;

      const result = await request.query(queryStr);
      const reports = (result.recordset || []).map(row => ({
        id: String(row.id),
        inspectionReportId: row.inspectionReportId ? String(row.inspectionReportId) : null,
        jobNo: row.jobNo || '',
        title: row.title,
        customerName: row.customerName || '',
        buildingName: row.buildingName || '',
        location: row.location || '',
        workSubject: row.workSubject || '',
        workDate: row.workDate || '',
        layoutType: row.layoutType || '3_items',
        photos: safeParseJSON(row.photos, []),
        createdById: String(row.createdById),
        createdByName: row.createdByName,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      }));

      return res.json(reports);
    } else {
      ensureDirsAndFiles();
      const raw = fs.readFileSync(PHOTO_REPORTS_FILE, 'utf8');
      let reports = safeParseJSON(raw, []);

      if (inspectionReportId) {
        reports = reports.filter(r => r.inspectionReportId === String(inspectionReportId));
      }
      if (jobNo) {
        reports = reports.filter(r => r.jobNo === String(jobNo));
      }
      if (userId) {
        reports = reports.filter(r => r.createdById === String(userId));
      }

      return res.json(reports);
    }
  } catch (err) {
    console.error('[PhotoReports GET Error]:', err);
    res.status(500).json({ error: '写真報告書一覧の取得に失敗しました', details: err.message });
  }
});

// ==========================================
// 2. 写真報告書詳細取得 (GET /api/photo-reports/:id)
// ==========================================
router.get(['/photo-reports/:id', '/api/photo-reports/:id', '/inspection-photo-reports/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    if (pool) {
      await initTables(pool);
      const result = await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`SELECT * FROM dbo.InspectionPhotoReports WHERE id = @id`;

      if (!result.recordset || result.recordset.length === 0) {
        return res.status(404).json({ error: '指定された写真報告書が見つかりません' });
      }

      const row = result.recordset[0];
      const report = {
        id: String(row.id),
        inspectionReportId: row.inspectionReportId ? String(row.inspectionReportId) : null,
        jobNo: row.jobNo || '',
        title: row.title,
        customerName: row.customerName || '',
        buildingName: row.buildingName || '',
        location: row.location || '',
        workSubject: row.workSubject || '',
        workDate: row.workDate || '',
        layoutType: row.layoutType || '3_items',
        photos: safeParseJSON(row.photos, []),
        createdById: String(row.createdById),
        createdByName: row.createdByName,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      };

      return res.json(report);
    } else {
      ensureDirsAndFiles();
      const raw = fs.readFileSync(PHOTO_REPORTS_FILE, 'utf8');
      const reports = safeParseJSON(raw, []);
      const report = reports.find(r => r.id === id);

      if (!report) {
        return res.status(404).json({ error: '指定された写真報告書が見つかりません' });
      }

      return res.json(report);
    }
  } catch (err) {
    console.error('[PhotoReports GET Detail Error]:', err);
    res.status(500).json({ error: '写真報告書詳細の取得に失敗しました', details: err.message });
  }
});

// ==========================================
// 3. 写真画像ファイルアップロード (POST /api/photo-reports/upload)
// ==========================================
router.post(
  ['/photo-reports/upload', '/api/photo-reports/upload', '/inspection-photo-reports/upload'],
  upload.single('photo'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '画像ファイルが指定されていません' });
      }

      // 公開アクセス用URL
      const fileUrl = `/uploads/photo-reports/${req.file.filename}`;
      res.json({
        success: true,
        fileUrl,
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
      });
    } catch (err) {
      console.error('[PhotoReports Upload Error]:', err);
      res.status(500).json({ error: '画像のアップロードに失敗しました', details: err.message });
    }
  }
);

// ==========================================
// 4. 新規写真報告書作成 (POST /api/photo-reports)
// ==========================================
router.post(['/photo-reports', '/api/photo-reports', '/inspection-photo-reports'], async (req, res) => {
  try {
    const {
      inspectionReportId = null,
      jobNo = '',
      title,
      customerName = '',
      buildingName = '',
      location = '',
      workSubject = '',
      workDate = '',
      layoutType = '3_items',
      photos = [],
      createdById,
      createdByName,
    } = req.body;

    if (!title || !createdById || !createdByName) {
      return res.status(400).json({ error: 'タイトルおよび作成者情報は必須です' });
    }

    const id = `photo_rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const nowIso = new Date().toISOString();

    const newReport = {
      id,
      inspectionReportId: inspectionReportId || null,
      jobNo: jobNo || '',
      title,
      customerName: customerName || '',
      buildingName: buildingName || '',
      location: location || '',
      workSubject: workSubject || '',
      workDate: workDate || '',
      layoutType: layoutType || '3_items',
      photos: Array.isArray(photos) ? photos : [],
      createdById: String(createdById),
      createdByName,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const pool = await getPool();
    if (pool) {
      await initTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(64), newReport.id)
        .input('inspectionReportId', sql.NVarChar(64), newReport.inspectionReportId)
        .input('jobNo', sql.NVarChar(64), newReport.jobNo)
        .input('title', sql.NVarChar(255), newReport.title)
        .input('customerName', sql.NVarChar(128), newReport.customerName)
        .input('buildingName', sql.NVarChar(128), newReport.buildingName)
        .input('location', sql.NVarChar(128), newReport.location)
        .input('workSubject', sql.NVarChar(255), newReport.workSubject)
        .input('workDate', sql.NVarChar(32), newReport.workDate)
        .input('layoutType', sql.NVarChar(32), newReport.layoutType)
        .input('photos', sql.NVarChar(sql.MAX), JSON.stringify(newReport.photos))
        .input('createdById', sql.NVarChar(64), newReport.createdById)
        .input('createdByName', sql.NVarChar(128), newReport.createdByName)
        .query`
          INSERT INTO dbo.InspectionPhotoReports (
            id, inspectionReportId, jobNo, title, customerName, buildingName,
            location, workSubject, workDate, layoutType, photos,
            createdById, createdByName, createdAt, updatedAt
          ) VALUES (
            @id, @inspectionReportId, @jobNo, @title, @customerName, @buildingName,
            @location, @workSubject, @workDate, @layoutType, @photos,
            @createdById, @createdByName, SYSUTCDATETIME(), SYSUTCDATETIME()
          )
        `;
    } else {
      ensureDirsAndFiles();
      const raw = fs.readFileSync(PHOTO_REPORTS_FILE, 'utf8');
      const list = safeParseJSON(raw, []);
      list.unshift(newReport);
      fs.writeFileSync(PHOTO_REPORTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    }

    res.status(201).json(newReport);
  } catch (err) {
    console.error('[PhotoReports POST Error]:', err);
    res.status(500).json({ error: '写真報告書の作成に失敗しました', details: err.message });
  }
});

// ==========================================
// 5. 写真報告書更新 (PUT /api/photo-reports/:id)
// ==========================================
router.put(['/photo-reports/:id', '/api/photo-reports/:id', '/inspection-photo-reports/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const {
      inspectionReportId,
      jobNo,
      title,
      customerName,
      buildingName,
      location,
      workSubject,
      workDate,
      layoutType,
      photos,
    } = req.body;

    const pool = await getPool();
    const nowIso = new Date().toISOString();

    if (pool) {
      await initTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(64), id)
        .input('inspectionReportId', sql.NVarChar(64), inspectionReportId || null)
        .input('jobNo', sql.NVarChar(64), jobNo || '')
        .input('title', sql.NVarChar(255), title)
        .input('customerName', sql.NVarChar(128), customerName || '')
        .input('buildingName', sql.NVarChar(128), buildingName || '')
        .input('location', sql.NVarChar(128), location || '')
        .input('workSubject', sql.NVarChar(255), workSubject || '')
        .input('workDate', sql.NVarChar(32), workDate || '')
        .input('layoutType', sql.NVarChar(32), layoutType || '3_items')
        .input('photos', sql.NVarChar(sql.MAX), JSON.stringify(photos || []))
        .query`
          UPDATE dbo.InspectionPhotoReports SET
            inspectionReportId = @inspectionReportId,
            jobNo = @jobNo,
            title = @title,
            customerName = @customerName,
            buildingName = @buildingName,
            location = @location,
            workSubject = @workSubject,
            workDate = @workDate,
            layoutType = @layoutType,
            photos = @photos,
            updatedAt = SYSUTCDATETIME()
          WHERE id = @id
        `;
    } else {
      ensureDirsAndFiles();
      const raw = fs.readFileSync(PHOTO_REPORTS_FILE, 'utf8');
      const list = safeParseJSON(raw, []);
      const idx = list.findIndex(r => r.id === id);
      if (idx >= 0) {
        list[idx] = {
          ...list[idx],
          inspectionReportId: inspectionReportId !== undefined ? inspectionReportId : list[idx].inspectionReportId,
          jobNo: jobNo !== undefined ? jobNo : list[idx].jobNo,
          title: title !== undefined ? title : list[idx].title,
          customerName: customerName !== undefined ? customerName : list[idx].customerName,
          buildingName: buildingName !== undefined ? buildingName : list[idx].buildingName,
          location: location !== undefined ? location : list[idx].location,
          workSubject: workSubject !== undefined ? workSubject : list[idx].workSubject,
          workDate: workDate !== undefined ? workDate : list[idx].workDate,
          layoutType: layoutType !== undefined ? layoutType : list[idx].layoutType,
          photos: photos !== undefined ? photos : list[idx].photos,
          updatedAt: nowIso,
        };
        fs.writeFileSync(PHOTO_REPORTS_FILE, JSON.stringify(list, null, 2), 'utf8');
      }
    }

    res.json({ success: true, message: '写真報告書を更新しました' });
  } catch (err) {
    console.error('[PhotoReports PUT Error]:', err);
    res.status(500).json({ error: '写真報告書の更新に失敗しました', details: err.message });
  }
});

// ==========================================
// 6. 写真報告書削除 (DELETE /api/photo-reports/:id)
// ==========================================
router.delete(['/photo-reports/:id', '/api/photo-reports/:id', '/inspection-photo-reports/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    if (pool) {
      await initTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`DELETE FROM dbo.InspectionPhotoReports WHERE id = @id`;
    } else {
      ensureDirsAndFiles();
      const raw = fs.readFileSync(PHOTO_REPORTS_FILE, 'utf8');
      let list = safeParseJSON(raw, []);
      list = list.filter(r => r.id !== id);
      fs.writeFileSync(PHOTO_REPORTS_FILE, JSON.stringify(list, null, 2), 'utf8');
    }

    res.json({ success: true, message: '写真報告書を削除しました' });
  } catch (err) {
    console.error('[PhotoReports DELETE Error]:', err);
    res.status(500).json({ error: '写真報告書の削除に失敗しました', details: err.message });
  }
});

export default router;
