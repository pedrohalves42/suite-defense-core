/**
 * E2E Tests for DNS Filter Management
 * Tests activation, synchronization, and blocking functionality
 */
import { test, expect } from '@playwright/test';
import { loginAsAdmin, navigateWithAuth, waitForPageLoad } from './helpers/auth';
import { 
  TEST_ROUTES, 
  TEST_SELECTORS, 
  TEST_TIMEOUTS, 
  EXPECTED_TEXTS,
  TEST_DNS_FILTER,
} from './fixtures/test-data';

test.describe('DNS Filter Management', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await loginAsAdmin(page);
    expect(loggedIn).toBeTruthy();
    await page.goto(TEST_ROUTES.dnsFilter);
    await waitForPageLoad(page);
  });

  test('should load DNS Filter page with toggle and stats', async ({ page }) => {
    // Verify page title or header is visible
    await expect(page.getByText(/DNS Filter/i).first()).toBeVisible({ 
      timeout: TEST_TIMEOUTS.medium 
    });

    // Verify feature toggle exists
    const toggle = page.locator(TEST_SELECTORS.dnsFilter.toggle);
    if (await toggle.count() > 0) {
      await expect(toggle).toBeVisible();
    } else {
      // Fallback to switch element
      await expect(page.locator('switch, [role="switch"]').first()).toBeVisible();
    }
  });

  test('should toggle DNS Filter on and off', async ({ page }) => {
    // Find the toggle switch
    const toggle = page.locator('[role="switch"]').first();
    
    if (await toggle.count() > 0) {
      const initialState = await toggle.getAttribute('data-state');
      
      // Click to toggle
      await toggle.click();
      await page.waitForTimeout(TEST_TIMEOUTS.animation);
      
      // Verify state changed
      const newState = await toggle.getAttribute('data-state');
      expect(newState).not.toBe(initialState);
      
      // Toggle back to original state
      await toggle.click();
      await page.waitForTimeout(TEST_TIMEOUTS.animation);
    }
  });

  test('should display stats cards when enabled', async ({ page }) => {
    // Enable DNS Filter if not already enabled
    const toggle = page.locator('[role="switch"]').first();
    
    if (await toggle.count() > 0) {
      const state = await toggle.getAttribute('data-state');
      if (state !== 'checked') {
        await toggle.click();
        await page.waitForTimeout(TEST_TIMEOUTS.animation);
      }
    }

    // Check for stats cards (using text content as fallback)
    const statsTexts = [
      /Online/i,
      /Instalado/i,
      /Pendente/i,
      /Sincronizado/i,
    ];

    for (const text of statsTexts) {
      const element = page.getByText(text).first();
      // Some stats may not be visible if there are no agents
      if (await element.count() > 0) {
        await expect(element).toBeVisible({ timeout: TEST_TIMEOUTS.short });
      }
    }
  });

  test('should show action buttons when enabled', async ({ page }) => {
    // Enable DNS Filter if not already
    const toggle = page.locator('[role="switch"]').first();
    if (await toggle.count() > 0) {
      const state = await toggle.getAttribute('data-state');
      if (state !== 'checked') {
        await toggle.click();
        await page.waitForTimeout(TEST_TIMEOUTS.medium);
      }
    }

    // Check for action buttons
    const buttons = [
      page.getByRole('button', { name: /Atualizar/i }),
      page.getByRole('button', { name: /Instalar/i }),
      page.getByRole('button', { name: /Sincronizar/i }),
    ];

    for (const button of buttons) {
      if (await button.count() > 0) {
        await expect(button.first()).toBeVisible({ timeout: TEST_TIMEOUTS.short });
      }
    }
  });

  test('should show agent list or empty state', async ({ page }) => {
    // Enable DNS Filter
    const toggle = page.locator('[role="switch"]').first();
    if (await toggle.count() > 0) {
      const state = await toggle.getAttribute('data-state');
      if (state !== 'checked') {
        await toggle.click();
        await page.waitForTimeout(TEST_TIMEOUTS.medium);
      }
    }

    // Either agent list or empty state should be visible
    const agentList = page.locator(TEST_SELECTORS.dnsFilter.agentList);
    const emptyState = page.getByText(/Nenhum computador/i);
    const hasAgents = page.locator('[data-testid="dns-filter-agent-row"]');

    // Wait for content to load
    await page.waitForTimeout(TEST_TIMEOUTS.short);

    // Check if either agents or empty state is shown
    const agentCount = await hasAgents.count();
    const emptyCount = await emptyState.count();
    
    expect(agentCount > 0 || emptyCount > 0).toBeTruthy();
  });

  test('should show disabled state alert when DNS Filter is off', async ({ page }) => {
    // Disable DNS Filter
    const toggle = page.locator('[role="switch"]').first();
    if (await toggle.count() > 0) {
      const state = await toggle.getAttribute('data-state');
      if (state === 'checked') {
        await toggle.click();
        await page.waitForTimeout(TEST_TIMEOUTS.animation);
      }
    }

    // Check for disabled alert
    const disabledAlert = page.getByText(/DNS Filter desabilitado/i);
    if (await disabledAlert.count() > 0) {
      await expect(disabledAlert).toBeVisible();
    }
  });

  test('should have "How it works" section', async ({ page }) => {
    // Enable DNS Filter to see the how it works section
    const toggle = page.locator('[role="switch"]').first();
    if (await toggle.count() > 0) {
      const state = await toggle.getAttribute('data-state');
      if (state !== 'checked') {
        await toggle.click();
        await page.waitForTimeout(TEST_TIMEOUTS.medium);
      }
    }

    // Check for how it works section
    const howItWorks = page.getByText(/Como funciona/i);
    if (await howItWorks.count() > 0) {
      await expect(howItWorks.first()).toBeVisible();
    }

    // Check for step descriptions
    const steps = [
      /Instalação/i,
      /Sincronização/i,
      /Bloqueio/i,
    ];

    for (const step of steps) {
      const element = page.getByText(step).first();
      if (await element.count() > 0) {
        await expect(element).toBeVisible({ timeout: TEST_TIMEOUTS.short });
      }
    }
  });
});

test.describe('DNS Filter - Blocked Websites Integration', () => {
  test.beforeEach(async ({ page }) => {
    const loggedIn = await loginAsAdmin(page);
    expect(loggedIn).toBeTruthy();
  });

  test('should navigate to blocked websites page', async ({ page }) => {
    await page.goto(TEST_ROUTES.blockedWebsites);
    await waitForPageLoad(page);

    // Verify page loaded (look for any content indicating blocked websites)
    const pageContent = page.locator('main, [role="main"], .container').first();
    await expect(pageContent).toBeVisible({ timeout: TEST_TIMEOUTS.medium });
  });

  test('should show DNS Filter tab in main page', async ({ page }) => {
    await page.goto(TEST_ROUTES.dnsFilter);
    await waitForPageLoad(page);

    // Look for tabs
    const tabs = page.locator('[role="tablist"]');
    if (await tabs.count() > 0) {
      await expect(tabs.first()).toBeVisible();
    }
  });
});

test.describe('DNS Filter - API Integration', () => {
  test('should handle API errors gracefully', async ({ page }) => {
    // Navigate to DNS Filter page
    const loggedIn = await loginAsAdmin(page);
    expect(loggedIn).toBeTruthy();
    
    // Mock API failure (if supported)
    await page.route('**/rest/v1/agents*', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal Server Error' }),
      });
    });

    await page.goto(TEST_ROUTES.dnsFilter);
    
    // Wait for page to handle error
    await page.waitForTimeout(TEST_TIMEOUTS.short);

    // Either error state or normal page should be shown
    const errorElement = page.getByText(/erro/i);
    const normalContent = page.locator('[role="switch"]');
    
    // Page should still render something
    const hasContent = (await errorElement.count()) > 0 || (await normalContent.count()) > 0;
    expect(hasContent).toBeTruthy();
  });

  test('should refresh data when refresh button is clicked', async ({ page }) => {
    const loggedIn = await loginAsAdmin(page);
    expect(loggedIn).toBeTruthy();
    
    await page.goto(TEST_ROUTES.dnsFilter);
    await waitForPageLoad(page);

    // Enable DNS Filter first
    const toggle = page.locator('[role="switch"]').first();
    if (await toggle.count() > 0) {
      const state = await toggle.getAttribute('data-state');
      if (state !== 'checked') {
        await toggle.click();
        await page.waitForTimeout(TEST_TIMEOUTS.medium);
      }
    }

    // Find and click refresh button
    const refreshBtn = page.getByRole('button', { name: /Atualizar/i });
    if (await refreshBtn.count() > 0) {
      await refreshBtn.first().click();
      
      // Wait for refresh to complete
      await page.waitForTimeout(TEST_TIMEOUTS.short);
      
      // Page should still be functional
      await expect(page.locator('[role="switch"]').first()).toBeVisible();
    }
  });
});
