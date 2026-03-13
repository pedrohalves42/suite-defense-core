/**
 * Sprint 20 — E2E: Login → Dashboard → Verify metrics load
 */

import { test, expect } from './fixtures/auth-fixtures';
import { TEST_CONFIG } from './test-config';

const hasCredentials = !!(
  process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD
);

test.describe('Authenticated Dashboard Flow', () => {
  test.skip(!hasCredentials, 'Test credentials not configured');

  test('login redirects to admin dashboard', async ({ authenticatedPage: page }) => {
    await expect(page).toHaveURL(/\/admin\//);
  });

  test('dashboard loads metric cards', async ({ authenticatedPage: page }) => {
    await page.goto(TEST_CONFIG.routes.dashboard);
    await page.waitForLoadState('networkidle');

    // Should display at least one stat card or metric widget
    const cards = page.locator('[class*="card"], [class*="Card"], [data-testid*="metric"], [data-testid*="stat"]');
    await expect(cards.first()).toBeVisible({ timeout: 15000 });
  });

  test('sidebar navigation works after login', async ({ authenticatedPage: page }) => {
    // Click a sidebar link and verify navigation
    const sidebarLink = page.locator('nav a[href*="/admin/"]').first();
    if (await sidebarLink.isVisible()) {
      await sidebarLink.click();
      await page.waitForLoadState('networkidle');
      await expect(page).toHaveURL(/\/admin\//);
    }
  });

  test('user session persists across navigation', async ({ authenticatedPage: page }) => {
    await page.goto(TEST_CONFIG.routes.dashboard);
    await page.waitForLoadState('networkidle');

    // Navigate away and back
    await page.goto('/');
    await page.goto(TEST_CONFIG.routes.dashboard);
    await page.waitForLoadState('networkidle');

    // Should still be on admin (not redirected to login)
    await expect(page).not.toHaveURL(/\/login/);
  });
});
