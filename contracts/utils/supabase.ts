import { createClient, SupabaseClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  console.warn('⚠️ Supabase credentials not found. Contract tests may fail.');
}

/**
 * Creates an unauthenticated Supabase client for testing
 */
export function createAnonClient(): SupabaseClient {
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
}

/**
 * Creates a service role client for privileged operations
 */
export function createServiceClient(): SupabaseClient | null {
  if (!SUPABASE_SERVICE_KEY) {
    console.warn('⚠️ Service role key not available. Some tests will be skipped.');
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);
}

/**
 * Get Supabase URL for edge function calls
 */
export function getSupabaseUrl(): string {
  return SUPABASE_URL;
}

/**
 * Get anon key for authenticated requests
 */
export function getAnonKey(): string {
  return SUPABASE_ANON_KEY;
}

/**
 * Check if required env vars are available
 */
export function hasRequiredEnvVars(): boolean {
  return Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
}
