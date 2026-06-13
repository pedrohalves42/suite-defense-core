<#
.SYNOPSIS
    Pester suite for Phase 3 — domain VOs + application use cases.
.DESCRIPTION
    Uses in-memory fakes for all ports so the suite runs in CI
    containers without Windows-specific dependencies.
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

. "$root\composition\Container.ps1"
. "$root\domain\HeartbeatPayload.ps1"
. "$root\domain\JobDescriptor.ps1"
. "$root\domain\JobResult.ps1"
. "$root\domain\UpdateDecision.ps1"
. "$root\domain\BlocklistEntry.ps1"
. "$root\application\use-cases\SendHeartbeatUseCase.ps1"
. "$root\application\use-cases\PollJobsUseCase.ps1"
. "$root\application\use-cases\ExecuteJobUseCase.ps1"
. "$root\application\use-cases\SubmitJobResultUseCase.ps1"
. "$root\application\use-cases\CheckForUpdateUseCase.ps1"
. "$root\application\use-cases\SyncBlocklistUseCase.ps1"
. "$root\application\use-cases\PerformSelfHealUseCase.ps1"

function New-FakeHttp {
    param([scriptblock]$Handler)
    $o = [PSCustomObject]@{ Calls = New-Object System.Collections.ArrayList; Handler = $Handler }
    $o | Add-Member ScriptMethod Invoke -Value {
        param($Request)
        [void]$this.Calls.Add($Request)
        return (& $this.Handler $Request)
    }
    return $o
}

function New-FakeLogger {
    $o = [PSCustomObject]@{ Entries = New-Object System.Collections.ArrayList }
    foreach ($lvl in 'Debug','Info','Warn','Error') {
        $o | Add-Member ScriptMethod $lvl -Value {
            param($msg, $ctx) [void]$this.Entries.Add(@{ Level=$lvl; Msg=$msg; Ctx=$ctx })
        }.GetNewClosure()
    }
    return $o
}

function New-FakeFs {
    $o = [PSCustomObject]@{ Files = @{} }
    $o | Add-Member ScriptMethod Write    -Value { param($p,$b) $this.Files[$p] = $b }
    $o | Add-Member ScriptMethod Read     -Value { param($p) if ($this.Files.ContainsKey($p)) { $this.Files[$p] } }
    $o | Add-Member ScriptMethod Exists   -Value { param($p) $this.Files.ContainsKey($p) }
    $o | Add-Member ScriptMethod Delete   -Value { param($p) $this.Files.Remove($p) | Out-Null }
    $o | Add-Member ScriptMethod Backup   -Value { param($p) return "$p.bak" }
    return $o
}

function New-FakeHosts {
    $o = [PSCustomObject]@{ Last = $null }
    $o | Add-Member ScriptMethod ApplyBlock -Value { param($e) $this.Last = $e; return @($e).Count }
    return $o
}

function New-FakeServices {
    $o = [PSCustomObject]@{ Stopped=@(); Disabled=@(); Started=@(); ProtectedList=@('WinDefend') }
    $o | Add-Member ScriptMethod IsProtected     -Value { param($n) $this.ProtectedList -contains $n }
    $o | Add-Member ScriptMethod Stop            -Value { param($n) if ($this.IsProtected($n)) { return $false }; $this.Stopped += $n; return $true }
    $o | Add-Member ScriptMethod Start           -Value { param($n) $this.Started += $n; return $true }
    $o | Add-Member ScriptMethod SetStartupType  -Value { param($n,$t) $this.Disabled += "$n=$t"; return $true }
    return $o
}

function New-TestContainer {
    param($Http=$null,$Hosts=$null,$Services=$null)
    $c = New-AgentContainer -Config @{
        AgentName='host1'; AgentVersion='6.0.0'; ApiEndpoint='https://x.example/functions/v1';
        AgentToken='t'; HmacSecret='s'; DataDir='/tmp'; DnsBlocklistPath='/tmp/bl.json'
    }
    $c.Logger   = New-FakeLogger
    $c.Fs       = New-FakeFs
    $c.Http     = $Http
    if (-not $Hosts)    { $Hosts    = New-FakeHosts }
    if (-not $Services) { $Services = New-FakeServices }
    $c | Add-Member NoteProperty HostsFile $Hosts    -Force
    $c | Add-Member NoteProperty Services  $Services -Force
    return $c
}

Describe 'Domain :: HeartbeatPayload' {
    It 'requires agent name & version' {
        { New-HeartbeatPayload -AgentName '' -AgentVersion '6.0.0' } | Should -Throw
        { New-HeartbeatPayload -AgentName 'h' -AgentVersion ''       } | Should -Throw
    }
    It 'produces serializable shape' {
        $p = New-HeartbeatPayload -AgentName 'h' -AgentVersion '6.0.0'
        $p.agent_name    | Should -Be 'h'
        $p.timestamp     | Should -Not -BeNullOrEmpty
    }
}

Describe 'Domain :: JobDescriptor' {
    It 'normalizes type vs job_type' {
        $j = New-JobDescriptor -Raw ([PSCustomObject]@{ id='1'; type='scan' })
        $j.Type | Should -Be 'scan'; $j.IsKnown | Should -BeTrue
    }
    It 'marks unknown types' {
        $j = New-JobDescriptor -Raw ([PSCustomObject]@{ id='1'; job_type='delete_everything' })
        $j.IsKnown | Should -BeFalse
    }
    It 'rejects malformed' {
        { New-JobDescriptor -Raw ([PSCustomObject]@{ id=''; type='scan' }) } | Should -Throw
    }
}

Describe 'Domain :: UpdateDecision' {
    It 'detects higher build' {
        (Test-ShouldUpdate -LocalVersion '6.0.0' -RemoteVersion '6.0.1') | Should -BeTrue
    }
    It 'rejects equal' {
        (Test-ShouldUpdate -LocalVersion '6.0.0' -RemoteVersion '6.0.0') | Should -BeFalse
    }
    It 'rejects lower minor' {
        (Test-ShouldUpdate -LocalVersion '6.1.0' -RemoteVersion '6.0.9') | Should -BeFalse
    }
    It 'handles invalid remote' {
        (Test-ShouldUpdate -LocalVersion '6.0.0' -RemoteVersion 'garbage') | Should -BeFalse
    }
}

Describe 'Domain :: BlocklistEntry' {
    It 'rejects CR/LF injection' {
        { New-BlocklistEntry -Host "evil.com`r`n127.0.0.1 bank.com" } | Should -Throw
    }
    It 'lowercases & validates' {
        (New-BlocklistEntry -Host 'EVIL.COM').Host | Should -Be 'evil.com'
    }
    It 'skips invalid in bulk' {
        $r = ConvertTo-BlocklistEntries -Raw @('ok.com','bad host','also-ok.io')
        @($r).Count | Should -Be 2
    }
}

Describe 'UseCase :: SendHeartbeat' {
    It 'serializes payload and applies interval change' {
        $http = New-FakeHttp { param($req)
            @{ Success=$true; Content=(@{ heartbeat_interval_seconds=120; update_available=$false } | ConvertTo-Json) }
        }
        $c = New-TestContainer -Http $http
        $r = Invoke-SendHeartbeatUseCase -Container $c
        $r.Success         | Should -BeTrue
        $r.IntervalChanged | Should -BeTrue
        $r.NewInterval     | Should -Be 120
        $c.Config.PollInterval | Should -Be 120
    }
    It 'returns transient error info on http failure' {
        $http = New-FakeHttp { @{ Success=$false; Error='timeout'; Transient=$true } }
        $r = Invoke-SendHeartbeatUseCase -Container (New-TestContainer -Http $http)
        $r.Success | Should -BeFalse; $r.Transient | Should -BeTrue
    }
}

Describe 'UseCase :: PollJobs' {
    It 'returns normalized descriptors' {
        $http = New-FakeHttp {
            @{ Success=$true; Content=(@{ jobs=@(@{ id='j1'; job_type='scan' }); poll_interval_seconds=45 } | ConvertTo-Json) }
        }
        $c = New-TestContainer -Http $http
        $r = Invoke-PollJobsUseCase -Container $c
        $r.Success | Should -BeTrue
        @($r.Jobs).Count | Should -Be 1
        $c.Config.JobPollInterval | Should -Be 45
    }
    It 'tracks consecutive errors' {
        $http = New-FakeHttp { @{ Success=$false; Error='boom' } }
        $c = New-TestContainer -Http $http
        Invoke-PollJobsUseCase -Container $c | Out-Null
        Invoke-PollJobsUseCase -Container $c | Out-Null
        $c.State.ConsecutivePollErrors | Should -Be 2
    }
}

Describe 'UseCase :: ExecuteJob' {
    It 'rejects unknown types' {
        $c = New-TestContainer
        $job = New-JobDescriptor -Raw ([PSCustomObject]@{ id='1'; type='format_disk' })
        $r = Invoke-ExecuteJobUseCase -Container $c -Job $job
        $r.success | Should -BeFalse; $r.exit_code | Should -Be -1
    }
    It 'runs collect_info natively' {
        $c = New-TestContainer
        $job = New-JobDescriptor -Raw ([PSCustomObject]@{ id='2'; type='collect_info' })
        $r = Invoke-ExecuteJobUseCase -Container $c -Job $job
        $r.success | Should -BeTrue
        $r.output.agent_version | Should -Be '6.0.0'
    }
    It 'refuses to stop protected services' {
        $c = New-TestContainer
        $job = New-JobDescriptor -Raw ([PSCustomObject]@{ id='3'; type='stop_service'; payload=@{ service_name='WinDefend' } })
        $r = Invoke-ExecuteJobUseCase -Container $c -Job $job
        $r.success | Should -BeFalse
    }
    It 'stops allowed services via adapter' {
        $svc = New-FakeServices
        $c = New-TestContainer -Services $svc
        $job = New-JobDescriptor -Raw ([PSCustomObject]@{ id='4'; type='stop_service'; payload=@{ service_name='spooler' } })
        $r = Invoke-ExecuteJobUseCase -Container $c -Job $job
        $r.success | Should -BeTrue
        $svc.Stopped | Should -Contain 'spooler'
    }
}

Describe 'UseCase :: SubmitJobResult' {
    It 'sends finalized payload' {
        $http = New-FakeHttp { @{ Success=$true; Content='{}' } }
        $c = New-TestContainer -Http $http
        $job = [PSCustomObject]@{ Id='j1'; ExecutionId='e1' }
        $res = New-JobResult -Success:$true -Output 'ok'
        $r = Invoke-SubmitJobResultUseCase -Container $c -Job $job -Result $res
        $r.Success | Should -BeTrue
        @($http.Calls).Count | Should -Be 1
        $http.Calls[0].Path | Should -Be '/functions/v1/submit-job-result'
    }
}

Describe 'UseCase :: CheckForUpdate' {
    It 'skips when up-to-date' {
        $http = New-FakeHttp { @{ Success=$true; Content=(@{ latest_version='6.0.0' } | ConvertTo-Json) } }
        $r = Invoke-CheckForUpdateUseCase -Container (New-TestContainer -Http $http) -ScriptPath ([IO.Path]::GetTempFileName())
        $r.UpdateStaged | Should -BeFalse
    }
    It 'rejects hash mismatch' {
        $script = 'Write-Host new-agent'
        $wrongHash = 'deadbeef'
        $http = New-FakeHttp { @{ Success=$true; Content=(@{ latest_version='6.0.1'; script_content=$script; script_hash=$wrongHash } | ConvertTo-Json) } }
        $tmp = [IO.Path]::GetTempFileName()
        $r = Invoke-CheckForUpdateUseCase -Container (New-TestContainer -Http $http) -ScriptPath $tmp
        $r.UpdateStaged | Should -BeFalse
        $r.Error | Should -Match 'hash'
    }
}

Describe 'UseCase :: SyncBlocklist' {
    It 'sanitizes, persists, applies' {
        $hosts = New-FakeHosts
        $c = New-TestContainer -Hosts $hosts
        $r = Invoke-SyncBlocklistUseCase -Container $c -Payload ([PSCustomObject]@{ blocklist=@('ok.com','bad host','foo.io') })
        $r.success  | Should -BeTrue
        $r.applied  | Should -Be 2
        $r.rejected | Should -Be 1
        @($hosts.Last)[0].Ip | Should -Be '0.0.0.0'
    }
}

Describe 'UseCase :: SelfHeal' {
    It 'initializes baseline on first run' {
        $tmpScript = [IO.Path]::GetTempFileName()
        Set-Content -LiteralPath $tmpScript -Value 'hello' -Encoding UTF8
        $cache = [IO.Path]::Combine([IO.Path]::GetTempPath(), "cache-$([Guid]::NewGuid()).json")
        $c = New-TestContainer
        $r = Invoke-PerformSelfHealUseCase -Container $c -ScriptPath $tmpScript -CachePath $cache
        $r.IntegrityOk  | Should -BeTrue
        $r.Initialized  | Should -BeTrue
    }
    It 'flags violation when hash unknown' {
        $tmpScript = [IO.Path]::GetTempFileName()
        Set-Content -LiteralPath $tmpScript -Value 'A' -Encoding UTF8
        $cache    = [IO.Path]::Combine([IO.Path]::GetTempPath(), "cache-$([Guid]::NewGuid()).json")
        Set-Content -LiteralPath $cache -Value (@{ hash='deadbeef' } | ConvertTo-Json) -Encoding UTF8
        $c = New-TestContainer
        $r = Invoke-PerformSelfHealUseCase -Container $c -ScriptPath $tmpScript -CachePath $cache
        $r.IntegrityViolation | Should -BeTrue
    }
}
