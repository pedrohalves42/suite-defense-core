<#
.SYNOPSIS
    Phase 3 wiring — sources domain + use cases and attaches a UseCases
    dictionary to the container so callers can resolve them by name.
.DESCRIPTION
    Sourced by main.ps1 after AdapterWiring.ps1. Idempotent.

    Use case invocations are wrapped in scriptblocks so legacy modules
    can call e.g. `& $script:Agent.UseCases.SendHeartbeat $telemetry $events`
    without having to know function names.
#>

. "$PSScriptRoot\..\domain\HeartbeatPayload.ps1"
. "$PSScriptRoot\..\domain\JobDescriptor.ps1"
. "$PSScriptRoot\..\domain\JobResult.ps1"
. "$PSScriptRoot\..\domain\UpdateDecision.ps1"
. "$PSScriptRoot\..\domain\BlocklistEntry.ps1"

. "$PSScriptRoot\..\application\use-cases\SendHeartbeatUseCase.ps1"
. "$PSScriptRoot\..\application\use-cases\PollJobsUseCase.ps1"
. "$PSScriptRoot\..\application\use-cases\ExecuteJobUseCase.ps1"
. "$PSScriptRoot\..\application\use-cases\SubmitJobResultUseCase.ps1"
. "$PSScriptRoot\..\application\use-cases\CheckForUpdateUseCase.ps1"
. "$PSScriptRoot\..\application\use-cases\SyncBlocklistUseCase.ps1"
. "$PSScriptRoot\..\application\use-cases\PerformSelfHealUseCase.ps1"

function Initialize-AgentUseCases {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Container)

    $uc = @{
        SendHeartbeat   = { param($telemetry,$events) Invoke-SendHeartbeatUseCase   -Container $Container -Telemetry $telemetry -SecurityEvents $events }
        PollJobs        = {                              Invoke-PollJobsUseCase        -Container $Container }
        ExecuteJob      = { param($job)                  Invoke-ExecuteJobUseCase      -Container $Container -Job $job }
        SubmitJobResult = { param($job,$result)          Invoke-SubmitJobResultUseCase -Container $Container -Job $job -Result $result }
        CheckForUpdate  = { param($scriptPath)           Invoke-CheckForUpdateUseCase  -Container $Container -ScriptPath $scriptPath }
        SyncBlocklist   = { param($payload)              Invoke-SyncBlocklistUseCase   -Container $Container -Payload $payload }
        SelfHeal        = { param($scriptPath,$cache)    Invoke-PerformSelfHealUseCase -Container $Container -ScriptPath $scriptPath -CachePath $cache }
    }

    $Container | Add-Member -NotePropertyName UseCases -NotePropertyValue $uc -Force
    return $Container
}
