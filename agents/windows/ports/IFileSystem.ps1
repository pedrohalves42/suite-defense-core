<#
.SYNOPSIS
    Port contract: IFileSystem
.DESCRIPTION
    Filesystem seam for state files, evidence journal, hosts file,
    DNS blocklist. Adapters MUST perform atomic writes (temp +
    rename) for any file that must not be observed half-written.

.CONTRACT
    $fs.Read([string]$Path)                  -> [string] or $null
    $fs.Write([string]$Path, [string]$Body)  -> [void]   (atomic)
    $fs.Append([string]$Path, [string]$Line) -> [void]
    $fs.Exists([string]$Path)                -> [bool]
    $fs.Delete([string]$Path)                -> [void]
    $fs.Backup([string]$Path)                -> [string] backup path
#>

function Assert-IFileSystem {
    param([Parameter(Mandatory)]$Instance)
    foreach ($m in 'Read','Write','Append','Exists','Delete') {
        if (-not ($Instance.PSObject.Methods.Name -contains $m)) {
            throw "IFileSystem contract violation: missing method '$m'"
        }
    }
    return $Instance
}
