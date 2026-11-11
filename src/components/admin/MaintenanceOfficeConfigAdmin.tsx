import React, { useState, useEffect } from 'react';
import { 
  OfficeMaster, 
  MaintenanceReportOfficeConfig, 
  MaintenanceReportVisibleColumns, 
  MaintenanceReportPointSettings, 
  MaintenanceReportScheduleMapping 
} from '../../types';
import { API_BASE_URL } from '../../config/api';
import { ConfirmModal, ConfirmModalState } from '../ConfirmModal';
import { findOfficeConfig, resolveOffice, isSameOffice } from '../../utils/masterResolver';
import { 
  Building2, 
  Check, 
  Save, 
  Sliders, 
  Calendar, 
  Calculator, 
  Eye, 
  RotateCcw,
  Clock,
  Sparkles,
  Info,
  CheckCircle2,
  AlertCircle,
  Copy,
  Filter,
  CheckSquare,
  ArrowRight,
  X
} from 'lucide-react';

interface MaintenanceOfficeConfigAdminProps {
  offices: OfficeMaster[];
}

// デフォルト設定生成関数
export function createDefaultOfficeConfig(officeName: string, officeId?: string): MaintenanceReportOfficeConfig {
  return {
    id: officeId ? `cfg-office-${officeId}` : `cfg-office-${officeName}`,
    officeId,
    officeName,
    visibleColumns: {
      directGoReturn: true,
      district: true,
      peopleCoworkers: true,
      inspection: true,
      oncall: true,
      replacement: true,
      buildingMaterial: true,
      photoReportLink: true,
      showOfficeWorkTable: true,
      showConstructionSummary: true,
    },
    pointSettings: {
      inspectionPointPerUnit: 120,
      replacementEgPoint: 480,
      replacementEgAmount: 291500,
      replacementSinglePoint: 240,
      replacementSingleAmount: 150000,
      oncallPoint: 115,
      oncallAmount: 34500,
    },
    scheduleMapping: {
      siteNameSource: 'title',
      workDescriptionSource: 'memo_then_type',
      districtSource: 'tag',
      autoImportAttendees: true,
      autoDetectDirectGoReturn: false,
      onlyTargetKeywords: true,
      importInspection: true,
      importReplacement: true,
      importRepair: true,
      replacementDefaultCategory: 'EG取替',
      inspectionDefaultCategory: '点検',
      repairDefaultCategory: '修理',
    },
    defaultBreakHours: '1:00',
    defaultOvertimeHours: '',
  };
}

export function MaintenanceOfficeConfigAdmin({ offices }: MaintenanceOfficeConfigAdminProps) {
  const [configs, setConfigs] = useState<MaintenanceReportOfficeConfig[]>(() => {
    try {
      const cached = localStorage.getItem('teranago_maintenance_office_configs_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });
  const [selectedOfficeName, setSelectedOfficeName] = useState<string>(() => {
    return offices[0]?.name || '名古屋支店';
  });
  const [ currentConfig, setCurrentConfig ] = useState<MaintenanceReportOfficeConfig>(() => {
    const targetOffice = offices[0]?.name || '名古屋支店';
    const targetOfficeId = offices[0]?.id;
    try {
      const cached = localStorage.getItem('teranago_maintenance_office_configs_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const found = findOfficeConfig(parsed, targetOfficeId || targetOffice, offices);
          if (found) return found;
        }
      }
    } catch (e) {}
    return createDefaultOfficeConfig(targetOffice, targetOfficeId);
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 拠点間コピー用モーダル状態
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [sourceOfficeForCopy, setSourceOfficeForCopy] = useState<string>('');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  // 初回データ取得
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);
    fetch(`${API_BASE_URL}/masters/maintenance-configs`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setConfigs(data);
          try {
            localStorage.setItem('teranago_maintenance_office_configs_cache', JSON.stringify(data));
          } catch (e) {}
          // 選択中拠点の設定があれば反映（マスターID・表記ゆれ吸収対応）
          const matchedOffice = resolveOffice(selectedOfficeName, offices);
          const existing = findOfficeConfig(data, matchedOffice?.id || selectedOfficeName, offices);
          if (existing) {
            setCurrentConfig(existing);
          } else {
            setCurrentConfig(createDefaultOfficeConfig(selectedOfficeName, matchedOffice?.id));
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load maintenance configs:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, []);

  // 選択拠点変更時
  const handleSelectOffice = (officeName: string) => {
    setSelectedOfficeName(officeName);
    const matchedOffice = resolveOffice(officeName, offices);
    const existing = findOfficeConfig(configs, matchedOffice?.id || officeName, offices);
    if (existing) {
      setCurrentConfig(existing);
    } else {
      setCurrentConfig(createDefaultOfficeConfig(officeName, matchedOffice?.id));
    }
    setSaveMessage(null);
  };

  // 表示列のON/OFF切り替え
  const toggleColumn = (colKey: keyof MaintenanceReportVisibleColumns) => {
    setCurrentConfig((prev) => ({
      ...prev,
      visibleColumns: {
        ...prev.visibleColumns,
        [colKey]: !prev.visibleColumns[colKey],
      },
    }));
  };

  // ポイント設定更新
  const updatePointSetting = (key: keyof MaintenanceReportPointSettings, value: number) => {
    setCurrentConfig((prev) => ({
      ...prev,
      pointSettings: {
        ...prev.pointSettings,
        [key]: isNaN(value) ? 0 : value,
      },
    }));
  };

  // スケジュールマッピング更新
  const updateScheduleMapping = <K extends keyof MaintenanceReportScheduleMapping>(
    key: K,
    value: MaintenanceReportScheduleMapping[K]
  ) => {
    setCurrentConfig((prev) => ({
      ...prev,
      scheduleMapping: {
        ...prev.scheduleMapping,
        [key]: value,
      },
    }));
  };

  // 初期値（休憩時間等）更新
  const updateConfigField = (key: 'defaultBreakHours' | 'defaultOvertimeHours', value: string) => {
    setCurrentConfig((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  // デフォルト値にリセット
  const handleResetToDefault = () => {
    setConfirmModal({
      isOpen: true,
      title: '標準デフォルト値へのリセット',
      message: `「${selectedOfficeName}」の設定を標準デフォルト値にリセットしますか？`,
      confirmText: 'リセットする',
      cancelText: 'キャンセル',
      type: 'warning',
      onConfirm: () => {
        setCurrentConfig(createDefaultOfficeConfig(selectedOfficeName));
      }
    });
  };

  // 拠点間コピーの実行
  const handleExecuteCopy = () => {
    if (!sourceOfficeForCopy) {
      alert('コピー元の拠点を選択してください。');
      return;
    }
    if (sourceOfficeForCopy === selectedOfficeName) {
      alert('コピー元とコピー先が同じ拠点です。別の拠点を選択してください。');
      return;
    }

    const sourceConfig = findOfficeConfig(configs, sourceOfficeForCopy, offices);
    if (!sourceConfig) {
      alert(`「${sourceOfficeForCopy}」の設定データが見つかりません。`);
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: '拠点設定のコピー適用',
      message: `「${sourceOfficeForCopy}」の設定を「${selectedOfficeName}」にコピーしますか？\n（現在の入力内容は上書きされます）`,
      confirmText: 'コピーを適用',
      cancelText: 'キャンセル',
      type: 'warning',
      onConfirm: () => {
        const matchedOffice = resolveOffice(selectedOfficeName, offices);
        setCurrentConfig({
          ...sourceConfig,
          id: currentConfig.id || (matchedOffice?.id ? `cfg-office-${matchedOffice.id}` : `cfg-office-${selectedOfficeName}`),
          officeId: matchedOffice?.id,
          officeName: selectedOfficeName,
          updatedAt: new Date().toISOString(),
        });
        setIsCopyModalOpen(false);
        setSaveMessage({ text: `「${sourceOfficeForCopy}」からのコピーを適用しました。「設定を保存」ボタンを押すと確定されます。`, type: 'success' });
      }
    });
  };

  // 保存処理
  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const matchedOffice = resolveOffice(selectedOfficeName, offices);
      const payload: MaintenanceReportOfficeConfig = {
        ...currentConfig,
        officeId: matchedOffice?.id || currentConfig.officeId,
        officeName: matchedOffice?.name || selectedOfficeName,
        id: currentConfig.id || (matchedOffice?.id ? `cfg-office-${matchedOffice.id}` : `cfg-office-${selectedOfficeName}`),
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch(`${API_BASE_URL}/masters/maintenance-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setConfigs((prev) => {
          const idx = prev.findIndex((c) => isSameOffice(c.officeId || c.officeName, payload.officeId || payload.officeName, offices) || c.id === payload.id);
          const next = idx >= 0 ? [...prev] : [...prev, payload];
          if (idx >= 0) {
            next[idx] = payload;
          }
          try {
            localStorage.setItem('teranago_maintenance_office_configs_cache', JSON.stringify(next));
          } catch (e) {}
          return next;
        });
        setSaveMessage({ text: `「${selectedOfficeName}」の保守日報様式設定を保存しました。`, type: 'success' });
        setTimeout(() => setSaveMessage(null), 4000);
      } else {
        throw new Error(data.error || '保存に失敗しました');
      }
    } catch (err: any) {
      console.error(err);
      setSaveMessage({ text: err.message || '通信エラーが発生しました', type: 'error' });
    } finally {
      setIsSaving(false);
    }
  };

  // 拠点候補リスト（OfficeMaster一覧、またはデフォルトリスト）
  const officeList = offices.length > 0 
    ? offices.map(o => o.name) 
    : ['本社', '名古屋支店', '静岡営業所', '浜松営業所', '三河営業所'];

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 概要ヘッダー */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-900 font-bold text-base mb-1">
              <Sliders className="w-5 h-5 text-amber-600" />
              <span>保守日報 拠点別カスタム様式＆初期値設定</span>
            </div>
            <p className="text-xs text-amber-800/90 leading-relaxed max-w-3xl">
              拠点（支店・営業所）ごとに、保守日報で<strong>表示する列の取捨選択（様式A）</strong>、
              <strong>点検・取替・オンコールの1台あたりポイント数・標準金額</strong>、
              および<strong>スケジュール自動取り込み時の対象種別限定（点検・取替・修理のみ）と内容区分割り当て</strong>をカスタマイズできます。
              また、他拠点の様式設定をワンクリックで複製・コピー保存できます。
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const candidates = officeList.filter(o => o !== selectedOfficeName);
                if (candidates.length > 0) setSourceOfficeForCopy(candidates[0]);
                setIsCopyModalOpen(true);
              }}
              className="px-3.5 py-2 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
              title="別の拠点の設定をコピーして反映します"
            >
              <Copy className="w-4 h-4 text-amber-700" />
              <span>拠点からコピー</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-amber-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? '保存中...' : '設定を保存'}</span>
            </button>
          </div>
        </div>

        {saveMessage && (
          <div className={`mt-3 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
            saveMessage.type === 'success' 
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}>
            {saveMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{saveMessage.text}</span>
          </div>
        )}
      </div>

      {/* 拠点選択タブ */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
        <div className="text-xs font-bold text-slate-500 mb-2 flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <Building2 className="w-4 h-4 text-indigo-600" />
            <span>設定対象の拠点を選択:</span>
          </div>
          <span className="text-[11px] text-indigo-600 font-bold">
            現在「{selectedOfficeName}」を編集・設定中
          </span>
        </div>
        <div className="flex flex-wrap gap-2">
          {officeList.map((offName) => {
            const isSelected = isSameOffice(offName, selectedOfficeName, offices) || offName === selectedOfficeName;
            const hasCustomConfig = Boolean(findOfficeConfig(configs, offName, offices));
            return (
              <button
                key={offName}
                type="button"
                onClick={() => handleSelectOffice(offName)}
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <span>{offName}</span>
                {hasCustomConfig && (
                  <span className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                    isSelected ? 'bg-indigo-500/80 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    設定済
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* 設定フォーム（3つのカードで構成） */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
        {/* セクション 1: 様式A・表示列（ON/OFF）設定 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-amber-600" />
              <h3 className="font-bold text-slate-800 text-sm">様式A: 入力列の表示 / 非表示</h3>
            </div>
            <span className="text-[10px] text-slate-400">チェックで表示</span>
          </div>

          <div className="p-4 flex-1 space-y-3 text-xs">
            <p className="text-[11px] text-slate-500 leading-relaxed mb-3">
              拠点での業務に不要な列のチェックを外すと、メイン表の横幅がコンパクトになり誤入力を防げます。
            </p>

            <div className="space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
              <span className="text-[10px] font-bold text-slate-400 block mb-1">メイン作業表の列</span>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">直行・直帰（チェック欄）</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.directGoReturn}
                  onChange={() => toggleColumn('directGoReturn')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">地区（担当エリア・市町村）</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.district}
                  onChange={() => toggleColumn('district')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">人数・同行者</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.peopleCoworkers}
                  onChange={() => toggleColumn('peopleCoworkers')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">点検台数 / 点検数値（pt）</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.inspection}
                  onChange={() => toggleColumn('inspection')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">オンコール金額 / 数値（pt）</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.oncall}
                  onChange={() => toggleColumn('oncall')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">取替台数 / 金額 / 数値（pt）</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.replacement}
                  onChange={() => toggleColumn('replacement')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">建材数値（※手入力）</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.buildingMaterial}
                  onChange={() => toggleColumn('buildingMaterial')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">資材補充依頼ボタン</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.photoReportLink}
                  onChange={() => toggleColumn('photoReportLink')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>
            </div>

            <div className="space-y-2 border border-slate-100 rounded-xl p-3 bg-slate-50/50">
              <span className="text-[10px] font-bold text-slate-400 block mb-1">サブ表・サマリーの表示</span>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">事務作業表（見積提出先・5行）</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.showOfficeWorkTable}
                  onChange={() => toggleColumn('showOfficeWorkTable')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>

              <label className="flex items-center justify-between p-2 rounded-lg hover:bg-white cursor-pointer transition-colors border border-transparent hover:border-slate-200">
                <span className="font-semibold text-slate-700">工事・集計サマリー（工事内容・距離）</span>
                <input
                  type="checkbox"
                  checked={currentConfig.visibleColumns.showConstructionSummary}
                  onChange={() => toggleColumn('showConstructionSummary')}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
              </label>
            </div>
          </div>
        </div>

        {/* セクション 2: ポイント数・金額・初期値設定 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calculator className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-slate-800 text-sm">ポイント数 & 標準金額設定</h3>
            </div>
            <span className="text-[10px] text-slate-400">1台・1件あたりの値</span>
          </div>

          <div className="p-4 flex-1 space-y-4 text-xs">
            <p className="text-[11px] text-slate-500 leading-relaxed">
              作業区分を選んだ際、および日報作成時に自動適用されるポイント（pt）と標準金額（円）を設定します。
            </p>

            {/* 点検 */}
            <div className="p-3 bg-amber-50/50 border border-amber-100 rounded-xl space-y-2">
              <div className="font-bold text-amber-900 flex items-center gap-1.5">
                <span>点検</span>
                <span className="text-[10px] text-amber-700 font-normal">（1台あたり）</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">点検数値:</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={currentConfig.pointSettings.inspectionPointPerUnit}
                    onChange={(e) => updatePointSetting('inspectionPointPerUnit', Number(e.target.value))}
                    className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500"
                  />
                  <span className="text-slate-500">pt</span>
                </div>
              </div>
            </div>

            {/* 単体取替 */}
            <div className="p-3 bg-sky-50/50 border border-sky-100 rounded-xl space-y-2">
              <div className="font-bold text-sky-900 flex items-center gap-1.5">
                <span>単体取替</span>
                <span className="text-[10px] text-sky-700 font-normal">（1台あたり）</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">数値 (pt):</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={currentConfig.pointSettings.replacementSinglePoint}
                    onChange={(e) => updatePointSetting('replacementSinglePoint', Number(e.target.value))}
                    className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                  <span className="text-slate-500">pt</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">標準金額:</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">¥</span>
                  <input
                    type="number"
                    value={currentConfig.pointSettings.replacementSingleAmount}
                    onChange={(e) => updatePointSetting('replacementSingleAmount', Number(e.target.value))}
                    className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:ring-2 focus:ring-sky-500/20 focus:border-sky-500"
                  />
                </div>
              </div>
            </div>

            {/* EG取替 */}
            <div className="p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-2">
              <div className="font-bold text-indigo-900 flex items-center gap-1.5">
                <span>EG取替</span>
                <span className="text-[10px] text-indigo-700 font-normal">（1台あたり）</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">数値 (pt):</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={currentConfig.pointSettings.replacementEgPoint}
                    onChange={(e) => updatePointSetting('replacementEgPoint', Number(e.target.value))}
                    className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                  <span className="text-slate-500">pt</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">標準金額:</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">¥</span>
                  <input
                    type="number"
                    value={currentConfig.pointSettings.replacementEgAmount}
                    onChange={(e) => updatePointSetting('replacementEgAmount', Number(e.target.value))}
                    className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>
            </div>

            {/* オンコール・修理 */}
            <div className="p-3 bg-rose-50/50 border border-rose-100 rounded-xl space-y-2">
              <div className="font-bold text-rose-900 flex items-center gap-1.5">
                <span>オンコール / 修理</span>
                <span className="text-[10px] text-rose-700 font-normal">（1件あたり）</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">数値 (pt):</span>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={currentConfig.pointSettings.oncallPoint}
                    onChange={(e) => updatePointSetting('oncallPoint', Number(e.target.value))}
                    className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                  <span className="text-slate-500">pt</span>
                </div>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">標準金額:</span>
                <div className="flex items-center gap-1">
                  <span className="text-slate-500">¥</span>
                  <input
                    type="number"
                    value={currentConfig.pointSettings.oncallAmount}
                    onChange={(e) => updatePointSetting('oncallAmount', Number(e.target.value))}
                    className="w-24 px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-right font-bold text-slate-800 focus:ring-2 focus:ring-rose-500/20 focus:border-rose-500"
                  />
                </div>
              </div>
            </div>

            {/* デフォルト休憩時間 */}
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
              <div className="font-bold text-slate-700 flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-slate-500" />
                <span>初期休憩時間:</span>
              </div>
              <input
                type="text"
                placeholder="1:00"
                value={currentConfig.defaultBreakHours}
                onChange={(e) => updateConfigField('defaultBreakHours', e.target.value)}
                className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg font-bold text-slate-800 text-xs focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
          </div>
        </div>

        {/* セクション 3: スケジュール情報転記マッピング設定 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-indigo-600" />
              <h3 className="font-bold text-slate-800 text-sm">スケジュール転記マッピング</h3>
            </div>
            <span className="text-[10px] text-slate-400">予定取り込みルール</span>
          </div>

          <div className="p-4 flex-1 space-y-4 text-xs">
            {/* 新機能: スケジュール自動取り込み絞り込み & 内容区分割り当て */}
            <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-bold text-amber-950 flex items-center gap-1.5">
                  <Filter className="w-4 h-4 text-amber-600" />
                  <span>自動取り込み対象の絞り込み:</span>
                </label>
              </div>

              <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                <input
                  type="checkbox"
                  checked={currentConfig.scheduleMapping.onlyTargetKeywords ?? true}
                  onChange={(e) => updateScheduleMapping('onlyTargetKeywords', e.target.checked)}
                  className="rounded text-amber-600 focus:ring-amber-500 w-4 h-4"
                />
                <span>「点検」「取替」「修理」の予定のみを取り込む</span>
              </label>

              {(currentConfig.scheduleMapping.onlyTargetKeywords ?? true) && (
                <div className="pl-6 space-y-2 border-l-2 border-amber-300 pt-1">
                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={currentConfig.scheduleMapping.importInspection ?? true}
                        onChange={(e) => updateScheduleMapping('importInspection', e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>「点検」を取り込む</span>
                    </label>
                    <span className="text-[10px] text-slate-500 font-bold bg-white px-2 py-0.5 rounded border border-slate-200">
                      区分: 点検
                    </span>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={currentConfig.scheduleMapping.importReplacement ?? true}
                        onChange={(e) => updateScheduleMapping('importReplacement', e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>「取替」を取り込む</span>
                    </label>
                    <select
                      value={currentConfig.scheduleMapping.replacementDefaultCategory || 'EG取替'}
                      onChange={(e) => updateScheduleMapping('replacementDefaultCategory', e.target.value as any)}
                      className="text-xs font-bold text-indigo-900 bg-white border border-indigo-200 rounded px-2 py-0.5 cursor-pointer"
                    >
                      <option value="EG取替">区分: EG取替</option>
                      <option value="単体取替">区分: 単体取替</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between gap-2">
                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-semibold">
                      <input
                        type="checkbox"
                        checked={currentConfig.scheduleMapping.importRepair ?? true}
                        onChange={(e) => updateScheduleMapping('importRepair', e.target.checked)}
                        className="rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>「修理」を取り込む</span>
                    </label>
                    <select
                      value={currentConfig.scheduleMapping.repairDefaultCategory || '修理'}
                      onChange={(e) => updateScheduleMapping('repairDefaultCategory', e.target.value as any)}
                      className="text-xs font-bold text-rose-900 bg-white border border-rose-200 rounded px-2 py-0.5 cursor-pointer"
                    >
                      <option value="修理">区分: 修理</option>
                      <option value="オンコール">区分: オンコール</option>
                    </select>
                  </div>
                </div>
              )}
            </div>

            {/* 現場名 の転記元 */}
            <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl space-y-1.5">
              <label className="font-bold text-slate-800 block">日報「現場名」の取得元:</label>
              <div className="space-y-1 text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="siteNameSource"
                    checked={currentConfig.scheduleMapping.siteNameSource === 'title'}
                    onChange={() => updateScheduleMapping('siteNameSource', 'title')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>予定のタイトル (title)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="siteNameSource"
                    checked={currentConfig.scheduleMapping.siteNameSource === 'location'}
                    onChange={() => updateScheduleMapping('siteNameSource', 'location')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>予定の場所 (location)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="siteNameSource"
                    checked={currentConfig.scheduleMapping.siteNameSource === 'location_then_title'}
                    onChange={() => updateScheduleMapping('siteNameSource', 'location_then_title')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>場所優先（場所が空ならタイトル）</span>
                </label>
              </div>
            </div>

            {/* 作業内容 の転記元 */}
            <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl space-y-1.5">
              <label className="font-bold text-slate-800 block">日報「作業内容」の取得元:</label>
              <div className="space-y-1 text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="workDescriptionSource"
                    checked={currentConfig.scheduleMapping.workDescriptionSource === 'memo_then_type'}
                    onChange={() => updateScheduleMapping('workDescriptionSource', 'memo_then_type')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>予定のメモ（メモが空なら予定種別）</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="workDescriptionSource"
                    checked={currentConfig.scheduleMapping.workDescriptionSource === 'memo'}
                    onChange={() => updateScheduleMapping('workDescriptionSource', 'memo')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>予定のメモ (memo) のみ</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="workDescriptionSource"
                    checked={currentConfig.scheduleMapping.workDescriptionSource === 'type'}
                    onChange={() => updateScheduleMapping('workDescriptionSource', 'type')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>予定種別 (type: 例: 定期点検, 取替等)</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="workDescriptionSource"
                    checked={currentConfig.scheduleMapping.workDescriptionSource === 'title'}
                    onChange={() => updateScheduleMapping('workDescriptionSource', 'title')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>予定のタイトル (title)</span>
                </label>
              </div>
            </div>

            {/* 地区 の転記元 */}
            <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl space-y-1.5">
              <label className="font-bold text-slate-800 block">日報「地区」の取得元:</label>
              <div className="space-y-1 text-slate-700">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="districtSource"
                    checked={currentConfig.scheduleMapping.districtSource === 'tag'}
                    onChange={() => updateScheduleMapping('districtSource', 'tag')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>メモ/場所内の「【地区】○○」タグから抽出</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="districtSource"
                    checked={currentConfig.scheduleMapping.districtSource === 'location'}
                    onChange={() => updateScheduleMapping('districtSource', 'location')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>予定の場所 (location) をそのまま転記</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="districtSource"
                    checked={currentConfig.scheduleMapping.districtSource === 'default_office'}
                    onChange={() => updateScheduleMapping('districtSource', 'default_office')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>拠点の名称（{selectedOfficeName}）を自動セット</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="districtSource"
                    checked={currentConfig.scheduleMapping.districtSource === 'none'}
                    onChange={() => updateScheduleMapping('districtSource', 'none')}
                    className="text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>空欄（手入力）</span>
                </label>
              </div>
            </div>

            {/* オプション（同行者・直行直帰） */}
            <div className="p-3 bg-slate-50/70 border border-slate-100 rounded-xl space-y-2">
              <span className="font-bold text-slate-800 block mb-1">自動判定オプション</span>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={currentConfig.scheduleMapping.autoImportAttendees}
                  onChange={(e) => updateScheduleMapping('autoImportAttendees', e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>参加者から自分以外の同行者を自動反映</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                <input
                  type="checkbox"
                  checked={currentConfig.scheduleMapping.autoDetectDirectGoReturn}
                  onChange={(e) => updateScheduleMapping('autoDetectDirectGoReturn', e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>メモやタイトルに「直行」「直帰」がある時自動チェック</span>
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* 下部アクションバー */}
      <div className="flex items-center justify-between p-4 bg-white rounded-2xl border border-slate-200 shadow-2xs">
        <button
          type="button"
          onClick={handleResetToDefault}
          className="px-3.5 py-2 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>標準デフォルト値に戻す</span>
        </button>

        <div className="flex items-center gap-3">
          {saveMessage && (
            <span className={`text-xs font-bold ${saveMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'}`}>
              {saveMessage.text}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-200 flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? '保存中...' : `「${selectedOfficeName}」の設定を保存`}</span>
          </button>
        </div>
      </div>

      {/* 拠点間コピーダイアログ / モーダル */}
      {isCopyModalOpen && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-150">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-5 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-900 font-bold text-base">
                <Copy className="w-5 h-5 text-indigo-600" />
                <span>拠点間設定のコピー</span>
              </div>
              <button
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              すでに設定済みの他拠点から、<strong>表示列（様式A）・ポイント数・標準金額・転記ルール</strong>をそのままコピーして現在編集中の拠点に適用します。
            </p>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500">コピー元拠点:</span>
                <select
                  value={sourceOfficeForCopy}
                  onChange={(e) => setSourceOfficeForCopy(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500/20"
                >
                  {officeList.filter(o => o !== selectedOfficeName).map(offName => (
                    <option key={offName} value={offName}>
                      {offName}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-center justify-center text-slate-400 py-1">
                <ArrowRight className="w-4 h-4 text-indigo-500" />
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500">コピー先（適用先）拠点:</span>
                <span className="font-extrabold text-slate-800 bg-amber-100 text-amber-900 px-3 py-1 rounded-lg border border-amber-300">
                  {selectedOfficeName}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleExecuteCopy}
                className="px-4 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl shadow-md shadow-indigo-200 transition-all flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>コピーを適用する</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
