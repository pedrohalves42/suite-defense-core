<#
.SYNOPSIS
    CyberShield Agent v6.0 - Notification Module
.DESCRIPTION
    Windows toast notifications and push alerts to backend.
    Depends on: utils.ps1, network.ps1 (Invoke-SecureRequest)

.NOTES
    Phase 6.3 (ADR-003): notification-owned state is module-private
    ($script: scope). Previous globals BurntToastAvailable /
    AlertCooldownTracker / AlertCooldownSeconds / LocalDetectionStats are
    gone — callers and tests interact through accessors:
      * Reset-NotificationState        — clears tracker + stats; used by tests
      * Set-AlertCooldownSeconds       — configures the cooldown window
      * Get-AlertCooldownSeconds       — read accessor (tests + diagnostics)
      * Get-LocalDetectionStats        — returns the live stats hashtable
      * Get-AlertCooldownTracker       — returns the live tracker hashtable
    Side effect: alert state is now initialised at module load, fixing a
    latent NullReferenceException in production where main.ps1 never seeded
    $Global:AlertCooldownTracker before first Invoke-PushAlert.
#>

# --- Module-private state (Phase 6.3) -----------------------------------
$script:BurntToastAvailable  = $null
$script:AlertCooldownTracker = @{}
$script:AlertCooldownSeconds = 60
$script:LocalDetectionStats  = @{ alerts_sent = 0 }

function Reset-NotificationState {
    <#
    .SYNOPSIS
        Resets cooldown tracker + alert counters. Used by Pester fixtures
        and operator-triggered diagnostic resets.
    #>
    $script:AlertCooldownTracker = @{}
    $script:LocalDetectionStats  = @{ alerts_sent = 0 }
    $script:BurntToastAvailable  = $null
}

function Set-AlertCooldownSeconds {
    param([Parameter(Mandatory)][int]$Seconds)
    if ($Seconds -lt 0) { throw "AlertCooldownSeconds must be >= 0" }
    $script:AlertCooldownSeconds = $Seconds
}

function Get-AlertCooldownSeconds { return $script:AlertCooldownSeconds }
function Get-AlertCooldownTracker { return $script:AlertCooldownTracker }
function Get-LocalDetectionStats  { return $script:LocalDetectionStats }

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
        if ($null -eq $script:BurntToastAvailable) {
            $script:BurntToastAvailable = $false
            try {
                if (Get-Module -ListAvailable -Name BurntToast -ErrorAction SilentlyContinue) {
                    Import-Module BurntToast -ErrorAction Stop
                    $script:BurntToastAvailable = $true
                    Write-Log "[TOAST] BurntToast module available and loaded" "DEBUG"
                }
            } catch {
                Write-Log "[TOAST] BurntToast module not loadable: $($_.Exception.Message)" "DEBUG"
            }
        }

        if ($script:BurntToastAvailable) {
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
    if ($script:AlertCooldownTracker.ContainsKey($cooldownKey)) {
        $lastAlert = $script:AlertCooldownTracker[$cooldownKey]
        $elapsed = ($now - $lastAlert).TotalSeconds
        if ($elapsed -lt $script:AlertCooldownSeconds) {
            Write-Log "[PUSH-ALERT] Cooldown active for '$AlertType' (${elapsed}s / $($script:AlertCooldownSeconds)s)" "DEBUG"
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
            $script:AlertCooldownTracker[$cooldownKey] = $now
            $script:LocalDetectionStats.alerts_sent++
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
