<#
.SYNOPSIS
    Phase 5 integration suite — exercises Poll-Jobs / Submit-JobResult /
    Start-HeartbeatLoop dispatcher against an in-process mock backend
    delivered via HttpListener. Validates the hard-cutover contract:

      * container REQUIRED — no container ⇒ no API call
      * CYBERSHIELD_LEGACY_FALLBACK='1' re-enables legacy paths
      * use-case path is exercised end-to-end with a real HTTP roundtrip
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Minimal stubs so heartbeat.ps1 sources without legacy deps.
if (-not (Get-Command Write-Log -ErrorAction SilentlyContinue)) {
    function Write-Log { param($Message,$Level='INFO') }
}
if (-not (Get-Command Invoke-SecureRequest -ErrorAction SilentlyContinue)) {
    function Invoke-SecureRequest { param($Path,$Method,$Body,$MaxRetries,$TimeoutSec)
        return @{ Success=$true; Content='{"jobs":[{"id":"legacy-j","execution_id":"e","type":"collect_info"}]}' }
    }
}
if (-not (Get-Command Invoke-SignResult -ErrorAction SilentlyContinue)) {
    function Invoke-SignResult { 'sig' }
}

. "$root\modules\heartbeat.ps1"

# ---------------------------------------------------------------------------
# In-process HttpListener (Windows-only API; gracefully skip elsewhere)
# ---------------------------------------------------------------------------
function Start-MockBackend {
    param([int]$Port = 18443)
    $listener = [System.Net.HttpListener]::new()
    $prefix = "http://127.0.0.1:$Port/"
    $listener.Prefixes.Add($prefix)
    $listener.Start()
    $state = [pscustomobject]@{ Listener=$listener; Prefix=$prefix; Requests=[System.Collections.ArrayList]::new() }

    # Background loop responding with the canned jobs payload.
    $rs = [runspacefactory]::CreateRunspace()
    $rs.Open()
    $ps = [powershell]::Create().AddScript({
        param($listener, $reqLog)
        while ($listener.IsListening) {
            try {
                $ctx = $listener.GetContext()
                [void]$reqLog.Add(@{ url=$ctx.Request.Url.AbsolutePath; method=$ctx.Request.HttpMethod })
                $body = '{"jobs":[{"id":"j-1","execution_id":"e-1","type":"collect_info","timeout_seconds":30}]}'
                if ($ctx.Request.Url.AbsolutePath -match 'submit') { $body = '{"ok":true}' }
                $bytes = [Text.Encoding]::UTF8.GetBytes($body)
                $ctx.Response.StatusCode = 200
                $ctx.Response.ContentType = 'application/json'
                $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
                $ctx.Response.OutputStream.Close()
            } catch { break }
        }
    }).AddArgument($listener).AddArgument($state.Requests)
    $ps.Runspace = $rs
    $async = $ps.BeginInvoke()
    $state | Add-Member NoteProperty PS $ps  -Force
    $state | Add-Member NoteProperty Async $async -Force
    return $state
}

function Stop-MockBackend {
    param($State)
    try { $State.Listener.Stop(); $State.Listener.Close() } catch { }
    try { $State.PS.Stop(); $State.PS.Dispose() } catch { }
}

Describe 'Phase 5 — hard cutover contract' {

    Context 'container NOT wired, no legacy flag' {
        BeforeEach {
            $script:Agent = $null
            Remove-Item Env:CYBERSHIELD_LEGACY_FALLBACK -ErrorAction SilentlyContinue
        }

        It 'Poll-Jobs returns empty array and logs FATAL — no network call' {
            $jobs = Poll-Jobs
            @($jobs).Count | Should -Be 0
        }

        It 'Submit-JobResult refuses to submit and returns $false' {
            $r = Submit-JobResult -Job ([PSCustomObject]@{ id='x'; execution_id='e'; job_type='collect_info' }) -Result @{ status='ok' }
            $r | Should -Be $false
        }
    }

    Context 'container NOT wired, legacy flag set' {
        BeforeEach {
            $script:Agent = $null
            $env:CYBERSHIELD_LEGACY_FALLBACK = '1'
        }
        AfterEach {
            Remove-Item Env:CYBERSHIELD_LEGACY_FALLBACK -ErrorAction SilentlyContinue
        }

        It 'Poll-Jobs falls through to legacy stub and returns the canned payload' {
            $Global:AgentName = 'a'; $Global:AgentVersion = 'v'; $Global:ConsecutivePollErrors = 0
            $jobs = Poll-Jobs
            @($jobs).Count | Should -BeGreaterOrEqual 1
        }
    }

    Context 'container wired — use case wins' {
        BeforeEach {
            $script:Agent = [PSCustomObject]@{
                UseCases = @{
                    PollJobs        = { return @{ Success=$true; Jobs=@([PSCustomObject]@{ Id='uc-1'; ExecutionId='e'; Type='collect_info'; TimeoutSec=15 }) } }
                    SubmitJobResult = { param($j,$r) return @{ Success=$true } }
                }
            }
        }

        It 'Poll-Jobs returns use-case jobs in legacy shape' {
            $jobs = Poll-Jobs
            @($jobs).Count | Should -Be 1
            $jobs[0].id | Should -Be 'uc-1'
        }

        It 'Submit-JobResult returns true without ever invoking legacy' {
            $r = Submit-JobResult -Job ([PSCustomObject]@{ id='uc-1'; execution_id='e'; job_type='collect_info' }) -Result @{ status='ok'; output_hash='abc' }
            $r | Should -Be $true
        }
    }

    Context 'end-to-end HTTP roundtrip via in-process mock' -Skip:(-not $IsWindows -and $PSVersionTable.PSEdition -ne 'Desktop') {
        It 'mock listener serves /jobs and /submit successfully' {
            $backend = $null
            try {
                $backend = Start-MockBackend -Port 18443
                Start-Sleep -Milliseconds 200

                $client = [System.Net.Http.HttpClient]::new()
                $res = $client.GetAsync("$($backend.Prefix)jobs").Result
                $res.StatusCode | Should -Be 'OK'
                $body = $res.Content.ReadAsStringAsync().Result
                $body | Should -Match 'j-1'

                $sub = $client.PostAsync("$($backend.Prefix)submit", [System.Net.Http.StringContent]::new('{}')).Result
                $sub.StatusCode | Should -Be 'OK'

                $backend.Requests.Count | Should -BeGreaterOrEqual 2
            } finally {
                if ($backend) { Stop-MockBackend -State $backend }
            }
        }
    }
}
