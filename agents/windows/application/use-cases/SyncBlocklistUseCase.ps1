<#
.SYNOPSIS
    Use case: synchronize DNS blocklist into hosts file + persisted state.
.DESCRIPTION
    Validates entries via BlocklistEntry, persists JSON via IFileSystem,
    rewrites the managed hosts block via HostsFileAdapter (idempotent).
    Returns count of applied entries and rejected raw count.
#>

function Invoke-SyncBlocklistUseCase {
    [CmdletBinding()]
    param(
        [Parameter(Mandatory)]$Container,
        [object]$Payload
    )

    $cfg   = $Container.Config
    $log   = $Container.Logger
    $fs    = $Container.Fs
    $hosts = $Container.HostsFile

    $rawEntries = @()
    if ($Payload) {
        if     ($Payload -is [System.Array])                 { $rawEntries = @($Payload) }
        elseif ($Payload.PSObject.Properties['blocklist'])   { $rawEntries = @($Payload.blocklist) }
        elseif ($Payload.PSObject.Properties['domains'])     { $rawEntries = @($Payload.domains) }
        elseif ($Payload.PSObject.Properties['hosts'])       { $rawEntries = @($Payload.hosts) }
    }

    $entries = ConvertTo-BlocklistEntries -Raw $rawEntries
    $rejected = (@($rawEntries).Count - $entries.Count)

    # Persist canonical JSON (atomic)
    if ($fs -and $cfg.DnsBlocklistPath) {
        try {
            $json = ($entries | ConvertTo-Json -Depth 4 -Compress)
            $fs.WriteText($cfg.DnsBlocklistPath, $json)
        } catch {
            if ($log) { $log.Warn('[UC:SyncBlocklist] persist failed', @{ error=$_.Exception.Message }) }
        }
    }

    $applied = 0
    if ($hosts) {
        try {
            $applied = $hosts.ApplyBlock(@($entries | ForEach-Object { $_.Host }))
        } catch {
            if ($log) { $log.Error('[UC:SyncBlocklist] hosts apply failed', @{ error=$_.Exception.Message }) }
            return @{ success=$false; error=$_.Exception.Message; applied=0; rejected=$rejected }
        }
    }

    if ($log) { $log.Info('[UC:SyncBlocklist] complete', @{ applied=$applied; rejected=$rejected }) }
    return @{ success=$true; applied=$applied; rejected=$rejected }
}
