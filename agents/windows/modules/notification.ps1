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
