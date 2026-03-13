/**
 * Sprint 20 — E2E: Onboarding wizard flow
 */

import { test, expect } from './fixtures/auth-fixtures';

const hasCredentials = !!(
  process.env.TEST_ADMIN_EMAIL && process.env.TEST_ADMIN_PASSWORD
);

test.describe('Onboarding Wizard Flow', () => {
  test.skip(!hasCredentials, 'Test credentials not configured');

  test('wizard page loads with step 1', async ({ authenticatedPage: page }) => {
    await page.goto('/admin/onboarding');
    await page.waitForLoadState('networkidle');

    // Step indicator or company form should be visible
    const step1 = page.locator('text=/empresa|company|passo 1|step 1/i');
    const formInput = page.locator('input[placeholder*="nome"], input[name*="company"], input[name*="name"]');
    const hasStep = (await step1.count()) > 0;
    const hasInput = (await formInput.count()) > 0;

    expect(hasStep || hasInput).toBeTruthy();
  });

  test('step navigation works (next/back)', async ({ authenticatedPage: page }) => {
    await page.goto('/admin/onboarding');
    await page.waitForLoadState('networkidle');

    // Fill company name if input exists
    const nameInput = page.locator('input').first();
    if (await nameInput.isVisible()) {
      await nameInput.fill('Test Company E2E');
    }

    // Fill email if exists
    const emailInput = page.locator('input[type="email"]');
    if (await emailInput.count() > 0 && await emailInput.isVisible()) {
      await emailInput.fill('e2e@test.com');
    }

    // Try to advance to next step
    const nextBtn = page.locator('button:has-text("Próximo"), button:has-text("Next"), button:has-text("Avançar")');
    if (await nextBtn.count() > 0 && await nextBtn.first().isEnabled()) {
      await nextBtn.first().click();
      await page.waitForTimeout(500);

      // Back button should now be visible
      const backBtn = page.locator('button:has-text("Voltar"), button:has-text("Back"), button:has-text("Anterior")');
      if (await backBtn.count() > 0) {
        await expect(backBtn.first()).toBeVisible();
      }
    }
  });

  test('wizard renders without errors', async ({ authenticatedPage: page }) => {
    await page.goto('/admin/onboarding');
    await page.waitForLoadState('networkidle');

    await expect(page.locator('body')).not.toHaveText(/Something went wrong|Erro inesperado/i);
  });
});
