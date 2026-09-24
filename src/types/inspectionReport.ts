export type InspectionJudgementCode = 
  | 'V'   // 良好
  | 'A'   // 調整
  | 'T'   // 締付
  | 'C'   // 清掃
  | 'L'   // 注油
  | '△'   // 要注意
  | '×'   // 要交換
  | 'ス'  // 交換済
  | '－'  // 該当無
  | '○'   // 範囲内
  | 'M';  // 見積提出中

export interface InspectionCheckCategoryDef {
  id: string;
  name: string;
  order?: number;
  description?: string;
}

export interface InspectionCheckItemDef {
  key: string;
  label: string;
  category: string; // 'door' | 'suspension' | 'power' | 'circuit' | 'other' | 'sensor' またはカスタムカテゴリID
  defaultVal?: InspectionJudgementCode;
  order?: number;
  isActive?: boolean;
  description?: string;
}

export const JUDGEMENT_OPTIONS: { code: InspectionJudgementCode; label: string; bgClass: string; textClass: string }[] = [
  { code: 'V', label: '良好', bgClass: 'bg-emerald-50 border-emerald-300 text-emerald-800', textClass: 'text-emerald-700' },
  { code: 'A', label: '調整', bgClass: 'bg-amber-50 border-amber-300 text-amber-800', textClass: 'text-amber-700' },
  { code: 'T', label: '締付', bgClass: 'bg-blue-50 border-blue-300 text-blue-800', textClass: 'text-blue-700' },
  { code: 'C', label: '清掃', bgClass: 'bg-teal-50 border-teal-300 text-teal-800', textClass: 'text-teal-700' },
  { code: 'L', label: '注油', bgClass: 'bg-indigo-50 border-indigo-300 text-indigo-800', textClass: 'text-indigo-700' },
  { code: '△', label: '要注意', bgClass: 'bg-orange-50 border-orange-300 text-orange-800', textClass: 'text-orange-700' },
  { code: '×', label: '要交換', bgClass: 'bg-rose-50 border-rose-300 text-rose-800', textClass: 'text-rose-700' },
  { code: 'ス', label: '交換済', bgClass: 'bg-purple-50 border-purple-300 text-purple-800', textClass: 'text-purple-700' },
  { code: '－', label: '該当無', bgClass: 'bg-slate-100 border-slate-300 text-slate-600', textClass: 'text-slate-600' },
  { code: '○', label: '範囲内', bgClass: 'bg-cyan-50 border-cyan-300 text-cyan-800', textClass: 'text-cyan-700' },
  { code: 'M', label: '見積中', bgClass: 'bg-yellow-50 border-yellow-300 text-yellow-800', textClass: 'text-yellow-700' },
];

export const STANDARD_CHECK_CATEGORIES = [
  { id: 'door', name: 'ドア・サッシ部' },
  { id: 'suspension', name: '懸架部' },
  { id: 'power', name: '動力・作動部' },
  { id: 'circuit', name: '電源回路' },
  { id: 'other', name: 'その他' },
  { id: 'sensor', name: 'センサー部' },
] as const;

export const STANDARD_CHECK_ITEMS: InspectionCheckItemDef[] = [
  // ドア・サッシ部
  { key: 'door_scratch', label: 'ドアの傷', category: 'door', defaultVal: 'V' },
  { key: 'door_noise', label: '異音', category: 'door', defaultVal: 'V' },
  { key: 'guide_rail_foreign', label: 'ガイドレール内の異物', category: 'door', defaultVal: 'V' },
  { key: 'door_close_gap', label: '全閉時の戸先隙間', category: 'door', defaultVal: 'V' },
  { key: 'finger_pinch_prevention', label: '指詰め防止の確保', category: 'door', defaultVal: 'V' },
  { key: 'cover_mount', label: '無目点検カバーの取付状態', category: 'door', defaultVal: 'V' },
  { key: 'door_gap', label: 'ドアと隙間(ガイドレール・方立・無目)', category: 'door', defaultVal: 'V' },
  { key: 'warning_labels', label: 'ステッカー・警告ラベル・戸袋警告ラベル', category: 'door', defaultVal: 'V' },

  // 懸架部
  { key: 'roller_wear', label: '戸車の磨耗・損傷', category: 'suspension', defaultVal: 'V' },
  { key: 'door_stopper', label: 'ドアストッパーの締付', category: 'suspension', defaultVal: 'V' },
  { key: 'hanger_rail_tighten', label: 'ハンガーレールの締付', category: 'suspension', defaultVal: 'V' },
  { key: 'hanger_rail_wear', label: 'ハンガーレールの汚れ・摩耗', category: 'suspension', defaultVal: 'C' },
  { key: 'derailment_prevention', label: '脱線防止の締付・隙間・摩耗', category: 'suspension', defaultVal: 'V' },

  // 動力・作動部
  { key: 'power_noise', label: '異音', category: 'power', defaultVal: 'V' },
  { key: 'engine_mount', label: 'エンジンの取付状態', category: 'power', defaultVal: 'V' },
  { key: 'vibration_rubber', label: '防振ゴムの変形', category: 'power', defaultVal: 'V' },
  { key: 'belt_chain_tighten', label: 'ベルト・チェーン・ワイヤーの締付・張り・摩耗', category: 'power', defaultVal: 'V' },
  { key: 'manual_operation', label: '手動開閉', category: 'power', defaultVal: 'V' },

  // 電源回路
  { key: 'power_switch', label: '電源スイッチの作動', category: 'circuit', defaultVal: 'V' },
  { key: 'wire_connection', label: '電線の支持・接続・損傷', category: 'circuit', defaultVal: 'V' },
  { key: 'power_voltage', label: '電源・電圧(1Y)', category: 'circuit', defaultVal: '－' },
  { key: 'insulation_resistance', label: '絶縁抵抗(1Y)', category: 'circuit', defaultVal: '－' },

  // その他
  { key: 'overall_operation', label: '総合動作(開閉・反転動作の確認)', category: 'other', defaultVal: 'V' },
  { key: 'auto_lock', label: 'オートロック装置の作動', category: 'other', defaultVal: 'V' },
  { key: 'deadbolt_gap', label: '電気錠デットボルトと鍵受けとの隙間', category: 'other', defaultVal: 'V' },
  { key: 'system_operation', label: 'システム動作の確認', category: 'other', defaultVal: 'V' },
  { key: 'all_parts_tighten', label: '各部締結部増し締め', category: 'other', defaultVal: 'V' },

  // センサー部
  { key: 'beam_sensor', label: '補助光線センサーの作動状況', category: 'sensor', defaultVal: 'V' },
];

/** CRMから取り込まれる扉の定義 */
export interface CrmImportedDoor {
  doorIndex: number;          // 1, 2, 3...
  doorNumber: string;         // 扉No (例: '00025397', '247653')
  location: string;           // 設置場所 (例: '正面玄関', '風除室 外側')
  model: string;              // 機種 (例: '100KLCM', 'TAS-EB-15T')
}

/** CRMから取り込まれた点検データ (作業No/受付番号単位) */
export interface CrmInspectionData {
  jobNo: string;              // 作業No / 受付番号 (例: '01269044', '01296500')
  yearMonth: string;          // 年月 (例: '202604', '202610')
  customerName: string;       // お客様名 (例: 'シャーメゾンジーエー 御中')
  address: string;            // 御住所
  phone?: string;             // 電話番号
  contractType?: string;      // 契約種別 (例: 'ST')
  totalDoorsCount: number;    // 総台数 (例: 1, 3)
  doors: CrmImportedDoor[];
  importedAt: string;         // 取り込み日時
}

/** 扉1台分の点検結果データ */
export interface InspectionDoorReport {
  doorIndex: number;
  doorNumber: string;         // 扉No
  location: string;           // 設置場所 / 建具番号
  model: string;              // 機種
  openCount: string;          // 開閉回数 (例: '42,639')
  openSpeed: string;          // 開速度 (例: '8')
  closeSpeed: string;         // 閉速度 (例: '3')
  timerSeconds: string;       // 開放タイマー (秒) (例: '1')
  
  // センサー寸法・判定
  sensorWidth: string;        // 有効開口幅 (mm) (例: '1,210')
  outerSensorWidthOk: boolean;     // 外センサー 幅
  outerSensorOpeningOk: boolean;   // 外センサー 有効開口+左右各
  outerSensorDepthOk: boolean;     // 外センサー 奥行
  outerSensorNearOk: boolean;      // 外センサー ドア直近
  innerSensorWidthOk: boolean;     // 内センサー 幅
  innerSensorOpeningOk: boolean;   // 内センサー 有効開口+左右各
  innerSensorDepthOk: boolean;     // 内センサー 奥行
  innerSensorNearOk: boolean;      // 内センサー ドア直近

  // 判定チェックリスト (キー: 判定コード)
  checkResults: Record<string, InspectionJudgementCode>;

  remarks?: string;           // 特記事項
}

/** 点検報告書レコード (1現場・1点検単位) */
export interface InspectionReportRecord {
  id: string;                 // レコード固有ID (例: 'rep_1726000000')
  jobNo: string;              // 作業No / 受付番号
  yearMonth: string;          // 対象年月 (YYYY-MM または YYYYMM)
  scheduleEventId?: string;   // カレンダーイベントID (紐付く場合)
  
  // 基本ヘッダー
  customerName: string;       // お客様名
  address: string;            // 御住所
  phone?: string;             // 電話番号
  contractType: string;       // 契約種別 (例: 'ST')
  category: 'maintenance' | 'warranty' | 'spot'; // 保守点検 / 保証期間 / スポット
  inspectionDate: string;     // 点検日 (YYYY-MM-DD)
  startTime: string;          // 開始時刻 (HH:mm)
  endTime: string;            // 終了時刻 (HH:mm)
  inspectorId: string;        // 作業員ユーザーID
  inspectorName: string;      // 作業員名
  subInspectorName?: string;  // 副作業員・同行者名
  
  isCrmImported: boolean;     // CRMデータから取り込まれたか、手動作成か
  totalDoorsCount: number;    // 総台数
  doors: InspectionDoorReport[]; // 各扉の点検結果

  // 報告事項・所見
  overallRemarks?: string;    // 点検結果・報告事項

  // お客様サイン (電子署名)
  customerSignature?: string; // Base64 画像URL
  signedAt?: string;          // サイン日時
  signedCustomerName?: string;// サイン時の署名者名（任意）

  // ステータス
  status: 'draft' | 'signed'; // 下書き / サイン受領済
  
  // 事務処理・確認情報
  officeConfirmed?: boolean;      // 事務担当者による確認済フラグ
  officeConfirmedAt?: string;     // 事務確認日時
  officeConfirmedByName?: string; // 事務確認担当者名
  officeConfirmedById?: string;   // 事務確認担当者ID
  
  createdAt: string;
  updatedAt: string;
}
