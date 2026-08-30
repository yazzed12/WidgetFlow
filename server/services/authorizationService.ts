import { db } from '../db/database.js';
import { AppError } from '../middleware/errorHandler.js';
import type { ServerUser } from '../types/index.js';
import type { GovernanceLevel, PermissionKey, RoleType } from '../../src/shared/permissionCatalog.js';

type AuthorizationRow = {
  id: string;
  name: string;
  email: string;
  legacyRole: 'Employee' | 'Manager' | 'Director' | 'Admin';
  avatarInitials: string;
  avatarBg: string;
  department: string;
  status: string;
  roleId: string | null;
  roleKey: string | null;
  roleName: string | null;
  roleType: RoleType | null;
  governanceLevel: GovernanceLevel | null;
  roleActive: number | null;
  roleProtected: number | null;
};

function getAuthorizationRow(userId: string): AuthorizationRow | undefined {
  return db.prepare(`
    SELECT u.id, u.name, u.email, u.role as legacyRole,
           u.avatar_initials as avatarInitials, u.avatar_bg as avatarBg,
           u.department, COALESCE(u.status, 'Active') as status,
           r.id as roleId, r.key as roleKey, r.name as roleName, r.role_type as roleType,
           r.governance_level as governanceLevel, r.is_active as roleActive, r.is_protected as roleProtected
    FROM users u
    LEFT JOIN roles r ON r.id = u.role_id
    WHERE u.id = ?
  `).get(userId) as AuthorizationRow | undefined;
}

function permissionsForRole(roleId: string): PermissionKey[] {
  return (db.prepare(`SELECT permission_key FROM role_permissions WHERE role_id = ? ORDER BY permission_key`).all(roleId) as any[])
    .map((row) => row.permission_key as PermissionKey);
}

export const authorizationService = {
  resolveUser(userId: string): ServerUser | null {
    const row = getAuthorizationRow(userId);
    if (!row) return null;

    // role_id is authoritative whenever present. Legacy role fallback is only
    // for pre-migration system users and can never resolve a Custom role.
    let roleId = row.roleId;
    let roleKey = row.roleKey;
    let roleName = row.roleName;
    let roleType = row.roleType;
    let governanceLevel = row.governanceLevel;
    let roleActive = row.roleActive;
    let roleProtected = row.roleProtected;
    if (!roleId) {
      const systemRole = db.prepare(`
        SELECT id, key, name, role_type as roleType, governance_level as governanceLevel,
               is_active as roleActive, is_protected as roleProtected
        FROM roles WHERE role_type = 'System' AND name = ?
      `).get(row.legacyRole) as any;
      if (!systemRole) throw new AppError('User role assignment is not configured.', 403, 'ROLE_NOT_CONFIGURED');
      ({ id: roleId, key: roleKey, name: roleName, roleType, governanceLevel, roleActive, roleProtected } = systemRole);
    }

    return {
      id: row.id,
      name: row.name,
      email: row.email,
      role: roleName!,
      legacyRole: row.legacyRole,
      roleId: roleId!,
      roleKey: roleKey!,
      roleType: roleType!,
      governanceLevel: governanceLevel!,
      permissions: permissionsForRole(roleId!),
      roleActive: Boolean(roleActive),
      roleProtected: Boolean(roleProtected),
      status: row.status as ServerUser['status'],
      avatarInitials: row.avatarInitials,
      avatarBg: row.avatarBg,
      department: row.department,
    };
  },

  hasPermission(userOrId: ServerUser | string, permission: PermissionKey): boolean {
    const user = typeof userOrId === 'string' ? this.resolveUser(userOrId) : this.resolveUser(userOrId.id);
    return Boolean(user?.roleActive && user.permissions.includes(permission));
  },

  requirePermission(userOrId: ServerUser | string, permission: PermissionKey): ServerUser {
    const user = typeof userOrId === 'string' ? this.resolveUser(userOrId) : this.resolveUser(userOrId.id);
    if (!user || !user.roleActive || !user.permissions.includes(permission)) {
      throw new AppError(`Permission required: ${permission}.`, 403, 'PERMISSION_DENIED');
    }
    return user;
  },

  requireAnyPermission(userOrId: ServerUser | string, permissions: PermissionKey[]): ServerUser {
    const user = typeof userOrId === 'string' ? this.resolveUser(userOrId) : this.resolveUser(userOrId.id);
    if (!user || !user.roleActive || !permissions.some((permission) => user.permissions.includes(permission))) {
      throw new AppError(`One of these permissions is required: ${permissions.join(', ')}.`, 403, 'PERMISSION_DENIED');
    }
    return user;
  },

  isProtectedAdmin(userOrId: ServerUser | string | null | undefined): boolean {
    if (!userOrId) return false;
    const user = typeof userOrId === 'string' ? this.resolveUser(userOrId) : this.resolveUser(userOrId.id);
    return Boolean(
      user &&
      user.legacyRole === 'Admin' &&
      user.roleKey === 'admin' &&
      user.roleType === 'System' &&
      user.roleProtected
    );
  },

  requireAdmin(userOrId: ServerUser | string | null | undefined): ServerUser {
    if (!userOrId) throw new AppError('Admin authorization required.', 403, 'FORBIDDEN');
    const user = typeof userOrId === 'string' ? this.resolveUser(userOrId) : this.resolveUser(userOrId.id);
    if (!user || !this.isProtectedAdmin(user)) throw new AppError('Admin authorization required.', 403, 'FORBIDDEN');
    return user;
  },
};
