<#
.SYNOPSIS
    Logging, retry with exponential backoff + jitter, tracing, and general utility functions
#>

$script:LogDir = "$env:ProgramData\CyberShield\Logs"
$script:LogFile = $null

function New-TraceId {
    <#
    .SYNOPSIS
        Generates a unique trace ID (UUID v4) for end-to-end request tracing.
        Propagated via X-Trace-ID header to correlate agent → backend → database.
    #>
    return [guid]::NewGuid().ToString()
}

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO",
        [string]$TraceId = $null
    )

    if (-not $script:LogFile) {
        if (-not (Test-Path $script:LogDir)) {
            New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null
        }
        $script:LogFile = "$script:LogDir\agent_$(Get-Date -Format 'yyyy-MM-dd').log"
    }

    $tid = if ($TraceId) { $TraceId } elseif ($script:CurrentTraceId) { $script:CurrentTraceId } else { "" }
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $tracePrefix = if ($tid) { " [trace:$tid]" } else { "" }
    "$timestamp [$Level]$tracePrefix $Message" | Out-File -FilePath $script:LogFile -Append -Encoding UTF8

    switch ($Level) {
        "ERROR" { Write-Host "[ERROR]$tracePrefix $Message" -ForegroundColor Red }
        "WARN"  { Write-Host "[WARN]$tracePrefix $Message" -ForegroundColor Yellow }
        default { Write-Host "[INFO]$tracePrefix $Message" -ForegroundColor Green }
    }
}

function Test-CommandExists {
    param([string]$Command)
    return $null -ne (Get-Command $Command -ErrorAction SilentlyContinue)
}

function Invoke-SecureApi {
    param(
        [string]$Endpoint,
        [string]$Method = "GET",
        [hashtable]$Body = @{},
        [int]$MaxRetries = 3,
        [int]$BaseDelayMs = 2000,
        [int]$MaxDelayMs = 30000
    )

    $url = "$($script:Config.ApiEndpoint)/$Endpoint"

    for ($attempt = 0; $attempt -le $MaxRetries; $attempt++) {
        try {
            # Generate or reuse trace ID for end-to-end correlation
            $traceId = if ($script:CurrentTraceId) { $script:CurrentTraceId } else { New-TraceId }

            $headers = @{
                "Authorization" = "Bearer $($script:Config.AgentToken)"
                "Content-Type"  = "application/json"
                "X-Agent-Id"    = $script:Config.AgentId
                "X-Trace-ID"    = $traceId
                "X-Request-ID"  = $traceId
            }

            # Build body JSON
            $bodyJson = if ($Body.Count -gt 0) { $Body | ConvertTo-Json -Depth 10 } else { "" }

            # Add HMAC signature with nonce (hex-encoded, aligned with Unix)
            if ($bodyJson -and $script:Config.HmacSecret) {
                $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
                $nonce = New-HmacNonce
                $hmacPayload = "$timestamp`:$nonce`:$bodyJson"
                $signature = Compute-HMAC -Message $hmacPayload -Secret $script:Config.HmacSecret
                $headers["X-HMAC-Signature"] = $signature
                $headers["X-HMAC-Timestamp"] = $timestamp
                $headers["X-HMAC-Nonce"]     = $nonce
            }

            $params = @{
                Uri             = $url
                Method          = $Method
                Headers         = $headers
                UseBasicParsing = $true
            }
            if ($bodyJson -and $Method -ne "GET") {
                $params["Body"] = $bodyJson
            }

            $response = Invoke-RestMethod @params
            return $response

        } catch {
            $statusCode = $null
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
            }

            # Don't retry on client errors (4xx) except 429 (rate limit)
            if ($statusCode -and $statusCode -ge 400 -and $statusCode -lt 500 -and $statusCode -ne 429) {
                Write-Log "API call failed with $statusCode (non-retryable): $_" -Level "ERROR"
                throw
            }

            if ($attempt -ge $MaxRetries) {
                Write-Log "API call failed after $($MaxRetries + 1) attempts: $_" -Level "ERROR"
                throw
            }

            # Exponential backoff with full jitter: delay = random(0, min(cap, base * 2^attempt))
            $exponentialDelay = [Math]::Min($MaxDelayMs, $BaseDelayMs * [Math]::Pow(2, $attempt))
            $jitteredDelay = Get-Random -Minimum 0 -Maximum ([int]$exponentialDelay)
            Write-Log "API call attempt $($attempt + 1) failed (status: $statusCode). Retrying in ${jitteredDelay}ms..." -Level "WARN"
            Start-Sleep -Milliseconds $jitteredDelay
        }
    }
}
