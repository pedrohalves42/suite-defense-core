/**
 * generate-portable-installer Edge Function
 * 
 * Generates a self-contained .CMD installer that embeds the PS1 agent script.
 * Auth: JWT (dashboard user) via serveTenant
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const PortableInstallerSchema = z.object({
  agent_name: z.string().min(1).max(100),
  enrollment_key: z.string().min(1).max(256),
});

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  const parsed = PortableInstallerSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { agent_name, enrollment_key } = parsed.data;

  logger.info(`[generate-portable-installer][${requestId}] Generating for ${agent_name}`);

  // Validate enrollment key
  const { data: enrollment, error: enrollErr } = await supabase
    .from('enrollment_keys')
    .select('id, agent_id, tenant_id, is_active, agent_token')
    .eq('key', enrollment_key)
    .maybeSingle();

  if (enrollErr || !enrollment || !enrollment.is_active || !enrollment.agent_token) {
    return new Response(
      JSON.stringify({ error: 'Invalid or expired enrollment key' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify enrollment key belongs to tenant
  if (enrollment.tenant_id !== tenantId) {
    return new Response(
      JSON.stringify({ error: 'Enrollment key belongs to different tenant' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get agent HMAC secret
  const { data: agentData } = await supabase
    .from('agents')
    .select('hmac_secret')
    .eq('id', enrollment.agent_id)
    .maybeSingle();

  if (!agentData?.hmac_secret) {
    return new Response(
      JSON.stringify({ error: 'Agent credentials incomplete' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch agent script from storage
  const { data: fileData, error: storageErr } = await supabase.storage
    .from('agent-installers')
    .download('scripts/cybershield-agent-windows-v5.ps1');

  if (storageErr || !fileData) {
    logger.error(`[generate-portable-installer][${requestId}] Storage error:`, storageErr);
    return new Response(
      JSON.stringify({ error: 'Agent script not found in storage' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { validateAgentScriptContent, calculateScriptHash } = await import('../_shared/agent-script-validator.ts');
  const agentScriptContent = await fileData.text();

  if (!validateAgentScriptContent(agentScriptContent)) {
    return new Response(
      JSON.stringify({ error: 'Agent script validation failed' }),
      { status: 503, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Build the installer PS1
  const installerPs1 = buildInstallerPs1({
    agentToken: enrollment.agent_token,
    hmacSecret: agentData.hmac_secret,
    serverUrl: SUPABASE_URL,
    agentName: agent_name,
    agentScriptContent,
  });

  // Encode PS1 to Base64 for embedding in CMD
  const ps1Bytes = new TextEncoder().encode(installerPs1);
  const ps1Base64 = btoa(String.fromCharCode(...ps1Bytes));

  // Build the CMD wrapper
  const cmdContent = buildCmdWrapper(agent_name, ps1Base64);

  // Calculate hashes
  const cmdBytes = new TextEncoder().encode(cmdContent);
  const hashBuffer = await crypto.subtle.digest('SHA-256', cmdBytes);
  const sha256 = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  // Upload to storage
  const fileName = `portable/CyberShield-${agent_name}-${Date.now()}.cmd`;
  const { error: uploadErr } = await supabase.storage
    .from('agent-installers')
    .upload(fileName, cmdContent, {
      contentType: 'application/x-bat',
      upsert: true,
    });

  if (uploadErr) {
    logger.error(`[generate-portable-installer][${requestId}] Upload error:`, uploadErr);
    return new Response(
      JSON.stringify({ error: 'Failed to upload installer' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Generate signed URL (1 hour)
  const { data: signedData } = await supabase.storage
    .from('agent-installers')
    .createSignedUrl(fileName, 3600);

  // Create build record
  const scriptHash = await calculateScriptHash(agentScriptContent);
  await supabase.from('agent_builds').insert({
    tenant_id: tenantId,
    agent_id: enrollment.agent_id,
    enrollment_key_id: enrollment.id,
    build_status: 'completed',
    build_started_at: new Date().toISOString(),
    build_completed_at: new Date().toISOString(),
    created_by: userId,
    script_hash: scriptHash,
    sha256_hash: sha256,
    file_size_bytes: cmdBytes.length,
    file_path: fileName,
    download_url: signedData?.signedUrl || null,
    download_expires_at: new Date(Date.now() + 3600000).toISOString(),
    ps1_version: 'v5.0.15-portable',
    build_duration_seconds: 0,
  });

  logger.info(`[generate-portable-installer][${requestId}] [OK]  Generated: ${cmdBytes.length} bytes, SHA256: ${sha256}`);

  return {
    success: true,
    download_url: signedData?.signedUrl,
    sha256_hash: sha256,
    file_size_bytes: cmdBytes.length,
    file_name: `CyberShield-${agent_name}.cmd`,
    expires_in_seconds: 3600,
    requestId,
  };
}, { methods: ['POST'] });

/** Build the installer PS1 with embedded credentials and agent script */
function buildInstallerPs1(params: {
  agentToken: string;
  hmacSecret: string;
  serverUrl: string;
  agentName: string;
  agentScriptContent: string;
}): string {
  const { agentToken, hmacSecret, serverUrl, agentName, agentScriptContent } = params;

  return `# CyberShield Agent - Windows Installation Script v5.0.15-Portable
# Auto-generated: ${new Date().toISOString()}
# Portable Build - No GitHub Actions required

#Requires -Version 5.1
#Requires -RunAsAdministrator

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "==================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent Installer v5.0.15" -ForegroundColor Cyan
Write-Host "Portable Build" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

$currentPrincipal = New-Object Security.Principal.WindowsPrincipal([Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $currentPrincipal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    Write-Host "ERRO: Requer privilegios de administrador" -ForegroundColor Red
    Read-Host "Pressione Enter para sair"
    exit 1
}

$AgentToken = "${agentToken}"
$HmacSecret = "${hmacSecret}"
$ServerUrl = "${serverUrl}"
$AgentName = "${agentName}"
$PollInterval = 60

$InstallDir = "C:\\CyberShield"
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
    Write-InstallLog "[1/7] Criando diretorios..."
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-InstallLog "OK Diretorios criados"

    Write-InstallLog "[2/7] Configurando TLS 1.2..."
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    Write-InstallLog "OK TLS 1.2 habilitado"

    Write-InstallLog "[3/7] Testando conectividade..."
    try {
        Invoke-WebRequest -Uri "$ServerUrl/functions/v1/heartbeat" -Method GET -TimeoutSec 10 -UseBasicParsing | Out-Null
        Write-InstallLog "OK Conectividade verificada"
    } catch {
        Write-Host "AVISO: Backend nao acessivel. Continuar? (S/N)" -ForegroundColor Yellow
        $r = Read-Host
        if ($r -ne "S") { exit 1 }
    }

    Write-InstallLog "[4/7] Salvando script do agente..."
    $AgentContent = @'
${agentScriptContent}
'@
    Set-Content -Path $AgentScript -Value $AgentContent -Encoding UTF8 -Force
    Write-InstallLog "OK Script salvo em $AgentScript"

    Write-InstallLog "[5/7] Configurando firewall..."
    try {
        Remove-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue
        New-NetFirewallRule -DisplayName "CyberShield Agent" -Direction Outbound -Action Allow -Protocol TCP -RemotePort 443 -Program "powershell.exe" -Description "CyberShield Agent" -ErrorAction Stop | Out-Null
        Write-InstallLog "OK Regra de firewall configurada"
    } catch {
        Write-InstallLog "AVISO: Nao foi possivel configurar firewall: $($_.Exception.Message)"
    }

    Write-InstallLog "[6/7] Criando tarefa agendada..."
    $taskName = "CyberShield Agent"
    $existingTask = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($existingTask) { Unregister-ScheduledTask -TaskName $taskName -Confirm:$false }

    $action = New-ScheduledTaskAction -Execute "PowerShell.exe" -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$AgentScript\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -ServerUrl \`"$ServerUrl\`" -AgentName \`"$AgentName\`" -PollInterval $PollInterval"
    $trigger = New-ScheduledTaskTrigger -AtStartup
    $settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit (New-TimeSpan -Days 365)
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

    Register-ScheduledTask -TaskName $taskName -Description "CyberShield Security Agent" -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Force | Out-Null
    Write-InstallLog "OK Tarefa agendada criada"

    Write-InstallLog "[7/7] Iniciando agente..."
    Start-ScheduledTask -TaskName $taskName
    Start-Sleep -Seconds 3

    Write-Host ""
    Write-Host "==================================" -ForegroundColor Green
    Write-Host "INSTALACAO CONCLUIDA COM SUCESSO!" -ForegroundColor Green
    Write-Host "==================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Diretorio: $InstallDir" -ForegroundColor White
    Write-Host "Logs: $LogDir\\agent.log" -ForegroundColor White
    Write-Host ""

    try {
        $body = @{ agent_name = "$AgentName"; success = $true; os_version = (Get-WmiObject Win32_OperatingSystem).Caption; installation_time = (Get-Date).ToUniversalTime().ToString("o") } | ConvertTo-Json
        Invoke-RestMethod -Uri "$ServerUrl/functions/v1/post-installation-telemetry" -Method POST -Body $body -ContentType "application/json" -TimeoutSec 10 | Out-Null
    } catch { }

    Write-Host "Pressione Enter para fechar..." -ForegroundColor Gray
    Read-Host

} catch {
    Write-Host "ERRO DURANTE A INSTALACAO" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host $_.ScriptStackTrace -ForegroundColor Gray
    Read-Host "Pressione Enter para sair"
    exit 1
}
`;
}

/** Build the CMD wrapper that auto-elevates and runs the embedded PS1 */
function buildCmdWrapper(agentName: string, ps1Base64: string): string {
  const CHUNK_SIZE = 7500;
  const chunks: string[] = [];
  for (let i = 0; i < ps1Base64.length; i += CHUNK_SIZE) {
    chunks.push(ps1Base64.slice(i, i + CHUNK_SIZE));
  }

  const echoLines = chunks.map((chunk, i) => {
    if (i === 0) return `echo|set /p="${chunk}" > "%TEMP%\\cs_b64.txt"`;
    return `echo|set /p="${chunk}" >> "%TEMP%\\cs_b64.txt"`;
  }).join('\n');

  return `@echo off
chcp 65001 >nul 2>&1
title CyberShield Agent Installer - ${agentName}

:: ============================================
:: CyberShield Portable Installer v5.0.15
:: Agent: ${agentName}
:: Generated: ${new Date().toISOString()}
:: ============================================

:: Auto-elevate to admin
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo Solicitando privilegios de administrador...
    powershell -Command "Start-Process cmd -ArgumentList '/c \\"\\"%~f0\\"\\""' -Verb RunAs"
    exit /b
)

echo.
echo  ==========================================
echo   CyberShield Agent Installer
echo   Agent: ${agentName}
echo  ==========================================
echo.
echo  Decodificando instalador...

:: Write base64 content to temp file
${echoLines}

:: Decode base64 and execute PS1
echo  Executando instalador PowerShell...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$b64 = Get-Content '%TEMP%\\cs_b64.txt' -Raw; " ^
  "$bytes = [Convert]::FromBase64String($b64); " ^
  "$ps1 = [System.Text.Encoding]::UTF8.GetString($bytes); " ^
  "$tmpPs1 = Join-Path $env:TEMP 'cybershield-installer.ps1'; " ^
  "Set-Content -Path $tmpPs1 -Value $ps1 -Encoding UTF8; " ^
  "& $tmpPs1; " ^
  "Remove-Item $tmpPs1 -Force -ErrorAction SilentlyContinue"

:: Cleanup
del "%TEMP%\\cs_b64.txt" >nul 2>&1

exit /b
`;
}
