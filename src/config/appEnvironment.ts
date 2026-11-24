/**
 * 本番環境・開発評価環境（ステージング）のURL解決および環境判定ユーティリティ
 *
 * - 本番環境（一般社員向け）: https://teranago-sns.github.io/po/
 * - 開発・評価環境（管理者向け）: https://micchy-ken.github.io/teranago-sns-new/
 */

export const PRODUCTION_APP_URL = 'https://teranago-sns.github.io/po/';
export const PRODUCTION_APP_BASE_NO_SLASH = 'https://teranago-sns.github.io/po';
export const STAGING_DEV_HOST = 'micchy-ken.github.io';

// App.tsx のURLクリーンアップ（history.replaceState）が実行される前に初期クエリ・ハッシュを退避
const INITIAL_WINDOW_SEARCH =
  typeof window !== 'undefined' ? window.location.search || '' : '';
const INITIAL_WINDOW_HASH =
  typeof window !== 'undefined' ? window.location.hash || '' : '';

const SNS_FRONTEND_HOSTS = new Set([
  'teranago-sns.github.io',
  'micchy-ken.github.io',
  'localhost',
  '127.0.0.1',
]);

/**
 * 現在のアクセス先が旧環境（管理者専用の開発・新機能評価環境）かどうかを判定
 */
export function isStagingDevEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  const host = (window.location.hostname || '').toLowerCase();
  const pathname = window.location.pathname || '';
  return host === STAGING_DEV_HOST || pathname === '/teranago-sns-new' || pathname.startsWith('/teranago-sns-new/');
}

/**
 * 現在のクエリパラメータ・ハッシュを引き継いだ本番環境リダイレクト用URLを生成
 */
export function buildProductionRedirectUrl(): string {
  if (typeof window === 'undefined') return PRODUCTION_APP_URL;
  const search = window.location.search || INITIAL_WINDOW_SEARCH || '';
  const hash = window.location.hash || INITIAL_WINDOW_HASH || '';
  return `${PRODUCTION_APP_URL}${search}${hash}`;
}

/**
 * メール通知・招待・安否確認リンク等を常に本番環境URL（https://teranago-sns.github.io/po/）へ正規化
 * - 開発評価環境やローカル環境から操作・送信した場合でも、社員に届くメールリンクは100%本番URLになる
 */
export function normalizeToProductionUrl(pathParamsOrUrl?: string): string {
  const cleanBase = PRODUCTION_APP_URL;

  if (!pathParamsOrUrl) {
    return cleanBase;
  }

  const trimmed = pathParamsOrUrl.trim();
  if (!trimmed) {
    return cleanBase;
  }

  // 既に絶対URLの場合
  if (/^https?:\/\//i.test(trimmed)) {
    try {
      const parsed = new URL(trimmed);
      const host = parsed.hostname.toLowerCase();
      const isKnownSnsHost = SNS_FRONTEND_HOSTS.has(host) || host.endsWith('.run.app');
      if (!isKnownSnsHost) {
        // 外部サイトのURL等はそのまま維持
        return trimmed;
      }
      // SNSフロントエンドURLであればオリジンとベースパスを本番URLへ統一（クエリ・ハッシュは保持）
      return `${cleanBase}${parsed.search}${parsed.hash}`;
    } catch {
      return cleanBase;
    }
  }

  // 相対パス／クエリパラメータ文字列の場合
  let query = trimmed;
  if (query.startsWith('/?')) {
    query = query.slice(2);
  } else if (query.startsWith('?') || query.startsWith('/')) {
    query = query.slice(1);
  }

  if (!query) {
    return cleanBase;
  }

  if (query.includes('=')) {
    return `${cleanBase}?${query}`;
  }

  return `${cleanBase}${query}`;
}
