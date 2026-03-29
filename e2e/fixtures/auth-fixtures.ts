/**
 * Auth Fixtures for Authenticated E2E Tests
 * 
 * Provides reusable authenticated page fixtures for tests
 * that require a logged-in user session.
 */

import { test as base, expect, Page } from '@playwright/test';
import { TEST_CONFIG } from '../test-config';

/**
 * Login helper that authenticates via the login form
 */
async function performLogin(page: Page): Promise<boolean> {
  const email = TEST_CONFIG.credentials.email;
  const password = TEST_CONFIG.credentials.password;

  await page.goto(TEST_CONFIG.routes.login);
  await page.waitForLoadState('networkidle');

  // Already authenticated?
  if (page.url().includes('/admin/')) return true;

  const emailInput = page.locator('input[type="email"]');
  if ((await emailInput.count()) === 0) {
    return page.url().includes('/admin/');
  }

  await emailInput.fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();

  try {
    await page.waitForURL('**/admin/**', { timeout: TEST_CONFIG.timeouts.navigation });
    return true;
  } catch {
    return false;
  }
}

/**
 * Extended test fixture that provides an authenticated page
 */
export const test = base.extend<{ authenticatedPage: Page }>({
  // eslint-disable-next-line react-hooks/rules-of-hooks
  authenticatedPage: async ({ page }, use) => {
    const success = await performLogin(page);
    if (!success) {
      throw new Error('Authentication failed – check TEST_ADMIN_EMAIL / TEST_ADMIN_PASSWORD');
    }
    await use(page);
  },
});

export { expect };
