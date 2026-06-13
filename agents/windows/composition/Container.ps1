<#
.SYNOPSIS
    Manual dependency injection container for the CyberShield agent.
.DESCRIPTION
    Phase 1 of the hexagonal refactor (ADR-002). Builds the
    object graph in one place so use cases receive their
    dependencies explicitly instead of reaching for $Global:*.

    During Phase 1 the container coexists with legacy globals;
    Sync-ContainerToGlobals (in CompatShims.ps1) keeps both
    representations aligned until Phase 4 removes the globals.

.USAGE
    . "$PSScriptRoot\..\ports\IHttpClient.ps1"
    . "$PSScriptRoot\..\ports\ISecretStore.ps1"
    . "$PSScriptRoot\..\ports\ILogger.ps1"
    . "$PSScriptRoot\..\ports\IClock.ps1"
    . "$PSScriptRoot\..\ports\IFileSystem.ps1"
    . "$PSScriptRoot\..\ports\IEventBus.ps1"
    . "$PSScriptRoot\Container.ps1"

    $agent = New-AgentContainer -Config @{
        AgentName     = 'host01'
        AgentVersion  = '6.0.0'
        ApiEndpoint   = 'https://api.cybershield.io/functions/v1'
        AgentToken    = $token
        HmacSecret    = $secret
    }

    # Inject into a use case:
    $heartbeatUC = New-SendHeartbeatUseCase -Container $agent
    $heartbeatUC.Execute()
#>

function New-AgentConfig {
    param([hashtable]$Values = @{})
    $defaults = @{
        AgentName            = $env:COMPUTERNAME
        AgentVersion         = '6.0.0'
        AgentId              = $env:CYBERSHIELD_AGENT_ID
        TenantId             = $env:CYBERSHIELD_TENANT_ID
        ApiEndpoint          = $null
        ServerUrl            = $null
        AgentToken           = $null
        HmacSecret           = $null
        PollInterval         = 60
        JobPollInterval      = 30
        TlsPinnedThumbprint  = $null
        BaseDir              = "$env:ProgramData\CyberShield"
        DataDir              = "$env:ProgramData\CyberShield\data"
        SecretsDir           = "$env:ProgramData\CyberShield\secrets"
        LogDir               = "$env:ProgramData\CyberShield\Logs"
        StatePath            = "$env:ProgramData\CyberShield\data\agent_state.json"
        EvidenceJournalPath  = "$env:ProgramData\CyberShield\data\evidence_journal.jsonl"
        DnsBlocklistPath     = "$env:ProgramData\CyberShield\data\dns_blocklist.json"
    }
    foreach ($k in $Values.Keys) { $defaults[$k] = $Values[$k] }

    # URL normalization (preserves existing behavior in config.ps1)
    if ($defaults.ApiEndpoint) {
        $defaults.ServerUrl   = $defaults.ApiEndpoint.TrimEnd('/') -replace '/functions/v1$', ''
        $defaults.ApiEndpoint = "$($defaults.ServerUrl)/functions/v1"
    }
    return [PSCustomObject]$defaults
}

function New-AgentContainer {
    [CmdletBinding()]
    param(
        [hashtable]$Config = @{},

        # Allow caller to inject custom adapters (tests, alt implementations)
        $Http     = $null,
        $Secrets  = $null,
        $Logger   = $null,
        $Clock    = $null,
        $Fs       = $null,
        $EventBus = $null
    )

    $cfg = New-AgentConfig -Values $Config

    # Lazy default adapters — Phase 1 ships in-memory/identity ones
    # so the container is usable in tests immediately. Phase 2
    # replaces these with real HttpClientAdapter, DpapiSecretStore,
    # FileLogger, etc.
    if (-not $Clock) { $Clock = New-DefaultClock }

    return [PSCustomObject]@{
        Config   = $cfg
        Http     = $Http
        Secrets  = $Secrets
        Logger   = $Logger
        Clock    = $Clock
        Fs       = $Fs
        EventBus = $EventBus
        # State bucket — explicit, replaces ad-hoc $Global:* mutation
        State    = [PSCustomObject]@{
            CurrentState              = 'INITIALIZING'
            BootScriptHash            = $null
            UpdateInProgress          = $false
            ConsecutivePollErrors     = 0
            RestartRequested          = $false
            LoopTimestamp             = $null
        }
    }
}

function New-DefaultClock {
    $obj = [PSCustomObject]@{}
    $obj | Add-Member -MemberType ScriptMethod -Name UtcNow      -Value { [DateTime]::UtcNow }
    $obj | Add-Member -MemberType ScriptMethod -Name UnixSeconds -Value { [DateTimeOffset]::UtcNow.ToUnixTimeSeconds() }
    $obj | Add-Member -MemberType ScriptMethod -Name IsoNow      -Value { [DateTime]::UtcNow.ToString('o') }
    return $obj
}
