import React from 'react';
import { GripVertical } from 'lucide-react';

interface MyPageSectionCardProps {
  id: string;
  title: string;
  icon: React.ElementType;
  iconBgColor: string;
  badgeCount?: number;
  badgeLabel?: string;
  badgeBgColor?: string;
  onNavigate: () => void;
  actionButton?: React.ReactNode;
  children: React.ReactNode;
  isFullWidth?: boolean;
  isDragging?: boolean;
  onDragStart?: (e: React.DragEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
}

export const MyPageSectionCard: React.FC<MyPageSectionCardProps> = ({
  id,
  title,
  icon: Icon,
  iconBgColor,
  badgeCount = 0,
  badgeLabel = '未読',
  badgeBgColor = 'bg-rose-500',
  onNavigate,
  actionButton,
  children,
  isFullWidth = false,
  isDragging = false,
  onDragStart,
  onDragOver,
  onDrop,
}) => {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDrop={onDrop}
      className={`transition-all h-full ${isFullWidth ? 'lg:col-span-2' : 'lg:col-span-1'} ${
        isDragging ? 'opacity-40 scale-[0.99] border-2 border-dashed border-indigo-400 rounded-2xl' : ''
      }`}
    >
      <section id={`my-${id}-section`} className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-full">
        {/* ヘッダー */}
        <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-2 flex-wrap sm:flex-nowrap">
          <div className="flex items-center gap-2.5 min-w-0 flex-1">
            {/* 六点リーダ (D&Dハンドラ) */}
            <div
              title="ドラッグして順序入れ替え"
              className="p-1 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600 transition-colors shrink-0"
            >
              <GripVertical className="w-4 h-4" />
            </div>

            {/* アプリアイコン (クリックで該当ページに遷移) */}
            <button
              type="button"
              onClick={onNavigate}
              title={`${title} 画面へ移動`}
              className={`p-2 ${iconBgColor} text-white rounded-xl shadow-2xs hover:scale-105 active:scale-95 transition-all cursor-pointer shrink-0 flex items-center justify-center group`}
            >
              <Icon className="w-4 h-4 group-hover:rotate-6 transition-transform" />
            </button>

            {/* セクションタイトル */}
            <h2 className="text-sm font-extrabold text-slate-900 truncate">{title}</h2>

            {/* 未読・未確認バッジ */}
            {badgeCount > 0 && (
              <span className={`px-2 py-0.5 ${badgeBgColor} text-white text-[10px] font-black rounded-full shrink-0`}>
                {badgeLabel} {badgeCount}
              </span>
            )}
          </div>

          {/* 右側アクションエリア (例: 「+ 予定追加」等) */}
          {actionButton && (
            <div className="flex items-center gap-2 shrink-0">
              {actionButton}
            </div>
          )}
        </div>

        {/* コンテンツエリア */}
        <div className="p-4 flex-1">
          {children}
        </div>
      </section>
    </div>
  );
};
