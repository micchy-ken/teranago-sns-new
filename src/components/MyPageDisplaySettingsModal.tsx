import React, { useState, useEffect } from 'react';
import {
  Settings,
  X,
  Calendar,
  Monitor,
  Phone,
  FileText,
  MessageSquare,
  RotateCcw,
  Check,
  Sparkles,
  Sliders,
  Eye,
  LayoutGrid,
} from 'lucide-react';
import { MyPageSectionCounts, MyPageEnvSettings } from '../types';

export const DEFAULT_SECTION_COUNTS: Required<MyPageSectionCounts> = {
  events: 5,
  topics: 5,
  memos: 5,
  workflow: 5,
  chats: 8,
  reports: 8,
};

export const DEFAULT_ENV_SETTINGS: MyPageEnvSettings = {
  displayCounts: DEFAULT_SECTION_COUNTS,
  density: 'standard',
  showActivePolls: true,
};

interface MyPageDisplaySettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentCounts: Required<MyPageSectionCounts>;
  currentEnvSettings?: MyPageEnvSettings;
  targetSectionId?: string | null;
  onSave: (newCounts: Required<MyPageSectionCounts>, newEnvSettings: MyPageEnvSettings) => Promise<void> | void;
}

export const MyPageDisplaySettingsModal: React.FC<MyPageDisplaySettingsModalProps> = ({
  isOpen,
  onClose,
  currentCounts,
  currentEnvSettings,
  targetSectionId,
  onSave,
}) => {
  const [counts, setCounts] = useState<Required<MyPageSectionCounts>>(currentCounts);
  const [density, setDensity] = useState<'standard' | 'compact'>(currentEnvSettings?.density || 'standard');
  const [showActivePolls, setShowActivePolls] = useState<boolean>(currentEnvSettings?.showActivePolls !== false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setCounts(currentCounts);
      setDensity(currentEnvSettings?.density || 'standard');
      setShowActivePolls(currentEnvSettings?.showActivePolls !== false);
      setSaveSuccess(false);
    }
  }, [isOpen, currentCounts, currentEnvSettings]);

  if (!isOpen) return null;

  const handleResetToDefaults = () => {
    setCounts(DEFAULT_SECTION_COUNTS);
    setDensity('standard');
    setShowActivePolls(true);
  };

  const handleSave = async () => {
    setIsSaving(true);
    try {
      const newEnv: MyPageEnvSettings = {
        ...(currentEnvSettings || {}),
        displayCounts: counts,
        density,
        showActivePolls,
      };
      await onSave(counts, newEnv);
      setSaveSuccess(true);
      setTimeout(() => {
        setIsSaving(false);
        onClose();
      }, 500);
    } catch (e) {
      console.error('Failed to save display settings:', e);
      setIsSaving(false);
    }
  };

  const sectionsConfig = [
    {
      id: 'events' as const,
      title: 'スケジュール',
      icon: Calendar,
      iconBg: 'bg-amber-500',
      badgeBg: 'bg-amber-100 text-amber-800 border-amber-200',
      description: '直近1週間の参加予定の表示上限件数',
      options: [
        { label: '3件', value: 3 },
        { label: '5件 (標準)', value: 5 },
        { label: '8件', value: 8 },
        { label: '10件', value: 10 },
        { label: '15件', value: 15 },
        { label: '全件', value: 0 },
      ],
    },
    {
      id: 'topics' as const,
      title: '掲示板',
      icon: Monitor,
      iconBg: 'bg-indigo-600',
      badgeBg: 'bg-indigo-100 text-indigo-800 border-indigo-200',
      description: '新着トピック・お知らせの表示件数',
      options: [
        { label: '3件', value: 3 },
        { label: '5件 (標準)', value: 5 },
        { label: '8件', value: 8 },
        { label: '10件', value: 10 },
        { label: '15件', value: 15 },
        { label: '20件', value: 20 },
      ],
    },
    {
      id: 'memos' as const,
      title: '伝言メモ',
      icon: Phone,
      iconBg: 'bg-rose-500',
      badgeBg: 'bg-rose-100 text-rose-800 border-rose-200',
      description: '自分宛ての伝言メモの表示件数',
      options: [
        { label: '3件', value: 3 },
        { label: '5件 (標準)', value: 5 },
        { label: '8件', value: 8 },
        { label: '10件', value: 10 },
        { label: '15件', value: 15 },
        { label: '20件', value: 20 },
      ],
    },
    {
      id: 'workflow' as const,
      title: 'ワークフロー',
      icon: FileText,
      iconBg: 'bg-purple-600',
      badgeBg: 'bg-purple-100 text-purple-800 border-purple-200',
      description: '申請中および要承認申請の表示件数',
      options: [
        { label: '3件', value: 3 },
        { label: '5件 (標準)', value: 5 },
        { label: '8件', value: 8 },
        { label: '10件', value: 10 },
        { label: '15件', value: 15 },
        { label: '20件', value: 20 },
      ],
    },
    {
      id: 'chats' as const,
      title: 'チャットルーム',
      icon: MessageSquare,
      iconBg: 'bg-blue-600',
      badgeBg: 'bg-blue-100 text-blue-800 border-blue-200',
      description: '参加しているチャットルームの表示件数',
      options: [
        { label: '4件', value: 4 },
        { label: '6件', value: 6 },
        { label: '8件 (標準)', value: 8 },
        { label: '10件', value: 10 },
        { label: '12件', value: 12 },
        { label: '16件', value: 16 },
      ],
    },
    {
      id: 'reports' as const,
      title: '日報・週報',
      icon: FileText,
      iconBg: 'bg-teal-600',
      badgeBg: 'bg-teal-100 text-teal-800 border-teal-200',
      description: '関連する日報および週報の表示件数',
      options: [
        { label: '4件', value: 4 },
        { label: '6件', value: 6 },
        { label: '8件 (標準)', value: 8 },
        { label: '10件', value: 10 },
        { label: '12件', value: 12 },
        { label: '16件', value: 16 },
      ],
    },
  ];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-3 sm:p-4 backdrop-blur-xs overflow-y-auto animate-in fade-in duration-200"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-6 max-h-[90vh] flex flex-col border border-slate-100"
      >
        {/* モーダルヘッダー */}
        <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-indigo-500/20 text-indigo-400 rounded-lg">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold flex items-center gap-2">
                <span>マイページ表示件数・環境設定</span>
              </h2>
              <p className="text-[11px] text-slate-300 mt-0.5">
                各セクションの表示件数や表示密度を自由に選択・保存できます
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
            aria-label="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* スクロール可能コンテンツ */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-6 flex-1 bg-slate-50/50">
          {/* ① セクション別表示件数設定 */}
          <div className="space-y-3">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  各セクションの表示件数
                </h3>
              </div>
              <span className="text-[11px] text-slate-500">
                ※ 超過分は「すべて表示」リンクから確認可能
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              {sectionsConfig.map((sec) => {
                const Icon = sec.icon;
                const isTarget = targetSectionId === sec.id;
                const currentValue = counts[sec.id];

                return (
                  <div
                    key={sec.id}
                    className={`bg-white rounded-xl p-3.5 border transition-all shadow-2xs flex flex-col justify-between gap-2.5 ${
                      isTarget
                        ? 'border-indigo-400 ring-2 ring-indigo-500/20 bg-indigo-50/15'
                        : 'border-slate-200/90 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className={`p-1.5 ${sec.iconBg} text-white rounded-lg shrink-0 shadow-2xs`}>
                            <Icon className="w-3.5 h-3.5" />
                          </div>
                          <h4 className="text-xs font-extrabold text-slate-800 truncate">
                            {sec.title}
                          </h4>
                        </div>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border shrink-0 ${sec.badgeBg}`}>
                          現在: {currentValue === 0 ? '全件' : `${currentValue}件`}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-500 line-clamp-1">
                        {sec.description}
                      </p>
                    </div>

                    {/* 件数選択チップ */}
                    <div className="flex flex-wrap items-center gap-1.5 pt-1 border-t border-slate-100">
                      {sec.options.map((opt) => {
                        const isSelected = currentValue === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => {
                              setCounts((prev) => ({
                                ...prev,
                                [sec.id]: opt.value,
                              }));
                            }}
                            className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-all cursor-pointer border ${
                              isSelected
                                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs scale-102'
                                : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200/80 hover:border-slate-300'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* ② 環境設定・表示カスタマイズ（拡張枠） */}
          <div className="space-y-3 pt-2">
            <div className="flex items-center justify-between pb-1.5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <LayoutGrid className="w-4 h-4 text-indigo-600" />
                <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                  マイページ環境設定（表示スタイル）
                </h3>
              </div>
              <span className="text-[10px] bg-indigo-50 text-indigo-700 font-bold px-2 py-0.5 rounded-full border border-indigo-100">
                拡張設定
              </span>
            </div>

            {/* 表示密度 */}
            <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs space-y-2.5">
              <div className="flex items-center justify-between">
                <div>
                  <span className="text-xs font-bold text-slate-800 block">カードの表示密度</span>
                  <span className="text-[11px] text-slate-500 block mt-0.5">
                    マイページ各カードの内側余白を調整し、情報量と視認性のバランスを選べます
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2.5 pt-1">
                <button
                  type="button"
                  onClick={() => setDensity('standard')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    density === 'standard'
                      ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/20 shadow-2xs'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-slate-800">標準 (ゆったり)</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">余白を確保した見やすいデザイン</div>
                  </div>
                  {density === 'standard' && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                </button>

                <button
                  type="button"
                  onClick={() => setDensity('compact')}
                  className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between ${
                    density === 'compact'
                      ? 'border-indigo-500 bg-indigo-50/40 ring-2 ring-indigo-500/20 shadow-2xs'
                      : 'border-slate-200 bg-slate-50/50 hover:bg-white hover:border-slate-300'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-slate-800">コンパクト (凝縮)</div>
                    <div className="text-[10px] text-slate-500 mt-0.5">余白を詰め、一覧性を向上</div>
                  </div>
                  {density === 'compact' && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                </button>
              </div>
            </div>

            {/* 確定前日程調整ウィジェットの表示 */}
            <div className="bg-white rounded-xl p-4 border border-slate-200/90 shadow-2xs flex items-center justify-between gap-3">
              <div className="min-w-0">
                <span className="text-xs font-bold text-slate-800 block flex items-center gap-1.5">
                  <Eye className="w-3.5 h-3.5 text-amber-500" />
                  進行中日程調整の強調表示
                </span>
                <span className="text-[11px] text-slate-500 block mt-0.5">
                  スケジュール上部に回答待ちや調整中の日程調整一覧を常に表示します
                </span>
              </div>
              <button
                type="button"
                onClick={() => setShowActivePolls((prev) => !prev)}
                className={`w-11 h-6 rounded-full transition-colors relative cursor-pointer shrink-0 focus:outline-none ${
                  showActivePolls ? 'bg-indigo-600' : 'bg-slate-300'
                }`}
                role="switch"
                aria-checked={showActivePolls}
              >
                <span
                  className={`block w-4 h-4 rounded-full bg-white shadow-xs transform transition-transform absolute top-1 ${
                    showActivePolls ? 'left-6' : 'left-1'
                  }`}
                />
              </button>
            </div>

            {/* 将来の環境設定拡張用インフォメーション枠 */}
            <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200/80 flex items-start gap-2.5">
              <Sparkles className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div className="text-[11px] text-amber-900 leading-relaxed">
                <span className="font-bold">環境設定の拡張について: </span>
                本設定画面では、今後のアップデートにより自動リフレッシュ間隔や追加ウィジェットの配置など、さらなる環境設定項目の追加に対応できる構造を保持しています。
              </div>
            </div>
          </div>
        </div>

        {/* モーダルフッター */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={handleResetToDefaults}
            className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-slate-200/60 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
            title="すべての表示件数・環境設定を初期値に戻す"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>初期値に戻す</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 text-xs font-black text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 disabled:bg-indigo-400 rounded-xl shadow-xs transition-all flex items-center gap-1.5 cursor-pointer"
            >
              {saveSuccess ? (
                <>
                  <Check className="w-4 h-4 text-white" />
                  <span>保存完了</span>
                </>
              ) : isSaving ? (
                <span>保存中...</span>
              ) : (
                <span>設定を保存</span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
