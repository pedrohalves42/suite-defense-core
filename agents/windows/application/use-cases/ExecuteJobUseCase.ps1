<#
.SYNOPSIS
    Use case: execute a single JobDescriptor with timeout + dispatcher.
.DESCRIPTION
    Whitelisted dispatcher. Routes remediation jobs through Container
    adapters (Services, HostsFile) and collection jobs through optional
    Container.Handlers (filled by Phase 4 cutover). During Phase 3 the
    use case may delegate to legacy module functions when a handler is
    not yet bound — keeping production behavior untouched.

    Returns canonical JobResult.
#>

function Invoke-ExecuteJobUseCase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Container,
        [Parameter(Mandatory)]$Job
    )

    $log = $Container.Logger
    $sw  = [System.Diagnostics.Stopwatch]::StartNew()

    if (-not $Job.IsKnown) {
        if ($log) { $log.Warn('[UC:ExecuteJob] rejecting unknown job type', @{ id=$Job.Id; type=$Job.Type }) }
        $sw.Stop()
        return (New-JobResult -Success:$false -ErrorMessage "Unknown job type: $($Job.Type)" -ExitCode -1 -ExecutionSeconds $sw.Elapsed.TotalSeconds)
    }

    if ($log) { $log.Info('[UC:ExecuteJob] dispatch', @{ id=$Job.Id; type=$Job.Type; timeout=$Job.TimeoutSec }) }

    try {
        $output = Dispatch-JobInternal -Container $Container -Job $Job
        $sw.Stop()

        if ($output -is [hashtable] -and $output.ContainsKey('success')) {
            $ok = [bool]$output['success']
            return (New-JobResult `
                -Success:$ok `
                -Output $output `
                -ErrorMessage ($output['error']) `
                -ExitCode ([int]($output['exit_code'] | ForEach-Object { if ($_ -ne $null) { $_ } else { 0 } })) `
                -ExecutionSeconds $sw.Elapsed.TotalSeconds)
        }

        return (New-JobResult `
            -Success:$true `
            -Output $output `
            -ExecutionSeconds $sw.Elapsed.TotalSeconds)
    }
    catch {
        $sw.Stop()
        if ($log) { $log.Error('[UC:ExecuteJob] failure', @{ id=$Job.Id; type=$Job.Type; error=$_.Exception.Message }) }
        return (New-JobResult -Success:$false -ErrorMessage $_.Exception.Message -ExitCode -1 -ExecutionSeconds $sw.Elapsed.TotalSeconds)
    }
}

function Dispatch-JobInternal {
    param($Container, $Job)

    # Prefer explicit handlers attached to Container.Handlers (Phase 4 cutover);
    # fall back to legacy module functions for jobs not yet migrated.
    if ($Container.PSObject.Properties['Handlers'] -and $Container.Handlers -and $Container.Handlers.ContainsKey($Job.Type)) {
        return (& $Container.Handlers[$Job.Type] $Container $Job)
    }

    switch ($Job.Type) {
        # Container-native paths (Phase 3 native implementations) ----------
        'stop_service'    { return (Invoke-StopServiceViaAdapter    -Container $Container -Payload $Job.Payload) }
        'disable_service' { return (Invoke-DisableServiceViaAdapter -Container $Container -Payload $Job.Payload) }
        'restart_service' { return (Invoke-RestartServiceViaAdapter -Container $Container -Payload $Job.Payload) }
        'sync_blocked_websites' { return (Invoke-SyncBlocklistUseCase -Container $Container -Payload $Job.Payload) }
        'collect_info'    {
            return @{
                success       = $true
                hostname      = $env:COMPUTERNAME
                os_version    = [System.Environment]::OSVersion.VersionString
                architecture  = $env:PROCESSOR_ARCHITECTURE
                agent_version = $Container.Config.AgentVersion
            }
        }
        'integration_test_v3' {
            return @{
                success       = $true
                pong          = $true
                agent_version = $Container.Config.AgentVersion
                timestamp     = $Container.Clock.IsoNow()
                hostname      = $env:COMPUTERNAME
            }
        }

        # Legacy fallback — call into existing modules (Phase 4 will remove this) -----
        default {
            $fnMap = @{
                'software_inventory_collect' = 'Invoke-CollectSoftwareInventory'
                'collect_antivirus_status'   = 'Invoke-CollectAntivirusStatus'
                'collect_network_info'       = 'Invoke-CollectNetworkInfo'
                'collect_web_activity'       = 'Invoke-CollectWebActivity'
                'collect_dns_blocks'         = 'Invoke-CollectDnsBlocks'
                'light_vuln_scan'            = 'Invoke-LightVulnScan'
                'scan'                       = 'Invoke-ScanJob'
                'report'                     = 'Invoke-ReportJob'
                'collect_backup_status'      = 'Invoke-CollectBackupStatus'
                'collect_process_lineage'    = 'Invoke-CollectProcessLineage'
                'kill_process'               = 'Invoke-KillProcess'
                'disk_cleanup'               = 'Invoke-DiskCleanup'
                'network_diagnostics'        = 'Invoke-NetworkDiagnostics'
                'service_health_check'       = 'Invoke-ServiceHealthCheck'
                'fix_firewall'               = 'Invoke-FixFirewall'
                'high_cpu_check'             = 'Invoke-HighCpuProcessCheck'
                'quarantine_agent'           = 'Invoke-QuarantineAgent'
                'apply_security_patch'       = 'Invoke-ApplySecurityPatch'
                'update_agent'               = $null  # delegated to force_update
                'reinstall_agent'            = $null
            }
            $fn = $fnMap[$Job.Type]
            if (-not $fn) {
                return @{ success=$true; message="Job type '$($Job.Type)' delegated to lifecycle path" }
            }
            $cmd = Get-Command $fn -ErrorAction SilentlyContinue
            if (-not $cmd) {
                throw "Handler '$fn' not loaded for job type '$($Job.Type)'"
            }
            if ($Job.Payload) { return (& $cmd -Payload $Job.Payload) }
            return (& $cmd)
        }
    }
}

# ---- Adapter-native remediation -------------------------------------------

function Invoke-StopServiceViaAdapter {
    param($Container, $Payload)
    $name = if ($Payload -and $Payload.PSObject.Properties['service_name']) { [string]$Payload.service_name } else { $null }
    if (-not $name) { return @{ success=$false; error='service_name required' } }
    return $Container.Services.Stop($name)
}

function Invoke-DisableServiceViaAdapter {
    param($Container, $Payload)
    $name = if ($Payload -and $Payload.PSObject.Properties['service_name']) { [string]$Payload.service_name } else { $null }
    if (-not $name) { return @{ success=$false; error='service_name required' } }
    return $Container.Services.Disable($name)
}

function Invoke-RestartServiceViaAdapter {
    param($Container, $Payload)
    $name = if ($Payload -and $Payload.PSObject.Properties['service_name']) { [string]$Payload.service_name } else { $null }
    if (-not $name) { return @{ success=$false; error='service_name required' } }
    return $Container.Services.Restart($name)
}
