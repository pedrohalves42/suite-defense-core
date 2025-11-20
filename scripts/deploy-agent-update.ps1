# deploy-agent-update.ps1
# Script para atualizar o agente Python em producao
# Uso: .\deploy-agent-update.ps1 -AgentName "pcteste1"

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentName,
    
    [string]$InstallPath = "C:\CyberShield",
    [string]$BackupPath = "C:\CyberShield\backup",
    [string]$SourcePath = ".\agent"  # Caminho local dos arquivos do agente
)

Write-Host "`n? CyberShield Agent Update Deployment" -ForegroundColor Cyan
Write-Host "======================================`n" -ForegroundColor Cyan

# Validacoes
if (-not (Test-Path $InstallPath)) {
    Write-Host "[ERROR]  Erro: Diretorio de instalacao nao encontrado: $InstallPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $SourcePath)) {
    Write-Host "[ERROR]  Erro: Diretorio fonte nao encontrado: $SourcePath" -ForegroundColor Red
    exit 1
}

# 1. Parar agente antigo
Write-Host "1??  Parando processos antigos do agente..." -ForegroundColor Yellow

# Parar Scheduled Task
$taskName = "CyberShieldAgent"
try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "   [OK]  Scheduled Task parada" -ForegroundColor Green
    }
} catch {
    Write-Host "   [WARN] ?  Aviso: Erro ao parar Scheduled Task: $_" -ForegroundColor Yellow
}

# Matar processos Python relacionados ao agente
Get-Process python* -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like '*cybershield*' -or 
    $_.CommandLine -like '*main.py*' -or
    $_.Path -like "$InstallPath*"
} | ForEach-Object {
    Write-Host "   ? Matando processo PID $($_.Id)" -ForegroundColor Gray
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# 2. Fazer backup dos arquivos atuais
Write-Host "`n2??  Criando backup dos arquivos atuais..." -ForegroundColor Yellow

if (-not (Test-Path $BackupPath)) {
    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupPath "backup-$timestamp"

try {
    Copy-Item -Path "$InstallPath\*" -Destination $backupDir -Recurse -Force
    Write-Host "   [OK]  Backup criado em: $backupDir" -ForegroundColor Green
} catch {
    Write-Host "   [WARN] ?  Aviso: Erro ao criar backup: $_" -ForegroundColor Yellow
}

# 3. Copiar novos arquivos
Write-Host "`n3??  Copiando arquivos atualizados..." -ForegroundColor Yellow

$filesToCopy = @(
    "main.py",
    "config.py",
    "job_poller.py",
    "heartbeat_sender.py",
    "auto_updater.py",
    "hmac_utils.py",
    "logger_config.py",
    "requirements.txt"
)

$copiedCount = 0
foreach ($file in $filesToCopy) {
    $sourcePath = Join-Path $SourcePath $file
    $destPath = Join-Path $InstallPath $file
    
    if (Test-Path $sourcePath) {
        try {
            Copy-Item -Path $sourcePath -Destination $destPath -Force
            Write-Host "   [OK]  $file" -ForegroundColor Green
            $copiedCount++
        } catch {
            Write-Host "   [ERROR]  Erro ao copiar $file : $_" -ForegroundColor Red
        }
    } else {
        Write-Host "   [WARN] ?  $file nao encontrado em $SourcePath" -ForegroundColor Yellow
    }
}

Write-Host "`n   [PKG]  Total: $copiedCount arquivos copiados" -ForegroundColor Cyan

# 4. Verificar/Atualizar dependencias Python
Write-Host "`n4??  Verificando dependencias Python..." -ForegroundColor Yellow

$requirementsPath = Join-Path $InstallPath "requirements.txt"
if (Test-Path $requirementsPath) {
    try {
        python -m pip install --upgrade pip --quiet
        python -m pip install -r $requirementsPath --quiet
        Write-Host "   [OK]  Dependencias atualizadas" -ForegroundColor Green
    } catch {
        Write-Host "   [WARN] ?  Aviso: Erro ao atualizar dependencias: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [WARN] ?  requirements.txt nao encontrado" -ForegroundColor Yellow
}

# 5. Validar codigo atualizado
Write-Host "`n5??  Validando codigo atualizado..." -ForegroundColor Yellow

$mainPath = Join-Path $InstallPath "main.py"
if (Test-Path $mainPath) {
    # Verificar se arquivo contem "submit_job_result" (indicador de codigo novo)
    $content = Get-Content $mainPath -Raw
    if ($content -like "*submit_job_result*") {
        Write-Host "   [OK]  Codigo novo detectado (submit_job_result presente)" -ForegroundColor Green
    } else {
        Write-Host "   [WARN] ?  ATENCAO: Codigo pode estar desatualizado" -ForegroundColor Yellow
    }
    
    # Verificar sintaxe Python
    try {
        python -m py_compile $mainPath 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   [OK]  Sintaxe Python valida" -ForegroundColor Green
        } else {
            Write-Host "   [ERROR]  Erro de sintaxe Python!" -ForegroundColor Red
        }
    } catch {
        Write-Host "   [WARN] ?  Nao foi possivel validar sintaxe" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [ERROR]  main.py nao encontrado!" -ForegroundColor Red
}

# 6. Reiniciar agente
Write-Host "`n6??  Reiniciando agente..." -ForegroundColor Yellow

try {
    if ($task) {
        Start-ScheduledTask -TaskName $taskName
        Start-Sleep -Seconds 3
        
        $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
        Write-Host "   [OK]  Scheduled Task reiniciada" -ForegroundColor Green
        Write-Host "   Estado: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
        Write-Host "   Ultima execucao: $($taskInfo.LastRunTime)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   [ERROR]  Erro ao reiniciar: $_" -ForegroundColor Red
    exit 1
}

# 7. Verificar logs
Write-Host "`n7??  Verificando logs do agente..." -ForegroundColor Yellow

$logPath = Join-Path $InstallPath "logs\agent.log"
if (Test-Path $logPath) {
    Start-Sleep -Seconds 5  # Aguardar logs serem escritos
    
    $recentLogs = Get-Content $logPath -Tail 10 -ErrorAction SilentlyContinue
    
    if ($recentLogs) {
        Write-Host "`n   ? Ultimas 10 linhas do log:" -ForegroundColor Cyan
        $recentLogs | ForEach-Object {
            if ($_ -like "*ERROR*" -or $_ -like "*ERRO*") {
                Write-Host "   $_" -ForegroundColor Red
            } elseif ($_ -like "*submit-job-result*") {
                Write-Host "   $_" -ForegroundColor Green
            } else {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        
        # Validar que novo codigo esta rodando
        $hasSubmitJobResult = $recentLogs | Where-Object { $_ -like "*submit-job-result*" }
        $hasAckJob = $recentLogs | Where-Object { $_ -like "*ack-job*" }
        
        Write-Host ""
        if ($hasSubmitJobResult) {
            Write-Host "   [OK]  VALIDADO: Codigo novo esta rodando (submit-job-result detectado)" -ForegroundColor Green
        } elseif ($hasAckJob) {
            Write-Host "   [ERROR]  PROBLEMA: Codigo antigo ainda esta rodando (ack-job detectado)" -ForegroundColor Red
        } else {
            Write-Host "   [WARN] ?  Aguarde mais tempo para confirmar que codigo novo esta executando" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   [WARN] ?  Nenhum log recente encontrado" -ForegroundColor Yellow
    }
} else {
    Write-Host "   [WARN] ?  Arquivo de log nao encontrado: $logPath" -ForegroundColor Yellow
}

# 8. Resumo
Write-Host "`n[OK]  Deployment concluido!" -ForegroundColor Green
Write-Host "`n? Proximos passos:" -ForegroundColor Cyan
Write-Host "   1. Monitorar logs por ~2 minutos: Get-Content $logPath -Tail 20 -Wait" -ForegroundColor Gray
Write-Host "   2. Confirmar heartbeat no dashboard (last_heartbeat < 2min)" -ForegroundColor Gray
Write-Host "   3. Criar job de teste (integration_test) para validar pipeline" -ForegroundColor Gray
Write-Host ""
Write-Host "? Backup dos arquivos antigos:" -ForegroundColor Cyan
Write-Host "   $backupDir" -ForegroundColor Gray
Write-Host ""
