import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { requireEnv } from '../_shared/env.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;
  const supabaseUrl = requireEnv('SUPABASE_URL');

  const { agent_ids, action } = body;

  // Verify user has admin/operator role for this tenant
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role')
    .eq('user_id', userId)
    .eq('tenant_id', tenantId)
    .maybeSingle();

  if (!userRole || !['admin', 'super_admin', 'operator'].includes(userRole.role)) {
    return new Response(
      JSON.stringify({ error: 'Insufficient permissions' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // === ACTION: generate-key ===
  if (action === 'generate-key') {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    const segments = [];
    for (let i = 0; i < 4; i++) {
      const randomBytes = new Uint8Array(4);
      crypto.getRandomValues(randomBytes);
      let segment = '';
      for (let j = 0; j < 4; j++) {
        segment += chars[randomBytes[j] % chars.length];
      }
      segments.push(segment);
    }
    const plaintextKey = segments.join('-');

    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(plaintextKey));
    const keyHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: keyData, error: insertError } = await supabase
      .from('enrollment_keys')
      .insert({
        key_hash: keyHash,
        created_by: userId,
        expires_at: expiresAt,
        max_uses: 100,
        description: `Fallback key generated via force-reinstall-fleet`,
        tenant_id: tenantId,
      })
      .select()
      .maybeSingle();

    if (insertError) throw insertError;

    logger.info('[force-reinstall-fleet] Enrollment key generated', {
      tenantId, userId, keyId: keyData?.id, requestId
    });

    return {
      ok: true,
      action: 'generate-key',
      enrollment_key: plaintextKey,
      key_id: keyData?.id,
      expires_at: expiresAt,
      max_uses: 100,
      warning: 'ANOTE ESTA CHAVE! Ela nao pode ser recuperada depois (armazenada apenas como hash).',
      nuclear_reinstall_command: `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $h=$env:COMPUTERNAME; Get-ScheduledTask -TaskName '*CyberShield*' -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue }; Remove-Item 'C:\\CyberShield' -Recurse -Force -ErrorAction SilentlyContinue; $t=Join-Path $env:TEMP "cs-$(Get-Random).ps1"; irm "${supabaseUrl}/functions/v1/serve-installer/${plaintextKey}?hostname=$h&os_type=windows" -OutFile $t -UseBasicParsing; & $t; Remove-Item $t -Force -ErrorAction SilentlyContinue`
    };
  }

  // === DEFAULT ACTION: fleet reinstall commands ===
  const { data: enrollmentKey } = await supabase
    .from('enrollment_keys')
    .select('key')
    .eq('tenant_id', tenantId)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!enrollmentKey) {
    return new Response(
      JSON.stringify({ error: 'No active enrollment key found for this tenant. Create one first.' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  let query = supabase
    .from('agents')
    .select('id, agent_name, agent_version, status, last_heartbeat, force_update_version, force_update_delivered_count')
    .eq('tenant_id', tenantId)
    .eq('status', 'active')
    .is('archived_at', null);

  if (agent_ids && agent_ids.length > 0) {
    query = query.in('id', agent_ids);
  }

  const { data: agents, error: agentsError } = await query.order('agent_name');
  if (agentsError) throw agentsError;

  const { data: latestRelease } = await supabase
    .from('agent_releases')
    .select('version')
    .eq('platform', 'windows')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const latestVersion = latestRelease?.version || 'unknown';
  const outdatedAgents = agents?.filter(a => a.agent_version !== latestVersion) || [];

  const serverUrl = supabaseUrl;
  const ek = enrollmentKey.key;

  const singleCommand = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ek="${ek}"; $h=$env:COMPUTERNAME; Get-ScheduledTask -TaskName '*CyberShield*' -ErrorAction SilentlyContinue | ForEach-Object { Stop-ScheduledTask $_.TaskName -ErrorAction SilentlyContinue; Unregister-ScheduledTask $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue }; Remove-Item 'C:\\CyberShield' -Recurse -Force -ErrorAction SilentlyContinue; $t=Join-Path $env:TEMP "cs-$(Get-Random).ps1"; irm "${serverUrl}/functions/v1/serve-installer/$ek?hostname=$h&os_type=windows" -UseBasicParsing -OutFile $t; & $t; Remove-Item $t -Force -ErrorAction SilentlyContinue`;

  const batchScript = `@echo off
REM CyberShield Fleet Nuclear Reinstall - Generated ${new Date().toISOString()}
REM Tenant: ${tenantId}
REM Target: ${outdatedAgents.length} agents -> v${latestVersion}
REM Run as Administrator on each target machine

powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "${singleCommand}"

echo.
echo Reinstallation completed. Check dashboard for agent status.
pause`;

  const psScript = `# CyberShield Fleet Nuclear Reinstall
# Generated: ${new Date().toISOString()}
# Tenant: ${tenantId}
# Target: ${outdatedAgents.length} agents -> v${latestVersion}
# Execute as Administrator

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"

Write-Host "=== CyberShield Nuclear Reinstall ===" -ForegroundColor Cyan
Write-Host "Target version: v${latestVersion}" -ForegroundColor Yellow

Write-Host "[1/4] Stopping existing agent..." -ForegroundColor Yellow
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
}

Write-Host "[2/4] Removing old installation..." -ForegroundColor Yellow
if (Test-Path "C:\\CyberShield") {
    Remove-Item "C:\\CyberShield" -Recurse -Force
}

Write-Host "[3/4] Downloading fresh installer..." -ForegroundColor Yellow
$installerUrl = "${serverUrl}/functions/v1/serve-installer/${ek}?hostname=$($env:COMPUTERNAME)&os_type=windows"
$tempInstaller = Join-Path $env:TEMP "cybershield-installer-$(Get-Random).ps1"
Invoke-RestMethod -Uri $installerUrl -OutFile $tempInstaller -UseBasicParsing
& $tempInstaller
Remove-Item $tempInstaller -Force -ErrorAction SilentlyContinue

Write-Host "[4/4] Verifying..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
$task = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($task) {
    Write-Host "SUCCESS: Task '$($task.TaskName)' created ($($task.State))" -ForegroundColor Green
} else {
    Write-Host "WARNING: No CyberShield task found after install" -ForegroundColor Red
}
`;

  logger.info('[force-reinstall-fleet] Commands generated', {
    tenantId, userId, outdatedCount: outdatedAgents.length, targetVersion: latestVersion, requestId
  });

  return {
    ok: true,
    latest_version: latestVersion,
    total_agents: agents?.length || 0,
    outdated_agents: outdatedAgents.map(a => ({
      id: a.id,
      name: a.agent_name,
      current_version: a.agent_version,
      force_update_delivered_count: a.force_update_delivered_count || 0
    })),
    commands: {
      powershell_oneliner: singleCommand,
      batch_script: batchScript,
      powershell_full: psScript,
      instructions: [
        '1. Execute o comando PowerShell como Administrador em cada maquina',
        '2. Para deploy em massa, use o batch_script via RMM (ConnectWise, Datto, etc.) ou GPO',
        '3. Apos execucao, aguarde 2-3 minutos e verifique o dashboard',
        '4. Agentes devem aparecer online com a versao v' + latestVersion
      ]
    }
  };
}, { methods: ['POST'] });
