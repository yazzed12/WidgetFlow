import type { Category, OrganizationalRole, User, AdminPack } from '../../../types';

export type AdminPermissionDefinition = {
  key: string;
  groupKey: string;
  label: string;
  description?: string;
};

export type AdminRoleCatalog = {
  roles: OrganizationalRole[];
  permissions: AdminPermissionDefinition[];
};

export type AdminAuditRecord = {
  id: string;
  timestamp: string;
  actor_name: string;
  actor_role: string;
  action: string;
  target: string;
  previous_value: string | null;
  new_value: string | null;
};

export type AdminOverviewSummary = {
  userCount: number;
  activeUserCount: number;
  roleCount: number;
  customRoleCount: number;
  categoryCount: number;
  activeCategoryCount: number;
  packCount: number;
  publishedPackCount: number;
  contentItemCount: number;
  enabledContentItemCount: number;
  featureCount: number;
  enabledFeatureCount: number;
  elementCount: number;
  enabledElementCount: number;
  auditEventCount: number;
  recentAudit: AdminAuditRecord[];
};

export type AdminUsersAndRoles = { users: User[]; roles: OrganizationalRole[] };
export type AdminCategory = Category;
export type AdminStandardPack = AdminPack;

