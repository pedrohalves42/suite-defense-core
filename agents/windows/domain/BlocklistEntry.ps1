<#
.SYNOPSIS
    Domain value object for a single DNS blocklist entry.
.DESCRIPTION
    Normalizes/validates hostnames before they reach the
    HostsFileAdapter. Rejects entries with CR/LF, spaces or
    control chars (block-injection prevention — defense in
    depth on top of HostsFileAdapter's own sanitization).
#>

function New-BlocklistEntry {
    [CmdletBinding()]
    param(
        # NOTE: parameter renamed from $Host to avoid clobbering PowerShell's
        # automatic $Host variable (PSAvoidAssignmentToAutomaticVariable).
        [Parameter(Mandatory)][Alias('Host')][string]$HostName,
        [string]$Reason = ''
    )

    $h = $HostName.Trim().ToLowerInvariant()
    if ([string]::IsNullOrWhiteSpace($h)) { throw [System.ArgumentException]::new('HostName is required') }
    if ($h -match '[\r\n\t ]')            { throw [System.ArgumentException]::new("Host contains whitespace/control: '$HostName'") }
    if ($h -notmatch '^[a-z0-9\.\-]+$')   { throw [System.ArgumentException]::new("Host contains invalid chars: '$HostName'") }
    if ($h.Length -gt 253)                { throw [System.ArgumentException]::new("Host too long: '$HostName'") }

    return [PSCustomObject]@{
        Host   = $h
        Reason = $Reason
    }
}

function ConvertTo-BlocklistEntries {
    [CmdletBinding()]
    param([object[]]$Raw)

    $out = New-Object System.Collections.Generic.List[object]
    foreach ($item in @($Raw)) {
        if (-not $item) { continue }
        try {
            if ($item -is [string]) {
                $out.Add((New-BlocklistEntry -HostName $item)) | Out-Null
            } elseif ($item.PSObject.Properties['host']) {
                $reason = if ($item.PSObject.Properties['reason']) { [string]$item.reason } else { '' }
                $out.Add((New-BlocklistEntry -HostName ([string]$item.host) -Reason $reason)) | Out-Null
            }
        } catch {
            # Skip invalid entries — caller decides whether to log
        }
    }
    return ,$out.ToArray()
}
