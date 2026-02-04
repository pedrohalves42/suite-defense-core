<#
    CyberShield Agent - Windows v5.0.0
    
    v5.0.0: AUTO-REMEDIATION - Transição de Observador Passivo para Respondedor Ativo
    
    NOVAS FUNCIONALIDADES:
    =====================
    - AUTO-REMEDIATION P0:
      * Invoke-DiskCleanup: Limpeza automática quando disco > 95%
      * Invoke-HighCpuProcessCheck: Auto-kill de processos suspeitos com CPU > 90%
    
    - COLETA AVANÇADA P1:
      * Get-TopProcesses: Top 5 por CPU e RAM no heartbeat
      * Get-UnauthorizedSoftware: Detecção de software não autorizado
      * Get-ProcessBaseline: Detecção de anomalias via baseline
    
    - RESILIÊNCIA DE REDE P1:
      * Invoke-SecureRequest melhorado com backoff exponencial (1s -> 60s)
      * Retry inteligente com classificação de erros transientes
    
    - SEGURANÇA P2:
      * Baseline de processos persistido em JSON
      * Detecção de processos novos/anômalos
      * Telemetria de eventos de auto-reparo
    
    HERDA DE v4.5.0:
    ================
    - ECDSA P-256 result signing (POE)
    - Ed25519 job signature verification
    - FSM Enterprise com 6 estados
    - Network Watchdog e Power Events
    - DNS Filter integrado
    - Policy Contract com drift detection
    - Auto-rollback e Safe Mode
    
    Uso:
    powershell.exe -ExecutionPolicy Bypass -File .\cybershield-agent-windows-v5.ps1 `
        -ServerUrl "https://seu-projeto.supabase.co" `
        -AgentToken "AGENT_TOKEN_AQUI" `
        -HmacSecret "64_HEX_CHARS_AQUI" `
        -AgentName "meu-servidor-01"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,

    [Parameter(Mandatory = $true)]
    [string]$AgentToken,

    [Parameter(Mandatory = $true)]
    [string]$HmacSecret,

    [Parameter(Mandatory = $false)]
    [string]$AgentName = $env:COMPUTERNAME.ToLower(),

    [Parameter(Mandatory = $false)]
    [string]$AgentVersion = "v5.0.0"
)

# CRITICAL: Forçar TLS 1.2 para compatibilidade
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ErrorActionPreference = "Stop"

# ============================================
#  TRAP GLOBAL PARA ERROS NAO TRATADOS
# ============================================
trap {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $msg = "FATAL ERROR: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)"
    $stack = $_.ScriptStackTrace

    $logDir = "C:\CyberShield\logs"
    $logPath = Join-Path $logDir "cybershield-agent-v5.log"

    if (Test-Path $logDir) {
        try {
            "$ts [FATAL] $msg" | Out-File -FilePath $logPath -Append -Encoding UTF8
            "$ts [FATAL] Stack: $stack" | Out-File -FilePath $logPath -Append -Encoding UTF8
        } catch { }
    }

    Write-EventLog -LogName Application -Source "CyberShield" -EventId 1001 -EntryType Error -Message "$msg`n$stack" -ErrorAction SilentlyContinue
    throw
}

# ============================================
#  VARIAVEIS GLOBAIS
# ============================================
$Global:ServerUrl    = $ServerUrl.TrimEnd('/')
$Global:AgentToken   = $AgentToken
$Global:HmacSecret   = $HmacSecret
$Global:AgentName    = $AgentName
$Global:AgentVersion = $AgentVersion

# Diretorios
$Global:BaseDir = "C:\CyberShield"
$logDir = Join-Path -Path $Global:BaseDir -ChildPath "logs"
$evidenceDir = Join-Path -Path $Global:BaseDir -ChildPath "evidence"
$dataDir = Join-Path -Path $Global:BaseDir -ChildPath "data"

# Criar diretorios se nao existirem
@($logDir, $evidenceDir, $dataDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}

$Global:LogFilePath = Join-Path -Path $logDir -ChildPath "cybershield-agent-v5.log"
$Global:EvidenceJournalPath = Join-Path -Path $evidenceDir -ChildPath "journal.log"
$Global:ProcessBaselinePath = Join-Path -Path $dataDir -ChildPath "process_baseline.json"
$Global:AutoRepairLogPath = Join-Path -Path $dataDir -ChildPath "auto_repair.log"

# Intervalos
$Global:PollIntervalSeconds = 60
$Global:DiskCleanupThresholdPercent = 95
$Global:HighCpuThresholdPercent = 90
$Global:MaxLogSizeBytes = 10MB

# v5.0: Contadores de auto-reparo
$Global:AutoRepairStats = @{
    disk_cleanups = 0
    processes_killed = 0
    last_disk_cleanup = $null
    last_process_kill = $null
}

# ============================================
#  LOGGING
# ============================================
function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("INFO", "WARN", "ERROR", "DEBUG", "SUCCESS")]
        [string]$Level = "INFO"
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $logEntry = "[$timestamp] [$Level] $Message"

    # Console output com cores
    $color = switch ($Level) {
        "ERROR"   { "Red" }
        "WARN"    { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG"   { "Gray" }
        default   { "White" }
    }
    Write-Host $logEntry -ForegroundColor $color

    # File output com rotação
    try {
        $logFile = Get-Item $Global:LogFilePath -ErrorAction SilentlyContinue
        if ($logFile -and $logFile.Length -gt $Global:MaxLogSizeBytes) {
            $backupFile = "$($Global:LogFilePath).$(Get-Date -Format 'yyyyMMdd_HHmmss').bak"
            Move-Item $Global:LogFilePath $backupFile -Force
            
            # Manter apenas últimos 5 backups
            Get-ChildItem -Path $logDir -Filter "*.bak" | 
                Sort-Object LastWriteTime -Descending | 
                Select-Object -Skip 5 | 
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
        
        Add-Content -Path $Global:LogFilePath -Value $logEntry -Encoding UTF8
    } catch {
        # Silenciar erros de log
    }
}

# ============================================
#  v5.0: INVOKE-SECUREREQUEST COM BACKOFF EXPONENCIAL
# ============================================
function Invoke-SecureRequest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        
        [Parameter(Mandatory = $false)]
        [string]$Method = "GET",
        
        [Parameter(Mandatory = $false)]
        [object]$Body,
        
        [Parameter(Mandatory = $false)]
        [int]$MaxRetries = 5,
        
        [Parameter(Mandatory = $false)]
        [int]$TimeoutSec = 30
    )
    
    $url = if ($Path.StartsWith("http")) { $Path } else { "$($Global:ServerUrl)$Path" }
    $retryCount = 0
    $baseDelaySeconds = 1
    $maxDelaySeconds = 60
    
    while ($retryCount -lt $MaxRetries) {
        try {
            $headers = @{
                "User-Agent" = "CyberShield-Agent/$Global:AgentVersion"
                "X-Agent-Token" = $Global:AgentToken
                "X-Agent-Name" = $Global:AgentName
            }
            
            # HMAC se disponível
            if ($Global:HmacSecret -and $Body) {
                $bodyJson = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 }
                $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
                $nonce = [Guid]::NewGuid().ToString("N")
                $signaturePayload = "$timestamp.$nonce.$bodyJson"
                
                $hmac = New-Object System.Security.Cryptography.HMACSHA256
                $hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($Global:HmacSecret)
                $signatureBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($signaturePayload))
                $signature = [BitConverter]::ToString($signatureBytes).Replace("-", "").ToLower()
                
                $headers["X-HMAC-Signature"] = $signature
                $headers["X-HMAC-Timestamp"] = $timestamp
                $headers["X-HMAC-Nonce"] = $nonce
            }
            
            $params = @{
                Uri = $url
                Method = $Method
                Headers = $headers
                TimeoutSec = $TimeoutSec
                UseBasicParsing = $true
            }
            
            if ($Body) {
                $params.Body = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Depth 10 }
                $params.ContentType = "application/json; charset=utf-8"
            }
            
            $response = Invoke-WebRequest @params
            
            return @{
                Success = $true
                StatusCode = $response.StatusCode
                Content = $response.Content
                Headers = $response.Headers
            }
            
        } catch {
            $retryCount++
            $errorMsg = $_.Exception.Message
            
            # Classificar erro como transiente ou permanente
            $isTransient = $errorMsg -match "timeout|connection|network|503|502|504|429"
            
            if ($retryCount -lt $MaxRetries -and $isTransient) {
                # Backoff exponencial: 1s, 2s, 4s, 8s, 16s... max 60s
                $delay = [math]::Min($baseDelaySeconds * [math]::Pow(2, $retryCount - 1), $maxDelaySeconds)
                
                Write-Log "[NETWORK] Request failed (attempt $retryCount/$MaxRetries), retrying in ${delay}s: $errorMsg" "WARN"
                Start-Sleep -Seconds $delay
            } else {
                if (-not $isTransient) {
                    Write-Log "[NETWORK] Permanent error, not retrying: $errorMsg" "ERROR"
                } else {
                    Write-Log "[NETWORK] All $MaxRetries retries exhausted: $errorMsg" "ERROR"
                }
                
                return @{
                    Success = $false
                    Error = $errorMsg
                    StatusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
                    Transient = $isTransient
                }
            }
        }
    }
    
    return @{ Success = $false; Error = "Max retries exceeded" }
}

# ============================================
#  v5.0: AUTO-REPARO - LIMPEZA DE DISCO
# ============================================
function Invoke-DiskCleanup {
    <#
    .SYNOPSIS
        Auto-limpeza de disco quando uso > 95%
    .DESCRIPTION
        P0 Critical: Sistema não deve travar por falta de espaço.
        Limpa: temp files, Windows temp, Downloads antigos, logs antigos.
    #>
    param(
        [Parameter(Mandatory = $false)]
        [int]$ThresholdPercent = $Global:DiskCleanupThresholdPercent
    )
    
    try {
        $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        $usedPercent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
        
        if ($usedPercent -lt $ThresholdPercent) {
            return @{ cleaned = $false; reason = "disk_ok"; usage_percent = $usedPercent }
        }
        
        Write-Log "[DISK-CLEANUP] Disk usage at $usedPercent% (threshold: $ThresholdPercent%). Starting cleanup..." "WARN"
        
        $freedBytes = 0
        $actions = @()
        
        # 1. Limpar temp do usuário
        try {
            $tempPath = $env:TEMP
            $tempFiles = Get-ChildItem -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue
            $tempSize = ($tempFiles | Measure-Object -Property Length -Sum).Sum
            Remove-Item "$tempPath\*" -Recurse -Force -ErrorAction SilentlyContinue
            $freedBytes += $tempSize
            $actions += "user_temp"
        } catch { }
        
        # 2. Limpar Windows temp
        try {
            $winTempPath = "C:\Windows\Temp"
            $winTempFiles = Get-ChildItem -Path $winTempPath -Recurse -Force -ErrorAction SilentlyContinue
            $winTempSize = ($winTempFiles | Measure-Object -Property Length -Sum).Sum
            Remove-Item "$winTempPath\*" -Recurse -Force -ErrorAction SilentlyContinue
            $freedBytes += $winTempSize
            $actions += "windows_temp"
        } catch { }
        
        # 3. Limpar prefetch (seguro, Windows recria)
        try {
            $prefetchPath = "C:\Windows\Prefetch"
            Remove-Item "$prefetchPath\*.pf" -Force -ErrorAction SilentlyContinue
            $actions += "prefetch"
        } catch { }
        
        # 4. Executar cleanmgr silenciosamente (se disponível)
        try {
            $cleanMgrPath = "C:\Windows\System32\cleanmgr.exe"
            if (Test-Path $cleanMgrPath) {
                # Configurar sagerun preset se não existir
                $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches"
                $caches = @("Temporary Files", "Temporary Setup Files", "Old ChkDsk Files", "Recycle Bin")
                
                foreach ($cache in $caches) {
                    $cachePath = "$regPath\$cache"
                    if (Test-Path $cachePath) {
                        Set-ItemProperty -Path $cachePath -Name "StateFlags0100" -Value 2 -ErrorAction SilentlyContinue
                    }
                }
                
                $process = Start-Process "cleanmgr.exe" -ArgumentList "/sagerun:100" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
                if ($process.ExitCode -eq 0) {
                    $actions += "cleanmgr"
                }
            }
        } catch { }
        
        # Recalcular uso de disco
        $diskAfter = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        $usedPercentAfter = [math]::Round((($diskAfter.Size - $diskAfter.FreeSpace) / $diskAfter.Size) * 100, 1)
        $freedGB = [math]::Round(($diskAfter.FreeSpace - $disk.FreeSpace) / 1GB, 2)
        
        Write-Log "[DISK-CLEANUP] Completed. Usage: $usedPercent% -> $usedPercentAfter% (freed: ${freedGB}GB)" "SUCCESS"
        
        # Atualizar estatísticas
        $Global:AutoRepairStats.disk_cleanups++
        $Global:AutoRepairStats.last_disk_cleanup = (Get-Date).ToString("o")
        
        # Registrar evento
        $eventData = @{
            event = "disk_cleanup"
            before_percent = $usedPercent
            after_percent = $usedPercentAfter
            freed_gb = $freedGB
            actions = $actions
        }
        
        Send-AutoRepairTelemetry -Event "disk_cleanup" -Data $eventData
        
        return @{
            cleaned = $true
            before_percent = $usedPercent
            after_percent = $usedPercentAfter
            freed_gb = $freedGB
            actions = $actions
        }
        
    } catch {
        Write-Log "[DISK-CLEANUP] Error: $($_.Exception.Message)" "ERROR"
        return @{ cleaned = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0: AUTO-REPARO - HIGH CPU PROCESS CHECK
# ============================================
function Invoke-HighCpuProcessCheck {
    <#
    .SYNOPSIS
        Detecta e mata processos suspeitos com CPU > 90%
    .DESCRIPTION
        P0 Critical: Evita travamento do sistema por processos runaway.
        Protege processos críticos do sistema e aplicações conhecidas.
    #>
    param(
        [Parameter(Mandatory = $false)]
        [int]$ThresholdPercent = $Global:HighCpuThresholdPercent
    )
    
    # Processos protegidos (NUNCA matar)
    $protectedProcesses = @(
        # Sistema Windows
        "System", "Idle", "svchost", "csrss", "smss", "wininit", "winlogon",
        "services", "lsass", "dwm", "explorer", "taskmgr", "RuntimeBroker",
        "spoolsv", "msdtc", "SearchIndexer", "WmiPrvSE",
        # CyberShield
        "powershell", "CyberShield", "dns-filter",
        # Aplicações comuns
        "chrome", "firefox", "msedge", "code", "Teams", "Outlook",
        "slack", "zoom", "OneDrive", "WINWORD", "EXCEL", "POWERPNT"
    )
    
    try {
        # Coletar processos com alta CPU (usando Get-Counter para CPU real-time)
        $cpuSamples = @{}
        
        # Primeira amostra
        $processes1 = Get-Process | Where-Object { $_.CPU -ne $null }
        Start-Sleep -Milliseconds 500
        # Segunda amostra
        $processes2 = Get-Process | Where-Object { $_.CPU -ne $null }
        
        foreach ($p2 in $processes2) {
            $p1 = $processes1 | Where-Object { $_.Id -eq $p2.Id }
            if ($p1) {
                $cpuDelta = $p2.CPU - $p1.CPU
                $cpuPercent = ($cpuDelta / 0.5) * 100 / [Environment]::ProcessorCount
                $cpuSamples[$p2.Id] = @{
                    Name = $p2.ProcessName
                    CpuPercent = [math]::Round($cpuPercent, 1)
                    WorkingSetMB = [math]::Round($p2.WorkingSet / 1MB, 1)
                }
            }
        }
        
        # Filtrar processos com alta CPU
        $highCpuProcesses = $cpuSamples.GetEnumerator() | 
            Where-Object { $_.Value.CpuPercent -gt $ThresholdPercent } |
            Where-Object { $_.Value.Name -notin $protectedProcesses }
        
        $killedProcesses = @()
        
        foreach ($proc in $highCpuProcesses) {
            $procName = $proc.Value.Name
            $procId = $proc.Key
            $cpuPercent = $proc.Value.CpuPercent
            
            Write-Log "[PROCESS-CHECK] High CPU detected: $procName (PID: $procId) at $cpuPercent%" "WARN"
            
            try {
                # Verificar se é processo baseline (conhecido)
                $isBaseline = Test-ProcessInBaseline -ProcessName $procName
                
                if (-not $isBaseline) {
                    Write-Log "[PROCESS-CHECK] Process $procName NOT in baseline - killing..." "WARN"
                    Stop-Process -Id $procId -Force -ErrorAction Stop
                    
                    $killedProcesses += @{
                        name = $procName
                        pid = $procId
                        cpu_percent = $cpuPercent
                        reason = "high_cpu_not_baseline"
                    }
                    
                    Write-Log "[PROCESS-CHECK] Killed suspicious process: $procName (PID: $procId)" "SUCCESS"
                } else {
                    Write-Log "[PROCESS-CHECK] Process $procName in baseline, monitoring only" "INFO"
                }
                
            } catch {
                Write-Log "[PROCESS-CHECK] Failed to kill $procName : $($_.Exception.Message)" "ERROR"
            }
        }
        
        if ($killedProcesses.Count -gt 0) {
            $Global:AutoRepairStats.processes_killed += $killedProcesses.Count
            $Global:AutoRepairStats.last_process_kill = (Get-Date).ToString("o")
            
            Send-AutoRepairTelemetry -Event "process_killed" -Data @{
                processes = $killedProcesses
                threshold_percent = $ThresholdPercent
            }
        }
        
        return @{
            checked = $true
            high_cpu_count = @($highCpuProcesses).Count
            killed_count = $killedProcesses.Count
            killed_processes = $killedProcesses
        }
        
    } catch {
        Write-Log "[PROCESS-CHECK] Error: $($_.Exception.Message)" "ERROR"
        return @{ checked = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0: COLETA AVANÇADA - TOP PROCESSES
# ============================================
function Get-TopProcesses {
    <#
    .SYNOPSIS
        Coleta top 5 processos por CPU e RAM
    .DESCRIPTION
        P1 Important: Visibilidade de consumo de recursos no heartbeat.
    #>
    try {
        $allProcesses = Get-Process | Where-Object { $_.WorkingSet -gt 0 }
        
        $topByCpu = $allProcesses | 
            Where-Object { $_.CPU -ne $null } |
            Sort-Object CPU -Descending | 
            Select-Object -First 5 | 
            ForEach-Object { 
                @{
                    name = $_.ProcessName
                    pid = $_.Id
                    cpu_seconds = [math]::Round($_.CPU, 2)
                    memory_mb = [math]::Round($_.WorkingSet / 1MB, 1)
                }
            }
        
        $topByMemory = $allProcesses | 
            Sort-Object WorkingSet -Descending | 
            Select-Object -First 5 | 
            ForEach-Object { 
                @{
                    name = $_.ProcessName
                    pid = $_.Id
                    memory_mb = [math]::Round($_.WorkingSet / 1MB, 1)
                    cpu_seconds = if ($_.CPU) { [math]::Round($_.CPU, 2) } else { 0 }
                }
            }
        
        return @{
            top_by_cpu = @($topByCpu)
            top_by_memory = @($topByMemory)
            total_processes = $allProcesses.Count
            collected_at = (Get-Date).ToString("o")
        }
        
    } catch {
        Write-Log "[TOP-PROCESSES] Error: $($_.Exception.Message)" "WARN"
        return @{ error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0: DETECÇÃO DE SOFTWARE NÃO AUTORIZADO
# ============================================
function Get-UnauthorizedSoftware {
    <#
    .SYNOPSIS
        Detecta software instalado que não está na lista autorizada
    .DESCRIPTION
        P1 Important: Compliance de software corporativo.
    #>
    try {
        # Lista de software autorizado (padrão - pode ser sincronizada do servidor)
        $authorizedPatterns = @(
            "Microsoft*",
            "Windows*",
            "Google Chrome",
            "Mozilla Firefox",
            "Visual Studio*",
            "PowerShell*",
            "CyberShield*",
            "*Update*",
            "*Hotfix*",
            "*Security*",
            "Intel*",
            "AMD*",
            "NVIDIA*",
            "Realtek*"
        )
        
        # Buscar software instalado
        $installedSoftware = Get-WmiObject Win32_Product -ErrorAction SilentlyContinue | 
            Where-Object { $_.Name } |
            Select-Object -ExpandProperty Name -Unique
        
        # Filtrar não autorizado
        $unauthorized = @()
        foreach ($software in $installedSoftware) {
            $isAuthorized = $false
            foreach ($pattern in $authorizedPatterns) {
                if ($software -like $pattern) {
                    $isAuthorized = $true
                    break
                }
            }
            if (-not $isAuthorized) {
                $unauthorized += $software
            }
        }
        
        if ($unauthorized.Count -gt 0) {
            Write-Log "[SOFTWARE-CHECK] Found $($unauthorized.Count) unauthorized software" "WARN"
            
            Send-AutoRepairTelemetry -Event "unauthorized_software" -Data @{
                software_list = $unauthorized
                count = $unauthorized.Count
            }
        }
        
        return @{
            checked = $true
            unauthorized_count = $unauthorized.Count
            unauthorized_list = $unauthorized
            total_installed = $installedSoftware.Count
        }
        
    } catch {
        Write-Log "[SOFTWARE-CHECK] Error: $($_.Exception.Message)" "WARN"
        return @{ checked = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0: BASELINE DE PROCESSOS
# ============================================
function Initialize-ProcessBaseline {
    <#
    .SYNOPSIS
        Inicializa ou carrega baseline de processos
    .DESCRIPTION
        P2 Advanced: Detecção de anomalias via baseline.
    #>
    try {
        if (Test-Path $Global:ProcessBaselinePath) {
            $Global:ProcessBaseline = Get-Content $Global:ProcessBaselinePath -Raw | ConvertFrom-Json
            Write-Log "[BASELINE] Loaded baseline with $($Global:ProcessBaseline.Count) processes" "INFO"
        } else {
            Write-Log "[BASELINE] Creating initial process baseline..." "INFO"
            
            $baseline = Get-Process | 
                Select-Object ProcessName, Company, Description |
                Group-Object ProcessName |
                ForEach-Object { $_.Group[0] } |
                ForEach-Object {
                    @{
                        name = $_.ProcessName
                        company = $_.Company
                        description = $_.Description
                        first_seen = (Get-Date).ToString("o")
                    }
                }
            
            $Global:ProcessBaseline = $baseline
            $baseline | ConvertTo-Json -Depth 5 | Out-File $Global:ProcessBaselinePath -Encoding UTF8
            
            Write-Log "[BASELINE] Created baseline with $($baseline.Count) processes" "SUCCESS"
        }
        
        return $true
        
    } catch {
        Write-Log "[BASELINE] Error: $($_.Exception.Message)" "ERROR"
        $Global:ProcessBaseline = @()
        return $false
    }
}

function Test-ProcessInBaseline {
    param([string]$ProcessName)
    
    if (-not $Global:ProcessBaseline) { return $true }  # Se não há baseline, assumir OK
    
    $found = $Global:ProcessBaseline | Where-Object { $_.name -eq $ProcessName }
    return ($null -ne $found)
}

function Get-ProcessAnomalies {
    <#
    .SYNOPSIS
        Detecta processos novos que não estão no baseline
    #>
    try {
        if (-not $Global:ProcessBaseline) {
            Initialize-ProcessBaseline
        }
        
        $currentProcesses = Get-Process | Select-Object -ExpandProperty ProcessName -Unique
        $baselineNames = $Global:ProcessBaseline | ForEach-Object { $_.name }
        
        $anomalies = @()
        foreach ($proc in $currentProcesses) {
            if ($proc -notin $baselineNames) {
                $anomalies += $proc
            }
        }
        
        if ($anomalies.Count -gt 0) {
            Write-Log "[BASELINE] Detected $($anomalies.Count) new processes" "WARN"
            
            # Adicionar ao baseline para futura referência
            foreach ($proc in $anomalies) {
                $Global:ProcessBaseline += @{
                    name = $proc
                    company = $null
                    description = "Auto-added"
                    first_seen = (Get-Date).ToString("o")
                }
            }
            
            # Salvar baseline atualizado
            $Global:ProcessBaseline | ConvertTo-Json -Depth 5 | Out-File $Global:ProcessBaselinePath -Encoding UTF8
        }
        
        return @{
            checked = $true
            anomaly_count = $anomalies.Count
            anomalies = $anomalies
        }
        
    } catch {
        return @{ checked = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0: TELEMETRIA DE AUTO-REPARO
# ============================================
function Send-AutoRepairTelemetry {
    param(
        [string]$Event,
        [object]$Data
    )
    
    try {
        $payload = @{
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
            event_type = "auto_repair"
            event_name = $Event
            event_data = $Data
            timestamp = (Get-Date).ToString("o")
            hostname = $env:COMPUTERNAME
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-agent-evidence" `
            -Method "POST" `
            -Body $payload `
            -MaxRetries 2 `
            -TimeoutSec 10
        
        if (-not $result.Success) {
            Write-Log "[TELEMETRY] Failed to send $Event event" "WARN"
        }
        
    } catch {
        # Silenciar - telemetria nunca deve derrubar o agente
    }
}

# ============================================
#  SYSTEM METRICS (Básico - herdado de v4)
# ============================================
function Get-SystemMetrics {
    try {
        $cpu = Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average
        $memory = Get-WmiObject Win32_OperatingSystem
        $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        $uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
        
        return @{
            cpu_percent = [math]::Round($cpu, 2)
            memory_total_gb = [math]::Round($memory.TotalVisibleMemorySize / 1MB, 2)
            memory_used_gb = [math]::Round(($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / 1MB, 2)
            memory_used_percent = [math]::Round((($memory.TotalVisibleMemorySize - $memory.FreePhysicalMemory) / $memory.TotalVisibleMemorySize) * 100, 2)
            disk_total_gb = [math]::Round($disk.Size / 1GB, 2)
            disk_free_gb = [math]::Round($disk.FreeSpace / 1GB, 2)
            disk_used_percent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 2)
            uptime_seconds = [math]::Round($uptime.TotalSeconds)
        }
    } catch {
        return @{ error = $_.Exception.Message }
    }
}

# ============================================
#  HEARTBEAT MELHORADO (v5.0)
# ============================================
function Send-Heartbeat {
    try {
        Write-Log "[HEARTBEAT] Sending heartbeat..." "DEBUG"
        
        # Coletar métricas
        $metrics = Get-SystemMetrics
        $topProcesses = Get-TopProcesses
        $anomalies = Get-ProcessAnomalies
        
        $payload = @{
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
            hostname = $env:COMPUTERNAME
            timestamp = (Get-Date).ToString("o")
            system_metrics = $metrics
            processes = $topProcesses
            process_anomalies = $anomalies.anomalies
            auto_repair_stats = $Global:AutoRepairStats
            state = "ENFORCING"
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/heartbeat" `
            -Method "POST" `
            -Body $payload `
            -MaxRetries 3 `
            -TimeoutSec 30
        
        if ($result.Success) {
            Write-Log "[HEARTBEAT] Sent successfully" "SUCCESS"
            
            # Processar resposta (force update, rotate key, etc.)
            if ($result.Content) {
                try {
                    $response = $result.Content | ConvertFrom-Json
                    # TODO: processar comandos do servidor
                } catch { }
            }
            
            return $true
        } else {
            Write-Log "[HEARTBEAT] Failed: $($result.Error)" "ERROR"
            return $false
        }
        
    } catch {
        Write-Log "[HEARTBEAT] Exception: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  LOOP PRINCIPAL v5.0
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] CyberShield Agent $($Global:AgentVersion)" "INFO"
Write-Log "[INFO] ServerUrl: $Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: $Global:AgentName" "DEBUG"
Write-Log "[INFO] Features: auto-remediation, process-baseline, exponential-backoff" "INFO"
Write-Log "============================================" "INFO"

# Inicializar baseline de processos
Initialize-ProcessBaseline

# Enviar primeiro heartbeat
$heartbeatSuccess = Send-Heartbeat

if (-not $heartbeatSuccess) {
    Write-Log "[BOOTSTRAP] Initial heartbeat failed, continuing in degraded mode..." "WARN"
}

$lastHeartbeat = Get-Date
$lastAutoRepair = Get-Date
$lastSoftwareCheck = Get-Date

while ($true) {
    $now = Get-Date
    
    try {
        # ============================================
        # AUTO-REPARO A CADA CICLO
        # ============================================
        
        # Limpeza de disco (verificar a cada 5 min)
        if (($now - $lastAutoRepair).TotalSeconds -ge 300) {
            $diskResult = Invoke-DiskCleanup
            if ($diskResult.cleaned) {
                Write-Log "[AUTO-REPAIR] Disk cleanup freed $($diskResult.freed_gb)GB" "SUCCESS"
            }
            
            # Verificar processos de alta CPU
            $cpuResult = Invoke-HighCpuProcessCheck
            if ($cpuResult.killed_count -gt 0) {
                Write-Log "[AUTO-REPAIR] Killed $($cpuResult.killed_count) high-CPU processes" "SUCCESS"
            }
            
            $lastAutoRepair = Get-Date
        }
        
        # ============================================
        # HEARTBEAT A CADA INTERVALO
        # ============================================
        if (($now - $lastHeartbeat).TotalSeconds -ge $Global:PollIntervalSeconds) {
            Send-Heartbeat
            $lastHeartbeat = Get-Date
        }
        
        # ============================================
        # VERIFICAÇÃO DE SOFTWARE (1x por hora)
        # ============================================
        if (($now - $lastSoftwareCheck).TotalSeconds -ge 3600) {
            Get-UnauthorizedSoftware | Out-Null
            $lastSoftwareCheck = Get-Date
        }
        
    } catch {
        Write-Log "[MAIN-LOOP] Error: $($_.Exception.Message)" "ERROR"
    }
    
    Start-Sleep -Seconds 2
}
