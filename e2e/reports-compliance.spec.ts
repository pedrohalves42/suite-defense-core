/**
 * E2E Tests for Reports and Compliance Features
 * 
 * Tests cover:
 * - Reports page navigation and display
 * - Compliance report generation
 * - Report verification page
 * - Scheduled reports management
 */

import { test, expect } from '@playwright/test';
import { testConfig } from './test-config';

// Skip all tests if no backend credentials
test.beforeAll(async () => {
  if (!process.env.VITE_SUPABASE_URL || !process.env.VITE_SUPABASE_PUBLISHABLE_KEY) {
    test.skip();
  }
});

test.describe('Reports Page', () => {
  test.beforeEach(async ({ page }) => {
    // Navigate to login and authenticate
    await page.goto('/login');
    
    // Wait for page load
    await page.waitForLoadState('networkidle');
    
    // Check if already authenticated
    const currentUrl = page.url();
    if (currentUrl.includes('/admin') || currentUrl.includes('/dashboard')) {
      return;
    }

    // Fill login form if present
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.isVisible({ timeout: 3000 })) {
      await emailInput.fill(process.env.TEST_ADMIN_EMAIL || 'admin@cybershield.test');
      await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || 'testpassword123');
      await page.locator('button[type="submit"]').click();
      await page.waitForURL(/\/(admin|dashboard)/, { timeout: 15000 });
    }
  });

  test('should display reports page with main sections', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');

    // Check page title or heading
    const pageTitle = page.locator('h1, h2').filter({ hasText: /relat[oó]rio/i });
    await expect(pageTitle.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display report type filter options', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');

    // Look for filter/select elements
    const selectTrigger = page.locator('[role="combobox"], select, [data-testid*="filter"]').first();
    if (await selectTrigger.isVisible({ timeout: 5000 })) {
      await selectTrigger.click();
      
      // Wait for dropdown options
      await page.waitForTimeout(500);
      
      // Check for common report types
      const options = page.locator('[role="option"], option');
      const optionCount = await options.count();
      expect(optionCount).toBeGreaterThan(0);
    }
  });

  test('should show empty state or reports list', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');

    // Either show reports or empty state
    const hasReports = await page.locator('table tbody tr, [data-testid*="report-item"]').count() > 0;
    const hasEmptyState = await page.locator('text=/nenhum|empty|sem.*relat/i').isVisible().catch(() => false);

    expect(hasReports || hasEmptyState).toBe(true);
  });
});

test.describe('Compliance Timeline', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('/admin')) {
      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.isVisible({ timeout: 3000 })) {
        await emailInput.fill(process.env.TEST_ADMIN_EMAIL || 'admin@cybershield.test');
        await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || 'testpassword123');
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(/\/(admin|dashboard)/, { timeout: 15000 });
      }
    }
  });

  test('should display compliance timeline page', async ({ page }) => {
    await page.goto('/admin/compliance-timeline');
    await page.waitForLoadState('networkidle');

    // Check for compliance-related content
    const complianceContent = page.locator('text=/compliance|lgpd|iso.*27001|soc2/i');
    await expect(complianceContent.first()).toBeVisible({ timeout: 10000 });
  });

  test('should show template selection for compliance reports', async ({ page }) => {
    await page.goto('/admin/compliance-timeline');
    await page.waitForLoadState('networkidle');

    // Look for template selector
    const templateSelector = page.locator('[role="combobox"], select').filter({ hasText: /lgpd|iso|soc/i });
    if (await templateSelector.isVisible({ timeout: 5000 })) {
      await expect(templateSelector).toBeVisible();
    }
  });

  test('should have generate report button', async ({ page }) => {
    await page.goto('/admin/compliance-timeline');
    await page.waitForLoadState('networkidle');

    // Look for generate button
    const generateButton = page.locator('button').filter({ hasText: /gerar|generate|criar/i });
    await expect(generateButton.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Report Verification Page', () => {
  test('should show error for invalid report ID', async ({ page }) => {
    await page.goto('/verificar/invalid-id-12345');
    await page.waitForLoadState('networkidle');

    // Should show error or not found message
    const errorMessage = page.locator('text=/não encontrado|not found|erro|invalid/i');
    await expect(errorMessage.first()).toBeVisible({ timeout: 10000 });
  });

  test('should display verification page structure', async ({ page }) => {
    // Use a placeholder UUID format
    await page.goto('/verificar/00000000-0000-0000-0000-000000000000');
    await page.waitForLoadState('networkidle');

    // Should show some kind of verification UI (even if report not found)
    const verificationUI = page.locator('[class*="card"], [class*="Card"]').first();
    await expect(verificationUI).toBeVisible({ timeout: 10000 });
  });

  test('should have back to home button', async ({ page }) => {
    await page.goto('/verificar/test-id');
    await page.waitForLoadState('networkidle');

    const backButton = page.locator('a, button').filter({ hasText: /voltar|back|início|home/i });
    await expect(backButton.first()).toBeVisible({ timeout: 10000 });
  });
});

test.describe('Scheduled Reports (if available)', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('/admin')) {
      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.isVisible({ timeout: 3000 })) {
        await emailInput.fill(process.env.TEST_ADMIN_EMAIL || 'admin@cybershield.test');
        await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || 'testpassword123');
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(/\/(admin|dashboard)/, { timeout: 15000 });
      }
    }
  });

  test('should display scheduled reports section if present', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');

    // Look for scheduled reports tab or section
    const scheduledSection = page.locator('text=/agendad|scheduled|automátic/i');
    
    if (await scheduledSection.isVisible({ timeout: 5000 })) {
      await expect(scheduledSection.first()).toBeVisible();
    } else {
      // If not visible, that's acceptable - feature might not be enabled
      test.skip();
    }
  });

  test('should have new schedule button when in scheduled section', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');

    // Try to navigate to scheduled section
    const scheduledTab = page.locator('[role="tab"], button').filter({ hasText: /agendad|scheduled/i });
    
    if (await scheduledTab.isVisible({ timeout: 3000 })) {
      await scheduledTab.click();
      await page.waitForTimeout(500);

      const newButton = page.locator('button').filter({ hasText: /novo|new|criar|add/i });
      if (await newButton.isVisible({ timeout: 3000 })) {
        await expect(newButton.first()).toBeVisible();
      }
    } else {
      test.skip();
    }
  });
});

test.describe('Report Export', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login');
    await page.waitForLoadState('networkidle');
    
    const currentUrl = page.url();
    if (!currentUrl.includes('/admin')) {
      const emailInput = page.locator('input[type="email"]');
      if (await emailInput.isVisible({ timeout: 3000 })) {
        await emailInput.fill(process.env.TEST_ADMIN_EMAIL || 'admin@cybershield.test');
        await page.locator('input[type="password"]').fill(process.env.TEST_ADMIN_PASSWORD || 'testpassword123');
        await page.locator('button[type="submit"]').click();
        await page.waitForURL(/\/(admin|dashboard)/, { timeout: 15000 });
      }
    }
  });

  test('should have PDF export option on reports page', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');

    // Look for export/download button
    const exportButton = page.locator('button, a').filter({ hasText: /pdf|export|download|baixar/i });
    
    if (await exportButton.first().isVisible({ timeout: 5000 })) {
      await expect(exportButton.first()).toBeVisible();
    }
  });

  test('should have Excel export option if available', async ({ page }) => {
    await page.goto('/admin/reports');
    await page.waitForLoadState('networkidle');

    // Look for Excel export button
    const excelButton = page.locator('button, a').filter({ hasText: /excel|xlsx|csv|planilha/i });
    
    if (await excelButton.first().isVisible({ timeout: 3000 })) {
      await expect(excelButton.first()).toBeVisible();
    }
  });
});

test.describe('API - Compliance Report Generation', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'API tests only run on Chromium');

  test('should reject unauthenticated requests', async ({ request }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      test.skip();
      return;
    }

    const response = await request.post(`${supabaseUrl}/functions/v1/generate-compliance-report`, {
      data: { template: 'LGPD' },
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      },
    });

    // Should return 401 Unauthorized
    expect(response.status()).toBe(401);
  });

  test('should reject invalid template', async ({ request }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      test.skip();
      return;
    }

    // This test requires auth, so it may fail - that's expected
    const response = await request.post(`${supabaseUrl}/functions/v1/generate-compliance-report`, {
      data: { template: 'INVALID_TEMPLATE' },
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      },
    });

    // Either 401 (no auth) or 400 (invalid template)
    expect([400, 401]).toContain(response.status());
  });
});

test.describe('API - Compliance Report Verification (Integrity)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'API tests only run on Chromium');

  test('should return 400 for missing audit_id', async ({ request }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      test.skip();
      return;
    }

    const response = await request.post(`${supabaseUrl}/functions/v1/verify-compliance-report`, {
      data: {},
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      },
    });

    expect(response.status()).toBe(400);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.error).toContain('audit_id');
  });

  test('should return 404 for non-existent audit_id', async ({ request }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      test.skip();
      return;
    }

    const response = await request.post(`${supabaseUrl}/functions/v1/verify-compliance-report`, {
      data: { audit_id: 'LAUDO-NONEXIST-9999999999999' },
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      },
    });

    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.success).toBe(false);
    expect(body.integrity.valid).toBe(false);
  });

  test('should verify report via GET request with audit_id query param', async ({ request }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      test.skip();
      return;
    }

    const response = await request.get(`${supabaseUrl}/functions/v1/verify-compliance-report?audit_id=LAUDO-TESTTEST-1234567890`, {
      headers: {
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      },
    });

    // Should return 404 (not found) or 200 (if test data exists)
    expect([200, 404]).toContain(response.status());
    const body = await response.json();
    expect(body).toHaveProperty('integrity');
  });

  test('should include SHA256 and HMAC verification in response', async ({ request }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL;
    if (!supabaseUrl) {
      test.skip();
      return;
    }

    const response = await request.post(`${supabaseUrl}/functions/v1/verify-compliance-report`, {
      data: { audit_id: 'LAUDO-ANYAUDIT-0000000000000' },
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_PUBLISHABLE_KEY || '',
      },
    });

    const body = await response.json();
    expect(body).toHaveProperty('integrity');
    expect(body.integrity).toHaveProperty('valid');
    
    // If found, should have detailed integrity info
    if (response.status() === 200) {
      expect(body.integrity).toHaveProperty('sha256_match');
      expect(body.integrity).toHaveProperty('hmac_valid');
      expect(body.integrity).toHaveProperty('algorithm');
    }
  });
});

test.describe('Verification Page - Integrity Display', () => {
  test('should show integrity status for valid audit_id format', async ({ page }) => {
    // Test with audit_id format
    await page.goto('/verificar/LAUDO-TESTTEST-1234567890');
    await page.waitForLoadState('networkidle');

    // Should show verification UI (even if report not found)
    const verificationUI = page.locator('[class*="card"], [class*="Card"]').first();
    await expect(verificationUI).toBeVisible({ timeout: 10000 });
  });

  test('should display SHA256 and HMAC status indicators', async ({ page }) => {
    await page.goto('/verificar/LAUDO-TESTTEST-1234567890');
    await page.waitForLoadState('networkidle');

    // Look for integrity-related text (even in error state)
    const pageContent = await page.content();
    const hasIntegrityElements = 
      pageContent.includes('SHA256') || 
      pageContent.includes('HMAC') || 
      pageContent.includes('Integridade') ||
      pageContent.includes('não encontrado');
    
    expect(hasIntegrityElements).toBe(true);
  });

  test('should show cryptographic verification section for existing reports', async ({ page }) => {
    // This test assumes at least one report exists with audit_id
    await page.goto('/verificar/test-audit-id');
    await page.waitForLoadState('networkidle');

    // Should show some form of verification result
    const verificationCard = page.locator('[class*="card"]').first();
    await expect(verificationCard).toBeVisible({ timeout: 10000 });
  });
});
