# Build local do CyberShield Agent para Windows
# Uso: .\build-local.ps1

$ErrorActionPreference = "Stop"

Write-Host "? Building CyberShield Agent..." -ForegroundColor Cyan
Write-Host ""

# Verificar Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "? Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "[ERROR]  Python nao encontrado. Instale Python 3.11+" -ForegroundColor Red
    Write-Host "   Download: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Verificar se estamos no diretorio correto
if (-not (Test-Path "main.py")) {
    Write-Host "[ERROR]  main.py nao encontrado. Execute este script no diretorio agent/" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Criar venv se nao existir
if (-not (Test-Path "venv")) {
    Write-Host "[PKG]  Criando virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "[ERROR]  Falha ao criar venv" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "? Virtual environment criado" -ForegroundColor Green
}

Write-Host ""

# Ativar venv
Write-Host "? Ativando virtual environment..." -ForegroundColor Yellow

$venvActivate = ".\venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
    Write-Host "[ERROR]  Script de ativacao nao encontrado: $venvActivate" -ForegroundColor Red
    exit 1
}

& $venvActivate

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR]  Falha ao ativar venv" -ForegroundColor Red
    exit 1
}

Write-Host "? Virtual environment ativado" -ForegroundColor Green
Write-Host ""

# Atualizar pip
Write-Host "? Atualizando pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "[WARN] ?  Aviso: Falha ao atualizar pip (continuando...)" -ForegroundColor Yellow
}

Write-Host ""

# Instalar dependencias
Write-Host "? Instalando dependencias..." -ForegroundColor Yellow

if (-not (Test-Path "requirements.txt")) {
    Write-Host "[ERROR]  requirements.txt nao encontrado" -ForegroundColor Red
    exit 1
}

pip install -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Host "[ERROR]  Falha ao instalar dependencias" -ForegroundColor Red
    exit 1
}

Write-Host "? Dependencias instaladas" -ForegroundColor Green
Write-Host ""

# Build com PyInstaller via build.py
Write-Host "? Compilando com PyInstaller..." -ForegroundColor Yellow
Write-Host "   (Isso pode levar alguns minutos...)" -ForegroundColor Gray
Write-Host ""

python build.py

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "[ERROR]  Build falhou!" -ForegroundColor Red
    Write-Host "   Ver erros acima" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Verificar resultado
$exePath = "dist\cybershield-agent.exe"

if (Test-Path $exePath) {
    $size = (Get-Item $exePath).Length / 1MB
    
    Write-Host "="*60 -ForegroundColor Cyan
    Write-Host "[OK]  BUILD CONCLUIDO COM SUCESSO!" -ForegroundColor Green
    Write-Host "="*60 -ForegroundColor Cyan
    Write-Host ""
    Write-Host "? Executavel:" -ForegroundColor Yellow
    Write-Host "   $((Get-Item $exePath).FullName)" -ForegroundColor White
    Write-Host ""
    Write-Host "? Tamanho: $([math]::Round($size, 2)) MB" -ForegroundColor Yellow
    Write-Host ""
    
    # Calcular SHA256
    Write-Host "? Calculando SHA256..." -ForegroundColor Yellow
    $hash = (Get-FileHash $exePath -Algorithm SHA256).Hash
    Write-Host "   SHA256: $hash" -ForegroundColor Gray
    Write-Host ""
    
    # Testar executavel
    Write-Host "? Testando executavel..." -ForegroundColor Yellow
    Write-Host ""
    
    try {
        $versionOutput = & $exePath --version 2>&1
        Write-Host "   Output: $versionOutput" -ForegroundColor Gray
        Write-Host ""
        Write-Host "? Executavel funcional" -ForegroundColor Green
    } catch {
        Write-Host "[WARN] ?  Aviso: Nao foi possivel executar --version" -ForegroundColor Yellow
        Write-Host "   Erro: $_" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "="*60 -ForegroundColor Cyan
    Write-Host ""
    Write-Host "? Proximos passos:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Validar build:" -ForegroundColor White
    Write-Host "   .\validate-build.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Testar localmente (crie agent_config.json primeiro):" -ForegroundColor White
    Write-Host "   $exePath --config agent_config.json" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Fazer upload para producao:" -ForegroundColor White
    Write-Host "   - GitHub Actions: 'Build Python Agent' workflow" -ForegroundColor Gray
    Write-Host "   - Ou upload manual para Supabase Storage" -ForegroundColor Gray
    Write-Host ""
    
} else {
    Write-Host ""
    Write-Host "[ERROR]  BUILD FALHOU - executavel nao foi gerado" -ForegroundColor Red
    Write-Host "   Esperado: $exePath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Verifique os erros acima e tente novamente." -ForegroundColor Yellow
    exit 1
}

Write-Host "[OK]  Processo completo!" -ForegroundColor Green
Write-Host ""
