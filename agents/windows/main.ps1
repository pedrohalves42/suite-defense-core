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
# SINGLE-INSTANCE GUARD (mutex)
# Prevents multiple agent instances from running simultaneously
# ============================================
$script:AgentMutex = $null
try {
    $mutexCreated = $false
    $script:AgentMutex = [System.Threading.Mutex]::new($true, "Global\CyberShieldAgent", [ref]$mutexCreated)
    if (-not $mutexCreated) {
        # Another instance already holds the mutex
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
. "$modulePath\job-runner.ps1"
. "$modulePath\self-heal.ps1"
. "$modulePath\update.ps1"

function Main {
    Write-Log "CyberShield Agent v6.0 starting" "INFO"

    try {
        # 1. Initialize configuration
        Initialize-Config -AgentToken $AgentToken -HmacSecret $HmacSecret -ApiEndpoint $ApiEndpoint
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
            Start-HeartbeatLoop
        }
    }
    catch {
        Write-Log "Fatal error: $($_.Exception.Message)" "ERROR"
        try {
            Write-EventLog -LogName Application -Source "CyberShield" -EntryType Error -EventId 9001 -Message "Agent fatal error: $($_.Exception.Message)"
        } catch {
            # EventLog source may not exist
        }
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
