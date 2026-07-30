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
import { Post, CalendarEvent, WorkflowApplication, User, OfficeMaster, DivisionMaster, PositionMaster, BoardTopic, ChatRoom, ApprovalFlowRule, ApprovalStepConfig, ItemMaster, ApplicationStatus, DailyReport } from './types';

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

  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [applications, setApplications] = useState<WorkflowApplication[]>(initialApplications);
  const [topics, setTopics] = useState<BoardTopic[]>(initialTopics);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>(initialChatRooms);
  const [memos, setMemos] = useState(initialMemos);
  const [reports, setReports] = useState<DailyReport[]>(initialReports);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  const refetchEvents = async (currentUsers = usersList) => {
    try {
      const response = await fetch('https://sns.teranago.synology.me/api/events', {
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const activeUsers = currentUsers.length > 0 ? currentUsers : defaultAllUsers;
          const mapped = data.map((e: any) => {
            let detailsObj: any = {};
            if (e.description && typeof e.description === 'string' && e.description.startsWith('{')) {
              try { detailsObj = JSON.parse(e.description); } catch (_) {}
            }
            
            let rawAttendees = e.attendees || detailsObj.attendees || [];
            if (typeof rawAttendees === 'string') {
              try { rawAttendees = JSON.parse(rawAttendees); } catch (_) {}
            }
            
            const mappedAttendees = Array.isArray(rawAttendees)
              ? rawAttendees.map((att: any) => {
                  if (typeof att === 'object' && att !== null && att.id) return att;
                  const found = activeUsers.find(u => u.id === att || u.id === String(att));
                  return found || { id: String(att), name: String(att), avatarUrl: '', office: '', division: '', department: '', role: 'user' };
                })
              : [];

            return {
              id: String(e.id),
              title: e.title || '予定',
              start: e.startAt || e.start || new Date().toISOString(),
              end: e.endAt || e.end || e.startAt || e.start || new Date().toISOString(),
              isAllDay: e.isAllDay === true || e.isAllDay === 1,
              type: e.category || 'personal',
              office: e.office || '全社',
              division: e.division || '全部署',
              location: e.location || '',
              memo: e.memo || detailsObj.memo || '',
              isGoogleSynced: false,
              ...detailsObj,
              attendees: mappedAttendees
            };
          });
          setEvents(mapped);
        }
      }
    } catch (err) {
      console.warn('Failed to load events from API, keeping local state:', err);
    }
  };

  const refetchApplications = async (currentUsers = usersList) => {
    try {
      const response = await fetch('https://sns.teranago.synology.me/api/workflows', {
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const mapped = data.map((app: any) => {
            let detailsObj: any = {};
            if (app.details && app.details.startsWith('{')) {
              try { detailsObj = JSON.parse(app.details); } catch (_) {}
            }
            const applicantUser = currentUsers.find(u => u.id === app.applicantId) || app.applicant || defaultCurrentUser;
            const approverUserObj = currentUsers.find(u => u.id === app.approverId) || app.approver;
            return {
              id: String(app.id),
              title: app.title,
              applicant: applicantUser,
              approver: approverUserObj,
              status: app.status,
              createdAt: app.createdAt,
              category: app.category || app.type || 'other',
              type: app.category || app.type || 'other',
              ...detailsObj
            };
          });
          setApplications(mapped);
        }
      }
    } catch (err) {
      console.warn('Failed to load workflows from API, keeping local state:', err);
    }
  };

  const refetchTopics = async (currentUsers = usersList) => {
    try {
      const response = await fetch('https://sns.teranago.synology.me/api/bulletins', {
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const mapped = data.map((t: any) => {
            let detailsObj: any = {};
            if (t.content && t.content.startsWith('{')) {
              try { detailsObj = JSON.parse(t.content); } catch (_) {}
            }
            const authorUser = currentUsers.find(u => u.id === t.authorId) || t.author || defaultCurrentUser;
            return {
              id: String(t.id),
              category: t.category || 'general',
              title: t.title,
              content: t.content,
              author: authorUser,
              createdAt: t.createdAt,
              views: t.views || 0,
              likes: t.likes || 0,
              office: t.office || '全社',
              division: t.division || '全部署',
              scope: t.scope || '全社',
              tags: Array.isArray(t.tags) ? t.tags : (typeof t.tags === 'string' ? t.tags.split(',') : []),
              isPinned: t.isPinned === true || t.isPinned === 1,
              attachments: t.attachments ? (typeof t.attachments === 'string' && t.attachments.startsWith('[') ? JSON.parse(t.attachments) : t.attachments) : [],
              comments: [],
              viewers: [],
              commentsCount: t.commentsCount || 0,
              ...detailsObj
            };
          });
          setTopics(mapped);
        }
      }
    } catch (err) {
      console.warn('Failed to load bulletins from API, keeping local state:', err);
    }
  };

  const refetchChatRooms = async (currentUsers = usersList) => {
    try {
      const response = await fetch('https://sns.teranago.synology.me/api/chats', {
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const mapped = data.map((room: any) => ({
            ...room,
            id: String(room.id),
            participants: Array.isArray(room.participants) && room.participants.length > 0 
              ? room.participants 
              : (currentUsers.length > 0 ? currentUsers.slice(0, 3) : defaultAllUsers.slice(0, 3)),
            messages: Array.isArray(room.messages) ? room.messages : []
          }));
          setChatRooms(mapped);
        }
      }
    } catch (err) {
      console.warn('Failed to load chat rooms from API, keeping local state:', err);
    }
  };

  const refetchMemos = async (currentUsers = usersList) => {
    try {
      const response = await fetch('https://sns.teranago.synology.me/api/memos', {
        headers: { 'Accept': 'application/json' }
      });
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const mapped = data.map((m: any) => {
            let detailsObj: any = {};
            if (m.details && typeof m.details === 'object') {
              detailsObj = m.details;
            } else if (m.content && typeof m.content === 'string' && m.content.startsWith('{')) {
              try { detailsObj = JSON.parse(m.content); } catch (_) {}
            }
            const activeUsers = currentUsers.length > 0 ? currentUsers : defaultAllUsers;
            const targetUser = activeUsers.find(u => u.id === m.receiverId || u.id === m.toUserId) || activeUsers[0];
            const defaultRecipientStatus = [{
              userId: targetUser?.id || 'u1',
              userName: targetUser?.name || '担当者',
              avatarUrl: targetUser?.avatarUrl || '',
              department: targetUser?.department || '',
              office: targetUser?.office || '',
              division: targetUser?.division || '',
              isViewed: m.isRead ? true : false,
              isHandled: m.isRead ? true : false
            }];

            return {
              id: String(m.id),
              fromName: m.fromName || '不詳',
              fromCompany: m.fromCompany || '',
              fromPhone: m.fromPhone || '',
              content: m.content || '',
              status: m.isRead ? 'handled' : 'unread',
              createdAt: m.createdAt || new Date().toISOString(),
              targetOffices: m.targetOffices || [],
              targetDivisions: m.targetDivisions || [],
              recipientStatuses: Array.isArray(m.recipientStatuses) ? m.recipientStatuses : defaultRecipientStatus,
              toUsers: Array.isArray(m.toUsers) ? m.toUsers : [targetUser],
              toUser: targetUser,
              createdByUser: activeUsers.find(u => u.id === m.senderId) || activeUsers[0],
              ...detailsObj,
              ...m
            };
          });
          setMemos(mapped);
        }
      }
    } catch (err) {
      console.warn('Failed to load memos from API, keeping local state:', err);
    }
  };

  const refetchReports = async (currentUsers = usersList) => {
    try {
      let response = await fetch('https://sns.teranago.synology.me/api/daily-reports', {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        response = await fetch('https://sns.teranago.synology.me/api/reports', {
          headers: { 'Accept': 'application/json' }
        });
      }
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data)) {
          const mapped = data.map((r: any) => {
            const authorUser = currentUsers.find(u => u.id === r.authorId) || r.author || defaultCurrentUser;
            let parsedTasks = r.tasks || '';
            let parsedResults = r.results || '';
            let parsedIssues = r.issues || '';
            let parsedTomorrow = r.tomorrowPlan || '';
            if (r.content && (!r.tasks || !r.results)) {
              if (r.content.startsWith('{')) {
                try {
                  const p = JSON.parse(r.content);
                  parsedTasks = p.tasks || parsedTasks;
                  parsedResults = p.results || parsedResults;
                  parsedIssues = p.issues || parsedIssues;
                  parsedTomorrow = p.tomorrowPlan || parsedTomorrow;
                } catch (_) {}
              } else {
                parsedTasks = r.content;
              }
            }
            return {
              id: String(r.id),
              author: authorUser,
              date: r.date || r.reportDate || (r.createdAt ? String(r.createdAt).substring(0, 10) : ''),
              tasks: parsedTasks,
              results: parsedResults,
              issues: parsedIssues,
              tomorrowPlan: parsedTomorrow,
              createdAt: r.createdAt || new Date().toISOString()
            };
          });
          setReports(mapped);
        }
      }
    } catch (err) {
      console.warn('Failed to load reports from API, keeping local state:', err);
    }
  };

  const refetchAll = async () => {
    const latestUsers = await refetchUsers();
    await Promise.all([
      refetchPosts(latestUsers),
      refetchEvents(latestUsers),
      refetchApplications(latestUsers),
      refetchTopics(latestUsers),
      refetchChatRooms(latestUsers),
      refetchMemos(latestUsers),
      refetchReports(latestUsers),
    ]);
  };

  useEffect(() => {
    // Always load latest users from API on mount
    refetchUsers().then((latestUsers) => {
      if (isAuthenticated) {
        refetchAll();
      }
    });
  }, [isAuthenticated]);

  // Board Handlers
  const handleAddTopic = async (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => {
    const tempId = `t-temp-${Date.now()}`;
    const newTopic: BoardTopic = {
      ...topicData,
      id: tempId,
      createdAt: new Date().toISOString(),
      views: 0,
      commentsCount: 0,
    };
    setTopics([newTopic, ...topics]);

    try {
      const response = await fetch('https://sns.teranago.synology.me/api/bulletins', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: topicData.category,
          title: topicData.title,
          content: topicData.content,
          authorId: topicData.author.id,
          office: topicData.office || '全社',
          division: topicData.division || '全部署',
          scope: topicData.scope || '全社',
          tags: topicData.tags || [],
          isPinned: topicData.isPinned ? 1 : 0,
          attachments: topicData.attachments || [],
          comments: topicData.comments || [],
          viewers: topicData.viewers || [],
        })
      });
      if (response.ok) {
        await refetchTopics();
      }
    } catch (err) {
      console.error('Failed to save bulletin via API, keeping locally:', err);
    }
  };

  const handleUpdateTopic = async (updatedTopic: BoardTopic) => {
    setTopics(topics.map(t => t.id === updatedTopic.id ? updatedTopic : t));
    try {
      const response = await fetch(`https://sns.teranago.synology.me/api/bulletins/${updatedTopic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: updatedTopic.category,
          title: updatedTopic.title,
          content: updatedTopic.content,
          authorId: updatedTopic.author.id,
          office: updatedTopic.office || '全社',
          division: updatedTopic.division || '全部署',
          scope: updatedTopic.scope || '全社',
          tags: updatedTopic.tags || [],
          isPinned: updatedTopic.isPinned ? 1 : 0,
          attachments: updatedTopic.attachments || [],
          comments: updatedTopic.comments || [],
          viewers: updatedTopic.viewers || [],
          views: updatedTopic.views,
        })
      });
      if (response.ok) {
        await refetchTopics();
      }
    } catch (err) {
      console.error('Failed to update bulletin via API:', err);
    }
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
        console.warn(`POST /api/users failed with status ${response.status}: ${errText}. Keeping locally.`);
      }
    } catch (err: any) {
      console.warn('Failed to create user via API, keeping locally:', err);
    }
  };

  const handleUpdateUser = async (updatedUser: User) => {
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
        console.warn(`All fallback updates failed. Last status: ${response.status}: ${errText}. Keeping locally.`);
      }
    } catch (err: any) {
      console.warn('Failed to update user via API, keeping locally:', err);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    if (!window.confirm('このユーザーを削除してもよろしいですか？')) return;

    setUsersList(prev => prev.filter((u) => u.id !== userId));

    try {
      console.log(`Attempting to delete user via DELETE on /api/users/${userId}...`);
      let response = await fetch(`https://sns.teranago.synology.me/api/users/${userId}`, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json',
        },
      });

      if (response.ok) {
        console.log('User successfully deleted from server DB.');
        await refetchUsers();
      } else {
        console.warn(`DELETE /api/users/:id failed with status ${response.status}. Keeping locally.`);
      }
    } catch (err: any) {
      console.warn('Failed to delete user via API, keeping locally:', err);
    }
  };

  const handleToggleUserAdmin = async (userId: string) => {
    let targetUser: User | undefined;

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
          console.warn(`Admin toggle API failed with status ${response.status}. Keeping locally.`);
        }
      } catch (err: any) {
        console.warn('Failed to toggle admin status via API, keeping locally:', err);
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
  const handleAddEvent = async (eventData: Omit<CalendarEvent, 'id'>) => {
    const tempId = `e-temp-${Date.now()}`;
    const newEvent: CalendarEvent = {
      ...eventData,
      id: tempId
    };
    setEvents([...events, newEvent]);

    try {
      const response = await fetch('https://sns.teranago.synology.me/api/events', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: eventData.title,
          startAt: eventData.start,
          endAt: eventData.end,
          isAllDay: eventData.isAllDay ? 1 : 0,
          category: eventData.type,
          office: eventData.office || '全社',
          division: eventData.division || '全部署',
          location: eventData.location || '',
          attendees: eventData.attendees || [],
          memo: eventData.memo || '',
        })
      });
      if (response.ok) {
        await refetchEvents();
      }
    } catch (err) {
      console.error('Failed to add event via API, keeping locally:', err);
    }
  };

  // Handle event update
  const handleUpdateEvent = async (updatedEvent: CalendarEvent) => {
    setEvents(events.map(e => e.id === updatedEvent.id ? updatedEvent : e));
    try {
      const response = await fetch(`https://sns.teranago.synology.me/api/events/${updatedEvent.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: updatedEvent.title,
          startAt: updatedEvent.start,
          endAt: updatedEvent.end,
          isAllDay: updatedEvent.isAllDay ? 1 : 0,
          category: updatedEvent.type,
          office: updatedEvent.office || '全社',
          division: updatedEvent.division || '全部署',
          location: updatedEvent.location || '',
          attendees: updatedEvent.attendees || [],
          memo: updatedEvent.memo || '',
        })
      });
      if (response.ok) {
        await refetchEvents();
      }
    } catch (err) {
      console.error('Failed to update event via API:', err);
    }
  };

  // Handle event deletion
  const handleDeleteEvent = async (eventId: string) => {
    if (eventId.startsWith('e-temp-')) return;
    if (!window.confirm('この予定を削除してもよろしいですか？')) return;
    setEvents(events.filter(e => e.id !== eventId));
    try {
      const response = await fetch(`https://sns.teranago.synology.me/api/events/${eventId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await refetchEvents();
      }
    } catch (err) {
      console.error('Failed to delete event via API:', err);
    }
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
  const handleAddApplication = async (appData: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { status?: ApplicationStatus }) => {
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

    const tempId = `a-temp-${Date.now()}`;
    const newApp: WorkflowApplication = {
      ...appData,
      id: tempId,
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

    try {
      const response = await fetch('https://sns.teranago.synology.me/api/workflows', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: appData.title,
          applicantId: appData.applicant.id,
          approverId: initialApprover.id,
          status: appData.status || 'pending',
          category: appData.type || 'other',
          details: JSON.stringify({
            flowId: appData.flowId || selectedFlow?.id,
            flowName: appData.flowName || selectedFlow?.name || '標準承認フロー',
            currentStepIndex: 1,
            totalSteps: stepsConfig.length,
            stepsConfig: stepsConfig,
            history: [],
            reason: (appData as any).reason || '',
            purchaseItems: (appData as any).purchaseItems || [],
            leaveStart: (appData as any).leaveStart || '',
            leaveEnd: (appData as any).leaveEnd || '',
            expenseType: (appData as any).expenseType || '',
            amount: (appData as any).amount || 0,
            attachmentUrl: (appData as any).attachmentUrl || '',
          })
        })
      });
      if (response.ok) {
        await refetchApplications();
      }
    } catch (err) {
      console.error('Failed to submit workflow via API, keeping locally:', err);
    }
  };

  // Handle workflow approval / rejection (Multi-step approval processing)
  const handleWorkflowAction = async (id: string, actionStatus: 'approved' | 'rejected', comment?: string) => {
    let updatedAppObj: WorkflowApplication | undefined;

    setApplications(prevApps => prevApps.map(app => {
      if (app.id !== id) return app;

      let resultApp: WorkflowApplication;
      if (actionStatus === 'rejected') {
        resultApp = {
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
      } else {
        // 承認アクション (actionStatus === 'approved')
        const currentStep = app.currentStepIndex || 1;
        const stepsConfig = (app.stepsConfig && app.stepsConfig.length > 0) ? app.stepsConfig : null;
        const totalSteps = stepsConfig ? stepsConfig.length : (app.totalSteps || 1);

        if (currentStep < totalSteps && stepsConfig) {
          const nextStepConfig = stepsConfig[currentStep];
          const nextApprover = resolveApproverForStep(app.applicant, nextStepConfig, usersList);

          resultApp = {
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
        } else {
          resultApp = {
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
        }
      }
      updatedAppObj = resultApp;
      return resultApp;
    }));

    if (updatedAppObj && !id.startsWith('a-temp-')) {
      try {
        await fetch(`https://sns.teranago.synology.me/api/workflows/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: updatedAppObj.title,
            applicantId: updatedAppObj.applicant.id,
            approverId: updatedAppObj.approver?.id || userState.id,
            status: updatedAppObj.status,
            category: updatedAppObj.type || 'other',
            details: JSON.stringify({
              flowId: updatedAppObj.flowId,
              flowName: updatedAppObj.flowName,
              currentStepIndex: updatedAppObj.currentStepIndex,
              totalSteps: updatedAppObj.totalSteps,
              stepsConfig: updatedAppObj.stepsConfig,
              history: updatedAppObj.history,
              rejectReason: updatedAppObj.rejectReason,
              reason: (updatedAppObj as any).reason || '',
              purchaseItems: (updatedAppObj as any).purchaseItems || [],
              leaveStart: (updatedAppObj as any).leaveStart || '',
              leaveEnd: (updatedAppObj as any).leaveEnd || '',
              expenseType: (updatedAppObj as any).expenseType || '',
              amount: (updatedAppObj as any).amount || 0,
              attachmentUrl: (updatedAppObj as any).attachmentUrl || '',
            })
          })
        });
        await refetchApplications();
      } catch (err) {
        console.error('Failed to sync workflow action with API:', err);
      }
    }
  };

  // 申請の更新（再申請、下書き保存、取り下げ等）
  const handleUpdateApplication = async (updatedApp: WorkflowApplication) => {
    let finalAppObj: WorkflowApplication | undefined;

    setApplications(prevApps => prevApps.map(app => {
      if (app.id !== updatedApp.id) return app;

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

      const resultApp = {
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
      finalAppObj = resultApp;
      return resultApp;
    }));

    if (finalAppObj && !updatedApp.id.startsWith('a-temp-')) {
      try {
        await fetch(`https://sns.teranago.synology.me/api/workflows/${updatedApp.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: finalAppObj.title,
            applicantId: finalAppObj.applicant.id,
            approverId: finalAppObj.approver?.id || userState.id,
            status: finalAppObj.status,
            category: finalAppObj.type || 'other',
            details: JSON.stringify({
              flowId: finalAppObj.flowId,
              flowName: finalAppObj.flowName,
              currentStepIndex: finalAppObj.currentStepIndex,
              totalSteps: finalAppObj.totalSteps,
              stepsConfig: finalAppObj.stepsConfig,
              history: finalAppObj.history,
              rejectReason: finalAppObj.rejectReason,
              reason: (finalAppObj as any).reason || '',
              purchaseItems: (finalAppObj as any).purchaseItems || [],
              leaveStart: (finalAppObj as any).leaveStart || '',
              leaveEnd: (finalAppObj as any).leaveEnd || '',
              expenseType: (finalAppObj as any).expenseType || '',
              amount: (finalAppObj as any).amount || 0,
              attachmentUrl: (finalAppObj as any).attachmentUrl || '',
            })
          })
        });
        await refetchApplications();
      } catch (err) {
        console.error('Failed to sync updated workflow via API:', err);
      }
    }
  };

  // 申請の削除処理
  const handleDeleteApplication = async (applicationId: string) => {
    if (applicationId.startsWith('a-temp-')) return;
    if (!window.confirm('この申請を削除してもよろしいですか？')) return;
    setApplications(prevApps => prevApps.filter(app => app.id !== applicationId));

    try {
      await fetch(`https://sns.teranago.synology.me/api/workflows/${applicationId}`, {
        method: 'DELETE'
      });
      await refetchApplications();
    } catch (err) {
      console.error('Failed to delete workflow via API:', err);
    }
  };

  const handleUpdateRooms = async (updatedRooms: ChatRoom[]) => {
    setChatRooms(updatedRooms);
    try {
      const lastRoom = updatedRooms[0];
      if (lastRoom && lastRoom.messages && lastRoom.messages.length > 0) {
        const lastMsg = lastRoom.messages[lastRoom.messages.length - 1];
        let response = await fetch('https://sns.teranago.synology.me/api/chats', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            roomId: lastRoom.id,
            senderId: lastMsg.sender.id,
            message: lastMsg.content,
            createdAt: lastMsg.createdAt
          })
        });
        if (!response.ok) {
          await fetch('https://sns.teranago.synology.me/api/chats/message', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              roomId: lastRoom.id,
              senderId: lastMsg.sender.id,
              content: lastMsg.content,
              createdAt: lastMsg.createdAt
            })
          });
        }
        await refetchChatRooms();
      }
    } catch (err) {
      console.warn('Failed to sync chat message via API:', err);
    }
  };

  const handleUpdateMemos = async (updatedMemos: any[]) => {
    setMemos(updatedMemos);
    try {
      const lastMemo = updatedMemos[updatedMemos.length - 1];
      if (lastMemo) {
        await fetch('https://sns.teranago.synology.me/api/memos', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: lastMemo.id,
            senderId: userState.id,
            receiverId: lastMemo.toUserId || 'u1',
            fromName: lastMemo.fromName,
            fromCompany: lastMemo.fromCompany,
            fromPhone: lastMemo.fromPhone,
            content: lastMemo.content,
            isRead: lastMemo.status === 'handled' ? 1 : 0,
            createdAt: lastMemo.createdAt || new Date().toISOString()
          })
        });
        await refetchMemos();
      }
    } catch (err) {
      console.warn('Failed to sync memos via API:', err);
    }
  };

  const handleAddReport = async (reportData: {
    date: string;
    tasks: string;
    results: string;
    issues: string;
    tomorrowPlan: string;
  }) => {
    const tempId = `r-temp-${Date.now()}`;
    const newReport: DailyReport = {
      id: tempId,
      author: userState,
      date: reportData.date,
      tasks: reportData.tasks,
      results: reportData.results,
      issues: reportData.issues,
      tomorrowPlan: reportData.tomorrowPlan,
      createdAt: new Date().toISOString(),
    };
    setReports([newReport, ...reports]);

    try {
      let response = await fetch('https://sns.teranago.synology.me/api/daily-reports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorId: userState.id,
          reportDate: reportData.date,
          content: reportData.tasks || '日報',
          tasks: reportData.tasks,
          results: reportData.results,
          issues: reportData.issues,
          tomorrowPlan: reportData.tomorrowPlan,
        })
      });
      if (!response.ok) {
        response = await fetch('https://sns.teranago.synology.me/api/reports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            authorId: userState.id,
            reportDate: reportData.date,
            tasks: reportData.tasks,
            results: reportData.results,
            issues: reportData.issues,
            tomorrowPlan: reportData.tomorrowPlan,
          })
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to save report via API, keeping locally:', err);
    }
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
            onUpdateRooms={handleUpdateRooms}
          />
        )}
        {activeTab === 'memo' && (
          <MemoList 
            memos={memos}
            offices={offices}
            divisions={divisions}
            users={usersList}
            currentUser={userState}
            onUpdateMemos={handleUpdateMemos}
          />
        )}
        {activeTab === 'daily_report' && (
          <DailyReportView 
            reports={reports} 
            onAddReport={handleAddReport}
            currentUser={userState}
          />
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
            onUpdateMemo={handleUpdateMemos}
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
