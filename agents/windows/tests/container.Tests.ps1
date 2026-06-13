BeforeAll {
    . "$PSScriptRoot\..\ports\IHttpClient.ps1"
    . "$PSScriptRoot\..\ports\ISecretStore.ps1"
    . "$PSScriptRoot\..\ports\ILogger.ps1"
    . "$PSScriptRoot\..\ports\IClock.ps1"
    . "$PSScriptRoot\..\ports\IFileSystem.ps1"
    . "$PSScriptRoot\..\ports\IEventBus.ps1"
    . "$PSScriptRoot\..\composition\Container.ps1"
    . "$PSScriptRoot\..\composition\CompatShims.ps1"
    . "$PSScriptRoot\helpers\Container-TestDouble.ps1"
}

Describe "New-AgentConfig" {
    It "applies defaults for unspecified fields" {
        $cfg = New-AgentConfig
        $cfg.AgentVersion | Should -Be '6.0.0'
        $cfg.PollInterval | Should -Be 60
        $cfg.JobPollInterval | Should -Be 30
    }

    It "normalizes ApiEndpoint trailing slash and /functions/v1 suffix" {
        $cfg = New-AgentConfig -Values @{ ApiEndpoint = 'https://api.example.com/functions/v1/' }
        $cfg.ServerUrl   | Should -Be 'https://api.example.com'
        $cfg.ApiEndpoint | Should -Be 'https://api.example.com/functions/v1'
    }

    It "derives ApiEndpoint when only base URL is provided" {
        $cfg = New-AgentConfig -Values @{ ApiEndpoint = 'https://api.example.com' }
        $cfg.ServerUrl   | Should -Be 'https://api.example.com'
        $cfg.ApiEndpoint | Should -Be 'https://api.example.com/functions/v1'
    }

    It "overrides defaults with caller values" {
        $cfg = New-AgentConfig -Values @{ PollInterval = 120; AgentName = 'host42' }
        $cfg.PollInterval | Should -Be 120
        $cfg.AgentName    | Should -Be 'host42'
    }
}

Describe "New-AgentContainer" {
    It "creates a container with default clock when none injected" {
        $c = New-AgentContainer
        $c.Clock        | Should -Not -BeNullOrEmpty
        $c.Clock.UtcNow() | Should -BeOfType ([DateTime])
        $c.State.CurrentState | Should -Be 'INITIALIZING'
    }

    It "honors injected adapters" {
        $fake = New-FakeAgentContainer
        $c = New-AgentContainer -Http $fake.Http -Logger $fake.Logger
        $c.Http   | Should -Be $fake.Http
        $c.Logger | Should -Be $fake.Logger
    }

    It "carries configuration into container" {
        $c = New-AgentContainer -Config @{ AgentName = 'unit-test'; PollInterval = 90 }
        $c.Config.AgentName    | Should -Be 'unit-test'
        $c.Config.PollInterval | Should -Be 90
    }
}

Describe "Port assertions" {
    It "Assert-IHttpClient accepts compliant fake" {
        $http = (New-FakeAgentContainer).Http
        { Assert-IHttpClient -Instance $http } | Should -Not -Throw
    }

    It "Assert-ILogger accepts compliant fake" {
        $log = (New-FakeAgentContainer).Logger
        { Assert-ILogger -Instance $log } | Should -Not -Throw
    }

    It "Assert-IClock rejects object missing UtcNow" {
        $bad = [PSCustomObject]@{}
        { Assert-IClock -Instance $bad } | Should -Throw -ExpectedMessage '*IClock*'
    }
}

Describe "Compat shims" {
    BeforeEach {
        # Clear allowlisted globals from prior tests
        foreach ($n in 'AgentName','AgentToken','HmacSecret','CurrentState','ConsecutivePollErrors') {
            if (Get-Variable -Name $n -Scope Global -ErrorAction SilentlyContinue) {
                Remove-Variable -Name $n -Scope Global -Force
            }
        }
    }

    It "Sync-ContainerToGlobals publishes container fields to Global scope" {
        $c = New-AgentContainer -Config @{
            AgentName  = 'host-A'
            AgentToken = 'tok-A'
            HmacSecret = 'sec-A'
        }
        Sync-ContainerToGlobals -Container $c
        $Global:AgentName  | Should -Be 'host-A'
        $Global:AgentToken | Should -Be 'tok-A'
        $Global:HmacSecret | Should -Be 'sec-A'
        $Global:CurrentState | Should -Be 'INITIALIZING'
    }

    It "Sync-GlobalsToContainer reflects legacy mutations back into container" {
        $c = New-AgentContainer
        $Global:CurrentState          = 'ENFORCING'
        $Global:ConsecutivePollErrors = 7
        Sync-GlobalsToContainer -Container $c
        $c.State.CurrentState          | Should -Be 'ENFORCING'
        $c.State.ConsecutivePollErrors | Should -Be 7
    }

    It "round-trips state without loss" {
        $c = New-AgentContainer
        $c.State.CurrentState = 'DEGRADED'
        $c.State.ConsecutivePollErrors = 3
        Sync-ContainerToGlobals -Container $c
        $c.State.CurrentState = 'reset'
        $c.State.ConsecutivePollErrors = 0
        Sync-GlobalsToContainer -Container $c
        $c.State.CurrentState          | Should -Be 'DEGRADED'
        $c.State.ConsecutivePollErrors | Should -Be 3
    }

    It "allowlist contains AgentVersion only" {
        $list = Get-GlobalAllowlist
        $list           | Should -Contain 'AgentVersion'
        $list.Count     | Should -Be 1
    }
}
