#Requires -RunAsAdministrator

<#
.SYNOPSIS
    Script de correção definitiva para instalação do CyberShield Agent
    
.DESCRIPTION
    Executa o plano completo de diagnóstico e correção:
    1. Desbloqueia arquivos
    2. Limpa processos e tasks antigas
    3. Recria Scheduled Task com logging agressivo
    4. Verifica logs e Event Viewer
    5. Fornece diagnóstico detalhado
    
.PARAMETER AgentToken
    Token de autenticação do agente (obrigatório)
    
.PARAMETER HmacSecret
    Segredo HMAC de 64 caracteres (obrigatório)
    
.PARAMETER AgentName
    Nome do agente (obrigatório)
    
.PARAMETER ServerUrl
    URL do servidor (padrão: https://iavbnmduxpxhwubqrzzn.supabase.co)
    
.EXAMPLE
    .\fix-agent-installation.ps1 -AgentToken "seu_token_aqui" -HmacSecret "seu_hmac_64_chars_aqui" -AgentName "teste"
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$AgentToken,
    
    [Parameter(Mandatory=$true)]
    [string]$HmacSecret,
    
    [Parameter(Mandatory=$true)]
    [string]$AgentName,
    
    [string]$ServerUrl = "https://iavbnmduxpxhwubqrzzn.supabase.co"
)

$ErrorActionPreference = "Continue"

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  CYBER SHIELD - FIX AGENT INSTALLATION                    ║" -ForegroundColor Cyan
Write-Host "║  Diagnóstico e Correção Definitiva                        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$BaseDir = "C:\CyberShield"
$LogDir = "$BaseDir\logs"
$ScriptPath = "$BaseDir\cybershield-agent-$AgentName.ps1"
$TaskName = "CyberShieldAgent-$AgentName"

# ============================================
# PASSO 1: Verificações Iniciais
# ============================================
Write-Host "[PASSO 1] Verificações Iniciais..." -ForegroundColor Yellow

if (-not (Test-Path $ScriptPath)) {
    Write-Host "❌ ERRO: Script não encontrado em: $ScriptPath" -ForegroundColor Red
    Write-Host "   Execute primeiro o instalador para gerar o script." -ForegroundColor Yellow
    exit 1
}
Write-Host "✓ Script encontrado: $ScriptPath" -ForegroundColor Green

# ============================================
# PASSO 2: Desbloquear Arquivo
# ============================================
Write-Host "`n[PASSO 2] Desbloqueando arquivo (remover Zone.Identifier)..." -ForegroundColor Yellow

try {
    Unblock-File -Path $ScriptPath -ErrorAction Stop
    Write-Host "✓ Arquivo desbloqueado com sucesso" -ForegroundColor Green
} catch {
    Write-Host "⚠ Aviso ao desbloquear: $_" -ForegroundColor Yellow
}

# Verificar se ainda tem marca de bloqueio
$hasZoneId = Get-Item -Path $ScriptPath -Stream Zone.Identifier -ErrorAction SilentlyContinue
if ($hasZoneId) {
    Write-Host "⚠ Arquivo ainda tem Zone.Identifier. Tentando remover manualmente..." -ForegroundColor Yellow
    Remove-Item -Path "$ScriptPath`:Zone.Identifier" -Force -ErrorAction SilentlyContinue
}

# ============================================
# PASSO 3: Limpar Processos e Tasks Antigas
# ============================================
Write-Host "`n[PASSO 3] Limpando processos e tasks antigas..." -ForegroundColor Yellow

# Parar processos
$oldProcesses = Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -match 'cybershield-agent.*ps1' }
if ($oldProcesses) {
    Write-Host "Encontrados $($oldProcesses.Count) processos. Finalizando..." -ForegroundColor Gray
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

# Remover task existente
try {
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Write-Host "✓ Task removida: $TaskName" -ForegroundColor Green
    } else {
        Write-Host "✓ Nenhuma task existente encontrada" -ForegroundColor Green
    }
} catch {
    Write-Host "⚠ Aviso ao remover task: $_" -ForegroundColor Yellow
}

# ============================================
# PASSO 4: Criar Diretório de Logs
# ============================================
Write-Host "`n[PASSO 4] Criando diretório de logs..." -ForegroundColor Yellow

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "✓ Diretório criado: $LogDir" -ForegroundColor Green
} else {
    Write-Host "✓ Diretório já existe: $LogDir" -ForegroundColor Green
}

# Limpar logs antigos para teste limpo
Get-ChildItem "$LogDir\*.log" -ErrorAction SilentlyContinue | Remove-Item -Force -ErrorAction SilentlyContinue

# ============================================
# PASSO 5: Criar Scheduled Task com Logging Agressivo
# ============================================
Write-Host "`n[PASSO 5] Criando Scheduled Task com logging agressivo..." -ForegroundColor Yellow

# Argumentos do agente
$AgentArgs = @(
    "-ExecutionPolicy", "Unrestricted",
    "-NoProfile",
    "-WindowStyle", "Hidden",
    "-File", "`"$ScriptPath`"",
    "-ServerUrl", "`"$ServerUrl`"",
    "-AgentToken", "`"$AgentToken`"",
    "-HmacSecret", "`"$HmacSecret`"",
    "-AgentName", "`"$AgentName`""
)

$actionArgs = $AgentArgs -join " "
Write-Host "Task arguments: $actionArgs" -ForegroundColor Gray

$action = New-ScheduledTaskAction `
    -Execute "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument $actionArgs

$trigger1 = New-ScheduledTaskTrigger -AtStartup
$trigger2 = New-ScheduledTaskTrigger -Once -At (Get-Date).AddSeconds(30) -RepetitionInterval (New-TimeSpan -Minutes 5)

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
    Write-Host "✓ Task registrada: $TaskName" -ForegroundColor Green
} catch {
    Write-Host "❌ ERRO ao registrar task: $_" -ForegroundColor Red
    exit 1
}

# Iniciar a task imediatamente
Write-Host "`n[PASSO 6] Iniciando task..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $TaskName
Write-Host "✓ Task iniciada. Aguardando 30 segundos..." -ForegroundColor Green

# ============================================
# PASSO 7: Aguardar e Monitorar
# ============================================
Start-Sleep -Seconds 30

Write-Host "`n[PASSO 7] Verificando status da task..." -ForegroundColor Yellow
$task = Get-ScheduledTask -TaskName $TaskName
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName

Write-Host "Status: $($task.State)" -ForegroundColor $(if ($task.State -eq 'Running') { 'Green' } else { 'Yellow' })
Write-Host "LastRunTime: $($taskInfo.LastRunTime)" -ForegroundColor Gray
Write-Host "LastTaskResult: $($taskInfo.LastTaskResult)" -ForegroundColor $(if ($taskInfo.LastTaskResult -eq 0) { 'Green' } else { 'Red' })

# ============================================
# PASSO 8: Verificar Logs
# ============================================
Write-Host "`n[PASSO 8] Verificando logs gerados..." -ForegroundColor Yellow

$logFiles = Get-ChildItem "$LogDir\*.log" -ErrorAction SilentlyContinue
if ($logFiles) {
    Write-Host "✓ Logs encontrados:" -ForegroundColor Green
    $logFiles | ForEach-Object {
        Write-Host "  - $($_.Name) ($('{0:N0}' -f $_.Length) bytes, $($_.LastWriteTime))" -ForegroundColor Gray
    }
    
    Write-Host "`n--- Últimas 30 linhas do log principal ---" -ForegroundColor Cyan
    $mainLog = "$LogDir\cybershield-agent-v3.log"
    if (Test-Path $mainLog) {
        Get-Content $mainLog -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match '\[ERROR\]|\[FATAL\]') {
                Write-Host $_ -ForegroundColor Red
            } elseif ($_ -match '\[WARN\]') {
                Write-Host $_ -ForegroundColor Yellow
            } elseif ($_ -match '\[SUCCESS\]|✅') {
                Write-Host $_ -ForegroundColor Green
            } else {
                Write-Host $_
            }
        }
    } else {
        Write-Host "⚠ Log principal não foi criado: $mainLog" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ NENHUM LOG ENCONTRADO!" -ForegroundColor Red
    Write-Host "   Isso indica que o script NÃO foi executado." -ForegroundColor Yellow
}

# ============================================
# PASSO 9: Verificar Event Viewer (PowerShell)
# ============================================
Write-Host "`n[PASSO 9] Verificando Event Viewer (PowerShell)..." -ForegroundColor Yellow

try {
    $events = Get-WinEvent -LogName Application -MaxEvents 20 -ErrorAction Stop | 
        Where-Object {
            $_.ProviderName -like "*PowerShell*" -or 
            $_.Message -like "*CyberShield*" -or
            $_.Message -like "*cybershield-agent*"
        } | 
        Select-Object TimeCreated, LevelDisplayName, Message -First 5
    
    if ($events) {
        Write-Host "✓ Eventos encontrados:" -ForegroundColor Green
        $events | ForEach-Object {
            Write-Host "`n--- Event: $($_.TimeCreated) [$($_.LevelDisplayName)] ---" -ForegroundColor Cyan
            Write-Host $_.Message -ForegroundColor Gray
        }
    } else {
        Write-Host "ℹ Nenhum evento relevante nos últimos 20 eventos" -ForegroundColor Gray
    }
} catch {
    Write-Host "⚠ Não foi possível acessar Event Viewer: $_" -ForegroundColor Yellow
}

# ============================================
# PASSO 10: Diagnóstico Final
# ============================================
Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor Cyan
Write-Host "║  DIAGNÓSTICO FINAL                                        ║" -ForegroundColor Cyan
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor Cyan

$success = $false
$mainLog = "$LogDir\cybershield-agent-v3.log"

if (Test-Path $mainLog) {
    $logContent = Get-Content $mainLog -Raw
    if ($logContent -match '✅ Autenticado com sucesso') {
        Write-Host "✅ SUCESSO! Agente está rodando e autenticado!" -ForegroundColor Green
        $success = $true
    } elseif ($logContent -match '\[ERROR\].*401') {
        Write-Host "❌ ERRO: Credenciais inválidas (401)" -ForegroundColor Red
        Write-Host "   - Verifique AgentToken e HmacSecret" -ForegroundColor Yellow
        Write-Host "   - Regenere as credenciais no dashboard" -ForegroundColor Yellow
    } elseif ($logContent -match '\[FATAL\]') {
        Write-Host "❌ ERRO FATAL no script" -ForegroundColor Red
        Write-Host "   - Verifique o log acima para detalhes" -ForegroundColor Yellow
    } else {
        Write-Host "⚠ Agente iniciou mas sem confirmação de autenticação" -ForegroundColor Yellow
        Write-Host "   - Aguarde mais 1-2 minutos e verifique o dashboard" -ForegroundColor Yellow
    }
} else {
    Write-Host "❌ FALHA CRÍTICA: Script não foi executado" -ForegroundColor Red
    Write-Host "`nPossíveis causas:" -ForegroundColor Yellow
    Write-Host "1. AppLocker ou outro software de segurança bloqueando" -ForegroundColor Gray
    Write-Host "2. ExecutionPolicy ainda restritiva (mesmo com Unrestricted)" -ForegroundColor Gray
    Write-Host "3. Permissões insuficientes (verifique se rodou como Admin)" -ForegroundColor Gray
    Write-Host "4. Problema com credenciais SYSTEM" -ForegroundColor Gray
    
    if ($taskInfo.LastTaskResult -ne 0) {
        Write-Host "`nCódigo de erro da task: 0x$([Convert]::ToString($taskInfo.LastTaskResult, 16).ToUpper())" -ForegroundColor Red
    }
}

Write-Host "`n╔═══════════════════════════════════════════════════════════╗" -ForegroundColor $(if ($success) { 'Green' } else { 'Yellow' })
Write-Host "║  PRÓXIMOS PASSOS                                          ║" -ForegroundColor $(if ($success) { 'Green' } else { 'Yellow' })
Write-Host "╚═══════════════════════════════════════════════════════════╝`n" -ForegroundColor $(if ($success) { 'Green' } else { 'Yellow' })

if ($success) {
    Write-Host "1. Verifique o dashboard em /admin/agent-health" -ForegroundColor Green
    Write-Host "2. O agente deve aparecer como 'Ativo' com heartbeat" -ForegroundColor Green
    Write-Host "3. Monitore os logs periodicamente:" -ForegroundColor Green
    Write-Host "   Get-Content '$mainLog' -Tail 50 -Wait" -ForegroundColor White
} else {
    Write-Host "1. Compartilhe a saída COMPLETA deste script com o suporte" -ForegroundColor Yellow
    Write-Host "2. Se possível, execute:" -ForegroundColor Yellow
    Write-Host "   Get-Content '$mainLog' -ErrorAction SilentlyContinue" -ForegroundColor White
    Write-Host "3. Verifique se há software de segurança bloqueando (antivírus, AppLocker)" -ForegroundColor Yellow
}

Write-Host ""
