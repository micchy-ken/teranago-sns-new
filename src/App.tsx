import React, { useState, useEffect } from 'react';
import { Header } from './components/Header';
import { Sidebar, AppTab } from './components/Sidebar';
import { Timeline } from './components/Timeline';
import { Calendar } from './components/Calendar';
import { Workflow } from './components/Workflow';
import { Board } from './components/Board';
import { Chat } from './components/Chat';
import { MemoList } from './components/MemoList';
import { DailyReportView } from './components/DailyReport';
import { MyPage } from './components/MyPage';
import { AdminPanel } from './components/AdminPanel';
import { LoginScreen } from './components/LoginScreen';
import { 
  initialPosts, 
  initialEvents, 
  initialApplications, 
  initialTopics,
  initialChatRooms,
  initialMemos,
  initialReports,
  currentUser as defaultCurrentUser,
  allUsers as defaultAllUsers,
  initialOffices,
  initialDivisions,
  initialPositions,
  initialApprovalFlows,
  initialItemMasters
} from './data/mockData';
import { Post, CalendarEvent, WorkflowApplication, User, OfficeMaster, DivisionMaster, PositionMaster, BoardTopic, ChatRoom, ApprovalFlowRule, ApprovalStepConfig, ItemMaster, ApplicationStatus } from './types';

// Helper to map and sanitize API user objects to match frontend types safely
const mapUserFromApi = (apiUser: any): User => {
  const isAdmin = apiUser.isAdmin === true || apiUser.role === 'admin';
  return {
    ...apiUser,
    id: String(apiUser.id),
    name: apiUser.name || '名前未設定',
    avatarUrl: apiUser.avatarUrl || 'https://i.pravatar.cc/150',
    department: apiUser.department || '未設定',
    office: apiUser.office || undefined,
    division: apiUser.division || undefined,
    position: apiUser.position || undefined,
    role: isAdmin ? 'admin' : 'user',
    isAdmin: isAdmin,
  };
};

// Helper to map and sanitize API posts to match frontend types safely
const mapPostFromApi = (apiPost: any, allUsers: User[]): Post => {
  let authorUser: User | undefined = undefined;

  if (apiPost.author && typeof apiPost.author === 'object') {
    authorUser = apiPost.author;
  } else if (apiPost.authorId) {
    authorUser = allUsers.find(u => u.id === apiPost.authorId);
  }

  if (!authorUser) {
    authorUser = {
      id: apiPost.authorId || (apiPost.author && apiPost.author.id) || 'unknown',
      name: (apiPost.author && apiPost.author.name) || '匿名',
      department: (apiPost.author && apiPost.author.department) || '未設定',
      avatarUrl: (apiPost.author && apiPost.author.avatarUrl) || 'https://i.pravatar.cc/150',
    };
  }

  return {
    id: String(apiPost.id),
    author: {
      ...authorUser,
      id: String(authorUser.id),
      avatarUrl: authorUser.avatarUrl || 'https://i.pravatar.cc/150',
      department: authorUser.department || '未設定',
    },
    content: apiPost.content || '',
    tags: Array.isArray(apiPost.tags) ? apiPost.tags : [],
    createdAt: apiPost.createdAt || new Date().toISOString(),
    likes: typeof apiPost.likes === 'number' ? apiPost.likes : 0,
    isLiked: !!apiPost.isLiked,
    nasLink: apiPost.nasLink || undefined,
  };
};

export default function App() {
  const [usersList, setUsersList] = useState<User[]>(defaultAllUsers);

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('is_logged_in') === 'true';
  });

  const [userState, setUserState] = useState<User>(() => {
    const savedUserId = localStorage.getItem('logged_in_user_id');
    if (savedUserId) {
      const found = defaultAllUsers.find(u => u.id === savedUserId);
      if (found) return found;
    }
    return defaultCurrentUser;
  });

  const handleLogin = (user: User) => {
    setUserState(user);
    setIsAuthenticated(true);
    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('logged_in_user_id', user.id);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('is_logged_in');
    localStorage.removeItem('logged_in_user_id');
  };

  const [activeTab, setActiveTab] = useState<AppTab>('mypage');
  const [offices, setOffices] = useState<OfficeMaster[]>(initialOffices);
  const [divisions, setDivisions] = useState<DivisionMaster[]>(initialDivisions);
  const [positions, setPositions] = useState<PositionMaster[]>(initialPositions);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlowRule[]>(initialApprovalFlows);
  const [itemMasters, setItemMasters] = useState<ItemMaster[]>(initialItemMasters);

  // Item Master Handlers
  const handleAddItemMaster = (item: Omit<ItemMaster, 'id'>) => {
    const newItem: ItemMaster = {
      ...item,
      id: `itm_${Date.now()}`
    };
    setItemMasters([...itemMasters, newItem]);
  };

  const handleUpdateItemMaster = (updatedItem: ItemMaster) => {
    setItemMasters(itemMasters.map(i => i.id === updatedItem.id ? updatedItem : i));
  };

  const handleDeleteItemMaster = (id: string) => {
    setItemMasters(itemMasters.filter(i => i.id !== id));
  };
  
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);
  const [postsSource, setPostsSource] = useState<'api' | 'mock'>('mock');

  const refetchPosts = async (currentUsers = usersList) => {
    setIsPostsLoading(true);
    setPostsError(null);
    try {
      const response = await fetch('https://sns.teranago.synology.me/api/posts', {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const mapped = data.map(p => mapPostFromApi(p, currentUsers));
        setPosts(mapped);
        setPostsSource('api');
        setPostsError(null);
      } else {
        throw new Error('Received posts data is not an array');
      }
    } catch (err: any) {
      console.warn('Failed to load posts from API:', err);
      setPostsError(err?.message || 'Failed to sync with API. Check connectivity.');
      setPostsSource('mock');
      setPosts(initialPosts); // fallback to initial posts
    } finally {
      setIsPostsLoading(false);
    }
  };

  const refetchUsers = async () => {
    try {
      const response = await fetch('https://sns.teranago.synology.me/api/users', {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const processedUsers = data.map((u: any) => mapUserFromApi(u));
        setUsersList(processedUsers);

        // Synchronize logged-in user with the latest data from the database
        const savedUserId = localStorage.getItem('logged_in_user_id');
        const targetId = savedUserId || userState?.id;
        if (targetId) {
          const found = processedUsers.find(u => u.id === String(targetId));
          if (found) {
            setUserState(found);
          }
        }
        return processedUsers;
      }
    } catch (err) {
      console.warn('Failed to load users from API:', err);
    }
    return usersList;
  };

  const refetchAll = async () => {
    const latestUsers = await refetchUsers();
    await refetchPosts(latestUsers);
  };

  useEffect(() => {
    // Always load latest users from API on mount
    refetchUsers().then((latestUsers) => {
      if (isAuthenticated) {
        refetchPosts(latestUsers);
      }
    });
  }, [isAuthenticated]);

  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [applications, setApplications] = useState<WorkflowApplication[]>(initialApplications);
  const [topics, setTopics] = useState<BoardTopic[]>(initialTopics);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>(initialChatRooms);
  const [memos, setMemos] = useState(initialMemos);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Board Handlers
  const handleAddTopic = (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => {
    const newTopic: BoardTopic = {
      ...topicData,
      id: `t${Date.now()}`,
      createdAt: new Date().toISOString(),
      views: 0,
      commentsCount: 0,
    };
    setTopics([newTopic, ...topics]);
  };

  const handleUpdateTopic = (updatedTopic: BoardTopic) => {
    setTopics(topics.map(t => t.id === updatedTopic.id ? updatedTopic : t));
  };

  if (!isAuthenticated) {
    return <LoginScreen users={usersList} onLogin={handleLogin} />;
  }

  // Switch active user for testing permissions
  const handleSwitchUser = (user: User) => {
    setUserState(user);
    localStorage.setItem('logged_in_user_id', user.id);
  };

  // User Management
  const handleAddUser = async (userData: Omit<User, 'id'>) => {
    const tempId = `u-${Date.now()}`;
    const newUser: User = {
      ...userData,
      id: tempId,
    };
    // Optimistic UI update
    setUsersList(prev => [...prev, newUser]);

    try {
      console.log('Attempting to create user via POST to /api/users...');
      const response = await fetch('https://sns.teranago.synology.me/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(newUser),
      });

      if (response.ok) {
        console.log('User successfully created on server.');
        await refetchUsers();
      } else {
        const errText = await response.text().catch(() => '');
        console.error(`POST /api/users failed with status ${response.status}: ${errText}`);
        alert(`ユーザー作成に失敗しました。\nAPIサーバーがエラーを返しました (Status ${response.status}): ${errText || 'Unknown error'}`);
        // Rollback state since creation failed
        await refetchUsers();
      }
    } catch (err: any) {
      console.error('Failed to create user via API:', err);
      alert(`API通信エラーが発生しました: ${err?.message || '接続に失敗しました'}`);
      await refetchUsers();
    }
  };

  const handleUpdateUser = async (updatedUser: User) => {
    // Keep a copy of the old state for safe rollback
    const oldUsersList = [...usersList];
    const oldUserState = { ...userState };

    // Optimistically update GUI state instantly
    setUsersList(prev => prev.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    if (updatedUser.id === userState.id) {
      setUserState(updatedUser);
    }

    try {
      const urlWithId = `https://sns.teranago.synology.me/api/users/${updatedUser.id}`;
      console.log(`Attempting update: PUT to ${urlWithId}...`);
      let response = await fetch(urlWithId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(updatedUser),
      });

      if (!response.ok) {
        console.warn(`PUT /api/users/:id failed with status ${response.status}. Trying POST fallback...`);
        // Fallback 1: POST /api/users/:id
        response = await fetch(urlWithId, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(updatedUser),
        });
      }

      if (!response.ok) {
        console.warn(`POST /api/users/:id failed with status ${response.status}. Trying PUT to /api/users...`);
        // Fallback 2: PUT /api/users
        response = await fetch('https://sns.teranago.synology.me/api/users', {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(updatedUser),
        });
      }

      if (!response.ok) {
        console.warn(`PUT /api/users failed with status ${response.status}. Trying POST to /api/users...`);
        // Fallback 3: POST /api/users (many simple APIs accept POST here to insert or update)
        response = await fetch('https://sns.teranago.synology.me/api/users', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(updatedUser),
        });
      }

      if (response.ok) {
        console.log('User successfully updated in backend DB.');
        await refetchUsers();
      } else {
        const errText = await response.text().catch(() => '');
        console.error(`All fallback updates failed. Last status: ${response.status}: ${errText}`);
        alert(`ユーザー情報の更新に失敗しました。\nAPIサーバーがエラーを返しました (Status ${response.status}): ${errText || 'Unknown error'}`);
        // Rollback on failure to prevent stale UI mismatch
        setUsersList(oldUsersList);
        setUserState(oldUserState);
      }
    } catch (err: any) {
      console.error('Failed to update user via API:', err);
      alert(`API通信エラーが発生しました: ${err?.message || '接続に失敗しました'}`);
      setUsersList(oldUsersList);
      setUserState(oldUserState);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('このユーザーを削除してもよろしいですか？')) return;

    const oldUsersList = [...usersList];
    setUsersList(prev => prev.filter((u) => u.id !== userId));

    try {
      console.log(`Attempting to delete user via DELETE on /api/users/${userId}...`);
      let response = await fetch(`https://sns.teranago.synology.me/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!response.ok) {
        // Fallback POST to /api/users/:id/delete or custom DELETE path if needed
        console.warn(`DELETE /api/users/:id failed with status ${response.status}`);
      }

      if (response.ok) {
        console.log('User successfully deleted from server DB.');
        await refetchUsers();
      } else {
        const errText = await response.text().catch(() => '');
        alert(`ユーザー削除に失敗しました。\nAPIサーバーがエラーを返しました (Status ${response.status}): ${errText || 'Unknown error'}`);
        setUsersList(oldUsersList);
      }
    } catch (err: any) {
      console.error('Failed to delete user via API:', err);
      alert(`API通信エラーが発生しました: ${err?.message || '接続に失敗しました'}`);
      setUsersList(oldUsersList);
    }
  };

  const handleToggleUserAdmin = async (userId: string) => {
    let targetUser: User | undefined;
    const oldUsersList = [...usersList];
    const oldUserState = { ...userState };

    setUsersList(prev => prev.map(u => {
      if (u.id === userId) {
        const updatedIsAdmin = !u.isAdmin;
        const updated = { ...u, isAdmin: updatedIsAdmin, role: (updatedIsAdmin ? 'admin' : 'user') as 'admin' | 'user' };
        if (u.id === userState.id) {
          setUserState(updated);
        }
        targetUser = updated;
        return updated;
      }
      return u;
    }));

    if (targetUser) {
      try {
        console.log(`Attempting to toggle admin status for user ${userId}...`);
        const urlWithId = `https://sns.teranago.synology.me/api/users/${userId}`;
        let response = await fetch(urlWithId, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(targetUser),
        });

        if (!response.ok) {
          response = await fetch('https://sns.teranago.synology.me/api/users', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(targetUser),
          });
        }

        if (response.ok) {
          console.log('User admin status successfully updated.');
          await refetchUsers();
        } else {
          const errText = await response.text().catch(() => '');
          alert(`管理者権限の変更に失敗しました。\nAPIサーバーがエラーを返しました (Status ${response.status}): ${errText || 'Unknown error'}`);
          setUsersList(oldUsersList);
          setUserState(oldUserState);
        }
      } catch (err: any) {
        console.error('Failed to toggle admin status:', err);
        alert(`API通信エラーが発生しました: ${err?.message || '接続に失敗しました'}`);
        setUsersList(oldUsersList);
        setUserState(oldUserState);
      }
    }
  };

  // Office Master Handlers
  const handleAddOffice = (officeData: Omit<OfficeMaster, 'id'>) => {
    const newOffice: OfficeMaster = {
      ...officeData,
      id: `off-${Date.now()}`,
    };
    setOffices([...offices, newOffice]);
  };

  const handleUpdateOffice = (updatedOffice: OfficeMaster) => {
    setOffices(offices.map((o) => (o.id === updatedOffice.id ? updatedOffice : o)));
  };

  const handleDeleteOffice = (officeId: string) => {
    setOffices(offices.filter((o) => o.id !== officeId));
  };

  // Division Master Handlers
  const handleAddDivision = (divisionData: Omit<DivisionMaster, 'id'>) => {
    const newDivision: DivisionMaster = {
      ...divisionData,
      id: `div-${Date.now()}`,
    };
    setDivisions([...divisions, newDivision]);
  };

  const handleUpdateDivision = (updatedDivision: DivisionMaster) => {
    setDivisions(divisions.map((d) => (d.id === updatedDivision.id ? updatedDivision : d)));
  };

  const handleDeleteDivision = (divisionId: string) => {
    setDivisions(divisions.filter((d) => d.id !== divisionId));
  };

  // Position Master Handlers
  const handleAddPosition = (positionData: Omit<PositionMaster, 'id'>) => {
    const newPosition: PositionMaster = {
      ...positionData,
      id: `pos-${Date.now()}`,
    };
    setPositions([...positions, newPosition]);
  };

  const handleUpdatePosition = (updatedPosition: PositionMaster) => {
    setPositions(positions.map((p) => (p.id === updatedPosition.id ? updatedPosition : p)));
  };

  const handleDeletePosition = (positionId: string) => {
    setPositions(positions.filter((p) => p.id !== positionId));
  };

  // Handle new post creation with API
  const handlePost = async (content: string, tags: string[], nasLink?: string) => {
    // Optimistic local post for instant response
    const tempId = `p-temp-${Date.now()}`;
    const newPost: Post = {
      id: tempId,
      author: userState,
      content,
      tags,
      createdAt: new Date().toISOString(),
      likes: 0,
      isLiked: false,
      nasLink,
    };
    setPosts(prev => [newPost, ...prev]);

    try {
      const response = await fetch('https://sns.teranago.synology.me/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          authorId: userState.id,
          content,
          tags,
          nasLink: nasLink || "",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create post: HTTP status ${response.status}`);
      }

      // Refetch posts to get the actual server-saved posts with correct IDs
      await refetchAll();
    } catch (err) {
      console.error('Error creating post on API:', err);
      // Fallback: keep the local post or trigger refetch
      await refetchAll();
    }
  };

  // Handle like toggle with API
  const handleToggleLike = async (postId: string) => {
    if (postId.startsWith('p-temp-')) return;

    // Optimistically update local state
    setPosts(prev => prev.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          isLiked: !post.isLiked,
          likes: post.isLiked ? Math.max(0, post.likes - 1) : post.likes + 1,
        };
      }
      return post;
    }));

    try {
      const response = await fetch(`https://sns.teranago.synology.me/api/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to like: HTTP status ${response.status}`);
      }
      
      const updatedPostData = await response.json();
      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          return mapPostFromApi(updatedPostData, usersList);
        }
        return post;
      }));
    } catch (err) {
      console.error('Error liking post on API:', err);
      await refetchAll();
    }
  };

  // Handle delete post with API
  const handleDeletePost = async (postId: string) => {
    if (postId.startsWith('p-temp-')) return;

    if (!window.confirm('この投稿を削除してもよろしいですか？')) return;

    // Optimistically remove from state
    setPosts(prev => prev.filter(post => post.id !== postId));

    try {
      const response = await fetch(`https://sns.teranago.synology.me/api/posts/${postId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
        }
      });

      if (!response.ok) {
        throw new Error(`Failed to delete: HTTP status ${response.status}`);
      }

      await refetchAll();
    } catch (err) {
      console.error('Error deleting post on API:', err);
      await refetchAll();
    }
  };

  // Handle new event creation
  const handleAddEvent = (eventData: Omit<CalendarEvent, 'id'>) => {
    const newEvent: CalendarEvent = {
      ...eventData,
      id: `e${Date.now()}`
    };
    setEvents([...events, newEvent]);
  };

  // Handle event update
  const handleUpdateEvent = (updatedEvent: CalendarEvent) => {
    setEvents(events.map(e => e.id === updatedEvent.id ? updatedEvent : e));
  };

  // Handle event deletion
  const handleDeleteEvent = (eventId: string) => {
    setEvents(events.filter(e => e.id !== eventId));
  };

  // 承認フロー マスター管理
  const handleAddApprovalFlow = (flowData: Omit<ApprovalFlowRule, 'id'>) => {
    const newFlow: ApprovalFlowRule = {
      ...flowData,
      id: `flow-${Date.now()}`,
    };
    setApprovalFlows([...approvalFlows, newFlow]);
  };

  const handleUpdateApprovalFlow = (updatedFlow: ApprovalFlowRule) => {
    setApprovalFlows(approvalFlows.map(f => f.id === updatedFlow.id ? updatedFlow : f));
  };

  const handleDeleteApprovalFlow = (id: string) => {
    setApprovalFlows(approvalFlows.filter(f => f.id !== id));
  };

  // 申請者から N 階層目の上長を辿るヘルパー関数 (level=1: 1次上長, level=2: 2次上長...)
  const getSupervisorAtLevel = (applicant: User, targetLevel: number, users: User[]): User | null => {
    let curr: User | undefined = applicant;
    for (let i = 0; i < targetLevel; i++) {
      if (!curr || !curr.supervisorId) {
        // 指定された階層の上長が存在しない場合は最後に辿れた上長を保持
        break;
      }
      const sup = users.find(u => u.id === curr.supervisorId);
      if (!sup) break;
      curr = sup;
    }
    return (curr && curr.id !== applicant.id) ? curr : null;
  };

  // ステップ設定に基づき具体的な承認者を動的解決する関数
  const resolveApproverForStep = (applicant: User, stepConfig: ApprovalStepConfig, users: User[]): User => {
    if (stepConfig.approverType === 'specific_user' && stepConfig.specificUserId) {
      const found = users.find(u => u.id === stepConfig.specificUserId);
      if (found) return found;
    }

    let targetLevel = stepConfig.supervisorLevel;
    if (!targetLevel) {
      if (stepConfig.approverType === 'supervisor_1') targetLevel = 1;
      else if (stepConfig.approverType === 'supervisor_2') targetLevel = 2;
      else targetLevel = stepConfig.stepNumber || 1;
    }

    const sup = getSupervisorAtLevel(applicant, targetLevel, users);
    if (sup) return sup;

    // 該当階層の上長未登録時のフォールバック (直近の上長、または管理者)
    const fallbackSup = getSupervisorAtLevel(applicant, 1, users);
    return fallbackSup || users.find(u => u.id === 'u4' || u.isAdmin) || users[0];
  };

  // Handle new workflow application
  const handleAddApplication = (appData: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { status?: ApplicationStatus }) => {
    // 送信データに承認フローが指定されていればそれを優先、なければ自動検索
    let selectedFlow = approvalFlows.find(f => f.id === appData.flowId);
    if (!selectedFlow) {
      selectedFlow = approvalFlows.find(f => f.targetApplicationType === appData.type) 
        || approvalFlows.find(f => f.isDefault) 
        || approvalFlows[0];
    }

    const stepsConfig = appData.stepsConfig && appData.stepsConfig.length > 0 
      ? appData.stepsConfig 
      : (selectedFlow ? selectedFlow.steps : [
          { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' }
        ]);

    const initialApprover = appData.approver || resolveApproverForStep(appData.applicant, stepsConfig[0], usersList);

    const newApp: WorkflowApplication = {
      ...appData,
      id: `a${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: appData.status || 'pending',
      approver: initialApprover,
      flowId: appData.flowId || selectedFlow?.id,
      flowName: appData.flowName || selectedFlow?.name || '標準承認フロー',
      currentStepIndex: 1,
      totalSteps: stepsConfig.length,
      stepsConfig: stepsConfig,
      history: [],
    };
    setApplications([newApp, ...applications]);
  };

  // Handle workflow approval / rejection (Multi-step approval processing)
  const handleWorkflowAction = (id: string, actionStatus: 'approved' | 'rejected', comment?: string) => {
    setApplications(prevApps => prevApps.map(app => {
      if (app.id !== id) return app;

      if (actionStatus === 'rejected') {
        return {
          ...app,
          status: 'rejected',
          rejectReason: comment || '理由未記入',
          history: [
            ...(app.history || []),
            {
              stepNumber: app.currentStepIndex || 1,
              approver: userState,
              status: 'rejected',
              actionAt: new Date().toISOString(),
              comment: comment,
            }
          ]
        };
      }

      // 承認アクション (actionStatus === 'approved')
      const currentStep = app.currentStepIndex || 1;
      const stepsConfig = (app.stepsConfig && app.stepsConfig.length > 0) ? app.stepsConfig : null;
      // stepsConfig が存在する場合はその長さ、無ければ app.totalSteps
      const totalSteps = stepsConfig ? stepsConfig.length : (app.totalSteps || 1);

      // 次の承認ステップ（2次承認、3次承認...）が存在する場合
      if (currentStep < totalSteps && stepsConfig) {
        const nextStepConfig = stepsConfig[currentStep]; // 0-indexed で currentStep 番目 (e.g., currentStep=1 なら 2番目のステップ)
        const nextApprover = resolveApproverForStep(app.applicant, nextStepConfig, usersList);

        return {
          ...app,
          currentStepIndex: currentStep + 1,
          totalSteps: totalSteps,
          approver: nextApprover,
          status: 'pending',
          history: [
            ...(app.history || []),
            {
              stepNumber: currentStep,
              approver: userState,
              status: 'approved',
              actionAt: new Date().toISOString(),
              comment: comment,
            }
          ]
        };
      }

      // 最終ステップ（全段階完了）の承認
      return {
        ...app,
        status: 'approved',
        currentStepIndex: totalSteps,
        totalSteps: totalSteps,
        history: [
          ...(app.history || []),
          {
            stepNumber: currentStep,
            approver: userState,
            status: 'approved',
            actionAt: new Date().toISOString(),
            comment: comment,
          }
        ]
      };
    }));
  };

  // 申請の更新（再申請、下書き保存、取り下げ等）
  const handleUpdateApplication = (updatedApp: WorkflowApplication) => {
    setApplications(prevApps => prevApps.map(app => {
      if (app.id !== updatedApp.id) return app;

      // updatedApp.status が明示的に 'draft' 等の場合はそれを維持、それ以外（再提出等）は 'pending'
      const targetStatus = updatedApp.status ? updatedApp.status : 'pending';

      let selectedFlow = approvalFlows.find(f => f.id === updatedApp.flowId);
      if (!selectedFlow) {
        selectedFlow = approvalFlows.find(f => f.targetApplicationType === updatedApp.type) 
          || approvalFlows.find(f => f.isDefault) 
          || approvalFlows[0];
      }

      const stepsConfig = updatedApp.stepsConfig && updatedApp.stepsConfig.length > 0 
        ? updatedApp.stepsConfig 
        : (selectedFlow ? selectedFlow.steps : [
            { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' }
          ]);

      const initialApprover = updatedApp.approver || resolveApproverForStep(updatedApp.applicant, stepsConfig[0], usersList);

      const isSubmittingFromDraftOrReject = (app.status === 'draft' || app.status === 'rejected') && targetStatus === 'pending';

      return {
        ...updatedApp,
        status: targetStatus,
        rejectReason: targetStatus === 'pending' ? undefined : updatedApp.rejectReason,
        currentStepIndex: targetStatus === 'pending' ? 1 : updatedApp.currentStepIndex,
        totalSteps: stepsConfig.length,
        stepsConfig: stepsConfig,
        approver: initialApprover,
        flowId: updatedApp.flowId || selectedFlow?.id,
        flowName: updatedApp.flowName || selectedFlow?.name || '標準承認フロー',
        history: isSubmittingFromDraftOrReject ? [
          ...(app.history || []),
          {
            stepNumber: 0,
            approver: userState,
            status: 'approved',
            actionAt: new Date().toISOString(),
            comment: app.status === 'draft' ? '下書きから申請提出' : '内容を修正して再申請提出'
          }
        ] : (updatedApp.history || app.history || [])
      };
    }));
  };

  // 申請の削除処理
  const handleDeleteApplication = (applicationId: string) => {
    setApplications(prevApps => prevApps.filter(app => app.id !== applicationId));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden" style={{ backgroundColor: '#f8fafc' }}>
      <Header 
        searchQuery={searchQuery} 
        onSearchChange={setSearchQuery} 
        currentUser={userState}
        allUsers={usersList}
        onSwitchUser={handleSwitchUser}
        onLogout={handleLogout}
      />

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        
        {/* Left Sidebar Column */}
        <aside className="hidden lg:block lg:w-64 shrink-0">
          <Sidebar
            posts={posts}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
            currentUser={userState}
          />
        </aside>

        {/* Main Content Area */}
        {activeTab === 'timeline' && (
          <Timeline 
            posts={posts}
            events={events}
            topics={topics}
            offices={offices}
            divisions={divisions}
            searchQuery={searchQuery}
            selectedTag={selectedTag}
            onPost={handlePost}
            onToggleLike={handleToggleLike}
            onSelectTag={setSelectedTag}
            onChangeTab={setActiveTab}
            isLoading={isPostsLoading}
            error={postsError}
            postsSource={postsSource}
            onRefetchPosts={refetchAll}
            onDeletePost={handleDeletePost}
            currentUser={userState}
          />
        )}
        {activeTab === 'calendar' && (
          <Calendar 
            events={events}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            currentUser={userState}
            allUsers={usersList}
            offices={offices}
            divisions={divisions}
          />
        )}
        {activeTab === 'workflow' && (
          <Workflow 
            applications={applications}
            onAddApplication={handleAddApplication}
            onUpdateApplication={handleUpdateApplication}
            onDeleteApplication={handleDeleteApplication}
            allUsers={usersList}
            currentUser={userState}
            approvalFlows={approvalFlows}
            onWorkflowAction={handleWorkflowAction}
            itemMasters={itemMasters}
          />
        )}
        {activeTab === 'board' && (
          <Board
            topics={topics}
            onAddTopic={handleAddTopic}
            onUpdateTopic={handleUpdateTopic}
            currentUser={userState}
            offices={offices}
            divisions={divisions}
          />
        )}
        {activeTab === 'chat' && (
          <Chat 
            rooms={chatRooms} 
            users={usersList}
            currentUser={userState}
            offices={offices}
            divisions={divisions}
            onUpdateRooms={setChatRooms}
          />
        )}
        {activeTab === 'memo' && (
          <MemoList 
            memos={memos}
            offices={offices}
            divisions={divisions}
            users={usersList}
            currentUser={userState}
            onUpdateMemos={setMemos}
          />
        )}
        {activeTab === 'daily_report' && (
          <DailyReportView reports={initialReports} />
        )}
        {activeTab === 'mypage' && (
          <MyPage 
            user={userState} 
            events={events}
            topics={topics}
            memos={memos}
            applications={applications}
            offices={offices}
            divisions={divisions}
            positions={positions}
            allUsers={usersList}
            onChangeTab={setActiveTab}
            onUpdateUser={handleUpdateUser}
            onUpdateMemo={(updatedMemos) => setMemos(updatedMemos)}
            onUpdateTopic={handleUpdateTopic}
            onUpdateApplication={(updatedApp) => {
              setApplications(applications.map(a => a.id === updatedApp.id ? updatedApp : a));
            }}
          />
        )}
        {activeTab === 'admin' && (
          <AdminPanel 
            currentUser={userState}
            allUsers={usersList}
            offices={offices}
            divisions={divisions}
            positions={positions}
            approvalFlows={approvalFlows}
            itemMasters={itemMasters}
            onAddOffice={handleAddOffice}
            onUpdateOffice={handleUpdateOffice}
            onDeleteOffice={handleDeleteOffice}
            onAddDivision={handleAddDivision}
            onUpdateDivision={handleUpdateDivision}
            onDeleteDivision={handleDeleteDivision}
            onAddPosition={handleAddPosition}
            onUpdatePosition={handleUpdatePosition}
            onDeletePosition={handleDeletePosition}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onToggleUserAdmin={handleToggleUserAdmin}
            onSwitchUser={handleSwitchUser}
            onAddApprovalFlow={handleAddApprovalFlow}
            onUpdateApprovalFlow={handleUpdateApprovalFlow}
            onDeleteApprovalFlow={handleDeleteApprovalFlow}
            onAddItemMaster={handleAddItemMaster}
            onUpdateItemMaster={handleUpdateItemMaster}
            onDeleteItemMaster={handleDeleteItemMaster}
          />
        )}
      </main>
    </div>
  );
}
