import React, { useState, useEffect } from 'react';
import {
  OfficeMaster,
  DrivingLogOfficeConfig,
  DrivingLogInspectionItem,
  DrivingLogStampLabels,
  DrivingLogDefaultSettings,
} from '../../types';
import { API_BASE_URL } from '../../config/api';
import { ConfirmModal, ConfirmModalState } from '../ConfirmModal';
import { findOfficeConfig, resolveOffice, isSameOffice } from '../../utils/masterResolver';
import {
  Building2,
  Save,
  Car,
  ShieldCheck,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Copy,
  ArrowRight,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  X,
  Sliders,
  Printer,
  CheckSquare,
  Square,
  Calendar,
} from 'lucide-react';

interface DrivingLogOfficeConfigAdminProps {
  offices: OfficeMaster[];
}

export const DRIVING_LOG_OFFICE_CONFIGS_CACHE_KEY = 'teranago_driving_log_office_configs_cache';

export const DEFAULT_DRIVING_INSPECTION_ITEMS: DrivingLogInspectionItem[] = [
  { key: 'ky_declaration', label: 'ＫＹ宣言の実施', method: '発声', enabled: true },
  { key: 'instruments_brake', label: '各計器・エンジン・ブレーキランプに異常はないか', method: '音・目視', enabled: true },
  { key: 'tire_groove_air', label: 'タイヤの溝・空気圧は十分か', method: '目視', enabled: true },
  { key: 'phone_drive_mode', label: '携帯電話をドライブモードに変更', method: '操作', enabled: true },
  { key: 'bluetooth_connect', label: 'Bluetooth等に接続', method: '操作', enabled: true },
  { key: 'engine_exhaust', label: 'エンジンの掛かり具合、排気は正常か', method: '目視', enabled: true },
  { key: 'lever_brake_light', label: 'レバー・ブレーキ・ライト・ウインカーに異常はないか', method: '目視・実測', enabled: true },
  { key: 'washer_coolant', label: 'ウォッシャー液・クーラント液は十分か', method: '実測', enabled: true },
  { key: 'engine_oil', label: 'エンジンオイルの油量', method: '実測', enabled: true },
  { key: 'battery', label: 'バッテリーは正常か', method: '実測', enabled: true },
  { key: 'wiper_belt', label: 'ワイパー・エンジンベルトに問題はないか', method: '目視', enabled: true },
  { key: 'air_pressure_kpa', label: '空気圧（2.0kpa～2.5kpa）', method: '実測', enabled: true },
];

export const DEFAULT_KY_DECLARATION_LINES: string[] = [
  '1.制限速度厳守よし！',
  '1.交通標識厳守よし！',
  '1.信号厳守！',
  '1.無理な追い越し厳禁！',
  '1.シートベルト着用よし！',
];

export const DEFAULT_DRIVING_LOG_TOTAL_NOTICE =
  '※走行距離、給油量、給油金額の合計を必ず記入下さい。';

export const DEFAULT_DRIVING_LOG_LEGAL_NOTES =
  '【2022年　新たに義務化されること】\n＊2022/4～：運転前後の運転者の状態を目視等で確認\n＊2022/10～：運転前後の運転者に対して、その運転者の状態を目視等で確認し、国家公安委員会が定めるアルコール検知器を用いて、酒気帯びの有無を確認';

export function createDefaultDrivingLogOfficeConfig(
  officeName: string,
  officeId?: string
): DrivingLogOfficeConfig {
  return {
    id: officeId ? `drv-cfg-office-${officeId}` : `drv-cfg-office-${officeName}`,
    officeId,
    officeName,
    inspectionItems: DEFAULT_DRIVING_INSPECTION_ITEMS.map((it) => ({ ...it })),
    kyDeclarationTitle: 'K Y 宣 言',
    kyDeclarationLines: [...DEFAULT_KY_DECLARATION_LINES],
    stampLabels: {
      slot1: '担当者',
      slot2: '所属長',
      slot3: '拠点長',
      slot4: '安全運転管理者',
    },
    defaultSettings: {
      closingDay: 25,
      defaultAlcoholPresence: '無',
      defaultAlcoholValue: '0.00',
      defaultDepartureTime: '08:30',
      autoCheckAllInspectionOnNew: true,
      showLegalNotesOnPrint: true,
      legalNotesText: DEFAULT_DRIVING_LOG_LEGAL_NOTES,
      footerTotalNoticeText: DEFAULT_DRIVING_LOG_TOTAL_NOTICE,
    },
  };
}

export function normalizeDrivingLogOfficeConfig(
  raw: Partial<DrivingLogOfficeConfig> | null | undefined,
  officeName: string,
  officeId?: string
): DrivingLogOfficeConfig {
  const base = createDefaultDrivingLogOfficeConfig(officeName, officeId);
  if (!raw || typeof raw !== 'object') return base;

  const rawItems = Array.isArray(raw.inspectionItems) && raw.inspectionItems.length > 0
    ? raw.inspectionItems.map((it, idx) => ({
        key: String(it?.key || `item_${idx + 1}`),
        label: String(it?.label || '').trim() || `点検項目 ${idx + 1}`,
        method: String(it?.method || '').trim(),
        enabled: it?.enabled !== false,
      }))
    : base.inspectionItems;

  const rawKyLines = Array.isArray(raw.kyDeclarationLines)
    ? raw.kyDeclarationLines.map((l) => String(l ?? '')).filter((l) => l.trim() !== '')
    : base.kyDeclarationLines;

  const closingNum = Number(raw.defaultSettings?.closingDay);
  const closingDay =
    Number.isFinite(closingNum) && closingNum >= 1 && closingNum <= 31
      ? Math.round(closingNum)
      : base.defaultSettings.closingDay;

  return {
    id: raw.id || base.id,
    officeId: raw.officeId || officeId,
    officeName: raw.officeName || officeName,
    inspectionItems: rawItems,
    kyDeclarationTitle:
      raw.kyDeclarationTitle && raw.kyDeclarationTitle.trim() !== ''
        ? raw.kyDeclarationTitle
        : base.kyDeclarationTitle,
    kyDeclarationLines: rawKyLines.length > 0 ? rawKyLines : base.kyDeclarationLines,
    stampLabels: {
      slot1: raw.stampLabels?.slot1 ?? base.stampLabels.slot1,
      slot2: raw.stampLabels?.slot2 ?? base.stampLabels.slot2,
      slot3: raw.stampLabels?.slot3 ?? base.stampLabels.slot3,
      slot4: raw.stampLabels?.slot4 ?? base.stampLabels.slot4,
    },
    defaultSettings: {
      closingDay,
      defaultAlcoholPresence:
        raw.defaultSettings?.defaultAlcoholPresence === '有' ||
        raw.defaultSettings?.defaultAlcoholPresence === '無' ||
        raw.defaultSettings?.defaultAlcoholPresence === ''
          ? raw.defaultSettings.defaultAlcoholPresence
          : base.defaultSettings.defaultAlcoholPresence,
      defaultAlcoholValue:
        raw.defaultSettings?.defaultAlcoholValue !== undefined
          ? String(raw.defaultSettings.defaultAlcoholValue)
          : base.defaultSettings.defaultAlcoholValue,
      defaultDepartureTime:
        raw.defaultSettings?.defaultDepartureTime !== undefined
          ? String(raw.defaultSettings.defaultDepartureTime)
          : base.defaultSettings.defaultDepartureTime,
      autoCheckAllInspectionOnNew:
        raw.defaultSettings?.autoCheckAllInspectionOnNew !== undefined
          ? Boolean(raw.defaultSettings.autoCheckAllInspectionOnNew)
          : base.defaultSettings.autoCheckAllInspectionOnNew,
      showLegalNotesOnPrint:
        raw.defaultSettings?.showLegalNotesOnPrint !== undefined
          ? Boolean(raw.defaultSettings.showLegalNotesOnPrint)
          : base.defaultSettings.showLegalNotesOnPrint,
      legalNotesText:
        raw.defaultSettings?.legalNotesText !== undefined
          ? String(raw.defaultSettings.legalNotesText)
          : base.defaultSettings.legalNotesText,
      footerTotalNoticeText:
        raw.defaultSettings?.footerTotalNoticeText !== undefined
          ? String(raw.defaultSettings.footerTotalNoticeText)
          : base.defaultSettings.footerTotalNoticeText,
    },
    updatedAt: raw.updatedAt,
  };
}

export function DrivingLogOfficeConfigAdmin({ offices }: DrivingLogOfficeConfigAdminProps) {
  const [configs, setConfigs] = useState<DrivingLogOfficeConfig[]>(() => {
    try {
      const cached = localStorage.getItem(DRIVING_LOG_OFFICE_CONFIGS_CACHE_KEY);
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

  const [currentConfig, setCurrentConfig] = useState<DrivingLogOfficeConfig>(() => {
    const targetOffice = offices[0]?.name || '名古屋支店';
    const targetOfficeId = offices[0]?.id;
    try {
      const cached = localStorage.getItem(DRIVING_LOG_OFFICE_CONFIGS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) {
          const found = findOfficeConfig(parsed, targetOfficeId || targetOffice, offices);
          if (found) return normalizeDrivingLogOfficeConfig(found, targetOffice, targetOfficeId);
        }
      }
    } catch (e) {}
    return createDefaultDrivingLogOfficeConfig(targetOffice, targetOfficeId);
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
    fetch(`${API_BASE_URL}/masters/driving-log-configs`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setConfigs(data);
          try {
            localStorage.setItem(DRIVING_LOG_OFFICE_CONFIGS_CACHE_KEY, JSON.stringify(data));
          } catch (e) {}
          const matchedOffice = resolveOffice(selectedOfficeName, offices);
          const existing = findOfficeConfig(data, matchedOffice?.id || selectedOfficeName, offices);
          if (existing) {
            setCurrentConfig(normalizeDrivingLogOfficeConfig(existing, selectedOfficeName, matchedOffice?.id));
          } else {
            setCurrentConfig(createDefaultDrivingLogOfficeConfig(selectedOfficeName, matchedOffice?.id));
          }
        }
      })
      .catch((err) => {
        console.error('Failed to load driving log configs:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => {
      isMounted = false;
    };
  }, []);

  // 選択拠点変更時
  const handleSelectOffice = (officeName: string) => {
    setSelectedOfficeName(officeName);
    const matchedOffice = resolveOffice(officeName, offices);
    const existing = findOfficeConfig(configs, matchedOffice?.id || officeName, offices);
    if (existing) {
      setCurrentConfig(normalizeDrivingLogOfficeConfig(existing, officeName, matchedOffice?.id));
    } else {
      setCurrentConfig(createDefaultDrivingLogOfficeConfig(officeName, matchedOffice?.id));
    }
    setSaveMessage(null);
  };

  // 日常点検項目の編集系ハンドラ
  const handleAddInspectionItem = () => {
    const newKey = `drv_item_${Date.now().toString(36)}`;
    setCurrentConfig((prev) => ({
      ...prev,
      inspectionItems: [
        ...prev.inspectionItems,
        { key: newKey, label: '', method: '目視', enabled: true },
      ],
    }));
  };

  const handleUpdateInspectionItem = (
    idx: number,
    patch: Partial<DrivingLogInspectionItem>
  ) => {
    setCurrentConfig((prev) => ({
      ...prev,
      inspectionItems: prev.inspectionItems.map((it, i) =>
        i === idx ? { ...it, ...patch } : it
      ),
    }));
  };

  const handleMoveInspectionItem = (idx: number, dir: -1 | 1) => {
    setCurrentConfig((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.inspectionItems.length) return prev;
      const next = [...prev.inspectionItems];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return { ...prev, inspectionItems: next };
    });
  };

  const handleRemoveInspectionItem = (idx: number) => {
    setCurrentConfig((prev) => ({
      ...prev,
      inspectionItems: prev.inspectionItems.filter((_, i) => i !== idx),
    }));
  };

  const handleResetChecklistToDefault = () => {
    setCurrentConfig((prev) => ({
      ...prev,
      inspectionItems: DEFAULT_DRIVING_INSPECTION_ITEMS.map((it) => ({ ...it })),
    }));
    setSaveMessage({
      text: '日常点検項目を標準12項目に読み込みました。「設定を保存」で確定します。',
      type: 'success',
    });
  };

  // KY宣言リスト操作
  const handleAddKyLine = () => {
    setCurrentConfig((prev) => ({
      ...prev,
      kyDeclarationLines: [...prev.kyDeclarationLines, '1.'],
    }));
  };

  const handleUpdateKyLine = (idx: number, value: string) => {
    setCurrentConfig((prev) => ({
      ...prev,
      kyDeclarationLines: prev.kyDeclarationLines.map((l, i) => (i === idx ? value : l)),
    }));
  };

  const handleMoveKyLine = (idx: number, dir: -1 | 1) => {
    setCurrentConfig((prev) => {
      const target = idx + dir;
      if (target < 0 || target >= prev.kyDeclarationLines.length) return prev;
      const next = [...prev.kyDeclarationLines];
      const temp = next[idx];
      next[idx] = next[target];
      next[target] = temp;
      return { ...prev, kyDeclarationLines: next };
    });
  };

  const handleRemoveKyLine = (idx: number) => {
    setCurrentConfig((prev) => ({
      ...prev,
      kyDeclarationLines: prev.kyDeclarationLines.filter((_, i) => i !== idx),
    }));
  };

  // 承認印ラベル・初期値更新
  const updateStampLabel = (slot: keyof DrivingLogStampLabels, value: string) => {
    setCurrentConfig((prev) => ({
      ...prev,
      stampLabels: {
        ...prev.stampLabels,
        [slot]: value,
      },
    }));
  };

  const updateDefaultSetting = <K extends keyof DrivingLogDefaultSettings>(
    key: K,
    value: DrivingLogDefaultSettings[K]
  ) => {
    setCurrentConfig((prev) => ({
      ...prev,
      defaultSettings: {
        ...prev.defaultSettings,
        [key]: value,
      },
    }));
  };

  // デフォルト値にリセット
  const handleResetToDefault = () => {
    const matchedOffice = resolveOffice(selectedOfficeName, offices);
    setConfirmModal({
      isOpen: true,
      title: '標準デフォルト値へのリセット',
      message: `「${selectedOfficeName}」の運転記録簿様式を標準デフォルト値にリセットしますか？`,
      confirmText: 'リセットする',
      cancelText: 'キャンセル',
      type: 'warning',
      onConfirm: () => {
        setCurrentConfig(createDefaultDrivingLogOfficeConfig(selectedOfficeName, matchedOffice?.id));
      },
    });
  };

  // 拠点間コピーの実行
  const handleExecuteCopy = () => {
    if (!sourceOfficeForCopy) {
      setSaveMessage({ text: 'コピー元の拠点を選択してください。', type: 'error' });
      return;
    }
    if (sourceOfficeForCopy === selectedOfficeName) {
      setSaveMessage({ text: 'コピー元とコピー先が同じ拠点です。別の拠点を選択してください。', type: 'error' });
      return;
    }

    const sourceConfig = findOfficeConfig(configs, sourceOfficeForCopy, offices);
    if (!sourceConfig) {
      setSaveMessage({ text: `「${sourceOfficeForCopy}」の保存済み設定データが見つかりません。`, type: 'error' });
      return;
    }

    setConfirmModal({
      isOpen: true,
      title: '拠点設定のコピー適用',
      message: `「${sourceOfficeForCopy}」の運転記録簿様式を「${selectedOfficeName}」にコピーしますか？\n（現在の入力内容は上書きされます）`,
      confirmText: 'コピーを適用',
      cancelText: 'キャンセル',
      type: 'warning',
      onConfirm: () => {
        const matchedOffice = resolveOffice(selectedOfficeName, offices);
        const normalized = normalizeDrivingLogOfficeConfig(sourceConfig, selectedOfficeName, matchedOffice?.id);
        setCurrentConfig({
          ...normalized,
          id: currentConfig.id || (matchedOffice?.id ? `drv-cfg-office-${matchedOffice.id}` : `drv-cfg-office-${selectedOfficeName}`),
          officeId: matchedOffice?.id,
          officeName: selectedOfficeName,
          updatedAt: new Date().toISOString(),
        });
        setIsCopyModalOpen(false);
        setSaveMessage({
          text: `「${sourceOfficeForCopy}」からのコピーを適用しました。「設定を保存」ボタンを押すと確定されます。`,
          type: 'success',
        });
      },
    });
  };

  // 保存処理
  const handleSave = async () => {
    const cleanedItems = currentConfig.inspectionItems
      .map((it, idx) => ({
        key: String(it.key || `drv_item_${idx + 1}`).trim(),
        label: String(it.label || '').trim(),
        method: String(it.method || '').trim(),
        enabled: it.enabled !== false,
      }))
      .filter((it) => it.label !== '');

    if (cleanedItems.length === 0) {
      setSaveMessage({ text: '日常点検項目は1つ以上設定してください。', type: 'error' });
      return;
    }

    setIsSaving(true);
    setSaveMessage(null);
    try {
      const matchedOffice = resolveOffice(selectedOfficeName, offices);
      const payload: DrivingLogOfficeConfig = {
        ...currentConfig,
        inspectionItems: cleanedItems,
        kyDeclarationLines: currentConfig.kyDeclarationLines.map((l) => l.trim()).filter(Boolean),
        officeId: matchedOffice?.id || currentConfig.officeId,
        officeName: matchedOffice?.name || selectedOfficeName,
        id:
          currentConfig.id ||
          (matchedOffice?.id ? `drv-cfg-office-${matchedOffice.id}` : `drv-cfg-office-${selectedOfficeName}`),
        updatedAt: new Date().toISOString(),
      };

      const res = await fetch(`${API_BASE_URL}/masters/driving-log-configs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setConfigs((prev) => {
          const idx = prev.findIndex(
            (c) =>
              isSameOffice(c.officeId || c.officeName, payload.officeId || payload.officeName, offices) ||
              c.id === payload.id
          );
          const next = idx >= 0 ? [...prev] : [...prev, payload];
          if (idx >= 0) next[idx] = payload;
          try {
            localStorage.setItem(DRIVING_LOG_OFFICE_CONFIGS_CACHE_KEY, JSON.stringify(next));
          } catch (e) {}
          return next;
        });
        setCurrentConfig(payload);
        setSaveMessage({
          text: `「${selectedOfficeName}」の運転記録簿様式設定を保存しました。`,
          type: 'success',
        });
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

  const officeList =
    offices.length > 0
      ? offices.map((o) => o.name)
      : ['本社', '名古屋支店', '静岡営業所', '浜松営業所', '三河営業所'];

  const enabledItemCount = currentConfig.inspectionItems.filter((i) => i.enabled !== false).length;

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 概要ヘッダー（保守日報様式と統一デザイン） */}
      <div className="bg-gradient-to-r from-amber-50 to-orange-50 border border-amber-200/80 rounded-2xl p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-amber-900 font-bold text-base mb-1">
              <Car className="w-5 h-5 text-amber-600" />
              <span>運転記録簿 拠点別カスタム様式＆日常点検設定</span>
            </div>
            <p className="text-xs text-amber-800/90 leading-relaxed max-w-3xl">
              拠点（支店・営業所）ごとに、運転記録簿の<strong>日常点検チェックリスト項目（乗車前点検・確認方法）</strong>、
              <strong>KY宣言文言・A4承認印枠（4枠名称）</strong>、および
              <strong>月度締日・クイック入力初期値・法定注記表示</strong>をカスタマイズできます。
              （※資産管理の車両「定期点検・メンテナンス」とは独立した運転記録簿専用の書式設定です）
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => {
                const candidates = officeList.filter((o) => o !== selectedOfficeName);
                if (candidates.length > 0) setSourceOfficeForCopy(candidates[0]);
                setIsCopyModalOpen(true);
              }}
              className="px-3.5 py-2 bg-white border border-amber-300 text-amber-900 hover:bg-amber-100 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
              title="別の拠点の設定をコピーして反映します"
            >
              <Copy className="w-4 h-4 text-amber-700" />
              <span>拠点からコピー</span>
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-sm shadow-amber-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50 whitespace-nowrap"
            >
              <Save className="w-4 h-4" />
              <span>{isSaving ? '保存中...' : '設定を保存'}</span>
            </button>
          </div>
        </div>

        {saveMessage && (
          <div
            className={`mt-3 p-3 rounded-xl text-xs font-bold flex items-center gap-2 border ${
              saveMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
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
            {isLoading && <span className="text-[11px] text-slate-400 font-normal">（読込中...）</span>}
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
                className={`px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 border whitespace-nowrap ${
                  isSelected
                    ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm shadow-indigo-200'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                }`}
              >
                <span>{offName}</span>
                {hasCustomConfig && (
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded-full ${
                      isSelected ? 'bg-indigo-500/80 text-white' : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
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
        {/* カード 1: 日常点検チェックリスト項目設定 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
              <h3 className="text-sm font-bold text-slate-800 truncate">
                日常点検項目設定（{enabledItemCount}/{currentConfig.inspectionItems.length}）
              </h3>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={handleResetChecklistToDefault}
                className="px-2 py-1 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                title="標準12項目を読み込みます"
              >
                標準12項目
              </button>
              <button
                type="button"
                onClick={handleAddInspectionItem}
                className="px-2.5 py-1 text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3 h-3" />
                追加
              </button>
            </div>
          </div>

          <div className="p-3.5 space-y-2 max-h-[540px] overflow-y-auto flex-1">
            {currentConfig.inspectionItems.map((item, idx) => {
              const isEnabled = item.enabled !== false;
              return (
                <div
                  key={item.key || idx}
                  className={`p-2.5 rounded-xl border transition-all space-y-1.5 ${
                    isEnabled
                      ? 'bg-emerald-50/30 border-emerald-200/80'
                      : 'bg-slate-50 border-slate-200 opacity-65'
                  }`}
                >
                  <div className="flex items-center justify-between gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleUpdateInspectionItem(idx, { enabled: !isEnabled })}
                        className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
                        title={isEnabled ? '表示・点検対象ON（クリックで非表示）' : '非表示（クリックで有効化）'}
                      >
                        {isEnabled ? (
                          <CheckSquare className="w-4 h-4" />
                        ) : (
                          <Square className="w-4 h-4 text-slate-400" />
                        )}
                      </button>
                      <span className="text-[10px] font-bold text-slate-400 tabular-nums">
                        #{idx + 1}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        disabled={idx === 0}
                        onClick={() => handleMoveInspectionItem(idx, -1)}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        title="上へ"
                      >
                        <ArrowUp className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        disabled={idx === currentConfig.inspectionItems.length - 1}
                        onClick={() => handleMoveInspectionItem(idx, 1)}
                        className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                        title="下へ"
                      >
                        <ArrowDown className="w-3.5 h-3.5" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveInspectionItem(idx)}
                        className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                        title="削除"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={item.label}
                      onChange={(e) => handleUpdateInspectionItem(idx, { label: e.target.value })}
                      placeholder="点検項目名 (例: ＫＹ宣言の実施)"
                      className="flex-1 min-w-0 px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <input
                      type="text"
                      value={item.method}
                      onChange={(e) => handleUpdateInspectionItem(idx, { method: e.target.value })}
                      placeholder="方法 (例: 目視)"
                      className="w-20 shrink-0 px-2 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 text-center"
                    />
                  </div>
                </div>
              );
            })}
            {currentConfig.inspectionItems.length === 0 && (
              <div className="p-6 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                点検項目がありません。「追加」または「標準12項目」を押してください。
              </div>
            )}
          </div>
        </div>

        {/* カード 2: KY宣言・承認印枠（A4帳票上部）設定 */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-800">KY宣言＆確認印枠設定</h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-indigo-100 text-indigo-700 rounded-full whitespace-nowrap">
              帳票ヘッダー右側
            </span>
          </div>

          <div className="p-4 space-y-4 text-xs flex-1">
            {/* KY見出し */}
            <div>
              <label className="block font-bold text-slate-700 mb-1">KY宣言欄タイトル</label>
              <input
                type="text"
                value={currentConfig.kyDeclarationTitle}
                onChange={(e) =>
                  setCurrentConfig((prev) => ({ ...prev, kyDeclarationTitle: e.target.value }))
                }
                placeholder="例: K Y 宣 言"
                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500 font-bold"
              />
            </div>

            {/* KY宣言文言リスト */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="font-bold text-slate-700">
                  KY宣言スローガン（{currentConfig.kyDeclarationLines.length}行）
                </label>
                <button
                  type="button"
                  onClick={handleAddKyLine}
                  className="px-2 py-1 text-[11px] font-bold bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg flex items-center gap-1 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3 h-3" />
                  行を追加
                </button>
              </div>
              <div className="space-y-1.5 max-h-[220px] overflow-y-auto pr-0.5">
                {currentConfig.kyDeclarationLines.map((line, idx) => (
                  <div key={idx} className="flex items-center gap-1.5">
                    <input
                      type="text"
                      value={line}
                      onChange={(e) => handleUpdateKyLine(idx, e.target.value)}
                      placeholder="例: 1.制限速度厳守よし！"
                      className="flex-1 px-2.5 py-1.5 text-xs bg-slate-50 focus:bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <button
                      type="button"
                      disabled={idx === 0}
                      onClick={() => handleMoveKyLine(idx, -1)}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowUp className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      disabled={idx === currentConfig.kyDeclarationLines.length - 1}
                      onClick={() => handleMoveKyLine(idx, 1)}
                      className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                    >
                      <ArrowDown className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRemoveKyLine(idx)}
                      className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            {/* 承認印4枠名称 */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <span className="font-bold text-slate-700 block">A4帳票 確認印枠の名称（4枠）</span>
              <div className="grid grid-cols-2 gap-2">
                {(
                  [
                    { key: 'slot1', title: '1枠目（本人印）' },
                    { key: 'slot2', title: '2枠目' },
                    { key: 'slot3', title: '3枠目' },
                    { key: 'slot4', title: '4枠目' },
                  ] as const
                ).map((s) => (
                  <div key={s.key}>
                    <label className="block text-[10px] text-slate-500 mb-0.5">{s.title}</label>
                    <input
                      type="text"
                      value={currentConfig.stampLabels[s.key]}
                      onChange={(e) => updateStampLabel(s.key, e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* カード 3: 月度締日・初期値・A4印刷オプション */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-4 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sliders className="w-4 h-4 text-amber-600" />
              <h3 className="text-sm font-bold text-slate-800">締日・初期値＆A4印刷設定</h3>
            </div>
            <span className="text-[10px] font-bold px-2 py-0.5 bg-amber-100 text-amber-800 rounded-full whitespace-nowrap">
              様式オプション
            </span>
          </div>

          <div className="p-4 space-y-3.5 text-xs flex-1">
            {/* 月度締日 */}
            <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>月度集計期間（締日）</span>
              </div>
              <div className="flex items-center justify-between gap-3">
                <span className="text-slate-600">毎月締日</span>
                <select
                  value={currentConfig.defaultSettings.closingDay}
                  onChange={(e) => updateDefaultSetting('closingDay', Number(e.target.value))}
                  className="px-3 py-1.5 bg-white border border-slate-200 rounded-lg font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                >
                  <option value={25}>25日締め（前月26日〜当月25日・標準）</option>
                  <option value={20}>20日締め（前月21日〜当月20日）</option>
                  <option value={15}>15日締め（前月16日〜当月15日）</option>
                  <option value={31}>末日締め（1日〜月末）</option>
                </select>
              </div>
            </div>

            {/* クイック入力＆新規作成時初期値 */}
            <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-2.5">
              <span className="font-bold text-slate-800 block">入力初期値（クイック入力＆新規作成時）</span>

              <div className="grid grid-cols-2 gap-2.5">
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">標準出発時刻</label>
                  <input
                    type="time"
                    value={currentConfig.defaultSettings.defaultDepartureTime}
                    onChange={(e) => updateDefaultSetting('defaultDepartureTime', e.target.value)}
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                  />
                </div>
                <div>
                  <label className="block text-[10px] text-slate-500 mb-1">アルコール標準数値 (mg/l)</label>
                  <input
                    type="text"
                    value={currentConfig.defaultSettings.defaultAlcoholValue}
                    onChange={(e) => updateDefaultSetting('defaultAlcoholValue', e.target.value)}
                    placeholder="0.00"
                    className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs tabular-nums"
                  />
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-slate-600">酒気帯び標準判定</span>
                <div className="flex items-center gap-1.5">
                  {(['無', '有', ''] as const).map((val) => (
                    <button
                      key={val || 'empty'}
                      type="button"
                      onClick={() => updateDefaultSetting('defaultAlcoholPresence', val)}
                      className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border cursor-pointer ${
                        currentConfig.defaultSettings.defaultAlcoholPresence === val
                          ? 'bg-indigo-600 text-white border-indigo-600'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {val || '未選択'}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1 text-slate-700">
                <input
                  type="checkbox"
                  checked={currentConfig.defaultSettings.autoCheckAllInspectionOnNew}
                  onChange={(e) =>
                    updateDefaultSetting('autoCheckAllInspectionOnNew', e.target.checked)
                  }
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>新規作成時は日常点検をデフォルト全ONにする</span>
              </label>
            </div>

            {/* A4帳票下部注記設定 */}
            <div className="p-3 bg-slate-50/80 border border-slate-100 rounded-xl space-y-2">
              <div className="flex items-center gap-1.5 font-bold text-slate-800">
                <Printer className="w-3.5 h-3.5 text-slate-600" />
                <span>A4印刷帳票 下部注記</span>
              </div>

              <div>
                <label className="block text-[10px] text-slate-500 mb-1">合計行下の注意文言</label>
                <input
                  type="text"
                  value={currentConfig.defaultSettings.footerTotalNoticeText || ''}
                  onChange={(e) => updateDefaultSetting('footerTotalNoticeText', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px]"
                />
              </div>

              <label className="flex items-center gap-2 cursor-pointer text-slate-700 pt-1">
                <input
                  type="checkbox"
                  checked={currentConfig.defaultSettings.showLegalNotesOnPrint}
                  onChange={(e) => updateDefaultSetting('showLegalNotesOnPrint', e.target.checked)}
                  className="rounded text-indigo-600 focus:ring-indigo-500 w-4 h-4"
                />
                <span>アルコール検知義務注記を表示する</span>
              </label>

              {currentConfig.defaultSettings.showLegalNotesOnPrint && (
                <textarea
                  rows={4}
                  value={currentConfig.defaultSettings.legalNotesText || ''}
                  onChange={(e) => updateDefaultSetting('legalNotesText', e.target.value)}
                  className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-[11px] leading-snug"
                />
              )}
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
            <span
              className={`text-xs font-bold ${
                saveMessage.type === 'success' ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {saveMessage.text}
            </span>
          )}
          <button
            type="button"
            onClick={handleSave}
            disabled={isSaving}
            className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-all shadow-md shadow-amber-200 flex items-center gap-2 cursor-pointer disabled:opacity-50 whitespace-nowrap"
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
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              すでに設定済みの他拠点から、<strong>日常点検項目・KY宣言・確認印枠・締日/初期値設定</strong>をそのままコピーして現在編集中の拠点に適用します。
            </p>

            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-500">コピー元拠点:</span>
                <select
                  value={sourceOfficeForCopy}
                  onChange={(e) => setSourceOfficeForCopy(e.target.value)}
                  className="px-3 py-1.5 bg-white border border-indigo-300 rounded-lg text-xs font-bold text-indigo-900 focus:ring-2 focus:ring-indigo-500/20"
                >
                  {officeList
                    .filter((o) => o !== selectedOfficeName)
                    .map((offName) => (
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
