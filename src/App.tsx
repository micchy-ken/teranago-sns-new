import React, { useState } from 'react';
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
  initialDivisions
} from './data/mockData';
import { Post, CalendarEvent, WorkflowApplication, User, OfficeMaster, DivisionMaster } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('timeline');
  const [userState, setUserState] = useState<User>(defaultCurrentUser);
  const [usersList, setUsersList] = useState<User[]>(defaultAllUsers);
  const [offices, setOffices] = useState<OfficeMaster[]>(initialOffices);
  const [divisions, setDivisions] = useState<DivisionMaster[]>(initialDivisions);
  
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [applications, setApplications] = useState<WorkflowApplication[]>(initialApplications);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Switch active user for testing permissions
  const handleSwitchUser = (user: User) => {
    setUserState(user);
  };

  // User Management
  const handleAddUser = (userData: Omit<User, 'id'>) => {
    const newUser: User = {
      ...userData,
      id: `u-${Date.now()}`,
    };
    setUsersList([...usersList, newUser]);
  };

  const handleUpdateUser = (updatedUser: User) => {
    setUsersList(usersList.map((u) => (u.id === updatedUser.id ? updatedUser : u)));
    if (updatedUser.id === userState.id) {
      setUserState(updatedUser);
    }
  };

  const handleDeleteUser = (userId: string) => {
    setUsersList(usersList.filter((u) => u.id !== userId));
  };

  const handleToggleUserAdmin = (userId: string) => {
    setUsersList(usersList.map(u => {
      if (u.id === userId) {
        const updatedIsAdmin = !u.isAdmin;
        const updated = { ...u, isAdmin: updatedIsAdmin, role: (updatedIsAdmin ? 'admin' : 'user') as 'admin' | 'user' };
        if (u.id === userState.id) {
          setUserState(updated);
        }
        return updated;
      }
      return u;
    }));
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

  // Handle new post creation
  const handlePost = (content: string, tags: string[]) => {
    const newPost: Post = {
      id: `p${Date.now()}`,
      author: userState,
      content,
      tags,
      createdAt: new Date().toISOString(),
      likes: 0,
      isLiked: false,
    };
    setPosts([newPost, ...posts]);
  };

  // Handle like toggle
  const handleToggleLike = (postId: string) => {
    setPosts(posts.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          isLiked: !post.isLiked,
          likes: post.isLiked ? post.likes - 1 : post.likes + 1,
        };
      }
      return post;
    }));
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

  // Handle new workflow application
  const handleAddApplication = (appData: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'>) => {
    const newApp: WorkflowApplication = {
      ...appData,
      id: `a${Date.now()}`,
      createdAt: new Date().toISOString(),
      status: 'pending'
    };
    setApplications([newApp, ...applications]);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden" style={{ backgroundColor: '#f8fafc' }}>
      <Header 
        searchQuery={searchQuery} 
        onSearchChange={setSearchQuery} 
        currentUser={userState}
        allUsers={usersList}
        onSwitchUser={handleSwitchUser}
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
            searchQuery={searchQuery}
            selectedTag={selectedTag}
            onPost={handlePost}
            onToggleLike={handleToggleLike}
            onSelectTag={setSelectedTag}
          />
        )}
        {activeTab === 'calendar' && (
          <Calendar 
            events={events}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            currentUser={userState}
            offices={offices}
            divisions={divisions}
          />
        )}
        {activeTab === 'workflow' && (
          <Workflow 
            applications={applications}
            onAddApplication={handleAddApplication}
          />
        )}
        {activeTab === 'board' && (
          <Board topics={initialTopics} />
        )}
        {activeTab === 'chat' && (
          <Chat rooms={initialChatRooms} />
        )}
        {activeTab === 'memo' && (
          <MemoList memos={initialMemos} />
        )}
        {activeTab === 'daily_report' && (
          <DailyReportView reports={initialReports} />
        )}
        {activeTab === 'mypage' && (
          <MyPage 
            user={userState} 
            myPosts={posts.filter(p => p.author.id === userState.id)}
            myApplications={applications.filter(a => a.applicant.id === userState.id)}
            onUpdateUser={handleUpdateUser}
          />
        )}
        {activeTab === 'admin' && (
          <AdminPanel 
            currentUser={userState}
            allUsers={usersList}
            offices={offices}
            divisions={divisions}
            onAddOffice={handleAddOffice}
            onUpdateOffice={handleUpdateOffice}
            onDeleteOffice={handleDeleteOffice}
            onAddDivision={handleAddDivision}
            onUpdateDivision={handleUpdateDivision}
            onDeleteDivision={handleDeleteDivision}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onToggleUserAdmin={handleToggleUserAdmin}
            onSwitchUser={handleSwitchUser}
          />
        )}
      </main>
    </div>
  );
}
