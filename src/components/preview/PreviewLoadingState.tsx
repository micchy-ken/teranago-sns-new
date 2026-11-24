import React from 'react';
import { Loader2 } from 'lucide-react';
import { FileFetchProgress, formatPreviewBytes } from '../../utils/filePreviewCache';

interface PreviewLoadingStateProps {
  title: string;
  subtitle?: string;
  progress?: FileFetchProgress | null;
  accentClass?: string;
  barClass?: string;
  dark?: boolean;
}

export function PreviewLoadingState({
  title,
  subtitle = 'ファイルを読み込んでいます',
  progress,
  accentClass = 'text-indigo-600',
  barClass = 'bg-indigo-600',
  dark = false,
}: PreviewLoadingStateProps) {
  const hasPercent = progress && typeof progress.percent === 'number';
  const loaded = progress?.loaded ?? 0;
  const total = progress?.total ?? null;

  return (
    <div
      className={`flex flex-col items-center justify-center p-10 h-full min-h-[320px] w-full ${
        dark ? 'text-slate-200' : 'text-slate-500'
      }`}
    >
      <Loader2 className={`w-8 h-8 animate-spin mb-3 ${accentClass}`} />
      <p className={`text-xs font-bold ${dark ? 'text-white' : 'text-slate-700'}`}>{title}</p>
      <p className={`text-[11px] mt-1 ${dark ? 'text-slate-400' : 'text-slate-400'}`}>{subtitle}</p>

      {/* ダウンロード進捗バー（初回取得時） */}
      {progress && !progress.fromCache && (
        <div className="w-full max-w-xs mt-4 space-y-1.5">
          <div
            className={`w-full h-2 rounded-full overflow-hidden ${
              dark ? 'bg-slate-800' : 'bg-slate-200'
            }`}
          >
            {hasPercent ? (
              <div
                className={`h-full rounded-full transition-all duration-150 ${barClass}`}
                style={{ width: `${Math.max(2, Math.min(100, progress.percent!))}%` }}
              />
            ) : (
              <div className={`h-full w-1/2 rounded-full animate-pulse ${barClass} opacity-80`} />
            )}
          </div>
          <div
            className={`flex items-center justify-between text-[11px] font-semibold tabular-nums ${
              dark ? 'text-slate-300' : 'text-slate-500'
            }`}
          >
            <span>
              {hasPercent
                ? `${progress.percent}%`
                : loaded > 0
                ? 'ダウンロード中...'
                : '接続中...'}
            </span>
            <span>
              {total
                ? `${formatPreviewBytes(loaded)} / ${formatPreviewBytes(total)}`
                : loaded > 0
                ? `${formatPreviewBytes(loaded)} 取得済み`
                : ''}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
