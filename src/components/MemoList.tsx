import React, { useState } from 'react';
import { Memo } from '../types';
import { Phone, Check, Clock, Plus, Building2 } from 'lucide-react';

interface MemoListProps {
  memos: Memo[];
}

export function MemoList({ memos: initialMemos }: MemoListProps) {
  const [memos, setMemos] = useState(initialMemos);
  const [filter, setFilter] = useState<'all' | 'unread' | 'read'>('unread');

  const filteredMemos = memos.filter(m => filter === 'all' || m.status === filter);

  const toggleStatus = (id: string) => {
    setMemos(memos.map(m => m.id === id ? { ...m, status: m.status === 'unread' ? 'read' : 'unread' } : m));
  };

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
      <div className="p-5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
        <div className="flex gap-2 p-1 bg-slate-200/50 rounded-lg">
          <button onClick={() => setFilter('unread')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${filter === 'unread' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            未対応
          </button>
          <button onClick={() => setFilter('read')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${filter === 'read' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            対応済み
          </button>
          <button onClick={() => setFilter('all')} className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${filter === 'all' ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
            すべて
          </button>
        </div>
        <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4"/>
          伝言を残す
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/30">
        <div className="max-w-4xl mx-auto space-y-4">
          {filteredMemos.length > 0 ? (
            filteredMemos.map(memo => (
              <div key={memo.id} className={`bg-white border rounded-xl p-5 shadow-sm transition-all flex gap-4 items-start ${memo.status === 'unread' ? 'border-l-4 border-l-yellow-400 border-slate-200' : 'border-slate-200 opacity-70'}`}>
                <div className={`p-3 rounded-full shrink-0 ${memo.status === 'unread' ? 'bg-yellow-50 text-yellow-600' : 'bg-slate-100 text-slate-400'}`}>
                  <Phone className="w-6 h-6" />
                </div>
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <div className="flex items-center gap-2 mb-1">
                        {memo.status === 'unread' ? (
                           <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-yellow-100 text-yellow-800">
                             <Clock className="w-3 h-3"/> 未対応
                           </span>
                        ) : (
                           <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-600">
                             <Check className="w-3 h-3"/> 対応済み
                           </span>
                        )}
                        <span className="text-xs text-slate-400">
                          {new Date(memo.createdAt).toLocaleString('ja-JP')}
                        </span>
                      </div>
                      <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                        {memo.fromName} 様 <span className="text-sm font-normal text-slate-500 flex items-center gap-1"><Building2 className="w-3.5 h-3.5"/> {memo.fromCompany || '所属なし'}</span>
                      </h3>
                    </div>
                    <button 
                      onClick={() => toggleStatus(memo.id)}
                      className={`px-3 py-1.5 text-xs font-semibold rounded-md border transition-colors ${
                        memo.status === 'unread' 
                          ? 'border-indigo-200 text-indigo-700 hover:bg-indigo-50' 
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      {memo.status === 'unread' ? '対応済みにする' : '未対応に戻す'}
                    </button>
                  </div>
                  <div className="p-3 bg-slate-50 rounded-lg text-sm text-slate-700 whitespace-pre-wrap border border-slate-100 leading-relaxed">
                    {memo.content}
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <Phone className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-slate-800 font-semibold mb-1">伝言メモがありません</h3>
              <p className="text-slate-500 text-sm">現在、表示できる伝言メモはありません。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
