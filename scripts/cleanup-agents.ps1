# cleanup-agents.ps1
# Remove processos e tasks duplicados do CyberShield Agent
# Uso: .\cleanup-agents.ps1 -ValidTokenPrefixes @("3e1973dc", "2ecb14a9")

param(
    [string[]]$ValidTokenPrefixes = @(),
    [switch]$DryRun = $false,
    [switch]$Verbose = $false
)

# Cores para output
$ColorInfo = "Cyan"
$ColorSuccess = "Green"
$ColorWarning = "Yellow"
$ColorError = "Red"

Write-Host "`n? CyberShield Agent Cleanup Tool" -ForegroundColor $ColorInfo
Write-Host "================================`n" -ForegroundColor $ColorInfo

if ($ValidTokenPrefixes.Count -eq 0) {
    Write-Host "[WARN] ?  AVISO: Nenhum token valido especificado!" -ForegroundColor $ColorWarning
    Write-Host "   Todos os agentes serao considerados fantasmas.`n" -ForegroundColor $ColorWarning
    $confirm = Read-Host "   Deseja continuar? (S/N)"
    if ($confirm -ne "S") {
        Write-Host "[ERROR]  Operacao cancelada pelo usuario" -ForegroundColor $ColorError
        exit 1
    }
}

if ($DryRun) {
    Write-Host "[SCAN]  Modo DRY-RUN ativado - nenhuma mudanca sera feita`n" -ForegroundColor $ColorWarning
}

# ====================
# FASE 1: DIAGNOSTICO
# ====================
Write-Host "? Fase 1: Diagnosticando processos..." -ForegroundColor $ColorInfo

$allProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like '*cybershield-agent*'
}

if ($allProcesses.Count -eq 0) {
    Write-Host "[OK]  Nenhum processo do agente encontrado" -ForegroundColor $ColorSuccess
} else {
    Write-Host "   Processos encontrados: $($allProcesses.Count)" -ForegroundColor $ColorInfo
    
    if ($Verbose) {
        $allProcesses | ForEach-Object {
            Write-Host "   PID $($_.ProcessId): $($_.CommandLine)" -ForegroundColor Gray
        }
    }
}

# ====================
# FASE 2: MATAR PROCESSOS FANTASMA
# ====================
Write-Host "`n? Fase 2: Identificando processos fantasma..." -ForegroundColor $ColorInfo

$killed = 0
$valid = 0

foreach ($process in $allProcesses) {
    $isValid = $false
    
    if ($ValidTokenPrefixes.Count -eq 0) {
        # Se nao ha tokens validos, todos sao fantasmas
        $isValid = $false
    } else {
        # Verificar se o processo contem algum dos tokens validos
        foreach ($prefix in $ValidTokenPrefixes) {
            if ($process.CommandLine -like "*$prefix*") {
                $isValid = $true
                break
            }
        }
    }
    
    if ($isValid) {
        $valid++
        if ($Verbose) {
            Write-Host "   [OK]  VALIDO PID $($process.ProcessId)" -ForegroundColor $ColorSuccess
        }
    } else {
        if ($DryRun) {
            Write-Host "   [DRY-RUN] Mataria PID $($process.ProcessId)" -ForegroundColor $ColorWarning
        } else {
            Write-Host "   [ERROR]  Matando PID $($process.ProcessId)..." -ForegroundColor $ColorWarning
            try {
                Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
                $killed++
            } catch {
                Write-Host "   [WARN] ?  Erro ao matar PID $($process.ProcessId): $_" -ForegroundColor $ColorError
            }
        }
    }
}

Write-Host "   Processos validos mantidos: $valid" -ForegroundColor $ColorSuccess
Write-Host "   Processos fantasma removidos: $killed" -ForegroundColor $ColorSuccess

# ====================
# FASE 3: LIMPAR SCHEDULED TASKS
# ====================
Write-Host "`n??  Fase 3: Limpando Scheduled Tasks..." -ForegroundColor $ColorInfo

$tasks = Get-ScheduledTask | Where-Object {
    $_.TaskName -like '*CyberShield*'
}

if ($tasks.Count -eq 0) {
    Write-Host "   [OK]  Nenhuma task encontrada" -ForegroundColor $ColorSuccess
} else {
    Write-Host "   Tasks encontradas: $($tasks.Count)" -ForegroundColor $ColorInfo
    
    $removed = 0
    foreach ($task in $tasks) {
        if ($DryRun) {
            Write-Host "   [DRY-RUN] Removeria task: $($task.TaskName)" -ForegroundColor $ColorWarning
        } else {
            Write-Host "   ??  Removendo task: $($task.TaskName)..." -ForegroundColor $ColorWarning
            try {
                Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction Stop
                $removed++
            } catch {
                Write-Host "   [WARN] ?  Erro ao remover task $($task.TaskName): $_" -ForegroundColor $ColorError
            }
        }
    }
    
    Write-Host "   Tasks removidas: $removed" -ForegroundColor $ColorSuccess
}

# ====================
# FASE 4: VERIFICACAO FINAL
# ====================
Write-Host "`n? Fase 4: Verificacao final..." -ForegroundColor $ColorInfo

$remainingProcesses = (Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like '*cybershield-agent*'
}).Count

$remainingTasks = (Get-ScheduledTask | Where-Object {
    $_.TaskName -like '*CyberShield*'
}).Count

Write-Host "   Processos restantes: $remainingProcesses" -ForegroundColor $ColorInfo
Write-Host "   Tasks restantes: $remainingTasks" -ForegroundColor $ColorInfo

# ====================
# RESUMO
# ====================
Write-Host "`n? RESUMO DA LIMPEZA" -ForegroundColor $ColorInfo
Write-Host "===================" -ForegroundColor $ColorInfo
Write-Host "   Processos validos: $valid" -ForegroundColor $ColorSuccess
Write-Host "   Processos mortos: $killed" -ForegroundColor $ColorWarning
Write-Host "   Tasks removidas: $removed" -ForegroundColor $ColorWarning
Write-Host "   Processos restantes: $remainingProcesses" -ForegroundColor $ColorInfo
Write-Host "   Tasks restantes: $remainingTasks" -ForegroundColor $ColorInfo

if ($DryRun) {
    Write-Host "`n[WARN] ?  DRY-RUN concluido - nenhuma mudanca foi feita" -ForegroundColor $ColorWarning
    Write-Host "   Execute sem -DryRun para aplicar as mudancas" -ForegroundColor $ColorWarning
} else {
    Write-Host "`n? Limpeza concluida com sucesso!" -ForegroundColor $ColorSuccess
}

Write-Host ""

# Exit code
if ($killed -gt 0 -or $removed -gt 0) {
    exit 0  # Sucesso com mudancas
} else {
    exit 0  # Sucesso sem mudancas necessarias
}
