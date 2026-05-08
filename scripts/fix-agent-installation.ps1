#Requires -RunAsAdministrator

# STRINGS_MAP: Mapeamento de mensagens para i18n/Cultura
$Global:UI_STRINGS = @{
    "pt-BR" = @{
        "title" = "CYBER SHIELD - FIX AGENT INSTALLATION"
        "diagnostics" = "Diagnostico e Correcao Definitiva"
        "step1" = "[PASSO 1] Verificacoes Iniciais..."
        "step2" = "[PASSO 2] Desbloqueando arquivo (remover Zone.Identifier)..."
        "step3" = "[PASSO 3] Limpando processos e tasks antigas..."
        "step4" = "[PASSO 4] Criando diretorio de logs..."
        "step5" = "[PASSO 5] Criando Scheduled Task com logging agressivo..."
        "step6" = "[PASSO 6] Iniciando task..."
        "step7" = "[PASSO 7] Verificando status da task..."
        "step8" = "[PASSO 8] Verificando logs gerados..."
        "step9" = "[PASSO 9] Verificando Event Viewer (PowerShell)..."
        "step10" = "[PASSO 10] Diagnostico Final"
        "success" = "SUCESSO! Agente esta rodando e autenticado!"
        "fail" = "FALHA CRITICA: Script nao foi executado"
    }
    "en-US" = @{
        "title" = "CYBER SHIELD - FIX AGENT INSTALLATION"
        "diagnostics" = "Diagnostic and Definitive Fix"
        "step1" = "[STEP 1] Initial Checks..."
        "step2" = "[STEP 2] Unblocking file (removing Zone.Identifier)..."
        "step3" = "[STEP 3] Cleaning old processes and tasks..."
        "step4" = "[STEP 4] Creating log directory..."
        "step5" = "[STEP 5] Creating Scheduled Task with aggressive logging..."
        "step6" = "[STEP 6] Starting task..."
        "step7" = "[STEP 7] Verifying task status..."
        "step8" = "[STEP 8] Verifying generated logs..."
        "step9" = "[STEP 9] Checking Event Viewer (PowerShell)..."
        "step10" = "[STEP 10] Final Diagnostic"
        "success" = "SUCCESS! Agent is running and authenticated!"
        "fail" = "CRITICAL FAILURE: Script was not executed"
    }
}

$culture = [System.Globalization.CultureInfo]::CurrentCulture.Name
$Global:Strings = if ($Global:UI_STRINGS.ContainsKey($culture)) { $Global:UI_STRINGS[$culture] } else { $Global:UI_STRINGS["en-US"] }

<#
.SYNOPSIS
    Script de correcao definitiva para instalacao do CyberShield Agent
    
.DESCRIPTION
    Executa o plano completo de diagnostico e correcao:
    1. Desbloqueia arquivos
    2. Limpa processos e tasks antigas
    3. Recria Scheduled Task com logging agressivo
    4. Verifica logs e Event Viewer
    5. Fornece diagnostico detalhado
    
.PARAMETER AgentToken
    Token de autenticacao do agente (obrigatorio)
    
.PARAMETER HmacSecret
    Segredo HMAC de 64 caracteres (obrigatorio)
    
.PARAMETER AgentName
    Nome do agente (obrigatorio)
    
.PARAMETER ServerUrl
    URL do servidor (padrao: https://iavbnmduxpxhwubqrzzn.supabase.co)
    
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

Write-Host "`n?????????????????????????????????????????????????????????????" -ForegroundColor Cyan
Write-Host "?  $($Global:Strings.title.PadRight(55)) ?" -ForegroundColor Cyan
Write-Host "?  $($Global:Strings.diagnostics.PadRight(55)) ?" -ForegroundColor Cyan
Write-Host "?????????????????????????????????????????????????????????????`n" -ForegroundColor Cyan

$BaseDir = "C:\CyberShield"
$LogDir = "$BaseDir\logs"
$ScriptPath = "$BaseDir\cybershield-agent-$AgentName.ps1"
$TaskName = "CyberShieldAgent-$AgentName"

# ============================================
# PASSO 1: Verificacoes Iniciais
# ============================================
Write-Host "[PASSO 1] Verificacoes Iniciais..." -ForegroundColor Yellow

if (-not (Test-Path $ScriptPath)) {
    Write-Host "[ERROR]  ERRO: Script nao encontrado em: $ScriptPath" -ForegroundColor Red
    Write-Host "   Execute primeiro o instalador para gerar o script." -ForegroundColor Yellow
    exit 1
}
Write-Host "? Script encontrado: $ScriptPath" -ForegroundColor Green

# ============================================
# PASSO 2: Desbloquear Arquivo
# ============================================
Write-Host "`n[PASSO 2] Desbloqueando arquivo (remover Zone.Identifier)..." -ForegroundColor Yellow

try {
    Unblock-File -Path $ScriptPath -ErrorAction Stop
    Write-Host "? Arquivo desbloqueado com sucesso" -ForegroundColor Green
} catch {
    Write-Host "[WARN]  Aviso ao desbloquear: $_" -ForegroundColor Yellow
}

# Verificar se ainda tem marca de bloqueio
$hasZoneId = Get-Item -Path $ScriptPath -Stream Zone.Identifier -ErrorAction SilentlyContinue
if ($hasZoneId) {
    Write-Host "[WARN]  Arquivo ainda tem Zone.Identifier. Tentando remover manualmente..." -ForegroundColor Yellow
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
            Write-Host "  ? Processo $($_.ProcessId) finalizado" -ForegroundColor Gray
        } catch {
            Write-Host "  [WARN]  Nao foi possivel finalizar processo $($_.ProcessId)" -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "? Nenhum processo antigo encontrado" -ForegroundColor Green
}

# Remover task existente
try {
    $existingTask = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
    if ($existingTask) {
        Stop-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue
        Start-Sleep -Seconds 2
        Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction Stop
        Write-Host "? Task removida: $TaskName" -ForegroundColor Green
    } else {
        Write-Host "? Nenhuma task existente encontrada" -ForegroundColor Green
    }
} catch {
    Write-Host "[WARN]  Aviso ao remover task: $_" -ForegroundColor Yellow
}

# ============================================
# PASSO 4: Criar Diretorio de Logs
# ============================================
Write-Host "`n[PASSO 4] Criando diretorio de logs..." -ForegroundColor Yellow

if (-not (Test-Path $LogDir)) {
    New-Item -ItemType Directory -Path $LogDir -Force | Out-Null
    Write-Host "? Diretorio criado: $LogDir" -ForegroundColor Green
} else {
    Write-Host "? Diretorio ja existe: $LogDir" -ForegroundColor Green
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
    Write-Host "? Task registrada: $TaskName" -ForegroundColor Green
} catch {
    Write-Host "[ERROR]  ERRO ao registrar task: $_" -ForegroundColor Red
    exit 1
}

# Iniciar a task imediatamente
Write-Host "`n[PASSO 6] Iniciando task..." -ForegroundColor Yellow
Start-ScheduledTask -TaskName $TaskName
Write-Host "? Task iniciada. Aguardando 30 segundos..." -ForegroundColor Green

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
    Write-Host "? Logs encontrados:" -ForegroundColor Green
    $logFiles | ForEach-Object {
        Write-Host "  - $($_.Name) ($('{0:N0}' -f $_.Length) bytes, $($_.LastWriteTime))" -ForegroundColor Gray
    }
    
    Write-Host "`n--- Ultimas 30 linhas do log principal ---" -ForegroundColor Cyan
    $mainLog = "$LogDir\cybershield-agent-v3.log"
    if (Test-Path $mainLog) {
        Get-Content $mainLog -Tail 30 -ErrorAction SilentlyContinue | ForEach-Object {
            if ($_ -match '\[ERROR\]|\[FATAL\]') {
                Write-Host $_ -ForegroundColor Red
            } elseif ($_ -match '\[WARN\]') {
                Write-Host $_ -ForegroundColor Yellow
            } elseif ($_ -match '\[SUCCESS\]|[OK] ') {
                Write-Host $_ -ForegroundColor Green
            } else {
                Write-Host $_
            }
        }
    } else {
        Write-Host "[WARN]  Log principal nao foi criado: $mainLog" -ForegroundColor Yellow
    }
} else {
    Write-Host "[ERROR]  NENHUM LOG ENCONTRADO!" -ForegroundColor Red
    Write-Host "   Isso indica que o script NAO foi executado." -ForegroundColor Yellow
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
        Write-Host "? Eventos encontrados:" -ForegroundColor Green
        $events | ForEach-Object {
            Write-Host "`n--- Event: $($_.TimeCreated) [$($_.LevelDisplayName)] ---" -ForegroundColor Cyan
            Write-Host $_.Message -ForegroundColor Gray
        }
    } else {
        Write-Host "[INFO]  Nenhum evento relevante nos ultimos 20 eventos" -ForegroundColor Gray
    }
} catch {
    Write-Host "[WARN]  Nao foi possivel acessar Event Viewer: $_" -ForegroundColor Yellow
}

# ============================================
# PASSO 10: Diagnostico Final
# ============================================
Write-Host "`n?????????????????????????????????????????????????????????????" -ForegroundColor Cyan
Write-Host "?  DIAGNOSTICO FINAL                                        ?" -ForegroundColor Cyan
Write-Host "?????????????????????????????????????????????????????????????`n" -ForegroundColor Cyan

$success = $false
$mainLog = "$LogDir\cybershield-agent-v3.log"

if (Test-Path $mainLog) {
    $logContent = Get-Content $mainLog -Raw
    if ($logContent -match '[OK]  Autenticado com sucesso') {
        Write-Host "[OK]  SUCESSO! Agente esta rodando e autenticado!" -ForegroundColor Green
        $success = $true
    } elseif ($logContent -match '\[ERROR\].*401') {
        Write-Host "[ERROR]  ERRO: Credenciais invalidas (401)" -ForegroundColor Red
        Write-Host "   - Verifique AgentToken e HmacSecret" -ForegroundColor Yellow
        Write-Host "   - Regenere as credenciais no dashboard" -ForegroundColor Yellow
    } elseif ($logContent -match '\[FATAL\]') {
        Write-Host "[ERROR]  ERRO FATAL no script" -ForegroundColor Red
        Write-Host "   - Verifique o log acima para detalhes" -ForegroundColor Yellow
    } else {
        Write-Host "[WARN]  Agente iniciou mas sem confirmacao de autenticacao" -ForegroundColor Yellow
        Write-Host "   - Aguarde mais 1-2 minutos e verifique o dashboard" -ForegroundColor Yellow
    }
} else {
    Write-Host "[ERROR]  FALHA CRITICA: Script nao foi executado" -ForegroundColor Red
    Write-Host "`nPossiveis causas:" -ForegroundColor Yellow
    Write-Host "1. AppLocker ou outro software de seguranca bloqueando" -ForegroundColor Gray
    Write-Host "2. ExecutionPolicy ainda restritiva (mesmo com Unrestricted)" -ForegroundColor Gray
    Write-Host "3. Permissoes insuficientes (verifique se rodou como Admin)" -ForegroundColor Gray
    Write-Host "4. Problema com credenciais SYSTEM" -ForegroundColor Gray
    
    if ($taskInfo.LastTaskResult -ne 0) {
        Write-Host "`nCodigo de erro da task: 0x$([Convert]::ToString($taskInfo.LastTaskResult, 16).ToUpper())" -ForegroundColor Red
    }
}

Write-Host "`n?????????????????????????????????????????????????????????????" -ForegroundColor $(if ($success) { 'Green' } else { 'Yellow' })
Write-Host "?  PROXIMOS PASSOS                                          ?" -ForegroundColor $(if ($success) { 'Green' } else { 'Yellow' })
Write-Host "?????????????????????????????????????????????????????????????`n" -ForegroundColor $(if ($success) { 'Green' } else { 'Yellow' })

if ($success) {
    Write-Host "1. Verifique o dashboard em /admin/agent-health" -ForegroundColor Green
    Write-Host "2. O agente deve aparecer como 'Ativo' com heartbeat" -ForegroundColor Green
    Write-Host "3. Monitore os logs periodicamente:" -ForegroundColor Green
    Write-Host "   Get-Content '$mainLog' -Tail 50 -Wait" -ForegroundColor White
} else {
    Write-Host "1. Compartilhe a saida COMPLETA deste script com o suporte" -ForegroundColor Yellow
    Write-Host "2. Se possivel, execute:" -ForegroundColor Yellow
    Write-Host "   Get-Content '$mainLog' -ErrorAction SilentlyContinue" -ForegroundColor White
    Write-Host "3. Verifique se ha software de seguranca bloqueando (antivirus, AppLocker)" -ForegroundColor Yellow
}

Write-Host ""
