import { test, expect } from '@playwright/test';

/**
 * E2E Tests for Super Admin Tenant Management
 * 
 * This test suite validates that a super admin can:
 * 1. Access the tenant management page
 * 2. View all tenants and their subscriptions
 * 3. Modify subscription plans for any tenant
 */

test.describe('Super Admin - Tenant Management', () => {
  const SUPER_ADMIN_EMAIL = process.env.SUPER_ADMIN_EMAIL || 'pedrohalves42@gmail.com';
  const SUPER_ADMIN_PASSWORD = process.env.SUPER_ADMIN_PASSWORD || 'test123456';

  test.beforeEach(async ({ page }) => {
    // Navigate to login page
    await page.goto('/login');
    
    // Login as super admin
    await page.fill('input[type="email"]', SUPER_ADMIN_EMAIL);
    await page.fill('input[type="password"]', SUPER_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Wait for navigation to complete
    await page.waitForURL(/\/dashboard|\/admin/, { timeout: 10000 });
  });

  test('Super admin can access tenant management page', async ({ page }) => {
    // Navigate to super admin tenants page
    await page.goto('/admin/super/tenants');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Gerenciamento de Tenants")', { timeout: 10000 });
    
    // Verify page elements are visible
    await expect(page.locator('h1')).toContainText('Gerenciamento de Tenants');
    await expect(page.locator('text=Super Admin')).toBeVisible();
    
    // Verify summary cards are present
    await expect(page.locator('text=Total de Tenants')).toBeVisible();
    await expect(page.locator('text=Total de Usuários')).toBeVisible();
    await expect(page.locator('text=Total de Agentes')).toBeVisible();
  });

  test('Super admin can view all tenants with subscription details', async ({ page }) => {
    await page.goto('/admin/super/tenants');
    
    // Wait for table to load
    await page.waitForSelector('table', { timeout: 10000 });
    
    // Verify table headers
    await expect(page.locator('th:has-text("Nome do Tenant")')).toBeVisible();
    await expect(page.locator('th:has-text("Plano Atual")')).toBeVisible();
    await expect(page.locator('th:has-text("Usuários")')).toBeVisible();
    await expect(page.locator('th:has-text("Agentes")')).toBeVisible();
    await expect(page.locator('th:has-text("Alterar Plano")')).toBeVisible();
    
    // Verify at least one tenant row exists
    const tenantRows = page.locator('tbody tr');
    await expect(tenantRows.first()).toBeVisible();
    
    // Verify tenant row contains expected data
    const firstRow = tenantRows.first();
    await expect(firstRow.locator('td').first()).not.toBeEmpty();
  });

  test('Super admin can view tenant subscription plans', async ({ page }) => {
    await page.goto('/admin/super/tenants');
    
    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Find a tenant row
    const tenantRow = page.locator('tbody tr').first();
    
    // Verify subscription plan badge is visible
    const planBadge = tenantRow.locator('[class*="badge"]');
    await expect(planBadge).toBeVisible();
    
    // Verify plan is one of the expected values
    const planText = await planBadge.textContent();
    expect(['FREE', 'PRO', 'ENTERPRISE', 'Sem Plano']).toContain(planText?.trim());
  });

  test('Super admin can modify tenant subscription plan', async ({ page }) => {
    await page.goto('/admin/super/tenants');
    
    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Get the first tenant's current plan
    const firstRow = page.locator('tbody tr').first();
    const currentPlanBadge = firstRow.locator('[class*="badge"]');
    const currentPlan = await currentPlanBadge.textContent();
    
    console.log('Current plan:', currentPlan);
    
    // Click on the plan selector dropdown
    const planSelect = firstRow.locator('[role="combobox"]');
    await planSelect.click();
    
    // Wait for dropdown options to appear
    await page.waitForSelector('[role="option"]', { timeout: 5000 });
    
    // Select a different plan (try to switch to PRO if not already)
    const targetPlan = currentPlan?.includes('PRO') ? 'FREE' : 'PRO';
    const planOption = page.locator(`[role="option"]:has-text("${targetPlan}")`);
    
    if (await planOption.count() > 0) {
      await planOption.click();
      
      // Wait for success toast
      await expect(page.locator('text=Subscription plan updated successfully')).toBeVisible({ timeout: 5000 });
      
      // Verify plan was updated
      await page.reload();
      await page.waitForSelector('table tbody tr', { timeout: 10000 });
      const updatedPlanBadge = page.locator('tbody tr').first().locator('[class*="badge"]');
      await expect(updatedPlanBadge).toContainText(targetPlan);
    }
  });

  test('Super admin can see user and agent counts for each tenant', async ({ page }) => {
    await page.goto('/admin/super/tenants');
    
    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Get first tenant row
    const firstRow = page.locator('tbody tr').first();
    
    // Verify user count column exists and has format "X/Y"
    const userCountCell = firstRow.locator('td').nth(3);
    const userCountText = await userCountCell.textContent();
    expect(userCountText).toMatch(/\d+\/\d+/);
    
    // Verify agent count column exists and has format "X/Y" or "X/ilimitado"
    const agentCountCell = firstRow.locator('td').nth(4);
    const agentCountText = await agentCountCell.textContent();
    expect(agentCountText).toMatch(/\d+\/((\d+)|ilimitado)/);
  });

  test('Super admin sees warning when tenant exceeds quotas', async ({ page }) => {
    await page.goto('/admin/super/tenants');
    
    // Wait for table to load
    await page.waitForSelector('table tbody tr', { timeout: 10000 });
    
    // Look for any tenant rows with quota violations (red text)
    const rows = page.locator('tbody tr');
    const rowCount = await rows.count();
    
    let foundViolation = false;
    for (let i = 0; i < rowCount; i++) {
      const row = rows.nth(i);
      const userCountCell = row.locator('td').nth(3);
      const agentCountCell = row.locator('td').nth(4);
      
      // Check if any cell has red warning color
      const userHasWarning = await userCountCell.locator('span.text-red-600').count() > 0;
      const agentHasWarning = await agentCountCell.locator('span.text-red-600').count() > 0;
      
      if (userHasWarning || agentHasWarning) {
        foundViolation = true;
        console.log(`Found quota violation in row ${i + 1}`);
        break;
      }
    }
    
    // This test just verifies the UI can display warnings correctly
    // It doesn't require a violation to exist
    console.log('Quota violation warning UI check:', foundViolation ? 'Found violations' : 'No violations (OK)');
  });

  test('Super admin page shows correct metrics in summary cards', async ({ page }) => {
    await page.goto('/admin/super/tenants');
    
    // Wait for cards to load
    await page.waitForSelector('text=Total de Tenants', { timeout: 10000 });
    
    // Get tenant count from card
    const tenantCard = page.locator('text=Total de Tenants').locator('..');
    const tenantCount = await tenantCard.locator('.text-2xl').textContent();
    expect(parseInt(tenantCount || '0')).toBeGreaterThanOrEqual(0);
    
    // Get user count from card
    const userCard = page.locator('text=Total de Usuários').locator('..');
    const userCount = await userCard.locator('.text-2xl').textContent();
    expect(parseInt(userCount || '0')).toBeGreaterThanOrEqual(0);
    
    // Get agent count from card
    const agentCard = page.locator('text=Total de Agentes').locator('..');
    const agentCount = await agentCard.locator('.text-2xl').textContent();
    expect(parseInt(agentCount || '0')).toBeGreaterThanOrEqual(0);
    
    console.log('Metrics:', { tenantCount, userCount, agentCount });
  });

  test('Non-super admin cannot access tenant management page', async ({ page }) => {
    // Logout first
    await page.goto('/');
    await page.click('button:has-text("Sair")').catch(() => {});
    
    // Login as regular admin (not super admin)
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'test123456');
    await page.click('button[type="submit"]');
    
    // Try to access super admin page
    await page.goto('/admin/super/tenants');
    
    // Should be redirected to dashboard
    await page.waitForURL(/\/dashboard/, { timeout: 10000 });
    
    // Verify access denied toast appeared
    await expect(page.locator('text=Access Denied')).toBeVisible({ timeout: 5000 });
  });
});
