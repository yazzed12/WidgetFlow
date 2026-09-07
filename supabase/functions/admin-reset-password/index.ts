import { requireProtectedAdmin } from '../_shared/adminAuthorization.ts';
import { ApiError, databaseError, failure, preflight, requirePost, success } from '../_shared/responses.ts';
import { password, readJsonObject, uuid } from '../_shared/validation.ts';

Deno.serve(async (request) => {
  try {
    const options = preflight(request);
    if (options) return options;
    requirePost(request);

    const { principal, adminClient } = await requireProtectedAdmin(request);
    const body = await readJsonObject(request);
    const targetUserId = uuid(body.targetUserId, 'targetUserId');
    const newPassword = password(body.newPassword);

    const { data: target, error: targetError } = await adminClient
      .from('profiles')
      .select('id,role_id')
      .eq('id', targetUserId)
      .maybeSingle();
    if (targetError) throw databaseError(targetError);
    if (!target) throw new ApiError(404, 'TARGET_NOT_FOUND', 'The target account was not found.');

    const { data: targetRole, error: targetRoleError } = await adminClient
      .from('roles')
      .select('key,role_type,is_protected')
      .eq('id', target.role_id)
      .maybeSingle();
    if (targetRoleError) throw databaseError(targetRoleError);
    if (
      targetRole?.is_protected ||
      (targetRole?.role_type === 'System' && targetRole.key.trim().toLowerCase() === 'admin')
    ) {
      throw new ApiError(409, 'PROTECTED_ADMIN', 'Protected Admin password changes are not allowed by this operation.');
    }

    const { error: passwordError } = await adminClient.auth.admin.updateUserById(targetUserId, {
      password: newPassword,
    });
    if (passwordError) {
      throw new ApiError(500, 'PASSWORD_RESET_FAILED', 'The password could not be reset.');
    }

    const { error: auditError } = await adminClient.rpc('admin_record_password_reset_domain', {
      p_actor_user_id: principal.userId,
      p_target_user_id: targetUserId,
    });
    if (auditError) {
      throw new ApiError(
        500,
        'PASSWORD_RESET_FAILED',
        'The password changed, but the required audit record could not be written.',
        { passwordChanged: true },
      );
    }

    return success(request, { id: targetUserId, passwordReset: true });
  } catch (error) {
    return failure(request, error);
  }
});
