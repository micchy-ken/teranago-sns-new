import React, { useState, useRef, useEffect, useLayoutEffect, useCallback, useMemo } from 'react';
import { ChatRoom, ChatMessage, User, OfficeMaster, DivisionMaster, AttachmentFile } from '../types';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { MemberSelector } from './MemberSelector';
import { markChatRoomAsRead, getReadChatTimestamps, getChatRoomUnreadCount } from '../utils/notifications';
import { API_BASE_URL } from '../config/api';
import { getStampUrl } from '../utils/stampUrl';
import { 
  Search, 
  Send, 
  User as UserIcon, 
  Users, 
  MessageSquare, 
  Plus, 
  X, 
  Smile, 
  Image as ImageIcon, 
  Check, 
  CheckCheck, 
  ChevronRight,
  ChevronLeft,
  Images,
  Building2, 
  UserPlus, 
  Info,
  Camera,
  Upload,
  Maximize2,
  Filter,
  Trash2,
  Paperclip,
  Loader2,
  Download,
  Eye,
  Edit3,
  Shield,
  Crown,
  ArrowLeft,
  ArrowDown,
  UploadCloud,
  PanelLeftClose,
  PanelLeftOpen,
  Glasses,
  FileText,
  Share2
} from 'lucide-react';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { uploadMultipleFiles, uploadFile } from '../utils/fileUpload';
import { createImageVariants } from '../utils/imageResize';
import { FilePreviewModal } from './FilePreviewModal';
import { triggerPushNotification } from '../utils/pushNotifications';
import { renderContentWithLinks } from '../utils/renderContentWithLinks';
import { UrlPastePopup, useUrlPasteHandler } from './common/UrlPastePopup';
import { logActivity } from '../utils/logger';
import { buildAppUrl, copyTextToClipboard } from '../utils/urlParams';

interface ChatProps {
  rooms: ChatRoom[];
  users: User[];
  currentUser: User;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  onUpdateRooms?: (rooms: ChatRoom[]) => void;
  onDeleteRoom?: (roomId: string) => void;
  onDeleteMessage?: (roomId: string, messageId: string) => void;
  initialRoomId?: string;
  refetchRooms?: () => void;
}

/**
 * チャット用日時フォーマット関数
 * - 本日: "14:30"
 * - 昨日: "昨日 14:30" (isShort: "昨日")
 * - 今年 (過去): "8/15 14:30" (isShort: "8/15")
 * - 前年以前: "2025/8/15 14:30" (isShort: "2025/8/15")
 */
export function formatChatTimestamp(isoDateStr: string | undefined | null, isShort = false): string {
  if (!isoDateStr) return '';
  const date = new Date(isoDateStr);
  if (isNaN(date.getTime())) return '';

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const diffDays = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

  const timeStr = date.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });

  if (diffDays === 0) {
    return timeStr;
  } else if (diffDays === 1) {
    return isShort ? '昨日' : `昨日 ${timeStr}`;
  } else if (date.getFullYear() === now.getFullYear()) {
    const monthDay = `${date.getMonth() + 1}/${date.getDate()}`;
    return isShort ? monthDay : `${monthDay} ${timeStr}`;
  } else {
    const yearMonthDay = `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
    return isShort ? yearMonthDay : `${yearMonthDay} ${timeStr}`;
  }
}

/**
 * チャットタイムラインの日付ヘッダー表示用
 */
export function formatDateDividerLabel(isoDateStr: string | undefined | null): string {
  if (!isoDateStr) return '';
  const d = new Date(isoDateStr);
  if (isNaN(d.getTime())) return '';

  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const dayOfWeek = days[d.getDay()];

  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diffDays = Math.round((today.getTime() - targetDate.getTime()) / (1000 * 60 * 60 * 24));

  if (diffDays === 0) {
    return `今日 (${dayOfWeek})`;
  } else if (diffDays === 1) {
    return `昨日 (${dayOfWeek})`;
  } else if (d.getFullYear() === now.getFullYear()) {
    return `${d.getMonth() + 1}月${d.getDate()}日(${dayOfWeek})`;
  } else {
    return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日(${dayOfWeek})`;
  }
}

// カスタムスタンプ型定義
export interface ChatStampItem {
  id: string;
  text: string;
  imageUrl: string;
  icon?: string;
  color?: string;
}

export interface ChatStampCategory {
  id: string;
  name: string;
  stamps: ChatStampItem[];
}

interface ChatMessageItemProps {
  msg: ChatMessage;
  currentUser: User;
  users: User[];
  activeRoom: ChatRoom | undefined;
  isMine: boolean;
  isSystem: boolean;
  isFirstUnread: boolean;
  isDifferentDate: boolean;
  showSenderName: boolean;
  showAvatar: boolean;
  stampCategories?: ChatStampCategory[];
  isBossMode?: boolean;
  onDeleteMessage: (id: string) => void;
  onOpenViewers: (msg: ChatMessage) => void;
  onOpenPreview: (att: AttachmentFile) => void;
  onOpenLightbox: (images: string | string[], initialIndex?: number) => void;
  onDownloadAttachment: (att: AttachmentFile) => void;
}

const ChatMessageItem = React.memo(function ChatMessageItem({
  msg,
  currentUser,
  users,
  activeRoom,
  isMine,
  isSystem,
  isFirstUnread,
  isDifferentDate,
  showSenderName,
  showAvatar,
  stampCategories,
  isBossMode,
  onDeleteMessage,
  onOpenViewers,
  onOpenPreview,
  onOpenLightbox,
  onDownloadAttachment
}: ChatMessageItemProps) {
  if (isSystem) {
    return (
      <div className="flex flex-col items-center">
        {isDifferentDate && (
          <div className="flex justify-center my-3 sm:my-4 select-none">
            <span className="px-3 py-1 bg-slate-200/90 text-slate-600 text-[11px] font-bold rounded-full shadow-2xs border border-slate-300/50">
              {formatDateDividerLabel(msg.createdAt)}
            </span>
          </div>
        )}
        {isFirstUnread && (
          <div id="unread-line-divider" className="w-full flex items-center gap-3 my-4 px-2 select-none">
            <div className="flex-1 h-px bg-rose-300/80" />
            <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 text-rose-600 text-[11px] font-extrabold rounded-full shadow-2xs">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
              ここから未読メッセージ
            </div>
            <div className="flex-1 h-px bg-rose-300/80" />
          </div>
        )}
        <div className="flex justify-center my-2 sm:my-3">
          <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-slate-200/80 text-slate-600 text-[10px] sm:text-[11px] font-medium rounded-full shadow-2xs">
            {msg.content}
          </span>
        </div>
      </div>
    );
  }

  const senderUser = (msg.sender.id === currentUser.id ? currentUser : undefined) || users.find((u) => u.id === msg.sender.id) || msg.sender;
  const senderAvatar = (msg.sender.id === currentUser.id ? currentUser.avatarUrl : senderUser?.avatarUrl) || msg.sender.avatarUrl;
  const senderName = (msg.sender.id === currentUser.id ? currentUser.name : senderUser?.name) || msg.sender.name;

  return (
    <div className="flex flex-col">
      {isDifferentDate && (
        <div className="flex justify-center my-3 sm:my-4 select-none">
          <span className="px-3 py-1 bg-slate-200/90 text-slate-600 text-[11px] font-bold rounded-full shadow-2xs border border-slate-300/50">
            {formatDateDividerLabel(msg.createdAt)}
          </span>
        </div>
      )}
      {isFirstUnread && (
        <div id="unread-line-divider" className="flex items-center gap-3 my-4 px-2 select-none">
          <div className="flex-1 h-px bg-rose-300/80" />
          <div className="flex items-center gap-1.5 px-3 py-1 bg-rose-50 border border-rose-200 text-rose-600 text-[11px] font-extrabold rounded-full shadow-2xs">
            <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
            ここから未読メッセージ
          </div>
          <div className="flex-1 h-px bg-rose-300/80" />
        </div>
      )}
      <div className={`flex gap-2 sm:gap-2.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
        {/* 相手のアバター（自分のメッセージにはアイコンを表示しない） */}
        {!isMine && (
          <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0">
            {showAvatar ? (
              <img
                src={getAvatarUrl(senderAvatar)}
                alt={senderName}
                onError={handleAvatarError}
                className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 object-cover shadow-2xs"
                loading="lazy"
              />
            ) : (
              <div className="w-7 h-7 sm:w-8 sm:h-8" />
            )}
          </div>
        )}

        <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%]`}>
          {showSenderName && (
            <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 mb-1 ml-1">
              {senderName}
            </span>
          )}

          <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
            {/* メッセージコンテンツ (テキスト / スタンプ / 写真) */}
            {msg.type === 'stamp' ? (
              <div className="p-1 relative">
                {(() => {
                  const activeCats = stampCategories || [];
                  const stampDef = activeCats.flatMap((c) => c.stamps).find((s) => s.id === msg.stampId);
                  const stampImg = (stampDef as any)?.imageUrl || (msg as any).imageUrl || (msg as any).stampImageUrl || null;
                  return (
                    <div className="relative group flex flex-col items-center">
                      {stampImg ? (
                        <img
                          src={getStampUrl(stampImg)}
                          alt={msg.stampText || msg.content}
                          className="w-32 h-32 sm:w-36 sm:h-36 object-contain hover:scale-105 transition-transform filter drop-shadow-sm"
                        />
                      ) : (
                        <div className="w-32 h-32 sm:w-36 sm:h-36 inline-flex flex-col items-center justify-center p-2.5 sm:p-3 rounded-2xl border shadow-xs bg-indigo-50 text-indigo-900 border-indigo-200">
                          <span className="text-2xl sm:text-3xl mb-1">{stampDef?.icon || '😊'}</span>
                          <span className="text-xs sm:text-sm font-black tracking-wide">{msg.stampText || msg.content}</span>
                        </div>
                      )}

                      {/* ボスモード用の業務スタンプカバー（画像タグを破棄せず瞬時に上に重ねることで0秒切り替え） */}
                      {isBossMode && (
                        <div className="absolute inset-0 rounded-2xl bg-slate-100 border border-slate-300/80 p-3 flex flex-col items-center justify-center text-center shadow-2xs select-none z-10 pointer-events-none">
                          <FileText className="w-7 h-7 text-slate-400 mb-1.5 shrink-0" />
                          <span className="text-[10px] font-bold text-slate-500 tracking-wider">業務スタンプ</span>
                          <span className="text-xs font-bold text-slate-700 line-clamp-2 mt-1 px-1">
                            {msg.stampText || msg.content || '確認いたしました'}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })()}
              </div>
            ) : msg.type === 'image' ? (
              msg.images && msg.images.length > 1 ? (
                // 複数写真アルバム表示 (最大10枚対応フォトグリッド)
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm w-64 sm:w-80 max-w-[85vw]">
                  <div className="relative group p-1 bg-slate-100/60 select-none">
                    <div className={`grid gap-1 overflow-hidden rounded-xl ${
                      msg.images.length === 2
                        ? 'grid-cols-2 aspect-[16/10]'
                        : msg.images.length === 3
                        ? 'grid-cols-2 grid-rows-2 aspect-[4/3]'
                        : 'grid-cols-2 grid-rows-2 aspect-square'
                    }`}>
                      {msg.images.slice(0, 4).map((photo, idx) => {
                        const isSpan = msg.images!.length === 3 && idx === 0;
                        const isFourthWithMore = idx === 3 && msg.images!.length > 4;
                        const remainingCount = msg.images!.length - 4;
                        const allPhotoUrls = msg.images!.map(p => p.url || p.thumbnailUrl || '');

                        return (
                          <div
                            key={idx}
                            onClick={() => {
                              if (!isBossMode) {
                                onOpenLightbox(allPhotoUrls, idx);
                              }
                            }}
                            className={`relative overflow-hidden cursor-pointer bg-slate-200 group/cell ${
                              isSpan ? 'row-span-2' : ''
                            }`}
                          >
                            <img
                              src={photo.thumbnailUrl || photo.url}
                              alt={`写真 ${idx + 1}`}
                              decoding="async"
                              className="w-full h-full object-cover group-hover/cell:scale-105 transition-transform duration-200"
                            />
                            {/* 4枚目以降の残枚数バッジ (+○枚) */}
                            {isFourthWithMore && (
                              <div className="absolute inset-0 bg-black/60 backdrop-blur-xs flex flex-col items-center justify-center text-white font-black text-lg sm:text-xl">
                                <span>+{remainingCount}</span>
                                <span className="text-[10px] font-medium tracking-tight">さらに表示</span>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* ボスモード用の業務アルバムカバー (高さ・比率を維持して瞬時オーバーレイ) */}
                    {isBossMode && (
                      <div className="absolute inset-1 rounded-xl bg-slate-100 flex flex-col items-center justify-center p-4 text-center select-none z-10 pointer-events-none border border-slate-300/80">
                        <FileText className="w-8 h-8 text-slate-400 mb-1.5 shrink-0" />
                        <span className="text-xs font-bold text-slate-700">[添付資料: 業務アルバム ({msg.images.length}枚)]</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">参照用ファイル一式</span>
                      </div>
                    )}
                  </div>

                  {msg.content && msg.content !== '写真を送信しました' && (
                    <div className="p-2 sm:p-2.5 text-xs text-slate-800 border-t border-slate-100 whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  )}
                </div>
              ) : (
                // 単体写真表示 (1枚写真カード)
                <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm w-56 sm:w-64 max-w-[75vw]">
                  <div
                    className="relative group cursor-pointer aspect-[4/3] bg-slate-100 flex items-center justify-center overflow-hidden"
                    onClick={() => {
                      if (!isBossMode && (msg.imageUrl || msg.thumbnailUrl)) {
                        onOpenLightbox(msg.imageUrl || msg.thumbnailUrl!);
                      }
                    }}
                  >
                    <img
                      src={msg.thumbnailUrl || msg.imageUrl || undefined}
                      alt="添付写真"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />

                    {/* ホバー時の拡大表示ラベル (通常モード時) */}
                    {!isBossMode && (
                      <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1 pointer-events-none">
                        <Maximize2 className="w-4 h-4" /> 拡大表示
                      </div>
                    )}

                    {/* ボスモード用のグレイ業務カバー (画像を破棄せず上に重ねることで0秒・再読込遅延なし) */}
                    {isBossMode && (
                      <div className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center p-4 text-center select-none z-10 pointer-events-none">
                        <FileText className="w-8 h-8 text-slate-400 mb-1.5 shrink-0" />
                        <span className="text-xs font-bold text-slate-700">[添付資料: 業務画像]</span>
                        <span className="text-[10px] text-slate-400 mt-0.5">参照用ファイル</span>
                      </div>
                    )}
                  </div>

                  {msg.content && msg.content !== '写真を送信しました' && (
                    <div className="p-2 sm:p-2.5 text-xs text-slate-800 border-t border-slate-100 whitespace-pre-wrap">
                      {msg.content}
                    </div>
                  )}
                </div>
              )
            ) : (
              // LINE風フキダシ
              <div className="flex flex-col gap-1.5 items-stretch">
                <div
                  className={`px-3.5 py-2 sm:px-4 sm:py-2.5 rounded-2xl text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words shadow-2xs relative ${
                    isMine
                      ? 'bg-[#dcf8c6] text-slate-900 rounded-tr-xs border border-emerald-200/80 font-medium'
                      : 'bg-white text-slate-800 rounded-tl-xs border border-slate-200'
                  }`}
                >
                  {renderContentWithLinks(msg.content)}
                </div>
                
                {/* チャット添付ファイルリスト */}
                {msg.attachments && msg.attachments.length > 0 && (
                  <div className={`flex flex-col gap-1.5 ${isMine ? 'items-end' : 'items-start'}`}>
                    {msg.attachments.map(att => (
                      <div
                        key={att.id}
                        className="flex items-center justify-between gap-3 p-2 bg-white/95 border border-slate-200 rounded-xl text-xs shadow-2xs max-w-xs"
                      >
                        <div className="flex items-center gap-1.5 min-w-0 pr-1">
                          <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 truncate" title={att.name}>{att.name}</div>
                            <div className="text-[9px] text-slate-400">{att.size}</div>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0 border-l border-slate-100 pl-1.5 font-bold">
                          {(att.type?.startsWith('image/') || /\.pdf$/i.test(att.name) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(att.name)) && (
                            <button
                              type="button"
                              onClick={() => onOpenPreview(att)}
                              className="text-emerald-600 hover:text-emerald-800 text-[10px]"
                            >
                              プレビュー
                            </button>
                          )}
                          <a
                            href={att.url || '#'}
                            download={att.name}
                            onClick={(e) => {
                              if (!att.url) {
                                e.preventDefault();
                                onDownloadAttachment(att);
                              }
                            }}
                            className="text-indigo-600 hover:text-indigo-800 text-[10px] pl-1.5"
                          >
                            DL
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 既読 & タイムスタンプ */}
            <div className={`flex flex-col text-[10px] text-slate-400 shrink-0 mb-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
              {(() => {
                const viewersList = msg.viewers || [];
                const senderId = String(msg.sender?.id ?? '');
                // 送信者を除外した既読メンバー (IDをString型に正規化して数値・文字列の型違いによる誤カウントを完全防止)
                const readMembers = viewersList.filter((v: any) => {
                  const viewerId = String(v?.user?.id ?? v?.userId ?? v?.id ?? '');
                  return viewerId !== '' && viewerId !== senderId;
                });
                const readCount = readMembers.length;

                // 送信者を除いたトーク参加メンバー
                const otherParticipants = (activeRoom?.participants || []).filter(
                  (p: any) => String(p?.id ?? '') !== senderId
                );
                
                let displayText = `[既読 ${readCount}]`;
                const isAllRead = otherParticipants.length > 0 && otherParticipants.every(
                  (p: any) => readMembers.some((v: any) => String(v?.user?.id ?? v?.userId ?? v?.id ?? '') === String(p?.id ?? ''))
                );
                
                if (readCount === 0) {
                  displayText = '[未読]';
                } else if (isAllRead) {
                  displayText = '[全員が既読]';
                }

                return (
                  <button
                    type="button"
                    onClick={() => onOpenViewers(msg)}
                    className={`text-[10px] font-bold hover:underline cursor-pointer bg-transparent border-none p-0 flex items-center gap-0.5 ${
                      readCount === 0 
                        ? 'text-slate-400 hover:text-slate-500' 
                        : 'text-emerald-600 hover:text-emerald-700'
                    }`}
                    title="既読メンバーを確認"
                  >
                    {displayText}
                  </button>
                );
              })()}
              <span>
                {formatChatTimestamp(msg.createdAt, false)}
              </span>
              {isMine && (
                <button
                  type="button"
                  onClick={() => onDeleteMessage(msg.id)}
                  className="text-slate-400 hover:text-rose-500 transition-colors mt-1 cursor-pointer flex items-center gap-0.5"
                  title="メッセージを削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
});

export function Chat({
  rooms,
  users,
  currentUser,
  offices = [],
  divisions = [],
  onUpdateRooms,
  onDeleteRoom,
  onDeleteMessage,
  initialRoomId,
  refetchRooms
}: ChatProps) {
  // 自分が参加している部屋のみを抽出
  const myRooms = rooms.filter((r) => r.participants && r.participants.some((p) => p.id === currentUser.id));

  const [activeRoomId, setActiveRoomId] = useState<string>(() => {
    const initial = rooms.filter((r) => r.participants && r.participants.some((p) => p.id === currentUser.id))[0]?.id || '';
    return initial;
  });
  const [mobileView, setMobileView] = useState<'list' | 'room'>(() => initialRoomId ? 'room' : 'list');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  // ルーム一覧サイドバーの折りたたみ設定（localStorageに保存）
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem('chat_sidebar_collapsed') === 'true';
    } catch {
      return false;
    }
  });

  const toggleSidebar = () => {
    setIsSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('chat_sidebar_collapsed', String(next));
      } catch {}
      return next;
    });
  };

  // activeRoomIdの整合性維持（退室時や部屋増減時）
  useEffect(() => {
    if (myRooms.length > 0) {
      if (!activeRoomId || !myRooms.some(r => r.id === activeRoomId)) {
        setActiveRoomId(myRooms[0].id);
      }
    } else {
      setActiveRoomId('');
    }
  }, [rooms, currentUser?.id]);

  // 閲覧メンバーモーダル用
  const [viewersModalOpen, setViewersModalOpen] = useState(false);
  const [selectedMsgForViewers, setSelectedMsgForViewers] = useState<ChatMessage | null>(null);

  const activeRoom = myRooms.find((r) => r.id === activeRoomId) || myRooms[0];

  // ローカル既読タイムスタンプの同期
  const [readChatTimestamps, setReadChatTimestamps] = useState<Record<string, string>>(() =>
    getReadChatTimestamps(currentUser?.id)
  );

  // カスタムスタンプデータの動的取得
  const [stampCategories, setStampCategories] = useState<ChatStampCategory[]>([]);

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE_URL}/stamps`)
      .then((res) => res.json())
      .then((data) => {
        if (isMounted && data.success && Array.isArray(data.categories)) {
          setStampCategories(data.categories);
          if (data.categories.length > 0) {
            setActiveStampCategory((prev) => prev || data.categories[0].id);
          }
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const handleSync = () => {
      setReadChatTimestamps(getReadChatTimestamps(currentUser?.id));
    };
    handleSync();
    window.addEventListener('notifications_updated', handleSync);
    return () => window.removeEventListener('notifications_updated', handleSync);
  }, [currentUser?.id]);

  // トークルーム閲覧ログの記録（部屋切り替え時に記録）
  const lastLoggedRoomIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeRoom || !currentUser?.id) return;
    if (lastLoggedRoomIdRef.current !== activeRoom.id) {
      lastLoggedRoomIdRef.current = activeRoom.id;
      logActivity('chat_view', `トーク「${getRoomName(activeRoom)}」を閲覧しました`, currentUser);
    }
  }, [activeRoom?.id, currentUser?.id]);

  // 未読メッセージを自動で既読にする
  useEffect(() => {
    if (!activeRoom || !currentUser) return;

    // アクティブルームのローカル既読タイムスタンプを即時更新
    markChatRoomAsRead(currentUser.id, activeRoom.id);

    const messages = activeRoom.messages || [];

    // 自分以外のメッセージで、自分がまだ既読になっていないメッセージ
    const currentUserIdStr = String(currentUser.id);
    const unreadMsgs = messages.filter(msg => {
      const isMine = String(msg.sender?.id ?? '') === currentUserIdStr;
      if (isMine) return false;
      const viewers = msg.viewers || [];
      const alreadyRead = viewers.some((v: any) => String(v?.user?.id ?? v?.userId ?? v?.id ?? '') === currentUserIdStr);
      return !alreadyRead;
    });

    if (unreadMsgs.length === 0) return;

    const markAsRead = async () => {
      try {
        const promises = unreadMsgs.map(async (msg) => {
          await fetch(`${API_BASE_URL}/chats/messages/${msg.id}/viewers`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user: currentUser })
          });
        });
        await Promise.all(promises);

        if (refetchRooms) {
          refetchRooms();
        }
      } catch (err) {
        console.error('Failed to mark messages as read:', err);
      }
    };

    markAsRead();
  }, [activeRoom?.id, activeRoom?.messages?.length, currentUser]);

  const handleDeleteRoomClick = (roomId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'チャットルームの削除',
      message: 'このチャットルームを削除してもよろしいですか？この操作は取り消せません。',
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: () => {
        if (onDeleteRoom) {
          onDeleteRoom(roomId);
        }
        if (activeRoomId === roomId) {
          const remainingRooms = rooms.filter(r => r.id !== roomId);
          if (remainingRooms.length > 0) {
            setActiveRoomId(remainingRooms[0].id);
          } else {
            setActiveRoomId('');
          }
        }
      }
    });
  };

  const handleDeleteMessageClick = (messageId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'メッセージの削除',
      message: 'このメッセージを削除してもよろしいですか？この操作は取り消せません。',
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: () => {
        if (onDeleteMessage && activeRoom) {
          onDeleteMessage(activeRoom.id, messageId);
        }
      }
    });
  };

  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const handleShareRoom = async () => {
    if (!activeRoom) return;
    const url = buildAppUrl({ tab: 'chat', chatRoomId: activeRoom.id });
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const processedInitialRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialRoomId && processedInitialRoomIdRef.current !== initialRoomId) {
      if (rooms.length > 0) {
        processedInitialRoomIdRef.current = initialRoomId;
        const targetRoom = rooms.find(r => r.id === initialRoomId);
        if (targetRoom) {
          const isMember = targetRoom.participants && targetRoom.participants.some(p => p.id === currentUser.id);
          if (isMember) {
            setActiveRoomId(initialRoomId);
            setMobileView('room');
          } else {
            setConfirmModal({
              isOpen: true,
              title: 'チャットルームへの参加制限',
              message: `対象のトークルーム「${getRoomName(targetRoom)}」のメンバーではないため参加・閲覧できません。ルーム管理者またはメンバーに参加者追加を依頼してください。`,
              type: 'info',
              confirmText: '閉じる',
              onConfirm: () => {}
            });
          }
        } else {
          setConfirmModal({
            isOpen: true,
            title: 'ルームが見つかりません',
            message: '指定されたチャットルームは削除されたか、存在しません。',
            type: 'info',
            confirmText: '閉じる',
            onConfirm: () => {}
          });
        }
      }
    }
  }, [initialRoomId, rooms, currentUser.id]);

  // 「ここから未読メッセージ」ライン用の最初の未読メッセージIDを記録するステート
  const [firstUnreadMessageId, setFirstUnreadMessageId] = useState<string | null>(null);
  const currentRoomIdForUnreadRef = useRef<string | null>(null);

  // 表示開始インデックス（過去ログのオンデマンド遡り読み込み用）
  const [visibleStartIndex, setVisibleStartIndex] = useState<number>(0);
  const [isLoadingMorePrevious, setIsLoadingMorePrevious] = useState<boolean>(false);
  const prevScrollHeightRef = useRef<number>(0);
  const prevScrollTopRef = useRef<number>(0);
  const isPrependingRef = useRef<boolean>(false);

  useEffect(() => {
    if (!activeRoom || !currentUser?.id) {
      setFirstUnreadMessageId(null);
      currentRoomIdForUnreadRef.current = null;
      setVisibleStartIndex(0);
      return;
    }

    // ルームが切り替わったタイミング（または未選択状態からの入室時）にのみ「最初の未読メッセージ」と初期表示インデックスを特定
    if (currentRoomIdForUnreadRef.current !== activeRoom.id) {
      currentRoomIdForUnreadRef.current = activeRoom.id;
      const messages = activeRoom.messages || [];

      // ローカルストレージに保存されている前回の閲覧タイムスタンプを取得
      const storageKey = `teranago_chat_last_visited_${currentUser.id}`;
      let storedTimestamps: Record<string, string> = {};
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) storedTimestamps = JSON.parse(raw);
      } catch (e) {}

      const lastVisitedIso = storedTimestamps[activeRoom.id];
      const serverReadTime = activeRoom.readStatus?.[currentUser.id] || (activeRoom as any).lastReadTimestamps?.[currentUser.id];

      // 前回の閲覧タイムスタンプ（ローカルの記録を優先し、無ければサーバーの記録）
      const baseReadIso = lastVisitedIso || serverReadTime;

      let unreadMsg: ChatMessage | undefined;

      if (baseReadIso) {
        const baseReadTime = new Date(baseReadIso).getTime();
        unreadMsg = messages.find((msg) => {
          if (msg.sender.id === currentUser.id) return false;
          const msgTime = new Date(msg.createdAt || 0).getTime();
          // メッセージ作成日時が前回の閲覧日時より新しいか（精度向上：1秒以上の差）
          return msgTime > baseReadTime + 500;
        });
      }

      // タイムスタンプで未検出の場合は msg.viewers（閲覧履歴）によるフォールバック検索
      if (!unreadMsg) {
        const currentUserIdStr = String(currentUser.id);
        unreadMsg = messages.find((msg) => {
          if (String(msg.sender?.id ?? '') === currentUserIdStr) return false;
          const viewers = msg.viewers || [];
          const isViewed = viewers.some((v: any) =>
            String(v?.user?.id ?? v?.userId ?? v?.id ?? '') === currentUserIdStr
          );
          return !isViewed;
        });
      }

      const unreadId = unreadMsg ? unreadMsg.id : null;
      setFirstUnreadMessageId(unreadId);

      // 初期表示範囲の計算:
      // 未読がある場合: 未読メッセージの直前5件〜最新までを表示
      // 未読がない場合: 最新25件を表示
      if (unreadId) {
        const unreadIdx = messages.findIndex(m => m.id === unreadId);
        const initStart = unreadIdx >= 0 ? Math.max(0, unreadIdx - 5) : Math.max(0, messages.length - 25);
        setVisibleStartIndex(initStart);
      } else {
        setVisibleStartIndex(Math.max(0, messages.length - 25));
      }

      // 今回の訪問完了として、現在日時をローカルに更新保存
      try {
        storedTimestamps[activeRoom.id] = new Date().toISOString();
        localStorage.setItem(storageKey, JSON.stringify(storedTimestamps));
      } catch (e) {}
    }
  }, [activeRoom?.id, currentUser?.id]);

  // 過去メッセージ追加時のスクロール位置補正（位置跳躍の完全防止）
  useLayoutEffect(() => {
    if (isPrependingRef.current && chatContainerRef.current) {
      const container = chatContainerRef.current;
      const heightDiff = container.scrollHeight - prevScrollHeightRef.current;
      if (heightDiff > 0) {
        container.scrollTop = prevScrollTopRef.current + heightDiff;
      }
      isPrependingRef.current = false;
    }
  }, [visibleStartIndex]);

  // 上スクロールによる過去ログの自動追加読み込み
  const loadMorePreviousMessages = () => {
    if (visibleStartIndex <= 0 || isLoadingMorePrevious) return;
    const container = chatContainerRef.current;
    if (!container) return;

    setIsLoadingMorePrevious(true);
    prevScrollHeightRef.current = container.scrollHeight;
    prevScrollTopRef.current = container.scrollTop;
    isPrependingRef.current = true;

    // 読み込みの演出とレンダリング安定化
    setTimeout(() => {
      setVisibleStartIndex(prev => Math.max(0, prev - 25));
      setIsLoadingMorePrevious(false);
    }, 180);
  };

  // スクロール位置および新着メッセージ到着通知バッジ
  const [showScrollToBottom, setShowScrollToBottom] = useState<boolean>(false);
  const [hasNewMessagesBelow, setHasNewMessagesBelow] = useState<boolean>(false);

  const checkScrollBottom = useCallback(() => {
    const container = chatContainerRef.current;
    if (!container) return;
    const distanceFromBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    const isNearBottom = distanceFromBottom < 100;
    setShowScrollToBottom(!isNearBottom);
    if (isNearBottom) {
      setHasNewMessagesBelow(false);
    }
  }, []);

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    // 上部付近（60px以内）にスクロールした際に過去メッセージを自動読み込み
    if (container.scrollTop < 60 && visibleStartIndex > 0 && !isLoadingMorePrevious) {
      loadMorePreviousMessages();
    }
    checkScrollBottom();
  };

  useEffect(() => {
    if (activeRoomId && currentUser?.id) {
      markChatRoomAsRead(currentUser.id, activeRoomId);
    }
  }, [activeRoomId, currentUser?.id]);
  const [messageText, setMessageText] = useState('');
  const chatPasteHandler = useUrlPasteHandler(messageText, setMessageText);
  const [roomFilter, setRoomFilter] = useState<'all' | 'group' | 'dm'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ポップオーバー・モーダル状態
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showInfoSidebar, setShowInfoSidebar] = useState(false);
  const [showStampPicker, setShowStampPicker] = useState(false);
  const [activeStampCategory, setActiveStampCategory] = useState('');
  const [lightboxGallery, setLightboxGallery] = useState<{
    images: string[];
    currentIndex: number;
  } | null>(null);

  // ライトボックス写真送りショートカット (←/→キー)
  useEffect(() => {
    if (!lightboxGallery || lightboxGallery.images.length <= 1) return;
    const handleGalleryKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        setLightboxGallery(prev => (prev && prev.currentIndex > 0) ? { ...prev, currentIndex: prev.currentIndex - 1 } : prev);
      } else if (e.key === 'ArrowRight') {
        setLightboxGallery(prev => (prev && prev.currentIndex < prev.images.length - 1) ? { ...prev, currentIndex: prev.currentIndex + 1 } : prev);
      }
    };
    window.addEventListener('keydown', handleGalleryKey);
    return () => window.removeEventListener('keydown', handleGalleryKey);
  }, [lightboxGallery]);

  // ボスが来たモード（スタンプ・写真を業務テキストへ瞬時に擬態）
  const [isBossMode, setIsBossMode] = useState<boolean>(() => {
    try {
      return localStorage.getItem('teranago_chat_boss_mode') === 'true';
    } catch {
      return false;
    }
  });

  const toggleBossMode = useCallback(() => {
    setIsBossMode((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('teranago_chat_boss_mode', String(next));
      } catch {}
      return next;
    });
  }, []);

  // 緊急キーボードショートカット (Shift + Esc)
  useEffect(() => {
    const handleGlobalKey = (e: KeyboardEvent) => {
      if (e.shiftKey && e.key === 'Escape') {
        e.preventDefault();
        toggleBossMode();
      }
    };
    window.addEventListener('keydown', handleGlobalKey);
    return () => window.removeEventListener('keydown', handleGlobalKey);
  }, [toggleBossMode]);

  // チャットルームの編集用ステート
  const [isRenamingRoom, setIsRenamingRoom] = useState(false);
  const [roomRenameText, setRoomRenameText] = useState('');

  // 添付ファイル関連ステート
  const [chatAttachments, setChatAttachments] = useState<AttachmentFile[]>([]);
  const [isChatUploading, setIsChatUploading] = useState(false);
  const [isChatDraggingOver, setIsChatDraggingOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const chatFileInputRef = useRef<HTMLInputElement>(null);
  const chatTextareaRef = useRef<HTMLTextAreaElement>(null);
  const [isComposing, setIsComposing] = useState(false);

  // テキストエリアの高さ自動調整 (最大120px)
  useEffect(() => {
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
      const scrollH = chatTextareaRef.current.scrollHeight;
      chatTextareaRef.current.style.height = `${Math.min(Math.max(scrollH, 38), 120)}px`;
    }
  }, [messageText]);

  useEffect(() => {
    setChatAttachments([]);
    setIsChatUploading(false);
  }, [activeRoomId]);

  // 新規ルーム作成フォーム状態
  const [newRoomType, setNewRoomType] = useState<'group' | 'dm'>('group');
  const [newRoomName, setNewRoomName] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [modalSearch, setModalSearch] = useState('');
  const [modalOffice, setModalOffice] = useState('all');
  const [modalDivision, setModalDivision] = useState('all');

  // 写真プレビュー＆アップロード（2段階サムネイル対応）
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const [pendingThumbnailUrl, setPendingThumbnailUrl] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');

  // 複数写真アルバム（最大10枚対応）
  const [pendingAlbumPhotos, setPendingAlbumPhotos] = useState<Array<{
    id: string;
    file: File;
    previewUrl: string;
  }>>([]);
  const [albumCaption, setAlbumCaption] = useState('');
  const [isAlbumUploading, setIsAlbumUploading] = useState(false);
  const [albumNotice, setAlbumNotice] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // チャットスクロール用Ref
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevRoomIdRef = useRef<string | null>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const lastScrolledKeyRef = useRef<string>('');

  // タイムライン最下部へのスムーズスクロール
  const scrollToBottomSmooth = useCallback(() => {
    const c = chatContainerRef.current;
    if (c) {
      c.scrollTo({ top: c.scrollHeight, behavior: 'smooth' });
      setHasNewMessagesBelow(false);
      setShowScrollToBottom(false);
    }
  }, []);

  const handleOpenViewersModal = useCallback((msg: ChatMessage) => {
    setSelectedMsgForViewers(msg);
    setViewersModalOpen(true);
  }, []);

  const handleOpenPreviewFile = useCallback((att: AttachmentFile) => {
    setPreviewFile(att);
    setIsPreviewOpen(true);
  }, []);

  const handleOpenLightboxImage = useCallback((images: string | string[], initialIndex: number = 0) => {
    const list = Array.isArray(images) ? images : [images];
    if (list.length === 0) return;
    setLightboxGallery({
      images: list,
      currentIndex: Math.max(0, Math.min(initialIndex, list.length - 1))
    });
  }, []);

  const handleDownloadAttachment = useCallback((att: AttachmentFile) => {
    setConfirmModal({
      isOpen: true,
      title: 'ファイルダウンロード',
      message: `ファイル「${att.name}」のダウンロードを開始します。`,
      type: 'info',
      confirmText: 'OK'
    });
  }, []);

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container || !activeRoom) return;

    const messages = activeRoom.messages || [];
    const msgCount = messages.length;
    
    // 過去ログを遡り読み込み中の場合は最下部への自動スクロールを絶対に実行しない
    if (isPrependingRef.current) {
      prevRoomIdRef.current = activeRoom.id;
      prevMessagesLengthRef.current = msgCount;
      return;
    }

    // スクロール判定用キー (部屋ID、モバイル画面状態、未読メッセージID) - visibleStartIndexは除外
    const scrollKey = `${activeRoom.id}_${mobileView}_${firstUnreadMessageId || 'none'}`;
    const isNewRoomOrView = lastScrolledKeyRef.current !== scrollKey;
    const lengthIncreased = msgCount > prevMessagesLengthRef.current && prevMessagesLengthRef.current > 0;
    
    // 最終メッセージが自分のものであるか確認
    const lastMessage = messages[msgCount - 1];
    const sentByMe = lastMessage && lastMessage.sender.id === currentUser.id;

    if (isNewRoomOrView) {
      lastScrolledKeyRef.current = scrollKey;
      setHasNewMessagesBelow(false);
      setShowScrollToBottom(false);

      const performScroll = () => {
        const c = chatContainerRef.current;
        if (!c) return;

        const unreadEl = document.getElementById('unread-line-divider');
        if (unreadEl) {
          // 未読バーの真上へスクロール
          const containerRect = c.getBoundingClientRect();
          const unreadRect = unreadEl.getBoundingClientRect();
          const targetTop = unreadRect.top - containerRect.top + c.scrollTop;
          c.scrollTop = Math.max(0, targetTop - 12);
        } else {
          // 未読がない場合は既読の最後（最下部）へ即座にスクロール
          c.scrollTop = c.scrollHeight;
        }
        setTimeout(checkScrollBottom, 60);
      };

      // 安定した単一フレーム実行（チラつき・カクツキの防止）
      requestAnimationFrame(performScroll);

      prevRoomIdRef.current = activeRoom.id;
      prevMessagesLengthRef.current = msgCount;
    } else if (lengthIncreased) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 100;
      if (sentByMe) {
        // 自分が送信したメッセージの場合は即座に最下部へスムーズスクロール
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
        setHasNewMessagesBelow(false);
        setShowScrollToBottom(false);
      } else if (isNearBottom) {
        // 相手からのメッセージでも、ユーザーが既に下部にいる場合は自動で追従
        requestAnimationFrame(() => {
          container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
        });
      } else {
        // ユーザーが過去ログを読んでいる最中の場合は強制スクロールせず、新着バッジを表示
        setHasNewMessagesBelow(true);
        setShowScrollToBottom(true);
      }
    }

    prevRoomIdRef.current = activeRoom.id;
    prevMessagesLengthRef.current = msgCount;
  }, [activeRoom?.id, activeRoom?.messages, firstUnreadMessageId, mobileView, currentUser?.id]);

  // グループチャットかどうかを判定する安全な関数（参加者が3人以上、または明示的にgroupである場合）
  const isGroupRoom = (room: ChatRoom) => {
    if (!room) return false;
    return room.type === 'group' || (room.participants && room.participants.length > 2);
  };

  // トークルームの管理者かどうかを判定する関数
  const isUserRoomAdmin = (room: ChatRoom, userId: string) => {
    if (!room || !isGroupRoom(room)) return false;
    const admins = room.adminIds || [];
    if (admins.length === 0) {
      // 古いトークルーム（管理者データがない場合）は、安全のために全員を管理者とする
      return true;
    }
    return admins.includes(userId);
  };

  // トークルーム名・アイコン取得
  const getRoomName = (room: ChatRoom) => {
    if (!room) return 'トークルーム';
    if (isGroupRoom(room)) {
      if (room.name) return room.name;
      const participants = room.participants || [];
      const others = participants.filter((p) => p && p.id !== currentUser.id);
      if (others.length === 0) return 'グループ';
      return others.map((o) => {
        const found = users.find((u) => u.id === o.id);
        return found?.name || o.name || 'メンバー';
      }).join(', ');
    }
    // ダイレクトトーク（DM）の場合: 「D:ユーザー名」形式で表示
    const participants = room.participants || [];
    const others = participants.filter((p) => p && p.id !== currentUser.id);
    if (others.length === 0) {
      return `D:${currentUser.name || '自分'}`;
    }
    const targetName = others
      .map((o) => {
        const found = users.find((u) => u.id === o.id);
        return found?.name || o.name || 'メンバー';
      })
      .join(', ');
    return `D:${targetName}`;
  };

  const getRoomIcon = (room: ChatRoom) => {
    if (!room) return null;
    if (isGroupRoom(room)) {
      return (
        <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
          <Users className="w-5 h-5" />
        </div>
      );
    }
    const participants = room.participants || [];
    const other = participants.find((p) => p && p.id !== currentUser.id) || participants[0];
    const resolvedOther = (other?.id === currentUser.id ? currentUser : undefined) || users.find((u) => u.id === other?.id) || other;
    const effectiveAvatar = (other?.id === currentUser.id ? currentUser.avatarUrl : resolvedOther?.avatarUrl) || other?.avatarUrl;
    const effectiveName = (other?.id === currentUser.id ? currentUser.name : resolvedOther?.name) || other?.name || '';
    return (
      <img
        src={getAvatarUrl(effectiveAvatar)}
        alt={effectiveName}
        onError={handleAvatarError}
        className="w-10 h-10 rounded-full border border-slate-200 object-cover shrink-0"
      />
    );
  };

  // メッセージ送信（テキスト・ファイル）
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const isTextEmpty = !messageText || !messageText.trim();
    if (isTextEmpty && chatAttachments.length === 0) return;

    const newMessage: ChatMessage = {
      id: `m_${Date.now()}`,
      sender: currentUser,
      content: isTextEmpty ? 'ファイルを送信しました' : (messageText || '').trim(),
      createdAt: new Date().toISOString(),
      type: chatAttachments.length > 0 ? 'file' : 'text',
      attachments: chatAttachments
    };

    updateRoomMessages(activeRoom.id, newMessage);
    logActivity('chat_message', `トーク「${getRoomName(activeRoom)}」でメッセージを送信しました`, currentUser);
    setMessageText('');
    setChatAttachments([]);
    if (chatTextareaRef.current) {
      chatTextareaRef.current.style.height = 'auto';
    }
  };

  // キーボード操作：Shift+Enterで改行、Enter単体で送信（日本語IME確定時は送信しない）
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // 日本語変換（IME確定）の Enter では送信しない
      if (isComposing || e.nativeEvent.isComposing) {
        return;
      }
      if (e.shiftKey) {
        // Shift + Enter: 改行を挿入（ブラウザ既定動作）
        return;
      }
      // Enter 単体: メッセージ送信
      e.preventDefault();
      handleSendMessage();
    }
  };

  // チャット用添付ファイル非同期アップロード
  const processChatUploadedFiles = async (files: FileList | File[]) => {
    if (files && files.length > 0) {
      setIsChatUploading(true);
      try {
        const uploaded = await uploadMultipleFiles(files);
        setChatAttachments(prev => [...prev, ...uploaded]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsChatUploading(false);
        if (chatFileInputRef.current) {
          chatFileInputRef.current.value = '';
        }
      }
    }
  };

  const handleChatFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processChatUploadedFiles(e.target.files);
    }
  };

  const handleChatDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsChatDraggingOver(true);
  };

  const handleChatDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsChatDraggingOver(false);
  };

  // 写真選択またはドラッグ＆ドロップ時の共通振り分け処理 (最大10枚対応)
  const handlePhotoFilesSelected = (files: File[]) => {
    const imageFiles = files.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
    if (imageFiles.length === 0) return;

    // 枚数制限: 最大10枚
    let targetFiles = imageFiles;
    if (imageFiles.length > 10) {
      targetFiles = imageFiles.slice(0, 10);
      setAlbumNotice('一度に送信できる写真は最大10枚です（先頭の10枚を選択しました）');
    } else {
      setAlbumNotice(null);
    }

    if (targetFiles.length === 1) {
      // 1枚のみの場合: 既存の単体写真プレビュー（キャプション付き）
      const singleFile = targetFiles[0];
      handleProcessSinglePhoto(singleFile);
    } else {
      // 複数枚（2〜10枚）の場合: 写真アルバムプレビューモーダル
      pendingAlbumPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl));
      const albumItems = targetFiles.map((file, i) => ({
        id: `album_item_${Date.now()}_${i}`,
        file,
        previewUrl: URL.createObjectURL(file)
      }));
      setPendingAlbumPhotos(albumItems);
      setAlbumCaption('');
    }
  };

  // 単体写真の2段階サムネイル生成＆アップロード
  const handleProcessSinglePhoto = async (file: File) => {
    setIsChatUploading(true);
    try {
      const { thumbnailFile, highResFile } = await createImageVariants(file);
      const [uploadedThumb, uploadedHighRes] = await Promise.all([
        uploadFile(thumbnailFile),
        thumbnailFile !== highResFile ? uploadFile(highResFile) : Promise.resolve(null)
      ]);
      const thumbUrl = uploadedThumb.url;
      const fullUrl = uploadedHighRes ? uploadedHighRes.url : thumbUrl;

      setPendingPhotoUrl(fullUrl);
      setPendingThumbnailUrl(thumbUrl);
      setPhotoCaption('');
    } catch (err) {
      console.error(err);
      const localUrl = URL.createObjectURL(file);
      setPendingPhotoUrl(localUrl);
      setPendingThumbnailUrl(localUrl);
    } finally {
      setIsChatUploading(false);
    }
  };

  // 複数写真アルバムの送信（最大10枚・並列リサイズ＆アップロード）
  const handleSendAlbum = async () => {
    if (!activeRoom || pendingAlbumPhotos.length === 0) return;
    setIsAlbumUploading(true);
    try {
      const uploadResults = await Promise.all(
        pendingAlbumPhotos.map(async (item) => {
          const { thumbnailFile, highResFile } = await createImageVariants(item.file);
          const [uploadedThumb, uploadedHighRes] = await Promise.all([
            uploadFile(thumbnailFile),
            thumbnailFile !== highResFile ? uploadFile(highResFile) : Promise.resolve(null)
          ]);
          const thumbUrl = uploadedThumb.url;
          const fullUrl = uploadedHighRes ? uploadedHighRes.url : thumbUrl;
          return {
            url: fullUrl,
            thumbnailUrl: thumbUrl
          };
        })
      );

      const firstPhoto = uploadResults[0];
      const newMessage: ChatMessage = {
        id: `album_${Date.now()}`,
        sender: currentUser,
        content: albumCaption || '写真を送信しました',
        createdAt: new Date().toISOString(),
        type: 'image',
        imageUrl: firstPhoto.url,
        thumbnailUrl: firstPhoto.thumbnailUrl,
        images: uploadResults
      };

      updateRoomMessages(activeRoom.id, newMessage);
      logActivity('chat_message', `トーク「${getRoomName(activeRoom)}」で写真アルバム（${uploadResults.length}枚）を送信しました`, currentUser);

      pendingAlbumPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl));
      setPendingAlbumPhotos([]);
      setAlbumCaption('');
      setAlbumNotice(null);
    } catch (err) {
      console.error(err);
      alert('写真アルバムの送信に失敗しました。');
    } finally {
      setIsAlbumUploading(false);
    }
  };

  const handleCancelAlbum = () => {
    pendingAlbumPhotos.forEach(p => URL.revokeObjectURL(p.previewUrl));
    setPendingAlbumPhotos([]);
    setAlbumCaption('');
    setAlbumNotice(null);
  };

  const handleRemoveAlbumPhoto = (id: string) => {
    setPendingAlbumPhotos(prev => {
      const removed = prev.find(p => p.id === id);
      if (removed) {
        URL.revokeObjectURL(removed.previewUrl);
      }
      const updated = prev.filter(p => p.id !== id);
      if (updated.length <= 10) {
        setAlbumNotice(null);
      }
      return updated;
    });
  };

  // クリップボードからの画像・ファイル貼り付け処理
  const handleChatClipboardPaste = useCallback(async (clipboardData: DataTransfer | null, e?: React.ClipboardEvent | ClipboardEvent) => {
    if (!clipboardData) return false;

    const items = clipboardData.items;
    const files: File[] = [];

    if (items && items.length > 0) {
      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        if (item.kind === 'file') {
          const file = item.getAsFile();
          if (file) {
            // クリップボードからの画像（スクリーンショット等）で名前が空またはimage.pngの場合、タイムスタンプ付きの名前に正規化
            if (file.type.startsWith('image/') && (!file.name || file.name === 'image.png')) {
              const ext = file.type.split('/')[1] || 'png';
              const timeStr = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
              const namedFile = new File([file], `screenshot_${timeStr}.${ext}`, { type: file.type });
              files.push(namedFile);
            } else {
              files.push(file);
            }
          }
        }
      }
    } else if (clipboardData.files && clipboardData.files.length > 0) {
      for (let i = 0; i < clipboardData.files.length; i++) {
        files.push(clipboardData.files[i]);
      }
    }

    if (files.length === 0) return false;

    const imageFiles = files.filter(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(f.name));
    const otherFiles = files.filter(f => !imageFiles.includes(f));

    if (e && typeof e.preventDefault === 'function') {
      e.preventDefault();
    }

    if (imageFiles.length > 0) {
      if (messageText.trim()) {
        setPhotoCaption(messageText.trim());
        setMessageText('');
      }
      handlePhotoFilesSelected(imageFiles);
      if (otherFiles.length > 0) {
        await processChatUploadedFiles(otherFiles);
      }
      return true;
    }

    if (otherFiles.length > 0) {
      await processChatUploadedFiles(otherFiles);
      return true;
    }

    return false;
  }, [messageText, handlePhotoFilesSelected, processChatUploadedFiles]);

  const handleChatTextareaPaste = async (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const handled = await handleChatClipboardPaste(e.clipboardData, e);
    if (!handled) {
      chatPasteHandler.handlePaste(e);
    }
  };

  // チャット画面表示中のグローバル画像貼り付け (Ctrl+V / Cmd+V)
  useEffect(() => {
    const handleGlobalPaste = (e: ClipboardEvent) => {
      if (!activeRoom) return;
      // 他のモーダルやインプット（トークルーム名変更、検索バー等）にフォーカスがある場合はスキップ
      const activeEl = document.activeElement;
      if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA') && activeEl !== chatTextareaRef.current) {
        return;
      }
      if (e.clipboardData) {
        handleChatClipboardPaste(e.clipboardData, e);
      }
    };

    window.addEventListener('paste', handleGlobalPaste);
    return () => window.removeEventListener('paste', handleGlobalPaste);
  }, [activeRoom, handleChatClipboardPaste]);

  const handleChatDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsChatDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const files = Array.from(e.dataTransfer.files);
      const isAllImages = files.every(f => f.type.startsWith('image/') || /\.(jpe?g|png|webp|gif)$/i.test(f.name));
      if (isAllImages) {
        handlePhotoFilesSelected(files);
      } else {
        await processChatUploadedFiles(files);
      }
    }
  };

  // スタンプ送信
  const handleSendStamp = (stamp: ChatStampItem, categoryName: string) => {
    if (!activeRoom) return;

    const newMessage: ChatMessage = {
      id: `stamp_${Date.now()}`,
      sender: currentUser,
      content: stamp.text,
      createdAt: new Date().toISOString(),
      type: 'stamp',
      stampId: stamp.id,
      stampText: stamp.text,
      stampCategory: categoryName,
      imageUrl: stamp.imageUrl
    };

    updateRoomMessages(activeRoom.id, newMessage);
    logActivity('chat_message', `トーク「${getRoomName(activeRoom)}」でスタンプ「${stamp.text}」を送信しました`, currentUser);
    setShowStampPicker(false);
  };

  // 写真送信（2段階サムネイル方式: 高精細原本URL + 超軽量サムネイルURL）
  const handleSendPhoto = (imageUrl: string, caption?: string, thumbnailUrl?: string) => {
    if (!activeRoom) return;

    const newMessage: ChatMessage = {
      id: `img_${Date.now()}`,
      sender: currentUser,
      content: caption || '写真を送信しました',
      createdAt: new Date().toISOString(),
      type: 'image',
      imageUrl,
      thumbnailUrl: thumbnailUrl || imageUrl
    };

    updateRoomMessages(activeRoom.id, newMessage);
    logActivity('chat_message', `トーク「${getRoomName(activeRoom)}」で写真を送信しました`, currentUser);
    setPendingPhotoUrl(null);
    setPendingThumbnailUrl(null);
    setPhotoCaption('');
  };

  // 写真ファイル選択ボタン（1枚または複数枚・最大10枚対応）
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      handlePhotoFilesSelected(Array.from(e.target.files));
    }
    e.target.value = '';
  };

  // ルーム内のメッセージ更新
  const updateRoomMessages = (roomId: string, message: ChatMessage) => {
    const updated = rooms.map((r) => {
      if (r.id === roomId) {
        return {
          ...r,
          messages: [...(r.messages || []), message],
          lastUpdated: new Date().toISOString()
        };
      }
      return r;
    });

    if (onUpdateRooms) {
      onUpdateRooms(updated);
    }

    // 他の参加者にプッシュ通知を配信
    const targetRoom = rooms.find(r => r.id === roomId);
    if (targetRoom) {
      const otherParticipantIds = (targetRoom.participants || [])
        .map(p => p.id)
        .filter(id => id && id !== currentUser.id);

      if (otherParticipantIds.length > 0) {
        const roomName = getRoomName(targetRoom);
        const previewContent = message.type === 'image' 
          ? '📷 写真が送信されました' 
          : (message.type === 'stamp' ? `[スタンプ] ${message.content}` : (message.content || ''));

        triggerPushNotification({
          targetUserIds: otherParticipantIds,
          excludeUserId: currentUser.id,
          title: `💬 ${currentUser.name} (${roomName})`,
          body: previewContent.slice(0, 60),
          url: `/?tab=chat&chatRoomId=${roomId}`,
          tag: `chat-${roomId}`,
          renotify: false,
          requireInteraction: false
        });
      }
    }
  };

  // 新規チャットルーム作成
  const handleCreateRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (selectedUserIds.length === 0) return;

    const selectedUsers = users.filter((u) => selectedUserIds.includes(u.id));
    const allParticipants = Array.from(new Set([currentUser, ...selectedUsers]));

    // DMの場合、既存のDMがあればそれをアクティブに
    if (newRoomType === 'dm' && selectedUsers.length === 1) {
      const existingDm = rooms.find(
        (r) =>
          r.type === 'dm' &&
          (r.participants || []).some((p) => p.id === selectedUsers[0].id) &&
          (r.participants || []).some((p) => p.id === currentUser.id)
      );
      if (existingDm) {
        setActiveRoomId(existingDm.id);
        setShowCreateModal(false);
        resetCreateForm();
        return;
      }
    }

    const newRoom: ChatRoom = {
      id: `c_${Date.now()}`,
      name: newRoomType === 'group' ? ((newRoomName || '').trim() || '新規グループトーク') : undefined,
      type: newRoomType,
      participants: allParticipants,
      adminIds: newRoomType === 'group' ? [currentUser.id] : [],
      messages: [
        {
          id: `m_init_${Date.now()}`,
          sender: currentUser,
          content: `${currentUser.name}さんがトークルームを作成しました。`,
          createdAt: new Date().toISOString(),
          type: 'text'
        }
      ],
      lastUpdated: new Date().toISOString()
    };

    const nextRooms = [newRoom, ...rooms];
    if (onUpdateRooms) {
      onUpdateRooms(nextRooms);
    }
    setActiveRoomId(newRoom.id);
    setShowCreateModal(false);
    resetCreateForm();
  };

  // メンバー追加
  const handleAddMembers = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || selectedUserIds.length === 0) return;

    const addedUsers = users.filter((u) => selectedUserIds.includes(u.id));
    const activeParticipants = activeRoom.participants || [];
    const existingIds = new Set(activeParticipants.map((p) => p.id));
    const newParticipants = [...activeParticipants];

    addedUsers.forEach((u) => {
      if (!existingIds.has(u.id)) {
        newParticipants.push(u);
      }
    });

    const systemMsg: ChatMessage = {
      id: `sys_${Date.now()}`,
      sender: currentUser,
      content: `${addedUsers.map((u) => u.name).join('さん、')}さんがグループに参加しました。`,
      createdAt: new Date().toISOString(),
      type: 'text'
    };

    const updated = rooms.map((r) => {
      if (r.id === activeRoom.id) {
        return {
          ...r,
          participants: newParticipants,
          messages: [...(r.messages || []), systemMsg],
          lastUpdated: new Date().toISOString()
        };
      }
      return r;
    });

    if (onUpdateRooms) {
      onUpdateRooms(updated);
    }
    setShowAddMemberModal(false);
    setSelectedUserIds([]);
  };

  // メンバー削除
  const handleRemoveMember = (memberId: string) => {
    if (!activeRoom) return;

    const memberToRemove = activeRoom.participants.find(p => p.id === memberId);
    if (!memberToRemove) return;

    // 自分自身をグループから退出させる、または他メンバーを削除する
    const isSelf = memberId === currentUser.id;
    const confirmMsg = isSelf 
      ? 'このグループチャットから退室しますか？' 
      : `${memberToRemove.name}さんをこのグループから削除しますか？`;

    setConfirmModal({
      isOpen: true,
      title: isSelf ? 'グループの退室' : 'メンバーの削除',
      message: confirmMsg,
      type: 'danger',
      confirmText: '実行',
      cancelText: 'キャンセル',
      onConfirm: () => {
        const newParticipants = (activeRoom.participants || []).filter((p) => p.id !== memberId);

        const systemMsg: ChatMessage = {
          id: `sys_${Date.now()}`,
          sender: currentUser,
          content: isSelf 
            ? `${currentUser.name}さんがグループを退室しました。` 
            : `${memberToRemove.name}さんがグループから削除されました。`,
          createdAt: new Date().toISOString(),
          type: 'text'
        };

        const updated = rooms.map((r) => {
          if (r.id === activeRoom.id) {
            return {
              ...r,
              participants: newParticipants,
              messages: [...(r.messages || []), systemMsg],
              lastUpdated: new Date().toISOString()
            };
          }
          return r;
        });

        if (onUpdateRooms) {
          onUpdateRooms(updated);
        }
        
        if (isSelf) {
          // 自分が退室した場合、アクティブな部屋を切り替える
          const remainingRooms = rooms.filter(r => r.id !== activeRoom.id);
          if (remainingRooms.length > 0) {
            setActiveRoomId(remainingRooms[0].id);
          } else {
            setActiveRoomId('');
          }
          setShowInfoSidebar(false);
        }
      }
    });
  };

  // チャットルーム名の変更
  const handleRenameRoom = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeRoom || !roomRenameText.trim()) return;

    const oldName = getRoomName(activeRoom);
    const newName = roomRenameText.trim();
    if (oldName === newName) {
      setIsRenamingRoom(false);
      return;
    }

    const systemMsg: ChatMessage = {
      id: `sys_${Date.now()}`,
      sender: currentUser,
      content: `グループ名が「${oldName}」から「${newName}」に変更されました。`,
      createdAt: new Date().toISOString(),
      type: 'text'
    };

    const updated = rooms.map((r) => {
      if (r.id === activeRoom.id) {
        return {
          ...r,
          name: newName,
          messages: [...(r.messages || []), systemMsg],
          lastUpdated: new Date().toISOString()
        };
      }
      return r;
    });

    if (onUpdateRooms) {
      onUpdateRooms(updated);
    }
    setIsRenamingRoom(false);
  };

  // 管理者権限の付与・剥奪
  const handleToggleAdmin = (userId: string) => {
    if (!activeRoom) return;
    
    const isAdmin = (activeRoom.adminIds || []).includes(userId);
    const targetUser = activeRoom.participants.find(p => p.id === userId);
    if (!targetUser) return;

    let newAdminIds = [...(activeRoom.adminIds || [])];
    if (isAdmin) {
      // 管理者が自分自身かつ唯一の管理者である場合は解除できない
      const activeAdminsInRoom = newAdminIds.filter(id => activeRoom.participants.some(p => p.id === id));
      if (userId === currentUser.id && activeAdminsInRoom.length <= 1) {
        setConfirmModal({
          isOpen: true,
          title: '権限の変更不可',
          message: '管理者は最低1名必要です。他の管理者を設定したあとに権限を解除してください。',
          type: 'info',
          confirmText: 'OK',
          onConfirm: () => {}
        });
        return;
      }
      newAdminIds = newAdminIds.filter(id => id !== userId);
    } else {
      newAdminIds.push(userId);
    }

    const systemMsg: ChatMessage = {
      id: `sys_${Date.now()}`,
      sender: currentUser,
      content: isAdmin 
        ? `${targetUser.name}さんの管理者権限が解除されました。` 
        : `${targetUser.name}さんが管理者に設定されました。`,
      createdAt: new Date().toISOString(),
      type: 'text'
    };

    const updated = rooms.map((r) => {
      if (r.id === activeRoom.id) {
        return {
          ...r,
          adminIds: newAdminIds,
          messages: [...(r.messages || []), systemMsg],
          lastUpdated: new Date().toISOString()
        };
      }
      return r;
    });

    if (onUpdateRooms) {
      onUpdateRooms(updated);
    }
  };

  const resetCreateForm = () => {
    setNewRoomType('group');
    setNewRoomName('');
    setSelectedUserIds([]);
    setModalSearch('');
    setModalOffice('all');
    setModalDivision('all');
  };

  // メンバーリストの絞り込み
  const candidateUsers = users.filter((u) => {
    if (u.id === currentUser.id) return false;
    const matchSearch =
      u.name.toLowerCase().includes(modalSearch.toLowerCase()) ||
      (u.division && u.division.toLowerCase().includes(modalSearch.toLowerCase())) ||
      (u.office && u.office.toLowerCase().includes(modalSearch.toLowerCase()));
    const matchOffice = modalOffice === 'all' || u.office === modalOffice;
    const matchDivision = modalDivision === 'all' || u.division === modalDivision;
    return matchSearch && matchOffice && matchDivision;
  });

  // フィルタリング後のルーム一覧
  const filteredRooms = myRooms
    .filter((r) => {
      if (roomFilter === 'group') return isGroupRoom(r);
      if (roomFilter === 'dm') return !isGroupRoom(r);
      return true;
    })
    .filter((r) => {
      if (!searchQuery || !searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const rName = getRoomName(r).toLowerCase();
      const hasMember = r.participants.some((p) => p.name.toLowerCase().includes(q));
      return rName.includes(q) || hasMember;
    });

  return (
    <div className="flex-1 bg-white rounded-none sm:rounded-xl border-0 sm:border border-slate-200 shadow-none sm:shadow-sm overflow-hidden flex h-full sm:h-[calc(100vh-8.5rem)] relative w-full">
      {/* 隠しファイルインプット */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        multiple
        className="hidden"
      />

      {/* ----------------- 左サイドバー (トークルーム一覧) ----------------- */}
      <div className={`w-full md:w-80 border-r border-slate-200 bg-slate-50/50 flex flex-col shrink-0 transition-all duration-200 ${
        isSidebarCollapsed
          ? (mobileView === 'room' ? 'hidden' : 'flex md:hidden')
          : (mobileView === 'room' ? 'hidden md:flex' : 'flex')
      }`}>
        {/* ヘッダー＆新規ルーム作成ボタン */}
        <div className="p-3 sm:p-3.5 border-b border-slate-200 bg-white space-y-2.5 sm:space-y-3">
          <div className="flex items-center justify-between gap-1">
            <h2 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-2 min-w-0">
              <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-600 shrink-0" />
              <span className="truncate">チャットトーク</span>
            </h2>
            <div className="flex items-center gap-1 shrink-0">
              <button
                onClick={() => {
                  resetCreateForm();
                  setShowCreateModal(true);
                }}
                className="px-2.5 sm:px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1 sm:gap-1.5"
              >
                <Plus className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ルーム作成</span>
                <span className="sm:hidden">作成</span>
              </button>
              <button
                onClick={toggleSidebar}
                className="hidden md:flex p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="ルーム一覧を左に隠す（会話画面を広くする）"
              >
                <PanelLeftClose className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 検索バー */}
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="ルームやメンバーを検索..."
              className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all"
            />
          </div>

          {/* フィルタータブ */}
          <div className="flex bg-slate-100 p-0.5 rounded-lg text-xs font-semibold">
            <button
              onClick={() => setRoomFilter('all')}
              className={`flex-1 py-1 rounded-md transition-all ${
                roomFilter === 'all' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              すべて
            </button>
            <button
              onClick={() => setRoomFilter('group')}
              className={`flex-1 py-1 rounded-md transition-all ${
                roomFilter === 'group' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              グループ
            </button>
            <button
              onClick={() => setRoomFilter('dm')}
              className={`flex-1 py-1 rounded-md transition-all ${
                roomFilter === 'dm' ? 'bg-white text-indigo-600 shadow-xs font-bold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              1対1
            </button>
          </div>
        </div>

        {/* ルームリスト */}
        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {filteredRooms.length > 0 ? (
            filteredRooms.map((room) => {
              const lastMsg = room.messages && room.messages.length > 0 ? room.messages[room.messages.length - 1] : undefined;
              const isActive = activeRoomId === room.id;
              const roomUnreadCount = isActive ? 0 : getChatRoomUnreadCount(room, currentUser, readChatTimestamps);

              return (
                <div key={room.id} className="relative group">
                  <button
                    onClick={() => {
                      setActiveRoomId(room.id);
                      setMobileView('room');
                    }}
                    className={`w-full flex items-center gap-3 p-3 text-left transition-colors relative ${
                      isActive ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="relative shrink-0">
                      {getRoomIcon(room)}
                      {roomUnreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-rose-500 rounded-full ring-2 ring-white animate-pulse" />
                      )}
                    </div>

                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className={`text-xs font-bold truncate ${isActive ? 'text-indigo-950' : roomUnreadCount > 0 ? 'text-slate-900 font-extrabold' : 'text-slate-800'}`}>
                          {getRoomName(room)}
                        </h4>
                        <div className="flex items-center gap-1.5 shrink-0 ml-1">
                          {roomUnreadCount > 0 && (
                            <span className="px-1.5 py-0.2 text-[10px] font-black text-white bg-rose-500 rounded-full shadow-2xs min-w-[18px] text-center">
                              {roomUnreadCount > 99 ? '99+' : roomUnreadCount}
                            </span>
                          )}
                          {lastMsg && (
                            <span className="text-[10px] font-medium text-slate-400">
                              {formatChatTimestamp(lastMsg.createdAt, true)}
                            </span>
                          )}
                        </div>
                      </div>

                      <p className="text-xs text-slate-500 truncate">
                        {lastMsg ? (
                          lastMsg.type === 'stamp' ? (
                            <span className="text-emerald-600 font-semibold flex items-center gap-1">
                              😊 [スタンプ] {lastMsg.stampText}
                            </span>
                          ) : lastMsg.type === 'image' ? (
                            <span className="text-blue-600 font-semibold flex items-center gap-1">
                              📷 [写真] {lastMsg.content !== '写真を送信しました' ? lastMsg.content : ''}
                            </span>
                          ) : (
                            `${lastMsg.sender.id === currentUser.id ? '自分: ' : ''}${lastMsg.content}`
                          )
                        ) : (
                          'メッセージはありません'
                        )}
                      </p>
                    </div>
                  </button>
                  {(!isGroupRoom(room) || isUserRoomAdmin(room, currentUser.id)) && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteRoomClick(room.id);
                      }}
                      className="absolute right-3 top-1/2 -translate-y-1/2 p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md opacity-80 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity"
                      title="チャットルームを削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              );
            })
          ) : (
            <div className="p-8 text-center text-slate-400 text-xs">
              条件に一致するトークルームが見つかりません
            </div>
          )}
        </div>
      </div>

      {/* ----------------- メイン (LINE風トーク画面) ----------------- */}
      {activeRoom ? (
        <div className={`flex-1 flex flex-col bg-slate-100/70 relative min-w-0 ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}>
          {/* トークルームヘッダー */}
          <div className="px-3 sm:px-5 py-2.5 sm:py-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-2xs z-10 shrink-0 gap-2">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setMobileView('list')}
                className="md:hidden p-1.5 -ml-1 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors shrink-0"
                title="トーク一覧に戻る"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>

              {/* デスクトップ用：ルーム一覧サイドバートグルボタン */}
              <button
                type="button"
                onClick={toggleSidebar}
                className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 -ml-1 rounded-lg text-xs font-bold transition-all shrink-0 cursor-pointer ${
                  isSidebarCollapsed
                    ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 shadow-2xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-100'
                }`}
                title={isSidebarCollapsed ? 'ルーム一覧を表示' : 'ルーム一覧を左に隠す（会話画面を広げる）'}
              >
                {isSidebarCollapsed ? (
                  <>
                    <PanelLeftOpen className="w-4 h-4 text-indigo-600" />
                    <span>ルーム一覧を表示</span>
                  </>
                ) : (
                  <>
                    <PanelLeftClose className="w-4 h-4" />
                    <span className="hidden lg:inline text-[11px] text-slate-400 font-normal">サイドバー非表示</span>
                  </>
                )}
              </button>
              <div className="shrink-0">
                {getRoomIcon(activeRoom)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 sm:gap-2">
                  {isRenamingRoom ? (
                    <form onSubmit={handleRenameRoom} className="flex items-center gap-1 sm:gap-2 min-w-0">
                      <input
                        type="text"
                        value={roomRenameText}
                        onChange={(e) => setRoomRenameText(e.target.value)}
                        className="px-2 py-1 bg-slate-50 border border-slate-300 rounded text-xs font-semibold focus:ring-1 focus:ring-indigo-500 focus:outline-none min-w-0 w-28 sm:w-48"
                        autoFocus
                      />
                      <button type="submit" className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 shrink-0">保存</button>
                      <button type="button" onClick={() => setIsRenamingRoom(false)} className="text-xs font-semibold text-slate-500 hover:text-slate-700 shrink-0">取消</button>
                    </form>
                  ) : (
                    <div className="flex items-center gap-1.5 min-w-0">
                      <h2 className="text-xs sm:text-sm font-bold text-slate-900 truncate">{getRoomName(activeRoom)}</h2>
                      {isGroupRoom(activeRoom) && (
                        <>
                          {isUserRoomAdmin(activeRoom, currentUser.id) && (
                            <button
                              onClick={() => {
                                setRoomRenameText(getRoomName(activeRoom));
                                setIsRenamingRoom(true);
                              }}
                              className="p-1 text-slate-400 hover:text-indigo-600 rounded hover:bg-slate-50 transition-colors shrink-0"
                              title="グループ名を変更"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <span className="hidden xs:inline-block px-1.5 sm:px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded-full border border-indigo-200/60 shrink-0">
                            グループ
                          </span>
                        </>
                      )}
                    </div>
                  )}
                </div>
                <p className="text-[11px] sm:text-xs text-slate-500 flex items-center gap-1 mt-0.5 truncate">
                  <Users className="w-3 h-3 text-slate-400 shrink-0" />
                  <span className="shrink-0">{activeRoom.participants.length}名:</span>
                  <span className="truncate text-slate-600">
                    {activeRoom.participants.map((p) => p.name).join(', ')}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
              {/* 共有リンクコピーボタン */}
              <button
                type="button"
                onClick={handleShareRoom}
                className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-2xs select-none cursor-pointer ${
                  copiedLink
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:text-indigo-600'
                }`}
                title="このチャットルームの参加・共有リンク（URL）をコピー"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span className="text-[11px] font-bold hidden xs:inline">URLコピー完了!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="text-[11px] font-bold hidden xs:inline">共有</span>
                  </>
                )}
              </button>

              {/* 立体的なメガネ切り替えボタン */}
              <button
                type="button"
                onClick={toggleBossMode}
                className={`p-2 rounded-lg transition-all duration-150 select-none cursor-pointer border ${
                  isBossMode
                    ? 'bg-slate-300 text-slate-900 border-slate-400 shadow-[inset_0_2px_4px_rgba(0,0,0,0.22)] translate-y-0.5'
                    : 'bg-gradient-to-b from-white via-slate-50 to-slate-200 text-slate-600 hover:text-slate-900 border-slate-300 shadow-[0_2px_3px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.9)] hover:brightness-105 active:translate-y-0.5 active:shadow-[inset_0_2px_3px_rgba(0,0,0,0.2)]'
                }`}
                title="業務モード切り替え [Shift+Esc]"
              >
                <Glasses className={`w-4 h-4 ${isBossMode ? 'text-slate-900' : 'text-slate-600'}`} />
              </button>

              <button
                onClick={() => setShowInfoSidebar(!showInfoSidebar)}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors cursor-pointer ${
                  showInfoSidebar ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                }`}
                title="ルーム詳細"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            onDragOver={handleChatDragOver}
            onDragLeave={handleChatDragLeave}
            onDrop={handleChatDrop}
            className="flex-1 flex overflow-hidden relative"
          >
            {isChatDraggingOver && (
              <div className="absolute inset-0 bg-indigo-600/90 backdrop-blur-xs z-50 flex flex-col items-center justify-center gap-3 text-white pointer-events-none animate-in fade-in duration-150 p-6 text-center">
                <UploadCloud className="w-12 h-12 animate-bounce text-white" />
                <p className="text-lg font-extrabold tracking-wide">ここにファイルをドロップしてチャットに添付</p>
                <p className="text-xs text-indigo-100">画像・PDF・各種ドキュメントを即座に送信準備します</p>
              </div>
            )}

            {/* メッセージ本文エリア (LINEスタイルトーク画面) */}
            <div 
              ref={chatContainerRef} 
              onScroll={handleTimelineScroll}
              className="flex-1 overflow-y-auto p-3 sm:p-6 space-y-3 sm:space-y-4 bg-[#e2e8f0]/40"
            >
              {/* 過去ログ読み込みインジケーター */}
              {visibleStartIndex > 0 && (
                <div className="flex justify-center py-2 select-none">
                  {isLoadingMorePrevious ? (
                    <div className="flex items-center gap-2 px-3.5 py-1.5 bg-white/90 backdrop-blur-xs rounded-full shadow-2xs text-xs font-semibold text-indigo-600 border border-indigo-100 animate-in fade-in duration-150">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                      <span>過去のメッセージを読み込み中...</span>
                    </div>
                  ) : (
                    <button
                      onClick={loadMorePreviousMessages}
                      className="text-[11px] text-slate-500 hover:text-indigo-600 bg-white/60 hover:bg-white/90 px-3 py-1 rounded-full border border-slate-200/80 transition-colors font-medium shadow-2xs cursor-pointer"
                    >
                      ↑ 過去のメッセージをさらに表示（残り {visibleStartIndex} 件）
                    </button>
                  )}
                </div>
              )}

              {(() => {
                const allMsgs = activeRoom?.messages || [];
                const displayedMsgs = allMsgs.slice(visibleStartIndex);

                return displayedMsgs.map((msg, index) => {
                  const globalIndex = visibleStartIndex + index;
                  const isMine = msg.sender.id === currentUser.id;
                  const isSystem = msg.id.startsWith('sys_') || msg.id.startsWith('m_init_');
                  const isFirstUnread = Boolean(firstUnreadMessageId && msg.id === firstUnreadMessageId);
                  const prevMsg = globalIndex > 0 ? allMsgs[globalIndex - 1] : undefined;
                  const isDifferentDate = Boolean(
                    msg.createdAt && (!prevMsg || !prevMsg.createdAt || new Date(msg.createdAt).toDateString() !== new Date(prevMsg.createdAt).toDateString())
                  );
                  const isNewSenderGroup = !prevMsg || prevMsg.sender.id !== msg.sender.id || prevMsg.id.startsWith('sys_') || isDifferentDate;
                  const showSenderName = !isMine && isNewSenderGroup;
                  const showAvatar = isNewSenderGroup;

                  return (
                    <ChatMessageItem
                      key={msg.id}
                      msg={msg}
                      currentUser={currentUser}
                      users={users}
                      activeRoom={activeRoom}
                      isMine={isMine}
                      isSystem={isSystem}
                      isFirstUnread={isFirstUnread}
                      isDifferentDate={isDifferentDate}
                      showSenderName={showSenderName}
                      showAvatar={showAvatar}
                      stampCategories={stampCategories}
                      isBossMode={isBossMode}
                      onDeleteMessage={handleDeleteMessageClick}
                      onOpenViewers={handleOpenViewersModal}
                      onOpenPreview={handleOpenPreviewFile}
                      onOpenLightbox={handleOpenLightboxImage}
                      onDownloadAttachment={handleDownloadAttachment}
                    />
                  );
                });
              })()}
              <div ref={messagesEndRef} />
            </div>

            {/* 最新・新着メッセージへ移動するフローティングボタン */}
            {(showScrollToBottom || hasNewMessagesBelow) && (
              <div className="absolute bottom-3 sm:bottom-4 left-1/2 -translate-x-1/2 z-20 pointer-events-none animate-in fade-in slide-in-from-bottom-2 duration-150">
                {hasNewMessagesBelow ? (
                  <button
                    type="button"
                    onClick={scrollToBottomSmooth}
                    className="pointer-events-auto flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-full shadow-lg hover:shadow-xl transition-all active:scale-95 cursor-pointer border border-indigo-500/80 animate-pulse"
                  >
                    <ArrowDown className="w-3.5 h-3.5 animate-bounce" />
                    <span>新着メッセージがあります ↓</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={scrollToBottomSmooth}
                    className="pointer-events-auto flex items-center gap-1.5 px-3.5 py-1.5 bg-white/95 hover:bg-white text-slate-700 hover:text-indigo-600 text-xs font-bold rounded-full shadow-md hover:shadow-lg transition-all active:scale-95 cursor-pointer border border-slate-200/90 backdrop-blur-xs group"
                  >
                    <ArrowDown className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600 group-hover:translate-y-0.5 transition-transform" />
                    <span>最新メッセージへ ↓</span>
                  </button>
                )}
              </div>
            )}

            {/* ----------------- 右サイドバー (ルーム情報) ----------------- */}
            {showInfoSidebar && (
              <>
                {/* モバイル用背景オーバーレイ */}
                <div
                  className="md:hidden fixed inset-0 bg-slate-900/40 z-30 backdrop-blur-xs"
                  onClick={() => setShowInfoSidebar(false)}
                />
                <div className="fixed md:static inset-y-0 right-0 z-40 md:z-auto w-72 sm:w-80 md:w-64 border-l border-slate-200 bg-white p-4 overflow-y-auto shrink-0 space-y-5 shadow-2xl md:shadow-none animate-in slide-in-from-right-10 md:animate-none duration-200">
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                    <h3 className="text-xs font-bold text-slate-900">トーク詳細</h3>
                    <button onClick={() => setShowInfoSidebar(false)} className="text-slate-400 hover:text-slate-600 p-1">
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div>
                    <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                      参加メンバー ({activeRoom.participants.length})
                    </h4>
                    <div className="space-y-2">
                      {activeRoom.participants.map((member) => {
                        const memberUser = (member.id === currentUser.id ? currentUser : undefined) || users.find((u) => u.id === member.id) || member;
                        const memberAvatar = (member.id === currentUser.id ? currentUser.avatarUrl : memberUser?.avatarUrl) || member.avatarUrl;
                        const memberName = (member.id === currentUser.id ? currentUser.name : memberUser?.name) || member.name;
                        const memberOffice = (member.id === currentUser.id ? currentUser.office : memberUser?.office) || member.office;
                        const memberDivision = (member.id === currentUser.id ? currentUser.division : memberUser?.division) || member.division;

                        return (
                          <div key={member.id} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-50 group/member">
                            <img
                              src={getAvatarUrl(memberAvatar)}
                              alt={memberName}
                              onError={handleAvatarError}
                              className="w-8 h-8 rounded-full border border-slate-200 object-cover shrink-0"
                            />
                            <div className="min-w-0 flex-1">
                              <p className="text-xs font-bold text-slate-800 truncate">
                                {memberName} {member.id === currentUser.id && '(自分)'}
                              </p>
                              <p className="text-[10px] text-slate-500 truncate">
                                {memberOffice} / {memberDivision}
                              </p>
                            </div>
                            {isGroupRoom(activeRoom) && (
                            <div className="flex items-center gap-1 shrink-0">
                              {/* 管理者（王冠）アイコンの表示・トグル */}
                              {isUserRoomAdmin(activeRoom, member.id) ? (
                                <button
                                  onClick={() => isUserRoomAdmin(activeRoom, currentUser.id) ? handleToggleAdmin(member.id) : undefined}
                                  className={`p-1 rounded transition-all ${
                                    isUserRoomAdmin(activeRoom, currentUser.id)
                                      ? 'text-amber-500 hover:scale-110 cursor-pointer'
                                      : 'text-amber-500 cursor-default'
                                  }`}
                                  title={isUserRoomAdmin(activeRoom, currentUser.id) ? '管理者（クリックで権限解除）' : '管理者'}
                                >
                                  <Crown className="w-3.5 h-3.5 fill-amber-300" />
                                </button>
                              ) : (
                                // 自分が管理者なら、他の一般メンバーに管理者権限を付与するボタンを薄く表示
                                isUserRoomAdmin(activeRoom, currentUser.id) && (
                                  <button
                                    onClick={() => handleToggleAdmin(member.id)}
                                    className="p-1 text-slate-300 hover:text-amber-500 hover:scale-110 transition-all cursor-pointer"
                                    title="管理者に設定"
                                  >
                                    <Crown className="w-3.5 h-3.5" />
                                  </button>
                                )
                              )}

                              {/* メンバー削除（ゴミ箱）ボタン : 自分が管理者 or 自分自身の場合のみ表示 */}
                              {((isUserRoomAdmin(activeRoom, currentUser.id) && member.id !== currentUser.id) || (member.id === currentUser.id)) && (
                                <button
                                  onClick={() => handleRemoveMember(member.id)}
                                  className="p-1 text-slate-400 hover:text-rose-500 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                  title={member.id === currentUser.id ? 'グループを退室' : 'グループから削除'}
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    </div>
                  </div>

                  {/* 共有リンクボタン */}
                  <div className="pt-1">
                    <button
                      type="button"
                      onClick={handleShareRoom}
                      className={`w-full py-2 px-3 rounded-lg border text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-2xs ${
                        copiedLink
                          ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200'
                          : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200 hover:text-indigo-600'
                      }`}
                      title="このチャットルームの共有リンク（URL）をコピー"
                    >
                      {copiedLink ? (
                        <>
                          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                          <span>共有リンクをコピーしました!</span>
                        </>
                      ) : (
                        <>
                          <Share2 className="w-4 h-4 text-slate-500 shrink-0" />
                          <span>トークルームの共有リンクをコピー</span>
                        </>
                      )}
                    </button>
                    <p className="text-[10px] text-slate-400 text-center mt-1">※ 参加メンバーのみ閲覧・発言できます</p>
                  </div>

                  {isGroupRoom(activeRoom) && (
                    <button
                      onClick={() => {
                        setSelectedUserIds([]);
                        setModalSearch('');
                        setShowAddMemberModal(true);
                      }}
                      className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserPlus className="w-4 h-4" />
                      メンバーを追加する
                    </button>
                  )}

                  {/* トークルーム削除・退室エリア */}
                  {(!isGroupRoom(activeRoom) || isUserRoomAdmin(activeRoom, currentUser.id)) && (
                    <div className="pt-3 border-t border-slate-200">
                      <button
                        onClick={() => handleDeleteRoomClick(activeRoom.id)}
                        className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer border border-rose-200/60"
                        title="トークルームを削除"
                      >
                        <Trash2 className="w-4 h-4 text-rose-600" />
                        <span>{isGroupRoom(activeRoom) ? 'グループを削除する' : 'トークルームを削除する'}</span>
                      </button>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ----------------- メッセージ入力バー ----------------- */}
          <div
            onDragOver={handleChatDragOver}
            onDragLeave={handleChatDragLeave}
            onDrop={handleChatDrop}
            className="p-2 sm:p-3 bg-white border-t border-slate-200 shrink-0 relative"
          >
            {/* 写真添付プレビューモーダル / ポップアップ (単体) */}
            {pendingPhotoUrl && (
              <div className="mb-2 p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
                <img src={pendingPhotoUrl || undefined} alt="送信プレビュー" className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover border border-indigo-200 shrink-0" />
                <div className="flex-1 w-full min-w-0">
                  <input
                    type="text"
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendPhoto(pendingPhotoUrl, photoCaption, pendingThumbnailUrl || undefined);
                      }
                    }}
                    placeholder="写真に添えるコメント（任意）... (Enterで送信)"
                    className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    autoFocus
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      type="button"
                      onClick={() => handleSendPhoto(pendingPhotoUrl, photoCaption, pendingThumbnailUrl || undefined)}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold transition-colors cursor-pointer"
                    >
                      送信する
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setPendingPhotoUrl(null);
                        setPendingThumbnailUrl(null);
                      }}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md text-xs font-semibold transition-colors cursor-pointer"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* 複数写真アルバムプレビュー（最大10枚対応） */}
            {pendingAlbumPhotos.length > 0 && (
              <div className="mb-2.5 p-3 bg-indigo-50/90 border border-indigo-200/90 rounded-2xl shadow-sm animate-in fade-in slide-in-from-bottom-2 duration-150">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    <Images className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-bold text-slate-800">
                      写真アルバム作成 ({pendingAlbumPhotos.length} / 10枚)
                    </span>
                  </div>
                  {albumNotice && (
                    <span className="text-[11px] font-semibold text-amber-700 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded-full">
                      {albumNotice}
                    </span>
                  )}
                </div>

                {/* サムネイル横スクロールストリップ */}
                <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-thin">
                  {pendingAlbumPhotos.map((photo, index) => (
                    <div key={photo.id} className="relative group shrink-0 w-16 h-16 sm:w-20 sm:h-20 rounded-xl overflow-hidden border border-indigo-200 bg-slate-100 shadow-2xs">
                      <img src={photo.previewUrl} alt={`選択写真 ${index + 1}`} className="w-full h-full object-cover" />
                      <button
                        type="button"
                        onClick={() => handleRemoveAlbumPhoto(photo.id)}
                        className="absolute top-1 right-1 p-0.5 bg-black/60 hover:bg-rose-600 text-white rounded-full transition-colors cursor-pointer"
                        title="この写真を削除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                      <span className="absolute bottom-1 left-1 px-1.5 py-0.5 text-[9px] font-bold text-white bg-black/50 rounded-sm">
                        {index + 1}
                      </span>
                    </div>
                  ))}
                </div>

                {/* 共通キャプション入力欄 & 送信ボタン */}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 mt-2 pt-2 border-t border-indigo-100">
                  <input
                    type="text"
                    value={albumCaption}
                    onChange={(e) => setAlbumCaption(e.target.value)}
                    placeholder="アルバムに添えるコメント（任意）..."
                    disabled={isAlbumUploading}
                    className="flex-1 px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs font-medium focus:outline-hidden focus:ring-2 focus:ring-indigo-500 disabled:opacity-60"
                  />
                  <div className="flex items-center gap-2 justify-end">
                    <button
                      type="button"
                      disabled={isAlbumUploading}
                      onClick={handleSendAlbum}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      {isAlbumUploading ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>最適化＆送信中...</span>
                        </>
                      ) : (
                        <>
                          <Send className="w-3.5 h-3.5" />
                          <span>アルバムを送信 ({pendingAlbumPhotos.length}枚)</span>
                        </>
                      )}
                    </button>
                    <button
                      type="button"
                      disabled={isAlbumUploading}
                      onClick={handleCancelAlbum}
                      className="px-3 py-1.5 bg-slate-200 hover:bg-slate-300 disabled:opacity-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                    >
                      キャンセル
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* スタンプ選択ポップオーバー */}
            {showStampPicker && (
              <div className="absolute bottom-16 left-2 right-2 sm:left-4 sm:right-auto sm:w-96 max-w-[calc(100vw-1rem)] bg-white rounded-2xl border border-slate-200 shadow-xl p-3 space-y-3 z-30">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <Smile className="w-4 h-4 text-indigo-600" />
                    スタンプを選択
                  </span>
                  <button onClick={() => setShowStampPicker(false)} className="text-slate-400 hover:text-slate-600 p-1">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {stampCategories.length === 0 ? (
                  <div className="py-8 text-center text-slate-400 text-xs font-bold leading-relaxed">
                    <Smile className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    スタンプがまだ登録されていません。<br />
                    管理画面の「スタンプ管理」から追加してください。
                  </div>
                ) : (
                  <>
                    {/* スタンプカテゴリータブ */}
                    <div className="flex gap-1 border-b border-slate-100 pb-2 overflow-x-auto">
                      {stampCategories.map((cat) => {
                        const isCurrent = activeStampCategory === cat.id || (!activeStampCategory && cat.id === stampCategories[0]?.id);
                        return (
                          <button
                            key={cat.id}
                            onClick={() => setActiveStampCategory(cat.id)}
                            className={`px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all ${
                              isCurrent
                                ? 'bg-indigo-600 text-white shadow-2xs'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            {cat.name}
                          </button>
                        );
                      })}
                    </div>

                    {/* スタンプグリッド */}
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 sm:max-h-56 overflow-y-auto p-1">
                      {(() => {
                        const curCat = stampCategories.find((c) => c.id === activeStampCategory) || stampCategories[0];
                        const stamps = curCat?.stamps || [];
                        if (stamps.length === 0) {
                          return (
                            <div className="col-span-full py-8 text-center text-slate-400 text-xs font-medium">
                              このカテゴリにはスタンプがありません
                            </div>
                          );
                        }
                        return stamps.map((stamp) => (
                          <button
                            key={stamp.id}
                            onClick={() => handleSendStamp(stamp, curCat?.name || 'スタンプ')}
                            className="p-2 sm:p-2.5 rounded-xl border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/30 flex flex-col items-center justify-center gap-1 hover:scale-105 transition-all shadow-2xs overflow-hidden bg-white group cursor-pointer"
                          >
                            {stamp.imageUrl ? (
                              <div className="w-14 h-14 sm:w-16 sm:h-16 flex items-center justify-center p-1">
                                <img
                                  src={getStampUrl(stamp.imageUrl)}
                                  alt={stamp.text}
                                  className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                                  loading="lazy"
                                />
                              </div>
                            ) : (
                              <span className="text-xl sm:text-2xl">{stamp.icon || '😊'}</span>
                            )}
                            <span className="text-[11px] sm:text-xs font-black text-slate-800 text-center line-clamp-1">
                              {stamp.text}
                            </span>
                          </button>
                        ));
                      })()}
                    </div>
                  </>
                )}
              </div>
            )}

            {/* 選択中の添付ファイルプレビュー */}
            {chatAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl mb-2">
                {chatAttachments.map(att => {
                  const isImage = att.type?.startsWith('image/') || /\.(jpe?g|png|webp|gif|svg)$/i.test(att.name);
                  return (
                    <div
                      key={att.id}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold shadow-2xs"
                    >
                      {isImage && att.url ? (
                        <img src={att.url} alt={att.name} className="w-4 h-4 rounded object-cover shrink-0 border border-slate-200" />
                      ) : (
                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="text-slate-700 truncate max-w-[120px] sm:max-w-[150px]">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setChatAttachments(chatAttachments.filter(a => a.id !== att.id))}
                        className="text-slate-400 hover:text-red-500 font-bold ml-1 transition-colors cursor-pointer"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}

            {isChatUploading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold p-1 mb-2">
                <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                <span>ファイルアップロード中...</span>
              </div>
            )}

            {/* メッセージ入力フォーム */}
            <form onSubmit={handleSendMessage} className="flex items-end gap-1.5 sm:gap-2 relative">
              <UrlPastePopup
                prompt={chatPasteHandler.pastePrompt}
                onInsertCard={chatPasteHandler.handleInsertCard}
                onKeepPlain={chatPasteHandler.handleKeepPlain}
                onClose={chatPasteHandler.closePrompt}
                positionClass="bottom-full mb-3 left-12"
              />

              <button
                type="button"
                disabled={isChatUploading}
                onClick={() => chatFileInputRef.current?.click()}
                className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full border border-slate-200 transition-colors shrink-0 disabled:opacity-50 mb-0.5"
                title="ファイルを添付"
              >
                <Paperclip className="w-4 h-4" />
              </button>
              <input
                type="file"
                ref={chatFileInputRef}
                onChange={handleChatFileChange}
                multiple
                className="hidden"
              />

              {!isBossMode && (
                <>
                  <button
                    type="button"
                    onClick={() => {
                      fileInputRef.current?.click();
                      setShowStampPicker(false);
                    }}
                    className="p-1.5 sm:p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors shrink-0 mb-0.5 cursor-pointer"
                    title="写真を送信"
                  >
                    <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setShowStampPicker(!showStampPicker);
                    }}
                    className={`p-1.5 sm:p-2 rounded-full transition-colors shrink-0 mb-0.5 cursor-pointer ${
                      showStampPicker ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                    }`}
                    title="スタンプを送る"
                  >
                    <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
                  </button>
                </>
              )}

              <textarea
                ref={chatTextareaRef}
                rows={1}
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onKeyDown={handleKeyDown}
                onCompositionStart={() => setIsComposing(true)}
                onCompositionEnd={() => setIsComposing(false)}
                onPaste={handleChatTextareaPaste}
                placeholder={isBossMode ? "業務連絡・メッセージを入力... (Shift+Enterで改行, Enterで送信, 画像貼付可)" : "メッセージを入力... (Shift+Enterで改行, 画像の貼り付け・ファイル添付可)"}
                className="flex-1 min-w-0 px-3.5 sm:px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-2xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs sm:text-sm font-semibold text-slate-800 resize-none overflow-y-auto leading-relaxed"
                style={{ minHeight: '38px', maxHeight: '120px' }}
              />

              <button
                type="submit"
                disabled={((!messageText || !messageText.trim()) && chatAttachments.length === 0) || isChatUploading}
                className="p-2 sm:p-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors shadow-sm shrink-0 flex items-center justify-center mb-0.5"
              >
                {isChatUploading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className={`flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-8 ${
          mobileView === 'list' ? 'hidden md:flex' : 'flex'
        }`}>
          <MessageSquare className="w-16 h-16 mb-4 opacity-20 text-indigo-600" />
          <p className="font-bold text-slate-600">トークルームを選択してください</p>
          <p className="text-xs text-slate-400 mt-1 mb-4">「+ ルーム作成」ボタンから新規トークを始められます</p>
          {isSidebarCollapsed && (
            <button
              type="button"
              onClick={toggleSidebar}
              className="hidden md:flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm cursor-pointer"
            >
              <PanelLeftOpen className="w-4 h-4" />
              ルーム一覧を表示する
            </button>
          )}
        </div>
      )}

      {/* ----------------- モーダル: 新規チャットルーム作成 ----------------- */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Plus className="w-4 h-4 text-indigo-600" />
                新規トークルーム作成
              </h3>
              <button onClick={() => setShowCreateModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateRoom} className="p-5 overflow-y-auto space-y-4 flex-1">
              {/* ルーム種別選択 */}
              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">トークの種類</label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setNewRoomType('group')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      newRoomType === 'group'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Users className="w-4 h-4" /> グループトーク
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewRoomType('dm')}
                    className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all flex items-center justify-center gap-2 ${
                      newRoomType === 'dm'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 shadow-xs'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <UserIcon className="w-4 h-4" /> 1対1トーク
                  </button>
                </div>
              </div>

              {/* グループ名（グループトークの場合） */}
              {newRoomType === 'group' && (
                <div>
                  <label className="text-xs font-bold text-slate-700 block mb-1">
                    グループ名 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={newRoomName}
                    onChange={(e) => setNewRoomName(e.target.value)}
                    placeholder="例: 名古屋営業チーム、開発プロジェクト"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              )}

              {/* メンバー追加フィルター＆検索 */}
              <div>
                <MemberSelector
                  allUsers={users.filter(u => u.id !== currentUser.id)}
                  selectedUserIds={selectedUserIds}
                  onChangeSelectedUserIds={(ids) => {
                    if (newRoomType === 'dm' && ids.length > 1) {
                      // DMの場合は最後の選択のみ保持
                      setSelectedUserIds([ids[ids.length - 1]]);
                    } else {
                      setSelectedUserIds(ids);
                    }
                  }}
                  offices={offices}
                  divisions={divisions}
                  label={newRoomType === 'dm' ? 'チャット相手を選択' : 'グループ参加メンバーを選択'}
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={selectedUserIds.length === 0 || (newRoomType === 'group' && (!newRoomName || !newRoomName.trim()))}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  トークルームを作成
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- モーダル: 既存トークにメンバー追加 ----------------- */}
      {showAddMemberModal && activeRoom && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden flex flex-col">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                グループにメンバーを追加
              </h3>
              <button onClick={() => setShowAddMemberModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddMembers} className="p-5 space-y-4">
              <MemberSelector
                allUsers={users.filter((u) => !activeRoom.participants.some((p) => p.id === u.id))}
                selectedUserIds={selectedUserIds}
                onChangeSelectedUserIds={setSelectedUserIds}
                offices={offices}
                divisions={divisions}
                label="追加するメンバーを選択"
              />

              <div className="pt-3 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddMemberModal(false)}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={selectedUserIds.length === 0}
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-colors disabled:opacity-50"
                >
                  追加する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- モーダル: 写真ライトボックス (アルバム対応・次へ/前へスライド) ----------------- */}
      {lightboxGallery && (
        <div
          className="fixed inset-0 bg-black/85 backdrop-blur-md z-50 flex items-center justify-center p-2 sm:p-6 select-none"
          onClick={() => setLightboxGallery(null)}
        >
          <div className="relative max-w-5xl max-h-[92vh] flex flex-col items-center justify-center" onClick={(e) => e.stopPropagation()}>
            <img
              src={lightboxGallery.images[lightboxGallery.currentIndex] || undefined}
              alt="拡大写真"
              className="max-w-full max-h-[82vh] rounded-xl object-contain shadow-2xl transition-all duration-200"
            />

            {/* 枚数カウンター */}
            {lightboxGallery.images.length > 1 && (
              <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-black/60 backdrop-blur-xs text-white text-xs font-bold rounded-full border border-white/20">
                {lightboxGallery.currentIndex + 1} / {lightboxGallery.images.length}
              </div>
            )}

            {/* 前へボタン */}
            {lightboxGallery.images.length > 1 && lightboxGallery.currentIndex > 0 && (
              <button
                type="button"
                onClick={() => setLightboxGallery(prev => prev ? { ...prev, currentIndex: prev.currentIndex - 1 } : null)}
                className="absolute left-2 sm:-left-12 top-1/2 -translate-y-1/2 p-2.5 bg-black/50 hover:bg-black/80 text-white rounded-full transition-all cursor-pointer border border-white/20 shadow-lg hover:scale-110"
                title="前の写真へ (←キー)"
              >
                <ChevronLeft className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}

            {/* 次へボタン */}
            {lightboxGallery.images.length > 1 && lightboxGallery.currentIndex < lightboxGallery.images.length - 1 && (
              <button
                type="button"
                onClick={() => setLightboxGallery(prev => prev ? { ...prev, currentIndex: prev.currentIndex + 1 } : null)}
                className="absolute right-2 sm:-right-12 top-1/2 -translate-y-1/2 p-2.5 bg-black/50 hover:bg-black/80 text-white rounded-full transition-all cursor-pointer border border-white/20 shadow-lg hover:scale-110"
                title="次の写真へ (→キー)"
              >
                <ChevronRight className="w-5 h-5 sm:w-6 sm:h-6" />
              </button>
            )}

            {/* 閉じるボタン */}
            <button
              onClick={() => setLightboxGallery(null)}
              className="absolute -top-10 sm:-top-11 right-0 p-2 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors cursor-pointer"
              title="閉じる (Esc)"
            >
              <X className="w-5 h-5 sm:w-6 sm:h-6" />
            </button>
          </div>
        </div>
      )}
      {/* ----------------- 確認ダイアログ ----------------- */}
      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />

      <FilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />

      {/* ----------------- モーダル: 既読メンバー一覧 ----------------- */}
      {viewersModalOpen && selectedMsgForViewers && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs transition-opacity"
            onClick={() => setViewersModalOpen(false)}
          />
          <div className="relative bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Check className="w-5 h-5 text-emerald-500 font-bold" />
                <h3 className="text-base font-bold text-slate-800">既読メンバー一覧</h3>
              </div>
              <button
                type="button"
                onClick={() => setViewersModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 overflow-y-auto space-y-4">
              <div className="flex items-center justify-between gap-4">
                <span className="text-xs font-bold text-slate-500 truncate">
                  メッセージ: &ldquo;{selectedMsgForViewers.content || (selectedMsgForViewers.type === 'stamp' ? 'スタンプを送信しました' : 'ファイルを送信しました')}&rdquo;
                </span>
                {(() => {
                  const viewersList = selectedMsgForViewers.viewers || [];
                  const senderId = String(selectedMsgForViewers.sender?.id ?? '');
                  const readMembers = viewersList.filter((v: any) => {
                    const viewerId = String(v?.user?.id ?? v?.userId ?? v?.id ?? '');
                    return viewerId !== '' && viewerId !== senderId;
                  });
                  const otherParticipants = (activeRoom?.participants || []).filter(
                    (p: any) => String(p?.id ?? '') !== senderId
                  );
                  const isAllRead = otherParticipants.length > 0 && otherParticipants.every(
                    (p: any) => readMembers.some((v: any) => String(v?.user?.id ?? v?.userId ?? v?.id ?? '') === String(p?.id ?? ''))
                  );
                  
                  if (readMembers.length === 0) {
                    return (
                      <span className="text-xs font-bold text-slate-400 bg-slate-50 px-2 py-0.5 rounded-lg border border-slate-200 shrink-0">
                        未読
                      </span>
                    );
                  }
                  if (isAllRead) {
                    return (
                      <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 shrink-0">
                        全員が既読
                      </span>
                    );
                  }
                  return (
                    <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-lg border border-emerald-100 shrink-0">
                      既読 {readMembers.length} 名
                    </span>
                  );
                })()}
              </div>

              <div className="grid grid-cols-1 gap-2.5 max-h-80 overflow-y-auto pr-1">
                {(() => {
                  const viewersList = selectedMsgForViewers.viewers || [];
                  const senderId = String(selectedMsgForViewers.sender?.id ?? '');
                  const readMembers = viewersList.filter((v: any) => {
                    const viewerId = String(v?.user?.id ?? v?.userId ?? v?.id ?? '');
                    return viewerId !== '' && viewerId !== senderId;
                  });
                  if (readMembers.length === 0) {
                    return (
                      <div className="text-center py-8 text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                        まだ既読メンバーはいません（送信者を除く）
                      </div>
                    );
                  }
                  return readMembers.map((v, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs"
                    >
                      <div className="flex items-center gap-2.5">
                        {(() => {
                          const viewerUser = (v.user.id === currentUser.id ? currentUser : undefined) || users.find((u) => u.id === v.user.id) || v.user;
                          const viewerAvatar = (v.user.id === currentUser.id ? currentUser.avatarUrl : viewerUser?.avatarUrl) || v.user.avatarUrl;
                          const viewerName = (v.user.id === currentUser.id ? currentUser.name : viewerUser?.name) || v.user.name;
                          return (
                            <img
                              src={getAvatarUrl(viewerAvatar)}
                              alt={viewerName}
                              onError={handleAvatarError}
                              className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                              referrerPolicy="no-referrer"
                            />
                          );
                        })()}
                        <div>
                          <div className="font-bold text-slate-800">{v.user.name}</div>
                          <div className="text-[10px] text-slate-500">
                            {v.user.office || ''} {v.user.division || ''}
                          </div>
                        </div>
                      </div>
                      <div className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                        {new Date(v.viewedAt).toLocaleDateString('ja-JP')} {new Date(v.viewedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </div>
                  ));
                })()}
              </div>
            </div>

            {/* Footer */}
            <div className="px-6 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
              <button
                type="button"
                onClick={() => setViewersModalOpen(false)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-colors cursor-pointer"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
