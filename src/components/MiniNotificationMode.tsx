import React, { useState, useEffect, useMemo } from 'react';
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
} from 'lucide-react';
import { NotificationItem } from '../utils/notifications';
import { User } from '../types';

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
}

/**
 * PiPウィンドウにメインドキュメントのスタイルシートを複製するヘルパー関数
 */
function copyStylesToWindow(targetDoc: Document) {
  const head = targetDoc.head;
  head.innerHTML = '';

  const title = targetDoc.createElement('title');
  title.textContent = '新着通知 - 寺子屋SNS (最前面常駐)';
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
}: MiniNotificationModeProps) {
  const [pipWindow, setPipWindow] = useState<Window | null>(null);
  const [pipSupported, setPipSupported] = useState<boolean>(false);
  const [selectedFilter, setSelectedFilter] = useState<'all' | 'memo' | 'workflow' | 'board' | 'event' | 'chat' | 'report'>('all');
  const [lastActionMessage, setLastActionMessage] = useState<string | null>(null);

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
            width: 390,
            height: 560,
          });

          copyStylesToWindow(win.document);

          const handlePageHide = () => {
            setPipWindow(null);
            onClose();
          };

          win.addEventListener('pagehide', handlePageHide);
          activePipWin = win;
          setPipWindow(win);
          return;
        } catch (err) {
          console.warn('Document PiP request failed, falling back to floating widget:', err);
          // 権限エラーや非対応時はインアプリのフロートミニモードにフォールバック
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

  // フィルタリング後の通知リスト
  const filteredList = useMemo(() => {
    if (selectedFilter === 'all') return notifications;
    return notifications.filter((n) => n.type === selectedFilter);
  }, [notifications, selectedFilter]);

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
    <div className="flex flex-col h-screen w-full bg-slate-100 text-slate-900 font-sans select-none overflow-hidden">
      {/* Top Bar / Header */}
      <header className="bg-slate-900 text-white px-3.5 py-2.5 flex items-center justify-between shadow-md shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center font-black text-sm shadow-xs shrink-0">
            T
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="font-extrabold text-xs tracking-tight">新着通知</span>
              {unreadCount > 0 ? (
                <span className="px-1.5 py-0.2 text-[10px] font-bold bg-red-500 text-white rounded-full">
                  {unreadCount}
                </span>
              ) : (
                <span className="px-1.5 py-0.2 text-[10px] font-medium bg-slate-700 text-slate-300 rounded-full">
                  0
                </span>
              )}
            </div>
            {isAlwaysOnTop && (
              <div className="flex items-center gap-1 text-[10px] text-emerald-400 font-medium">
                <Pin className="w-2.5 h-2.5" />
                <span>最前面で常駐中</span>
              </div>
            )}
          </div>
        </div>

        {/* Header Right Actions */}
        <div className="flex items-center gap-1 shrink-0">
          <button
            type="button"
            onClick={handleRestore}
            className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
            title="メイン画面を元に戻す（通常画面へ）"
          >
            <Maximize2 className="w-3.5 h-3.5" />
            <span>元に戻す</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="ミニ画面を閉じる"
          >
            <X className="w-4 h-4" />
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

      {/* Category Filter Bar */}
      <div className="bg-white border-b border-slate-200 px-2.5 py-2 flex items-center gap-1 overflow-x-auto no-scrollbar shrink-0 text-xs">
        <button
          type="button"
          onClick={() => setSelectedFilter('all')}
          className={`px-2 py-1 rounded-md text-[11px] font-bold whitespace-nowrap transition-colors cursor-pointer ${
            selectedFilter === 'all'
              ? 'bg-slate-900 text-white shadow-2xs'
              : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          すべて ({notifications.length})
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
      </div>

      {/* Notifications List */}
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {filteredList.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-400">
            <div className="w-12 h-12 rounded-full bg-slate-200/80 flex items-center justify-center text-slate-400 mb-2">
              <CheckCheck className="w-6 h-6 text-emerald-500" />
            </div>
            <p className="text-xs font-bold text-slate-700">新着通知はありません</p>
            <p className="text-[11px] text-slate-400 mt-0.5">最新情報はここにリアルタイムで表示されます</p>
          </div>
        ) : (
          filteredList.map((item) => {
            const badge = getItemBadge(item.type);
            return (
              <div
                key={item.id}
                className="bg-white rounded-xl border border-slate-200 p-3 shadow-2xs hover:border-slate-300 transition-all flex flex-col gap-2"
              >
                {/* Card Top: Type badge & Time */}
                <div className="flex items-center justify-between text-[11px]">
                  <span
                    className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold border ${badge.bgColor}`}
                  >
                    {badge.icon}
                    {badge.label}
                  </span>
                  <span className="text-slate-400 font-medium">{item.createdAt}</span>
                </div>

                {/* Card Middle: Title & Snippet */}
                <div>
                  <h4 className="font-bold text-xs text-slate-900 leading-snug line-clamp-2">
                    {item.title}
                  </h4>
                  {item.description && (
                    <p className="text-[11px] text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                      {item.description}
                    </p>
                  )}
                </div>

                {/* Card Bottom: Action Button */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <span className="text-[10px] text-slate-400">
                    クリックで詳細表示
                  </span>

                  <button
                    type="button"
                    onClick={() => handleItemClick(item)}
                    className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                  >
                    <span>通知内容を表示する</span>
                    <ExternalLink className="w-3 h-3 text-indigo-600" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* Footer Bar */}
      <footer className="bg-white border-t border-slate-200 px-3 py-2 flex items-center justify-between gap-2 shrink-0">
        {unreadCount > 0 ? (
          <button
            type="button"
            onClick={onMarkAllAsRead}
            className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-md transition-colors cursor-pointer"
            title="すべての通知を既読にする"
          >
            <CheckCheck className="w-3.5 h-3.5" />
            <span>すべて既読</span>
          </button>
        ) : (
          <span className="text-[11px] text-slate-400 font-medium">すべて確認済み</span>
        )}

        <button
          type="button"
          onClick={handleRestore}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
        >
          <Maximize2 className="w-3.5 h-3.5 text-indigo-300" />
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

  // 2. PiP非対応またはリクエスト中の場合は画面右下のコンパクトフロートウィジェットとして描画
  return (
    <div className="fixed bottom-4 right-4 z-50 w-96 max-w-[calc(100vw-2rem)] h-[540px] max-h-[calc(100vh-2rem)] rounded-2xl shadow-2xl border border-slate-300/80 overflow-hidden animate-in fade-in slide-in-from-bottom-4 duration-200 ring-1 ring-slate-900/10">
      {renderContent(false)}
    </div>
  );
}
