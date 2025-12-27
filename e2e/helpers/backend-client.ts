/**
 * Backend Client Helper for E2E Tests
 * 
 * This creates a Supabase client compatible with Node.js (Playwright)
 * instead of using the app's client which depends on import.meta.env (Vite only)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read from process.env (loaded by dotenv in playwright.config.ts)
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Creates a Supabase client for E2E tests (Node.js compatible)
 */
export function createTestClient(): SupabaseClient {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error(
      'Missing Supabase environment variables. ' +
      'Make sure VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY are set in .env or .env.test'
    );
  }
  
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Creates an authenticated Supabase client for admin operations
 */
export async function getAdminBackendClient(): Promise<SupabaseClient> {
  const client = createTestClient();
  
  const email = process.env.TEST_ADMIN_EMAIL;
  const password = process.env.TEST_ADMIN_PASSWORD;
  
  if (!email || !password) {
    throw new Error(
      'Missing test credentials. ' +
      'Make sure TEST_ADMIN_EMAIL and TEST_ADMIN_PASSWORD are set in .env.test'
    );
  }
  
  const { error } = await client.auth.signInWithPassword({ email, password });
  
  if (error) {
    throw new Error(`Failed to authenticate admin user: ${error.message}`);
  }
  
  return client;
}

/**
 * Check if all required environment variables are present
 */
export function hasRequiredEnvVars(): boolean {
  return !!(
    process.env.VITE_SUPABASE_URL &&
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY &&
    process.env.TEST_ADMIN_EMAIL &&
    process.env.TEST_ADMIN_PASSWORD
  );
}

// Export a lazy-initialized client for simple queries
let _testClient: SupabaseClient | null = null;

export function getTestClient(): SupabaseClient {
  if (!_testClient) {
    _testClient = createTestClient();
  }
  return _testClient;
}
