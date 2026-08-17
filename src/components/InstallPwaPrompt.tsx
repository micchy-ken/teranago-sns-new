import React, { useState, useEffect } from 'react';
import { Smartphone, Download, X, CheckCircle2 } from 'lucide-react';

export const InstallPwaPrompt: React.FC = () => {
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isStandalone, setIsStandalone] = useState<boolean>(false);
  const [isDismissed, setIsDismissed] = useState<boolean>(false);

  useEffect(() => {
    // Check if already running in standalone PWA mode
    const checkStandalone = () => {
      const isDisplayStandalone = window.matchMedia('(display-mode: standalone)').matches;
      const isNavStandalone = (navigator as any).standalone === true;
      setIsStandalone(isDisplayStandalone || isNavStandalone);
    };

    checkStandalone();

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    console.log(`[PWA] Install prompt outcome: ${outcome}`);
    if (outcome === 'accepted') {
      setDeferredPrompt(null);
    }
  };

  if (isStandalone || isDismissed) {
    return null;
  }

  if (!deferredPrompt) {
    return null;
  }

  return (
    <div className="bg-gradient-to-r from-indigo-600 to-indigo-700 text-white px-4 py-2.5 shadow-md flex items-center justify-between gap-3 text-xs animate-fade-in relative z-30">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="p-1.5 bg-white/20 rounded-lg backdrop-blur-xs shrink-0">
          <Smartphone className="w-4 h-4 text-white" />
        </div>
        <div className="min-w-0">
          <p className="font-bold truncate text-white">社内SNSをスマホアプリとしてインストール</p>
          <p className="text-[11px] text-indigo-100 truncate">ホーム画面に追加してフルスクリーンで快適に使えます</p>
        </div>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <button
          type="button"
          onClick={handleInstallClick}
          className="px-3 py-1.5 bg-white text-indigo-700 hover:bg-indigo-50 font-bold rounded-lg shadow-xs flex items-center gap-1.5 transition-all cursor-pointer active:scale-95 text-xs"
        >
          <Download className="w-3.5 h-3.5" />
          <span>インストール</span>
        </button>

        <button
          type="button"
          onClick={() => setIsDismissed(true)}
          className="p-1 hover:bg-white/20 rounded-lg text-indigo-200 hover:text-white transition-colors cursor-pointer"
          title="閉じる"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
};
