#!/bin/bash
# Build local do CyberShield Agent para Linux
# Uso: ./build-local.sh

set -e  # Exit on error

echo "🔨 Building CyberShield Agent..."
echo ""

# Verificar Python
if ! command -v python3 &> /dev/null; then
    echo "❌ Python não encontrado. Instale Python 3.11+"
    exit 1
fi

python_version=$(python3 --version)
echo "✓ Python: $python_version"

# Verificar se estamos no diretório correto
if [ ! -f "main.py" ]; then
    echo "❌ main.py não encontrado. Execute este script no diretório agent/"
    exit 1
fi

echo ""

# Criar venv se não existir
if [ ! -d "venv" ]; then
    echo "📦 Criando virtual environment..."
    python3 -m venv venv
    echo "✓ Virtual environment criado"
fi

echo ""

# Ativar venv
echo "🔄 Ativando virtual environment..."
source venv/bin/activate

if [ $? -ne 0 ]; then
    echo "❌ Falha ao ativar venv"
    exit 1
fi

echo "✓ Virtual environment ativado"
echo ""

# Atualizar pip
echo "📥 Atualizando pip..."
pip install --upgrade pip --quiet

if [ $? -ne 0 ]; then
    echo "⚠️  Aviso: Falha ao atualizar pip (continuando...)"
fi

echo ""

# Instalar dependências
echo "📥 Instalando dependências..."

if [ ! -f "requirements.txt" ]; then
    echo "❌ requirements.txt não encontrado"
    exit 1
fi

pip install -r requirements.txt

if [ $? -ne 0 ]; then
    echo "❌ Falha ao instalar dependências"
    exit 1
fi

echo "✓ Dependências instaladas"
echo ""

# Build com PyInstaller via build.py
echo "🔨 Compilando com PyInstaller..."
echo "   (Isso pode levar alguns minutos...)"
echo ""

python build.py

if [ $? -ne 0 ]; then
    echo ""
    echo "❌ Build falhou!"
    echo "   Ver erros acima"
    exit 1
fi

echo ""

# Verificar resultado
exe_path="dist/cybershield-agent"

if [ -f "$exe_path" ]; then
    size=$(du -h "$exe_path" | cut -f1)
    
    echo "============================================================"
    echo "✅ BUILD CONCLUÍDO COM SUCESSO!"
    echo "============================================================"
    echo ""
    echo "📍 Executável:"
    echo "   $(realpath $exe_path)"
    echo ""
    echo "📊 Tamanho: $size"
    echo ""
    
    # Calcular SHA256
    echo "🔒 Calculando SHA256..."
    hash=$(sha256sum "$exe_path" | cut -d' ' -f1)
    echo "   SHA256: $hash"
    echo ""
    
    # Tornar executável
    chmod +x "$exe_path"
    
    # Testar executável
    echo "🧪 Testando executável..."
    echo ""
    
    if "$exe_path" --version 2>&1; then
        echo ""
        echo "✓ Executável funcional"
    else
        echo "⚠️  Aviso: Não foi possível executar --version"
    fi
    
    echo ""
    echo "============================================================"
    echo ""
    echo "📝 Próximos passos:"
    echo ""
    echo "1. Validar permissões:"
    echo "   ls -lh $exe_path"
    echo ""
    echo "2. Testar localmente (crie agent_config.json primeiro):"
    echo "   $exe_path --config agent_config.json"
    echo ""
    echo "3. Fazer upload para produção:"
    echo "   - GitHub Actions: 'Build Python Agent' workflow"
    echo "   - Ou upload manual para Supabase Storage"
    echo ""
    
else
    echo ""
    echo "❌ BUILD FALHOU - executável não foi gerado"
    echo "   Esperado: $exe_path"
    echo ""
    echo "Verifique os erros acima e tente novamente."
    exit 1
fi

echo "✅ Processo completo!"
echo ""
