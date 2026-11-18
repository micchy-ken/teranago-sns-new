/**
 * routes/assets.js
 * 寺岡オートドアSNS 資産管理モジュール (車両・PC・工具・共用機器・動的スキーマ・履歴・点検予定/確定SSOT・運転記録簿連動)
 * 最終更新: 2026年11月18日 (走行距離を運転記録簿の最新値から自動取得専用・未記録時空白対応)
 */
import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { dataDir, safeParseJSON } from '../config.js';

const router = Router();

const categoriesFilePath = path.join(dataDir, 'asset_categories.json');
const assetsFilePath = path.join(dataDir, 'assets.json');
const assetLogsFilePath = path.join(dataDir, 'asset_logs.json');
const workReportsFilePath = path.join(dataDir, 'work_reports.json');

const INLINE_EDITABLE_DEFAULT_KEYS = new Set([
  'nextInspectionDate',
  'nextCheckDate',
  'nextCalibrationDate',
  'inspectionType',
  'inspectionVendor',
  'maintenanceVendor'
]);

const AUTO_ONLY_FIELD_KEYS = new Set([
  'lastInspectionDate',
  'lastCalibrationDate',
  'mileage'
]);

// ---------------------------------------------------------------------------
// JST (日本標準時 / UTC+9) ヘルパー
// ---------------------------------------------------------------------------
function getJstNowIso() {
  const now = new Date();
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().replace('Z', '+09:00');
}

function getJstTodayStr() {
  return getJstNowIso().slice(0, 10);
}

function normalizeDateStr(val) {
  if (!val) return '';
  if (val instanceof Date) {
    if (isNaN(val.getTime())) return '';
    const jstMs = val.getTime() + 9 * 60 * 60 * 1000;
    return new Date(jstMs).toISOString().slice(0, 10);
  }
  const str = String(val).trim();
  const m = str.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  if (m) {
    return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
  }
  const plain = str.slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(plain) ? plain : '';
}

function toHalfWidthAscii(val) {
  return String(val || '').replace(/[０-９Ａ-Ｚａ-ｚ]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

function normalizeVehicleMatchKey(val) {
  if (!val) return '';
  return toHalfWidthAscii(val)
    .replace(/[\s\u3000\-ー―‐]+/g, '')
    .toLowerCase()
    .trim();
}

// ---------------------------------------------------------------------------
// デフォルト資産種類プリセット定義
// ---------------------------------------------------------------------------
export const DEFAULT_ASSET_CATEGORIES = [
  {
    id: 'cat-vehicle',
    name: '車両',
    icon: 'Car',
    color: 'sky',
    defaultShared: false,
    allowInlineNotes: true,
    allowInlineAssignee: false,
    sortOrder: 1,
    isSystem: true,
    fields: [
      { key: 'vehicleModel', label: '車種', type: 'select', options: ['レジアスエース', 'プロボックス', 'アクア', 'シエンタ', 'ライトエース', 'ハイエース', '軽バン', 'その他'], showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 1 },
      { key: 'fuelType', label: '油種', type: 'select', options: ['軽油', 'ガソリン', 'ハイブリッド', 'EV'], showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 2 },
      { key: 'inspectionVendor', label: '点検業者', type: 'text', placeholder: '例: トヨタレンタリース名古屋', showInList: true, showInMyAssets: false, inlineEditable: true, sortOrder: 3 },
      { key: 'nextInspectionDate', label: '点検予定', type: 'date', showInList: true, showInMyAssets: true, inlineEditable: true, alertRule: { kind: 'inspection', daysBefore: 30, label: '点検アラート' }, sortOrder: 4 },
      { key: 'inspectionType', label: '点検内容', type: 'select', options: ['P点検', 'D点検', '3ヶ月点検', '6ヶ月点検', '12ヶ月点検', '車検', 'その他'], showInList: true, showInMyAssets: false, inlineEditable: true, sortOrder: 5 },
      { key: 'lastInspectionDate', label: '最終点検日', type: 'date', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 6 },
      { key: 'etcCardNumber', label: 'ETCカード', type: 'text', placeholder: '例: 113696-0091-49630-6', showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 7 },
      { key: 'deliveryDate', label: '納車', type: 'date', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 8 },
      { key: 'shakenExpiryDate', label: '車検満期', type: 'date', showInList: true, showInMyAssets: true, inlineEditable: false, alertRule: { kind: 'inspection', daysBefore: 30, label: '車検アラート' }, sortOrder: 9 },
      { key: 'leaseEndDate', label: 'リース満了', type: 'date', showInList: true, showInMyAssets: true, inlineEditable: false, alertRule: { kind: 'replacement', daysBefore: 180, label: '入替アラート' }, sortOrder: 10 },
      { key: 'mileage', label: '走行距離', type: 'number', unit: 'km', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 11 },
      { key: 'tireType', label: 'タイヤ種別', type: 'select', options: ['夏タイヤ', 'スタッドレス', 'オールシーズン'], showInList: false, showInMyAssets: false, inlineEditable: false, sortOrder: 12 },
      { key: 'insuranceInfo', label: 'リース・保険会社', type: 'text', showInList: false, showInMyAssets: false, inlineEditable: false, sortOrder: 13 }
    ]
  },
  {
    id: 'cat-pc',
    name: 'PC',
    icon: 'Laptop',
    color: 'indigo',
    defaultShared: false,
    allowInlineNotes: true,
    allowInlineAssignee: false,
    sortOrder: 2,
    isSystem: true,
    fields: [
      { key: 'makerModel', label: 'メーカー・型番', type: 'text', placeholder: '例: Dell Latitude 5540', showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 1 },
      { key: 'serialNo', label: 'シリアルNo', type: 'text', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 2 },
      { key: 'os', label: 'OS', type: 'select', options: ['Windows 11 Pro', 'Windows 11 Home', 'Windows 10', 'macOS', 'その他'], showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 3 },
      { key: 'cpuMemory', label: 'CPU / メモリ', type: 'text', placeholder: '例: Core i7 / 16GB', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 4 },
      { key: 'storage', label: 'ストレージ', type: 'text', placeholder: '例: SSD 512GB', showInList: false, showInMyAssets: false, inlineEditable: false, sortOrder: 5 },
      { key: 'assignedDate', label: '支給・導入日', type: 'date', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 6 },
      { key: 'nextCheckDate', label: '定期点検予定', type: 'date', showInList: true, showInMyAssets: true, inlineEditable: true, alertRule: { kind: 'inspection', daysBefore: 30, label: '点検アラート' }, sortOrder: 7 },
      { key: 'leaseEndDate', label: 'リース満了・入替目安', type: 'date', showInList: true, showInMyAssets: true, inlineEditable: false, alertRule: { kind: 'replacement', daysBefore: 180, label: '入替アラート' }, sortOrder: 8 }
    ]
  },
  {
    id: 'cat-tool',
    name: '工具',
    icon: 'Wrench',
    color: 'amber',
    defaultShared: false,
    allowInlineNotes: true,
    allowInlineAssignee: false,
    sortOrder: 3,
    isSystem: true,
    fields: [
      { key: 'toolType', label: '種別', type: 'select', options: ['電動工具', '計測器・テスター', '脚立・梯子', '安全帯・保護具', '専用工具', 'その他'], showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 1 },
      { key: 'makerModel', label: 'メーカー・型番', type: 'text', placeholder: '例: マキタ TD173D', showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 2 },
      { key: 'serialNo', label: '製造番号', type: 'text', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 3 },
      { key: 'calibrationRequired', label: '校正対象', type: 'checkbox', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 4 },
      { key: 'nextCalibrationDate', label: '点検・校正予定', type: 'date', showInList: true, showInMyAssets: true, inlineEditable: true, alertRule: { kind: 'inspection', daysBefore: 30, label: '校正・点検アラート' }, sortOrder: 5 },
      { key: 'lastCalibrationDate', label: '前回点検・校正日', type: 'date', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 6 },
      { key: 'storageLocation', label: '保管場所・車載先', type: 'text', showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 7 },
      { key: 'purchaseDate', label: '購入日', type: 'date', showInList: false, showInMyAssets: false, inlineEditable: false, sortOrder: 8 }
    ]
  },
  {
    id: 'cat-shared-it',
    name: '複合機・ネットワーク',
    icon: 'Printer',
    color: 'emerald',
    defaultShared: true,
    allowInlineNotes: true,
    allowInlineAssignee: false,
    sortOrder: 4,
    isSystem: true,
    fields: [
      { key: 'equipmentType', label: '機器種別', type: 'select', options: ['複合機・プリンタ', 'ルーター・UTM', 'NAS・サーバー', 'Wi-Fiアクセスポイント', '電話主装置・FAX', 'その他'], showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 1 },
      { key: 'makerModel', label: 'メーカー・機種', type: 'text', placeholder: '例: RICOH IM C3010 / Yamaha RTX1220', showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 2 },
      { key: 'locationDetail', label: '設置場所', type: 'text', placeholder: '例: 名古屋支店 2F 事務室', showInList: true, showInMyAssets: true, inlineEditable: false, sortOrder: 3 },
      { key: 'ipAddress', label: 'IP / 接続情報', type: 'text', placeholder: '例: 192.168.1.250', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 4 },
      { key: 'maintenanceVendor', label: '保守業者・連絡先', type: 'text', showInList: true, showInMyAssets: false, inlineEditable: true, sortOrder: 5 },
      { key: 'nextInspectionDate', label: '定期点検予定', type: 'date', showInList: true, showInMyAssets: true, inlineEditable: true, alertRule: { kind: 'inspection', daysBefore: 30, label: '点検アラート' }, sortOrder: 6 },
      { key: 'lastInspectionDate', label: '前回点検日', type: 'date', showInList: true, showInMyAssets: false, inlineEditable: false, sortOrder: 7 },
      { key: 'leaseEndDate', label: 'リース満了', type: 'date', showInList: true, showInMyAssets: true, inlineEditable: false, alertRule: { kind: 'replacement', daysBefore: 180, label: '入替アラート' }, sortOrder: 8 },
      { key: 'contractNo', label: '契約・保守番号', type: 'text', showInList: false, showInMyAssets: false, inlineEditable: false, sortOrder: 9 }
    ]
  }
];

function normalizeCategoryFields(rawFields) {
  const arr = Array.isArray(rawFields) ? rawFields : [];
  return arr.map((f) => {
    if (!f || typeof f !== 'object') return f;
    const keyStr = String(f.key || '');
    if (AUTO_ONLY_FIELD_KEYS.has(keyStr)) {
      return {
        ...f,
        inlineEditable: false
      };
    }
    const hasExplicitInline = Object.prototype.hasOwnProperty.call(f, 'inlineEditable');
    return {
      ...f,
      inlineEditable: hasExplicitInline
        ? Boolean(f.inlineEditable)
        : INLINE_EDITABLE_DEFAULT_KEYS.has(keyStr)
    };
  });
}

// ---------------------------------------------------------------------------
// Local JSON ファイル読み書きヘルパー
// ---------------------------------------------------------------------------
function loadJsonArray(filePath) {
  if (!fs.existsSync(filePath)) return [];
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error(`[Assets] Failed to read JSON file (${filePath}):`, e);
    return [];
  }
}

function saveJsonArray(filePath, data) {
  try {
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error(`[Assets] Failed to save JSON file (${filePath}):`, e);
  }
}

function computeEarliestAlertDate(attributes, category) {
  if (!attributes || !category || !Array.isArray(category.fields)) return '';
  let earliest = '';
  for (const field of category.fields) {
    if (field.type === 'date' && field.alertRule && attributes[field.key]) {
      const normalized = normalizeDateStr(attributes[field.key]);
      if (normalized && /^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
        if (!earliest || normalized < earliest) {
          earliest = normalized;
        }
      }
    }
  }
  return earliest;
}

function isScheduledInspectionLog(log) {
  return Boolean(
    log &&
      log.actionType === 'inspection' &&
      log.detail &&
      log.detail.inspectionStatus === 'scheduled'
  );
}

function computeNextAlertDateWithLogs(asset, category, assetLogs) {
  let earliest = computeEarliestAlertDate(asset?.attributes, category);
  if (Array.isArray(assetLogs)) {
    for (const log of assetLogs) {
      if (String(log.assetId) !== String(asset?.id)) continue;
      if (!isScheduledInspectionLog(log)) continue;
      const d = normalizeDateStr(log.eventDate);
      if (d && (!earliest || d < earliest)) {
        earliest = d;
      }
    }
  }
  return earliest;
}

function stripLegacyInspectionDateAttrs(attributes) {
  const next = { ...(attributes || {}) };
  delete next.lastInspectionDate;
  delete next.lastCalibrationDate;
  delete next.nextInspectionDate;
  delete next.nextCheckDate;
  delete next.nextCalibrationDate;
  return next;
}

function sanitizeInspectionItems(items) {
  if (!Array.isArray(items)) return undefined;
  return items
    .filter((it) => it && String(it.label || '').trim() !== '')
    .map((it, idx) => ({
      id: String(it.id || `chk-${Date.now()}-${idx}`),
      label: String(it.label).trim(),
      method: it.method ? String(it.method).trim() : '',
      sortOrder: typeof it.sortOrder === 'number' ? it.sortOrder : idx + 1
    }));
}

// ---------------------------------------------------------------------------
// SQL Server スキーマ自動初期化・検証
// ---------------------------------------------------------------------------
let tablesEnsured = false;
let ensurePromise = null;

async function ensureAssetTables(pool) {
  if (!pool || tablesEnsured) return;
  if (ensurePromise) return ensurePromise;
  ensurePromise = (async () => {
    try {
      await pool.request().query(`
      IF OBJECT_ID('dbo.AssetCategories', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AssetCategories (
          id NVARCHAR(100) NOT NULL PRIMARY KEY,
          name NVARCHAR(200) NOT NULL,
          icon NVARCHAR(100) NULL,
          color NVARCHAR(50) NULL,
          defaultShared BIT NOT NULL DEFAULT 0,
          allowInlineNotes BIT NULL DEFAULT 1,
          allowInlineAssignee BIT NULL DEFAULT 0,
          fieldsJson NVARCHAR(MAX) NULL,
          sortOrder INT NOT NULL DEFAULT 0,
          isSystem BIT NOT NULL DEFAULT 0,
          createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
          updatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
      END;

      IF OBJECT_ID('dbo.AssetCategories', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.AssetCategories', 'allowInlineNotes') IS NULL
        BEGIN
          ALTER TABLE dbo.AssetCategories ADD allowInlineNotes BIT NULL DEFAULT 1;
        END;
        IF COL_LENGTH('dbo.AssetCategories', 'allowInlineAssignee') IS NULL
        BEGIN
          ALTER TABLE dbo.AssetCategories ADD allowInlineAssignee BIT NULL DEFAULT 0;
        END;
      END;

      IF OBJECT_ID('dbo.Assets', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.Assets (
          id NVARCHAR(100) NOT NULL PRIMARY KEY,
          categoryId NVARCHAR(100) NOT NULL,
          assetCode NVARCHAR(200) NULL,
          name NVARCHAR(300) NOT NULL,
          officeId NVARCHAR(100) NULL,
          office NVARCHAR(200) NULL,
          divisionId NVARCHAR(100) NULL,
          division NVARCHAR(200) NULL,
          assigneeUserId NVARCHAR(100) NULL,
          assigneeUserName NVARCHAR(200) NULL,
          isShared BIT NOT NULL DEFAULT 0,
          status NVARCHAR(50) NOT NULL DEFAULT 'active',
          nextAlertDate NVARCHAR(30) NULL,
          attributesJson NVARCHAR(MAX) NULL,
          attachmentsJson NVARCHAR(MAX) NULL,
          inspectionItemsJson NVARCHAR(MAX) NULL,
          notes NVARCHAR(MAX) NULL,
          createdBy NVARCHAR(100) NULL,
          createdByName NVARCHAR(200) NULL,
          createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME(),
          updatedAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
        CREATE INDEX IX_Assets_CategoryId ON dbo.Assets(categoryId);
        CREATE INDEX IX_Assets_AssigneeUserId ON dbo.Assets(assigneeUserId);
      END;

      IF OBJECT_ID('dbo.Assets', 'U') IS NOT NULL
      BEGIN
        IF COL_LENGTH('dbo.Assets', 'inspectionItemsJson') IS NULL
        BEGIN
          ALTER TABLE dbo.Assets ADD inspectionItemsJson NVARCHAR(MAX) NULL;
        END;
      END;

      IF OBJECT_ID('dbo.AssetLogs', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.AssetLogs (
          id NVARCHAR(100) NOT NULL PRIMARY KEY,
          assetId NVARCHAR(100) NOT NULL,
          actionType NVARCHAR(50) NOT NULL,
          actorId NVARCHAR(100) NULL,
          actorName NVARCHAR(200) NULL,
          eventDate NVARCHAR(30) NULL,
          summary NVARCHAR(500) NULL,
          detailJson NVARCHAR(MAX) NULL,
          createdAt DATETIME2 NOT NULL DEFAULT SYSDATETIME()
        );
        CREATE INDEX IX_AssetLogs_AssetId ON dbo.AssetLogs(assetId);
      END;
    `);
      tablesEnsured = true;
    } catch (err) {
      console.warn('[Assets] ensureAssetTables warning:', err.message);
    } finally {
      ensurePromise = null;
    }
  })();
  return ensurePromise;
}

// ---------------------------------------------------------------------------
// 行マッパー (SQL Row -> Frontend JSON Model)
// ---------------------------------------------------------------------------
function mapCategoryRow(row) {
  const fields = normalizeCategoryFields(safeParseJSON(row.fieldsJson || row.fields, []));
  return {
    id: String(row.id),
    name: String(row.name || ''),
    icon: row.icon || 'Box',
    color: row.color || 'indigo',
    defaultShared: Boolean(row.defaultShared),
    allowInlineNotes:
      row.allowInlineNotes === undefined || row.allowInlineNotes === null
        ? true
        : Boolean(row.allowInlineNotes),
    allowInlineAssignee: Boolean(row.allowInlineAssignee),
    fields: Array.isArray(fields) ? fields : [],
    sortOrder: typeof row.sortOrder === 'number' ? row.sortOrder : parseInt(row.sortOrder || '0', 10),
    isSystem: Boolean(row.isSystem),
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : undefined,
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : undefined
  };
}

function mapAssetRow(row) {
  const attributes = safeParseJSON(row.attributesJson || row.attributes, {});
  const attachments = safeParseJSON(row.attachmentsJson || row.attachments, []);
  const inspectionItems = safeParseJSON(row.inspectionItemsJson || row.inspectionItems, undefined);
  return {
    id: String(row.id),
    categoryId: String(row.categoryId || ''),
    assetCode: String(row.assetCode || ''),
    name: String(row.name || ''),
    officeId: row.officeId ? String(row.officeId) : undefined,
    office: row.office ? String(row.office) : undefined,
    divisionId: row.divisionId ? String(row.divisionId) : undefined,
    division: row.division ? String(row.division) : undefined,
    assigneeUserId: row.assigneeUserId ? String(row.assigneeUserId) : undefined,
    assigneeUserName: row.assigneeUserName ? String(row.assigneeUserName) : undefined,
    isShared: Boolean(row.isShared),
    status: row.status || 'active',
    nextAlertDate: row.nextAlertDate ? normalizeDateStr(row.nextAlertDate) : undefined,
    attributes: attributes && typeof attributes === 'object' && !Array.isArray(attributes) ? attributes : {},
    attachments: Array.isArray(attachments) ? attachments : [],
    inspectionItems: Array.isArray(inspectionItems) ? inspectionItems : undefined,
    notes: row.notes || '',
    createdBy: row.createdBy ? String(row.createdBy) : undefined,
    createdByName: row.createdByName ? String(row.createdByName) : undefined,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : getJstNowIso(),
    updatedAt: row.updatedAt ? new Date(row.updatedAt).toISOString() : getJstNowIso()
  };
}

function mapLogRow(row) {
  const detail = safeParseJSON(row.detailJson || row.detail, undefined);
  return {
    id: String(row.id),
    assetId: String(row.assetId),
    actionType: row.actionType || 'update',
    actorId: row.actorId ? String(row.actorId) : undefined,
    actorName: String(row.actorName || 'システム'),
    eventDate: row.eventDate ? normalizeDateStr(row.eventDate) : getJstTodayStr(),
    summary: String(row.summary || ''),
    detail: detail && typeof detail === 'object' ? detail : undefined,
    createdAt: row.createdAt ? new Date(row.createdAt).toISOString() : getJstNowIso()
  };
}

// ---------------------------------------------------------------------------
// 運転記録簿（driving_log）からの最新帰着メーター同期ヘルパー
// ---------------------------------------------------------------------------
async function computeLatestDrivingMileages(pool, assetsList) {
  const resultByAssetId = {};
  if (!Array.isArray(assetsList) || assetsList.length === 0) {
    return resultByAssetId;
  }

  let reportSources = [];

  if (pool) {
    try {
      const sqlRes = await pool.request().query(`
        SELECT id, report_type, construction_data, updated_at, createdAt
        FROM dbo.WorkReports
        WHERE report_type = 'driving_log'
           OR (construction_data IS NOT NULL AND construction_data LIKE '%driving_log%')
      `);
      if (Array.isArray(sqlRes.recordset) && sqlRes.recordset.length > 0) {
        reportSources = sqlRes.recordset.map((r) => ({
          id: String(r.id),
          reportType: r.report_type,
          payload: safeParseJSON(r.construction_data, null),
          updatedAt: r.updated_at || r.createdAt
        }));
      }
    } catch (e) {
      // WorkReports テーブルが存在しない環境では JSON フォールバックへ
      console.warn('[Assets] Driving log SQL lookup skipped/fallback:', e.message);
    }
  }

  if (reportSources.length === 0) {
    const fileReports = loadJsonArray(workReportsFilePath);
    for (const r of fileReports) {
      const payload = r.drivingLogData || r.constructionData || null;
      const isDriving =
        r.reportType === 'driving_log' ||
        r.report_type === 'driving_log' ||
        payload?.__kind === 'driving_log';
      if (isDriving && payload) {
        reportSources.push({
          id: String(r.id),
          reportType: 'driving_log',
          payload,
          updatedAt: r.updatedAt || r.updated_at || r.createdAt
        });
      }
    }
  }

  const bestByAssetId = new Map();
  const bestByRegKey = new Map();

  const updateBest = (targetMap, key, candidate) => {
    if (!key) return;
    const prev = targetMap.get(key);
    if (!prev) {
      targetMap.set(key, candidate);
      return;
    }
    if (candidate.date > prev.date) {
      targetMap.set(key, candidate);
    } else if (candidate.date === prev.date && candidate.mileage > prev.mileage) {
      targetMap.set(key, candidate);
    }
  };

  for (const src of reportSources) {
    const payload = src.payload;
    if (!payload || typeof payload !== 'object') continue;
    const rows = Array.isArray(payload.rows) ? payload.rows : [];
    const vehicleAssetId = payload.vehicleAssetId ? String(payload.vehicleAssetId).trim() : '';
    const regKey = normalizeVehicleMatchKey(
      payload.registrationNumber || payload.vehicleNumber || payload.vehicleName || ''
    );

    for (const row of rows) {
      if (!row || typeof row !== 'object') continue;
      const hasArrival =
        row.arrivalMeter !== undefined &&
        row.arrivalMeter !== null &&
        String(row.arrivalMeter).trim() !== '';
      const rawMeter = hasArrival ? row.arrivalMeter : row.departureMeter;
      if (rawMeter === undefined || rawMeter === null || String(rawMeter).trim() === '') continue;
      const meter = Number(toHalfWidthAscii(rawMeter).replace(/,/g, '').trim());
      if (!Number.isFinite(meter) || meter < 0) continue;
      const dateStr = normalizeDateStr(row.date);
      if (!dateStr) continue;

      const candidate = {
        mileage: meter,
        date: dateStr,
        reportId: src.id
      };
      if (vehicleAssetId) updateBest(bestByAssetId, vehicleAssetId, candidate);
      if (regKey) updateBest(bestByRegKey, regKey, candidate);
    }
  }

  for (const asset of assetsList) {
    let matched = bestByAssetId.get(String(asset.id));
    if (!matched) {
      const nameKey = normalizeVehicleMatchKey(asset.name);
      const codeKey = normalizeVehicleMatchKey(asset.assetCode);
      const attrRegKey = normalizeVehicleMatchKey(
        asset.attributes?.registrationNumber || asset.attributes?.plateNumber || ''
      );
      matched =
        (nameKey ? bestByRegKey.get(nameKey) : undefined) ||
        (codeKey ? bestByRegKey.get(codeKey) : undefined) ||
        (attrRegKey ? bestByRegKey.get(attrRegKey) : undefined);
    }
    if (matched) {
      resultByAssetId[asset.id] = matched;
    }
  }

  return resultByAssetId;
}

// ---------------------------------------------------------------------------
// 共通データ操作 (DB + Local JSON 二重永続化)
// ---------------------------------------------------------------------------
let seedPromise = null;

async function seedDefaultCategoriesIfNeeded(pool) {
  if (seedPromise) return seedPromise;
  seedPromise = (async () => {
    const nowIso = getJstNowIso();
    const seededList = DEFAULT_ASSET_CATEGORIES.map((c) => ({
      ...c,
      createdAt: nowIso,
      updatedAt: nowIso
    }));

    if (pool) {
      try {
        await ensureAssetTables(pool);
        const countRes = await pool.request().query('SELECT COUNT(*) AS cnt FROM dbo.AssetCategories');
        const cnt = countRes.recordset?.[0]?.cnt || 0;
        if (cnt === 0) {
          for (const cat of seededList) {
            await pool.request()
              .input('id', sql.NVarChar(100), cat.id)
              .input('name', sql.NVarChar(200), cat.name)
              .input('icon', sql.NVarChar(100), cat.icon)
              .input('color', sql.NVarChar(50), cat.color)
              .input('defaultShared', sql.Bit, cat.defaultShared ? 1 : 0)
              .input('allowInlineNotes', sql.Bit, cat.allowInlineNotes !== false ? 1 : 0)
              .input('allowInlineAssignee', sql.Bit, cat.allowInlineAssignee ? 1 : 0)
              .input('fieldsJson', sql.NVarChar(sql.MAX), JSON.stringify(cat.fields))
              .input('sortOrder', sql.Int, cat.sortOrder)
              .input('isSystem', sql.Bit, cat.isSystem ? 1 : 0)
              .query(`
                IF NOT EXISTS (SELECT 1 FROM dbo.AssetCategories WHERE id = @id)
                INSERT INTO dbo.AssetCategories (id, name, icon, color, defaultShared, allowInlineNotes, allowInlineAssignee, fieldsJson, sortOrder, isSystem, createdAt, updatedAt)
                VALUES (@id, @name, @icon, @color, @defaultShared, @allowInlineNotes, @allowInlineAssignee, @fieldsJson, @sortOrder, @isSystem, SYSDATETIME(), SYSDATETIME())
              `);
          }
        }
      } catch (e) {
        console.warn('[Assets] seedDefaultCategories DB error:', e.message);
      }
    }

    const localCats = loadJsonArray(categoriesFilePath);
    if (localCats.length === 0) {
      saveJsonArray(categoriesFilePath, seededList);
    }
  })().finally(() => {
    seedPromise = null;
  });
  return seedPromise;
}

async function fetchAllCategories(pool) {
  await seedDefaultCategoriesIfNeeded(pool);
  if (pool) {
    try {
      await ensureAssetTables(pool);
      const res = await pool.request().query('SELECT * FROM dbo.AssetCategories ORDER BY sortOrder ASC, createdAt ASC');
      const list = (res.recordset || []).map(mapCategoryRow);
      if (list.length > 0) {
        saveJsonArray(categoriesFilePath, list);
        return list;
      }
    } catch (e) {
      console.warn('[Assets] fetchAllCategories DB fallback to JSON:', e.message);
    }
  }
  const local = loadJsonArray(categoriesFilePath).map((c) => mapCategoryRow(c));
  return local.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
}

async function fetchAllAssetsRaw(pool) {
  if (pool) {
    try {
      await ensureAssetTables(pool);
      const res = await pool.request().query('SELECT * FROM dbo.Assets ORDER BY updatedAt DESC, createdAt DESC');
      const rows = (res.recordset || []).map(mapAssetRow);
      if (rows.length > 0 || fs.existsSync(assetsFilePath) === false) {
        saveJsonArray(assetsFilePath, rows);
        return rows;
      }
    } catch (e) {
      console.warn('[Assets] fetchAllAssetsRaw DB fallback:', e.message);
    }
  }
  return loadJsonArray(assetsFilePath).map((a) => mapAssetRow(a));
}

async function fetchAssetById(pool, assetId) {
  if (pool) {
    try {
      await ensureAssetTables(pool);
      const res = await pool.request()
        .input('id', sql.NVarChar(100), String(assetId))
        .query('SELECT * FROM dbo.Assets WHERE id = @id');
      if (res.recordset?.[0]) {
        return mapAssetRow(res.recordset[0]);
      }
    } catch (e) {
      console.warn('[Assets] fetchAssetById DB warning:', e.message);
    }
  }
  const local = loadJsonArray(assetsFilePath);
  const found = local.find((a) => String(a.id) === String(assetId));
  return found ? mapAssetRow(found) : null;
}

async function fetchAllLogsRaw(pool, assetId) {
  if (pool) {
    try {
      await ensureAssetTables(pool);
      const request = pool.request();
      let query = 'SELECT * FROM dbo.AssetLogs';
      if (assetId) {
        request.input('assetId', sql.NVarChar(100), String(assetId));
        query += ' WHERE assetId = @assetId';
      }
      query += ' ORDER BY eventDate DESC, createdAt DESC';
      const result = await request.query(query);
      const rows = (result.recordset || []).map(mapLogRow);
      if (!assetId) {
        saveJsonArray(assetLogsFilePath, rows);
      }
      return rows;
    } catch (e) {
      console.warn('[Assets] fetchAllLogsRaw DB fallback:', e.message);
    }
  }
  let localLogs = loadJsonArray(assetLogsFilePath);
  if (assetId) {
    localLogs = localLogs.filter((l) => String(l.assetId) === String(assetId));
  }
  localLogs.sort((a, b) => (b.eventDate || '').localeCompare(a.eventDate || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
  return localLogs;
}

async function persistAssetUpdate(pool, updatedAsset) {
  if (pool) {
    await ensureAssetTables(pool);
    await pool.request()
      .input('id', sql.NVarChar(100), updatedAsset.id)
      .input('categoryId', sql.NVarChar(100), updatedAsset.categoryId)
      .input('assetCode', sql.NVarChar(200), updatedAsset.assetCode || null)
      .input('name', sql.NVarChar(300), updatedAsset.name)
      .input('officeId', sql.NVarChar(100), updatedAsset.officeId || null)
      .input('office', sql.NVarChar(200), updatedAsset.office || null)
      .input('divisionId', sql.NVarChar(100), updatedAsset.divisionId || null)
      .input('division', sql.NVarChar(200), updatedAsset.division || null)
      .input('assigneeUserId', sql.NVarChar(100), updatedAsset.assigneeUserId || null)
      .input('assigneeUserName', sql.NVarChar(200), updatedAsset.assigneeUserName || null)
      .input('isShared', sql.Bit, updatedAsset.isShared ? 1 : 0)
      .input('status', sql.NVarChar(50), updatedAsset.status)
      .input('nextAlertDate', sql.NVarChar(30), updatedAsset.nextAlertDate || null)
      .input('attributesJson', sql.NVarChar(sql.MAX), JSON.stringify(updatedAsset.attributes || {}))
      .input('attachmentsJson', sql.NVarChar(sql.MAX), JSON.stringify(updatedAsset.attachments || []))
      .input(
        'inspectionItemsJson',
        sql.NVarChar(sql.MAX),
        Array.isArray(updatedAsset.inspectionItems) ? JSON.stringify(updatedAsset.inspectionItems) : null
      )
      .input('notes', sql.NVarChar(sql.MAX), updatedAsset.notes || null)
      .query(`
        UPDATE dbo.Assets
        SET categoryId = @categoryId,
            assetCode = @assetCode,
            name = @name,
            officeId = @officeId,
            office = @office,
            divisionId = @divisionId,
            division = @division,
            assigneeUserId = @assigneeUserId,
            assigneeUserName = @assigneeUserName,
            isShared = @isShared,
            status = @status,
            nextAlertDate = @nextAlertDate,
            attributesJson = @attributesJson,
            attachmentsJson = @attachmentsJson,
            inspectionItemsJson = @inspectionItemsJson,
            notes = @notes,
            updatedAt = SYSDATETIME()
        WHERE id = @id
      `);
  }

  const localAssets = loadJsonArray(assetsFilePath);
  const idx = localAssets.findIndex((a) => String(a.id) === String(updatedAsset.id));
  if (idx >= 0) {
    localAssets[idx] = updatedAsset;
  } else {
    localAssets.unshift(updatedAsset);
  }
  saveJsonArray(assetsFilePath, localAssets);
}

async function insertAssetLogRecord(pool, logItem) {
  const newLog = {
    id: logItem.id || `alog-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    assetId: String(logItem.assetId),
    actionType: logItem.actionType || 'update',
    actorId: logItem.actorId ? String(logItem.actorId) : undefined,
    actorName: logItem.actorName || 'システム',
    eventDate: normalizeDateStr(logItem.eventDate) || getJstTodayStr(),
    summary: logItem.summary || '',
    detail: logItem.detail || undefined,
    createdAt: logItem.createdAt || getJstNowIso()
  };

  if (pool) {
    try {
      await ensureAssetTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(100), newLog.id)
        .input('assetId', sql.NVarChar(100), newLog.assetId)
        .input('actionType', sql.NVarChar(50), newLog.actionType)
        .input('actorId', sql.NVarChar(100), newLog.actorId || null)
        .input('actorName', sql.NVarChar(200), newLog.actorName)
        .input('eventDate', sql.NVarChar(30), newLog.eventDate)
        .input('summary', sql.NVarChar(500), newLog.summary)
        .input('detailJson', sql.NVarChar(sql.MAX), newLog.detail ? JSON.stringify(newLog.detail) : null)
        .query(`
          INSERT INTO dbo.AssetLogs (id, assetId, actionType, actorId, actorName, eventDate, summary, detailJson, createdAt)
          VALUES (@id, @assetId, @actionType, @actorId, @actorName, @eventDate, @summary, @detailJson, SYSDATETIME())
        `);
    } catch (e) {
      console.warn('[Assets] insertAssetLogRecord DB error:', e.message);
    }
  }

  const localLogs = loadJsonArray(assetLogsFilePath);
  localLogs.unshift(newLog);
  saveJsonArray(assetLogsFilePath, localLogs);
  return newLog;
}

async function updateAssetLogRecord(pool, logId, patch) {
  let existing = null;
  if (pool) {
    try {
      await ensureAssetTables(pool);
      const res = await pool.request()
        .input('id', sql.NVarChar(100), String(logId))
        .query('SELECT * FROM dbo.AssetLogs WHERE id = @id');
      if (res.recordset?.[0]) {
        existing = mapLogRow(res.recordset[0]);
      }
    } catch (e) {
      console.warn('[Assets] updateAssetLogRecord lookup DB warning:', e.message);
    }
  }

  const localLogs = loadJsonArray(assetLogsFilePath);
  const localIdx = localLogs.findIndex((l) => String(l.id) === String(logId));
  if (!existing && localIdx >= 0) {
    existing = localLogs[localIdx];
  }
  if (!existing) return null;

  const updated = {
    ...existing,
    actionType: patch.actionType !== undefined ? patch.actionType : existing.actionType,
    eventDate: patch.eventDate !== undefined ? (normalizeDateStr(patch.eventDate) || existing.eventDate) : existing.eventDate,
    summary: patch.summary !== undefined ? String(patch.summary) : existing.summary,
    actorId: patch.actorId !== undefined ? (patch.actorId ? String(patch.actorId) : undefined) : existing.actorId,
    actorName: patch.actorName !== undefined ? String(patch.actorName) : existing.actorName,
    detail: patch.detail !== undefined ? patch.detail : existing.detail
  };

  if (pool) {
    await ensureAssetTables(pool);
    await pool.request()
      .input('id', sql.NVarChar(100), updated.id)
      .input('actionType', sql.NVarChar(50), updated.actionType)
      .input('actorId', sql.NVarChar(100), updated.actorId || null)
      .input('actorName', sql.NVarChar(200), updated.actorName)
      .input('eventDate', sql.NVarChar(30), updated.eventDate)
      .input('summary', sql.NVarChar(500), updated.summary)
      .input('detailJson', sql.NVarChar(sql.MAX), updated.detail ? JSON.stringify(updated.detail) : null)
      .query(`
        UPDATE dbo.AssetLogs
        SET actionType = @actionType,
            actorId = @actorId,
            actorName = @actorName,
            eventDate = @eventDate,
            summary = @summary,
            detailJson = @detailJson
        WHERE id = @id
      `);
  }

  if (localIdx >= 0) {
    localLogs[localIdx] = updated;
  } else {
    localLogs.unshift(updated);
  }
  saveJsonArray(assetLogsFilePath, localLogs);
  return updated;
}

// ---------------------------------------------------------------------------
// 1. 資産種類 (AssetCategories) CRUD
// ---------------------------------------------------------------------------
router.get(['/categories', '/asset-categories'], async (req, res) => {
  try {
    const pool = await getPool();
    const list = await fetchAllCategories(pool);
    res.json(list);
  } catch (err) {
    console.error('[Assets] GET /categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post(['/categories', '/asset-categories'], async (req, res) => {
  try {
    const pool = await getPool();
    const existing = await fetchAllCategories(pool);
    const body = req.body || {};
    const nowIso = getJstNowIso();
    const id = body.id || `cat-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const maxSort = existing.reduce((acc, c) => Math.max(acc, c.sortOrder || 0), 0);

    const newCat = {
      id,
      name: String(body.name || '新規資産種類').trim(),
      icon: body.icon || 'Box',
      color: body.color || 'indigo',
      defaultShared: Boolean(body.defaultShared),
      allowInlineNotes: body.allowInlineNotes === undefined ? true : Boolean(body.allowInlineNotes),
      allowInlineAssignee: Boolean(body.allowInlineAssignee),
      fields: normalizeCategoryFields(Array.isArray(body.fields) ? body.fields : []),
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : maxSort + 1,
      isSystem: Boolean(body.isSystem),
      createdAt: nowIso,
      updatedAt: nowIso
    };

    if (pool) {
      await ensureAssetTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(100), newCat.id)
        .input('name', sql.NVarChar(200), newCat.name)
        .input('icon', sql.NVarChar(100), newCat.icon)
        .input('color', sql.NVarChar(50), newCat.color)
        .input('defaultShared', sql.Bit, newCat.defaultShared ? 1 : 0)
        .input('allowInlineNotes', sql.Bit, newCat.allowInlineNotes ? 1 : 0)
        .input('allowInlineAssignee', sql.Bit, newCat.allowInlineAssignee ? 1 : 0)
        .input('fieldsJson', sql.NVarChar(sql.MAX), JSON.stringify(newCat.fields))
        .input('sortOrder', sql.Int, newCat.sortOrder)
        .input('isSystem', sql.Bit, newCat.isSystem ? 1 : 0)
        .query(`
          INSERT INTO dbo.AssetCategories (id, name, icon, color, defaultShared, allowInlineNotes, allowInlineAssignee, fieldsJson, sortOrder, isSystem, createdAt, updatedAt)
          VALUES (@id, @name, @icon, @color, @defaultShared, @allowInlineNotes, @allowInlineAssignee, @fieldsJson, @sortOrder, @isSystem, SYSDATETIME(), SYSDATETIME())
        `);
    }

    const localCats = loadJsonArray(categoriesFilePath);
    localCats.push(newCat);
    saveJsonArray(categoriesFilePath, localCats);

    res.status(201).json(newCat);
  } catch (err) {
    console.error('[Assets] POST /categories error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put(['/categories/:id', '/asset-categories/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const pool = await getPool();
    const allCats = await fetchAllCategories(pool);
    const current = allCats.find((c) => c.id === id);
    if (!current) {
      return res.status(404).json({ error: '資産種類が見つかりません' });
    }

    const updatedCat = {
      ...current,
      name: body.name !== undefined ? String(body.name).trim() : current.name,
      icon: body.icon !== undefined ? String(body.icon) : current.icon,
      color: body.color !== undefined ? String(body.color) : current.color,
      defaultShared: body.defaultShared !== undefined ? Boolean(body.defaultShared) : current.defaultShared,
      allowInlineNotes:
        body.allowInlineNotes !== undefined
          ? Boolean(body.allowInlineNotes)
          : current.allowInlineNotes !== false,
      allowInlineAssignee:
        body.allowInlineAssignee !== undefined
          ? Boolean(body.allowInlineAssignee)
          : Boolean(current.allowInlineAssignee),
      fields: Array.isArray(body.fields) ? normalizeCategoryFields(body.fields) : current.fields,
      sortOrder: typeof body.sortOrder === 'number' ? body.sortOrder : current.sortOrder,
      updatedAt: getJstNowIso()
    };

    if (pool) {
      await ensureAssetTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(100), updatedCat.id)
        .input('name', sql.NVarChar(200), updatedCat.name)
        .input('icon', sql.NVarChar(100), updatedCat.icon)
        .input('color', sql.NVarChar(50), updatedCat.color)
        .input('defaultShared', sql.Bit, updatedCat.defaultShared ? 1 : 0)
        .input('allowInlineNotes', sql.Bit, updatedCat.allowInlineNotes ? 1 : 0)
        .input('allowInlineAssignee', sql.Bit, updatedCat.allowInlineAssignee ? 1 : 0)
        .input('fieldsJson', sql.NVarChar(sql.MAX), JSON.stringify(updatedCat.fields))
        .input('sortOrder', sql.Int, updatedCat.sortOrder)
        .query(`
          UPDATE dbo.AssetCategories
          SET name = @name,
              icon = @icon,
              color = @color,
              defaultShared = @defaultShared,
              allowInlineNotes = @allowInlineNotes,
              allowInlineAssignee = @allowInlineAssignee,
              fieldsJson = @fieldsJson,
              sortOrder = @sortOrder,
              updatedAt = SYSDATETIME()
          WHERE id = @id
        `);
    }

    const localCats = loadJsonArray(categoriesFilePath);
    const idx = localCats.findIndex((c) => c.id === id);
    if (idx >= 0) {
      localCats[idx] = updatedCat;
    } else {
      localCats.push(updatedCat);
    }
    saveJsonArray(categoriesFilePath, localCats);

    res.json(updatedCat);
  } catch (err) {
    console.error('[Assets] PUT /categories/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete(['/categories/:id', '/asset-categories/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    if (pool) {
      await ensureAssetTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(100), id)
        .query('DELETE FROM dbo.AssetCategories WHERE id = @id');
    }

    const localCats = loadJsonArray(categoriesFilePath).filter((c) => c.id !== id);
    saveJsonArray(categoriesFilePath, localCats);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[Assets] DELETE /categories/:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 1.5. カレンダー連携用・アクティブ点検予定一覧 ＆ 運転記録簿走行距離API
// ---------------------------------------------------------------------------
router.get(['/inspection-schedules'], async (req, res) => {
  try {
    const pool = await getPool();
    const [categories, assets, allLogs] = await Promise.all([
      fetchAllCategories(pool),
      fetchAllAssetsRaw(pool),
      fetchAllLogsRaw(pool)
    ]);

    const todayStr = getJstTodayStr();
    const categoryMap = new Map(categories.map((c) => [c.id, c]));
    const logsByAsset = new Map();
    for (const log of allLogs) {
      const aid = String(log.assetId);
      if (!logsByAsset.has(aid)) logsByAsset.set(aid, []);
      logsByAsset.get(aid).push(log);
    }

    const schedules = [];
    for (const asset of assets) {
      if (asset.status === 'retired') continue;
      const cat = categoryMap.get(asset.categoryId);
      const assetLogs = logsByAsset.get(String(asset.id)) || [];
      const scheduledLogs = assetLogs
        .filter((l) => isScheduledInspectionLog(l) && normalizeDateStr(l.eventDate))
        .sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));

      if (scheduledLogs.length > 0) {
        for (const slog of scheduledLogs) {
          const eventDate = normalizeDateStr(slog.eventDate);
          schedules.push({
            logId: slog.id,
            assetId: asset.id,
            assetName: asset.name,
            assetCode: asset.assetCode || '',
            categoryId: asset.categoryId,
            categoryName: cat?.name || '資産',
            isShared: Boolean(asset.isShared),
            assigneeUserId: asset.assigneeUserId || undefined,
            assigneeUserName: asset.assigneeUserName || undefined,
            officeId: asset.officeId || undefined,
            office: asset.office || undefined,
            eventDate,
            inspectionType: slog.detail?.inspectionType || asset.attributes?.inspectionType || undefined,
            vendor: slog.detail?.vendor || asset.attributes?.inspectionVendor || asset.attributes?.maintenanceVendor || undefined,
            summary: slog.summary || `${cat?.name || '資産'} 点検予定`,
            isDueOrOverdue: eventDate <= todayStr,
            source: 'log'
          });
        }
      } else {
        // 旧データ互換（ログ未移行の nextInspectionDate / nextCheckDate / nextCalibrationDate）
        const legacyDate = normalizeDateStr(
          asset.attributes?.nextInspectionDate ||
            asset.attributes?.nextCheckDate ||
            asset.attributes?.nextCalibrationDate
        );
        if (legacyDate) {
          schedules.push({
            assetId: asset.id,
            assetName: asset.name,
            assetCode: asset.assetCode || '',
            categoryId: asset.categoryId,
            categoryName: cat?.name || '資産',
            isShared: Boolean(asset.isShared),
            assigneeUserId: asset.assigneeUserId || undefined,
            assigneeUserName: asset.assigneeUserName || undefined,
            officeId: asset.officeId || undefined,
            office: asset.office || undefined,
            eventDate: legacyDate,
            inspectionType: asset.attributes?.inspectionType || undefined,
            vendor: asset.attributes?.inspectionVendor || asset.attributes?.maintenanceVendor || undefined,
            summary: `${asset.attributes?.inspectionType || '定期点検'}予定`,
            isDueOrOverdue: legacyDate <= todayStr,
            source: 'legacy_attribute'
          });
        }
      }
    }

    schedules.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    res.json(schedules);
  } catch (err) {
    console.error('[Assets] GET /inspection-schedules error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get(['/driving-mileages'], async (req, res) => {
  try {
    const pool = await getPool();
    const assets = await fetchAllAssetsRaw(pool);
    const mileages = await computeLatestDrivingMileages(pool, assets);
    res.json(mileages);
  } catch (err) {
    console.error('[Assets] GET /driving-mileages error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 2. 資産履歴 (AssetLogs) 一括取得 / 資産別取得 / 追加 / 更新 / 予定・実施確認 / 削除
// ---------------------------------------------------------------------------
router.get(['/logs', '/asset-logs'], async (req, res) => {
  try {
    const { assetId } = req.query;
    const pool = await getPool();
    const rows = await fetchAllLogsRaw(pool, assetId ? String(assetId) : undefined);
    res.json(rows);
  } catch (err) {
    console.error('[Assets] GET /logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.get(['/:assetId/logs'], async (req, res) => {
  try {
    const { assetId } = req.params;
    const pool = await getPool();
    const rows = await fetchAllLogsRaw(pool, String(assetId));
    res.json(rows);
  } catch (err) {
    console.error('[Assets] GET /:assetId/logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post(['/:assetId/logs', '/logs'], async (req, res) => {
  try {
    const assetId = req.params.assetId || req.body?.assetId;
    if (!assetId) {
      return res.status(400).json({ error: 'assetId が必要です' });
    }
    const body = req.body || {};
    const pool = await getPool();
    const createdLog = await insertAssetLogRecord(pool, {
      assetId,
      actionType: body.actionType || 'inspection',
      actorId: body.actorId,
      actorName: body.actorName || '担当者',
      eventDate: body.eventDate || getJstTodayStr(),
      summary: body.summary || '履歴を記録しました',
      detail: body.detail
    });

    // オプション: 点検予定登録/記録時に資産の属性と nextAlertDate を連動更新する場合
    if (body.updateAssetAttributes && typeof body.updateAssetAttributes === 'object') {
      const patchAttrs = body.updateAssetAttributes;
      const [cats, currentAsset, assetLogs] = await Promise.all([
        fetchAllCategories(pool),
        fetchAssetById(pool, assetId),
        fetchAllLogsRaw(pool, assetId)
      ]);
      if (currentAsset) {
        const mergedAttrs = { ...currentAsset.attributes, ...patchAttrs };
        const cat = cats.find((c) => c.id === currentAsset.categoryId);
        const nextAlertDate = computeNextAlertDateWithLogs(
          { ...currentAsset, attributes: mergedAttrs },
          cat,
          assetLogs
        );
        await persistAssetUpdate(pool, {
          ...currentAsset,
          attributes: mergedAttrs,
          nextAlertDate: nextAlertDate || undefined,
          updatedAt: getJstNowIso()
        });
      }
    } else if (body.actionType === 'inspection') {
      const [cats, currentAsset, assetLogs] = await Promise.all([
        fetchAllCategories(pool),
        fetchAssetById(pool, assetId),
        fetchAllLogsRaw(pool, assetId)
      ]);
      if (currentAsset) {
        const cat = cats.find((c) => c.id === currentAsset.categoryId);
        const nextAlertDate = computeNextAlertDateWithLogs(currentAsset, cat, assetLogs);
        await persistAssetUpdate(pool, {
          ...currentAsset,
          nextAlertDate: nextAlertDate || undefined,
          updatedAt: getJstNowIso()
        });
      }
    }

    res.status(201).json(createdLog);
  } catch (err) {
    console.error('[Assets] POST /:assetId/logs error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 点検予定の作成・更新・取消 (SSOT: AssetLogs.detail.inspectionStatus = 'scheduled')
router.put(['/:assetId/scheduled-inspection'], async (req, res) => {
  try {
    const { assetId } = req.params;
    const body = req.body || {};
    const pool = await getPool();

    const [cats, currentAsset, assetLogs] = await Promise.all([
      fetchAllCategories(pool),
      fetchAssetById(pool, assetId),
      fetchAllLogsRaw(pool, assetId)
    ]);

    if (!currentAsset) {
      return res.status(404).json({ error: '対象の資産が見つかりません' });
    }

    const cat = cats.find((c) => c.id === currentAsset.categoryId);
    const activeScheduled = assetLogs
      .filter((l) => isScheduledInspectionLog(l))
      .sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''));

    const targetLog = body.logId
      ? activeScheduled.find((l) => String(l.id) === String(body.logId)) || activeScheduled[0]
      : activeScheduled[0];

    const normalizedDate = normalizeDateStr(body.eventDate);
    const actorId = body.actorId ? String(body.actorId) : undefined;
    const actorName = body.actorName ? String(body.actorName) : '担当者';

    let resultLog = null;

    if (!normalizedDate) {
      // 予定日クリア時はアクティブ予定を取消 (cancelled) に遷移
      for (const slog of activeScheduled) {
        await updateAssetLogRecord(pool, slog.id, {
          actorId,
          actorName,
          summary: `${slog.detail?.inspectionType || '点検'}予定を取り消しました`,
          detail: {
            ...(slog.detail || {}),
            inspectionStatus: 'cancelled',
            cancellationReason: body.cancellationReason || '予定クリア'
          }
        });
      }
    } else if (targetLog) {
      const nextType =
        body.inspectionType !== undefined
          ? String(body.inspectionType || '').trim()
          : targetLog.detail?.inspectionType || currentAsset.attributes?.inspectionType || '定期点検';
      const nextVendor =
        body.vendor !== undefined
          ? String(body.vendor || '').trim()
          : targetLog.detail?.vendor || currentAsset.attributes?.inspectionVendor || currentAsset.attributes?.maintenanceVendor || '';
      const nextSummary =
        body.summary && String(body.summary).trim()
          ? String(body.summary).trim()
          : `${nextType || '定期点検'} 予定`;

      resultLog = await updateAssetLogRecord(pool, targetLog.id, {
        eventDate: normalizedDate,
        actorId,
        actorName,
        summary: nextSummary,
        detail: {
          ...(targetLog.detail || {}),
          inspectionStatus: 'scheduled',
          inspectionType: nextType || undefined,
          vendor: nextVendor || undefined,
          memo: body.memo !== undefined ? String(body.memo) : targetLog.detail?.memo
        }
      });
    } else {
      const nextType =
        body.inspectionType !== undefined
          ? String(body.inspectionType || '').trim()
          : currentAsset.attributes?.inspectionType || '定期点検';
      const nextVendor =
        body.vendor !== undefined
          ? String(body.vendor || '').trim()
          : currentAsset.attributes?.inspectionVendor || currentAsset.attributes?.maintenanceVendor || '';
      const nextSummary =
        body.summary && String(body.summary).trim()
          ? String(body.summary).trim()
          : `${nextType || '定期点検'} 予定`;

      resultLog = await insertAssetLogRecord(pool, {
        assetId: currentAsset.id,
        actionType: 'inspection',
        actorId,
        actorName,
        eventDate: normalizedDate,
        summary: nextSummary,
        detail: {
          inspectionStatus: 'scheduled',
          inspectionType: nextType || undefined,
          vendor: nextVendor || undefined,
          memo: body.memo ? String(body.memo) : undefined
        }
      });
    }

    // 属性側の古い予定日付キーを除去してSSOTを保証（業者・内容は設定されていれば反映）
    const cleanedAttrs = { ...(currentAsset.attributes || {}) };
    delete cleanedAttrs.nextInspectionDate;
    delete cleanedAttrs.nextCheckDate;
    delete cleanedAttrs.nextCalibrationDate;
    if (body.inspectionType !== undefined) {
      if (body.inspectionType) cleanedAttrs.inspectionType = body.inspectionType;
      else delete cleanedAttrs.inspectionType;
    }
    if (body.vendor !== undefined) {
      const hasMaintVendor = cat?.fields?.some((f) => f.key === 'maintenanceVendor');
      const hasInspVendor = cat?.fields?.some((f) => f.key === 'inspectionVendor');
      if (hasMaintVendor && !hasInspVendor) {
        if (body.vendor) cleanedAttrs.maintenanceVendor = body.vendor;
        else delete cleanedAttrs.maintenanceVendor;
      } else {
        if (body.vendor) cleanedAttrs.inspectionVendor = body.vendor;
        else delete cleanedAttrs.inspectionVendor;
      }
    }

    const latestLogs = await fetchAllLogsRaw(pool, assetId);
    const nextAlertDate = computeNextAlertDateWithLogs(
      { ...currentAsset, attributes: cleanedAttrs },
      cat,
      latestLogs
    );

    const updatedAsset = {
      ...currentAsset,
      attributes: cleanedAttrs,
      nextAlertDate: nextAlertDate || undefined,
      updatedAt: getJstNowIso()
    };
    await persistAssetUpdate(pool, updatedAsset);

    res.json({ scheduledLog: resultLog, asset: updatedAsset });
  } catch (err) {
    console.error('[Assets] PUT /:assetId/scheduled-inspection error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 既存履歴・予定ログの更新（予定日延期・内容修正・予定取消など）
router.put(['/logs/:logId', '/:assetId/logs/:logId'], async (req, res) => {
  try {
    const { logId } = req.params;
    const body = req.body || {};
    const pool = await getPool();

    const updatedLog = await updateAssetLogRecord(pool, logId, {
      actionType: body.actionType,
      eventDate: body.eventDate,
      summary: body.summary,
      actorId: body.actorId,
      actorName: body.actorName,
      detail: body.detail
    });

    if (!updatedLog) {
      return res.status(404).json({ error: '対象の履歴が見つかりません' });
    }

    let updatedAsset = null;
    const targetAssetId = req.params.assetId || updatedLog.assetId;
    if (targetAssetId) {
      const [cats, currentAsset, assetLogs] = await Promise.all([
        fetchAllCategories(pool),
        fetchAssetById(pool, targetAssetId),
        fetchAllLogsRaw(pool, targetAssetId)
      ]);
      if (currentAsset) {
        const cat = cats.find((c) => c.id === currentAsset.categoryId);
        const nextAlertDate = computeNextAlertDateWithLogs(currentAsset, cat, assetLogs);
        updatedAsset = {
          ...currentAsset,
          nextAlertDate: nextAlertDate || undefined,
          updatedAt: getJstNowIso()
        };
        await persistAssetUpdate(pool, updatedAsset);
      }
    }

    res.json({ log: updatedLog, asset: updatedAsset });
  } catch (err) {
    console.error('[Assets] PUT /logs/:logId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// 点検実施の確認・確定履歴化（予定ログを completed へ昇格 or 新規確定履歴登録 & 予定クリア & 最終点検日SSOT更新）
router.post(['/logs/:logId/confirm', '/:assetId/inspections/confirm'], async (req, res) => {
  try {
    const paramLogId = req.params.logId || req.body?.logId;
    const paramAssetId = req.params.assetId || req.body?.assetId;
    const body = req.body || {};
    const pool = await getPool();

    const allLogs = await fetchAllLogsRaw(pool);
    let targetLog = paramLogId
      ? allLogs.find((l) => String(l.id) === String(paramLogId)) || null
      : null;

    const targetAssetId = paramAssetId || targetLog?.assetId;
    if (!targetAssetId) {
      return res.status(400).json({ error: '対象の assetId または logId が必要です' });
    }

    if (!targetLog) {
      // scheduled ログがある場合は直近の未確認予定を昇格対象にする
      targetLog =
        allLogs
          .filter((l) => String(l.assetId) === String(targetAssetId) && isScheduledInspectionLog(l))
          .sort((a, b) => (a.eventDate || '').localeCompare(b.eventDate || ''))[0] || null;
    }

    const [cats, currentAsset] = await Promise.all([
      fetchAllCategories(pool),
      fetchAssetById(pool, targetAssetId)
    ]);

    if (!currentAsset) {
      return res.status(404).json({ error: '対象の資産が見つかりません' });
    }

    const actualDate = normalizeDateStr(body.actualDate || body.eventDate) || getJstTodayStr();
    const inspectionType =
      body.inspectionType !== undefined
        ? String(body.inspectionType || '').trim()
        : targetLog?.detail?.inspectionType || currentAsset.attributes?.inspectionType || '定期点検';
    const vendor =
      body.vendor !== undefined
        ? String(body.vendor || '').trim()
        : targetLog?.detail?.vendor || currentAsset.attributes?.inspectionVendor || currentAsset.attributes?.maintenanceVendor || '';

    const parsedCost =
      body.cost !== undefined && body.cost !== null && body.cost !== ''
        ? Number(String(body.cost).replace(/,/g, ''))
        : targetLog?.detail?.cost;
    const parsedMileage =
      body.mileage !== undefined && body.mileage !== null && body.mileage !== ''
        ? Number(String(body.mileage).replace(/,/g, ''))
        : targetLog?.detail?.mileage;

    const checklistResults = Array.isArray(body.checklistResults)
      ? body.checklistResults
      : targetLog?.detail?.checklistResults;

    const actorId = body.actorId ? String(body.actorId) : undefined;
    const actorName = body.actorName ? String(body.actorName) : '担当者';
    const summaryText =
      body.summary && String(body.summary).trim()
        ? String(body.summary).trim()
        : `${inspectionType || '定期点検'} 実施確定`;

    const confirmedDetail = {
      ...(targetLog?.detail || {}),
      inspectionStatus: 'completed',
      inspectionType: inspectionType || undefined,
      vendor: vendor || undefined,
      cost: Number.isFinite(parsedCost) ? parsedCost : undefined,
      mileage: Number.isFinite(parsedMileage) ? parsedMileage : undefined,
      checklistResults: Array.isArray(checklistResults) ? checklistResults : undefined,
      memo: body.memo !== undefined ? String(body.memo) : targetLog?.detail?.memo,
      confirmedAt: getJstNowIso(),
      confirmedById: actorId,
      confirmedByName: actorName,
      scheduledDateBefore: targetLog?.eventDate || body.scheduledDateBefore || undefined
    };

    let confirmedLog;
    if (targetLog) {
      confirmedLog = await updateAssetLogRecord(pool, targetLog.id, {
        actionType: 'inspection',
        actorId,
        actorName,
        eventDate: actualDate,
        summary: summaryText,
        detail: confirmedDetail
      });
    } else {
      confirmedLog = await insertAssetLogRecord(pool, {
        assetId: currentAsset.id,
        actionType: 'inspection',
        actorId,
        actorName,
        eventDate: actualDate,
        summary: summaryText,
        detail: confirmedDetail
      });
    }

    // 同一資産に残っている他の期限済み・対象 scheduled ログが「同日・確認済み」として明示指定された場合以外は予定クリア（今回は単一アクティブ予定モデルのため他scheduledがあれば維持、単一予定なら既にcompleted化済み）
    let nextScheduledLog = null;
    const nextScheduledDate = normalizeDateStr(body.nextScheduledDate);
    if (nextScheduledDate) {
      nextScheduledLog = await insertAssetLogRecord(pool, {
        assetId: currentAsset.id,
        actionType: 'inspection',
        actorId,
        actorName,
        eventDate: nextScheduledDate,
        summary: `${body.nextInspectionType || inspectionType || '次回点検'} 予定`,
        detail: {
          inspectionStatus: 'scheduled',
          inspectionType: body.nextInspectionType || inspectionType || '定期点検',
          vendor: vendor || undefined
        }
      });
    }

    // 最終点検日・予定日属性をクリアし、SSOT（確定履歴 / アクティブ予定ログ）を唯一の正解とする
    const cleanedAttrs = stripLegacyInspectionDateAttrs(currentAsset.attributes);
    if (inspectionType) {
      cleanedAttrs.inspectionType = inspectionType;
    }
    if (vendor) {
      const cat = cats.find((c) => c.id === currentAsset.categoryId);
      const hasMaintVendor = cat?.fields?.some((f) => f.key === 'maintenanceVendor');
      const hasInspVendor = cat?.fields?.some((f) => f.key === 'inspectionVendor');
      if (hasMaintVendor && !hasInspVendor) {
        cleanedAttrs.maintenanceVendor = vendor;
      } else {
        cleanedAttrs.inspectionVendor = vendor;
      }
    }

    const refreshedLogs = await fetchAllLogsRaw(pool, currentAsset.id);
    const cat = cats.find((c) => c.id === currentAsset.categoryId);
    const nextAlertDate = computeNextAlertDateWithLogs(
      { ...currentAsset, attributes: cleanedAttrs },
      cat,
      refreshedLogs
    );

    const updatedAsset = {
      ...currentAsset,
      attributes: cleanedAttrs,
      notes: body.notesUpdate !== undefined ? String(body.notesUpdate) : currentAsset.notes,
      nextAlertDate: nextAlertDate || undefined,
      updatedAt: getJstNowIso()
    };
    await persistAssetUpdate(pool, updatedAsset);

    const dlMap = await computeLatestDrivingMileages(pool, [updatedAsset]);
    const dl = dlMap[updatedAsset.id];
    const enrichedUpdatedAsset = dl
      ? {
          ...updatedAsset,
          latestDrivingMileage: dl.mileage,
          latestDrivingMileageDate: dl.date,
          latestDrivingReportId: dl.reportId
        }
      : updatedAsset;

    res.json({
      log: confirmedLog,
      nextScheduledLog,
      asset: enrichedUpdatedAsset
    });
  } catch (err) {
    console.error('[Assets] POST /inspections/confirm error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete(['/logs/:logId', '/:assetId/logs/:logId'], async (req, res) => {
  try {
    const { logId } = req.params;
    const pool = await getPool();
    const allLogs = await fetchAllLogsRaw(pool);
    const targetLog = allLogs.find((l) => String(l.id) === String(logId));

    if (pool) {
      await ensureAssetTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(100), logId)
        .query('DELETE FROM dbo.AssetLogs WHERE id = @id');
    }
    const localLogs = loadJsonArray(assetLogsFilePath).filter((l) => l.id !== logId);
    saveJsonArray(assetLogsFilePath, localLogs);

    if (targetLog?.assetId) {
      const [cats, currentAsset, remainingLogs] = await Promise.all([
        fetchAllCategories(pool),
        fetchAssetById(pool, targetLog.assetId),
        fetchAllLogsRaw(pool, targetLog.assetId)
      ]);
      if (currentAsset) {
        const cat = cats.find((c) => c.id === currentAsset.categoryId);
        const nextAlertDate = computeNextAlertDateWithLogs(currentAsset, cat, remainingLogs);
        await persistAssetUpdate(pool, {
          ...currentAsset,
          nextAlertDate: nextAlertDate || undefined,
          updatedAt: getJstNowIso()
        });
      }
    }

    res.json({ success: true, id: logId });
  } catch (err) {
    console.error('[Assets] DELETE /logs/:logId error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// 3. 資産本体 (Assets) CRUD
// ---------------------------------------------------------------------------
router.get(['/', '/assets', '/items', '/list'], async (req, res) => {
  try {
    const pool = await getPool();
    await seedDefaultCategoriesIfNeeded(pool);

    const rows = await fetchAllAssetsRaw(pool);
    const drivingMileageMap = await computeLatestDrivingMileages(pool, rows);

    const enriched = rows.map((asset) => {
      const dl = drivingMileageMap[asset.id];
      if (!dl) return asset;
      return {
        ...asset,
        latestDrivingMileage: dl.mileage,
        latestDrivingMileageDate: dl.date,
        latestDrivingReportId: dl.reportId
      };
    });

    res.json(enriched);
  } catch (err) {
    console.error('[Assets] GET / error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.post(['/', '/assets'], async (req, res) => {
  try {
    const pool = await getPool();
    const cats = await fetchAllCategories(pool);
    const body = req.body || {};
    const nowIso = getJstNowIso();
    const id = body.id || `ast-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const category = cats.find((c) => c.id === body.categoryId);
    const isShared = Boolean(body.isShared);
    const attributes = body.attributes && typeof body.attributes === 'object' ? { ...body.attributes } : {};
    const attachments = Array.isArray(body.attachments) ? body.attachments : [];
    const inspectionItems = sanitizeInspectionItems(body.inspectionItems);
    const nextAlertDate = computeEarliestAlertDate(attributes, category);

    const newAsset = {
      id,
      categoryId: String(body.categoryId || (cats[0]?.id || 'cat-vehicle')),
      assetCode: String(body.assetCode || '').trim(),
      name: String(body.name || body.assetCode || '名称未設定').trim(),
      officeId: body.officeId ? String(body.officeId) : undefined,
      office: body.office ? String(body.office) : undefined,
      divisionId: body.divisionId ? String(body.divisionId) : undefined,
      division: body.division ? String(body.division) : undefined,
      assigneeUserId: isShared ? undefined : (body.assigneeUserId ? String(body.assigneeUserId) : undefined),
      assigneeUserName: isShared ? undefined : (body.assigneeUserName ? String(body.assigneeUserName) : undefined),
      isShared,
      status: body.status || 'active',
      nextAlertDate: nextAlertDate || undefined,
      attributes,
      attachments,
      inspectionItems,
      notes: body.notes || '',
      createdBy: body.createdBy ? String(body.createdBy) : undefined,
      createdByName: body.createdByName ? String(body.createdByName) : undefined,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    if (pool) {
      await ensureAssetTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(100), newAsset.id)
        .input('categoryId', sql.NVarChar(100), newAsset.categoryId)
        .input('assetCode', sql.NVarChar(200), newAsset.assetCode || null)
        .input('name', sql.NVarChar(300), newAsset.name)
        .input('officeId', sql.NVarChar(100), newAsset.officeId || null)
        .input('office', sql.NVarChar(200), newAsset.office || null)
        .input('divisionId', sql.NVarChar(100), newAsset.divisionId || null)
        .input('division', sql.NVarChar(200), newAsset.division || null)
        .input('assigneeUserId', sql.NVarChar(100), newAsset.assigneeUserId || null)
        .input('assigneeUserName', sql.NVarChar(200), newAsset.assigneeUserName || null)
        .input('isShared', sql.Bit, newAsset.isShared ? 1 : 0)
        .input('status', sql.NVarChar(50), newAsset.status)
        .input('nextAlertDate', sql.NVarChar(30), newAsset.nextAlertDate || null)
        .input('attributesJson', sql.NVarChar(sql.MAX), JSON.stringify(newAsset.attributes))
        .input('attachmentsJson', sql.NVarChar(sql.MAX), JSON.stringify(newAsset.attachments))
        .input(
          'inspectionItemsJson',
          sql.NVarChar(sql.MAX),
          Array.isArray(newAsset.inspectionItems) ? JSON.stringify(newAsset.inspectionItems) : null
        )
        .input('notes', sql.NVarChar(sql.MAX), newAsset.notes || null)
        .input('createdBy', sql.NVarChar(100), newAsset.createdBy || null)
        .input('createdByName', sql.NVarChar(200), newAsset.createdByName || null)
        .query(`
          INSERT INTO dbo.Assets (
            id, categoryId, assetCode, name, officeId, office, divisionId, division,
            assigneeUserId, assigneeUserName, isShared, status, nextAlertDate,
            attributesJson, attachmentsJson, inspectionItemsJson, notes, createdBy, createdByName, createdAt, updatedAt
          ) VALUES (
            @id, @categoryId, @assetCode, @name, @officeId, @office, @divisionId, @division,
            @assigneeUserId, @assigneeUserName, @isShared, @status, @nextAlertDate,
            @attributesJson, @attachmentsJson, @inspectionItemsJson, @notes, @createdBy, @createdByName, SYSDATETIME(), SYSDATETIME()
          )
        `);
    }

    const localAssets = loadJsonArray(assetsFilePath);
    localAssets.unshift(newAsset);
    saveJsonArray(assetsFilePath, localAssets);

    // 登録履歴を自動記録
    if (!body.skipLog) {
      await insertAssetLogRecord(pool, {
        assetId: newAsset.id,
        actionType: 'register',
        actorId: body.actorId || newAsset.createdBy,
        actorName: body.actorName || newAsset.createdByName || '担当者',
        eventDate: getJstTodayStr(),
        summary: `資産「${newAsset.name}」を新規登録しました${newAsset.isShared ? '（共用資産）' : newAsset.assigneeUserName ? `（使用者: ${newAsset.assigneeUserName}）` : ''}`,
        detail: {
          categoryName: category?.name,
          afterAssignee: newAsset.isShared ? '共用（限定なし）' : (newAsset.assigneeUserName || '未割当')
        }
      });
    }

    const dlMap = await computeLatestDrivingMileages(pool, [newAsset]);
    const dl = dlMap[newAsset.id];
    res.status(201).json(
      dl
        ? {
            ...newAsset,
            latestDrivingMileage: dl.mileage,
            latestDrivingMileageDate: dl.date,
            latestDrivingReportId: dl.reportId
          }
        : newAsset
    );
  } catch (err) {
    console.error('[Assets] POST / error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.put(['/:id', '/assets/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const pool = await getPool();
    const [cats, assetLogs] = await Promise.all([
      fetchAllCategories(pool),
      fetchAllLogsRaw(pool, id)
    ]);

    const current = await fetchAssetById(pool, id);
    if (!current) {
      return res.status(404).json({ error: '対象の資産が見つかりません' });
    }

    const nextCategoryId = body.categoryId !== undefined ? String(body.categoryId) : current.categoryId;
    const category = cats.find((c) => c.id === nextCategoryId);
    const nextIsShared = body.isShared !== undefined ? Boolean(body.isShared) : current.isShared;
    const nextAttributes = body.attributes !== undefined ? body.attributes : current.attributes;
    const nextAttachments = Array.isArray(body.attachments) ? body.attachments : current.attachments;
    const nextInspectionItems =
      body.inspectionItems !== undefined
        ? sanitizeInspectionItems(body.inspectionItems)
        : current.inspectionItems;

    const nextAlertDate = computeNextAlertDateWithLogs(
      { ...current, categoryId: nextCategoryId, attributes: nextAttributes },
      category,
      assetLogs
    );

    const updated = {
      ...current,
      categoryId: nextCategoryId,
      assetCode: body.assetCode !== undefined ? String(body.assetCode).trim() : current.assetCode,
      name: body.name !== undefined ? String(body.name).trim() : current.name,
      officeId: body.officeId !== undefined ? (body.officeId || undefined) : current.officeId,
      office: body.office !== undefined ? (body.office || undefined) : current.office,
      divisionId: body.divisionId !== undefined ? (body.divisionId || undefined) : current.divisionId,
      division: body.division !== undefined ? (body.division || undefined) : current.division,
      assigneeUserId: nextIsShared ? undefined : (body.assigneeUserId !== undefined ? (body.assigneeUserId || undefined) : current.assigneeUserId),
      assigneeUserName: nextIsShared ? undefined : (body.assigneeUserName !== undefined ? (body.assigneeUserName || undefined) : current.assigneeUserName),
      isShared: nextIsShared,
      status: body.status !== undefined ? body.status : current.status,
      nextAlertDate: nextAlertDate || undefined,
      attributes: nextAttributes,
      attachments: nextAttachments,
      inspectionItems: nextInspectionItems,
      notes: body.notes !== undefined ? body.notes : current.notes,
      updatedAt: getJstNowIso()
    };

    await persistAssetUpdate(pool, updated);

    // 変更内容の自動履歴生成
    if (!body.skipLog) {
      const actorId = body.actorId;
      const actorName = body.actorName || '担当者';

      const prevAssigneeLabel = current.isShared ? '共用（限定なし）' : (current.assigneeUserName || '未割当');
      const nextAssigneeLabel = updated.isShared ? '共用（限定なし）' : (updated.assigneeUserName || '未割当');
      if (prevAssigneeLabel !== nextAssigneeLabel || current.isShared !== updated.isShared) {
        await insertAssetLogRecord(pool, {
          assetId: updated.id,
          actionType: 'assignee_change',
          actorId,
          actorName,
          eventDate: getJstTodayStr(),
          summary: `使用形態・使用者を変更: ${prevAssigneeLabel} → ${nextAssigneeLabel}`,
          detail: {
            beforeAssignee: prevAssigneeLabel,
            afterAssignee: nextAssigneeLabel
          }
        });
      }

      const changedFields = [];
      if (current.name !== updated.name) {
        changedFields.push({ key: 'name', label: '名称/登録番号', before: current.name, after: updated.name });
      }
      if (current.status !== updated.status) {
        changedFields.push({ key: 'status', label: '状態', before: current.status, after: updated.status });
      }
      if ((current.office || '') !== (updated.office || '')) {
        changedFields.push({ key: 'office', label: '拠点', before: current.office || '', after: updated.office || '' });
      }
      if ((current.notes || '') !== (updated.notes || '')) {
        changedFields.push({ key: 'notes', label: '備考', before: current.notes || '', after: updated.notes || '' });
      }

      if (JSON.stringify(current.inspectionItems || []) !== JSON.stringify(updated.inspectionItems || [])) {
        changedFields.push({
          key: 'inspectionItems',
          label: '点検項目チェックリスト',
          before: `${(current.inspectionItems || []).length}件`,
          after: `${(updated.inspectionItems || []).length}件`
        });
      }

      const fieldDefs = category?.fields || [];
      const allKeys = new Set([
        ...Object.keys(current.attributes || {}),
        ...Object.keys(updated.attributes || {})
      ]);
      for (const k of allKeys) {
        const bVal = current.attributes?.[k];
        const aVal = updated.attributes?.[k];
        if (JSON.stringify(bVal ?? '') !== JSON.stringify(aVal ?? '')) {
          const def = fieldDefs.find((f) => f.key === k);
          changedFields.push({
            key: k,
            label: def?.label || k,
            before: bVal ?? '',
            after: aVal ?? ''
          });
        }
      }

      if (changedFields.length > 0) {
        const labels = changedFields.slice(0, 4).map((f) => f.label).join('、');
        const suffix = changedFields.length > 4 ? ` ほか${changedFields.length - 4}件` : '';
        await insertAssetLogRecord(pool, {
          assetId: updated.id,
          actionType: updated.status === 'retired' && current.status !== 'retired' ? 'retire' : 'update',
          actorId,
          actorName,
          eventDate: getJstTodayStr(),
          summary: `項目を更新しました（${labels}${suffix}）`,
          detail: { changedFields }
        });
      }
    }

    // 運転記録簿の最新走行距離があればレスポンスに付帯
    const dlMap = await computeLatestDrivingMileages(pool, [updated]);
    const dl = dlMap[updated.id];
    res.json(
      dl
        ? {
            ...updated,
            latestDrivingMileage: dl.mileage,
            latestDrivingMileageDate: dl.date,
            latestDrivingReportId: dl.reportId
          }
        : updated
    );
  } catch (err) {
    console.error('[Assets] PUT /:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

router.delete(['/:id', '/assets/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();
    if (pool) {
      await ensureAssetTables(pool);
      await pool.request()
        .input('id', sql.NVarChar(100), id)
        .query('DELETE FROM dbo.AssetLogs WHERE assetId = @id; DELETE FROM dbo.Assets WHERE id = @id;');
    }
    const localAssets = loadJsonArray(assetsFilePath).filter((a) => a.id !== id);
    saveJsonArray(assetsFilePath, localAssets);
    const localLogs = loadJsonArray(assetLogsFilePath).filter((l) => l.assetId !== id);
    saveJsonArray(assetLogsFilePath, localLogs);
    res.json({ success: true, id });
  } catch (err) {
    console.error('[Assets] DELETE /:id error:', err);
    res.status(500).json({ error: err.message });
  }
});

export default router;
