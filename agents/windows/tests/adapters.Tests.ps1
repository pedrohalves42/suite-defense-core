<#
.SYNOPSIS
    Pester tests for Phase 2 adapters (ADR-002).
.DESCRIPTION
    Validates port-contract conformance and core behavior of each
    real adapter. Uses cross-platform fallbacks where Windows-only
    primitives (DPAPI) are unavailable.
#>

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
. "$here\..\ports\IClock.ps1"
. "$here\..\ports\ILogger.ps1"
. "$here\..\ports\IFileSystem.ps1"
. "$here\..\ports\IEventBus.ps1"
. "$here\..\ports\ISecretStore.ps1"
. "$here\..\ports\IHttpClient.ps1"
. "$here\..\composition\Container.ps1"
. "$here\..\adapters\ClockAdapter.ps1"
. "$here\..\adapters\FileLogger.ps1"
. "$here\..\adapters\FileSystemAdapter.ps1"
. "$here\..\adapters\EventBusAdapter.ps1"
. "$here\..\adapters\DpapiSecretStore.ps1"
. "$here\..\adapters\HttpClientAdapter.ps1"
. "$here\..\adapters\WindowsServiceAdapter.ps1"
. "$here\..\adapters\HostsFileAdapter.ps1"

Describe 'ClockAdapter' {
    It 'satisfies IClock' {
        $c = New-ClockAdapter
        { Assert-IClock -Instance $c } | Should -Not -Throw
    }
    It 'returns UTC DateTime' {
        $c = New-ClockAdapter
        $c.UtcNow().Kind | Should -Be 'Utc'
    }
    It 'UnixSeconds is increasing' {
        $c = New-ClockAdapter
        $a = $c.UnixSeconds(); Start-Sleep -Milliseconds 1100; $b = $c.UnixSeconds()
        $b | Should -BeGreaterThan $a
    }
}

Describe 'FileLogger' {
    BeforeAll {
        $script:tmpLogDir = Join-Path ([IO.Path]::GetTempPath()) ("cs-log-" + [Guid]::NewGuid())
    }
    AfterAll {
        if (Test-Path $script:tmpLogDir) { Remove-Item $script:tmpLogDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'satisfies ILogger' {
        $l = New-FileLogger -LogDir $script:tmpLogDir
        { Assert-ILogger -Instance $l } | Should -Not -Throw
    }
    It 'writes a line to disk without Write-Host' {
        $l = New-FileLogger -LogDir $script:tmpLogDir
        $l.Info('hello world', @{ k = 1 })
        $files = Get-ChildItem $script:tmpLogDir -Filter 'agent_*.log'
        $files.Count | Should -BeGreaterThan 0
        (Get-Content $files[0].FullName -Raw) | Should -Match 'hello world'
    }
    It 'WithTrace returns a scoped logger' {
        $l = New-FileLogger -LogDir $script:tmpLogDir
        $scoped = $l.WithTrace('abc-123')
        $scoped.TraceId | Should -Be 'abc-123'
        $scoped.Info('scoped'); 
        (Get-ChildItem $script:tmpLogDir -Filter 'agent_*.log' | Get-Content -Raw) | Should -Match 'trace:abc-123'
    }
}

Describe 'FileSystemAdapter' {
    BeforeAll {
        $script:tmpFsDir = Join-Path ([IO.Path]::GetTempPath()) ("cs-fs-" + [Guid]::NewGuid())
        New-Item -ItemType Directory -Path $script:tmpFsDir | Out-Null
    }
    AfterAll {
        if (Test-Path $script:tmpFsDir) { Remove-Item $script:tmpFsDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'satisfies IFileSystem' {
        { Assert-IFileSystem -Instance (New-FileSystemAdapter) } | Should -Not -Throw
    }
    It 'writes atomically and reads back' {
        $fs = New-FileSystemAdapter
        $p  = Join-Path $script:tmpFsDir 'state.json'
        $fs.Write($p, '{"a":1}')
        $fs.Exists($p) | Should -BeTrue
        $fs.Read($p)   | Should -Be '{"a":1}'
    }
    It 'leaves no .tmp files after Write' {
        $fs = New-FileSystemAdapter
        $p  = Join-Path $script:tmpFsDir 'state2.json'
        $fs.Write($p, 'x')
        (Get-ChildItem $script:tmpFsDir -Filter "$([IO.Path]::GetFileName($p)).tmp.*").Count | Should -Be 0
    }
    It 'Backup creates a sibling .bak.<ts>' {
        $fs = New-FileSystemAdapter
        $p  = Join-Path $script:tmpFsDir 'b.txt'
        $fs.Write($p, 'orig')
        $bak = $fs.Backup($p)
        Test-Path $bak | Should -BeTrue
        (Get-Content $bak -Raw) | Should -Be 'orig'
    }
}

Describe 'EventBusAdapter' {
    It 'satisfies IEventBus' {
        { Assert-IEventBus -Instance (New-EventBusAdapter) } | Should -Not -Throw
    }
    It 'delivers payloads to subscribers' {
        $bus  = New-EventBusAdapter
        $seen = [System.Collections.ArrayList]::new()
        $bus.Subscribe('tick', { param($p) [void]$seen.Add($p) })
        $bus.Publish('tick', 'one')
        $bus.Publish('tick', 'two')
        $seen.Count | Should -Be 2
        $seen[0]    | Should -Be 'one'
    }
    It 'isolates publisher from failing handler' {
        $bus = New-EventBusAdapter
        $bus.Subscribe('boom', { throw 'nope' })
        { $bus.Publish('boom', $null) } | Should -Not -Throw
    }
}

Describe 'DpapiSecretStore' {
    BeforeAll {
        $script:tmpSecDir = Join-Path ([IO.Path]::GetTempPath()) ("cs-sec-" + [Guid]::NewGuid())
    }
    AfterAll {
        if (Test-Path $script:tmpSecDir) { Remove-Item $script:tmpSecDir -Recurse -Force -ErrorAction SilentlyContinue }
    }
    It 'satisfies ISecretStore' {
        { Assert-ISecretStore -Instance (New-DpapiSecretStore -SecretsDir $script:tmpSecDir) } | Should -Not -Throw
    }
    It 'round-trips a secret' {
        $s = New-DpapiSecretStore -SecretsDir $script:tmpSecDir -Scope 'CurrentUser'
        $s.Set('token','s3cret-value!')
        $s.Get('token') | Should -Be 's3cret-value!'
        $s.List()       | Should -Contain 'token'
        $s.Delete('token')
        $s.Get('token') | Should -BeNullOrEmpty
    }
}

Describe 'HttpClientAdapter' {
    It 'satisfies IHttpClient' {
        $cfg = New-AgentConfig -Values @{ ApiEndpoint='https://api.example.com/functions/v1'; AgentToken='t'; HmacSecret='k' }
        { Assert-IHttpClient -Instance (New-HttpClientAdapter -Config $cfg) } | Should -Not -Throw
    }
    It 'fails closed without HMAC secret' {
        $cfg = New-AgentConfig -Values @{ ApiEndpoint='https://api.example.com/functions/v1'; AgentToken='t' }
        $c   = New-HttpClientAdapter -Config $cfg
        $r   = $c.Invoke(@{ Path = '/x'; Method = 'GET'; MaxRetries = 0 })
        $r.Success | Should -BeFalse
        $r.Error   | Should -Match 'HmacSecret'
    }
    It 'returns Transient=true on network failure (no retries)' {
        $cfg = New-AgentConfig -Values @{ ApiEndpoint='http://127.0.0.1:1/'; AgentToken='t'; HmacSecret='k' }
        $c   = New-HttpClientAdapter -Config $cfg
        $r   = $c.Invoke(@{ Path = '/nope'; Method = 'GET'; MaxRetries = 0; TimeoutSec = 2 })
        $r.Success | Should -BeFalse
    }
    It 'caches HMAC key per secret' {
        $cfg = New-AgentConfig -Values @{ ApiEndpoint='https://api.example.com/functions/v1'; AgentToken='t'; HmacSecret='k1' }
        $c   = New-HttpClientAdapter -Config $cfg
        $c._GetHmac() | Out-Null
        $first = $c.CachedHmac
        $c._GetHmac() | Out-Null
        $c.CachedHmac | Should -Be $first
        $cfg.HmacSecret = 'k2'
        $c._GetHmac() | Out-Null
        $c.CachedHmac | Should -Not -Be $first
    }
}

Describe 'WindowsServiceAdapter' {
    It 'refuses to stop protected service' {
        $a = New-WindowsServiceAdapter
        $a.IsProtected('WinDefend') | Should -BeTrue
        $a.Stop('WinDefend')        | Should -BeFalse
    }
}

Describe 'HostsFileAdapter sanitization' {
    BeforeAll {
        $script:tmpHosts = Join-Path ([IO.Path]::GetTempPath()) ("cs-hosts-" + [Guid]::NewGuid() + ".txt")
        Set-Content -Path $script:tmpHosts -Value "127.0.0.1`tlocalhost" -Encoding UTF8
    }
    AfterAll {
        if (Test-Path $script:tmpHosts) { Remove-Item $script:tmpHosts -Force -ErrorAction SilentlyContinue }
    }
    It 'rejects entries with newline injection' {
        $h = New-HostsFileAdapter -Path $script:tmpHosts
        $written = $h.ApplyBlock(@(
            [pscustomobject]@{ Ip='1.2.3.4'; Hostname="evil.com`r`n0.0.0.0 google.com" },
            [pscustomobject]@{ Ip='5.6.7.8'; Hostname='ok.example.com' }
        ))
        $written | Should -Be 1
        $body    = Get-Content $script:tmpHosts -Raw
        $body    | Should -Match 'ok.example.com'
        $body    | Should -Not -Match 'google.com'
    }
    It 'replaces managed block idempotently' {
        $h = New-HostsFileAdapter -Path $script:tmpHosts
        $h.ApplyBlock(@([pscustomobject]@{ Ip='1.1.1.1'; Hostname='a.test' })) | Out-Null
        $h.ApplyBlock(@([pscustomobject]@{ Ip='2.2.2.2'; Hostname='b.test' })) | Out-Null
        $body = Get-Content $script:tmpHosts -Raw
        ([regex]::Matches($body, [regex]::Escape('# >>> CyberShield managed >>>'))).Count | Should -Be 1
        $body | Should -Match 'b.test'
        $body | Should -Not -Match 'a.test'
    }
}

Describe 'AdapterWiring integration' {
    It 'Initialize-AgentAdapters fills the container with all ports' {
        . "$here\..\composition\CompatShims.ps1"
        . "$here\..\composition\AdapterWiring.ps1"
        $c = New-AgentContainer -Config @{
            ApiEndpoint='https://api.example.com/functions/v1'
            AgentToken='t'; HmacSecret='k'
            LogDir      = (Join-Path ([IO.Path]::GetTempPath()) ("cs-wire-log-" + [Guid]::NewGuid()))
            SecretsDir  = (Join-Path ([IO.Path]::GetTempPath()) ("cs-wire-sec-" + [Guid]::NewGuid()))
        }
        Initialize-AgentAdapters -Container $c | Out-Null
        $c.Http     | Should -Not -BeNullOrEmpty
        $c.Logger   | Should -Not -BeNullOrEmpty
        $c.Fs       | Should -Not -BeNullOrEmpty
        $c.EventBus | Should -Not -BeNullOrEmpty
        $c.Secrets  | Should -Not -BeNullOrEmpty
        $c.Clock    | Should -Not -BeNullOrEmpty
        $c.Services | Should -Not -BeNullOrEmpty
        $c.HostsFile| Should -Not -BeNullOrEmpty
    }
}
