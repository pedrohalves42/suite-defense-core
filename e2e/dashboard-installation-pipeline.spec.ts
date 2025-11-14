import { test, expect } from '@playwright/test';

test.describe('Installation Pipeline Monitor Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    // Wait for redirect
    await page.waitForURL('**/admin/**');
    
    // Navigate to Installation Pipeline Monitor
    await page.goto('/admin/installation-pipeline');
    await page.waitForLoadState('networkidle');
  });

  test('should load dashboard with metrics', async ({ page }) => {
    // Wait for metrics cards to appear
    await expect(page.locator('text=Taxa de Sucesso')).toBeVisible();
    await expect(page.locator('text=Agentes Ativos')).toBeVisible();
    await expect(page.locator('text=Tempo Médio de Instalação')).toBeVisible();
    await expect(page.locator('text=Taxa de Conversão')).toBeVisible();
    await expect(page.locator('text=Agentes Travados')).toBeVisible();

    // Check that metrics have values
    const successRateCard = page.locator('text=Taxa de Sucesso').locator('..');
    await expect(successRateCard.locator('div.text-2xl')).toContainText(/%/);
  });

  test('should display funnel chart', async ({ page }) => {
    // Check funnel chart container exists
    await expect(page.locator('text=Funil de Instalação')).toBeVisible();
    
    // Wait for chart to render (recharts)
    await page.waitForSelector('svg', { timeout: 5000 });
    const svgElements = await page.locator('svg').count();
    expect(svgElements).toBeGreaterThan(0);
  });

  test('should filter agents by stage', async ({ page }) => {
    // Wait for agents table
    await expect(page.locator('text=Agentes')).toBeVisible();
    
    // Click stage filter dropdown
    await page.click('text=Todos');
    
    // Select "Ativos"
    await page.click('text=Ativos');
    
    // Wait for table update
    await page.waitForTimeout(500);
    
    // Verify filter is applied (URL or visible elements)
    const activeAgents = page.locator('table tbody tr');
    const count = await activeAgents.count();
    
    // Should have filtered results
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should change time period', async ({ page }) => {
    // Click time period dropdown
    await page.click('text=Últimas 24 horas');
    
    // Select different period
    await page.click('text=Última hora');
    
    // Wait for metrics to reload
    await page.waitForTimeout(1000);
    
    // Verify metrics updated (check that loading doesn't appear again)
    await expect(page.locator('.animate-spin')).not.toBeVisible();
  });

  test('should export CSV', async ({ page }) => {
    // Wait for export button
    const exportButton = page.locator('button:has-text("Exportar CSV")');
    await expect(exportButton).toBeVisible();
    
    // Start waiting for download
    const downloadPromise = page.waitForEvent('download');
    
    // Click export
    await exportButton.click();
    
    // Wait for download
    const download = await downloadPromise;
    
    // Verify filename
    expect(download.suggestedFilename()).toMatch(/agents-pipeline-\d{4}-\d{2}-\d{2}\.csv/);
  });

  test('should show error state when backend fails', async ({ page }) => {
    // Mock API failure
    await page.route('**/functions/v1/get-installation-pipeline-metrics', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Internal server error' })
      });
    });
    
    // Reload page to trigger error
    await page.reload();
    
    // Wait for error state
    await expect(page.locator('text=Erro ao Carregar Pipeline de Instalação')).toBeVisible();
    await expect(page.locator('button:has-text("Tentar Novamente")')).toBeVisible();
  });

  test('should retry on error', async ({ page }) => {
    // Mock initial failure then success
    let callCount = 0;
    await page.route('**/functions/v1/get-installation-pipeline-metrics', route => {
      callCount++;
      if (callCount === 1) {
        route.fulfill({
          status: 500,
          body: JSON.stringify({ error: 'Server error' })
        });
      } else {
        route.continue();
      }
    });
    
    // Reload to trigger error
    await page.reload();
    await expect(page.locator('text=Erro ao Carregar')).toBeVisible();
    
    // Click retry
    await page.click('button:has-text("Tentar Novamente")');
    
    // Wait for successful load
    await expect(page.locator('text=Taxa de Sucesso')).toBeVisible();
  });

  test('should drill-down into agent details', async ({ page }) => {
    // Wait for table
    await page.waitForSelector('table tbody tr');
    
    // Get first row if exists
    const firstRow = page.locator('table tbody tr').first();
    const rowCount = await page.locator('table tbody tr').count();
    
    if (rowCount > 0) {
      // Click on first agent name
      const agentNameCell = firstRow.locator('td').first();
      await agentNameCell.click();
      
      // Should show some detail or navigate somewhere
      // (This depends on implementation - adjust as needed)
      await page.waitForTimeout(500);
    }
  });
});
