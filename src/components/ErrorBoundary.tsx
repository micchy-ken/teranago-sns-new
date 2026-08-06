import React, { ErrorInfo, ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: ErrorInfo | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
    errorInfo: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error, errorInfo: null };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error:', error, errorInfo);
    this.setState({
      error,
      errorInfo,
    });
  }

  private handleReset = () => {
    // ローカルストレージ等のキャッシュをクリアして再ロードを試みる
    try {
      localStorage.removeItem('selected_user');
      localStorage.removeItem('teranago_sns_auth');
    } catch (_) {}
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6 font-sans">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-xl overflow-hidden">
            {/* ヘッダー */}
            <div className="bg-rose-50 border-b border-rose-100 p-6 flex items-center gap-4">
              <div className="p-3 bg-rose-100 text-rose-700 rounded-xl shrink-0">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                  xmlns="http://www.w3.org/2000/svg"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                  />
                </svg>
              </div>
              <div>
                <h1 className="text-lg font-black text-slate-900">システムエラーが発生しました</h1>
                <p className="text-xs text-rose-700 mt-0.5">画面を正常にレンダリングできませんでした。</p>
              </div>
            </div>

            {/* コンテンツ */}
            <div className="p-6 space-y-6">
              <div className="text-sm text-slate-600 leading-relaxed">
                データ取得の整合性エラー、または予期せぬ実行時エラーが発生した可能性があります。
                下記のボタンからキャッシュ情報をクリアして再読み込みを行うか、エラー情報を管理者に共有してください。
              </div>

              {/* エラー詳細情報 */}
              <div className="bg-slate-900 text-slate-100 p-4 rounded-xl font-mono text-xs overflow-auto max-h-64 border border-slate-800 space-y-2 shadow-inner">
                <div className="text-amber-400 font-bold">⚠️ エラー内容:</div>
                <div className="text-rose-400 whitespace-pre-wrap">
                  {this.state.error?.stack || this.state.error?.message || '不明なエラー'}
                </div>
                {this.state.errorInfo && (
                  <>
                    <div className="text-amber-400 font-bold mt-4">📋 コンポーネントスタック:</div>
                    <div className="text-slate-300 whitespace-pre-wrap text-[10px]">
                      {this.state.errorInfo.componentStack}
                    </div>
                  </>
                )}
              </div>

              {/* アクションボタン */}
              <div className="flex flex-col sm:flex-row gap-3 pt-2">
                <button
                  onClick={this.handleReset}
                  className="flex-1 px-5 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold rounded-xl transition-all shadow-md hover:shadow-lg active:scale-[0.98]"
                >
                  設定・キャッシュをクリアして再起動
                </button>
                <button
                  onClick={() => window.location.reload()}
                  className="flex-1 px-5 py-3 bg-white hover:bg-slate-100 text-slate-700 font-bold border border-slate-300 rounded-xl transition-all hover:shadow-sm active:scale-[0.98]"
                >
                  単純リロード
                </button>
              </div>
            </div>

            {/* フッター */}
            <div className="bg-slate-50 border-t border-slate-100 px-6 py-4 flex justify-between items-center text-[11px] text-slate-400">
              <div>寺子屋 SNS ポータル</div>
              <div className="font-mono">エラー発生時刻: {new Date().toLocaleString('ja-JP')}</div>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
