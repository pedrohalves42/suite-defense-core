#!/bin/bash

# 🧪 Script de Execução de Testes E2E - CyberShield
# Execute este script para validar o fluxo completo de instalação de agentes

set -e  # Exit on error

echo "=================================================="
echo "🚀 INICIANDO TESTES E2E - CyberShield"
echo "=================================================="
echo ""

# Verificar se Playwright está instalado
if ! command -v npx &> /dev/null; then
    echo "❌ ERRO: npx não encontrado. Instale Node.js e npm."
    exit 1
fi

# Cores para output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Função para executar teste
run_test() {
    local test_file=$1
    local test_name=$2
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🧪 Executando: $test_name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    if npx playwright test "$test_file" --reporter=list; then
        echo -e "${GREEN}✅ PASSOU: $test_name${NC}"
        return 0
    else
        echo -e "${RED}❌ FALHOU: $test_name${NC}"
        return 1
    fi
}

# Contadores
total_tests=0
passed_tests=0
failed_tests=0

# Teste 1: Download de Instaladores
total_tests=$((total_tests + 1))
if run_test "e2e/installer-download.spec.ts" "Download de Instaladores"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Teste 2: Validação de Heartbeat
total_tests=$((total_tests + 1))
if run_test "e2e/heartbeat-validation.spec.ts" "Validação de Heartbeat"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Teste 3: Fluxo Completo de Agente
total_tests=$((total_tests + 1))
if run_test "e2e/complete-agent-flow.spec.ts" "Fluxo Completo de Agente"; then
    passed_tests=$((passed_tests + 1))
else
    failed_tests=$((failed_tests + 1))
fi

# Resumo Final
echo ""
echo "=================================================="
echo "📊 RESUMO DOS TESTES E2E"
echo "=================================================="
echo ""
echo "Total de Testes: $total_tests"
echo -e "${GREEN}✅ Passaram: $passed_tests${NC}"
echo -e "${RED}❌ Falharam: $failed_tests${NC}"
echo ""

# Taxa de sucesso
success_rate=$(( (passed_tests * 100) / total_tests ))
echo "Taxa de Sucesso: $success_rate%"
echo ""

# Verificar se todos os testes passaram
if [ $failed_tests -eq 0 ]; then
    echo -e "${GREEN}🎉 TODOS OS TESTES PASSARAM!${NC}"
    echo ""
    echo "✅ O sistema está funcionando corretamente:"
    echo "   • Instaladores são gerados corretamente"
    echo "   • Agentes conectam e enviam heartbeats"
    echo "   • Jobs são criados e executados"
    echo "   • Métricas são coletadas"
    echo ""
    exit 0
else
    echo -e "${RED}⚠️  ALGUNS TESTES FALHARAM!${NC}"
    echo ""
    echo "🔍 Próximos passos:"
    echo "   1. Verifique os logs acima para detalhes dos erros"
    echo "   2. Execute: npx playwright show-report"
    echo "   3. Revise: AGENT_DIAGNOSTICS_REPORT.md"
    echo "   4. Consulte: VALIDATION_GUIDE.md"
    echo ""
    exit 1
fi
