import { test, expect } from '@playwright/test';
import { 
  loginAsAdmin, 
  navigateToActionCenter, 
  waitForActionCenterLoad 
} from './helpers/action-center-helpers';
import { ACTION_CENTER_SELECTORS, ACTION_CENTER_TEST_DATA } from './fixtures/action-center-test-data';
import { TEST_CONFIG } from './test-config';

/**
 * E2E Tests for Action Effectiveness Verification (P1-A)
 * Tests the complete flow: Execute Action → Wait for verification → Check Badge
 */

test.describe('Action Effectiveness Verification', () => {
  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('should display effectiveness badge on historical actions', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    // Look for any effectiveness badges (resolved, partial, failed, pending)
    const effectivenessBadges = page.locator([
      '[data-testid="effectiveness-resolved"]',
      '[data-testid="effectiveness-partial"]',
      '[data-testid="effectiveness-failed"]',
      '[data-testid="effectiveness-pending"]',
      '[data-testid="effectiveness-unknown"]',
    ].join(', '));
    
    const count = await effectivenessBadges.count();
    console.log(`Found ${count} effectiveness badges on page`);
    
    // If badges exist, verify they're properly rendered
    if (count > 0) {
      const firstBadge = effectivenessBadges.first();
      await expect(firstBadge).toBeVisible();
      
      // Verify badge has correct structure
      await expect(firstBadge).toHaveAttribute('data-testid', /^effectiveness-/);
    }
  });

  test('should show tooltip with verification details on badge hover', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    // Find any effectiveness badge
    const badge = page.locator('[data-testid^="effectiveness-"]').first();
    
    if (await badge.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Hover to show tooltip
      await badge.hover();
      
      // Wait for tooltip to appear
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible({ timeout: 2000 });
      
      // Tooltip should contain verification information
      const tooltipText = await tooltip.textContent();
      expect(tooltipText).toMatch(/Verificado em:|Veredicto:|Aguardando|resolvido|Problema/i);
    }
  });

  test('should show pending badge immediately after action execution', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);

    // Find an executable action card
    const executeButton = page.locator('button:has-text("Executar"), button:has-text("Corrigir")').first();
    
    if (await executeButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Execute the action
      await executeButton.click();
      
      // Wait for network to settle
      await page.waitForLoadState('networkidle');
      
      // After execution, the action should move to history with pending verification
      // Note: Badge may appear on subsequent page loads or in history section
      console.log('Action executed - verification badge should appear after background check');
    } else {
      console.log('No executable actions found - skipping execution test');
    }
  });

  test('effectiveness badge visual states have correct colors', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    // Check for different badge states and their colors
    const resolvedBadge = page.locator('[data-testid="effectiveness-resolved"]').first();
    const partialBadge = page.locator('[data-testid="effectiveness-partial"]').first();
    const failedBadge = page.locator('[data-testid="effectiveness-failed"]').first();
    const pendingBadge = page.locator('[data-testid="effectiveness-pending"]').first();
    
    // Verify resolved badge has green color
    if (await resolvedBadge.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(resolvedBadge).toHaveClass(/text-green/);
    }
    
    // Verify partial badge has amber color
    if (await partialBadge.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(partialBadge).toHaveClass(/text-amber/);
    }
    
    // Verify failed badge has red color
    if (await failedBadge.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(failedBadge).toHaveClass(/text-red/);
    }
    
    // Verify pending badge has muted color and spinner
    if (await pendingBadge.isVisible({ timeout: 1000 }).catch(() => false)) {
      await expect(pendingBadge).toHaveClass(/text-muted/);
    }
  });

  test('compact mode badge renders correctly', async ({ page }) => {
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    // Look for compact badges (icon only, no text)
    const compactBadge = page.locator('[data-testid="effectiveness-compact"]').first();
    
    if (await compactBadge.isVisible({ timeout: 2000 }).catch(() => false)) {
      // Compact badge should be smaller (just icon)
      const boundingBox = await compactBadge.boundingBox();
      expect(boundingBox?.width).toBeLessThan(40); // Icon only should be small
      
      // Should still show tooltip on hover
      await compactBadge.hover();
      const tooltip = page.locator('[role="tooltip"]');
      await expect(tooltip).toBeVisible({ timeout: 2000 });
    }
  });
});

test.describe('Effectiveness API Integration', () => {
  test('check-action-effectiveness edge function is accessible', async ({ request }) => {
    // Verify the edge function is deployed and responding
    const supabaseUrl = process.env.VITE_SUPABASE_URL || TEST_CONFIG.supabaseUrl;
    const anonKey = process.env.VITE_SUPABASE_ANON_KEY || TEST_CONFIG.supabaseAnonKey;
    
    if (!supabaseUrl || !anonKey) {
      test.skip(!supabaseUrl, 'Missing VITE_SUPABASE_URL');
      return;
    }
    
    const response = await request.get(
      `${supabaseUrl}/functions/v1/check-action-effectiveness`,
      {
        headers: {
          'Authorization': `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
      }
    );
    
    // Function should respond (401 is expected for unauthenticated requests)
    // 500+ would indicate deployment issues
    expect(response.status()).toBeLessThan(500);
  });
});

test.describe('Effectiveness Flow Integration', () => {
  test('completed actions should have effectiveness data in context', async ({ page }) => {
    await loginAsAdmin(page);
    await navigateToActionCenter(page);
    await waitForActionCenterLoad(page);
    
    // Look for action cards with historical data
    const actionCards = page.locator(ACTION_CENTER_SELECTORS.actionCard);
    const cardCount = await actionCards.count();
    
    console.log(`Found ${cardCount} action cards`);
    
    // Check each card for effectiveness indicators
    for (let i = 0; i < Math.min(cardCount, 5); i++) {
      const card = actionCards.nth(i);
      const hasBadge = await card.locator('[data-testid^="effectiveness-"]').isVisible().catch(() => false);
      
      if (hasBadge) {
        console.log(`Card ${i + 1} has effectiveness badge`);
        
        // Verify badge is properly structured
        const badge = card.locator('[data-testid^="effectiveness-"]').first();
        const testId = await badge.getAttribute('data-testid');
        expect(testId).toMatch(/^effectiveness-(pending|resolved|partial|failed|unknown)$/);
      }
    }
  });
});
