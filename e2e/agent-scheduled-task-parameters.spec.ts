import { test, expect } from '@playwright/test';
import { supabase } from '../src/integrations/supabase/client';

test.describe('Agent Scheduled Task Parameters', () => {
  test('should create scheduled task with correct parameters and send heartbeat', async ({ page }) => {
    test.setTimeout(180000); // 3 minutos para instalação completa

    // Login como admin
    await page.goto('/login');
    await page.fill('input[type="email"]', 'admin@test.com');
    await page.fill('input[type="password"]', 'Test123!@#');
    await page.click('button[type="submit"]');
    await page.waitForURL('/admin/dashboard');

    // Navegar para Agent Installer
    await page.goto('/admin/agent-installer');
    await page.waitForSelector('h1:has-text("Agent Installer")');

    // Gerar nome único de agente
    const timestamp = Date.now();
    const agentName = `test-params-${timestamp}`;

    // Criar enrollment key
    await page.fill('input[placeholder*="nome"]', agentName);
    await page.click('button:has-text("Gerar")');
    
    // Aguardar código de enrollment aparecer
    await page.waitForSelector('text=/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/', { timeout: 30000 });
    
    // Copiar comando PowerShell
    const commandButton = page.locator('button:has-text("Copiar")').first();
    await commandButton.click();

    // Obter enrollment code do texto da página
    const enrollmentCodeElement = await page.locator('text=/[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}/').first();
    const enrollmentCode = await enrollmentCodeElement.textContent();
    
    console.log(`✅ Enrollment code gerado: ${enrollmentCode}`);

    // Simular instalação: buscar dados da enrollment key do banco
    const { data: enrollmentData, error: enrollmentError } = await supabase
      .from('enrollment_keys')
      .select('*')
      .eq('key', enrollmentCode)
      .single();

    expect(enrollmentError).toBeNull();
    expect(enrollmentData).not.toBeNull();
    console.log(`✅ Enrollment key encontrada no banco`);

    // Verificar que o agente foi criado no banco
    const { data: agentData, error: agentError } = await supabase
      .from('agents')
      .select('*')
      .eq('agent_name', agentName)
      .single();

    expect(agentError).toBeNull();
    expect(agentData).not.toBeNull();
    expect(agentData.status).toBe('pending');
    expect(agentData.last_heartbeat).toBeNull();
    console.log(`✅ Agente criado no banco: ${agentData.id}`);

    // Buscar token do agente
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('token')
      .eq('agent_id', agentData.id)
      .eq('is_active', true)
      .single();

    expect(tokenError).toBeNull();
    expect(tokenData).not.toBeNull();
    console.log(`✅ Token do agente encontrado`);

    // Verificar que HMAC secret foi gerado
    expect(agentData.hmac_secret).not.toBeNull();
    expect(agentData.hmac_secret.length).toBe(64);
    console.log(`✅ HMAC secret gerado: ${agentData.hmac_secret.substring(0, 16)}...`);

    // Simular instalação telemetry
    const { data: telemetryData, error: telemetryError } = await supabase.functions.invoke(
      'post-installation-telemetry',
      {
        body: {
          agent_token: tokenData.token,
          agent_name: agentName,
          platform: 'windows',
          success: true,
          installation_method: 'powershell',
          installation_time_seconds: 45,
          network_connectivity: true,
          metadata: {
            test: 'e2e-scheduled-task-parameters',
            scheduled_task_created: true,
            parameters_included: true
          }
        }
      }
    );

    console.log(`✅ Telemetria de instalação enviada`);

    // TESTE CRÍTICO: Verificar que instalador incluiria os parâmetros na Scheduled Task
    // (Não podemos executar PowerShell real no E2E, mas podemos verificar a lógica)
    
    // Verificar que o template do installer contém os parâmetros necessários
    const { data: installerScript, error: installerError } = await supabase.functions.invoke(
      'serve-installer',
      {
        body: { enrollment_code: enrollmentCode }
      }
    );

    expect(installerError).toBeNull();
    expect(installerScript).toContain('-AgentToken');
    expect(installerScript).toContain('-HmacSecret');
    expect(installerScript).toContain('-ServerUrl');
    expect(installerScript).toContain('-PollInterval');
    console.log(`✅ Installer script contém todos os parâmetros necessários`);

    // Simular primeiro heartbeat (o que DEVERIA acontecer após instalação real)
    const { data: heartbeatData, error: heartbeatError } = await supabase.functions.invoke(
      'heartbeat',
      {
        body: {
          agent_token: tokenData.token,
          os_type: 'Windows',
          os_version: 'Windows Server 2022',
          hostname: 'TEST-SERVER-E2E'
        }
      }
    );

    console.log(`✅ Heartbeat simulado enviado`);

    // Aguardar 5 segundos para processamento
    await page.waitForTimeout(5000);

    // Verificar que last_heartbeat foi atualizado no banco
    const { data: updatedAgent, error: updatedError } = await supabase
      .from('agents')
      .select('last_heartbeat, status')
      .eq('id', agentData.id)
      .single();

    expect(updatedError).toBeNull();
    expect(updatedAgent.last_heartbeat).not.toBeNull();
    expect(updatedAgent.status).toBe('online');
    console.log(`✅ Agente atualizado: status=${updatedAgent.status}, last_heartbeat=${updatedAgent.last_heartbeat}`);

    // Verificar analytics de instalação
    const { data: analyticsData, error: analyticsError } = await supabase
      .from('installation_analytics')
      .select('*')
      .eq('agent_name', agentName)
      .order('created_at', { ascending: false });

    expect(analyticsError).toBeNull();
    expect(analyticsData.length).toBeGreaterThan(0);
    
    const postInstallEvent = analyticsData.find(e => 
      e.event_type === 'post_installation' || e.event_type === 'post_installation_unverified'
    );
    expect(postInstallEvent).not.toBeUndefined();
    expect(postInstallEvent.success).toBe(true);
    console.log(`✅ Telemetria de instalação registrada corretamente`);

    // Navegar para Agent Diagnostics
    await page.goto('/admin/agent-diagnostics');
    await page.waitForSelector('h1:has-text("Agent Diagnostics")');

    // Verificar que agente aparece na lista
    await expect(page.locator(`text=${agentName}`)).toBeVisible();

    // Verificar que NÃO há alerta de "agentes sem comunicação" para este agente
    const alertCount = await page.locator('text=/agente.*nunca enviaram heartbeat/i').count();
    // Se houver outros agentes problemáticos, pode haver alert, mas nosso agente deve estar OK
    
    // Selecionar o agente e verificar diagnóstico
    await page.click(`text=${agentName}`);
    await page.waitForTimeout(2000);

    // Deve mostrar status "healthy" ou sem issues críticos
    const healthyIndicator = page.locator('text=/healthy|nenhum problema/i');
    await expect(healthyIndicator).toBeVisible({ timeout: 10000 });

    console.log(`✅ Teste completo! Agente ${agentName} instalado, heartbeat enviado e diagnóstico OK`);
  });

  test('should detect missing parameters in scheduled task', async ({ page }) => {
    // Este teste seria executado se simulássemos uma task SEM parâmetros
    // Por enquanto, apenas documentamos o comportamento esperado
    test.skip(); // Implementar quando tivermos ambiente de teste Windows real

    // Comportamento esperado:
    // 1. Task criada sem -AgentToken → Agent nunca envia heartbeat
    // 2. Logs do installer mostram WARNING sobre parâmetros faltando
    // 3. Dashboard de Diagnostics mostra agente como "Nunca Conectou"
    // 4. Função diagnose_agent_issues() retorna issue_type='invalid_token'
  });
});
