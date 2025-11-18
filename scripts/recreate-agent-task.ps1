#Requires -RunAsAdministrator

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
    [string]$ScriptPath = "C:\CyberShield\cybershield-agent-windows-v3.ps1",
    [int]$PollInterval = 60,
    [string]$TaskName = "CyberShieldAgent"
)

$ErrorActionPreference = "Stop"

Write-Host "`n╔════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  CYBER SHIELD - AGENT TASK RECREATOR       ║" -ForegroundColor Cyan
Write-Host "╚════════════════════════════════════════════╝`n" -ForegroundColor Cyan

# Validações iniciais
Write-Host "=== Validando parâmetros ===" -ForegroundColor Cyan
Write-Host "AgentToken: $($AgentToken.Substring(0, 8))..." -ForegroundColor Gray
Write-Host "HmacSecret: $($HmacSecret.Substring(0, 8))..." -ForegroundColor Gray
Write-Host "AgentName: $AgentName" -ForegroundColor Gray
Write-Host "ScriptPath: $ScriptPath" -ForegroundColor Gray

# Verificar se o script existe
if (-not (Test-Path $ScriptPath)) {
    Write-Error "Script não encontrado em: $ScriptPath"
    Write-Host "Certifique-se de que o arquivo existe antes de continuar." -ForegroundColor Red
    exit 1
}
Write-Host "✓ Script encontrado" -ForegroundColor Green

# Parar e remover processos antigos
Write-Host "`n=== Limpando processos antigos ===" -ForegroundColor Cyan
$oldProcesses = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'cybershield-agent.*ps1' }
if ($oldProcesses) {
    Write-Host "Encontrados $($oldProcesses.Count) processos antigos. Finalizando..." -ForegroundColor Yellow
    $oldProcesses | ForEach-Object { 
        try {
            Stop-Process -Id $_.ProcessId -Force -ErrorAction Stop
            Write-Host "  ✓ Processo $($_.ProcessId) finalizado" -ForegroundColor Gray
        } catch {
            Write-Host "  ⚠ Não foi possível finalizar processo $($_.ProcessId)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "✓ Nenhum processo antigo encontrado" -ForegroundColor Green
}

# Parar e remover tarefa existente
Write-Host "`n=== Removendo tarefa agendada existente ===" -ForegroundColor Cyan
try {
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Write-Host "✓ Tarefa removida" -ForegroundColor Green
    } else {
        Write-Host "✓ Nenhuma tarefa existente encontrada" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ Aviso ao remover tarefa: $_" -ForegroundColor Yellow
}

# Criar nova tarefa
Write-Host "`n=== Criando nova tarefa agendada ===" -ForegroundColor Cyan

$actionArgs = "-NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File `"$ScriptPath`" " +
              "-AgentToken `"$AgentToken`" " +
              "-HmacSecret `"$HmacSecret`" " +
              "-ServerUrl `"$ServerUrl`" " +
              "-AgentName `"$AgentName`" " +
              "-PollInterval $PollInterval"

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument $actionArgs
$trigger1 = New-ScheduledTaskTrigger -AtStartup
$trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes 5)
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet `
    -AllowStartIfOnBatteries `
    -DontStopIfGoingOnBatteries `
    -StartWhenAvailable `
    -RestartCount 3 `
    -RestartInterval (New-TimeSpan -Minutes 1)

try {
    Register-ScheduledTask `
        -TaskName $TaskName `
        -Action $action `
        -Trigger $trigger1, $trigger2 `
        -Principal $principal `
        -Settings $settings `
        -Force | Out-Null
    Write-Host "✓ Tarefa registrada" -ForegroundColor Green
} catch {
    Write-Error "Falha ao registrar tarefa: $_"
    exit 1
}

# Iniciar a tarefa
Write-Host "`n=== Iniciando tarefa ===" -ForegroundColor Cyan
Start-ScheduledTask -TaskName $TaskName
Start-Sleep -Seconds 2
Write-Host "✓ Tarefa iniciada" -ForegroundColor Green

# Verificar argumentos efetivos
Write-Host "`n=== Verificação ===" -ForegroundColor Cyan
$task = Get-ScheduledTask -TaskName $TaskName
$actualArgs = $task.Actions[0].Arguments

if ($actualArgs -match [regex]::Escape($AgentToken.Substring(0, 8))) {
    Write-Host "✓ AgentToken correto" -ForegroundColor Green
}
if ($actualArgs -match [regex]::Escape($HmacSecret.Substring(0, 8))) {
    Write-Host "✓ HmacSecret correto" -ForegroundColor Green
}
if ($actualArgs -match [regex]::Escape($AgentName)) {
    Write-Host "✓ AgentName correto" -ForegroundColor Green
}

Write-Host "`n╔════════════════════════════════════════════╗" -ForegroundColor Green
Write-Host "║      ✓ TAREFA CRIADA COM SUCESSO           ║" -ForegroundColor Green
Write-Host "╚════════════════════════════════════════════╝" -ForegroundColor Green

Write-Host "`nPróximos passos:" -ForegroundColor Yellow
Write-Host "1. Aguarde 30-60 segundos para o agente inicializar"
Write-Host "2. Verifique os logs:" -ForegroundColor Cyan
Write-Host "   Get-Content C:\CyberShield\logs\agent.log -Tail 50 -Wait" -ForegroundColor White
Write-Host "3. Procure por '[INFO] ✅ Autenticado com sucesso'"
Write-Host "4. Verifique o dashboard em /admin/agent-health"
Write-Host "`nPara diagnóstico detalhado:" -ForegroundColor Yellow
Write-Host "   .\scripts\validate-agent-config.ps1 -AgentName $AgentName" -ForegroundColor White
