import React, { useState } from 'react';
import { Hash, Home, Bookmark, User, Calendar as CalendarIcon, FileText, MessageSquare, Phone, ClipboardList, Monitor, Shield, HardDrive, Users, ShieldAlert, Wrench, ChevronDown, ChevronRight } from 'lucide-react';
import { Post, BoardTopic, User as UserType } from '../types';

export type AppTab = 'timeline' | 'calendar' | 'inspection_scheduler' | 'workflow' | 'board' | 'chat' | 'memo' | 'daily_report' | 'files' | 'members' | 'mypage' | 'admin' | 'safety_confirmation';

interface SidebarProps {
  posts?: Post[];
  topics?: BoardTopic[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
  currentUser?: UserType;
  className?: string;
  onCollapse?: () => void;
}

export function Sidebar({ posts = [], topics = [], selectedTag, onSelectTag, activeTab, onChangeTab, currentUser, className, onCollapse }: SidebarProps) {
  const [isUtilityOpen, setIsUtilityOpen] = useState(true);
  // Extract and count tags from topics and posts
  const tagCounts: Record<string, number> = {};

  (topics || []).forEach((topic) => {
    if (topic && topic.tags && Array.isArray(topic.tags)) {
      topic.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });

  (posts || []).forEach((post) => {
    if (post && post.tags && Array.isArray(post.tags)) {
      post.tags.forEach((tag) => {
        tagCounts[tag] = (tagCounts[tag] || 0) + 1;
      });
    }
  });

  // Sort tags by frequency
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Show top 10

  const containerClassName = `relative ${className || "bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-8 shrink-0 shadow-sm ring-1 ring-slate-900/5 sticky top-24"}`;

  const isMaintenanceUser = 
    (currentUser?.department && currentUser.department.includes('保守')) || 
    (currentUser?.division && currentUser.division.includes('保守'));
  const reportLabel = isMaintenanceUser ? '保守日報' : '週報';

  // ページ・メニュー表示権限判定（点検予定管理・共有ファイル・安否確認発動は許可者のみ表示）
  const isTabAllowed = (tabId: AppTab) => {
    const isSystemAdmin = currentUser?.isAdmin === true || currentUser?.role === 'admin' || (currentUser as any)?.id === 'u1';
    if (isSystemAdmin) return true;
    if (tabId === 'inspection_scheduler') {
      return currentUser?.preferences?.showInspectionScheduler === true || (currentUser as any)?.showInspectionScheduler === true;
    }
    if (tabId === 'files') {
      return currentUser?.preferences?.showSharedFiles === true || (currentUser as any)?.showSharedFiles === true;
    }
    if (tabId === 'safety_confirmation') {
      return currentUser?.preferences?.showSafetyConfirmation === true || (currentUser as any)?.showSafetyConfirmation === true || currentUser?.preferences?.safetyConfirmationPermission === true;
    }
    if (currentUser?.preferences?.allowedTabs && currentUser.preferences.allowedTabs.length > 0) {
      return currentUser.preferences.allowedTabs.includes(tabId);
    }
    return true;
  };

  const hasUtilityItems = 
    isTabAllowed('members') ||
    isTabAllowed('inspection_scheduler') || 
    isTabAllowed('files') || 
    isTabAllowed('safety_confirmation') || 
    currentUser?.isAdmin;

  return (
    <div className={containerClassName}>
      {onCollapse && (
        <button
          type="button"
          onClick={onCollapse}
          className="absolute top-4 right-4 p-1.5 hover:bg-slate-100 text-slate-400 hover:text-slate-600 rounded-lg transition-colors cursor-pointer flex items-center justify-center border border-slate-200/60 bg-white shadow-xs"
          title="メニューを閉じる"
        >
          <svg className="w-3.5 h-3.5 fill-current text-slate-500" viewBox="0 0 24 24">
            <path d="M14 7l-5 5 5 5V7z" />
          </svg>
        </button>
      )}
      <nav className="space-y-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">メニュー</div>
        {isTabAllowed('mypage') && (
          <button
            onClick={() => onChangeTab('mypage')}
            className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg font-bold transition-colors ${
              activeTab === 'mypage'
                ? 'bg-indigo-600 text-white shadow-sm'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <User className="w-4 h-4" />
            マイページ
          </button>
        )}
        {isTabAllowed('timeline') && (
          <button
            onClick={() => onChangeTab('timeline')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'timeline'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Home className="w-4 h-4" />
            タイムライン
          </button>
        )}
        {isTabAllowed('calendar') && (
          <button
            onClick={() => onChangeTab('calendar')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'calendar'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <CalendarIcon className="w-4 h-4" />
            カレンダー
          </button>
        )}
        {isTabAllowed('workflow') && (
          <button
            onClick={() => onChangeTab('workflow')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'workflow'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <FileText className="w-4 h-4" />
            ワークフロー
          </button>
        )}
        {isTabAllowed('board') && (
          <button
            onClick={() => onChangeTab('board')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'board'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Monitor className="w-4 h-4" />
            掲示板
          </button>
        )}
        {isTabAllowed('chat') && (
          <button
            onClick={() => onChangeTab('chat')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'chat'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <MessageSquare className="w-4 h-4" />
            チャットルーム
          </button>
        )}
        {isTabAllowed('memo') && (
          <button
            onClick={() => onChangeTab('memo')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'memo'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Phone className="w-4 h-4" />
            伝言メモ
          </button>
        )}
        {isTabAllowed('daily_report') && (
          <button
            onClick={() => onChangeTab('daily_report')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'daily_report'
                ? 'bg-indigo-50 text-indigo-700'
                : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            <ClipboardList className="w-4 h-4" />
            <span>{reportLabel}</span>
          </button>
        )}
        {/* ユーティリティ（各種管理・拡張ツール） */}
        {hasUtilityItems && (
          <div className="pt-2 border-t border-slate-100 space-y-1">
            <button
              type="button"
              onClick={() => setIsUtilityOpen(!isUtilityOpen)}
              className="w-full flex items-center justify-between px-3 py-2 rounded-lg text-sm font-bold text-slate-700 hover:bg-slate-100 hover:text-indigo-700 transition-colors cursor-pointer"
            >
              <div className="flex items-center gap-2">
                <Wrench className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>ユーティリティー</span>
              </div>
              {isUtilityOpen ? (
                <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
              )}
            </button>

            {isUtilityOpen && (
              <div className="pl-2 space-y-0.5 pt-0.5">
                {isTabAllowed('members') && (
                  <button
                    type="button"
                    onClick={() => onChangeTab('members')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === 'members'
                        ? 'bg-indigo-50 text-indigo-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Users className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">社員名簿</span>
                  </button>
                )}
                {isTabAllowed('inspection_scheduler') && (
                  <button
                    type="button"
                    onClick={() => onChangeTab('inspection_scheduler')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === 'inspection_scheduler'
                        ? 'bg-indigo-50 text-indigo-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <ClipboardList className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                    <span className="truncate">点検予定管理</span>
                  </button>
                )}
                {isTabAllowed('files') && (
                  <button
                    type="button"
                    onClick={() => onChangeTab('files')}
                    className={`w-full flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === 'files'
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <HardDrive className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="truncate">共有ファイル</span>
                  </button>
                )}
                {isTabAllowed('safety_confirmation') && (
                  <button
                    type="button"
                    onClick={() => onChangeTab('safety_confirmation')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-all ${
                      activeTab === 'safety_confirmation'
                        ? 'bg-rose-50 text-rose-700 font-bold shadow-2xs'
                        : 'text-slate-600 hover:bg-rose-50/60 hover:text-rose-700'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ShieldAlert className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      <span className="truncate">安否確認発動</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-extrabold bg-rose-100 text-rose-700 border border-rose-200 shrink-0 ml-1">
                      緊急
                    </span>
                  </button>
                )}
                {currentUser?.isAdmin && (
                  <button
                    type="button"
                    onClick={() => onChangeTab('admin')}
                    className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-md text-xs font-medium whitespace-nowrap transition-colors ${
                      activeTab === 'admin'
                        ? 'bg-indigo-50 text-indigo-700 font-bold'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Shield className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="truncate">管理者メニュー</span>
                    </div>
                    <span className="text-[9px] px-1.5 py-0.2 rounded font-bold bg-indigo-100 text-indigo-700 shrink-0 ml-1">
                      管理者
                    </span>
                  </button>
                )}
              </div>
            )}
          </div>
        )}
      </nav>

      {activeTab === 'timeline' && sortedTags.length > 0 && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">人気のタグ</div>
          <div className="flex flex-wrap gap-2">
            {sortedTags.map(([tag]) => (
              <button
                key={tag}
                onClick={() => onSelectTag(tag)}
                className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                  selectedTag === tag
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600'
                }`}
              >
                # {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
