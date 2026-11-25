import * as pdfjsLib from 'pdfjs-dist';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { CrmInspectionData, CrmImportedDoor } from '../types/inspectionReport';

let workerInitialized = false;

function ensurePdfWorker(): void {
  if (workerInitialized) return;
  if (typeof window !== 'undefined' && pdfWorkerUrl) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  }
  workerInitialized = true;
}

/**
 * 全角英数字・記号を半角に正規化
 */
export function toHalfWidthAscii(str: string): string {
  return (str || '').replace(/[！-～]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0)
  );
}

/**
 * 作業Noの比較用正規化（全角→半角、空白除去、先頭ゼロ除去）
 * 例: "01296500" / "1296500" / "０１２９６５００" -> すべて "1296500"
 */
export function normalizeJobNo(raw?: string | number | null): string {
  if (raw === null || raw === undefined) return '';
  const cleaned = toHalfWidthAscii(String(raw)).replace(/[\s\u3000]/g, '').trim();
  if (!cleaned) return '';
  if (/^\d+$/.test(cleaned)) {
    const stripped = cleaned.replace(/^0+/, '');
    return stripped || '0';
  }
  return cleaned.toUpperCase();
}

/**
 * ゼロ埋め有無を吸収した作業No一致判定
 */
export function isSameJobNo(a?: string | number | null, b?: string | number | null): boolean {
  const na = normalizeJobNo(a);
  const nb = normalizeJobNo(b);
  return Boolean(na && nb && na === nb);
}

/**
 * PDF抽出用のテキストアイテム最小構造
 */
export interface PdfPositionedTextItem {
  str: string;
  x: number;
  y: number;
  width: number;
}

/**
 * 座標付きテキスト配列をX順に並べて自然に結合する
 * - 文字間ギャップが大きい場合（例: 「風除室」と「外側」）は半角スペースで結合
 * - 隣接する分割文字はスペースなしで結合
 */
function joinTextRuns(items: PdfPositionedTextItem[], options?: { forceNoSpace?: boolean }): string {
  if (items.length === 0) return '';
  const sorted = [...items].sort((a, b) => a.x - b.x);
  if (options?.forceNoSpace) {
    return sorted
      .map((it) => it.str.trim())
      .filter(Boolean)
      .join('');
  }

  let out = '';
  let prevEnd = -Infinity;
  for (const item of sorted) {
    const text = item.str.trim();
    if (!text) continue;
    if (out.length > 0) {
      const gap = item.x - prevEnd;
      if (gap > 2.5) {
        out += ' ';
      }
    }
    out += text;
    prevEnd = item.x + Math.max(item.width || 0, 0);
  }
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * お客様名の正規化（先頭の「●」や末尾の敬称「御中」「様」を整形）
 */
function cleanCustomerName(raw: string): string {
  return (raw || '')
    .replace(/^[●・\s　]+/, '')
    .replace(/[\s　]*(御中|様)\s*$/, '')
    .trim();
}

/**
 * CRM点検報告書（5台以下・1ページ1作業Noフォーマット）の単一ページから座標ベースで構造化データを抽出
 *
 * 実測基準座標（A4縦 595 x 842pt, 原点左下）:
 * - お客様名:   y ≈ 726.9, x < 350
 * - ご住所:     y ≈ 700.9, x < 350
 * - 契約種別:   y ≈ 696.4, 350 <= x < 460
 * - 電話番号:   y ≈ 676.9, x < 260
 * - 総台数:     y ≈ 675.4, x >= 470
 * - 作業No:     y ≈ 652.4, x < 220
 * - 対象年月:   y ≈ 638.4, x < 220
 * - 扉5列(72pt等間隔): Col1:[175,250) Col2:[250,322) Col3:[322,394) Col4:[394,466) Col5:[466,560)
 *   - 物件No:   y ≈ 562.4 (556 <= y <= 570)
 *   - 設置場所: y ≈ 550.4 (544 <= y < 556)
 *   - 型式:     y ≈ 538.4 (531 <= y < 544)
 */
export function extractCrmInspectionFromPageItems(
  items: PdfPositionedTextItem[],
  importedAtIso: string
): CrmInspectionData | null {
  const validItems = items.filter((it) => it.str && it.str.trim().length > 0);
  if (validItems.length === 0) return null;

  const pickBand = (yMin: number, yMax: number, xMin: number, xMax: number) =>
    validItems.filter((it) => it.y >= yMin && it.y < yMax && it.x >= xMin && it.x < xMax);

  const rawJobNo = joinTextRuns(pickBand(646, 661, 0, 220), { forceNoSpace: true });
  const jobNo = toHalfWidthAscii(rawJobNo).replace(/[\s\u3000]/g, '').trim();
  if (!jobNo) return null;

  const rawYearMonth = joinTextRuns(pickBand(630, 646, 0, 220), { forceNoSpace: true });
  const yearMonth = toHalfWidthAscii(rawYearMonth).replace(/[^\d]/g, '').slice(0, 6);

  const rawCustomer = joinTextRuns(pickBand(718, 738, 0, 350));
  const customerName = cleanCustomerName(rawCustomer);

  const address = joinTextRuns(pickBand(694, 714, 0, 350));
  const contractType = toHalfWidthAscii(joinTextRuns(pickBand(688, 712, 350, 465), { forceNoSpace: true }));
  const phone = toHalfWidthAscii(joinTextRuns(pickBand(668, 688, 0, 260), { forceNoSpace: true }));

  const rawCount = toHalfWidthAscii(joinTextRuns(pickBand(666, 688, 465, 595), { forceNoSpace: true }));
  const parsedCount = parseInt(rawCount.replace(/[^\d]/g, ''), 10);

  // 扉テーブル5列（実測 x=187, 259, 331, 403, 475 / 72ptピッチ）
  const columnRanges: Array<[number, number]> = [
    [175, 250],
    [250, 322],
    [322, 394],
    [394, 466],
    [466, 565],
  ];

  const doors: CrmImportedDoor[] = [];
  for (const [xMin, xMax] of columnRanges) {
    const doorNumber = toHalfWidthAscii(
      joinTextRuns(pickBand(556, 571, xMin, xMax), { forceNoSpace: true })
    ).trim();
    const location = joinTextRuns(pickBand(544, 556, xMin, xMax)).trim();
    const model = toHalfWidthAscii(
      joinTextRuns(pickBand(530, 544, xMin, xMax))
    ).trim();

    if (doorNumber || location || model) {
      doors.push({
        doorIndex: doors.length + 1,
        doorNumber,
        location,
        model,
      });
    }
  }

  const totalDoorsCount = Math.max(
    Number.isFinite(parsedCount) && parsedCount > 0 ? parsedCount : 0,
    doors.length,
    1
  );

  return {
    jobNo,
    yearMonth,
    customerName: customerName || `現場 (${jobNo})`,
    address,
    phone: phone || undefined,
    contractType: contractType || undefined,
    totalDoorsCount,
    doors,
    importedAt: importedAtIso,
  };
}

export interface CrmPdfParseResult {
  items: CrmInspectionData[];
  totalPages: number;
  skippedPages: number[];
  detectedYearMonths: string[];
  totalDoors: number;
}

/**
 * ブラウザ上で CRM 点検報告書 PDF（5台以下帳票）を解析し CrmInspectionData[] を生成
 */
export async function parseCrmInspectionPdf(
  source: File | ArrayBuffer | Uint8Array,
  options?: { cMapUrl?: string; disableWorker?: boolean }
): Promise<CrmPdfParseResult> {
  if (!options?.disableWorker) {
    ensurePdfWorker();
  }

  let data: Uint8Array;
  if (source instanceof Uint8Array) {
    data = source;
  } else if (source instanceof ArrayBuffer) {
    data = new Uint8Array(source);
  } else {
    const buf = await source.arrayBuffer();
    data = new Uint8Array(buf);
  }

  const baseUrl =
    typeof import.meta !== 'undefined' && (import.meta as any).env?.BASE_URL
      ? String((import.meta as any).env.BASE_URL)
      : '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const cMapUrl = options?.cMapUrl || `${normalizedBase}pdfjs/cmaps/`;

  const loadingTask = pdfjsLib.getDocument({
    data,
    cMapUrl,
    cMapPacked: true,
    useSystemFonts: true,
  });

  const pdfDoc = await loadingTask.promise;
  const importedAtIso = new Date().toISOString();
  const byJobNo = new Map<string, CrmInspectionData>();
  const skippedPages: number[] = [];
  const ymSet = new Set<string>();

  try {
    for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
      const page = await pdfDoc.getPage(pageNum);
      const textContent = await page.getTextContent();
      const positioned: PdfPositionedTextItem[] = [];

      for (const rawItem of textContent.items) {
        if (!('str' in rawItem) || !rawItem.str || !rawItem.str.trim()) continue;
        const transform = rawItem.transform || [1, 0, 0, 1, 0, 0];
        positioned.push({
          str: rawItem.str,
          x: Number(transform[4]) || 0,
          y: Number(transform[5]) || 0,
          width: Number(rawItem.width) || 0,
        });
      }

      const extracted = extractCrmInspectionFromPageItems(positioned, importedAtIso);
      if (extracted) {
        const key = normalizeJobNo(extracted.jobNo);
        byJobNo.set(key, extracted);
        if (extracted.yearMonth) {
          ymSet.add(extracted.yearMonth);
        }
      } else {
        skippedPages.push(pageNum);
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  const items = Array.from(byJobNo.values());
  const totalDoors = items.reduce((sum, it) => sum + (it.doors?.length || 0), 0);

  return {
    items,
    totalPages: pdfDoc.numPages,
    skippedPages,
    detectedYearMonths: Array.from(ymSet).sort(),
    totalDoors,
  };
}

/**
 * 複数の CRM 点検報告書 PDF をまとめて解析・統合（同一作業Noは後勝ちで重複排除）
 */
export async function parseMultipleCrmInspectionPdfs(files: File[]): Promise<CrmPdfParseResult> {
  const merged = new Map<string, CrmInspectionData>();
  const ymSet = new Set<string>();
  const skippedPages: number[] = [];
  let totalPages = 0;

  for (const file of files) {
    const res = await parseCrmInspectionPdf(file);
    totalPages += res.totalPages;
    res.skippedPages.forEach((p) => skippedPages.push(p));
    res.detectedYearMonths.forEach((ym) => ymSet.add(ym));
    res.items.forEach((item) => {
      merged.set(normalizeJobNo(item.jobNo), item);
    });
  }

  const items = Array.from(merged.values());
  const totalDoors = items.reduce((sum, it) => sum + (it.doors?.length || 0), 0);

  return {
    items,
    totalPages,
    skippedPages,
    detectedYearMonths: Array.from(ymSet).sort(),
    totalDoors,
  };
}
