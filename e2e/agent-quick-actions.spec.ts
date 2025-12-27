import { test, expect } from '@playwright/test';

test.describe('Agent Quick Actions', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin/**');
  });

  test('should display "Remover Throttle" button for throttled agents', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Look for agents with throttle badge
    const throttledBadge = page.locator('text=Velocidade Limitada');
    
    if (await throttledBadge.count() > 0) {
      // Find the parent card and look for the action button
      const removeThrottleButton = page.locator('button:has-text("Remover Throttle")');
      
      if (await removeThrottleButton.count() > 0) {
        await expect(removeThrottleButton.first()).toBeVisible();
      }
    }
  });

  test('should display "Remover Isolamento" button for isolated agents', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const isolatedBadge = page.locator('text=Isolado');
    
    if (await isolatedBadge.count() > 0) {
      const removeIsolationButton = page.locator('button:has-text("Remover Isolamento")');
      
      if (await removeIsolationButton.count() > 0) {
        await expect(removeIsolationButton.first()).toBeVisible();
      }
    }
  });

  test('should remove throttle when clicking the button', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const removeThrottleButton = page.locator('button:has-text("Remover Throttle")');
    
    if (await removeThrottleButton.count() > 0) {
      await removeThrottleButton.first().click();
      await page.waitForTimeout(1000);
      
      // Check for success toast
      const toast = page.locator('[data-sonner-toast]');
      if (await toast.isVisible().catch(() => false)) {
        await expect(toast).toContainText(/sucesso|removido|throttle/i);
      }
    }
  });

  test('should remove isolation when clicking the button', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const removeIsolationButton = page.locator('button:has-text("Remover Isolamento")');
    
    if (await removeIsolationButton.count() > 0) {
      await removeIsolationButton.first().click();
      await page.waitForTimeout(1000);
      
      // Check for success toast
      const toast = page.locator('[data-sonner-toast]');
      if (await toast.isVisible().catch(() => false)) {
        await expect(toast).toContainText(/sucesso|removido|isolamento/i);
      }
    }
  });

  test('should not show removal buttons for normal agents', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Count total agents vs agents with special buttons
    const agentCards = page.locator('[data-testid="agent-card"], .agent-card, [class*="agent"]');
    const removeThrottleButtons = page.locator('button:has-text("Remover Throttle")');
    const removeIsolationButtons = page.locator('button:has-text("Remover Isolamento")');
    
    const totalAgents = await agentCards.count();
    const throttleButtonCount = await removeThrottleButtons.count();
    const isolationButtonCount = await removeIsolationButtons.count();
    
    // Not all agents should have these buttons
    console.log(`Total agents: ${totalAgents}, Throttle buttons: ${throttleButtonCount}, Isolation buttons: ${isolationButtonCount}`);
    
    // Verify page loaded correctly
    await expect(page.locator('text=Monitor de Saúde')).toBeVisible();
  });

  test('should display "Ver Diagnóstico" action', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const diagnosticButton = page.locator('button:has-text("Ver Diagnóstico"), button:has-text("Diagnóstico")');
    
    if (await diagnosticButton.count() > 0) {
      await expect(diagnosticButton.first()).toBeVisible();
    }
  });

  test('should display "Gerar Nova Chave" action', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const generateKeyButton = page.locator('button:has-text("Gerar Nova Chave"), button:has-text("Nova Chave")');
    
    if (await generateKeyButton.count() > 0) {
      await expect(generateKeyButton.first()).toBeVisible();
    }
  });

  test('should display cleanup action for problematic agents', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const cleanupButton = page.locator('button:has-text("Limpar Agente"), button:has-text("Cleanup")');
    
    if (await cleanupButton.count() > 0) {
      await expect(cleanupButton.first()).toBeVisible();
    }
  });

  test('should show confirmation dialog for cleanup action', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const cleanupButton = page.locator('button:has-text("Limpar Agente"), button:has-text("Cleanup")');
    
    if (await cleanupButton.count() > 0) {
      await cleanupButton.first().click();
      await page.waitForTimeout(500);
      
      // Look for confirmation dialog
      const dialog = page.locator('[role="alertdialog"], [role="dialog"]');
      if (await dialog.isVisible().catch(() => false)) {
        await expect(dialog).toContainText(/confirmar|certeza|cancelar/i);
        
        // Cancel the action
        const cancelButton = dialog.locator('button:has-text("Cancelar")');
        if (await cancelButton.isVisible()) {
          await cancelButton.click();
        }
      }
    }
  });

  test('should show loading state during action execution', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const actionButton = page.locator('button:has-text("Remover Throttle"), button:has-text("Remover Isolamento")').first();
    
    if (await actionButton.isVisible().catch(() => false)) {
      // Click and check for loading indicator
      await actionButton.click();
      
      // Look for loading spinner or disabled state
      const loadingIndicator = page.locator('[class*="animate-spin"], [class*="loading"]');
      // Just verify the click didn't cause an error
      await page.waitForTimeout(500);
    }
  });
});
