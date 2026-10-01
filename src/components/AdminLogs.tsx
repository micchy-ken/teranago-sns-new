import React, { useState, useEffect, useMemo } from 'react';
import { API_BASE_URL } from '../config/api';
import { ActivityLogItem } from '../utils/logger';
import { 
  FileText, 
  Download, 
  Search, 
  RefreshCw, 
  Calendar, 
  Filter, 
  LogIn, 
  LogOut, 
  MessageSquare, 
  FileCheck, 
  ShieldCheck, 
  Smile, 
  Users, 
  Laptop, 
  Smartphone, 
  Clock,
  Trash2,
  AlertCircle,
  Eye
} from 'lucide-react';

export function AdminLogs() {
  const [logs, setLogs] = useState<ActivityLogItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [actionFilter, setActionFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<'today' | 'week' | 'month' | 'all'>('all');
  const [showClearConfirm, setShowClearConfirm] = useState<boolean>(false);
  const [isClearing, setIsClearing] = useState<boolean>(false);

  // ログの取得
  const fetchLogs = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/logs?limit=5000`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.logs)) {
          setLogs(data.logs);
        }
      }
    } catch (err) {
      console.error('Failed to fetch logs:', err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, []);

  // ログ全消去
  const handleClearLogs = async () => {
    setIsClearing(true);
    try {
      const res = await fetch(`${API_BASE_URL}/logs/clear`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        setLogs([]);
        setShowClearConfirm(false);
      }
    } catch (err) {
      console.error('Failed to clear logs:', err);
      alert('ログの消去に失敗しました');
    } finally {
      setIsClearing(false);
    }
  };

  // フィルタリング処理
  const filteredLogs = useMemo(() => {
    let result = [...logs];

    // 日時フィルター
    const now = new Date();
    if (dateFilter === 'today') {
      const todayStr = now.toDateString();
      result = result.filter(l => new Date(l.timestamp).toDateString() === todayStr);
    } else if (dateFilter === 'week') {
      const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
      result = result.filter(l => new Date(l.timestamp) >= weekAgo);
    } else if (dateFilter === 'month') {
      const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      result = result.filter(l => new Date(l.timestamp) >= monthAgo);
    }

    // アクション種別フィルター
    if (actionFilter !== 'all') {
      result = result.filter(l => l.action === actionFilter);
    }

    // 検索語句フィルター
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(l => 
        (l.userName && l.userName.toLowerCase().includes(q)) ||
        (l.department && l.department.toLowerCase().includes(q)) ||
        (l.details && l.details.toLowerCase().includes(q)) ||
        (l.deviceType && l.deviceType.toLowerCase().includes(q)) ||
        (l.ip && l.ip.includes(q))
      );
    }

    return result;
  }, [logs, dateFilter, actionFilter, searchQuery]);

  // 集計統計
  const stats = useMemo(() => {
    const todayStr = new Date().toDateString();
    const todayLogs = logs.filter(l => new Date(l.timestamp).toDateString() === todayStr);
    const todayLogins = todayLogs.filter(l => l.action === 'login' || l.action === 'app_access');
    const uniqueUsersToday = new Set(todayLogs.map(l => l.userId)).size;

    return {
      todayLogins: todayLogins.length,
      todayTotalActions: todayLogs.length,
      uniqueUsersToday,
      totalLogs: logs.length
    };
  }, [logs]);

  // CSVダウンロード処理 (UTF-8 with BOM: Excelでダブルクリックしても文字化けしない)
  const handleDownloadCsv = () => {
    if (filteredLogs.length === 0) {
      alert('ダウンロード対象のログがありません');
      return;
    }

    // ヘッダー行
    const headers = ['日時', 'ユーザーID', '氏名', '部署', '操作種別', '詳細内容', '利用端末', 'IPアドレス'];

    // アクション名を日本語表示にマッピング
    const getActionLabel = (act: string) => {
      switch (act) {
        case 'login': return 'ログイン';
        case 'logout': return 'ログアウト';
        case 'app_access': return '利用開始（アクセス）';
        case 'chat_view': return 'チャット閲覧';
        case 'chat_message': return 'チャット送信';
        case 'bulletin_view': return '掲示板閲覧';
        case 'bulletin_post': return '掲示板投稿';
        case 'safety_answer': return '安否確認回答';
        case 'stamp_manage': return 'スタンプ管理';
        case 'user_manage': return 'ユーザー管理';
        case 'admin_action': return '管理操作';
        default: return act;
      }
    };

    // CSVデータ行
    const rows = filteredLogs.map(l => {
      const d = new Date(l.timestamp);
      const timeFormatted = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
      
      const escapeCsv = (val?: string) => {
        if (!val) return '""';
        return `"${val.replace(/"/g, '""')}"`;
      };

      return [
        escapeCsv(timeFormatted),
        escapeCsv(l.userId),
        escapeCsv(l.userName),
        escapeCsv(l.department),
        escapeCsv(getActionLabel(l.action)),
        escapeCsv(l.details),
        escapeCsv(l.deviceType),
        escapeCsv(l.ip)
      ].join(',');
    });

    const csvContent = '\uFEFF' + [headers.join(','), ...rows].join('\r\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const now = new Date();
    const fileNameDate = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}_${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
    const link = document.createElement('a');
    link.href = url;
    link.download = `access_logs_${fileNameDate}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // アクションバッジのレンダリング
  const renderActionBadge = (action: string) => {
    switch (action) {
      case 'app_access':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-teal-50 text-teal-700 border border-teal-200">
            <Laptop className="w-3 h-3 text-teal-600" />
            利用開始
          </span>
        );
      case 'login':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-sky-50 text-sky-700 border border-sky-200">
            <LogIn className="w-3 h-3 text-sky-600" />
            ログイン
          </span>
        );
      case 'logout':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            <LogOut className="w-3 h-3 text-slate-500" />
            ログアウト
          </span>
        );
      case 'chat_view':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-cyan-50 text-cyan-700 border border-cyan-200">
            <Eye className="w-3 h-3 text-cyan-600" />
            チャット閲覧
          </span>
        );
      case 'chat_message':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
            <MessageSquare className="w-3 h-3 text-indigo-600" />
            チャット送信
          </span>
        );
      case 'bulletin_view':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <FileText className="w-3 h-3 text-amber-600" />
            掲示板閲覧
          </span>
        );
      case 'bulletin_post':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <FileCheck className="w-3 h-3 text-emerald-600" />
            掲示板投稿
          </span>
        );
      case 'safety_answer':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
            <ShieldCheck className="w-3 h-3 text-rose-600" />
            安否確認
          </span>
        );
      case 'stamp_manage':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200">
            <Smile className="w-3 h-3 text-purple-600" />
            スタンプ管理
          </span>
        );
      case 'user_manage':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
            <Users className="w-3 h-3 text-amber-600" />
            ユーザー管理
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-700 border border-slate-200">
            {action}
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 上部ヘッダーとサマリーカード */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-extrabold text-slate-900 text-base flex items-center gap-2">
              <FileText className="w-5 h-5 text-indigo-600" />
              アクセス・操作ログ
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              ログイン状況や各種アクションの履歴を時系列で確認・CSVエクスポートできます。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleDownloadCsv}
              className="px-3.5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
            >
              <Download className="w-4 h-4" />
              CSVダウンロード
            </button>
            <button
              onClick={fetchLogs}
              disabled={isLoading}
              className="p-2 text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              title="再読み込み"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              onClick={() => setShowClearConfirm(true)}
              className="p-2 text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all cursor-pointer"
              title="ログの消去"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* サマリーカード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-sky-100 flex items-center justify-center text-sky-600 shrink-0">
              <LogIn className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold">本日のログイン</p>
              <p className="text-lg font-black text-slate-800">{stats.todayLogins} <span className="text-xs font-normal text-slate-400">回</span></p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center text-emerald-600 shrink-0">
              <Users className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold">本日利用ユーザー</p>
              <p className="text-lg font-black text-slate-800">{stats.uniqueUsersToday} <span className="text-xs font-normal text-slate-400">人</span></p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-100 flex items-center justify-center text-indigo-600 shrink-0">
              <Clock className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold">本日の全アクション</p>
              <p className="text-lg font-black text-slate-800">{stats.todayTotalActions} <span className="text-xs font-normal text-slate-400">件</span></p>
            </div>
          </div>

          <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3.5 flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-100 flex items-center justify-center text-purple-600 shrink-0">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <p className="text-[10px] text-slate-500 font-bold">総保持ログ件数</p>
              <p className="text-lg font-black text-slate-800">{stats.totalLogs} <span className="text-xs font-normal text-slate-400">件</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* 検索・フィルターバー */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* 検索入力 */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="氏名、部署、操作内容、端末で検索..."
              className="w-full pl-9 pr-4 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-medium"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* アクション種別フィルター */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <Filter className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={actionFilter}
                onChange={(e) => setActionFilter(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-700 focus:outline-hidden cursor-pointer"
              >
                <option value="all">すべてのアクション</option>
                <option value="app_access">利用開始（アクセス）</option>
                <option value="login">ログイン</option>
                <option value="logout">ログアウト</option>
                <option value="chat_view">チャット閲覧</option>
                <option value="chat_message">チャット送信</option>
                <option value="bulletin_view">掲示板閲覧</option>
                <option value="bulletin_post">掲示板投稿</option>
                <option value="safety_answer">安否確認回答</option>
                <option value="stamp_manage">スタンプ管理</option>
                <option value="user_manage">ユーザー管理</option>
                <option value="admin_action">管理操作</option>
              </select>
            </div>

            {/* 期間フィルター */}
            <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={dateFilter}
                onChange={(e) => setDateFilter(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-slate-700 focus:outline-hidden cursor-pointer"
              >
                <option value="all">全期間</option>
                <option value="today">今日</option>
                <option value="week">過去7日間</option>
                <option value="month">過去30日間</option>
              </select>
            </div>
          </div>
        </div>

        <div className="text-[11px] text-slate-500 font-bold px-1 flex items-center justify-between">
          <span>表示件数: {filteredLogs.length} 件</span>
          {filteredLogs.length > 0 && (
            <span className="text-slate-400">※ Excelで文字化けしないUTF-8 BOM付きCSV形式でダウンロードできます</span>
          )}
        </div>
      </div>

      {/* ログ一覧テーブル */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-extrabold select-none">
                <th className="py-3 px-4 w-40 whitespace-nowrap">日時</th>
                <th className="py-3 px-4 w-44 whitespace-nowrap">ユーザー</th>
                <th className="py-3 px-4 w-32 whitespace-nowrap">アクション</th>
                <th className="py-3 px-4 min-w-[200px]">詳細内容</th>
                <th className="py-3 px-4 w-44 whitespace-nowrap">利用端末</th>
                <th className="py-3 px-4 w-28 whitespace-nowrap">IPアドレス</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredLogs.map((log) => {
                const d = new Date(log.timestamp);
                const dateStr = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`;
                const timeStr = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}:${String(d.getSeconds()).padStart(2, '0')}`;
                const isMobile = log.deviceType?.includes('スマートフォン') || log.deviceType?.includes('iPhone') || log.deviceType?.includes('Android');

                return (
                  <tr key={log.id} className="hover:bg-slate-50/80 transition-colors">
                    {/* 日時 */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-600">
                      <span className="text-slate-800 font-bold">{dateStr}</span> <span className="text-slate-500">{timeStr}</span>
                    </td>

                    {/* ユーザー */}
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      <div className="flex flex-col">
                        <span className="font-extrabold text-slate-900">{log.userName}</span>
                        {log.department && (
                          <span className="text-[10px] text-slate-500 font-medium">{log.department}</span>
                        )}
                      </div>
                    </td>

                    {/* アクション */}
                    <td className="py-2.5 px-4 whitespace-nowrap">
                      {renderActionBadge(log.action)}
                    </td>

                    {/* 詳細内容 */}
                    <td className="py-2.5 px-4 text-slate-700 font-medium">
                      {log.details || '-'}
                    </td>

                    {/* 利用端末 */}
                    <td className="py-2.5 px-4 whitespace-nowrap text-slate-600">
                      <div className="flex items-center gap-1.5">
                        {isMobile ? (
                          <Smartphone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        ) : (
                          <Laptop className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        )}
                        <span className="text-[11px]">{log.deviceType || '不明'}</span>
                      </div>
                    </td>

                    {/* IPアドレス */}
                    <td className="py-2.5 px-4 whitespace-nowrap font-mono text-[11px] text-slate-400">
                      {log.ip || '-'}
                    </td>
                  </tr>
                );
              })}

              {filteredLogs.length === 0 && !isLoading && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <FileText className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="font-bold text-xs">該当するログが見つかりませんでした</p>
                  </td>
                </tr>
              )}

              {isLoading && filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <RefreshCw className="w-6 h-6 animate-spin text-indigo-500 mx-auto mb-2" />
                    <p className="font-bold text-xs">ログを読み込んでいます...</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 削除確認モーダル */}
      {showClearConfirm && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <AlertCircle className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="font-extrabold text-slate-900 text-sm">アクセスログをすべて消去しますか？</h4>
              <p className="text-xs text-slate-500">
                この操作を行うと、保存されているすべてのアクセス・操作履歴が削除されます。この操作は取り消せません。
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowClearConfirm(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleClearLogs}
                disabled={isClearing}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs cursor-pointer"
              >
                {isClearing ? '消去中...' : '消去する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
