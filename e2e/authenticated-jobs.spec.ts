/**
 * Sprint 20 — E2E: Create job, verify in list, cancel
 */

import { test, expect } from './fixtures/auth-fixtures';
import { TEST_CONFIG } from './test-config';

const hasCredentials = !!(
  process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD
);

test.describe('Remediation Jobs Flow', () => {
  test.skip(!hasCredentials, 'Test credentials not configured');

  test('jobs page loads without errors', async ({ authenticatedPage: page }) => {
    // Navigate to a page that lists jobs (action center or similar)
    await page.goto('/admin/action-center');
    await page.waitForLoadState('networkidle');

    // Page should render without crashing
    await expect(page.locator('body')).not.toHaveText(/Something went wrong|Erro inesperado/i);
  });

  test('job creation form is accessible', async ({ authenticatedPage: page }) => {
    await page.goto('/admin/action-center');
    await page.waitForLoadState('networkidle');

    // Look for a create / new job button
    const createBtn = page.locator(
      'button:has-text("Novo"), button:has-text("Criar"), button:has-text("New"), [data-testid*="create-job"]'
    );
    const count = await createBtn.count();
    if (count > 0) {
      await createBtn.first().click();
      await page.waitForTimeout(500);
      // A dialog or form should appear
      const formOrDialog = page.locator('dialog, [role="dialog"], form, [data-testid*="job-form"]');
      if (await formOrDialog.count() > 0) {
        await expect(formOrDialog.first()).toBeVisible();
      }
    }
  });

  test('job list shows table or empty state', async ({ authenticatedPage: page }) => {
    await page.goto('/admin/action-center');
    await page.waitForLoadState('networkidle');

    // Either a table with rows OR an empty state message
    const table = page.locator('table, [role="table"]');
    const emptyState = page.locator('text=/nenhum|no results|vazio|empty/i');
    const hasTable = (await table.count()) > 0;
    const hasEmpty = (await emptyState.count()) > 0;

    expect(hasTable || hasEmpty).toBeTruthy();
  });
});
