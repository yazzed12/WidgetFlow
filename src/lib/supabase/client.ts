import { createClient, type SupabaseClient } from '@supabase/supabase-js';

let browserClient: SupabaseClient | null = null;

function requiredBrowserEnvironment(name: 'VITE_SUPABASE_URL' | 'VITE_SUPABASE_PUBLISHABLE_KEY'): string {
  const value = import.meta.env[name]?.trim();
  if (!value) throw new Error(`Missing required browser configuration: ${name}`);
  return value;
}

export function getSupabaseBrowserClient(): SupabaseClient {
  if (browserClient) return browserClient;
  browserClient = createClient(
    requiredBrowserEnvironment('VITE_SUPABASE_URL'),
    requiredBrowserEnvironment('VITE_SUPABASE_PUBLISHABLE_KEY'),
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false,
      },
    },
  );
  return browserClient;
}
