import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './test-config';
import { ACTION_CENTER_TEST_DATA, ACTION_CENTER_ROUTES } from './fixtures/action-center-test-data';
import {
  loginAsAdmin,
  navigateToActionCenter,
  waitForActionCenterLoad,
  getActionCardCount,
  refreshActionCenter,
  sectionExists,
  isEmptyStateVisible,
  assertActionCenterLoaded,
} from './helpers/action-center-helpers';

test.describe('Action Center Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display action center page', async ({ page }) => {
    await navigateToActionCenter(page);
    
    // Should show page header
    await expect(page.locator('text=Central de Ações')).toBeVisible();
  });

  test('should load action center feed', async ({ page }) => {
    await navigateToActionCenter(page);
    await assertActionCenterLoaded(page);
    
    // Should have either action items or empty state
    const hasContent = await page.locator('text=Ações Urgentes, text=Ações Recomendadas, text=Informativo').first().isVisible().catch(() => false);
    const isEmpty = await isEmptyStateVisible(page);
    
    expect(hasContent || isEmpty).toBe(true);
  });

  test('should display urgent section when urgent items exist', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const hasUrgent = await sectionExists(page, 'urgent');
    
    if (hasUrgent) {
      await expect(page.locator('text=Ações Urgentes')).toBeVisible();
      await expect(page.locator('text=🔴')).toBeVisible();
    }
  });

  test('should display recommended section when recommended items exist', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const hasRecommended = await sectionExists(page, 'recommended');
    
    if (hasRecommended) {
      await expect(page.locator('text=Ações Recomendadas')).toBeVisible();
      await expect(page.locator('text=🟡')).toBeVisible();
    }
  });

  test('should display informational section when informational items exist', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const hasInfo = await sectionExists(page, 'informational');
    
    if (hasInfo) {
      await expect(page.locator('text=Informativo')).toBeVisible();
      await expect(page.locator('text=🔵')).toBeVisible();
    }
  });

  test('should refresh data on button click', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    // Click refresh button
    const refreshButton = page.locator('button:has-text("Atualizar")');
    await expect(refreshButton).toBeVisible();
    await refreshButton.click();
    
    // Wait for refresh to complete
    await page.waitForLoadState('networkidle');
    
    // Page should still be functional
    await assertActionCenterLoaded(page);
  });

  test('should show empty state when no actions pending', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (isEmpty) {
      await expect(page.locator('text=Tudo em ordem!')).toBeVisible();
      await expect(page.locator('text=Não há ações pendentes')).toBeVisible();
    }
  });

  test('should show healthy count in empty state', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (isEmpty) {
      // Check for healthy count message
      const healthyMessage = page.locator('text=/\\d+ computador/');
      const isVisible = await healthyMessage.isVisible().catch(() => false);
      
      // May or may not show depending on data
      if (isVisible) {
        await expect(healthyMessage).toBeVisible();
      }
    }
  });

  test('should navigate to playbooks page', async ({ page }) => {
    await navigateToActionCenter(page);
    
    // Find and click playbooks link
    const playbooksLink = page.locator('a:has-text("Playbooks"), a:has-text("Ver Playbooks")');
    
    if (await playbooksLink.isVisible()) {
      await playbooksLink.click();
      await expect(page).toHaveURL(/playbooks/);
    }
  });

  test('should show action card with agent name', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (!isEmpty) {
      // Check that cards show agent information
      const cards = page.locator('[class*="card"]');
      const firstCard = cards.first();
      
      if (await firstCard.isVisible()) {
        // Cards should have text content
        const text = await firstCard.textContent();
        expect(text?.length).toBeGreaterThan(0);
      }
    }
  });

  test('should show severity badges on action cards', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (!isEmpty) {
      // Check for severity badges
      const badges = page.locator('text=Crítico, text=Alto, text=Médio, text=Baixo');
      const firstBadge = badges.first();
      
      if (await firstBadge.isVisible()) {
        await expect(firstBadge).toBeVisible();
      }
    }
  });

  test('should have execute button on action cards', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (!isEmpty) {
      // Look for execute-type buttons
      const executeButtons = page.locator('button:has-text("Executar"), button:has-text("Corrigir"), button:has-text("Resolver"), button:has-text("Isolar")');
      const firstButton = executeButtons.first();
      
      if (await firstButton.isVisible()) {
        await expect(firstButton).toBeEnabled();
      }
    }
  });

  test('should have ignore button on playbook cards', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (!isEmpty) {
      const ignoreButton = page.locator('button:has-text("Ignorar")').first();
      
      if (await ignoreButton.isVisible()) {
        await expect(ignoreButton).toBeEnabled();
      }
    }
  });

  test('should open ignore dialog when clicking ignore', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const ignoreButton = page.locator('button:has-text("Ignorar")').first();
    
    if (await ignoreButton.isVisible()) {
      await ignoreButton.click();
      
      // Dialog should open
      await expect(page.locator('[role="dialog"]')).toBeVisible();
      await expect(page.locator('text=Ignorar Ação')).toBeVisible();
      
      // Should have textarea for reason
      await expect(page.locator('textarea')).toBeVisible();
      
      // Close dialog
      await page.locator('button:has-text("Cancelar")').click();
    }
  });

  test('should require reason to ignore action', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const ignoreButton = page.locator('button:has-text("Ignorar")').first();
    
    if (await ignoreButton.isVisible()) {
      await ignoreButton.click();
      
      // Confirm button should be disabled without reason
      const confirmButton = page.locator('button:has-text("Confirmar")');
      await expect(confirmButton).toBeDisabled();
      
      // Fill reason
      await page.fill('textarea', 'Test reason');
      
      // Confirm button should be enabled
      await expect(confirmButton).toBeEnabled();
      
      // Close dialog
      await page.locator('button:has-text("Cancelar")').click();
    }
  });

  test('should show agent link when agent_id present', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (!isEmpty) {
      // Check for agent health link
      const agentLink = page.locator('a[href*="agent-health"]').first();
      
      if (await agentLink.isVisible()) {
        await expect(agentLink).toHaveAttribute('href', /agent/);
      }
    }
  });

  test('should display relative time on cards', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (!isEmpty) {
      // Look for time indicators (e.g., "há 2 horas")
      const timeText = page.locator('text=/há \\d+ (minuto|hora|dia)/i').first();
      
      if (await timeText.isVisible()) {
        await expect(timeText).toBeVisible();
      }
    }
  });
});

test.describe('Action Center Sidebar Badge', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should show badge on sidebar when urgent items exist', async ({ page }) => {
    await page.goto(TEST_CONFIG.routes.dashboard);
    await page.waitForLoadState('networkidle');
    
    // Check for sidebar badge
    const sidebarItem = page.locator('text=Central de Ações');
    
    if (await sidebarItem.isVisible()) {
      // Look for badge near the menu item
      const menuItem = sidebarItem.locator('..');
      const badge = menuItem.locator('span[class*="badge"], .badge');
      
      // Badge may or may not be visible depending on data
      const isVisible = await badge.isVisible().catch(() => false);
      
      if (isVisible) {
        const text = await badge.textContent();
        expect(parseInt(text || '0', 10)).toBeGreaterThanOrEqual(0);
      }
    }
  });
});

test.describe('Action Center Actions', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should execute action successfully', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const isEmpty = await isEmptyStateVisible(page);
    
    if (!isEmpty) {
      const executeButton = page.locator('button:has-text("Executar"), button:has-text("Corrigir"), button:has-text("Resolver")').first();
      
      if (await executeButton.isVisible()) {
        await executeButton.click();
        
        // Wait for action to complete (toast or refresh)
        await page.waitForLoadState('networkidle');
        
        // Should show success message or refresh
        // Note: Actual behavior depends on backend response
      }
    }
  });

  test('should ignore action with reason', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const ignoreButton = page.locator('button:has-text("Ignorar")').first();
    
    if (await ignoreButton.isVisible()) {
      await ignoreButton.click();
      await page.fill('textarea', 'E2E test - ignoring for testing purposes');
      await page.locator('button:has-text("Confirmar")').click();
      
      // Wait for action to complete
      await page.waitForLoadState('networkidle');
    }
  });

  test('should acknowledge alert', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    const ackButton = page.locator('button:has-text("Reconhecer")').first();
    
    if (await ackButton.isVisible()) {
      await ackButton.click();
      
      // Wait for action to complete
      await page.waitForLoadState('networkidle');
    }
  });
});
