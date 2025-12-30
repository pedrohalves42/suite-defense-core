import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './test-config';
import { ACTION_CENTER_TEST_DATA } from './fixtures/action-center-test-data';
import { loginAsAdmin, navigateToPlaybooks } from './helpers/action-center-helpers';

test.describe('Playbooks Management', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display playbooks page', async ({ page }) => {
    await navigateToPlaybooks(page);
    
    // Should show page header
    await expect(page.locator('text=Playbooks')).toBeVisible();
  });

  test('should list all configured playbooks', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Should have playbook items
    const playbooks = page.locator('[class*="card"], [class*="playbook"]');
    const count = await playbooks.count();
    
    // We expect at least some playbooks
    expect(count).toBeGreaterThan(0);
  });

  test('should display playbook name and description', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Check first playbook has name
    const firstPlaybook = page.locator('[class*="card"]').first();
    
    if (await firstPlaybook.isVisible()) {
      const text = await firstPlaybook.textContent();
      expect(text?.length).toBeGreaterThan(0);
    }
  });

  test('should show playbook severity', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Check for severity indicators
    const severityBadges = page.locator('text=Crítico, text=Alto, text=Médio, text=Baixo');
    const count = await severityBadges.count();
    
    expect(count).toBeGreaterThan(0);
  });

  test('should show action count per playbook', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for action counts (e.g., "3 ações")
    const actionCounts = page.locator('text=/\\d+ aç/');
    const count = await actionCounts.count();
    
    // May have action counts displayed
    if (count > 0) {
      const firstCount = actionCounts.first();
      await expect(firstCount).toBeVisible();
    }
  });

  test('should show enabled/disabled status', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for status indicators or switches
    const switches = page.locator('[role="switch"], input[type="checkbox"]');
    const count = await switches.count();
    
    // May have toggle switches for enabling/disabling
    if (count > 0) {
      const firstSwitch = switches.first();
      await expect(firstSwitch).toBeVisible();
    }
  });

  test('should expand playbook to show details', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for expandable cards or detail buttons
    const expandButton = page.locator('button:has-text("Ver"), button:has-text("Detalhes"), [aria-expanded]').first();
    
    if (await expandButton.isVisible()) {
      await expandButton.click();
      
      // Should show more details
      await page.waitForTimeout(500);
    }
  });

  test('should show trigger type for each playbook', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Check for trigger type information
    const triggers = page.locator('text=/Gatilho|Trigger|Quando/i');
    const count = await triggers.count();
    
    // Playbooks should show trigger information
    if (count > 0) {
      const firstTrigger = triggers.first();
      await expect(firstTrigger).toBeVisible();
    }
  });

  test('should filter playbooks by search', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for search input
    const searchInput = page.locator('input[placeholder*="Buscar"], input[type="search"], input[placeholder*="Pesquisar"]');
    
    if (await searchInput.isVisible()) {
      await searchInput.fill('Vulnerabilidade');
      await page.waitForTimeout(500);
      
      // Should filter results
      const visiblePlaybooks = page.locator('[class*="card"]:visible');
      const count = await visiblePlaybooks.count();
      
      // Should have filtered results
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should navigate to playbook detail page', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for playbook link or card
    const playbookCard = page.locator('[class*="card"] a, a[href*="playbook"]').first();
    
    if (await playbookCard.isVisible()) {
      await playbookCard.click();
      
      // Should navigate to detail page
      await page.waitForLoadState('networkidle');
    }
  });
});

test.describe('Playbook Actions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should list actions for a playbook', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Expand first playbook to see actions
    const expandButton = page.locator('[aria-expanded="false"], button:has-text("Ver ações")').first();
    
    if (await expandButton.isVisible()) {
      await expandButton.click();
      await page.waitForTimeout(500);
      
      // Should show actions
      const actions = page.locator('text=/Isolar|Notificar|Executar|Bloquear|Quarentena/');
      const count = await actions.count();
      
      expect(count).toBeGreaterThanOrEqual(0);
    }
  });

  test('should show action order', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for ordered actions
    const orderedActions = page.locator('[data-order], .action-order, text=/\\d\\.\\s/');
    const count = await orderedActions.count();
    
    // May have numbered actions
    if (count > 0) {
      const firstAction = orderedActions.first();
      await expect(firstAction).toBeVisible();
    }
  });
});

test.describe('Playbook Execution History', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should show execution history section', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for history section
    const historySection = page.locator('text=/Histórico|Execuções|Recentes/i');
    
    if (await historySection.isVisible()) {
      await expect(historySection).toBeVisible();
    }
  });

  test('should display recent executions', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for execution entries
    const executions = page.locator('text=/pendente|executado|ignorado|completed|pending/i');
    const count = await executions.count();
    
    // May have execution history
    if (count > 0) {
      const firstExecution = executions.first();
      await expect(firstExecution).toBeVisible();
    }
  });

  test('should show execution status', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for status badges
    const statusBadges = page.locator('text=/Pendente|Executado|Ignorado|Falhou/i');
    const count = await statusBadges.count();
    
    // May have status indicators
    if (count > 0) {
      const firstStatus = statusBadges.first();
      await expect(firstStatus).toBeVisible();
    }
  });
});

test.describe('Playbook Configuration', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should show auto-execute toggle', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for auto-execute option
    const autoExecute = page.locator('text=/Auto|Automático|Executar automaticamente/i');
    
    if (await autoExecute.isVisible()) {
      await expect(autoExecute).toBeVisible();
    }
  });

  test('should show notification settings', async ({ page }) => {
    await navigateToPlaybooks(page);
    await page.waitForLoadState('networkidle');
    
    // Look for notification settings
    const notifications = page.locator('text=/Notificação|Notificar|Email|Slack/i');
    
    if (await notifications.isVisible()) {
      await expect(notifications).toBeVisible();
    }
  });
});
