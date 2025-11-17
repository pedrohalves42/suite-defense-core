# deploy-agent-update.ps1
# Script para atualizar o agente Python em produção
# Uso: .\deploy-agent-update.ps1 -AgentName "pcteste1"

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentName,
    
    [string]$InstallPath = "C:\CyberShield",
    [string]$BackupPath = "C:\CyberShield\backup",
    [string]$SourcePath = ".\agent"  # Caminho local dos arquivos do agente
)

Write-Host "`n🚀 CyberShield Agent Update Deployment" -ForegroundColor Cyan
Write-Host "======================================`n" -ForegroundColor Cyan

# Validações
if (-not (Test-Path $InstallPath)) {
    Write-Host "❌ Erro: Diretório de instalação não encontrado: $InstallPath" -ForegroundColor Red
    exit 1
}

if (-not (Test-Path $SourcePath)) {
    Write-Host "❌ Erro: Diretório fonte não encontrado: $SourcePath" -ForegroundColor Red
    exit 1
}

# 1. Parar agente antigo
Write-Host "1️⃣  Parando processos antigos do agente..." -ForegroundColor Yellow

# Parar Scheduled Task
$taskName = "CyberShieldAgent"
try {
    $task = Get-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
    if ($task) {
        Stop-ScheduledTask -TaskName $taskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Write-Host "   ✅ Scheduled Task parada" -ForegroundColor Green
    }
} catch {
    Write-Host "   ⚠️  Aviso: Erro ao parar Scheduled Task: $_" -ForegroundColor Yellow
}

# Matar processos Python relacionados ao agente
Get-Process python* -ErrorAction SilentlyContinue | Where-Object {
    $_.CommandLine -like '*cybershield*' -or 
    $_.CommandLine -like '*main.py*' -or
    $_.Path -like "$InstallPath*"
} | ForEach-Object {
    Write-Host "   🔪 Matando processo PID $($_.Id)" -ForegroundColor Gray
    Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
}

Start-Sleep -Seconds 2

# 2. Fazer backup dos arquivos atuais
Write-Host "`n2️⃣  Criando backup dos arquivos atuais..." -ForegroundColor Yellow

if (-not (Test-Path $BackupPath)) {
    New-Item -ItemType Directory -Path $BackupPath -Force | Out-Null
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupDir = Join-Path $BackupPath "backup-$timestamp"

try {
    Copy-Item -Path "$InstallPath\*" -Destination $backupDir -Recurse -Force
    Write-Host "   ✅ Backup criado em: $backupDir" -ForegroundColor Green
} catch {
    Write-Host "   ⚠️  Aviso: Erro ao criar backup: $_" -ForegroundColor Yellow
}

# 3. Copiar novos arquivos
Write-Host "`n3️⃣  Copiando arquivos atualizados..." -ForegroundColor Yellow

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
            Write-Host "   ✅ $file" -ForegroundColor Green
            $copiedCount++
        } catch {
            Write-Host "   ❌ Erro ao copiar $file : $_" -ForegroundColor Red
        }
    } else {
        Write-Host "   ⚠️  $file não encontrado em $SourcePath" -ForegroundColor Yellow
    }
}

Write-Host "`n   📦 Total: $copiedCount arquivos copiados" -ForegroundColor Cyan

# 4. Verificar/Atualizar dependências Python
Write-Host "`n4️⃣  Verificando dependências Python..." -ForegroundColor Yellow

$requirementsPath = Join-Path $InstallPath "requirements.txt"
if (Test-Path $requirementsPath) {
    try {
        python -m pip install --upgrade pip --quiet
        python -m pip install -r $requirementsPath --quiet
        Write-Host "   ✅ Dependências atualizadas" -ForegroundColor Green
    } catch {
        Write-Host "   ⚠️  Aviso: Erro ao atualizar dependências: $_" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  requirements.txt não encontrado" -ForegroundColor Yellow
}

# 5. Validar código atualizado
Write-Host "`n5️⃣  Validando código atualizado..." -ForegroundColor Yellow

$mainPath = Join-Path $InstallPath "main.py"
if (Test-Path $mainPath) {
    # Verificar se arquivo contém "submit_job_result" (indicador de código novo)
    $content = Get-Content $mainPath -Raw
    if ($content -like "*submit_job_result*") {
        Write-Host "   ✅ Código novo detectado (submit_job_result presente)" -ForegroundColor Green
    } else {
        Write-Host "   ⚠️  ATENÇÃO: Código pode estar desatualizado" -ForegroundColor Yellow
    }
    
    # Verificar sintaxe Python
    try {
        python -m py_compile $mainPath 2>&1 | Out-Null
        if ($LASTEXITCODE -eq 0) {
            Write-Host "   ✅ Sintaxe Python válida" -ForegroundColor Green
        } else {
            Write-Host "   ❌ Erro de sintaxe Python!" -ForegroundColor Red
        }
    } catch {
        Write-Host "   ⚠️  Não foi possível validar sintaxe" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ❌ main.py não encontrado!" -ForegroundColor Red
}

# 6. Reiniciar agente
Write-Host "`n6️⃣  Reiniciando agente..." -ForegroundColor Yellow

try {
    if ($task) {
        Start-ScheduledTask -TaskName $taskName
        Start-Sleep -Seconds 3
        
        $taskInfo = Get-ScheduledTaskInfo -TaskName $taskName
        Write-Host "   ✅ Scheduled Task reiniciada" -ForegroundColor Green
        Write-Host "   Estado: $($taskInfo.LastTaskResult)" -ForegroundColor Gray
        Write-Host "   Última execução: $($taskInfo.LastRunTime)" -ForegroundColor Gray
    }
} catch {
    Write-Host "   ❌ Erro ao reiniciar: $_" -ForegroundColor Red
    exit 1
}

# 7. Verificar logs
Write-Host "`n7️⃣  Verificando logs do agente..." -ForegroundColor Yellow

$logPath = Join-Path $InstallPath "logs\agent.log"
if (Test-Path $logPath) {
    Start-Sleep -Seconds 5  # Aguardar logs serem escritos
    
    $recentLogs = Get-Content $logPath -Tail 10 -ErrorAction SilentlyContinue
    
    if ($recentLogs) {
        Write-Host "`n   📋 Últimas 10 linhas do log:" -ForegroundColor Cyan
        $recentLogs | ForEach-Object {
            if ($_ -like "*ERROR*" -or $_ -like "*ERRO*") {
                Write-Host "   $_" -ForegroundColor Red
            } elseif ($_ -like "*submit-job-result*") {
                Write-Host "   $_" -ForegroundColor Green
            } else {
                Write-Host "   $_" -ForegroundColor Gray
            }
        }
        
        # Validar que novo código está rodando
        $hasSubmitJobResult = $recentLogs | Where-Object { $_ -like "*submit-job-result*" }
        $hasAckJob = $recentLogs | Where-Object { $_ -like "*ack-job*" }
        
        Write-Host ""
        if ($hasSubmitJobResult) {
            Write-Host "   ✅ VALIDADO: Código novo está rodando (submit-job-result detectado)" -ForegroundColor Green
        } elseif ($hasAckJob) {
            Write-Host "   ❌ PROBLEMA: Código antigo ainda está rodando (ack-job detectado)" -ForegroundColor Red
        } else {
            Write-Host "   ⚠️  Aguarde mais tempo para confirmar que código novo está executando" -ForegroundColor Yellow
        }
    } else {
        Write-Host "   ⚠️  Nenhum log recente encontrado" -ForegroundColor Yellow
    }
} else {
    Write-Host "   ⚠️  Arquivo de log não encontrado: $logPath" -ForegroundColor Yellow
}

# 8. Resumo
Write-Host "`n✅ Deployment concluído!" -ForegroundColor Green
Write-Host "`n📝 Próximos passos:" -ForegroundColor Cyan
Write-Host "   1. Monitorar logs por ~2 minutos: Get-Content $logPath -Tail 20 -Wait" -ForegroundColor Gray
Write-Host "   2. Confirmar heartbeat no dashboard (last_heartbeat < 2min)" -ForegroundColor Gray
Write-Host "   3. Criar job de teste (integration_test) para validar pipeline" -ForegroundColor Gray
Write-Host ""
Write-Host "📂 Backup dos arquivos antigos:" -ForegroundColor Cyan
Write-Host "   $backupDir" -ForegroundColor Gray
Write-Host ""
