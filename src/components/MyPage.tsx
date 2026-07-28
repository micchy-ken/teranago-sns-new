import React, { useState } from 'react';
import { User, Post, WorkflowApplication } from '../types';
import { User as UserIcon, Building2, Mail, Calendar as CalendarIcon, MessageSquare, FileText, Bell, Link as LinkIcon, Check, Sparkles, HelpCircle, X, Settings } from 'lucide-react';

interface MyPageProps {
  user: User;
  myPosts: Post[];
  myApplications: WorkflowApplication[];
  onUpdateUser?: (updatedUser: User) => void;
}

export function MyPage({ user, myPosts, myApplications, onUpdateUser }: MyPageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [icalUrlInput, setIcalUrlInput] = useState(user.icalUrl || '');
  const [nameInput, setNameInput] = useState(user.name);
  const [departmentInput, setDepartmentInput] = useState(user.department);
  const [emailInput, setEmailInput] = useState(user.email || 'kensuke@example.com');
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateUser) {
      onUpdateUser({
        ...user,
        name: nameInput,
        department: departmentInput,
        email: emailInput,
        icalUrl: icalUrlInput.trim(),
      });
    }
    setIsEditing(false);
    setSaveSuccessMessage('プロフィールとカレンダー連携設定を更新しました');
    setTimeout(() => {
      setSaveSuccessMessage(null);
    }, 4000);
  };

  const handleSetSampleIcal = () => {
    setIcalUrlInput('sample://work-schedule.ics');
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/30 rounded-xl border border-slate-200 h-[calc(100vh-8rem)]">
      <div className="bg-indigo-600 h-32 w-full"></div>
      
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-16 pb-12">
        {saveSuccessMessage && (
          <div className="mb-4 p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold rounded-xl shadow-sm flex items-center justify-between animate-fadeIn">
            <div className="flex items-center gap-2">
              <Check className="w-5 h-5 text-emerald-600 shrink-0" />
              <span>{saveSuccessMessage}</span>
            </div>
            <button 
              onClick={() => setSaveSuccessMessage(null)}
              className="text-emerald-500 hover:text-emerald-700 p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}

        {/* Profile Card */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-6 mb-8 relative">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6">
            <img 
              src={user.avatarUrl} 
              alt={user.name} 
              className="w-32 h-32 rounded-full border-4 border-white shadow-md bg-white -mt-12 sm:mt-0 object-cover"
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
                  {user.email || 'kensuke@example.com'}
                </div>
                <div className="flex items-center gap-1.5">
                  <CalendarIcon className="w-4 h-4 text-slate-400" />
                  入社: 2022年4月
                </div>
              </div>

              {/* iCal Status Badge */}
              <div className="mt-4 flex items-center justify-center sm:justify-start gap-2">
                {user.icalUrl ? (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-indigo-50 border border-indigo-200 text-indigo-700 text-xs font-medium rounded-full">
                    <LinkIcon className="w-3.5 h-3.5 text-indigo-500" />
                    iCalカレンダー連携済み
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 border border-amber-200 text-amber-700 text-xs font-medium rounded-full">
                    <HelpCircle className="w-3.5 h-3.5 text-amber-500" />
                    iCal未設定
                  </span>
                )}
              </div>
            </div>
            <div className="mt-4 sm:mt-0">
               <button 
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm flex items-center gap-2"
               >
                 <Settings className="w-4 h-4" />
                 設定 / プロフィール編集
               </button>
            </div>
          </div>
        </div>

        {/* iCal Quick Settings Box */}
        <div className="bg-gradient-to-r from-indigo-900 to-slate-900 rounded-xl p-6 text-white mb-8 shadow-md relative overflow-hidden">
          <div className="absolute top-0 right-0 p-8 opacity-10 pointer-events-none">
            <CalendarIcon className="w-48 h-48 text-white" />
          </div>
          <div className="relative z-10 max-w-2xl">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2.5 py-0.5 bg-indigo-500/30 border border-indigo-400/30 text-indigo-200 text-xs font-semibold rounded-full flex items-center gap-1">
                <Sparkles className="w-3 h-3 text-indigo-300" />
                カレンダー同期機能
              </span>
            </div>
            <h2 className="text-lg font-bold mb-2">外部iCal(ICS) カレンダー連携</h2>
            <p className="text-slate-300 text-xs leading-relaxed mb-4">
              GoogleカレンダーやOutlook、Appleカレンダーなどの iCal/ICS URL を登録すると、個人の外部予定が社内カレンダーに自動でまとめて表示されます。
            </p>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <input 
                type="text" 
                value={icalUrlInput}
                onChange={(e) => setIcalUrlInput(e.target.value)}
                placeholder="https://... または webcal://... のiCal URLを入力"
                className="flex-1 bg-slate-800/80 border border-slate-700 rounded-lg px-3.5 py-2 text-sm text-white placeholder-slate-400 focus:outline-none focus:border-indigo-400 focus:ring-1 focus:ring-indigo-400"
              />
              <button 
                onClick={(e) => {
                  handleSaveProfile(e);
                }}
                className="px-5 py-2 bg-indigo-500 hover:bg-indigo-600 text-white text-sm font-bold rounded-lg transition-colors shadow shrink-0"
              >
                連携URLを保存
              </button>
            </div>
            <div className="mt-3 flex items-center justify-between text-xs text-slate-400">
              <span>※ webcal:// や https:// で始まるiCal公開URLに対応しています</span>
              <button 
                type="button"
                onClick={handleSetSampleIcal}
                className="text-indigo-300 hover:text-white underline text-xs transition-colors"
              >
                サンプルiCal URLをセット(動作テスト)
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

      {/* Edit Profile & iCal Modal */}
      {isEditing && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-lg w-full p-6 animate-fadeIn">
            <div className="flex items-center justify-between pb-4 border-b border-slate-100 mb-5">
              <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-600" />
                プロフィール・カレンダー連携設定
              </h2>
              <button 
                onClick={() => setIsEditing(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">氏名</label>
                <input 
                  type="text" 
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">所属部署 / 肩書</label>
                <input 
                  type="text" 
                  value={departmentInput}
                  onChange={(e) => setDepartmentInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">メールアドレス</label>
                <input 
                  type="email" 
                  value={emailInput}
                  onChange={(e) => setEmailInput(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  required
                />
              </div>

              <div className="pt-2 border-t border-slate-100">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <LinkIcon className="w-4 h-4 text-indigo-600" />
                    iCalカレンダー連携 URL (.ics)
                  </label>
                  <button 
                    type="button"
                    onClick={handleSetSampleIcal}
                    className="text-xs text-indigo-600 hover:underline font-medium"
                  >
                    サンプルURL入力
                  </button>
                </div>
                <input 
                  type="text" 
                  value={icalUrlInput}
                  onChange={(e) => setIcalUrlInput(e.target.value)}
                  placeholder="https://calendar.google.com/calendar/ical/.../basic.ics"
                  className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <p className="text-[11px] text-slate-500 mt-1.5 leading-normal">
                  Googleカレンダー「カレンダーの設定」→「iCal形式の秘密のアドレス」や、Outlook/Appleカレンダーの公開iCal URLを設定してください。
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-4 border-t border-slate-100 mt-6">
                <button 
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 text-sm font-semibold rounded-lg hover:bg-slate-50 transition-colors"
                >
                  キャンセル
                </button>
                <button 
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold rounded-lg transition-colors shadow-sm"
                >
                  設定を保存
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
