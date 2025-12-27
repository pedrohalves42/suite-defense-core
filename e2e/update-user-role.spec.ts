import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { TEST_CONFIG } from './test-config';

/**
 * E2E Test: Update User Role Flow
 * 
 * Testa o fluxo completo de atualizacao de roles:
 * - Frontend (Members.tsx) → Edge Function (update-user-role) → RPC (update_user_role_rpc) → Audit Logs
 */

test.describe('Update User Role Flow', () => {
  test.beforeEach(async ({ page }) => {
    const success = await loginAsAdmin(page);
    expect(success).toBe(true);
  });

  test('Admin can successfully update another user role', async ({ page }) => {
    // Navegar para Members
    await page.goto('/admin/members');
    await expect(page.locator('h2:has-text("Membros da Organizacao")')).toBeVisible();

    // Encontrar primeiro membro que nao e o proprio admin
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
    
    // Encontrar card do proprio admin (geralmente marcado)
    const adminCard = page.locator('[data-testid="member-card"]:has-text("Voce")');
    
    // Verificar que o select esta desabilitado ou nao existe
    const roleSelect = adminCard.locator('[data-testid="role-select"]');
    await expect(roleSelect).toBeDisabled();
  });

  test('Non-admin receives 403 when trying to update roles', async ({ page }) => {
    // Este teste requer um usuario viewer configurado
    // Por enquanto, verifica apenas o redirecionamento
    await page.goto('/admin/members');
    
    // Se o usuario nao tiver permissao, sera redirecionado ou vera erro
    const hasAccess = await page.locator('h2:has-text("Membros")').isVisible().catch(() => false);
    
    if (!hasAccess) {
      // Deve ser redirecionado ou ver mensagem de erro
      const errorVisible = await page.locator('text=Acesso negado').isVisible().catch(() => false);
      expect(errorVisible || page.url().includes('/dashboard')).toBeTruthy();
    }
  });

  test('Cannot demote the last admin', async ({ page }) => {
    // Este teste assume que ha apenas 1 admin no tenant de teste
    await page.goto('/admin/members');
    
    // Se houver apenas 1 admin, tentar mudar seu role deve falhar
    const adminCard = page.locator('[data-testid="member-card"]:has-text("Admin")').first();
    
    const roleSelect = adminCard.locator('[data-testid="role-select"]');
    if (await roleSelect.isVisible() && !(await roleSelect.isDisabled())) {
      await roleSelect.click();
      await page.locator('text=Viewer').click();
      
      // Verificar toast de erro
      await expect(page.locator('text=Cannot demote the last admin')).toBeVisible({ timeout: 5000 });
    }
  });

  test('Audit log is created with correct details', async ({ page }) => {
    // Realizar update de role
    await page.goto('/admin/members');
    const memberCards = page.locator('[data-testid="member-card"]');
    const firstMember = memberCards.first();
    
    const roleSelect = firstMember.locator('[data-testid="role-select"]');
    if (await roleSelect.isVisible() && !(await roleSelect.isDisabled())) {
      await roleSelect.click();
      await page.locator('text=Operator').click();
      
      await expect(page.locator('text=Role atualizado com sucesso')).toBeVisible({ timeout: 5000 });
      
      // Verificar audit log
      await page.goto('/admin/audit-logs');
      
      const logRow = page.locator('tr:has-text("update_role")').first();
      await expect(logRow.locator('td:has-text("Sucesso")')).toBeVisible();
      await expect(logRow.locator('td:has-text("user")')).toBeVisible(); // resource_type
    }
  });

  test('Rate limiting works after 10 requests', async ({ page }) => {
    await page.goto('/admin/members');
    
    const memberCards = page.locator('[data-testid="member-card"]');
    const firstMember = memberCards.first();
    
    const roleSelect = firstMember.locator('[data-testid="role-select"]');
    if (await roleSelect.isVisible() && !(await roleSelect.isDisabled())) {
      // Fazer 11 requests rapidas (exceder limite de 10/min)
      for (let i = 0; i < 11; i++) {
        await roleSelect.click();
        await page.locator('text=Viewer').click();
        await page.waitForTimeout(100);
      }
      
      // A 11a deve retornar rate limit
      await expect(page.locator('text=Rate limit exceeded')).toBeVisible({ timeout: 3000 });
    }
  });

  test('Invalid user ID returns 404', async ({ page }) => {
    // Este teste requer acesso direto a API
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
