import { test, expect } from '@playwright/test';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iavbnmduxpxhwubqrzzn.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk';

test.describe('Input Validation Security Tests', () => {
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    // Login como admin
    const loginResponse = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        email: process.env.TEST_ADMIN_EMAIL || 'pedrohalves42@gmail.com',
        password: process.env.TEST_ADMIN_PASSWORD || 'Test1234!',
      },
    });

    const loginData = await loginResponse.json();
    authToken = loginData.access_token;
  });

  test.describe('Agent Name Validation', () => {
    test('1. Reject SQL injection attempts', async ({ request }) => {
      const maliciousNames = [
        "'; DROP TABLE agents; --",
        "admin' OR '1'='1",
        "test'; DELETE FROM agents WHERE '1'='1",
        "agent UNION SELECT * FROM users",
        "test\"; DROP TABLE agents; --",
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

        expect(response.status()).toBe(400);
        const data = await response.json();
        expect(data.error).toBeTruthy();
        console.log(`✓ Blocked SQL injection: ${maliciousName.substring(0, 30)}...`);
      }
    });

    test('2. Reject path traversal attempts', async ({ request }) => {
      const maliciousNames = [
        '../../../etc/passwd',
        '..\\..\\windows\\system32',
        '../../agent',
        '../admin/config',
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

        expect(response.status()).toBe(400);
        console.log(`✓ Blocked path traversal: ${maliciousName}`);
      }
    });

    test('3. Reject control characters', async ({ request }) => {
      const maliciousNames = [
        'agent\x00name',
        'test\x1Bname',
        'agent\r\nname',
        'test\tname',
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

        expect(response.status()).toBe(400);
        console.log(`✓ Blocked control characters`);
      }
    });

    test('4. Reject reserved names', async ({ request }) => {
      const reservedNames = ['admin', 'root', 'system', 'null', 'undefined'];

      for (const reservedName of reservedNames) {
        const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: { agentName: reservedName },
        });

        expect(response.status()).toBe(400);
        const data = await response.json();
        expect(data.error).toContain('reservado');
        console.log(`✓ Blocked reserved name: ${reservedName}`);
      }
    });

    test('5. Reject excessive repetition', async ({ request }) => {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: 'aaaaaaaaa' }, // 9 'a's consecutivos
      });

      expect(response.status()).toBe(400);
      const data = await response.json();
      expect(data.error).toContain('repetidos');
      console.log(`✓ Blocked excessive repetition`);
    });

    test('6. Reject names too short or too long', async ({ request }) => {
      const invalidLengths = [
        'ab', // Too short (< 3)
        'a'.repeat(65), // Too long (> 64)
      ];

      for (const name of invalidLengths) {
        const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: { agentName: name },
        });

        expect(response.status()).toBe(400);
        console.log(`✓ Blocked invalid length: ${name.length} chars`);
      }
    });

    test('7. Reject invalid start/end characters', async ({ request }) => {
      const invalidNames = [
        '-agent', // Starts with hyphen
        'agent-', // Ends with hyphen
        '_agent', // Starts with underscore
        'agent_', // Ends with underscore
      ];

      for (const name of invalidNames) {
        const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: { agentName: name },
        });

        expect(response.status()).toBe(400);
        console.log(`✓ Blocked invalid start/end: ${name}`);
      }
    });

    test('8. Accept valid agent names', async ({ request }) => {
      const validNames = [
        'agent-01',
        'my_agent',
        'server-prod-001',
        'test_agent_123',
        'AgentName',
        'agent123',
      ];

      for (const name of validNames) {
        const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: { agentName: name },
        });

        expect(response.ok()).toBeTruthy();
        const data = await response.json();
        expect(data.enrollmentKey).toBeTruthy();
        expect(data.agentToken).toBeTruthy();
        console.log(`✓ Accepted valid name: ${name}`);
      }
    });

    test('9. Reject comment characters', async ({ request }) => {
      const maliciousNames = [
        'agent--comment',
        'agent/*comment*/',
        'test//comment',
        'agent#comment',
      ];

      for (const name of maliciousNames) {
        const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: { agentName: name },
        });

        expect(response.status()).toBe(400);
        console.log(`✓ Blocked comment characters: ${name}`);
      }
    });

    test('10. Reject XSS attempts', async ({ request }) => {
      const xssAttempts = [
        '<script>alert(1)</script>',
        '"><script>alert(1)</script>',
        "javascript:alert('XSS')",
        '<img src=x onerror=alert(1)>',
      ];

      for (const xss of xssAttempts) {
        const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
          headers: {
            'Authorization': `Bearer ${authToken}`,
            'apikey': SUPABASE_ANON_KEY,
            'Content-Type': 'application/json',
          },
          data: { agentName: xss },
        });

        expect(response.status()).toBe(400);
        console.log(`✓ Blocked XSS attempt`);
      }
    });
  });

  test.describe('Edge Cases', () => {
    test('1. Reject empty string', async ({ request }) => {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: '' },
      });

      expect(response.status()).toBe(400);
    });

    test('2. Reject whitespace only', async ({ request }) => {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: '   ' },
      });

      expect(response.status()).toBe(400);
    });

    test('3. Trim whitespace from valid names', async ({ request }) => {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: '  valid-agent  ' },
      });

      expect(response.ok()).toBeTruthy();
      const data = await response.json();
      expect(data.enrollmentKey).toBeTruthy();
    });

    test('4. Reject missing agentName field', async ({ request }) => {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: {},
      });

      expect(response.status()).toBe(400);
    });

    test('5. Reject null agentName', async ({ request }) => {
      const response = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
        headers: {
          'Authorization': `Bearer ${authToken}`,
          'apikey': SUPABASE_ANON_KEY,
          'Content-Type': 'application/json',
        },
        data: { agentName: null },
      });

      expect(response.status()).toBe(400);
    });
  });
});
