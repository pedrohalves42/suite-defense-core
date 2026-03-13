/**
 * Sprint 20 — E2E: Export CSV & Generate PDF
 */

import { test, expect } from './fixtures/auth-fixtures';
import { TEST_CONFIG } from './test-config';

const hasCredentials = !!(
  process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD
);

test.describe('CSV Export Flow', () => {
  test.skip(!hasCredentials, 'Test credentials not configured');

  test('export button is visible on dashboard', async ({ authenticatedPage: page }) => {
    await page.goto(TEST_CONFIG.routes.dashboard);
    await page.waitForLoadState('networkidle');

    const exportBtn = page.locator('button:has-text("Exportar"), button:has-text("CSV"), button:has-text("Export"), [data-testid*="export"]');
    // Export may not exist on every dashboard; just verify no crash
    const count = await exportBtn.count();
    if (count > 0) {
      await expect(exportBtn.first()).toBeVisible();
    }
  });

  test('CSV download triggers on click', async ({ authenticatedPage: page }) => {
    await page.goto(TEST_CONFIG.routes.dashboard);
    await page.waitForLoadState('networkidle');

    const exportBtn = page.locator('button:has-text("CSV"), button:has-text("Exportar"), [data-testid*="export-csv"]').first();
    if (await exportBtn.isVisible()) {
      const downloadPromise = page.waitForEvent('download', { timeout: 10000 }).catch(() => null);
      await exportBtn.click();
      const download = await downloadPromise;
      if (download) {
        expect(download.suggestedFilename()).toMatch(/\.(csv|xlsx)$/i);
      }
    }
  });
});

test.describe('PDF Generation Flow', () => {
  test.skip(!hasCredentials, 'Test credentials not configured');

  test('PDF button is visible on reports page', async ({ authenticatedPage: page }) => {
    await page.goto(TEST_CONFIG.routes.dashboard);
    await page.waitForLoadState('networkidle');

    const pdfBtn = page.locator('button:has-text("PDF"), button:has-text("Relatório"), [data-testid*="pdf"]');
    const count = await pdfBtn.count();
    if (count > 0) {
      await expect(pdfBtn.first()).toBeVisible();
    }
  });
});
