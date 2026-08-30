import type { Request } from 'express';
import type { GovernanceLevel, PermissionKey, RoleType } from '../../src/shared/permissionCatalog.js';

export interface ServerUser {
  id: string;
  name: string;
  email: string;
  role: string;
  legacyRole: 'Employee' | 'Manager' | 'Director' | 'Admin';
  roleId: string;
  roleKey: string;
  roleType: RoleType;
  governanceLevel: GovernanceLevel;
  permissions: PermissionKey[];
  roleActive: boolean;
  roleProtected: boolean;
  status: 'Active' | 'Inactive' | 'Resigned' | 'Terminated';
  avatarInitials: string;
  avatarBg: string;
  department: string;
}

export interface AuthenticatedRequest extends Request {
  user?: ServerUser;
}
