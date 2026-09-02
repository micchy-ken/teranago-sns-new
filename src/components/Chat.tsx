import React, { useState, useRef, useEffect } from 'react';
import { ChatRoom, ChatMessage, User, OfficeMaster, DivisionMaster, AttachmentFile } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { MemberSelector } from './MemberSelector';
import { markChatRoomAsRead, getReadChatTimestamps } from '../utils/notifications';
import { API_BASE_URL } from '../config/api';
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
  UploadCloud,
  PanelLeftClose,
  PanelLeftOpen
} from 'lucide-react';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { uploadMultipleFiles, uploadFile } from '../utils/fileUpload';
import { FilePreviewModal } from './FilePreviewModal';
import { triggerPushNotification } from '../utils/pushNotifications';
import { renderContentWithLinks } from '../utils/renderContentWithLinks';
import { UrlPastePopup, useUrlPasteHandler } from './common/UrlPastePopup';

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

// スタンプの定義
const STAMP_CATEGORIES = [
  {
    id: 'greeting',
    name: 'あいさつ',
    stamps: [
      { id: 'ryokai', text: '了解です！', icon: '👍', color: 'bg-emerald-500 text-white border-emerald-600' },
      { id: 'otsukare', text: 'お疲れ様です！', icon: '🍵', color: 'bg-amber-500 text-white border-amber-600' },
      { id: 'arigatou', text: 'ありがとう！', icon: '✨', color: 'bg-rose-500 text-white border-rose-600' },
      { id: 'yoroshiku', text: 'よろしく！', icon: '🤝', color: 'bg-indigo-500 text-white border-indigo-600' },
      { id: 'ohayou', text: 'おはようございます', icon: '☀️', color: 'bg-sky-500 text-white border-sky-600' },
    ]
  },
  {
    id: 'reaction',
    name: 'リアクション',
    stamps: [
      { id: 'ok', text: 'OK', icon: '⭕', color: 'bg-blue-600 text-white border-blue-700' },
      { id: 'ng', text: 'NG', icon: '❌', color: 'bg-red-500 text-white border-red-600' },
      { id: 'god', text: '神！', icon: '👑', color: 'bg-purple-600 text-white border-purple-700' },
      { id: 'good', text: '超いいね！', icon: '❤️', color: 'bg-pink-500 text-white border-pink-600' },
      { id: 'naruhodo', text: 'なるほど！', icon: '💡', color: 'bg-yellow-500 text-white border-yellow-600' },
    ]
  },
  {
    id: 'work',
    name: '仕事・連絡',
    stamps: [
      { id: 'checking', text: '確認中…', icon: '🔍', color: 'bg-slate-700 text-white border-slate-800' },
      { id: 'urgent', text: '至急！', icon: '🚨', color: 'bg-red-600 text-white border-red-700' },
      { id: 'phone', text: '電話ください', icon: '📞', color: 'bg-emerald-600 text-white border-emerald-700' },
      { id: 'done', text: '対応完了！', icon: '✅', color: 'bg-teal-600 text-white border-teal-700' },
    ]
  }
];

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

  // 未読メッセージを自動で既読にする
  useEffect(() => {
    if (!activeRoom || !currentUser) return;
    const messages = activeRoom.messages || [];

    // 自分以外のメッセージで、自分がまだ既読になっていないメッセージ
    const unreadMsgs = messages.filter(msg => {
      const isMine = msg.sender.id === currentUser.id;
      if (isMine) return false;
      const viewers = msg.viewers || [];
      const alreadyRead = viewers.some(v => v.user.id === currentUser.id);
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

  const processedInitialRoomIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (initialRoomId && processedInitialRoomIdRef.current !== initialRoomId) {
      if (rooms.some(r => r.id === initialRoomId)) {
        processedInitialRoomIdRef.current = initialRoomId;
        setActiveRoomId(initialRoomId);
        setMobileView('room');
      }
    }
  }, [initialRoomId, rooms]);

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
        unreadMsg = messages.find((msg) => {
          if (msg.sender.id === currentUser.id) return false;
          const viewers = msg.viewers || [];
          const isViewed = viewers.some((v: any) =>
            v?.user?.id === currentUser.id || v?.userId === currentUser.id || v?.id === currentUser.id
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

  // 過去メッセージ追加時のスクロール位置補正（位置跳躍の防止）
  useEffect(() => {
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

  const handleTimelineScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const container = e.currentTarget;
    // 上部付近（50px以内）にスクロールした際に過去メッセージを自動読み込み
    if (container.scrollTop < 60 && visibleStartIndex > 0 && !isLoadingMorePrevious) {
      loadMorePreviousMessages();
    }
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
  const [activeStampCategory, setActiveStampCategory] = useState('greeting');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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

  // 写真プレビュー＆アップロード
  const [pendingPhotoUrl, setPendingPhotoUrl] = useState<string | null>(null);
  const [photoCaption, setPhotoCaption] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // チャットスクロール用Ref
  const chatContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const prevRoomIdRef = useRef<string | null>(null);
  const prevMessagesLengthRef = useRef<number>(0);
  const lastScrolledKeyRef = useRef<string>('');

  useEffect(() => {
    const container = chatContainerRef.current;
    if (!container || !activeRoom) return;

    const messages = activeRoom.messages || [];
    const msgCount = messages.length;
    
    // スクロール判定用キー (部屋ID、モバイル画面状態、未読メッセージID、表示開始位置)
    const scrollKey = `${activeRoom.id}_${mobileView}_${firstUnreadMessageId || 'none'}_${visibleStartIndex}`;
    const isNewRoomOrView = lastScrolledKeyRef.current !== scrollKey;
    const lengthIncreased = msgCount > prevMessagesLengthRef.current;
    
    // 最終メッセージが自分のものであるか確認
    const lastMessage = messages[msgCount - 1];
    const sentByMe = lastMessage && lastMessage.sender.id === currentUser.id;

    if (isNewRoomOrView) {
      lastScrolledKeyRef.current = scrollKey;

      const performScroll = (smooth = false) => {
        const c = chatContainerRef.current;
        if (!c) return;

        const unreadEl = document.getElementById('unread-line-divider');
        if (unreadEl) {
          // scrollIntoViewはモバイルWebでwindow全体をスクロールさせてしまう場合があるため、直接scrollTopを計算設定
          const containerRect = c.getBoundingClientRect();
          const unreadRect = unreadEl.getBoundingClientRect();
          const relativeTop = unreadRect.top - containerRect.top + c.scrollTop;
          
          c.scrollTo({
            top: Math.max(0, relativeTop - 12),
            behavior: smooth ? 'smooth' : 'auto'
          });
        } else {
          c.scrollTo({
            top: c.scrollHeight,
            behavior: smooth ? 'smooth' : 'auto'
          });
        }
      };

      // 即時描画＋レイアウト安定化タイミングに合わせた段階的スクロール
      performScroll(false);

      const anim1 = requestAnimationFrame(() => performScroll(false));
      const t1 = setTimeout(() => performScroll(false), 50);
      const t2 = setTimeout(() => performScroll(true), 150);
      const t3 = setTimeout(() => performScroll(true), 350);

      prevRoomIdRef.current = activeRoom.id;
      prevMessagesLengthRef.current = msgCount;

      return () => {
        cancelAnimationFrame(anim1);
        clearTimeout(t1);
        clearTimeout(t2);
        clearTimeout(t3);
      };
    } else if (lengthIncreased) {
      const isNearBottom = container.scrollHeight - container.scrollTop - container.clientHeight < 150;
      if (sentByMe || isNearBottom) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth'
        });
      }
    }

    prevRoomIdRef.current = activeRoom.id;
    prevMessagesLengthRef.current = msgCount;
  }, [activeRoom?.id, activeRoom?.messages, firstUnreadMessageId, mobileView, visibleStartIndex, currentUser?.id]);

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
    if (room.name) return room.name;
    const participants = room.participants || [];
    const others = participants.filter((p) => p && p.id !== currentUser.id);
    if (others.length === 0) return '自分とのメモ';
    return others.map((o) => o.name || 'メンバー').join(', ');
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
    return other?.avatarUrl ? (
      <img
        src={getAvatarUrl(other.avatarUrl)}
        alt={other.name || ''}
        className="w-10 h-10 rounded-full border border-slate-200 object-cover shrink-0"
      />
    ) : (
      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
        <UserIcon className="w-5 h-5" />
      </div>
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
    setMessageText('');
    setChatAttachments([]);
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

  const handleChatDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsChatDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processChatUploadedFiles(e.dataTransfer.files);
    }
  };

  // スタンプ送信
  const handleSendStamp = (stamp: typeof STAMP_CATEGORIES[0]['stamps'][0], categoryName: string) => {
    if (!activeRoom) return;

    const newMessage: ChatMessage = {
      id: `stamp_${Date.now()}`,
      sender: currentUser,
      content: stamp.text,
      createdAt: new Date().toISOString(),
      type: 'stamp',
      stampId: stamp.id,
      stampText: stamp.text,
      stampCategory: categoryName
    };

    updateRoomMessages(activeRoom.id, newMessage);
    setShowStampPicker(false);
  };

  // 写真送信
  const handleSendPhoto = (imageUrl: string, caption?: string) => {
    if (!activeRoom) return;

    const newMessage: ChatMessage = {
      id: `img_${Date.now()}`,
      sender: currentUser,
      content: caption || '写真を送信しました',
      createdAt: new Date().toISOString(),
      type: 'image',
      imageUrl
    };

    updateRoomMessages(activeRoom.id, newMessage);
    setPendingPhotoUrl(null);
    setPhotoCaption('');
  };

  // 写真ローカルファイル選択
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsChatUploading(true);
    try {
      const uploaded = await uploadFile(file);
      setPendingPhotoUrl(uploaded.url);
    } catch (err) {
      console.error(err);
      const localUrl = URL.createObjectURL(file);
      setPendingPhotoUrl(localUrl);
    } finally {
      setIsChatUploading(false);
      e.target.value = '';
    }
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
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex h-[calc(100dvh-8rem)] sm:h-[calc(100vh-8.5rem)] relative w-full">
      {/* 隠しファイルインプット */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
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
                    {getRoomIcon(room)}

                    <div className="flex-1 min-w-0 pr-6">
                      <div className="flex justify-between items-baseline mb-0.5">
                        <h4 className={`text-xs font-bold truncate ${isActive ? 'text-indigo-950' : 'text-slate-900'}`}>
                          {getRoomName(room)}
                        </h4>
                        {lastMsg && (
                          <span className="text-[10px] font-medium text-slate-400 shrink-0 ml-1">
                            {formatChatTimestamp(lastMsg.createdAt, true)}
                          </span>
                        )}
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

            <div className="flex items-center gap-1 sm:gap-2 shrink-0">
              {isGroupRoom(activeRoom) && (
                <button
                  onClick={() => {
                    setSelectedUserIds([]);
                    setModalSearch('');
                    setShowAddMemberModal(true);
                  }}
                  className="p-1.5 sm:px-3 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1"
                  title="メンバーを追加"
                >
                  <UserPlus className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-indigo-600" />
                  <span className="hidden sm:inline">メンバー追加</span>
                </button>
              )}
              <button
                onClick={() => setShowInfoSidebar(!showInfoSidebar)}
                className={`p-1.5 sm:p-2 rounded-lg transition-colors ${
                  showInfoSidebar ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                }`}
                title="ルーム詳細"
              >
                <Info className="w-4 h-4" />
              </button>
              {/* グループの場合は管理者のみ削除可能。DMの場合は誰でも削除可能 */}
              {(!isGroupRoom(activeRoom) || isUserRoomAdmin(activeRoom, currentUser.id)) && (
                <button
                  onClick={() => handleDeleteRoomClick(activeRoom.id)}
                  className="p-1.5 sm:p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                  title="トークルームを削除"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              )}
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

                  if (isSystem) {
                    return (
                      <React.Fragment key={msg.id}>
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
                        <div className="flex justify-center my-2 sm:my-3">
                          <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 bg-slate-200/80 text-slate-600 text-[10px] sm:text-[11px] font-medium rounded-full shadow-2xs">
                            {msg.content}
                          </span>
                        </div>
                      </React.Fragment>
                    );
                  }

                  const showSenderName = !isMine && (!prevMsg || prevMsg.sender.id !== msg.sender.id || prevMsg.id.startsWith('sys_'));

                  return (
                    <React.Fragment key={msg.id}>
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
                    {/* 相手のアバター */}
                    {!isMine && (
                      <div className="w-7 h-7 sm:w-8 sm:h-8 shrink-0">
                        {showSenderName ? (
                          <img
                            src={getAvatarUrl(msg.sender.avatarUrl)}
                            alt={msg.sender.name}
                            className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 object-cover shadow-2xs"
                          />
                        ) : (
                          <div className="w-7 h-7 sm:w-8 sm:h-8" />
                        )}
                      </div>
                    )}

                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[85%] sm:max-w-[75%]`}>
                      {showSenderName && (
                        <span className="text-[10px] sm:text-[11px] font-bold text-slate-600 mb-1 ml-1">
                          {msg.sender.name}
                        </span>
                      )}

                      <div className={`flex items-end gap-1.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                        {/* メッセージコンテンツ (テキスト / スタンプ / 写真) */}
                        {msg.type === 'stamp' ? (
                          <div className="p-1">
                            {(() => {
                              const stampDef = STAMP_CATEGORIES.flatMap((c) => c.stamps).find((s) => s.id === msg.stampId);
                              return (
                                <div className={`inline-flex flex-col items-center justify-center p-2.5 sm:p-3.5 rounded-2xl border-2 shadow-md hover:scale-105 transition-transform ${stampDef?.color || 'bg-emerald-500 text-white border-emerald-600'}`}>
                                  <span className="text-2xl sm:text-3xl mb-1">{stampDef?.icon || '😊'}</span>
                                  <span className="text-xs sm:text-sm font-black tracking-wide drop-shadow-xs">{msg.stampText || msg.content}</span>
                                </div>
                              );
                            })()}
                          </div>
                        ) : msg.type === 'image' ? (
                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm max-w-xs sm:max-w-sm">
                            <div className="relative group cursor-pointer" onClick={() => setLightboxImage(msg.imageUrl || null)}>
                              <img
                                src={msg.imageUrl || undefined}
                                alt="添付写真"
                                className="w-full max-h-56 sm:max-h-64 object-cover hover:opacity-95 transition-opacity"
                              />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                                <Maximize2 className="w-4 h-4" /> 拡大表示
                              </div>
                            </div>
                            {msg.content && msg.content !== '写真を送信しました' && (
                              <div className="p-2 sm:p-2.5 text-xs text-slate-800 border-t border-slate-100 whitespace-pre-wrap">
                                {msg.content}
                              </div>
                            )}
                          </div>
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
                                          onClick={() => {
                                            setPreviewFile(att);
                                            setIsPreviewOpen(true);
                                          }}
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
                                            setConfirmModal({
                                              isOpen: true,
                                              title: 'ファイルダウンロード',
                                              message: `ファイル「${att.name}」のダウンロードを開始します。`,
                                              type: 'info',
                                              confirmText: 'OK'
                                            });
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
                            // 送信者を除外した既読メンバー
                            const readMembers = viewersList.filter(v => v.user.id !== msg.sender.id);
                            const readCount = readMembers.length;

                            // 送信者を除いたトーク参加メンバー
                            const otherParticipants = (activeRoom?.participants || []).filter(p => p.id !== msg.sender.id);
                            
                            let displayText = `[既読 ${readCount}]`;
                            const isAllRead = otherParticipants.length > 0 && otherParticipants.every(p => readMembers.some(v => v.user.id === p.id));
                            
                            if (readCount === 0) {
                              displayText = '[未読]';
                            } else if (isAllRead) {
                              displayText = '[全員が既読]';
                            }

                            return (
                              <button
                                type="button"
                                onClick={() => {
                                  setSelectedMsgForViewers(msg);
                                  setViewersModalOpen(true);
                                }}
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
                              onClick={() => handleDeleteMessageClick(msg.id)}
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
                </React.Fragment>
                );
              });
            })()}
              <div ref={messagesEndRef} />
            </div>

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
                      {activeRoom.participants.map((member) => (
                        <div key={member.id} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-50 group/member">
                          <img
                            src={getAvatarUrl(member.avatarUrl)}
                            alt={member.name}
                            className="w-8 h-8 rounded-full border border-slate-200 object-cover shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-bold text-slate-800 truncate">
                              {member.name} {member.id === currentUser.id && '(自分)'}
                            </p>
                            <p className="text-[10px] text-slate-500 truncate">
                              {member.office} / {member.division}
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
                      ))}
                    </div>
                  </div>

                  {isGroupRoom(activeRoom) && (
                    <button
                      onClick={() => {
                        setSelectedUserIds([]);
                        setModalSearch('');
                        setShowAddMemberModal(true);
                      }}
                      className="w-full py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5"
                    >
                      <UserPlus className="w-4 h-4" />
                      メンバーを追加する
                    </button>
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
            {/* 写真添付プレビューモーダル / ポップアップ */}
            {pendingPhotoUrl && (
              <div className="mb-2 p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center gap-2.5">
                <img src={pendingPhotoUrl || undefined} alt="送信プレビュー" className="w-14 h-14 sm:w-16 sm:h-16 rounded-lg object-cover border border-indigo-200 shrink-0" />
                <div className="flex-1 w-full min-w-0">
                  <input
                    type="text"
                    value={photoCaption}
                    onChange={(e) => setPhotoCaption(e.target.value)}
                    placeholder="写真に添えるコメント（任意）..."
                    className="w-full px-3 py-1.5 bg-white border border-indigo-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => handleSendPhoto(pendingPhotoUrl, photoCaption)}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-md text-xs font-bold transition-colors"
                    >
                      送信する
                    </button>
                    <button
                      onClick={() => setPendingPhotoUrl(null)}
                      className="px-3 py-1 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-md text-xs font-semibold transition-colors"
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

                {/* スタンプカテゴリータブ */}
                <div className="flex gap-1 border-b border-slate-100 pb-2 overflow-x-auto">
                  {STAMP_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveStampCategory(cat.id)}
                      className={`px-2.5 sm:px-3 py-1 rounded-full text-xs font-semibold shrink-0 transition-all ${
                        activeStampCategory === cat.id
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>

                {/* スタンプグリッド */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 sm:max-h-56 overflow-y-auto p-1">
                  {STAMP_CATEGORIES.find((c) => c.id === activeStampCategory)?.stamps.map((stamp) => (
                    <button
                      key={stamp.id}
                      onClick={() =>
                        handleSendStamp(
                          stamp,
                          STAMP_CATEGORIES.find((c) => c.id === activeStampCategory)?.name || 'スタンプ'
                        )
                      }
                      className={`p-2.5 sm:p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1 hover:scale-105 transition-all shadow-xs ${stamp.color}`}
                    >
                      <span className="text-xl sm:text-2xl">{stamp.icon}</span>
                      <span className="text-[11px] sm:text-xs font-black tracking-wide">{stamp.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 選択中の添付ファイルプレビュー */}
            {chatAttachments.length > 0 && (
              <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl mb-2">
                {chatAttachments.map(att => (
                  <div
                    key={att.id}
                    className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                  >
                    <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                    <span className="text-slate-700 truncate max-w-[120px] sm:max-w-[150px]">{att.name}</span>
                    <button
                      type="button"
                      onClick={() => setChatAttachments(chatAttachments.filter(a => a.id !== att.id))}
                      className="text-slate-400 hover:text-red-500 font-bold ml-1 transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {isChatUploading && (
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold p-1 mb-2">
                <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                <span>ファイルアップロード中...</span>
              </div>
            )}

            {/* メッセージ入力フォーム */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-1.5 sm:gap-2 relative">
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
                className="p-2 sm:p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-full border border-slate-200 transition-colors shrink-0 disabled:opacity-50"
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

              <button
                type="button"
                onClick={() => {
                  fileInputRef.current?.click();
                  setShowStampPicker(false);
                }}
                className="p-1.5 sm:p-2 rounded-full hover:bg-slate-100 text-slate-500 transition-colors shrink-0"
                title="写真を送信"
              >
                <ImageIcon className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowStampPicker(!showStampPicker);
                }}
                className={`p-1.5 sm:p-2 rounded-full transition-colors shrink-0 ${
                  showStampPicker ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                }`}
                title="スタンプを送る"
              >
                <Smile className="w-4 h-4 sm:w-5 sm:h-5" />
              </button>

              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                onPaste={chatPasteHandler.handlePaste}
                placeholder="メッセージを入力... (ファイルをドラッグ＆ドロップ可)"
                className="flex-1 min-w-0 px-3 sm:px-4 py-2 sm:py-2.5 bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs sm:text-sm font-semibold text-slate-800"
              />

              <button
                type="submit"
                disabled={((!messageText || !messageText.trim()) && chatAttachments.length === 0) || isChatUploading}
                className="p-2 sm:p-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors shadow-sm shrink-0 flex items-center justify-center"
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

      {/* ----------------- モーダル: 写真ライトボックス ----------------- */}
      {lightboxImage && (
        <div
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 cursor-pointer"
          onClick={() => setLightboxImage(null)}
        >
          <div className="relative max-w-4xl max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
            <img src={lightboxImage || undefined} alt="拡大写真" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
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
                  const readMembers = viewersList.filter(v => v.user.id !== selectedMsgForViewers.sender.id);
                  const otherParticipants = (activeRoom?.participants || []).filter(p => p.id !== selectedMsgForViewers.sender.id);
                  const isAllRead = otherParticipants.length > 0 && otherParticipants.every(p => readMembers.some(v => v.user.id === p.id));
                  
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
                  const readMembers = viewersList.filter(v => v.user.id !== selectedMsgForViewers.sender.id);
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
                        <img
                          src={getAvatarUrl(v.user.avatarUrl)}
                          alt={v.user.name}
                          className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                          referrerPolicy="no-referrer"
                        />
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
