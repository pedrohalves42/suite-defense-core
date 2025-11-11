import { test, expect } from '@playwright/test';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iavbnmduxpxhwubqrzzn.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk';

test.describe('Windows Agent Installation E2E', () => {
  let authToken: string;
  let installScript: string;
  let agentName: string;

  test.beforeAll(async () => {
    agentName = `test-installer-${Date.now()}`;
  });

  test('1. Login como admin e gerar script de instalação', async ({ request }) => {
    // Login
    const loginResponse = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        email: process.env.TEST_ADMIN_EMAIL || 'pedrohalves42@gmail.com',
        password: process.env.TEST_ADMIN_PASSWORD || 'Test1234!',
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    authToken = loginData.access_token;

    // Gerar credenciais para instalação
    const enrollResponse = await request.post(`${SUPABASE_URL}/functions/v1/auto-generate-enrollment`, {
      headers: {
        'Authorization': `Bearer ${authToken}`,
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        agentName: agentName,
      },
    });

    expect(enrollResponse.ok()).toBeTruthy();
    const enrollData = await enrollResponse.json();
    
    expect(enrollData.agentToken).toBeTruthy();
    expect(enrollData.hmacSecret).toBeTruthy();
    expect(enrollData.enrollmentKey).toBeTruthy();

    console.log(`✓ Credenciais geradas para agente: ${agentName}`);
    console.log(`  - Agent Token: ${enrollData.agentToken.substring(0, 20)}...`);
    console.log(`  - Enrollment Key: ${enrollData.enrollmentKey.substring(0, 20)}...`);
  });

  test('2. Validar estrutura do script de instalação gerado', async ({ page }) => {
    // Navegar para página de instalação
    await page.goto('/');
    
    // Fazer login (se necessário)
    const loginButton = page.locator('button:has-text("Login")');
    if (await loginButton.isVisible({ timeout: 2000 }).catch(() => false)) {
      await page.fill('input[type="email"]', process.env.TEST_ADMIN_EMAIL || 'pedrohalves42@gmail.com');
      await page.fill('input[type="password"]', process.env.TEST_ADMIN_PASSWORD || 'Test1234!');
      await loginButton.click();
      await page.waitForURL('/dashboard', { timeout: 10000 });
    }

    // Navegar para instalador
    await page.goto('/agent-installer');
    await page.waitForLoadState('networkidle');

    // Preencher nome do agente
    const agentNameInput = page.locator('input[placeholder*="nome"], input[type="text"]').first();
    await agentNameInput.fill(`e2e-test-${Date.now()}`);

    // Selecionar plataforma Windows
    const windowsButton = page.locator('button:has-text("Windows")');
    await windowsButton.click();

    // Clicar em gerar credenciais
    const generateButton = page.locator('button:has-text("Gerar")');
    await generateButton.click();

    // Aguardar geração
    await page.waitForTimeout(3000);

    // Buscar o script gerado no código da página
    const scriptContent = await page.evaluate(() => {
      const preElement = document.querySelector('pre');
      return preElement ? preElement.textContent : null;
    });

    expect(scriptContent).toBeTruthy();
    installScript = scriptContent!;

    console.log('✓ Script de instalação gerado');
    console.log(`  Tamanho: ${installScript.length} caracteres`);

    // Validações do script
    expect(installScript).toContain('CyberShield Agent Installer');
    expect(installScript).toContain('$AgentToken');
    expect(installScript).toContain('$HmacSecret');
    expect(installScript).toContain('$ServerUrl');
    expect(installScript).toContain('Register-ScheduledTask');
    expect(installScript).toContain('Validando permissões');
    expect(installScript).toContain('isAdmin');
    
    console.log('✓ Validações de estrutura do script passaram');
  });

  test('3. Validar checagem de privilégios administrativos', async () => {
    expect(installScript).toBeTruthy();

    // Verificar se script valida privilégios admin
    expect(installScript).toContain('Security.Principal.WindowsPrincipal');
    expect(installScript).toContain('Security.Principal.WindowsIdentity');
    expect(installScript).toContain('IsInRole');
    expect(installScript).toContain('Administrator');

    // Verificar se script para execução se não for admin
    expect(installScript).toContain('exit 1');
    expect(installScript).toContain('Privilégios Administrativos');

    console.log('✓ Validação de privilégios administrativos presente no script');
  });

  test('4. Validar criação de diretórios e arquivos', async () => {
    // Verificar se script cria diretórios necessários
    expect(installScript).toContain('C:\\CyberShield');
    expect(installScript).toContain('New-Item -ItemType Directory');
    expect(installScript).toContain('logs');

    // Verificar se script salva arquivo do agente
    expect(installScript).toContain('Out-File');
    expect(installScript).toContain('agent.ps1');

    console.log('✓ Criação de diretórios e arquivos validada');
  });

  test('5. Validar configuração da tarefa agendada', async () => {
    // Verificar se script cria tarefa agendada
    expect(installScript).toContain('Register-ScheduledTask');
    expect(installScript).toContain('CyberShieldAgent');
    expect(installScript).toContain('New-ScheduledTaskAction');
    expect(installScript).toContain('New-ScheduledTaskTrigger');
    expect(installScript).toContain('-AtStartup');

    // Verificar se roda como SYSTEM
    expect(installScript).toContain('SYSTEM');
    expect(installScript).toContain('ServiceAccount');
    expect(installScript).toContain('RunLevel Highest');

    // Verificar validação da tarefa criada
    expect(installScript).toContain('Get-ScheduledTask');
    expect(installScript).toContain('taskCreated');

    console.log('✓ Configuração da tarefa agendada validada');
  });

  test('6. Validar teste de conectividade com servidor', async () => {
    // Verificar se script testa conectividade
    expect(installScript).toContain('Testando conectividade');
    expect(installScript).toContain('Invoke-WebRequest');
    expect(installScript).toContain('heartbeat');
    expect(installScript).toContain('X-Agent-Token');
    expect(installScript).toContain('TimeoutSec');

    console.log('✓ Teste de conectividade presente no script');
  });

  test('7. Validar tratamento de erros robusto', async () => {
    // Verificar try-catch
    expect(installScript).toContain('try {');
    expect(installScript).toContain('catch {');

    // Verificar mensagens de erro detalhadas
    expect(installScript).toContain('ERRO NA INSTALAÇÃO');
    expect(installScript).toContain('Stack Trace');
    expect(installScript).toContain('Diagnóstico Detalhado');
    expect(installScript).toContain('Execute como Administrador');
    expect(installScript).toContain('Task Scheduler');

    console.log('✓ Tratamento de erros robusto validado');
  });

  test('8. Validar mensagens de sucesso e próximos passos', async () => {
    // Verificar mensagens de progresso
    expect(installScript).toMatch(/\[0\/5\]|\[1\/5\]|\[2\/5\]|\[3\/5\]|\[4\/5\]|\[5\/5\]/);

    // Verificar mensagem de sucesso
    expect(installScript).toContain('INSTALAÇÃO CONCLUÍDA');
    expect(installScript).toContain('Próximos passos');
    expect(installScript).toContain('dashboard');

    // Verificar instruções de logs
    expect(installScript).toContain('Get-Content');
    expect(installScript).toContain('agent.log');

    console.log('✓ Mensagens de progresso e sucesso validadas');
  });

  test('9. Salvar script para teste manual (opcional)', async () => {
    // Criar pasta de testes se não existir
    const testDir = path.join(process.cwd(), 'tests', 'generated');
    if (!fs.existsSync(testDir)) {
      fs.mkdirSync(testDir, { recursive: true });
    }

    // Salvar script
    const scriptPath = path.join(testDir, `install-agent-${Date.now()}.ps1`);
    fs.writeFileSync(scriptPath, installScript, 'utf8');

    console.log(`✓ Script salvo para teste manual: ${scriptPath}`);
    console.log('');
    console.log('Para testar manualmente no Windows:');
    console.log('1. Copie o arquivo para uma máquina Windows');
    console.log('2. Execute como Administrador:');
    console.log(`   powershell -ExecutionPolicy Bypass -File "${path.basename(scriptPath)}"`);
    console.log('3. Verifique logs em: C:\\CyberShield\\logs\\agent.log');
    console.log('4. Confirme status no dashboard');
  });

  test('10. Validar compatibilidade com Windows Server', async () => {
    // Verificar se script não usa comandos incompatíveis com Server 2012
    const incompatibleCommands = [
      'Install-WindowsFeature', // Pode não estar disponível em Server 2012 Core
      'Enable-WindowsOptionalFeature', // Requer DISM
    ];

    for (const cmd of incompatibleCommands) {
      expect(installScript).not.toContain(cmd);
    }

    // Verificar uso de comandos compatíveis
    const compatibleCommands = [
      'New-Item',
      'Register-ScheduledTask',
      'Invoke-WebRequest',
      'Get-ScheduledTask',
    ];

    for (const cmd of compatibleCommands) {
      expect(installScript).toContain(cmd);
    }

    console.log('✓ Compatibilidade com Windows Server validada');
  });
});

test.describe('Agent Script Validation', () => {
  test('Validar script standalone do agente', async () => {
    // Ler script do agente Windows
    const agentScriptPath = path.join(process.cwd(), 'agent-scripts', 'cybershield-agent-windows.ps1');
    
    if (!fs.existsSync(agentScriptPath)) {
      console.warn(`⚠ Script não encontrado: ${agentScriptPath}`);
      test.skip();
      return;
    }

    const agentScript = fs.readFileSync(agentScriptPath, 'utf8');

    // Validar parâmetros obrigatórios
    expect(agentScript).toContain('param(');
    expect(agentScript).toContain('Parameter(Mandatory=$true)');
    expect(agentScript).toContain('$AgentToken');
    expect(agentScript).toContain('$HmacSecret');
    expect(agentScript).toContain('$ServerUrl');

    // Validar funções principais
    expect(agentScript).toContain('function Get-HmacSignature');
    expect(agentScript).toContain('function Invoke-SecureRequest');
    expect(agentScript).toContain('function Send-Heartbeat');
    expect(agentScript).toContain('function Poll-Jobs');
    expect(agentScript).toContain('function Execute-Job');
    expect(agentScript).toContain('function Upload-Report');

    // Validar HMAC correto
    expect(agentScript).toContain('${timestamp}:${nonce}:${bodyJson}');
    expect(agentScript).toContain('ToUnixTimeMilliseconds()');

    // Validar compatibilidade Windows Server 2012+
    expect(agentScript).toContain('System.Security.Cryptography.HMACSHA256');
    expect(agentScript).not.toContain('ConvertTo-Json -Depth'); // -Depth não existe no PS 2.0

    console.log('✓ Script standalone do agente validado');
  });
});
