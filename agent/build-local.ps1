# Build local do CyberShield Agent para Windows
# Uso: .\build-local.ps1

$ErrorActionPreference = "Stop"

Write-Host "🔨 Building CyberShield Agent..." -ForegroundColor Cyan
Write-Host ""

# Verificar Python
try {
    $pythonVersion = python --version 2>&1
    Write-Host "✓ Python: $pythonVersion" -ForegroundColor Green
} catch {
    Write-Host "❌ Python não encontrado. Instale Python 3.11+" -ForegroundColor Red
    Write-Host "   Download: https://www.python.org/downloads/" -ForegroundColor Yellow
    exit 1
}

# Verificar se estamos no diretório correto
if (-not (Test-Path "main.py")) {
    Write-Host "❌ main.py não encontrado. Execute este script no diretório agent/" -ForegroundColor Red
    exit 1
}

Write-Host ""

# Criar venv se não existir
if (-not (Test-Path "venv")) {
    Write-Host "📦 Criando virtual environment..." -ForegroundColor Yellow
    python -m venv venv
    
    if ($LASTEXITCODE -ne 0) {
        Write-Host "❌ Falha ao criar venv" -ForegroundColor Red
        exit 1
    }
    
    Write-Host "✓ Virtual environment criado" -ForegroundColor Green
}

Write-Host ""

# Ativar venv
Write-Host "🔄 Ativando virtual environment..." -ForegroundColor Yellow

$venvActivate = ".\venv\Scripts\Activate.ps1"
if (-not (Test-Path $venvActivate)) {
    Write-Host "❌ Script de ativação não encontrado: $venvActivate" -ForegroundColor Red
    exit 1
}

& $venvActivate

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Falha ao ativar venv" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Virtual environment ativado" -ForegroundColor Green
Write-Host ""

# Atualizar pip
Write-Host "📥 Atualizando pip..." -ForegroundColor Yellow
python -m pip install --upgrade pip --quiet

if ($LASTEXITCODE -ne 0) {
    Write-Host "⚠️  Aviso: Falha ao atualizar pip (continuando...)" -ForegroundColor Yellow
}

Write-Host ""

# Instalar dependências
Write-Host "📥 Instalando dependências..." -ForegroundColor Yellow

if (-not (Test-Path "requirements.txt")) {
    Write-Host "❌ requirements.txt não encontrado" -ForegroundColor Red
    exit 1
}

pip install -r requirements.txt

if ($LASTEXITCODE -ne 0) {
    Write-Host "❌ Falha ao instalar dependências" -ForegroundColor Red
    exit 1
}

Write-Host "✓ Dependências instaladas" -ForegroundColor Green
Write-Host ""

# Build com PyInstaller via build.py
Write-Host "🔨 Compilando com PyInstaller..." -ForegroundColor Yellow
Write-Host "   (Isso pode levar alguns minutos...)" -ForegroundColor Gray
Write-Host ""

python build.py

if ($LASTEXITCODE -ne 0) {
    Write-Host ""
    Write-Host "❌ Build falhou!" -ForegroundColor Red
    Write-Host "   Ver erros acima" -ForegroundColor Yellow
    exit 1
}

Write-Host ""

# Verificar resultado
$exePath = "dist\cybershield-agent.exe"

if (Test-Path $exePath) {
    $size = (Get-Item $exePath).Length / 1MB
    
    Write-Host "="*60 -ForegroundColor Cyan
    Write-Host "✅ BUILD CONCLUÍDO COM SUCESSO!" -ForegroundColor Green
    Write-Host "="*60 -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📍 Executável:" -ForegroundColor Yellow
    Write-Host "   $((Get-Item $exePath).FullName)" -ForegroundColor White
    Write-Host ""
    Write-Host "📊 Tamanho: $([math]::Round($size, 2)) MB" -ForegroundColor Yellow
    Write-Host ""
    
    # Calcular SHA256
    Write-Host "🔒 Calculando SHA256..." -ForegroundColor Yellow
    $hash = (Get-FileHash $exePath -Algorithm SHA256).Hash
    Write-Host "   SHA256: $hash" -ForegroundColor Gray
    Write-Host ""
    
    # Testar executável
    Write-Host "🧪 Testando executável..." -ForegroundColor Yellow
    Write-Host ""
    
    try {
        $versionOutput = & $exePath --version 2>&1
        Write-Host "   Output: $versionOutput" -ForegroundColor Gray
        Write-Host ""
        Write-Host "✓ Executável funcional" -ForegroundColor Green
    } catch {
        Write-Host "⚠️  Aviso: Não foi possível executar --version" -ForegroundColor Yellow
        Write-Host "   Erro: $_" -ForegroundColor Gray
    }
    
    Write-Host ""
    Write-Host "="*60 -ForegroundColor Cyan
    Write-Host ""
    Write-Host "📝 Próximos passos:" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "1. Validar build:" -ForegroundColor White
    Write-Host "   .\validate-build.ps1" -ForegroundColor Gray
    Write-Host ""
    Write-Host "2. Testar localmente (crie agent_config.json primeiro):" -ForegroundColor White
    Write-Host "   $exePath --config agent_config.json" -ForegroundColor Gray
    Write-Host ""
    Write-Host "3. Fazer upload para produção:" -ForegroundColor White
    Write-Host "   - GitHub Actions: 'Build Python Agent' workflow" -ForegroundColor Gray
    Write-Host "   - Ou upload manual para Supabase Storage" -ForegroundColor Gray
    Write-Host ""
    
} else {
    Write-Host ""
    Write-Host "❌ BUILD FALHOU - executável não foi gerado" -ForegroundColor Red
    Write-Host "   Esperado: $exePath" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Verifique os erros acima e tente novamente." -ForegroundColor Yellow
    exit 1
}

Write-Host "✅ Processo completo!" -ForegroundColor Green
Write-Host ""
