import { 
  InspectionCheckCategoryDef, 
  InspectionCheckItemDef, 
  STANDARD_CHECK_CATEGORIES, 
  STANDARD_CHECK_ITEMS 
} from '../types/inspectionReport';

const STORAGE_KEY_CATEGORIES = 'teranago_inspection_master_categories_v1';
const STORAGE_KEY_ITEMS = 'teranago_inspection_master_items_v1';
export const INSPECTION_MASTER_EVENT = 'teranago:inspection-master-changed';

/** 初期カテゴリリスト（デフォルトマスター） */
export const DEFAULT_CATEGORIES: InspectionCheckCategoryDef[] = STANDARD_CHECK_CATEGORIES.map((cat, idx) => ({
  id: cat.id,
  name: cat.name,
  order: idx + 1
}));

/** 初期項目リスト（デフォルトマスター） */
export const DEFAULT_ITEMS: InspectionCheckItemDef[] = STANDARD_CHECK_ITEMS.map((item, idx) => ({
  ...item,
  order: idx + 1,
  isActive: true
}));

/**
 * 点検カテゴリ一覧を取得（保存済みの設定がなければ初期値を返す）
 */
export function getInspectionMasterCategories(): InspectionCheckCategoryDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CATEGORIES);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => (a.order || 0) - (b.order || 0));
      }
    }
  } catch (e) {
    console.error('Failed to parse inspection master categories from localStorage', e);
  }
  return DEFAULT_CATEGORIES;
}

/**
 * 点検項目一覧を取得
 * @param includeInactive 非アクティブ（非表示）の項目も含めるかどうか（管理画面用）
 */
export function getInspectionMasterItems(includeInactive: boolean = false): InspectionCheckItemDef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_ITEMS);
    if (raw) {
      const parsed: InspectionCheckItemDef[] = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        const sorted = parsed.sort((a, b) => (a.order || 0) - (b.order || 0));
        return includeInactive ? sorted : sorted.filter(item => item.isActive !== false);
      }
    }
  } catch (e) {
    console.error('Failed to parse inspection master items from localStorage', e);
  }
  return includeInactive ? DEFAULT_ITEMS : DEFAULT_ITEMS.filter(item => item.isActive !== false);
}

/**
 * 点検マスター（カテゴリと項目）を保存
 */
export function saveInspectionMaster(
  categories: InspectionCheckCategoryDef[],
  items: InspectionCheckItemDef[]
): boolean {
  try {
    localStorage.setItem(STORAGE_KEY_CATEGORIES, JSON.stringify(categories));
    localStorage.setItem(STORAGE_KEY_ITEMS, JSON.stringify(items));

    // 他コンポーネントへ即時通知
    window.dispatchEvent(new CustomEvent(INSPECTION_MASTER_EVENT, {
      detail: { categories, items }
    }));
    return true;
  } catch (e) {
    console.error('Failed to save inspection master to localStorage', e);
    return false;
  }
}

/**
 * 点検マスターを初期状態（JADA標準20項目）にリセット
 */
export function resetInspectionMasterToDefault(): boolean {
  try {
    localStorage.removeItem(STORAGE_KEY_CATEGORIES);
    localStorage.removeItem(STORAGE_KEY_ITEMS);

    window.dispatchEvent(new CustomEvent(INSPECTION_MASTER_EVENT, {
      detail: { categories: DEFAULT_CATEGORIES, items: DEFAULT_ITEMS }
    }));
    return true;
  } catch (e) {
    console.error('Failed to reset inspection master', e);
    return false;
  }
}
