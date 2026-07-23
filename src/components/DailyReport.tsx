import React from 'react';
import { DailyReport } from '../types';
import { FileText, Plus, Calendar } from 'lucide-react';
import { currentUser } from '../data/mockData';

interface DailyReportProps {
  reports: DailyReport[];
}

export function DailyReportView({ reports }: DailyReportProps) {
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
        <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
          <Plus className="w-4 h-4"/>
          日報を作成
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/30">
        <div className="max-w-4xl mx-auto space-y-6">
          {reports.map(report => (
            <div key={report.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden shadow-sm">
              <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                <div className="flex items-center gap-3">
                  <img src={report.author.avatarUrl} alt={report.author.name} className="w-8 h-8 rounded-full border border-slate-200" />
                  <div>
                    <div className="text-sm font-bold text-slate-900">{report.author.name}</div>
                    <div className="text-xs text-slate-500">{report.author.department}</div>
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
                      {report.results}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">課題・問題点</h4>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-rose-50/50 p-4 rounded-lg border border-rose-100/50">
                      {report.issues}
                    </div>
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2">明日の予定</h4>
                    <div className="text-sm text-slate-700 whitespace-pre-wrap leading-relaxed bg-indigo-50/50 p-4 rounded-lg border border-indigo-100/50">
                      {report.tomorrowPlan}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
