import React, { useState, useEffect } from 'react';
import { 
  OfficeMaster, 
  MaintenanceReportOfficeConfig, 
  MaintenanceReportVisibleColumns, 
  MaintenanceReportPointSettings, 
  MaintenanceReportScheduleMapping 
} from '../../types';
import { API_BASE_URL } from '../../config/api';
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
  AlertCircle
} from 'lucide-react';

interface MaintenanceOfficeConfigAdminProps {
  offices: OfficeMaster[];
}

// デフォルト設定生成関数
export function createDefaultOfficeConfig(officeName: string): MaintenanceReportOfficeConfig {
  return {
    id: `cfg-office-${officeName}`,
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
    },
    defaultBreakHours: '1:00',
    defaultOvertimeHours: '',
  };
}

export function MaintenanceOfficeConfigAdmin({ offices }: MaintenanceOfficeConfigAdminProps) {
  const [configs, setConfigs] = useState<MaintenanceReportOfficeConfig[]>([]);
  const [selectedOfficeName, setSelectedOfficeName] = useState<string>(() => {
    return offices[0]?.name || '名古屋支店';
  });
  const [currentConfig, setCurrentConfig] = useState<MaintenanceReportOfficeConfig>(() => {
    return createDefaultOfficeConfig(offices[0]?.name || '名古屋支店');
  });
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

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
          // 選択中拠点の設定があれば反映
          const existing = data.find((c: MaintenanceReportOfficeConfig) => c.officeName === selectedOfficeName);
          if (existing) {
            setCurrentConfig(existing);
          } else {
            setCurrentConfig(createDefaultOfficeConfig(selectedOfficeName));
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
    const existing = configs.find((c) => c.officeName === officeName);
    if (existing) {
      setCurrentConfig(existing);
    } else {
      setCurrentConfig(createDefaultOfficeConfig(officeName));
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
    if (window.confirm(`「${selectedOfficeName}」の設定を標準デフォルト値にリセットしますか？`)) {
      setCurrentConfig(createDefaultOfficeConfig(selectedOfficeName));
    }
  };

  // 保存処理
  const handleSave = async () => {
    setIsSaving(true);
    setSaveMessage(null);
    try {
      const payload = {
        ...currentConfig,
        officeName: selectedOfficeName,
        id: currentConfig.id || `cfg-office-${selectedOfficeName}`,
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
          const idx = prev.findIndex((c) => c.officeName === selectedOfficeName);
          if (idx >= 0) {
            const next = [...prev];
            next[idx] = payload;
            return next;
          }
          return [...prev, payload];
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
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-900 font-bold text-base mb-1">
              <Sliders className="w-5 h-5 text-amber-600" />
              <span>保守日報 拠点別カスタム様式＆初期値設定</span>
            </div>
            <p className="text-xs text-amber-800/90 leading-relaxed max-w-3xl">
              拠点（支店・営業所）ごとに、保守日報で<strong>表示する列の取捨選択（不要な列の非表示）</strong>、
              <strong>点検・取替・オンコールの1台あたりポイント数・標準金額</strong>、
              および<strong>スケジュール（カレンダー予定）からの自動転記ルール</strong>をカスタマイズできます。
              所属メンバーが日報を開いた際に、自動的にこの設定が適用されます。
            </p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-amber-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 shrink-0"
          >
            <Save className="w-4 h-4" />
            <span>{isSaving ? '保存中...' : '設定を保存'}</span>
          </button>
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
        <div className="text-xs font-bold text-slate-500 mb-2 flex items-center gap-1.5">
          <Building2 className="w-4 h-4 text-indigo-600" />
          <span>設定対象の拠点を選択:</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {officeList.map((offName) => {
            const isSelected = offName === selectedOfficeName;
            const hasCustomConfig = configs.some((c) => c.officeName === offName);
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
                <span className="font-semibold text-slate-700">業務アルバム写真添付ボタン</span>
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
            <p className="text-[11px] text-slate-500 leading-relaxed">
              「当日のスケジュールから取り込み」実行時、カレンダー予定のどの項目を日報の各列に自動入力するかを指定します。
            </p>

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
    </div>
  );
}
