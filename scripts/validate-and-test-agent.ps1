#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Valida credenciais do agente e executa teste manual com debug detalhado.

.DESCRIPTION
    Este script executa as Fases 2 e 3 do plano de troubleshooting:
    - Fase 2: Valida credenciais no script gerado vs credenciais esperadas
    - Fase 3: Para a Scheduled Task e executa o agente manualmente com logging verboso

.PARAMETER ExpectedToken
    Token esperado do banco de dados (obrigatório)

.PARAMETER ExpectedHmac
    HMAC Secret esperado do banco de dados (obrigatório)

.PARAMETER AgentName
    Nome do agente (padrão: "teste")

.PARAMETER ServerUrl
    URL do servidor Supabase (padrão: "https://iavbnmduxpxhwubqrzzn.supabase.co")

.EXAMPLE
    .\validate-and-test-agent.ps1 -ExpectedToken "3c7b76eb-ac97-466d-a63e-6f628e9b6131" -ExpectedHmac "a98ddad44344fe91153efe84eae03fd74074425656714d41a831076eaf38713c"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ExpectedToken,

    [Parameter(Mandatory=$true)]
    [string]$ExpectedHmac,

    [Parameter(Mandatory=$false)]
    [string]$AgentName = "teste",

    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
)

$ErrorActionPreference = "Stop"
$scriptDir = "C:\CyberShield"
$agentScript = Join-Path $scriptDir "cybershield-agent-$AgentName.ps1"
$logFile = "C:\CyberShield\logs\cybershield-agent-v3.log"

Write-Host "`n" -NoNewline
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  🔍 FASE 2 & 3: Validação de Credenciais e Teste Manual" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# FASE 2: VALIDAR CREDENCIAIS NO SCRIPT
# ============================================================================
Write-Host "[Fase 2] Validando credenciais no script gerado..." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path $agentScript)) {
    Write-Host "❌ ERRO: Script não encontrado: $agentScript" -ForegroundColor Red
    Write-Host "   Certifique-se de que o instalador foi executado primeiro." -ForegroundColor Red
    exit 1
}

Write-Host "✅ Script encontrado: $agentScript" -ForegroundColor Green

# Extrair parâmetros do script
$scriptContent = Get-Content $agentScript -Raw

# Procurar pelos valores de AgentToken e HmacSecret no script
$tokenPattern = '\$AgentToken\s*=\s*[''"]([^''"]+)[''"]'
$hmacPattern = '\$HmacSecret\s*=\s*[''"]([^''"]+)[''"]'

$tokenMatch = [regex]::Match($scriptContent, $tokenPattern)
$hmacMatch = [regex]::Match($scriptContent, $hmacPattern)

$foundToken = if ($tokenMatch.Success) { $tokenMatch.Groups[1].Value } else { "NÃO ENCONTRADO" }
$foundHmac = if ($hmacMatch.Success) { $hmacMatch.Groups[1].Value } else { "NÃO ENCONTRADO" }

Write-Host ""
Write-Host "=== Credenciais Esperadas (Banco de Dados) ===" -ForegroundColor Cyan
Write-Host "Token:  $ExpectedToken" -ForegroundColor White
Write-Host "HMAC:   $ExpectedHmac" -ForegroundColor White
Write-Host ""
Write-Host "=== Credenciais Encontradas (Script Gerado) ===" -ForegroundColor Cyan
Write-Host "Token:  $foundToken" -ForegroundColor White
Write-Host "HMAC:   $foundHmac" -ForegroundColor White
Write-Host ""

$tokenMatch = $foundToken -eq $ExpectedToken
$hmacMatch = $foundHmac -eq $ExpectedHmac

if ($tokenMatch -and $hmacMatch) {
    Write-Host "✅ SUCESSO: Credenciais no script correspondem ao banco!" -ForegroundColor Green
} else {
    Write-Host "❌ ERRO: Credenciais NÃO correspondem!" -ForegroundColor Red
    if (-not $tokenMatch) {
        Write-Host "   ⚠️  AgentToken diferente" -ForegroundColor Yellow
    }
    if (-not $hmacMatch) {
        Write-Host "   ⚠️  HmacSecret diferente" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "⚠️  RECOMENDAÇÃO:" -ForegroundColor Yellow
    Write-Host "   1. Vá para o dashboard -> Agent Installer" -ForegroundColor White
    Write-Host "   2. Selecione o agente '$AgentName'" -ForegroundColor White
    Write-Host "   3. Clique em 'Gerar Comando' (não Download)" -ForegroundColor White
    Write-Host "   4. Execute o comando gerado nesta VM como Admin" -ForegroundColor White
    Write-Host ""
    
    $continue = Read-Host "Deseja continuar com a Fase 3 mesmo assim? (S/N)"
    if ($continue -ne "S" -and $continue -ne "s") {
        Write-Host "Operação cancelada pelo usuário." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# FASE 3: EXECUÇÃO MANUAL PARA DEBUG
# ============================================================================
Write-Host "[Fase 3] Executando agente manualmente com logging verboso..." -ForegroundColor Yellow
Write-Host ""

$taskName = "CyberShieldAgent-$AgentName"

# Parar Scheduled Task se estiver rodando
Write-Host "🛑 Parando Scheduled Task '$taskName'..." -ForegroundColor Cyan
try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "✅ Task parada com sucesso" -ForegroundColor Green
    } else {
        Write-Host "⚠️  Task não encontrada (normal se for primeira execução)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "⚠️  Erro ao parar task (pode não existir): $($_.Exception.Message)" -ForegroundColor Yellow
}

# Limpar log antigo
if (Test-Path $logFile) {
    Write-Host "🗑️  Limpando log antigo..." -ForegroundColor Cyan
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "🚀 Executando agente manualmente..." -ForegroundColor Cyan
Write-Host "   Script:  $agentScript" -ForegroundColor White
Write-Host "   Token:   $ExpectedToken" -ForegroundColor White
Write-Host "   HMAC:    $ExpectedHmac" -ForegroundColor White
Write-Host "   Server:  $ServerUrl" -ForegroundColor White
Write-Host ""

# Executar o agente manualmente
try {
    $processArgs = @(
        "-NoProfile",
        "-ExecutionPolicy", "Bypass",
        "-File", "`"$agentScript`"",
        "-ServerUrl", "`"$ServerUrl`"",
        "-AgentToken", "`"$ExpectedToken`"",
        "-HmacSecret", "`"$ExpectedHmac`"",
        "-AgentName", "`"$AgentName`""
    )
    
    Write-Host "Comando completo:" -ForegroundColor Gray
    Write-Host "powershell.exe $($processArgs -join ' ')" -ForegroundColor Gray
    Write-Host ""
    
    $process = Start-Process -FilePath "powershell.exe" `
                             -ArgumentList $processArgs `
                             -PassThru `
                             -WindowStyle Normal
    
    Write-Host "✅ Processo iniciado (PID: $($process.Id))" -ForegroundColor Green
    Write-Host "⏳ Aguardando 15 segundos para o agente se autenticar..." -ForegroundColor Cyan
    
    Start-Sleep -Seconds 15
    
} catch {
    Write-Host "❌ ERRO ao iniciar processo: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# ANÁLISE DE LOGS
# ============================================================================
Write-Host "[Análise] Verificando logs gerados..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path $logFile) {
    Write-Host "✅ Log encontrado: $logFile" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== Últimas 50 linhas do log ===" -ForegroundColor Cyan
    Write-Host ""
    
    $logContent = Get-Content $logFile -Tail 50
    foreach ($line in $logContent) {
        if ($line -match "ERROR|❌|401") {
            Write-Host $line -ForegroundColor Red
        } elseif ($line -match "SUCCESS|✅|200") {
            Write-Host $line -ForegroundColor Green
        } elseif ($line -match "WARN|⚠️") {
            Write-Host $line -ForegroundColor Yellow
        } else {
            Write-Host $line -ForegroundColor White
        }
    }
    
    Write-Host ""
    Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
    Write-Host ""
    
    # Análise de erros específicos
    $has401 = $logContent | Select-String -Pattern "401|Unauthorized" -Quiet
    $hasSuccess = $logContent | Select-String -Pattern "Autenticado com sucesso|✅.*heartbeat" -Quiet
    $hasHmacError = $logContent | Select-String -Pattern "HMAC|signature" -Quiet
    
    if ($hasSuccess) {
        Write-Host "🎉 SUCESSO! Agente autenticado com sucesso!" -ForegroundColor Green
        Write-Host "   ✅ Heartbeat enviado ao backend" -ForegroundColor Green
        Write-Host "   ✅ Verificar dashboard para confirmar status 'Ativo'" -ForegroundColor Green
    } elseif ($has401) {
        Write-Host "❌ ERRO 401: Falha de autenticação detectada" -ForegroundColor Red
        if ($hasHmacError) {
            Write-Host "   ⚠️  Possível problema com cálculo de assinatura HMAC" -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Host "Diagnóstico provável:" -ForegroundColor Yellow
        Write-Host "  1. Credenciais no script não correspondem ao banco" -ForegroundColor White
        Write-Host "  2. HMAC secret inválido ou mal formatado" -ForegroundColor White
        Write-Host "  3. Token expirado ou revogado" -ForegroundColor White
        Write-Host ""
        Write-Host "Próximos passos:" -ForegroundColor Cyan
        Write-Host "  1. Gerar novo instalador no dashboard" -ForegroundColor White
        Write-Host "  2. Usar 'Gerar Comando' (não Download)" -ForegroundColor White
        Write-Host "  3. Executar comando diretamente nesta VM" -ForegroundColor White
    } else {
        Write-Host "⚠️  Status indeterminado" -ForegroundColor Yellow
        Write-Host "   Verificar log completo para mais detalhes" -ForegroundColor White
    }
    
} else {
    Write-Host "❌ ERRO: Log não foi criado!" -ForegroundColor Red
    Write-Host "   Isso indica que o agente falhou antes de conseguir logar." -ForegroundColor Red
    Write-Host ""
    Write-Host "Possíveis causas:" -ForegroundColor Yellow
    Write-Host "  1. Script bloqueado pelo Windows (Zone.Identifier)" -ForegroundColor White
    Write-Host "  2. ExecutionPolicy muito restritiva" -ForegroundColor White
    Write-Host "  3. Sintaxe PowerShell inválida no script" -ForegroundColor White
    Write-Host ""
    Write-Host "Próximos passos:" -ForegroundColor Cyan
    Write-Host "  1. Executar: Unblock-File -Path '$agentScript'" -ForegroundColor White
    Write-Host "  2. Verificar Event Viewer (Application log)" -ForegroundColor White
    Write-Host "  3. Executar script de diagnóstico completo (fix-agent-installation.ps1)" -ForegroundColor White
}

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# VERIFICAR PROCESSO
# ============================================================================
Write-Host "[Status] Verificando se o agente ainda está em execução..." -ForegroundColor Yellow
Write-Host ""

$agentProcesses = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -like "*cybershield-agent-$AgentName.ps1*" }

if ($agentProcesses) {
    Write-Host "✅ Agente está rodando (PID: $($agentProcesses.Id -join ', '))" -ForegroundColor Green
    Write-Host "   Use 'Get-Content $logFile -Wait' para monitorar em tempo real" -ForegroundColor Cyan
} else {
    Write-Host "⚠️  Processo do agente não encontrado" -ForegroundColor Yellow
    Write-Host "   O agente pode ter terminado ou crasheado" -ForegroundColor White
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  ✅ Diagnóstico Fase 2 & 3 Concluído" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "📊 Próximos passos:" -ForegroundColor Cyan
Write-Host "   1. Verificar dashboard (https://seu-dashboard/admin/agents)" -ForegroundColor White
Write-Host "   2. Se ainda 'pending', gerar novo instalador" -ForegroundColor White
Write-Host "   3. Se necessário, executar fix-agent-installation.ps1" -ForegroundColor White
Write-Host ""
