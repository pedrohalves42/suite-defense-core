/**
 * get-reinstall-by-name handler — Inlined into public-gateway (Phase 6D)
 * Returns preserve-reinstall PS1 script.
 * Auth: Enrollment key or JWT (via inline auth resolver)
 */
import { hashToken } from '../../_shared/token-hash.ts';
import { logger } from '../../_shared/logger.ts';
import { buildCorsHeaders } from '../../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

// ═══ Auth Resolver ═══
interface AuthResult {
  tenantId: string | null;
  response?: Response;
}

function sanitizeEnrollmentKey(value: string | null): string | null {
  if (!value) return null;
  return value.replace(/^Bearer\s+/i, '').replace(/^['"]+|['"]+$/g, '').trim();
}

async function resolveAuth(
  req: Request,
  adminClient: SupabaseClient,
  requestId: string,
  origin: string | null,
  payload: Record<string, unknown>,
): Promise<AuthResult> {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const enrollmentKeyFromHeader = sanitizeEnrollmentKey(req.headers.get('X-Enrollment-Key'));
  const enrollmentKeyFromPayload = typeof payload.key === 'string' ? sanitizeEnrollmentKey(payload.key) : null;
  const enrollmentKey = enrollmentKeyFromHeader || enrollmentKeyFromPayload;
  const authHeader = req.headers.get('Authorization');

  if (enrollmentKey) {
    const keyHash = await hashToken(enrollmentKey);
    const { data: ek, error: ekError } = await adminClient
      .from('enrollment_keys')
      .select('id, tenant_id, is_active, expires_at, max_uses, current_uses')
      .eq('key_hash', keyHash)
      .eq('is_active', true)
      .maybeSingle();

    if (ekError || !ek) {
      return { tenantId: null, response: new Response('# ERROR: Invalid or expired enrollment key\nWrite-Host "ERROR: Invalid key" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }) };
    }
    if (ek.expires_at && new Date(ek.expires_at) < new Date()) {
      return { tenantId: null, response: new Response('# ERROR: Enrollment key has expired\nWrite-Host "ERROR: Key expired" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }) };
    }
    if (ek.max_uses && ek.current_uses >= ek.max_uses) {
      return { tenantId: null, response: new Response('# ERROR: Enrollment key usage limit reached\nWrite-Host "ERROR: Key usage limit reached" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }) };
    }

    await adminClient.from('enrollment_keys').update({ current_uses: ek.current_uses + 1 }).eq('id', ek.id);
    return { tenantId: ek.tenant_id };

  } else if (authHeader) {
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return { tenantId: null, response: new Response('# ERROR: Invalid JWT token\nWrite-Host "ERROR: Auth failed" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }) };
    }
    const { data: role } = await adminClient.from('user_roles').select('tenant_id').eq('user_id', user.id).maybeSingle();
    return { tenantId: role?.tenant_id || null };

  } else {
    return {
      tenantId: null,
      response: new Response('# ERROR: Authentication required\n# Provide key in payload or X-Enrollment-Key header\nWrite-Host "ERROR: No auth provided" -ForegroundColor Red\n', { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } }),
    };
  }
}

// ═══ Script Builder ═══
function buildReinstallScript(
  agentName: string, freshToken: string, hmacSecret: string,
  supabaseUrl: string, scriptVersion: string, scriptContent: string,
): string {
  let safeScript = scriptContent;
  if (safeScript.match(/\$anomalies\.anomalies/)) {
    const safeAnomalyExpr = '$(if ($anomalies -is [hashtable] -and $anomalies.ContainsKey("anomalies") -and $null -ne $anomalies["anomalies"]) { @($anomalies["anomalies"]) } else { @() })';
    safeScript = safeScript.replace(/\$anomalies\.anomalies/g, safeAnomalyExpr);
  }

  return `# CyberShield - Auto-Recover Reinstall for: ${agentName}
# Generated: ${new Date().toISOString()}
# Script version: ${scriptVersion}
# This script preserves the agent identity (no duplicate)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$InstallDir = "C:\\CyberShield"
$TaskName = "CyberShieldAgent"
$q = [char]34

# Pre-loaded credentials (recovered from server)
$AgentName = "${agentName}"
$AgentToken = "${freshToken}"
$HmacSecret = "${hmacSecret}"
$ServerUrl = "${supabaseUrl}"

function Write-Status {
    param([string]$M, [string]$T = "INFO")
    $colors = @{INFO="Cyan";SUCCESS="Green";WARN="Yellow";ERROR="Red"}
    $c = if ($colors.ContainsKey($T)) { $colors[$T] } else { "White" }
    Write-Host "[$T] $M" -ForegroundColor $c
}

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host " CyberShield - Auto-Recover Reinstall" -ForegroundColor Cyan
Write-Host " Agent: $AgentName" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) { Write-Status "ERROR: Must run as Administrator!" "ERROR"; Start-Sleep -Seconds 10; return }

Write-Status "Credentials pre-loaded from server" "SUCCESS"
Write-Status "  Agent: $AgentName" "INFO"
Write-Status "  Token: $($AgentToken.Substring(0,8))..." "INFO"
Write-Status "  HMAC: $(if($HmacSecret){'YES'}else{'NO'})" "INFO"
Write-Host ""

try {
Write-Status "PHASE 1/4: Stop Services" "INFO"
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) { $tasks | ForEach-Object { Write-Status "  Stopping: $($_.TaskName)" "INFO"; Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue }; Write-Status "All CyberShield tasks removed" "SUCCESS" } else { Write-Status "No tasks to stop" "WARN" }
Start-Sleep -Seconds 2

Write-Status "PHASE 2/4: Backup" "INFO"
if (-not (Test-Path $InstallDir)) { New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null; Write-Status "Created $InstallDir" "SUCCESS" }
$backupDir = "$InstallDir\\backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }
$existingScripts = Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' }
if ($existingScripts) { $backupName = "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"; $existingScripts | ForEach-Object { Copy-Item $_.FullName (Join-Path $backupDir $backupName) -Force }; Write-Status "Backup: $backupName" "SUCCESS" } else { Write-Status "No existing scripts to backup" "WARN" }

Write-Status "PHASE 3/4: Install Script" "INFO"
Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' } | Remove-Item -Force
$scriptPath = "$InstallDir\\cybershield-agent-$AgentName.ps1"
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$dlUrl = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$cacheBust"
Write-Status "Downloading from: $dlUrl" "INFO"

$newScript = $null
try { $newScript = Invoke-RestMethod -Uri $dlUrl -Method GET -TimeoutSec 60; if ($newScript -and $newScript.Length -gt 5000) { Write-Status "Downloaded ($($newScript.Length) chars)" "SUCCESS" } else { $newScript = $null } } catch { Write-Status "Download method 1 failed: $($_.Exception.Message)" "WARN" }
if (-not $newScript) { try { $resp = Invoke-WebRequest -Uri $dlUrl -UseBasicParsing -TimeoutSec 60; if ($resp.Content -and $resp.Content.Length -gt 5000) { $newScript = $resp.Content; Write-Status "Downloaded via fallback ($($resp.Content.Length) chars)" "SUCCESS" } } catch { Write-Status "Download method 2 failed: $($_.Exception.Message)" "WARN" } }
if (-not $newScript) { Write-Status "ALL download methods FAILED!" "ERROR"; Start-Sleep -Seconds 10; return }

if ($newScript -match '\\$anomalies\\.anomalies') {
    $safeAnomalyExpr = '$(if ($anomalies -is [hashtable] -and $anomalies.ContainsKey("anomalies") -and $null -ne $anomalies["anomalies"]) { @($anomalies["anomalies"]) } else { @() })'
    $newScript = $newScript.Replace('$anomalies.anomalies', $safeAnomalyExpr)
    Write-Status "Applied heartbeat anomaly hotfix to downloaded script" "WARN"
}

[System.IO.File]::WriteAllText($scriptPath, $newScript, [System.Text.Encoding]::UTF8)
Write-Status "Script written: $scriptPath" "SUCCESS"
$newVer = "unknown"
if ($newScript -match 'AgentVersion\\s*=\\s*"([^"]+)"') { $newVer = $Matches[1] }
Write-Status "Version: $newVer" "SUCCESS"
Write-Host ""

Write-Status "PHASE 4/4: Register Task" "INFO"
$hashCacheDir = "$InstallDir\\data"
$staleHashFiles = @("$hashCacheDir\\expected_script_hash.json", "$hashCacheDir\\expected_script_hash.txt")
foreach ($stale in $staleHashFiles) { if (Test-Path $stale) { Remove-Item $stale -Force -ErrorAction SilentlyContinue; Write-Status "Cleared stale integrity cache: $stale" "INFO" } }

$taskArgStr = "-NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File $q$scriptPath$q -ServerUrl $q$ServerUrl$q -AgentToken $q$AgentToken$q -HmacSecret $q$HmacSecret$q -AgentName $q$AgentName$q"
$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $taskArgStr
$trigger1 = New-ScheduledTaskTrigger -AtStartup
$trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365)
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$taskFullName = "$TaskName-$AgentName"
Register-ScheduledTask -TaskName $taskFullName -Action $action -Trigger @($trigger1,$trigger2) -Settings $settings -Principal $principal -Force | Out-Null
Write-Status "Task registered: $taskFullName (AtStartup + every 5min)" "SUCCESS"
Start-ScheduledTask -TaskName $taskFullName
Write-Status "Task started" "SUCCESS"
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "========================================" -ForegroundColor Green
Write-Host " REINSTALLATION COMPLETED!" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Green
Write-Host ""
Write-Host "  Agent:    $AgentName" -ForegroundColor White
Write-Host "  Version:  $newVer" -ForegroundColor White
Write-Host "  Identity: PRESERVED (same agent ID)" -ForegroundColor Green
Write-Host "  Task:     $taskFullName" -ForegroundColor White
Write-Host ""

$finalTask = Get-ScheduledTask -TaskName $taskFullName -ErrorAction SilentlyContinue
if ($finalTask) { Write-Host "  State: $($finalTask.State)" -ForegroundColor White }
Write-Host ""

} catch {
    Write-Host ""
    Write-Status "FATAL ERROR: $($_.Exception.Message)" "ERROR"
    Write-Status "Line: $($_.InvocationInfo.ScriptLineNumber)" "ERROR"
    Write-Host $_.ScriptStackTrace -ForegroundColor Red
    Write-Host ""
}

Start-Sleep -Seconds 15
`;
}

// ═══ Main Handler ═══
export async function handleGetReinstallByName(
  supabase: SupabaseClient,
  req: Request,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const origin = req.headers.get('origin');
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;

  // Extract agent name from payload
  const agentName = (typeof payload.name === 'string' ? payload.name.trim() : '') ||
                    (typeof payload.agent_name === 'string' ? payload.agent_name.trim() : '');

  if (!agentName) {
    return new Response('# ERROR: Missing agent name\nWrite-Host "ERROR: Specify agent name in payload" -ForegroundColor Red\n', {
      status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  // Authenticate
  const auth = await resolveAuth(req, supabase, requestId, origin, payload);
  if (auth.response) return auth.response;
  if (!auth.tenantId) {
    return new Response('# ERROR: Could not determine tenant\nWrite-Host "ERROR: No tenant" -ForegroundColor Red\n', {
      status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  logger.info(`[${requestId}] Reinstall-by-name for agent: ${agentName}, tenant: ${auth.tenantId}`);

  const { data: agent, error: agentError } = await supabase
    .from('agents').select('id, agent_name, hmac_secret, tenant_id')
    .eq('agent_name', agentName).eq('tenant_id', auth.tenantId).maybeSingle();

  if (agentError || !agent) {
    return new Response(`# ERROR: Agent "${agentName}" not found in your tenant\nWrite-Host "ERROR: Agent not found: ${agentName}" -ForegroundColor Red\n`, {
      status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const freshToken = crypto.randomUUID();
  const tokenHash = await hashToken(freshToken);
  const tokenPrefix = freshToken.substring(0, 8);

  await supabase.from('agent_tokens').update({ is_active: false }).eq('agent_id', agent.id);
  const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
  const { error: tokenError } = await supabase.from('agent_tokens').insert({
    agent_id: agent.id, token_hash: tokenHash, token_prefix: tokenPrefix,
    expires_at: tokenExpiresAt, is_active: true,
  });

  if (tokenError) {
    return new Response('# ERROR: Failed to generate credentials\nWrite-Host "ERROR: Token creation failed" -ForegroundColor Red\n', {
      status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  supabase.from('audit_logs').insert({
    action: 'reinstall_by_name', resource_type: 'agent', resource_id: agent.id,
    tenant_id: agent.tenant_id, details: { agent_name: agentName, token_prefix: tokenPrefix }, success: true,
  }).then(() => {});

  const { data: release } = await supabase
    .from('agent_releases').select('script_content, version')
    .eq('platform', 'windows').eq('is_active', true)
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (!release?.script_content) {
    return new Response('# ERROR: No active agent script found\nWrite-Host "ERROR: No script available" -ForegroundColor Red\n', {
      status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' },
    });
  }

  const script = buildReinstallScript(agentName, freshToken, agent.hmac_secret || '', supabaseUrl, release.version || 'unknown', release.script_content);

  return new Response(script, {
    status: 200,
    headers: {
      ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
    },
  });
}
