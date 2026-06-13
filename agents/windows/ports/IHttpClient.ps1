<#
.SYNOPSIS
    Port contract: IHttpClient
.DESCRIPTION
    Outbound HTTP gateway. The only seam through which the agent
    talks to the CyberShield backend. Adapters MUST honor:

      - TLS pinning (delegates to Test-TlsCertificatePin)
      - HMAC signing with X-HMAC-Signature / Timestamp / Nonce
      - Lowercase signature comparison (case-insensitive)
      - Exponential backoff + jitter on retryable failures
      - Trace ID propagation via X-Trace-ID

.CONTRACT
    $client.Invoke(@{
        Path        = '/functions/v1/heartbeat'
        Method      = 'POST'
        Body        = @{ ... }       # hashtable, will be JSON-serialized
        Headers     = @{ ... }       # optional, merged over defaults
        MaxRetries  = 3
        TimeoutSec  = 30
        TraceId     = '<uuid>'        # optional
    })

    Returns:
        @{
            Success    = $true/$false
            StatusCode = 200
            Content    = '<raw body>'
            Error      = '<msg>'      # only when Success=$false
            Transient  = $true/$false  # whether caller should retry
            TraceId    = '<uuid>'
        }
#>

function Assert-IHttpClient {
    param([Parameter(Mandatory)]$Instance)
    foreach ($m in 'Invoke') {
        if (-not ($Instance.PSObject.Methods.Name -contains $m)) {
            throw "IHttpClient contract violation: missing method '$m'"
        }
    }
    return $Instance
}
