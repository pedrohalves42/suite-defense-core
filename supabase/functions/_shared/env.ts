/**
 * Centralized environment variable validation
 * Eliminates silent crashes from Deno.env.get()! assertions
 * 
 * Usage:
 *   import { requireEnv, getSupabaseConfig } from '../_shared/env.ts';
 *   const { url, serviceRoleKey } = getSupabaseConfig();
 */

export function requireEnv(name: string): string {
  const value = Deno.env.get(name);
  if (!value) {
    console.error(`[FATAL] Missing required environment variable: ${name}`);
    throw new Error(`Server configuration error: missing ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, defaultValue = ''): string {
  return Deno.env.get(name) || defaultValue;
}

export function getSupabaseConfig() {
  return {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
  };
}

export function getSupabaseFullConfig() {
  return {
    url: requireEnv('SUPABASE_URL'),
    serviceRoleKey: requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    anonKey: requireEnv('SUPABASE_ANON_KEY'),
  };
}
