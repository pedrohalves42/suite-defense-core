import { test, expect } from '@playwright/test';
import { loginAsAdmin } from './helpers/auth';
import { hasRequiredEnvVars } from './helpers/backend-client';
import { TEST_CONFIG } from './test-config';
import * as fs from 'fs';
import * as path from 'path';

const SUPABASE_URL = process.env.VITE_SUPABASE_URL || 'https://iavbnmduxpxhwubqrzzn.supabase.co';
const SUPABASE_ANON_KEY = process.env.VITE_SUPABASE_PUBLISHABLE_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk';

/**
 * Resolve the versioned agent script path dynamically.
 * Searches public/agent-scripts/ for the latest Windows script,
 * falling back to the legacy unversioned path.
 */
function resolveAgentScriptPath(): string {
  const searchDir = path.join(process.cwd(), 'public', 'agent-scripts');

  if (fs.existsSync(searchDir)) {
    const files = fs.readdirSync(searchDir)
      .filter(f => f.startsWith('cybershield-agent-windows') && f.endsWith('.ps1'))
      .sort()
      .reverse(); // latest version first

    if (files.length > 0) {
      return path.join(searchDir, files[0]);
    }
  }

  // Legacy fallback
  return path.join(process.cwd(), 'agent-scripts', 'cybershield-agent-windows.ps1');
}

test.describe('Windows Agent Installation E2E', () => {
  let authToken: string;
  let installScript: string;
  let agentName: string;

  test.beforeAll(async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      console.log('[SKIP] Missing required environment variables');
      return;
    }

    agentName = `test-installer-${Date.now()}`;

    // Login using TEST_CONFIG
    const loginResponse = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      headers: {
        'apikey': SUPABASE_ANON_KEY,
        'Content-Type': 'application/json',
      },
      data: {
        email: TEST_CONFIG.credentials.email,
        password: TEST_CONFIG.credentials.password,
      },
    });

    expect(loginResponse.ok()).toBeTruthy();
    const loginData = await loginResponse.json();
    authToken = loginData.access_token;
  });

  test('1. Login como admin e gerar script de instalacao', async ({ request }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    // Gerar credenciais para instalacao
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

  test('2. Validar estrutura do script de instalacao gerado', async ({ page }) => {
    if (!hasRequiredEnvVars()) {
      test.skip();
      return;
    }

    // Login
    const success = await loginAsAdmin(page);
    expect(success).toBe(true);

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

    // Aguardar geracao
    await page.waitForTimeout(3000);

    // Buscar o script gerado no codigo da pagina
    const scriptContent = await page.evaluate(() => {
      const preElement = document.querySelector('pre');
      return preElement ? preElement.textContent : null;
    });

    expect(scriptContent).toBeTruthy();
    installScript = scriptContent!;

    console.log('✓ Script de instalacao gerado');
    console.log(`  Tamanho: ${installScript.length} caracteres`);

    // Validacoes do script
    expect(installScript).toContain('CyberShield Agent Installer');
    expect(installScript).toContain('$AgentToken');
    expect(installScript).toContain('$HmacSecret');
    expect(installScript).toContain('$ServerUrl');
    expect(installScript).toContain('Register-ScheduledTask');
    expect(installScript).toContain('Validando permissoes');
    expect(installScript).toContain('isAdmin');
    
    console.log('✓ Validacoes de estrutura do script passaram');
  });

  test('3. Validar checagem de privilegios administrativos', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar se script valida privilegios admin
    expect(installScript).toContain('Security.Principal.WindowsPrincipal');
    expect(installScript).toContain('Security.Principal.WindowsIdentity');
    expect(installScript).toContain('IsInRole');
    expect(installScript).toContain('Administrator');

    // Verificar se script para execucao se nao for admin
    expect(installScript).toContain('exit 1');
    expect(installScript).toContain('Privilegios Administrativos');

    console.log('✓ Validacao de privilegios administrativos presente no script');
  });

  test('4. Validar criacao de diretorios e arquivos', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar se script cria diretorios necessarios
    expect(installScript).toContain('C:\\CyberShield');
    expect(installScript).toContain('New-Item -ItemType Directory');
    expect(installScript).toContain('logs');

    // Verificar se script salva arquivo do agente
    expect(installScript).toContain('Out-File');
    expect(installScript).toContain('agent.ps1');

    console.log('✓ Criacao de diretorios e arquivos validada');
  });

  test('5. Validar configuracao da tarefa agendada', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

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

    // Verificar validacao da tarefa criada
    expect(installScript).toContain('Get-ScheduledTask');
    expect(installScript).toContain('taskCreated');

    console.log('✓ Configuracao da tarefa agendada validada');
  });

  test('6. Validar teste de conectividade com servidor', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar se script testa conectividade
    expect(installScript).toContain('Testando conectividade');
    expect(installScript).toContain('Invoke-WebRequest');
    expect(installScript).toContain('heartbeat');
    expect(installScript).toContain('X-Agent-Token');
    expect(installScript).toContain('TimeoutSec');

    console.log('✓ Teste de conectividade presente no script');
  });

  test('7. Validar tratamento de erros robusto', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar try-catch
    expect(installScript).toContain('try {');
    expect(installScript).toContain('catch {');

    // Verificar mensagens de erro detalhadas
    expect(installScript).toContain('ERRO NA INSTALACAO');
    expect(installScript).toContain('Stack Trace');
    expect(installScript).toContain('Diagnostico Detalhado');
    expect(installScript).toContain('Execute como Administrador');
    expect(installScript).toContain('Task Scheduler');

    console.log('✓ Tratamento de erros robusto validado');
  });

  test('8. Validar mensagens de sucesso e proximos passos', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar mensagens de progresso
    expect(installScript).toMatch(/\[0\/5\]|\[1\/5\]|\[2\/5\]|\[3\/5\]|\[4\/5\]|\[5\/5\]/);

    // Verificar mensagem de sucesso
    expect(installScript).toContain('INSTALACAO CONCLUIDA');
    expect(installScript).toContain('Proximos passos');
    expect(installScript).toContain('dashboard');

    // Verificar instrucoes de logs
    expect(installScript).toContain('Get-Content');
    expect(installScript).toContain('agent.log');

    console.log('✓ Mensagens de progresso e sucesso validadas');
  });

  test('9. Salvar script para teste manual (opcional)', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Criar pasta de testes se nao existir
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
    console.log('1. Copie o arquivo para uma maquina Windows');
    console.log('2. Execute como Administrador:');
    console.log(`   powershell -ExecutionPolicy Bypass -File "${path.basename(scriptPath)}"`);
    console.log('3. Verifique logs em: C:\\CyberShield\\logs\\agent.log');
    console.log('4. Confirme status no dashboard');
  });

  test('10. Validar compatibilidade com Windows Server', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar se script nao usa comandos incompativeis com Server 2012
    const incompatibleCommands = [
      'Install-WindowsFeature', // Pode nao estar disponivel em Server 2012 Core
      'Enable-WindowsOptionalFeature', // Requer DISM
    ];

    for (const cmd of incompatibleCommands) {
      expect(installScript).not.toContain(cmd);
    }

    // Verificar uso de comandos compativeis
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

  test('11. Validar correcoes criticas - Parameter Validation', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar validacao de parametros obrigatorios
    expect(installScript).toContain('param(');
    expect(installScript).toContain('Mandatory=$true');
    expect(installScript).toContain('$AgentToken');
    expect(installScript).toContain('$HmacSecret');
    expect(installScript).toContain('$ServerUrl');

    // Verificar validacao de formato dos parametros
    expect(installScript).toMatch(/if.*AgentToken.*-notmatch|if.*String.*IsNullOrWhiteSpace/i);
    expect(installScript).toMatch(/if.*HmacSecret.*-notmatch|if.*String.*IsNullOrWhiteSpace/i);

    console.log('✓ Validacao de parametros implementada');
  });

  test('12. Validar correcoes criticas - Retry Logic', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar retry logic em Send-Heartbeat
    expect(installScript).toContain('Send-Heartbeat');
    expect(installScript).toMatch(/for.*\$attempt.*1\.\.\d+|while.*attempt.*maxAttempts/i);
    expect(installScript).toMatch(/Start-Sleep.*\d+/);

    // Verificar backoff exponencial ou linear
    expect(installScript).toMatch(/Sleep.*attempt|Sleep.*\*/);

    console.log('✓ Retry logic implementada em heartbeat');
  });

  test('13. Validar correcoes criticas - System Health Test', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar funcao Test-SystemHealth
    expect(installScript).toContain('Test-SystemHealth');
    
    // Verificar retry em connectivity test
    expect(installScript).toMatch(/Test.*connectivity|Test.*health/i);
    expect(installScript).toMatch(/attempt.*connectivity/i);

    console.log('✓ Test de system health com retry implementado');
  });

  test('14. Validar correcoes criticas - Error Logging', async () => {
    if (!hasRequiredEnvVars() || !installScript) {
      test.skip();
      return;
    }

    // Verificar logging detalhado
    expect(installScript).toContain('Write-Host');
    expect(installScript).toMatch(/\[ERROR\]|\[ERRO\]/);
    expect(installScript).toMatch(/\[INFO\]|\[SUCESSO\]/);
    expect(installScript).toMatch(/\[WARNING\]|\[AVISO\]/);

    // Verificar logs em arquivo
    expect(installScript).toMatch(/Out-File.*log|Add-Content.*log/);

    console.log('✓ Sistema de logging detalhado implementado');
  });
});

test.describe('Agent Script Validation', () => {
  test('Validar script standalone do agente', async () => {
    const agentScriptPath = resolveAgentScriptPath();
    
    if (!fs.existsSync(agentScriptPath)) {
      throw new Error(
        `Script do agente não encontrado. Caminhos verificados:\n` +
        `  - public/agent-scripts/cybershield-agent-windows-v*.ps1\n` +
        `  - agent-scripts/cybershield-agent-windows.ps1\n` +
        `Certifique-se de que o script está no repositório.`
      );
    }

    console.log(`✓ Script encontrado: ${agentScriptPath}`);
    const agentScript = fs.readFileSync(agentScriptPath, 'utf8');

    // Validar parametros obrigatorios
    expect(agentScript).toContain('param(');
    expect(agentScript).toContain('Parameter(Mandatory=$true)');
    expect(agentScript).toContain('$AgentToken');
    expect(agentScript).toContain('$HmacSecret');
    expect(agentScript).toContain('$ServerUrl');

    // Validar funcoes principais
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
    expect(agentScript).not.toContain('ConvertTo-Json -Depth'); // -Depth nao existe no PS 2.0

    console.log('✓ Script standalone do agente validado');
  });
});
