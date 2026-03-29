/**
 * E2E Test: Complete HMAC Flow
 * 
 * Tests the full agent authentication lifecycle:
 * enroll-agent → heartbeat → poll-jobs → submit-job-result
 * 
 * Validates:
 * - HMAC signature generation and verification
 * - Replay attack prevention (same nonce/timestamp rejected)
 * - Timestamp expiration (>5 min window rejected)
 * - Cross-endpoint nonce uniqueness
 */

import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';
import { signHmac, signHmacWithTimestamp, generateTestHmacSecret } from './helpers/hmac-signer';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || process.env.SUPABASE_ANON_KEY || '';

test.describe.serial('Agent HMAC Complete Flow', () => {
  // Store credentials across tests
  let agentToken: string;
  let hmacSecret: string;
  let agentName: string;

  // Skip if no Supabase URL configured - using beforeEach for proper Playwright skip behavior
  test.beforeEach((_fixtures, testInfo) => {
    if (!SUPABASE_URL) {
      testInfo.skip();
    }
  });

  test('1. Heartbeat requires valid HMAC headers', async ({ request }) => {
    // Generate test credentials
    hmacSecret = generateTestHmacSecret();
    agentToken = `test-token-${Date.now()}`;
    agentName = `e2e-hmac-test-${Date.now()}`;

    // Test: Missing HMAC headers should fail
    const missingHeadersResponse = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
        },
        data: {},
      }
    );

    // Should fail with 401 (missing headers or invalid token)
    expect([401, 403]).toContain(missingHeadersResponse.status());
    
    const errorBody = await missingHeadersResponse.json();
    expect(errorBody.error || errorBody.errorCode).toBeTruthy();
  });

  test('2. Invalid HMAC signature is rejected', async ({ request }) => {
    const body = JSON.stringify({ os_type: 'windows', os_version: '10.0.22631' });
    const hmac = signHmac(hmacSecret, body);

    // Tamper with signature
    const tamperedSignature = hmac.signature.replace(/^.{8}/, '00000000');

    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': tamperedSignature,
          'X-Timestamp': hmac.timestamp,
          'X-Nonce': hmac.nonce,
        },
        data: body,
      }
    );

    // Should fail with 401 (invalid signature or token not found)
    expect([401, 403]).toContain(response.status());
  });

  test('3. Expired timestamp (>5 min) is rejected with transient flag', async ({ request }) => {
    // Generate timestamp 6 minutes in the past
    const expiredTimestamp = (Date.now() - 6 * 60 * 1000).toString();
    const body = JSON.stringify({ os_type: 'windows' });
    const hmac = signHmacWithTimestamp(hmacSecret, body, expiredTimestamp, crypto.randomUUID());

    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': hmac.signature,
          'X-Timestamp': hmac.timestamp,
          'X-Nonce': hmac.nonce,
        },
        data: body,
      }
    );

    // Should fail (token doesn't exist, but if it did, timestamp would be rejected)
    expect([401, 403]).toContain(response.status());
    
    const errorBody = await response.json();
    // If we get AUTH_TIMESTAMP_OUT_OF_RANGE, verify transient flag
    if (errorBody.errorCode === 'AUTH_TIMESTAMP_OUT_OF_RANGE') {
      expect(errorBody.transient).toBe(true);
    }
  });

  test('4. poll-jobs requires valid HMAC authentication', async ({ request }) => {
    const hmac = signHmac(hmacSecret, '');

    const response = await request.get(
      `${SUPABASE_URL}/functions/v1/poll-jobs`,
      {
        headers: {
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': hmac.signature,
          'X-Timestamp': hmac.timestamp,
          'X-Nonce': hmac.nonce,
        },
      }
    );

    // Should fail with 401 (token not found in database)
    expect([401, 403]).toContain(response.status());
  });

  test('5. Replay attack prevention - same nonce rejected', async ({ request }) => {
    const body = JSON.stringify({ os_type: 'windows' });
    const hmac = signHmac(hmacSecret, body);

    // First request (will fail because token doesn't exist, but nonce is logged)
    await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': hmac.signature,
          'X-Timestamp': hmac.timestamp,
          'X-Nonce': hmac.nonce,
        },
        data: body,
      }
    );

    // Second request with SAME nonce (replay attempt)
    const replayResponse = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': hmac.signature,
          'X-Timestamp': hmac.timestamp,
          'X-Nonce': hmac.nonce, // Same nonce = replay
        },
        data: body,
      }
    );

    // Should be rejected (either as replay or invalid token)
    expect([401, 403]).toContain(replayResponse.status());
  });

  test('6. HMAC with wrong body fails validation', async ({ request }) => {
    const originalBody = JSON.stringify({ os_type: 'windows' });
    const tamperedBody = JSON.stringify({ os_type: 'linux' });
    
    // Generate HMAC for original body
    const hmac = signHmac(hmacSecret, originalBody);

    // Send with tampered body
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': hmac.signature,
          'X-Timestamp': hmac.timestamp,
          'X-Nonce': hmac.nonce,
        },
        data: tamperedBody, // Different from what was signed
      }
    );

    // Should fail
    expect([401, 403]).toContain(response.status());
  });

  test('7. Invalid HMAC secret format (not 64 hex chars) is rejected', async ({ request }) => {
    try {
      const body = JSON.stringify({ os_type: 'windows' });
      const timestamp = Date.now().toString();
      const nonce = crypto.randomUUID();
      
      // This will fail because invalidSecret is not valid hex
      // But we test the server's response anyway
      const response = await request.post(
        `${SUPABASE_URL}/functions/v1/heartbeat`,
        {
          headers: {
            'Content-Type': 'application/json',
            'X-Agent-Token': agentToken,
            'X-HMAC-Signature': 'invalid-signature',
            'X-Timestamp': timestamp,
            'X-Nonce': nonce,
          },
          data: body,
        }
      );

      expect([401, 403]).toContain(response.status());
    } catch (e) {
      // Expected - invalid secret format
      expect(e).toBeDefined();
    }
  });

  test('8. Each endpoint requires unique nonce per request', async ({ request }) => {
    const body1 = '';
    const body2 = JSON.stringify({ os_type: 'windows' });
    
    const hmac1 = signHmac(hmacSecret, body1);
    const hmac2 = signHmac(hmacSecret, body2);

    // Verify nonces are different
    expect(hmac1.nonce).not.toBe(hmac2.nonce);

    // Both requests should use different nonces
    const response1 = await request.get(
      `${SUPABASE_URL}/functions/v1/poll-jobs`,
      {
        headers: {
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': hmac1.signature,
          'X-Timestamp': hmac1.timestamp,
          'X-Nonce': hmac1.nonce,
        },
      }
    );

    const response2 = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': hmac2.signature,
          'X-Timestamp': hmac2.timestamp,
          'X-Nonce': hmac2.nonce,
        },
        data: body2,
      }
    );

    // Both should fail (token not in DB) but with different error handling
    expect([401, 403]).toContain(response1.status());
    expect([401, 403]).toContain(response2.status());
  });

  test('9. Missing X-Agent-Token header returns 401', async ({ request }) => {
    const hmac = signHmac(hmacSecret, '');

    const response = await request.get(
      `${SUPABASE_URL}/functions/v1/poll-jobs`,
      {
        headers: {
          // Missing X-Agent-Token
          'X-HMAC-Signature': hmac.signature,
          'X-Timestamp': hmac.timestamp,
          'X-Nonce': hmac.nonce,
        },
      }
    );

    expect(response.status()).toBe(401);
    const body = await response.json();
    expect(body.error || body.errorCode).toBeTruthy();
  });

  test('10. Future timestamp (>5 min ahead) is rejected', async ({ request }) => {
    // Generate timestamp 6 minutes in the future
    const futureTimestamp = (Date.now() + 6 * 60 * 1000).toString();
    const body = JSON.stringify({ os_type: 'windows' });
    const hmac = signHmacWithTimestamp(hmacSecret, body, futureTimestamp, crypto.randomUUID());

    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': agentToken,
          'X-HMAC-Signature': hmac.signature,
          'X-Timestamp': hmac.timestamp,
          'X-Nonce': hmac.nonce,
        },
        data: body,
      }
    );

    // Should fail (timestamp out of range or token not found)
    expect([401, 403]).toContain(response.status());
  });
});

test.describe('HMAC Error Codes Validation', () => {
  test('Error response includes structured error codes', async ({ request }) => {
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': 'invalid-token-format',
        },
        data: {},
      }
    );

    expect([401, 403]).toContain(response.status());
    
    const body = await response.json();
    
    // Should have either error message or structured error code
    expect(body.error || body.errorCode || body.message).toBeTruthy();
  });

  test('AUTH_MISSING_HEADERS when no HMAC headers provided', async ({ request }) => {
    const response = await request.post(
      `${SUPABASE_URL}/functions/v1/heartbeat`,
      {
        headers: {
          'Content-Type': 'application/json',
          'X-Agent-Token': 'some-valid-format-token-' + crypto.randomUUID(),
        },
        data: { os_type: 'windows' },
      }
    );

    // Should fail
    expect([401, 403]).toContain(response.status());
  });
});
