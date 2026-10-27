import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { User, CalendarEvent, OfficeMaster } from '../types';
import { MapPin, Navigation, Clock, Building, Send, Search, RefreshCw, UserCheck, Zap, Layers, Moon, Sun, LayoutGrid, Check } from 'lucide-react';
import { getLocalDateStr, getJstHourAndMinutes, formatTimeJST } from '../utils/dateUtils';
import { resolveLocationWithFullHierarchy, PRESET_SPECIFIC_SPOTS, MUNICIPALITY_COORDINATES } from '../utils/japanAddressGeocoding';

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
  currentEvent?: CalendarEvent;
  nextEvent?: CalendarEvent;
  coords: [number, number]; // [lat, lng] (始点拠点・現場座標)
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
  const animFrameRef = useRef<number | null>(null);

  // アンマウント時のアニメーションクリーンアップ
  useEffect(() => {
    return () => {
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
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

  // 地図スタイル選択 (減色ライト / 標準 / ダーク)
  const [mapStyle, setMapStyle] = useState<MapStyleType>('light');
  const [currentZoom, setCurrentZoom] = useState<number>(9);

  // 自動更新コントロール
  const [isAutoRefreshEnabled, setIsAutoRefreshEnabled] = useState<boolean>(true);
  const [refreshIntervalMins, setRefreshIntervalMins] = useState<number>(3);
  const [lastRefreshedAt, setLastRefreshedAt] = useState<Date>(new Date());
  const [countdownSeconds, setCountdownSeconds] = useState<number>(refreshIntervalMins * 60);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

  const [selectedMemberFilter, setSelectedMemberFilter] = useState<'all' | 'in_transit' | 'on_site'>('all');
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

    const rawStatuses = teamMembers.map((member) => {
      // ユーザー個別の所属拠点デフォルト情報を解決
      const userBaseLocation = resolveUserBaseLocation(member, offices);

      const memberEvents = (events || [])
        .filter((e) => {
          const eDateStr = getLocalDateStr(e.start);
          if (eDateStr !== dateStr) return false;
          return e.attendees?.some(
            (a) => a && (a.id === member.id || String(a.id) === String(member.id) || a.name === member.name)
          );
        })
        .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

      let statusType: 'at_base' | 'on_site' | 'in_transit' = 'at_base';
      let locationName = userBaseLocation.name;
      let officeBadge = userBaseLocation.badge;
      let prevLocationName: string | undefined = undefined;
      let nextLocationName: string | undefined = undefined;
      let currentEvent: CalendarEvent | undefined = undefined;
      let nextEvent: CalendarEvent | undefined = undefined;
      let coords: [number, number] = userBaseLocation.coords;
      let regionKey: MemberLocationStatus['regionKey'] = userBaseLocation.regionKey;

      let activeEventFound = false;
      let prevEventFound: CalendarEvent | null = null;
      let nextEventFound: CalendarEvent | null = null;

      for (let i = 0; i < memberEvents.length; i++) {
        const ev = memberEvents[i];
        const sTime = new Date(ev.start);
        let eTime = ev.end ? new Date(ev.end) : new Date(sTime.getTime() + 60 * 60 * 1000);
        if (isNaN(eTime.getTime())) eTime = new Date(sTime.getTime() + 60 * 60 * 1000);

        const { hour: sH, minute: sM } = getJstHourAndMinutes(sTime);
        const { hour: eH, minute: eM } = getJstHourAndMinutes(eTime);

        const evStartMins = sH * 60 + sM;
        const evEndMins = eH * 60 + eM;

        if (selectedMinutes >= evStartMins && selectedMinutes <= evEndMins) {
          activeEventFound = true;
          currentEvent = ev;
          const rawTitle = ev.title || '';
          const rawLoc = ev.location || '';
          const combined = `${rawTitle} ${rawLoc}`.trim();

          // 「AからBへ移動」や「Aから移動中」などの明示的な移動予定の判定
          const transitMatch = combined.match(/(.+?)(?:から|発)\s*(.+?)(?:へ|に|行)?(?:移動中|移動|向かう)/)
            || combined.match(/(.+?)から移動中/);

          if (transitMatch) {
            statusType = 'in_transit';
            const originStr = transitMatch[1].trim();
            const destStr = transitMatch[2] ? transitMatch[2].trim() : '';
            prevLocationName = originStr;
            nextLocationName = destStr || undefined;
            locationName = originStr;

            // ★ 要望: ◯から移動中に関しては、移動前（出発地・前現場）の住所にマッピングし、
            // 時間になったら（予定終了時刻・次予定開始時刻に達したら）移動後住所へマッピング
            const prevLocInfo = resolveLocationInfo(originStr, userBaseLocation);
            const nextLocInfo = destStr ? resolveLocationInfo(destStr, userBaseLocation) : null;

            if (selectedMinutes < evEndMins && prevLocInfo) {
              coords = prevLocInfo.coords;
              regionKey = prevLocInfo.regionKey;
            } else if (nextLocInfo) {
              coords = nextLocInfo.coords;
              regionKey = nextLocInfo.regionKey;
            } else if (prevLocInfo) {
              coords = prevLocInfo.coords;
              regionKey = prevLocInfo.regionKey;
            } else {
              coords = userBaseLocation.coords;
              regionKey = userBaseLocation.regionKey;
            }
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
          prevEventFound = ev;
        } else if (selectedMinutes < evStartMins && !nextEventFound) {
          nextEventFound = ev;
        }
      }

      if (!activeEventFound) {
        if (prevEventFound) {
          statusType = 'in_transit';
          prevLocationName = prevEventFound.location || prevEventFound.title || '前作業現場';
          if (nextEventFound) {
            nextLocationName = nextEventFound.location || nextEventFound.title || '次現場';
            nextEvent = nextEventFound;
          }
          currentEvent = prevEventFound;
          locationName = prevLocationName;

          // ★ 要望: 「◯から移動中」は移動前（出発地・前現場）の住所のままにし、
          // 時間になったら（次現場の予定開始時刻に到達したら、上記memberEventsループにより自然に）移動後住所へマッピングする。
          const prevLocInfo = prevEventFound ? resolveLocationInfo(prevEventFound.location || prevEventFound.title, userBaseLocation) : null;

          if (prevLocInfo) {
            coords = prevLocInfo.coords;
            regionKey = prevLocInfo.regionKey;
          } else {
            coords = userBaseLocation.coords;
            regionKey = userBaseLocation.regionKey;
          }
        } else {
          statusType = 'at_base';
          locationName = userBaseLocation.name;
          coords = userBaseLocation.coords;
          regionKey = userBaseLocation.regionKey;
          if (nextEventFound) {
            nextEvent = nextEventFound;
            nextLocationName = nextEventFound.location || nextEventFound.title;
          }
        }
      }

      let statusDisplay = '';
      if (statusType === 'on_site') {
        statusDisplay = `📍 「${locationName}」滞在中`;
      } else if (statusType === 'in_transit') {
        statusDisplay = `🚗 「${prevLocationName}」から移動中` + (nextLocationName ? ` → 「${nextLocationName}」へ` : '');
      } else {
        statusDisplay = `${officeBadge} （${userBaseLocation.address}）`;
      }

      let timeRangeDisplay = '';
      if (currentEvent) {
        timeRangeDisplay = `${formatTimeJST(currentEvent.start)} - ${currentEvent.end ? formatTimeJST(currentEvent.end) : ''}`;
      }

      return {
        member,
        statusType,
        locationName,
        officeBadge,
        prevLocationName,
        nextLocationName,
        currentEvent,
        nextEvent,
        coords,
        spiderCoords: coords,
        regionKey,
        statusDisplay,
        timeRangeDisplay,
      };
    });

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
  }, [teamMembers, events, currentDate, selectedMinutes, lastRefreshedAt, offices, currentZoom]);

  const filteredMemberStatuses = useMemo(() => {
    return memberStatuses.filter((s) => {
      if (selectedMemberFilter === 'in_transit' && s.statusType !== 'in_transit') return false;
      if (selectedMemberFilter === 'on_site' && s.statusType !== 'on_site') return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const nameMatch = s.member.name.toLowerCase().includes(q);
        const locMatch = s.statusDisplay.toLowerCase().includes(q);
        const deptMatch = (s.member.department || '').toLowerCase().includes(q);
        return nameMatch || locMatch || deptMatch;
      }
      return true;
    });
  }, [memberStatuses, selectedMemberFilter, searchQuery]);

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
    const map = mapInstanceRef.current;
    if (!map) return;

    // 既存のアニメーションループがあれば即座にキャンセル
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }

    const currentMapZoom = map.getZoom();
    // 拡大先の目標ズームレベル（現在より詳細な12以上へ設定）
    const targetZoom = Math.max(currentMapZoom, 12);

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

    // 3. マップカメラを「前もって計算した移動先の目標座標」へ向けてズーム＆パン！
    map.flyTo(targetSpiderCoords, targetZoom, {
      duration: duration / 1000,
      easeLinearity: 0.25,
    });

    // 4. アイコンと引き出し線を目標位置へ向けて滑らかに完全同期移動
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const ease = easeInOutCubic(progress);

      clusterTargets.forEach((item) => {
        const curLat = item.startLat + (item.destLat - item.startLat) * ease;
        const curLng = item.startLng + (item.destLng - item.startLng) * ease;
        item.marker.setLatLng([curLat, curLng]);
        if (item.line) {
          item.line.setLatLngs([item.hubCoords, [curLat, curLng]]);
        }
      });

      if (progress < 1) {
        animFrameRef.current = requestAnimationFrame(step);
      } else {
        animFrameRef.current = null;
        // 最終位置を確定し、選択されたメンバーの吹き出しを開く
        clusterTargets.forEach((item) => {
          item.marker.setLatLng([item.destLat, item.destLng]);
          if (item.line) {
            item.line.setLatLngs([item.hubCoords, [item.destLat, item.destLng]]);
          }
          if (item.isSelected) {
            item.marker.openPopup();
          }
        });
      }
    };

    animFrameRef.current = requestAnimationFrame(step);
  }, [filteredMemberStatuses]);

  // ★ 対策A+B複合: Leaflet 地図インスタンスおよびハブ（起点ドット）・引き出し線・アニメーション発光ハイライト描画
  useEffect(() => {
    if (displayMode === 'cards') return;
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [35.1814, 136.9064],
        zoom: 9,
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
      });
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

          {/* Status Filter */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-slate-700">
            <button
              onClick={() => setSelectedMemberFilter('all')}
              className={`px-2 py-1 rounded-md transition-all font-bold ${
                selectedMemberFilter === 'all' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              全員 ({memberStatuses.length})
            </button>
            <button
              onClick={() => setSelectedMemberFilter('in_transit')}
              className={`px-2 py-1 rounded-md transition-all font-bold ${
                selectedMemberFilter === 'in_transit' ? 'bg-amber-500 text-white shadow-2xs' : 'text-slate-600 hover:text-amber-700'
              }`}
            >
              🚗 移動中
            </button>
            <button
              onClick={() => setSelectedMemberFilter('on_site')}
              className={`px-2 py-1 rounded-md transition-all font-bold ${
                selectedMemberFilter === 'on_site' ? 'bg-emerald-600 text-white shadow-2xs' : 'text-slate-600 hover:text-emerald-700'
              }`}
            >
              📍 作業中
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
                              className="w-9 h-9 rounded-full object-cover border border-slate-200 shrink-0"
                              alt={st.member.name}
                            />
                            <div>
                              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5 whitespace-nowrap">
                                <span>{st.member.name}</span>
                                <span className="text-[10px] text-slate-500 font-normal">
                                  ({st.member.department || '所属未指定'})
                                </span>
                              </div>
                              <div className="text-[10px] font-extrabold mt-0.5">
                                {st.statusType === 'in_transit' && (
                                  <span className="text-amber-800 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200">
                                    🚗 「{st.prevLocationName}」から移動中
                                    {st.nextLocationName && ` → 「${st.nextLocationName}」へ`}
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
                            className={`w-8 h-8 rounded-full object-cover border shrink-0 ${
                              isSelected ? 'border-blue-600 ring-2 ring-blue-400' : 'border-slate-200'
                            }`}
                            alt={member.name}
                          />
                          <div>
                            <div className="text-xs font-extrabold flex items-center gap-1.5 whitespace-nowrap">
                              <span>{member.name}</span>
                              <span className="text-[10px] opacity-70 font-normal">
                                ({member.department || '所属未指定'})
                              </span>
                            </div>

                            <div className="mt-1">
                              {statusType === 'in_transit' && (
                                <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-800 border border-amber-200">
                                  🚗 「{prevLocationName}」から移動中
                                  {nextLocationName && ` → 「${nextLocationName}」へ`}
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
    </div>
  );
};
