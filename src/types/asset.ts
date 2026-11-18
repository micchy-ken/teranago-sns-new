export type AssetFieldType =
  | 'text'
  | 'number'
  | 'date'
  | 'select'
  | 'checkbox'
  | 'url'
  | 'textarea';

export type AssetAlertKind = 'inspection' | 'replacement' | 'custom';

export interface AssetFieldAlertRule {
  kind: AssetAlertKind;
  daysBefore: number; // e.g., 30 (1ヶ月前) or 180 (6ヶ月前)
  label?: string;     // e.g., '点検アラート', '入替アラート'
}

export interface AssetFieldDefinition {
  key: string;
  label: string;
  type: AssetFieldType;
  options?: string[];
  unit?: string;
  placeholder?: string;
  required?: boolean;
  showInList?: boolean;
  showInMyAssets?: boolean;
  inlineEditable?: boolean;
  alertRule?: AssetFieldAlertRule;
  sortOrder?: number;
}

export interface AssetCategory {
  id: string;
  name: string;
  icon: string;
  color: string;
  defaultShared?: boolean;
  allowInlineNotes?: boolean;
  allowInlineAssignee?: boolean;
  fields: AssetFieldDefinition[];
  sortOrder: number;
  isSystem?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type AssetStatus = 'active' | 'maintenance' | 'standby' | 'retired';

export type AssetMainMode = 'my' | 'catalog' | 'shared' | 'inspections' | 'calendar';
export type AssetSubTab = 'details' | 'inspections' | 'history';

export interface AssetInspectionChecklistItem {
  id: string;
  label: string;
  method?: string;
  sortOrder?: number;
}

export type AssetChecklistStatus = 'ok' | 'caution' | 'ng' | 'na';

export interface AssetChecklistResult {
  itemId: string;
  label: string;
  method?: string;
  status: AssetChecklistStatus;
  note?: string;
}

export type AssetInspectionStatus = 'scheduled' | 'completed' | 'cancelled';

export interface AssetAttachment {
  id: string;
  name: string;
  url: string;
  size?: string;
  type?: string;
  uploadedAt?: string;
}

export interface AssetItem {
  id: string;
  categoryId: string;
  assetCode: string;
  name: string;
  officeId?: string;
  office?: string;
  divisionId?: string;
  division?: string;
  assigneeUserId?: string;
  assigneeUserName?: string;
  isShared: boolean;
  status: AssetStatus;
  nextAlertDate?: string;
  attributes: Record<string, any>;
  attachments: AssetAttachment[];
  inspectionItems?: AssetInspectionChecklistItem[];
  latestDrivingMileage?: number;
  latestDrivingMileageDate?: string;
  latestDrivingReportId?: string;
  notes?: string;
  createdBy?: string;
  createdByName?: string;
  createdAt: string;
  updatedAt: string;
}

export type AssetLogActionType =
  | 'register'
  | 'update'
  | 'assignee_change'
  | 'inspection'
  | 'repair'
  | 'replacement'
  | 'note'
  | 'retire';

export interface AssetLogItem {
  id: string;
  assetId: string;
  actionType: AssetLogActionType;
  actorId?: string;
  actorName: string;
  eventDate: string; // YYYY-MM-DD (JST)
  summary: string;
  detail?: {
    inspectionStatus?: AssetInspectionStatus;
    inspectionType?: string;
    vendor?: string;
    cost?: number;
    mileage?: number;
    checklistResults?: AssetChecklistResult[];
    confirmedAt?: string;
    confirmedById?: string;
    confirmedByName?: string;
    scheduledDateBefore?: string;
    cancellationReason?: string;
    beforeAssignee?: string;
    afterAssignee?: string;
    changedFields?: Array<{ key: string; label: string; before?: any; after?: any }>;
    memo?: string;
    [key: string]: any;
  };
  createdAt: string;
}

export interface AssetInspectionScheduleEvent {
  logId?: string;
  assetId: string;
  assetName: string;
  assetCode?: string;
  categoryId: string;
  categoryName: string;
  isShared: boolean;
  assigneeUserId?: string;
  assigneeUserName?: string;
  officeId?: string;
  office?: string;
  eventDate: string; // YYYY-MM-DD (JST)
  inspectionType?: string;
  vendor?: string;
  summary: string;
  isDueOrOverdue: boolean;
  source: 'log' | 'legacy_attribute';
}

export type AssetAlertSeverity = 'overdue' | 'warning' | 'upcoming';

export interface AssetAlertInfo {
  assetId: string;
  fieldKey: string;
  fieldLabel: string;
  kind: AssetAlertKind;
  ruleLabel: string;
  targetDate: string; // YYYY-MM-DD
  daysRemaining: number; // < 0 means overdue
  daysBefore: number;
  severity: AssetAlertSeverity;
}

