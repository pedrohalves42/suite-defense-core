<#
.SYNOPSIS
    Agent configuration and state persistence
#>

$script:BaseDir = "$env:ProgramData\CyberShield"
$script:DataDir = "$script:BaseDir\data"
$script:SecretsDir = "$script:BaseDir\secrets"
$script:TempDir = "$env:TEMP\CyberShield"

$script:Config = @{
    ApiEndpoint       = ""
    AgentId           = ""
    TenantId          = ""
    AgentToken        = ""
    HmacSecret        = ""
    HeartbeatInterval = 60
    ScriptPath        = "$script:BaseDir\agent.ps1"
    BackupPath        = "$script:BaseDir\agent.ps1.bak"
    MaxRetries        = 5
    RetryDelay        = 30
    WatchdogInterval  = 10
    Version           = "6.0.0"
}

function Initialize-Config {
    param(
        [string]$AgentToken,
        [string]$HmacSecret,
        [string]$ApiEndpoint
    )

    foreach ($dir in @($script:BaseDir, $script:DataDir, $script:SecretsDir, $script:TempDir)) {
        if (-not (Test-Path $dir)) {
            New-Item -ItemType Directory -Path $dir -Force | Out-Null
        }
    }

    # Load secrets from files (preferred) or params
    $script:Config.AgentToken = Get-SecretValue -Name "agent_token" -Fallback $AgentToken
    $script:Config.HmacSecret = Get-SecretValue -Name "hmac_secret" -Fallback $HmacSecret
    $script:Config.ApiEndpoint = if ($ApiEndpoint) { $ApiEndpoint } else { $env:CYBERSHIELD_API_ENDPOINT }
    $script:Config.AgentId = $env:CYBERSHIELD_AGENT_ID
    $script:Config.TenantId = $env:CYBERSHIELD_TENANT_ID
}

function Get-SecretValue {
    param(
        [string]$Name,
        [string]$Fallback
    )
    $filePath = "$script:SecretsDir\$Name"
    if (Test-Path $filePath) {
        return (Get-Content $filePath -Raw -Encoding UTF8).Trim()
    }
    return $Fallback
}

function Import-PersistedState {
    $stateFile = "$script:DataDir\state.json"
    if (Test-Path $stateFile) {
        try {
            $state = Get-Content $stateFile -Raw | ConvertFrom-Json
            $Global:BootScriptHash = $state.boot_hash
        }
        catch {
            Write-Log "Failed to load persisted state: $($_.Exception.Message)" "WARN"
        }
    }
}

function Export-PersistedState {
    $stateFile = "$script:DataDir\state.json"
    $state = @{
        boot_hash   = $Global:BootScriptHash
        last_update = (Get-Date -Format "o")
        version     = $script:Config.Version
    }
    $state | ConvertTo-Json | Out-File $stateFile -Encoding UTF8 -Force
}
