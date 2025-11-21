# PowerShell script to sync agent scripts to TypeScript files
# Converts Windows PS1 to TS with proper escaping for template literals

param(
    [string]$SourcePath = "public/agent-scripts/cybershield-agent-windows-v3.ps1",
    [string]$TargetPath = "supabase/functions/_shared/agent-script-windows-content.ts"
)

$ErrorActionPreference = "Stop"

Write-Host "[SYNC] Reading source: $SourcePath"

if (-not (Test-Path $SourcePath)) {
    Write-Error "Source file not found: $SourcePath"
    exit 1
}

# Read PowerShell script content
$content = Get-Content $SourcePath -Raw -Encoding UTF8

# Escape for TypeScript template literal:
# - Backslash: \ -> \\
# - Backtick: ` -> \`
# - Dollar: $ -> \$
$escaped = $content -replace '\\', '\\' `
                    -replace '`', '\`' `
                    -replace '\$', '\$'

# Generate TypeScript file
$header = @"
/**
 * CyberShield Agent Windows Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: $SourcePath
 * Sincronizado em: $(Get-Date -Format "yyyy-MM-dd HH:mm:ss")
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = ``
"@

$footer = @"
``;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
"@

# Write to target
$output = $header + $escaped + $footer
Set-Content -Path $TargetPath -Value $output -Encoding UTF8 -NoNewline

$sourceSize = (Get-Item $SourcePath).Length
$targetSize = (Get-Item $TargetPath).Length

Write-Host "[SUCCESS] Sync completed"
Write-Host "  Source: $sourceSize bytes"
Write-Host "  Target: $targetSize bytes"
