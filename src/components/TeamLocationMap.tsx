import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { User, CalendarEvent, OfficeMaster } from '../types';
import { MapPin, Navigation, Clock, Building, Send, Search, RefreshCw, UserCheck, Zap, Layers, Moon, Sun, LayoutGrid, Check, Settings, X, RotateCcw } from 'lucide-react';
import { getLocalDateStr, getJstHourAndMinutes, formatTimeJST } from '../utils/dateUtils';
import { resolveLocationWithFullHierarchy, PRESET_SPECIFIC_SPOTS, MUNICIPALITY_COORDINATES } from '../utils/japanAddressGeocoding';
import { triggerOpenUserModal } from '../utils/userModal';

const TRANSIT_SETTINGS_STORAGE_KEY = 'teranago_location_map_transit_settings_v1';

interface TransitSimulationSettings {
  isInterpolatedTransitEnabled: boolean; // 移動を仮表示 (初期値: true)
  assumedDepartureTime: string;          // 想定出発時間 (初期値: "08:00")
  assumedReturnTime: string;             // 想定帰社時間 (初期値: "17:00")
  overtimeReturnDurationHours: number;   // 最終地点が想定帰社時間を超える場合の帰社所要時間(h) (初期値: 1)
}

const DEFAULT_TRANSIT_SETTINGS: TransitSimulationSettings = {
  isInterpolatedTransitEnabled: true,
  assumedDepartureTime: '08:00',
  assumedReturnTime: '17:00',
  overtimeReturnDurationHours: 1,
};

function parseTimeStrToMinutes(timeStr: string, fallbackMins: number): number {
  if (!timeStr || !timeStr.includes(':')) return fallbackMins;
  const [hStr, mStr] = timeStr.split(':');
  const h = Number(hStr);
  const m = Number(mStr);
  if (isNaN(h) || isNaN(m)) return fallbackMins;
  return Math.max(0, Math.min(24 * 60, h * 60 + m));
}

function formatMinutesToTimeStr(mins: number): string {
  const clamped = Math.max(0, Math.min(24 * 60, Math.round(mins)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface TeamLocationMapProps {
  currentDate: Date;
  teamMembers: User[];
  events: CalendarEvent[];
  offices?: OfficeMaster[];
  onOpenMemoModal?: (user: User) => void;
  onOpenEventModal?: (event: CalendarEvent) => void;
  displayMode?: 'map' | 'cards'; // 'map' (インタラクティブ地図) または 'cards' (簡易エリア別カード)
}

export type MapStyleType = 'light' | 'standard' | 'dark';

interface MemberLocationStatus {
  member: User;
  statusType: 'at_base' | 'on_site' | 'in_transit';
  locationName: string;
  officeBadge: string;
  prevLocationName?: string;
  nextLocationName?: string;
  isReturningToBase?: boolean;
  originCoords?: [number, number]; // 移動中の場合の出発地座標
  destCoords?: [number, number]; // 移動中の場合の移動先座標
  destLabel?: string; // 移動中の場合の移動先ラベル
  transitProgressRatio?: number; // 移動進捗率 (0.0 〜 1.0)
  currentEvent?: CalendarEvent;
  nextEvent?: CalendarEvent;
  coords: [number, number]; // [lat, lng] (始点拠点・現場・補間現在地座標)
  spiderCoords: [number, number]; // 引き出し線先のオフセット座標
  regionKey: 'nagoya_owari' | 'mikawa' | 'gifu' | 'mie' | 'shizuoka' | 'tokyo' | 'osaka' | 'other';
  statusDisplay: string;
  timeRangeDisplay?: string;
}

// デフォルト拠点 (愛知県名古屋市北区清水5-10-2)
const DEFAULT_HEADQUARTERS = {
  address: '愛知県名古屋市北区清水5-10-2',
  name: '名古屋拠点 (清水)',
  badge: '🏢 名古屋拠点',
  coords: [35.1932, 136.9110] as [number, number],
  regionKey: 'nagoya_owari' as const,
};

// 所属拠点（member.office または member.department）からデフォルト住所・座標・拠点区分バッジを特定する辞書
const OFFICE_BASE_LOCATIONS: Record<string, { coords: [number, number]; address: string; name: string; badge: string; regionKey: MemberLocationStatus['regionKey'] }> = {
  '清水': { coords: [35.1932, 136.9110], address: '愛知県名古屋市北区清水5-10-2', name: '名古屋拠点 (清水)', badge: '🏢 名古屋拠点', regionKey: 'nagoya_owari' },
  '本社': { coords: [35.1932, 136.9110], address: '愛知県名古屋市北区清水5-10-2', name: '名古屋拠点 (清水)', badge: '🏢 名古屋拠点', regionKey: 'nagoya_owari' },
  '名古屋': { coords: [35.1932, 136.9110], address: '愛知県名古屋市北区清水5-10-2', name: '名古屋拠点 (清水)', badge: '🏢 名古屋拠点', regionKey: 'nagoya_owari' },
  '名古屋支店': { coords: [35.1932, 136.9110], address: '愛知県名古屋市北区清水5-10-2', name: '名古屋拠点 (清水)', badge: '🏢 名古屋拠点', regionKey: 'nagoya_owari' },
  '浜松': { coords: [34.7108, 137.7261], address: '静岡県浜松市中央区', name: '浜松営業所', badge: '🏢 浜松営業所', regionKey: 'shizuoka' },
  '浜松営業所': { coords: [34.7108, 137.7261], address: '静岡県浜松市中央区', name: '浜松営業所', badge: '🏢 浜松営業所', regionKey: 'shizuoka' },
  '浜松オフィス': { coords: [34.7108, 137.7261], address: '静岡県浜松市中央区', name: '浜松営業所', badge: '🏢 浜松営業所', regionKey: 'shizuoka' },
  '静岡': { coords: [34.9756, 138.3828], address: '静岡県静岡市葵区', name: '静岡営業所', badge: '🏢 静岡営業所', regionKey: 'shizuoka' },
  '静岡営業所': { coords: [34.9756, 138.3828], address: '静岡県静岡市葵区', name: '静岡営業所', badge: '🏢 静岡営業所', regionKey: 'shizuoka' },
  '静岡支店': { coords: [34.9756, 138.3828], address: '静岡県静岡市葵区', name: '静岡営業所', badge: '🏢 静岡営業所', regionKey: 'shizuoka' },
  '三河': { coords: [34.9548, 137.1723], address: '愛知県岡崎市', name: '三河営業所', badge: '🏢 三河営業所', regionKey: 'mikawa' },
  '三河営業所': { coords: [34.9548, 137.1723], address: '愛知県岡崎市', name: '三河営業所', badge: '🏢 三河営業所', regionKey: 'mikawa' },
  '岡崎': { coords: [34.9548, 137.1723], address: '愛知県岡崎市', name: '三河営業所', badge: '🏢 三河営業所', regionKey: 'mikawa' },
  '三重': { coords: [34.9653, 136.6236], address: '三重県四日市市', name: '三重営業所', badge: '🏢 三重営業所', regionKey: 'mie' },
  '三重営業所': { coords: [34.9653, 136.6236], address: '三重県四日市市', name: '三重営業所', badge: '🏢 三重営業所', regionKey: 'mie' },
  '四日市': { coords: [34.9653, 136.6236], address: '三重県四日市市', name: '三重営業所', badge: '🏢 三重営業所', regionKey: 'mie' },
  '岐阜': { coords: [35.4233, 136.7607], address: '岐阜県岐阜市', name: '岐阜営業所', badge: '🏢 岐阜営業所', regionKey: 'gifu' },
  '岐阜営業所': { coords: [35.4233, 136.7607], address: '岐阜県岐阜市', name: '岐阜営業所', badge: '🏢 岐阜営業所', regionKey: 'gifu' },
  '東京': { coords: [35.6812, 139.7671], address: '東京都千代田区', name: '東京支店', badge: '🏢 東京支店', regionKey: 'tokyo' },
  '東京支店': { coords: [35.6812, 139.7671], address: '東京都千代田区', name: '東京支店', badge: '🏢 東京支店', regionKey: 'tokyo' },
  '大阪': { coords: [34.7024, 135.4959], address: '大阪府大阪市北区', name: '大阪支店', badge: '🏢 大阪支店', regionKey: 'osaka' },
  '大阪支店': { coords: [34.7024, 135.4959], address: '大阪府大阪市北区', name: '大阪支店', badge: '🏢 大阪支店', regionKey: 'osaka' },
};

function resolveUserBaseLocation(user: User, offices?: OfficeMaster[]): { coords: [number, number]; address: string; name: string; badge: string; regionKey: MemberLocationStatus['regionKey'] } {
  const rawOffice = (user.office || user.department || '').trim();

  // 1. OFFICE_BASE_LOCATIONS との直接・部分キーワード一致
  for (const [key, base] of Object.entries(OFFICE_BASE_LOCATIONS)) {
    if (rawOffice.includes(key)) {
      return base;
    }
  }

  // 2. 拠点マスター (offices) とのマッチング
  if (offices && offices.length > 0) {
    const matchedOffice = offices.find(o => 
      (rawOffice && (rawOffice.includes(o.name) || o.name.includes(rawOffice))) ||
      (o.code && rawOffice.includes(o.code))
    );
    if (matchedOffice) {
      const matchedKey = matchedOffice.name;
      for (const [key, base] of Object.entries(OFFICE_BASE_LOCATIONS)) {
        if (matchedKey.includes(key)) {
          return base;
        }
      }
      let badge = `🏢 ${matchedOffice.name}`;
      if (matchedOffice.type === 'branch') badge = `🏢 ${matchedOffice.name} (支店)`;
      else if (matchedOffice.type === 'sales_office') badge = `🏢 ${matchedOffice.name} (営業所)`;
      else if (matchedOffice.type === 'headquarter') badge = `🏢 ${matchedOffice.name} (本社)`;

      const geocoded = resolveLocationWithFullHierarchy(matchedOffice.location || matchedOffice.name);

      return {
        coords: geocoded.coords,
        address: matchedOffice.location || DEFAULT_HEADQUARTERS.address,
        name: matchedOffice.name,
        badge,
        regionKey: geocoded.regionKey || 'nagoya_owari'
      };
    }
  }

  // 3. 所属表記自体 (例: 「浜松営業所」「静岡支社」「豊橋営業所」) から自動ジオコーディング
  if (rawOffice) {
    const geocoded = resolveLocationWithFullHierarchy(rawOffice);
    if (geocoded && geocoded.source !== 'fallback_base') {
      return {
        coords: geocoded.coords,
        address: rawOffice,
        name: rawOffice,
        badge: `🏢 ${rawOffice}`,
        regionKey: geocoded.regionKey || 'shizuoka'
      };
    }
  }

  return DEFAULT_HEADQUARTERS;
}

/**
 * 住所・予定名から最適な座標とエリアを解決する関数
 * 第1層: 全国市区町村・政令指定都市区マスター（約1,900自治体）＋ 住所正規化
 * 第2層: 自社頻出現場・特定スポット（熱田区五番町、可茂環境衛生、テクノエイト等）最長一致
 * 第3層: 所属拠点（自拠点）安全フォールバック
 */
function resolveLocationInfo(
  locationStr?: string,
  fallbackBase?: ReturnType<typeof resolveUserBaseLocation>
): { coords: [number, number]; regionKey: MemberLocationStatus['regionKey']; matchedName?: string } {
  const result = resolveLocationWithFullHierarchy(locationStr, fallbackBase);
  return {
    coords: result.coords,
    regionKey: result.regionKey,
    matchedName: result.matchedName,
  };
}

const PAID_LEAVE_REGEX = /有[給休]/;
const PARTIAL_LEAVE_REGEX = /半[休給]|午前|午後|AM|PM|時間休/i;
const PERSONAL_MEETING_TITLE_REGEX = /(打合せ|打ち合わせ|会議|ミーティング)/;

function isPaidLeaveEvent(ev: CalendarEvent): boolean {
  const text = `${ev.title || ''} ${ev.location || ''}`;
  return PAID_LEAVE_REGEX.test(text);
}

/**
 * 予定の住所(location)に有意な外部住所が含まれているか判定
 * 「会議室」「事務所」「3F」「オンライン」等のみ、または自拠点のみの場合は false を返す
 */
function hasSignificantAddress(
  rawLocation: string | undefined,
  userBaseLocation: ReturnType<typeof resolveUserBaseLocation>
): boolean {
  const loc = (rawLocation || '').trim();
  if (!loc) return false;

  // 階数・社内スペース・オンライン等の非住所ワードを除去して実質的な文字列が残るか確認
  const strippedInternal = loc
    .replace(/[0-9０-９]+[FＦ階]/gi, '')
    .replace(/(?:第[0-9０-９一二三四五六七八九十]+)?(?:大会議室|小会議室|会議室|ミーティングルーム|打合(?:わ)?せ室|応接室|商談室|執務室|事務所|社内|自社|自拠点|オフィス|フロア|受付|ロビー|オンライン|リモート|web会議?|zoom|teams|meet|電話|tel)/gi, '')
    .replace(/[\s　・,，.．\-ー_()（）【】\[\]「」]/g, '')
    .trim();

  if (!strippedInternal) {
    return false;
  }

  // 「本社」「名古屋事務所」等の拠点キーワードだけで自拠点と一致する場合は自拠点扱い
  for (const [key, base] of Object.entries(OFFICE_BASE_LOCATIONS)) {
    if (strippedInternal === key || strippedInternal === `${key}本社` || strippedInternal === `${key}支店` || strippedInternal === `${key}営業所`) {
      const sameAsUserBase =
        Math.abs(base.coords[0] - userBaseLocation.coords[0]) < 0.005 &&
        Math.abs(base.coords[1] - userBaseLocation.coords[1]) < 0.005;
      if (sameAsUserBase) {
        return false;
      }
      return true;
    }
  }

  const resolved = resolveLocationWithFullHierarchy(loc, userBaseLocation);
  if (resolved.source === 'fallback_base') {
    return false;
  }

  // 「名古屋」「浜松」等の市名単体で自拠点の住所に含まれる場合は自拠点扱い（区・特定スポット指定は外部/詳細住所として有効）
  if (
    resolved.source === 'city' &&
    resolved.matchedName &&
    userBaseLocation.address.includes(resolved.matchedName)
  ) {
    return false;
  }

  return true;
}

/**
 * 区分が「会議」「来客」、または「個人」かつタイトルが「打合せ/打ち合わせ/会議/ミーティング」で、
 * 有意な住所が指定されていない場合は所属拠点での予定として扱う
 */
function isBaseOfficeScheduledEvent(
  ev: CalendarEvent,
  userBaseLocation: ReturnType<typeof resolveUserBaseLocation>
): boolean {
  const isMeetingOrVisitor = ev.type === 'meeting' || ev.type === 'visitor';
  const isPersonalMeeting = ev.type === 'personal' && PERSONAL_MEETING_TITLE_REGEX.test(ev.title || '');
  if (!isMeetingOrVisitor && !isPersonalMeeting) {
    return false;
  }
  return !hasSignificantAddress(ev.location, userBaseLocation);
}

/**
 * イベントが対象日(dateStr: YYYY-MM-DD, JST)に含まれる場合の開始〜終了分(0..1439)を返す
 */
function getEventMinutesOnDate(
  ev: CalendarEvent,
  dateStr: string
): { startMins: number; endMins: number } | null {
  const sDateStr = getLocalDateStr(ev.start);
  if (!sDateStr) return null;

  const sTime = new Date(ev.start);
  let eTime = ev.end ? new Date(ev.end) : new Date(sTime.getTime() + 60 * 60 * 1000);
  if (isNaN(eTime.getTime())) eTime = new Date(sTime.getTime() + 60 * 60 * 1000);

  const { hour: rawEH, minute: rawEM } = getJstHourAndMinutes(eTime);
  const adjustedEndTime =
    rawEH === 0 && rawEM === 0 && eTime.getTime() > sTime.getTime()
      ? new Date(eTime.getTime() - 1)
      : eTime;
  const eDateStr = getLocalDateStr(adjustedEndTime) || sDateStr;

  if (dateStr < sDateStr || dateStr > eDateStr) {
    return null;
  }

  const { hour: sH, minute: sM } = getJstHourAndMinutes(sTime);
  const { hour: eH, minute: eM } = getJstHourAndMinutes(adjustedEndTime);

  const startMins = ev.isAllDay || sDateStr < dateStr ? 0 : sH * 60 + sM;
  const endMins = ev.isAllDay || eDateStr > dateStr ? 24 * 60 - 1 : eH * 60 + eM;

  return { startMins, endMins };
}

/**
 * 密集拠点・現場におけるメンバー展開座標 (Spider Coordinates) の計算
 * ズームレベルに応じた展開半径・角度を算出し、拡大移動時にも同一関数で未来座標を事前計算可能
 */
export function calculateSpiderCoordsForMember(
  centerLat: number,
  centerLng: number,
  totalInGroup: number,
  indexInGroup: number,
  zoom: number,
  map?: L.Map | null
): [number, number] {
  if (totalInGroup <= 1) {
    return [centerLat, centerLng];
  }
  // 画面ピクセル基準の展開半径（ネームカード幅約75pxを考慮し、隣接マーカー間隔が重ならないよう弦長計算で最適化）
  const pixelRadius = Math.max(54, Math.min(130, Math.round(40 / Math.sin(Math.PI / Math.min(totalInGroup, 12)))));
  const angle = (2 * Math.PI * indexInGroup) / totalInGroup - Math.PI / 2;

  if (map) {
    try {
      const centerPoint = map.project(L.latLng(centerLat, centerLng), zoom);
      const spiderPoint = L.point(
        centerPoint.x + pixelRadius * Math.cos(angle),
        centerPoint.y + pixelRadius * Math.sin(angle)
      );
      const unprojected = map.unproject(spiderPoint, zoom);
      return [unprojected.lat, unprojected.lng];
    } catch {
      // プロジェクト計算エラー時のフォールバック
    }
  }

  const degPerPixelLat = 1.152 / Math.pow(2, zoom);
  const degPerPixelLng = 1.406 / Math.pow(2, zoom);
  return [
    centerLat + pixelRadius * Math.sin(angle) * degPerPixelLat,
    centerLng + pixelRadius * Math.cos(angle) * degPerPixelLng,
  ];
}

export const TeamLocationMap: React.FC<TeamLocationMapProps> = ({
  currentDate,
  teamMembers,
  events,
  offices,
  onOpenMemoModal,
  onOpenEventModal,
  displayMode = 'map',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);
  const markersByMemberIdRef = useRef<Map<string | number, L.Marker>>(new Map());
  const linesByMemberIdRef = useRef<Map<string | number, L.Polyline>>(new Map());
  const transitLinesRef = useRef<{ line: L.Polyline; dest: [number, number] }[]>([]);
  const animFrameRef = useRef<number | null>(null);
  const hasAutoFittedInitialViewRef = useRef<boolean>(false);

  // アンマウント時のアニメーションおよびLeafletインスタンスのクリーンアップ
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore cleanup error
        }
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        markersLayerRef.current = null;
      }
    };
  }, []);

  // 今日判定
  const isToday = useMemo(() => {
    return getLocalDateStr(new Date()) === getLocalDateStr(currentDate);
  }, [currentDate]);

  // JST 現在時刻（分単位）
  const getCurrentJstMinutes = useCallback(() => {
    const now = new Date();
    const { hour, minute } = getJstHourAndMinutes(now);
    return hour * 60 + minute;
  }, []);

  // ★ 要望①: 今日以外は 8:00 スタート (8 * 60 = 480分)
  const [selectedMinutes, setSelectedMinutes] = useState<number>(() => {
    return isToday ? getCurrentJstMinutes() : 8 * 60;
  });

  const [isLiveTracking, setIsLiveTracking] = useState<boolean>(isToday);

  // 日付変更時に初期時刻を自動切替
  useEffect(() => {
    if (isToday) {
      setSelectedMinutes(getCurrentJstMinutes());
      setIsLiveTracking(true);
    } else {
      setSelectedMinutes(8 * 60); // 朝8時スタート
      setIsLiveTracking(false);
    }
  }, [currentDate, isToday, getCurrentJstMinutes]);

  // チームメンバー構成が変わった場合は初期全体フィットを再実行できるようにリセット
  const teamMembersKey = useMemo(
    () => (teamMembers || []).map((m) => String(m.id)).sort().join(','),
    [teamMembers]
  );

  useEffect(() => {
    hasAutoFittedInitialViewRef.current = false;
  }, [teamMembersKey]);

  // 地図スタイル選択 (減色ライト / 標準 / ダーク)
  const [mapStyle, setMapStyle] = useState<MapStyleType>('light');
  const [currentZoom, setCurrentZoom] = useState<number>(9);

  // 自動更新コントロール
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState<boolean>(true);
  const [refreshIntervalMins, setRefreshIntervalMins] = useState<number>(3);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [countdownSeconds, setCountdownSeconds] = useState<number>(refreshIntervalMins * 60);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [transitSettings, setTransitSettings] = useState<TransitSimulationSettings>(() => {
    try {
      const saved = localStorage.getItem(TRANSIT_SETTINGS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          isInterpolatedTransitEnabled:
            typeof parsed.isInterpolatedTransitEnabled === 'boolean'
              ? parsed.isInterpolatedTransitEnabled
              : DEFAULT_TRANSIT_SETTINGS.isInterpolatedTransitEnabled,
          assumedDepartureTime: parsed.assumedDepartureTime || DEFAULT_TRANSIT_SETTINGS.assumedDepartureTime,
          assumedReturnTime: parsed.assumedReturnTime || DEFAULT_TRANSIT_SETTINGS.assumedReturnTime,
          overtimeReturnDurationHours:
            typeof parsed.overtimeReturnDurationHours === 'number' && parsed.overtimeReturnDurationHours > 0
              ? parsed.overtimeReturnDurationHours
              : DEFAULT_TRANSIT_SETTINGS.overtimeReturnDurationHours,
        };
      }
    } catch {
      // ignore storage error
    }
    return DEFAULT_TRANSIT_SETTINGS;
  });

  useEffect(() => {
    try {
      localStorage.setItem(TRANSIT_SETTINGS_STORAGE_KEY, JSON.stringify(transitSettings));
    } catch {
      // ignore storage error
    }
  }, [transitSettings]);

  const [isTransitSettingsModalOpen, setIsTransitSettingsModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedMemberStatus, setSelectedMemberStatus] = useState<MemberLocationStatus | null>(null);
  const [selectedHubKey, setSelectedHubKey] = useState<string | null>(null);

  // リアルタイム追従タイマー
  useEffect(() => {
    if (!isLiveTracking || !isToday) return;
    const interval = setInterval(() => {
      setSelectedMinutes(getCurrentJstMinutes());
    }, 30000);
    return () => clearInterval(interval);
  }, [isLiveTracking, isToday, getCurrentJstMinutes]);

  // 更新処理
  const handleTriggerRefresh = useCallback(() => {
    setIsRefreshing(true);
    const now = new Date();
    setLastRefreshedAt(now);
    setCountdownSeconds(refreshIntervalMins * 60);

    if (isLiveTracking && isToday) {
      setSelectedMinutes(getCurrentJstMinutes());
    }

    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  }, [refreshIntervalMins, isLiveTracking, isToday, getCurrentJstMinutes]);

  // タイマーカウントダウン
  useEffect(() => {
    if (!isAutoRefreshEnabled) return;

    const timer = setInterval(() => {
      setCountdownSeconds((prev) => {
        if (prev <= 1) {
          handleTriggerRefresh();
          return refreshIntervalMins * 60;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isAutoRefreshEnabled, refreshIntervalMins, handleTriggerRefresh]);

  // 時刻文字列 (例: "08:00")
  const selectedTimeStr = useMemo(() => {
    const h = Math.floor(selectedMinutes / 60);
    const m = selectedMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [selectedMinutes]);

  // 各メンバーのステータスおよび引き出し線 (Spiderfy) 計算
  const memberStatuses = useMemo<MemberLocationStatus[]>(() => {
    const dateStr = getLocalDateStr(currentDate);
    const assumedDepMins = parseTimeStrToMinutes(transitSettings.assumedDepartureTime, 8 * 60);
    const assumedRetMins = parseTimeStrToMinutes(transitSettings.assumedReturnTime, 17 * 60);
    const overtimeDurationMins = Math.max(15, Math.round((transitSettings.overtimeReturnDurationHours || 1) * 60));
    const isInterpolated = transitSettings.isInterpolatedTransitEnabled;

    const rawStatuses = teamMembers
      .map((member): MemberLocationStatus | null => {
        // ユーザー個別の所属拠点デフォルト情報を解決
        const userBaseLocation = resolveUserBaseLocation(member, offices);

        const datedEvents = (events || [])
          .map((e) => {
            const isAttendee = e.attendees?.some(
              (a) => a && (a.id === member.id || String(a.id) === String(member.id) || a.name === member.name)
            );
            if (!isAttendee) return null;
            const range = getEventMinutesOnDate(e, dateStr);
            if (!range) return null;
            return { ev: e, ...range };
          })
          .filter((item): item is { ev: CalendarEvent; startMins: number; endMins: number } => item !== null)
          .sort((a, b) => a.startMins - b.startMins || new Date(a.ev.start).getTime() - new Date(b.ev.start).getTime());

        // ★ 「有給」「有休」が含まれる場合は現在地マップから非表示にする
        const leaveEvents = datedEvents.filter((item) => isPaidLeaveEvent(item.ev));
        const workEvents = datedEvents.filter((item) => !isPaidLeaveEvent(item.ev));

        if (leaveEvents.length > 0) {
          const hasFullDayLeave = leaveEvents.some((item) => {
            const text = `${item.ev.title || ''} ${item.ev.location || ''}`;
            const duration = item.endMins - item.startMins;
            return Boolean(item.ev.isAllDay) || duration >= 300 || !PARTIAL_LEAVE_REGEX.test(text);
          });
          if (hasFullDayLeave) {
            return null;
          }

          // 半休・時間休の場合：該当時間帯（午前休は朝〜終了まで、午後休は開始〜以降の予定がない限り退社まで）は非表示
          const isCurrentlyOnPartialLeave = leaveEvents.some((item) => {
            const text = `${item.ev.title || ''} ${item.ev.location || ''}`;
            const effectiveStart = /午前|AM/i.test(text) && item.startMins <= 9 * 60 ? 0 : item.startMins;
            if (selectedMinutes >= effectiveStart && selectedMinutes <= item.endMins) {
              return true;
            }
            if (selectedMinutes > item.endMins) {
              const hasWorkAfterLeave = workEvents.some((w) => w.endMins > item.endMins);
              if (!hasWorkAfterLeave) {
                return true;
              }
            }
            return false;
          });
          if (isCurrentlyOnPartialLeave) {
            return null;
          }
        }

        let statusType: 'at_base' | 'on_site' | 'in_transit' = 'at_base';
        let locationName = userBaseLocation.name;
        const officeBadge = userBaseLocation.badge;
        let prevLocationName: string | undefined = undefined;
        let nextLocationName: string | undefined = undefined;
        let isReturningToBase = false;
        let originCoords: [number, number] | undefined = undefined;
        let destCoords: [number, number] | undefined = undefined;
        let destLabel: string | undefined = undefined;
        let transitProgressRatio: number | undefined = undefined;
        let transitWindowStr: string | undefined = undefined;
        let currentEvent: CalendarEvent | undefined = undefined;
        let nextEvent: CalendarEvent | undefined = undefined;
        let coords: [number, number] = userBaseLocation.coords;
        let regionKey: MemberLocationStatus['regionKey'] = userBaseLocation.regionKey;

        let activeEventFound = false;
        let prevEventItem: { ev: CalendarEvent; startMins: number; endMins: number } | null = null;
        let nextEventItem: { ev: CalendarEvent; startMins: number; endMins: number } | null = null;

        for (let i = 0; i < workEvents.length; i++) {
          const item = workEvents[i];
          const { ev, startMins: evStartMins, endMins: evEndMins } = item;

          if (selectedMinutes >= evStartMins && selectedMinutes <= evEndMins) {
            activeEventFound = true;
            currentEvent = ev;
            const rawTitle = ev.title || '';
            const rawLoc = ev.location || '';
            const combined = `${rawTitle} ${rawLoc}`.trim();

            // 「AからBへ移動」や「Aから移動中」などの明示的な移動予定の判定
            const transitMatch =
              combined.match(/(.+?)(?:から|発)\s*(.+?)(?:へ|に|行)?(?:移動中|移動|向かう)/) ||
              combined.match(/(.+?)から移動中/);

            if (transitMatch) {
              statusType = 'in_transit';
              const originStr = transitMatch[1].trim();
              const destStr = transitMatch[2] ? transitMatch[2].trim() : '';
              prevLocationName = originStr;
              nextLocationName = destStr || undefined;
              locationName = originStr;

              const prevLocInfo = resolveLocationInfo(originStr, userBaseLocation);
              const nextLocInfo = destStr ? resolveLocationInfo(destStr, userBaseLocation) : null;
              const startCoord = prevLocInfo ? prevLocInfo.coords : userBaseLocation.coords;
              const endCoord = nextLocInfo ? nextLocInfo.coords : startCoord;
              originCoords = startCoord;
              if (nextLocInfo) {
                destCoords = nextLocInfo.coords;
                destLabel = destStr;
              }

              const span = Math.max(1, evEndMins - evStartMins);
              const ratio = Math.max(0, Math.min(1, (selectedMinutes - evStartMins) / span));
              transitProgressRatio = ratio;
              transitWindowStr = `${formatMinutesToTimeStr(evStartMins)} - ${formatMinutesToTimeStr(evEndMins)}`;

              if (isInterpolated && nextLocInfo) {
                coords = [
                  startCoord[0] + (endCoord[0] - startCoord[0]) * ratio,
                  startCoord[1] + (endCoord[1] - startCoord[1]) * ratio,
                ];
                regionKey = ratio >= 0.5 ? nextLocInfo.regionKey : prevLocInfo.regionKey;
              } else if (selectedMinutes < evEndMins && prevLocInfo) {
                coords = prevLocInfo.coords;
                regionKey = prevLocInfo.regionKey;
              } else if (nextLocInfo) {
                coords = nextLocInfo.coords;
                regionKey = nextLocInfo.regionKey;
              } else {
                coords = startCoord;
                regionKey = prevLocInfo ? prevLocInfo.regionKey : userBaseLocation.regionKey;
              }
            } else if (isBaseOfficeScheduledEvent(ev, userBaseLocation)) {
              // ★ 会議・来客・個人打合せで有意な住所がない場合は所属拠点の住所に滞在扱い
              statusType = 'at_base';
              locationName = userBaseLocation.name;
              coords = userBaseLocation.coords;
              regionKey = userBaseLocation.regionKey;
            } else {
              statusType = 'on_site';
              locationName = ev.location || ev.title || '現場・予定先';
              // 住所があるか、または現場名から推測される場所にマッピング。その他は拠点住所
              const locInfo = resolveLocationInfo(ev.location || ev.title, userBaseLocation);
              coords = locInfo ? locInfo.coords : userBaseLocation.coords;
              regionKey = locInfo ? locInfo.regionKey : userBaseLocation.regionKey;
            }
            break;
          } else if (selectedMinutes > evEndMins) {
            prevEventItem = item;
          } else if (selectedMinutes < evStartMins && !nextEventItem) {
            nextEventItem = item;
          }
        }

        if (!activeEventFound) {
          const prevEv = prevEventItem?.ev || null;
          const nextEv = nextEventItem?.ev || null;
          const prevEndMins = prevEventItem?.endMins ?? assumedDepMins;
          const nextStartMins = nextEventItem?.startMins ?? assumedRetMins;

          if (prevEv) {
            const prevIsBase = isBaseOfficeScheduledEvent(prevEv, userBaseLocation);
            const nextIsBase = nextEv ? isBaseOfficeScheduledEvent(nextEv, userBaseLocation) : false;

            if (prevIsBase && (!nextEv || nextIsBase)) {
              // 拠点内予定が終わり、後続がなしまたは拠点内予定なら拠点滞在のまま
              statusType = 'at_base';
              locationName = userBaseLocation.name;
              coords = userBaseLocation.coords;
              regionKey = userBaseLocation.regionKey;
              if (nextEv) {
                nextEvent = nextEv;
                nextLocationName = nextEv.location || nextEv.title;
              }
            } else if (nextEv && !nextIsBase) {
              // A現場（または拠点内予定）終了 〜 B現場開始までの移動
              statusType = 'in_transit';
              prevLocationName = prevIsBase
                ? userBaseLocation.name
                : prevEv.location || prevEv.title || '前作業現場';
              nextLocationName = nextEv.location || nextEv.title || '次現場';
              currentEvent = prevEv;
              nextEvent = nextEv;
              locationName = prevLocationName;
              isReturningToBase = false;

              const prevLocInfo = prevIsBase
                ? { coords: userBaseLocation.coords, regionKey: userBaseLocation.regionKey }
                : resolveLocationInfo(prevEv.location || prevEv.title, userBaseLocation);
              const nextLocInfo = resolveLocationInfo(nextEv.location || nextEv.title, userBaseLocation);

              const startCoord = prevLocInfo ? prevLocInfo.coords : userBaseLocation.coords;
              const endCoord = nextLocInfo.coords;
              originCoords = startCoord;
              destCoords = endCoord;
              destLabel = nextLocationName;

              // 前の予定が拠点内で想定出発時刻より前に終わっていた場合は想定出発時刻から移動開始
              const transitStartMins = prevIsBase && prevEndMins < assumedDepMins ? assumedDepMins : prevEndMins;
              const transitEndMins = nextStartMins;

              if (selectedMinutes < transitStartMins && prevIsBase) {
                // まだ想定出発時刻に達していない場合は拠点待機
                statusType = 'at_base';
                locationName = userBaseLocation.name;
                coords = userBaseLocation.coords;
                regionKey = userBaseLocation.regionKey;
              } else {
                const span = Math.max(1, transitEndMins - transitStartMins);
                const ratio = Math.max(0, Math.min(1, (selectedMinutes - transitStartMins) / span));
                transitProgressRatio = ratio;
                transitWindowStr = `${formatMinutesToTimeStr(transitStartMins)} - ${formatMinutesToTimeStr(transitEndMins)}`;

                if (isInterpolated) {
                  coords = [
                    startCoord[0] + (endCoord[0] - startCoord[0]) * ratio,
                    startCoord[1] + (endCoord[1] - startCoord[1]) * ratio,
                  ];
                  regionKey = ratio >= 0.5 ? nextLocInfo.regionKey : prevLocInfo.regionKey;
                } else {
                  coords = startCoord;
                  regionKey = prevLocInfo.regionKey;
                }
              }
            } else {
              // ★ 最終地点終了後（または次が自拠点予定）の帰社判定
              // 最終地点が想定帰社時刻(17:00)以前に終了かつ次予定がない場合は想定帰社時刻(17:00)に帰社完了、
              // 最終地点終了が想定帰社時刻(17:00)を超える場合は「終了から◯時間(初期値1時間)」で帰社完了
              const returnArrivalMins = nextEv
                ? nextStartMins
                : prevEndMins < assumedRetMins
                ? assumedRetMins
                : prevEndMins + overtimeDurationMins;

              if (!nextEv && selectedMinutes >= returnArrivalMins) {
                // 帰社完了 → 所属拠点滞在
                statusType = 'at_base';
                locationName = userBaseLocation.name;
                coords = userBaseLocation.coords;
                regionKey = userBaseLocation.regionKey;
              } else {
                statusType = 'in_transit';
                prevLocationName = prevEv.location || prevEv.title || '前作業現場';
                currentEvent = prevEv;
                locationName = prevLocationName;
                isReturningToBase = true;

                const prevLocInfo = resolveLocationInfo(prevEv.location || prevEv.title, userBaseLocation);
                const startCoord = prevLocInfo ? prevLocInfo.coords : userBaseLocation.coords;
                const endCoord = userBaseLocation.coords;
                originCoords = startCoord;
                destCoords = endCoord;
                destLabel = userBaseLocation.name;
                if (nextEv) {
                  nextEvent = nextEv;
                }

                const span = Math.max(1, returnArrivalMins - prevEndMins);
                const ratio = Math.max(0, Math.min(1, (selectedMinutes - prevEndMins) / span));
                transitProgressRatio = ratio;
                transitWindowStr = `${formatMinutesToTimeStr(prevEndMins)} - ${formatMinutesToTimeStr(returnArrivalMins)}`;

                if (isInterpolated) {
                  coords = [
                    startCoord[0] + (endCoord[0] - startCoord[0]) * ratio,
                    startCoord[1] + (endCoord[1] - startCoord[1]) * ratio,
                  ];
                  regionKey = ratio >= 0.5 ? userBaseLocation.regionKey : prevLocInfo.regionKey;
                } else {
                  coords = startCoord;
                  regionKey = prevLocInfo.regionKey;
                }
              }
            }
          } else if (nextEv && !isBaseOfficeScheduledEvent(nextEv, userBaseLocation)) {
            // ★ 1件目の予定（A現場）の前：想定出発時刻(8:00)までは拠点滞在、8:00〜A現場開始でA現場へ移動
            const departMins = Math.min(assumedDepMins, nextStartMins);
            if (selectedMinutes < departMins) {
              statusType = 'at_base';
              locationName = userBaseLocation.name;
              coords = userBaseLocation.coords;
              regionKey = userBaseLocation.regionKey;
              nextEvent = nextEv;
              nextLocationName = nextEv.location || nextEv.title;
            } else {
              statusType = 'in_transit';
              prevLocationName = userBaseLocation.name;
              nextLocationName = nextEv.location || nextEv.title || '次現場';
              nextEvent = nextEv;
              locationName = userBaseLocation.name;

              const startCoord = userBaseLocation.coords;
              const nextLocInfo = resolveLocationInfo(nextEv.location || nextEv.title, userBaseLocation);
              const endCoord = nextLocInfo.coords;
              originCoords = startCoord;
              destCoords = endCoord;
              destLabel = nextLocationName;

              const span = Math.max(1, nextStartMins - departMins);
              const ratio = Math.max(0, Math.min(1, (selectedMinutes - departMins) / span));
              transitProgressRatio = ratio;
              transitWindowStr = `${formatMinutesToTimeStr(departMins)} - ${formatMinutesToTimeStr(nextStartMins)}`;

              if (isInterpolated) {
                coords = [
                  startCoord[0] + (endCoord[0] - startCoord[0]) * ratio,
                  startCoord[1] + (endCoord[1] - startCoord[1]) * ratio,
                ];
                regionKey = ratio >= 0.5 ? nextLocInfo.regionKey : userBaseLocation.regionKey;
              } else {
                coords = startCoord;
                regionKey = userBaseLocation.regionKey;
              }
            }
          } else {
            statusType = 'at_base';
            locationName = userBaseLocation.name;
            coords = userBaseLocation.coords;
            regionKey = userBaseLocation.regionKey;
            if (nextEv) {
              nextEvent = nextEv;
              nextLocationName = nextEv.location || nextEv.title;
            }
          }
        }

        let statusDisplay = '';
        if (statusType === 'on_site') {
          statusDisplay = `📍 「${locationName}」滞在中`;
        } else if (statusType === 'in_transit') {
          if (isReturningToBase) {
            statusDisplay = `🚗 「${prevLocationName}」から帰社中`;
          } else {
            statusDisplay = `🚗 「${prevLocationName}」から移動中` + (nextLocationName ? ` → 「${nextLocationName}」へ` : '');
          }
        } else {
          statusDisplay = currentEvent
            ? `${officeBadge} （${currentEvent.title || userBaseLocation.address}）`
            : `${officeBadge} （${userBaseLocation.address}）`;
        }

        let timeRangeDisplay = '';
        if (statusType === 'in_transit' && transitWindowStr) {
          timeRangeDisplay = `移動想定: ${transitWindowStr}`;
        } else if (currentEvent) {
          timeRangeDisplay = `${formatTimeJST(currentEvent.start)} - ${currentEvent.end ? formatTimeJST(currentEvent.end) : ''}`;
        } else if (nextEvent) {
          timeRangeDisplay = `次: ${formatTimeJST(nextEvent.start)}〜`;
        }

        return {
          member,
          statusType,
          locationName,
          officeBadge,
          prevLocationName,
          nextLocationName,
          isReturningToBase,
          originCoords,
          destCoords,
          destLabel,
          transitProgressRatio,
          currentEvent,
          nextEvent,
          coords,
          spiderCoords: coords,
          regionKey,
          statusDisplay,
          timeRangeDisplay,
        };
      })
      .filter((s): s is MemberLocationStatus => s !== null);

    // 拠点座標ごとにグループ化して引き出し線 (Spiderfy) 放射配置を計算
    // ★ 要望②: 拡大（ズームイン）時に重ならない距離を画面ピクセル単位で保ちつつ極力地図上の位置に近づく処理
    const coordGroups: Record<string, typeof rawStatuses> = {};
    rawStatuses.forEach((st) => {
      const key = `${st.coords[0].toFixed(3)}_${st.coords[1].toFixed(3)}`;
      if (!coordGroups[key]) coordGroups[key] = [];
      coordGroups[key].push(st);
    });

    Object.values(coordGroups).forEach((group) => {
      const N = group.length;
      if (N === 1) {
        group[0].spiderCoords = [group[0].coords[0], group[0].coords[1]];
      } else {
        const centerLat = group[0].coords[0];
        const centerLng = group[0].coords[1];
        const map = mapInstanceRef.current;

        group.forEach((st, idx) => {
          st.spiderCoords = calculateSpiderCoordsForMember(
            centerLat,
            centerLng,
            N,
            idx,
            currentZoom,
            map
          );
        });
      }
    });

    return rawStatuses;
  }, [teamMembers, events, currentDate, selectedMinutes, lastRefreshedAt, offices, currentZoom, transitSettings]);

  const filteredMemberStatuses = useMemo(() => {
    return memberStatuses.filter((s) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = s.member.name.toLowerCase().includes(q);
        const locMatch = s.statusDisplay.toLowerCase().includes(q);
        const deptMatch = (s.member.department || '').toLowerCase().includes(q);
        return nameMatch || locMatch || deptMatch;
      }
      return true;
    });
  }, [memberStatuses, searchQuery]);

  // ★ 要望①: グルーピング名（名古屋拠点など）をクリックしたら、そこにいるメンバーを全員明るく一括ハイライト
  const handleSelectHub = useCallback((hubKey: string, coords: [number, number]) => {
    // 既に選択中のグループならトグル解除
    if (selectedHubKey === hubKey && !selectedMemberStatus) {
      setSelectedHubKey(null);
      return;
    }
    setSelectedHubKey(hubKey);
    setSelectedMemberStatus(null); // 個別単体フォーカスを解除し、所属メンバー全員を明るく均一にハイライト

    const map = mapInstanceRef.current;
    if (!map) return;
    map.closePopup();

    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const currentMapZoom = map.getZoom();
    const targetZoom = Math.max(currentMapZoom, 11);
    map.flyTo(coords, targetZoom, {
      duration: 0.6,
      easeLinearity: 0.25,
    });
  }, [selectedHubKey, selectedMemberStatus]);

  // ★ 要望: メンバー選択時の移動先を前もって計算し、アイコンとズームアップを自然に同期移動させるハンドラー
  const handleSelectMember = useCallback((status: MemberLocationStatus) => {
    setSelectedMemberStatus(status);
    setSelectedHubKey(null);
    const map = mapInstanceRef.current;
    if (!map) return;

    // 既存のアニメーションループがあれば即座にキャンセル
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const currentMapZoom = map.getZoom();
    const hasDistinctDest =
      status.statusType === 'in_transit' &&
      Boolean(status.destCoords) &&
      (Math.abs(status.coords[0] - status.destCoords![0]) >= 0.0005 ||
        Math.abs(status.coords[1] - status.destCoords![1]) >= 0.0005);

    const routeBounds = hasDistinctDest
      ? L.latLngBounds([status.coords, status.destCoords!])
      : null;

    // 移動中の場合は出発地と移動先の両方が画面に収まるズームレベルを算出
    const targetZoom = routeBounds
      ? Math.max(7, Math.min(13, map.getBoundsZoom(routeBounds, false, L.point(140, 140))))
      : Math.max(currentMapZoom, 12);

    // 1. 移動先の展開座標 (targetSpiderCoords) を前もって計算！
    const hubKey = `${status.coords[0].toFixed(3)}_${status.coords[1].toFixed(3)}`;
    const clusterGroup = filteredMemberStatuses.filter(
      (s) => `${s.coords[0].toFixed(3)}_${s.coords[1].toFixed(3)}` === hubKey
    );
    const totalInGroup = clusterGroup.length;
    const memberIdx = clusterGroup.findIndex((s) => s.member.id === status.member.id);

    const targetSpiderCoords = calculateSpiderCoordsForMember(
      status.coords[0],
      status.coords[1],
      totalInGroup,
      memberIdx >= 0 ? memberIdx : 0,
      targetZoom,
      map
    );

    // 2. 同一拠点・現場にいる全メンバーの目標ズーム座標も事前計算（クラスタ全体が目標ズームの半径へ自然に同時収束）
    const clusterTargets: {
      memberId: string | number;
      marker: L.Marker;
      line?: L.Polyline;
      startLat: number;
      startLng: number;
      destLat: number;
      destLng: number;
      hubCoords: [number, number];
      isSelected: boolean;
    }[] = [];

    clusterGroup.forEach((s, idx) => {
      const marker = markersByMemberIdRef.current.get(s.member.id);
      if (!marker) return;
      const line = linesByMemberIdRef.current.get(s.member.id);
      const startLatLng = marker.getLatLng();
      const dest = calculateSpiderCoordsForMember(
        s.coords[0],
        s.coords[1],
        totalInGroup,
        idx,
        targetZoom,
        map
      );
      clusterTargets.push({
        memberId: s.member.id,
        marker,
        line,
        startLat: startLatLng.lat,
        startLng: startLatLng.lng,
        destLat: dest[0],
        destLng: dest[1],
        hubCoords: s.coords,
        isSelected: s.member.id === status.member.id,
      });
    });

    const duration = 900; // 0.9秒（フライアニメーションと完全一致）
    const startTime = performance.now();

    // 加速と減速が自然な3次イージング関数 (Cubic Easing)
    const easeInOutCubic = (t: number) => {
      return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    };

    map.closePopup();

    // 3. マップカメラを移動先も含めてズーム＆パン（移動中は出発地〜移動先が収まるように調整）
    if (routeBounds) {
      map.flyToBounds(routeBounds, {
        padding: [70, 70],
        maxZoom: 13,
        duration: duration / 1000,
        easeLinearity: 0.25,
      });
    } else {
      map.flyTo(targetSpiderCoords, targetZoom, {
        duration: duration / 1000,
        easeLinearity: 0.25,
      });
    }

    // 4. アイコンと引き出し線（＋移動先点線）を目標位置へ向けて滑らかに完全同期移動
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeInOutCubic(progress);

      clusterTargets.forEach((item) => {
        const curLat = item.startLat + (item.destLat - item.startLat) * ease;
        const curLng = item.startLng + (item.destLng - item.startLng) * ease;
        const liveMarker = markersByMemberIdRef.current.get(item.memberId) || item.marker;
        const liveLine = linesByMemberIdRef.current.get(item.memberId) || item.line;
        liveMarker.setLatLng([curLat, curLng]);
        if (liveLine) {
          liveLine.setLatLngs([item.hubCoords, [curLat, curLng]]);
        }
        if (item.isSelected && transitLinesRef.current.length > 0) {
          transitLinesRef.current.forEach(({ line: tLine, dest }) => {
            tLine.setLatLngs([[curLat, curLng], dest]);
          });
        }
      });

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
        // 最終位置を確定し、選択されたメンバーの吹き出しを開く
        clusterTargets.forEach((item) => {
          const liveMarker = markersByMemberIdRef.current.get(item.memberId) || item.marker;
          const liveLine = linesByMemberIdRef.current.get(item.memberId) || item.line;
          liveMarker.setLatLng([item.destLat, item.destLng]);
          if (liveLine) {
            liveLine.setLatLngs([item.hubCoords, [item.destLat, item.destLng]]);
          }
          if (item.isSelected) {
            if (transitLinesRef.current.length > 0) {
              transitLinesRef.current.forEach(({ line: tLine, dest }) => {
                tLine.setLatLngs([[item.destLat, item.destLng], dest]);
              });
            }
            liveMarker.openPopup();
          }
        });
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, [filteredMemberStatuses]);

  // ★ 対策A+B複合: Leaflet 地図インスタンスおよびハブ（起点ドット）・引き出し線・アニメーション発光ハイライト描画
  useEffect(() => {
    // 簡易エリア別カード表示に切り替わった場合は、旧DOMに紐づくLeafletインスタンスを破棄して次回マップ復帰時に確実に再生成する
    if (displayMode === 'cards' || !mapContainerRef.current) {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
        animFrameRef.current = null;
      }
      if (mapInstanceRef.current) {
        try {
          mapInstanceRef.current.remove();
        } catch {
          // ignore remove error
        }
        mapInstanceRef.current = null;
        tileLayerRef.current = null;
        markersLayerRef.current = null;
        markersByMemberIdRef.current.clear();
        linesByMemberIdRef.current.clear();
        transitLinesRef.current = [];
      }
      hasAutoFittedInitialViewRef.current = false;
      return;
    }

    // 既存インスタンスのコンテナDOMが差し替わっている場合も安全に破棄して再初期化
    if (mapInstanceRef.current && mapInstanceRef.current.getContainer() !== mapContainerRef.current) {
      try {
        mapInstanceRef.current.remove();
      } catch {
        // ignore remove error
      }
      mapInstanceRef.current = null;
      tileLayerRef.current = null;
      markersLayerRef.current = null;
      hasAutoFittedInitialViewRef.current = false;
    }

    let isNewlyCreatedMap = false;
    if (!mapInstanceRef.current) {
      isNewlyCreatedMap = true;
      const map = L.map(mapContainerRef.current, {
        center: [35.1814, 136.9064],
        zoom: currentZoom || 9,
        zoomControl: true,
      });

      map.on('zoomend', () => {
        setCurrentZoom(map.getZoom());
      });

      // マップ背景クリックでハイライト解除
      map.on('click', () => {
        setSelectedMemberStatus(null);
        setSelectedHubKey(null);
      });

      const tile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      tileLayerRef.current = tile;
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    // 地図タイルのCSSフィルター切り替え
    if (tileLayerRef.current) {
      const container = tileLayerRef.current.getContainer();
      if (container) {
        if (mapStyle === 'light') {
          container.style.filter = 'brightness(1.08) contrast(0.85) saturate(0.55) sepia(0.05)';
        } else if (mapStyle === 'dark') {
          container.style.filter = 'invert(0.9) hue-rotate(180deg) brightness(0.85) contrast(1.2)';
        } else {
          container.style.filter = 'none';
        }
      }
    }

    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();
      markersByMemberIdRef.current.clear();
      linesByMemberIdRef.current.clear();
      transitLinesRef.current = [];

      const drawnHubs = new Set<string>();
      const highlightedMemberId = selectedMemberStatus?.member.id;

      filteredMemberStatuses.forEach((status) => {
        const { member, statusType, coords, spiderCoords, statusDisplay, locationName, officeBadge } = status;
        const hubKey = `${coords[0].toFixed(3)}_${coords[1].toFixed(3)}`;
        const isSelected = highlightedMemberId === member.id;
        const isInSelectedHub = Boolean(selectedHubKey && selectedHubKey === hubKey);
        const isHighlighted = isSelected || isInSelectedHub;
        const isAnySelected = Boolean(highlightedMemberId || selectedHubKey);

        const clusterGroup = filteredMemberStatuses.filter((s) => `${s.coords[0].toFixed(3)}_${s.coords[1].toFixed(3)}` === hubKey);
        const isClustered = clusterGroup.length > 1;

        // 【対策A】起点の中心拠点ハブピン（Hub Marker）＆起点ドット（Origin Dot）の配置
        if (!drawnHubs.has(hubKey)) {
          drawnHubs.add(hubKey);
          const count = clusterGroup.length;

          // 起点ドット (Origin Dot) - 選択・グループ選択時は青色強調
          const isThisHubActive = selectedHubKey === hubKey;
          const isThisHubSelected = isThisHubActive || clusterGroup.some((s) => s.member.id === highlightedMemberId);
          const dotColor = isThisHubSelected ? '#2563eb' : (mapStyle === 'dark' ? '#60a5fa' : '#3b82f6');
          const originDot = L.circleMarker(coords, {
            radius: isThisHubSelected ? 7 : 5,
            fillColor: dotColor,
            fillOpacity: 1,
            color: '#ffffff',
            weight: isThisHubSelected ? 2.5 : 2,
          });
          markersLayerRef.current!.addLayer(originDot);

          // ★ 要望①: 密集拠点ハブタグ（クリックで所属メンバー全員を一括明るく表示）
          if (isClustered) {
            let hubName = '';
            // 1. 名古屋拠点（清水）または各営業所拠点と合致しているか判定
            const isAtNagoyaBase =
              Math.abs(coords[0] - DEFAULT_HEADQUARTERS.coords[0]) < 0.005 &&
              Math.abs(coords[1] - DEFAULT_HEADQUARTERS.coords[1]) < 0.005;

            if (isAtNagoyaBase) {
              hubName = '名古屋拠点 (清水)';
            } else {
              const matchedOffice = Object.values(OFFICE_BASE_LOCATIONS).find(
                (b) => Math.abs(b.coords[0] - coords[0]) < 0.005 && Math.abs(b.coords[1] - coords[1]) < 0.005
              );
              if (matchedOffice) {
                hubName = matchedOffice.name;
              } else {
                // 2. 現場・エリア座標での集約（例: 鳴海, 熱田区, 豊田市, みよし市など）
                const matchedPreset = Object.entries(PRESET_SPECIFIC_SPOTS).find(
                  ([_, info]) => Math.abs(info.coords[0] - coords[0]) < 0.005 && Math.abs(info.coords[1] - coords[1]) < 0.005
                ) || Object.entries(MUNICIPALITY_COORDINATES).find(
                  ([_, info]) => Math.abs(info.coords[0] - coords[0]) < 0.005 && Math.abs(info.coords[1] - coords[1]) < 0.005
                );
                if (matchedPreset) {
                  hubName = matchedPreset[0].split('(')[0];
                } else {
                  hubName = locationName.length > 10 ? locationName.substring(0, 9) + '…' : locationName;
                }
              }
            }

            const hubBorder = isThisHubActive
              ? '2.5px solid #38bdf8'
              : (isThisHubSelected ? '2px solid #3b82f6' : '1.5px solid #6366f1');
            const hubBg = isThisHubActive ? 'rgba(30, 58, 138, 0.96)' : 'rgba(15, 23, 42, 0.92)';
            const hubShadow = isThisHubActive
              ? '0 0 0 4px rgba(56, 189, 248, 0.5), 0 6px 18px rgba(0,0,0,0.5)'
              : '0 4px 12px rgba(0,0,0,0.4)';
            const hubScale = isThisHubActive ? 'transform: scale(1.08);' : '';

            const hubIconHtml = `
              <div style="display: flex; align-items: center; gap: 5px; background: ${hubBg}; color: #ffffff; font-size: 11px; font-weight: 800; padding: 3px 10px; border-radius: 9999px; box-shadow: ${hubShadow}; border: ${hubBorder}; white-space: nowrap; cursor: pointer; transition: all 0.2s; ${hubScale}" title="クリックでこの拠点・現場のメンバー（${count}名）全員を一括ハイライト表示">
                <span style="display: inline-block; width: 7px; height: 7px; border-radius: 9999px; background: ${isThisHubActive ? '#38bdf8' : '#60a5fa'}; ${isThisHubActive ? 'box-shadow: 0 0 6px #38bdf8;' : ''}"></span>
                <span>${hubName} (${count}名)</span>
                ${isThisHubActive ? '<span style="font-size: 9px; background: #2563eb; color: #ffffff; padding: 1px 5px; border-radius: 9999px; margin-left: 2px;">全員表示中</span>' : ''}
              </div>
            `;
            const hubIcon = L.divIcon({
              html: hubIconHtml,
              className: 'location-hub-marker',
              iconSize: [isThisHubActive ? 125 : 110, 28],
              iconAnchor: [isThisHubActive ? 62 : 55, 14],
            });
            const hubMarker = L.marker(coords, {
              icon: hubIcon,
              zIndexOffset: isThisHubActive ? 1200 : 600,
            });
            hubMarker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
              handleSelectHub(hubKey, coords);
            });
            markersLayerRef.current!.addLayer(hubMarker);
          }
        }

        // 【要請③: 線と枠の強調の色を青に】起点ドットからアバターピンへの引き出し線 (Spider Line)
        if (isClustered) {
          const isLineActive = isHighlighted || !isAnySelected;
          const lineColor = isHighlighted ? '#2563eb' : (mapStyle === 'dark' ? '#60a5fa' : '#3b82f6');
          const lineWeight = isHighlighted ? 3.5 : 2;
          const lineOpacity = isHighlighted ? 1.0 : (isAnySelected ? 0.2 : 0.85);

          const line = L.polyline([coords, spiderCoords], {
            color: lineColor,
            weight: lineWeight,
            dashArray: isHighlighted ? undefined : '4,4',
            opacity: lineOpacity,
          });
          linesByMemberIdRef.current.set(member.id, line);
          markersLayerRef.current!.addLayer(line);
        }

        // アバター外枠カラーによるステータス識別（文字バッジを排除して密集・重なりを解消）
        let statusBorderColor = '#6366f1'; // 本社・拠点
        if (statusType === 'on_site') {
          statusBorderColor = '#10b981'; // 現場・作業中 (エメラルドグリーン)
        } else if (statusType === 'in_transit') {
          statusBorderColor = '#f59e0b'; // 移動中 (アンバー)
        }

        // 枠スタイル: 選択時は青色強調リング、グループ選択時は所属メンバー全員を明るく鮮明なリング＆微拡大で表示
        let ringEffectStyle = '';
        if (isSelected) {
          ringEffectStyle = 'border: 3.5px solid #2563eb !important; box-shadow: 0 0 0 4px rgba(37,99,235,0.45), 0 4px 14px rgba(0,0,0,0.35) !important; transform: scale(1.15); z-index: 50;';
        } else if (isInSelectedHub) {
          ringEffectStyle = `border: 3px solid ${statusBorderColor} !important; box-shadow: 0 0 0 3.5px rgba(56, 189, 248, 0.45), 0 4px 12px rgba(0,0,0,0.35) !important; transform: scale(1.08); z-index: 40;`;
        } else {
          ringEffectStyle = `border: 2.5px solid ${statusBorderColor} !important; box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;`;
        }

        const avatarOpacity = isAnySelected && !isHighlighted ? '0.35' : '1';
        const avatarUrl = member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`;

        const labelBg = isSelected ? '#1d4ed8' : (isInSelectedHub ? '#1e293b' : '#0f172a');
        const labelBorder = isSelected ? '2px solid #93c5fd' : (isInSelectedHub ? '2px solid #38bdf8' : '1.5px solid #334155');
        const labelShadow = isSelected ? '0 0 10px rgba(59,130,246,0.6)' : (isInSelectedHub ? '0 0 8px rgba(56,189,248,0.5)' : '0 3px 8px rgba(0,0,0,0.5)');

        // ★ 要望①: グルーピング名クリック時、そこにいるメンバー全員を明るく鮮明に表示！
        const customIconHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none; opacity: ${avatarOpacity}; transition: opacity 0.2s;">
            <!-- Avatar Ring: 外枠色で移動中(黄)/作業中(緑)/拠点(藍)/選択(青)をすっきり表現 -->
            <div style="position: relative; width: 38px; height: 38px; border-radius: 9999px; background: #ffffff; transition: transform 0.2s; ${ringEffectStyle}">
              <img src="${avatarUrl}" style="width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; object-fit: cover !important; border-radius: 9999px !important; display: block;" alt="${member.name}" />
            </div>
            <!-- Name Label Card: グループ選択時も全員明るく鮮明に視認可能 -->
            <div style="margin-top: 4px; padding: 2px 8px; background: ${labelBg}; color: #ffffff !important; font-weight: 800; font-size: 11px; line-height: 1.25; border-radius: 6px; border: ${labelBorder}; box-shadow: ${labelShadow}; white-space: nowrap; text-align: center; letter-spacing: 0.02em; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.9);">
              ${member.name}
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: customIconHtml,
          className: 'custom-member-marker',
          iconSize: [84, 58],
          iconAnchor: [42, 19],
        });

        const marker = L.marker(spiderCoords, { icon: customIcon });

        const popupContent = document.createElement('div');
        popupContent.className = 'p-1 text-slate-800 text-xs min-w-[220px] font-sans';
        popupContent.innerHTML = `
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
            <img src="${avatarUrl}" className="w-8 h-8 rounded-full object-cover border border-slate-200" style="width:32px !important;height:32px !important;max-width:32px !important;max-height:32px !important;object-fit:cover !important;border-radius:9999px !important;" />
            <div>
              <div className="font-bold text-sm text-slate-900 whitespace-nowrap">${member.name}</div>
              <div className="text-[10px] text-slate-500">${member.department || '所属未指定'}</div>
            </div>
          </div>
          <div className="mt-2 space-y-1">
            <div className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-1 rounded border border-indigo-100">
              ${statusDisplay}
            </div>
            ${status.timeRangeDisplay ? `<div className="text-[10px] text-slate-500 flex items-center gap-1 mt-1"><span className="font-semibold">時間:</span> ${status.timeRangeDisplay}</div>` : ''}
          </div>
        `;

        marker.bindPopup(popupContent);
        marker.on('click', () => {
          handleSelectMember(status);
        });

        markersByMemberIdRef.current.set(member.id, marker);
        markersLayerRef.current?.addLayer(marker);

        // ★ 個人選択時かつ移動中の場合：移動先を点線で結び、到着地点をポイント＆ラベル表示
        if (isSelected && statusType === 'in_transit' && status.destCoords) {
          const destCoords = status.destCoords;
          const isDistinctDest =
            Math.abs(coords[0] - destCoords[0]) >= 0.0005 ||
            Math.abs(coords[1] - destCoords[1]) >= 0.0005;

          if (isDistinctDest) {
            const destTitle = status.destLabel || status.nextLocationName || (status.isReturningToBase ? '所属拠点' : '移動先');
            const prefixIcon = status.isReturningToBase ? '🏢 帰社先' : '🏁 移動先';

            // 視認性を高める白下地＋アンバー点線の二重ライン
            const routeUnderlay = L.polyline([spiderCoords, destCoords], {
              color: '#ffffff',
              weight: 6,
              dashArray: '8, 8',
              opacity: 0.85,
              lineCap: 'round',
              interactive: false,
            });
            const routeLine = L.polyline([spiderCoords, destCoords], {
              color: '#f59e0b',
              weight: 3.5,
              dashArray: '8, 8',
              opacity: 0.98,
              lineCap: 'round',
              interactive: false,
            });
            markersLayerRef.current?.addLayer(routeUnderlay);
            markersLayerRef.current?.addLayer(routeLine);
            transitLinesRef.current.push(
              { line: routeUnderlay, dest: destCoords },
              { line: routeLine, dest: destCoords }
            );

            // 移動先ターゲットの外輪＋中心ポイント
            const destOuterRing = L.circleMarker(destCoords, {
              radius: 14,
              color: '#f59e0b',
              weight: 2,
              dashArray: '3, 3',
              fillColor: '#f59e0b',
              fillOpacity: 0.16,
              interactive: false,
            });
            const destPointDot = L.circleMarker(destCoords, {
              radius: 7,
              fillColor: '#f59e0b',
              fillOpacity: 1,
              color: '#ffffff',
              weight: 2.5,
            });
            destPointDot.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
            });
            markersLayerRef.current?.addLayer(destOuterRing);
            markersLayerRef.current?.addLayer(destPointDot);

            // 移動先ラベルバッジ（ポイントのすぐ上に表示）
            const safeDestTitle = destTitle.replace(/</g, '&lt;').replace(/>/g, '&gt;');
            const destLabelHtml = `
              <div style="display: inline-flex; align-items: center; gap: 4px; background: rgba(15, 23, 42, 0.94); color: #ffffff; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 9999px; border: 2px solid #f59e0b; box-shadow: 0 4px 12px rgba(0,0,0,0.4); white-space: nowrap; transform: translate(-50%, -100%);">
                <span style="color: #fbbf24;">${prefixIcon}:</span>
                <span>${safeDestTitle}</span>
              </div>
            `;
            const destLabelIcon = L.divIcon({
              html: destLabelHtml,
              className: 'transit-destination-label',
              iconSize: [0, 0],
              iconAnchor: [0, 14],
            });
            const destLabelMarker = L.marker(destCoords, {
              icon: destLabelIcon,
              zIndexOffset: 1300,
            });
            destLabelMarker.on('click', (e) => {
              L.DomEvent.stopPropagation(e);
            });
            markersLayerRef.current?.addLayer(destLabelMarker);
          }
        }
      });

      // ★ 初期表示時（およびチーム構成変更時）：極力チーム全員が画面内に収まるよう位置・縮尺を自動調整
      const map = mapInstanceRef.current;
      if (map && !hasAutoFittedInitialViewRef.current && !selectedMemberStatus && !selectedHubKey && filteredMemberStatuses.length > 0) {
        const fitAllMembers = () => {
          if (!mapInstanceRef.current || mapInstanceRef.current !== map) return false;
          const rect = mapContainerRef.current?.getBoundingClientRect();
          if (!rect || rect.width < 50 || rect.height < 50) return false;

          map.invalidateSize();
          const points: [number, number][] = [];
          filteredMemberStatuses.forEach((st) => {
            points.push(st.coords);
            points.push(st.spiderCoords);
          });
          if (points.length === 0) return false;

          const bounds = L.latLngBounds(points);
          map.fitBounds(bounds, {
            paddingTopLeft: [65, 80],
            paddingBottomRight: [65, 55],
            maxZoom: 12,
            animate: false,
          });
          setCurrentZoom(map.getZoom());
          hasAutoFittedInitialViewRef.current = true;
          return true;
        };

        if (!fitAllMembers()) {
          requestAnimationFrame(() => {
            if (!fitAllMembers()) {
              setTimeout(() => {
                fitAllMembers();
              }, 120);
            }
          });
        }
      } else if (isNewlyCreatedMap && map) {
        requestAnimationFrame(() => {
          map.invalidateSize();
        });
        setTimeout(() => {
          if (mapInstanceRef.current === map) {
            map.invalidateSize();
          }
        }, 120);
      }
    }
  }, [filteredMemberStatuses, mapStyle, displayMode, selectedMemberStatus, selectedHubKey, handleSelectMember, handleSelectHub]);

  // 現在時刻に復帰
  const handleResetToCurrentTime = () => {
    setIsLiveTracking(true);
    setSelectedMinutes(getCurrentJstMinutes());
  };

  // 簡易エリア区分カード用定義
  const REGION_SECTIONS: { key: MemberLocationStatus['regionKey']; title: string; subtitle: string; bg: string; border: string }[] = [
    { key: 'nagoya_owari', title: '🏢 尾張・名古屋エリア', subtitle: '本社・名古屋市・一宮・春日井・小牧等', bg: 'bg-indigo-50/80', border: 'border-indigo-200' },
    { key: 'mikawa', title: '🏭 三河エリア', subtitle: '岡崎・豊田・みよし・豊橋・安城・刈谷等', bg: 'bg-blue-50/80', border: 'border-blue-200' },
    { key: 'gifu', title: '⛰️ 岐阜エリア', subtitle: '岐阜市・大垣・各務原・多治見・可児等', bg: 'bg-emerald-50/80', border: 'border-emerald-200' },
    { key: 'mie', title: '⚓ 三重エリア', subtitle: '四日市・津・鈴鹿・桑名・伊勢等', bg: 'bg-amber-50/80', border: 'border-amber-200' },
    { key: 'shizuoka', title: '🍵 静岡エリア', subtitle: '静岡市・浜松・沼津・富士・磐田等', bg: 'bg-teal-50/80', border: 'border-teal-200' },
    { key: 'tokyo', title: '🗼 東京・関東エリア', subtitle: '東京支店・23区・多摩・神奈川・埼玉等', bg: 'bg-purple-50/80', border: 'border-purple-200' },
    { key: 'osaka', title: '🐙 関西エリア', subtitle: '大阪支店・大阪府・京都・兵庫等', bg: 'bg-rose-50/80', border: 'border-rose-200' },
    { key: 'other', title: '🗾 その他全国エリア', subtitle: '他道県・出張先・広域現場', bg: 'bg-slate-50/80', border: 'border-slate-200' },
  ];

  return (
    <div className={`flex flex-col h-full relative overflow-hidden rounded-xl border transition-colors shadow-xs ${
      displayMode === 'map' && mapStyle === 'dark' ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-slate-50 border-slate-200 text-slate-800'
    }`}>
      {/* 1. Header Toolbar */}
      <div className={`p-3 border-b flex flex-wrap items-center justify-between gap-3 shrink-0 z-20 shadow-2xs ${
        displayMode === 'map' && mapStyle === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
            <Navigation className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold flex items-center gap-2">
              <span>{displayMode === 'cards' ? '簡易エリア別カード一覧 (東海4県)' : 'チーム現在地マップ (東海4県)'}</span>
              {isLiveTracking ? (
                <span className="text-xs font-extrabold px-2 py-0.5 bg-emerald-100 text-emerald-800 border border-emerald-200 rounded-full flex items-center gap-1">
                  <span className="w-1.5 h-1.5 bg-emerald-600 rounded-full animate-ping" />
                  リアルタイム ({selectedTimeStr})
                </span>
              ) : (
                <span className="text-xs font-extrabold px-2 py-0.5 bg-amber-100 text-amber-800 border border-amber-200 rounded-full">
                  時間シミュレーション ({selectedTimeStr})
                </span>
              )}
            </h3>
            <p className="text-[11px] opacity-70">
              {displayMode === 'cards'
                ? '所属拠点・現在地の東海4県エリア別グループカード一覧'
                : '起点ドット＆アニメーション発光ハイライト / 所属拠点デフォルト対応'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Map Style Selector */}
          {displayMode === 'map' && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-slate-700">
              <span className="px-1.5 text-[10px] font-bold text-slate-500">地図色:</span>
              <button
                onClick={() => setMapStyle('light')}
                className={`px-2 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                  mapStyle === 'light' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
                title="減色ライトカラー調（アバター強調）"
              >
                <Sun className="w-3 h-3 text-amber-500" />
                <span>減色</span>
              </button>
              <button
                onClick={() => setMapStyle('standard')}
                className={`px-2 py-1 rounded text-xs font-bold transition-all ${
                  mapStyle === 'standard' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                標準
              </button>
              <button
                onClick={() => setMapStyle('dark')}
                className={`px-2 py-1 rounded text-xs font-bold transition-all flex items-center gap-1 ${
                  mapStyle === 'dark' ? 'bg-slate-800 text-indigo-400 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Moon className="w-3 h-3 text-indigo-400" />
                <span>ダーク</span>
              </button>
            </div>
          )}

          {/* Auto Refresh Toggle */}
          <div className="flex items-center bg-slate-100 p-1 rounded-lg border border-slate-200 gap-1 text-slate-700">
            <button
              onClick={() => setIsAutoRefreshEnabled(!isAutoRefreshEnabled)}
              className={`px-2 py-1 rounded font-bold transition-all flex items-center gap-1 text-xs ${
                isAutoRefreshEnabled ? 'bg-indigo-600 text-white shadow-2xs' : 'bg-slate-200 text-slate-600 hover:bg-slate-300'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
              <span>自動更新</span>
            </button>

            {isAutoRefreshEnabled && (
              <select
                value={refreshIntervalMins}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  setRefreshIntervalMins(val);
                  setCountdownSeconds(val * 60);
                }}
                className="bg-white text-slate-700 font-bold px-1.5 py-1 text-[11px] rounded border border-slate-300 focus:outline-none cursor-pointer"
              >
                <option value={1}>1分</option>
                <option value={3}>3分</option>
                <option value={5}>5分</option>
              </select>
            )}
          </div>

          {/* 移動を仮表示 チェックボックス + 設定(歯車)ボタン */}
          <div className="flex items-center bg-slate-100 px-2 py-1 rounded-lg border border-slate-200 gap-2 text-slate-700">
            <label
              className="flex items-center gap-1.5 cursor-pointer select-none font-bold text-xs text-slate-800"
              title="オンの場合、出発地から次の目的地までの時間を按分し、移動中の現在地をリアルタイムに推定配置します"
            >
              <input
                type="checkbox"
                checked={transitSettings.isInterpolatedTransitEnabled}
                onChange={(e) =>
                  setTransitSettings((prev) => ({
                    ...prev,
                    isInterpolatedTransitEnabled: e.target.checked,
                  }))
                }
                className="w-3.5 h-3.5 rounded accent-amber-500 cursor-pointer"
              />
              <span>🚗 移動を仮表示</span>
            </label>
            <button
              type="button"
              onClick={() => setIsTransitSettingsModalOpen(true)}
              className="p-1 rounded-md bg-white hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 transition-colors cursor-pointer flex items-center gap-1"
              title={`移動シミュレーション設定（想定出発 ${transitSettings.assumedDepartureTime} / 想定帰社 ${transitSettings.assumedReturnTime} / 超過時 +${transitSettings.overtimeReturnDurationHours}h）`}
            >
              <Settings className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="検索..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-8 pr-3 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none w-28 sm:w-36 text-slate-800"
            />
          </div>
        </div>
      </div>

      {/* 2. Main Area: Map View or Standalone Cards View */}
      {displayMode === 'cards' ? (
        <div className="flex-1 p-3 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 z-10 bg-slate-100">
          {REGION_SECTIONS.map((sec) => {
            const membersInRegion = filteredMemberStatuses.filter((s) => s.regionKey === sec.key);

            return (
              <div key={sec.key} className={`p-3.5 rounded-xl border shadow-2xs flex flex-col justify-between ${sec.bg} ${sec.border}`}>
                <div>
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200/80">
                    <div>
                      <h4 className="text-xs font-extrabold text-slate-900">{sec.title}</h4>
                      <p className="text-[10px] text-slate-500">{sec.subtitle}</p>
                    </div>
                    <span className="text-xs font-extrabold px-2.5 py-0.5 bg-white rounded-full border border-slate-200 text-indigo-700 shadow-2xs">
                      {membersInRegion.length} 名
                    </span>
                  </div>

                  <div className="mt-2.5 space-y-2 max-h-80 overflow-y-auto pr-1">
                    {membersInRegion.length === 0 ? (
                      <div className="text-[11px] text-slate-400 py-4 text-center">このエリアに所属・滞在している社員はいません</div>
                    ) : (
                      membersInRegion.map((st) => (
                        <div
                          key={st.member.id}
                          onClick={() => setSelectedMemberStatus(st)}
                          className="p-2.5 bg-white rounded-xl border border-slate-200/90 shadow-2xs flex items-center justify-between gap-2 hover:border-indigo-400 hover:shadow-xs transition-all cursor-pointer"
                        >
                          <div className="flex items-center gap-2.5">
                            <img
                              src={st.member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(st.member.name)}&background=random`}
                              onClick={(e) => {
                                e.stopPropagation();
                                triggerOpenUserModal(st.member);
                              }}
                              title={`${st.member.name} の社員詳細を表示`}
                              className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0 hover:ring-2 hover:ring-indigo-400 transition-all cursor-pointer"
                              alt={st.member.name}
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 whitespace-nowrap">
                                <span
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    triggerOpenUserModal(st.member);
                                  }}
                                  title={`${st.member.name} の社員詳細を表示`}
                                  className="hover:text-indigo-600 hover:underline transition-colors cursor-pointer"
                                >
                                  {st.member.name}
                                </span>
                                <span className="text-[10px] text-slate-500 font-normal">
                                  ({st.member.department || '所属未指定'})
                                </span>
                              </div>
                              <div className="text-[10px] font-extrabold mt-0.5">
                                {st.statusType === 'in_transit' && (
                                  <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    {st.isReturningToBase ? (
                                      <>🚗 「{st.prevLocationName}」から帰社中</>
                                    ) : (
                                      <>
                                        🚗 「{st.prevLocationName}」から移動中
                                        {st.nextLocationName && ` → 「${st.nextLocationName}」へ`}
                                      </>
                                    )}
                                  </span>
                                )}
                                {st.statusType === 'on_site' && (
                                  <span className="text-emerald-800 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                                    📍 「{st.locationName}」滞在中
                                  </span>
                                )}
                                {st.statusType === 'at_base' && (
                                  <span className="text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded border border-slate-200">
                                    {st.officeBadge}
                                    {st.currentEvent?.title ? `・${st.currentEvent.title}` : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>

                          {onOpenMemoModal && (
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                onOpenMemoModal(st.member);
                              }}
                              className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                              title={`${st.member.name}さんへ伝言送信`}
                            >
                              <Send className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* Leaflet 地図キャンバス + サイドバー */
        <div className="flex-1 flex flex-col md:flex-row relative overflow-hidden min-h-[420px]">
          {/* Leaflet 地図キャンバス */}
          <div ref={mapContainerRef} className="flex-1 w-full h-full min-h-[380px] z-10" />

          {/* ★ 対策B: リストクリック時も連動ハイライト強調される「メンバー現在地リスト」 */}
          <div className={`w-full md:w-80 border-t md:border-t-0 md:border-l flex flex-col shrink-0 z-20 max-h-[280px] md:max-h-none overflow-hidden ${
            mapStyle === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
          }`}>
            <div className={`p-2.5 border-b flex items-center justify-between text-xs font-bold ${
              mapStyle === 'dark' ? 'bg-slate-900 border-slate-700 text-slate-200' : 'bg-slate-50 border-slate-200 text-slate-700'
            }`}>
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-indigo-500" />
                <span>メンバー現在地リスト ({filteredMemberStatuses.length}名)</span>
              </span>
              {(selectedMemberStatus || selectedHubKey) && (
                <button
                  onClick={() => {
                    setSelectedMemberStatus(null);
                    setSelectedHubKey(null);
                  }}
                  className="text-[10px] text-indigo-600 hover:text-indigo-800 font-bold underline cursor-pointer"
                >
                  ハイライト解除
                </button>
              )}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1">
              {filteredMemberStatuses.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  条件に一致するメンバーはいません
                </div>
              ) : (
                filteredMemberStatuses.map((status) => {
                  const { member, statusType, locationName, officeBadge, prevLocationName, nextLocationName } = status;
                  const isSelected = selectedMemberStatus?.member.id === member.id;
                  const hubKey = `${status.coords[0].toFixed(3)}_${status.coords[1].toFixed(3)}`;
                  const isMemberInSelectedHub = selectedHubKey === hubKey;

                  return (
                    <div
                      key={member.id}
                      onClick={() => {
                        handleSelectMember(status);
                      }}
                      className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/95 border-2 border-blue-500 shadow-md ring-2 ring-blue-300'
                          : isMemberInSelectedHub
                          ? 'bg-sky-50/90 border-2 border-sky-400 shadow-xs ring-1 ring-sky-300'
                          : 'hover:bg-indigo-50/60 border border-transparent'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`}
                            onClick={(e) => {
                              e.stopPropagation();
                              triggerOpenUserModal(member);
                            }}
                            title={`${member.name} の社員詳細を表示`}
                            className={`w-8 h-8 rounded-full object-cover border shrink-0 hover:ring-2 hover:ring-indigo-400 transition-all cursor-pointer ${
                              isSelected ? 'border-blue-600 ring-2 ring-blue-400' : 'border-slate-200'
                            }`}
                            alt={member.name}
                          />
                          <div>
                            <div className="text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap">
                              <span
                                onClick={(e) => {
                                  e.stopPropagation();
                                  triggerOpenUserModal(member);
                                }}
                                title={`${member.name} の社員詳細を表示`}
                                className="hover:text-indigo-600 hover:underline transition-colors cursor-pointer"
                              >
                                {member.name}
                              </span>
                              <span className="text-[10px] opacity-70 font-normal">
                                ({member.department || '所属未指定'})
                              </span>
                            </div>

                            <div className="mt-1">
                              {statusType === 'in_transit' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                  {status.isReturningToBase ? (
                                    <>🚗 「{prevLocationName}」から帰社中</>
                                  ) : (
                                    <>
                                      🚗 「{prevLocationName}」から移動中
                                      {nextLocationName && ` → 「${nextLocationName}」へ`}
                                    </>
                                  )}
                                </span>
                              )}
                              {statusType === 'on_site' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                  📍 「{locationName}」滞在中
                                </span>
                              )}
                              {statusType === 'at_base' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-700 border border-slate-200">
                                  {officeBadge}
                                  {status.currentEvent?.title ? `・${status.currentEvent.title}` : ''}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        {onOpenMemoModal && (
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              onOpenMemoModal(member);
                            }}
                            className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-indigo-100 shrink-0"
                            title={`${member.name}さんへ伝言送信`}
                          >
                            <Send className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}

      {/* 3. Time Slider Control Bar */}
      <div className={`p-3 border-t flex flex-col sm:flex-row items-center gap-3 shrink-0 z-20 shadow-xs ${
        displayMode === 'map' && mapStyle === 'dark' ? 'bg-slate-800 border-slate-700' : 'bg-white border-slate-200'
      }`}>
        <div className="flex items-center gap-2 shrink-0">
          <Clock className="w-4 h-4 text-indigo-500" />
          <span className="text-xs font-bold">時刻シミュレーション:</span>
          <span className="text-sm font-extrabold text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
            {selectedTimeStr}
          </span>

          {!isLiveTracking || !isToday ? (
            <button
              onClick={handleResetToCurrentTime}
              className="px-2 py-1 text-[11px] font-bold bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-md transition-colors flex items-center gap-1 border border-amber-200 shrink-0"
              title="現在時刻（リアルタイム）へ戻る"
            >
              <Zap className="w-3 h-3 text-amber-600 fill-amber-500" />
              <span>現在時刻に復帰</span>
            </button>
          ) : (
            <span className="text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
              現在時刻追従中
            </span>
          )}
        </div>

        {/* Range Slider */}
        <div className="flex-1 w-full flex items-center gap-2">
          <span className="text-[10px] font-bold opacity-50">08:00</span>
          <input
            type="range"
            min={8 * 60}
            max={20 * 60}
            step={15}
            value={selectedMinutes}
            onChange={(e) => {
              setSelectedMinutes(Number(e.target.value));
              setIsLiveTracking(false);
            }}
            className="flex-1 accent-indigo-600 cursor-pointer h-1.5 bg-slate-200 rounded-lg"
          />
          <span className="text-[10px] font-bold opacity-50">20:00</span>
        </div>

        {/* Preset Quick Time Buttons */}
        <div className="flex items-center gap-1 shrink-0">
          {[8, 10, 12, 15, 18].map((h) => (
            <button
              key={h}
              onClick={() => {
                setSelectedMinutes(h * 60);
                setIsLiveTracking(false);
              }}
              className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                Math.floor(selectedMinutes / 60) === h && (!isLiveTracking || !isToday)
                  ? 'bg-indigo-600 text-white border-indigo-600'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
            >
              {String(h).padStart(2, '0')}:00
            </button>
          ))}
        </div>
      </div>

      {/* 4. 移動シミュレーション設定モーダル（歯車ボタン） */}
      {isTransitSettingsModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4"
          onClick={() => setIsTransitSettingsModalOpen(false)}
        >
          <div
            className="bg-white text-slate-800 rounded-2xl shadow-xl border border-slate-200 w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-100 text-amber-700 rounded-lg">
                  <Settings className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-extrabold text-slate-900">移動シミュレーション想定時間設定</h4>
                  <p className="text-[11px] text-slate-500">予定前後の出発・帰社時刻および位置推定ルール</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsTransitSettingsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 space-y-4 text-xs">
              {/* 移動を仮表示 ON/OFF */}
              <label className="flex items-start justify-between gap-3 p-3 rounded-xl bg-amber-50/70 border border-amber-200 cursor-pointer">
                <div>
                  <div className="font-extrabold text-slate-900 flex items-center gap-1.5">
                    <span>🚗 移動を仮表示（リアルタイム位置補間）</span>
                  </div>
                  <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                    オンの場合、前の地点から次の地点までの移動時間帯で経過時間の割合に応じてA地点〜B地点間の現在位置をリアルタイムに推定表示します。
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={transitSettings.isInterpolatedTransitEnabled}
                  onChange={(e) =>
                    setTransitSettings((prev) => ({
                      ...prev,
                      isInterpolatedTransitEnabled: e.target.checked,
                    }))
                  }
                  className="w-4 h-4 mt-0.5 rounded accent-amber-500 shrink-0 cursor-pointer"
                />
              </label>

              {/* 想定出発時間 / 想定帰社時間 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="block font-extrabold text-slate-700 mb-1">
                    想定出発時間
                  </label>
                  <input
                    type="time"
                    step={900}
                    value={transitSettings.assumedDepartureTime}
                    onChange={(e) =>
                      setTransitSettings((prev) => ({
                        ...prev,
                        assumedDepartureTime: e.target.value || '08:00',
                      }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    朝予定がない場合、この時間に出発して最初の現場へ移動開始（初期値 08:00）
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                  <label className="block font-extrabold text-slate-700 mb-1">
                    想定帰社時間
                  </label>
                  <input
                    type="time"
                    step={900}
                    value={transitSettings.assumedReturnTime}
                    onChange={(e) =>
                      setTransitSettings((prev) => ({
                        ...prev,
                        assumedReturnTime: e.target.value || '17:00',
                      }))
                    }
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-mono text-sm font-bold text-slate-900 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">
                    最終地点終了後、この時間に向かって所属拠点へ帰社（初期値 17:00）
                  </p>
                </div>
              </div>

              {/* 最終地点が想定帰社時間を超える場合の帰社時間 */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <label className="block font-extrabold text-slate-700 mb-1">
                  最終地点が想定帰社時間を超える場合の帰社所要時間
                </label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-600 font-semibold">最終予定の終了から</span>
                  <select
                    value={transitSettings.overtimeReturnDurationHours}
                    onChange={(e) =>
                      setTransitSettings((prev) => ({
                        ...prev,
                        overtimeReturnDurationHours: Number(e.target.value) || 1,
                      }))
                    }
                    className="px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-sm text-indigo-700 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                  >
                    <option value={0.5}>0.5時間（30分）</option>
                    <option value={1}>1時間</option>
                    <option value={1.5}>1.5時間（90分）</option>
                    <option value={2}>2時間</option>
                    <option value={3}>3時間</option>
                  </select>
                  <span className="text-slate-600 font-semibold">で帰社</span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1">
                  例: 最終予定が {transitSettings.assumedReturnTime} 以降に終了する場合、終了時刻から {transitSettings.overtimeReturnDurationHours} 時間かけて所属拠点へ帰社します（初期値: 1時間）。
                </p>
              </div>
            </div>

            <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
              <button
                type="button"
                onClick={() => setTransitSettings(DEFAULT_TRANSIT_SETTINGS)}
                className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-200/70 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>初期値に戻す (8:00〜17:00 / 1時間)</span>
              </button>
              <button
                type="button"
                onClick={() => setIsTransitSettingsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg text-xs font-extrabold bg-indigo-600 hover:bg-indigo-700 text-white shadow-xs transition-colors cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
