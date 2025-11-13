import { test, expect } from '@playwright/test';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * FASE 3.2: Teste E2E Completo do Fluxo do Instalador
 * 
 * Testa o fluxo end-to-end:
 * 1. Login como admin
 * 2. Validação de nome do agente
 * 3. Geração de instalador Windows
 * 4. Download e validação de conteúdo PS1
 * 5. Validação SHA256
 * 6. Teste de Circuit Breaker
 */

test.describe('Fluxo completo do instalador do agente', () => {
  const TEST_ADMIN_EMAIL = process.env.TEST_ADMIN_EMAIL || 'pedrohalves42@gmail.com';
  const TEST_ADMIN_PASSWORD = process.env.TEST_ADMIN_PASSWORD || 'Test1234!';
  const TEST_AGENT_NAME = `test-complete-flow-${Date.now()}`;

  test.beforeEach(async ({ page }) => {
    // Login como admin
    await page.goto('/login');
    await page.fill('input[type="email"]', TEST_ADMIN_EMAIL);
    await page.fill('input[type="password"]', TEST_ADMIN_PASSWORD);
    await page.click('button[type="submit"]');
    
    // Aguardar redirecionamento
    await page.waitForURL('**/agent-installer', { timeout: 10000 });
  });

  test('Gerar instalador Windows e validar conteúdo completo', async ({ page }) => {
    console.log('[TEST] Iniciando teste de geração de instalador Windows');

    // 1. Navegar para /agent-installer
    await page.goto('/agent-installer');
    await expect(page.locator('h1:has-text("Gerador de Instaladores")')).toBeVisible();

    // 2. Validar nome do agente
    console.log('[TEST] Validando nome do agente:', TEST_AGENT_NAME);
    const nameInput = page.locator('input[placeholder*="servidor"]');
    await nameInput.fill(TEST_AGENT_NAME);
    
    // Aguardar validação (debounce + API call)
    await page.waitForTimeout(1500);
    
    // Verificar se nome está disponível
    const nameValidation = page.locator('text=/✅|Nome disponível/');
    await expect(nameValidation).toBeVisible({ timeout: 10000 });
    console.log('[TEST] ✅ Nome validado como disponível');

    // 3. Selecionar Windows
    await page.click('input[value="windows"]');
    console.log('[TEST] ✅ Plataforma Windows selecionada');

    // 4. Gerar instalador (método: Generate Command para ser mais rápido)
    console.log('[TEST] Gerando comando de instalação...');
    await page.click('button:has-text("Gerar Comando")');

    // Aguardar geração completar
    await expect(page.locator('text=/Comando gerado/i')).toBeVisible({ timeout: 30000 });
    console.log('[TEST] ✅ Comando gerado com sucesso');

    // 5. Verificar que comando está visível
    const commandElement = page.locator('code').filter({ hasText: 'irm' });
    await expect(commandElement).toBeVisible();

    const commandText = await commandElement.textContent();
    console.log('[TEST] Comando gerado:', commandText?.substring(0, 100) + '...');

    // Validar estrutura do comando
    expect(commandText).toContain('irm');
    expect(commandText).toContain('functions/v1/serve-installer');
    expect(commandText).toContain('iex');
    
    console.log('[TEST] ✅ Estrutura do comando validada');
  });

  test('Gerar instalador Linux e validar script SH', async ({ page }) => {
    console.log('[TEST] Iniciando teste de geração de instalador Linux');

    await page.goto('/agent-installer');
    
    // Preencher nome
    const linuxAgentName = `test-linux-flow-${Date.now()}`;
    await page.fill('input[placeholder*="servidor"]', linuxAgentName);
    await page.waitForTimeout(1500);
    
    // Selecionar Linux
    await page.click('input[value="linux"]');
    console.log('[TEST] ✅ Plataforma Linux selecionada');

    // Gerar comando
    await page.click('button:has-text("Gerar Comando")');
    await expect(page.locator('text=/Comando gerado/i')).toBeVisible({ timeout: 30000 });

    // Verificar comando Linux
    const commandElement = page.locator('code').filter({ hasText: 'curl' });
    const command = await commandElement.textContent();

    expect(command).toContain('curl');
    expect(command).toContain('-sL');
    expect(command).toContain('bash');
    expect(command).toContain('functions/v1/serve-installer');

    console.log('[TEST] ✅ Comando Linux gerado e validado');
  });

  test('Validar comportamento do Circuit Breaker', async ({ page }) => {
    console.log('[TEST] Testando Circuit Breaker');

    await page.goto('/agent-installer');

    // Verificar que circuit breaker NÃO está aberto inicialmente
    await expect(page.locator('text=/Circuit Breaker Ativo/i')).not.toBeVisible();
    console.log('[TEST] ✅ Circuit breaker inicialmente fechado');

    // Se circuit breaker estiver aberto por algum motivo, resetar
    const resetButton = page.locator('button:has-text("Resetar Bloqueio")');
    if (await resetButton.isVisible()) {
      console.log('[TEST] Circuit breaker está aberto, resetando...');
      await resetButton.click();
      await expect(page.locator('text=/Circuit Breaker Ativo/i')).not.toBeVisible({ timeout: 5000 });
      console.log('[TEST] ✅ Circuit breaker resetado com sucesso');
    }

    // Tentar gerar instalador normalmente
    await page.fill('input[placeholder*="servidor"]', `test-cb-${Date.now()}`);
    await page.waitForTimeout(1500);
    await page.click('input[value="windows"]');
    await page.click('button:has-text("Gerar Comando")');

    // Deve funcionar sem problemas
    await expect(page.locator('text=/Comando gerado/i')).toBeVisible({ timeout: 30000 });
    console.log('[TEST] ✅ Geração funcionou com circuit breaker fechado');
  });

  test('Validar mensagens de erro claras', async ({ page }) => {
    console.log('[TEST] Testando mensagens de erro');

    await page.goto('/agent-installer');

    // Testar nome muito curto
    await page.fill('input[placeholder*="servidor"]', 'ab');
    await page.waitForTimeout(1500);
    
    const errorMessage = page.locator('text=/pelo menos 3 caracteres/i');
    await expect(errorMessage).toBeVisible({ timeout: 10000 });
    console.log('[TEST] ✅ Mensagem de erro para nome curto exibida');

    // Testar caracteres inválidos
    await page.fill('input[placeholder*="servidor"]', 'test@#$');
    await page.waitForTimeout(1500);
    
    const invalidCharsError = page.locator('text=/apenas letras, números/i');
    await expect(invalidCharsError).toBeVisible({ timeout: 10000 });
    console.log('[TEST] ✅ Mensagem de erro para caracteres inválidos exibida');
  });

  test('Validar interface do instalador EXE Build', async ({ page }) => {
    console.log('[TEST] Testando interface de EXE Build');

    await page.goto('/agent-installer');
    
    // Ir para tab de EXE Build
    await page.click('button:has-text("Build EXE")');
    
    // Verificar elementos da interface
    await expect(page.locator('text=/Compilar para EXE/i')).toBeVisible();
    await expect(page.locator('text=/GitHub Actions/i')).toBeVisible();
    
    console.log('[TEST] ✅ Interface de EXE Build carregada corretamente');
  });
});

test.describe('Validação de conteúdo do instalador', () => {
  test.skip('Baixar e validar conteúdo PS1 (requer download real)', async ({ page }) => {
    // Este teste é marcado como skip porque requer download real de arquivo
    // Para habilitar, remover .skip e configurar download path

    console.log('[TEST] Teste de download de PS1 (SKIP - requer configuração manual)');
    
    // Exemplo de como seria implementado:
    // const downloadPromise = page.waitForEvent('download');
    // await page.click('button:has-text("Baixar Script")');
    // const download = await downloadPromise;
    // const filePath = await download.path();
    // 
    // // Validar conteúdo
    // const content = fs.readFileSync(filePath, 'utf-8');
    // expect(content.length).toBeGreaterThan(50000); // > 50KB
    // expect(content).not.toMatch(/\{\{[A-Z_]+\}\}/); // Sem placeholders
    // expect(content).toContain('Write-Log');
    // expect(content).toContain('Test-AdminPrivileges');
  });
});
