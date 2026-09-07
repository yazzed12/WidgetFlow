import type { SupabaseClient } from 'npm:@supabase/supabase-js@2.102.0';

export async function recordCreateFailure(
  client: SupabaseClient,
  actorUserId: string,
  targetUserId: string,
  targetEmail: string,
  flow: 'admin-create-user' | 'admin-create-admin',
  compensationSucceeded: boolean,
): Promise<void> {
  // This audit is best-effort because the original profile transaction failed.
  // No raw error or credential material is logged or returned from here.
  await client.rpc('admin_record_account_create_failure_domain', {
    p_actor_user_id: actorUserId,
    p_target_user_id: targetUserId,
    p_target_email: targetEmail,
    p_flow: flow,
    p_compensation_succeeded: compensationSucceeded,
  });
}
