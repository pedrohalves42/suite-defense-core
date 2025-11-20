#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Valida a configuracao do agente CyberShield
.DESCRIPTION
    Verifica se o agente esta configurado corretamente e pode autenticar
.PARAMETER AgentName
    Nome do agente para validar
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$AgentName
)

$ErrorActionPreference = "Stop"

Write-Host "`n??????????????????????????????????????????????" -ForegroundColor Cyan
Write-Host "?   VALIDACAO DE CONFIGURACAO DO AGENTE      ?" -ForegroundColor Cyan
Write-Host "??????????????????????????????????????????????`n" -ForegroundColor Cyan

# 1. Verificar se o script existe
Write-Host "1??  Verificando arquivo do script..." -ForegroundColor Yellow
$scriptPath = "C:\CyberShield\cybershield-agent-windows-v3.ps1"
if (Test-Path $scriptPath) {
    Write-Host "   ? Script encontrado: $scriptPath" -ForegroundColor Green
    $scriptSize = (Get-Item $scriptPath).Length
    Write-Host "   ? Tamanho: $([math]::Round($scriptSize/1KB, 2)) KB" -ForegroundColor Green
} else {
    Write-Host "   ? Script NAO encontrado: $scriptPath" -ForegroundColor Red
    Write-Host "   Crie o arquivo antes de continuar" -ForegroundColor Red
    exit 1
}

# 2. Verificar scheduled task
Write-Host "`n2??  Verificando Scheduled Task..." -ForegroundColor Yellow
$taskName = "CyberShieldAgent"
$task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
if ($task) {
    Write-Host "   ? Task encontrada: $taskName" -ForegroundColor Green
    Write-Host "   ? Estado: $($task.State)" -ForegroundColor Green
    
    $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
    Write-Host "   ? Ultima execucao: $($taskInfo.LastRunTime)" -ForegroundColor Green
    Write-Host "   ? Ultimo resultado: $($taskInfo.LastTaskResult)" -ForegroundColor Green
    
    # Extrair credenciais dos argumentos
    $args = $task.Actions[0].Arguments
    Write-Host "`n   Argumentos da Task:" -ForegroundColor Cyan
    
    if ($args -match '-AgentToken\s+"?([a-f0-9\-]+)"?') {
        $taskToken = $matches[1]
        Write-Host "   AgentToken: $($taskToken.Substring(0, 8))..." -ForegroundColor Gray
    } else {
        Write-Host "   ? AgentToken NAO encontrado nos argumentos" -ForegroundColor Red
        $taskToken = $null
    }
    
    if ($args -match '-HmacSecret\s+"?([a-f0-9]+)"?') {
        $taskSecret = $matches[1]
        Write-Host "   HmacSecret: $($taskSecret.Substring(0, 8))..." -ForegroundColor Gray
    } else {
        Write-Host "   ? HmacSecret NAO encontrado nos argumentos" -ForegroundColor Red
        $taskSecret = $null
    }
    
    if ($args -match '-AgentName\s+"?([^"]+)"?') {
        $taskAgentName = $matches[1]
        Write-Host "   AgentName: $taskAgentName" -ForegroundColor Gray
        
        if ($taskAgentName -ne $AgentName) {
            Write-Host "   [WARN]  ATENCAO: Nome na task ($taskAgentName) diferente do esperado ($AgentName)" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ? AgentName NAO encontrado nos argumentos" -ForegroundColor Red
    }
} else {
    Write-Host "   ? Task NAO encontrada: $taskName" -ForegroundColor Red
    Write-Host "   Execute recreate-agent-task.ps1 para criar" -ForegroundColor Red
    exit 1
}

# 3. Verificar conteudo do script
Write-Host "`n3??  Verificando conteudo do script..." -ForegroundColor Yellow
$scriptContent = Get-Content $scriptPath -Raw
if ($scriptContent -match 'param\s*\([\s\S]*?\[string\]\$AgentToken\s*=\s*"([^"]+)"') {
    $scriptToken = $matches[1]
    Write-Host "   AgentToken no script: $($scriptToken.Substring(0, 8))..." -ForegroundColor Gray
} else {
    Write-Host "   [WARN]  AgentToken NAO encontrado no param() do script" -ForegroundColor Yellow
    $scriptToken = $null
}

if ($scriptContent -match 'param\s*\([\s\S]*?\[string\]\$HmacSecret\s*=\s*"([^"]+)"') {
    $scriptSecret = $matches[1]
    Write-Host "   HmacSecret no script: $($scriptSecret.Substring(0, 8))..." -ForegroundColor Gray
} else {
    Write-Host "   [WARN]  HmacSecret NAO encontrado no param() do script" -ForegroundColor Yellow
    $scriptSecret = $null
}

# 4. Comparar credenciais
Write-Host "`n4??  Comparando credenciais..." -ForegroundColor Yellow
if ($taskToken -and $scriptToken) {
    if ($taskToken -eq $scriptToken) {
        Write-Host "   ? AgentToken coincide (Task ? Script)" -ForegroundColor Green
    } else {
        Write-Host "   ? AgentToken DIFERENTE entre Task e Script!" -ForegroundColor Red
        Write-Host "     Task:   $($taskToken.Substring(0, 8))..." -ForegroundColor Red
        Write-Host "     Script: $($scriptToken.Substring(0, 8))..." -ForegroundColor Red
    }
}

if ($taskSecret -and $scriptSecret) {
    if ($taskSecret -eq $scriptSecret) {
        Write-Host "   ? HmacSecret coincide (Task ? Script)" -ForegroundColor Green
    } else {
        Write-Host "   ? HmacSecret DIFERENTE entre Task e Script!" -ForegroundColor Red
        Write-Host "     Task:   $($taskSecret.Substring(0, 8))..." -ForegroundColor Red
        Write-Host "     Script: $($scriptSecret.Substring(0, 8))..." -ForegroundColor Red
    }
}

# 5. Verificar logs recentes
Write-Host "`n5??  Verificando logs recentes..." -ForegroundColor Yellow
$logPath = "C:\CyberShield\logs\agent.log"
if (Test-Path $logPath) {
    $recentLogs = Get-Content $logPath -Tail 20 | Select-String -Pattern "(AgentToken|HmacSecret|401|Autenticado)" | Select-Object -Last 5
    if ($recentLogs) {
        Write-Host "   Ultimas entradas relevantes:" -ForegroundColor Cyan
        $recentLogs | ForEach-Object { Write-Host "   $_" -ForegroundColor Gray }
        
        $last401 = Get-Content $logPath -Tail 50 | Select-String -Pattern "401" | Select-Object -Last 1
        if ($last401) {
            Write-Host "`n   [WARN]  Ultimo erro 401 detectado:" -ForegroundColor Yellow
            Write-Host "   $last401" -ForegroundColor Red
        }
        
        $lastSuccess = Get-Content $logPath -Tail 50 | Select-String -Pattern "Autenticado com sucesso" | Select-Object -Last 1
        if ($lastSuccess) {
            Write-Host "`n   ? Ultima autenticacao bem-sucedida:" -ForegroundColor Green
            Write-Host "   $lastSuccess" -ForegroundColor Green
        }
    } else {
        Write-Host "   [INFO]  Nenhuma entrada de autenticacao encontrada nos logs recentes" -ForegroundColor Gray
    }
} else {
    Write-Host "   [WARN]  Arquivo de log nao encontrado: $logPath" -ForegroundColor Yellow
}

# 6. Verificar processos em execucao
Write-Host "`n6??  Verificando processos em execucao..." -ForegroundColor Yellow
$processes = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'cybershield-agent.*ps1' }
if ($processes) {
    Write-Host "   ? Encontrados $($processes.Count) processo(s) do agente" -ForegroundColor Green
    $processes | ForEach-Object {
        Write-Host "     PID: $($_.ProcessId)" -ForegroundColor Gray
    }
} else {
    Write-Host "   [WARN]  Nenhum processo do agente em execucao" -ForegroundColor Yellow
    Write-Host "     Execute: Start-ScheduledTask -TaskName $taskName" -ForegroundColor Cyan
}

# 7. Verificar conectividade
Write-Host "`n7??  Verificando conectividade..." -ForegroundColor Yellow
$serverUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
try {
    $response = Invoke-WebRequest -Uri "$serverUrl/functions/v1/" -Method HEAD -TimeoutSec 5 -UseBasicParsing
    Write-Host "   ? Conectividade com servidor OK (Status: $($response.StatusCode))" -ForegroundColor Green
} catch {
    Write-Host "   ? Falha ao conectar com servidor: $($_.Exception.Message)" -ForegroundColor Red
}

# 8. Verificar sincronizacao de relogio
Write-Host "`n8??  Verificando sincronizacao de relogio..." -ForegroundColor Yellow
try {
    $w32tm = w32tm /query /status 2>&1
    if ($LASTEXITCODE -eq 0) {
        $lastSync = $w32tm | Select-String "Last Successful Sync Time"
        if ($lastSync) {
            Write-Host "   ? Relogio sincronizado" -ForegroundColor Green
            Write-Host "   $lastSync" -ForegroundColor Gray
        }
    } else {
        Write-Host "   [WARN]  Nao foi possivel verificar sincronizacao (w32tm nao disponivel)" -ForegroundColor Yellow
    }
} catch {
    Write-Host "   [WARN]  Erro ao verificar sincronizacao: $($_.Exception.Message)" -ForegroundColor Yellow
}

# Resumo final
Write-Host "`n??????????????????????????????????????????????" -ForegroundColor Cyan
Write-Host "?            RESUMO DA VALIDACAO             ?" -ForegroundColor Cyan
Write-Host "??????????????????????????????????????????????" -ForegroundColor Cyan

$issues = @()
if (-not $taskToken -or -not $taskSecret) { $issues += "Credenciais ausentes na Scheduled Task" }
if ($taskToken -and $scriptToken -and $taskToken -ne $scriptToken) { $issues += "AgentToken divergente" }
if ($taskSecret -and $scriptSecret -and $taskSecret -ne $scriptSecret) { $issues += "HmacSecret divergente" }
if (-not $processes) { $issues += "Agente nao esta em execucao" }

if ($issues.Count -eq 0) {
    Write-Host "`n[OK]  CONFIGURACAO OK - Nenhum problema detectado" -ForegroundColor Green
    Write-Host "`nSe ainda houver erro 401, as credenciais podem estar incorretas no backend." -ForegroundColor Yellow
    Write-Host "Contate o administrador para verificar o banco de dados." -ForegroundColor Yellow
} else {
    Write-Host "`n[WARN]  PROBLEMAS DETECTADOS:" -ForegroundColor Red
    $issues | ForEach-Object { Write-Host "   ? $_" -ForegroundColor Red }
    Write-Host "`nRecomendacao: Execute recreate-agent-task.ps1 com as credenciais corretas" -ForegroundColor Yellow
}

Write-Host "`nPara monitorar logs em tempo real:" -ForegroundColor Cyan
Write-Host "Get-Content C:\CyberShield\logs\agent.log -Tail 50 -Wait" -ForegroundColor White
