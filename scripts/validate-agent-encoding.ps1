param([string]$FilePath = "C:\CyberShield\cybershield-agent-teste.ps1")

Write-Host "`n=== Validacao de Encoding e Sintaxe ===" -ForegroundColor Cyan

if (-not (Test-Path $FilePath)) {
    Write-Host "[ERROR]  Arquivo nao encontrado: $FilePath" -ForegroundColor Red
    exit 1
}

# 1. Validar encoding
$bytes = [System.IO.File]::ReadAllBytes($FilePath)
Write-Host "`n? Tamanho: $($bytes.Length) bytes" -ForegroundColor Yellow
Write-Host "? Primeiros 10 bytes: $($bytes[0..([Math]::Min(9, $bytes.Length-1))] -join ', ')" -ForegroundColor Yellow

if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
    Write-Host "[ERROR]  UTF-16 LE - PROBLEMA CRITICO!" -ForegroundColor Red
    Write-Host "   Este encoding impede execucao pela Scheduled Task" -ForegroundColor Red
    exit 1
} elseif ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFE -and $bytes[1] -eq 0xFF) {
    Write-Host "[ERROR]  UTF-16 BE - PROBLEMA CRITICO!" -ForegroundColor Red
    exit 1
} elseif ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
    Write-Host "[WARN] ?  UTF-8 com BOM (aceitavel mas nao ideal)" -ForegroundColor Yellow
} else {
    Write-Host "[OK]  UTF-8 sem BOM (IDEAL)" -ForegroundColor Green
}

# 2. Validar sintaxe PowerShell
Write-Host "`n[SCAN]  Validando sintaxe PowerShell 5.1..." -ForegroundColor Yellow
$ErrorActionPreference = "Continue"
$errors = $null
$script = [System.IO.File]::ReadAllText($FilePath, [System.Text.UTF8Encoding]::new($false))
[System.Management.Automation.PSParser]::Tokenize($script, [ref]$errors) | Out-Null

if ($errors.Count -eq 0) {
    Write-Host "[OK]  Sintaxe PowerShell 5.1 VALIDA" -ForegroundColor Green
} else {
    Write-Host "[ERROR]  $($errors.Count) ERRO(S) DE SINTAXE:" -ForegroundColor Red
    $errors | ForEach-Object {
        Write-Host "   Linha $($_.Token.StartLine): $($_.Message)" -ForegroundColor Red
    }
    exit 1
}

Write-Host "`n[OK]  Validacao concluida`n" -ForegroundColor Cyan
