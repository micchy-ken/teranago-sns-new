import { SiteMainPart } from '../types/site';

/**
 * 主要部品の建具番号（例: "AD1", "W-1", "SD-1", "1" 等）を解決するユーティリティ
 */
export function getFittingLabel(
  part: Partial<SiteMainPart> & { tateguNo?: string; 建具番号?: string },
  idx: number,
  totalEgCount: number = 1
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

