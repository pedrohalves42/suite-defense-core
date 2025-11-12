import { test, expect } from '@playwright/test';

test.describe('Multiple Roles Validation', () => {
  const testEmail = process.env.TEST_ADMIN_EMAIL || 'admin@test.com';
  const testPassword = process.env.TEST_ADMIN_PASSWORD || 'TestPassword123!';

  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('/login');
    await page.fill('input[type="email"]', testEmail);
    await page.fill('input[type="password"]', testPassword);
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin/dashboard', { timeout: 10000 });
  });

  test('should handle user with multiple roles - Members page', async ({ page }) => {
    // Navigate to Members page
    await page.goto('/admin/members');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Gerenciar Membros")', { timeout: 10000 });

    // Should not show error messages
    await expect(page.locator('text=Tenant not found')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();
    await expect(page.locator('text=PGRST116')).not.toBeVisible();

    // Should show members list or empty state
    const membersCard = page.locator('text=Membros do Tenant').first();
    await expect(membersCard).toBeVisible();

    // Should show subscription info
    const subscriptionCard = page.locator('text=Informações da Assinatura').first();
    await expect(subscriptionCard).toBeVisible();
  });

  test('should handle user with multiple roles - Plan Upgrade page', async ({ page }) => {
    // Navigate to Plan Upgrade page
    await page.goto('/admin/plan-upgrade');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Should not show error messages
    await expect(page.locator('text=Tenant not found')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();

    // Should show plans
    await expect(page.locator('text=Free').or(page.locator('text=Grátis'))).toBeVisible();
    await expect(page.locator('text=Pro')).toBeVisible();
  });

  test('should handle user with multiple roles - Agent Installer', async ({ page }) => {
    // Navigate to Agent Installer
    await page.goto('/admin/agent-installer');
    
    // Wait for page to load
    await page.waitForSelector('text=Gerar Instalador', { timeout: 10000 });

    // Should not show error messages
    await expect(page.locator('text=Tenant not found')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();

    // Should be able to generate installer
    await page.click('button:has-text("Gerar Instalador")');
    
    // Fill agent name
    const agentName = `TEST-MULTI-ROLE-${Date.now()}`;
    await page.fill('input[placeholder*="nome"]', agentName);
    
    // Select platform
    await page.click('button:has-text("Windows")');
    
    // Submit form
    await page.click('button:has-text("Gerar Credenciais")');
    
    // Wait for success
    await page.waitForSelector('text=Credenciais geradas com sucesso', { timeout: 10000 });
  });

  test('should handle user with multiple roles - Dashboard Data', async ({ page }) => {
    // Navigate to Dashboard
    await page.goto('/admin/dashboard');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Dashboard")', { timeout: 10000 });

    // Should not show error messages
    await expect(page.locator('text=No tenant found')).not.toBeVisible();
    await expect(page.locator('text=403')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();

    // Should show dashboard cards
    const dashboardCards = page.locator('[class*="card"]');
    await expect(dashboardCards.first()).toBeVisible({ timeout: 10000 });
  });

  test('should update member role without errors', async ({ page }) => {
    // Navigate to Members page
    await page.goto('/admin/members');
    await page.waitForSelector('h1:has-text("Gerenciar Membros")', { timeout: 10000 });

    // Check if there are members
    const membersExist = await page.locator('[class*="border rounded-lg"]').count() > 0;
    
    if (membersExist) {
      // Try to change a role (if not changing own role)
      const roleSelects = page.locator('select, button[role="combobox"]');
      const selectCount = await roleSelects.count();
      
      if (selectCount > 1) {
        // Click second role selector (not own role)
        await roleSelects.nth(1).click();
        
        // Should show role options
        await expect(page.locator('text=Admin').or(page.locator('text=Operator')).or(page.locator('text=Viewer'))).toBeVisible();
      }
    }
  });

  test('should check subscription status without errors', async ({ page }) => {
    // This tests the check-subscription edge function
    await page.goto('/admin/subscriptions');
    
    // Wait for subscription info to load
    await page.waitForTimeout(3000);

    // Should not show error in console
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    await page.waitForTimeout(2000);

    // Check for specific errors related to tenant
    const tenantErrors = errors.filter(e => 
      e.includes('Tenant not found') || 
      e.includes('PGRST116') ||
      e.includes('500')
    );

    expect(tenantErrors.length).toBe(0);
  });

  test('should handle installation analytics without errors', async ({ page }) => {
    // Navigate to Installation Analytics
    await page.goto('/admin/installation-analytics');
    
    // Wait for page to load
    await page.waitForSelector('h1', { timeout: 10000 });

    // Should not show error messages
    await expect(page.locator('text=Tenant not found')).not.toBeVisible();
    await expect(page.locator('text=403')).not.toBeVisible();
    await expect(page.locator('text=500')).not.toBeVisible();

    // Should show analytics cards
    const analyticsCards = page.locator('[class*="card"]');
    await expect(analyticsCards.first()).toBeVisible({ timeout: 10000 });
  });
});
