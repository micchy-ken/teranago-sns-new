/**
 * プレビュー用ビューアーライブラリのバックグラウンド先読み（プリフェッチ）ユーティリティ
 * 
 * 目的:
 * トップページの初期表示を妨げることなく、画面表示が落ち着いた後のアイドル時間（または数秒後）に
 * PDF/Excel/Word/テキスト用のビューアーチャンクを裏でこっそりダウンロード・キャッシュしておくことで、
 * ユーザーが初めてプレビューボタンを押した時の待ち時間（クルクル）をゼロにして即時表示できるようにする。
 */

let isPrefetchStarted = false;

export function schedulePreviewPrefetch(delayMs: number = 3000): void {
  if (typeof window === 'undefined') return;
  if (isPrefetchStarted) return;
  isPrefetchStarted = true;

  const startPrefetch = () => {
    // 優先度の低い非同期タスクとして順次ロードし、ネットワークやCPUの急激なスパイクを防ぐ
    const prefetchTasks = [
      () => import('../components/preview/PdfViewer'),
      () => import('../components/preview/ExcelViewer'),
      () => import('../components/preview/DocxViewer'),
      () => import('../components/preview/TextViewer'),
      () => import('../components/preview/ImageViewer'),
    ];

    // 順次少しずつ先読み（各タスク間に小休止を入れてメイン通信を妨げない）
    let currentTask = 0;
    const runNext = () => {
      if (currentTask >= prefetchTasks.length) return;
      const task = prefetchTasks[currentTask++];
      task()
        .catch(() => {
          // オフライン時などのエラーは静かに握りつぶす
        })
        .finally(() => {
          if ('requestIdleCallback' in window) {
            (window as any).requestIdleCallback(runNext, { timeout: 1500 });
          } else {
            setTimeout(runNext, 400);
          }
        });
    };

    runNext();
  };

  // ブラウザの描画や初期API通信がひと段落したタイミングで開始
  if ('requestIdleCallback' in window) {
    (window as any).requestIdleCallback(() => {
      setTimeout(startPrefetch, delayMs);
    }, { timeout: delayMs + 2000 });
  } else {
    setTimeout(startPrefetch, delayMs);
  }
}
