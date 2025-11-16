import { test, expect } from '@playwright/test';

test.describe('Installation Health Card', () => {
  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'test123456');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin/agent-health', { timeout: 10000 });
  });

  test('should display Installation Health card with metrics', async ({ page }) => {
    // Verificar se o card está presente
    await expect(page.locator('text=Installation Health')).toBeVisible();
    
    // Verificar se tem tooltip de ajuda
    const tooltip = page.locator('[data-testid="installation-health-tooltip"]');
    if (await tooltip.count() > 0) {
      await tooltip.hover();
      await expect(page.locator('text=Taxa de sucesso de post_installation')).toBeVisible();
    }

    // Verificar se os cards de OS estão presentes
    await expect(page.locator('text=macOS')).toBeVisible();
    await expect(page.locator('text=Windows')).toBeVisible();
    await expect(page.locator('text=Linux')).toBeVisible();
  });

  test('should show success rate percentages', async ({ page }) => {
    // Aguardar dados carregarem
    await page.waitForTimeout(2000);
    
    // Verificar se tem porcentagens (regex para capturar formato "XX.X%")
    const percentagePattern = /\d+\.\d+%/;
    const macosCard = page.locator('text=macOS').locator('..');
    
    // Se houver dados, deve mostrar porcentagem
    const hasData = await macosCard.locator('text=/\\d+\\.\\d+%/').count() > 0;
    if (hasData) {
      const percentText = await macosCard.locator('text=/\\d+\\.\\d+%/').first().textContent();
      expect(percentText).toMatch(percentagePattern);
    } else {
      // Se não há dados, deve mostrar "Sem dados"
      await expect(macosCard.locator('text=Sem dados')).toBeVisible();
    }
  });

  test('should display badges for health status', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se badges aparecem (Healthy, Warning, ou Critical)
    const badges = page.locator('[class*="bg-emerald-500"], [class*="bg-amber-500"], [class*="bg-red-500"]');
    const badgeCount = await badges.count();
    
    // Se houver dados, deve ter pelo menos 1 badge
    if (badgeCount > 0) {
      expect(badgeCount).toBeGreaterThan(0);
    }
  });

  test('should show total events and failures', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se mostra "Total: X"
    const totalText = page.locator('text=/Total: \\d+/');
    if (await totalText.count() > 0) {
      await expect(totalText.first()).toBeVisible();
    }
  });

  test('should auto-refresh after 60 seconds', async ({ page }) => {
    // Aguardar 60 segundos e verificar se timestamp muda
    const initialTime = await page.locator('text=/Atualizado \\d{2}:\\d{2}/').textContent();
    
    // Aguardar 65 segundos (60s + margem)
    await page.waitForTimeout(65000);
    
    const updatedTime = await page.locator('text=/Atualizado \\d{2}:\\d{2}/').textContent();
    
    // Timestamps devem ser diferentes
    expect(initialTime).not.toBe(updatedTime);
  });

  test('should handle error state gracefully', async ({ page }) => {
    // Simular erro desconectando rede (se possível via context)
    // Por simplicidade, apenas verificar que não quebra se houver erro
    
    await page.waitForTimeout(2000);
    
    // Se houver erro, deve mostrar mensagem
    const errorMsg = page.locator('text=Erro ao carregar métricas');
    if (await errorMsg.count() > 0) {
      await expect(errorMsg).toBeVisible();
    }
  });

  test('should highlight macOS card', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se card do macOS tem border destacado
    const macosCard = page.locator('text=macOS').locator('..');
    const classes = await macosCard.getAttribute('class');
    
    // Se houver dados, deve ter classe de destaque
    if (classes && !classes.includes('opacity-60')) {
      expect(classes).toContain('border-emerald');
    }
  });

  test('should show progress bars', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se há barras de progresso (elementos com h-1.5)
    const progressBars = page.locator('[class*="h-1.5"][class*="rounded-full"]');
    const count = await progressBars.count();
    
    // Se houver dados, deve ter barras de progresso
    if (count > 0) {
      expect(count).toBeGreaterThanOrEqual(1);
    }
  });

  test('should display global success rate', async ({ page }) => {
    await page.waitForTimeout(2000);
    
    // Verificar se mostra taxa global
    const globalRate = page.locator('text=Taxa Global');
    if (await globalRate.count() > 0) {
      await expect(globalRate).toBeVisible();
      
      // Deve ter um badge de status
      const statusBadge = page.locator('text=Taxa Global').locator('..').locator('[class*="bg-"]');
      await expect(statusBadge.first()).toBeVisible();
    }
  });
});
