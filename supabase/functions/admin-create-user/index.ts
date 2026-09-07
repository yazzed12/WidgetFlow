import { requireProtectedAdmin } from '../_shared/adminAuthorization.ts';
import { recordCreateFailure } from '../_shared/audit.ts';
import { ApiError, databaseError, failure, preflight, requirePost, success } from '../_shared/responses.ts';
import {
  email,
  optionalString,
  optionalUuid,
  password,
  readJsonObject,
  requiredString,
  uuid,
} from '../_shared/validation.ts';

Deno.serve(async (request) => {
  try {
    const options = preflight(request);
    if (options) return options;
    requirePost(request);

    const { principal, adminClient } = await requireProtectedAdmin(request);
    const body = await readJsonObject(request);
    const fullName = requiredString(body, 'fullName', 200).trim();
    const normalizedEmail = email(body.email);
    const initialPassword = password(body.initialPassword);
    const roleId = uuid(body.roleId, 'roleId');
    const department = optionalString(body, 'department', 200) ?? '';
    const managerUserId = optionalUuid(body.managerUserId, 'managerUserId');

    const { data: role, error: roleError } = await adminClient
      .from('roles')
      .select('id,key,name,role_type,is_active,is_protected')
      .eq('id', roleId)
      .maybeSingle();
    if (roleError) throw databaseError(roleError);
    if (!role) throw new ApiError(404, 'ROLE_NOT_FOUND', 'The requested role was not found.');
    if (!role.is_active) throw new ApiError(409, 'ROLE_INACTIVE', 'The requested role is inactive.');
    if (
      role.is_protected ||
      (role.role_type === 'System' && role.key.trim().toLowerCase() === 'admin')
    ) {
      throw new ApiError(409, 'PROTECTED_ADMIN', 'Use the dedicated Admin creation operation.');
    }

    const { data: duplicate, error: duplicateError } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (duplicateError) throw databaseError(duplicateError);
    if (duplicate) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'An account already uses this email address.');

    if (managerUserId) {
      const { data: manager, error: managerError } = await adminClient
        .from('profiles')
        .select('id,status,role_id')
        .eq('id', managerUserId)
        .maybeSingle();
      if (managerError) throw databaseError(managerError);
      if (!manager || manager.status !== 'Active') {
        throw new ApiError(400, 'INVALID_INPUT', 'The selected manager is not active.');
      }
      const { data: managerRole, error: managerRoleError } = await adminClient
        .from('roles')
        .select('is_active')
        .eq('id', manager.role_id)
        .maybeSingle();
      if (managerRoleError) throw databaseError(managerRoleError);
      if (!managerRole?.is_active) {
        throw new ApiError(400, 'INVALID_INPUT', 'The selected manager is not active.');
      }
    }

    const { data: created, error: createError } = await adminClient.auth.admin.createUser({
      email: normalizedEmail,
      password: initialPassword,
      email_confirm: true,
    });
    if (createError || !created.user) {
      const duplicateEmail = createError?.code === 'email_exists' ||
        createError?.message?.toLowerCase().includes('already');
      throw duplicateEmail
        ? new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'An account already uses this email address.')
        : new ApiError(500, 'ACCOUNT_CREATE_FAILED', 'The account could not be created.');
    }

    const { data: profile, error: profileError } = await adminClient.rpc('admin_create_profile_domain', {
      p_actor_user_id: principal.userId,
      p_target_user_id: created.user.id,
      p_full_name: fullName,
      p_email: normalizedEmail,
      p_role_id: roleId,
      p_department: department,
      p_manager_user_id: managerUserId ?? null,
    });

    if (profileError) {
      const compensation = await adminClient.auth.admin.deleteUser(created.user.id);
      const compensationSucceeded = !compensation.error;
      await recordCreateFailure(
        adminClient,
        principal.userId,
        created.user.id,
        normalizedEmail,
        'admin-create-user',
        compensationSucceeded,
      );
      throw new ApiError(
        500,
        'ACCOUNT_CREATE_FAILED',
        compensationSucceeded
          ? 'Profile creation failed; the new Auth identity was removed.'
          : 'Profile creation failed and Auth identity compensation also failed.',
        { compensationSucceeded },
      );
    }

    return success(request, profile, 201);
  } catch (error) {
    return failure(request, error);
  }
});
