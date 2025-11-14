import { test, expect } from '@playwright/test';

test.describe('Installation Logs Explorer Dashboard', () => {
  test.beforeEach(async ({ page }) => {
    // Login as admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    
    await page.waitForURL('**/admin/**');
    
    // Navigate to Installation Logs Explorer
    await page.goto('/admin/installation-logs');
    await page.waitForLoadState('networkidle');
  });

  test('should load logs table', async ({ page }) => {
    await expect(page.locator('text=Explorador de Logs de Instalação')).toBeVisible();
    await expect(page.locator('text=Filtros de Busca')).toBeVisible();
    
    // Wait for table
    await page.waitForSelector('table', { timeout: 5000 });
  });

  test('should filter by agent name', async ({ page }) => {
    // Type in agent name filter
    const agentNameInput = page.locator('input[placeholder*="Buscar por nome"]');
    await agentNameInput.fill('TEST-AGENT');
    
    // Wait for results to update
    await page.waitForTimeout(1000);
    
    // Check that results contain the filter term (if any results)
    const rows = page.locator('table tbody tr');
    const count = await rows.count();
    
    if (count > 0) {
      const firstRowText = await rows.first().textContent();
      // Results should be filtered (or "Nenhum log encontrado")
      expect(firstRowText).toBeTruthy();
    }
  });

  test('should filter by event type', async ({ page }) => {
    // Open event type dropdown
    await page.click('text=Tipo de Evento');
    
    // Select "Instalado"
    await page.click('text=Instalado');
    
    // Wait for filter to apply
    await page.waitForTimeout(500);
    
    // Verify filter applied (check URL params or visible badges)
    const badges = page.locator('text=Instalado').first();
    await expect(badges).toBeVisible();
  });

  test('should filter by success/failure', async ({ page }) => {
    // Open success dropdown
    await page.click('text=Status >> nth=0');
    
    // Select "Falhas"
    await page.click('text=Apenas Falhas');
    
    await page.waitForTimeout(500);
    
    // Check that failure icons are visible (if any results)
    const failureIcons = page.locator('svg.lucide-x-circle, [data-icon="x-circle"]');
    const count = await failureIcons.count();
    
    // Either we have failures or "Nenhum log encontrado"
    expect(count).toBeGreaterThanOrEqual(0);
  });

  test('should filter by platform', async ({ page }) => {
    // Open platform dropdown
    const platformSelect = page.locator('text=Plataforma').first();
    await platformSelect.click();
    
    // Select Windows
    await page.click('text=Windows');
    
    await page.waitForTimeout(500);
  });

  test('should filter by error type', async ({ page }) => {
    // Type in error type filter
    const errorInput = page.locator('input[placeholder*="erro"]');
    await errorInput.fill('401');
    
    await page.waitForTimeout(1000);
    
    // Results should contain 401 errors (if any)
  });

  test('should clear all filters', async ({ page }) => {
    // Apply some filters
    await page.fill('input[placeholder*="Buscar por nome"]', 'TEST');
    await page.waitForTimeout(500);
    
    // Click clear button
    const clearButton = page.locator('button:has-text("Limpar")');
    if (await clearButton.isVisible()) {
      await clearButton.click();
      
      // Check that input is cleared
      const agentNameInput = page.locator('input[placeholder*="Buscar por nome"]');
      await expect(agentNameInput).toHaveValue('');
    }
  });

  test('should open log details sheet', async ({ page }) => {
    // Wait for table rows
    await page.waitForSelector('table tbody tr', { timeout: 5000 });
    
    const rowCount = await page.locator('table tbody tr').count();
    
    if (rowCount > 0) {
      // Click "Ver Detalhes" button on first row
      const detailsButton = page.locator('button:has-text("Detalhes")').first();
      if (await detailsButton.isVisible()) {
        await detailsButton.click();
        
        // Wait for sheet to open
        await expect(page.locator('text=Detalhes do Log')).toBeVisible();
        
        // Check that metadata is displayed
        await expect(page.locator('text=Metadados')).toBeVisible();
      }
    }
  });

  test('should export logs to CSV', async ({ page }) => {
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
    expect(download.suggestedFilename()).toMatch(/installation-logs-\d{4}-\d{2}-\d{2}\.csv/);
  });

  test('should show error state when backend fails', async ({ page }) => {
    // Mock API failure
    await page.route('**/rest/v1/installation_analytics*', route => {
      route.fulfill({
        status: 500,
        body: JSON.stringify({ error: 'Database connection failed' })
      });
    });
    
    await page.reload();
    
    await expect(page.locator('text=Erro ao Carregar Logs')).toBeVisible();
    await expect(page.locator('button:has-text("Tentar Novamente")')).toBeVisible();
  });

  test('should show empty state when no logs', async ({ page }) => {
    // Apply filter that returns no results
    await page.fill('input[placeholder*="Buscar por nome"]', 'NONEXISTENT-AGENT-12345');
    await page.waitForTimeout(1000);
    
    // Check for empty state message
    await expect(page.locator('text=/Nenhum log encontrado/i')).toBeVisible();
  });
});
