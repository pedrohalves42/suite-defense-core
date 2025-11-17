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

Write-Host "`n🧹 CyberShield Agent Cleanup Tool" -ForegroundColor $ColorInfo
Write-Host "================================`n" -ForegroundColor $ColorInfo

if ($ValidTokenPrefixes.Count -eq 0) {
    Write-Host "⚠️  AVISO: Nenhum token válido especificado!" -ForegroundColor $ColorWarning
    Write-Host "   Todos os agentes serão considerados fantasmas.`n" -ForegroundColor $ColorWarning
    $confirm = Read-Host "   Deseja continuar? (S/N)"
    if ($confirm -ne "S") {
        Write-Host "❌ Operação cancelada pelo usuário" -ForegroundColor $ColorError
        exit 1
    }
}

if ($DryRun) {
    Write-Host "🔍 Modo DRY-RUN ativado - nenhuma mudança será feita`n" -ForegroundColor $ColorWarning
}

# ====================
# FASE 1: DIAGNÓSTICO
# ====================
Write-Host "📊 Fase 1: Diagnosticando processos..." -ForegroundColor $ColorInfo

$allProcesses = Get-CimInstance Win32_Process | Where-Object {
    $_.CommandLine -like '*cybershield-agent*'
}

if ($allProcesses.Count -eq 0) {
    Write-Host "✅ Nenhum processo do agente encontrado" -ForegroundColor $ColorSuccess
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
Write-Host "`n🔪 Fase 2: Identificando processos fantasma..." -ForegroundColor $ColorInfo

$killed = 0
$valid = 0

foreach ($process in $allProcesses) {
    $isValid = $false
    
    if ($ValidTokenPrefixes.Count -eq 0) {
        # Se não há tokens válidos, todos são fantasmas
        $isValid = $false
    } else {
        # Verificar se o processo contém algum dos tokens válidos
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
            Write-Host "   ✅ VÁLIDO PID $($process.ProcessId)" -ForegroundColor $ColorSuccess
        }
    } else {
        if ($DryRun) {
            Write-Host "   [DRY-RUN] Mataria PID $($process.ProcessId)" -ForegroundColor $ColorWarning
        } else {
            Write-Host "   ❌ Matando PID $($process.ProcessId)..." -ForegroundColor $ColorWarning
            try {
                Stop-Process -Id $process.ProcessId -Force -ErrorAction Stop
                $killed++
            } catch {
                Write-Host "   ⚠️  Erro ao matar PID $($process.ProcessId): $_" -ForegroundColor $ColorError
            }
        }
    }
}

Write-Host "   Processos válidos mantidos: $valid" -ForegroundColor $ColorSuccess
Write-Host "   Processos fantasma removidos: $killed" -ForegroundColor $ColorSuccess

# ====================
# FASE 3: LIMPAR SCHEDULED TASKS
# ====================
Write-Host "`n🗑️  Fase 3: Limpando Scheduled Tasks..." -ForegroundColor $ColorInfo

$tasks = Get-ScheduledTask | Where-Object {
    $_.TaskName -like '*CyberShield*'
}

if ($tasks.Count -eq 0) {
    Write-Host "   ✅ Nenhuma task encontrada" -ForegroundColor $ColorSuccess
} else {
    Write-Host "   Tasks encontradas: $($tasks.Count)" -ForegroundColor $ColorInfo
    
    $removed = 0
    foreach ($task in $tasks) {
        if ($DryRun) {
            Write-Host "   [DRY-RUN] Removeria task: $($task.TaskName)" -ForegroundColor $ColorWarning
        } else {
            Write-Host "   🗑️  Removendo task: $($task.TaskName)..." -ForegroundColor $ColorWarning
            try {
                Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction Stop
                $removed++
            } catch {
                Write-Host "   ⚠️  Erro ao remover task $($task.TaskName): $_" -ForegroundColor $ColorError
            }
        }
    }
    
    Write-Host "   Tasks removidas: $removed" -ForegroundColor $ColorSuccess
}

# ====================
# FASE 4: VERIFICAÇÃO FINAL
# ====================
Write-Host "`n📋 Fase 4: Verificação final..." -ForegroundColor $ColorInfo

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
Write-Host "`n📊 RESUMO DA LIMPEZA" -ForegroundColor $ColorInfo
Write-Host "===================" -ForegroundColor $ColorInfo
Write-Host "   Processos válidos: $valid" -ForegroundColor $ColorSuccess
Write-Host "   Processos mortos: $killed" -ForegroundColor $ColorWarning
Write-Host "   Tasks removidas: $removed" -ForegroundColor $ColorWarning
Write-Host "   Processos restantes: $remainingProcesses" -ForegroundColor $ColorInfo
Write-Host "   Tasks restantes: $remainingTasks" -ForegroundColor $ColorInfo

if ($DryRun) {
    Write-Host "`n⚠️  DRY-RUN concluído - nenhuma mudança foi feita" -ForegroundColor $ColorWarning
    Write-Host "   Execute sem -DryRun para aplicar as mudanças" -ForegroundColor $ColorWarning
} else {
    Write-Host "`n🎉 Limpeza concluída com sucesso!" -ForegroundColor $ColorSuccess
}

Write-Host ""

# Exit code
if ($killed -gt 0 -or $removed -gt 0) {
    exit 0  # Sucesso com mudanças
} else {
    exit 0  # Sucesso sem mudanças necessárias
}
