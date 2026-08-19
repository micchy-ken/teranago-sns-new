import * as XLSX from 'xlsx';
import { User, CalendarEvent } from '../types';

export interface InspectionItem {
  id: string;
  targetYearMonth: string; // YYYY-MM (e.g., '2026-08')

  // 基本情報 (Step 2 マッピング項目)
  jobNo: string;           // 作業No
  siteName: string;        // 現場名 -> スケジュールタイトル
  address: string;         // 住所 -> 場所
  quantity: string | number; // 台数
  customerRules: string;   // 客先規則

  // 実エクセル詳細項目
  initialDate?: string;    // エクセル内の「点検日」 (YYYY-MM-DD)
  workCategory?: string;   // 作業区分 (1, 2など)
  workName?: string;       // 作業名 (自動ドア、スポットなど)
  contractNo?: string;     // 契約No
  siteCode?: string;       // 現場コード
  area?: string;           // 地区 (岐阜県岐阜市など)
  department?: string;     // 部門 (名古屋支店など)
  excelPersonName?: string; // エクセル内の「担当者名」 (鶴見茂樹など)
  conditions?: string;     // 指定条件・警告内容など

  status: 'pending' | 'placed' | 'carried_over' | 'hidden';

  // 日付・時刻配置 (Step 3 & 4)
  assignedDate?: string;      // YYYY-MM-DD
  assignedStartTime?: string; // HH:mm
  assignedEndTime?: string;   // HH:mm

  // 担当メンバー割り当て (Step 5)
  assignedUsers?: User[];
  isConfirmed?: boolean;
  eventId?: string;
}

/** C1 セルまたは任意のセルから「YYYY-MM」形式の対象年月を推測する (例: 2026/08 -> 2026-08) */
export function extractTargetYearMonth(sheet: XLSX.WorkSheet): string {
  try {
    const candidateCells = ['C1', 'B1', 'A1', 'D1', 'C2', 'B2'];
    for (const cellKey of candidateCells) {
      const cell = sheet[cellKey];
      if (!cell) continue;

      const val = cell.v !== undefined ? cell.v : (cell.w || String(cell));
      if (typeof val === 'number') {
        // Excel日付シリアル値の場合
        const dateObj = XLSX.SSF.parse_date_code(val);
        if (dateObj && dateObj.y && dateObj.m) {
          return `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}`;
        }
      }
      const strVal = String(val);
      // '2026/08' や '2026-08' や '2026年8月' を正規表現で抽出
      const match = strVal.match(/(\d{4})[年/.-]\s*(\d{1,2})/);
      if (match) {
        const year = match[1];
        const month = String(parseInt(match[2], 10)).padStart(2, '0');
        return `${year}-${month}`;
      }
    }
  } catch (err) {
    console.warn('Failed to parse C1 date:', err);
  }

  // デフォルトは 2026-08 または当月
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Excel日付シリアル値または文字列を YYYY-MM-DD 形式に変換するヘルパー */
function formatExcelDate(cellVal: any): string | undefined {
  if (!cellVal) return undefined;
  if (typeof cellVal === 'number') {
    const dateObj = XLSX.SSF.parse_date_code(cellVal);
    if (dateObj && dateObj.y && dateObj.m && dateObj.d) {
      return `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}-${String(dateObj.d).padStart(2, '0')}`;
    }
  }
  const str = String(cellVal).trim();
  const match = str.match(/(\d{4})[年/.-]\s*(\d{1,2})[月/.-]\s*(\d{1,2})/);
  if (match) {
    return `${match[1]}-${String(parseInt(match[2], 10)).padStart(2, '0')}-${String(parseInt(match[3], 10)).padStart(2, '0')}`;
  }
  return undefined;
}

/** Excelファイルを読み込んで InspectionItem 配列を生成する */
export function parseInspectionExcel(
  fileBuffer: ArrayBuffer,
  allUsers: User[] = []
): {
  targetYearMonth: string;
  items: InspectionItem[];
  error?: string;
} {
  try {
    const workbook = XLSX.read(fileBuffer, { type: 'array', cellDates: true, cellStyles: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      return { targetYearMonth: '', items: [], error: 'Excelファイル内にシートが見つかりません。' };
    }

    const sheet = workbook.Sheets[firstSheetName];
    const targetYearMonth = extractTargetYearMonth(sheet);

    // シートデータを全行配列に変換
    const rawData = XLSX.utils.sheet_to_json<any[]>(sheet, { header: 1, defval: '' });
    if (!rawData || rawData.length === 0) {
      return { targetYearMonth, items: [], error: 'シートにデータが存在しません。' };
    }

    // ヘッダー行を探す（「現場名」または「作業No」が含まれる行を探す）
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(15, rawData.length); i++) {
      const row = rawData[i];
      if (Array.isArray(row) && row.some((cell) => {
        const s = String(cell).trim();
        return s === '現場名' || s === '作業No' || s === '現場コード';
      })) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      headerRowIndex = rawData.length > 4 ? 4 : 0;
    }

    const headers = (rawData[headerRowIndex] as any[]).map((h) => String(h || '').trim());
    
    // 各項目の列インデックスを特定
    const findCol = (keywords: string[]): number => {
      return headers.findIndex((h) => keywords.some((kw) => h === kw || h.includes(kw)));
    };

    const jobNoCol = findCol(['作業No', '作業番号']);
    const dateCol = findCol(['点検日']);
    const workCatCol = findCol(['作業区分']);
    const workNameCol = findCol(['作業名']);
    const contractNoCol = findCol(['契約No']);
    const siteCodeCol = findCol(['現場コード']);
    const siteCol = findCol(['現場名', '現場']);
    const areaCol = findCol(['地区']);
    const addrCol = findCol(['住所', '所在地']);
    const qtyCol = findCol(['台数', '数量']);
    const rulesCol = findCol(['客先規則', '規則']);
    const cond1Col = findCol(['指定条件1']);
    const cond2Col = findCol(['指定条件2']);
    const warnCol = findCol(['警告内容']);
    const deptCol = findCol(['部門', '部門名']);
    const personCol = findCol(['担当者名', '担当者']);

    const items: InspectionItem[] = [];

    // データ行を順次パース
    for (let r = headerRowIndex + 1; r < rawData.length; r++) {
      const row = rawData[r] as any[];
      if (!row || row.length === 0) continue;

      const jobNo = jobNoCol !== -1 && row[jobNoCol] !== undefined ? String(row[jobNoCol]).trim() : '';
      const siteName = siteCol !== -1 && row[siteCol] !== undefined ? String(row[siteCol]).trim() : '';
      const address = addrCol !== -1 && row[addrCol] !== undefined ? String(row[addrCol]).trim() : '';
      const quantity = qtyCol !== -1 && row[qtyCol] !== undefined ? String(row[qtyCol]).trim() : '1';
      const customerRules = rulesCol !== -1 && row[rulesCol] !== undefined ? String(row[rulesCol]).trim() : '';

      // 空行スキップ（現場名も作業Noもない行）
      if (!siteName && !jobNo) continue;

      const initialDate = dateCol !== -1 ? formatExcelDate(row[dateCol]) : undefined;
      const workCategory = workCatCol !== -1 && row[workCatCol] !== undefined ? String(row[workCatCol]).trim() : undefined;
      const workName = workNameCol !== -1 && row[workNameCol] !== undefined ? String(row[workNameCol]).trim() : undefined;
      const contractNo = contractNoCol !== -1 && row[contractNoCol] !== undefined ? String(row[contractNoCol]).trim() : undefined;
      const siteCode = siteCodeCol !== -1 && row[siteCodeCol] !== undefined ? String(row[siteCodeCol]).trim() : undefined;
      const area = areaCol !== -1 && row[areaCol] !== undefined ? String(row[areaCol]).trim() : undefined;
      const department = deptCol !== -1 && row[deptCol] !== undefined ? String(row[deptCol]).trim() : undefined;
      const excelPersonName = personCol !== -1 && row[personCol] !== undefined ? String(row[personCol]).trim() : undefined;

      const condList = [
        cond1Col !== -1 && row[cond1Col] ? `指定1:${row[cond1Col]}` : '',
        cond2Col !== -1 && row[cond2Col] ? `指定2:${row[cond2Col]}` : '',
        warnCol !== -1 && row[warnCol] ? `警告:${row[warnCol]}` : '',
      ].filter(Boolean).join(' / ');

      // エクセル内の担当者名（例: 鶴見茂樹）とユーザーリストを自動マッチング
      let assignedUsers: User[] | undefined = undefined;
      if (excelPersonName && excelPersonName !== '.' && allUsers.length > 0) {
        const cleanName = excelPersonName.replace(/\s+/g, '');
        const matched = allUsers.filter((u) => {
          const uClean = u.name.replace(/\s+/g, '');
          return uClean === cleanName || uClean.includes(cleanName) || cleanName.includes(uClean);
        });
        if (matched.length > 0) {
          assignedUsers = matched;
        }
      }

      items.push({
        id: `insp_${Date.now()}_${r}_${Math.random().toString(36).substring(2, 7)}`,
        targetYearMonth,
        siteName: siteName || (siteCode ? `現場(${siteCode})` : `現場 ${r}`),
        address: address || '住所未設定',
        jobNo: jobNo || `W-${1000 + r}`,
        quantity: quantity || 1,
        customerRules: customerRules || 'なし',
        workCategory,
        workName,
        contractNo,
        siteCode,
        area,
        department,
        excelPersonName: excelPersonName !== '.' ? excelPersonName : undefined,
        conditions: condList || undefined,
        initialDate,
        assignedUsers,
        status: 'pending',
      });
    }

    return { targetYearMonth, items };
  } catch (err: any) {
    console.error('Failed to parse Excel file:', err);
    return { targetYearMonth: '', items: [], error: 'Excelファイルの読み込みに失敗しました: ' + (err.message || '') };
  }
}

/** 実データと同じ26列フォーマットのサンプルExcelファイルを生成・ダウンロードする */
export function generateSampleInspectionExcel(targetYearMonth: string = '2026-08') {
  const [yearStr, monthStr] = targetYearMonth.split('-');
  const displayYearMonth = `${yearStr}/${monthStr.padStart(2, '0')}`;

  const headers = [
    '作業No', '点検日', '開始時間', '終了時間', '作業区分', '作業名', '契約No', '現場コード', '現場名',
    '地区', '住所', '台数', '客先規則', '指定条件1', '指定条件2', '警告内容', '調整内容',
    '確定', '複数人現場', '部門コード', '部門', '協力会社コード', '協力会社', '担当者コード', '担当者名', 'その他担当者'
  ];

  const wsData: any[][] = [
    ['', '点検月', displayYearMonth], // Row 1: B1: 点検月, C1: 2026/08
    [],
    [],
    [],
    headers, // Row 5: 26列ヘッダー
    ['01287504', '2026/08/01', '', '', '2', 'スポット', '00001505', '015150', '●ボヌール六条南', '岐阜県岐阜市', '岐阜県岐阜市六条南1丁目8-11', '1', 'スポット 点検先(いつも21,000円)', '', '', '', '', '確定', '', 'T0701', '名古屋支店', '', '', '00308', '.', ''],
    ['01287504', '', '', '', '1', '自動ドア', '00001505', '015150', '●ボヌール六条南', '岐阜県岐阜市', '岐阜県岐阜市六条南1丁目8-11', '1', 'スポット 点検先(いつも21,000円)', '', '', '', '', '', '', 'T0701', '名古屋支店', '', '', '00246', '鶴見茂樹', ''],
    ['01287505', '2026/08/01', '', '', '1', '自動ドア', '00000971', '013925', 'サンプレミアム', '岐阜県岐阜市', '岐阜県岐阜市吉野町4丁目21番地', '1', 'かんぜん委託(今月行って下さい)', '', '', '', '', '確定', '', 'T0701', '名古屋支店', '', '', '00246', '鶴見茂樹', ''],
    ['01287508', '2026/08/01', '', '', '1', '自動ドア', '00001262', '112211', '岐阜スカイウイング３７', '岐阜県岐阜市', '岐阜県岐阜市吉野町6丁目31', '3', '作業届2か所に送る(現地・ハイ)', '', '', '', '', '確定', '', 'T0701', '名古屋支店', '', '', '00308', '.', ''],
    ['01287506', '2026/08/01', '', '', '1', '自動ドア', '00001174', '112211', '岐阜スカイウイング３７', '岐阜県岐阜市', '岐阜県岐阜市吉野町6丁目31', '4', '貼紙FAX', '', '', '', '', '確定', '', 'T0701', '名古屋支店', '', '', '00246', '鶴見茂樹', ''],
    ['01287510', '2026/08/02', '', '', '1', '自動ドア', '00001880', '016520', '名駅セントラルタワー', '愛知県名古屋市', '愛知県名古屋市中村区名駅1-1-4', '12', 'ヘルメット着用、17時撤収厳守', '', '', '', '', '確定', '', 'T0701', '名古屋支店', '', '', '00101', '山田太郎', ''],
    ['01287512', '2026/08/03', '', '', '1', '自動ドア', '00002100', '017830', '栄スクエアモール', '愛知県名古屋市', '愛知県名古屋市中区栄3-5-1', '8', '入館時防災センターにて手続き', '', '', '', '', '確定', '', 'T0701', '名古屋支店', '', '', '00102', '鈴木一郎', ''],
    ['01287515', '2026/08/04', '', '', '2', 'スポット', '00002340', '018900', '伏見ファーストプラザ', '愛知県名古屋市', '愛知県名古屋市中区錦2-12-8', '5', 'エレベーター使用時養生必須', '', '', '', '', '', '', 'T0701', '名古屋支店', '', '', '00246', '鶴見茂樹', ''],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);

  ws['!cols'] = [
    { wch: 12 }, // 作業No
    { wch: 12 }, // 点検日
    { wch: 10 }, // 開始時間
    { wch: 10 }, // 終了時間
    { wch: 10 }, // 作業区分
    { wch: 12 }, // 作業名
    { wch: 12 }, // 契約No
    { wch: 12 }, // 現場コード
    { wch: 26 }, // 現場名
    { wch: 16 }, // 地区
    { wch: 36 }, // 住所
    { wch: 6 },  // 台数
    { wch: 34 }, // 客先規則
    { wch: 12 }, // 指定条件1
    { wch: 12 }, // 指定条件2
    { wch: 12 }, // 警告内容
    { wch: 12 }, // 調整内容
    { wch: 8 },  // 確定
    { wch: 12 }, // 複数人現場
    { wch: 10 }, // 部門コード
    { wch: 14 }, // 部門
    { wch: 14 }, // 協力会社コード
    { wch: 14 }, // 協力会社
    { wch: 12 }, // 担当者コード
    { wch: 14 }, // 担当者名
    { wch: 14 }, // その他担当者
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '点検予定リスト');
  XLSX.writeFile(wb, `点検月_${targetYearMonth.replace('-', '_')}.xlsx`);
}

/** 実画像通りのデモデータを生成する */
export function generateDemoInspectionItems(targetYearMonth: string = '2026-08', allUsers: User[] = []): InspectionItem[] {
  const sampleRows = [
    { jobNo: '01287504', siteName: '●ボヌール六条南', siteCode: '015150', contractNo: '00001505', workCategory: '2', workName: 'スポット', area: '岐阜県岐阜市', address: '岐阜県岐阜市六条南1丁目8-11', quantity: '1', customerRules: 'スポット 点検先(いつも21,000円)', department: '名古屋支店', excelPersonName: '鶴見茂樹' },
    { jobNo: '01287505', siteName: 'サンプレミアム', siteCode: '013925', contractNo: '00000971', workCategory: '1', workName: '自動ドア', area: '岐阜県岐阜市', address: '岐阜県岐阜市吉野町4丁目21番地', quantity: '1', customerRules: 'かんぜん委託(今月行って下さい)', department: '名古屋支店', excelPersonName: '鶴見茂樹' },
    { jobNo: '01287508', siteName: '岐阜スカイウイング３７', siteCode: '112211', contractNo: '00001262', workCategory: '1', workName: '自動ドア', area: '岐阜県岐阜市', address: '岐阜県岐阜市吉野町6丁目31', quantity: '3', customerRules: '作業届2か所に送る(現地・ハイ)', department: '名古屋支店', excelPersonName: '鶴見茂樹' },
    { jobNo: '01287506', siteName: '岐阜スカイウイング３７', siteCode: '112211', contractNo: '00001174', workCategory: '1', workName: '自動ドア', area: '岐阜県岐阜市', address: '岐阜県岐阜市吉野町6丁目31', quantity: '4', customerRules: '貼紙FAX', department: '名古屋支店', excelPersonName: '鶴見茂樹' },
    { jobNo: '01287510', siteName: '名駅セントラルタワー', siteCode: '016520', contractNo: '00001880', workCategory: '1', workName: '自動ドア', area: '愛知県名古屋市', address: '愛知県名古屋市中村区名駅1-1-4', quantity: '12', customerRules: 'ヘルメット着用、17時撤収厳守', department: '名古屋支店', excelPersonName: '山田太郎' },
    { jobNo: '01287512', siteName: '栄スクエアモール', siteCode: '017830', contractNo: '00002100', workCategory: '1', workName: '自動ドア', area: '愛知県名古屋市', address: '愛知県名古屋市中区栄3-5-1', quantity: '8', customerRules: '入館時防災センターにて手続き必要', department: '名古屋支店', excelPersonName: '鈴木一郎' },
    { jobNo: '01287515', siteName: '伏見ファーストプラザ', siteCode: '018900', contractNo: '00002340', workCategory: '2', workName: 'スポット', area: '愛知県名古屋市', address: '愛知県名古屋市中区錦2-12-8', quantity: '5', customerRules: 'エレベーター使用時養生必須', department: '名古屋支店', excelPersonName: '鶴見茂樹' },
    { jobNo: '01287518', siteName: '千種ガーデンハイツ', siteCode: '019440', contractNo: '00002560', workCategory: '1', workName: '自動ドア', area: '愛知県名古屋市', address: '愛知県名古屋市千種区葵3-15-22', quantity: '16', customerRules: '住人に事前チラシ配布済み', department: '名古屋支店', excelPersonName: '山田太郎' },
  ];

  return sampleRows.map((item, idx) => {
    let assignedUsers: User[] | undefined = undefined;
    if (item.excelPersonName && allUsers.length > 0) {
      const matched = allUsers.filter((u) => u.name.includes(item.excelPersonName));
      if (matched.length > 0) assignedUsers = matched;
    }

    return {
      id: `demo_${Date.now()}_${idx}`,
      targetYearMonth,
      siteName: item.siteName,
      address: item.address,
      jobNo: item.jobNo,
      quantity: item.quantity,
      customerRules: item.customerRules,
      workCategory: item.workCategory,
      workName: item.workName,
      contractNo: item.contractNo,
      siteCode: item.siteCode,
      area: item.area,
      department: item.department,
      excelPersonName: item.excelPersonName,
      assignedUsers,
      status: 'pending',
    };
  });
}
