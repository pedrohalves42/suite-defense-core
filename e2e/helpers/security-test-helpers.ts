/**
 * Security Test Helpers
 * 
 * Utility functions for E2E security tests including
 * authentication, API requests, and validation helpers.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { SECURITY_TEST_USERS, SECURITY_TEST_TENANTS, TestUser } from '../fixtures/security-test-users';

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

/**
 * Creates an unauthenticated Supabase client for testing
 */
export function createUnauthenticatedClient(): SupabaseClient | null {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.warn('Missing Supabase environment variables');
    return null;
  }
  return createClient(SUPABASE_URL, SUPABASE_KEY);
}

/**
 * Creates an authenticated Supabase client for a specific test user
 */
export async function createAuthenticatedClient(
  userKey: keyof typeof SECURITY_TEST_USERS
): Promise<{ client: SupabaseClient; session: any } | null> {
  const client = createUnauthenticatedClient();
  if (!client) return null;
  
  const user = SECURITY_TEST_USERS[userKey];
  
  const { data, error } = await client.auth.signInWithPassword({
    email: user.email,
    password: user.password,
  });
  
  if (error) {
    console.error(`Failed to authenticate ${userKey}:`, error.message);
    return null;
  }
  
  return { client, session: data.session };
}

/**
 * Makes a direct REST API request to Supabase (bypassing SDK)
 */
export async function makeDirectRestRequest(options: {
  table: string;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  data?: Record<string, any>;
  params?: Record<string, string>;
  headers?: Record<string, string>;
  useAuth?: boolean;
  authToken?: string;
}): Promise<Response> {
  const { table, method, data, params, headers = {}, useAuth = false, authToken } = options;
  
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    throw new Error('Missing Supabase environment variables');
  }
  
  const url = new URL(`${SUPABASE_URL}/rest/v1/${table}`);
  
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      url.searchParams.set(key, value);
    });
  }
  
  const requestHeaders: Record<string, string> = {
    'apikey': SUPABASE_KEY,
    'Content-Type': 'application/json',
    'Prefer': 'return=representation',
    ...headers,
  };
  
  if (useAuth && authToken) {
    requestHeaders['Authorization'] = `Bearer ${authToken}`;
  } else if (useAuth) {
    requestHeaders['Authorization'] = `Bearer ${SUPABASE_KEY}`;
  }
  
  return fetch(url.toString(), {
    method,
    headers: requestHeaders,
    body: data ? JSON.stringify(data) : undefined,
  });
}

/**
 * Makes a request to an Edge Function
 */
export async function callEdgeFunction(options: {
  functionName: string;
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  body?: Record<string, any>;
  headers?: Record<string, string>;
  authToken?: string;
}): Promise<Response> {
  const { functionName, method = 'POST', body, headers = {}, authToken } = options;
  
  if (!SUPABASE_URL) {
    throw new Error('Missing SUPABASE_URL');
  }
  
  const url = `${SUPABASE_URL}/functions/v1/${functionName}`;
  
  const requestHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...headers,
  };
  
  if (authToken) {
    requestHeaders['Authorization'] = `Bearer ${authToken}`;
  }
  
  return fetch(url, {
    method,
    headers: requestHeaders,
    body: body ? JSON.stringify(body) : undefined,
  });
}

/**
 * Gets the access token for a test user
 */
export async function getAccessToken(
  userKey: keyof typeof SECURITY_TEST_USERS
): Promise<string | null> {
  const result = await createAuthenticatedClient(userKey);
  return result?.session?.access_token || null;
}

/**
 * Validates that a response is an unauthorized error
 */
export function expectUnauthorized(response: Response): boolean {
  return response.status === 401;
}

/**
 * Validates that a response is a forbidden error
 */
export function expectForbidden(response: Response): boolean {
  return response.status === 403;
}

/**
 * Validates that a response indicates rate limiting
 */
export function expectRateLimited(response: Response): boolean {
  return response.status === 429;
}

/**
 * Validates that no data was returned (RLS blocked)
 */
export async function expectNoDataReturned(response: Response): Promise<boolean> {
  if (response.status === 200) {
    const data = await response.json();
    return Array.isArray(data) && data.length === 0;
  }
  return response.status === 403 || response.status === 404;
}

/**
 * Gets approval requests for a tenant
 */
export async function getApprovalRequests(
  client: SupabaseClient,
  tenantId: string
): Promise<any[]> {
  const { data, error } = await client
    .from('approval_requests')
    .select('*')
    .eq('tenant_id', tenantId);
  
  if (error) {
    console.error('Error fetching approval requests:', error);
    return [];
  }
  
  return data || [];
}

/**
 * Cleanup test approval requests
 */
export async function cleanupTestApprovals(
  client: SupabaseClient,
  tenantId: string
): Promise<void> {
  await client
    .from('approval_requests')
    .delete()
    .eq('tenant_id', tenantId)
    .like('metadata->>source', 'e2e-test%');
}

/**
 * Check if required environment variables are present
 */
export function hasSecurityTestEnvVars(): boolean {
  return !!(SUPABASE_URL && SUPABASE_KEY);
}

/**
 * Get test tenant ID by slug
 */
export function getTestTenantId(slug: string): string | undefined {
  const tenant = Object.values(SECURITY_TEST_TENANTS).find(t => t.slug === slug);
  return tenant?.id;
}

/**
 * Generates a random test identifier
 */
export function generateTestId(): string {
  return `e2e-test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
}

/**
 * Creates a test approval request via Edge Function
 */
export async function createApprovalRequest(
  authToken: string,
  tenantId: string,
  playbookId: string
): Promise<{ success: boolean; approvalId?: string; error?: string }> {
  const response = await callEdgeFunction({
    functionName: 'evaluate-playbook-triggers',
    method: 'POST',
    authToken,
    body: {
      tenant_id: tenantId,
      playbook_id: playbookId,
      trigger_type: 'manual',
      metadata: { source: 'e2e-test' }
    }
  });
  
  if (response.ok) {
    const data = await response.json();
    return { success: true, approvalId: data.approval_id };
  }
  
  const error = await response.text();
  return { success: false, error };
}

/**
 * Verifies the status of an approval request directly from database
 */
export async function verifyApprovalStatus(
  client: SupabaseClient,
  approvalId: string
): Promise<{ status: string | null; found: boolean }> {
  const { data, error } = await client
    .from('approval_requests')
    .select('status')
    .eq('id', approvalId)
    .single();
  
  if (error || !data) {
    return { status: null, found: false };
  }
  
  return { status: data.status, found: true };
}

/**
 * Processes an approval (approve/reject) via service role
 * Used for testing rate limit reset behavior
 */
export async function processApproval(
  client: SupabaseClient,
  approvalId: string,
  decision: 'approved' | 'rejected' | 'expired',
  userId?: string
): Promise<{ success: boolean; error?: string }> {
  const updateData: Record<string, any> = {
    status: decision,
    updated_at: new Date().toISOString()
  };
  
  if (decision === 'approved') {
    updateData.approved_by = userId || '00000000-0000-0000-0000-000000000000';
    updateData.approved_at = new Date().toISOString();
  } else if (decision === 'rejected') {
    updateData.rejected_by = userId;
    updateData.rejected_at = new Date().toISOString();
  }
  
  const { error } = await client
    .from('approval_requests')
    .update(updateData)
    .eq('id', approvalId);
  
  if (error) {
    return { success: false, error: error.message };
  }
  
  return { success: true };
}

/**
 * Gets pending approval count for a tenant
 */
export async function getPendingApprovalCount(
  client: SupabaseClient,
  tenantId: string
): Promise<number> {
  const { count, error } = await client
    .from('approval_requests')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('status', 'pending');
  
  if (error) {
    console.error('Error counting pending approvals:', error);
    return -1;
  }
  
  return count || 0;
}

/**
 * Validates that a database record was not modified
 */
export async function verifyRecordUnchanged(
  client: SupabaseClient,
  table: string,
  recordId: string,
  expectedValues: Record<string, any>
): Promise<{ unchanged: boolean; currentValues?: Record<string, any> }> {
  const { data, error } = await client
    .from(table)
    .select('*')
    .eq('id', recordId)
    .single();
  
  if (error || !data) {
    return { unchanged: true }; // Record not found = not modified
  }
  
  for (const [key, expectedValue] of Object.entries(expectedValues)) {
    if (data[key] !== expectedValue) {
      return { unchanged: false, currentValues: data };
    }
  }
  
  return { unchanged: true, currentValues: data };
}

export default {
  createUnauthenticatedClient,
  createAuthenticatedClient,
  makeDirectRestRequest,
  callEdgeFunction,
  getAccessToken,
  expectUnauthorized,
  expectForbidden,
  expectRateLimited,
  expectNoDataReturned,
  getApprovalRequests,
  cleanupTestApprovals,
  hasSecurityTestEnvVars,
  getTestTenantId,
  generateTestId,
  createApprovalRequest,
  verifyApprovalStatus,
  processApproval,
  getPendingApprovalCount,
  verifyRecordUnchanged,
};
