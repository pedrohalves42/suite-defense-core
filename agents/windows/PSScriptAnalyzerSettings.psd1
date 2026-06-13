@{
    # ============================================================
    # PSScriptAnalyzer config — Hexagonal Refactor Guard Rails
    # ------------------------------------------------------------
    # Phase 0: severity = Warning (inventory only, non-blocking).
    # Phase 4: flip the rules below to Error to block CI when any
    #         legacy global or Write-Host sneaks back in.
    # ============================================================

    Severity     = @('Error', 'Warning')

    IncludeRules = @(
        # Hexagonal invariants — DO NOT downgrade once green
        'PSAvoidGlobalVars',
        'PSAvoidUsingWriteHost',
        'PSAvoidUsingInvokeExpression',
        'PSAvoidUsingPlainTextForPassword',
        'PSAvoidUsingConvertToSecureStringWithPlainText',

        # General hygiene
        'PSUseDeclaredVarsMoreThanAssignments',
        'PSUseShouldProcessForStateChangingFunctions',
        'PSAvoidUsingPositionalParameters',
        'PSUseConsistentIndentation',
        'PSAvoidTrailingWhitespace',
        'PSReservedCmdletChar',
        'PSReservedParams',
        'PSAvoidDefaultValueSwitchParameter',
        'PSAvoidNullOrEmptyHelpMessageAttribute',
        'PSUseApprovedVerbs'
    )

    ExcludeRules = @(
        # main.ps1 bootstrap legitimately uses Write-Host before logger exists
        # Allowlist enforced via per-file suppression instead of global exclude.
    )

    Rules = @{
        PSUseConsistentIndentation = @{
            Enable          = $true
            IndentationSize = 4
            Kind            = 'space'
        }
        PSAvoidGlobalVars = @{
            Enable = $true
        }
    }
}
