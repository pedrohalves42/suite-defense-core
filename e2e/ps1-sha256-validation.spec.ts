import { test, expect } from '@playwright/test';
import { createHash } from 'crypto';

test.describe('SHA256 Validation - Scripts de Instalação', () => {
  const agentName = `test-sha256-${Date.now()}`;
  let enrollmentKey: string;
  let serverHash: string;

  test.beforeAll(async ({ request }) => {
    // Login como admin
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

    // Gerar credenciais para o agente
    const generateResponse = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: agentName,
      },
    });

    expect(generateResponse.ok()).toBeTruthy();
    const generateData = await generateResponse.json();
    enrollmentKey = generateData.enrollmentKey;
    
    console.log(`✅ Credenciais geradas: enrollmentKey=${enrollmentKey}`);
  });

  test('deve retornar hash SHA256 no header X-Script-SHA256 para Windows', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);
    
    expect(response.ok()).toBeTruthy();
    
    // Verificar header SHA256
    const hashHeader = response.headers()['x-script-sha256'];
    expect(hashHeader).toBeTruthy();
    expect(hashHeader).toMatch(/^[a-f0-9]{64}$/i); // 64 caracteres hexadecimais
    
    serverHash = hashHeader;
    console.log(`✅ Hash no header: ${serverHash.slice(0, 16)}...`);
  });

  test('deve retornar tamanho do script no header X-Script-Size', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);
    
    expect(response.ok()).toBeTruthy();
    
    const sizeHeader = response.headers()['x-script-size'];
    expect(sizeHeader).toBeTruthy();
    expect(parseInt(sizeHeader)).toBeGreaterThan(0);
    
    console.log(`✅ Tamanho do script: ${(parseInt(sizeHeader) / 1024).toFixed(2)} KB`);
  });

  test('deve calcular hash SHA256 do script baixado corretamente', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);
    
    expect(response.ok()).toBeTruthy();
    
    const scriptContent = await response.text();
    const serverHash = response.headers()['x-script-sha256'];
    
    // Calcular hash local do script
    const calculatedHash = createHash('sha256').update(scriptContent).digest('hex');
    
    // Comparar hashes
    expect(calculatedHash.toLowerCase()).toBe(serverHash.toLowerCase());
    
    console.log(`✅ Hash validado: ${calculatedHash.slice(0, 16)}... === ${serverHash.slice(0, 16)}...`);
  });

  test('deve persistir hash no banco de dados enrollment_keys', async ({ request }) => {
    // Download do script para forçar persistência
    const downloadResponse = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);
    expect(downloadResponse.ok()).toBeTruthy();
    
    const serverHash = downloadResponse.headers()['x-script-sha256'];
    
    // Login para query no banco
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

    const { access_token } = await loginResponse.json();

    // Query para buscar hash no DB
    const dbResponse = await request.get(`${process.env.VITE_SUPABASE_URL}/rest/v1/enrollment_keys?key=eq.${enrollmentKey}&select=installer_sha256,installer_size_bytes,installer_generated_at`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
      },
    });

    expect(dbResponse.ok()).toBeTruthy();
    const [dbData] = await dbResponse.json();
    
    expect(dbData.installer_sha256).toBe(serverHash);
    expect(dbData.installer_size_bytes).toBeGreaterThan(0);
    expect(dbData.installer_generated_at).toBeTruthy();
    
    console.log(`✅ Hash persistido no DB: ${dbData.installer_sha256.slice(0, 16)}...`);
  });

  test('deve detectar mismatch quando hash é modificado', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);
    
    expect(response.ok()).toBeTruthy();
    
    let scriptContent = await response.text();
    const serverHash = response.headers()['x-script-sha256'];
    
    // Modificar conteúdo do script para simular ataque MITM
    scriptContent += '\n# MALICIOUS CODE INJECTED';
    
    // Calcular hash do script modificado
    const calculatedHash = createHash('sha256').update(scriptContent).digest('hex');
    
    // Verificar que os hashes são DIFERENTES (mismatch detectado)
    expect(calculatedHash.toLowerCase()).not.toBe(serverHash.toLowerCase());
    
    console.log(`✅ Mismatch detectado:`);
    console.log(`   Servidor:  ${serverHash.slice(0, 16)}...`);
    console.log(`   Calculado: ${calculatedHash.slice(0, 16)}...`);
  });

  test('deve validar SHA256 para script Linux (.sh)', async ({ request }) => {
    // Login como admin
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

    const { access_token } = await loginResponse.json();

    // Criar agente Linux
    const linuxAgentName = `test-linux-sha256-${Date.now()}`;
    const generateResponse = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${access_token}`,
        'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: linuxAgentName,
        osType: 'linux',
      },
    });

    expect(generateResponse.ok()).toBeTruthy();
    const { enrollmentKey: linuxKey } = await generateResponse.json();

    // Download do script Linux
    const linuxResponse = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${linuxKey}`);
    
    expect(linuxResponse.ok()).toBeTruthy();
    
    const linuxHash = linuxResponse.headers()['x-script-sha256'];
    const linuxSize = linuxResponse.headers()['x-script-size'];
    
    expect(linuxHash).toBeTruthy();
    expect(linuxHash).toMatch(/^[a-f0-9]{64}$/i);
    expect(parseInt(linuxSize)).toBeGreaterThan(0);
    
    // Validar hash
    const linuxScript = await linuxResponse.text();
    const calculatedLinuxHash = createHash('sha256').update(linuxScript).digest('hex');
    
    expect(calculatedLinuxHash.toLowerCase()).toBe(linuxHash.toLowerCase());
    
    console.log(`✅ SHA256 validado para Linux: ${linuxHash.slice(0, 16)}...`);
  });

  test('deve validar que scripts sem modificação têm hash consistente', async ({ request }) => {
    // Download 1
    const response1 = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);
    const hash1 = response1.headers()['x-script-sha256'];
    const content1 = await response1.text();
    
    // Aguardar 2 segundos
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Download 2 (mesmo enrollment key)
    const response2 = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);
    const hash2 = response2.headers()['x-script-sha256'];
    const content2 = await response2.text();
    
    // Verificar que hashes são idênticos
    expect(hash1).toBe(hash2);
    
    // Verificar que conteúdo é idêntico
    expect(content1).toBe(content2);
    
    console.log(`✅ Hash consistente em múltiplas requisições: ${hash1.slice(0, 16)}...`);
  });

  test('deve rejeitar enrollment key inválido', async ({ request }) => {
    const invalidKey = 'invalid-key-12345';
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${invalidKey}`);
    
    expect(response.status()).toBe(404);
    const text = await response.text();
    expect(text).toContain('Invalid or expired enrollment key');
    
    console.log(`✅ Enrollment key inválido rejeitado corretamente`);
  });

  test('deve incluir headers de segurança na resposta', async ({ request }) => {
    const response = await request.get(`${process.env.VITE_SUPABASE_URL}/functions/v1/serve-installer/${enrollmentKey}`);
    
    expect(response.ok()).toBeTruthy();
    
    const headers = response.headers();
    
    // Verificar headers de segurança
    expect(headers['x-content-type-options']).toBe('nosniff');
    expect(headers['x-frame-options']).toBe('DENY');
    expect(headers['content-type']).toContain('text/plain');
    expect(headers['content-disposition']).toContain('attachment');
    
    console.log(`✅ Headers de segurança presentes`);
  });
});

test.describe('SHA256 Validation - Frontend Integration', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[name="email"]', process.env.TEST_ADMIN_EMAIL!);
    await page.fill('input[name="password"]', process.env.TEST_ADMIN_PASSWORD!);
    await page.click('button[type="submit"]');
    await page.waitForURL('/');
  });

  test('deve exibir hash SHA256 após validação bem-sucedida', async ({ page }) => {
    const agentName = `ui-test-${Date.now()}`;
    
    await page.goto('/agent-installer');
    
    // Preencher nome do agente
    await page.fill('input[name="agentName"]', agentName);
    await page.waitForTimeout(1000); // Debounce
    
    // Clicar em "Baixar Script (.PS1) com Validação SHA256"
    await page.click('button:has-text("Baixar Script (.PS1) com Validação SHA256")');
    
    // Aguardar validação
    await expect(page.locator('text=Verificando Integridade')).toBeVisible({ timeout: 5000 });
    await expect(page.locator('text=✅ Integridade verificada')).toBeVisible({ timeout: 15000 });
    
    // Verificar que hash é exibido no UI
    const hashDisplay = page.locator('text=/SHA256: [a-f0-9]{16}\.\.\.[a-f0-9]{16}/i');
    await expect(hashDisplay).toBeVisible();
    
    // Verificar badge verde de validação
    const validationBadge = page.locator('text=✅ Integridade verificada');
    await expect(validationBadge).toBeVisible();
    
    console.log(`✅ UI exibe hash SHA256 corretamente após validação`);
  });

  test('deve permitir copiar hash SHA256 completo', async ({ page, context }) => {
    const agentName = `copy-test-${Date.now()}`;
    
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto('/agent-installer');
    
    await page.fill('input[name="agentName"]', agentName);
    await page.waitForTimeout(1000);
    
    await page.click('button:has-text("Baixar Script (.PS1) com Validação SHA256")');
    await expect(page.locator('text=✅ Integridade verificada')).toBeVisible({ timeout: 15000 });
    
    // Clicar no botão de copiar hash
    const copyButton = page.locator('button:has(svg.lucide-copy)').first();
    await copyButton.click();
    
    // Verificar toast de confirmação
    await expect(page.locator('text=Hash copiado')).toBeVisible();
    
    // Verificar que hash foi copiado para clipboard
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toMatch(/^[a-f0-9]{64}$/i);
    
    console.log(`✅ Hash copiado para clipboard: ${clipboardText.slice(0, 16)}...`);
  });

  test('deve bloquear download se hash SHA256 não corresponder (simulação)', async ({ page, context }) => {
    // Este teste é conceitual - simular mismatch no frontend é difícil
    // Na prática, o mismatch seria detectado via fetch interceptor
    
    const agentName = `mismatch-test-${Date.now()}`;
    
    await page.goto('/agent-installer');
    await page.fill('input[name="agentName"]', agentName);
    await page.waitForTimeout(1000);
    
    // Interceptar fetch para simular mismatch
    await page.route('**/functions/v1/serve-installer/*', async route => {
      const response = await route.fetch();
      const originalBody = await response.text();
      
      // Modificar body mas manter header original (simular MITM)
      const modifiedBody = originalBody + '\n# INJECTED CODE';
      
      await route.fulfill({
        status: 200,
        headers: {
          ...response.headers(),
          'X-Script-SHA256': response.headers()['x-script-sha256'] || 'original-hash',
        },
        body: modifiedBody,
      });
    });
    
    await page.click('button:has-text("Baixar Script (.PS1) com Validação SHA256")');
    
    // Deve exibir erro de segurança
    await expect(page.locator('text=❌ FALHA DE SEGURANÇA')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('text=Hash SHA256 do script não corresponde')).toBeVisible();
    
    console.log(`✅ Frontend detectou e bloqueou mismatch SHA256`);
  });
});
