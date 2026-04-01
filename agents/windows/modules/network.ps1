<#
.SYNOPSIS
    CyberShield Agent v6.0 - Network & HTTP Module
.DESCRIPTION
    Secure HTTP requests with HMAC, TLS pinning, connectivity checks, DNS filtering.
    Depends on: utils.ps1, hmac.ps1
#>

function Test-TlsCertificatePin {
    param([string]$Thumbprint)
    if (-not $Global:TlsPinnedThumbprint) { return $true }
    return ($Thumbprint -eq $Global:TlsPinnedThumbprint)
}

function Invoke-SecureRequest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,
        
        [Parameter(Mandatory = $false)]
        [string]$Method = "GET",
        
        [Parameter(Mandatory = $false)]
        [object]$Body,
        
        [Parameter(Mandatory = $false)]
        [int]$MaxRetries = 5,
        
        [Parameter(Mandatory = $false)]
        [int]$TimeoutSec = 30
    )
    
    $url = if ($Path.StartsWith("http")) { $Path } else { "$($Global:ServerUrl)$Path" }
    $retryCount = 0
    $baseDelaySeconds = 1
    $maxDelaySeconds = 60
    
    while ($retryCount -lt $MaxRetries) {
        try {
            $headers = @{
                "User-Agent"    = "CyberShield-Agent/$Global:AgentVersion"
                "X-Agent-Token" = $Global:AgentToken
                "X-Agent-Name"  = $Global:AgentName
            }
            
            # FAIL-CLOSED: HMAC is mandatory for all requests
            if (-not $Global:HmacSecret) {
                Write-Log "[NETWORK] SECURITY: HmacSecret missing - blocking request (fail-closed)" "ERROR"
                return @{ Success = $false; Error = "HmacSecret required for authenticated requests"; StatusCode = 0 }
            }

            $bodyJson = if ($Body) { if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 } } else { "" }
            $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
            $nonce = [Guid]::NewGuid().ToString("N")
            $signaturePayload = "$timestamp.$nonce.$bodyJson"
            
            $hmac = if ($Global:CachedHmacKey) { $Global:CachedHmacKey } else {
                $h = New-Object System.Security.Cryptography.HMACSHA256
                $h.Key = [System.Text.Encoding]::UTF8.GetBytes($Global:HmacSecret)
                $Global:CachedHmacKey = $h
                $h
            }
            $signatureBytes = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($signaturePayload))
            $signature = [BitConverter]::ToString($signatureBytes).Replace("-", "").ToLower()
            
            $headers["X-HMAC-Signature"] = $signature
            $headers["X-HMAC-Timestamp"] = $timestamp
            $headers["X-HMAC-Nonce"]     = $nonce
            
            $params = @{
                Uri             = $url
                Method          = $Method
                Headers         = $headers
                TimeoutSec      = $TimeoutSec
                UseBasicParsing = $true
            }
            
            if ($Body) {
                $params.Body        = if ($Body -is [string]) { $Body } else { $Body | ConvertTo-Json -Compress -Depth 10 }
                $params.ContentType = "application/json; charset=utf-8"
            }
            
            $response = Invoke-WebRequest @params
            
            return @{
                Success    = $true
                StatusCode = $response.StatusCode
                Content    = $response.Content
                Headers    = $response.Headers
            }
            
        } catch {
            $retryCount++
            $errorMsg = $_.Exception.Message
            
            $isTransient = $errorMsg -match "timeout|connection|network|503|502|504|429"
            
            if ($retryCount -lt $MaxRetries -and $isTransient) {
                $delay = [math]::Min($baseDelaySeconds * [math]::Pow(2, $retryCount - 1), $maxDelaySeconds)
                Write-Log "[NETWORK] Request failed (attempt $retryCount/$MaxRetries), retrying in ${delay}s: $errorMsg" "WARN"
                Start-Sleep -Seconds $delay
            } else {
                if (-not $isTransient) {
                    Write-Log "[NETWORK] Permanent error, not retrying: $errorMsg" "ERROR"
                } else {
                    Write-Log "[NETWORK] All $MaxRetries retries exhausted: $errorMsg" "ERROR"
                }
                
                return @{
                    Success    = $false
                    Error      = $errorMsg
                    StatusCode = if ($_.Exception.Response) { [int]$_.Exception.Response.StatusCode } else { 0 }
                    Transient  = $isTransient
                }
            }
        }
    }
    
    return @{ Success = $false; Error = "Max retries exceeded" }
}

# Network connectivity cache
$Global:CachedNetworkOk = $false
$Global:CachedNetworkCheckTime = [datetime]::MinValue

function Test-NetworkConnectivity {
    try {
        $now = if ($Global:LoopTimestamp) { $Global:LoopTimestamp } else { Get-Date }
        if (($now - $Global:CachedNetworkCheckTime).TotalSeconds -lt 10) {
            return $Global:CachedNetworkOk
        }
        $uri = [System.Uri]::new($Global:ServerUrl)
        $tcpClient = New-Object System.Net.Sockets.TcpClient
        $asyncResult = $tcpClient.BeginConnect($uri.Host, 443, $null, $null)
        $wait = $asyncResult.AsyncWaitHandle.WaitOne(5000, $false)
        
        if ($wait -and $tcpClient.Connected) {
            $tcpClient.Close()
            $Global:CachedNetworkOk = $true
            $Global:CachedNetworkCheckTime = $now
            return $true
        }
        
        $tcpClient.Close()
        $Global:CachedNetworkOk = $false
        $Global:CachedNetworkCheckTime = $now
        return $false
        
    } catch {
        $Global:CachedNetworkOk = $false
        $Global:CachedNetworkCheckTime = if ($Global:LoopTimestamp) { $Global:LoopTimestamp } else { Get-Date }
        return $false
    }
}

function Sync-DnsBlocklist {
    try {
        $dnsBody = @{
            agent_name = $Global:AgentName
            timestamp  = [DateTime]::UtcNow.ToString("o")
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/serve-dns-filter" `
            -Method "POST" `
            -Body $dnsBody `
            -MaxRetries 2 `
            -TimeoutSec 15
        
        if (-not $result.Success) {
            $errMsg = if ($result.Error) { $result.Error } else { "Unknown" }
            if ($errMsg -match '403|Proibido|Forbidden') {
                Write-Log "[DNS] DNS Filter not enabled for this tenant (403)" "DEBUG"
                return $false
            }
            if ($errMsg -match '404|Not Found') {
                Write-Log "[DNS] DNS Filter endpoint not available (404)" "DEBUG"
                return $false
            }
            Write-Log "[DNS] DNS sync failed: $errMsg" "WARN"
            return $false
        }
        
        $response = $result.Content | ConvertFrom-Json
        
        if ($response.domains) {
            $response | ConvertTo-Json -Depth 5 | Out-File $Global:DnsBlocklistPath -Encoding UTF8
            Write-Log "[DNS] Synced $($response.domains.Count) blocked domains" "INFO"
            return $true
        }
        
        return $false
        
    } catch {
        $exMsg = $_.Exception.Message
        if ($exMsg -match '403|Proibido|Forbidden') {
            Write-Log "[DNS] DNS Filter disabled for tenant (403)" "DEBUG"
            return $false
        }
        if ($exMsg -match '404|Not Found') {
            Write-Log "[DNS] DNS Filter endpoint unavailable (404)" "DEBUG"
            return $false
        }
        Write-Log "[DNS] Error syncing blocklist: $exMsg" "WARN"
        return $false
    }
}

function Test-DnsBlock {
    param([string]$Domain)
    
    try {
        if (-not (Test-Path $Global:DnsBlocklistPath)) {
            return $false
        }
        
        $blocklist = Get-Content $Global:DnsBlocklistPath -Raw | ConvertFrom-Json
        
        foreach ($blocked in $blocklist.domains) {
            if ($Domain -like "*$blocked*") {
                return $true
            }
        }
        
        return $false
        
    } catch {
        return $false
    }
}
