<#
.SYNOPSIS
    Use case: send a heartbeat to the backend and react to server-driven config.
.DESCRIPTION
    Composes IHttpClient + IClock + ILogger + IEventBus. Pure: receives
    a container, returns a structured result; does not touch $Global:*.

    Result shape:
        @{ Success=$bool; Response=<object>; UpdateAvailable=$bool;
           IntervalChanged=$bool; NewInterval=<int|null>; Error=<string|null> }
#>

function Invoke-SendHeartbeatUseCase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Container,
        [hashtable]$Telemetry      = @{},
        [object[]] $SecurityEvents = @()
    )

    $cfg    = $Container.Config
    $log    = $Container.Logger
    $http   = $Container.Http
    $clock  = $Container.Clock
    $bus    = $Container.EventBus

    if (-not $http)  { return @{ Success=$false; Error='IHttpClient not wired' } }

    $payload = New-HeartbeatPayload `
        -AgentName    $cfg.AgentName `
        -AgentVersion $cfg.AgentVersion `
        -Telemetry    $Telemetry `
        -SecurityEvents $SecurityEvents `
        -TimestampIso ($clock.IsoNow())

    if ($log) { $log.Info('[UC:Heartbeat] sending', @{ events = @($SecurityEvents).Count }) }

    $resp = $http.Invoke(@{
        Path       = '/functions/v1/heartbeat'
        Method     = 'POST'
        Body       = $payload
        TimeoutSec = 30
        MaxRetries = 2
    })

    if (-not $resp.Success) {
        if ($log) { $log.Warn('[UC:Heartbeat] failed', @{ error = $resp.Error; transient = $resp.Transient }) }
        return @{ Success=$false; Error=$resp.Error; Transient=$resp.Transient }
    }

    $body = $null
    if ($resp.Content) { try { $body = $resp.Content | ConvertFrom-Json } catch { $body = $null } }
    $result = @{
        Success         = $true
        Response        = $body
        UpdateAvailable = $false
        IntervalChanged = $false
        NewInterval     = $null
    }

    if ($body -and $body.PSObject.Properties['heartbeat_interval_seconds']) {
        $new = [int]$body.heartbeat_interval_seconds
        if ($new -ge 10 -and $new -ne $cfg.PollInterval) {
            $result.IntervalChanged = $true
            $result.NewInterval     = $new
            $cfg.PollInterval       = $new
            if ($bus) { $bus.Publish('heartbeat.interval.changed', @{ from = $cfg.PollInterval; to = $new }) }
        }
    }

    if ($body -and $body.PSObject.Properties['update_available'] -and $body.update_available) {
        $result.UpdateAvailable = $true
        if ($bus) { $bus.Publish('heartbeat.update.available', @{ version = $body.latest_version }) }
    }

    return $result
}
