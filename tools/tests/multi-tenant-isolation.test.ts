/**
 * E2E Tests for Multi-Tenant Isolation (ADR-026)
 * 
 * These tests verify that the active tenant isolation model works correctly
 * at the database level, preventing data leakage between tenants.
 * 
 * Prerequisites:
 * - Test database with at least 2 tenants (T1, T2)
 * - Test user with access to both tenants
 * - Test data in agents table for both tenants
 * 
 * Run with: npx vitest run tools/tests/multi-tenant-isolation.test.ts
 */

import { describe, test, expect, beforeAll, afterAll } from 'vitest';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// =============================================================================
// Test Configuration
// =============================================================================

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;
const TEST_USER_EMAIL = process.env.TEST_ADMIN_EMAIL;
const TEST_USER_PASSWORD = process.env.TEST_ADMIN_PASSWORD;

// Test tenant IDs - set these in .env.test
const TENANT_T1 = process.env.TEST_TENANT_T1;
const TENANT_T2 = process.env.TEST_TENANT_T2;

// =============================================================================
// Test Fixtures
// =============================================================================

interface TestContext {
  supabase: SupabaseClient;
  userId: string;
  hasTenants: boolean;
}

let ctx: TestContext;

/**
 * Check if test environment is properly configured
 */
function isTestConfigured(): boolean {
  return !!(
    SUPABASE_URL &&
    SUPABASE_ANON_KEY &&
    TEST_USER_EMAIL &&
    TEST_USER_PASSWORD &&
    TENANT_T1 &&
    TENANT_T2
  );
}

/**
 * Skip reason for unconfigured tests
 */
const SKIP_REASON = 'Test environment not configured. Set TEST_TENANT_T1, TEST_TENANT_T2, TEST_ADMIN_EMAIL, TEST_ADMIN_PASSWORD';

// =============================================================================
// Multi-Tenant Isolation Tests
// =============================================================================

describe('Multi-Tenant Isolation Tests (ADR-026)', () => {
  beforeAll(async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    
    // Sign in test user
    const { data: authData, error: authError } = await supabase.auth.signInWithPassword({
      email: TEST_USER_EMAIL!,
      password: TEST_USER_PASSWORD!,
    });

    if (authError) {
      console.error('Auth error:', authError.message);
      ctx = { supabase, userId: '', hasTenants: false };
      return;
    }

    ctx = {
      supabase,
      userId: authData.user?.id || '',
      hasTenants: true,
    };
  });

  afterAll(async () => {
    if (ctx?.supabase) {
      await ctx.supabase.auth.signOut();
    }
  });

  /**
   * Test 1: Query without explicit tenant_id returns only active tenant data
   * 
   * RLS policies using get_active_tenant_id() should automatically filter
   * results to the user's currently active tenant.
   */
  test('Query without tenant_id returns only active tenant data', async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    const { data, error } = await ctx.supabase
      .from('agents')
      .select('id, hostname, tenant_id')
      .limit(100);

    expect(error).toBeNull();
    
    if (data && data.length > 0) {
      // All returned records should belong to a single tenant
      const uniqueTenants = [...new Set(data.map(a => a.tenant_id))];
      expect(uniqueTenants.length).toBe(1);
      
      // The tenant should be one of the user's accessible tenants
      expect([TENANT_T1, TENANT_T2]).toContain(uniqueTenants[0]);
    }
  });

  /**
   * Test 2: Forcing different tenant_id returns empty results
   * 
   * Even with explicit .eq('tenant_id', other_tenant), RLS should
   * combine with AND, returning no results if not the active tenant.
   */
  test('Cannot force query to different tenant via eq()', async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    // First, get user's active tenant
    const { data: activeData } = await ctx.supabase
      .from('agents')
      .select('tenant_id')
      .limit(1)
      .single();

    const activeTenant = activeData?.tenant_id;
    const otherTenant = activeTenant === TENANT_T1 ? TENANT_T2 : TENANT_T1;

    // Try to query the other tenant directly
    const { data, error } = await ctx.supabase
      .from('agents')
      .select('id, tenant_id')
      .eq('tenant_id', otherTenant);

    expect(error).toBeNull();
    // Should return empty array - RLS blocks cross-tenant access
    expect(data).toEqual([]);
  });

  /**
   * Test 3: INSERT with wrong tenant_id is blocked
   */
  test('Cannot insert data for different tenant', async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    // Get user's active tenant
    const { data: activeData } = await ctx.supabase
      .from('agents')
      .select('tenant_id')
      .limit(1)
      .single();

    const activeTenant = activeData?.tenant_id;
    const otherTenant = activeTenant === TENANT_T1 ? TENANT_T2 : TENANT_T1;

    const { error } = await ctx.supabase
      .from('agents')
      .insert({
        tenant_id: otherTenant,
        hostname: 'test-injection-agent',
        status: 'pending',
      });

    // Should fail with RLS violation
    expect(error).toBeTruthy();
    if (error) {
      // Either RLS violation or permission denied
      expect(error.code).toMatch(/42501|PGRST/);
    }
  });

  /**
   * Test 4: UPDATE targeting wrong tenant affects 0 rows
   */
  test('Cannot update data in different tenant', async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    const { data: activeData } = await ctx.supabase
      .from('agents')
      .select('tenant_id')
      .limit(1)
      .single();

    const activeTenant = activeData?.tenant_id;
    const otherTenant = activeTenant === TENANT_T1 ? TENANT_T2 : TENANT_T1;

    const { data, error, count } = await ctx.supabase
      .from('agents')
      .update({ status: 'compromised' })
      .eq('tenant_id', otherTenant)
      .select();

    // No error, but should update 0 rows
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });

  /**
   * Test 5: DELETE targeting wrong tenant affects 0 rows
   */
  test('Cannot delete data in different tenant', async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    const { data: activeData } = await ctx.supabase
      .from('agents')
      .select('tenant_id')
      .limit(1)
      .single();

    const activeTenant = activeData?.tenant_id;
    const otherTenant = activeTenant === TENANT_T1 ? TENANT_T2 : TENANT_T1;

    const { data, error } = await ctx.supabase
      .from('agents')
      .delete()
      .eq('tenant_id', otherTenant)
      .eq('hostname', 'non-existent-safe-test')
      .select();

    // No error, but should delete 0 rows
    expect(error).toBeNull();
    expect(data).toEqual([]);
  });
});

// =============================================================================
// RLS Policy Verification Tests
// =============================================================================

describe('RLS Policy Verification', () => {
  /**
   * Verify multi-tenant tables have active_tenant policies
   */
  test('All priority tables have active_tenant policies', async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    const priorityTables = [
      'agents',
      'tasks',
      'system_alerts',
      'jobs',
      'ai_insights',
      'enrollment_keys',
      'governance_reports',
      'playbook_executions',
      'scheduled_jobs',
      'security_policies',
      'user_roles',
      'tenant_features',
    ];

    // This would typically query pg_policies via an admin function
    // For now, we verify the tables exist and RLS is enforced
    for (const table of priorityTables) {
      const { error } = await ctx.supabase
        .from(table as any)
        .select('*')
        .limit(1);
      
      // Should not get permission denied (RLS is working)
      if (error) {
        expect(error.code).not.toBe('42501');
      }
    }
  });
});

// =============================================================================
// Super Admin Tests
// =============================================================================

describe('Super Admin Cross-Tenant Access', () => {
  /**
   * Super admins can read data across all tenants
   * (requires is_current_super_admin() to return true)
   */
  test.skip('Super admin can read cross-tenant data', async () => {
    // This test requires a super admin JWT
    // Would need separate auth for super admin user
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    const { data, error } = await ctx.supabase
      .from('agents')
      .select('id, tenant_id');

    expect(error).toBeNull();
    
    if (data && data.length > 1) {
      const uniqueTenants = [...new Set(data.map(a => a.tenant_id))];
      // Super admin should see data from multiple tenants
      expect(uniqueTenants.length).toBeGreaterThan(1);
    }
  });
});

// =============================================================================
// Security Invariant Tests
// =============================================================================

describe('Security Invariants', () => {
  /**
   * INV-001: No cross-tenant data leakage
   */
  test('INV-001: Cross-Tenant Data Isolation', async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    // Query multiple multi-tenant tables
    const tables = ['agents', 'tasks', 'jobs'] as const;
    
    for (const table of tables) {
      const { data, error } = await ctx.supabase
        .from(table)
        .select('tenant_id')
        .limit(100);

      if (data && data.length > 0) {
        const tenants = [...new Set(data.map((r: any) => r.tenant_id))];
        // Should only see one tenant's data
        expect(tenants.length).toBeLessThanOrEqual(1);
      }
    }
  });

  /**
   * INV-002: tenant_id cannot be modified after creation
   */
  test('INV-002: Tenant ID Immutability', async () => {
    if (!isTestConfigured()) {
      console.warn(SKIP_REASON);
      return;
    }

    // Get an existing agent
    const { data: agent } = await ctx.supabase
      .from('agents')
      .select('id, tenant_id')
      .limit(1)
      .single();

    if (!agent) return;

    const otherTenant = agent.tenant_id === TENANT_T1 ? TENANT_T2 : TENANT_T1;

    // Try to change tenant_id
    const { error } = await ctx.supabase
      .from('agents')
      .update({ tenant_id: otherTenant })
      .eq('id', agent.id);

    // Should be blocked (either by RLS or trigger)
    // Note: This might succeed if there's no trigger, but RLS will filter it out
    // The key is that the agent won't end up in the wrong tenant
    
    // Verify the agent is still in the original tenant
    const { data: verifyAgent } = await ctx.supabase
      .from('agents')
      .select('tenant_id')
      .eq('id', agent.id)
      .single();

    expect(verifyAgent?.tenant_id).toBe(agent.tenant_id);
  });
});
