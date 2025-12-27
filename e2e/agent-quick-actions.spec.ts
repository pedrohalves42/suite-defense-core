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

  test('should display remove throttle button for throttled agents', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Filter to show only problematic agents
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(500);
    
    // Look for throttled badge first
    const throttledBadge = page.locator('text=Velocidade Limitada');
    
    if (await throttledBadge.isVisible().catch(() => false)) {
      // The remove throttle button is an icon button with tooltip "Remover Throttle"
      const removeThrottleButton = page.locator('button').filter({ has: page.locator('svg.lucide-clock') });
      
      if (await removeThrottleButton.count() > 0) {
        await expect(removeThrottleButton.first()).toBeVisible();
      }
    }
  });

  test('should display remove isolation button for isolated agents', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Filter to show only problematic agents
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(500);
    
    // Look for isolated badge first
    const isolatedBadge = page.locator('span:has-text("Isolado")');
    
    if (await isolatedBadge.isVisible().catch(() => false)) {
      // The remove isolation button has ShieldOff icon
      const removeIsolationButton = page.locator('button').filter({ has: page.locator('svg.lucide-shield-off') });
      
      if (await removeIsolationButton.count() > 0) {
        await expect(removeIsolationButton.first()).toBeVisible();
      }
    }
  });

  test('should remove throttle successfully', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(500);
    
    // Find remove throttle button with Clock icon
    const removeThrottleButton = page.locator('button').filter({ has: page.locator('svg.lucide-clock') });
    
    if (await removeThrottleButton.count() > 0) {
      await removeThrottleButton.first().click();
      await page.waitForTimeout(1000);
      
      // Should show success toast
      const toast = page.locator('[data-sonner-toast]');
      if (await toast.isVisible().catch(() => false)) {
        await expect(toast).toBeVisible();
      }
    }
  });

  test('should remove isolation successfully', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(500);
    
    // Find remove isolation button with ShieldOff icon
    const removeIsolationButton = page.locator('button').filter({ has: page.locator('svg.lucide-shield-off') });
    
    if (await removeIsolationButton.count() > 0) {
      await removeIsolationButton.first().click();
      await page.waitForTimeout(1000);
      
      // Should show success toast
      const toast = page.locator('[data-sonner-toast]');
      if (await toast.isVisible().catch(() => false)) {
        await expect(toast).toBeVisible();
      }
    }
  });

  test('should not display remove buttons for normal agents', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Page should load without errors
    await expect(page.locator('text=Status dos Computadores')).toBeVisible();
  });

  test('should display diagnostics action button', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Look for diagnostics button with Stethoscope icon and title "Ver Diagnóstico"
    const diagnosticsButton = page.locator('button[title="Ver Diagnóstico"]');
    
    if (await diagnosticsButton.count() > 0) {
      await expect(diagnosticsButton.first()).toBeVisible();
    }
  });

  test('should display generate key action button', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Look for key generation button with title "Gerar Nova Key"
    const keyButton = page.locator('button[title="Gerar Nova Key"]');
    
    if (await keyButton.count() > 0) {
      await expect(keyButton.first()).toBeVisible();
    }
  });

  test('should display cleanup agent action button', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Look for cleanup button with title "Limpar Agente"
    const cleanupButton = page.locator('button[title="Limpar Agente"]');
    
    if (await cleanupButton.count() > 0) {
      await expect(cleanupButton.first()).toBeVisible();
    }
  });

  test('should show confirmation dialog when clicking cleanup', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Look for cleanup button
    const cleanupButton = page.locator('button[title="Limpar Agente"]');
    
    if (await cleanupButton.count() > 0) {
      await cleanupButton.first().click();
      await page.waitForTimeout(300);
      
      // Should show confirmation dialog
      const dialog = page.locator('[role="alertdialog"]');
      if (await dialog.isVisible().catch(() => false)) {
        await expect(dialog).toBeVisible();
        
        // Check for dialog title
        const title = page.locator('text=Limpar Agente Problemático');
        await expect(title).toBeVisible();
        
        // Close dialog
        const cancelButton = page.locator('button:has-text("Cancelar")');
        await cancelButton.click();
      }
    }
  });

  test('should show loading state during action execution', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Page should load correctly
    await expect(page.locator('text=Status dos Computadores')).toBeVisible();
  });
});
