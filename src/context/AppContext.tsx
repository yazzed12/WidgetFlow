import React, { createContext, useContext, useState, useEffect } from 'react';
import type { ReactNode } from 'react';
import type {
  User,
  Category,
  WidgetTemplate,
  ApprovalRecord,
  Notification,
  ReportInstance,
  ReportComment,
  ViewType,
  WidgetLayoutType,
  RequestComment,
} from '../types';
import { DEMO_USERS, MOCK_CATEGORIES } from '../data/initialData';
import { getInitialState, saveStateToStorage, clearDemoStorage } from '../utils/storage';
import { apiService, setApiDemoUserId } from '../services/apiService';
import type { PermissionKey } from '../shared/permissionCatalog';
import { hasPermissionKeys } from '../shared/permissionCatalog';

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'info' | 'warning';
}

interface AppContextType {
  currentUser: User;
  users: User[];
  templates: WidgetTemplate[];
  categories: Category[];
  approvalRecords: ApprovalRecord[];
  requestComments: RequestComment[];
  reportComments: ReportComment[];
  notifications: Notification[];
  reports: ReportInstance[];
  activeView: ViewType;
  selectedCategory: string | null;
  searchTerm: string;
  sidebarOpen: boolean;
  toast: ToastState | null;

  // Modal & Drawer states
  isAddModalOpen: boolean;
  isChatDrawerOpen: boolean;
  isProfileModalOpen: boolean;
  isResetDemoModalOpen: boolean;
  draftToEdit: WidgetTemplate | null;
  selectedTemplateForDetail: WidgetTemplate | null;
  selectedRequestForDrawer: WidgetTemplate | null;
  selectedApprovalForDrawer: WidgetTemplate | null;
  selectedTemplateForFill: WidgetTemplate | null;
  selectedReportForView: ReportInstance | null;
  selectedReportForSend: ReportInstance | null;
  selectedReportForReturn: ReportInstance | null;
  selectedReportForReject: ReportInstance | null;
  selectedReportForSign: ReportInstance | null;
  reportToEdit: ReportInstance | null;

  // Navigation & UI Actions
  switchUser: (userId: string) => void;
  setActiveView: (view: ViewType) => void;
  setSelectedCategory: (catId: string | null) => void;
  setSearchTerm: (term: string) => void;
  setSidebarOpen: (open: boolean | ((prev: boolean) => boolean)) => void;
  markNotificationRead: (id: string) => void;
  markAllNotificationsRead: () => void;
  showToast: (message: string, type?: 'success' | 'info' | 'warning') => void;
  resetDemoData: () => void;

  // Modal & Drawer Triggers
  openAddTemplateModal: (draft?: WidgetTemplate | null) => void;
  closeAddTemplateModal: () => void;
  openTemplateDetail: (template: WidgetTemplate) => void;
  closeTemplateDetail: () => void;
  openRequestDetail: (template: WidgetTemplate) => void;
  closeRequestDetail: () => void;
  openApprovalDetail: (template: WidgetTemplate) => void;
  closeApprovalDetail: () => void;
  openFillReportModal: (template: WidgetTemplate, reportToEdit?: ReportInstance | null) => void;
  closeFillReportModal: () => void;
  openReportViewModal: (report: ReportInstance) => void;
  closeReportViewModal: () => void;

  openSendReportModal: (report: ReportInstance) => void;
  closeSendReportModal: () => void;
  openReturnReportModal: (report: ReportInstance) => void;
  closeReturnReportModal: () => void;
  openRejectReportModal: (report: ReportInstance) => void;
  closeRejectReportModal: () => void;
  openSignReportModal: (report: ReportInstance) => void;
  closeSignReportModal: () => void;

  openProfileModal: () => void;
  closeProfileModal: () => void;
  openResetDemoModal: () => void;
  closeResetDemoModal: () => void;

  toggleChatDrawer: (open?: boolean) => void;

  // Template Handlers
  saveTemplateDraft: (data: {
    name: string;
    categoryId: string;
    description: string;
    tags: string[];
    layoutType?: WidgetLayoutType;
  }, existingId?: string) => void;

  submitTemplateForApproval: (data: {
    name: string;
    categoryId: string;
    description: string;
    tags: string[];
    layoutType?: WidgetLayoutType;
  }, existingId?: string) => void;

  approveTemplate: (templateId: string) => void;
  rejectTemplate: (templateId: string, reason: string) => void;
  addRequestComment: (templateId: string, message: string) => void;

  // Report Instance Handlers
  createReportInstance: (
    payload: string | { templateId: string; data?: Record<string, any>; title?: string }
  ) => Promise<ReportInstance | undefined>;

  updateReportInstance: (
    reportId: string,
    data: Record<string, string | number>,
    title?: string,
    markAsCompleted?: boolean
  ) => Promise<void>;

  markReportCompleted: (reportId: string) => void;
  sendReport: (reportId: string, recipientId: string, senderNote?: string, signaturePayload?: any) => Promise<void>;
  returnReport: (reportId: string, feedback: string) => void;
  rejectReport: (reportId: string, reason: string) => Promise<void>;
  signReport: (reportId: string, payload?: any) => Promise<void>;
  addReportComment: (reportId: string, message: string) => void;

  claimTemplateReview: (templateId: string) => Promise<WidgetTemplate | undefined>;
  refreshTemplates: () => Promise<void>;
  refreshReports: () => Promise<void>;
  refreshAppData: () => Promise<void>;

  apiError: string | null;
  hasPermission: (permission: PermissionKey) => boolean;
  // Derived helpers
  getCategoryTemplateCount: (catId: string) => number;
  getApprovedTemplates: () => WidgetTemplate[];
  getPendingApprovalsForUser: () => WidgetTemplate[];
  getMyRequestsForUser: () => WidgetTemplate[];
  getReportsAwaitingMyReview: () => ReportInstance[];
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [initialDataLoaded, setInitialDataLoaded] = useState(false);
  const [currentUser, setCurrentUser] = useState<User>(DEMO_USERS[0]);
  const [users, setUsers] = useState<User[]>(DEMO_USERS);
  const [categories, setCategories] = useState<Category[]>(MOCK_CATEGORIES);
  const [templates, setTemplates] = useState<WidgetTemplate[]>([]);
  const [approvalRecords, setApprovalRecords] = useState<ApprovalRecord[]>([]);
  const [requestComments, setRequestComments] = useState<RequestComment[]>([]);
  const [reportComments, setReportComments] = useState<ReportComment[]>([]);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [reports, setReports] = useState<ReportInstance[]>([]);

  const [activeView, setActiveView] = useState<ViewType>('dashboard');
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [sidebarOpen, setSidebarOpen] = useState<boolean>(true);
  const [toast, setToast] = useState<ToastState | null>(null);

  // Modal / Drawer Control States
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isChatDrawerOpen, setIsChatDrawerOpen] = useState(false);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [isResetDemoModalOpen, setIsResetDemoModalOpen] = useState(false);
  const [draftToEdit, setDraftToEdit] = useState<WidgetTemplate | null>(null);
  const [selectedTemplateForDetail, setSelectedTemplateForDetail] = useState<WidgetTemplate | null>(null);
  const [selectedRequestForDrawer, setSelectedRequestForDrawer] = useState<WidgetTemplate | null>(null);
  const [selectedApprovalForDrawer, setSelectedApprovalForDrawer] = useState<WidgetTemplate | null>(null);
  const [selectedTemplateForFill, setSelectedTemplateForFill] = useState<WidgetTemplate | null>(null);
  const [selectedReportForView, setSelectedReportForView] = useState<ReportInstance | null>(null);
  const [selectedReportForSend, setSelectedReportForSend] = useState<ReportInstance | null>(null);
  const [selectedReportForReturn, setSelectedReportForReturn] = useState<ReportInstance | null>(null);
  const [selectedReportForReject, setSelectedReportForReject] = useState<ReportInstance | null>(null);
  const [selectedReportForSign, setSelectedReportForSign] = useState<ReportInstance | null>(null);
  const [reportToEdit, setReportToEdit] = useState<ReportInstance | null>(null);

  const [apiError, setApiError] = useState<string | null>(null);

  // Helper to sync from REST API (SQLite backend source of truth)
  const syncFromApi = async (userId: string) => {
    setApiDemoUserId(userId);
    try {
      const resolvedUser = await apiService.getMyAuthorization();
      setCurrentUser(resolvedUser);
      const [apiUsers, apiCategories] = await Promise.all([apiService.getUsers(), apiService.getCategories()]);
      setUsers(apiUsers);
      setCategories(apiCategories);
      const can = (permission: PermissionKey) => hasPermissionKeys(resolvedUser.permissions, permission);
      const [templateResult, reportResult, notificationResult] = await Promise.allSettled([
        can('templates.view_approved') || can('templates.create') ? apiService.getTemplates() : Promise.resolve([]),
        can('reports.view_own') || can('reports.view_received') || can('reports.view_organization') ? apiService.getReports() : Promise.resolve([]),
        can('notifications.view') ? apiService.getNotifications() : Promise.resolve([]),
      ]);
      setTemplates(templateResult.status === 'fulfilled' ? templateResult.value : []);
      setReports(reportResult.status === 'fulfilled' ? reportResult.value : []);
      setNotifications(notificationResult.status === 'fulfilled' ? notificationResult.value : []);
      setApiError(null);
    } catch (err: any) {
      console.error('Backend API sync error:', err);
      setApiError(err.message || 'Unable to connect to WidgetFlow API. Please verify server status.');
    }
  };

  // Initialize from LocalStorage or mock data, then sync with API
  useEffect(() => {
    const savedState = getInitialState();
    setTemplates(savedState.templates);
    setApprovalRecords(savedState.approvalRecords);
    setRequestComments(savedState.requestComments);
    setReportComments(savedState.reportComments || []);
    setNotifications(savedState.notifications);
    setReports(savedState.reports);

    const foundUser = DEMO_USERS.find((u) => u.id === savedState.currentUserId) || DEMO_USERS[0];
    setCurrentUser(foundUser);
    setInitialDataLoaded(true);

    syncFromApi(foundUser.id);
  }, []);

  // Save changes to LocalStorage when core state changes
  useEffect(() => {
    if (!initialDataLoaded) return;
    saveStateToStorage({
      currentUserId: currentUser.id,
      templates,
      approvalRecords,
      requestComments,
      reportComments,
      notifications,
      reports,
    });
  }, [currentUser.id, templates, approvalRecords, requestComments, reportComments, notifications, reports, initialDataLoaded]);

  const switchUser = (userId: string) => {
    const targetUser = users.find((u) => u.id === userId);
    if (targetUser) {
      setCurrentUser(targetUser);
      setApiDemoUserId(targetUser.id);
      syncFromApi(targetUser.id);
      showToast(`Viewing as ${targetUser.name} · ${targetUser.role}`, 'info');
    }
  };

  const markNotificationRead = async (id: string) => {
    try {
      const updatedNotifs = await apiService.markNotificationRead(id);
      setNotifications(updatedNotifs);
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true } : n))
      );
    }
  };

  const markAllNotificationsRead = async () => {
    try {
      const updatedNotifs = await apiService.markAllNotificationsRead();
      setNotifications(updatedNotifs);
    } catch {
      setNotifications((prev) =>
        prev.map((n) => (n.userId === currentUser.id ? { ...n, read: true } : n))
      );
    }
    showToast('All notifications marked as read', 'success');
  };

  const showToast = (message: string, type: 'success' | 'info' | 'warning' = 'info') => {
    const newToast = { id: Date.now(), message, type };
    setToast(newToast);
    setTimeout(() => {
      setToast((current) => (current?.id === newToast.id ? null : current));
    }, 4000);
  };

  const resetDemoData = async () => {
    try {
      await apiService.resetDemo();
    } catch (err) {
      console.error('API demo reset error:', err);
    }
    const reset = clearDemoStorage();
    setTemplates(reset.templates);
    setApprovalRecords(reset.approvalRecords);
    setRequestComments(reset.requestComments);
    setReportComments(reset.reportComments || []);
    setNotifications(reset.notifications);
    setReports(reset.reports);
    setCurrentUser(DEMO_USERS[0]);
    setUsers(DEMO_USERS);
    setApiDemoUserId(DEMO_USERS[0].id);
    setActiveView('dashboard');
    setSelectedCategory(null);
    setSearchTerm('');
    setIsAddModalOpen(false);
    setIsChatDrawerOpen(false);
    setIsProfileModalOpen(false);
    setIsResetDemoModalOpen(false);
    setDraftToEdit(null);
    setSelectedTemplateForDetail(null);
    setSelectedRequestForDrawer(null);
    setSelectedApprovalForDrawer(null);
    setSelectedTemplateForFill(null);
    setSelectedReportForView(null);
    setSelectedReportForSend(null);
    setSelectedReportForReturn(null);
    setSelectedReportForSign(null);
    setReportToEdit(null);
    syncFromApi(DEMO_USERS[0].id);
    showToast('Demo data restored', 'success');
  };

  // Modal / Drawer Handlers
  const openAddTemplateModal = (draft?: WidgetTemplate | null) => {
    setDraftToEdit(draft || null);
    setIsAddModalOpen(true);
  };

  const closeAddTemplateModal = () => {
    setIsAddModalOpen(false);
    setDraftToEdit(null);
  };

  const openTemplateDetail = (template: WidgetTemplate) => {
    setSelectedTemplateForDetail(template);
  };

  const closeTemplateDetail = () => {
    setSelectedTemplateForDetail(null);
  };

  const openRequestDetail = (template: WidgetTemplate) => {
    setSelectedRequestForDrawer(template);
  };

  const closeRequestDetail = () => {
    setSelectedRequestForDrawer(null);
  };

  const openApprovalDetail = (template: WidgetTemplate) => {
    setSelectedApprovalForDrawer(template);
  };

  const closeApprovalDetail = () => {
    setSelectedApprovalForDrawer(null);
  };

  const openFillReportModal = (template: WidgetTemplate, reportInstanceToEdit?: ReportInstance | null) => {
    setSelectedTemplateForFill(template);
    setReportToEdit(reportInstanceToEdit || null);
  };

  const closeFillReportModal = () => {
    setSelectedTemplateForFill(null);
    setReportToEdit(null);
  };

  const openReportViewModal = (report: ReportInstance) => {
    setSelectedReportForView(report);
  };

  const closeReportViewModal = () => {
    setSelectedReportForView(null);
  };

  const openSendReportModal = (report: ReportInstance) => {
    setSelectedReportForSend(report);
  };

  const closeSendReportModal = () => {
    setSelectedReportForSend(null);
  };

  const openReturnReportModal = (report: ReportInstance) => {
    setSelectedReportForReturn(report);
  };

  const closeReturnReportModal = () => {
    setSelectedReportForReturn(null);
  };

  const openRejectReportModal = (report: ReportInstance) => {
    setSelectedReportForReject(report);
  };

  const closeRejectReportModal = () => {
    setSelectedReportForReject(null);
  };

  const openSignReportModal = (report: ReportInstance) => {
    setSelectedReportForSign(report);
  };

  const closeSignReportModal = () => {
    setSelectedReportForSign(null);
  };

  const openProfileModal = () => {
    setIsProfileModalOpen(true);
  };

  const closeProfileModal = () => {
    setIsProfileModalOpen(false);
  };

  const openResetDemoModal = () => {
    setIsResetDemoModalOpen(true);
  };

  const closeResetDemoModal = () => {
    setIsResetDemoModalOpen(false);
  };

  const toggleChatDrawer = (open?: boolean) => {
    setIsChatDrawerOpen((prev) => (open !== undefined ? open : !prev));
  };

  // Centralized API Refresh Functions
  const refreshTemplates = async () => {
    try {
      const data = await apiService.getTemplates();
      setTemplates(data);
    } catch (err: any) {
      console.warn('Failed to refresh templates:', err.message);
    }
  };

  const refreshReports = async () => {
    try {
      const data = await apiService.getReports();
      setReports(data);
    } catch (err: any) {
      console.warn('Failed to refresh reports:', err.message);
    }
  };

  const refreshNotifications = async () => {
    try {
      const data = await apiService.getNotifications();
      setNotifications(data);
    } catch (err: any) {
      console.warn('Failed to refresh notifications:', err.message);
    }
  };

  const refreshCategories = async () => {
    try {
      const data = await apiService.getCategories();
      setCategories(data);
    } catch (err: any) {
      console.warn('Failed to refresh categories:', err.message);
    }
  };

  // Save Draft Action for Report Template
  const saveTemplateDraft = async (
    data: {
      name: string;
      categoryId: string;
      description: string;
      tags: string[];
      layoutType?: WidgetLayoutType;
    },
    existingId?: string
  ) => {
    try {
      await apiService.saveTemplateDraft({ ...data, id: existingId });
      await Promise.all([refreshTemplates(), refreshCategories()]);
      showToast('Report template saved as draft', 'info');
      closeAddTemplateModal();
    } catch (err: any) {
      showToast(err.message || 'Failed to save template draft', 'warning');
    }
  };

  // Submit Template for Approval Action
  const submitTemplateForApproval = async (
    data: {
      name: string;
      categoryId: string;
      description: string;
      tags: string[];
      layoutType?: WidgetLayoutType;
    },
    existingId?: string
  ) => {
    try {
      // 1. Create or update template draft first
      const savedTemplate = await apiService.saveTemplateDraft({ ...data, id: existingId });
      if (!savedTemplate || !savedTemplate.id) {
        throw new Error('Failed to create template draft prior to submission.');
      }

      // 2. Submit specific template by ID
      const result = await apiService.submitTemplate(savedTemplate.id, data);
      await Promise.all([refreshTemplates(), refreshNotifications(), refreshCategories()]);
      if (result.status === 'Approved') {
        showToast('Report template published directly to firm library!', 'success');
      } else {
        showToast(`Template request submitted to ${result.requestedApprovalFromName || 'approver'}`, 'success');
      }
      closeAddTemplateModal();
    } catch (err: any) {
      showToast(err.message || 'Failed to submit template for approval', 'warning');
    }
  };

  // Approve Template Action
  const approveTemplate = async (templateId: string) => {
    try {
      const tpl = await apiService.approveTemplate(templateId);
      await Promise.all([refreshTemplates(), refreshNotifications(), refreshCategories()]);
      showToast(`Approved "${tpl.name}". Now published firm-wide.`, 'success');
      closeApprovalDetail();
    } catch (err: any) {
      showToast(err.message || 'Failed to approve template', 'warning');
    }
  };

  // Reject Template Action
  const rejectTemplate = async (templateId: string, reason: string) => {
    try {
      const tpl = await apiService.rejectTemplate(templateId, reason);
      await Promise.all([refreshTemplates(), refreshNotifications()]);
      showToast(`Rejected "${tpl.name}". Feedback sent to author.`, 'info');
      closeApprovalDetail();
    } catch (err: any) {
      showToast(err.message || 'Failed to reject template', 'warning');
    }
  };

  // Claim Template Review Action
  const claimTemplateReview = async (templateId: string) => {
    try {
      const tpl = await apiService.claimTemplateReview(templateId);
      await Promise.all([refreshTemplates(), refreshNotifications()]);
      showToast(`Claimed review for "${tpl.name}".`, 'success');
      return tpl;
    } catch (err: any) {
      showToast(err.message || 'Failed to claim template review', 'warning');
      throw err;
    }
  };

  // Add Template Comment Action
  const addRequestComment = async (templateId: string, message: string) => {
    try {
      await apiService.addTemplateComment(templateId, message);
      await Promise.all([refreshTemplates(), refreshNotifications()]);
      showToast('Comment posted', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to post comment', 'warning');
    }
  };

  // Create Report Instance from Approved Template
  const createReportInstance = async (
    payload: string | { templateId: string; data?: Record<string, any>; title?: string }
  ): Promise<ReportInstance | undefined> => {
    const tplId = typeof payload === 'string' ? payload : payload.templateId;
    const initialData = typeof payload === 'object' ? payload.data : undefined;
    const initialTitle = typeof payload === 'object' ? payload.title : undefined;

    try {
      const newReport = await apiService.createReport(tplId, initialData, initialTitle);
      await refreshReports();
      showToast(`Created report instance "${newReport.title}"`, 'success');
      return newReport;
    } catch (err: any) {
      showToast(err.message || 'Failed to create report instance', 'warning');
      throw err;
    }
  };

  // Update Report Instance
  const updateReportInstance = async (
    reportId: string,
    data: Record<string, string | number>,
    title?: string,
    markAsCompleted?: boolean
  ) => {
    try {
      if (markAsCompleted) {
        await apiService.markReportCompleted(reportId, data, title);
        showToast('Report completed and marked ready for review', 'success');
      } else {
        await apiService.updateReport(reportId, data, title);
        showToast('Report draft updates saved', 'info');
      }
      await refreshReports();
      closeFillReportModal();
    } catch (err: any) {
      showToast(err.message || 'Failed to update report', 'warning');
    }
  };

  // Mark Report Completed
  const markReportCompleted = async (reportId: string) => {
    const report = reports.find((r) => r.id === reportId);
    if (!report) return;
    try {
      await apiService.markReportCompleted(reportId, report.data, report.title);
      await refreshReports();
      showToast('Report marked completed and ready to send', 'success');
    } catch (err: any) {
      showToast(err.message || 'Failed to complete report', 'warning');
    }
  };

  // Send Report Action
  const sendReport = async (reportId: string, recipientUserId: string, senderNote?: string, signaturePayload?: any) => {
    try {
      const updated = await apiService.sendReport(reportId, recipientUserId, senderNote, signaturePayload);
      await Promise.all([refreshReports(), refreshNotifications()]);
      showToast(`Report sent to ${updated.sentToName} for review & signature`, 'success');
      closeSendReportModal();
    } catch (err: any) {
      showToast(err.message || 'Failed to send report', 'warning');
      throw err;
    }
  };

  // Return Report Action
  const returnReport = async (reportId: string, feedback: string) => {
    try {
      await apiService.returnReport(reportId, feedback);
      await Promise.all([refreshReports(), refreshNotifications()]);
      showToast('Report returned to author for changes', 'info');
      closeReturnReportModal();
    } catch (err: any) {
      showToast(err.message || 'Failed to return report', 'warning');
    }
  };

  // Reject Report Action
  const rejectReport = async (reportId: string, reason: string) => {
    try {
      await apiService.rejectReport(reportId, reason);
      await Promise.all([refreshReports(), refreshNotifications()]);
      showToast('Report rejected', 'info');
      closeRejectReportModal();
    } catch (err: any) {
      showToast(err.message || 'Failed to reject report', 'warning');
    }
  };

  // Sign Report Action
  const signReport = async (reportId: string, payload: any = {}) => {
    try {
      const updated = await apiService.signReport(reportId, payload);
      await Promise.all([refreshReports(), refreshNotifications()]);
      const verId = updated.signature?.verificationId || updated.activeSignatures?.[updated.activeSignatures.length - 1]?.verificationId || 'SIG-VERIFIED';
      showToast(`Report signed successfully (${verId})`, 'success');
      closeSignReportModal();
    } catch (err: any) {
      showToast(err.message || 'Failed to sign report', 'warning');
      throw err;
    }
  };

  // Add Report Comment Action
  const addReportComment = async (reportId: string, message: string) => {
    try {
      await apiService.addReportComment(reportId, message);
      await Promise.all([refreshReports(), refreshNotifications()]);
      showToast('Comment posted', 'info');
    } catch (err: any) {
      showToast(err.message || 'Failed to post comment', 'warning');
    }
  };

  // Derived helpers
  const getApprovedTemplates = () => {
    return templates.filter((t) => t.status === 'Approved');
  };

  const getCategoryTemplateCount = (catId: string) => {
    return templates.filter((t) => t.categoryId === catId && t.status === 'Approved').length;
  };

  const getPendingApprovalsForUser = () => {
    return templates.filter(
      (t) => t.status === 'Pending Approval' && t.requestedApprovalFromUserId === currentUser.id
    );
  };

  const getMyRequestsForUser = () => {
    return templates.filter((t) => t.createdById === currentUser.id);
  };

  const getReportsAwaitingMyReview = () => {
    return reports.filter(
      (r) => r.status === 'Sent' && r.sentToId === currentUser.id
    );
  };

  const hasPermission = (permission: PermissionKey) => hasPermissionKeys(currentUser.permissions, permission);

  return (
    <AppContext.Provider
      value={{
        currentUser,
        users,
        templates,
        categories,
        approvalRecords,
        requestComments,
        reportComments,
        notifications,
        reports,
        activeView,
        selectedCategory,
        searchTerm,
        sidebarOpen,
        toast,
        isAddModalOpen,
        isChatDrawerOpen,
        draftToEdit,
        selectedTemplateForDetail,
        selectedRequestForDrawer,
        selectedApprovalForDrawer,
        selectedTemplateForFill,
        selectedReportForView,
        selectedReportForSend,
        selectedReportForReturn,
        selectedReportForReject,
        selectedReportForSign,
        reportToEdit,
        isProfileModalOpen,
        isResetDemoModalOpen,
        switchUser,
        setActiveView,
        setSelectedCategory,
        setSearchTerm,
        setSidebarOpen,
        markNotificationRead,
        markAllNotificationsRead,
        showToast,
        resetDemoData,
        openAddTemplateModal,
        closeAddTemplateModal,
        openTemplateDetail,
        closeTemplateDetail,
        openRequestDetail,
        closeRequestDetail,
        openApprovalDetail,
        closeApprovalDetail,
        openFillReportModal,
        closeFillReportModal,
        openReportViewModal,
        closeReportViewModal,
        openSendReportModal,
        closeSendReportModal,
        openReturnReportModal,
        closeReturnReportModal,
        openRejectReportModal,
        closeRejectReportModal,
        openSignReportModal,
        closeSignReportModal,
        openProfileModal,
        closeProfileModal,
        openResetDemoModal,
        closeResetDemoModal,
        toggleChatDrawer,
        saveTemplateDraft,
        submitTemplateForApproval,
        approveTemplate,
        rejectTemplate,
        claimTemplateReview,
        addRequestComment,
        createReportInstance,
        updateReportInstance,
        markReportCompleted,
        sendReport,
        returnReport,
        rejectReport,
        signReport,
        addReportComment,
        refreshTemplates,
        refreshReports,
        refreshAppData: () => syncFromApi(currentUser.id),
        apiError,
        hasPermission,
        getCategoryTemplateCount,
        getApprovedTemplates,
        getPendingApprovalsForUser,
        getMyRequestsForUser,
        getReportsAwaitingMyReview,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
