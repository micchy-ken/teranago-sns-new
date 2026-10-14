/**
 * routes/sites.js
 * 寺岡オートドアSNS 現場管理・施工スケジュール・在庫DB部品連携 APIモジュール
 * 最終更新: 2026年10月14日 (現場管理のEG台数・主要部品号機番号展開・在庫DB連携正規化・複数台現場の1/1表記不具合解消)
 */
import { Router } from 'express';
import sql from 'mssql';
import path from 'path';
import fs from 'fs';
import { getPool } from '../db.js';
import { dataDir } from '../config.js';

const router = Router();
const sitesFilePath = path.join(dataDir, 'sites.json');

// --- ヘルパー関数 (Local JSON フォールバック) ---
function loadSitesFile() {
  if (!fs.existsSync(sitesFilePath)) return [];
  try {
    const raw = fs.readFileSync(sitesFilePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    console.error('[Sites] Failed to read JSON file:', e);
    return [];
  }
}

function saveSitesFile(data) {
  try {
    fs.writeFileSync(sitesFilePath, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[Sites] Failed to save JSON file:', e);
  }
}

// DBレコード -> フロントエンド用モデル変換
function mapDbRowToSite(row) {
  let coWorkers = [];
  try {
    if (row.coWorkersJson) coWorkers = JSON.parse(row.coWorkersJson);
  } catch (_) {}

  let mainParts = [];
  try {
    if (row.mainPartsJson) mainParts = JSON.parse(row.mainPartsJson);
  } catch (_) {}

  let subPartsCache = [];
  try {
    if (row.subPartsCacheJson) subPartsCache = JSON.parse(row.subPartsCacheJson);
  } catch (_) {}

  let comments = [];
  try {
    if (row.commentsJson) comments = JSON.parse(row.commentsJson);
  } catch (_) {}

  let attachments = [];
  try {
    if (row.attachmentsJson) attachments = JSON.parse(row.attachmentsJson);
  } catch (_) {}

  const fmtDate = (d) => {
    if (!d) return undefined;
    if (d instanceof Date) return d.toISOString().slice(0, 10);
    return String(d).slice(0, 10);
  };

  const rowEgCount = typeof row.egCount === 'number' ? row.egCount : parseInt(row.egCount || '1', 10);
  const totalEg = Math.max(rowEgCount, mainParts.length);
  // 既存データで 1/1 になってしまっている場合の自動修復
  if (totalEg > 1 && Array.isArray(mainParts) && mainParts.length > 0) {
    const isAllOne = mainParts.every(p => !p.originalQuantity || p.originalQuantity === 1);
    if (isAllOne) {
      let gIdx = 0;
      mainParts = mainParts.map((p, idx) => {
        gIdx++;
        const pName = p.partName || '';
        const match = (pName + ' ' + (p.note || '')).match(/[(（]?(\d+)\s*(?:号機|台目|号)[)）]?/);
        const uIdx = match ? parseInt(match[1], 10) : gIdx;
        return {
          ...p,
          unitIndex: uIdx,
          originalQuantity: totalEg,
          note: p.note || `（${totalEg}台中 ${uIdx}台目）`
        };
      });
    }
  }

  return {
    id: String(row.id),
    siteCode: String(row.siteCode || ''),
    siteName: String(row.siteName || ''),
    egCount: totalEg > 0 ? totalEg : 1,
    customerName: row.customerName || '',
    address: row.address || '',
    orderNo: row.orderNo || '',
    status: row.status || 'not_started',
    startDate: fmtDate(row.startDate),
    endDate: fmtDate(row.endDate),
    constructionDate: fmtDate(row.constructionDate),
    primaryWorkerId: row.primaryWorkerId ? String(row.primaryWorkerId) : undefined,
    primaryWorkerName: row.primaryWorkerName || undefined,
    coWorkers,
    mainParts,
    subPartsCache,
    notes: row.notes || '',
    comments,
    attachments,
    drawingUrl: row.drawingUrl || undefined,
    createdById: row.createdById ? String(row.createdById) : undefined,
    createdByName: row.createdByName || undefined,
    createdAt: row.createdAt ? (row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt)) : new Date().toISOString(),
    updatedAt: row.updatedAt ? (row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt)) : new Date().toISOString()
  };
}

// 部品分割展開ヘルパー（「型番 2台」を「型番 1台」「型番 1台」に1台ずつ分割、複数台現場の号機展開・総台数付与）
export function expandMainParts(rawParts = [], fallbackTotalEgCount = 0) {
  if (!Array.isArray(rawParts)) return [];
  const expanded = [];
  
  // 主要部品のみ抽出
  const mainPartsList = rawParts.filter(p => p.isMain === true || p.type === 'main' || (!p.type && p.category !== 'sub'));
  
  // 主要部品の合計台数を算出
  let totalMainUnits = mainPartsList.reduce((sum, p) => sum + Math.max(1, parseInt(p.quantity || 1, 10)), 0);
  const totalSiteEgCount = Math.max(totalMainUnits, parseInt(fallbackTotalEgCount || 0, 10));

  let globalMainIdx = 0;

  rawParts.forEach((part, partIdx) => {
    const qty = Math.max(1, parseInt(part.quantity || 1, 10));
    const isMain = part.isMain === true || part.type === 'main' || (!part.type && part.category !== 'sub');
    if (!isMain) return; // 付属部品は除外

    // 品名や備考から「(1号機)」「1号機」「#1」などの号機番号を抽出
    const pName = part.partName || part.name || '';
    const noteStr = part.note || '';
    const machineMatch = (pName + ' ' + noteStr).match(/[(（]?(\d+)\s*(?:号機|台目|号)[)）]?/);
    const detectedUnitIndex = machineMatch ? parseInt(machineMatch[1], 10) : null;

    for (let i = 1; i <= qty; i++) {
      globalMainIdx++;
      // 号機番号: 品名で検出された番号、または全体インデックス、または数量内のインデックス
      const unitIndex = (qty === 1 && detectedUnitIndex) ? detectedUnitIndex : (qty > 1 ? i : (totalSiteEgCount > 1 ? globalMainIdx : 1));
      // 総台数: 現場全体の総台数（totalSiteEgCount > 1 ならその値、または qty）
      const originalQuantity = totalSiteEgCount > 1 ? totalSiteEgCount : Math.max(qty, 1);

      expanded.push({
        id: part.id ? `${part.id}-${i}` : `part-${Date.now()}-${partIdx}-${i}`,
        partCode: part.partCode || part.modelNumber || part.code || '',
        partName: pName,
        originalQuantity,
        unitIndex,
        quantity: 1,
        unit: part.unit || '台',
        serialNo: part.serialNo || '',
        inStockDate: part.inStockDate || part.inboundDate || undefined,
        outStockDate: part.outStockDate || part.outboundDate || undefined,
        constructionDate: part.constructionDate || undefined,
        workerId: part.workerId || undefined,
        workerName: part.workerName || undefined,
        status: part.status || (part.outStockDate ? 'stock_out' : (part.inStockDate ? 'stock_in' : 'waiting_stock')),
        note: part.note || (originalQuantity > 1 ? `（${originalQuantity}台中 ${unitIndex}台目）` : '')
      });
    }
  });

  return expanded;
}

// ==========================================
// 1. 現場一覧取得 (GET /api/sites または /api/sites/)
// ==========================================
router.get(['/', '/sites'], async (req, res) => {
  try {
    const { status, workerId, siteCode, q } = req.query;
    const pool = await getPool();

    if (pool) {
      let query = `
        SELECT id, siteCode, siteName, egCount, customerName, address, orderNo, status,
               startDate, endDate, constructionDate, primaryWorkerId, primaryWorkerName,
               coWorkersJson, mainPartsJson, subPartsCacheJson, notes, commentsJson,
               attachmentsJson, drawingUrl, createdById, createdByName, createdAt, updatedAt
        FROM dbo.Sites
        WHERE 1=1
      `;
      const request = pool.request();

      if (status) {
        query += ` AND status = @status`;
        request.input('status', sql.NVarChar, status);
      }
      if (workerId) {
        query += ` AND (primaryWorkerId = @workerId OR coWorkersJson LIKE @workerPattern)`;
        request.input('workerId', sql.NVarChar, workerId);
        request.input('workerPattern', sql.NVarChar, `%"id":"${workerId}"%`);
      }
      if (siteCode) {
        query += ` AND siteCode = @siteCode`;
        request.input('siteCode', sql.NVarChar, siteCode);
      }
      if (q) {
        query += ` AND (siteCode LIKE @q OR siteName LIKE @q OR customerName LIKE @q)`;
        request.input('q', sql.NVarChar, `%${q}%`);
      }

      query += ` ORDER BY updatedAt DESC, createdAt DESC`;

      const result = await request.query(query);
      const sites = result.recordset.map(mapDbRowToSite);
      return res.json({ success: true, sites });
    }

    // --- Local JSON フォールバック ---
    let sites = loadSitesFile();
    if (status) {
      sites = sites.filter(s => s.status === status);
    }
    if (workerId) {
      sites = sites.filter(s => s.primaryWorkerId === workerId || (s.coWorkers && s.coWorkers.some(c => c.id === workerId)));
    }
    if (siteCode) {
      sites = sites.filter(s => s.siteCode === siteCode);
    }
    if (q) {
      const queryLower = String(q).toLowerCase();
      sites = sites.filter(s => 
        (s.siteCode && s.siteCode.toLowerCase().includes(queryLower)) ||
        (s.siteName && s.siteName.toLowerCase().includes(queryLower)) ||
        (s.customerName && s.customerName.toLowerCase().includes(queryLower))
      );
    }

    sites.sort((a, b) => new Date(b.updatedAt || 0).getTime() - new Date(a.updatedAt || 0).getTime());
    res.json({ success: true, sites });
  } catch (err) {
    console.error('[Sites API] Get sites error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// 外部在庫DBからのレスポンスを標準形式 (siteCode, siteName, partsなど) に正規化
function normalizeExternalItem(item) {
  if (!item || typeof item !== 'object') return item;

  // item.site が内包されている場合（?code=... のレスポンスなど）
  const siteObj = (item.site && typeof item.site === 'object') ? item.site : item;

  const siteCode = String(siteObj.code || siteObj.siteCode || item.code || item.siteCode || '').trim();
  const siteName = String(siteObj.name || siteObj.siteName || item.name || item.siteName || '').trim();
  const customerName = String(siteObj.client || siteObj.customerName || siteObj.customer || item.customerName || item.customer || '').trim();
  const address = String(siteObj.address || item.address || '').trim();
  let egCount = typeof siteObj.egCount === 'number' ? siteObj.egCount : (parseInt(siteObj.egCount, 10) || 0);
  if (!egCount && typeof item.egCount === 'number') egCount = item.egCount;
  if (!egCount && item.egCount) egCount = parseInt(item.egCount, 10) || 0;

  const period = String(siteObj.period || item.period || '').trim();

  // 工期テキストの分割 (例: "2026/10/10 ～ 2026/10/20")
  let scheduledStartDate = siteObj.scheduledStartDate || item.scheduledStartDate || '';
  let scheduledEndDate = siteObj.scheduledEndDate || item.scheduledEndDate || '';
  if (period && (!scheduledStartDate || !scheduledEndDate)) {
    const pParts = period.split(/[～~-]/);
    if (pParts[0]) scheduledStartDate = pParts[0].trim().replace(/\//g, '-');
    if (pParts[1]) scheduledEndDate = pParts[1].trim().replace(/\//g, '-');
  }

  // 部品データの正規化
  const rawParts = item.parts || siteObj.parts || [];
  const parts = Array.isArray(rawParts) ? rawParts.map(p => {
    const isMajor = p.category === 'major' || p.type === 'main' || p.isMain === true || (!p.type && p.category !== 'sub');
    return {
      type: isMajor ? 'main' : 'sub',
      isMain: isMajor,
      id: p.id || '',
      partCode: String(p.modelNumber || p.partCode || p.code || p.model || '').trim(),
      partName: String(p.name || p.partName || '').trim(),
      quantity: typeof p.quantity === 'number' ? p.quantity : (parseInt(p.count || p.qty || p.quantity || 1, 10) || 1),
      unit: p.unit || (isMajor ? '台' : '個'),
      inStockDate: p.inboundDate || p.inStockDate || p.nyukoDate || p.inDate || '',
      outStockDate: p.outboundDate || p.outStockDate || p.syukkoDate || p.outDate || '',
      note: p.note || p.bikou || p.stockStatus || ''
    };
  }) : [];

  // もし egCount が 0 の場合、主要部品の台数から自動算出
  const majorPartsCount = parts.filter(p => p.isMain).reduce((sum, p) => sum + (p.quantity || 1), 0);
  if (egCount <= 0 && majorPartsCount > 0) {
    egCount = majorPartsCount;
  }

  return {
    ...item,
    code: siteCode,
    siteCode: siteCode,
    name: siteName,
    siteName: siteName,
    customerName,
    address,
    egCount: egCount > 0 ? egCount : (majorPartsCount > 0 ? majorPartsCount : 1),
    period,
    scheduledStartDate,
    scheduledEndDate,
    parts
  };
}

// ==========================================
// 2. 外部在庫DB プロキシ検索 / 照会
// GET /api/sites/lookup/external?q=... または ?code=...
// ==========================================
router.get(['/lookup/external', '/sites/lookup/external', '/external/lookup'], async (req, res) => {
  try {
    const { q, code, limit } = req.query;
    const inventoryBaseUrl = process.env.INVENTORY_API_URL || 'https://sql.teranago.synology.me/api/genba';

    let targetUrl = inventoryBaseUrl;
    if (code) {
      targetUrl += `?code=${encodeURIComponent(code)}`;
    } else if (q) {
      targetUrl += `?q=${encodeURIComponent(q)}&limit=${encodeURIComponent(limit || 20)}`;
    } else {
      targetUrl += `?limit=${encodeURIComponent(limit || 20)}`;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);

    try {
      const response = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'Accept': 'application/json' }
      });
      clearTimeout(timeoutId);

      if (response.ok) {
        const rawJson = await response.json();
        if (Array.isArray(rawJson.data)) {
          return res.json({
            ...rawJson,
            data: rawJson.data.map(normalizeExternalItem)
          });
        } else if (rawJson.data && typeof rawJson.data === 'object') {
          return res.json({
            ...rawJson,
            data: normalizeExternalItem(rawJson.data)
          });
        } else if (Array.isArray(rawJson)) {
          return res.json({
            success: true,
            data: rawJson.map(normalizeExternalItem)
          });
        }
        return res.json(rawJson);
      } else {
        console.warn(`[Sites External] Remote returned status ${response.status}`);
      }
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      console.warn('[Sites External] Fetch failed, returning mock/fallback response:', fetchErr.message);
    }

    // 万が一外部コンテナに通信できない場合のテスト・フォールバック
    if (code) {
      return res.json({
        success: true,
        data: {
          code: code,
          siteCode: code,
          name: `${code} 現場（通信フォールバック）`,
          siteName: `${code} 現場（通信フォールバック）`,
          egCount: 2,
          customerName: '株式会社 寺岡建設',
          address: '愛知県名古屋市中区栄1-1',
          parts: [
            { type: 'main', partCode: 'DR-8000', partName: '自動ドア駆動装置', quantity: 2, unit: '台', inStockDate: '2026-10-10', outStockDate: '2026-10-12' },
            { type: 'sub', partCode: 'SEN-201', partName: '無目付センサ', quantity: 4, unit: '個', inStockDate: '2026-10-10', outStockDate: '2026-10-12' },
            { type: 'sub', partCode: 'OPT-KEY', partName: 'キースイッチ', quantity: 2, unit: '個', inStockDate: '2026-10-11', outStockDate: '2026-10-12' }
          ]
        }
      });
    }

    return res.json({
      success: true,
      count: 0,
      data: []
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});


// ==========================================
// 3. 現場詳細取得 (GET /api/sites/:id)
// ==========================================
router.get(['/:id', '/sites/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    if (pool) {
      const request = pool.request();
      request.input('id', sql.NVarChar, id);
      const result = await request.query(`SELECT * FROM dbo.Sites WHERE id = @id`);
      if (result.recordset.length === 0) {
        return res.status(404).json({ success: false, error: 'Site not found' });
      }
      return res.json({ success: true, site: mapDbRowToSite(result.recordset[0]) });
    }

    // Local JSON
    const sites = loadSitesFile();
    const site = sites.find(s => s.id === id);
    if (!site) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }
    res.json({ success: true, site });
  } catch (err) {
    console.error('[Sites API] Get site detail error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 4. 新規現場登録 (POST /api/sites)
// ==========================================
router.post(['/', '/sites'], async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.siteCode || !body.siteName) {
      return res.status(400).json({ success: false, error: 'siteCode と siteName は必須です' });
    }

    const nowIso = new Date().toISOString();
    const id = body.id || `site-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;

    const egCountNum = parseInt(body.egCount || '1', 10);

    // 主要部品の1台ずつ分割展開処理 (型番 2台 -> 1台×2台、および複数台現場の総数反映)
    let processedMainParts = [];
    if (Array.isArray(body.mainParts) && body.mainParts.length > 0) {
      const needsExpansion = body.mainParts.some(p => (parseInt(p.quantity, 10) || 1) > 1 || !p.originalQuantity || (egCountNum > 1 && p.originalQuantity === 1));
      processedMainParts = needsExpansion ? expandMainParts(body.mainParts, egCountNum) : body.mainParts;
    } else if (Array.isArray(body.rawParts)) {
      processedMainParts = expandMainParts(body.rawParts, egCountNum);
    }

    const newSite = {
      id,
      siteCode: String(body.siteCode).trim(),
      siteName: String(body.siteName).trim(),
      egCount: parseInt(body.egCount || '1', 10),
      customerName: body.customerName || '',
      address: body.address || '',
      orderNo: body.orderNo || '',
      status: body.status || 'not_started',
      startDate: body.startDate || null,
      endDate: body.endDate || null,
      constructionDate: body.constructionDate || null,
      primaryWorkerId: body.primaryWorkerId || null,
      primaryWorkerName: body.primaryWorkerName || null,
      coWorkers: Array.isArray(body.coWorkers) ? body.coWorkers : [],
      mainParts: processedMainParts,
      subPartsCache: Array.isArray(body.subPartsCache) ? body.subPartsCache : [],
      notes: body.notes || '',
      comments: Array.isArray(body.comments) ? body.comments : [],
      attachments: Array.isArray(body.attachments) ? body.attachments : [],
      drawingUrl: body.drawingUrl || null,
      createdById: body.createdById || null,
      createdByName: body.createdByName || null,
      createdAt: nowIso,
      updatedAt: nowIso
    };

    const pool = await getPool();
    if (pool) {
      const request = pool.request();
      request.input('id', sql.NVarChar, newSite.id);
      request.input('siteCode', sql.NVarChar, newSite.siteCode);
      request.input('siteName', sql.NVarChar, newSite.siteName);
      request.input('egCount', sql.Int, newSite.egCount);
      request.input('customerName', sql.NVarChar, newSite.customerName);
      request.input('address', sql.NVarChar, newSite.address);
      request.input('orderNo', sql.NVarChar, newSite.orderNo);
      request.input('status', sql.NVarChar, newSite.status);
      request.input('startDate', sql.Date, newSite.startDate ? new Date(newSite.startDate) : null);
      request.input('endDate', sql.Date, newSite.endDate ? new Date(newSite.endDate) : null);
      request.input('constructionDate', sql.Date, newSite.constructionDate ? new Date(newSite.constructionDate) : null);
      request.input('primaryWorkerId', sql.NVarChar, newSite.primaryWorkerId);
      request.input('primaryWorkerName', sql.NVarChar, newSite.primaryWorkerName);
      request.input('coWorkersJson', sql.NVarChar, JSON.stringify(newSite.coWorkers));
      request.input('mainPartsJson', sql.NVarChar, JSON.stringify(newSite.mainParts));
      request.input('subPartsCacheJson', sql.NVarChar, JSON.stringify(newSite.subPartsCache));
      request.input('notes', sql.NVarChar, newSite.notes);
      request.input('commentsJson', sql.NVarChar, JSON.stringify(newSite.comments));
      request.input('attachmentsJson', sql.NVarChar, JSON.stringify(newSite.attachments));
      request.input('drawingUrl', sql.NVarChar, newSite.drawingUrl);
      request.input('createdById', sql.NVarChar, newSite.createdById);
      request.input('createdByName', sql.NVarChar, newSite.createdByName);

      await request.query(`
        INSERT INTO dbo.Sites (
          id, siteCode, siteName, egCount, customerName, address, orderNo, status,
          startDate, endDate, constructionDate, primaryWorkerId, primaryWorkerName,
          coWorkersJson, mainPartsJson, subPartsCacheJson, notes, commentsJson,
          attachmentsJson, drawingUrl, createdById, createdByName, createdAt, updatedAt
        ) VALUES (
          @id, @siteCode, @siteName, @egCount, @customerName, @address, @orderNo, @status,
          @startDate, @endDate, @constructionDate, @primaryWorkerId, @primaryWorkerName,
          @coWorkersJson, @mainPartsJson, @subPartsCacheJson, @notes, @commentsJson,
          @attachmentsJson, @drawingUrl, @createdById, @createdByName, GETDATE(), GETDATE()
        )
      `);
    }

    // Local JSON 同期
    const sites = loadSitesFile();
    sites.unshift(newSite);
    saveSitesFile(sites);

    res.json({ success: true, site: newSite });
  } catch (err) {
    console.error('[Sites API] Create site error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 5. 現場情報更新 (PUT /api/sites/:id)
// ==========================================
router.put(['/:id', '/sites/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const body = req.body || {};
    const nowIso = new Date().toISOString();

    const pool = await getPool();
    let currentSite = null;

    if (pool) {
      const getReq = pool.request();
      getReq.input('id', sql.NVarChar, id);
      const cur = await getReq.query('SELECT * FROM dbo.Sites WHERE id = @id');
      if (cur.recordset.length > 0) {
        currentSite = mapDbRowToSite(cur.recordset[0]);
      }
    }

    if (!currentSite) {
      const sites = loadSitesFile();
      currentSite = sites.find(s => s.id === id);
    }

    if (!currentSite) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    const targetEgCount = body.egCount !== undefined ? parseInt(body.egCount, 10) : currentSite.egCount;
    let targetMainParts = body.mainParts !== undefined ? body.mainParts : currentSite.mainParts;
    if (Array.isArray(targetMainParts) && targetMainParts.length > 0) {
      const needsExpansion = targetMainParts.some(p => (parseInt(p.quantity, 10) || 1) > 1 || !p.originalQuantity || (targetEgCount > 1 && p.originalQuantity === 1));
      if (needsExpansion) {
        targetMainParts = expandMainParts(targetMainParts, targetEgCount);
      }
    }

    const updatedSite = {
      ...currentSite,
      siteCode: body.siteCode !== undefined ? String(body.siteCode).trim() : currentSite.siteCode,
      siteName: body.siteName !== undefined ? String(body.siteName).trim() : currentSite.siteName,
      egCount: targetEgCount,
      customerName: body.customerName !== undefined ? body.customerName : currentSite.customerName,
      address: body.address !== undefined ? body.address : currentSite.address,
      orderNo: body.orderNo !== undefined ? body.orderNo : currentSite.orderNo,
      status: body.status !== undefined ? body.status : currentSite.status,
      startDate: body.startDate !== undefined ? body.startDate : currentSite.startDate,
      endDate: body.endDate !== undefined ? body.endDate : currentSite.endDate,
      constructionDate: body.constructionDate !== undefined ? body.constructionDate : currentSite.constructionDate,
      primaryWorkerId: body.primaryWorkerId !== undefined ? body.primaryWorkerId : currentSite.primaryWorkerId,
      primaryWorkerName: body.primaryWorkerName !== undefined ? body.primaryWorkerName : currentSite.primaryWorkerName,
      coWorkers: body.coWorkers !== undefined ? body.coWorkers : currentSite.coWorkers,
      mainParts: targetMainParts,
      subPartsCache: body.subPartsCache !== undefined ? body.subPartsCache : currentSite.subPartsCache,
      notes: body.notes !== undefined ? body.notes : currentSite.notes,
      comments: body.comments !== undefined ? body.comments : currentSite.comments,
      attachments: body.attachments !== undefined ? body.attachments : currentSite.attachments,
      drawingUrl: body.drawingUrl !== undefined ? body.drawingUrl : currentSite.drawingUrl,
      updatedAt: nowIso
    };

    if (pool) {
      const updateReq = pool.request();
      updateReq.input('id', sql.NVarChar, id);
      updateReq.input('siteCode', sql.NVarChar, updatedSite.siteCode);
      updateReq.input('siteName', sql.NVarChar, updatedSite.siteName);
      updateReq.input('egCount', sql.Int, updatedSite.egCount);
      updateReq.input('customerName', sql.NVarChar, updatedSite.customerName);
      updateReq.input('address', sql.NVarChar, updatedSite.address);
      updateReq.input('orderNo', sql.NVarChar, updatedSite.orderNo);
      updateReq.input('status', sql.NVarChar, updatedSite.status);
      updateReq.input('startDate', sql.Date, updatedSite.startDate ? new Date(updatedSite.startDate) : null);
      updateReq.input('endDate', sql.Date, updatedSite.endDate ? new Date(updatedSite.endDate) : null);
      updateReq.input('constructionDate', sql.Date, updatedSite.constructionDate ? new Date(updatedSite.constructionDate) : null);
      updateReq.input('primaryWorkerId', sql.NVarChar, updatedSite.primaryWorkerId);
      updateReq.input('primaryWorkerName', sql.NVarChar, updatedSite.primaryWorkerName);
      updateReq.input('coWorkersJson', sql.NVarChar, JSON.stringify(updatedSite.coWorkers));
      updateReq.input('mainPartsJson', sql.NVarChar, JSON.stringify(updatedSite.mainParts));
      updateReq.input('subPartsCacheJson', sql.NVarChar, JSON.stringify(updatedSite.subPartsCache));
      updateReq.input('notes', sql.NVarChar, updatedSite.notes);
      updateReq.input('commentsJson', sql.NVarChar, JSON.stringify(updatedSite.comments));
      updateReq.input('attachmentsJson', sql.NVarChar, JSON.stringify(updatedSite.attachments));
      updateReq.input('drawingUrl', sql.NVarChar, updatedSite.drawingUrl);

      await updateReq.query(`
        UPDATE dbo.Sites SET
          siteCode = @siteCode,
          siteName = @siteName,
          egCount = @egCount,
          customerName = @customerName,
          address = @address,
          orderNo = @orderNo,
          status = @status,
          startDate = @startDate,
          endDate = @endDate,
          constructionDate = @constructionDate,
          primaryWorkerId = @primaryWorkerId,
          primaryWorkerName = @primaryWorkerName,
          coWorkersJson = @coWorkersJson,
          mainPartsJson = @mainPartsJson,
          subPartsCacheJson = @subPartsCacheJson,
          notes = @notes,
          commentsJson = @commentsJson,
          attachmentsJson = @attachmentsJson,
          drawingUrl = @drawingUrl,
          updatedAt = GETDATE()
        WHERE id = @id
      `);
    }

    // Local JSON 更新
    const allSites = loadSitesFile();
    const idx = allSites.findIndex(s => s.id === id);
    if (idx >= 0) {
      allSites[idx] = updatedSite;
    } else {
      allSites.push(updatedSite);
    }
    saveSitesFile(allSites);

    res.json({ success: true, site: updatedSite });
  } catch (err) {
    console.error('[Sites API] Update site error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 6. 現場コメント・申し送り追加 (POST /api/sites/:id/comments)
// ==========================================
router.post(['/:id/comments', '/sites/:id/comments'], async (req, res) => {
  try {
    const { id } = req.params;
    const { content, user } = req.body || {};
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'コメント内容は必須です' });
    }

    const newComment = {
      id: `sc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      userId: user?.id || 'unknown',
      userName: user?.name || '匿名',
      userAvatar: user?.avatarUrl || '',
      content: content.trim(),
      createdAt: new Date().toISOString()
    };

    const allSites = loadSitesFile();
    const target = allSites.find(s => s.id === id);
    if (!target) {
      return res.status(404).json({ success: false, error: 'Site not found' });
    }

    if (!Array.isArray(target.comments)) target.comments = [];
    target.comments.push(newComment);
    target.updatedAt = new Date().toISOString();
    saveSitesFile(allSites);

    const pool = await getPool();
    if (pool) {
      const reqSql = pool.request();
      reqSql.input('id', sql.NVarChar, id);
      reqSql.input('commentsJson', sql.NVarChar, JSON.stringify(target.comments));
      await reqSql.query('UPDATE dbo.Sites SET commentsJson = @commentsJson, updatedAt = GETDATE() WHERE id = @id');
    }

    res.json({ success: true, comment: newComment, comments: target.comments });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ==========================================
// 7. 現場削除 (DELETE /api/sites/:id)
// ==========================================
router.delete(['/:id', '/sites/:id'], async (req, res) => {
  try {
    const { id } = req.params;
    const pool = await getPool();

    if (pool) {
      const delReq = pool.request();
      delReq.input('id', sql.NVarChar, id);
      await delReq.query('DELETE FROM dbo.Sites WHERE id = @id');
    }

    const allSites = loadSitesFile();
    const filtered = allSites.filter(s => s.id !== id);
    saveSitesFile(filtered);

    res.json({ success: true, message: 'Site deleted successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
