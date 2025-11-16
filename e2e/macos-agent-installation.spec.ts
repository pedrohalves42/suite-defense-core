import { test, expect } from '@playwright/test';

test.describe('macOS Agent Installation', () => {
  let enrollmentKey: string;
  let agentName: string;

  test.beforeAll(async ({ request }) => {
    // Login como admin
    const loginResponse = await request.post(
      `${process.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`,
      {
        headers: {
          'Content-Type': 'application/json',
          'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
        },
        data: {
          email: process.env.TEST_ADMIN_EMAIL,
          password: process.env.TEST_ADMIN_PASSWORD,
        },
      }
    );

    expect(loginResponse.ok()).toBeTruthy();
    const { access_token } = await loginResponse.json();

    // Gerar enrollment key para macOS
    agentName = `test-macos-agent-${Date.now()}`;
    const generateResponse = await request.post(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/auto-generate-enrollment`,
      {
        headers: {
          'Authorization': `Bearer ${access_token}`,
          'Content-Type': 'application/json',
        },
        data: {
          agentName,
          osType: 'macos',
        },
      }
    );

    expect(generateResponse.ok()).toBeTruthy();
    const generateData = await generateResponse.json();
    enrollmentKey = generateData.enrollmentKey;
  });

  test('should serve valid macOS installer script', async ({ request }) => {
    const response = await request.get(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}?os_type=macos`
    );

    expect(response.ok()).toBeTruthy();
    expect(response.headers()['content-type']).toContain('text/x-shellscript');

    const script = await response.text();

    // Validações básicas
    expect(script).toContain('#!/bin/bash');
    expect(script).toContain('CyberShield Agent Installer - macOS');
    expect(script).toContain('AGENT_TOKEN=');
    expect(script).toContain('HMAC_SECRET=');
    expect(script).toContain('SERVER_URL=');

    // Não deve conter placeholders
    expect(script).not.toContain('{{AGENT_TOKEN}}');
    expect(script).not.toContain('{{HMAC_SECRET}}');
    expect(script).not.toContain('{{SERVER_URL}}');
    expect(script).not.toContain('{{AGENT_SCRIPT_CONTENT}}');

    // Validar paths macOS
    expect(script).toContain('/Library/Application Support/CyberShield');
    expect(script).toContain('/Library/Logs/CyberShield');
    expect(script).toContain('/Library/LaunchDaemons/com.cybershield.agent.plist');

    // Validar LaunchDaemon structure
    expect(script).toContain('<key>Label</key>');
    expect(script).toContain('<string>com.cybershield.agent</string>');
    expect(script).toContain('<key>RunAtLoad</key>');
    expect(script).toContain('<key>KeepAlive</key>');
  });

  test('should include agent script content', async ({ request }) => {
    const response = await request.get(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}?os_type=macos`
    );

    expect(response.ok()).toBeTruthy();
    const script = await response.text();

    // Verificar que conteúdo do agente está embarcado
    expect(script.length).toBeGreaterThan(5000);
    expect(script).toContain('generate_nonce');
    expect(script).toContain('generate_hmac_signature');
    expect(script).toContain('send_heartbeat');
    expect(script).toContain('poll_jobs');
  });

  test('should use secure HMAC implementation', async ({ request }) => {
    const response = await request.get(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}?os_type=macos`
    );

    expect(response.ok()).toBeTruthy();
    const script = await response.text();

    // Verificar HMAC correto
    expect(script).toContain('generate_hmac_signature');
    expect(script).toContain('X-HMAC-Signature');
    expect(script).toContain('X-Timestamp');
    expect(script).toContain('X-Nonce');

    // Não deve conter fallback inseguro
    expect(script).not.toContain('heartbeat-fallback');
  });

  test('should return SHA256 hash in headers', async ({ request }) => {
    const response = await request.get(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}?os_type=macos`
    );

    expect(response.ok()).toBeTruthy();

    const hash = response.headers()['x-installer-hash'];
    expect(hash).toBeTruthy();
    expect(hash).toMatch(/^[a-f0-9]{64}$/); // SHA256 hex format

    const size = response.headers()['x-installer-size'];
    expect(size).toBeTruthy();
    expect(parseInt(size)).toBeGreaterThan(5000);
  });

  test('should validate macOS version check', async ({ request }) => {
    const response = await request.get(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}?os_type=macos`
    );

    expect(response.ok()).toBeTruthy();
    const script = await response.text();

    // Verificar validação de versão do macOS
    expect(script).toContain('sw_vers -productVersion');
    expect(script).toContain('10.15');
  });

  test('should include plist validation', async ({ request }) => {
    const response = await request.get(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}?os_type=macos`
    );

    expect(response.ok()).toBeTruthy();
    const script = await response.text();

    // Verificar validação do plist
    expect(script).toContain('plutil -lint');
    expect(script).toContain('Invalid plist file');
  });

  test('should include launchctl commands', async ({ request }) => {
    const response = await request.get(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}?os_type=macos`
    );

    expect(response.ok()).toBeTruthy();
    const script = await response.text();

    // Verificar comandos launchctl
    expect(script).toContain('launchctl unload');
    expect(script).toContain('launchctl load');
    expect(script).toContain('launchctl start');
    expect(script).toContain('launchctl list');
  });

  test('should reject invalid enrollment key', async ({ request }) => {
    const response = await request.get(
      `${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/invalid-key-12345?os_type=macos`
    );

    expect(response.status()).toBe(404);
    const text = await response.text();
    expect(text).toContain('Invalid or expired enrollment key');
  });
});
