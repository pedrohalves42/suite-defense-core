import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateWithAuth } from './helpers/auth';
import { TEST_CONFIG } from './test-config';

/**
 * E2E Tests for Admin Access Control
 * 
 * Verifies that:
 * 1. Admin users see the "Administracao" section in sidebar
 * 2. Admin users can access /admin/* routes
 * 3. Non-admin users are redirected from /admin/* routes
 */

test.describe('Admin Access Control', () => {
  test('Admin user sees Administracao section and can access admin routes', async ({ page }) => {
    const success = await loginAsAdmin(page);
    expect(success).toBe(true);

    // Verify "Administracao" section is visible in sidebar
    const adminSection = page.locator('text=Administracao');
    await expect(adminSection).toBeVisible({ timeout: 10000 });

    // Test access to /admin/dashboard
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator('h1, h2').filter({ hasText: /dashboard|painel|admin/i })).toBeVisible();

    // Test access to /admin/users
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.locator('h1, h2').filter({ hasText: /usuarios|users/i })).toBeVisible();

    // Test access to /admin/settings
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.locator('h1, h2').filter({ hasText: /configuracoes|settings/i })).toBeVisible();
  });

  test('Non-admin user does not see Administracao section', async ({ page }) => {
    // This test requires a non-admin user
    // For now, skip if no viewer credentials configured
    const viewerEmail = process.env.TEST_USER_EMAIL;
    const viewerPassword = process.env.TEST_USER_PASSWORD;
    
    if (!viewerEmail || !viewerPassword) {
      test.skip();
      return;
    }
    
    await page.goto('/login');
    await page.fill('input[type="email"]', viewerEmail);
    await page.fill('input[type="password"]', viewerPassword);
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL('**/dashboard');

    // Verify "Administracao" section is NOT visible
    const adminSection = page.locator('text=Administracao');
    await expect(adminSection).not.toBeVisible();
  });

  test('Non-admin user is redirected from admin routes', async ({ page }) => {
    // This test requires a non-admin user
    const viewerEmail = process.env.TEST_USER_EMAIL;
    const viewerPassword = process.env.TEST_USER_PASSWORD;
    
    if (!viewerEmail || !viewerPassword) {
      test.skip();
      return;
    }
    
    await page.goto('/login');
    await page.fill('input[type="email"]', viewerEmail);
    await page.fill('input[type="password"]', viewerPassword);
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL('**/dashboard');

    // Try to access admin route
    await page.goto('/admin/dashboard');

    // Should be redirected to /dashboard
    await expect(page).toHaveURL(/\/dashboard$/);
    
    // Should see "Access Denied" toast (if implemented) or just not be on admin page
    const currentUrl = page.url();
    expect(currentUrl).not.toContain('/admin/');
  });

  test('Admin navigation menu items work correctly', async ({ page }) => {
    const success = await loginAsAdmin(page);
    expect(success).toBe(true);

    // Find and click "Usuarios" in admin section
    await page.locator('aside').locator('text=Usuarios').click();
    await expect(page).toHaveURL(/\/admin\/users/);

    // Find and click "Configuracoes" in admin section
    await page.locator('aside').locator('text=Configuracoes').click();
    await expect(page).toHaveURL(/\/admin\/settings/);
  });
});
