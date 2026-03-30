<#
.SYNOPSIS
    Logging and general utility functions
#>

$script:LogDir = "$env:ProgramData\CyberShield\Logs"
$script:LogFile = $null

function Write-Log {
    param(
        [string]$Message,
        [string]$Level = "INFO"
    )

    if (-not $script:LogFile) {
        if (-not (Test-Path $script:LogDir)) {
            New-Item -ItemType Directory -Path $script:LogDir -Force | Out-Null
        }
        $script:LogFile = "$script:LogDir\agent_$(Get-Date -Format 'yyyy-MM-dd').log"
    }

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    "$timestamp [$Level] $Message" | Out-File -FilePath $script:LogFile -Append -Encoding UTF8

    switch ($Level) {
        "ERROR" { Write-Host "[ERROR] $Message" -ForegroundColor Red }
        "WARN"  { Write-Host "[WARN] $Message" -ForegroundColor Yellow }
        default { Write-Host "[INFO] $Message" -ForegroundColor Green }
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
        [hashtable]$Body = @{}
    )

    $url = "$($script:Config.ApiEndpoint)/$Endpoint"
    $headers = @{
        "Authorization" = "Bearer $($script:Config.AgentToken)"
        "Content-Type"  = "application/json"
        "X-Agent-Id"    = $script:Config.AgentId
    }

    # Add HMAC signature
    $bodyJson = if ($Body.Count -gt 0) { $Body | ConvertTo-Json -Depth 10 } else { "" }
    if ($bodyJson -and $script:Config.HmacSecret) {
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeSeconds().ToString()
        $signature = Compute-HMAC -Message "$timestamp.$bodyJson" -Secret $script:Config.HmacSecret
        $headers["X-HMAC-Signature"] = $signature
        $headers["X-HMAC-Timestamp"] = $timestamp
    }

    $params = @{
        Uri     = $url
        Method  = $Method
        Headers = $headers
        UseBasicParsing = $true
    }
    if ($bodyJson -and $Method -ne "GET") {
        $params["Body"] = $bodyJson
    }

    $response = Invoke-RestMethod @params
    return $response
}
