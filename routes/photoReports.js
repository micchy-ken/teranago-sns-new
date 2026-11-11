/**
 * =====================================================================
 * routes/photoReports.js - 点検・写真報告書 API ルーター (完全版)
 * 最終更新日時: 2026年11月11日 (Step 3 パフォーマンス改善 ＆ ルーティング競合修正：initTablesの初回1回実行キャッシュ化・非同期ファイルI/O化・一覧ページネーション・baseUrl正規化対応版)
 * 機能: 写真報告書(2〜4枚構成)の作成・更新・一覧取得・下書き保存・No手動紐付け・画像アップロード・写真画像直接配信(/api/photo-reports/image/:filename)・MS SQL Server連携
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

// app.use('/api/photo-reports', photoReportsRouter) マウント時にも内部で /photo-reports プレフィックスへ正規化
router.use((req, res, next) => {
  if (req.baseUrl && /\/(photo-reports|inspection-photo-reports)\/?$/i.test(req.baseUrl) && !/^\/(photo-reports|api\/photo-reports|inspection-photo-reports)(\/|\?|$)/i.test(req.url)) {
    req.url = '/photo-reports' + (req.url.startsWith('/') ? req.url : '/' + req.url);
  }
  next();
});

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

// 非同期ファイル読み込み・保存ヘルパー（メモリキャッシュ付き）
let cachedPhotoReports = null;
async function loadPhotoReportsFromFileAsync() {
  if (Array.isArray(cachedPhotoReports)) {
    return cachedPhotoReports;
  }
  try {
    ensureDirsAndFiles();
    const raw = await fs.promises.readFile(PHOTO_REPORTS_FILE, 'utf8');
    cachedPhotoReports = safeParseJSON(raw, []);
    return Array.isArray(cachedPhotoReports) ? cachedPhotoReports : [];
  } catch (_) {
    cachedPhotoReports = [];
    return cachedPhotoReports;
  }
}

async function savePhotoReportsToFileAsync(list) {
  cachedPhotoReports = Array.isArray(list) ? list : [];
  try {
    ensureDirsAndFiles();
    await fs.promises.writeFile(PHOTO_REPORTS_FILE, JSON.stringify(cachedPhotoReports, null, 2), 'utf8');
  } catch (err) {
    console.error('[PhotoReports] Async file save error:', err);
  }
}

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

// テーブル自動初期化 ＆ マイグレーション（プロセス起動後1回のみ実行）
let isPhotoTablesInitialized = false;
async function initTables(pool) {
  if (isPhotoTablesInitialized || !pool) return;
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
          status NVARCHAR(32) NOT NULL DEFAULT 'completed',
          createdById NVARCHAR(64) NOT NULL,
          createdByName NVARCHAR(128) NOT NULL,
          createdAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME(),
          updatedAt DATETIME2 NOT NULL DEFAULT SYSUTCDATETIME()
        );
        CREATE INDEX IX_InspectionPhotoReports_reportId ON dbo.InspectionPhotoReports(inspectionReportId);
        CREATE INDEX IX_InspectionPhotoReports_jobNo ON dbo.InspectionPhotoReports(jobNo);
        CREATE INDEX IX_InspectionPhotoReports_createdAt ON dbo.InspectionPhotoReports(createdAt DESC);
      END
      ELSE
      BEGIN
        -- 既存テーブルへの status カラム追加マイグレーション
        IF NOT EXISTS (SELECT * FROM sys.columns WHERE object_id = OBJECT_ID('dbo.InspectionPhotoReports') AND name = 'status')
        BEGIN
          ALTER TABLE dbo.InspectionPhotoReports ADD status NVARCHAR(32) NOT NULL DEFAULT 'completed';
        END
        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE name = 'IX_InspectionPhotoReports_createdAt' AND object_id = OBJECT_ID('dbo.InspectionPhotoReports'))
        BEGIN
          CREATE INDEX IX_InspectionPhotoReports_createdAt ON dbo.InspectionPhotoReports(createdAt DESC);
        END
      END
    `);
    isPhotoTablesInitialized = true;
  } catch (err) {
    console.warn('[PhotoReports] DB table init failed (using fallback if needed):', err.message);
  }
}

// ==========================================
// 1. 写真報告書一覧取得 (GET /api/photo-reports)
// ==========================================
router.get(['/photo-reports', '/photo-reports/', '/api/photo-reports', '/inspection-photo-reports'], async (req, res) => {
  try {
    const { inspectionReportId, jobNo, userId, status } = req.query;
    const fetchAll = req.query.all === 'true';
    const parsedLimit = parseInt(String(req.query.limit || '200'), 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 1000) : 200;
    const parsedOffset = parseInt(String(req.query.offset || '0'), 10);
    const offset = Number.isFinite(parsedOffset) && parsedOffset >= 0 ? parsedOffset : 0;

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
      if (status) {
        queryStr += ` AND status = @status`;
        request.input('status', sql.NVarChar(32), String(status));
      }

      queryStr += ` ORDER BY createdAt DESC`;
      if (!fetchAll) {
        request.input('offset', sql.Int, offset);
        request.input('limit', sql.Int, limit);
        queryStr += ` OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`;
      }

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
        status: row.status || 'completed',
        createdById: String(row.createdById),
        createdByName: row.createdByName,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      }));

      return res.json(reports);
    } else {
      let reports = [...(await loadPhotoReportsFromFileAsync())];

      if (inspectionReportId) {
        reports = reports.filter(r => r.inspectionReportId === String(inspectionReportId));
      }
      if (jobNo) {
        reports = reports.filter(r => r.jobNo === String(jobNo));
      }
      if (userId) {
        reports = reports.filter(r => r.createdById === String(userId));
      }
      if (status) {
        reports = reports.filter(r => r.status === String(status));
      }

      if (!fetchAll) {
        reports = reports.slice(offset, offset + limit);
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
router.get(['/photo-reports/:id', '/photo-reports/:id/', '/api/photo-reports/:id', '/inspection-photo-reports/:id'], async (req, res, next) => {
  try {
    const { id } = req.params;
    if (id === 'upload' || id === 'image' || id === 'file') {
      return next();
    }
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
        status: row.status || 'completed',
        createdById: String(row.createdById),
        createdByName: row.createdByName,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        updatedAt: row.updatedAt ? row.updatedAt.toISOString() : null,
      };

      return res.json(report);
    } else {
      const reports = await loadPhotoReportsFromFileAsync();
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
  ['/photo-reports/upload', '/api/photo-reports/upload', '/inspection-photo-reports/upload', '/upload'],
  upload.single('photo'),
  (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: '画像ファイルが指定されていません' });
      }

      // 公開アクセス用URL（Synologyリバースプロキシを安全に通過する/api経由）
      const fileUrl = `/api/photo-reports/image/${req.file.filename}`;
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
// 3.5 写真画像の直接配信フォールバック (GET /api/photo-reports/image/:filename, /image/:filename)
// ==========================================
router.get(
  [
    '/image/:filename',
    '/file/:filename',
    '/photo-reports/image/:filename',
    '/photo-reports/file/:filename',
    '/uploads/photo-reports/:filename',
    '/api/uploads/photo-reports/:filename',
  ],
  (req, res) => {
    try {
      const filename = path.basename(req.params.filename);
      const filePath = path.join(UPLOAD_DIR, filename);
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.setHeader('Cache-Control', 'public, max-age=2592000, immutable');
      if (fs.existsSync(filePath)) {
        return res.sendFile(filePath);
      }
      res.status(404).send('Not Found');
    } catch (err) {
      console.error('[PhotoReports Image Serve Error]:', err);
      res.status(500).send('Error');
    }
  }
);

// ==========================================
// 4. 新規写真報告書作成 (POST /api/photo-reports)
// ==========================================
router.post(['/photo-reports', '/photo-reports/', '/api/photo-reports', '/inspection-photo-reports'], async (req, res) => {
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
      status = 'completed',
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
      status: status || 'completed',
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
        .input('status', sql.NVarChar(32), newReport.status)
        .input('createdById', sql.NVarChar(64), newReport.createdById)
        .input('createdByName', sql.NVarChar(128), newReport.createdByName)
        .query`
          INSERT INTO dbo.InspectionPhotoReports (
            id, inspectionReportId, jobNo, title, customerName, buildingName,
            location, workSubject, workDate, layoutType, photos, status,
            createdById, createdByName, createdAt, updatedAt
          ) VALUES (
            @id, @inspectionReportId, @jobNo, @title, @customerName, @buildingName,
            @location, @workSubject, @workDate, @layoutType, @photos, @status,
            @createdById, @createdByName, SYSUTCDATETIME(), SYSUTCDATETIME()
          )
        `;
    } else {
      const list = [...(await loadPhotoReportsFromFileAsync())];
      list.unshift(newReport);
      await savePhotoReportsToFileAsync(list);
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
router.put(['/photo-reports/:id', '/photo-reports/:id/', '/api/photo-reports/:id', '/inspection-photo-reports/:id'], async (req, res) => {
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
      status,
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
        .input('status', sql.NVarChar(32), status || 'completed')
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
            status = @status,
            updatedAt = SYSUTCDATETIME()
          WHERE id = @id
        `;
    } else {
      const list = [...(await loadPhotoReportsFromFileAsync())];
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
          status: status !== undefined ? status : list[idx].status,
          updatedAt: nowIso,
        };
        await savePhotoReportsToFileAsync(list);
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
router.delete(['/photo-reports/:id', '/photo-reports/:id/', '/api/photo-reports/:id', '/inspection-photo-reports/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    if (pool) {
      await initTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(64), id)
        .query`DELETE FROM dbo.InspectionPhotoReports WHERE id = @id`;
    } else {
      const list = (await loadPhotoReportsFromFileAsync()).filter(r => r.id !== id);
      await savePhotoReportsToFileAsync(list);
    }

    res.json({ success: true, message: '写真報告書を削除しました' });
  } catch (err) {
    console.error('[PhotoReports DELETE Error]:', err);
    res.status(500).json({ error: '写真報告書の削除に失敗しました', details: err.message });
  }
});

export default router;
