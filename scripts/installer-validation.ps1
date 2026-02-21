?#Requires -RunAsAdministrator
#Requires -Version 5.1

param(
  [Parameter(Mandatory = $true)]
  [string]$ServerUrl   = "https://iavbnmduxpxhwubqrzzn.supabase.co",
  [Parameter(Mandatory = $true)]
  [string]$AgentToken  = "***REMOVED***",
  [Parameter(Mandatory = $true)]
  [string]$HmacSecret  = "***REMOVED***",
  [Parameter(Mandatory = $true)]
  [string]$AgentName   = "correcao-de-ordem-de-funcao-de-teste-v322"
)

$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

# ============= FASE 2: Logging Habilitado =============

# Agora podemos logar tudo
Write-InstallerLog "=== CyberShield Agent Installer v3.2.2-FUNCTION-ORDER-FIX ===" "INFO"
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

Write-InstallerLog "FASE 1: Cleanup concluido" "SUCCESS"

# ============= FASE 2: Instalacao =============
Write-InstallerLog "FASE 2: Criando script do agente..." "INFO"

$AgentScriptContent = @'

<#
    CyberShield Agent - Windows v3.0.0 (Essencial)
    
    Funcionalidades:
    - HMAC SHA256 com secret em HEX (64 chars -> 32 bytes)
    - Heartbeat periodico
    - Poll de jobs
    - Execucao de jobs
    - Envio de resultado (submit-job-result)
    - Evento de post_installation
    
    Uso:
    powershell.exe -ExecutionPolicy Bypass -File .\cybershield-agent-windows-v3.ps1 `
        -ServerUrl "https://seu-projeto.supabase.co" `
        -AgentToken "AGENT_TOKEN_AQUI" `
        -HmacSecret "64_HEX_CHARS_AQUI" `
        -AgentName "meu-servidor-01"
#>

param(
    [Parameter(Mandatory = $true)]
    [string]$ServerUrl,

    [Parameter(Mandatory = $true)]
    [string]$AgentToken,

    [Parameter(Mandatory = $true)]
    [string]$HmacSecret,

    [Parameter(Mandatory = $false)]
    [string]$AgentName = $env:COMPUTERNAME.ToLower(),

    [Parameter(Mandatory = $false)]
    [string]$AgentVersion = "3.0.0"
)

$ErrorActionPreference = "Stop"

# ============================================
#  TRAP GLOBAL PARA ERROS NAO TRATADOS
# ============================================
trap {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $msg = "FATAL ERROR: $($_.Exception.Message) at line $($_.InvocationInfo.ScriptLineNumber)"
    $stack = $_.ScriptStackTrace

    $logDir = "C:\CyberShield\logs"
    $logPath = Join-Path $logDir "cybershield-agent-v3.log"

    # Log em arquivo se a pasta existir
    if (Test-Path $logDir) {
        try {
            "$ts [FATAL] $msg" | Out-File -FilePath $logPath -Append -Encoding UTF8
            "$ts [FATAL] Stack: $stack" | Out-File -FilePath $logPath -Append -Encoding UTF8
        } catch {
            # se ate gravar log falhar, nao fazer mais nada aqui
        }
    }

    # Fallback para EventLog (source ja registrada pelo instalador)
    Write-EventLog -LogName Application -Source "CyberShield" -EventId 1001 -EntryType Error -Message "$msg`n$stack" -ErrorAction SilentlyContinue

    throw
}

# ============================================
#  VARIAVEIS GLOBAIS
# ============================================
$Global:ServerUrl    = $ServerUrl.TrimEnd('/')
$Global:AgentToken   = $AgentToken
$Global:HmacSecret   = $HmacSecret
$Global:AgentName    = $AgentName
$Global:AgentVersion = $AgentVersion

# Diretorio de log
$logDir = Join-Path -Path $PSScriptRoot -ChildPath "logs"
if (-not (Test-Path $logDir)) {
    New-Item -ItemType Directory -Path $logDir -Force | Out-Null
}
$Global:LogFilePath = Join-Path -Path $logDir -ChildPath "cybershield-agent-v3.log"

# Intervalos
$Global:PollIntervalSeconds = 30

# ============================================
#  LOGGING
# ============================================
function Write-Log {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("DEBUG","INFO","WARN","ERROR","SUCCESS")]
        [string]$Level = "INFO"
    )

    $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    $line = "[{0}] [{1}] {2}" -f $timestamp, $Level, $Message

    Write-Host $line
    
    try {
        Add-Content -Path $Global:LogFilePath -Value $line
    } catch {
        # Ignorar erro de escrita no log para nao quebrar o agente
    }
}

# ============================================
#  HMAC (HEX)
# ============================================
function Convert-HexToBytes {
    param(
        [Parameter(Mandatory = $true)]
        [string]$HexString
    )

    if ($HexString -notmatch '^[0-9a-fA-F]{64}$') {
        Write-Log "HMAC_SECRET invalido. Esperado 64 caracteres hex (32 bytes). Length: $($HexString.Length)" "ERROR"
        throw "Invalid HMAC_SECRET format. Expected 64 hex characters, got: $($HexString.Length)"
    }

    try {
        $bytes = New-Object byte[] 32
        for ($i = 0; $i -lt 64; $i += 2) {
            $bytes[$i / 2] = [Convert]::ToByte($HexString.Substring($i, 2), 16)
        }
        return $bytes
    } catch {
        Write-Log "Falha ao converter HMAC_SECRET de HEX para bytes: $($_.Exception.Message)" "ERROR"
        throw "HMAC_SECRET conversion failed: $($_.Exception.Message)"
    }
}

function Get-HmacSignature {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Message,
        
        [Parameter(Mandatory = $true)]
        [string]$SecretHex
    )

    $keyBytes = Convert-HexToBytes $SecretHex

    $hmac = New-Object System.Security.Cryptography.HMACSHA256
    $hmac.Key = $keyBytes

    $messageBytes   = [Text.Encoding]::UTF8.GetBytes($Message)
    $signatureBytes = $hmac.ComputeHash($messageBytes)

    return ([System.BitConverter]::ToString($signatureBytes) -replace '-', '').ToLower()
}

# ============================================
#  REQUISICAO SEGURA COM HMAC
# ============================================
function Invoke-SecureRequest {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Path,

        [Parameter()]
        [ValidateSet("GET","POST","PUT","DELETE")]
        [string]$Method = "GET",

        [Parameter()]
        [object]$Body = $null,

        [Parameter()]
        [int]$TimeoutSec = 30,

        [Parameter()]
        [int]$MaxRetries = 3
    )

    $uri        = "$($Global:ServerUrl)$Path"
    $retryCount = 0
    $retryDelay = 2

    while ($true) {
        try {
            $timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            $nonce     = [guid]::NewGuid().ToString()

            if ($Body -ne $null) {
                if ($Body -is [string]) {
                    $bodyJson = $Body
                } elseif ($Body -is [hashtable] -or $Body.GetType().Name -like 'PSCustomObject') {
                    $bodyJson = $Body | ConvertTo-Json -Compress -Depth 10
                } else {
                    $bodyJson = ""
                }
            } else {
                $bodyJson = ""
            }

            $payload   = "$timestamp:$nonce:$bodyJson"
            $signature = Get-HmacSignature -Message $payload -SecretHex $Global:HmacSecret

            $headers = @{
                "X-Agent-Token"    = $Global:AgentToken
                "X-HMAC-Signature" = $signature
                "X-Timestamp"      = $timestamp
                "X-Nonce"          = $nonce
                "Content-Type"     = "application/json"
            }

            $params = @{
                Uri         = $uri
                Method      = $Method
                Headers     = $headers
                TimeoutSec  = $TimeoutSec
                ErrorAction = "Stop"
            }

            if ($bodyJson -ne "") {
                $params.Body = $bodyJson
            }

            Write-Log "DEBUG: $Method $uri (body_length=$($bodyJson.Length))" "DEBUG"

            $response = Invoke-WebRequest @params -UseBasicParsing
            $status   = [int]$response.StatusCode

            Write-Log "DEBUG: Resposta $status de $uri" "DEBUG"

            return [pscustomobject]@{
                Success    = $true
                StatusCode = $status
                Body       = $response.Content
            }
        }
        catch {
            $retryCount++

            $statusCode = $null
            if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
                $statusCode = $_.Exception.Response.StatusCode.value__
            }

            Write-Log "Erro na requisicao $Method $uri (tentativa $retryCount/$MaxRetries): $($_.Exception.Message)" "ERROR"

            if ($statusCode -eq 401) {
                Write-Log "[ERROR] Erro de autenticacao (401). Verifique AgentToken / HmacSecret / clock." "ERROR"
                throw
            }

            if ($retryCount -ge $MaxRetries) {
                Write-Log "[ERROR] Falha definitiva apos $MaxRetries tentativas em $uri" "ERROR"
                throw
            }

            Write-Log "WARN: Aguardando $retryDelay segundos para tentar de novo..." "WARN"
            Start-Sleep -Seconds $retryDelay
            $retryDelay *= 2
        }
    }
}

# ============================================
#  INFO DO SISTEMA
# ============================================
function Get-SystemInfo {
    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $cs = Get-CimInstance Win32_ComputerSystem

        return @{
            os_type      = "Windows"
            os_name      = $os.Caption
            os_version   = $os.Version
            build_number = $os.BuildNumber
            hostname     = $env:COMPUTERNAME
            domain       = $cs.Domain
            total_ram_gb = [Math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
            agent_name   = $Global:AgentName
            agent_version = $Global:AgentVersion
        }
    } catch {
        Write-Log "Erro ao coletar informacoes do sistema: $($_.Exception.Message)" "WARN"
        return @{
            os_type      = "Windows"
            hostname     = $env:COMPUTERNAME
            agent_name   = $Global:AgentName
            agent_version = $Global:AgentVersion
        }
    }
}

# ============================================
#  POST INSTALLATION
# ============================================
function Send-PostInstallationEvent {
    param(
        [bool]$Success = $true,
        [string]$ErrorMessage = "",
        [int]$InstallationTimeSeconds = 0
    )

    $sys = Get-SystemInfo

    # PowerShell 5.1 compatibility: calculate event_type outside hashtable
    $eventType = if ($Success) { 
        "post_installation" 
    } else { 
        "post_installation_unverified" 
    }

    $body = @{
        agent_name                = $Global:AgentName
        event_type                = $eventType
        platform                  = "windows"
        installation_method       = "one_click"
        success                   = $Success
        installation_time_seconds = $InstallationTimeSeconds
        error_message             = $ErrorMessage
        agent_version             = $Global:AgentVersion
        network_connectivity      = $true
        metadata                  = $sys
    }

    Write-Log "Enviando post_installation..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/track-installation-event" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 20

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] post_installation registrado com sucesso" "SUCCESS"
        } else {
            Write-Log "[WARN] Falha ao registrar post_installation (Status=$($result.StatusCode))" "WARN"
        }
    } catch {
        Write-Log "[WARN] Erro ao enviar post_installation: $($_.Exception.Message)" "WARN"
    }
}

# ============================================
#  HEARTBEAT
# ============================================
function Send-Heartbeat {
    $sys = Get-SystemInfo

    $body = @{
        agent_name    = $Global:AgentName
        platform      = "windows"
        os_name       = $sys.os_name
        os_version    = $sys.os_version
        hostname      = $sys.hostname
        agent_version = $Global:AgentVersion
    }

    Write-Log "Enviando heartbeat..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/heartbeat" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 15

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] Heartbeat OK (200)" "SUCCESS"
        } else {
            Write-Log "[ERROR] Heartbeat falhou (Status=$($result.StatusCode))" "ERROR"
        }
    } catch {
        Write-Log "[ERROR] Erro ao enviar heartbeat: $($_.Exception.Message)" "ERROR"
    }
}

# ============================================
#  SUBMIT JOB RESULT
# ============================================
function Submit-JobResult {
    param(
        [Parameter(Mandatory = $true)]
        [string]$JobId,
        
        [Parameter(Mandatory = $true)]
        [ValidateSet("completed","failed")]
        [string]$Status,
        
        [Parameter(Mandatory = $false)]
        [hashtable]$Output = @{},
        
        [Parameter(Mandatory = $false)]
        [string]$ErrorMessage = "",
        
        [Parameter(Mandatory = $false)]
        [int]$ExecutionTimeSeconds = 0,
        
        [Parameter(Mandatory = $false)]
        [string]$StartedAt = ""
    )

    $body = @{
        job_id                 = $JobId
        agent_name             = $Global:AgentName
        status                 = $Status
        output                 = $Output
        error_message          = $ErrorMessage
        execution_time_seconds = $ExecutionTimeSeconds
        started_at             = $StartedAt
        finished_at            = (Get-Date).ToUniversalTime().ToString("o")
    }

    Write-Log "Enviando resultado do job $JobId (status=$Status, started_at=$StartedAt)..." "INFO"
    
    # Log detalhado do payload para debug
    $bodyJson = $body | ConvertTo-Json -Depth 10 -Compress
    Write-Log "Payload: $bodyJson" "DEBUG"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-job-result" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] Resultado do job $JobId enviado com sucesso" "SUCCESS"
            return $true
        } else {
            Write-Log "[ERROR] Falha ao enviar resultado (Status=$($result.StatusCode))" "ERROR"
            Write-Log "Response body: $($result.Body)" "ERROR"
            return $false
        }
    } catch {
        Write-Log "[ERROR] Erro ao enviar resultado do job ${JobId}: $($_.Exception.Message)" "ERROR"
        Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
        return $false
    }
}

# ============================================
#  EXECUCAO DE JOB
# ============================================
function Execute-Job {
    param(
        [Parameter(Mandatory = $true)]
        $Job
    )

    $jobId   = $Job.id
    $jobType = $Job.type
    $payload = $Job.payload

    $startTime = Get-Date

    Write-Log "[JOB] Executando job $jobId (type=$jobType)" "INFO"

    try {
        $output = @{}

        switch ($jobType) {
            "integration_test" {
                $sys = Get-SystemInfo
                
                $output = @{
                    message   = "Integration test executed successfully"
                    timestamp = (Get-Date).ToUniversalTime().ToString("o")
                    agent     = $Global:AgentName
                    version   = $Global:AgentVersion
                    system    = $sys
                }
            }
            "collect_info" {
                $sys = Get-SystemInfo
                $output = $sys
            }
            "scan" {
                try {
                    Write-Log "[SCAN] Job type 'scan' recebido" "INFO"

                    # Payload esperado: { "filePath": "C:\path\file.exe", "tenantId": "uuid" }
                    $filePath = $payload.filePath
                    $tenantId = $payload.tenantId

                    if (-not $filePath) {
                        throw "Payload invalido: 'filePath' nao informado"
                    }

                    if (-not (Test-Path $filePath)) {
                        throw "Arquivo nao encontrado: $filePath"
                    }

                    # Calcular SHA256
                    $fileHash = (Get-FileHash -Path $filePath -Algorithm SHA256).Hash.ToLower()
                    Write-Log "[SCAN] Escaneando: $filePath (hash: $fileHash)" "INFO"

                    # Monta body para backend (NAO converte pra JSON aqui)
                    $scanBody = @{
                        tenant_id  = $tenantId
                        agent_name = $Global:AgentName
                        file_path  = $filePath
                        file_hash  = $fileHash
                    }

                    # Chama backend scan-virus
                    $scanResult = Invoke-SecureRequest `
                        -Uri "$ServerUrl/functions/v1/scan-virus" `
                        -Method POST `
                        -Body $scanBody `
                        -TimeoutSec 60

                    if (-not $scanResult.Success) {
                        throw "Falha ao chamar scan-virus: HTTP $($scanResult.StatusCode)"
                    }

                    $scanData = $scanResult.Body | ConvertFrom-Json

                    # Monta output base
                    $output = @{
                        filePath    = $filePath
                        fileHash    = $fileHash
                        isMalicious = $scanData.isMalicious
                        positives   = $scanData.positives
                        totalScans  = $scanData.totalScans
                        permalink   = $scanData.permalink
                        scannerUsed = $scanData.scannerUsed
                        fromCache   = $scanData.fromCache
                        quarantined = $false
                    }

                    # QUARENTENA FISICA (necessaria pois backend nao tem acesso ao filesystem)
                    if ($scanData.isMalicious) {
                        Write-Log "[WARN] MALWARE DETECTADO: $($scanData.positives)/$($scanData.totalScans) engines" "WARN"
                        
                        $quarantineRoot = "C:CyberShieldQuarantine"
                        if (-not (Test-Path $quarantineRoot)) {
                            New-Item -ItemType Directory -Path $quarantineRoot -Force | Out-Null
                        }

                        $fileName = [System.IO.Path]::GetFileName($filePath)
                        $guid = [guid]::NewGuid().ToString()
                        $quarantinePath = Join-Path $quarantineRoot "$guid`_$fileName"

                        Move-Item -Path $filePath -Destination $quarantinePath -Force
                        Write-Log "[SUCCESS] Arquivo movido para quarentena: $quarantinePath" "SUCCESS"

                        $output.quarantined = $true
                        $output.quarantinePath = $quarantinePath
                    } else {
                        Write-Log "[SUCCESS] Arquivo limpo" "SUCCESS"
                    }

                    $result.success = $true
                    $result.output = $output | ConvertTo-Json
                }
                catch {
                    $err = $_.Exception.Message
                    Write-Log "[ERROR] Erro ao processar job 'scan': $err" "ERROR"
                    $result.success = $false
                    $result.error = $err
                }
            }
            "update_agent" {
                try {
                    Write-Log "[INFO] Job 'update_agent' recebido" "INFO"

                    # Chama serve-agent-update
                    $updateResult = Invoke-SecureRequest `
                        -Uri "$ServerUrl/functions/v1/serve-agent-update" `
                        -Method GET `
                        -TimeoutSec 60

                    if (-not $updateResult.Success) {
                        throw "Falha ao buscar update: HTTP $($updateResult.StatusCode)"
                    }

                    $data = $updateResult.Body | ConvertFrom-Json

                    # Ja esta na ultima versao?
                    if ($data.message -eq "Already up to date") {
                        Write-Log "[INFO] Agente ja esta na ultima versao ($($data.current_version))" "INFO"
                        $result.success = $true
                        $result.output  = ($data | ConvertTo-Json -Depth 5)
                        break
                    }

                    $newVersion   = $data.version
                    $scriptText   = $data.script_content
                    $expectedHash = $data.sha256

                    Write-Log "[UPDATE] Atualizando agente para versao $newVersion" "INFO"

                    # Usa o proprio script atual, sem hardcode de caminho
                    $currentScript = $PSCommandPath
                    $backupScript  = $currentScript -replace '.ps1$', "-backup-$(Get-Date -Format 'yyyyMMdd_HHmmss').ps1"
                    $tempScript    = Join-Path $env:TEMP "cybershield-agent-update-$newVersion.ps1"

                    # Salvar script novo
                    Set-Content -Path $tempScript -Value $scriptText -Encoding UTF8

                    # Validar SHA256
                    $actualHash = (Get-FileHash -Path $tempScript -Algorithm SHA256).Hash.ToLower()
                    if ($actualHash -ne $expectedHash.ToLower()) {
                        Remove-Item $tempScript -Force
                        throw "SHA256 mismatch! Esperado: $expectedHash, Obtido: $actualHash"
                    }

                    Write-Log "[SUCCESS] SHA256 validado: $actualHash" "SUCCESS"

                    # Backup do script atual
                    Copy-Item -Path $currentScript -Destination $backupScript -Force
                    Write-Log "[BACKUP] Backup criado em: $backupScript" "INFO"

                    # Trocar script
                    Copy-Item -Path $tempScript -Destination $currentScript -Force
                    Remove-Item $tempScript -Force

                    Write-Log "[SUCCESS] Script atualizado para $newVersion" "SUCCESS"

                    # Reiniciar task
                    Stop-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 2
                    Start-ScheduledTask -TaskName "CyberShield Agent"

                    $output = @{
                        message     = "Agent updated successfully"
                        newVersion  = $newVersion
                        sha256      = $actualHash
                        restartedAt = (Get-Date).ToUniversalTime().ToString("o")
                    }

                    $result.success = $true
                    $result.output  = $output | ConvertTo-Json -Depth 5
                    break
                }
                catch {
                    $err = $_.Exception.Message
                    Write-Log "[ERROR] Erro no auto-update: $err" "ERROR"
                    $result.success = $false
                    $result.error   = $err
                    break
                }
            }
            
            default {
                throw "Tipo de job nao suportado: $jobType"
            }
        }

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds
        $startTimeISO = $startTime.ToUniversalTime().ToString("o")

        Submit-JobResult `
            -JobId $jobId `
            -Status "completed" `
            -Output $output `
            -ExecutionTimeSeconds $execTime `
            -StartedAt $startTimeISO
    }
    catch {
        $err = "Erro ao executar job $jobId`: $($_.Exception.Message)"
        Write-Log $err "ERROR"

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds
        $startTimeISO = $startTime.ToUniversalTime().ToString("o")

        Submit-JobResult `
            -JobId $jobId `
            -Status "failed" `
            -ErrorMessage $err `
            -ExecutionTimeSeconds $execTime `
            -StartedAt $startTimeISO
    }
}

# ============================================
#  POLL DE JOBS
# ============================================
function Poll-Jobs {
    $body = @{
        agent_name    = $Global:AgentName
        agent_version = $Global:AgentVersion
    }

    Write-Log "Consultando jobs..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/poll-jobs" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 20

        if (-not $result.Success -or $result.StatusCode -ne 200) {
            Write-Log "[ERROR] poll-jobs falhou (Status=$($result.StatusCode))" "ERROR"
            return
        }

        if ([string]::IsNullOrWhiteSpace($result.Body)) {
            Write-Log "[WARN] Resposta de poll-jobs vazia" "WARN"
            return
        }

        $jobs = $result.Body | ConvertFrom-Json

        if ($null -eq $jobs -or $jobs.Count -eq 0) {
            Write-Log "[POLL] Nenhum job disponivel" "INFO"
            return
        }

        Write-Log "[JOBS] Recebidos $($jobs.Count) job(s)" "INFO"

        foreach ($job in $jobs) {
            Execute-Job -Job $job
        }
    } catch {
        Write-Log "[ERROR] Erro no poll-jobs: $($_.Exception.Message)" "ERROR"
    }
}

# ============================================
#  LOOP PRINCIPAL
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] Iniciando CyberShield Agent - Windows v$Global:AgentVersion" "INFO"
Write-Log "[INFO] ServerUrl: $Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: $Global:AgentName" "DEBUG"
Write-Log "============================================" "INFO"

try {
    $bootstrapStart = Get-Date

    # 1) Enviar evento de post_installation
    Send-PostInstallationEvent -Success $true -InstallationTimeSeconds 0

    # 2) Primeiro heartbeat
    Send-Heartbeat

    $bootstrapElapsed = [int]((Get-Date) - $bootstrapStart).TotalSeconds
    Write-Log "[SUCCESS] Bootstrap concluido em ${bootstrapElapsed}s" "SUCCESS"

    Write-Log "[INFO] Entrando no loop principal (intervalo=$($Global:PollIntervalSeconds)s)" "INFO"

    $lastHeartbeat = Get-Date
    $lastPoll      = Get-Date

    while ($true) {
        $now = Get-Date

        try {
            # Heartbeat a cada intervalo
            if ((($now - $lastHeartbeat).TotalSeconds) -ge $Global:PollIntervalSeconds) {
                Send-Heartbeat
                $lastHeartbeat = Get-Date
            }

            # Poll de jobs a cada intervalo
            if ((($now - $lastPoll).TotalSeconds) -ge $Global:PollIntervalSeconds) {
                Poll-Jobs
                $lastPoll = Get-Date
            }
        } catch {
            Write-Log "[ERROR] Erro no loop principal: $($_.Exception.Message)" "ERROR"
        }

        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Log "[FATAL] Erro fatal no agente: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    exit 1
}

'@

$AgentScriptPath = Join-Path $BasePath "cybershield-agent-$AgentName.ps1"

# Salvar script do agente em UTF-8 SEM BOM (compativel com PowerShell 5.1 e Task Scheduler)
Write-InstallerLog "Salvando script do agente em UTF-8 sem BOM..." "INFO"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($AgentScriptPath, $AgentScriptContent, $utf8NoBom)

Write-InstallerLog "Script criado: $AgentScriptPath ($(([System.IO.FileInfo]$AgentScriptPath).Length) bytes)" "SUCCESS"

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

# Testar escrita no log do agente antes de criar a scheduled task
$AgentLogPath = Join-Path $LogsPath "cybershield-agent-v3.log"

try {
    $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $line = "$ts [INFO] Agent log criado pelo instalador"
    Add-Content -Path $AgentLogPath -Value $line -Encoding UTF8
    Write-InstallerLog "Teste de escrita no log do agente ok: $AgentLogPath" "SUCCESS"
} catch {
    Write-InstallerLog "ERRO CRITICO: nao foi possivel escrever no log do agente: $($_.Exception.Message)" "ERROR"
    throw "Instalacao abortada: sem permissao para criar logs do agente em $AgentLogPath"
}

# ============= FASE 4: Scheduled Task =============
Write-InstallerLog "FASE 4: Criando Scheduled Task..." "INFO"

$TaskName = "CyberShieldAgent-$AgentName"

# Construir argumentos em uma linha (sem continuacao)
$ArgumentString = "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$AgentScriptPath\`" -ServerUrl \`"$ServerUrl\`" -AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -AgentName \`"$AgentName\`""

Write-InstallerLog "Task arguments: $ArgumentString" "DEBUG"

$Action = New-ScheduledTaskAction -Execute "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe" -Argument $ArgumentString
$Trigger = New-ScheduledTaskTrigger -AtStartup
$Principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$Settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartInterval (New-TimeSpan -Minutes 1) -RestartCount 3

Register-ScheduledTask -TaskName $TaskName -Action $Action -Trigger $Trigger -Principal $Principal -Settings $Settings -Force | Out-Null

Write-InstallerLog "Scheduled Task criada: $TaskName" "SUCCESS"

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
    Write-InstallerLog "  1. Verificar log do agente: C:\\CyberShield\\logs\\cybershield-agent-v3.log" "INFO"
    Write-InstallerLog "  2. Executar manualmente: C:\\CyberShield\\cybershield-agent-$AgentName.ps1" "INFO"
    Write-InstallerLog "  3. Verificar Event Viewer: Logs de Aplicativo" "INFO"
}

# Verificar se o agente conseguiu iniciar (log criado)
Start-Sleep -Seconds 10

$agentLogPath = Join-Path $LogsPath "cybershield-agent-v3.log"
if (Test-Path $agentLogPath) {
    $logSize = (Get-Item $agentLogPath).Length
    Write-InstallerLog "[OK]  Log do agente detectado: $agentLogPath ($logSize bytes)" "SUCCESS"
} else {
    Write-InstallerLog "[WARN] AVISO: Log do agente nao encontrado apos 10s" "WARN"
    Write-InstallerLog "Path esperado: $agentLogPath" "INFO"
    Write-InstallerLog "Verifique se a Scheduled Task esta executando corretamente" "WARN"
}

Write-InstallerLog "FASE 5: Agente iniciado" "SUCCESS"

# ============= FASE 6: Telemetria =============
Write-InstallerLog "FASE 6: Enviando telemetria de instalacao..." "INFO"

try {
    $telemetryUrl = "$ServerUrl/functions/v1/track-installation-event"
    $telemetryBody = @{
        agent_name = $AgentName
        event_type = "post_installation"
        platform = "windows"
        success = $true
        metadata = @{
            installer_version = "3.1.0-HARDENED"
            powershell_version = $PSVersionTable.PSVersion.ToString()
            os_version = [System.Environment]::OSVersion.Version.ToString()
        }
    } | ConvertTo-Json -Depth 5
    
    $headers = @{
        "Content-Type" = "application/json"
        "apikey" = "***REMOVED***"
    }
    
    Write-InstallerLog "Enviando telemetria para: $telemetryUrl" "DEBUG"
    
    $response = Invoke-WebRequest -Uri $telemetryUrl -Method POST -Body $telemetryBody -Headers $headers -UseBasicParsing -TimeoutSec 10 -ErrorAction Stop
    
    Write-InstallerLog "Telemetria enviada com sucesso (HTTP $($response.StatusCode))" "SUCCESS"
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
        Write-InstallerLog "Erro de autenticacao. Verifique se o apikey esta correto." "WARN"
    } elseif ($statusCode -eq 500) {
        Write-InstallerLog "Erro no servidor backend. Verifique logs do Edge Function." "WARN"
    } elseif ($statusCode -eq 404) {
        Write-InstallerLog "Endpoint de telemetria nao encontrado. Verifique URL do servidor." "WARN"
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

