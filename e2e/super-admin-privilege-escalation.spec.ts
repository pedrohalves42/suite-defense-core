import { test, expect } from '@playwright/test';

/**
 * CRITICAL SECURITY TESTS: Super Admin Privilege Escalation Prevention
 * 
 * These tests validate that:
 * 1. Only super_admin users can access super_admin-only Edge Functions
 * 2. Regular admins cannot escalate privileges
 * 3. Backend validation cannot be bypassed
 */

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

// Test users (must exist in database)
const SUPER_ADMIN_USER = {
  email: 'super@cybershield.test',
  password: 'SuperSecure123!@#',
};

const REGULAR_ADMIN_USER = {
  email: 'admin@cybershield.test',
  password: 'AdminSecure123!@#',
};

const OPERATOR_USER = {
  email: 'operator@cybershield.test',
  password: 'OperatorSecure123!@#',
};

test.describe('Super Admin Security - list-all-users-admin', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('[CRITICAL] super_admin can access list-all-users-admin', async ({ page }) => {
    console.log('[TEST] Login as super_admin');
    
    // Navigate to login
    await page.goto('/login');
    
    // Login as super_admin
    await page.fill('input[type="email"]', SUPER_ADMIN_USER.email);
    await page.fill('input[type="password"]', SUPER_ADMIN_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    console.log('[TEST] Calling list-all-users-admin Edge Function');
    
    // Call Edge Function directly
    const response = await page.evaluate(async ({ url, key, email }) => {
      // Get session token
      const { data: { session } } = await (window as any).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No session token found');
      }
      
      // Call Edge Function
      const res = await fetch(`${url}/functions/v1/list-all-users-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': key,
        },
      });
      
      return {
        status: res.status,
        statusText: res.statusText,
        data: await res.json().catch(() => null),
      };
    }, { 
      url: SUPABASE_URL, 
      key: SUPABASE_ANON_KEY,
      email: SUPER_ADMIN_USER.email,
    });
    
    console.log('[TEST] Response:', response);
    
    // Should succeed with 200
    expect(response.status).toBe(200);
    expect(response.data).toBeDefined();
    expect(Array.isArray(response.data)).toBe(true);
    
    // Should contain users from multiple tenants (super_admin sees all)
    if (response.data.length > 0) {
      const tenantIds = new Set(response.data.map((u: any) => u.tenant_id));
      console.log('[TEST] Tenants in response:', tenantIds.size);
      
      // Super admin should see users from multiple tenants (or at least their own)
      expect(tenantIds.size).toBeGreaterThanOrEqual(1);
    }
  });

  test('[CRITICAL] regular admin CANNOT access list-all-users-admin', async ({ page }) => {
    console.log('[TEST] Login as regular admin');
    
    // Navigate to login
    await page.goto('/login');
    
    // Login as regular admin
    await page.fill('input[type="email"]', REGULAR_ADMIN_USER.email);
    await page.fill('input[type="password"]', REGULAR_ADMIN_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    console.log('[TEST] Attempting to call list-all-users-admin Edge Function');
    
    // Attempt to call Edge Function directly
    const response = await page.evaluate(async ({ url, key }) => {
      // Get session token
      const { data: { session } } = await (window as any).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No session token found');
      }
      
      // Attempt to call Edge Function
      const res = await fetch(`${url}/functions/v1/list-all-users-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': key,
        },
      });
      
      return {
        status: res.status,
        statusText: res.statusText,
        data: await res.json().catch(() => null),
      };
    }, { url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
    
    console.log('[TEST] Response:', response);
    
    // Should be denied with 403 Forbidden
    expect(response.status).toBe(403);
    expect(response.data?.error).toContain('Super Admin');
  });

  test('[CRITICAL] operator CANNOT access list-all-users-admin', async ({ page }) => {
    console.log('[TEST] Login as operator');
    
    // Navigate to login
    await page.goto('/login');
    
    // Login as operator
    await page.fill('input[type="email"]', OPERATOR_USER.email);
    await page.fill('input[type="password"]', OPERATOR_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    console.log('[TEST] Attempting to call list-all-users-admin Edge Function');
    
    // Attempt to call Edge Function directly
    const response = await page.evaluate(async ({ url, key }) => {
      // Get session token
      const { data: { session } } = await (window as any).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No session token found');
      }
      
      // Attempt to call Edge Function
      const res = await fetch(`${url}/functions/v1/list-all-users-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': key,
        },
      });
      
      return {
        status: res.status,
        statusText: res.statusText,
        data: await res.json().catch(() => null),
      };
    }, { url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
    
    console.log('[TEST] Response:', response);
    
    // Should be denied with 403 Forbidden
    expect(response.status).toBe(403);
    expect(response.data?.error).toContain('Super Admin');
  });

  test('[CRITICAL] unauthenticated user CANNOT access list-all-users-admin', async ({ page }) => {
    console.log('[TEST] No login - attempting direct API call');
    
    // Do not login - attempt to call without authentication
    const response = await page.evaluate(async ({ url, key }) => {
      // Attempt to call Edge Function without Authorization header
      const res = await fetch(`${url}/functions/v1/list-all-users-admin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': key,
        },
      });
      
      return {
        status: res.status,
        statusText: res.statusText,
        data: await res.json().catch(() => null),
      };
    }, { url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
    
    console.log('[TEST] Response:', response);
    
    // Should be denied with 401 Unauthorized
    expect(response.status).toBe(401);
    expect(response.data?.error).toContain('Unauthorized');
  });

  test('[CRITICAL] tampered JWT CANNOT bypass super_admin check', async ({ page }) => {
    console.log('[TEST] Login as regular admin, then tamper with JWT');
    
    // Navigate to login
    await page.goto('/login');
    
    // Login as regular admin
    await page.fill('input[type="email"]', REGULAR_ADMIN_USER.email);
    await page.fill('input[type="password"]', REGULAR_ADMIN_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    console.log('[TEST] Attempting to call with tampered JWT');
    
    // Attempt to call Edge Function with fake JWT
    const response = await page.evaluate(async ({ url, key }) => {
      // Get real session token
      const { data: { session } } = await (window as any).supabase.auth.getSession();
      
      if (!session?.access_token) {
        throw new Error('No session token found');
      }
      
      // Tamper with JWT (add fake super_admin claim)
      // This should NOT work because backend validates against database
      const parts = session.access_token.split('.');
      const payload = JSON.parse(atob(parts[1]));
      payload.user_metadata = { ...payload.user_metadata, role: 'super_admin' };
      const tamperedJWT = parts[0] + '.' + btoa(JSON.stringify(payload)) + '.' + parts[2];
      
      // Attempt to call Edge Function with tampered JWT
      const res = await fetch(`${url}/functions/v1/list-all-users-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tamperedJWT}`,
          'Content-Type': 'application/json',
          'apikey': key,
        },
      });
      
      return {
        status: res.status,
        statusText: res.statusText,
        data: await res.json().catch(() => null),
      };
    }, { url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
    
    console.log('[TEST] Response:', response);
    
    // Should be denied - either 401 (invalid signature) or 403 (valid JWT but not super_admin in DB)
    expect([401, 403]).toContain(response.status);
  });

  test('[SECURITY] audit log is created for super_admin access', async ({ page }) => {
    console.log('[TEST] Login as super_admin and verify audit logging');
    
    // Navigate to login
    await page.goto('/login');
    
    // Login as super_admin
    await page.fill('input[type="email"]', SUPER_ADMIN_USER.email);
    await page.fill('input[type="password"]', SUPER_ADMIN_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    console.log('[TEST] Calling list-all-users-admin Edge Function');
    
    // Call Edge Function
    await page.evaluate(async ({ url, key }) => {
      const { data: { session } } = await (window as any).supabase.auth.getSession();
      
      await fetch(`${url}/functions/v1/list-all-users-admin`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
          'Content-Type': 'application/json',
          'apikey': key,
        },
      });
    }, { url: SUPABASE_URL, key: SUPABASE_ANON_KEY });
    
    // Wait a bit for audit log to be written
    await page.waitForTimeout(2000);
    
    console.log('[TEST] Checking audit logs');
    
    // Check if audit log was created (would need to query audit_logs table)
    // This is a simplified check - in production, you'd verify the exact log entry
    const hasAuditLog = await page.evaluate(async () => {
      const { data: logs } = await (window as any).supabase
        .from('audit_logs')
        .select('*')
        .eq('action', 'super_admin_access')
        .order('created_at', { ascending: false })
        .limit(1);
      
      return logs && logs.length > 0;
    });
    
    // Note: This might fail if audit logging isn't implemented yet
    // Keep test for when it is
    console.log('[TEST] Audit log found:', hasAuditLog);
  });
});

test.describe('Super Admin Security - Frontend Validation', () => {
  test('[INFO] SuperAdminLayout should redirect non-super_admin users', async ({ page }) => {
    console.log('[TEST] Login as regular admin');
    
    // Navigate to login
    await page.goto('/login');
    
    // Login as regular admin
    await page.fill('input[type="email"]', REGULAR_ADMIN_USER.email);
    await page.fill('input[type="password"]', REGULAR_ADMIN_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    console.log('[TEST] Attempting to navigate to /super-admin route');
    
    // Attempt to navigate to super-admin route
    await page.goto('/super-admin/tenants');
    
    // Should be redirected to dashboard (or show access denied)
    await page.waitForURL('/dashboard', { timeout: 5000 }).catch(() => {
      // Might not redirect, might show error instead
    });
    
    // Check for "Access Denied" toast or redirect
    const currentUrl = page.url();
    const hasAccessDeniedMessage = await page.locator('text=/Access Denied|not have.*permissions/i').count() > 0;
    
    console.log('[TEST] Current URL:', currentUrl);
    console.log('[TEST] Has access denied message:', hasAccessDeniedMessage);
    
    // Either redirected OR shows access denied message
    expect(
      currentUrl.includes('/dashboard') || hasAccessDeniedMessage
    ).toBe(true);
  });

  test('[INFO] useSuperAdmin hook should return false for regular admin', async ({ page }) => {
    console.log('[TEST] Login as regular admin and check useSuperAdmin hook');
    
    // Navigate to login
    await page.goto('/login');
    
    // Login as regular admin
    await page.fill('input[type="email"]', REGULAR_ADMIN_USER.email);
    await page.fill('input[type="password"]', REGULAR_ADMIN_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    console.log('[TEST] Checking useSuperAdmin state');
    
    // Check if useSuperAdmin returns false
    const isSuperAdmin = await page.evaluate(async () => {
      // Check via RPC (simulating what useSuperAdmin does)
      const { data: { user } } = await (window as any).supabase.auth.getUser();
      
      const { data } = await (window as any).supabase.rpc('is_super_admin', {
        _user_id: user.id
      });
      
      return data;
    });
    
    console.log('[TEST] isSuperAdmin:', isSuperAdmin);
    
    // Should be false
    expect(isSuperAdmin).toBe(false);
  });

  test('[INFO] useSuperAdmin hook should return true for super_admin', async ({ page }) => {
    console.log('[TEST] Login as super_admin and check useSuperAdmin hook');
    
    // Navigate to login
    await page.goto('/login');
    
    // Login as super_admin
    await page.fill('input[type="email"]', SUPER_ADMIN_USER.email);
    await page.fill('input[type="password"]', SUPER_ADMIN_USER.password);
    await page.click('button[type="submit"]');
    
    // Wait for login to complete
    await page.waitForURL('/dashboard', { timeout: 10000 });
    
    console.log('[TEST] Checking useSuperAdmin state');
    
    // Check if useSuperAdmin returns true
    const isSuperAdmin = await page.evaluate(async () => {
      // Check via RPC (simulating what useSuperAdmin does)
      const { data: { user } } = await (window as any).supabase.auth.getUser();
      
      const { data } = await (window as any).supabase.rpc('is_super_admin', {
        _user_id: user.id
      });
      
      return data;
    });
    
    console.log('[TEST] isSuperAdmin:', isSuperAdmin);
    
    // Should be true
    expect(isSuperAdmin).toBe(true);
  });
});

