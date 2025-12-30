/**
 * Smoke Tests - Quick validation that core functionality works
 * 
 * These tests should run fast and catch obvious regressions.
 * They are the first tests to run in CI.
 */

import { test, expect } from '@playwright/test';
import { TEST_CONFIG } from './test-config';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

test.describe('Smoke Tests', () => {
  test('Backend is reachable', async ({ request }) => {
    test.skip(!SUPABASE_URL, 'SUPABASE_URL not configured');
    
    const response = await request.get(`${SUPABASE_URL}/rest/v1/`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
      }
    });
    
    // Should return 200 or 401 (both indicate backend is up)
    expect([200, 401]).toContain(response.status());
  });

  test('Frontend loads login page', async ({ page }) => {
    await page.goto('/login');
    
    // Should have email input
    await expect(page.locator('input[type="email"]')).toBeVisible({ timeout: 10000 });
    
    // Should have password input
    await expect(page.locator('input[type="password"]')).toBeVisible();
    
    // Should have submit button
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('Frontend loads homepage', async ({ page }) => {
    await page.goto('/');
    
    // Should load without errors
    await page.waitForLoadState('networkidle');
    
    // Page should have content
    const body = await page.locator('body').textContent();
    expect(body).toBeTruthy();
  });

  test('Auth endpoints are accessible', async ({ request }) => {
    test.skip(!SUPABASE_URL, 'SUPABASE_URL not configured');
    
    // Test signup endpoint exists (even if it returns error for invalid data)
    const response = await request.post(`${SUPABASE_URL}/auth/v1/signup`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY!,
        'Content-Type': 'application/json',
      },
      data: {
        email: 'smoke-test@invalid',
        password: '123',
      },
    });
    
    // Should return 400/422 for invalid data, not 500 or unreachable
    expect([400, 422]).toContain(response.status());
  });

  test('Edge functions are reachable', async ({ request }) => {
    test.skip(!SUPABASE_URL, 'SUPABASE_URL not configured');
    
    // Test heartbeat endpoint (should reject without auth)
    const response = await request.post(`${SUPABASE_URL}/functions/v1/heartbeat`, {
      headers: {
        'Content-Type': 'application/json',
      },
      data: {},
    });
    
    // Should return 401 (needs auth), not 500 or unreachable
    expect([400, 401, 403]).toContain(response.status());
  });

  test('Static assets are served', async ({ page }) => {
    const response = await page.goto('/');
    
    // Main page should load
    expect(response?.status()).toBe(200);
    
    // Check favicon is accessible
    const faviconResponse = await page.request.get('/favicon.ico');
    expect([200, 204, 304]).toContain(faviconResponse.status());
  });
});

test.describe('Basic Navigation', () => {
  test('Login redirects unauthenticated users', async ({ page }) => {
    // Try to access protected route
    await page.goto('/admin/dashboard');
    
    // Should redirect to login
    await page.waitForURL(/\/(login|$)/, { timeout: 10000 });
    
    const url = page.url();
    expect(url.includes('login') || url.endsWith('/')).toBeTruthy();
  });

  test('Public routes are accessible', async ({ page }) => {
    const publicRoutes = ['/login', '/register'];
    
    for (const route of publicRoutes) {
      const response = await page.goto(route);
      expect(response?.status()).toBe(200);
    }
  });
});
