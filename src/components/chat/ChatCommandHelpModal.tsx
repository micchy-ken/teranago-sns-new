import React, { useEffect, useRef } from 'react';
import { 
  X, 
  HelpCircle as QuizIcon, 
  ArrowRight, 
  AtSign,
  Info,
  Lock,
  Megaphone,
  AlertTriangle,
  CheckSquare,
  ChevronDown,
  Dices,
  Calculator
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface ChatCommandHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onOpenQuizModal: () => void;
  onInsertCommand: (command: string) => void;
}

interface CommandItem {
  command: string;
  title: string;
  category: string;
  description: string;
  sampleInput?: string;
  icon: React.ReactNode;
  badgeColor: string;
  actionLabel?: string;
  onAction?: () => void;
}

export function ChatCommandHelpModal({
  isOpen,
  onClose,
  onOpenQuizModal,
  onInsertCommand,
}: ChatCommandHelpModalProps) {
  const modalRef = useRef<HTMLDivElement>(null);

  // Escキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // フロントエンド完結の全8種 @コマンド定義リスト (コマンド名入力とサンプル入力の両方に対応)
  const commands: CommandItem[] = [
    {
      command: '@quiz',
      title: 'クイズ・アンケート出題',
      category: 'コミュニケーション',
      description: 'チャット上にリアルタイム集計付きのクイズカードや選択肢アンケートを出題します。',
      sampleInput: '@quiz',
      icon: <QuizIcon className="w-5 h-5 text-indigo-600" />,
      badgeColor: 'bg-indigo-50 text-indigo-700 border-indigo-200',
      actionLabel: '作成画面を開く',
      onAction: () => {
        onClose();
        onOpenQuizModal();
      },
    },
    {
      command: '@secret',
      title: 'シークレット（伏字・ネタバレ）',
      category: 'コミュニケーション',
      description: '点線吹き出しの中にゴニョゴニョで伏字表示され、タップすると中身が開示されます。',
      sampleInput: '@secret ここだけの話、実は…',
      icon: <Lock className="w-5 h-5 text-purple-600" />,
      badgeColor: 'bg-purple-50 text-purple-700 border-purple-200',
    },
    {
      command: '@shout',
      title: '注目アナウンス（メガホン）',
      category: '業務・共有',
      description: '強調枠とメガホンアイコンで表示。全員に見てほしい緊急連絡や重要リマインドに。',
      sampleInput: '@shout 明日10時集合です！ご確認お願いします。',
      icon: <Megaphone className="w-5 h-5 text-sky-600" />,
      badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    {
      command: '@warn',
      title: '重要注意・警告カード',
      category: '業務・共有',
      description: '黄色と赤色の警告フレームで表示。システムメンテや作業上の注意喚起に使えます。(@alertも可)',
      sampleInput: '@warn 本日18時以降、定期メンテナンスのため利用できません。',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
      badgeColor: 'bg-amber-50 text-amber-700 border-amber-200',
    },
    {
      command: '@todo',
      title: 'リスト（チェック可能）',
      category: '業務・共有',
      description: '改行やスラッシュで区切った項目をチェックボックス付きリストに自動変換。(@checkも可)',
      sampleInput: '@todo 議事録共有 / 見積書作成 / 次回日程調整',
      icon: <CheckSquare className="w-5 h-5 text-emerald-600" />,
      badgeColor: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    },
    {
      command: '@fold',
      title: '長文テキストの折りたたみ',
      category: '便利ツール',
      description: '長文や議事録を「続きを読む」でコンパクトに折りたたみ、タイムラインをスッキリ保ちます。(@moreも可)',
      sampleInput: '@fold 定例会議の議事録\n・項目1\n・項目2\n・項目3',
      icon: <ChevronDown className="w-5 h-5 text-slate-600" />,
      badgeColor: 'bg-slate-50 text-slate-700 border-slate-200',
    },
    {
      command: '@dice',
      title: 'サイコロ・ランダム抽選',
      category: '便利ツール',
      description: '全ユーザーで公平に結果が一致するランダム抽選。「@dice 100」で1〜100、「@dice A, B」で項目抽選も可能。',
      sampleInput: '@dice ラーメン, カレー, パスタ, 定食',
      icon: <Dices className="w-5 h-5 text-sky-600" />,
      badgeColor: 'bg-sky-50 text-sky-700 border-sky-200',
    },
    {
      command: '@calc',
      title: '簡易計算機',
      category: '便利ツール',
      description: '数式を入力すると結果をカードで自動計算。割り勘や消費税計算などをパッと算出・コピーできます。',
      sampleInput: '@calc 1500 * 1.1',
      icon: <Calculator className="w-5 h-5 text-blue-600" />,
      badgeColor: 'bg-blue-50 text-blue-700 border-blue-200',
    },
  ];

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.15 }}
          ref={modalRef}
          className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* ヘッダー */}
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/70">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-600 flex items-center justify-center shadow-xs">
                <AtSign className="w-4 h-4" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                  特殊機能コマンド案内
                  <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-600 border border-indigo-100">
                    全{commands.length}種類
                  </span>
                </h3>
                <p className="text-[11px] text-slate-500">
                  チャット入力欄で利用できる @コマンド一覧ガイドです
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
              title="閉じる"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* コンテンツ */}
          <div className="p-5 space-y-4 max-h-[72vh] overflow-y-auto">
            {/* 概要案内バナー */}
            <div className="p-3 bg-indigo-50/80 border border-indigo-200/70 rounded-xl flex items-start gap-2.5 text-xs text-indigo-950">
              <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="leading-relaxed">
                メッセージの先頭に <code className="px-1.5 py-0.5 font-mono font-bold bg-white border border-indigo-200 rounded text-indigo-700">@コマンド</code> をつけて送信すると、専用カードとして表示されます。「@〜を入力」でコマンド名のみ、「サンプル入力」で例文を挿入できます。
              </div>
            </div>

            {/* コマンド一覧 */}
            <div className="space-y-3">
              <div className="text-[11px] font-bold text-slate-400 tracking-wider uppercase">
                利用可能な @コマンド ({commands.length}件)
              </div>

              {commands.map((cmd) => (
                <div
                  key={cmd.command}
                  className="p-3.5 rounded-xl border border-slate-200 bg-white hover:border-indigo-300 hover:shadow-xs transition-all space-y-2"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center shrink-0">
                        {cmd.icon}
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <code className="text-xs font-mono font-black text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200/60">
                            {cmd.command}
                          </code>
                          <span className="text-xs font-bold text-slate-800">
                            {cmd.title}
                          </span>
                        </div>
                        <span className="text-[10px] text-slate-400 font-medium">
                          {cmd.category}
                        </span>
                      </div>
                    </div>
                  </div>

                  <p className="text-xs text-slate-600 leading-relaxed">
                    {cmd.description}
                  </p>

                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2 flex-wrap">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <button
                        type="button"
                        onClick={() => {
                          onInsertCommand(`${cmd.command} `);
                          onClose();
                        }}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                        title="コマンド名のみ入力欄に挿入"
                      >
                        <span>「{cmd.command}」を入力</span>
                      </button>

                      {cmd.sampleInput && (
                        <button
                          type="button"
                          onClick={() => {
                            onInsertCommand(cmd.sampleInput!);
                            onClose();
                          }}
                          className="px-2.5 py-1.5 rounded-lg bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold transition-all cursor-pointer flex items-center gap-1 border border-indigo-100 shadow-2xs"
                          title="例文サンプルを入力欄に挿入"
                        >
                          <span>サンプル入力</span>
                        </button>
                      )}
                    </div>

                    {cmd.onAction && (
                      <button
                        type="button"
                        onClick={cmd.onAction}
                        className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold shadow-2xs hover:shadow-xs flex items-center gap-1.5 transition-all active:scale-95 cursor-pointer ml-auto"
                      >
                        <span>{cmd.actionLabel || '開く'}</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* フッター */}
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50/50 flex justify-end">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
