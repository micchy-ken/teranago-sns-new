import React, { useState, useEffect, useMemo } from 'react';
import {
  X,
  Save,
  Trash2,
  History,
  FileText,
  Upload,
  Paperclip,
  ExternalLink,
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  Users,
  User as UserIcon,
  Plus,
  CheckCircle2,
  Wrench
} from 'lucide-react';
import {
  AssetAttachment,
  AssetCategory,
  AssetFieldDefinition,
  AssetItem,
  AssetLogActionType,
  AssetLogItem,
  AssetStatus,
  DivisionMaster,
  OfficeMaster,
  User
} from '../../types';
import {
  ASSET_LOG_ACTION_META,
  ASSET_STATUS_META,
  computeAssetAlerts,
  formatAlertRuleSummary,
  formatAssetDateJa,
  getAssetIconComponent,
  getCategoryTheme,
  getJstTodayStr
} from '../../utils/assets';
import { resolveFileUrl, uploadFile } from '../../utils/fileUpload';
import { sortUsersByDivision } from '../../utils/userSort';
import { formatDateTimeJST } from '../../utils/dateUtils';
import { API_BASE_URL } from '../../config/api';

interface AssetDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  asset?: AssetItem | null; // null/undefined = 新規登録
  defaultCategoryId?: string;
  defaultIsShared?: boolean;
  categories: AssetCategory[];
  currentUser: User;
  users: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  logs: AssetLogItem[];
  onSaveAsset: (payload: Partial<AssetItem> & { id?: string }) => Promise<AssetItem>;
  onDeleteAsset?: (assetId: string) => Promise<void>;
  onAddLog: (
    assetId: string,
    payload: {
      actionType: AssetLogActionType;
      eventDate: string;
      summary: string;
      detail?: Record<string, any>;
      updateAssetAttributes?: Record<string, any>;
    }
  ) => Promise<void>;
  onDeleteLog?: (assetId: string, logId: string) => Promise<void>;
}

export function AssetDetailModal({
  isOpen,
  onClose,
  asset,
  defaultCategoryId,
  defaultIsShared,
  categories,
  currentUser,
  users,
  offices,
  divisions,
  logs,
  onSaveAsset,
  onDeleteAsset,
  onAddLog,
  onDeleteLog
}: AssetDetailModalProps) {
  const isNew = !asset;
  const [activeSubTab, setActiveSubTab] = useState<'details' | 'history'>('details');

  // Form States
  const [categoryId, setCategoryId] = useState('');
  const [assetCode, setAssetCode] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<AssetStatus>('active');
  const [officeId, setOfficeId] = useState('');
  const [divisionId, setDivisionId] = useState('');
  const [isShared, setIsShared] = useState(false);
  const [assigneeUserId, setAssigneeUserId] = useState('');
  const [attributes, setAttributes] = useState<Record<string, any>>({});
  const [attachments, setAttachments] = useState<AssetAttachment[]>([]);
  const [notes, setNotes] = useState('');

  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // History quick entry state
  const [fetchedLogs, setFetchedLogs] = useState<AssetLogItem[] | null>(null);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logActionType, setLogActionType] = useState<AssetLogActionType>('inspection');
  const [logDate, setLogDate] = useState(getJstTodayStr());
  const [logSummary, setLogSummary] = useState('');
  const [logVendor, setLogVendor] = useState('');
  const [logCost, setLogCost] = useState('');
  const [logMileage, setLogMileage] = useState('');
  const [syncLastInspection, setSyncLastInspection] = useState(true);
  const [savingLog, setSavingLog] = useState(false);

  const sortedUsers = useMemo(
    () => sortUsersByDivision(users || [], divisions || []),
    [users, divisions]
  );

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setConfirmDelete(false);
    setActiveSubTab('details');
    setShowLogForm(false);
    setFetchedLogs(null);
    setLogDate(getJstTodayStr());
    setLogSummary('');
    setLogVendor('');
    setLogCost('');
    setLogMileage('');

    if (asset) {
      setCategoryId(asset.categoryId);
      setAssetCode(asset.assetCode || '');
      setName(asset.name || '');
      setStatus(asset.status || 'active');
      setOfficeId(asset.officeId || '');
      setDivisionId(asset.divisionId || '');
      setIsShared(Boolean(asset.isShared));
      setAssigneeUserId(asset.assigneeUserId || '');
      setAttributes({ ...(asset.attributes || {}) });
      setAttachments([...(asset.attachments || [])]);
      setNotes(asset.notes || '');
    } else {
      const initialCatId = defaultCategoryId || categories[0]?.id || '';
      const initialCat = categories.find((c) => c.id === initialCatId);
      setCategoryId(initialCatId);
      setAssetCode('');
      setName('');
      setStatus('active');
      setOfficeId(currentUser.officeId || '');
      setDivisionId(currentUser.divisionId || '');
      setIsShared(
        defaultIsShared !== undefined
          ? defaultIsShared
          : Boolean(initialCat?.defaultShared)
      );
      setAssigneeUserId('');
      setAttributes({});
      setAttachments([]);
      setNotes('');
    }
  }, [isOpen, asset, defaultCategoryId, defaultIsShared, categories, currentUser]);

  // 履歴タブを開いた際に最新ログを取得
  useEffect(() => {
    if (!isOpen || !asset?.id || activeSubTab !== 'history') return;
    let cancelled = false;
    fetch(`${API_BASE_URL}/assets/${encodeURIComponent(asset.id)}/logs`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data)) {
          setFetchedLogs(data);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [isOpen, asset?.id, activeSubTab]);

  const currentCategory = useMemo(
    () => categories.find((c) => c.id === categoryId) || categories[0],
    [categories, categoryId]
  );

  const sortedFields = useMemo(() => {
    if (!currentCategory) return [];
    return [...(currentCategory.fields || [])].sort(
      (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
    );
  }, [currentCategory]);

  // フォーム上の現在入力に基づくリアルタイムアラートプレビュー
  const liveAlerts = useMemo(() => {
    if (!currentCategory) return [];
    const draftAsset: AssetItem = {
      id: asset?.id || 'draft',
      categoryId,
      assetCode,
      name: name || assetCode || '新規資産',
      isShared,
      status,
      attributes,
      attachments,
      createdAt: asset?.createdAt || '',
      updatedAt: asset?.updatedAt || ''
    };
    return computeAssetAlerts(draftAsset, currentCategory);
  }, [asset, categoryId, assetCode, name, isShared, status, attributes, attachments, currentCategory]);

  const assetLogs = useMemo(() => {
    if (fetchedLogs) return fetchedLogs;
    if (!asset?.id) return [];
    return logs
      .filter((l) => String(l.assetId) === String(asset.id))
      .sort(
        (a, b) =>
          (b.eventDate || '').localeCompare(a.eventDate || '') ||
          (b.createdAt || '').localeCompare(a.createdAt || '')
      );
  }, [fetchedLogs, logs, asset?.id]);

  if (!isOpen) return null;

  const handleCategorySwitch = (nextCatId: string) => {
    setCategoryId(nextCatId);
    if (isNew) {
      const nextCat = categories.find((c) => c.id === nextCatId);
      if (nextCat && defaultIsShared === undefined) {
        setIsShared(Boolean(nextCat.defaultShared));
      }
    }
  };

  const handleAttrChange = (key: string, value: any) => {
    setAttributes((prev) => ({ ...prev, [key]: value }));
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setError('');
    try {
      const uploaded = await uploadFile(file);
      setAttachments((prev) => [
        ...prev,
        {
          id: uploaded.id,
          name: uploaded.name,
          url: uploaded.url,
          size: uploaded.size,
          type: uploaded.type,
          uploadedAt: new Date().toISOString()
        }
      ]);
    } catch (err: any) {
      setError(err?.message || 'ファイルのアップロードに失敗しました');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const handleRemoveAttachment = (attId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = name.trim() || assetCode.trim();
    if (!trimmedName) {
      setError('登録番号または資産名を入力してください');
      return;
    }

    const selectedOffice = offices.find((o) => String(o.id) === String(officeId));
    const selectedDivision = divisions.find((d) => String(d.id) === String(divisionId));
    const selectedAssignee = !isShared && assigneeUserId
      ? users.find((u) => String(u.id) === String(assigneeUserId))
      : undefined;

    setSaving(true);
    setError('');
    try {
      await onSaveAsset({
        id: asset?.id,
        categoryId,
        assetCode: assetCode.trim() || trimmedName,
        name: trimmedName,
        officeId: selectedOffice ? String(selectedOffice.id) : (officeId || undefined),
        office: selectedOffice?.name || asset?.office,
        divisionId: selectedDivision ? String(selectedDivision.id) : (divisionId || undefined),
        division: selectedDivision?.name || asset?.division,
        isShared,
        assigneeUserId: isShared ? undefined : selectedAssignee ? String(selectedAssignee.id) : (assigneeUserId || undefined),
        assigneeUserName: isShared ? undefined : selectedAssignee?.name || asset?.assigneeUserName,
        status,
        attributes,
        attachments,
        notes
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || '資産の保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveLogEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!asset?.id) return;
    if (!logSummary.trim()) {
      setError('履歴の内容・概要を入力してください');
      return;
    }

    const updateAssetAttributes: Record<string, any> = {};
    if (syncLastInspection && (logActionType === 'inspection' || logActionType === 'repair')) {
      const hasLastInspection = sortedFields.some((f) => f.key === 'lastInspectionDate');
      const hasLastCalibration = sortedFields.some((f) => f.key === 'lastCalibrationDate');
      if (hasLastInspection) updateAssetAttributes.lastInspectionDate = logDate;
      if (hasLastCalibration) updateAssetAttributes.lastCalibrationDate = logDate;
      if (logMileage.trim() && sortedFields.some((f) => f.key === 'mileage')) {
        const parsedMileage = Number(logMileage.replace(/,/g, ''));
        if (!isNaN(parsedMileage)) updateAssetAttributes.mileage = parsedMileage;
      }
    }

    setSavingLog(true);
    setError('');
    try {
      const detail: Record<string, any> = {};
      if (logVendor.trim()) detail.vendor = logVendor.trim();
      if (logCost.trim()) {
        const num = Number(logCost.replace(/,/g, ''));
        if (!isNaN(num)) detail.cost = num;
      }
      if (logMileage.trim()) {
        const num = Number(logMileage.replace(/,/g, ''));
        if (!isNaN(num)) detail.mileage = num;
      }

      await onAddLog(asset.id, {
        actionType: logActionType,
        eventDate: logDate || getJstTodayStr(),
        summary: logSummary.trim(),
        detail: Object.keys(detail).length > 0 ? detail : undefined,
        updateAssetAttributes:
          Object.keys(updateAssetAttributes).length > 0 ? updateAssetAttributes : undefined
      });

      if (Object.keys(updateAssetAttributes).length > 0) {
        setAttributes((prev) => ({ ...prev, ...updateAssetAttributes }));
      }
      setLogSummary('');
      setLogVendor('');
      setLogCost('');
      setLogMileage('');
      setShowLogForm(false);

      // Refresh logs immediately
      const res = await fetch(`${API_BASE_URL}/assets/${encodeURIComponent(asset.id)}/logs`);
      if (res.ok) {
        const refreshed = await res.json();
        if (Array.isArray(refreshed)) setFetchedLogs(refreshed);
      }
    } catch (err: any) {
      setError(err?.message || '履歴の追加に失敗しました');
    } finally {
      setSavingLog(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!asset?.id || !onDeleteAsset) return;
    setSaving(true);
    try {
      await onDeleteAsset(asset.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const CatIcon = getAssetIconComponent(currentCategory?.icon);
  const catTheme = getCategoryTheme(currentCategory?.color);

  const renderFieldInput = (field: AssetFieldDefinition) => {
    const val = attributes[field.key];
    switch (field.type) {
      case 'select': {
        const options = field.options || [];
        return (
          <div className="space-y-1">
            <select
              value={val ?? ''}
              onChange={(e) => handleAttrChange(field.key, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">-- 未選択 --</option>
              {options.map((opt) => (
                <option key={opt} value={opt}>
                  {opt}
                </option>
              ))}
              {val && !options.includes(String(val)) && (
                <option value={String(val)}>{String(val)}</option>
              )}
            </select>
          </div>
        );
      }
      case 'date': {
        const matchedAlert = liveAlerts.find((a) => a.fieldKey === field.key);
        return (
          <div className="space-y-1">
            <input
              type="date"
              value={val ? String(val).slice(0, 10) : ''}
              onChange={(e) => handleAttrChange(field.key, e.target.value)}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {field.alertRule && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{formatAlertRuleSummary(field)}</span>
                {matchedAlert && (
                  <span
                    className={`font-bold px-1.5 py-0.5 rounded ${
                      matchedAlert.severity === 'overdue'
                        ? 'bg-rose-100 text-rose-700'
                        : matchedAlert.severity === 'warning'
                        ? 'bg-amber-100 text-amber-800'
                        : 'bg-purple-100 text-purple-700'
                    }`}
                  >
                    {matchedAlert.daysRemaining < 0
                      ? `${Math.abs(matchedAlert.daysRemaining)}日超過`
                      : `あと${matchedAlert.daysRemaining}日`}
                  </span>
                )}
              </div>
            )}
          </div>
        );
      }
      case 'number':
        return (
          <div className="relative flex items-center">
            <input
              type="number"
              value={val ?? ''}
              onChange={(e) =>
                handleAttrChange(
                  field.key,
                  e.target.value === '' ? '' : Number(e.target.value)
                )
              }
              placeholder={field.placeholder}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 pr-12"
            />
            {field.unit && (
              <span className="absolute right-3 text-xs font-medium text-slate-400">
                {field.unit}
              </span>
            )}
          </div>
        );
      case 'checkbox':
        return (
          <label className="inline-flex items-center gap-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg cursor-pointer w-full">
            <input
              type="checkbox"
              checked={Boolean(val)}
              onChange={(e) => handleAttrChange(field.key, e.target.checked)}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-slate-700">対象 / 有効</span>
          </label>
        );
      case 'textarea':
        return (
          <textarea
            rows={2}
            value={val ?? ''}
            onChange={(e) => handleAttrChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        );
      case 'url':
        return (
          <div className="flex items-center gap-1.5">
            <input
              type="url"
              value={val ?? ''}
              onChange={(e) => handleAttrChange(field.key, e.target.value)}
              placeholder={field.placeholder || 'https://...'}
              className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            {val && (
              <a
                href={String(val)}
                target="_blank"
                rel="noopener noreferrer"
                className="p-2 text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200"
                title="リンクを開く"
              >
                <ExternalLink className="w-4 h-4" />
              </a>
            )}
          </div>
        );
      default:
        return (
          <input
            type="text"
            value={val ?? ''}
            onChange={(e) => handleAttrChange(field.key, e.target.value)}
            placeholder={field.placeholder}
            className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        );
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center border shrink-0 ${catTheme.bg} ${catTheme.text} ${catTheme.border}`}>
              <CatIcon className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className={`px-2 py-0.5 text-[11px] font-bold rounded-md border ${catTheme.badge}`}>
                  {currentCategory?.name || '資産'}
                </span>
                <h3 className="text-base font-bold text-slate-900 truncate">
                  {isNew ? '新規資産を登録' : name || assetCode || '資産詳細'}
                </h3>
              </div>
              {!isNew && asset && (
                <p className="text-xs text-slate-500 mt-0.5">
                  ID: {asset.id} / 最終更新: {formatDateTimeJST(asset.updatedAt)}
                </p>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* SubTabs when editing existing asset */}
        {!isNew && (
          <div className="px-6 pt-2 border-b border-slate-200 flex items-center gap-2 bg-white">
            <button
              type="button"
              onClick={() => setActiveSubTab('details')}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'details'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <FileText className="w-3.5 h-3.5" />
              基本情報・パラメータ
            </button>
            <button
              type="button"
              onClick={() => setActiveSubTab('history')}
              className={`px-3.5 py-2 text-xs font-bold border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                activeSubTab === 'history'
                  ? 'border-indigo-600 text-indigo-700'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <History className="w-3.5 h-3.5" />
              点検・変更履歴
              <span className="px-1.5 py-0.5 text-[10px] rounded-full bg-slate-100 text-slate-700">
                {assetLogs.length}
              </span>
            </button>
          </div>
        )}

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* Active Alerts Banner */}
          {liveAlerts.length > 0 && (
            <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 space-y-1.5">
              <div className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-600" />
                この資産にはアラート対象期限があります
              </div>
              <div className="flex flex-wrap gap-2">
                {liveAlerts.map((al) => (
                  <span
                    key={`${al.fieldKey}-${al.targetDate}`}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-bold border ${
                      al.severity === 'overdue'
                        ? 'bg-rose-100 text-rose-800 border-rose-300'
                        : al.severity === 'warning'
                        ? 'bg-amber-100 text-amber-900 border-amber-300'
                        : 'bg-purple-100 text-purple-800 border-purple-300'
                    }`}
                  >
                    {al.severity === 'overdue' ? (
                      <AlertOctagon className="w-3.5 h-3.5" />
                    ) : (
                      <CalendarClock className="w-3.5 h-3.5" />
                    )}
                    {al.ruleLabel}: {al.fieldLabel} ({formatAssetDateJa(al.targetDate)} /{' '}
                    {al.daysRemaining < 0
                      ? `${Math.abs(al.daysRemaining)}日超過`
                      : `あと${al.daysRemaining}日`}
                    )
                  </span>
                ))}
              </div>
            </div>
          )}

          {activeSubTab === 'details' ? (
            <form id="asset-detail-form" onSubmit={handleSubmit} className="space-y-6">
              {/* Common Core Columns */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    資産種類
                  </label>
                  <select
                    value={categoryId}
                    onChange={(e) => handleCategorySwitch(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {categories.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ステータス
                  </label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as AssetStatus)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {Object.entries(ASSET_STATUS_META).map(([k, meta]) => (
                      <option key={k} value={k}>
                        {meta.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    {currentCategory?.id === 'cat-vehicle'
                      ? '登録番号（ナンバー）'
                      : '管理番号 / 登録番号'}{' '}
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={
                      currentCategory?.id === 'cat-vehicle'
                        ? '例: 名古屋401 ふ〇〇〇〇'
                        : '例: PC-NGY-012 / 複合機 2F'
                    }
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    資産コード / シリアル識別（任意）
                  </label>
                  <input
                    type="text"
                    value={assetCode}
                    onChange={(e) => setAssetCode(e.target.value)}
                    placeholder="例: AST-2026-001"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    拠点（営業所・支店）
                  </label>
                  <select
                    value={officeId}
                    onChange={(e) => setOfficeId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- 未指定 --</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    管理部署
                  </label>
                  <select
                    value={divisionId}
                    onChange={(e) => setDivisionId(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">-- 未指定 --</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 使用区分（個人使用 vs 共用・使用者限定なし） */}
                <div className="md:col-span-2 pt-2 border-t border-slate-200/80 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      使用形態
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => setIsShared(false)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          !isShared
                            ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <UserIcon className="w-3.5 h-3.5" />
                        個人 / 専任使用者
                      </button>
                      <button
                        type="button"
                        onClick={() => setIsShared(true)}
                        className={`px-3 py-2 rounded-lg text-xs font-bold border flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                          isShared
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        <Users className="w-3.5 h-3.5" />
                        共用（限定なし）
                      </button>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1.5">
                      使用者（メンバー紐づけ）
                    </label>
                    {isShared ? (
                      <div className="px-3 py-2 text-xs bg-emerald-50 border border-emerald-200 rounded-lg text-emerald-800 font-medium">
                        共用資産として管理されます（特定メンバーへの紐づけなし）
                      </div>
                    ) : (
                      <select
                        value={assigneeUserId}
                        onChange={(e) => setAssigneeUserId(e.target.value)}
                        className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      >
                        <option value="">-- 未割当 / 予備 --</option>
                        {sortedUsers.map((u) => (
                          <option key={u.id} value={u.id}>
                            {u.name}
                            {u.office ? ` (${u.office})` : ''}
                          </option>
                        ))}
                      </select>
                    )}
                  </div>
                </div>
              </div>

              {/* Dynamic Attributes Section */}
              <div className="space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
                  {currentCategory?.name} 詳細パラメータ
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {sortedFields.map((field) => (
                    <div
                      key={field.key}
                      className={field.type === 'textarea' ? 'md:col-span-2' : ''}
                    >
                      <label className="block text-xs font-bold text-slate-700 mb-1">
                        {field.label}
                        {field.required && <span className="text-rose-500 ml-1">*</span>}
                      </label>
                      {renderFieldInput(field)}
                    </div>
                  ))}
                </div>
              </div>

              {/* Notes & Attachments */}
              <div className="space-y-4 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    備考・メモ
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="事故修理履歴、引継ぎメモ、設置注意点など"
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                      資料添付（車検証・保証書・写真・マニュアル）
                    </label>
                    <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition-colors">
                      <Upload className="w-3.5 h-3.5" />
                      {uploading ? 'アップロード中...' : 'ファイルを追加'}
                      <input
                        type="file"
                        onChange={handleFileUpload}
                        disabled={uploading}
                        className="hidden"
                      />
                    </label>
                  </div>

                  {attachments.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {attachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        >
                          <a
                            href={resolveFileUrl(att.url)}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-2 text-indigo-600 hover:underline truncate min-w-0 font-medium"
                          >
                            <Paperclip className="w-3.5 h-3.5 shrink-0" />
                            <span className="truncate">{att.name}</span>
                          </a>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(att.id)}
                            className="p-1 text-slate-400 hover:text-rose-600 shrink-0 cursor-pointer"
                            title="添付を削除"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs text-slate-400 py-2">
                      添付された資料はありません
                    </div>
                  )}
                </div>
              </div>
            </form>
          ) : (
            /* History Tab */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-xs text-slate-500">
                  使用者変更・項目更新の自動監査ログと、点検・修理・入替の記録を確認できます
                </p>
                <button
                  type="button"
                  onClick={() => setShowLogForm((v) => !v)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  点検・修理履歴を記録
                </button>
              </div>

              {showLogForm && (
                <form
                  onSubmit={handleSaveLogEntry}
                  className="p-4 bg-indigo-50/60 border border-indigo-200 rounded-xl space-y-3"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        履歴種別
                      </label>
                      <select
                        value={logActionType}
                        onChange={(e) =>
                          setLogActionType(e.target.value as AssetLogActionType)
                        }
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      >
                        <option value="inspection">点検実施</option>
                        <option value="repair">修理対応</option>
                        <option value="replacement">入替・更新</option>
                        <option value="note">メモ・連絡事項</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        実施日 (JST)
                      </label>
                      <input
                        type="date"
                        value={logDate}
                        onChange={(e) => setLogDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        対応業者 / 担当者
                      </label>
                      <input
                        type="text"
                        value={logVendor}
                        onChange={(e) => setLogVendor(e.target.value)}
                        placeholder="例: トヨタレンタリース名古屋"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[11px] font-bold text-slate-700 mb-1">
                        内容・概要 <span className="text-rose-500">*</span>
                      </label>
                      <input
                        type="text"
                        value={logSummary}
                        onChange={(e) => setLogSummary(e.target.value)}
                        placeholder="例: P点検実施、フロントタイヤ2本交換"
                        className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          費用 (円)
                        </label>
                        <input
                          type="number"
                          value={logCost}
                          onChange={(e) => setLogCost(e.target.value)}
                          placeholder="0"
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          走行距離 (km)
                        </label>
                        <input
                          type="number"
                          value={logMileage}
                          onChange={(e) => setLogMileage(e.target.value)}
                          placeholder="任意"
                          className="w-full px-2 py-1.5 text-xs bg-white border border-slate-300 rounded-lg"
                        />
                      </div>
                    </div>
                  </div>

                  {(logActionType === 'inspection' || logActionType === 'repair') &&
                    sortedFields.some(
                      (f) => f.key === 'lastInspectionDate' || f.key === 'lastCalibrationDate'
                    ) && (
                      <label className="inline-flex items-center gap-2 text-xs text-indigo-900 font-medium cursor-pointer">
                        <input
                          type="checkbox"
                          checked={syncLastInspection}
                          onChange={(e) => setSyncLastInspection(e.target.checked)}
                          className="rounded border-indigo-300 text-indigo-600"
                        />
                        この日付で資産の「最終点検日（および走行距離）」を自動更新する
                      </label>
                    )}

                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setShowLogForm(false)}
                      className="px-3 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-white cursor-pointer"
                    >
                      閉じる
                    </button>
                    <button
                      type="submit"
                      disabled={savingLog}
                      className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {savingLog ? '記録中...' : '履歴を保存'}
                    </button>
                  </div>
                </form>
              )}

              {/* Timeline */}
              {assetLogs.length > 0 ? (
                <div className="space-y-2.5">
                  {assetLogs.map((log) => {
                    const meta = ASSET_LOG_ACTION_META[log.actionType] || {
                      label: log.actionType,
                      badgeClass: 'bg-slate-100 text-slate-700'
                    };
                    return (
                      <div
                        key={log.id}
                        className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs flex items-start justify-between gap-3"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`px-2 py-0.5 rounded-md text-[11px] font-bold ${meta.badgeClass}`}
                            >
                              {meta.label}
                            </span>
                            <span className="text-xs font-bold text-slate-800">
                              {formatAssetDateJa(log.eventDate)}
                            </span>
                            <span className="text-xs text-slate-500">
                              記録者: {log.actorName}
                            </span>
                          </div>
                          <p className="text-sm font-medium text-slate-900">
                            {log.summary}
                          </p>
                          {log.detail && (
                            <div className="flex flex-wrap gap-2 text-[11px] text-slate-600 pt-0.5">
                              {log.detail.vendor && (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-100 rounded">
                                  <Wrench className="w-3 h-3" />
                                  業者: {log.detail.vendor}
                                </span>
                              )}
                              {log.detail.cost !== undefined && (
                                <span className="px-2 py-0.5 bg-slate-100 rounded">
                                  費用: ¥{Number(log.detail.cost).toLocaleString()}
                                </span>
                              )}
                              {log.detail.mileage !== undefined && (
                                <span className="px-2 py-0.5 bg-slate-100 rounded">
                                  走行距離: {Number(log.detail.mileage).toLocaleString()} km
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                        {onDeleteLog && (currentUser.isAdmin || currentUser.role === 'admin' || log.actorId === currentUser.id) && (
                          <button
                            type="button"
                            onClick={() => asset?.id && onDeleteLog(asset.id, log.id)}
                            className="p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                            title="履歴を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="text-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                  まだ履歴が記録されていません
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            {!isNew && onDeleteAsset && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-700">削除しますか？</span>
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={saving}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                  >
                    削除確定
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-2.5 py-1.5 rounded-lg text-xs text-slate-600 hover:bg-slate-200 cursor-pointer"
                  >
                    キャンセル
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold text-rose-600 hover:bg-rose-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  資産を削除
                </button>
              )
            )}
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-200/70 transition-colors cursor-pointer"
            >
              閉じる
            </button>
            {activeSubTab === 'details' && (
              <button
                type="submit"
                form="asset-detail-form"
                disabled={saving}
                className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
              >
                <Save className="w-4 h-4" />
                {saving ? '保存中...' : isNew ? '登録する' : '変更を保存'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
