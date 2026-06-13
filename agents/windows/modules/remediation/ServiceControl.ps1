<#
.SYNOPSIS
    Phase 4 split of remediation.ps1 — service control surface.
.DESCRIPTION
    Stop / Disable / Restart Service handlers and firewall/service-health
    checks. Protected-services parity is preserved (Stop, Disable AND
    Restart all consult $Global:ProtectedServices).
#>

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

        # Phase 4: protected-services parity — Restart now BLOCKS (was WARN-only).
        if ($Global:ProtectedServices -contains $serviceName) {
            Write-Log "[RESTART-SERVICE] BLOCKED: $serviceName is a protected service" "WARN"
            return @{ success = $false; error = "SECURITY_BLOCK: $serviceName is a protected system service"; blocked = $true; service_name = $serviceName }
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
        if ($Payload.enable_public)  { Set-NetFirewallProfile -Profile Public  -Enabled True -ErrorAction Stop; $results.public  = "enabled" }
        if ($Payload.enable_private) { Set-NetFirewallProfile -Profile Private -Enabled True -ErrorAction Stop; $results.private = "enabled" }
        if ($Payload.enable_domain)  { Set-NetFirewallProfile -Profile Domain  -Enabled True -ErrorAction Stop; $results.domain  = "enabled" }

        return @{ success = $true; changes = $results; applied_at = (Get-Date).ToString("o") }
    } catch {
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
