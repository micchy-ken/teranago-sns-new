import * as XLSX from 'xlsx';
import { User, CalendarEvent } from '../types';

export interface InspectionItem {
  id: string;
  targetYearMonth: string; // YYYY-MM (e.g., '2026-09')
  siteName: string;        // 現場名 -> スケジュールタイトル
  address: string;         // 住所 -> 場所
  jobNo: string;           // 作業No
  quantity: string | number; // 台数
  customerRules: string;   // 客先規則

  status: 'pending' | 'placed' | 'carried_over' | 'hidden';

  // 日付・時刻配置
  assignedDate?: string;      // YYYY-MM-DD
  assignedStartTime?: string; // HH:mm
  assignedEndTime?: string;   // HH:mm

  // 担当メンバー割り当て
  assignedUsers?: User[];
  isConfirmed?: boolean;
  eventId?: string;
}

/** C1 セルまたは任意のセルから「YYYY-MM」形式の対象年月を推測する */
export function extractTargetYearMonth(sheet: XLSX.WorkSheet): string {
  try {
    const c1Cell = sheet['C1'] || sheet['A1'] || sheet['B1'];
    if (c1Cell) {
      const val = c1Cell.v || c1Cell.w || String(c1Cell);
      if (typeof val === 'number') {
        // Excel日付シリアル値の場合
        const dateObj = XLSX.SSF.parse_date_code(val);
        if (dateObj && dateObj.y && dateObj.m) {
          return `${dateObj.y}-${String(dateObj.m).padStart(2, '0')}`;
        }
      }
      const strVal = String(val);
      // '2026年9月' や '2026/09' や '2026-09' を正規表現で抽出
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

  // デフォルトは翌月または当月
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
}

/** Excelファイルを読み込んで InspectionItem 配列を生成する */
export function parseInspectionExcel(fileBuffer: ArrayBuffer): {
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

    // シートデータをJSON配列に変換 (ヘッダー自動識別)
    const rawData = XLSX.utils.sheet_to_json<Record<string, any>>(sheet, { header: 1, defval: '' });
    if (!rawData || rawData.length === 0) {
      return { targetYearMonth, items: [], error: 'シートにデータが存在しません。' };
    }

    // ヘッダー行を探す（「現場名」が含まれる行を探す）
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(10, rawData.length); i++) {
      const row = rawData[i];
      if (Array.isArray(row) && row.some((cell) => String(cell).includes('現場') || String(cell).includes('現場名'))) {
        headerRowIndex = i;
        break;
      }
    }

    if (headerRowIndex === -1) {
      // 見つからなければ 1行目（index 1）または 0行目を仮定
      headerRowIndex = rawData.length > 1 ? 1 : 0;
    }

    const headers = rawData[headerRowIndex] as string[];
    
    // 各項目のカラムインデックスを探す
    const findCol = (keywords: string[]): number => {
      return headers.findIndex((h) => keywords.some((kw) => String(h).trim().includes(kw)));
    };

    const siteCol = findCol(['現場名', '現場', '物件名', '名称']);
    const addrCol = findCol(['住所', '所在地', '場所', '住所名']);
    const jobNoCol = findCol(['作業No', '作業番号', 'No', 'ナンバー', '管理番号']);
    const qtyCol = findCol(['台数', '数量', '点検台数']);
    const rulesCol = findCol(['客先規則', '規則', '注意事項', '特記事項', '備考']);

    const items: InspectionItem[] = [];

    // データ行を処理
    for (let r = headerRowIndex + 1; r < rawData.length; r++) {
      const row = rawData[r] as any[];
      if (!row || row.length === 0) continue;

      const siteName = siteCol !== -1 && row[siteCol] ? String(row[siteCol]).trim() : '';
      const address = addrCol !== -1 && row[addrCol] ? String(row[addrCol]).trim() : '';
      const jobNo = jobNoCol !== -1 && row[jobNoCol] ? String(row[jobNoCol]).trim() : '';
      const quantity = qtyCol !== -1 && row[qtyCol] ? String(row[qtyCol]).trim() : '';
      const customerRules = rulesCol !== -1 && row[rulesCol] ? String(row[rulesCol]).trim() : '';

      // 空行スキップ（現場名も作業Noもない場合）
      if (!siteName && !jobNo) continue;

      items.push({
        id: `insp_${Date.now()}_${r}_${Math.random().toString(36).substring(2, 7)}`,
        targetYearMonth,
        siteName: siteName || `現場 ${r}`,
        address: address || '住所未設定',
        jobNo: jobNo || `W-${1000 + r}`,
        quantity: quantity || 1,
        customerRules: customerRules || 'なし',
        status: 'pending',
      });
    }

    return { targetYearMonth, items };
  } catch (err: any) {
    console.error('Failed to parse Excel file:', err);
    return { targetYearMonth: '', items: [], error: 'Excelファイルの読み込みに失敗しました: ' + (err.message || '') };
  }
}

/** サンプルExcelファイルを生成・ダウンロードする */
export function generateSampleInspectionExcel(targetYearMonth: string = '2026-09') {
  const [yearStr, monthStr] = targetYearMonth.split('-');
  const displayYearMonth = `${yearStr}年${parseInt(monthStr, 10)}月`;

  // ワークシート作成
  const wsData = [
    ['区分', '点検予定', displayYearMonth, '', ''], // A1, B1, C1 (C1に年月が入る)
    ['作業No', '現場名', '住所', '台数', '客先規則'], // ヘッダー行
    ['JOB-202609-01', '名駅タワービル', '愛知県名古屋市中村区名駅1-1-4', '12台', '作業前ヘルメット着用、17時撤収厳守'],
    ['JOB-202609-02', '栄スクエアモール', '愛知県名古屋市中区栄3-5-1', '8台', '入館時防災センターにて手続き必要'],
    ['JOB-202609-03', '伏見ファーストプラザ', '愛知県名古屋市中区錦2-12-8', '5台', 'エレベーター使用時養生必須'],
    ['JOB-202609-04', '千種ガーデンハイツ', '愛知県名古屋市千種区葵3-15-22', '16台', '住人に事前チラシ配布済み'],
    ['JOB-202609-05', '金山ステーションビル', '愛知県名古屋市熱田区金山1-1-1', '20台', '夜間作業不可（9:00〜17:00のみ）'],
    ['JOB-202609-06', '豊田セントラルシティ', '愛知県豊田市喜多町2-160', '15台', '駐車許可証受領必要'],
    ['JOB-202609-07', '岡崎グランドタワー', '愛知県岡崎市康生通西2-20', '10台', '鍵は管理人室にて受領'],
    ['JOB-202609-08', '一宮レジデンスイースト', '愛知県一宮市栄3-1-2', '6台', '管理組合立ち合いあり'],
    ['JOB-202609-09', '春日井サウススクエア', '愛知県春日井市鳥居松町5-31', '9台', '騒音工事規制あり'],
    ['JOB-202609-10', '刈谷テクノパーク', '愛知県刈谷市相生町1-1', '24台', '安全靴・安全帯持参必須'],
  ];

  const ws = XLSX.utils.aoa_to_sheet(wsData);
  
  // カラム幅の調整
  ws['!cols'] = [
    { wch: 18 }, // 作業No
    { wch: 25 }, // 現場名
    { wch: 35 }, // 住所
    { wch: 10 }, // 台数
    { wch: 35 }, // 客先規則
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '点検予定リスト');

  // Excelファイル書き出し
  XLSX.writeFile(wb, `点検予定表_${targetYearMonth}.xlsx`);
}

/** 即時テスト用のデモデータを生成する */
export function generateDemoInspectionItems(targetYearMonth: string = '2026-09'): InspectionItem[] {
  const sampleSites = [
    { siteName: '名駅タワービル', address: '愛知県名古屋市中村区名駅1-1-4', jobNo: 'JOB-202609-01', quantity: '12台', customerRules: '作業前ヘルメット着用、17時撤収厳守' },
    { siteName: '栄スクエアモール', address: '愛知県名古屋市中区栄3-5-1', jobNo: 'JOB-202609-02', quantity: '8台', customerRules: '入館時防災センターにて手続き必要' },
    { siteName: '伏見ファーストプラザ', address: '愛知県名古屋市中区錦2-12-8', jobNo: 'JOB-202609-03', quantity: '5台', customerRules: 'エレベーター使用時養生必須' },
    { siteName: '千種ガーデンハイツ', address: '愛知県名古屋市千種区葵3-15-22', jobNo: 'JOB-202609-04', quantity: '16台', customerRules: '住人に事前チラシ配布済み' },
    { siteName: '金山ステーションビル', address: '愛知県名古屋市熱田区金山1-1-1', jobNo: 'JOB-202609-05', quantity: '20台', customerRules: '夜間作業不可（9:00〜17:00のみ）' },
    { siteName: '豊田セントラルシティ', address: '愛知県豊田市喜多町2-160', jobNo: 'JOB-202609-06', quantity: '15台', customerRules: '駐車許可証受領必要' },
    { siteName: '岡崎グランドタワー', address: '愛知県岡崎市康生通西2-20', jobNo: 'JOB-202609-07', quantity: '10台', customerRules: '鍵は管理人室にて受領' },
    { siteName: '一宮レジデンスイースト', address: '愛知県一宮市栄3-1-2', jobNo: 'JOB-202609-08', quantity: '6台', customerRules: '管理組合立ち合いあり' },
    { siteName: '春日井サウススクエア', address: '愛知県春日井市鳥居松町5-31', jobNo: 'JOB-202609-09', quantity: '9台', customerRules: '騒音工事規制あり' },
    { siteName: '刈谷テクノパーク', address: '愛知県刈谷市相生町1-1', jobNo: 'JOB-202609-10', quantity: '24台', customerRules: '安全靴・安全帯持参必須' },
    { siteName: '安城ロイヤルコート', address: '愛知県安城市三河安城町1-9-2', jobNo: 'JOB-202609-11', quantity: '7台', customerRules: '火災報知器テスト事前連絡必要' },
    { siteName: '四日市ベイサイドレジデンス', address: '三重県四日市市安島1-3-31', jobNo: 'JOB-202609-12', quantity: '14台', customerRules: '防災訓練と合同点検' },
    { siteName: '岐阜駅前プレイス', address: '岐阜県岐阜市橋本町1-10', jobNo: 'JOB-202609-13', quantity: '11台', customerRules: '地下駐車場車高制限2.1m' },
    { siteName: '大垣ロジスティクス', address: '岐阜県大垣市加賀野4-1-7', jobNo: 'JOB-202609-14', quantity: '30台', customerRules: '入門カード発行に免許証提示' },
  ];

  return sampleSites.map((item, idx) => ({
    id: `demo_${Date.now()}_${idx}`,
    targetYearMonth,
    siteName: item.siteName,
    address: item.address,
    jobNo: item.jobNo,
    quantity: item.quantity,
    customerRules: item.customerRules,
    status: 'pending',
  }));
}
