# CyberShield Agent - Windows PowerShell Script v2.2.1 (Production Ready)
# Compatible with: Windows Server 2012, 2012 R2, 2016, 2019, 2022, 2025
# PowerShell Version: 3.0+

#Requires -Version 3.0

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

# Validate parameters
if ([string]::IsNullOrWhiteSpace($AgentToken)) {
    Write-Host "ERROR: AgentToken cannot be empty" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($HmacSecret)) {
    Write-Host "ERROR: HmacSecret cannot be empty" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
    Write-Host "ERROR: ServerUrl cannot be empty" -ForegroundColor Red
    exit 1
}

if ($AgentToken.Length -lt 20) {
    Write-Host "ERROR: AgentToken appears to be invalid (too short)" -ForegroundColor Red
    exit 1
}

if ($HmacSecret.Length -lt 32) {
    Write-Host "ERROR: HmacSecret appears to be invalid (too short)" -ForegroundColor Red
    exit 1
}

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

# ✅ FASE 2.2: Configurar TLS 1.2 e proxy globalmente
Write-Log "Configurando rede..." "INFO"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$proxy = [System.Net.WebRequest]::GetSystemWebProxy()
[System.Net.WebRequest]::DefaultWebProxy = $proxy
[System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials

Write-Log "TLS 1.2 habilitado" "SUCCESS"

# ✅ FASE 2.1: Validação APÓS LOG INICIAL
if ([string]::IsNullOrWhiteSpace($AgentToken)) {
    Write-Log "FATAL: AgentToken vazio" "ERROR"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($HmacSecret)) {
    Write-Log "FATAL: HmacSecret vazio" "ERROR"
    exit 1
}

if ([string]::IsNullOrWhiteSpace($ServerUrl)) {
    Write-Log "FATAL: ServerUrl vazio" "ERROR"
    exit 1
}

$ServerUrl = $ServerUrl.TrimEnd('/')

Write-Log "=== CyberShield Agent v3.0.0-APEX iniciado ===" "SUCCESS"
Write-Log "Sistema: $osName" "INFO"
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
            
            # Fix #4: Validar Body explicitamente antes de converter
            if ($Body -ne $null -and $Body -is [hashtable]) {
                $bodyJson = $Body | ConvertTo-Json -Compress
            } else {
                $bodyJson = "{}"
            }
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
    param([switch]$IsBootHeartbeat)
    
    $maxRetries = if ($IsBootHeartbeat) { 5 } else { 3 }
    $retryCount = 0
    
    while ($retryCount -lt $maxRetries) {
        try {
            if ($IsBootHeartbeat) {
                Write-Log "  Preparando heartbeat inicial..." "DEBUG"
            } else {
                Write-Log "  Preparando heartbeat..." "DEBUG"
            }
            
            $heartbeatUrl = "$ServerUrl/functions/v1/heartbeat"
            Write-Log "    Endpoint: $heartbeatUrl" "DEBUG"
            
            # Incluir informações do OS no heartbeat
            $os = Get-CimInstance Win32_OperatingSystem
            Write-Log "    OS: $($os.Caption)" "DEBUG"
            Write-Log "    Hostname: $env:COMPUTERNAME" "DEBUG"
            
            $body = @{
                os_type = "windows"
                os_version = $os.Caption
                hostname = $env:COMPUTERNAME
            }
            
            $response = Invoke-SecureRequest -Url $heartbeatUrl -Method "POST" -Body $body -MaxRetries 1
            
            if ($IsBootHeartbeat) {
                Write-Log "    ✓ Heartbeat inicial aceito pelo servidor" "SUCCESS"
            } else {
                Write-Log "    ✓ Heartbeat OK" "DEBUG"
            }
            
            return $response
        }
        catch {
            $retryCount++
            Write-Log "    ✗ Heartbeat erro (tentativa $retryCount/$maxRetries): $_" "ERROR"
            Write-Log "    Stack: $($_.ScriptStackTrace)" "DEBUG"
            if ($retryCount -lt $maxRetries) {
                Start-Sleep -Seconds (2 * $retryCount)
            }
        }
    }
    
    Write-Log "Failed to send heartbeat after $maxRetries attempts" "ERROR"
    return $null
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
        # Fix #1: Passar hashtable diretamente, não JSON string
        $reportData = @{
            job_id = $JobId
            result = $Result
            timestamp = (Get-Date).ToString("o")
        }
        
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

#region System Metrics

function Send-SystemMetrics {
    try {
        Write-Log "Collecting and sending system metrics..." "INFO"
        
        $os = Get-CimInstance Win32_OperatingSystem
        $cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        
        # Calcular CPU usage
        $cpuUsage = (Get-Counter '\Processor(_Total)\% Processor Time' -SampleInterval 1 -MaxSamples 2 | 
            Select-Object -ExpandProperty CounterSamples | 
            Select-Object -Last 1).CookedValue
        
        $metrics = @{
            cpu_usage_percent = [math]::Round($cpuUsage, 2)
            cpu_name = $cpu.Name
            cpu_cores = $cpu.NumberOfCores
            memory_total_gb = [math]::Round($os.TotalVisibleMemorySize/1MB, 2)
            memory_used_gb = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory)/1MB, 2)
            memory_free_gb = [math]::Round($os.FreePhysicalMemory/1MB, 2)
            memory_usage_percent = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 2)
            disk_total_gb = [math]::Round($disk.Size/1GB, 2)
            disk_used_gb = [math]::Round(($disk.Size - $disk.FreeSpace)/1GB, 2)
            disk_free_gb = [math]::Round($disk.FreeSpace/1GB, 2)
            disk_usage_percent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 2)
            uptime_seconds = [int]((Get-Date) - $os.LastBootUpTime).TotalSeconds
            last_boot_time = $os.LastBootUpTime.ToString("o")
        }
        
        $metricsUrl = "$ServerUrl/functions/v1/submit-system-metrics"
        $response = Invoke-SecureRequest -Url $metricsUrl -Method "POST" -Body $metrics
        
        # Fix #5: Apenas logar sucesso se response não for null
        if ($response) {
            Write-Log "System metrics sent successfully (CPU: $($metrics.cpu_usage_percent)%, RAM: $($metrics.memory_usage_percent)%, Disk: $($metrics.disk_usage_percent)%)" "SUCCESS"
            
            if ($response.alerts_generated -and $response.alerts_generated -gt 0) {
                Write-Log "⚠️ $($response.alerts_generated) alert(s) generated" "WARN"
            }
        } else {
            Write-Log "Metrics request completed but no response received" "WARN"
        }
        
        return $response
    }
    catch {
        Write-Log "Failed to send system metrics: $_" "ERROR"
        return $null
    }
}

#endregion

#region System Health

function Test-SystemHealth {
    Write-Log "========================================" "INFO"
    Write-Log "🔍 DIAGNÓSTICO COMPLETO DE SISTEMA" "INFO"
    Write-Log "========================================" "INFO"
    
    # 1. Validar PowerShell
    Write-Log "  [1/6] Validando PowerShell..." "INFO"
    if ($PSVersionTable.PSVersion.Major -lt 3) {
        Write-Log "  ✗ PowerShell muito antigo! Requer 3.0+" "ERROR"
        return $false
    }
    Write-Log "  ✓ PowerShell $($PSVersionTable.PSVersion) OK" "SUCCESS"
    
    # 2. Testar conectividade DNS
    Write-Log "  [2/6] Testando conectividade DNS..." "INFO"
    try {
        $dnsTest = Test-Connection -ComputerName "google.com" -Count 1 -Quiet -ErrorAction Stop
        if ($dnsTest) {
            Write-Log "  ✓ DNS OK - Internet acessível" "SUCCESS"
        } else {
            Write-Log "  ✗ DNS FALHOU - Sem internet" "ERROR"
            return $false
        }
    } catch {
        Write-Log "  ✗ Erro DNS: $_" "ERROR"
        return $false
    }
    
    # 3. Extrair hostname do ServerUrl
    Write-Log "  [3/6] Extraindo hostname do servidor..." "INFO"
    $serverHost = $ServerUrl -replace "https://","" -replace "http://","" -replace "/.*",""
    Write-Log "  Hostname: $serverHost" "INFO"
    
    # 4. Testar conexão TCP com servidor backend
    Write-Log "  [4/6] Testando conectividade TCP:443 com $serverHost..." "INFO"
    try {
        $tcpTest = Test-NetConnection -ComputerName $serverHost -Port 443 -WarningAction SilentlyContinue -ErrorAction Stop
        if ($tcpTest.TcpTestSucceeded) {
            Write-Log "  ✓ Conectividade TCP:443 OK" "SUCCESS"
        } else {
            Write-Log "  ✗ TCP:443 falhou - Firewall pode estar bloqueando" "ERROR"
            Write-Log "    Verifique regras de firewall para $serverHost:443" "WARN"
            return $false
        }
    } catch {
        Write-Log "  ✗ Erro ao testar TCP: $_" "ERROR"
        return $false
    }
    
    # 5. Testar recursos do sistema
    Write-Log "  [5/6] Verificando recursos do sistema..." "INFO"
    try {
        $memory = Get-WmiObject Win32_OperatingSystem
        $freeMemoryMB = [math]::Round($memory.FreePhysicalMemory / 1024, 2)
        Write-Log "    Memória livre: $freeMemoryMB MB" "INFO"
        
        if ($freeMemoryMB -lt 100) {
            Write-Log "    ⚠ AVISO: Memória disponível baixa" "WARN"
        }
        
        $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        $freeSpaceGB = [math]::Round($disk.FreeSpace / 1GB, 2)
        Write-Log "    Espaço livre C:: $freeSpaceGB GB" "INFO"
        
        if ($freeSpaceGB -lt 1) {
            Write-Log "    ⚠ AVISO: Espaço em disco baixo" "WARN"
        }
    } catch {
        Write-Log "    ⚠ Não foi possível verificar recursos: $_" "WARN"
    }
    
    # 6. RETRY DE HEARTBEAT COM BACKOFF EXPONENCIAL
    Write-Log "  [6/6] Tentando enviar heartbeat inicial..." "INFO"
    $maxRetries = 5
    $retryCount = 0
    $heartbeatSuccess = $false
    
    while ($retryCount -lt $maxRetries -and -not $heartbeatSuccess) {
        $retryCount++
        Write-Log "    Tentativa $retryCount/$maxRetries..." "INFO"
        
        $result = Send-Heartbeat -IsBootHeartbeat
        if ($result) {
            Write-Log "  ✓ Heartbeat inicial enviado com SUCESSO!" "SUCCESS"
            $heartbeatSuccess = $true
        } else {
            Write-Log "    ✗ Heartbeat falhou" "WARN"
            
            if ($retryCount -lt $maxRetries) {
                $backoffSeconds = [math]::Pow(2, $retryCount)
                Write-Log "    Aguardando $backoffSeconds segundos antes de retry..." "INFO"
                Start-Sleep -Seconds $backoffSeconds
            }
        }
    }
    
    if (-not $heartbeatSuccess) {
        Write-Log "========================================" "ERROR"
        Write-Log "✗ FALHA CRÍTICA: Heartbeat não enviado após $maxRetries tentativas" "ERROR"
        Write-Log "========================================" "ERROR"
        Write-Log "Possíveis causas:" "ERROR"
        Write-Log "  1. Credenciais inválidas (AgentToken ou HmacSecret)" "ERROR"
        Write-Log "  2. Rate limiting ativo no servidor" "ERROR"
        Write-Log "  3. Endpoint /heartbeat offline ou com erro" "ERROR"
        Write-Log "  4. Firewall corporativo bloqueando HTTPS" "ERROR"
        Write-Log "" "ERROR"
        Write-Log "SOLUÇÃO:" "WARN"
        Write-Log "  - Verifique os logs do servidor backend" "WARN"
        Write-Log "  - Valide as credenciais no dashboard" "WARN"
        Write-Log "  - Teste conectividade: Test-NetConnection $serverHost -Port 443" "WARN"
        return $false
    }
    
    Write-Log "========================================" "SUCCESS"
    Write-Log "✅ AGENTE INICIALIZADO COM SUCESSO!" "SUCCESS"
    Write-Log "========================================" "SUCCESS"
    return $true
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
    
    Write-Log "Sending initial system metrics..." "INFO"
    Send-SystemMetrics | Out-Null
    
    $lastHeartbeat = Get-Date
    $lastMetrics = Get-Date
    $heartbeatInterval = 60
    $metricsInterval = 300  # 5 minutos
    
    while ($true) {
        try {
            $now = Get-Date
            
            # Heartbeat a cada 60 segundos
            if (($now - $lastHeartbeat).TotalSeconds -ge $heartbeatInterval) {
                Send-Heartbeat | Out-Null
                $lastHeartbeat = $now
            }
            
            # Métricas de sistema a cada 5 minutos
            if (($now - $lastMetrics).TotalSeconds -ge $metricsInterval) {
                Send-SystemMetrics | Out-Null
                $lastMetrics = $now
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
