import { test, expect } from '@playwright/test';
import crypto from 'crypto';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iavbnmduxpxhwubqrzzn.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk';

// Helper para gerar HMAC
function generateHmac(secret: string, body: string, timestamp: string, nonce: string): string {
  const payload = `${timestamp}:${nonce}:${body}`;
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

test.describe('Agent Flow E2E', () => {
  let authToken: string;
  let enrollmentKey: string;
  let agentToken: string;
  let hmacSecret: string;
  let agentName: string;
  let jobId: string;

  test.beforeAll(async () => {
    agentName = `test-agent-${Date.now()}`;
  });

  test('1. Admin login e gerar enrollment key', async ({ request }) => {
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

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    authToken = loginData.access_token;
    expect(authToken).toBeTruthy();

    // Gerar enrollment key
    const enrollResponse = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: agentName,
      },
    });

    expect(enrollResponse.ok()).toBeTruthy();
    const enrollData = await enrollResponse.json();
    enrollmentKey = enrollData.enrollmentKey;
    expect(enrollmentKey).toBeTruthy();
    expect(enrollmentKey).toMatch(/^ENROLL-[A-Z0-9]+-[A-Z0-9]+$/);
  });

  test('2. Agent enrollment', async ({ request }) => {
    const enrollResponse = await request.post(`${SUPABASE_URL}/functions/v1/enroll-agent`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        enrollmentKey: enrollmentKey,
        agentName: agentName,
        systemInfo: {
          os: 'Windows 10',
          hostname: 'test-machine',
          version: '1.0.0',
        },
      },
    });

    expect(enrollResponse.ok()).toBeTruthy();
    const enrollData = await enrollResponse.json();
    agentToken = enrollData.agentToken;
    hmacSecret = enrollData.hmacSecret;
    
    expect(agentToken).toBeTruthy();
    expect(hmacSecret).toBeTruthy();
    expect(enrollData.expiresAt).toBeTruthy();
  });

  test('3. Agent heartbeat', async ({ request }) => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = JSON.stringify({ status: 'active' });
    const hmacSignature = generateHmac(hmacSecret, body, timestamp, nonce);

    const heartbeatResponse = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': hmacSignature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
      data: JSON.parse(body),
    });

    expect(heartbeatResponse.ok()).toBeTruthy();
    const heartbeatData = await heartbeatResponse.json();
    expect(heartbeatData.success).toBe(true);
  });

  test('4. Admin criar job para o agent', async ({ request }) => {
    const createJobResponse = await request.post(`${SUPABASE_URL}/functions/v1/create-job`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: agentName,
        type: 'collect_info',
        payload: {
          info_type: 'system',
        },
      },
    });

    expect(createJobResponse.ok()).toBeTruthy();
    const jobData = await createJobResponse.json();
    jobId = jobData.jobId;
    expect(jobId).toBeTruthy();
  });

  test('5. Agent poll-jobs (buscar jobs pendentes)', async ({ request }) => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = '';
    const hmacSignature = generateHmac(hmacSecret, body, timestamp, nonce);

    const pollResponse = await request.get(`${SUPABASE_URL}/functions/v1/poll-jobs`, {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': hmacSignature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
    });

    expect(pollResponse.ok()).toBeTruthy();
    const jobs = await pollResponse.json();
    expect(Array.isArray(jobs)).toBe(true);
    expect(jobs.length).toBeGreaterThan(0);
    
    const job = jobs.find((j: any) => j.id === jobId);
    expect(job).toBeTruthy();
    expect(job.type).toBe('collect_info');
    expect(job.approved).toBe(true);
  });

  test('6. Agent acknowledge job (ack-job)', async ({ request }) => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = '';
    const hmacSignature = generateHmac(hmacSecret, body, timestamp, nonce);

    const ackResponse = await request.post(`${SUPABASE_URL}/functions/v1/ack-job/${jobId}`, {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': hmacSignature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
    });

    expect(ackResponse.ok()).toBeTruthy();
    const ackData = await ackResponse.json();
    expect(ackData.success).toBe(true);
    expect(ackData.message).toContain('Job acknowledged');
  });

  test('7. Admin verificar job concluído', async ({ request }) => {
    const listJobsResponse = await request.post(`${SUPABASE_URL}/functions/v1/list-jobs`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: agentName,
      },
    });

    expect(listJobsResponse.ok()).toBeTruthy();
    const jobs = await listJobsResponse.json();
    const completedJob = jobs.find((j: any) => j.id === jobId);
    
    expect(completedJob).toBeTruthy();
    expect(completedJob.status).toBe('done');
    expect(completedJob.completed_at).toBeTruthy();
  });

  test('8. Rate limiting validation', async ({ request }) => {
    // Tentar fazer múltiplos heartbeats rapidamente
    const promises = [];
    for (let i = 0; i < 5; i++) {
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      const body = JSON.stringify({ status: 'active' });
      const hmacSignature = generateHmac(hmacSecret, body, timestamp, nonce);

      promises.push(
        request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
          headers: {
            'X-Agent-Token': agentToken,
            'X-HMAC-Signature': hmacSignature,
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
            'Content-Type': 'application/json',
          },
          data: JSON.parse(body),
        })
      );
    }

    const responses = await Promise.all(promises);
    
    // Pelo menos uma deve retornar 429 (rate limit exceeded)
    const rateLimitedResponses = responses.filter(r => r.status() === 429);
    expect(rateLimitedResponses.length).toBeGreaterThan(0);
  });

  test('9. Invalid token validation', async ({ request }) => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = JSON.stringify({ status: 'active' });
    const hmacSignature = generateHmac(hmacSecret, body, timestamp, nonce);

    const heartbeatResponse = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'X-Agent-Token': 'invalid-token-12345',
        'X-HMAC-Signature': hmacSignature,
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
      data: JSON.parse(body),
    });

    expect(heartbeatResponse.status()).toBe(401);
  });

  test('10. Invalid HMAC validation', async ({ request }) => {
    const timestamp = Date.now().toString();
    const nonce = crypto.randomUUID();
    const body = JSON.stringify({ status: 'active' });

    const heartbeatResponse = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'X-Agent-Token': agentToken,
        'X-HMAC-Signature': 'invalid-hmac-signature',
        'X-Timestamp': timestamp,
        'X-Nonce': nonce,
        'Content-Type': 'application/json',
      },
      data: JSON.parse(body),
    });

    expect(heartbeatResponse.status()).toBe(401);
  });
});
