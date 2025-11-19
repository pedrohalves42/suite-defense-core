<#
.SYNOPSIS
    Re-deploy de agente CyberShield para usar script v3
.DESCRIPTION
    Para a Scheduled Task antiga, baixa o script v3 atualizado
    do backend e recria a tarefa apontando para a nova versão.
.EXAMPLE
    .\redeploy-agents-v3.ps1 `
      -ServerUrl "https://iavbnmduxpxhwubqrzzn.supabase.co" `
      -AgentToken "TOKEN_DO_AGENT" `
      -HmacSecret "HMAC_DO_AGENT" `
      -AgentName "NOME_DO_AGENT"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,

    [Parameter(Mandatory = $true)]
    [string]$AgentToken,

    [Parameter(Mandatory = $true)]
    [string]$HmacSecret,

    [Parameter(Mandatory = $true)]
    [string]$AgentName
)

$ErrorActionPreference = "Stop"

$TaskName   = "CyberShieldAgent"
$ScriptPath = "C:\CyberShield\cybershield-agent-windows-v3.ps1"

Write-Host "🔄 Re-deploy do agente '$AgentName' para v3..." -ForegroundColor Cyan

# 1) Parar e remover task antiga
Write-Host "[1/4] Parando Scheduled Task antiga..." -ForegroundColor Yellow
try {
    Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
} catch {
    Write-Host "⚠ Não foi possível parar/remover task antiga (pode já não existir): $($_.Exception.Message)" -ForegroundColor DarkYellow
}

# 2) Baixar script v3 do backend
Write-Host "[2/4] Baixando script v3 do backend..." -ForegroundColor Yellow
try {
    if (!(Test-Path "C:\CyberShield")) {
        New-Item -ItemType Directory -Path "C:\CyberShield" -Force | Out-Null
    }

    $downloadUrl = "$ServerUrl/functions/v1/setup-agent-script?platform=windows&version=v3"

    Invoke-WebRequest `
        -Uri $downloadUrl `
        -OutFile $ScriptPath `
        -UseBasicParsing

    # Garantir que o script v3 tem Submit-JobResult
    $hasSubmitJobResult = Select-String -Path $ScriptPath -Pattern "Submit-JobResult" -Quiet

    if (-not $hasSubmitJobResult) {
        throw "Script baixado não contém a função Submit-JobResult (não é v3)."
    }

    Write-Host "✅ Script v3 baixado e validado" -ForegroundColor Green
}
catch {
    Write-Host "❌ Erro ao baixar/validar script v3: $($_.Exception.Message)" -ForegroundColor Red
    exit 1
}

# 3) Recriar Scheduled Task apontando pro script v3
Write-Host "[3/4] Criando nova Scheduled Task..." -ForegroundColor Yellow

$escapedScriptPath = $ScriptPath.Replace('"', '\"')
$psExePath        = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"

$arguments = @(
    "-ExecutionPolicy Bypass"
    "-NoProfile"
    "-WindowStyle Hidden"
    "-File `"$escapedScriptPath`""
    "-ServerUrl `"$ServerUrl`""
    "-AgentToken `"$AgentToken`""
    "-HmacSecret `"$HmacSecret`""
    "-AgentName `"$AgentName`""
) -join ' '

$action    = New-ScheduledTaskAction -Execute $psExePath -Argument $arguments
$trigger   = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings  = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask `
    -TaskName $TaskName `
    -Action $action `
    -Trigger $trigger `
    -Principal $principal `
    -Settings $settings `
    -Description "CyberShield Security Agent v3" `
    -Force | Out-Null

# 4) Start e validação rápida
Write-Host "[4/4] Iniciando nova Scheduled Task..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 5

try {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "Última execução: $($taskInfo.LastRunTime), código: $($taskInfo.LastTaskResult)" -ForegroundColor DarkGray
} catch {
    Write-Host "⚠ Não foi possível obter informações da task: $($_.Exception.Message)" -ForegroundColor DarkYellow
}

Write-Host ""
Write-Host "✅ Redeploy concluído. Verifique o log do agente em:" -ForegroundColor Green
Write-Host "   C:\CyberShield\logs\cybershield-agent-v3.log" -ForegroundColor Cyan
