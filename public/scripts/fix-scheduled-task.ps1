# ============================================================
# CyberShield - Fix Scheduled Task Script
# ============================================================
# Este script corrige tarefas agendadas com Duration problematica
# que impede a reinstalacao do agente.
# 
# Erro corrigido: Duration:P999999990T23H59M59S
# 
# Execute como Administrador antes de reinstalar o agente.
# ============================================================

#Requires -RunAsAdministrator

$ErrorActionPreference = "Continue"

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CyberShield - Correcao de Task" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Lista de nomes de tasks conhecidas do CyberShield
$taskPatterns = @(
    "CyberShieldAgent",
    "CyberShield*",
    "cybershield-agent*"
)

$tasksRemoved = 0

foreach ($pattern in $taskPatterns) {
    try {
        $tasks = Get-ScheduledTask -TaskName $pattern -ErrorAction SilentlyContinue
        
        foreach ($task in $tasks) {
            Write-Host "[*] Encontrada task: $($task.TaskName)" -ForegroundColor Yellow
            
            # Tentar parar a task se estiver rodando
            try {
                Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
                Write-Host "    - Task parada" -ForegroundColor Gray
            } catch {
                Write-Host "    - Nao foi possivel parar (pode nao estar rodando)" -ForegroundColor Gray
            }
            
            # Remover a task
            try {
                Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false
                Write-Host "    - Task removida com sucesso" -ForegroundColor Green
                $tasksRemoved++
            } catch {
                Write-Host "    - ERRO ao remover: $($_.Exception.Message)" -ForegroundColor Red
            }
        }
    } catch {
        # Pattern nao encontrou nenhuma task
    }
}

Write-Host ""

if ($tasksRemoved -gt 0) {
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  $tasksRemoved task(s) removida(s)" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Agora voce pode reinstalar o agente CyberShield!" -ForegroundColor Cyan
} else {
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host "  Nenhuma task do CyberShield encontrada" -ForegroundColor Yellow
    Write-Host "========================================" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "O agente pode nao estar instalado ou usar outro nome de task." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Pressione qualquer tecla para sair..."
$null = $Host.UI.RawUI.ReadKey("NoEcho,IncludeKeyDown")
