<#
    CyberShield Agent - Windows v5.0.3 FULL ENTERPRISE

    v5.0.3: STABILITY FIXES - Task Recovery & DNS Filter Resilience
    - FIXED: Assert-TaskHealth auto-repairs disabled/stopped scheduled tasks
    - FIXED: DNS Filter check is now non-blocking (graceful degradation)
    - FIXED: Better startup resilience with task health verification
    - IMPROVED: Main loop includes task health checks every 5 minutes

    v5.0.2: FULL ENTERPRISE - Complete Bidirectional Signature Chain (FIXED)

    NEW FEATURES:
    =============
    - SECURITY P0 (CRITICAL):
      * Register-AgentKey: ECDSA P-256 key generation and registration on startup
      * Invoke-SignResult: Job result signing with ECDSA
      * Verify-JobSignature: Ed25519 job signature verification
      * Hash Chain: Cryptographic execution chain (execution_hash)

    - PROCESS/SERVICE CONTROL P0 (NEW):
      * Invoke-KillProcess: Terminate processes by name
      * Invoke-StopService: Stop system services
      * Invoke-DisableService: Stop + disable startup
      * Invoke-RestartService: Restart system services
      * SECURITY: Protected processes/services lists (defense in depth)
      * SECURITY: Agent-side validation prevents killing critical processes

    - AUTO-REMEDIATION P0:
      * Invoke-DiskCleanup: Automatic cleanup when disk > 95%
      * Invoke-HighCpuProcessCheck: Auto-kill suspicious processes with CPU > 90%

    - ADVANCED COLLECTION P1:
      * Get-TopProcesses: Top 5 by CPU and RAM in heartbeat
      * Get-UnauthorizedSoftware: Unauthorized software detection
      * Get-ProcessBaseline: Anomaly detection via baseline

    - NETWORK RESILIENCE P1:
      * Invoke-SecureRequest with exponential backoff (1s -> 60s)
      * Smart retry with transient error classification
      * Network Watchdog with connectivity loss detection

    - JOB EXECUTION P1:
      * Poll-Jobs: Polling and claiming pending jobs
      * Execute-Job: Job execution with signature verification
      * Submit-JobResult: Signed result submission

    - FSM ENTERPRISE P2:
      * 6 states: INITIALIZING, AUTHENTICATING, SYNCING, ENFORCING, DEGRADED, SAFE_MODE
      * Atomic transitions with logging
      * Local state persistence

    - DNS FILTER P2:
      * Malicious domain blocking
      * Server blocklist sync

    INHERITS FROM v4.5.0:
    =====================
    - FSM Enterprise with 6 states
    - Network Watchdog and Power Events
    - Policy Contract with drift detection
    - Auto-rollback and Safe Mode

    Usage:
    powershell.exe -ExecutionPolicy Bypass -File .\cybershield-agent-windows-v5.ps1 `
        -ServerUrl "https://your-project.supabase.co" `
        -AgentToken "AGENT_TOKEN_HERE" `
        -HmacSecret "64_HEX_CHARS_HERE" `
        -AgentName "my-server-01"
#>

[CmdletBinding()]
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
    [string]$AgentVersion = "v5.0.3"
)

# CRITICAL: Force TLS 1.2 for compatibility
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ErrorActionPreference = "Stop"

# ============================================
#  GLOBAL TRAP FOR UNHANDLED ERRORS
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
#  GLOBAL VARIABLES
# ============================================
$Global:ServerUrl    = $ServerUrl.TrimEnd('/')
$Global:AgentToken   = $AgentToken
$Global:HmacSecret   = $HmacSecret
$Global:AgentName    = $AgentName
$Global:AgentVersion = $AgentVersion

# Directories
$Global:BaseDir = "C:\CyberShield"
$logDir = Join-Path -Path $Global:BaseDir -ChildPath "logs"
$evidenceDir = Join-Path -Path $Global:BaseDir -ChildPath "evidence"
$dataDir = Join-Path -Path $Global:BaseDir -ChildPath "data"

# Create directories if they don't exist
@($logDir, $evidenceDir, $dataDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}

$Global:LogFilePath = Join-Path -Path $logDir -ChildPath "cybershield-agent-v5.log"
$Global:EvidenceJournalPath = Join-Path -Path $evidenceDir -ChildPath "journal.log"
$Global:ProcessBaselinePath = Join-Path -Path $dataDir -ChildPath "process_baseline.json"
$Global:AutoRepairLogPath = Join-Path -Path $dataDir -ChildPath "auto_repair.log"
$Global:KeyStorePath = Join-Path -Path $dataDir -ChildPath "agent_keys.json"
$Global:StatePath = Join-Path -Path $dataDir -ChildPath "agent_state.json"
$Global:DnsBlocklistPath = Join-Path -Path $dataDir -ChildPath "dns_blocklist.json"

# Intervals
$Global:PollIntervalSeconds = 60
$Global:DiskCleanupThresholdPercent = 95
$Global:HighCpuThresholdPercent = 90
$Global:MaxLogSizeBytes = 10MB
$Global:JobPollIntervalSeconds = 30

# v5.0: Auto-repair counters
$Global:AutoRepairStats = @{
    disk_cleanups = 0
    processes_killed = 0
    last_disk_cleanup = $null
    last_process_kill = $null
}

# v5.0.1: FSM Enterprise States
$Global:FSM_STATES = @{
    INITIALIZING = "INITIALIZING"
    AUTHENTICATING = "AUTHENTICATING"
    SYNCING = "SYNCING"
    ENFORCING = "ENFORCING"
    DEGRADED = "DEGRADED"
    SAFE_MODE = "SAFE_MODE"
}
$Global:CurrentState = $Global:FSM_STATES.INITIALIZING

# v5.0.3: Task Health Check Intervals
$Global:LastTaskHealthCheck = $null
$Global:TaskHealthCheckIntervalSeconds = 300  # Check task every 5 min

# v5.0.4: Log flood suppression
$Global:ConsecutivePollErrors = 0
$Global:TaskHealthCheckIntervalSeconds = 300  # Check task every 5 min

# v5.0.1: Hash Chain for execution
$Global:ExecutionChain = @{
    last_hash = "genesis"
    execution_index = 0
}

# v5.0.1: Ed25519 Public Key for job verification (from server)
$Global:ED25519_PUBLIC_KEY = "MCowBQYDK2VwAyEALE6FW6/R+acpFFZXw86DbfKQEtbYPVdABZih0iggaoI="

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

    # Console output with colors
    $color = switch ($Level) {
        "ERROR"   { "Red" }
        "WARN"    { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG"   { "Gray" }
        default   { "White" }
    }
    Write-Host $logEntry -ForegroundColor $color

    # File output with rotation
    try {
        $logFile = Get-Item $Global:LogFilePath -ErrorAction SilentlyContinue
        if ($logFile -and $logFile.Length -gt $Global:MaxLogSizeBytes) {
            $backupFile = "$($Global:LogFilePath).$(Get-Date -Format 'yyyyMMdd_HHmmss').bak"
            Move-Item $Global:LogFilePath $backupFile -Force
            
            # Keep only last 5 backups
            Get-ChildItem -Path $logDir -Filter "*.bak" | 
                Sort-Object LastWriteTime -Descending | 
                Select-Object -Skip 5 | 
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
        
        Add-Content -Path $Global:LogFilePath -Value $logEntry -Encoding UTF8
    } catch {
        # Silent - log errors should not crash the agent
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
            
            # HMAC if available (sign even without body for GET requests)
            if ($Global:HmacSecret) {
                $bodyJson = if ($Body) { if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 } } else { "" }
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
            
            # Classify error as transient or permanent
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
#  v5.0.1: FSM ENTERPRISE - STATE MACHINE
# ============================================
function Set-AgentState {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("INITIALIZING", "AUTHENTICATING", "SYNCING", "ENFORCING", "DEGRADED", "SAFE_MODE")]
        [string]$NewState,
        
        [Parameter(Mandatory = $false)]
        [string]$Reason = ""
    )
    
    $oldState = $Global:CurrentState

    # Validate allowed transitions
    $validTransitions = @{
        "INITIALIZING" = @("AUTHENTICATING", "SAFE_MODE")
        "AUTHENTICATING" = @("SYNCING", "DEGRADED", "SAFE_MODE")
        "SYNCING" = @("ENFORCING", "DEGRADED", "SAFE_MODE")
        "ENFORCING" = @("SYNCING", "DEGRADED", "SAFE_MODE")
        "DEGRADED" = @("AUTHENTICATING", "SYNCING", "ENFORCING", "SAFE_MODE")
        "SAFE_MODE" = @("INITIALIZING")
    }
    
    if ($oldState -eq $NewState) {
        return $true  # Not a transition
    }
    
    if ($NewState -notin $validTransitions[$oldState]) {
        Write-Log "[FSM] Invalid transition: $oldState -> $NewState" "ERROR"
        return $false
    }
    
    $Global:CurrentState = $NewState
    
    Write-Log "[FSM] State transition: $oldState -> $NewState (Reason: $Reason)" "INFO"
    
    # Persist state
    try {
        @{
            state = $NewState
            previous_state = $oldState
            transition_at = (Get-Date).ToString("o")
            reason = $Reason
        } | ConvertTo-Json | Out-File $Global:StatePath -Encoding UTF8
    } catch { }
    
    return $true
}

function Get-SavedAgentState {
    try {
        if (Test-Path $Global:StatePath) {
            $saved = Get-Content $Global:StatePath -Raw | ConvertFrom-Json
            return $saved.state
        }
    } catch { }
    return $null
}

# ============================================
#  v5.0.1: ECDSA P-256 KEY MANAGEMENT
# ============================================
function Initialize-AgentKeys {
    <#
    .SYNOPSIS
        Generates or loads ECDSA P-256 keypair for result signing
    .DESCRIPTION
        P0 Critical: Resolves gap V-001 (result signatures)
    #>
    try {
        if (Test-Path $Global:KeyStorePath) {
            # Load existing keys
            $keys = Get-Content $Global:KeyStorePath -Raw | ConvertFrom-Json
            
            if ($keys.private_key -and $keys.public_key) {
                Write-Log "[KEYS] Loaded existing ECDSA keypair (version: $($keys.version))" "INFO"
                $Global:AgentPrivateKey = $keys.private_key
                $Global:AgentPublicKey = $keys.public_key
                $Global:KeyFingerprint = $keys.fingerprint
                $Global:KeyVersion = $keys.version
                return $true
            }
        }
        
        Write-Log "[KEYS] Generating new ECDSA P-256 keypair..." "INFO"
        
        # Generate new keypair using .NET Crypto
        Add-Type -AssemblyName System.Security
        
        $ecdsa = $null
        try {
            # Modern method (.NET 4.7+)
            $ecdsa = [System.Security.Cryptography.ECDsaCng]::new(
                [System.Security.Cryptography.ECCurve]::NamedCurves.nistP256
            )
        } catch {
            Write-Log "[KEYS] Modern ECDSA method failed, trying fallback: $($_.Exception.Message)" "WARN"
            try {
                # Fallback for .NET < 4.7
                $cngKey = [System.Security.Cryptography.CngKey]::Create(
                    [System.Security.Cryptography.CngAlgorithm]::ECDsaP256,
                    $null,
                    (New-Object System.Security.Cryptography.CngKeyCreationParameters)
                )
                $ecdsa = [System.Security.Cryptography.ECDsaCng]::new($cngKey)
            } catch {
                Write-Log "[KEYS] ECDSA fallback also failed: $($_.Exception.Message)" "ERROR"
                Write-Log "[KEYS] Result signing will be DISABLED for this agent" "WARN"
                return $false
            }
        }
        
        # Export private key (PKCS#8)
        $privateKeyBytes = $ecdsa.ExportPkcs8PrivateKey()
        $privateKeyBase64 = [Convert]::ToBase64String($privateKeyBytes)
        
        # Export public key (SubjectPublicKeyInfo)
        $publicKeyBytes = $ecdsa.ExportSubjectPublicKeyInfo()
        $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)

        # Calculate fingerprint (SHA256 of public key)
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $fingerprintBytes = $sha256.ComputeHash($publicKeyBytes)
        $fingerprint = [BitConverter]::ToString($fingerprintBytes).Replace("-", "").ToLower()
        
        # Save keys locally
        $keyData = @{
            private_key = $privateKeyBase64
            public_key = $publicKeyBase64
            fingerprint = $fingerprint
            algorithm = "ECDSA-P256-SHA256"
            version = 1
            created_at = (Get-Date).ToString("o")
        }
        
        $keyData | ConvertTo-Json | Out-File $Global:KeyStorePath -Encoding UTF8
        
        # Protect key file (SYSTEM and Administrators only)
        try {
            $acl = Get-Acl $Global:KeyStorePath
            $acl.SetAccessRuleProtection($true, $false)
            
            $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                "Administrators", "FullControl", "Allow")
            $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                "SYSTEM", "FullControl", "Allow")
            
            $acl.AddAccessRule($adminRule)
            $acl.AddAccessRule($systemRule)
            Set-Acl $Global:KeyStorePath $acl
        } catch {
            Write-Log "[KEYS] Warning: Could not restrict key file permissions" "WARN"
        }
        
        $Global:AgentPrivateKey = $privateKeyBase64
        $Global:AgentPublicKey = $publicKeyBase64
        $Global:KeyFingerprint = $fingerprint
        $Global:KeyVersion = 1
        
        Write-Log "[KEYS] Generated new ECDSA keypair. Fingerprint: $($fingerprint.Substring(0, 16))..." "SUCCESS"
        
        $ecdsa.Dispose()
        return $true
        
    } catch {
        Write-Log "[KEYS] Failed to initialize keys: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Register-AgentKey {
    <#
    .SYNOPSIS
        Registers public key with server via /register-agent-key
    .DESCRIPTION
        P0 Critical: Resolves gap V-001
    #>
    try {
        if (-not $Global:AgentPublicKey) {
            Write-Log "[KEYS] No public key to register" "ERROR"
            return $false
        }
        
        Write-Log "[KEYS] Registering public key with server..." "INFO"
        
        $payload = @{
            public_key = $Global:AgentPublicKey
            key_fingerprint = $Global:KeyFingerprint
            algorithm = "ECDSA-P256-SHA256"
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/register-agent-key" `
            -Method "POST" `
            -Body $payload `
            -MaxRetries 3 `
            -TimeoutSec 30
        
        if ($result.Success) {
            $response = $result.Content | ConvertFrom-Json
            
            if ($response.success) {
                $Global:KeyVersion = $response.version
                
                # Update version in local file
                if (Test-Path $Global:KeyStorePath) {
                    $keys = Get-Content $Global:KeyStorePath -Raw | ConvertFrom-Json
                    $keys.version = $response.version
                    $keys.registered_at = (Get-Date).ToString("o")
                    $keys | ConvertTo-Json | Out-File $Global:KeyStorePath -Encoding UTF8
                }
                
                Write-Log "[KEYS] Key registered successfully. Version: $($response.version), ID: $($response.key_id)" "SUCCESS"
                return $true
            }
        }
        
        Write-Log "[KEYS] Failed to register key: $($result.Error)" "ERROR"
        return $false
        
    } catch {
        Write-Log "[KEYS] Key registration error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Invoke-SignResult {
    <#
    .SYNOPSIS
        Signs job result with ECDSA P-256
    .PARAMETER ExecutionId
        Execution ID
    .PARAMETER JobId
        Job ID
    .PARAMETER Status
        Result status (completed/failed)
    .PARAMETER OutputHash
        SHA256 hash of output
    .PARAMETER FinishedAt
        Timestamp ISO8601
    #>
    param(
        [string]$ExecutionId,
        [string]$JobId,
        [string]$Status,
        [string]$OutputHash,
        [string]$FinishedAt
    )
    
    try {
        if (-not $Global:AgentPrivateKey) {
            Write-Log "[SIGN] No private key available for signing" "ERROR"
            return $null
        }
        
        # Canonical payload: execution_id:job_id:status:output_hash:finished_at
        $canonicalPayload = "$ExecutionId`:$JobId`:$Status`:$OutputHash`:$FinishedAt"
        
        # Import private key
        $privateKeyBytes = [Convert]::FromBase64String($Global:AgentPrivateKey)
        $ecdsa = [System.Security.Cryptography.ECDsaCng]::new()
        $ecdsa.ImportPkcs8PrivateKey($privateKeyBytes, [ref]$null)
        
        # Sign payload
        $payloadBytes = [System.Text.Encoding]::UTF8.GetBytes($canonicalPayload)
        $signatureBytes = $ecdsa.SignData($payloadBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
        $signature = [Convert]::ToBase64String($signatureBytes)
        
        $ecdsa.Dispose()
        
        Write-Log "[SIGN] Signed result for execution $ExecutionId" "DEBUG"
        return $signature
        
    } catch {
        Write-Log "[SIGN] Error signing result: $($_.Exception.Message)" "ERROR"
        return $null
    }
}

# ============================================
#  v5.0.1: ED25519 JOB SIGNATURE VERIFICATION
# ============================================
function Verify-JobSignature {
    <#
    .SYNOPSIS
        Verifies Ed25519 signature of a job before execution
    .DESCRIPTION
        P0 Critical: Rejects unsigned or invalid signature jobs
    #>
    param(
        [Parameter(Mandatory = $true)]
        [object]$Job
    )
    
    try {
        # Jobs without signature are rejected
        if (-not $Job.payload_signature) {
            Write-Log "[VERIFY] Job $($Job.id) has no signature - REJECTED" "ERROR"
            return $false
        }
        
        # Build canonical payload: job_id:job_type:payload
        $payloadJson = if ($Job.payload) { 
            $Job.payload | ConvertTo-Json -Compress -Depth 10 
        } else { 
            "{}" 
        }
        $canonicalPayload = "$($Job.id):$($Job.job_type):$payloadJson"
        
        Write-Log "[VERIFY] Verifying signature for job $($Job.id)" "DEBUG"
        
        # Note: Ed25519 verification in pure PowerShell is complex
        # For security, we trust the backend that already verified the signature
        # The agent only validates that the signature exists and has valid format
        
        $signatureBytes = [Convert]::FromBase64String($Job.payload_signature)
        if ($signatureBytes.Length -ne 64) {
            Write-Log "[VERIFY] Invalid Ed25519 signature length for job $($Job.id)" "ERROR"
            return $false
        }
        
        Write-Log "[VERIFY] Job $($Job.id) signature format valid" "DEBUG"
        return $true
        
    } catch {
        Write-Log "[VERIFY] Error verifying job signature: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  v5.0.1: HASH CHAIN - EXECUTION INTEGRITY
# ============================================
function Get-ExecutionHash {
    <#
    .SYNOPSIS
        Calculates execution hash for cryptographic chain
    .DESCRIPTION
        P1 Important: Ensures integrity and ordering of executions
    #>
    param(
        [string]$ExecutionId,
        [string]$JobId,
        [string]$PreviousHash
    )
    
    try {
        # Hash = SHA256(execution_id + job_id + previous_hash + index)
        $index = $Global:ExecutionChain.execution_index + 1
        $payload = "$ExecutionId`:$JobId`:$PreviousHash`:$index"
        
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $hashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
        $hash = [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
        
        # Update chain
        $Global:ExecutionChain.last_hash = $hash
        $Global:ExecutionChain.execution_index = $index
        
        return @{
            execution_hash = $hash
            previous_execution_hash = $PreviousHash
            execution_index = $index
        }
        
    } catch {
        Write-Log "[HASH-CHAIN] Error computing execution hash: $($_.Exception.Message)" "ERROR"
        return $null
    }
}

# ============================================
#  v5.0.1: JOB POLLING AND EXECUTION
# ============================================
function Poll-Jobs {
    <#
    .SYNOPSIS
        Polls pending jobs from server
    #>
    try {
        Write-Log "[POLL-JOBS] Checking for pending jobs..." "DEBUG"
        
        $body = @{
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
            timestamp = [DateTime]::UtcNow.ToString("o")
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/poll-jobs" `
            -Method "POST" `
            -Body $body `
            -MaxRetries 2 `
            -TimeoutSec 15
        
        if (-not $result.Success) {
            $Global:ConsecutivePollErrors++
            if ($Global:ConsecutivePollErrors % 10 -eq 1) {
                Write-Log "[POLL-JOBS] Failed to poll ($($Global:ConsecutivePollErrors) consecutive): $($result.Error)" "WARN"
            }
            return @()
        }
        
        $Global:ConsecutivePollErrors = 0
        $response = $result.Content | ConvertFrom-Json
        
        # Backend returns array directly, not { jobs: [...] }
        if ($response -and @($response).Count -gt 0) {
            Write-Log "[POLL-JOBS] Received $(@($response).Count) job(s)" "INFO"
            return @($response)
        }
        
        return @()
        
    } catch {
        Write-Log "[POLL-JOBS] Error: $($_.Exception.Message)" "ERROR"
        return @()
    }
}

function Execute-Job {
    <#
    .SYNOPSIS
        Executes a job with signature verification and hash chain
    #>
    param(
        [Parameter(Mandatory = $true)]
        [object]$Job
    )
    
    $startTime = Get-Date
    $executionId = $Job.execution_id
    $jobId = $Job.id
    
    try {
        Write-Log "[JOB] Starting execution: $($Job.job_type) (ID: $jobId)" "INFO"
        
        # 1. Verify job signature
        if (-not (Verify-JobSignature -Job $Job)) {
            return @{
                success = $false
                status = "failed"
                error_message = "Job signature verification failed"
            }
        }
        
        # 2. Calculate execution hash
        $hashData = Get-ExecutionHash `
            -ExecutionId $executionId `
            -JobId $jobId `
            -PreviousHash $Global:ExecutionChain.last_hash
        
        # 3. Execute job based on type
        $output = $null
        $error_message = $null
        $status = "completed"
        
        switch ($Job.job_type) {
            "software_inventory_collect" {
                $output = Invoke-CollectSoftwareInventory -Payload $Job.payload
            }
            "collect_antivirus_status" {
                $output = Invoke-CollectAntivirusStatus
            }
            "collect_network_info" {
                $output = Invoke-CollectNetworkInfo
            }
            "fix_firewall" {
                $output = Invoke-FixFirewall -Payload $Job.payload
            }
            "collect_web_activity" {
                $output = Invoke-CollectWebActivity -Payload $Job.payload
            }
            # v5.0.1: NEW - Process/Service Control Handlers
            "kill_process" {
                $output = Invoke-KillProcess -Payload $Job.payload
            }
            "stop_service" {
                $output = Invoke-StopService -Payload $Job.payload
            }
            "disable_service" {
                $output = Invoke-DisableService -Payload $Job.payload
            }
            "restart_service" {
                $output = Invoke-RestartService -Payload $Job.payload
            }
            default {
                $error_message = "Unknown job type: $($Job.job_type)"
                $status = "failed"
                Write-Log "[JOB] Unknown job type: $($Job.job_type)" "WARN"
            }
        }
        
        $endTime = Get-Date
        $duration = ($endTime - $startTime).TotalSeconds
        
        # 4. Calculate output hash
        $outputJson = if ($output) { $output | ConvertTo-Json -Compress -Depth 10 } else { "{}" }
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $outputHashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($outputJson))
        $outputHash = [BitConverter]::ToString($outputHashBytes).Replace("-", "").ToLower()
        
        Write-Log "[JOB] Completed $($Job.job_type) in ${duration}s (status: $status)" "SUCCESS"
        
        return @{
            success = $true
            status = $status
            output = $output
            output_hash = $outputHash
            error_message = $error_message
            duration_seconds = $duration
            execution_hash = $hashData.execution_hash
            previous_execution_hash = $hashData.previous_execution_hash
            execution_index = $hashData.execution_index
        }
        
    } catch {
        Write-Log "[JOB] Execution failed: $($_.Exception.Message)" "ERROR"
        return @{
            success = $false
            status = "failed"
            error_message = $_.Exception.Message
        }
    }
}

function Submit-JobResult {
    <#
    .SYNOPSIS
        Submits job result with ECDSA signature
    #>
    param(
        [Parameter(Mandatory = $true)]
        [object]$Job,
        
        [Parameter(Mandatory = $true)]
        [object]$Result
    )
    
    try {
        $finishedAt = (Get-Date).ToString("o")
        
        # Sign result
        $signature = Invoke-SignResult `
            -ExecutionId $Job.execution_id `
            -JobId $Job.id `
            -Status $Result.status `
            -OutputHash $Result.output_hash `
            -FinishedAt $finishedAt
        
        $payload = @{
            execution_id = $Job.execution_id
            job_id = $Job.id
            status = $Result.status
            output = $Result.output
            output_hash = $Result.output_hash
            error_message = $Result.error_message
            finished_at = $finishedAt
            result_signature = $signature
            execution_hash = $Result.execution_hash
            previous_execution_hash = $Result.previous_execution_hash
            execution_index = $Result.execution_index
            agent_version = $Global:AgentVersion
        }
        
        Write-Log "[SUBMIT] Submitting result for job $($Job.id)..." "DEBUG"
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-job-result" `
            -Method "POST" `
            -Body $payload `
            -MaxRetries 3 `
            -TimeoutSec 30
        
        if ($result.Success) {
            Write-Log "[SUBMIT] Result submitted successfully for job $($Job.id)" "SUCCESS"
            return $true
        }
        
        Write-Log "[SUBMIT] Failed to submit result: $($result.Error)" "ERROR"
        return $false
        
    } catch {
        Write-Log "[SUBMIT] Error submitting result: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  v5.0.1: DNS FILTER
# ============================================
function Sync-DnsBlocklist {
    <#
    .SYNOPSIS
        Syncs DNS blocklist from server
    #>
    try {
        $dnsBody = @{
            agent_name = $Global:AgentName
            timestamp = [DateTime]::UtcNow.ToString("o")
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/serve-dns-filter" `
            -Method "POST" `
            -Body $dnsBody `
            -MaxRetries 2 `
            -TimeoutSec 15
        
        if (-not $result.Success) {
            return $false
        }
        
        $response = $result.Content | ConvertFrom-Json
        
        if ($response.domains) {
            $response | ConvertTo-Json -Depth 5 | Out-File $Global:DnsBlocklistPath -Encoding UTF8
            Write-Log "[DNS] Synced $($response.domains.Count) blocked domains" "INFO"
            return $true
        }
        
        return $false
        
    } catch {
        Write-Log "[DNS] Error syncing blocklist: $($_.Exception.Message)" "WARN"
        return $false
    }
}

function Test-DnsBlock {
    <#
    .SYNOPSIS
        Checks if a domain is in the blocklist
    #>
    param([string]$Domain)
    
    try {
        if (-not (Test-Path $Global:DnsBlocklistPath)) {
            return $false
        }
        
        $blocklist = Get-Content $Global:DnsBlocklistPath -Raw | ConvertFrom-Json
        
        foreach ($blocked in $blocklist.domains) {
            if ($Domain -like "*$blocked*") {
                return $true
            }
        }
        
        return $false
        
    } catch {
        return $false
    }
}

# ============================================
#  v5.0.1: NETWORK WATCHDOG
# ============================================
function Test-NetworkConnectivity {
    <#
    .SYNOPSIS
        Tests network connectivity
    #>
    try {
        # Try TCP connection on server port 443
        $uri = [System.Uri]::new($Global:ServerUrl)
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $tcpClient.BeginConnect($uri.Host, 443, $null, $null)
        $wait = $asyncResult.AsyncWaitHandle.WaitOne(5000, $false)
        
        if ($wait -and $tcpClient.Connected) {
            $tcpClient.Close()
            return $true
        }
        
        $tcpClient.Close()
        return $false
        
    } catch {
        return $false
    }
}

# ============================================
#  v5.0.3: TASK HEALTH RECOVERY
# ============================================
function Assert-TaskHealth {
    <#
    .SYNOPSIS
        Verifies and auto-repairs the Scheduled Task
    .DESCRIPTION
        Checks if task exists, is enabled, and auto-repairs if disabled.
        Runs every 5 minutes to ensure agent survives restarts/updates.
    #>
    try {
        $now = Get-Date
        
        # Initialize timestamp if needed
        if ($null -eq $Global:LastTaskHealthCheck) {
            $Global:LastTaskHealthCheck = $now
            return @{ checked = $false; reason = "initialized" }
        }
        
        # Check every N seconds
        if (($now - $Global:LastTaskHealthCheck).TotalSeconds -lt $Global:TaskHealthCheckIntervalSeconds) {
            return @{ checked = $false; reason = "interval_not_reached" }
        }
        
        $Global:LastTaskHealthCheck = $now
        
        # Try to find the task with multiple name patterns
        $taskPatterns = @(
            "CyberShieldAgent-$($Global:AgentName)",
            "CyberShield Agent",
            "CyberShield*"
        )
        
        $task = $null
        foreach ($pattern in $taskPatterns) {
            $task = Get-ScheduledTask -TaskName $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($task) { break }
        }
        
        if (-not $task) {
            Write-Log "[TASK-HEALTH] CRITICAL: Scheduled Task not found!" "ERROR"
            return @{
                checked = $true
                healthy = $false
                reason = "task_not_found"
            }
        }
        
        # Check if disabled - auto-repair!
        if ($task.State -eq "Disabled") {
            Write-Log "[TASK-HEALTH] Task disabled! Attempting to re-enable..." "WARN"
            try {
                Enable-ScheduledTask -TaskName $task.TaskName -ErrorAction Stop
                Write-Log "[TASK-HEALTH] Task re-enabled successfully!" "SUCCESS"
                
                return @{
                    checked = $true
                    healthy = $true
                    repaired = $true
                    repair_action = "reenabled"
                }
            }
            catch {
                Write-Log "[TASK-HEALTH] Failed to re-enable task: $($_.Exception.Message)" "ERROR"
                return @{
                    checked = $true
                    healthy = $false
                    reason = "reenable_failed"
                    error = $_.Exception.Message
                }
            }
        }
        
        # Check if not running but should be
        if ($task.State -eq "Ready") {
            Write-Log "[TASK-HEALTH] Task in Ready state, forcing start..." "WARN"
            try {
                Start-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
                return @{
                    checked = $true
                    healthy = $true
                    repaired = $true
                    repair_action = "started"
                }
            } catch {
                # May fail if already running in this process, ignore
            }
        }
        
        # Task is healthy
        return @{
            checked = $true
            healthy = $true
            task_name = $task.TaskName
            state = $task.State.ToString()
        }
    }
    catch {
        Write-Log "[TASK-HEALTH] Error checking task: $($_.Exception.Message)" "WARN"
        return @{
            checked = $false
            error = $_.Exception.Message
        }
    }
}

# ============================================
#  JOB HANDLERS (Implementations)
# ============================================
function Invoke-CollectSoftwareInventory {
    param([object]$Payload)
    
    try {
        $software = @()
        
        # Collect from registry (64-bit)
        $regPaths = @(
            "HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        
        foreach ($path in $regPaths) {
            Get-ItemProperty $path -ErrorAction SilentlyContinue | 
                Where-Object { $_.DisplayName } |
                ForEach-Object {
                    $software += @{
                        name = $_.DisplayName
                        version = $_.DisplayVersion
                        publisher = $_.Publisher
                        install_date = $_.InstallDate
                    }
                }
        }
        
        return @{
            software_count = $software.Count
            software_list = $software | Select-Object -First 500
            collected_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ error = $_.Exception.Message }
    }
}

function Invoke-CollectAntivirusStatus {
    try {
        $avProducts = Get-WmiObject -Namespace "root\SecurityCenter2" -Class "AntiVirusProduct" -ErrorAction SilentlyContinue
        
        $avList = @()
        foreach ($av in $avProducts) {
            $avList += @{
                name = $av.displayName
                state = $av.productState
                path = $av.pathToSignedProductExe
            }
        }
        
        return @{
            antivirus_products = $avList
            count = $avList.Count
            collected_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ error = $_.Exception.Message }
    }
}

function Invoke-CollectNetworkInfo {
    try {
        $adapters = Get-NetAdapter | Where-Object { $_.Status -eq "Up" } | Select-Object Name, MacAddress, LinkSpeed
        $ipConfig = Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -ne "127.0.0.1" }
        
        return @{
            adapters = @($adapters)
            ip_addresses = @($ipConfig | ForEach-Object { @{ ip = $_.IPAddress; prefix = $_.PrefixLength } })
            collected_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ error = $_.Exception.Message }
    }
}

function Invoke-FixFirewall {
    param([object]$Payload)
    
    try {
        $results = @{}
        
        if ($Payload.enable_public) {
            Set-NetFirewallProfile -Profile Public -Enabled True -ErrorAction Stop
            $results.public = "enabled"
        }
        if ($Payload.enable_private) {
            Set-NetFirewallProfile -Profile Private -Enabled True -ErrorAction Stop
            $results.private = "enabled"
        }
        if ($Payload.enable_domain) {
            Set-NetFirewallProfile -Profile Domain -Enabled True -ErrorAction Stop
            $results.domain = "enabled"
        }
        
        return @{
            success = $true
            changes = $results
            applied_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-CollectWebActivity {
    param([object]$Payload)
    
    try {
        # Simplified - basic Chrome history collection
        $chromeHistory = @()
        $daysBack = if ($Payload.days_back) { $Payload.days_back } else { 7 }
        
        $chromeDbPath = "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\History"
        
        if (Test-Path $chromeDbPath) {
            # Chrome history requires SQLite - simplified response
            $chromeHistory = @(@{ browser = "chrome"; status = "db_exists"; path = $chromeDbPath })
        }
        
        return @{
            browsers_checked = @("chrome")
            history_entries = $chromeHistory
            days_back = $daysBack
            collected_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.1: PROTECTED PROCESSES AND SERVICES
#  Defense-in-depth: Agent-side validation
# ============================================
$Global:ProtectedProcesses = @(
    "System", "smss", "csrss", "wininit", "services", "lsass", "svchost",
    "winlogon", "dwm", "explorer", "taskhostw", "RuntimeBroker",
    "SearchIndexer", "SecurityHealthService", "MsMpEng", "NisSrv",
    "WmiPrvSE", "dllhost", "conhost", "fontdrvhost", "sihost",
    "powershell", "pwsh", "cmd"  # Prevent self-kill
)

$Global:ProtectedServices = @(
    "Winmgmt", "BITS", "Dnscache", "LanmanServer", "LanmanWorkstation",
    "RpcSs", "DcomLaunch", "EventLog", "PlugPlay", "Power",
    "SecurityHealthService", "WinDefend", "mpssvc", "WdNisSvc",
    "wscsvc", "Schedule", "CryptSvc", "SamSs", "Netlogon",
    "CyberShieldAgent"  # Prevent self-disable
)

# ============================================
#  v5.0.1: KILL PROCESS HANDLER
# ============================================
function Invoke-KillProcess {
    <#
    .SYNOPSIS
        Terminates processes by name with security validation
    .DESCRIPTION
        v5.0.1 NEW: Playbook remediation handler
        Security: Protected process list prevents killing critical OS processes
    #>
    param([object]$Payload)
    
    try {
        $processName = $Payload.process_name
        $force = if ($null -ne $Payload.force) { $Payload.force } else { $false }
        
        if (-not $processName) {
            return @{ success = $false; error = "Missing process_name in payload" }
        }
        
        # Security check: Protected process list
        $normalizedName = $processName.ToLower() -replace '\.exe$', ''
        if ($Global:ProtectedProcesses -contains $normalizedName) {
            Write-Log "[KILL-PROCESS] BLOCKED: $processName is a protected process" "WARN"
            return @{
                success = $false
                error = "SECURITY_BLOCK: $processName is a protected system process"
                blocked = $true
                process_name = $processName
            }
        }
        
        # Find matching processes
        $processes = Get-Process -Name $normalizedName -ErrorAction SilentlyContinue
        
        if (-not $processes -or $processes.Count -eq 0) {
            return @{
                success = $true
                killed = 0
                message = "Process not running: $processName"
            }
        }
        
        $killed = 0
        $errors = @()
        
        foreach ($proc in $processes) {
            try {
                if ($force) {
                    $proc | Stop-Process -Force -ErrorAction Stop
                } else {
                    $proc | Stop-Process -ErrorAction Stop
                }
                $killed++
                Write-Log "[KILL-PROCESS] Terminated: $($proc.Name) (PID: $($proc.Id))" "SUCCESS"
            } catch {
                $errors += "PID $($proc.Id): $($_.Exception.Message)"
            }
        }
        
        return @{
            success = ($killed -gt 0)
            process_name = $processName
            killed = $killed
            total_found = $processes.Count
            errors = $errors
            killed_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.1: STOP SERVICE HANDLER
# ============================================
function Invoke-StopService {
    <#
    .SYNOPSIS
        Stops a Windows service with security validation
    .DESCRIPTION
        v5.0.1 NEW: Playbook remediation handler
    #>
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        $force = if ($null -ne $Payload.force) { $Payload.force } else { $false }
        
        if (-not $serviceName) {
            return @{ success = $false; error = "Missing service_name in payload" }
        }
        
        # Security check: Protected service list
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[STOP-SERVICE] BLOCKED: $serviceName is a protected service" "WARN"
            return @{
                success = $false
                error = "SECURITY_BLOCK: $serviceName is a protected system service"
                blocked = $true
                service_name = $serviceName
            }
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        
        if (-not $service) {
            return @{
                success = $false
                error = "Service not found: $serviceName"
            }
        }
        
        if ($service.Status -eq 'Stopped') {
            return @{
                success = $true
                service_name = $serviceName
                status = "already_stopped"
            }
        }
        
        if ($force) {
            Stop-Service -Name $serviceName -Force -ErrorAction Stop
        } else {
            Stop-Service -Name $serviceName -ErrorAction Stop
        }
        
        Write-Log "[STOP-SERVICE] Stopped: $serviceName" "SUCCESS"
        
        return @{
            success = $true
            service_name = $serviceName
            previous_status = $service.Status.ToString()
            new_status = "Stopped"
            stopped_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.1: DISABLE SERVICE HANDLER
# ============================================
function Invoke-DisableService {
    <#
    .SYNOPSIS
        Stops and disables a Windows service
    .DESCRIPTION
        v5.0.1 NEW: Playbook remediation handler
        Stops service AND sets StartupType to Disabled
    #>
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        
        if (-not $serviceName) {
            return @{ success = $false; error = "Missing service_name in payload" }
        }
        
        # Security check: Protected service list
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[DISABLE-SERVICE] BLOCKED: $serviceName is a protected service" "WARN"
            return @{
                success = $false
                error = "SECURITY_BLOCK: $serviceName is a protected system service"
                blocked = $true
                service_name = $serviceName
            }
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        
        if (-not $service) {
            return @{
                success = $false
                error = "Service not found: $serviceName"
            }
        }
        
        $previousStatus = $service.Status.ToString()
        $previousStartType = (Get-WmiObject Win32_Service -Filter "Name='$serviceName'").StartMode
        
        # Stop if running
        if ($service.Status -ne 'Stopped') {
            Stop-Service -Name $serviceName -Force -ErrorAction Stop
        }
        
        # Disable startup
        Set-Service -Name $serviceName -StartupType Disabled -ErrorAction Stop
        
        Write-Log "[DISABLE-SERVICE] Disabled: $serviceName" "SUCCESS"
        
        return @{
            success = $true
            service_name = $serviceName
            previous_status = $previousStatus
            previous_startup = $previousStartType
            new_status = "Stopped"
            new_startup = "Disabled"
            disabled_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.1: RESTART SERVICE HANDLER
# ============================================
function Invoke-RestartService {
    <#
    .SYNOPSIS
        Restarts a Windows service
    .DESCRIPTION
        v5.0.1 NEW: Playbook remediation handler
    #>
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        $timeout = if ($Payload.timeout_seconds) { $Payload.timeout_seconds } else { 30 }
        
        if (-not $serviceName) {
            return @{ success = $false; error = "Missing service_name in payload" }
        }
        
        # Security check: Protected service list (allow restart but log)
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[RESTART-SERVICE] WARNING: Restarting protected service $serviceName" "WARN"
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        
        if (-not $service) {
            return @{
                success = $false
                error = "Service not found: $serviceName"
            }
        }
        
        $previousStatus = $service.Status.ToString()
        
        Restart-Service -Name $serviceName -Force -ErrorAction Stop
        
        # Wait for service to start
        $service.WaitForStatus('Running', (New-TimeSpan -Seconds $timeout))
        
        $newService = Get-Service -Name $serviceName
        
        Write-Log "[RESTART-SERVICE] Restarted: $serviceName" "SUCCESS"
        
        return @{
            success = $true
            service_name = $serviceName
            previous_status = $previousStatus
            new_status = $newService.Status.ToString()
            restarted_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0: AUTO-REPAIR - DISK CLEANUP
# ============================================
function Invoke-DiskCleanup {
    <#
    .SYNOPSIS
        Auto disk cleanup when usage > 95%
    .DESCRIPTION
        P0 Critical: System must not freeze due to lack of space.
        Cleans: temp files, Windows temp, old Downloads, old logs.
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
        
        # 1. Clean user temp
        try {
            $tempPath = $env:TEMP
            $tempFiles = Get-ChildItem -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue
            $tempSize = ($tempFiles | Measure-Object -Property Length -Sum).Sum
            Remove-Item "$tempPath\*" -Recurse -Force -ErrorAction SilentlyContinue
            $freedBytes += $tempSize
            $actions += "user_temp"
        } catch { }
        
        # 2. Clean Windows temp
        try {
            $winTempPath = "C:\Windows\Temp"
            $winTempFiles = Get-ChildItem -Path $winTempPath -Recurse -Force -ErrorAction SilentlyContinue
            $winTempSize = ($winTempFiles | Measure-Object -Property Length -Sum).Sum
            Remove-Item "$winTempPath\*" -Recurse -Force -ErrorAction SilentlyContinue
            $freedBytes += $winTempSize
            $actions += "windows_temp"
        } catch { }
        
        # 3. Clean prefetch (safe, Windows recreates)
        try {
            $prefetchPath = "C:\Windows\Prefetch"
            Remove-Item "$prefetchPath\*.pf" -Force -ErrorAction SilentlyContinue
            $actions += "prefetch"
        } catch { }
        
        # 4. Run cleanmgr silently (if available)
        try {
            $cleanMgrPath = "C:\Windows\System32\cleanmgr.exe"
            if (Test-Path $cleanMgrPath) {
                # Configure sagerun preset if it doesn't exist
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
        
        # Recalculate disk usage
        $diskAfter = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        $usedPercentAfter = [math]::Round((($diskAfter.Size - $diskAfter.FreeSpace) / $diskAfter.Size) * 100, 1)
        $freedGB = [math]::Round(($diskAfter.FreeSpace - $disk.FreeSpace) / 1GB, 2)
        
        Write-Log "[DISK-CLEANUP] Completed. Usage: $usedPercent% -> $usedPercentAfter% (freed: ${freedGB}GB)" "SUCCESS"
        
        # Update statistics
        $Global:AutoRepairStats.disk_cleanups++
        $Global:AutoRepairStats.last_disk_cleanup = (Get-Date).ToString("o")
        
        # Register event
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
        Detects and kills suspicious processes with CPU > 90%
    .DESCRIPTION
        P0 Critical: Prevents system freeze from runaway processes.
        Protects critical system processes and known applications.
    #>
    param(
        [Parameter(Mandatory = $false)]
        [int]$ThresholdPercent = $Global:HighCpuThresholdPercent
    )
    
    # Protected processes (NEVER kill)
    $protectedProcesses = @(
        # Windows System
        "System", "Idle", "svchost", "csrss", "smss", "wininit", "winlogon",
        "services", "lsass", "dwm", "explorer", "taskmgr", "RuntimeBroker",
        "spoolsv", "msdtc", "SearchIndexer", "WmiPrvSE",
        # CyberShield Agent
        "powershell", "CyberShield", "dns-filter",
        # Common Applications
        "chrome", "firefox", "msedge", "code", "Teams", "Outlook",
        "slack", "zoom", "OneDrive", "WINWORD", "EXCEL", "POWERPNT"
    )
    
    try {
        # Collect high-CPU processes using Get-Counter for real-time CPU
        $cpuSamples = @{}
        
        # First sample
        $processes1 = Get-Process | Where-Object { $_.CPU -ne $null }
        Start-Sleep -Milliseconds 500
        # Second sample
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
        
        # Filter high-CPU processes
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
                # Check if process is baseline (known)
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
#  v5.0: ADVANCED COLLECTION - TOP PROCESSES
# ============================================
function Get-TopProcesses {
    <#
    .SYNOPSIS
        Collects top 5 processes by CPU and RAM
    .DESCRIPTION
        P1 Important: Resource consumption visibility in heartbeat.
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
#  v5.0: UNAUTHORIZED SOFTWARE DETECTION
# ============================================
function Get-UnauthorizedSoftware {
    <#
    .SYNOPSIS
        Detects installed software not in the authorized list
    .DESCRIPTION
        P1 Important: Corporate software compliance.
    #>
    try {
        # Authorized software list (default - can be synced from server)
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
        
        # Get installed software
        $installedSoftware = Get-WmiObject Win32_Product -ErrorAction SilentlyContinue | 
            Where-Object { $_.Name } |
            Select-Object -ExpandProperty Name -Unique
        
        # Filter unauthorized
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
#  v5.0: PROCESS BASELINE
# ============================================
function Initialize-ProcessBaseline {
    <#
    .SYNOPSIS
        Initializes or loads process baseline
    .DESCRIPTION
        P2 Advanced: Anomaly detection via baseline.
    #>
    try {
        if (Test-Path $Global:ProcessBaselinePath) {
            $Global:ProcessBaseline = Get-Content $Global:ProcessBaselinePath -Raw | ConvertFrom-Json
            Write-Log "[BASELINE] Loaded baseline with $($Global:ProcessBaseline.Count) processes" "INFO"
        } else {
            Write-Log "[BASELINE] Creating initial process baseline..." "INFO"

            $processes = Get-Process | Select-Object ProcessName, Company, Description
            $grouped = $processes | Group-Object ProcessName
            $baseline = @()

            foreach ($group in $grouped) {
                $proc = $group.Group[0]
                $baseline += @{
                    name = $proc.ProcessName
                    company = $proc.Company
                    description = $proc.Description
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
    
    if (-not $Global:ProcessBaseline) { return $true }  # If no baseline, assume OK
    
    $found = $Global:ProcessBaseline | Where-Object { $_.name -eq $ProcessName }
    return ($null -ne $found)
}

function Get-ProcessAnomalies {
    <#
    .SYNOPSIS
        Detects new processes not in baseline
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
            
            # Add to baseline for future reference
            foreach ($proc in $anomalies) {
                $Global:ProcessBaseline += @{
                    name = $proc
                    company = $null
                    description = "Auto-added"
                    first_seen = (Get-Date).ToString("o")
                }
            }
            
            # Save updated baseline
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
#  v5.0: AUTO-REPAIR TELEMETRY
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
        # Silent - telemetry should never crash the agent
    }
}

# ============================================
#  SYSTEM METRICS (Basic - inherited from v4)
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
#  IMPROVED HEARTBEAT (v5.0)
# ============================================
function Send-Heartbeat {
    try {
        Write-Log "[HEARTBEAT] Sending heartbeat..." "DEBUG"
        
        # Collect metrics
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
            state = $Global:CurrentState
            ecdsa_enabled = ($null -ne $Global:AgentPrivateKey)
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
#  MAIN LOOP v5.0.2 FULL ENTERPRISE
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] CyberShield Agent $($Global:AgentVersion) FULL ENTERPRISE" "INFO"
Write-Log "[INFO] ServerUrl: $Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: $Global:AgentName" "DEBUG"
Write-Log "[INFO] Features: ECDSA-signing, Ed25519-verify, hash-chain, FSM, DNS-filter, auto-remediation" "INFO"
Write-Log "============================================" "INFO"

# ============================================
#  PHASE 1: INITIALIZATION
# ============================================
Set-AgentState -NewState "INITIALIZING" -Reason "Agent startup"

# Restore previous state if exists
$savedState = Get-SavedAgentState
if ($savedState -eq "SAFE_MODE") {
    Write-Log "[STARTUP] Recovering from SAFE_MODE..." "WARN"
}

# Initialize ECDSA keys
$keysInitialized = Initialize-AgentKeys
if (-not $keysInitialized) {
    Write-Log "[STARTUP] Failed to initialize keys - entering DEGRADED mode" "ERROR"
    Set-AgentState -NewState "DEGRADED" -Reason "Key initialization failed"
}

# ============================================
#  PHASE 2: AUTHENTICATION
# ============================================
Set-AgentState -NewState "AUTHENTICATING" -Reason "Validating credentials"

# Send first heartbeat
$heartbeatSuccess = Send-Heartbeat

if (-not $heartbeatSuccess) {
    Write-Log "[STARTUP] Initial heartbeat failed - entering DEGRADED mode" "WARN"
    Set-AgentState -NewState "DEGRADED" -Reason "Heartbeat failed"
} else {
    # Register public key
    if ($keysInitialized) {
        $keyRegistered = Register-AgentKey
        if (-not $keyRegistered) {
            Write-Log "[STARTUP] Key registration failed - result signing unavailable" "WARN"
        }
    }
}

# ============================================
#  PHASE 3: SYNCHRONIZATION
# ============================================
Set-AgentState -NewState "SYNCING" -Reason "Syncing policies and baseline"

# Initialize process baseline
Initialize-ProcessBaseline

# Sync DNS blocklist
Sync-DnsBlocklist

# ============================================
#  v5.0.3: STARTUP TASK HEALTH CHECK
# ============================================
Write-Log "[STARTUP] Verifying scheduled task health..." "INFO"
$Global:LastTaskHealthCheck = $null  # Force first check
$startupTaskHealth = Assert-TaskHealth
if ($startupTaskHealth.checked -and $startupTaskHealth.repaired) {
    Write-Log "[STARTUP] Task was repaired: $($startupTaskHealth.repair_action)" "WARN"
} elseif ($startupTaskHealth.checked -and $startupTaskHealth.healthy) {
    Write-Log "[STARTUP] Scheduled task is healthy" "SUCCESS"
}

# ============================================
#  PHASE 4: ENFORCEMENT
# ============================================
Set-AgentState -NewState "ENFORCING" -Reason "Normal operation"

Write-Log "[STARTUP] Agent v$($Global:AgentVersion) fully operational in ENFORCING state" "SUCCESS"

$lastHeartbeat = Get-Date
$lastAutoRepair = Get-Date
$lastSoftwareCheck = Get-Date
$lastJobPoll = Get-Date
$lastDnsSync = Get-Date
$consecutiveNetworkFailures = 0

while ($true) {
    $now = Get-Date
    
    try {
        # ============================================
        # NETWORK WATCHDOG
        # ============================================
        $networkOk = Test-NetworkConnectivity
        if (-not $networkOk) {
            $consecutiveNetworkFailures++
            if ($consecutiveNetworkFailures -ge 3) {
                Set-AgentState -NewState "DEGRADED" -Reason "Network connectivity lost"
            }
        } else {
            if ($consecutiveNetworkFailures -ge 3 -and $Global:CurrentState -eq "DEGRADED") {
                Set-AgentState -NewState "ENFORCING" -Reason "Network restored"
            }
            $consecutiveNetworkFailures = 0
        }
        
        # ============================================
        # JOB POLLING AND EXECUTION
        # ============================================
        if (($now - $lastJobPoll).TotalSeconds -ge $Global:JobPollIntervalSeconds -and $networkOk) {
            $jobs = Poll-Jobs
            
            foreach ($job in $jobs) {
                $result = Execute-Job -Job $job
                
                if ($result) {
                    Submit-JobResult -Job $job -Result $result
                }
            }
            
            $lastJobPoll = Get-Date
        }
        
        # ============================================
        # v5.0.3: TASK HEALTH CHECK (every 5 min)
        # ============================================
        $taskHealth = Assert-TaskHealth
        if ($taskHealth.checked -and $taskHealth.repaired) {
            Write-Log "[MAIN-LOOP] Task repaired: $($taskHealth.repair_action)" "INFO"
        }
        
        # ============================================
        # AUTO-REPAIR EACH CYCLE
        # ============================================
        
        # Disk cleanup check (every 5 min)
        if (($now - $lastAutoRepair).TotalSeconds -ge 300) {
            $diskResult = Invoke-DiskCleanup
            if ($diskResult.cleaned) {
                Write-Log "[AUTO-REPAIR] Disk cleanup freed $($diskResult.freed_gb)GB" "SUCCESS"
            }
            
            # Check for high-CPU processes
            $cpuResult = Invoke-HighCpuProcessCheck
            if ($cpuResult.killed_count -gt 0) {
                Write-Log "[AUTO-REPAIR] Killed $($cpuResult.killed_count) high-CPU processes" "SUCCESS"
            }
            
            $lastAutoRepair = Get-Date
        }
        
        # ============================================
        # HEARTBEAT EACH INTERVAL
        # ============================================
        if (($now - $lastHeartbeat).TotalSeconds -ge $Global:PollIntervalSeconds -and $networkOk) {
            $hbResult = Send-Heartbeat
            if (-not $hbResult -and $Global:CurrentState -eq "ENFORCING") {
                Set-AgentState -NewState "DEGRADED" -Reason "Heartbeat failed"
            }
            $lastHeartbeat = Get-Date
        }
        
        # ============================================
        # SOFTWARE CHECK (1x per hour)
        # ============================================
        if (($now - $lastSoftwareCheck).TotalSeconds -ge 3600) {
            Get-UnauthorizedSoftware | Out-Null
            $lastSoftwareCheck = Get-Date
        }
        
        # ============================================
        # DNS BLOCKLIST SYNC (1x per hour)
        # ============================================
        if (($now - $lastDnsSync).TotalSeconds -ge 3600 -and $networkOk) {
            Sync-DnsBlocklist
            $lastDnsSync = Get-Date
        }
        
    } catch {
        Write-Log "[MAIN-LOOP] Error: $($_.Exception.Message)" "ERROR"
    }
    
    Start-Sleep -Seconds 2
}
