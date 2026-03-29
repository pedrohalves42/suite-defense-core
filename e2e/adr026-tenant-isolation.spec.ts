/**
 * ADR-026: Active Tenant Isolation E2E Tests
 * 
 * Tests for validating the active tenant context isolation mechanism.
 * These tests ensure that the frontend properly blocks queries until
 * tenant context is established and that cross-tenant access is prevented.
 * 
 * Reference: docs/architecture/ADR-026-active-tenant-isolation.md
 */

import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Skip if not configured
test.beforeEach((_fixtures, testInfo) => {
  if (!SUPABASE_URL) {
    console.log('⚠️ SUPABASE_URL not configured, skipping ADR-026 tests');
    testInfo.skip();
  }
});

/**
 * =============================================================================
 * ADR-026: Active Tenant Context Enforcement
 * =============================================================================
 */
test.describe('ADR-026: Active Tenant Isolation', () => {

  test('agents table should deny direct SELECT for authenticated users', async ({ request }) => {
    // Attempt to query agents table directly
    const response = await request.get(`${SUPABASE_URL}/rest/v1/agents`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept': 'application/json'
      },
      params: {
        select: '*',
        limit: '10'
      }
    });

    const data = await response.json();
    
    // Direct access should return empty due to agents_deny_direct_select policy
    if (Array.isArray(data)) {
      expect(data.length).toBe(0);
    }
  });

  test('agents_safe view should be accessible and exclude hmac_secret', async ({ request }) => {
    // Query agents_safe view
    const response = await request.get(`${SUPABASE_URL}/rest/v1/agents_safe`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept': 'application/json'
      },
      params: {
        select: '*',
        limit: '1'
      }
    });

    // View should exist and be queryable
    expect([200, 401]).toContain(response.status());
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const row = data[0];
      // Verify hmac_secret is NOT present
      expect(row).not.toHaveProperty('hmac_secret');
      expect(row).not.toHaveProperty('payload_hash');
      // But should have other expected fields
      expect(row).toHaveProperty('id');
      expect(row).toHaveProperty('tenant_id');
    }
  });

  test('should block direct access to enrollment_keys table', async ({ request }) => {
    const response = await request.get(`${SUPABASE_URL}/rest/v1/enrollment_keys`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      params: {
        select: '*',
        limit: '10'
      }
    });

    const data = await response.json();
    
    // Should be empty for unauthenticated/wrong tenant
    if (Array.isArray(data)) {
      expect(data.length).toBe(0);
    }
  });

  test('enrollment_keys_safe should mask sensitive key field', async ({ request }) => {
    const response = await request.get(`${SUPABASE_URL}/rest/v1/enrollment_keys_safe`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept': 'application/json'
      },
      params: {
        select: '*',
        limit: '1'
      }
    });

    expect([200, 401]).toContain(response.status());
    
    const data = await response.json();
    
    if (Array.isArray(data) && data.length > 0) {
      const row = data[0];
      // Key should be masked or absent
      if (row.key) {
        expect(row.key).toMatch(/^\*+$|^REDACTED$|masked$/i);
      }
    }
  });

  test('should reject requests without proper tenant context in JWT', async ({ request }) => {
    // Attempt to access multi-tenant table without proper context
    const protectedEndpoints = [
      'agents_safe',
      'jobs',
      'audit_logs',
      'system_alerts'
    ];

    for (const endpoint of protectedEndpoints) {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        params: { limit: '5' }
      });

      const data = await response.json();
      
      // Without proper tenant context, should return empty
      if (Array.isArray(data)) {
        expect(data.length).toBe(0);
      }
    }
  });

  test('v_tenant_claim_health view should exist and be queryable', async ({ request }) => {
    const response = await request.get(`${SUPABASE_URL}/rest/v1/v_tenant_claim_health`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        'Accept': 'application/json'
      },
      params: {
        limit: '10'
      }
    });

    // View should exist
    expect([200, 401]).toContain(response.status());
  });
});

/**
 * =============================================================================
 * INV-ADR026: Security Invariant Tests
 * =============================================================================
 */
test.describe('INV-ADR026: Active Tenant Security Invariants', () => {

  test('should block SQL injection via tenant_id parameter', async ({ request }) => {
    const injectionPayloads = [
      "' OR '1'='1",
      "00000000-0000-0000-0000-000000000000' OR '1'='1",
      "'; DROP TABLE agents; --"
    ];

    for (const payload of injectionPayloads) {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/agents_safe`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        params: {
          tenant_id: `eq.${payload}`,
          limit: '1'
        }
      });

      const data = await response.json();
      
      // Should return empty or error, never data from injection
      if (Array.isArray(data)) {
        expect(data.length).toBe(0);
      }
    }
  });

  test('should not expose hmac_secret via any public endpoint', async ({ request }) => {
    const endpoints = [
      'agents',
      'agents_safe',
      'agents_public',
      'agents_health_view'
    ];

    for (const endpoint of endpoints) {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${endpoint}`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Accept': 'application/json'
        },
        params: {
          select: 'hmac_secret',
          limit: '1'
        }
      });

      const data = await response.json();
      
      // Should either error or return empty, never expose hmac_secret
      if (Array.isArray(data) && data.length > 0) {
        expect(data[0].hmac_secret).toBeUndefined();
      }
    }
  });

  test('should enforce RLS on all critical multi-tenant tables', async ({ request }) => {
    const criticalTables = [
      'agents',
      'jobs',
      'audit_logs',
      'enrollment_keys',
      'user_roles',
      'security_policies',
      'system_alerts'
    ];

    for (const table of criticalTables) {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${table}`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        params: {
          limit: '100'
        }
      });

      const data = await response.json();
      
      // All critical tables should return empty for anon/wrong context
      if (Array.isArray(data)) {
        expect(data.length).toBe(0);
      }
    }
  });

  test('should prevent IDOR attacks via direct UUID access', async ({ request }) => {
    const fakeUUIDs = [
      '11111111-1111-1111-1111-111111111111',
      '22222222-2222-2222-2222-222222222222',
      'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee'
    ];

    for (const fakeId of fakeUUIDs) {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/agents_safe`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
        },
        params: {
          id: `eq.${fakeId}`
        }
      });

      const data = await response.json();
      
      // Should never return data for arbitrary UUIDs
      if (Array.isArray(data)) {
        expect(data.length).toBe(0);
      }
    }
  });
});

/**
 * =============================================================================
 * Performance and SLA Tests
 * =============================================================================
 */
test.describe('ADR-026: Performance SLAs', () => {

  test('agents_safe query should respond within 500ms', async ({ request }) => {
    const start = Date.now();
    
    const response = await request.get(`${SUPABASE_URL}/rest/v1/agents_safe`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      params: {
        limit: '50'
      }
    });

    const duration = Date.now() - start;
    
    expect(response.status()).toBeLessThan(500);
    expect(duration).toBeLessThan(500); // < 500ms
  });

  test('v_tenant_claim_health should aggregate within 1 second', async ({ request }) => {
    const start = Date.now();
    
    const response = await request.get(`${SUPABASE_URL}/rest/v1/v_tenant_claim_health`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
      },
      params: {
        limit: '24'
      }
    });

    const duration = Date.now() - start;
    
    expect(response.status()).toBeLessThan(500);
    expect(duration).toBeLessThan(1000); // < 1s
  });
});
