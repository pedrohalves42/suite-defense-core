#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Valida credenciais do agente e executa teste manual com debug detalhado.

.DESCRIPTION
    Este script executa as Fases 2 e 3 do plano de troubleshooting:
    - Fase 2: Valida credenciais no script gerado vs credenciais esperadas
    - Fase 3: Para a Scheduled Task e executa o agente manualmente com logging verboso

.PARAMETER ExpectedToken
    Token esperado do banco de dados (obrigatorio)

.PARAMETER ExpectedHmac
    HMAC Secret esperado do banco de dados (obrigatorio)

.PARAMETER AgentName
    Nome do agente (padrao: "teste")

.PARAMETER ServerUrl
    URL do servidor (padrao: "https://your-project.supabase.co")

.EXAMPLE
    .\validate-and-test-agent.ps1 -ExpectedToken "00000000-0000-0000-0000-000000000000" -ExpectedHmac "0000000000000000000000000000000000000000000000000000000000000000"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$ExpectedToken,

    [Parameter(Mandatory=$true)]
    [string]$ExpectedHmac,

    [Parameter(Mandatory=$false)]
    [string]$AgentName = "teste",

    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "https://your-project.supabase.co"
)

$ErrorActionPreference = "Stop"
$scriptDir = "C:\CyberShield"
$agentScript = Join-Path $scriptDir "cybershield-agent-$AgentName.ps1"
$logFile = "C:\CyberShield\logs\cybershield-agent-v3.log"

Write-Host "`n" -NoNewline
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  [SCAN]  FASE 2 & 3: Validacao de Credenciais e Teste Manual" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""

# ============================================================================
# FASE 2: VALIDAR CREDENCIAIS NO SCRIPT
# ============================================================================
Write-Host "[Fase 2] Validando credenciais no script gerado..." -ForegroundColor Yellow
Write-Host ""

if (-not (Test-Path $agentScript)) {
    Write-Host "[ERROR]  ERRO: Script nao encontrado: $agentScript" -ForegroundColor Red
    Write-Host "   Certifique-se de que o instalador foi executado primeiro." -ForegroundColor Red
    exit 1
}

Write-Host "[OK]  Script encontrado: $agentScript" -ForegroundColor Green

# Extrair parametros do script
$scriptContent = Get-Content $agentScript -Raw

# Procurar pelos valores de AgentToken e HmacSecret no script
$tokenPattern = '\$AgentToken\s*=\s*[''"]([^''"]+)[''"]'
$hmacPattern = '\$HmacSecret\s*=\s*[''"]([^''"]+)[''"]'

$tokenMatch = [regex]::Match($scriptContent, $tokenPattern)
$hmacMatch = [regex]::Match($scriptContent, $hmacPattern)

$foundToken = if ($tokenMatch.Success) { $tokenMatch.Groups[1].Value } else { "NAO ENCONTRADO" }
$foundHmac = if ($hmacMatch.Success) { $hmacMatch.Groups[1].Value } else { "NAO ENCONTRADO" }

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
    Write-Host "[OK]  SUCESSO: Credenciais no script correspondem ao banco!" -ForegroundColor Green
} else {
    Write-Host "[ERROR]  ERRO: Credenciais NAO correspondem!" -ForegroundColor Red
    if (-not $tokenMatch) {
        Write-Host "   [WARN] ?  AgentToken diferente" -ForegroundColor Yellow
    }
    if (-not $hmacMatch) {
        Write-Host "   [WARN] ?  HmacSecret diferente" -ForegroundColor Yellow
    }
    Write-Host ""
    Write-Host "[WARN] ?  RECOMENDACAO:" -ForegroundColor Yellow
    Write-Host "   1. Va para o dashboard -> Agent Installer" -ForegroundColor White
    Write-Host "   2. Selecione o agente '$AgentName'" -ForegroundColor White
    Write-Host "   3. Clique em 'Gerar Comando' (nao Download)" -ForegroundColor White
    Write-Host "   4. Execute o comando gerado nesta VM como Admin" -ForegroundColor White
    Write-Host ""
    
    $continue = Read-Host "Deseja continuar com a Fase 3 mesmo assim? (S/N)"
    if ($continue -ne "S" -and $continue -ne "s") {
        Write-Host "Operacao cancelada pelo usuario." -ForegroundColor Yellow
        exit 0
    }
}

Write-Host ""
Write-Host "?????????????????????????????????????????????????????????????????" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# FASE 3: EXECUCAO MANUAL PARA DEBUG
# ============================================================================
Write-Host "[Fase 3] Executando agente manualmente com logging verboso..." -ForegroundColor Yellow
Write-Host ""

$taskName = "CyberShieldAgent-$AgentName"

# Parar Scheduled Task se estiver rodando
Write-Host "? Parando Scheduled Task '$taskName'..." -ForegroundColor Cyan
try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "[OK]  Task parada com sucesso" -ForegroundColor Green
    } else {
        Write-Host "[WARN] ?  Task nao encontrada (normal se for primeira execucao)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "[WARN] ?  Erro ao parar task (pode nao existir): $($_.Exception.Message)" -ForegroundColor Yellow
}

# Limpar log antigo
if (Test-Path $logFile) {
    Write-Host "??  Limpando log antigo..." -ForegroundColor Cyan
    Remove-Item $logFile -Force -ErrorAction SilentlyContinue
}

Write-Host ""
Write-Host "? Executando agente manualmente..." -ForegroundColor Cyan
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
    
    Write-Host "[OK]  Processo iniciado (PID: $($process.Id))" -ForegroundColor Green
    Write-Host "? Aguardando 15 segundos para o agente se autenticar..." -ForegroundColor Cyan
    
    Start-Sleep -Seconds 15
    
} catch {
    Write-Host "[ERROR]  ERRO ao iniciar processo: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "?????????????????????????????????????????????????????????????????" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# ANALISE DE LOGS
# ============================================================================
Write-Host "[Analise] Verificando logs gerados..." -ForegroundColor Yellow
Write-Host ""

if (Test-Path $logFile) {
    Write-Host "[OK]  Log encontrado: $logFile" -ForegroundColor Green
    Write-Host ""
    Write-Host "=== Ultimas 50 linhas do log ===" -ForegroundColor Cyan
    Write-Host ""
    
    $logContent = Get-Content $logFile -Tail 50
    foreach ($line in $logContent) {
        if ($line -match "ERROR|[ERROR] |401") {
            Write-Host $line -ForegroundColor Red
        } elseif ($line -match "SUCCESS|[OK] |200") {
            Write-Host $line -ForegroundColor Green
        } elseif ($line -match "WARN|[WARN] ?") {
            Write-Host $line -ForegroundColor Yellow
        } else {
            Write-Host $line -ForegroundColor White
        }
    }
    
    Write-Host ""
    Write-Host "?????????????????????????????????????????????????????????????????" -ForegroundColor Gray
    Write-Host ""
    
    # Analise de erros especificos
    $has401 = $logContent | Select-String -Pattern "401|Unauthorized" -Quiet
    $hasSuccess = $logContent | Select-String -Pattern "Autenticado com sucesso|[OK] .*heartbeat" -Quiet
    $hasHmacError = $logContent | Select-String -Pattern "HMAC|signature" -Quiet
    
    if ($hasSuccess) {
        Write-Host "? SUCESSO! Agente autenticado com sucesso!" -ForegroundColor Green
        Write-Host "   [OK]  Heartbeat enviado ao backend" -ForegroundColor Green
        Write-Host "   [OK]  Verificar dashboard para confirmar status 'Ativo'" -ForegroundColor Green
    } elseif ($has401) {
        Write-Host "[ERROR]  ERRO 401: Falha de autenticacao detectada" -ForegroundColor Red
        if ($hasHmacError) {
            Write-Host "   [WARN] ?  Possivel problema com calculo de assinatura HMAC" -ForegroundColor Yellow
        }
        Write-Host ""
        Write-Host "Diagnostico provavel:" -ForegroundColor Yellow
        Write-Host "  1. Credenciais no script nao correspondem ao banco" -ForegroundColor White
        Write-Host "  2. HMAC secret invalido ou mal formatado" -ForegroundColor White
        Write-Host "  3. Token expirado ou revogado" -ForegroundColor White
        Write-Host ""
        Write-Host "Proximos passos:" -ForegroundColor Cyan
        Write-Host "  1. Gerar novo instalador no dashboard" -ForegroundColor White
        Write-Host "  2. Usar 'Gerar Comando' (nao Download)" -ForegroundColor White
        Write-Host "  3. Executar comando diretamente nesta VM" -ForegroundColor White
    } else {
        Write-Host "[WARN] ?  Status indeterminado" -ForegroundColor Yellow
        Write-Host "   Verificar log completo para mais detalhes" -ForegroundColor White
    }
    
} else {
    Write-Host "[ERROR]  ERRO: Log nao foi criado!" -ForegroundColor Red
    Write-Host "   Isso indica que o agente falhou antes de conseguir logar." -ForegroundColor Red
    Write-Host ""
    Write-Host "Possiveis causas:" -ForegroundColor Yellow
    Write-Host "  1. Script bloqueado pelo Windows (Zone.Identifier)" -ForegroundColor White
    Write-Host "  2. ExecutionPolicy muito restritiva" -ForegroundColor White
    Write-Host "  3. Sintaxe PowerShell invalida no script" -ForegroundColor White
    Write-Host ""
    Write-Host "Proximos passos:" -ForegroundColor Cyan
    Write-Host "  1. Executar: Unblock-File -Path '$agentScript'" -ForegroundColor White
    Write-Host "  2. Verificar Event Viewer (Application log)" -ForegroundColor White
    Write-Host "  3. Executar script de diagnostico completo (fix-agent-installation.ps1)" -ForegroundColor White
}

Write-Host ""
Write-Host "?????????????????????????????????????????????????????????????????" -ForegroundColor Gray
Write-Host ""

# ============================================================================
# VERIFICAR PROCESSO
# ============================================================================
Write-Host "[Status] Verificando se o agente ainda esta em execucao..." -ForegroundColor Yellow
Write-Host ""

$agentProcesses = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | 
    Where-Object { $_.CommandLine -like "*cybershield-agent-$AgentName.ps1*" }

if ($agentProcesses) {
    Write-Host "[OK]  Agente esta rodando (PID: $($agentProcesses.Id -join ', '))" -ForegroundColor Green
    Write-Host "   Use 'Get-Content $logFile -Wait' para monitorar em tempo real" -ForegroundColor Cyan
} else {
    Write-Host "[WARN] ?  Processo do agente nao encontrado" -ForegroundColor Yellow
    Write-Host "   O agente pode ter terminado ou crasheado" -ForegroundColor White
}

Write-Host ""
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host "  [OK]  Diagnostico Fase 2 & 3 Concluido" -ForegroundColor Cyan
Write-Host "=====================================================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "? Proximos passos:" -ForegroundColor Cyan
Write-Host "   1. Verificar dashboard (https://seu-dashboard/admin/agents)" -ForegroundColor White
Write-Host "   2. Se ainda 'pending', gerar novo instalador" -ForegroundColor White
Write-Host "   3. Se necessario, executar fix-agent-installation.ps1" -ForegroundColor White
Write-Host ""
