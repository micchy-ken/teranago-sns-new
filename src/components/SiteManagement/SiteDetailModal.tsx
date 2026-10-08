import React, { useState, useEffect } from 'react';
import { 
  X, Layers, Calendar, User as UserIcon, Building, MapPin, 
  ExternalLink, MessageSquare, Send, CheckCircle2, Clock, 
  FileText, Paperclip, Trash2, Edit3, Save, RefreshCw, AlertCircle, FileSpreadsheet, Download
} from 'lucide-react';
import { Site, SiteMainPart, SiteSubPart, SiteComment, SiteStatus, PartStatus } from '../../types/site';
import { User } from '../../types';
import { API_BASE_URL } from '../../config/api';

interface SiteDetailModalProps {
  site: Site | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateSite: (updatedSite: Site) => void;
  onDeleteSite: (siteId: string) => void;
  currentUser: User;
  allUsers: User[];
}

export const SiteDetailModal: React.FC<SiteDetailModalProps> = ({
  site,
  isOpen,
  onClose,
  onUpdateSite,
  onDeleteSite,
  currentUser,
  allUsers
}) => {
  const [activeTab, setActiveTab] = useState<'parts' | 'timeline' | 'info' | 'export'>('parts');

  // 編集用ローカルステート
  const [currentSite, setCurrentSite] = useState<Site | null>(site);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // コメント入力
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // 付属部品の外部在庫DBリアルタイム取得
  const [subParts, setSubParts] = useState<SiteSubPart[]>(site?.subPartsCache || []);
  const [isLoadingSubParts, setIsLoadingSubParts] = useState(false);

  // 添付ファイル追加用
  const [newAttachmentName, setNewAttachmentName] = useState('');
  const [newAttachmentUrl, setNewAttachmentUrl] = useState('');
  const [showAddAttachment, setShowAddAttachment] = useState(false);

  useEffect(() => {
    if (site) {
      setCurrentSite(site);
      fetchLiveSubParts(site.siteCode);
    }
  }, [site]);

  // 在庫DBから付属部品を最新取得
  const fetchLiveSubParts = async (code: string) => {
    if (!code) return;
    setIsLoadingSubParts(true);
    try {
      const res = await fetch(`${API_BASE_URL}/sites/lookup/external?code=${encodeURIComponent(code)}`);
      if (res.ok) {
        const json = await res.json();
        const rawParts = json.data?.parts || (Array.isArray(json.data) ? json.data[0]?.parts : []) || [];
        const subs: SiteSubPart[] = rawParts
          .filter((p: any) => p.type === 'sub' || p.isMain === false)
          .map((p: any, idx: number) => ({
            id: `sub-live-${idx}`,
            partCode: String(p.partCode || p.code || '').trim(),
            partName: String(p.partName || p.name || '付属部品').trim(),
            quantity: typeof p.quantity === 'number' ? p.quantity : (parseInt(p.count || p.qty || p.quantity || 1, 10) || 1),
            unit: p.unit || '個',
            inStockDate: p.inStockDate || p.nyukoDate || p.inDate || '',
            outStockDate: p.outStockDate || p.syukkoDate || p.outDate || '',
            note: p.note || p.bikou || ''
          }));
        setSubParts(subs);
      }

    } catch (e) {
      console.warn('Failed to fetch live sub parts:', e);
    } finally {
      setIsLoadingSubParts(false);
    }
  };

  // 全体ステータスの更新
  const handleUpdateStatus = async (newStatus: SiteStatus) => {
    if (!currentSite) return;
    const updated = { ...currentSite, status: newStatus };
    setCurrentSite(updated);
    await saveSiteChanges(updated);
  };

  // 主要部品のステータスまたは日付のクイック更新
  const handleUpdatePart = async (partId: string, updates: Partial<SiteMainPart>) => {
    if (!currentSite) return;
    const newMainParts = currentSite.mainParts.map(p => {
      if (p.id === partId) {
        return { ...p, ...updates };
      }
      return p;
    });

    // 部品すべてが施工済なら全体ステータスも完了に近づける
    const allConstructed = newMainParts.every(p => p.status === 'constructed' || p.status === 'inspected');
    const newSiteStatus: SiteStatus = allConstructed ? 'completed' : (newMainParts.some(p => p.status !== 'waiting_stock') ? 'in_progress' : currentSite.status);

    const updated = {
      ...currentSite,
      mainParts: newMainParts,
      status: newSiteStatus
    };
    setCurrentSite(updated);
    await saveSiteChanges(updated);
  };

  // サーバーへ変更を保存
  const saveSiteChanges = async (targetSite: Site) => {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/sites/${targetSite.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(targetSite)
      });
      if (!res.ok) {
        throw new Error(`更新に失敗しました (${res.status})`);
      }
      const json = await res.json();
      if (json.success && json.site) {
        onUpdateSite(json.site);
        setCurrentSite(json.site);
      }
    } catch (err: any) {
      console.error('Save site error:', err);
      setSaveError(err.message || '更新に失敗しました。');
    } finally {
      setIsSaving(false);
    }
  };

  // コメント投稿
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!currentSite || !commentInput.trim()) return;

    setIsSubmittingComment(true);
    try {
      const res = await fetch(`${API_BASE_URL}/sites/${currentSite.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          content: commentInput.trim(),
          user: currentUser
        })
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.comment) {
          const updatedComments = [...(currentSite.comments || []), json.comment];
          const updatedSite = { ...currentSite, comments: updatedComments };
          setCurrentSite(updatedSite);
          onUpdateSite(updatedSite);
          setCommentInput('');
        }
      }
    } catch (err) {
      console.error('Failed to post comment:', err);
    } finally {
      setIsSubmittingComment(false);
    }
  };

  // ファイル添付の追加
  const handleAddAttachment = async () => {
    if (!currentSite || !newAttachmentName.trim() || !newAttachmentUrl.trim()) return;

    const newAtt = {
      id: `att-${Date.now()}`,
      name: newAttachmentName.trim(),
      url: newAttachmentUrl.trim(),
      uploadedBy: currentUser.name,
      uploadedAt: new Date().toISOString()
    };

    const updated = {
      ...currentSite,
      attachments: [...(currentSite.attachments || []), newAtt]
    };
    setCurrentSite(updated);
    await saveSiteChanges(updated);
    setNewAttachmentName('');
    setNewAttachmentUrl('');
    setShowAddAttachment(false);
  };

  // 現場削除
  const handleDelete = () => {
    if (!currentSite) return;
    if (window.confirm(`現場「${currentSite.siteName}」を完全に削除してもよろしいですか？`)) {
      onDeleteSite(currentSite.id);
      onClose();
    }
  };

  // 簡易エクスポート（CRM用データプレビュー & CSV出力）
  const handleExportCsv = () => {
    if (!currentSite) return;
    const rows = [
      ['現場コード', '現場名', 'EG台数', '元請', '工期開始', '工期終了', '施工日', '主担当', '部品型番', '品名', '出庫日', '部品施工日', '部品担当', '進捗状況'],
      ...currentSite.mainParts.map(p => [
        currentSite.siteCode,
        currentSite.siteName,
        currentSite.egCount,
        currentSite.customerName || '',
        currentSite.startDate || '',
        currentSite.endDate || '',
        currentSite.constructionDate || '',
        currentSite.primaryWorkerName || '',
        p.partCode,
        p.partName,
        p.outStockDate || '',
        p.constructionDate || '',
        p.workerName || '',
        p.status
      ])
    ];

    const csvContent = "data:text/csv;charset=utf-8,\uFEFF" + rows.map(e => e.map(cell => `"${cell}"`).join(",")).join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", `現場_${currentSite.siteCode}_施工データ.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  if (!isOpen || !site || !currentSite) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-5xl max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* モーダルヘッダー */}
        <div className="p-5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80 rounded-t-2xl">
          <div className="flex items-center gap-3">
            <span className="font-extrabold text-sm text-indigo-700 bg-indigo-50 border border-indigo-200 px-2.5 py-1 rounded-lg shadow-2xs">
              {currentSite.siteCode}
            </span>
            <div>
              <h3 className="font-bold text-lg text-slate-900 flex items-center gap-2">
                <span>{currentSite.siteName}</span>
                <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-200 text-slate-700">
                  EG {currentSite.egCount}台
                </span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                元請: {currentSite.customerName || '未設定'} / 施工場所: {currentSite.address || '未設定'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* ステータスバッジ切り替え */}
            <select
              value={currentSite.status}
              onChange={(e) => handleUpdateStatus(e.target.value as SiteStatus)}
              className={`text-xs font-bold px-3 py-1.5 rounded-lg border cursor-pointer ${
                currentSite.status === 'completed' ? 'bg-emerald-50 text-emerald-700 border-emerald-300' :
                currentSite.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-300' :
                currentSite.status === 'on_hold' ? 'bg-rose-50 text-rose-700 border-rose-300' :
                'bg-slate-100 text-slate-700 border-slate-300'
              }`}
            >
              <option value="not_started">未着手</option>
              <option value="in_progress">施工進行中</option>
              <option value="completed">全施工完了</option>
              <option value="on_hold">保留</option>
            </select>

            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 rounded-xl transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* サブナビゲーションタブ */}
        <div className="flex border-b border-slate-200 bg-white px-5 text-xs font-bold text-slate-600 gap-6">
          <button
            onClick={() => setActiveTab('parts')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'parts'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Layers className="w-4 h-4" />
            <span>主要部品・施工進捗 ({currentSite.mainParts.length}台)</span>
          </button>
          <button
            onClick={() => setActiveTab('timeline')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'timeline'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            <span>申し送り・コメント ({currentSite.comments?.length || 0})</span>
          </button>
          <button
            onClick={() => setActiveTab('info')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'info'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4" />
            <span>現場情報・図面・添付</span>
          </button>
          <button
            onClick={() => setActiveTab('export')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'export'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
            <span>帳票・Excel・自主検査</span>
          </button>
        </div>

        {/* コンテンツボディ */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {saveError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{saveError}</span>
            </div>
          )}

          {/* TAB 1: 主要部品 & 付属部品 */}
          {activeTab === 'parts' && (
            <div className="space-y-6">
              {/* 主要部品 (1台ずつ分割管理) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                      <Layers className="w-4 h-4 text-indigo-600" />
                      主要部品施工管理（1台ごと展開）
                    </h4>
                    <p className="text-[11px] text-slate-500">
                      各主要部品の出庫・施工予定日、担当者、施工状況を個別に更新できます。
                    </p>
                  </div>
                </div>

                <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-100 shadow-2xs">
                  {currentSite.mainParts.map((part, idx) => (
                    <div key={part.id || idx} className="p-3 bg-white hover:bg-slate-50/50 transition-colors">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-3">
                          <span className="font-bold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded shadow-2xs">
                            {part.unitIndex && part.originalQuantity ? `${part.unitIndex}/${part.originalQuantity}台目` : `${idx + 1}台目`}
                          </span>
                          <div>
                            <div className="flex items-center gap-2">
                              <strong className="text-sm text-slate-900">{part.partCode}</strong>
                              <span className="text-xs text-slate-600">{part.partName}</span>
                            </div>
                            {part.serialNo && (
                              <div className="text-[10px] text-slate-400">機番: {part.serialNo}</div>
                            )}
                          </div>
                        </div>

                        {/* 各部品の施工設定コントロール */}
                        <div className="flex flex-wrap items-center gap-2 text-xs">
                          {/* 出庫日 */}
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                            <span className="text-[10px] text-slate-500 font-semibold">出庫:</span>
                            <input
                              type="date"
                              value={part.outStockDate || ''}
                              onChange={(e) => handleUpdatePart(part.id, { outStockDate: e.target.value })}
                              className="text-[11px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer text-slate-700"
                            />
                          </div>

                          {/* 施工日 */}
                          <div className="flex items-center gap-1 bg-indigo-50/60 border border-indigo-200 px-2 py-1 rounded">
                            <span className="text-[10px] text-indigo-700 font-bold">施工:</span>
                            <input
                              type="date"
                              value={part.constructionDate || ''}
                              onChange={(e) => handleUpdatePart(part.id, { constructionDate: e.target.value })}
                              className="text-[11px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer font-bold text-indigo-900"
                            />
                          </div>

                          {/* 担当者 */}
                          <div className="flex items-center gap-1 bg-slate-50 border border-slate-200 px-2 py-1 rounded">
                            <span className="text-[10px] text-slate-500 font-semibold">担当:</span>
                            <select
                              value={part.workerId || currentSite.primaryWorkerId || ''}
                              onChange={(e) => {
                                const u = allUsers.find(x => x.id === e.target.value);
                                handleUpdatePart(part.id, {
                                  workerId: e.target.value,
                                  workerName: u?.name || ''
                                });
                              }}
                              className="text-[11px] bg-transparent border-none p-0 focus:ring-0 cursor-pointer font-medium text-slate-800"
                            >
                              <option value="">未割当</option>
                              {allUsers.map(u => (
                                <option key={u.id} value={u.id}>{u.name}</option>
                              ))}
                            </select>
                          </div>

                          {/* 進捗ステータス */}
                          <select
                            value={part.status}
                            onChange={(e) => handleUpdatePart(part.id, { status: e.target.value as PartStatus })}
                            className={`text-xs font-bold px-2 py-1 rounded border cursor-pointer ${
                              part.status === 'constructed' ? 'bg-indigo-100 text-indigo-800 border-indigo-300' :
                              part.status === 'inspected' ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                              part.status === 'stock_out' ? 'bg-blue-100 text-blue-800 border-blue-300' :
                              part.status === 'stock_in' ? 'bg-amber-100 text-amber-800 border-amber-300' :
                              'bg-slate-100 text-slate-600 border-slate-200'
                            }`}
                          >
                            <option value="waiting_stock">入庫待ち</option>
                            <option value="stock_in">入庫済</option>
                            <option value="stock_out">出庫済</option>
                            <option value="constructed">施工済</option>
                            <option value="inspected">自主検査済</option>
                          </select>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* 付属部品 (在庫DB都度照会・表示) */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h5 className="font-bold text-xs text-slate-700">
                      付属部品一覧 (在庫データベース連携・都度照会)
                    </h5>
                    {isLoadingSubParts && (
                      <RefreshCw className="w-3.5 h-3.5 animate-spin text-indigo-600" />
                    )}
                  </div>
                  <span className="text-[10px] text-slate-400">
                    ※ 付属部品は本SNSデータベースには保存せず、都度在庫DBから取得して表示されます
                  </span>
                </div>

                {subParts.length === 0 ? (
                  <div className="text-xs text-slate-400 italic">
                    付属部品データはありません。
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    {subParts.map((sub, i) => (
                      <div key={i} className="bg-white p-2.5 rounded-lg border border-slate-200 text-xs shadow-2xs">
                        <div className="font-bold text-slate-800">{sub.partCode}</div>
                        <div className="text-[11px] text-slate-500 truncate">{sub.partName}</div>
                        <div className="text-[10px] text-slate-400 mt-1 flex justify-between">
                          <span>数量: {sub.quantity}{sub.unit}</span>
                          <span>出庫: {sub.outStockDate || '未定'}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 2: 申し送り・コメント */}
          {activeTab === 'timeline' && (
            <div className="space-y-4">
              <div className="space-y-3 max-h-[350px] overflow-y-auto pr-2">
                {(!currentSite.comments || currentSite.comments.length === 0) ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    申し送り・コメントはまだありません。現場に関する連絡や特記事項を投稿してください。
                  </div>
                ) : (
                  currentSite.comments.map(c => (
                    <div key={c.id} className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800">{c.userName}</span>
                        <span className="text-[10px] text-slate-400">
                          {new Date(c.createdAt).toLocaleString('ja-JP')}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 whitespace-pre-wrap">{c.content}</p>
                    </div>
                  ))
                )}
              </div>

              {/* コメント投稿フォーム */}
              <form onSubmit={handleAddComment} className="flex gap-2">
                <input
                  type="text"
                  value={commentInput}
                  onChange={(e) => setCommentInput(e.target.value)}
                  placeholder="現場への申し送り・連絡を入力..."
                  className="flex-1 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                />
                <button
                  type="submit"
                  disabled={isSubmittingComment || !commentInput.trim()}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                >
                  <Send className="w-3.5 h-3.5" />
                  投稿
                </button>
              </form>
            </div>
          )}

          {/* TAB 3: 現場情報・図面・添付ファイル */}
          {activeTab === 'info' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h5 className="font-bold text-slate-800 border-b border-slate-200 pb-1">
                    現場詳細情報
                  </h5>
                  <div><strong>現場コード:</strong> {currentSite.siteCode}</div>
                  <div><strong>現場名:</strong> {currentSite.siteName}</div>
                  <div><strong>元請 / 取引先:</strong> {currentSite.customerName || '未設定'}</div>
                  <div><strong>施工場所:</strong> {currentSite.address || '未設定'}</div>
                  <div><strong>発注No:</strong> {currentSite.orderNo || '未設定'}</div>
                  <div><strong>着工〜完工:</strong> {currentSite.startDate || '未定'} 〜 {currentSite.endDate || '未定'}</div>
                  <div><strong>主担当施工者:</strong> {currentSite.primaryWorkerName || '未定'}</div>
                </div>

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                  <h5 className="font-bold text-slate-800 border-b border-slate-200 pb-1">
                    NAS図面連携
                  </h5>
                  {currentSite.drawingUrl ? (
                    <div>
                      <p className="text-slate-600 mb-2">NAS上の図面URL / パスが設定されています:</p>
                      <a
                        href={currentSite.drawingUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-bold text-xs transition-colors shadow-2xs"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        NAS図面を開く
                      </a>
                    </div>
                  ) : (
                    <p className="text-slate-400">図面URLは設定されていません。</p>
                  )}

                  <div className="pt-2">
                    <label className="text-[10px] text-slate-500 font-semibold block mb-1">
                      図面URL・パスの変更
                    </label>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        defaultValue={currentSite.drawingUrl || ''}
                        onBlur={(e) => {
                          if (e.target.value !== currentSite.drawingUrl) {
                            handleUpdatePart('', {}); // trigger
                            const updated = { ...currentSite, drawingUrl: e.target.value };
                            setCurrentSite(updated);
                            saveSiteChanges(updated);
                          }
                        }}
                        placeholder="例: /drawings/NHQ136A/ 或いは NAS直リンク"
                        className="flex-1 px-2.5 py-1 bg-white border border-slate-300 rounded text-xs"
                      />
                    </div>
                  </div>
                </div>
              </div>

              {/* 添付ファイル管理 */}
              <div className="space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
                  <h5 className="font-bold text-xs text-slate-800 flex items-center gap-1.5">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                    添付ファイル・現場写真・指示書
                  </h5>
                  <button
                    type="button"
                    onClick={() => setShowAddAttachment(!showAddAttachment)}
                    className="text-xs font-semibold text-indigo-600 hover:underline cursor-pointer"
                  >
                    + ファイル・リンクを追加
                  </button>
                </div>

                {showAddAttachment && (
                  <div className="p-3 bg-indigo-50/60 rounded-xl border border-indigo-100 flex flex-wrap gap-2 items-center text-xs">
                    <input
                      type="text"
                      value={newAttachmentName}
                      onChange={(e) => setNewAttachmentName(e.target.value)}
                      placeholder="ファイル名 (例: 施工要領書.pdf)"
                      className="px-2 py-1 bg-white border border-indigo-200 rounded text-xs flex-1 min-w-[150px]"
                    />
                    <input
                      type="text"
                      value={newAttachmentUrl}
                      onChange={(e) => setNewAttachmentUrl(e.target.value)}
                      placeholder="URLまたはパス"
                      className="px-2 py-1 bg-white border border-indigo-200 rounded text-xs flex-1 min-w-[200px]"
                    />
                    <button
                      type="button"
                      onClick={handleAddAttachment}
                      className="px-3 py-1 bg-indigo-600 text-white rounded font-bold cursor-pointer"
                    >
                      追加
                    </button>
                  </div>
                )}

                {(!currentSite.attachments || currentSite.attachments.length === 0) ? (
                  <div className="text-xs text-slate-400 italic">
                    添付ファイルはありません。
                  </div>
                ) : (
                  <div className="space-y-1.5">
                    {currentSite.attachments.map(att => (
                      <div key={att.id} className="flex items-center justify-between p-2 bg-slate-50 rounded-lg text-xs border border-slate-200">
                        <span className="font-medium text-slate-800">{att.name}</span>
                        <a
                          href={att.url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-indigo-600 hover:underline font-semibold"
                        >
                          開く →
                        </a>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* 現場削除 */}
              <div className="pt-4 border-t border-slate-200 flex justify-end">
                <button
                  type="button"
                  onClick={handleDelete}
                  className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 rounded-lg text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  この現場を削除
                </button>
              </div>
            </div>
          )}

          {/* TAB 4: 帳票・Excel・自主検査 */}
          {activeTab === 'export' && (
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl space-y-2">
                <h5 className="font-bold text-sm text-emerald-900 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-700" />
                  CRM連携用 Excel/CSV データ出力
                </h5>
                <p className="text-xs text-emerald-700">
                  本現場の基本情報、EG台数、1台ごとに分割展開された部品施工情報（出庫日・施工日・施工者・進捗）をCRM取り込み形式で出力します。
                </p>
                <div className="pt-2">
                  <button
                    onClick={handleExportCsv}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <Download className="w-4 h-4" />
                    施工データ CSV (Excel対応) を出力
                  </button>
                </div>
              </div>

              <div className="p-4 bg-blue-50/60 border border-blue-200 rounded-xl space-y-2">
                <h5 className="font-bold text-sm text-blue-900 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-blue-700" />
                  自主検査床 PDF / 帳票出力プレビュー
                </h5>
                <p className="text-xs text-blue-700">
                  施工後の自主検査床チェックリストおよび完了報告帳票の出力基盤です。
                </p>
                <div className="pt-1">
                  <button
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <FileText className="w-4 h-4" />
                    自主検査帳票を印刷 / PDFプレビュー
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* フッター */}
        <div className="p-4 border-t border-slate-200 bg-slate-50/80 rounded-b-2xl flex items-center justify-between text-xs text-slate-500">
          <span>最終更新: {new Date(currentSite.updatedAt).toLocaleString('ja-JP')}</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-slate-200 hover:bg-slate-300 text-slate-700 rounded-lg font-semibold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      </div>
    </div>
  );
};
