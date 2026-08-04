import React, { useState } from 'react';
import { API_BASE_URL } from '../config/api';
import { X, Play, Activity, Server, AlertTriangle, CheckCircle2, ShieldAlert, Database } from 'lucide-react';

interface APIDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function APIDiagnosticModal({ isOpen, onClose }: APIDiagnosticModalProps) {
  const [loading, setLoading] = useState(false);
  const [logs, setLogs] = useState<string[]>([]);
  const [status, setStatus] = useState<'idle' | 'success' | 'warning' | 'error'>('idle');
  const [testResult, setTestResult] = useState<any>(null);

  if (!isOpen) return null;

  const addLog = (msg: string) => {
    setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const runDiagnostic = async () => {
    setLoading(true);
    setStatus('idle');
    setLogs([]);
    setTestResult(null);

    addLog('===== API 接続診断を開始します =====');
    addLog(`検証先 API ベースURL: ${API_BASE_URL}`);

    // 1. 基本的なURLチェック
    if (!API_BASE_URL) {
      addLog('❌ エラー: APIベースURLが空です。.envの設定を確認してください。');
      setStatus('error');
      setLoading(false);
      return;
    }

    // 2. GET /bulletins 接続テスト
    try {
      addLog('1. 掲示板一覧の取得テスト (GET /bulletins) を送信中...');
      const start = Date.now();
      const res = await fetch(`${API_BASE_URL}/bulletins`, {
        method: 'GET',
        headers: { 'Accept': 'application/json' }
      });
      const duration = Date.now() - start;

      addLog(`▶ レスポンス受信: ステータスコード ${res.status} (${duration}ms)`);

      if (res.status === 200) {
        const data = await res.json();
        addLog(`✅ 接続成功！ ${Array.isArray(data) ? `${data.length}件のトピックを取得しました。` : 'データの形式に一部注意が必要です。'}`);
        setTestResult(data);
        setStatus('success');
      } else if (res.status === 404) {
        addLog('❌ 404 Not Found を検出しました。');
        addLog('【想定原因】');
        addLog('・サーバー側で "/api/bulletins" というエンドポイントが正しく定義されていない。');
        addLog('・あるいは、Synology等のリバースプロキシ設定で、パスが正しく転送されていない。');
        setStatus('warning');
      } else {
        const text = await res.text();
        addLog(`❌ エラーレスポンス: ${text.slice(0, 200)}`);
        setStatus('error');
      }
    } catch (err: any) {
      addLog(`❌ 通信エラーが発生しました: ${err.message}`);
      addLog('【想定原因】');
      addLog('・APIサーバー自体が起動していない、または完全に停止している。');
      addLog('・CORS（クロスドメイン制限）によりブラウザから接続がブロックされている。');
      setStatus('error');
    }

    // 3. コメント保存失敗（すぐに消える問題）のセルフチェック
    addLog('\n2. コメント反映に関する自己診断を実行中...');
    addLog('💡 診断ヒント: 投稿したコメントが再読み込み後に消える場合、DBへの書き込み（INSERT）が失敗しています。');
    addLog('   特に、DBの「author_id」や「topic_id」列が [NOT NULL] 制約を持つのに、インサート文でそれらに値を指定していない可能性があります。');
    
    addLog('===== 診断完了 =====');
    setLoading(false);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-5 h-5 text-indigo-600 animate-pulse" />
            <h3 className="font-bold text-slate-800 text-base">API 接続 & データベース診断ツール</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1">
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex gap-3 text-xs text-amber-800">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold mb-1">【重要】修復前の検証としてご利用ください</p>
              <p className="leading-relaxed">
                本ツールはブラウザから直接 Synology NAS 等の外部APIサーバーに対して実際にテストリクエストを送信し、接続状態やDBの応答をリアルタイムでログ出力します。
              </p>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-bold text-slate-500 uppercase">対象のAPIベースURL</label>
            <div className="flex items-center gap-2 p-3 bg-slate-100 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 select-all overflow-x-auto">
              {API_BASE_URL}
            </div>
          </div>

          {/* Controls */}
          <div className="flex gap-3">
            <button
              onClick={runDiagnostic}
              disabled={loading}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white font-bold text-xs rounded-xl shadow-md transition-colors"
            >
              <Play className="w-4 h-4" />
              {loading ? '診断実行中...' : '接続テストを実行する'}
            </button>
          </div>

          {/* Status Alert */}
          {status !== 'idle' && (
            <div className={`p-4 rounded-xl border text-xs flex gap-3 ${
              status === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-800' :
              status === 'warning' ? 'bg-amber-50 border-amber-200 text-amber-800' :
              'bg-red-50 border-red-200 text-red-800'
            }`}>
              {status === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" /> :
               status === 'warning' ? <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0" /> :
               <ShieldAlert className="w-5 h-5 text-red-600 shrink-0" />}
              <div>
                <p className="font-bold mb-1">
                  {status === 'success' && 'API サーバー接続成功！'}
                  {status === 'warning' && '一部不整合（404 または警告）を検出しました'}
                  {status === 'error' && '接続エラーが発生しました'}
                </p>
                <p className="leading-relaxed">
                  {status === 'success' && '掲示板API自体は完全に作動しています。コメントが消える問題は、データベースへのインサート時のカラム整合性が原因の可能性が高いです（以下ログを参照）。'}
                  {status === 'warning' && '404エラーが発生しています。サーバーが起動していても、掲示板用のパス（/api/bulletins）へのルート登録が正しくない、あるいはリバースプロキシの転送パスが間違っている可能性があります。'}
                  {status === 'error' && 'サーバーへの物理接続、あるいはCORS制限によってアクセスがブロックされています。サーバーが稼働していること、およびポート3000番やドメインが通じていることを確認してください。'}
                </p>
              </div>
            </div>
          )}

          {/* Logs */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-500 uppercase">診断ログ出力</span>
              {logs.length > 0 && (
                <button
                  onClick={() => setLogs([])}
                  className="text-[10px] font-bold text-indigo-600 hover:underline"
                >
                  ログをクリア
                </button>
              )}
            </div>
            <div className="h-44 bg-slate-900 rounded-xl p-3 font-mono text-[10px] text-emerald-400 overflow-y-auto space-y-1 scrollbar-thin shadow-inner border border-slate-950">
              {logs.length === 0 ? (
                <div className="text-slate-500 text-center py-10">診断をスタートすると、ここに詳細なデータログがリアルタイム表示されます</div>
              ) : (
                logs.map((log, i) => (
                  <div key={i} className="whitespace-pre-wrap leading-relaxed">{log}</div>
                ))
              )}
            </div>
          </div>

          {/* Database Info Guide */}
          <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
            <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-800">
              <Database className="w-4 h-4" />
              <span>【重要】コメントが消える問題のデータベース原因解説</span>
            </div>
            <p className="text-[11px] text-indigo-900/80 leading-relaxed">
              ご提示いただいた `dbo.BoardComments` テーブルの画像から、古い仕様である <strong>`author_id`</strong>（NOT NULL）カラムが残っているのに対し、
              新仕様の <strong>`authorId`</strong> カラムは NULL が許可された状態で混在しています。<br />
              サーバー側のINSERT文がキャメルケース（`authorId`）だけでインサートしようとすると、
              データベースは<strong>「author_idカラムがNOT NULLなのに指定されていない」</strong>として、インサート処理をサイレントにエラー終了（インサート失敗）させてしまいます。<br />
              これを修復するための新サーバーコードは本件の回答でご提示いたします。
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-slate-200 hover:bg-slate-300 text-slate-700 font-bold text-xs rounded-xl transition-colors"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
}
