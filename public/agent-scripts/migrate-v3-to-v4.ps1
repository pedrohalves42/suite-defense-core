<#
    CyberShield Agent Migration Script v3 ? v4
    
    Este script realiza a migracao segura de agentes v3.x para v4.x
    Preserva configuracoes, logs e estado durante a migracao
    
    Uso:
    powershell.exe -ExecutionPolicy Bypass -File .\migrate-v3-to-v4.ps1 `
        -ServerUrl "https://seu-projeto.supabase.co" `
        -AgentToken "AGENT_TOKEN_AQUI" `
        -HmacSecret "64_HEX_CHARS_AQUI"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,

    [Parameter(Mandatory = $true)]
    [string]$AgentToken,

    [Parameter(Mandatory = $true)]
    [string]$HmacSecret,

    [Parameter(Mandatory = $false)]
    [switch]$DryRun = $false,

    [Parameter(Mandatory = $false)]
    [switch]$Force = $false
)

$ErrorActionPreference = "Stop"
$MigrationVersion = "1.0.0"
$BaseDir = "C:\CyberShield"
$BackupDir = "$BaseDir\backup-v3"
$LogFile = "$BaseDir\logs\migration-v3-to-v4.log"

# ============================================
#  FUNCOES DE LOG
# ============================================
function Write-MigrationLog {
    param([string]$Message, [string]$Level = "INFO")
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    Write-Host $logEntry -ForegroundColor $(
        switch ($Level) {
            "ERROR" { "Red" }
            "WARN" { "Yellow" }
            "SUCCESS" { "Green" }
            default { "White" }
        }
    )
    
    if (Test-Path (Split-Path $LogFile -Parent)) {
        $logEntry | Out-File -FilePath $LogFile -Append -Encoding UTF8
    }
}

# ============================================
#  PRE-FLIGHT CHECKS
# ============================================
function Test-PreFlightChecks {
    Write-MigrationLog "Iniciando verificacoes de pre-voo..." "INFO"
    
    # Check 1: Admin privileges
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        Write-MigrationLog "ERRO: Este script requer privilegios de administrador" "ERROR"
        return $false
    }
    Write-MigrationLog "? Privilegios de administrador confirmados" "SUCCESS"
    
    # Check 2: CyberShield directory exists
    if (-not (Test-Path $BaseDir)) {
        Write-MigrationLog "ERRO: Diretorio CyberShield nao encontrado em $BaseDir" "ERROR"
        return $false
    }
    Write-MigrationLog "? Diretorio CyberShield encontrado" "SUCCESS"
    
    # Check 3: Detect current version
    $currentScript = Get-ChildItem "$BaseDir\cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Select-Object -First 1
    if (-not $currentScript) {
        Write-MigrationLog "WARN: Script do agente nao encontrado. Instalacao limpa sera realizada." "WARN"
        $script:IsCleanInstall = $true
    } else {
        $script:CurrentScriptPath = $currentScript.FullName
        $script:IsCleanInstall = $false
        
        # Extract version from script
        $content = Get-Content $currentScript.FullName -Raw
        if ($content -match 'AgentVersion\s*=\s*"([^"]+)"') {
            $script:CurrentVersion = $matches[1]
            Write-MigrationLog "? Versao atual detectada: $($script:CurrentVersion)" "SUCCESS"
            
            if ($script:CurrentVersion -like "v4.*") {
                if (-not $Force) {
                    Write-MigrationLog "Agente ja esta na versao v4.x. Use -Force para forcar reinstalacao." "WARN"
                    return $false
                }
            }
        }
    }
    
    # Check 4: Disk space (need at least 100MB)
    $drive = (Get-Item $BaseDir).PSDrive
    $freeSpace = (Get-PSDrive $drive.Name).Free / 1MB
    if ($freeSpace -lt 100) {
        Write-MigrationLog "ERRO: Espaco em disco insuficiente. Necessario: 100MB, Disponivel: ${freeSpace}MB" "ERROR"
        return $false
    }
    Write-MigrationLog "? Espaco em disco suficiente: ${freeSpace}MB disponiveis" "SUCCESS"
    
    # Check 5: Network connectivity
    try {
        $testUrl = "$ServerUrl/functions/v1/heartbeat"
        $null = Invoke-WebRequest -Uri $testUrl -Method HEAD -TimeoutSec 10 -UseBasicParsing -ErrorAction Stop
        Write-MigrationLog "? Conectividade com servidor confirmada" "SUCCESS"
    } catch {
        Write-MigrationLog "WARN: Nao foi possivel verificar conectividade. Migracao pode falhar." "WARN"
    }
    
    return $true
}

# ============================================
#  BACKUP
# ============================================
function Backup-CurrentInstallation {
    Write-MigrationLog "Criando backup da instalacao atual..." "INFO"
    
    # Create backup directory with timestamp
    $timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupPath = "$BackupDir\$timestamp"
    
    if (Test-Path $backupPath) {
        Remove-Item $backupPath -Recurse -Force
    }
    New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
    
    # Backup files
    $itemsToBackup = @(
        @{ Source = "$BaseDir\logs"; Dest = "$backupPath\logs" },
        @{ Source = "$BaseDir\evidence"; Dest = "$backupPath\evidence" },
        @{ Source = "$BaseDir\blocked_websites.json"; Dest = "$backupPath\blocked_websites.json" },
        @{ Source = "$BaseDir\*.ps1"; Dest = "$backupPath\" }
    )
    
    foreach ($item in $itemsToBackup) {
        if (Test-Path $item.Source) {
            try {
                Copy-Item -Path $item.Source -Destination $item.Dest -Recurse -Force -ErrorAction Stop
                Write-MigrationLog "  Backup: $($item.Source)" "INFO"
            } catch {
                Write-MigrationLog "  WARN: Falha ao fazer backup de $($item.Source): $_" "WARN"
            }
        }
    }
    
    # Save current config
    $configBackup = @{
        BackupDate = (Get-Date).ToString("o")
        CurrentVersion = $script:CurrentVersion
        ServerUrl = $ServerUrl
        AgentName = $env:COMPUTERNAME.ToLower()
        MigrationScript = $MigrationVersion
    }
    $configBackup | ConvertTo-Json | Out-File "$backupPath\migration-config.json" -Encoding UTF8
    
    Write-MigrationLog "? Backup criado em: $backupPath" "SUCCESS"
    $script:BackupPath = $backupPath
    return $true
}

# ============================================
#  STOP SERVICES
# ============================================
function Stop-AgentServices {
    Write-MigrationLog "Parando servicos do agente..." "INFO"
    
    # Stop Scheduled Task
    $taskName = "CyberShield Agent"
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        if ($task.State -eq "Running") {
            Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
            Start-Sleep -Seconds 2
            Write-MigrationLog "  Scheduled Task parada" "INFO"
        }
        Disable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    }
    
    # Stop DNS Filter Service
    $dnsService = Get-Service -Name "CyberShieldDNS" -ErrorAction SilentlyContinue
    if ($dnsService -and $dnsService.Status -eq "Running") {
        Stop-Service -Name "CyberShieldDNS" -Force -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-MigrationLog "  DNS Filter service parado" "INFO"
    }
    
    # Kill any remaining PowerShell processes running agent
    $agentProcesses = Get-WmiObject Win32_Process | Where-Object {
        $_.CommandLine -like "*cybershield-agent*" -and $_.ProcessId -ne $PID
    }
    foreach ($proc in $agentProcesses) {
        try {
            Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
            Write-MigrationLog "  Processo $($proc.ProcessId) encerrado" "INFO"
        } catch { }
    }
    
    Write-MigrationLog "? Servicos parados" "SUCCESS"
    return $true
}

# ============================================
#  DOWNLOAD NEW VERSION
# ============================================
function Get-NewAgentVersion {
    Write-MigrationLog "Baixando nova versao do agente v4..." "INFO"
    
    try {
        $downloadUrl = "$ServerUrl/functions/v1/serve-agent-update"
        $headers = @{
            "X-Agent-Token" = $AgentToken
            "Content-Type" = "application/json"
        }
        $body = @{
            current_version = $script:CurrentVersion
            platform = "windows"
            force_update = $true
        } | ConvertTo-Json
        
        $response = Invoke-RestMethod -Uri $downloadUrl -Method POST -Headers $headers -Body $body -TimeoutSec 120
        
        if ($response.update_available -and $response.script_base64) {
            $scriptBytes = [System.Convert]::FromBase64String($response.script_base64)
            $newScriptPath = "$BaseDir\cybershield-agent-v4.ps1"
            
            [System.IO.File]::WriteAllBytes($newScriptPath, $scriptBytes)
            
            # Validate SHA256
            $fileHash = (Get-FileHash -Path $newScriptPath -Algorithm SHA256).Hash.ToLower()
            if ($response.sha256 -and $fileHash -ne $response.sha256.ToLower()) {
                Write-MigrationLog "ERRO: Hash SHA256 nao corresponde!" "ERROR"
                return $false
            }
            
            $script:NewScriptPath = $newScriptPath
            $script:NewVersion = $response.version
            Write-MigrationLog "? Nova versao baixada: $($response.version)" "SUCCESS"
            return $true
        } else {
            Write-MigrationLog "WARN: Nenhuma atualizacao disponivel. Usando script local." "WARN"
            return $false
        }
    } catch {
        Write-MigrationLog "ERRO ao baixar nova versao: $_" "ERROR"
        return $false
    }
}

# ============================================
#  CREATE V4 DIRECTORIES
# ============================================
function Initialize-V4Directories {
    Write-MigrationLog "Inicializando estrutura de diretorios v4..." "INFO"
    
    $v4Dirs = @(
        "$BaseDir\logs",
        "$BaseDir\evidence",
        "$BaseDir\dns-filter",
        "$BaseDir\policies",
        "$BaseDir\temp"
    )
    
    foreach ($dir in $v4Dirs) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
            Write-MigrationLog "  Criado: $dir" "INFO"
        }
    }
    
    Write-MigrationLog "? Estrutura de diretorios v4 pronta" "SUCCESS"
    return $true
}

# ============================================
#  MIGRATE CONFIGURATIONS
# ============================================
function Migrate-Configurations {
    Write-MigrationLog "Migrando configuracoes..." "INFO"
    
    # Migrate blocked websites if exists
    $oldBlockedPath = "$BaseDir\blocked_websites.json"
    $newBlockedPath = "$BaseDir\policies\blocked_websites.json"
    
    if (Test-Path $oldBlockedPath) {
        Copy-Item $oldBlockedPath $newBlockedPath -Force
        Write-MigrationLog "  Migrado: blocked_websites.json" "INFO"
    }
    
    # Create initial state file for v4
    $initialState = @{
        migration_date = (Get-Date).ToString("o")
        previous_version = $script:CurrentVersion
        new_version = $script:NewVersion ?? "v4.0.1-DNS-POLICY"
        state = "BOOTSTRAP"
        last_heartbeat = $null
        last_job_execution = $null
        dns_filter_enabled = $false
        policy_synced = $false
    }
    $initialState | ConvertTo-Json | Out-File "$BaseDir\agent-state.json" -Encoding UTF8
    Write-MigrationLog "  Criado: agent-state.json" "INFO"
    
    Write-MigrationLog "? Configuracoes migradas" "SUCCESS"
    return $true
}

# ============================================
#  UPDATE SCHEDULED TASK
# ============================================
function Update-ScheduledTask {
    Write-MigrationLog "Atualizando Scheduled Task..." "INFO"
    
    $taskName = "CyberShield Agent"
    $agentScript = if ($script:NewScriptPath) { $script:NewScriptPath } else { "$BaseDir\cybershield-agent-v4.ps1" }
    $agentName = $env:COMPUTERNAME.ToLower()
    
    # Remove old task
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    
    # Create new task for v4
    $psPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $arguments = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File `"$agentScript`" -ServerUrl `"$ServerUrl`" -AgentToken `"$AgentToken`" -HmacSecret `"$HmacSecret`" -AgentName `"$agentName`""
    
    $action = New-ScheduledTaskAction -Execute $psPath -Argument $arguments
    
    # CRITICAL FIX: Triggers duplos para auto-recovery
    $triggers = @(
        (New-ScheduledTaskTrigger -AtStartup),
        (New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5))
    )
    
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 5 `
        -RestartInterval (New-TimeSpan -Minutes 1) `
        -ExecutionTimeLimit (New-TimeSpan -Days 365) `
        -MultipleInstances IgnoreNew
    
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    
    Register-ScheduledTask -TaskName $taskName -Action $action -Trigger $triggers -Settings $settings -Principal $principal -Force | Out-Null
    
    Write-MigrationLog "? Scheduled Task atualizada para v4" "SUCCESS"
    return $true
}

# ============================================
#  START NEW AGENT
# ============================================
function Start-NewAgent {
    Write-MigrationLog "Iniciando novo agente v4..." "INFO"
    
    $taskName = "CyberShield Agent"
    Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    
    Start-Sleep -Seconds 5
    
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task.State -eq "Running") {
        Write-MigrationLog "? Agente v4 iniciado com sucesso" "SUCCESS"
        return $true
    } else {
        Write-MigrationLog "WARN: Agente pode nao ter iniciado corretamente. Verifique os logs." "WARN"
        return $false
    }
}

# ============================================
#  REPORT MIGRATION
# ============================================
function Send-MigrationReport {
    param([bool]$Success, [string]$Error = "")
    
    Write-MigrationLog "Enviando relatorio de migracao..." "INFO"
    
    try {
        $reportUrl = "$ServerUrl/functions/v1/track-installation-event"
        $headers = @{
            "Content-Type" = "application/json"
            "X-Agent-Token" = $AgentToken
        }
        $body = @{
            event_type = "migration_v3_to_v4"
            platform = "windows"
            agent_name = $env:COMPUTERNAME.ToLower()
            details = @{
                success = $Success
                previous_version = $script:CurrentVersion
                new_version = $script:NewVersion ?? "v4.0.1"
                error = $Error
                backup_path = $script:BackupPath
                migration_script_version = $MigrationVersion
            }
        } | ConvertTo-Json -Depth 5
        
        $null = Invoke-RestMethod -Uri $reportUrl -Method POST -Headers $headers -Body $body -TimeoutSec 30
        Write-MigrationLog "? Relatorio de migracao enviado" "SUCCESS"
    } catch {
        Write-MigrationLog "WARN: Falha ao enviar relatorio: $_" "WARN"
    }
}

# ============================================
#  ROLLBACK
# ============================================
function Invoke-Rollback {
    Write-MigrationLog "Iniciando rollback..." "ERROR"
    
    if ($script:BackupPath -and (Test-Path $script:BackupPath)) {
        # Restore backed up files
        $backupScripts = Get-ChildItem "$($script:BackupPath)\*.ps1" -ErrorAction SilentlyContinue
        foreach ($script in $backupScripts) {
            Copy-Item $script.FullName "$BaseDir\" -Force
        }
        
        # Restore configs
        if (Test-Path "$($script:BackupPath)\blocked_websites.json") {
            Copy-Item "$($script:BackupPath)\blocked_websites.json" "$BaseDir\" -Force
        }
        
        Write-MigrationLog "Arquivos restaurados do backup" "INFO"
    }
    
    # Re-enable old task
    $taskName = "CyberShield Agent"
    Enable-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    
    Write-MigrationLog "Rollback concluido. Agente v3 restaurado." "WARN"
}

# ============================================
#  MAIN EXECUTION
# ============================================
function Start-Migration {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host "  CyberShield Migration v3 ? v4" -ForegroundColor Cyan
    Write-Host "  Version: $MigrationVersion" -ForegroundColor Cyan
    Write-Host "========================================" -ForegroundColor Cyan
    Write-Host ""
    
    if ($DryRun) {
        Write-MigrationLog "MODO DRY-RUN: Nenhuma alteracao sera feita" "WARN"
    }
    
    try {
        # Step 1: Pre-flight checks
        if (-not (Test-PreFlightChecks)) {
            throw "Verificacoes de pre-voo falharam"
        }
        
        if ($DryRun) {
            Write-MigrationLog "DRY-RUN: Migracao seria executada com sucesso" "SUCCESS"
            return
        }
        
        # Step 2: Backup
        if (-not (Backup-CurrentInstallation)) {
            throw "Falha ao criar backup"
        }
        
        # Step 3: Stop services
        if (-not (Stop-AgentServices)) {
            throw "Falha ao parar servicos"
        }
        
        # Step 4: Download new version
        $downloaded = Get-NewAgentVersion
        if (-not $downloaded) {
            Write-MigrationLog "Usando script local para instalacao" "WARN"
        }
        
        # Step 5: Initialize directories
        if (-not (Initialize-V4Directories)) {
            throw "Falha ao inicializar diretorios"
        }
        
        # Step 6: Migrate configurations
        if (-not (Migrate-Configurations)) {
            throw "Falha ao migrar configuracoes"
        }
        
        # Step 7: Update Scheduled Task
        if (-not (Update-ScheduledTask)) {
            throw "Falha ao atualizar Scheduled Task"
        }
        
        # Step 8: Start new agent
        if (-not (Start-NewAgent)) {
            Write-MigrationLog "WARN: Agente pode precisar de inicio manual" "WARN"
        }
        
        # Step 9: Report success
        Send-MigrationReport -Success $true
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Green
        Write-Host "  MIGRACAO CONCLUIDA COM SUCESSO!" -ForegroundColor Green
        Write-Host "========================================" -ForegroundColor Green
        Write-Host ""
        Write-Host "Versao anterior: $($script:CurrentVersion)" -ForegroundColor White
        Write-Host "Nova versao: $($script:NewVersion ?? 'v4.0.1')" -ForegroundColor White
        Write-Host "Backup em: $($script:BackupPath)" -ForegroundColor White
        Write-Host ""
        
    } catch {
        $errorMsg = $_.Exception.Message
        Write-MigrationLog "ERRO CRITICO: $errorMsg" "ERROR"
        
        Invoke-Rollback
        Send-MigrationReport -Success $false -Error $errorMsg
        
        Write-Host ""
        Write-Host "========================================" -ForegroundColor Red
        Write-Host "  MIGRACAO FALHOU - ROLLBACK EXECUTADO" -ForegroundColor Red
        Write-Host "========================================" -ForegroundColor Red
        Write-Host ""
        Write-Host "Erro: $errorMsg" -ForegroundColor Red
        Write-Host ""
        
        exit 1
    }
}

# Run migration
Start-Migration
