import { test, expect } from '@playwright/test';
import { hasRequiredEnvVars } from './helpers/backend-client';
import { signHmac } from './helpers/hmac-signer';
import { TEST_CONFIG } from './test-config';

/**
 * FASE 2: Teste E2E Completo do Fluxo de Agentes
 * 
 * Valida: Signup → Login → Gerar Enrollment → Download Installer → 
 *         Simular Instalacao → Heartbeat → Metricas → Jobs
 * 
 * IMPORTANTE: Todos os testes usam HMAC real (não mock).
 */

test.describe.serial('Complete Agent Lifecycle Flow', () => {
  const baseUrl = process.env.VITE_SUPABASE_URL!;
  const testEmail = `test-agent-${Date.now()}@test.local`;
  const testPassword = TEST_CONFIG.credentials.password;
  let authToken: string;
  let enrollmentKey: string;
  let agentToken: string;
  let hmacSecret: string;
  let agentName: string;

  test('1. Signup and Login', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    // Signup
    const signupResponse = await request.post(`${baseUrl}/auth/v1/signup`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      },
      data: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(signupResponse.ok()).toBeTruthy();

    // Login
    const loginResponse = await request.post(`${baseUrl}/auth/v1/token?grant_type=password`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      },
      data: {
        email: testEmail,
        password: testPassword,
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    authToken = loginData.access_token;
    expect(authToken).toBeTruthy();
  });

  test('2. Generate Enrollment Key and Credentials', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    agentName = `test-agent-${Date.now()}`;

    const response = await request.post(`${baseUrl}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentName,
        os_type: 'windows',
      },
    });

    expect(response.ok()).toBeTruthy();
    const data = await response.json();
    
    expect(data.enrollmentKey).toBeTruthy();
    expect(data.agentToken).toBeTruthy();
    expect(data.hmacSecret).toBeTruthy();

    enrollmentKey = data.enrollmentKey;
    agentToken = data.agentToken;
    hmacSecret = data.hmacSecret;
  });

  test('3. Download Installer via serve-installer', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    const response = await request.get(`${baseUrl}/functions/v1/serve-installer/${enrollmentKey}`);

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/plain');

    const installerScript = await response.text();
    expect(installerScript).toContain('CyberShield Agent');
    expect(installerScript).toContain(agentToken.substring(0, 10));
    expect(installerScript).not.toContain('{{AGENT_TOKEN}}');
    expect(installerScript).not.toContain('{{HMAC_SECRET}}');
  });

  test('4. Simulate Agent Heartbeat', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    // Aguardar 2s para simular instalacao
    await new Promise(resolve => setTimeout(resolve, 2000));

    const bodyJson = JSON.stringify({
      os_type: 'windows',
      os_version: 'Windows Server 2022',
      hostname: 'TEST-SERVER',
    });

    // Gerar HMAC signature REAL
    const { signature, timestamp, nonce } = signHmac(hmacSecret, bodyJson);

    const response = await request.post(`${baseUrl}/functions/v1/heartbeat`, {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
      data: bodyJson,
    });

    // Com HMAC real, esperamos sucesso
    expect(response.status()).toBe(200);
  });

  test('5. Submit System Metrics', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    const bodyJson = JSON.stringify({
      cpu_usage_percent: 45.5,
      cpu_cores: 8,
      memory_total_gb: 16,
      memory_used_gb: 10.2,
      memory_free_gb: 5.8,
      memory_usage_percent: 63.75,
      disk_total_gb: 500,
      disk_used_gb: 250,
      disk_free_gb: 250,
      disk_usage_percent: 50,
      uptime_seconds: 3600,
      last_boot_time: new Date(Date.now() - 3600000).toISOString(),
    });

    // Gerar HMAC signature REAL
    const { signature, timestamp, nonce } = signHmac(hmacSecret, bodyJson);

    const response = await request.post(`${baseUrl}/functions/v1/submit-system-metrics`, {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
      data: bodyJson,
    });

    expect(response.status()).toBe(200);
  });

  test('6. Create and Poll Job', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    // Criar job
    const createJobResponse = await request.post(`${baseUrl}/functions/v1/create-job`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agent_name: agentName,
        type: 'collect_info',
        payload: {},
      },
    });

    expect(createJobResponse.ok()).toBeTruthy();
    const jobData = await createJobResponse.json();
    expect(jobData.job_id).toBeTruthy();

    // Poll jobs
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Gerar HMAC signature REAL (poll-jobs usa GET, body vazio)
    const { signature, timestamp, nonce } = signHmac(hmacSecret, '');

    const pollResponse = await request.get(`${baseUrl}/functions/v1/poll-jobs`, {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
    });

    expect(pollResponse.status()).toBe(200);
  });

  test('7. Acknowledge Job', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    // Criar job para testar ACK
    const createJobResponse = await request.post(`${baseUrl}/functions/v1/create-job`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agent_name: agentName,
        type: 'collect_info',
        payload: {},
      },
    });

    const jobData = await createJobResponse.json();
    const jobId = jobData.job_id;

    // ACK job com HMAC REAL
    const bodyJson = '{}';
    const { signature, timestamp, nonce } = signHmac(hmacSecret, bodyJson);

    const ackResponse = await request.post(`${baseUrl}/functions/v1/ack-job/${jobId}`, {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': signature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
      data: bodyJson,
    });

    expect(ackResponse.status()).toBe(200);
  });
});
