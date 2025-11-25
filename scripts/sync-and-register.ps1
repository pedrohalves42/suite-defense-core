# Script temporario para sincronizar e forcar registro
# Este script executa o sync do agent script e chama process-agent-updates

param(
    [string]$SourcePath = "public/agent-scripts/cybershield-agent-windows-v3.ps1",
    [string]$TargetPath = "supabase/functions/_shared/agent-script-windows-content.ts"
)

$ErrorActionPreference = "Stop"

Write-Host "[FASE 1] Sincronizando script embarcado..." -ForegroundColor Cyan

# Ler script fonte
if (-not (Test-Path $SourcePath)) {
    Write-Error "Arquivo fonte nao encontrado: $SourcePath"
    exit 1
}

$content = Get-Content $SourcePath -Raw -Encoding UTF8

# Escapar para TypeScript template literal
$escaped = $content -replace '\\', '\\' `
                    -replace '`', '\`' `
                    -replace '\$', '\$'

# Gerar arquivo TypeScript
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

$output = $header + $escaped + $footer
Set-Content -Path $TargetPath -Value $output -Encoding UTF8 -NoNewline

$sourceSize = (Get-Item $SourcePath).Length
$targetSize = (Get-Item $TargetPath).Length

Write-Host "[SUCCESS] Sync concluido" -ForegroundColor Green
Write-Host "  Source: $sourceSize bytes" -ForegroundColor Gray
Write-Host "  Target: $targetSize bytes" -ForegroundColor Gray

# Verificar se TLS fix esta presente
$hasTlsFix = $content -match '\[Net\.ServicePointManager\]::SecurityProtocol = \[Net\.SecurityProtocolType\]::Tls12'
$hasProxyFix = $content -match '\[System\.Net\.WebRequest\]::GetSystemWebProxy\(\)'

Write-Host "`n[VALIDACAO]" -ForegroundColor Cyan
Write-Host "  TLS 1.2 Fix: $(if ($hasTlsFix) { 'PRESENTE' } else { 'AUSENTE' })" -ForegroundColor $(if ($hasTlsFix) { 'Green' } else { 'Red' })
Write-Host "  Proxy Fix: $(if ($hasProxyFix) { 'PRESENTE' } else { 'AUSENTE' })" -ForegroundColor $(if ($hasProxyFix) { 'Green' } else { 'Red' })

Write-Host "`n[INFO] Agora os Edge Functions precisam ser redeployados automaticamente pelo Lovable." -ForegroundColor Yellow
Write-Host "[INFO] Apos o deploy, clique em 'Registrar v3.10.2-TLS-FIX' no dashboard." -ForegroundColor Yellow
