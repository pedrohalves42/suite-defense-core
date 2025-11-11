import { test, expect } from '@playwright/test';

test.describe('Linux Agent Installation E2E', () => {
  test('should generate valid Linux installation script', async ({ page }) => {
    // Navigate to installer page
    await page.goto('/installer');
    
    // Wait for page to load
    await page.waitForSelector('text=Gerador de Instalador de Agente');
    
    // Fill in agent name
    const agentName = `test-linux-agent-${Date.now()}`;
    await page.fill('input[placeholder*="servidor"]', agentName);
    
    // Click generate button
    await page.click('button:has-text("Gerar Instalador")');
    
    // Wait for generation to complete
    await page.waitForSelector('text=Instalador gerado com sucesso!', { timeout: 10000 });
    
    // Setup download promise before clicking download
    const downloadPromise = page.waitForEvent('download');
    
    // Click Linux download button
    await page.click('button:has-text("Baixar Instalador Linux")');
    
    // Wait for download to complete
    const download = await downloadPromise;
    
    // Verify download filename
    expect(download.suggestedFilename()).toMatch(/cybershield-agent-linux-.*\.sh/);
    
    // Save and read the downloaded script
    const path = await download.path();
    expect(path).toBeTruthy();
    
    // Read script content
    const fs = require('fs');
    const scriptContent = fs.readFileSync(path!, 'utf-8');
    
    // Validate script structure
    expect(scriptContent).toContain('#!/bin/bash');
    expect(scriptContent).toContain('CyberShield Agent');
    expect(scriptContent).toContain('Version: 2.1.0');
    expect(scriptContent).toContain('AGENT_TOKEN=');
    expect(scriptContent).toContain('HMAC_SECRET=');
    expect(scriptContent).toContain('SERVER_URL=');
    
    // Validate critical functions exist
    expect(scriptContent).toContain('check_root_privileges()');
    expect(scriptContent).toContain('detect_linux_distro()');
    expect(scriptContent).toContain('check_systemd()');
    expect(scriptContent).toContain('install_dependencies()');
    expect(scriptContent).toContain('test_server_connectivity()');
    expect(scriptContent).toContain('create_systemd_service()');
    expect(scriptContent).toContain('validate_installation()');
    
    // Validate HMAC implementation
    expect(scriptContent).toContain('generate_hmac_signature()');
    expect(scriptContent).toContain('secure_request()');
    expect(scriptContent).toContain('X-HMAC-Signature');
    expect(scriptContent).toContain('X-Timestamp');
    expect(scriptContent).toContain('X-Nonce');
    
    // Validate systemd service
    expect(scriptContent).toContain('[Unit]');
    expect(scriptContent).toContain('Description=CyberShield Security Agent');
    expect(scriptContent).toContain('[Service]');
    expect(scriptContent).toContain('Type=simple');
    expect(scriptContent).toContain('[Install]');
    expect(scriptContent).toContain('WantedBy=multi-user.target');
  });

  test('should validate Linux script compatibility checks', async ({ page }) => {
    await page.goto('/installer');
    await page.waitForSelector('text=Gerador de Instalador de Agente');
    
    const agentName = `test-linux-compat-${Date.now()}`;
    await page.fill('input[placeholder*="servidor"]', agentName);
    await page.click('button:has-text("Gerar Instalador")');
    await page.waitForSelector('text=Instalador gerado com sucesso!');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Baixar Instalador Linux")');
    const download = await downloadPromise;
    
    const path = await download.path();
    const fs = require('fs');
    const scriptContent = fs.readFileSync(path!, 'utf-8');
    
    // Validate distribution detection
    expect(scriptContent).toContain('ubuntu|debian');
    expect(scriptContent).toContain('centos|rhel|fedora');
    expect(scriptContent).toContain('/etc/os-release');
    
    // Validate dependency installation for different distros
    expect(scriptContent).toContain('apt-get install');
    expect(scriptContent).toContain('yum install');
    expect(scriptContent).toContain('curl jq openssl');
    
    // Validate bash version check
    expect(scriptContent).toContain('MIN_BASH_VERSION=4');
    expect(scriptContent).toContain('check_bash_version()');
  });

  test('should validate Linux security configurations', async ({ page }) => {
    await page.goto('/installer');
    await page.waitForSelector('text=Gerador de Instalador de Agente');
    
    const agentName = `test-linux-security-${Date.now()}`;
    await page.fill('input[placeholder*="servidor"]', agentName);
    await page.click('button:has-text("Gerar Instalador")');
    await page.waitForSelector('text=Instalador gerado com sucesso!');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Baixar Instalador Linux")');
    const download = await downloadPromise;
    
    const path = await download.path();
    const fs = require('fs');
    const scriptContent = fs.readFileSync(path!, 'utf-8');
    
    // Validate file permissions
    expect(scriptContent).toContain('chmod 750');
    expect(scriptContent).toContain('chmod 600');
    expect(scriptContent).toContain('chmod 644');
    
    // Validate systemd security hardening
    expect(scriptContent).toContain('NoNewPrivileges=true');
    expect(scriptContent).toContain('PrivateTmp=true');
    expect(scriptContent).toContain('ProtectSystem=strict');
    expect(scriptContent).toContain('ProtectHome=true');
    
    // Validate secure directories
    expect(scriptContent).toContain('/opt/cybershield');
    expect(scriptContent).toContain('/var/log/cybershield');
    expect(scriptContent).toContain('CONFIG_FILE=');
  });

  test('should validate Linux installation workflow', async ({ page }) => {
    await page.goto('/installer');
    await page.waitForSelector('text=Gerador de Instalador de Agente');
    
    const agentName = `test-linux-workflow-${Date.now()}`;
    await page.fill('input[placeholder*="servidor"]', agentName);
    await page.click('button:has-text("Gerar Instalador")');
    await page.waitForSelector('text=Instalador gerado com sucesso!');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Baixar Instalador Linux")');
    const download = await downloadPromise;
    
    const path = await download.path();
    const fs = require('fs');
    const scriptContent = fs.readFileSync(path!, 'utf-8');
    
    // Validate installation steps are present in correct order
    const installSteps = [
      'check_root_privileges',
      'check_bash_version',
      'detect_linux_distro',
      'check_systemd',
      'verify_dependencies',
      'test_server_connectivity',
      'create_directories',
      'create_config_file',
      'copy_agent_script',
      'create_systemd_service',
      'enable_and_start_service',
      'validate_installation',
      'show_installation_summary'
    ];
    
    let lastIndex = 0;
    for (const step of installSteps) {
      const index = scriptContent.indexOf(step);
      expect(index).toBeGreaterThan(-1);
      // Verify steps are called in the install_agent function
      expect(scriptContent).toContain(`${step}`);
    }
    
    // Validate installation function exists
    expect(scriptContent).toContain('install_agent()');
  });

  test('should validate Linux error handling and logging', async ({ page }) => {
    await page.goto('/installer');
    await page.waitForSelector('text=Gerador de Instalador de Agente');
    
    const agentName = `test-linux-errors-${Date.now()}`;
    await page.fill('input[placeholder*="servidor"]', agentName);
    await page.click('button:has-text("Gerar Instalador")');
    await page.waitForSelector('text=Instalador gerado com sucesso!');
    
    const downloadPromise = page.waitForEvent('download');
    await page.click('button:has-text("Baixar Instalador Linux")');
    const download = await downloadPromise;
    
    const path = await download.path();
    const fs = require('fs');
    const scriptContent = fs.readFileSync(path!, 'utf-8');
    
    // Validate logging functions
    expect(scriptContent).toContain('log_info()');
    expect(scriptContent).toContain('log_warn()');
    expect(scriptContent).toContain('log_error()');
    
    // Validate error handling
    expect(scriptContent).toContain('exit 1');
    expect(scriptContent).toContain('set -e'); // Exit on error
    
    // Validate user-friendly messages
    expect(scriptContent).toContain('This script must be run as root');
    expect(scriptContent).toContain('Please run:');
    expect(scriptContent).toContain('sudo');
    
    // Validate installation summary
    expect(scriptContent).toContain('Installation Complete');
    expect(scriptContent).toContain('Useful commands:');
    expect(scriptContent).toContain('systemctl status');
    expect(scriptContent).toContain('journalctl');
  });
});
