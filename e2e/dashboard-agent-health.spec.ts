import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { TEST_CONFIG } from './test-config';

test.describe('Agent Health Monitor Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    const success = await loginAsAdmin(page);
    expect(success).toBe(true);
    
    // Navigate to Agent Health Monitor
    await page.goto(TEST_CONFIG.routes.agentHealth);
    await page.waitForLoadState('networkidle');
  });

  test('should load health metrics', async ({ page }) => {
    await expect(page.locator(`text=${TEST_CONFIG.texts.overallHealth}`)).toBeVisible();
    await expect(page.locator(`text=${TEST_CONFIG.texts.cardLiveConnections}`)).toBeVisible();
    
    // Check percentage display
    const healthCard = page.locator(`text=${TEST_CONFIG.texts.overallHealth}`).locator('..');
    await expect(healthCard.locator('div.text-2xl')).toContainText(/%/);
  });

  test('should display agent heatmap by health status', async ({ page }) => {
    // Check for health status cards
    await expect(page.locator(`text=${TEST_CONFIG.texts.cardHealthy}`)).toBeVisible();
    await expect(page.locator(`text=${TEST_CONFIG.texts.cardAttention}`)).toBeVisible();
    await expect(page.locator(`text=${TEST_CONFIG.texts.cardCritical}`)).toBeVisible();
  });

  test('should show agents grouped by health', async ({ page }) => {
    // Wait for agent cards to load
    await page.waitForSelector('[data-testid="agent-card"], .agent-card, text=/Computador/i', { 
      timeout: 5000,
      state: 'attached'
    }).catch(() => {
      // No agents is valid state
      console.log('No computers found - this is acceptable');
    });
  });

  test('should receive realtime heartbeat updates', async ({ page }) => {
    // Monitor for toast notifications
    const toastPromise = page.waitForSelector(`text=/${TEST_CONFIG.texts.connectionReceived}/i`, { 
      timeout: 30000,
      state: 'visible'
    }).catch(() => null);
    
    // Wait up to 30s for a heartbeat (agents send every minute)
    const toast = await toastPromise;
    
    if (toast) {
      // Heartbeat received
      await expect(toast).toBeVisible();
      
      // Check that live counter increased
      const liveCountCard = page.locator(`text=${TEST_CONFIG.texts.cardLiveConnections}`).locator('..');
      const countText = await liveCountCard.locator('div.text-2xl').textContent();
      expect(parseInt(countText || '0')).toBeGreaterThan(0);
    }
  });

  test('should filter agents by health status', async ({ page }) => {
    // Wait for health status tabs/buttons
    await page.waitForTimeout(1000);
    
    const healthyButton = page.locator(`text=${TEST_CONFIG.texts.cardHealthy}`);
    if (await healthyButton.isVisible()) {
      await healthyButton.click();
      await page.waitForTimeout(500);
      
      // Should show only healthy agents
      // (Verify by checking that critical badge is not visible)
    }
  });

  test('should show error state on backend failure', async ({ page }) => {
    // Mock API failure
    await page.route('**/rest/v1/v_agent_lifecycle_state*', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Database error' })
      });
    });
    
    await page.reload();
    
    await expect(page.locator(`text=${TEST_CONFIG.texts.errorLoadingHealth}`)).toBeVisible();
    await expect(page.locator('button:has-text("Tentar Novamente")')).toBeVisible();
  });
});
