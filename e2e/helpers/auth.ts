import { Page, expect } from '@playwright/test';
import { TEST_CONFIG } from '../test-config';

/**
 * Robust authentication helper for E2E tests
 * Handles login with proper error handling and state checks
 */
export async function loginAsAdmin(page: Page): Promise<boolean> {
  try {
    // Check if already on an admin page (already logged in)
    const currentUrl = page.url();
    if (currentUrl.includes('/admin/')) {
      return true;
    }

    // Navigate to login page
    await page.goto(TEST_CONFIG.routes.login);
    await page.waitForLoadState('networkidle');

    // Check if redirected to admin (already authenticated)
    if (page.url().includes('/admin/')) {
      return true;
    }

    // Wait for login form to be ready
    const emailInput = page.locator('input[type="email"]');
    const passwordInput = page.locator('input[type="password"]');
    const submitButton = page.locator('button[type="submit"]');

    // Check if form elements exist
    if (await emailInput.count() === 0) {
      console.log('Login form not found - may already be authenticated');
      return page.url().includes('/admin/');
    }

    // Fill credentials
    await emailInput.fill(TEST_CONFIG.credentials.email);
    await passwordInput.fill(TEST_CONFIG.credentials.password);
    
    // Submit form
    await submitButton.click();

    // Wait for navigation with timeout
    try {
      await page.waitForURL('**/admin/**', { timeout: TEST_CONFIG.timeouts.navigation });
      return true;
    } catch {
      // Check if there's an error message
      const errorMessage = page.locator('[role="alert"], .text-destructive, .error-message');
      if (await errorMessage.count() > 0) {
        console.log('Login failed - error message displayed');
      }
      return false;
    }
  } catch (error) {
    console.error('Login error:', error);
    return false;
  }
}

/**
 * Navigate to a page with authentication check
 */
export async function navigateWithAuth(page: Page, route: string): Promise<boolean> {
  const loggedIn = await loginAsAdmin(page);
  if (!loggedIn) {
    return false;
  }

  await page.goto(route);
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(TEST_CONFIG.timeouts.animation);
  
  return true;
}

/**
 * Wait for page to be fully loaded
 */
export async function waitForPageLoad(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(TEST_CONFIG.timeouts.animation);
}

/**
 * Check if element exists and is visible
 */
export async function isElementVisible(page: Page, selector: string): Promise<boolean> {
  try {
    const element = page.locator(selector);
    const count = await element.count();
    if (count === 0) return false;
    return await element.first().isVisible();
  } catch {
    return false;
  }
}

/**
 * Safe click with visibility check
 */
export async function safeClick(page: Page, selector: string): Promise<boolean> {
  try {
    const element = page.locator(selector).first();
    if (await element.isVisible()) {
      await element.click();
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
