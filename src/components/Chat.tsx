import React, { useState, useRef, useEffect } from 'react';
import { ChatRoom, ChatMessage, User, OfficeMaster, DivisionMaster } from '../types';
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
  Filter
} from 'lucide-react';

interface ChatProps {
  rooms: ChatRoom[];
  users: User[];
  currentUser: User;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  onUpdateRooms?: (rooms: ChatRoom[]) => void;
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

// サンプル写真プリセット（即時送信・テスト用）
const PRESET_PHOTOS = [
  { id: 'p1', name: '現場写真', url: 'https://images.unsplash.com/photo-1541888946425-d0fbb186a5b7?w=800&auto=format&fit=crop&q=80' },
  { id: 'p2', name: '資料・納品書', url: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800&auto=format&fit=crop&q=80' },
  { id: 'p3', name: 'オフィス風景', url: 'https://images.unsplash.com/photo-1497366216548-37526070297c?w=800&auto=format&fit=crop&q=80' },
  { id: 'p4', name: 'CAD・図面イメージ', url: 'https://images.unsplash.com/photo-1503387762-592deb58ef4e?w=800&auto=format&fit=crop&q=80' },
];

export function Chat({
  rooms,
  users,
  currentUser,
  offices = [],
  divisions = [],
  onUpdateRooms
}: ChatProps) {
  const [activeRoomId, setActiveRoomId] = useState<string>(rooms[0]?.id || '');
  const [messageText, setMessageText] = useState('');
  const [roomFilter, setRoomFilter] = useState<'all' | 'group' | 'dm'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // ポップオーバー・モーダル状態
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAddMemberModal, setShowAddMemberModal] = useState(false);
  const [showInfoSidebar, setShowInfoSidebar] = useState(false);
  const [showStampPicker, setShowStampPicker] = useState(false);
  const [showPhotoPicker, setShowPhotoPicker] = useState(false);
  const [activeStampCategory, setActiveStampCategory] = useState('greeting');
  const [lightboxImage, setLightboxImage] = useState<string | null>(null);

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
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const activeRoom = rooms.find((r) => r.id === activeRoomId) || rooms[0];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeRoom?.messages]);

  // トークルーム名・アイコン取得
  const getRoomName = (room: ChatRoom) => {
    if (room.name) return room.name;
    const others = room.participants.filter((p) => p.id !== currentUser.id);
    if (others.length === 0) return '自分とのメモ';
    return others.map((o) => o.name).join(', ');
  };

  const getRoomIcon = (room: ChatRoom) => {
    if (room.type === 'group') {
      return (
        <div className="w-10 h-10 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-600 shrink-0">
          <Users className="w-5 h-5" />
        </div>
      );
    }
    const other = room.participants.find((p) => p.id !== currentUser.id) || room.participants[0];
    return other?.avatarUrl ? (
      <img
        src={other.avatarUrl}
        alt={other.name}
        className="w-10 h-10 rounded-full border border-slate-200 object-cover shrink-0"
      />
    ) : (
      <div className="w-10 h-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center text-slate-500 shrink-0">
        <UserIcon className="w-5 h-5" />
      </div>
    );
  };

  // メッセージ送信（テキスト）
  const handleSendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!messageText.trim() || !activeRoom) return;

    const newMessage: ChatMessage = {
      id: `m_${Date.now()}`,
      sender: currentUser,
      content: messageText.trim(),
      createdAt: new Date().toISOString(),
      type: 'text'
    };

    updateRoomMessages(activeRoom.id, newMessage);
    setMessageText('');
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
    setShowPhotoPicker(false);
  };

  // 写真ローカルファイル選択
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      if (event.target?.result) {
        setPendingPhotoUrl(event.target.result as string);
      }
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  // ルーム内のメッセージ更新
  const updateRoomMessages = (roomId: string, message: ChatMessage) => {
    const updated = rooms.map((r) => {
      if (r.id === roomId) {
        return {
          ...r,
          messages: [...r.messages, message],
          lastUpdated: new Date().toISOString()
        };
      }
      return r;
    });

    if (onUpdateRooms) {
      onUpdateRooms(updated);
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
          r.participants.some((p) => p.id === selectedUsers[0].id) &&
          r.participants.some((p) => p.id === currentUser.id)
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
      name: newRoomType === 'group' ? (newRoomName.trim() || '新規グループトーク') : undefined,
      type: newRoomType,
      participants: allParticipants,
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
    const existingIds = new Set(activeRoom.participants.map((p) => p.id));
    const newParticipants = [...activeRoom.participants];

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
          messages: [...r.messages, systemMsg],
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
  const filteredRooms = rooms
    .filter((r) => {
      if (roomFilter === 'group') return r.type === 'group';
      if (roomFilter === 'dm') return r.type === 'dm';
      return true;
    })
    .filter((r) => {
      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      const rName = getRoomName(r).toLowerCase();
      const hasMember = r.participants.some((p) => p.name.toLowerCase().includes(q));
      return rName.includes(q) || hasMember;
    });

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex h-[calc(100vh-8.5rem)] relative">
      {/* 隠しファイルインプット */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileUpload}
        accept="image/*"
        className="hidden"
      />

      {/* ----------------- 左サイドバー (トークルーム一覧) ----------------- */}
      <div className="w-80 border-r border-slate-200 bg-slate-50/50 flex flex-col shrink-0">
        {/* ヘッダー＆新規ルーム作成ボタン */}
        <div className="p-3.5 border-b border-slate-200 bg-white space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-indigo-600" />
              チャットトーク
            </h2>
            <button
              onClick={() => {
                resetCreateForm();
                setShowCreateModal(true);
              }}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              ルーム作成
            </button>
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
              const lastMsg = room.messages[room.messages.length - 1];
              const isActive = activeRoomId === room.id;

              return (
                <button
                  key={room.id}
                  onClick={() => setActiveRoomId(room.id)}
                  className={`w-full flex items-center gap-3 p-3 text-left transition-colors relative ${
                    isActive ? 'bg-indigo-50/70 border-l-4 border-indigo-600' : 'hover:bg-slate-100/70'
                  }`}
                >
                  {getRoomIcon(room)}

                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-baseline mb-0.5">
                      <h4 className={`text-xs font-bold truncate ${isActive ? 'text-indigo-950' : 'text-slate-900'}`}>
                        {getRoomName(room)}
                      </h4>
                      {lastMsg && (
                        <span className="text-[10px] font-medium text-slate-400 shrink-0 ml-1">
                          {new Date(lastMsg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
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
        <div className="flex-1 flex flex-col bg-slate-100/70 relative">
          {/* トークルームヘッダー */}
          <div className="px-5 py-3 border-b border-slate-200 bg-white flex items-center justify-between shadow-2xs z-10 shrink-0">
            <div className="flex items-center gap-3">
              {getRoomIcon(activeRoom)}
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-bold text-slate-900">{getRoomName(activeRoom)}</h2>
                  {activeRoom.type === 'group' && (
                    <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 text-[10px] font-semibold rounded-full border border-indigo-200/60">
                      グループ
                    </span>
                  )}
                </div>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Users className="w-3 h-3 text-slate-400" />
                  メンバー {activeRoom.participants.length}名 :{' '}
                  <span className="truncate max-w-xs text-slate-600">
                    {activeRoom.participants.map((p) => p.name).join(', ')}
                  </span>
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {activeRoom.type === 'group' && (
                <button
                  onClick={() => {
                    setSelectedUserIds([]);
                    setModalSearch('');
                    setShowAddMemberModal(true);
                  }}
                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5"
                  title="メンバーを追加"
                >
                  <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                  メンバー追加
                </button>
              )}
              <button
                onClick={() => setShowInfoSidebar(!showInfoSidebar)}
                className={`p-2 rounded-lg transition-colors ${
                  showInfoSidebar ? 'bg-indigo-50 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                }`}
                title="ルーム詳細"
              >
                <Info className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="flex-1 flex overflow-hidden">
            {/* メッセージ本文エリア (LINEスタイルトーク画面) */}
            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4 bg-[#e2e8f0]/40">
              {activeRoom.messages.map((msg, index) => {
                const isMine = msg.sender.id === currentUser.id;
                const isSystem = msg.id.startsWith('sys_') || msg.id.startsWith('m_init_');

                if (isSystem) {
                  return (
                    <div key={msg.id} className="flex justify-center my-3">
                      <span className="px-3 py-1 bg-slate-200/80 text-slate-600 text-[11px] font-medium rounded-full shadow-2xs">
                        {msg.content}
                      </span>
                    </div>
                  );
                }

                const prevMsg = activeRoom.messages[index - 1];
                const showSenderName = !isMine && (!prevMsg || prevMsg.sender.id !== msg.sender.id || prevMsg.id.startsWith('sys_'));

                return (
                  <div key={msg.id} className={`flex gap-2.5 ${isMine ? 'flex-row-reverse' : 'flex-row'}`}>
                    {/* 相手のアバター */}
                    {!isMine && (
                      <div className="w-8 h-8 shrink-0">
                        {showSenderName ? (
                          <img
                            src={msg.sender.avatarUrl}
                            alt={msg.sender.name}
                            className="w-8 h-8 rounded-full border border-slate-200 object-cover shadow-2xs"
                          />
                        ) : (
                          <div className="w-8 h-8" />
                        )}
                      </div>
                    )}

                    <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[75%]`}>
                      {showSenderName && (
                        <span className="text-[11px] font-bold text-slate-600 mb-1 ml-1">
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
                                <div className={`inline-flex flex-col items-center justify-center p-3.5 rounded-2xl border-2 shadow-md hover:scale-105 transition-transform ${stampDef?.color || 'bg-emerald-500 text-white border-emerald-600'}`}>
                                  <span className="text-3xl mb-1">{stampDef?.icon || '😊'}</span>
                                  <span className="text-sm font-black tracking-wide drop-shadow-xs">{msg.stampText || msg.content}</span>
                                </div>
                              );
                            })()}
                          </div>
                        ) : msg.type === 'image' ? (
                          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm max-w-sm">
                            <div className="relative group cursor-pointer" onClick={() => setLightboxImage(msg.imageUrl || null)}>
                              <img
                                src={msg.imageUrl}
                                alt="添付写真"
                                className="w-full max-h-64 object-cover hover:opacity-95 transition-opacity"
                              />
                              <div className="absolute inset-0 bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                                <Maximize2 className="w-4 h-4" /> 拡大表示
                              </div>
                            </div>
                            {msg.content && msg.content !== '写真を送信しました' && (
                              <div className="p-2.5 text-xs text-slate-800 border-t border-slate-100 whitespace-pre-wrap">
                                {msg.content}
                              </div>
                            )}
                          </div>
                        ) : (
                          // LINE風フキダシ
                          <div
                            className={`px-4 py-2.5 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap break-words shadow-2xs relative ${
                              isMine
                                ? 'bg-[#dcf8c6] text-slate-900 rounded-tr-xs border border-emerald-200/80 font-medium'
                                : 'bg-white text-slate-800 rounded-tl-xs border border-slate-200'
                            }`}
                          >
                            {msg.content}
                          </div>
                        )}

                        {/* 既読 & タイムスタンプ */}
                        <div className={`flex flex-col text-[10px] text-slate-400 shrink-0 mb-0.5 ${isMine ? 'items-end' : 'items-start'}`}>
                          {isMine && (
                            <span className="text-[10px] font-bold text-emerald-600 flex items-center gap-0.5">
                              既読
                            </span>
                          )}
                          <span>
                            {new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>

            {/* ----------------- 右サイドバー (ルーム情報) ----------------- */}
            {showInfoSidebar && (
              <div className="w-64 border-l border-slate-200 bg-white p-4 overflow-y-auto shrink-0 space-y-5">
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <h3 className="text-xs font-bold text-slate-900">トーク詳細</h3>
                  <button onClick={() => setShowInfoSidebar(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div>
                  <h4 className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-2">
                    参加メンバー ({activeRoom.participants.length})
                  </h4>
                  <div className="space-y-2">
                    {activeRoom.participants.map((member) => (
                      <div key={member.id} className="flex items-center gap-2.5 p-1.5 rounded-lg hover:bg-slate-50">
                        <img
                          src={member.avatarUrl}
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
                      </div>
                    ))}
                  </div>
                </div>

                {activeRoom.type === 'group' && (
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
            )}
          </div>

          {/* ----------------- メッセージ入力バー ----------------- */}
          <div className="p-3 bg-white border-t border-slate-200 shrink-0 relative">
            {/* 写真添付プレビューモーダル / ポップアップ */}
            {pendingPhotoUrl && (
              <div className="mb-3 p-3 bg-indigo-50/80 border border-indigo-200 rounded-xl flex items-center gap-3">
                <img src={pendingPhotoUrl} alt="送信プレビュー" className="w-16 h-16 rounded-lg object-cover border border-indigo-200 shrink-0" />
                <div className="flex-1 min-w-0">
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
              <div className="absolute bottom-16 left-4 z-30 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <Smile className="w-4 h-4 text-indigo-600" />
                    スタンプを選択
                  </span>
                  <button onClick={() => setShowStampPicker(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* スタンプカテゴリータブ */}
                <div className="flex gap-1 border-b border-slate-100 pb-2">
                  {STAMP_CATEGORIES.map((cat) => (
                    <button
                      key={cat.id}
                      onClick={() => setActiveStampCategory(cat.id)}
                      className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
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
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 max-h-56 overflow-y-auto p-1">
                  {STAMP_CATEGORIES.find((c) => c.id === activeStampCategory)?.stamps.map((stamp) => (
                    <button
                      key={stamp.id}
                      onClick={() =>
                        handleSendStamp(
                          stamp,
                          STAMP_CATEGORIES.find((c) => c.id === activeStampCategory)?.name || 'スタンプ'
                        )
                      }
                      className={`p-3 rounded-xl border-2 flex flex-col items-center justify-center gap-1 hover:scale-105 transition-all shadow-xs ${stamp.color}`}
                    >
                      <span className="text-2xl">{stamp.icon}</span>
                      <span className="text-xs font-black tracking-wide">{stamp.text}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* 写真選択（サンプルプリセット＆ファイル選択）ポップオーバー */}
            {showPhotoPicker && (
              <div className="absolute bottom-16 left-12 z-30 w-80 bg-white rounded-2xl border border-slate-200 shadow-xl p-3 space-y-3">
                <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                  <span className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <ImageIcon className="w-4 h-4 text-indigo-600" />
                    写真を添付・送信
                  </span>
                  <button onClick={() => setShowPhotoPicker(false)} className="text-slate-400 hover:text-slate-600">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* ファイルアップロードボタン */}
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-xl border border-indigo-200 transition-colors flex items-center justify-center gap-2"
                >
                  <Upload className="w-4 h-4" />
                  パソコン/端末から写真をアップロード
                </button>

                <div className="pt-1">
                  <span className="text-[11px] font-bold text-slate-400 block mb-2">サンプル写真から選択</span>
                  <div className="grid grid-cols-2 gap-2">
                    {PRESET_PHOTOS.map((photo) => (
                      <button
                        key={photo.id}
                        onClick={() => {
                          setPendingPhotoUrl(photo.url);
                          setShowPhotoPicker(false);
                        }}
                        className="group relative rounded-xl overflow-hidden border border-slate-200 aspect-video hover:border-indigo-500 transition-all text-left"
                      >
                        <img src={photo.url} alt={photo.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                        <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-transparent flex items-end p-1.5">
                          <span className="text-[10px] font-bold text-white truncate">{photo.name}</span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* メッセージ入力フォーム */}
            <form onSubmit={handleSendMessage} className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowPhotoPicker(!showPhotoPicker);
                  setShowStampPicker(false);
                }}
                className={`p-2 rounded-full transition-colors ${
                  showPhotoPicker ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                }`}
                title="写真を送信"
              >
                <ImageIcon className="w-5 h-5" />
              </button>

              <button
                type="button"
                onClick={() => {
                  setShowStampPicker(!showStampPicker);
                  setShowPhotoPicker(false);
                }}
                className={`p-2 rounded-full transition-colors ${
                  showStampPicker ? 'bg-indigo-100 text-indigo-600' : 'hover:bg-slate-100 text-slate-500'
                }`}
                title="スタンプを送る"
              >
                <Smile className="w-5 h-5" />
              </button>

              <input
                type="text"
                value={messageText}
                onChange={(e) => setMessageText(e.target.value)}
                placeholder="メッセージを入力..."
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-xs sm:text-sm"
              />

              <button
                type="submit"
                disabled={!messageText.trim()}
                className="p-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-40 disabled:hover:bg-indigo-600 transition-colors shadow-sm shrink-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50 text-slate-400 p-8">
          <MessageSquare className="w-16 h-16 mb-4 opacity-20 text-indigo-600" />
          <p className="font-bold text-slate-600">トークルームを選択してください</p>
          <p className="text-xs text-slate-400 mt-1">「+ ルーム作成」ボタンから新規トークを始められます</p>
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700">
                    メンバーを選択 ({selectedUserIds.length}名選択中)
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-2 mb-2">
                  <select
                    value={modalOffice}
                    onChange={(e) => setModalOffice(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                  >
                    <option value="all">全拠点</option>
                    {offices.map((off) => (
                      <option key={off.id} value={off.name}>{off.name}</option>
                    ))}
                  </select>
                  <select
                    value={modalDivision}
                    onChange={(e) => setModalDivision(e.target.value)}
                    className="px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700"
                  >
                    <option value="all">全部署</option>
                    {divisions.map((div) => (
                      <option key={div.id} value={div.name}>{div.name}</option>
                    ))}
                  </select>
                </div>

                <input
                  type="text"
                  value={modalSearch}
                  onChange={(e) => setModalSearch(e.target.value)}
                  placeholder="名前・部署・拠点名で絞り込み..."
                  className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs mb-2 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                {/* メンバー候補リスト */}
                <div className="max-h-48 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 p-1 bg-slate-50/50">
                  {candidateUsers.map((u) => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? 'bg-indigo-50' : 'hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (newRoomType === 'dm') {
                              setSelectedUserIds([u.id]);
                            } else {
                              if (isSelected) {
                                setSelectedUserIds(selectedUserIds.filter((id) => id !== u.id));
                              } else {
                                setSelectedUserIds([...selectedUserIds, u.id]);
                              }
                            }
                          }}
                          className="w-4 h-4 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500"
                        />
                        <img src={u.avatarUrl} alt={u.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800">{u.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {u.office} / {u.division} {u.position ? `(${u.position})` : ''}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
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
                  disabled={selectedUserIds.length === 0 || (newRoomType === 'group' && !newRoomName.trim())}
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
              <input
                type="text"
                value={modalSearch}
                onChange={(e) => setModalSearch(e.target.value)}
                placeholder="追加するメンバーを検索..."
                className="w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />

              <div className="max-h-60 overflow-y-auto border border-slate-200 rounded-xl divide-y divide-slate-100 p-1 bg-slate-50/50">
                {users
                  .filter((u) => !activeRoom.participants.some((p) => p.id === u.id))
                  .filter((u) => u.name.toLowerCase().includes(modalSearch.toLowerCase()) || (u.division && u.division.includes(modalSearch)))
                  .map((u) => {
                    const isSelected = selectedUserIds.includes(u.id);
                    return (
                      <label
                        key={u.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          isSelected ? 'bg-indigo-50' : 'hover:bg-white'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => {
                            if (isSelected) {
                              setSelectedUserIds(selectedUserIds.filter((id) => id !== u.id));
                            } else {
                              setSelectedUserIds([...selectedUserIds, u.id]);
                            }
                          }}
                          className="w-4 h-4 text-indigo-600 rounded-md border-slate-300 focus:ring-indigo-500"
                        />
                        <img src={u.avatarUrl} alt={u.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-bold text-slate-800">{u.name}</p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {u.office} / {u.division}
                          </p>
                        </div>
                      </label>
                    );
                  })}
              </div>

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
            <img src={lightboxImage} alt="拡大写真" className="max-w-full max-h-[85vh] rounded-xl object-contain shadow-2xl" />
            <button
              onClick={() => setLightboxImage(null)}
              className="absolute -top-10 right-0 p-1.5 bg-white/20 hover:bg-white/40 text-white rounded-full transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
