import React from 'react';
import { User, Post, WorkflowApplication } from '../types';
import { User as UserIcon, Building2, Mail, Calendar, MessageSquare, FileText, Bell } from 'lucide-react';

interface MyPageProps {
  user: User;
  myPosts: Post[];
  myApplications: WorkflowApplication[];
}

export function MyPage({ user, myPosts, myApplications }: MyPageProps) {
  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/30 rounded-xl border border-slate-200 h-[calc(100vh-8rem)]">
      <div className="bg-indigo-600 h-32 w-full"></div>
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 pb-12">
        {/* Profile Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <img 
              src={user.avatarUrl} 
              alt={user.name} 
              className="w-32 h-32 rounded-full border-4 border-white shadow-md bg-white -mt-12 sm:mt-0"
            />
            <div className="flex-1 text-center sm:text-left mt-2 sm:mt-0">
              <h1 className="text-2xl font-bold text-slate-900">{user.name}</h1>
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4 mt-3 text-sm text-slate-600">
                <div className="flex items-center gap-1.5">
                  <Building2 className="w-4 h-4 text-slate-400" />
                  {user.department}
                </div>
                <div className="flex items-center gap-1.5">
                  <Mail className="w-4 h-4 text-slate-400" />
                  kensuke@example.com
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="w-4 h-4 text-slate-400" />
                  入社: 2022年4月
                </div>
              </div>
            </div>
            <div className="mt-4 sm:mt-0">
               <button className="px-4 py-2 bg-white border border-slate-200 text-slate-700 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors shadow-sm">
                 プロフィール編集
               </button>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-8">
            {/* My Activities - Posts */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <MessageSquare className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-bold text-slate-800">最近の投稿</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {myPosts.length > 0 ? myPosts.map(post => (
                  <div key={post.id} className="p-4 hover:bg-slate-50 transition-colors">
                    <p className="text-sm text-slate-800 line-clamp-2 mb-2">{post.content}</p>
                    <div className="flex items-center gap-2 text-[10px] text-slate-400">
                      <span>{new Date(post.createdAt).toLocaleDateString('ja-JP')}</span>
                      <span>•</span>
                      <span>{post.likes} いいね</span>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-500 text-sm">投稿はありません</div>
                )}
              </div>
            </div>

            {/* My Activities - Applications */}
            <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-500" />
                <h2 className="text-sm font-bold text-slate-800">最近の申請履歴</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {myApplications.length > 0 ? myApplications.map(app => (
                  <div key={app.id} className="p-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800 mb-1">{app.title}</h3>
                      <div className="text-xs text-slate-500">{new Date(app.createdAt).toLocaleDateString('ja-JP')}</div>
                    </div>
                    <div>
                      <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        app.status === 'approved' ? 'bg-emerald-100 text-emerald-700' :
                        app.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-red-100 text-red-700'
                      }`}>
                        {app.status === 'approved' ? '承認済' : app.status === 'pending' ? '申請中' : '却下'}
                      </span>
                    </div>
                  </div>
                )) : (
                  <div className="p-8 text-center text-slate-500 text-sm">申請履歴はありません</div>
                )}
              </div>
            </div>
          </div>

          <div className="space-y-8">
             {/* Notifications */}
             <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-bold text-slate-800">通知</h2>
                </div>
                <span className="bg-rose-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">3</span>
              </div>
              <div className="divide-y divide-slate-100">
                <div className="p-4 hover:bg-slate-50 transition-colors cursor-pointer bg-blue-50/30">
                  <p className="text-xs text-slate-800 font-medium mb-1">新しい伝言メモがあります</p>
                  <span className="text-[10px] text-slate-400">10分前</span>
                </div>
                <div className="p-4 hover:bg-slate-50 transition-colors cursor-pointer bg-blue-50/30">
                  <p className="text-xs text-slate-800 font-medium mb-1">出張申請が承認されました</p>
                  <span className="text-[10px] text-slate-400">2時間前</span>
                </div>
                <div className="p-4 hover:bg-slate-50 transition-colors cursor-pointer bg-blue-50/30">
                  <p className="text-xs text-slate-800 font-medium mb-1">高橋さんがあなたの投稿にいいねしました</p>
                  <span className="text-[10px] text-slate-400">昨日</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
