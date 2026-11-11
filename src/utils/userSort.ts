import { User, DivisionMaster } from '../types';
import { getUserDivisionId, getUserDivisionName } from './masterResolver';

/**
 * ユーザーのソート関数
 * 優先順位:
 * 1. sortOrder (昇順, 未設定は末尾 999999)
 * 2. kanaName (五十音順) または name
 */
export function sortUsers(users: User[]): User[] {
  return [...users].sort((a, b) => {
    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const nameA = a.kanaName || a.name || '';
    const nameB = b.kanaName || b.name || '';
    return nameA.localeCompare(nameB, 'ja');
  });
}

/**
 * 部署ごとにソートしたユーザー配列
 * 優先順位:
 * 1. 部署マスタの順序 (divisionId / code / name から解決)
 * 2. 部署名
 * 3. 部署内での sortOrder (昇順)
 * 4. 氏名/かな順
 */
export function sortUsersByDivision(users: User[], divisions: DivisionMaster[] = []): User[] {
  const divisionOrderMap = new Map<string, number>();
  divisions.forEach((d, idx) => {
    if (d.id) divisionOrderMap.set(String(d.id), idx);
    if (d.code) divisionOrderMap.set(String(d.code), idx);
    if (d.name) divisionOrderMap.set(d.name, idx);
  });

  return [...users].sort((a, b) => {
    const divIdA = getUserDivisionId(a, divisions) || a.division || a.department || '未設定';
    const divIdB = getUserDivisionId(b, divisions) || b.division || b.department || '未設定';

    if (divIdA !== divIdB) {
      const idxA = divisionOrderMap.has(divIdA)
        ? divisionOrderMap.get(divIdA)!
        : a.division && divisionOrderMap.has(a.division)
        ? divisionOrderMap.get(a.division)!
        : 9999;
      const idxB = divisionOrderMap.has(divIdB)
        ? divisionOrderMap.get(divIdB)!
        : b.division && divisionOrderMap.has(b.division)
        ? divisionOrderMap.get(b.division)!
        : 9999;
      if (idxA !== idxB) {
        return idxA - idxB;
      }
      const nameA = getUserDivisionName(a, divisions) || divIdA;
      const nameB = getUserDivisionName(b, divisions) || divIdB;
      return nameA.localeCompare(nameB, 'ja');
    }

    const orderA = typeof a.sortOrder === 'number' ? a.sortOrder : 999999;
    const orderB = typeof b.sortOrder === 'number' ? b.sortOrder : 999999;

    if (orderA !== orderB) {
      return orderA - orderB;
    }

    const nameA = a.kanaName || a.name || '';
    const nameB = b.kanaName || b.name || '';
    return nameA.localeCompare(nameB, 'ja');
  });
}
