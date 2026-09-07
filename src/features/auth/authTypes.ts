import type { Session, User as SupabaseAuthUser } from '@supabase/supabase-js';
import type { User } from '../../types/index.js';
import type { GovernanceLevel, PermissionKey, RoleType } from '../../shared/permissionCatalog.js';

export type ProfileStatus = 'Active' | 'Inactive' | 'Resigned' | 'Terminated';

export type CurrentPrincipalRow = {
  user_id: string;
  full_name: string;
  email: string;
  profile_code: string;
  profile_status: ProfileStatus;
  role_id: string;
  role_key: string;
  role_name: string;
  role_type: RoleType;
  governance_level: GovernanceLevel;
  role_active: boolean;
  role_protected: boolean;
  effective_permissions: string[];
};

export type AuthPrincipal = {
  userId: string;
  fullName: string;
  email: string;
  profileCode: string;
  profileStatus: ProfileStatus;
  roleId: string;
  roleKey: string;
  roleName: string;
  roleType: RoleType;
  governanceLevel: GovernanceLevel;
  roleActive: boolean;
  roleProtected: boolean;
  effectivePermissions: PermissionKey[];
};

export type AuthStatus =
  | 'initializing'
  | 'unauthenticated'
  | 'authenticating'
  | 'authenticated'
  | 'blocked';

export type AuthErrorCode =
  | 'INVALID_CREDENTIALS'
  | 'ACCOUNT_INACTIVE'
  | 'ACCOUNT_NOT_CONFIGURED'
  | 'AUTH_UNAVAILABLE'
  | 'AUTH_CONFIGURATION';

export type AuthError = { code: AuthErrorCode; message: string };
export type LoginCredentials = { email: string; password: string };

export type AuthSessionState = {
  status: AuthStatus;
  session: Session | null;
  authUser: SupabaseAuthUser | null;
  principal: AuthPrincipal | null;
  error: AuthError | null;
};

export function isProtectedAdmin(principal: AuthPrincipal | null | undefined): boolean {
  return Boolean(
    principal &&
    principal.profileStatus === 'Active' &&
    principal.roleActive &&
    principal.roleType === 'System' &&
    principal.roleKey.trim().toLowerCase() === 'admin' &&
    principal.roleProtected,
  );
}

function initials(fullName: string): string {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?';
}

export function principalToAppUser(principal: AuthPrincipal): User {
  return {
    id: principal.userId,
    profileCode: principal.profileCode,
    name: principal.fullName,
    email: principal.email,
    role: principal.roleName,
    roleId: principal.roleId,
    roleKey: principal.roleKey,
    roleType: principal.roleType,
    governanceLevel: principal.governanceLevel,
    permissions: principal.effectivePermissions,
    roleActive: principal.roleActive,
    roleProtected: principal.roleProtected,
    avatarInitials: initials(principal.fullName),
    avatarBg: 'bg-indigo-600',
    department: '',
    status: principal.profileStatus,
  };
}
