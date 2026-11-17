import { AttachmentFile } from './index';

export type ProjectBoardType = 'personal' | 'team';
export type ProjectBoardVisibility = 'private' | 'members' | 'office' | 'division' | 'org';
export type ProjectColumnKind = 'memo' | 'todo' | 'done';

export interface ProjectBoardColumn {
  id: string;
  title: string;
  kind: ProjectColumnKind;
  color?: string;
  sortOrder: number;
}

export interface ProjectBoard {
  id: string;
  title: string;
  description?: string;
  boardType: ProjectBoardType;
  visibility: ProjectBoardVisibility;
  ownerId: string;
  ownerName?: string;
  officeId?: string;
  office?: string;
  divisionId?: string;
  division?: string;
  memberIds: string[];
  columns: ProjectBoardColumn[];
  color?: string;
  isPinned: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export type ProjectCardType = 'task' | 'memo';
export type ProjectCardPriority = 'high' | 'medium' | 'low' | 'none';

export interface ProjectCardLink {
  id: string;
  label?: string;
  url: string;
  title?: string;
  favicon?: string;
}

export interface ProjectChecklistItem {
  id: string;
  text: string;
  done: boolean;
}

export interface ProjectCardComment {
  id: string;
  authorId: string;
  authorName: string;
  authorAvatar?: string;
  content: string;
  attachments?: AttachmentFile[];
  createdAt: string;
}

export interface ProjectCard {
  id: string;
  projectId: string;
  columnId: string;
  cardType: ProjectCardType;
  title: string;
  description?: string;
  priority: ProjectCardPriority;
  assigneeIds: string[];
  dueDate?: string;
  startDate?: string;
  tags: string[];
  links: ProjectCardLink[];
  attachments: AttachmentFile[];
  checklist: ProjectChecklistItem[];
  comments: ProjectCardComment[];
  isCompleted: boolean;
  completedAt?: string;
  completedBy?: string;
  isPinned: boolean;
  isArchived: boolean;
  sortOrder: number;
  createdBy?: string;
  createdByName?: string;
  updatedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectBoardCountStats {
  total: number;
  activeTasks: number;
  completedTasks: number;
  memos: number;
}
