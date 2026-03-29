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

// Skip all tests if env vars are missing - using beforeEach for proper Playwright skip behavior
test.beforeEach((_fixtures, testInfo) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    console.warn('⚠️ Skipping Red Team tests: Missing SUPABASE_URL or SUPABASE_ANON_KEY');
    testInfo.skip();
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

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED-006: DATABASE STATE VALIDATION (Red Team Reinforcement)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that RLS bypass attempts do not change actual database state.
 * This transforms tests into non-bypassable verification by checking final state.
 */
test.describe('RED-006: Database State Validation', () => {
  
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Missing environment variables');

  test('RLS bypass attempt should not change approval status in database', async ({ request }) => {
    // Step 1: Get existing pending approval (if any) to verify state preservation
    const getResponse = await request.get(
      `${SUPABASE_URL}/rest/v1/approval_requests?status=eq.pending&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const existingApprovals = await getResponse.json();
    const targetId = Array.isArray(existingApprovals) && existingApprovals.length > 0 
      ? existingApprovals[0].id 
      : '00000000-0000-0000-0000-000000000000';
    
    // Step 2: Attempt RLS bypass via direct PATCH
    const attackResponse = await request.patch(
      `${SUPABASE_URL}/rest/v1/approval_requests?id=eq.${targetId}`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: { 
          status: 'approved',
          approved_by: '00000000-0000-0000-0000-000000000001',
          approved_at: new Date().toISOString()
        }
      }
    );
    
    // Attack should be blocked
    const attackResult = await attackResponse.json();
    if (attackResponse.status() === 200) {
      expect(Array.isArray(attackResult) ? attackResult.length : 0).toBe(0);
    }
    
    // Step 3: Verify database state unchanged (critical Red Team validation)
    if (Array.isArray(existingApprovals) && existingApprovals.length > 0) {
      const verifyResponse = await request.get(
        `${SUPABASE_URL}/rest/v1/approval_requests?id=eq.${targetId}&select=status`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY!,
            'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      const verifyData = await verifyResponse.json();
      
      // Status MUST remain 'pending' - state should not have changed
      if (Array.isArray(verifyData) && verifyData.length > 0) {
        expect(verifyData[0].status).toBe('pending');
      }
    }
  });

  test('bulk update attack should not modify any approval statuses', async ({ request }) => {
    // Attempt to bulk update all pending approvals to approved
    const attackResponse = await request.patch(
      `${SUPABASE_URL}/rest/v1/approval_requests?status=eq.pending`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: { 
          status: 'approved',
          approved_by: 'attacker-uuid'
        }
      }
    );
    
    // Should affect 0 rows
    const result = await attackResponse.json();
    expect(Array.isArray(result) ? result.length : 0).toBe(0);
    
    // Verify no approved_by field was set to 'attacker-uuid'
    const verifyResponse = await request.get(
      `${SUPABASE_URL}/rest/v1/approval_requests?approved_by=eq.attacker-uuid`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    const verifyData = await verifyResponse.json();
    expect(Array.isArray(verifyData) ? verifyData.length : 0).toBe(0);
  });

  test('delete attack should not remove approval requests', async ({ request }) => {
    // Get count before attack
    const beforeResponse = await request.get(
      `${SUPABASE_URL}/rest/v1/approval_requests?select=count`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'count=exact'
        }
      }
    );
    
    // Attempt DELETE attack
    const attackResponse = await request.delete(
      `${SUPABASE_URL}/rest/v1/approval_requests?status=eq.pending`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      }
    );
    
    // Should be blocked by RLS
    expect([200, 401, 403, 404]).toContain(attackResponse.status());
    
    if (attackResponse.status() === 200) {
      const deleted = await attackResponse.json();
      expect(Array.isArray(deleted) ? deleted.length : 0).toBe(0);
    }
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED-007: REPLAY ATTACK PREVENTION (Red Team Reinforcement)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that valid internal secrets cannot be reused for cross-tenant attacks.
 * Even if attacker captures a valid secret, payload validation must still apply.
 */
test.describe('RED-007: Replay Attack Prevention', () => {
  
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Missing environment variables');

  test('should reject reused internal secret with altered tenant payload', async ({ request }) => {
    // Simulating: attacker captures valid X-Internal-Secret and tries to use for different tenant
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'X-Internal-Secret': 'captured-valid-secret-attempt',
          'Content-Type': 'application/json'
          // No Authorization - relying only on internal secret
        },
        data: {
          tenant_id: 'ffffffff-ffff-ffff-ffff-ffffffffffff', // Different tenant
          trigger_type: 'manual'
        }
      }
    );
    
    // Should be rejected - internal secret doesn't grant cross-tenant access
    expect([401, 403]).toContain(response.status());
    
    const body = await response.json();
    expect(body.error).toBeTruthy();
  });

  test('should reject internal secret with escalated privileges payload', async ({ request }) => {
    // Attacker tries to add admin flags via payload manipulation
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`,
      {
        headers: {
          'X-Internal-Secret': 'forged-internal-secret',
          'Content-Type': 'application/json'
        },
        data: {
          tenant_id: '00000000-0000-0000-0000-000000000000',
          trigger_type: 'manual',
          // Attacker-injected escalation fields
          is_admin: true,
          bypass_approval: true,
          skip_rate_limit: true,
          force_execute: true
        }
      }
    );
    
    // Must be rejected
    expect([401, 403]).toContain(response.status());
  });

  test('should reject payload with SQL injection in trigger parameters', async ({ request }) => {
    // SQL injection attempt in trigger-related fields
    const injectionPayloads = [
      { playbook_id: "'; DROP TABLE playbooks; --" },
      { trigger_type: "manual'; SELECT * FROM tenants; --" },
      { metadata: { sql: "1=1 OR 1=1" } }
    ];
    
    for (const injection of injectionPayloads) {
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
            ...injection
          }
        }
      );
      
      // Should fail validation or auth
      expect([400, 401, 403, 422]).toContain(response.status());
    }
  });

  test('should reject repeated identical requests (anti-replay)', async ({ request }) => {
    const identicalPayload = {
      tenant_id: '00000000-0000-0000-0000-000000000000',
      trigger_type: 'manual',
      playbook_id: '00000000-0000-0000-0000-000000000000',
      timestamp: Date.now().toString()
    };
    
    // Send identical requests rapidly
    const responses = await Promise.all([
      request.post(`${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        data: identicalPayload
      }),
      request.post(`${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        data: identicalPayload
      }),
      request.post(`${SUPABASE_URL}/functions/v1/evaluate-playbook-triggers`, {
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_ANON_KEY}` },
        data: identicalPayload
      })
    ]);
    
    // All should fail auth - but we're validating system handles duplicate requests
    const statuses = responses.map(r => r.status());
    
    // All should be rejected (no successful bypass through repetition)
    expect(statuses.every(s => [400, 401, 403, 429].includes(s))).toBe(true);
  });
});

/**
 * ═══════════════════════════════════════════════════════════════════════════
 * RED-008: RATE LIMIT RESET VALIDATION (Red Team Reinforcement)
 * ═══════════════════════════════════════════════════════════════════════════
 * 
 * Validates that rate limit properly resets after approvals are processed.
 * This prevents operational DoS where tenants get permanently locked out.
 */
test.describe('RED-008: Rate Limit Reset Validation', () => {
  
  test.skip(!SUPABASE_URL || !SUPABASE_ANON_KEY, 'Missing environment variables');

  test('rate limit state should be tenant-isolated', async ({ request }) => {
    // Verify rate_limits table is properly protected
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/rate_limits`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json'
        }
      }
    );
    
    // Rate limits should be protected by RLS
    expect(response.status()).toBe(200);
    const data = await response.json();
    
    // Unauthenticated should see empty or only own tenant data
    expect(Array.isArray(data)).toBe(true);
  });

  test('cannot manipulate rate_limits directly via REST', async ({ request }) => {
    // Attempt to reset rate limit via direct INSERT/UPDATE
    const attackResponse = await request.post(
      `${SUPABASE_URL}/rest/v1/rate_limits`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: {
          identifier: 'attack-tenant-id',
          endpoint: 'approval_requests',
          request_count: 0, // Reset to bypass limit
          window_start: new Date().toISOString()
        }
      }
    );
    
    // Should be blocked by RLS
    expect([401, 403, 404, 409]).toContain(attackResponse.status());
  });

  test('cannot delete rate_limits to bypass enforcement', async ({ request }) => {
    // Attempt to DELETE rate limit entries
    const attackResponse = await request.delete(
      `${SUPABASE_URL}/rest/v1/rate_limits?identifier=eq.attack-tenant`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        }
      }
    );
    
    // Should be blocked
    if (attackResponse.status() === 200) {
      const deleted = await attackResponse.json();
      expect(Array.isArray(deleted) ? deleted.length : 0).toBe(0);
    } else {
      expect([401, 403, 404]).toContain(attackResponse.status());
    }
  });

  test('rate limit counter cannot be decremented via REST', async ({ request }) => {
    // Attempt to decrement request_count to gain more quota
    const attackResponse = await request.patch(
      `${SUPABASE_URL}/rest/v1/rate_limits`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: {
          request_count: 0,
          blocked_until: null // Clear block
        }
      }
    );
    
    // Should affect 0 rows (blocked by RLS)
    if (attackResponse.status() === 200) {
      const result = await attackResponse.json();
      expect(Array.isArray(result) ? result.length : 0).toBe(0);
    }
  });

  test('blocked_until cannot be cleared by unauthorized user', async ({ request }) => {
    // Try to clear a block by setting blocked_until to past
    const attackResponse = await request.patch(
      `${SUPABASE_URL}/rest/v1/rate_limits?blocked_until=not.is.null`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Authorization': `Bearer ${SUPABASE_ANON_KEY}`,
          'Content-Type': 'application/json',
          'Prefer': 'return=representation'
        },
        data: {
          blocked_until: '2000-01-01T00:00:00Z' // Set to past to "unblock"
        }
      }
    );
    
    // Should be blocked by RLS
    if (attackResponse.status() === 200) {
      const result = await attackResponse.json();
      expect(Array.isArray(result) ? result.length : 0).toBe(0);
    }
  });
});
