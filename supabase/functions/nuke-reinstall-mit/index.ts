import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { hashToken } from '../_shared/token-hash.ts';

/**
 * Nuke & Reinstall MIT-SERVIDOR
 * Auto-generates enrollment key server-side so no local files needed
 * GET /functions/v1/nuke-reinstall-mit
 */

const TENANT_ID = '3adc67e6-8908-4d98-b85b-5e93be4673a1';
const AGENT_NAME = 'MIT-SERVIDOR';

function generateKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const parts: string[] = [];
  for (let p = 0; p < 4; p++) {
    let seg = '';
    for (let i = 0; i < 4; i++) {
      seg += chars[Math.floor(Math.random() * chars.length)];
    }
    parts.push(seg);
  }
  return parts.join('-');
}

function buildScript(enrollmentKey: string): string {
  return `# CyberShield - NUKE & REINSTALL - MIT-SERVIDOR
# Apaga TUDO e reinstala do zero (key auto-gerada pelo servidor)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
$EnrollmentKey = "${enrollmentKey}"

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host " NUKE & REINSTALL - MIT-SERVIDOR" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red
Write-Host ""

# Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Execute como Administrador!" -ForegroundColor Red
    Start-Sleep -Seconds 10
    return
}

Write-Host "[OK] Enrollment Key injetada pelo servidor" -ForegroundColor Green

try {
    # 1. Kill ALL CyberShield processes
    Write-Host "[1/6] Matando processos CyberShield..." -ForegroundColor Yellow
    Get-Process | Where-Object { $_.ProcessName -like "*CyberShield*" -or $_.ProcessName -like "*cybershield*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-WmiObject Win32_Process -Filter "CommandLine LIKE '%cybershield-agent%'" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] Processos encerrados" -ForegroundColor Green

    # 2. Remove ALL scheduled tasks
    Write-Host "[2/6] Removendo scheduled tasks..." -ForegroundColor Yellow
    Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "  Removida: $($_.TaskName)" -ForegroundColor Gray
    }
    Write-Host "[OK] Tasks removidas" -ForegroundColor Green

    # 3. NUKE - Delete EVERYTHING
    Write-Host "[3/6] APAGANDO C:\\CyberShield completamente..." -ForegroundColor Red
    if (Test-Path "C:\\CyberShield") {
        Remove-Item -Path "C:\\CyberShield" -Recurse -Force -ErrorAction Stop
        Write-Host "[OK] C:\\CyberShield APAGADO" -ForegroundColor Green
    } else {
        Write-Host "[OK] C:\\CyberShield ja nao existia" -ForegroundColor Green
    }

    # 4. Clean environment variables
    Write-Host "[4/6] Limpando variaveis de ambiente..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_JWT", $null, "Machine")
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_AGENT_NAME", $null, "Machine")
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_KEY", $null, "Machine")
    Write-Host "[OK] Variaveis limpas" -ForegroundColor Green

    # 5. Download fresh installer
    Write-Host "[5/6] Baixando instalador limpo..." -ForegroundColor Yellow
    $installerUrl = "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey" + "?os_type=windows&agent_name=MIT-SERVIDOR&hostname=$($env:COMPUTERNAME)"
    Write-Host "  URL: $installerUrl" -ForegroundColor Gray

    $tempFile = Join-Path $env:TEMP "cybershield-fresh-install.ps1"
    Invoke-WebRequest -Uri $installerUrl -OutFile $tempFile -UseBasicParsing -TimeoutSec 120
    $fileSize = (Get-Item $tempFile).Length
    Write-Host "[OK] Instalador baixado: $fileSize bytes" -ForegroundColor Green

    # Validate
    $firstLine = Get-Content $tempFile -TotalCount 1 -ErrorAction SilentlyContinue
    $firstLineTrimmed = if ($firstLine) { $firstLine.TrimStart() } else { "" }
    if ($firstLineTrimmed -like '<html*' -or $firstLineTrimmed -like '<!DOCTYPE*' -or $firstLineTrimmed -like '{*') {
        Write-Host "[ERROR] Servidor retornou payload invalido!" -ForegroundColor Red
        Write-Host "  Primeira linha: $firstLineTrimmed" -ForegroundColor Red
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        return
    }

    # 6. Execute installer - pass parameters directly to -File
    Write-Host "[6/6] Executando instalador..." -ForegroundColor Yellow
    & powershell.exe -ExecutionPolicy Bypass -File $tempFile -ServerUrl $ServerUrl -EnrollmentKey $EnrollmentKey -AgentToken "auto" -AgentName "MIT-SERVIDOR" -Hostname $env:COMPUTERNAME

    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " REINSTALACAO COMPLETA!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green

    Start-Sleep -Seconds 5
    $task = Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($task) {
        Write-Host "  Task: $($task.TaskName) | State: $($task.State)" -ForegroundColor Green
        try { schtasks /Run /TN $task.TaskName 2>$null } catch { Start-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue }
        Write-Host "  Task iniciada!" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Nenhuma task encontrada apos instalacao" -ForegroundColor Yellow
    }

    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

} catch {
    Write-Host ""
    Write-Host "[FATAL] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Line: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
}

Write-Host ""
Write-Host "Pressione qualquer tecla para fechar..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'GET') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Generate a fresh single-use enrollment key
    const plainKey = generateKey();
    const keyHash = await hashToken(plainKey);

    // Find agent
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('agent_name', AGENT_NAME)
      .eq('tenant_id', TENANT_ID)
      .single();

    // Insert enrollment key linked to this agent
    const { error: insertError } = await supabase
      .from('enrollment_keys')
      .insert({
        key_hash: keyHash,
        tenant_id: TENANT_ID,
        agent_id: agent?.id || null,
        description: `Auto-generated nuke-reinstall key for ${AGENT_NAME}`,
        is_active: true,
        max_uses: 1,
        current_uses: 0,
        auto_generated: true,
        expires_at: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
      });

    if (insertError) {
      console.error('[nuke-reinstall-mit] Failed to create enrollment key:', insertError);
      return new Response(JSON.stringify({ error: 'Failed to provision key' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[nuke-reinstall-mit] Generated temp key for ${AGENT_NAME}, expires in 30min`);

    const script = buildScript(plainKey);

    return new Response(script, {
      status: 200,
      headers: {
        ...corsHeaders,
        'Content-Type': 'text/plain; charset=utf-8',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      },
    });
  } catch (error) {
    console.error('[nuke-reinstall-mit] Error:', error);
    return new Response(JSON.stringify({ error: 'Internal error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
