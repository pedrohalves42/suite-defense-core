param([string]$FilePath = "C:\CyberShield\cybershield-agent-teste.ps1")

Write-Host "`n=== Validação de Encoding e Sintaxe ===" -ForegroundColor Cyan

if (-not (Test-Path $FilePath)) {
    Write-Host "❌ Arquivo não encontrado: $FilePath" -ForegroundColor Red
    exit 1
}

# 1. Validar encoding
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
Write-Host "`n📊 Tamanho: $($bytes.Length) bytes" -ForegroundColor Yellow
Write-Host "📊 Primeiros 10 bytes: $($bytes[0..([Math]::Min(9, $bytes.Length-1))] -join ', ')" -ForegroundColor Yellow

if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    Write-Host "❌ UTF-16 LE - PROBLEMA CRÍTICO!" -ForegroundColor Red
    Write-Host "   Este encoding impede execução pela Scheduled Task" -ForegroundColor Red
    exit 1
} elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
    Write-Host "❌ UTF-16 BE - PROBLEMA CRÍTICO!" -ForegroundColor Red
    exit 1
} elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "⚠️  UTF-8 com BOM (aceitável mas não ideal)" -ForegroundColor Yellow
} else {
    Write-Host "✅ UTF-8 sem BOM (IDEAL)" -ForegroundColor Green
}

# 2. Validar sintaxe PowerShell
Write-Host "`n🔍 Validando sintaxe PowerShell 5.1..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
$errors = $null
$script = [System.IO.File]::ReadAllText($FilePath, [System.Text.UTF8Encoding]::new($false))
[System.Management.Automation.PSParser]::Tokenize($script, [ref]$errors) | Out-Null

if ($errors.Count -eq 0) {
    Write-Host "✅ Sintaxe PowerShell 5.1 VÁLIDA" -ForegroundColor Green
} else {
    Write-Host "❌ $($errors.Count) ERRO(S) DE SINTAXE:" -ForegroundColor Red
    $errors | ForEach-Object {
        Write-Host "   Linha $($_.Token.StartLine): $($_.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`n✅ Validação concluída`n" -ForegroundColor Cyan
