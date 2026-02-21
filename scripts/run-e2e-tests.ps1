# ? Script de Execucao de Testes E2E - CyberShield (Windows)
# Execute este script para validar o fluxo completo de instalacao de agentes

$ErrorActionPreference = "Stop"

Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "? INICIANDO TESTES E2E - CyberShield" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""

# Verificar se Node.js esta instalado
try {
    $nodeVersion = node --version
    Write-Host "? Node.js detectado: $nodeVersion" -ForegroundColor Gray
} catch {
    Write-Host "[ERROR]  ERRO: Node.js nao encontrado. Instale Node.js primeiro." -ForegroundColor Red
    exit 1
}

# Funcao para executar teste
function Run-Test {
    param(
        [string]$TestFile,
        [string]$TestName
    )
    
    Write-Host ""
    Write-Host "??????????????????????????????????????????????" -ForegroundColor Gray
    Write-Host "? Executando: $TestName" -ForegroundColor Cyan
    Write-Host "??????????????????????????????????????????????" -ForegroundColor Gray
    
    try {
        npx playwright test $TestFile --reporter=list
        Write-Host "[OK]  PASSOU: $TestName" -ForegroundColor Green
        return $true
    } catch {
        Write-Host "[ERROR]  FALHOU: $TestName" -ForegroundColor Red
        return $false
    }
}

# Contadores
$totalTests = 0
$passedTests = 0
$failedTests = 0

# Teste 1: Download de Instaladores
$totalTests++
if (Run-Test "e2e/installer-download.spec.ts" "Download de Instaladores") {
    $passedTests++
} else {
    $failedTests++
}

# Teste 2: Validacao de Heartbeat
$totalTests++
if (Run-Test "e2e/heartbeat-validation.spec.ts" "Validacao de Heartbeat") {
    $passedTests++
} else {
    $failedTests++
}

# Teste 3: Fluxo Completo de Agente
$totalTests++
if (Run-Test "e2e/complete-agent-flow.spec.ts" "Fluxo Completo de Agente") {
    $passedTests++
} else {
    $failedTests++
}

# Resumo Final
Write-Host ""
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host "? RESUMO DOS TESTES E2E" -ForegroundColor Cyan
Write-Host "==================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Total de Testes: $totalTests"
Write-Host "[OK]  Passaram: $passedTests" -ForegroundColor Green
Write-Host "[ERROR]  Falharam: $failedTests" -ForegroundColor Red
Write-Host ""

# Taxa de sucesso
$successRate = [math]::Round(($passedTests / $totalTests) * 100, 0)
Write-Host "Taxa de Sucesso: $successRate%"
Write-Host ""

# Verificar se todos os testes passaram
if ($failedTests -eq 0) {
    Write-Host "? TODOS OS TESTES PASSARAM!" -ForegroundColor Green
    Write-Host ""
    Write-Host "[OK]  O sistema esta funcionando corretamente:" -ForegroundColor Green
    Write-Host "   ? Instaladores sao gerados corretamente"
    Write-Host "   ? Agentes conectam e enviam heartbeats"
    Write-Host "   ? Jobs sao criados e executados"
    Write-Host "   ? Metricas sao coletadas"
    Write-Host ""
    exit 0
} else {
    Write-Host "[WARN] ?  ALGUNS TESTES FALHARAM!" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[SCAN]  Proximos passos:"
    Write-Host "   1. Verifique os logs acima para detalhes dos erros"
    Write-Host "   2. Execute: npx playwright show-report"
    Write-Host "   3. Revise: AGENT_DIAGNOSTICS_REPORT.md"
    Write-Host "   4. Consulte: VALIDATION_GUIDE.md"
    Write-Host ""
    exit 1
}
