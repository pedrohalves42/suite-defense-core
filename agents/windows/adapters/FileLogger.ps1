<#
.SYNOPSIS
    ILogger adapter — file-backed structured logger.
.DESCRIPTION
    Phase 2 (ADR-002). Replaces Write-Host scattered through legacy
    modules with an injectable seam. Daily rotation, trace correlation,
    [Level] tagging. NEVER uses Write-Host (host writes are restricted
    to legacy Write-Log until Phase 4).
#>

function New-FileLogger {
    [CmdletBinding()]
    param(
        [string]$LogDir = "$env:ProgramData\CyberShield\Logs",
        [string]$TraceId = $null,
        [int]$MaxFileBytes = 10MB
    )

    if (-not (Test-Path $LogDir)) {
        New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    }

    $state = [PSCustomObject]@{
        LogDir       = $LogDir
        TraceId      = $TraceId
        MaxFileBytes = $MaxFileBytes
    }

    $write = {
        param($level, $message, $context)
        $logFile = Join-Path $this.LogDir "agent_$(Get-Date -Format 'yyyy-MM-dd').log"
        if ((Test-Path $logFile) -and ((Get-Item $logFile).Length -gt $this.MaxFileBytes)) {
            $rotated = "$logFile.$([DateTimeOffset]::UtcNow.ToUnixTimeSeconds())"
            try { Move-Item $logFile $rotated -Force -ErrorAction Stop } catch {}
        }
        $tid       = if ($this.TraceId) { $this.TraceId } else { '' }
        $tracePart = if ($tid) { " [trace:$tid]" } else { '' }
        $ctxPart   = ''
        if ($context -and $context.Count -gt 0) {
            try { $ctxPart = ' ' + ($context | ConvertTo-Json -Compress -Depth 4) } catch { $ctxPart = '' }
        }
        $line = "$([DateTime]::UtcNow.ToString('o')) [$level]$tracePart $message$ctxPart"
        try { Add-Content -Path $logFile -Value $line -Encoding UTF8 -ErrorAction Stop } catch {}
    }

    $state | Add-Member ScriptMethod Info    { param($m,$c=@{}) & $script:_flWrite -level 'INFO'    -message $m -context $c -ctx $this } -PassThru | Out-Null
    # Use closure-friendly inline implementation instead:
    $state | Add-Member ScriptMethod Info    -Force -Value { param($m,$c=@{}) & $write 'INFO'    $m $c } -PassThru:$false
    $state | Add-Member ScriptMethod Warn    -Force -Value { param($m,$c=@{}) & $write 'WARN'    $m $c }
    $state | Add-Member ScriptMethod Error   -Force -Value { param($m,$c=@{}) & $write 'ERROR'   $m $c }
    $state | Add-Member ScriptMethod Debug   -Force -Value { param($m,$c=@{}) & $write 'DEBUG'   $m $c }
    $state | Add-Member ScriptMethod Success -Force -Value { param($m,$c=@{}) & $write 'SUCCESS' $m $c }
    $state | Add-Member ScriptMethod WithTrace -Force -Value {
        param([string]$NewTraceId)
        return (New-FileLogger -LogDir $this.LogDir -TraceId $NewTraceId -MaxFileBytes $this.MaxFileBytes)
    }
    return $state
}
