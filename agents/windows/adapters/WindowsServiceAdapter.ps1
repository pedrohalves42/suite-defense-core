<#
.SYNOPSIS
    Adapter for Windows service control with parity protection.
.DESCRIPTION
    Phase 2 (ADR-002). Wraps Get-Service / Stop-Service / Start-Service
    / Set-Service behind a port-shaped interface. Critical OS services
    are protected from disable/stop to prevent a remediation script
    from bricking the host.

    Not a formal port yet (no IWindowsServiceController.ps1) because
    the contract is Windows-specific; introduced here so remediation.ps1
    can be migrated incrementally in Phase 3.
#>

function New-WindowsServiceAdapter {
    param($Logger = $null)

    $state = [PSCustomObject]@{
        Logger    = $Logger
        Protected = @(
            'WinDefend','MpsSvc','BFE','Dnscache','RpcSs','RpcEptMapper',
            'LSM','EventLog','Schedule','CryptSvc','Winmgmt','LanmanWorkstation'
        )
    }

    $state | Add-Member ScriptMethod IsProtected -Value {
        param([string]$Name)
        return ($this.Protected -contains $Name)
    }

    $state | Add-Member ScriptMethod Get -Value {
        param([string]$Name)
        try { return (Get-Service -Name $Name -ErrorAction Stop) } catch { return $null }
    }

    $state | Add-Member ScriptMethod Stop -Value {
        param([string]$Name)
        if ($this.IsProtected($Name)) {
            if ($this.Logger) { $this.Logger.Warn("Refused to stop protected service: $Name") }
            return $false
        }
        try { Stop-Service -Name $Name -Force -ErrorAction Stop; return $true } catch {
            if ($this.Logger) { $this.Logger.Error("Stop-Service $Name failed: $($_.Exception.Message)") }
            return $false
        }
    }

    $state | Add-Member ScriptMethod Start -Value {
        param([string]$Name)
        try { Start-Service -Name $Name -ErrorAction Stop; return $true } catch {
            if ($this.Logger) { $this.Logger.Error("Start-Service $Name failed: $($_.Exception.Message)") }
            return $false
        }
    }

    $state | Add-Member ScriptMethod SetStartupType -Value {
        param([string]$Name, [string]$StartupType)
        if ($this.IsProtected($Name) -and $StartupType -in 'Disabled','Manual') {
            if ($this.Logger) { $this.Logger.Warn("Refused to weaken startup of protected service $Name -> $StartupType") }
            return $false
        }
        try { Set-Service -Name $Name -StartupType $StartupType -ErrorAction Stop; return $true } catch {
            if ($this.Logger) { $this.Logger.Error("Set-Service $Name failed: $($_.Exception.Message)") }
            return $false
        }
    }

    return $state
}
