import { test, expect } from '@playwright/test';
import crypto from 'crypto';

/**
 * E2E Test: Complete Enrollment Flow
 * P1 QUAL-02: Validates entire enrollment → job flow end-to-end
 * 
 * Tests the complete lifecycle:
 * 1. User signup/login
 * 2. Generate enrollment key
 * 3. Agent enrollment
 * 4. First heartbeat
 * 5. Metrics submission
 * 6. Job creation and polling
 * 7. Job result submission
 */

const BASE_URL = process.env.VITE_SUPABASE_URL!;
const ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

// Test user credentials - use unique email per run
const TEST_EMAIL = `e2e-enrollment-${Date.now()}@test.cybershield.local`;
const TEST_PASSWORD = 'TestPassword123!';

interface EnrollmentCredentials {
  authToken: string;
  enrollmentKey: string;
  agentToken: string;
  hmacSecret: string;
  agentName: string;
}

// Helper to generate HMAC signature
function generateHmac(hmacSecret: string, body: string = ''): { signature: string; timestamp: string; nonce: string } {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString('hex');
  const payload = `${timestamp}:${nonce}:${body}`;
  
  const secretBytes = Buffer.from(hmacSecret, 'hex');
  const signature = crypto.createHmac('sha256', secretBytes)
    .update(payload)
    .digest('hex');
  
  return { signature, timestamp, nonce };
}

test.describe('Complete Enrollment Flow E2E', () => {
  let credentials: EnrollmentCredentials;

  test.beforeAll(async ({ request }) => {
    // Initialize credentials object
    credentials = {
      authToken: '',
      enrollmentKey: '',
      agentToken: '',
      hmacSecret: '',
      agentName: `e2e-agent-${Date.now()}`
    };
  });

  test('Phase 1: User signup and authentication', async ({ request }) => {
    // Step 1: Sign up new user
    const signupResponse = await request.post(`${BASE_URL}/auth/v1/signup`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      }
    });

    // Accept 200 (new user) or 400 (user exists - for reruns)
    expect([200, 400]).toContain(signupResponse.status());

    // Step 2: Login to get access token
    const loginResponse = await request.post(`${BASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        email: TEST_EMAIL,
        password: TEST_PASSWORD
      }
    });

    expect(loginResponse.status()).toBe(200);
    const loginData = await loginResponse.json();
    expect(loginData.access_token).toBeDefined();
    
    credentials.authToken = loginData.access_token;
    console.log('[E2E] Phase 1 completed: User authenticated');
  });

  test('Phase 2: Generate enrollment key', async ({ request }) => {
    test.skip(!credentials.authToken, 'Requires Phase 1 completion');

    const response = await request.post(`${BASE_URL}/functions/v1/generate-enrollment-key`, {
      headers: {
        'Authorization': `Bearer ${credentials.authToken}`,
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        name: `E2E Test Key ${Date.now()}`,
        expiresIn: 24 // 24 hours
      }
    });

    // Accept 200 or 201
    expect([200, 201]).toContain(response.status());
    
    const data = await response.json();
    expect(data.key || data.enrollment_key).toBeDefined();
    
    credentials.enrollmentKey = data.key || data.enrollment_key;
    console.log('[E2E] Phase 2 completed: Enrollment key generated');
  });

  test('Phase 3: Agent enrollment via enroll-agent', async ({ request }) => {
    test.skip(!credentials.enrollmentKey, 'Requires Phase 2 completion');

    const response = await request.post(`${BASE_URL}/functions/v1/enroll-agent`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        enrollmentKey: credentials.enrollmentKey,
        agentName: credentials.agentName,
        hostname: 'E2E-TEST-HOST',
        osType: 'windows',
        osVersion: '10.0.19045'
      }
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.agentToken).toBeDefined();
    expect(data.hmacSecret).toBeDefined();
    
    // Validate HMAC secret format (64 hex chars)
    expect(data.hmacSecret).toMatch(/^[0-9a-f]{64}$/i);
    
    credentials.agentToken = data.agentToken;
    credentials.hmacSecret = data.hmacSecret;
    console.log('[E2E] Phase 3 completed: Agent enrolled with token and HMAC secret');
  });

  test('Phase 4: First heartbeat with HMAC', async ({ request }) => {
    test.skip(!credentials.agentToken || !credentials.hmacSecret, 'Requires Phase 3 completion');

    const body = JSON.stringify({ status: 'active' });
    const hmac = generateHmac(credentials.hmacSecret, body);

    const response = await request.post(`${BASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'X-Agent-Token': credentials.agentToken,
        'X-HMAC-Signature': hmac.signature,
        'X-Timestamp': hmac.timestamp,
        'X-Nonce': hmac.nonce
      },
      data: body
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    expect(data.success).toBe(true);
    console.log('[E2E] Phase 4 completed: Heartbeat accepted with valid HMAC');
  });

  test('Phase 5: Submit system metrics', async ({ request }) => {
    test.skip(!credentials.agentToken || !credentials.hmacSecret, 'Requires Phase 3 completion');

    const metricsBody = JSON.stringify({
      cpu_usage_percent: 45.5,
      memory_usage_percent: 62.3,
      disk_usage_percent: 55.0,
      memory_total_gb: 16.0,
      memory_used_gb: 10.0,
      disk_total_gb: 500.0,
      disk_used_gb: 275.0,
      uptime_seconds: 86400
    });
    
    const hmac = generateHmac(credentials.hmacSecret, metricsBody);

    const response = await request.post(`${BASE_URL}/functions/v1/submit-system-metrics`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'X-Agent-Token': credentials.agentToken,
        'X-HMAC-Signature': hmac.signature,
        'X-Timestamp': hmac.timestamp,
        'X-Nonce': hmac.nonce
      },
      data: metricsBody
    });

    expect(response.status()).toBe(200);
    console.log('[E2E] Phase 5 completed: System metrics submitted');
  });

  test('Phase 6: Poll for jobs', async ({ request }) => {
    test.skip(!credentials.agentToken || !credentials.hmacSecret, 'Requires Phase 3 completion');

    const body = '';
    const hmac = generateHmac(credentials.hmacSecret, body);

    const response = await request.get(`${BASE_URL}/functions/v1/poll-jobs`, {
      headers: {
        'apikey': ANON_KEY,
        'X-Agent-Token': credentials.agentToken,
        'X-HMAC-Signature': hmac.signature,
        'X-Timestamp': hmac.timestamp,
        'X-Nonce': hmac.nonce
      }
    });

    expect(response.status()).toBe(200);
    
    const data = await response.json();
    // Either jobs array or empty response is valid
    expect(data.jobs !== undefined || Array.isArray(data)).toBe(true);
    console.log('[E2E] Phase 6 completed: Job polling working');
  });

  test('Phase 7: Create and execute job', async ({ request }) => {
    test.skip(!credentials.authToken || !credentials.agentToken, 'Requires previous phases');

    // Step 1: Create a job via admin API
    const createJobResponse = await request.post(`${BASE_URL}/functions/v1/create-job`, {
      headers: {
        'Authorization': `Bearer ${credentials.authToken}`,
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        agent_name: credentials.agentName,
        job_type: 'software_inventory_collect',
        payload: {}
      }
    });

    // Accept 200 or 201
    expect([200, 201]).toContain(createJobResponse.status());
    
    const jobData = await createJobResponse.json();
    const jobId = jobData.id || jobData.job_id;
    expect(jobId).toBeDefined();
    console.log(`[E2E] Phase 7a: Job created with ID ${jobId}`);

    // Step 2: Poll for the job as agent
    const pollBody = '';
    const hmac = generateHmac(credentials.hmacSecret, pollBody);

    const pollResponse = await request.get(`${BASE_URL}/functions/v1/poll-jobs`, {
      headers: {
        'apikey': ANON_KEY,
        'X-Agent-Token': credentials.agentToken,
        'X-HMAC-Signature': hmac.signature,
        'X-Timestamp': hmac.timestamp,
        'X-Nonce': hmac.nonce
      }
    });

    expect(pollResponse.status()).toBe(200);
    console.log('[E2E] Phase 7b: Job polled by agent');

    // Step 3: Submit job result
    const resultBody = JSON.stringify({
      job_id: jobId,
      status: 'completed',
      result: { items_collected: 42, success: true }
    });
    const resultHmac = generateHmac(credentials.hmacSecret, resultBody);

    const resultResponse = await request.post(`${BASE_URL}/functions/v1/submit-job-result`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'X-Agent-Token': credentials.agentToken,
        'X-HMAC-Signature': resultHmac.signature,
        'X-Timestamp': resultHmac.timestamp,
        'X-Nonce': resultHmac.nonce
      },
      data: resultBody
    });

    expect(resultResponse.status()).toBe(200);
    console.log('[E2E] Phase 7c completed: Job result submitted');
  });

  test('Phase 8: Verify HMAC replay protection', async ({ request }) => {
    test.skip(!credentials.agentToken || !credentials.hmacSecret, 'Requires Phase 3 completion');

    const body = JSON.stringify({ status: 'active' });
    const hmac = generateHmac(credentials.hmacSecret, body);

    // First request should succeed
    const firstResponse = await request.post(`${BASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'X-Agent-Token': credentials.agentToken,
        'X-HMAC-Signature': hmac.signature,
        'X-Timestamp': hmac.timestamp,
        'X-Nonce': hmac.nonce
      },
      data: body
    });

    expect(firstResponse.status()).toBe(200);

    // Second request with SAME signature should be rejected (replay protection)
    const replayResponse = await request.post(`${BASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'X-Agent-Token': credentials.agentToken,
        'X-HMAC-Signature': hmac.signature,
        'X-Timestamp': hmac.timestamp,
        'X-Nonce': hmac.nonce
      },
      data: body
    });

    // Should be rejected with 401 or 403
    expect([401, 403]).toContain(replayResponse.status());
    
    const errorData = await replayResponse.json();
    expect(errorData.error?.code || errorData.errorCode).toContain('REPLAY');
    console.log('[E2E] Phase 8 completed: Replay attack correctly detected and blocked');
  });

  test('Phase 9: Verify timestamp validation', async ({ request }) => {
    test.skip(!credentials.agentToken || !credentials.hmacSecret, 'Requires Phase 3 completion');

    const body = JSON.stringify({ status: 'active' });
    const nonce = crypto.randomBytes(16).toString('hex');
    
    // Use timestamp from 10 minutes ago (outside 5-minute window)
    const expiredTimestamp = (Date.now() - 10 * 60 * 1000).toString();
    const payload = `${expiredTimestamp}:${nonce}:${body}`;
    
    const secretBytes = Buffer.from(credentials.hmacSecret, 'hex');
    const signature = crypto.createHmac('sha256', secretBytes)
      .update(payload)
      .digest('hex');

    const response = await request.post(`${BASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'X-Agent-Token': credentials.agentToken,
        'X-HMAC-Signature': signature,
        'X-Timestamp': expiredTimestamp,
        'X-Nonce': nonce
      },
      data: body
    });

    // Should be rejected with 401 (expired timestamp)
    expect(response.status()).toBe(401);
    
    const errorData = await response.json();
    expect(errorData.error?.code || errorData.errorCode).toContain('TIMESTAMP');
    console.log('[E2E] Phase 9 completed: Expired timestamp correctly rejected');
  });
});

test.describe('Enrollment Error Handling', () => {
  
  test('Rejects enrollment with invalid key', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/functions/v1/enroll-agent`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        enrollmentKey: 'invalid-key-12345',
        agentName: 'test-agent-invalid',
        hostname: 'TEST-HOST',
        osType: 'windows'
      }
    });

    expect([400, 401, 404]).toContain(response.status());
  });

  test('Rejects enrollment with missing required fields', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/functions/v1/enroll-agent`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: {
        enrollmentKey: 'some-key'
        // Missing agentName
      }
    });

    expect([400, 422]).toContain(response.status());
  });

  test('Rejects heartbeat without agent token', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json'
      },
      data: { status: 'active' }
    });

    expect(response.status()).toBe(401);
  });

  test('Rejects heartbeat without HMAC headers', async ({ request }) => {
    const response = await request.post(`${BASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'apikey': ANON_KEY,
        'Content-Type': 'application/json',
        'X-Agent-Token': 'fake-token'
      },
      data: { status: 'active' }
    });

    // Should be 401 (missing HMAC) or 401 (invalid token)
    expect(response.status()).toBe(401);
  });
});
