import React, { useState } from 'react';
import { X } from 'lucide-react';
import { ApplicationType, WorkflowApplication } from '../types';
import { currentUser } from '../data/mockData';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (application: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'>) => void;
}

const typeLabels: Record<ApplicationType, string> = {
  business_trip: '出張申請',
  inventory_issue: '出庫申請',
  purchase_order: '発注申請',
  other: 'その他',
};

export function ApplicationModal({ isOpen, onClose, onSave }: ApplicationModalProps) {
  const [type, setType] = useState<ApplicationType>('business_trip');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  // Dummy approver selection
  const [approverId, setApproverId] = useState('u4'); 

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !description) return;

    onSave({
      type,
      title,
      description,
      amount: amount !== '' ? Number(amount) : undefined,
      quantity: quantity !== '' ? Number(quantity) : undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
      applicant: currentUser,
      approver: {
        id: approverId,
        name: approverId === 'u4' ? '田中 部長' : '鈴木 課長',
        department: '開発統括部',
        avatarUrl: `https://i.pravatar.cc/150?u=${approverId}`,
      }
    });

    onClose();
    // Reset form
    setType('business_trip');
    setTitle('');
    setDescription('');
    setAmount('');
    setQuantity('');
    setStartDate('');
    setEndDate('');
    setApproverId('u4');
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto ring-1 ring-slate-900/5">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">新規申請</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">申請種別</label>
            <select 
              value={type} 
              onChange={e => setType(e.target.value as ApplicationType)} 
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            >
              {(Object.keys(typeLabels) as ApplicationType[]).map(key => (
                <option key={key} value={key}>{typeLabels[key]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">タイトル</label>
            <input 
              type="text" 
              required 
              value={title} 
              onChange={e => setTitle(e.target.value)} 
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" 
              placeholder="〇〇カンファレンス参加、など" 
            />
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">詳細説明</label>
            <textarea 
              required
              value={description} 
              onChange={e => setDescription(e.target.value)} 
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors resize-none h-24" 
              placeholder="申請の理由や詳細な内容..."
            />
          </div>

          {(type === 'purchase_order' || type === 'business_trip' || type === 'other') && (
             <div>
               <label className="block text-sm font-semibold text-slate-700 mb-1.5">金額（円）</label>
               <input 
                 type="number" 
                 value={amount} 
                 onChange={e => setAmount(e.target.value ? Number(e.target.value) : '')} 
                 className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" 
                 placeholder="0" 
                 min="0"
               />
             </div>
          )}

          {type === 'inventory_issue' && (
             <div>
               <label className="block text-sm font-semibold text-slate-700 mb-1.5">数量</label>
               <input 
                 type="number" 
                 value={quantity} 
                 onChange={e => setQuantity(e.target.value ? Number(e.target.value) : '')} 
                 className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" 
                 placeholder="0" 
                 min="1"
               />
             </div>
          )}

          {type === 'business_trip' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">開始日</label>
                <input 
                  type="date" 
                  value={startDate} 
                  onChange={e => setStartDate(e.target.value)} 
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors text-sm" 
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">終了日</label>
                <input 
                  type="date" 
                  value={endDate} 
                  onChange={e => setEndDate(e.target.value)} 
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors text-sm" 
                />
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">承認者</label>
            <select 
              value={approverId} 
              onChange={e => setApproverId(e.target.value)} 
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
            >
              <option value="u4">田中 部長</option>
              <option value="u8">鈴木 課長</option>
            </select>
          </div>

          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">キャンセル</button>
            <button type="submit" className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">申請する</button>
          </div>
        </form>
      </div>
    </div>
  );
}
