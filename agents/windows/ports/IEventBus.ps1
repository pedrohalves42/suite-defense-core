<#
.SYNOPSIS
    Port contract: IEventBus
.DESCRIPTION
    In-process event publication for telemetry and observability.
    Use cases publish; adapters subscribe (e.g. telemetry uploader,
    metrics counter). MUST be fire-and-forget — subscribers cannot
    block the publisher.

.CONTRACT
    $bus.Publish([string]$EventName, [object]$Payload)
    $bus.Subscribe([string]$EventName, [scriptblock]$Handler)
#>

function Assert-IEventBus {
    param([Parameter(Mandatory)]$Instance)
    foreach ($m in 'Publish','Subscribe') {
        if (-not ($Instance.PSObject.Methods.Name -contains $m)) {
            throw "IEventBus contract violation: missing method '$m'"
        }
    }
    return $Instance
}
