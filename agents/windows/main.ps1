<#
.SYNOPSIS
    CyberShield Agent v6.0 - Windows Orchestrator
.DESCRIPTION
    Modular security agent orchestrator.
    Loads specialized modules and runs the main heartbeat loop.
#>

param(
    [string]$AgentToken,
    [string]$HmacSecret,
    [string]$ApiEndpoint
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

# Load modules
$modulePath = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "modules"
. "$modulePath\config.ps1"
. "$modulePath\utils.ps1"
. "$modulePath\crypto.ps1"
. "$modulePath\hmac.ps1"
. "$modulePath\telemetry.ps1"
. "$modulePath\security.ps1"
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
}

Main
