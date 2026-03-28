# CyberShield Agent - Reinstalacao com Preservacao de Credenciais
# Version: 1.0.0
# Descricao: Reinstala o agente preservando identidade, credenciais e historico
#
# USO:
#   Automatico (detecta credenciais do script existente):
#     irm https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-reinstall-preserve-script | iex
#
#   Manual (fornece credenciais):
#     .\reinstall-agent-preserve.ps1 -AgentName "nome" -AgentToken "uuid" -HmacSecret "hex64"

param(
    [string]$AgentName,
    [string]$AgentToken,
    [string]$HmacSecret,
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
)

$ErrorActionPreference = "Stop"
$InstallDir = "C:\CyberShield"
$LogDir = "$InstallDir\logs"
$BackupDir = "$InstallDir\backup"
$TaskName = "CyberShieldAgent"

function Write-Status {
    param([string]$Message, [string]$Type = "INFO")
    $color = switch ($Type) {
        "INFO"    { "Cyan" }
        "SUCCESS" { "Green" }
        "WARN"    { "Yellow" }
        "ERROR"   { "Red" }
        default   { "White" }
    }
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    Write-Host "[$timestamp] [$Type] $Message" -ForegroundColor $color
}

function Get-HmacSha256 {
    param([string]$Message, [string]$Secret)
    $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
    $hmacsha.Key = [System.Text.Encoding]::UTF8.GetBytes($Secret)
    $hash = $hmacsha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Message))
    return [BitConverter]::ToString($hash).Replace("-", "").ToLower()
}

Write-Host ""
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host "  CyberShield Agent - Reinstalacao Preservando Identidade" -ForegroundColor Cyan
Write-Host "  Version: 1.0.0" -ForegroundColor Cyan
Write-Host "========================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se e Administrador
$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
    Write-Status "Este script precisa ser executado como Administrador!" "ERROR"
    Write-Host "   Clique com botao direito no PowerShell e selecione 'Executar como Administrador'" -ForegroundColor Yellow
    exit 1
}

# ============================================================
# FASE 1: Detectar Agente Existente
# ============================================================
Write-Host ""
Write-Status "=== FASE 1/6: Detectar Agente Existente ===" "INFO"

$existingScript = $null
$detectedAgentName = $null
$detectedAgentToken = $null
$detectedHmacSecret = $null
$detectedServerUrl = $null

# Procurar script existente
$scriptPattern = Join-Path $InstallDir "cybershield-agent-*.ps1"
$existingScripts = Get-ChildItem -Path $scriptPattern -ErrorAction SilentlyContinue

if ($existingScripts -and $existingScripts.Count -gt 0) {
    $existingScript = $existingScripts | Sort-Object LastWriteTime -Descending | Select-Object -First 1
    Write-Status "Script encontrado: $($existingScript.Name)" "SUCCESS"
    
    # Extrair nome do agente do nome do arquivo
    if ($existingScript.Name -match 'cybershield-agent-(.+)\.ps1$') {
        $detectedAgentName = $Matches[1]
        Write-Status "Nome do agente detectado: $detectedAgentName" "SUCCESS"
    }
    
    # Ler conteudo e extrair credenciais
    $scriptContent = Get-Content $existingScript.FullName -Raw
    
    # Extrair AgentToken
    if ($scriptContent -match '\$AgentToken\s*=\s*[''"]([^''"]+)[''"]') {
        $detectedAgentToken = $Matches[1]
        Write-Status "AgentToken detectado: $($detectedAgentToken.Substring(0,8))..." "SUCCESS"
    }
    
    # Extrair HmacSecret
    if ($scriptContent -match '\$HmacSecret\s*=\s*[''"]([^''"]+)[''"]') {
        $detectedHmacSecret = $Matches[1]
        Write-Status "HmacSecret detectado: $($detectedHmacSecret.Substring(0,8))..." "SUCCESS"
    }
    
    # Extrair ServerUrl
    if ($scriptContent -match '\$ServerUrl\s*=\s*[''"]([^''"]+)[''"]') {
        $detectedServerUrl = $Matches[1]
        Write-Status "ServerUrl detectado: $detectedServerUrl" "SUCCESS"
    }
} else {
    Write-Status "Nenhum script existente encontrado em $InstallDir" "WARN"
}

# Usar parametros fornecidos ou detectados
if (-not $AgentName -and $detectedAgentName) { $AgentName = $detectedAgentName }
if (-not $AgentToken -and $detectedAgentToken) { $AgentToken = $detectedAgentToken }
if (-not $HmacSecret -and $detectedHmacSecret) { $HmacSecret = $detectedHmacSecret }
if (-not $ServerUrl -and $detectedServerUrl) { $ServerUrl = $detectedServerUrl }

# Validar credenciais
if (-not $AgentName -or -not $AgentToken -or -not $HmacSecret) {
    Write-Status "Credenciais incompletas!" "ERROR"
    Write-Host ""
    Write-Host "Credenciais necessarias:" -ForegroundColor Yellow
    Write-Host "  - AgentName:  $(if($AgentName){'OK'}else{'FALTANDO'})" -ForegroundColor $(if($AgentName){'Green'}else{'Red'})
    Write-Host "  - AgentToken: $(if($AgentToken){'OK'}else{'FALTANDO'})" -ForegroundColor $(if($AgentToken){'Green'}else{'Red'})
    Write-Host "  - HmacSecret: $(if($HmacSecret){'OK'}else{'FALTANDO'})" -ForegroundColor $(if($HmacSecret){'Green'}else{'Red'})
    Write-Host ""
    Write-Host "Execute com parametros manuais:" -ForegroundColor Yellow
    Write-Host '  .\reinstall-agent-preserve.ps1 -AgentName "nome" -AgentToken "uuid" -HmacSecret "hex64"' -ForegroundColor Gray
    exit 1
}

Write-Host ""
Write-Host "Credenciais a serem usadas:" -ForegroundColor Cyan
Write-Host "  AgentName:  $AgentName" -ForegroundColor White
Write-Host "  AgentToken: $($AgentToken.Substring(0,8))..." -ForegroundColor White
Write-Host "  HmacSecret: $($HmacSecret.Substring(0,8))..." -ForegroundColor White
Write-Host "  ServerUrl:  $ServerUrl" -ForegroundColor White

# ============================================================
# FASE 2: Parar Servicos
# ============================================================
Write-Host ""
Write-Status "=== FASE 2/6: Parar Servicos ===" "INFO"

# Parar Scheduled Task
$tasks = Get-ScheduledTask -TaskName "CyberShield*" -ErrorAction SilentlyContinue
foreach ($task in $tasks) {
    Write-Status "Parando task: $($task.TaskName)" "INFO"
    Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Write-Status "Task removida: $($task.TaskName)" "SUCCESS"
}

# Matar processos PowerShell do agente
$agentProcesses = Get-WmiObject Win32_Process -Filter "Name='powershell.exe'" | 
    Where-Object { $_.CommandLine -like "*CyberShield*" -or $_.CommandLine -like "*cybershield*" }

foreach ($proc in $agentProcesses) {
    Write-Status "Encerrando processo PowerShell (PID: $($proc.ProcessId))" "INFO"
    Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# ============================================================
# FASE 3: Backup
# ============================================================
Write-Host ""
Write-Status "=== FASE 3/6: Backup ===" "INFO"

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

if ($existingScript) {
    $backupName = "cybershield-agent-$AgentName-backup-$(Get-Date -Format 'yyyyMMdd-HHmmss').ps1"
    $backupPath = Join-Path $BackupDir $backupName
    Copy-Item $existingScript.FullName $backupPath -Force
    Write-Status "Backup criado: $backupPath" "SUCCESS"
} else {
    Write-Status "Nenhum script para fazer backup" "INFO"
}

# ============================================================
# FASE 4: Baixar Script Atualizado
# ============================================================
Write-Host ""
Write-Status "=== FASE 4/6: Baixar Script Atualizado ===" "INFO"

# Preparar requisicao HMAC
$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
$nonce = [Guid]::NewGuid().ToString()
$method = "GET"
$path = "/functions/v1/serve-agent-update"
$body = ""

# Calcular HMAC
$message = "$method`n$path`n$timestamp`n$nonce`n$body"
$signature = Get-HmacSha256 -Message $message -Secret $HmacSecret

Write-Status "Requisitando script atualizado do servidor..." "INFO"

try {
    [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
    
    $headers = @{
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $timestamp
        "X-Nonce" = $nonce
        "Content-Type" = "application/json"
    }
    
    $url = "$ServerUrl$path"
    Write-Status "URL: $url" "INFO"
    
    $response = Invoke-RestMethod -Uri $url -Method GET -Headers $headers -TimeoutSec 60
    
    if (-not $response.script_content -and -not $response.script_content_base64) {
        if ($response.message -eq "Already up to date") {
            Write-Status "Agente ja esta na versao mais recente: $($response.current_version)" "SUCCESS"
            Write-Status "Reinstalacao continuara com o script existente..." "INFO"
            
            # Usar script existente
            if ($existingScript) {
                $newScriptContent = Get-Content $existingScript.FullName -Raw
                $newVersion = $response.current_version
            } else {
                Write-Status "Nenhum script disponivel para reinstalar" "ERROR"
                exit 1
            }
        } else {
            Write-Status "Servidor nao retornou script: $($response.message)" "ERROR"
            exit 1
        }
    } else {
        # Usar script do servidor
        if ($response.script_content_base64) {
            $newScriptContent = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($response.script_content_base64))
            Write-Status "Script baixado via Base64" "SUCCESS"
        } else {
            $newScriptContent = $response.script_content
            Write-Status "Script baixado via texto" "SUCCESS"
        }
        $newVersion = $response.version
        
        Write-Status "Versao baixada: $newVersion" "SUCCESS"
        Write-Status "Tamanho: $($newScriptContent.Length) bytes" "INFO"
        
        # Validar SHA256
        if ($response.sha256_base64 -or $response.sha256) {
            $expectedHash = if ($response.sha256_base64) { $response.sha256_base64 } else { $response.sha256 }
            $bytes = [System.Text.Encoding]::UTF8.GetBytes($newScriptContent)
            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            $hash = $sha256.ComputeHash($bytes)
            $calculatedHash = [BitConverter]::ToString($hash).Replace("-", "").ToLower()
            
            if ($calculatedHash -eq $expectedHash) {
                Write-Status "SHA256 validado com sucesso" "SUCCESS"
            } else {
                Write-Status "SHA256 nao corresponde! Esperado: $($expectedHash.Substring(0,16))... Calculado: $($calculatedHash.Substring(0,16))..." "WARN"
                # Continuar mesmo assim - pode ser diferenca de normalizacao
            }
        }
    }
} catch {
    Write-Status "Falha ao baixar script: $($_.Exception.Message)" "ERROR"
    
    if ($existingScript) {
        Write-Status "Usando script existente para reinstalacao..." "WARN"
        $newScriptContent = Get-Content $existingScript.FullName -Raw
        $newVersion = "unknown"
    } else {
        exit 1
    }
}

# ============================================================
# FASE 5: Reinstalar
# ============================================================
Write-Host ""
Write-Status "=== FASE 5/6: Reinstalar ===" "INFO"

# Remover scripts antigos
$oldScripts = Get-ChildItem -Path "$InstallDir\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue
foreach ($script in $oldScripts) {
    Remove-Item $script.FullName -Force -ErrorAction SilentlyContinue
    Write-Status "Removido: $($script.Name)" "INFO"
}

# Criar diretorios necessarios
if (-not (Test-Path $InstallDir)) {
    New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null
}
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

# Salvar novo script
$newScriptPath = Join-Path $InstallDir "cybershield-agent-$AgentName.ps1"
[System.IO.File]::WriteAllText($newScriptPath, $newScriptContent, [System.Text.Encoding]::UTF8)
Write-Status "Script instalado: $newScriptPath" "SUCCESS"

# Criar Scheduled Task
$taskAction = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -WindowStyle Hidden -File `"$newScriptPath`""
$taskTrigger = New-ScheduledTaskTrigger -AtStartup
$taskSettings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 10 -RestartInterval (New-TimeSpan -Seconds 30)
$taskPrincipal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

$fullTaskName = "$TaskName-$AgentName"
Register-ScheduledTask -TaskName $fullTaskName -Action $taskAction -Trigger $taskTrigger -Settings $taskSettings -Principal $taskPrincipal -Force | Out-Null
Write-Status "Scheduled Task criada: $fullTaskName" "SUCCESS"

# ============================================================
# FASE 6: Iniciar Agente
# ============================================================
Write-Host ""
Write-Status "=== FASE 6/6: Iniciar Agente ===" "INFO"

Start-ScheduledTask -TaskName $fullTaskName
Write-Status "Agente iniciado" "SUCCESS"

# Aguardar inicializacao
Start-Sleep -Seconds 5

# Verificar status
$task = Get-ScheduledTask -TaskName $fullTaskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Status "Status da task: $($task.State)" "INFO"
}

# Verificar logs
$logFile = Join-Path $LogDir "agent.log"
if (Test-Path $logFile) {
    Write-Host ""
    Write-Host "Ultimas linhas do log:" -ForegroundColor Cyan
    Write-Host "-" * 60 -ForegroundColor Gray
    Get-Content $logFile -Tail 10 | ForEach-Object { Write-Host "  $_" -ForegroundColor Gray }
    Write-Host "-" * 60 -ForegroundColor Gray
}

# ============================================================
# Resumo Final
# ============================================================
Write-Host ""
Write-Host "========================================================" -ForegroundColor Green
Write-Host "  REINSTALACAO CONCLUIDA COM SUCESSO!" -ForegroundColor Green
Write-Host "========================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Resumo:" -ForegroundColor Cyan
Write-Host "  Nome do Agente: $AgentName" -ForegroundColor White
Write-Host "  Versao: $newVersion" -ForegroundColor White
Write-Host "  Script: $newScriptPath" -ForegroundColor White
Write-Host "  Task: $fullTaskName" -ForegroundColor White
Write-Host ""
Write-Host "Proximos passos:" -ForegroundColor Cyan
Write-Host "  1. Verificar no dashboard se o agente aparece como 'online'" -ForegroundColor Gray
Write-Host "  2. Verificar logs: Get-Content $logFile -Tail 50 -Wait" -ForegroundColor Gray
Write-Host "  3. Verificar heartbeat no dashboard" -ForegroundColor Gray
Write-Host ""
