<#
    CyberShield Enterprise Installer v4.0
    
    Instalador empresarial com:
    - Suporte a GPO/SCCM/Intune
    - Instalacao silenciosa
    - Configuracao via arquivo JSON
    - DNS Filter integrado
    - Logging estruturado para auditorias
    
    Uso via linha de comando:
    powershell.exe -ExecutionPolicy Bypass -File .\install-enterprise-v4.ps1 `
        -EnrollmentKey "EK-XXXXX" `
        -ServerUrl "https://projeto.supabase.co"
    
    Uso via arquivo de configuracao:
    powershell.exe -ExecutionPolicy Bypass -File .\install-enterprise-v4.ps1 `
        -ConfigFile "C:\Deploy\cybershield-config.json"
#>

param(
    [Parameter(Mandatory = $false)]
    [string]$EnrollmentKey,

    [Parameter(Mandatory = $false)]
    [string]$ServerUrl,

    [Parameter(Mandatory = $false)]
    [string]$ConfigFile,

    [Parameter(Mandatory = $false)]
    [string]$AgentName = $env:COMPUTERNAME.ToLower(),

    [Parameter(Mandatory = $false)]
    [switch]$Silent = $false,

    [Parameter(Mandatory = $false)]
    [switch]$SkipDNSFilter = $false,

    [Parameter(Mandatory = $false)]
    [switch]$Uninstall = $false,

    [Parameter(Mandatory = $false)]
    [string]$LogPath = "C:\CyberShield\logs\enterprise-install.log"
)

$ErrorActionPreference = "Stop"
$InstallerVersion = "4.0.0-ENTERPRISE"
$BaseDir = "C:\CyberShield"
$ExitCode = 0

# ============================================
#  LOGGING ENTERPRISE
# ============================================
function Write-InstallLog {
    param(
        [string]$Message,
        [string]$Level = "INFO",
        [string]$Component = "Installer"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss.fff"
    $logEntry = @{
        timestamp = $timestamp
        level = $Level
        component = $Component
        message = $Message
        computer = $env:COMPUTERNAME
        user = $env:USERNAME
    }
    
    # Console output (if not silent)
    if (-not $Silent) {
        $color = switch ($Level) {
            "ERROR" { "Red" }
            "WARN" { "Yellow" }
            "SUCCESS" { "Green" }
            default { "White" }
        }
        Write-Host "[$timestamp] [$Level] $Message" -ForegroundColor $color
    }
    
    # File logging
    $logDir = Split-Path $LogPath -Parent
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    
    $logLine = "[$timestamp] [$Level] [$Component] $Message"
    $logLine | Out-File -FilePath $LogPath -Append -Encoding UTF8
    
    # Windows Event Log for enterprise monitoring
    if ($Level -in @("ERROR", "WARN", "SUCCESS")) {
        try {
            $eventId = switch ($Level) {
                "ERROR" { 1001 }
                "WARN" { 1002 }
                "SUCCESS" { 1000 }
                default { 1003 }
            }
            $entryType = switch ($Level) {
                "ERROR" { "Error" }
                "WARN" { "Warning" }
                default { "Information" }
            }
            
            # Create event source if not exists
            if (-not [System.Diagnostics.EventLog]::SourceExists("CyberShield")) {
                New-EventLog -LogName Application -Source "CyberShield" -ErrorAction SilentlyContinue
            }
            
            Write-EventLog -LogName Application -Source "CyberShield" -EventId $eventId -EntryType $entryType -Message $Message -ErrorAction SilentlyContinue
        } catch { }
    }
}

# ============================================
#  LOAD CONFIGURATION
# ============================================
function Get-InstallConfiguration {
    Write-InstallLog "Carregando configuracao..." "INFO" "Config"
    
    $config = @{
        ServerUrl = $ServerUrl
        EnrollmentKey = $EnrollmentKey
        AgentName = $AgentName
        SkipDNSFilter = $SkipDNSFilter
        InstallPath = $BaseDir
        Version = $InstallerVersion
    }
    
    # Load from config file if provided
    if ($ConfigFile -and (Test-Path $ConfigFile)) {
        try {
            $fileConfig = Get-Content $ConfigFile -Raw | ConvertFrom-Json
            
            if ($fileConfig.ServerUrl) { $config.ServerUrl = $fileConfig.ServerUrl }
            if ($fileConfig.EnrollmentKey) { $config.EnrollmentKey = $fileConfig.EnrollmentKey }
            if ($fileConfig.AgentName) { $config.AgentName = $fileConfig.AgentName }
            if ($null -ne $fileConfig.SkipDNSFilter) { $config.SkipDNSFilter = $fileConfig.SkipDNSFilter }
            if ($fileConfig.InstallPath) { $config.InstallPath = $fileConfig.InstallPath }
            
            Write-InstallLog "Configuracao carregada de: $ConfigFile" "SUCCESS" "Config"
        } catch {
            Write-InstallLog "Erro ao carregar arquivo de configuracao: $_" "ERROR" "Config"
            throw
        }
    }
    
    # Validate required fields
    if (-not $config.ServerUrl) {
        throw "ServerUrl e obrigatorio. Forneca via parametro ou arquivo de configuracao."
    }
    if (-not $config.EnrollmentKey) {
        throw "EnrollmentKey e obrigatorio. Forneca via parametro ou arquivo de configuracao."
    }
    
    $script:Config = $config
    return $config
}

# ============================================
#  PRE-REQUISITES CHECK
# ============================================
function Test-Prerequisites {
    Write-InstallLog "Verificando pre-requisitos..." "INFO" "Prerequisites"
    
    $issues = @()
    
    # Check 1: Admin privileges
    $isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
    if (-not $isAdmin) {
        $issues += "Privilegios de administrador sao necessarios"
    }
    
    # Check 2: PowerShell version
    if ($PSVersionTable.PSVersion.Major -lt 5) {
        $issues += "PowerShell 5.0 ou superior e necessario (atual: $($PSVersionTable.PSVersion))"
    }
    
    # Check 3: .NET Framework
    $dotNetVersion = (Get-ItemProperty "HKLM:\SOFTWARE\Microsoft\NET Framework Setup\NDP\v4\Full" -ErrorAction SilentlyContinue).Release
    if ($dotNetVersion -lt 394802) {
        $issues += ".NET Framework 4.6.2 ou superior e necessario"
    }
    
    # Check 4: Disk space (500MB minimum)
    $drive = if ($script:Config.InstallPath) { 
        (Get-Item $script:Config.InstallPath -ErrorAction SilentlyContinue).PSDrive.Name 
    } else { "C" }
    $freeSpace = (Get-PSDrive $drive -ErrorAction SilentlyContinue).Free / 1MB
    if ($freeSpace -lt 500) {
        $issues += "Espaco em disco insuficiente (minimo: 500MB, disponivel: ${freeSpace}MB)"
    }
    
    # Check 5: Network connectivity
    try {
        $testResult = Test-NetConnection -ComputerName "supabase.co" -Port 443 -WarningAction SilentlyContinue
        if (-not $testResult.TcpTestSucceeded) {
            $issues += "Conectividade com internet nao disponivel na porta 443"
        }
    } catch {
        Write-InstallLog "Aviso: Nao foi possivel verificar conectividade de rede" "WARN" "Prerequisites"
    }
    
    # Check 6: Antivirus exclusions warning
    $avProducts = Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName "AntivirusProduct" -ErrorAction SilentlyContinue
    if ($avProducts) {
        $avNames = ($avProducts | Select-Object -ExpandProperty displayName) -join ", "
        Write-InstallLog "Antivirus detectado: $avNames. Considere adicionar exclusoes para $BaseDir" "WARN" "Prerequisites"
    }
    
    if ($issues.Count -gt 0) {
        foreach ($issue in $issues) {
            Write-InstallLog "FALHA: $issue" "ERROR" "Prerequisites"
        }
        throw "Verificacao de pre-requisitos falhou"
    }
    
    Write-InstallLog "? Todos os pre-requisitos atendidos" "SUCCESS" "Prerequisites"
    return $true
}

# ============================================
#  ENROLLMENT
# ============================================
function Invoke-Enrollment {
    Write-InstallLog "Iniciando enrollment do agente..." "INFO" "Enrollment"
    
    $enrollUrl = "$($script:Config.ServerUrl)/functions/v1/enroll-agent"
    
    $headers = @{
        "Content-Type" = "application/json"
        "X-Enrollment-Key" = $script:Config.EnrollmentKey
    }
    
    $body = @{
        agent_name = $script:Config.AgentName
        hostname = $env:COMPUTERNAME
        os_type = "windows"
        os_version = (Get-CimInstance Win32_OperatingSystem).Caption
        installer_version = $InstallerVersion
        requested_features = @{
            dns_filter = (-not $script:Config.SkipDNSFilter)
            policy_enforcement = $true
            evidence_collection = $true
        }
    } | ConvertTo-Json -Depth 5
    
    try {
        $response = Invoke-RestMethod -Uri $enrollUrl -Method POST -Headers $headers -Body $body -TimeoutSec 60
        
        if ($response.agent_id -and $response.token -and $response.hmac_secret) {
            $script:AgentCredentials = @{
                AgentId = $response.agent_id
                Token = $response.token
                HmacSecret = $response.hmac_secret
                TenantId = $response.tenant_id
            }
            
            Write-InstallLog "? Enrollment concluido. Agent ID: $($response.agent_id.Substring(0,8))..." "SUCCESS" "Enrollment"
            return $true
        } else {
            throw "Resposta de enrollment invalida"
        }
    } catch {
        $errorMsg = if ($_.Exception.Response) {
            try {
                $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
                $reader.ReadToEnd()
            } catch { $_.Exception.Message }
        } else { $_.Exception.Message }
        
        Write-InstallLog "Erro no enrollment: $errorMsg" "ERROR" "Enrollment"
        throw "Falha no enrollment: $errorMsg"
    }
}

# ============================================
#  INSTALL AGENT FILES
# ============================================
function Install-AgentFiles {
    Write-InstallLog "Instalando arquivos do agente..." "INFO" "Install"
    
    $installPath = $script:Config.InstallPath
    
    # Create directory structure
    $directories = @(
        $installPath,
        "$installPath\logs",
        "$installPath\evidence",
        "$installPath\dns-filter",
        "$installPath\policies",
        "$installPath\temp"
    )
    
    foreach ($dir in $directories) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }
    
    # Download agent script
    $downloadUrl = "$($script:Config.ServerUrl)/functions/v1/serve-installer"
    $headers = @{
        "X-Agent-Token" = $script:AgentCredentials.Token
        "X-Platform" = "windows"
        "X-Version" = "v4"
    }
    
    try {
        $scriptResponse = Invoke-WebRequest -Uri $downloadUrl -Method GET -Headers $headers -TimeoutSec 120
        $scriptContent = $scriptResponse.Content
        
        # Validate SHA256 if provided
        $expectedHash = $scriptResponse.Headers["X-SHA256"]
        if ($expectedHash) {
            $actualHash = [System.BitConverter]::ToString(
                [System.Security.Cryptography.SHA256]::Create().ComputeHash(
                    [System.Text.Encoding]::UTF8.GetBytes($scriptContent)
                )
            ).Replace("-", "").ToLower()
            
            if ($actualHash -ne $expectedHash.ToLower()) {
                throw "Verificacao de integridade falhou (SHA256 mismatch)"
            }
        }
        
        # Save agent script
        $agentScriptPath = "$installPath\cybershield-agent-$($script:Config.AgentName).ps1"
        $scriptContent | Out-File -FilePath $agentScriptPath -Encoding UTF8 -Force
        
        Write-InstallLog "? Script do agente instalado em: $agentScriptPath" "SUCCESS" "Install"
        $script:AgentScriptPath = $agentScriptPath
        
    } catch {
        Write-InstallLog "Erro ao baixar script do agente: $_" "ERROR" "Install"
        throw
    }
    
    # Save credentials securely (encrypted with DPAPI)
    $credentialsPath = "$installPath\agent-credentials.enc"
    $credentialsJson = $script:AgentCredentials | ConvertTo-Json
    $encryptedCreds = [System.Security.Cryptography.ProtectedData]::Protect(
        [System.Text.Encoding]::UTF8.GetBytes($credentialsJson),
        $null,
        [System.Security.Cryptography.DataProtectionScope]::LocalMachine
    )
    [System.IO.File]::WriteAllBytes($credentialsPath, $encryptedCreds)
    
    Write-InstallLog "? Credenciais armazenadas com seguranca" "SUCCESS" "Install"
    
    return $true
}

# ============================================
#  CREATE SCHEDULED TASK
# ============================================
function Install-ScheduledTask {
    Write-InstallLog "Criando Scheduled Task..." "INFO" "Task"
    
    $taskName = "CyberShield Agent"
    $installPath = $script:Config.InstallPath
    
    # Remove existing task if present
    Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
    
    # Build arguments
    $psPath = "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe"
    $arguments = @(
        "-ExecutionPolicy Bypass",
        "-NoProfile",
        "-WindowStyle Hidden",
        "-File `"$($script:AgentScriptPath)`"",
        "-ServerUrl `"$($script:Config.ServerUrl)`"",
        "-AgentToken `"$($script:AgentCredentials.Token)`"",
        "-HmacSecret `"$($script:AgentCredentials.HmacSecret)`"",
        "-AgentName `"$($script:Config.AgentName)`""
    ) -join " "
    
    # Create task
    $action = New-ScheduledTaskAction -Execute $psPath -Argument $arguments
    
    # FIX: Usar RepetitionDuration explicito para evitar erro Duration:P999999990T23H59M59S
    $startupTrigger = New-ScheduledTaskTrigger -AtStartup
    
    # Trigger de repeticao com duracao explicita (365 dias - maximo seguro)
    $repetitionTrigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1)
    $repetitionTrigger.Repetition.Interval = "PT5M"   # 5 minutos
    $repetitionTrigger.Repetition.Duration = "P365D"  # 365 dias (valor seguro)
    $repetitionTrigger.Repetition.StopAtDurationEnd = $false
    
    $triggers = @($startupTrigger, $repetitionTrigger)
    
    # ENHANCED RECOVERY: Configuracoes robustas para auto-recuperacao
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 10 `
        -RestartInterval (New-TimeSpan -Seconds 30) `
        -ExecutionTimeLimit (New-TimeSpan -Days 365) `
        -MultipleInstances IgnoreNew `
        -RunOnlyIfNetworkAvailable $false
    
    # Habilitar reinicio em caso de falha (RunOnlyIfIdle = false implicito)
    Write-InstallLog "Recovery: RestartCount=10, RestartInterval=30s, RepetitionInterval=5min" "INFO" "Task"
    
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    
    Register-ScheduledTask `
        -TaskName $taskName `
        -Action $action `
        -Trigger $triggers `
        -Settings $settings `
        -Principal $principal `
        -Force | Out-Null
    
    Write-InstallLog "? Scheduled Task criada: $taskName" "SUCCESS" "Task"
    return $true
}

# ============================================
#  INSTALL DNS FILTER
# ============================================
function Install-DNSFilter {
    if ($script:Config.SkipDNSFilter) {
        Write-InstallLog "DNS Filter ignorado por configuracao" "INFO" "DNSFilter"
        return $true
    }
    
    Write-InstallLog "Instalando DNS Filter..." "INFO" "DNSFilter"
    
    # DNS Filter will be managed by agent v4 on first run
    # Here we just prepare the directory and configuration
    
    $dnsFilterDir = "$($script:Config.InstallPath)\dns-filter"
    
    $dnsConfig = @{
        enabled = $true
        upstream_servers = @("8.8.8.8:53", "1.1.1.1:53")
        listen_address = "127.0.0.1:53"
        log_queries = $true
        cache_enabled = $true
        cache_ttl = 300
    }
    
    $dnsConfig | ConvertTo-Json | Out-File "$dnsFilterDir\config.json" -Encoding UTF8
    
    Write-InstallLog "? Configuracao do DNS Filter preparada" "SUCCESS" "DNSFilter"
    return $true
}

# ============================================
#  START AGENT
# ============================================
function Start-Agent {
    Write-InstallLog "Iniciando agente..." "INFO" "Start"
    
    $taskName = "CyberShield Agent"
    
    Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    Start-Sleep -Seconds 5
    
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task.State -eq "Running") {
        Write-InstallLog "? Agente iniciado com sucesso" "SUCCESS" "Start"
        return $true
    } else {
        Write-InstallLog "Aviso: Agente pode nao ter iniciado. Status: $($task.State)" "WARN" "Start"
        return $false
    }
}

# ============================================
#  REPORT INSTALLATION
# ============================================
function Send-InstallationReport {
    param([bool]$Success, [string]$Error = "")
    
    Write-InstallLog "Enviando relatorio de instalacao..." "INFO" "Report"
    
    try {
        $reportUrl = "$($script:Config.ServerUrl)/functions/v1/track-installation-event"
        $headers = @{
            "Content-Type" = "application/json"
            "X-Agent-Token" = $script:AgentCredentials.Token
        }
        
        $body = @{
            event_type = "enterprise_installation"
            platform = "windows"
            agent_name = $script:Config.AgentName
            details = @{
                success = $Success
                error = $Error
                installer_version = $InstallerVersion
                os_version = (Get-CimInstance Win32_OperatingSystem).Caption
                dns_filter_enabled = (-not $script:Config.SkipDNSFilter)
                silent_mode = $Silent.IsPresent
                config_file_used = [bool]$ConfigFile
            }
        } | ConvertTo-Json -Depth 5
        
        $null = Invoke-RestMethod -Uri $reportUrl -Method POST -Headers $headers -Body $body -TimeoutSec 30
        Write-InstallLog "? Relatorio enviado" "SUCCESS" "Report"
    } catch {
        Write-InstallLog "Aviso: Falha ao enviar relatorio: $_" "WARN" "Report"
    }
}

# ============================================
#  UNINSTALL
# ============================================
function Invoke-Uninstall {
    Write-InstallLog "Iniciando desinstalacao..." "INFO" "Uninstall"
    
    # Stop and remove scheduled task
    $taskName = "CyberShield Agent"
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction SilentlyContinue
        Write-InstallLog "Scheduled Task removida" "INFO" "Uninstall"
    }
    
    # Stop DNS Filter service
    $dnsService = Get-Service -Name "CyberShieldDNS" -ErrorAction SilentlyContinue
    if ($dnsService) {
        Stop-Service -Name "CyberShieldDNS" -Force -ErrorAction SilentlyContinue
        sc.exe delete "CyberShieldDNS" | Out-Null
        Write-InstallLog "Servico DNS Filter removido" "INFO" "Uninstall"
    }
    
    # Remove files (keep logs for audit)
    $itemsToRemove = @(
        "$BaseDir\cybershield-agent-*.ps1",
        "$BaseDir\agent-credentials.enc",
        "$BaseDir\agent-state.json",
        "$BaseDir\dns-filter",
        "$BaseDir\evidence",
        "$BaseDir\policies",
        "$BaseDir\temp"
    )
    
    foreach ($item in $itemsToRemove) {
        if (Test-Path $item) {
            Remove-Item $item -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
    
    Write-InstallLog "? Desinstalacao concluida. Logs preservados em: $BaseDir\logs" "SUCCESS" "Uninstall"
    
    return $true
}

# ============================================
#  MAIN
# ============================================
function Start-Installation {
    $startTime = Get-Date
    
    if (-not $Silent) {
        Write-Host ""
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host "  CyberShield Enterprise Installer v4.0" -ForegroundColor Cyan
        Write-Host "============================================" -ForegroundColor Cyan
        Write-Host ""
    }
    
    try {
        # Handle uninstall
        if ($Uninstall) {
            Invoke-Uninstall
            exit 0
        }
        
        # Step 1: Load configuration
        Get-InstallConfiguration
        
        # Step 2: Check prerequisites
        Test-Prerequisites
        
        # Step 3: Enroll agent
        Invoke-Enrollment
        
        # Step 4: Install files
        Install-AgentFiles
        
        # Step 5: Create scheduled task
        Install-ScheduledTask
        
        # Step 6: Install DNS Filter
        Install-DNSFilter
        
        # Step 7: Start agent
        Start-Agent
        
        # Step 8: Report success
        Send-InstallationReport -Success $true
        
        $duration = (Get-Date) - $startTime
        
        if (-not $Silent) {
            Write-Host ""
            Write-Host "============================================" -ForegroundColor Green
            Write-Host "  INSTALACAO CONCLUIDA COM SUCESSO!" -ForegroundColor Green
            Write-Host "============================================" -ForegroundColor Green
            Write-Host ""
            Write-Host "Agent Name: $($script:Config.AgentName)" -ForegroundColor White
            Write-Host "Install Path: $($script:Config.InstallPath)" -ForegroundColor White
            Write-Host "Duration: $($duration.TotalSeconds.ToString('0.0'))s" -ForegroundColor White
            Write-Host ""
        }
        
        Write-InstallLog "Instalacao concluida em $($duration.TotalSeconds.ToString('0.0'))s" "SUCCESS" "Main"
        exit 0
        
    } catch {
        $errorMsg = $_.Exception.Message
        Write-InstallLog "ERRO CRITICO: $errorMsg" "ERROR" "Main"
        
        Send-InstallationReport -Success $false -Error $errorMsg
        
        if (-not $Silent) {
            Write-Host ""
            Write-Host "============================================" -ForegroundColor Red
            Write-Host "  INSTALACAO FALHOU" -ForegroundColor Red
            Write-Host "============================================" -ForegroundColor Red
            Write-Host ""
            Write-Host "Erro: $errorMsg" -ForegroundColor Red
            Write-Host "Log: $LogPath" -ForegroundColor Yellow
            Write-Host ""
        }
        
        exit 1
    }
}

# Run installation
Start-Installation
