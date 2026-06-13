<#
.SYNOPSIS
    Use case: poll the backend for pending jobs.
.DESCRIPTION
    Wraps /poll-jobs. Returns canonical JobDescriptor[] (validated,
    whitelisted). Server-driven poll_interval_seconds is captured
    onto Config.JobPollInterval (synced back to globals by the shim).
    Tracks Container.State.ConsecutivePollErrors so the loop can
    open the circuit breaker.
#>

function Invoke-PollJobsUseCase {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Container)

    $cfg   = $Container.Config
    $log   = $Container.Logger
    $http  = $Container.Http
    $state = $Container.State

    if (-not $http) { return @{ Success=$false; Jobs=@(); Error='IHttpClient not wired' } }

    $body = @{
        agent_name    = $cfg.AgentName
        agent_version = $cfg.AgentVersion
        timestamp     = $Container.Clock.IsoNow()
    }

    $resp = $http.Invoke(@{
        Path='/functions/v1/poll-jobs'; Method='POST'; Body=$body; TimeoutSec=15; MaxRetries=2
    })

    if (-not $resp.Success) {
        $state.ConsecutivePollErrors = ($state.ConsecutivePollErrors + 1)
        if ($log -and ($state.ConsecutivePollErrors % 10 -eq 1)) {
            $log.Warn('[UC:PollJobs] failed', @{ consecutive = $state.ConsecutivePollErrors; error = $resp.Error })
        }
        return @{ Success=$false; Jobs=@(); Error=$resp.Error; ConsecutiveErrors=$state.ConsecutivePollErrors }
    }

    $state.ConsecutivePollErrors = 0

    $raw = $null
    if ($resp.Content) { try { $raw = $resp.Content | ConvertFrom-Json } catch { $raw = $null } }
    $rawJobs = @()
    if ($raw -is [System.Array]) {
        $rawJobs = @($raw)
    } elseif ($raw -and $raw.PSObject.Properties['jobs']) {
        $rawJobs = @($raw.jobs)
        if ($raw.PSObject.Properties['poll_interval_seconds'] -and $raw.poll_interval_seconds -and [int]$raw.poll_interval_seconds -ge 10) {
            $newInterval = [int]$raw.poll_interval_seconds
            if ($newInterval -ne $cfg.JobPollInterval) {
                if ($log) { $log.Info('[UC:PollJobs] server-adjusted interval', @{ from=$cfg.JobPollInterval; to=$newInterval }) }
                $cfg.JobPollInterval = $newInterval
            }
        }
    }

    $jobs = New-Object System.Collections.Generic.List[object]
    foreach ($r in $rawJobs) {
        try   { $jobs.Add((New-JobDescriptor -Raw $r)) | Out-Null }
        catch { if ($log) { $log.Warn('[UC:PollJobs] discarded malformed job', @{ error=$_.Exception.Message }) } }
    }

    if ($jobs.Count -gt 0 -and $log) {
        $log.Info('[UC:PollJobs] received jobs', @{ count = $jobs.Count })
    }

    return @{ Success=$true; Jobs=@($jobs.ToArray()) }
}
