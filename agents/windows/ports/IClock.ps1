<#
.SYNOPSIS
    Port contract: IClock
.DESCRIPTION
    Abstracts time so use cases can be deterministically tested.
    Adapters MUST return UTC timestamps.

.CONTRACT
    $clock.UtcNow()         -> [DateTime] (UTC)
    $clock.UnixSeconds()    -> [long]
    $clock.IsoNow()         -> [string] ISO-8601
#>

function Assert-IClock {
    param([Parameter(Mandatory)]$Instance)
    foreach ($m in 'UtcNow','UnixSeconds','IsoNow') {
        if (-not ($Instance.PSObject.Methods.Name -contains $m)) {
            throw "IClock contract violation: missing method '$m'"
        }
    }
    return $Instance
}
