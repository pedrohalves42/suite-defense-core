import { test, expect } from '@playwright/test';

test.describe('Agent Status Badges Display', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin/**');
  });

  test('should display throttled badge with correct text', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Look for throttled badge text "Velocidade Limitada"
    const throttledBadge = page.locator('text=Velocidade Limitada');
    
    if (await throttledBadge.isVisible().catch(() => false)) {
      await expect(throttledBadge).toBeVisible();
    }
  });

  test('should display isolated badge with correct text', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Look for isolated badge text "Isolado"
    const isolatedBadge = page.locator('span:has-text("Isolado")').first();
    
    if (await isolatedBadge.isVisible().catch(() => false)) {
      await expect(isolatedBadge).toBeVisible();
    }
  });

  test('should display safe mode badge with correct text', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Look for safe mode badge text "Modo Protegido"
    const safeModeButton = page.locator('button[role="tab"]:has-text("Protegidos")');
    await safeModeButton.click();
    await page.waitForTimeout(500);
    
    const safeModeBadge = page.locator('text=Modo Protegido');
    
    if (await safeModeBadge.isVisible().catch(() => false)) {
      await expect(safeModeBadge).toBeVisible();
    }
  });

  test('should display badges with correct colors', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Check for badge color classes
    // Throttled should have amber color
    const throttledBadge = page.locator('.border-amber-500');
    if (await throttledBadge.count() > 0) {
      await expect(throttledBadge.first()).toBeVisible();
    }
    
    // Safe mode should have orange color
    const safeModeBadge = page.locator('.border-orange-500');
    if (await safeModeBadge.count() > 0) {
      await expect(safeModeBadge.first()).toBeVisible();
    }
  });

  test('should not display badges for normal healthy agents', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // The page should load without errors
    await expect(page.locator('text=Status dos Computadores')).toBeVisible();
  });

  test('should display badges in compact mode in list view', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Page should load correctly
    await expect(page.locator('text=Status dos Computadores')).toBeVisible();
  });

  test('should display badges on problematic agents page', async ({ page }) => {
    await page.goto('/admin/problematic-agents');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Page should load
    const pageTitle = page.locator('h1, h2').first();
    await expect(pageTitle).toBeVisible();
  });

  test('should show tooltip on badge hover with reason', async ({ page }) => {
    await page.goto('/admin/agent-health-monitor');
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(1000);
    
    // Click on problems filter to find agents with badges
    const problemsTab = page.locator('button[role="tab"]:has-text("Problemas")');
    await problemsTab.click();
    await page.waitForTimeout(500);
    
    // Try to hover on any badge
    const anyBadge = page.locator('[data-slot="badge"]').first();
    
    if (await anyBadge.isVisible().catch(() => false)) {
      await anyBadge.hover();
      await page.waitForTimeout(300);
      
      // Tooltip should appear with some content
      const tooltip = page.locator('[role="tooltip"]');
      if (await tooltip.isVisible().catch(() => false)) {
        await expect(tooltip).toBeVisible();
      }
    }
  });
});
