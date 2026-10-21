import React, { useEffect, useRef, useState, useMemo, useCallback } from 'react';
import L from 'leaflet';
import { User, CalendarEvent } from '../types';
import { MapPin, Navigation, Clock, Building, Send, Search, RefreshCw, UserCheck, Zap, Layers, Moon, Sun, LayoutGrid, Check } from 'lucide-react';
import { getLocalDateStr, getJstHourAndMinutes, formatTimeJST } from '../utils/dateUtils';

interface TeamLocationMapProps {
  currentDate: Date;
  teamMembers: User[];
  events: CalendarEvent[];
  onOpenMemoModal?: (user: User) => void;
  onOpenEventModal?: (event: CalendarEvent) => void;
  displayMode?: 'map' | 'cards'; // 'map' (インタラクティブ地図) または 'cards' (簡易エリア別カード)
}

export type MapStyleType = 'light' | 'standard' | 'dark';

interface MemberLocationStatus {
  member: User;
  statusType: 'at_base' | 'on_site' | 'in_transit';
  locationName: string;
  prevLocationName?: string;
  nextLocationName?: string;
  currentEvent?: CalendarEvent;
  nextEvent?: CalendarEvent;
  coords: [number, number]; // [lat, lng]
  spiderCoords: [number, number]; // 引き出し線先のオフセット座標
  regionKey: 'nagoya_owari' | 'mikawa' | 'gifu' | 'mie' | 'shizuoka';
  statusDisplay: string;
  timeRangeDisplay?: string;
}

// デフォルト拠点 (愛知県名古屋市北区清水5-10-2)
const DEFAULT_HEADQUARTERS = {
  address: '愛知県名古屋市北区清水5-10-2',
  name: '本社 (名古屋市北区清水)',
  coords: [35.1932, 136.9110] as [number, number],
};

// 東海4県および主要地域の座標辞書
const PRESET_COORDINATES: Record<string, { coords: [number, number]; regionKey: MemberLocationStatus['regionKey'] }> = {
  // 愛知県 (名古屋・尾張)
  '清水': { coords: [35.1932, 136.9110], regionKey: 'nagoya_owari' },
  '本社': { coords: [35.1932, 136.9110], regionKey: 'nagoya_owari' },
  '名古屋': { coords: [35.1814, 136.9064], regionKey: 'nagoya_owari' },
  '北区': { coords: [35.1932, 136.9110], regionKey: 'nagoya_owari' },
  '中村区': { coords: [35.1709, 136.8815], regionKey: 'nagoya_owari' },
  '中区': { coords: [35.1691, 136.9025], regionKey: 'nagoya_owari' },
  '千種区': { coords: [35.1711, 136.9422], regionKey: 'nagoya_owari' },
  '春日井': { coords: [35.2475, 136.9719], regionKey: 'nagoya_owari' },
  '一宮': { coords: [35.3038, 136.7956], regionKey: 'nagoya_owari' },
  '小牧': { coords: [35.2908, 136.9106], regionKey: 'nagoya_owari' },
  '半田': { coords: [34.8919, 136.9367], regionKey: 'nagoya_owari' },

  // 愛知県 (三河)
  '豊橋': { coords: [34.7628, 137.3817], regionKey: 'mikawa' },
  '岡崎': { coords: [34.9548, 137.1723], regionKey: 'mikawa' },
  '豊田': { coords: [35.0822, 137.1562], regionKey: 'mikawa' },
  '安城': { coords: [34.9589, 137.0803], regionKey: 'mikawa' },
  '刈谷': { coords: [34.9889, 137.0016], regionKey: 'mikawa' },
  '西尾': { coords: [34.8647, 137.0542], regionKey: 'mikawa' },

  // 岐阜県
  '岐阜': { coords: [35.4233, 136.7607], regionKey: 'gifu' },
  '大垣': { coords: [35.3589, 136.6128], regionKey: 'gifu' },
  '各務原': { coords: [35.3997, 136.8483], regionKey: 'gifu' },
  '多治見': { coords: [35.3325, 137.1306], regionKey: 'gifu' },
  '可児': { coords: [35.4267, 137.0544], regionKey: 'gifu' },
  '高山': { coords: [36.1428, 137.2514], regionKey: 'gifu' },

  // 三重県
  '津': { coords: [34.7303, 136.5086], regionKey: 'mie' },
  '四日市': { coords: [34.9653, 136.6236], regionKey: 'mie' },
  '鈴鹿': { coords: [34.8822, 136.5847], regionKey: 'mie' },
  '伊勢': { coords: [34.4858, 136.7089], regionKey: 'mie' },
  '松阪': { coords: [34.5772, 136.5317], regionKey: 'mie' },
  '桑名': { coords: [35.0653, 136.6856], regionKey: 'mie' },

  // 静岡県
  '静岡': { coords: [34.9756, 138.3828], regionKey: 'shizuoka' },
  '浜松': { coords: [34.7108, 137.7261], regionKey: 'shizuoka' },
  '沼津': { coords: [35.1003, 138.8597], regionKey: 'shizuoka' },
  '富士': { coords: [35.1614, 138.6764], regionKey: 'shizuoka' },
  '磐田': { coords: [34.7203, 137.8522], regionKey: 'shizuoka' },
  '掛川': { coords: [34.7689, 138.0156], regionKey: 'shizuoka' },
};

function resolveLocationInfo(locationStr?: string): { coords: [number, number]; regionKey: MemberLocationStatus['regionKey'] } {
  if (!locationStr || !locationStr.trim()) {
    return { coords: DEFAULT_HEADQUARTERS.coords, regionKey: 'nagoya_owari' };
  }

  const cleanStr = locationStr.trim();
  for (const [key, info] of Object.entries(PRESET_COORDINATES)) {
    if (cleanStr.includes(key)) {
      return info;
    }
  }

  return { coords: DEFAULT_HEADQUARTERS.coords, regionKey: 'nagoya_owari' };
}

export const TeamLocationMap: React.FC<TeamLocationMapProps> = ({
  currentDate,
  teamMembers,
  events,
  onOpenMemoModal,
  onOpenEventModal,
  displayMode = 'map',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const markersLayerRef = useRef<L.LayerGroup | null>(null);

  // 1. デフォルト＝現在時刻（リアルタイム追従モード）
  const getCurrentJstMinutes = useCallback(() => {
    const now = new Date();
    const { hour, minute } = getJstHourAndMinutes(now);
    return hour * 60 + minute;
  }, []);

  const [selectedMinutes, setSelectedMinutes] = useState<number>(getCurrentJstMinutes);
  const [isLiveTracking, setIsLiveTracking] = useState<boolean>(true);

  // 2. 地図スタイル選択 (減色ライト / 標準 / ダークモード -> CSSフィルター適用でAPIキー不要・100%安定)
  const [mapStyle, setMapStyle] = useState<MapStyleType>('light');

  // 3. 自動更新コントロール (1分/3分/5分間隔)
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
    if (!isLiveTracking) return;
    const interval = setInterval(() => {
      setSelectedMinutes(getCurrentJstMinutes());
    }, 30000);
    return () => clearInterval(interval);
  }, [isLiveTracking, getCurrentJstMinutes]);

  // 手動更新・自動更新処理
  const handleTriggerRefresh = useCallback(() => {
    setIsRefreshing(true);
    const now = new Date();
    setLastRefreshedAt(now);
    setCountdownSeconds(refreshIntervalMins * 60);

    if (isLiveTracking) {
      setSelectedMinutes(getCurrentJstMinutes());
    }

    setTimeout(() => {
      setIsRefreshing(false);
    }, 600);
  }, [refreshIntervalMins, isLiveTracking, getCurrentJstMinutes]);

  // カウントダウンタイマー
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

  // 時刻文字列 (例: "11:30")
  const selectedTimeStr = useMemo(() => {
    const h = Math.floor(selectedMinutes / 60);
    const m = selectedMinutes % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }, [selectedMinutes]);

  // 各メンバーのステータスおよび引き出し線 (Spiderfy) オフセット計算
  const memberStatuses = useMemo<MemberLocationStatus[]>(() => {
    const dateStr = getLocalDateStr(currentDate);

    const rawStatuses = teamMembers.map((member) => {
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
      let locationName = DEFAULT_HEADQUARTERS.name;
      let prevLocationName: string | undefined = undefined;
      let nextLocationName: string | undefined = undefined;
      let currentEvent: CalendarEvent | undefined = undefined;
      let nextEvent: CalendarEvent | undefined = undefined;
      let coords: [number, number] = DEFAULT_HEADQUARTERS.coords;
      let regionKey: MemberLocationStatus['regionKey'] = 'nagoya_owari';

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
          const locInfo = resolveLocationInfo(ev.location || ev.title);
          coords = locInfo.coords;
          regionKey = locInfo.regionKey;
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
          const locInfo = resolveLocationInfo(prevEventFound.location || prevEventFound.title);
          coords = locInfo.coords;
          regionKey = locInfo.regionKey;
          currentEvent = prevEventFound;

          if (nextEventFound) {
            nextLocationName = nextEventFound.location || nextEventFound.title || '次現場';
            nextEvent = nextEventFound;
          }
          locationName = prevLocationName;
        } else {
          statusType = 'at_base';
          locationName = DEFAULT_HEADQUARTERS.name;
          coords = DEFAULT_HEADQUARTERS.coords;
          regionKey = 'nagoya_owari';
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
        statusDisplay = `🏢 本社/拠点 （${DEFAULT_HEADQUARTERS.address}）`;
      }

      let timeRangeDisplay = '';
      if (currentEvent) {
        timeRangeDisplay = `${formatTimeJST(currentEvent.start)} - ${currentEvent.end ? formatTimeJST(currentEvent.end) : ''}`;
      }

      return {
        member,
        statusType,
        locationName,
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
        const baseRadius = 0.016 + 0.003 * Math.min(N, 10);
        group.forEach((st, idx) => {
          const angle = (2 * Math.PI * idx) / N - Math.PI / 2;
          const latOffset = baseRadius * Math.sin(angle);
          const lngOffset = baseRadius * Math.cos(angle) * 1.25;
          st.spiderCoords = [st.coords[0] + latOffset, st.coords[1] + lngOffset];
        });
      }
    });

    return rawStatuses;
  }, [teamMembers, events, currentDate, selectedMinutes, lastRefreshedAt]);

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

  // Leaflet 地図インスタンスおよび標準タイル（＋CSSフィルターでキー不要・高品質スタイル変更）の制御
  useEffect(() => {
    if (displayMode === 'cards') return;
    if (!mapContainerRef.current) return;

    if (!mapInstanceRef.current) {
      const map = L.map(mapContainerRef.current, {
        center: [35.1814, 136.9064],
        zoom: 9,
        zoomControl: true,
      });

      // 安定性の高い標準OpenStreetMapタイルを使用
      const tile = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19,
        attribution: '&copy; OpenStreetMap contributors',
      }).addTo(map);

      tileLayerRef.current = tile;
      markersLayerRef.current = L.layerGroup().addTo(map);
      mapInstanceRef.current = map;
    }

    // 地図タイルのCSSフィルター切り替え (APIキー要求・403エラーを完全回避)
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

    // マーカーおよび引き出し線 (Spiderfy Lines) のクリアと再描画
    if (markersLayerRef.current) {
      markersLayerRef.current.clearLayers();

      const drawnHubs = new Set<string>();

      filteredMemberStatuses.forEach((status) => {
        const { member, statusType, coords, spiderCoords, statusDisplay, locationName } = status;
        const hubKey = `${coords[0].toFixed(3)}_${coords[1].toFixed(3)}`;

        const isClustered = filteredMemberStatuses.filter((s) => `${s.coords[0].toFixed(3)}_${s.coords[1].toFixed(3)}` === hubKey).length > 1;

        if (isClustered && !drawnHubs.has(hubKey)) {
          drawnHubs.add(hubKey);
          const count = filteredMemberStatuses.filter((s) => `${s.coords[0].toFixed(3)}_${s.coords[1].toFixed(3)}` === hubKey).length;

          const hubIconHtml = `
            <div className="flex items-center gap-1 bg-indigo-900/90 text-white text-[11px] font-extrabold px-2 py-1 rounded-full shadow-lg border border-indigo-400 backdrop-blur-xs whitespace-nowrap">
              <span className="w-2 h-2 rounded-full bg-emerald-400" />
              <span>${locationName.split(' ')[0]} (${count}名)</span>
            </div>
          `;
          const hubIcon = L.divIcon({
            html: hubIconHtml,
            className: 'location-hub-marker',
            iconSize: [80, 24],
            iconAnchor: [40, 12],
          });
          L.marker(coords, { icon: hubIcon }).addTo(markersLayerRef.current!);
        }

        if (isClustered) {
          const lineColor = mapStyle === 'dark' ? '#818cf8' : '#6366f1';
          const line = L.polyline([coords, spiderCoords], {
            color: lineColor,
            weight: 2,
            dashArray: '4,4',
            opacity: 0.85,
          });
          markersLayerRef.current!.addLayer(line);
        }

        let badgeBg = 'bg-indigo-600 border-indigo-200 text-white';
        let badgeLabel = '🏢 本社';
        let ringEffect = '';

        if (statusType === 'on_site') {
          badgeBg = 'bg-emerald-600 border-emerald-200 text-white';
          badgeLabel = '📍 作業中';
          ringEffect = 'ring-2 ring-emerald-500/50';
        } else if (statusType === 'in_transit') {
          badgeBg = 'bg-amber-500 border-amber-200 text-white';
          badgeLabel = '🚗 移動中';
          ringEffect = 'ring-2 ring-amber-500/60 animate-pulse';
        }

        const avatarUrl = member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`;

        const customIconHtml = `
          <div className="relative group cursor-pointer flex flex-col items-center">
            <div className="relative rounded-full shadow-md border-2 border-white overflow-visible bg-white ${ringEffect}">
              <img src="${avatarUrl}" className="w-9 h-9 rounded-full object-cover" alt="${member.name}" />
              <span className="absolute -bottom-1 -right-1 text-[9px] font-extrabold px-1 py-0.2 rounded-full border shadow-xs ${badgeBg}">
                ${badgeLabel}
              </span>
            </div>
            <div className="mt-0.5 px-1.5 py-0.5 bg-slate-900/90 text-white text-[10px] font-bold rounded shadow-xs whitespace-nowrap backdrop-blur-xs">
              ${member.name}
            </div>
          </div>
        `;

        const customIcon = L.divIcon({
          html: customIconHtml,
          className: 'custom-member-marker',
          iconSize: [40, 50],
          iconAnchor: [20, 25],
        });

        const marker = L.marker(spiderCoords, { icon: customIcon });

        const popupContent = document.createElement('div');
        popupContent.className = 'p-1 text-slate-800 text-xs min-w-[210px] font-sans';
        popupContent.innerHTML = `
          <div className="flex items-center gap-2 pb-1.5 border-b border-slate-100">
            <img src="${avatarUrl}" className="w-8 h-8 rounded-full object-cover border border-slate-200" />
            <div>
              <div className="font-bold text-sm text-slate-900">${member.name}</div>
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
        });

        markersLayerRef.current?.addLayer(marker);
      });
    }
  }, [filteredMemberStatuses, mapStyle, displayMode]);

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
                ? '東海4県のエリア別にメンバーの現在地・移動状況を一覧カード表示します'
                : '重なり自動解消（引き出し線）/ 現在地および移動中（「前の所在地＋移動中」）をリアルタイム判定'}
            </p>
          </div>
        </div>

        {/* Controls */}
        <div className="flex items-center flex-wrap gap-2 text-xs">
          {/* Map Style Selector (Only in Map mode) */}
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
        /* スタンドアロン 簡易エリア別カードダッシュボード */
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
                              <div className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
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
                                    🏢 本社/拠点
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

          {/* Member Status Sidebar List */}
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
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100 p-1">
              {filteredMemberStatuses.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">
                  条件に一致するメンバーはいません
                </div>
              ) : (
                filteredMemberStatuses.map((status) => {
                  const { member, statusType, locationName, prevLocationName, nextLocationName } = status;
                  const isSelected = selectedMemberStatus?.member.id === member.id;

                  return (
                    <div
                      key={member.id}
                      onClick={() => {
                        setSelectedMemberStatus(status);
                        if (mapInstanceRef.current) {
                          mapInstanceRef.current.flyTo(status.spiderCoords, 12, { duration: 0.8 });
                        }
                      }}
                      className={`p-2.5 rounded-lg transition-all cursor-pointer hover:bg-indigo-50/60 ${
                        isSelected ? 'bg-indigo-50/90 border border-indigo-200 shadow-2xs' : ''
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <img
                            src={member.avatarUrl || `https://ui-avatars.com/api/?name=${encodeURIComponent(member.name)}&background=random`}
                            className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                            alt={member.name}
                          />
                          <div>
                            <div className="text-xs font-bold flex items-center gap-1.5">
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
                                  🏢 本社/拠点
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

          {!isLiveTracking ? (
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
          {[9, 12, 15, 18].map((h) => (
            <button
              key={h}
              onClick={() => {
                setSelectedMinutes(h * 60);
                setIsLiveTracking(false);
              }}
              className={`px-2 py-0.5 text-[10px] font-bold rounded border transition-colors ${
                Math.floor(selectedMinutes / 60) === h && !isLiveTracking
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
