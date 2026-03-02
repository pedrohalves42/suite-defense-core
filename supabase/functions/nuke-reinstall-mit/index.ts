import { corsHeaders } from '../_shared/cors.ts';

/**
 * Nuke & Reinstall MIT-SERVIDOR
 * Complete wipe + fresh install from scratch
 * GET /functions/v1/nuke-reinstall-mit
 * Usage: irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/nuke-reinstall-mit | iex
 */

const SCRIPT = `# CyberShield - NUKE & REINSTALL - MIT-SERVIDOR
# Apaga TUDO e reinstala do zero
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
$ErrorActionPreference = "Stop"
$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"

Write-Host ""
Write-Host "============================================" -ForegroundColor Red
Write-Host " NUKE & REINSTALL - MIT-SERVIDOR" -ForegroundColor Red
Write-Host "============================================" -ForegroundColor Red
Write-Host ""

# 1. Admin check
$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Host "[ERROR] Execute como Administrador!" -ForegroundColor Red
    Start-Sleep -Seconds 10
    return
}

# 1.5 Resolve enrollment key (env -> file -> prompt)
$EnrollmentKey = [Environment]::GetEnvironmentVariable("CYBERSHIELD_KEY", "Machine")
if (-not $EnrollmentKey) { $EnrollmentKey = $env:CYBERSHIELD_KEY }

if (-not $EnrollmentKey -and (Test-Path "C:\\CyberShield\\enrollment.key")) {
    try {
        $EnrollmentKey = (Get-Content "C:\\CyberShield\\enrollment.key" -Raw -ErrorAction SilentlyContinue).Trim()
        if ($EnrollmentKey) { Write-Host "[OK] Enrollment key carregada de C:\\CyberShield\\enrollment.key" -ForegroundColor Green }
    } catch {
        Write-Host "[WARN] Nao foi possivel ler enrollment.key: $($_.Exception.Message)" -ForegroundColor Yellow
    }
}

if (-not $EnrollmentKey) {
    Write-Host "[WARN] CYBERSHIELD_KEY nao encontrada. Informe a Enrollment Key (XXXX-XXXX-XXXX-XXXX):" -ForegroundColor Yellow
    $EnrollmentKey = Read-Host "Enrollment Key"
}

if (-not $EnrollmentKey) {
    Write-Host "[ERROR] Enrollment Key obrigatoria para reinstalar do zero." -ForegroundColor Red
    Start-Sleep -Seconds 10
    return
}

$EnrollmentKey = $EnrollmentKey.Trim().Trim('"').Trim("'")

try {
    # 2. Kill ALL CyberShield processes
    Write-Host "[1/6] Matando processos CyberShield..." -ForegroundColor Yellow
    Get-Process | Where-Object { $_.ProcessName -like "*CyberShield*" -or $_.ProcessName -like "*cybershield*" } | Stop-Process -Force -ErrorAction SilentlyContinue
    Get-WmiObject Win32_Process -Filter "CommandLine LIKE '%cybershield-agent%'" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue
    }
    Write-Host "[OK] Processos encerrados" -ForegroundColor Green

    # 3. Remove ALL scheduled tasks
    Write-Host "[2/6] Removendo scheduled tasks..." -ForegroundColor Yellow
    Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue | ForEach-Object {
        Stop-ScheduledTask -TaskName $_.TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $_.TaskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-Host "  Removida: $($_.TaskName)" -ForegroundColor Gray
    }
    Write-Host "[OK] Tasks removidas" -ForegroundColor Green

    # 4. NUKE - Delete EVERYTHING
    Write-Host "[3/6] APAGANDO C:\\CyberShield completamente..." -ForegroundColor Red
    if (Test-Path "C:\\CyberShield") {
        Remove-Item -Path "C:\\CyberShield" -Recurse -Force -ErrorAction Stop
        Write-Host "[OK] C:\\CyberShield APAGADO" -ForegroundColor Green
    } else {
        Write-Host "[OK] C:\\CyberShield ja nao existia" -ForegroundColor Green
    }

    # 5. Clean environment variables (preserva enrollment key para recuperacao futura)
    Write-Host "[4/6] Limpando variaveis de ambiente temporarias..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_JWT", $null, "Machine")
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_AGENT_NAME", $null, "Machine")
    Write-Host "[OK] Variaveis temporarias limpas (CYBERSHIELD_KEY preservada)" -ForegroundColor Green

    # 6. Download and run fresh installer
    Write-Host "[5/6] Baixando instalador limpo..." -ForegroundColor Yellow
    $installerUrl = "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey?os_type=windows&agent_name=MIT-SERVIDOR&hostname=$($env:COMPUTERNAME)"
    $installerUrlQueryMode = "$ServerUrl/functions/v1/serve-installer?enrollment_key=$([System.Uri]::EscapeDataString($EnrollmentKey))&os_type=windows&agent_name=MIT-SERVIDOR&hostname=$($env:COMPUTERNAME)"

    Write-Host "  URL (path mode): $installerUrl" -ForegroundColor Gray

    $tempFile = Join-Path $env:TEMP "cybershield-fresh-install.ps1"

    try {
        $response = Invoke-WebRequest -Uri $installerUrl -OutFile $tempFile -UseBasicParsing -TimeoutSec 120 -PassThru
        $fileSize = (Get-Item $tempFile).Length
        Write-Host "[OK] Instalador baixado (path mode): $fileSize bytes" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] Falha no path mode: $($_.Exception.Message)" -ForegroundColor Yellow
        Write-Host "[RETRY] Tentando query mode..." -ForegroundColor Yellow
        $response = Invoke-WebRequest -Uri $installerUrlQueryMode -OutFile $tempFile -UseBasicParsing -TimeoutSec 120 -PassThru
        $fileSize = (Get-Item $tempFile).Length
        Write-Host "[OK] Instalador baixado (query mode): $fileSize bytes" -ForegroundColor Green
    }

    # Validate file is script, not HTML/JSON error payload
    $firstLine = Get-Content $tempFile -TotalCount 1 -ErrorAction SilentlyContinue
    if ($firstLine -match "<html|<!DOCTYPE|<head|^\s*\{\s*\"error\"|^\s*\{\s*\"code\"") {
        Write-Host "[ERROR] Servidor retornou payload invalido em vez de script!" -ForegroundColor Red
        Write-Host "  Primeira linha: $firstLine" -ForegroundColor Red
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        return
    }
    Write-Host "  Primeira linha: $firstLine" -ForegroundColor Gray

    # 7. Execute installer
    Write-Host "[6/6] Executando instalador..." -ForegroundColor Yellow
    Write-Host "" 
    & powershell.exe -ExecutionPolicy Bypass -File $tempFile
    
    Write-Host ""
    Write-Host "============================================" -ForegroundColor Green
    Write-Host " REINSTALACAO COMPLETA!" -ForegroundColor Green
    Write-Host "============================================" -ForegroundColor Green
    
    # Verify
    Start-Sleep -Seconds 5
    $task = Get-ScheduledTask -TaskName "*CyberShield*" -ErrorAction SilentlyContinue | Select-Object -First 1
    if ($task) {
        Write-Host "  Task: $($task.TaskName) | State: $($task.State)" -ForegroundColor Green
        Start-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
        Write-Host "  Task iniciada!" -ForegroundColor Green
    } else {
        Write-Host "  [WARN] Nenhuma task encontrada apos instalacao" -ForegroundColor Yellow
    }
    
    if (Test-Path "C:\\CyberShield") {
        $files = Get-ChildItem "C:\\CyberShield" -ErrorAction SilentlyContinue
        Write-Host "  Arquivos em C:\\CyberShield:" -ForegroundColor Cyan
        $files | ForEach-Object { Write-Host "    $($_.Name) ($($_.Length) bytes)" -ForegroundColor Gray }
    }
    
    # Cleanup temp
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue

} catch {
    Write-Host ""
    Write-Host "[FATAL] $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  Line: $($_.InvocationInfo.ScriptLineNumber)" -ForegroundColor Red
    Write-Host "  Stack: $($_.ScriptStackTrace)" -ForegroundColor DarkRed
}

Write-Host ""
Write-Host "Pressione qualquer tecla para fechar..." -ForegroundColor Gray
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
`;

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

  console.log('[nuke-reinstall-mit] Serving nuke script');

  return new Response(SCRIPT, {
    status: 200,
    headers: {
      ...corsHeaders,
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
    },
  });
});
