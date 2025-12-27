import { test, expect } from '@playwright/test';
import { hasRequiredEnvVars } from './helpers/backend-client';
import { TEST_CONFIG } from './test-config';

/**
 * FASE 2: Teste de Download de Instaladores
 * 
 * Valida que os instaladores sao gerados corretamente
 * para Windows e Linux
 */

test.describe('Installer Download Tests', () => {
  const baseUrl = process.env.VITE_SUPABASE_URL!;
  let authToken: string;

  test.beforeAll(async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    // Login como admin
    const loginResponse = await request.post(`${baseUrl}/auth/v1/token?grant_type=password`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY!,
      },
      data: {
        email: TEST_CONFIG.credentials.email,
        password: TEST_CONFIG.credentials.password,
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const { access_token } = await loginResponse.json();
    authToken = access_token;
  });

  test('should generate valid Windows installer', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    const agentName = `test-windows-${Date.now()}`;

    // Gerar enrollment
    const enrollResponse = await request.post(`${baseUrl}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentName,
        os_type: 'windows',
      },
    });

    expect(enrollResponse.ok()).toBeTruthy();
    const { enrollmentKey } = await enrollResponse.json();

    // Baixar instalador
    const installerResponse = await request.get(`${baseUrl}/functions/v1/serve-installer/${enrollmentKey}`);

    expect(installerResponse.ok()).toBeTruthy();
    expect(installerResponse.headers()['content-type']).toContain('text/plain');
    expect(installerResponse.headers()['content-disposition']).toContain('.ps1');

    const installer = await installerResponse.text();
    expect(installer).toContain('CyberShield Agent');
    expect(installer).toContain('PowerShell');
    expect(installer).toContain('$AGENT_TOKEN');
    expect(installer).not.toContain('{{AGENT_TOKEN}}');
  });

  test('should generate valid Linux installer', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    const agentName = `test-linux-${Date.now()}`;

    // Gerar enrollment
    const enrollResponse = await request.post(`${baseUrl}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentName,
        os_type: 'linux',
      },
    });

    expect(enrollResponse.ok()).toBeTruthy();
    const { enrollmentKey } = await enrollResponse.json();

    // Baixar instalador
    const installerResponse = await request.get(`${baseUrl}/functions/v1/serve-installer/${enrollmentKey}`);

    expect(installerResponse.ok()).toBeTruthy();
    expect(installerResponse.headers()['content-type']).toContain('text/plain');
    expect(installerResponse.headers()['content-disposition']).toContain('.sh');

    const installer = await installerResponse.text();
    expect(installer).toContain('CyberShield Agent');
    expect(installer).toContain('#!/bin/bash');
    expect(installer).toContain('AGENT_TOKEN');
    expect(installer).not.toContain('{{AGENT_TOKEN}}');
  });

  test('should reject expired enrollment key', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    const invalidKey = 'expired-key-12345';

    const response = await request.get(`${baseUrl}/functions/v1/serve-installer/${invalidKey}`);

    expect(response.status()).toBe(404);
    const text = await response.text();
    expect(text).toContain('Invalid or expired');
  });
});
