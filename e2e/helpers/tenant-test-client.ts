/**
 * Tenant Test Client Helper
 * Creates authenticated Supabase clients for multi-tenant isolation testing
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Test tenant configuration from environment
export const TENANT_CONFIG = {
  tenantA: {
    email: process.env.TEST_TENANT_A_EMAIL || 'tenant-a@test.local',
    password: process.env.TEST_TENANT_A_PASSWORD || 'test-password-a',
    id: process.env.TEST_TENANT_A_ID || '',
  },
  tenantB: {
    email: process.env.TEST_TENANT_B_EMAIL || 'tenant-b@test.local',
    password: process.env.TEST_TENANT_B_PASSWORD || 'test-password-b',
    id: process.env.TEST_TENANT_B_ID || '',
  },
} as const;

/**
 * Creates a Supabase client and authenticates with given credentials
 */
export async function createAuthenticatedClient(
  email: string,
  password: string
): Promise<SupabaseClient> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY');
  }

  const client = createClient(supabaseUrl, supabaseKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { error } = await client.auth.signInWithPassword({ email, password });

  if (error) {
    throw new Error(`Auth failed for ${email}: ${error.message}`);
  }

  return client;
}

/**
 * Creates authenticated client for Tenant A
 */
export async function createTenantAClient(): Promise<SupabaseClient> {
  return createAuthenticatedClient(
    TENANT_CONFIG.tenantA.email,
    TENANT_CONFIG.tenantA.password
  );
}

/**
 * Creates authenticated client for Tenant B
 */
export async function createTenantBClient(): Promise<SupabaseClient> {
  return createAuthenticatedClient(
    TENANT_CONFIG.tenantB.email,
    TENANT_CONFIG.tenantB.password
  );
}

/**
 * Validates that all required tenant test configuration is present
 */
export function validateTenantTestConfig(): { valid: boolean; missing: string[] } {
  const missing: string[] = [];

  if (!process.env.VITE_SUPABASE_URL) missing.push('VITE_SUPABASE_URL');
  if (!process.env.VITE_SUPABASE_PUBLISHABLE_KEY) missing.push('VITE_SUPABASE_PUBLISHABLE_KEY');
  if (!process.env.TEST_TENANT_A_EMAIL) missing.push('TEST_TENANT_A_EMAIL');
  if (!process.env.TEST_TENANT_A_PASSWORD) missing.push('TEST_TENANT_A_PASSWORD');
  if (!process.env.TEST_TENANT_A_ID) missing.push('TEST_TENANT_A_ID');
  if (!process.env.TEST_TENANT_B_EMAIL) missing.push('TEST_TENANT_B_EMAIL');
  if (!process.env.TEST_TENANT_B_PASSWORD) missing.push('TEST_TENANT_B_PASSWORD');
  if (!process.env.TEST_TENANT_B_ID) missing.push('TEST_TENANT_B_ID');

  return { valid: missing.length === 0, missing };
}
