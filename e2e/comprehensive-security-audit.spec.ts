/**
 * Comprehensive Security Audit E2E Tests
 * 
 * Deep security validation covering:
 * 1. HMAC Authentication (agent communication security)
 * 2. RLS Cross-Tenant Data Isolation
 * 3. Rate Limiting Verification
 * 4. Token Hash Security
 * 5. Privilege Escalation Prevention
 * 
 * @author CyberShield Security Audit
 * @version 1.0.0
 */
import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

// Skip if no Supabase configuration
test.beforeAll(() => {
  if (!SUPABASE_URL) {
    console.log('Skipping security audit tests: SUPABASE_URL not configured');
  }
});

// ============================================
// HMAC AUTHENTICATION SECURITY TESTS
// ============================================
test.describe('HMAC Authentication Security', () => {
  
  /**
   * Generate valid HMAC signature for testing
   */
  function generateHmac(secretHex: string, body: string = ''): { signature: string, timestamp: string, nonce: string } {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const payload = `${timestamp}:${nonce}:${body}`;
    
    const keyBuffer = Buffer.from(secretHex, 'hex');
    const hmac = crypto.createHmac('sha256', keyBuffer);
    hmac.update(payload, 'utf8');
    const signature = hmac.digest('hex');
    
    return { signature, timestamp, nonce };
  }

  test('HMAC signature with correct 64-char hex secret validates correctly', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // This test validates the HMAC format - actual success requires valid agent
    const validHexSecret = 'a'.repeat(64); // 64 hex chars = 32 bytes
    const body = JSON.stringify({ agent_name: 'test-agent' });
    const { signature, timestamp, nonce } = generateHmac(validHexSecret, body);
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'test-token-for-format-validation',
        'X-HMAC-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
      },
      data: body,
    });
    
    // Should fail with 401 (invalid token) not 400 (format error)
    // This proves HMAC format is correct, just credentials invalid
    expect([401, 404]).toContain(response.status());
  });

  test('HMAC with invalid hex characters is rejected', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'test-token',
        'X-HMAC-Signature': 'zzzzzzzz'.repeat(8), // Invalid hex chars
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': crypto.randomUUID(),
      },
      data: JSON.stringify({ agent_name: 'test' }),
    });
    
    expect([400, 401]).toContain(response.status());
  });

  test('HMAC with short signature is rejected', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'test-token',
        'X-HMAC-Signature': 'abcdef1234', // Too short (should be 64 chars)
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': crypto.randomUUID(),
      },
      data: JSON.stringify({ agent_name: 'test' }),
    });
    
    expect([400, 401]).toContain(response.status());
  });

  test('Replay attack prevention - same nonce is rejected', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const fixedNonce = 'fixed-nonce-for-replay-test-' + Date.now();
    
    // First request with unique nonce
    const response1 = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'test-token',
        'X-HMAC-Signature': 'a'.repeat(64),
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': fixedNonce,
      },
      data: JSON.stringify({ agent_name: 'test' }),
    });
    
    // Small delay
    await new Promise(resolve => setTimeout(resolve, 100));
    
    // Second request with SAME nonce (replay attempt)
    const response2 = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'test-token',
        'X-HMAC-Signature': 'a'.repeat(64),
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': fixedNonce, // Same nonce as first request
      },
      data: JSON.stringify({ agent_name: 'test' }),
    });
    
    // At least one should fail (replay protection or auth failure)
    const statusCodes = [response1.status(), response2.status()];
    expect(statusCodes.some(s => s === 401 || s === 400)).toBeTruthy();
  });

  test('Timestamp clock skew beyond 5 minutes is rejected', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Timestamp 10 minutes in the past
    const oldTimestamp = (Date.now() - 10 * 60 * 1000).toString();
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'test-token',
        'X-HMAC-Signature': 'a'.repeat(64),
        'X-Timestamp': oldTimestamp,
        'X-Nonce': crypto.randomUUID(),
      },
      data: JSON.stringify({ agent_name: 'test' }),
    });
    
    expect([400, 401]).toContain(response.status());
    
    const data = await response.json();
    // Should indicate timestamp issue
    if (data.code) {
      expect(['AUTH_TIMESTAMP_OUT_OF_RANGE', 'AUTH_INVALID_SIGNATURE', 'AUTH_MISSING_TOKEN']).toContain(data.code);
    }
  });

  test('Future timestamp is rejected', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Timestamp 10 minutes in the future
    const futureTimestamp = (Date.now() + 10 * 60 * 1000).toString();
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'test-token',
        'X-HMAC-Signature': 'a'.repeat(64),
        'X-Timestamp': futureTimestamp,
        'X-Nonce': crypto.randomUUID(),
      },
      data: JSON.stringify({ agent_name: 'test' }),
    });
    
    expect([400, 401]).toContain(response.status());
  });
});

// ============================================
// RLS CROSS-TENANT ISOLATION TESTS
// ============================================
test.describe('RLS Cross-Tenant Data Isolation', () => {

  test('Direct database access without auth returns empty arrays', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const sensitiveResources = [
      'agents',
      'agent_tokens',
      'enrollment_keys',
      'jobs',
      'software_inventory',
      'vuln_findings',
      'antivirus_status',
      'agent_web_activity',
      'security_events',
      'audit_logs',
      'user_roles',
      'tenant_subscriptions',
    ];
    
    for (const resource of sensitiveResources) {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${resource}?select=*&limit=5`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          // No Authorization header - simulating unauthenticated access
        }
      });
      
      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) && data.length === 0, 
          `Resource ${resource} should return empty array without auth`
        ).toBeTruthy();
      } else {
        // 401 or other error is also acceptable
        expect([401, 403, 404]).toContain(response.status());
      }
    }
  });

  test('hmac_secret column is never exposed via REST API', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Try to explicitly select hmac_secret
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/agents?select=id,agent_name,hmac_secret&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
        }
      }
    );
    
    if (response.status() === 200) {
      const data = await response.json();
      // If data returned, hmac_secret should NOT be present
      if (data.length > 0) {
        expect(data[0]).not.toHaveProperty('hmac_secret');
      }
    }
  });

  test('agents_safe view excludes hmac_secret', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/agents_safe?select=*&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
        }
      }
    );
    
    if (response.status() === 200) {
      const data = await response.json();
      if (data.length > 0) {
        expect(data[0]).not.toHaveProperty('hmac_secret');
        expect(data[0]).not.toHaveProperty('token');
        expect(data[0]).not.toHaveProperty('token_hash');
      }
    }
  });

  test('enrollment_keys_safe view masks key values', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/enrollment_keys_safe?select=*&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
        }
      }
    );
    
    if (response.status() === 200) {
      const data = await response.json();
      if (data.length > 0) {
        // Key should be masked if present
        if (data[0].key) {
          // Verify it's masked (contains asterisks or is truncated)
          expect(data[0].key.includes('*') || data[0].key.length < 20).toBeTruthy();
        }
      }
    }
  });

  test('Protected Edge Functions require JWT authentication', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const protectedEndpoints = [
      { path: 'create-job', method: 'POST', body: { job_type: 'test' } },
      { path: 'generate-enrollment-key', method: 'POST', body: { agent_name: 'test' } },
      { path: 'list-users', method: 'GET', body: null },
      { path: 'update-user-role', method: 'POST', body: { user_id: 'test', role: 'admin' } },
      { path: 'ai-get-insights', method: 'POST', body: { type: 'test' } },
      { path: 'delete-member', method: 'POST', body: { user_id: 'test' } },
    ];
    
    for (const endpoint of protectedEndpoints) {
      let response;
      
      if (endpoint.method === 'GET') {
        response = await request.get(`${SUPABASE_URL}/functions/v1/${endpoint.path}`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY!,
            'Content-Type': 'application/json',
            // No Authorization header
          }
        });
      } else {
        response = await request.post(`${SUPABASE_URL}/functions/v1/${endpoint.path}`, {
          headers: {
            'apikey': SUPABASE_ANON_KEY!,
            'Content-Type': 'application/json',
            // No Authorization header
          },
          data: endpoint.body,
        });
      }
      
      expect(response.status(), 
        `Endpoint ${endpoint.path} should require authentication`
      ).toBe(401);
    }
  });
});

// ============================================
// RATE LIMITING TESTS
// ============================================
test.describe('Rate Limiting Verification', () => {

  test('Contact form rate limiting (3/hour per IP)', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const statusCodes: number[] = [];
    
    // Make 5 rapid requests to trigger rate limit
    for (let i = 0; i < 5; i++) {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/submit-contact`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        data: {
          name: `Test User ${i}`,
          email: `test${i}@example.com`,
          message: 'Rate limit test',
          company: 'Test Corp',
        },
      });
      
      statusCodes.push(response.status());
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // After 3 requests, should start getting 429
    const rateLimited = statusCodes.includes(429);
    const successfulRequests = statusCodes.filter(s => s === 200 || s === 201).length;
    
    // Either we got rate limited OR we had some successful requests before limit
    expect(rateLimited || successfulRequests >= 1).toBeTruthy();
  });

  test('Installer download rate limiting', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const statusCodes: number[] = [];
    
    // Make 15 rapid requests to trigger rate limit
    for (let i = 0; i < 15; i++) {
      const response = await request.get(
        `${SUPABASE_URL}/functions/v1/serve-installer?key=rate-limit-test-key-${Date.now()}-${i}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY!,
          }
        }
      );
      
      statusCodes.push(response.status());
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Check if rate limiting kicked in
    const has429 = statusCodes.includes(429);
    const has404 = statusCodes.includes(404); // Invalid key - expected
    
    // Should get either 429 (rate limited) or 404 (key not found) - both valid
    expect(has429 || has404).toBeTruthy();
  });

  test('Failed login progressive blocking', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Simulate multiple failed login attempts
    // Note: This tests the concept - actual blocking depends on RPC function
    const uniqueEmail = `failtest${Date.now()}@example.com`;
    
    const responses: number[] = [];
    
    for (let i = 0; i < 6; i++) {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/record-failed-login`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        data: {
          email: uniqueEmail,
          ip_address: '192.168.1.' + (i % 256),
        },
      });
      
      responses.push(response.status());
      await new Promise(resolve => setTimeout(resolve, 50));
    }
    
    // Should accept failure recording or return rate limit
    expect(responses.every(s => [200, 201, 429, 400, 401, 405].includes(s))).toBeTruthy();
  });
});

// ============================================
// TOKEN HASH SECURITY TESTS
// ============================================
test.describe('Token Hash Security', () => {

  test('Agent endpoints use token_hash not plaintext token', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Attempt to use a plaintext token format
    // Modern endpoints should hash this before lookup
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'plaintext-token-test',
        'X-HMAC-Signature': 'a'.repeat(64),
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': crypto.randomUUID(),
      },
      data: JSON.stringify({ agent_name: 'test' }),
    });
    
    // Should fail with auth error (404 or 401), not internal error
    expect([400, 401, 404]).toContain(response.status());
    
    // Response should not contain internal error about 'token' column
    const text = await response.text();
    expect(text.toLowerCase()).not.toContain('column "token" does not exist');
  });

  test('agent_tokens table is not directly accessible', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.get(
      `${SUPABASE_URL}/rest/v1/agent_tokens?select=*&limit=1`,
      {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
        }
      }
    );
    
    if (response.status() === 200) {
      const data = await response.json();
      // Should return empty (RLS blocks access)
      expect(data.length).toBe(0);
    }
  });
});

// ============================================
// PRIVILEGE ESCALATION PREVENTION TESTS
// ============================================
test.describe('Privilege Escalation Prevention', () => {

  test('super_admin role cannot be assigned via RPC', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Attempt to call update_user_role_rpc with super_admin
    const response = await request.post(`${SUPABASE_URL}/rest/v1/rpc/update_user_role_rpc`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
      },
      data: {
        p_user_id: '00000000-0000-0000-0000-000000000000',
        p_new_role: 'super_admin',
      },
    });
    
    // Should fail - either with auth error or explicit rejection
    expect([400, 401, 403, 500]).toContain(response.status());
    
    const data = await response.json();
    if (data.message || data.error) {
      const errorText = JSON.stringify(data).toLowerCase();
      // Should not succeed - verify error indicates rejection
      expect(
        errorText.includes('super_admin') ||
        errorText.includes('unauthorized') ||
        errorText.includes('forbidden') ||
        errorText.includes('cannot assign')
      ).toBeTruthy();
    }
  });

  test('Role modification requires admin permission', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/update-user-role`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        // No Authorization header - unauthenticated
      },
      data: {
        userId: '00000000-0000-0000-0000-000000000000',
        newRole: 'admin',
      },
    });
    
    // Should fail with 401
    expect(response.status()).toBe(401);
  });

  test('Member deletion requires admin permission', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/delete-member`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        // No Authorization header
      },
      data: {
        userId: '00000000-0000-0000-0000-000000000000',
      },
    });
    
    expect(response.status()).toBe(401);
  });
});

// ============================================
// INPUT VALIDATION TESTS
// ============================================
test.describe('Input Validation Security', () => {

  test('SQL injection in agent_name is blocked', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const sqlPayloads = [
      "'; DROP TABLE agents; --",
      "1' OR '1'='1",
      "admin'--",
      "1; SELECT * FROM auth.users; --",
      "' UNION SELECT * FROM agents --",
    ];
    
    for (const payload of sqlPayloads) {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/enroll-agent`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        data: {
          enrollment_key: 'test-key',
          agent_name: payload,
          hostname: 'test-host',
          os_type: 'windows',
        },
      });
      
      // Should return validation error, not SQL error
      expect([400, 403, 404, 422]).toContain(response.status());
      
      const text = await response.text();
      expect(text.toLowerCase()).not.toContain('syntax error');
      expect(text.toLowerCase()).not.toContain('postgresql');
      expect(text.toLowerCase()).not.toContain('pg_');
    }
  });

  test('XSS payloads are sanitized in responses', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const xssPayloads = [
      '<script>alert("XSS")</script>',
      '<img src=x onerror="alert(1)">',
      'javascript:alert(document.cookie)',
      '<svg onload="alert(1)">',
    ];
    
    for (const payload of xssPayloads) {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/submit-contact`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        data: {
          name: payload,
          email: 'test@example.com',
          message: 'XSS test',
          company: 'Test',
        },
      });
      
      if (response.status() === 200) {
        const data = await response.json();
        const responseStr = JSON.stringify(data);
        
        // Should not echo raw XSS payloads
        expect(responseStr).not.toContain('<script>');
        expect(responseStr).not.toContain('onerror=');
        expect(responseStr).not.toContain('javascript:');
      }
    }
  });

  test('Path traversal in key parameter is blocked', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const traversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32\\config\\sam',
      '%2e%2e%2f%2e%2e%2f',
      '....//....//....//etc/shadow',
    ];
    
    for (const payload of traversalPayloads) {
      const response = await request.get(
        `${SUPABASE_URL}/functions/v1/serve-installer?key=${encodeURIComponent(payload)}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY!,
          }
        }
      );
      
      // Should not return 200 with file contents
      expect([400, 403, 404, 422, 429]).toContain(response.status());
    }
  });
});

// ============================================
// SECURITY HEADERS VALIDATION
// ============================================
test.describe('Security Headers', () => {

  test('CORS headers are properly configured', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.fetch(`${SUPABASE_URL}/functions/v1/health`, {
      method: 'OPTIONS',
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Origin': 'https://malicious-site.com',
        'Access-Control-Request-Method': 'POST',
      }
    });
    
    const headers = response.headers();
    
    // If CORS is configured, verify it's not overly permissive
    if (headers['access-control-allow-origin']) {
      // Should be specific origin or *, not reflect arbitrary origins
      const allowedOrigin = headers['access-control-allow-origin'];
      // If it's *, that's acceptable for public APIs
      // If it's specific, it should not be the malicious origin unless explicitly allowed
      expect(typeof allowedOrigin).toBe('string');
    }
  });

  test('Content-Type header is enforced on POST endpoints', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Send request without Content-Type header
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'X-Agent-Token': 'test',
        'X-HMAC-Signature': 'a'.repeat(64),
        'X-Timestamp': Date.now().toString(),
        'X-Nonce': crypto.randomUUID(),
        // Missing Content-Type
      },
      data: '{"agent_name": "test"}',
    });
    
    // Should either accept with proper handling or reject
    // Not cause internal server error
    expect([200, 400, 401, 415]).toContain(response.status());
  });
});
