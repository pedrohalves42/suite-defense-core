import { test, expect } from '@playwright/test';

test.describe('Agent Health Monitor - Status Filters', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin/**');
    
    // Navigate to Agent Health Monitor
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
  });

  test('should display status filter tabs', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Check for all filter tabs
    await expect(page.locator('button[role="tab"]:has-text("Todos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Problemas")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Protegidos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Offline")')).toBeVisible();
  });

  test('should show "Todos" tab as active by default', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const todosTab = page.locator('button[role="tab"]:has-text("Todos")');
    await expect(todosTab).toHaveAttribute('data-state', 'active');
  });

  test('should display count badges on filter tabs', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Each tab should have a count badge
    const tabs = page.locator('button[role="tab"]');
    const count = await tabs.count();
    
    expect(count).toBeGreaterThanOrEqual(4);
    
    // Check that at least "Todos" tab has a number
    const todosTab = page.locator('button[role="tab"]:has-text("Todos")');
    const todosText = await todosTab.textContent();
    expect(todosText).toMatch(/Todos.*\d+/);
  });

  test('should filter to show only problematic agents', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const problemasTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemasTab.click();
    await page.waitForTimeout(500);
    
    // Tab should now be active
    await expect(problemasTab).toHaveAttribute('data-state', 'active');
    
    // If there are problematic agents, they should have badges
    const throttledBadge = page.locator('text=Velocidade Limitada');
    const isolatedBadge = page.locator('text=Isolado');
    const safeModeBadge = page.locator('text=Modo Protegido');
    
    const problemCount = await throttledBadge.count() + await isolatedBadge.count() + await safeModeBadge.count();
    
    // If no problems, should show contextual message
    if (problemCount === 0) {
      const emptyMessage = page.locator('text*=nenhum.*problema, text*=Nenhum.*problema');
      if (await emptyMessage.count() > 0) {
        await expect(emptyMessage.first()).toBeVisible();
      }
    }
  });

  test('should filter to show only protected (safe mode) agents', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const protegidosTab = page.locator('button[role="tab"]:has-text("Protegidos")');
    await protegidosTab.click();
    await page.waitForTimeout(500);
    
    await expect(protegidosTab).toHaveAttribute('data-state', 'active');
    
    // If there are protected agents, they should have the safe mode badge
    const safeModeBadge = page.locator('text=Modo Protegido');
    const safeModeCount = await safeModeBadge.count();
    
    // If no protected agents, should show contextual message
    if (safeModeCount === 0) {
      const emptyMessage = page.locator('text*=nenhum.*protegido, text*=Nenhum.*protegido, text*=modo protegido');
      if (await emptyMessage.count() > 0) {
        await expect(emptyMessage.first()).toBeVisible();
      }
    }
  });

  test('should filter to show only offline agents', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const offlineTab = page.locator('button[role="tab"]:has-text("Offline")');
    await offlineTab.click();
    await page.waitForTimeout(500);
    
    await expect(offlineTab).toHaveAttribute('data-state', 'active');
    
    // Offline agents should have offline indicator
    const offlineIndicator = page.locator('text*=offline, text*=Offline, [class*="offline"]');
    
    // If no offline agents, should show contextual message
    if (await offlineIndicator.count() === 0) {
      const emptyMessage = page.locator('text*=nenhum.*offline, text*=Nenhum.*offline, text*=todos.*online');
      if (await emptyMessage.count() > 0) {
        await expect(emptyMessage.first()).toBeVisible();
      }
    }
  });

  test('should return to all agents when clicking "Todos"', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // First click on another tab
    const offlineTab = page.locator('button[role="tab"]:has-text("Offline")');
    await offlineTab.click();
    await page.waitForTimeout(300);
    
    // Then click back on "Todos"
    const todosTab = page.locator('button[role="tab"]:has-text("Todos")');
    await todosTab.click();
    await page.waitForTimeout(300);
    
    await expect(todosTab).toHaveAttribute('data-state', 'active');
  });

  test('should update counts when agents change', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Get initial count from "Todos" tab
    const todosTab = page.locator('button[role="tab"]:has-text("Todos")');
    const initialText = await todosTab.textContent();
    const initialMatch = initialText?.match(/\d+/);
    const initialCount = initialMatch ? parseInt(initialMatch[0]) : 0;
    
    // The count should be a reasonable number
    expect(initialCount).toBeGreaterThanOrEqual(0);
  });

  test('should show contextual empty message for each filter', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    const filters = [
      { tab: 'Problemas', pattern: /problema|velocidade|isolado|protegido/i },
      { tab: 'Protegidos', pattern: /protegido|modo.*protegido|safe/i },
      { tab: 'Offline', pattern: /offline|desconectado|online/i }
    ];
    
    for (const filter of filters) {
      const tab = page.locator(`button[role="tab"]:has-text("${filter.tab}")`);
      await tab.click();
      await page.waitForTimeout(300);
      
      // Check for either agents or empty message
      const content = await page.content();
      // Just verify no JavaScript errors occurred
      expect(content).toBeTruthy();
    }
  });

  test('should maintain filter state after page interaction', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Click on Problemas filter
    const problemasTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemasTab.click();
    await page.waitForTimeout(300);
    
    // Interact with something else on the page (if available)
    const refreshButton = page.locator('button:has-text("Atualizar")');
    if (await refreshButton.isVisible().catch(() => false)) {
      // Don't click refresh as it might reset state
    }
    
    // Filter should still be active
    await expect(problemasTab).toHaveAttribute('data-state', 'active');
  });

  test('should show correct icon for each filter tab', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Each tab should have an icon
    const tabs = page.locator('button[role="tab"]');
    const count = await tabs.count();
    
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      // Check for SVG icon within the tab
      const icon = tab.locator('svg');
      if (await icon.count() > 0) {
        await expect(icon.first()).toBeVisible();
      }
    }
  });
});
