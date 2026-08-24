import { AppTab } from '../components/Sidebar';

export interface AppQueryParams {
  tab?: AppTab;
  // Calendar specific
  office?: string;
  division?: string;
  mode?: 'personal' | 'team';
  view?: 'month' | 'week' | 'day' | 'list';
  date?: string;
  type?: string;
  eventId?: string;
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
  if (['files', 'file', 'nas', 'ファイル'].includes(lower)) return 'files';
  if (['mypage', 'my', 'profile', 'マイページ'].includes(lower)) return 'mypage';
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

  // If office/division/mode/view/eventId were specified but no explicit tab, imply tab=calendar
  if (!result.tab && (result.office || result.division || result.mode || result.view || result.eventId)) {
    result.tab = 'calendar';
  }

  return result;
}

/**
 * Builds a query string or full URL with the given parameters
 */
export function buildAppUrl(params: AppQueryParams, baseUrl?: string): string {
  const origin = baseUrl || (typeof window !== 'undefined' ? `${window.location.origin}${window.location.pathname}` : '');
  const searchParams = new URLSearchParams();

  if (params.tab) searchParams.set('tab', params.tab);
  if (params.office) searchParams.set('office', params.office);
  if (params.division) searchParams.set('division', params.division);
  if (params.mode) searchParams.set('mode', params.mode);
  if (params.view) searchParams.set('view', params.view);
  if (params.date) searchParams.set('date', params.date);
  if (params.type && params.type !== 'all') searchParams.set('type', params.type);
  if (params.eventId) searchParams.set('eventId', params.eventId);
  if (params.applicationId) searchParams.set('appId', params.applicationId);
  if (params.memoId) searchParams.set('memoId', params.memoId);
  if (params.topicId) searchParams.set('topicId', params.topicId);
  if (params.chatRoomId) searchParams.set('roomId', params.chatRoomId);
  if (params.reportId) searchParams.set('reportId', params.reportId);

  const qs = searchParams.toString();
  return qs ? `${origin}?${qs}` : origin;
}

/**
 * Updates browser address bar URL with current parameters without reloading
 */
export function updateBrowserUrl(params: AppQueryParams, replace = true) {
  if (typeof window === 'undefined' || !window.history) return;
  try {
    const newUrl = buildAppUrl(params);
    if (replace) {
      window.history.replaceState({ ...params }, '', newUrl);
    } else {
      window.history.pushState({ ...params }, '', newUrl);
    }
  } catch (e) {
    // ignore
  }
}
