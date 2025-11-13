import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { createErrorResponse, ErrorCode } from '../_shared/error-handler.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const BUILD_GH_TOKEN = Deno.env.get('BUILD_GH_TOKEN');
const BUILD_GH_REPOSITORY = Deno.env.get('BUILD_GH_REPOSITORY'); // e.g., "username/repo"

Deno.serve(async (req) => {
  const requestId = crypto.randomUUID();
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // 1. Authentication
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', 401, requestId);
    }

    const token = authHeader.replace('Bearer ', '');
    const supabaseClient = createClient(SUPABASE_URL, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${token}` } }
    });

    // 2. Verify user permissions (admin)
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Invalid token', 401, requestId);
    }

    // 3. Parse request body
    const { agent_name, enrollment_key } = await req.json();
    
    if (!agent_name || !enrollment_key) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Missing agent_name or enrollment_key', 400, requestId);
    }

    logger.info('Build EXE request received', { requestId, agent_name, user_id: user.id });

    // 4. Validate enrollment key
    const serviceRoleClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    const { data: enrollmentData, error: enrollmentError } = await serviceRoleClient
      .from('enrollment_keys')
      .select('id, agent_id, tenant_id, is_active, expires_at')
      .eq('key', enrollment_key)
      .maybeSingle();

    if (enrollmentError || !enrollmentData || !enrollmentData.is_active) {
      return createErrorResponse(ErrorCode.BAD_REQUEST, 'Invalid or expired enrollment key', 400, requestId);
    }

    // 5. Fetch agent credentials
    const { data: tokenData } = await serviceRoleClient
      .from('agent_tokens')
      .select('token')
      .eq('agent_id', enrollmentData.agent_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const { data: agentData } = await serviceRoleClient
      .from('agents')
      .select('agent_name, hmac_secret')
      .eq('id', enrollmentData.agent_id)
      .maybeSingle();

    if (!tokenData || !agentData) {
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Agent credentials incomplete', 500, requestId);
    }

    // 6. Generate PS1 content from serve-installer template
    const agentScriptUrl = `${SUPABASE_URL}/agent-scripts/cybershield-agent-windows.ps1`;
    const agentScriptResponse = await fetch(agentScriptUrl);
    const agentScriptContent = await agentScriptResponse.text();
    
    // Calculate hash for validation
    const encoder = new TextEncoder();
    const data = encoder.encode(agentScriptContent);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const agentScriptHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // ✅ FASE 1: Windows Installer Template APEX v3.0.0 (FULL SYNC with install-windows-template.ps1)
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

# Diretório de instalação - ✅ FASE 1.1: Path unificado
$InstallDir = "C:\\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"

# ✅ FASE 1.1: Função de log de instalação
function Write-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    "$timestamp - $Message" | Out-File $InstallLog -Append
    Write-Host $Message
}

$installStartTime = Get-Date

$installStartTime = Get-Date

try {
    Write-InstallLog "[1/8] Criando diretórios de instalação..."
    if (-not (Test-Path $InstallDir)) {
        New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    }
    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }
    Write-InstallLog "✓ Diretórios criados com sucesso"

    # ✅ FASE 1.2: Configurar proxy e TLS globalmente
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

    # ✅ FASE 1.3: Health check inicial com retry mechanism
    Write-InstallLog "[3/8] Testando conectividade com backend (até 3 tentativas)..."
    $healthCheck = $false
    $healthUrls = @(
        "$ServerUrl/functions/v1/heartbeat",
        "$ServerUrl/functions/v1/post-installation-telemetry",
        "https://www.google.com"
    )

    $maxRetries = 3
    $retryDelay = 2 # segundos

    foreach ($url in $healthUrls) {
        $retryCount = 0
        $success = $false
        
        while ($retryCount -lt $maxRetries -and -not $success) {
            try {
                if ($retryCount -gt 0) {
                    Write-InstallLog "Tentativa $($retryCount + 1) de $maxRetries para $url"
                    Start-Sleep -Seconds $retryDelay
                }
                $response = Invoke-WebRequest -Uri $url -Method GET -TimeoutSec 10 -UseBasicParsing
                if ($response.StatusCode -eq 200) {
                    Write-InstallLog "✓ Conectividade verificada: $url"
                    $healthCheck = $true
                    $success = $true
                    break
                }
            } catch {
                $retryCount++
                Write-InstallLog "✗ Tentativa $retryCount falhou: $url - $($_.Exception.Message)"
                if ($retryCount -ge $maxRetries) {
                    Write-InstallLog "✗ Todas as tentativas falharam para: $url"
                }
            }
        }
        
        if ($success) {
            break
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

    Write-InstallLog "[4/8] Salvando script do agente (embedded)..."
    
    # ✅ FASE 1.4: Conteúdo do script do agente (embedded)
    $AgentContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

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

    # ✅ FASE 2: Criar ação com TODOS os parâmetros necessários
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" \`
        -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$AgentScript\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -ServerUrl \`"$ServerUrl\`" -PollInterval $PollInterval"

    # Criar trigger (na inicialização do sistema)
    $trigger = New-ScheduledTaskTrigger -AtStartup

    # Criar configurações com restart policies
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
    Write-Host "  • Logs: $LogDir\\agent.log" -ForegroundColor White
    Write-Host "  • Logs de instalação: $InstallLog" -ForegroundColor White
    Write-Host "  • Tarefa: $taskName" -ForegroundColor White
    Write-Host "  • Última execução: $($taskInfo.LastRunTime)" -ForegroundColor White
    Write-Host ""

    # ✅ FASE 1.5: Enviar telemetria pós-instalação
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
    Write-Host "Instalação concluída! Monitorando agente por 60 segundos..." -ForegroundColor Cyan
    Write-Host "Feche esta janela a qualquer momento." -ForegroundColor Gray
    Write-Host ""

    # ✅ FASE 1.6: Keep-Alive monitoring
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
    Read-Host "Pressione Enter para sair"
    exit 1
}
`;
    
    // ✅ FASE 1.7: Replace placeholders including agent script content
    let installerContent = WINDOWS_INSTALLER_TEMPLATE
      .replace(/\{\{AGENT_TOKEN\}\}/g, tokenData.token)
      .replace(/\{\{HMAC_SECRET\}\}/g, agentData.hmac_secret)
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
      .replace(/\{\{AGENT_NAME\}\}/g, agent_name)
      .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

    // 7. Create build record
    const { data: buildRecord, error: buildError } = await serviceRoleClient
      .from('agent_builds')
      .insert({
        tenant_id: enrollmentData.tenant_id,
        agent_id: enrollmentData.agent_id,
        enrollment_key_id: enrollmentData.id,
        build_status: 'building',
        build_started_at: new Date().toISOString(),
        created_by: user.id
      })
      .select()
      .single();

    if (buildError) {
      logger.error('Failed to create build record', { error: buildError, requestId });
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to create build', 500, requestId);
    }

    logger.info('Build record created', { requestId, build_id: buildRecord.id });

    // 8. Test GitHub API connectivity first
    if (!BUILD_GH_TOKEN || !BUILD_GH_REPOSITORY) {
      await serviceRoleClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          error_message: 'GitHub integration not configured (BUILD_GH_TOKEN or BUILD_GH_REPOSITORY missing)',
          build_completed_at: new Date().toISOString()
        })
        .eq('id', buildRecord.id);
        
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Build service not configured', 500, requestId);
    }

    // Test GitHub API connectivity
    try {
      const testResponse = await fetch(
        `https://api.github.com/repos/${BUILD_GH_REPOSITORY}/actions/workflows`,
        { headers: { Authorization: `Bearer ${BUILD_GH_TOKEN}` } }
      );

      if (!testResponse.ok) {
        throw new Error(`GitHub API unreachable: ${testResponse.status}`);
      }
      logger.info('GitHub API connectivity test passed', { requestId });
    } catch (ghError) {
      logger.error('GitHub API connectivity test failed', { error: ghError, requestId });
      await serviceRoleClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          error_message: `GitHub API unreachable: ${ghError}`,
          build_completed_at: new Date().toISOString()
        })
        .eq('id', buildRecord.id);
        
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'GitHub API unreachable', 500, requestId);
    }

    // ✅ FASE 3.2: Converter PS1 para Base64 (Deno-safe UTF-8)
    const ps1Encoder = new TextEncoder();
    const ps1Bytes = ps1Encoder.encode(installerContent);
    const ps1Base64 = btoa(String.fromCharCode.apply(null, Array.from(ps1Bytes)));

    const githubActionsUrl = `https://github.com/${BUILD_GH_REPOSITORY}/actions`;
    // ✅ FASE 3.1: Update version to 3.0.0-APEX
    const workflowPayload = {
      ps1_content_base64: ps1Base64,
      output_name: `CyberShield-Agent-${agent_name}-${Date.now()}.exe`,
      version: '3.0.0',
      build_id: buildRecord.id,
      callback_url: `${SUPABASE_URL}/functions/v1/build-callback`,
      callback_token: SUPABASE_SERVICE_ROLE_KEY
    };

    let triggerSuccess = false;
    let triggerMethod = '';

    // Try repository_dispatch first
    try {
      logger.info('Attempting repository_dispatch trigger', { requestId, build_id: buildRecord.id });
      
      const dispatchUrl = `https://api.github.com/repos/${BUILD_GH_REPOSITORY}/dispatches`;
      const dispatchResponse = await fetch(dispatchUrl, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${BUILD_GH_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          event_type: 'build-agent-exe',
          client_payload: workflowPayload
        })
      });

      if (dispatchResponse.ok || dispatchResponse.status === 204) {
        triggerSuccess = true;
        triggerMethod = 'repository_dispatch';
        logger.info('repository_dispatch succeeded', { requestId, build_id: buildRecord.id });
      } else {
        const errorText = await dispatchResponse.text();
        logger.warn('repository_dispatch failed, trying workflow_dispatch fallback', { 
          error: errorText, 
          status: dispatchResponse.status,
          requestId 
        });
      }
    } catch (dispatchError) {
      logger.warn('repository_dispatch exception, trying workflow_dispatch fallback', { 
        error: dispatchError, 
        requestId 
      });
    }

    // Fallback to workflow_dispatch if repository_dispatch failed
    if (!triggerSuccess) {
      try {
        logger.info('Attempting workflow_dispatch trigger', { requestId, build_id: buildRecord.id });
        
        const workflowUrl = `https://api.github.com/repos/${BUILD_GH_REPOSITORY}/actions/workflows/build-agent-exe.yml/dispatches`;
        const workflowResponse = await fetch(workflowUrl, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${BUILD_GH_TOKEN}`,
            'Content-Type': 'application/json',
            'Accept': 'application/vnd.github.v3+json'
          },
          body: JSON.stringify({
            ref: 'main',
            inputs: {
              ps1_content: installerContent,
              output_name: workflowPayload.output_name,
              version: workflowPayload.version,
              build_id: workflowPayload.build_id,
              callback_url: workflowPayload.callback_url,
              callback_token: workflowPayload.callback_token
            }
          })
        });

        if (workflowResponse.ok || workflowResponse.status === 204) {
          triggerSuccess = true;
          triggerMethod = 'workflow_dispatch';
          logger.info('workflow_dispatch succeeded', { requestId, build_id: buildRecord.id });
        } else {
          const errorText = await workflowResponse.text();
          logger.error('workflow_dispatch also failed', { error: errorText, requestId });
        }
      } catch (workflowError) {
        logger.error('workflow_dispatch exception', { error: workflowError, requestId });
      }
    }

    if (!triggerSuccess) {
      await serviceRoleClient
        .from('agent_builds')
        .update({
          build_status: 'failed',
          error_message: 'Both repository_dispatch and workflow_dispatch failed. Check GitHub Actions configuration.',
          build_completed_at: new Date().toISOString()
        })
        .eq('id', buildRecord.id);
        
      return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to trigger build', 500, requestId);
    }

    // Save GitHub Actions URL for monitoring
    await serviceRoleClient
      .from('agent_builds')
      .update({
        github_run_url: githubActionsUrl,
        build_log: [{ 
          timestamp: new Date().toISOString(), 
          message: `Build triggered via ${triggerMethod}`,
          url: githubActionsUrl
        }]
      })
      .eq('id', buildRecord.id);

    logger.info('GitHub workflow triggered successfully', { 
      requestId, 
      build_id: buildRecord.id,
      method: triggerMethod,
      actions_url: githubActionsUrl
    });

    // 9. Return async response
    return new Response(JSON.stringify({
      success: true,
      build_id: buildRecord.id,
      status: 'building',
      message: 'Build iniciado. Aguarde 2-3 minutos.',
      estimated_completion: new Date(Date.now() + 180000).toISOString(), // +3 min
      github_actions_url: githubActionsUrl
    }), {
      status: 202, // Accepted
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });

  } catch (error) {
    logger.error('Build request failed', { error, requestId });
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Build process failed', 500, requestId);
  }
});
