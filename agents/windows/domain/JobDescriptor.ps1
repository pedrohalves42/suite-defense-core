<#
.SYNOPSIS
    Domain value object for a server-issued job.
.DESCRIPTION
    Normalizes server payloads ({ id, type | job_type, payload, timeout_seconds })
    into a single canonical shape used by ExecuteJobUseCase.
    Whitelist validation lives here — unknown job types raise
    InvalidJobTypeError so the use case can short-circuit.
#>

$script:KnownJobTypes = @(
    # collection
    'software_inventory_collect','collect_antivirus_status','collect_network_info',
    'collect_web_activity','collect_dns_blocks','light_vuln_scan','scan','report',
    'collect_backup_status','collect_process_lineage',
    # remediation
    'kill_process','stop_service','disable_service','restart_service','disk_cleanup',
    'network_diagnostics','service_health_check','fix_firewall','high_cpu_check',
    'sync_blocked_websites','quarantine_agent','apply_security_patch',
    # lifecycle
    'update_agent','reinstall_agent','collect_info','integration_test_v3'
)

function Get-KnownJobTypes { return ,$script:KnownJobTypes }

function New-JobDescriptor {
    [CmdletBinding()]
    param([Parameter(Mandatory)]$Raw)

    if (-not $Raw) { throw [System.ArgumentException]::new('Raw job is null') }

    $id          = $Raw.id
    $type        = if ($Raw.PSObject.Properties['job_type'] -and $Raw.job_type) { $Raw.job_type } else { $Raw.type }
    $payload     = if ($Raw.PSObject.Properties['payload'])         { $Raw.payload }         else { $null }
    $timeoutSec  = if ($Raw.PSObject.Properties['timeout_seconds'] -and $Raw.timeout_seconds) { [int]$Raw.timeout_seconds } else { 30 }
    $executionId = if ($Raw.PSObject.Properties['execution_id'])    { $Raw.execution_id }    else { $null }

    if ([string]::IsNullOrWhiteSpace($id))   { throw [System.ArgumentException]::new('Job id is required') }
    if ([string]::IsNullOrWhiteSpace($type)) { throw [System.ArgumentException]::new("Job $id has no type") }

    return [PSCustomObject]@{
        Id           = [string]$id
        Type         = [string]$type
        Payload      = $payload
        TimeoutSec   = [int]$timeoutSec
        ExecutionId  = $executionId
        IsKnown      = ($script:KnownJobTypes -contains $type)
    }
}
