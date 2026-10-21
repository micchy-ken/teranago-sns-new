/**
 * fetchWithRetry.ts
 * 
 * 社内NAS（Synology Nginx リバースプロキシ）やモバイル・Wi-Fi環境における
 * 一時的なソケット切断や keep-alive 再利用競合（Failed to fetch）を
 * 透過的に自動リトライしてデータ同期エラー表示のチラつき・誤報を防止するユーティリティ
 */

export async function fetchWithRetry(
  input: RequestInfo | URL,
  init?: RequestInit,
  retries = 2,
  baseDelay = 500
): Promise<Response> {
  let attempt = 0;
  while (true) {
    try {
      const response = await fetch(input, init);
      // 502/503/504 等の一時的なリバースプロキシエラー時もリトライ対象
      if ((response.status === 502 || response.status === 503 || response.status === 504) && attempt < retries) {
        attempt++;
        await new Promise(res => setTimeout(res, baseDelay * attempt));
        continue;
      }
      return response;
    } catch (err: any) {
      attempt++;
      // Failed to fetch または NetworkError の場合にリトライ
      if (attempt <= retries) {
        await new Promise(res => setTimeout(res, baseDelay * attempt));
        continue;
      }
      throw err;
    }
  }
}
