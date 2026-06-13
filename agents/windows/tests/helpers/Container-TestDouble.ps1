<#
.SYNOPSIS
    Test doubles for the hexagonal agent container.
.DESCRIPTION
    Provides in-memory fakes for every output port so use cases
    can be exercised without network, disk, registry, or DPAPI.

    Usage in a Pester test:

        . "$PSScriptRoot\..\helpers\Container-TestDouble.ps1"
        $container = New-FakeAgentContainer
        $container.Http.EnqueueResponse(@{ Success = $true; Content = '{}' })
        # ... invoke use case ...
        $container.Http.Calls | Should -HaveCount 1
#>

function New-FakeHttpClient {
    $state = [PSCustomObject]@{
        Queue = New-Object System.Collections.Queue
        Calls = New-Object System.Collections.ArrayList
    }
    $state | Add-Member -MemberType ScriptMethod -Name EnqueueResponse -Value {
        param($response) $this.Queue.Enqueue($response)
    }
    $state | Add-Member -MemberType ScriptMethod -Name Invoke -Value {
        param([string]$Path, [string]$Method, [object]$Body, [hashtable]$Headers)
        [void]$this.Calls.Add([PSCustomObject]@{
            Path = $Path; Method = $Method; Body = $Body; Headers = $Headers
            At = [DateTime]::UtcNow
        })
        if ($this.Queue.Count -gt 0) { return $this.Queue.Dequeue() }
        return @{ Success = $true; StatusCode = 200; Content = '{}' }
    }
    return $state
}

function New-FakeSecretStore {
    $store = @{}
    $obj = [PSCustomObject]@{ Store = $store }
    $obj | Add-Member -MemberType ScriptMethod -Name Get -Value {
        param([string]$Name) return $this.Store[$Name]
    }
    $obj | Add-Member -MemberType ScriptMethod -Name Set -Value {
        param([string]$Name, [string]$Value) $this.Store[$Name] = $Value
    }
    return $obj
}

function New-FakeLogger {
    $entries = New-Object System.Collections.ArrayList
    $obj = [PSCustomObject]@{ Entries = $entries }
    foreach ($lvl in 'Info','Warn','Error','Debug','Success') {
        $obj | Add-Member -MemberType ScriptMethod -Name $lvl -Value ([scriptblock]::Create(@"
            param([string]`$Message)
            [void]`$this.Entries.Add([PSCustomObject]@{ Level='$lvl'; Message=`$Message; At=[DateTime]::UtcNow })
"@))
    }
    $obj | Add-Member -MemberType ScriptMethod -Name HasMessage -Value {
        param([string]$Pattern)
        return ($this.Entries | Where-Object { $_.Message -match $Pattern }).Count -gt 0
    }
    return $obj
}

function New-FakeClock {
    param([DateTime]$Start = [DateTime]::UtcNow)
    $obj = [PSCustomObject]@{ Now = $Start }
    $obj | Add-Member -MemberType ScriptMethod -Name UtcNow -Value { return $this.Now }
    $obj | Add-Member -MemberType ScriptMethod -Name Advance -Value {
        param([TimeSpan]$By) $this.Now = $this.Now.Add($By)
    }
    return $obj
}

function New-FakeFileSystem {
    $files = @{}
    $obj = [PSCustomObject]@{ Files = $files; Writes = (New-Object System.Collections.ArrayList) }
    $obj | Add-Member -MemberType ScriptMethod -Name Read -Value {
        param([string]$Path) return $this.Files[$Path]
    }
    $obj | Add-Member -MemberType ScriptMethod -Name Write -Value {
        param([string]$Path, [string]$Content)
        $this.Files[$Path] = $Content
        [void]$this.Writes.Add([PSCustomObject]@{ Path=$Path; Content=$Content; At=[DateTime]::UtcNow })
    }
    $obj | Add-Member -MemberType ScriptMethod -Name Exists -Value {
        param([string]$Path) return $this.Files.ContainsKey($Path)
    }
    return $obj
}

function New-FakeEventBus {
    $events = New-Object System.Collections.ArrayList
    $obj = [PSCustomObject]@{ Events = $events }
    $obj | Add-Member -MemberType ScriptMethod -Name Publish -Value {
        param([string]$Name, [object]$Payload)
        [void]$this.Events.Add([PSCustomObject]@{ Name=$Name; Payload=$Payload; At=[DateTime]::UtcNow })
    }
    return $obj
}

function New-FakeAgentContainer {
    param(
        [hashtable]$ConfigOverrides = @{}
    )
    $defaultConfig = @{
        AgentName        = 'test-agent'
        AgentVersion     = '6.0.0-test'
        AgentId          = '00000000-0000-0000-0000-000000000001'
        TenantId         = '00000000-0000-0000-0000-000000000002'
        ApiEndpoint      = 'https://example.invalid/functions/v1'
        ServerUrl        = 'https://example.invalid'
        PollInterval     = 60
        JobPollInterval  = 30
    }
    foreach ($k in $ConfigOverrides.Keys) { $defaultConfig[$k] = $ConfigOverrides[$k] }

    return [PSCustomObject]@{
        Http     = New-FakeHttpClient
        Secrets  = New-FakeSecretStore
        Logger   = New-FakeLogger
        Clock    = New-FakeClock
        Fs       = New-FakeFileSystem
        EventBus = New-FakeEventBus
        Config   = [PSCustomObject]$defaultConfig
    }
}
