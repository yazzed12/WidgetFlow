import { requireProtectedAdmin } from '../_shared/adminAuthorization.ts';
import { databaseError, failure, preflight, requirePost, success } from '../_shared/responses.ts';
import { optionalString, readJsonObject, uuid } from '../_shared/validation.ts';

Deno.serve(async (request) => {
  try {
    const options = preflight(request);
    if (options) return options;
    requirePost(request);

    const { principal, adminClient } = await requireProtectedAdmin(request);
    const body = await readJsonObject(request);
    const targetUserId = uuid(body.targetUserId, 'targetUserId');
    const newRoleId = uuid(body.newRoleId, 'newRoleId');
    const reason = optionalString(body, 'reason', 1_000);

    const { data, error } = await adminClient.rpc('admin_change_profile_role_domain', {
      p_actor_user_id: principal.userId,
      p_target_user_id: targetUserId,
      p_new_role_id: newRoleId,
      p_reason: reason ?? null,
    });
    if (error) throw databaseError(error);

    return success(request, data);
  } catch (error) {
    return failure(request, error);
  }
});
