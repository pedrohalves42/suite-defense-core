<#
.SYNOPSIS
    Pester tests for the bootstrap lockfile + validator (Phase 6.6).
.DESCRIPTION
    These tests do NOT invoke the real toolchain. They:
      1. Validate the lockfile shape (`agents/windows/bootstrap.lock.json`).
      2. Exercise the version-pin comparator (`Test-Pin`) and helpers
         exposed by `bootstrap.ps1` against synthetic inputs, so CI can
         catch regressions in the gating logic without depending on the
         specific runner image.
#>

$ScriptRoot = Split-Path -Parent $PSScriptRoot
$BootstrapPath = Join-Path $ScriptRoot 'bootstrap.ps1'
$LockPath      = Join-Path $ScriptRoot 'bootstrap.lock.json'

Describe 'Bootstrap lockfile shape' {
    It 'exists and is valid JSON' {
        Test-Path -LiteralPath $LockPath | Should -BeTrue
        { Get-Content -LiteralPath $LockPath -Raw | ConvertFrom-Json } | Should -Not -Throw
    }

    $lock = Get-Content -LiteralPath $LockPath -Raw | ConvertFrom-Json

    It 'declares schema_version' {
        $lock.schema_version | Should -Not -BeNullOrEmpty
    }

    It 'pins the required toolchain (node, npm, pwsh, dotnet)' {
        foreach ($t in 'node','npm','pwsh','dotnet') {
            $lock.tools.PSObject.Properties.Name | Should -Contain $t
        }
    }

    It 'pins the required PowerShell modules (ps2exe, Pester, PSScriptAnalyzer)' {
        foreach ($m in 'ps2exe','Pester','PSScriptAnalyzer') {
            $lock.powershell_modules.PSObject.Properties.Name | Should -Contain $m
        }
    }

    It 'every pin declares at least one of exact/min/max' {
        $sections = @($lock.tools, $lock.powershell_modules, $lock.winget_packages) |
                    Where-Object { $_ }
        foreach ($section in $sections) {
            foreach ($p in $section.PSObject.Properties) {
                $names = $p.Value.PSObject.Properties.Name
                ($names -contains 'exact' -or $names -contains 'min' -or $names -contains 'max') |
                    Should -BeTrue -Because "$($p.Name) needs a version constraint"
            }
        }
    }

    It 'requires gate flags' {
        $lock.gates | Should -Not -BeNullOrEmpty
        $lock.gates.PSObject.Properties.Name | Should -Contain 'fail_on_missing_tool'
        $lock.gates.PSObject.Properties.Name | Should -Contain 'fail_on_version_drift'
    }
}

Describe 'Bootstrap validator (-List mode)' {
    It 'dumps lockfile JSON without throwing' {
        { & $BootstrapPath -List -LockfilePath $LockPath | Out-Null } | Should -Not -Throw
    }
}

Describe 'Test-Pin comparator' {
    BeforeAll {
        # Dot-source helpers from bootstrap.ps1 without running its main body.
        # Strategy: parse the script, extract function definitions, invoke them
        # in an isolated scope.
        $src = Get-Content -Raw -LiteralPath $BootstrapPath
        $tokens = $null; $errors = $null
        $ast = [System.Management.Automation.Language.Parser]::ParseInput(
            $src, [ref]$tokens, [ref]$errors)
        $funcs = $ast.FindAll({ param($n) $n -is [System.Management.Automation.Language.FunctionDefinitionAst] }, $true)
        foreach ($f in $funcs) {
            . ([scriptblock]::Create($f.Extent.Text))
        }
    }

    It 'accepts an exact match' {
        (Test-Pin -Pin ([pscustomobject]@{ exact = '1.2.3' }) -Observed '1.2.3').Ok | Should -BeTrue
    }
    It 'rejects exact mismatch' {
        (Test-Pin -Pin ([pscustomobject]@{ exact = '1.2.3' }) -Observed '1.2.4').Ok | Should -BeFalse
    }
    It 'enforces min' {
        (Test-Pin -Pin ([pscustomobject]@{ min = '2.0.0' }) -Observed '1.9.9').Ok | Should -BeFalse
        (Test-Pin -Pin ([pscustomobject]@{ min = '2.0.0' }) -Observed '2.0.0').Ok | Should -BeTrue
    }
    It 'enforces max as exclusive upper bound' {
        (Test-Pin -Pin ([pscustomobject]@{ max = '21.0.0' }) -Observed '20.18.0').Ok | Should -BeTrue
        (Test-Pin -Pin ([pscustomobject]@{ max = '21.0.0' }) -Observed '21.0.0').Ok | Should -BeFalse
    }
    It 'reports missing observation' {
        (Test-Pin -Pin ([pscustomobject]@{ exact = '1.0.0' }) -Observed $null).Ok | Should -BeFalse
    }
    It 'tolerates "v"-prefixed semver from `node --version`' {
        (Test-Pin -Pin ([pscustomobject]@{ exact = '20.18.0' }) -Observed 'v20.18.0').Ok | Should -BeTrue
    }
}
