@{
    # ============================================================
    # Phase 5 — strict hexagonal-layer settings.
    # Apply ONLY to: ports/, domain/, application/, adapters/,
    # composition/ (excluding CompatShims.ps1 transitional).
    #
    # PSAvoidGlobalVars is ERROR here: any new $Global:* in these
    # layers must fail CI. Legacy modules/ continue using the
    # base PSScriptAnalyzerSettings.psd1 with Warning severity
    # until ADR-003 retires them.
    # ============================================================
    Severity     = @('Error', 'Warning')
    IncludeRules = @(
        'PSAvoidGlobalVars',
        'PSAvoidUsingWriteHost',
        'PSAvoidUsingInvokeExpression',
        'PSAvoidUsingPlainTextForPassword',
        'PSAvoidUsingConvertToSecureStringWithPlainText',
        'PSUseDeclaredVarsMoreThanAssignments',
        'PSReservedCmdletChar',
        'PSReservedParams',
        'PSUseApprovedVerbs'
    )
    Rules = @{
        PSAvoidGlobalVars     = @{ Enable = $true }
        PSAvoidUsingWriteHost = @{ Enable = $true }
    }
}
