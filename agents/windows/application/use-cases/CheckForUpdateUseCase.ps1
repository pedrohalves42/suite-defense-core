<#
.SYNOPSIS
    Use case: check for and stage an agent update (download-verify pattern).
.DESCRIPTION
    Pure orchestration:
      1. Call /serve-agent-update via IHttpClient.
      2. Compare versions via Test-ShouldUpdate.
      3. Persist new script atomically via IFileSystem.
      4. SHA-256 verify before signaling RestartRequested.

    Actual restart (Request-AgentRestart) stays in legacy update.ps1
    during Phase 3 — this use case only stages and signals.
#>

function Invoke-CheckForUpdateUseCase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Container,
        [string]$ScriptPath = $null
    )

    $cfg   = $Container.Config
    $log   = $Container.Logger
    $http  = $Container.Http
    $fs    = $Container.Fs
    $state = $Container.State

    if (-not $http) { return @{ Success=$false; Error='IHttpClient not wired' } }

    $resp = $http.Invoke(@{
        Path='/functions/v1/serve-agent-update'; Method='GET'; Timeout=60; MaxRetries=2
    })
    if (-not $resp.Success) {
        return @{ Success=$false; Error=$resp.Error; UpdateStaged=$false }
    }

    $body = $resp.Body
    if (-not $body -or -not $body.PSObject.Properties['latest_version']) {
        return @{ Success=$true; UpdateStaged=$false; Reason='no-version-in-response' }
    }

    $shouldUpdate = Test-ShouldUpdate -LocalVersion $cfg.AgentVersion -RemoteVersion $body.latest_version
    if (-not $shouldUpdate) {
        return @{ Success=$true; UpdateStaged=$false; Reason='up-to-date'; LatestVersion=$body.latest_version }
    }

    if (-not $body.PSObject.Properties['script_content'] -or -not $body.script_content) {
        return @{ Success=$false; UpdateStaged=$false; Error='response missing script_content' }
    }

    if (-not $ScriptPath) {
        $ScriptPath = Join-Path $cfg.BaseDir 'agent.ps1'
    }

    $tmp = "$ScriptPath.staged.$(Get-Random)"
    try {
        $fs.WriteText($tmp, [string]$body.script_content)

        if ($body.PSObject.Properties['script_hash'] -and $body.script_hash) {
            $bytes = [System.IO.File]::ReadAllBytes($tmp)
            if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
                $bytes = $bytes[3..($bytes.Length - 1)]
            }
            $sha = [System.Security.Cryptography.SHA256]::Create()
            try   { $actual = ([BitConverter]::ToString($sha.ComputeHash($bytes))).Replace('-','').ToLower() }
            finally { $sha.Dispose() }

            if ($actual -ne ([string]$body.script_hash).ToLower()) {
                $fs.Delete($tmp)
                if ($log) { $log.Error('[UC:CheckForUpdate] hash mismatch', @{ expected=$body.script_hash; actual=$actual }) }
                return @{ Success=$false; UpdateStaged=$false; Error='hash mismatch' }
            }
        }

        # Atomic swap
        $fs.AtomicReplace($ScriptPath, $tmp)
        $state.RestartRequested = $true

        if ($log) { $log.Info('[UC:CheckForUpdate] staged update', @{ version=$body.latest_version }) }
        return @{ Success=$true; UpdateStaged=$true; LatestVersion=$body.latest_version }
    }
    catch {
        try { $fs.Delete($tmp) } catch { }
        if ($log) { $log.Error('[UC:CheckForUpdate] failure', @{ error=$_.Exception.Message }) }
        return @{ Success=$false; UpdateStaged=$false; Error=$_.Exception.Message }
    }
}
