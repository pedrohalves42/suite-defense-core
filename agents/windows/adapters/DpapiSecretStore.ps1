<#
.SYNOPSIS
    ISecretStore adapter — DPAPI-encrypted at rest.
.DESCRIPTION
    Phase 2 (ADR-002). Stores each secret as a separate
    .dpapi file under SecretsDir. CurrentUser scope by default,
    LocalMachine for service-account installs (SYSTEM).

    Falls back to an in-memory store on non-Windows test hosts
    so Pester suites can run cross-platform.
#>

function New-DpapiSecretStore {
    [CmdletBinding()]
    param(
        [string]$SecretsDir = "$env:ProgramData\CyberShield\secrets",
        [ValidateSet('CurrentUser','LocalMachine')]
        [string]$Scope = 'LocalMachine'
    )

    $isWindows = ($PSVersionTable.PSEdition -eq 'Desktop') -or ($env:OS -eq 'Windows_NT')
    if ($isWindows) {
        if (-not (Test-Path -LiteralPath $SecretsDir)) {
            New-Item -ItemType Directory -Path $SecretsDir -Force | Out-Null
        }
        try { Add-Type -AssemblyName System.Security -ErrorAction Stop } catch {}
    }

    $state = [PSCustomObject]@{
        Dir       = $SecretsDir
        Scope     = $Scope
        IsWindows = $isWindows
        Memory    = @{}   # used only on non-Windows fallback
    }

    $scopeEnum = {
        param($s)
        if ($s -eq 'CurrentUser') { [System.Security.Cryptography.DataProtectionScope]::CurrentUser }
        else                      { [System.Security.Cryptography.DataProtectionScope]::LocalMachine }
    }

    $state | Add-Member ScriptMethod Get -Value {
        param([string]$Name)
        if (-not $this.IsWindows) { return $this.Memory[$Name] }
        $path = Join-Path $this.Dir "$Name.dpapi"
        if (-not (Test-Path -LiteralPath $path)) { return $null }
        try {
            $cipher = [Convert]::FromBase64String((Get-Content -LiteralPath $path -Raw -ErrorAction Stop).Trim())
            $scope  = & $scopeEnum $this.Scope
            $plain  = [System.Security.Cryptography.ProtectedData]::Unprotect($cipher, $null, $scope)
            return [System.Text.Encoding]::UTF8.GetString($plain)
        } catch { return $null }
    }

    $state | Add-Member ScriptMethod Set -Value {
        param([string]$Name, [string]$Value)
        if (-not $this.IsWindows) { $this.Memory[$Name] = $Value; return }
        if (-not (Test-Path -LiteralPath $this.Dir)) {
            New-Item -ItemType Directory -Path $this.Dir -Force | Out-Null
        }
        $bytes  = [System.Text.Encoding]::UTF8.GetBytes($Value)
        $scope  = & $scopeEnum $this.Scope
        $cipher = [System.Security.Cryptography.ProtectedData]::Protect($bytes, $null, $scope)
        $b64    = [Convert]::ToBase64String($cipher)
        $path   = Join-Path $this.Dir "$Name.dpapi"
        $tmp    = "$path.tmp.$([Guid]::NewGuid().ToString('N'))"
        [System.IO.File]::WriteAllText($tmp, $b64, (New-Object System.Text.UTF8Encoding $false))
        Move-Item -LiteralPath $tmp -Destination $path -Force
    }

    $state | Add-Member ScriptMethod Delete -Value {
        param([string]$Name)
        if (-not $this.IsWindows) { $this.Memory.Remove($Name) | Out-Null; return }
        $path = Join-Path $this.Dir "$Name.dpapi"
        if (Test-Path -LiteralPath $path) { Remove-Item -LiteralPath $path -Force }
    }

    $state | Add-Member ScriptMethod List -Value {
        if (-not $this.IsWindows) { return @($this.Memory.Keys) }
        if (-not (Test-Path -LiteralPath $this.Dir)) { return @() }
        return @(Get-ChildItem -LiteralPath $this.Dir -Filter '*.dpapi' -File | ForEach-Object { $_.BaseName })
    }

    return $state
}
