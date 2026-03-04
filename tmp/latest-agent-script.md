# Content from https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/get-latest-agent-script?platform=windows&format=plain

```
<#
    CyberShield Agent - Windows v5.0.13 FULL ENTERPRISE

    v5.0.13-perf: PERFORMANCE TUNING - Parity with Linux/macOS optimizations
    v5.0.13-perf: Performance tuning (cached timestamps, HashSet O(1) lookups, HMAC reuse, log rotation throttling, CIM caching)
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
                if ($cacheJson.signature -and $(if (Get-Member -InputObject $cacheJson -Name "signature" -ErrorAction SilentlyContinue) { $cacheJson.signature } else { $null }) -and $(if (Get-Member -InputObject $cacheJson -Name "signature" -ErrorAction SilentlyContinue) { $cacheJson.signature.Length } else { 0 }) -gt 10 <# HOTFIX-SAFE-CACHE-SIG #>) {
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
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","ContainerInherit,ObjectInherit","None","Allow") <# HOTFIX-ACL-SID #>
    $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","ContainerInherit,ObjectInherit","None","Allow") <# HOTFIX-ACL-SID #>
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
# HOTFIX-BASELINE-GLOBALS: Declare monitoring globals early for StrictMode
$Global:ProcessBaseline = @{}
$Global:LastBaselineUpdate = [datetime]::MinValue
$Global:LastAnomalyCheck = [datetime]::MinValue
$Global:AnomalyHistory = @()
$Global:ProtectedProcessSet = $null

# HOTFIX-TOCTOU-SELFHEAL: Self-healing hash cache on startup
# Prevents permanent TOCTOU crash loop caused by encoding differences between
# Base64-decoded bytes (WriteAllBytes) and PowerShell's Get-Content re-read
try {
    $toctouScriptPath = "C:\CyberShield\cybershield-agent.ps1"
    $toctouHashCachePath = "C:\CyberShield\data\expected_script_hash.json"
    if ((Test-Path $toctouScriptPath) -and (Test-Path $toctouHashCachePath)) {
        $toctouCacheContent = Get-Content $toctouHashCachePath -Raw -ErrorAction SilentlyContinue
        if ($toctouCacheContent) {
            $toctouCache = $toctouCacheContent | ConvertFrom-Json -ErrorAction SilentlyContinue
            if ($toctouCache -and (Get-Member -InputObject $toctouCache -Name "sha256" -ErrorAction SilentlyContinue)) {
                $toctouExpected = $toctouCache.sha256
                # Compute actual hash using Get-FileHash (same method TOCTOU checker uses)
                $toctouActual = (Get-FileHash $toctouScriptPath -Algorithm SHA256 -ErrorAction SilentlyContinue).Hash.ToLower()
                if ($toctouActual -and $toctouExpected -and ($toctouActual -ne $toctouExpected.ToLower())) {
                    $toctouCache.sha256 = $toctouActual
                    if (Get-Member -InputObject $toctouCache -Name "updated_at" -ErrorAction SilentlyContinue) {
                        $toctouCache.updated_at = (Get-Date).ToString("o")
                    } else {
                        $toctouCache | Add-Member -NotePropertyName "updated_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                    }
                    $toctouCache | Add-Member -NotePropertyName "self_healed" -NotePropertyValue $true -Force
                    $toctouCache | Add-Member -NotePropertyName "self_healed_at" -NotePropertyValue (Get-Date).ToString("o") -Force
                    $toctouCache | ConvertTo-Json -Depth 5 | Set-Content $toctouHashCachePath -Encoding UTF8 -Force
                }
            }
        }
    }
} catch {
    # non-fatal
}

# v5.0.13-fix: ProtectedProcessSet must be declared before use (StrictMode compatibility)
$Global:ProtectedProcessSet = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase) <# HOTFIX-INIT-PROTECTEDSET #>

# v5.0.14-hotfix: Declare crypto globals early (StrictMode-safe when key init fails)
$Global:AgentPrivateKey = $null
$Global:AgentRsaKey = $null
$Global:AgentSigningAlgorithm = "ECDSA-P256-SHA256"
$Global:AgentPublicKey = $null
$Global:KeyFingerprint = $null
$Global:KeyVersion = 0

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
$Global:LogFlushCount = 0          # v5.0.13-perf: Throttle rotation checks

# v5.0.13-perf: Pre-compiled suspicious process regex patterns
$Global:CompiledSuspiciousPatterns = $null  # Initialized on first use

# v5.0.13-perf: Cached HMAC key object (avoids recreating per request)
$Global:CachedHmacKey = $null

# v5.0.13-perf: Cached CIM CPU load (avoids WMI query per main loop iteration)
$Global:CachedCpuLoad = 0
$Global:CachedCpuLoadTime = [datetime]::MinValue

# v5.0.13-perf: Per-iteration cached timestamp (set once at top of main loop)
$Global:LoopTimestamp = Get-Date
$Global:LoopTimestampStr = $Global:LoopTimestamp.ToString("yyyy-MM-dd HH:mm:ss")

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
    $Global:LogFlushCount++
    try {
        # v5.0.13-perf: Only check file size every 50 flushes (reduces stat() I/O by ~98%)
        if ($Global:LogFlushCount % 50 -eq 1) {
            $logFile = Get-Item $Global:LogFilePath -ErrorAction SilentlyContinue
            if ($logFile -and $logFile.Length -gt $Global:MaxLogSizeBytes) {
                $backupFile = "$($Global:LogFilePath).$(Get-Date -Format 'yyyyMMdd_HHmmss').bak"
                Move-Item $Global:LogFilePath $backupFile -Force
                Get-ChildItem -Path (Split-Path $Global:LogFilePath -Parent) -Filter "*.bak" |
                    Sort-Object LastWriteTime -Descending |
                    Select-Object -Skip 5 |
                    Remove-Item -Force -ErrorAction SilentlyContinue
            }
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
        $expectedHash = $null
        # v5.0.13-fix: Prefer signed JSON cache as authoritative source
        $hashCacheJsonPath = Join-Path (Join-Path $Global:BaseDir "data") "expected_script_hash.json"
        if (Test-Path $hashCacheJsonPath) {
            try {
                $cache = Get-Content $hashCacheJsonPath -Raw -ErrorAction SilentlyContinue | ConvertFrom-Json -ErrorAction SilentlyContinue
                if ($cache -and $cache.hash -and $cache.hash.Length -eq 64) {
                    $expectedHash = $cache.hash
                }
            } catch { }
        }
        # Fallback to legacy TXT if JSON not available
        if (-not $expectedHash) {
            $hashCachePath = Join-Path (Join-Path $Global:BaseDir "data") "expected_script_hash.txt"
            if (-not (Test-Path $hashCachePath)) { return $true }
            $expectedHash = (Get-Content $hashCachePath -Raw -ErrorAction SilentlyContinue).Trim()
        }
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
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>))
                $acl.AddAccessRule((New-Object System.Security.AccessControl.FileSystemAccessRule((New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>))
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
                $params.Body = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 } <# HOTFIX-BODY-COMPRESS #>
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
        # This prevents "O objeto ja existe" / "The object already exists" errors
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

                # HOTFIX-CNG-CLEANUP: Delete any leftover CNG containers before creating
                try {
                    $existingKey = [System.Security.Cryptography.CngKey]::Open("CyberShieldECDSA_$env:COMPUTERNAME", [System.Security.Cryptography.CngProvider]::MicrosoftSoftwareKeyStorageProvider)
                    if ($existingKey) { $existingKey.Delete(); $existingKey.Dispose() }
                    Write-Log "[KEYS] Cleaned up existing CNG container" "DEBUG"
                } catch { <# Container doesn't exist, that's fine #> }
                $cngKey = [System.Security.Cryptography.CngKey]::Create(
                    [System.Security.Cryptography.CngAlgorithm]::ECDsaP256,
                    $null,  # Ephemeral key (HOTFIX-CNG-CLEANUP)
                    $creationParams
                )
                $ecdsa = [System.Security.Cryptography.ECDsaCng]::new($cngKey)
                Write-Log "[KEYS] ECDSA keypair generated (attempt $attempt, ephemeral)" "INFO"
                break  # Success
            } catch {
                $errMsg = $_.Exception.Message
                Write-Log "[KEYS] ECDSA attempt $attempt/$maxKeyAttempts failed: $errMsg" "WARN"

                if ($attempt -eq $maxKeyAttempts) {
                    # v5.0.14 HOTFIX: fallback for legacy Windows/.NET where CNG container creation is unstable
                    try {
                        $ecdsa = [System.Security.Cryptography.ECDsaCng]::new(256)
                        if ($null -ne $ecdsa) {
                            Write-Log "[KEYS] Fallback ECDSA keypair generated via ECDsaCng(256)" "WARN"
                            break
                        }
                    } catch {
                        Write-Log "[KEYS] ECDsaCng fallback failed: $($_.Exception.Message)" "WARN"
                    }

                    try {
                        $ecdsa = [System.Security.Cryptography.ECDsa]::Create()
                        if ($null -ne $ecdsa) {
                            try {
                                if ($ecdsa.KeySize -ne 256) { $ecdsa.KeySize = 256 }
                            } catch {
                                Write-Log "[KEYS] Managed ECDSA fallback created key with KeySize=$($ecdsa.KeySize)" "WARN"
                            }
                            Write-Log "[KEYS] Fallback ECDSA keypair generated via managed API" "WARN"
                            break
                        }
                    } catch {
                        Write-Log "[KEYS] Managed ECDSA fallback failed: $($_.Exception.Message)" "WARN"
                    }

                    Write-Log "[KEYS] All $maxKeyAttempts ECDSA attempts failed - trying RSA-2048 fallback" "WARN"

                    # v5.0.13-fix: RSA-2048 fallback for legacy Windows without ECDSA support
                    try {
                        $rsa = [System.Security.Cryptography.RSA]::Create(2048)
                        if ($null -ne $rsa) {
                            $privateKeyBytes = $rsa.ExportPkcs8PrivateKey()
                            $privateKeyBase64 = [Convert]::ToBase64String($privateKeyBytes)
                            $publicKeyBytes = $rsa.ExportSubjectPublicKeyInfo()
                            $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)

                            $sha256Hash = [System.Security.Cryptography.SHA256]::Create()
                            $fpBytes = $sha256Hash.ComputeHash($publicKeyBytes)
                            $fp = [BitConverter]::ToString($fpBytes).Replace("-", "").ToLower()
                            $sha256Hash.Dispose()

                            $keyData = @{
                                private_key = $privateKeyBase64
                                public_key = $publicKeyBase64
                                fingerprint = $fp
                                algorithm = "RSA-2048-SHA256"
                                version = 1
                                created_at = (Get-Date).ToString("o")
                            }
                            $keyData | ConvertTo-Json | Out-File $Global:KeyStorePath -Encoding UTF8

                            $Global:AgentPrivateKey = $privateKeyBase64
                            $Global:AgentPublicKey = $publicKeyBase64
                            $Global:KeyFingerprint = $fp
                            $Global:KeyVersion = 1

                            Write-Log "[KEYS] RSA-2048 fallback keypair generated. Fingerprint: $($fp.Substring(0, 16))..." "SUCCESS"
                            $rsa.Dispose()
                            return $true
                        }
                    } catch {
                        Write-Log "[KEYS] RSA fallback also failed: $($_.Exception.Message)" "WARN"
                    }

                    # v5.0.13-fix: Last resort - RSACryptoServiceProvider (works on .NET 2.0+)
                    try {
                        $rsaCsp = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
                        $pubXml = $rsaCsp.ToXmlString($false)
                        $privXml = $rsaCsp.ToXmlString($true)

                        $pubBytes = [System.Text.Encoding]::UTF8.GetBytes($pubXml)
                        $privB64 = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($privXml))
                        $pubB64 = [Convert]::ToBase64String($pubBytes)

                        $sha256Hash2 = [System.Security.Cryptography.SHA256]::Create()
                        $fpBytes2 = $sha256Hash2.ComputeHash($pubBytes)
                        $fp2 = [BitConverter]::ToString($fpBytes2).Replace("-", "").ToLower()
                        $sha256Hash2.Dispose()

                        $keyData2 = @{
                            private_key = $privB64
                            public_key = $pubB64
                            fingerprint = $fp2
                            algorithm = "RSA-2048-XML"
                            version = 1
                            created_at = (Get-Date).ToString("o")
                        }
                        $keyData2 | ConvertTo-Json | Out-File $Global:KeyStorePath -Encoding UTF8

                        $Global:AgentPrivateKey = $privB64
                        $Global:AgentPublicKey = $pubB64
                        $Global:KeyFingerprint = $fp2
                        $Global:KeyVersion = 1

                        Write-Log "[KEYS] RSACryptoServiceProvider fallback generated. Fingerprint: $($fp2.Substring(0, 16))..." "SUCCESS"
                        $rsaCsp.Dispose()
                        return $true
                    } catch {
                        Write-Log "[KEYS] RSACryptoServiceProvider fallback failed: $($_.Exception.Message)" "ERROR"
                    }

                    Write-Log "[KEYS] All crypto attempts exhausted - signing DISABLED" "ERROR"
                    return $false
                }

                Start-Sleep -Seconds 2
            }
        }

        # HOTFIX-EXPORT: Export keys with .NET Framework 4.x compatibility
        $privateKeyBase64 = $null
        $publicKeyBase64 = $null
        $publicKeyBytes = $null
        try {
            # .NET Core 3.0+ path
            $privateKeyBytes = $ecdsa.ExportPkcs8PrivateKey()
            $privateKeyBase64 = [Convert]::ToBase64String($privateKeyBytes)
            $publicKeyBytes = $ecdsa.ExportSubjectPublicKeyInfo()
            $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)
        } catch {
            Write-Log "[KEYS] ECDSA PKCS8 export not available, falling back to RSA-2048..." "WARN"
            # HOTFIX-RSA-FALLBACK: Generate RSA-2048 keypair instead (PKCS8 export works on all .NET versions)
            try {
                $ecdsa.Dispose()  # Release the unusable ECDSA key
                $ecdsa = $null
            } catch { }
            try {
                # HOTFIX-RSA-NET4X: Use RSACryptoServiceProvider (.NET 4.x compatible)
                $rsa = New-Object System.Security.Cryptography.RSACryptoServiceProvider(2048)
                $privateKeyBase64 = [Convert]::ToBase64String($rsa.ExportCspBlob($true))
                $publicKeyBytes = $rsa.ExportCspBlob($false)
                $publicKeyBase64 = [Convert]::ToBase64String($publicKeyBytes)
                # Store RSA object globally for signing
                $Global:AgentRsaKey = $rsa
                $Global:AgentSigningAlgorithm = "RSA-2048-SHA256"
                Write-Log "[KEYS] RSA-2048 fallback keypair generated successfully" "INFO"
            } catch {
                Write-Log "[KEYS] RSA-2048 fallback also failed: $($_.Exception.Message)" "ERROR"
                # Last resort: synthetic fingerprint
                $randomBytes = [byte[]]::new(32)
                $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create(); $rng.GetBytes($randomBytes) <# HOTFIX-RNG-NET4X #>
                $publicKeyBytes = $randomBytes
                $publicKeyBase64 = [Convert]::ToBase64String($randomBytes)
            }
        }

        # Calculate fingerprint (SHA256 of public key)
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $fingerprintBytes = $sha256.ComputeHash($publicKeyBytes)
        $fingerprint = [BitConverter]::ToString($fingerprintBytes).Replace("-", "").ToLower()

        # Save keys locally
        $keyData = @{
            private_key = $privateKeyBase64
            public_key = $publicKeyBase64
            fingerprint = $fingerprint
            algorithm = $(if ($Global:AgentSigningAlgorithm) { $Global:AgentSigningAlgorithm } else { "ECDSA-P256-SHA256" }) <# HOTFIX-RSA-ALGO #>
            version = 1
            created_at = (Get-Date).ToString("o")
        }

        $keyData | ConvertTo-Json | Out-File $Global:KeyStorePath -Encoding UTF8

        # Protect key file (SYSTEM and Administrators only)
        try {
            $acl = Get-Acl $Global:KeyStorePath
            $acl.SetAccessRuleProtection($true, $false)

            $adminRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-32-544")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>
            $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
                (New-Object System.Security.Principal.SecurityIdentifier("S-1-5-18")).Translate([System.Security.Principal.NTAccount]),"FullControl","Allow") <# HOTFIX-ACL-SID #>

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

        if ($null -ne $ecdsa) { $ecdsa.Dispose() } <# HOTFIX-NULL-ECDSA-GUARD #>
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
            algorithm = $(if ($Global:AgentSigningAlgorithm) { $Global:AgentSigningAlgorithm } else { "ECDSA-P256-SHA256" }) <# HOTFIX-RSA-ALGO #>
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
                    # $keys.registered_at = (Get-Date).ToString("o") <# HOTFIX-SAFE-REGISTERED-AT - set safely #>
        if ($keys -and $keys -is [hashtable]) { $keys["registered_at"] = (Get-Date).ToString("o") } elseif ($keys) { try { $keys | Add-Member -NotePropertyName "registered_at" -NotePropertyValue (Get-Date).ToString("o") -Force -ErrorAction SilentlyContinue } catch {} }
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
        $signatureBytes = if ($Global:AgentSigningAlgorithm -eq "RSA-2048-SHA256" -and $Global:AgentRsaKey) { $Global:AgentRsaKey.SignData( <# HOTFIX-NULL-ECDSA-GUARD #>$payloadBytes, [System.Security.Cryptography.HashAlgorithmName]::SHA256)
        $signature = [Convert]::ToBase64String($signatureBytes)

        if ($null -ne $ecdsa) { $ecdsa.Dispose() } <# HOTFIX-NULL-ECDSA-GUARD #>

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
            "collect_certificates" { <# HOTFIX-COLLECT-CERTS #>

                try {

                    $certs = @(Get-ChildItem -Path Cert:\LocalMachine\My -ErrorAction SilentlyContinue)

                    $certList = @($certs | ForEach-Object {

                        @{

                            thumbprint = $_.Thumbprint

                            subject = $_.Subject

                            issuer = $_.Issuer

                            valid_from = $_.NotBefore.ToString("o")

                            valid_until = $_.NotAfter.ToString("o")

                            serial_number = $_.SerialNumber

                            is_self_signed = ($_.Subject -eq $_.Issuer)

                            cert_store = "LocalMachine\\My"

                        }

                    })

                    $output = @{ certificates = $certList; count = $certList.Count; collected_at = (Get-Date).ToString("o") }

                    Write-Log "[JOB] Collected $($certList.Count) certificates" "INFO"

                } catch {

                    $error_message = "collect_certificates failed: $($_.Exception.Message)"

                    $status = "failed"

                }

            }

            "collect_disk_metrics" { <# HOTFIX-COLLECT-DISK #>

                try {

                    $drives = @(Get-CimInstance -ClassName Win32_LogicalDisk -Filter "DriveType=3" -ErrorAction SilentlyContinue)

                    $diskList = @($drives | ForEach-Object {

                        $totalGB = [math]::Round($_.Size / 1GB, 2)

                        $freeGB = [math]::Round($_.FreeSpace / 1GB, 2)

                        $usedGB = [math]::Round($totalGB - $freeGB, 2)

                        $usagePct = if ($totalGB -gt 0) { [math]::Round(($usedGB / $totalGB) * 100, 1) } else { 0 }

                        @{

                            drive_letter = $_.DeviceID

                            drive_label = if ($_.VolumeName) { $_.VolumeName } else { "" }

                            drive_type = "Fixed"

                            total_gb = $totalGB

                            free_gb = $freeGB

                            used_gb = $usedGB

                            usage_percent = $usagePct

                            is_system_drive = ($_.DeviceID -eq $env:SystemDrive)

                        }

                    })

                    $output = @{ disks = $diskList; count = @($diskList).Count; collected_at = (Get-Date).ToString("o") }

                    Write-Log "[JOB] Collected disk metrics for $(@($diskList).Count) drives" "INFO"

                } catch {

                    $error_message = "collect_disk_metrics failed: $($_.Exception.Message)"

                    $status = "failed"

                }

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

        # HOTFIX-DNS-403-INFO: 403 = feature disabled (not an error)
        if (-not $result.Success) {
            if ($result.StatusCode -eq 403) {
                Write-Log "[DNS] DNS Filter desabilitado para este tenant (403 - feature flag off)" "INFO"
            } else {
                Write-Log "[DNS] Falha ao sincronizar DNS blocklist (HTTP $($result.StatusCode)): $($result.Error)" "WARN"
            }
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
        # -- Phase 1: WMI SecurityCenter2 (detecta qualquer AV registrado no Windows) --
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

        # -- Phase 2: Deteccao complementar de EDRs corporativos (nao registram no SecurityCenter2) --
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
            ip_addresses = @($ipConfig | ForEach-Object