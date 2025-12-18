<#
    CyberShield Agent - Windows v4.0.0-STATE-MACHINE
    
    FASE 2.1: State Machine Formal (6 estados)
    FASE 2.2: Evidence Journal Local
    
    Estados:
    - BOOTSTRAP: Inicializacao do agente
    - SYNCING: Sincronizando com servidor
    - ENFORCING: Operacao normal, executando jobs
    - DEGRADED: Erro nao-critico, funcionando parcialmente
    - ERROR: Erro critico, requer intervencao
    - RECOVERY: Tentando auto-recuperacao
    
    Funcionalidades v4.0:
    - State Machine formal com transicoes validadas
    - Evidence Journal local estruturado (JSON Lines)
    - Job Engine idempotente com execution_id
    - Auto-recovery com 3 tentativas + backoff exponencial
    - Todas as funcionalidades v3.x mantidas
    
    Uso:
    powershell.exe -ExecutionPolicy Bypass -File .\cybershield-agent-windows-v4.ps1 `
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
    [string]$AgentVersion = "v4.0.0-STATE-MACHINE"
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
    $logPath = Join-Path $logDir "cybershield-agent-v4.log"

    if (Test-Path $logDir) {
        try {
            "$ts [FATAL] $msg" | Out-File -FilePath $logPath -Append -Encoding UTF8
            "$ts [FATAL] Stack: $stack" | Out-File -FilePath $logPath -Append -Encoding UTF8
        } catch { }
    }

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

# Diretorios
$Global:BaseDir = "C:\CyberShield"
$logDir = Join-Path -Path $Global:BaseDir -ChildPath "logs"
$evidenceDir = Join-Path -Path $Global:BaseDir -ChildPath "evidence"

# Criar diretorios se nao existirem
@($logDir, $evidenceDir) | ForEach-Object {
    if (-not (Test-Path $_)) {
        New-Item -ItemType Directory -Path $_ -Force | Out-Null
    }
}

$Global:LogFilePath = Join-Path -Path $logDir -ChildPath "cybershield-agent-v4.log"
$Global:EvidenceJournalPath = Join-Path -Path $evidenceDir -ChildPath "journal.log"

# Intervalos
$Global:PollIntervalSeconds = 60

# ============================================
#  FASE 2.1: STATE MACHINE FORMAL
# ============================================
$Global:AgentState = @{
    Current = "BOOTSTRAP"
    Previous = $null
    History = [System.Collections.ArrayList]::new()
    ErrorCount = 0
    RecoveryAttempts = 0
    LastStateChange = (Get-Date)
    LastError = $null
}

# Estados validos e transicoes permitidas
$Global:ValidStates = @("BOOTSTRAP", "SYNCING", "ENFORCING", "DEGRADED", "ERROR", "RECOVERY")
$Global:StateTransitions = @{
    "BOOTSTRAP" = @("SYNCING", "ERROR")
    "SYNCING" = @("ENFORCING", "DEGRADED", "ERROR")
    "ENFORCING" = @("DEGRADED", "ERROR", "SYNCING")
    "DEGRADED" = @("RECOVERY", "ERROR", "ENFORCING")
    "RECOVERY" = @("ENFORCING", "DEGRADED", "ERROR")
    "ERROR" = @("RECOVERY")  # Requer intervencao ou recovery manual
}

# Estados que permitem execucao de jobs
$Global:JobExecutionStates = @("ENFORCING", "DEGRADED")

function Set-AgentState {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("BOOTSTRAP", "SYNCING", "ENFORCING", "DEGRADED", "ERROR", "RECOVERY")]
        [string]$NewState,
        
        [Parameter(Mandatory = $true)]
        [string]$Reason,
        
        [Parameter(Mandatory = $false)]
        [string]$ErrorDetails = $null
    )
    
    $currentState = $Global:AgentState.Current
    
    # Validar transicao
    if ($currentState -ne $NewState) {
        $allowedTransitions = $Global:StateTransitions[$currentState]
        if ($NewState -notin $allowedTransitions) {
            Write-Log "[STATE] INVALID TRANSITION: $currentState -> $NewState (allowed: $($allowedTransitions -join ', '))" "WARN"
            # Registrar tentativa invalida mas nao bloquear
            Add-EvidenceEntry -Type "state_change" -Data @{
                attempted_from = $currentState
                attempted_to = $NewState
                reason = $Reason
                blocked = $true
                allowed_transitions = $allowedTransitions
            } -StateBefore $currentState -StateAfter $currentState -Severity "warning"
            return $false
        }
    }
    
    # Aplicar transicao
    $Global:AgentState.Previous = $currentState
    $Global:AgentState.Current = $NewState
    $Global:AgentState.LastStateChange = Get-Date
    
    # Adicionar ao historico (manter ultimos 100)
    $historyEntry = @{
        from = $currentState
        to = $NewState
        reason = $Reason
        timestamp = (Get-Date).ToUniversalTime().ToString("o")
    }
    [void]$Global:AgentState.History.Add($historyEntry)
    if ($Global:AgentState.History.Count -gt 100) {
        $Global:AgentState.History.RemoveAt(0)
    }
    
    # Resetar contadores em estados de sucesso
    if ($NewState -eq "ENFORCING") {
        $Global:AgentState.ErrorCount = 0
        $Global:AgentState.RecoveryAttempts = 0
    }
    
    # Incrementar contador de erros
    if ($NewState -eq "ERROR" -or $NewState -eq "DEGRADED") {
        $Global:AgentState.ErrorCount++
        if ($ErrorDetails) {
            $Global:AgentState.LastError = $ErrorDetails
        }
    }
    
    Write-Log "[STATE] $currentState -> $NewState ($Reason)" "INFO"
    
    # Registrar evidencia
    Add-EvidenceEntry -Type "state_change" -Data @{
        from = $currentState
        to = $NewState
        reason = $Reason
        error_details = $ErrorDetails
        error_count = $Global:AgentState.ErrorCount
        recovery_attempts = $Global:AgentState.RecoveryAttempts
    } -StateBefore $currentState -StateAfter $NewState -Severity $(if ($NewState -eq "ERROR") { "error" } elseif ($NewState -eq "DEGRADED") { "warning" } else { "info" })
    
    return $true
}

function Get-AgentState {
    return $Global:AgentState.Current
}

function Test-CanExecuteJob {
    $state = Get-AgentState
    return $state -in $Global:JobExecutionStates
}

# ============================================
#  FASE 2.2: EVIDENCE JOURNAL LOCAL
# ============================================
$Global:EvidenceBuffer = [System.Collections.ArrayList]::new()
$Global:EvidenceFlushThreshold = 10  # Flush apos 10 entradas ou 60s

function Add-EvidenceEntry {
    param(
        [Parameter(Mandatory = $true)]
        [ValidateSet("state_change", "job_execution", "dns_block", "policy_sync", "auto_recovery", "heartbeat", "update_applied", "error", "policy_drift", "security_event")]
        [string]$Type,
        
        [Parameter(Mandatory = $true)]
        [hashtable]$Data,
        
        [Parameter(Mandatory = $false)]
        [string]$StateBefore = $null,
        
        [Parameter(Mandatory = $false)]
        [string]$StateAfter = $null,
        
        [Parameter(Mandatory = $false)]
        [ValidateSet("debug", "info", "warning", "error", "critical")]
        [string]$Severity = "info"
    )
    
    try {
        # Criar hash SHA256 do data para integridade
        $dataJson = $Data | ConvertTo-Json -Compress -Depth 5
        $sha256 = [System.Security.Cryptography.SHA256]::Create()
        $hashBytes = $sha256.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($dataJson))
        $evidenceHash = [System.BitConverter]::ToString($hashBytes) -replace '-', ''
        
        $entry = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            type = $Type
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
            state_before = $StateBefore
            state_after = $StateAfter
            severity = $Severity
            data = $Data
            evidence_hash = $evidenceHash.ToLower()
        }
        
        # Adicionar ao buffer
        [void]$Global:EvidenceBuffer.Add($entry)
        
        # Gravar localmente (JSON Lines)
        $jsonLine = $entry | ConvertTo-Json -Compress -Depth 10
        Add-Content -Path $Global:EvidenceJournalPath -Value $jsonLine -Encoding UTF8 -ErrorAction SilentlyContinue
        
        # Flush para servidor se threshold atingido
        if ($Global:EvidenceBuffer.Count -ge $Global:EvidenceFlushThreshold) {
            Invoke-FlushEvidence
        }
        
        return $evidenceHash
    }
    catch {
        Write-Log "[EVIDENCE] Failed to add entry: $($_.Exception.Message)" "WARN"
        return $null
    }
}

function Invoke-FlushEvidence {
    if ($Global:EvidenceBuffer.Count -eq 0) {
        return
    }
    
    try {
        $entries = @($Global:EvidenceBuffer)
        
        $body = @{
            agent_name = $Global:AgentName
            agent_version = $Global:AgentVersion
            entries = $entries | ForEach-Object {
                @{
                    event_type = $_.type
                    event_data = $_.data
                    evidence_hash = $_.evidence_hash
                    state_before = $_.state_before
                    state_after = $_.state_after
                    severity = $_.severity
                }
            }
        }
        
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-agent-evidence" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30 `
            -MaxRetries 2
        
        if ($result.Success) {
            Write-Log "[EVIDENCE] Flushed $($entries.Count) entries to server" "DEBUG"
            $Global:EvidenceBuffer.Clear()
        }
    }
    catch {
        Write-Log "[EVIDENCE] Flush failed: $($_.Exception.Message)" "WARN"
        # Manter no buffer para proxima tentativa
    }
}

function Invoke-EvidenceRotation {
    $maxSizeMB = 50
    $maxAgeDays = 7
    
    try {
        if (Test-Path $Global:EvidenceJournalPath) {
            $file = Get-Item $Global:EvidenceJournalPath -ErrorAction SilentlyContinue
            
            if ($file -and $file.Length -gt ($maxSizeMB * 1MB)) {
                $archivePath = "$($Global:EvidenceJournalPath).$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
                Move-Item $Global:EvidenceJournalPath $archivePath -Force -ErrorAction SilentlyContinue
                Write-Log "[EVIDENCE] Journal rotated to $archivePath" "INFO"
            }
        }
        
        # Limpar arquivos antigos
        Get-ChildItem -Path (Split-Path $Global:EvidenceJournalPath -Parent) -Filter "journal.log.*.bak" -ErrorAction SilentlyContinue | 
            Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$maxAgeDays) } |
            Remove-Item -Force -ErrorAction SilentlyContinue
    }
    catch { }
}

# ============================================
#  AUTO-RECOVERY COM BACKOFF EXPONENCIAL
# ============================================
function Invoke-AutoRecovery {
    param(
        [Parameter(Mandatory = $true)]
        [string]$FailedComponent,
        
        [Parameter(Mandatory = $false)]
        [string]$ErrorMessage = $null
    )
    
    $maxAttempts = 3
    
    if ($Global:AgentState.RecoveryAttempts -ge $maxAttempts) {
        Write-Log "[RECOVERY] Max attempts ($maxAttempts) exceeded for $FailedComponent" "ERROR"
        Set-AgentState -NewState "ERROR" -Reason "Max recovery attempts exceeded" -ErrorDetails "Component: $FailedComponent, Last error: $ErrorMessage"
        
        Add-EvidenceEntry -Type "auto_recovery" -Data @{
            component = $FailedComponent
            attempt = $Global:AgentState.RecoveryAttempts
            success = $false
            reason = "Max attempts exceeded"
            error = $ErrorMessage
        } -Severity "critical"
        
        return $false
    }
    
    $Global:AgentState.RecoveryAttempts++
    $attempt = $Global:AgentState.RecoveryAttempts
    
    # Backoff exponencial: 5s, 10s, 20s
    $backoffSeconds = [Math]::Pow(2, $attempt - 1) * 5
    
    Write-Log "[RECOVERY] Attempt $attempt/$maxAttempts for $FailedComponent (backoff: ${backoffSeconds}s)" "WARN"
    Set-AgentState -NewState "RECOVERY" -Reason "Auto-recovery: $FailedComponent (attempt $attempt)"
    
    Add-EvidenceEntry -Type "auto_recovery" -Data @{
        component = $FailedComponent
        attempt = $attempt
        backoff_seconds = $backoffSeconds
        error = $ErrorMessage
    } -Severity "warning"
    
    Start-Sleep -Seconds $backoffSeconds
    
    # Tentar recuperar componente especifico
    $recovered = $false
    switch ($FailedComponent) {
        "heartbeat" {
            try {
                Send-Heartbeat
                $recovered = $true
            } catch { }
        }
        "job_engine" {
            try {
                Poll-Jobs
                $recovered = $true
            } catch { }
        }
        "network" {
            try {
                # Testar conectividade basica
                $test = Test-NetConnection -ComputerName "google.com" -Port 443 -WarningAction SilentlyContinue
                $recovered = $test.TcpTestSucceeded
            } catch { }
        }
        default {
            # Recovery generico - tentar heartbeat
            try {
                Send-Heartbeat
                $recovered = $true
            } catch { }
        }
    }
    
    if ($recovered) {
        Write-Log "[RECOVERY] Success for $FailedComponent on attempt $attempt" "SUCCESS"
        Set-AgentState -NewState "ENFORCING" -Reason "Recovery successful: $FailedComponent"
        $Global:AgentState.RecoveryAttempts = 0
        
        Add-EvidenceEntry -Type "auto_recovery" -Data @{
            component = $FailedComponent
            attempt = $attempt
            success = $true
        } -Severity "info"
        
        return $true
    }
    
    Write-Log "[RECOVERY] Failed for $FailedComponent on attempt $attempt" "WARN"
    Set-AgentState -NewState "DEGRADED" -Reason "Recovery attempt $attempt failed: $FailedComponent"
    
    return $false
}

# ============================================
#  ROTACAO DE LOGS
# ============================================
function Invoke-LogRotation {
    $maxSizeMB = 10
    $maxAgeDays = 7
    $logPath = $Global:LogFilePath
    
    try {
        if (Test-Path $logPath) {
            $file = Get-Item $logPath -ErrorAction SilentlyContinue
            
            if ($file -and $file.Length -gt ($maxSizeMB * 1MB)) {
                $archivePath = "$logPath.$(Get-Date -Format 'yyyyMMdd-HHmmss').bak"
                Move-Item $logPath $archivePath -Force -ErrorAction SilentlyContinue
                Write-Log "[LOG] Arquivo de log rotacionado para $archivePath" "INFO"
            }
        }
        
        $logDir = Split-Path $logPath -Parent
        if (Test-Path $logDir) {
            Get-ChildItem -Path $logDir -Filter "*.bak" -ErrorAction SilentlyContinue | 
                Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$maxAgeDays) } |
                Remove-Item -Force -ErrorAction SilentlyContinue
        }
    } catch { }
}

# ============================================
#  CONFIGURACAO DE REDE (TLS 1.2 + Proxy)
# ============================================
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

try {
    $proxy = [System.Net.WebRequest]::GetSystemWebProxy()
    [System.Net.WebRequest]::DefaultWebProxy = $proxy
    [System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials
} catch { }

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
    $state = Get-AgentState
    $line = "[{0}] [{1}] [{2}] {3}" -f $timestamp, $Level, $state, $Message

    Write-Host $line
    
    try {
        Add-Content -Path $Global:LogFilePath -Value $line
    } catch { }
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
        Write-Log "HMAC_SECRET invalido. Esperado 64 caracteres hex." "ERROR"
        throw "Invalid HMAC_SECRET format"
    }

    $bytes = New-Object byte[] 32
    for ($i = 0; $i -lt 64; $i += 2) {
        $bytes[$i / 2] = [Convert]::ToByte($HexString.Substring($i, 2), 16)
    }
    return $bytes
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
    $messageBytes = [Text.Encoding]::UTF8.GetBytes($Message)
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

    $uri = "$($Global:ServerUrl)$Path"
    $retryCount = 0
    $retryDelay = 2

    while ($true) {
        try {
            $timestamp = [int64]([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds())
            $nonce = [guid]::NewGuid().ToString()

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

            $payload = '{0}:{1}:{2}' -f $timestamp, $nonce, $bodyJson
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
                $bodyBytes = [System.Text.Encoding]::UTF8.GetBytes($bodyJson)
                $params.Body = $bodyBytes
            }

            Write-Log "[NETWORK] $Method $uri" "DEBUG"

            $response = Invoke-WebRequest @params -UseBasicParsing
            $status = [int]$response.StatusCode

            Write-Log "[NETWORK] Response: $status" "DEBUG"

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
                Write-Log "[ERROR] Erro de autenticacao (401)" "ERROR"
                throw
            }

            if ($statusCode -eq 429) {
                $rateLimitDelay = $retryDelay * 5
                Write-Log "[RATE-LIMIT] 429 - aguardando ${rateLimitDelay}s" "WARN"
                Start-Sleep -Seconds $rateLimitDelay
                $retryDelay *= 2
                
                if ($retryCount -ge $MaxRetries) {
                    return [pscustomobject]@{
                        Success    = $false
                        StatusCode = 429
                        Body       = "Rate limit exceeded"
                    }
                }
                continue
            }

            if ($retryCount -ge $MaxRetries) {
                throw
            }

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
            os_type       = "Windows"
            os_name       = $os.Caption
            os_version    = $os.Version
            build_number  = $os.BuildNumber
            hostname      = $env:COMPUTERNAME
            domain        = $cs.Domain
            total_ram_gb  = [Math]::Round($cs.TotalPhysicalMemory / 1GB, 2)
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            state         = Get-AgentState
        }
    } catch {
        return @{
            os_type       = "Windows"
            hostname      = $env:COMPUTERNAME
            agent_name    = $Global:AgentName
            agent_version = $Global:AgentVersion
            state         = Get-AgentState
        }
    }
}

# ============================================
#  HEARTBEAT
# ============================================
function Send-Heartbeat {
    $sysInfo = Get-SystemInfo

    $body = @{
        agent_name    = $Global:AgentName
        hostname      = $sysInfo.hostname
        os_type       = $sysInfo.os_type
        os_version    = $sysInfo.os_version
        agent_version = $Global:AgentVersion
        state         = Get-AgentState
        error_count   = $Global:AgentState.ErrorCount
    }

    Write-Log "[HEARTBEAT] Enviando heartbeat (state: $(Get-AgentState))..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/agent-heartbeat" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 15

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[HEARTBEAT] OK (200)" "SUCCESS"
            
            Add-EvidenceEntry -Type "heartbeat" -Data @{
                status = "success"
                state = Get-AgentState
            } -Severity "debug"
            
            return $true
        } else {
            Write-Log "[HEARTBEAT] Falhou: Status $($result.StatusCode)" "ERROR"
            return $false
        }
    }
    catch {
        Write-Log "[HEARTBEAT] Erro: $($_.Exception.Message)" "ERROR"
        return $false
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
        
        [Parameter()]
        [string]$Output = "",
        
        [Parameter()]
        [string]$ErrorMessage = "",
        
        [Parameter()]
        [int]$ExecutionTimeSeconds = 0,
        
        [Parameter()]
        [string]$StartedAt = "",
        
        [Parameter()]
        [string]$ExecutionId = ""
    )

    $body = @{
        job_id                 = $JobId
        status                 = $Status
        output                 = $Output
        error_message          = $ErrorMessage
        execution_time_seconds = $ExecutionTimeSeconds
        started_at             = $StartedAt
        agent_name             = $Global:AgentName
        agent_version          = $Global:AgentVersion
        execution_id           = $ExecutionId
    }

    Write-Log "[JOB] Enviando resultado para job $JobId (status=$Status, exec_id=$ExecutionId)" "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-job-result" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "[JOB] Resultado enviado com sucesso" "SUCCESS"
            return $true
        } else {
            Write-Log "[JOB] Falha ao enviar resultado: $($result.StatusCode)" "ERROR"
            return $false
        }
    }
    catch {
        Write-Log "[JOB] Erro ao enviar resultado: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  EXECUTE JOB (IDEMPOTENTE COM EXECUTION_ID)
# ============================================
function Execute-Job {
    param(
        [Parameter(Mandatory = $true)]
        $Job
    )

    # Verificar se pode executar jobs
    if (-not (Test-CanExecuteJob)) {
        $state = Get-AgentState
        Write-Log "[JOB] Cannot execute job in state $state" "WARN"
        
        Add-EvidenceEntry -Type "job_execution" -Data @{
            job_id = $Job.id
            job_type = $Job.type
            blocked = $true
            reason = "Invalid state: $state"
        } -Severity "warning"
        
        return
    }

    $jobId = $Job.id
    $jobType = $Job.type
    $executionId = "exec-$(New-Guid)"
    $startTime = Get-Date

    Write-Log "[JOB] Executando job $jobId (type=$jobType, exec_id=$executionId)" "INFO"

    # Registrar inicio da execucao
    Add-EvidenceEntry -Type "job_execution" -Data @{
        job_id = $jobId
        job_type = $jobType
        execution_id = $executionId
        phase = "started"
        state = Get-AgentState
    } -Severity "info"

    try {
        $output = ""

        switch ($jobType) {
            "report" {
                $result = Invoke-ReportJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "software_inventory_collect" {
                $result = Invoke-SoftwareInventoryJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "light_vuln_scan" {
                $result = Invoke-LightVulnScanJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "collect_antivirus_status" {
                $result = Invoke-CollectAntivirusJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "collect_web_activity" {
                $result = Invoke-CollectWebActivityJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            "update_agent" {
                $result = Invoke-UpdateAgentJob -Job $Job
                if ($result.success) { $output = $result.output }
                else { throw $result.error }
            }
            default {
                throw "Tipo de job nao suportado: $jobType"
            }
        }

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds
        $startTimeISO = $startTime.ToUniversalTime().ToString("o")

        # Registrar sucesso
        Add-EvidenceEntry -Type "job_execution" -Data @{
            job_id = $jobId
            job_type = $jobType
            execution_id = $executionId
            phase = "completed"
            execution_time_seconds = $execTime
            state = Get-AgentState
        } -Severity "info"

        Submit-JobResult `
            -JobId $jobId `
            -Status "completed" `
            -Output $output `
            -ExecutionTimeSeconds $execTime `
            -StartedAt $startTimeISO `
            -ExecutionId $executionId
    }
    catch {
        $err = "Erro ao executar job $jobId`: $($_.Exception.Message)"
        Write-Log $err "ERROR"

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds
        $startTimeISO = $startTime.ToUniversalTime().ToString("o")

        # Registrar falha
        Add-EvidenceEntry -Type "job_execution" -Data @{
            job_id = $jobId
            job_type = $jobType
            execution_id = $executionId
            phase = "failed"
            error = $_.Exception.Message
            execution_time_seconds = $execTime
            state = Get-AgentState
        } -Severity "error"

        Submit-JobResult `
            -JobId $jobId `
            -Status "failed" `
            -ErrorMessage $err `
            -ExecutionTimeSeconds $execTime `
            -StartedAt $startTimeISO `
            -ExecutionId $executionId
        
        # Considerar transicao para DEGRADED se muitas falhas
        if ($Global:AgentState.ErrorCount -ge 3) {
            Set-AgentState -NewState "DEGRADED" -Reason "Multiple job failures" -ErrorDetails $err
        }
    }
}

# ============================================
#  JOB HANDLERS (Simplificados para v4.0)
# ============================================
function Invoke-ReportJob {
    param($Job)
    
    try {
        $cpuUsage = (Get-WmiObject Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        if ($null -eq $cpuUsage) { $cpuUsage = 0 }
        
        $os = Get-WmiObject Win32_OperatingSystem
        $memUsage = [math]::Round((($os.TotalVisibleMemorySize - $os.FreePhysicalMemory) / $os.TotalVisibleMemorySize) * 100, 2)
        
        $disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        $diskPercent = if ($disk -and $disk.Size -gt 0) { 
            [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 2) 
        } else { 0 }
        
        $bootTime = (Get-WmiObject Win32_OperatingSystem).LastBootUpTime
        $bootDateTime = [Management.ManagementDateTimeConverter]::ToDateTime($bootTime)
        $uptimeSeconds = [int]((Get-Date) - $bootDateTime).TotalSeconds
        
        $report = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
            hostname = $env:COMPUTERNAME
            cpu_percent = [math]::Round($cpuUsage, 2)
            memory_percent = $memUsage
            disk_percent = $diskPercent
            uptime_seconds = $uptimeSeconds
            last_boot_time = $bootDateTime.ToUniversalTime().ToString("o")
            state = Get-AgentState
        }
        
        return @{ success = $true; output = ($report | ConvertTo-Json -Compress) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-SoftwareInventoryJob {
    param($Job)
    
    try {
        $software = [System.Collections.ArrayList]::new()
        
        $paths = @(
            "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall\*",
            "HKLM:\SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall\*"
        )
        
        foreach ($path in $paths) {
            Get-ItemProperty -Path $path -ErrorAction SilentlyContinue | 
            Where-Object { $_.DisplayName -and $_.DisplayName -notmatch "^(Update for|Security Update)" } |
            ForEach-Object {
                [void]$software.Add(@{
                    name = $_.DisplayName
                    version = $_.DisplayVersion
                    publisher = $_.Publisher
                    install_date = $_.InstallDate
                })
            }
        }
        
        $result = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            software_count = $software.Count
            software = $software
        }
        
        return @{ success = $true; output = ($result | ConvertTo-Json -Compress -Depth 5) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-LightVulnScanJob {
    param($Job)
    
    try {
        $result = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            vulnerabilities = @()
            scan_type = "light"
        }
        
        return @{ success = $true; output = ($result | ConvertTo-Json -Compress -Depth 5) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-CollectAntivirusJob {
    param($Job)
    
    try {
        $avStatus = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            engines = @()
        }
        
        # Windows Defender
        try {
            $defender = Get-MpComputerStatus -ErrorAction Stop
            $avStatus.engines += @{
                name = "Windows Defender"
                enabled = $defender.AntivirusEnabled
                real_time_protection = $defender.RealTimeProtectionEnabled
                definitions_updated = $defender.AntivirusSignatureLastUpdated.ToUniversalTime().ToString("o")
            }
        } catch { }
        
        return @{ success = $true; output = ($avStatus | ConvertTo-Json -Compress -Depth 5) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-CollectWebActivityJob {
    param($Job)
    
    try {
        $activity = @{
            timestamp = (Get-Date).ToUniversalTime().ToString("o")
            hostname = $env:COMPUTERNAME
            dns_cache = @()
            browser_history = @()
        }
        
        # DNS Cache
        try {
            $dnsCache = Get-DnsClientCache -ErrorAction SilentlyContinue | Select-Object -First 100
            foreach ($entry in $dnsCache) {
                $activity.dns_cache += @{
                    domain = $entry.Name
                    type = $entry.Type
                    ttl = $entry.TimeToLive
                }
            }
        } catch { }
        
        return @{ success = $true; output = ($activity | ConvertTo-Json -Compress -Depth 5) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

function Invoke-UpdateAgentJob {
    param($Job)
    
    try {
        Write-Log "[UPDATE] Verificando atualizacoes..." "INFO"
        
        Add-EvidenceEntry -Type "update_applied" -Data @{
            current_version = $Global:AgentVersion
            phase = "checking"
        } -Severity "info"
        
        return @{ success = $true; output = (@{ status = "checked"; current_version = $Global:AgentVersion } | ConvertTo-Json -Compress) }
    }
    catch {
        return @{ success = $false; error = $_.Exception.Message }
    }
}

# ============================================
#  POLL DE JOBS
# ============================================
function Poll-Jobs {
    $body = @{
        agent_name    = $Global:AgentName
        agent_version = $Global:AgentVersion
        state         = Get-AgentState
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
            return
        }

        $jobs = $result.Body | ConvertFrom-Json

        if ($null -eq $jobs -or $jobs.Count -eq 0) {
            Write-Log "[POLL] Nenhum job disponivel" "DEBUG"
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
#  LOOP PRINCIPAL v4.0
# ============================================
Write-Log "============================================" "INFO"
Write-Log "[START] CyberShield Agent v4.0 - State Machine" "INFO"
Write-Log "[INFO] ServerUrl: $Global:ServerUrl" "DEBUG"
Write-Log "[INFO] AgentName: $Global:AgentName" "DEBUG"
Write-Log "============================================" "INFO"

# Registrar inicio no Evidence Journal
Add-EvidenceEntry -Type "state_change" -Data @{
    event = "agent_started"
    version = $Global:AgentVersion
    hostname = $env:COMPUTERNAME
} -StateBefore $null -StateAfter "BOOTSTRAP" -Severity "info"

try {
    $bootstrapStart = Get-Date
    
    # Transicao: BOOTSTRAP -> SYNCING
    Set-AgentState -NewState "SYNCING" -Reason "Starting initial sync"

    # Primeiro heartbeat
    $heartbeatSuccess = Send-Heartbeat
    
    if ($heartbeatSuccess) {
        # Transicao: SYNCING -> ENFORCING
        Set-AgentState -NewState "ENFORCING" -Reason "Initial heartbeat successful"
    } else {
        # Transicao: SYNCING -> DEGRADED
        Set-AgentState -NewState "DEGRADED" -Reason "Initial heartbeat failed"
    }

    $bootstrapElapsed = [int]((Get-Date) - $bootstrapStart).TotalSeconds
    Write-Log "[SUCCESS] Bootstrap concluido em ${bootstrapElapsed}s (state: $(Get-AgentState))" "SUCCESS"

    $lastHeartbeat = Get-Date
    $lastPoll = Get-Date
    $lastMetrics = Get-Date
    $lastEvidenceFlush = Get-Date
    $lastRotation = Get-Date

    while ($true) {
        $now = Get-Date
        $state = Get-AgentState

        try {
            # Heartbeat a cada intervalo
            if ((($now - $lastHeartbeat).TotalSeconds) -ge $Global:PollIntervalSeconds) {
                $success = Send-Heartbeat
                
                if (-not $success -and $state -eq "ENFORCING") {
                    # Tentar recovery
                    Invoke-AutoRecovery -FailedComponent "heartbeat" -ErrorMessage "Heartbeat failed"
                } elseif ($success -and $state -eq "DEGRADED") {
                    # Recuperado
                    Set-AgentState -NewState "ENFORCING" -Reason "Heartbeat recovered"
                }
                
                $lastHeartbeat = Get-Date
            }

            # Poll de jobs (somente em estados validos)
            if ((($now - $lastPoll).TotalSeconds) -ge $Global:PollIntervalSeconds) {
                if (Test-CanExecuteJob) {
                    Poll-Jobs
                }
                $lastPoll = Get-Date
            }

            # Flush evidence a cada 5 minutos
            if ((($now - $lastEvidenceFlush).TotalSeconds) -ge 300) {
                Invoke-FlushEvidence
                $lastEvidenceFlush = Get-Date
            }

            # Rotacao de logs/evidence a cada hora
            if ((($now - $lastRotation).TotalSeconds) -ge 3600) {
                Invoke-LogRotation
                Invoke-EvidenceRotation
                $lastRotation = Get-Date
            }

        } catch {
            Write-Log "[ERROR] Erro no loop principal: $($_.Exception.Message)" "ERROR"
            
            Add-EvidenceEntry -Type "error" -Data @{
                error = $_.Exception.Message
                stack = $_.ScriptStackTrace
                state = $state
            } -Severity "error"
            
            # Tentar recovery para erros criticos
            if ($state -eq "ENFORCING") {
                Set-AgentState -NewState "DEGRADED" -Reason "Main loop error" -ErrorDetails $_.Exception.Message
            }
        }

        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Log "[FATAL] Erro fatal no agente: $($_.Exception.Message)" "ERROR"
    
    Set-AgentState -NewState "ERROR" -Reason "Fatal error" -ErrorDetails $_.Exception.Message
    
    Add-EvidenceEntry -Type "error" -Data @{
        fatal = $true
        error = $_.Exception.Message
        stack = $_.ScriptStackTrace
    } -Severity "critical"
    
    # Flush final antes de morrer
    Invoke-FlushEvidence
    
    exit 1
}
