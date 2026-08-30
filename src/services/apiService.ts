import type {
  User,
  Category,
  WidgetTemplate,
  ReportInstance,
  Notification,
  RequestComment,
  ReportComment,
  ContentPack,
  AdminPack,
  ContentLibraryItem,
  OrganizationalRole,
} from '../types';
import type { GovernanceLevel, PermissionKey } from '../shared/permissionCatalog';

function getInitialDemoUserId(): string {
  try {
    const directUser = localStorage.getItem('widgetflow_demo_user_id');
    if (directUser) return directUser;
    const saved = localStorage.getItem('widgetflow_app_state_v1');
    if (saved) {
      const parsed = JSON.parse(saved);
      if (parsed.currentUserId) return parsed.currentUserId;
    }
  } catch {}
  return 'user-employee';
}

let currentDemoUserId = getInitialDemoUserId();

export function setApiDemoUserId(userId: string) {
  currentDemoUserId = userId;
  try {
    localStorage.setItem('widgetflow_demo_user_id', userId);
  } catch {}
}

export class ApiError extends Error {
  code: string;
  statusCode: number;

  constructor(message: string, code: string = 'API_ERROR', statusCode: number = 400) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
  }
}

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const activeUserId = currentDemoUserId || getInitialDemoUserId();
  const headers = {
    'Content-Type': 'application/json',
    'X-Demo-User-Id': activeUserId,
    ...options.headers,
  };

  try {
    const response = await fetch(endpoint, { ...options, headers });
    const json = await response.json();

    if (!response.ok || !json.success) {
      const errorMsg = json.error?.message || `Request failed with status ${response.status}`;
      throw new ApiError(errorMsg, json.error?.code || 'API_ERROR', response.status);
    }

    return json.data as T;
  } catch (err: any) {
    if (err instanceof ApiError) {
      throw err;
    }
    // Network failure or backend unreachable
    throw new ApiError('Unable to connect to WidgetFlow API. Please verify server status.', 'NETWORK_ERROR', 503);
  }
}

export const apiService = {
  setApiDemoUserId,
  setDemoUserId: setApiDemoUserId,

  // Users & Categories
  async getUsers(): Promise<User[]> {
    return request<User[]>('/api/users');
  },

  async getMyAuthorization(): Promise<User> {
    return request<User>('/api/authorization/me');
  },

  async getCategories(): Promise<Category[]> {
    return request<Category[]>('/api/categories');
  },

  // Templates
  async getTemplates(params?: { status?: string; categoryId?: string; search?: string }): Promise<WidgetTemplate[]> {
    const query = new URLSearchParams();
    if (params?.status) query.append('status', params.status);
    if (params?.categoryId) query.append('categoryId', params.categoryId);
    if (params?.search) query.append('search', params.search);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<WidgetTemplate[]>(`/api/templates${queryString}`);
  },

  async getTemplateById(id: string): Promise<WidgetTemplate> {
    return request<WidgetTemplate>(`/api/templates/${id}`);
  },

  async getPendingApprovals(): Promise<WidgetTemplate[]> {
    return request<WidgetTemplate[]>('/api/template-approvals');
  },

  async saveTemplateDraft(payload: any): Promise<WidgetTemplate> {
    return request<WidgetTemplate>('/api/templates', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async submitTemplate(templateId: string, payload?: any): Promise<WidgetTemplate> {
    return request<WidgetTemplate>(`/api/templates/${templateId}/submit`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  },

  async claimTemplateReview(templateId: string): Promise<WidgetTemplate> {
    return request<WidgetTemplate>(`/api/templates/${templateId}/claim`, {
      method: 'POST',
    });
  },

  async approveTemplate(templateId: string): Promise<WidgetTemplate> {
    return request<WidgetTemplate>(`/api/templates/${templateId}/approve`, {
      method: 'POST',
    });
  },

  async rejectTemplate(templateId: string, reason: string): Promise<WidgetTemplate> {
    return request<WidgetTemplate>(`/api/templates/${templateId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async getTemplateComments(templateId: string): Promise<RequestComment[]> {
    return request<RequestComment[]>(`/api/templates/${templateId}/comments`);
  },

  async addTemplateComment(templateId: string, message: string): Promise<RequestComment[]> {
    return request<RequestComment[]>(`/api/templates/${templateId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  async createTemplateVersion(templateId: string): Promise<WidgetTemplate> {
    return request<WidgetTemplate>(`/api/templates/${templateId}/version`, {
      method: 'POST',
    });
  },

  // Reports
  async getReports(params?: { mine?: boolean; received?: boolean; status?: string }): Promise<ReportInstance[]> {
    const query = new URLSearchParams();
    if (params?.mine) query.append('mine', 'true');
    if (params?.received) query.append('received', 'true');
    if (params?.status) query.append('status', params.status);

    const queryString = query.toString() ? `?${query.toString()}` : '';
    return request<ReportInstance[]>(`/api/reports${queryString}`);
  },

  async getReportById(id: string): Promise<ReportInstance> {
    return request<ReportInstance>(`/api/reports/${id}`);
  },

  async createReport(templateId: string, data?: Record<string, any>, title?: string): Promise<ReportInstance> {
    return request<ReportInstance>('/api/reports', {
      method: 'POST',
      body: JSON.stringify({ templateId, data, title }),
    });
  },

  async updateReport(reportId: string, data: Record<string, string | number>, title?: string): Promise<ReportInstance> {
    return request<ReportInstance>(`/api/reports/${reportId}`, {
      method: 'PUT',
      body: JSON.stringify({ data, title }),
    });
  },

  async markReportCompleted(reportId: string, data: Record<string, string | number>, title?: string): Promise<ReportInstance> {
    return request<ReportInstance>(`/api/reports/${reportId}/complete`, {
      method: 'POST',
      body: JSON.stringify({ data, title }),
    });
  },

  async sendReport(reportId: string, recipientUserId: string, senderNote?: string, signaturePayload?: any): Promise<ReportInstance> {
    return request<ReportInstance>(`/api/reports/${reportId}/send`, {
      method: 'POST',
      body: JSON.stringify({ recipientUserId, senderNote, signaturePayload }),
    });
  },

  async returnReport(reportId: string, reason: string): Promise<ReportInstance> {
    return request<ReportInstance>(`/api/reports/${reportId}/return`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async rejectReport(reportId: string, reason: string): Promise<ReportInstance> {
    return request<ReportInstance>(`/api/reports/${reportId}/reject`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  },

  async signReport(reportId: string, payload: any = {}): Promise<ReportInstance> {
    return request<ReportInstance>(`/api/reports/${reportId}/sign`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getUserSignatureProfile(): Promise<any> {
    return request<any>('/api/user/signature-profile');
  },

  async saveUserSignatureProfile(payload: { method: 'uploaded' | 'drawn' | 'typed'; assetReference?: string; drawingReference?: string; typedName?: string }): Promise<any> {
    return request<any>('/api/user/signature-profile', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async getReportComments(reportId: string): Promise<ReportComment[]> {
    return request<ReportComment[]>(`/api/reports/${reportId}/comments`);
  },

  async addReportComment(reportId: string, message: string): Promise<ReportComment[]> {
    return request<ReportComment[]>(`/api/reports/${reportId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ message }),
    });
  },

  // Notifications
  async getNotifications(): Promise<Notification[]> {
    return request<Notification[]>('/api/notifications');
  },

  async markNotificationRead(id: string): Promise<Notification[]> {
    return request<Notification[]>(`/api/notifications/${id}/read`, {
      method: 'PATCH',
    });
  },

  async markAllNotificationsRead(): Promise<Notification[]> {
    return request<Notification[]>('/api/notifications/read-all', {
      method: 'POST',
    });
  },

  // Demo Reset
  async resetDemo(): Promise<void> {
    await request<{ success: boolean }>('/api/demo/reset', {
      method: 'POST',
    });
  },

  // Assets Upload
  async uploadAsset(payload: { filename?: string; mimeType?: string; base64Data: string }): Promise<{ id: string; url: string }> {
    return request<{ id: string; url: string }>('/api/assets/upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  async uploadSignatureAsset(payload: { filename?: string; mimeType?: string; base64Data: string; attestationAccepted: boolean }): Promise<{ id: string; url: string }> {
    return request<{ id: string; url: string }>('/api/assets/signature-upload', {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Content Packs (Content Library)
  async getContentPacks(): Promise<ContentPack[]> {
    return request<ContentPack[]>('/api/content-packs');
  },

  async createContentPack(pack: any): Promise<ContentPack> {
    return request<ContentPack>('/api/content-packs', {
      method: 'POST',
      body: JSON.stringify(pack),
    });
  },

  async updateContentPack(id: string, updates: any): Promise<ContentPack> {
    return request<ContentPack>(`/api/content-packs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async deleteContentPack(id: string): Promise<void> {
    await request<any>(`/api/content-packs/${id}`, {
      method: 'DELETE',
    });
  },

  async addComponentToPack(packId: string, payload: { sectionId?: string; newSectionName?: string; componentDef: any }): Promise<ContentPack> {
    return request<ContentPack>(`/api/content-packs/${packId}/components`, {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  },

  // Admin & System Configuration APIs
  async getSystemConfig(): Promise<{ features: Record<string, boolean>; elements: Record<string, boolean>; settings: any }> {
    return request<{ features: Record<string, boolean>; elements: Record<string, boolean>; settings: any }>('/api/system/config');
  },

  async getAdminFeatures(): Promise<any[]> {
    return request<any[]>('/api/admin/features');
  },

  async updateFeatureSetting(featureKey: string, enabled: boolean): Promise<any> {
    return request<any>(`/api/admin/features/${encodeURIComponent(featureKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  async getAdminElements(): Promise<any[]> {
    return request<any[]>('/api/admin/elements');
  },

  async updateElementSetting(elementKey: string, enabled: boolean): Promise<any> {
    return request<any>(`/api/admin/elements/${encodeURIComponent(elementKey)}`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  async getAdminUsers(): Promise<User[]> {
    return request<User[]>('/api/admin/users');
  },

  async updateUserStatus(id: string, status: User['status']): Promise<User> {
    return request<User>(`/api/admin/users/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  async updateAdminUser(id: string, updates: { name?: string; email?: string; department?: string; role?: string; roleId?: string; status?: User['status'] }): Promise<User> {
    return request<User>(`/api/admin/users/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async createAdminUser(userData: { name: string; email: string; role?: string; roleId?: string; department: string }): Promise<User> {
    return request<User>('/api/admin/users', {
      method: 'POST',
      body: JSON.stringify(userData),
    });
  },

  async getAdminCategories(): Promise<Category[]> {
    return request<Category[]>('/api/admin/categories');
  },

  async createAdminCategory(catData: { name: string; description: string }): Promise<Category> {
    return request<Category>('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify(catData),
    });
  },

  async updateAdminCategory(id: string, updates: { name?: string; description?: string; status?: 'Active' | 'Inactive' }): Promise<Category> {
    return request<Category>(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(updates),
    });
  },

  async updateAdminSettings(settings: Record<string, any>): Promise<any> {
    return request<any>('/api/admin/settings', {
      method: 'PATCH',
      body: JSON.stringify(settings),
    });
  },

  async getAdminAuditLog(): Promise<any[]> {
    return request<any[]>('/api/admin/audit');
  },

  async getAdminRoles(): Promise<OrganizationalRole[]> {
    return request<OrganizationalRole[]>('/api/admin/roles');
  },

  async getAssignableRoles(): Promise<OrganizationalRole[]> {
    return request<OrganizationalRole[]>('/api/admin/roles-assignable');
  },

  async createAdminRole(role: { name: string; description?: string; governanceLevel: GovernanceLevel; isActive?: boolean; permissions: PermissionKey[] }): Promise<OrganizationalRole> {
    return request<OrganizationalRole>('/api/admin/roles', { method: 'POST', body: JSON.stringify(role) });
  },

  async updateAdminRole(id: string, updates: { name?: string; description?: string; governanceLevel?: GovernanceLevel; isActive?: boolean; permissions?: PermissionKey[] }): Promise<OrganizationalRole> {
    return request<OrganizationalRole>(`/api/admin/roles/${id}`, { method: 'PUT', body: JSON.stringify(updates) });
  },

  async duplicateAdminRole(id: string, name: string): Promise<OrganizationalRole> {
    return request<OrganizationalRole>(`/api/admin/roles/${id}/duplicate`, { method: 'POST', body: JSON.stringify({ name }) });
  },

  async restoreDefaultAdminRole(id: string): Promise<OrganizationalRole> {
    return request<OrganizationalRole>(`/api/admin/roles/${id}/restore-defaults`, { method: 'POST' });
  },


  async getGovernanceRouting(): Promise<any> {
    return request<any>('/api/governance-routing');
  },

  async updateGovernanceRouting(routes: {
    employeeTargetRoleId?: string;
    employeeStrategy?: 'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH';
    employeeSpecificUserId?: string;
    managerTargetRoleId?: string;
    managerStrategy?: 'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH';
    managerSpecificUserId?: string;
    directorTargetRoleId?: string;
    directorStrategy?: 'SPECIFIC_USER' | 'ROLE_QUEUE' | 'DIRECT_PUBLISH';
    directorSpecificUserId?: string;
  }): Promise<any> {
    return request<any>('/api/admin/governance-routing', { method: 'PUT', body: JSON.stringify(routes) });
  },

  // Admin Pack Management APIs
  async getAdminPacks(): Promise<AdminPack[]> {
    return request<AdminPack[]>('/api/admin/packs');
  },

  async createAdminPack(packData: { name: string; description?: string; categoryId?: string; status?: 'Draft' | 'Published' | 'Disabled'; items?: any[]; structure?: any[] }): Promise<AdminPack> {
    return request<AdminPack>('/api/admin/packs', {
      method: 'POST',
      body: JSON.stringify(packData),
    });
  },

  async updateAdminPack(id: string, updates: { name?: string; description?: string; categoryId?: string; status?: 'Draft' | 'Published' | 'Disabled'; items?: any[]; structure?: any[] }): Promise<AdminPack> {
    return request<AdminPack>(`/api/admin/packs/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async publishAdminPack(id: string): Promise<AdminPack> {
    return request<AdminPack>(`/api/admin/packs/${id}/publish`, {
      method: 'POST',
    });
  },

  async updateAdminPackStatus(id: string, status: 'Draft' | 'Published' | 'Disabled'): Promise<AdminPack> {
    return request<AdminPack>(`/api/admin/packs/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // User-facing Packs API
  async getAvailablePacks(): Promise<AdminPack[]> {
    return request<AdminPack[]>('/api/packs');
  },

  // Admin Content Library APIs
  async getAdminContentLibrary(): Promise<ContentLibraryItem[]> {
    return request<ContentLibraryItem[]>('/api/admin/content-library');
  },

  async createAdminContentItem(itemData: { name: string; description?: string; category: string; contentType: string; contentValue: string }): Promise<ContentLibraryItem> {
    return request<ContentLibraryItem>('/api/admin/content-library', {
      method: 'POST',
      body: JSON.stringify(itemData),
    });
  },

  async updateAdminContentItem(id: string, updates: { name?: string; description?: string; category?: string; contentType?: string; contentValue?: string; enabled?: boolean }): Promise<ContentLibraryItem> {
    return request<ContentLibraryItem>(`/api/admin/content-library/${id}`, {
      method: 'PUT',
      body: JSON.stringify(updates),
    });
  },

  async updateAdminContentItemStatus(id: string, enabled: boolean): Promise<ContentLibraryItem> {
    return request<ContentLibraryItem>(`/api/admin/content-library/${id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ enabled }),
    });
  },

  // User-facing Content Library API
  async getAvailableContentItems(): Promise<ContentLibraryItem[]> {
    return request<ContentLibraryItem[]>('/api/content-library');
  },
};
