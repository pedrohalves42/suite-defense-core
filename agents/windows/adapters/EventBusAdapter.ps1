<#
.SYNOPSIS
    IEventBus adapter — in-process pub/sub.
.DESCRIPTION
    Phase 2 (ADR-002). Fire-and-forget: each handler runs inside a
    try/catch so a failing subscriber never blocks the publisher.
    Future Phase 3 may swap this for a queue-backed bus.
#>

function New-EventBusAdapter {
    param($Logger = $null)

    $state = [PSCustomObject]@{
        Subscribers = @{}
        Logger      = $Logger
    }

    $state | Add-Member ScriptMethod Subscribe -Value {
        param([string]$EventName, [scriptblock]$Handler)
        if (-not $this.Subscribers.ContainsKey($EventName)) {
            $this.Subscribers[$EventName] = New-Object System.Collections.ArrayList
        }
        [void]$this.Subscribers[$EventName].Add($Handler)
    }

    $state | Add-Member ScriptMethod Publish -Value {
        param([string]$EventName, $Payload)
        if (-not $this.Subscribers.ContainsKey($EventName)) { return }
        foreach ($h in $this.Subscribers[$EventName]) {
            try { & $h $Payload } catch {
                if ($this.Logger) {
                    try { $this.Logger.Warn("EventBus handler for '$EventName' threw: $($_.Exception.Message)") } catch {}
                }
            }
        }
    }

    $state | Add-Member ScriptMethod ClearAll -Value { $this.Subscribers = @{} }

    return $state
}
