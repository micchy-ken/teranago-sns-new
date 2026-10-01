import { API_BASE_URL } from '../config/api';
import { User } from '../types';

export type ActivityAction = 
  | 'login' 
  | 'logout' 
  | 'app_access'      // アプリ起動・セッション開始（自動ログイン時等）
  | 'chat_view'       // チャットルーム閲覧
  | 'chat_message'    // チャットメッセージ・スタンプ・写真送信
  | 'bulletin_view'   // 掲示板記事閲覧
  | 'bulletin_post'   // 掲示板投稿
  | 'safety_answer' 
  | 'stamp_manage' 
  | 'user_manage' 
  | 'admin_action';

export interface ActivityLogItem {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  department?: string;
  action: ActivityAction | string;
  details?: string;
  deviceType?: string;
  ip?: string;
}

/**
 * クライアント端末の環境を簡易判別する関数
 */
export function getDeviceType(): string {
  if (typeof navigator === 'undefined') return '不明';
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return 'iPhone (iOS)';
  if (/iPad/i.test(ua)) return 'iPad (iPadOS)';
  if (/Android/i.test(ua)) return 'スマートフォン (Android)';
  if (/Windows/i.test(ua)) return 'PC (Windows)';
  if (/Macintosh|Mac OS X/i.test(ua)) return 'PC (Mac)';
  if (/Linux/i.test(ua)) return 'PC (Linux)';
  return 'ブラウザ端末';
}

/**
 * ユーザーの主要な操作をバックエンドに記録するヘルパー関数
 * ※ UIの処理を一切ブロックしないよう非同期・例外無視で送信します。
 */
export async function logActivity(
  action: ActivityAction,
  details: string,
  user?: Partial<User> | null
) {
  try {
    const payload = {
      userId: user?.id || 'anonymous',
      userName: user?.name || 'ゲスト',
      department: user?.department || '',
      action,
      details,
      deviceType: getDeviceType()
    };

    fetch(`${API_BASE_URL}/logs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).catch(() => {});
  } catch (e) {
    // ログ記録エラーでメイン処理を中断させない
  }
}
