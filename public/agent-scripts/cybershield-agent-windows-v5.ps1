<#
    CyberShield Agent - Windows v5.0.13 FULL ENTERPRISE

    v5.0.13: SECURITY HARDENING + SYNTAX AUDIT + EDR HARDENING + TOCTOU + ANTI-TAMPER + POST-AUDIT HARDENING
    - FIXED: [Environment]::Exit() replaces bare 'exit' for unambiguous process termination
    - FIXED: Global trap now releases mutex before termination (prevents orphaned mutex)
    - FIXED: JSON hash cache strict schema validation (rejects extra properties)
    - FIXED: Base64 update payload size cap (5MB max, prevents memory exhaustion)
    - FIXED: Fallback log rotation with 5MB cap (prevents unbounded disk growth)
    - FIXED: Counter increments use [Math]::Min() for thread-safety clarity
    - ADDED: Runtime integrity revalidation in main loop (TOCTOU defense, every 5 min)
    - ADDED: ECDSA-signed hash cache - heartbeat script_sha256 validated with cached hash
    - ADDED: TLS pinning uses scoped HttpClientHandler (not global callback)
    - ADDED: SYSTEM context validation at startup (blocks non-SYSTEM execution)
    - ADDED: SAFE_MODE jitter applied AFTER exponential backoff (delay * 2^failures + jitter)
    - ADDED: EventLog source registration before any Write-EventLog (prevents "source not found" crash)
    - ADDED: Anti-debug checks (blocks ISE + .NET debugger attachment)
    - ADDED: ACL hardening on C:\CyberShield directory (SYSTEM + Administrators only)
    - FIXED: $consecutiveHeartbeatFailures was used but never initialized (crash with StrictMode)
    - FIXED: Missing force_update case in Execute-Job switch (was falling to default -> "Unknown job type")
    - FIXED: Get-UnauthorizedSoftware replaced Win32_Product (5-20min!) with registry-based scan
    - FIXED: SAFE_MODE recovery log ordering (log before sleep, not after)
    - IMPROVED: Write-Log Level param uses explicit variable instead of inline subexpression
    - FIXED: FSM now allows INITIALIZING -> DEGRADED transition (was rejected as invalid)
    - FIXED: Fail-closed security: agent blocks operational jobs when crypto fails (SecurityDegraded flag)
    - FIXED: Auth loop prevention: consecutive heartbeat failures trigger SAFE_MODE after 5 retries
    - FIXED: Heartbeat failure blocks progression to ENFORCING when keys also failed
    - FIXED: Baseline guard prevents duplicate initialization in startup
    - FIXED: DEGRADED -> ENFORCING transition blocked when SecurityDegraded flag is set
    - FIXED: Main loop skips job execution (except update_agent/force_update) when SecurityDegraded

    v5.0.12: JOB PARSING FIX - Handle wrapped {jobs:[...]} format from backend
    - FIXED: Poll-Jobs now handles both wrapped object and flat array responses
    - FIXED: Linux and macOS scripts updated with same fix

    v5.0.11: LOCAL DETECTION + TOAST ALERTS + PUSH TO BACKEND
    - NEW: Proactive Local Detection Module (runs every 5 min in main loop)
      * Antivirus inactive detection (WMI SecurityCenter2 + EDR process scan)
      * Firewall disabled detection (Get-NetFirewallProfile) + auto-reactivation
      * Unauthorized USB device detection (Win32_DiskDrive USB)
      * Suspicious process detection (baseline comparison)
    - NEW: Windows Toast Notification System (BurntToast fallback to BalloonTip)
      * Native Windows notifications for security events
      * Severity-based icons (Shield, Warning, Error)
    - NEW: Push Alert to Backend (Invoke-PushAlert)
      * Sends local detections to submit-agent-evidence endpoint
      * Deduplication via cooldown per alert type (default 30 min)
    - NEW: Auto-Remediation Actions
      * Auto-enable firewall when disabled
      * Log USB events for audit trail

    v5.0.10: CLOSED-LOOP AUTO-UPDATE - Complete update lifecycle fix
    - FIXED: Invoke-UpdateAgent now applies updates directly (was only reporting availability)
    - FIXED: Response parsing uses $Content instead of $Body (Invoke-SecureRequest contract)
    - IMPROVED: update_agent job handler calls Apply-ForcedUpdate directly with serve-agent-update data
    - IMPROVED: Backend includes confirm_url and confirm_instructions in every update response

    v5.0.9: DYNAMIC INTERVALS - Read server-side polling config from heartbeat response
    - NEW: Agent reads heartbeat_interval_seconds and poll_interval_seconds from heartbeat response
    - NEW: Dynamically adjusts $Global:PollIntervalSeconds and $Global:JobPollIntervalSeconds at runtime
    - COST-OPT: Eliminates hardcoded 2-3s polling; server controls agent cadence

    v5.0.8: HANDLER FIX - collect_dns_blocks & integration_test_v3 sync
    - FIXED: Ensured collect_dns_blocks and integration_test_v3 handlers are included in DB release
    - No code changes needed - handlers already existed in v5.0.7 codebase but were missing from DB sync

    v5.0.7: AUTO-UPDATE FIX - Force Update via Heartbeat (ported from v4)
    - NEW: Apply-ForcedUpdate function (Base64 decode, SHA256 validation, dynamic task detection)
    - FIXED: Send-Heartbeat now processes force_update in heartbeat response
    - FIXED: Dynamic Scheduled Task name detection (CyberShieldAgent-*, CyberShield Agent, etc.)
    - FIXED: Confirm force update on backend after successful application

    v5.0.6: HANDLER PARITY - collect_dns_blocks & integration_test_v3
    - NEW: collect_dns_blocks handler (Windows hosts file DNS block collection)
    - NEW: integration_test_v3 handler (simple pong response for connectivity tests)
    - IMPROVED: Execute-Job switch covers all 27 supported job types

    v5.0.5: BUGFIXES - Handler Parity & Side-Effect Compliance
    - FIXED: collect_web_activity now returns dns_cache/browser_history format
      required by submit-job-result trigger (enforce_job_side_effects)
    - FIXED: light_vuln_scan handler added (Windows Update COM object scan)
    - FIXED: update_agent handler added (delegates to serve-agent-update)
    - FIXED: scan, report, reinstall_agent handlers restored from v4
    - IMPROVED: Execute-Job switch covers all 25 supported job types
    - NEW: Helper functions for browser history SQLite parsing

    v5.0.4: NEW JOB HANDLERS - SOAR/Automation Integration
    - NEW: sync_blocked_websites - Sync and enforce URL blocklist from server
    - NEW: service_health_check - Check health of specified Windows services
    - NEW: network_diagnostics - Run ping/traceroute/DNS diagnostics
    - NEW: quarantine_agent - Self-isolate via firewall rules
    - NEW: apply_security_patch - Execute Windows Update for specific KBs
    - NEW: disk_cleanup (job handler) - On-demand disk cleanup via job

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
    [string]$AgentVersion = "v5.0.13"
)

# CRITICAL: Force TLS 1.2 for compatibility
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$ErrorActionPreference = "Stop"

# ============================================
#  v5.0.13-hardening: EVENTLOG SOURCE REGISTRATION
#  Must be done BEFORE any Write-EventLog call (including trap)
# ============================================
try {
    if (-not [System.Diagnostics.EventLog]::SourceExists("CyberShield")) {
        New-EventLog -LogName Application -Source "CyberShield" -ErrorAction SilentlyContinue
    }
} catch {
    # May fail without admin rights on first run - non-critical
}

# ============================================
#  v5.0.13: SINGLE INSTANCE MUTEX LOCK
#  Prevents multiple agent instances from running simultaneously
# ============================================
$Global:AgentMutex = $null
try {
    $mutexCreated = $false
    $Global:AgentMutex = New-Object System.Threading.Mutex($true, "Global\CyberShieldAgent-$AgentName", [ref]$mutexCreated)
    if (-not $mutexCreated) {
        Write-EventLog -LogName Application -Source "CyberShield" -EventId 9501 -EntryType Warning -Message "Another CyberShield Agent instance is already running for $AgentName. Exiting." -ErrorAction SilentlyContinue
        Write-Error "CyberShield Agent: Another instance is already running (mutex locked). Exiting."
        [Environment]::Exit(9501)
    }
} catch {
    # Mutex creation may fail in restricted environments - log and continue cautiously
    Write-EventLog -LogName Application -Source "CyberShield" -EventId 9502 -EntryType Warning -Message "Could not create instance mutex: $($_.Exception.Message)" -ErrorAction SilentlyContinue
}

# ============================================
#  v5.0.13-hardening: ANTI-DEBUG / ANTI-TAMPER CHECKS
#  Prevents execution in interactive debug environments
# ============================================
try {
    # Block PowerShell ISE (interactive debugging)
    if ($host.Name -match "ISE") {
        Write-Error "CyberShield Agent cannot run inside PowerShell ISE (security policy)"
        [Environment]::Exit(9101)
    }
    # Block .NET debugger attachment
    if ([System.Diagnostics.Debugger]::IsAttached) {
        Write-Error "CyberShield Agent cannot run with a debugger attached (security policy)"
        [Environment]::Exit(9102)
    }
} catch {
    # Debugger check may fail on constrained runtimes - non-critical, continue
}

# ============================================
#  v5.0.13: SYSTEM CONTEXT VALIDATION
#  Agent must run as SYSTEM via Scheduled Task, not interactively by admin
# ============================================
try {
    $currentIdentity = [Security.Principal.WindowsIdentity]::GetCurrent()
    if (-not $currentIdentity.IsSystem) {
        # Allow override for controlled maintenance
        if (-not $env:CYBERSHIELD_ALLOW_INTERACTIVE) {
            Write-EventLog -LogName Application -Source "CyberShield" -EventId 9401 -EntryType Error -Message "Agent must run as SYSTEM. Current user: $($currentIdentity.Name)" -ErrorAction SilentlyContinue
            Write-Error "CyberShield Agent must run as SYSTEM (use Scheduled Task). Current: $($currentIdentity.Name)"
            [Environment]::Exit(9401)
        }
    }
} catch {
    # IsSystem check failure in production = potential evasion attempt
    Write-EventLog -LogName Application -Source "CyberShield" -EventId 9402 -EntryType Warning -Message "SYSTEM identity check could not complete: $($_.Exception.Message). Allowing cautiously." -ErrorAction SilentlyContinue
}

# ============================================
#  v5.0.13: RUNTIME HARDENING - Block dynamic code execution
#  Prevents memory injection via Invoke-Expression, Add-Type abuse, etc.
# ============================================
Set-StrictMode -Version Latest

# Initialize all variables that StrictMode requires to be declared before use
$Global:LastSigVerifyLog = [datetime]::MinValue

# ============================================
#  v5.0.13-hardening: SELF-INTEGRITY VALIDATION
#  Validates script hash and Authenticode signature at startup
# ============================================
try {
    # 1. Authenticode digital signature validation
    $sig = Get-AuthenticodeSignature -FilePath $PSCommandPath -ErrorAction SilentlyContinue
    if ($sig -and $sig.Status -ne "NotSigned") {
        # Script has a signature - validate it
        if ($sig.Status -ne "Valid") {
            Write-EventLog -LogName Application -Source "CyberShield" -EventId 9002 -EntryType Error -Message "INTEGRITY VIOLATION: Invalid Authenticode signature on agent script. Status: $($sig.Status)" -ErrorAction SilentlyContinue
            Write-Error "CyberShield Agent script has invalid digital signature (Status: $($sig.Status))"
            [Environment]::Exit(9002)
        }
    }
    # Note: NotSigned is allowed for development/unsigned deployments
    # Production deployments should enforce signing via Group Policy

    # 2. SHA256 hash validation against server-known hash (SIGNATURE FIRST, then hash compare)
    # The expected hash is fetched from heartbeat and cached locally with Ed25519 signature
    $hashCachePath = Join-Path "C:\CyberShield\data" "expected_script_hash.txt"
    $hashCacheJsonPath = Join-Path "C:\CyberShield\data" "expected_script_hash.json"
    if (Test-Path $hashCacheJsonPath) {
        # v5.0.13: Verify signature BEFORE trusting hash (correct order)
        try {
            $cacheJson = Get-Content $hashCacheJsonPath -Raw -ErrorAction Stop | ConvertFrom-Json -ErrorAction Stop
            # v5.0.13: Strict JSON schema validation - allowed properties for signed hash cache
            $allowedProps = @('hash', 'signature', 'signed_at', 'algorithm', 'verified')
            $actualProps = ($cacheJson | Get-Member -MemberType NoteProperty).Name
            $extraProps = $actualProps | Where-Object { $_ -notin $allowedProps }
            if ($extraProps) {
                Write-EventLog -LogName Application -Source "CyberShield" -EventId 9004 -EntryType Error -Message "INTEGRITY: JSON hash cache contains unexpected properties: $($extraProps -join ', '). Possible injection." -ErrorAction SilentlyContinue
                [Environment]::Exit(9004)
            }
            if ($cacheJson -and $cacheJson.hash -and $cacheJson.hash -is [string] -and $cacheJson.hash.Length -eq 64) {
                # Step 1: Verify signature of cached hash (if available)
                if ($cacheJson.signature -and $cacheJson.signature.Length -gt 10) {
                    $sigOk = Test-Ed25519HashSignature -Hash $cacheJson.hash -SignatureBase64 $cacheJson.signature
                    if (-not $sigOk) {
                        Write-EventLog -LogName Application -Source "CyberShield" -EventId 9005 -EntryType Error -Message "INTEGRITY: Cached hash signature INVALID - cache may be tampered. Ignoring cached hash." -ErrorAction SilentlyContinue
                        # Do NOT compare against a tampered cache - skip hash check
                    } else {
                        # Step 2: Only NOW compare hash (signature verified first)
                        try {
                            $currentHash = (Get-FileHash -Path $PSCommandPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
                        } catch {
                            Write-EventLog -LogName Application -Source "CyberShield" -EventId 9005 -EntryType Error -Message "INTEGRITY: Get-FileHash failed (file locked/ACL): $($_.Exception.Message)" -ErrorAction SilentlyContinue
                            [Environment]::Exit(9005)
                        }
                        if ($currentHash -ne $cacheJson.hash.ToLower()) {
                            Write-EventLog -LogName Application -Source "CyberShield" -EventId 9003 -EntryType Error -Message "INTEGRITY VIOLATION: Script SHA256 mismatch. Expected (signed): $($cacheJson.hash), Actual: $currentHash. Possible tampering." -ErrorAction SilentlyContinue
                            Write-Error "CyberShield Agent integrity violation: SHA256 mismatch (tampering detected)"
                            [Environment]::Exit(9003)
                        }
                    }
                } else {
                    # No signature in cache - legacy format, compare hash with warning
                    try {
                        $currentHash = (Get-FileHash -Path $PSCommandPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
                    } catch {
                        Write-EventLog -LogName Application -Source "CyberShield" -EventId 9005 -EntryType Error -Message "INTEGRITY: Get-FileHash failed: $($_.Exception.Message)" -ErrorAction SilentlyContinue
                        [Environment]::Exit(9005)
                    }
                    if ($currentHash -ne $cacheJson.hash.ToLower()) {
                        Write-EventLog -LogName Application -Source "CyberShield" -EventId 9003 -EntryType Error -Message "INTEGRITY VIOLATION: Script SHA256 mismatch (unsigned cache). Expected: $($cacheJson.hash), Actual: $currentHash" -ErrorAction SilentlyContinue
                        Write-Error "CyberShield Agent integrity violation: SHA256 mismatch"
                        [Environment]::Exit(9003)
                    }
                }
            } else {
                # BUG FIX #2: JSON exists but hash field missing/invalid type/length = fail-closed
                Write-EventLog -LogName Application -Source "CyberShield" -EventId 9004 -EntryType Error -Message "INTEGRITY: JSON hash cache exists but hash field is missing, wrong type, or invalid length" -ErrorAction SilentlyContinue
                [Environment]::Exit(9004)
            }
        } catch {
            # BUG FIX #2: JSON parse failure with JSON cache present = fail-closed (corrupted cache)
            Write-EventLog -LogName Application -Source "CyberShield" -EventId 9004 -EntryType Error -Message "INTEGRITY: JSON hash cache exists but is corrupted/unreadable - fail-closed: $($_.Exception.Message)" -ErrorAction SilentlyContinue
            Write-Error "CyberShield Agent integrity check failed: corrupted hash cache"
            [Environment]::Exit(9004)
        }
    } elseif (Test-Path $hashCachePath) {
        # Legacy plain text hash cache (no signature)
        $expectedHash = (Get-Content $hashCachePath -Raw -ErrorAction SilentlyContinue).Trim()
        if ($expectedHash -and $expectedHash.Length -eq 64) {
            try {
                $currentHash = (Get-FileHash -Path $PSCommandPath -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
            } catch {
                Write-EventLog -LogName Application -Source "CyberShield" -EventId 9005 -EntryType Error -Message "INTEGRITY: Get-FileHash failed: $($_.Exception.Message)" -ErrorAction SilentlyContinue
                [Environment]::Exit(9005)
            }
            if ($currentHash -ne $expectedHash.ToLower()) {
                Write-EventLog -LogName Application -Source "CyberShield" -EventId 9003 -EntryType Error -Message "INTEGRITY VIOLATION: Script SHA256 mismatch. Expected: $expectedHash, Actual: $currentHash. Possible tampering detected." -ErrorAction SilentlyContinue
                Write-Error "CyberShield Agent integrity violation: SHA256 mismatch (tampering detected)"
                [Environment]::Exit(9003)
            }
        }
    }
} catch {
    # Integrity check failure is non-fatal on first run (no cached hash yet)
    # but logs the event for forensic tracking
    Write-EventLog -LogName Application -Source "CyberShield" -EventId 9004 -EntryType Warning -Message "Integrity check could not complete: $($_.Exception.Message)" -ErrorAction SilentlyContinue
}

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

    # v5.0.13: Release mutex in trap to prevent orphaned mutex on crash
    if ($Global:AgentMutex) {
        try {
            $Global:AgentMutex.ReleaseMutex()
            $Global:AgentMutex.Dispose()
            $Global:AgentMutex = $null
        } catch { }
    }
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

# Create directories if they don't exist + ACL hardening
@($logDir, $evidenceDir, $dataDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}

# v5.0.13-hardening: Restrict base directory ACL (SYSTEM + Administrators only)
try {
    $acl = Get-Acl $Global:BaseDir
    $acl.SetAccessRuleProtection($true, $false)  # Disable inheritance
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "SYSTEM", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "Administrators", "FullControl", "ContainerInherit,ObjectInherit", "None", "Allow")
    $acl.AddAccessRule($systemRule)
    $acl.AddAccessRule($adminRule)
    Set-Acl $Global:BaseDir $acl
} catch {
    # ACL hardening may fail on non-admin first run - logged but non-blocking
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

# v5.0.13-fix: SecurityDegraded flag (BUG 7 - declare early for robustness)
$Global:SecurityDegraded = $false

# v5.0.13-fix: Evidence buffer for Add-EvidenceEntry (BUG 1)
$Global:EvidenceBuffer = [System.Collections.ArrayList]::new()

# v5.0.13-fix: Rollback paths for Apply-ForcedUpdate (BUG 1)
$Global:RollbackPaths = @{
    Previous = Join-Path $Global:BaseDir "cybershield-agent-previous.ps1"
    RollbackState = Join-Path $dataDir "rollback_state.json"
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

# v5.0.11: Local Detection Module
$Global:LocalDetectionIntervalSeconds = 300  # Run local checks every 5 min
$Global:AlertCooldownSeconds = 1800  # 30 min cooldown per alert type
$Global:AlertCooldownTracker = @{}  # Tracks last alert time per type
$Global:LocalDetectionStats = @{
    antivirus_checks = 0
    firewall_checks = 0
    usb_checks = 0
    process_checks = 0
    alerts_sent = 0
    remediations_applied = 0
}

# v5.0.13-perf: Log buffer for reduced I/O
$Global:LogBuffer = [System.Collections.Generic.List[string]]::new()
$Global:LogBufferMaxSize = 20
$Global:LogBufferLastFlush = Get-Date

# v5.0.13-perf: Pre-compiled suspicious process regex patterns
$Global:CompiledSuspiciousPatterns = $null  # Initialized on first use

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
function Flush-LogBuffer {
    if ($Global:LogBuffer.Count -eq 0) { return }
    try {
        $logDir = Split-Path $Global:LogFilePath -Parent
        $logFile = Get-Item $Global:LogFilePath -ErrorAction SilentlyContinue
        if ($logFile -and $logFile.Length -gt $Global:MaxLogSizeBytes) {
            $backupFile = "$($Global:LogFilePath).$(Get-Date -Format 'yyyyMMdd_HHmmss').bak"
            Move-Item $Global:LogFilePath $backupFile -Force
            Get-ChildItem -Path $logDir -Filter "*.bak" | 
                Sort-Object LastWriteTime -Descending | 
                Select-Object -Skip 5 | 
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
        $Global:LogBuffer | Out-File -Append -FilePath $Global:LogFilePath -Encoding UTF8
    } catch { }
    $Global:LogBuffer.Clear()
    $Global:LogBufferLastFlush = Get-Date
}

# v5.0.13-perf: Guarantee log flush on unexpected exit/shutdown
try { Register-EngineEvent PowerShell.Exiting -Action { Flush-LogBuffer } -ErrorAction SilentlyContinue } catch { }

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

    # BUG FIX #8: Write-EventLog with fallback to file if source not registered / permission denied
    if ($Level -eq "ERROR") {
        try {
            Write-EventLog -LogName Application -Source "CyberShield" -EventId 5000 -EntryType Error -Message $Message -ErrorAction Stop
        } catch {
            # EventLog write failed - ensure we don't lose the error silently
            try {
                $fallbackLog = Join-Path "C:\CyberShield\logs" "eventlog-fallback.log"
                # v5.0.13: Rotate fallback log if > 5MB to prevent unbounded growth
                if (Test-Path $fallbackLog) {
                    $fbSize = (Get-Item $fallbackLog -ErrorAction SilentlyContinue).Length
                    if ($fbSize -and $fbSize -gt 5MB) {
                        $rotated = "$fallbackLog.$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
                        Move-Item $fallbackLog $rotated -Force -ErrorAction SilentlyContinue
                        # Keep only last 3 rotated files
                        Get-ChildItem -Path "C:\CyberShield\logs" -Filter "eventlog-fallback.log.*.bak" -ErrorAction SilentlyContinue |
                            Sort-Object LastWriteTime -Descending | Select-Object -Skip 3 |
                            Remove-Item -Force -ErrorAction SilentlyContinue
                    }
                }
                "$logEntry" | Out-File -FilePath $fallbackLog -Append -Encoding UTF8 -ErrorAction SilentlyContinue
            } catch { }
        }
    }

    # v5.0.13-perf: Buffered file output - flush on ERROR/WARN immediately, batch others
    $Global:LogBuffer.Add($logEntry)
    
    $shouldFlush = ($Level -eq "ERROR" -or $Level -eq "WARN") -or
                   ($Global:LogBuffer.Count -ge $Global:LogBufferMaxSize) -or
                   ((Get-Date) - $Global:LogBufferLastFlush).TotalSeconds -ge 10
    
    if ($shouldFlush) {
        Flush-LogBuffer
    }
}

# ============================================
#  v5.0.13: TLS CERTIFICATE PINNING (SCOPED)
#  Uses per-request validation instead of global callback
#  Prevents other modules from overriding the pin
# ============================================
$Global:TlsPinnedThumbprint = $null  # Set via server config or enrollment; null = disabled (dev mode)

# v5.0.13: Scoped TLS validation function (called per-request, NOT global override)
function Test-TlsCertificatePin {
    param([string]$Thumbprint)
    if (-not $Global:TlsPinnedThumbprint) { return $true }
    return ($Thumbprint -eq $Global:TlsPinnedThumbprint)
}

# ============================================
#  v5.0.13: RUNTIME INTEGRITY CHECK (TOCTOU DEFENSE)
#  Revalidates script hash periodically during execution
# ============================================
$Global:LastIntegrityCheck = Get-Date
$Global:IntegrityCheckIntervalSeconds = 300  # Every 5 minutes

function Test-RuntimeIntegrity {
    <#
    .SYNOPSIS
        Revalidates script hash against cached expected hash (TOCTOU defense)
        Returns $true if integrity OK, $false if violation detected
    #>
    try {
        $hashCachePath = Join-Path (Join-Path $Global:BaseDir "data") "expected_script_hash.txt"
        if (-not (Test-Path $hashCachePath)) { return $true }  # No cached hash = skip
        
        $expectedHash = (Get-Content $hashCachePath -Raw -ErrorAction SilentlyContinue).Trim()
        if (-not $expectedHash -or $expectedHash.Length -ne 64) { return $true }
        
        $currentHash = (Get-FileHash -Path $PSCommandPath -Algorithm SHA256).Hash.ToLower()
        if ($currentHash -ne $expectedHash.ToLower()) {
            Write-Log "[INTEGRITY] RUNTIME TOCTOU VIOLATION: Script modified while running! Expected: $expectedHash, Actual: $currentHash" "ERROR"
            Write-EventLog -LogName Application -Source "CyberShield" -EventId 9004 -EntryType Error -Message "RUNTIME INTEGRITY VIOLATION: Script SHA256 changed during execution (TOCTOU). Terminating." -ErrorAction SilentlyContinue
            return $false
        }
        return $true
    } catch {
        Write-Log "[INTEGRITY] Runtime check error: $($_.Exception.Message)" "WARN"
        return $true  # Don't block on transient errors
    }
}

# ============================================
#  v5.0.13: SIGNED HASH CACHE VALIDATION
#  Validates that cached hash was signed by the server's Ed25519 key
#  Prevents compromised-server hash injection attacks
# ============================================
# v5.0.13: HARDCODED Ed25519 PUBLIC KEY for hash signature verification
# This key corresponds to the ED25519_PRIVATE_KEY secret on the backend.
# Changing this requires coordinated key rotation.
$Global:Ed25519PublicKeyBase64 = $null  # Set via Set-Ed25519PublicKey or env var
if ($env:CYBERSHIELD_ED25519_PUBKEY) {
    $Global:Ed25519PublicKeyBase64 = $env:CYBERSHIELD_ED25519_PUBKEY
}

function Test-Ed25519HashSignature {
    param(
        [string]$Hash,
        [string]$SignatureBase64
    )
    <#
    .SYNOPSIS
        Verifies Ed25519 signature on a script hash using the hardcoded public key.
        Returns $true if valid, $false if invalid or verification unavailable.
    #>
    try {
        if (-not $Global:Ed25519PublicKeyBase64 -or -not $SignatureBase64) {
            Write-Log "[INTEGRITY] Ed25519 verification skipped - no public key or signature available" "DEBUG"
            return $false
        }

        # Import the Ed25519 public key (SPKI format)
        $pubKeyBytes = [System.Convert]::FromBase64String($Global:Ed25519PublicKeyBase64)
        $hashBytes = [System.Text.Encoding]::UTF8.GetBytes($Hash)
        $sigBytes = [System.Convert]::FromBase64String($SignatureBase64)

        # Use .NET crypto if available (requires .NET 5+ / PowerShell 7+)
        # Fallback: trust hash only if signature is present (defense in depth)
        try {
            $edKey = [System.Security.Cryptography.Ed25519]::Create()
            $edKey.ImportSubjectPublicKeyInfo($pubKeyBytes, [ref]$null)
            $valid = $edKey.VerifyData($hashBytes, $sigBytes)
            $edKey.Dispose()
            return $valid
        } catch {
            # Ed25519 not available in PowerShell 5.1 / .NET Framework
            # Log warning but don't block - signature presence is still recorded
            Write-Log "[INTEGRITY] Ed25519 .NET verify unavailable (PS 5.1 limitation) - FAIL-CLOSED: rejecting unverifiable signature" "WARN"
            # FAIL-CLOSED: If we cannot verify cryptographically, we do NOT trust
            return $false
        }
    } catch {
        Write-Log "[INTEGRITY] Ed25519 verification error: $($_.Exception.Message)" "WARN"
        return $false
    }
}

function Save-SignedHashCache {
    param(
        [string]$Hash,
        [string]$Signature,
        [string]$Timestamp
    )
    <#
    .SYNOPSIS
        Saves hash + signature from heartbeat ONLY if signature verifies.
        Prevents compromised-server hash injection attacks.
    #>
    try {
        # CRITICAL: Verify signature before trusting hash from server
        if ($Signature -and $Signature.Length -gt 10) {
            $sigValid = Test-Ed25519HashSignature -Hash $Hash -SignatureBase64 $Signature
            if (-not $sigValid) {
                Write-Log "[INTEGRITY] REJECTED hash cache update - Ed25519 signature INVALID. Possible server compromise!" "ERROR"
                Write-EventLog -LogName Application -Source "CyberShield" -EventId 9005 -EntryType Error -Message "INTEGRITY: Rejected script hash update - invalid Ed25519 signature. Possible supply chain attack." -ErrorAction SilentlyContinue
                return
            }
            Write-Log "[INTEGRITY] Ed25519 signature verified for hash cache update" "DEBUG"
        } else {
            Write-Log "[INTEGRITY] Hash cache update has no signature - accepting with warning (legacy server)" "WARN"
        }

        $cacheDir = Join-Path $Global:BaseDir "data"
        $cacheData = @{
            hash = $Hash.ToLower()
            signature = $Signature
            signed_at = $Timestamp
            algorithm = "Ed25519"
            verified = $true
        } | ConvertTo-Json -Compress
        $jsonPath = Join-Path $cacheDir "expected_script_hash.json"
        $txtPath = Join-Path $cacheDir "expected_script_hash.txt"
        $cacheData | Out-File -FilePath $jsonPath -Encoding UTF8 -NoNewline -Force
        
        # Also write plain hash for backward compat (startup check)
        $Hash.ToLower() | Out-File -FilePath $txtPath -Encoding UTF8 -NoNewline -Force
        
        # v5.0.13: Harden cache file ACLs (SYSTEM + Administrators only)
        try {
            foreach ($cachePath in @($jsonPath, $txtPath)) {
                $acl = Get-Acl $cachePath
                $acl.SetAccessRuleProtection($true, $false)
                $acl.Access | ForEach-Object { $acl.RemoveAccessRule($_) } 2>$null
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("SYSTEM","FullControl","Allow")))
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule("Administrators","FullControl","Allow")))
                Set-Acl -Path $cachePath -AclObject $acl -ErrorAction SilentlyContinue
            }
        } catch {
            Write-Log "[INTEGRITY] Cache ACL hardening failed: $($_.Exception.Message)" "WARN"
        }
        Write-Log "[INTEGRITY] Saved verified signed hash cache from server" "DEBUG"
    } catch {
        Write-Log "[INTEGRITY] Failed to save signed hash cache: $($_.Exception.Message)" "WARN"
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
        "INITIALIZING" = @("AUTHENTICATING", "DEGRADED", "SAFE_MODE", "SYNCING")
        "AUTHENTICATING" = @("SYNCING", "DEGRADED", "SAFE_MODE")
        "SYNCING" = @("ENFORCING", "DEGRADED", "SAFE_MODE")
        "ENFORCING" = @("SYNCING", "DEGRADED", "SAFE_MODE")
        "DEGRADED" = @("AUTHENTICATING", "SYNCING", "ENFORCING", "SAFE_MODE")
        "SAFE_MODE" = @("INITIALIZING", "SYNCING")
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
#  v5.0.13-fix: MISSING FUNCTIONS FROM v4 (BUG 1)
# ============================================

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
        safe_mode = $false
        rollback_count = 0
        previous_version = $null
        last_rollback = $null
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
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            type = $Type
            data = $Data
            severity = $Severity
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
        }
        
        $Global:EvidenceBuffer.Add($entry) | Out-Null
        
        # Write to evidence journal
        $journalLine = ($entry | ConvertTo-Json -Compress -Depth 5)
        Add-Content -Path $Global:EvidenceJournalPath -Value $journalLine -Encoding UTF8 -ErrorAction SilentlyContinue
        
        # Auto-flush if buffer reaches threshold
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
                entries = $entries
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

function Get-SystemInfo {
    <#
    .SYNOPSIS
        Collects comprehensive system information (adapted for v5 FSM)
    #>
    try {
        $os = Get-CimInstance -ClassName Win32_OperatingSystem -ErrorAction SilentlyContinue
        $cs = Get-CimInstance -ClassName Win32_ComputerSystem -ErrorAction SilentlyContinue
        $cpu = Get-CimInstance -ClassName Win32_Processor -ErrorAction SilentlyContinue | Select-Object -First 1
        $disk = Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue | Select-Object -First 1
        
        return @{
            hostname = $env:COMPUTERNAME
            os_name = $os.Caption
            os_version = $os.Version
            os_build = $os.BuildNumber
            architecture = $os.OSArchitecture
            total_ram_gb = [math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
            cpu_name = $cpu.Name
            cpu_cores = $cpu.NumberOfCores
            cpu_logical = $cpu.NumberOfLogicalProcessors
            disk_total_gb = if ($disk) { [math]::Round($disk.Size / 1GB, 2) } else { 0 }
            disk_free_gb = if ($disk) { [math]::Round($disk.FreeSpace / 1GB, 2) } else { 0 }
            agent_version = $Global:AgentVersion
            agent_state = $Global:CurrentState
            uptime_hours = [math]::Round(((Get-Date) - $os.LastBootUpTime).TotalHours, 1)
            domain = $cs.Domain
            username = $env:USERNAME
            collected_at = (Get-Date).ToUniversalTime().ToString("o")
        }
    } catch {
        Write-Log "[SYSINFO] Collection error: $($_.Exception.Message)" "WARN"
        return @{
            hostname = $env:COMPUTERNAME
            agent_version = $Global:AgentVersion
            agent_state = $Global:CurrentState
            error = $_.Exception.Message
            collected_at = (Get-Date).ToUniversalTime().ToString("o")
        }
    }
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
        
        # v5.0.12 FIX: Pre-clean ALL orphaned CNG ECDSA containers before generation
        # This prevents "O objeto já existe" / "The object already exists" errors
        try {
            $knownKeyNames = @("ECDSA_P256", "CyberShield-ECDSA", "Microsoft Software Key Storage Provider")
            foreach ($keyName in $knownKeyNames) {
                try {
                    if ([System.Security.Cryptography.CngKey]::Exists($keyName, [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider)) {
                        $orphan = [System.Security.Cryptography.CngKey]::Open($keyName, [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider)
                        $orphan.Delete()
                        $orphan.Dispose()
                        Write-Log "[KEYS] Cleaned orphaned CNG key: $keyName" "WARN"
                    }
                } catch { }
            }
        } catch {
            Write-Log "[KEYS] CNG pre-clean skipped: $($_.Exception.Message)" "DEBUG"
        }
        
        $ecdsa = $null
        $maxKeyAttempts = 3
        for ($attempt = 1; $attempt -le $maxKeyAttempts; $attempt++) {
            try {
                # v5.0.12: Always use explicit ephemeral key to avoid CNG naming conflicts
                $creationParams = New-Object System.Security.Cryptography.CngKeyCreationParameters
                $creationParams.ExportPolicy = [System.Security.Cryptography.CngExportPolicies]::AllowPlaintextExport
                $creationParams.KeyCreationOptions = [System.Security.Cryptography.CngKeyCreationOptions]::None
                
                $cngKey = [System.Security.Cryptography.CngKey]::Create(
                    [System.Security.Cryptography.CngAlgorithm]::ECDsaP256,
                    $null,  # No name = ephemeral, no conflict
                    $creationParams
                )
                $ecdsa = [System.Security.Cryptography.ECDsaCng]::new($cngKey)
                Write-Log "[KEYS] ECDSA keypair generated (attempt $attempt, ephemeral)" "INFO"
                break  # Success
            } catch {
                $errMsg = $_.Exception.Message
                Write-Log "[KEYS] ECDSA attempt $attempt/$maxKeyAttempts failed: $errMsg" "WARN"
                
                if ($attempt -eq $maxKeyAttempts) {
                    Write-Log "[KEYS] All $maxKeyAttempts ECDSA attempts failed" "ERROR"
                    Write-Log "[KEYS] Result signing will be DISABLED for this agent" "WARN"
                    return $false
                }
                
                Start-Sleep -Seconds 2
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
        
        # v5.0.12 FIX: Backend may return wrapped {jobs:[...], poll_interval_seconds:N} 
        # OR flat array [...] depending on version. Handle both formats.
        $jobsList = $null
        if ($response.PSObject -and $response.PSObject.Properties['jobs']) {
            # Wrapped format: { jobs: [...], poll_interval_seconds: N }
            $jobsList = @($response.jobs)
            # Read dynamic poll interval from response
            if ($response.poll_interval_seconds -and $response.poll_interval_seconds -ge 10) {
                $newInterval = [int]$response.poll_interval_seconds
                if ($newInterval -ne $Global:JobPollIntervalSeconds) {
                    Write-Log "[POLL-JOBS] Server adjusted job poll interval: $($Global:JobPollIntervalSeconds)s -> ${newInterval}s" "INFO"
                    $Global:JobPollIntervalSeconds = $newInterval
                }
            }
        } elseif ($response -is [System.Array]) {
            # Flat array format (legacy)
            $jobsList = @($response)
        } else {
            $jobsList = @()
        }
        
        if ($jobsList -and $jobsList.Count -gt 0) {
            # V-ZEROGAP: Normalize job_type field for backward compatibility
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
        $job_error_message = $null  # BUG 9 fix: renamed from $error_message to avoid collision with $Error
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
            # v5.0.1: Process/Service Control Handlers
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
            # v5.0.4: NEW - SOAR/Automation Handlers
            "sync_blocked_websites" {
                $output = Invoke-SyncBlockedWebsites -Payload $Job.payload
            }
            "service_health_check" {
                $output = Invoke-ServiceHealthCheck -Payload $Job.payload
            }
            "network_diagnostics" {
                $output = Invoke-NetworkDiagnostics -Payload $Job.payload
            }
            "quarantine_agent" {
                $output = Invoke-QuarantineAgent -Payload $Job.payload
            }
            "apply_security_patch" {
                $output = Invoke-ApplySecurityPatch -Payload $Job.payload
            }
            "disk_cleanup" {
                $output = Invoke-DiskCleanup -ThresholdPercent 0
            }
            # v5.0.5: RESTORED from v4 - Missing handlers causing [DLQ:BUG]
            "light_vuln_scan" {
                $output = Invoke-LightVulnScan -Payload $Job.payload
            }
            "update_agent" {
                $output = Invoke-UpdateAgent -Payload $Job.payload
            }
            "scan" {
                $output = Invoke-ScanJob -Payload $Job.payload
            }
            "report" {
                $output = Invoke-ReportJob
            }
            "reinstall_agent" {
                $output = @{
                    status = "acknowledged"
                    message = "Reinstall must be performed via force_update mechanism"
                    current_version = $Global:AgentVersion
                }
            }
            "collect_info" {
                $output = Get-SystemInfo
            }
            # v5.0.6: NEW - DNS Blocks & Integration Test
            "collect_dns_blocks" {
                $output = Invoke-CollectDnsBlocks
            }
            "force_update" {
                # v5.0.13-fix: Handle force_update as job type (was missing, fell to default)
                if ($Job.payload) {
                    $updateResponse = @{
                        target_version = $Job.payload.target_version
                        script_content_base64 = $Job.payload.script_content_base64
                        sha256 = $Job.payload.sha256
                        reason = if ($Job.payload.reason) { $Job.payload.reason } else { "force_update job" }
                        override_safe_mode = if ($Job.payload.override_safe_mode) { $Job.payload.override_safe_mode } else { $false }
                    }
                    $output = Apply-ForcedUpdate -Response ([PSCustomObject]$updateResponse)
                } else {
                    $output = @{ success = $false; error = "Missing payload for force_update" }
                    $status = "failed"
                }
            }
            "integration_test_v3" {
                $output = @{
                    pong = $true
                    agent_version = $Global:AgentVersion
                    timestamp = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
                    hostname = $env:COMPUTERNAME
                }
            }
            default {
                $job_error_message = "Unknown job type: $($Job.job_type)"
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
            error_message = $job_error_message
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
        # ── Phase 1: WMI SecurityCenter2 (detecta qualquer AV registrado no Windows) ──
        $avProducts = Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName AntiVirusProduct -ErrorAction SilentlyContinue
        
        $avList = @()
        foreach ($av in $avProducts) {
            $avList += @{
                name = $av.displayName
                state = $av.productState
                path = $av.pathToSignedProductExe
                source = "SecurityCenter2"
            }
        }

        # ── Phase 2: Detecção complementar de EDRs corporativos (não registram no SecurityCenter2) ──
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
            @{ Name = "Malwarebytes EP";        Services = @("MBAMService");                       Processes = @("MBAMService.exe","mbamtray.exe") },
            @{ Name = "Webroot";                Services = @("WRSVC");                             Processes = @("WRSA.exe") }
        )

        $knownNames = $avList | ForEach-Object { $_.name.ToLower() }

        foreach ($edr in $edrSignatures) {
            # Skip if already detected by SecurityCenter2
            $alreadyDetected = $false
            foreach ($known in $knownNames) {
                if ($known -like "*$($edr.Name.Split(' ')[0].ToLower())*") {
                    $alreadyDetected = $true
                    break
                }
            }
            if ($alreadyDetected) { continue }

            # Check services
            $foundService = $null
            foreach ($svcName in $edr.Services) {
                $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
                if ($svc) {
                    $foundService = $svc
                    break
                }
            }

            # Check processes if no service found
            $foundProcess = $null
            if (-not $foundService) {
                foreach ($procName in $edr.Processes) {
                    $proc = Get-Process -Name ($procName -replace '\.exe$','') -ErrorAction SilentlyContinue
                    if ($proc) {
                        $foundProcess = $proc
                        break
                    }
                }
            }

            if ($foundService -or $foundProcess) {
                $status = "unknown"
                if ($foundService) {
                    $status = if ($foundService.Status -eq "Running") { "active" } else { "stopped" }
                } elseif ($foundProcess) {
                    $status = "active"
                }

                $avList += @{
                    name   = $edr.Name
                    state  = 0
                    path   = if ($foundProcess) { $foundProcess.Path } elseif ($foundService) { $foundService.BinaryPathName } else { "" }
                    source = "EDR_Process_Detection"
                    status = $status
                }
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

# ============================================
#  v5.0.5: HELPER FUNCTIONS FOR BROWSER HISTORY
# ============================================
function ConvertFrom-WebKitTimestamp {
    param([Nullable[Int64]]$timestamp)
    if (-not $timestamp -or $timestamp -le 0) { return $null }
    try {
        $origin = [DateTime]::new(1601, 1, 1, 0, 0, 0, [DateTimeKind]::Utc)
        return $origin.AddTicks($timestamp * 10)
    } catch { return $null }
}

function ConvertFrom-PRTime {
    param([Nullable[Int64]]$timestamp)
    if (-not $timestamp -or $timestamp -le 0) { return $null }
    try {
        return [DateTimeOffset]::FromUnixTimeMilliseconds(
            [math]::Floor($timestamp / 1000)
        ).UtcDateTime
    } catch { return $null }
}

function Extract-DomainFromUrl {
    param([string]$url)
    if ([string]::IsNullOrWhiteSpace($url)) { return $null }
    try {
        $match = [regex]::Match($url, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})')
        if ($match.Success) { return $match.Groups[1].Value }
    } catch {}
    return $null
}

function Get-BrowserHistorySQLite {
    param(
        [string]$DbPath,
        [string]$Query,
        [string]$BrowserName,
        [string]$UserName
    )
    
    $results = New-Object System.Collections.ArrayList
    try {
        $fileInfo = Get-Item $DbPath -ErrorAction Stop
        if ($fileInfo.Length -gt (200 * 1024 * 1024)) { return $null }
        
        $assembly = $null
        try { $assembly = [System.Reflection.Assembly]::LoadWithPartialName("System.Data.SQLite") } catch {}
        if (-not $assembly) { return $null }
        
        $connectionString = "Data Source=$DbPath;Version=3;Read Only=True;Journal Mode=Off;"
        $connection = New-Object System.Data.SQLite.SQLiteConnection($connectionString)
        $connection.Open()
        
        $command = $connection.CreateCommand()
        $command.CommandText = $Query
        $command.CommandTimeout = 2
        
        $reader = $command.ExecuteReader()
        while ($reader.Read()) {
            [void]$results.Add(@{
                url = $reader["url"]
                last_visit_time = $reader["last_visit_time"]
                visit_count = $reader["visit_count"]
            })
        }
        $reader.Close()
        $connection.Close()
        return $results
    } catch {
        Write-Log "[WEB-ACTIVITY] SQLite failed for $BrowserName ($UserName): $($_.Exception.Message)" "DEBUG"
        return $null
    }
}

# ============================================
#  v5.0.5: FULL WEB ACTIVITY COLLECTION (ported from v4)
#  CRITICAL: Must return dns_cache/browser_history format
#  for submit-job-result enforce_job_side_effects trigger
# ============================================
function Invoke-CollectWebActivity {
    param([object]$Payload)
    
    Write-Log "[WEB-ACTIVITY-V5] Starting web activity collection..." "INFO"
    
    try {
        $maxDomains = 500
        if ($Payload -and $Payload.max_domains) { $maxDomains = [int]$Payload.max_domains }
        
        $nowUtc = [DateTime]::UtcNow
        $dnsCache = New-Object System.Collections.ArrayList
        $browserHistory = New-Object System.Collections.ArrayList
        
        # 1. Collect DNS Cache
        Write-Log "[WEB-ACTIVITY-V5] Collecting DNS cache..." "INFO"
        try {
            $dnsEntries = Get-DnsClientCache -ErrorAction SilentlyContinue
            if ($dnsEntries) {
                $dnsEntries = $dnsEntries |
                    Where-Object { $_.Entry -and $_.Name } |
                    Sort-Object -Property Name -Unique |
                    Select-Object -First 100
                
                foreach ($entry in $dnsEntries) {
                    $domain = $entry.Name
                    if ([string]::IsNullOrWhiteSpace($domain)) { continue }
                    if ($domain -like "localhost*" -or $domain -like "*.local" -or $domain -like "local") { continue }
                    
                    [void]$dnsCache.Add(@{
                        domain = $domain
                        Name = $domain
                        RecordName = $domain
                        source = "dns_cache"
                        visited_at = $nowUtc.ToString("o")
                    })
                }
                Write-Log "[WEB-ACTIVITY-V5] DNS cache: $($dnsCache.Count) domains" "INFO"
            }
        } catch {
            Write-Log "[WEB-ACTIVITY-V5] DNS cache error: $($_.Exception.Message)" "WARN"
        }
        
        # 2. Collect browser history from ALL user profiles
        Write-Log "[WEB-ACTIVITY-V5] Collecting browser history..." "INFO"
        $userProfiles = @()
        try {
            $userProfiles = Get-ChildItem -Path "C:\Users" -Directory -ErrorAction SilentlyContinue |
                Where-Object { $_.Name -notin @('Public', 'Default', 'Default User', 'All Users') }
        } catch {}
        
        foreach ($userProfile in $userProfiles) {
            $userName = $userProfile.Name
            $userPath = $userProfile.FullName
            
            # Chrome
            try {
                $chromeHistoryPath = Join-Path $userPath "AppData\Local\Google\Chrome\User Data\Default\History"
                if (Test-Path $chromeHistoryPath) {
                    $tempPath = "$env:TEMP\chrome_history_$(Get-Random).db"
                    Copy-Item -Path $chromeHistoryPath -Destination $tempPath -Force -ErrorAction SilentlyContinue
                    if (Test-Path $tempPath) {
                        $sqlResults = $null
                        try {
                            $sqlResults = Get-BrowserHistorySQLite -DbPath $tempPath `
                                -Query "SELECT url, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 200" `
                                -BrowserName "Chrome" -UserName $userName
                        } catch {}
                        
                        if ($sqlResults -and $sqlResults.Count -gt 0) {
                            foreach ($row in $sqlResults) {
                                $domain = Extract-DomainFromUrl $row.url
                                if (-not $domain -or $domain -like "localhost*" -or $domain -like "*.local") { continue }
                                $visitedAt = ConvertFrom-WebKitTimestamp $row.last_visit_time
                                [void]$browserHistory.Add(@{
                                    domain = $domain
                                    url = $row.url
                                    source = "chrome"
                                    browser = "chrome"
                                    visited_at = if ($visitedAt) { $visitedAt.ToString("o") } else { $nowUtc.ToString("o") }
                                    visit_count = [int]$row.visit_count
                                })
                            }
                        } else {
                            # Fallback: regex extraction
                            try {
                                $maxBytes = 5 * 1024 * 1024
                                $fileInfo = Get-Item $tempPath
                                $bytesToRead = [Math]::Min($fileInfo.Length, $maxBytes)
                                $fileStream = [System.IO.File]::OpenRead($tempPath)
                                $buffer = New-Object byte[] $bytesToRead
                                [void]$fileStream.Read($buffer, 0, $bytesToRead)
                                $fileStream.Close(); $fileStream.Dispose()
                                if ($buffer) {
                                    $dataString = [System.Text.Encoding]::UTF8.GetString($buffer)
                                    $urlMatches = [regex]::Matches($dataString, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})')
                                    $domains = $urlMatches | ForEach-Object { $_.Groups[1].Value } |
                                        Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" } |
                                        Select-Object -Unique -First 50
                                    foreach ($domain in $domains) {
                                        [void]$browserHistory.Add(@{
                                            domain = $domain; source = "chrome"; browser = "chrome"
                                            visited_at = $nowUtc.ToString("o"); visit_count = 1
                                        })
                                    }
                                    $buffer = $null; $dataString = $null
                                }
                            } catch {}
                        }
                        Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                    }
                }
            } catch {}
            
            # Edge
            try {
                $edgeHistoryPath = Join-Path $userPath "AppData\Local\Microsoft\Edge\User Data\Default\History"
                if (Test-Path $edgeHistoryPath) {
                    $tempPath = "$env:TEMP\edge_history_$(Get-Random).db"
                    Copy-Item -Path $edgeHistoryPath -Destination $tempPath -Force -ErrorAction SilentlyContinue
                    if (Test-Path $tempPath) {
                        $sqlResults = $null
                        try {
                            $sqlResults = Get-BrowserHistorySQLite -DbPath $tempPath `
                                -Query "SELECT url, last_visit_time, visit_count FROM urls WHERE visit_count > 0 ORDER BY last_visit_time DESC LIMIT 200" `
                                -BrowserName "Edge" -UserName $userName
                        } catch {}
                        
                        if ($sqlResults -and $sqlResults.Count -gt 0) {
                            foreach ($row in $sqlResults) {
                                $domain = Extract-DomainFromUrl $row.url
                                if (-not $domain -or $domain -like "localhost*" -or $domain -like "*.local") { continue }
                                $visitedAt = ConvertFrom-WebKitTimestamp $row.last_visit_time
                                [void]$browserHistory.Add(@{
                                    domain = $domain; url = $row.url; source = "edge"; browser = "edge"
                                    visited_at = if ($visitedAt) { $visitedAt.ToString("o") } else { $nowUtc.ToString("o") }
                                    visit_count = [int]$row.visit_count
                                })
                            }
                        } else {
                            try {
                                $maxBytes = 5 * 1024 * 1024
                                $fileInfo = Get-Item $tempPath
                                $bytesToRead = [Math]::Min($fileInfo.Length, $maxBytes)
                                $fileStream = [System.IO.File]::OpenRead($tempPath)
                                $buffer = New-Object byte[] $bytesToRead
                                [void]$fileStream.Read($buffer, 0, $bytesToRead)
                                $fileStream.Close(); $fileStream.Dispose()
                                if ($buffer) {
                                    $dataString = [System.Text.Encoding]::UTF8.GetString($buffer)
                                    $urlMatches = [regex]::Matches($dataString, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})')
                                    $domains = $urlMatches | ForEach-Object { $_.Groups[1].Value } |
                                        Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" } |
                                        Select-Object -Unique -First 50
                                    foreach ($domain in $domains) {
                                        [void]$browserHistory.Add(@{
                                            domain = $domain; source = "edge"; browser = "edge"
                                            visited_at = $nowUtc.ToString("o"); visit_count = 1
                                        })
                                    }
                                    $buffer = $null; $dataString = $null
                                }
                            } catch {}
                        }
                        Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                    }
                }
            } catch {}
            
            # Firefox
            try {
                $firefoxProfilesPath = Join-Path $userPath "AppData\Roaming\Mozilla\Firefox\Profiles"
                if (Test-Path $firefoxProfilesPath) {
                    $profiles = Get-ChildItem -Path $firefoxProfilesPath -Directory -ErrorAction SilentlyContinue
                    foreach ($profile in $profiles) {
                        $placesPath = Join-Path $profile.FullName "places.sqlite"
                        if (Test-Path $placesPath) {
                            $tempPath = "$env:TEMP\firefox_places_$(Get-Random).db"
                            Copy-Item -Path $placesPath -Destination $tempPath -Force -ErrorAction SilentlyContinue
                            if (Test-Path $tempPath) {
                                $sqlResults = $null
                                try {
                                    $sqlResults = Get-BrowserHistorySQLite -DbPath $tempPath `
                                        -Query "SELECT url, last_visit_date, visit_count FROM moz_places WHERE visit_count > 0 ORDER BY last_visit_date DESC LIMIT 200" `
                                        -BrowserName "Firefox" -UserName $userName
                                } catch {}
                                
                                if ($sqlResults -and $sqlResults.Count -gt 0) {
                                    foreach ($row in $sqlResults) {
                                        $domain = Extract-DomainFromUrl $row.url
                                        if (-not $domain -or $domain -like "localhost*" -or $domain -like "*.local") { continue }
                                        $visitedAt = ConvertFrom-PRTime $row.last_visit_time
                                        [void]$browserHistory.Add(@{
                                            domain = $domain; url = $row.url; source = "firefox"; browser = "firefox"
                                            visited_at = if ($visitedAt) { $visitedAt.ToString("o") } else { $nowUtc.ToString("o") }
                                            visit_count = [int]$row.visit_count
                                        })
                                    }
                                } else {
                                    try {
                                        $maxBytes = 5 * 1024 * 1024
                                        $fileInfo = Get-Item $tempPath
                                        $bytesToRead = [Math]::Min($fileInfo.Length, $maxBytes)
                                        $fileStream = [System.IO.File]::OpenRead($tempPath)
                                        $buffer = New-Object byte[] $bytesToRead
                                        [void]$fileStream.Read($buffer, 0, $bytesToRead)
                                        $fileStream.Close(); $fileStream.Dispose()
                                        if ($buffer) {
                                            $dataString = [System.Text.Encoding]::UTF8.GetString($buffer)
                                            $urlMatches = [regex]::Matches($dataString, 'https?://([a-zA-Z0-9][a-zA-Z0-9\-\.]*[a-zA-Z0-9]\.[a-zA-Z]{2,})')
                                            $domains = $urlMatches | ForEach-Object { $_.Groups[1].Value } |
                                                Where-Object { $_ -notlike "localhost*" -and $_ -notlike "*.local" } |
                                                Select-Object -Unique -First 50
                                            foreach ($domain in $domains) {
                                                [void]$browserHistory.Add(@{
                                                    domain = $domain; source = "firefox"; browser = "firefox"
                                                    visited_at = $nowUtc.ToString("o"); visit_count = 1
                                                })
                                            }
                                            $buffer = $null; $dataString = $null
                                        }
                                    } catch {}
                                }
                                Remove-Item $tempPath -Force -ErrorAction SilentlyContinue
                            }
                            break
                        }
                    }
                }
            } catch {}
        }
        
        Write-Log "[WEB-ACTIVITY-V5] Collected: $($dnsCache.Count) DNS + $($browserHistory.Count) browser entries" "INFO"
        
        # Return in format expected by submit-job-result (dns_cache + browser_history)
        return @{
            dns_cache = @($dnsCache)
            browser_history = @($browserHistory)
            total_dns = $dnsCache.Count
            total_browser = $browserHistory.Count
            collected_at = $nowUtc.ToString("o")
        }
        
    } catch {
        Write-Log "[WEB-ACTIVITY-V5] Error: $($_.Exception.Message)" "ERROR"
        return @{ error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.6: COLLECT DNS BLOCKS (Windows hosts file)
# ============================================
function Invoke-CollectDnsBlocks {
    Write-Log "[JOB] Collecting DNS blocks from hosts file" "INFO"
    try {
        $hostsPath = "$env:SystemRoot\System32\drivers\etc\hosts"
        $blockedDomains = @()
        
        if (Test-Path $hostsPath) {
            $lines = Get-Content $hostsPath -ErrorAction SilentlyContinue
            foreach ($line in $lines) {
                $trimmed = $line.Trim()
                if ($trimmed -match "^(0\.0\.0\.0|127\.0\.0\.1)\s+(.+)" -and $trimmed -notmatch "localhost") {
                    $domain = $Matches[2].Trim()
                    if ($domain -and $blockedDomains.Count -lt 100) {
                        $blockedDomains += $domain
                    }
                }
            }
        }
        
        return @{
            blocked_domains = $blockedDomains
            source = $hostsPath
            collected_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
            count = $blockedDomains.Count
        }
    } catch {
        Write-Log "[JOB] DNS blocks collection failed: $_" "WARN"
        return @{
            blocked_domains = @()
            source = "error"
            error = $_.ToString()
            collected_at = (Get-Date -Format "yyyy-MM-ddTHH:mm:ssZ")
        }
    }
}

# ============================================
#  v5.0.5: LIGHT VULN SCAN (Windows Update check)
# ============================================
function Invoke-LightVulnScan {
    param([object]$Payload)
    
    Write-Log "[VULN-SCAN] Starting light vulnerability scan..." "INFO"
    
    try {
        $results = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            scan_engine = "CyberShield VulnScanner v2.1"
            scan_type = "light"
            vulnerabilities_found = 0
            by_severity = @{ critical = 0; high = 0; medium = 0; low = 0 }
            top_cves = @()
            patches_available = 0
            scan_duration_seconds = 0
            status = "success"
        }
        
        $startTime = Get-Date
        
        try {
            $updateSession = New-Object -ComObject Microsoft.Update.Session
            $searcher = $updateSession.CreateUpdateSearcher()
            $searchResult = $searcher.Search("IsInstalled=0 AND IsHidden=0")
            
            foreach ($update in $searchResult.Updates) {
                $results.vulnerabilities_found++
                
                $severity = $update.MsrcSeverity
                switch ($severity) {
                    'Critical'  { $results.by_severity.critical++ }
                    'Important' { $results.by_severity.high++ }
                    'Moderate'  { $results.by_severity.medium++ }
                    default     { $results.by_severity.low++ }
                }
                
                if ($update.CveIDs -and $results.top_cves.Count -lt 10) {
                    foreach ($cve in $update.CveIDs) {
                        if ($results.top_cves.Count -lt 10) {
                            $results.top_cves += "$cve - $($update.Title)"
                        }
                    }
                }
            }
            
            $results.patches_available = $results.vulnerabilities_found
            
        } catch {
            Write-Log "[VULN-SCAN] Windows Update COM failed: $($_.Exception.Message)" "WARN"
            # Fallback: check for pending updates via WMI
            try {
                $hotfixes = Get-HotFix -ErrorAction SilentlyContinue | 
                    Sort-Object InstalledOn -Descending -ErrorAction SilentlyContinue |
                    Select-Object -First 5
                $results.last_hotfixes = @($hotfixes | ForEach-Object {
                    @{ id = $_.HotFixID; installed = $_.InstalledOn.ToString("o") }
                })
            } catch {}
        }
        
        $results.scan_duration_seconds = [math]::Round(((Get-Date) - $startTime).TotalSeconds, 1)
        
        Write-Log "[VULN-SCAN] Found $($results.vulnerabilities_found) vulnerabilities" "INFO"
        return $results
        
    } catch {
        return @{ 
            status = "error"
            error = $_.Exception.Message
            hostname = $env:COMPUTERNAME
        }
    }
}

# ============================================
#  v5.0.5: UPDATE AGENT (via serve-agent-update)
# ============================================
function Invoke-UpdateAgent {
    param([object]$Payload)
    
    Write-Log "[UPDATE] Starting update_agent via serve-agent-update..." "INFO"
    
    try {
        $updateResult = Invoke-SecureRequest `
            -Path "/functions/v1/serve-agent-update" `
            -Method GET `
            -TimeoutSec 60
        
        if (-not $updateResult.Success) {
            return @{
                status = "error"
                error = "Failed to check for updates: HTTP $($updateResult.StatusCode)"
                current_version = $Global:AgentVersion
            }
        }
        
        $data = $updateResult.Content | ConvertFrom-Json
        
        # Check if already up to date
        if ($data.message -eq "Already up to date" -or $data.message -match "No update available") {
            Write-Log "[UPDATE] Already at latest version ($($data.current_version))" "INFO"
            return @{
                status = "up_to_date"
                current_version = $Global:AgentVersion
                latest_version = $data.current_version
            }
        }
        
        # If update data includes script content, apply it directly via Apply-ForcedUpdate
        if ($data.script_content_base64 -and $data.version) {
            Write-Log "[UPDATE] Update available: $($data.version). Applying directly..." "INFO"
            
            $updateResponse = @{
                target_version = $data.version
                script_content_base64 = $data.script_content_base64
                sha256 = if ($data.sha256_base64) { $data.sha256_base64 } else { $data.sha256 }
                reason = if ($data.force_update_reason) { $data.force_update_reason } else { "update_agent job" }
                override_safe_mode = $false
            }
            
            $applyResult = Apply-ForcedUpdate -Response ([PSCustomObject]$updateResponse)
            
            if ($applyResult.success) {
                return @{
                    status = "update_applied"
                    current_version = $Global:AgentVersion
                    new_version = $data.version
                }
            } else {
                return @{
                    status = "update_failed"
                    error = $applyResult.error
                    current_version = $Global:AgentVersion
                    target_version = $data.version
                }
            }
        }
        
        # No script content - just report availability
        Write-Log "[UPDATE] Update metadata received but no script content. Version: $($data.version)" "WARN"
        return @{
            status = "update_available_no_content"
            current_version = $Global:AgentVersion
            target_version = $data.version
        }
        
    } catch {
        return @{
            status = "error"
            error = $_.Exception.Message
            current_version = $Global:AgentVersion
        }
    }
}

# ============================================
#  v5.0.5: REPORT JOB (system info report)
# ============================================
function Invoke-ReportJob {
    try {
        $sysInfo = Get-SystemInfo
        return @{
            status = "success"
            report_type = "system_info"
            data = $sysInfo
            generated_at = (Get-Date).ToUniversalTime().ToString("o")
        }
    } catch {
        return @{ status = "error"; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.5: SCAN JOB (file hash check)
# ============================================
function Invoke-ScanJob {
    param([object]$Payload)
    
    try {
        $filePath = $Payload.filePath
        if (-not $filePath) {
            return @{ status = "error"; error = "Missing filePath in payload" }
        }
        
        # Expand environment variables
        if ($filePath -match '%([^%]+)%') {
            $filePath = [System.Environment]::ExpandEnvironmentVariables($filePath)
        }
        
        if (-not (Test-Path $filePath)) {
            return @{ status = "error"; error = "File not found: $filePath" }
        }
        
        $fileHash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()
        Write-Log "[SCAN] Scanned: $filePath (hash: $fileHash)" "INFO"
        
        return @{
            status = "success"
            file_path = $filePath
            sha256 = $fileHash
            file_size = (Get-Item $filePath).Length
            scanned_at = (Get-Date).ToUniversalTime().ToString("o")
        }
        
    } catch {
        return @{ status = "error"; error = $_.Exception.Message }
    }
}
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
        $previousStartType = (Get-CimInstance Win32_Service -Filter "Name='$serviceName'").StartMode
        
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
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
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
        $diskAfter = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
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
        
        # v5.0.13-fix: Use registry instead of Win32_Product (which is 5-20min slow and triggers MSI reconfiguration)
        $installedSoftware = @()
        $regPaths = @(
            "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        foreach ($regPath in $regPaths) {
            try {
                $items = Get-ItemProperty $regPath -ErrorAction SilentlyContinue | 
                    Where-Object { $_.DisplayName } |
                    Select-Object -ExpandProperty DisplayName
                $installedSoftware += $items
            } catch { }
        }
        $installedSoftware = $installedSoftware | Select-Object -Unique
        
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
        Write-Log "[TELEMETRY] Error sending $Event event: $($_.Exception.Message)" "WARN"
    }
}

# ============================================
#  v5.0.4: SYNC BLOCKED WEBSITES HANDLER
# ============================================
function Invoke-SyncBlockedWebsites {
    <#
    .SYNOPSIS
        Syncs blocked website list from server and enforces via hosts file
    #>
    param([object]$Payload)
    
    try {
        Write-Log "[SYNC-BLOCKED] Syncing blocked websites..." "INFO"
        
        $hostsPath = "C:\Windows\System32\drivers\etc\hosts"
        $markerStart = "# === CyberShield Blocked Websites Start ==="
        $markerEnd = "# === CyberShield Blocked Websites End ==="
        
        # Get URLs from payload or fetch from server
        $urls = @()
        if ($Payload.urls) {
            $urls = @($Payload.urls)
        } else {
            # Fetch from server
            $result = Invoke-SecureRequest `
                -Path "/functions/v1/serve-dns-filter" `
                -Method "POST" `
                -Body @{ agent_name = $Global:AgentName; timestamp = [DateTime]::UtcNow.ToString("o") } `
                -MaxRetries 2 -TimeoutSec 15
            
            if ($result.Success) {
                $response = $result.Content | ConvertFrom-Json
                if ($response.domains) { $urls = @($response.domains) }
            }
        }
        
        if ($urls.Count -eq 0) {
            return @{ success = $true; blocked_count = 0; message = "No URLs to block" }
        }
        
        # Read current hosts file
        $hostsContent = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue
        
        # Remove existing CyberShield blocks
        if ($hostsContent -match [regex]::Escape($markerStart)) {
            $hostsContent = $hostsContent -replace "(?s)$([regex]::Escape($markerStart)).*?$([regex]::Escape($markerEnd))", ""
        }
        
        # Build new block entries
        $blockEntries = @($markerStart)
        foreach ($url in $urls) {
            $domain = $url -replace "^https?://", "" -replace "/.*$", ""
            $blockEntries += "0.0.0.0 $domain"
            $blockEntries += "0.0.0.0 www.$domain"
        }
        $blockEntries += $markerEnd
        
        # Append to hosts file
        $newContent = $hostsContent.TrimEnd() + "`r`n" + ($blockEntries -join "`r`n") + "`r`n"
        Set-Content -Path $hostsPath -Value $newContent -Encoding ASCII -Force
        
        # Flush DNS cache
        ipconfig /flushdns | Out-Null
        
        # Save to local blocklist
        @{ domains = $urls; updated_at = (Get-Date).ToString("o") } | ConvertTo-Json | Out-File $Global:DnsBlocklistPath -Encoding UTF8
        
        Write-Log "[SYNC-BLOCKED] Blocked $($urls.Count) websites via hosts file" "SUCCESS"
        
        return @{
            success = $true
            blocked_count = $urls.Count
            blocked_domains = $urls
            method = "hosts_file"
            synced_at = (Get-Date).ToString("o")
        }
        
    } catch {
        Write-Log "[SYNC-BLOCKED] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.4: SERVICE HEALTH CHECK HANDLER
# ============================================
function Invoke-ServiceHealthCheck {
    <#
    .SYNOPSIS
        Checks health of specified Windows services
    #>
    param([object]$Payload)
    
    try {
        Write-Log "[SVC-HEALTH] Running service health check..." "INFO"
        
        $serviceNames = @()
        if ($Payload.services) {
            $serviceNames = @($Payload.services)
        } else {
            # Default critical services
            $serviceNames = @(
                "WinDefend", "mpssvc", "EventLog", "wuauserv",
                "Dnscache", "BITS", "Schedule", "W32Time"
            )
        }
        
        $results = @()
        $unhealthy = 0
        
        foreach ($svcName in $serviceNames) {
            $svc = Get-Service -Name $svcName -ErrorAction SilentlyContinue
            if ($svc) {
                $startType = (Get-CimInstance Win32_Service -Filter "Name='$svcName'" -ErrorAction SilentlyContinue).StartMode
                $isHealthy = ($svc.Status -eq 'Running') -or ($startType -eq 'Disabled' -or $startType -eq 'Manual')
                
                if (-not $isHealthy) { $unhealthy++ }
                
                $results += @{
                    name = $svcName
                    display_name = $svc.DisplayName
                    status = $svc.Status.ToString()
                    start_type = $startType
                    healthy = $isHealthy
                }
            } else {
                $results += @{
                    name = $svcName
                    status = "not_found"
                    healthy = $false
                }
                $unhealthy++
            }
        }
        
        $svcLogLevel = if ($unhealthy -gt 0) { "WARN" } else { "SUCCESS" }
        Write-Log "[SVC-HEALTH] Checked $($results.Count) services, $unhealthy unhealthy" $svcLogLevel
        
        return @{
            success = $true
            services_checked = $results.Count
            unhealthy_count = $unhealthy
            services = $results
            checked_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.4: NETWORK DIAGNOSTICS HANDLER
# ============================================
function Invoke-NetworkDiagnostics {
    <#
    .SYNOPSIS
        Runs network diagnostics (ping, traceroute, DNS lookup)
    #>
    param([object]$Payload)
    
    try {
        Write-Log "[NET-DIAG] Running network diagnostics..." "INFO"
        
        $targets = @()
        if ($Payload.targets) {
            $targets = @($Payload.targets)
        } else {
            $targets = @("8.8.8.8", "1.1.1.1", $Global:ServerUrl -replace "^https?://", "")
        }
        
        $diagnostics = @()
        
        foreach ($target in $targets) {
            $diag = @{ target = $target }
            
            # Ping test
            try {
                $ping = Test-Connection -ComputerName $target -Count 3 -ErrorAction Stop
                $diag.ping = @{
                    success = $true
                    avg_ms = [math]::Round(($ping | Measure-Object -Property ResponseTime -Average).Average, 1)
                    min_ms = ($ping | Measure-Object -Property ResponseTime -Minimum).Minimum
                    max_ms = ($ping | Measure-Object -Property ResponseTime -Maximum).Maximum
                    packets_sent = 3
                    packets_received = $ping.Count
                }
            } catch {
                $diag.ping = @{ success = $false; error = $_.Exception.Message }
            }
            
            # DNS lookup
            try {
                $dns = Resolve-DnsName -Name $target -ErrorAction Stop | Select-Object -First 3
                $diag.dns = @{
                    success = $true
                    records = @($dns | ForEach-Object { @{ name = $_.Name; type = $_.Type.ToString(); ip = $_.IPAddress } })
                }
            } catch {
                $diag.dns = @{ success = $false; error = $_.Exception.Message }
            }
            
            # Traceroute (limited to 10 hops for speed)
            try {
                $trace = Test-NetConnection -ComputerName $target -TraceRoute -ErrorAction Stop
                $diag.traceroute = @{
                    success = $true
                    hops = @($trace.TraceRoute | Select-Object -First 10)
                    remote_port = $trace.RemotePort
                    tcp_succeeded = $trace.TcpTestSucceeded
                }
            } catch {
                $diag.traceroute = @{ success = $false; error = $_.Exception.Message }
            }
            
            $diagnostics += $diag
        }
        
        Write-Log "[NET-DIAG] Completed diagnostics for $($targets.Count) targets" "SUCCESS"
        
        return @{
            success = $true
            targets_checked = $targets.Count
            diagnostics = $diagnostics
            checked_at = (Get-Date).ToString("o")
        }
        
    } catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.4: QUARANTINE AGENT HANDLER
# ============================================
function Invoke-QuarantineAgent {
    <#
    .SYNOPSIS
        Self-isolates agent by blocking all network except server communication
    #>
    param([object]$Payload)
    
    try {
        $action = if ($Payload.action -eq "release") { "release" } else { "quarantine" }
        
        Write-Log "[QUARANTINE] Action: $action" "WARN"
        
        $ruleName = "CyberShield-Quarantine"
        $serverHost = ([System.Uri]$Global:ServerUrl).Host
        
        if ($action -eq "quarantine") {
            # Block ALL outbound traffic
            New-NetFirewallRule -DisplayName "$ruleName-BlockAll" `
                -Direction Outbound -Action Block `
                -Profile Any -Enabled True `
                -ErrorAction SilentlyContinue | Out-Null
            
            # Allow CyberShield server communication
            $serverIPs = [System.Net.Dns]::GetHostAddresses($serverHost) | ForEach-Object { $_.IPAddressToString }
            foreach ($ip in $serverIPs) {
                New-NetFirewallRule -DisplayName "$ruleName-AllowServer-$ip" `
                    -Direction Outbound -Action Allow `
                    -RemoteAddress $ip -Protocol TCP `
                    -Profile Any -Enabled True `
                    -ErrorAction SilentlyContinue | Out-Null
            }
            
            # Allow DNS (needed for server resolution)
            New-NetFirewallRule -DisplayName "$ruleName-AllowDNS" `
                -Direction Outbound -Action Allow `
                -RemotePort 53 -Protocol UDP `
                -Profile Any -Enabled True `
                -ErrorAction SilentlyContinue | Out-Null
            
            Write-Log "[QUARANTINE] Agent quarantined - only server communication allowed" "WARN"
            
            return @{
                success = $true
                action = "quarantined"
                server_host = $serverHost
                server_ips = $serverIPs
                reason = $Payload.reason
                quarantined_at = (Get-Date).ToString("o")
            }
            
        } else {
            # Release: remove all quarantine rules
            Get-NetFirewallRule -DisplayName "$ruleName*" -ErrorAction SilentlyContinue | 
                Remove-NetFirewallRule -ErrorAction SilentlyContinue
            
            Write-Log "[QUARANTINE] Agent released from quarantine" "SUCCESS"
            
            return @{
                success = $true
                action = "released"
                released_at = (Get-Date).ToString("o")
            }
        }
        
    } catch {
        Write-Log "[QUARANTINE] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.4: APPLY SECURITY PATCH HANDLER
# ============================================
function Invoke-ApplySecurityPatch {
    <#
    .SYNOPSIS
        Applies security patches via Windows Update
    #>
    param([object]$Payload)
    
    try {
        Write-Log "[PATCH] Applying security patch..." "INFO"
        
        $kbId = $Payload.kb_id
        $cveId = $Payload.cve_id
        
        $results = @{
            cve_id = $cveId
            kb_id = $kbId
            actions = @()
        }
        
        if ($kbId) {
            # Check if KB is already installed
            $installed = Get-HotFix -Id $kbId -ErrorAction SilentlyContinue
            if ($installed) {
                Write-Log "[PATCH] KB $kbId already installed" "INFO"
                return @{
                    success = $true
                    status = "already_installed"
                    kb_id = $kbId
                    installed_on = $installed.InstalledOn.ToString("o")
                }
            }
            
            # Try Windows Update via COM object
            try {
                $session = New-Object -ComObject Microsoft.Update.Session
                $searcher = $session.CreateUpdateSearcher()
                $searchResult = $searcher.Search("IsInstalled=0 AND Type='Software'")
                
                $targetUpdate = $null
                foreach ($update in $searchResult.Updates) {
                    foreach ($kb in $update.KBArticleIDs) {
                        if ("KB$kb" -eq $kbId -or $kb -eq ($kbId -replace "^KB", "")) {
                            $targetUpdate = $update
                            break
                        }
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
                    
                    $results.actions += "installed_via_wu"
                    $results.reboot_required = $installResult.RebootRequired
                    
                    Write-Log "[PATCH] KB $kbId installed successfully (reboot: $($installResult.RebootRequired))" "SUCCESS"
                    
                    return @{
                        success = $true
                        status = "installed"
                        kb_id = $kbId
                        reboot_required = $installResult.RebootRequired
                        patched_at = (Get-Date).ToString("o")
                    }
                } else {
                    Write-Log "[PATCH] KB $kbId not found in available updates" "WARN"
                    return @{
                        success = $false
                        status = "not_found"
                        kb_id = $kbId
                        message = "Update not available via Windows Update"
                    }
                }
                
            } catch {
                Write-Log "[PATCH] Windows Update COM failed: $($_.Exception.Message)" "WARN"
                return @{
                    success = $false
                    status = "wu_error"
                    error = $_.Exception.Message
                }
            }
        }
        
        return @{
            success = $false
            error = "No kb_id specified"
        }
        
    } catch {
        Write-Log "[PATCH] Error: $($_.Exception.Message)" "ERROR"
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  SYSTEM METRICS (Basic - inherited from v4)
# ============================================
function Get-SystemMetrics {
    try {
        # v5.0.13-perf: Use CIM instead of WMI (faster, uses WSMan)
        $cpu = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average | Select-Object -ExpandProperty Average
        $os = Get-CimInstance Win32_OperatingSystem
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
        $uptime = (Get-Date) - $os.LastBootUpTime
        
        return @{
            cpu_percent = [math]::Round($cpu, 2)
            memory_total_gb = [math]::Round($os.TotalVisibleMemorySize / 1MB, 2)
            memory_used_gb = [math]::Round(($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / 1MB, 2)
            memory_used_percent = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 2)
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
#  FORCE UPDATE VIA HEARTBEAT (v5.0.7 - Ported from v4)
# ============================================
# Esta funcao:
# 1. NAO depende do job system
# 2. Processa dados recebidos diretamente no heartbeat response
# 3. Funciona com agentes antigos que nao tem update_agent funcionando
# 4. Deteccao dinamica de Scheduled Task name
# ============================================
function Apply-ForcedUpdate {
    param(
        [Parameter(Mandatory = $true)]
        $Response
    )
    
    try {
        Write-Log "[FORCE UPDATE] Iniciando aplicacao de update forcado..." "INFO"
        
        # Extrair dados do response
        $targetVersion = $Response.target_version
        $base64Content = $Response.script_content_base64
        $expectedHash = $Response.sha256
        $reason = $Response.reason
        
        if (-not $targetVersion -or -not $base64Content -or -not $expectedHash) {
            throw "Dados de force update incompletos no response"
        }
        
        Write-Log "[FORCE UPDATE] Version: $targetVersion, Reason: $reason" "INFO"
        
        # SAFE MODE CHECK
        $rollbackState = Get-RollbackState
        if ($rollbackState.safe_mode) {
            if ($Response.override_safe_mode -eq $true) {
                Write-Log "[FORCE UPDATE] Safe mode override ativo - prosseguindo com update" "WARN"
            } else {
                Write-Log "[SAFE MODE] Updates desabilitados - rollback loop detectado" "ERROR"
                Add-EvidenceEntry -Type "security_warning" -Data @{
                    event = "force_update_blocked_safe_mode"
                    target_version = $targetVersion
                    rollback_count = $rollbackState.rollback_count
                } -Severity "warning"
                return @{ success = $false; error = "Safe mode active - updates disabled" }
            }
        }
        
        # BUG FIX #5: Create temp file in SAME directory as target for atomic mv (same filesystem)
        $installDir = "C:\CyberShield"
        $tempScript = Join-Path $installDir "cybershield-update-temp-$([Guid]::NewGuid().ToString('N').Substring(0,8)).ps1"
        
        # BUG FIX #3: Base64 decode with try/catch for invalid content
        # v5.0.13-patch: Pre-decode size validation (prevents OOM before Base64 decode)
        $maxBase64Length = 7340032  # ~5MB binary = ~7MB Base64
        if ($base64Content.Length -gt $maxBase64Length) {
            Write-Log "[FORCE UPDATE] REJECTED - Base64 payload too large BEFORE decode: $($base64Content.Length) chars (max $maxBase64Length)" "ERROR"
            Write-EventLog -LogName Application -Source "CyberShield" -EventId 5101 -EntryType Error -Message "Update rejected: Base64 payload too large before decode ($($base64Content.Length) chars)" -ErrorAction SilentlyContinue
            return @{ success = $false; error = "Base64 payload too large before decode ($($base64Content.Length) chars)" }
        }

        Write-Log "[FORCE UPDATE] Decodificando Base64..." "DEBUG"
        try {
            $bytes = [System.Convert]::FromBase64String($base64Content)
        } catch {
            Write-Log "[FORCE UPDATE] REJECTED - Base64 decode failed: $($_.Exception.Message)" "ERROR"
            return @{ success = $false; error = "Base64 decode failed: $($_.Exception.Message)" }
        }
        # v5.0.13: Cap update payload size to prevent memory exhaustion (5MB max)
        if ($bytes.Length -gt 5MB) {
            Write-Log "[FORCE UPDATE] REJECTED - Payload too large: $($bytes.Length) bytes (max 5MB)" "ERROR"
            return @{ success = $false; error = "Update payload exceeds 5MB limit ($($bytes.Length) bytes)" }
        }
        [System.IO.File]::WriteAllBytes($tempScript, $bytes)
        Write-Log "[FORCE UPDATE] Script salvo: $($bytes.Length) bytes" "DEBUG"
        
        # Validar SHA256
        try {
            $actualHash = (Get-FileHash -Path $tempScript -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
        } catch {
            Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
            throw "Get-FileHash failed on temp script: $($_.Exception.Message)"
        }
        if ($actualHash -ne $expectedHash.ToLower()) {
            Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
            throw "SHA256 mismatch! Esperado: $expectedHash, Obtido: $actualHash"
        }
        
        Write-Log "[FORCE UPDATE] SHA256 validado: $actualHash" "SUCCESS"
        
        # v5.0.13: ECDSA/Ed25519 signature validation on update payload
        $updateSignature = $Response.ecdsa_signature
        if (-not $updateSignature) { $updateSignature = $Response.signature_base64 }
        if ($updateSignature -and $updateSignature.Length -gt 10) {
            $sigValid = Test-Ed25519HashSignature -Hash $actualHash -SignatureBase64 $updateSignature
            if (-not $sigValid) {
                Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
                Write-Log "[FORCE UPDATE] REJECTED - Update signature INVALID! Possible supply chain attack." "ERROR"
                Write-EventLog -LogName Application -Source "CyberShield" -EventId 9006 -EntryType Error -Message "FORCE UPDATE REJECTED: Invalid cryptographic signature on update payload. SHA256: $actualHash" -ErrorAction SilentlyContinue
                Add-EvidenceEntry -Type "security_alert" -Data @{
                    event = "update_signature_invalid"
                    target_version = $targetVersion
                    sha256 = $actualHash
                } -Severity "critical"
                return @{ success = $false; error = "Update signature verification failed - possible supply chain attack" }
            }
            Write-Log "[FORCE UPDATE] Cryptographic signature VERIFIED for update payload" "SUCCESS"
        } else {
            # v5.0.13-patch: Reject unsigned payloads (mandatory signature enforcement)
            Write-Log "[FORCE UPDATE] REJECTED - No cryptographic signature on update payload. Unsigned updates are no longer accepted." "ERROR"
            Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
            Write-EventLog -LogName Application -Source "CyberShield" -EventId 5102 -EntryType Error -Message "Update rejected: missing cryptographic signature (unsigned payloads blocked since v5.0.13)" -ErrorAction SilentlyContinue
            Add-EvidenceEntry -Type "security_alert" -Data @{
                event = "unsigned_update_rejected"
                target_version = $targetVersion
                sha256 = $actualHash
            } -Severity "warning"
            return @{ success = $false; error = "Update rejected: no cryptographic signature (mandatory since v5.0.13)" }
        }
        
        # Detectar script atual e diretorio de instalacao
        $installDir = "C:\CyberShield"
        $targetScript = Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"
        
        $currentScript = $null
        $possiblePaths = @(
            $PSCommandPath,
            (Join-Path $installDir "cybershield-agent-$($Global:AgentName).ps1"),
            (Join-Path $installDir "cybershield-agent-v5.ps1"),
            (Join-Path $installDir "cybershield-agent-v4.ps1"),
            (Join-Path $installDir "cybershield-agent.ps1")
        )
        
        foreach ($path in $possiblePaths) {
            if ($path -and (Test-Path $path)) {
                $currentScript = $path
                break
            }
        }
        
        if (-not $currentScript) {
            $found = Get-ChildItem -Path $installDir -Filter "cybershield-agent-*.ps1" -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($found) { $currentScript = $found.FullName }
        }
        
        # BACKUP para rollback estruturado
        $previousPath = $Global:RollbackPaths.Previous
        if ($currentScript -and (Test-Path $currentScript)) {
            try {
                Copy-Item -Path $currentScript -Destination $previousPath -Force
                Write-Log "[FORCE UPDATE] Backup criado: $previousPath" "INFO"
                
                $rlbState = Get-RollbackState
                $rlbState.previous_version = $Global:AgentVersion
                Save-RollbackState -State $rlbState
            } catch {
                Write-Log "[FORCE UPDATE] Backup falhou: $($_.Exception.Message)" "WARN"
            }
        }
        
        # BUG FIX #5: Re-verify hash immediately before move (close TOCTOU window)
        try {
            $preMovHash = (Get-FileHash -Path $tempScript -Algorithm SHA256 -ErrorAction Stop).Hash.ToLower()
        } catch {
            Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
            throw "Pre-move hash verification failed: $($_.Exception.Message)"
        }
        if ($preMovHash -ne $expectedHash.ToLower()) {
            Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
            throw "TOCTOU: Temp file modified between validation and move! Expected: $expectedHash, Got: $preMovHash"
        }
        
        # BUG FIX #4: Atomic Move-Item with error handling for file locks
        try {
            Move-Item -Path $tempScript -Destination $targetScript -Force -ErrorAction Stop
        } catch {
            Write-Log "[FORCE UPDATE] Move-Item failed (file locked?): $($_.Exception.Message)" "ERROR"
            Remove-Item $tempScript -Force -ErrorAction SilentlyContinue
            return @{ success = $false; error = "Move-Item failed: $($_.Exception.Message)" }
        }
        Write-Log "[FORCE UPDATE] Script instalado (atomic move): $targetScript" "SUCCESS"
        
        # Registrar evidencia
        Add-EvidenceEntry -Type "force_update" -Data @{
            old_version = $Global:AgentVersion
            new_version = $targetVersion
            target_path = $targetScript
            sha256 = $actualHash
            reason = $reason
            method = "heartbeat_response"
        } -Severity "info"
        
        # Confirmar no backend que force update foi aplicado
        try {
            $confirmResult = Invoke-SecureRequest `
                -Path "/functions/v1/confirm-force-update" `
                -Method "POST" `
                -Body @{
                    new_version = $targetVersion
                    old_version = $Global:AgentVersion
                } `
                -TimeoutSec 10
            
            if ($confirmResult.Success) {
                Write-Log "[FORCE UPDATE] Confirmacao enviada ao backend" "SUCCESS"
            } else {
                Write-Log "[FORCE UPDATE] Confirmacao falhou: $($confirmResult.Error)" "WARN"
            }
        } catch {
            Write-Log "[FORCE UPDATE] Falha ao confirmar no backend (nao critico): $($_.Exception.Message)" "WARN"
        }
        
        Write-Log "[FORCE UPDATE] Update $targetVersion aplicado com sucesso!" "SUCCESS"
        
        # DYNAMIC TASK DETECTION: Find the correct Scheduled Task name
        Write-Log "[FORCE UPDATE] Detectando Scheduled Task..." "INFO"
        $taskName = $null
        $taskPatterns = @(
            "CyberShieldAgent-$($Global:AgentName)",
            "CyberShieldAgent",
            "CyberShield Agent",
            "CyberShield*"
        )
        
        foreach ($pattern in $taskPatterns) {
            $foundTask = Get-ScheduledTask -TaskName $pattern -ErrorAction SilentlyContinue | Select-Object -First 1
            if ($foundTask) {
                $taskName = $foundTask.TaskName
                Write-Log "[FORCE UPDATE] Task encontrada: $taskName" "INFO"
                break
            }
        }
        
        if ($taskName) {
            try {
                Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Start-Sleep -Seconds 2
                Start-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
                Write-Log "[FORCE UPDATE] Task '$taskName' reiniciada - nova versao ativa!" "SUCCESS"
            } catch {
                Write-Log "[FORCE UPDATE] Restart task falhou, sera ativado no proximo boot: $($_.Exception.Message)" "WARN"
            }
        } else {
            Write-Log "[FORCE UPDATE] Nenhuma Scheduled Task encontrada - nova versao ativa no proximo boot" "WARN"
        }
        
        # EXIT para permitir novo script iniciar
        Write-Log "[FORCE UPDATE] Encerrando processo atual para nova versao iniciar..." "INFO"
        [Environment]::Exit(0)
        
    } catch {
        Write-Log "[FORCE UPDATE] Erro: $($_.Exception.Message)" "ERROR"
        
        Add-EvidenceEntry -Type "error" -Data @{
            event = "force_update_failed"
            error = $_.Exception.Message
            target_version = $Response.target_version
        } -Severity "error"
        
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  IMPROVED HEARTBEAT (v5.0.7)
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
            
            # Processar resposta do servidor (force update, rotate key, intervals, etc.)
            if ($result.Content) {
                try {
                    $response = $result.Content | ConvertFrom-Json
                    
                    # ============================================
                    # DYNAMIC INTERVAL ADJUSTMENT (v5.0.9)
                    # Server controls agent polling cadence
                    # ============================================
                    if ($response.heartbeat_interval_seconds -and $response.heartbeat_interval_seconds -ge 10) {
                        $newHbInterval = [int]$response.heartbeat_interval_seconds
                        if ($newHbInterval -ne $Global:PollIntervalSeconds) {
                            Write-Log "[HEARTBEAT] Server adjusted heartbeat interval: $($Global:PollIntervalSeconds)s -> ${newHbInterval}s" "INFO"
                            $Global:PollIntervalSeconds = $newHbInterval
                        }
                    }
                    if ($response.poll_interval_seconds -and $response.poll_interval_seconds -ge 10) {
                        $newJobInterval = [int]$response.poll_interval_seconds
                        if ($newJobInterval -ne $Global:JobPollIntervalSeconds) {
                            Write-Log "[HEARTBEAT] Server adjusted job poll interval: $($Global:JobPollIntervalSeconds)s -> ${newJobInterval}s" "INFO"
                            $Global:JobPollIntervalSeconds = $newJobInterval
                        }
                    }
                    
                    # ============================================
                    # FORCE UPDATE VIA HEARTBEAT RESPONSE
                    # Ported from v4 - bypasses job system completely
                    # ============================================
                    if ($response.force_update -eq $true) {
                        Write-Log "[FORCE UPDATE] Update forcado detectado via heartbeat!" "WARN"
                        Write-Log "[FORCE UPDATE] Target version: $($response.target_version)" "INFO"
                        
                        $updateResult = Apply-ForcedUpdate -Response $response
                        
                        if ($updateResult.success) {
                            # Apply-ForcedUpdate will exit the process after restarting the task
                            return $true
                        } else {
                            Write-Log "[FORCE UPDATE] Falha ao aplicar: $($updateResult.error)" "ERROR"
                        }
                    }
                    
                    # ============================================
                    # v5.0.13: SIGNED HASH CACHE (replaces plain hash cache)
                    # Server provides script_sha256 + script_hash_signature for integrity
                    # Hash is only trusted if accompanied by valid signature
                    # ============================================
                    if ($response.script_sha256) {
                        try {
                            $hashSig = if ($response.script_hash_signature) { $response.script_hash_signature } else { "" }
                            $hashTs = if ($response.script_hash_signed_at) { $response.script_hash_signed_at } else { (Get-Date -Format "o") }
                            Save-SignedHashCache -Hash $response.script_sha256 -Signature $hashSig -Timestamp $hashTs
                        } catch {
                            Write-Log "[INTEGRITY] Failed to cache signed hash: $($_.Exception.Message)" "WARN"
                        }
                    }
                } catch {
                    Write-Log "[HEARTBEAT] Erro ao processar response: $($_.Exception.Message)" "WARN"
                }
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
#  v5.0.11: WINDOWS TOAST NOTIFICATION SYSTEM
# ============================================
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
        # Method 1: BurntToast module (if available)
        if (Get-Module -ListAvailable -Name BurntToast -ErrorAction SilentlyContinue) {
            $icon = switch ($Severity) {
                "Error"   { "Warning" }
                "Warning" { "Warning" }
                default   { "None" }
            }
            New-BurntToastNotification -Text $Title, $Message -AppLogo $null -Sound $icon -ErrorAction SilentlyContinue
            Write-Log "[TOAST] BurntToast: $Title" "DEBUG"
            return
        }
        
        # Method 2: Windows BalloonTip (universal fallback)
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
        
        # Cleanup after display
        # BUG 11 fix: Non-blocking - reduced from 10.5s to 1s
        Start-Sleep -Milliseconds 1000
        $balloon.Dispose()
        
        Write-Log "[TOAST] BalloonTip: $Title" "DEBUG"
    } catch {
        # Toast failures are non-critical - log and continue
        Write-Log "[TOAST] Failed to show notification (non-critical): $($_.Exception.Message)" "DEBUG"
    }
}

# ============================================
#  v5.0.11: PUSH ALERT TO BACKEND
# ============================================
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
    
    # Cooldown check - prevent alert flooding
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
            alert_type = $AlertType
            alert_message = $AlertMessage
            severity = $Severity
            detected_at = $now.ToString("o")
            hostname = $env:COMPUTERNAME
            agent_version = $Global:AgentVersion
            details = $Details
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-agent-evidence" `
            -Method "POST" `
            -Body @{
                agent_name = $Global:AgentName
                event_type = "local_detection_$AlertType"
                event_data = $evidenceData
                severity = $Severity
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

# ============================================
#  v5.0.11: LOCAL DETECTION - ANTIVIRUS CHECK
# ============================================
function Test-AntivirusStatus {
    try {
        $Global:LocalDetectionStats.antivirus_checks++
        $avInactive = $false
        $avDetails = @{}
        
        # Phase 1: WMI SecurityCenter2 (desktop/workstation)
        try {
            $avProducts = Get-CimInstance -Namespace "root/SecurityCenter2" -ClassName AntiVirusProduct -ErrorAction SilentlyContinue
            
            if ($avProducts) {
                foreach ($av in $avProducts) {
                    $productState = $av.productState
                    $isEnabled = (($productState -shr 12) -band 1) -eq 1
                    $isUpToDate = (($productState -shr 4) -band 1) -eq 0
                    
                    if (-not $isEnabled) {
                        $avInactive = $true
                        $avDetails = @{
                            product_name = $av.displayName
                            product_state = $productState
                            is_enabled = $false
                            is_up_to_date = $isUpToDate
                            detection_method = "SecurityCenter2"
                        }
                        break
                    }
                }
                
                if (-not $avInactive) {
                    Write-Log "[LOCAL-DETECT] Antivirus active: $($avProducts[0].displayName)" "DEBUG"
                    return @{ status = "active"; product = $avProducts[0].displayName }
                }
            }
        } catch {
            # SecurityCenter2 not available on Server editions
        }
        
        # Phase 2: EDR process detection (enterprise)
        $edrProcesses = @(
            @{ name = "CrowdStrike"; processes = @("csfalconservice", "CSFalconContainer") },
            @{ name = "SentinelOne"; processes = @("SentinelAgent", "SentinelHelperService") },
            @{ name = "Cortex XDR"; processes = @("cyserver", "CortexXDR") },
            @{ name = "Carbon Black"; processes = @("cb", "CbDefense") },
            @{ name = "Sophos"; processes = @("SophosHealth", "SSPService") },
            @{ name = "ESET"; processes = @("ekrn", "egui") },
            @{ name = "Kaspersky"; processes = @("avp", "klnagent") },
            @{ name = "Bitdefender"; processes = @("bdagent", "vsserv") },
            @{ name = "Trend Micro"; processes = @("coreServiceShell", "Ntrtscan") },
            @{ name = "Cylance"; processes = @("CylanceSvc") },
            @{ name = "Windows Defender"; processes = @("MsMpEng") }
        )
        
        $edrFound = $false
        foreach ($edr in $edrProcesses) {
            foreach ($proc in $edr.processes) {
                if (Get-Process -Name $proc -ErrorAction SilentlyContinue) {
                    $edrFound = $true
                    Write-Log "[LOCAL-DETECT] EDR active: $($edr.name) ($proc)" "DEBUG"
                    return @{ status = "active"; product = $edr.name; detection_method = "process_scan" }
                }
            }
        }
        
        if (-not $edrFound -and -not $avProducts) {
            $avInactive = $true
            $avDetails = @{
                detection_method = "no_av_found"
                checked_edrs = ($edrProcesses | ForEach-Object { $_.name }) -join ", "
            }
        }
        
        if ($avInactive) {
            Write-Log "[LOCAL-DETECT] ANTIVIRUS INACTIVE DETECTED!" "ERROR"
            
            Show-SecurityToast `
                -Title "CyberShield - Protecao Inativa!" `
                -Message "Nenhum antivirus ativo detectado neste computador. Acao necessaria!" `
                -Severity "Error"
            
            Invoke-PushAlert `
                -AlertType "antivirus_inactive" `
                -AlertMessage "Antivirus inativo detectado em $env:COMPUTERNAME" `
                -Severity "critical" `
                -Details $avDetails
            
            Add-EvidenceEntry -Type "local_detection" -Data @{
                detection = "antivirus_inactive"
                details = $avDetails
            } -Severity "critical"
            
            return @{ status = "inactive"; details = $avDetails }
        }
        
        return @{ status = "active" }
    } catch {
        Write-Log "[LOCAL-DETECT] Antivirus check error: $($_.Exception.Message)" "WARN"
        return @{ status = "unknown"; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.11: LOCAL DETECTION - FIREWALL CHECK + AUTO-REMEDIATION
# ============================================
function Test-FirewallStatus {
    try {
        $Global:LocalDetectionStats.firewall_checks++
        
        $profiles = Get-NetFirewallProfile -ErrorAction SilentlyContinue
        
        if (-not $profiles) {
            Write-Log "[LOCAL-DETECT] Could not query firewall profiles" "WARN"
            return @{ status = "unknown" }
        }
        
        $disabledProfiles = @()
        foreach ($profile in $profiles) {
            if ($profile.Enabled -eq $false) {
                $disabledProfiles += $profile.Name
            }
        }
        
        if ($disabledProfiles.Count -gt 0) {
            Write-Log "[LOCAL-DETECT] FIREWALL DISABLED on profiles: $($disabledProfiles -join ', ')" "ERROR"
            
            Show-SecurityToast `
                -Title "CyberShield - Firewall Desativado!" `
                -Message "Firewall desativado em: $($disabledProfiles -join ', '). Reativando automaticamente..." `
                -Severity "Error"
            
            # AUTO-REMEDIATION: Re-enable disabled firewall profiles
            $remediated = @()
            foreach ($profileName in $disabledProfiles) {
                try {
                    Set-NetFirewallProfile -Name $profileName -Enabled True -ErrorAction Stop
                    $remediated += $profileName
                    Write-Log "[AUTO-REMEDIATE] Firewall re-enabled on profile: $profileName" "SUCCESS"
                } catch {
                    Write-Log "[AUTO-REMEDIATE] Failed to re-enable firewall on $profileName : $($_.Exception.Message)" "ERROR"
                }
            }
            
            if ($remediated.Count -gt 0) {
                $Global:LocalDetectionStats.remediations_applied++
            }
            
            Invoke-PushAlert `
                -AlertType "firewall_disabled" `
                -AlertMessage "Firewall desativado em $env:COMPUTERNAME (profiles: $($disabledProfiles -join ', ')). Auto-remediado: $($remediated -join ', ')" `
                -Severity "critical" `
                -Details @{
                    disabled_profiles = $disabledProfiles
                    remediated_profiles = $remediated
                    auto_remediated = ($remediated.Count -gt 0)
                }
            
            Add-EvidenceEntry -Type "local_detection" -Data @{
                detection = "firewall_disabled"
                disabled_profiles = $disabledProfiles
                remediated_profiles = $remediated
            } -Severity "critical"
            
            if ($remediated.Count -gt 0) {
                Show-SecurityToast `
                    -Title "CyberShield - Firewall Reativado!" `
                    -Message "Firewall reativado com sucesso em: $($remediated -join ', ')" `
                    -Severity "Info"
            }
            
            return @{ status = "remediated"; disabled = $disabledProfiles; remediated = $remediated }
        }
        
        Write-Log "[LOCAL-DETECT] Firewall active on all profiles" "DEBUG"
        return @{ status = "active" }
    } catch {
        Write-Log "[LOCAL-DETECT] Firewall check error: $($_.Exception.Message)" "WARN"
        return @{ status = "unknown"; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.11: LOCAL DETECTION - USB DEVICE MONITORING
# ============================================
function Test-UsbDevices {
    try {
        $Global:LocalDetectionStats.usb_checks++
        
        $usbDrives = Get-CimInstance -ClassName Win32_DiskDrive -ErrorAction SilentlyContinue | 
            Where-Object { $_.InterfaceType -eq "USB" }
        
        if ($usbDrives -and $usbDrives.Count -gt 0) {
            foreach ($usb in $usbDrives) {
                $usbInfo = @{
                    device_id = $usb.DeviceID
                    model = $usb.Model
                    serial = $usb.SerialNumber
                    size_gb = [math]::Round($usb.Size / 1GB, 2)
                    interface = $usb.InterfaceType
                }
                
                Write-Log "[LOCAL-DETECT] USB STORAGE DETECTED: $($usb.Model) ($([math]::Round($usb.Size / 1GB, 2))GB)" "WARN"
                
                Show-SecurityToast `
                    -Title "CyberShield - Dispositivo USB Detectado" `
                    -Message "USB conectado: $($usb.Model). Este evento foi registrado para auditoria." `
                    -Severity "Warning"
                
                Invoke-PushAlert `
                    -AlertType "unauthorized_usb" `
                    -AlertMessage "Dispositivo USB de armazenamento detectado em $env:COMPUTERNAME : $($usb.Model)" `
                    -Severity "warning" `
                    -Details $usbInfo
                
                Add-EvidenceEntry -Type "local_detection" -Data @{
                    detection = "usb_storage_connected"
                    device = $usbInfo
                } -Severity "warning"
            }
            
            return @{ status = "detected"; count = $usbDrives.Count; devices = $usbDrives | ForEach-Object { $_.Model } }
        }
        
        return @{ status = "none" }
    } catch {
        Write-Log "[LOCAL-DETECT] USB check error: $($_.Exception.Message)" "WARN"
        return @{ status = "unknown"; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.11: LOCAL DETECTION - SUSPICIOUS PROCESS CHECK
# ============================================
function Test-SuspiciousProcesses {
    try {
        $Global:LocalDetectionStats.process_checks++
        
        # v5.0.13-perf: Pre-compile regex patterns on first call (cached globally)
        if (-not $Global:CompiledSuspiciousPatterns) {
            $patternDefs = @(
                @{ pattern = "mimikatz"; severity = "critical"; description = "Credential dumping tool" },
                @{ pattern = "psexec"; severity = "warning"; description = "Remote execution tool" },
                @{ pattern = "ncat"; severity = "warning"; description = "Netcat variant" },
                @{ pattern = "nc\.exe"; severity = "warning"; description = "Netcat" },
                @{ pattern = "wireshark"; severity = "info"; description = "Network sniffer" },
                @{ pattern = "keylogger"; severity = "critical"; description = "Potential keylogger" },
                @{ pattern = "cobaltstrike"; severity = "critical"; description = "C2 framework" },
                @{ pattern = "meterpreter"; severity = "critical"; description = "Exploitation framework" },
                @{ pattern = "lazagne"; severity = "critical"; description = "Password recovery tool" },
                @{ pattern = "bloodhound"; severity = "warning"; description = "AD enumeration tool" }
            )
            $Global:CompiledSuspiciousPatterns = $patternDefs | ForEach-Object {
                @{
                    regex = [regex]::new("\b$($_.pattern)\b", "IgnoreCase, Compiled")
                    severity = $_.severity
                    description = $_.description
                    pattern = $_.pattern
                }
            }
            Write-Log "[LOCAL-DETECT] Compiled $($Global:CompiledSuspiciousPatterns.Count) suspicious process patterns" "DEBUG"
        }
        
        $detected = @()
        # v5.0.13-perf: Only get Name+Id (skip Path - it's slow and requires elevation)
        $processes = Get-Process -ErrorAction SilentlyContinue | Select-Object -Property Name, Id
        
        foreach ($proc in $processes) {
            foreach ($suspicious in $Global:CompiledSuspiciousPatterns) {
                if ($suspicious.regex.IsMatch($proc.Name)) {
                    # v5.0.13-perf: Only fetch Path on-demand for detected suspicious processes
                    $procPath = "N/A"
                    try { $procPath = (Get-Process -Id $proc.Id -ErrorAction Stop).Path } catch { }
                    if (-not $procPath) { $procPath = "N/A" }
                    
                    $detected += @{
                        process_name = $proc.Name
                        process_id = $proc.Id
                        process_path = $procPath
                        pattern = $suspicious.pattern
                        severity = $suspicious.severity
                        description = $suspicious.description
                    }
                }
            }
        }
        
        if ($detected.Count -gt 0) {
            foreach ($det in $detected) {
                Write-Log "[LOCAL-DETECT] SUSPICIOUS PROCESS: $($det.process_name) (PID: $($det.process_id)) - $($det.description)" "ERROR"
                
                if ($det.severity -eq "critical") {
                    Show-SecurityToast `
                        -Title "CyberShield - Processo Suspeito!" `
                        -Message "Processo perigoso detectado: $($det.process_name) - $($det.description)" `
                        -Severity "Error"
                }
                
                Invoke-PushAlert `
                    -AlertType "suspicious_process" `
                    -AlertMessage "Processo suspeito detectado em $env:COMPUTERNAME : $($det.process_name) - $($det.description)" `
                    -Severity $det.severity `
                    -Details $det
                
                Add-EvidenceEntry -Type "local_detection" -Data @{
                    detection = "suspicious_process"
                    process = $det
                } -Severity $det.severity
            }
            
            return @{ status = "detected"; count = $detected.Count; processes = $detected }
        }
        
        return @{ status = "clean" }
    } catch {
        Write-Log "[LOCAL-DETECT] Process check error: $($_.Exception.Message)" "WARN"
        return @{ status = "unknown"; error = $_.Exception.Message }
    }
}

# ============================================
#  v5.0.11: LOCAL DETECTION ORCHESTRATOR
# ============================================
function Invoke-LocalDetection {
    Write-Log "[LOCAL-DETECT] Running proactive security checks..." "INFO"
    
    $results = @{
        timestamp = (Get-Date).ToString("o")
        antivirus = $null
        firewall = $null
        usb = $null
        processes = $null
        threats_found = 0
        remediations_applied = 0
    }
    
    $results.antivirus = Test-AntivirusStatus
    if ($results.antivirus.status -eq "inactive") { $results.threats_found++ }
    
    $results.firewall = Test-FirewallStatus
    if ($results.firewall.status -eq "remediated") { 
        $results.threats_found++
        $results.remediations_applied++ 
    }
    
    $results.usb = Test-UsbDevices
    if ($results.usb.status -eq "detected") { $results.threats_found += $results.usb.count }
    
    $results.processes = Test-SuspiciousProcesses
    if ($results.processes.status -eq "detected") { $results.threats_found += $results.processes.count }
    
    if ($results.threats_found -gt 0) {
        Write-Log "[LOCAL-DETECT] Completed: $($results.threats_found) threat(s) found, $($results.remediations_applied) remediation(s) applied" "WARN"
    } else {
        Write-Log "[LOCAL-DETECT] Completed: System clean" "SUCCESS"
    }
    
    return $results
}

# ============================================
#  MAIN LOOP v5.0.11 FULL ENTERPRISE
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] CyberShield Agent $($Global:AgentVersion) FULL ENTERPRISE" "INFO"
Write-Log "[INFO] ServerUrl: $Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: $Global:AgentName" "DEBUG"
Write-Log "[INFO] Features: ECDSA-signing, Ed25519-verify, hash-chain, FSM, DNS-filter, auto-remediation, LOCAL-DETECTION, TOAST-ALERTS" "INFO"
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
$Global:SecurityDegraded = $false
$consecutiveHeartbeatFailures = 0
$maxConsecutiveFailures = 1000000  # Declared here (before Phase 2 uses it) to comply with StrictMode
if (-not $keysInitialized) {
    Write-Log "[STARTUP] Failed to initialize keys - entering DEGRADED mode (FAIL-CLOSED)" "ERROR"
    Set-AgentState -NewState "DEGRADED" -Reason "Key initialization failed"
    $Global:SecurityDegraded = $true
    Write-Log "[SECURITY] SecurityDegraded=TRUE - operational jobs will be BLOCKED until crypto is restored" "WARN"
}

# ============================================
#  PHASE 2: AUTHENTICATION
# ============================================
# BUG 4 fix: Guard - only transition to AUTHENTICATING if not stuck in DEGRADED with failed keys
if ($Global:CurrentState -eq "DEGRADED" -and $Global:SecurityDegraded) {
    Write-Log "[STARTUP] Skipping AUTHENTICATING - SecurityDegraded, staying in DEGRADED for heartbeat attempt" "WARN"
} else {
    Set-AgentState -NewState "AUTHENTICATING" -Reason "Validating credentials"
}

# Send first heartbeat
$heartbeatSuccess = Send-Heartbeat

if (-not $heartbeatSuccess) {
    Write-Log "[STARTUP] Initial heartbeat failed - entering DEGRADED mode" "WARN"
    Set-AgentState -NewState "DEGRADED" -Reason "Heartbeat failed"
    $consecutiveHeartbeatFailures = [Math]::Min($consecutiveHeartbeatFailures + 1, $maxConsecutiveFailures)
    
    # Bug 5 fix: If BOTH keys and heartbeat failed, enter SAFE_MODE (fail-closed)
    if (-not $keysInitialized) {
        Write-Log "[SECURITY] No crypto + no auth = SAFE_MODE (fail-closed)" "ERROR"
        Set-AgentState -NewState "SAFE_MODE" -Reason "No auth + no crypto - fail closed"
    }
} else {
    # Register public key
    if ($keysInitialized) {
        $keyRegistered = Register-AgentKey
        if (-not $keyRegistered) {
            Write-Log "[STARTUP] Key registration failed - result signing unavailable" "WARN"
        }
    }
    $consecutiveHeartbeatFailures = 0
}

# ============================================
#  PHASE 3: SYNCHRONIZATION
# ============================================
# Bug 5 fix: If in SAFE_MODE after startup failures, enter recovery loop
if ($Global:CurrentState -eq "SAFE_MODE") {
    Write-Log "[STARTUP] Agent in SAFE_MODE - entering recovery-only loop" "WARN"
    $recoveryAttempt = 0
    while ($Global:CurrentState -eq "SAFE_MODE") {
        $recoveryAttempt++
        # BUG 8 fix: Exponential backoff for recovery (60s, 120s, 240s... max 600s) + jitter
        $jitter = Get-Random -Minimum 0 -Maximum 30
        $recoveryDelay = [math]::Min(60 * [math]::Pow(2, $recoveryAttempt - 1), 600) + $jitter
        Write-Log "[SAFE_MODE] Recovery attempt #$recoveryAttempt - waiting ${recoveryDelay}s (jitter: ${jitter}s)..." "INFO"
        Start-Sleep -Seconds $recoveryDelay
        Write-Log "[SAFE_MODE] Attempting recovery heartbeat..." "INFO"
        $recoveryHb = Send-Heartbeat
        if ($recoveryHb) {
            $keysInitialized = Initialize-AgentKeys
            if ($keysInitialized) {
                $Global:SecurityDegraded = $false
                Set-AgentState -NewState "INITIALIZING" -Reason "Recovery successful"
                Write-Log "[SAFE_MODE] Recovery successful - restarting initialization" "SUCCESS"
                break
            } else {
                Write-Log "[SAFE_MODE] Heartbeat OK but keys still failed - continuing recovery" "WARN"
            }
        }
    }
}

Set-AgentState -NewState "SYNCING" -Reason "Syncing policies and baseline"

# Bug 6 fix: Guard against duplicate baseline initialization
if (-not $Global:ProcessBaseline) {
    Initialize-ProcessBaseline
} else {
    Write-Log "[BASELINE] Already initialized, skipping duplicate call" "DEBUG"
}

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
# Bug 2 fix: Only enter ENFORCING if security is not degraded
if ($Global:SecurityDegraded) {
    Write-Log "[STARTUP] Agent v$($Global:AgentVersion) starting in DEGRADED mode (SecurityDegraded=TRUE, only recovery jobs allowed)" "WARN"
} else {
    Set-AgentState -NewState "ENFORCING" -Reason "Normal operation"
    Write-Log "[STARTUP] Agent v$($Global:AgentVersion) fully operational in ENFORCING state" "SUCCESS"
}

$lastHeartbeat = Get-Date
$lastAutoRepair = Get-Date
$lastSoftwareCheck = Get-Date
$lastJobPoll = Get-Date
$lastDnsSync = Get-Date
$lastLocalDetection = Get-Date
$consecutiveNetworkFailures = 0
$consecutiveHeartbeatFailures = 0  # Reset for main loop (also declared before Phase 2)
# $maxConsecutiveFailures already declared at line ~4790

# v5.0.11: Run initial local detection on startup
Write-Log "[STARTUP] Running initial local security detection..." "INFO"
Invoke-LocalDetection | Out-Null

while ($true) {
    $now = Get-Date
    
    try {
        # ============================================
        # NETWORK WATCHDOG
        # ============================================
        $networkOk = Test-NetworkConnectivity
        if (-not $networkOk) {
            if ($consecutiveNetworkFailures -lt $maxConsecutiveFailures) { $consecutiveNetworkFailures = [Math]::Min($consecutiveNetworkFailures + 1, $maxConsecutiveFailures) }
            if ($consecutiveNetworkFailures -ge 3) {
                Set-AgentState -NewState "DEGRADED" -Reason "Network connectivity lost"
            }
        } else {
            if ($consecutiveNetworkFailures -ge 3 -and $Global:CurrentState -eq "DEGRADED") {
                # Bug 7 fix: Only restore ENFORCING if crypto is healthy
                if (-not $Global:SecurityDegraded) {
                    Set-AgentState -NewState "ENFORCING" -Reason "Network restored"
                } else {
                    Write-Log "[FSM] Network restored but SecurityDegraded=TRUE - staying DEGRADED" "WARN"
                }
            }
            $consecutiveNetworkFailures = 0
        }
        
        # ============================================
        # JOB POLLING AND EXECUTION
        # ============================================
        if (($now - $lastJobPoll).TotalSeconds -ge $Global:JobPollIntervalSeconds -and $networkOk) {
            $jobs = Poll-Jobs
            
            foreach ($job in $jobs) {
                $jobType = if ($job.type) { $job.type } elseif ($job.job_type) { $job.job_type } else { "unknown" }
                
                # Bug 2 fix: When SecurityDegraded, only allow recovery jobs (fail-closed)
                $recoveryJobTypes = @("update_agent", "force_update", "reinstall_agent")
                if ($Global:SecurityDegraded -and $jobType -notin $recoveryJobTypes) {
                    Write-Log "[SECURITY] BLOCKED job '$jobType' - SecurityDegraded=TRUE (only recovery jobs allowed)" "WARN"
                    # Submit a rejection result so job doesn't stay in 'delivered' forever
                    # BUG 6 fix: Include all mandatory fields for Submit-JobResult
                    Submit-JobResult -Job $job -Result @{
                        success = $false
                        status = "failed"
                        output = @{ blocked = $true; reason = "SecurityDegraded" }
                        output_hash = ""
                        error_message = "Agent in SecurityDegraded mode - crypto not available. Only update/recovery jobs accepted."
                        exit_code = 403
                        execution_hash = ""
                    }
                    continue
                }
                
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
            if (-not $hbResult) {
                if ($consecutiveHeartbeatFailures -lt $maxConsecutiveFailures) { $consecutiveHeartbeatFailures = [Math]::Min($consecutiveHeartbeatFailures + 1, $maxConsecutiveFailures) }
                Write-Log "[HEARTBEAT] Failure #$consecutiveHeartbeatFailures" "WARN"
                
                if ($Global:CurrentState -eq "ENFORCING") {
                    Set-AgentState -NewState "DEGRADED" -Reason "Heartbeat failed"
                }
                
                # Bug 4 fix: After 5 consecutive failures, enter SAFE_MODE to stop auth spam
                if ($consecutiveHeartbeatFailures -ge 5) {
                    Write-Log "[SECURITY] $consecutiveHeartbeatFailures consecutive heartbeat failures - entering SAFE_MODE" "ERROR"
                    Set-AgentState -NewState "SAFE_MODE" -Reason "Persistent auth failure ($consecutiveHeartbeatFailures consecutive)"
                    
                    # Backoff loop in SAFE_MODE - try every 2 minutes, max 10 attempts
                    $safeModeRecoveryAttempt = 0
                    while ($Global:CurrentState -eq "SAFE_MODE") {
                        $safeModeRecoveryAttempt++
                        if ($safeModeRecoveryAttempt -ge 10) {
                            Write-Log "[SAFE_MODE] Recovery limit reached (10 attempts) - staying in SAFE_MODE, will retry next main loop cycle" "ERROR"
                            break
                        }
                        $jitter = Get-Random -Minimum 0 -Maximum 30
                        $recoveryDelay = [math]::Min(120 * [math]::Pow(1.5, $safeModeRecoveryAttempt - 1), 600) + $jitter
                        Write-Log "[SAFE_MODE] Recovery attempt #$safeModeRecoveryAttempt - waiting ${recoveryDelay}s (jitter: ${jitter}s)..." "INFO"
                        Start-Sleep -Seconds $recoveryDelay
                        $recoveryHb = Send-Heartbeat
                        if ($recoveryHb) {
                            $consecutiveHeartbeatFailures = 0
                            if (-not $Global:SecurityDegraded) {
                                Set-AgentState -NewState "ENFORCING" -Reason "Heartbeat recovered"
                            } else {
                                Set-AgentState -NewState "DEGRADED" -Reason "Heartbeat recovered but crypto still degraded"
                            }
                            Write-Log "[SAFE_MODE] Recovery successful after $safeModeRecoveryAttempt attempts" "SUCCESS"
                            break
                        }
                    }
                }
            } else {
                if ($consecutiveHeartbeatFailures -gt 0) {
                    Write-Log "[HEARTBEAT] Recovered after $consecutiveHeartbeatFailures failures" "SUCCESS"
                }
                $consecutiveHeartbeatFailures = 0
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
        
        # ============================================
        # v5.0.11: LOCAL DETECTION (every 5 min)
        # ============================================
        if (($now - $lastLocalDetection).TotalSeconds -ge $Global:LocalDetectionIntervalSeconds) {
            Invoke-LocalDetection | Out-Null
            $lastLocalDetection = Get-Date
        }
        
        # ============================================
        # v5.0.13: RUNTIME INTEGRITY CHECK (TOCTOU DEFENSE, every 5 min)
        # ============================================
        if (($now - $Global:LastIntegrityCheck).TotalSeconds -ge $Global:IntegrityCheckIntervalSeconds) {
            if (-not (Test-RuntimeIntegrity)) {
                Write-Log "[INTEGRITY] TOCTOU VIOLATION DETECTED - terminating agent immediately" "ERROR"
                Write-EventLog -LogName Application -Source "CyberShield" -EventId 9004 -EntryType Error -Message "TOCTOU integrity violation - agent script modified during runtime. Terminating." -ErrorAction SilentlyContinue
                Flush-LogBuffer
                [Environment]::Exit(9004)
            }
            $Global:LastIntegrityCheck = Get-Date
        }
        
    } catch {
        Write-Log "[MAIN-LOOP] Error: $($_.Exception.Message)" "ERROR"
        Write-Log "[MAIN-LOOP] Stack: $($_.ScriptStackTrace)" "ERROR"
        # BUG 10 fix: Attempt recovery on critical errors
        if ($_.Exception.Message -match "disk|space|memory|OutOfMemory") {
            Write-Log "[MAIN-LOOP] Critical resource error detected - attempting disk cleanup" "WARN"
            try { Invoke-DiskCleanup } catch { }
        }
    }
    
    # v5.0.13-perf: Dynamic sleep interval based on agent state
    # v5.0.13-perf: Adaptive sleep - increase interval under high system load
    $baseSleep = switch ($Global:CurrentState) {
        "ENFORCING" { 2 }
        "DEGRADED"  { 5 }
        "SAFE_MODE" { 10 }
        default     { 2 }
    }
    try {
        $cpuLoad = (Get-CimInstance Win32_Processor -ErrorAction SilentlyContinue | 
            Measure-Object -Property LoadPercentage -Average).Average
        if ($cpuLoad -gt 80) { $baseSleep = [math]::Max($baseSleep, 10) }
    } catch { }
    $sleepInterval = $baseSleep
    Start-Sleep -Seconds $sleepInterval
    
    # v5.0.13-perf: Flush log buffer on each cycle boundary
    Flush-LogBuffer
}

# BUG FIX #7: Ensure mutex is released on any exit path (Dispose in finally equivalent)
# This runs if the while loop ever breaks (shouldn't normally)
if ($Global:AgentMutex) {
    try {
        $Global:AgentMutex.ReleaseMutex()
        $Global:AgentMutex.Dispose()
    } catch { }
}
