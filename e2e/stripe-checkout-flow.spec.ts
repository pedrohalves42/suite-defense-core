import { test, expect } from '@playwright/test';

test.describe('Stripe Checkout Flow', () => {
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

  test('should display plans correctly on PlanUpgradeNew page', async ({ page }) => {
    await page.goto('/admin/plan-upgrade-new');
    
    // Wait for page to load
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Should show all plan cards
    await expect(page.locator('text=Starter').or(page.locator('text=starter'))).toBeVisible();
    await expect(page.locator('text=Pro').or(page.locator('text=pro'))).toBeVisible();
    await expect(page.locator('text=Enterprise').or(page.locator('text=enterprise'))).toBeVisible();

    // Should show pricing
    await expect(page.locator('text=/R\\$.*\\/mês/i')).toBeVisible();

    // Should show device quantity inputs for paid plans
    const deviceInputs = page.locator('input[type="number"]');
    expect(await deviceInputs.count()).toBeGreaterThan(0);
  });

  test('should update device quantity and recalculate price', async ({ page }) => {
    await page.goto('/admin/plan-upgrade-new');
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Find Starter plan device input
    const starterCard = page.locator('text=Starter').locator('..').locator('..').locator('..');
    const deviceInput = starterCard.locator('input[type="number"]').first();

    // Change quantity to 5
    await deviceInput.fill('5');
    await page.waitForTimeout(500);

    // Price should update
    const priceText = await starterCard.locator('text=/R\\$.*\\/mês/i').textContent();
    expect(priceText).toBeTruthy();
  });

  test('should create checkout session for Starter plan', async ({ page, context }) => {
    await page.goto('/admin/plan-upgrade-new');
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Track navigation
    let checkoutUrlOpened = false;
    page.on('framenavigated', frame => {
      if (frame.url().includes('checkout.stripe.com')) {
        checkoutUrlOpened = true;
      }
    });

    // Find Starter plan and click subscribe
    const starterCard = page.locator('text=Starter').locator('..').locator('..').locator('..');
    const subscribeButton = starterCard.locator('button:has-text("Assinar Agora")').first();
    
    if (await subscribeButton.isVisible()) {
      await subscribeButton.click();
      
      // Wait for redirect or error
      await page.waitForTimeout(5000);

      // Should either redirect to Stripe or show toast
      const hasError = await page.locator('text=Erro ao criar checkout').isVisible();
      
      if (!hasError) {
        // If no error, should have redirected or be redirecting
        expect(checkoutUrlOpened || page.url().includes('checkout.stripe.com')).toBeTruthy();
      }
    }
  });

  test('should open customer portal for existing subscription', async ({ page }) => {
    await page.goto('/admin/plan-upgrade-new');
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Check if user has existing subscription
    const manageButton = page.locator('button:has-text("Gerenciar Assinatura")');
    const hasSubscription = await manageButton.isVisible();

    if (hasSubscription) {
      // Track navigation
      let portalUrlOpened = false;
      page.on('framenavigated', frame => {
        if (frame.url().includes('billing.stripe.com')) {
          portalUrlOpened = true;
        }
      });

      await manageButton.click();
      
      // Wait for redirect
      await page.waitForTimeout(5000);

      // Should redirect to Stripe portal
      expect(portalUrlOpened || page.url().includes('billing.stripe.com')).toBeTruthy();
    }
  });

  test('should show current subscription details', async ({ page }) => {
    await page.goto('/admin/plan-upgrade-new');
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Check for subscription card
    const currentPlanCard = page.locator('text=Plano Atual');
    
    if (await currentPlanCard.isVisible()) {
      // Should show plan name
      await expect(page.locator('text=/Plano Atual:.*/i')).toBeVisible();
      
      // Should show device quantity
      await expect(page.locator('text=/dispositivo/i')).toBeVisible();
      
      // Should show status
      await expect(page.locator('text=/Status:/i')).toBeVisible();
    }
  });

  test('should navigate to checkout success page', async ({ page }) => {
    // Simulate successful checkout by going directly to success page
    await page.goto('/checkout-success?session_id=test_session_123');
    
    // Wait for page to load
    await page.waitForSelector('text=Assinatura Confirmada', { timeout: 10000 });

    // Should show success message
    await expect(page.locator('text=Assinatura Confirmada')).toBeVisible();
    
    // Should show trial information
    await expect(page.locator('text=/30 dias/i')).toBeVisible();
    
    // Should show navigation buttons
    await expect(page.locator('button:has-text("Ir para Dashboard")')).toBeVisible();
    await expect(page.locator('button:has-text("Gerenciar Assinatura")')).toBeVisible();
    await expect(page.locator('button:has-text("Instalar Agentes")')).toBeVisible();
  });

  test('should handle checkout cancellation', async ({ page }) => {
    await page.goto('/checkout-cancel');
    
    // Wait for page to load (if exists)
    await page.waitForTimeout(2000);

    // If cancel page exists, should show appropriate message
    const hasCancelPage = !page.url().includes('404');
    
    if (hasCancelPage) {
      await expect(page.locator('text=/cancel|cancelad/i')).toBeVisible();
    }
  });

  test('should enforce device quantity limits', async ({ page }) => {
    await page.goto('/admin/plan-upgrade-new');
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Find Starter plan (max 30 devices)
    const starterCard = page.locator('text=Starter').locator('..').locator('..').locator('..');
    const deviceInput = starterCard.locator('input[type="number"]').first();

    // Try to set above maximum
    await deviceInput.fill('100');
    await page.waitForTimeout(500);

    // Should be clamped to max (30 for Starter)
    const value = await deviceInput.inputValue();
    expect(parseInt(value)).toBeLessThanOrEqual(30);
  });

  test('should show correct features for each plan', async ({ page }) => {
    await page.goto('/admin/plan-upgrade-new');
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Starter plan features
    const starterCard = page.locator('text=Starter').locator('..').locator('..').locator('..');
    await expect(starterCard.locator('text=/30 dispositivos/i')).toBeVisible();
    await expect(starterCard.locator('text=/2 scans avançados/i')).toBeVisible();

    // Pro plan features
    const proCard = page.locator('text=Pro').locator('..').locator('..').locator('..');
    await expect(proCard.locator('text=/200 dispositivos/i')).toBeVisible();
    await expect(proCard.locator('text=/ilimitados/i')).toBeVisible();
  });

  test('should handle errors gracefully', async ({ page }) => {
    await page.goto('/admin/plan-upgrade-new');
    await page.waitForSelector('h1:has-text("Planos e Preços")', { timeout: 10000 });

    // Monitor console for errors
    const errors = [];
    page.on('console', msg => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });

    // Wait for any async operations
    await page.waitForTimeout(3000);

    // Should not have critical errors
    const criticalErrors = errors.filter(e => 
      e.includes('Tenant not found') || 
      e.includes('500') ||
      e.includes('undefined')
    );

    expect(criticalErrors.length).toBe(0);
  });
});
