<#
.SYNOPSIS
    Phase 2 adapter wiring — composes real adapters into the container.
.DESCRIPTION
    Sourced by main.ps1 after Container.ps1 and CompatShims.ps1.
    Call Initialize-AgentAdapters with the container produced by
    New-AgentContainer; it constructs real adapters using config
    values and attaches them so use cases (Phase 3) can resolve
    them from $script:Agent.

    Safe to call multiple times: each call replaces prior instances.
#>

. "$PSScriptRoot\..\adapters\ClockAdapter.ps1"
. "$PSScriptRoot\..\adapters\FileLogger.ps1"
. "$PSScriptRoot\..\adapters\FileSystemAdapter.ps1"
. "$PSScriptRoot\..\adapters\EventBusAdapter.ps1"
. "$PSScriptRoot\..\adapters\DpapiSecretStore.ps1"
. "$PSScriptRoot\..\adapters\HttpClientAdapter.ps1"
. "$PSScriptRoot\..\adapters\WindowsServiceAdapter.ps1"
. "$PSScriptRoot\..\adapters\HostsFileAdapter.ps1"

function Initialize-AgentAdapters {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Container)

    $cfg = $Container.Config

    $clock  = New-ClockAdapter
    $logger = New-FileLogger     -LogDir $cfg.LogDir
    $fs     = New-FileSystemAdapter
    $bus    = New-EventBusAdapter -Logger $logger
    $sec    = New-DpapiSecretStore -SecretsDir $cfg.SecretsDir -Scope 'LocalMachine'
    $http   = New-HttpClientAdapter -Config $cfg -Logger $logger -Clock $clock

    # Contract assertions — fail fast on shape violations
    Assert-IClock      -Instance $clock      | Out-Null
    Assert-ILogger     -Instance $logger     | Out-Null
    Assert-IFileSystem -Instance $fs         | Out-Null
    Assert-IEventBus   -Instance $bus        | Out-Null
    Assert-ISecretStore -Instance $sec       | Out-Null
    Assert-IHttpClient -Instance $http       | Out-Null

    $Container.Clock    = $clock
    $Container.Logger   = $logger
    $Container.Fs       = $fs
    $Container.EventBus = $bus
    $Container.Secrets  = $sec
    $Container.Http     = $http

    # Windows-specific extras (not formal ports yet — see ADR-002 Phase 2)
    $Container | Add-Member NoteProperty Services  (New-WindowsServiceAdapter -Logger $logger) -Force
    $Container | Add-Member NoteProperty HostsFile (New-HostsFileAdapter      -Logger $logger -Fs $fs) -Force

    return $Container
}
