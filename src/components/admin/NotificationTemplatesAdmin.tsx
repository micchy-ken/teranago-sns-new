import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  Save,
  RotateCcw,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Undo2,
} from 'lucide-react';
import {
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_CATEGORY_META,
  NotificationTemplateCategory,
  NotificationTemplateDefinition,
  NotificationTemplateKey,
  NotificationTemplateOverride,
  NotificationTemplatesStoreMeta,
  applyOverrideToTemplate,
  getNotificationTemplateOverrides,
  getNotificationTemplatesMeta,
  getTemplateSampleVars,
  interpolateTemplate,
  renderEmailPlainTextPreview,
  resetNotificationTemplateOverride,
  saveNotificationTemplateOverride,
  subscribeNotificationTemplates,
  syncNotificationTemplatesFromServer,
} from '../../config/notificationTemplates';
import { PRODUCTION_APP_URL } from '../../config/appEnvironment';

interface NotificationTemplatesAdminProps {
  currentUserName?: string;
}

interface TemplateDraft {
  pushTitle: string;
  pushBody: string;
  pushIncludeUrl: boolean;
  emailSubject: string;
  emailHeaderTitle: string;
  emailLead: string;
  emailMainContent: string;
  emailCtaLabel: string;
  emailIncludeUrl: boolean;
}

type PushFieldName = 'pushTitle' | 'pushBody';
type EmailFieldName =
  | 'emailSubject'
  | 'emailHeaderTitle'
  | 'emailLead'
  | 'emailMainContent'
  | 'emailCtaLabel';

function resolvePreviewUrl(urlTemplate: string, vars: Record<string, string>): string {
  const rendered = interpolateTemplate(urlTemplate, vars).trim();
  if (!rendered) return '';
  if (/^https?:\/\//i.test(rendered)) return rendered;
  const cleaned = rendered.replace(/^\/+/, '');
  if (!cleaned) return PRODUCTION_APP_URL;
  return `${PRODUCTION_APP_URL}${cleaned.startsWith('?') ? cleaned : `?${cleaned}`}`;
}

function buildDraftFromTemplate(def: NotificationTemplateDefinition): TemplateDraft {
  const isSafetyPlain = def.email?.layoutTheme === 'safety_plain';
  return {
    pushTitle: def.push?.titleTemplate ?? '',
    pushBody: def.push?.bodyTemplate ?? '',
    pushIncludeUrl: def.push?.includeUrl ?? false,
    emailSubject: def.email?.subjectTemplate ?? '',
    emailHeaderTitle: def.email?.headerTitleTemplate ?? '',
    emailLead: def.email?.leadTemplate ?? '',
    emailMainContent: isSafetyPlain
      ? def.email?.mainContentTemplate ?? def.email?.plainTextOverrideTemplate ?? ''
      : def.email?.mainContentTemplate ?? '',
    emailCtaLabel: def.email?.ctaLabel ?? '👉 該当画面を直接開く（共有リンク）',
    emailIncludeUrl: def.email?.includeUrl ?? false,
  };
}

function isSameDraft(a: TemplateDraft, b: TemplateDraft): boolean {
  return (
    a.pushTitle === b.pushTitle &&
    a.pushBody === b.pushBody &&
    a.pushIncludeUrl === b.pushIncludeUrl &&
    a.emailSubject === b.emailSubject &&
    a.emailHeaderTitle === b.emailHeaderTitle &&
    a.emailLead === b.emailLead &&
    a.emailMainContent === b.emailMainContent &&
    a.emailCtaLabel === b.emailCtaLabel &&
    a.emailIncludeUrl === b.emailIncludeUrl
  );
}

function buildOverridePayload(
  base: NotificationTemplateDefinition,
  draft: TemplateDraft
): NotificationTemplateOverride | null {
  const override: NotificationTemplateOverride = {};

  if (base.push) {
    const pushOverride: NonNullable<NotificationTemplateOverride['push']> = {};
    if (draft.pushTitle !== base.push.titleTemplate) {
      pushOverride.titleTemplate = draft.pushTitle;
    }
    if (draft.pushBody !== base.push.bodyTemplate) {
      pushOverride.bodyTemplate = draft.pushBody;
    }
    if (draft.pushIncludeUrl !== base.push.includeUrl) {
      pushOverride.includeUrl = draft.pushIncludeUrl;
    }
    if (Object.keys(pushOverride).length > 0) {
      override.push = pushOverride;
    }
  }

  if (base.email) {
    const emailOverride: NonNullable<NotificationTemplateOverride['email']> = {};
    const isSafetyPlain = base.email.layoutTheme === 'safety_plain';
    const baseHeaderTitle = base.email.headerTitleTemplate ?? '';
    const baseLead = base.email.leadTemplate ?? '';
    const baseMainContent = isSafetyPlain
      ? base.email.mainContentTemplate ?? base.email.plainTextOverrideTemplate ?? ''
      : base.email.mainContentTemplate ?? '';
    const baseCtaLabel = base.email.ctaLabel ?? '👉 該当画面を直接開く（共有リンク）';

    if (draft.emailSubject !== base.email.subjectTemplate) {
      emailOverride.subjectTemplate = draft.emailSubject;
    }
    if (draft.emailHeaderTitle !== baseHeaderTitle) {
      emailOverride.headerTitleTemplate = draft.emailHeaderTitle;
    }
    if (draft.emailLead !== baseLead) {
      emailOverride.leadTemplate = draft.emailLead;
    }
    if (isSafetyPlain && draft.emailMainContent !== baseMainContent) {
      emailOverride.mainContentTemplate = draft.emailMainContent;
    }
    if (!isSafetyPlain && draft.emailCtaLabel !== baseCtaLabel) {
      emailOverride.ctaLabel = draft.emailCtaLabel;
    }
    if (draft.emailIncludeUrl !== base.email.includeUrl) {
      emailOverride.includeUrl = draft.emailIncludeUrl;
    }
    if (Object.keys(emailOverride).length > 0) {
      override.email = emailOverride;
    }
  }

  if (!override.push && !override.email) {
    return null;
  }
  return override;
}

function formatJstTimestamp(iso?: string | null): string {
  if (!iso) return '';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleString('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}

export const NotificationTemplatesAdmin: React.FC<NotificationTemplatesAdminProps> = ({
  currentUserName,
}) => {
  const [selectedCategory, setSelectedCategory] = useState<'all' | NotificationTemplateCategory>('all');
  const [originFilter, setOriginFilter] = useState<'all' | 'frontend' | 'server'>('all');
  const [customizedOnly, setCustomizedOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedKey, setSelectedKey] = useState<NotificationTemplateKey>(
    NOTIFICATION_TEMPLATES[0].key
  );
  const [pushDeviceMode, setPushDeviceMode] = useState<'mobile' | 'desktop'>('mobile');
  const [emailViewMode, setEmailViewMode] = useState<'html' | 'text'>('html');
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [savedOverrides, setSavedOverrides] = useState<
    Partial<Record<NotificationTemplateKey, NotificationTemplateOverride>>
  >(() => getNotificationTemplateOverrides());
  const [storeMeta, setStoreMeta] = useState<NotificationTemplatesStoreMeta>(() =>
    getNotificationTemplatesMeta()
  );
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [confirmResetKey, setConfirmResetKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(
    null
  );

  const [focusedPushField, setFocusedPushField] = useState<PushFieldName>('pushBody');
  const [focusedEmailField, setFocusedEmailField] = useState<EmailFieldName>('emailSubject');

  const feedbackTimerRef = useRef<number | null>(null);

  const showFeedback = (type: 'success' | 'error', text: string) => {
    setFeedback({ type, text });
    if (feedbackTimerRef.current) {
      window.clearTimeout(feedbackTimerRef.current);
    }
    feedbackTimerRef.current = window.setTimeout(() => {
      setFeedback(null);
    }, 5000);
  };

  useEffect(() => {
    const unsubscribe = subscribeNotificationTemplates(() => {
      setSavedOverrides(getNotificationTemplateOverrides());
      setStoreMeta(getNotificationTemplatesMeta());
    });

    setIsSyncing(true);
    syncNotificationTemplatesFromServer().finally(() => {
      setIsSyncing(false);
    });

    return () => {
      unsubscribe();
      if (feedbackTimerRef.current) {
        window.clearTimeout(feedbackTimerRef.current);
      }
    };
  }, []);

  const customizedCount = useMemo(() => Object.keys(savedOverrides).length, [savedOverrides]);

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
    return NOTIFICATION_TEMPLATES.filter((base) => {
      if (selectedCategory !== 'all' && base.category !== selectedCategory) return false;
      if (originFilter !== 'all' && base.origin !== originFilter) return false;
      if (customizedOnly && !savedOverrides[base.key]) return false;
      if (!q) return true;
      const eff = applyOverrideToTemplate(base, savedOverrides[base.key]);
      const haystack = [
        eff.name,
        eff.key,
        eff.categoryName,
        eff.triggerTiming,
        eff.sourceFile,
        eff.push?.titleTemplate || '',
        eff.push?.bodyTemplate || '',
        eff.email?.subjectTemplate || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [selectedCategory, originFilter, customizedOnly, searchQuery, savedOverrides]);

  const activeBaseTemplate: NotificationTemplateDefinition = useMemo(() => {
    return (
      filteredTemplates.find((t) => t.key === selectedKey) ||
      filteredTemplates[0] ||
      NOTIFICATION_TEMPLATES[0]
    );
  }, [filteredTemplates, selectedKey]);

  const activeSavedTemplate: NotificationTemplateDefinition = useMemo(() => {
    return applyOverrideToTemplate(activeBaseTemplate, savedOverrides[activeBaseTemplate.key]);
  }, [activeBaseTemplate, savedOverrides]);

  const savedDraftBaseline = useMemo(
    () => buildDraftFromTemplate(activeSavedTemplate),
    [activeSavedTemplate]
  );

  const [draft, setDraft] = useState<TemplateDraft>(() =>
    buildDraftFromTemplate(activeSavedTemplate)
  );

  // 選択中テンプレートまたはNAS保存済み設定が更新されたらドラフトを同期
  useEffect(() => {
    setDraft(buildDraftFromTemplate(activeSavedTemplate));
    setConfirmResetKey(null);
  }, [activeSavedTemplate]);

  const isDirty = useMemo(() => !isSameDraft(draft, savedDraftBaseline), [draft, savedDraftBaseline]);
  const isCustomized = Boolean(savedOverrides[activeBaseTemplate.key]);

  // 現在の編集ドラフトを反映したリアルタイムプレビュー用テンプレート
  const previewTemplate: NotificationTemplateDefinition = useMemo(() => {
    const draftOverride = buildOverridePayload(activeBaseTemplate, draft);
    return applyOverrideToTemplate(activeBaseTemplate, draftOverride);
  }, [activeBaseTemplate, draft]);

  const sampleVars = useMemo(() => {
    return getTemplateSampleVars(previewTemplate);
  }, [previewTemplate]);

  const handleManualSync = async () => {
    setIsSyncing(true);
    const result = await syncNotificationTemplatesFromServer();
    setIsSyncing(false);
    if (result.ok) {
      showFeedback('success', 'NASサーバーから最新の通知テンプレート設定を同期しました。');
    } else {
      showFeedback('error', result.error || 'NASサーバーとの同期に失敗しました。');
    }
  };

  const handleSave = async () => {
    if (!isDirty || isSaving) return;
    setIsSaving(true);
    setConfirmResetKey(null);

    const payload = buildOverridePayload(activeBaseTemplate, draft);
    if (!payload) {
      // すべて初期値と一致する場合は上書きレコードを削除してクリーンに戻す
      const res = await resetNotificationTemplateOverride(activeBaseTemplate.key, currentUserName);
      setIsSaving(false);
      if (res.ok) {
        showFeedback('success', '初期値と同一のため、初期設定として保存しました。');
      } else {
        showFeedback('error', res.error || '保存に失敗しました。');
      }
      return;
    }

    const res = await saveNotificationTemplateOverride(
      activeBaseTemplate.key,
      payload,
      currentUserName
    );
    setIsSaving(false);
    if (res.ok) {
      showFeedback('success', `「${activeBaseTemplate.name}」を保存しました。次回通知から反映されます。`);
    } else {
      showFeedback('error', res.error || '保存に失敗しました。');
    }
  };

  const handleResetToDefault = async () => {
    if (isResetting) return;
    setIsResetting(true);
    const res = await resetNotificationTemplateOverride(activeBaseTemplate.key, currentUserName);
    setIsResetting(false);
    setConfirmResetKey(null);
    if (res.ok) {
      showFeedback('success', `「${activeBaseTemplate.name}」を初期値に戻しました。`);
    } else {
      showFeedback('error', res.error || '初期値リセットに失敗しました。');
    }
  };

  const insertVariableToPush = (varKey: string) => {
    const token = `{{${varKey}}}`;
    setDraft((prev) => ({
      ...prev,
      [focusedPushField]: `${prev[focusedPushField]}${token}`,
    }));
  };

  const insertVariableToEmail = (varKey: string) => {
    const token = `{{${varKey}}}`;
    setDraft((prev) => ({
      ...prev,
      [focusedEmailField]: `${prev[focusedEmailField]}${token}`,
    }));
  };

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
        ...(def.email.headerTitleTemplate ? [`見出し: ${def.email.headerTitleTemplate}`] : []),
        ...(def.email.leadTemplate ? [`リード文: ${def.email.leadTemplate}`] : []),
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

    const recipientName =
      def.key === 'server_user_invitation'
        ? sampleVars.targetEmail || 'new-member@teraoka-ads.co.jp'
        : sampleVars.recipientName || '寺岡 花子';
    const actor =
      sampleVars.actorName || sampleVars.applicantName || sampleVars.organizerName || '山田 太郎';
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
            <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap">{leadText}</p>

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

            {email.includeUrl && fullUrl ? (
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
            ) : (
              <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 py-2.5 text-center text-xs text-slate-500">
                URL・回答ボタンは非表示設定です
              </div>
            )}

            <div className="rounded-lg bg-slate-50 border border-slate-200 px-3.5 py-2.5 text-[11px] text-slate-500 space-y-0.5">
              <div>
                <strong className="text-slate-600">日時:</strong> 2026/11/25 16:30:00
              </div>
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
            <p className="text-[13px] leading-relaxed text-slate-700 whitespace-pre-wrap">{leadText}</p>
            {mainContent && (
              <div className="rounded-lg bg-slate-100 px-4 py-3 border border-slate-200">
                <div className="text-xs font-semibold text-slate-700">{email.mainContentLabel}</div>
                <div className="text-xs text-slate-600 mt-1 whitespace-pre-wrap">{mainContent}</div>
              </div>
            )}
            {email.includeUrl && fullUrl ? (
              <div className="text-center py-2">
                <span className="inline-block bg-indigo-600 text-white font-bold text-sm px-6 py-3 rounded-lg">
                  {email.ctaLabel}
                </span>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 py-2.5 text-center text-xs text-slate-500">
                URL・ボタンは非表示設定です
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
            <p className="whitespace-pre-wrap">{leadText}</p>
            {email.includeUrl && fullUrl ? (
              <>
                <div className="text-center py-2">
                  <span className="inline-block bg-indigo-600 text-white font-bold text-sm px-7 py-3 rounded-lg shadow-xs">
                    {email.ctaLabel}
                  </span>
                </div>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-3 text-[11px] text-slate-500 space-y-1">
                  <div className="font-bold text-slate-700">
                    ボタンが開けない場合: 以下のURLをブラウザに貼り付けてください。
                  </div>
                  <div className="text-indigo-600 break-all font-mono">{fullUrl}</div>
                  {footerText && <div className="text-rose-600 font-medium pt-1">{footerText}</div>}
                </div>
              </>
            ) : (
              <div className="rounded-lg bg-slate-50 border border-dashed border-slate-200 py-2.5 text-center text-xs text-slate-500">
                URL・ボタンは非表示設定です
              </div>
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
    const customLead = email.leadTemplate ? interpolateTemplate(email.leadTemplate, sampleVars).trim() : '';
    const mainContent = email.mainContentTemplate
      ? interpolateTemplate(email.mainContentTemplate, sampleVars).trim()
      : '';

    return (
      <div className="mx-auto max-w-[580px] bg-white rounded-xl border border-slate-200 overflow-hidden shadow-xs">
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
          {customLead ? (
            <p className="text-[13px] text-slate-700 leading-relaxed whitespace-pre-wrap">
              {customLead}
            </p>
          ) : (
            <p className="text-[13px] text-slate-700 leading-relaxed">
              <strong className="text-slate-900">{actor}</strong> さんが【{email.categoryLabel}】を更新・登録しました。内容をご確認ください。
            </p>
          )}

          {details.length > 0 && (
            <div className="border border-slate-200 rounded-lg overflow-hidden">
              <table className="w-full text-[13px] border-collapse">
                <tbody>
                  {details.map((row, idx) => (
                    <tr
                      key={idx}
                      className={idx < details.length - 1 ? 'border-b border-slate-100' : ''}
                    >
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

          <div className="border-t border-slate-100 pt-3 text-center text-[11px] text-slate-400 leading-relaxed">
            本メールはTERAPOの「個人設定 ＞ 通知センター」で設定された宛先に自動送信されています。
            <br />
            通知の停止・変更はシステム内の個人設定画面で行えます。
          </div>
        </div>
      </div>
    );
  };

  const isCustomHeaderEmail =
    previewTemplate.email &&
    (previewTemplate.email.layoutTheme === 'safety_urgent' ||
      previewTemplate.email.layoutTheme === 'safety_remind' ||
      previewTemplate.email.layoutTheme === 'indigo_safety_reg' ||
      previewTemplate.email.layoutTheme === 'indigo_account');

  const isSafetyPlainEmail = previewTemplate.email?.layoutTheme === 'safety_plain';

  return (
    <div className="space-y-5">
      {/* 上部サマリーヘッダー */}
      <div className="bg-white rounded-xl border border-slate-200 p-5">
        <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2">
              <Bell className="w-5 h-5 text-amber-600 shrink-0" />
              <h3 className="text-lg font-bold text-slate-900">
                通知様式（Web Push・メール）編集＆プレビュー
              </h3>
              <span className="text-xs font-mono tabular-nums text-slate-500">
                全 {counts.total} 種 ／ カスタマイズ中 {customizedCount} 件
              </span>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              タイトル・本文・メール件名・ボタン文言・URL有無をリアルタイムにプレビューしながら編集し、NASサーバーへ一括保存できます。
              {storeMeta.updatedAt && (
                <span className="ml-2 text-slate-500 font-mono tabular-nums">
                  最終保存: {formatJstTimestamp(storeMeta.updatedAt)}
                  {storeMeta.updatedBy ? ` (${storeMeta.updatedBy})` : ''}
                </span>
              )}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-50 transition-colors whitespace-nowrap cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              NASと再同期
            </button>

            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setOriginFilter('all')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
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
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  originFilter === 'frontend'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                フロント側 <span className="font-mono tabular-nums ml-0.5">({counts.frontend})</span>
              </button>
              <button
                type="button"
                onClick={() => setOriginFilter('server')}
                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  originFilter === 'server'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                NAS側 <span className="font-mono tabular-nums ml-0.5">({counts.server})</span>
              </button>
            </div>
          </div>
        </div>

        {/* NAS未配置時の案内（エラー暴走を防ぎ、状況を明快に伝える） */}
        {!storeMeta.serverAvailable && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 flex items-start gap-2.5 text-xs text-amber-900">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              <span className="font-bold">NAS側API未反映（プレビュー待機中）:</span>{' '}
              {storeMeta.lastError ||
                'NASサーバーに /api/notification-templates を配置・再起動すると保存と全社反映が有効になります。'}
            </div>
          </div>
        )}

        {/* 検索＆カテゴリフィルター */}
        <div className="mt-4 pt-4 border-t border-slate-100 flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px] max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="通知名・件名・本文・ファイル名で検索..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:bg-white focus:border-indigo-500 transition-colors"
              />
            </div>

            {customizedCount > 0 && (
              <button
                type="button"
                onClick={() => setCustomizedOnly((prev) => !prev)}
                className={`px-3 py-2 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                  customizedOnly
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                }`}
              >
                編集済のみ表示 ({customizedCount})
              </button>
            )}

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

      {/* メイン 2カラム: 左=通知一覧 / 右=編集＆リアルタイムプレビュー */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* 左カラム: 通知リスト */}
        <div className="lg:col-span-4 bg-white rounded-xl border border-slate-200 overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-700">通知一覧</span>
            <span className="text-[11px] text-slate-500">クリックで編集・プレビュー</span>
          </div>

          {filteredTemplates.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-2">
              <p>条件に一致する通知テンプレートがありません。</p>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setOriginFilter('all');
                  setCustomizedOnly(false);
                  setSearchQuery('');
                }}
                className="text-indigo-600 font-semibold hover:underline cursor-pointer"
              >
                絞り込みをリセット
              </button>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 max-h-[960px] overflow-y-auto">
              {filteredTemplates.map((baseItem) => {
                const effItem = applyOverrideToTemplate(baseItem, savedOverrides[baseItem.key]);
                const isSelected = activeBaseTemplate.key === baseItem.key;
                const itemCustomized = Boolean(savedOverrides[baseItem.key]);
                const channels = [
                  effItem.push ? 'Push' : null,
                  effItem.email ? 'メール' : null,
                ]
                  .filter(Boolean)
                  .join(' / ');
                const hasAnyUrl = Boolean(effItem.push?.includeUrl || effItem.email?.includeUrl);

                return (
                  <button
                    key={baseItem.key}
                    type="button"
                    onClick={() => setSelectedKey(baseItem.key)}
                    className={`w-full text-left px-4 py-3 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50/80 text-slate-900'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="text-[13px] font-bold leading-snug">{effItem.name}</div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        {itemCustomized && (
                          <span className="text-[11px] font-bold text-amber-700">編集済</span>
                        )}
                        {isSelected && (
                          <span className="text-[11px] font-bold text-indigo-700">選択中</span>
                        )}
                      </div>
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] text-slate-500">
                      <span>{effItem.categoryName}</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-medium text-slate-700">{channels}</span>
                      <span aria-hidden="true">·</span>
                      <span>{hasAnyUrl ? 'URLあり' : 'URLなし'}</span>
                      <span aria-hidden="true">·</span>
                      <span
                        className={
                          effItem.origin === 'server'
                            ? 'text-amber-700 font-medium'
                            : 'text-emerald-700 font-medium'
                        }
                      >
                        {effItem.origin === 'server' ? 'NAS側' : 'フロント側'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* 右カラム: 編集＆リアルタイムプレビュー */}
        <div className="lg:col-span-8 space-y-5">
          {/* ヘッダー＆保存アクションバー */}
          <div className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div className="space-y-1 min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500">
                  <span>{activeBaseTemplate.categoryName}</span>
                  <span aria-hidden="true">·</span>
                  <span
                    className={
                      activeBaseTemplate.origin === 'server'
                        ? 'text-amber-700 font-semibold'
                        : 'text-emerald-700 font-semibold'
                    }
                  >
                    {activeBaseTemplate.origin === 'server'
                      ? 'NASサーバー直接送信'
                      : 'フロントエンド集約管理'}
                  </span>
                  <span aria-hidden="true">·</span>
                  <code className="font-mono text-[11px] text-slate-700">
                    {activeBaseTemplate.key}
                  </code>
                  {isCustomized && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-amber-700 font-semibold">カスタマイズ済</span>
                    </>
                  )}
                  {isDirty && (
                    <>
                      <span aria-hidden="true">·</span>
                      <span className="text-indigo-700 font-semibold">未保存の変更あり</span>
                    </>
                  )}
                </div>
                <h4 className="text-base font-bold text-slate-900">{activeBaseTemplate.name}</h4>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={!isDirty || isSaving}
                  className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold rounded-lg bg-indigo-600 text-white hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 transition-colors whitespace-nowrap cursor-pointer disabled:cursor-not-allowed"
                >
                  <Save className="w-3.5 h-3.5" />
                  {isSaving ? '保存中...' : 'この通知を保存'}
                </button>

                {isDirty && (
                  <button
                    type="button"
                    onClick={() => setDraft(savedDraftBaseline)}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    変更を戻す
                  </button>
                )}

                {isCustomized &&
                  (confirmResetKey === activeBaseTemplate.key ? (
                    <div className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-rose-50 px-2.5 py-1">
                      <span className="text-[11px] font-semibold text-rose-800 whitespace-nowrap">
                        初期値に戻しますか？
                      </span>
                      <button
                        type="button"
                        onClick={handleResetToDefault}
                        disabled={isResetting}
                        className="px-2 py-1 text-[11px] font-bold rounded bg-rose-600 text-white hover:bg-rose-700 whitespace-nowrap cursor-pointer"
                      >
                        {isResetting ? '処理中...' : '実行'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmResetKey(null)}
                        className="px-2 py-1 text-[11px] font-semibold text-slate-600 hover:text-slate-900 whitespace-nowrap cursor-pointer"
                      >
                        中止
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmResetKey(activeBaseTemplate.key)}
                      disabled={isSaving || isResetting}
                      className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-rose-200 bg-white text-rose-700 hover:bg-rose-50 transition-colors whitespace-nowrap cursor-pointer"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      初期値に戻す
                    </button>
                  ))}

                <button
                  type="button"
                  onClick={() => handleCopySpec(previewTemplate)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap cursor-pointer"
                >
                  {copiedId === previewTemplate.key ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      コピー済
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-slate-500" />
                      仕様コピー
                    </>
                  )}
                </button>
              </div>
            </div>

            {feedback && (
              <div
                className={`rounded-lg px-3.5 py-2.5 text-xs flex items-center gap-2 border ${
                  feedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                {feedback.type === 'success' ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                ) : (
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                )}
                <span>{feedback.text}</span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-100 text-xs">
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-0.5">送信タイミング</div>
                <div className="text-slate-800 leading-relaxed">
                  {activeBaseTemplate.triggerTiming}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-0.5">送信対象</div>
                <div className="text-slate-800 leading-relaxed">
                  {activeBaseTemplate.recipientsSummary}
                </div>
              </div>
              <div>
                <div className="text-[11px] font-semibold text-slate-500 mb-0.5">送信モジュール</div>
                <div className="font-mono text-[11px] text-slate-800 flex items-center gap-1.5">
                  {activeBaseTemplate.origin === 'server' ? (
                    <Server className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <Layers className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  <span className="break-all">{activeBaseTemplate.sourceFile}</span>
                </div>
              </div>
            </div>
          </div>

          {/* 1. Web Push 編集＆リアルタイムプレビュー */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-indigo-600" />
                <h5 className="text-sm font-bold text-slate-900">Web Push 通知</h5>
                {previewTemplate.push ? (
                  <span className="text-xs text-slate-500">
                    · {previewTemplate.push.includeUrl ? '遷移URLあり' : '遷移URLなし'}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">· この通知では送信されません</span>
                )}
              </div>

              {previewTemplate.push && (
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

            {previewTemplate.push ? (
              <div className="p-5 space-y-5">
                {/* リアルタイムモックアップ */}
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
                          {interpolateTemplate(previewTemplate.push.titleTemplate, sampleVars) ||
                            '（タイトル未入力）'}
                        </div>
                        <div className="text-xs text-slate-700 leading-relaxed break-words whitespace-pre-wrap">
                          {interpolateTemplate(previewTemplate.push.bodyTemplate, sampleVars) ||
                            '（本文未入力）'}
                        </div>
                      </div>
                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] font-semibold">
                        <div className="flex items-center gap-4">
                          <span className={previewTemplate.push.includeUrl ? 'text-indigo-600' : 'text-slate-400'}>
                            {previewTemplate.push.includeUrl ? '確認する' : 'URLなし'}
                          </span>
                          <span className="text-slate-400">閉じる</span>
                        </div>
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
                            <span className="text-[11px] text-slate-400 font-mono tabular-nums">
                              16:30
                            </span>
                          </div>
                          <div className="text-[13px] font-bold text-white leading-snug break-words">
                            {interpolateTemplate(previewTemplate.push.titleTemplate, sampleVars) ||
                              '（タイトル未入力）'}
                          </div>
                          <div className="text-xs text-slate-300 leading-relaxed break-words whitespace-pre-wrap">
                            {interpolateTemplate(previewTemplate.push.bodyTemplate, sampleVars) ||
                              '（本文未入力）'}
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 border-t border-slate-700/80 text-xs font-medium text-slate-200">
                        <div className="py-2 text-center border-r border-slate-700/80 bg-slate-800/60">
                          {previewTemplate.push.includeUrl ? '確認する' : 'URLなし'}
                        </div>
                        <div className="py-2 text-center bg-slate-800/60 text-slate-400">閉じる</div>
                      </div>
                    </div>
                  )}
                </div>

                {/* Push 編集フォーム */}
                <div className="space-y-4 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Push タイトル</label>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {draft.pushTitle.length} / 300
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={300}
                      value={draft.pushTitle}
                      onFocus={() => setFocusedPushField('pushTitle')}
                      onChange={(e) => setDraft((prev) => ({ ...prev, pushTitle: e.target.value }))}
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">Push 本文</label>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {draft.pushBody.length} / 2000
                      </span>
                    </div>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={draft.pushBody}
                      onFocus={() => setFocusedPushField('pushBody')}
                      onChange={(e) => setDraft((prev) => ({ ...prev, pushBody: e.target.value }))}
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors leading-relaxed"
                    />
                  </div>

                  {activeBaseTemplate.variables.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="text-slate-500 font-semibold mr-1">変数挿入:</span>
                      {activeBaseTemplate.variables.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => insertVariableToPush(v.key)}
                          title={`${v.label}（例: ${v.sample}）を挿入`}
                          className="font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 transition-colors cursor-pointer"
                        >
                          {`{{${v.key}}}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* URL 有無トグル */}
                  <div className="pt-3 border-t border-slate-100 space-y-2">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        {draft.pushIncludeUrl ? (
                          <Link2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Link2Off className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold text-slate-800">タップ先URLを含める</div>
                          <div className="text-[11px] text-slate-500">
                            {draft.pushIncludeUrl
                              ? '通知をクリックすると該当画面へ直接遷移します'
                              : 'URLを付与せず通知のみ表示します'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={draft.pushIncludeUrl}
                        onClick={() =>
                          setDraft((prev) => ({ ...prev, pushIncludeUrl: !prev.pushIncludeUrl }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          draft.pushIncludeUrl ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            draft.pushIncludeUrl ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {draft.pushIncludeUrl && (
                      <div className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 break-all">
                        {resolvePreviewUrl(previewTemplate.push.urlTemplate, sampleVars)}
                      </div>
                    )}

                    {previewTemplate.push.notes && (
                      <div className="text-[11px] text-slate-500">
                        補足: {previewTemplate.push.notes}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 text-xs text-slate-500">
                この通知はメールのみ送信されます（Web Push は送信されません）。
              </div>
            )}
          </div>

          {/* 2. メール通知 編集＆リアルタイムプレビュー */}
          <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-100 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Mail className="w-4 h-4 text-blue-600" />
                <h5 className="text-sm font-bold text-slate-900">メール通知</h5>
                {previewTemplate.email ? (
                  <span className="text-xs text-slate-500">
                    · {previewTemplate.email.includeUrl ? '共有URLあり' : '共有URLなし'}
                  </span>
                ) : (
                  <span className="text-xs text-slate-400">· この通知では送信されません</span>
                )}
              </div>

              {previewTemplate.email && (
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

            {previewTemplate.email ? (
              <div className="p-5 space-y-5">
                {/* リアルタイム メールプレビュー */}
                <div className="rounded-xl border border-slate-200 overflow-hidden bg-slate-50">
                  <div className="bg-white border-b border-slate-200 px-4 py-3 space-y-1.5 text-xs">
                    <div className="flex items-baseline gap-2">
                      <span className="text-slate-400 font-semibold w-12 shrink-0">件名</span>
                      <span className="font-bold text-slate-900 break-words">
                        {interpolateTemplate(previewTemplate.email.subjectTemplate, sampleVars) ||
                          '（件名未入力）'}
                      </span>
                    </div>
                    <div className="flex items-baseline gap-2 text-[11px] text-slate-500">
                      <span className="text-slate-400 font-semibold w-12 shrink-0">差出人</span>
                      <span>TERAPO</span>
                    </div>
                    <div className="flex items-baseline gap-2 text-[11px] text-slate-500">
                      <span className="text-slate-400 font-semibold w-12 shrink-0">宛先</span>
                      <span>
                        {previewTemplate.key === 'server_user_invitation'
                          ? sampleVars.targetEmail
                          : '寺岡 花子 <hanako@teraoka-ads.co.jp>'}
                      </span>
                    </div>
                  </div>

                  <div className="p-4 sm:p-5">
                    {emailViewMode === 'html' ? (
                      renderEmailHtmlPreview(previewTemplate)
                    ) : (
                      <pre className="whitespace-pre-wrap font-mono text-xs text-slate-800 leading-relaxed bg-white border border-slate-200 rounded-lg p-4 overflow-x-auto">
                        {renderEmailPlainTextPreview(previewTemplate, sampleVars)}
                      </pre>
                    )}
                  </div>
                </div>

                {/* メール編集フォーム */}
                <div className="space-y-4 pt-1">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-xs font-bold text-slate-700">メール件名</label>
                      <span className="text-[11px] font-mono tabular-nums text-slate-400">
                        {draft.emailSubject.length} / 300
                      </span>
                    </div>
                    <input
                      type="text"
                      maxLength={300}
                      value={draft.emailSubject}
                      onFocus={() => setFocusedEmailField('emailSubject')}
                      onChange={(e) =>
                        setDraft((prev) => ({ ...prev, emailSubject: e.target.value }))
                      }
                      className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
                    />
                  </div>

                  {isCustomHeaderEmail && (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700">
                          HTMLヘッダー見出し
                        </label>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {draft.emailHeaderTitle.length} / 300
                        </span>
                      </div>
                      <input
                        type="text"
                        maxLength={300}
                        value={draft.emailHeaderTitle}
                        onFocus={() => setFocusedEmailField('emailHeaderTitle')}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, emailHeaderTitle: e.target.value }))
                        }
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
                      />
                    </div>
                  )}

                  {isSafetyPlainEmail ? (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700">
                          プレーンテキスト本文
                        </label>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {draft.emailMainContent.length} / 4000
                        </span>
                      </div>
                      <textarea
                        rows={7}
                        maxLength={4000}
                        value={draft.emailMainContent}
                        onFocus={() => setFocusedEmailField('emailMainContent')}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, emailMainContent: e.target.value }))
                        }
                        className="w-full px-3 py-2 font-mono text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors leading-relaxed"
                      />
                    </div>
                  ) : (
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-bold text-slate-700">
                          {isCustomHeaderEmail
                            ? 'メール本文（リード文）'
                            : 'リード文（挨拶直下の説明文・空欄時は標準文面）'}
                        </label>
                        <span className="text-[11px] font-mono tabular-nums text-slate-400">
                          {draft.emailLead.length} / 2000
                        </span>
                      </div>
                      <textarea
                        rows={isCustomHeaderEmail ? 3 : 2}
                        maxLength={2000}
                        value={draft.emailLead}
                        onFocus={() => setFocusedEmailField('emailLead')}
                        onChange={(e) =>
                          setDraft((prev) => ({ ...prev, emailLead: e.target.value }))
                        }
                        placeholder={
                          isCustomHeaderEmail
                            ? ''
                            : '空欄の場合は標準文面「〇〇 さんが【カテゴリ】を更新・登録しました。内容をご確認ください。」が使用されます'
                        }
                        className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors leading-relaxed"
                      />
                    </div>
                  )}

                  {activeBaseTemplate.variables.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                      <span className="text-slate-500 font-semibold mr-1">変数挿入:</span>
                      {activeBaseTemplate.variables.map((v) => (
                        <button
                          key={v.key}
                          type="button"
                          onClick={() => insertVariableToEmail(v.key)}
                          title={`${v.label}（例: ${v.sample}）を挿入`}
                          className="font-mono px-2 py-0.5 rounded bg-slate-100 hover:bg-indigo-50 text-slate-700 hover:text-indigo-700 border border-slate-200 transition-colors cursor-pointer"
                        >
                          {`{{${v.key}}}`}
                        </button>
                      ))}
                    </div>
                  )}

                  {/* メールURL有無＆CTAボタン文言 */}
                  <div className="pt-3 border-t border-slate-100 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-xs">
                        {draft.emailIncludeUrl ? (
                          <ExternalLink className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Link2Off className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div>
                          <div className="font-bold text-slate-800">
                            メール内に共有URL・ボタンを含める
                          </div>
                          <div className="text-[11px] text-slate-500">
                            {draft.emailIncludeUrl
                              ? '本番URL（teranago-sns.github.io/po/）のリンクを記載します'
                              : 'ボタンおよび直リンクURLをメール本文から省略します'}
                          </div>
                        </div>
                      </div>

                      <button
                        type="button"
                        role="switch"
                        aria-checked={draft.emailIncludeUrl}
                        onClick={() =>
                          setDraft((prev) => ({
                            ...prev,
                            emailIncludeUrl: !prev.emailIncludeUrl,
                          }))
                        }
                        className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                          draft.emailIncludeUrl ? 'bg-indigo-600' : 'bg-slate-300'
                        }`}
                      >
                        <span
                          className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                            draft.emailIncludeUrl ? 'translate-x-6' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </div>

                    {draft.emailIncludeUrl && !isSafetyPlainEmail && (
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="text-xs font-bold text-slate-700">
                            リンクボタン文言
                          </label>
                          <span className="text-[11px] font-mono tabular-nums text-slate-400">
                            {draft.emailCtaLabel.length} / 150
                          </span>
                        </div>
                        <input
                          type="text"
                          maxLength={150}
                          value={draft.emailCtaLabel}
                          onFocus={() => setFocusedEmailField('emailCtaLabel')}
                          onChange={(e) =>
                            setDraft((prev) => ({ ...prev, emailCtaLabel: e.target.value }))
                          }
                          className="w-full px-3 py-2 text-xs text-slate-900 bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-500 transition-colors"
                        />
                      </div>
                    )}

                    {draft.emailIncludeUrl && (
                      <div className="font-mono text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded px-2.5 py-1.5 break-all">
                        {resolvePreviewUrl(previewTemplate.email.urlTemplate, sampleVars)}
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-5 text-xs text-slate-500">
                この通知は Web Push のみ送信されます（メール通知はありません）。
              </div>
            )}
          </div>

          {/* 3. 使用できる差し込み変数リファレンス */}
          {activeBaseTemplate.variables.length > 0 && (
            <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
              <div className="px-5 py-3 border-b border-slate-100 flex items-center gap-2">
                <Code2 className="w-4 h-4 text-slate-500" />
                <h5 className="text-xs font-bold text-slate-800">
                  利用可能な差し込み変数一覧（プレビューで使用中のサンプル値）
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
                    {activeBaseTemplate.variables.map((v) => (
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
      </div>
    </div>
  );
};
