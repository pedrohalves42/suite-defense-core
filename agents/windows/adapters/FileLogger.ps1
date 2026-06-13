<#
.SYNOPSIS
    ILogger adapter — file-backed structured logger.
.DESCRIPTION
    Phase 2 (ADR-002). Replaces Write-Host scattered through legacy
    modules with an injectable seam. Daily rotation, trace correlation,
    [Level] tagging. NEVER uses Write-Host.
#>

function _FileLogger_Write {
    param($self, [string]$Level, [string]$Message, $Context)
    try {
        if (-not (Test-Path -LiteralPath $self.LogDir)) {
            New-Item -ItemType Directory -Path $self.LogDir -Force | Out-Null
        }
        $logFile = Join-Path $self.LogDir "agent_$(Get-Date -Format 'yyyy-MM-dd').log"
        if ((Test-Path -LiteralPath $logFile) -and ((Get-Item -LiteralPath $logFile).Length -gt $self.MaxFileBytes)) {
            $rotated = "$logFile.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
            try { Move-Item -LiteralPath $logFile -Destination $rotated -Force -ErrorAction Stop } catch {}
        }
        $tid       = if ($self.TraceId) { $self.TraceId } else { '' }
        $tracePart = if ($tid) { " [trace:$tid]" } else { '' }
        $ctxPart   = ''
        if ($Context -and $Context.Count -gt 0) {
            try { $ctxPart = ' ' + ($Context | ConvertTo-Json -Compress -Depth 4) } catch {}
        }
        $line = "$([DateTime]::UtcNow.ToString('o')) [$Level]$tracePart $Message$ctxPart"
        Add-Content -LiteralPath $logFile -Value $line -Encoding UTF8 -ErrorAction Stop
    } catch {}
}

function New-FileLogger {
    [CmdletBinding()]
    param(
        [string]$LogDir = "$env:ProgramData\CyberShield\Logs",
        [string]$TraceId = $null,
        [int]$MaxFileBytes = 10485760  # 10 MB
    )

    if (-not (Test-Path -LiteralPath $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }

    $state = [PSCustomObject]@{
        LogDir       = $LogDir
        TraceId      = $TraceId
        MaxFileBytes = $MaxFileBytes
    }

    $state | Add-Member ScriptMethod Info    -Value { param($m,$c=@{}) _FileLogger_Write $this 'INFO'    $m $c }
    $state | Add-Member ScriptMethod Warn    -Value { param($m,$c=@{}) _FileLogger_Write $this 'WARN'    $m $c }
    $state | Add-Member ScriptMethod Error   -Value { param($m,$c=@{}) _FileLogger_Write $this 'ERROR'   $m $c }
    $state | Add-Member ScriptMethod Debug   -Value { param($m,$c=@{}) _FileLogger_Write $this 'DEBUG'   $m $c }
    $state | Add-Member ScriptMethod Success -Value { param($m,$c=@{}) _FileLogger_Write $this 'SUCCESS' $m $c }
    $state | Add-Member ScriptMethod WithTrace -Value {
        param([string]$NewTraceId)
        return (New-FileLogger -LogDir $this.LogDir -TraceId $NewTraceId -MaxFileBytes $this.MaxFileBytes)
    }
    return $state
}
