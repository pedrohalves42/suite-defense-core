/**
 * CyberShield Agent Windows Script - AUTO-GERADO
 * NAO EDITAR MANUALMENTE.
 * Fonte: public/agent-scripts/cybershield-agent-windows-v3.ps1
 */

export const AGENT_SCRIPT_WINDOWS_CONTENT = `
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
    powershell.exe -ExecutionPolicy Bypass -File .\\cybershield-agent-windows-v3.ps1 \`
        -ServerUrl "https://seu-projeto.supabase.co" \`
        -AgentToken "AGENT_TOKEN_AQUI" \`
        -HmacSecret "64_HEX_CHARS_AQUI" \`
        -AgentName "meu-servidor-01"
#>

param(
    [Parameter(Mandatory = \$true)]
    [string]\$ServerUrl,

    [Parameter(Mandatory = \$true)]
    [string]\$AgentToken,

    [Parameter(Mandatory = \$true)]
    [string]\$HmacSecret,

    [Parameter(Mandatory = \$false)]
    [string]\$AgentName = \$env:COMPUTERNAME.ToLower(),

    [Parameter(Mandatory = \$false)]
    [string]\$AgentVersion = "3.0.0"
)

# ============================================
#  TRAP GLOBAL PARA ERROS NAO TRATADOS
# ============================================
trap {
    \$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    \$msg = "FATAL ERROR: \$(\$_.Exception.Message) at line \$(\$_.InvocationInfo.ScriptLineNumber)"
    \$stack = \$_.ScriptStackTrace

    \$logDir = "C:\\CyberShield\\logs"
    \$logPath = Join-Path \$logDir "cybershield-agent-v3.log"

    # Log em arquivo se a pasta existir
    if (Test-Path \$logDir) {
        try {
            "\$ts [FATAL] \$msg" | Out-File -FilePath \$logPath -Append -Encoding UTF8
            "\$ts [FATAL] Stack: \$stack" | Out-File -FilePath \$logPath -Append -Encoding UTF8
        } catch {
            # se ate gravar log falhar, nao fazer mais nada aqui
        }
    }

    # Fallback para EventLog (source ja registrada pelo instalador)
    Write-EventLog -LogName Application -Source "CyberShield" -EventId 1001 -EntryType Error -Message "\$msg\`n\$stack" -ErrorAction SilentlyContinue

    throw
}

# ============================================
#  STARTUP LOG (ANTES DE TUDO)
# ============================================
try {
    \$logDir = "C:\\CyberShield\\logs"
    if (-not (Test-Path \$logDir)) {
        New-Item -ItemType Directory -Path \$logDir -Force | Out-Null
    }
    \$startupLog = Join-Path -Path \$logDir -ChildPath "cybershield-agent-v3.log"
    Add-Content -Path \$startupLog -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [STARTUP] Agent iniciado com parametros: AgentName=\$AgentName, ServerUrl=\$ServerUrl"
} catch {
    # Fallback para Event Log se arquivo falhar
    Write-EventLog -LogName Application -Source "CyberShield" -EventId 1000 -EntryType Error -Message "Failed to create log file: \$_" -ErrorAction SilentlyContinue
}

\$ErrorActionPreference = "Stop"

# ============================================
#  VALIDACAO DE PARAMETROS
# ============================================
\$logDir = "C:\\CyberShield\\logs"
if (-not (Test-Path \$logDir)) {
    New-Item -ItemType Directory -Path \$logDir -Force | Out-Null
}
\$Global:LogFilePath = Join-Path -Path \$logDir -ChildPath "cybershield-agent-v3.log"

# Log startup info
Add-Content -Path \$Global:LogFilePath -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] === CyberShield Agent v3.0.0 ===" -ErrorAction SilentlyContinue
Add-Content -Path \$Global:LogFilePath -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] ServerUrl: \$ServerUrl" -ErrorAction SilentlyContinue
Add-Content -Path \$Global:LogFilePath -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] AgentToken: \$(\$AgentToken.Substring(0,8))..." -ErrorAction SilentlyContinue
Add-Content -Path \$Global:LogFilePath -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] HmacSecret: \$(\$HmacSecret.Substring(0,8))..." -ErrorAction SilentlyContinue
Add-Content -Path \$Global:LogFilePath -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [INFO] AgentName: \$AgentName" -ErrorAction SilentlyContinue

if ([string]::IsNullOrWhiteSpace(\$ServerUrl)) {
    Add-Content -Path \$Global:LogFilePath -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [FATAL] ERRO: ServerUrl vazio" -ErrorAction SilentlyContinue
    throw "ServerUrl parameter is required"
}

if ([string]::IsNullOrWhiteSpace(\$AgentToken)) {
    Add-Content -Path \$Global:LogFilePath -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [FATAL] ERRO: AgentToken vazio" -ErrorAction SilentlyContinue
    throw "AgentToken parameter is required"
}

if ([string]::IsNullOrWhiteSpace(\$HmacSecret)) {
    Add-Content -Path \$Global:LogFilePath -Value "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] [FATAL] ERRO: HmacSecret vazio" -ErrorAction SilentlyContinue
    throw "HmacSecret parameter is required"
}

# ============================================
#  VARIAVEIS GLOBAIS
# ============================================
\$Global:ServerUrl    = \$ServerUrl.TrimEnd('/')
\$Global:AgentToken   = \$AgentToken
\$Global:HmacSecret   = \$HmacSecret
\$Global:AgentName    = \$AgentName
\$Global:AgentVersion = \$AgentVersion

# Intervalos
\$Global:PollIntervalSeconds = 30

# ============================================
#  LOGGING
# ============================================
function Write-Log {
    param(
        [Parameter(Mandatory = \$true)]
        [string]\$Message,
        
        [Parameter(Mandatory = \$false)]
        [ValidateSet("DEBUG","INFO","WARN","ERROR","SUCCESS","FATAL")]
        [string]\$Level = "INFO"
    )

    \$timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss")
    \$line = "[{0}] [{1}] {2}" -f \$timestamp, \$Level, \$Message

    Write-Host \$line
    
    try {
        Add-Content -Path \$Global:LogFilePath -Value \$line -ErrorAction Stop
    } catch {
        # Fallback: Event Log do Windows
        try {
            \$eventId = if (\$Level -eq "ERROR") { 
                1002 
            } elseif (\$Level -eq "FATAL") { 
                1003 
            } elseif (\$Level -eq "WARN") { 
                1004 
            } else { 
                1005 
            }
            Write-EventLog -LogName Application -Source "CyberShield" -EventId \$eventId -EntryType Warning -Message \$line -ErrorAction SilentlyContinue
        } catch {
            # Ignorar se Event Log tambem falhar (script continua)
        }
    }
}

# ============================================
#  HMAC (HEX)
# ============================================
function Convert-HexToBytes {
    param(
        [Parameter(Mandatory = \$true)]
        [string]\$HexString
    )

    if (\$HexString -notmatch '^[0-9a-fA-F]{64}\$') {
        Write-Log "HMAC_SECRET invalido. Esperado 64 caracteres hex (32 bytes). Length: \$(\$HexString.Length)" "ERROR"
        throw "Invalid HMAC_SECRET format. Expected 64 hex characters, got: \$(\$HexString.Length)"
    }

    try {
        \$bytes = New-Object byte[] 32
        for (\$i = 0; \$i -lt 64; \$i += 2) {
            \$bytes[\$i / 2] = [Convert]::ToByte(\$HexString.Substring(\$i, 2), 16)
        }
        return \$bytes
    } catch {
        Write-Log "Falha ao converter HMAC_SECRET de HEX para bytes: \$(\$_.Exception.Message)" "ERROR"
        throw "HMAC_SECRET conversion failed: \$(\$_.Exception.Message)"
    }
}

function Get-HmacSignature {
    param(
        [Parameter(Mandatory = \$true)]
        [string]\$Message,
        
        [Parameter(Mandatory = \$true)]
        [string]\$SecretHex
    )

    \$keyBytes = Convert-HexToBytes \$SecretHex

    \$hmac = New-Object System.Security.Cryptography.HMACSHA256
    \$hmac.Key = \$keyBytes

    \$messageBytes   = [Text.Encoding]::UTF8.GetBytes(\$Message)
    \$signatureBytes = \$hmac.ComputeHash(\$messageBytes)

    return ([System.BitConverter]::ToString(\$signatureBytes) -replace '-', '').ToLower()
}

# ============================================
#  REQUISICAO SEGURA COM HMAC
# ============================================
function Invoke-SecureRequest {
    param(
        [Parameter(Mandatory = \$true)]
        [string]\$Path,

        [Parameter()]
        [ValidateSet("GET","POST","PUT","DELETE")]
        [string]\$Method = "GET",

        [Parameter()]
        [object]\$Body = \$null,

        [Parameter()]
        [int]\$TimeoutSec = 30,

        [Parameter()]
        [int]\$MaxRetries = 3
    )

    \$uri        = "\$(\$Global:ServerUrl)\$Path"
    \$retryCount = 0
    \$retryDelay = 2

    while (\$true) {
        try {
            \$timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            \$nonce     = [guid]::NewGuid().ToString()

            if (\$Body -ne \$null) {
                if (\$Body -is [string]) {
                    \$bodyJson = \$Body
                } elseif (\$Body -is [hashtable] -or \$Body.GetType().Name -like 'PSCustomObject') {
                    \$bodyJson = \$Body | ConvertTo-Json -Compress -Depth 10
                } else {
                    \$bodyJson = ""
                }
            } else {
                \$bodyJson = ""
            }

            \$payload   = "\$timestamp:\$nonce:\$bodyJson"
            \$signature = Get-HmacSignature -Message \$payload -SecretHex \$Global:HmacSecret

            \$headers = @{
                "X-Agent-Token"    = \$Global:AgentToken
                "X-HMAC-Signature" = \$signature
                "X-Timestamp"      = \$timestamp
                "X-Nonce"          = \$nonce
                "Content-Type"     = "application/json"
            }

            \$params = @{
                Uri         = \$uri
                Method      = \$Method
                Headers     = \$headers
                TimeoutSec  = \$TimeoutSec
                ErrorAction = "Stop"
            }

            if (\$bodyJson -ne "") {
                \$params.Body = \$bodyJson
            }

            Write-Log "DEBUG: \$Method \$uri (body_length=\$(\$bodyJson.Length))" "DEBUG"

            \$response = Invoke-WebRequest @params -UseBasicParsing
            \$status   = [int]\$response.StatusCode

            Write-Log "DEBUG: Resposta \$status de \$uri" "DEBUG"

            return [pscustomobject]@{
                Success    = \$true
                StatusCode = \$status
                Body       = \$response.Content
            }
        }
        catch {
            \$retryCount++

            \$statusCode = \$null
            if (\$_.Exception.Response -and \$_.Exception.Response.StatusCode) {
                \$statusCode = \$_.Exception.Response.StatusCode.value__
            }

            Write-Log "Erro na requisicao \$Method \$uri (tentativa \$retryCount/\$MaxRetries): \$(\$_.Exception.Message)" "ERROR"

            if (\$statusCode -eq 401) {
                Write-Log "[ERROR] Erro de autenticacao (401). Verifique AgentToken / HmacSecret / clock." "ERROR"
                throw
            }

            if (\$retryCount -ge \$MaxRetries) {
                Write-Log "[ERROR] Falha definitiva apos \$MaxRetries tentativas em \$uri" "ERROR"
                throw
            }

            Write-Log "WARN: Aguardando \$retryDelay segundos para tentar de novo..." "WARN"
            Start-Sleep -Seconds \$retryDelay
            \$retryDelay *= 2
        }
    }
}

# ============================================
#  INFO DO SISTEMA
# ============================================
function Get-SystemInfo {
    try {
        \$os = Get-CimInstance Win32_OperatingSystem
        \$cs = Get-CimInstance Win32_ComputerSystem

        return @{
            os_type      = "Windows"
            os_name      = \$os.Caption
            os_version   = \$os.Version
            build_number = \$os.BuildNumber
            hostname     = \$env:COMPUTERNAME
            domain       = \$cs.Domain
            total_ram_gb = [Math]::Round(\$cs.TotalPhysicalMemory / 1GB, 2)
            agent_name   = \$Global:AgentName
            agent_version = \$Global:AgentVersion
        }
    } catch {
        Write-Log "Erro ao coletar informacoes do sistema: \$(\$_.Exception.Message)" "WARN"
        return @{
            os_type      = "Windows"
            hostname     = \$env:COMPUTERNAME
            agent_name   = \$Global:AgentName
            agent_version = \$Global:AgentVersion
        }
    }
}

# ============================================
#  POST INSTALLATION
# ============================================
function Send-PostInstallationEvent {
    param(
        [bool]\$Success = \$true,
        [string]\$ErrorMessage = "",
        [int]\$InstallationTimeSeconds = 0
    )

    \$sys = Get-SystemInfo

    # PowerShell 5.1 compatibility: calculate event_type outside hashtable
    \$eventType = if (\$Success) { 
        "post_installation" 
    } else { 
        "post_installation_unverified" 
    }

    \$body = @{
        agent_name                = \$Global:AgentName
        event_type                = \$eventType
        platform                  = "windows"
        installation_method       = "one_click"
        success                   = \$Success
        installation_time_seconds = \$InstallationTimeSeconds
        error_message             = \$ErrorMessage
        agent_version             = \$Global:AgentVersion
        network_connectivity      = \$true
        metadata                  = \$sys
    }

    Write-Log "Enviando post_installation..." "INFO"

    try {
        \$result = Invoke-SecureRequest \`
            -Path "/functions/v1/track-installation-event" \`
            -Method "POST" \`
            -Body \$body \`
            -TimeoutSec 20

        if (\$result.Success -and \$result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] post_installation registrado com sucesso" "SUCCESS"
        } else {
            Write-Log "[WARN] Falha ao registrar post_installation (Status=\$(\$result.StatusCode))" "WARN"
        }
    } catch {
        Write-Log "[WARN] Erro ao enviar post_installation: \$(\$_.Exception.Message)" "WARN"
    }
}

# ============================================
#  HEARTBEAT
# ============================================
function Send-Heartbeat {
    \$sys = Get-SystemInfo

    \$body = @{
        agent_name    = \$Global:AgentName
        platform      = "windows"
        os_name       = \$sys.os_name
        os_version    = \$sys.os_version
        hostname      = \$sys.hostname
        agent_version = \$Global:AgentVersion
    }

    Write-Log "Enviando heartbeat..." "INFO"

    try {
        \$result = Invoke-SecureRequest \`
            -Path "/functions/v1/heartbeat" \`
            -Method "POST" \`
            -Body \$body \`
            -TimeoutSec 15

        if (\$result.Success -and \$result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] Heartbeat OK (200)" "SUCCESS"
        } else {
            Write-Log "[ERROR] Heartbeat falhou (Status=\$(\$result.StatusCode))" "ERROR"
        }
    } catch {
        Write-Log "[ERROR] Erro ao enviar heartbeat: \$(\$_.Exception.Message)" "ERROR"
    }
}

# ============================================
#  SUBMIT JOB RESULT
# ============================================
function Submit-JobResult {
    param(
        [Parameter(Mandatory = \$true)]
        [string]\$JobId,
        
        [Parameter(Mandatory = \$true)]
        [ValidateSet("completed","failed")]
        [string]\$Status,
        
        [Parameter(Mandatory = \$false)]
        [hashtable]\$Output = @{},
        
        [Parameter(Mandatory = \$false)]
        [string]\$ErrorMessage = "",
        
        [Parameter(Mandatory = \$false)]
        [int]\$ExecutionTimeSeconds = 0,
        
        [Parameter(Mandatory = \$false)]
        [string]\$StartedAt = ""
    )

    \$body = @{
        job_id                 = \$JobId
        agent_name             = \$Global:AgentName
        status                 = \$Status
        output                 = \$Output
        error_message          = \$ErrorMessage
        execution_time_seconds = \$ExecutionTimeSeconds
        started_at             = \$StartedAt
        finished_at            = (Get-Date).ToUniversalTime().ToString("o")
    }

    Write-Log "Enviando resultado do job \$JobId (status=\$Status, started_at=\$StartedAt)..." "INFO"
    
    # Log detalhado do payload para debug
    \$bodyJson = \$body | ConvertTo-Json -Depth 10 -Compress
    Write-Log "Payload: \$bodyJson" "DEBUG"

    try {
        \$result = Invoke-SecureRequest \`
            -Path "/functions/v1/submit-job-result" \`
            -Method "POST" \`
            -Body \$body \`
            -TimeoutSec 30

        if (\$result.Success -and \$result.StatusCode -eq 200) {
            Write-Log "[SUCCESS] Resultado do job \$JobId enviado com sucesso" "SUCCESS"
            return \$true
        } else {
            Write-Log "[ERROR] Falha ao enviar resultado (Status=\$(\$result.StatusCode))" "ERROR"
            Write-Log "Response body: \$(\$result.Body)" "ERROR"
            return \$false
        }
    } catch {
        Write-Log "[ERROR] Erro ao enviar resultado do job \${JobId}: \$(\$_.Exception.Message)" "ERROR"
        Write-Log "Stack trace: \$(\$_.ScriptStackTrace)" "ERROR"
        return \$false
    }
}

# ============================================
#  EXECUCAO DE JOB
# ============================================
function Execute-Job {
    param(
        [Parameter(Mandatory = \$true)]
        \$Job
    )

    \$jobId   = \$Job.id
    \$jobType = \$Job.type
    \$payload = \$Job.payload

    \$startTime = Get-Date

    Write-Log "[JOB] Executando job \$jobId (type=\$jobType)" "INFO"

    try {
        \$output = @{}

        switch (\$jobType) {
            "integration_test" {
                \$sys = Get-SystemInfo
                
                \$output = @{
                    message   = "Integration test executed successfully"
                    timestamp = (Get-Date).ToUniversalTime().ToString("o")
                    agent     = \$Global:AgentName
                    version   = \$Global:AgentVersion
                    system    = \$sys
                }
            }
            "collect_info" {
                \$sys = Get-SystemInfo
                \$output = \$sys
            }
            "scan" {
                try {
                    Write-Log "[SCAN] Job type 'scan' recebido" "INFO"

                    # Payload esperado: { "filePath": "C:\\\\path\\\\file.exe", "tenantId": "uuid" }
                    \$filePath = \$payload.filePath
                    \$tenantId = \$payload.tenantId

                    if (-not \$filePath) {
                        throw "Payload invalido: 'filePath' nao informado"
                    }

                    if (-not (Test-Path \$filePath)) {
                        throw "Arquivo nao encontrado: \$filePath"
                    }

                    # Calcular SHA256
                    \$fileHash = (Get-FileHash -Path \$filePath -Algorithm SHA256).Hash.ToLower()
                    Write-Log "[SCAN] Escaneando: \$filePath (hash: \$fileHash)" "INFO"

                    # Monta body para backend (NAO converte pra JSON aqui)
                    \$scanBody = @{
                        tenant_id  = \$tenantId
                        agent_name = \$Global:AgentName
                        file_path  = \$filePath
                        file_hash  = \$fileHash
                    }

                    # Chama backend scan-virus
                    \$scanResult = Invoke-SecureRequest \`
                        -Uri "\$ServerUrl/functions/v1/scan-virus" \`
                        -Method POST \`
                        -Body \$scanBody \`
                        -TimeoutSec 60

                    if (-not \$scanResult.Success) {
                        throw "Falha ao chamar scan-virus: HTTP \$(\$scanResult.StatusCode)"
                    }

                    \$scanData = \$scanResult.Body | ConvertFrom-Json

                    # Monta output base
                    \$output = @{
                        filePath    = \$filePath
                        fileHash    = \$fileHash
                        isMalicious = \$scanData.isMalicious
                        positives   = \$scanData.positives
                        totalScans  = \$scanData.totalScans
                        permalink   = \$scanData.permalink
                        scannerUsed = \$scanData.scannerUsed
                        fromCache   = \$scanData.fromCache
                        quarantined = \$false
                    }

                    # QUARENTENA FISICA (necessaria pois backend nao tem acesso ao filesystem)
                    if (\$scanData.isMalicious) {
                        Write-Log "[WARN] MALWARE DETECTADO: \$(\$scanData.positives)/\$(\$scanData.totalScans) engines" "WARN"
                        
                        \$quarantineRoot = "C:\\CyberShield\\Quarantine"
                        if (-not (Test-Path \$quarantineRoot)) {
                            New-Item -ItemType Directory -Path \$quarantineRoot -Force | Out-Null
                        }

                        \$fileName = [System.IO.Path]::GetFileName(\$filePath)
                        \$guid = [guid]::NewGuid().ToString()
                        \$quarantinePath = Join-Path \$quarantineRoot "\$guid\`_\$fileName"

                        Move-Item -Path \$filePath -Destination \$quarantinePath -Force
                        Write-Log "[SUCCESS] Arquivo movido para quarentena: \$quarantinePath" "SUCCESS"

                        \$output.quarantined = \$true
                        \$output.quarantinePath = \$quarantinePath
                    } else {
                        Write-Log "[SUCCESS] Arquivo limpo" "SUCCESS"
                    }

                    \$result.success = \$true
                    \$result.output = \$output | ConvertTo-Json
                }
                catch {
                    \$err = \$_.Exception.Message
                    Write-Log "[ERROR] Erro ao processar job 'scan': \$err" "ERROR"
                    \$result.success = \$false
                    \$result.error = \$err
                }
            }
            "update_agent" {
                try {
                    Write-Log "[INFO] Job 'update_agent' recebido" "INFO"

                    # Chama serve-agent-update
                    \$updateResult = Invoke-SecureRequest \`
                        -Uri "\$ServerUrl/functions/v1/serve-agent-update" \`
                        -Method GET \`
                        -TimeoutSec 60

                    if (-not \$updateResult.Success) {
                        throw "Falha ao buscar update: HTTP \$(\$updateResult.StatusCode)"
                    }

                    \$data = \$updateResult.Body | ConvertFrom-Json

                    # Ja esta na ultima versao?
                    if (\$data.message -eq "Already up to date") {
                        Write-Log "[INFO] Agente ja esta na ultima versao (\$(\$data.current_version))" "INFO"
                        \$result.success = \$true
                        \$result.output  = (\$data | ConvertTo-Json -Depth 5)
                        break
                    }

                    \$newVersion   = \$data.version
                    \$scriptText   = \$data.script_content
                    \$expectedHash = \$data.sha256

                    Write-Log "[UPDATE] Atualizando agente para versao \$newVersion" "INFO"

                    # Usa o proprio script atual, sem hardcode de caminho
                    \$currentScript = \$PSCommandPath
                    \$backupScript  = \$currentScript -replace '\\.ps1\$', "-backup-\$(Get-Date -Format 'yyyyMMdd_HHmmss').ps1"
                    \$tempScript    = Join-Path \$env:TEMP "cybershield-agent-update-\$newVersion.ps1"

                    # Salvar script novo
                    Set-Content -Path \$tempScript -Value \$scriptText -Encoding UTF8

                    # Validar SHA256
                    \$actualHash = (Get-FileHash -Path \$tempScript -Algorithm SHA256).Hash.ToLower()
                    if (\$actualHash -ne \$expectedHash.ToLower()) {
                        Remove-Item \$tempScript -Force
                        throw "SHA256 mismatch! Esperado: \$expectedHash, Obtido: \$actualHash"
                    }

                    Write-Log "[SUCCESS] SHA256 validado: \$actualHash" "SUCCESS"

                    # Backup do script atual
                    Copy-Item -Path \$currentScript -Destination \$backupScript -Force
                    Write-Log "[BACKUP] Backup criado em: \$backupScript" "INFO"

                    # Trocar script
                    Copy-Item -Path \$tempScript -Destination \$currentScript -Force
                    Remove-Item \$tempScript -Force

                    Write-Log "[SUCCESS] Script atualizado para \$newVersion" "SUCCESS"

                    # Reiniciar task
                    Stop-ScheduledTask -TaskName "CyberShield Agent" -ErrorAction SilentlyContinue
                    Start-Sleep -Seconds 2
                    Start-ScheduledTask -TaskName "CyberShield Agent"

                    \$output = @{
                        message     = "Agent updated successfully"
                        newVersion  = \$newVersion
                        sha256      = \$actualHash
                        restartedAt = (Get-Date).ToUniversalTime().ToString("o")
                    }

                    \$result.success = \$true
                    \$result.output  = \$output | ConvertTo-Json -Depth 5
                    break
                }
                catch {
                    \$err = \$_.Exception.Message
                    Write-Log "[ERROR] Erro no auto-update: \$err" "ERROR"
                    \$result.success = \$false
                    \$result.error   = \$err
                    break
                }
            }
            
            default {
                throw "Tipo de job nao suportado: \$jobType"
            }
        }

        \$execTime = [int]((Get-Date) - \$startTime).TotalSeconds
        \$startTimeISO = \$startTime.ToUniversalTime().ToString("o")

        Submit-JobResult \`
            -JobId \$jobId \`
            -Status "completed" \`
            -Output \$output \`
            -ExecutionTimeSeconds \$execTime \`
            -StartedAt \$startTimeISO
    }
    catch {
        \$err = "Erro ao executar job \$jobId\`: \$(\$_.Exception.Message)"
        Write-Log \$err "ERROR"

        \$execTime = [int]((Get-Date) - \$startTime).TotalSeconds
        \$startTimeISO = \$startTime.ToUniversalTime().ToString("o")

        Submit-JobResult \`
            -JobId \$jobId \`
            -Status "failed" \`
            -ErrorMessage \$err \`
            -ExecutionTimeSeconds \$execTime \`
            -StartedAt \$startTimeISO
    }
}

# ============================================
#  POLL DE JOBS
# ============================================
function Poll-Jobs {
    \$body = @{
        agent_name    = \$Global:AgentName
        agent_version = \$Global:AgentVersion
    }

    Write-Log "Consultando jobs..." "INFO"

    try {
        \$result = Invoke-SecureRequest \`
            -Path "/functions/v1/poll-jobs" \`
            -Method "POST" \`
            -Body \$body \`
            -TimeoutSec 20

        if (-not \$result.Success -or \$result.StatusCode -ne 200) {
            Write-Log "[ERROR] poll-jobs falhou (Status=\$(\$result.StatusCode))" "ERROR"
            return
        }

        if ([string]::IsNullOrWhiteSpace(\$result.Body)) {
            Write-Log "[WARN] Resposta de poll-jobs vazia" "WARN"
            return
        }

        \$jobs = \$result.Body | ConvertFrom-Json

        if (\$null -eq \$jobs -or \$jobs.Count -eq 0) {
            Write-Log "[POLL] Nenhum job disponivel" "INFO"
            return
        }

        Write-Log "[JOBS] Recebidos \$(\$jobs.Count) job(s)" "INFO"

        foreach (\$job in \$jobs) {
            Execute-Job -Job \$job
        }
    } catch {
        Write-Log "[ERROR] Erro no poll-jobs: \$(\$_.Exception.Message)" "ERROR"
    }
}

# ============================================
#  LOOP PRINCIPAL
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] Iniciando CyberShield Agent - Windows v\$Global:AgentVersion" "INFO"
Write-Log "[INFO] ServerUrl: \$Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: \$Global:AgentName" "DEBUG"
Write-Log "============================================" "INFO"

try {
    \$bootstrapStart = Get-Date

    # 1) Enviar evento de post_installation
    Send-PostInstallationEvent -Success \$true -InstallationTimeSeconds 0

    # 2) Primeiro heartbeat
    Send-Heartbeat

    \$bootstrapElapsed = [int]((Get-Date) - \$bootstrapStart).TotalSeconds
    Write-Log "[SUCCESS] Bootstrap concluido em \${bootstrapElapsed}s" "SUCCESS"

    Write-Log "[INFO] Entrando no loop principal (intervalo=\$(\$Global:PollIntervalSeconds)s)" "INFO"

    \$lastHeartbeat = Get-Date
    \$lastPoll      = Get-Date

    while (\$true) {
        \$now = Get-Date

        try {
            # Heartbeat a cada intervalo
            if (((\$now - \$lastHeartbeat).TotalSeconds) -ge \$Global:PollIntervalSeconds) {
                Send-Heartbeat
                \$lastHeartbeat = Get-Date
            }

            # Poll de jobs a cada intervalo
            if (((\$now - \$lastPoll).TotalSeconds) -ge \$Global:PollIntervalSeconds) {
                Poll-Jobs
                \$lastPoll = Get-Date
            }
        } catch {
            Write-Log "[ERROR] Erro no loop principal: \$(\$_.Exception.Message)" "ERROR"
        }

        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Log "[FATAL] Erro fatal no agente: \$(\$_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: \$(\$_.ScriptStackTrace)" "ERROR"
    exit 1
}
`;

export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_CONTENT;
}
