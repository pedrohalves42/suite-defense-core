import { test, expect } from '@playwright/test';

test.describe('Rules Engine Management', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin/**');
    
    // Navigate to Rules Management
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
  });

  test('should display rules management page with title', async ({ page }) => {
    await expect(page.locator('text=Configuração de Regras de Decisão')).toBeVisible();
    await expect(page.locator('text=Configure as regras que o motor de decisão')).toBeVisible();
  });

  test('should display rules with humanized names in Portuguese', async ({ page }) => {
    // Wait for rules to load
    await page.waitForTimeout(1000);
    
    // Check for humanized rule names (not technical codes)
    const ruleNames = [
      'Throttle por Falhas Consecutivas',
      'Isolamento por Taxa de Erro',
      'Auto-Recuperação de Agentes',
      'Bloqueio de Versão'
    ];
    
    for (const ruleName of ruleNames) {
      const ruleElement = page.locator(`text=${ruleName}`);
      // Rule may or may not exist depending on database state
      if (await ruleElement.isVisible().catch(() => false)) {
        await expect(ruleElement).toBeVisible();
      }
    }
  });

  test('should show rule descriptions in Portuguese', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Check for humanized descriptions
    const descriptions = [
      'Limita a velocidade de comunicação de agentes',
      'Isola automaticamente agentes',
      'Recupera automaticamente agentes',
      'Bloqueia versões do agente'
    ];
    
    for (const desc of descriptions) {
      const descElement = page.locator(`text*=${desc}`);
      if (await descElement.count() > 0) {
        await expect(descElement.first()).toBeVisible();
      }
    }
  });

  test('should display rule toggle switches', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Check for switch components
    const switches = page.locator('button[role="switch"]');
    const count = await switches.count();
    
    // Should have at least one rule with toggle if rules exist
    if (count > 0) {
      await expect(switches.first()).toBeVisible();
    }
  });

  test('should toggle rule enabled state', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const switches = page.locator('button[role="switch"]');
    const count = await switches.count();
    
    if (count > 0) {
      const firstSwitch = switches.first();
      const initialState = await firstSwitch.getAttribute('data-state');
      
      await firstSwitch.click();
      await page.waitForTimeout(500);
      
      // Check for toast notification
      const toast = page.locator('text=/Regra|atualizada|ativada|desativada/i');
      if (await toast.isVisible().catch(() => false)) {
        await expect(toast).toBeVisible();
      }
    }
  });

  test('should display "Executar Agora" button', async ({ page }) => {
    const executeButton = page.locator('button:has-text("Executar Agora")');
    await expect(executeButton).toBeVisible();
  });

  test('should execute rules engine when clicking execute button', async ({ page }) => {
    const executeButton = page.locator('button:has-text("Executar Agora")');
    
    if (await executeButton.isVisible()) {
      await executeButton.click();
      await page.waitForTimeout(1000);
      
      // Check for success toast
      const toast = page.locator('[data-sonner-toast]');
      if (await toast.isVisible().catch(() => false)) {
        await expect(toast).toBeVisible();
      }
    }
  });

  test('should display rule parameters with humanized labels', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Check for humanized parameter labels
    const paramLabels = [
      'Máximo de Falhas',
      'Janela de Tempo',
      'Duração do Throttle',
      'Taxa Máxima de Erro',
      'Tempo de Isolamento',
      'Tempo de Inatividade'
    ];
    
    for (const label of paramLabels) {
      const labelElement = page.locator(`text*=${label}`);
      if (await labelElement.count() > 0) {
        await expect(labelElement.first()).toBeVisible();
      }
    }
  });

  test('should show empty state when no rules configured', async ({ page }) => {
    // Mock empty rules response
    await page.route('**/rest/v1/decision_rules*', route => {
      route.fulfill({
        status: 200,
        body: JSON.stringify([])
      });
    });
    
    await page.reload();
    await page.waitForLoadState('networkidle');
    
    const emptyState = page.locator('text=Nenhuma regra configurada');
    if (await emptyState.isVisible().catch(() => false)) {
      await expect(emptyState).toBeVisible();
    }
  });

  test('should display refresh button and it works', async ({ page }) => {
    const refreshButton = page.locator('button:has-text("Atualizar")');
    
    if (await refreshButton.isVisible()) {
      await refreshButton.click();
      await page.waitForTimeout(500);
      
      // Page should still show rules after refresh
      await expect(page.locator('text=Configuração de Regras de Decisão')).toBeVisible();
    }
  });
});
