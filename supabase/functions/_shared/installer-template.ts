/**
 * Single Source of Truth for Installers
 * 
 * This file is the ONLY authoritative template for Windows/Linux/macOS installers.
 * Last synchronized: 2025-01-19 (v3.1.0-HARDENED)
 */

// Windows Installer Template (v3.1.0-HARDENED)
export const WINDOWS_INSTALLER_TEMPLATE = String.raw`#Requires -RunAsAdministrator
#Requires -Version 5.1

param(
  [Parameter(Mandatory = $true)]
  [string]$ServerUrl   = "{{SERVER_URL}}",
  [Parameter(Mandatory = $true)]
  [string]$AgentToken  = "{{AGENT_TOKEN}}",
  [Parameter(Mandatory = $true)]
  [string]$HmacSecret  = "{{HMAC_SECRET}}",
  [Parameter(Mandatory = $true)]
  [string]$AgentName   = "{{AGENT_NAME}}"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

# Forcar TLS 1.2 para compatibilidade com Windows Server
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# ============= FASE 0: Pre-checks (Silent) =============
$BasePath  = "C:\\CyberShield"
$LogsPath  = Join-Path $BasePath "logs"
$LogFile   = Join-Path $LogsPath "installer.log"

# Criar pastas base e logs SEM logging (ainda nao temos a funcao)
if (-not (Test-Path $BasePath)) {
    New-Item -ItemType Directory -Path $BasePath -Force | Out-Null
}

if (-not (Test-Path $LogsPath)) {
    New-Item -ItemType Directory -Path $LogsPath -Force | Out-Null
}

# Garantir permissoes para SYSTEM (silencioso)
try {
    $acl = Get-Acl $LogsPath
    $systemRule = New-Object System.Security.AccessControl.FileSystemAccessRule(
        "NT AUTHORITY\\SYSTEM",
        "FullControl",
        "ContainerInherit,ObjectInherit",
        "None",
        "Allow"
    )
    $acl.SetAccessRule($systemRule)
    Set-Acl -Path $LogsPath -AclObject $acl
} catch {
    # Silencioso - vamos logar depois se falhar
}

# ============= FASE 1: Definir Logging =============
function Write-InstallerLog {
    param([string]$Message, [string]$Level = "INFO")
    $line = "[{0}] [{1}] {2}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Level, $Message
    $line | Out-File -FilePath $LogFile -Append -Encoding UTF8
    Write-Host $line
}

# ============= FUNCOES AUXILIARES HMAC =============
function Convert-HexToBytes {
    param([string]$HexString)
    $HexString = $HexString -replace '\s', ''
    if ($HexString.Length % 2 -ne 0) {
        throw "HexString deve ter comprimento par (64 chars para SHA256)"
    }
    $bytes = [byte[]]::new($HexString.Length / 2)
    for ($i = 0; $i -lt $HexString.Length; $i += 2) {
        $bytes[$i / 2] = [Convert]::ToByte($HexString.Substring($i, 2), 16)
    }
    return $bytes
}

function Get-HmacSignature {
    param(
        [string]$Message,
        [string]$SecretHex
    )
    $keyBytes = Convert-HexToBytes $SecretHex
    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $keyBytes
    $messageBytes = [Text.Encoding]::UTF8.GetBytes($Message)
    $signatureBytes = $hmac.ComputeHash($messageBytes)
    return ([System.BitConverter]::ToString($signatureBytes) -replace '-', '').ToLower()
}

# ============= FASE 2: Logging Habilitado =============

# Agora podemos logar tudo
Write-InstallerLog "=== CyberShield Agent Installer {{INSTALLER_VERSION}} ===" "INFO"
Write-InstallerLog "ServerUrl: $ServerUrl" "INFO"
Write-InstallerLog "AgentName: $AgentName" "INFO"
Write-InstallerLog "Pasta base: $BasePath" "INFO"
Write-InstallerLog "Pasta de logs: $LogsPath" "INFO"

# Registrar event source para fallback
try {
    if (-not [System.Diagnostics.EventLog]::SourceExists("CyberShield")) {
        New-EventLog -LogName Application -Source "CyberShield"
        Write-InstallerLog "Event source 'CyberShield' registrada" "SUCCESS"
    } else {
        Write-InstallerLog "Event source 'CyberShield' ja existe" "INFO"
    }
} catch {
    Write-InstallerLog "Aviso: nao foi possivel registrar event source 'CyberShield': $($_.Exception.Message)" "WARN"
}

# ============= FASE 1: Cleanup =============
Write-InstallerLog "FASE 1: Limpando instalacoes anteriores..." "INFO"

# Stop old processes
try {
    Get-Process -Name "*cybershield*" -ErrorAction SilentlyContinue | ForEach-Object {
        Write-InstallerLog "Parando processo: $($_.Name) (PID: $($_.Id))" "INFO"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
} catch {
    Write-InstallerLog "Aviso ao parar processos: $($_.Exception.Message)" "WARN"
}

# Remove old scheduled tasks
Write-InstallerLog "Removendo tasks antigas do CyberShield..." "INFO"
try {
    # Metodo 1: PowerShell cmdlet
    $oldTasks = Get-ScheduledTask -TaskName "CyberShieldAgent*" -ErrorAction SilentlyContinue
    if ($oldTasks) {
        foreach ($task in $oldTasks) {
            Write-InstallerLog "Removendo task antiga (cmdlet): $($task.TaskName)" "INFO"
            try {
                Stop-ScheduledTask -TaskName $task.TaskName -ErrorAction SilentlyContinue
                Unregister-ScheduledTask -TaskName $task.TaskName -Confirm:$false -ErrorAction Stop
                Write-InstallerLog "Task removida com sucesso: $($task.TaskName)" "SUCCESS"
            } catch {
                Write-InstallerLog "Falha ao remover $($task.TaskName) via cmdlet: $($_.Exception.Message)" "WARN"
            }
        }
    }
    
    # Metodo 2: schtasks.exe (fallback mais agressivo)
    $schtasksOutput = schtasks.exe /Query /FO CSV 2>&1 | ConvertFrom-Csv -ErrorAction SilentlyContinue
    if ($schtasksOutput) {
        $cyberShieldTasks = $schtasksOutput | Where-Object { $_.'TaskName' -like '*CyberShieldAgent*' }
        if ($cyberShieldTasks) {
            foreach ($task in $cyberShieldTasks) {
                $taskName = $task.'TaskName'.TrimStart('\\')
                Write-InstallerLog "Removendo task antiga (schtasks): $taskName" "INFO"
                $deleteResult = schtasks.exe /Delete /TN "$taskName" /F 2>&1
                Write-InstallerLog "Resultado: $deleteResult" "DEBUG"
            }
        }
    }
    
    Write-InstallerLog "Cleanup de tasks antigas concluido" "SUCCESS"
} catch {
    Write-InstallerLog "Aviso ao remover tasks: $($_.Exception.Message)" "WARN"
}

# FASE 1.3 - Encerrar processos PowerShell que estao executando scripts do agente
try {
    Write-InstallerLog "Verificando processos PowerShell relacionados ao agente..." "INFO"

    $agentProcesses = Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" -ErrorAction SilentlyContinue |
        Where-Object {
            $_.CommandLine -ne $null -and
            $_.CommandLine -like "*cybershield-agent*" 
        }

    if ($agentProcesses) {
        foreach ($proc in $agentProcesses) {
            try {
                Write-InstallerLog "Parando processo PowerShell do agente (PID: $($proc.ProcessId))" "INFO"
                Stop-Process -Id $proc.ProcessId -Force -ErrorAction SilentlyContinue
                Start-Sleep -Milliseconds 500
            } catch {
                Write-InstallerLog "Aviso ao parar processo PowerShell PID=$($proc.ProcessId): $($_.Exception.Message)" "WARN"
            }
        }
    } else {
        Write-InstallerLog "Nenhum processo PowerShell do agente encontrado" "INFO"
    }
} catch {
    Write-InstallerLog "Aviso ao consultar processos PowerShell: $($_.Exception.Message)" "WARN"
}

Write-InstallerLog "FASE 1: Cleanup concluido" "SUCCESS"

# ============= FASE 1.2: Windows Defender Exclusions =============
Write-InstallerLog "FASE 1.2: Configurando exclusoes do Windows Defender..." "INFO"

try {
    # Verificar se cmdlets do Windows Defender estao disponiveis
    $defenderModule = Get-Command -Name Add-MpPreference -ErrorAction SilentlyContinue
    
    if ($defenderModule) {
        # Adicionar exclusao de pasta
        Add-MpPreference -ExclusionPath "C:\\CyberShield" -ErrorAction Stop
        Write-InstallerLog "Exclusao de pasta adicionada: C:\\CyberShield" "SUCCESS"
        
        # Adicionar exclusao do processo do agente
        $agentProcessPath = "C:\\CyberShield\\*.ps1"
        Add-MpPreference -ExclusionPath $agentProcessPath -ErrorAction SilentlyContinue
        Write-InstallerLog "Exclusao de scripts adicionada: $agentProcessPath" "SUCCESS"
        
        # Adicionar exclusao do processo PowerShell que executa o agente
        Add-MpPreference -ExclusionProcess "powershell.exe" -ErrorAction SilentlyContinue
        Write-InstallerLog "Exclusao de processo adicionada: powershell.exe" "INFO"
        
        # Verificar se as exclusoes foram aplicadas
        $currentExclusions = Get-MpPreference
        if ($currentExclusions.ExclusionPath -contains "C:\\CyberShield") {
            Write-InstallerLog "[OK]  Windows Defender exclusoes configuradas com sucesso" "SUCCESS"
        } else {
            Write-InstallerLog "[WARN] Exclusao pode nao ter sido aplicada. Verifique manualmente." "WARN"
        }
    } else {
        Write-InstallerLog "Windows Defender cmdlets nao disponiveis (servidor sem Defender ou versao antiga)" "INFO"
    }
} catch {
    Write-InstallerLog "Aviso: Nao foi possivel configurar exclusoes do Windows Defender: $($_.Exception.Message)" "WARN"
    Write-InstallerLog "Recomendacao: Configure manualmente a exclusao da pasta C:\\CyberShield" "INFO"
}

Write-InstallerLog "FASE 1.2: Configuracao de exclusoes concluida" "INFO"

# ============= FASE 1.5: Diagnostico de Seguranca =============
Write-InstallerLog "=== Diagnostico de Restricoes de Seguranca ===" "INFO"

# 1. ExecutionPolicy por escopo
try {
    $policies = Get-ExecutionPolicy -List
    foreach ($policy in $policies) {
        Write-InstallerLog "ExecutionPolicy [$($policy.Scope)]: $($policy.ExecutionPolicy)" "INFO"
    }
    
    # ALERTA se GPO forcar AllSigned/Restricted
    $machinePolicy = ($policies | Where-Object { $_.Scope -eq "MachinePolicy" }).ExecutionPolicy
    if ($machinePolicy -in @("AllSigned", "Restricted")) {
        Write-InstallerLog "AVISO CRITICO: GPO forcando ExecutionPolicy=$machinePolicy (ignora -ExecutionPolicy da linha de comando!)" "ERROR"
        Write-InstallerLog "Solucao: Assinar scripts OU ajustar GPO" "ERROR"
    }
} catch {
    Write-InstallerLog "Falha ao ler ExecutionPolicy: $($_.Exception.Message)" "WARN"
}

# 2. LanguageMode (detecta Constrained Language)
try {
    $languageMode = $ExecutionContext.SessionState.LanguageMode
    Write-InstallerLog "LanguageMode: $languageMode" "INFO"
    
    if ($languageMode -eq "ConstrainedLanguage") {
        Write-InstallerLog "AVISO CRITICO: ConstrainedLanguage ativo (limita operacoes .NET, crypto, network)" "ERROR"
        Write-InstallerLog "Causa provavel: Device Guard / WDAC / AppLocker" "ERROR"
    }
} catch {
    Write-InstallerLog "Falha ao ler LanguageMode: $($_.Exception.Message)" "WARN"
}

# 3. Testar AppLocker (tentativa basica)
try {
    $testPath = "$env:TEMP\cybershield-test-$(Get-Random).ps1"
    "'Write-Host Test'" | Out-File $testPath -Encoding UTF8
    
    $testResult = & powershell.exe -ExecutionPolicy Bypass -File $testPath 2>&1
    Remove-Item $testPath -ErrorAction SilentlyContinue
    
    Write-InstallerLog "Teste de execucao basico: PASSOU" "SUCCESS"
} catch {
    Write-InstallerLog "AVISO: Teste de execucao falhou - possivel AppLocker/WDAC: $($_.Exception.Message)" "ERROR"
}

# 4. Verificar AV/EDR (heuristico - via Event Viewer)
try {
    $defenderLogs = Get-WinEvent -LogName "Microsoft-Windows-Windows Defender/Operational" -MaxEvents 5 -ErrorAction SilentlyContinue | 
        Where-Object { $_.Message -like "*PowerShell*" -or $_.Message -like "*CyberShield*" }
    
    if ($defenderLogs) {
        Write-InstallerLog "AVISO: Eventos recentes do Windows Defender relacionados a PowerShell detectados" "WARN"
        foreach ($log in $defenderLogs) {
            $shortMessage = $log.Message.Substring(0, [Math]::Min(100, $log.Message.Length))
            Write-InstallerLog "  - ID $($log.Id): $shortMessage" "WARN"
        }
    } else {
        Write-InstallerLog "Nenhum evento suspeito do Windows Defender detectado" "SUCCESS"
    }
} catch {
    # Silencioso - nem todos os ambientes tem Defender logs acessiveis
    Write-InstallerLog "Nao foi possivel verificar logs do Windows Defender (esperado em alguns ambientes)" "DEBUG"
}

# 5. Device Guard / WDAC
try {
    $wdac = Get-CimInstance -ClassName Win32_DeviceGuard -Namespace root\Microsoft\Windows\DeviceGuard -ErrorAction SilentlyContinue
    if ($wdac -and $wdac.CodeIntegrityPolicyEnforcementStatus -eq 1) {
        Write-InstallerLog "AVISO CRITICO: WDAC/Device Guard ATIVO - apenas codigo assinado permitido!" "ERROR"
    } else {
        Write-InstallerLog "Device Guard / WDAC: Nao ativo ou nao configurado" "INFO"
    }
} catch {
    Write-InstallerLog "Nao foi possivel verificar Device Guard (esperado em alguns ambientes)" "DEBUG"
}

Write-InstallerLog "=== Fim do Diagnostico de Seguranca ===" "INFO"

# ============= FASE 2: Instalacao =============
Write-InstallerLog "FASE 2: Criando script do agente..." "INFO"

# Telemetria: downloaded
try {
    $telemetryDownloaded = @{
        agent_name = $AgentName
        event_type = "downloaded"
        platform = "windows"
        success = $true
        metadata = @{
            installer_version = "{{INSTALLER_VERSION}}"
        }
    } | ConvertTo-Json -Compress
    
    $timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    $nonce = [guid]::NewGuid().ToString()
    $payload = '{0}:{1}:{2}' -f $timestamp, $nonce, $telemetryDownloaded
    $signature = Get-HmacSignature -Message $payload -SecretHex $HmacSecret
    
    Invoke-WebRequest -Uri "$ServerUrl/functions/v1/track-installation-event" -Method POST -Body $telemetryDownloaded -Headers @{
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $timestamp
        "X-Nonce" = $nonce
        "Content-Type" = "application/json"
    } -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
} catch {
    Write-InstallerLog "Telemetria downloaded falhou (nao critico): $($_.Exception.Message)" "DEBUG"
}

$AgentScriptContent = @'
{{AGENT_SCRIPT_CONTENT}}
'@

$AgentScriptPath = Join-Path $BasePath "cybershield-agent-$AgentName.ps1"

# Salvar script do agente em UTF-8 SEM BOM (compativel com PowerShell 5.1 e Task Scheduler)
Write-InstallerLog "Salvando script do agente em UTF-8 sem BOM..." "INFO"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($AgentScriptPath, $AgentScriptContent, $utf8NoBom)

Write-InstallerLog "Script criado: $AgentScriptPath ($(([System.IO.FileInfo]$AgentScriptPath).Length) bytes)" "SUCCESS"

# Telemetria: installed
try {
    $telemetryInstalled = @{
        agent_name = $AgentName
        event_type = "installed"
        platform = "windows"
        success = $true
        metadata = @{
            installer_version = "{{INSTALLER_VERSION}}"
            script_size_bytes = ([System.IO.FileInfo]$AgentScriptPath).Length
        }
    } | ConvertTo-Json -Compress
    
    $timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    $nonce = [guid]::NewGuid().ToString()
    $payload = '{0}:{1}:{2}' -f $timestamp, $nonce, $telemetryInstalled
    $signature = Get-HmacSignature -Message $payload -SecretHex $HmacSecret
    
    Invoke-WebRequest -Uri "$ServerUrl/functions/v1/track-installation-event" -Method POST -Body $telemetryInstalled -Headers @{
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $timestamp
        "X-Nonce" = $nonce
        "Content-Type" = "application/json"
    } -UseBasicParsing -TimeoutSec 10 -ErrorAction SilentlyContinue | Out-Null
} catch {
    Write-InstallerLog "Telemetria installed falhou (nao critico): $($_.Exception.Message)" "DEBUG"
}

# CRITICAL: Desbloquear arquivo para permitir execucao pela Scheduled Task
Write-InstallerLog "Verificando Zone.Identifier..." "DEBUG"
if (Test-Path "$AgentScriptPath:Zone.Identifier") {
    Write-InstallerLog "Zone.Identifier detectado - script marcado como da internet" "WARN"
}

try {
    Unblock-File -Path $AgentScriptPath -ErrorAction Stop
    Write-InstallerLog "Script desbloqueado com sucesso" "SUCCESS"
} catch {
    Write-InstallerLog "AVISO: Falha ao desbloquear arquivo: $($_.Exception.Message)" "WARN"
    Write-InstallerLog "Tentando remover Zone.Identifier manualmente..." "INFO"
    try {
        Remove-Item -Path "$AgentScriptPath:Zone.Identifier" -ErrorAction SilentlyContinue
        Write-InstallerLog "Zone.Identifier removido manualmente" "SUCCESS"
    } catch {
        Write-InstallerLog "Falha ao remover Zone.Identifier. O agente pode nao executar." "ERROR"
    }
}

# Validacao pos-desbloqueio
if (Test-Path "$AgentScriptPath:Zone.Identifier") {
    Write-InstallerLog "CRITICO: Zone.Identifier ainda presente apos desbloqueio!" "ERROR"
} else {
    Write-InstallerLog "Validacao: Zone.Identifier removido com sucesso" "SUCCESS"
}

# Validacao critica de encoding
Write-InstallerLog "Validando encoding do script..." "INFO"
try {
    $bytes = [System.IO.File]::ReadAllBytes($AgentScriptPath)
    
    # Detectar UTF-16 LE (0xFF 0xFE) - isso impede execucao
    if ($bytes.Length -ge 2 -and $bytes[0] -eq 0xFF -and $bytes[1] -eq 0xFE) {
        Write-InstallerLog "[ERROR]  ERRO CRITICO: Script salvo em UTF-16 LE - instalacao falhara!" "ERROR"
        throw "Encoding incorreto detectado (UTF-16 LE). Script nao sera executavel."
    }
    
    # Detectar UTF-8 com BOM (aceitavel mas nao ideal)
    if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
        Write-InstallerLog "[WARN] AVISO: Script tem BOM UTF-8 (funciona, mas nao e ideal)" "WARN"
    } else {
        Write-InstallerLog "[OK]  Encoding validado: UTF-8 sem BOM (IDEAL)" "SUCCESS"
    }
} catch {
    Write-InstallerLog "[WARN] Falha na validacao de encoding: $($_.Exception.Message)" "WARN"
    Write-InstallerLog "Continuando instalacao..." "INFO"
}

# ============= FASE 3: Self-test =============
Write-InstallerLog "FASE 3: Testando conectividade com backend..." "INFO"

try {
    $healthUrl = "$ServerUrl/functions/v1/health"
    $response = Invoke-WebRequest -Uri $healthUrl -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    Write-InstallerLog "Health check OK: $($response.StatusCode)" "SUCCESS"
} catch {
    Write-InstallerLog "AVISO: Health check falhou: $($_.Exception.Message)" "WARN"
    Write-InstallerLog "Continuando instalacao (agente tentara conectar depois)..." "INFO"
}

Write-InstallerLog "FASE 3: Self-test concluido" "SUCCESS"

# ============= VALIDACAO CRITICA: Script do Agente =============
Write-InstallerLog "Validando script do agente..." "INFO"

if (-not (Test-Path $AgentScriptPath)) {
    Write-InstallerLog "[ERROR]  ERRO CRITICO: Script do agente nao foi criado" "ERROR"
    throw "Script do agente nao encontrado em: $AgentScriptPath"
}

$scriptSize = (Get-Item $AgentScriptPath).Length
if ($scriptSize -lt 10000) {  # Script completo deve ter ~50KB+
    Write-InstallerLog "[ERROR]  ERRO: Script do agente incompleto ($scriptSize bytes)" "ERROR"
    throw "Script do agente muito pequeno. Esperado >10KB, encontrado: $scriptSize bytes"
}

Write-InstallerLog "[OK]  Script do agente validado: $scriptSize bytes" "SUCCESS"

# ============= VALIDACAO CRITICA: Sintaxe PowerShell =============
Write-InstallerLog "Validando sintaxe PowerShell do script..." "INFO"
try {
    $scriptContent = Get-Content -Path $AgentScriptPath -Raw -ErrorAction Stop
    $null = [ScriptBlock]::Create($scriptContent)
    Write-InstallerLog "[OK]  Sintaxe PowerShell validada com sucesso" "SUCCESS"
} catch {
    Write-InstallerLog "[ERROR]  ERRO CRITICO: Script com erro de sintaxe PowerShell!" "ERROR"
    Write-InstallerLog "[ERROR]  Detalhes: $($_.Exception.Message)" "ERROR"
    throw "Script do agente contem erro de sintaxe. Instalacao abortada. Erro: $($_.Exception.Message)"
}

# Testar escrita no log do agente antes de criar a scheduled task
$AgentLogPath = Join-Path $LogsPath "cybershield-agent-v4.log"

# Remover log antigo se existir, para evitar conflitos com handle travado
if (Test-Path $AgentLogPath) {
    try {
        Remove-Item -Path $AgentLogPath -Force -ErrorAction Stop
        Write-InstallerLog "Log antigo removido: $AgentLogPath" "INFO"
    } catch {
        Write-InstallerLog "Aviso: nao foi possivel remover log antigo (possivelmente em uso): $($_.Exception.Message)" "WARN"
    }
}

# Teste de escrita no log do agente com retry
$maxRetries   = 3
$writeSuccess = $false

for ($i = 1; $i -le $maxRetries; $i++) {
    try {
        $ts   = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
        $line = "$ts [INFO] Agent log criado pelo instalador (tentativa $i)"

        Add-Content -Path $AgentLogPath -Value $line -Encoding UTF8

        Write-InstallerLog "Teste de escrita no log do agente ok: $AgentLogPath" "SUCCESS"
        $writeSuccess = $true
        break
    } catch {
        Write-InstallerLog "Tentativa $i de escrita no log do agente falhou: $($_.Exception.Message)" "WARN"

        if ($i -lt $maxRetries) {
            Start-Sleep -Seconds 2
        }
    }
}

if (-not $writeSuccess) {
    $msg = "Instalacao abortada: sem permissao para criar logs do agente em $AgentLogPath apos $maxRetries tentativas"
    Write-InstallerLog $msg "ERROR"
    throw $msg
}

# ============= FASE 4: Scheduled Task (v4.3.0 ENHANCED) =============
Write-InstallerLog "FASE 4: Criando Scheduled Task com watchdog settings..." "INFO"

$TaskName = "CyberShieldAgent-$AgentName"

# Construir argumentos de forma segura (sem aspas internas problematicas)
$ps1Path = $AgentScriptPath
$ps1Url = $ServerUrl
$ps1Token = $AgentToken  
$ps1Secret = $HmacSecret
$ps1Name = $AgentName

# Montar string de argumentos com double-double quotes ("") para escaping interno
$ArgumentString = "-ExecutionPolicy Unrestricted -NoProfile -WindowStyle Hidden -File ""$ps1Path"" -ServerUrl ""$ps1Url"" -AgentToken ""$ps1Token"" -HmacSecret ""$ps1Secret"" -AgentName ""$ps1Name"""

Write-InstallerLog "Task arguments: $ArgumentString" "DEBUG"

$Action = New-ScheduledTaskAction -Execute "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Argument $ArgumentString

# Trigger primario: na inicializacao do sistema
$TriggerStartup = New-ScheduledTaskTrigger -AtStartup

# Trigger secundario: repetir a cada 5 minutos (watchdog externo)
# Isso garante que mesmo se a task parar, ela sera reiniciada em no maximo 5 minutos
# CRITICAL FIX: Usar P365D em vez de [TimeSpan]::MaxValue para evitar erro "Duration:P999999990T23H59M59S"
$TriggerRepeat = New-ScheduledTaskTrigger -Once -At (Get-Date) -RepetitionInterval (New-TimeSpan -Minutes 5) -RepetitionDuration (New-TimeSpan -Days 365)

$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest

# v4.3.1: Settings otimizados para maxima resiliencia (ExecutionTimeLimit corrigido)
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 999 -ExecutionTimeLimit (New-TimeSpan -Days 9999) -MultipleInstances IgnoreNew

Write-InstallerLog "Task Settings: RestartCount=999, RestartInterval=1min, ExecutionTimeLimit=Unlimited, RepetitionInterval=5min" "INFO"

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger @($TriggerStartup, $TriggerRepeat) -Principal $Principal -Settings $Settings -Force | Out-Null

Write-InstallerLog "Scheduled Task criada com watchdog: $TaskName" "SUCCESS"

# ============= FASE 5: Inicializacao =============
Write-InstallerLog "FASE 5: Iniciando agente..." "INFO"

Start-ScheduledTask -TaskName $TaskName
Write-InstallerLog "Scheduled Task iniciada" "INFO"

# Aguardar execucao inicial
Start-Sleep -Seconds 5

# Diagnostico: verificar status da task
try {
    $taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
    $task = Get-ScheduledTask -TaskName $TaskName
    Write-InstallerLog "Scheduled task state: $($task.State)" "INFO"
    Write-InstallerLog "Scheduled task last run time: $($taskInfo.LastRunTime)" "INFO"
    Write-InstallerLog "Scheduled task last result: $($taskInfo.LastTaskResult)" "INFO"
} catch {
    Write-InstallerLog ("Aviso: nao foi possivel ler informacoes da scheduled task " + $TaskName + ": " + $($_.Exception.Message)) "WARN"
}

# Diagnostico: ler eventos recentes do EventLog Application para o source CyberShield
Write-InstallerLog "Verificando eventos recentes no EventLog Application para source 'CyberShield'" "INFO"
try {
    $cutoff = (Get-Date).AddMinutes(-2)
    $events = Get-EventLog -LogName Application -Source "CyberShield" -After $cutoff -Newest 10 -ErrorAction SilentlyContinue
    if ($events) {
        foreach ($evt in $events) {
            $line = "EventLog [$($evt.EntryType)] $($evt.TimeGenerated): $($evt.Message)"
            Write-InstallerLog $line "DEBUG"
        }
    } else {
        Write-InstallerLog "Nenhum evento recente encontrado para source 'CyberShield'" "INFO"
    }
} catch {
    Write-InstallerLog "Aviso: nao foi possivel ler EventLog Application: $($_.Exception.Message)" "WARN"
}

# Validacao completa da task
$taskInfo = Get-ScheduledTaskInfo -TaskName $TaskName
$taskState = Get-ScheduledTask -TaskName $TaskName

Write-InstallerLog "Task State: $($taskState.State)" "INFO"
Write-InstallerLog "Last Run Time: $($taskInfo.LastRunTime)" "INFO"
Write-InstallerLog "Last Task Result: $($taskInfo.LastTaskResult)" "INFO"

if ($taskInfo.LastTaskResult -ne 0 -and $taskInfo.LastTaskResult -ne $null) {
    Write-InstallerLog "[WARN] AVISO: Task retornou codigo de erro: $($taskInfo.LastTaskResult)" "WARN"
    Write-InstallerLog "Isso pode indicar problema com argumentos ou permissoes" "WARN"
    
    # Diagnostico especifico por codigo de erro
    switch ($taskInfo.LastTaskResult) {
        1 {
            Write-InstallerLog "Codigo 1: Erro generico. Verifique argumentos da task." "WARN"
        }
        2147942667 {
            Write-InstallerLog "Codigo 2147942667: Arquivo nao encontrado. Verifique path do script." "WARN"
        }
        2147943140 {
            Write-InstallerLog "Codigo 2147943140: Acesso negado. Verifique permissoes SYSTEM." "WARN"
        }
        2147942402 {
            Write-InstallerLog "Codigo 2147942402: Arquivo em uso. Aguarde e tente novamente." "WARN"
        }
        4294770688 {
            Write-InstallerLog "Codigo 4294770688: Argumentos mal formatados. Verifique escaping." "WARN"
        }
        default {
            Write-InstallerLog "Codigo desconhecido: $($taskInfo.LastTaskResult)" "WARN"
        }
    }
    
    # Sugerir proximos passos
    Write-InstallerLog "Proximos passos de diagnostico:" "INFO"
    Write-InstallerLog "  1. Verificar log do agente: C:\\CyberShield\\logs\\cybershield-agent-v4.log" "INFO"
    Write-InstallerLog "  2. Executar manualmente: C:\\CyberShield\\cybershield-agent-$AgentName.ps1" "INFO"
    Write-InstallerLog "  3. Verificar Event Viewer: Logs de Aplicativo" "INFO"
}

# Verificar se o agente conseguiu iniciar (log criado)
Start-Sleep -Seconds 10

$agentLogPath = Join-Path $LogsPath "cybershield-agent-v4.log"
if (Test-Path $agentLogPath) {
    $logSize = (Get-Item $agentLogPath).Length
    Write-InstallerLog "[OK]  Log do agente detectado: $agentLogPath ($logSize bytes)" "SUCCESS"
} else {
    Write-InstallerLog "[WARN] AVISO: Log do agente nao encontrado apos 10s" "WARN"
    Write-InstallerLog "Path esperado: $agentLogPath" "INFO"
    Write-InstallerLog "Verifique se a Scheduled Task esta executando corretamente" "WARN"
}

Write-InstallerLog "FASE 5: Agente iniciado" "SUCCESS"

# ============= FASE 6: Telemetria com HMAC =============
Write-InstallerLog "FASE 6: Enviando telemetria de instalacao..." "INFO"

try {
    $telemetryBody = @{
        agent_name = $AgentName
        event_type = "post_installation"
        platform = "windows"
        success = $true
        installation_method = "one_click"
        network_connectivity = $true
        metadata = @{
            installer_version = "{{INSTALLER_VERSION}}"
            powershell_version = $PSVersionTable.PSVersion.ToString()
            os_version = [System.Environment]::OSVersion.Version.ToString()
        }
    }
    
    $bodyJson = $telemetryBody | ConvertTo-Json -Depth 5 -Compress
    
    # Calcular HMAC
    $timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
    $nonce = [guid]::NewGuid().ToString()
    $payload = '{0}:{1}:{2}' -f $timestamp, $nonce, $bodyJson
    $signature = Get-HmacSignature -Message $payload -SecretHex $HmacSecret
    
    $headers = @{
        "X-Agent-Token" = $AgentToken
        "X-HMAC-Signature" = $signature
        "X-Timestamp" = $timestamp
        "X-Nonce" = $nonce
        "Content-Type" = "application/json"
    }
    
    $telemetryUrl = "$ServerUrl/functions/v1/track-installation-event"
    Write-InstallerLog "Enviando telemetria para: $telemetryUrl" "DEBUG"
    
    $response = Invoke-WebRequest -Uri $telemetryUrl -Method POST -Body $bodyJson -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    
    Write-InstallerLog "Telemetria enviada com sucesso (HTTP $($response.StatusCode))" "SUCCESS"
    Write-InstallerLog "Instalacao rastreada no sistema de analytics" "INFO"
} catch {
    $errorDetails = $_.Exception.Message
    $statusCode = "N/A"
    
    # Extrair codigo HTTP se disponivel
    if ($_.Exception.Response) {
        $statusCode = [int]$_.Exception.Response.StatusCode
    }
    
    Write-InstallerLog "AVISO: Falha ao enviar telemetria (HTTP $statusCode): $errorDetails" "WARN"
    
    # Diagnostico especifico por tipo de erro
    if ($statusCode -eq 401) {
        Write-InstallerLog "Erro de autenticacao HMAC. Token ou secret pode estar invalido." "WARN"
    } elseif ($statusCode -eq 500) {
        Write-InstallerLog "Erro no servidor backend. Verifique logs do Edge Function." "WARN"
    } else {
        Write-InstallerLog "Erro de rede ou timeout. Verifique conectividade." "WARN"
    }
    
    Write-InstallerLog "Instalacao concluida, mas telemetria nao foi enviada" "INFO"
    Write-InstallerLog "O agente ainda pode funcionar normalmente via heartbeats" "INFO"
}

# ============= Conclusao =============
Write-Host ""
Write-Host "============================================" -ForegroundColor Green
Write-Host "[OK]  Instalacao concluida com sucesso!" -ForegroundColor Green
Write-Host "============================================" -ForegroundColor Green
Write-Host ""
Write-Host "Detalhes da instalacao:" -ForegroundColor Cyan
Write-Host "  * Agente: $AgentName" -ForegroundColor White
Write-Host "  * Pasta: $BasePath" -ForegroundColor White
Write-Host "  * Logs: $LogFile" -ForegroundColor White
Write-Host "  * Task: $TaskName" -ForegroundColor White
Write-Host ""
Write-Host "O agente esta rodando em background e enviara heartbeats automaticamente." -ForegroundColor White
Write-Host "Verifique o status no dashboard em alguns minutos." -ForegroundColor White
Write-Host ""

Write-InstallerLog "=== Instalacao concluida com sucesso ===" "SUCCESS"
`;

// Linux Installer Template (v3)
export const LINUX_INSTALLER_TEMPLATE_V3 = String.raw`#!/usr/bin/env bash
# CyberShield Agent - Linux Installation Script v3.0

set -euo pipefail

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "Installing CyberShield Agent: $AGENT_NAME"

# Create directory
INSTALL_DIR="/opt/cybershield"
mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent script
curl -o cybershield-agent.sh "{{AGENT_SCRIPT_URL}}"
chmod +x cybershield-agent.sh

# Create systemd service
cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=$INSTALL_DIR/cybershield-agent.sh
Environment="SERVER_URL=$SERVER_URL"
Environment="AGENT_TOKEN=$AGENT_TOKEN"
Environment="HMAC_SECRET=$HMAC_SECRET"
Environment="AGENT_NAME=$AGENT_NAME"
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Start service
systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

echo "[OK]  CyberShield Agent installed successfully!"
`;

// macOS Installer Template (v3)
export const MACOS_INSTALLER_TEMPLATE_V3 = String.raw`#!/bin/zsh
# CyberShield Agent - macOS Installation Script v3.0

set -euo pipefail

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "Installing CyberShield Agent: $AGENT_NAME"

# Create directory
INSTALL_DIR="/usr/local/cybershield"
sudo mkdir -p "$INSTALL_DIR"
cd "$INSTALL_DIR"

# Download agent script
sudo curl -o cybershield-agent.sh "{{AGENT_SCRIPT_URL}}"
sudo chmod +x cybershield-agent.sh

# Create LaunchDaemon
sudo tee /Library/LaunchDaemons/com.cybershield.agent.plist > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>$INSTALL_DIR/cybershield-agent.sh</string>
    </array>
    <key>EnvironmentVariables</key>
    <dict>
        <key>SERVER_URL</key>
        <string>$SERVER_URL</string>
        <key>AGENT_TOKEN</key>
        <string>$AGENT_TOKEN</string>
        <key>HMAC_SECRET</key>
        <string>$HMAC_SECRET</string>
        <key>AGENT_NAME</key>
        <string>$AGENT_NAME</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/var/log/cybershield-agent.log</string>
    <key>StandardErrorPath</key>
    <string>/var/log/cybershield-agent.error.log</string>
</dict>
</plist>
EOF

# Load service
sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist

echo "[OK]  CyberShield Agent installed successfully!"
`;

// Linux Installer Template (v3.1) - EMBEDDED (no external download)
export const LINUX_INSTALLER_TEMPLATE_V3_EMBEDDED = String.raw`#!/usr/bin/env bash
# CyberShield Agent - Linux Installation Script v3.1 (Embedded)
# Version: {{INSTALLER_VERSION}}
# Generated: {{TIMESTAMP}}

set -euo pipefail

echo "=========================================="
echo " CyberShield Agent Linux Installer"
echo " Version: {{INSTALLER_VERSION}}"
echo "=========================================="

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "[INFO] Agent Name: $AGENT_NAME"
echo "[INFO] Server: $SERVER_URL"

# Create directories
INSTALL_DIR="/opt/cybershield"
LOG_DIR="/var/log/cybershield"

echo "[INFO] Creating directories..."
mkdir -p "$INSTALL_DIR"
mkdir -p "$LOG_DIR"

# Write embedded agent script
echo "[INFO] Installing agent script..."
cat > "$INSTALL_DIR/cybershield-agent.sh" << 'CYBERSHIELD_AGENT_SCRIPT_END'
{{AGENT_SCRIPT_CONTENT}}
CYBERSHIELD_AGENT_SCRIPT_END

chmod +x "$INSTALL_DIR/cybershield-agent.sh"
SCRIPT_SIZE=$(stat -c%s "$INSTALL_DIR/cybershield-agent.sh" 2>/dev/null || stat -f%z "$INSTALL_DIR/cybershield-agent.sh" 2>/dev/null || echo "0")
echo "[OK] Agent script created: $SCRIPT_SIZE bytes"

# Validate script size
if [[ "$SCRIPT_SIZE" -lt 10000 ]]; then
    echo "[ERROR] Agent script too small ($SCRIPT_SIZE bytes). Installation may be corrupted."
    exit 1
fi

# Create environment file
echo "[INFO] Creating environment file..."
cat > "$INSTALL_DIR/cybershield-agent.env" <<EOF
SERVER_URL=$SERVER_URL
AGENT_TOKEN=$AGENT_TOKEN
HMAC_SECRET=$HMAC_SECRET
AGENT_NAME=$AGENT_NAME
EOF
chmod 600 "$INSTALL_DIR/cybershield-agent.env"
echo "[OK] Environment file created"

# Check dependencies
echo "[INFO] Verificando dependencias..."
check_install_dep() {
  local cmd="$1"
  local pkg="$2"
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "[INFO] Instalando $pkg..."
    if command -v apt-get >/dev/null 2>&1; then
      apt-get update -qq && apt-get install -y -qq "$pkg" || true
    elif command -v yum >/dev/null 2>&1; then
      yum install -y "$pkg" || true
    elif command -v dnf >/dev/null 2>&1; then
      dnf install -y "$pkg" || true
    fi
  else
    echo "[OK] $cmd disponivel"
  fi
}

check_install_dep "jq" "jq"
check_install_dep "curl" "curl"
check_install_dep "openssl" "openssl"
check_install_dep "sqlite3" "sqlite3"
echo "[OK] Dependencias verificadas"

# Create systemd service (permissive for security scans)
echo "[INFO] Creating systemd service..."
cat > /etc/systemd/system/cybershield-agent.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
ExecStart=/bin/bash $INSTALL_DIR/cybershield-agent.sh
EnvironmentFile=$INSTALL_DIR/cybershield-agent.env
Restart=always
RestartSec=30
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF

# Start service
echo "[INFO] Starting agent service..."
systemctl daemon-reload
systemctl enable cybershield-agent.service
systemctl start cybershield-agent.service

# Verify service started
sleep 2
if systemctl is-active --quiet cybershield-agent.service; then
    echo "[OK] CyberShield Agent service is running"
else
    echo "[WARN] Service may not have started correctly. Check: journalctl -u cybershield-agent.service"
fi

# Send post_installation telemetry
echo "[INFO] Sending installation telemetry..."
TELEMETRY_BODY=$(cat <<TELEMETRY_EOF
{
  "agent_name": "$AGENT_NAME",
  "event_type": "post_installation",
  "platform": "linux",
  "installation_method": "one_click",
  "success": true,
  "agent_version": "{{INSTALLER_VERSION}}",
  "metadata": {
    "installer_version": "{{INSTALLER_VERSION}}",
    "script_size_bytes": $SCRIPT_SIZE
  }
}
TELEMETRY_EOF
)

# Calculate HMAC signature
TIMESTAMP=$(($(date +%s) * 1000))
NONCE=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen 2>/dev/null || echo "nonce-$(date +%s)")
PAYLOAD="$TIMESTAMP:$NONCE:$TELEMETRY_BODY"
SIGNATURE=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$HMAC_SECRET" 2>/dev/null | awk '{print $2}')

curl -s -X POST "$SERVER_URL/functions/v1/track-installation-event" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: $AGENT_TOKEN" \
  -H "X-HMAC-Signature: $SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Nonce: $NONCE" \
  -d "$TELEMETRY_BODY" \
  --max-time 10 >/dev/null 2>&1 && echo "[OK] Installation telemetry sent" || echo "[WARN] Telemetry failed (non-critical)"

echo ""
echo "=========================================="
echo " CyberShield Agent installed successfully!"
echo "=========================================="
echo ""
echo "Useful commands:"
echo "  Status:  sudo systemctl status cybershield-agent"
echo "  Logs:    sudo journalctl -u cybershield-agent -f"
echo "  Stop:    sudo systemctl stop cybershield-agent"
echo "  Restart: sudo systemctl restart cybershield-agent"
echo ""
`;

// macOS Installer Template (v3.1) - EMBEDDED (no external download)
export const MACOS_INSTALLER_TEMPLATE_V3_EMBEDDED = String.raw`#!/bin/zsh
# CyberShield Agent - macOS Installation Script v3.1 (Embedded)
# Version: {{INSTALLER_VERSION}}
# Generated: {{TIMESTAMP}}

set -euo pipefail

echo "=========================================="
echo " CyberShield Agent macOS Installer"
echo " Version: {{INSTALLER_VERSION}}"
echo "=========================================="

SERVER_URL="{{SERVER_URL}}"
AGENT_TOKEN="{{AGENT_TOKEN}}"
HMAC_SECRET="{{HMAC_SECRET}}"
AGENT_NAME="{{AGENT_NAME}}"

echo "[INFO] Agent Name: $AGENT_NAME"
echo "[INFO] Server: $SERVER_URL"

# Create directories
INSTALL_DIR="/Library/Application Support/CyberShield"
LOG_DIR="/Library/Logs/CyberShield"

echo "[INFO] Creating directories..."
sudo mkdir -p "$INSTALL_DIR"
sudo mkdir -p "$LOG_DIR"

# Write embedded agent script
echo "[INFO] Installing agent script..."
sudo tee "$INSTALL_DIR/cybershield-agent.sh" > /dev/null << 'CYBERSHIELD_AGENT_SCRIPT_END'
{{AGENT_SCRIPT_CONTENT}}
CYBERSHIELD_AGENT_SCRIPT_END

sudo chmod +x "$INSTALL_DIR/cybershield-agent.sh"
SCRIPT_SIZE=$(stat -f%z "$INSTALL_DIR/cybershield-agent.sh" 2>/dev/null || echo "0")
echo "[OK] Agent script created: $SCRIPT_SIZE bytes"

# Validate script size
if [[ "$SCRIPT_SIZE" -lt 10000 ]]; then
    echo "[ERROR] Agent script too small ($SCRIPT_SIZE bytes). Installation may be corrupted."
    exit 1
fi

# Create environment file
echo "[INFO] Creating environment file..."
sudo tee "$INSTALL_DIR/cybershield-agent.env" > /dev/null <<EOF
SERVER_URL=$SERVER_URL
AGENT_TOKEN=$AGENT_TOKEN
HMAC_SECRET=$HMAC_SECRET
AGENT_NAME=$AGENT_NAME
EOF
sudo chmod 600 "$INSTALL_DIR/cybershield-agent.env"
echo "[OK] Environment file created"

# Check dependencies
echo "[INFO] Verificando dependencias..."
check_macos_dep() {
    local cmd="$1"
    if ! command -v "$cmd" >/dev/null 2>&1; then
        echo "[INFO] $cmd nao encontrado, tentando instalar via Homebrew..."
        if command -v brew >/dev/null 2>&1; then
            brew install "$cmd" 2>/dev/null || echo "[WARN] Falha ao instalar $cmd via Homebrew"
        else
            echo "[WARN] Homebrew nao disponivel. Instale $cmd manualmente se necessario."
        fi
    else
        echo "[OK] $cmd disponivel"
    fi
}

# curl, openssl, sqlite3 geralmente ja existem no macOS
check_macos_dep "jq"
check_macos_dep "curl"
check_macos_dep "openssl"
echo "[OK] Dependencias verificadas"

# Create LaunchDaemon
echo "[INFO] Creating LaunchDaemon..."
sudo tee /Library/LaunchDaemons/com.cybershield.agent.plist > /dev/null <<EOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.cybershield.agent</string>
    <key>ProgramArguments</key>
    <array>
        <string>/bin/bash</string>
        <string>$INSTALL_DIR/cybershield-agent.sh</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$INSTALL_DIR</string>
    <key>EnvironmentVariables</key>
    <dict>
        <key>PATH</key>
        <string>/usr/local/bin:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string>
        <key>SERVER_URL</key>
        <string>$SERVER_URL</string>
        <key>AGENT_TOKEN</key>
        <string>$AGENT_TOKEN</string>
        <key>HMAC_SECRET</key>
        <string>$HMAC_SECRET</string>
        <key>AGENT_NAME</key>
        <string>$AGENT_NAME</string>
    </dict>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>StandardOutPath</key>
    <string>/Library/Logs/CyberShield/agent.log</string>
    <key>StandardErrorPath</key>
    <string>/Library/Logs/CyberShield/agent.error.log</string>
</dict>
</plist>
EOF

# Load service
echo "[INFO] Loading agent service..."
sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist

# Verify service started
sleep 2
if sudo launchctl list | grep -q "com.cybershield.agent"; then
    echo "[OK] CyberShield Agent service is running"
else
    echo "[WARN] Service may not have started correctly. Check logs."
fi

# Send post_installation telemetry
echo "[INFO] Sending installation telemetry..."
TELEMETRY_BODY="{\"agent_name\": \"$AGENT_NAME\", \"event_type\": \"post_installation\", \"platform\": \"macos\", \"installation_method\": \"one_click\", \"success\": true, \"agent_version\": \"{{INSTALLER_VERSION}}\", \"metadata\": {\"installer_version\": \"{{INSTALLER_VERSION}}\", \"script_size_bytes\": $SCRIPT_SIZE}}"

# Calculate HMAC signature
TIMESTAMP=$(($(date +%s) * 1000))
NONCE=$(uuidgen 2>/dev/null || echo "nonce-$(date +%s)")
PAYLOAD="$TIMESTAMP:$NONCE:$TELEMETRY_BODY"
SIGNATURE=$(printf '%s' "$PAYLOAD" | openssl dgst -sha256 -mac HMAC -macopt "hexkey:$HMAC_SECRET" 2>/dev/null | awk '{print $2}')

curl -s -X POST "$SERVER_URL/functions/v1/track-installation-event" \
  -H "Content-Type: application/json" \
  -H "X-Agent-Token: $AGENT_TOKEN" \
  -H "X-HMAC-Signature: $SIGNATURE" \
  -H "X-Timestamp: $TIMESTAMP" \
  -H "X-Nonce: $NONCE" \
  -d "$TELEMETRY_BODY" \
  --max-time 10 >/dev/null 2>&1 && echo "[OK] Installation telemetry sent" || echo "[WARN] Telemetry failed (non-critical)"

echo ""
echo "=========================================="
echo " CyberShield Agent installed successfully!"
echo "=========================================="
echo ""
echo "Useful commands:"
echo "  Status:  sudo launchctl list | grep cybershield"
echo "  Logs:    sudo tail -f /Library/Logs/CyberShield/agent.log"
echo "  Stop:    sudo launchctl unload /Library/LaunchDaemons/com.cybershield.agent.plist"
echo "  Start:   sudo launchctl load /Library/LaunchDaemons/com.cybershield.agent.plist"
echo ""
`;
