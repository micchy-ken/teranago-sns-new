import { Post, User, CalendarEvent, WorkflowApplication, BoardTopic, ChatRoom, Memo, DailyReport } from '../types';

export const currentUser: User = {
  id: 'u1',
  name: '健介',
  department: '開発統括部',
  avatarUrl: 'https://i.pravatar.cc/150?u=u1',
};

const approverUser: User = {
  id: 'u4',
  name: '田中 部長',
  department: '開発統括部',
  avatarUrl: 'https://i.pravatar.cc/150?u=u4',
};

const user2: User = {
  id: 'u2',
  name: '佐藤 デザイン',
  department: 'デザイン部',
  avatarUrl: 'https://i.pravatar.cc/150?u=u2',
};

const user3: User = {
  id: 'u3',
  name: '高橋 営業',
  department: '営業部',
  avatarUrl: 'https://i.pravatar.cc/150?u=u3',
};

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
