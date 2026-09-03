import { ComponentType, lazy, LazyExoticComponent } from 'react';

/**
 * 新バージョン配信によるチャンクロードエラー（Failed to fetch dynamically imported module等）
 * を自動検知し、安全に最新版の再取得またはリロードを試みるラッパー
 */
export function lazyWithRetry<T extends ComponentType<any>>(
  componentImport: () => Promise<{ default: T } | { [key: string]: any }>
): LazyExoticComponent<T> {
  return lazy(async () => {
    const pageAlreadyRefreshed = JSON.parse(
      window.sessionStorage.getItem('retry-lazy-refreshed') || 'false'
    );

    try {
      const component = await componentImport();
      // 読み込みが正常に成功した場合はフラグをクリア
      window.sessionStorage.setItem('retry-lazy-refreshed', 'false');
      
      if ('default' in component) {
        return component as { default: T };
      }
      return { default: Object.values(component)[0] as T };
    } catch (error: any) {
      const errorMsg = (error?.message || '') + ' ' + (error?.stack || '') + ' ' + String(error);
      const isChunkLoadError =
        errorMsg.includes('Failed to fetch dynamically imported module') ||
        errorMsg.includes('Importing a module script failed') ||
        errorMsg.includes('error loading dynamically imported module') ||
        errorMsg.includes('Loading chunk') ||
        errorMsg.includes('CSS chunk load failed');

      if (isChunkLoadError) {
        if (!pageAlreadyRefreshed) {
          // 直近で自動リロードしていない場合、フラグを立てて即座に最新版を取得
          window.sessionStorage.setItem('retry-lazy-refreshed', 'true');
          window.location.reload();
          // リロードが走るまでの待機Promiseを返す
          return new Promise<{ default: T }>(() => {});
        }
      }

      // 自動リロード済みの場合や他のエラーの場合はエラーを投げてErrorBoundaryに任せる
      throw error;
    }
  });
}
