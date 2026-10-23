import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Layers, Calendar, User as UserIcon, Building, MapPin, 
  ExternalLink, MessageSquare, Send, CheckCircle2, Clock, 
  FileText, Paperclip, Trash2, Edit3, Save, RefreshCw, AlertCircle, FileSpreadsheet, Download, Eye, HardHat
} from 'lucide-react';
import { Site, SiteMainPart, SiteSubPart, SiteComment, SiteStatus, PartStatus } from '../../types/site';
import { User, AttachmentFile, CalendarEvent } from '../../types';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { API_BASE_URL } from '../../config/api';
import { FilePreviewModal } from '../FilePreviewModal';

interface SiteDetailModalProps {
  site: Site | null;
  isOpen: boolean;
  onClose: () => void;
  onUpdateSite: (updatedSite: Site) => void;
  onDeleteSite: (siteId: string) => void;
  currentUser: User;
  allUsers: User[];
  events?: CalendarEvent[];
}

/**
 * Windows UNCパス (\volume1\Teraoka-Sekkei\share\02-施工図PDF\現場A\平面図.pdf 等) や Z:\share\02-施工図PDF\現場A\平面図.pdf
 * から 02-施工図PDF 内の相対パス (例: 現場A/平面図.pdf) を自動補正するヘルパー
 */
export function normalizeDrawingPath(rawPath?: string, siteName?: string): string {
  if (!rawPath) return '';
  let cleaned = rawPath.trim().replace(/^["']|["']$/g, '').replace(/\\/g, '/');
  
  cleaned = cleaned.replace(/^(?:\\\\|\/\/)[^\/]+\/(?:Teraoka-Sekkei\/)?(?:share\/)?02-施工図PDF\/?/i, '');
  cleaned = cleaned.replace(/^(?:\\\\|\/\/)[^\/]+\/[^\/]+\/02-施工図PDF\/?/i, '');
  cleaned = cleaned.replace(/^(?:\/|\\\\)volume1\/Teraoka-Sekkei\/share\/02-施工図PDF\/?/i, '');
  cleaned = cleaned.replace(/^[a-zA-Z]:\/(?:02-施工図PDF\/)?/i, '');
  cleaned = cleaned.replace(/^\/?02-施工図PDF\//i, '');
  cleaned = cleaned.replace(/^\/+/g, '');

  return cleaned;
}

/**
 * 施工図PDFファイル登録のフォーマット・所定フォルダバリデーション
 */
export async function validateAndResolveDrawingPath(rawInput: string): Promise<{
  valid: boolean;
  resolvedPath?: string;
  error?: string;
}> {
  if (!rawInput || !rawInput.trim()) {
    return { valid: false, error: 'ファイルパスが空です。' };
  }

  const trimmed = rawInput.trim().replace(/^["']|["']$/g, '');
  const normalizedSlashes = trimmed.replace(/\\/g, '/');
  const fileName = normalizedSlashes.split('/').pop() || trimmed;

  // ① 拡張子チェック (PDF以外は即座に拒否)
  const ext = fileName.split('.').pop()?.toLowerCase();
  if (ext !== 'pdf') {
    return {
      valid: false,
      error: `【登録エラー】施工図はPDF形式（.pdf）のファイルのみ登録可能です。[対象: ${fileName}]`
    };
  }

  // ② 所定のフォルダ (02-施工図PDF) チェック
  const isWinAbsolutePath = /^(?:\\\\|\/\/|[a-zA-Z]:\/)/i.test(normalizedSlashes);
  if (isWinAbsolutePath && !/02-施工図PDF/i.test(normalizedSlashes)) {
    return {
      valid: false,
      error: `【登録エラー】所定のフォルダ（02-施工図PDF）以外のファイルは登録できません。[対象: ${fileName}]`
    };
  }

  // ③ サーバーでのパス検証 API 呼び出し
  try {
    const res = await fetch(`${API_BASE_URL}/sites/drawings/validate?path=${encodeURIComponent(trimmed)}`);
    const json = await res.json();
    if (res.ok && json.success && json.valid && json.resolvedPath) {
      return {
        valid: true,
        resolvedPath: json.resolvedPath
      };
    } else {
      return {
        valid: false,
        error: json.error || `【登録エラー】所定のフォルダ（02-施工図PDF）内に指定されたファイルが見つかりません。[対象: ${fileName}]`
      };
    }
  } catch (_) {
    const norm = normalizeDrawingPath(trimmed);
    if (!norm) {
      return {
        valid: false,
        error: `【登録エラー】有効な施工図パスを指定してください。[対象: ${fileName}]`
      };
    }
    return {
      valid: true,
      resolvedPath: norm
    };
  }
}

export function getSiteDrawingList(site?: Site | null): string[] {
  if (!site) return [];
  if (Array.isArray(site.drawings) && site.drawings.length > 0) {
    return site.drawings.map(d => normalizeDrawingPath(d)).filter(Boolean);
  }
  if (site.drawingUrl) {
    const raw = site.drawingUrl.trim();
    if (raw.startsWith('[')) {
      try {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed.map((d: string) => normalizeDrawingPath(d)).filter(Boolean);
      } catch (_) {}
    }
    const norm = normalizeDrawingPath(raw);
    return norm ? [norm] : [];
  }
  return [];
}

export const SiteDetailModal: React.FC<SiteDetailModalProps> = ({
  site,
  isOpen,
  onClose,
  onUpdateSite,
  onDeleteSite,
  currentUser,
  allUsers,
  events,
}) => {
  const [activeTab, setActiveTab] = useState<'parts' | 'timeline' | 'schedule' | 'info' | 'export'>('parts');
  const [fetchedEvents, setFetchedEvents] = useState<CalendarEvent[]>([]);

  // 親から events が渡されていない場合は自動取得
  useEffect(() => {
    if (events && events.length > 0) return;
    let isMounted = true;
    fetch(`${API_BASE_URL}/events`)
      .then(res => res.ok ? res.json() : null)
      .then(data => {
        if (isMounted && data && Array.isArray(data.events)) {
          setFetchedEvents(data.events);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [events]);

  // 編集用ローカルステート
  const [currentSite, setCurrentSite] = useState<Site | null>(site);

  // 該当現場に紐づく施工スケジュール・実績を抽出
  const siteEvents = useMemo(() => {
    const allEvts = (events && events.length > 0) ? events : fetchedEvents;
    if (!currentSite) return [];
    const siteCodeNorm = (currentSite.siteCode || '').trim().toLowerCase();
    const siteNameNorm = (currentSite.siteName || '').trim();

    return allEvts.filter(e => {
      // 1. siteId で完全一致
      if (e.siteId && e.siteId === currentSite.id) return true;
      // 2. siteCode で完全一致
      if (e.siteCode && siteCodeNorm && e.siteCode.trim().toLowerCase() === siteCodeNorm) return true;
      // 3. 工事タイプでタイトル内に現場コードや現場名が含まれる場合
      if (e.type === 'construction') {
        if (siteCodeNorm && e.title.toLowerCase().includes(siteCodeNorm)) return true;
        if (siteNameNorm && e.title.includes(siteNameNorm)) return true;
      }
      return false;
    }).sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [events, fetchedEvents, currentSite]);
  const [isEditingInfo, setIsEditingInfo] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [drawingErrorModal, setDrawingErrorModal] = useState<string | null>(null);

  // コメント入力
  const [commentInput, setCommentInput] = useState('');
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);

  // ファイルプレビュー用ステート
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);
  const [isDragOverDrawing, setIsDragOverDrawing] = useState(false);

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
      ['現場コード', '現場名', 'EG台数', '号機/台数', '元請', '工期開始', '工期終了', '施工日', '主担当', '部品型番', '品名', '出庫日', '部品施工日', '部品担当', '進捗状況'],
      ...currentSite.mainParts.map((p, idx) => {
        const total = p.originalQuantity && p.originalQuantity > 1 ? p.originalQuantity : (currentSite.egCount > 1 ? currentSite.egCount : (currentSite.mainParts.length > 1 ? currentSite.mainParts.length : 1));
        const uIdx = p.unitIndex || (idx + 1);
        const unitLabel = total > 1 ? `${uIdx}/${total}台目` : `${uIdx}台目`;
        return [
          currentSite.siteCode,
          currentSite.siteName,
          currentSite.egCount,
          unitLabel,
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
        ];
      })
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
            onClick={() => setActiveTab('schedule')}
            className={`py-3 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
              activeTab === 'schedule'
                ? 'border-indigo-600 text-indigo-700'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            <Calendar className="w-4 h-4 text-amber-600" />
            <span className="flex items-center gap-1">
              <span>施工予定・実績</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                siteEvents.length > 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-500'
              }`}>
                {siteEvents.length}
              </span>
            </span>
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
                            {(() => {
                              const total = part.originalQuantity && part.originalQuantity > 1 ? part.originalQuantity : (currentSite.egCount > 1 ? currentSite.egCount : (currentSite.mainParts.length > 1 ? currentSite.mainParts.length : 1));
                              const uIdx = part.unitIndex || (idx + 1);
                              return total > 1 ? `${uIdx}/${total}台目` : `${uIdx}台目`;
                            })()}
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

                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-200 pb-1">
                    <h5 className="font-bold text-slate-800 flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-indigo-600" />
                      <span>NAS施工図PDF連携 (02-施工図PDF)</span>
                    </h5>
                    <span className="text-[10px] bg-indigo-100 text-indigo-800 px-1.5 py-0.5 rounded font-bold">
                      D&D / パス自動整形
                    </span>
                  </div>

                  {/* 多機能 複数NAS施工図PDFリスト & 一括D&Dエリア */}
                  {(() => {
                    const currentDrawings = getSiteDrawingList(currentSite);

                    const handleAddPaths = async (rawInput: string) => {
                      if (!rawInput.trim() || !currentSite) return;
                      const lines = rawInput.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
                      const resolvedList: string[] = [];
                      const errors: string[] = [];

                      for (const item of lines) {
                        const check = await validateAndResolveDrawingPath(item);
                        if (check.valid && check.resolvedPath) {
                          resolvedList.push(check.resolvedPath);
                        } else if (check.error) {
                          errors.push(check.error);
                        }
                      }

                      if (errors.length > 0) {
                        setDrawingErrorModal(errors.join('\n\n'));
                      }

                      if (resolvedList.length > 0) {
                        const updatedList = Array.from(new Set([...currentDrawings, ...resolvedList]));
                        const primary = updatedList[0];
                        const updated = { ...currentSite, drawingUrl: primary, drawings: updatedList };
                        setCurrentSite(updated);
                        saveSiteChanges(updated);
                      }
                    };

                    const handleRemoveDrawing = (indexToRemove: number) => {
                      if (!currentSite) return;
                      const updatedList = currentDrawings.filter((_, idx) => idx !== indexToRemove);
                      const primary = updatedList.length > 0 ? updatedList[0] : undefined;
                      const updated = { ...currentSite, drawingUrl: primary, drawings: updatedList };
                      setCurrentSite(updated);
                      saveSiteChanges(updated);
                    };

                    return (
                      <div className="space-y-3">
                        {/* 登録済み図面一覧リスト */}
                        {currentDrawings.length > 0 && (
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                              <span>登録済み施工図面 ({currentDrawings.length}件)</span>
                              <span className="text-[10px] text-slate-400">クリックでPDFビューアー閲覧</span>
                            </div>
                            <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-1">
                              {currentDrawings.map((dwPath, idx) => {
                                const norm = normalizeDrawingPath(dwPath);
                                const dwFileName = norm.split('/').pop() || norm;
                                return (
                                  <div
                                    key={`dw-${idx}-${norm}`}
                                    className="p-2.5 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl flex items-center justify-between gap-2 shadow-2xs transition-all"
                                  >
                                    <div className="flex items-center gap-2 min-w-0 flex-1">
                                      <span className="w-5 h-5 rounded-md bg-indigo-50 text-indigo-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                        {idx + 1}
                                      </span>
                                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                                      <span className="font-mono text-xs font-bold text-slate-800 truncate" title={norm}>
                                        {dwFileName}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setPreviewFile({
                                            id: `drawing-${idx}-${Date.now()}`,
                                            name: dwFileName,
                                            url: `${API_BASE_URL}/sites/drawings/serve?path=${encodeURIComponent(norm)}`,
                                            type: 'pdf',
                                            size: 'NAS施工図PDF',
                                          });
                                          setIsPreviewOpen(true);
                                        }}
                                        className="px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-[11px] font-bold flex items-center gap-1 transition-all active:scale-95 cursor-pointer shadow-2xs"
                                        title="PDFビューアーで閲覧"
                                      >
                                        <Eye className="w-3 h-3" />
                                        <span>閲覧</span>
                                      </button>
                                      <a
                                        href={`${API_BASE_URL}/sites/drawings/serve?path=${encodeURIComponent(norm)}`}
                                        target="_blank"
                                        rel="noreferrer"
                                        className="p-1 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-lg text-[11px] transition-colors border border-slate-200 cursor-pointer"
                                        title="ダウンロード / 別タブ表示"
                                      >
                                        <Download className="w-3.5 h-3.5" />
                                      </a>
                                      <button
                                        type="button"
                                        onClick={() => handleRemoveDrawing(idx)}
                                        className="p-1 bg-rose-50 hover:bg-rose-100 text-rose-600 rounded-lg transition-colors cursor-pointer"
                                        title="この図面を削除"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* 複数一括 D&D エリア */}
                        <div
                          onDragOver={(e) => { e.preventDefault(); setIsDragOverDrawing(true); }}
                          onDragLeave={() => setIsDragOverDrawing(false)}
                          onDrop={async (e) => {
                            e.preventDefault();
                            setIsDragOverDrawing(false);
                            if (!currentSite) return;

                            const newPaths: string[] = [];
                            const errors: string[] = [];
                            const files = e.dataTransfer.files ? Array.from(e.dataTransfer.files) : [];
                            const droppedText = e.dataTransfer.getData('text/plain') || e.dataTransfer.getData('text') || e.dataTransfer.getData('text/uri-list');

                            if (files.length > 0) {
                              for (const file of files) {
                                const fileName = file.name;
                                if (!fileName) continue;
                                const check = await validateAndResolveDrawingPath(fileName);
                                if (check.valid && check.resolvedPath) {
                                  newPaths.push(check.resolvedPath);
                                } else if (check.error) {
                                  errors.push(check.error);
                                }
                              }
                            } else if (droppedText) {
                              const lines = droppedText.split(/[\r\n,;]+/).map(s => s.trim()).filter(Boolean);
                              for (const line of lines) {
                                const check = await validateAndResolveDrawingPath(line);
                                if (check.valid && check.resolvedPath) {
                                  newPaths.push(check.resolvedPath);
                                } else if (check.error) {
                                  errors.push(check.error);
                                }
                              }
                            }

                            if (errors.length > 0) {
                              setDrawingErrorModal(errors.join('\n\n'));
                            }

                            if (newPaths.length > 0) {
                              const merged = Array.from(new Set([...currentDrawings, ...newPaths]));
                              const primary = merged[0];
                              const updated = { ...currentSite, drawingUrl: primary, drawings: merged };
                              setCurrentSite(updated);
                              saveSiteChanges(updated);
                            }
                          }}
                          className={`p-3.5 rounded-xl border-2 border-dashed transition-all text-center ${
                            isDragOverDrawing
                              ? 'border-indigo-500 bg-indigo-50/80 ring-2 ring-indigo-500/20 shadow-md'
                              : 'border-slate-300 bg-white hover:border-slate-400'
                          }`}
                        >
                          <div className="py-1 space-y-1">
                            <div className="w-8 h-8 rounded-full bg-indigo-50 text-indigo-600 mx-auto flex items-center justify-center mb-1 shadow-2xs">
                              <FileText className="w-4 h-4" />
                            </div>
                            <p className="text-xs font-bold text-slate-700">
                              施工図PDFをドラッグ＆ドロップ（複数ファイル一括登録対応）
                            </p>
                            <p className="text-[10px] text-slate-400">
                              エクスプローラーから複数のPDFを一括でドラッグすると自動でサブフォルダ階層を解決して登録します
                            </p>
                          </div>
                        </div>

                        {/* パス手動入力 / 複数貼り付け */}
                        <div>
                          <label className="text-[10px] text-slate-500 font-bold block mb-1">
                            施工図パス追加（ファイル名またはパスを貼り付け）
                          </label>
                          <input
                            type="text"
                            placeholder="例: N-26-158S_いすゞ自動車.pdf (Enterで検索追加)"
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                const val = (e.target as HTMLInputElement).value;
                                await handleAddPaths(val);
                                (e.target as HTMLInputElement).value = '';
                              }
                            }}
                            onBlur={async (e) => {
                              const val = e.target.value;
                              if (val.trim()) {
                                await handleAddPaths(val);
                                e.target.value = '';
                              }
                            }}
                          />
                        </div>
                      </div>
                    );
                  })()}
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
                        <span className="font-medium text-slate-800 truncate mr-2" title={att.name}>{att.name}</span>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              setPreviewFile({
                                id: att.id,
                                name: att.name,
                                url: att.url,
                                size: typeof att.size === 'number' ? `${(att.size / 1024 / 1024).toFixed(2)} MB` : String(att.size || ''),
                                type: (att as any).type || '',
                              });
                              setIsPreviewOpen(true);
                            }}
                            className="px-2 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-md flex items-center gap-1 text-[11px] transition-colors cursor-pointer"
                          >
                            <Eye className="w-3 h-3" />
                            プレビュー
                          </button>
                          <a
                            href={att.url}
                            download={att.name}
                            target="_blank"
                            rel="noreferrer"
                            className="p-1 text-slate-400 hover:text-indigo-600 rounded-md transition-colors"
                            title="ダウンロード"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </a>
                        </div>
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

          {/* TAB 5: 施工スケジュール・実績タイムライン */}
          {activeTab === 'schedule' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-3 p-4 bg-slate-50 border border-slate-200/80 rounded-xl">
                <div>
                  <h4 className="font-extrabold text-sm text-slate-900 flex items-center gap-2">
                    <HardHat className="w-4 h-4 text-amber-600" />
                    <span>現場施工スケジュール・施工実績</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800">
                      計 {siteEvents.length} 件
                    </span>
                  </h4>
                  <p className="text-xs text-slate-500 mt-1">
                    カレンダーの工事予定で本現場が紐付けられたスケジュールです。いつ・誰が・どの乗り込み種別で施工したか（施工予定か）を確認できます。
                  </p>
                </div>
              </div>

              {siteEvents.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                  <div className="w-12 h-12 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3">
                    <Calendar className="w-6 h-6" />
                  </div>
                  <h5 className="font-bold text-sm text-slate-800">施工スケジュールはまだ登録されていません</h5>
                  <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                    カレンダー画面の「予定を追加」から「工事」を選択し、現場名として「{currentSite.siteName}」を選択・登録すると、本画面に施工履歴・予定が自動集約されます。
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {siteEvents.map((evt, idx) => {
                    const startDate = new Date(evt.start);
                    const endDate = evt.end ? new Date(evt.end) : null;
                    const isPast = startDate.getTime() < Date.now();
                    const phase = evt.constructionPhase || (
                      evt.title.includes('新規') ? 'new' :
                      evt.title.includes('出庫') ? 'shukko' :
                      evt.title.includes('残') ? 'remaining' : undefined
                    );

                    const attendees = (evt.attendees && evt.attendees.length > 0)
                      ? evt.attendees
                      : (evt.createdBy ? [evt.createdBy] : []);

                    const dateDisplay = startDate.toLocaleDateString('ja-JP', {
                      timeZone: 'Asia/Tokyo',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                      weekday: 'short'
                    });

                    const timeDisplay = evt.isAllDay
                      ? '終日'
                      : `${startDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}${
                          endDate ? ` 〜 ${endDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' })}` : ''
                        }`;

                    return (
                      <div
                        key={evt.id || idx}
                        className="p-4 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl shadow-2xs hover:shadow-xs transition-all space-y-3"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
                          <div className="flex items-center gap-2 flex-wrap">
                            {/* 乗り込み種別バッジ */}
                            {phase === 'new' && (
                              <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-emerald-600 text-white shadow-2xs">
                                【新規乗り込み】
                              </span>
                            )}
                            {phase === 'remaining' && (
                              <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-amber-500 text-white shadow-2xs">
                                【残工事】
                              </span>
                            )}
                            {phase === 'shukko' && (
                              <span className="px-2.5 py-0.5 rounded-md text-xs font-black bg-indigo-600 text-white shadow-2xs">
                                【出庫有】
                              </span>
                            )}
                            {!phase && (
                              <span className="px-2 py-0.5 rounded-md text-xs font-bold bg-slate-100 text-slate-700 border border-slate-200">
                                工事
                              </span>
                            )}

                            {/* 状態バッジ */}
                            {isPast ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                                施工済（実績）
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200">
                                施工予定
                              </span>
                            )}

                            <span className="font-extrabold text-sm text-slate-900">
                              {evt.title}
                            </span>
                          </div>

                          <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-700 bg-slate-50 px-2.5 py-1 rounded-lg border border-slate-200">
                            <Clock className="w-3.5 h-3.5 text-indigo-500" />
                            <span>{dateDisplay} {timeDisplay}</span>
                          </div>
                        </div>

                        {/* 施工担当者 */}
                        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-slate-400 font-semibold flex items-center gap-1">
                              <UserIcon className="w-3.5 h-3.5" />
                              <span>施工担当者:</span>
                            </span>
                            {attendees.length > 0 ? (
                              <div className="flex items-center gap-2 flex-wrap">
                                {attendees.map(u => (
                                  <div key={u.id} className="flex items-center gap-1.5 bg-slate-50 px-2 py-0.5 rounded-full border border-slate-200">
                                    <img
                                      src={getAvatarUrl(u.avatarUrl)}
                                      onError={handleAvatarError}
                                      alt={u.name}
                                      className="w-4 h-4 rounded-full object-cover"
                                    />
                                    <span className="font-bold text-slate-800">{u.name}</span>
                                    {u.department && (
                                      <span className="text-[10px] text-slate-400">({u.department})</span>
                                    )}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400">未指定</span>
                            )}
                          </div>

                          {evt.location && (
                            <div className="flex items-center gap-1 text-slate-600 bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                              <MapPin className="w-3 h-3 text-rose-500" />
                              <span>{evt.location}</span>
                            </div>
                          )}
                        </div>

                        {evt.memo && (
                          <div className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap">
                            {evt.memo}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
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

      {/* 施工図エラーモーダル */}
      {drawingErrorModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-rose-100 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 bg-rose-100 text-rose-600 rounded-xl shrink-0">
                <AlertCircle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-800">施工図ファイル登録エラー</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed whitespace-pre-wrap font-mono">
                  {drawingErrorModal}
                </p>
              </div>
            </div>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={() => setDrawingErrorModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl cursor-pointer transition-all active:scale-95 shadow-md"
              >
                OK（確認）
              </button>
            </div>
          </div>
        </div>
      )}

      {previewFile && (
        <FilePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          file={previewFile}
        />
      )}
    </div>
  );
};
