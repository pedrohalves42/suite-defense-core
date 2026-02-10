import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { logger } from '../_shared/logger.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }

  const methodError = validateHttpMethod(req, ['POST'])
  if (methodError) return methodError

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Validate JWT - must be authenticated user
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const token = authHeader.replace('Bearer ', '')
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const body = await req.json()
    const { tenant_id, agent_ids } = body

    if (!tenant_id) {
      return new Response(
        JSON.stringify({ error: 'tenant_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify user has access to this tenant
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .maybeSingle()

    if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get active enrollment key for the tenant
    const { data: enrollmentKey } = await supabase
      .from('enrollment_keys')
      .select('key')
      .eq('tenant_id', tenant_id)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!enrollmentKey) {
      return new Response(
        JSON.stringify({ error: 'No active enrollment key found for this tenant. Create one first.' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Get stuck/outdated agents
    let query = supabase
      .from('agents')
      .select('id, agent_name, agent_version, status, last_heartbeat, force_update_version, force_update_delivered_count')
      .eq('tenant_id', tenant_id)
      .eq('status', 'active')
      .is('archived_at', null)

    if (agent_ids && agent_ids.length > 0) {
      query = query.in('id', agent_ids)
    }

    const { data: agents, error: agentsError } = await query.order('agent_name')

    if (agentsError) {
      throw agentsError
    }

    // Get latest version
    const { data: latestRelease } = await supabase
      .from('agent_releases')
      .select('version')
      .eq('platform', 'windows')
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    const latestVersion = latestRelease?.version || 'unknown'

    // Filter to only outdated agents
    const outdatedAgents = agents?.filter(a => a.agent_version !== latestVersion) || []

    // Generate nuclear reinstall command
    const serverUrl = supabaseUrl
    const ek = enrollmentKey.key

    const singleCommand = `[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; $ek="${ek}"; irm "${serverUrl}/functions/v1/serve-installer/$ek?os_type=windows" -UseBasicParsing | iex`

    // Generate batch script for RMM/GPO
    const batchScript = `@echo off
REM CyberShield Fleet Nuclear Reinstall - Generated ${new Date().toISOString()}
REM Tenant: ${tenant_id}
REM Target: ${outdatedAgents.length} agents -> v${latestVersion}
REM Run as Administrator on each target machine

powershell.exe -ExecutionPolicy Bypass -NoProfile -Command "${singleCommand}"

echo.
echo Reinstallation completed. Check dashboard for agent status.
pause`

    // Generate PowerShell script for mass deployment
    const psScript = `# CyberShield Fleet Nuclear Reinstall
# Generated: ${new Date().toISOString()}
# Tenant: ${tenant_id}
# Target: ${outdatedAgents.length} agents -> v${latestVersion}
# Execute as Administrator

[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"

Write-Host "=== CyberShield Nuclear Reinstall ===" -ForegroundColor Cyan
Write-Host "Target version: v${latestVersion}" -ForegroundColor Yellow

# 1. Stop existing CyberShield tasks
Write-Host "[1/4] Stopping existing agent..." -ForegroundColor Yellow
Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object {
    Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
}

# 2. Remove old installation
Write-Host "[2/4] Removing old installation..." -ForegroundColor Yellow
if (Test-Path "C:\\CyberShield") {
    Remove-Item "C:\\CyberShield" -Recurse -Force
}

# 3. Download and execute fresh installer
Write-Host "[3/4] Downloading fresh installer..." -ForegroundColor Yellow
$installerUrl = "${serverUrl}/functions/v1/serve-installer/${ek}?os_type=windows"
$installerScript = Invoke-RestMethod -Uri $installerUrl -UseBasicParsing
Invoke-Expression $installerScript

# 4. Verify
Write-Host "[4/4] Verifying..." -ForegroundColor Yellow
Start-Sleep -Seconds 10
$task = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($task) {
    Write-Host "SUCCESS: Task '$($task.TaskName)' created ($($task.State))" -ForegroundColor Green
} else {
    Write-Host "WARNING: No CyberShield task found after install" -ForegroundColor Red
}
`

    logger.info('Force reinstall fleet commands generated', {
      tenantId: tenant_id,
      userId: user.id,
      outdatedCount: outdatedAgents.length,
      targetVersion: latestVersion
    })

    return new Response(
      JSON.stringify({
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
            '1. Execute o comando PowerShell como Administrador em cada máquina',
            '2. Para deploy em massa, use o batch_script via RMM (ConnectWise, Datto, etc.) ou GPO',
            '3. Após execução, aguarde 2-3 minutos e verifique o dashboard',
            '4. Agentes devem aparecer online com a versão v' + latestVersion
          ]
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'force-reinstall-fleet')
  }
})
