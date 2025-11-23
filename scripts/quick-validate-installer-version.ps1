#Requires -RunAsAdministrator

# Script de validacao rapida da versao do instalador
# Testa se o serve-installer esta servindo v3.3.0-SECURITY-DIAGNOSTICS

param(
    [string]$EnrollmentKey = "***REMOVED***",
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
)

$ErrorActionPreference = "Stop"

Write-Host "`n=== VALIDACAO RAPIDA DO INSTALADOR v3.3.0 ===" -ForegroundColor Cyan
Write-Host "Enrollment Key: $EnrollmentKey" -ForegroundColor Gray
Write-Host "Server URL: $ServerUrl`n" -ForegroundColor Gray

# Buscar instalador
Write-Host "[1] Buscando instalador do servidor..." -ForegroundColor Yellow
$installerUrl = "$ServerUrl/functions/v1/serve-installer/$EnrollmentKey"

try {
    $response = Invoke-WebRequest -Uri $installerUrl -UseBasicParsing -ErrorAction Stop
    $installerContent = $response.Content
    Write-Host "  [OK] Instalador baixado ($($installerContent.Length) bytes)" -ForegroundColor Green
} catch {
    Write-Host "  [ERRO] Falha ao buscar instalador: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Verificar versao
Write-Host "`n[2] Verificando versao..." -ForegroundColor Yellow
if ($installerContent -match "v3\.3\.0-SECURITY-DIAGNOSTICS") {
    Write-Host "  [OK] Versao: v3.3.0-SECURITY-DIAGNOSTICS" -ForegroundColor Green
} elseif ($installerContent -match "v3\.2\.4-UNBLOCK-FIX") {
    Write-Host "  [AVISO] Versao antiga: v3.2.4-UNBLOCK-FIX" -ForegroundColor Yellow
    Write-Host "  Edge Function pode nao ter sido redeployada ainda" -ForegroundColor Yellow
    $needsRedeploy = $true
} else {
    Write-Host "  [ERRO] Versao desconhecida ou ausente!" -ForegroundColor Red
    # Procurar por qualquer versao
    if ($installerContent -match "v(\d+\.\d+\.\d+[^\s]*)") {
        Write-Host "  Versao encontrada: $($Matches[1])" -ForegroundColor Gray
    }
    exit 1
}

# Verificar funcionalidades v3.2.4 (base)
Write-Host "`n[3] Verificando funcionalidades v3.2.4 (base)..." -ForegroundColor Yellow

$checks = @{
    "Unblock-File" = "Unblock-File"
    "Zone.Identifier" = "Zone\.Identifier"
    "ExecutionPolicy Unrestricted" = "ExecutionPolicy.*Unrestricted"
}

foreach ($check in $checks.GetEnumerator()) {
    if ($installerContent -match $check.Value) {
        Write-Host "  [OK] $($check.Key)" -ForegroundColor Green
    } else {
        Write-Host "  [ERRO] $($check.Key) ausente!" -ForegroundColor Red
    }
}

# Verificar funcionalidades v3.3.0 (diagnostico de seguranca)
Write-Host "`n[4] Verificando funcionalidades v3.3.0 (diagnostico)..." -ForegroundColor Yellow

$securityChecks = @{
    "Diagnostico de Seguranca" = "Diagnostico de Restricoes de Seguranca"
    "Deteccao de GPO" = "MachinePolicy"
    "Deteccao de LanguageMode" = "LanguageMode"
    "Deteccao de AppLocker" = "AppLocker"
    "Deteccao de Device Guard" = "Device Guard|WDAC"
    "Verificacao de Windows Defender" = "Windows Defender"
}

$missingFeatures = 0
foreach ($check in $securityChecks.GetEnumerator()) {
    if ($installerContent -match $check.Value) {
        Write-Host "  [OK] $($check.Key)" -ForegroundColor Green
    } else {
        Write-Host "  [AUSENTE] $($check.Key)" -ForegroundColor Yellow
        $missingFeatures++
    }
}

# Resumo
Write-Host "`n=== RESUMO ===" -ForegroundColor Cyan

if ($needsRedeploy) {
    Write-Host "[ACAO NECESSARIA] Edge Function precisa ser redeployada!" -ForegroundColor Yellow
    Write-Host "Mudancas no codigo nao estao ativas no servidor ainda." -ForegroundColor Yellow
    Write-Host "`nPara forcar redeploy:" -ForegroundColor Gray
    Write-Host "  1. Commit e push das mudancas" -ForegroundColor Gray
    Write-Host "  2. Lovable Cloud fara redeploy automatico" -ForegroundColor Gray
} elseif ($missingFeatures -eq 0) {
    Write-Host "[SUCESSO] Instalador v3.3.0-SECURITY-DIAGNOSTICS 100% funcional!" -ForegroundColor Green
    Write-Host "Todas as funcionalidades de diagnostico estao presentes." -ForegroundColor Green
} else {
    Write-Host "[PARCIAL] Instalador funcional mas com $missingFeatures funcionalidades ausentes" -ForegroundColor Yellow
}

Write-Host "`n=== FIM DA VALIDACAO ===`n" -ForegroundColor Cyan
