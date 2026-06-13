<#
.SYNOPSIS
    Port contract: ILogger
.DESCRIPTION
    Structured logging with trace correlation. Adapters MUST NOT
    use Write-Host. File adapters MUST rotate daily and tag every
    line with [Level] and [trace:<id>] when available.

.CONTRACT
    $log.Info([string]$Message, [hashtable]$Context = @{})
    $log.Warn([string]$Message, [hashtable]$Context = @{})
    $log.Error([string]$Message, [hashtable]$Context = @{})
    $log.Debug([string]$Message, [hashtable]$Context = @{})
    $log.Success([string]$Message, [hashtable]$Context = @{})
    $log.WithTrace([string]$TraceId)   -> ILogger (returns scoped logger)
#>

function Assert-ILogger {
    param([Parameter(Mandatory)]$Instance)
    foreach ($m in 'Info','Warn','Error','Debug','Success') {
        if (-not ($Instance.PSObject.Methods.Name -contains $m)) {
            throw "ILogger contract violation: missing method '$m'"
        }
    }
    return $Instance
}
