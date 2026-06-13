<#
.SYNOPSIS
    Domain value object for a completed job result.
.DESCRIPTION
    Canonical shape consumed by SubmitJobResultUseCase. Wraps both
    success and failure into one structure so callers do not have
    to branch on exceptions.
#>

function New-JobResult {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)][bool]$Success,
        [object]   $Output            = $null,
        [string]   $Status            = $null,
        [string]   $ErrorMessage      = $null,
        [int]      $ExitCode          = 0,
        [double]   $ExecutionSeconds  = 0,
        [string]   $OutputHash        = $null
    )

    if (-not $Status) {
        $Status = if ($Success) { 'completed' } else { 'failed' }
    }

    return [PSCustomObject]@{
        success                = $Success
        status                 = $Status
        output                 = $Output
        output_hash            = $OutputHash
        error_message          = $ErrorMessage
        exit_code              = $ExitCode
        execution_time_seconds = $ExecutionSeconds
    }
}
