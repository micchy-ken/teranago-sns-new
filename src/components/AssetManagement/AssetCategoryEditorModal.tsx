import React, { useState, useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  ArrowUp,
  ArrowDown,
  Save,
  BellRing,
  Eye,
  CheckSquare,
  Settings2
} from 'lucide-react';
import {
  AssetAlertKind,
  AssetCategory,
  AssetFieldDefinition,
  AssetFieldType
} from '../../types';
import {
  ASSET_ICON_OPTIONS,
  getAssetIconComponent,
  getCategoryTheme
} from '../../utils/assets';

interface AssetCategoryEditorModalProps {
  isOpen: boolean;
  onClose: () => void;
  category?: AssetCategory | null; // null/undefined = 新規種類作成
  onSave: (categoryData: Partial<AssetCategory> & { id?: string }) => Promise<void>;
  onDelete?: (categoryId: string) => Promise<void>;
}

const FIELD_TYPE_OPTIONS: Array<{ value: AssetFieldType; label: string }> = [
  { value: 'text', label: 'テキスト' },
  { value: 'number', label: '数値' },
  { value: 'date', label: '日付（カレンダー/アラート対応）' },
  { value: 'select', label: '選択肢（プルダウン）' },
  { value: 'checkbox', label: 'チェックボックス' },
  { value: 'url', label: 'URLリンク' },
  { value: 'textarea', label: '長文メモ' }
];

const COLOR_OPTIONS = [
  { key: 'sky', label: 'スカイブルー', dot: 'bg-sky-500' },
  { key: 'indigo', label: 'インディゴ', dot: 'bg-indigo-500' },
  { key: 'emerald', label: 'エメラルド', dot: 'bg-emerald-500' },
  { key: 'amber', label: 'アンバー', dot: 'bg-amber-500' },
  { key: 'purple', label: 'パープル', dot: 'bg-purple-500' },
  { key: 'rose', label: 'ローズ', dot: 'bg-rose-500' },
  { key: 'slate', label: 'スレート', dot: 'bg-slate-500' }
];

type AlertPresetKey = 'none' | 'inspection_30' | 'replacement_180' | 'custom';

function getAlertPresetKey(field: AssetFieldDefinition): AlertPresetKey {
  if (!field.alertRule) return 'none';
  if (field.alertRule.kind === 'inspection' && field.alertRule.daysBefore === 30) {
    return 'inspection_30';
  }
  if (field.alertRule.kind === 'replacement' && field.alertRule.daysBefore === 180) {
    return 'replacement_180';
  }
  return 'custom';
}

export function AssetCategoryEditorModal({
  isOpen,
  onClose,
  category,
  onSave,
  onDelete
}: AssetCategoryEditorModalProps) {
  const [name, setName] = useState('');
  const [icon, setIcon] = useState('Box');
  const [color, setColor] = useState('indigo');
  const [defaultShared, setDefaultShared] = useState(false);
  const [fields, setFields] = useState<AssetFieldDefinition[]>([]);
  const [optionsTextMap, setOptionsTextMap] = useState<Record<number, string>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setError('');
    setConfirmDelete(false);
    if (category) {
      setName(category.name);
      setIcon(category.icon || 'Box');
      setColor(category.color || 'indigo');
      setDefaultShared(Boolean(category.defaultShared));
      const sorted = [...(category.fields || [])].sort(
        (a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)
      );
      setFields(sorted);
      const map: Record<number, string> = {};
      sorted.forEach((f, idx) => {
        map[idx] = (f.options || []).join(', ');
      });
      setOptionsTextMap(map);
    } else {
      setName('');
      setIcon('Box');
      setColor('indigo');
      setDefaultShared(false);
      const initialFields: AssetFieldDefinition[] = [
        {
          key: 'makerModel',
          label: 'メーカー・型番',
          type: 'text',
          showInList: true,
          showInMyAssets: true,
          sortOrder: 1
        },
        {
          key: 'nextInspectionDate',
          label: '点検予定日',
          type: 'date',
          showInList: true,
          showInMyAssets: true,
          alertRule: { kind: 'inspection', daysBefore: 30, label: '点検アラート' },
          sortOrder: 2
        }
      ];
      setFields(initialFields);
      setOptionsTextMap({});
    }
  }, [isOpen, category]);

  if (!isOpen) return null;

  const handleAddField = () => {
    const nextIdx = fields.length;
    const uniqueKey = `field_${Date.now().toString(36)}_${nextIdx}`;
    setFields((prev) => [
      ...prev,
      {
        key: uniqueKey,
        label: '',
        type: 'text',
        showInList: true,
        showInMyAssets: false,
        sortOrder: nextIdx + 1
      }
    ]);
  };

  const handleUpdateField = (index: number, patch: Partial<AssetFieldDefinition>) => {
    setFields((prev) =>
      prev.map((f, idx) => (idx === index ? { ...f, ...patch } : f))
    );
  };

  const handleMoveField = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= fields.length) return;
    setFields((prev) => {
      const next = [...prev];
      const temp = next[index];
      next[index] = next[target];
      next[target] = temp;
      return next.map((f, i) => ({ ...f, sortOrder: i + 1 }));
    });
    setOptionsTextMap((prev) => {
      const next = { ...prev };
      const temp = next[index] ?? '';
      next[index] = next[target] ?? '';
      next[target] = temp;
      return next;
    });
  };

  const handleRemoveField = (index: number) => {
    setFields((prev) => prev.filter((_, idx) => idx !== index));
    setOptionsTextMap((prev) => {
      const next: Record<number, string> = {};
      Object.entries(prev).forEach(([k, v]) => {
        const ki = Number(k);
        if (ki < index) next[ki] = v;
        else if (ki > index) next[ki - 1] = v;
      });
      return next;
    });
  };

  const handleAlertPresetChange = (index: number, preset: AlertPresetKey) => {
    if (preset === 'none') {
      handleUpdateField(index, { alertRule: undefined });
    } else if (preset === 'inspection_30') {
      handleUpdateField(index, {
        alertRule: { kind: 'inspection', daysBefore: 30, label: '点検アラート' }
      });
    } else if (preset === 'replacement_180') {
      handleUpdateField(index, {
        alertRule: { kind: 'replacement', daysBefore: 180, label: '入替アラート' }
      });
    } else {
      handleUpdateField(index, {
        alertRule: {
          kind: fields[index]?.alertRule?.kind || 'custom',
          daysBefore: fields[index]?.alertRule?.daysBefore || 60,
          label: fields[index]?.alertRule?.label || '期限アラート'
        }
      });
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      setError('資産種類名を入力してください');
      return;
    }

    const sanitizedFields: AssetFieldDefinition[] = fields
      .filter((f) => f.label.trim() !== '')
      .map((f, idx) => {
        const rawOpt = optionsTextMap[idx] ?? (f.options || []).join(', ');
        const parsedOptions =
          f.type === 'select'
            ? rawOpt
                .split(/[,、\n]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined;
        return {
          ...f,
          key: f.key.trim() || `field_${idx + 1}`,
          label: f.label.trim(),
          options: parsedOptions,
          alertRule: f.type === 'date' ? f.alertRule : undefined,
          sortOrder: idx + 1
        };
      });

    setSaving(true);
    setError('');
    try {
      await onSave({
        id: category?.id,
        name: name.trim(),
        icon,
        color,
        defaultShared,
        fields: sanitizedFields,
        sortOrder: category?.sortOrder ?? 99
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || '保存に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCategory = async () => {
    if (!category?.id || !onDelete) return;
    setSaving(true);
    try {
      await onDelete(category.id);
      onClose();
    } catch (err: any) {
      setError(err?.message || '削除に失敗しました');
    } finally {
      setSaving(false);
    }
  };

  const SelectedIcon = getAssetIconComponent(icon);
  const theme = getCategoryTheme(color);

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50/70">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center border ${theme.bg} ${theme.text} ${theme.border}`}>
              <SelectedIcon className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {category ? `資産種類・項目設定「${category.name}」` : '新しい資産種類を追加'}
              </h3>
              <p className="text-xs text-slate-500">
                DBのJSONスキーマにより、プログラム改修なしでパラメータの増減・アラート条件を変更できます
              </p>
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          {error && (
            <div className="p-3 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
              {error}
            </div>
          )}

          {/* 基本設定 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 bg-slate-50/80 p-4 rounded-xl border border-slate-200/80">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                資産種類名 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="例: 車両、PC、計測器、ドローン"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <div className="flex flex-col justify-end">
              <label className="flex items-center gap-2.5 p-2.5 bg-white border border-slate-200 rounded-lg cursor-pointer hover:bg-slate-50">
                <input
                  type="checkbox"
                  checked={defaultShared}
                  onChange={(e) => setDefaultShared(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                />
                <div>
                  <div className="text-xs font-bold text-slate-800">
                    デフォルトを「共用（使用者限定なし）」にする
                  </div>
                  <div className="text-[11px] text-slate-500">
                    複合機・ルーター・拠点共用機器などに適しています
                  </div>
                </div>
              </label>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">アイコン</label>
              <div className="flex flex-wrap gap-1.5">
                {ASSET_ICON_OPTIONS.map((opt) => {
                  const IconComp = getAssetIconComponent(opt.key);
                  const active = icon === opt.key;
                  return (
                    <button
                      key={opt.key}
                      type="button"
                      onClick={() => setIcon(opt.key)}
                      title={opt.label}
                      className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 transition-all cursor-pointer ${
                        active
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <IconComp className="w-3.5 h-3.5" />
                      <span className="whitespace-nowrap">{opt.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">テーマカラー</label>
              <div className="flex flex-wrap gap-2">
                {COLOR_OPTIONS.map((c) => (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setColor(c.key)}
                    className={`px-2.5 py-1.5 rounded-lg border text-xs flex items-center gap-1.5 cursor-pointer transition-all ${
                      color === c.key
                        ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <span className={`w-2.5 h-2.5 rounded-full ${c.dot}`} />
                    <span className="whitespace-nowrap">{c.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 動的パラメータ一覧 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Settings2 className="w-4 h-4 text-indigo-600" />
                <h4 className="text-sm font-bold text-slate-900">
                  固有パラメータ（列・入力項目）のカスタマイズ
                </h4>
                <span className="text-xs text-slate-500">({fields.length}項目)</span>
              </div>
              <button
                type="button"
                onClick={handleAddField}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                パラメータを追加
              </button>
            </div>

            <div className="space-y-2.5">
              {fields.map((field, idx) => {
                const alertPreset = getAlertPresetKey(field);
                return (
                  <div
                    key={field.key || idx}
                    className="p-3.5 bg-white border border-slate-200 rounded-xl shadow-2xs space-y-2.5"
                  >
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-center">
                      {/* 並び替えボタン */}
                      <div className="md:col-span-1 flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleMoveField(idx, -1)}
                          disabled={idx === 0}
                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="上へ"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleMoveField(idx, 1)}
                          disabled={idx === fields.length - 1}
                          className="p-1 rounded hover:bg-slate-100 text-slate-400 hover:text-slate-700 disabled:opacity-30 cursor-pointer"
                          title="下へ"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                      </div>

                      {/* 項目名 */}
                      <div className="md:col-span-3">
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                          項目名
                        </label>
                        <input
                          type="text"
                          value={field.label}
                          onChange={(e) => handleUpdateField(idx, { label: e.target.value })}
                          placeholder="例: 点検予定、ETCカード"
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>

                      {/* データ型 */}
                      <div className="md:col-span-3">
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                          入力形式
                        </label>
                        <select
                          value={field.type}
                          onChange={(e) =>
                            handleUpdateField(idx, { type: e.target.value as AssetFieldType })
                          }
                          className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                          {FIELD_TYPE_OPTIONS.map((t) => (
                            <option key={t.value} value={t.value}>
                              {t.label}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* 単位・表示オプション */}
                      <div className="md:col-span-4 flex flex-wrap items-center gap-3 pt-3 md:pt-0">
                        {field.type === 'number' && (
                          <input
                            type="text"
                            value={field.unit || ''}
                            onChange={(e) => handleUpdateField(idx, { unit: e.target.value })}
                            placeholder="単位 (例: km)"
                            className="w-20 px-2 py-1 text-xs border border-slate-300 rounded-md"
                          />
                        )}
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={field.showInList !== false}
                            onChange={(e) =>
                              handleUpdateField(idx, { showInList: e.target.checked })
                            }
                            className="rounded border-slate-300 text-indigo-600"
                          />
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          一覧列に表示
                        </label>
                        <label className="inline-flex items-center gap-1.5 text-xs text-slate-700 cursor-pointer whitespace-nowrap">
                          <input
                            type="checkbox"
                            checked={Boolean(field.showInMyAssets)}
                            onChange={(e) =>
                              handleUpdateField(idx, { showInMyAssets: e.target.checked })
                            }
                            className="rounded border-slate-300 text-indigo-600"
                          />
                          <CheckSquare className="w-3.5 h-3.5 text-slate-400" />
                          自分の資産に表示
                        </label>
                      </div>

                      {/* 削除 */}
                      <div className="md:col-span-1 flex justify-end">
                        <button
                          type="button"
                          onClick={() => handleRemoveField(idx)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                          title="項目を削除"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>

                    {/* 選択肢入力 (select) */}
                    {field.type === 'select' && (
                      <div className="pl-0 md:pl-10">
                        <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                          選択肢（カンマ区切りで指定）
                        </label>
                        <input
                          type="text"
                          value={optionsTextMap[idx] ?? (field.options || []).join(', ')}
                          onChange={(e) =>
                            setOptionsTextMap((prev) => ({ ...prev, [idx]: e.target.value }))
                          }
                          placeholder="例: 軽油, ガソリン, ハイブリッド, EV"
                          className="w-full px-2.5 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    )}

                    {/* アラート設定 (date) */}
                    {field.type === 'date' && (
                      <div className="pl-0 md:pl-10 flex flex-wrap items-center gap-2.5 pt-1 border-t border-slate-100">
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-amber-700">
                          <BellRing className="w-3.5 h-3.5" />
                          アラート・カレンダー連携:
                        </span>
                        <select
                          value={alertPreset}
                          onChange={(e) =>
                            handleAlertPresetChange(idx, e.target.value as AlertPresetKey)
                          }
                          className="px-2.5 py-1 text-xs bg-amber-50/70 border border-amber-200 rounded-lg text-slate-800"
                        >
                          <option value="none">アラートなし（日付のみ）</option>
                          <option value="inspection_30">点検アラート（1ヶ月前 / 30日前）</option>
                          <option value="replacement_180">入替アラート（リース満了6ヶ月前 / 180日前）</option>
                          <option value="custom">カスタム日数指定</option>
                        </select>

                        {alertPreset === 'custom' && field.alertRule && (
                          <div className="flex items-center gap-2">
                            <select
                              value={field.alertRule.kind}
                              onChange={(e) =>
                                handleUpdateField(idx, {
                                  alertRule: {
                                    ...field.alertRule!,
                                    kind: e.target.value as AssetAlertKind
                                  }
                                })
                              }
                              className="px-2 py-1 text-xs border border-slate-300 rounded-md bg-white"
                            >
                              <option value="inspection">点検アラート</option>
                              <option value="replacement">入替アラート</option>
                              <option value="custom">期限アラート</option>
                            </select>
                            <input
                              type="number"
                              min={1}
                              max={730}
                              value={field.alertRule.daysBefore}
                              onChange={(e) =>
                                handleUpdateField(idx, {
                                  alertRule: {
                                    ...field.alertRule!,
                                    daysBefore: Math.max(1, parseInt(e.target.value || '30', 10))
                                  }
                                })
                              }
                              className="w-16 px-2 py-1 text-xs border border-slate-300 rounded-md"
                            />
                            <span className="text-xs text-slate-600">日前</span>
                            <input
                              type="text"
                              value={field.alertRule.label || ''}
                              onChange={(e) =>
                                handleUpdateField(idx, {
                                  alertRule: {
                                    ...field.alertRule!,
                                    label: e.target.value
                                  }
                                })
                              }
                              placeholder="ラベル"
                              className="w-28 px-2 py-1 text-xs border border-slate-300 rounded-md"
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {fields.length === 0 && (
                <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-300 text-xs text-slate-500">
                  固有パラメータがありません。「パラメータを追加」から項目を追加してください。
                </div>
              )}
            </div>
          </div>
        </form>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between gap-3">
          <div>
            {category && !category.isSystem && onDelete && (
              confirmDelete ? (
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-rose-700">本当に種類を削除しますか？</span>
                  <button
                    type="button"
                    onClick={handleDeleteCategory}
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
                  この種類を削除
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
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSubmit}
              disabled={saving}
              className="inline-flex items-center gap-1.5 px-5 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-xs disabled:opacity-50 transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              {saving ? '保存中...' : '設定を保存'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
