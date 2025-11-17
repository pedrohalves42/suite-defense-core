# recreate-agent-task.ps1
# Recria a Scheduled Task do CyberShield Agent com credenciais corretas
# Uso: .\recreate-agent-task.ps1 -AgentToken "xxx" -HmacSecret "yyy" -AgentName "zzz"

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentToken,
    
    [Parameter(Mandatory=$true)]
    [string]$HmacSecret,
    
    [Parameter(Mandatory=$true)]
    [string]$AgentName,
    
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co",
    [string]$ScriptPath = "C:\CyberShield\cybershield-agent.ps1",
    [int]$PollInterval = 60,
    [string]$TaskName = "CyberShieldAgent"
)

Write-Host "`n🔧 CyberShield Agent Task Recreator" -ForegroundColor Cyan
Write-Host "==================================`n" -ForegroundColor Cyan

# Validações
if (-not (Test-Path $ScriptPath)) {
    Write-Host "❌ Erro: Script não encontrado em $ScriptPath" -ForegroundColor Red
    exit 1
}

Write-Host "📋 Configuração:" -ForegroundColor Cyan
Write-Host "   Agent Name: $AgentName" -ForegroundColor Gray
Write-Host "   Agent Token: $($AgentToken.Substring(0, 8))..." -ForegroundColor Gray
Write-Host "   HMAC Secret: $($HmacSecret.Substring(0, 8))..." -ForegroundColor Gray
Write-Host "   Server URL: $ServerUrl" -ForegroundColor Gray
Write-Host "   Script Path: $ScriptPath" -ForegroundColor Gray
Write-Host "   Poll Interval: ${PollInterval}s" -ForegroundColor Gray
Write-Host "   Task Name: $TaskName`n" -ForegroundColor Gray

# Remover task existente
Write-Host "🗑️  Removendo task existente (se houver)..." -ForegroundColor Yellow
try {
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Write-Host "   ✅ Task anterior removida" -ForegroundColor Green
    } else {
        Write-Host "   ℹ️  Nenhuma task anterior encontrada" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ⚠️  Erro ao remover task anterior: $_" -ForegroundColor Yellow
}

# Criar action
Write-Host "`n🔨 Criando nova task..." -ForegroundColor Cyan

$actionArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" " +
              "-AgentToken `"$AgentToken`" " +
              "-HmacSecret `"$HmacSecret`" " +
              "-ServerUrl `"$ServerUrl`" " +
              "-AgentName `"$AgentName`" " +
              "-PollInterval $PollInterval"

try {
    $action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
    
    # Criar triggers (startup + repetição a cada 5 minutos)
    $trigger1 = New-ScheduledTaskTrigger -AtStartup
    $trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
    
    # Configurar para rodar como SYSTEM
    $principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    
    # Configurações adicionais
    $settings = New-ScheduledTaskSettingsSet `
        -AllowStartIfOnBatteries `
        -DontStopIfGoingOnBatteries `
        -StartWhenAvailable `
        -RestartCount 3 `
        -RestartInterval (New-TimeSpan -Minutes 1)
    
    # Registrar task
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger1, $trigger2 `
        -Principal $principal `
        -Settings $settings `
        -Force | Out-Null
    
    Write-Host "   ✅ Task criada com sucesso" -ForegroundColor Green
    
    # Iniciar task
    Write-Host "`n▶️  Iniciando task..." -ForegroundColor Cyan
    Start-ScheduledTask -TaskName $TaskName
    Start-Sleep -Seconds 2
    
    # Verificar status
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    Write-Host "   Estado: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
    Write-Host "   Última execução: $($taskInfo.LastRunTime)" -ForegroundColor Gray
    Write-Host "   Próxima execução: $($taskInfo.NextRunTime)" -ForegroundColor Gray
    
    Write-Host "`n🎉 Task recriada e iniciada com sucesso!" -ForegroundColor Green
    Write-Host "`n📝 Próximos passos:" -ForegroundColor Cyan
    Write-Host "   1. Aguarde ~60 segundos" -ForegroundColor Gray
    Write-Host "   2. Verifique logs em C:\CyberShield\logs\agent.log" -ForegroundColor Gray
    Write-Host "   3. Confirme heartbeat no dashboard" -ForegroundColor Gray
    Write-Host ""
    
    exit 0
    
} catch {
    Write-Host "`n❌ Erro ao criar task: $_" -ForegroundColor Red
    exit 1
}
