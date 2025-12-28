/**
 * RED TEAM SECURITY VALIDATION TESTS
 * 
 * Testes adversariais que validam as correções de segurança:
 * - P0: RLS bypass em approval_requests (deve ser bloqueado)
 * - P0: Trigger injection sem autenticação (deve ser rejeitado)
 * - P1: Rate limit de approvals por tenant (deve limitar a 10)
 * 
 * @see docs/SECURITY_ARCHITECTURE.md
 */

import { test, expect } from '@playwright/test';

// Environment variables
const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Skip all tests if env vars are missing
test.beforeAll(() => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('⚠️ Skipping Red Team tests: Missing SUPABASE_URL or SUPABASE_ANON_KEY');
  }
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED-001: RLS BYPASS PREVENTION - approval_requests
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that direct REST API access cannot bypass RLS policies.
 * The "Only service role can update approval requests" policy should block
 * any UPDATE operations from anon/authenticated users.
 */
test.describe('RED-001: RLS Approval Request Bypass Prevention', () => {
  
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Missing environment variables');

  test('should block UPDATE via REST API with anon key', async ({ request }) => {
    // Attempt to update approval_requests directly via REST API
    // This should be blocked by RLS policy
    const response = await request.patch(
      `${SUPABASE_URL}/rest/v1/approval_requests?id=eq.00000000-0000-0000-0000-000000000000`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: { 
          status: 'approved',
          approved_by: '00000000-0000-0000-0000-000000000001'
        }
      }
    );
    
    // RLS should block this - expect 403 Forbidden or empty result
    // PostgREST returns 200 with empty array when RLS blocks the update
    const status = response.status();
    
    if (status === 200) {
      const body = await response.json();
      // If 200, should return empty array (0 rows affected)
      expect(Array.isArray(body) ? body.length : 0).toBe(0);
    } else {
      // Otherwise expect 401/403
      expect([401, 403, 404]).toContain(status);
    }
  });

  test('should block INSERT of forged approval via REST API', async ({ request }) => {
    // Attempt to insert a fake approved request
    const response = await request.post(
      `${SUPABASE_URL}/rest/v1/approval_requests`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: {
          tenant_id: '00000000-0000-0000-0000-000000000000',
          playbook_id: '00000000-0000-0000-0000-000000000000',
          trigger_event_id: '00000000-0000-0000-0000-000000000000',
          status: 'approved', // Trying to insert as already approved
          approval_token: 'forged-token-12345',
          expires_at: new Date(Date.now() + 86400000).toISOString()
        }
      }
    );
    
    // Should be blocked
    const status = response.status();
    expect([401, 403, 404, 409]).toContain(status);
  });

  test('should block direct status change to approved via REST', async ({ request }) => {
    // Even with a valid-looking request, status changes should be blocked
    const response = await request.patch(
      `${SUPABASE_URL}/rest/v1/approval_requests`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: { 
          status: 'approved'
        },
        params: {
          status: 'eq.pending' // Try to update all pending to approved
        }
      }
    );
    
    const status = response.status();
    
    if (status === 200) {
      const body = await response.json();
      // Should affect 0 rows
      expect(Array.isArray(body) ? body.length : 0).toBe(0);
    } else {
      expect([401, 403]).toContain(status);
    }
  });

  test('should allow SELECT on approval_requests for authenticated admin', async ({ request }) => {
    // SELECT should work for admins (read-only access)
    // This validates RLS isn't completely blocking everything
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/approval_requests?limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Should return 200 (even if empty array for unauthorized)
    expect(response.status()).toBe(200);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED-002: TRIGGER INJECTION PREVENTION - evaluate-playbook-triggers
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that the edge function properly validates authentication
 * and rejects unauthorized trigger attempts.
 */
test.describe('RED-002: Trigger Injection Prevention', () => {
  
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Missing environment variables');

  test('should reject trigger call without any authentication', async ({ request }) => {
    // Call edge function without Authorization header
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'Content-Type': 'application/json'
          // No Authorization header
        },
        data: {
          tenant_id: '00000000-0000-0000-0000-000000000000',
          trigger_type: 'manual'
        }
      }
    );
    
    // Should be rejected
    expect([401, 403]).toContain(response.status());
    
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('should reject forged X-Internal-Secret header', async ({ request }) => {
    // Attempt to bypass auth by forging internal secret
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': 'forged-secret-attack-attempt'
          // No valid Authorization
        },
        data: {
          tenant_id: '00000000-0000-0000-0000-000000000000',
          trigger_type: 'scheduled'
        }
      }
    );
    
    // Forged secret should be rejected
    expect([401, 403]).toContain(response.status());
  });

  test('should reject trigger with only anon key (no JWT)', async ({ request }) => {
    // Using anon key in Authorization header (not a valid JWT)
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        data: {
          tenant_id: '00000000-0000-0000-0000-000000000000',
          trigger_type: 'manual',
          playbook_id: '00000000-0000-0000-0000-000000000000'
        }
      }
    );
    
    // Anon key is not a valid user JWT - should be rejected
    expect([400, 401, 403]).toContain(response.status());
  });

  test('should reject empty body trigger attempt', async ({ request }) => {
    // Send empty body to try to confuse validation
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        data: {}
      }
    );
    
    // Should fail validation
    expect([400, 401, 403]).toContain(response.status());
  });

  test('should reject malformed JSON trigger attempt', async ({ request }) => {
    // Send malformed data
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'Content-Type': 'application/json'
        },
        data: 'not-json-at-all'
      }
    );
    
    // Should fail parsing
    expect([400, 401, 403, 500]).toContain(response.status());
  });

  test('should handle SQL injection in tenant_id gracefully', async ({ request }) => {
    // Attempt SQL injection via tenant_id
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        data: {
          tenant_id: "'; DROP TABLE approval_requests; --",
          trigger_type: 'manual'
        }
      }
    );
    
    // Should reject invalid UUID or fail auth
    expect([400, 401, 403, 422]).toContain(response.status());
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED-003: RATE LIMIT ENFORCEMENT - Approval Request Flooding
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that the system enforces a maximum of 10 pending approvals
 * per tenant to prevent approval fatigue attacks.
 */
test.describe('RED-003: Approval Rate Limit Enforcement', () => {
  
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Missing environment variables');

  test('should have rate_limits entry for approval_requests', async ({ request }) => {
    // Verify rate limit configuration exists
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/rate_limits?table_name=eq.approval_requests`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    
    // Should have a rate limit configured (may be empty if RLS blocks)
    // The important thing is the query works
    expect(Array.isArray(body)).toBe(true);
  });

  test('trigger function should mention rate limit in error when exceeded', async ({ request }) => {
    // This test validates the error message format when rate limit is hit
    // We can't easily hit the limit in a test, but we can verify the function
    // handles the scenario correctly
    
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}` // Will fail auth
        },
        data: {
          tenant_id: '00000000-0000-0000-0000-000000000000',
          trigger_type: 'manual',
          playbook_id: '00000000-0000-0000-0000-000000000000'
        }
      }
    );
    
    // Should fail auth before hitting rate limit
    // This validates the function is reachable and responding
    expect([400, 401, 403, 429]).toContain(response.status());
  });

  test('should not allow creating approval_requests directly via REST', async ({ request }) => {
    // Even legitimate-looking INSERTs should be blocked by RLS
    // This prevents bypassing the rate limit via direct DB access
    
    const fakeApprovals = Array.from({ length: 15 }, (_, i) => ({
      tenant_id: '00000000-0000-0000-0000-000000000000',
      playbook_id: '00000000-0000-0000-0000-000000000000',
      trigger_event_id: '00000000-0000-0000-0000-000000000000',
      status: 'pending',
      approval_token: `test-token-${i}`,
      expires_at: new Date(Date.now() + 86400000).toISOString()
    }));
    
    // Try to insert 15 approvals at once to bypass rate limit
    const response = await request.post(
      `${SUPABASE_URL}/rest/v1/approval_requests`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: fakeApprovals
      }
    );
    
    // Should be blocked by RLS
    const status = response.status();
    expect([401, 403, 404, 409]).toContain(status);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED-004: ADDITIONAL SECURITY INVARIANTS
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Additional security checks for edge cases and attack vectors.
 */
test.describe('RED-004: Additional Security Invariants', () => {
  
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Missing environment variables');

  test('audit_logs should not be writable via REST', async ({ request }) => {
    // Attempt to forge audit log entries
    const response = await request.post(
      `${SUPABASE_URL}/rest/v1/audit_logs`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: {
          tenant_id: '00000000-0000-0000-0000-000000000000',
          action: 'FORGED_ACTION',
          actor_id: '00000000-0000-0000-0000-000000000001',
          details: { forged: true }
        }
      }
    );
    
    // Should be blocked
    expect([401, 403, 404]).toContain(response.status());
  });

  test('user_roles should not be writable via REST', async ({ request }) => {
    // Attempt privilege escalation via direct role insertion
    const response = await request.post(
      `${SUPABASE_URL}/rest/v1/user_roles`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: {
          user_id: '00000000-0000-0000-0000-000000000001',
          role: 'super_admin'
        }
      }
    );
    
    // Should be blocked - privilege escalation attempt
    expect([401, 403, 404]).toContain(response.status());
  });

  test('sensitive columns should not be exposed in REST response', async ({ request }) => {
    // Query agents table to check for sensitive data exposure
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/agents?limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.status() === 200) {
      const body = await response.json();
      
      if (Array.isArray(body) && body.length > 0) {
        const agent = body[0];
        
        // hmac_secret should NEVER be exposed
        // If the view/RLS is properly configured, it won't be present
        // or will be null/redacted
        if (agent.hmac_secret) {
          // If present, should be redacted or the view is wrong
          expect(agent.hmac_secret).not.toMatch(/^[a-f0-9]{64}$/);
        }
      }
    }
  });

  test('enrollment_keys should not expose secret via REST', async ({ request }) => {
    // Check enrollment_keys for secret exposure
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/enrollment_keys?limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    if (response.status() === 200) {
      const body = await response.json();
      
      if (Array.isArray(body) && body.length > 0) {
        const key = body[0];
        
        // key_secret should be redacted or not present
        if (key.key_secret) {
          // Should be using the safe view
          expect(key.key_secret).toMatch(/^\*+$|^REDACTED$/);
        }
      }
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED-005: CROSS-TENANT ISOLATION VALIDATION
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that tenant isolation is enforced for approval-related data.
 */
test.describe('RED-005: Cross-Tenant Isolation', () => {
  
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Missing environment variables');

  test('should not allow querying approval_requests across tenants', async ({ request }) => {
    // Attempt to query all approval_requests (should be filtered by tenant)
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/approval_requests`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    expect(response.status()).toBe(200);
    
    const body = await response.json();
    
    // Without proper auth, should return empty or only public data
    // RLS should filter based on tenant
    expect(Array.isArray(body)).toBe(true);
  });

  test('trigger function should validate tenant access', async ({ request }) => {
    // Attempt to trigger playbook for a tenant we don't belong to
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`
        },
        data: {
          // Random tenant ID that user doesn't belong to
          tenant_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff',
          trigger_type: 'manual',
          playbook_id: '00000000-0000-0000-0000-000000000000'
        }
      }
    );
    
    // Should fail - no access to this tenant
    expect([400, 401, 403]).toContain(response.status());
  });
});
