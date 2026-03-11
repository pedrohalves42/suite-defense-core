/**
 * get-reinstall-by-name Edge Function
 * 
 * Returns a complete reinstall-preserve PowerShell script with credentials
 * already embedded. No JWT prompt needed.
 * 
 * Usage (PowerShell as Admin):
 *   irm "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-by-name/AGENT_NAME" | iex
 * 
 * Auth: Requires valid enrollment key as query param ?key=CSH-...
 *       OR valid user JWT in Authorization header
 * 
 * The function:
 * 1. Validates auth (enrollment key or JWT)
 * 2. Finds the agent by name
 * 3. Generates fresh token + retrieves HMAC
 * 4. Returns a self-contained PS1 script with credentials baked in
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { hashToken } from '../_shared/token-hash.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();

  try {
    const url = new URL(req.url);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Extract agent name from path OR query param: /get-reinstall-by-name/AGENT_NAME or ?name=AGENT_NAME
    const pathParts = url.pathname.split('/');
    const pathName = decodeURIComponent(pathParts[pathParts.length - 1] || '').trim();
    const queryName = url.searchParams.get('name')?.trim() || '';
    const agentName = (pathName && pathName !== 'get-reinstall-by-name') ? pathName : queryName;

    if (!agentName) {
      return new Response(
        '# ERROR: Missing agent name in URL\n# Usage: irm ".../get-reinstall-by-name/YOUR_AGENT_NAME?key=YOUR_KEY" | iex\n# Or:    irm ".../get-reinstall-by-name?name=YOUR_AGENT_NAME&key=YOUR_KEY" | iex\nWrite-Host "ERROR: Specify agent name in URL" -ForegroundColor Red\n',
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    // Auth: enrollment key (header/query/body) OR JWT
    const sanitizeEnrollmentKey = (value: string | null): string | null => {
      if (!value) return null;
      return value.replace(/^Bearer\s+/i, '').replace(/^['"]+|['"]+$/g, '').trim();
    };

    const enrollmentKeyFromQuery = sanitizeEnrollmentKey(url.searchParams.get('key'));
    const enrollmentKeyFromHeader = sanitizeEnrollmentKey(req.headers.get('X-Enrollment-Key'));
    let enrollmentKeyFromBody: string | null = null;

    if (!enrollmentKeyFromQuery && !enrollmentKeyFromHeader && req.method === 'POST') {
      try {
        const body = await req.json();
        if (body && typeof body.enrollment_key === 'string') {
          enrollmentKeyFromBody = sanitizeEnrollmentKey(body.enrollment_key);
        }
      } catch {
        // ignore invalid JSON body for auth fallback
      }
    }

    const enrollmentKey = enrollmentKeyFromHeader || enrollmentKeyFromQuery || enrollmentKeyFromBody;
    const authHeader = req.headers.get('Authorization');
    let tenantId: string | null = null;

    if (enrollmentKey) {
      // Validate enrollment key
      const keyHash = await hashToken(enrollmentKey);
      const { data: ek, error: ekError } = await adminClient
        .from('enrollment_keys')
        .select('id, tenant_id, is_active, expires_at, max_uses, current_uses')
        .eq('key_hash', keyHash)
        .eq('is_active', true)
        .maybeSingle();

      if (ekError || !ek) {
        console.error(`[${requestId}] Invalid enrollment key`);
        return new Response(
          '# ERROR: Invalid or expired enrollment key\n# Tip: use an ACTIVE Enrollment Key from Chaves de Instalação (not JWT)\nWrite-Host "ERROR: Invalid key" -ForegroundColor Red\n',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }

      // Check expiry
      if (ek.expires_at && new Date(ek.expires_at) < new Date()) {
        return new Response(
          '# ERROR: Enrollment key has expired\nWrite-Host "ERROR: Key expired" -ForegroundColor Red\n',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }

      // Check max uses
      if (ek.max_uses && ek.current_uses >= ek.max_uses) {
        return new Response(
          '# ERROR: Enrollment key usage limit reached\nWrite-Host "ERROR: Key usage limit reached" -ForegroundColor Red\n',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }

      tenantId = ek.tenant_id;

      // Increment use count
      await adminClient
        .from('enrollment_keys')
        .update({ current_uses: ek.current_uses + 1 })
        .eq('id', ek.id);

    } else if (authHeader) {
      // JWT auth
      const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
      const userClient = createClient(supabaseUrl, anonKey, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: { user }, error: authError } = await userClient.auth.getUser();
      if (authError || !user) {
        return new Response(
          '# ERROR: Invalid JWT token\nWrite-Host "ERROR: Auth failed" -ForegroundColor Red\n',
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
        );
      }
      // Get tenant
      const { data: role } = await adminClient
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();
      tenantId = role?.tenant_id || null;
    } else {
      return new Response(
        '# ERROR: Authentication required\n# Provide one of:\n#  - Query: ?key=YOUR_ENROLLMENT_KEY\n#  - Header: X-Enrollment-Key: YOUR_ENROLLMENT_KEY\n#  - POST JSON: {"enrollment_key":"YOUR_ENROLLMENT_KEY"}\nWrite-Host "ERROR: No auth provided" -ForegroundColor Red\n',
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    if (!tenantId) {
      return new Response(
        '# ERROR: Could not determine tenant\nWrite-Host "ERROR: No tenant" -ForegroundColor Red\n',
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    console.log(`[${requestId}] Reinstall-by-name for agent: ${agentName}, tenant: ${tenantId}`);

    // Find agent
    const { data: agent, error: agentError } = await adminClient
      .from('agents')
      .select('id, agent_name, hmac_secret, tenant_id')
      .eq('agent_name', agentName)
      .eq('tenant_id', tenantId)
      .maybeSingle();

    if (agentError || !agent) {
      console.warn(`[${requestId}] Agent not found: ${agentName}`);
      return new Response(
        `# ERROR: Agent "${agentName}" not found in your tenant\nWrite-Host "ERROR: Agent not found: ${agentName}" -ForegroundColor Red\n`,
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    // Generate fresh token
    const freshToken = crypto.randomUUID();
    const tokenHash = await hashToken(freshToken);
    const tokenPrefix = freshToken.substring(0, 8);

    // Deactivate old tokens
    await adminClient
      .from('agent_tokens')
      .update({ is_active: false })
      .eq('agent_id', agent.id);

    // Create new token
    const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { error: tokenError } = await adminClient
      .from('agent_tokens')
      .insert({
        agent_id: agent.id,
        token_hash: tokenHash,
        token_prefix: tokenPrefix,
        expires_at: tokenExpiresAt,
        is_active: true,
      });

    if (tokenError) {
      console.error(`[${requestId}] Token creation failed:`, tokenError);
      return new Response(
        '# ERROR: Failed to generate credentials\nWrite-Host "ERROR: Token creation failed" -ForegroundColor Red\n',
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    // Audit log (fire and forget - no .catch() on Supabase PromiseLike)
    adminClient.from('audit_logs').insert({
      action: 'reinstall_by_name',
      resource_type: 'agent',
      resource_id: agent.id,
      tenant_id: agent.tenant_id,
      details: {
        agent_name: agentName,
        token_prefix: tokenPrefix,
        method: enrollmentKey ? 'enrollment_key' : 'jwt',
      },
      success: true,
    }).then(() => {});

    // Get latest script
    const { data: release } = await adminClient
      .from('agent_releases')
      .select('script_content, version')
      .eq('platform', 'windows')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!release?.script_content) {
      return new Response(
        '# ERROR: No active agent script found in database\nWrite-Host "ERROR: No script available" -ForegroundColor Red\n',
        { status: 503, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
      );
    }

    const hmacSecret = agent.hmac_secret || '';
    const scriptVersion = release.version || 'unknown';

    console.log(`[${requestId}] Generating preserve script for ${agentName} v${scriptVersion} (token prefix: ${tokenPrefix})`);

    // Build self-contained preserve-reinstall script
    const script = `# CyberShield - Auto-Recover Reinstall for: ${agentName}
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

# Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Status "ERROR: Must run as Administrator!" "ERROR"
    Start-Sleep -Seconds 10
    return
}

Write-Status "Credentials pre-loaded from server" "SUCCESS"
Write-Status "  Agent: $AgentName" "INFO"
Write-Status "  Token: $($AgentToken.Substring(0,8))..." "INFO"
Write-Status "  HMAC: $(if($HmacSecret){'YES'}else{'NO'})" "INFO"
Write-Host ""

try {

# ============================================================
# PHASE 1/4: Stop and Remove Existing Services
# ============================================================
Write-Status "PHASE 1/4: Stop Services" "INFO"

$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    $tasks | ForEach-Object {
        Write-Status "  Stopping: $($_.TaskName)" "INFO"
        Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    }
    Write-Status "All CyberShield tasks removed" "SUCCESS"
} else {
    Write-Status "No tasks to stop" "WARN"
}
Start-Sleep -Seconds 2

# ============================================================
# PHASE 2/4: Backup Current Script (if exists)
# ============================================================
Write-Status "PHASE 2/4: Backup" "INFO"

if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
    Write-Status "Created $InstallDir" "SUCCESS"
}

$backupDir = "$InstallDir\\backup"
if (-not (Test-Path $backupDir)) { New-Item -ItemType Directory -Path $backupDir -Force | Out-Null }

$existingScripts = Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' }
if ($existingScripts) {
    $backupName = "backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
    $existingScripts | ForEach-Object {
        Copy-Item $_.FullName (Join-Path $backupDir $backupName) -Force
    }
    Write-Status "Backup: $backupName" "SUCCESS"
} else {
    Write-Status "No existing scripts to backup" "WARN"
}

# ============================================================
# PHASE 3/4: Write New Agent Script
# ============================================================
Write-Status "PHASE 3/4: Install Script" "INFO"

# Remove old agent scripts
Get-ChildItem "$InstallDir\\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Where-Object { $_.Name -notmatch 'backup' } | Remove-Item -Force

$scriptPath = "$InstallDir\\cybershield-agent-$AgentName.ps1"

# Download latest script from server
$cacheBust = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds()
$dlUrl = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain&cb=$cacheBust"
Write-Status "Downloading from: $dlUrl" "INFO"

$newScript = $null
try {
    $newScript = Invoke-RestMethod -Uri $dlUrl -Method GET -TimeoutSec 60
    if ($newScript -and $newScript.Length -gt 5000) {
        Write-Status "Downloaded ($($newScript.Length) chars)" "SUCCESS"
    } else {
        $newScript = $null
    }
} catch {
    Write-Status "Download method 1 failed: $($_.Exception.Message)" "WARN"
}

if (-not $newScript) {
    try {
        $resp = Invoke-WebRequest -Uri $dlUrl -UseBasicParsing -TimeoutSec 60
        if ($resp.Content -and $resp.Content.Length -gt 5000) {
            $newScript = $resp.Content
            Write-Status "Downloaded via fallback ($($resp.Content.Length) chars)" "SUCCESS"
        }
    } catch {
        Write-Status "Download method 2 failed: $($_.Exception.Message)" "WARN"
    }
}

if (-not $newScript) {
    Write-Status "ALL download methods FAILED!" "ERROR"
    Start-Sleep -Seconds 10
    return
}

# Emergency hotfix: patch legacy builds that still use $anomalies.anomalies (can crash heartbeat)
if ($newScript -match '\$anomalies\.anomalies') {
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

# ============================================================
# PHASE 4/4: Register Scheduled Task
# ============================================================
Write-Status "PHASE 4/4: Register Task" "INFO"

# Clear stale integrity cache from previous versions
$hashCacheDir = "$InstallDir\\data"
$staleHashFiles = @("$hashCacheDir\\expected_script_hash.json", "$hashCacheDir\\expected_script_hash.txt")
foreach ($stale in $staleHashFiles) {
    if (Test-Path $stale) {
        Remove-Item $stale -Force -ErrorAction SilentlyContinue
        Write-Status "Cleared stale integrity cache: $stale" "INFO"
    }
}

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
if ($finalTask) {
    Write-Host "  State: $($finalTask.State)" -ForegroundColor White
}
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

    return new Response(script, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });

  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      `# ERROR: ${error instanceof Error ? error.message : 'Internal error'}\nWrite-Host "ERROR: Internal server error" -ForegroundColor Red\n`,
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/plain; charset=utf-8' } }
    );
  }
});
