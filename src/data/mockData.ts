import { Post, User, CalendarEvent, WorkflowApplication, BoardTopic, ChatRoom, Memo, DailyReport, OfficeMaster, DivisionMaster, PositionMaster } from '../types';

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
};

export const allUsers: User[] = [currentUser, approverUser, user2, user3, user5];

const today = new Date();
today.setHours(0, 0, 0, 0);

export const initialPosts: Post[] = [
  {
    id: 'p1',
    author: currentUser,
    content: '新しいプロジェクトのデザインモックが完成しました。フィードバックをお願いします！\n\nデザインファイルはNASの共有フォルダに保存しています。',
    tags: ['デザイン', '新プロジェクト'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
    likes: 5,
    isLiked: false,
    nasLink: '\\\\nas01\\Shared\\Projects\\NewPortal\\design_mock_v1.fig'
  },
  {
    id: 'p2',
    author: user3,
    content: '来週の営業会議の資料、NASの営業部フォルダにアップロードしました。各自事前に目を通しておいてください。',
    tags: ['営業会議', '資料'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
    likes: 2,
    isLiked: true,
    nasLink: '\\\\nas01\\Sales\\Meetings\\2026-07\\materials.pdf'
  },
  {
    id: 'p3',
    author: approverUser,
    content: '今期の目標達成に向けたキックオフミーティングお疲れ様でした。議事録を展開します。',
    tags: ['全社', '議事録'],
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    likes: 12,
    isLiked: true,
  },
];

export const initialEvents: CalendarEvent[] = [
  {
    id: 'e1',
    title: '全社キックオフミーティング',
    start: new Date(today.getTime() + 1000 * 60 * 60 * 10).toISOString(),
    end: new Date(today.getTime() + 1000 * 60 * 60 * 12).toISOString(),
    type: 'company',
    office: '全社',
    division: '全部署',
    location: '大会議室A / Zoom',
    attendees: [currentUser, approverUser, user2, user3],
    memo: 'Q3の業績報告とQ4の目標設定について',
    isGoogleSynced: true,
  },
  {
    id: 'e2',
    title: 'デザインレビュー',
    start: new Date(today.getTime() + 1000 * 60 * 60 * 14).toISOString(),
    end: new Date(today.getTime() + 1000 * 60 * 60 * 15).toISOString(),
    type: 'team',
    office: '本社',
    division: '設計',
    location: 'オンライン',
    url: 'https://meet.google.com/xxx-xxxx-xxx',
    attendees: [currentUser, user2],
    memo: '進捗確認とブロッカーの共有',
    isGoogleSynced: true,
  },
  {
    id: 'e3',
    title: '1on1 面談',
    start: new Date(today.getTime() + 1000 * 60 * 60 * 16).toISOString(),
    end: new Date(today.getTime() + 1000 * 60 * 60 * 16.5).toISOString(),
    type: 'personal',
    office: '本社',
    division: '管理',
    location: 'ミーティングブース1',
    attendees: [currentUser, approverUser],
    isGoogleSynced: false,
  },
  {
    id: 'e6',
    title: '【出張】開発者カンファレンス参加（承認済）',
    start: new Date(today.getTime() + 1000 * 60 * 60 * (24 * 5 + 9)).toISOString(),
    end: new Date(today.getTime() + 1000 * 60 * 60 * (24 * 7 + 18)).toISOString(),
    type: 'personal',
    office: '本社',
    division: '設計',
    location: '東京ビッグサイト',
    attendees: [currentUser],
    memo: 'ワークフローにて承認済みの出張。カンファレンス参加後、レポート提出予定。',
    isGoogleSynced: true,
  }
];

export const initialApplications: WorkflowApplication[] = [
  {
    id: 'a1',
    type: 'business_trip',
    title: '開発者カンファレンス参加に伴う出張申請',
    description: '最新のWeb技術トレンド把握のため、年次カンファレンスに参加します。',
    applicant: currentUser,
    approver: approverUser,
    status: 'approved',
    amount: 50000,
    startDate: new Date(today.getTime() + 1000 * 60 * 60 * (24 * 5)).toISOString(),
    endDate: new Date(today.getTime() + 1000 * 60 * 60 * (24 * 7)).toISOString(),
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 3).toISOString(),
  },
  {
    id: 'a2',
    type: 'purchase_order',
    title: '新規テスト端末（検証用スマホ）の購入',
    description: 'モバイル対応の検証に必要となる最新のiOS/Android端末を購入します。',
    applicant: currentUser,
    approver: approverUser,
    status: 'pending',
    amount: 250000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 5).toISOString(),
  },
  {
    id: 'a3',
    type: 'inventory_issue',
    title: '営業用パンフレット（最新版）出庫',
    description: '来週の展示会で配布するためのパンフレット補充。',
    applicant: currentUser,
    approver: approverUser,
    status: 'pending',
    quantity: 500,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 2).toISOString(),
  },
  {
    id: 'a4',
    type: 'other',
    title: 'リモートワーク環境整備補助の申請',
    description: '外部モニター購入費用の補助申請',
    applicant: currentUser,
    approver: approverUser,
    status: 'rejected',
    amount: 40000,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 10).toISOString(),
  }
];

export const initialTopics: BoardTopic[] = [
  {
    id: 't1',
    category: 'general',
    title: '【重要】夏季休業および有給休暇推奨日のご案内',
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
    fromName: '山田 太郎',
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
    content: '新システムの見積もり内容とスケジュールについて確認のご連絡でした。折り返しお電話をお願いします。',
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
