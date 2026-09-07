import { authorizationService } from './authorizationService.js';
import type { ServerUser } from '../types/index.js';

type TemplateResource = {
  status: string;
  createdById: string;
  requestedApprovalFromUserId?: string | null;
  targetRoleId?: string | null;
  assignmentStrategySnapshot?: string | null;
};

type ReportResource = { createdById: string; sentToId?: string | null };

export const resourceAccessService = {
  canAccessTemplate(user: ServerUser, template: TemplateResource): boolean {
    const current = authorizationService.resolveUser(user.id);
    if (!current || current.status !== 'Active' || !current.roleActive) return false;
    if (authorizationService.isProtectedAdmin(current)) return true;
    if (template.status === 'Approved' && authorizationService.hasPermission(current, 'templates.view_approved')) return true;
    if (template.createdById === current.id && authorizationService.hasPermission(current, 'templates.create')) return true;
    if (!authorizationService.hasPermission(current, 'template_approvals.view')) return false;
    if (template.requestedApprovalFromUserId === current.id) return true;
    return template.status === 'Pending Approval' &&
      template.assignmentStrategySnapshot === 'ROLE_QUEUE' &&
      !template.requestedApprovalFromUserId &&
      template.targetRoleId === current.roleId &&
      authorizationService.hasPermission(current, 'template_approvals.approve');
  },

  canAccessReport(user: ServerUser, report: ReportResource): boolean {
    const current = authorizationService.resolveUser(user.id);
    if (!current || current.status !== 'Active' || !current.roleActive) return false;
    return (report.createdById === current.id && authorizationService.hasPermission(current, 'reports.view_own')) ||
      (report.sentToId === current.id && authorizationService.hasPermission(current, 'reports.view_received')) ||
      authorizationService.hasPermission(current, 'reports.view_organization');
  },
};
