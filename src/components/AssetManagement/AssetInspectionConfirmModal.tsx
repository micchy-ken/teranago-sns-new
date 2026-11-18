import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  CheckCircle2,
  CalendarClock,
  AlertTriangle,
  ClipboardCheck,
  CalendarX2,
  Wrench,
  Gauge
} from 'lucide-react';
import {
  AssetCategory,
  AssetChecklistResult,
  AssetChecklistStatus,
  AssetInspectionChecklistItem,
  AssetItem,
  AssetLogItem
} from '../../types';
import {
  formatAssetDateJa,
  getActiveScheduledInspection,
  getAssetIconComponent,
  getDefaultInspectionChecklistPreset,
  getEffectiveAssetMileage,
  getJstTodayStr
} from '../../utils/assets';

export interface ConfirmInspectionPayload {
  logId?: string;
  assetId: string;
  actualDate: string;
  inspectionType: string;
  vendor: string;
  cost?: number;
  mileage?: number;
  checklistResults: AssetChecklistResult[];
  memo: string;
  nextScheduledDate?: string;
  nextInspectionType?: string;
}

export interface RescheduleInspectionPayload {
  assetId: string;
  logId?: string;
  eventDate: string;
  inspectionType?: string;
  vendor?: string;
  memo?: string;
}

interface AssetInspectionConfirmModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset: AssetItem | null;
  category?: AssetCategory | null;
  logs: AssetLogItem[];
  onConfirmInspection: (payload: ConfirmInspectionPayload) => Promise<void>;
  onRescheduleInspection?: (payload: RescheduleInspectionPayload) => Promise<void>;
  onCancelSchedule?: (assetId: string, logId?: string) => Promise<void>;
}

const CHECK_STATUS_OPTIONS: Array<{
  value: AssetChecklistStatus;
  label: string;
  activeCls: string;
}> = [
  { value: 'ok', label: '良好', activeCls: 'bg-emerald-600 text-white border-emerald-600' },
  { value: 'caution', label: '要注意', activeCls: 'bg-amber-500 text-white border-amber-500' },
  { value: 'ng', label: '不良', activeCls: 'bg-rose-600 text-white border-rose-600' },
  { value: 'na', label: '対象外', activeCls: 'bg-slate-600 text-white border-slate-600' }
];

export function AssetInspectionConfirmModal({
  isOpen,
  onClose,
  asset,
  category,
  logs,
  onConfirmInspection,
  onRescheduleInspection,
  onCancelSchedule
}: AssetInspectionConfirmModalProps) {
  const todayStr = getJstTodayStr();
  const [mode, setMode] = useState<'confirm' | 'reschedule'>('confirm');
  const [actualDate, setActualDate] = useState(todayStr);
  const [inspectionType, setInspectionType] = useState('定期点検');
  const [vendor, setVendor] = useState('');
  const [cost, setCost] = useState('');
  const [mileage, setMileage] = useState('');
  const [memo, setMemo] = useState('');
  const [nextScheduledDate, setNextScheduledDate] = useState('');
  const [rescheduleDate, setRescheduleDate] = useState(todayStr);
  const [checkResults, setCheckResults] = useState<AssetChecklistResult[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const scheduled = useMemo(() => {
    if (!asset) return null;
    return getActiveScheduledInspection(asset, logs, todayStr);
  }, [asset, logs, todayStr]);

  const checklistDefs: AssetInspectionChecklistItem[] = useMemo(() => {
    if (!asset) return [];
    if (Array.isArray(asset.inspectionItems) && asset.inspectionItems.length > 0) {
      return [...asset.inspectionItems].sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
    }
    return getDefaultInspectionChecklistPreset(category);
  }, [asset, category]);

  const effectiveMileage = useMemo(
    () => (asset ? getEffectiveAssetMileage(asset) : { value: null, source: 'none' as const }),
    [asset]
  );

  useEffect(() => {
    if (!isOpen || !asset) return;
    setError('');
    setMode('confirm');
    const defaultDate =
      scheduled?.eventDate && scheduled.eventDate <= todayStr ? scheduled.eventDate : todayStr;
    setActualDate(defaultDate);
    setRescheduleDate(todayStr);
    setInspectionType(
      scheduled?.inspectionType || asset.attributes?.inspectionType || '定期点検'
    );
    setVendor(
      scheduled?.vendor ||
        asset.attributes?.inspectionVendor ||
        asset.attributes?.maintenanceVendor ||
        ''
    );
    setCost('');
    setMileage(effectiveMileage.value !== null ? String(effectiveMileage.value) : '');
    setMemo('');
    setNextScheduledDate('');
    setCheckResults(
      checklistDefs.map((item) => ({
        itemId: item.id,
        label: item.label,
        method: item.method || '',
        status: 'ok',
        note: ''
      }))
    );
  }, [isOpen, asset, scheduled, todayStr, effectiveMileage.value, checklistDefs]);

  if (!isOpen || !asset) return null;

  const CatIcon = getAssetIconComponent(category?.icon);

  const inspectionTypeField = category?.fields?.find((f) => f.key === 'inspectionType');
  const inspectionTypeOptions = inspectionTypeField?.options || [
    'P点検',
    'D点検',
    '3ヶ月点検',
    '6ヶ月点検',
    '12ヶ月点検',
    '車検',
    '定期点検',
    '校正・点検',
    'その他'
  ];

  const handleSetAllOk = () => {
    setCheckResults((prev) => prev.map((r) => ({ ...r, status: 'ok' })));
  };

  const handleCheckStatusChange = (idx: number, status: AssetChecklistStatus) => {
    setCheckResults((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, status } : r))
    );
  };

  const handleCheckNoteChange = (idx: number, note: string) => {
    setCheckResults((prev) =>
      prev.map((r, i) => (i === idx ? { ...r, note } : r))
    );
  };

  const handleSubmitConfirm = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actualDate) {
      setError('実施日を入力してください');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      const parsedCost = cost.trim() ? Number(cost.replace(/,/g, '')) : undefined;
      const parsedMileage = mileage.trim() ? Number(mileage.replace(/,/g, '')) : undefined;
      await onConfirmInspection({
        logId: scheduled?.logId,
        assetId: asset.id,
        actualDate,
        inspectionType: inspectionType.trim() || '定期点検',
        vendor: vendor.trim(),
        cost: parsedCost !== undefined && !isNaN(parsedCost) ? parsedCost : undefined,
        mileage: parsedMileage !== undefined && !isNaN(parsedMileage) ? parsedMileage : undefined,
        checklistResults: checkResults,
        memo: memo.trim(),
        nextScheduledDate: nextScheduledDate || undefined,
        nextInspectionType: inspectionType.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || '点検実施の確認保存に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitReschedule = async () => {
    if (!onRescheduleInspection || !rescheduleDate) {
      setError('新しい予定日を入力してください');
      return;
    }
    setSubmitting(true);
    setError('');
    try {
      await onRescheduleInspection({
        assetId: asset.id,
        logId: scheduled?.logId,
        eventDate: rescheduleDate,
        inspectionType: inspectionType.trim() || undefined,
        vendor: vendor.trim() || undefined,
        memo: memo.trim() || undefined
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || '予定日の変更に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelScheduled = async () => {
    if (!onCancelSchedule) return;
    setSubmitting(true);
    setError('');
    try {
      await onCancelSchedule(asset.id, scheduled?.logId);
      onClose();
    } catch (err: any) {
      setError(err?.message || '予定の取消に失敗しました');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/80 flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700 flex items-center justify-center shrink-0">
              <ClipboardCheck className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-900 truncate flex items-center gap-2">
                <CatIcon className="w-4 h-4 text-slate-500 shrink-0" />
                <span>{asset.name} — 点検実施の確認・確定</span>
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                実施を確認すると点検予定をクリアし、確定履歴として保存して「最終点検日」に反映します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {scheduled && (
            <div
              className={`p-3.5 rounded-xl border flex flex-wrap items-center justify-between gap-3 ${
                scheduled.isDueOrOverdue
                  ? 'bg-rose-50/70 border-rose-200 text-rose-900'
                  : 'bg-amber-50/70 border-amber-200 text-amber-900'
              }`}
            >
              <div className="flex items-center gap-2 text-xs">
                {scheduled.isDueOrOverdue ? (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                ) : (
                  <CalendarClock className="w-4 h-4 text-amber-600 shrink-0" />
                )}
                <div>
                  <span className="font-bold">
                    予定日: <span className="tabular-nums">{formatAssetDateJa(scheduled.eventDate)}</span>
                  </span>
                  {scheduled.inspectionType && (
                    <span className="ml-2 text-slate-700">· {scheduled.inspectionType}</span>
                  )}
                  {scheduled.isDueOrOverdue && (
                    <span className="ml-2 font-bold text-rose-700">（予定到来・実施確認待ち）</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setMode(mode === 'confirm' ? 'reschedule' : 'confirm')}
                  className="px-2.5 py-1 rounded-lg text-xs font-semibold bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 cursor-pointer"
                >
                  {mode === 'confirm' ? '未実施（予定日を変更・取消）' : '実施確認へ戻る'}
                </button>
              </div>
            </div>
          )}

          {mode === 'reschedule' && scheduled ? (
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-4">
              <div className="text-xs font-bold text-slate-800">
                まだ点検を実施していない場合は、予定日の延期または取り消しを行ってください
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    新しい点検予定日 (JST)
                  </label>
                  <input
                    type="date"
                    value={rescheduleDate}
                    onChange={(e) => setRescheduleDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    理由・メモ
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="例: 部品手配のため翌週へ延期"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200">
                {onCancelSchedule && (
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={handleCancelScheduled}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 cursor-pointer"
                  >
                    <CalendarX2 className="w-3.5 h-3.5" />
                    予定を取り消す（未予定に戻す）
                  </button>
                )}
                <button
                  type="button"
                  disabled={submitting}
                  onClick={handleSubmitReschedule}
                  className="ml-auto inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer"
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  予定日を更新する
                </button>
              </div>
            </div>
          ) : (
            <form id="confirm-inspection-form" onSubmit={handleSubmitConfirm} className="space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    実施確定日 (JST) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={actualDate}
                    onChange={(e) => setActualDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    点検内容・種別
                  </label>
                  <select
                    value={inspectionType}
                    onChange={(e) => setInspectionType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  >
                    {inspectionTypeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    {inspectionType && !inspectionTypeOptions.includes(inspectionType) && (
                      <option value={inspectionType}>{inspectionType}</option>
                    )}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Wrench className="w-3.5 h-3.5 text-slate-400" />
                    点検業者・実施者
                  </label>
                  <input
                    type="text"
                    value={vendor}
                    onChange={(e) => setVendor(e.target.value)}
                    placeholder="例: トヨタレンタリース / 担当者"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                      <Gauge className="w-3.5 h-3.5 text-slate-400" />
                      走行距離 (km)
                    </label>
                    <input
                      type="number"
                      value={mileage}
                      onChange={(e) => setMileage(e.target.value)}
                      placeholder={effectiveMileage.source === 'driving_log' ? '運転記録簿連動' : '任意'}
                      className="w-full px-2.5 py-2 text-sm bg-white border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      費用 (円)
                    </label>
                    <input
                      type="number"
                      value={cost}
                      onChange={(e) => setCost(e.target.value)}
                      placeholder="0"
                      className="w-full px-2.5 py-2 text-sm bg-white border border-slate-300 rounded-lg tabular-nums"
                    />
                  </div>
                </div>
              </div>

              {/* Per-asset checklist */}
              <div className="space-y-2.5">
                <div className="flex items-center justify-between">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <ClipboardCheck className="w-4 h-4 text-emerald-600" />
                    資産別 点検項目チェック ({checkResults.length}項目)
                    {(!asset.inspectionItems || asset.inspectionItems.length === 0) && (
                      <span className="text-[11px] font-normal text-slate-500">
                        · 標準プリセット適用
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={handleSetAllOk}
                    className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 cursor-pointer"
                  >
                    すべて良好にする
                  </button>
                </div>

                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden bg-white">
                  {checkResults.map((item, idx) => (
                    <div key={item.itemId || idx} className="p-2.5 space-y-1.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold text-slate-800">
                            {idx + 1}. {item.label}
                          </span>
                          {item.method && (
                            <span className="ml-2 text-[10px] text-slate-500">
                              ({item.method})
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          {CHECK_STATUS_OPTIONS.map((opt) => {
                            const active = item.status === opt.value;
                            return (
                              <button
                                key={opt.value}
                                type="button"
                                onClick={() => handleCheckStatusChange(idx, opt.value)}
                                className={`px-2 py-0.5 rounded text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                                  active
                                    ? opt.activeCls
                                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                                }`}
                              >
                                {opt.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {(item.status === 'caution' || item.status === 'ng' || item.note) && (
                        <input
                          type="text"
                          value={item.note || ''}
                          onChange={(e) => handleCheckNoteChange(idx, e.target.value)}
                          placeholder="異常・要注意の内容や交換箇所を入力"
                          className="w-full px-2.5 py-1 text-xs bg-slate-50 border border-slate-200 rounded-md focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    所見・対応メモ
                  </label>
                  <input
                    type="text"
                    value={memo}
                    onChange={(e) => setMemo(e.target.value)}
                    placeholder="例: エンジンオイル交換実施、異常なし"
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    次回点検予定日を続けて登録（任意）
                  </label>
                  <input
                    type="date"
                    value={nextScheduledDate}
                    onChange={(e) => setNextScheduledDate(e.target.value)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg tabular-nums"
                  />
                </div>
              </div>
            </form>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200/70 cursor-pointer"
          >
            閉じる
          </button>
          {mode === 'confirm' && (
            <button
              type="submit"
              form="confirm-inspection-form"
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-xs disabled:opacity-50 cursor-pointer whitespace-nowrap"
            >
              <CheckCircle2 className="w-4 h-4" />
              {submitting ? '確定処理中...' : '実施を確認して確定履歴に保存'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
