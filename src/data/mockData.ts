import { Post, User, CalendarEvent, WorkflowApplication, BoardTopic, ChatRoom, Memo, DailyReport, OfficeMaster, DivisionMaster } from '../types';

export const initialOffices: OfficeMaster[] = [
  {
    id: 'off-1',
    name: '名古屋支店',
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

export const currentUser: User = {
  id: 'u1',
  name: '健介',
  office: '本社',
  division: '設計',
  department: '本社 設計',
  avatarUrl: 'https://i.pravatar.cc/150?u=u1',
  isAdmin: true,
  role: 'admin',
  email: 'kensuke@teranago.co.jp',
  phone: '090-1234-5678',
};

export const approverUser: User = {
  id: 'u4',
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
    title: '夏季休業のお知らせ',
    content: '今年の夏季休業期間は8月13日(金)〜8月16日(月)となります。休業中の緊急連絡先については...',
    author: user3,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 5).toISOString(),
    views: 142,
    commentsCount: 3,
  },
  {
    id: 't2',
    category: 'it',
    title: '社内VPNのメンテナンスについて',
    content: '今週末の日曜日深夜2時〜4時にかけて、社内VPNサーバーのメンテナンスを実施します。',
    author: approverUser,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 48).toISOString(),
    views: 89,
    commentsCount: 0,
  },
  {
    id: 't3',
    category: 'hr',
    title: '秋の健康診断について',
    content: '秋の定期健康診断の予約受付を開始しました。各自指定の医療機関で予約を行ってください。',
    author: approverUser,
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24 * 1).toISOString(),
    views: 45,
    commentsCount: 1,
  }
];

export const initialChatRooms: ChatRoom[] = [
  {
    id: 'c1',
    type: 'dm',
    participants: [currentUser, user2],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
    messages: [
      {
        id: 'm1',
        sender: user2,
        content: '明日のデザインレビューですが、14時からで大丈夫ですか？',
        createdAt: new Date(Date.now() - 1000 * 60 * 20).toISOString(),
      },
      {
        id: 'm2',
        sender: currentUser,
        content: 'はい、大丈夫です！よろしくお願いします。',
        createdAt: new Date(Date.now() - 1000 * 60 * 15).toISOString(),
      }
    ]
  },
  {
    id: 'c2',
    name: '開発チーム共有',
    type: 'group',
    participants: [currentUser, approverUser, user2],
    lastUpdated: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
    messages: [
      {
        id: 'm3',
        sender: approverUser,
        content: 'デプロイ完了しました。確認お願いします。',
        createdAt: new Date(Date.now() - 1000 * 60 * 60 * 3).toISOString(),
      }
    ]
  }
];

export const initialMemos: Memo[] = [
  {
    id: 'memo1',
    fromName: '山田 太郎',
    fromCompany: 'A株式会社',
    toUser: currentUser,
    content: 'システムの見積もりの件でご相談がありました。折り返しお電話をお願いします。（TEL: 090-XXXX-XXXX）',
    status: 'unread',
    createdAt: new Date(Date.now() - 1000 * 60 * 45).toISOString(),
  },
  {
    id: 'memo2',
    fromName: '鈴木 次郎',
    toUser: currentUser,
    content: '来週の打ち合わせの件、メールでお送りした資料をご確認くださいとのことでした。',
    status: 'read',
    createdAt: new Date(Date.now() - 1000 * 60 * 60 * 24).toISOString(),
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
