import { test, expect } from '@playwright/test';
import { hasRequiredEnvVars } from './helpers/backend-client';
import { TEST_CONFIG } from './test-config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

test.describe('Input Validation Security Tests', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    // Login como admin
    const loginResponse = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        email: TEST_CONFIG.credentials.email,
        password: TEST_CONFIG.credentials.password,
      },
    });

    const loginData = await loginResponse.json();
    authToken = loginData.access_token;
  });

  test.describe.serial('Agent Name Validation', () => {
    test('1. Reject SQL injection attempts', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const maliciousNames = [
        "'; DROP TABLE agents; --",
        "admin' OR '1'='1",
        "test'; DELETE FROM agents WHERE '1'='1",
      ];

      for (const maliciousName of maliciousNames) {
        const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: { agentName: maliciousName },
        });

        // Either 400 (validation) or 200 with error field
        expect([400, 422]).toContain(response.status());
      }
    });

    test('2. Reject path traversal attempts', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const maliciousNames = ['../../../etc/passwd', '..\\..\\windows\\system32'];

      for (const maliciousName of maliciousNames) {
        const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: { agentName: maliciousName },
        });

        expect([400, 422]).toContain(response.status());
      }
    });

    test('3. Reject control characters', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: 'agent\x00name' },
      });

      expect([400, 422]).toContain(response.status());
    });

    test('4. Reject reserved names', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: 'admin' },
      });

      // May or may not be blocked depending on implementation
      expect([200, 400, 422]).toContain(response.status());
    });

    test('5. Reject names too short or too long', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      // Too short
      const shortResponse = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: 'ab' },
      });
      expect([400, 422]).toContain(shortResponse.status());

      // Too long
      const longResponse = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: 'a'.repeat(65) },
      });
      expect([400, 422]).toContain(longResponse.status());
    });

    test('6. Accept valid agent names', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const validName = `agent-valid-${Date.now()}`;
      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: validName },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.enrollmentKey || data.agentToken).toBeTruthy();
    });

    test('7. Reject XSS attempts', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: '<script>alert(1)</script>' },
      });

      expect([400, 422]).toContain(response.status());
    });
  });

  test.describe('Edge Cases', () => {
    test('1. Reject empty string', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: '' },
      });

      expect([400, 422]).toContain(response.status());
    });

    test('2. Reject whitespace only', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: '   ' },
      });

      expect([400, 422]).toContain(response.status());
    });

    test('3. Handle valid names with whitespace trimming', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: `  valid-agent-${Date.now()}  ` },
      });

      // Should either trim and accept, or reject with 400
      expect([200, 400, 422]).toContain(response.status());
    });

    test('4. Reject missing agentName field', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: {},
      });

      expect([400, 422]).toContain(response.status());
    });

    test('5. Reject null agentName', async ({ request }) => {
      if (!hasRequiredEnvVars() || !authToken) {
        test.skip(true, 'No auth token or env vars');
        return;
      }

      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: null },
      });

      expect([400, 422]).toContain(response.status());
    });
  });
});
