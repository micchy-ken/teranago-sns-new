import React, { useMemo, useState } from 'react';
import {
  Bell,
  Mail,
  Search,
  Smartphone,
  Monitor,
  Code2,
  Eye,
  Link2,
  Link2Off,
  Copy,
  Check,
  Server,
  Layers,
  FileText,
  ExternalLink,
} from 'lucide-react';
import {
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_CATEGORY_META,
  NotificationTemplateCategory,
  NotificationTemplateDefinition,
  getTemplateSampleVars,
  interpolateTemplate,
  renderEmailPlainTextPreview,
} from '../../config/notificationTemplates';
import { PRODUCTION_APP_URL } from '../../config/appEnvironment';

/**
 * テンプレート文字列内の {{var}} プレースホルダーを視覚的にハイライト表示
 */
function renderHighlightedTemplate(template: string) {
  const parts = template.split(/(\{\{\w+\}\})/g);
  return parts.map((part, idx) => {
    if (/^\{\{\w+\}\}$/.test(part)) {
      return (
        <span
          key={idx}
          className="inline-block font-mono text-[11px] font-semibold text-indigo-700 bg-indigo-50 px-1 py-0.5 rounded mx-0.5"
        >
          {part}
        </span>
      );
    }
    return <React.Fragment key={idx}>{part}</React.Fragment>;
  });
}

function resolvePreviewUrl(urlTemplate: string, vars: Record<string, string>): string {
  const rendered = interpolateTemplate(urlTemplate, vars).trim();
  if (!rendered) return '';
  if (/^https?:\/\//i.test(rendered)) return rendered;
  const cleaned = rendered.replace(/^\/+/, '');
  if (!cleaned) return PRODUCTION_APP_URL;
  return `${PRODUCTION_APP_URL}${cleaned.startsWith('?') ? cleaned : `?${cleaned}`}`;
}

export const NotificationTemplatesAdmin: React.FC = () => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | NotificationTemplateCategory>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'frontend' | 'server'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<string>(NOTIFICATION_TEMPLATES[0]?.key || '');
  const [pushDeviceMode, setPushDeviceMode] = useState<'mobile' | 'desktop'>('mobile');
  const [emailViewMode, setEmailViewMode] = useState<'html' | 'text'>('html');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const counts = useMemo(() => {
    const frontend = NOTIFICATION_TEMPLATES.filter((t) => t.origin === 'frontend').length;
    const server = NOTIFICATION_TEMPLATES.filter((t) => t.origin === 'server').length;
    const byCategory: Record<string, number> = {};
    for (const t of NOTIFICATION_TEMPLATES) {
      byCategory[t.category] = (byCategory[t.category] || 0) + 1;
    }
    return { total: NOTIFICATION_TEMPLATES.length, frontend, server, byCategory };
  }, []);

  const filteredTemplates = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return NOTIFICATION_TEMPLATES.filter((t) => {
      if (selectedCategory !== 'all' && t.category !== selectedCategory) return false;
      if (originFilter !== 'all' && t.origin !== originFilter) return false;
      if (!q) return true;
      const haystack = [
        t.name,
        t.key,
        t.categoryName,
        t.triggerTiming,
        t.sourceFile,
        t.push?.titleTemplate || '',
        t.push?.bodyTemplate || '',
        t.email?.subjectTemplate || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [selectedCategory, originFilter, searchQuery]);

  const activeTemplate: NotificationTemplateDefinition | undefined = useMemo(() => {
    return (
      filteredTemplates.find((t) => t.key === selectedKey) ||
      filteredTemplates[0] ||
      NOTIFICATION_TEMPLATES[0]
    );
  }, [filteredTemplates, selectedKey]);

  const sampleVars = useMemo(() => {
    return activeTemplate ? getTemplateSampleVars(activeTemplate) : {};
  }, [activeTemplate]);

  const handleCopySpec = async (def: NotificationTemplateDefinition) => {
    const lines: string[] = [
      `■ 通知名: ${def.name} (${def.key})`,
      `カテゴリ: ${def.categoryName} / 管理場所: ${def.origin === 'frontend' ? 'フロント側（集約済）' : 'NASサーバー側'} (${def.sourceFile})`,
      `送信タイミング: ${def.triggerTiming}`,
      `送信先: ${def.recipientsSummary}`,
    ];
    if (def.push) {
      lines.push(
        '',
        '【Web Push】',
        `タイトル: ${def.push.titleTemplate}`,
        `本文: ${def.push.bodyTemplate}`,
        `URL有無: ${def.push.includeUrl ? `あり (${def.push.urlTemplate})` : 'なし'}`
      );
    } else {
      lines.push('', '【Web Push】 なし');
    }
    if (def.email) {
      lines.push(
        '',
        '【メール通知】',
        `件名: ${def.email.subjectTemplate}`,
        ...(def.email.detailsTemplate.length > 0
          ? ['詳細行:', ...def.email.detailsTemplate.map((d) => `  - ${d.label}: ${d.valueTemplate}`)]
          : []),
        ...(def.email.mainContentTemplate ? [`本文枠: ${def.email.mainContentTemplate}`] : []),
        `URL有無: ${def.email.includeUrl ? `あり (${def.email.urlTemplate})` : 'なし'}`
      );
    } else {
      lines.push('', '【メール通知】 なし');
    }
    try {
      await navigator.clipboard.writeText(lines.join('\n'));
      setCopiedId(def.key);
      setTimeout(() => setCopiedId((prev) => (prev === def.key ? null : prev)), 2000);
    } catch {
      // ignore clipboard errors
    }
  };

  const renderEmailHtmlPreview = (def: NotificationTemplateDefinition) => {
    const email = def.email;
    if (!email) return null;

    const recipientName = def.key === 'server_user_invitation'
      ? (sampleVars.targetEmail || 'new-member@teraoka-ads.co.jp')
      : (sampleVars.recipientName || '寺岡 花子');
    const actor = sampleVars.actorName || sampleVars.applicantName || sampleVars.organizerName || '山田 太郎';
    const fullUrl = email.includeUrl ? resolvePreviewUrl(email.urlTemplate, sampleVars) : '';

    // 1. 気象庁連動プレーンテキストメール
    if (email.layoutTheme === 'safety_plain') {
      return (
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-5">
          <div className="text-xs font-semibold text-amber-700 mb-3">
            ※ この通知はHTML装飾なしのプレーンテキストメールとして配信されます
          </div>
          <pre className="whitespace-pre-wrap font-mono text-xs text-slate-800 leading-relaxed bg-white border border-slate-200 rounded-md p-4">
            {renderEmailPlainTextPreview(def, sampleVars)}
          </pre>
        </div>
      );
    }

    // 2. 安否確認（緊急発動 / リマインド）
    if (email.layoutTheme === 'safety_urgent' || email.layoutTheme === 'safety_remind') {
      const isRemind = email.layoutTheme === 'safety_remind';
      const accentBg = isRemind ? '#e11d48' : '#dc2626';
      const headerTitle = interpolateTemplate(email.headerTitleTemplate || '', sampleVars);
      const leadText = interpolateTemplate(email.leadTemplate || '', sampleVars);
      const mainContent = email.mainContentTemplate
        ? interpolateTemplate(email.mainContentTemplate, sampleVars)
        : '';
      const footerText = email.footerNote ? interpolateTemplate(email.footerNote, sampleVars) : '';

      return (
        <div
          className="mx-auto max-w-[580px] bg-white rounded-2xl overflow-hidden shadow-xs"
          style={{ border: `2px solid ${accentBg}` }}
        >
          <div className="px-5 py-4 text-white" style={{ backgroundColor: accentBg }}>
            <div className="text-base font-extrabold leading-snug">{headerTitle}</div>
          </div>
          <div className="p-5 space-y-4 text-slate-800">
            <div className="text-[15px] font-bold text-slate-900">{recipientName} 様</div>
            <p className="text-[13px] leading-relaxed text-slate-700">{leadText}</p>

            {mainContent && (
              <div className="rounded-lg bg-red-50 px-4 py-3 border border-red-200">
                <div className="text-[11px] font-bold text-red-800 mb-1">
                  {email.mainContentLabel || '本部からの連絡事項:'}
                </div>
                <div className="text-[13px] font-semibold text-red-900 whitespace-pre-wrap">
                  {mainContent}
                </div>
              </div>
            )}

            {email.includeUrl && fullUrl && (
              <div className="rounded-xl bg-rose-50 border border-dashed border-rose-400 p-4 text-center space-y-2.5">
                <span
                  className="inline-block px-6 py-3 rounded-xl text-sm font-extrabold text-white shadow-xs"
                  style={{ backgroundColor: accentBg }}
                >
                  {email.ctaLabel || '👉 今すぐ安否状況を回答する'}
                </span>
                <div className="text-[11px] font-semibold text-slate-600">
                  ※ボタンが開けない場合は下記の回答URLを直接ブラウザで開いてください：
                </div>
                <div className="text-[11px] font-semibold underline break-all" style={{ color: accentBg }}>
                  {fullUrl}
                </div>
              </div>
            )}

            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-500 space-y-0.5">
              <div><strong className="text-slate-600">日時:</strong> 2026/11/25 16:30:00</div>
              <div>{footerText}</div>
            </div>
          </div>
        </div>
      );
    }

    // 3. 安否確認 個人メール登録依頼
    if (email.layoutTheme === 'indigo_safety_reg') {
      const headerTitle = interpolateTemplate(email.headerTitleTemplate || '', sampleVars);
      const leadText = interpolateTemplate(email.leadTemplate || '', sampleVars);
      const mainContent = email.mainContentTemplate
        ? interpolateTemplate(email.mainContentTemplate, sampleVars)
        : '';
      const footerText = email.footerNote ? interpolateTemplate(email.footerNote, sampleVars) : '';

      return (
        <div className="mx-auto max-w-[580px] bg-white rounded-xl border border-slate-300 overflow-hidden shadow-xs">
          <div className="bg-indigo-600 text-white px-5 py-4">
            <div className="text-base font-bold">{headerTitle}</div>
          </div>
          <div className="p-5 space-y-4">
            <div className="text-[15px] font-semibold text-slate-900">{recipientName} 様</div>
            <p className="text-[13px] leading-relaxed text-slate-700">{leadText}</p>
            {mainContent && (
              <div className="rounded-lg bg-slate-100 px-4 py-3 border border-slate-200">
                <div className="text-xs font-semibold text-slate-700">{email.mainContentLabel}</div>
                <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{mainContent}</div>
              </div>
            )}
            {email.includeUrl && fullUrl && (
              <div className="text-center py-2">
                <span className="inline-block bg-indigo-600 text-white font-bold text-sm px-6 py-3 rounded-lg">
                  {email.ctaLabel}
                </span>
              </div>
            )}
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3.5 py-2.5">
              <div className="text-[11px] font-bold text-emerald-800">🔒 個人情報の暗号化保護について</div>
              <div className="text-[11px] text-emerald-700 mt-0.5 leading-relaxed">
                個人メールアドレスは AES-256-GCM で暗号化されて保管され、管理者やデータベース上でも伏字表示され閲覧できない仕組みになっています。
              </div>
            </div>
            <div className="border-t border-slate-200 pt-2.5 text-[11px] text-slate-400">
              送信日時: 2026/11/25 16:30:00 ／ {footerText}
            </div>
          </div>
        </div>
      );
    }

    // 4. 招待・パスワード設定メール（インディゴ系ヘッダー）
    if (email.layoutTheme === 'indigo_account') {
      const headerTitle = interpolateTemplate(email.headerTitleTemplate || '', sampleVars);
      const leadText = interpolateTemplate(email.leadTemplate || '', sampleVars);
      const footerText = email.footerNote ? interpolateTemplate(email.footerNote, sampleVars) : '';

      return (
        <div className="mx-auto max-w-[580px] bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
          <div className="bg-gradient-to-br from-indigo-600 to-blue-500 text-white px-6 py-5 text-center">
            <div className="text-lg font-bold">{headerTitle}</div>
            {email.headerSubTitle && (
              <div className="text-xs text-white/90 mt-1">{email.headerSubTitle}</div>
            )}
          </div>
          <div className="p-5 space-y-4 text-[13px] text-slate-700 leading-relaxed">
            <div className="font-bold text-slate-900">{recipientName} 様</div>
            <p>{leadText}</p>
            {email.includeUrl && fullUrl && (
              <>
                <div className="text-center py-2">
                  <span className="inline-block bg-indigo-600 text-white font-bold text-sm px-7 py-3 rounded-lg shadow-xs">
                    {email.ctaLabel}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-500 space-y-1">
                  <div className="font-bold text-slate-700">ボタンが開けない場合: 以下のURLをブラウザに貼り付けてください。</div>
                  <div className="text-indigo-600 break-all font-mono">{fullUrl}</div>
                  {footerText && <div className="text-rose-600 font-medium pt-1">{footerText}</div>}
                </div>
              </>
            )}
          </div>
          <div className="border-t border-slate-100 bg-slate-50 px-5 py-3 text-center text-[11px] text-slate-400">
            TERAPO 自動配信メール
          </div>
        </div>
      );
    }

    // 5. 標準 SNS 通知メール（emailNotificationDispatcher.ts 準拠）
    const details = email.detailsTemplate.map((d) => ({
      label: d.label,
      value: interpolateTemplate(d.valueTemplate, sampleVars),
    }));
    const mainContent = email.mainContentTemplate
      ? interpolateTemplate(email.mainContentTemplate, sampleVars).trim()
      : '';

    return (
      <div className="mx-auto max-w-[580px] bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
        {/* ダークスレートヘッダー（実メールと同じ見た目） */}
        <div className="bg-gradient-to-br from-slate-800 to-slate-900 text-white px-5 py-3.5 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-bold tracking-tight whitespace-nowrap">TERAPO</span>
            <span className="bg-blue-500 text-white text-[11px] font-semibold px-2 py-0.5 rounded-full whitespace-nowrap">
              {email.categoryLabel}通知
            </span>
          </div>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-[15px] font-bold text-slate-900">{recipientName} 様</div>
          <p className="text-[13px] text-slate-700 leading-relaxed">
            <strong className="text-slate-900">{actor}</strong> さんが【{email.categoryLabel}】を更新・登録しました。内容をご確認ください。
          </p>

          {/* 詳細テーブル */}
          {details.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-[13px] border-collapse">
                <tbody>
                  {details.map((row, idx) => (
                    <tr key={idx} className={idx < details.length - 1 ? 'border-b border-slate-100' : ''}>
                      <td className="bg-slate-50 text-slate-600 font-bold px-3 py-2 w-[32%] align-top whitespace-nowrap">
                        {row.label}
                      </td>
                      <td className="text-slate-900 font-medium px-3 py-2 whitespace-pre-wrap break-words">
                        {row.value}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* 本文・備考ブロック */}
          {mainContent && (
            <div
              className="rounded bg-slate-50 px-3.5 py-3"
              style={{ borderLeft: '4px solid #3b82f6' }}
            >
              <div className="text-[11px] font-bold text-slate-600 mb-1">【本文・備考】</div>
              <div className="text-[13px] text-slate-800 whitespace-pre-wrap leading-relaxed">
                {mainContent}
              </div>
            </div>
          )}

          {/* 共有リンクCTAボタン */}
          {email.includeUrl && fullUrl ? (
            <div className="pt-2 text-center space-y-2">
              <span className="inline-block bg-blue-600 text-white font-bold text-[13px] px-6 py-2.5 rounded-lg shadow-xs">
                {email.ctaLabel || '👉 該当画面を直接開く（共有リンク）'}
              </span>
              <div className="text-[11px] text-slate-500 break-all">
                直リンク: <span className="text-blue-600 underline">{fullUrl}</span>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 py-2.5 text-center text-xs text-slate-500">
              URL・共有リンクは非表示設定です
            </div>
          )}

          {/* フッター */}
          <div className="border-t border-slate-100 pt-3 text-center text-[11px] text-slate-400 leading-relaxed">
            本メールはTERAPOの「個人設定 ＞ 通知センター」で設定された宛先に自動送信されています。<br />
            通知の停止・変更はシステム内の個人設定画面で行えます。
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* 上部サマリーヘッダー（1段構造・静かで明快） */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Bell className="w-5 h-5 text-amber-600 shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">
                通知様式（Web Push・メール）プレビュー一覧
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              システム全体で送信される全 <span className="font-mono tabular-nums font-bold text-slate-900">{counts.total}</span> 種類の通知文面・URL有無を実際の見た目に近いプレビューで確認できます。
              フロント側の通常通知 <span className="font-mono tabular-nums font-bold text-slate-900">{counts.frontend}</span> 種類は <code className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded text-slate-800">src/config/notificationTemplates.ts</code> に集約済みです（現在は閲覧・プレビュー専用のハードコード様式）。
            </p>
          </div>

          {/* 送信元の絞り込みセグメント */}
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg self-start shrink-0">
            <button
              type="button"
              onClick={() => setOriginFilter('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                originFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              すべて <span className="font-mono tabular-nums ml-0.5">({counts.total})</span>
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter('frontend')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                originFilter === 'frontend'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              フロント集約済 <span className="font-mono tabular-nums ml-0.5">({counts.frontend})</span>
            </button>
            <button
              type="button"
              onClick={() => setOriginFilter('server')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                originFilter === 'server'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              NASサーバー側 <span className="font-mono tabular-nums ml-0.5">({counts.server})</span>
            </button>
          </div>
        </div>

        {/* 検索＆カテゴリフィルター */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-3">
          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="通知名・件名・本文・ファイル名で検索..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors"
              />
            </div>
            <div className="text-xs text-slate-500 font-mono tabular-nums">
              表示中: {filteredTemplates.length} / {counts.total} 件
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedCategory('all')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
              }`}
            >
              全カテゴリ
            </button>
            {NOTIFICATION_CATEGORY_META.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer ${
                  selectedCategory === cat.id
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:text-slate-900 hover:bg-slate-200/70'
                }`}
              >
                {cat.shortLabel}
                <span className="font-mono tabular-nums ml-1 opacity-75">
                  {counts.byCategory[cat.id] || 0}
                </span>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* メイン 2カラム: 左=通知一覧 / 右=実プレビュー＆様式詳細 */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 左カラム: 通知リスト */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">通知一覧</span>
            <span className="text-[11px] text-slate-500">クリックで実イメージを確認</span>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <p>条件に一致する通知テンプレートがありません。</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setOriginFilter('all');
                  setSearchQuery('');
                }}
                className="text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                絞り込みをリセット
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[780px] overflow-y-auto">
              {filteredTemplates.map((item) => {
                const isSelected = activeTemplate?.key === item.key;
                const channels = [
                  item.push ? 'Push' : null,
                  item.email ? 'メール' : null,
                ]
                  .filter(Boolean)
                  .join(' / ');
                const hasAnyUrl = Boolean(item.push?.includeUrl || item.email?.includeUrl);

                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSelectedKey(item.key)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[13px] font-bold leading-snug">
                        {item.name}
                      </div>
                      {isSelected && (
                        <span className="text-[11px] font-bold text-indigo-700 shrink-0">選択中</span>
                      )}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
                      <span>{item.categoryName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-700">{channels}</span>
                      <span aria-hidden="true">·</span>
                      <span>{hasAnyUrl ? 'URLあり' : 'URLなし'}</span>
                      <span aria-hidden="true">·</span>
                      <span className={item.origin === 'server' ? 'text-amber-700 font-medium' : 'text-emerald-700 font-medium'}>
                        {item.origin === 'server' ? 'NAS側' : 'フロント集約'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 右カラム: 選択中テンプレートの実プレビュー＋様式詳細 */}
        {activeTemplate && (
          <div className="lg:col-span-8 space-y-5">
            {/* ヘッダー＆メタ情報 */}
            <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                    <span>{activeTemplate.categoryName}</span>
                    <span aria-hidden="true">·</span>
                    <span className={activeTemplate.origin === 'server' ? 'text-amber-700 font-semibold' : 'text-emerald-700 font-semibold'}>
                      {activeTemplate.origin === 'server'
                        ? 'NASサーバー直接送信'
                        : 'フロントエンド集約管理'}
                    </span>
                    <span aria-hidden="true">·</span>
                    <code className="font-mono text-[11px] text-slate-700">{activeTemplate.key}</code>
                  </div>
                  <h4 className="text-base font-bold text-slate-900">{activeTemplate.name}</h4>
                </div>

                <button
                  type="button"
                  onClick={() => handleCopySpec(activeTemplate)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors shrink-0 whitespace-nowrap cursor-pointer"
                >
                  {copiedId === activeTemplate.key ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      コピーしました
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      この通知の現行仕様をコピー
                    </>
                  )}
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">送信タイミング</div>
                  <div className="text-slate-800 leading-relaxed">{activeTemplate.triggerTiming}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">送信対象</div>
                  <div className="text-slate-800 leading-relaxed">{activeTemplate.recipientsSummary}</div>
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-500 mb-0.5">管理ファイル</div>
                  <div className="font-mono text-[11px] text-slate-800 flex items-center gap-1.5">
                    {activeTemplate.origin === 'server' ? (
                      <Server className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    ) : (
                      <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    )}
                    <span className="break-all">{activeTemplate.sourceFile}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 1. Web Push プレビュー */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Bell className="w-4 h-4 text-indigo-600" />
                  <h5 className="text-sm font-bold text-slate-900">Web Push 通知プレビュー</h5>
                  {activeTemplate.push ? (
                    <span className="text-xs text-slate-500">
                      · {activeTemplate.push.includeUrl ? '遷移URLあり' : '遷移URLなし'}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">· この通知では送信されません</span>
                  )}
                </div>

                {activeTemplate.push && (
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setPushDeviceMode('mobile')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                        pushDeviceMode === 'mobile'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Smartphone className="w-3 h-3" />
                      スマホ風
                    </button>
                    <button
                      type="button"
                      onClick={() => setPushDeviceMode('desktop')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                        pushDeviceMode === 'desktop'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Monitor className="w-3 h-3" />
                      PC通知風
                    </button>
                  </div>
                )}
              </div>

              {activeTemplate.push ? (
                <div className="p-5 space-y-4">
                  {/* 実際のOS通知に近いモックアップ表示 */}
                  <div className="rounded-xl bg-slate-100 p-5 flex items-center justify-center">
                    {pushDeviceMode === 'mobile' ? (
                      <div className="w-full max-w-[380px] rounded-2xl bg-white/95 backdrop-blur border border-slate-200/90 shadow-md p-3.5 space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <div className="w-5 h-5 rounded-md bg-indigo-600 text-white flex items-center justify-center text-[10px] font-black shrink-0">
                              T
                            </div>
                            <span className="text-[11px] font-semibold text-slate-600 truncate">
                              TERAPO
                            </span>
                          </div>
                          <span className="text-[11px] text-slate-400 font-mono tabular-nums shrink-0">
                            たった今
                          </span>
                        </div>
                        <div className="space-y-0.5 pl-0.5">
                          <div className="text-[13px] font-bold text-slate-900 leading-snug break-words">
                            {interpolateTemplate(activeTemplate.push.titleTemplate, sampleVars)}
                          </div>
                          <div className="text-xs text-slate-700 leading-relaxed break-words">
                            {interpolateTemplate(activeTemplate.push.bodyTemplate, sampleVars)}
                          </div>
                        </div>
                        <div className="pt-2 border-t border-slate-100 flex items-center gap-4 text-[11px] font-semibold text-indigo-600">
                          <span>確認する</span>
                          <span className="text-slate-400">閉じる</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full max-w-[420px] rounded-lg bg-slate-900 text-white shadow-lg overflow-hidden border border-slate-700">
                        <div className="p-3.5 flex items-start gap-3">
                          <div className="w-10 h-10 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-base font-black shrink-0">
                            T
                          </div>
                          <div className="min-w-0 flex-1 space-y-0.5">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] text-slate-300 font-semibold">TERAPO</span>
                              <span className="text-[11px] text-slate-400 font-mono tabular-nums">16:30</span>
                            </div>
                            <div className="text-[13px] font-bold text-white leading-snug break-words">
                              {interpolateTemplate(activeTemplate.push.titleTemplate, sampleVars)}
                            </div>
                            <div className="text-xs text-slate-300 leading-relaxed break-words">
                              {interpolateTemplate(activeTemplate.push.bodyTemplate, sampleVars)}
                            </div>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 border-t border-slate-700/80 text-xs font-medium text-slate-200">
                          <div className="py-2 text-center border-r border-slate-700/80 bg-slate-800/60">
                            確認する
                          </div>
                          <div className="py-2 text-center bg-slate-800/60 text-slate-400">
                            閉じる
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Push テンプレート原文＆URL */}
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 py-1.5 border-b border-slate-100">
                      <div className="sm:col-span-3 font-semibold text-slate-500">タイトル様式</div>
                      <div className="sm:col-span-9 text-slate-900 break-words">
                        {renderHighlightedTemplate(activeTemplate.push.titleTemplate)}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 py-1.5 border-b border-slate-100">
                      <div className="sm:col-span-3 font-semibold text-slate-500">本文様式</div>
                      <div className="sm:col-span-9 text-slate-900 break-words">
                        {renderHighlightedTemplate(activeTemplate.push.bodyTemplate)}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 py-1.5">
                      <div className="sm:col-span-3 font-semibold text-slate-500">タップ先URL</div>
                      <div className="sm:col-span-9 space-y-1">
                        <div className="flex items-center gap-1.5 font-medium">
                          {activeTemplate.push.includeUrl ? (
                            <>
                              <Link2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="text-emerald-700">あり（クリックで該当画面へ遷移）</span>
                            </>
                          ) : (
                            <>
                              <Link2Off className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-500">なし</span>
                            </>
                          )}
                        </div>
                        {activeTemplate.push.includeUrl && (
                          <div className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 break-all">
                            {resolvePreviewUrl(activeTemplate.push.urlTemplate, sampleVars)}
                          </div>
                        )}
                      </div>
                    </div>
                    {activeTemplate.push.notes && (
                      <div className="text-[11px] text-slate-500 pt-1">
                        補足: {activeTemplate.push.notes}
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="p-5 text-xs text-slate-500">
                  この通知はメールのみ送信されます（Web Push は送信されません）。
                </div>
              )}
            </div>

            {/* 2. メール通知 プレビュー */}
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-blue-600" />
                  <h5 className="text-sm font-bold text-slate-900">メール通知 プレビュー</h5>
                  {activeTemplate.email ? (
                    <span className="text-xs text-slate-500">
                      · {activeTemplate.email.includeUrl ? '共有URLあり' : '共有URLなし'}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">· この通知では送信されません</span>
                  )}
                </div>

                {activeTemplate.email && (
                  <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setEmailViewMode('html')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                        emailViewMode === 'html'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <Eye className="w-3 h-3" />
                      HTML見た目
                    </button>
                    <button
                      type="button"
                      onClick={() => setEmailViewMode('text')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md flex items-center gap-1 transition-colors whitespace-nowrap cursor-pointer ${
                        emailViewMode === 'text'
                          ? 'bg-white text-slate-900 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      <FileText className="w-3 h-3" />
                      テキスト版
                    </button>
                  </div>
                )}
              </div>

              {activeTemplate.email ? (
                <div className="p-5 space-y-4">
                  {/* メールクライアントヘッダー風の枠 */}
                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                    <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-1.5 text-xs">
                      <div className="flex items-baseline gap-2">
                        <span className="text-slate-400 font-semibold w-12 shrink-0">件名</span>
                        <span className="font-bold text-slate-900 break-words">
                          {interpolateTemplate(activeTemplate.email.subjectTemplate, sampleVars)}
                        </span>
                      </div>
                      <div className="flex items-baseline gap-2 text-[11px] text-slate-500">
                        <span className="text-slate-400 font-semibold w-12 shrink-0">差出人</span>
                        <span>TERAPO</span>
                      </div>
                      <div className="flex items-baseline gap-2 text-[11px] text-slate-500">
                        <span className="text-slate-400 font-semibold w-12 shrink-0">宛先</span>
                        <span>
                          {activeTemplate.key === 'server_user_invitation'
                            ? sampleVars.targetEmail
                            : '寺岡 花子 <hanako@teraoka-ads.co.jp>'}
                        </span>
                      </div>
                    </div>

                    <div className="p-4 sm:p-5">
                      {emailViewMode === 'html' ? (
                        renderEmailHtmlPreview(activeTemplate)
                      ) : (
                        <pre className="whitespace-pre-wrap font-mono text-xs text-slate-800 leading-relaxed bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
                          {renderEmailPlainTextPreview(activeTemplate, sampleVars)}
                        </pre>
                      )}
                    </div>
                  </div>

                  {/* メールテンプレート原文＆URL仕様 */}
                  <div className="space-y-2 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 py-1.5 border-b border-slate-100">
                      <div className="sm:col-span-3 font-semibold text-slate-500">件名様式</div>
                      <div className="sm:col-span-9 text-slate-900 break-words">
                        {renderHighlightedTemplate(activeTemplate.email.subjectTemplate)}
                      </div>
                    </div>
                    {activeTemplate.email.detailsTemplate.length > 0 && (
                      <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 py-1.5 border-b border-slate-100">
                        <div className="sm:col-span-3 font-semibold text-slate-500">表の詳細項目</div>
                        <div className="sm:col-span-9 space-y-1">
                          {activeTemplate.email.detailsTemplate.map((d, i) => (
                            <div key={i} className="text-slate-800">
                              <span className="font-semibold text-slate-600">{d.label}:</span>{' '}
                              {renderHighlightedTemplate(d.valueTemplate)}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-12 gap-1 sm:gap-3 py-1.5">
                      <div className="sm:col-span-3 font-semibold text-slate-500">共有URLリンク</div>
                      <div className="sm:col-span-9 space-y-1">
                        <div className="flex items-center gap-1.5 font-medium">
                          {activeTemplate.email.includeUrl ? (
                            <>
                              <ExternalLink className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="text-emerald-700">あり（ボタン＋直リンクを常に本番URLで記載）</span>
                            </>
                          ) : (
                            <>
                              <Link2Off className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span className="text-slate-500">なし</span>
                            </>
                          )}
                        </div>
                        {activeTemplate.email.includeUrl && (
                          <div className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 break-all">
                            {resolvePreviewUrl(activeTemplate.email.urlTemplate, sampleVars)}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="p-5 text-xs text-slate-500">
                  この通知は Web Push のみ送信されます（メール通知はありません）。
                </div>
              )}
            </div>

            {/* 3. 使用している差し込み変数一覧 */}
            {activeTemplate.variables.length > 0 && (
              <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                  <Code2 className="w-4 h-4 text-slate-500" />
                  <h5 className="text-xs font-bold text-slate-800">
                    差し込み変数一覧（プレビューで使用中のサンプル値）
                  </h5>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-100 text-left text-[11px] text-slate-500">
                        <th className="px-4 py-2 font-semibold">変数キー</th>
                        <th className="px-4 py-2 font-semibold">意味</th>
                        <th className="px-4 py-2 font-semibold">プレビュー仮値</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {activeTemplate.variables.map((v) => (
                        <tr key={v.key}>
                          <td className="px-4 py-2 font-mono text-[11px] text-indigo-700 whitespace-nowrap">
                            {`{{${v.key}}}`}
                          </td>
                          <td className="px-4 py-2 text-slate-700 whitespace-nowrap">{v.label}</td>
                          <td className="px-4 py-2 text-slate-600 whitespace-pre-wrap break-words">
                            {v.sample.trim() || '（条件付き・通常は空）'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
