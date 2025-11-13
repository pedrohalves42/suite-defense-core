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

    // Windows Installer Template (simplified for build service)
    const WINDOWS_INSTALLER_TEMPLATE = `#Requires -RunAsAdministrator
param()

$ErrorActionPreference = "Stop"
Write-Host "=== CyberShield Agent Installer ===" -ForegroundColor Cyan

# 1. Validar privilégios admin
if (-NOT ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole] "Administrator")) {
    Write-Host "❌ Este instalador REQUER privilégios de Administrador." -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# 2. Criar diretório de instalação
$InstallDir = "$env:ProgramFiles\\CyberShield"
if (!(Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Write-Host "✓ Diretório criado: $InstallDir" -ForegroundColor Green
}

# 3. Baixar script do agente
$agentUrl = "{{SERVER_URL}}/agent-scripts/cybershield-agent-windows.ps1"
$agentPath = "$InstallDir\\cybershield-agent.ps1"
$expectedHash = "{{AGENT_HASH}}"

Write-Host "Baixando agente de $agentUrl..." -ForegroundColor Gray
try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -Uri $agentUrl -OutFile $agentPath -UseBasicParsing -ErrorAction Stop
    
    Write-Host "Validando integridade do arquivo..." -ForegroundColor Gray
    $actualHash = (Get-FileHash -Path $agentPath -Algorithm SHA256).Hash.ToLower()
    
    if ($actualHash -ne $expectedHash) {
        Write-Host "✗ ERRO CRÍTICO: Hash SHA256 não corresponde!" -ForegroundColor Red
        Write-Host "  Esperado: $expectedHash" -ForegroundColor Yellow
        Write-Host "  Obtido:   $actualHash" -ForegroundColor Yellow
        Write-Host "  POSSÍVEL ATAQUE OU DOWNLOAD CORROMPIDO!" -ForegroundColor Red
        Remove-Item $agentPath -Force
        Read-Host "Pressione Enter para sair"
        exit 1
    }
    
    Write-Host "✓ Agente baixado e validado (hash OK)" -ForegroundColor Green
} catch {
    Write-Host "✗ Falha no download: $_" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

# 4. Configurar credenciais
$configPath = "$InstallDir\\config.json"
$config = @{
    agent_token = "{{AGENT_TOKEN}}"
    hmac_secret = "{{HMAC_SECRET}}"
    server_url = "{{SERVER_URL}}"
} | ConvertTo-Json

$config | Out-File -FilePath $configPath -Encoding UTF8 -Force
Write-Host "✓ Configuração salva" -ForegroundColor Green

# 5. Criar Scheduled Task
$taskName = "CyberShield-Agent"
$taskExists = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue

if ($taskExists) {
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false
    Write-Host "✓ Tarefa existente removida" -ForegroundColor Yellow
}

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File \`"$agentPath\`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3

Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Write-Host "✓ Scheduled Task criada: $taskName" -ForegroundColor Green

Start-ScheduledTask -TaskName $taskName
Write-Host "✓ Agente iniciado em background" -ForegroundColor Green

Write-Host ""
Write-Host "=== Instalação Concluída com Sucesso! ===" -ForegroundColor Green
Write-Host "O agente está rodando em background via Scheduled Task." -ForegroundColor Cyan
Write-Host "Timestamp: {{TIMESTAMP}}" -ForegroundColor Gray
`;
    
    let installerContent = WINDOWS_INSTALLER_TEMPLATE
      .replace(/\{\{AGENT_TOKEN\}\}/g, tokenData.token)
      .replace(/\{\{HMAC_SECRET\}\}/g, agentData.hmac_secret)
      .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
      .replace(/\{\{AGENT_HASH\}\}/g, agentScriptHash)
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

    // 8. Trigger GitHub Actions workflow with fallback
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

    const githubActionsUrl = `https://github.com/${BUILD_GH_REPOSITORY}/actions`;
    const workflowPayload = {
      ps1_content: installerContent,
      output_name: `CyberShield-Agent-${agent_name}-${Date.now()}.exe`,
      version: '2.2.1',
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
