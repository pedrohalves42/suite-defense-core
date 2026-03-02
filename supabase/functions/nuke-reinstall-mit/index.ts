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

    # 5. Clean environment variables
    Write-Host "[4/6] Limpando variaveis de ambiente..." -ForegroundColor Yellow
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_KEY", $null, "Machine")
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_JWT", $null, "Machine")
    [Environment]::SetEnvironmentVariable("CYBERSHIELD_AGENT_NAME", $null, "Machine")
    Write-Host "[OK] Variaveis limpas" -ForegroundColor Green

    # 6. Download and run fresh installer
    Write-Host "[5/6] Baixando instalador limpo..." -ForegroundColor Yellow
    $enrollmentKeyId = "195abf32-ee46-4cec-9297-2a1c89277588"
    $installerUrl = "$ServerUrl/functions/v1/serve-installer/$enrollmentKeyId" + "?os_type=windows&agent_name=MIT-SERVIDOR"
    
    Write-Host "  URL: $installerUrl" -ForegroundColor Gray
    
    $tempFile = Join-Path $env:TEMP "cybershield-fresh-install.ps1"
    
    try {
        $response = Invoke-WebRequest -Uri $installerUrl -OutFile $tempFile -UseBasicParsing -TimeoutSec 120 -PassThru
        $fileSize = (Get-Item $tempFile).Length
        Write-Host "[OK] Instalador baixado: $fileSize bytes" -ForegroundColor Green
    } catch {
        Write-Host "[ERROR] Falha no download: $($_.Exception.Message)" -ForegroundColor Red
        
        # Fallback: try get-latest-agent-script
        Write-Host "[RETRY] Tentando via get-latest-agent-script..." -ForegroundColor Yellow
        $fallbackUrl = "$ServerUrl/functions/v1/get-latest-agent-script?platform=windows&format=plain"
        Invoke-WebRequest -Uri $fallbackUrl -OutFile $tempFile -UseBasicParsing -TimeoutSec 120
        $fileSize = (Get-Item $tempFile).Length
        Write-Host "[OK] Script baixado via fallback: $fileSize bytes" -ForegroundColor Green
    }

    # Validate file is not HTML/error
    $firstLine = Get-Content $tempFile -TotalCount 1 -ErrorAction SilentlyContinue
    if ($firstLine -match "<html|<!DOCTYPE|<head") {
        Write-Host "[ERROR] Servidor retornou HTML em vez de script!" -ForegroundColor Red
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
