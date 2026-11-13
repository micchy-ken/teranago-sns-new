import React, { useState, useEffect, useMemo, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  Bell,
  Minimize2,
  Maximize2,
  ExternalLink,
  CheckCheck,
  X,
  Phone,
  FileText,
  Monitor,
  Calendar as CalendarIcon,
  MessageSquare,
  ClipboardList,
  Pin,
  Check,
  ShieldAlert,
} from 'lucide-react';
import { NotificationItem } from '../utils/notifications';
import { User } from '../types';
import { NotificationWindowSize, NOTIFICATION_WINDOW_SIZE_OPTIONS, getSavedNotificationWindowSize, applyNotificationWindowSize } from '../utils/theme';

const MINI_POS_STORAGE_KEY = 'app_mini_notification_position';

function getSavedMiniPosition(): { left: number; top: number } | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(MINI_POS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.left === 'number' && typeof parsed?.top === 'number') {
      return parsed;
    }
  } catch (_) {}
  return null;
}

function clampMiniPosition(pos: { left: number; top: number }, width: number, height: number): { left: number; top: number } {
  if (typeof window === 'undefined') return pos;
  const maxLeft = Math.max(8, window.innerWidth - Math.min(width, window.innerWidth - 16) - 8);
  const maxTop = Math.max(8, window.innerHeight - Math.min(height, window.innerHeight - 16) - 8);
  return {
    left: Math.min(Math.max(8, pos.left), maxLeft),
    top: Math.min(Math.max(8, pos.top), maxTop),
  };
}

declare global {
  interface Window {
    documentPictureInPicture?: {
      requestWindow: (options?: { width?: number; height?: number; disallowReturnToOpener?: boolean }) => Promise<Window>;
      window?: Window | null;
      onenter?: (event: any) => void;
    };
  }
}

interface MiniNotificationModeProps {
  notifications: NotificationItem[];
  unreadCount: number;
  currentUser: User;
  onNotificationClick: (item: NotificationItem) => void;
  onMarkAllAsRead: () => void;
  isOpen: boolean;
  onClose: () => void;
  onRestoreMain: () => void;
  windowSize?: NotificationWindowSize;
  onChangeWindowSize?: (size: NotificationWindowSize) => void;
}

/**
 * PiPウィンドウにメインドキュメントのスタイルシートを複製するヘルパー関数
 */
function copyStylesToWindow(targetDoc: Document) {
  const head = targetDoc.head;
  head.innerHTML = '';

  const title = targetDoc.createElement('title');
  title.textContent = '新着通知 - TERAPO (最前面常駐)';
  head.appendChild(title);

  // Favicon
  const favicon = document.querySelector('link[rel*="icon"]');
  if (favicon) {
    head.appendChild(favicon.cloneNode(true));
  }

  // スタイルシートを複製
  Array.from(document.styleSheets).forEach((sheet) => {
    try {
      if (sheet.cssRules) {
        const style = targetDoc.createElement('style');
        Array.from(sheet.cssRules).forEach((rule) => {
          style.appendChild(targetDoc.createTextNode(rule.cssText));
        });
        head.appendChild(style);
      }
    } catch {
      if (sheet.href) {
        const link = targetDoc.createElement('link');
        link.rel = 'stylesheet';
        link.href = sheet.href;
        head.appendChild(link);
      }
    }
  });

  // linkタグやstyleタグの複製
  document.querySelectorAll('link[rel="stylesheet"], style').forEach((node) => {
    head.appendChild(node.cloneNode(true));
  });

  // HTML / Bodyのクラスとスタイルを複製
  targetDoc.documentElement.className = document.documentElement.className;
  targetDoc.documentElement.style.cssText = document.documentElement.style.cssText;
  targetDoc.body.className = 'bg-slate-100 text-slate-900 m-0 p-0 overflow-hidden font-sans select-none';
}

export function MiniNotificationMode({
  notifications,
  unreadCount,
  currentUser,
  onNotificationClick,
  onMarkAllAsRead,
  isOpen,
  onClose,
  onRestoreMain,
  windowSize: propWindowSize,
  onChangeWindowSize,
}: MiniNotificationModeProps) {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipSupported, setPipSupported] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'memo' | 'workflow' | 'board' | 'event' | 'chat' | 'report' | 'safety'>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all');
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);
  const [internalWindowSize, setInternalWindowSize] = useState<NotificationWindowSize>(() => getSavedNotificationWindowSize());
  const [floatingPos, setFloatingPos] = useState<{ left: number; top: number } | null>(() => getSavedMiniPosition());
  const floatingContainerRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{ startX: number; startY: number; originLeft: number; originTop: number } | null>(null);
  const isUnloadingRef = useRef(false);

  const currentWindowSize = propWindowSize || internalWindowSize;
  const activeSizeOption =
    NOTIFICATION_WINDOW_SIZE_OPTIONS.find((o) => o.id === currentWindowSize) ||
    NOTIFICATION_WINDOW_SIZE_OPTIONS[1];

  useEffect(() => {
    const handleBeforeUnload = () => {
      isUnloadingRef.current = true;
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  useEffect(() => {
    const clampOnResize = () => {
      setFloatingPos((prev) => {
        if (!prev) return null;
        const clamped = clampMiniPosition(prev, activeSizeOption.pipWidth, activeSizeOption.pipHeight);
        try {
          localStorage.setItem(MINI_POS_STORAGE_KEY, JSON.stringify(clamped));
        } catch (_) {}
        return clamped;
      });
    };
    clampOnResize();
    window.addEventListener('resize', clampOnResize);
    return () => window.removeEventListener('resize', clampOnResize);
  }, [activeSizeOption.pipWidth, activeSizeOption.pipHeight]);

  const handleHeaderDragStart = (e: React.MouseEvent<HTMLElement>) => {
    if (pipWindow) return;
    if ((e.target as HTMLElement).closest('button')) return;
    const container = floatingContainerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    dragStateRef.current = {
      startX: e.clientX,
      startY: e.clientY,
      originLeft: rect.left,
      originTop: rect.top,
    };

    const handleMouseMove = (moveEvt: MouseEvent) => {
      const ds = dragStateRef.current;
      if (!ds) return;
      const next = clampMiniPosition(
        {
          left: ds.originLeft + (moveEvt.clientX - ds.startX),
          top: ds.originTop + (moveEvt.clientY - ds.startY),
        },
        rect.width,
        rect.height
      );
      setFloatingPos(next);
    };

    const handleMouseUp = () => {
      dragStateRef.current = null;
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      setFloatingPos((latest) => {
        if (latest) {
          try {
            localStorage.setItem(MINI_POS_STORAGE_KEY, JSON.stringify(latest));
          } catch (_) {}
        }
        return latest;
      });
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
  };

  const handleOpenPipManual = async () => {
    if (!window.documentPictureInPicture || typeof window.documentPictureInPicture.requestWindow !== 'function') return;
    try {
      const win = await window.documentPictureInPicture.requestWindow({
        width: activeSizeOption.pipWidth,
        height: activeSizeOption.pipHeight,
      });
      copyStylesToWindow(win.document);
      win.addEventListener('pagehide', () => {
        setPipWindow(null);
        if (!isUnloadingRef.current) {
          onClose();
        }
      });
      setPipWindow(win);
    } catch (err) {
      console.warn('Manual Document PiP request failed:', err);
    }
  };

  const handleSelectWindowSize = (size: NotificationWindowSize) => {
    setInternalWindowSize(size);
    if (onChangeWindowSize) {
      onChangeWindowSize(size);
    } else {
      applyNotificationWindowSize(size);
    }
    const targetOpt = NOTIFICATION_WINDOW_SIZE_OPTIONS.find((o) => o.id === size);
    if (targetOpt && pipWindow && !pipWindow.closed) {
      try {
        pipWindow.resizeTo(targetOpt.pipWidth, targetOpt.pipHeight);
      } catch (_) {}
    }
  };

  // Document Picture-in-Picture API のサポート確認
  useEffect(() => {
    if (typeof window !== 'undefined' && 'documentPictureInPicture' in window && window.documentPictureInPicture) {
      setPipSupported(true);
    }
  }, []);

  // アクション通知メッセージの自動消去
  useEffect(() => {
    if (lastActionMessage) {
      const timer = setTimeout(() => setLastActionMessage(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [lastActionMessage]);

  // PiPウィンドウのライフサイクル管理
  useEffect(() => {
    let activePipWin: Window | null = null;

    async function openPip() {
      if (!isOpen) {
        if (pipWindow && !pipWindow.closed) {
          pipWindow.close();
        }
        setPipWindow(null);
        return;
      }

      if (window.documentPictureInPicture && typeof window.documentPictureInPicture.requestWindow === 'function') {
        try {
          const win = await window.documentPictureInPicture.requestWindow({
            width: activeSizeOption.pipWidth,
            height: activeSizeOption.pipHeight,
          });

          copyStylesToWindow(win.document);

          const handlePageHide = () => {
            setPipWindow(null);
            if (!isUnloadingRef.current) {
              onClose();
            }
          };

          win.addEventListener('pagehide', handlePageHide);
          activePipWin = win;
          setPipWindow(win);
          return;
        } catch (err) {
          console.warn('Document PiP request failed, falling back to floating widget:', err);
          // 権限エラーや非対応・リロード自動復元時はインアプリのフロートミニモードにフォールバック
          setPipWindow(null);
        }
      }
    }

    openPip();

    return () => {
      if (activePipWin && !activePipWin.closed) {
        activePipWin.close();
      }
    };
  }, [isOpen]);

  // フィルタリング後の通知リスト (未読/確認済み履歴 & カテゴリ)
  const filteredList = useMemo(() => {
    let list = notifications;
    if (selectedFilter !== 'all') {
      list = list.filter((n) => n.type === selectedFilter);
    }
    if (readFilter === 'unread') {
      list = list.filter((n) => !n.isRead);
    }
    return list;
  }, [notifications, selectedFilter, readFilter]);

  // 元に戻す（通常画面へフォーカス＆戻る）
  const handleRestore = () => {
    if (pipWindow && !pipWindow.closed) {
      pipWindow.close();
      setPipWindow(null);
    }
    onRestoreMain();
    window.focus();
    onClose();
  };

  // 通知内容を表示する
  const handleItemClick = (item: NotificationItem) => {
    onNotificationClick(item);
    window.focus();
    setLastActionMessage(`「${item.title}」をメイン画面で開きました`);
  };

  const getItemBadge = (type: NotificationItem['type']) => {
    switch (type) {
      case 'memo':
        return {
          label: '伝言メモ',
          icon: <Phone className="w-3.5 h-3.5 text-amber-600" />,
          bgColor: 'bg-amber-50 text-amber-700 border-amber-200',
        };
      case 'workflow':
        return {
          label: 'ワークフロー',
          icon: <FileText className="w-3.5 h-3.5 text-blue-600" />,
          bgColor: 'bg-blue-50 text-blue-700 border-blue-200',
        };
      case 'board':
        return {
          label: '掲示板',
          icon: <Monitor className="w-3.5 h-3.5 text-indigo-600" />,
          bgColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
        };
      case 'event':
        return {
          label: '予定',
          icon: <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />,
          bgColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
        };
      case 'chat':
        return {
          label: 'チャット',
          icon: <MessageSquare className="w-3.5 h-3.5 text-violet-600" />,
          bgColor: 'bg-violet-50 text-violet-700 border-violet-200',
        };
      case 'report':
        return {
          label: '日報・報告',
          icon: <ClipboardList className="w-3.5 h-3.5 text-teal-600" />,
          bgColor: 'bg-teal-50 text-teal-700 border-teal-200',
        };
      case 'safety':
        return {
          label: '安否確認',
          icon: <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />,
          bgColor: 'bg-rose-50 text-rose-700 border-rose-200',
        };
      default:
        return {
          label: '通知',
          icon: <Bell className="w-3.5 h-3.5 text-slate-600" />,
          bgColor: 'bg-slate-100 text-slate-700 border-slate-200',
        };
    }
  };

  // ミニウィンドウのメインUIコンテンツ
  const renderContent = (isAlwaysOnTop: boolean) => (
    <div className="flex flex-col h-full w-full bg-slate-100 text-slate-900 font-sans select-none overflow-hidden">
      {/* Top Bar / Header (ドラッグで位置移動可能・位置は記憶) */}
      <header
        onMouseDown={handleHeaderDragStart}
        className={`bg-slate-900 text-white px-2.5 py-2 flex items-center justify-between shadow-md shrink-0 gap-1 ${
          isAlwaysOnTop ? '' : 'cursor-move'
        }`}
        title={isAlwaysOnTop ? undefined : 'ドラッグして表示位置を移動（位置は記憶されます）'}
      >
        <div className="flex items-center gap-1.5 min-w-0">
          <div className="w-6 h-6 bg-indigo-600 rounded-md flex items-center justify-center font-black text-xs shadow-xs shrink-0">
            T
          </div>
          <div className="min-w-0 flex items-center gap-1">
            <span className="font-extrabold text-[11px] tracking-tight whitespace-nowrap">通知</span>
            {unreadCount > 0 ? (
              <span className="px-1.5 py-0 text-[9.5px] font-bold bg-red-500 text-white rounded-full">
                {unreadCount}
              </span>
            ) : (
              <span className="px-1.5 py-0 text-[9.5px] font-medium bg-slate-700 text-slate-300 rounded-full">
                0
              </span>
            )}
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <div
            className="inline-flex items-center bg-slate-800 p-0.5 rounded-md border border-slate-700"
            title="ウィンドウの大きさを変更（設定は記憶されます）"
          >
            {NOTIFICATION_WINDOW_SIZE_OPTIONS.map((opt) => {
              const isSelected = currentWindowSize === opt.id;
              return (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => handleSelectWindowSize(opt.id)}
                  className={`px-1.5 py-0.5 text-[9.5px] font-bold rounded transition-colors cursor-pointer whitespace-nowrap ${
                    isSelected
                      ? 'bg-indigo-600 text-white shadow-2xs'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
          {!isAlwaysOnTop && pipSupported && (
            <button
              type="button"
              onClick={handleOpenPipManual}
              className="p-1 bg-slate-800 hover:bg-slate-700 text-emerald-300 rounded-md transition-colors cursor-pointer"
              title="最前面別ウィンドウ (PiP) として切り出す"
            >
              <Pin className="w-3 h-3" />
            </button>
          )}
          <button
            type="button"
            onClick={handleRestore}
            className="flex items-center gap-0.5 px-1.5 py-1 bg-indigo-600 hover:bg-indigo-500 text-white text-[10px] font-bold rounded-md shadow-xs transition-colors cursor-pointer whitespace-nowrap"
            title="メイン画面に戻る"
          >
            <Maximize2 className="w-3 h-3" />
            <span>戻す</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-md transition-colors cursor-pointer"
            title="ミニ画面を閉じる"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      </header>

      {/* Action Toast Feedback */}
      {lastActionMessage && (
        <div className="bg-emerald-600 text-white text-xs px-3 py-1.5 flex items-center justify-between gap-2 shadow-xs shrink-0 animate-in fade-in slide-in-from-top-1 duration-150">
          <div className="flex items-center gap-1.5 truncate">
            <Check className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate">{lastActionMessage}</span>
          </div>
          <button
            type="button"
            onClick={() => setLastActionMessage(null)}
            className="text-white/80 hover:text-white shrink-0"
          >
            <X className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Read / Unread Filter Bar & Quick Mark All */}
      <div className="bg-slate-200/80 border-b border-slate-300/70 px-2.5 py-1.5 flex items-center justify-between gap-1 shrink-0 text-xs">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setReadFilter('all')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer ${
              readFilter === 'all'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            すべて ({notifications.length})
          </button>
          <button
            type="button"
            onClick={() => setReadFilter('unread')}
            className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors cursor-pointer flex items-center gap-1 ${
              readFilter === 'unread'
                ? 'bg-indigo-600 text-white shadow-2xs'
                : 'text-slate-600 hover:bg-white hover:text-slate-900'
            }`}
          >
            <span>未読のみ</span>
            {unreadCount > 0 ? (
              <span className={`px-1 py-0.1 text-[9px] font-bold rounded-full ${
                readFilter === 'unread' ? 'bg-white text-indigo-700' : 'bg-red-500 text-white'
              }`}>
                {unreadCount}
              </span>
            ) : (
              <span className="text-[9px] text-slate-400">0</span>
            )}
          </button>
        </div>
        {unreadCount > 0 && (
          <button
            type="button"
            onClick={onMarkAllAsRead}
            className="text-[10px] font-bold text-indigo-700 hover:text-indigo-900 bg-white hover:bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200 shadow-2xs flex items-center gap-1 transition-colors cursor-pointer"
            title="すべての未読通知を既読にする"
          >
            <CheckCheck className="w-3 h-3 text-indigo-600" />
            <span>すべて既読</span>
          </button>
        )}
      </div>

      {/* Category Filter Bar */}
      <div className="bg-white border-b border-slate-200 px-2.5 py-1.5 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0 text-xs">
        <button
          type="button"
          onClick={() => setSelectedFilter('all')}
          className={`px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
            selectedFilter === 'all'
              ? 'bg-slate-800 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          全種別 ({filteredList.length})
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter('board')}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            selectedFilter === 'board'
              ? 'bg-indigo-600 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          掲示板
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter('event')}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            selectedFilter === 'event'
              ? 'bg-emerald-600 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          予定
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter('memo')}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            selectedFilter === 'memo'
              ? 'bg-amber-600 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          伝言メモ
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter('workflow')}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            selectedFilter === 'workflow'
              ? 'bg-blue-600 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          申請
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter('chat')}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            selectedFilter === 'chat'
              ? 'bg-violet-600 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          チャット
        </button>
        <button
          type="button"
          onClick={() => setSelectedFilter('safety')}
          className={`px-2 py-1 rounded-md text-[11px] font-semibold whitespace-nowrap transition-colors cursor-pointer ${
            selectedFilter === 'safety'
              ? 'bg-rose-600 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          安否確認
        </button>
      </div>

      {/* Notifications List (コンパクト表示で縦情報量アップ) */}
      <div className="flex-1 overflow-y-auto p-1.5 space-y-1">
        {filteredList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-4 text-slate-400">
            <div className="w-10 h-10 rounded-full bg-slate-200/80 flex items-center justify-center text-slate-400 mb-1.5">
              <CheckCheck className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-xs font-bold text-slate-700">
              {readFilter === 'unread' ? '未読の通知はありません' : '通知はありません'}
            </p>
            <p className="text-[10.5px] text-slate-400 mt-0.5">
              {readFilter === 'unread' ? 'すべての通知を確認済みです' : '最新情報はリアルタイムに表示されます'}
            </p>
          </div>
        ) : (
          filteredList.map((item) => {
            const badge = getItemBadge(item.type);
            const isRead = !!item.isRead;
            return (
              <div
                key={item.id}
                onClick={() => handleItemClick(item)}
                className={`rounded-lg border px-2 py-1.5 transition-all cursor-pointer group ${
                  isRead
                    ? 'bg-slate-50/80 border-slate-200/80 text-slate-500 opacity-75 hover:bg-slate-100'
                    : 'bg-white border-indigo-200/90 shadow-2xs hover:border-indigo-400 hover:bg-indigo-50/40'
                }`}
              >
                {/* Card Top: Type badge, Status & Time */}
                <div className="flex items-center justify-between gap-1 text-[10px]">
                  <div className="flex items-center gap-1 min-w-0">
                    <span
                      className={`inline-flex items-center gap-0.5 px-1.5 py-0 rounded font-bold border whitespace-nowrap ${
                        isRead ? 'bg-slate-100 text-slate-500 border-slate-200' : badge.bgColor
                      }`}
                    >
                      {badge.icon}
                      {badge.label}
                    </span>
                    {isRead ? (
                      <span className="px-1 py-0 rounded text-[9px] font-medium bg-slate-200/70 text-slate-500 shrink-0">
                        済
                      </span>
                    ) : (
                      <span className="px-1 py-0 rounded text-[9px] font-bold bg-red-100 text-red-700 border border-red-200 shrink-0">
                        未
                      </span>
                    )}
                  </div>
                  <span className="text-[9.5px] text-slate-400 font-medium whitespace-nowrap shrink-0">
                    {item.createdAt}
                  </span>
                </div>

                {/* Card Middle: Title & Snippet */}
                <div className="flex items-center justify-between gap-1 mt-0.5">
                  <h4
                    className={`text-[11.5px] leading-snug line-clamp-1 flex-1 min-w-0 ${
                      isRead ? 'font-medium text-slate-500' : 'font-bold text-slate-900 group-hover:text-indigo-700'
                    }`}
                  >
                    {item.title}
                  </h4>
                  <ExternalLink className={`w-3 h-3 shrink-0 ${isRead ? 'text-slate-300' : 'text-indigo-500'}`} />
                </div>
                {item.description && (
                  <p
                    className={`text-[10.5px] mt-0.5 leading-snug ${
                      currentWindowSize === 'large' ? 'line-clamp-2' : 'line-clamp-1'
                    } ${
                      isRead ? 'text-slate-400' : 'text-slate-600'
                    }`}
                  >
                    {item.description}
                  </p>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Footer Bar */}
      <footer className="bg-white border-t border-slate-200 px-2.5 py-1.5 flex items-center justify-between gap-2 shrink-0">
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={onMarkAllAsRead}
            className="flex items-center gap-1 text-[10.5px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-1.5 py-0.5 rounded transition-colors cursor-pointer whitespace-nowrap"
            title="すべての通知を既読にする"
          >
            <CheckCheck className="w-3 h-3" />
            <span>すべて既読</span>
          </button>
        ) : (
          <span className="text-[10.5px] text-slate-400 font-medium whitespace-nowrap">すべて確認済み</span>
        )}

        <button
          type="button"
          onClick={handleRestore}
          className="flex items-center gap-1 px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white font-bold text-[11px] rounded-lg shadow-xs transition-colors cursor-pointer whitespace-nowrap"
        >
          <Maximize2 className="w-3 h-3 text-indigo-300" />
          <span>通常画面に戻る</span>
        </button>
      </footer>
    </div>
  );

  if (!isOpen) return null;

  // 1. PiPウィンドウが存在する場合はそちらへ Portal で描画
  if (pipWindow) {
    return createPortal(renderContent(true), pipWindow.document.body);
  }

  // 2. PiP非対応・リロード復元時は記憶された位置のフロートウィジェットとして描画
  return (
    <div
      ref={floatingContainerRef}
      style={floatingPos ? { left: `${floatingPos.left}px`, top: `${floatingPos.top}px` } : undefined}
      className={`fixed z-50 ${floatingPos ? '' : 'bottom-4 right-4'} ${activeSizeOption.miniFloatingClass} max-w-[calc(100vw-1rem)] max-h-[calc(100vh-1rem)] rounded-2xl shadow-2xl border border-slate-300/80 overflow-hidden animate-in fade-in duration-150 ring-1 ring-slate-900/10`}
    >
      {renderContent(false)}
    </div>
  );
}
