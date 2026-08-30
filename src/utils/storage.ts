import { DEMO_USERS, INITIAL_TEMPLATES, INITIAL_APPROVAL_RECORDS, INITIAL_NOTIFICATIONS, INITIAL_REPORTS, INITIAL_REQUEST_COMMENTS } from '../data/initialData';
import type { WidgetTemplate, ApprovalRecord, Notification, Report, RequestComment, ReportComment } from '../types';

const STORAGE_KEY = 'widgetflow_demo_state_v1';

export interface StorageState {
  currentUserId: string;
  templates: WidgetTemplate[];
  approvalRecords: ApprovalRecord[];
  requestComments: RequestComment[];
  reportComments: ReportComment[];
  notifications: Notification[];
  reports: Report[];
}

export function getInitialState(): StorageState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<StorageState>;
      if (parsed && Array.isArray(parsed.templates) && parsed.templates.length > 0) {
        return {
          currentUserId: parsed.currentUserId || DEMO_USERS[0].id,
          templates: parsed.templates,
          approvalRecords: parsed.approvalRecords || INITIAL_APPROVAL_RECORDS,
          requestComments: parsed.requestComments || INITIAL_REQUEST_COMMENTS,
          reportComments: parsed.reportComments || [],
          notifications: parsed.notifications || INITIAL_NOTIFICATIONS,
          reports: parsed.reports || INITIAL_REPORTS,
        };
      }
    }
  } catch (err) {
    console.warn('Failed to parse localStorage state, resetting to defaults:', err);
  }

  // Default initial state
  const defaultState: StorageState = {
    currentUserId: DEMO_USERS[0].id, // Ahmed Hassan (Employee) by default
    templates: INITIAL_TEMPLATES,
    approvalRecords: INITIAL_APPROVAL_RECORDS,
    requestComments: INITIAL_REQUEST_COMMENTS,
    reportComments: [],
    notifications: INITIAL_NOTIFICATIONS,
    reports: INITIAL_REPORTS,
  };

  saveStateToStorage(defaultState);
  return defaultState;
}

export function saveStateToStorage(state: StorageState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (err) {
    console.error('Failed to save state to localStorage:', err);
  }
}

export function clearDemoStorage(): StorageState {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (err) {
    console.error('Failed to clear localStorage:', err);
  }

  const resetState: StorageState = {
    currentUserId: DEMO_USERS[0].id,
    templates: INITIAL_TEMPLATES,
    approvalRecords: INITIAL_APPROVAL_RECORDS,
    requestComments: INITIAL_REQUEST_COMMENTS,
    reportComments: [],
    notifications: INITIAL_NOTIFICATIONS,
    reports: INITIAL_REPORTS,
  };

  saveStateToStorage(resetState);
  return resetState;
}
