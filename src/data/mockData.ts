import { Post, User, CalendarEvent, WorkflowApplication, BoardTopic, ChatRoom, Memo, DailyReport, OfficeMaster, DivisionMaster, PositionMaster, ApprovalFlowRule, ItemMaster } from '../types';

export const initialOffices: OfficeMaster[] = [
  {
    id: 'off-1',
    name: '名古屋',
    type: 'branch',
    code: 'OFF-NGY',
    location: '愛知県名古屋市中村区名駅1-1-4 中村ビル7F',
    phone: '052-555-0192',
  },
  {
    id: 'off-2',
    name: '浜松営業所',
    type: 'sales_office',
    code: 'OFF-HAM',
    location: '静岡県浜松市中央区板屋町111-2 浜松アクトタワー12F',
    phone: '053-444-0183',
  },
  {
    id: 'off-3',
    name: '静岡営業所',
    type: 'sales_office',
    code: 'OFF-SHI',
    location: '静岡県静岡市葵区黒金町59-6 静岡ビル4F',
    phone: '054-222-0174',
  },
  {
    id: 'off-4',
    name: '本社',
    type: 'headquarter',
    code: 'OFF-HQ',
    location: '東京都港区新橋1-2-3 本社ビル',
    phone: '03-1234-5678',
  },
];

export const initialDivisions: DivisionMaster[] = [
  { id: 'div-1', name: '管理', code: 'DIV-MGT', description: '全社管理・人事・経営企画統括' },
  { id: 'div-2', name: '営業', code: 'DIV-SLS', description: '新規開拓・既存顧客営業活動' },
  { id: 'div-3', name: '設計', code: 'DIV-DSG', description: 'システム・建築・ソリューション設計' },
  { id: 'div-4', name: '工務', code: 'DIV-ENG', description: '現場施工管理・工務調整' },
  { id: 'div-5', name: '保守', code: 'DIV-MNT', description: '機器点検・定期メンテナンス・アフターサポート' },
  { id: 'div-6', name: '保守営業', code: 'DIV-MNS', description: '保守サポート契約提案・ルート営業' },
  { id: 'div-7', name: '総務', code: 'DIV-GEN', description: '拠点総務・庶務・労務手続き' },
];

export const initialPositions: PositionMaster[] = [
  { id: 'pos-1', name: '代表取締役', code: 'POS-EXEC', description: '経営全般統括' },
  { id: 'pos-2', name: '部長', code: 'POS-DIR', description: '部門・拠点の統括責任者' },
  { id: 'pos-3', name: '課長', code: 'POS-MGR', description: '課・チームの運用管理責任者' },
  { id: 'pos-4', name: '課長補佐', code: 'POS-AMGR', description: '課長の補佐及びプロジェクト進行管理' },
  { id: 'pos-5', name: '主任', code: 'POS-LEAD', description: '業務リーダー・若手指導' },
  { id: 'pos-6', name: '一般', code: 'POS-STAFF', description: '一般社員・実務担当' },
];

export const currentUser: User = {
  id: 'u1',
  loginId: 'yamamichi',
  password: 'test',
  name: '山道 健介',
  kanaName: 'ヤマミチ ケンスケ',
  office: '名古屋',
  division: '総務',
  position: '課長補佐',
  department: '名古屋 総務 課長補佐',
  avatarUrl: 'https://i.pravatar.cc/150?u=u1',
  isAdmin: true,
  role: 'admin',
  email: 'yamamichi@teraoka-ads.co.jp',
  mobileEmail: 'micchy.k@gmail.com',
  phoneOutside: '',
  phoneExtension: '16',
  mobilePhone: '080-3281-6140',
  phone: '080-3281-6140',
  supervisorId: 'u4', // 上長：田中部長
};

export const approverUser: User = {
  id: 'u4',
  loginId: 'tanaka',
  password: 'password',
  name: '田中 部長',
  office: '本社',
  division: '管理',
  department: '本社 管理',
  avatarUrl: 'https://i.pravatar.cc/150?u=u4',
  isAdmin: false,
  role: 'user',
  email: 'tanaka@teranago.co.jp',
  phone: '03-1234-5678',
};

export const user2: User = {
  id: 'u2',
  loginId: 'sato',
  password: 'password',
  name: '佐藤 デザイン',
  office: '名古屋支店',
  division: '総務',
  department: '名古屋支店 総務',
  avatarUrl: 'https://i.pravatar.cc/150?u=u2',
  isAdmin: false,
  role: 'user',
  email: 'sato@teranago.co.jp',
  phone: '052-555-0192',
  supervisorId: 'u1', // 上長：山道課長補佐
};

export const user3: User = {
  id: 'u3',
  loginId: 'takahashi',
  password: 'password',
  name: '高橋 営業',
  office: '静岡営業所',
  division: '営業',
  department: '静岡営業所 営業',
  avatarUrl: 'https://i.pravatar.cc/150?u=u3',
  isAdmin: false,
  role: 'user',
  email: 'takahashi@teranago.co.jp',
  phone: '054-222-0174',
  supervisorId: 'u4', // 上長：田中部長
};

export const user5: User = {
  id: 'u5',
  loginId: 'suzuki',
  password: 'password',
  name: '鈴木 保守',
  office: '浜松営業所',
  division: '保守営業',
  department: '浜松営業所 保守営業',
  avatarUrl: 'https://i.pravatar.cc/150?u=u5',
  isAdmin: false,
  role: 'user',
  email: 'suzuki@teranago.co.jp',
  phone: '053-444-0183',
  supervisorId: 'u4', // 上長：田中部長
};

export const allUsers: User[] = [currentUser, approverUser, user2, user3, user5];

const today = new Date();
today.setHours(0, 0, 0, 0);

export const initialPosts: Post[] = [
  {
    id: 'p1',
    author: currentUser,
    content: '[モック] 新しいプロジェクトのデザインモックが完成しました。フィードバックをお願いします！\n\nデザインファイルはNASの共有フォルダに保存しています。',
    tags: ['デザイン', '新プロジェクト'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    likes: 5,
    isLiked: false,
    nasLink: '\\\\nas01\\Shared\\Projects\\NewPortal\\design_mock_v1.fig'
  },
  {
    id: 'p2',
    author: user3,
    content: '[モック] 来週の営業会議の資料、NASの営業部フォルダにアップロードしました。各自事前に目を通しておいてください。',
    tags: ['営業会議', '資料'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    likes: 2,
    isLiked: true,
    nasLink: '\\\\nas01\\Sales\\Meetings\\2026-07\\materials.pdf'
  },
  {
    id: 'p3',
    author: approverUser,
    content: '[モック] 今期の目標達成に向けたキックオフミーティングお疲れ様でした。議事録を展開します。',
    tags: ['全社', '議事録'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    likes: 12,
    isLiked: true,
  },
];

export const initialEvents: CalendarEvent[] = [
  {
    id: 'e1',
    title: '[モック] 全社キックオフミーティング（来客）',
    start: new Date(today.getTime() + 1000 * 60 * 60 * 10).toISOString(),
    end: new Date(today.getTime() + 1000 * 60 * 60 * 12).toISOString(),
    type: 'visitor',
    office: '全社',
    division: '全部署',
    location: '大会議室A / Zoom',
    attendees: [currentUser, approverUser, user2, user3],
    memo: 'Q3の業績報告とQ4の目標設定について',
    isGoogleSynced: false,
  },
  {
    id: 'e2',
    title: '[モック] 名駅一丁目現場 工事確認',
    start: new Date(today.getTime() + 1000 * 60 * 60 * 14).toISOString(),
    end: new Date(today.getTime() + 1000 * 60 * 60 * 15).toISOString(),
    type: 'construction',
    office: '本社',
    division: '設計',
    location: 'オンライン',
    url: 'https://meet.google.com/xxx-xxxx-xxx',
    attendees: [currentUser, user2],
    memo: '進捗確認とブロッカーの共有',
    isGoogleSynced: false,
  },
  {
    id: 'e3',
    title: '[モック] 定期点検・1on1 面談',
    start: new Date(today.getTime() + 1000 * 60 * 60 * 16).toISOString(),
    end: new Date(today.getTime() + 1000 * 60 * 60 * 16.5).toISOString(),
    type: 'inspection',
    office: '本社',
    division: '管理',
    location: 'ミーティングブース1',
    attendees: [currentUser, approverUser],
    isGoogleSynced: false,
  },
  {
    id: 'e6',
    title: '[モック] 【出張】開発者カンファレンス参加（承認済）',
    start: new Date(today.getTime() + 1000 * 60 * 60 * (24 * 5 + 9)).toISOString(),
    end: new Date(today.getTime() + 1000 * 60 * 60 * (24 * 7 + 18)).toISOString(),
    type: 'business_trip',
    office: '本社',
    division: '設計',
    location: '東京ビッグサイト',
    attendees: [currentUser],
    memo: 'ワークフローにて承認済みの出張。カンファレンス参加後、レポート提出予定。',
    isGoogleSynced: false,
  }
];

export const initialApplications: WorkflowApplication[] = [
  {
    id: 'a1',
    type: 'business_trip',
    title: '[モック] 開発者カンファレンス参加に伴う出張申請',
    description: '最新のWeb技術トレンド把握のため、年次カンファレンスに参加します。',
    applicant: currentUser,
    approver: approverUser,
    status: 'approved',
    amount: 50000,
    startDate: new Date(today.getTime() + 1000 * 60 * 60 * (24 * 5)).toISOString(),
    endDate: new Date(today.getTime() + 1000 * 60 * 60 * (24 * 7)).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
    flowId: 'flow-default-1',
    flowName: '標準2段階承認フロー',
    currentStepIndex: 2,
    totalSteps: 2,
    stepsConfig: [
      { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' },
      { stepNumber: 2, approverType: 'supervisor_2', stepName: '二次承認（部長承認）' },
    ],
    history: [
      { stepNumber: 1, approver: approverUser, status: 'approved', actionAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString() },
      { stepNumber: 2, approver: user3, status: 'approved', actionAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() }
    ]
  },
  {
    id: 'a2',
    type: 'purchase_order',
    title: '[モック] 名駅一丁目ビル新築工事現場',
    description: '現場施工に必要な配線用ケーブルおよび高所作業安全帯の手配。',
    applicant: currentUser,
    approver: approverUser,
    status: 'pending',
    amount: 147000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
    purchaseItems: [
      { itemName: '制御盤用ケーブル (100m)', quantity: 2, unitPrice: 36000, amount: 72000, note: 'A棟2F電気工事用' },
      { itemName: '高所作業用安全帯フルハーネス', quantity: 5, unitPrice: 15000, amount: 75000, note: '新規入場者用' }
    ],
    flowId: 'flow-default-1',
    flowName: '標準2段階承認フロー',
    currentStepIndex: 1,
    totalSteps: 2,
    stepsConfig: [
      { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' },
      { stepNumber: 2, approverType: 'supervisor_2', stepName: '二次承認（部長承認）' },
    ],
    history: [],
  },
  {
    id: 'a3',
    type: 'inventory_issue',
    title: '[モック] 栄二丁目商業ビル改修現場',
    description: '現場での緊急補給用資材。現場受取予定。',
    applicant: currentUser,
    approver: approverUser,
    status: 'pending',
    amount: 19600,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    purchaseItems: [
      { itemName: 'M3戸車セット', quantity: 10, unitPrice: 1200, amount: 12000, note: '1Fエントランス修理用' },
      { itemName: '両面テープ (強粘着 25mm)', quantity: 4, unitPrice: 1900, amount: 7600, note: 'モール固定用' }
    ],
    flowId: 'flow-default-1',
    flowName: '標準2段階承認フロー',
    currentStepIndex: 1,
    totalSteps: 2,
    stepsConfig: [
      { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' },
      { stepNumber: 2, approverType: 'supervisor_2', stepName: '二次承認（部長承認）' },
    ],
    history: [],
  },
  {
    id: 'a4',
    type: 'other',
    title: '[モック] リモートワーク環境整備補助の申請',
    description: '外部モニター購入費用の補助申請',
    applicant: currentUser,
    approver: approverUser,
    status: 'rejected',
    amount: 40000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
    flowId: 'flow-default-1',
    flowName: '標準2段階承認フロー',
    currentStepIndex: 1,
    totalSteps: 2,
    stepsConfig: [
      { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' },
      { stepNumber: 2, approverType: 'supervisor_2', stepName: '二次承認（部長承認）' },
    ],
    history: [
      { stepNumber: 1, approver: approverUser, status: 'rejected', actionAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString() }
    ]
  }
];

export const initialTopics: BoardTopic[] = [
  {
    id: 't1',
    category: 'general',
    title: '[モック] 【重要】夏季休業および有給休暇推奨日のご案内',
    content: '今年の夏季休業期間は8月13日(金)〜8月16日(月)となります。休業中の緊急連絡先やシステムの保守対応体制については添付のガイドラインファイルをご確認ください。\n\n各部署での業務調整をお願いいたします。',
    author: user3,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    views: 142,
    commentsCount: 2,
    office: '全社',
    division: '全部署',
    tags: ['全社告知', '重要', '総務', '夏季休業'],
    isPinned: true,
    hasPeriod: true,
    startDate: '2026-07-01',
    endDate: '2026-08-31',
    attachments: [
      { id: 'att1', name: '2026年夏季休業ガイドライン.pdf', size: '1.2 MB' }
    ],
    comments: [
      { id: 'cm1', author: currentUser, content: '内容確認いたしました。部署内でも周知します。', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString() },
      { id: 'cm2', author: user2, content: '緊急連絡先の担当表をアップロードいたしました。', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() }
    ],
    viewers: [
      { user: currentUser, viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 4).toISOString() },
      { user: user2, viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString() },
      { user: approverUser, viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 2).toISOString() }
    ]
  },
  {
    id: 't2',
    category: 'it',
    title: '社内VPNおよび基幹システム定期メンテナンス',
    content: '今週末の日曜日深夜2時〜4時にかけて、社内VPNサーバーおよびデータベースの定期メンテナンスを実施します。\n当該時間帯は外部からのアクセスが一時遮断されますのでご注意ください。',
    author: approverUser,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    views: 89,
    commentsCount: 0,
    office: '全社',
    division: '全部署',
    tags: ['システム更新', 'ITインフラ', '重要'],
    isPinned: false,
    hasPeriod: false,
    attachments: [],
    comments: [],
    viewers: [
      { user: currentUser, viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString() }
    ]
  },
  {
    id: 't3',
    category: 'hr',
    title: '秋の定期健康診断のご案内および受診予約',
    content: '秋の定期健康診断の予約受付を開始しました。各自指定の医療機関Webサイトより受診予約を行ってください。\n受診期限は10月末までとなっております。',
    author: approverUser,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    views: 45,
    commentsCount: 1,
    office: '全社',
    division: '総務',
    tags: ['健康診断', '総務', '福利厚生'],
    isPinned: false,
    hasPeriod: true,
    startDate: '2026-07-20',
    endDate: '2026-10-31',
    attachments: [
      { id: 'att2', name: '受診指定医療機関一覧.xlsx', size: '480 KB' }
    ],
    comments: [
      { id: 'cm3', author: user3, content: '健診票はいつ頃配布されますでしょうか？', createdAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() }
    ],
    viewers: [
      { user: user3, viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 12).toISOString() }
    ]
  },
  {
    id: 't4',
    category: 'general',
    title: '【設計部】新CADソフトウエア導入説明会のご案内',
    content: '設計部のメンバー対象に、来月より全面移行する新CADソフトウエアのオンライン講習会を開催いたします。対象者は事前にマニュアルのダウンロードをお願いします。',
    author: currentUser,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 6).toISOString(),
    views: 28,
    commentsCount: 0,
    office: '本社',
    division: '設計',
    tags: ['設計部', '研修', 'CAD'],
    isPinned: true,
    hasPeriod: false,
    attachments: [
      { id: 'att3', name: '新CAD操作マニュアル_v1.pdf', size: '3.5 MB' }
    ],
    comments: [],
    viewers: [
      { user: currentUser, viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString() }
    ]
  }
];

export const initialChatRooms: ChatRoom[] = [
  {
    id: 'c1',
    type: 'dm',
    participants: [currentUser, user2],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
    messages: [
      {
        id: 'm1',
        sender: user2,
        content: '明日のデザインレビューですが、14時からで大丈夫ですか？',
        createdAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        type: 'text',
      },
      {
        id: 'm2',
        sender: currentUser,
        content: 'はい、大丈夫です！よろしくお願いします。',
        createdAt: new Date(Date.now() - 1000 * 60 * 25).toISOString(),
        type: 'text',
      },
      {
        id: 'm2-stamp',
        sender: currentUser,
        content: '了解です！',
        type: 'stamp',
        stampId: 'ryokai',
        stampText: '了解です！',
        stampCategory: 'あいさつ',
        createdAt: new Date(Date.now() - 1000 * 60 * 24).toISOString(),
      },
      {
        id: 'm2-img',
        sender: user2,
        content: 'レビュー対象のアジェンダ資料です！',
        type: 'image',
        imageUrl: 'https://images.unsplash.com/photo-1531403009284-440f080d1e12?w=800&auto=format&fit=crop&q=80',
        createdAt: new Date(Date.now() - 1000 * 60 * 5).toISOString(),
      }
    ]
  },
  {
    id: 'c2',
    name: '開発プロジェクト連絡',
    type: 'group',
    participants: [currentUser, approverUser, user2, user3],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    messages: [
      {
        id: 'm3',
        sender: approverUser,
        content: '新機能のデプロイ作業が完了しました。各担当者様はご確認をお願いします。',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
        type: 'text',
      },
      {
        id: 'm4',
        sender: user3,
        content: 'お疲れ様です！',
        type: 'stamp',
        stampId: 'otsukare',
        stampText: 'お疲れ様です！',
        stampCategory: 'あいさつ',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2.5).toISOString(),
      },
      {
        id: 'm5',
        sender: currentUser,
        content: '確認いたしました。問題なく動作しております！',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
        type: 'text',
      }
    ]
  }
];

export const initialMemos: Memo[] = [
  {
    id: 'memo1',
    fromName: '[モック] 山田 太郎',
    fromCompany: 'A株式会社',
    fromPhone: '090-1234-5678',
    fromEmail: 'yamada@a-corp.co.jp',
    notificationEmail: 'yamamichi@teraoka-ads.co.jp',
    notificationMobileEmail: 'micchy.k@gmail.com',
    targetOffices: ['名古屋'],
    targetDivisions: ['総務'],
    toUsers: [currentUser, user2],
    toUser: currentUser,
    requirementType: 'please_call_back',
    requirementText: '折り返し連絡下さい',
    content: '[モック] 新システムの見積もり内容とスケジュールについて確認のご連絡でした。折り返しお電話をお願いします。',
    status: 'unread',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
    createdByUser: user3,
    recipientStatuses: [
      {
        userId: currentUser.id,
        userName: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
        department: currentUser.department,
        office: currentUser.office,
        division: currentUser.division,
        isViewed: true,
        viewedAt: new Date(Date.now() - 1000 * 60 * 30).toISOString(),
        isHandled: false,
      },
      {
        userId: user2.id,
        userName: user2.name,
        avatarUrl: user2.avatarUrl,
        department: user2.department,
        office: user2.office,
        division: user2.division,
        isViewed: false,
        isHandled: false,
      }
    ]
  },
  {
    id: 'memo2',
    fromName: '鈴木 次郎',
    fromCompany: '中部テクノロジー株式会社',
    fromPhone: '052-999-8877',
    fromEmail: 'suzuki@chubu-tech.jp',
    targetOffices: ['浜松営業所', '静岡営業所'],
    targetDivisions: ['営業', '保守営業'],
    toUsers: [user3, user5],
    requirementType: 'has_message',
    requirementText: '伝言があります',
    content: '来週月曜の打ち合わせの資料を先ほどメールでお送りしたとのことです。内容のご確認をお願いします。',
    status: 'handled',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    createdByUser: approverUser,
    recipientStatuses: [
      {
        userId: user3.id,
        userName: user3.name,
        avatarUrl: user3.avatarUrl,
        department: user3.department,
        office: user3.office,
        division: user3.division,
        isViewed: true,
        viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 20).toISOString(),
        isHandled: true,
        handledAt: new Date(Date.now() - 1000 * 60 * 60 * 18).toISOString(),
        handledByUserId: user3.id,
        handledByUserName: user3.name,
      },
      {
        userId: user5.id,
        userName: user5.name,
        avatarUrl: user5.avatarUrl,
        department: user5.department,
        office: user5.office,
        division: user5.division,
        isViewed: true,
        viewedAt: new Date(Date.now() - 1000 * 60 * 60 * 22).toISOString(),
        isHandled: true,
        handledAt: new Date(Date.now() - 1000 * 60 * 60 * 19).toISOString(),
        handledByUserId: user5.id,
        handledByUserName: user5.name,
      }
    ]
  }
];

export const initialReports: DailyReport[] = [
  {
    id: 'r1',
    author: currentUser,
    date: new Date(today.getTime() - 1000 * 60 * 60 * 24).toISOString(),
    tasks: '・新規ポータル画面のUI実装\n・デザインチームとのすり合わせ',
    results: 'UIの基本レイアウトを完成させました。ナビゲーションの動作確認済み。',
    issues: '一部のコンポーネントで再レンダリングが頻発する問題があり、パフォーマンス調整が必要です。',
    tomorrowPlan: 'パフォーマンス改善と、API連携のモック作成に着手します。',
    createdAt: new Date(today.getTime() - 1000 * 60 * 60 * 24 + 1000 * 60 * 60 * 18).toISOString(),
  }
];

export const initialApprovalFlows: ApprovalFlowRule[] = [
  {
    id: 'flow-standard-2step',
    name: '標準2段階承認フロー (上長1次 → 上長2次)',
    description: '一般申請用。申請者の直属上長（一次上長）が一次承認し、その上の上長（二次上長）が二次承認します。',
    targetApplicationType: 'all',
    isDefault: true,
    steps: [
      { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' },
      { stepNumber: 2, approverType: 'supervisor_2', stepName: '二次承認（部門長・二次上長）' },
    ],
  },
  {
    id: 'flow-supervisor-1step',
    name: '直属上長 単独承認フロー (1段階)',
    description: '日常業務や軽微な申請用。申請者の直属上長（一次上長）のみの承認で完了します。',
    targetApplicationType: 'all',
    isDefault: false,
    steps: [
      { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' },
    ],
  },
  {
    id: 'flow-admin-direct',
    name: '特定管理者(田中部長) 直接指定フロー',
    description: '購入申請など高額決裁用。指定された管理者が直接承認します。',
    targetApplicationType: 'purchase_order',
    isDefault: false,
    steps: [
      { stepNumber: 1, approverType: 'specific_user', specificUserId: 'u4', stepName: '一次承認（田中部長）' },
    ],
  },
];

export const initialItemMasters: ItemMaster[] = [
  { id: 'itm-1', code: '16010140', name: 'M3戸車セット', category: '補充', defaultUnitPrice: 2105 },
  { id: 'itm-2', code: '16010130', name: 'M3ガイド', category: '補充', defaultUnitPrice: 472 },
  { id: 'itm-3', code: '16010110', name: 'M31ケ用', category: '補充', defaultUnitPrice: 695 },
  { id: 'itm-4', code: '16010080', name: 'H1戸車', category: '補充', defaultUnitPrice: 772 },
  { id: 'itm-5', code: '16010070', name: 'H1硬質戸車', category: '補充', defaultUnitPrice: 1505 },
  { id: 'itm-6', code: '16010210', name: '60φ硬質戸車（青）', category: '補充', defaultUnitPrice: 1510 },
  { id: 'itm-7', code: '16010010', name: 'D3用戸車セット', category: '補充', defaultUnitPrice: 2105 },
  { id: 'itm-8', code: '16010020', name: 'D3用1ヶ戸車', category: '補充', defaultUnitPrice: 695 },
  { id: 'itm-9', code: '16010320', name: '円形戸車', category: '補充', defaultUnitPrice: 1510 },
  { id: 'itm-10', code: '16010150', name: 'TFM戸車', category: '補充', defaultUnitPrice: 1250 },
  { id: 'itm-11', code: '16010100', name: 'LTM戸車', category: '補充', defaultUnitPrice: 2155 },
  { id: 'itm-12', code: '16000160', name: 'TAS戸車（R-35WN）', category: '補充', defaultUnitPrice: 0 },
  { id: 'itm-13', code: '0502013E', name: '電気錠 EL-7SN2-L', category: '補充', defaultUnitPrice: 0 },
  { id: 'itm-14', code: '04020040', name: 'VベルトA-300', category: '補充', defaultUnitPrice: 0 },
  { id: 'itm-15', code: '04020020', name: 'VベルトA-190', category: '補充', defaultUnitPrice: 0 },
  { id: 'itm-16', code: '04020010', name: 'VベルトA-150', category: '補充', defaultUnitPrice: 0 },
  { id: 'itm-17', code: '00000000', name: 'ベルトハサミVベルト用', category: '補充', defaultUnitPrice: 0 },
  { id: 'itm-18', code: '32131780', name: 'ＨＷ-300Ｒ', category: '補充', defaultUnitPrice: 7600 },
  { id: 'itm-19', code: '32131760', name: 'HW-500T', category: '補充', defaultUnitPrice: 5800 },
  { id: 'itm-20', code: '32131770', name: 'HW-500S', category: '補充', defaultUnitPrice: 2500 },
  { id: 'itm-21', code: '3210107P', name: 'OA-72V（W）', category: '補充', defaultUnitPrice: 10600 },
  { id: 'itm-22', code: '3210195S', name: 'OA-215V,S', category: '補充', defaultUnitPrice: 7800 },
  { id: 'itm-23', code: '32100470', name: '補助光線スイッチ OS-10P', category: '補充', defaultUnitPrice: 4900 },
  { id: 'itm-24', code: '32100500', name: '補助光ヘッド SH-5M', category: '補充', defaultUnitPrice: 2700 },
];



