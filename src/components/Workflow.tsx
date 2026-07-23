import React, { useState } from 'react';
import { WorkflowApplication, ApplicationType, ApplicationStatus } from '../types';
import { FileText, CheckCircle2, XCircle, Clock, Plus, ArrowRight, User } from 'lucide-react';
import { ApplicationModal } from './ApplicationModal';

interface WorkflowProps {
  applications: WorkflowApplication[];
  onAddApplication: (application: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'>) => void;
}

const typeLabels: Record<ApplicationType, string> = {
  business_trip: '出張申請',
  inventory_issue: '出庫申請',
  purchase_order: '発注申請',
  other: 'その他',
};

const statusConfig: Record<ApplicationStatus, { label: string, color: string, icon: React.ReactNode }> = {
  pending: { label: '申請中', color: 'bg-yellow-100 text-yellow-800 border-yellow-200', icon: <Clock className="w-3.5 h-3.5" /> },
  approved: { label: '承認済み', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected: { label: '却下', color: 'bg-red-100 text-red-800 border-red-200', icon: <XCircle className="w-3.5 h-3.5" /> },
};

export function Workflow({ applications, onAddApplication }: WorkflowProps) {
  const [filter, setFilter] = useState<'my_applications' | 'pending_approval'>('my_applications');
  const [isModalOpen, setIsModalOpen] = useState(false);

  // In a real app, we would filter based on current user id.
  // For mock, we assume all are 'my_applications'.
  const filteredApps = applications.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-slate-900/5 overflow-hidden flex flex-col min-h-[600px] lg:h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-slate-50 shrink-0">
        <div className="flex gap-2 p-1 bg-slate-200/50 rounded-lg">
          <button 
            onClick={() => setFilter('my_applications')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              filter === 'my_applications' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            自分の申請
          </button>
          <button 
            onClick={() => setFilter('pending_approval')}
            className={`px-4 py-2 text-sm font-semibold rounded-md transition-all ${
              filter === 'pending_approval' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            承認待ち
            <span className="ml-2 px-1.5 py-0.5 rounded-full bg-indigo-100 text-indigo-700 text-[10px]">0</span>
          </button>
        </div>

        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm w-full sm:w-auto justify-center">
          <Plus className="w-4 h-4"/>
          新規申請
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/30">
        <div className="max-w-4xl mx-auto space-y-4">
          {filteredApps.length > 0 ? (
            filteredApps.map(app => (
              <div key={app.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-200 transition-colors shadow-sm group">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {typeLabels[app.type]}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${statusConfig[app.status].color}`}>
                        {statusConfig[app.status].icon}
                        {statusConfig[app.status].label}
                      </span>
                      <span className="text-xs text-slate-400">
                        {formatDate(app.createdAt)} 申請
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors">
                      {app.title}
                    </h3>
                  </div>
                  <div className="text-right sm:text-right flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-lg">
                    <span className="text-xs text-slate-500 font-medium">承認者</span>
                    <div className="flex items-center gap-2">
                      <img src={app.approver.avatarUrl} alt={app.approver.name} className="w-6 h-6 rounded-full border border-slate-200" />
                      <span className="text-sm font-semibold text-slate-800">{app.approver.name}</span>
                    </div>
                  </div>
                </div>

                <p className="text-sm text-slate-600 line-clamp-2 mb-4 leading-relaxed">
                  {app.description}
                </p>

                <div className="flex flex-wrap items-center gap-x-6 gap-y-2 pt-4 border-t border-slate-100">
                  {app.amount !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">金額</span>
                      <span className="text-sm font-bold text-slate-800">{formatCurrency(app.amount)}</span>
                    </div>
                  )}
                  {app.quantity !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">数量</span>
                      <span className="text-sm font-bold text-slate-800">{app.quantity}</span>
                    </div>
                  )}
                  {app.startDate && app.endDate && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">期間</span>
                      <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                        {formatDate(app.startDate)} <ArrowRight className="w-3 h-3 text-slate-400" /> {formatDate(app.endDate)}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-slate-800 font-semibold mb-1">申請がありません</h3>
              <p className="text-slate-500 text-sm">現在、表示できる申請データはありません。</p>
            </div>
          )}
        </div>
      </div>

      <ApplicationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={onAddApplication} 
      />
    </div>
  );
}
