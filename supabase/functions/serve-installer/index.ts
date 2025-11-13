import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { validateAgentScript } from '../_shared/agent-script-validator.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

// Validate agent script on startup
const scriptValidation = await validateAgentScript();
if (!scriptValidation.valid) {
  console.error('[CRITICAL] Agent script validation failed:', scriptValidation.error);
  throw new Error(`serve-installer startup failed: ${scriptValidation.error}`);
}
console.log('[STARTUP] Agent script validated:', scriptValidation.details);

// Windows Installer v3.0.0-APEX - Universal, Robust, Production-Ready
const WINDOWS_INSTALLER_TEMPLATE = `# CyberShield Agent - Windows Installation Script v3.0.0-APEX
# Auto-generated: {{TIMESTAMP}}
# APEX BUILD - Universal, Robust, Production-Ready

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v3.0.0-APEX" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Verificar privilégios de administrador
$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERRO: Este script requer privilégios de administrador" -ForegroundColor Red
    Write-Host "Clique direito no arquivo e selecione 'Executar como Administrador'" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Verificar versão do PowerShell
if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "ERRO: Este script requer PowerShell 5.1 ou superior" -ForegroundColor Red
    Write-Host "Versão atual: $($PSVersionTable.PSVersion)" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Configuração
$AgentToken = "{{AGENT_TOKEN}}"
$HmacSecret = "{{HMAC_SECRET}}"
$ServerUrl = "{{SERVER_URL}}"
$PollInterval = 60

# Validar parâmetros
if ([string]::IsNullOrWhiteSpace($AgentToken) -or $AgentToken -eq "{{AGENT_TOKEN}}") {
    Write-Host "ERRO: Token do agente não configurado" -ForegroundColor Red
    Write-Host "Por favor, gere um novo instalador através do dashboard web" -ForegroundColor Yellow
    Read-Host "Pressione Enter para sair"
    exit 1
}

# Diretório de instalação
$InstallDir = "C:\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"

# Função de log de instalação
function Write-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    "$timestamp - $Message" | Out-File $InstallLog -Append
    Write-Host $Message
}

try {
    Write-InstallLog "[1/8] Criando diretórios de instalação..."
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Write-InstallLog "✓ Diretórios criados com sucesso"

    # Configurar proxy e TLS globalmente
    Write-InstallLog "[2/8] Configurando rede (TLS 1.2 + Proxy)..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
    $proxyUri = $proxy.GetProxy((New-Object System.Uri("https://www.google.com")))
    
    if ($proxyUri -ne "https://www.google.com") {
        Write-InstallLog "Proxy detectado: $proxyUri"
        [System.Net.WebRequest]::DefaultWebProxy = $proxy
        [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
    } else {
        Write-InstallLog "Nenhum proxy detectado - conexão direta"
    }
    Write-InstallLog "✓ TLS 1.2 habilitado e proxy configurado"

    # Health check inicial
    Write-InstallLog "[3/8] Testando conectividade com backend..."
    $healthCheck = $false
    $healthUrls = @(
        "$ServerUrl/functions/v1/heartbeat",
        "$ServerUrl/functions/v1/post-installation-telemetry",
        "https://www.google.com"
    )

    foreach ($url in $healthUrls) {
        try {
            $response = Invoke-WebRequest -Uri $url -Method OPTIONS -TimeoutSec 5 -UseBasicParsing -ErrorAction Stop
            Write-InstallLog "✓ Conectividade OK: $url (Status: $($response.StatusCode))"
            $healthCheck = $true
            break
        } catch {
            Write-InstallLog "✗ Falha ao conectar: $url - $_"
        }
    }

    if (-not $healthCheck) {
        Write-Host ""
        Write-Host "⚠ AVISO: Não foi possível conectar ao backend." -ForegroundColor Yellow
        Write-Host "Possíveis causas:" -ForegroundColor Yellow
        Write-Host "  1. Firewall bloqueando HTTPS (porta 443)" -ForegroundColor Gray
        Write-Host "  2. Proxy corporativo não configurado" -ForegroundColor Gray
        Write-Host "  3. Servidor backend offline" -ForegroundColor Gray
        Write-Host ""
        $continue = Read-Host "Continuar instalação mesmo assim? (S/N)"
        if ($continue -ne "S") {
            Write-InstallLog "Instalação cancelada pelo usuário (sem conectividade)"
            exit 1
        }
    }

    Write-InstallLog "[4/8] Baixando script do agente..."
    
    # Conteúdo do script do agente (embedded)
$AgentContent = @"
{{AGENT_SCRIPT_CONTENT}}
"@

    # Salvar script do agente
    Set-Content -Path $AgentScript -Value $AgentContent -Encoding UTF8 -Force
    Write-InstallLog "✓ Script do agente salvo em: $AgentScript"

    Write-InstallLog "[5/8] Configurando regra de firewall..."
    try {
        # Remover regras antigas se existirem
        $existingRule = Get-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue
        if ($existingRule) {
            Remove-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue
        }
        
        # Criar nova regra de firewall
        New-NetFirewallRule -DisplayName "CyberShield Agent" \`
                           -Direction Outbound \`
                           -Action Allow \`
                           -Protocol TCP \`
                           -RemotePort 443 \`
                           -Program "powershell.exe" \`
                           -Description "Permite comunicação do CyberShield Agent com o servidor" \`
                           -ErrorAction Stop | Out-Null
        Write-InstallLog "✓ Regra de firewall configurada"
    } catch {
        Write-InstallLog "⚠ Não foi possível criar regra de firewall: $($_.Exception.Message)"
    }

    Write-InstallLog "[6/8] Criando tarefa agendada..."

    $taskName = "CyberShield Agent"
    $taskDescription = "CyberShield Security Agent - Monitora o sistema e reporta ao servidor central"

    # Remover tarefa existente se presente
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Write-InstallLog "  Removendo tarefa antiga..."
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    }

    # Criar ação
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" \`
        -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$AgentScript\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -ServerUrl \`"$ServerUrl\`" -PollInterval $PollInterval"

    # Criar trigger (na inicialização do sistema)
    $trigger = New-ScheduledTaskTrigger -AtStartup

    # Criar configurações
    $settings = New-ScheduledTaskSettingsSet \`
        -AllowStartIfOnBatteries \`
        -DontStopIfGoingOnBatteries \`
        -StartWhenAvailable \`
        -RestartCount 3 \`
        -RestartInterval (New-TimeSpan -Minutes 1) \`
        -ExecutionTimeLimit (New-TimeSpan -Days 365)

    # Criar principal (executar como SYSTEM com privilégios máximos)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    # Registrar tarefa
    Register-ScheduledTask \`
        -TaskName $taskName \`
        -Description $taskDescription \`
        -Action $action \`
        -Trigger $trigger \`
        -Settings $settings \`
        -Principal $principal \`
        -Force | Out-Null

    Write-InstallLog "✓ Tarefa agendada criada com sucesso"

    Write-InstallLog "[7/8] Iniciando o agente..."

    # Iniciar a tarefa
    Start-ScheduledTask -TaskName $taskName

    # Aguardar um momento para a tarefa iniciar
    Start-Sleep -Seconds 3

    # Verificar se a tarefa está rodando
    $task = Get-ScheduledTask -TaskName $taskName
    $taskState = $task.State
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName

    Write-Host ""
    Write-Host "==================================" -ForegroundColor Green
    Write-Host "✓ INSTALAÇÃO CONCLUÍDA COM SUCESSO!" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green
    Write-Host ""

    if ($taskState -eq "Running") {
        Write-Host "Status do Agente: " -NoNewline
        Write-Host "RODANDO" -ForegroundColor Green
    } else {
        Write-Host "Status do Agente: " -NoNewline
        Write-Host "$taskState" -ForegroundColor Yellow
    }

    Write-Host ""
    Write-Host "INFORMAÇÕES DA INSTALAÇÃO:" -ForegroundColor Cyan
    Write-Host "  • Diretório: $InstallDir" -ForegroundColor White
    Write-Host "  • Logs: $LogDir\agent.log" -ForegroundColor White
    Write-Host "  • Logs de instalação: $InstallLog" -ForegroundColor White
    Write-Host "  • Tarefa: $taskName" -ForegroundColor White
    Write-Host "  • Última execução: $($taskInfo.LastRunTime)" -ForegroundColor White
    Write-Host ""
    Write-Host "O AGENTE ESTÁ:" -ForegroundColor Cyan
    Write-Host "  ✓ Monitorando este sistema" -ForegroundColor White
    Write-Host "  ✓ Enviando heartbeats a cada 60 segundos" -ForegroundColor White
    Write-Host "  ✓ Reportando métricas a cada 5 minutos" -ForegroundColor White
    Write-Host "  ✓ Buscando jobs para executar" -ForegroundColor White
    Write-Host ""

    # Enviar telemetria pós-instalação
    Write-InstallLog "[8/8] Enviando telemetria pós-instalação..."
    try {
        $telemetryBody = @{
            agent_name = "{{AGENT_NAME}}"
            success = $true
            os_version = (Get-WmiObject Win32_OperatingSystem).Caption
            installation_time = (Get-Date).ToUniversalTime().ToString("o")
            network_tests = @{
                health_check_passed = $healthCheck
                proxy_detected = ($proxyUri -ne "https://www.google.com")
            }
        } | ConvertTo-Json
        
        Invoke-RestMethod -Uri "$ServerUrl/functions/v1/post-installation-telemetry" \`
            -Method POST \`
            -Body $telemetryBody \`
            -ContentType "application/json" \`
            -TimeoutSec 10 \`
            -ErrorAction SilentlyContinue | Out-Null
        
        Write-InstallLog "✓ Telemetria enviada com sucesso"
    } catch {
        Write-InstallLog "⚠ Telemetria falhou (não crítico): $_"
    }

    Write-Host ""
    Write-Host "COMANDOS ÚTEIS:" -ForegroundColor Yellow
    Write-Host "  Ver logs do agente:" -ForegroundColor White
    Write-Host "    Get-Content $LogDir\agent.log -Tail 50" -ForegroundColor Gray
    Write-Host "  Ver logs de instalação:" -ForegroundColor White
    Write-Host "    Get-Content $InstallLog" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Parar o agente:" -ForegroundColor White
    Write-Host "    Stop-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Iniciar o agente:" -ForegroundColor White
    Write-Host "    Start-ScheduledTask -TaskName '$taskName'" -ForegroundColor Gray
    Write-Host ""
    Write-Host "  Status da tarefa:" -ForegroundColor White
    Write-Host "    Get-ScheduledTask -TaskName '$taskName' | Format-List" -ForegroundColor Gray
    Write-Host ""

    # Instalador "Keep-Alive" - monitorar agente por 60 segundos
    Write-Host ""
    Write-Host "Instalação concluída! Monitorando agente por 60 segundos..." -ForegroundColor Cyan
    Write-Host "Feche esta janela a qualquer momento." -ForegroundColor Gray
    Write-Host ""

    for ($i = 1; $i -le 12; $i++) {
        Start-Sleep -Seconds 5
        $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName -ErrorAction SilentlyContinue
        
        Write-Host "[$i/12] Task Status: $($task.State) | Last Result: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
        
        if ($task.State -eq "Running") {
            Write-Host "✓ Agente está rodando!" -ForegroundColor Green
        }
    }

    Write-Host ""
    Write-Host "Monitoramento concluído. Instalador será fechado em 10 segundos..." -ForegroundColor Yellow
    Start-Sleep -Seconds 10

} catch {
    Write-Host ""
    Write-Host "==================================" -ForegroundColor Red
    Write-Host "ERRO DURANTE A INSTALAÇÃO" -ForegroundColor Red
    Write-Host "==================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Detalhes do erro:" -ForegroundColor Yellow
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack trace:" -ForegroundColor Yellow
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    Write-Host ""
    Write-Host "Para suporte, entre em contato:" -ForegroundColor Yellow
    Write-Host "  Email: gamehousetecnologia@gmail.com" -ForegroundColor White
    Write-Host "  WhatsApp: (34) 98443-2835" -ForegroundColor White
    Write-Host ""
    Read-Host "Pressione Enter para sair"
    exit 1
}
`;

const LINUX_INSTALLER_TEMPLATE = `#!/bin/bash
# CyberShield Agent Linux Installer  
# Auto-generated: {{TIMESTAMP}}

AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
SERVER_URL="{{SERVER_URL}}"

echo "=== CyberShield Agent Installer ==="

# Executar agent diretamente com parâmetros
AGENT_URL="{{SERVER_URL}}/agent-scripts/cybershield-agent-linux.sh"
AGENT_PATH="/tmp/cybershield-agent.sh"

echo "Downloading agent..."
if curl -sSL "$AGENT_URL" -o "$AGENT_PATH" 2>/dev/null; then
    echo "✓ Agent downloaded"
    chmod +x "$AGENT_PATH"
    echo "Starting agent..."
    bash "$AGENT_PATH" "$AGENT_TOKEN" "$HMAC_SECRET" "$SERVER_URL"
else
    echo "✗ Download failed"
    exit 1
fi
`;

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startTime = Date.now();

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log(`[${requestId}] ${req.method} ${req.url} - Started`);

    const url = new URL(req.url);
    const enrollmentKey = url.pathname.split('/').pop();

    if (!enrollmentKey) {
      console.log(`[${requestId}] Missing enrollment key`);
      return new Response('Enrollment key is required', { 
        status: 400,
        headers: corsHeaders
      });
    }

    const supabaseClient = createClient(
      SUPABASE_URL,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch enrollment key
    const { data: enrollmentData, error: enrollmentError } = await supabaseClient
      .from('enrollment_keys')
      .select('agent_id, is_active, expires_at, tenant_id')
      .eq('key', enrollmentKey)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (enrollmentError || !enrollmentData) {
      console.log(`[${requestId}] Invalid enrollment key: ${enrollmentError?.message}`);
      return new Response('Invalid or expired enrollment key', { 
        status: 404,
        headers: corsHeaders
      });
    }

    if (!enrollmentData.is_active) {
      console.log(`[${requestId}] Enrollment key already used`);
      return new Response('This enrollment key has been used', { 
        status: 410,
        headers: corsHeaders
      });
    }

    if (new Date(enrollmentData.expires_at) < new Date()) {
      console.log(`[${requestId}] Enrollment key expired`);
      return new Response('This enrollment key has expired', { 
        status: 410,
        headers: corsHeaders
      });
    }

    // FASE 1 CORREÇÃO CRÍTICA: Fetch token from agent_tokens
    const { data: tokenData, error: tokenError } = await supabaseClient
      .from('agent_tokens')
      .select('token')
      .eq('agent_id', enrollmentData.agent_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData) {
      console.log(`[${requestId}] Agent token not found: ${tokenError?.message}`);
      return new Response('Agent token not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // FASE 1 CORREÇÃO CRÍTICA: Fetch agent info AND hmac_secret from agents table
    const { data: agentData, error: agentError } = await supabaseClient
      .from('agents')
      .select('agent_name, os_type, hmac_secret')
      .eq('id', enrollmentData.agent_id)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (agentError || !agentData) {
      console.log(`[${requestId}] Agent not found: ${agentError?.message}`);
      return new Response('Agent not found', { 
        status: 404,
        headers: corsHeaders
      });
    }

    // FASE 2: Read agent script from _shared directory and calculate SHA256 hash
    console.log(`[${requestId}] Reading agent script from _shared directory`);
    
    let agentScriptHash = '';
    let agentScriptContent = '';
    try {
      // Read the agent script from the _shared directory (accessible to Edge Functions)
      const scriptPath = new URL('../_shared/agent-script-windows.ps1', import.meta.url).pathname;
      console.log(`[${requestId}] Script path: ${scriptPath}`);
      
      agentScriptContent = await Deno.readTextFile(scriptPath);
      
      if (!agentScriptContent || agentScriptContent.length < 1000) {
        throw new Error(`Agent script content is empty or too small: ${agentScriptContent.length} bytes`);
      }
      
      // Generate SHA256 hash
      const encoder = new TextEncoder();
      const data = encoder.encode(agentScriptContent);
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      agentScriptHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
      
      console.log(`[${requestId}] Agent script loaded: ${agentScriptContent.length} bytes, hash: ${agentScriptHash}`);
    } catch (hashError) {
      console.error(`[${requestId}] Failed to read agent script:`, hashError);
      return new Response('Failed to generate secure installer', { 
        status: 500,
        headers: corsHeaders
      });
    }

    // Validate credentials are present
    if (!tokenData.token || !agentData.hmac_secret) {
      console.error(`[${requestId}] Missing credentials: token=${!!tokenData.token}, hmac=${!!agentData.hmac_secret}`);
      return new Response('Agent credentials incomplete', { 
        status: 500,
        headers: corsHeaders
      });
    }

    // Determine platform
    const platform = agentData.os_type || 'windows';
    console.log(`[${requestId}] Generating ${platform} installer for ${agentData.agent_name}`);

    // Select template
    let templateContent = platform === 'windows' ? WINDOWS_INSTALLER_TEMPLATE : LINUX_INSTALLER_TEMPLATE;

    // FASE 2: Replace placeholders with validated credentials
    templateContent = templateContent
      .replace(/\{\{AGENT_TOKEN\}\}/g, tokenData.token)
      .replace(/\{\{HMAC_SECRET\}\}/g, agentData.hmac_secret)
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{AGENT_HASH\}\}/g, agentScriptHash)
      .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
      .replace(/\{\{AGENT_NAME\}\}/g, agentData.agent_name)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

    // Final validation: ensure no placeholders remain
    if (templateContent.includes('{{')) {
      console.error(`[${requestId}] Template still contains placeholders after replacement`);
      return new Response('Installer generation failed: incomplete template', { 
        status: 500,
        headers: corsHeaders
      });
    }

    // FASE 2: Calculate SHA256 hash of complete installer script
    const installerEncoder = new TextEncoder();
    const installerData = installerEncoder.encode(templateContent);
    const installerHashBuffer = await crypto.subtle.digest('SHA-256', installerData);
    const installerHashArray = Array.from(new Uint8Array(installerHashBuffer));
    const installerSha256 = installerHashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    const installerSizeBytes = installerData.length;

    console.log(`[${requestId}] Installer SHA256: ${installerSha256}, Size: ${installerSizeBytes} bytes`);

    // FASE 2: Persist installer hash to database
    try {
      const { error: updateError } = await supabaseClient
        .from('enrollment_keys')
        .update({
          installer_sha256: installerSha256,
          installer_size_bytes: installerSizeBytes,
          installer_generated_at: new Date().toISOString()
        })
        .eq('key', enrollmentKey);

      if (updateError) {
        console.error(`[${requestId}] Failed to persist installer hash:`, updateError);
      } else {
        console.log(`[${requestId}] Installer hash persisted to database`);
      }
    } catch (dbError) {
      console.error(`[${requestId}] Database error persisting hash:`, dbError);
    }

    // Return script
    const fileName = platform === 'windows'
      ? `install-${agentData.agent_name}-windows.ps1`
      : `install-${agentData.agent_name}-linux.sh`;

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Completed successfully in ${duration}ms`);

    // FASE 2: Return script with SHA256 in header
    return new Response(templateContent, {
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}"`,
        'X-Script-SHA256': installerSha256,
        'X-Script-Size': installerSizeBytes.toString(),
        'X-Content-Type-Options': 'nosniff',
        'X-Frame-Options': 'DENY',
      },
    });

  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`[${requestId}] Failed after ${duration}ms:`, error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error',
        requestId 
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});