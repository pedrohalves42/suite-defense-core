#Requires -Version 5.1

<#
.SYNOPSIS
    Diagnostica processos duplicados do CyberShield Agent.

.DESCRIPTION
    Este script detecta processos duplicados do agente CyberShield, identifica tokens/secrets duplicados,
    analisa scheduled tasks, e fornece recomendacoes detalhadas para cleanup.

.PARAMETER Verbose
    Mostra informacoes detalhadas incluindo command lines completas.

.PARAMETER ExportJson
    Exporta o relatorio em formato JSON para C:\CyberShield\logs\duplicate-agents-report.json

.PARAMETER AutoCleanup
    PERIGOSO! Executa cleanup automaticamente matando processos duplicados e removendo tasks orfas.
    Use apenas se tiver certeza do que esta fazendo.

.EXAMPLE
    .\diagnose-duplicate-agents.ps1
    Executa diagnostico basico e mostra relatorio.

.EXAMPLE
    .\diagnose-duplicate-agents.ps1 -Verbose -ExportJson
    Executa diagnostico detalhado e exporta para JSON.

.EXAMPLE
    .\diagnose-duplicate-agents.ps1 -AutoCleanup
    Executa diagnostico E cleanup automatico (PERIGOSO).
#>

param(
    [switch]$Verbose,
    [switch]$ExportJson,
    [switch]$AutoCleanup
)

$ErrorActionPreference = "Continue"

# Cores para output
function Write-ColoredLine {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

function Write-Header {
    param([string]$Title)
    Write-Host ""
    Write-ColoredLine "═══════════════════════════════════════════════════════════════" "Cyan"
    Write-ColoredLine "  $Title" "Cyan"
    Write-ColoredLine "═══════════════════════════════════════════════════════════════" "Cyan"
    Write-Host ""
}

function Write-Section {
    param([string]$Title)
    Write-Host ""
    Write-ColoredLine "───────────────────────────────────────────────────────────────" "Yellow"
    Write-ColoredLine "  $Title" "Yellow"
    Write-ColoredLine "───────────────────────────────────────────────────────────────" "Yellow"
}

function Extract-TokenPrefix {
    param([string]$CommandLine)
    
    if ($CommandLine -match '-AgentToken\s+["\']?([a-f0-9]{8})') {
        return $matches[1]
    }
    return $null
}

function Extract-HmacPrefix {
    param([string]$CommandLine)
    
    if ($CommandLine -match '-HmacSecret\s+["\']?([a-f0-9]{8})') {
        return $matches[1]
    }
    return $null
}

function Get-ProcessOwner {
    param([int]$ProcessId)
    
    try {
        $owner = (Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=$ProcessId").GetOwner()
        if ($owner.Domain) {
            return "$($owner.Domain)\$($owner.User)"
        }
        return $owner.User
    } catch {
        return "Unknown"
    }
}

function Format-TimeSpan {
    param([datetime]$StartTime)
    
    $elapsed = (Get-Date) - $StartTime
    return "{0:hh\:mm\:ss}" -f $elapsed
}

# ====================================
# FASE 1: DETECÇÃO DE PROCESSOS
# ====================================

Write-Header "CYBERSHIELD - DIAGNOSTICO DE PROCESSOS DUPLICADOS"
Write-ColoredLine "Timestamp: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" "Gray"

Write-Section "FASE 1: DETECTANDO PROCESSOS DO AGENTE"

$allProcesses = @()

try {
    $processes = Get-CimInstance Win32_Process | Where-Object { 
        $_.CommandLine -and $_.CommandLine -match 'cybershield-agent.*\.ps1'
    }

    foreach ($proc in $processes) {
        $owner = Get-ProcessOwner -ProcessId $proc.ProcessId
        $tokenPrefix = Extract-TokenPrefix -CommandLine $proc.CommandLine
        $hmacPrefix = Extract-HmacPrefix -CommandLine $proc.CommandLine
        $startTime = $proc.CreationDate
        $elapsed = if ($startTime) { Format-TimeSpan -StartTime $startTime } else { "N/A" }

        $processInfo = [PSCustomObject]@{
            PID           = $proc.ProcessId
            Owner         = $owner
            TokenPrefix   = $tokenPrefix
            HmacPrefix    = $hmacPrefix
            StartTime     = $startTime
            Elapsed       = $elapsed
            CommandLine   = $proc.CommandLine
            ParentPID     = $proc.ParentProcessId
        }

        $allProcesses += $processInfo
    }

    Write-ColoredLine "✓ Processos encontrados: $($allProcesses.Count)" "Green"

} catch {
    Write-ColoredLine "✗ Erro ao detectar processos: $($_.Exception.Message)" "Red"
}

# ====================================
# FASE 2: ANÁLISE DE DUPLICADOS
# ====================================

Write-Section "FASE 2: ANALISANDO TOKENS E DUPLICADOS"

$tokenGroups = $allProcesses | Where-Object { $_.TokenPrefix } | Group-Object -Property TokenPrefix
$uniqueTokens = $tokenGroups.Count
$duplicates = $tokenGroups | Where-Object { $_.Count -gt 1 }
$hasDuplicates = $duplicates.Count -gt 0

$report = [PSCustomObject]@{
    Timestamp       = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
    TotalProcesses  = $allProcesses.Count
    UniqueTokens    = $uniqueTokens
    DuplicateTokens = $duplicates.Count
    HasDuplicates   = $hasDuplicates
    Processes       = $allProcesses
    TokenGroups     = @()
    ScheduledTasks  = @()
    Recommendations = @()
    CleanupCommands = @()
}

Write-ColoredLine "  Processos totais: $($allProcesses.Count)" "White"
Write-ColoredLine "  Tokens unicos: $uniqueTokens" "White"

if ($hasDuplicates) {
    Write-ColoredLine "  DUPLICADOS DETECTADOS: $($duplicates.Count) token(s) com multiplos processos" "Red"
} else {
    Write-ColoredLine "  ✓ Nenhum duplicado detectado" "Green"
}

# ====================================
# FASE 3: DETALHES DOS PROCESSOS
# ====================================

Write-Section "FASE 3: DETALHES DOS PROCESSOS"

if ($allProcesses.Count -eq 0) {
    Write-ColoredLine "  Nenhum processo do CyberShield Agent encontrado." "Yellow"
} else {
    # Header da tabela
    Write-Host ""
    $headerFormat = "{0,-8} {1,-20} {2,-12} {3,-12} {4,-12}"
    Write-ColoredLine ($headerFormat -f "PID", "Usuario", "Token", "HMAC", "Tempo Exec") "Cyan"
    Write-ColoredLine ($headerFormat -f "────────", "────────────────────", "────────────", "────────────", "────────────") "Cyan"

    foreach ($proc in $allProcesses) {
        $tokenDisplay = if ($proc.TokenPrefix) { "$($proc.TokenPrefix).." } else { "N/A" }
        $hmacDisplay = if ($proc.HmacPrefix) { "$($proc.HmacPrefix).." } else { "N/A" }
        
        $line = $headerFormat -f $proc.PID, $proc.Owner, $tokenDisplay, $hmacDisplay, $proc.Elapsed

        # Identificar duplicados
        $isDuplicate = $false
        $isInvalidToken = $false

        if ($proc.TokenPrefix) {
            $group = $tokenGroups | Where-Object { $_.Name -eq $proc.TokenPrefix }
            if ($group -and $group.Count -gt 1) {
                # É duplicado se não for o processo mais antigo do grupo
                $oldestInGroup = ($group.Group | Sort-Object StartTime | Select-Object -First 1).PID
                if ($proc.PID -ne $oldestInGroup) {
                    $isDuplicate = $true
                    $line += "  ⚠️ DUPLICADO"
                }
            }
        } else {
            $isInvalidToken = $true
            $line += "  ❌ TOKEN NAO ENCONTRADO"
        }

        # Colorir linha baseado no status
        if ($isDuplicate) {
            Write-ColoredLine $line "Yellow"
        } elseif ($isInvalidToken) {
            Write-ColoredLine $line "Red"
        } else {
            Write-ColoredLine $line "Green"
        }

        # Verbose: mostrar command line completa
        if ($Verbose) {
            Write-ColoredLine "    CommandLine: $($proc.CommandLine)" "Gray"
        }
    }
}

# ====================================
# FASE 4: SCHEDULED TASKS
# ====================================

Write-Section "FASE 4: ANALISANDO SCHEDULED TASKS"

try {
    $tasks = Get-ScheduledTask | Where-Object { $_.TaskName -like "CyberShield*" }

    if ($tasks.Count -eq 0) {
        Write-ColoredLine "  Nenhuma scheduled task do CyberShield encontrada." "Yellow"
    } else {
        foreach ($task in $tasks) {
            $taskInfo = Get-ScheduledTaskInfo -TaskName $task.TaskName -ErrorAction SilentlyContinue
            $state = $task.State
            $lastRun = if ($taskInfo) { $taskInfo.LastRunTime } else { "N/A" }
            $nextRun = if ($taskInfo) { $taskInfo.NextRunTime } else { "N/A" }

            $taskData = [PSCustomObject]@{
                Name     = $task.TaskName
                State    = $state
                LastRun  = $lastRun
                NextRun  = $nextRun
                HasProcess = $false
            }

            $report.ScheduledTasks += $taskData

            # Verificar se task tem processo correspondente
            $hasProcess = $false
            if ($state -eq "Running") {
                # Tentar correlacionar com processos
                $hasProcess = $allProcesses.Count -gt 0
            }

            $taskData.HasProcess = $hasProcess

            $statusIcon = switch ($state) {
                "Running" { if ($hasProcess) { "✓" } else { "⚠️" } }
                "Ready" { "○" }
                "Disabled" { "✗" }
                default { "?" }
            }

            $statusColor = switch ($state) {
                "Running" { if ($hasProcess) { "Green" } else { "Yellow" } }
                "Ready" { "White" }
                "Disabled" { "Gray" }
                default { "White" }
            }

            $taskLine = "  $statusIcon $($task.TaskName) - $state"
            if ($state -eq "Running" -and -not $hasProcess) {
                $taskLine += " (SEM PROCESSO DETECTADO)"
            }

            Write-ColoredLine $taskLine $statusColor
        }
    }
} catch {
    Write-ColoredLine "  ✗ Erro ao analisar scheduled tasks: $($_.Exception.Message)" "Red"
}

# ====================================
# FASE 5: RECOMENDAÇÕES
# ====================================

Write-Section "FASE 5: RECOMENDACOES E COMANDOS DE CLEANUP"

$processesToKill = @()
$tasksToRemove = @()

# Identificar processos duplicados para matar
foreach ($group in $duplicates) {
    $sortedProcesses = $group.Group | Sort-Object StartTime
    $keepProcess = $sortedProcesses | Select-Object -First 1
    $duplicateProcesses = $sortedProcesses | Select-Object -Skip 1

    foreach ($dup in $duplicateProcesses) {
        $processesToKill += $dup.PID
        $report.Recommendations += "Matar processo $($dup.PID) (duplicado de $($keepProcess.PID), token $($group.Name))"
    }
}

# Identificar processos sem token válido
$invalidTokenProcesses = $allProcesses | Where-Object { -not $_.TokenPrefix }
foreach ($invalid in $invalidTokenProcesses) {
    $processesToKill += $invalid.PID
    $report.Recommendations += "Matar processo $($invalid.PID) (token invalido ou nao encontrado)"
}

# Identificar tasks órfãs (Disabled sem processo)
$orphanedTasks = $report.ScheduledTasks | Where-Object { $_.State -eq "Disabled" }
foreach ($orphan in $orphanedTasks) {
    $tasksToRemove += $orphan.Name
    $report.Recommendations += "Remover scheduled task '$($orphan.Name)' (orfã/desabilitada)"
}

if ($report.Recommendations.Count -eq 0) {
    Write-ColoredLine "  ✓ Nenhuma acao necessaria. Sistema esta limpo!" "Green"
} else {
    Write-ColoredLine "  TOTAL DE RECOMENDACOES: $($report.Recommendations.Count)" "Yellow"
    Write-Host ""

    $recIndex = 1
    foreach ($rec in $report.Recommendations) {
        Write-ColoredLine "  $recIndex. $rec" "Yellow"
        $recIndex++
    }

    Write-Host ""
    Write-ColoredLine "───────────────────────────────────────────────────────────────" "Cyan"
    Write-ColoredLine "  COMANDOS SUGERIDOS PARA CLEANUP" "Cyan"
    Write-ColoredLine "───────────────────────────────────────────────────────────────" "Cyan"
    Write-Host ""

    if ($processesToKill.Count -gt 0) {
        $killCommand = "Stop-Process -Id $($processesToKill -join ', ') -Force"
        Write-ColoredLine "  # Matar processos duplicados/invalidos:" "White"
        Write-ColoredLine "  $killCommand" "Yellow"
        $report.CleanupCommands += $killCommand
        Write-Host ""
    }

    if ($tasksToRemove.Count -gt 0) {
        foreach ($taskName in $tasksToRemove) {
            $removeCommand = "Unregister-ScheduledTask -TaskName '$taskName' -Confirm:`$false"
            Write-ColoredLine "  # Remover task orfa:" "White"
            Write-ColoredLine "  $removeCommand" "Yellow"
            $report.CleanupCommands += $removeCommand
        }
    }
}

# ====================================
# FASE 6: AUTO-CLEANUP (SE SOLICITADO)
# ====================================

if ($AutoCleanup -and $report.Recommendations.Count -gt 0) {
    Write-Section "FASE 6: EXECUTANDO AUTO-CLEANUP"
    Write-ColoredLine "  AVISO: Auto-cleanup ativado. Executando comandos..." "Red"
    Write-Host ""

    $cleanupSuccess = $true

    # Matar processos
    if ($processesToKill.Count -gt 0) {
        Write-ColoredLine "  Matando processos: $($processesToKill -join ', ')..." "Yellow"
        try {
            Stop-Process -Id $processesToKill -Force -ErrorAction Stop
            Write-ColoredLine "  ✓ Processos encerrados com sucesso" "Green"
        } catch {
            Write-ColoredLine "  ✗ Erro ao matar processos: $($_.Exception.Message)" "Red"
            $cleanupSuccess = $false
        }
    }

    # Remover tasks
    if ($tasksToRemove.Count -gt 0) {
        foreach ($taskName in $tasksToRemove) {
            Write-ColoredLine "  Removendo task '$taskName'..." "Yellow"
            try {
                Unregister-ScheduledTask -TaskName $taskName -Confirm:$false -ErrorAction Stop
                Write-ColoredLine "  ✓ Task removida com sucesso" "Green"
            } catch {
                Write-ColoredLine "  ✗ Erro ao remover task: $($_.Exception.Message)" "Red"
                $cleanupSuccess = $false
            }
        }
    }

    if ($cleanupSuccess) {
        Write-Host ""
        Write-ColoredLine "  ✓ AUTO-CLEANUP CONCLUIDO COM SUCESSO!" "Green"
    } else {
        Write-Host ""
        Write-ColoredLine "  ⚠️ AUTO-CLEANUP CONCLUIDO COM ALGUNS ERROS. Verifique os logs acima." "Yellow"
    }
}

# ====================================
# FASE 7: EXPORTAR JSON (SE SOLICITADO)
# ====================================

if ($ExportJson) {
    Write-Section "FASE 7: EXPORTANDO RELATORIO JSON"

    $logsDir = "C:\CyberShield\logs"
    if (-not (Test-Path $logsDir)) {
        New-Item -ItemType Directory -Path $logsDir -Force | Out-Null
    }

    $jsonPath = Join-Path $logsDir "duplicate-agents-report.json"

    try {
        $report | ConvertTo-Json -Depth 10 | Set-Content -Path $jsonPath -Encoding UTF8
        Write-ColoredLine "  ✓ Relatorio exportado para: $jsonPath" "Green"
    } catch {
        Write-ColoredLine "  ✗ Erro ao exportar JSON: $($_.Exception.Message)" "Red"
    }
}

# ====================================
# RODAPÉ
# ====================================

Write-Host ""
Write-ColoredLine "═══════════════════════════════════════════════════════════════" "Cyan"
Write-ColoredLine "  DIAGNOSTICO CONCLUIDO" "Cyan"
Write-ColoredLine "═══════════════════════════════════════════════════════════════" "Cyan"
Write-Host ""

if ($report.Recommendations.Count -eq 0) {
    Write-ColoredLine "STATUS: ✓ SISTEMA LIMPO - Nenhuma acao necessaria" "Green"
} else {
    Write-ColoredLine "STATUS: ⚠️ ATENCAO - $($report.Recommendations.Count) acao(oes) recomendada(s)" "Yellow"
    if (-not $AutoCleanup) {
        Write-Host ""
        Write-ColoredLine "Para executar cleanup automatico, execute:" "White"
        Write-ColoredLine "  .\diagnose-duplicate-agents.ps1 -AutoCleanup" "Yellow"
    }
}

Write-Host ""

# Retornar objeto para pipeline
return $report
