# CyberShield Agent - Post-Installation Validation Script
# Version: 1.0.0
# Este script valida se o agente instalado está funcionando 100%

#Requires -Version 5.1
#Requires -RunAsAdministrator

param(
    [Parameter(Mandatory=$false)]
    [string]$AgentName,
    
    [Parameter(Mandatory=$false)]
    [int]$TestDurationMinutes = 3
)

$ErrorActionPreference = "Stop"

Write-Host ""
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "CyberShield - Validação Pós-Instalação" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

# Variáveis
$InstallDir = "C:\CyberShield"
$LogFile = Join-Path $InstallDir "logs\agent.log"
$TaskName = "CyberShield Agent"
$ValidationResults = @{
    InstallationCheck = $false
    TaskSchedulerCheck = $false
    FirewallCheck = $false
    HeartbeatCheck = $false
    MetricsCheck = $false
    LogFileCheck = $false
    ProcessCheck = $false
}

# Função para exibir resultado
function Write-TestResult {
    param(
        [string]$TestName,
        [bool]$Passed,
        [string]$Details = ""
    )
    
    if ($Passed) {
        Write-Host "✓ " -ForegroundColor Green -NoNewline
        Write-Host "$TestName" -ForegroundColor White
        if ($Details) {
            Write-Host "  $Details" -ForegroundColor Gray
        }
    } else {
        Write-Host "✗ " -ForegroundColor Red -NoNewline
        Write-Host "$TestName" -ForegroundColor White
        if ($Details) {
            Write-Host "  $Details" -ForegroundColor Yellow
        }
    }
}

Write-Host "[1/7] Verificando instalação..." -ForegroundColor Cyan
try {
    $dirExists = Test-Path $InstallDir
    $scriptExists = Test-Path (Join-Path $InstallDir "cybershield-agent.ps1")
    $logDirExists = Test-Path (Join-Path $InstallDir "logs")
    
    $ValidationResults.InstallationCheck = $dirExists -and $scriptExists -and $logDirExists
    
    Write-TestResult -TestName "Diretório de instalação" -Passed $dirExists -Details $InstallDir
    Write-TestResult -TestName "Script do agente" -Passed $scriptExists
    Write-TestResult -TestName "Diretório de logs" -Passed $logDirExists
} catch {
    Write-Host "✗ Erro ao verificar instalação: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "[2/7] Verificando Agendador de Tarefas..." -ForegroundColor Cyan
try {
    $task = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    $taskExists = $null -ne $task
    $taskRunning = $task.State -eq "Running"
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName -ErrorAction SilentlyContinue
    
    $ValidationResults.TaskSchedulerCheck = $taskExists -and ($taskRunning -or $taskInfo.LastRunTime)
    
    Write-TestResult -TestName "Tarefa existe" -Passed $taskExists
    Write-TestResult -TestName "Tarefa em execução" -Passed $taskRunning -Details "Estado: $($task.State)"
    if ($taskInfo.LastRunTime) {
        Write-TestResult -TestName "Última execução" -Passed $true -Details $taskInfo.LastRunTime
    }
} catch {
    Write-Host "✗ Erro ao verificar tarefa: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "[3/7] Verificando Firewall..." -ForegroundColor Cyan
try {
    $fwRule = Get-NetFirewallRule -DisplayName "CyberShield Agent" -ErrorAction SilentlyContinue
    $ruleExists = $null -ne $fwRule
    $ruleEnabled = $fwRule.Enabled -eq "True"
    
    $ValidationResults.FirewallCheck = $ruleExists -and $ruleEnabled
    
    Write-TestResult -TestName "Regra de firewall existe" -Passed $ruleExists
    Write-TestResult -TestName "Regra habilitada" -Passed $ruleEnabled
} catch {
    Write-Host "✗ Erro ao verificar firewall: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "[4/7] Verificando arquivo de log..." -ForegroundColor Cyan
try {
    $logExists = Test-Path $LogFile
    $ValidationResults.LogFileCheck = $logExists
    
    if ($logExists) {
        $logContent = Get-Content $LogFile -Tail 20 -ErrorAction SilentlyContinue
        $logSize = (Get-Item $LogFile).Length
        $lastModified = (Get-Item $LogFile).LastWriteTime
        
        Write-TestResult -TestName "Arquivo de log existe" -Passed $true
        Write-TestResult -TestName "Última modificação" -Passed $true -Details $lastModified
        Write-TestResult -TestName "Tamanho do log" -Passed $true -Details "$([math]::Round($logSize/1KB, 2)) KB"
        
        # Verificar erros críticos no log
        $hasErrors = $logContent | Where-Object { $_ -match "ERROR|FATAL|CRITICAL" }
        if ($hasErrors) {
            Write-Host "  ⚠ Erros encontrados nos logs:" -ForegroundColor Yellow
            $hasErrors | Select-Object -First 5 | ForEach-Object {
                Write-Host "    $_" -ForegroundColor Gray
            }
        }
    } else {
        Write-TestResult -TestName "Arquivo de log" -Passed $false -Details "Log não encontrado em $LogFile"
    }
} catch {
    Write-Host "✗ Erro ao verificar logs: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "[5/7] Verificando processos PowerShell..." -ForegroundColor Cyan
try {
    $processes = Get-Process -Name "powershell" -ErrorAction SilentlyContinue | 
                 Where-Object { $_.CommandLine -like "*cybershield-agent.ps1*" }
    
    $hasProcess = $null -ne $processes
    $ValidationResults.ProcessCheck = $hasProcess
    
    Write-TestResult -TestName "Processo do agente ativo" -Passed $hasProcess
    if ($hasProcess) {
        Write-Host "  Processos encontrados: $($processes.Count)" -ForegroundColor Gray
    }
} catch {
    Write-Host "✗ Erro ao verificar processos: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "[6/7] Verificando heartbeats no log..." -ForegroundColor Cyan
try {
    if (Test-Path $LogFile) {
        $recentLogs = Get-Content $LogFile -Tail 50 -ErrorAction SilentlyContinue
        $heartbeats = $recentLogs | Where-Object { $_ -match "Heartbeat enviado com sucesso|Sending heartbeat" }
        $hasHeartbeats = ($heartbeats.Count -gt 0)
        
        $ValidationResults.HeartbeatCheck = $hasHeartbeats
        
        Write-TestResult -TestName "Heartbeats detectados" -Passed $hasHeartbeats -Details "Encontrados: $($heartbeats.Count)"
        
        if ($hasHeartbeats) {
            $lastHeartbeat = $heartbeats | Select-Object -Last 1
            Write-Host "  Último heartbeat: $lastHeartbeat" -ForegroundColor Gray
        }
    } else {
        Write-TestResult -TestName "Heartbeats" -Passed $false -Details "Log não disponível"
    }
} catch {
    Write-Host "✗ Erro ao verificar heartbeats: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

Write-Host "[7/7] Verificando métricas do sistema no log..." -ForegroundColor Cyan
try {
    if (Test-Path $LogFile) {
        $recentLogs = Get-Content $LogFile -Tail 50 -ErrorAction SilentlyContinue
        $metrics = $recentLogs | Where-Object { $_ -match "Métricas enviadas com sucesso|System metrics sent|CPU:|Memory:" }
        $hasMetrics = ($metrics.Count -gt 0)
        
        $ValidationResults.MetricsCheck = $hasMetrics
        
        Write-TestResult -TestName "Métricas detectadas" -Passed $hasMetrics -Details "Encontradas: $($metrics.Count)"
        
        if ($hasMetrics) {
            $lastMetric = $metrics | Select-Object -Last 1
            Write-Host "  Última métrica: $lastMetric" -ForegroundColor Gray
        }
    } else {
        Write-TestResult -TestName "Métricas" -Passed $false -Details "Log não disponível"
    }
} catch {
    Write-Host "✗ Erro ao verificar métricas: $($_.Exception.Message)" -ForegroundColor Red
}
Write-Host ""

# Teste de operação contínua
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "TESTE DE OPERAÇÃO CONTÍNUA" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Monitorando por $TestDurationMinutes minuto(s)..." -ForegroundColor Yellow
Write-Host ""

$startTime = Get-Date
$endTime = $startTime.AddMinutes($TestDurationMinutes)
$heartbeatCount = 0
$metricsCount = 0
$lastLogSize = 0

if (Test-Path $LogFile) {
    $lastLogSize = (Get-Item $LogFile).Length
}

while ((Get-Date) -lt $endTime) {
    $remaining = ($endTime - (Get-Date)).TotalSeconds
    Write-Host "`rTempo restante: $([math]::Round($remaining)) segundos..." -NoNewline -ForegroundColor Cyan
    
    Start-Sleep -Seconds 10
    
    # Verificar se log está crescendo
    if (Test-Path $LogFile) {
        $currentLogSize = (Get-Item $LogFile).Length
        if ($currentLogSize -gt $lastLogSize) {
            $newLogs = Get-Content $LogFile -Tail 20
            $newHeartbeats = ($newLogs | Where-Object { $_ -match "Heartbeat enviado|Sending heartbeat" }).Count
            $newMetrics = ($newLogs | Where-Object { $_ -match "Métricas enviadas|System metrics sent" }).Count
            
            $heartbeatCount += $newHeartbeats
            $metricsCount += $newMetrics
            $lastLogSize = $currentLogSize
        }
    }
}

Write-Host "`r" -NoNewline
Write-Host ""
Write-Host "Monitoramento concluído!" -ForegroundColor Green
Write-Host "  • Heartbeats detectados: $heartbeatCount" -ForegroundColor White
Write-Host "  • Envios de métricas detectados: $metricsCount" -ForegroundColor White
Write-Host ""

# Relatório Final
Write-Host "============================================" -ForegroundColor Cyan
Write-Host "RELATÓRIO FINAL DE VALIDAÇÃO" -ForegroundColor Cyan
Write-Host "============================================" -ForegroundColor Cyan
Write-Host ""

$passedTests = ($ValidationResults.Values | Where-Object { $_ -eq $true }).Count
$totalTests = $ValidationResults.Count
$successRate = [math]::Round(($passedTests / $totalTests) * 100, 0)

Write-Host "Testes Aprovados: $passedTests / $totalTests ($successRate%)" -ForegroundColor White
Write-Host ""

foreach ($test in $ValidationResults.GetEnumerator()) {
    Write-TestResult -TestName $test.Key -Passed $test.Value
}

Write-Host ""

if ($passedTests -eq $totalTests -and $heartbeatCount -gt 0 -and $metricsCount -gt 0) {
    Write-Host "✓ VALIDAÇÃO 100% APROVADA!" -ForegroundColor Green
    Write-Host "  O agente está funcionando perfeitamente." -ForegroundColor White
    Write-Host ""
    exit 0
} elseif ($passedTests -ge 5 -and $heartbeatCount -gt 0) {
    Write-Host "⚠ VALIDAÇÃO PARCIAL" -ForegroundColor Yellow
    Write-Host "  O agente está funcionando, mas alguns componentes precisam de atenção." -ForegroundColor White
    Write-Host ""
    exit 1
} else {
    Write-Host "✗ VALIDAÇÃO FALHOU" -ForegroundColor Red
    Write-Host "  O agente não está funcionando corretamente. Verifique os logs e a instalação." -ForegroundColor White
    Write-Host ""
    Write-Host "PRÓXIMOS PASSOS:" -ForegroundColor Yellow
    Write-Host "  1. Verificar logs em: $LogFile" -ForegroundColor White
    Write-Host "  2. Reiniciar o agente: Start-ScheduledTask -TaskName '$TaskName'" -ForegroundColor White
    Write-Host "  3. Verificar conectividade de rede" -ForegroundColor White
    Write-Host "  4. Contatar suporte: gamehousetecnologia@gmail.com" -ForegroundColor White
    Write-Host ""
    exit 2
}
