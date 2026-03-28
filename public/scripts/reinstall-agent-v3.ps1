# =============================================================================
# CyberShield Agent - Script de Reinstalacao v1.0
# =============================================================================
# Este script remove completamente o agente antigo e instala a versao mais recente.
# Use quando o agente esta offline ou com versao incompativel (< v3.10.24).
#
# USO:
#   1. Execute como Administrador no PowerShell
#   2. Passe a URL de instalacao gerada no dashboard
#
# EXEMPLO:
#   .\reinstall-agent-v3.ps1 -InstallUrl "https://...functions/v1/serve-installer?key=ABC123"
#
# =============================================================================

#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory = $true, HelpMessage = "URL de instalacao gerada no dashboard CyberShield")]
    [string]$InstallUrl
)

$ErrorActionPreference = "Stop"
$ProgressPreference = 'SilentlyContinue'

# Configurar TLS 1.2 imediatamente
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " CyberShield Agent - Reinstalacao Completa" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# =============================================================================
# FASE 1: Parar processos do agente
# =============================================================================
Write-Host "[FASE 1/5] Parando processos do agente..." -ForegroundColor Yellow

$agentProcesses = Get-WmiObject Win32_Process -Filter "CommandLine LIKE '%cybershield-agent%'" 2>$null
if ($agentProcesses) {
    foreach ($proc in $agentProcesses) {
        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            Write-Host "  [OK] Processo $($proc.ProcessId) encerrado" -ForegroundColor Green
        } catch {
            Write-Host "  [AVISO] Nao foi possivel encerrar processo $($proc.ProcessId)" -ForegroundColor DarkYellow
        }
    }
} else {
    Write-Host "  [OK] Nenhum processo do agente em execucao" -ForegroundColor Green
}

Start-Sleep -Seconds 2

# =============================================================================
# FASE 2: Remover Scheduled Tasks
# =============================================================================
Write-Host ""
Write-Host "[FASE 2/5] Removendo Scheduled Tasks..." -ForegroundColor Yellow

$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($tasks) {
    foreach ($task in $tasks) {
        try {
            Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction SilentlyContinue
            Write-Host "  [OK] Task '$($task.TaskName)' removida" -ForegroundColor Green
        } catch {
            Write-Host "  [AVISO] Erro ao remover task '$($task.TaskName)': $($_.Exception.Message)" -ForegroundColor DarkYellow
        }
    }
} else {
    Write-Host "  [OK] Nenhuma Scheduled Task encontrada" -ForegroundColor Green
}

# =============================================================================
# FASE 3: Remover pasta de instalacao
# =============================================================================
Write-Host ""
Write-Host "[FASE 3/5] Removendo pasta de instalacao..." -ForegroundColor Yellow

$installPath = "C:\CyberShield"
if (Test-Path $installPath) {
    try {
        Remove-Item -Path $installPath -Recurse -Force -ErrorAction Stop
        Write-Host "  [OK] Pasta $installPath removida" -ForegroundColor Green
    } catch {
        Write-Host "  [AVISO] Erro ao remover pasta: $($_.Exception.Message)" -ForegroundColor DarkYellow
        Write-Host "  [INFO] Tentando remover arquivos individualmente..." -ForegroundColor Cyan
        
        Get-ChildItem -Path $installPath -Recurse | ForEach-Object {
            try {
                Remove-Item -Path $_.FullName -Force -ErrorAction SilentlyContinue
            } catch {}
        }
        
        try {
            Remove-Item -Path $installPath -Recurse -Force -ErrorAction SilentlyContinue
        } catch {}
    }
} else {
    Write-Host "  [OK] Pasta $installPath nao existe" -ForegroundColor Green
}

# =============================================================================
# FASE 4: Baixar e executar novo instalador
# =============================================================================
Write-Host ""
Write-Host "[FASE 4/5] Baixando e executando instalador..." -ForegroundColor Yellow

try {
    Write-Host "  [INFO] URL: $InstallUrl" -ForegroundColor Cyan
    Write-Host "  [INFO] Baixando instalador..." -ForegroundColor Cyan
    
    # SEC-FIX: Download-Verify-Execute pattern (replaces Invoke-Expression)
    $tempFile = Join-Path $env:TEMP "cybershield-reinstall-$(Get-Random).ps1"
    Invoke-WebRequest -Uri $InstallUrl -OutFile $tempFile -UseBasicParsing
    
    $fileInfo = Get-Item $tempFile
    if (-not $fileInfo -or $fileInfo.Length -lt 1000) {
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        throw "Script do instalador invalido ou muito pequeno ($($fileInfo.Length) bytes)"
    }
    
    Write-Host "  [OK] Instalador baixado ($($fileInfo.Length) bytes)" -ForegroundColor Green
    
    # Calcular hash SHA-256 local
    $actualHash = (Get-FileHash $tempFile -Algorithm SHA256).Hash
    Write-Host "  [INFO] Hash SHA-256: $actualHash" -ForegroundColor Cyan
    
    # Obter hash esperado do servidor
    $serverUrl = ([System.Uri]$InstallUrl).GetLeftPart([System.UriPartial]::Authority)
    $hashEndpoint = "$serverUrl/functions/v1/get-installer-hash"
    try {
        $expectedHashResponse = Invoke-RestMethod -Uri $hashEndpoint -UseBasicParsing -ErrorAction Stop
        $expectedHash = $expectedHashResponse.sha256
        
        if ($expectedHash -and ($actualHash -ne $expectedHash)) {
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            throw "INTEGRITY CHECK FAILED: expected=$expectedHash actual=$actualHash"
        }
        Write-Host "  [OK] Verificacao de integridade aprovada" -ForegroundColor Green
    } catch [System.Net.WebException] {
        Write-Host "  [AVISO] Endpoint de hash nao disponivel, prosseguindo com verificacao de tamanho" -ForegroundColor DarkYellow
    }
    
    Write-Host "  [INFO] Executando instalador..." -ForegroundColor Cyan
    
    # Executar via operador de chamada (seguro, sem Invoke-Expression)
    & $tempFile
    
    # Limpar arquivo temporario
    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    
    Write-Host "  [OK] Instalador executado com sucesso" -ForegroundColor Green
    
} catch {
    Write-Host "  [ERRO] Falha ao baixar/executar instalador: $($_.Exception.Message)" -ForegroundColor Red
    Write-Host ""
    Write-Host "DIAGNOSTICO:" -ForegroundColor Yellow
    Write-Host "  1. Verifique se a URL esta correta e nao expirou" -ForegroundColor White
    Write-Host "  2. Verifique conectividade: Test-NetConnection iavbnmduxpxhwubqrzzn.supabase.co -Port 443" -ForegroundColor White
    Write-Host "  3. Verifique se ha firewall bloqueando" -ForegroundColor White
    Write-Host ""
    exit 1
}

# =============================================================================
# FASE 5: Validar instalacao
# =============================================================================
Write-Host ""
Write-Host "[FASE 5/5] Validando instalacao..." -ForegroundColor Yellow

Start-Sleep -Seconds 5

# Verificar Scheduled Task
$newTask = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
if ($newTask) {
    Write-Host "  [OK] Scheduled Task criada: $($newTask.TaskName)" -ForegroundColor Green
    Write-Host "       Estado: $($newTask.State)" -ForegroundColor Cyan
} else {
    Write-Host "  [AVISO] Scheduled Task nao encontrada" -ForegroundColor DarkYellow
}

# Verificar pasta de instalacao
if (Test-Path $installPath) {
    $scriptFiles = Get-ChildItem -Path $installPath -Filter "*.ps1" -ErrorAction SilentlyContinue
    Write-Host "  [OK] Pasta de instalacao criada com $($scriptFiles.Count) script(s)" -ForegroundColor Green
} else {
    Write-Host "  [AVISO] Pasta de instalacao nao encontrada" -ForegroundColor DarkYellow
}

# Verificar log
$logFile = Get-ChildItem -Path $installPath -Filter "*.log" -ErrorAction SilentlyContinue | Select-Object -First 1
if ($logFile) {
    $lastLines = Get-Content $logFile.FullName -Tail 5 -ErrorAction SilentlyContinue
    Write-Host "  [OK] Log encontrado: $($logFile.Name)" -ForegroundColor Green
    Write-Host ""
    Write-Host "  Ultimas linhas do log:" -ForegroundColor Cyan
    $lastLines | ForEach-Object { Write-Host "    $_" -ForegroundColor Gray }
}

# =============================================================================
# RESUMO FINAL
# =============================================================================
Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host " Reinstalacao Concluida!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "PROXIMOS PASSOS:" -ForegroundColor Yellow
Write-Host "  1. Aguarde 2-3 minutos para o agente enviar o primeiro heartbeat" -ForegroundColor White
Write-Host "  2. Verifique no dashboard se o agente aparece como 'online'" -ForegroundColor White
Write-Host "  3. Confirme a versao do agente no dashboard (deve ser v3.10.24+)" -ForegroundColor White
Write-Host ""
Write-Host "SUPORTE:" -ForegroundColor Yellow
Write-Host "  Se o agente nao aparecer online apos 5 minutos:" -ForegroundColor White
Write-Host "  1. Execute: Get-Content '$installPath\agent.log' -Tail 50" -ForegroundColor Cyan
Write-Host "  2. Execute: irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-diagnostic-script | iex" -ForegroundColor Cyan
Write-Host ""
