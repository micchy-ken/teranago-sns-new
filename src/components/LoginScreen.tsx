import React, { useState } from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, LogIn, AlertCircle, Eye, EyeOff, ShieldCheck, Sparkles } from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';

interface LoginScreenProps {
  users: User[];
  onLogin: (user: User) => void;
}

export function LoginScreen({ users, onLogin }: LoginScreenProps) {
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedId = (loginId || '').trim();
    const trimmedPw = (password || '').trim();

    if (!trimmedId || !trimmedPw) {
      setError('ユーザーIDとパスワードを入力してください。');
      return;
    }

    const matchedUser = users.find(
      u => u.loginId?.toLowerCase() === trimmedId.toLowerCase() && u.password === trimmedPw
    );

    if (matchedUser) {
      onLogin(matchedUser);
    } else {
      setError('ユーザーIDまたはパスワードが正しくありません。');
    }
  };

  const handleQuickLogin = (user: User) => {
    if (user.loginId && user.password) {
      setLoginId(user.loginId);
      setPassword(user.password);
      onLogin(user);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* Logo & Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">
            TERANAGO 社内ポータル
          </h1>
          <p className="text-sm text-slate-400">
            社内SNS・グループウェアへログインしてください
          </p>
        </div>

        {/* Login Form Card */}
        <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {error && (
            <div className="mb-6 p-3.5 bg-red-500/10 border border-red-500/30 rounded-xl flex items-center gap-3 text-red-400 text-sm">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                ユーザーID
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <UserIcon className="w-5 h-5" />
                </div>
                <input
                  type="text"
                  value={loginId}
                  onChange={e => setLoginId(e.target.value)}
                  placeholder="例: test"
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/80 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2">
                パスワード
              </label>
              <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                  <Lock className="w-5 h-5" />
                </div>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-11 pr-11 py-3 bg-slate-900/80 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 transition-all flex items-center justify-center gap-2 text-sm mt-2 active:scale-[0.99]"
            >
              <LogIn className="w-4 h-4" />
              ログイン
            </button>
          </form>

          {/* Quick Login Accounts list */}
          <div className="mt-8 pt-6 border-t border-slate-700/80">
            <div className="flex items-center gap-2 mb-3 text-xs font-semibold text-slate-400">
              <Sparkles className="w-4 h-4 text-amber-400" />
              <span>デモアカウント（クリックで自動ログイン）</span>
            </div>

            <div className="space-y-2 max-h-56 overflow-y-auto pr-1 scrollbar-thin">
              {users.filter(u => u.loginId !== 'yamamichi').map(u => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => handleQuickLogin(u)}
                  className="w-full flex items-center justify-between p-2.5 bg-slate-900/50 hover:bg-slate-700/60 border border-slate-700/50 rounded-xl transition-all text-left group"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <img
                      src={getAvatarUrl(u.avatarUrl)}
                      alt={u.name}
                      className="w-8 h-8 rounded-full object-cover border border-slate-600 shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-slate-200 truncate group-hover:text-indigo-300">
                        {u.name}
                      </div>
                      <div className="text-[11px] text-slate-400 truncate">
                        ID: <span className="font-mono text-indigo-400">{u.loginId}</span> / PW: <span className="font-mono text-indigo-400">{u.password}</span>
                      </div>
                    </div>
                  </div>
                  <span className="text-[11px] px-2 py-1 bg-slate-800 group-hover:bg-indigo-600 text-slate-300 group-hover:text-white rounded-lg transition-colors shrink-0 ml-2">
                    ログイン
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="text-center mt-6 text-xs text-slate-500">
          © TERANAGO SNS Portal System
        </div>
      </div>
    </div>
  );
}
