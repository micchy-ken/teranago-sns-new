import React, { useState, useEffect } from 'react';
import { X, Search, Database, Layers, Calendar, User as UserIcon, Plus, Trash2, CheckCircle2, AlertCircle, RefreshCw, MapPin, Building } from 'lucide-react';
import { Site, SiteMainPart, SiteSubPart, ExternalSiteLookupResult } from '../../types/site';
import { User } from '../../types';
import { API_BASE_URL } from '../../config/api';

interface SiteFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (newSite: Site) => void;
  currentUser: User;
  allUsers: User[];
}

export const SiteFormModal: React.FC<SiteFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  currentUser,
  allUsers
}) => {
  // 検索・外部在庫DB連携ステート
  const [searchQuery, setSearchQuery] = useState('');
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<ExternalSiteLookupResult[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // フォームステート
  const [siteCode, setSiteCode] = useState('');
  const [siteName, setSiteName] = useState('');
  const [egCount, setEgCount] = useState<number>(1);
  const [customerName, setCustomerName] = useState('');
  const [address, setAddress] = useState('');
  const [orderNo, setOrderNo] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [constructionDate, setConstructionDate] = useState('');
  const [primaryWorkerId, setPrimaryWorkerId] = useState<string>(currentUser.id);
  const [notes, setNotes] = useState('');
  const [drawingUrl, setDrawingUrl] = useState('');

  // 主要部品リスト (1台ずつ展開)
  const [mainParts, setMainParts] = useState<SiteMainPart[]>([]);

  // 付属部品 (在庫DBから取得・都度参照用プレビュー)
  const [subPartsPreview, setSubPartsPreview] = useState<SiteSubPart[]>([]);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  // モーダルオープン時の初期化
  useEffect(() => {
    if (isOpen) {
      setSearchQuery('');
      setSearchResults([]);
      setSearchError(null);
      setSiteCode('');
      setSiteName('');
      setEgCount(1);
      setCustomerName('');
      setAddress('');
      setOrderNo('');
      setStartDate('');
      setEndDate('');
      setConstructionDate('');
      setPrimaryWorkerId(currentUser.id);
      setNotes('');
      setDrawingUrl('');
      setMainParts([]);
      setSubPartsPreview([]);
      setSubmitError(null);
    }
  }, [isOpen, currentUser.id]);

  if (!isOpen) return null;

  // 在庫DBから現場を検索 (プロキシ or 直API)
  const handleSearchExternal = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);

    try {
      // 1. プロキシAPI (/api/sites/lookup/external) 経由で安全に通信
      const res = await fetch(`${API_BASE_URL}/sites/lookup/external?q=${encodeURIComponent(searchQuery.trim())}&limit=10`);
      if (res.ok) {
        const json = await res.json();
        const rawResults = Array.isArray(json.data) ? json.data : (Array.isArray(json.sites) ? json.sites : (Array.isArray(json) ? json : []));
        
        // ★重要: code/siteCode, name/siteName, period/scheduledStartDate の差異を吸収して正規化
        const results: ExternalSiteLookupResult[] = rawResults.map((item: any) => {
          const c = String(item.code || item.siteCode || '').trim();
          const n = String(item.name || item.siteName || '').trim();
          const period = String(item.period || '').trim();
          let sStart = item.scheduledStartDate || '';
          let sEnd = item.scheduledEndDate || '';
          if (period && (!sStart || !sEnd)) {
            const pParts = period.split(/[～~-]/);
            if (pParts[0]) sStart = pParts[0].trim().replace(/\//g, '-');
            if (pParts[1]) sEnd = pParts[1].trim().replace(/\//g, '-');
          }

          return {
            ...item,
            code: c,
            siteCode: c,
            name: n,
            siteName: n,
            egCount: typeof item.egCount === 'number' ? item.egCount : (parseInt(item.egCount, 10) || 0),
            customerName: item.customerName || item.customer || '',
            address: item.address || '',
            period: period,
            scheduledStartDate: sStart,
            scheduledEndDate: sEnd
          };
        });

        setSearchResults(results);
        if (results.length === 0) {
          setSearchError('該当する現場が見つかりませんでした。');
        }
      } else {
        throw new Error(`検索に失敗しました (${res.status})`);
      }
    } catch (err: any) {
      console.warn('External search error, trying direct or fallback:', err);
      setSearchError('在庫DBからの取得に失敗しました。手動で入力することも可能です。');
    } finally {
      setIsSearching(false);
    }
  };

  // 現場コード指定で詳細・部品を取得してフォームに展開
  const handleSelectExternalSite = async (item: ExternalSiteLookupResult) => {
    setIsSearching(true);
    setSearchError(null);

    const targetCode = item.code || item.siteCode || '';

    try {
      let detailData: any = item;
      if (targetCode) {
        const res = await fetch(`${API_BASE_URL}/sites/lookup/external?code=${encodeURIComponent(targetCode)}`);
        if (res.ok) {
          const json = await res.json();
          if (json.data) {
            detailData = Array.isArray(json.data) ? json.data[0] : json.data;
          } else if (json.site) {
            detailData = json.site;
          }
        }
      }

      // 基本情報の反映 (code / siteCode, name / siteName のどちらでも取得)
      const finalCode = detailData.code || detailData.siteCode || item.code || item.siteCode || '';
      const finalName = detailData.name || detailData.siteName || item.name || item.siteName || '';
      const finalEgCount = typeof detailData.egCount === 'number' ? detailData.egCount : (typeof item.egCount === 'number' ? item.egCount : 1);
      const finalCustomer = detailData.customerName || detailData.customer || item.customerName || '';
      const finalAddress = detailData.address || item.address || '';
      const finalOrderNo = detailData.orderNo || item.orderNo || '';
      const finalPeriod = detailData.period || item.period || '';

      setSiteCode(finalCode);
      setSiteName(finalName);
      setEgCount(finalEgCount > 0 ? finalEgCount : 1);
      setCustomerName(finalCustomer);
      setAddress(finalAddress);
      setOrderNo(finalOrderNo);

      let sDate = detailData.scheduledStartDate || item.scheduledStartDate || '';
      let eDate = detailData.scheduledEndDate || item.scheduledEndDate || '';
      if (finalPeriod && (!sDate || !eDate)) {
        const pParts = finalPeriod.split(/[～~-]/);
        if (pParts[0] && !sDate) sDate = pParts[0].trim().replace(/\//g, '-');
        if (pParts[1] && !eDate) eDate = pParts[1].trim().replace(/\//g, '-');
      }

      if (sDate) {
        setStartDate(sDate);
        setConstructionDate(sDate);
      }
      if (eDate) setEndDate(eDate);
      if (detailData.drawingUrl) setDrawingUrl(detailData.drawingUrl);

      // 部品の展開処理
      const rawParts = detailData.parts || item.parts || [];
      const expandedMains: SiteMainPart[] = [];
      const subs: SiteSubPart[] = [];

      rawParts.forEach((p: any, idx: number) => {
        const pCode = String(p.partCode || p.code || '').trim();
        const pName = String(p.partName || p.name || '部品').trim();
        const isMain = p.type === 'main' || p.isMain === true || (!p.type && p.isMain !== false);
        const qty = Math.max(1, parseInt(String(p.quantity || p.count || p.qty || 1), 10));
        const inDate = p.inStockDate || p.nyukoDate || p.inDate || '';
        const outDate = p.outStockDate || p.syukkoDate || p.outDate || '';

        if (isMain) {
          // ★重要要件: 「型番 2台」を「型番 1台」「型番 1台」と1台ごとに分割展開！
          for (let i = 1; i <= qty; i++) {
            expandedMains.push({
              id: `part-${Date.now()}-${idx}-${i}`,
              partCode: pCode,
              partName: pName,
              originalQuantity: qty,
              unitIndex: i,
              quantity: 1,
              unit: p.unit || '台',
              inStockDate: inDate,
              outStockDate: outDate,
              constructionDate: sDate || '',
              workerId: primaryWorkerId,
              workerName: allUsers.find(u => u.id === primaryWorkerId)?.name || currentUser.name,
              status: outDate ? 'stock_out' : (inDate ? 'stock_in' : 'waiting_stock'),
              note: qty > 1 ? `(${qty}台中 ${i}台目)` : ''
            });
          }
        } else {
          // 付属部品は都度参照
          subs.push({
            id: `sub-${idx}`,
            partCode: pCode,
            partName: pName,
            quantity: qty,
            unit: p.unit || '個',
            inStockDate: inDate,
            outStockDate: outDate,
            note: p.note || p.bikou
          });
        }
      });

      setMainParts(expandedMains);
      setSubPartsPreview(subs);
      setSearchResults([]); // 検索リストを閉じる
    } catch (err: any) {
      console.error('Error fetching site detail:', err);
      setSearchError('現場詳細・部品情報の展開に失敗しました。');
    } finally {
      setIsSearching(false);
    }

  };

  // 主要部品の手動追加
  const handleAddCustomPart = () => {
    const newPart: SiteMainPart = {
      id: `part-custom-${Date.now()}`,
      partCode: '',
      partName: '',
      quantity: 1,
      unit: '台',
      status: 'waiting_stock',
      workerId: primaryWorkerId,
      workerName: allUsers.find(u => u.id === primaryWorkerId)?.name || currentUser.name
    };
    setMainParts(prev => [...prev, newPart]);
  };

  // 主要部品の更新
  const handleUpdatePart = (index: number, updates: Partial<SiteMainPart>) => {
    setMainParts(prev => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      return copy;
    });
  };

  // 主要部品の削除
  const handleRemovePart = (index: number) => {
    setMainParts(prev => prev.filter((_, i) => i !== index));
  };

  // 現場登録の実行
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!siteCode.trim() || !siteName.trim()) {
      setSubmitError('現場コードと現場名は必須です。');
      return;
    }

    setIsSubmitting(true);
    setSubmitError(null);

    const primaryUser = allUsers.find(u => u.id === primaryWorkerId) || currentUser;

    const payload = {
      siteCode: siteCode.trim(),
      siteName: siteName.trim(),
      egCount,
      customerName: customerName.trim(),
      address: address.trim(),
      orderNo: orderNo.trim(),
      status: 'not_started',
      startDate: startDate || null,
      endDate: endDate || null,
      constructionDate: constructionDate || startDate || null,
      primaryWorkerId: primaryUser.id,
      primaryWorkerName: primaryUser.name,
      mainParts,
      subPartsCache: subPartsPreview,
      notes: notes.trim(),
      drawingUrl: drawingUrl.trim() || null,
      createdById: currentUser.id,
      createdByName: currentUser.name
    };

    try {
      const res = await fetch(`${API_BASE_URL}/sites`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || `登録に失敗しました (${res.status})`);
      }

      const json = await res.json();
      if (json.success && json.site) {
        onSuccess(json.site);
        onClose();
      } else {
        throw new Error('登録データの取得に失敗しました。');
      }
    } catch (err: any) {
      console.error('Submit site error:', err);
      setSubmitError(err.message || '登録処理中にエラーが発生しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col my-auto animate-in fade-in zoom-in-95 duration-150">
        {/* ヘッダー */}
        <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80 rounded-t-2xl">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-xl">
              <Database className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">現場新規登録</h3>
              <p className="text-xs text-slate-500">
                在庫データベースからの参照・部品分割展開 または 手動登録
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-200/70 text-slate-400 hover:text-slate-600 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* コンテンツ本体 */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* 1. 在庫DB 連携検索セクション */}
          <div className="p-4 bg-indigo-50/60 border border-indigo-100 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-indigo-600" />
                在庫データベースから現場情報を自動取得
              </label>
              <span className="text-[11px] text-indigo-600">
                ※ 現場コード（例: NHQ136A）または 現場名で検索
              </span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleSearchExternal();
                    }
                  }}
                  placeholder="現場コード（例: NHQ136A）または現場名を入力..."
                  className="w-full pl-9 pr-3 py-2 bg-white border border-indigo-200 rounded-lg text-sm text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                />
              </div>
              <button
                type="button"
                onClick={handleSearchExternal}
                disabled={isSearching}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-sm font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                {isSearching ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                検索して取得
              </button>
            </div>

            {searchError && (
              <p className="text-xs text-rose-600 font-medium">{searchError}</p>
            )}

            {/* 検索候補リスト */}
            {searchResults.length > 0 && (
              <div className="bg-white border border-indigo-200 rounded-lg p-2 max-h-48 overflow-y-auto space-y-1 shadow-sm">
                <div className="text-[11px] font-bold text-slate-500 px-2 py-1">
                  該当現場 ({searchResults.length}件) - クリックで反映:
                </div>
                {searchResults.map((res, i) => {
                  const displayCode = res.code || res.siteCode || '';
                  const displayName = res.name || res.siteName || '（名称未設定）';
                  return (
                    <div
                      key={i}
                      onClick={() => handleSelectExternalSite(res)}
                      className="p-2.5 hover:bg-indigo-50/70 rounded-lg cursor-pointer flex items-center justify-between text-xs transition-colors border border-slate-100 hover:border-indigo-200"
                    >
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded font-mono">
                          {displayCode || '(コードなし)'}
                        </span>
                        <strong className="text-slate-800">{displayName}</strong>
                        {res.egCount !== undefined && res.egCount > 0 && (
                          <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-semibold">
                            EG: {res.egCount}台
                          </span>
                        )}
                        {res.customerName && (
                          <span className="text-slate-500">({res.customerName})</span>
                        )}
                        {res.period && (
                          <span className="text-slate-400 text-[11px] font-mono">
                            [{res.period}]
                          </span>
                        )}
                      </div>
                      <span className="text-xs text-indigo-600 font-bold shrink-0 ml-2">選択 →</span>
                    </div>
                  );
                })}
              </div>
            )}

          </div>

          {/* 2. 基本情報フォーム */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-1.5">
              現場基本情報
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  現場コード <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={siteCode}
                  onChange={(e) => setSiteCode(e.target.value)}
                  placeholder="例: NHQ136A"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-bold text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  現場名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={siteName}
                  onChange={(e) => setSiteName(e.target.value)}
                  placeholder="例: 寺岡オートドア 本社新館新築工事"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm font-semibold text-slate-800 focus:bg-white focus:ring-1 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  EG台数
                </label>
                <input
                  type="number"
                  min="1"
                  value={egCount}
                  onChange={(e) => setEgCount(parseInt(e.target.value, 10) || 1)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  元請 / 取引先名
                </label>
                <input
                  type="text"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                  placeholder="例: 株式会社 寺岡建設"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  発注No / 受注No
                </label>
                <input
                  type="text"
                  value={orderNo}
                  onChange={(e) => setOrderNo(e.target.value)}
                  placeholder="例: ORD-2026-001"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:bg-white"
                />
              </div>

              <div className="sm:col-span-3">
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  現場住所・施工場所
                </label>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="例: 愛知県名古屋市中区栄1-1"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {/* 3. 工期・施工者設定 */}
          <div className="space-y-4">
            <h4 className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-1.5">
              工期・主担当施工者
            </h4>

            <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  着工日 (開始)
                </label>
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  完工予定日 (終了)
                </label>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  主な施工日
                </label>
                <input
                  type="date"
                  value={constructionDate}
                  onChange={(e) => setConstructionDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  主担当施工者
                </label>
                <select
                  value={primaryWorkerId}
                  onChange={(e) => setPrimaryWorkerId(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:bg-white"
                >
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} {u.department ? `(${u.department})` : ''}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 4. 主要部品（1台ずつ分割展開） */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-1.5">
              <div>
                <h4 className="font-bold text-sm text-slate-800 flex items-center gap-1.5">
                  <Layers className="w-4 h-4 text-indigo-600" />
                  主要部品リスト（1台ずつ分割管理）
                </h4>
                <p className="text-[11px] text-slate-500">
                  ※ 在庫DBで「型番 2台」等と登録されていた場合、1台ごとに分割展開されています。各台の施工日・施工者を個別に管理できます。
                </p>
              </div>
              <button
                type="button"
                onClick={handleAddCustomPart}
                className="px-2.5 py-1 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 flex items-center gap-1 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                部品を追加
              </button>
            </div>

            {mainParts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-dashed border-slate-200">
                主要部品がまだ登録されていません。「在庫データベースから現場情報を自動取得」するか、「部品を追加」ボタンで追加してください。
              </div>
            ) : (
              <div className="space-y-2">
                {mainParts.map((part, index) => (
                  <div
                    key={part.id || index}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-1">
                        <span className="text-xs font-bold text-indigo-700 bg-white border border-indigo-200 px-2 py-0.5 rounded shadow-2xs">
                          {part.unitIndex && part.originalQuantity ? `${part.unitIndex}/${part.originalQuantity}台目` : `部品 ${index + 1}`}
                        </span>
                        <input
                          type="text"
                          value={part.partCode}
                          onChange={(e) => handleUpdatePart(index, { partCode: e.target.value })}
                          placeholder="型番 (例: DR-8000)"
                          className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs font-bold text-slate-800 w-36"
                        />
                        <input
                          type="text"
                          value={part.partName}
                          onChange={(e) => handleUpdatePart(index, { partName: e.target.value })}
                          placeholder="品名 (例: 自動ドア駆動装置)"
                          className="px-2.5 py-1 bg-white border border-slate-300 rounded text-xs text-slate-800 flex-1"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={() => handleRemovePart(index)}
                        className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        title="削除"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block">出庫日</label>
                        <input
                          type="date"
                          value={part.outStockDate || ''}
                          onChange={(e) => handleUpdatePart(index, { outStockDate: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block">施工予定日</label>
                        <input
                          type="date"
                          value={part.constructionDate || ''}
                          onChange={(e) => handleUpdatePart(index, { constructionDate: e.target.value })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px]"
                        />
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block">施工担当者</label>
                        <select
                          value={part.workerId || primaryWorkerId}
                          onChange={(e) => {
                            const u = allUsers.find(x => x.id === e.target.value);
                            handleUpdatePart(index, {
                              workerId: e.target.value,
                              workerName: u?.name || ''
                            });
                          }}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px]"
                        >
                          {allUsers.map(u => (
                            <option key={u.id} value={u.id}>{u.name}</option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="text-[10px] text-slate-500 font-semibold block">進捗状況</label>
                        <select
                          value={part.status}
                          onChange={(e) => handleUpdatePart(index, { status: e.target.value as any })}
                          className="w-full px-2 py-1 bg-white border border-slate-300 rounded text-[11px] font-semibold text-indigo-700"
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
            )}
          </div>

          {/* 5. 付属部品プレビュー（本SNSには保存せず都度参照） */}
          {subPartsPreview.length > 0 && (
            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700">
                  付属部品プレビュー (在庫データベース連動: {subPartsPreview.length}件)
                </span>
                <span className="text-[10px] text-slate-500">
                  ※ 付属部品は本SNSデータベースには永続化せず、都度在庫DBから取得して表示されます
                </span>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                {subPartsPreview.map((sub, i) => (
                  <div key={i} className="bg-white p-2 rounded border border-slate-200 text-xs">
                    <div className="font-bold text-slate-800">{sub.partCode}</div>
                    <div className="text-[11px] text-slate-500 truncate">{sub.partName}</div>
                    <div className="text-[10px] text-slate-400 mt-1">
                      数量: {sub.quantity}{sub.unit} / 出庫: {sub.outStockDate || '未定'}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 6. 特記事項・図面URL */}
          <div className="space-y-3">
            <h4 className="font-bold text-sm text-slate-800 border-b border-slate-200 pb-1.5">
              申し送り・NAS図面参照
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  NAS図面参照URL / パス
                </label>
                <input
                  type="text"
                  value={drawingUrl}
                  onChange={(e) => setDrawingUrl(e.target.value)}
                  placeholder="例: /drawings/NHQ136A/layout.dwg または NASリンク"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  特記事項・申し送りメモ
                </label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="搬入経路の指定、鍵の受領方法など..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-xs text-slate-800 focus:bg-white"
                />
              </div>
            </div>
          </div>

          {submitError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-semibold flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{submitError}</span>
            </div>
          )}

          {/* フッターアクション */}
          <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-xl text-xs font-semibold transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-xl text-xs font-bold transition-all shadow-sm hover:shadow cursor-pointer flex items-center gap-1.5"
            >
              {isSubmitting ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  登録中...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  現場を登録する
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
