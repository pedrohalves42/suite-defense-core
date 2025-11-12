import { test, expect } from '@playwright/test';

/**
 * E2E Test: Update User Role Flow
 * 
 * Testa o fluxo completo de atualização de roles:
 * - Frontend (Members.tsx) → Edge Function (update-user-role) → RPC (update_user_role_rpc) → Audit Logs
 */

test.describe('Update User Role Flow', () => {
  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    await page.waitForURL('/agent-management');
  });

  test('Admin can successfully update another user role', async ({ page }) => {
    // Navegar para Members
    await page.goto('/admin/members');
    await expect(page.locator('h2:has-text("Membros da Organização")')).toBeVisible();

    // Encontrar primeiro membro que não é o próprio admin
    const memberCards = page.locator('[data-testid="member-card"]');
    const firstMember = memberCards.first();
    
    // Expandir dropdown de role
    await firstMember.locator('[data-testid="role-select"]').click();
    
    // Selecionar novo role
    await page.locator('text=Viewer').click();
    
    // Verificar toast de sucesso
    await expect(page.locator('text=Role atualizado com sucesso')).toBeVisible({ timeout: 5000 });

    // Verificar que o audit log foi criado
    await page.goto('/admin/audit-logs');
    await expect(page.locator('td:has-text("update_role")')).toBeVisible();
  });

  test('Admin cannot change their own role', async ({ page }) => {
    await page.goto('/admin/members');
    
    // Encontrar card do próprio admin (geralmente marcado)
    const adminCard = page.locator('[data-testid="member-card"]:has-text("Você")');
    
    // Verificar que o select está desabilitado ou não existe
    const roleSelect = adminCard.locator('[data-testid="role-select"]');
    await expect(roleSelect).toBeDisabled();
  });

  test('Non-admin receives 403 when trying to update roles', async ({ page }) => {
    // Logout
    await page.click('[data-testid="logout-button"]');
    
    // Login como viewer
    await page.goto('/login');
    await page.fill('input[type="email"]', 'viewer@test.com');
    await page.fill('input[type="password"]', 'TestPassword123!');
    await page.click('button[type="submit"]');
    
    // Tentar acessar Members
    await page.goto('/admin/members');
    
    // Deve ser redirecionado ou ver mensagem de erro
    await expect(page.locator('text=Acesso negado')).toBeVisible({ timeout: 3000 });
  });

  test('Cannot demote the last admin', async ({ page }) => {
    // Este teste assume que há apenas 1 admin no tenant de teste
    await page.goto('/admin/members');
    
    // Se houver apenas 1 admin, tentar mudar seu role deve falhar
    const adminCard = page.locator('[data-testid="member-card"]:has-text("Admin")').first();
    
    await adminCard.locator('[data-testid="role-select"]').click();
    await page.locator('text=Viewer').click();
    
    // Verificar toast de erro
    await expect(page.locator('text=Cannot demote the last admin')).toBeVisible({ timeout: 5000 });
  });

  test('Audit log is created with correct details', async ({ page }) => {
    // Realizar update de role
    await page.goto('/admin/members');
    const memberCards = page.locator('[data-testid="member-card"]');
    const firstMember = memberCards.first();
    
    await firstMember.locator('[data-testid="role-select"]').click();
    await page.locator('text=Operator').click();
    
    await expect(page.locator('text=Role atualizado com sucesso')).toBeVisible({ timeout: 5000 });
    
    // Verificar audit log
    await page.goto('/admin/audit-logs');
    
    const logRow = page.locator('tr:has-text("update_role")').first();
    await expect(logRow.locator('td:has-text("Sucesso")')).toBeVisible();
    await expect(logRow.locator('td:has-text("user")')).toBeVisible(); // resource_type
  });

  test('Rate limiting works after 10 requests', async ({ page }) => {
    await page.goto('/admin/members');
    
    const memberCards = page.locator('[data-testid="member-card"]');
    const firstMember = memberCards.first();
    
    // Fazer 11 requests rápidas (exceder limite de 10/min)
    for (let i = 0; i < 11; i++) {
      await firstMember.locator('[data-testid="role-select"]').click();
      await page.locator('text=Viewer').click();
      await page.waitForTimeout(100);
    }
    
    // A 11ª deve retornar rate limit
    await expect(page.locator('text=Rate limit exceeded')).toBeVisible({ timeout: 3000 });
  });

  test('Invalid user ID returns 404', async ({ page }) => {
    // Este teste requer acesso direto à API
    const response = await page.request.post('/functions/v1/update-user-role', {
      data: {
        userId: '00000000-0000-0000-0000-000000000000',
        roles: ['viewer']
      },
      headers: {
        'Authorization': `Bearer ${await page.evaluate(() => localStorage.getItem('supabase.auth.token'))}`,
      }
    });
    
    expect(response.status()).toBe(404);
    const body = await response.json();
    expect(body.error.message).toContain('User not found');
  });
});
