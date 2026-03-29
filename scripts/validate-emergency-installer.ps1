# CyberShield Emergency Installer Validation Script
# Execute este script NA VM antes de instalar o agente

param(
    [Parameter(Mandatory=$true)]
    [string]$EnrollmentToken,
    
    [Parameter(Mandatory=$false)]
    [switch]$InstallIfValid
)

$ErrorActionPreference = "Stop"
$url = "https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-installer/$EnrollmentToken"

Write-Host "`n========================================" -ForegroundColor Cyan
Write-Host "  CYBERSHIELD EMERGENCY VALIDATION" -ForegroundColor Cyan
Write-Host "========================================`n" -ForegroundColor Cyan

# Fase 1: Baixar installer e validar headers
Write-Host "[1/5] Baixando installer..." -ForegroundColor Yellow
try {
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing
    Write-Host "  [OK] Download concluido" -ForegroundColor Green
} catch {
    Write-Host "  [ERRO] ERRO ao baixar: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# Fase 2: Validar headers de versao
Write-Host "`n[2/5] Validando headers..." -ForegroundColor Yellow
$version = $response.Headers['X-Installer-Version']
$updated = $response.Headers['X-Installer-Updated']
$sha256 = $response.Headers['X-SHA256']

Write-Host "  Versao: $version" -ForegroundColor White
Write-Host "  Atualizado: $updated" -ForegroundColor White
Write-Host "  SHA256: $sha256" -ForegroundColor White

if ($version -notlike "*3.1.1-PARSERERROR-FIX*") {
    Write-Host "  [ERRO] VERSAO INCORRETA!" -ForegroundColor Red
    exit 1
}
Write-Host "  [OK] Versao correta" -ForegroundColor Green

# Fase 3: Salvar e validar conteudo do script
Write-Host "`n[3/5] Validando conteudo do script..." -ForegroundColor Yellow
$script = $response.Content
$tempPath = "C:\Temp"
if (!(Test-Path $tempPath)) {
    New-Item -ItemType Directory -Path $tempPath -Force | Out-Null
}
$scriptPath = "$tempPath\emergency-installer-$EnrollmentToken.ps1"
$script | Out-File $scriptPath -Encoding UTF8
Write-Host "  Salvo em: $scriptPath" -ForegroundColor White

# Fase 4: Validar correcoes criticas
Write-Host "`n[4/5] Verificando correcoes criticas..." -ForegroundColor Yellow

# Padrao correto: $($_.Exception.Message)
$correctPattern = '\$\(\$_\.Exception\.Message\)'
$correctMatches = [regex]::Matches($script, $correctPattern)
$correctCount = $correctMatches.Count

# Padrao errado: : $_" (excluindo $_.Exception)
$wrongPattern = ':\s*\$_["\s]'
$wrongMatches = [regex]::Matches($script, $wrongPattern)
$wrongCount = $wrongMatches.Count

Write-Host "  Correcoes presentes: $correctCount" -ForegroundColor $(if($correctCount -ge 12){"Green"}else{"Red"})
Write-Host "  Erros antigos: $wrongCount" -ForegroundColor $(if($wrongCount -eq 0){"Green"}else{"Red"})

if ($correctCount -ge 12) {
    Write-Host "  [OK] Script contem todas as correcoes" -ForegroundColor Green
} else {
    Write-Host "  [ERRO] Script NAO contem as correcoes necessarias" -ForegroundColor Red
}

if ($wrongCount -gt 0) {
    Write-Host "  [ERRO] Script ainda contem erros antigos!" -ForegroundColor Red
    Write-Host "`n  Exemplos de linhas problematicas:" -ForegroundColor Yellow
    $wrongMatches | Select-Object -First 3 | ForEach-Object {
        $lineNum = ($script.Substring(0, $_.Index) -split "`n").Count
        Write-Host "    Linha $lineNum`: $($_.Value)" -ForegroundColor Red
    }
}

# Fase 5: Validar tamanho minimo do script
$scriptSize = $script.Length
Write-Host "`n[5/5] Validando tamanho do script..." -ForegroundColor Yellow
Write-Host "  Tamanho: $([math]::Round($scriptSize/1024, 2)) KB" -ForegroundColor White

if ($scriptSize -lt 10240) {
    Write-Host "  [ERRO] Script muito pequeno (esperado > 10 KB)" -ForegroundColor Red
    $validationPassed = $false
} else {
    Write-Host "  [OK] Tamanho adequado" -ForegroundColor Green
}

# Resultado final
Write-Host "`n========================================" -ForegroundColor Cyan
$validationPassed = ($correctCount -ge 12) -and ($wrongCount -eq 0) -and ($scriptSize -ge 10240)

if ($validationPassed) {
    Write-Host "  [OK] VALIDACAO PASSOU" -ForegroundColor Green
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    if ($InstallIfValid) {
        Write-Host "Iniciando instalacao..." -ForegroundColor Yellow
        
        # Limpar instalacao anterior
        Write-Host "`nLimpando instalacao anterior..." -ForegroundColor Yellow
        Remove-Item "C:\CyberShield\*" -Recurse -Force -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName "CyberShield Agent" -Confirm:$false -ErrorAction SilentlyContinue
        
        # Executar instalador validado (sem Invoke-Expression - segurança)
        Write-Host "Executando instalador validado..." -ForegroundColor Yellow
        & $scriptPath
        
        Write-Host "`n[OK] Instalacao concluida!" -ForegroundColor Green
        Write-Host "`nVerifique os logs:" -ForegroundColor Yellow
        Write-Host "  Get-Content C:\CyberShield\logs\installer.log -Tail 20" -ForegroundColor White
        Write-Host "  Get-ScheduledTask -TaskName 'CyberShield Agent' | Select TaskName, State, LastTaskResult" -ForegroundColor White
    } else {
        Write-Host "`nPara instalar, execute:" -ForegroundColor Yellow
        Write-Host "  .\validate-emergency-installer.ps1 -EnrollmentToken '$EnrollmentToken' -InstallIfValid" -ForegroundColor White
        Write-Host "`nOu execute manualmente:" -ForegroundColor Yellow
        Write-Host "  irm $url | iex" -ForegroundColor White
    }
} else {
    Write-Host "  [ERRO] VALIDACAO FALHOU" -ForegroundColor Red
    Write-Host "========================================`n" -ForegroundColor Cyan
    
    Write-Host "ACOES NECESSARIAS:" -ForegroundColor Yellow
    Write-Host "1. Aguarde 2-3 minutos (cache do Edge Function)" -ForegroundColor White
    Write-Host "2. Gere um NOVO token no dashboard (ex: EMERGENCY-FIX-002)" -ForegroundColor White
    Write-Host "3. Execute este script novamente com o novo token" -ForegroundColor White
    Write-Host "`nSe o problema persistir:" -ForegroundColor Yellow
    Write-Host "- Verifique se houve commit/push recente do codigo" -ForegroundColor White
    Write-Host "- Aguarde 5 minutos para Edge Function rebuild" -ForegroundColor White
    
    exit 1
}

Write-Host "`nScript de validacao concluido." -ForegroundColor Cyan
