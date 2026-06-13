<#
.SYNOPSIS
    Pester suite for Phase 4 cutover — legacy modules now delegate to
    $script:Agent.UseCases when available, with deterministic fallback
    to the legacy path when the container is absent.
#>

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot

# Provide a no-op Write-Log so we can dot-source legacy modules in isolation.
if (-not (Get-Command Write-Log -ErrorAction SilentlyContinue)) {
    function Write-Log { param($Message,$Level='INFO') }
}
# Stub legacy collaborators so heartbeat.ps1 can be sourced without network.
if (-not (Get-Command Invoke-SecureRequest -ErrorAction SilentlyContinue)) {
    function Invoke-SecureRequest { param($Path,$Method,$Body,$MaxRetries,$TimeoutSec) return @{ Success=$true; Content='{"jobs":[]}' } }
}
if (-not (Get-Command Invoke-SignResult -ErrorAction SilentlyContinue)) {
    function Invoke-SignResult { param($ExecutionId,$JobId,$Status,$OutputHash,$FinishedAt) return 'sig' }
}

. "$root\modules\heartbeat.ps1"
. "$root\modules\remediation\HostsFile.ps1"
. "$root\modules\remediation\ServiceControl.ps1"

Describe 'Phase 4 — Poll-Jobs cutover' {
    BeforeEach {
        $Global:AgentName = 'a'; $Global:AgentVersion = 'v'; $Global:ConsecutivePollErrors = 0
    }

    It 'delegates to UseCases.PollJobs when wired and maps to legacy shape' {
        $script:Agent = [PSCustomObject]@{
            UseCases = @{
                PollJobs = {
                    return @{
                        Success = $true
                        Jobs = @(
                            [PSCustomObject]@{ Id='j1'; ExecutionId='e1'; Type='collect_info'; Payload=$null; TimeoutSec=42 }
                        )
                    }
                }
            }
        }
        $r = Poll-Jobs
        @($r).Count | Should -Be 1
        $r[0].id | Should -Be 'j1'
        $r[0].job_type | Should -Be 'collect_info'
        $r[0].timeout_seconds | Should -Be 42
    }

    It 'falls back to legacy when container not wired' {
        $script:Agent = $null
        Mock Invoke-SecureRequest { @{ Success=$false; Error='boom' } }
        $r = Poll-Jobs
        @($r).Count | Should -Be 0
        $Global:ConsecutivePollErrors | Should -Be 1
    }
}

Describe 'Phase 4 — Submit-JobResult cutover' {
    It 'invokes use case and returns true on success' {
        $calls = [System.Collections.ArrayList]::new()
        $script:Agent = [PSCustomObject]@{
            UseCases = @{
                SubmitJobResult = { param($j,$r) [void]$calls.Add(@{ j=$j; r=$r }); return @{ Success=$true } }
            }
        }
        $job = [PSCustomObject]@{ id='j1'; execution_id='e1'; job_type='collect_info' }
        $res = @{ status='ok'; output_hash='abc' }
        (Submit-JobResult -Job $job -Result $res) | Should -Be $true
        $calls.Count | Should -Be 1
        $calls[0].j.Id | Should -Be 'j1'
        $calls[0].j.ExecutionId | Should -Be 'e1'
        $calls[0].j.Type | Should -Be 'collect_info'
    }
}

Describe 'Phase 4 — Invoke-SyncBlockedWebsites cutover' {
    It 'prefers UseCases.SyncBlocklist and reports applied count' {
        $script:Agent = [PSCustomObject]@{
            UseCases = @{
                SyncBlocklist = { param($p) return @{ success=$true; applied=3; rejected=1 } }
            }
        }
        $r = Invoke-SyncBlockedWebsites -Payload @{ domains=@('a.com','b.com','c.com','bad host') }
        $r.success | Should -Be $true
        $r.blocked_count | Should -Be 3
        $r.method | Should -Be 'use_case'
    }
}

Describe 'Phase 4 — Restart-Service protected parity' {
    It 'blocks restart on a protected service (matches Stop/Disable)' {
        $Global:ProtectedServices = @('lsass')
        $r = Invoke-RestartService -Payload @{ service_name='lsass' }
        $r.success | Should -Be $false
        $r.blocked | Should -Be $true
    }
}
