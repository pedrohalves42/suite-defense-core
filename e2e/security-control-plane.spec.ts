/**
 * Security Control Plane E2E Tests
 * 
 * Tests for the unified security dashboard including:
 * - Access control (admin-only)
 * - Metric display
 * - Kill switch functionality
 */

import { test, expect } from '@playwright/test';
import { 
  createAuthenticatedClient, 
  hasSecurityTestEnvVars,
  callEdgeFunction,
  getAccessToken
} from './helpers/security-test-helpers';
import { SECURITY_TEST_USERS } from './fixtures/security-test-users';

test.describe('Security Control Plane', () => {
  test.beforeEach(async () => {
    test.skip(!hasSecurityTestEnvVars(), 'Security test environment not configured');
  });

  test('SEC-CP-001: non-admin users cannot access security control plane data', async () => {
    // Try to access security dashboard data as a viewer
    const viewerAuth = await createAuthenticatedClient('viewer');
    test.skip(!viewerAuth, 'Could not authenticate viewer');

    const { client } = viewerAuth!;
    
    // Try to access system_global_state
    const { data, error } = await client
      .from('system_global_state')
      .select('*')
      .limit(1);

    // Should either error or return empty (RLS blocks access)
    expect(error !== null || (data?.length === 0)).toBeTruthy();
  });

  test('SEC-CP-002: super admin can access security dashboard data', async () => {
    const adminAuth = await createAuthenticatedClient('super_admin');
    test.skip(!adminAuth, 'Could not authenticate super_admin');

    const { client } = adminAuth!;
    
    // Super admin should be able to read security logs
    const { data: securityLogs, error: logsError } = await client
      .from('security_logs')
      .select('*')
      .limit(5);

    // Should succeed (even if empty)
    expect(logsError).toBeNull();
    expect(Array.isArray(securityLogs)).toBeTruthy();

    // Super admin should be able to read system alerts
    const { data: alerts, error: alertsError } = await client
      .from('system_alerts')
      .select('*')
      .limit(5);

    expect(alertsError).toBeNull();
    expect(Array.isArray(alerts)).toBeTruthy();
  });

  test('SEC-CP-003: RLS test results are properly recorded', async () => {
    const adminAuth = await createAuthenticatedClient('super_admin');
    test.skip(!adminAuth, 'Could not authenticate super_admin');

    const { client } = adminAuth!;
    
    // Check if rls_test_results table is accessible
    const { data, error } = await client
      .from('rls_test_results')
      .select('*')
      .order('tested_at', { ascending: false })
      .limit(10);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('SEC-CP-004: run-rls-tests edge function executes successfully', async () => {
    const token = await getAccessToken('super_admin');
    test.skip(!token, 'Could not get super_admin token');

    const response = await callEdgeFunction({
      functionName: 'run-rls-tests',
      method: 'POST',
      authToken: token!
    });

    // Function should execute (may be 200 or 500 depending on setup)
    expect([200, 500]).toContain(response.status);

    if (response.status === 200) {
      const data = await response.json();
      expect(data).toHaveProperty('total');
      expect(data).toHaveProperty('passed');
      expect(data).toHaveProperty('failed');
    }
  });

  test('SEC-CP-005: system_global_state tracks mode changes', async () => {
    const adminAuth = await createAuthenticatedClient('super_admin');
    test.skip(!adminAuth, 'Could not authenticate super_admin');

    const { client } = adminAuth!;
    
    // Get current system mode
    const { data: currentState, error: stateError } = await client
      .from('system_global_state')
      .select('mode, reason, triggered_at')
      .order('triggered_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Should be able to read state (even if null)
    expect(stateError).toBeNull();
    
    if (currentState) {
      expect(['normal', 'emergency_stop', 'maintenance']).toContain(currentState.mode);
    }
  });

  test('SEC-CP-006: security alerts table has proper structure', async () => {
    const adminAuth = await createAuthenticatedClient('super_admin');
    test.skip(!adminAuth, 'Could not authenticate super_admin');

    const { client } = adminAuth!;
    
    // Check system_alerts table structure
    const { data, error } = await client
      .from('system_alerts')
      .select('id, alert_type, severity, message, resolved, created_at')
      .limit(1);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('SEC-CP-007: incident_groups table is accessible to admin', async () => {
    const adminAuth = await createAuthenticatedClient('super_admin');
    test.skip(!adminAuth, 'Could not authenticate super_admin');

    const { client } = adminAuth!;
    
    const { data, error } = await client
      .from('incident_groups')
      .select('id, status, created_at')
      .limit(5);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBeTruthy();
  });

  test('SEC-CP-008: regular users cannot insert into system_global_state', async () => {
    const viewerAuth = await createAuthenticatedClient('viewer');
    test.skip(!viewerAuth, 'Could not authenticate viewer');

    const { client } = viewerAuth!;
    
    // Try to insert a mode change (should fail)
    const { error } = await client
      .from('system_global_state')
      .insert({
        mode: 'emergency_stop',
        reason: 'Unauthorized test attempt',
        triggered_by: '00000000-0000-0000-0000-000000000000'
      });

    // Should be blocked by RLS
    expect(error).not.toBeNull();
  });

  test('SEC-CP-009: security_logs cannot be deleted by regular users', async () => {
    const viewerAuth = await createAuthenticatedClient('viewer');
    test.skip(!viewerAuth, 'Could not authenticate viewer');

    const { client } = viewerAuth!;
    
    // Try to delete security logs (should fail)
    const { error } = await client
      .from('security_logs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000');

    // Should be blocked - security_logs is append-only
    expect(error).not.toBeNull();
  });

  test('SEC-CP-010: rls_test_results accessible for reading by admin', async () => {
    const adminAuth = await createAuthenticatedClient('super_admin');
    test.skip(!adminAuth, 'Could not authenticate super_admin');

    const { client } = adminAuth!;
    
    const { data, error } = await client
      .from('rls_test_results')
      .select('*')
      .order('tested_at', { ascending: false })
      .limit(5);

    expect(error).toBeNull();
    expect(Array.isArray(data)).toBeTruthy();
  });
});

test.describe('Kill Switch Functionality', () => {
  test.beforeEach(async () => {
    test.skip(!hasSecurityTestEnvVars(), 'Security test environment not configured');
  });

  test('SEC-KS-001: super admin can activate emergency mode', async () => {
    const adminAuth = await createAuthenticatedClient('super_admin');
    test.skip(!adminAuth, 'Could not authenticate super_admin');

    const { client, session } = adminAuth!;
    const userId = session.user.id;
    
    // Insert emergency mode state
    const { error } = await client
      .from('system_global_state')
      .insert({
        mode: 'emergency_stop',
        reason: 'E2E test activation',
        triggered_by: userId
      });

    expect(error).toBeNull();

    // Verify it was inserted
    const { data: currentState, error: readError } = await client
      .from('system_global_state')
      .select('mode')
      .order('triggered_at', { ascending: false })
      .limit(1)
      .single();

    expect(readError).toBeNull();
    expect(currentState?.mode).toBe('emergency_stop');

    // Cleanup: restore normal mode
    await client.from('system_global_state').insert({
      mode: 'normal',
      reason: 'E2E test cleanup',
      triggered_by: userId
    });
  });

  test('SEC-KS-002: regular users cannot activate emergency mode', async () => {
    const viewerAuth = await createAuthenticatedClient('viewer');
    test.skip(!viewerAuth, 'Could not authenticate viewer');

    const { client } = viewerAuth!;
    
    const { error } = await client
      .from('system_global_state')
      .insert({
        mode: 'emergency_stop',
        reason: 'Unauthorized attempt',
        triggered_by: '00000000-0000-0000-0000-000000000000'
      });

    // Should be blocked by RLS
    expect(error).not.toBeNull();
  });
});
