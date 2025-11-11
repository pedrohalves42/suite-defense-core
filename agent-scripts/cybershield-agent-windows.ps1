# CyberShield Agent - Windows PowerShell Script v2.1.0 (Production Ready)
# Compatible with: Windows Server 2012, 2012 R2, 2016, 2019, 2022, 2025
# PowerShell Version: 3.0+

#Requires -Version 3.0

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentToken,
    
    [Parameter(Mandatory=$true)]
    [string]$HmacSecret,
    
    [Parameter(Mandatory=$true)]
    [string]$ServerUrl,
    
    [Parameter(Mandatory=$false)]
    [int]$PollInterval = 60
)

# Validar versão do PowerShell
if ($PSVersionTable.PSVersion.Major -lt 3) {
    Write-Host "ERRO: Este script requer PowerShell 3.0 ou superior" -ForegroundColor Red
    Write-Host "Versão atual: $($PSVersionTable.PSVersion)" -ForegroundColor Yellow
    Write-Host "Por favor, atualize o PowerShell" -ForegroundColor Yellow
    exit 1
}

# Validar sistema operacional
$osVersion = [System.Environment]::OSVersion.Version
$osName = (Get-WmiObject -Class Win32_OperatingSystem).Caption

Write-Host "Sistema operacional: $osName" -ForegroundColor Cyan
Write-Host "Versão: $($osVersion.Major).$($osVersion.Minor)" -ForegroundColor Cyan

# Windows Server 2012 = 6.2, 2012 R2 = 6.3, 2016 = 10.0, etc
if ($osVersion.Major -lt 6 -or ($osVersion.Major -eq 6 -and $osVersion.Minor -lt 2)) {
    Write-Host "AVISO: Este agente foi testado em Windows Server 2012+ e Windows 8+" -ForegroundColor Yellow
    Write-Host "Sua versão pode não ser totalmente suportada" -ForegroundColor Yellow
}

# Configuração de logging
$LogDir = "C:\CyberShield\logs"
$LogFile = Join-Path $LogDir "agent.log"
$MaxLogSizeMB = 10
$MaxLogFiles = 7

# Criar diretório de logs se não existir
if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
}

#region Funções de Logging

function Write-Log {
    param(
        [string]$Message,
        [ValidateSet("INFO", "DEBUG", "WARN", "ERROR", "SUCCESS")]
        [string]$Level = "INFO"
    )
    
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"
    
    # Rotação de logs
    if (Test-Path $LogFile) {
        $logSize = (Get-Item $LogFile).Length / 1MB
        if ($logSize -gt $MaxLogSizeMB) {
            $archiveName = Join-Path $LogDir "agent_$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
            Move-Item $LogFile $archiveName -Force
            
            # Limpar logs antigos
            Get-ChildItem $LogDir -Filter "agent_*.log" | 
                Sort-Object LastWriteTime -Descending | 
                Select-Object -Skip $MaxLogFiles | 
                Remove-Item -Force
        }
    }
    
    # Escrever no arquivo e console
    Add-Content -Path $LogFile -Value $logEntry
    
    $color = switch ($Level) {
        "ERROR"   { "Red" }
        "WARN"    { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG"   { "Gray" }
        default   { "White" }
    }
    
    Write-Host $logEntry -ForegroundColor $color
}

#endregion

#region Configurações

if ([string]::IsNullOrWhiteSpace($AgentToken) -or [string]::IsNullOrWhiteSpace($HmacSecret) -or [string]::IsNullOrWhiteSpace($ServerUrl)) {
    Write-Log "Parâmetros obrigatórios ausentes" "ERROR"
    exit 1
}

$ServerUrl = $ServerUrl.TrimEnd('/')

Write-Log "=== CyberShield Agent v2.1.0 iniciado ===" "SUCCESS"
Write-Log "Sistema: $osName" "INFO"
Write-Log "PowerShell: $($PSVersionTable.PSVersion)" "INFO"
Write-Log "Server URL: $ServerUrl" "INFO"
Write-Log "Poll Interval: $PollInterval segundos" "INFO"
Write-Log "Log Directory: $LogDir" "INFO"

#endregion

#region Funções de Autenticação

function Get-HmacSignature {
    param([string]$Message, [string]$Secret)
    $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
    $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
    $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Message))
    return [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
}

function Invoke-SecureRequest {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [object]$Body = $null,
        [int]$MaxRetries = 3,
        [int]$InitialRetryDelay = 2
    )
    
    Write-Log "Request: $Method $Url" "DEBUG"
    $retryCount = 0
    $retryDelay = $InitialRetryDelay
    
    while ($retryCount -lt $MaxRetries) {
        try {
            $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $nonce = [guid]::NewGuid().ToString()
            
            $bodyJson = if ($Body) { $Body | ConvertTo-Json -Compress } else { "{}" }
            $message = "${timestamp}:${nonce}:${bodyJson}"
            $signature = Get-HmacSignature -Message $message -Secret $HmacSecret
            
            $headers = @{
                "X-Agent-Token" = $AgentToken
                "X-HMAC-Signature" = $signature
                "X-Timestamp" = $timestamp
                "X-Nonce" = $nonce
                "Content-Type" = "application/json"
            }
            
            Write-Log "Headers: Token=$($AgentToken.Substring(0,8))..., Sig=$($signature.Substring(0,16))..." "DEBUG"
            
            $params = @{
                Uri = $Url
                Method = $Method
                Headers = $headers
                ErrorAction = "Stop"
            }
            
            if ($Body) {
                $params.Body = $bodyJson
            }
            
            $response = Invoke-RestMethod @params
            Write-Log "Request successful: $Method $Url" "SUCCESS"
            return $response
        }
        catch {
            $retryCount++
            $errorDetails = $_.Exception.Message
            $statusCode = $_.Exception.Response.StatusCode.value__
            
            Write-Log "Request error (attempt $retryCount/$MaxRetries): $errorDetails" "ERROR"
            if ($statusCode) {
                Write-Log "Status Code: $statusCode" "ERROR"
            }
            
            if ($retryCount -ge $MaxRetries) {
                Write-Log "Failed after $MaxRetries attempts" "ERROR"
                throw
            }
            
            Write-Log "Waiting $retryDelay seconds before retry..." "WARN"
            Start-Sleep -Seconds $retryDelay
            $retryDelay *= 2
        }
    }
}

#endregion

#region Heartbeat

function Send-Heartbeat {
    try {
        Write-Log "Sending heartbeat..." "DEBUG"
        $heartbeatUrl = "$ServerUrl/functions/v1/heartbeat"
        $response = Invoke-SecureRequest -Url $heartbeatUrl -Method "POST" -Body @{}
        Write-Log "Heartbeat sent successfully" "SUCCESS"
        return $response
    }
    catch {
        Write-Log "Heartbeat error: $_" "ERROR"
        return $null
    }
}

#endregion

#region Gerenciamento de Jobs

function Poll-Jobs {
    try {
        Write-Log "Polling jobs..." "DEBUG"
        $pollUrl = "$ServerUrl/functions/v1/poll-jobs"
        $jobs = Invoke-SecureRequest -Url $pollUrl -Method "GET"
        
        if ($jobs -and $jobs.Count -gt 0) {
            Write-Log "Received $($jobs.Count) job(s)" "INFO"
        } else {
            Write-Log "No pending jobs" "DEBUG"
        }
        
        return $jobs
    }
    catch {
        Write-Log "Poll error: $_" "ERROR"
        return $null
    }
}

function Execute-Job {
    param($Job)
    
    Write-Log "Executing job: $($Job.id) - Type: $($Job.type)" "INFO"
    
    $result = @{
        status = "completed"
        timestamp = (Get-Date).ToString("o")
        job_type = $Job.type
        data = @{}
    }
    
    try {
        switch ($Job.type) {
            "scan_virus" {
                # Implementar scan de vírus
                if ($Job.payload.file_path) {
                    $filePath = $Job.payload.file_path
                    if (Test-Path $filePath) {
                        $fileHash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash
                        $fileSize = (Get-Item $filePath).Length
                        $result.data = @{
                            file_path = $filePath
                            file_hash = $fileHash
                            file_size = $fileSize
                            scan_initiated = $true
                        }
                        Write-Log "Virus scan initiated for: $filePath (Hash: $fileHash)" "SUCCESS"
                    } else {
                        $result.status = "failed"
                        $result.error = "File not found: $filePath"
                        Write-Log "File not found: $filePath" "ERROR"
                    }
                } else {
                    $result.status = "failed"
                    $result.error = "No file_path provided in payload"
                    Write-Log "No file_path in job payload" "ERROR"
                }
            }
            
            "collect_info" {
                # Coletar informações do sistema
                Write-Log "Collecting system information..." "INFO"
                $os = Get-CimInstance Win32_OperatingSystem
                $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
                $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
                
                $result.data = @{
                    os_name = $os.Caption
                    os_version = $os.Version
                    os_build = $os.BuildNumber
                    hostname = $env:COMPUTERNAME
                    cpu_name = $cpu.Name
                    cpu_cores = $cpu.NumberOfCores
                    total_memory_gb = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
                    free_memory_gb = [math]::Round($os.FreePhysicalMemory/1MB, 2)
                    disk_free_gb = [math]::Round($disk.FreeSpace/1GB, 2)
                    disk_total_gb = [math]::Round($disk.Size/1GB, 2)
                    last_boot = $os.LastBootUpTime.ToString("o")
                }
                Write-Log "System info collected successfully" "SUCCESS"
            }
            
            "update_config" {
                # Atualizar configurações do agent
                Write-Log "Updating agent configuration..." "INFO"
                if ($Job.payload.poll_interval) {
                    $script:PollInterval = $Job.payload.poll_interval
                    $result.data = @{
                        new_poll_interval = $script:PollInterval
                        config_updated = $true
                    }
                    Write-Log "Poll interval updated to: $($script:PollInterval) seconds" "SUCCESS"
                } else {
                    $result.status = "failed"
                    $result.error = "No configuration changes provided"
                    Write-Log "No configuration changes in payload" "WARN"
                }
            }
            
            "run_command" {
                # Executar comando (com validação de segurança)
                Write-Log "Running command..." "INFO"
                if ($Job.payload.command) {
                    # IMPORTANTE: Apenas comandos seguros permitidos
                    $allowedCommands = @("ipconfig", "systeminfo", "tasklist", "netstat", "hostname", "whoami")
                    $command = $Job.payload.command
                    
                    if ($allowedCommands -contains $command) {
                        try {
                            $output = & $command 2>&1 | Out-String
                            $result.data = @{
                                command = $command
                                output = $output
                                exit_code = $LASTEXITCODE
                            }
                            Write-Log "Command executed successfully: $command" "SUCCESS"
                        }
                        catch {
                            $result.status = "failed"
                            $result.error = "Command execution failed: $($_.Exception.Message)"
                            Write-Log "Command execution error: $_" "ERROR"
                        }
                    } else {
                        $result.status = "failed"
                        $result.error = "Command not allowed: $command. Allowed: $($allowedCommands -join ', ')"
                        Write-Log "Command not allowed: $command" "ERROR"
                    }
                } else {
                    $result.status = "failed"
                    $result.error = "No command provided in payload"
                    Write-Log "No command in payload" "ERROR"
                }
            }
            
            default {
                Write-Log "Unknown job type: $($Job.type)" "WARN"
                $result.status = "failed"
                $result.error = "Unknown job type: $($Job.type)"
            }
        }
        
        if ($result.status -eq "completed") {
            Write-Log "Job executed successfully: $($Job.id)" "SUCCESS"
        }
    }
    catch {
        Write-Log "Job execution failed: $_" "ERROR"
        Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
        $result.status = "failed"
        $result.error = $_.Exception.Message
    }
    
    return $result
}

function Upload-Report {
    param([string]$JobId, [object]$Result)
    
    try {
        $reportData = @{
            job_id = $JobId
            result = $Result
            timestamp = (Get-Date).ToString("o")
        } | ConvertTo-Json -Depth 10
        
        $url = "$ServerUrl/functions/v1/upload-report"
        Invoke-SecureRequest -Url $url -Method "POST" -Body $reportData | Out-Null
        Write-Log "Report uploaded for job $JobId" "SUCCESS"
        return $true
    }
    catch {
        Write-Log "Report upload failed for job $JobId : $_" "ERROR"
        return $false
    }
}

function Ack-Job {
    param([string]$JobId)
    
    Write-Log "Acknowledging job $JobId..." "INFO"
    
    $maxAttempts = 5
    $attempt = 0
    
    while ($attempt -lt $maxAttempts) {
        $attempt++
        
        try {
            $ackUrl = "$ServerUrl/functions/v1/ack-job/$JobId"
            Write-Log "ACK attempt $attempt/$maxAttempts: POST $ackUrl" "DEBUG"
            
            $response = Invoke-SecureRequest -Url $ackUrl -Method "POST" -Body @{} -MaxRetries 1
            
            if ($response) {
                if ($response.ok -eq $true) {
                    Write-Log "Job $JobId acknowledged successfully (ok=true)" "SUCCESS"
                    return $true
                } elseif ($response.error) {
                    if ($response.error -match "já foi confirmado|already") {
                        Write-Log "Job $JobId already acknowledged (idempotent)" "INFO"
                        return $true
                    } else {
                        Write-Log "Server error: $($response.error)" "ERROR"
                    }
                } else {
                    Write-Log "Unexpected response: $($response | ConvertTo-Json -Compress)" "WARN"
                }
            } else {
                Write-Log "Empty response from server" "WARN"
            }
            
            if ($attempt -lt $maxAttempts) {
                $waitTime = [Math]::Pow(2, $attempt)
                Write-Log "Waiting $waitTime seconds before retry..." "WARN"
                Start-Sleep -Seconds $waitTime
            }
        }
        catch {
            Write-Log "ACK attempt $attempt error: $_" "ERROR"
            
            if ($attempt -lt $maxAttempts) {
                $waitTime = [Math]::Pow(2, $attempt)
                Write-Log "Waiting $waitTime seconds before retry..." "WARN"
                Start-Sleep -Seconds $waitTime
            }
        }
    }
    
    Write-Log "CRITICAL: Could not acknowledge job $JobId after $maxAttempts attempts" "ERROR"
    Write-Log "ACTION REQUIRED: Check server logs and connectivity" "ERROR"
    return $false
}

#endregion

#region System Health

function Test-SystemHealth {
    Write-Log "=== Starting System Health Check ===" "INFO"
    
    $psVersion = $PSVersionTable.PSVersion
    Write-Log "PowerShell Version: $psVersion" "INFO"
    if ($psVersion.Major -lt 5) {
        Write-Log "WARNING: PowerShell 5.1+ recommended" "WARN"
    }
    
    try {
        Write-Log "Testing server connectivity..." "INFO"
        $testUrl = "$ServerUrl/functions/v1/poll-jobs"
        $testResponse = Invoke-SecureRequest -Url $testUrl -Method "GET" -MaxRetries 2
        Write-Log "Server connectivity: OK" "SUCCESS"
    }
    catch {
        Write-Log "CRITICAL: Cannot connect to server" "ERROR"
        Write-Log "URL tested: $testUrl" "ERROR"
        Write-Log "Error: $_" "ERROR"
        return $false
    }
    
    try {
        Write-Log "Testing heartbeat endpoint..." "INFO"
        $heartbeatResponse = Send-Heartbeat
        if ($heartbeatResponse) {
            Write-Log "Heartbeat: OK" "SUCCESS"
        } else {
            Write-Log "Heartbeat: FAILED (non-critical)" "WARN"
        }
    }
    catch {
        Write-Log "Heartbeat test error: $_" "WARN"
    }
    
    $os = Get-CimInstance Win32_OperatingSystem
    Write-Log "OS: $($os.Caption) $($os.Version)" "INFO"
    Write-Log "Free Memory: $([math]::Round($os.FreePhysicalMemory/1MB, 2)) GB" "INFO"
    
    $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    Write-Log "Free Disk C:: $([math]::Round($disk.FreeSpace/1GB, 2)) GB" "INFO"
    
    Write-Log "=== Health Check Completed Successfully ===" "SUCCESS"
    return $true
}

#endregion

#region Main Agent Loop

function Start-Agent {
    Write-Log "=== Starting Agent Loop ===" "SUCCESS"
    Write-Log "Press Ctrl+C to stop" "INFO"
    
    Write-Log "Running initial health check..." "INFO"
    if (-not (Test-SystemHealth)) {
        Write-Log "CRITICAL: Health check failed. Cannot start agent." "ERROR"
        Write-Log "Please fix the issues above before continuing." "ERROR"
        exit 1
    }
    
    Write-Log "Sending initial heartbeat..." "INFO"
    Send-Heartbeat | Out-Null
    
    $lastHeartbeat = Get-Date
    $heartbeatInterval = 60
    
    while ($true) {
        try {
            $now = Get-Date
            if (($now - $lastHeartbeat).TotalSeconds -ge $heartbeatInterval) {
                Send-Heartbeat | Out-Null
                $lastHeartbeat = $now
            }
            
            Write-Log "Fetching new jobs..." "INFO"
            
            $jobs = Poll-Jobs
            
            if ($jobs -and $jobs.Count -gt 0) {
                Write-Log "Found $($jobs.Count) job(s) to execute" "SUCCESS"
                
                foreach ($job in $jobs) {
                    Write-Log "========================================" "INFO"
                    Write-Log "Executing job: $($job.id)" "INFO"
                    Write-Log "Type: $($job.type)" "INFO"
                    Write-Log "Payload: $($job.payload | ConvertTo-Json -Compress)" "DEBUG"
                    
                    $result = Execute-Job -Job $job
                    
                    if ($result) {
                        Write-Log "Uploading result..." "INFO"
                        Upload-Report -JobId $job.id -Result $result
                    }
                    
                    $ackSuccess = Ack-Job -JobId $job.id
                    
                    if ($ackSuccess) {
                        Write-Log "Job $($job.id) completed and acknowledged successfully" "SUCCESS"
                    } else {
                        Write-Log "WARNING: Job $($job.id) executed but ACK failed!" "WARN"
                    }
                    
                    Write-Log "========================================" "INFO"
                }
            } else {
                Write-Log "No pending jobs" "DEBUG"
            }
            
            Write-Log "Waiting $PollInterval seconds until next poll..." "DEBUG"
            Start-Sleep -Seconds $PollInterval
        }
        catch {
            Write-Log "Main loop error: $_" "ERROR"
            Write-Log "Stack Trace: $($_.ScriptStackTrace)" "ERROR"
            Write-Log "Waiting $PollInterval seconds before continuing..." "WARN"
            Start-Sleep -Seconds $PollInterval
        }
    }
}

#endregion

Start-Agent
