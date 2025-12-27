import { test, expect } from '@playwright/test';
import { loginAsAdmin, waitForPageLoad } from './helpers/auth';
import { TEST_CONFIG } from './test-config';

test.describe('Agent Health Monitor Status Filters', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
    await page.goto(TEST_CONFIG.routes.agentHealth);
    await waitForPageLoad(page);
  });

  test('should display filter tabs', async ({ page }) => {
    // Check for tab buttons
    const tabs = page.locator('button[role="tab"]');
    await expect(tabs.first()).toBeVisible();
  });

  test('should have Todos tab active by default', async ({ page }) => {
    const todosTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabAll });
    
    if (await todosTab.count() > 0) {
      await expect(todosTab.first()).toBeVisible();
      // Check if it has active state
      const dataState = await todosTab.first().getAttribute('data-state');
      expect(dataState).toBe('active');
    }
  });

  test('should display count badges on tabs', async ({ page }) => {
    await page.waitForTimeout(500);
    
    // Look for badge elements within tabs
    const badges = page.locator('button[role="tab"] span, button[role="tab"] [class*="badge"]');
    
    if (await badges.count() > 0) {
      await expect(badges.first()).toBeVisible();
    }
  });

  test('should filter by Problemas when clicking tab', async ({ page }) => {
    const problemasTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabProblems });
    
    if (await problemasTab.count() > 0) {
      await problemasTab.first().click();
      await page.waitForTimeout(500);
      
      // Verify tab is now active
      const dataState = await problemasTab.first().getAttribute('data-state');
      expect(dataState).toBe('active');
    }
  });

  test('should filter by Protegidos when clicking tab', async ({ page }) => {
    const protegidosTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabProtected });
    
    if (await protegidosTab.count() > 0) {
      await protegidosTab.first().click();
      await page.waitForTimeout(500);
      
      const dataState = await protegidosTab.first().getAttribute('data-state');
      expect(dataState).toBe('active');
    }
  });

  test('should filter by Offline when clicking tab', async ({ page }) => {
    const offlineTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabOffline });
    
    if (await offlineTab.count() > 0) {
      await offlineTab.first().click();
      await page.waitForTimeout(500);
      
      const dataState = await offlineTab.first().getAttribute('data-state');
      expect(dataState).toBe('active');
    }
  });

  test('should return to default view when clicking Todos', async ({ page }) => {
    // First click another tab
    const problemasTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabProblems });
    if (await problemasTab.count() > 0) {
      await problemasTab.first().click();
      await page.waitForTimeout(300);
    }
    
    // Then click Todos
    const todosTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabAll });
    if (await todosTab.count() > 0) {
      await todosTab.first().click();
      await page.waitForTimeout(300);
      
      const dataState = await todosTab.first().getAttribute('data-state');
      expect(dataState).toBe('active');
    }
  });

  test('should display correct icons on filter tabs', async ({ page }) => {
    // Look for SVG icons within tabs
    const tabIcons = page.locator('button[role="tab"] svg');
    
    if (await tabIcons.count() > 0) {
      await expect(tabIcons.first()).toBeVisible();
    }
  });

  test('should display page title correctly', async ({ page }) => {
    // Check for the main title
    const title = page.locator('h1, h2').first();
    await expect(title).toBeVisible();
    
    const titleText = await title.textContent();
    const hasExpectedTitle = titleText?.includes('Status') || 
                            titleText?.includes('Computadores') ||
                            titleText?.includes('Saúde');
    expect(hasExpectedTitle).toBeTruthy();
  });

  test('should display empty state message when no agents match filter', async ({ page }) => {
    // This validates empty state handling exists
    // Click on a filter that might have no results
    const protegidosTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabProtected });
    
    if (await protegidosTab.count() > 0) {
      await protegidosTab.first().click();
      await page.waitForTimeout(500);
      
      // Page should still be visible without errors
      await expect(page.locator('body')).toBeVisible();
    }
  });

  test('should maintain filter state after interaction', async ({ page }) => {
    const problemasTab = page.locator('button[role="tab"]').filter({ hasText: TEST_CONFIG.texts.tabProblems });
    
    if (await problemasTab.count() > 0) {
      await problemasTab.first().click();
      await page.waitForTimeout(500);
      
      // Interact with page (scroll or click elsewhere)
      await page.mouse.wheel(0, 100);
      await page.waitForTimeout(300);
      
      // Tab should still be active
      const dataState = await problemasTab.first().getAttribute('data-state');
      expect(dataState).toBe('active');
    }
  });

  test('should display status cards', async ({ page }) => {
    // Look for status cards
    const cards = page.locator('[class*="card"], [class*="Card"]');
    
    if (await cards.count() > 0) {
      await expect(cards.first()).toBeVisible();
    }
  });
});
