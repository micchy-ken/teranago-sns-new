import { PartStatus, Site, SiteMainPart, SiteStatus, SiteSubPart } from '../types/site';

/**
 * 主要部品の建具番号（例: "AD1", "W-1", "SD-1", "1" 等）を解決するユーティリティ
 */
export function getFittingLabel(
  part: Partial<SiteMainPart> & { tateguNo?: string; 建具番号?: string },
  idx: number,
  _totalEgCount: number = 1
): string {
  // ① 建具番号 (fittingNo / tateguNo / 建具番号) が存在する場合は最優先でそのまま表示 (例: "AD1")
  const rawFitting = part.fittingNo || part.tateguNo || part.建具番号;
  if (rawFitting && String(rawFitting).trim()) {
    return String(rawFitting).trim();
  }
  // ② 機番 (serialNo) に建具情報がある場合
  if (part.serialNo && part.serialNo.trim()) {
    return part.serialNo.trim();
  }
  // ③ 備考欄からの明示的な建具番号抽出 (例: "建具: AD1", "建具番号: AD1")
  const noteStr = part.note || '';
  const explicitMatch = noteStr.match(/建具(?:番号|符号)?\s*[:：]\s*([A-Za-z0-9_-]+)/);
  if (explicitMatch && explicitMatch[1]) {
    return explicitMatch[1].trim();
  }

  // ★重要: 「CN-15T」などの機種名・型番を誤って建具番号と誤認しないこと！
  // 括弧内の明示的な表記 (例: "(AD1)" や "(1号機)") のみ対象とし、モデル番号キーワードは除外
  const pName = part.partName || '';
  const parenMatch = (pName + ' ' + noteStr).match(/[(（]\s*([A-Za-z0-9_-]+)\s*[)）]/);
  if (parenMatch && parenMatch[1]) {
    const candidate = parenMatch[1].trim();
    // 機種名・型番キーワードや一般的な記号を除外
    if (!/^(?:CN|KL|BL|DR|SEN|OPT|SET|SUS|ST|L=|\d+m|\d+mm)/i.test(candidate)) {
      return candidate;
    }
  }

  // ④ フォールバック: unitIndex または idx + 1
  const uIdx = part.unitIndex || (idx + 1);
  return String(uIdx);
}

/**
 * 品名から末尾の (AD1) や (1号機) 等の建具重複表記を除去して綺麗に表示
 */
export function cleanPartName(name: string = ''): string {
  if (!name) return '';
  return name.replace(/\s*[(（]\s*(?:\d+\s*(?:号機|台目)|[A-Za-z0-9_-]+)\s*[)）]\s*$/g, '').trim() || name;
}

/**
 * 外部在庫DBや日付文字列を YYYY-MM-DD 形式へ正規化
 */
export function normalizeExternalDate(raw?: string | null): string {
  if (!raw) return '';
  const s = String(raw).trim();
  if (!s || s === '未定' || s === '-' || s.toLowerCase() === 'null' || s.toLowerCase() === 'undefined') {
    return '';
  }
  const slashNorm = s.replace(/\//g, '-');
  const m = slashNorm.match(/(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (!m) return '';
  return `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}`;
}

const PART_STATUS_RANK: Record<PartStatus, number> = {
  waiting_stock: 0,
  stock_in: 1,
  stock_out: 2,
  constructed: 3,
  inspected: 4,
};

export function deriveInventoryPartStatus(inStockDate?: string, outStockDate?: string): PartStatus {
  const outD = normalizeExternalDate(outStockDate);
  if (outD) return 'stock_out';
  const inD = normalizeExternalDate(inStockDate);
  if (inD) return 'stock_in';
  return 'waiting_stock';
}

export interface ExpandedExternalSiteData {
  isFallback: boolean;
  siteCode: string;
  siteName: string;
  customerName: string;
  address: string;
  orderNo: string;
  egCount: number;
  startDate: string;
  endDate: string;
  drawingUrl: string;
  mainParts: SiteMainPart[];
  subParts: SiteSubPart[];
}

/**
 * 外部在庫DBの現場取得レスポンス（詳細・部品一覧）を標準構造に展開
 */
export function expandExternalSitePayload(
  detailData: any,
  options?: {
    primaryWorkerId?: string;
    primaryWorkerName?: string;
    defaultConstructionDate?: string;
  }
): ExpandedExternalSiteData {
  const siteObj =
    detailData?.site && typeof detailData.site === 'object' ? detailData.site : detailData || {};

  const finalCode = String(siteObj.code || siteObj.siteCode || detailData?.code || detailData?.siteCode || '').trim();
  const finalName = String(siteObj.name || siteObj.siteName || detailData?.name || detailData?.siteName || '').trim();
  const isFallback = Boolean(
    detailData?.isFallback ||
      siteObj?.isFallback ||
      finalName.includes('通信フォールバック')
  );
  const finalCustomer = String(
    siteObj.customerName || siteObj.client || siteObj.customer || detailData?.customerName || detailData?.customer || ''
  ).trim();
  const finalAddress = String(siteObj.address || detailData?.address || '').trim();
  const finalOrderNo = String(
    siteObj.drawingNo || siteObj.orderNo || detailData?.drawingNo || detailData?.orderNo || ''
  ).trim();
  const finalPeriod = String(siteObj.period || detailData?.period || '').trim();

  let sDate = normalizeExternalDate(siteObj.scheduledStartDate || detailData?.scheduledStartDate || '');
  let eDate = normalizeExternalDate(siteObj.scheduledEndDate || detailData?.scheduledEndDate || '');
  if (finalPeriod && (!sDate || !eDate)) {
    const pParts = finalPeriod.split(/[～~-]/);
    if (pParts[0] && !sDate) sDate = normalizeExternalDate(pParts[0]);
    if (pParts[1] && !eDate) eDate = normalizeExternalDate(pParts[1]);
  }

  const rawParts = Array.isArray(detailData?.parts)
    ? detailData.parts
    : Array.isArray(siteObj?.parts)
      ? siteObj.parts
      : [];

  const majorParts = rawParts.filter(
    (p: any) => p.category === 'major' || p.type === 'main' || p.isMain === true || (!p.type && p.category !== 'sub')
  );
  const totalMajorUnits = majorParts.reduce(
    (sum: number, p: any) => sum + Math.max(1, parseInt(String(p.quantity || p.count || p.qty || 1), 10) || 1),
    0
  );

  let finalEgCount =
    typeof siteObj.egCount === 'number'
      ? siteObj.egCount
      : parseInt(String(siteObj.egCount || detailData?.egCount || '0'), 10) || 0;
  if (finalEgCount <= 0) {
    finalEgCount = totalMajorUnits > 0 ? totalMajorUnits : 1;
  }

  const totalUnits = Math.max(finalEgCount, totalMajorUnits);
  const expandedMains: SiteMainPart[] = [];
  const subs: SiteSubPart[] = [];
  let globalMainIdx = 0;

  rawParts.forEach((p: any, idx: number) => {
    const isMain = p.category === 'major' || p.type === 'main' || p.isMain === true || (!p.type && p.category !== 'sub');
    const qty = Math.max(1, parseInt(String(p.quantity || p.count || p.qty || 1), 10) || 1);
    const inDate = normalizeExternalDate(p.inboundDate || p.inStockDate || p.nyukoDate || p.inDate || p.入庫日 || '');
    const outDate = normalizeExternalDate(p.outboundDate || p.outStockDate || p.syukkoDate || p.outDate || p.出庫日 || '');

    if (isMain) {
      const pFittingNo = String(
        p.fittingNo || p.建具番号 || p.tateguNo || p.tategu_no || p.tategu || p.建具符号 || p.fitting_no || p.fitting || ''
      ).trim();
      const pPartSpec = String(p.partSpec || p.modelNumber || p.部品規格 || '').trim();
      const pCode = String(
        p.partCode || p.modelNumber || p.code || p.model || pPartSpec || p.部品手配コード || ''
      ).trim();
      const pName = String(p.partName || p.name || p.品名 || '主要部品').trim();
      const noteStr = p.note || p.bikou || p.stockStatus || '';
      const machineMatch = (pName + ' ' + noteStr).match(/[(（]?(\d+)\s*(?:号機|台目|号)[)）]?/);
      const detectedUnitIndex = machineMatch ? parseInt(machineMatch[1], 10) : null;

      for (let i = 1; i <= qty; i++) {
        globalMainIdx++;
        const unitIndex =
          qty === 1 && detectedUnitIndex
            ? detectedUnitIndex
            : qty > 1
              ? i
              : totalUnits > 1
                ? globalMainIdx
                : 1;
        const originalQuantity = totalUnits > 1 ? totalUnits : Math.max(qty, 1);

        expandedMains.push({
          id: p.id ? `${p.id}-${i}` : `part-${Date.now()}-${idx}-${i}`,
          partCode: pCode,
          partName: pName,
          fittingNo: pFittingNo || undefined,
          partSpec: pPartSpec || pCode || undefined,
          originalQuantity,
          unitIndex,
          quantity: 1,
          unit: p.unit || '台',
          inStockDate: inDate || undefined,
          outStockDate: outDate || undefined,
          constructionDate: options?.defaultConstructionDate || sDate || undefined,
          workerId: options?.primaryWorkerId,
          workerName: options?.primaryWorkerName,
          status: deriveInventoryPartStatus(inDate, outDate),
          note: noteStr || (pFittingNo ? `建具: ${pFittingNo}` : ''),
        });
      }
    } else {
      const pCode = String(p.partCode || p.modelNumber || p.code || p.model || '').trim();
      const pName = String(p.partName || p.name || '付属部品').trim();
      subs.push({
        id: p.id ? String(p.id) : `sub-live-${idx}`,
        partCode: pCode,
        partName: pName,
        quantity: qty,
        unit: p.unit || '個',
        inStockDate: inDate || undefined,
        outStockDate: outDate || undefined,
        note: p.note || p.bikou || p.stockStatus || '',
      });
    }
  });

  return {
    isFallback,
    siteCode: finalCode,
    siteName: finalName,
    customerName: finalCustomer,
    address: finalAddress,
    orderNo: finalOrderNo,
    egCount: finalEgCount,
    startDate: sDate,
    endDate: eDate,
    drawingUrl: String(detailData?.drawingUrl || siteObj?.drawingUrl || '').trim(),
    mainParts: expandedMains,
    subParts: subs,
  };
}

export interface InventorySyncResult {
  isFallback: boolean;
  hasChanges: boolean;
  updatedSite: Site;
  subParts: SiteSubPart[];
  changedMainDatesCount: number;
  changedMainStatusesCount: number;
  changedMainMetaCount: number;
  importedMainPartsCount: number;
  addedMainPartsCount: number;
  replacedMainPartsCount: number;
  changedSubPartsCount: number;
  expandedMainPartsCount: number;
  expandedSubPartsCount: number;
  summaryMessage: string;
}

/**
 * 既存現場データと外部在庫DB取得結果を照合し、
 * 未取込部品の展開・増設部品の自動追加・コード変更時の全置換・入庫日/出庫日/ステータス/建具番号/EG台数の更新を行う
 */
export function mergeInventorySyncWithSite(
  currentSite: Site,
  externalRawData: any,
  options?: {
    siteCodeOverride?: string;
    forceReplaceEmptyParts?: boolean;
    replaceExistingMainParts?: boolean;
  }
): InventorySyncResult {
  const expanded = expandExternalSitePayload(externalRawData, {
    primaryWorkerId: currentSite.primaryWorkerId,
    primaryWorkerName: currentSite.primaryWorkerName,
    defaultConstructionDate: currentSite.constructionDate || currentSite.startDate || '',
  });

  if (expanded.isFallback) {
    return {
      isFallback: true,
      hasChanges: false,
      updatedSite: currentSite,
      subParts: currentSite.subPartsCache || [],
      changedMainDatesCount: 0,
      changedMainStatusesCount: 0,
      changedMainMetaCount: 0,
      importedMainPartsCount: 0,
      addedMainPartsCount: 0,
      replacedMainPartsCount: 0,
      changedSubPartsCount: 0,
      expandedMainPartsCount: 0,
      expandedSubPartsCount: 0,
      summaryMessage: '',
    };
  }

  let hasChanges = false;
  let changedMainDatesCount = 0;
  let changedMainStatusesCount = 0;
  let changedMainMetaCount = 0;
  let importedMainPartsCount = 0;
  let addedMainPartsCount = 0;
  let replacedMainPartsCount = 0;
  let changedSubPartsCount = 0;

  const targetSiteCode = (options?.siteCodeOverride || expanded.siteCode || currentSite.siteCode || '').trim();
  const siteLevelUpdates: Partial<Site> = {};

  if (targetSiteCode && targetSiteCode !== (currentSite.siteCode || '').trim()) {
    siteLevelUpdates.siteCode = targetSiteCode;
    hasChanges = true;
  }
  if (!currentSite.customerName && expanded.customerName) {
    siteLevelUpdates.customerName = expanded.customerName;
    hasChanges = true;
  }
  if (!currentSite.address && expanded.address) {
    siteLevelUpdates.address = expanded.address;
    hasChanges = true;
  }
  if (!currentSite.orderNo && expanded.orderNo) {
    siteLevelUpdates.orderNo = expanded.orderNo;
    hasChanges = true;
  }
  if (!currentSite.startDate && expanded.startDate) {
    siteLevelUpdates.startDate = expanded.startDate;
    hasChanges = true;
  }
  if (!currentSite.endDate && expanded.endDate) {
    siteLevelUpdates.endDate = expanded.endDate;
    hasChanges = true;
  }
  if (!currentSite.constructionDate && expanded.startDate) {
    siteLevelUpdates.constructionDate = expanded.startDate;
    hasChanges = true;
  }

  let nextMainParts: SiteMainPart[] = currentSite.mainParts || [];

  if (options?.replaceExistingMainParts && expanded.mainParts.length > 0) {
    // 現場コードの入力し直し（変更）による主要部品の完全差し替え
    nextMainParts = expanded.mainParts;
    replacedMainPartsCount = nextMainParts.length;
    siteLevelUpdates.egCount = Math.max(expanded.egCount, nextMainParts.length, 1);
    hasChanges = true;
  } else if (nextMainParts.length === 0 && expanded.mainParts.length > 0) {
    // 現場名・図面番号等で先行登録されていた現場へ、後から在庫情報を初回取り込み
    nextMainParts = expanded.mainParts;
    importedMainPartsCount = nextMainParts.length;
    siteLevelUpdates.egCount = Math.max(expanded.egCount, nextMainParts.length, 1);
    hasChanges = true;
  } else if (nextMainParts.length > 0 && expanded.mainParts.length > 0) {
    const usedLiveIndices = new Set<number>();

    const findMatchingLivePart = (mp: SiteMainPart, idx: number): SiteMainPart | undefined => {
      // 1. ID 一致
      const byId = expanded.mainParts.findIndex((lp, i) => !usedLiveIndices.has(i) && lp.id && lp.id === mp.id);
      if (byId >= 0) {
        usedLiveIndices.add(byId);
        return expanded.mainParts[byId];
      }
      // 2. 建具番号 (fittingNo) 一致
      if (mp.fittingNo && mp.fittingNo.trim()) {
        const mpFit = mp.fittingNo.trim();
        const byFit = expanded.mainParts.findIndex(
          (lp, i) => !usedLiveIndices.has(i) && lp.fittingNo && lp.fittingNo.trim() === mpFit
        );
        if (byFit >= 0) {
          usedLiveIndices.add(byFit);
          return expanded.mainParts[byFit];
        }
      }
      // 3. 型番・部品規格 (partCode / partSpec) 一致
      const mpCode = (mp.partCode || mp.partSpec || '').trim();
      if (mpCode) {
        const byCode = expanded.mainParts.findIndex(
          (lp, i) =>
            !usedLiveIndices.has(i) &&
            ((lp.partCode && lp.partCode.trim() === mpCode) || (lp.partSpec && lp.partSpec.trim() === mpCode))
        );
        if (byCode >= 0) {
          usedLiveIndices.add(byCode);
          return expanded.mainParts[byCode];
        }
      }
      // 4. 配列インデックス一致
      if (!usedLiveIndices.has(idx) && expanded.mainParts[idx]) {
        usedLiveIndices.add(idx);
        return expanded.mainParts[idx];
      }
      return undefined;
    };

    nextMainParts = nextMainParts.map((mp, idx) => {
      const live = findMatchingLivePart(mp, idx);
      if (!live) return mp;

      const changes: Partial<SiteMainPart> = {};

      // 型番・品名・建具番号・部品規格の同期
      if (!mp.partCode && live.partCode) {
        changes.partCode = live.partCode;
        changedMainMetaCount++;
      }
      if (!mp.partName && live.partName) {
        changes.partName = live.partName;
        changedMainMetaCount++;
      }
      if (live.fittingNo && (!mp.fittingNo || mp.fittingNo !== live.fittingNo)) {
        changes.fittingNo = live.fittingNo;
        changedMainMetaCount++;
      }
      if (live.partSpec && (!mp.partSpec || mp.partSpec !== live.partSpec)) {
        changes.partSpec = live.partSpec;
        changedMainMetaCount++;
      }

      // 入庫日・出庫日の監視＆更新
      const curInDate = normalizeExternalDate(mp.inStockDate);
      const liveInDate = normalizeExternalDate(live.inStockDate);
      const curOutDate = normalizeExternalDate(mp.outStockDate);
      const liveOutDate = normalizeExternalDate(live.outStockDate);

      let dateUpdated = false;
      if (liveInDate && liveInDate !== curInDate) {
        changes.inStockDate = liveInDate;
        dateUpdated = true;
      }
      if (liveOutDate && liveOutDate !== curOutDate) {
        changes.outStockDate = liveOutDate;
        dateUpdated = true;
      }
      if (dateUpdated) {
        changedMainDatesCount++;
      }

      // ステータスの自動更新（施工済 / 自主検査済は後退させない）
      const effInDate = changes.inStockDate ?? curInDate;
      const effOutDate = changes.outStockDate ?? curOutDate;
      const impliedStatus = deriveInventoryPartStatus(effInDate, effOutDate);

      if (mp.status !== 'constructed' && mp.status !== 'inspected') {
        if (PART_STATUS_RANK[impliedStatus] > PART_STATUS_RANK[mp.status]) {
          changes.status = impliedStatus;
          changedMainStatusesCount++;
        }
      }

      if (Object.keys(changes).length > 0) {
        hasChanges = true;
        return { ...mp, ...changes };
      }
      return mp;
    });

    // 在庫DB側に存在し、既存部品と未マッチの追加部品（2台目以降など）を末尾に自動追加
    const unmatchedLives = expanded.mainParts.filter((_, i) => !usedLiveIndices.has(i));
    if (unmatchedLives.length > 0) {
      const existingIds = new Set(nextMainParts.map((p) => p.id));
      const appended = unmatchedLives.map((lp, offset) => {
        const safeId =
          lp.id && !existingIds.has(lp.id)
            ? lp.id
            : `part-sync-${Date.now()}-${nextMainParts.length + offset + 1}`;
        existingIds.add(safeId);
        return {
          ...lp,
          id: safeId,
        };
      });
      nextMainParts = [...nextMainParts, ...appended];
      addedMainPartsCount = appended.length;
      hasChanges = true;
    }

    // EG台数および各部品の総台数 (originalQuantity)・号機 (unitIndex) を最新台数に同期
    const targetEgCount = Math.max(expanded.egCount, nextMainParts.length, 1);
    if (targetEgCount > (currentSite.egCount || 0)) {
      siteLevelUpdates.egCount = targetEgCount;
      hasChanges = true;
    }
    if (
      addedMainPartsCount > 0 ||
      nextMainParts.some((p) => !p.originalQuantity || p.originalQuantity < targetEgCount)
    ) {
      nextMainParts = nextMainParts.map((p, idx) => ({
        ...p,
        unitIndex: p.unitIndex || idx + 1,
        originalQuantity: Math.max(p.originalQuantity || 1, targetEgCount),
      }));
      hasChanges = true;
    }
  }

  // 付属部品の入庫日・出庫日・数量変化を検知してキャッシュも更新
  const prevSubCache = currentSite.subPartsCache || [];
  const toSubSig = (arr: SiteSubPart[]) =>
    arr
      .map(
        (s) =>
          `${s.partCode}|${s.partName}|${s.quantity}|${normalizeExternalDate(s.inStockDate)}|${normalizeExternalDate(s.outStockDate)}`
      )
      .join('||');

  const hasSubChanges = options?.replaceExistingMainParts
    ? toSubSig(expanded.subParts) !== toSubSig(prevSubCache)
    : expanded.subParts.length > 0 && toSubSig(expanded.subParts) !== toSubSig(prevSubCache);

  if (hasSubChanges) {
    // 何件の付属部品に日付・構成変更があったか算出
    const prevMap = new Map(prevSubCache.map((s) => [`${s.partCode}|${s.partName}`, s]));
    let diffCount = 0;
    for (const ns of expanded.subParts) {
      const old = prevMap.get(`${ns.partCode}|${ns.partName}`);
      if (
        !old ||
        normalizeExternalDate(old.inStockDate) !== normalizeExternalDate(ns.inStockDate) ||
        normalizeExternalDate(old.outStockDate) !== normalizeExternalDate(ns.outStockDate) ||
        old.quantity !== ns.quantity
      ) {
        diffCount++;
      }
    }
    changedSubPartsCount = expanded.subParts.length > 0 ? Math.max(diffCount, 1) : prevSubCache.length;
    siteLevelUpdates.subPartsCache = expanded.subParts;
    hasChanges = true;
  }

  // 部品ステータスが waiting_stock より進んだ場合、未着手 → 進行中へ同期
  let nextSiteStatus: SiteStatus = currentSite.status;
  if (
    currentSite.status === 'not_started' &&
    nextMainParts.length > 0 &&
    nextMainParts.some((p) => p.status !== 'waiting_stock')
  ) {
    nextSiteStatus = 'in_progress';
    hasChanges = true;
  }

  const updatedSite: Site = hasChanges
    ? {
        ...currentSite,
        ...siteLevelUpdates,
        mainParts: nextMainParts,
        status: nextSiteStatus,
      }
    : currentSite;

  const summaryParts: string[] = [];
  if (replacedMainPartsCount > 0) {
    summaryParts.push(`主要部品を新コードの ${replacedMainPartsCount}台 に置き換え`);
  }
  if (importedMainPartsCount > 0) {
    summaryParts.push(`主要部品 ${importedMainPartsCount}台を取り込み`);
  }
  if (addedMainPartsCount > 0) {
    summaryParts.push(`主要部品 ${addedMainPartsCount}台を追加（計 ${nextMainParts.length}台）`);
  }
  if (changedMainDatesCount > 0 || changedMainStatusesCount > 0) {
    summaryParts.push(
      `主要部品の入出庫・進捗を更新 (${Math.max(changedMainDatesCount, changedMainStatusesCount)}台)`
    );
  }
  if (changedSubPartsCount > 0) {
    summaryParts.push(`付属部品の入出庫情報を更新 (${expanded.subParts.length}件)`);
  }
  if (summaryParts.length === 0 && changedMainMetaCount > 0) {
    summaryParts.push(`建具番号・型番を同期 (${changedMainMetaCount}件)`);
  }

  return {
    isFallback: false,
    hasChanges,
    updatedSite,
    subParts: options?.replaceExistingMainParts
      ? expanded.subParts
      : expanded.subParts.length > 0
        ? expanded.subParts
        : prevSubCache,
    changedMainDatesCount,
    changedMainStatusesCount,
    changedMainMetaCount,
    importedMainPartsCount,
    addedMainPartsCount,
    replacedMainPartsCount,
    changedSubPartsCount,
    expandedMainPartsCount: expanded.mainParts.length,
    expandedSubPartsCount: expanded.subParts.length,
    summaryMessage: summaryParts.join(' / '),
  };
}
