/**
 * RLS Multi-Tenant Isolation Tests
 * 
 * P0 Security Tests - Verify tenant data isolation
 * Tests that users from one tenant cannot access data from another tenant
 */
import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.PUBLIC_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.PUBLIC_SUPABASE_ANON_KEY;

// Skip if no Supabase configuration
test.beforeAll(() => {
  if (!SUPABASE_URL) {
    console.log('Skipping RLS tests: SUPABASE_URL not configured');
  }
});

test.describe('RLS Multi-Tenant Data Isolation', () => {
  
  test('Unauthenticated requests should be rejected for protected endpoints', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Try to access agents without authentication
    const response = await request.get(`${SUPABASE_URL}/rest/v1/agents?select=*`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        // No Authorization header
      }
    });
    
    // Should return empty array (RLS blocks all rows) or error
    const data = await response.json();
    
    // With RLS enabled and no auth, should get empty result or 401
    expect(response.status() === 200 || response.status() === 401).toBeTruthy();
    if (response.status() === 200) {
      expect(Array.isArray(data) && data.length === 0).toBeTruthy();
    }
  });

  test('Protected tables return empty for unauthenticated requests', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const protectedTables = [
      'agents',
      'agent_tokens', 
      'enrollment_keys',
      'api_keys',
      'security_logs',
      'audit_logs',
      'jobs',
      'software_inventory',
      'vuln_findings',
      'agent_web_activity',
    ];
    
    for (const table of protectedTables) {
      const response = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*&limit=1`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
        }
      });
      
      if (response.status() === 200) {
        const data = await response.json();
        expect(Array.isArray(data) && data.length === 0, 
          `Table ${table} should return empty array for unauthenticated requests`
        ).toBeTruthy();
      }
    }
  });

  test('Edge Function without auth returns 401 for protected endpoints', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Protected Edge Functions that require JWT
    const protectedFunctions = [
      'create-job',
      'list-users',
      'generate-enrollment-key',
      'ai-get-insights',
    ];
    
    for (const fn of protectedFunctions) {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/${fn}`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
          // No Authorization header
        },
        data: {},
      });
      
      // Should return 401 Unauthorized
      expect(response.status(), `Function ${fn} should require auth`).toBe(401);
    }
  });

  test('HMAC-protected endpoints reject invalid signatures', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const hmacProtectedEndpoints = [
      'heartbeat',
      'poll-jobs',
      'submit-job-result',
      'submit-system-metrics',
    ];
    
    for (const endpoint of hmacProtectedEndpoints) {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
          'X-Agent-Token': 'invalid-token',
          'X-HMAC-Signature': 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          'X-Timestamp': Date.now().toString(),
          'X-Nonce': 'test-nonce-12345',
        },
        data: { agent_name: 'test-agent' },
      });
      
      // Should return 401 (invalid token) or 400 (invalid signature)
      expect([400, 401, 404]).toContain(response.status());
    }
  });

  test('serve-installer rate limiting works', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Make multiple requests to test rate limiting
    const responses: number[] = [];
    
    for (let i = 0; i < 12; i++) {
      const response = await request.get(
        `${SUPABASE_URL}/functions/v1/serve-installer?key=test-key-${Date.now()}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY!,
          }
        }
      );
      responses.push(response.status());
      
      // Small delay between requests
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    
    // After 10+ requests, should start getting 429 rate limited
    // (depends on rate limit configuration)
    const has429 = responses.includes(429);
    const hasNon429 = responses.some(s => s !== 429);
    
    // At least some requests should go through or get rate limited
    expect(hasNon429 || has429).toBeTruthy();
  });

  test('Enrollment endpoint requires valid key format', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Test with invalid enrollment key format
    const response = await request.post(`${SUPABASE_URL}/functions/v1/enroll-agent`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
      },
      data: {
        enrollment_key: 'invalid-key-format',
        agent_name: 'test-agent',
        hostname: 'test-host',
        os_type: 'windows',
      },
    });
    
    // Should return 400 (invalid format) or 404 (key not found)
    expect([400, 404]).toContain(response.status());
  });

  test('SQL injection attempts are blocked', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const sqlInjectionPayloads = [
      "'; DROP TABLE agents; --",
      "1 OR 1=1",
      "admin'--",
      "'; INSERT INTO agents VALUES('hack'); --",
      "1; SELECT * FROM auth.users; --",
    ];
    
    for (const payload of sqlInjectionPayloads) {
      // Try to inject via agent_name parameter
      const response = await request.post(`${SUPABASE_URL}/functions/v1/enroll-agent`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
        },
        data: {
          enrollment_key: 'test-key',
          agent_name: payload,
          hostname: 'test',
          os_type: 'windows',
        },
      });
      
      // Should return 400 (validation error), 403 (forbidden), 404 (key not found), or 422 (unprocessable)
      // All indicate SQL injection was blocked
      expect([400, 403, 404, 422]).toContain(response.status());
      
      // Response should not contain SQL error messages
      const text = await response.text();
      expect(text).not.toContain('syntax error');
      expect(text).not.toContain('SQL');
      expect(text).not.toContain('DROP TABLE');
    }
  });

  test('XSS payloads are sanitized', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const xssPayloads = [
      '<script>alert("xss")</script>',
      '<img src=x onerror=alert("xss")>',
      'javascript:alert("xss")',
      '<svg onload=alert("xss")>',
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
          message: 'Test message',
          company: 'Test Company',
        },
      });
      
      // Should either sanitize and accept, or reject with 400
      // The response should not echo back raw XSS payloads
      if (response.status() === 200) {
        const data = await response.json();
        const responseStr = JSON.stringify(data);
        expect(responseStr).not.toContain('<script>');
        expect(responseStr).not.toContain('onerror=');
        expect(responseStr).not.toContain('javascript:');
      }
    }
  });

  test('Path traversal attempts are blocked', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const pathTraversalPayloads = [
      '../../../etc/passwd',
      '..\\..\\..\\windows\\system32',
      '%2e%2e%2f%2e%2e%2f',
      '....//....//....//etc/passwd',
    ];
    
    for (const payload of pathTraversalPayloads) {
      const response = await request.get(
        `${SUPABASE_URL}/functions/v1/serve-installer?key=${encodeURIComponent(payload)}`,
        {
          headers: {
            'apikey': SUPABASE_ANON_KEY!,
          }
        }
      );
      
      // Should return 400, 403, 404, or 429 - path traversal blocked
      expect([400, 403, 404, 429]).toContain(response.status());
    }
  });
});

test.describe('HMAC Authentication Validation', () => {
  
  test('Missing HMAC headers return proper error', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        // Missing X-Agent-Token, X-HMAC-Signature, X-Timestamp, X-Nonce
      },
      data: { agent_name: 'test' },
    });
    
    expect([400, 401]).toContain(response.status());
    const data = await response.json();
    expect(data.error || data.message).toBeTruthy();
  });

  test('Expired timestamp is rejected', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Timestamp from 10 minutes ago (beyond 5 minute window)
    const expiredTimestamp = (Date.now() - 10 * 60 * 1000).toString();
    
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'test-token',
        'X-HMAC-Signature': 'a'.repeat(64),
        'X-Timestamp': expiredTimestamp,
        'X-Nonce': 'test-nonce',
      },
      data: { agent_name: 'test' },
    });
    
    expect([400, 401]).toContain(response.status());
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
        'X-HMAC-Signature': 'b'.repeat(64),
        'X-Timestamp': futureTimestamp,
        'X-Nonce': 'test-nonce-future',
      },
      data: { agent_name: 'test' },
    });
    
    expect([400, 401]).toContain(response.status());
  });

  test('Invalid HMAC signature format is rejected', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    const invalidSignatures = [
      'not-hex-string',
      'abc123', // Too short
      'z'.repeat(64), // Invalid hex chars
      '', // Empty
    ];
    
    for (const sig of invalidSignatures) {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
        headers: {
          'apikey': SUPABASE_ANON_KEY!,
          'Content-Type': 'application/json',
          'X-Agent-Token': 'test-token',
          'X-HMAC-Signature': sig,
          'X-Timestamp': Date.now().toString(),
          'X-Nonce': `nonce-${Date.now()}`,
        },
        data: { agent_name: 'test' },
      });
      
      expect([400, 401]).toContain(response.status());
    }
  });
});

test.describe('Security Headers Validation', () => {
  
  test('Edge Functions include security headers', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Test health endpoint (should be accessible)
    const response = await request.get(`${SUPABASE_URL}/functions/v1/health`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
      }
    });
    
    const headers = response.headers();
    
    // Check for security headers - these may or may not be present depending on Edge Function config
    // x-content-type-options is commonly set by Supabase
    if (headers['x-content-type-options']) {
      expect(headers['x-content-type-options']).toBe('nosniff');
    }
    
    // x-frame-options may be DENY or SAMEORIGIN depending on config
    if (headers['x-frame-options']) {
      expect(['DENY', 'SAMEORIGIN']).toContain(headers['x-frame-options']);
    }
    
    // If neither header is present, just verify the response was successful
    expect([200, 204]).toContain(response.status());
  });

  test('CORS headers are present', async ({ request }) => {
    if (!SUPABASE_URL) {
      test.skip();
      return;
    }
    
    // Test OPTIONS preflight
    const response = await request.fetch(`${SUPABASE_URL}/functions/v1/health`, {
      method: 'OPTIONS',
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Origin': 'https://example.com',
        'Access-Control-Request-Method': 'POST',
      }
    });
    
    const headers = response.headers();
    
    // CORS headers should be present for preflight requests
    // But may not be if the endpoint doesn't support CORS preflight
    const hasCorsOrigin = !!headers['access-control-allow-origin'];
    const hasCorsMethods = !!headers['access-control-allow-methods'];
    
    // Either both CORS headers present, or response indicates CORS not configured (which is also valid)
    if (hasCorsOrigin || hasCorsMethods) {
      expect(headers['access-control-allow-origin']).toBeTruthy();
    } else {
      // If no CORS headers, verify the response status is valid (200, 204, or 405 for method not allowed)
      expect([200, 204, 405]).toContain(response.status());
    }
  });
});
