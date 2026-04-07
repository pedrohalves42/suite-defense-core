import { test, expect } from '@playwright/test';

/**
 * Phase 1 - Process Control E2E Tests
 * 
 * These tests validate that the execute-playbook-action Edge Function
 * correctly creates jobs for process control actions and rejects
 * protected processes/services.
 */

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://iavbnmduxpxhwubqrzzn.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk';

test.describe('Phase 1 — Process Control E2E', () => {
  let accessToken: string;
  let testAgentId: string;
  let testTenantId: string;

  test.beforeAll(async ({ request }) => {
    // Login as admin to get access token
    const loginRes = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        email: process.env.TEST_ADMIN_EMAIL || 'admin@cybershield.test',
        password: process.env.TEST_ADMIN_PASSWORD || 'testpassword123',
      },
    });

    if (loginRes.ok()) {
      const loginData = await loginRes.json();
      accessToken = loginData.access_token;
    }

    // Get a test agent for job creation
    if (accessToken) {
      const agentsRes = await request.get(`${SUPABASE_URL}/rest/v1/agents?limit=1&status=eq.active`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'apikey': SUPABASE_ANON_KEY,
        },
      });

      if (agentsRes.ok()) {
        const agents = await agentsRes.json();
        if (agents.length > 0) {
          testAgentId = agents[0].id;
          testTenantId = agents[0].tenant_id;
        }
      }
    }
  });

  test.describe('Job Creation via execute-playbook-action', () => {
    test.skip(!process.env.TEST_ADMIN_EMAIL, 'Requires TEST_ADMIN_EMAIL environment variable');

    test('should create kill_process job for non-protected process', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'kill_process',
          action_payload: {
            agent_id: testAgentId,
            process_name: 'notepad',
          },
        },
      });

      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.job_id).toBeDefined();
      expect(body.success).toBe(true);
    });

    test('should reject kill_process for protected process (lsass)', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'kill_process',
          action_payload: {
            agent_id: testAgentId,
            process_name: 'lsass',
          },
        },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('protected');
    });

    test('should reject kill_process for protected process (csrss)', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'kill_process',
          action_payload: {
            agent_id: testAgentId,
            process_name: 'csrss',
          },
        },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('protected');
    });

    test('should create stop_service job for non-protected service', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'stop_service',
          action_payload: {
            agent_id: testAgentId,
            service_name: 'Spooler',
          },
        },
      });

      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.job_id).toBeDefined();
    });

    test('should reject stop_service for protected service (WinDefend)', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'stop_service',
          action_payload: {
            agent_id: testAgentId,
            service_name: 'WinDefend',
          },
        },
      });

      expect(res.status()).toBe(400);
      const body = await res.json();
      expect(body.error).toContain('protected');
    });

    test('should create disable_service job for non-protected service', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'disable_service',
          action_payload: {
            agent_id: testAgentId,
            service_name: 'Spooler',
          },
        },
      });

      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.job_id).toBeDefined();
    });

    test('should create restart_service job for non-protected service', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'restart_service',
          action_payload: {
            agent_id: testAgentId,
            service_name: 'Spooler',
          },
        },
      });

      expect(res.ok()).toBeTruthy();
      const body = await res.json();
      expect(body.job_id).toBeDefined();
    });
  });

  test.describe('Protected Targets Validation', () => {
    // Windows protected processes
    const windowsProtectedProcesses = [
      'lsass', 'csrss', 'smss', 'wininit', 'winlogon',
      'services', 'svchost', 'System', 'dwm', 'explorer',
    ];

    // Windows protected services  
    const windowsProtectedServices = [
      'WinDefend', 'EventLog', 'RpcSs', 'SamSs', 'LanmanServer',
    ];

    for (const process of windowsProtectedProcesses.slice(0, 3)) {
      test(`should reject kill_process for Windows protected: ${process}`, async ({ request }) => {
        test.skip(!testAgentId, 'No test agent available');

        const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          data: {
            action_type: 'kill_process',
            action_payload: {
              agent_id: testAgentId,
              process_name: process,
            },
          },
        });

        expect(res.status()).toBe(400);
      });
    }

    for (const service of windowsProtectedServices.slice(0, 3)) {
      test(`should reject stop_service for Windows protected: ${service}`, async ({ request }) => {
        test.skip(!testAgentId, 'No test agent available');

        const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          data: {
            action_type: 'stop_service',
            action_payload: {
              agent_id: testAgentId,
              service_name: service,
            },
          },
        });

        expect(res.status()).toBe(400);
      });
    }
  });

  test.describe('Input Validation', () => {
    test('should reject kill_process without process_name', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'kill_process',
          action_payload: {
            agent_id: testAgentId,
          },
        },
      });

      expect(res.status()).toBe(400);
    });

    test('should reject stop_service without service_name', async ({ request }) => {
      test.skip(!testAgentId, 'No test agent available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'stop_service',
          action_payload: {
            agent_id: testAgentId,
          },
        },
      });

      expect(res.status()).toBe(400);
    });

    test('should reject action without agent_id', async ({ request }) => {
      test.skip(!accessToken, 'No access token available');

      const res = await request.post(`${SUPABASE_URL}/functions/v1/execute-playbook-action`, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        data: {
          action_type: 'kill_process',
          action_payload: {
            process_name: 'notepad',
          },
        },
      });

      expect(res.status()).toBe(400);
    });
  });
});
