# Valida o build local do agente CyberShield
# Uso: .\validate-build.ps1 [-ExePath "dist\cybershield-agent.exe"]

param(
    [string]$ExePath = "dist\cybershield-agent.exe"
)

$ErrorActionPreference = "Stop"

Write-Host "🔍 Validando build do CyberShield Agent..." -ForegroundColor Cyan
Write-Host "   Executável: $ExePath" -ForegroundColor Gray
Write-Host ""

$errors = @()
$warnings = @()

# =============================================================================
# 1. VERIFICAR SE ARQUIVO EXISTE
# =============================================================================
Write-Host "📁 Verificando arquivo..." -ForegroundColor Yellow

if (-not (Test-Path $ExePath)) {
    $errors += "❌ Executável não encontrado: $ExePath"
    Write-Host "   ❌ Arquivo não existe" -ForegroundColor Red
} else {
    Write-Host "   ✓ Arquivo existe" -ForegroundColor Green
    
    # =============================================================================
    # 2. VERIFICAR TAMANHO
    # =============================================================================
    Write-Host ""
    Write-Host "📊 Verificando tamanho..." -ForegroundColor Yellow
    
    $file = Get-Item $ExePath
    $size = $file.Length / 1MB
    
    Write-Host "   Tamanho: $([math]::Round($size, 2)) MB ($($file.Length) bytes)" -ForegroundColor Gray
    
    if ($size -lt 5) {
        $warnings += "⚠️  Tamanho suspeito: $([math]::Round($size, 2)) MB (esperado: 8-20 MB)"
        Write-Host "   ⚠️  Tamanho menor que 5 MB (suspeito)" -ForegroundColor Yellow
    } elseif ($size -gt 50) {
        $warnings += "⚠️  Tamanho grande: $([math]::Round($size, 2)) MB (esperado: 8-20 MB)"
        Write-Host "   ⚠️  Tamanho maior que 50 MB (considere otimizar)" -ForegroundColor Yellow
    } else {
        Write-Host "   ✓ Tamanho OK" -ForegroundColor Green
    }
    
    # =============================================================================
    # 3. CALCULAR SHA256
    # =============================================================================
    Write-Host ""
    Write-Host "🔒 Calculando SHA256..." -ForegroundColor Yellow
    
    try {
        $hash = (Get-FileHash $ExePath -Algorithm SHA256).Hash
        Write-Host "   SHA256: $hash" -ForegroundColor Gray
        Write-Host "   ✓ Hash calculado" -ForegroundColor Green
    } catch {
        $errors += "❌ Erro ao calcular SHA256: $_"
        Write-Host "   ❌ Erro ao calcular hash" -ForegroundColor Red
    }
    
    # =============================================================================
    # 4. TESTAR --version
    # =============================================================================
    Write-Host ""
    Write-Host "🧪 Testando --version..." -ForegroundColor Yellow
    
    try {
        $versionOutput = & $ExePath --version 2>&1 | Out-String
        
        Write-Host "   Output: $($versionOutput.Trim())" -ForegroundColor Gray
        
        if ($versionOutput -match "CyberShield|Agent|v\d+\.\d+\.\d+") {
            Write-Host "   ✓ --version OK" -ForegroundColor Green
        } else {
            $warnings += "⚠️  Output do --version inesperado: $($versionOutput.Trim())"
            Write-Host "   ⚠️  Output inesperado" -ForegroundColor Yellow
        }
    } catch {
        $errors += "❌ Erro ao executar --version: $_"
        Write-Host "   ❌ Erro ao executar" -ForegroundColor Red
    }
    
    # =============================================================================
    # 5. TESTAR --help
    # =============================================================================
    Write-Host ""
    Write-Host "🧪 Testando --help..." -ForegroundColor Yellow
    
    try {
        $helpOutput = & $ExePath --help 2>&1 | Out-String
        
        if ($helpOutput -match "usage|Usage|CyberShield|--config|--version") {
            Write-Host "   ✓ --help OK" -ForegroundColor Green
            
            # Mostrar preview do help
            $lines = $helpOutput -split "`n" | Select-Object -First 5
            foreach ($line in $lines) {
                if ($line.Trim()) {
                    Write-Host "   $line" -ForegroundColor Gray
                }
            }
        } else {
            $warnings += "⚠️  --help não retornou ajuda esperada"
            Write-Host "   ⚠️  Output inesperado" -ForegroundColor Yellow
        }
    } catch {
        $warnings += "⚠️  Erro ao executar --help: $_"
        Write-Host "   ⚠️  Erro ao executar" -ForegroundColor Yellow
    }
    
    # =============================================================================
    # 6. VERIFICAR ASSINATURA DIGITAL (se disponível)
    # =============================================================================
    Write-Host ""
    Write-Host "🔏 Verificando assinatura digital..." -ForegroundColor Yellow
    
    try {
        $signature = Get-AuthenticodeSignature $ExePath
        
        if ($signature.Status -eq "Valid") {
            Write-Host "   ✓ Assinatura válida: $($signature.SignerCertificate.Subject)" -ForegroundColor Green
        } elseif ($signature.Status -eq "NotSigned") {
            Write-Host "   ⚠️  Não assinado digitalmente (OK para dev)" -ForegroundColor Yellow
        } else {
            $warnings += "⚠️  Assinatura inválida: $($signature.Status)"
            Write-Host "   ⚠️  Status: $($signature.Status)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "   ⚠️  Não foi possível verificar assinatura" -ForegroundColor Yellow
    }
}

# =============================================================================
# RESUMO FINAL
# =============================================================================
Write-Host ""
Write-Host ("="*60) -ForegroundColor Cyan

if ($errors.Count -eq 0 -and $warnings.Count -eq 0) {
    Write-Host "✅ VALIDAÇÃO PASSOU - Build está perfeito!" -ForegroundColor Green
    Write-Host ("="*60) -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 Próximos passos:" -ForegroundColor Cyan
    Write-Host "1. Testar com configuração real:" -ForegroundColor White
    Write-Host "   $ExePath --config agent_config.json" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Fazer upload para produção:" -ForegroundColor White
    Write-Host "   - Via GitHub Actions: 'Build Python Agent' workflow" -ForegroundColor Gray
    Write-Host "   - Ou upload manual para Supabase Storage" -ForegroundColor Gray
    Write-Host ""
    exit 0
    
} elseif ($errors.Count -eq 0 -and $warnings.Count -gt 0) {
    Write-Host "⚠️  VALIDAÇÃO PASSOU COM AVISOS" -ForegroundColor Yellow
    Write-Host ("="*60) -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Avisos ($($warnings.Count)):" -ForegroundColor Yellow
    $warnings | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
    Write-Host ""
    Write-Host "Build está funcional mas revise os avisos acima." -ForegroundColor Yellow
    Write-Host ""
    exit 0
    
} else {
    Write-Host "❌ VALIDAÇÃO FALHOU" -ForegroundColor Red
    Write-Host ("="*60) -ForegroundColor Cyan
    Write-Host ""
    
    if ($errors.Count -gt 0) {
        Write-Host "Erros ($($errors.Count)):" -ForegroundColor Red
        $errors | ForEach-Object { Write-Host "  $_" -ForegroundColor Red }
        Write-Host ""
    }
    
    if ($warnings.Count -gt 0) {
        Write-Host "Avisos ($($warnings.Count)):" -ForegroundColor Yellow
        $warnings | ForEach-Object { Write-Host "  $_" -ForegroundColor Yellow }
        Write-Host ""
    }
    
    Write-Host "❌ Corrija os erros acima antes de usar este build." -ForegroundColor Red
    Write-Host ""
    exit 1
}
