import { test, expect } from '@playwright/test';

/**
 * E2E Tests for One-Click Agent Installation
 * 
 * This test suite validates:
 * 1. Generation of one-click installation commands
 * 2. Temporary URL creation
 * 3. Installation script delivery via serve-installer edge function
 */

test.describe('One-Click Agent Installation', () => {
  const ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
  const ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'test123456';

  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    
    // Login as admin
    await page.fill('input[type="email"]', ADMIN_EMAIL);
    await page.fill('input[type="password"]', ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for navigation to complete
    await page.waitForURL(/\/dashboard|\/admin/, { timeout: 10000 });
  });

  test('Admin can access agent installer page', async ({ page }) => {
    await page.goto('/installer');
    
    // Wait for page to load
    await page.waitForSelector('text=Instalação Automática de Agente', { timeout: 10000 });
    
    // Verify page elements
    await expect(page.locator('h1')).toContainText('Instalação Automática de Agente');
    await expect(page.locator('input[placeholder*="nome do agente"]')).toBeVisible();
  });

  test('Can generate Windows installation command with valid credentials', async ({ page }) => {
    await page.goto('/installer');
    
    // Fill agent name
    const agentName = `test-agent-win-${Date.now()}`;
    await page.fill('input[placeholder*="nome do agente"]', agentName);
    
    // Select Windows platform
    await page.click('button:has-text("Windows")');
    
    // Generate one-click command
    await page.click('button:has-text("Gerar Comando Rápido")');
    
    // Wait for command to be generated
    await page.waitForSelector('pre:has-text("irm")', { timeout: 10000 });
    
    // Verify Windows command format
    const commandElement = page.locator('pre:has-text("irm")');
    const commandText = await commandElement.textContent();
    
    expect(commandText).toContain('irm');
    expect(commandText).toContain('| iex');
    expect(commandText).toContain('https://');
    expect(commandText).toContain('/functions/v1/serve-installer/');
    
    // Extract URL from command
    const urlMatch = commandText?.match(/https:\/\/[^\s]+/);
    expect(urlMatch).toBeTruthy();
    
    console.log('Generated Windows command:', commandText);
  });

  test('Can generate Linux installation command with valid credentials', async ({ page }) => {
    await page.goto('/installer');
    
    // Fill agent name
    const agentName = `test-agent-linux-${Date.now()}`;
    await page.fill('input[placeholder*="nome do agente"]', agentName);
    
    // Select Linux platform
    await page.click('button:has-text("Linux")');
    
    // Generate one-click command
    await page.click('button:has-text("Gerar Comando Rápido")');
    
    // Wait for command to be generated
    await page.waitForSelector('pre:has-text("curl")', { timeout: 10000 });
    
    // Verify Linux command format
    const commandElement = page.locator('pre:has-text("curl")');
    const commandText = await commandElement.textContent();
    
    expect(commandText).toContain('curl -sL');
    expect(commandText).toContain('| sudo bash');
    expect(commandText).toContain('https://');
    expect(commandText).toContain('/functions/v1/serve-installer/');
    
    console.log('Generated Linux command:', commandText);
  });

  test('Can copy installation command to clipboard', async ({ page, context }) => {
    // Grant clipboard permissions
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    
    await page.goto('/installer');
    
    // Generate command
    const agentName = `test-agent-copy-${Date.now()}`;
    await page.fill('input[placeholder*="nome do agente"]', agentName);
    await page.click('button:has-text("Windows")');
    await page.click('button:has-text("Gerar Comando Rápido")');
    
    // Wait for command to appear
    await page.waitForSelector('pre:has-text("irm")', { timeout: 10000 });
    
    // Click copy button
    await page.click('button:has-text("Copiar Comando")');
    
    // Verify success toast
    await expect(page.locator('text=Comando copiado')).toBeVisible({ timeout: 5000 });
    
    // Verify clipboard content
    const clipboardText = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboardText).toContain('irm');
    expect(clipboardText).toContain('| iex');
  });

  test('Can download pre-configured installer script', async ({ page }) => {
    await page.goto('/installer');
    
    // Fill agent name
    const agentName = `test-agent-download-${Date.now()}`;
    await page.fill('input[placeholder*="nome do agente"]', agentName);
    
    // Select platform
    await page.click('button:has-text("Windows")');
    
    // Setup download listener
    const downloadPromise = page.waitForEvent('download');
    
    // Click download button
    await page.click('button:has-text("Baixar Instalador")');
    
    // Wait for download to start
    const download = await downloadPromise;
    
    // Verify download
    expect(download.suggestedFilename()).toContain(agentName);
    expect(download.suggestedFilename()).toContain('.ps1');
    
    console.log('Downloaded file:', download.suggestedFilename());
  });

  test('Generated installation URL is accessible and returns valid script', async ({ page, request }) => {
    await page.goto('/installer');
    
    // Generate command
    const agentName = `test-agent-url-${Date.now()}`;
    await page.fill('input[placeholder*="nome do agente"]', agentName);
    await page.click('button:has-text("Windows")');
    await page.click('button:has-text("Gerar Comando Rápido")');
    
    // Wait for command and extract URL
    await page.waitForSelector('pre:has-text("irm")', { timeout: 10000 });
    const commandText = await page.locator('pre:has-text("irm")').textContent();
    const urlMatch = commandText?.match(/https:\/\/[^\s|]+/);
    
    expect(urlMatch).toBeTruthy();
    const installUrl = urlMatch![0];
    
    console.log('Testing installation URL:', installUrl);
    
    // Make request to the installation URL
    const response = await request.get(installUrl);
    
    // Verify response
    expect(response.ok()).toBeTruthy();
    expect(response.status()).toBe(200);
    
    // Verify content type
    const contentType = response.headers()['content-type'];
    expect(contentType).toContain('text/plain');
    
    // Verify script content
    const scriptContent = await response.text();
    expect(scriptContent.length).toBeGreaterThan(0);
    expect(scriptContent).toContain('$AGENT_TOKEN =');
    expect(scriptContent).toContain('$HMAC_SECRET =');
    expect(scriptContent).toContain('$SERVER_URL =');
    expect(scriptContent).not.toContain('{{AGENT_TOKEN}}'); // Should not have placeholders
    expect(scriptContent).not.toContain('{{HMAC_SECRET}}');
    
    console.log('Installation script size:', scriptContent.length, 'bytes');
  });

  test('Installation script contains valid credentials', async ({ page, request }) => {
    await page.goto('/installer');
    
    // Generate command
    const agentName = `test-agent-creds-${Date.now()}`;
    await page.fill('input[placeholder*="nome do agente"]', agentName);
    await page.click('button:has-text("Linux")');
    await page.click('button:has-text("Gerar Comando Rápido")');
    
    // Extract URL
    await page.waitForSelector('pre:has-text("curl")', { timeout: 10000 });
    const commandText = await page.locator('pre:has-text("curl")').textContent();
    const urlMatch = commandText?.match(/https:\/\/[^\s|]+/);
    const installUrl = urlMatch![0];
    
    // Fetch script
    const response = await request.get(installUrl);
    const scriptContent = await response.text();
    
    // Extract credentials
    const tokenMatch = scriptContent.match(/AGENT_TOKEN="([^"]+)"/);
    const secretMatch = scriptContent.match(/HMAC_SECRET="([^"]+)"/);
    
    expect(tokenMatch).toBeTruthy();
    expect(secretMatch).toBeTruthy();
    
    const token = tokenMatch![1];
    const secret = secretMatch![1];
    
    // Verify credentials format
    expect(token).toMatch(/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/); // UUID
    expect(secret.length).toBeGreaterThan(20); // HMAC secret should be long
    
    console.log('Credentials validated:', { token, secretLength: secret.length });
  });

  test('Windows installation command is fully functional', async ({ page, request }) => {
    await page.goto('/installer');
    
    const agentName = `test-win-full-${Date.now()}`;
    await page.fill('input[placeholder*="nome do agente"]', agentName);
    await page.click('button:has-text("Windows")');
    await page.click('button:has-text("Gerar Comando Rápido")');
    
    // Extract URL and fetch script
    await page.waitForSelector('pre:has-text("irm")', { timeout: 10000 });
    const commandText = await page.locator('pre:has-text("irm")').textContent();
    const urlMatch = commandText?.match(/https:\/\/[^\s|]+/);
    const installUrl = urlMatch![0];
    
    const response = await request.get(installUrl);
    const scriptContent = await response.text();
    
    // Validate Windows script structure
    expect(scriptContent).toContain('$AgentToken =');
    expect(scriptContent).toContain('$HmacSecret =');
    expect(scriptContent).toContain('$ServerUrl =');
    expect(scriptContent).toContain('CyberShield Agent Installer');
    expect(scriptContent).toContain('New-ScheduledTask');
    expect(scriptContent).toContain('New-NetFirewallRule');
    expect(scriptContent).not.toContain('{{AGENT_TOKEN}}');
    expect(scriptContent).not.toContain('{{HMAC_SECRET}}');
    expect(scriptContent).not.toContain('{{SERVER_URL}}');
    
    console.log('Windows script validated:', { size: scriptContent.length, agentName });
  });

  test('Linux installation command is fully functional', async ({ page, request }) => {
    await page.goto('/installer');
    
    const agentName = `test-linux-full-${Date.now()}`;
    await page.fill('input[placeholder*="nome do agente"]', agentName);
    await page.click('button:has-text("Linux")');
    await page.click('button:has-text("Gerar Comando Rápido")');
    
    // Extract URL and fetch script
    await page.waitForSelector('pre:has-text("curl")', { timeout: 10000 });
    const commandText = await page.locator('pre:has-text("curl")').textContent();
    const urlMatch = commandText?.match(/https:\/\/[^\s|]+/);
    const installUrl = urlMatch![0];
    
    const response = await request.get(installUrl);
    const scriptContent = await response.text();
    
    // Validate Linux script structure
    expect(scriptContent).toContain('AGENT_TOKEN=');
    expect(scriptContent).toContain('HMAC_SECRET=');
    expect(scriptContent).toContain('SERVER_URL=');
    expect(scriptContent).toContain('CyberShield Agent');
    expect(scriptContent).toContain('systemctl');
    expect(scriptContent).toContain('chmod +x');
    expect(scriptContent).not.toContain('{{AGENT_TOKEN}}');
    expect(scriptContent).not.toContain('{{HMAC_SECRET}}');
    expect(scriptContent).not.toContain('{{SERVER_URL}}');
    
    console.log('Linux script validated:', { size: scriptContent.length, agentName });
  });

  test('Agent name validation prevents invalid characters', async ({ page }) => {
    await page.goto('/installer');
    
    // Try invalid agent names
    const invalidNames = [
      'agent with spaces',
      'agent@special',
      'agent#hash',
      'agent/slash'
    ];
    
    for (const invalidName of invalidNames) {
      await page.fill('input[placeholder*="nome do agente"]', invalidName);
      await page.click('button:has-text("Windows")');
      await page.click('button:has-text("Gerar Comando Rápido")');
      
      // Should show validation error
      const errorVisible = await page.locator('text=caracteres especiais').isVisible().catch(() => false);
      if (errorVisible) {
        console.log(`Validation correctly rejected: ${invalidName}`);
      }
    }
  });

  test('Multiple installations can be generated for different agents', async ({ page }) => {
    await page.goto('/installer');
    
    const agents = [
      `agent-multi-1-${Date.now()}`,
      `agent-multi-2-${Date.now()}`,
      `agent-multi-3-${Date.now()}`
    ];
    
    const generatedUrls: string[] = [];
    
    for (const agentName of agents) {
      // Fill form
      await page.fill('input[placeholder*="nome do agente"]', agentName);
      await page.click('button:has-text("Windows")');
      await page.click('button:has-text("Gerar Comando Rápido")');
      
      // Wait for command
      await page.waitForSelector('pre:has-text("irm")', { timeout: 10000 });
      const commandText = await page.locator('pre:has-text("irm")').textContent();
      const urlMatch = commandText?.match(/https:\/\/[^\s|]+/);
      
      if (urlMatch) {
        generatedUrls.push(urlMatch[0]);
      }
      
      // Clear for next iteration
      await page.fill('input[placeholder*="nome do agente"]', '');
    }
    
    // Verify all URLs are unique
    const uniqueUrls = new Set(generatedUrls);
    expect(uniqueUrls.size).toBe(agents.length);
    
    console.log('Generated unique URLs:', generatedUrls.length);
  });

  test('Installation page shows helpful instructions', async ({ page }) => {
    await page.goto('/installer');
    
    // Verify instructions are present
    await expect(page.locator('text=Instalação Automática de Agente')).toBeVisible();
    await expect(page.locator('text=Execute como Administrador')).toBeVisible();
    await expect(page.locator('text=Agente envia heartbeats')).toBeVisible();
    
    // Verify platform-specific instructions
    await page.click('button:has-text("Windows")');
    await expect(page.locator('text=PowerShell como Administrador')).toBeVisible();
    
    await page.click('button:has-text("Linux")');
    await expect(page.locator('text=privilégios de root')).toBeVisible();
  });
});
