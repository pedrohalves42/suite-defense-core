/**
 * build-agent-exe Edge Function ? Modularized & migrated to serveTenant
 *
 * Handles:
 * - GET: Health check (pre-auth, handled before serveTenant)
 * - POST: Trigger GitHub Actions build for Windows agent installer
 *
 * Modules: validation.ts, cache.ts, github-dispatch.ts
 * The large Windows installer PS1 template is imported from _shared/installer-template.ts
 */

import { requireEnv, optionalEnv } from '../_shared/env.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { createErrorResponse, ErrorCode } from '../_shared/error-handler.ts';
import { withTimeout, createTimeoutResponse } from '../_shared/timeout.ts';
import { BuildTelemetry } from '../_shared/build-telemetry.ts';
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts';
import { serveTenant } from '../_shared/serve-tenant.ts';

import { BuildRequestSchema, validateEnrollment, fetchAgentCredentials } from './validation.ts';
import { checkBuildCache } from './cache.ts';
import { validateGitHubAccess, dispatchBuild } from './github-dispatch.ts';

const BUILD_GH_TOKEN = Deno.env.get('BUILD_GH_TOKEN');
const BUILD_GH_REPOSITORY = Deno.env.get('BUILD_GH_REPOSITORY');

// ??? Health Check (pre-auth GET) ????????????????????????????????????????????
// Handled inside serveTenant with methods: ['GET', 'POST']
// GET returns health status; POST triggers build.

serveTenant(async (req, ctx) => {
  const origin = req.headers.get("origin");
  const { supabase, userId, requestId, body } = ctx;

  // ?? GET: Health check ??
  if (req.method === 'GET') {
    const healthy = !!(
      Deno.env.get('SUPABASE_URL') &&
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') &&
      BUILD_GH_TOKEN &&
      BUILD_GH_REPOSITORY
    );
    return new Response(
      JSON.stringify({
        status: healthy ? 'healthy' : 'unhealthy',
        timestamp: new Date().toISOString(),
        service: 'build-agent-exe',
        checks: {
          env_vars: healthy,
          supabase_url: !!Deno.env.get('SUPABASE_URL'),
          service_role_key: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
          github_token: !!BUILD_GH_TOKEN,
          github_repo: !!BUILD_GH_REPOSITORY,
        },
      }),
      { status: healthy ? 200 : 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }

  // ?? POST: Build agent EXE ??
  if (!userId) {
    return createErrorResponse(ErrorCode.UNAUTHORIZED, 'Authentication required', 401, requestId);
  }

  // 1. Validate input
  const parsed = BuildRequestSchema.safeParse(body);
  if (!parsed.success) {
    return createErrorResponse(ErrorCode.BAD_REQUEST, 'Validation failed', 400, requestId);
  }
  const { agent_name, enrollment_key } = parsed.data;

  logger.info(`[${requestId}] ========== BUILD REQUEST START ==========`);

  try {
    return await withTimeout(async () => {
      let telemetry: BuildTelemetry | null = null;

      // 2. Validate enrollment key & tenant access
      const enrollment = await validateEnrollment(supabase, enrollment_key, userId, requestId);
      if (enrollment.error || !enrollment.data) {
        return createErrorResponse(
          enrollment.status === 403 ? ErrorCode.UNAUTHORIZED : ErrorCode.BAD_REQUEST,
          enrollment.error || 'Invalid enrollment',
          enrollment.status || 400,
          requestId
        );
      }
      const { enrollmentId, agentId, tenantId, agentToken } = enrollment.data;

      // 3. Fetch agent credentials
      const creds = await fetchAgentCredentials(supabase, agentId);
      if (creds.error || !creds.data) {
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, creds.error || 'Agent credentials incomplete', 500, requestId);
      }

      // 4. Fetch & validate agent script from storage
      const { validateAgentScriptContent, calculateScriptHash } = await import('../_shared/agent-script-validator.ts');

      const { data: fileData, error: storageError } = await supabase.storage
        .from('agent-installers')
        .download('scripts/cybershield-agent-windows-v3.ps1');

      if (storageError || !fileData) {
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Agent script not found in storage', 503, requestId);
      }

      const agentScriptContent = await fileData.text();
      if (!validateAgentScriptContent(agentScriptContent)) {
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Agent script content is invalid', 503, requestId);
      }
      const agentScriptHash = await calculateScriptHash(agentScriptContent);

      // 5. Check build cache
      const cachedResponse = await checkBuildCache(supabase, tenantId, agentScriptHash, requestId);
      if (cachedResponse) return cachedResponse;

      // 6. Generate installer content
      const SUPABASE_URL = requireEnv('SUPABASE_URL');
      const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

      // Import the installer template from shared module
      const { WINDOWS_INSTALLER_TEMPLATE: BASE_TEMPLATE } = await import('../_shared/installer-template.ts');

      // Build the full installer template with embedded agent script
      const FULL_TEMPLATE = `# CyberShield Agent - Windows Installation Script v3.0.0-APEX
# Auto-generated: {{TIMESTAMP}}
# APEX BUILD - Universal, Robust, Production-Ready

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v3.0.0-APEX" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
$isAdmin = $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
    Write-Host "ERRO: Este script requer privilegios de administrador" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Host "ERRO: PowerShell 5.1+ necessario" -ForegroundColor Red
    exit 1
}

$AgentToken = "{{AGENT_TOKEN}}"
$HmacSecret = "{{HMAC_SECRET}}"
$ServerUrl = "{{SERVER_URL}}"
$PollInterval = 60

if ([string]::IsNullOrWhiteSpace($AgentToken) -or $AgentToken -eq "{{AGENT_TOKEN}}") {
    Write-Host "ERRO: Token nao configurado" -ForegroundColor Red
    exit 1
}

$InstallDir = "C:\\\\CyberShield"
$AgentScript = Join-Path $InstallDir "cybershield-agent.ps1"
$LogDir = Join-Path $InstallDir "logs"
$InstallLog = Join-Path $LogDir "install.log"

function Write-InstallLog {
    param([string]$Message)
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    if (-not (Test-Path $LogDir)) { New-Item -ItemType Directory -Path $LogDir -Force | Out-Null }
    "$timestamp - $Message" | Out-File $InstallLog -Append
    Write-Host $Message
}

try {
    Write-InstallLog "[1/8] Criando diretorios..."
    @($InstallDir, $LogDir) | ForEach-Object { if (-not (Test-Path $_)) { New-Item -ItemType Directory -Path $_ -Force | Out-Null } }
    
    Write-InstallLog "[2/8] Configurando rede..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

    Write-InstallLog "[3/8] Testando conectividade..."
    $healthCheck = $false
    @("$ServerUrl/functions/v1/heartbeat", "https://www.google.com") | ForEach-Object {
        if (-not $healthCheck) {
            try { $r = Invoke-WebRequest -Uri $_ -Method GET -TimeoutSec 10 -UseBasicParsing; if ($r.StatusCode -eq 200) { $healthCheck = $true } } catch {}
        }
    }

    Write-InstallLog "[4/8] Salvando script do agente..."
    $AgentContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@
    Set-Content -Path $AgentScript -Value $AgentContent -Encoding UTF8 -Force

    Write-InstallLog "[5/8] Configurando firewall..."
    try {
        Get-NetFirewallRule -DisplayName "CyberShield Agent" -EA SilentlyContinue | Remove-NetFirewallRule -EA SilentlyContinue
        New-NetFirewallRule -DisplayName "CyberShield Agent" -Direction Outbound -Action Allow -Protocol TCP -RemotePort 443 -Program "powershell.exe" -EA Stop | Out-Null
    } catch { Write-InstallLog "[WARN] Firewall: $($_.Exception.Message)" }

    Write-InstallLog "[6/8] Criando tarefa agendada..."
    $taskName = "CyberShield Agent"
    Get-ScheduledTask -TaskName $taskName -EA SilentlyContinue | Unregister-ScheduledTask -Confirm:$false -EA SilentlyContinue
    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$AgentScript\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -ServerUrl \`"$ServerUrl\`" -AgentName \`"{{AGENT_NAME}}\`" -PollInterval $PollInterval"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    Register-ScheduledTask -TaskName $taskName -Description "CyberShield Security Agent" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null

    Write-InstallLog "[7/8] Iniciando agente..."
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Seconds 3

    Write-Host "==================================" -ForegroundColor Green
    Write-Host "INSTALACAO CONCLUIDA!" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green

    Write-InstallLog "[8/8] Enviando telemetria..."
    $telBody = @{ agent_name = "{{AGENT_NAME}}"; success = $true; os_version = (Get-WmiObject Win32_OperatingSystem).Caption; installation_time = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
    try { Invoke-RestMethod -Uri "$ServerUrl/functions/v1/post-installation-telemetry" -Method POST -Body $telBody -ContentType "application/json" -TimeoutSec 10 -EA Stop | Out-Null } catch {}

    Start-Sleep -Seconds 10
} catch {
    Write-Host "ERRO: $($_.Exception.Message)" -ForegroundColor Red
    Read-Host "Enter para sair"
    exit 1
}
`;

      const installerContent = FULL_TEMPLATE
        .replace(/\{\{AGENT_TOKEN\}\}/g, agentToken)
        .replace(/\{\{HMAC_SECRET\}\}/g, creds.data.hmacSecret)
        .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
        .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
        .replace(/\{\{AGENT_NAME\}\}/g, agent_name)
        .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

      // 7. Create build record
      const { data: buildRecord, error: buildError } = await supabase
        .from('agent_builds')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          enrollment_key_id: enrollmentId,
          build_status: 'building',
          build_started_at: new Date().toISOString(),
          created_by: userId,
          script_hash: agentScriptHash,
          ps1_version: 'v3.0.0',
        })
        .select()
        .single();

      if (buildError) {
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to create build', 500, requestId);
      }

      telemetry = new BuildTelemetry(buildRecord.id, requestId);

      // 8. Validate GitHub config
      if (!BUILD_GH_TOKEN || !BUILD_GH_REPOSITORY) {
        const msg = 'GitHub integration not configured';
        telemetry.failBuild(msg);
        await supabase.from('agent_builds').update({
          build_status: 'failed', error_message: msg, build_completed_at: new Date().toISOString(),
        }).eq('id', buildRecord.id);
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Build service not configured', 500, requestId);
      }

      const ghAccess = await validateGitHubAccess({ token: BUILD_GH_TOKEN, repository: BUILD_GH_REPOSITORY }, requestId);
      if (!ghAccess.ok) {
        telemetry.failBuild(ghAccess.error!);
        await supabase.from('agent_builds').update({
          build_status: 'failed', error_message: ghAccess.error, build_completed_at: new Date().toISOString(),
        }).eq('id', buildRecord.id);
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'GitHub API unreachable', 500, requestId);
      }

      // 9. Encode installer & dispatch to GitHub
      const ps1Base64 = encodeBase64(new TextEncoder().encode(installerContent));
      const githubActionsUrl = `https://github.com/${BUILD_GH_REPOSITORY}/actions`;

      const workflowPayload = {
        ps1_content_base64: ps1Base64,
        output_name: `CyberShield-Agent-${agent_name}-${Date.now()}.exe`,
        version: '3.0.0',
        build_id: buildRecord.id,
        callback_url: `${SUPABASE_URL}/functions/v1/build-callback`,
        callback_token: SUPABASE_SERVICE_ROLE_KEY,
      };

      const result = await dispatchBuild(
        { token: BUILD_GH_TOKEN, repository: BUILD_GH_REPOSITORY },
        workflowPayload,
        installerContent,
        requestId,
        telemetry
      );

      if (!result.success) {
        const errorMessage = `Both dispatch methods failed: ${result.error}`;
        telemetry.failBuild(errorMessage);
        await supabase.from('agent_builds').update({
          build_status: 'failed', error_message: errorMessage, build_completed_at: new Date().toISOString(),
        }).eq('id', buildRecord.id);
        return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Failed to trigger build', 500, requestId);
      }

      // 10. Update build record with GitHub info
      await supabase.from('agent_builds').update({
        github_run_url: githubActionsUrl,
        build_log: [{ timestamp: new Date().toISOString(), message: `Build triggered via ${result.method}`, url: githubActionsUrl }],
      }).eq('id', buildRecord.id);

      telemetry.completeBuild({ trigger_method: result.method, github_actions_url: githubActionsUrl });

      return new Response(
        JSON.stringify({
          success: true,
          build_id: buildRecord.id,
          status: 'building',
          message: 'Build iniciado. Aguarde 2-3 minutos.',
          estimated_completion: new Date(Date.now() + 180000).toISOString(),
          github_actions_url: githubActionsUrl,
        }),
        { status: 202, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }, { timeoutMs: 25000 });
  } catch (error) {
    if (error instanceof Error && error.message === 'Request timeout') {
      return createTimeoutResponse(buildCorsHeaders(origin));
    }
    logger.error(`[${requestId}] Build request failed`, { error });
    return createErrorResponse(ErrorCode.INTERNAL_ERROR, 'Build process failed', 500, requestId);
  }
}, { methods: ['GET', 'POST'] });
