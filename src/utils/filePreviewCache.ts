/**
 * 添付ファイル・文書プレビュー用 インメモリ LRU キャッシュユーティリティ
 *
 * - URL（認証トークン等の揮発クエリを除外した正規化キー）または明示キーで Blob 本体を保持
 * - 件数上限（最大20件）および総容量上限（200MB）のLRU方式で古いキャッシュから自動破棄
 * - ObjectURL はキャッシュに保持せず、各ビューアーが表示時に都度生成しクローズ時に revokeObjectURL する
 *   ことで、メモリリーク防止とキャッシュ元データ（Blob）のライフサイクル分離を両立
 * - 同一ファイルへの同時リクエスト統合（In-Flight Deduplication）＆ ReadableStream 進捗通知対応
 * - ログアウト／セッション失効時に自動でインメモリキャッシュを全消去（機密保護）
 */

export const MAX_PREVIEW_CACHE_ENTRIES = 20;
export const MAX_PREVIEW_CACHE_BYTES = 200 * 1024 * 1024; // 200 MB
export const MAX_SINGLE_CACHED_FILE_BYTES = 180 * 1024 * 1024; // 単体180MB超はキャッシュせず直接返却

export interface PreviewCacheEntry {
  key: string;
  blob: Blob;
  contentType: string;
  size: number;
  cachedAt: number;
}

export interface FileFetchProgress {
  loaded: number;
  total: number | null;
  percent: number | null;
  fromCache: boolean;
}

export interface FetchCachedBlobResult {
  blob: Blob;
  contentType: string;
  size: number;
  fromCache: boolean;
}

interface InFlightRequest {
  promise: Promise<FetchCachedBlobResult>;
  listeners: Set<(progress: FileFetchProgress) => void>;
  lastProgress: FileFetchProgress;
}

// LRUキャッシュ本体（Mapの挿入順を利用：先頭が最古、末尾が最新）
const previewCacheMap = new Map<string, PreviewCacheEntry>();
let totalCachedBytes = 0;

// 同一キーへの同時ダウンロード統合用マップ
const inFlightRequests = new Map<string, InFlightRequest>();

// キャッシュキー正規化時に除外する揮発・表示専用クエリパラメータ
const VOLATILE_QUERY_PARAMS = new Set([
  'token',
  'download',
  'inline',
  'userid',
  'username',
  'userdepartment',
]);

/**
 * バイト数を人間が読みやすい形式（KB / MB）に整形
 */
export function formatPreviewBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * 認証トークン(?token=...)やダウンロード用フラグを除いた一貫性のあるキャッシュキーを生成
 */
export function normalizePreviewCacheKey(url: string, explicitKey?: string): string {
  if (explicitKey && explicitKey.trim()) {
    return `key:${explicitKey.trim()}`;
  }
  const trimmed = (url || '').trim();
  if (!trimmed) return '';

  try {
    const baseOrigin =
      typeof window !== 'undefined' && window.location?.origin
        ? window.location.origin
        : 'http://localhost';
    const parsed = new URL(trimmed, baseOrigin);

    const keptParams: [string, string][] = [];
    parsed.searchParams.forEach((val, key) => {
      if (!VOLATILE_QUERY_PARAMS.has(key.toLowerCase())) {
        keptParams.push([key, val]);
      }
    });
    keptParams.sort(([aKey, aVal], [bKey, bVal]) =>
      aKey === bKey ? aVal.localeCompare(bVal) : aKey.localeCompare(bKey)
    );

    const normalizedSearch =
      keptParams.length > 0
        ? `?${keptParams.map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&')}`
        : '';

    return `${parsed.origin}${parsed.pathname}${normalizedSearch}`;
  } catch {
    // URLパースできない場合は ?token= のみ除去してフォールバック
    return trimmed
      .replace(/([?&])token=[^&#]*/gi, '$1')
      .replace(/[?&]+$/, '');
  }
}

/**
 * キャッシュからエントリを同期取得（ヒット時はLRU最新位置へ移動）
 */
export function getCachedPreviewEntry(url: string, explicitKey?: string): PreviewCacheEntry | null {
  const key = normalizePreviewCacheKey(url, explicitKey);
  if (!key) return null;

  const entry = previewCacheMap.get(key);
  if (!entry) return null;

  // LRU更新：一度削除して末尾へ再挿入することで「最も最近使用された」位置へ移動
  previewCacheMap.delete(key);
  previewCacheMap.set(key, entry);
  return entry;
}

/**
 * キャッシュに Blob を保存（件数20件・合計200MBの上限を超過する場合は古い順から自動破棄）
 */
export function setCachedPreviewBlob(
  url: string,
  blob: Blob,
  contentType?: string,
  explicitKey?: string
): void {
  const key = normalizePreviewCacheKey(url, explicitKey);
  if (!key || !blob) return;

  const size = blob.size || 0;
  // 単体で上限を超える超巨大ファイルは他キャッシュ全消去を防ぐため保存をスキップ
  if (size <= 0 || size > MAX_SINGLE_CACHED_FILE_BYTES) {
    return;
  }

  // 既存エントリがあれば一旦差し替え用に容量を差し引く
  const existing = previewCacheMap.get(key);
  if (existing) {
    totalCachedBytes = Math.max(0, totalCachedBytes - existing.size);
    previewCacheMap.delete(key);
  }

  const resolvedType = contentType || blob.type || 'application/octet-stream';
  const entry: PreviewCacheEntry = {
    key,
    blob,
    contentType: resolvedType,
    size,
    cachedAt: Date.now(),
  };

  previewCacheMap.set(key, entry);
  totalCachedBytes += size;

  // 件数上限または総容量上限を超える間、最古のエントリから順に破棄
  while (
    previewCacheMap.size > MAX_PREVIEW_CACHE_ENTRIES ||
    totalCachedBytes > MAX_PREVIEW_CACHE_BYTES
  ) {
    const oldestKey = previewCacheMap.keys().next().value;
    if (!oldestKey || oldestKey === key) break;
    const oldestEntry = previewCacheMap.get(oldestKey);
    previewCacheMap.delete(oldestKey);
    if (oldestEntry) {
      totalCachedBytes = Math.max(0, totalCachedBytes - oldestEntry.size);
    }
  }
}

/**
 * 特定キーのキャッシュを削除
 */
export function removeCachedPreviewEntry(url: string, explicitKey?: string): void {
  const key = normalizePreviewCacheKey(url, explicitKey);
  if (!key) return;
  const existing = previewCacheMap.get(key);
  if (existing) {
    totalCachedBytes = Math.max(0, totalCachedBytes - existing.size);
    previewCacheMap.delete(key);
  }
}

/**
 * 全インメモリプレビューキャッシュをクリア（ログアウト・セッション失効時用）
 */
export function clearPreviewCache(): void {
  previewCacheMap.clear();
  totalCachedBytes = 0;
  inFlightRequests.clear();
}

/**
 * キャッシュを確認し、あれば即座に Blob を返却。
 * なければネットワークから ReadableStream で進捗を通知しながら取得し、キャッシュ保存後に返却。
 */
export async function fetchFileBlobWithCache(
  url: string,
  options?: {
    cacheKey?: string;
    forceRefresh?: boolean;
    expectedMimeType?: string;
    rejectHtmlError?: boolean;
    onProgress?: (progress: FileFetchProgress) => void;
  }
): Promise<FetchCachedBlobResult> {
  if (!url) {
    throw new Error('ファイルURLが指定されていません');
  }

  // data: や blob: のローカルURLはそのままBlob化して返却（キャッシュ対象外）
  if (url.startsWith('data:') || url.startsWith('blob:')) {
    const res = await fetch(url);
    const blob = await res.blob();
    const contentType = options?.expectedMimeType || blob.type || 'application/octet-stream';
    const finalBlob =
      options?.expectedMimeType && blob.type !== options.expectedMimeType
        ? new Blob([blob], { type: options.expectedMimeType })
        : blob;
    options?.onProgress?.({
      loaded: finalBlob.size,
      total: finalBlob.size,
      percent: 100,
      fromCache: true,
    });
    return {
      blob: finalBlob,
      contentType,
      size: finalBlob.size,
      fromCache: true,
    };
  }

  const cacheKey = normalizePreviewCacheKey(url, options?.cacheKey);

  // 1. キャッシュ確認（ヒットすれば通信ゼロで即返却）
  if (!options?.forceRefresh) {
    const cached = getCachedPreviewEntry(url, options?.cacheKey);
    if (cached) {
      const resultBlob =
        options?.expectedMimeType && cached.blob.type !== options.expectedMimeType
          ? new Blob([cached.blob], { type: options.expectedMimeType })
          : cached.blob;
      options?.onProgress?.({
        loaded: cached.size,
        total: cached.size,
        percent: 100,
        fromCache: true,
      });
      return {
        blob: resultBlob,
        contentType: options?.expectedMimeType || cached.contentType,
        size: cached.size,
        fromCache: true,
      };
    }
  }

  // 2. 同一ファイルの進行中リクエストがあれば合流（二重ダウンロード防止）
  const existingInFlight = !options?.forceRefresh ? inFlightRequests.get(cacheKey) : undefined;
  if (existingInFlight) {
    if (options?.onProgress) {
      existingInFlight.listeners.add(options.onProgress);
      options.onProgress(existingInFlight.lastProgress);
    }
    const sharedResult = await existingInFlight.promise;
    if (options?.expectedMimeType && sharedResult.blob.type !== options.expectedMimeType) {
      return {
        ...sharedResult,
        blob: new Blob([sharedResult.blob], { type: options.expectedMimeType }),
        contentType: options.expectedMimeType,
      };
    }
    return sharedResult;
  }

  // 3. 新規ネットワーク取得（ReadableStream によるリアルタイム進捗計測）
  const listeners = new Set<(progress: FileFetchProgress) => void>();
  if (options?.onProgress) {
    listeners.add(options.onProgress);
  }

  const initialProgress: FileFetchProgress = {
    loaded: 0,
    total: null,
    percent: null,
    fromCache: false,
  };

  const emitProgress = (progress: FileFetchProgress) => {
    const tracker = inFlightRequests.get(cacheKey);
    if (tracker) {
      tracker.lastProgress = progress;
    }
    listeners.forEach((cb) => {
      try {
        cb(progress);
      } catch {
        // ignore listener errors
      }
    });
  };

  const fetchPromise = (async (): Promise<FetchCachedBlobResult> => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status} ${response.statusText || ''}`.trim());
      }

      const headerContentType = (response.headers.get('content-type') || '').trim();
      if (options?.rejectHtmlError && headerContentType.toLowerCase().includes('text/html')) {
        const errSnippet = (await response.text()).slice(0, 120);
        throw new Error(`サーバーから予期しないHTMLエラー応答が返されました (${errSnippet})`);
      }

      const contentLengthHeader = response.headers.get('content-length');
      const parsedTotal = contentLengthHeader ? parseInt(contentLengthHeader, 10) : NaN;
      const totalBytes = Number.isFinite(parsedTotal) && parsedTotal > 0 ? parsedTotal : null;

      emitProgress({
        loaded: 0,
        total: totalBytes,
        percent: totalBytes ? 0 : null,
        fromCache: false,
      });

      const resolvedMime =
        options?.expectedMimeType ||
        (headerContentType ? headerContentType.split(';')[0].trim() : '') ||
        'application/octet-stream';

      let finalBlob: Blob;

      if (response.body && typeof response.body.getReader === 'function') {
        const reader = response.body.getReader();
        const chunks: BlobPart[] = [];
        let loaded = 0;
        let lastEmitAt = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            // BlobPart互換のArrayBufferスライスとして安全に保持
            chunks.push(new Uint8Array(value));
            loaded += value.byteLength;

            const now = Date.now();
            if (now - lastEmitAt >= 60) {
              lastEmitAt = now;
              const pct = totalBytes ? Math.min(99, Math.round((loaded / totalBytes) * 100)) : null;
              emitProgress({
                loaded,
                total: totalBytes,
                percent: pct,
                fromCache: false,
              });
            }
          }
        }

        finalBlob = new Blob(chunks, { type: resolvedMime });
      } else {
        const rawBlob = await response.blob();
        finalBlob =
          resolvedMime && rawBlob.type !== resolvedMime
            ? new Blob([rawBlob], { type: resolvedMime })
            : rawBlob;
      }

      emitProgress({
        loaded: finalBlob.size,
        total: finalBlob.size,
        percent: 100,
        fromCache: false,
      });

      // LRUキャッシュに Blob 本体を保存（ObjectURL は保存しない）
      setCachedPreviewBlob(url, finalBlob, resolvedMime, options?.cacheKey);

      return {
        blob: finalBlob,
        contentType: resolvedMime,
        size: finalBlob.size,
        fromCache: false,
      };
    } finally {
      inFlightRequests.delete(cacheKey);
    }
  })();

  inFlightRequests.set(cacheKey, {
    promise: fetchPromise,
    listeners,
    lastProgress: initialProgress,
  });

  return fetchPromise;
}

/**
 * Blob から端末へのダウンロードを実行（一時 ObjectURL のみ生成し自動解放、元 Blob は維持）
 */
export function downloadBlobToDevice(blob: Blob, fileName: string): void {
  const tempObjUrl = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = tempObjUrl;
  link.download = fileName || 'download';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  setTimeout(() => {
    URL.revokeObjectURL(tempObjUrl);
  }, 15000);
}

/**
 * キャッシュに該当ファイルがあればサーバーへ再通信せずキャッシュ済み Blob から即ダウンロード。
 * キャッシュになければ通常のURLダウンロードへフォールバック。
 * 返り値: キャッシュからダウンロードできた場合 true
 */
export function downloadFileUsingCacheIfAvailable(
  url: string,
  fileName: string,
  explicitKey?: string
): boolean {
  const cached = getCachedPreviewEntry(url, explicitKey);
  if (cached) {
    downloadBlobToDevice(cached.blob, fileName);
    return true;
  }

  if (url) {
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName || 'download';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
  return false;
}

/**
 * Blob を日本語環境対応（UTF-8 優先・不正バイト列時は Shift-JIS フォールバック）でテキスト化
 */
export async function decodeBlobAsText(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  try {
    const utf8Decoder = new TextDecoder('utf-8', { fatal: true });
    return utf8Decoder.decode(buffer);
  } catch {
    try {
      const sjisDecoder = new TextDecoder('shift-jis');
      return sjisDecoder.decode(buffer);
    } catch {
      return new TextDecoder().decode(buffer);
    }
  }
}

// ログアウト・セッション失効イベントを検知して機密キャッシュを自動消去
if (typeof window !== 'undefined' && !(window as any).__teranagoPreviewCacheListenerInstalled) {
  const handleClear = () => clearPreviewCache();
  window.addEventListener('teranago_auth_cleared', handleClear);
  window.addEventListener('auth_session_expired', handleClear);
  (window as any).__teranagoPreviewCacheListenerInstalled = true;
}
