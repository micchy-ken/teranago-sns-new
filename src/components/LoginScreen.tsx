import React, { useState } from 'react';
import { User } from '../types';
import { Lock, User as UserIcon, LogIn, AlertCircle, Eye, EyeOff, ShieldCheck } from 'lucide-react';

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

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* 背景装飾 */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      <div className="w-full max-w-md z-10">
        {/* ロゴ & ヘッダー */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4">
            <ShieldCheck className="w-9 h-9 text-white" />
          </div>
          <h1 className="text-2xl font-black tracking-tight text-white mb-2">
            TERANAGO 社内ポータル
          </h1>
          <p className="text-sm text-slate-400 font-medium">
            社内SNS・グループウェアへログインしてください
          </p>
        </div>

        {/* ログインフォームカード */}
        <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
          {error && (
            <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-bold animate-in fade-in duration-150">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
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
                  placeholder="ユーザーIDを入力"
                  autoFocus
                  autoComplete="username"
                  className="w-full pl-11 pr-4 py-3 bg-slate-900/80 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
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
                  placeholder="パスワードを入力"
                  autoComplete="current-password"
                  className="w-full pl-11 pr-11 py-3 bg-slate-900/80 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                  title={showPassword ? 'パスワードを隠す' : 'パスワードを表示する'}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 transition-all flex items-center justify-center gap-2 text-sm mt-3 active:scale-[0.99] cursor-pointer"
            >
              <LogIn className="w-4 h-4" />
              ログイン
            </button>
          </form>
        </div>

        <div className="text-center mt-6 text-xs text-slate-500 font-medium">
          © TERANAGO SNS Portal System
        </div>
      </div>
    </div>
  );
}
