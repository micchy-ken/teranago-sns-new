import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  Users,
  Building2,
  RefreshCw,
  Check,
  Settings2
} from 'lucide-react';
import {
  AssetCategory,
  AssetFieldDefinition,
  AssetItem,
  AssetStatus,
  DivisionMaster,
  OfficeMaster,
  User
} from '../../types';
import {
  buildAlignedPcCategoryFields,
  cleanNotionLinkText,
  formatAssetDateJa,
  inferOfficeFromText,
  matchUserByCsvName,
  parseCsvMatrix,
  parseFlexibleCsvDate,
  readCsvFileAsText
} from '../../utils/assets';
import {
  getUserDivision,
  getUserOffice,
  resolveDivision,
  resolveOffice
} from '../../utils/masterResolver';
import { sortUsersByDivision } from '../../utils/userSort';

interface AssetCsvImportModalProps {
  isOpen: boolean;
  onClose: () => void;
  categories: AssetCategory[];
  defaultCategoryId?: string;
  existingAssets: AssetItem[];
  users: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  onImportAsset: (payload: Partial<AssetItem> & { id?: string }) => Promise<AssetItem>;
  onSaveCategory?: (data: Partial<AssetCategory> & { id?: string }) => Promise<void>;
  onComplete?: () => void;
}

type DuplicatePolicy = 'skip' | 'overwrite' | 'create';

interface ParsedCsvRowPreview {
  rowIndex: number;
  selected: boolean;
  assetCode: string;
  name: string;
  rawAssigneeName: string;
  assigneeMode: 'user' | 'shared' | 'unassigned';
  assigneeUserId: string;
  matchedAuto: boolean;
  officeId: string;
  officeName: string;
  divisionId: string;
  divisionName: string;
  status: AssetStatus;
  attributes: Record<string, any>;
  notes: string;
  existingMatch?: AssetItem;
}

// Notion等のヘッダー名と動的フィールドキーの対応辞書
const FIELD_HEADER_ALIASES: Record<string, string[]> = {
  vehicleModel: ['車種', '車名'],
  fuelType: ['油種', '燃料'],
  inspectionVendor: ['点検', '点検先', '点検業者', '整備工場'],
  nextInspectionDate: ['点検予定', '次回点検予定', '次回点検日'],
  inspectionType: ['点検内容', '点検種別'],
  lastInspectionDate: ['最終', '最終点検日', '前回点検日'],
  etcCardNumber: ['ETCカード', 'ETC', 'ETC番号'],
  deliveryDate: ['納車', '納車日'],
  shakenExpiryDate: ['車検満期', '車検満了', '車検期限'],
  leaseEndDate: ['リース満了', 'リース満了日', 'リース満了・入替目安'],
  mileage: ['走行距離', '距離'],
  tireType: ['タイヤ種別', 'タイヤ'],
  insuranceInfo: ['リース・保険会社', 'リース会社', '保険会社'],
  makerModel: ['メーカー・型番', 'メーカー・機種', '型番', '機種名', '機種'],
  serialNo: ['シリアルNo', 'シリアル', '製造番号'],
  os: ['OS'],
  deviceType: ['タイプ', 'PCタイプ'],
  officeLicense: ['Officeライセンス', 'Office', 'オフィスライセンス'],
  cpuMemory: ['CPU / メモリ', 'CPU/メモリ', 'スペック', 'メモリ'],
  storage: ['ストレージ', 'HDD', 'SSD', 'HDD / SSD'],
  assignedDate: ['支給・導入日', '支給日', '導入日'],
  msAccount: ['MSアカウント', 'Microsoftアカウント'],
  msPassword: ['MSパスワード', 'Microsoftパスワード'],
  confirmedDate: ['確認日', '最終確認日'],
  eset: ['eset', 'ESET', 'ウイルス対策'],
  nextCheckDate: ['定期点検予定'],
  toolType: ['種別', '工具種別'],
  calibrationRequired: ['校正対象'],
  nextCalibrationDate: ['点検・校正予定', '校正予定'],
  lastCalibrationDate: ['前回点検・校正日', '前回校正日'],
  storageLocation: ['保管場所・車載先', '保管場所'],
  purchaseDate: ['購入日'],
  equipmentType: ['機器種別'],
  locationDetail: ['設置場所'],
  ipAddress: ['IP / 接続情報', 'IPアドレス'],
  maintenanceVendor: ['保守業者・連絡先', '保守業者'],
  contractNo: ['契約・保守番号', '契約番号']
};

function normalizeHeaderToken(header: string): string {
  return String(header || '')
    .replace(/\([^)]*\)/g, '')
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();
}

function normalizeAssetCodeKey(val?: string | null): string {
  return String(val || '')
    .replace(/[\s\u3000]+/g, '')
    .toLowerCase();
}

function resolveFieldForHeader(
  header: string,
  category?: AssetCategory
): AssetFieldDefinition | undefined {
  if (!category || !Array.isArray(category.fields)) return undefined;
  const trimmed = header.trim();
  const normHeader = normalizeHeaderToken(trimmed);

  // 1. ラベルまたはキー一致
  const direct = category.fields.find((f) => {
    const normLabel = normalizeHeaderToken(f.label);
    const normWithUnit = f.unit ? normalizeHeaderToken(`${f.label}(${f.unit})`) : '';
    return (
      f.key.toLowerCase() === trimmed.toLowerCase() ||
      normLabel === normHeader ||
      (normWithUnit && normWithUnit === normHeader)
    );
  });
  if (direct) return direct;

  // 2. エイリアス一致
  for (const field of category.fields) {
    const aliases = FIELD_HEADER_ALIASES[field.key] || [];
    if (aliases.some((alias) => normalizeHeaderToken(alias) === normHeader)) {
      return field;
    }
  }
  return undefined;
}

function mapStatusFromCsv(raw: string, assetName?: string): AssetStatus {
  const s = cleanNotionLinkText(raw);
  if (s) {
    if (s.includes('修理') || s.includes('点検中') || s.includes('故障') || s === 'maintenance') {
      return 'maintenance';
    }
    if (s.includes('予備') || s.includes('保管') || s === 'standby') return 'standby';
    if (s.includes('廃棄') || s.includes('破棄') || s.includes('返却') || s === 'retired') {
      return 'retired';
    }
    return 'active';
  }
  const n = cleanNotionLinkText(assetName);
  if (n.includes('破棄') || n.includes('廃棄')) return 'retired';
  if (n.includes('故障')) return 'maintenance';
  return 'active';
}

export function AssetCsvImportModal({
  isOpen,
  onClose,
  categories,
  defaultCategoryId,
  existingAssets,
  users,
  offices,
  divisions,
  onImportAsset,
  onSaveCategory,
  onComplete
}: AssetCsvImportModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [fileName, setFileName] = useState<string>('');
  const [headers, setHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<string[][]>([]);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>(
    defaultCategoryId || categories[0]?.id || ''
  );
  const [officeMode, setOfficeMode] = useState<string>('auto');
  const [duplicatePolicy, setDuplicatePolicy] = useState<DuplicatePolicy>('skip');
  const [manualOverrides, setManualOverrides] = useState<
    Record<
      number,
      {
        selected?: boolean;
        assigneeMode?: 'user' | 'shared' | 'unassigned';
        assigneeUserId?: string;
        officeId?: string;
      }
    >
  >({});

  const [parseError, setParseError] = useState<string>('');
  const [syncingCategory, setSyncingCategory] = useState<boolean>(false);
  const [categorySyncNotice, setCategorySyncNotice] = useState<string>('');
  const [importing, setImporting] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ current: number; total: number }>({
    current: 0,
    total: 0
  });
  const [importSummary, setImportSummary] = useState<{
    created: number;
    updated: number;
    skipped: number;
    errors: string[];
  } | null>(null);

  const sortedUsers = useMemo(() => sortUsersByDivision(users), [users]);

  const activeCategory = useMemo(() => {
    return (
      categories.find((c) => c.id === selectedCategoryId) ||
      categories[0] ||
      undefined
    );
  }, [categories, selectedCategoryId]);

  const handleFilePicked = async (file?: File | null) => {
    if (!file) return;
    setParseError('');
    setImportSummary(null);
    setCategorySyncNotice('');
    setManualOverrides({});
    try {
      const text = await readCsvFileAsText(file);
      const matrix = parseCsvMatrix(text);
      if (matrix.length < 2) {
        setParseError('CSVにヘッダー行とデータ行が含まれていません。');
        return;
      }
      const hdrs = matrix[0];
      const bodyRows = matrix.slice(1);
      setFileName(file.name);
      setHeaders(hdrs);
      setRawRows(bodyRows);

      // ヘッダー内容から適したカテゴリを自動判定
      const joined = hdrs.join(',');
      if (
        joined.includes('車種') ||
        joined.includes('車検満期') ||
        joined.includes('登録番号') ||
        joined.includes('ETC')
      ) {
        const vehicleCat = categories.find(
          (c) => c.id === 'cat-vehicle' || c.name.includes('車両')
        );
        if (vehicleCat) setSelectedCategoryId(vehicleCat.id);
      } else if (
        joined.includes('OS') ||
        joined.includes('CPU') ||
        joined.includes('Officeライセンス') ||
        joined.includes('MSアカウント') ||
        joined.includes('eset') ||
        joined.includes('機種名')
      ) {
        const pcCat = categories.find(
          (c) => c.id === 'cat-pc' || c.name.toUpperCase().includes('PC')
        );
        if (pcCat) setSelectedCategoryId(pcCat.id);
      } else if (defaultCategoryId) {
        setSelectedCategoryId(defaultCategoryId);
      }
    } catch (err: any) {
      setParseError(err?.message || 'CSVファイルの読み込みに失敗しました');
    }
  };

  // ヘッダーとフィールドのマッピング診断
  const headerMappings = useMemo(() => {
    return headers.map((h, colIdx) => {
      const norm = normalizeHeaderToken(h);
      if (['資産id', 'id'].includes(norm)) {
        return { colIdx, header: h, target: '既存ID照合(参考)', kind: 'system' as const };
      }
      if (['管理/登録番号', '管理番号', '登録番号', 'ナンバー', '車両番号', '資産番号'].includes(norm)) {
        return { colIdx, header: h, target: '管理/登録番号', kind: 'core' as const };
      }
      if (['資産名', '名称', 'pc', 'pc名', '端末名'].includes(norm)) {
        return { colIdx, header: h, target: '資産名', kind: 'core' as const };
      }
      if (['使用者', '担当', '担当者'].includes(norm)) {
        return { colIdx, header: h, target: '使用者（社員自動照合）', kind: 'core' as const };
      }
      if (['使用区分'].includes(norm)) {
        return { colIdx, header: h, target: '使用区分（個人/共用）', kind: 'core' as const };
      }
      if (['拠点', '支店', '営業所'].includes(norm)) {
        return { colIdx, header: h, target: '拠点', kind: 'core' as const };
      }
      if (['部署'].includes(norm)) {
        return { colIdx, header: h, target: '部署', kind: 'core' as const };
      }
      if (['ステータス', '状態'].includes(norm)) {
        return { colIdx, header: h, target: 'ステータス', kind: 'core' as const };
      }
      if (['備考', 'メモ'].includes(norm)) {
        return { colIdx, header: h, target: '備考', kind: 'core' as const };
      }
      if (['警告', 'アラート状況', '最終提出日', '添付数', '更新日時', '資産種類'].includes(norm)) {
        return { colIdx, header: h, target: '自動計算・スキップ', kind: 'skip' as const };
      }
      const field = resolveFieldForHeader(h, activeCategory);
      if (field) {
        return {
          colIdx,
          header: h,
          target: field.label,
          field,
          kind: 'field' as const
        };
      }
      return { colIdx, header: h, target: '未マッピング（スキップ）', kind: 'skip' as const };
    });
  }, [headers, activeCategory]);

  // PCカテゴリ選択時に未設定のNotion PC項目があるか検出
  const isPcCategory = Boolean(
    activeCategory &&
      (activeCategory.id === 'cat-pc' || activeCategory.name.toUpperCase().includes('PC'))
  );

  const missingPcHeaders = useMemo(() => {
    if (!isPcCategory || !activeCategory || headers.length === 0) return [];
    const alignedCategory: AssetCategory = {
      ...activeCategory,
      fields: buildAlignedPcCategoryFields(activeCategory.fields)
    };
    return headerMappings
      .filter((m) => m.kind === 'skip' && m.target === '未マッピング（スキップ）')
      .filter((m) => Boolean(resolveFieldForHeader(m.header, alignedCategory)))
      .map((m) => m.header);
  }, [isPcCategory, activeCategory, headers, headerMappings]);

  const handleSyncPcCategoryFields = async () => {
    if (!activeCategory || !onSaveCategory || syncingCategory) return;
    setSyncingCategory(true);
    setParseError('');
    setCategorySyncNotice('');
    try {
      const nextFields = buildAlignedPcCategoryFields(activeCategory.fields);
      await onSaveCategory({
        ...activeCategory,
        fields: nextFields
      });
      setCategorySyncNotice(
        '「PC」カテゴリの項目をこのCSV構成（機種名・導入日・タイプ・OS・Officeライセンス・メモリ・HDD・MSアカウント・MSパスワード・確認日・eset）に合わせて保存しました。'
      );
    } catch (err: any) {
      setParseError(err?.message || 'PC項目の同期に失敗しました');
    } finally {
      setSyncingCategory(false);
    }
  };

  // プレビュー行の生成
  const previewRows: ParsedCsvRowPreview[] = useMemo(() => {
    if (!activeCategory || rawRows.length === 0) return [];

    const existingBuckets = new Map<string, AssetItem[]>();
    for (const a of existingAssets) {
      if (a.categoryId !== activeCategory.id) continue;
      const keys = new Set<string>();
      const codeKey = normalizeAssetCodeKey(a.assetCode);
      const nameKey = normalizeAssetCodeKey(a.name);
      if (codeKey) keys.add(codeKey);
      if (nameKey) keys.add(nameKey);
      keys.forEach((k) => {
        const list = existingBuckets.get(k) || [];
        list.push(a);
        existingBuckets.set(k, list);
      });
    }

    const csvCodeCounts = new Map<string, number>();
    const codeNameCols = headerMappings.filter(
      (m) =>
        m.kind === 'core' &&
        ['管理/登録番号', '管理番号', '登録番号', 'ナンバー', '車両番号', '資産番号', '資産名', '名称', 'pc', 'pc名', '端末名'].includes(
          normalizeHeaderToken(m.header)
        )
    );
    rawRows.forEach((cells) => {
      const firstVal = codeNameCols.map((m) => cleanNotionLinkText(cells[m.colIdx] ?? '')).find(Boolean);
      const k = normalizeAssetCodeKey(firstVal);
      if (k) csvCodeCounts.set(k, (csvCodeCounts.get(k) || 0) + 1);
    });

    return rawRows.map((cells, idx) => {
      let assetCode = '';
      let assetName = '';
      let rawAssignee = '';
      let rawShared = '';
      let rawOffice = '';
      let rawDivision = '';
      let rawStatus = '';
      let notes = '';
      const attributes: Record<string, any> = {};

      headerMappings.forEach((m) => {
        const rawVal = cells[m.colIdx] ?? '';
        if (!rawVal) return;
        const norm = normalizeHeaderToken(m.header);

        if (m.kind === 'core') {
          if (['管理/登録番号', '管理番号', '登録番号', 'ナンバー', '車両番号', '資産番号'].includes(norm)) {
            assetCode = cleanNotionLinkText(rawVal);
          } else if (['資産名', '名称', 'pc', 'pc名', '端末名'].includes(norm)) {
            assetName = cleanNotionLinkText(rawVal);
          } else if (['使用者', '担当', '担当者'].includes(norm)) {
            rawAssignee = cleanNotionLinkText(rawVal);
          } else if (['使用区分'].includes(norm)) {
            rawShared = cleanNotionLinkText(rawVal);
          } else if (['拠点', '支店', '営業所'].includes(norm)) {
            rawOffice = cleanNotionLinkText(rawVal);
          } else if (['部署'].includes(norm)) {
            rawDivision = cleanNotionLinkText(rawVal);
          } else if (['ステータス', '状態'].includes(norm)) {
            rawStatus = cleanNotionLinkText(rawVal);
          } else if (['備考', 'メモ'].includes(norm)) {
            notes = cleanNotionLinkText(rawVal);
          }
        } else if (m.kind === 'field' && m.field) {
          const f = m.field;
          if (f.type === 'date') {
            const parsedDate = parseFlexibleCsvDate(rawVal);
            if (parsedDate) attributes[f.key] = parsedDate;
          } else if (f.type === 'number') {
            const numStr = cleanNotionLinkText(rawVal).replace(/[^\d.-]/g, '');
            if (numStr && !isNaN(Number(numStr))) {
              attributes[f.key] = Number(numStr);
            }
          } else if (f.type === 'checkbox') {
            const v = cleanNotionLinkText(rawVal).toLowerCase();
            attributes[f.key] = ['true', '1', 'yes', 'はい', '対象', '〇', '○'].includes(v);
          } else {
            const cleaned = cleanNotionLinkText(rawVal);
            if (cleaned) attributes[f.key] = cleaned;
          }
        }
      });

      const finalName = assetName || assetCode || `インポート資産 #${idx + 1}`;
      const finalCode = assetCode || assetName || '';

      // 使用者照合
      const isExplicitShared =
        rawShared.includes('共用') ||
        rawAssignee.includes('共用') ||
        (activeCategory.defaultShared && !rawAssignee);
      const matchedUser = !isExplicitShared && rawAssignee ? matchUserByCsvName(rawAssignee, users) : undefined;

      const ov = manualOverrides[idx];
      const assigneeMode: 'user' | 'shared' | 'unassigned' =
        ov?.assigneeMode ||
        (isExplicitShared ? 'shared' : matchedUser ? 'user' : 'unassigned');
      const assigneeUserId =
        ov?.assigneeUserId !== undefined
          ? ov.assigneeUserId
          : matchedUser
          ? String(matchedUser.id)
          : '';
      const resolvedUser = users.find((u) => String(u.id) === String(assigneeUserId));

      // 拠点決定
      let resolvedOfficeObj =
        officeMode !== 'auto'
          ? resolveOffice(officeMode, offices)
          : (rawOffice ? resolveOffice(rawOffice, offices) : undefined) ||
            inferOfficeFromText(finalCode || finalName, offices) ||
            (resolvedUser ? getUserOffice(resolvedUser, offices) : undefined);

      if (ov?.officeId) {
        resolvedOfficeObj = resolveOffice(ov.officeId, offices) || resolvedOfficeObj;
      }

      const resolvedDivObj =
        (rawDivision ? resolveDivision(rawDivision, divisions) : undefined) ||
        (resolvedUser ? getUserDivision(resolvedUser, divisions) : undefined);

      const codeLookupKey = normalizeAssetCodeKey(finalCode || finalName);
      const candidates = codeLookupKey ? existingBuckets.get(codeLookupKey) || [] : [];
      const hasDupInCsv = (csvCodeCounts.get(codeLookupKey) || 0) > 1;
      let existingMatch: AssetItem | undefined;
      if (candidates.length === 1 && !hasDupInCsv) {
        existingMatch = candidates[0];
      } else if (candidates.length > 0) {
        existingMatch = candidates.find((c) => {
          const sameUser =
            Boolean(assigneeUserId) &&
            Boolean(c.assigneeUserId) &&
            String(c.assigneeUserId) === String(assigneeUserId);
          const sameModel =
            Boolean(attributes.makerModel) &&
            Boolean(c.attributes?.makerModel) &&
            normalizeAssetCodeKey(String(c.attributes.makerModel)) ===
              normalizeAssetCodeKey(String(attributes.makerModel));
          return sameUser || sameModel;
        });
      }

      return {
        rowIndex: idx,
        selected: ov?.selected !== undefined ? ov.selected : true,
        assetCode: finalCode,
        name: finalName,
        rawAssigneeName: rawAssignee,
        assigneeMode,
        assigneeUserId,
        matchedAuto: Boolean(matchedUser),
        officeId: resolvedOfficeObj ? String(resolvedOfficeObj.id) : '',
        officeName: resolvedOfficeObj?.name || rawOffice || '',
        divisionId: resolvedDivObj ? String(resolvedDivObj.id) : '',
        divisionName: resolvedDivObj?.name || rawDivision || '',
        status: mapStatusFromCsv(rawStatus, finalName),
        attributes,
        notes,
        existingMatch
      };
    });
  }, [
    activeCategory,
    rawRows,
    headerMappings,
    existingAssets,
    users,
    offices,
    divisions,
    officeMode,
    manualOverrides
  ]);

  const stats = useMemo(() => {
    let selectedCount = 0;
    let createCount = 0;
    let overwriteCount = 0;
    let skipCount = 0;
    let unmatchedUserCount = 0;

    for (const r of previewRows) {
      if (!r.selected) continue;
      selectedCount++;
      if (r.existingMatch) {
        if (duplicatePolicy === 'skip') skipCount++;
        else if (duplicatePolicy === 'overwrite') overwriteCount++;
        else createCount++;
      } else {
        createCount++;
      }
      if (r.rawAssigneeName && r.assigneeMode === 'unassigned') {
        unmatchedUserCount++;
      }
    }

    return {
      total: previewRows.length,
      selectedCount,
      createCount,
      overwriteCount,
      skipCount,
      unmatchedUserCount
    };
  }, [previewRows, duplicatePolicy]);

  const handleRunImport = async () => {
    if (!activeCategory || importing) return;
    const targets = previewRows.filter((r) => r.selected);
    if (targets.length === 0) return;

    setImporting(true);
    setProgress({ current: 0, total: targets.length });
    setImportSummary(null);

    let created = 0;
    let updated = 0;
    let skipped = 0;
    const errors: string[] = [];

    for (let i = 0; i < targets.length; i++) {
      const row = targets[i];
      setProgress({ current: i + 1, total: targets.length });

      if (row.existingMatch && duplicatePolicy === 'skip') {
        skipped++;
        continue;
      }

      const assignedUser =
        row.assigneeMode === 'user' && row.assigneeUserId
          ? users.find((u) => String(u.id) === String(row.assigneeUserId))
          : undefined;

      const isShared = row.assigneeMode === 'shared';

      const payload: Partial<AssetItem> & { id?: string } = {
        ...(row.existingMatch && duplicatePolicy === 'overwrite'
          ? { id: row.existingMatch.id }
          : {}),
        categoryId: activeCategory.id,
        assetCode: row.assetCode,
        name: row.name,
        officeId: row.officeId || undefined,
        office: row.officeName || undefined,
        divisionId: row.divisionId || undefined,
        division: row.divisionName || undefined,
        isShared,
        assigneeUserId: isShared ? undefined : assignedUser ? String(assignedUser.id) : undefined,
        assigneeUserName: isShared
          ? undefined
          : assignedUser
          ? assignedUser.name
          : row.rawAssigneeName || undefined,
        status: row.status,
        attributes:
          row.existingMatch && duplicatePolicy === 'overwrite'
            ? { ...(row.existingMatch.attributes || {}), ...row.attributes }
            : row.attributes,
        notes: row.notes
      };

      try {
        await onImportAsset(payload);
        if (row.existingMatch && duplicatePolicy === 'overwrite') {
          updated++;
        } else {
          created++;
        }
      } catch (err: any) {
        errors.push(`${row.assetCode || row.name}: ${err?.message || '登録エラー'}`);
      }
    }

    setImporting(false);
    setImportSummary({ created, updated, skipped, errors });
    onComplete?.();
  };

  if (!isOpen) return null;

  const mappedFieldKeys = new Set(
    headerMappings
      .filter((m) => m.kind === 'field' && m.field)
      .map((m) => m.field!.key)
  );
  const previewAttributes =
    mappedFieldKeys.size > 0
      ? (activeCategory?.fields || []).filter((f) => mappedFieldKeys.has(f.key))
      : (activeCategory?.fields || []).slice(0, 8);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 backdrop-blur-xs p-3 sm:p-5">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-6xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow-xs">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-extrabold text-slate-900">
                CSV 一括インポート（車両・PC・工具・共用機器）
              </h3>
              <p className="text-xs text-slate-500">
                Notion 出力CSVの URL 表記除去・和文日付変換（YYYY年M月D日 → YYYY-MM-DD）・社員自動紐づけに対応
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={importing}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 transition-colors cursor-pointer disabled:opacity-40"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4">
          {/* File Dropzone & Basic Options */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
            <div className="lg:col-span-5">
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => handleFilePicked(e.target.files?.[0])}
              />
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  handleFilePicked(e.dataTransfer.files?.[0]);
                }}
                onClick={() => fileInputRef.current?.click()}
                className="h-full min-h-[112px] border-2 border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/40 rounded-xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-colors"
              >
                <Upload className="w-6 h-6 text-indigo-600 mb-1.5" />
                <div className="text-xs font-bold text-slate-800">
                  {fileName ? `選択中: ${fileName}` : 'CSVファイルをクリックまたはドロップ'}
                </div>
                <div className="text-[11px] text-slate-500 mt-0.5">
                  UTF-8 / Shift-JIS 両対応（NotionエクスポートCSVそのままOK）
                </div>
              </div>
            </div>

            <div className="lg:col-span-7 bg-slate-50 rounded-xl border border-slate-200 p-3.5 grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  取り込み先の資産種類
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={(e) => setSelectedCategoryId(e.target.value)}
                  disabled={importing}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  拠点の設定方法
                </label>
                <select
                  value={officeMode}
                  onChange={(e) => setOfficeMode(e.target.value)}
                  disabled={importing}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  <option value="auto">自動判定（登録番号・使用者所属）</option>
                  {offices.map((o) => (
                    <option key={o.id} value={o.id}>
                      すべて「{o.name}」にする
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] font-bold text-slate-600 mb-1">
                  同一番号・名称の扱い
                </label>
                <select
                  value={duplicatePolicy}
                  onChange={(e) => setDuplicatePolicy(e.target.value as DuplicatePolicy)}
                  disabled={importing}
                  className="w-full px-2.5 py-2 rounded-lg border border-slate-300 bg-white text-xs font-semibold text-slate-800"
                >
                  <option value="skip">重複はスキップ（新規のみ）</option>
                  <option value="overwrite">既存データを上書き更新</option>
                  <option value="create">重複チェックせず新規登録</option>
                </select>
              </div>

              {headers.length > 0 && (
                <div className="sm:col-span-3 pt-1 border-t border-slate-200/80 flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-slate-500 mr-1">列マッピング:</span>
                  {headerMappings.map((m) => (
                    <span
                      key={m.colIdx}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10.5px] font-semibold border whitespace-nowrap ${
                        m.kind === 'skip'
                          ? 'bg-slate-100 text-slate-500 border-slate-200'
                          : m.kind === 'core'
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200'
                          : 'bg-emerald-50 text-emerald-700 border-emerald-200'
                      }`}
                    >
                      <span>{m.header}</span>
                      <span className="opacity-60">→</span>
                      <span>{m.target}</span>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {missingPcHeaders.length > 0 && onSaveCategory && (
            <div className="p-3.5 rounded-xl bg-indigo-50 border border-indigo-200 flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-0.5 text-xs text-indigo-950">
                <div className="font-bold flex items-center gap-1.5">
                  <Settings2 className="w-4 h-4 text-indigo-600" />
                  <span>
                    「{activeCategory?.name}」の項目設定をこのCSVに合わせて拡張できます（未設定列:{' '}
                    {missingPcHeaders.join('・')}）
                  </span>
                </div>
                <p className="text-[11px] text-indigo-800/90">
                  ボタンを押すと「PC」カテゴリに不足している項目を自動で追加・整列し、すべての列をそのまま取り込めるようになります。
                </p>
              </div>
              <button
                type="button"
                onClick={handleSyncPcCategoryFields}
                disabled={syncingCategory || importing}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs cursor-pointer disabled:opacity-50 whitespace-nowrap"
              >
                <Settings2 className="w-3.5 h-3.5" />
                {syncingCategory ? '項目を設定中...' : '「PC」項目をこのCSVに合わせて設定する'}
              </button>
            </div>
          )}

          {categorySyncNotice && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-800 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{categorySyncNotice}</span>
            </div>
          )}

          {parseError && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>{parseError}</span>
            </div>
          )}

          {importSummary && (
            <div
              className={`p-3.5 rounded-xl border text-xs space-y-1.5 ${
                importSummary.errors.length > 0
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-900'
              }`}
            >
              <div className="font-bold flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span>
                  インポート完了：新規登録 {importSummary.created}件 ／ 上書き更新{' '}
                  {importSummary.updated}件 ／ スキップ {importSummary.skipped}件
                </span>
              </div>
              {importSummary.errors.length > 0 && (
                <ul className="list-disc pl-5 text-rose-700 space-y-0.5">
                  {importSummary.errors.map((e, idx) => (
                    <li key={idx}>{e}</li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Preview Summary & Table */}
          {previewRows.length > 0 && (
            <div className="space-y-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <span className="font-bold text-slate-800">
                    プレビュー（全{stats.total}件中 {stats.selectedCount}件を選択）
                  </span>
                  <span className="px-2 py-0.5 rounded-full bg-sky-100 text-sky-800 font-bold text-[11px] whitespace-nowrap">
                    新規: {stats.createCount}件
                  </span>
                  {stats.overwriteCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-bold text-[11px] whitespace-nowrap">
                      上書き: {stats.overwriteCount}件
                    </span>
                  )}
                  {stats.skipCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 font-bold text-[11px] whitespace-nowrap">
                      重複スキップ: {stats.skipCount}件
                    </span>
                  )}
                  {stats.unmatchedUserCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-bold text-[11px] whitespace-nowrap flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      社員未一致: {stats.unmatchedUserCount}件（下表から手動指定可）
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      const next: typeof manualOverrides = {};
                      previewRows.forEach((r) => {
                        next[r.rowIndex] = { ...manualOverrides[r.rowIndex], selected: true };
                      });
                      setManualOverrides(next);
                    }}
                    className="text-[11px] font-bold text-indigo-600 hover:underline cursor-pointer"
                  >
                    すべて選択
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      const next: typeof manualOverrides = {};
                      previewRows.forEach((r) => {
                        next[r.rowIndex] = { ...manualOverrides[r.rowIndex], selected: false };
                      });
                      setManualOverrides(next);
                    }}
                    className="text-[11px] font-bold text-slate-500 hover:underline cursor-pointer"
                  >
                    すべて解除
                  </button>
                </div>
              </div>

              <div className="border border-slate-200 rounded-xl overflow-x-auto max-h-[42vh]">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-100 sticky top-0 z-10 border-b border-slate-200 text-[11px] font-bold text-slate-600">
                    <tr>
                      <th className="py-2 px-2.5 w-9 text-center">対象</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">判定</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">管理/登録番号</th>
                      <th className="py-2 px-2.5 whitespace-nowrap">拠点</th>
                      <th className="py-2 px-2.5 whitespace-nowrap min-w-[190px]">
                        使用者（CSV照合）
                      </th>
                      {previewAttributes.map((f) => (
                        <th key={f.key} className="py-2 px-2.5 whitespace-nowrap">
                          {f.label}
                        </th>
                      ))}
                      <th className="py-2 px-2.5 whitespace-nowrap">備考</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {previewRows.map((row) => {
                      const isSkipped = Boolean(row.existingMatch && duplicatePolicy === 'skip');
                      const isOverwrite = Boolean(
                        row.existingMatch && duplicatePolicy === 'overwrite'
                      );
                      return (
                        <tr
                          key={row.rowIndex}
                          className={`${
                            !row.selected || isSkipped ? 'bg-slate-50/70 opacity-60' : 'bg-white'
                          } hover:bg-indigo-50/30`}
                        >
                          <td className="py-2 px-2.5 text-center">
                            <input
                              type="checkbox"
                              checked={row.selected}
                              disabled={importing}
                              onChange={(e) =>
                                setManualOverrides((prev) => ({
                                  ...prev,
                                  [row.rowIndex]: {
                                    ...prev[row.rowIndex],
                                    selected: e.target.checked
                                  }
                                }))
                              }
                              className="rounded border-slate-300 text-indigo-600 cursor-pointer"
                            />
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            {isSkipped ? (
                              <span className="px-1.5 py-0.5 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">
                                スキップ
                              </span>
                            ) : isOverwrite ? (
                              <span className="px-1.5 py-0.5 rounded bg-indigo-100 text-indigo-700 text-[10px] font-bold">
                                上書き
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 text-[10px] font-bold">
                                新規
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 font-bold text-slate-900 whitespace-nowrap">
                            <div className="flex items-center gap-1.5">
                              <span>{row.assetCode || row.name}</span>
                              {row.status === 'retired' && (
                                <span className="px-1.5 py-0.2 rounded bg-slate-200 text-slate-700 text-[10px] font-bold">
                                  廃棄
                                </span>
                              )}
                              {row.status === 'maintenance' && (
                                <span className="px-1.5 py-0.2 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                  故障・点検
                                </span>
                              )}
                            </div>
                          </td>
                          <td className="py-2 px-2.5 whitespace-nowrap">
                            <div className="flex items-center gap-1 text-slate-700">
                              <Building2 className="w-3 h-3 text-slate-400 shrink-0" />
                              <span>{row.officeName || '未設定'}</span>
                            </div>
                          </td>
                          <td className="py-2 px-2.5">
                            <div className="space-y-1">
                              <select
                                value={
                                  row.assigneeMode === 'shared'
                                    ? '__shared__'
                                    : row.assigneeUserId || '__unassigned__'
                                }
                                disabled={importing}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  setManualOverrides((prev) => ({
                                    ...prev,
                                    [row.rowIndex]: {
                                      ...prev[row.rowIndex],
                                      assigneeMode:
                                        v === '__shared__'
                                          ? 'shared'
                                          : v === '__unassigned__'
                                          ? 'unassigned'
                                          : 'user',
                                      assigneeUserId:
                                        v === '__shared__' || v === '__unassigned__' ? '' : v
                                    }
                                  }));
                                }}
                                className={`w-full px-2 py-1 rounded-md border text-[11px] font-semibold ${
                                  row.rawAssigneeName && row.assigneeMode === 'unassigned'
                                    ? 'border-amber-300 bg-amber-50 text-amber-900'
                                    : 'border-slate-200 bg-white text-slate-800'
                                }`}
                              >
                                <option value="__unassigned__">
                                  {row.rawAssigneeName
                                    ? `未一致（${row.rawAssigneeName} の名前だけ保持）`
                                    : '未割当'}
                                </option>
                                <option value="__shared__">共用（使用者限定なし）</option>
                                {sortedUsers.map((u) => (
                                  <option key={u.id} value={u.id}>
                                    {u.name}
                                    {u.office ? ` (${u.office})` : ''}
                                  </option>
                                ))}
                              </select>
                              {row.rawAssigneeName && row.matchedAuto && (
                                <div className="text-[10px] text-emerald-700 flex items-center gap-0.5">
                                  <Check className="w-3 h-3" />
                                  <span>自動一致: {row.rawAssigneeName}</span>
                                </div>
                              )}
                            </div>
                          </td>
                          {previewAttributes.map((f) => {
                            const val = row.attributes[f.key];
                            return (
                              <td
                                key={f.key}
                                className="py-2 px-2.5 whitespace-nowrap text-slate-700 max-w-[180px] truncate"
                                title={val !== undefined && val !== '' ? String(val) : ''}
                              >
                                {val === undefined || val === '' ? (
                                  <span className="text-slate-300">-</span>
                                ) : f.type === 'checkbox' ? (
                                  val ? (
                                    <span className="inline-flex items-center gap-0.5 text-emerald-700 font-bold">
                                      <Check className="w-3 h-3" />
                                      Yes
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">No</span>
                                  )
                                ) : f.type === 'date' ? (
                                  formatAssetDateJa(String(val))
                                ) : (
                                  String(val)
                                )}
                              </td>
                            );
                          })}
                          <td className="py-2 px-2.5 max-w-[200px] truncate text-slate-600" title={row.notes}>
                            {row.notes || <span className="text-slate-300">-</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-slate-200 bg-slate-50/80 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="text-xs text-slate-500">
            {importing ? (
              <span className="inline-flex items-center gap-1.5 font-bold text-indigo-700">
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                登録処理中... ({progress.current} / {progress.total} 件)
              </span>
            ) : (
              <span>
                ※ 登録された日付項目（車検満期・定期点検・リース満了等）から自動でアラート＆資産カレンダー連携が行われます
              </span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={importing}
              className="px-4 py-2 rounded-xl text-xs font-bold border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={handleRunImport}
              disabled={
                importing ||
                !activeCategory ||
                stats.createCount + stats.overwriteCount === 0
              }
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs cursor-pointer disabled:opacity-40 whitespace-nowrap"
            >
              <Upload className="w-3.5 h-3.5" />
              {importing
                ? 'インポート中...'
                : `インポート実行（${stats.createCount + stats.overwriteCount}件）`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
