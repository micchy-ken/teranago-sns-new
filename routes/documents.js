/**
 * routes/documents.js
 * 寺岡オートドアSNS / 寺子屋SNS 文書管理・フォルダ機能モジュール (Express & MS SQL Server & JSON Fallback)
 * 
 * 最終更新: 2026年10月2日 (閲覧権限フィルタ厳密化 & プレビュー配信エンドポイント /api/uploads/documents 追加)
 */
import { Router } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { getPool } from '../db.js';

const require = createRequire(import.meta.url);
const archiver = require('archiver');

const router = Router();

// ==========================================
// ディレクトリ構成 & ストレージ設定
// ==========================================
const dataDir = path.join(process.cwd(), 'data');
if (!fs.existsSync(dataDir)) {
  try { fs.mkdirSync(dataDir, { recursive: true }); } catch (_) {}
}

const documentsDir = path.join(process.cwd(), 'uploads', 'documents');
if (!fs.existsSync(documentsDir)) {
  try { fs.mkdirSync(documentsDir, { recursive: true }); } catch (_) {}
}

const jsonStorePath = path.join(dataDir, 'documents.json');

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

// JSONフォールバック用データ読み書き
function loadLocalDocumentsData() {
  if (!fs.existsSync(jsonStorePath)) {
    const initialData = {
      folders: [
        {
          id: 'folder_root_general',
          name: '全社共有キャビネット',
          description: '全社向けのマニュアル・社内規程・各種テンプレート集です。',
          parentId: null,
          createdById: 'u1',
          createdByName: 'システム管理者',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          permission: {
            viewers: 'all',
            editors: 'all'
          }
        },
        {
          id: 'folder_general_forms',
          name: '各種申請書・届出書式',
          description: '総務・経理関連の申請書テンプレートです。',
          parentId: 'folder_root_general',
          createdById: 'u1',
          createdByName: 'システム管理者',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          permission: {
            viewers: 'all',
            editors: 'all'
          }
        }
      ],
      items: [],
      downloads: []
    };
    try {
      fs.writeFileSync(jsonStorePath, JSON.stringify(initialData, null, 2), 'utf8');
      return initialData;
    } catch (_) {
      return initialData;
    }
  }
  try {
    const data = JSON.parse(fs.readFileSync(jsonStorePath, 'utf8'));
    if (!data.folders) data.folders = [];
    if (!data.items) data.items = [];
    if (!data.downloads) data.downloads = [];
    return data;
  } catch (_) {
    return { folders: [], items: [], downloads: [] };
  }
}

function saveLocalDocumentsData(data) {
  try {
    fs.writeFileSync(jsonStorePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('[Documents JSON Save Error]:', err);
  }
}

// Multer ストレージ設定（日本語ファイル名の文字化け防止）
const documentStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    if (!fs.existsSync(documentsDir)) {
      try { fs.mkdirSync(documentsDir, { recursive: true }); } catch (_) {}
    }
    cb(null, documentsDir);
  },
  filename: function (req, file, cb) {
    let originalName = file.originalname;
    try {
      originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
    } catch (_) {}
    const safeBaseName = path.basename(originalName).replace(/[^\w\.\-\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/g, '_');
    cb(null, `${Date.now()}_${Math.random().toString(36).slice(2, 7)}_${safeBaseName}`);
  }
});
const uploadDocumentFiles = multer({
  storage: documentStorage,
  limits: { fileSize: 100 * 1024 * 1024 } // 最大 100MB
});

// SQL Server テーブルスキーマ自動補正
let schemaChecked = false;
async function ensureDocumentsSchema(pool) {
  if (schemaChecked || !pool) return;
  try {
    await pool.request().query(`
      IF OBJECT_ID('dbo.DocumentFolders', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.DocumentFolders (
          id NVARCHAR(100) PRIMARY KEY,
          name NVARCHAR(200) NOT NULL,
          description NVARCHAR(MAX) NULL,
          parentId NVARCHAR(100) NULL,
          orderIndex INT DEFAULT 0,
          createdById NVARCHAR(100) NOT NULL,
          createdByName NVARCHAR(100) NOT NULL,
          createdAt NVARCHAR(50) NOT NULL,
          updatedAt NVARCHAR(50) NOT NULL,
          permissionJson NVARCHAR(MAX) NOT NULL
        );
      END

      IF OBJECT_ID('dbo.DocumentItems', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.DocumentItems (
          id NVARCHAR(100) PRIMARY KEY,
          folderId NVARCHAR(100) NOT NULL,
          title NVARCHAR(300) NOT NULL,
          description NVARCHAR(MAX) NULL,
          createdById NVARCHAR(100) NOT NULL,
          createdByName NVARCHAR(100) NOT NULL,
          createdAt NVARCHAR(50) NOT NULL,
          updatedById NVARCHAR(100) NOT NULL,
          updatedByName NVARCHAR(100) NOT NULL,
          updatedAt NVARCHAR(50) NOT NULL,
          downloadCount INT DEFAULT 0,
          versionsJson NVARCHAR(MAX) NOT NULL
        );
      END

      IF OBJECT_ID('dbo.DocumentDownloads', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.DocumentDownloads (
          id NVARCHAR(100) PRIMARY KEY,
          documentId NVARCHAR(100) NOT NULL,
          versionNumber INT NOT NULL,
          fileId NVARCHAR(100) NULL,
          fileName NVARCHAR(300) NULL,
          userId NVARCHAR(100) NOT NULL,
          userName NVARCHAR(100) NOT NULL,
          userDepartment NVARCHAR(200) NULL,
          downloadedAt NVARCHAR(50) NOT NULL
        );
      END
    `);
    schemaChecked = true;
  } catch (err) {
    console.warn('[Documents Schema Warning]:', err.message);
  }
}

// ユーザーがフォルダを閲覧できるか判定するヘルパー
function canUserViewFolder(folder, userId, isAdmin = false) {
  if (isAdmin) return true;
  if (!folder) return true;
  if (!folder.permission || folder.permission.viewers === 'all') return true;
  if (folder.createdById === userId) return true;
  if (Array.isArray(folder.permission.viewers)) {
    return folder.permission.viewers.includes(userId);
  }
  return false;
}

// ユーザーがフォルダ内を編集（追加・更新・削除）できるか判定するヘルパー
function canUserEditFolder(folder, userId, isAdmin = false) {
  if (isAdmin) return true;
  if (!folder) return false;
  if (!folder.permission || folder.permission.editors === 'all') return true;
  if (folder.createdById === userId) return true;
  if (Array.isArray(folder.permission.editors)) {
    return folder.permission.editors.includes(userId);
  }
  return false;
}

// 祖先フォルダも含めてユーザーが閲覧できるかを再帰判定するヘルパー
function hasAccessToFolderRecursively(folderId, allFolders, userId, isAdmin = false) {
  if (isAdmin) return true;
  if (!folderId || folderId === 'root') return true;
  let curr = allFolders.find(f => f.id === folderId);
  while (curr) {
    if (!canUserViewFolder(curr, userId, isAdmin)) return false;
    if (!curr.parentId) break;
    curr = allFolders.find(f => f.id === curr.parentId);
  }
  return true;
}

// ==========================================
// プレビュー・ファイル直接配信 API (画像・PDFをブラウザでインライン表示)
// マウント方式 (/api または /api/documents) を問わず配信可能
// ==========================================
router.get([
  '/uploads/documents/:filename',
  '/documents/uploads/:filename',
  '/uploads/:filename',
  '/file/:filename',
  '/preview/:filename'
], (req, res) => {
  try {
    const rawFilename = decodeURIComponent(req.params.filename || '');
    const safeName = path.basename(rawFilename);
    const filePath = path.join(documentsDir, safeName);

    if (!fs.existsSync(filePath)) {
      return res.status(404).send('ファイルが見つかりません。');
    }

    const ext = path.extname(safeName).toLowerCase();
    if (ext === '.pdf') {
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'inline');
    } else if (['.png', '.jpg', '.jpeg', '.gif', '.svg', '.webp'].includes(ext)) {
      res.setHeader('Content-Disposition', 'inline');
    }

    res.sendFile(filePath);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// ==========================================
// 1. フォルダ一覧取得 API
// 対応URL: /folders, /documents/folders, /
// ==========================================
router.get(['/folders', '/documents/folders', '/folders/list'], async (req, res) => {
  try {
    const userId = req.query.userId ? String(req.query.userId) : '';
    const isAdmin = req.query.isAdmin === 'true' || req.query.isAdmin === '1';

    let folders = [];
    let items = [];

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      const folderRes = await pool.request().query(`SELECT * FROM dbo.DocumentFolders ORDER BY orderIndex ASC, createdAt ASC`);
      folders = (folderRes.recordset || []).map(r => ({
        id: r.id,
        name: r.name,
        description: r.description || '',
        parentId: r.parentId || null,
        orderIndex: r.orderIndex || 0,
        createdById: r.createdById,
        createdByName: r.createdByName,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
        permission: safeParseJSON(r.permissionJson, { viewers: 'all', editors: 'all' })
      }));

      const itemsRes = await pool.request().query(`SELECT id, folderId FROM dbo.DocumentItems`);
      items = itemsRes.recordset || [];
    } else {
      const local = loadLocalDocumentsData();
      folders = local.folders || [];
      items = local.items || [];
    }

    // 各フォルダの子要素数（サブフォルダ数、ドキュメント数）を計算
    const result = folders.map(f => {
      const subfolderCount = folders.filter(sub => sub.parentId === f.id).length;
      const documentCount = items.filter(it => it.folderId === f.id).length;
      const isViewer = hasAccessToFolderRecursively(f.id, folders, userId, isAdmin);
      const isEditor = canUserEditFolder(f, userId, isAdmin);
      return {
        ...f,
        subfolderCount,
        documentCount,
        canView: isViewer,
        canEdit: isEditor
      };
    });

    res.json(result);
  } catch (err) {
    console.error('[Documents Folders Get Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 2. フォルダ新規作成 API
// ==========================================
router.post(['/folders', '/documents/folders'], async (req, res) => {
  try {
    const { name, description = '', parentId = null, createdById, createdByName, permission } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'フォルダ名は必須です。' });
    }

    const newFolder = {
      id: `folder_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name: name.trim(),
      description: description.trim(),
      parentId: parentId || null,
      orderIndex: 0,
      createdById: createdById || 'unknown',
      createdByName: createdByName || 'ユーザー',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      permission: permission || { viewers: 'all', editors: 'all' }
    };

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      await pool.request()
        .input('id', newFolder.id)
        .input('name', newFolder.name)
        .input('description', newFolder.description)
        .input('parentId', newFolder.parentId)
        .input('orderIndex', newFolder.orderIndex)
        .input('createdById', newFolder.createdById)
        .input('createdByName', newFolder.createdByName)
        .input('createdAt', newFolder.createdAt)
        .input('updatedAt', newFolder.updatedAt)
        .input('permissionJson', JSON.stringify(newFolder.permission))
        .query(`
          INSERT INTO dbo.DocumentFolders (id, name, description, parentId, orderIndex, createdById, createdByName, createdAt, updatedAt, permissionJson)
          VALUES (@id, @name, @description, @parentId, @orderIndex, @createdById, @createdByName, @createdAt, @updatedAt, @permissionJson)
        `);
    } else {
      const local = loadLocalDocumentsData();
      local.folders.push(newFolder);
      saveLocalDocumentsData(local);
    }

    res.json({ success: true, folder: newFolder });
  } catch (err) {
    console.error('[Documents Folder Create Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 3. フォルダ更新 API (名称、説明、権限設定)
// ==========================================
router.put(['/folders/:id', '/documents/folders/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const { name, description, parentId, permission } = req.body;
    const nowIso = new Date().toISOString();

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      const findRes = await pool.request().input('id', id).query(`SELECT * FROM dbo.DocumentFolders WHERE id = @id`);
      if (!findRes.recordset || findRes.recordset.length === 0) {
        return res.status(404).json({ error: '対象のフォルダが見つかりません。' });
      }

      const current = findRes.recordset[0];
      const updatedName = name !== undefined ? name.trim() : current.name;
      const updatedDesc = description !== undefined ? description.trim() : current.description;
      const updatedParentId = parentId !== undefined ? (parentId || null) : current.parentId;
      const updatedPermission = permission !== undefined ? permission : safeParseJSON(current.permissionJson);

      await pool.request()
        .input('id', id)
        .input('name', updatedName)
        .input('description', updatedDesc)
        .input('parentId', updatedParentId)
        .input('updatedAt', nowIso)
        .input('permissionJson', JSON.stringify(updatedPermission))
        .query(`
          UPDATE dbo.DocumentFolders
          SET name = @name, description = @description, parentId = @parentId, updatedAt = @updatedAt, permissionJson = @permissionJson
          WHERE id = @id
        `);

      res.json({ success: true, folder: { ...current, name: updatedName, description: updatedDesc, parentId: updatedParentId, updatedAt: nowIso, permission: updatedPermission } });
    } else {
      const local = loadLocalDocumentsData();
      const idx = local.folders.findIndex(f => f.id === id);
      if (idx < 0) return res.status(404).json({ error: '対象のフォルダが見つかりません。' });

      local.folders[idx] = {
        ...local.folders[idx],
        name: name !== undefined ? name.trim() : local.folders[idx].name,
        description: description !== undefined ? description.trim() : local.folders[idx].description,
        parentId: parentId !== undefined ? (parentId || null) : local.folders[idx].parentId,
        permission: permission !== undefined ? permission : local.folders[idx].permission,
        updatedAt: nowIso
      };
      saveLocalDocumentsData(local);
      res.json({ success: true, folder: local.folders[idx] });
    }
  } catch (err) {
    console.error('[Documents Folder Update Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 4. フォルダ削除 API
// ==========================================
router.delete(['/folders/:id', '/documents/folders/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      // サブフォルダおよびドキュメントの存在確認
      const subCheck = await pool.request().input('id', id).query(`SELECT COUNT(*) as cnt FROM dbo.DocumentFolders WHERE parentId = @id`);
      const itemCheck = await pool.request().input('id', id).query(`SELECT COUNT(*) as cnt FROM dbo.DocumentItems WHERE folderId = @id`);
      const subCount = subCheck.recordset[0]?.cnt || 0;
      const itemCount = itemCheck.recordset[0]?.cnt || 0;

      if (subCount > 0 || itemCount > 0) {
        return res.status(400).json({ error: 'フォルダ内にサブフォルダまたは文書が存在するため削除できません。空にしてから削除してください。' });
      }

      await pool.request().input('id', id).query(`DELETE FROM dbo.DocumentFolders WHERE id = @id`);
      res.json({ success: true });
    } else {
      const local = loadLocalDocumentsData();
      const hasSub = local.folders.some(f => f.parentId === id);
      const hasItem = local.items.some(i => i.folderId === id);
      if (hasSub || hasItem) {
        return res.status(400).json({ error: 'フォルダ内にサブフォルダまたは文書が存在するため削除できません。空にしてから削除してください。' });
      }
      local.folders = local.folders.filter(f => f.id !== id);
      saveLocalDocumentsData(local);
      res.json({ success: true });
    }
  } catch (err) {
    console.error('[Documents Folder Delete Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 5. ドキュメント一覧取得 API
// 対応URL: /items, /documents/items, /items/list
// ==========================================
router.get(['/items', '/documents/items', '/items/list'], async (req, res) => {
  try {
    const { folderId, search } = req.query;
    const userId = req.query.userId ? String(req.query.userId) : '';
    const isAdmin = req.query.isAdmin === 'true' || req.query.isAdmin === '1';

    let folders = [];
    let items = [];

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);

      // 全フォルダの権限情報を取得
      const folderRes = await pool.request().query(`SELECT id, parentId, createdById, permissionJson FROM dbo.DocumentFolders`);
      folders = (folderRes.recordset || []).map(r => ({
        id: r.id,
        parentId: r.parentId || null,
        createdById: r.createdById,
        permission: safeParseJSON(r.permissionJson, { viewers: 'all', editors: 'all' })
      }));

      // 特定フォルダが指定された場合、そのフォルダの閲覧権限を検証
      if (folderId && !hasAccessToFolderRecursively(String(folderId), folders, userId, isAdmin)) {
        return res.json([]);
      }

      let queryStr = `SELECT * FROM dbo.DocumentItems`;
      const request = pool.request();
      if (folderId) {
        queryStr += ` WHERE folderId = @folderId`;
        request.input('folderId', String(folderId));
      }
      queryStr += ` ORDER BY updatedAt DESC`;

      const result = await request.query(queryStr);
      items = (result.recordset || []).map(r => {
        const versions = safeParseJSON(r.versionsJson, []);
        const latestVer = versions.length > 0 ? versions[versions.length - 1] : null;
        return {
          id: r.id,
          folderId: r.folderId,
          title: r.title,
          description: r.description || '',
          createdById: r.createdById,
          createdByName: r.createdByName,
          createdAt: r.createdAt,
          updatedById: r.updatedById,
          updatedByName: r.updatedByName,
          updatedAt: r.updatedAt,
          downloadCount: r.downloadCount || 0,
          versions: versions,
          latestVersionNumber: latestVer ? latestVer.versionNumber : 1,
          latestFiles: latestVer ? latestVer.files : []
        };
      });
    } else {
      const local = loadLocalDocumentsData();
      folders = local.folders || [];
      items = local.items || [];
      if (folderId) {
        if (!hasAccessToFolderRecursively(String(folderId), folders, userId, isAdmin)) {
          return res.json([]);
        }
        items = items.filter(it => it.folderId === String(folderId));
      }
      items = items.map(r => {
        const versions = r.versions || [];
        const latestVer = versions.length > 0 ? versions[versions.length - 1] : null;
        return {
          ...r,
          latestVersionNumber: latestVer ? latestVer.versionNumber : 1,
          latestFiles: latestVer ? latestVer.files : []
        };
      });
    }

    // 一般ユーザーの場合、閲覧権限のないフォルダに属するアイテムを完全に除外
    if (!isAdmin && userId) {
      items = items.filter(it => {
        if (!it.folderId || it.folderId === 'root') return true;
        return hasAccessToFolderRecursively(it.folderId, folders, userId, isAdmin);
      });
    }

    if (search && String(search).trim()) {
      const q = String(search).trim().toLowerCase();
      items = items.filter(it => {
        const matchTitle = it.title?.toLowerCase().includes(q);
        const matchDesc = it.description?.toLowerCase().includes(q);
        const matchFiles = it.latestFiles?.some(f => f.fileName.toLowerCase().includes(q));
        const matchAuthor = it.createdByName?.toLowerCase().includes(q) || it.updatedByName?.toLowerCase().includes(q);
        return matchTitle || matchDesc || matchFiles || matchAuthor;
      });
    }

    res.json(items);
  } catch (err) {
    console.error('[Documents Items Get Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 6. 新規ドキュメント登録 API (複数ファイル添付対応)
// ==========================================
router.post(['/items', '/documents/items'], uploadDocumentFiles.array('files', 20), async (req, res) => {
  try {
    const { folderId, title, description = '', createdById, createdByName } = req.body;
    if (!folderId) return res.status(400).json({ error: '所属フォルダIDは必須です。' });
    if (!title || !title.trim()) return res.status(400).json({ error: 'タイトルは必須です。' });

    const rawFiles = req.files || [];
    if (rawFiles.length === 0) {
      return res.status(400).json({ error: '添付ファイルを最低1点選択してください。' });
    }

    const nowIso = new Date().toISOString();
    const itemId = `doc_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    const attachedFiles = rawFiles.map(f => {
      let origName = f.originalname;
      try { origName = Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch (_) {}
      return {
        fileId: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fileName: origName,
        fileSize: f.size,
        fileUrl: `/uploads/documents/${encodeURIComponent(f.filename)}`,
        fileType: path.extname(origName).toLowerCase().replace('.', ''),
        storagePath: f.filename
      };
    });

    const initialVersion = {
      versionNumber: 1,
      uploadedAt: nowIso,
      uploadedById: createdById || 'unknown',
      uploadedByName: createdByName || 'ユーザー',
      changeNote: '初版登録',
      files: attachedFiles
    };

    const newItem = {
      id: itemId,
      folderId,
      title: title.trim(),
      description: description.trim(),
      createdById: createdById || 'unknown',
      createdByName: createdByName || 'ユーザー',
      createdAt: nowIso,
      updatedById: createdById || 'unknown',
      updatedByName: createdByName || 'ユーザー',
      updatedAt: nowIso,
      downloadCount: 0,
      versions: [initialVersion],
      latestVersionNumber: 1,
      latestFiles: attachedFiles
    };

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      await pool.request()
        .input('id', newItem.id)
        .input('folderId', newItem.folderId)
        .input('title', newItem.title)
        .input('description', newItem.description)
        .input('createdById', newItem.createdById)
        .input('createdByName', newItem.createdByName)
        .input('createdAt', newItem.createdAt)
        .input('updatedById', newItem.updatedById)
        .input('updatedByName', newItem.updatedByName)
        .input('updatedAt', newItem.updatedAt)
        .input('downloadCount', 0)
        .input('versionsJson', JSON.stringify(newItem.versions))
        .query(`
          INSERT INTO dbo.DocumentItems (id, folderId, title, description, createdById, createdByName, createdAt, updatedById, updatedByName, updatedAt, downloadCount, versionsJson)
          VALUES (@id, @folderId, @title, @description, @createdById, @createdByName, @createdAt, @updatedById, @updatedByName, @updatedAt, @downloadCount, @versionsJson)
        `);
    } else {
      const local = loadLocalDocumentsData();
      local.items.unshift(newItem);
      saveLocalDocumentsData(local);
    }

    res.json({ success: true, item: newItem });
  } catch (err) {
    console.error('[Documents Item Create Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 7. 新バージョン登録 API (ファイル差し替え・追加)
// ==========================================
router.post(['/items/:id/versions', '/documents/items/:id/versions'], uploadDocumentFiles.array('files', 20), async (req, res) => {
  try {
    const { id } = req.params;
    const { uploadedById, uploadedByName, changeNote = '' } = req.body;
    const rawFiles = req.files || [];

    if (rawFiles.length === 0) {
      return res.status(400).json({ error: '新バージョン用の添付ファイルを1点以上選択してください。' });
    }

    const nowIso = new Date().toISOString();
    const attachedFiles = rawFiles.map(f => {
      let origName = f.originalname;
      try { origName = Buffer.from(f.originalname, 'latin1').toString('utf8'); } catch (_) {}
      return {
        fileId: `file_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        fileName: origName,
        fileSize: f.size,
        fileUrl: `/uploads/documents/${encodeURIComponent(f.filename)}`,
        fileType: path.extname(origName).toLowerCase().replace('.', ''),
        storagePath: f.filename
      };
    });

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      const findRes = await pool.request().input('id', id).query(`SELECT * FROM dbo.DocumentItems WHERE id = @id`);
      if (!findRes.recordset || findRes.recordset.length === 0) {
        return res.status(404).json({ error: '対象の文書が見つかりません。' });
      }

      const item = findRes.recordset[0];
      const versions = safeParseJSON(item.versionsJson, []);
      const nextVersionNumber = versions.length > 0 ? (versions[versions.length - 1].versionNumber + 1) : 1;

      const newVer = {
        versionNumber: nextVersionNumber,
        uploadedAt: nowIso,
        uploadedById: uploadedById || 'unknown',
        uploadedByName: uploadedByName || 'ユーザー',
        changeNote: changeNote.trim() || `第${nextVersionNumber}版 更新`,
        files: attachedFiles
      };
      versions.push(newVer);

      await pool.request()
        .input('id', id)
        .input('updatedById', uploadedById || 'unknown')
        .input('updatedByName', uploadedByName || 'ユーザー')
        .input('updatedAt', nowIso)
        .input('versionsJson', JSON.stringify(versions))
        .query(`
          UPDATE dbo.DocumentItems
          SET updatedById = @updatedById, updatedByName = @updatedByName, updatedAt = @updatedAt, versionsJson = @versionsJson
          WHERE id = @id
        `);

      res.json({
        success: true,
        version: newVer,
        item: {
          ...item,
          updatedById,
          updatedByName,
          updatedAt: nowIso,
          versions,
          latestVersionNumber: nextVersionNumber,
          latestFiles: attachedFiles
        }
      });
    } else {
      const local = loadLocalDocumentsData();
      const idx = local.items.findIndex(it => it.id === id);
      if (idx < 0) return res.status(404).json({ error: '対象の文書が見つかりません。' });

      const item = local.items[idx];
      const versions = item.versions || [];
      const nextVersionNumber = versions.length > 0 ? (versions[versions.length - 1].versionNumber + 1) : 1;

      const newVer = {
        versionNumber: nextVersionNumber,
        uploadedAt: nowIso,
        uploadedById: uploadedById || 'unknown',
        uploadedByName: uploadedByName || 'ユーザー',
        changeNote: changeNote.trim() || `第${nextVersionNumber}版 更新`,
        files: attachedFiles
      };
      versions.push(newVer);

      local.items[idx] = {
        ...item,
        updatedById: uploadedById || 'unknown',
        updatedByName: uploadedByName || 'ユーザー',
        updatedAt: nowIso,
        versions,
        latestVersionNumber: nextVersionNumber,
        latestFiles: attachedFiles
      };
      saveLocalDocumentsData(local);

      res.json({ success: true, version: newVer, item: local.items[idx] });
    }
  } catch (err) {
    console.error('[Documents Version Add Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 8. ドキュメント基本情報更新 API
// ==========================================
router.put(['/items/:id', '/documents/items/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const { title, description, folderId } = req.body;
    const nowIso = new Date().toISOString();

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      const findRes = await pool.request().input('id', id).query(`SELECT * FROM dbo.DocumentItems WHERE id = @id`);
      if (!findRes.recordset || findRes.recordset.length === 0) {
        return res.status(404).json({ error: '対象の文書が見つかりません。' });
      }

      const item = findRes.recordset[0];
      const updatedTitle = title !== undefined ? title.trim() : item.title;
      const updatedDesc = description !== undefined ? description.trim() : item.description;
      const updatedFolderId = folderId !== undefined ? folderId : item.folderId;

      await pool.request()
        .input('id', id)
        .input('title', updatedTitle)
        .input('description', updatedDesc)
        .input('folderId', updatedFolderId)
        .query(`
          UPDATE dbo.DocumentItems
          SET title = @title, description = @description, folderId = @folderId
          WHERE id = @id
        `);

      res.json({ success: true });
    } else {
      const local = loadLocalDocumentsData();
      const idx = local.items.findIndex(it => it.id === id);
      if (idx < 0) return res.status(404).json({ error: '対象の文書が見つかりません。' });

      local.items[idx] = {
        ...local.items[idx],
        title: title !== undefined ? title.trim() : local.items[idx].title,
        description: description !== undefined ? description.trim() : local.items[idx].description,
        folderId: folderId !== undefined ? folderId : local.items[idx].folderId
      };
      saveLocalDocumentsData(local);
      res.json({ success: true, item: local.items[idx] });
    }
  } catch (err) {
    console.error('[Documents Item Update Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 9. ドキュメント削除 API
// ==========================================
router.delete(['/items/:id', '/documents/items/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      await pool.request().input('id', id).query(`DELETE FROM dbo.DocumentItems WHERE id = @id`);
      await pool.request().input('id', id).query(`DELETE FROM dbo.DocumentDownloads WHERE documentId = @id`);
    } else {
      const local = loadLocalDocumentsData();
      local.items = local.items.filter(it => it.id !== id);
      local.downloads = local.downloads.filter(dl => dl.documentId !== id);
      saveLocalDocumentsData(local);
    }
    res.json({ success: true });
  } catch (err) {
    console.error('[Documents Item Delete Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 10. ファイル個別ダウンロード & DLログ追跡 API
// 対応URL: /download/:fileId, /documents/download/:fileId
// ==========================================
router.get(['/download/:fileId', '/documents/download/:fileId'], async (req, res) => {
  try {
    const { fileId } = req.params;
    const userId = req.query.userId ? String(req.query.userId) : 'unknown';
    const userName = req.query.userName ? String(req.query.userName) : '匿名';
    const userDepartment = req.query.userDepartment ? String(req.query.userDepartment) : '';

    let matchedDoc = null;
    let matchedVersion = null;
    let matchedFile = null;

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      const itemsRes = await pool.request().query(`SELECT * FROM dbo.DocumentItems`);
      const allItems = itemsRes.recordset || [];
      for (const it of allItems) {
        const versions = safeParseJSON(it.versionsJson, []);
        for (const v of versions) {
          const f = (v.files || []).find(fi => fi.fileId === fileId);
          if (f) {
            matchedDoc = it;
            matchedVersion = v;
            matchedFile = f;
            break;
          }
        }
        if (matchedFile) break;
      }
    } else {
      const local = loadLocalDocumentsData();
      for (const it of local.items) {
        for (const v of it.versions) {
          const f = (v.files || []).find(fi => fi.fileId === fileId);
          if (f) {
            matchedDoc = it;
            matchedVersion = v;
            matchedFile = f;
            break;
          }
        }
        if (matchedFile) break;
      }
    }

    if (!matchedFile) {
      return res.status(404).json({ error: 'ファイルが見つかりません。' });
    }

    const filePath = path.join(documentsDir, matchedFile.storagePath);
    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'ファイル実体がサーバー上に存在しません。' });
    }

    // ダウンロードログ記録 & 累計カウントアップ
    const nowIso = new Date().toISOString();
    const downloadLogId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (pool && matchedDoc) {
      try {
        await pool.request()
          .input('docId', matchedDoc.id)
          .query(`UPDATE dbo.DocumentItems SET downloadCount = downloadCount + 1 WHERE id = @docId`);

        await pool.request()
          .input('id', downloadLogId)
          .input('documentId', matchedDoc.id)
          .input('versionNumber', matchedVersion.versionNumber)
          .input('fileId', matchedFile.fileId)
          .input('fileName', matchedFile.fileName)
          .input('userId', userId)
          .input('userName', userName)
          .input('userDepartment', userDepartment)
          .input('downloadedAt', nowIso)
          .query(`
            INSERT INTO dbo.DocumentDownloads (id, documentId, versionNumber, fileId, fileName, userId, userName, userDepartment, downloadedAt)
            VALUES (@id, @documentId, @versionNumber, @fileId, @fileName, @userId, @userName, @userDepartment, @downloadedAt)
          `);
      } catch (logErr) {
        console.warn('[Documents Download Log Error]:', logErr.message);
      }
    } else if (matchedDoc) {
      const local = loadLocalDocumentsData();
      const itIdx = local.items.findIndex(i => i.id === matchedDoc.id);
      if (itIdx >= 0) {
        local.items[itIdx].downloadCount = (local.items[itIdx].downloadCount || 0) + 1;
      }
      local.downloads.push({
        id: downloadLogId,
        documentId: matchedDoc.id,
        versionNumber: matchedVersion.versionNumber,
        fileId: matchedFile.fileId,
        fileName: matchedFile.fileName,
        userId,
        userName,
        userDepartment,
        downloadedAt: nowIso
      });
      saveLocalDocumentsData(local);
    }

    // レスポンスヘッダー設定 & ダウンロード送信
    res.download(filePath, matchedFile.fileName);
  } catch (err) {
    console.error('[Documents Download Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 11. バージョンの全ファイル 一括ZIPダウンロード API
// 対応URL: /items/:id/download-zip
// ==========================================
router.get(['/items/:id/download-zip', '/documents/items/:id/download-zip'], async (req, res) => {
  try {
    const { id } = req.params;
    const versionNumber = req.query.version ? parseInt(String(req.query.version), 10) : null;
    const userId = req.query.userId ? String(req.query.userId) : 'unknown';
    const userName = req.query.userName ? String(req.query.userName) : '匿名';
    const userDepartment = req.query.userDepartment ? String(req.query.userDepartment) : '';

    let matchedDoc = null;
    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      const findRes = await pool.request().input('id', id).query(`SELECT * FROM dbo.DocumentItems WHERE id = @id`);
      if (findRes.recordset && findRes.recordset.length > 0) {
        matchedDoc = findRes.recordset[0];
        matchedDoc.versions = safeParseJSON(matchedDoc.versionsJson, []);
      }
    } else {
      const local = loadLocalDocumentsData();
      matchedDoc = local.items.find(i => i.id === id);
    }

    if (!matchedDoc || !matchedDoc.versions || matchedDoc.versions.length === 0) {
      return res.status(404).json({ error: '対象の文書が見つかりません。' });
    }

    // 指定されたバージョン、または最新バージョンを取得
    let targetVersion = null;
    if (versionNumber) {
      targetVersion = matchedDoc.versions.find(v => v.versionNumber === versionNumber);
    }
    if (!targetVersion) {
      targetVersion = matchedDoc.versions[matchedDoc.versions.length - 1];
    }

    const files = targetVersion.files || [];
    if (files.length === 0) {
      return res.status(404).json({ error: 'このバージョンに添付ファイルがありません。' });
    }

    // ZIPアーカイブの生成・ストリーミング配信
    const safeTitle = (matchedDoc.title || '文書').replace(/[^\w\.\-\u3000-\u303f\u3040-\u309f\u30a0-\u30ff\uff00-\uffef\u4e00-\u9faf]/g, '_');
    const zipFileName = `${safeTitle}_v${targetVersion.versionNumber}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename*=UTF-8''${encodeURIComponent(zipFileName)}`);

    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('error', (err) => {
      console.error('[ZIP Archiver Error]:', err);
      res.status(500).end();
    });

    archive.pipe(res);

    for (const f of files) {
      const filePath = path.join(documentsDir, f.storagePath);
      if (fs.existsSync(filePath)) {
        archive.file(filePath, { name: f.fileName });
      }
    }

    await archive.finalize();

    // DLログ記録 & 累計カウントアップ
    const nowIso = new Date().toISOString();
    const downloadLogId = `dl_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

    if (pool) {
      try {
        await pool.request()
          .input('docId', matchedDoc.id)
          .query(`UPDATE dbo.DocumentItems SET downloadCount = downloadCount + 1 WHERE id = @docId`);

        await pool.request()
          .input('id', downloadLogId)
          .input('documentId', matchedDoc.id)
          .input('versionNumber', targetVersion.versionNumber)
          .input('fileId', 'zip_bulk')
          .input('fileName', zipFileName)
          .input('userId', userId)
          .input('userName', userName)
          .input('userDepartment', userDepartment)
          .input('downloadedAt', nowIso)
          .query(`
            INSERT INTO dbo.DocumentDownloads (id, documentId, versionNumber, fileId, fileName, userId, userName, userDepartment, downloadedAt)
            VALUES (@id, @documentId, @versionNumber, @fileId, @fileName, @userId, @userName, @userDepartment, @downloadedAt)
          `);
      } catch (_) {}
    } else {
      const local = loadLocalDocumentsData();
      const itIdx = local.items.findIndex(i => i.id === matchedDoc.id);
      if (itIdx >= 0) {
        local.items[itIdx].downloadCount = (local.items[itIdx].downloadCount || 0) + 1;
      }
      local.downloads.push({
        id: downloadLogId,
        documentId: matchedDoc.id,
        versionNumber: targetVersion.versionNumber,
        fileId: 'zip_bulk',
        fileName: zipFileName,
        userId,
        userName,
        userDepartment,
        downloadedAt: nowIso
      });
      saveLocalDocumentsData(local);
    }
  } catch (err) {
    console.error('[Documents ZIP Download Error]:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message });
    }
  }
});

// ==========================================
// 12. ダウンロード履歴取得 API (誰がいつDLしたか)
// 対応URL: /items/:id/downloads
// ==========================================
router.get(['/items/:id/downloads', '/documents/items/:id/downloads'], async (req, res) => {
  try {
    const { id } = req.params;
    let downloads = [];

    const pool = await getPool();
    if (pool) {
      await ensureDocumentsSchema(pool);
      const result = await pool.request()
        .input('documentId', id)
        .query(`SELECT * FROM dbo.DocumentDownloads WHERE documentId = @documentId ORDER BY downloadedAt DESC`);
      downloads = result.recordset || [];
    } else {
      const local = loadLocalDocumentsData();
      downloads = (local.downloads || []).filter(dl => dl.documentId === id);
      downloads.sort((a, b) => new Date(b.downloadedAt).getTime() - new Date(a.downloadedAt).getTime());
    }

    res.json(downloads);
  } catch (err) {
    console.error('[Documents Downloads Log Get Error]:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
