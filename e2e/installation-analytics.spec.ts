import { test, expect } from '@playwright/test';

test.describe('Installation Analytics', () => {
  let accessToken: string;
  let agentId: string;

  test.beforeAll(async ({ request }) => {
    // Login as admin
    const loginResponse = await request.post(`${process.env.VITE_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'Content-Type': 'application/json',
        'apikey': process.env.VITE_SUPABASE_ANON_KEY!,
      },
      data: {
        email: process.env.TEST_ADMIN_EMAIL,
        password: process.env.TEST_ADMIN_PASSWORD,
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const { access_token } = await loginResponse.json();
    accessToken = access_token;

    // Create test agent
    const agentResponse = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: `analytics-test-${Date.now()}`,
      },
    });

    expect(agentResponse.ok()).toBeTruthy();
    const agentData = await agentResponse.json();
    agentId = agentData.agentId;
  });

  test('should track generated event', async ({ request }) => {
    const response = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/track-installation-event`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentId: agentId,
        eventType: 'generated',
        platform: 'windows',
        installationMethod: 'one-click',
      },
    });

    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  test('should track downloaded event', async ({ request }) => {
    const response = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/track-installation-event`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentId: agentId,
        eventType: 'downloaded',
        platform: 'linux',
        installationMethod: 'manual',
      },
    });

    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  test('should track command_copied event', async ({ request }) => {
    const response = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/track-installation-event`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentId: agentId,
        eventType: 'command_copied',
        platform: 'windows',
        installationMethod: 'one-click',
      },
    });

    expect(response.ok()).toBeTruthy();
    const result = await response.json();
    expect(result.success).toBe(true);
  });

  test('should reject invalid event type', async ({ request }) => {
    const response = await request.post(`${process.env.VITE_SUPABASE_URL}/functions/v1/track-installation-event`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      data: {
        agentId: agentId,
        eventType: 'invalid_type',
        platform: 'windows',
        installationMethod: 'one-click',
      },
    });

    expect(response.status()).toBe(400);
  });

  test('should display analytics dashboard', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard');
    
    // Navigate to analytics
    await page.goto('/admin/installation-analytics');
    
    // Verify page loaded
    await expect(page.locator('h1')).toContainText('Analytics');
    
    // Check for key metrics
    await expect(page.locator('text=Instaladores Gerados')).toBeVisible();
    await expect(page.locator('text=Downloads')).toBeVisible();
    await expect(page.locator('text=Instalações Sucesso')).toBeVisible();
  });

  test('should calculate correct metrics', async ({ page }) => {
    await page.goto('/');
    
    // Login
    await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL!);
    await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD!);
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/dashboard');
    
    // Navigate to analytics
    await page.goto('/admin/installation-analytics');
    
    // Wait for data to load
    await page.waitForTimeout(2000);
    
    // Verify metrics are numbers
    const generatedText = await page.locator('text=Instaladores Gerados').locator('..').locator('div').first().textContent();
    expect(generatedText).toMatch(/\d+/);
  });
});
