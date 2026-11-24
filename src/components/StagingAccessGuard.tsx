import React, { useEffect, useState } from 'react';
import {
  ExternalLink,
  FlaskConical,
  LogOut,
  ArrowRight,
  Info,
  ShieldAlert,
} from 'lucide-react';
import {
  PRODUCTION_APP_URL,
  buildProductionRedirectUrl,
} from '../config/appEnvironment';

/**
 * 管理者向け：開発・評価環境（micchy-ken.github.io）利用中の常時識別バー
 */
export function StagingDevBanner() {
  const productionUrl = buildProductionRedirectUrl();

  return (
    <div className="w-full bg-amber-950 text-amber-100 border-b border-amber-700/70 px-3 py-1.5 text-[11px] font-bold flex items-center justify-between gap-2 z-50 relative">
      <div className="flex items-center gap-1.5 min-w-0">
        <FlaskConical className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span className="truncate">
          開発・新機能評価環境（管理者専用・本番DB接続中）
        </span>
      </div>
      <a
        href={productionUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 border border-amber-400/40 whitespace-nowrap shrink-0 transition-colors"
      >
        <span>本番サイトを開く</span>
        <ExternalLink className="w-3 h-3" />
      </a>
    </div>
  );
}

/**
 * 未ログイン画面向け：開発・評価環境にアクセスした一般社員を本番URLへ案内するバナー
 */
export function StagingLoginNotice() {
  const productionUrl = buildProductionRedirectUrl();

  return (
    <div className="mb-5 p-4 rounded-2xl bg-amber-500/15 border border-amber-400/40 text-left space-y-2.5 shadow-lg">
      <div className="flex items-start gap-2.5">
        <FlaskConical className="w-5 h-5 text-amber-300 shrink-0 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs font-extrabold text-amber-200">
            こちらは開発・評価専用環境（管理者向け）です
          </p>
          <p className="text-[11px] text-amber-100/90 leading-relaxed mt-0.5">
            一般社員の方は新しい本番サイトをご利用ください。管理者の方はそのまま下のフォームからログインできます。
          </p>
        </div>
      </div>
      <a
        href={productionUrl}
        className="w-full py-2.5 px-3 bg-amber-400 hover:bg-amber-300 text-slate-950 font-extrabold text-xs rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-xs"
      >
        <span>本番サイト（TERAPO）へ移動する</span>
        <ArrowRight className="w-3.5 h-3.5" />
      </a>
    </div>
  );
}

interface StagingRedirectScreenProps {
  userName?: string;
  onLogout: () => void;
}

/**
 * ログイン済み一般社員が旧環境（開発用）を開いた際の本番自動誘導画面
 */
export function StagingRedirectScreen({ userName, onLogout }: StagingRedirectScreenProps) {
  const [countdown, setCountdown] = useState<number>(5);
  const [autoRedirectEnabled, setAutoRedirectEnabled] = useState<boolean>(true);
  const productionUrl = buildProductionRedirectUrl();

  useEffect(() => {
    if (!autoRedirectEnabled) return;
    if (countdown <= 0) {
      window.location.replace(productionUrl);
      return;
    }
    const timer = window.setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [countdown, autoRedirectEnabled, productionUrl]);

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4">
      <div className="w-full max-w-lg bg-slate-800/95 border border-slate-700 rounded-3xl p-6 sm:p-8 shadow-2xl space-y-6">
        <div className="text-center space-y-2.5">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-500/20 border border-indigo-400/30 text-indigo-300 mx-auto">
            <ShieldAlert className="w-7 h-7" />
          </div>
          <h1 className="text-xl font-black text-white tracking-tight">
            本番サイトへ移行しました
          </h1>
          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            {userName ? `${userName} 様、` : ''}現在アクセス中のURLは管理者向けの開発・評価専用環境です。<br />
            通常業務は新しい本番サイトをご利用ください。
          </p>
        </div>

        <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-slate-700/80 space-y-1.5">
          <p className="text-[11px] font-bold text-slate-400">新しい本番URL</p>
          <p className="font-mono text-xs text-indigo-300 break-all select-all">
            {PRODUCTION_APP_URL}
          </p>
        </div>

        <div className="space-y-2.5">
          <a
            href={productionUrl}
            className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-extrabold text-sm rounded-xl shadow-lg shadow-indigo-600/25 flex items-center justify-center gap-2 transition-colors"
          >
            <span>今すぐ本番サイトを開く</span>
            <ExternalLink className="w-4 h-4" />
          </a>

          {autoRedirectEnabled ? (
            <div className="flex items-center justify-center gap-3 text-xs text-slate-400">
              <span className="tabular-nums">
                {countdown}秒後に本番サイトへ自動的に移動します...
              </span>
              <button
                type="button"
                onClick={() => setAutoRedirectEnabled(false)}
                className="text-slate-300 hover:text-white underline cursor-pointer"
              >
                停止
              </button>
            </div>
          ) : (
            <p className="text-center text-xs text-slate-400">
              自動移動を停止しました。上のボタンから本番サイトを開いてください。
            </p>
          )}
        </div>

        <div className="p-4 rounded-2xl bg-indigo-950/50 border border-indigo-500/25 space-y-2 text-xs text-slate-300">
          <div className="flex items-center gap-1.5 font-bold text-indigo-200">
            <Info className="w-4 h-4 shrink-0" />
            <span>切り替え時のお願い</span>
          </div>
          <ul className="list-disc pl-4 space-y-1 text-[11px] text-slate-300/90 leading-relaxed">
            <li>ブラウザのブックマークを新しい本番URLへ変更してください。</li>
            <li>スマホ・PCのホーム画面アイコン（PWA）は旧アイコンを削除し、本番サイトから再追加してください。</li>
            <li>本番サイトで初回ログイン後、プッシュ通知をONにしてください。</li>
          </ul>
        </div>

        <div className="pt-2 border-t border-slate-700/70 flex justify-center">
          <button
            type="button"
            onClick={onLogout}
            className="inline-flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>ログアウト（管理者アカウントで再ログイン）</span>
          </button>
        </div>
      </div>
    </div>
  );
}
