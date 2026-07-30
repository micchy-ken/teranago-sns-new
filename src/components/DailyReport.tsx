import React, { useState } from 'react';
import { DailyReport, User } from '../types';
import { FileText, Plus, Calendar, X, Save } from 'lucide-react';

interface DailyReportProps {
  reports: DailyReport[];
  onAddReport?: (reportData: {
    date: string;
    tasks: string;
    results: string;
    issues: string;
    tomorrowPlan: string;
  }) => void;
  currentUser: User;
}

export function DailyReportView({ reports, onAddReport, currentUser }: DailyReportProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [tasks, setTasks] = useState('');
  const [results, setResults] = useState('');
  const [issues, setIssues] = useState('');
  const [tomorrowPlan, setTomorrowPlan] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!tasks.trim()) return;

    if (onAddReport) {
      onAddReport({
        date: new Date(date).toISOString(),
        tasks,
        results,
        issues,
        tomorrowPlan,
      });
    }

    // Reset form
    setTasks('');
    setResults('');
    setIssues('');
    setTomorrowPlan('');
    setIsOpen(false);
  };

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
      <div className="p-5 border-b border-slate-200 bg-slate-50 shrink-0 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            日報
          </h2>
          <p className="text-xs text-slate-500 mt-1">今日の業務内容と明日の予定を記録しましょう</p>
        </div>
        <button 
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm"
        >
          <Plus className="w-4 h-4"/>
          日報を作成
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/30">
        <div className="max-w-4xl mx-auto space-y-6">
          {reports.length === 0 ? (
            <div className="text-center py-12 text-slate-400 bg-white border border-slate-100 rounded-xl">
              日報はまだ登録されていません
            </div>
          ) : (
            reports.map(report => (
              <div key={report.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
                <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <img src={report.author?.avatarUrl || 'https://i.pravatar.cc/150'} alt={report.author?.name} className="w-8 h-8 rounded-full border border-slate-200" />
                    <div>
                      <div className="text-sm font-bold text-slate-900">{report.author?.name || '匿名'}</div>
                      <div className="text-xs text-slate-500">{report.author?.department || '未設定'}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-semibold text-slate-600 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-sm">
                    <Calendar className="w-4 h-4 text-indigo-500" />
                    {new Date(report.date).toLocaleDateString('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' })}
                  </div>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">本日の業務内容</h4>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-slate-50 p-4 rounded-lg border border-slate-100 h-full">
                      {report.tasks}
                    </div>
                  </div>
                  <div className="space-y-6">
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">成果・気づき</h4>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-emerald-50/50 p-4 rounded-lg border border-emerald-100/50">
                        {report.results || '特になし'}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">課題・問題点</h4>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-rose-50/50 p-4 rounded-lg border border-rose-100/50">
                        {report.issues || '特になし'}
                      </div>
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">明日の予定</h4>
                      <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-indigo-50/50 p-4 rounded-lg border border-indigo-100/50">
                        {report.tomorrowPlan || '特になし'}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Creation Modal */}
      {isOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl w-full max-w-2xl shadow-xl border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <h3 className="font-bold text-slate-800 flex items-center gap-2">
                <FileText className="w-5 h-5 text-indigo-500" />
                新規日報作成
              </h3>
              <button onClick={() => setIsOpen(false)} className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">対象日付</label>
                <input 
                  type="date" 
                  value={date} 
                  onChange={e => setDate(e.target.value)} 
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">本日の業務内容 <span className="text-rose-500">*</span></label>
                <textarea 
                  rows={4} 
                  value={tasks} 
                  onChange={e => setTasks(e.target.value)} 
                  placeholder="実施した作業や進捗を記入してください" 
                  required
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">成果・気づき</label>
                <textarea 
                  rows={2} 
                  value={results} 
                  onChange={e => setResults(e.target.value)} 
                  placeholder="得られた結果や工夫した点など" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">課題・問題点</label>
                <textarea 
                  rows={2} 
                  value={issues} 
                  onChange={e => setIssues(e.target.value)} 
                  placeholder="直面している課題やサポートが必要な点など" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">明日の予定</label>
                <textarea 
                  rows={2} 
                  value={tomorrowPlan} 
                  onChange={e => setTomorrowPlan(e.target.value)} 
                  placeholder="明日予定している作業項目" 
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                />
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-end gap-3">
                <button 
                  type="button" 
                  onClick={() => setIsOpen(false)} 
                  className="px-4 py-2 border border-slate-200 text-slate-600 rounded-lg text-sm font-semibold hover:bg-slate-50 transition-colors"
                >
                  キャンセル
                </button>
                <button 
                  type="submit" 
                  className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  <Save className="w-4 h-4" />
                  登録する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

