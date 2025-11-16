<#
    CyberShield Agent - Windows v3.0.0 (Essencial)
    
    Funcionalidades:
    - HMAC SHA256 com secret em HEX (64 chars → 32 bytes)
    - Heartbeat periódico
    - Poll de jobs
    - Execução de jobs
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
#  VARIÁVEIS GLOBAIS
# ============================================
$Global:ServerUrl    = $ServerUrl.TrimEnd('/')
$Global:AgentToken   = $AgentToken
$Global:HmacSecret   = $HmacSecret
$Global:AgentName    = $AgentName
$Global:AgentVersion = $AgentVersion

# Diretório de log
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
        # Ignorar erro de escrita no log para não quebrar o agente
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
        Write-Log "HMAC_SECRET inválido. Esperado 64 caracteres hex (32 bytes). Length: $($HexString.Length)" "ERROR"
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
#  REQUISIÇÃO SEGURA COM HMAC
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

            Write-Log "Erro na requisição $Method $uri (tentativa $retryCount/$MaxRetries): $($_.Exception.Message)" "ERROR"

            if ($statusCode -eq 401) {
                Write-Log "❌ Erro de autenticação (401). Verifique AgentToken / HmacSecret / clock." "ERROR"
                throw
            }

            if ($retryCount -ge $MaxRetries) {
                Write-Log "❌ Falha definitiva após $MaxRetries tentativas em $uri" "ERROR"
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
        Write-Log "Erro ao coletar informações do sistema: $($_.Exception.Message)" "WARN"
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

    $body = @{
        agent_name                = $Global:AgentName
        event_type                = $Success ? "post_installation" : "post_installation_unverified"
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
            Write-Log "✅ post_installation registrado com sucesso" "SUCCESS"
        } else {
            Write-Log "⚠️ Falha ao registrar post_installation (Status=$($result.StatusCode))" "WARN"
        }
    } catch {
        Write-Log "⚠️ Erro ao enviar post_installation: $($_.Exception.Message)" "WARN"
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
            Write-Log "✅ Heartbeat OK (200)" "SUCCESS"
        } else {
            Write-Log "❌ Heartbeat falhou (Status=$($result.StatusCode))" "ERROR"
        }
    } catch {
        Write-Log "❌ Erro ao enviar heartbeat: $($_.Exception.Message)" "ERROR"
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
        [int]$ExecutionTimeSeconds = 0
    )

    $body = @{
        job_id                 = $JobId
        agent_name             = $Global:AgentName
        status                 = $Status
        output                 = $Output
        error_message          = $ErrorMessage
        execution_time_seconds = $ExecutionTimeSeconds
        finished_at            = (Get-Date).ToUniversalTime().ToString("o")
    }

    Write-Log "Enviando resultado do job $JobId (status=$Status)..." "INFO"

    try {
        $result = Invoke-SecureRequest `
            -Path "/functions/v1/submit-job-result" `
            -Method "POST" `
            -Body $body `
            -TimeoutSec 30

        if ($result.Success -and $result.StatusCode -eq 200) {
            Write-Log "✅ Resultado do job $JobId enviado com sucesso" "SUCCESS"
            return $true
        } else {
            Write-Log "❌ Falha ao enviar resultado (Status=$($result.StatusCode))" "ERROR"
            return $false
        }
    } catch {
        Write-Log "❌ Erro ao enviar resultado do job ${JobId}: $($_.Exception.Message)" "ERROR"
        return $false
    }
}

# ============================================
#  EXECUÇÃO DE JOB
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

    Write-Log "🔧 Executando job $jobId (type=$jobType)" "INFO"

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
            default {
                throw "Tipo de job não suportado: $jobType"
            }
        }

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds

        Submit-JobResult `
            -JobId $jobId `
            -Status "completed" `
            -Output $output `
            -ExecutionTimeSeconds $execTime
    }
    catch {
        $err = "Erro ao executar job $jobId`: $($_.Exception.Message)"
        Write-Log $err "ERROR"

        $execTime = [int]((Get-Date) - $startTime).TotalSeconds

        Submit-JobResult `
            -JobId $jobId `
            -Status "failed" `
            -ErrorMessage $err `
            -ExecutionTimeSeconds $execTime
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
            Write-Log "❌ poll-jobs falhou (Status=$($result.StatusCode))" "ERROR"
            return
        }

        if ([string]::IsNullOrWhiteSpace($result.Body)) {
            Write-Log "⚠️ Resposta de poll-jobs vazia" "WARN"
            return
        }

        $jobs = $result.Body | ConvertFrom-Json

        if ($null -eq $jobs -or $jobs.Count -eq 0) {
            Write-Log "📭 Nenhum job disponível" "INFO"
            return
        }

        Write-Log "📬 Recebidos $($jobs.Count) job(s)" "INFO"

        foreach ($job in $jobs) {
            Execute-Job -Job $job
        }
    } catch {
        Write-Log "❌ Erro no poll-jobs: $($_.Exception.Message)" "ERROR"
    }
}

# ============================================
#  LOOP PRINCIPAL
# ============================================
Write-Log "============================================" "INFO"
Write-Log "🚀 Iniciando CyberShield Agent - Windows v$Global:AgentVersion" "INFO"
Write-Log "🌐 ServerUrl: $Global:ServerUrl" "DEBUG"
Write-Log "🏷️  AgentName: $Global:AgentName" "DEBUG"
Write-Log "============================================" "INFO"

try {
    $bootstrapStart = Get-Date

    # 1) Enviar evento de post_installation
    Send-PostInstallationEvent -Success $true -InstallationTimeSeconds 0

    # 2) Primeiro heartbeat
    Send-Heartbeat

    $bootstrapElapsed = [int]((Get-Date) - $bootstrapStart).TotalSeconds
    Write-Log "✅ Bootstrap concluído em ${bootstrapElapsed}s" "SUCCESS"

    Write-Log "🔄 Entrando no loop principal (intervalo=$($Global:PollIntervalSeconds)s)" "INFO"

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
            Write-Log "❌ Erro no loop principal: $($_.Exception.Message)" "ERROR"
        }

        Start-Sleep -Seconds 2
    }
}
catch {
    Write-Log "💥 Erro fatal no agente: $($_.Exception.Message)" "ERROR"
    Write-Log "Stack trace: $($_.ScriptStackTrace)" "ERROR"
    exit 1
}
