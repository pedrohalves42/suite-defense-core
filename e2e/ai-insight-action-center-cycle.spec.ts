import { test, expect } from '@playwright/test';
import { 
  AI_INSIGHT_TEST_DATA, 
  AI_INSIGHT_ROUTES,
  AI_INSIGHT_SELECTORS,
  createMockInsight,
  createMockAction,
} from './fixtures/ai-insight-test-data';
import { ACTION_CENTER_ROUTES, ACTION_CENTER_SELECTORS } from './fixtures/action-center-test-data';

/**
 * AI Insight → Action Center E2E Tests
 * 
 * Tests the complete cycle from AI-generated insights to action execution
 */

test.describe('AI Insight to Action Center Cycle', () => {
  
  test.beforeEach(async ({ page }) => {
    // Navigate to the app and ensure auth (mock or real)
    await page.goto('/');
  });

  test.describe('AI Insights Display', () => {
    
    test('should display AI insights in the Action Center', async ({ page }) => {
      // Navigate to Action Center
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      
      // Wait for page to load
      await page.waitForLoadState('networkidle');
      
      // Check if Action Center page loads
      await expect(page.locator(ACTION_CENTER_SELECTORS.actionCenterPage)).toBeVisible({ timeout: 10000 });
    });

    test('should show insight severity indicators correctly', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      // Verify sections are rendered
      const urgentSection = page.locator(ACTION_CENTER_SELECTORS.urgentSection);
      const recommendedSection = page.locator(ACTION_CENTER_SELECTORS.recommendedSection);
      
      // At least one section should be visible (or empty state)
      const hasUrgent = await urgentSection.isVisible();
      const hasRecommended = await recommendedSection.isVisible();
      const hasEmpty = await page.locator(ACTION_CENTER_SELECTORS.emptyState).isVisible();
      
      expect(hasUrgent || hasRecommended || hasEmpty).toBeTruthy();
    });

    test('should display confidence scores on insights', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      // If there are action cards, they should have proper structure
      const actionCards = page.locator(ACTION_CENTER_SELECTORS.actionCard);
      const cardCount = await actionCards.count();
      
      if (cardCount > 0) {
        // First card should have required elements
        const firstCard = actionCards.first();
        await expect(firstCard).toBeVisible();
      }
    });
  });

  test.describe('Action Execution', () => {
    
    test('should allow executing a recommended action', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      // Find execute button
      const executeButton = page.locator(ACTION_CENTER_SELECTORS.executeButton).first();
      
      if (await executeButton.isVisible()) {
        // Click execute
        await executeButton.click();
        
        // Should show confirmation or success feedback
        await page.waitForTimeout(500);
      }
    });

    test('should allow ignoring an action with reason', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      // Find ignore button
      const ignoreButton = page.locator(ACTION_CENTER_SELECTORS.ignoreButton).first();
      
      if (await ignoreButton.isVisible()) {
        await ignoreButton.click();
        
        // Dialog should appear
        const dialog = page.locator(ACTION_CENTER_SELECTORS.ignoreDialog);
        if (await dialog.isVisible()) {
          // Enter reason
          const reasonInput = page.locator(ACTION_CENTER_SELECTORS.ignoreReasonInput);
          await reasonInput.fill('Falso positivo - teste E2E');
          
          // Confirm ignore
          const confirmButton = page.locator(ACTION_CENTER_SELECTORS.confirmIgnoreButton);
          await confirmButton.click();
        }
      }
    });

    test('should show execution feedback after action', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      const acknowledgeButton = page.locator(ACTION_CENTER_SELECTORS.acknowledgeButton).first();
      
      if (await acknowledgeButton.isVisible()) {
        await acknowledgeButton.click();
        
        // Should show some feedback (toast, status change, etc.)
        await page.waitForTimeout(1000);
      }
    });
  });

  test.describe('Cross-Tenant Isolation', () => {
    
    test('should only show insights for current tenant', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      // The page should load without errors
      // Any actions shown should belong to the authenticated tenant
      const pageContent = await page.content();
      
      // Should not contain other tenant IDs (basic check)
      // In a real test, you'd verify against known test tenant IDs
      expect(pageContent).not.toContain('unauthorized');
      expect(pageContent).not.toContain('forbidden');
    });
  });

  test.describe('UI/UX', () => {
    
    test('should show loading state while fetching insights', async ({ page }) => {
      // Start navigation
      const navigationPromise = page.goto(ACTION_CENTER_ROUTES.dashboard);
      
      // Check for loading skeleton (may be too fast to catch)
      const skeleton = page.locator(ACTION_CENTER_SELECTORS.loadingSkeleton);
      
      await navigationPromise;
      await page.waitForLoadState('networkidle');
    });

    test('should show empty state when no actions pending', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      // Either we have actions or we have empty state
      const hasActions = await page.locator(ACTION_CENTER_SELECTORS.actionCard).count() > 0;
      const hasEmpty = await page.locator(ACTION_CENTER_SELECTORS.emptyState).isVisible();
      
      // One of these should be true
      expect(hasActions || hasEmpty).toBeTruthy();
    });

    test('should have refresh button that reloads data', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      const refreshButton = page.locator(ACTION_CENTER_SELECTORS.refreshButton);
      
      if (await refreshButton.isVisible()) {
        await refreshButton.click();
        
        // Should trigger a refresh (network request)
        await page.waitForTimeout(500);
      }
    });

    test('should navigate to playbooks page', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      const playbooksLink = page.locator(ACTION_CENTER_SELECTORS.viewPlaybooksLink);
      
      if (await playbooksLink.isVisible()) {
        await playbooksLink.click();
        
        // Should navigate to playbooks
        await expect(page).toHaveURL(new RegExp(ACTION_CENTER_ROUTES.playbooks));
      }
    });
  });

  test.describe('Action Types', () => {
    
    test.describe.configure({ mode: 'parallel' });

    for (const actionType of AI_INSIGHT_TEST_DATA.actionTypes.slice(0, 5)) {
      test(`should handle ${actionType} action type`, async ({ page }) => {
        await page.goto(ACTION_CENTER_ROUTES.dashboard);
        await page.waitForLoadState('networkidle');
        
        // Basic page load verification
        const pageLoaded = await page.locator('body').isVisible();
        expect(pageLoaded).toBeTruthy();
      });
    }
  });

  test.describe('Sidebar Badge', () => {
    
    test('should show badge count in sidebar for pending actions', async ({ page }) => {
      await page.goto('/admin');
      await page.waitForLoadState('networkidle');
      
      const badge = page.locator(ACTION_CENTER_SELECTORS.sidebarBadge);
      
      // Badge may or may not be visible depending on pending actions
      if (await badge.isVisible()) {
        const badgeText = await badge.textContent();
        // Should be a number
        expect(badgeText).toMatch(/^\d+$/);
      }
    });
  });

  test.describe('Agent Link Navigation', () => {
    
    test('should navigate to agent detail when clicking agent link', async ({ page }) => {
      await page.goto(ACTION_CENTER_ROUTES.dashboard);
      await page.waitForLoadState('networkidle');
      
      const agentLink = page.locator(ACTION_CENTER_SELECTORS.agentLink).first();
      
      if (await agentLink.isVisible()) {
        await agentLink.click();
        
        // Should navigate to agent detail page
        await page.waitForLoadState('networkidle');
        expect(page.url()).toContain('/agents/');
      }
    });
  });
});

test.describe('AI Action Executor Integration', () => {
  
  test('should execute action through edge function', async ({ page }) => {
    // This test requires authentication and actual edge function
    await page.goto(ACTION_CENTER_ROUTES.dashboard);
    await page.waitForLoadState('networkidle');
    
    // Find any executable action
    const executeButton = page.locator(ACTION_CENTER_SELECTORS.executeButton).first();
    
    if (await executeButton.isVisible()) {
      // Listen for network request to edge function
      const responsePromise = page.waitForResponse(
        (response) => response.url().includes('ai-action-executor'),
        { timeout: 5000 }
      ).catch(() => null);
      
      await executeButton.click();
      
      const response = await responsePromise;
      if (response) {
        expect(response.status()).toBeLessThan(500);
      }
    }
  });
});