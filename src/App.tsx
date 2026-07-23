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
import { 
  initialPosts, 
  initialEvents, 
  initialApplications, 
  initialTopics,
  initialChatRooms,
  initialMemos,
  initialReports,
  currentUser 
} from './data/mockData';
import { Post, CalendarEvent, WorkflowApplication, BoardTopic, ChatRoom, Memo, DailyReport } from './types';

export default function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('timeline');
  const [posts, setPosts] = useState<Post[]>(initialPosts);
  const [events, setEvents] = useState<CalendarEvent[]>(initialEvents);
  const [applications, setApplications] = useState<WorkflowApplication[]>(initialApplications);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // Handle new post creation
  const handlePost = (content: string, tags: string[]) => {
    const newPost: Post = {
      id: `p${Date.now()}`,
      author: currentUser,
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
      <Header searchQuery={searchQuery} onSearchChange={setSearchQuery} />

      <main className="max-w-6xl mx-auto px-4 py-8 flex flex-col lg:flex-row gap-8">
        
        {/* Left Sidebar Column */}
        <aside className="hidden lg:block lg:w-64 shrink-0">
          <Sidebar
            posts={posts}
            selectedTag={selectedTag}
            onSelectTag={setSelectedTag}
            activeTab={activeTab}
            onChangeTab={setActiveTab}
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
            user={currentUser} 
            myPosts={posts.filter(p => p.author.id === currentUser.id)}
            myApplications={applications.filter(a => a.applicant.id === currentUser.id)}
          />
        )}
      </main>
    </div>
  );
}
