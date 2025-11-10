import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Admin Access Control
 * 
 * Verifies that:
 * 1. Admin users see the "Administração" section in sidebar
 * 2. Admin users can access /admin/* routes
 * 3. Non-admin users are redirected from /admin/* routes
 */

test.describe('Admin Access Control', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
  });

  test('Admin user sees Administração section and can access admin routes', async ({ page }) => {
    // Login as admin
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'admin123');
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL('**/dashboard');

    // Verify "Administração" section is visible in sidebar
    const adminSection = page.locator('text=Administração');
    await expect(adminSection).toBeVisible({ timeout: 10000 });

    // Test access to /admin/dashboard
    await page.goto('/admin/dashboard');
    await expect(page).toHaveURL(/\/admin\/dashboard/);
    await expect(page.locator('h1, h2').filter({ hasText: /dashboard|painel|admin/i })).toBeVisible();

    // Test access to /admin/users
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/admin\/users/);
    await expect(page.locator('h1, h2').filter({ hasText: /usuários|users/i })).toBeVisible();

    // Test access to /admin/settings
    await page.goto('/admin/settings');
    await expect(page).toHaveURL(/\/admin\/settings/);
    await expect(page.locator('h1, h2').filter({ hasText: /configurações|settings/i })).toBeVisible();
  });

  test('Non-admin user does not see Administração section', async ({ page }) => {
    // Login as regular user
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'user@test.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'user123');
    await page.click('button[type="submit"]');

    // Wait for navigation to dashboard
    await page.waitForURL('**/dashboard');

    // Verify "Administração" section is NOT visible
    const adminSection = page.locator('text=Administração');
    await expect(adminSection).not.toBeVisible();
  });

  test('Non-admin user is redirected from admin routes', async ({ page }) => {
    // Login as regular user
    await page.fill('input[type="email"]', process.env.TEST_USER_EMAIL || 'user@test.com');
    await page.fill('input[type="password"]', process.env.TEST_USER_PASSWORD || 'user123');
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
    // Login as admin
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'admin@test.com');
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'admin123');
    await page.click('button[type="submit"]');

    // Wait for dashboard
    await page.waitForURL('**/dashboard');

    // Find and click "Usuários" in admin section
    await page.locator('aside').locator('text=Usuários').click();
    await expect(page).toHaveURL(/\/admin\/users/);

    // Find and click "Configurações" in admin section
    await page.locator('aside').locator('text=Configurações').click();
    await expect(page).toHaveURL(/\/admin\/settings/);
  });
});
