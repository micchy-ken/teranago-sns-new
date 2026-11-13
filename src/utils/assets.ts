import {
  Car,
  Laptop,
  Wrench,
  Printer,
  Router,
  Box,
  Cpu,
  Smartphone,
  KeyRound,
  HardDrive,
  Gauge,
  Truck,
  ShieldCheck,
  Package
} from 'lucide-react';
import {
  AssetAlertInfo,
  AssetCategory,
  AssetFieldDefinition,
  AssetItem,
  AssetLogActionType,
  AssetStatus,
  DivisionMaster,
  OfficeMaster,
  User
} from '../types';
import { resolveDivisionName, resolveOfficeName } from './masterResolver';

/**
 * JST (Asia/Tokyo, UTC+9) の今日の日付 'YYYY-MM-DD' を返す
 */
export function getJstTodayStr(): string {
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  const parts = formatter.formatToParts(new Date());
  const y = parts.find((p) => p.type === 'year')?.value || '2026';
  const m = parts.find((p) => p.type === 'month')?.value || '01';
  const d = parts.find((p) => p.type === 'day')?.value || '01';
  return `${y}-${m}-${d}`;
}

/**
 * 'YYYY-MM-DD' 文字列を JST 00:00:00 のタイムスタンプ (ms) に変換する
 */
export function parseJstDateMs(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const cleaned = String(dateStr).trim().slice(0, 10);
  const m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return null;
  const iso = `${m[1]}-${m[2].padStart(2, '0')}-${m[3].padStart(2, '0')}T00:00:00+09:00`;
  const ms = new Date(iso).getTime();
  return isNaN(ms) ? null : ms;
}

/**
 * targetDate - today の日数差 (JST 基準)
 */
export function diffDaysFromTodayJst(targetDateStr?: string | null, baseTodayStr?: string): number | null {
  const targetMs = parseJstDateMs(targetDateStr);
  const todayMs = parseJstDateMs(baseTodayStr || getJstTodayStr());
  if (targetMs === null || todayMs === null) return null;
  return Math.round((targetMs - todayMs) / (24 * 60 * 60 * 1000));
}

/**
 * 日付を日本語表示 (2026年5月23日) に変換
 */
export function formatAssetDateJa(dateStr?: string | null): string {
  if (!dateStr) return '';
  const cleaned = String(dateStr).trim().slice(0, 10);
  const m = cleaned.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (!m) return String(dateStr);
  return `${m[1]}年${parseInt(m[2], 10)}月${parseInt(m[3], 10)}日`;
}

/**
 * 資産に紐づくすべてのアラートを算出 (点検1ヶ月前 / リース満了6ヶ月前 / 期限超過)
 */
export function computeAssetAlerts(
  asset: AssetItem,
  category?: AssetCategory,
  todayStr?: string
): AssetAlertInfo[] {
  if (!asset || !category || asset.status === 'retired') return [];
  const today = todayStr || getJstTodayStr();
  const alerts: AssetAlertInfo[] = [];

  for (const field of category.fields || []) {
    if (field.type !== 'date' || !field.alertRule) continue;
    const rawVal = asset.attributes?.[field.key];
    if (!rawVal) continue;
    const daysRemaining = diffDaysFromTodayJst(String(rawVal), today);
    if (daysRemaining === null) continue;

    const threshold = Number(field.alertRule.daysBefore) || 30;
    if (daysRemaining > threshold) continue;

    let severity: AssetAlertInfo['severity'] = 'upcoming';
    if (daysRemaining < 0) {
      severity = 'overdue';
    } else if (daysRemaining <= 30) {
      severity = 'warning';
    } else {
      severity = 'upcoming';
    }

    const defaultLabel =
      field.alertRule.kind === 'replacement'
        ? '入替アラート'
        : field.alertRule.kind === 'inspection'
        ? '点検アラート'
        : '期限アラート';

    alerts.push({
      assetId: asset.id,
      fieldKey: field.key,
      fieldLabel: field.label,
      kind: field.alertRule.kind,
      ruleLabel: field.alertRule.label || defaultLabel,
      targetDate: String(rawVal).slice(0, 10),
      daysRemaining,
      daysBefore: threshold,
      severity
    });
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

/**
 * アラート閾値の説明テキスト
 */
export function formatAlertRuleSummary(field: AssetFieldDefinition): string {
  if (!field.alertRule) return 'なし';
  const days = Number(field.alertRule.daysBefore) || 30;
  const periodLabel =
    days === 180
      ? '6ヶ月前'
      : days === 90
      ? '3ヶ月前'
      : days === 60
      ? '2ヶ月前'
      : days === 30
      ? '1ヶ月前'
      : `${days}日前`;
  const kindLabel =
    field.alertRule.kind === 'replacement'
      ? '入替アラート'
      : field.alertRule.kind === 'inspection'
      ? '点検アラート'
      : '期限アラート';
  return `${field.alertRule.label || kindLabel}（${periodLabel}）`;
}

export const ASSET_ICON_OPTIONS = [
  { key: 'Car', label: '車両' },
  { key: 'Truck', label: 'トラック・バン' },
  { key: 'Laptop', label: 'PC・端末' },
  { key: 'Wrench', label: '工具' },
  { key: 'Gauge', label: '計測器' },
  { key: 'Printer', label: '複合機・プリンタ' },
  { key: 'Router', label: 'ルーター・NW' },
  { key: 'HardDrive', label: 'NAS・サーバー' },
  { key: 'Smartphone', label: 'スマホ・タブレット' },
  { key: 'KeyRound', label: '鍵・カード' },
  { key: 'Cpu', label: '制御機器・部品' },
  { key: 'Box', label: 'その他資産' }
] as const;

export function getAssetIconComponent(iconKey?: string) {
  switch (iconKey) {
    case 'Car':
      return Car;
    case 'Truck':
      return Truck;
    case 'Laptop':
      return Laptop;
    case 'Wrench':
      return Wrench;
    case 'Gauge':
      return Gauge;
    case 'Printer':
      return Printer;
    case 'Router':
      return Router;
    case 'HardDrive':
      return HardDrive;
    case 'Smartphone':
      return Smartphone;
    case 'KeyRound':
      return KeyRound;
    case 'Cpu':
      return Cpu;
    case 'ShieldCheck':
      return ShieldCheck;
    case 'Package':
      return Package;
    default:
      return Box;
  }
}

export const ASSET_CATEGORY_COLOR_MAP: Record<
  string,
  { bg: string; text: string; border: string; pill: string; badge: string }
> = {
  sky: {
    bg: 'bg-sky-50',
    text: 'text-sky-700',
    border: 'border-sky-200',
    pill: 'bg-sky-600 text-white',
    badge: 'bg-sky-100 text-sky-800 border-sky-200'
  },
  indigo: {
    bg: 'bg-indigo-50',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    pill: 'bg-indigo-600 text-white',
    badge: 'bg-indigo-100 text-indigo-800 border-indigo-200'
  },
  amber: {
    bg: 'bg-amber-50',
    text: 'text-amber-700',
    border: 'border-amber-200',
    pill: 'bg-amber-600 text-white',
    badge: 'bg-amber-100 text-amber-800 border-amber-200'
  },
  emerald: {
    bg: 'bg-emerald-50',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    pill: 'bg-emerald-600 text-white',
    badge: 'bg-emerald-100 text-emerald-800 border-emerald-200'
  },
  rose: {
    bg: 'bg-rose-50',
    text: 'text-rose-700',
    border: 'border-rose-200',
    pill: 'bg-rose-600 text-white',
    badge: 'bg-rose-100 text-rose-800 border-rose-200'
  },
  purple: {
    bg: 'bg-purple-50',
    text: 'text-purple-700',
    border: 'border-purple-200',
    pill: 'bg-purple-600 text-white',
    badge: 'bg-purple-100 text-purple-800 border-purple-200'
  },
  slate: {
    bg: 'bg-slate-100',
    text: 'text-slate-700',
    border: 'border-slate-200',
    pill: 'bg-slate-700 text-white',
    badge: 'bg-slate-100 text-slate-800 border-slate-200'
  }
};

export function getCategoryTheme(color?: string) {
  return ASSET_CATEGORY_COLOR_MAP[color || 'indigo'] || ASSET_CATEGORY_COLOR_MAP.indigo;
}

export const ASSET_STATUS_META: Record<
  AssetStatus,
  { label: string; badgeClass: string }
> = {
  active: { label: '稼働中', badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
  maintenance: { label: '点検・修理中', badgeClass: 'bg-amber-50 text-amber-700 border-amber-200' },
  standby: { label: '予備・保管', badgeClass: 'bg-slate-100 text-slate-600 border-slate-200' },
  retired: { label: '廃棄・返却済', badgeClass: 'bg-rose-50 text-rose-700 border-rose-200' }
};

export const ASSET_LOG_ACTION_META: Record<
  AssetLogActionType,
  { label: string; badgeClass: string }
> = {
  register: { label: '新規登録', badgeClass: 'bg-indigo-100 text-indigo-800' },
  update: { label: '情報更新', badgeClass: 'bg-slate-100 text-slate-700' },
  assignee_change: { label: '使用者変更', badgeClass: 'bg-sky-100 text-sky-800' },
  inspection: { label: '点検実施', badgeClass: 'bg-emerald-100 text-emerald-800' },
  repair: { label: '修理対応', badgeClass: 'bg-amber-100 text-amber-800' },
  replacement: { label: '入替・更新', badgeClass: 'bg-purple-100 text-purple-800' },
  note: { label: 'メモ', badgeClass: 'bg-slate-100 text-slate-600' },
  retire: { label: '廃棄・返却', badgeClass: 'bg-rose-100 text-rose-800' }
};

/**
 * Select 値用のソフトカラーバッジスタイル (Notion風)
 */
export function getSelectChipStyle(val: string): string {
  const v = String(val || '');
  if (v === 'ハイブリッド' || v === 'P点検' || v === '車検' || v === 'Windows 11 Pro') {
    return 'bg-rose-50 text-rose-700 border-rose-200';
  }
  if (v === 'D点検' || v === '軽油' || v === 'プロボックス' || v === 'アクア' || v === 'シエンタ') {
    return 'bg-sky-50 text-sky-700 border-sky-200';
  }
  if (v === 'ガソリン' || v === 'レジアスエース' || v === 'EV') {
    return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  }
  if (v.includes('点検') || v.includes('校正')) {
    return 'bg-amber-50 text-amber-700 border-amber-200';
  }
  return 'bg-slate-100 text-slate-700 border-slate-200';
}

function escapeCsvCell(val: any): string {
  if (val === null || val === undefined) return '';
  const str = typeof val === 'boolean' ? (val ? 'はい' : 'いいえ') : String(val);
  if (/[",\r\n]/.test(str)) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * 資産一覧を CSV (UTF-8 BOM付) でエクスポート・ダウンロードする
 */
export function exportAssetsToCsv(params: {
  assets: AssetItem[];
  categories: AssetCategory[];
  users: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  selectedCategory?: AssetCategory | null;
  filenamePrefix?: string;
}) {
  const {
    assets,
    categories,
    users,
    offices,
    divisions,
    selectedCategory,
    filenamePrefix = '資産台帳'
  } = params;

  // 出力する動的フィールド列を決定
  const dynamicFields: AssetFieldDefinition[] = [];
  const seenKeys = new Set<string>();

  if (selectedCategory) {
    for (const f of selectedCategory.fields) {
      if (!seenKeys.has(f.key)) {
        seenKeys.add(f.key);
        dynamicFields.push(f);
      }
    }
  } else {
    const usedCatIds = new Set(assets.map((a) => a.categoryId));
    for (const cat of categories) {
      if (!usedCatIds.has(cat.id)) continue;
      for (const f of cat.fields) {
        if (!seenKeys.has(f.key)) {
          seenKeys.add(f.key);
          dynamicFields.push(f);
        }
      }
    }
  }

  const headers = [
    '資産ID',
    '資産種類',
    '管理/登録番号',
    '資産名',
    'ステータス',
    '拠点',
    '部署',
    '使用区分',
    '使用者',
    'アラート状況',
    ...dynamicFields.map((f) => (f.unit ? `${f.label}(${f.unit})` : f.label)),
    '備考',
    '添付数',
    '更新日時'
  ];

  const today = getJstTodayStr();
  const rows = assets.map((asset) => {
    const cat = categories.find((c) => c.id === asset.categoryId);
    const alerts = computeAssetAlerts(asset, cat, today);
    const alertSummary =
      alerts.length > 0
        ? alerts
            .map((a) => {
              const statusText =
                a.daysRemaining < 0
                  ? `${Math.abs(a.daysRemaining)}日超過`
                  : `あと${a.daysRemaining}日`;
              return `${a.ruleLabel}[${a.fieldLabel}:${a.targetDate} (${statusText})]`;
            })
            .join(' / ')
        : '';

    const assignee = asset.isShared
      ? '共用（使用者限定なし）'
      : asset.assigneeUserId
      ? users.find((u) => String(u.id) === String(asset.assigneeUserId))?.name ||
        asset.assigneeUserName ||
        ''
      : asset.assigneeUserName || '未割当';

    const officeLabel = asset.officeId
      ? resolveOfficeName(asset.officeId, offices) || asset.office || ''
      : asset.office || '';
    const divisionLabel = asset.divisionId
      ? resolveDivisionName(asset.divisionId, divisions) || asset.division || ''
      : asset.division || '';

    return [
      asset.id,
      cat?.name || asset.categoryId,
      asset.assetCode || '',
      asset.name || '',
      ASSET_STATUS_META[asset.status]?.label || asset.status,
      officeLabel,
      divisionLabel,
      asset.isShared ? '共用' : '個人/専任',
      assignee,
      alertSummary,
      ...dynamicFields.map((f) => {
        const val = asset.attributes?.[f.key];
        if (val === undefined || val === null) return '';
        if (f.type === 'checkbox') return val ? '対象' : '対象外';
        return val;
      }),
      asset.notes || '',
      (asset.attachments || []).length,
      asset.updatedAt ? asset.updatedAt.slice(0, 10) : ''
    ];
  });

  const csvContent =
    '\uFEFF' +
    [headers, ...rows].map((r) => r.map(escapeCsvCell).join(',')).join('\r\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  const fileDate = today.replace(/-/g, '');
  link.href = url;
  link.download = `${filenamePrefix}_${selectedCategory ? selectedCategory.name + '_' : ''}${fileDate}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

// ============================================================================
// CSV インポート用パーサー & Notion/和文データクレンジングヘルパー
// ============================================================================

/**
 * バイナリFileを UTF-8 / Shift-JIS 自動判定してテキストへデコードする
 */
export async function readCsvFileAsText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(buffer);
  } catch {
    try {
      const sjisDecoder = new TextDecoder('shift_jis');
      return sjisDecoder.decode(buffer);
    } catch {
      return new TextDecoder('utf-8').decode(buffer);
    }
  }
}

/**
 * RFC 4180 準拠の CSV パーサー (クォート内カンマ・改行・BOM対応)
 */
export function parseCsvMatrix(rawText: string): string[][] {
  const text = String(rawText || '').replace(/^\uFEFF/, '');
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const next = text[i + 1];

    if (inQuotes) {
      if (ch === '"' && next === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"') {
      inQuotes = true;
    } else if (ch === ',') {
      row.push(cell.trim());
      cell = '';
    } else if (ch === '\r' && next === '\n') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
      i++;
    } else if (ch === '\n' || ch === '\r') {
      row.push(cell.trim());
      if (row.some((c) => c !== '')) rows.push(row);
      row = [];
      cell = '';
    } else {
      cell += ch;
    }
  }

  row.push(cell.trim());
  if (row.some((c) => c !== '')) {
    rows.push(row);
  }

  return rows;
}

/**
 * Notion エクスポート等に含まれる ` (https://app.notion.com/...)` リンク表記を除去する
 */
export function cleanNotionLinkText(raw?: string | null): string {
  if (!raw) return '';
  return String(raw)
    .replace(/\s*\(https?:\/\/[^)]+\)/gi, '')
    .replace(/\s*,\s*/g, ', ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * 「2026年05月23日」「2020/6/15」「2025-06-14」などを 'YYYY-MM-DD' に正規化する
 */
export function parseFlexibleCsvDate(raw?: string | null): string {
  if (!raw) return '';
  const cleaned = cleanNotionLinkText(raw)
    .replace(/[０-９]/g, (s) => String.fromCharCode(s.charCodeAt(0) - 0xfee0))
    .trim();
  if (!cleaned) return '';

  const jpMatch = cleaned.match(/^(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (jpMatch) {
    return `${jpMatch[1]}-${jpMatch[2].padStart(2, '0')}-${jpMatch[3].padStart(2, '0')}`;
  }

  const slashMatch = cleaned.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
  if (slashMatch) {
    return `${slashMatch[1]}-${slashMatch[2].padStart(2, '0')}-${slashMatch[3].padStart(2, '0')}`;
  }

  return '';
}

/**
 * 氏名文字列の空白を除去して社員マスターから照合する
 */
export function matchUserByCsvName(rawName: string, users: User[]): User | undefined {
  const cleaned = cleanNotionLinkText(rawName);
  if (!cleaned) return undefined;
  const compact = cleaned.replace(/[\s\u3000]+/g, '').toLowerCase();
  if (!compact) return undefined;

  const exact = users.find((u) => {
    const uCompact = String(u.name || '')
      .replace(/[\s\u3000]+/g, '')
      .toLowerCase();
    return uCompact === compact;
  });
  if (exact) return exact;

  return users.find((u) => {
    const uCompact = String(u.name || '')
      .replace(/[\s\u3000]+/g, '')
      .toLowerCase();
    return uCompact.length >= 2 && (uCompact.includes(compact) || compact.includes(uCompact));
  });
}

/**
 * 登録番号（例: 名古屋401 ふ976）や拠点名文字列から OfficeMaster を推測する
 */
export function inferOfficeFromText(
  rawText: string,
  offices: OfficeMaster[]
): OfficeMaster | undefined {
  const cleaned = cleanNotionLinkText(rawText);
  if (!cleaned || !offices || offices.length === 0) return undefined;

  for (const off of offices) {
    const base = String(off.name || '')
      .replace(/(支店|営業所|本社|出張所|事務所|センター)$/, '')
      .trim();
    if (base && cleaned.includes(base)) {
      return off;
    }
  }
  return undefined;
}

/**
 * PC管理CSV（Notionエクスポート形式）に合わせた標準PC項目定義
 */
export const PC_CSV_ALIGNED_FIELDS: AssetFieldDefinition[] = [
  {
    key: 'makerModel',
    label: '機種名',
    type: 'text',
    placeholder: '例: DELL Latitude 3540',
    showInList: true,
    showInMyAssets: true,
    sortOrder: 1
  },
  {
    key: 'assignedDate',
    label: '導入日',
    type: 'date',
    showInList: true,
    showInMyAssets: false,
    sortOrder: 2
  },
  {
    key: 'deviceType',
    label: 'タイプ',
    type: 'select',
    options: [
      'ノートPC',
      'デスクトップPC',
      'ミニPC',
      'サーバー',
      'FAX複合機',
      'プリンタ',
      'ネットワーク機器',
      'その他'
    ],
    showInList: true,
    showInMyAssets: true,
    sortOrder: 3
  },
  {
    key: 'os',
    label: 'OS',
    type: 'select',
    options: [
      'Win11 Pro',
      'Win11',
      'Win11 Home',
      'Windows 11 Pro',
      'Windows 11 Home',
      'Win10 Home 64bit',
      'Win10 Home 32bit',
      'Win10 Pro 64bit',
      'Win10 Pro 32bit',
      'Windows 10',
      'ChromeOS',
      'macOS',
      'その他'
    ],
    showInList: true,
    showInMyAssets: true,
    sortOrder: 4
  },
  {
    key: 'officeLicense',
    label: 'Officeライセンス',
    type: 'select',
    options: ['2024', '2021', '2019', '2016', 'オンライン', 'プリ', 'なし', 'その他'],
    showInList: true,
    showInMyAssets: false,
    sortOrder: 5
  },
  {
    key: 'cpuMemory',
    label: 'メモリ',
    type: 'text',
    placeholder: '例: 8GB / 16GB',
    showInList: true,
    showInMyAssets: false,
    sortOrder: 6
  },
  {
    key: 'storage',
    label: 'HDD',
    type: 'text',
    placeholder: '例: SSD 250GB / SSD 1TB',
    showInList: true,
    showInMyAssets: false,
    sortOrder: 7
  },
  {
    key: 'msAccount',
    label: 'MSアカウント',
    type: 'text',
    placeholder: '例: tn-example@outlook.jp',
    showInList: true,
    showInMyAssets: false,
    sortOrder: 8
  },
  {
    key: 'msPassword',
    label: 'MSパスワード',
    type: 'text',
    showInList: true,
    showInMyAssets: false,
    sortOrder: 9
  },
  {
    key: 'confirmedDate',
    label: '確認日',
    type: 'date',
    showInList: true,
    showInMyAssets: false,
    sortOrder: 10
  },
  {
    key: 'eset',
    label: 'eset',
    type: 'checkbox',
    showInList: true,
    showInMyAssets: true,
    sortOrder: 11
  },
  {
    key: 'serialNo',
    label: 'シリアルNo',
    type: 'text',
    showInList: false,
    showInMyAssets: false,
    sortOrder: 12
  },
  {
    key: 'nextCheckDate',
    label: '定期点検予定',
    type: 'date',
    showInList: false,
    showInMyAssets: true,
    alertRule: { kind: 'inspection', daysBefore: 30, label: '点検アラート' },
    sortOrder: 13
  },
  {
    key: 'leaseEndDate',
    label: 'リース満了・入替目安',
    type: 'date',
    showInList: false,
    showInMyAssets: true,
    alertRule: { kind: 'replacement', daysBefore: 180, label: '入替アラート' },
    sortOrder: 14
  }
];

/**
 * 既存のPC項目とカスタム追加項目を保持しつつ、Notion PC CSV互換の項目セットを構築する
 */
export function buildAlignedPcCategoryFields(
  existingFields: AssetFieldDefinition[] = []
): AssetFieldDefinition[] {
  const existingMap = new Map<string, AssetFieldDefinition>();
  existingFields.forEach((f) => {
    existingMap.set(f.key, f);
  });

  const merged: AssetFieldDefinition[] = PC_CSV_ALIGNED_FIELDS.map((preset) => {
    const prev = existingMap.get(preset.key);
    if (!prev) return { ...preset };
    const mergedOptions =
      preset.type === 'select'
        ? Array.from(new Set([...(preset.options || []), ...(prev.options || [])]))
        : prev.options;
    return {
      ...prev,
      ...preset,
      options: mergedOptions,
      alertRule: preset.alertRule ?? prev.alertRule
    };
  });

  const presetKeys = new Set(PC_CSV_ALIGNED_FIELDS.map((f) => f.key));
  existingFields.forEach((f) => {
    if (!presetKeys.has(f.key)) {
      merged.push({ ...f });
    }
  });

  return merged.map((f, idx) => ({ ...f, sortOrder: idx + 1 }));
}


