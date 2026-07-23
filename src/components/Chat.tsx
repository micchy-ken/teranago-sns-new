import React, { useState } from 'react';
import { ChatRoom, User } from '../types';
import { Search, Send, User as UserIcon, Users, MessageSquare } from 'lucide-react';
import { currentUser } from '../data/mockData';

interface ChatProps {
  rooms: ChatRoom[];
}

export function Chat({ rooms }: ChatProps) {
  const [activeRoomId, setActiveRoomId] = useState<string>(rooms[0]?.id || '');
  const [message, setMessage] = useState('');

  const activeRoom = rooms.find(r => r.id === activeRoomId);

  const getRoomName = (room: ChatRoom) => {
    if (room.name) return room.name;
    const others = room.participants.filter(p => p.id !== currentUser.id);
    return others.map(o => o.name).join(', ');
  };

  const getRoomIcon = (room: ChatRoom) => {
    if (room.type === 'group') return <Users className="w-5 h-5 text-indigo-500" />;
    const other = room.participants.find(p => p.id !== currentUser.id);
    return other ? (
      <img src={other.avatarUrl} alt={other.name} className="w-8 h-8 rounded-full border border-slate-200" />
    ) : (
      <UserIcon className="w-5 h-5 text-slate-500" />
    );
  };

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex h-[calc(100vh-8rem)]">
      {/* Sidebar - Room List */}
      <div className="w-1/3 sm:w-80 border-r border-slate-200 bg-slate-50 flex flex-col shrink-0">
        <div className="p-4 border-b border-slate-200">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input 
              type="text" 
              placeholder="ルームを検索..." 
              className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm"
            />
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {rooms.map(room => (
            <button
              key={room.id}
              onClick={() => setActiveRoomId(room.id)}
              className={`w-full flex items-center gap-3 p-4 text-left transition-colors border-b border-slate-100 ${
                activeRoomId === room.id ? 'bg-indigo-50/50' : 'hover:bg-slate-100'
              }`}
            >
              <div className="shrink-0 flex items-center justify-center w-10 h-10 bg-white rounded-full border border-slate-200 overflow-hidden">
                {getRoomIcon(room)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className={`text-sm font-bold truncate ${activeRoomId === room.id ? 'text-indigo-900' : 'text-slate-800'}`}>
                    {getRoomName(room)}
                  </h4>
                  <span className="text-[10px] font-medium text-slate-400 shrink-0 ml-2">
                    {new Date(room.lastUpdated).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {room.messages[room.messages.length - 1]?.content || 'まだメッセージがありません'}
                </p>
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Main Chat Area */}
      {activeRoom ? (
        <div className="flex-1 flex flex-col bg-white">
          <div className="px-6 py-4 border-b border-slate-200 bg-white flex items-center gap-3 shadow-sm z-10 shrink-0">
             <div className="shrink-0 flex items-center justify-center w-10 h-10 bg-slate-50 rounded-full border border-slate-200 overflow-hidden">
                {getRoomIcon(activeRoom)}
              </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">{getRoomName(activeRoom)}</h2>
              <p className="text-xs text-slate-500">
                {activeRoom.participants.length} 人の参加者
              </p>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-6 space-y-6 bg-slate-50/30">
            {activeRoom.messages.map(msg => {
              const isMine = msg.sender.id === currentUser.id;
              return (
                <div key={msg.id} className={`flex gap-3 ${isMine ? 'flex-row-reverse' : ''}`}>
                  {!isMine && (
                    <img src={msg.sender.avatarUrl} alt={msg.sender.name} className="w-8 h-8 rounded-full border border-slate-200 shrink-0" />
                  )}
                  <div className={`flex flex-col ${isMine ? 'items-end' : 'items-start'} max-w-[70%]`}>
                    {!isMine && <span className="text-xs font-semibold text-slate-500 mb-1 ml-1">{msg.sender.name}</span>}
                    <div className={`px-4 py-2.5 rounded-2xl ${
                      isMine 
                        ? 'bg-indigo-600 text-white rounded-tr-none' 
                        : 'bg-white border border-slate-200 text-slate-800 rounded-tl-none shadow-sm'
                    }`}>
                      <p className="text-sm whitespace-pre-wrap leading-relaxed">{msg.content}</p>
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 mx-1">
                      {new Date(msg.createdAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>

          <div className="p-4 bg-white border-t border-slate-200 shrink-0">
            <form onSubmit={e => e.preventDefault()} className="flex items-center gap-2">
              <input 
                type="text" 
                value={message}
                onChange={e => setMessage(e.target.value)}
                placeholder="メッセージを入力..." 
                className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-full focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all text-sm"
              />
              <button 
                type="submit"
                disabled={!message.trim()}
                className="p-2.5 bg-indigo-600 text-white rounded-full hover:bg-indigo-700 disabled:opacity-50 disabled:hover:bg-indigo-600 transition-colors shadow-sm"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      ) : (
        <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 text-slate-400">
          <MessageSquare className="w-16 h-16 mb-4 opacity-20" />
          <p className="font-medium">ルームを選択してください</p>
        </div>
      )}
    </div>
  );
}
