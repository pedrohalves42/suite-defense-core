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
    [string]$ApiEndpoint
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
$Global:AgentName = $env:CYBERSHIELD_AGENT_NAME
$Global:AgentVersion = "6.0.0"
$Global:AgentToken = $null
$Global:HmacSecret = $null
$Global:ServerUrl = $null
$Global:CachedHmacKey = $null
$Global:TlsPinnedThumbprint = $null
$Global:ConsecutivePollErrors = 0
$Global:JobPollIntervalSeconds = 60
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
$modulePath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "modules"

# --- Foundation layer (no dependencies on other modules) ---
. "$modulePath\config.ps1"
. "$modulePath\utils.ps1"
. "$modulePath\crypto.ps1"
. "$modulePath\hmac.ps1"

# --- Infrastructure layer (depends on foundation) ---
. "$modulePath\telemetry.ps1"
. "$modulePath\security.ps1"
. "$modulePath\network.ps1"
. "$modulePath\state.ps1"
. "$modulePath\evidence.ps1"
. "$modulePath\notification.ps1"

# --- Domain layer (depends on infrastructure) ---
. "$modulePath\collection.ps1"
. "$modulePath\remediation.ps1"
. "$modulePath\heartbeat.ps1"

# --- Orchestration layer (depends on all above) ---
. "$modulePath\self-heal.ps1"
. "$modulePath\update.ps1"
. "$modulePath\job-runner.ps1"

function Main {
    Write-Log "CyberShield Agent v6.0 starting" "INFO"

    try {
        # 1. Initialize configuration
        Initialize-Config -AgentToken $AgentToken -HmacSecret $HmacSecret -ApiEndpoint $ApiEndpoint
        $Global:AgentToken = $script:Config.AgentToken
        $Global:HmacSecret = $script:Config.HmacSecret
        $Global:ServerUrl = $script:Config.ApiEndpoint
        Write-Log "Configuration loaded" "INFO"

        # 2. Initialize cryptography (ECDSA/RSA)
        $cryptoOk = Initialize-Crypto
        if (-not $cryptoOk) {
            Write-Log "Crypto initialization failed - using fallback" "WARN"
        }

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
