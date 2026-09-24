import React, { useState, useEffect } from 'react';
import { 
  InspectionCheckCategoryDef, 
  InspectionCheckItemDef, 
  InspectionJudgementCode,
  JUDGEMENT_OPTIONS 
} from '../../types/inspectionReport';
import { 
  getInspectionMasterCategories, 
  getInspectionMasterItems, 
  saveInspectionMaster, 
  resetInspectionMasterToDefault,
  DEFAULT_CATEGORIES,
  DEFAULT_ITEMS
} from '../../utils/inspectionMasterStorage';
import { 
  X, 
  Settings, 
  Plus, 
  Edit2, 
  Trash2, 
  ArrowUp, 
  ArrowDown, 
  Eye, 
  EyeOff, 
  RotateCcw, 
  Save, 
  CheckCircle2, 
  AlertCircle, 
  Layers, 
  ListChecks,
  Info
} from 'lucide-react';

interface InspectionCheckItemMasterModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved?: () => void;
}

export const InspectionCheckItemMasterModal: React.FC<InspectionCheckItemMasterModalProps> = ({
  isOpen,
  onClose,
  onSaved
}) => {
  const [categories, setCategories] = useState<InspectionCheckCategoryDef[]>([]);
  const [items, setItems] = useState<InspectionCheckItemDef[]>([]);
  const [activeTab, setActiveTab] = useState<'items' | 'categories'>('items');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  
  // 項目編集モーダル用状態
  const [editingItem, setEditingItem] = useState<InspectionCheckItemDef | null>(null);
  const [isItemEditorOpen, setIsItemEditorOpen] = useState(false);
  const [isNewItem, setIsNewItem] = useState(false);

  // カテゴリ編集用状態
  const [editingCategory, setEditingCategory] = useState<InspectionCheckCategoryDef | null>(null);
  const [isCategoryEditorOpen, setIsCategoryEditorOpen] = useState(false);
  const [isNewCategory, setIsNewCategory] = useState(false);

  // 通知メッセージ
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // モーダルオープン時に最新マスターをロード
  useEffect(() => {
    if (isOpen) {
      setCategories(getInspectionMasterCategories());
      setItems(getInspectionMasterItems(true)); // 非アクティブ項目も含めて読み込み
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // 項目の追加/編集ダイアログを開く
  const handleOpenItemEditor = (item?: InspectionCheckItemDef) => {
    if (item) {
      setEditingItem({ ...item });
      setIsNewItem(false);
    } else {
      const newKey = `custom_${Date.now()}`;
      const firstCatId = categories[0]?.id || 'door';
      setEditingItem({
        key: newKey,
        label: '',
        category: selectedCategoryFilter !== 'all' ? selectedCategoryFilter : firstCatId,
        defaultVal: 'V',
        order: items.length + 1,
        isActive: true,
        description: ''
      });
      setIsNewItem(true);
    }
    setIsItemEditorOpen(true);
  };

  // 項目保存（ローカル状態）
  const handleSaveItemEdit = () => {
    if (!editingItem || !editingItem.label.trim()) {
      alert('項目名を入力してください。');
      return;
    }

    if (isNewItem) {
      setItems([...items, { ...editingItem, order: items.length + 1 }]);
    } else {
      setItems(items.map(it => it.key === editingItem.key ? editingItem : it));
    }
    setIsItemEditorOpen(false);
    setEditingItem(null);
  };

  // 項目削除
  const handleDeleteItem = (key: string, label: string) => {
    if (!window.confirm(`点検項目「${label}」を削除しますか？\n（非表示にしたいだけの場合は「目のアイコン」をクリックして無効化することをお勧めします）`)) {
      return;
    }
    setItems(items.filter(it => it.key !== key));
    showToast(`項目「${label}」を削除しました`);
  };

  // 項目の表示/非表示（有効/無効）トグル
  const handleToggleItemActive = (key: string) => {
    setItems(items.map(it => {
      if (it.key === key) {
        const nextState = it.isActive === false ? true : false;
        return { ...it, isActive: nextState };
      }
      return it;
    }));
  };

  // 項目の並び順変更（上へ / 下へ）
  const handleMoveItem = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= items.length) return;

    const newItems = [...items];
    const temp = newItems[index];
    newItems[index] = newItems[targetIndex];
    newItems[targetIndex] = temp;

    // order番号の再振り直し
    const reordered = newItems.map((it, idx) => ({ ...it, order: idx + 1 }));
    setItems(reordered);
  };

  // カテゴリ追加/編集ダイアログを開く
  const handleOpenCategoryEditor = (cat?: InspectionCheckCategoryDef) => {
    if (cat) {
      setEditingCategory({ ...cat });
      setIsNewCategory(false);
    } else {
      const newId = `cat_${Date.now()}`;
      setEditingCategory({
        id: newId,
        name: '',
        order: categories.length + 1,
        description: ''
      });
      setIsNewCategory(true);
    }
    setIsCategoryEditorOpen(true);
  };

  // カテゴリ保存（ローカル状態）
  const handleSaveCategoryEdit = () => {
    if (!editingCategory || !editingCategory.name.trim()) {
      alert('カテゴリ名を入力してください。');
      return;
    }

    if (isNewCategory) {
      setCategories([...categories, { ...editingCategory, order: categories.length + 1 }]);
    } else {
      setCategories(categories.map(c => c.id === editingCategory.id ? editingCategory : c));
    }
    setIsCategoryEditorOpen(false);
    setEditingCategory(null);
  };

  // カテゴリ削除
  const handleDeleteCategory = (id: string, name: string) => {
    const linkedItems = items.filter(it => it.category === id);
    if (linkedItems.length > 0) {
      alert(`このカテゴリには ${linkedItems.length} 件の点検項目が属しています。先に点検項目を別のカテゴリに移動するか削除してください。`);
      return;
    }

    if (!window.confirm(`カテゴリ「${name}」を削除しますか？`)) {
      return;
    }
    setCategories(categories.filter(c => c.id !== id));
    showToast(`カテゴリ「${name}」を削除しました`);
  };

  // カテゴリの並び替え
  const handleMoveCategory = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= categories.length) return;

    const newCategories = [...categories];
    const temp = newCategories[index];
    newCategories[index] = newCategories[targetIndex];
    newCategories[targetIndex] = temp;

    const reordered = newCategories.map((c, idx) => ({ ...c, order: idx + 1 }));
    setCategories(reordered);
  };

  // 全体保存
  const handleSaveAll = () => {
    const success = saveInspectionMaster(categories, items);
    if (success) {
      showToast('点検項目マスターを正常に保存しました');
      if (onSaved) onSaved();
      setTimeout(() => {
        onClose();
      }, 700);
    } else {
      alert('保存に失敗しました。');
    }
  };

  // 初期標準リセット
  const handleResetToDefault = () => {
    if (!window.confirm('点検項目およびカテゴリを、初期のJADA標準（20項目）にリセットしますか？\n（追加したカスタム項目や並び順の変更は元に戻ります）')) {
      return;
    }
    resetInspectionMasterToDefault();
    setCategories(DEFAULT_CATEGORIES);
    setItems(DEFAULT_ITEMS);
    showToast('初期標準設定にリセットしました');
    if (onSaved) onSaved();
  };

  // フィルタ後の項目
  const filteredItems = selectedCategoryFilter === 'all'
    ? items
    : items.filter(it => it.category === selectedCategoryFilter);

  const getCategoryName = (catId: string) => {
    const found = categories.find(c => c.id === catId);
    return found ? found.name : catId;
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6">
      <div className="bg-white rounded-2xl shadow-2xl max-w-4xl w-full flex flex-col max-h-[90vh] overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95 duration-200">
        
        {/* ヘッダー */}
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-indigo-500/20 text-indigo-400 border border-indigo-400/30 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold">点検項目マスター設定</h2>
                <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  管理者・予定登録者権限
                </span>
              </div>
              <p className="text-xs text-slate-400 mt-0.5">
                現場の点検報告書エディタおよびA4印刷帳票に表示される点検項目・区分・初期値をカスタマイズします。
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* トースト表示 */}
        {toastMessage && (
          <div className="bg-emerald-600 text-white text-xs font-bold px-6 py-2 flex items-center justify-between shrink-0 animate-in slide-in-from-top-2">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4" />
              <span>{toastMessage}</span>
            </div>
          </div>
        )}

        {/* サブバー（タブ切り替え & 操作ボタン） */}
        <div className="px-6 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          {/* タブ切り替え */}
          <div className="flex items-center bg-slate-200/80 p-1 rounded-xl text-xs font-bold">
            <button
              type="button"
              onClick={() => setActiveTab('items')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'items'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <ListChecks className="w-4 h-4" />
              <span>点検項目 ({items.length}件)</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('categories')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeTab === 'categories'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>区分・カテゴリ ({categories.length}区分)</span>
            </button>
          </div>

          {/* 新規追加ボタン */}
          <div className="flex items-center gap-2">
            {activeTab === 'items' ? (
              <button
                type="button"
                onClick={() => handleOpenItemEditor()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>点検項目を追加</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => handleOpenCategoryEditor()}
                className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>カテゴリを追加</span>
              </button>
            )}
          </div>
        </div>

        {/* メインコンテンツエリア */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          
          {/* ========================================================== */}
          {/* ① 点検項目タブ */}
          {/* ========================================================== */}
          {activeTab === 'items' && (
            <div className="space-y-4">
              {/* カテゴリフィルターセレクタ */}
              <div className="flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">表示絞り込み:</span>
                  <div className="flex items-center gap-1 overflow-x-auto py-1">
                    <button
                      type="button"
                      onClick={() => setSelectedCategoryFilter('all')}
                      className={`px-2.5 py-1 rounded-full text-xs font-bold transition-colors cursor-pointer ${
                        selectedCategoryFilter === 'all'
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      すべて ({items.length})
                    </button>
                    {categories.map((cat) => {
                      const count = items.filter(it => it.category === cat.id).length;
                      return (
                        <button
                          key={cat.id}
                          type="button"
                          onClick={() => setSelectedCategoryFilter(cat.id)}
                          className={`px-2.5 py-1 rounded-full text-xs font-bold whitespace-nowrap transition-colors cursor-pointer ${
                            selectedCategoryFilter === cat.id
                              ? 'bg-indigo-600 text-white'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                          }`}
                        >
                          {cat.name} ({count})
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>無効（非表示）にした項目は点検票に表示されなくなります</span>
                </div>
              </div>

              {/* 点検項目テーブル */}
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <th className="p-2.5 w-12 text-center">順序</th>
                      <th className="p-2.5 w-32">区分</th>
                      <th className="p-2.5">点検項目名</th>
                      <th className="p-2.5 w-24 text-center">初期判定値</th>
                      <th className="p-2.5 w-20 text-center">状態</th>
                      <th className="p-2.5 w-36 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredItems.map((item, idx) => {
                      const isInactive = item.isActive === false;
                      const globalIndex = items.findIndex(it => it.key === item.key);
                      const opt = JUDGEMENT_OPTIONS.find(o => o.code === item.defaultVal);

                      return (
                        <tr 
                          key={item.key} 
                          className={`hover:bg-slate-50/80 transition-colors ${
                            isInactive ? 'bg-slate-50/60 opacity-60' : ''
                          }`}
                        >
                          {/* 順序 */}
                          <td className="p-2 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>

                          {/* 区分 */}
                          <td className="p-2">
                            <span className="px-2 py-0.5 rounded-md font-semibold text-[11px] bg-slate-100 text-slate-700 border border-slate-200">
                              {getCategoryName(item.category)}
                            </span>
                          </td>

                          {/* 項目名 & 説明 */}
                          <td className="p-2">
                            <div className="font-bold text-slate-900">
                              {item.label}
                            </div>
                            {item.description && (
                              <div className="text-[10.5px] text-slate-500 mt-0.5">
                                {item.description}
                              </div>
                            )}
                          </td>

                          {/* 初期判定値 */}
                          <td className="p-2 text-center">
                            {opt ? (
                              <span className={`inline-flex items-center justify-center w-6 h-6 rounded-md font-bold text-xs border ${opt.bgClass}`}>
                                {opt.code}
                              </span>
                            ) : (
                              <span className="text-slate-400">―</span>
                            )}
                          </td>

                          {/* 状態（有効/無効） */}
                          <td className="p-2 text-center">
                            <button
                              type="button"
                              onClick={() => handleToggleItemActive(item.key)}
                              className={`p-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer inline-flex items-center gap-1 ${
                                !isInactive
                                  ? 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100'
                                  : 'bg-slate-200 text-slate-500 hover:bg-slate-300'
                              }`}
                              title={!isInactive ? 'クリックして非表示に切替' : 'クリックして表示に切替'}
                            >
                              {!isInactive ? (
                                <>
                                  <Eye className="w-3.5 h-3.5" />
                                  <span className="text-[10px]">表示</span>
                                </>
                              ) : (
                                <>
                                  <EyeOff className="w-3.5 h-3.5" />
                                  <span className="text-[10px]">非表示</span>
                                </>
                              )}
                            </button>
                          </td>

                          {/* 操作（並び替え・編集・削除） */}
                          <td className="p-2 text-center">
                            <div className="flex items-center justify-center gap-1">
                              {/* 上へ */}
                              <button
                                type="button"
                                onClick={() => handleMoveItem(globalIndex, 'up')}
                                disabled={globalIndex === 0}
                                className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="上へ移動"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>

                              {/* 下へ */}
                              <button
                                type="button"
                                onClick={() => handleMoveItem(globalIndex, 'down')}
                                disabled={globalIndex === items.length - 1}
                                className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="下へ移動"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>

                              {/* 編集 */}
                              <button
                                type="button"
                                onClick={() => handleOpenItemEditor(item)}
                                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                                title="編集"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>

                              {/* 削除 */}
                              <button
                                type="button"
                                onClick={() => handleDeleteItem(item.key, item.label)}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}

                    {filteredItems.length === 0 && (
                      <tr>
                        <td colSpan={6} className="p-8 text-center text-slate-400">
                          該当する点検項目がありません。
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ========================================================== */}
          {/* ② 区分・カテゴリ管理タブ */}
          {/* ========================================================== */}
          {activeTab === 'categories' && (
            <div className="space-y-4">
              <div className="text-xs text-slate-500 flex items-center gap-1.5">
                <Info className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>点検項目を束ねる大区分（ドア部、懸架部、動力部など）を管理します。</span>
              </div>

              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                      <th className="p-2.5 w-12 text-center">順序</th>
                      <th className="p-2.5 w-32">カテゴリID</th>
                      <th className="p-2.5">カテゴリ名</th>
                      <th className="p-2.5 w-24 text-center">項目数</th>
                      <th className="p-2.5 w-32 text-center">操作</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {categories.map((cat, idx) => {
                      const itemCount = items.filter(it => it.category === cat.id).length;

                      return (
                        <tr key={cat.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="p-2.5 text-center text-slate-400 font-mono text-[11px]">
                            {idx + 1}
                          </td>
                          <td className="p-2.5 font-mono text-slate-500 text-[11px]">
                            {cat.id}
                          </td>
                          <td className="p-2.5 font-bold text-slate-800">
                            {cat.name}
                          </td>
                          <td className="p-2.5 text-center font-bold text-indigo-700">
                            {itemCount} 件
                          </td>
                          <td className="p-2.5 text-center">
                            <div className="flex items-center justify-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleMoveCategory(idx, 'up')}
                                disabled={idx === 0}
                                className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="上へ移動"
                              >
                                <ArrowUp className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleMoveCategory(idx, 'down')}
                                disabled={idx === categories.length - 1}
                                className="p-1 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
                                title="下へ移動"
                              >
                                <ArrowDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleOpenCategoryEditor(cat)}
                                className="p-1 text-indigo-600 hover:bg-indigo-50 rounded transition-colors cursor-pointer"
                                title="編集"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => handleDeleteCategory(cat.id, cat.name)}
                                className="p-1 text-rose-500 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                                title="削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* フッター操作バー */}
        <div className="px-6 py-3.5 bg-slate-100 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          {/* 初期標準リセットボタン */}
          <button
            type="button"
            onClick={handleResetToDefault}
            className="px-3 py-2 text-slate-600 hover:text-rose-600 hover:bg-rose-50 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>初期標準設定（JADA 20項目）に戻す</span>
          </button>

          {/* キャンセル / 保存ボタン */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              閉じる
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>マスターを保存して反映</span>
            </button>
          </div>
        </div>
      </div>

      {/* ============================================================== */}
      {/* 項目追加・編集サブモーダル */}
      {/* ============================================================== */}
      {isItemEditorOpen && editingItem && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {isNewItem ? '点検項目の新規追加' : '点検項目の編集'}
              </h3>
              <button
                type="button"
                onClick={() => setIsItemEditorOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              {/* 所属カテゴリ */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">所属区分（カテゴリ）</label>
                <select
                  value={editingItem.category}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-indigo-500 font-medium"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* 項目名 */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">点検項目名 *</label>
                <input
                  type="text"
                  value={editingItem.label}
                  onChange={(e) => setEditingItem({ ...editingItem, label: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-indigo-500 font-bold"
                  placeholder="例: タッチスイッチの電池残量"
                />
              </div>

              {/* 初期判定記号 */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">初期判定記号（新規報告書作成時）</label>
                <div className="grid grid-cols-4 gap-1.5 pt-1">
                  {JUDGEMENT_OPTIONS.map((opt) => (
                    <button
                      key={opt.code}
                      type="button"
                      onClick={() => setEditingItem({ ...editingItem, defaultVal: opt.code })}
                      className={`p-1.5 rounded-lg border text-center transition-all cursor-pointer ${
                        editingItem.defaultVal === opt.code
                          ? 'border-indigo-600 bg-indigo-50 font-bold text-indigo-700 shadow-2xs'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="font-bold text-xs">{opt.code}</div>
                      <div className="text-[9.5px] text-slate-500">{opt.label}</div>
                    </button>
                  ))}
                </div>
              </div>

              {/* 補足・説明 */}
              <div>
                <label className="block text-slate-600 font-bold mb-1">点検の着眼点・補足説明（任意）</label>
                <input
                  type="text"
                  value={editingItem.description || ''}
                  onChange={(e) => setEditingItem({ ...editingItem, description: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-indigo-500"
                  placeholder="例: LEDランプが赤点滅していないか確認"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsItemEditorOpen(false)}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveItemEdit}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                反映する
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================== */}
      {/* カテゴリ追加・編集サブモーダル */}
      {/* ============================================================== */}
      {isCategoryEditorOpen && editingCategory && (
        <div className="fixed inset-0 z-60 overflow-y-auto bg-slate-900/60 backdrop-blur-2xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-5 space-y-4 animate-in fade-in zoom-in-95">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-bold text-sm text-slate-900">
                {isNewCategory ? 'カテゴリの新規追加' : 'カテゴリの編集'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCategoryEditorOpen(false)}
                className="text-slate-400 hover:text-slate-600"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">カテゴリ名 *</label>
                <input
                  type="text"
                  value={editingCategory.name}
                  onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-white focus:outline-none focus:border-indigo-500 font-bold"
                  placeholder="例: 防火戸連動部"
                />
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">カテゴリID</label>
                <input
                  type="text"
                  value={editingCategory.id}
                  disabled={!isNewCategory}
                  onChange={(e) => setEditingCategory({ ...editingCategory, id: e.target.value })}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-slate-800 bg-slate-100 font-mono disabled:opacity-70"
                />
                <p className="text-[10px] text-slate-400 mt-1">
                  ※システム内部識別用の半角英数字です
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsCategoryEditorOpen(false)}
                className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg text-xs font-bold"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveCategoryEdit}
                className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs"
              >
                反映する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
