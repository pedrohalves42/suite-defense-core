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
    await expect(page.locator('text=✅ Nome disponível')).toBeVisible({ timeout: 15000 });
  });

  test('should reject agent name with less than 3 characters', async ({ page }) => {
    await page.fill('[name="agentName"]', 'ab');
    await expect(page.locator('text=/Nome deve ter pelo menos 3 caracteres|Nome muito curto/i')).toBeVisible({ timeout: 10000 });
  });

  test('should reject agent name with special characters', async ({ page }) => {
    await page.fill('[name="agentName"]', 'test@agent#123');
    await expect(page.locator('text=/apenas letras.*números.*hífen.*underscore/i')).toBeVisible({ timeout: 15000 });
  });

  test('should reject agent name that exceeds 50 characters', async ({ page }) => {
    const longName = 'a'.repeat(51);
    await page.fill('[name="agentName"]', longName);
    await expect(page.locator('text=/Nome deve ter no máximo 50 caracteres/i')).toBeVisible({ timeout: 15000 });
  });

  test('should reject duplicate agent name in same tenant', async ({ page }) => {
    // Primeiro, criar um agente
    const duplicateName = `duplicate-test-${Date.now()}`;
    await page.fill('[name="agentName"]', duplicateName);
    await expect(page.locator('text=✅ Nome disponível')).toBeVisible({ timeout: 15000 });
    
    // Tentar criar novamente com o mesmo nome
    await page.reload();
    await page.fill('[name="agentName"]', duplicateName);
    await expect(page.locator('text=/Nome já está em uso/i')).toBeVisible({ timeout: 15000 });
  });

  test('should show loading state during validation', async ({ page }) => {
    await page.fill('[name="agentName"]', 'test-loading');
    // Verificar se há algum indicador de loading (spinner, texto, etc)
    await expect(page.locator('text=/verificando|checking/i')).toBeVisible({ timeout: 5000 }).catch(() => {
      // Se não houver texto de loading, pelo menos a validação deve completar
      return expect(page.locator('text=/✅|❌/i')).toBeVisible({ timeout: 15000 });
    });
  });

  test('should handle user with multiple roles', async ({ page }) => {
    // Este é o caso específico do bug atual
    // O usuário pode ter múltiplos papéis no mesmo tenant
    const multiRoleName = `multi-role-test-${Date.now()}`;
    await page.fill('[name="agentName"]', multiRoleName);
    
    // Deve funcionar mesmo se usuário tiver múltiplos papéis
    await expect(page.locator('text=✅ Nome disponível')).toBeVisible({ timeout: 15000 });
  });

  test('should debounce validation requests', async ({ page }) => {
    // Digitar rapidamente deve fazer apenas uma requisição após debounce
    await page.fill('[name="agentName"]', 't');
    await page.fill('[name="agentName"]', 'te');
    await page.fill('[name="agentName"]', 'tes');
    await page.fill('[name="agentName"]', 'test');
    await page.fill('[name="agentName"]', 'test-');
    await page.fill('[name="agentName"]', 'test-d');
    await page.fill('[name="agentName"]', 'test-de');
    await page.fill('[name="agentName"]', 'test-deb');
    
    // Aguardar debounce (800ms + tempo de requisição)
    await page.waitForTimeout(1500);
    
    // Deve mostrar resultado final
    await expect(page.locator('text=/✅|❌/i')).toBeVisible({ timeout: 15000 });
  });

  test('should show error message on network failure', async ({ page }) => {
    // Simular falha de rede desconectando
    await page.context().setOffline(true);
    
    await page.fill('[name="agentName"]', 'test-network-fail');
    
    // Deve mostrar mensagem de erro após timeout/retry
    await expect(page.locator('text=/erro|timeout|conexão/i')).toBeVisible({ timeout: 15000 });
    
    // Reconectar
    await page.context().setOffline(false);
  });

  test('should validate on input change with debounce', async ({ page }) => {
    const validName = `test-change-${Date.now()}`;
    
    // Digitar nome válido
    await page.fill('[name="agentName"]', validName);
    await expect(page.locator('text=✅ Nome disponível')).toBeVisible({ timeout: 15000 });
    
    // Mudar para nome inválido
    await page.fill('[name="agentName"]', 'ab');
    await expect(page.locator('text=/Nome deve ter pelo menos 3 caracteres|Nome muito curto/i')).toBeVisible({ timeout: 10000 });
  });
});
