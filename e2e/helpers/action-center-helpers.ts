import { Page, expect } from '@playwright/test';
import { ACTION_CENTER_ROUTES } from '../fixtures/action-center-test-data';
import { TEST_CONFIG } from '../test-config';

/**
 * Helper functions for Action Center E2E tests
 */

/**
 * Login as admin user
 */
export async function loginAsAdmin(page: Page): Promise<void> {
  await page.goto(TEST_CONFIG.routes.login);
  
  // Wait for login form
  await page.waitForSelector('input[type="email"]', { timeout: 10000 });
  
  // Fill credentials
  await page.fill('input[type="email"]', TEST_CONFIG.credentials.email);
  await page.fill('input[type="password"]', TEST_CONFIG.credentials.password);
  
  // Submit form
  await page.click('button[type="submit"]');
  
  // Wait for navigation to dashboard
  await page.waitForURL(/\/admin|\/dashboard/, { timeout: 15000 });
}

/**
 * Navigate to Action Center dashboard
 */
export async function navigateToActionCenter(page: Page): Promise<void> {
  await page.goto(ACTION_CENTER_ROUTES.dashboard);
  await page.waitForLoadState('networkidle');
}

/**
 * Navigate to Playbooks page
 */
export async function navigateToPlaybooks(page: Page): Promise<void> {
  await page.goto(ACTION_CENTER_ROUTES.playbooks);
  await page.waitForLoadState('networkidle');
}

/**
 * Wait for action center feed to load
 */
export async function waitForActionCenterLoad(page: Page): Promise<void> {
  // Wait for either content or empty state
  await Promise.race([
    page.waitForSelector('[data-section-type]', { timeout: 10000 }),
    page.waitForSelector('text=Tudo em ordem', { timeout: 10000 }),
  ]);
}

/**
 * Get count of action cards on the page
 */
export async function getActionCardCount(page: Page): Promise<number> {
  const cards = await page.locator('[data-testid="action-card"]').all();
  return cards.length;
}

/**
 * Click refresh button and wait for update
 */
export async function refreshActionCenter(page: Page): Promise<void> {
  await page.click('button:has-text("Atualizar")');
  await page.waitForLoadState('networkidle');
}

/**
 * Execute an action on a specific card
 */
export async function executeAction(page: Page, cardIndex: number = 0): Promise<void> {
  const cards = await page.locator('[data-testid="action-card"]').all();
  if (cards.length > cardIndex) {
    // Find the execute button within the card
    const executeButton = cards[cardIndex].locator('button:has-text("Executar"), button:has-text("Corrigir"), button:has-text("Resolver")').first();
    await executeButton.click();
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Ignore an action with reason
 */
export async function ignoreAction(page: Page, cardIndex: number, reason: string): Promise<void> {
  const cards = await page.locator('[data-testid="action-card"]').all();
  if (cards.length > cardIndex) {
    // Click ignore button
    const ignoreButton = cards[cardIndex].locator('button:has-text("Ignorar")').first();
    await ignoreButton.click();
    
    // Wait for dialog
    await page.waitForSelector('[role="dialog"]');
    
    // Fill reason
    await page.fill('textarea', reason);
    
    // Confirm
    await page.click('button:has-text("Confirmar")');
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Acknowledge an alert
 */
export async function acknowledgeAlert(page: Page, cardIndex: number = 0): Promise<void> {
  const cards = await page.locator('[data-testid="action-card"]').all();
  if (cards.length > cardIndex) {
    const ackButton = cards[cardIndex].locator('button:has-text("Reconhecer")').first();
    await ackButton.click();
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Check if a section exists
 */
export async function sectionExists(page: Page, sectionType: 'urgent' | 'recommended' | 'informational'): Promise<boolean> {
  const sectionTexts = {
    urgent: 'Ações Urgentes',
    recommended: 'Ações Recomendadas',
    informational: 'Informativo',
  };
  
  return page.locator(`text=${sectionTexts[sectionType]}`).isVisible();
}

/**
 * Get urgent count from sidebar badge
 */
export async function getSidebarBadgeCount(page: Page): Promise<number | null> {
  const badge = page.locator('[data-testid="action-center-badge"]');
  const isVisible = await badge.isVisible();
  
  if (!isVisible) return null;
  
  const text = await badge.textContent();
  return text ? parseInt(text, 10) : null;
}

/**
 * Check if empty state is displayed
 */
export async function isEmptyStateVisible(page: Page): Promise<boolean> {
  return page.locator('text=Tudo em ordem').isVisible();
}

/**
 * Get healthy count from empty state
 */
export async function getHealthyCount(page: Page): Promise<number | null> {
  const healthyText = page.locator('text=/\\d+ computador/');
  const isVisible = await healthyText.isVisible();
  
  if (!isVisible) return null;
  
  const text = await healthyText.textContent();
  const match = text?.match(/(\d+) computador/);
  return match ? parseInt(match[1], 10) : null;
}

/**
 * Navigate to agent health from action card
 */
export async function navigateToAgentFromCard(page: Page, cardIndex: number = 0): Promise<void> {
  const cards = await page.locator('[data-testid="action-card"]').all();
  if (cards.length > cardIndex) {
    const agentLink = cards[cardIndex].locator('a[href*="agent-health"]').first();
    if (await agentLink.isVisible()) {
      await agentLink.click();
      await page.waitForURL(/agent-health/);
    }
  }
}

/**
 * Wait for toast notification
 */
export async function waitForToast(page: Page, message: string): Promise<void> {
  await page.waitForSelector(`text=${message}`, { timeout: 5000 });
}

/**
 * Get all playbook names from the playbooks page
 */
export async function getPlaybookNames(page: Page): Promise<string[]> {
  await navigateToPlaybooks(page);
  await page.waitForLoadState('networkidle');
  
  const names: string[] = [];
  const playbookCards = await page.locator('[data-testid="playbook-card"] h3, .playbook-name').all();
  
  for (const card of playbookCards) {
    const text = await card.textContent();
    if (text) names.push(text.trim());
  }
  
  return names;
}

/**
 * Filter playbooks by severity
 */
export async function filterPlaybooksBySeverity(page: Page, severity: string): Promise<void> {
  // Look for filter buttons or dropdown
  const filterButton = page.locator(`button:has-text("${severity}"), [data-severity="${severity}"]`);
  if (await filterButton.isVisible()) {
    await filterButton.click();
    await page.waitForLoadState('networkidle');
  }
}

/**
 * Assert that action center feed loads correctly
 */
export async function assertActionCenterLoaded(page: Page): Promise<void> {
  // Should not have loading skeleton
  await expect(page.locator('[data-testid="action-center-skeleton"]')).not.toBeVisible({ timeout: 10000 });
  
  // Should have either content sections or empty state
  const hasContent = await page.locator('[data-section-type]').first().isVisible().catch(() => false);
  const hasEmptyState = await page.locator('text=Tudo em ordem').isVisible().catch(() => false);
  
  expect(hasContent || hasEmptyState).toBe(true);
}

export default {
  loginAsAdmin,
  navigateToActionCenter,
  navigateToPlaybooks,
  waitForActionCenterLoad,
  getActionCardCount,
  refreshActionCenter,
  executeAction,
  ignoreAction,
  acknowledgeAlert,
  sectionExists,
  getSidebarBadgeCount,
  isEmptyStateVisible,
  getHealthyCount,
  navigateToAgentFromCard,
  waitForToast,
  getPlaybookNames,
  filterPlaybooksBySeverity,
  assertActionCenterLoaded,
};
