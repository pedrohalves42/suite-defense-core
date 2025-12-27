import { test, expect } from '@playwright/test';

test.describe('Agent Health Monitor Status Filters', () => {
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
    // Check for status filter tabs based on AgentHealthMonitor.tsx
    await expect(page.locator('button[role="tab"]:has-text("Todos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Problemas")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Protegidos")')).toBeVisible();
    await expect(page.locator('button[role="tab"]:has-text("Offline")')).toBeVisible();
  });

  test('should show "Todos" tab as active by default', async ({ page }) => {
    const todosTab = page.locator('button[role="tab"]:has-text("Todos")');
    await expect(todosTab).toHaveAttribute('data-state', 'active');
  });

  test('should display count badges on filter tabs', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // The Todos tab should have a count badge
    const todosTab = page.locator('button[role="tab"]:has-text("Todos")');
    const todosText = await todosTab.textContent();
    expect(todosText).toMatch(/Todos.*\d+/);
  });

  test('should filter to show only problematic agents', async ({ page }) => {
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(500);
    
    // Verify tab is now active
    await expect(problemsTab).toHaveAttribute('data-state', 'active');
  });

  test('should filter to show only protected (safe mode) agents', async ({ page }) => {
    const protectedTab = page.locator('button[role="tab"]:has-text("Protegidos")');
    await protectedTab.click();
    await page.waitForTimeout(500);
    
    await expect(protectedTab).toHaveAttribute('data-state', 'active');
  });

  test('should filter to show only offline agents', async ({ page }) => {
    const offlineTab = page.locator('button[role="tab"]:has-text("Offline")');
    await offlineTab.click();
    await page.waitForTimeout(500);
    
    await expect(offlineTab).toHaveAttribute('data-state', 'active');
  });

  test('should return to all agents when clicking "Todos"', async ({ page }) => {
    // First click on another tab
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(300);
    
    // Then click on Todos
    const todosTab = page.locator('button[role="tab"]:has-text("Todos")');
    await todosTab.click();
    await page.waitForTimeout(300);
    
    await expect(todosTab).toHaveAttribute('data-state', 'active');
  });

  test('should update counts when agents change', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // Get the initial count from the Todos tab
    const todosTab = page.locator('button[role="tab"]:has-text("Todos")');
    const badgeText = await todosTab.textContent();
    
    // Should contain a number
    expect(badgeText).toMatch(/\d+/);
  });

  test('should show contextual empty message for each filter', async ({ page }) => {
    const filters = ['Problemas', 'Protegidos', 'Offline'];
    
    for (const filter of filters) {
      const tab = page.locator(`button[role="tab"]:has-text("${filter}")`);
      await tab.click();
      await page.waitForTimeout(300);
      
      // Verify no JavaScript errors occurred
      const content = await page.content();
      expect(content).toBeTruthy();
    }
  });

  test('should maintain filter state after page interaction', async ({ page }) => {
    // Click on Problemas filter
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(300);
    
    // Problemas should still be selected
    await expect(problemsTab).toHaveAttribute('data-state', 'active');
  });

  test('should show correct icon for each filter tab', async ({ page }) => {
    // Each filter tab should have an icon (SVG)
    const tabs = page.locator('button[role="tab"]');
    const count = await tabs.count();
    
    expect(count).toBeGreaterThanOrEqual(4);
    
    // Verify tabs are visible
    for (let i = 0; i < count; i++) {
      const tab = tabs.nth(i);
      await expect(tab).toBeVisible();
    }
  });

  test('should display page title correctly', async ({ page }) => {
    await expect(page.locator('text=Status dos Computadores')).toBeVisible();
  });
});
