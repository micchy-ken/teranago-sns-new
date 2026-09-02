import React from 'react';
import { Loader2 } from 'lucide-react';

interface LazyTabFallbackProps {
  message?: string;
}

export function LazyTabFallback({ message = '読み込み中...' }: LazyTabFallbackProps) {
  return (
    <div className="w-full flex-1 flex flex-col items-center justify-center min-h-[360px] bg-white rounded-2xl border border-slate-200/80 shadow-xs p-8">
      <div className="flex flex-col items-center gap-3">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        <p className="text-sm font-medium text-slate-500">{message}</p>
      </div>
    </div>
  );
}
