export type SiteStatus = 'not_started' | 'in_progress' | 'completed' | 'on_hold';

export type PartStatus = 'waiting_stock' | 'stock_in' | 'stock_out' | 'constructed' | 'inspected';

export interface SiteMainPart {
  id: string;
  partCode: string;          // 型番 / 部品コード
  partName: string;          // 品名
  originalQuantity?: number; // 元の台数 (分割前)
  unitIndex?: number;        // 分割後の何台目か (1台目, 2台目...)
  quantity: number;          // 常に1
  unit: string;              // '台'
  serialNo?: string;         // 機番 / シリアル
  inStockDate?: string;      // 入庫日 (YYYY-MM-DD)
  outStockDate?: string;     // 出庫日 (YYYY-MM-DD)
  constructionDate?: string; // 施工日 (YYYY-MM-DD)
  workerId?: string;         // 担当施工者ID
  workerName?: string;       // 担当施工者名
  status: PartStatus;        // 状況
  note?: string;             // 備考
}

export interface SiteSubPart {
  id: string;
  partCode: string;
  partName: string;
  quantity: number;
  unit: string;
  inStockDate?: string;
  outStockDate?: string;
  note?: string;
}

export interface SiteComment {
  id: string;
  userId: string;
  userName: string;
  userAvatar?: string;
  content: string;
  createdAt: string;
}

export interface SiteAttachment {
  id: string;
  name: string;
  url: string;
  size?: number;
  uploadedBy: string;
  uploadedAt: string;
  isNasDrawing?: boolean;
}

export interface Site {
  id: string;
  siteCode: string;          // 現場コード (例: NHQ136A)
  siteName: string;          // 現場名
  egCount: number;           // EG台数
  customerName?: string;     // 取引先・元請
  address?: string;          // 現場住所
  orderNo?: string;          // 発注No / 受注No
  status: SiteStatus;        // 全体進捗
  startDate?: string;        // 着工日 / 現場開始日
  endDate?: string;          // 現場完了予定日
  constructionDate?: string; // 主な施工日
  primaryWorkerId?: string;  // 主担当施工者ID
  primaryWorkerName?: string;// 主担当施工者名
  coWorkers?: Array<{ id: string; name: string }>; // 同行者
  mainParts: SiteMainPart[]; // 主要部品リスト (1台ずつ展開)
  subPartsCache?: SiteSubPart[]; // 付属部品キャッシュ
  notes?: string;            // 特記事項・申し送り
  comments?: SiteComment[];  // コメント履歴
  attachments?: SiteAttachment[]; // 添付ファイル・図面
  drawingUrl?: string;       // NAS図面参照URL
  createdById?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

// 在庫DBから返される現場情報の形式
export interface ExternalSiteLookupResult {
  code?: string;             // 外部DBのコードプロパティ名
  siteCode?: string;         // 本SNS標準のコードプロパティ名
  name?: string;             // 外部DBの現場名プロパティ名
  siteName?: string;         // 本SNS標準の現場名プロパティ名
  egCount?: number;          // EG台数
  customerName?: string;     // 得意先・元請名
  customer?: string;
  address?: string;          // 現場住所
  orderNo?: string;          // 発注No / 受注No
  period?: string;           // 工期テキスト (例: "2026/10/10 ～ 2026/10/20")
  scheduledStartDate?: string;
  scheduledEndDate?: string;
  drawingUrl?: string;       // NAS図面URL
  parts?: Array<{
    type?: 'main' | 'sub';
    isMain?: boolean;
    partCode?: string;
    code?: string;
    partName?: string;
    name?: string;
    quantity?: number;
    count?: number;
    unit?: string;
    inStockDate?: string;
    outStockDate?: string;
    note?: string;
  }>;
}

