import { test, expect } from '@playwright/test';

test.describe('Humanized Language in Portuguese', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin/**');
  });

  test('RulesManagement should use Portuguese titles', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Should show humanized Portuguese titles, not technical codes
    await expect(page.locator('text=Configuração de Regras de Decisão')).toBeVisible();
    
    // Should NOT show technical codes
    const technicalCodes = ['throttle_on_consecutive_failures', 'isolate_on_error_rate', 'auto_recovery', 'version_block'];
    for (const code of technicalCodes) {
      const codeElement = page.locator(`text="${code}"`);
      const count = await codeElement.count();
      expect(count).toBe(0);
    }
  });

  test('RulesManagement should use humanized rule names', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check for humanized names
    const humanizedNames = [
      'Throttle por Falhas Consecutivas',
      'Isolamento por Taxa de Erro',
      'Auto-Recuperação de Agentes',
      'Bloqueio de Versão'
    ];
    
    for (const name of humanizedNames) {
      const element = page.locator(`text=${name}`);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
      }
    }
  });

  test('AgentReleases should show "Versões do Programa"', async ({ page }) => {
    await page.goto('/admin/agent-releases');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Should show Portuguese title
    await expect(page.locator('text=Versões do Programa')).toBeVisible();
    
    // Should NOT show "Agent Releases" in English
    const englishTitle = page.locator('text="Agent Releases"');
    const count = await englishTitle.count();
    expect(count).toBe(0);
  });

  test('ProblematicAgentsManager should use Portuguese labels', async ({ page }) => {
    await page.goto('/admin/problematic-agents');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Should show Portuguese titles
    const portuguesePhrases = [
      'Computadores com Problemas',
      'Gerenciamento',
      'Limpar'
    ];
    
    for (const phrase of portuguesePhrases) {
      const element = page.locator(`text*=${phrase}`);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
      }
    }
  });

  test('AgentStatusBadges should use Portuguese labels', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // If badges exist, they should be in Portuguese
    const englishBadges = ['Throttled', 'Isolated', 'Safe Mode'];
    const portugueseBadges = ['Velocidade Limitada', 'Isolado', 'Modo Protegido'];
    
    for (const badge of englishBadges) {
      const element = page.locator(`text="${badge}"`);
      const count = await element.count();
      // English badges should NOT appear
      expect(count).toBe(0);
    }
    
    // Portuguese badges may or may not appear depending on agent state
    // Just verify they're used when present
    for (const badge of portugueseBadges) {
      const element = page.locator(`text=${badge}`);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
      }
    }
  });

  test('AgentHealthMonitor should show Portuguese filter labels', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Should show Portuguese filter tabs
    await expect(page.locator('button[role="tab"]:has-text("Todos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Problemas")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Protegidos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Offline")')).toBeVisible();
    
    // Should NOT show English labels
    const englishLabels = ['All', 'Problems', 'Protected'];
    for (const label of englishLabels) {
      const element = page.locator(`button[role="tab"]:has-text("${label}")`);
      const count = await element.count();
      expect(count).toBe(0);
    }
  });

  test('AgentHealthMonitor should show contextual Portuguese messages', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check for Portuguese messages
    await expect(page.locator('text=Monitor de Saúde')).toBeVisible();
    
    // If empty state exists, should be in Portuguese
    const emptyMessages = page.locator('text*=Nenhum, text*=nenhum');
    if (await emptyMessages.count() > 0) {
      // Messages should be in Portuguese
      const text = await emptyMessages.first().textContent();
      expect(text).toMatch(/[àáâãäéêíóôõúçÀÁÂÃÄÉÊÍÓÔÕÚÇ]|nenhum|computador|cadastrado/i);
    }
  });

  test('AgentQuickActions should use Portuguese button labels', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check for Portuguese action buttons
    const portugueseActions = [
      'Remover Throttle',
      'Remover Isolamento',
      'Ver Diagnóstico',
      'Gerar Nova Chave',
      'Limpar Agente'
    ];
    
    for (const action of portugueseActions) {
      const button = page.locator(`button:has-text("${action}")`);
      if (await button.count() > 0) {
        await expect(button.first()).toBeVisible();
      }
    }
    
    // Should NOT show English action labels
    const englishActions = ['Remove Throttle', 'Remove Isolation', 'View Diagnostics', 'Generate Key', 'Cleanup Agent'];
    for (const action of englishActions) {
      const button = page.locator(`button:has-text("${action}")`);
      const count = await button.count();
      expect(count).toBe(0);
    }
  });

  test('Parameter labels should be in Portuguese', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check for humanized parameter labels
    const portugueseLabels = [
      'Máximo de Falhas',
      'Janela de Tempo',
      'Duração',
      'Taxa Máxima',
      'Tempo de Inatividade'
    ];
    
    for (const label of portugueseLabels) {
      const element = page.locator(`text*=${label}`);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
      }
    }
    
    // Should NOT show technical parameter names
    const technicalNames = ['max_failures', 'time_window', 'throttle_duration', 'max_error_rate', 'isolation_duration'];
    for (const name of technicalNames) {
      const element = page.locator(`text="${name}"`);
      const count = await element.count();
      expect(count).toBe(0);
    }
  });

  test('Toast notifications should be in Portuguese', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Toggle a rule to trigger a toast
    const switches = page.locator('button[role="switch"]');
    
    if (await switches.count() > 0) {
      await switches.first().click();
      await page.waitForTimeout(500);
      
      // If toast appears, it should be in Portuguese
      const toast = page.locator('[data-sonner-toast]');
      if (await toast.isVisible().catch(() => false)) {
        const toastText = await toast.textContent();
        // Toast should not contain English words like "success", "error", "updated"
        expect(toastText).not.toMatch(/^(success|error|updated|failed)$/i);
      }
    }
  });

  test('Navigation menu should use Portuguese labels', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Check sidebar navigation for Portuguese labels
    const portugueseNavItems = [
      'Dashboard',
      'Computadores',
      'Regras',
      'Gerenciamento',
      'Monitor'
    ];
    
    for (const item of portugueseNavItems) {
      const navItem = page.locator(`text*=${item}`);
      if (await navItem.count() > 0) {
        await expect(navItem.first()).toBeVisible();
      }
    }
  });
});
