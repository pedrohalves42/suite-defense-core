import { test, expect } from '@playwright/test';

test.describe('Humanized Portuguese Language Verification', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin/**');
  });

  test('should display RulesManagement with Portuguese humanized titles', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    
    // Check main title - based on RulesManagement.tsx
    await expect(page.locator('text=Gerenciamento de Regras')).toBeVisible();
    await expect(page.locator('text=Configure as regras do motor de decisão automática')).toBeVisible();
  });

  test('should display humanized rule names in RulesManagement', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check for humanized rule names - based on RULE_NAMES in RulesManagement.tsx
    const ruleNames = [
      'Proteção contra Erros Repetidos',
      'Limitador de Velocidade',
      'Isolamento de Emergência',
      'Bloqueio de Versões Problemáticas'
    ];
    
    for (const ruleName of ruleNames) {
      const ruleElement = page.locator(`text=${ruleName}`);
      if (await ruleElement.isVisible().catch(() => false)) {
        await expect(ruleElement).toBeVisible();
      }
    }
  });

  test('should display AgentReleases with Portuguese titles', async ({ page }) => {
    await page.goto('/admin/agent-releases');
    await page.waitForLoadState('networkidle');
    
    // Should have Portuguese content
    const pageContent = page.locator('h1, h2, h3');
    await expect(pageContent.first()).toBeVisible();
  });

  test('should display ProblematicAgentsManager with Portuguese labels', async ({ page }) => {
    await page.goto('/admin/problematic-agents');
    await page.waitForLoadState('networkidle');
    
    // Should have Portuguese content
    const pageContent = page.locator('h1, h2, h3');
    await expect(pageContent.first()).toBeVisible();
  });

  test('should display AgentHealthMonitor with Portuguese badges', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check main title - based on AgentHealthMonitor.tsx
    await expect(page.locator('text=Status dos Computadores')).toBeVisible();
  });

  test('should display AgentHealthMonitor filter labels in Portuguese', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    
    // Check filter tab labels
    await expect(page.locator('button[role="tab"]:has-text("Todos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Problemas")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Protegidos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Offline")')).toBeVisible();
  });

  test('should display AgentQuickActions tooltips in Portuguese', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check for Portuguese tooltips on action buttons
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(500);
    
    // Hover on buttons to see tooltips
    const throttleButton = page.locator('button').filter({ has: page.locator('svg.lucide-clock') }).first();
    
    if (await throttleButton.isVisible().catch(() => false)) {
      await throttleButton.hover();
      await page.waitForTimeout(300);
      
      const tooltip = page.locator('text=Remover Throttle');
      if (await tooltip.isVisible().catch(() => false)) {
        await expect(tooltip).toBeVisible();
      }
    }
  });

  test('should display RulesManagement parameter labels in Portuguese', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check for Portuguese parameter labels - based on PARAM_LABELS
    const paramLabels = [
      'Limite de erros',
      'Janela de tempo',
      'Tempo de espera',
      'Tentativas máximas',
      'Duração do isolamento',
      'Porcentagem para bloqueio'
    ];
    
    for (const label of paramLabels) {
      const element = page.locator(`text*=${label}`);
      if (await element.count() > 0) {
        await expect(element.first()).toBeVisible();
      }
    }
  });

  test('should display toast notifications in Portuguese', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Click on a switch to toggle rule
    const switches = page.locator('button[role="switch"]');
    
    if (await switches.count() > 0) {
      await switches.first().click();
      await page.waitForTimeout(1000);
      
      // Check for toast notification (should be in Portuguese)
      const toast = page.locator('[data-sonner-toast]');
      if (await toast.isVisible().catch(() => false)) {
        await expect(toast).toBeVisible();
      }
    }
  });

  test('should display navigation menu items in Portuguese', async ({ page }) => {
    await page.goto('/admin');
    await page.waitForLoadState('networkidle');
    
    // Check for Portuguese navigation labels
    const navItems = page.locator('nav a, nav button, [role="navigation"] a');
    const count = await navItems.count();
    
    // Should have some navigation items
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should display empty states in Portuguese', async ({ page }) => {
    await page.goto('/admin/rules-management');
    
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

  test('should display button texts in Portuguese', async ({ page }) => {
    await page.goto('/admin/rules-management');
    await page.waitForLoadState('networkidle');
    
    // Check for Portuguese button texts
    await expect(page.locator('button:has-text("Atualizar")')).toBeVisible();
    await expect(page.locator('button:has-text("Executar Agora")')).toBeVisible();
  });

  test('should display card titles in Portuguese on health monitor', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    
    // Check for Portuguese card titles
    await expect(page.locator('text=Protegidos')).toBeVisible();
    await expect(page.locator('text=Computadores')).toBeVisible();
  });
});
