import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { User, CalendarEvent, OfficeMaster } from '../types';
import { MapPin, Navigation, Clock, Building, Send, Search, RefreshCw, UserCheck, Zap, Layers, Moon, Sun, LayoutGrid, Check } from 'lucide-react';
import { getLocalDateStr, getJstHourAndMinutes, formatTimeJST } from '../utils/dateUtils';

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
  regionKey: 'nagoya_owari' | 'mikawa' | 'gifu' | 'mie' | 'shizuoka';
  statusDisplay: string;
  timeRangeDisplay?: string;
}

// デフォルト拠点 (愛知県名古屋市北区清水5-10-2)
const DEFAULT_HEADQUARTERS = {
  address: '愛知県名古屋市北区清水5-10-2',
  name: '名古屋拠点 (清水)',
  badge: '🏢 名古屋拠点',
  coords: [35.1932, 136.9110] as [number, number],
};

// 所属拠点（member.office または member.department）からデフォルト住所・座標・拠点区分バッジを特定する辞書
const OFFICE_BASE_LOCATIONS: Record<string, { coords: [number, number]; address: string; name: string; badge: string; regionKey: MemberLocationStatus['regionKey'] }> = {
  '清水': { coords: [35.1932, 136.9110], address: '愛知県名古屋市北区清水5-10-2', name: '名古屋拠点 (清水)', badge: '🏢 名古屋拠点', regionKey: 'nagoya_owari' },
  '本社': { coords: [35.1932, 136.9110], address: '愛知県名古屋市北区清水5-10-2', name: '名古屋拠点 (清水)', badge: '🏢 名古屋拠点', regionKey: 'nagoya_owari' },
  '名古屋': { coords: [35.1932, 136.9110], address: '愛知県名古屋市北区清水5-10-2', name: '名古屋拠点 (清水)', badge: '🏢 名古屋拠点', regionKey: 'nagoya_owari' },
  '名古屋支店': { coords: [35.1932, 136.9110], address: '愛知県名古屋市北区清水5-10-2', name: '名古屋拠点 (清水)', badge: '🏢 名古屋拠点', regionKey: 'nagoya_owari' },
  '静岡': { coords: [34.9756, 138.3828], address: '静岡県静岡市葵区', name: '静岡営業所', badge: '🏢 静岡営業所', regionKey: 'shizuoka' },
  '静岡営業所': { coords: [34.9756, 138.3828], address: '静岡県静岡市葵区', name: '静岡営業所', badge: '🏢 静岡営業所', regionKey: 'shizuoka' },
  '三河': { coords: [34.9548, 137.1723], address: '愛知県岡崎市', name: '三河営業所', badge: '🏢 三河営業所', regionKey: 'mikawa' },
  '三河営業所': { coords: [34.9548, 137.1723], address: '愛知県岡崎市', name: '三河営業所', badge: '🏢 三河営業所', regionKey: 'mikawa' },
  '岡崎': { coords: [34.9548, 137.1723], address: '愛知県岡崎市', name: '三河営業所', badge: '🏢 三河営業所', regionKey: 'mikawa' },
  '三重': { coords: [34.9653, 136.6236], address: '三重県四日市市', name: '三重営業所', badge: '🏢 三重営業所', regionKey: 'mie' },
  '三重営業所': { coords: [34.9653, 136.6236], address: '三重県四日市市', name: '三重営業所', badge: '🏢 三重営業所', regionKey: 'mie' },
  '四日市': { coords: [34.9653, 136.6236], address: '三重県四日市市', name: '三重営業所', badge: '🏢 三重営業所', regionKey: 'mie' },
  '岐阜': { coords: [35.4233, 136.7607], address: '岐阜県岐阜市', name: '岐阜営業所', badge: '🏢 岐阜営業所', regionKey: 'gifu' },
  '岐阜営業所': { coords: [35.4233, 136.7607], address: '岐阜県岐阜市', name: '岐阜営業所', badge: '🏢 岐阜営業所', regionKey: 'gifu' },
  '東京': { coords: [35.6812, 139.7671], address: '東京都千代田区', name: '東京支店', badge: '🏢 東京支店', regionKey: 'nagoya_owari' },
  '東京支店': { coords: [35.6812, 139.7671], address: '東京都千代田区', name: '東京支店', badge: '🏢 東京支店', regionKey: 'nagoya_owari' },
  '大阪': { coords: [34.7024, 135.4959], address: '大阪府大阪市北区', name: '大阪支店', badge: '🏢 大阪支店', regionKey: 'nagoya_owari' },
  '大阪支店': { coords: [34.7024, 135.4959], address: '大阪府大阪市北区', name: '大阪支店', badge: '🏢 大阪支店', regionKey: 'nagoya_owari' },
};

function resolveUserBaseLocation(user: User, offices?: OfficeMaster[]): { coords: [number, number]; address: string; name: string; badge: string; regionKey: MemberLocationStatus['regionKey'] } {
  const officeName = user.office || user.department || '';

  for (const [key, base] of Object.entries(OFFICE_BASE_LOCATIONS)) {
    if (officeName.includes(key)) {
      return base;
    }
  }

  if (offices && offices.length > 0) {
    const matchedOffice = offices.find(o => officeName.includes(o.name) || o.name.includes(officeName));
    if (matchedOffice) {
      const matchedKey = matchedOffice.name;
      for (const [key, base] of Object.entries(OFFICE_BASE_LOCATIONS)) {
        if (matchedKey.includes(key)) {
          return base;
        }
      }
      let badge = '🏢 拠点';
      if (matchedOffice.type === 'branch') badge = `🏢 ${matchedOffice.name} (支店)`;
      else if (matchedOffice.type === 'sales_office') badge = `🏢 ${matchedOffice.name} (営業所)`;
      else if (matchedOffice.type === 'headquarter') badge = `🏢 ${matchedOffice.name} (本社)`;

      return {
        coords: DEFAULT_HEADQUARTERS.coords,
        address: matchedOffice.location || DEFAULT_HEADQUARTERS.address,
        name: matchedOffice.name,
        badge,
        regionKey: 'nagoya_owari'
      };
    }
  }

  return DEFAULT_HEADQUARTERS;
}

// 予定場所（住所表記・市区町村名・現場名キーワード）解決辞書
const PRESET_COORDINATES: Record<string, { coords: [number, number]; regionKey: MemberLocationStatus['regionKey'] }> = {
  // 名古屋市内（全16区・主要地名・駅名・現場名）
  '熱田区五番町': { coords: [35.1278, 136.9038], regionKey: 'nagoya_owari' },
  '五番町': { coords: [35.1278, 136.9038], regionKey: 'nagoya_owari' },
  '熱田区': { coords: [35.1278, 136.9038], regionKey: 'nagoya_owari' },
  '熱田': { coords: [35.1278, 136.9038], regionKey: 'nagoya_owari' },
  '緑区': { coords: [35.0844, 136.9535], regionKey: 'nagoya_owari' },
  '鳴海': { coords: [35.0844, 136.9535], regionKey: 'nagoya_owari' },
  '大高': { coords: [35.0689, 136.9367], regionKey: 'nagoya_owari' },
  '中川区': { coords: [35.1384, 136.8643], regionKey: 'nagoya_owari' },
  '港区': { coords: [35.1054, 136.8821], regionKey: 'nagoya_owari' },
  '南区': { coords: [35.0934, 136.9318], regionKey: 'nagoya_owari' },
  '昭和区': { coords: [35.1484, 136.9367], regionKey: 'nagoya_owari' },
  '瑞穂区': { coords: [35.1258, 136.9348], regionKey: 'nagoya_owari' },
  '千種区': { coords: [35.1711, 136.9422], regionKey: 'nagoya_owari' },
  '名東区': { coords: [35.1764, 137.0016], regionKey: 'nagoya_owari' },
  '天白区': { coords: [35.1245, 136.9748], regionKey: 'nagoya_owari' },
  '守山区': { coords: [35.2045, 136.9772], regionKey: 'nagoya_owari' },
  '西区': { coords: [35.1964, 136.8856], regionKey: 'nagoya_owari' },
  '東区': { coords: [35.1804, 136.9245], regionKey: 'nagoya_owari' },
  '北区清水': { coords: [35.1932, 136.9110], regionKey: 'nagoya_owari' },
  '北区': { coords: [35.1932, 136.9110], regionKey: 'nagoya_owari' },
  '清水': { coords: [35.1932, 136.9110], regionKey: 'nagoya_owari' },
  '中村区': { coords: [35.1709, 136.8815], regionKey: 'nagoya_owari' },
  '名駅': { coords: [35.1709, 136.8815], regionKey: 'nagoya_owari' },
  '中区': { coords: [35.1691, 136.9025], regionKey: 'nagoya_owari' },
  '伏見': { coords: [35.1691, 136.9025], regionKey: 'nagoya_owari' },
  '栄': { coords: [35.1691, 136.9085], regionKey: 'nagoya_owari' },

  // 愛知県 尾張・知多エリア
  '一宮': { coords: [35.3038, 136.7956], regionKey: 'nagoya_owari' },
  '春日井': { coords: [35.2475, 136.9719], regionKey: 'nagoya_owari' },
  '小牧': { coords: [35.2908, 136.9106], regionKey: 'nagoya_owari' },
  '半田': { coords: [34.8919, 136.9367], regionKey: 'nagoya_owari' },
  '瀬戸': { coords: [35.2244, 137.0853], regionKey: 'nagoya_owari' },
  '日進': { coords: [35.1311, 137.0444], regionKey: 'nagoya_owari' },
  '長久手': { coords: [35.1833, 137.0494], regionKey: 'nagoya_owari' },
  '尾張旭': { coords: [35.2158, 137.0344], regionKey: 'nagoya_owari' },
  '大府': { coords: [35.0133, 136.9625], regionKey: 'nagoya_owari' },
  '東海市': { coords: [35.0258, 136.9075], regionKey: 'nagoya_owari' },
  '清須': { coords: [35.2014, 136.8458], regionKey: 'nagoya_owari' },
  '北名古屋': { coords: [35.2458, 136.8722], regionKey: 'nagoya_owari' },
  'あま': { coords: [35.1764, 136.7578], regionKey: 'nagoya_owari' },
  '津島': { coords: [35.1764, 136.7278], regionKey: 'nagoya_owari' },
  '犬山': { coords: [35.3844, 136.9444], regionKey: 'nagoya_owari' },
  '江南': { coords: [35.3344, 136.8744], regionKey: 'nagoya_owari' },
  '岩倉': { coords: [35.2789, 136.8722], regionKey: 'nagoya_owari' },

  // 愛知県 三河エリア
  '豊田市上挙母': { coords: [35.0822, 137.1562], regionKey: 'mikawa' },
  '上挙母': { coords: [35.0822, 137.1562], regionKey: 'mikawa' },
  '豊田市': { coords: [35.0822, 137.1562], regionKey: 'mikawa' },
  '豊田': { coords: [35.0822, 137.1562], regionKey: 'mikawa' },
  '岡崎': { coords: [34.9548, 137.1723], regionKey: 'mikawa' },
  '安城': { coords: [34.9589, 137.0803], regionKey: 'mikawa' },
  '刈谷': { coords: [34.9889, 137.0016], regionKey: 'mikawa' },
  '知立': { coords: [35.0075, 137.0425], regionKey: 'mikawa' },
  '豊橋': { coords: [34.7628, 137.3817], regionKey: 'mikawa' },
  '豊川': { coords: [34.8258, 137.3912], regionKey: 'mikawa' },
  '西尾': { coords: [34.8644, 137.0543], regionKey: 'mikawa' },

  // 岐阜エリア
  '可茂環境衛生': { coords: [35.4378, 137.0543], regionKey: 'gifu' },
  '可茂': { coords: [35.4378, 137.0543], regionKey: 'gifu' },
  '美濃加茂': { coords: [35.4378, 137.0543], regionKey: 'gifu' },
  '可児': { coords: [35.4278, 137.0583], regionKey: 'gifu' },
  '岐阜': { coords: [35.4233, 136.7607], regionKey: 'gifu' },
  '大垣': { coords: [35.3589, 136.6128], regionKey: 'gifu' },
  '各務原': { coords: [35.3997, 136.8483], regionKey: 'gifu' },
  '多治見': { coords: [35.3322, 137.1278], regionKey: 'gifu' },

  // 三重エリア
  '四日市': { coords: [34.9653, 136.6236], regionKey: 'mie' },
  '津': { coords: [34.7303, 136.5086], regionKey: 'mie' },
  '鈴鹿': { coords: [34.8822, 136.5847], regionKey: 'mie' },
  '桑名': { coords: [35.0658, 136.6822], regionKey: 'mie' },

  // 静岡エリア
  '静岡': { coords: [34.9756, 138.3828], regionKey: 'shizuoka' },
  '浜松': { coords: [34.7108, 137.7261], regionKey: 'shizuoka' },
  '沼津': { coords: [35.1003, 138.8597], regionKey: 'shizuoka' },
  '富士': { coords: [35.1614, 138.6764], regionKey: 'shizuoka' },
};

function resolveLocationInfo(
  locationStr?: string,
  fallbackBase?: ReturnType<typeof resolveUserBaseLocation>
): { coords: [number, number]; regionKey: MemberLocationStatus['regionKey'] } | null {
  if (!locationStr || !locationStr.trim()) {
    return fallbackBase || null;
  }

  const cleanStr = locationStr.trim();
  // 最長一致優先で地名・市区町村名を照合（例: 「熱田区五番町」を「熱田区」より優先）
  const sortedKeys = Object.keys(PRESET_COORDINATES).sort((a, b) => b.length - a.length);
  for (const key of sortedKeys) {
    if (cleanStr.includes(key)) {
      return PRESET_COORDINATES[key];
    }
  }

  return fallbackBase || null;
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
          statusType = 'on_site';
          locationName = ev.location || ev.title || '現場・予定先';
          // 住所があるか、または現場名から推測される場所にマッピング。その他は拠点住所
          const locInfo = resolveLocationInfo(ev.location || ev.title, userBaseLocation);
          coords = locInfo ? locInfo.coords : userBaseLocation.coords;
          regionKey = locInfo ? locInfo.regionKey : userBaseLocation.regionKey;
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

          // ★ 移動中の座標特定:
          // 1. 次現場（目的地）に明示的な住所または推測可能な地名がある場合は目的地へマッピング（例: 越野さんの熱田区五番町）
          // 2. 前現場（出発地）に住所または推測可能な地名がある場合は前現場へマッピング
          // 3. どちらも不明な場合は所属拠点住所へマッピング（その他は拠点住所で問題ない）
          const nextLocInfo = nextEventFound ? resolveLocationInfo(nextEventFound.location || nextEventFound.title) : null;
          const prevLocInfo = prevEventFound ? resolveLocationInfo(prevEventFound.location || prevEventFound.title) : null;

          if (nextLocInfo) {
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
        // 画面ピクセル基準の展開半径（ネームカード幅約75pxを考慮し、隣接マーカー間隔が重ならないよう弦長計算で最適化）
        const pixelRadius = N <= 1 ? 0 : Math.max(54, Math.min(130, Math.round(40 / Math.sin(Math.PI / Math.min(N, 12)))));
        const map = mapInstanceRef.current;

        group.forEach((st, idx) => {
          const angle = (2 * Math.PI * idx) / N - Math.PI / 2;
          if (map) {
            try {
              const centerPoint = map.project(L.latLng(centerLat, centerLng), currentZoom);
              const spiderPoint = L.point(
                centerPoint.x + pixelRadius * Math.cos(angle),
                centerPoint.y + pixelRadius * Math.sin(angle)
              );
              const unprojected = map.unproject(spiderPoint, currentZoom);
              st.spiderCoords = [unprojected.lat, unprojected.lng];
            } catch {
              const degPerPixelLat = 1.152 / Math.pow(2, currentZoom);
              const degPerPixelLng = 1.406 / Math.pow(2, currentZoom);
              st.spiderCoords = [
                centerLat + pixelRadius * Math.sin(angle) * degPerPixelLat,
                centerLng + pixelRadius * Math.cos(angle) * degPerPixelLng,
              ];
            }
          } else {
            // マップ初期化前フォールバック (ズームレベルに応じた角度計算)
            const degPerPixelLat = 1.152 / Math.pow(2, currentZoom);
            const degPerPixelLng = 1.406 / Math.pow(2, currentZoom);
            st.spiderCoords = [
              centerLat + pixelRadius * Math.sin(angle) * degPerPixelLat,
              centerLng + pixelRadius * Math.cos(angle) * degPerPixelLng,
            ];
          }
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

      const drawnHubs = new Set<string>();
      const highlightedMemberId = selectedMemberStatus?.member.id;

      filteredMemberStatuses.forEach((status) => {
        const { member, statusType, coords, spiderCoords, statusDisplay, locationName, officeBadge } = status;
        const hubKey = `${coords[0].toFixed(3)}_${coords[1].toFixed(3)}`;
        const isSelected = highlightedMemberId === member.id;
        const isAnySelected = Boolean(highlightedMemberId);

        const clusterGroup = filteredMemberStatuses.filter((s) => `${s.coords[0].toFixed(3)}_${s.coords[1].toFixed(3)}` === hubKey);
        const isClustered = clusterGroup.length > 1;

        // 【対策A】起点の中心拠点ハブピン（Hub Marker）＆起点ドット（Origin Dot）の配置
        if (!drawnHubs.has(hubKey)) {
          drawnHubs.add(hubKey);
          const count = clusterGroup.length;

          // 起点ドット (Origin Dot) - 選択時は青色強調
          const isThisHubSelected = clusterGroup.some((s) => s.member.id === highlightedMemberId);
          const dotColor = isThisHubSelected ? '#2563eb' : (mapStyle === 'dark' ? '#60a5fa' : '#3b82f6');
          const originDot = L.circleMarker(coords, {
            radius: isThisHubSelected ? 7 : 5,
            fillColor: dotColor,
            fillOpacity: 1,
            color: '#ffffff',
            weight: isThisHubSelected ? 2.5 : 2,
          });
          markersLayerRef.current!.addLayer(originDot);

          // 密集拠点ハブタグ
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
                // 2. 現場・エリア座標での集約（例: 鳴海, 熱田区, 豊田市など）
                const matchedPreset = Object.entries(PRESET_COORDINATES).find(
                  ([_, info]) => Math.abs(info.coords[0] - coords[0]) < 0.005 && Math.abs(info.coords[1] - coords[1]) < 0.005
                );
                if (matchedPreset) {
                  hubName = matchedPreset[0];
                } else {
                  hubName = locationName.length > 10 ? locationName.substring(0, 9) + '…' : locationName;
                }
              }
            }

            const hubIconHtml = `
              <div style="display: flex; align-items: center; gap: 5px; background: rgba(15, 23, 42, 0.92); color: #ffffff; font-size: 11px; font-weight: 800; padding: 3px 9px; border-radius: 9999px; box-shadow: 0 4px 12px rgba(0,0,0,0.4); border: 2px solid ${isThisHubSelected ? '#3b82f6' : '#6366f1'}; white-space: nowrap;">
                <span style="display: inline-block; width: 7px; height: 7px; border-radius: 9999px; background: #38bdf8;"></span>
                <span>${hubName} (${count}名)</span>
              </div>
            `;
            const hubIcon = L.divIcon({
              html: hubIconHtml,
              className: 'location-hub-marker',
              iconSize: [110, 26],
              iconAnchor: [55, 13],
            });
            L.marker(coords, { icon: hubIcon }).addTo(markersLayerRef.current!);
          }
        }

        // 【要請③: 線と枠の強調の色を青に】起点ドットからアバターピンへの引き出し線 (Spider Line)
        if (isClustered) {
          const isLineActive = isSelected || !isAnySelected;
          const lineColor = isSelected ? '#2563eb' : (mapStyle === 'dark' ? '#60a5fa' : '#3b82f6');
          const lineWeight = isSelected ? 4 : 2;
          const lineOpacity = isSelected ? 1.0 : (isAnySelected ? 0.2 : 0.85);

          const line = L.polyline([coords, spiderCoords], {
            color: lineColor,
            weight: lineWeight,
            dashArray: isSelected ? undefined : '4,4',
            opacity: lineOpacity,
          });
          markersLayerRef.current!.addLayer(line);
        }

        // アバター外枠カラーによるステータス識別（文字バッジを排除して密集・重なりを解消）
        let statusBorderColor = '#6366f1'; // 本社・拠点
        if (statusType === 'on_site') {
          statusBorderColor = '#10b981'; // 現場・作業中 (エメラルドグリーン)
        } else if (statusType === 'in_transit') {
          statusBorderColor = '#f59e0b'; // 移動中 (アンバー)
        }

        // 枠スタイル: 選択時は青色強調リング、非選択時はステータスカラー外枠
        const ringEffectStyle = isSelected
          ? 'border: 3.5px solid #2563eb !important; box-shadow: 0 0 0 4px rgba(37,99,235,0.45), 0 4px 14px rgba(0,0,0,0.35) !important; transform: scale(1.15); z-index: 50;'
          : `border: 2.5px solid ${statusBorderColor} !important; box-shadow: 0 2px 6px rgba(0,0,0,0.3) !important;`;

        const avatarOpacity = isAnySelected && !isSelected ? '0.4' : '1';
        const avatarUrl = member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`;

        // ★ 要望: 密集しすぎの解消 ＆「移動中」アイコン（文字バッジ）の削除
        const customIconHtml = `
          <div style="display: flex; flex-direction: column; align-items: center; cursor: pointer; user-select: none; opacity: ${avatarOpacity}; transition: opacity 0.2s;">
            <!-- Avatar Ring: 外枠色で移動中(黄)/作業中(緑)/拠点(藍)/選択(青)をすっきり表現 -->
            <div style="position: relative; width: 38px; height: 38px; border-radius: 9999px; background: #ffffff; transition: transform 0.2s; ${ringEffectStyle}">
              <img src="${avatarUrl}" style="width: 100% !important; height: 100% !important; max-width: 100% !important; max-height: 100% !important; object-fit: cover !important; border-radius: 9999px !important; display: block;" alt="${member.name}" />
            </div>
            <!-- Name Label Card: 100%不透明な背景プレートで地図上の文字と重ならず鮮明に視認可能 -->
            <div style="margin-top: 4px; padding: 2px 8px; background: ${isSelected ? '#1d4ed8' : '#0f172a'}; color: #ffffff !important; font-weight: 800; font-size: 11px; line-height: 1.25; border-radius: 6px; border: ${isSelected ? '2px solid #93c5fd' : '1.5px solid #334155'}; box-shadow: 0 3px 8px rgba(0,0,0,0.5); white-space: nowrap; text-align: center; letter-spacing: 0.02em; pointer-events: none; text-shadow: 0 1px 2px rgba(0,0,0,0.9);">
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
          setSelectedMemberStatus(status);
          if (mapInstanceRef.current) {
            mapInstanceRef.current.flyTo(spiderCoords, Math.max(mapInstanceRef.current.getZoom(), 11), { duration: 0.8 });
          }
        });

        markersLayerRef.current?.addLayer(marker);
      });
    }
  }, [filteredMemberStatuses, mapStyle, displayMode, selectedMemberStatus]);

  // 現在時刻に復帰
  const handleResetToCurrentTime = () => {
    setIsLiveTracking(true);
    setSelectedMinutes(getCurrentJstMinutes());
  };

  // 簡易エリア区分カード用定義
  const REGION_SECTIONS: { key: MemberLocationStatus['regionKey']; title: string; subtitle: string; bg: string; border: string }[] = [
    { key: 'nagoya_owari', title: '🏢 尾張・名古屋エリア', subtitle: '本社・名古屋市・一宮・春日井・小牧等', bg: 'bg-indigo-50/80', border: 'border-indigo-200' },
    { key: 'mikawa', title: '🏭 三河エリア', subtitle: '岡崎・豊田・豊橋・安城・刈谷等', bg: 'bg-blue-50/80', border: 'border-blue-200' },
    { key: 'gifu', title: '⛰️ 岐阜エリア', subtitle: '岐阜市・大垣・各務原・多治見等', bg: 'bg-emerald-50/80', border: 'border-emerald-200' },
    { key: 'mie', title: '⚓ 三重エリア', subtitle: '四日市・津・鈴鹿・桑名・伊勢等', bg: 'bg-amber-50/80', border: 'border-amber-200' },
    { key: 'shizuoka', title: '🍵 静岡エリア', subtitle: '静岡市・浜松・沼津・富士・磐田等', bg: 'bg-teal-50/80', border: 'border-teal-200' },
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
              {selectedMemberStatus && (
                <button
                  onClick={() => setSelectedMemberStatus(null)}
                  className="text-[10px] text-slate-400 hover:text-indigo-600 underline"
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

                  return (
                    <div
                      key={member.id}
                      onClick={() => {
                        setSelectedMemberStatus(status);
                        if (mapInstanceRef.current && mapStyle !== 'simplified') {
                          mapInstanceRef.current.flyTo(status.spiderCoords, 12, { duration: 0.8 });
                        }
                      }}
                      className={`p-2.5 rounded-xl transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/95 border-2 border-blue-500 shadow-md ring-2 ring-blue-300'
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
