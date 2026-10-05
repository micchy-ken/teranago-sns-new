export type PhotoReportLayoutType = '3_items' | '2_items' | '4_items';

export interface PhotoReportItem {
  id: string;
  imageUrl: string;
  buildingName: string;   // 現場名 (例: 名古屋プライムセントラルタワー)
  location: string;       // 取付場所 (例: 1階HUG北側)
  workSubject: string;    // 件名 (例: 自動ドア補助センサー修理)
  workDate: string;       // 実施日 (例: 2026年9月18日)
  stageTitle: string;     // 工程・区分 (例: 補助光線センサー 取替前 / 取替中 / 取替後 / 点検前 / 点検後)
  comment: string;        // 自由コメント・メモ欄 (ノート罫線領域)
}

export interface InspectionPhotoReport {
  id: string;
  inspectionReportId?: string | null; // 連動元点検報告書ID
  jobNo?: string;                     // 作業No
  title: string;                      // 報告書タイトル
  customerName?: string;              // 顧客名
  buildingName?: string;              // 現場名
  location?: string;                  // 取付場所
  workSubject?: string;               // 件名
  workDate?: string;                  // 実施日 (YYYY-MM-DD)
  layoutType: PhotoReportLayoutType;  // '3_items' | '2_items' | '4_items'
  photos: PhotoReportItem[];          // 写真リスト (2〜4枚)
  createdById: string;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
}
