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
