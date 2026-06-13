<#
.SYNOPSIS
    IHttpClient adapter — TLS-pinned, HMAC-signed, retry-aware.
.DESCRIPTION
    Phase 2 (ADR-002). The single seam through which the agent
    speaks to the CyberShield backend. Wraps Invoke-WebRequest with:

      * ACTIVE TLS pinning via ServerCertificateValidationCallback
        (rejects connection if thumbprint mismatch). Phase 1 only
        had a passive helper; this adapter enforces.
      * HMAC-SHA256 over "timestamp.nonce.body" (lowercase hex).
      * Exponential backoff with full jitter on transient failures
        (timeout, 5xx, 429).
      * Trace ID propagation (X-Trace-ID / X-Request-ID).
      * Returns a uniform result hashtable (Success/StatusCode/
        Content/Error/Transient/TraceId).

    Reads credentials from $Container.Config so rotation in
    Sync-GlobalsToContainer is picked up automatically.
#>

function New-HttpClientAdapter {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Config,
        $Logger = $null,
        $Clock  = $null
    )

    $state = [PSCustomObject]@{
        Config        = $Config
        Logger        = $Logger
        Clock         = $Clock
        CachedHmac    = $null
        CachedHmacKey = $null
    }

    $state | Add-Member ScriptMethod _GetHmac -Value {
        if ($null -ne $this.CachedHmac -and $this.CachedHmacKey -eq $this.Config.HmacSecret) {
            return $this.CachedHmac
        }
        if (-not $this.Config.HmacSecret) { return $null }
        $h = New-Object System.Security.Cryptography.HMACSHA256
        $h.Key = [System.Text.Encoding]::UTF8.GetBytes($this.Config.HmacSecret)
        $this.CachedHmac    = $h
        $this.CachedHmacKey = $this.Config.HmacSecret
        return $h
    }

    $state | Add-Member ScriptMethod _InstallTlsPinning -Value {
        # Active TLS pinning. Idempotent: replaces any prior callback we set.
        $pin = $this.Config.TlsPinnedThumbprint
        if (-not $pin) {
            [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $null
            return
        }
        $normalized = ($pin -replace '\s','').ToUpperInvariant()
        # Capture into closure
        $cb = [System.Net.Security.RemoteCertificateValidationCallback]{
            param($sender, $cert, $chain, $errors)
            if (-not $cert) { return $false }
            try {
                $thumb = ($cert.GetCertHashString()).ToUpperInvariant()
                return ($thumb -eq $normalized)
            } catch { return $false }
        }
        [System.Net.ServicePointManager]::ServerCertificateValidationCallback = $cb
        [System.Net.ServicePointManager]::SecurityProtocol = `
            [System.Net.SecurityProtocolType]::Tls12 -bor [System.Net.SecurityProtocolType]::Tls13
    }

    $state | Add-Member ScriptMethod Invoke -Value {
        param([hashtable]$Request)

        $path        = $Request.Path
        $method      = if ($Request.Method)     { $Request.Method }     else { 'GET' }
        $body        = $Request.Body
        $maxRetries  = if ($Request.MaxRetries) { [int]$Request.MaxRetries } else { 3 }
        $timeoutSec  = if ($Request.TimeoutSec) { [int]$Request.TimeoutSec } else { 30 }
        $extraHdrs   = if ($Request.Headers)    { $Request.Headers }    else { @{} }
        $traceId     = if ($Request.TraceId)    { $Request.TraceId }    else { [guid]::NewGuid().ToString() }

        # Fail-closed: HMAC is mandatory
        if (-not $this.Config.HmacSecret) {
            if ($this.Logger) { $this.Logger.Error('HMAC secret missing — request blocked (fail-closed)', @{ trace = $traceId }) }
            return @{ Success=$false; StatusCode=0; Error='HmacSecret required'; Transient=$false; TraceId=$traceId }
        }

        # Resolve URL
        $url = if ($path -match '^https?://') {
            $path
        } else {
            $base = $this.Config.ServerUrl
            if (-not $base) { return @{ Success=$false; StatusCode=0; Error='ServerUrl not configured'; Transient=$false; TraceId=$traceId } }
            "$base$path"
        }

        # Pin TLS just-in-time so rotated pins take effect
        try { $this._InstallTlsPinning() } catch {}

        $bodyJson = ''
        if ($null -ne $body) {
            $bodyJson = if ($body -is [string]) { $body } else { $body | ConvertTo-Json -Compress -Depth 10 }
        }

        $tsFn    = if ($this.Clock) { { $this.Clock.UnixSeconds() } } else { { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() } }
        $attempt = 0
        $baseDelayMs = 500
        $maxDelayMs  = 60000

        while ($attempt -le $maxRetries) {
            try {
                $ts        = (& $tsFn).ToString()
                $nonce     = [guid]::NewGuid().ToString('N')
                $payload   = "$ts.$nonce.$bodyJson"
                $hmac      = $this._GetHmac()
                $sigBytes  = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($payload))
                $signature = ([BitConverter]::ToString($sigBytes)).Replace('-', '').ToLower()

                $headers = @{
                    'User-Agent'        = "CyberShield-Agent/$($this.Config.AgentVersion)"
                    'X-Agent-Token'     = $this.Config.AgentToken
                    'X-Agent-Name'      = $this.Config.AgentName
                    'Authorization'     = "Bearer $($this.Config.AgentToken)"
                    'X-HMAC-Signature'  = $signature
                    'X-HMAC-Timestamp'  = $ts
                    'X-HMAC-Nonce'      = $nonce
                    'X-Trace-ID'        = $traceId
                    'X-Request-ID'      = $traceId
                }
                foreach ($k in $extraHdrs.Keys) { $headers[$k] = $extraHdrs[$k] }

                $params = @{
                    Uri             = $url
                    Method          = $method
                    Headers         = $headers
                    TimeoutSec      = $timeoutSec
                    UseBasicParsing = $true
                }
                if ($bodyJson) {
                    $params.Body        = $bodyJson
                    $params.ContentType = 'application/json; charset=utf-8'
                }

                $response = Invoke-WebRequest @params
                return @{
                    Success    = $true
                    StatusCode = [int]$response.StatusCode
                    Content    = $response.Content
                    Headers    = $response.Headers
                    TraceId    = $traceId
                }
            } catch {
                $msg    = $_.Exception.Message
                $status = 0
                if ($_.Exception.Response) { try { $status = [int]$_.Exception.Response.StatusCode } catch {} }
                $transient = ($msg -match 'timeout|connection|network') -or ($status -in 429,502,503,504)

                $attempt++
                if ($attempt -gt $maxRetries -or -not $transient) {
                    if ($this.Logger) {
                        $lvl = if ($transient) { 'Error' } else { 'Warn' }
                        $this.Logger.$lvl("HTTP $method $url failed: $msg", @{ trace=$traceId; status=$status; attempt=$attempt })
                    }
                    return @{
                        Success    = $false
                        StatusCode = $status
                        Error      = $msg
                        Transient  = $transient
                        TraceId    = $traceId
                    }
                }
                $cap   = [Math]::Min($maxDelayMs, $baseDelayMs * [Math]::Pow(2, $attempt - 1))
                $delay = Get-Random -Minimum 0 -Maximum ([int]$cap)
                if ($this.Logger) { $this.Logger.Warn("HTTP retry $attempt/$maxRetries in ${delay}ms: $msg", @{ trace=$traceId; status=$status }) }
                Start-Sleep -Milliseconds $delay
            }
        }
        return @{ Success=$false; StatusCode=0; Error='Max retries exceeded'; Transient=$true; TraceId=$traceId }
    }

    return $state
}
