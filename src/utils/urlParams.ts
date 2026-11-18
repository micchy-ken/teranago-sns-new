import { AppTab } from '../components/Sidebar';

export interface AppQueryParams {
  tab?: AppTab;
  // Calendar specific
  office?: string;
  division?: string;
  groupId?: string;
  mode?: 'personal' | 'team';
  view?: 'month' | 'week' | 'day' | 'list';
  date?: string;
  type?: string;
  eventId?: string;
  targetUserId?: string;
  // Workflow specific
  applicationId?: string;
  // Memo specific
  memoId?: string;
  // Board specific
  topicId?: string;
  // Chat specific
  chatRoomId?: string;
  // Daily Report specific
  reportId?: string;
  // Safety Confirmation & Personal Email Registration
  safetyEventId?: string;
  safetyUserId?: string;
  safetyToken?: string;
  openEmergencyContact?: boolean;
  openSettings?: boolean;
  // Schedule Poll (日程調整) specific
  pollId?: string;
  // Assets (資産管理) specific
  assetId?: string;
  assetSubTab?: 'details' | 'inspections' | 'history';
  assetMode?: 'my' | 'catalog' | 'shared' | 'inspections' | 'calendar';
  assetCategory?: string;
  assetOffice?: string;
  assetDivision?: string;
  assetAssignee?: string;
  assetLens?: 'all' | 'inspection_due' | 'last_inspection' | 'attachments' | 'lease_alert';
  assetAlert?: 'none' | 'all_alerts' | 'overdue' | 'inspection_1m' | 'replacement_6m';
  assetQ?: string;
  assetShowRetired?: boolean;
  assetSort?: string;
  // Projects / Todo Boards specific
  projectId?: string;
  taskId?: string;
  projectView?: 'kanban' | 'list' | 'mytasks';
  // User Invitation & Password Reset
  inviteToken?: string;
  resetToken?: string;
  authMode?: 'login' | 'invite' | 'reset-password';
}

/**
 * Normalizes tab string to valid AppTab
 */
export function normalizeTab(tabStr?: string | null): AppTab | undefined {
  if (!tabStr) return undefined;
  const lower = tabStr.toLowerCase().trim();
  
  if (['calendar', 'schedule', 'cal', 'カレンダー', '予定'].includes(lower)) return 'calendar';
  if (['workflow', 'ringi', 'shinsei', 'approval', 'ワークフロー', '稟議', '申請'].includes(lower)) return 'workflow';
  if (['daily_report', 'daily-report', 'report', 'nippo', '日報'].includes(lower)) return 'daily_report';
  if (['memo', 'message', 'denon', '伝言', '伝言メモ'].includes(lower)) return 'memo';
  if (['board', 'bulletin', 'keijiban', 'topics', '掲示板'].includes(lower)) return 'board';
  if (['chat', 'talk', 'message_room', 'チャット'].includes(lower)) return 'chat';
  if (['timeline', 'sns', 'posts', 'post', 'タイムライン'].includes(lower)) return 'timeline';
  if (['inspection_scheduler', 'inspection', 'scheduler', 'tenken', '点検'].includes(lower)) return 'inspection_scheduler';
  if (['site_management', 'sites', 'genba', 'site', '現場', '現場管理'].includes(lower)) return 'site_management';
  if (['assets', 'asset', 'shisan', 'vehicles', 'vehicle', 'pc', '資産', '資産管理', '車両'].includes(lower)) return 'assets';
  if (['projects', 'project', 'tasks', 'task', 'todo', 'todos', 'プロジェクト', 'タスク', 'ボード'].includes(lower)) return 'projects';
  if (['files', 'file', 'nas', 'ファイル'].includes(lower)) return 'files';
  if (['mypage', 'my', 'profile', 'personal', 'マイページ', '個人設定'].includes(lower)) return 'mypage';
  if (['safety_confirmation', 'safety', 'anpi', 'anzen', '安否確認', '安否'].includes(lower)) return 'safety_confirmation';
  if (['photo_reports', 'photo_report', 'photoreports', 'photoreport', '写真報告書', '写真報告'].includes(lower)) return 'photo_reports';
  if (['admin', 'kanri', 'settings', '管理'].includes(lower)) return 'admin';

  return undefined;
}

/**
 * Normalizes calendar view
 */
export function normalizeCalendarView(viewStr?: string | null): 'month' | 'week' | 'day' | 'list' | undefined {
  if (!viewStr) return undefined;
  const lower = viewStr.toLowerCase().trim();
  if (['day', 'daily', 'd', '日', '日表示'].includes(lower)) return 'day';
  if (['week', 'weekly', 'w', '週', '週表示'].includes(lower)) return 'week';
  if (['month', 'monthly', 'm', '月', '月表示'].includes(lower)) return 'month';
  if (['list', 'agenda', 'l', 'リスト', '一覧'].includes(lower)) return 'list';
  return undefined;
}

/**
 * Normalizes calendar mode (personal / team)
 */
export function normalizeCalendarMode(modeStr?: string | null): 'personal' | 'team' | undefined {
  if (!modeStr) return undefined;
  const lower = modeStr.toLowerCase().trim();
  if (['team', 'group', 'チーム', 'グループ', '部', '部署'].includes(lower)) return 'team';
  if (['personal', 'user', 'me', '個人', '自分'].includes(lower)) return 'personal';
  return undefined;
}

export function normalizeAssetMode(modeStr?: string | null): 'my' | 'catalog' | 'shared' | 'inspections' | 'calendar' | undefined {
  if (!modeStr) return undefined;
  const lower = modeStr.toLowerCase().trim();
  if (['my', 'mine', 'personal', '自分', '自分の資産'].includes(lower)) return 'my';
  if (['catalog', 'list', 'daicho', 'all', '台帳', '資産台帳', '種類別'].includes(lower)) return 'catalog';
  if (['shared', 'common', 'kyoyu', '共用', '共用資産'].includes(lower)) return 'shared';
  if (['inspections', 'inspection_list', 'check', '点検一覧', '点検管理'].includes(lower)) return 'inspections';
  if (['calendar', 'cal', 'schedule', 'カレンダー', '資産カレンダー'].includes(lower)) return 'calendar';
  return undefined;
}

export function normalizeAssetLens(lensStr?: string | null): 'all' | 'inspection_due' | 'last_inspection' | 'attachments' | 'lease_alert' | undefined {
  if (!lensStr) return undefined;
  const lower = lensStr.toLowerCase().trim();
  if (['all', 'すべて'].includes(lower)) return 'all';
  if (['inspection_due', 'inspection', 'due', '点検予定'].includes(lower)) return 'inspection_due';
  if (['last_inspection', 'last', '前回点検日'].includes(lower)) return 'last_inspection';
  if (['attachments', 'files', '資料添付'].includes(lower)) return 'attachments';
  if (['lease_alert', 'alert', 'lease', 'リースアップ・アラート'].includes(lower)) return 'lease_alert';
  return undefined;
}

export function normalizeAssetAlert(alertStr?: string | null): 'none' | 'all_alerts' | 'overdue' | 'inspection_1m' | 'replacement_6m' | undefined {
  if (!alertStr) return undefined;
  const lower = alertStr.toLowerCase().trim();
  if (['none', 'all_alerts', 'overdue', 'inspection_1m', 'replacement_6m'].includes(lower)) {
    return lower as any;
  }
  return undefined;
}

/**
 * Parses all supported query parameters from a search string or window.location.search
 */
export function parseAppQueryParams(searchString?: string): AppQueryParams {
  if (typeof window === 'undefined') return {};
  
  const search = searchString !== undefined ? searchString : window.location.search;
  if (!search || !search.includes('?')) {
    // If no query string in search, check if there are hash params like #tab=calendar or #?tab=calendar
    const hash = window.location.hash;
    if (hash && hash.includes('?')) {
      return parseAppQueryParams(hash.substring(hash.indexOf('?')));
    }
  }

  const params = new URLSearchParams(search.startsWith('?') ? search : `?${search}`);
  const result: AppQueryParams = {};

  // 1. Tab detection
  const rawTab = params.get('tab') || params.get('page') || params.get('view_tab') || params.get('screen');
  const normalizedTab = normalizeTab(rawTab);
  if (normalizedTab) {
    result.tab = normalizedTab;
  }

  // 2. Calendar Specific Parameters
  const rawOffice = params.get('office') || params.get('location') || params.get('branch') || params.get('kyoten') || params.get('拠点');
  if (rawOffice) result.office = decodeURIComponent(rawOffice);

  const rawDivision = params.get('division') || params.get('dept') || params.get('department') || params.get('busho') || params.get('部署');
  if (rawDivision) result.division = decodeURIComponent(rawDivision);

  const rawGroupId = params.get('groupId') || params.get('group_id');
  if (rawGroupId) result.groupId = decodeURIComponent(rawGroupId);

  const rawMode = params.get('mode') || params.get('calendarMode') || params.get('target');
  const normalizedMode = normalizeCalendarMode(rawMode);
  if (normalizedMode) result.mode = normalizedMode;

  const rawView = params.get('view') || params.get('calendarView') || params.get('scale');
  const normalizedView = normalizeCalendarView(rawView);
  if (normalizedView) result.view = normalizedView;

  const rawDate = params.get('date') || params.get('day') || params.get('targetDate') || params.get('d');
  if (rawDate) result.date = decodeURIComponent(rawDate);

  const rawType = params.get('type') || params.get('category') || params.get('eventType');
  if (rawType) result.type = decodeURIComponent(rawType);

  const rawEventId = params.get('eventId') || params.get('event_id') || (result.tab === 'calendar' ? params.get('id') : undefined);
  if (rawEventId) result.eventId = rawEventId;

  const rawTargetUserId = params.get('targetUserId') || params.get('target_user_id');
  if (rawTargetUserId) result.targetUserId = rawTargetUserId;

  // 2.5. Schedule Poll Specific
  const rawPollId = params.get('pollId') || params.get('poll_id') || params.get('schedulePollId');
  if (rawPollId) result.pollId = rawPollId;

  // 3. Workflow Specific
  const rawAppId = params.get('applicationId') || params.get('appId') || params.get('app_id') || (result.tab === 'workflow' ? params.get('id') : undefined);
  if (rawAppId) result.applicationId = rawAppId;

  // 4. Memo Specific
  const rawMemoId = params.get('memoId') || params.get('memo_id') || (result.tab === 'memo' ? params.get('id') : undefined);
  if (rawMemoId) result.memoId = rawMemoId;

  // 5. Board Specific
  const rawTopicId = params.get('topicId') || params.get('topic_id') || (result.tab === 'board' ? params.get('id') : undefined);
  if (rawTopicId) result.topicId = rawTopicId;

  // 6. Chat Specific
  const rawChatRoomId = params.get('chatRoomId') || params.get('roomId') || params.get('room_id') || (result.tab === 'chat' ? params.get('id') : undefined);
  if (rawChatRoomId) result.chatRoomId = rawChatRoomId;

  // 7. Daily Report Specific
  const rawReportId = params.get('reportId') || params.get('report_id') || (result.tab === 'daily_report' ? params.get('id') : undefined);
  if (rawReportId) result.reportId = rawReportId;

  // 7.5. Asset Management Specific
  const rawAssetId = params.get('assetId') || params.get('asset_id') || (result.tab === 'assets' ? params.get('id') : undefined);
  if (rawAssetId) result.assetId = rawAssetId;

  const rawAssetSubTab = params.get('assetSubTab') || params.get('asset_sub_tab');
  if (rawAssetSubTab === 'history' || rawAssetSubTab === 'details' || rawAssetSubTab === 'inspections') {
    result.assetSubTab = rawAssetSubTab;
  }

  const rawAssetMode = params.get('assetMode') || params.get('asset_mode') || (result.tab === 'assets' ? params.get('mode') : undefined);
  const normalizedAssetMode = normalizeAssetMode(rawAssetMode);
  if (normalizedAssetMode) result.assetMode = normalizedAssetMode;

  const rawAssetCategory = params.get('assetCategory') || params.get('asset_category') || (result.tab === 'assets' ? params.get('category') : undefined);
  if (rawAssetCategory) result.assetCategory = decodeURIComponent(rawAssetCategory);

  const rawAssetOffice = params.get('assetOffice') || params.get('asset_office') || (result.tab === 'assets' ? params.get('office') : undefined);
  if (rawAssetOffice) result.assetOffice = decodeURIComponent(rawAssetOffice);

  const rawAssetDivision = params.get('assetDivision') || params.get('asset_division') || (result.tab === 'assets' ? params.get('division') : undefined);
  if (rawAssetDivision) result.assetDivision = decodeURIComponent(rawAssetDivision);

  const rawAssetAssignee = params.get('assetAssignee') || params.get('asset_assignee') || (result.tab === 'assets' ? params.get('assignee') : undefined);
  if (rawAssetAssignee) result.assetAssignee = decodeURIComponent(rawAssetAssignee);

  const rawAssetLens = params.get('assetLens') || params.get('asset_lens') || (result.tab === 'assets' ? params.get('lens') : undefined);
  const normalizedAssetLens = normalizeAssetLens(rawAssetLens);
  if (normalizedAssetLens) result.assetLens = normalizedAssetLens;

  const rawAssetAlert = params.get('assetAlert') || params.get('asset_alert');
  const normalizedAssetAlert = normalizeAssetAlert(rawAssetAlert);
  if (normalizedAssetAlert) result.assetAlert = normalizedAssetAlert;

  const rawAssetQ = params.get('assetQ') || params.get('asset_q') || (result.tab === 'assets' ? params.get('q') : undefined);
  if (rawAssetQ) result.assetQ = decodeURIComponent(rawAssetQ);

  const rawAssetShowRetired = params.get('assetShowRetired') || params.get('asset_show_retired') || (result.tab === 'assets' ? params.get('showRetired') : undefined);
  if (rawAssetShowRetired === '1' || rawAssetShowRetired === 'true') {
    result.assetShowRetired = true;
  }

  const rawAssetSort = params.get('assetSort') || params.get('asset_sort') || (result.tab === 'assets' ? params.get('sort') : undefined);
  if (rawAssetSort && /^[^:]+:(?:asc|desc)$/.test(rawAssetSort.trim())) {
    result.assetSort = rawAssetSort.trim();
  }

  // 7.5 Projects / Todo Boards Specific
  const rawProjectId = params.get('projectId') || params.get('project_id') || params.get('boardId') || (result.tab === 'projects' ? params.get('id') : undefined);
  if (rawProjectId) result.projectId = decodeURIComponent(rawProjectId);

  const rawTaskId = params.get('taskId') || params.get('task_id') || params.get('cardId');
  if (rawTaskId) result.taskId = decodeURIComponent(rawTaskId);

  const rawProjectView = (params.get('projectView') || params.get('project_view') || '').toLowerCase().trim();
  if (rawProjectView === 'kanban' || rawProjectView === 'list' || rawProjectView === 'mytasks') {
    result.projectView = rawProjectView;
  }

  // 8. Safety Confirmation Specific
  const rawSafetyEventId = params.get('safetyEventId') || params.get('safety_event_id') || params.get('eventId') || (result.tab === 'safety_confirmation' ? params.get('id') : undefined);
  if (rawSafetyEventId) {
    result.safetyEventId = rawSafetyEventId;
  }
  const rawSafetyUserId = params.get('safetyUserId') || params.get('safety_user_id') || params.get('uid') || params.get('userId');
  if (rawSafetyUserId) {
    result.safetyUserId = rawSafetyUserId;
  }
  const rawSafetyToken = params.get('safetyToken') || params.get('token') || params.get('t');
  if (rawSafetyToken) {
    result.safetyToken = rawSafetyToken;
  }

  // 9. Personal Email Registration / Emergency Contact Deep Link
  const rawOpenEmergency = params.get('openEmergencyContact') || params.get('openEmergencyEmail') || params.get('emergencyEmail') || params.get('emergency');
  if (rawOpenEmergency === 'true' || rawOpenEmergency === '1') {
    result.openEmergencyContact = true;
    if (!result.tab) result.tab = 'mypage';
  }

  const rawOpenSettings = params.get('openSettings') || params.get('settings');
  if (rawOpenSettings === 'true' || rawOpenSettings === '1') {
    result.openSettings = true;
    if (!result.tab) result.tab = 'mypage';
  }

  // 10. User Invitation & Password Reset Specific
  const rawInviteToken = params.get('inviteToken') || params.get('invite') || (params.get('mode') === 'invite' ? params.get('token') : undefined);
  if (rawInviteToken) {
    result.inviteToken = rawInviteToken;
    result.authMode = 'invite';
  }

  const rawResetToken = params.get('resetToken') || params.get('reset') || (params.get('mode') === 'reset-password' ? params.get('token') : undefined);
  if (rawResetToken) {
    result.resetToken = rawResetToken;
    result.authMode = 'reset-password';
  }

  const rawAuthMode = params.get('mode');
  if (rawAuthMode === 'invite') result.authMode = 'invite';
  if (rawAuthMode === 'reset-password' || rawAuthMode === 'reset' || rawAuthMode === 'password-reset') result.authMode = 'reset-password';

  if (
    !result.tab &&
    (result.projectId || result.taskId || result.projectView)
  ) {
    result.tab = 'projects';
  }
  if (
    !result.tab &&
    (result.assetId ||
      result.assetMode ||
      result.assetCategory ||
      result.assetOffice ||
      result.assetDivision ||
      result.assetAssignee ||
      result.assetLens ||
      result.assetAlert ||
      result.assetQ ||
      result.assetSort)
  ) {
    result.tab = 'assets';
  }
  // If office/division/groupId/mode/view/eventId/targetUserId were specified but no explicit tab, imply tab=calendar
  if (!result.tab && (result.office || result.division || result.groupId || result.mode || result.view || result.eventId || result.targetUserId)) {
    result.tab = 'calendar';
  }
  if (!result.tab && result.topicId) {
    result.tab = 'board';
  }
  if (!result.tab && result.memoId) {
    result.tab = 'memo';
  }
  if (!result.tab && result.applicationId) {
    result.tab = 'workflow';
  }
  if (!result.tab && result.chatRoomId) {
    result.tab = 'chat';
  }
  if (!result.tab && result.reportId) {
    result.tab = 'daily_report';
  }
  if (!result.tab && result.safetyEventId) {
    result.tab = 'safety_confirmation';
  }

  return result;
}

/**
 * Resolves current base path of the application (e.g. '/teranago-sns-new/' or '/')
 */
export function getAppBasePath(): string {
  if (typeof window !== 'undefined') {
    const pathname = window.location.pathname;
    
    // Explicit match for repository name (with or without trailing slash)
    if (pathname.includes('/teranago-sns-new')) {
      return '/teranago-sns-new/';
    }
    
    const viteBase = import.meta.env.BASE_URL;
    if (viteBase && viteBase !== '/' && viteBase !== './' && !viteBase.startsWith('.')) {
      const cleanBase = viteBase.replace(/^\/|\/$/g, '');
      if (pathname.includes(cleanBase)) {
        return viteBase.endsWith('/') ? viteBase : `${viteBase}/`;
      }
    }
    
    // Check if path has a repository/subfolder segment before index.html or query
    const cleanPath = pathname.replace(/\/index\.html$/i, '');
    if (cleanPath && cleanPath !== '/') {
      const segments = cleanPath.split('/').filter(Boolean);
      if (segments.length > 0 && !segments[0].includes('.')) {
        return `/${segments[0]}/`;
      }
    }
    return '/';
  }
  return import.meta.env.BASE_URL || '/';
}

/**
 * Normalizes notification or link URLs ensuring repository subdirectories (like GitHub Pages) are preserved
 * and query parameters for deep linking (e.g., ?tab=board&topicId=123) are kept intact.
 */
export function resolveNotificationUrl(url?: string): string {
  const basePath = getAppBasePath();
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const prefix = basePath.endsWith('/') ? basePath : `${basePath}/`;
  const baseWithOrigin = origin ? `${origin}${prefix}` : prefix;

  if (!url || url === '/' || url === './') {
    return baseWithOrigin;
  }
  
  // Separate path from query/hash so query parameters are strictly preserved
  let mainUrl = url;
  let queryAndHash = '';
  const qIndex = url.indexOf('?');
  const hIndex = url.indexOf('#');
  const splitIndex = qIndex >= 0 ? qIndex : (hIndex >= 0 ? hIndex : -1);

  if (splitIndex >= 0) {
    mainUrl = url.substring(0, splitIndex);
    queryAndHash = url.substring(splitIndex);
  }

  // If already absolute URL with protocol (https:// or http://)
  if (/^https?:\/\//i.test(mainUrl)) {
    if (origin && mainUrl.startsWith(origin) && basePath !== '/' && !mainUrl.includes(basePath)) {
      return `${origin}${prefix}${queryAndHash}`;
    }
    return `${mainUrl}${queryAndHash}`;
  }

  let target = mainUrl;
  if (target.startsWith('/')) {
    if (basePath !== '/' && target.startsWith(basePath)) {
      return origin ? `${origin}${target}${queryAndHash}` : `${target}${queryAndHash}`;
    }
    target = target.replace(/^\/+/, '');
  } else if (target.startsWith('./')) {
    target = target.replace(/^\.\/+/, '');
  }

  const fullPath = target ? `${prefix}${target}` : prefix;
  const finalBase = origin ? `${origin}${fullPath}` : fullPath;
  return `${finalBase}${queryAndHash}`;
}

/**
 * Builds full application URL with query parameters attached.
 * Ensures basePath (e.g. '/teranago-sns-new/' or '/') is preserved correctly.
 */
export function buildAppUrl(params?: AppQueryParams, baseUrl?: string): string {
  let origin = baseUrl;
  if (!origin && typeof window !== 'undefined') {
    const basePath = getAppBasePath();
    const cleanOrigin = window.location.origin;
    const prefix = basePath.startsWith('/') ? basePath : `/${basePath}`;
    origin = `${cleanOrigin}${prefix}`;
  } else if (!origin) {
    origin = '/';
  }

  // Ensure origin is clean of existing search/hash
  const baseClean = origin.split('?')[0].split('#')[0];

  if (!params) {
    return baseClean;
  }

  const searchParams = new URLSearchParams();

  if (params.tab) {
    searchParams.set('tab', params.tab);
  }
  if (params.mode) {
    searchParams.set('mode', params.mode);
  }
  if (params.view) {
    searchParams.set('view', params.view);
  }
  if (params.date) {
    searchParams.set('date', params.date);
  }
  if (params.groupId && params.groupId !== 'org') {
    searchParams.set('groupId', params.groupId);
  }
  if (params.office && params.office !== '全社' && params.office !== '全拠点') {
    searchParams.set('office', params.office);
  }
  if (params.division && params.division !== '全部署') {
    searchParams.set('division', params.division);
  }
  if (params.type && params.type !== 'all') {
    searchParams.set('type', params.type);
  }
  if (params.eventId) {
    searchParams.set('eventId', params.eventId);
  }
  if (params.targetUserId) {
    searchParams.set('targetUserId', params.targetUserId);
  }
  if (params.applicationId) {
    searchParams.set('applicationId', params.applicationId);
  }
  if (params.memoId) {
    searchParams.set('memoId', params.memoId);
  }
  if (params.topicId) {
    searchParams.set('topicId', params.topicId);
  }
  if (params.chatRoomId) {
    searchParams.set('chatRoomId', params.chatRoomId);
  }
  if (params.reportId) {
    searchParams.set('reportId', params.reportId);
  }
  if (params.safetyEventId) {
    searchParams.set('safetyEventId', params.safetyEventId);
  }
  if (params.assetId) {
    searchParams.set('assetId', params.assetId);
  }
  if (params.assetSubTab && params.assetSubTab !== 'details') {
    searchParams.set('assetSubTab', params.assetSubTab);
  }
  if (params.assetMode) {
    searchParams.set('assetMode', params.assetMode);
  }
  if (params.assetCategory && params.assetCategory !== 'all') {
    searchParams.set('assetCategory', params.assetCategory);
  }
  if (
    params.assetOffice &&
    (params.assetOffice !== 'all' || params.assetMode === 'catalog' || params.assetMode === 'shared')
  ) {
    searchParams.set('assetOffice', params.assetOffice);
  }
  if (params.assetDivision && params.assetDivision !== 'all') {
    searchParams.set('assetDivision', params.assetDivision);
  }
  if (params.assetAssignee && params.assetAssignee !== 'all') {
    searchParams.set('assetAssignee', params.assetAssignee);
  }
  if (params.assetLens && params.assetLens !== 'all') {
    searchParams.set('assetLens', params.assetLens);
  }
  if (params.assetAlert && params.assetAlert !== 'none') {
    searchParams.set('assetAlert', params.assetAlert);
  }
  if (params.assetQ && params.assetQ.trim()) {
    searchParams.set('assetQ', params.assetQ.trim());
  }
  if (params.assetShowRetired) {
    searchParams.set('assetShowRetired', '1');
  }
  if (params.assetSort) {
    searchParams.set('assetSort', params.assetSort);
  }
  if (params.projectId) {
    searchParams.set('projectId', params.projectId);
  }
  if (params.taskId) {
    searchParams.set('taskId', params.taskId);
  }
  if (params.projectView && params.projectView !== 'kanban') {
    searchParams.set('projectView', params.projectView);
  }
  if (params.openEmergencyContact) {
    searchParams.set('openEmergencyContact', 'true');
  }
  if (params.openSettings) {
    searchParams.set('openSettings', 'true');
  }

  const queryString = searchParams.toString();
  return queryString ? `${baseClean}?${queryString}` : baseClean;
}

/**
 * Cleans the browser address bar to ensure no query parameters remain attached to the URL
 */
export function updateBrowserUrl(_params?: AppQueryParams, _replace = true) {
  if (typeof window === 'undefined' || !window.history) return;
  try {
    if (window.location.search) {
      const cleanPath = window.location.pathname + (window.location.hash ? window.location.hash.split('?')[0] : '');
      window.history.replaceState({}, '', cleanPath);
    }
  } catch (e) {
    // ignore
  }
}

/**
 * Copies text to clipboard with iframe/non-HTTPS fallback support
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      // fallback below
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea');
      textArea.value = text;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      textArea.style.top = '-999999px';
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = document.execCommand('copy');
      textArea.remove();
      return successful;
    } catch (e) {
      return false;
    }
  }
  return false;
}

