import { requireProtectedAdmin } from '../_shared/adminAuthorization.ts';
import { databaseError, failure, preflight, requirePost, success } from '../_shared/responses.ts';
import { readJsonObject, status, uuid } from '../_shared/validation.ts';

Deno.serve(async (request) => {
  try {
    const options = preflight(request);
    if (options) return options;
    requirePost(request);

    const { principal, adminClient } = await requireProtectedAdmin(request);
    const body = await readJsonObject(request);
    const targetUserId = uuid(body.targetUserId, 'targetUserId');
    const nextStatus = status(body.status);

    const { data, error } = await adminClient.rpc('admin_set_profile_status_domain', {
      p_actor_user_id: principal.userId,
      p_target_user_id: targetUserId,
      p_status: nextStatus,
    });
    if (error) throw databaseError(error);

    // Profile status is the authoritative access state and every RLS helper reads
    // it live. Auth ban/unban is intentionally deferred until its exact unban
    // contract is verified for the deployed Supabase version.
    return success(request, data);
  } catch (error) {
    return failure(request, error);
  }
});
