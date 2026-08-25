import React, { useState, useMemo } from 'react';
import { 
  Search, 
  Building2, 
  Briefcase, 
  Mail, 
  Phone, 
  Smartphone, 
  PhoneCall, 
  Calendar, 
  MessageSquare, 
  LayoutGrid, 
  List as ListIcon, 
  Users, 
  Copy, 
  Check, 
  Award, 
  ShieldCheck, 
  ExternalLink,
  ChevronRight,
  FilterX
} from 'lucide-react';
import { User, OfficeMaster, DivisionMaster } from '../types';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';

export interface UserDirectoryProps {
  users: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  currentUser?: User;
  onSelectUser: (user: User) => void;
  onSendMemo: (user: User) => void;
  onViewSchedule?: (user: User) => void;
  onOpenChat?: (user: User) => void;
}

export function UserDirectory({
  users,
  offices = [],
  divisions = [],
  currentUser,
  onSelectUser,
  onSendMemo,
  onViewSchedule,
  onOpenChat,
}: UserDirectoryProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (text: string, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  // 拠点一覧（マスタ + ユーザーデータに存在する拠点名）
  const officeList = useMemo(() => {
    const list: string[] = [];
    offices.forEach(o => {
      if (o.name && !list.includes(o.name)) list.push(o.name);
    });
    users.forEach(u => {
      if (u.office && !list.includes(u.office)) list.push(u.office);
    });
    return list;
  }, [offices, users]);

  // 部署一覧（マスタ + ユーザーデータに存在する部署名）
  const divisionList = useMemo(() => {
    const list: string[] = [];
    divisions.forEach(d => {
      if (d.name && !list.includes(d.name)) list.push(d.name);
    });
    users.forEach(u => {
      if (u.division && !list.includes(u.division)) list.push(u.division);
    });
    return list;
  }, [divisions, users]);

  // 各拠点の人数カウント
  const officeCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length };
    users.forEach(u => {
      const off = u.office || '未設定';
      counts[off] = (counts[off] || 0) + 1;
    });
    return counts;
  }, [users]);

  // 各部署の人数カウント
  const divisionCounts = useMemo(() => {
    const counts: Record<string, number> = { all: users.length };
    users.forEach(u => {
      const div = u.division || '未設定';
      counts[div] = (counts[div] || 0) + 1;
    });
    return counts;
  }, [users]);

  // フィルタリング処理
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      // 拠点フィルター
      if (selectedOffice !== 'all') {
        if (selectedOffice === '未設定') {
          if (user.office) return false;
        } else if (user.office !== selectedOffice) {
          return false;
        }
      }

      // 部署フィルター
      if (selectedDivision !== 'all') {
        if (selectedDivision === '未設定') {
          if (user.division) return false;
        } else if (user.division !== selectedDivision) {
          return false;
        }
      }

      // フリーワード検索
      if (searchQuery.trim()) {
        const query = searchQuery.trim().toLowerCase();
        const matchName = user.name?.toLowerCase().includes(query);
        const matchKana = user.kanaName?.toLowerCase().includes(query);
        const matchOffice = user.office?.toLowerCase().includes(query);
        const matchDiv = user.division?.toLowerCase().includes(query);
        const matchDept = user.department?.toLowerCase().includes(query);
        const matchPos = user.position?.toLowerCase().includes(query);
        const matchEmail = user.email?.toLowerCase().includes(query);
        const matchMobileEmail = user.mobileEmail?.toLowerCase().includes(query);
        const matchPhone = (user.phoneOutside || user.phone || '').replace(/[-ー]/g, '').includes(query.replace(/[-ー]/g, ''));
        const matchExt = user.phoneExtension?.includes(query);
        const matchMob = user.mobilePhone?.replace(/[-ー]/g, '').includes(query.replace(/[-ー]/g, ''));

        if (!matchName && !matchKana && !matchOffice && !matchDiv && !matchDept && !matchPos && !matchEmail && !matchMobileEmail && !matchPhone && !matchExt && !matchMob) {
          return false;
        }
      }

      return true;
    });
  }, [users, selectedOffice, selectedDivision, searchQuery]);

  const hasActiveFilters = selectedOffice !== 'all' || selectedDivision !== 'all' || searchQuery.trim() !== '';

  const handleResetFilters = () => {
    setSelectedOffice('all');
    setSelectedDivision('all');
    setSearchQuery('');
  };

  return (
    <div className="space-y-6">
      {/* 画面ヘッダー */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-indigo-50 border border-indigo-100 flex items-center justify-center text-indigo-600 shadow-2xs">
                <Users className="w-5 h-5" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-slate-900 tracking-tight flex items-center gap-2">
                  <span>社員名簿・社員一覧</span>
                  <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-indigo-50 text-indigo-700 border border-indigo-200/60">
                    {filteredUsers.length} / {users.length} 名
                  </span>
                </h1>
                <p className="text-xs text-slate-500 mt-0.5">
                  支店・拠点や部署での絞り込み、連絡先（内線・携帯・メール）の確認および伝言送信が可能です
                </p>
              </div>
            </div>
          </div>

          {/* 表示形式切替 & 検索ボックス */}
          <div className="flex items-center gap-3">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="名前、部署、電話、メール..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 hover:bg-slate-100/80 focus:bg-white border border-slate-200 focus:border-indigo-500 rounded-xl text-xs text-slate-800 placeholder-slate-400 transition-all outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs font-bold p-1"
                >
                  ✕
                </button>
              )}
            </div>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200/80 shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'grid'
                    ? 'bg-white text-indigo-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="カード表示"
              >
                <LayoutGrid className="w-4 h-4" />
                <span className="hidden sm:inline">カード</span>
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg text-xs font-semibold flex items-center gap-1 transition-all cursor-pointer ${
                  viewMode === 'table'
                    ? 'bg-white text-indigo-600 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
                title="一覧テーブル表示"
              >
                <ListIcon className="w-4 h-4" />
                <span className="hidden sm:inline">一覧</span>
              </button>
            </div>
          </div>
        </div>

        {/* 絞り込みフィルターセクション */}
        <div className="mt-6 pt-5 border-t border-slate-100 space-y-4">
          {/* 拠点（支店）フィルター */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                支店・拠点
              </div>
              {selectedOffice !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedOffice('all')}
                  className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                >
                  拠点をすべて表示
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedOffice('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedOffice === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                }`}
              >
                <span>すべて</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedOffice === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {users.length}
                </span>
              </button>
              {officeList.map(off => {
                const count = officeCounts[off] || 0;
                const isSelected = selectedOffice === off;
                return (
                  <button
                    key={off}
                    type="button"
                    onClick={() => setSelectedOffice(off)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                    }`}
                  >
                    <span>{off}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 部署フィルター */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <div className="text-xs font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1.5">
                <Briefcase className="w-3.5 h-3.5 text-indigo-600" />
                部署
              </div>
              {selectedDivision !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedDivision('all')}
                  className="text-[11px] text-indigo-600 hover:underline cursor-pointer"
                >
                  部署をすべて表示
                </button>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedDivision('all')}
                className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                  selectedDivision === 'all'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                }`}
              >
                <span>すべて</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedDivision === 'all' ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                }`}>
                  {users.length}
                </span>
              </button>
              {divisionList.map(div => {
                const count = divisionCounts[div] || 0;
                const isSelected = selectedDivision === div;
                return (
                  <button
                    key={div}
                    type="button"
                    onClick={() => setSelectedDivision(div)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all cursor-pointer flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200/80'
                    }`}
                  >
                    <span>{div}</span>
                    <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* アクティブフィルターリセットバー */}
          {hasActiveFilters && (
            <div className="flex items-center justify-between bg-indigo-50/70 border border-indigo-100 px-3.5 py-2 rounded-xl text-xs text-indigo-900">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">絞り込み中:</span>
                {selectedOffice !== 'all' && (
                  <span className="bg-white px-2 py-0.5 rounded-md border border-indigo-200 text-indigo-800 font-medium">
                    拠点: {selectedOffice}
                  </span>
                )}
                {selectedDivision !== 'all' && (
                  <span className="bg-white px-2 py-0.5 rounded-md border border-indigo-200 text-indigo-800 font-medium">
                    部署: {selectedDivision}
                  </span>
                )}
                {searchQuery && (
                  <span className="bg-white px-2 py-0.5 rounded-md border border-indigo-200 text-indigo-800 font-medium">
                    検索: "{searchQuery}"
                  </span>
                )}
              </div>
              <button
                type="button"
                onClick={handleResetFilters}
                className="inline-flex items-center gap-1 text-indigo-700 hover:text-indigo-900 font-bold hover:underline cursor-pointer shrink-0 ml-2"
              >
                <FilterX className="w-3.5 h-3.5" />
                条件クリア
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 社員一覧コンテンツ */}
      {filteredUsers.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center shadow-xs">
          <div className="w-16 h-16 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
            <Users className="w-8 h-8" />
          </div>
          <h3 className="text-base font-bold text-slate-800">該当する社員が見つかりません</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
            選択された拠点・部署の条件または検索キーワードに一致する社員はいません。条件を変更してお試しください。
          </p>
          <button
            type="button"
            onClick={handleResetFilters}
            className="mt-4 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors cursor-pointer"
          >
            すべての社員を表示
          </button>
        </div>
      ) : viewMode === 'grid' ? (
        /* カードグリッド表示 */
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredUsers.map(user => {
            const isSelf = currentUser?.id === user.id;
            return (
              <div
                key={user.id}
                onClick={() => onSelectUser(user)}
                className="bg-white rounded-2xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all p-5 flex flex-col justify-between cursor-pointer group relative overflow-hidden"
              >
                {/* Top User Info */}
                <div>
                  <div className="flex items-start gap-3.5">
                    <div className="relative shrink-0">
                      <img
                        src={getAvatarUrl(user.avatarUrl)}
                        onError={handleAvatarError}
                        alt={user.name}
                        className="w-14 h-14 rounded-2xl object-cover ring-2 ring-slate-100 group-hover:ring-indigo-200 transition-all bg-white"
                      />
                      {user.isAdmin && (
                        <div 
                          className="absolute -bottom-1 -right-1 bg-amber-500 text-white p-0.5 rounded-full shadow-xs"
                          title="管理者"
                        >
                          <ShieldCheck className="w-3.5 h-3.5" />
                        </div>
                      )}
                    </div>

                    <div className="flex-1 min-w-0">
                      {user.kanaName && (
                        <div className="text-[10px] text-slate-400 font-medium tracking-wider truncate">
                          {user.kanaName}
                        </div>
                      )}
                      <h3 className="text-base font-bold text-slate-900 group-hover:text-indigo-600 transition-colors truncate flex items-center gap-1.5">
                        <span>{user.name}</span>
                        {isSelf && (
                          <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal shrink-0">
                            あなた
                          </span>
                        )}
                      </h3>

                      <div className="flex flex-wrap items-center gap-1 mt-1.5">
                        {user.office && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100">
                            <Building2 className="w-3 h-3 text-indigo-500" />
                            {user.office}
                          </span>
                        )}
                        {user.division && (
                          <span className="inline-flex items-center gap-0.5 px-2 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200/60">
                            <Briefcase className="w-3 h-3 text-slate-500" />
                            {user.division}
                          </span>
                        )}
                        {user.position && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[10px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
                            <Award className="w-2.5 h-2.5 text-amber-600" />
                            {user.position}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Contact Summary Box */}
                  <div className="mt-4 space-y-1.5 bg-slate-50/80 rounded-xl p-3 border border-slate-100 text-xs text-slate-600">
                    {/* PCメール */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0 text-slate-500">
                        <Mail className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span className="text-[10.5px] shrink-0">PC:</span>
                        {user.email ? (
                          <span className="text-slate-800 font-medium truncate" title={user.email}>
                            {user.email}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10.5px]">未登録</span>
                        )}
                      </div>
                      {user.email && (
                        <button
                          type="button"
                          onClick={(e) => handleCopy(user.email!, `card_email_${user.id}`, e)}
                          className="text-slate-400 hover:text-indigo-600 p-0.5 cursor-pointer shrink-0"
                          title="メールアドレスをコピー"
                        >
                          {copiedKey === `card_email_${user.id}` ? (
                            <Check className="w-3 h-3 text-emerald-600" />
                          ) : (
                            <Copy className="w-3 h-3" />
                          )}
                        </button>
                      )}
                    </div>

                    {/* 電話番号 (内線 / 携帯) */}
                    <div className="flex items-center justify-between gap-2 pt-1 border-t border-slate-200/50">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <Phone className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span className="text-[10.5px] text-slate-500 shrink-0">内線:</span>
                        {user.phoneExtension ? (
                          <span className="text-indigo-700 font-bold bg-indigo-50/80 px-1.5 py-0.2 rounded text-[11px] border border-indigo-100">
                            {user.phoneExtension}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10.5px]">なし</span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5 min-w-0">
                        <Smartphone className="w-3.5 h-3.5 shrink-0 text-slate-400" />
                        <span className="text-[10.5px] text-slate-500 shrink-0">携帯:</span>
                        {user.mobilePhone ? (
                          <span className="text-slate-800 font-medium truncate" title={user.mobilePhone}>
                            {user.mobilePhone}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[10.5px]">未登録</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Bottom Action Footer */}
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    {onViewSchedule && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onViewSchedule(user);
                        }}
                        className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="スケジュールを見る"
                      >
                        <Calendar className="w-4 h-4" />
                      </button>
                    )}
                    {onOpenChat && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onOpenChat(user);
                        }}
                        className="p-1.5 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                        title="チャットを開く"
                      >
                        <MessageSquare className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSendMemo(user);
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-xs rounded-xl border border-indigo-200 hover:border-indigo-600 transition-all cursor-pointer shadow-2xs"
                      title="この社員に伝言メモを送信"
                    >
                      <PhoneCall className="w-3.5 h-3.5" />
                      <span>伝言を送る</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelectUser(user);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="明細ポップアップを表示"
                    >
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        /* 一覧テーブル表示 */
        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50/80 border-b border-slate-200 text-slate-600 font-bold uppercase tracking-wider text-[11px]">
                <tr>
                  <th className="py-3 px-4">社員名</th>
                  <th className="py-3 px-4">拠点 / 部署</th>
                  <th className="py-3 px-4">役職</th>
                  <th className="py-3 px-4">PCメール</th>
                  <th className="py-3 px-4">内線 / 携帯電話</th>
                  <th className="py-3 px-4 text-right">アクション</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {filteredUsers.map(user => {
                  const isSelf = currentUser?.id === user.id;
                  return (
                    <tr
                      key={user.id}
                      onClick={() => onSelectUser(user)}
                      className="hover:bg-indigo-50/40 transition-colors cursor-pointer group"
                    >
                      {/* 社員名・アバター */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          <img
                            src={getAvatarUrl(user.avatarUrl)}
                            onError={handleAvatarError}
                            alt={user.name}
                            className="w-9 h-9 rounded-xl object-cover ring-1 ring-slate-200 group-hover:ring-indigo-300 shrink-0"
                          />
                          <div className="min-w-0">
                            {user.kanaName && (
                              <div className="text-[10px] text-slate-400 font-medium">
                                {user.kanaName}
                              </div>
                            )}
                            <div className="font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                              <span>{user.name}</span>
                              {isSelf && (
                                <span className="text-[9px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded font-normal">
                                  あなた
                                </span>
                              )}
                              {user.isAdmin && (
                                <span className="text-[9px] bg-amber-100 text-amber-800 px-1.5 py-0.2 rounded font-medium">
                                  管理者
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* 拠点 / 部署 */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <span className="inline-flex items-center gap-1 text-slate-900 font-semibold">
                            <Building2 className="w-3 h-3 text-indigo-500" />
                            {user.office || '未設定'}
                          </span>
                          <span className="inline-flex items-center gap-1 text-slate-500 text-[11px]">
                            <Briefcase className="w-3 h-3 text-slate-400" />
                            {user.division || '未設定'}
                          </span>
                        </div>
                      </td>

                      {/* 役職 */}
                      <td className="py-3 px-4">
                        {user.position ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-amber-50 text-amber-800 border border-amber-200/60">
                            <Award className="w-3 h-3 text-amber-600" />
                            {user.position}
                          </span>
                        ) : (
                          <span className="text-slate-400">一般</span>
                        )}
                      </td>

                      {/* PCメール */}
                      <td className="py-3 px-4">
                        {user.email ? (
                          <div className="flex items-center gap-1.5">
                            <a
                              href={`mailto:${user.email}`}
                              onClick={(e) => e.stopPropagation()}
                              className="text-indigo-600 hover:text-indigo-800 hover:underline max-w-[180px] truncate block"
                            >
                              {user.email}
                            </a>
                            <button
                              type="button"
                              onClick={(e) => handleCopy(user.email!, `tbl_email_${user.id}`, e)}
                              className="text-slate-400 hover:text-indigo-600 p-0.5 cursor-pointer shrink-0"
                              title="メールアドレスをコピー"
                            >
                              {copiedKey === `tbl_email_${user.id}` ? (
                                <Check className="w-3 h-3 text-emerald-600" />
                              ) : (
                                <Copy className="w-3 h-3" />
                              )}
                            </button>
                          </div>
                        ) : (
                          <span className="text-slate-400">未登録</span>
                        )}
                      </td>

                      {/* 電話 (内線 / 携帯) */}
                      <td className="py-3 px-4">
                        <div className="flex flex-col gap-1">
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-medium">内線:</span>
                            {user.phoneExtension ? (
                              <span className="text-indigo-700 font-bold bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100 text-[11px]">
                                {user.phoneExtension}
                              </span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">なし</span>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5">
                            <span className="text-[10px] text-slate-400 font-medium">携帯:</span>
                            {user.mobilePhone ? (
                              <span className="text-slate-800 font-medium">{user.mobilePhone}</span>
                            ) : (
                              <span className="text-slate-400 text-[10px]">未登録</span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* アクション */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => onSendMemo(user)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-600 text-indigo-700 hover:text-white font-bold text-xs rounded-lg border border-indigo-200 hover:border-indigo-600 transition-all cursor-pointer shadow-2xs"
                            title="伝言メモを作成"
                          >
                            <PhoneCall className="w-3.5 h-3.5" />
                            <span>伝言</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => onSelectUser(user)}
                            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                            title="明細ポップアップ"
                          >
                            <ExternalLink className="w-3.5 h-3.5" />
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
  );
}
