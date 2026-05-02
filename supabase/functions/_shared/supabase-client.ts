import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from './database.types.ts';
import { fetchWithTimeout } from './fetch-with-timeout.ts';

/**
 * Creates a Supabase client with the correct Database types.
 * This is the central factory for all Edge Functions.
 */
export const createSupabaseClient = (
  supabaseUrl: string,
  supabaseKey: string,
  options?: any
) => {
  return createClient<Database>(supabaseUrl, supabaseKey, options);
};

/**
 * Helper to create a client from Request headers (Auth context).
 * ADR-046: Mandatory 15s timeout for all Supabase queries.
 */
export const createClientFromRequest = (req: Request, timeoutMs: number = 15_000) => {
  const authHeader = req.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL') || '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') || '';
  
  const options = {
    global: {
      fetch: (url: string, options: any) => fetchWithTimeout(url, { ...options, timeoutMs }),
      headers: authHeader ? { Authorization: authHeader } : undefined,
    },
  };

  return createSupabaseClient(url, anonKey, options);
};

/**
 * Helper to create a service role client (Admin context).
 * Use this ONLY for privileged operations.
 * ADR-046: Mandatory 15s timeout for all Supabase queries.
 */
export const getServiceClient = (timeoutMs: number = 15_000) => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createSupabaseClient(url, serviceKey, {
    global: {
      fetch: (url: string, options: any) => {
        return fetchWithTimeout(url, {
          ...options,
          timeoutMs,
        });
      },
    },
  });
};

// Re-export for convenience
export { createSupabaseClient as createTypedClient };
