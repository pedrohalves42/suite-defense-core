<#
.SYNOPSIS
    Port contract: ISecretStore
.DESCRIPTION
    Cipher-at-rest secret storage. Adapters MUST use DPAPI
    (CurrentUser scope by default, LocalMachine fallback for
    SYSTEM service account).

.CONTRACT
    $store.Get([string]$Name)              -> [string] plaintext or $null
    $store.Set([string]$Name, [string]$Value) -> [void]
    $store.Delete([string]$Name)           -> [void]
    $store.List()                          -> [string[]] names
#>

function Assert-ISecretStore {
    param([Parameter(Mandatory)]$Instance)
    foreach ($m in 'Get','Set','Delete','List') {
        if (-not ($Instance.PSObject.Methods.Name -contains $m)) {
            throw "ISecretStore contract violation: missing method '$m'"
        }
    }
    return $Instance
}
