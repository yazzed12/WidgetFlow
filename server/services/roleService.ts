import { db } from '../db/database.js';
import { authorizationService } from './authorizationService.js';
import { adminAuditService } from './adminAuditService.js';
import { governancePolicyService } from './governancePolicyService.js';
import { PERMISSION_KEY_SET, getDefaultSystemRolePermissions } from '../../src/shared/permissionCatalog.js';
import type { GovernanceLevel, PermissionKey } from '../../src/shared/permissionCatalog.js';
import type { ServerUser } from '../types/index.js';

type RoleInput = {
  name: string;
  description?: string;
  governanceLevel: GovernanceLevel;
  isActive?: boolean;
  permissions?: PermissionKey[];
};

function normalizedRoleKey(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
}

function validateInput(input: RoleInput) {
  const name = input.name?.trim();
  if (!name) throw new Error('Role name is required.');
  const key = normalizedRoleKey(name);
  if (!key) throw new Error('Role name must contain letters or numbers.');
  if (!['Employee', 'Manager', 'Director', 'None'].includes(input.governanceLevel)) throw new Error('Invalid Governance Level.');
  const permissions = [...new Set(input.permissions || [])];
  if (permissions.some((permission) => !PERMISSION_KEY_SET.has(permission))) throw new Error('Role contains an unsupported permission.');
  if (input.governanceLevel === 'None' && permissions.includes('templates.submit')) {
    throw new Error('Template submission requires an Employee, Manager, or Director Governance Level.');
  }
  return { name, key, permissions };
}

function serializePermissions(permissions: string[]): string {
  return [...permissions].sort().join(', ');
}

function validateRolePermissionsDependency(previousRole: any, permissions: PermissionKey[]) {
  if (!governancePolicyService.isTemplateGovernanceEnabled()) return;

  const hasApprovalCapability = permissions.includes('template_approvals.approve') && permissions.includes('template_approvals.view');
  if (hasApprovalCapability) return;

  const routingTargets = governancePolicyService.targetRoleIds();
  const isEmployeeTarget = previousRole.id === routingTargets.employee || previousRole.key === routingTargets.employee;
  const isManagerTarget = previousRole.id === routingTargets.manager || previousRole.key === routingTargets.manager;
  const isDirectorTarget = previousRole.id === routingTargets.director || previousRole.key === routingTargets.director;

  if (isEmployeeTarget) {
    const empSubmitting = db.prepare(`
      SELECT COUNT(*) as count FROM users u
      JOIN roles r ON r.id = u.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.governance_level = 'Employee' AND rp.permission_key = 'templates.submit' AND r.is_active = 1 AND COALESCE(u.status, 'Active') = 'Active'
    `).get() as { count: number };
    if (empSubmitting && empSubmitting.count > 0) {
      throw new Error(`This change would make '${previousRole.name}' unable to approve Employee-level Template submissions because it is the configured approval target.`);
    }
  }

  if (isManagerTarget) {
    const mgrSubmitting = db.prepare(`
      SELECT COUNT(*) as count FROM users u
      JOIN roles r ON r.id = u.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.governance_level = 'Manager' AND rp.permission_key = 'templates.submit' AND r.is_active = 1 AND COALESCE(u.status, 'Active') = 'Active'
    `).get() as { count: number };
    if (mgrSubmitting && mgrSubmitting.count > 0) {
      throw new Error(`This change would make '${previousRole.name}' unable to approve Manager-level Template submissions because it is the configured approval target.`);
    }
  }

  if (isDirectorTarget) {
    const dirSubmitting = db.prepare(`
      SELECT COUNT(*) as count FROM users u
      JOIN roles r ON r.id = u.role_id
      JOIN role_permissions rp ON rp.role_id = r.id
      WHERE r.governance_level = 'Director' AND rp.permission_key = 'templates.submit' AND r.is_active = 1 AND COALESCE(u.status, 'Active') = 'Active'
    `).get() as { count: number };
    if (dirSubmitting && dirSubmitting.count > 0) {
      throw new Error(`This change would make '${previousRole.name}' unable to approve Director-level Template submissions because it is the configured approval target.`);
    }
  }
}

export const roleService = {
  getRoles() {
    const roles = db.prepare(`
      SELECT r.id, r.key, r.name, r.description, r.role_type as roleType,
             r.governance_level as governanceLevel, r.is_active as isActive,
             r.is_protected as isProtected, r.created_by as createdBy,
             r.created_at as createdAt, r.updated_at as updatedAt,
             COUNT(u.id) as assignedUsers,
             SUM(CASE WHEN u.id IS NOT NULL AND COALESCE(u.status, 'Active') = 'Active' THEN 1 ELSE 0 END) as activeAssignedUsers
      FROM roles r
      LEFT JOIN users u ON u.role_id = r.id
      GROUP BY r.id
      ORDER BY CASE r.key WHEN 'employee' THEN 1 WHEN 'manager' THEN 2 WHEN 'director' THEN 3 WHEN 'admin' THEN 4 ELSE 5 END, r.name
    `).all() as any[];
    const permissionsStmt = db.prepare(`SELECT permission_key FROM role_permissions WHERE role_id = ? ORDER BY permission_key`);
    return roles.map((role) => ({
      ...role,
      isActive: Boolean(role.isActive),
      isProtected: Boolean(role.isProtected),
      assignedUsers: Number(role.assignedUsers || 0),
      activeAssignedUsers: Number(role.activeAssignedUsers || 0),
      permissions: (permissionsStmt.all(role.id) as any[]).map((row) => row.permission_key),
    }));
  },

  getRoleById(roleId: string) {
    return this.getRoles().find((role) => role.id === roleId) || null;
  },

  getAssignableRoles() {
    return this.getRoles().filter((role) => role.isActive && role.key !== 'admin');
  },

  createRole(input: RoleInput, actor: ServerUser) {
    const admin = authorizationService.requireAdmin(actor);
    const { name, key, permissions } = validateInput(input);
    const duplicate = db.prepare(`SELECT id FROM roles WHERE name = ? COLLATE NOCASE OR key = ? COLLATE NOCASE`).get(name, key);
    if (duplicate) throw new Error('A role with this name or key already exists.');
    const roleId = `role-custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const now = new Date().toISOString();
    db.transaction(() => {
      db.prepare(`
        INSERT INTO roles (id, key, name, description, role_type, governance_level, is_active, is_protected, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'Custom', ?, ?, 0, ?, ?, ?)
      `).run(roleId, key, name, (input.description || '').trim(), input.governanceLevel, input.isActive === false ? 0 : 1, admin.id, now, now);
      const insertPermission = db.prepare(`INSERT INTO role_permissions (id, role_id, permission_key) VALUES (?, ?, ?)`);
      permissions.forEach((permission, index) => insertPermission.run(`rp-${roleId}-${index}`, roleId, permission));
    })();
    adminAuditService.record({ actorId: admin.id, actorName: admin.name, actorRole: admin.role, action: 'ROLE_CREATED', target: name, previousValue: '', newValue: `${input.governanceLevel} | ${serializePermissions(permissions)}` });
    return this.getRoleById(roleId);
  },

  updateRole(roleId: string, input: Partial<RoleInput>, actor: ServerUser) {
    const admin = authorizationService.requireAdmin(actor);
    const previous = this.getRoleById(roleId);
    if (!previous) throw new Error('Role not found.');
    if (previous.key === 'admin' || (previous.roleType === 'System' && previous.isProtected && previous.key === 'admin')) {
      throw new Error('The Admin role permissions are protected and cannot be modified.');
    }

    const isSystemRole = previous.roleType === 'System';

    const merged: RoleInput = {
      name: isSystemRole ? previous.name : (input.name ?? previous.name),
      description: input.description ?? previous.description,
      governanceLevel: isSystemRole ? previous.governanceLevel : (input.governanceLevel ?? previous.governanceLevel),
      isActive: isSystemRole ? true : (input.isActive ?? previous.isActive),
      permissions: input.permissions ?? previous.permissions,
    };
    const { name, key, permissions } = validateInput(merged);

    if (!isSystemRole) {
      const duplicate = db.prepare(`SELECT id FROM roles WHERE id != ? AND (name = ? COLLATE NOCASE OR key = ? COLLATE NOCASE)`).get(roleId, name, key);
      if (duplicate) throw new Error('A role with this name or key already exists.');
      if (!merged.isActive && previous.isActive) {
        const routingTargets = governancePolicyService.targetRoleIds();
        const isTarget = previous.id === routingTargets.employee || previous.key === routingTargets.employee ||
                         previous.id === routingTargets.manager || previous.key === routingTargets.manager ||
                         previous.id === routingTargets.director || previous.key === routingTargets.director;
        if (isTarget) {
          throw new Error('This role is currently used as a Template Governance approval target. Update Template Governance routing before deactivating it.');
        }
        if (previous.activeAssignedUsers > 0) {
          throw new Error(`This role is currently assigned to ${previous.activeAssignedUsers} active users. Reassign those users before deactivating the role.`);
        }
      }
    }

    if (input.permissions !== undefined) {
      validateRolePermissionsDependency(previous, permissions);
    }

    const permissionsChanged = serializePermissions(previous.permissions) !== serializePermissions(permissions);
    db.transaction(() => {
      db.prepare(`
        UPDATE roles SET name = ?, key = ?, description = ?, governance_level = ?, is_active = ?, updated_at = datetime('now')
        WHERE id = ?
      `).run(name, key, (merged.description || '').trim(), merged.governanceLevel, merged.isActive ? 1 : 0, roleId);
      if (input.permissions !== undefined) {
        db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).run(roleId);
        const insertPermission = db.prepare(`INSERT INTO role_permissions (id, role_id, permission_key) VALUES (?, ?, ?)`);
        permissions.forEach((permission, index) => insertPermission.run(`rp-${roleId}-${index}-${Date.now()}`, roleId, permission));
      }
    })();

    if (permissionsChanged) {
      const auditAction = isSystemRole ? 'SYSTEM_ROLE_PERMISSIONS_CHANGED' : 'ROLE_PERMISSIONS_CHANGED';
      adminAuditService.record({
        actorId: admin.id,
        actorName: admin.name,
        actorRole: admin.role,
        action: auditAction,
        target: name,
        previousValue: serializePermissions(previous.permissions),
        newValue: serializePermissions(permissions),
      });
    }

    if (!isSystemRole) {
      const statusChanged = previous.isActive !== merged.isActive;
      adminAuditService.record({
        actorId: admin.id,
        actorName: admin.name,
        actorRole: admin.role,
        action: statusChanged ? (merged.isActive ? 'ROLE_ACTIVATED' : 'ROLE_DEACTIVATED') : 'ROLE_UPDATED',
        target: name,
        previousValue: `${previous.name} | ${previous.governanceLevel} | ${previous.isActive ? 'Active' : 'Inactive'}`,
        newValue: `${name} | ${merged.governanceLevel} | ${merged.isActive ? 'Active' : 'Inactive'}`,
      });
    }

    return this.getRoleById(roleId);
  },

  restoreDefaultRolePermissions(roleId: string, actor: ServerUser) {
    const admin = authorizationService.requireAdmin(actor);
    const role = this.getRoleById(roleId);
    if (!role || role.roleType !== 'System' || role.key === 'admin') {
      throw new Error('Only operational System Roles (Employee, Manager, Director) can be restored to baseline defaults.');
    }
    const defaultPermissions = getDefaultSystemRolePermissions(role.key);
    const previousPermissions = serializePermissions(role.permissions);

    db.transaction(() => {
      db.prepare(`DELETE FROM role_permissions WHERE role_id = ?`).run(roleId);
      const insertPermission = db.prepare(`INSERT INTO role_permissions (id, role_id, permission_key) VALUES (?, ?, ?)`);
      defaultPermissions.forEach((permission, index) => insertPermission.run(`rp-${roleId}-${index}-${Date.now()}`, roleId, permission));
      db.prepare(`UPDATE roles SET updated_at = datetime('now') WHERE id = ?`).run(roleId);
    })();

    adminAuditService.record({
      actorId: admin.id,
      actorName: admin.name,
      actorRole: admin.role,
      action: 'RESTORE_DEFAULT_ROLE_PERMISSIONS',
      target: role.name,
      previousValue: previousPermissions,
      newValue: serializePermissions(defaultPermissions),
    });

    return this.getRoleById(roleId);
  },

  duplicateRole(roleId: string, name: string, actor: ServerUser) {
    const source = this.getRoleById(roleId);
    if (!source || source.key === 'admin') throw new Error('This role cannot be duplicated.');
    return this.createRole({
      name,
      description: source.description,
      governanceLevel: source.governanceLevel,
      isActive: true,
      permissions: source.permissions,
    }, actor);
  },
};
