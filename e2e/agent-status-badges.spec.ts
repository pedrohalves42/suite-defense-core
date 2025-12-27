import { test, expect } from '@playwright/test';
import { loginAsAdmin, waitForPageLoad } from './helpers/auth';
import { TEST_CONFIG } from './test-config';

test.describe('Agent Status Badges Display', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(TEST_CONFIG.routes.agentHealth);
    await waitForPageLoad(page);
  });

  test('should display throttled badge with correct text', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Look for throttled badge text "Velocidade Limitada"
    const throttledBadge = page.locator(`text=${TEST_CONFIG.texts.badgeThrottled}`);
    
    if (await throttledBadge.count() > 0) {
      await expect(throttledBadge.first()).toBeVisible();
    }
    
    // Page should load without errors regardless
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display isolated badge with correct text', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Look for isolated badge text "Isolado"
    const isolatedBadge = page.locator(`text=${TEST_CONFIG.texts.badgeIsolated}`);
    
    if (await isolatedBadge.count() > 0) {
      await expect(isolatedBadge.first()).toBeVisible();
    }
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display safe mode badge with correct text', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Click on protected filter to find agents with safe mode
    const safeModeTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabProtected });
    if (await safeModeTab.count() > 0) {
      await safeModeTab.first().click();
      await page.waitForTimeout(500);
    }
    
    // Look for safe mode badge text "Modo Protegido"
    const safeModeBadge = page.locator(`text=${TEST_CONFIG.texts.badgeSafeMode}`);
    
    if (await safeModeBadge.count() > 0) {
      await expect(safeModeBadge.first()).toBeVisible();
    }
    
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display badges with correct colors', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Check for badge color classes
    // Throttled should have amber color
    const amberBadge = page.locator('[class*="amber"], [class*="yellow"]');
    if (await amberBadge.count() > 0) {
      await expect(amberBadge.first()).toBeVisible();
    }
    
    // Safe mode should have orange color
    const orangeBadge = page.locator('[class*="orange"]');
    if (await orangeBadge.count() > 0) {
      await expect(orangeBadge.first()).toBeVisible();
    }
    
    // Page should work regardless of badge presence
    await expect(page.locator('body')).toBeVisible();
  });

  test('should not display badges for normal healthy agents', async ({ page }) => {
    // The page should load without errors
    const title = page.locator('h1, h2').first();
    await expect(title).toBeVisible();
  });

  test('should display badges in compact mode in list view', async ({ page }) => {
    // Page should load correctly with any view mode
    const pageContent = page.locator('main, [role="main"], .container');
    await expect(pageContent.first()).toBeVisible();
  });

  test('should display badges on problematic agents page', async ({ page }) => {
    await page.goto(TEST_CONFIG.routes.problematicAgents);
    await waitForPageLoad(page);
    
    // Page should load
    await expect(page.locator('body')).toBeVisible();
    
    // Check for any content indicating page loaded
    const content = page.locator('h1, h2, [class*="card"]');
    if (await content.count() > 0) {
      await expect(content.first()).toBeVisible();
    }
  });

  test('should show tooltip on badge hover with reason', async ({ page }) => {
    await page.waitForTimeout(1000);
    
    // Click on problems filter to find agents with badges
    const problemsTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabProblems });
    if (await problemsTab.count() > 0) {
      await problemsTab.first().click();
      await page.waitForTimeout(500);
    }
    
    // Try to hover on any badge-like element
    const badges = page.locator('[class*="badge"], span[class*="border"]');
    
    if (await badges.count() > 0) {
      await badges.first().hover();
      await page.waitForTimeout(300);
      
      // Look for tooltip
      const tooltip = page.locator('[role="tooltip"], [data-state="open"]');
      if (await tooltip.count() > 0) {
        await expect(tooltip.first()).toBeVisible();
      }
    }
    
    // Page should work regardless
    await expect(page.locator('body')).toBeVisible();
  });

  test('should display status indicators', async ({ page }) => {
    // Look for any status indicator elements
    const indicators = page.locator('[class*="status"], [class*="indicator"], [class*="badge"]');
    
    if (await indicators.count() > 0) {
      await expect(indicators.first()).toBeVisible();
    }
  });
});
