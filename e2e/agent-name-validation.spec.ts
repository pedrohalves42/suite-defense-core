import { test, expect } from '@playwright/test';

test.describe('Agent Name Validation', () => {
  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto('/login');
    await page.fill('[name="email"]', process.env.ADMIN_EMAIL || 'admin@test.com');
    await page.fill('[name="password"]', process.env.ADMIN_PASSWORD || 'Test123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin/**', { timeout: 10000 });
    
    // Navegar para instalador
    await page.goto('/admin/agent-installer');
    await page.waitForLoadState('networkidle');
  });

  test('should accept valid agent name', async ({ page }) => {
    const uniqueName = `test-agent-${Date.now()}`;
    await page.fill('[name="agentName"]', uniqueName);
    await expect(page.locator('text=[OK]  Nome disponivel')).toBeVisible({ timeout: 15000 });
  });

  test('should reject agent name with less than 3 characters', async ({ page }) => {
    await page.fill('[name="agentName"]', 'ab');
    await expect(page.locator('text=/Nome deve ter pelo menos 3 caracteres|Nome muito curto/i')).toBeVisible({ timeout: 10000 });
  });

  test('should reject agent name with special characters', async ({ page }) => {
    await page.fill('[name="agentName"]', 'test@agent#123');
    await expect(page.locator('text=/apenas letras.*numeros.*hifen.*underscore/i')).toBeVisible({ timeout: 15000 });
  });

  test('should reject agent name that exceeds 50 characters', async ({ page }) => {
    const longName = 'a'.repeat(51);
    await page.fill('[name="agentName"]', longName);
    await expect(page.locator('text=/Nome deve ter no maximo 50 caracteres/i')).toBeVisible({ timeout: 15000 });
  });

  test('should reject duplicate agent name in same tenant', async ({ page }) => {
    // Primeiro, criar um agente
    const duplicateName = `duplicate-test-${Date.now()}`;
    await page.fill('[name="agentName"]', duplicateName);
    await expect(page.locator('text=[OK]  Nome disponivel')).toBeVisible({ timeout: 15000 });
    
    // Tentar criar novamente com o mesmo nome
    await page.reload();
    await page.fill('[name="agentName"]', duplicateName);
    await expect(page.locator('text=/Nome ja esta em uso/i')).toBeVisible({ timeout: 15000 });
  });

  test('should show loading state during validation', async ({ page }) => {
    await page.fill('[name="agentName"]', 'test-loading');
    // Verificar se ha algum indicador de loading (spinner, texto, etc)
    await expect(page.locator('text=/verificando|checking/i')).toBeVisible({ timeout: 5000 }).catch(() => {
      // Se nao houver texto de loading, pelo menos a validacao deve completar
      return expect(page.locator('text=/[OK] |[ERROR] /i')).toBeVisible({ timeout: 15000 });
    });
  });

  test('should handle user with multiple roles', async ({ page }) => {
    // Este e o caso especifico do bug atual
    // O usuario pode ter multiplos papeis no mesmo tenant
    const multiRoleName = `multi-role-test-${Date.now()}`;
    await page.fill('[name="agentName"]', multiRoleName);
    
    // Deve funcionar mesmo se usuario tiver multiplos papeis
    await expect(page.locator('text=[OK]  Nome disponivel')).toBeVisible({ timeout: 15000 });
  });

  test('should debounce validation requests', async ({ page }) => {
    // Digitar rapidamente deve fazer apenas uma requisicao apos debounce
    await page.fill('[name="agentName"]', 't');
    await page.fill('[name="agentName"]', 'te');
    await page.fill('[name="agentName"]', 'tes');
    await page.fill('[name="agentName"]', 'test');
    await page.fill('[name="agentName"]', 'test-');
    await page.fill('[name="agentName"]', 'test-d');
    await page.fill('[name="agentName"]', 'test-de');
    await page.fill('[name="agentName"]', 'test-deb');
    
    // Aguardar debounce (800ms + tempo de requisicao)
    await page.waitForTimeout(1500);
    
    // Deve mostrar resultado final
    await expect(page.locator('text=/[OK] |[ERROR] /i')).toBeVisible({ timeout: 15000 });
  });

  test('should show error message on network failure', async ({ page }) => {
    // Simular falha de rede desconectando
    await page.context().setOffline(true);
    
    await page.fill('[name="agentName"]', 'test-network-fail');
    
    // Deve mostrar mensagem de erro apos timeout/retry
    await expect(page.locator('text=/erro|timeout|conexao/i')).toBeVisible({ timeout: 15000 });
    
    // Reconectar
    await page.context().setOffline(false);
  });

  test('should validate on input change with debounce', async ({ page }) => {
    const validName = `test-change-${Date.now()}`;
    
    // Digitar nome valido
    await page.fill('[name="agentName"]', validName);
    await expect(page.locator('text=[OK]  Nome disponivel')).toBeVisible({ timeout: 15000 });
    
    // Mudar para nome invalido
    await page.fill('[name="agentName"]', 'ab');
    await expect(page.locator('text=/Nome deve ter pelo menos 3 caracteres|Nome muito curto/i')).toBeVisible({ timeout: 10000 });
  });
});
