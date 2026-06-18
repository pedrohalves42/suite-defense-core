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
        Propagated via X-Trace-ID header to correlate agent -> backend -> database.
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

    # Console output only when running interactively. When the agent runs as a
    # Windows service Write-Host is swallowed (no host UI), so we route through
    # the hexagonal FileLogger if the container is wired, and silently skip
    # otherwise — the file sink above is always authoritative.
    if ($script:Agent -and $script:Agent.Logger) {
        try {
            switch ($Level) {
                "ERROR" { $script:Agent.Logger.Error($Message, @{ trace=$tid }); return }
                "WARN"  { $script:Agent.Logger.Warn($Message,  @{ trace=$tid }); return }
                default { $script:Agent.Logger.Info($Message,  @{ trace=$tid }); return }
            }
        } catch { }
    }

    if ([Environment]::UserInteractive -and $Host.Name -ne 'ServerRemoteHost') {
        switch ($Level) {
            "ERROR" { Write-Host "[ERROR]$tracePrefix $Message" -ForegroundColor Red }
            "WARN"  { Write-Host "[WARN]$tracePrefix $Message" -ForegroundColor Yellow }
            default { Write-Host "[INFO]$tracePrefix $Message" -ForegroundColor Green }
        }
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
        [int]$MaxDelayMs = 30000,
        [int]$TimeoutSec = 30
    )

    $url = "$($script:Config.ApiEndpoint)/$Endpoint"

    # B1 fix: generate ONE trace id per logical API call and reuse across all
    # retries so the backend can correlate the attempt chain. Restore the
    # caller's previous trace on exit to avoid leaking state into nested calls.
    $previousTraceId = $script:CurrentTraceId
    $traceId = if ($script:CurrentTraceId) { $script:CurrentTraceId } else { New-TraceId }
    $script:CurrentTraceId = $traceId

    try {
        for ($attempt = 0; $attempt -le $MaxRetries; $attempt++) {
            try {
                $headers = @{
                    "Authorization" = "Bearer $($script:Config.AgentToken)"
                    "Content-Type"  = "application/json"
                    "X-Agent-Id"    = $script:Config.AgentId
                    "X-Trace-ID"    = $traceId
                    "X-Request-ID"  = $traceId
                }

                # Build body JSON
                $bodyJson = if ($Body.Count -gt 0) { $Body | ConvertTo-Json -Depth 10 -Compress } else { "" }

                # Add HMAC signature with nonce (hex-encoded, aligned with Unix)
                if ($bodyJson -and $script:Config.HmacSecret) {
                    $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
                    $nonce = New-HmacNonce
                    $hmacPayload = "${timestamp}:${nonce}:${bodyJson}"
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
                    # B2 fix: cap the request so a hung TCP/TLS handshake cannot
                    # freeze the heartbeat loop indefinitely.
                    TimeoutSec      = $TimeoutSec
                }
                if ($bodyJson -and $Method -ne "GET") {
                    $params["Body"] = $bodyJson
                }

                return Invoke-RestMethod @params

            } catch {
                $statusCode = $null
                if ($_.Exception.Response) {
                    try { $statusCode = [int]$_.Exception.Response.StatusCode } catch { $statusCode = $null }
                }

                # Don't retry on client errors (4xx) except 429 (rate limit)
                if ($statusCode -and $statusCode -ge 400 -and $statusCode -lt 500 -and $statusCode -ne 429) {
                    Write-Log "API call failed with $statusCode (non-retryable): $_" -Level "ERROR" -TraceId $traceId
                    throw
                }

                if ($attempt -ge $MaxRetries) {
                    Write-Log "API call failed after $($MaxRetries + 1) attempts: $_" -Level "ERROR" -TraceId $traceId
                    throw
                }

                # Exponential backoff with full jitter: delay = random(0, min(cap, base * 2^attempt))
                # B3 fix: clamp Maximum to >=1 to avoid Get-Random throwing when delay
                # collapses to 0 (e.g. BaseDelayMs=0 in tests/dev overrides).
                $exponentialDelay = [Math]::Min($MaxDelayMs, $BaseDelayMs * [Math]::Pow(2, $attempt))
                $maxJitter = [Math]::Max(1, [int]$exponentialDelay)
                $jitteredDelay = Get-Random -Minimum 0 -Maximum $maxJitter
                Write-Log "API call attempt $($attempt + 1) failed (status: $statusCode). Retrying in ${jitteredDelay}ms..." -Level "WARN" -TraceId $traceId
                Start-Sleep -Milliseconds $jitteredDelay
            }
        }
    }
    finally {
        # Restore the previous trace context (nested calls / re-entry safety).
        $script:CurrentTraceId = $previousTraceId
    }
}

