import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from './database.types.ts';

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
 */
export const createClientFromRequest = (req: Request) => {
  const authHeader = req.headers.get('Authorization');
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  
  if (!authHeader) {
    return createSupabaseClient(url, anonKey);
  }

  return createSupabaseClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });
};

/**
 * Helper to create a service role client (Admin context).
 * Use this ONLY for privileged operations.
 */
export const getServiceClient = () => {
  const url = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  return createSupabaseClient(url, serviceKey);
};

// Re-export for convenience
export { createSupabaseClient as createTypedClient };
