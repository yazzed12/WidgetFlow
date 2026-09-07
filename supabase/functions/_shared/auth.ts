import { createClient, type SupabaseClient, type User } from 'npm:@supabase/supabase-js@2.102.0';
import { ApiError } from './responses.ts';

export type VerifiedCaller = {
  user: User;
  userClient: SupabaseClient;
  adminClient: SupabaseClient;
};

function requiredEnvironment(name: string, fallbackName?: string): string {
  const value = Deno.env.get(name) ?? (fallbackName ? Deno.env.get(fallbackName) : undefined);
  if (!value) throw new ApiError(500, 'INTERNAL_ERROR', 'Required server configuration is missing.');
  return value;
}

export async function verifyCaller(request: Request): Promise<VerifiedCaller> {
  const authorization = request.headers.get('authorization') ?? '';
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new ApiError(401, 'UNAUTHENTICATED', 'Authentication is required.');

  const url = requiredEnvironment('SUPABASE_URL');
  const publishableKey = requiredEnvironment('SUPABASE_PUBLISHABLE_KEY', 'SUPABASE_ANON_KEY');
  const secretKey = requiredEnvironment('SUPABASE_SECRET_KEY', 'SUPABASE_SERVICE_ROLE_KEY');

  const userClient = createClient(url, publishableKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const adminClient = createClient(url, secretKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  // getUser(token) performs an Auth-server validation; decoded JWT claims alone
  // are never treated as proof of identity here.
  const { data, error } = await userClient.auth.getUser(match[1]);
  if (error || !data.user) {
    throw new ApiError(401, 'UNAUTHENTICATED', 'The session is invalid or expired.');
  }

  return { user: data.user, userClient, adminClient };
}
