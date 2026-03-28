import { logger } from "./logger.ts";

// Deno runtime type declarations for safe access without `as any`
declare const Deno: { env: { get(key: string): string | undefined } } | undefined;

/**
 * Centralized environment variable validation
 * Eliminates silent crashes from Deno.env.get()! assertions
 * 
 * Usage:
 *   import { requireEnv, getSupabaseConfig } from '../_shared/env.ts';
 *   const { url, serviceRoleKey } = getSupabaseConfig();
 */

export function requireEnv(name: string): string {
  const value = typeof Deno !== 'undefined' ? Deno.env.get(name) : undefined;
  if (!value) {
    logger.error(`[FATAL] Missing required environment variable: ${name}`);
    throw new Error(`Server configuration error: missing ${name}`);
  }
  return value;
}

export function optionalEnv(name: string, defaultValue = ''): string {
  return (typeof Deno !== 'undefined' ? Deno.env.get(name) : undefined) || defaultValue;
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
