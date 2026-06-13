<#
.SYNOPSIS
    Use case: submit a JobResult back to the backend.
.DESCRIPTION
    Wraps /submit-job-result. Signing (Invoke-SignResult) currently lives
    in legacy crypto.ps1 — when present, signature is attached; otherwise
    the use case still submits (server enforces). Phase 4 introduces ISigner.
#>

function Invoke-SubmitJobResultUseCase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Container,
        [Parameter(Mandatory)]$Job,
        [Parameter(Mandatory)]$Result
    )

    $cfg   = $Container.Config
    $log   = $Container.Logger
    $http  = $Container.Http
    $clock = $Container.Clock

    $finishedAt = $clock.IsoNow()

    $payload = [ordered]@{
        execution_id   = $Job.ExecutionId
        job_id         = $Job.Id
        status         = $Result.status
        output         = $Result.output
        output_hash    = $Result.output_hash
        error_message  = $Result.error_message
        finished_at    = $finishedAt
        agent_version  = $cfg.AgentVersion
    }

    $signer = Get-Command -Name Invoke-SignResult -ErrorAction SilentlyContinue
    if ($signer) {
        try {
            $payload['result_signature'] = & $signer `
                -ExecutionId $Job.ExecutionId `
                -JobId $Job.Id `
                -Status $Result.status `
                -OutputHash $Result.output_hash `
                -FinishedAt $finishedAt
        } catch {
            if ($log) { $log.Warn('[UC:SubmitResult] signing failed (continuing unsigned)', @{ error=$_.Exception.Message }) }
        }
    }

    $resp = $http.Invoke(@{
        Path='/functions/v1/submit-job-result'; Method='POST'; Body=$payload; TimeoutSec=30; MaxRetries=3
    })

    if ($resp.Success) {
        if ($log) { $log.Info('[UC:SubmitResult] ok', @{ id=$Job.Id; status=$Result.status }) }
        return @{ Success=$true }
    }

    if ($log) { $log.Error('[UC:SubmitResult] failed', @{ id=$Job.Id; error=$resp.Error }) }
    return @{ Success=$false; Error=$resp.Error }
}
