# Script para validar formato HMAC antes de deploy
# Uso: .\validate-hmac-format.ps1 -AgentScriptPath ".\agent-scripts\cybershield-agent-windows.ps1"

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentScriptPath
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== HMAC Format Validation ===" -ForegroundColor Cyan
Write-Host "Checking: $AgentScriptPath`n" -ForegroundColor Gray

# Verificar se arquivo existe
if (-not (Test-Path $AgentScriptPath)) {
    Write-Host "[✗] ERRO: Arquivo não encontrado: $AgentScriptPath" -ForegroundColor Red
    exit 1
}

# Ler conteúdo do arquivo
$content = Get-Content $AgentScriptPath -Raw

# Lista de verificações
$checks = @{
    "Formato HMAC incorreto (sem separadores)" = '\$timestamp\$nonce\$bodyJson"'
    "Timestamp em segundos (deveria ser millisegundos)" = 'ToUnixTimeSeconds\(\)'
}

$errors = @()
$warnings = @()

# Verificar padrões incorretos
foreach ($check in $checks.GetEnumerator()) {
    if ($content -match $check.Value) {
        $errors += $check.Key
        Write-Host "[✗] ERRO: $($check.Key)" -ForegroundColor Red
    }
}

# Verificar padrões corretos
$correctPatterns = @{
    "Formato HMAC correto" = '\$\{timestamp\}:\$\{nonce\}:\$\{bodyJson\}'
    "Timestamp em millisegundos" = 'ToUnixTimeMilliseconds\(\)'
    "Upload-Report com timestamp" = 'timestamp = \(Get-Date\)\.ToString\("o"\)'
}

foreach ($check in $correctPatterns.GetEnumerator()) {
    if ($content -match $check.Value) {
        Write-Host "[✓] OK: $($check.Key)" -ForegroundColor Green
    } else {
        $warnings += "Padrão esperado não encontrado: $($check.Key)"
        Write-Host "[!] AVISO: $($check.Key) - não encontrado" -ForegroundColor Yellow
    }
}

# Verificar Execute-Job completo
if ($content -match 'function Execute-Job') {
    if ($content -match '"scan_virus"' -and $content -match '"collect_info"' -and $content -match '"run_command"') {
        Write-Host "[✓] OK: Execute-Job com lógica completa" -ForegroundColor Green
    } else {
        $warnings += "Execute-Job pode estar incompleto"
        Write-Host "[!] AVISO: Execute-Job pode estar incompleto" -ForegroundColor Yellow
    }
}

# Resultado final
Write-Host "`n=== Resultado ===" -ForegroundColor Cyan

if ($errors.Count -gt 0) {
    Write-Host "`n[✗] VALIDAÇÃO FALHOU - $($errors.Count) erro(s) encontrado(s):" -ForegroundColor Red
    foreach ($error in $errors) {
        Write-Host "  - $error" -ForegroundColor Red
    }
    Write-Host "`nCORRIJA OS ERROS ANTES DE FAZER DEPLOY!" -ForegroundColor Red
    exit 1
}

if ($warnings.Count -gt 0) {
    Write-Host "`n[!] AVISOS - $($warnings.Count) aviso(s):" -ForegroundColor Yellow
    foreach ($warning in $warnings) {
        Write-Host "  - $warning" -ForegroundColor Yellow
    }
}

Write-Host "`n[✓] VALIDAÇÃO PASSOU - Formato HMAC correto!" -ForegroundColor Green
Write-Host "Script está pronto para deploy.`n" -ForegroundColor Gray
exit 0
