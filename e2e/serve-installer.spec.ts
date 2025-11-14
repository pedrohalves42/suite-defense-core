import { test, expect } from '@playwright/test';

test.describe('Serve Installer Edge Function', () => {
  let enrollmentKey: string;
  let agentId: string;

  test.beforeAll(async ({ request }) => {
    // Login as admin
    const loginResponse = await request.post(`${process.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
      },
      data: {
        email: process.env.TEST_ADMIN_EMAIL,
        password: process.env.TEST_ADMIN_PASSWORD,
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const { access_token } = await loginResponse.json();

    // Generate enrollment key for testing
    const generateResponse = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: `test-installer-${Date.now()}`,
      },
    });

    expect(generateResponse.ok()).toBeTruthy();
    const generateData = await generateResponse.json();
    enrollmentKey = generateData.enrollmentKey;
    agentId = generateData.agentId;
  });

  test('should serve valid Windows installer script', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/plain');
    
    const script = await response.text();
    expect(script).toContain('# CyberShield Agent Windows Installer');
    expect(script).toContain('$AGENT_TOKEN =');
    expect(script).toContain('$HMAC_SECRET =');
    expect(script).toContain('$SERVER_URL =');
    expect(script).not.toContain('{{AGENT_TOKEN}}');
    expect(script).not.toContain('{{HMAC_SECRET}}');
    expect(script).not.toContain('{{SERVER_URL}}');
  });

  test('should reject invalid enrollment key', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/invalid-key-12345`);

    expect(response.status()).toBe(404);
    const text = await response.text();
    expect(text).toContain('Invalid or expired enrollment key');
  });

  test('should reject empty enrollment key', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/`);

    expect(response.status()).toBe(400);
  });

  test('should include agent script content', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);

    expect(response.ok()).toBeTruthy();
    const script = await response.text();
    
    // Verify that agent script content is embedded
    expect(script.length).toBeGreaterThan(1000);
    expect(script).toContain('CyberShield');
  });

  test('should use secure HMAC implementation (Invoke-SecureRequest)', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);

    expect(response.ok()).toBeTruthy();
    const script = await response.text();
    
    // ✅ PHASE 4: Security checks - must use Invoke-SecureRequest
    expect(script).toContain('Invoke-SecureRequest');
    expect(script).toContain('function Invoke-SecureRequest');
    
    // ✅ Must NOT contain dangerous $headers indexing patterns
    expect(script).not.toMatch(/\$headers\[['"]X-Request-Id['"]\]/);
    expect(script).not.toMatch(/\$headers\[['"]X-Timestamp['"]\]/);
    expect(script).not.toMatch(/Write-Log.*\$headers\[/);
    
    // ✅ Verify HMAC generation is internal to Invoke-SecureRequest
    expect(script).toContain('Get-HmacSignature');
    expect(script).toContain('X-HMAC-Signature');
  });

  test('should have minimum security standards', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);

    expect(response.ok()).toBeTruthy();
    const script = await response.text();
    
    // Size check (should be substantial with embedded agent script)
    expect(script.length).toBeGreaterThan(5000);
    
    // Must have error handling
    expect(script).toContain('try');
    expect(script).toContain('catch');
    
    // Must have logging
    expect(script).toContain('Write-Log');
    
    // Must validate parameters
    expect(script).toContain('IsNullOrWhiteSpace');
  });
});
