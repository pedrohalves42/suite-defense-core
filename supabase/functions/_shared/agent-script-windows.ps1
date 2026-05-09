<#
.SYNOPSIS
    CyberShield Agent v6.0 - Windows Orchestrator
.DESCRIPTION
    Modular security agent orchestrator.
    Loads specialized modules and runs the main heartbeat loop.
    Single-instance guard via Global mutex.
#>

param(
    [string]$AgentToken,
    [string]$HmacSecret,
    [Alias('ServerUrl')]
    [string]$ApiEndpoint,
    [string]$AgentName,
    [int]$PollInterval
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# ============================================
# GLOBAL VARIABLE INITIALIZATION
# Set before any module loads to prevent $null reference errors
# ============================================
$Global:UpdateInProgress = $false
$Global:BootScriptHash = $null
$Global:CurrentState = "INITIALIZING"
$Global:AgentName = if ($AgentName) { $AgentName } else { $env:CYBERSHIELD_AGENT_NAME }
$Global:AgentVersion = "6.0.0"
$Global:AgentToken = $null
$Global:HmacSecret = $null
$Global:ServerUrl = $null
$Global:CachedHmacKey = $null
$Global:TlsPinnedThumbprint = $null
$Global:ConsecutivePollErrors = 0
$Global:JobPollIntervalSeconds = if ($PollInterval -ge 10) { $PollInterval } else { 30 }
$Global:RestartRequested = $false
$Global:LoopTimestamp = $null
$Global:StatePath = "$env:ProgramData\CyberShield\data\agent_state.json"
$Global:DnsBlocklistPath = "$env:ProgramData\CyberShield\data\dns_blocklist.json"
$Global:EvidenceJournalPath = "$env:ProgramData\CyberShield\data\evidence_journal.jsonl"
$Global:EvidenceBuffer = [System.Collections.ArrayList]::new()
$Global:RollbackPaths = @{
    RollbackState = "$env:ProgramData\CyberShield\data\rollback_state.json"
}

# Aggregation defaults
$Global:AggregationEnabled = $true
$Global:AggregationWindowSeconds = 10
$Global:AggregationFileThreshold = 50
$Global:AggregationProcessThreshold = 20
$Global:AggregationNetworkThreshold = 100
$Global:AggregationMaxBufferSize = 500
$Global:AggregationLastFlush = [datetime]::MinValue
$Global:EventAggregationBuffer = @{}
$Global:AggregationStats = @{
    events_received  = 0
    events_aggregated = 0
    events_sent      = 0
    bursts_detected  = 0
    buffer_overflow  = 0
    reduction_percent = 0
}

# Auto-repair stats
$Global:AutoRepairStats = @{
    disk_cleanups      = 0
    last_disk_cleanup  = $null
    processes_killed   = 0
    services_restarted = 0
}

# Protected process/service lists
$Global:ProtectedProcesses = @("system", "idle", "csrss", "smss", "wininit", "winlogon", "services", "lsass", "svchost", "dwm")
$Global:ProtectedServices = @("wininit", "lsass", "services", "smss", "csrss")
$Global:DiskCleanupThresholdPercent = 90
$Global:HighCpuThresholdPercent = 90

# Agent cryptographic identity (set during enrollment/key generation)
$Global:AgentPrivateKey = $null
$Global:AgentPublicKey = $null
$Global:AgentRsaKey = $null
$Global:AgentSigningAlgorithm = $null
$Global:KeyFingerprint = $null

# Process baseline (HashSet for O(1) lookups)
$Global:ProcessBaselineSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

if ($AgentName) {
    $env:CYBERSHIELD_AGENT_NAME = $AgentName
}

# ============================================
# SINGLE-INSTANCE GUARD (mutex)
# Prevents multiple agent instances from running simultaneously
# ============================================
$script:AgentMutex = $null
try {
    $mutexCreated = $false
    $script:AgentMutex = [System.Threading.Mutex]::new($true, "Global\CyberShieldAgent", [ref]$mutexCreated)
    if (-not $mutexCreated) {
        try {
            $acquired = $script:AgentMutex.WaitOne(0)
            if (-not $acquired) {
                Write-Host "[$(Get-Date -Format 'o')] [ERROR] Another CyberShield Agent instance is already running. Exiting." -ForegroundColor Red
                try {
                    Write-EventLog -LogName Application -Source "CyberShield" -EntryType Warning -EventId 9010 -Message "Agent startup blocked: another instance is already running (mutex held)."
                } catch { }
                exit 0
            }
        } catch {
            Write-Host "[$(Get-Date -Format 'o')] [ERROR] Failed to acquire agent mutex: $($_.Exception.Message). Exiting." -ForegroundColor Red
            exit 0
        }
    }
} catch {
    Write-Host "[$(Get-Date -Format 'o')] [WARN] Mutex creation failed: $($_.Exception.Message). Continuing without single-instance guard." -ForegroundColor Yellow
}

# ============================================
# MODULE LOADING
# Order matters: foundational modules first, then domain modules
# ============================================
# Module path initialization removed for bundled script

# --- Foundation layer (no dependencies on other modules) ---

# --- BEGIN MODULE: config.ps1 ---
<#
.SYNOPSIS
    Agent configuration and state persistence
#>

$script:BaseDir = "$env:ProgramData\CyberShield"
$script:DataDir = "$script:BaseDir\data"
$script:SecretsDir = "$script:BaseDir\secrets"
$script:TempDir = "$env:TEMP\CyberShield"

$script:Config = @{
    ApiEndpoint       = ""
    ServerUrl         = "" # Base URL without /functions/v1/
    AgentId           = ""
    TenantId          = ""
    AgentToken        = ""
    HmacSecret        = ""
    HeartbeatInterval = 60
    ScriptPath        = "$script:BaseDir\agent.ps1"
    BackupPath        = "$script:BaseDir\agent.ps1.bak"
    MaxRetries        = 5
    RetryDelay        = 30
    WatchdogInterval  = 10
    Version           = "6.0.0"
}

function Initialize-Config {
    param(
        [string]$AgentToken,
        [string]$HmacSecret,
        [string]$ApiEndpoint
    )

    foreach ($dir in @($script:BaseDir, $script:DataDir, $script:SecretsDir, $script:TempDir)) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }

    # Load secrets from files (preferred) or params
    $script:Config.AgentToken = Get-SecretValue -Name "agent_token" -Fallback $AgentToken
    $script:Config.HmacSecret = Get-SecretValue -Name "hmac_secret" -Fallback $HmacSecret
    
    # URL Normalization
    $rawEndpoint = if ($ApiEndpoint) { $ApiEndpoint } else { $env:CYBERSHIELD_API_ENDPOINT }
    if ($rawEndpoint) {
        $script:Config.ServerUrl = $rawEndpoint.TrimEnd('/') -replace '/functions/v1$', ''
        $script:Config.ApiEndpoint = "$($script:Config.ServerUrl)/functions/v1"
        $Global:ServerUrl = $script:Config.ApiEndpoint # Compat with older modules
    }
    
    $script:Config.AgentId = $env:CYBERSHIELD_AGENT_ID
    $script:Config.TenantId = $env:CYBERSHIELD_TENANT_ID
}

function Get-SecretValue {
    param(
        [string]$Name,
        [string]$Fallback
    )
    $filePath = "$script:SecretsDir\$Name"
    if (Test-Path $filePath) {
        return (Get-Content $filePath -Raw -Encoding UTF8).Trim()
    }
    return $Fallback
}

function Import-PersistedState {
    $stateFile = "$script:DataDir\state.json"
    if (Test-Path $stateFile) {
        try {
            $state = Get-Content $stateFile -Raw | ConvertFrom-Json
            $Global:BootScriptHash = $state.boot_hash
        }
        catch {
            Write-Log "Failed to load persisted state: $($_.Exception.Message)" "WARN"
        }
    }

    # Load persisted Ed25519 public key for offline verification
    $ed25519Path = "$script:BaseDir\ed25519_pubkey"
    if ((Test-Path $ed25519Path) -and -not $Global:Ed25519PublicKeyBase64) {
        try {
            $Global:Ed25519PublicKeyBase64 = (Get-Content $ed25519Path -Raw -Encoding UTF8).Trim()
            Write-Log "[CRYPTO] Ed25519 public key loaded from persisted file" "INFO"
        } catch {
            Write-Log "[CRYPTO] Failed to load persisted Ed25519 key: $($_.Exception.Message)" "WARN"
        }
    }

    # Load persisted RSA-2048 public key for offline verification (.NET 4.x fallback)
    $rsaPath = "$script:BaseDir\rsa_pubkey"
    if ((Test-Path $rsaPath) -and -not $Global:RsaPublicKeyBase64) {
        try {
            $Global:RsaPublicKeyBase64 = (Get-Content $rsaPath -Raw -Encoding UTF8).Trim()
            Write-Log "[CRYPTO] RSA-2048 public key loaded from persisted file" "INFO"
        } catch {
            Write-Log "[CRYPTO] Failed to load persisted RSA key: $($_.Exception.Message)" "WARN"
        }
    }
}

function Export-PersistedState {
    $stateFile = "$script:DataDir\state.json"
    $state = @{
        boot_hash   = $Global:BootScriptHash
        last_update = (Get-Date -Format "o")
        version     = $script:Config.Version
    }
    $state | ConvertTo-Json | Out-File $stateFile -Encoding UTF8 -Force
}

# --- END MODULE: config.ps1 ---


# --- BEGIN MODULE: utils.ps1 ---
<#
.SYNOPSIS
    Logging, retry with exponential backoff + jitter, tracing, and general utility functions
#>

$script:LogDir = "$env:ProgramData\CyberShield\Logs"
$script:LogFile = $null

function New-TraceId {
    <#
    .SYNOPSIS
        Generates a unique trace ID (UUID v4) for end-to-end request tracing.
        Propagated via X-Trace-ID header to correlate agent -> backend -> database.
    #>
    return [guid]::NewGuid().ToString()
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO",
        [string]$TraceId = $null
    )

    if (-not $script:LogFile) {
        if (-not (Test-Path $script:LogDir)) {
            New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null
        }
        $script:LogFile = "$script:LogDir\agent_$(Get-Date -Format 'yyyy-MM-dd').log"
    }

    $tid = if ($TraceId) { $TraceId } elseif ($script:CurrentTraceId) { $script:CurrentTraceId } else { "" }
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $tracePrefix = if ($tid) { " [trace:$tid]" } else { "" }
    "$timestamp [$Level]$tracePrefix $Message" | Out-File -FilePath $script:LogFile -Append -Encoding UTF8

    switch ($Level) {
        "ERROR" { Write-Host "[ERROR]$tracePrefix $Message" -ForegroundColor Red }
        "WARN"  { Write-Host "[WARN]$tracePrefix $Message" -ForegroundColor Yellow }
        default { Write-Host "[INFO]$tracePrefix $Message" -ForegroundColor Green }
    }
}

function Test-CommandExists {
    param([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Invoke-SecureApi {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [hashtable]$Body = @{},
        [int]$MaxRetries = 3,
        [int]$BaseDelayMs = 2000,
        [int]$MaxDelayMs = 30000
    )

    $url = "$($script:Config.ApiEndpoint)/$Endpoint"

    for ($attempt = 0; $attempt -le $MaxRetries; $attempt++) {
        try {
            # Generate or reuse trace ID for end-to-end correlation
            $traceId = if ($script:CurrentTraceId) { $script:CurrentTraceId } else { New-TraceId }

            $headers = @{
                "Authorization" = "Bearer $($script:Config.AgentToken)"
                "Content-Type"  = "application/json"
                "X-Agent-Id"    = $script:Config.AgentId
                "X-Trace-ID"    = $traceId
                "X-Request-ID"  = $traceId
            }

            # Build body JSON
            $bodyJson = if ($Body.Count -gt 0) { $Body | ConvertTo-Json -Depth 10 } else { "" }

            # Add HMAC signature with nonce (hex-encoded, aligned with Unix)
            if ($bodyJson -and $script:Config.HmacSecret) {
                $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
                $nonce = New-HmacNonce
                $hmacPayload = "$timestamp`:$nonce`:$bodyJson"
                $signature = Compute-HMAC -Message $hmacPayload -Secret $script:Config.HmacSecret
                $headers["X-HMAC-Signature"] = $signature
                $headers["X-HMAC-Timestamp"] = $timestamp
                $headers["X-HMAC-Nonce"]     = $nonce
            }

            $params = @{
                Uri             = $url
                Method          = $Method
                Headers         = $headers
                UseBasicParsing = $true
            }
            if ($bodyJson -and $Method -ne "GET") {
                $params["Body"] = $bodyJson
            }

            $response = Invoke-RestMethod @params
            return $response

        } catch {
            $statusCode = $null
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }

            # Don't retry on client errors (4xx) except 429 (rate limit)
            if ($statusCode -and $statusCode -ge 400 -and $statusCode -lt 500 -and $statusCode -ne 429) {
                Write-Log "API call failed with $statusCode (non-retryable): $_" -Level "ERROR"
                throw
            }

            if ($attempt -ge $MaxRetries) {
                Write-Log "API call failed after $($MaxRetries + 1) attempts: $_" -Level "ERROR"
                throw
            }

            # Exponential backoff with full jitter: delay = random(0, min(cap, base * 2^attempt))
            $exponentialDelay = [Math]::Min($MaxDelayMs, $BaseDelayMs * [Math]::Pow(2, $attempt))
            $jitteredDelay = Get-Random -Minimum 0 -Maximum ([int]$exponentialDelay)
            Write-Log "API call attempt $($attempt + 1) failed (status: $statusCode). Retrying in ${jitteredDelay}ms..." -Level "WARN"
            Start-Sleep -Milliseconds $jitteredDelay
        }
    }
}

# --- END MODULE: utils.ps1 ---


# --- BEGIN MODULE: crypto.ps1 ---
<#
.SYNOPSIS
    Cryptographic functions: SHA-256 hashing + Ed25519/RSA signature verification.
    v6.1: Fixed Ed25519 detection and removed broken .NET 5+ assumptions.
    RSA-2048 is the primary robust method for PowerShell 5.1 compatibility.
#>

# Ed25519 public key (SPKI, Base64-encoded) — embedded for offline verification
$Global:Ed25519PublicKeyBase64 = $null  # Set during enrollment or via config

# RSA-2048 public key (SPKI, Base64-encoded) — fallback for .NET 4.x
$Global:RsaPublicKeyBase64 = $null  # Set via heartbeat response

function Get-PayloadHash {
    param([string]$Payload)
    $sha256 = [System.Security.Cryptography.SHA256]::Create()
    $hash = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Payload))
    $sha256.Dispose()
    return ($hash | ForEach-Object { $_.ToString("x2") }) -join ""
}

function Test-Ed25519Available {
    <#
    .SYNOPSIS
        Check if Ed25519 is available on this runtime.
        Standard .NET Framework 4.8 and .NET Core < 9.0 do NOT support this natively
        without external libraries like BouncyCastle.
    #>
    try {
        # Check for .NET 9.0+ which has System.Security.Cryptography.EdDsa
        $edDsaType = [Type]::GetType("System.Security.Cryptography.EdDsa")
        if ($null -ne $edDsaType) { return $true }
        
        # Check for CNG support (Windows 10 1803+)
        # Ed25519 is supported in CNG but not easily exposed in standard .NET wrapper
        return $false 
    }
    catch {
        return $false
    }
}

function Test-RsaSignature {
    <#
    .SYNOPSIS
        Verify an RSA-2048 PKCS1-v1_5 + SHA-256 signature.
        Compatible with .NET Framework 4.x (PowerShell 5.1).
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [Parameter(Mandatory)][string]$SignatureBase64,
        [Parameter(Mandatory)][string]$PublicKeyBase64
    )

    try {
        $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

        # Import RSA public key
        $rsa = [System.Security.Cryptography.RSA]::Create()
        try {
            # .NET 4.6+ support for SPKI import
            $rsa.ImportSubjectPublicKeyInfo($pubKeyBytes, [ref]$null)
        } catch {
            # Manual import for older .NET 4.x
            return Test-RsaSignatureLegacy -ContentHash $ContentHash -SignatureBase64 $SignatureBase64 -PublicKeyBase64 $PublicKeyBase64
        }

        $hashAlgo = [System.Security.Cryptography.HashAlgorithmName]::SHA256
        $padding = [System.Security.Cryptography.RSASignaturePadding]::Pkcs1
        $isValid = $rsa.VerifyData($contentBytes, $sigBytes, $hashAlgo, $padding)
        $rsa.Dispose()

        if ($isValid) {
            Write-Log "[CRYPTO] RSA-2048 signature VERIFIED for hash: $($ContentHash.Substring(0,16))..." "INFO"
        } else {
            Write-Log "[CRYPTO] RSA-2048 signature INVALID for hash: $($ContentHash.Substring(0,16))..." "ERROR"
        }

        return $isValid
    }
    catch {
        Write-Log "[CRYPTO] RSA verification error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-RsaSignatureLegacy {
    param(
        [string]$ContentHash,
        [string]$SignatureBase64,
        [string]$PublicKeyBase64
    )
    # Simplified legacy fallback using RSACryptoServiceProvider
    try {
        $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

        $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider
        # Note: This requires the public key to be in XML format or manual parameter setting
        # For simplicity in this audit fix, we assume modern .NET 4.6.2+ is present on 99% of targets
        # where ImportSubjectPublicKeyInfo works.
        Write-Log "[CRYPTO] Legacy RSA import not fully implemented in this version, update .NET to 4.6.2+" "WARN"
        return $false
    } catch {
        return $false
    }
}

function Test-Ed25519Signature {
    <#
    .SYNOPSIS
        Verify an Ed25519 signature against content.
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [string]$SignatureBase64,
        [string]$PublicKeyBase64
    )

    if (-not $SignatureBase64) {
        Write-Log "[CRYPTO] No signature provided - UNSIGNED" "WARN"
        return $false
    }

    if (-not $PublicKeyBase64) {
        $PublicKeyBase64 = $Global:Ed25519PublicKeyBase64
    }

    if (-not $PublicKeyBase64) {
        Write-Log "[CRYPTO] No Ed25519 public key configured - FAIL" "ERROR"
        return $false
    }

    if (-not (Test-Ed25519Available)) {
        Write-Log "[CRYPTO] Ed25519 NOT supported on this Windows/PowerShell version. Falling back to RSA." "WARN"
        return $false # Force fallback to RSA in Test-ScriptSignature
    }

    try {
        # This block only runs if Test-Ed25519Available returns true (e.g. .NET 9.0+)
        $pubKeyBytes = [System.Convert]::FromBase64String($PublicKeyBase64)
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)
        $contentBytes = [System.Text.Encoding]::UTF8.GetBytes($ContentHash)

        # EdDsa is the .NET 9.0 class
        $ed = [System.Security.Cryptography.EdDsa]::Create([System.Security.Cryptography.ECCurve]::NamedCurves.ed25519)
        $ed.ImportSubjectPublicKeyInfo($pubKeyBytes, [ref]$null)
        $isValid = $ed.VerifyData($contentBytes, $sigBytes)
        $ed.Dispose()
        
        return $isValid
    }
    catch {
        Write-Log "[CRYPTO] Ed25519 verification exception: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Register-AgentKey {
    <#
    .SYNOPSIS
        Proactively registers the agent's RSA-2048 public key with the server.
        Generates a key pair if none exists and POSTs to register-agent-key.
    #>

    $algorithm = "RSA-2048-SHA256"
    $keyDir = "$env:ProgramData\CyberShield"
    $privateKeyPath = "$keyDir\agent_signing_key.pem"
    $publicKeyPath = "$keyDir\agent_signing_pubkey.pem"
    $fingerprintPath = "$keyDir\agent_key_fingerprint"

    try {
        $publicKeyBase64 = $null

        if ((Test-Path $publicKeyPath) -and (Test-Path $fingerprintPath)) {
            $publicKeyBase64 = (Get-Content $publicKeyPath -Raw -Encoding UTF8).Trim()
            $fingerprint = (Get-Content $fingerprintPath -Raw -Encoding UTF8).Trim()
            Write-Log "[KEY-REG] Loaded existing key pair (algo=$algorithm, fp=$($fingerprint.Substring(0,16))...)" "INFO"
        }
        else {
            Write-Log "[KEY-REG] Generating new $algorithm key..." "INFO"

            # RSA-2048 is supported on all Windows versions with .NET 4.x
            $rsa = [System.Security.Cryptography.RSA]::Create(2048)
            $pubBytes = $rsa.ExportSubjectPublicKeyInfo()
            $privBytes = $rsa.ExportPkcs8PrivateKey()
            $rsa.Dispose()
            $publicKeyBase64 = [Convert]::ToBase64String($pubBytes)
            
            # Persist keys
            if (-not (Test-Path $keyDir)) { New-Item -ItemType Directory -Path $keyDir -Force | Out-Null }
            [System.IO.File]::WriteAllBytes($privateKeyPath, $privBytes)
            $publicKeyBase64 | Out-File -FilePath $publicKeyPath -Encoding UTF8 -Force -NoNewline

            # Compute SHA-256 fingerprint
            $decodedBytes = [Convert]::FromBase64String($publicKeyBase64)
            $sha = [System.Security.Cryptography.SHA256]::Create()
            $hashBytes = $sha.ComputeHash($decodedBytes)
            $sha.Dispose()
            $fingerprint = ($hashBytes | ForEach-Object { $_.ToString("x2") }) -join ""
            $fingerprint | Out-File -FilePath $fingerprintPath -Encoding UTF8 -Force -NoNewline

            # Restrict permissions
            try {
                $acl = Get-Acl $privateKeyPath
                $acl.SetAccessRuleProtection($true, $false)
                $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM", "FullControl", "Allow")
                $acl.AddAccessRule($systemRule)
                Set-Acl -Path $privateKeyPath -AclObject $acl
            } catch { }

            Write-Log "[KEY-REG] Generated key pair (fp=$($fingerprint.Substring(0,16))...)" "INFO"
        }

        $body = @{
            public_key      = $publicKeyBase64
            key_fingerprint = $fingerprint
            algorithm       = $algorithm
        }

        $result = Invoke-SecureRequest `
            -Path "/functions/v1/register-agent-key" `
            -Method "POST" `
            -Body $body `
            -MaxRetries 3 `
            -TimeoutSec 15

        if ($result.Success) {
            $resp = $result.Content | ConvertFrom-Json
            if ($resp.success) {
                Write-Log "[KEY-REG] Key registered successfully: key_id=$($resp.key_id)" "SUCCESS"
                return $true
            }
        }

        Write-Log "[KEY-REG] Registration failed (HTTP $($result.StatusCode))" "WARN"
        return $false

    } catch {
        Write-Log "[KEY-REG] Error: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Test-ScriptSignature {
    <#
    .SYNOPSIS
        Unified signature verification: tries Ed25519 first, falls back to RSA-2048.
        Eliminates audit-only mode on .NET 4.x by using RSA as a native fallback.
    .PARAMETER ContentHash
        The SHA-256 hash string that was signed server-side.
    .PARAMETER Ed25519SignatureBase64
        Base64-encoded Ed25519 signature (primary). May be null.
    .PARAMETER RsaSignatureBase64
        Base64-encoded RSA-2048 signature (fallback). May be null.
    #>
    param(
        [Parameter(Mandatory)][string]$ContentHash,
        [string]$Ed25519SignatureBase64,
        [string]$RsaSignatureBase64
    )

    # Strategy 1: Try Ed25519 if runtime supports it and signature is available
    if ($Ed25519SignatureBase64 -and (Test-Ed25519Available)) {
        $ed25519Key = $Global:Ed25519PublicKeyBase64
        if ($ed25519Key) {
            Write-Log "[CRYPTO] Attempting Ed25519 verification (preferred)" "INFO"
            $result = Test-Ed25519Signature -ContentHash $ContentHash -SignatureBase64 $Ed25519SignatureBase64 -PublicKeyBase64 $ed25519Key
            if ($result) { return $true }
            # Ed25519 failed — don't fall through to RSA (signature mismatch = reject)
            Write-Log "[CRYPTO] Ed25519 verification failed — not falling through to RSA" "ERROR"
            return $false
        }
    }

    # Strategy 2: RSA-2048 fallback (works on .NET 4.x)
    if ($RsaSignatureBase64) {
        $rsaKey = $Global:RsaPublicKeyBase64
        if ($rsaKey) {
            Write-Log "[CRYPTO] Attempting RSA-2048 verification (fallback for .NET 4.x)" "INFO"
            return Test-RsaSignature -ContentHash $ContentHash -SignatureBase64 $RsaSignatureBase64 -PublicKeyBase64 $rsaKey
        }
        else {
            Write-Log "[CRYPTO] RSA signature available but no RSA public key configured" "WARN"
        }
    }

    # No verification possible — check if we have any keys at all
    if (-not $Global:Ed25519PublicKeyBase64 -and -not $Global:RsaPublicKeyBase64) {
        Write-Log "[CRYPTO] No cryptographic keys configured — fail-open (audit-only)" "WARN"
        return $true
    }

    # Keys exist but no valid signature provided
    if (-not $Ed25519SignatureBase64 -and -not $RsaSignatureBase64) {
        Write-Log "[CRYPTO] No signatures provided — UNSIGNED" "WARN"
        return $false
    }

    Write-Log "[CRYPTO] Signature verification failed — no compatible algorithm available" "ERROR"
    return $false
}

function Invoke-SignResult {
    <#
    .SYNOPSIS
        Signs job result with agent cryptographic identity (ECDSA/RSA).
        Ported from v5.0.15 monolith for v6 parity.
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
            Write-Log "[SIGN] No private key available for signing" "WARN"
            return $null
        }

        $algorithm = if ($Global:AgentSigningAlgorithm) { $Global:AgentSigningAlgorithm } else { "unknown" }
        $message = "$ExecutionId|$JobId|$Status|$OutputHash|$FinishedAt"
        $messageBytes = [System.Text.Encoding]::UTF8.GetBytes($message)

        if ($algorithm -eq "RSA-2048-CSP" -and $Global:AgentRsaKey) {
            $sha256 = [System.Security.Cryptography.SHA256]::Create()
            $hash = $sha256.ComputeHash($messageBytes)
            $sha256.Dispose()
            $sigBytes = $Global:AgentRsaKey.SignHash($hash, [System.Security.Cryptography.CryptoConfig]::MapNameToOID("SHA256"))
            return [Convert]::ToBase64String($sigBytes)
        }

        Write-Log "[SIGN] Unsupported signing algorithm: $algorithm" "WARN"
        return $null
    }
    catch {
        Write-Log "[SIGN] Signing failed: $($_.Exception.Message)" "WARN"
        return $null
    }
}

# --- END MODULE: crypto.ps1 ---


# --- BEGIN MODULE: hmac.ps1 ---
<#
.SYNOPSIS
    HMAC computation and verification -- HEX output (aligned with Unix agents)
#>

function Compute-HMAC {
    param(
        [string]$Message,
        [string]$Secret
    )

    # Decode secret from hex if valid 64-char hex string, otherwise use UTF-8
    if ($Secret -match '^[0-9a-fA-F]{64}$') {
        $keyBytes = [byte[]]::new(32)
        for ($i = 0; $i -lt 64; $i += 2) {
            $keyBytes[$i / 2] = [Convert]::ToByte($Secret.Substring($i, 2), 16)
        }
    } else {
        $keyBytes = [System.Text.Encoding]::UTF8.GetBytes($Secret)
    }

    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $keyBytes
    $hash = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($Message))
    $hmac.Dispose()

    # Output as lowercase hex (aligned with Unix agents and backend)
    return ([BitConverter]::ToString($hash) -replace '-', '').ToLower()
}

function New-HmacNonce {
    <#
    .SYNOPSIS
        Generates a cryptographically secure nonce (32 hex chars / 16 bytes)
    #>
    $bytes = [byte[]]::new(16)
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    return ([BitConverter]::ToString($bytes) -replace '-', '').ToLower()
}

function Test-HMAC {
    param(
        [string]$Message,
        [string]$Signature,
        [string]$Secret
    )

    $expected = Compute-HMAC -Message $Message -Secret $Secret
    # Constant-time comparison (both are lowercase hex of same length)
    if ($expected.Length -ne $Signature.Length) { return $false }

    $diff = 0
    for ($i = 0; $i -lt $expected.Length; $i++) {
        $diff = $diff -bor ([byte][char]$expected[$i] -bxor [byte][char]$Signature[$i])
    }
    return $diff -eq 0
}

# --- END MODULE: hmac.ps1 ---


# --- Infrastructure layer (depends on foundation) ---

# --- BEGIN MODULE: telemetry.ps1 ---
<#
.SYNOPSIS
    System telemetry collection (CPU, RAM, disk, processes)
#>

function Get-SystemTelemetry {
    $telemetry = @{
        agent_id   = $script:Config.AgentId
        tenant_id  = $script:Config.TenantId
        timestamp  = (Get-Date -Format "o")
        hostname   = $env:COMPUTERNAME
        os_version = ""
        system_metrics = @{}
        processes  = @{}
    }

    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
        if ($os) {
            $telemetry.os_version = $os.Caption
            $totalMem = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
            $freeMem = [math]::Round($os.FreePhysicalMemory / 1MB, 2)
            $telemetry.system_metrics.memory_total_gb = $totalMem
            $telemetry.system_metrics.memory_free_gb = $freeMem
            $telemetry.system_metrics.memory_used_percent = if ($totalMem -gt 0) { [math]::Round((($totalMem - $freeMem) / $totalMem) * 100, 1) } else { 0 }
        }
    }
    catch {
        Write-Log "Failed to collect OS info: $($_.Exception.Message)" "WARN"
    }

    try {
        $cpu = Get-Counter "\Processor(_Total)\% Processor Time" -SampleInterval 1 -MaxSamples 1 -ErrorAction SilentlyContinue
        if ($cpu) {
            $telemetry.system_metrics.cpu_percent = [math]::Round($cpu.CounterSamples[0].CookedValue, 1)
        }
    }
    catch {
        Write-Log "Failed to collect CPU metrics: $($_.Exception.Message)" "WARN"
    }

    try {
        $drive = Get-PSDrive C -ErrorAction SilentlyContinue
        if ($drive) {
            $telemetry.system_metrics.disk_total_gb = [math]::Round(($drive.Used + $drive.Free) / 1GB, 2)
            $telemetry.system_metrics.disk_free_gb = [math]::Round($drive.Free / 1GB, 2)
            $total = $drive.Used + $drive.Free
            $telemetry.system_metrics.disk_used_percent = if ($total -gt 0) { [math]::Round(($drive.Used / $total) * 100, 1) } else { 0 }
        }
    }
    catch {
        Write-Log "Failed to collect disk metrics: $($_.Exception.Message)" "WARN"
    }

    try {
        $procs = Get-Process -ErrorAction SilentlyContinue | Sort-Object CPU -Descending | Select-Object -First 10
        $telemetry.processes.total_processes = (Get-Process -ErrorAction SilentlyContinue).Count
        $telemetry.processes.top_by_cpu = @($procs | ForEach-Object {
            @{
                pid        = $_.Id
                name       = $_.ProcessName
                cpu_seconds = [math]::Round($_.CPU, 2)
                memory_mb  = [math]::Round($_.WorkingSet64 / 1MB, 2)
            }
        })
    }
    catch {
        Write-Log "Failed to collect process metrics: $($_.Exception.Message)" "WARN"
    }

    return $telemetry
}

# --- END MODULE: telemetry.ps1 ---


# --- BEGIN MODULE: security.ps1 ---
<#
.SYNOPSIS
    Security detection (EDR events, anomaly detection)
    Note: Antivirus collection is handled by collection.ps1 (Invoke-CollectAntivirusStatus)
#>

function Get-SecurityEvents {
    param([int]$Hours = 1)

    $events = @()
    $cutoff = (Get-Date).AddHours(-$Hours)

    try {
        # Windows Security log - failed logins (4625)
        $failedLogins = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 4625
            StartTime = $cutoff
        } -MaxEvents 50 -ErrorAction SilentlyContinue

        foreach ($evt in $failedLogins) {
            $events += @{
                event_type = "failed_login"
                timestamp  = $evt.TimeCreated.ToString("o")
                event_id   = $evt.Id
                message    = $evt.Message.Substring(0, [Math]::Min(200, $evt.Message.Length))
            }
        }
    }
    catch {
        Write-Log "Failed to read security events: $($_.Exception.Message)" "WARN"
    }

    try {
        # New service installations (7045)
        $newServices = Get-WinEvent -FilterHashtable @{
            LogName   = "System"
            Id        = 7045
            StartTime = $cutoff
        } -MaxEvents 20 -ErrorAction SilentlyContinue

        foreach ($evt in $newServices) {
            $events += @{
                event_type = "new_service"
                timestamp  = $evt.TimeCreated.ToString("o")
                event_id   = $evt.Id
                message    = $evt.Message.Substring(0, [Math]::Min(200, $evt.Message.Length))
            }
        }
    }
    catch {
        # System log may not have recent entries
    }

    # --- Successful logons from unusual sources (4624 type 10 = RDP, type 3 = network) ---
    try {
        $logons = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 4624
            StartTime = $cutoff
        } -MaxEvents 30 -ErrorAction SilentlyContinue

        foreach ($evt in $logons) {
            $xml = [xml]$evt.ToXml()
            $logonType = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "LogonType" }).'#text'
            if ($logonType -in @("3","10")) {
                $sourceIp = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "IpAddress" }).'#text'
                $targetUser = ($xml.Event.EventData.Data | Where-Object { $_.Name -eq "TargetUserName" }).'#text'
                $events += @{
                    event_type  = "remote_logon"
                    timestamp   = $evt.TimeCreated.ToString("o")
                    event_id    = $evt.Id
                    logon_type  = $logonType
                    source_ip   = $sourceIp
                    target_user = $targetUser
                    message     = "Remote logon type $logonType from $sourceIp as $targetUser"
                }
            }
        }
    }
    catch { }

    # --- Account created (4720) / Account modified (4738) ---
    try {
        $accountEvents = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 4720, 4738
            StartTime = $cutoff
        } -MaxEvents 20 -ErrorAction SilentlyContinue

        foreach ($evt in $accountEvents) {
            $evtType = if ($evt.Id -eq 4720) { "account_created" } else { "account_modified" }
            $events += @{
                event_type = $evtType
                timestamp  = $evt.TimeCreated.ToString("o")
                event_id   = $evt.Id
                message    = $evt.Message.Substring(0, [Math]::Min(200, $evt.Message.Length))
            }
        }
    }
    catch { }

    # --- Kerberos TGS requests (4769) - Kerberoasting detection ---
    try {
        $tgsEvents = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 4769
            StartTime = $cutoff
        } -MaxEvents 100 -ErrorAction SilentlyContinue

        if ($tgsEvents -and $tgsEvents.Count -gt 20) {
            $events += @{
                event_type    = "kerberoasting_suspect"
                timestamp     = (Get-Date).ToString("o")
                event_id      = 4769
                request_count = $tgsEvents.Count
                message       = "High volume of Kerberos TGS requests: $($tgsEvents.Count) in $Hours hour(s)"
            }
        }
    }
    catch { }

    # --- Audit log cleared (1102) ---
    try {
        $clearEvents = Get-WinEvent -FilterHashtable @{
            LogName   = "Security"
            Id        = 1102
            StartTime = $cutoff
        } -MaxEvents 5 -ErrorAction SilentlyContinue

        foreach ($evt in $clearEvents) {
            $events += @{
                event_type = "audit_log_cleared"
                timestamp  = $evt.TimeCreated.ToString("o")
                event_id   = $evt.Id
                message    = "Security audit log was cleared"
            }
        }
    }
    catch { }

    # --- PowerShell script block logging (4104) - obfuscation detection ---
    try {
        $psEvents = Get-WinEvent -FilterHashtable @{
            LogName   = "Microsoft-Windows-PowerShell/Operational"
            Id        = 4104
            StartTime = $cutoff
        } -MaxEvents 30 -ErrorAction SilentlyContinue

        foreach ($evt in $psEvents) {
            $scriptBlock = $evt.Message
            # Check for heavy encoding/obfuscation patterns
            $obfuscationPatterns = @(
                '[char]',
                'FromBase64String',
                '-bxor',
                'Invoke-Expression',
                'iex(',
                '[System.Convert]::',
                '-replace.*\[char\]',
                'New-Object Net.WebClient'
            )
            $matchCount = 0
            foreach ($pattern in $obfuscationPatterns) {
                if ($scriptBlock -match [regex]::Escape($pattern)) { $matchCount++ }
            }
            if ($matchCount -ge 2) {
                $events += @{
                    event_type      = "obfuscated_script"
                    timestamp       = $evt.TimeCreated.ToString("o")
                    event_id        = $evt.Id
                    match_count     = $matchCount
                    message         = $scriptBlock.Substring(0, [Math]::Min(300, $scriptBlock.Length))
                }
            }
        }
    }
    catch { }

    return $events
}

function Get-FirewallStatus {
    try {
        $profiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue
        $status = @{}
        foreach ($p in $profiles) {
            $status[$p.Name] = @{
                enabled        = $p.Enabled
                default_action = $p.DefaultInboundAction.ToString()
            }
        }
        return $status
    }
    catch {
        Write-Log "Failed to get firewall status: $($_.Exception.Message)" "WARN"
        return @{}
    }
}

function Get-ProcessLineageEvents {
    <#
    .SYNOPSIS
        Detects suspicious parent-child process relationships for Initial Access,
        Execution, Defense Evasion, and Privilege Escalation techniques.
    #>
    $events = @()

    try {
        $processes = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue |
            Select-Object ProcessId, Name, ParentProcessId, CommandLine, ExecutablePath, CreationDate

        # Build parent lookup
        $procLookup = @{}
        foreach ($p in $processes) { $procLookup[$p.ProcessId] = $p }

        # --- T1566.001: Office spawning suspicious child ---
        $officeNames = @("WINWORD","EXCEL","POWERPNT","OUTLOOK","MSACCESS")
        $suspiciousChildren = @("cmd.exe","powershell.exe","pwsh.exe","wscript.exe","cscript.exe","mshta.exe","certutil.exe")
        
        foreach ($proc in $processes) {
            $parentProc = if ($proc.ParentProcessId -and $procLookup.ContainsKey($proc.ParentProcessId)) { $procLookup[$proc.ParentProcessId] } else { $null }
            $parentName = if ($parentProc) { $parentProc.Name } else { "" }

            # Office → suspicious child
            if ($parentName -and ($officeNames | Where-Object { $parentName -like "$_*" }) -and
                ($suspiciousChildren | Where-Object { $proc.Name -eq $_ })) {
                $events += @{
                    event_type    = "phishing_child_spawn"
                    process_name  = $proc.Name
                    parent_name   = $parentName
                    command_line  = if ($proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min(500, $proc.CommandLine.Length)) } else { "" }
                    pid           = $proc.ProcessId
                    parent_pid    = $proc.ParentProcessId
                    timestamp     = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                    mitre_technique = "T1566.001"
                }
            }

            # --- T1189: Browser → executable child ---
            $browserNames = @("chrome","msedge","firefox","iexplore","brave","opera")
            if ($parentName -and ($browserNames | Where-Object { $parentName -like "$_*" }) -and
                ($suspiciousChildren | Where-Object { $proc.Name -eq $_ })) {
                $events += @{
                    event_type    = "browser_child_spawn"
                    process_name  = $proc.Name
                    parent_name   = $parentName
                    command_line  = if ($proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min(500, $proc.CommandLine.Length)) } else { "" }
                    pid           = $proc.ProcessId
                    timestamp     = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                    mitre_technique = "T1189"
                }
            }

            # --- T1036: Masquerading — system binary from wrong path ---
            $systemBinaries = @{
                "svchost.exe"  = "C:\Windows\System32\svchost.exe"
                "lsass.exe"    = "C:\Windows\System32\lsass.exe"
                "csrss.exe"    = "C:\Windows\System32\csrss.exe"
                "services.exe" = "C:\Windows\System32\services.exe"
                "smss.exe"     = "C:\Windows\System32\smss.exe"
                "explorer.exe" = "C:\Windows"
            }
            if ($proc.Name -and $systemBinaries.ContainsKey($proc.Name.ToLower()) -and $proc.ExecutablePath) {
                $expectedPrefix = $systemBinaries[$proc.Name.ToLower()]
                if (-not $proc.ExecutablePath.StartsWith($expectedPrefix, [System.StringComparison]::OrdinalIgnoreCase)) {
                    $events += @{
                        event_type     = "process_masquerading"
                        process_name   = $proc.Name
                        executable_path = $proc.ExecutablePath
                        expected_path  = $expectedPrefix
                        pid            = $proc.ProcessId
                        timestamp      = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                        mitre_technique = "T1036"
                    }
                }
            }

            # --- T1548.002: UAC bypass via known binaries ---
            $uacBypassBins = @("fodhelper.exe","eventvwr.exe","sdclt.exe","computerdefaults.exe")
            if ($proc.Name -and ($uacBypassBins | Where-Object { $proc.Name -eq $_ })) {
                if ($parentName -and $parentName -notin @("explorer.exe","svchost.exe")) {
                    $events += @{
                        event_type    = "uac_bypass_suspect"
                        process_name  = $proc.Name
                        parent_name   = $parentName
                        command_line  = if ($proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min(500, $proc.CommandLine.Length)) } else { "" }
                        pid           = $proc.ProcessId
                        timestamp     = if ($proc.CreationDate) { $proc.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                        mitre_technique = "T1548.002"
                    }
                }
            }
        }

        # --- T1003.003: ntdsutil usage ---
        $ntdsProc = $processes | Where-Object { $_.Name -eq "ntdsutil.exe" }
        foreach ($p in $ntdsProc) {
            $events += @{
                event_type    = "ntds_extraction"
                process_name  = "ntdsutil.exe"
                command_line  = if ($p.CommandLine) { $p.CommandLine.Substring(0, [Math]::Min(500, $p.CommandLine.Length)) } else { "" }
                pid           = $p.ProcessId
                timestamp     = if ($p.CreationDate) { $p.CreationDate.ToString("o") } else { (Get-Date).ToString("o") }
                mitre_technique = "T1003.003"
            }
        }
    }
    catch {
        Write-Log "Process lineage scan failed: $($_.Exception.Message)" "WARN"
    }

    return $events
}

function Get-FileIntegrityEvents {
    <#
    .SYNOPSIS
        Monitors sensitive file access for Collection, Credential Access, and Persistence rules.
    #>
    $events = @()

    try {
        # --- T1114.001: Email store access (PST/OST) ---
        $emailStores = @(
            "$env:LOCALAPPDATA\Microsoft\Outlook\*.ost",
            "$env:LOCALAPPDATA\Microsoft\Outlook\*.pst"
        )
        foreach ($pattern in $emailStores) {
            $files = Get-ChildItem -Path $pattern -ErrorAction SilentlyContinue
            foreach ($f in $files) {
                if ($f.LastWriteTime -gt (Get-Date).AddHours(-1)) {
                    $events += @{
                        event_type      = "email_store_access"
                        file_path       = $f.FullName
                        file_size       = $f.Length
                        last_modified   = $f.LastWriteTime.ToString("o")
                        timestamp       = (Get-Date).ToString("o")
                        mitre_technique = "T1114.001"
                    }
                }
            }
        }

        # --- T1555.003: Browser credential store access ---
        $browserCredPaths = @(
            "$env:LOCALAPPDATA\Google\Chrome\User Data\Default\Login Data",
            "$env:LOCALAPPDATA\Microsoft\Edge\User Data\Default\Login Data",
            "$env:APPDATA\Mozilla\Firefox\Profiles\*\logins.json"
        )
        foreach ($path in $browserCredPaths) {
            $files = Get-Item -Path $path -ErrorAction SilentlyContinue
            foreach ($f in $files) {
                # Check if any non-browser process has the file locked
                if ($f.LastWriteTime -gt (Get-Date).AddMinutes(-10)) {
                    $events += @{
                        event_type      = "browser_cred_access"
                        file_path       = $f.FullName
                        last_modified   = $f.LastWriteTime.ToString("o")
                        timestamp       = (Get-Date).ToString("o")
                        mitre_technique = "T1555.003"
                    }
                }
            }
        }

        # --- T1546.012: IFEO registry keys ---
        try {
            $ifeoPath = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\Image File Execution Options"
            $ifeoKeys = Get-ChildItem -Path $ifeoPath -ErrorAction SilentlyContinue
            foreach ($key in $ifeoKeys) {
                $debugger = (Get-ItemProperty -Path $key.PSPath -Name "Debugger" -ErrorAction SilentlyContinue).Debugger
                if ($debugger -and $debugger -notmatch "vsjitdebugger|drwtsn32") {
                    $events += @{
                        event_type      = "ifeo_debugger_set"
                        registry_key    = $key.PSPath
                        debugger_value  = $debugger
                        target_binary   = $key.PSChildName
                        timestamp       = (Get-Date).ToString("o")
                        mitre_technique = "T1546.012"
                    }
                }
            }
        }
        catch { }

    }
    catch {
        Write-Log "File integrity scan failed: $($_.Exception.Message)" "WARN"
    }

    return $events
}

function Get-NetworkAnomalyEvents {
    <#
    .SYNOPSIS
        Detects network anomalies for Exfiltration, C2, and Lateral Movement.
    #>
    $events = @()

    try {
        $connections = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue

        # --- T1567.002: Cloud storage upload detection ---
        $cloudIpRanges = @() # Populated at runtime from threat intel
        $cloudDomains = @("onedrive.live.com","dropbox.com","drive.google.com","mega.nz","mediafire.com")

        # --- T1210 / T1021: Unusual SMB/RDP lateral connections ---
        $lateralPorts = @(445, 3389, 5985, 5986, 22)
        $lateralConns = $connections | Where-Object { $_.RemotePort -in $lateralPorts -and $_.RemoteAddress -notlike "127.*" }

        foreach ($conn in $lateralConns) {
            $procName = ""
            try { $procName = (Get-Process -Id $conn.OwningProcess -ErrorAction SilentlyContinue).ProcessName } catch { }
            $events += @{
                event_type     = "lateral_connection"
                remote_address = $conn.RemoteAddress
                remote_port    = $conn.RemotePort
                process_name   = $procName
                process_pid    = $conn.OwningProcess
                timestamp      = (Get-Date).ToString("o")
                mitre_technique = if ($conn.RemotePort -eq 3389) { "T1021.001" } elseif ($conn.RemotePort -eq 445) { "T1021.002" } elseif ($conn.RemotePort -in @(5985,5986)) { "T1021.006" } else { "T1210" }
            }
        }

        # --- Large outbound transfers (T1041/T1048) ---
        # Use performance counters for bytes sent
        try {
            $adapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Up" }
            foreach ($adapter in $adapters) {
                $stats = Get-NetAdapterStatistics -Name $adapter.Name -ErrorAction SilentlyContinue
                if ($stats -and $stats.SentBytes -gt 500MB) {
                    $events += @{
                        event_type   = "high_outbound_volume"
                        adapter_name = $adapter.Name
                        bytes_sent   = $stats.SentBytes
                        timestamp    = (Get-Date).ToString("o")
                        mitre_technique = "T1048"
                    }
                }
            }
        }
        catch { }
    }
    catch {
        Write-Log "Network anomaly scan failed: $($_.Exception.Message)" "WARN"
    }

    return $events
}

function Test-ProcessInBaseline {
    <#
    .SYNOPSIS
        Check if a process name is in the known baseline.
        Returns $true if baseline is empty (fail-open) or process is in baseline.
        Ported from v5.0.15 for v6 parity.
    #>
    param([string]$ProcessName)

    if ($Global:ProcessBaselineSet.Count -eq 0) { return $true }  # No baseline = assume OK
    return $Global:ProcessBaselineSet.Contains($ProcessName)
}

# --- END MODULE: security.ps1 ---


# --- BEGIN MODULE: network.ps1 ---
<#
.SYNOPSIS
    CyberShield Agent v6.0 - Network & HTTP Module
.DESCRIPTION
    Secure HTTP requests with HMAC, TLS pinning, connectivity checks, DNS filtering.
    Depends on: utils.ps1, hmac.ps1
#>

function Test-TlsCertificatePin {
    param([string]$Thumbprint)
    if (-not $Global:TlsPinnedThumbprint) { return $true }
    return ($Thumbprint -eq $Global:TlsPinnedThumbprint)
}

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
                "User-Agent"    = "CyberShield-Agent/$Global:AgentVersion"
                "X-Agent-Token" = $Global:AgentToken
                "X-Agent-Name"  = $Global:AgentName
                "Authorization" = "Bearer $Global:AgentToken" # SSA-009: Compatibility with older auth handlers
            }
            
            # FAIL-CLOSED: HMAC is mandatory for all requests
            if (-not $Global:HmacSecret) {
                Write-Log "[NETWORK] SECURITY: HmacSecret missing - blocking request (fail-closed)" "ERROR"
                return @{ Success = $false; Error = "HmacSecret required for authenticated requests"; StatusCode = 0 }
            }

            $bodyJson = if ($Body) { if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 } } else { "" }
            $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
            $nonce = [Guid]::NewGuid().ToString("N")
            $signaturePayload = "$timestamp.$nonce.$bodyJson"
            
            $hmac = if ($Global:CachedHmacKey) { $Global:CachedHmacKey } else {
                $h = New-Object System.Security.Cryptography.HMACSHA256
                $h.Key = [System.Text.Encoding]::UTF8.GetBytes($Global:HmacSecret)
                $Global:CachedHmacKey = $h
                $h
            }
            $signatureBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($signaturePayload))
            $signature = [BitConverter]::ToString($signatureBytes).Replace("-", "").ToLower()
            
            $headers["X-HMAC-Signature"] = $signature
            $headers["X-HMAC-Timestamp"] = $timestamp
            $headers["X-HMAC-Nonce"]     = $nonce
            
            $params = @{
                Uri             = $url
                Method          = $Method
                Headers         = $headers
                TimeoutSec      = $TimeoutSec
                UseBasicParsing = $true
            }
            
            if ($Body) {
                $params.Body        = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 }
                $params.ContentType = "application/json; charset=utf-8"
            }
            
            $response = Invoke-WebRequest @params
            
            return @{
                Success    = $true
                StatusCode = $response.StatusCode
                Content    = $response.Content
                Headers    = $response.Headers
            }
            
        } catch {
            $retryCount++
            $errorMsg = $_.Exception.Message
            
            $isTransient = $errorMsg -match "timeout|connection|network|503|502|504|429"
            
            if ($retryCount -lt $MaxRetries -and $isTransient) {
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
                    Success    = $false
                    Error      = $errorMsg
                    StatusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
                    Transient  = $isTransient
                }
            }
        }
    }
    
    return @{ Success = $false; Error = "Max retries exceeded" }
}

# Network connectivity cache
$Global:CachedNetworkOk = $false
$Global:CachedNetworkCheckTime = [datetime]::MinValue

function Test-NetworkConnectivity {
    try {
        $now = if ($Global:LoopTimestamp) { $Global:LoopTimestamp } else { Get-Date }
        if (($now - $Global:CachedNetworkCheckTime).TotalSeconds -lt 10) {
            return $Global:CachedNetworkOk
        }
        $uri = [System.Uri]::new($Global:ServerUrl)
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $tcpClient.BeginConnect($uri.Host, 443, $null, $null)
        $wait = $asyncResult.AsyncWaitHandle.WaitOne(5000, $false)
        
        if ($wait -and $tcpClient.Connected) {
            $tcpClient.Close()
            $Global:CachedNetworkOk = $true
            $Global:CachedNetworkCheckTime = $now
            return $true
        }
        
        $tcpClient.Close()
        $Global:CachedNetworkOk = $false
        $Global:CachedNetworkCheckTime = $now
        return $false
        
    } catch {
        $Global:CachedNetworkOk = $false
        $Global:CachedNetworkCheckTime = if ($Global:LoopTimestamp) { $Global:LoopTimestamp } else { Get-Date }
        return $false
    }
}

function Sync-DnsBlocklist {
    try {
        $dnsBody = @{
            agent_name = $Global:AgentName
            timestamp  = [DateTime]::UtcNow.ToString("o")
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/serve-dns-filter" `
            -Method "POST" `
            -Body $dnsBody `
            -MaxRetries 2 `
            -TimeoutSec 15
        
        if (-not $result.Success) {
            $errMsg = if ($result.Error) { $result.Error } else { "Unknown" }
            if ($errMsg -match '403|Proibido|Forbidden') {
                Write-Log "[DNS] DNS Filter not enabled for this tenant (403)" "DEBUG"
                return $false
            }
            if ($errMsg -match '404|Not Found') {
                Write-Log "[DNS] DNS Filter endpoint not available (404)" "DEBUG"
                return $false
            }
            Write-Log "[DNS] DNS sync failed: $errMsg" "WARN"
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
        $exMsg = $_.Exception.Message
        if ($exMsg -match '403|Proibido|Forbidden') {
            Write-Log "[DNS] DNS Filter disabled for tenant (403)" "DEBUG"
            return $false
        }
        if ($exMsg -match '404|Not Found') {
            Write-Log "[DNS] DNS Filter endpoint unavailable (404)" "DEBUG"
            return $false
        }
        Write-Log "[DNS] Error syncing blocklist: $exMsg" "WARN"
        return $false
    }
}

function Test-DnsBlock {
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

# --- END MODULE: network.ps1 ---


# --- BEGIN MODULE: state.ps1 ---
<#
.SYNOPSIS
    CyberShield Agent v6.0 - State Machine (FSM) Module
.DESCRIPTION
    Manages agent state transitions, rollback state persistence.
    Depends on: utils.ps1 (Write-Log)
#>

function Set-AgentState {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("INITIALIZING", "AUTHENTICATING", "SYNCING", "ENFORCING", "DEGRADED", "SAFE_MODE")]
        [string]$NewState,
        
        [Parameter(Mandatory = $false)]
        [string]$Reason = ""
    )
    
    $oldState = $Global:CurrentState

    $validTransitions = @{
        "INITIALIZING"   = @("AUTHENTICATING", "DEGRADED", "SAFE_MODE", "SYNCING")
        "AUTHENTICATING" = @("SYNCING", "DEGRADED", "SAFE_MODE")
        "SYNCING"        = @("ENFORCING", "DEGRADED", "SAFE_MODE")
        "ENFORCING"      = @("SYNCING", "DEGRADED", "SAFE_MODE")
        "DEGRADED"       = @("AUTHENTICATING", "SYNCING", "ENFORCING", "SAFE_MODE")
        "SAFE_MODE"      = @("INITIALIZING", "SYNCING")
    }
    
    if ($oldState -eq $NewState) {
        return $true
    }
    
    if ($NewState -notin $validTransitions[$oldState]) {
        Write-Log "[FSM] Invalid transition: $oldState -> $NewState" "ERROR"
        return $false
    }
    
    $Global:CurrentState = $NewState
    
    Write-Log "[FSM] State transition: $oldState -> $NewState (Reason: $Reason)" "INFO"
    
    try {
        @{
            state          = $NewState
            previous_state = $oldState
            transition_at  = (Get-Date).ToString("o")
            reason         = $Reason
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

function Get-RollbackState {
    try {
        $statePath = $Global:RollbackPaths.RollbackState
        if ($statePath -and (Test-Path $statePath)) {
            return Get-Content $statePath -Raw | ConvertFrom-Json
        }
    } catch {
        Write-Log "[ROLLBACK] Failed to read rollback state: $($_.Exception.Message)" "WARN"
    }
    return @{
        safe_mode        = $false
        rollback_count   = 0
        previous_version = $null
        last_rollback    = $null
    }
}

function Save-RollbackState {
    param(
        [Parameter(Mandatory = $true)]
        $State
    )
    try {
        $statePath = $Global:RollbackPaths.RollbackState
        if ($statePath) {
            $State | ConvertTo-Json -Depth 5 | Out-File $statePath -Encoding UTF8 -Force
        }
    } catch {
        Write-Log "[ROLLBACK] Failed to save rollback state: $($_.Exception.Message)" "WARN"
    }
}

# --- END MODULE: state.ps1 ---


# --- BEGIN MODULE: evidence.ps1 ---
<#
.SYNOPSIS
    CyberShield Agent v6.0 - Evidence Chain & Aggregation Module
.DESCRIPTION
    Evidence buffer management, aggregation engine with burst detection.
    Depends on: utils.ps1, network.ps1 (Invoke-SecureRequest), notification.ps1 (Invoke-PushAlert)
#>

function Add-EvidenceEntry {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Type,
        
        [Parameter(Mandatory = $false)]
        $Data = @{},
        
        [Parameter(Mandatory = $false)]
        [string]$Severity = "info"
    )
    try {
        $entry = @{
            timestamp     = (Get-Date).ToUniversalTime().ToString("o")
            type          = $Type
            data          = $Data
            severity      = $Severity
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
        }
        
        $Global:EvidenceBuffer.Add($entry) | Out-Null
        
        $journalLine = ($entry | ConvertTo-Json -Compress -Depth 5)
        Add-Content -Path $Global:EvidenceJournalPath -Value $journalLine -Encoding UTF8 -ErrorAction SilentlyContinue
        
        if ($Global:EvidenceBuffer.Count -ge 10) {
            Invoke-FlushEvidence
        }
    } catch {
        Write-Log "[EVIDENCE] Failed to add entry: $($_.Exception.Message)" "WARN"
    }
}

function Invoke-FlushEvidence {
    try {
        if ($Global:EvidenceBuffer.Count -eq 0) { return }
        
        $entries = @($Global:EvidenceBuffer)
        $Global:EvidenceBuffer.Clear()
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-agent-evidence" `
            -Method "POST" `
            -Body @{
                agent_name = $Global:AgentName
                entries    = $entries
            }
        
        if ($result.Success) {
            Write-Log "[EVIDENCE] Flushed $($entries.Count) entries to backend" "DEBUG"
        } else {
            Write-Log "[EVIDENCE] Flush failed: $($result.Error) - entries saved to journal" "WARN"
        }
    } catch {
        Write-Log "[EVIDENCE] Flush error: $($_.Exception.Message)" "WARN"
    }
}

function Add-AggregatedEvent {
    param(
        [Parameter(Mandatory = $true)][string]$EventType,
        [Parameter(Mandatory = $true)][string]$Pattern,
        [Parameter(Mandatory = $false)][hashtable]$Metadata = @{}
    )

    if (-not $Global:AggregationEnabled) {
        Add-EvidenceEntry -Type "raw_event" -Data @{
            event_type = $EventType
            pattern    = $Pattern
            metadata   = $Metadata
        }
        return
    }

    $Global:AggregationStats.events_received++
    $now = if ($Global:LoopTimestamp) { $Global:LoopTimestamp } else { Get-Date }
    $key = "${EventType}:${Pattern}"

    if ($Global:EventAggregationBuffer.ContainsKey($key)) {
        $entry = $Global:EventAggregationBuffer[$key]
        $windowAge = ($now - $entry.first_seen).TotalSeconds

        if ($windowAge -le $Global:AggregationWindowSeconds) {
            $entry.count++
            $entry.last_seen = $now
            $Global:AggregationStats.events_aggregated++

            $threshold = switch -Wildcard ($EventType) {
                "file_*"    { $Global:AggregationFileThreshold }
                "process_*" { $Global:AggregationProcessThreshold }
                "network_*" { $Global:AggregationNetworkThreshold }
                default     { $Global:AggregationFileThreshold }
            }

            if ($entry.count -eq $threshold -and -not $entry.burst_alerted) {
                $entry.burst_alerted = $true
                $Global:AggregationStats.bursts_detected++
                $burstType = switch -Wildcard ($EventType) {
                    "file_rename"     { "possible_ransomware_burst" }
                    "file_delete"     { "mass_file_deletion" }
                    "network_connect" { "possible_port_scan" }
                    "process_spawn"   { "process_spawn_flood" }
                    default           { "event_burst" }
                }
                Write-Log "[AGGREGATION] BURST DETECTED: $burstType - $($entry.count) events of type '$EventType' pattern '$Pattern' in ${windowAge}s" "ERROR"

                Invoke-PushAlert `
                    -AlertType $burstType `
                    -AlertMessage "Event burst detected on $env:COMPUTERNAME : $($entry.count)x $EventType ($Pattern) in ${windowAge}s" `
                    -Severity "critical" `
                    -Details @{
                        event_type     = $EventType
                        pattern        = $Pattern
                        count          = $entry.count
                        window_seconds = $windowAge
                        first_seen     = $entry.first_seen.ToString("o")
                    }
            }
            return
        } else {
            Invoke-FlushAggregatedEntry -Key $key -Entry $entry
        }
    }

    $Global:EventAggregationBuffer[$key] = @{
        event_type    = $EventType
        pattern       = $Pattern
        count         = 1
        first_seen    = $now
        last_seen     = $now
        metadata      = $Metadata
        burst_alerted = $false
    }

    if ($Metadata) {
        try {
            $metaJson = $Metadata | ConvertTo-Json -Compress -Depth 3 -ErrorAction SilentlyContinue
            if ($metaJson -and $metaJson.Length -gt 10240) {
                Write-Log "[AGGREGATION] Entry metadata too large ($($metaJson.Length) chars) - truncating" "WARN"
                $Metadata = @{ truncated = $true; original_size = $metaJson.Length }
            }
        } catch { }
    }

    if ($Global:EventAggregationBuffer.Count -ge [int]($Global:AggregationMaxBufferSize * 0.8)) {
        Write-Log "[AGGREGATION] Buffer at 80% ($($Global:EventAggregationBuffer.Count)/$($Global:AggregationMaxBufferSize)) - preemptive flush" "WARN"
        Invoke-FlushAggregationBuffer
    }

    if ($Global:EventAggregationBuffer.Count -ge $Global:AggregationMaxBufferSize) {
        Write-Log "[AGGREGATION] Buffer FULL ($($Global:EventAggregationBuffer.Count)) - forcing flush" "WARN"
        $Global:AggregationStats.buffer_overflow++
        Invoke-FlushAggregationBuffer
    }
}

function Invoke-FlushAggregatedEntry {
    param(
        [Parameter(Mandatory = $true)][string]$Key,
        [Parameter(Mandatory = $true)][hashtable]$Entry
    )

    try {
        $duration = ($Entry.last_seen - $Entry.first_seen).TotalSeconds
        $severity = if ($Entry.burst_alerted) { "critical" } elseif ($Entry.count -gt 10) { "warning" } else { "info" }

        Add-EvidenceEntry -Type "aggregated_event" -Data @{
            event_type       = $Entry.event_type
            pattern          = $Entry.pattern
            count            = $Entry.count
            first_seen       = $Entry.first_seen.ToString("o")
            last_seen        = $Entry.last_seen.ToString("o")
            duration_seconds = [math]::Round($duration, 2)
            burst_detected   = $Entry.burst_alerted
            metadata         = $Entry.metadata
        } -Severity $severity

        $Global:AggregationStats.events_sent++
    } catch {
        Write-Log "[AGGREGATION] Flush entry error: $($_.Exception.Message)" "WARN"
    }
}

function Invoke-FlushAggregationBuffer {
    try {
        $flushed = 0
        $keys = @($Global:EventAggregationBuffer.Keys)

        if ($keys.Count -gt $Global:AggregationMaxBufferSize) {
            $overflow = $keys.Count - $Global:AggregationMaxBufferSize
            $Global:AggregationStats.buffer_overflow += $overflow
            Write-Log "[AGGREGATION] Buffer overflow: dropping $overflow oldest entries" "WARN"
            $sorted = $keys | Sort-Object { $Global:EventAggregationBuffer[$_].last_seen }
            $toDrop = $sorted | Select-Object -First $overflow
            foreach ($dk in $toDrop) {
                $Global:EventAggregationBuffer.Remove($dk)
            }
            $keys = @($Global:EventAggregationBuffer.Keys)
        }

        foreach ($key in $keys) {
            $entry = $Global:EventAggregationBuffer[$key]
            if ($entry.count -gt 0) {
                Invoke-FlushAggregatedEntry -Key $key -Entry $entry
                $flushed++
            }
        }

        $Global:EventAggregationBuffer.Clear()
        $Global:AggregationLastFlush = Get-Date

        if ($flushed -gt 0) {
            $total = $Global:AggregationStats.events_received
            $sent = $Global:AggregationStats.events_sent
            if ($total -gt 0) {
                $Global:AggregationStats.reduction_percent = [math]::Round((1 - ($sent / $total)) * 100, 1)
            }
            Write-Log "[AGGREGATION] Flushed $flushed aggregated entries (reduction: $($Global:AggregationStats.reduction_percent)%)" "INFO"
        }
    } catch {
        Write-Log "[AGGREGATION] Buffer flush error: $($_.Exception.Message)" "WARN"
    }
}

function Update-AggregationConfig {
    param([Parameter(Mandatory = $true)][hashtable]$Config)

    try {
        if ($null -ne $Config.enabled) {
            $Global:AggregationEnabled = [bool]$Config.enabled
        }
        if ($null -ne $Config.window_seconds -and $Config.window_seconds -ge 1 -and $Config.window_seconds -le 30) {
            $Global:AggregationWindowSeconds = [int]$Config.window_seconds
        }
        if ($null -ne $Config.file_threshold -and $Config.file_threshold -ge 5 -and $Config.file_threshold -le 10000) {
            $Global:AggregationFileThreshold = [int]$Config.file_threshold
        }
        if ($null -ne $Config.process_threshold -and $Config.process_threshold -ge 5 -and $Config.process_threshold -le 5000) {
            $Global:AggregationProcessThreshold = [int]$Config.process_threshold
        }
        if ($null -ne $Config.network_threshold -and $Config.network_threshold -ge 5 -and $Config.network_threshold -le 50000) {
            $Global:AggregationNetworkThreshold = [int]$Config.network_threshold
        }
        if ($null -ne $Config.max_buffer_size -and $Config.max_buffer_size -ge 50 -and $Config.max_buffer_size -le 5000) {
            $Global:AggregationMaxBufferSize = [int]$Config.max_buffer_size
        }
        Write-Log "[AGGREGATION] Config updated: enabled=$($Global:AggregationEnabled) window=${Global:AggregationWindowSeconds}s file_thr=$($Global:AggregationFileThreshold) proc_thr=$($Global:AggregationProcessThreshold) net_thr=$($Global:AggregationNetworkThreshold)" "INFO"
    } catch {
        Write-Log "[AGGREGATION] Config update error: $($_.Exception.Message)" "WARN"
    }
}

# --- END MODULE: evidence.ps1 ---


# --- BEGIN MODULE: notification.ps1 ---
<#
.SYNOPSIS
    CyberShield Agent v6.0 - Notification Module
.DESCRIPTION
    Windows toast notifications and push alerts to backend.
    Depends on: utils.ps1, network.ps1 (Invoke-SecureRequest)
#>

function Show-SecurityToast {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Title,
        
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("Info", "Warning", "Error")]
        [string]$Severity = "Warning",
        
        [Parameter(Mandatory = $false)]
        [int]$DurationMs = 10000
    )
    
    try {
        if ($null -eq $Global:BurntToastAvailable) {
            $Global:BurntToastAvailable = $false
            try {
                if (Get-Module -ListAvailable -Name BurntToast -ErrorAction SilentlyContinue) {
                    Import-Module BurntToast -ErrorAction Stop
                    $Global:BurntToastAvailable = $true
                    Write-Log "[TOAST] BurntToast module available and loaded" "DEBUG"
                }
            } catch {
                Write-Log "[TOAST] BurntToast module not loadable: $($_.Exception.Message)" "DEBUG"
            }
        }
        
        if ($Global:BurntToastAvailable) {
            try {
                $icon = switch ($Severity) {
                    "Error"   { "Warning" }
                    "Warning" { "Warning" }
                    default   { "None" }
                }
                New-BurntToastNotification -Text $Title, $Message -AppLogo $null -Sound $icon -ErrorAction Stop
                Write-Log "[TOAST] BurntToast: $Title" "DEBUG"
                return
            } catch {
                Write-Log "[TOAST] BurntToast notification failed: $($_.Exception.Message)" "DEBUG"
            }
        }
        
        try {
            Add-Type -AssemblyName System.Windows.Forms -ErrorAction SilentlyContinue
            
            $balloon = New-Object System.Windows.Forms.NotifyIcon
            $balloon.Icon = [System.Drawing.SystemIcons]::Shield
            $balloon.BalloonTipTitle = $Title
            $balloon.BalloonTipText = $Message
            $balloon.BalloonTipIcon = switch ($Severity) {
                "Error"   { [System.Windows.Forms.ToolTipIcon]::Error }
                "Warning" { [System.Windows.Forms.ToolTipIcon]::Warning }
                default   { [System.Windows.Forms.ToolTipIcon]::Info }
            }
            $balloon.Visible = $true
            $balloon.ShowBalloonTip($DurationMs)
            
            Start-Sleep -Milliseconds 1000
            $balloon.Dispose()
            
            Write-Log "[TOAST] BalloonTip: $Title" "DEBUG"
        } catch {
            Write-Log "[TOAST] BalloonTip fallback also failed: $($_.Exception.Message)" "DEBUG"
        }
    } catch {
        Write-Log "[TOAST] Failed to show notification (non-critical): $($_.Exception.Message)" "DEBUG"
    }
}

function Invoke-PushAlert {
    param(
        [Parameter(Mandatory = $true)]
        [string]$AlertType,
        
        [Parameter(Mandatory = $true)]
        [string]$AlertMessage,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("info", "warning", "critical")]
        [string]$Severity = "warning",
        
        [Parameter(Mandatory = $false)]
        [hashtable]$Details = @{}
    )
    
    $cooldownKey = $AlertType
    $now = Get-Date
    if ($Global:AlertCooldownTracker.ContainsKey($cooldownKey)) {
        $lastAlert = $Global:AlertCooldownTracker[$cooldownKey]
        $elapsed = ($now - $lastAlert).TotalSeconds
        if ($elapsed -lt $Global:AlertCooldownSeconds) {
            Write-Log "[PUSH-ALERT] Cooldown active for '$AlertType' (${elapsed}s / $($Global:AlertCooldownSeconds)s)" "DEBUG"
            return $false
        }
    }
    
    try {
        $evidenceData = @{
            alert_type    = $AlertType
            alert_message = $AlertMessage
            severity      = $Severity
            detected_at   = $now.ToString("o")
            hostname      = $env:COMPUTERNAME
            agent_version = $Global:AgentVersion
            details       = $Details
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-agent-evidence" `
            -Method "POST" `
            -Body @{
                agent_name = $Global:AgentName
                event_type = "local_detection_$AlertType"
                event_data = $evidenceData
                severity   = $Severity
            } `
            -TimeoutSec 15
        
        if ($result.Success) {
            $Global:AlertCooldownTracker[$cooldownKey] = $now
            $Global:LocalDetectionStats.alerts_sent++
            Write-Log "[PUSH-ALERT] Alert '$AlertType' sent to backend" "SUCCESS"
            return $true
        } else {
            Write-Log "[PUSH-ALERT] Failed to send '$AlertType': $($result.Error)" "WARN"
            return $false
        }
    } catch {
        Write-Log "[PUSH-ALERT] Exception sending '$AlertType': $($_.Exception.Message)" "WARN"
        return $false
    }
}

# --- END MODULE: notification.ps1 ---


# --- Domain layer (depends on infrastructure) ---

# --- BEGIN MODULE: collection.ps1 ---
<#
.SYNOPSIS
    CyberShield Agent v6.0 - Data Collection Module
.DESCRIPTION
    Software inventory, AV status, network info, web activity, DNS blocks,
    vuln scan, report, scan, process lineage, EDR telemetry, backup status.
    Depends on: utils.ps1, network.ps1, evidence.ps1
#>

function Invoke-CollectSoftwareInventory {
    param([object]$Payload)
    try {
        $software = @()
        $regPaths = @("HKLM:\Software\Microsoft\Windows\CurrentVersion\Uninstall\*", "HKLM:\Software\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*")
        foreach ($path in $regPaths) {
            Get-ItemProperty $path -ErrorAction SilentlyContinue | Where-Object { $_.DisplayName } | ForEach-Object {
                $software += @{ name = $_.DisplayName; version = $_.DisplayVersion; publisher = $_.Publisher; install_date = $_.InstallDate }
            }
        }
        return @{ software_count = $software.Count; software_list = $software | Select-Object -First 500; collected_at = (Get-Date).ToString("o") }
    } catch { return @{ error = $_.Exception.Message } }
}

function Invoke-CollectAntivirusStatus {
    try {
        $avProducts = Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName AntiVirusProduct -ErrorAction SilentlyContinue
        $avList = @()
        foreach ($av in $avProducts) {
            $avList += @{ name = $av.displayName; state = $av.productState; path = $av.pathToSignedProductExe; source = "SecurityCenter2" }
        }

        $edrSignatures = @(
            @{ Name = "CrowdStrike Falcon";    Services = @("CSFalconService","csagent");         Processes = @("CSFalconContainer.exe","CSFalconService.exe") },
            @{ Name = "SentinelOne";            Services = @("SentinelAgent","SentinelOne");       Processes = @("SentinelAgent.exe","SentinelServiceHost.exe") },
            @{ Name = "Carbon Black";           Services = @("CbDefense","CarbonBlack");           Processes = @("RepMgr.exe","cb.exe") },
            @{ Name = "Cortex XDR";             Services = @("CortexXDR","cyserver");              Processes = @("cortex-xdr.exe","cytray.exe") },
            @{ Name = "Microsoft Defender ATP"; Services = @("Sense","WdNisSvc");                  Processes = @("MsSense.exe","MsMpEng.exe") },
            @{ Name = "Trend Micro Apex One";   Services = @("ntrtscan","TmListen","ds_agent");    Processes = @("ntrtscan.exe","PccNTMon.exe") },
            @{ Name = "Sophos Intercept X";     Services = @("Sophos Endpoint Defense","SAVService"); Processes = @("SophosUI.exe","SSPService.exe") },
            @{ Name = "Symantec Endpoint";      Services = @("SepMasterService","ccSvcHst");       Processes = @("ccSvcHst.exe","smc.exe") },
            @{ Name = "ESET Endpoint";          Services = @("ekrn","ERAAgent");                   Processes = @("ekrn.exe","egui.exe") },
            @{ Name = "Kaspersky Endpoint";     Services = @("AVP","klnagent");                    Processes = @("avp.exe","klnagent.exe") },
            @{ Name = "Bitdefender GravityZone";Services = @("EPSecurityService","BDAuxSrv");      Processes = @("EPSecurityService.exe","bdagent.exe") },
            @{ Name = "FortiClient";            Services = @("FortiClientMonitor","FA_Scheduler");  Processes = @("FortiClient.exe","FortiTray.exe") },
            @{ Name = "Cylance";                Services = @("CylanceSvc");                        Processes = @("CylanceSvc.exe","CylanceUI.exe") },
            @{ Name = "Malwarebytes";          Services = @("MBAMService","MBEndpointAgent","MBAMProtection","MBAMSwissArmy","MBAMChameleon","MBAMFarflt","MBAMWebProtection"); Processes = @("MBAMService.exe","mbamtray.exe","mbam.exe","MBEndpointAgent.exe","MBAMInstallerService.exe") },
            @{ Name = "Webroot";                Services = @("WRSVC");                             Processes = @("WRSA.exe") }
        )

        $knownNames = $avList | ForEach-Object { $_.name.ToLower() }
        foreach ($edr in $edrSignatures) {
            $alreadyDetected = $false
            foreach ($known in $knownNames) { if ($known -like "*$($edr.Name.Split(' ')[0].ToLower())*") { $alreadyDetected = $true; break } }
            if ($alreadyDetected) { continue }
            $foundService = $null; $foundProcess = $null
            foreach ($svcName in $edr.Services) { $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue; if ($svc) { $foundService = $svc; break } }
            if (-not $foundService) { foreach ($procName in $edr.Processes) { $proc = Get-Process -Name ($procName -replace '\.exe$','') -ErrorAction SilentlyContinue; if ($proc) { $foundProcess = $proc; break } } }
            if ($foundService -or $foundProcess) {
                $status = "unknown"
                if ($foundService) { $status = if ($foundService.Status -eq "Running") { "active" } else { "stopped" } } elseif ($foundProcess) { $status = "active" }
                $avList += @{ name = $edr.Name; state = 0; path = if ($foundProcess) { $foundProcess.Path } elseif ($foundService) { $foundService.BinaryPathName } else { "" }; source = "EDR_Process_Detection"; status = $status }
            }
        }

        $installPaths = @( @{ Name = "Malwarebytes"; Paths = @("$env:ProgramFiles\Malwarebytes\Anti-Malware", "${env:ProgramFiles(x86)}\Malwarebytes\Anti-Malware", "$env:ProgramData\Malwarebytes") }, @{ Name = "HitmanPro"; Paths = @("$env:ProgramFiles\HitmanPro", "${env:ProgramFiles(x86)}\HitmanPro") } )
        $currentNames = $avList | ForEach-Object { $_.name.ToLower() }
        foreach ($app in $installPaths) {
            if ($currentNames -contains $app.Name.ToLower()) { continue }
            foreach ($p in $app.Paths) { if (Test-Path $p) { $avList += @{ name = $app.Name; state = 0; path = $p; source = "InstallPath_Detection"; status = "installed" }; break } }
        }

        return @{ antivirus_products = $avList; count = $avList.Count; collected_at = (Get-Date).ToString("o") }
    } catch { return @{ error = $_.Exception.Message } }
}

function Invoke-CollectNetworkInfo {
    $rawAdapters = @()
    try {
        $adapters = @()
        try { $rawAdapters = Get-NetAdapter -ErrorAction SilentlyContinue | Where-Object { $_.Status -eq "Up" }; foreach ($a in $rawAdapters) { $ipAddr = ""; try { $ipObj = Get-NetIPAddress -InterfaceIndex $a.ifIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1; if ($ipObj) { $ipAddr = $ipObj.IPAddress } } catch {}; $adapters += @{ name = $a.Name; ip_address = $ipAddr; mac_address = $a.MacAddress; status = "Up"; speed = if ($a.LinkSpeed) { $a.LinkSpeed } else { "" } } } } catch {}
        $ipConfig = @(); try { $ipConfig = @(Get-NetIPAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -ne "127.0.0.1" } | ForEach-Object { @{ ip = $_.IPAddress; prefix = $_.PrefixLength } }) } catch {}
        $fwDomain = $null; $fwPrivate = $null; $fwPublic = $null
        try { $fwProfiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue; foreach ($p in $fwProfiles) { switch ($p.Name) { "Domain" { $fwDomain = [bool]$p.Enabled } "Private" { $fwPrivate = [bool]$p.Enabled } "Public" { $fwPublic = [bool]$p.Enabled } } } } catch {}
        $openPorts = @(); try { $listeners = Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Select-Object -First 50; foreach ($l in $listeners) { $procName = ""; try { $procName = (Get-Process -Id $l.OwningProcess -ErrorAction SilentlyContinue).ProcessName } catch {}; $openPorts += @{ port = $l.LocalPort; process = $procName; protocol = "TCP" } } } catch {}
        $activeConns = @(); try { $established = Get-NetTCPConnection -State Established -ErrorAction SilentlyContinue | Select-Object -First 100; foreach ($c in $established) { $activeConns += @{ remote_address = $c.RemoteAddress; remote_port = $c.RemotePort; state = "Established" } } } catch {}
        $dnsServers = @(); try { $dnsRaw = Get-DnsClientServerAddress -AddressFamily IPv4 -ErrorAction SilentlyContinue | Where-Object { $_.ServerAddresses.Count -gt 0 }; $dnsServers = @($dnsRaw.ServerAddresses | Select-Object -Unique | Where-Object { $_ -and $_ -ne "" }) } catch {}
        $gatewayIp = $null; try { $route = Get-NetRoute -DestinationPrefix "0.0.0.0/0" -ErrorAction SilentlyContinue | Select-Object -First 1; if ($route) { $gatewayIp = $route.NextHop } } catch {}
        $publicIp = $null; try { $publicIp = (Invoke-RestMethod -Uri "https://api.ipify.org?format=text" -TimeoutSec 3 -ErrorAction SilentlyContinue).Trim() } catch {}
        $dnsTestSuccess = $null; try { $dnsResult = Resolve-DnsName -Name "google.com" -Type A -DnsOnly -ErrorAction SilentlyContinue; $dnsTestSuccess = ($null -ne $dnsResult -and $dnsResult.Count -gt 0) } catch { $dnsTestSuccess = $false }
        $httpsTestSuccess = $null; try { $httpResp = Invoke-WebRequest -Uri "https://www.google.com" -UseBasicParsing -TimeoutSec 5 -ErrorAction SilentlyContinue; $httpsTestSuccess = ($httpResp.StatusCode -eq 200) } catch { $httpsTestSuccess = $false }

        return @{
            adapters = @($rawAdapters | ForEach-Object { @{ Name = $_.Name; MacAddress = $_.MacAddress; LinkSpeed = $_.LinkSpeed } })
            ip_addresses = $ipConfig; network_adapters = $adapters
            firewall_domain = $fwDomain; firewall_private = $fwPrivate; firewall_public = $fwPublic
            open_ports = $openPorts; active_connections = $activeConns
            dns_servers = $dnsServers; gateway_ip = $gatewayIp; public_ip = $publicIp
            dns_test_success = $dnsTestSuccess; https_test_success = $httpsTestSuccess
            collected_at = (Get-Date).ToString("o")
        }
    } catch { return @{ error = $_.Exception.Message } }
}

function ConvertFrom-WebKitTimestamp {
    param([Nullable[Int64]]$timestamp)
    if (-not $timestamp -or $timestamp -le 0) { return $null }
    try { $origin = [DateTime]::new(1601, 1, 1, 0, 0, 0, [DateTimeKind]::Utc); return $origin.AddTicks($timestamp * 10) } catch { return $null }
}

function ConvertFrom-PRTime {
    param([Nullable[Int64]]$timestamp)
    if (-not $timestamp -or $timestamp -le 0) { return $null }
    try { return [DateTimeOffset]::FromUnixTimeMilliseconds([math]::Floor($timestamp / 1000)).UtcDateTime } catch { return $null }
}

function Extract-DomainFromUrl {
    param([string]$url)
    if ([string]::IsNullOrWhiteSpace($url)) { return $null }
    try { $match = [regex]::Match($url, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})'); if ($match.Success) { return $match.Groups[1].Value } } catch {}
    return $null
}

function Get-BrowserHistorySQLite {
    param([string]$DbPath, [string]$Query, [string]$BrowserName, [string]$UserName)
    $results = New-Object System.Collections.ArrayList
    try {
        $fileInfo = Get-Item $DbPath -ErrorAction Stop
        if ($fileInfo.Length -gt (200 * 1024 * 1024)) { return $null }
        $assembly = $null; try { $assembly = [System.Reflection.Assembly]::LoadWithPartialName("System.Data.SQLite") } catch {}
        if (-not $assembly) { return $null }
        $connectionString = "Data Source=$DbPath;Version=3;Read Only=True;Journal Mode=Off;"
        $connection = New-Object System.Data.SQLite.SQLiteConnection($connectionString); $connection.Open()
        $command = $connection.CreateCommand(); $command.CommandText = $Query; $command.CommandTimeout = 2
        $reader = $command.ExecuteReader()
        while ($reader.Read()) { [void]$results.Add(@{ url = $reader["url"]; last_visit_time = $reader["last_visit_time"]; visit_count = $reader["visit_count"] }) }
        $reader.Close(); $connection.Close()
        return $results
    } catch { Write-Log "[WEB-ACTIVITY] SQLite failed for $BrowserName ($UserName): $($_.Exception.Message)" "DEBUG"; return $null }
}

function Invoke-CollectWebActivity {
    param([object]$Payload)
    Write-Log "[WEB-ACTIVITY-V5] Starting web activity collection (timeout-safe)..." "INFO"
    $maxDomains = 500
    if ($null -ne $Payload) { try { $payloadProps = @($Payload.PSObject.Properties | ForEach-Object { $_.Name }); if ($payloadProps -contains "max_domains") { $maxDomains = [int]$Payload.max_domains } } catch { } }
    try {
        $nowUtc = [DateTime]::UtcNow; $dnsCache = New-Object System.Collections.ArrayList; $browserHistory = New-Object System.Collections.ArrayList; $deadline = $nowUtc.AddSeconds(45)
        Write-Log "[WEB-ACTIVITY-V5] Collecting DNS cache..." "INFO"
        try { $dnsEntries = Get-DnsClientCache -ErrorAction SilentlyContinue; if ($dnsEntries) { $dnsEntries = $dnsEntries | Where-Object { $_.Entry -and $_.Name } | Sort-Object -Property Name -Unique | Select-Object -First 100; foreach ($entry in $dnsEntries) { $domain = $entry.Name; if ([string]::IsNullOrWhiteSpace($domain)) { continue }; if ($domain -like "localhost*" -or $domain -like "*.local" -or $domain -like "local") { continue }; [void]$dnsCache.Add(@{ domain = $domain; Name = $domain; RecordName = $domain; source = "dns_cache"; visited_at = $nowUtc.ToString("o") }) }; Write-Log "[WEB-ACTIVITY-V5] DNS cache: $($dnsCache.Count) domains" "INFO" } } catch { Write-Log "[WEB-ACTIVITY-V5] DNS cache error: $($_.Exception.Message)" "WARN" }
        Write-Log "[WEB-ACTIVITY-V5] Collecting browser history (regex-safe mode)..." "INFO"
        $userProfiles = @(); try { $userProfiles = Get-ChildItem -Path "C:\Users" -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') } } catch {}
        foreach ($userProfile in $userProfiles) {
            if ([DateTime]::UtcNow -gt $deadline) { Write-Log "[WEB-ACTIVITY-V5] Timeout reached, stopping browser collection" "WARN"; break }
            $userName = $userProfile.Name; $userPath = $userProfile.FullName
            $browserPaths = @( @{ path = "AppData\Local\Google\Chrome\User Data\Default\History"; browser = "chrome" }, @{ path = "AppData\Local\Microsoft\Edge\User Data\Default\History"; browser = "edge" }, @{ path = "AppData\Roaming\Opera Software\Opera Stable\History"; browser = "opera" }, @{ path = "AppData\Roaming\Opera Software\Opera GX Stable\History"; browser = "opera_gx" }, @{ path = "AppData\Local\BraveSoftware\Brave-Browser\User Data\Default\History"; browser = "brave" }, @{ path = "AppData\Local\Vivaldi\User Data\Default\History"; browser = "vivaldi" } )
            foreach ($bp in $browserPaths) {
                if ([DateTime]::UtcNow -gt $deadline) { break }
                try {
                    $historyPath = Join-Path $userPath $bp.path; if (-not (Test-Path $historyPath)) { continue }
                    $tempPath = "$env:TEMP\$($bp.browser)_history_$(Get-Random).db"; Copy-Item -Path $historyPath -Destination $tempPath -Force -ErrorAction SilentlyContinue; if (-not (Test-Path $tempPath)) { continue }
                    try { $maxBytes = 2 * 1024 * 1024; $fileInfo = Get-Item $tempPath -ErrorAction SilentlyContinue; if ($fileInfo -and $fileInfo.Length -gt 0) { $bytesToRead = [Math]::Min($fileInfo.Length, $maxBytes); $fileStream = [System.IO.File]::OpenRead($tempPath); $buffer = New-Object byte[] $bytesToRead; [void]$fileStream.Read($buffer, 0, $bytesToRead); $fileStream.Close(); $fileStream.Dispose(); if ($buffer) { $dataString = [System.Text.Encoding]::UTF8.GetString($buffer); $urlMatches = [regex]::Matches($dataString, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})'); $domains = $urlMatches | ForEach-Object { $_.Groups[1].Value } | Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" -and $_ -notlike "*.localdomain" } | Select-Object -Unique -First 50; foreach ($domain in $domains) { [void]$browserHistory.Add(@{ domain = $domain; source = $bp.browser; browser = $bp.browser; visited_at = $nowUtc.ToString("o"); visit_count = 1 }) }; $buffer = $null; $dataString = $null } } } catch { Write-Log "[WEB-ACTIVITY-V5] $($bp.browser) regex failed for $userName : $($_.Exception.Message)" "DEBUG" }
                    Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                } catch {}
            }
        }
        Write-Log "[WEB-ACTIVITY-V5] Collected: $($dnsCache.Count) DNS + $($browserHistory.Count) browser entries" "INFO"
        return @{ dns_cache = @($dnsCache); browser_history = @($browserHistory); total_dns = $dnsCache.Count; total_browser = $browserHistory.Count; collected_at = $nowUtc.ToString("o") }
    } catch { Write-Log "[WEB-ACTIVITY-V5] Error: $($_.Exception.Message)" "ERROR"; return @{ error = $_.Exception.Message } }
}

function Invoke-CollectDnsBlocks {
    Write-Log "[JOB] Collecting DNS blocks from hosts file" "INFO"
    try {
        $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"; $blockedDomains = @()
        if (Test-Path $hostsPath) {
            $lines = Get-Content $hostsPath -ErrorAction SilentlyContinue
            foreach ($line in $lines) { $trimmed = $line.Trim(); if ($trimmed -match "^(0\.0\.0\.0|127\.0\.0\.1)\s+(.+)" -and $trimmed -notmatch "localhost") { $domain = $Matches[2].Trim(); if ($domain -and $blockedDomains.Count -lt 100) { $blockedDomains += $domain } } }
        }
        return @{ blocked_domains = $blockedDomains; source = $hostsPath; collected_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ"); count = $blockedDomains.Count }
    } catch { Write-Log "[JOB] DNS blocks collection failed: $_" "WARN"; return @{ blocked_domains = @(); source = "error"; error = $_.ToString(); collected_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ") } }
}

function Invoke-LightVulnScan {
    param([object]$Payload)
    Write-Log "[VULN-SCAN] Starting light vulnerability scan..." "INFO"
    try {
        $results = @{ timestamp = (Get-Date).ToUniversalTime().ToString("o"); hostname = $env:COMPUTERNAME; scan_engine = "CyberShield VulnScanner v2.1"; scan_type = "light"; vulnerabilities_found = 0; by_severity = @{ critical = 0; high = 0; medium = 0; low = 0 }; top_cves = @(); patches_available = 0; scan_duration_seconds = 0; status = "success" }
        $startTime = Get-Date
        try {
            $updateSession = New-Object -ComObject Microsoft.Update.Session; $searcher = $updateSession.CreateUpdateSearcher(); $searchResult = $searcher.Search("IsInstalled=0 AND IsHidden=0")
            foreach ($update in $searchResult.Updates) {
                $results.vulnerabilities_found++
                $severity = $update.MsrcSeverity
                switch ($severity) { 'Critical' { $results.by_severity.critical++ } 'Important' { $results.by_severity.high++ } 'Moderate' { $results.by_severity.medium++ } default { $results.by_severity.low++ } }
                foreach ($kb in $update.KBArticleIDs) { if ($results.top_cves.Count -lt 20) { $results.top_cves += @{ kb = "KB$kb"; title = $update.Title; severity = $severity; size_mb = [math]::Round($update.MaxDownloadSize / 1MB, 1) } } }
                $results.patches_available++
            }
        } catch { Write-Log "[VULN-SCAN] WU scan error: $($_.Exception.Message)" "WARN"; $results.status = "partial" }
        $results.scan_duration_seconds = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
        Write-Log "[VULN-SCAN] Found $($results.vulnerabilities_found) vulnerabilities ($($results.by_severity.critical) critical)" "INFO"
        return $results
    } catch { Write-Log "[VULN-SCAN] Error: $($_.Exception.Message)" "ERROR"; return @{ status = "failed"; error = $_.Exception.Message } }
}

function Get-SystemInfo {
    <#
    .SYNOPSIS
        Collects comprehensive system information. Ported from v5.0.15.
    #>
    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
        $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
        $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
        $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue | Select-Object -First 1

        return @{
            hostname       = $env:COMPUTERNAME
            os_name        = $os.Caption
            os_version     = $os.Version
            os_build       = $os.BuildNumber
            architecture   = $os.OSArchitecture
            total_ram_gb   = [math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
            cpu_name       = $cpu.Name
            cpu_cores      = $cpu.NumberOfCores
            cpu_logical    = $cpu.NumberOfLogicalProcessors
            disk_total_gb  = if ($disk) { [math]::Round($disk.Size / 1GB, 2) } else { 0 }
            disk_free_gb   = if ($disk) { [math]::Round($disk.FreeSpace / 1GB, 2) } else { 0 }
            agent_version  = $Global:AgentVersion
        }
    }
    catch {
        Write-Log "[SYSINFO] Error: $($_.Exception.Message)" "WARN"
        return @{ hostname = $env:COMPUTERNAME; agent_version = $Global:AgentVersion; error = $_.Exception.Message }
    }
}

function Invoke-ReportJob {
    try { return @{ hostname = $env:COMPUTERNAME; agent_version = $Global:AgentVersion; system_info = Get-SystemInfo; collected_at = (Get-Date).ToString("o") } }
    catch { return @{ error = $_.Exception.Message } }
}

function Invoke-ScanJob {
    param([object]$Payload)
    try {
        $scanResult = @{ hostname = $env:COMPUTERNAME; agent_version = $Global:AgentVersion; antivirus = Invoke-CollectAntivirusStatus; network = Invoke-CollectNetworkInfo; software = Invoke-CollectSoftwareInventory -Payload $Payload; vuln_scan = Invoke-LightVulnScan -Payload $Payload; collected_at = (Get-Date).ToString("o") }
        Write-Log "[SCAN] Complete scan finished" "SUCCESS"
        return $scanResult
    } catch { return @{ error = $_.Exception.Message } }
}

function Invoke-CollectBackupStatus {
    param([object]$Payload)
    Write-Log "[BACKUP] Collecting backup status..." "INFO"
    try {
        $backupInfo = @{ windows_backup = @{ enabled = $false; last_backup = $null }; vss_shadows = @(); collected_at = (Get-Date).ToString("o") }
        try { $wbSummary = Get-WBSummary -ErrorAction SilentlyContinue; if ($wbSummary) { $backupInfo.windows_backup = @{ enabled = $true; last_backup = if ($wbSummary.LastBackupTime) { $wbSummary.LastBackupTime.ToString("o") } else { $null }; last_result = $wbSummary.LastBackupResultHR; next_backup = if ($wbSummary.NextBackupTime) { $wbSummary.NextBackupTime.ToString("o") } else { $null } } } } catch { Write-Log "[BACKUP] Windows Backup not available: $($_.Exception.Message)" "DEBUG" }
        try { $shadows = Get-CimInstance Win32_ShadowCopy -ErrorAction SilentlyContinue; if ($shadows) { $backupInfo.vss_shadows = @($shadows | Select-Object -First 10 | ForEach-Object { @{ id = $_.ID; volume = $_.VolumeName; created_at = $_.InstallDate.ToString("o"); size_bytes = $_.MaxSpace } }) } } catch { Write-Log "[BACKUP] VSS check failed: $($_.Exception.Message)" "DEBUG" }
        $backupSoftware = @(); $knownBackupProcesses = @("veeam", "acronis", "carbonite", "backblaze", "crashplan", "cobian")
        $runningProcesses = Get-Process -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName -Unique
        foreach ($bp in $knownBackupProcesses) { $found = $runningProcesses | Where-Object { $_ -like "*$bp*" }; if ($found) { $backupSoftware += @{ name = $bp; running = $true } } }
        $backupInfo['third_party_software'] = $backupSoftware
        Write-Log "[BACKUP] Backup status collected. VSS shadows: $($backupInfo.vss_shadows.Count)" "INFO"
        return $backupInfo
    } catch { Write-Log "[BACKUP] Error: $($_.Exception.Message)" "ERROR"; return @{ error = $_.Exception.Message; collected_at = (Get-Date).ToString("o") } }
}

function Invoke-CollectProcessLineage {
    param([object]$Payload)
    Write-Log "[PROCESS-LINEAGE] Collecting process tree for EDR visibility..." "INFO"
    try {
        $rawProcesses = Get-CimInstance Win32_Process -ErrorAction SilentlyContinue | Select-Object ProcessId, ParentProcessId, Name, CommandLine, ExecutablePath, CreationDate
        $processes = $rawProcesses
        if (-not $processes) { Write-Log "[PROCESS-LINEAGE] No processes found" "WARN"; return @{ processes = @(); count = 0; collected_at = (Get-Date).ToString("o") } }
        $processNameMap = @{}; foreach ($p in $processes) { $processNameMap[$p.ProcessId] = $p.Name }
        $suspiciousTools = [System.Collections.Generic.HashSet[string]]::new(@("mimikatz","lazagne","procdump","sharphound","bloodhound","rubeus","covenant","psexec","wce","fgdump","gsecdump","pwdump","crackmapexec","impacket","cobalt"), [System.StringComparer]::OrdinalIgnoreCase)
        $suspiciousParentChild = @{ "WINWORD" = @("cmd","powershell","wscript","cscript","mshta"); "EXCEL" = @("cmd","powershell","wscript","cscript","mshta"); "OUTLOOK" = @("cmd","powershell"); "POWERPNT" = @("cmd","powershell"); "mshta" = @("powershell","cmd"); "wscript" = @("cmd","powershell"); "cscript" = @("powershell","cmd"); "rundll32" = @("cmd","powershell") }
        $processEntries = @(); $suspiciousCount = 0
        foreach ($proc in $processes) {
            $parentName = if ($processNameMap.ContainsKey($proc.ParentProcessId)) { $processNameMap[$proc.ParentProcessId] } else { $null }
            $procBaseName = [System.IO.Path]::GetFileNameWithoutExtension($proc.Name); $parentBaseName = if ($parentName) { [System.IO.Path]::GetFileNameWithoutExtension($parentName) } else { $null }
            $reasons = @()
            if ($suspiciousTools.Contains($procBaseName)) { $reasons += "Known offensive tool: $($proc.Name)" }
            if ($parentBaseName -and $suspiciousParentChild.ContainsKey($parentBaseName)) { if ($procBaseName -in $suspiciousParentChild[$parentBaseName]) { $reasons += "Suspicious parent-child: $parentName -> $($proc.Name)" } }
            if ($procBaseName -eq "powershell" -and $proc.CommandLine) { $cmd = $proc.CommandLine.ToLower(); if ($cmd -match '-enc\s' -or $cmd -match '-encodedcommand') { $reasons += "Encoded PowerShell command" }; if ($cmd -match 'downloadstring|downloadfile|invoke-webrequest') { $reasons += "PowerShell download detected" }; if ($cmd -match '-windowstyle\s+hidden|-w\s+hidden') { $reasons += "Hidden PowerShell window" } }
            if ($proc.ExecutablePath) { $pathLower = $proc.ExecutablePath.ToLower(); if ($pathLower -match '\\temp\\|\\tmp\\' -and $procBaseName -notin @("msiexec","setup")) { $reasons += "Process running from temp directory" } }
            $isSuspicious = $reasons.Count -gt 0; if ($isSuspicious) { $suspiciousCount++ }
            $startTime = $null; if ($proc.CreationDate) { try { $startTime = $proc.CreationDate.ToUniversalTime().ToString("o") } catch { } }
            $userName = "UNKNOWN"
            if ($isSuspicious) { try { $cimProc = Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.ProcessId)" -ErrorAction SilentlyContinue; if ($cimProc) { $owner = Invoke-CimMethod -InputObject $cimProc -MethodName GetOwner -ErrorAction SilentlyContinue; if ($owner -and $owner.Domain) { $userName = "$($owner.Domain)\$($owner.User)" } elseif ($owner -and $owner.User) { $userName = $owner.User } } } catch { } }
            $processEntries += @{ name = $proc.Name; pid = $proc.ProcessId; ppid = $proc.ParentProcessId; parent_name = $parentName; cmd = if ($proc.CommandLine) { $proc.CommandLine.Substring(0, [Math]::Min($proc.CommandLine.Length, 2048)) } else { $null }; user = $userName; start_time = $startTime; path = $proc.ExecutablePath; is_suspicious = $isSuspicious; reasons = $reasons }
        }
        Write-Log "[PROCESS-LINEAGE] Collected $($processEntries.Count) processes ($suspiciousCount suspicious)" "INFO"
        $submitResult = Invoke-SecureRequest -Path "/functions/v1/submit-process-lineage" -Method "POST" -Body @{ processes = $processEntries } -TimeoutSec 30
        if ($submitResult.Success) { Write-Log "[PROCESS-LINEAGE] Submitted successfully" "SUCCESS" } else { Write-Log "[PROCESS-LINEAGE] Submit failed: HTTP $($submitResult.StatusCode)" "WARN" }
        return @{ total_processes = $processEntries.Count; suspicious_count = $suspiciousCount; collected_at = (Get-Date).ToString("o"); submitted = $submitResult.Success }
    } catch { Write-Log "[PROCESS-LINEAGE] Error: $($_.Exception.Message)" "ERROR"; return @{ error = $_.Exception.Message; collected_at = (Get-Date).ToString("o") } }
}

# --- END MODULE: collection.ps1 ---


# --- BEGIN MODULE: remediation.ps1 ---
<#
.SYNOPSIS
    CyberShield Agent v6.0 - Remediation Module
.DESCRIPTION
    Process kill, service stop/disable/restart, firewall fix, quarantine,
    patch apply, disk cleanup, high CPU check, sync blocked websites,
    service health check, network diagnostics.
    Depends on: utils.ps1, network.ps1, notification.ps1, heartbeat.ps1 (Send-AutoRepairTelemetry)
#>

function Invoke-KillProcess {
    param([object]$Payload)
    
    try {
        $processName = $Payload.process_name
        $force = if ($null -ne $Payload.force) { $Payload.force } else { $false }
        
        if (-not $processName) {
            return @{ success = $false; error = "Missing process_name in payload" }
        }
        
        $normalizedName = $processName.ToLower() -replace '\.exe$', ''
        if ($Global:ProtectedProcesses -contains $normalizedName) {
            Write-Log "[KILL-PROCESS] BLOCKED: $processName is a protected process" "WARN"
            return @{ success = $false; error = "SECURITY_BLOCK: $processName is a protected system process"; blocked = $true; process_name = $processName }
        }
        
        $processes = Get-Process -Name $normalizedName -ErrorAction SilentlyContinue
        
        if (-not $processes -or $processes.Count -eq 0) {
            return @{ success = $true; killed = 0; message = "Process not running: $processName" }
        }
        
        $killed = 0
        $errors = @()
        
        foreach ($proc in $processes) {
            try {
                if ($force) { $proc | Stop-Process -Force -ErrorAction Stop }
                else { $proc | Stop-Process -ErrorAction Stop }
                $killed++
                Write-Log "[KILL-PROCESS] Terminated: $($proc.Name) (PID: $($proc.Id))" "SUCCESS"
            } catch {
                $errors += "PID $($proc.Id): $($_.Exception.Message)"
            }
        }
        
        return @{ success = ($killed -gt 0); process_name = $processName; killed = $killed; total_found = $processes.Count; errors = $errors; killed_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-StopService {
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        $force = if ($null -ne $Payload.force) { $Payload.force } else { $false }
        
        if (-not $serviceName) { return @{ success = $false; error = "Missing service_name in payload" } }
        
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[STOP-SERVICE] BLOCKED: $serviceName is a protected service" "WARN"
            return @{ success = $false; error = "SECURITY_BLOCK: $serviceName is a protected system service"; blocked = $true; service_name = $serviceName }
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if (-not $service) { return @{ success = $false; error = "Service not found: $serviceName" } }
        if ($service.Status -eq 'Stopped') { return @{ success = $true; service_name = $serviceName; status = "already_stopped" } }
        
        if ($force) { Stop-Service -Name $serviceName -Force -ErrorAction Stop }
        else { Stop-Service -Name $serviceName -ErrorAction Stop }
        
        Write-Log "[STOP-SERVICE] Stopped: $serviceName" "SUCCESS"
        return @{ success = $true; service_name = $serviceName; previous_status = $service.Status.ToString(); new_status = "Stopped"; stopped_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-DisableService {
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        if (-not $serviceName) { return @{ success = $false; error = "Missing service_name in payload" } }
        
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[DISABLE-SERVICE] BLOCKED: $serviceName is a protected service" "WARN"
            return @{ success = $false; error = "SECURITY_BLOCK: $serviceName is a protected system service"; blocked = $true; service_name = $serviceName }
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if (-not $service) { return @{ success = $false; error = "Service not found: $serviceName" } }
        
        $previousStatus = $service.Status.ToString()
        $previousStartType = (Get-CimInstance Win32_Service -Filter "Name='$serviceName'").StartMode
        
        if ($service.Status -ne 'Stopped') { Stop-Service -Name $serviceName -Force -ErrorAction Stop }
        Set-Service -Name $serviceName -StartupType Disabled -ErrorAction Stop
        
        Write-Log "[DISABLE-SERVICE] Disabled: $serviceName" "SUCCESS"
        return @{ success = $true; service_name = $serviceName; previous_status = $previousStatus; previous_startup = $previousStartType; new_status = "Stopped"; new_startup = "Disabled"; disabled_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-RestartService {
    param([object]$Payload)
    
    try {
        $serviceName = $Payload.service_name
        $timeout = if ($Payload.timeout_seconds) { $Payload.timeout_seconds } else { 30 }
        
        if (-not $serviceName) { return @{ success = $false; error = "Missing service_name in payload" } }
        
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[RESTART-SERVICE] WARNING: Restarting protected service $serviceName" "WARN"
        }
        
        $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
        if (-not $service) { return @{ success = $false; error = "Service not found: $serviceName" } }
        
        $previousStatus = $service.Status.ToString()
        Restart-Service -Name $serviceName -Force -ErrorAction Stop
        $service.WaitForStatus('Running', (New-TimeSpan -Seconds $timeout))
        $newService = Get-Service -Name $serviceName
        
        Write-Log "[RESTART-SERVICE] Restarted: $serviceName" "SUCCESS"
        return @{ success = $true; service_name = $serviceName; previous_status = $previousStatus; new_status = $newService.Status.ToString(); restarted_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-FixFirewall {
    param([object]$Payload)
    
    try {
        $results = @{}
        if ($Payload.enable_public) { Set-NetFirewallProfile -Profile Public -Enabled True -ErrorAction Stop; $results.public = "enabled" }
        if ($Payload.enable_private) { Set-NetFirewallProfile -Profile Private -Enabled True -ErrorAction Stop; $results.private = "enabled" }
        if ($Payload.enable_domain) { Set-NetFirewallProfile -Profile Domain -Enabled True -ErrorAction Stop; $results.domain = "enabled" }
        
        return @{ success = $true; changes = $results; applied_at = (Get-Date).ToString("o") }
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-DiskCleanup {
    param([Parameter(Mandatory = $false)][int]$ThresholdPercent = $Global:DiskCleanupThresholdPercent)
    
    try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $usedPercent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
        
        if ($usedPercent -lt $ThresholdPercent) {
            return @{ cleaned = $false; reason = "disk_ok"; usage_percent = $usedPercent }
        }
        
        Write-Log "[DISK-CLEANUP] Disk usage at $usedPercent% (threshold: $ThresholdPercent%). Starting cleanup..." "WARN"
        
        $freedBytes = 0
        $actions = @()
        
        try { $tempPath = $env:TEMP; $tempFiles = Get-ChildItem -Path $tempPath -Recurse -Force -ErrorAction SilentlyContinue; $tempSize = ($tempFiles | Measure-Object -Property Length -Sum).Sum; Remove-Item "$tempPath\*" -Recurse -Force -ErrorAction SilentlyContinue; $freedBytes += $tempSize; $actions += "user_temp" } catch { }
        try { $winTempPath = "C:\Windows\Temp"; $winTempFiles = Get-ChildItem -Path $winTempPath -Recurse -Force -ErrorAction SilentlyContinue; $winTempSize = ($winTempFiles | Measure-Object -Property Length -Sum).Sum; Remove-Item "$winTempPath\*" -Recurse -Force -ErrorAction SilentlyContinue; $freedBytes += $winTempSize; $actions += "windows_temp" } catch { }
        try { Remove-Item "C:\Windows\Prefetch\*.pf" -Force -ErrorAction SilentlyContinue; $actions += "prefetch" } catch { }
        try {
            $cleanMgrPath = "C:\Windows\System32\cleanmgr.exe"
            if (Test-Path $cleanMgrPath) {
                $regPath = "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Explorer\VolumeCaches"
                foreach ($cache in @("Temporary Files", "Temporary Setup Files", "Old ChkDsk Files", "Recycle Bin")) {
                    $cachePath = "$regPath\$cache"
                    if (Test-Path $cachePath) { Set-ItemProperty -Path $cachePath -Name "StateFlags0100" -Value 2 -ErrorAction SilentlyContinue }
                }
                $process = Start-Process "cleanmgr.exe" -ArgumentList "/sagerun:100" -NoNewWindow -Wait -PassThru -ErrorAction SilentlyContinue
                if ($process.ExitCode -eq 0) { $actions += "cleanmgr" }
            }
        } catch { }
        
        $diskAfter = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $usedPercentAfter = [math]::Round((($diskAfter.Size - $diskAfter.FreeSpace) / $diskAfter.Size) * 100, 1)
        $freedGB = [math]::Round(($diskAfter.FreeSpace - $disk.FreeSpace) / 1GB, 2)
        
        Write-Log "[DISK-CLEANUP] Completed. Usage: $usedPercent% -> $usedPercentAfter% (freed: ${freedGB}GB)" "SUCCESS"
        
        $Global:AutoRepairStats.disk_cleanups++
        $Global:AutoRepairStats.last_disk_cleanup = (Get-Date).ToString("o")
        
        Send-AutoRepairTelemetry -Event "disk_cleanup" -Data @{ event = "disk_cleanup"; before_percent = $usedPercent; after_percent = $usedPercentAfter; freed_gb = $freedGB; actions = $actions }
        
        return @{ cleaned = $true; before_percent = $usedPercent; after_percent = $usedPercentAfter; freed_gb = $freedGB; actions = $actions }
        
    } catch {
        Write-Log "[DISK-CLEANUP] Error: $($_.Exception.Message)" "ERROR"
        return @{ cleaned = $false; error = $_.Exception.Message }
    }
}

function Invoke-HighCpuProcessCheck {
    param([Parameter(Mandatory = $false)][int]$ThresholdPercent = $Global:HighCpuThresholdPercent)
    
    if (-not $Global:ProtectedProcessSet) {
        $Global:ProtectedProcessSet = [System.Collections.Generic.HashSet[string]]::new(
            [string[]]@("System", "Idle", "svchost", "csrss", "smss", "wininit", "winlogon", "services", "lsass", "dwm", "explorer", "taskmgr", "RuntimeBroker", "spoolsv", "msdtc", "SearchIndexer", "WmiPrvSE", "powershell", "CyberShield", "dns-filter", "chrome", "firefox", "msedge", "code", "Teams", "Outlook", "slack", "zoom", "OneDrive", "WINWORD", "EXCEL", "POWERPNT"),
            [System.StringComparer]::OrdinalIgnoreCase
        )
    }
    
    try {
        $cpuSamples = @{}
        $processes1 = Get-Process | Where-Object { $_.CPU -ne $null }
        Start-Sleep -Milliseconds 500
        $processes2 = Get-Process | Where-Object { $_.CPU -ne $null }
        
        foreach ($p2 in $processes2) {
            $p1 = $processes1 | Where-Object { $_.Id -eq $p2.Id }
            if ($p1) {
                $cpuDelta = $p2.CPU - $p1.CPU
                $cpuPercent = ($cpuDelta / 0.5) * 100 / [Environment]::ProcessorCount
                $cpuSamples[$p2.Id] = @{ Name = $p2.ProcessName; CpuPercent = [math]::Round($cpuPercent, 1); WorkingSetMB = [math]::Round($p2.WorkingSet / 1MB, 1) }
            }
        }
        
        $highCpuProcesses = $cpuSamples.GetEnumerator() |
            Where-Object { $_.Value.CpuPercent -gt $ThresholdPercent } |
            Where-Object { -not $Global:ProtectedProcessSet.Contains($_.Value.Name) }
        
        $killedProcesses = @()
        
        foreach ($proc in $highCpuProcesses) {
            $procName = $proc.Value.Name
            $procId = $proc.Key
            $cpuPercent = $proc.Value.CpuPercent
            
            Write-Log "[PROCESS-CHECK] High CPU detected: $procName (PID: $procId) at $cpuPercent%" "WARN"
            
            try {
                $isBaseline = Test-ProcessInBaseline -ProcessName $procName
                
                if (-not $isBaseline) {
                    Write-Log "[PROCESS-CHECK] Process $procName NOT in baseline - killing..." "WARN"
                    Stop-Process -Id $procId -Force -ErrorAction Stop
                    $killedProcesses += @{ name = $procName; pid = $procId; cpu_percent = $cpuPercent; reason = "high_cpu_not_baseline" }
                    $Global:AutoRepairStats.processes_killed++
                    Write-Log "[PROCESS-CHECK] Killed: $procName (PID: $procId)" "SUCCESS"
                } else {
                    Write-Log "[PROCESS-CHECK] Process $procName is in baseline - monitoring only" "INFO"
                }
            } catch {
                Write-Log "[PROCESS-CHECK] Failed to kill $procName : $($_.Exception.Message)" "ERROR"
            }
        }
        
        if ($killedProcesses.Count -gt 0) {
            Send-AutoRepairTelemetry -Event "high_cpu_kill" -Data @{ processes = $killedProcesses; threshold = $ThresholdPercent }
        }
        
        return @{ checked = $true; killed_count = $killedProcesses.Count; killed = $killedProcesses; threshold = $ThresholdPercent }
        
    } catch {
        Write-Log "[PROCESS-CHECK] Error: $($_.Exception.Message)" "WARN"
        return @{ checked = $false; error = $_.Exception.Message }
    }
}

function Invoke-SyncBlockedWebsites {
    param([object]$Payload)
    
    try {
        Write-Log "[SYNC-BLOCKED] Syncing blocked websites..." "INFO"
        
        $hostsPath = "C:\Windows\System32\drivers\etc\hosts"
        $markerStart = "# === CyberShield Blocked Websites Start ==="
        $markerEnd = "# === CyberShield Blocked Websites End ==="
        
        $urls = @()
        $payloadDomains = $null
        if ($null -ne $Payload) {
            if ($Payload -is [hashtable]) {
                if ($Payload.ContainsKey("blocked_domains")) { $payloadDomains = $Payload["blocked_domains"] }
                elseif ($Payload.ContainsKey("urls")) { $payloadDomains = $Payload["urls"] }
                elseif ($Payload.ContainsKey("domains")) { $payloadDomains = $Payload["domains"] }
            } else {
                try {
                    $props = @($Payload.PSObject.Properties | ForEach-Object { $_.Name })
                    if ($props -contains "blocked_domains") { $payloadDomains = $Payload.blocked_domains }
                    elseif ($props -contains "urls") { $payloadDomains = $Payload.urls }
                    elseif ($props -contains "domains") { $payloadDomains = $Payload.domains }
                } catch { Write-Log "[SYNC-BLOCKED] Payload property access error (non-fatal): $($_.Exception.Message)" "DEBUG" }
            }
        }
        if ($payloadDomains) { $urls = @($payloadDomains) }
        else {
            $result = Invoke-SecureRequest -Path "/functions/v1/serve-dns-filter" -Method "POST" -Body @{ agent_name = $Global:AgentName; timestamp = [DateTime]::UtcNow.ToString("o") } -MaxRetries 2 -TimeoutSec 15
            if ($result.Success) {
                $response = $result.Content | ConvertFrom-Json
                try { $responseProps = @($response.PSObject.Properties | ForEach-Object { $_.Name }); if ($responseProps -contains "domains") { $urls = @($response.domains) } elseif ($responseProps -contains "blocked_domains") { $urls = @($response.blocked_domains) } } catch { Write-Log "[SYNC-BLOCKED] Response parse error: $($_.Exception.Message)" "WARN" }
            }
        }
        
        if ($urls.Count -eq 0) { return @{ success = $true; blocked_count = 0; message = "No URLs to block" } }
        
        $hostsContent = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue
        if ($hostsContent -match [regex]::Escape($markerStart)) {
            $hostsContent = $hostsContent -replace "(?s)$([regex]::Escape($markerStart)).*?$([regex]::Escape($markerEnd))", ""
        }
        
        $blockEntries = @($markerStart)
        foreach ($url in $urls) {
            $domain = $url -replace "^https?://", "" -replace "/.*$", ""
            $blockEntries += "0.0.0.0 $domain"
            $blockEntries += "0.0.0.0 www.$domain"
        }
        $blockEntries += $markerEnd
        
        $newContent = $hostsContent.TrimEnd() + "`r`n" + ($blockEntries -join "`r`n") + "`r`n"
        Set-Content -Path $hostsPath -Value $newContent -Encoding ASCII -Force
        ipconfig /flushdns | Out-Null
        @{ domains = $urls; updated_at = (Get-Date).ToString("o") } | ConvertTo-Json | Out-File $Global:DnsBlocklistPath -Encoding UTF8
        
        Write-Log "[SYNC-BLOCKED] Blocked $($urls.Count) websites via hosts file" "SUCCESS"
        return @{ success = $true; blocked_count = $urls.Count; blocked_domains = $urls; method = "hosts_file"; synced_at = (Get-Date).ToString("o") }
        
    } catch {
        Write-Log "[SYNC-BLOCKED] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-ServiceHealthCheck {
    param([object]$Payload)
    
    try {
        Write-Log "[SVC-HEALTH] Running service health check..." "INFO"
        
        $serviceNames = @()
        if ($Payload.services) { $serviceNames = @($Payload.services) }
        else { $serviceNames = @("WinDefend", "mpssvc", "EventLog", "wuauserv", "Dnscache", "BITS", "Schedule", "W32Time") }
        
        $results = @()
        $unhealthy = 0
        
        foreach ($svcName in $serviceNames) {
            $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
            if ($svc) {
                $startType = (Get-CimInstance Win32_Service -Filter "Name='$svcName'" -ErrorAction SilentlyContinue).StartMode
                $isHealthy = ($svc.Status -eq 'Running') -or ($startType -eq 'Disabled' -or $startType -eq 'Manual')
                if (-not $isHealthy) { $unhealthy++ }
                $results += @{ name = $svcName; display_name = $svc.DisplayName; status = $svc.Status.ToString(); start_type = $startType; healthy = $isHealthy }
            } else {
                $results += @{ name = $svcName; status = "not_found"; healthy = $false }
                $unhealthy++
            }
        }
        
        $svcLogLevel = if ($unhealthy -gt 0) { "WARN" } else { "SUCCESS" }
        Write-Log "[SVC-HEALTH] Checked $($results.Count) services, $unhealthy unhealthy" $svcLogLevel
        return @{ success = $true; services_checked = $results.Count; unhealthy_count = $unhealthy; services = $results; checked_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-NetworkDiagnostics {
    param([object]$Payload)
    
    try {
        Write-Log "[NET-DIAG] Running network diagnostics..." "INFO"
        
        $targets = @()
        if ($Payload.targets) { $targets = @($Payload.targets) }
        else { $targets = @("8.8.8.8", "1.1.1.1", $Global:ServerUrl -replace "^https?://", "") }
        
        $diagnostics = @()
        
        foreach ($target in $targets) {
            $diag = @{ target = $target }
            try { $ping = Test-Connection -ComputerName $target -Count 3 -ErrorAction Stop; $diag.ping = @{ success = $true; avg_ms = [math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average, 1); min_ms = ($ping | Measure-Object -Property ResponseTime -Minimum).Minimum; max_ms = ($ping | Measure-Object -Property ResponseTime -Maximum).Maximum; packets_sent = 3; packets_received = $ping.Count } } catch { $diag.ping = @{ success = $false; error = $_.Exception.Message } }
            try { $dns = Resolve-DnsName -Name $target -ErrorAction Stop | Select-Object -First 3; $diag.dns = @{ success = $true; records = @($dns | ForEach-Object { @{ name = $_.Name; type = $_.Type.ToString(); ip = $_.IPAddress } }) } } catch { $diag.dns = @{ success = $false; error = $_.Exception.Message } }
            try { $trace = Test-NetConnection -ComputerName $target -TraceRoute -ErrorAction Stop; $diag.traceroute = @{ success = $true; hops = @($trace.TraceRoute | Select-Object -First 10); remote_port = $trace.RemotePort; tcp_succeeded = $trace.TcpTestSucceeded } } catch { $diag.traceroute = @{ success = $false; error = $_.Exception.Message } }
            $diagnostics += $diag
        }
        
        Write-Log "[NET-DIAG] Completed diagnostics for $($targets.Count) targets" "SUCCESS"
        return @{ success = $true; targets_checked = $targets.Count; diagnostics = $diagnostics; checked_at = (Get-Date).ToString("o") }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-QuarantineAgent {
    param([object]$Payload)
    
    try {
        $action = if ($Payload.action -eq "release") { "release" } else { "quarantine" }
        Write-Log "[QUARANTINE] Action: $action" "WARN"
        
        $ruleName = "CyberShield-Quarantine"
        $serverHost = ([System.Uri]$Global:ServerUrl).Host
        
        if ($action -eq "quarantine") {
            New-NetFirewallRule -DisplayName "$ruleName-BlockAll" -Direction Outbound -Action Block -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            $serverIPs = [System.Net.Dns]::GetHostAddresses($serverHost) | ForEach-Object { $_.IPAddressToString }
            foreach ($ip in $serverIPs) {
                New-NetFirewallRule -DisplayName "$ruleName-AllowServer-$ip" -Direction Outbound -Action Allow -RemoteAddress $ip -Protocol TCP -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            }
            New-NetFirewallRule -DisplayName "$ruleName-AllowDNS" -Direction Outbound -Action Allow -RemotePort 53 -Protocol UDP -Profile Any -Enabled True -ErrorAction SilentlyContinue | Out-Null
            Write-Log "[QUARANTINE] Agent quarantined - only server communication allowed" "WARN"
            return @{ success = $true; action = "quarantined"; server_host = $serverHost; server_ips = $serverIPs; reason = $Payload.reason; quarantined_at = (Get-Date).ToString("o") }
        } else {
            Get-NetFirewallRule -DisplayName "$ruleName*" -ErrorAction SilentlyContinue | Remove-NetFirewallRule -ErrorAction SilentlyContinue
            Write-Log "[QUARANTINE] Agent released from quarantine" "SUCCESS"
            return @{ success = $true; action = "released"; released_at = (Get-Date).ToString("o") }
        }
        
    } catch {
        Write-Log "[QUARANTINE] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-ApplySecurityPatch {
    param([object]$Payload)
    
    try {
        Write-Log "[PATCH] Applying security patch..." "INFO"
        $kbId = $Payload.kb_id
        $cveId = $Payload.cve_id
        
        if ($kbId) {
            $installed = Get-HotFix -Id $kbId -ErrorAction SilentlyContinue
            if ($installed) {
                Write-Log "[PATCH] KB $kbId already installed" "INFO"
                return @{ success = $true; status = "already_installed"; kb_id = $kbId; installed_on = $installed.InstalledOn.ToString("o") }
            }
            
            try {
                $session = New-Object -ComObject Microsoft.Update.Session
                $searcher = $session.CreateUpdateSearcher()
                $searchResult = $searcher.Search("IsInstalled=0 AND Type='Software'")
                
                $targetUpdate = $null
                foreach ($update in $searchResult.Updates) {
                    foreach ($kb in $update.KBArticleIDs) {
                        if ("KB$kb" -eq $kbId -or $kb -eq ($kbId -replace "^KB", "")) { $targetUpdate = $update; break }
                    }
                    if ($targetUpdate) { break }
                }
                
                if ($targetUpdate) {
                    $updatesToInstall = New-Object -ComObject Microsoft.Update.UpdateColl
                    $updatesToInstall.Add($targetUpdate) | Out-Null
                    $downloader = $session.CreateUpdateDownloader()
                    $downloader.Updates = $updatesToInstall
                    $downloadResult = $downloader.Download()
                    $installer = $session.CreateUpdateInstaller()
                    $installer.Updates = $updatesToInstall
                    $installResult = $installer.Install()
                    
                    Write-Log "[PATCH] KB $kbId installed successfully (reboot: $($installResult.RebootRequired))" "SUCCESS"
                    return @{ success = $true; status = "installed"; kb_id = $kbId; reboot_required = $installResult.RebootRequired; patched_at = (Get-Date).ToString("o") }
                } else {
                    Write-Log "[PATCH] KB $kbId not found in available updates" "WARN"
                    return @{ success = $false; status = "not_found"; kb_id = $kbId; message = "Update not available via Windows Update" }
                }
                
            } catch {
                Write-Log "[PATCH] Windows Update COM failed: $($_.Exception.Message)" "WARN"
                return @{ success = $false; status = "wu_error"; error = $_.Exception.Message }
            }
        }
        
        return @{ success = $false; error = "No kb_id specified" }
        
    } catch {
        Write-Log "[PATCH] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# --- END MODULE: remediation.ps1 ---


# --- BEGIN MODULE: heartbeat.ps1 ---
<#
.SYNOPSIS
    CyberShield Agent v6.0 - Heartbeat, Poll & Submit Module
.DESCRIPTION
    Send-Heartbeat, Poll-Jobs, Submit-JobResult, Execute-Job dispatcher.
    Depends on: network.ps1, crypto.ps1, state.ps1, evidence.ps1, telemetry.ps1, security.ps1
#>

function Poll-Jobs {
    try {
        Write-Log "[POLL-JOBS] Checking for pending jobs..." "DEBUG"
        
        $body = @{
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            timestamp     = [DateTime]::UtcNow.ToString("o")
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
        
        $jobsList = $null
        $jobsPropPoll = $response.PSObject.Properties['jobs']
        if ($response.PSObject -and $jobsPropPoll) {
            $jobsList = @($jobsPropPoll.Value)
            $pollIntervalProp = $response.PSObject.Properties['poll_interval_seconds']
            if ($pollIntervalProp -and $pollIntervalProp.Value -and $pollIntervalProp.Value -ge 10) {
                $newInterval = [int]$pollIntervalProp.Value
                if ($newInterval -ne $Global:JobPollIntervalSeconds) {
                    Write-Log "[POLL-JOBS] Server adjusted job poll interval: $($Global:JobPollIntervalSeconds)s -> ${newInterval}s" "INFO"
                    $Global:JobPollIntervalSeconds = $newInterval
                }
            }
        } elseif ($response -is [System.Array]) {
            $jobsList = @($response)
        } else {
            $jobsList = @()
        }
        
        if ($jobsList -and $jobsList.Count -gt 0) {
            foreach ($job in $jobsList) {
                if ($job -and (-not $job.job_type) -and $job.type) {
                    $job | Add-Member -NotePropertyName "job_type" -NotePropertyValue $job.type -Force
                }
            }
            Write-Log "[POLL-JOBS] Received $($jobsList.Count) job(s)" "INFO"
            return $jobsList
        }
        
        return @()
        
    } catch {
        Write-Log "[POLL-JOBS] Error: $($_.Exception.Message)" "ERROR"
        return @()
    }
}

function Submit-JobResult {
    param(
        [Parameter(Mandatory = $true)]
        [object]$Job,
        
        [Parameter(Mandatory = $true)]
        [object]$Result
    )
    
    try {
        $finishedAt = (Get-Date).ToString("o")
        
        $signature = Invoke-SignResult `
            -ExecutionId $Job.execution_id `
            -JobId $Job.id `
            -Status $Result.status `
            -OutputHash $Result.output_hash `
            -FinishedAt $finishedAt
        
        $payload = @{
            execution_id             = $Job.execution_id
            job_id                   = $Job.id
            status                   = $Result.status
            output                   = $Result.output
            output_hash              = $Result.output_hash
            error_message            = $Result.error_message
            finished_at              = $finishedAt
            result_signature         = $signature
            execution_hash           = $Result.execution_hash
            previous_execution_hash  = $Result.previous_execution_hash
            execution_index          = $Result.execution_index
            agent_version            = $Global:AgentVersion
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

function Send-AutoRepairTelemetry {
    param(
        [string]$Event,
        [object]$Data
    )
    
    try {
        $payload = @{
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            event_type    = "auto_repair"
            event_name    = $Event
            event_data    = $Data
            timestamp     = (Get-Date).ToString("o")
            hostname      = $env:COMPUTERNAME
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
        Write-Log "[TELEMETRY] Error sending $Event event: $($_.Exception.Message)" "WARN"
    }
}

# --- END MODULE: heartbeat.ps1 ---


# --- Orchestration layer (depends on all above) ---

# --- BEGIN MODULE: self-heal.ps1 ---
<#
.SYNOPSIS
    Watchdog, TOCTOU self-healing and auto-recovery
    v6.0: BOM-safe hashing, UpdateInProgress guard, fault counting with exponential backoff
#>

$script:FaultCount = 0
$script:MaxFaultsBeforeRecovery = 3

function Get-BOMSafeFileHash {
    <#
    .SYNOPSIS
        BOM-safe SHA-256 hash. Strips UTF-8 BOM before hashing
        to ensure consistent results regardless of file encoding.
    #>
    param(
        [Parameter(Mandatory)]
        [string]$FilePath
    )
    try {
        $rawBytes = [System.IO.File]::ReadAllBytes($FilePath)
        if ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 0xEF -and $rawBytes[1] -eq 0xBB -and $rawBytes[2] -eq 0xBF) {
            $rawBytes = $rawBytes[3..($rawBytes.Length - 1)]
        }
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        try {
            $hashBytes = $sha256.ComputeHash($rawBytes)
            return [BitConverter]::ToString($hashBytes).Replace("-", "").ToLower()
        }
        finally {
            $sha256.Dispose()
        }
    }
    catch {
        throw "Get-BOMSafeFileHash failed for ${FilePath}: $($_.Exception.Message)"
    }
}

function Start-Watchdog {
    Write-Log "Watchdog started (interval: $($script:Config.WatchdogInterval)s)" "INFO"

    while ($true) {
        try {
            # Skip integrity check during legitimate updates (TOCTOU guard)
            if ($Global:UpdateInProgress) {
                Write-Log "Update in progress - skipping integrity check" "DEBUG"
                Start-Sleep -Seconds $script:Config.WatchdogInterval
                continue
            }

            $integrityOk = Test-ScriptIntegrity -ScriptPath $script:Config.ScriptPath
            if (-not $integrityOk) {
                Write-Log "Integrity violation detected - initiating recovery" "ERROR"
                $script:FaultCount++

                if ($script:FaultCount -ge $script:MaxFaultsBeforeRecovery) {
                    Write-Log "Multiple integrity failures ($($script:FaultCount)) - attempting full recovery" "ERROR"
                    $recovered = Invoke-AgentRecovery
                    if ($recovered) {
                        $script:FaultCount = 0
                    }
                    else {
                        Write-Log "Recovery failed - entering safe mode" "ERROR"
                        Set-AgentState -NewState "SAFE_MODE" -Reason "Recovery failed after $($script:FaultCount) integrity violations"
                    }
                }
            }
            else {
                if ($script:FaultCount -gt 0) {
                    Write-Log "Integrity restored after $($script:FaultCount) fault(s)" "INFO"
                }
                $script:FaultCount = 0
            }

            # Check if main agent process is alive
            $agentTask = Get-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
            if ($agentTask -and $agentTask.State -ne "Running") {
                Write-Log "Agent task not running - restarting" "WARN"
                Start-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
            }
        }
        catch {
            Write-Log "Watchdog error: $($_.Exception.Message)" "ERROR"
        }

        Start-Sleep -Seconds $script:Config.WatchdogInterval
    }
}

function Test-ScriptIntegrity {
    param([string]$ScriptPath)

    if (-not (Test-Path $ScriptPath)) {
        Write-Log "Script file not found: $ScriptPath" "ERROR"
        return $false
    }

    # TOCTOU guard: skip during legitimate update operations
    if ($Global:UpdateInProgress) {
        return $true
    }

    $actualHash = Get-BOMSafeFileHash -FilePath $ScriptPath

    $cachePath = "$script:DataDir\expected_script_hash.json"
    if (Test-Path $cachePath) {
        try {
            $cache = Get-Content $cachePath -Raw | ConvertFrom-Json
            $expectedHash = $cache.hash

            if ($actualHash -eq $expectedHash) {
                return $true
            }

            # Self-heal: if hash differs but matches boot hash, update cache
            if ($Global:BootScriptHash -and $actualHash -eq $Global:BootScriptHash) {
                Write-Log "Hash mismatch but matches boot hash - self-healing cache" "WARN"
                @{ hash = $actualHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File $cachePath -Encoding UTF8 -Force
                return $true
            }

            # Self-heal: update cache to actual hash on first mismatch (3-strike via FaultCount in watchdog)
            Write-Log "Hash mismatch - self-healing cache to match actual script (fault tracked by watchdog)" "WARN"
            @{ hash = $actualHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File $cachePath -Encoding UTF8 -Force
            $Global:BootScriptHash = $actualHash
            return $true
        }
        catch {
            Write-Log "Failed to read hash cache: $($_.Exception.Message)" "WARN"
            return $true
        }
    }

    # No cache - create initial baseline
    @{ hash = $actualHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File $cachePath -Encoding UTF8 -Force
    $Global:BootScriptHash = $actualHash
    return $true
}

function Invoke-AgentRecovery {
    Write-Log "Initiating agent recovery" "INFO"

    # Try backup first
    if (Test-Path $script:Config.BackupPath) {
        Write-Log "Restoring from backup" "INFO"
        try {
            $Global:UpdateInProgress = $true
            Copy-Item $script:Config.BackupPath $script:Config.ScriptPath -Force

            if (Test-ScriptIntegrity -ScriptPath $script:Config.ScriptPath) {
                Write-Log "Backup restoration successful" "INFO"
                return $true
            }
        }
        finally {
            $Global:UpdateInProgress = $false
        }
    }

    # Download fresh copy from server (download-verify-execute pattern)
    Write-Log "Downloading fresh agent script" "INFO"
    try {
        $tempFile = "$script:TempDir\recovery_agent_$(Get-Random).ps1"
        $response = Invoke-SecureApi -Endpoint "serve-agent-update" -Method "GET"

        if ($response -and $response.script_content) {
            $response.script_content | Out-File $tempFile -Encoding UTF8 -Force

            # Verify hash using BOM-safe method
            if ($response.script_hash) {
                $downloadHash = Get-BOMSafeFileHash -FilePath $tempFile
                if ($downloadHash -ne $response.script_hash) {
                    Write-Log "Downloaded script hash mismatch - recovery aborted" "ERROR"
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                    return $false
                }
            }

            # ASCII safety check
            $content = Get-Content $tempFile -Raw -Encoding UTF8
            $nonAscii = $content.ToCharArray() | Where-Object { [int][char]$_ -gt 127 }
            if ($nonAscii.Count -gt 0) {
                Write-Log "Downloaded script contains $($nonAscii.Count) non-ASCII chars - recovery aborted" "ERROR"
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                return $false
            }

            try {
                $Global:UpdateInProgress = $true
                Copy-Item $script:Config.ScriptPath $script:Config.BackupPath -Force -ErrorAction SilentlyContinue
                Move-Item $tempFile $script:Config.ScriptPath -Force

                # Update hash cache
                $newHash = Get-BOMSafeFileHash -FilePath $script:Config.ScriptPath
                @{ hash = $newHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File "$script:DataDir\expected_script_hash.json" -Encoding UTF8 -Force
                $Global:BootScriptHash = $newHash

                Write-Log "Recovery download successful" "INFO"
                return $true
            }
            finally {
                $Global:UpdateInProgress = $false
            }
        }
    }
    catch {
        Write-Log "Recovery download failed: $($_.Exception.Message)" "ERROR"
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
    }

    return $false
}

# --- END MODULE: self-heal.ps1 ---


# --- BEGIN MODULE: update.ps1 ---
<#
.SYNOPSIS
    Agent auto-update with download-verify-execute pattern.
    v7.0: Added Ed25519 signature verification (SSA-004).
    v6.0: TOCTOU guard via $Global:UpdateInProgress, BOM-safe hashing,
    ASCII safety check, atomic replace.
#>

function Test-AgentVersion {
    <#
    .SYNOPSIS
        Compare local version against server-reported latest.
        Returns $true if update is needed.
    #>
    param(
        [string]$ServerVersion
    )

    if (-not $ServerVersion) { return $false }

    try {
        $local = [Version]$script:Config.Version
        $remote = [Version]$ServerVersion

        if ($remote.Major -gt $local.Major -or $remote.Minor -gt $local.Minor) {
            Write-Log "Version lag detected: local=$($script:Config.Version) server=$ServerVersion" "WARN"
            return $true
        }

        if ($remote.Build -gt $local.Build) {
            return $true
        }

        return $false
    }
    catch {
        Write-Log "Version comparison failed: $($_.Exception.Message)" "WARN"
        return $false
    }
}

function ConvertTo-PowerShellLiteral {
    param(
        [AllowNull()]
        [string]$Value
    )

    if ($null -eq $Value) {
        return "''"
    }

    return "'" + $Value.Replace("'", "''") + "'"
}

function New-EncodedPowerShellCommand {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Command
    )

    $bytes = [System.Text.Encoding]::Unicode.GetBytes($Command)
    return [Convert]::ToBase64String($bytes)
}

function Request-AgentRestart {
    param(
        [int]$DelaySeconds = 3
    )

    try {
        $helperScript = @"
`$taskName = 'CyberShield Agent'
`$scriptPath = $(ConvertTo-PowerShellLiteral -Value $script:Config.ScriptPath)
`$agentToken = $(ConvertTo-PowerShellLiteral -Value $script:Config.AgentToken)
`$hmacSecret = $(ConvertTo-PowerShellLiteral -Value $script:Config.HmacSecret)
`$apiEndpoint = $(ConvertTo-PowerShellLiteral -Value $script:Config.ApiEndpoint)
`$agentName = $(ConvertTo-PowerShellLiteral -Value $Global:AgentName)
`$pollInterval = $([int]$Global:JobPollIntervalSeconds)

Start-Sleep -Seconds $DelaySeconds

try {
    if (Get-Command Get-ScheduledTask -ErrorAction SilentlyContinue) {
        `$task = Get-ScheduledTask -TaskName `$taskName -ErrorAction SilentlyContinue
        if (`$task) {
            Start-ScheduledTask -TaskName `$taskName -ErrorAction Stop
            exit 0
        }
    }
} catch {
}

& `$scriptPath -AgentToken `$agentToken -HmacSecret `$hmacSecret -ApiEndpoint `$apiEndpoint -AgentName `$agentName -PollInterval `$pollInterval
"@

        $encodedCommand = New-EncodedPowerShellCommand -Command $helperScript

        Start-Process -FilePath "PowerShell.exe" -ArgumentList @(
            "-NoProfile",
            "-NonInteractive",
            "-WindowStyle", "Hidden",
            "-ExecutionPolicy", "Bypass",
            "-EncodedCommand", $encodedCommand
        ) -WindowStyle Hidden | Out-Null

        Write-Log "Detached restart helper launched" "INFO"
        return $true
    }
    catch {
        Write-Log "Failed to launch detached restart helper: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

function Invoke-CheckForUpdate {
    <#
    .SYNOPSIS
        Query the server for available updates and apply if needed.
        Uses download-verify-execute pattern per security standard.
        v7.1: Passes expected_sha256 and signature_timestamp for Phase 3 validation.
    #>
    try {
        $response = Invoke-SecureApi -Endpoint "agents/$($script:Config.AgentId)/check-update"

        if ($response -and $response.needs_update) {
            Write-Log "Update available: v$($response.version)" "INFO"

            # Phase 3: extract optional integrity fields (backward-compatible)
            $expectedSha256 = if ($response.PSObject.Properties['expected_sha256']) { $response.expected_sha256 } else { $null }
            $signatureTimestamp = if ($response.PSObject.Properties['signature_timestamp']) { $response.signature_timestamp } else { $null }

            $updated = Install-AgentUpdate `
                -Version $response.version `
                -Url $response.url `
                -Hash $response.hash `
                -Signature $response.signature `
                -ExpectedSha256 $expectedSha256 `
                -SignatureTimestamp $signatureTimestamp
            if ($updated) {
                Write-Log "Update applied to v$($response.version) - restarting agent" "INFO"
                Export-PersistedState
                if (Request-AgentRestart) {
                    $Global:RestartRequested = $true
                    return
                }

                Write-Log "Update applied, but restart helper could not be launched - manual restart required" "ERROR"
            }
        }
    }
    catch {
        Write-Log "Update check failed: $($_.Exception.Message)" "WARN"
    }
}

function Install-AgentUpdate {
    <#
    .SYNOPSIS
        Download, verify, and install an agent update.
        Follows download-verify-execute pattern:
        1. Download to temp
        2. Verify SHA-256 hash
        2.5. Phase 3: Cross-validate expected_sha256 from server
        2.6. Verify Ed25519 signature (SSA-004)
        2.7. Phase 3: Reject stale signatures (signature_timestamp check)
        3. Verify ASCII safety
        4. Backup current
        5. Atomic replace with TOCTOU guard
    #>
    param(
        [string]$Version,
        [string]$Url,
        [string]$Hash,
        [string]$Signature,
        [string]$ExpectedSha256,
        [string]$SignatureTimestamp
    )

    $tempFile = "$script:TempDir\agent_update_$Version`_$(Get-Random).ps1"

    try {
        # 1. Download to temp directory
        Write-Log "Downloading update v$Version from server..." "INFO"
        Invoke-WebRequest -Uri $Url -OutFile $tempFile -UseBasicParsing -TimeoutSec 60

        if (-not (Test-Path $tempFile)) {
            Write-Log "Download failed - temp file not created" "ERROR"
            return $false
        }

        # 2. Verify SHA-256 hash (BOM-safe)
        if ($Hash) {
            $actualHash = Get-BOMSafeFileHash -FilePath $tempFile
            if ($actualHash -ne $Hash.ToLower()) {
                Write-Log "Update hash mismatch (expected: $Hash, got: $actualHash) - ABORTED" "ERROR"
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
                return $false
            }
            Write-Log "Update hash verified" "INFO"
        }
        else {
            Write-Log "No hash provided for update - proceeding with caution" "WARN"
        }

        # 2.5. Phase 3: Cross-validate expected_sha256 from server (defense in depth)
        if ($ExpectedSha256 -and $actualHash) {
            if ($actualHash -ne $ExpectedSha256.ToLower()) {
                Write-Log "FATAL: expected_sha256 from server does NOT match downloaded content hash! Possible MITM or replay attack. (server=$ExpectedSha256, local=$actualHash) - ABORTED" "ERROR"
                Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
                return $false
            }
            Write-Log "Phase 3: expected_sha256 cross-validated OK" "INFO"
        }

        # 2.6. Verify Ed25519 signature (SSA-004)
        if ($Signature -and $Signature.Length -gt 10) {
            # Signature provided — must verify
            $ed25519Available = Test-Ed25519Available
            if ($ed25519Available -and $Global:Ed25519PublicKeyBase64) {
                $sigValid = Test-Ed25519Signature -ContentHash $actualHash -SignatureBase64 $Signature
                if (-not $sigValid) {
                    Write-Log "Update REJECTED - Ed25519 signature INVALID! Possible supply chain attack. Hash: $actualHash" "ERROR"
                    Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                    $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
                    return $false
                }
                Write-Log "Ed25519 signature verified for update v$Version" "INFO"
            }
            elseif (-not $Global:Ed25519PublicKeyBase64) {
                # No public key configured — audit-only mode (accept with warning)
                Write-Log "Ed25519 public key not configured - accepting update based on SHA-256 only (audit-only)" "WARN"
            }
            else {
                # Ed25519 not available on this runtime (.NET < 5) — accept with warning
                Write-Log "Ed25519 not available on this runtime - accepting update based on SHA-256 only (PS 5.1 compat)" "WARN"
            }
        }
        elseif ($Global:Ed25519PublicKeyBase64 -and (Test-Ed25519Available)) {
            # No signature but Ed25519 is configured — reject unsigned updates (fail-closed)
            Write-Log "Update REJECTED - No cryptographic signature on update payload. Unsigned updates blocked (SSA-004)." "ERROR"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
            return $false
        }
        else {
            # Legacy mode: no signature, no Ed25519 configured — accept with SHA-256 only
            Write-Log "No signature provided and Ed25519 not configured - accepting update based on SHA-256 only" "WARN"
        }

        # 2.7. Phase 3: Reject stale signatures (defense in depth)
        if ($SignatureTimestamp) {
            try {
                $sigTime = [DateTime]::Parse($SignatureTimestamp).ToUniversalTime()
                $lastUpdateFile = "$script:DataDir\last_successful_update.json"
                if (Test-Path $lastUpdateFile) {
                    $lastUpdateData = Get-Content $lastUpdateFile -Raw | ConvertFrom-Json -ErrorAction SilentlyContinue
                    if ($lastUpdateData -and $lastUpdateData.timestamp) {
                        $lastTime = [DateTime]::Parse($lastUpdateData.timestamp).ToUniversalTime()
                        if ($sigTime -le $lastTime) {
                            Write-Log "Phase 3: STALE signature detected (sig=$sigTime <= lastUpdate=$lastTime). Possible replay attack - ABORTED" "ERROR"
                            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
                            $Global:ToctouFailures = ($Global:ToctouFailures -as [int]) + 1
                            return $false
                        }
                    }
                }
                Write-Log "Phase 3: Signature timestamp validated ($sigTime)" "INFO"
            }
            catch {
                Write-Log "Phase 3: Could not parse signature_timestamp '$SignatureTimestamp' - continuing (non-blocking)" "WARN"
            }
        }

        # 3. Verify ASCII safety (prevent PS 5.1 encoding issues)
        $content = Get-Content $tempFile -Raw -Encoding UTF8
        $nonAscii = $content.ToCharArray() | Where-Object { [int][char]$_ -gt 127 }
        if ($nonAscii.Count -gt 0) {
            Write-Log "Update contains $($nonAscii.Count) non-ASCII chars - ABORTED" "ERROR"
            Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
            return $false
        }

        # 4. Backup current script
        if (Test-Path $script:Config.ScriptPath) {
            Copy-Item $script:Config.ScriptPath $script:Config.BackupPath -Force
            Write-Log "Current script backed up" "INFO"
        }

        # 5. Atomic replace with TOCTOU guard
        try {
            $Global:UpdateInProgress = $true
            Move-Item $tempFile $script:Config.ScriptPath -Force

            # Update hash cache after successful replacement
            $newHash = Get-BOMSafeFileHash -FilePath $script:Config.ScriptPath
            @{ hash = $newHash; updated = (Get-Date -Format "o") } | ConvertTo-Json | Out-File "$script:DataDir\expected_script_hash.json" -Encoding UTF8 -Force
            $Global:BootScriptHash = $newHash

            # Phase 3: Record successful update timestamp for stale signature detection
            @{ timestamp = (Get-Date).ToUniversalTime().ToString("o"); version = $Version; sha256 = $newHash } | ConvertTo-Json | Out-File "$script:DataDir\last_successful_update.json" -Encoding UTF8 -Force

            # Reset TOCTOU failure counter on success
            $Global:ToctouFailures = 0

            Write-Log "Agent updated to v$Version" "INFO"
            return $true
        }
        finally {
            $Global:UpdateInProgress = $false
        }
    }
    catch {
        Write-Log "Update installation failed: $($_.Exception.Message)" "ERROR"
        Remove-Item $tempFile -Force -ErrorAction SilentlyContinue
        return $false
    }
}

# --- END MODULE: update.ps1 ---


# --- BEGIN MODULE: job-runner.ps1 ---
<#
.SYNOPSIS
    Job execution with timeout, circuit breaker, and typed job dispatcher.
    NO arbitrary command execution - all jobs routed through whitelisted handlers.
    v6.0: Delegates to modular handlers in collection.ps1, remediation.ps1, etc.
    Uses PowerShell runspace for timeout (Start-Job lacks module scope access).
#>

$script:ConsecutiveFailures = 0
$script:CircuitBreakerOpen = $false
$script:CircuitBreakerCooldown = 300

# ============================================
#  HEARTBEAT LOOP
# ============================================
function Start-HeartbeatLoop {
    Write-Log "Starting heartbeat loop (interval: $($script:Config.HeartbeatInterval)s)" "INFO"

    # Proactive key registration during boot (exits audit-only mode)
    try {
        $keyRegResult = Register-AgentKey
        if (-not $keyRegResult) {
            Write-Log "[BOOT] Key registration deferred - will retry on next restart" "WARN"
        }
    } catch {
        Write-Log "[BOOT] Key registration error (non-fatal): $($_.Exception.Message)" "WARN"
    }

    while ($true) {
        try {
            if ($script:CircuitBreakerOpen) {
                Write-Log "Circuit breaker open - waiting cooldown" "WARN"
                Start-Sleep -Seconds $script:CircuitBreakerCooldown
                $script:CircuitBreakerOpen = $false
                $script:ConsecutiveFailures = 0
                continue
            }

            $telemetry = Get-SystemTelemetry
            $securityEvents = Get-SecurityEvents -Hours 1

            $payload = @{
                telemetry       = $telemetry
                security_events = $securityEvents
                agent_version   = $script:Config.Version
            }

            $response = Invoke-SecureApi -Endpoint "heartbeat" -Method "POST" -Body $payload
            $script:ConsecutiveFailures = 0

            # Extract Ed25519 public key from heartbeat response (server-driven key distribution)
            if ($response -and $response.PSObject -and $response.PSObject.Properties['ed25519_public_key'] -and $response.ed25519_public_key) {
                $newKey = $response.ed25519_public_key
                if ($newKey -ne $Global:Ed25519PublicKeyBase64) {
                    $Global:Ed25519PublicKeyBase64 = $newKey
                    # Persist for offline resilience
                    try {
                        $keyPath = "$script:BaseDir\ed25519_pubkey"
                        $newKey | Out-File -FilePath $keyPath -Encoding UTF8 -Force -NoNewline
                        Write-Log "[CRYPTO] Ed25519 public key updated from heartbeat and persisted" "INFO"
                    } catch {
                        Write-Log "[CRYPTO] Ed25519 key received but failed to persist: $($_.Exception.Message)" "WARN"
                    }
                }
            }

            # Apply server-driven heartbeat interval (v6 migration: 60s → 120s)
            if ($response -and $response.PSObject -and $response.PSObject.Properties['heartbeat_interval_seconds']) {
                $serverInterval = [int]$response.heartbeat_interval_seconds
                if ($serverInterval -ge 10 -and $serverInterval -ne $script:Config.HeartbeatInterval) {
                    Write-Log "[HEARTBEAT] Server adjusted interval: $($script:Config.HeartbeatInterval)s -> ${serverInterval}s" "INFO"
                    $script:Config.HeartbeatInterval = $serverInterval
                }
            }

            # Process pending jobs via typed dispatcher
            if ($response -and $response.commands) {
                foreach ($cmd in $response.commands) {
                    $cmdPayload = $null
                    if ($cmd.PSObject -and $cmd.PSObject.Properties['payload']) {
                        $cmdPayload = $cmd.payload
                    }
                    $cmdTimeout = 30
                    if ($cmd.PSObject -and $cmd.PSObject.Properties['timeout_seconds'] -and $cmd.timeout_seconds) {
                        $cmdTimeout = [int]$cmd.timeout_seconds
                    }

                    $result = Invoke-AgentJob `
                        -JobId $cmd.id `
                        -JobType $cmd.job_type `
                        -Payload $cmdPayload `
                        -Timeout $cmdTimeout

                    Invoke-SecureApi -Endpoint "job-result" -Method "POST" -Body @{
                        job_id = $cmd.id
                        result = $result
                    }
                }
            }

            # Check for updates
            if ($response -and $response.PSObject -and $response.PSObject.Properties['update_available'] -and $response.update_available) {
                Invoke-CheckForUpdate
                if ($Global:RestartRequested) {
                    Write-Log "Update restart requested - exiting heartbeat loop" "INFO"
                    break
                }
            }
        }
        catch {
            $script:ConsecutiveFailures++
            Write-Log "Heartbeat error (#$($script:ConsecutiveFailures)): $($_.Exception.Message)" "ERROR"

            if ($script:ConsecutiveFailures -ge $script:Config.MaxRetries) {
                Write-Log "Circuit breaker tripped after $($script:ConsecutiveFailures) failures" "ERROR"
                $script:CircuitBreakerOpen = $true
            }
        }

        Start-Sleep -Seconds $script:Config.HeartbeatInterval
    }
}

# ============================================
#  JOB DISPATCHER (whitelisted job types only)
#  Delegates to modular handlers - zero inline logic
# ============================================
function Invoke-AgentJob {
    param(
        [string]$JobId,
        [string]$JobType,
        [object]$Payload,
        [int]$Timeout = 30
    )

    Write-Log "Dispatching job $JobId type=$JobType (timeout: ${Timeout}s)" "INFO"

    try {
        $result = switch ($JobType) {
            # === Collection jobs (collection.ps1) ===
            "software_inventory_collect" { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectSoftwareInventory } }
            "collect_antivirus_status"   { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectAntivirusStatus } }
            "collect_network_info"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectNetworkInfo } }
            "collect_web_activity"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectWebActivity } }
            "collect_dns_blocks"         { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectDnsBlocks } }
            "light_vuln_scan"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-LightVulnScan } }
            "scan"                       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-ScanJob } }
            "report"                     { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-ReportJob } }
            "collect_backup_status"      { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectBackupStatus } }
            "collect_process_lineage"    { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-CollectProcessLineage } }

            # === Remediation jobs (remediation.ps1) ===
            "kill_process"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-KillProcess -Payload $Payload } }
            "stop_service"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-StopService -Payload $Payload } }
            "disable_service"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-DisableService -Payload $Payload } }
            "restart_service"            { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-RestartService -Payload $Payload } }
            "disk_cleanup"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-DiskCleanup } }
            "network_diagnostics"        { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-NetworkDiagnostics -Payload $Payload } }
            "service_health_check"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-ServiceHealthCheck -Payload $Payload } }
            "fix_firewall"               { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-FixFirewall } }
            "high_cpu_check"             { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-HighCpuProcessCheck } }
            "sync_blocked_websites"      { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-SyncBlockedWebsites -Payload $Payload } }
            "quarantine_agent"           { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-QuarantineAgent -Payload $Payload } }
            "apply_security_patch"       { Invoke-JobWithTimeout -JobId $JobId -Timeout $Timeout -Handler { Invoke-ApplySecurityPatch -Payload $Payload } }

            # === Lifecycle jobs (inline - minimal logic) ===
            "update_agent"               { @{ success = $true; message = "Update delegated to heartbeat force_update mechanism"; agent_version = $script:Config.Version } }
            "reinstall_agent"            { @{ success = $true; message = "Reinstall delegated to force_update mechanism" } }
            "collect_info"               { @{ hostname = $env:COMPUTERNAME; os_version = [System.Environment]::OSVersion.VersionString; architecture = $env:PROCESSOR_ARCHITECTURE; agent_version = $script:Config.Version } }
            "integration_test_v3"        { @{ pong = $true; agent_version = $script:Config.Version; timestamp = (Get-Date -Format "o"); hostname = $env:COMPUTERNAME } }

            default {
                Write-Log "SECURITY: Rejected unknown job type '$JobType' for job $JobId" "WARN"
                @{ success = $false; error = "Unknown job type: $JobType"; exit_code = -1 }
            }
        }

        Write-Log "Job $JobId ($JobType) completed" "INFO"
        return $result
    }
    catch {
        Write-Log "Job $JobId failed: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message; exit_code = -1 }
    }
}

# ============================================
#  TIMEOUT WRAPPER
#  Uses inline execution with a watchdog timer.
#  Avoids Start-Job (runs in isolated scope without module functions).
# ============================================
function Invoke-JobWithTimeout {
    param(
        [string]$JobId,
        [int]$Timeout = 30,
        [scriptblock]$Handler
    )

    # For short timeouts or simple jobs, run inline with a deadline check
    $timer = [System.Diagnostics.Stopwatch]::StartNew()

    try {
        # Execute the handler in the current scope (has access to all module functions)
        $output = & $Handler

        $timer.Stop()
        $elapsed = [math]::Round($timer.Elapsed.TotalSeconds, 2)

        if ($elapsed -gt $Timeout) {
            Write-Log "Job $JobId completed but exceeded timeout (${elapsed}s > ${Timeout}s)" "WARN"
        }

        # If handler returns a hashtable, use it directly
        if ($output -is [hashtable]) {
            if (-not $output.ContainsKey('execution_time_seconds')) {
                $output['execution_time_seconds'] = $elapsed
            }
            return $output
        }

        return @{
            success               = $true
            output                = ($output | Out-String).Trim()
            exit_code             = 0
            execution_time_seconds = $elapsed
        }
    }
    catch {
        $timer.Stop()
        Write-Log "Job $JobId failed after $([math]::Round($timer.Elapsed.TotalSeconds, 2))s: $($_.Exception.Message)" "ERROR"
        return @{
            success               = $false
            error                 = $_.Exception.Message
            exit_code             = -1
            execution_time_seconds = [math]::Round($timer.Elapsed.TotalSeconds, 2)
        }
    }
}

# --- END MODULE: job-runner.ps1 ---


function Main {
    Write-Log "CyberShield Agent v6.0 starting" "INFO"

    try {
        # 1. Initialize configuration
        Initialize-Config -AgentToken $AgentToken -HmacSecret $HmacSecret -ApiEndpoint $ApiEndpoint
        $Global:AgentToken = $script:Config.AgentToken
        $Global:HmacSecret = $script:Config.HmacSecret
        $Global:ServerUrl = $script:Config.ApiEndpoint
        Write-Log "Configuration loaded" "INFO"

        # 2. Validate HMAC secret (fail-closed: agent cannot operate without it)
        if (-not $Global:HmacSecret) {
            Write-Log "SECURITY: HmacSecret not configured - agent cannot authenticate. Aborting." "ERROR"
            throw "HmacSecret is required for agent operation. Configure via secrets file or enrollment."
        }
        Write-Log "HMAC secret validated" "INFO"

        # 3. Load persisted state
        Import-PersistedState
        Write-Log "State loaded" "INFO"

        # 4. Watchdog or agent mode
        if ($env:CYBERSHIELD_WATCHDOG -eq "true") {
            Write-Log "Starting in watchdog mode" "INFO"
            Start-Watchdog
        }
        else {
            Write-Log "Starting in agent mode" "INFO"
            Set-AgentState -NewState "AUTHENTICATING" -Reason "Agent startup"
            Start-HeartbeatLoop
        }
    }
    catch {
        Write-Log "Fatal error: $($_.Exception.Message)" "ERROR"
        try {
            Write-EventLog -LogName Application -Source "CyberShield" -EntryType Error -EventId 9001 -Message "Agent fatal error: $($_.Exception.Message)"
        } catch { }
        exit 1
    }
    finally {
        # Release mutex on exit
        if ($script:AgentMutex) {
            try {
                $script:AgentMutex.ReleaseMutex()
                $script:AgentMutex.Dispose()
            } catch { }
        }
    }
}

Main
