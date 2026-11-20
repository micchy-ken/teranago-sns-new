/**
 * ============================================================================
 * 認証セッション管理・API認可（IDOR対策）・ログイン試行制限・厳格CORS/パス検証モジュール
 * ファイルパス: routes/authSession.js
 * 最終更新: 2026年11月19日 (新GitHub Organization: https://teranago-sns.github.io CORS許可対応版)
 * 役割:
 *  1. 暗号論的セッショントークンの発行・SHA-256ハッシュ検証・失効管理
 *     （メモリ＋ data/sessions.json の二重永続化・有効期限24時間スライディング更新）
 *  2. ログイン試行制限（アカウント＋IP単位: 5回連続失敗で15分間ロックアウト）
 *  3. 全 /api/* およびファイル配信系エンドポイント向け Bearer トークン認証ミドルウェア (requireApiAuth)
 *  4. トークン由来の操作者特定 (req.authUser) と管理者権限・本人確認（IDOR防止）
 *  5. 厳格な完全一致 CORS オリジン検証 (createStrictCorsOptions / isAllowedOrigin)
 *  6. ファイル名・ファイルパスのパストラバーサル (../) 検証 (isSafeFilename / resolveSafeChildPath)
 * ============================================================================
 */

import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const DATA_DIR = path.join(process.cwd(), 'data');
const SESSIONS_FILE = path.join(DATA_DIR, 'sessions.json');

// セッション有効期限: 24時間（アクセス時に自動延長）
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// ファイル保存の間引き用タイマー
let persistTimer = null;

// メモリ上のセッションストア: Map<tokenHash, SessionRecord>
// SessionRecord: { tokenHash, userId, loginId, name, isAdmin, role, officeId, divisionId, createdAt, expiresAt, lastAccessedAt }
const sessionStore = new Map();

// ログイン試行制限ストア: Map<key, { count, firstFailedAt, lockedUntil }>
const loginAttemptStore = new Map();
const LOGIN_MAX_ATTEMPTS = 5;
const LOGIN_WINDOW_MS = 15 * 60 * 1000; // 15分
const LOGIN_LOCKOUT_MS = 15 * 60 * 1000; // 15分ロック

// ============================================================================
// 厳格な完全一致 CORS オリジン許可リスト (優先4対策)
// ============================================================================
const STATIC_ALLOWED_ORIGINS = [
  'https://teranago-sns.github.io', // 本番フロントエンド (Organization: teranago-sns / Repo: po)
  'https://micchy-ken.github.io',   // 旧フロントエンド（移行期間互換用・移行完了後に削除可）
  'https://sns.teranago.synology.me',
  'http://sns.teranago.synology.me',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001',
  'http://127.0.0.1:5173'
];

function buildAllowedOriginSet() {
  const set = new Set(STATIC_ALLOWED_ORIGINS);
  const envCandidates = [
    process.env.APP_URL,
    process.env.SHARED_APP_URL,
    ...(process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : [])
  ];
  for (const raw of envCandidates) {
    if (!raw || typeof raw !== 'string') continue;
    const trimmed = raw.trim();
    if (!trimmed) continue;
    try {
      const parsed = new URL(trimmed);
      if (parsed.origin && parsed.origin !== 'null') {
        set.add(parsed.origin);
      }
    } catch {
      // URL形式でない場合は末尾スラッシュを除いた完全一致文字列として登録
      set.add(trimmed.replace(/\/+$/, ''));
    }
  }
  return set;
}

/**
 * リクエストの Origin ヘッダーが許可リストに完全一致するか判定
 * （部分一致 includes やワイルドカード許可は一切行わない）
 */
export function isAllowedOrigin(origin) {
  if (!origin) return true; // 同一オリジンまたは非ブラウザリクエスト（認証は requireApiAuth で強制）
  const normalized = String(origin).trim();
  const allowedSet = buildAllowedOriginSet();
  return allowedSet.has(normalized);
}

/**
 * Express cors ミドルウェア用の厳格オプション生成
 */
export function createStrictCorsOptions() {
  return {
    origin: (origin, callback) => {
      if (isAllowedOrigin(origin)) {
        callback(null, true);
      } else {
        callback(null, false);
      }
    },
    credentials: true,
    methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'X-Requested-With',
      'Range',
      'Origin',
      'X-Auth-Token',
      'X-Target-Year-Month',
      'x-target-year-month'
    ],
    exposedHeaders: ['Content-Range', 'X-Content-Range', 'Accept-Ranges', 'Content-Length']
  };
}

// ============================================================================
// パストラバーサル（../）防止・ファイル名検証ヘルパー
// ============================================================================

/**
 * 単一ファイル名パラメータ（:filename）が安全か検証
 * - 空文字、nullバイト、スラッシュ(/, \)、親ディレクトリ参照(..)を含む場合は false
 */
export function isSafeFilename(rawFilename) {
  if (!rawFilename || typeof rawFilename !== 'string') return false;
  let decoded = rawFilename;
  try {
    decoded = decodeURIComponent(rawFilename);
  } catch {
    return false;
  }
  if (
    !decoded ||
    decoded === '.' ||
    decoded === '..' ||
    decoded.includes('\0') ||
    decoded.includes('..') ||
    decoded.includes('/') ||
    decoded.includes('\\')
  ) {
    return false;
  }
  return path.basename(decoded) === decoded;
}

/**
 * ベースディレクトリ配下の相対パスを安全に解決し、ディレクトリトラバーサルを防止
 * ベースディレクトリ外を指す場合や .. を含む場合は null を返す
 */
export function resolveSafeChildPath(baseDir, rawRelativePath) {
  if (!baseDir || !rawRelativePath || typeof rawRelativePath !== 'string') return null;
  let decoded = rawRelativePath;
  try {
    decoded = decodeURIComponent(rawRelativePath);
  } catch {
    decoded = rawRelativePath;
  }
  if (decoded.includes('\0')) return null;

  // バックスラッシュを正規化し、パスセグメントに '..' が含まれていれば即拒否
  const normalizedSlashes = decoded.replace(/\\/g, '/').replace(/^\/+/, '');
  const segments = normalizedSlashes.split('/').filter(Boolean);
  if (segments.length === 0 || segments.some((seg) => seg === '..' || seg === '.')) {
    return null;
  }

  const resolvedBase = path.resolve(baseDir);
  const resolvedTarget = path.resolve(resolvedBase, segments.join(path.sep));
  if (
    resolvedTarget !== resolvedBase &&
    !resolvedTarget.startsWith(resolvedBase + path.sep)
  ) {
    return null;
  }
  return resolvedTarget;
}

/**
 * リクエストURL・クエリ・ボディにパストラバーサル（../ 等）が含まれていないか検証
 */
function hasPathTraversalAttempt(req) {
  const candidates = [req.path, req.originalUrl?.split('?')[0]];
  if (req.params && typeof req.params === 'object') {
    for (const val of Object.values(req.params)) {
      if (typeof val === 'string') candidates.push(val);
    }
  }
  if (req.query && typeof req.query === 'object') {
    for (const key of ['filename', 'file', 'path', 'folder', 'fileUrl']) {
      if (typeof req.query[key] === 'string') {
        candidates.push(req.query[key]);
      }
    }
  }
  if (req.body && typeof req.body === 'object') {
    for (const key of ['filename', 'file', 'path', 'folder', 'fileUrl']) {
      if (typeof req.body[key] === 'string') {
        candidates.push(req.body[key]);
      }
    }
  }

  for (const raw of candidates) {
    if (!raw || typeof raw !== 'string') continue;
    let once = raw;
    let twice = raw;
    try {
      once = decodeURIComponent(raw);
      twice = decodeURIComponent(once);
    } catch {
      // ignore decode error and inspect raw
    }
    for (const str of [raw, once, twice]) {
      if (str.includes('\0')) return true;
      const slashNorm = str.replace(/\\/g, '/');
      if (
        slashNorm === '..' ||
        slashNorm.startsWith('../') ||
        slashNorm.endsWith('/..') ||
        slashNorm.includes('/../')
      ) {
        return true;
      }
    }
  }

  // :filename パラメータが存在する場合はスラッシュや .. を厳格拒否
  if (req.params && typeof req.params.filename === 'string') {
    if (!isSafeFilename(req.params.filename)) {
      return true;
    }
  }

  return false;
}

// ============================================================================
// トークン管理（発行・検証・失効）
// ============================================================================

/**
 * トークン文字列の SHA-256 ハッシュ値を算出（生トークンはサーバーに保存しない）
 */
export function hashToken(rawToken) {
  return crypto.createHash('sha256').update(String(rawToken)).digest('hex');
}

/**
 * 起動時に data/sessions.json から有効なセッションを復元
 */
function loadSessionsFromDisk() {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (!fs.existsSync(SESSIONS_FILE)) return;
    const raw = fs.readFileSync(SESSIONS_FILE, 'utf8');
    if (!raw || !raw.trim()) return;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return;
    const now = Date.now();
    for (const item of parsed) {
      if (item && item.tokenHash && item.userId && Number(item.expiresAt) > now) {
        sessionStore.set(item.tokenHash, item);
      }
    }
  } catch (err) {
    console.warn('[AuthSession] セッションファイルの読み込みをスキップしました:', err.message);
  }
}

/**
 * メモリ上の有効なセッションを data/sessions.json に非同期保存
 */
function schedulePersistSessions() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      const now = Date.now();
      const activeSessions = [];
      for (const [hash, record] of sessionStore.entries()) {
        if (Number(record.expiresAt) > now) {
          activeSessions.push(record);
        } else {
          sessionStore.delete(hash);
        }
      }
      fs.writeFileSync(SESSIONS_FILE, JSON.stringify(activeSessions, null, 2), 'utf8');
    } catch (err) {
      console.warn('[AuthSession] セッションファイルの保存に失敗しました:', err.message);
    }
  }, 1500);
}

// 初期化読み込み
loadSessionsFromDisk();

/**
 * 管理者判定ヘルパー
 */
export function isUserAdmin(user) {
  if (!user) return false;
  return (
    user.isAdmin === true ||
    user.isAdmin === 1 ||
    user.isAdmin === 'true' ||
    user.role === 'admin'
  );
}

/**
 * ログイン成功時に 256-bit (32 bytes) のランダムトークンを発行
 */
export function issueSessionToken(user) {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = hashToken(rawToken);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  const sessionRecord = {
    tokenHash,
    userId: String(user.id || ''),
    loginId: String(user.loginId || ''),
    name: String(user.name || ''),
    isAdmin: isUserAdmin(user),
    role: isUserAdmin(user) ? 'admin' : String(user.role || 'user'),
    officeId: String(user.officeId || user.officeCode || ''),
    divisionId: String(user.divisionId || user.divisionCode || ''),
    createdAt: new Date(now).toISOString(),
    lastAccessedAt: now,
    expiresAt
  };

  // 同一ユーザーの古い期限切れセッションを掃除（1ユーザー最大20セッションまで保持）
  const userSessions = [];
  for (const [k, v] of sessionStore.entries()) {
    if (Number(v.expiresAt) <= now) {
      sessionStore.delete(k);
    } else if (v.userId === sessionRecord.userId) {
      userSessions.push(v);
    }
  }
  if (userSessions.length >= 20) {
    userSessions.sort((a, b) => Number(a.lastAccessedAt || 0) - Number(b.lastAccessedAt || 0));
    const toRemove = userSessions.slice(0, userSessions.length - 19);
    for (const old of toRemove) {
      sessionStore.delete(old.tokenHash);
    }
  }

  sessionStore.set(tokenHash, sessionRecord);
  schedulePersistSessions();

  return {
    token: rawToken,
    expiresAt: new Date(expiresAt).toISOString(),
    session: sessionRecord
  };
}

/**
 * トークンを検証し、有効であればセッション情報を返す（期限切れ・未登録は null）
 */
export function verifySessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string' || rawToken.length < 32) {
    return null;
  }
  const tokenHash = hashToken(rawToken.trim());
  const record = sessionStore.get(tokenHash);
  if (!record) return null;

  const now = Date.now();
  if (Number(record.expiresAt) <= now) {
    sessionStore.delete(tokenHash);
    schedulePersistSessions();
    return null;
  }

  // スライディング延長（前回更新から5分以上経過していたら有効期限を延長）
  if (now - Number(record.lastAccessedAt || 0) > 5 * 60 * 1000) {
    record.lastAccessedAt = now;
    record.expiresAt = now + SESSION_TTL_MS;
    sessionStore.set(tokenHash, record);
    schedulePersistSessions();
  }

  return record;
}

/**
 * ログアウト時にトークンを破棄
 */
export function revokeSessionToken(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return false;
  const tokenHash = hashToken(rawToken.trim());
  const existed = sessionStore.delete(tokenHash);
  if (existed) {
    schedulePersistSessions();
  }
  return existed;
}

/**
 * 指定ユーザーの全セッション（または特定トークン以外）を破棄または権限同期
 */
export function updateSessionsForUser(user) {
  if (!user || !user.id) return;
  let updated = false;
  for (const [hash, rec] of sessionStore.entries()) {
    if (String(rec.userId) === String(user.id)) {
      rec.name = String(user.name || rec.name || '');
      rec.loginId = String(user.loginId || rec.loginId || '');
      rec.isAdmin = isUserAdmin(user);
      rec.role = isUserAdmin(user) ? 'admin' : String(user.role || 'user');
      sessionStore.set(hash, rec);
      updated = true;
    }
  }
  if (updated) schedulePersistSessions();
}

export function revokeAllSessionsForUser(userId) {
  if (!userId) return;
  let deleted = false;
  for (const [hash, rec] of sessionStore.entries()) {
    if (String(rec.userId) === String(userId)) {
      sessionStore.delete(hash);
      deleted = true;
    }
  }
  if (deleted) schedulePersistSessions();
}

// ============================================================================
// ログイン試行制限（ブルートフォース対策: アカウント＋IP単位）
// ============================================================================

function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.ip || req.socket?.remoteAddress || 'unknown-ip';
}

function getAttemptKeys(req, loginId) {
  const ip = getClientIp(req);
  const normalizedId = String(loginId || '').trim().toLowerCase() || 'unknown-user';
  return {
    ipAccountKey: `ip_acct:${ip}:${normalizedId}`,
    ipOnlyKey: `ip_only:${ip}`
  };
}

/**
 * ログイン試行前にロックアウト状態をチェック
 * @returns {{ blocked: boolean, retryAfterSeconds?: number, message?: string }}
 */
export function checkLoginRateLimit(req, loginId) {
  const now = Date.now();
  const { ipAccountKey, ipOnlyKey } = getAttemptKeys(req, loginId);

  for (const key of [ipAccountKey, ipOnlyKey]) {
    const entry = loginAttemptStore.get(key);
    if (!entry) continue;
    if (entry.lockedUntil && entry.lockedUntil > now) {
      const retryAfterSeconds = Math.ceil((entry.lockedUntil - now) / 1000);
      const retryMinutes = Math.ceil(retryAfterSeconds / 60);
      return {
        blocked: true,
        retryAfterSeconds,
        message: `ログイン失敗が規定回数を超えたため、一時的にロックされています。約${retryMinutes}分後に再度お試しください。`
      };
    }
    // ウィンドウ期限切れならリセット
    if (now - entry.firstFailedAt > LOGIN_WINDOW_MS) {
      loginAttemptStore.delete(key);
    }
  }

  return { blocked: false };
}

/**
 * ログイン結果（成功/失敗）を記録
 */
export function recordLoginAttempt(req, loginId, success) {
  const { ipAccountKey, ipOnlyKey } = getAttemptKeys(req, loginId);
  if (success) {
    loginAttemptStore.delete(ipAccountKey);
    return;
  }

  const now = Date.now();
  // 1) IP + アカウント単位: 5回連続失敗で15分ロック
  const acctEntry = loginAttemptStore.get(ipAccountKey);
  if (!acctEntry || now - acctEntry.firstFailedAt > LOGIN_WINDOW_MS) {
    loginAttemptStore.set(ipAccountKey, { count: 1, firstFailedAt: now, lockedUntil: 0 });
  } else {
    acctEntry.count += 1;
    if (acctEntry.count >= LOGIN_MAX_ATTEMPTS) {
      acctEntry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    }
    loginAttemptStore.set(ipAccountKey, acctEntry);
  }

  // 2) IP単体（アカウント総当たり攻撃対策）: 15分間に20回失敗で15分ロック
  const ipEntry = loginAttemptStore.get(ipOnlyKey);
  if (!ipEntry || now - ipEntry.firstFailedAt > LOGIN_WINDOW_MS) {
    loginAttemptStore.set(ipOnlyKey, { count: 1, firstFailedAt: now, lockedUntil: 0 });
  } else {
    ipEntry.count += 1;
    if (ipEntry.count >= LOGIN_MAX_ATTEMPTS * 4) {
      ipEntry.lockedUntil = now + LOGIN_LOCKOUT_MS;
    }
    loginAttemptStore.set(ipOnlyKey, ipEntry);
  }
}

// ============================================================================
// リクエストからのトークン抽出 ＆ 公開エンドポイント判定
// ============================================================================

export function extractTokenFromRequest(req) {
  const authHeader = req.headers['authorization'] || req.headers['Authorization'];
  if (typeof authHeader === 'string') {
    const match = authHeader.match(/^Bearer\s+(.+)$/i);
    if (match && match[1]) {
      return match[1].trim();
    }
  }
  const customHeader = req.headers['x-auth-token'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim();
  }
  if (req.query && typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return null;
}

/**
 * 認証免除（未ログイン状態でアクセスが必要な最小限のエンドポイント）判定
 * ※ ファイルのアップロード／ダウンロード／プレビュー系APIはすべて認証必須（免除しない）
 */
function isPublicApiEndpoint(method, normalizedPath) {
  const m = String(method || 'GET').toUpperCase();
  const p = normalizedPath;

  // Preflight は常に許可
  if (m === 'OPTIONS') return true;

  // 1. ログイン・ログアウト
  if (m === 'POST' && (p === '/auth/login' || p === '/login' || p === '/auth/logout' || p === '/logout')) {
    return true;
  }

  // 2. Web Push VAPID 公開鍵取得
  if (m === 'GET' && (p === '/push/vapid-public-key' || p === '/vapid-public-key')) {
    return true;
  }

  // 3. 社員招待トークン検証＆初回アカウント有効化（未ログインの新規社員がワンタイムトークンでアクセス）
  if (m === 'GET' && p === '/invitations/verify') return true;
  if (m === 'POST' && p === '/invitations/complete') return true;

  // 4. パスワード再設定トークン検証＆再設定実行（パスワード紛失時のメールリンクからワンタイムトークンでアクセス）
  if (m === 'GET' && (p === '/passwords/verify' || p === '/users/reset-password/verify')) return true;
  if (m === 'POST' && (p === '/passwords/reset' || p === '/users/reset-password')) return true;

  // 5. 外部カレンダー連携 iCal (.ics) フィード購読（Google/Outlook等が取得）
  if (m === 'GET' && (p === '/ical' || p.startsWith('/ical/'))) return true;

  // 6. 緊急安否確認メールからのワンタップゲスト回答（災害時にログイン不要で即座に回答するため）
  if (m === 'GET' && /^\/(safety-events|safety\/events)\/[^/]+$/.test(p)) return true;
  if (m === 'POST' && /^\/(safety-events|safety\/events)\/[^/]+\/(respond|responses)$/.test(p)) return true;
  if (m === 'GET' && /^\/users\/guest-profile\/[^/]+$/.test(p)) return true;

  return false;
}

/**
 * 認証ミドルウェア（全 /api/* およびファイル配信エンドポイントに適用）
 * - 許可リスト外の Origin ヘッダーを持つリクエストを 403 でブロック
 * - パストラバーサル（../ や null バイト）を含むリクエストを 400 でブロック
 * - 未ログイン・無効トークン・期限切れは 401 Unauthorized を返却
 * - トークンから特定したユーザー情報を req.authUser にセット
 * - 管理者専用APIおよび他人ID指定操作（IDOR）をサーバー側で厳格にブロック
 */
export function requireApiAuth(req, res, next) {
  // 1. 厳格CORSオリジン検証（許可リスト外のOriginヘッダーが付与されている場合は拒否）
  const requestOrigin = req.headers.origin;
  if (requestOrigin && !isAllowedOrigin(requestOrigin)) {
    res.removeHeader('Access-Control-Allow-Origin');
    res.removeHeader('Access-Control-Allow-Credentials');
    return res.status(403).json({
      error: '許可されていないオリジンからのリクエストです。',
      code: 'CORS_ORIGIN_NOT_ALLOWED'
    });
  }

  // 2. パストラバーサル (../) ＆不正ファイル名検証
  if (hasPathTraversalAttempt(req)) {
    return res.status(400).json({
      error: '不正なファイル名またはディレクトリトラバーサル（../）が検出されました。',
      code: 'INVALID_PATH_TRAVERSAL'
    });
  }

  // パス正規化 ('/api/users' -> '/users')
  const rawPath = req.path || req.originalUrl?.split('?')[0] || '/';
  const normalizedPath = rawPath.replace(/^\/api(\/|$)/, '/') || '/';

  const rawToken = extractTokenFromRequest(req);
  const session = rawToken ? verifySessionToken(rawToken) : null;

  if (session) {
    req.authUser = {
      id: session.userId,
      loginId: session.loginId,
      name: session.name,
      isAdmin: Boolean(session.isAdmin),
      role: session.role || (session.isAdmin ? 'admin' : 'user'),
      officeId: session.officeId || '',
      divisionId: session.divisionId || ''
    };
    req.authToken = rawToken;
  }

  // 3. 公開免除エンドポイントの判定
  if (isPublicApiEndpoint(req.method, normalizedPath)) {
    return next();
  }

  // 4. トークン未指定または無効・期限切れの場合は 401 を返す
  if (!req.authUser) {
    return res.status(401).json({
      error: '認証が必要です。再度ログインしてください。',
      code: 'UNAUTHORIZED'
    });
  }

  const m = String(req.method || 'GET').toUpperCase();
  const isAdmin = Boolean(req.authUser.isAdmin);
  const authUserId = String(req.authUser.id);

  // ==========================================================================
  // 共通 IDOR 防止 ＆ 管理者権限強制ガード
  // ==========================================================================

  // 文書管理（/documents/*）の閲覧・DLログ等では操作者IDをトークンの本人で上書き（なりすまし防止）
  if (normalizedPath.startsWith('/documents') || normalizedPath.startsWith('/download/')) {
    if (req.query && typeof req.query === 'object') {
      req.query.userId = authUserId;
      req.query.userName = String(req.authUser.name || '');
      req.query.isAdmin = isAdmin ? 'true' : 'false';
    }
  }

  // 1. 社員招待の発行・取消・削除・一覧取得（管理者のみ）
  if (normalizedPath === '/invitations' || normalizedPath.startsWith('/invitations/')) {
    if (!isAdmin) {
      return res.status(403).json({
        error: 'この操作には管理者権限が必要です。',
        code: 'FORBIDDEN_ADMIN_ONLY'
      });
    }
  }

  // 2. パスワードリセットリンクの発行（管理者のみ）
  if (
    m === 'POST' &&
    (normalizedPath === '/passwords/request-reset' ||
      normalizedPath === '/users/request-password-reset' ||
      /^\/passwords\/[^/]+\/request-reset$/.test(normalizedPath) ||
      /^\/users\/[^/]+\/request-password-reset$/.test(normalizedPath))
  ) {
    if (!isAdmin) {
      return res.status(403).json({
        error: 'パスワード再設定リンクの発行には管理者権限が必要です。',
        code: 'FORBIDDEN_ADMIN_ONLY'
      });
    }
  }

  // 3. パスワード強制変更（本人または管理者のみ）
  if (m === 'POST' && (normalizedPath === '/passwords/force-change' || normalizedPath === '/users/force-change-password')) {
    const targetUserId = String(req.body?.userId || req.body?.id || '');
    if (targetUserId && targetUserId !== authUserId && !isAdmin) {
      return res.status(403).json({
        error: '他のユーザーのパスワードを変更することはできません。',
        code: 'FORBIDDEN_IDOR'
      });
    }
    if (req.body && typeof req.body === 'object' && !isAdmin) {
      req.body.userId = authUserId;
    }
  }

  // 4. ユーザー並び替え（管理者のみ）
  if ((m === 'PUT' || m === 'POST') && normalizedPath === '/users/reorder') {
    if (!isAdmin) {
      return res.status(403).json({
        error: 'ユーザーの並び順変更には管理者権限が必要です。',
        code: 'FORBIDDEN_ADMIN_ONLY'
      });
    }
  }

  // 5. ユーザー削除（管理者のみ）
  if (m === 'DELETE' && /^\/users\/[^/]+$/.test(normalizedPath)) {
    if (!isAdmin) {
      return res.status(403).json({
        error: 'ユーザーの削除には管理者権限が必要です。',
        code: 'FORBIDDEN_ADMIN_ONLY'
      });
    }
  }

  // 6. ユーザー個人設定・個人メールアドレス更新（本人または管理者のみ）
  const userSubResourceMatch = normalizedPath.match(/^\/users\/([^/]+)\/(preferences|personal-email)$/);
  if (userSubResourceMatch && (m === 'PUT' || m === 'POST' || m === 'DELETE')) {
    const targetId = decodeURIComponent(userSubResourceMatch[1]);
    if (targetId !== authUserId && !isAdmin) {
      return res.status(403).json({
        error: '他のユーザーの個人設定を変更することはできません。',
        code: 'FORBIDDEN_IDOR'
      });
    }
  }

  // 7. ユーザー情報更新・新規作成 (POST /users, PUT /users/:id, POST /users/:id)
  if ((m === 'POST' || m === 'PUT') && (normalizedPath === '/users' || /^\/users\/[^/]+$/.test(normalizedPath))) {
    const paramId = normalizedPath.startsWith('/users/')
      ? decodeURIComponent(normalizedPath.slice('/users/'.length))
      : null;
    const bodyId = req.body?.id ? String(req.body.id) : null;
    const targetId = paramId || bodyId;

    // 管理者以外は自分自身のプロフィール更新のみ許可（新規ユーザー追加や他人IDの更新は拒否）
    if (!isAdmin) {
      if (!targetId || targetId !== authUserId) {
        return res.status(403).json({
          error: '他のユーザー情報の変更または新規ユーザー作成には管理者権限が必要です。',
          code: 'FORBIDDEN_IDOR'
        });
      }
      // 自己権限昇格（isAdmin / role の書き換え）を防止
      if (req.body && typeof req.body === 'object') {
        delete req.body.isAdmin;
        delete req.body.role;
      }
    }
  }

  // 8. マスター管理（拠点・部署・役職の追加・編集・削除）は管理者のみ
  if ((m === 'POST' || m === 'PUT' || m === 'DELETE') && normalizedPath.startsWith('/masters/')) {
    if (!isAdmin) {
      return res.status(403).json({
        error: 'マスターデータの変更には管理者権限が必要です。',
        code: 'FORBIDDEN_ADMIN_ONLY'
      });
    }
  }

  // 9. 安否確認イベントの発動・削除は管理者のみ
  if (
    (m === 'POST' && (normalizedPath === '/safety-events' || normalizedPath === '/safety/events')) ||
    (m === 'DELETE' && /^\/(safety-events|safety\/events)\/[^/]+$/.test(normalizedPath))
  ) {
    if (!isAdmin) {
      return res.status(403).json({
        error: '安否確認の一斉配信・削除には管理者権限が必要です。',
        code: 'FORBIDDEN_ADMIN_ONLY'
      });
    }
  }

  return next();
}
