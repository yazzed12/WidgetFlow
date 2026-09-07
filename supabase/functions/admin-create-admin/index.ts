import { requireProtectedAdmin } from '../_shared/adminAuthorization.ts';
import { recordCreateFailure } from '../_shared/audit.ts';
import { ApiError, failure, preflight, requirePost, success } from '../_shared/responses.ts';
import { email, optionalString, password, readJsonObject, requiredString } from '../_shared/validation.ts';

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
    const department = optionalString(body, 'department', 200) ?? 'Administration';

    const { data: adminRole, error: roleError } = await adminClient
      .from('roles')
      .select('id,key,role_type,is_active,is_protected')
      .eq('key', 'admin')
      .eq('role_type', 'System')
      .eq('is_active', true)
      .eq('is_protected', true)
      .maybeSingle();
    if (roleError || !adminRole) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'The protected Admin role is unavailable.');
    }

    const { data: duplicate, error: duplicateError } = await adminClient
      .from('profiles')
      .select('id')
      .ilike('email', normalizedEmail)
      .maybeSingle();
    if (duplicateError) {
      throw new ApiError(500, 'INTERNAL_ERROR', 'The account could not be validated.');
    }
    if (duplicate) throw new ApiError(409, 'EMAIL_ALREADY_EXISTS', 'An account already uses this email address.');

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
        : new ApiError(500, 'ACCOUNT_CREATE_FAILED', 'The Admin account could not be created.');
    }

    const { data: profile, error: profileError } = await adminClient.rpc(
      'admin_create_admin_profile_domain',
      {
        p_actor_user_id: principal.userId,
        p_target_user_id: created.user.id,
        p_full_name: fullName,
        p_email: normalizedEmail,
        p_department: department,
      },
    );

    if (profileError) {
      const compensation = await adminClient.auth.admin.deleteUser(created.user.id);
      const compensationSucceeded = !compensation.error;
      await recordCreateFailure(
        adminClient,
        principal.userId,
        created.user.id,
        normalizedEmail,
        'admin-create-admin',
        compensationSucceeded,
      );
      throw new ApiError(
        500,
        'ACCOUNT_CREATE_FAILED',
        compensationSucceeded
          ? 'Admin profile creation failed; the new Auth identity was removed.'
          : 'Admin profile creation failed and Auth identity compensation also failed.',
        { compensationSucceeded },
      );
    }

    return success(request, profile, 201);
  } catch (error) {
    return failure(request, error);
  }
});
