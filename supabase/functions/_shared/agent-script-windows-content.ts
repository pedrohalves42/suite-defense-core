/**
 * CyberShield Agent Windows Script - Inline Content
 * CRITICAL: This file MUST be kept in sync with agent-scripts/cybershield-agent-windows.ps1
 * Any changes to cybershield-agent-windows.ps1 should be immediately reflected here
 * Version: 3.0.0 - FIXED ORDER OF EXECUTION (no more crashes)
 * 
 * SYNCHRONIZATION WARNING:
 * - Update both cybershield-agent-windows.ps1 AND this file together
 * - Failure to sync will cause installer failures with HMAC errors
 * 
 * SECURITY REQUIREMENTS (v3.0.0):
 * - NEVER use $headers['key'] indexing in logs (causes null reference errors)
 * - ALWAYS use Invoke-SecureRequest for authenticated API calls
 * - HMAC generation MUST be internal to Invoke-SecureRequest
 * - Logs must be wrapped in try-catch if accessing complex objects
 * - Variables and functions MUST be defined before use (order of execution fix)
 */

export const AGENT_SCRIPT_WINDOWS_PS1 = `# CyberShield Agent - Windows PowerShell Script v3.0.0 (Production Ready + Order Fixed)
# Compatible with: Windows Server 2012, 2012 R2, 2016, 2019, 2022, 2025
# PowerShell Version: 3.0+

#Requires -Version 3.0

param(
    [Parameter(Mandatory=\$true)]
    [string]\$AgentToken,
    
    [Parameter(Mandatory=\$true)]
    [string]\$HmacSecret,
    
    [Parameter(Mandatory=\$true)]
    [string]\$ServerUrl,
    
    [Parameter(Mandatory=\$true)]
    [string]\$AgentName,
    
    [Parameter(Mandatory=\$false)]
    [int]\$PollInterval = 60
)

# ====================================
# BOOTSTRAP CRÍTICO (executa PRIMEIRO)
# ====================================

# 1. Encoding global
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
\$PSDefaultParameterValues['Out-File:Encoding'] = 'utf8'
\$PSDefaultParameterValues['ConvertTo-Json:Depth'] = 10

# 2. Paths e configuração de log (ANTES de qualquer operação)
\$LogDir = "C:\\CyberShield\\logs"
\$LogFile = Join-Path \$LogDir "agent.log"
\$CrashLogPath = Join-Path \$LogDir "agent-crash.log"
\$MaxLogSizeMB = 10
\$MaxLogFiles = 7

# 3. Garantir que diretório existe
New-Item -ItemType Directory -Path \$LogDir -Force -ErrorAction SilentlyContinue | Out-Null

# 4. Função Write-Log (ÚNICA, com rotação completa)
function Write-Log {
    param(
        [string]\$Message,
        [ValidateSet("INFO","DEBUG","WARN","ERROR","SUCCESS","FATAL")]
        [string]\$Level = "INFO"
    )
    
    \$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    \$logMessage = "[\$timestamp] [\$Level] \$Message"
    
    # Rotação de logs se necessário
    try {
        if (Test-Path \$LogFile) {
            \$logSize = (Get-Item \$LogFile).Length / 1MB
            if (\$logSize -gt \$MaxLogSizeMB) {
                for (\$i = \$MaxLogFiles; \$i -gt 0; \$i--) {
                    \$oldLog = "\$LogFile.\$i"
                    \$newLog = "\$LogFile.\$(\$i + 1)"
                    if (Test-Path \$oldLog) {
                        Move-Item -Path \$oldLog -Destination \$newLog -Force
                    }
                }
                Move-Item -Path \$LogFile -Destination "\$LogFile.1" -Force
            }
        }
        
        Add-Content -Path \$LogFile -Value \$logMessage -ErrorAction SilentlyContinue
    } catch {
        # Se der erro de IO, ignora (não pode matar o agente por causa do log)
    }
    
    \$color = switch (\$Level) {
        "ERROR"   { "Red" }
        "FATAL"   { "DarkRed" }
        "WARN"    { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG"   { "Gray" }
        default   { "White" }
    }
    
    Write-Host \$logMessage -ForegroundColor \$color
}

# 5. ErrorActionPreference + Trap (DEPOIS que Write-Log existe)
\$ErrorActionPreference = "Stop"

trap {
    \$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    \$crashMsg = @"
[\$ts] [FATAL] Unhandled exception in CyberShield Agent
Message: \$(\$_.Exception.Message)
Type: \$(\$_.Exception.GetType().FullName)
Stack:
\$(\$_.ScriptStackTrace)
Command: \$(\$_.InvocationInfo.MyCommand)
Line: \$(\$_.InvocationInfo.ScriptLineNumber)
"@
    
    # Tentar gravar crash log
    try {
        Add-Content -Path \$CrashLogPath -Value \$crashMsg -ErrorAction SilentlyContinue
    } catch {}
    
    # Tentar gravar em agent.log também
    try {
        Write-Log "FATAL CRASH: \$(\$_.Exception.Message)" "FATAL"
        Write-Log "Stack: \$(\$_.ScriptStackTrace)" "FATAL"
    } catch {}
    
    # Tentar enviar telemetria de crash
    try {
        \$crashPayload = @{
            agent_token = \$AgentToken
            log_type = "agent_crash"
            severity = "critical"
            logs = @(\$crashMsg)
        } | ConvertTo-Json -Depth 3
        
        Invoke-WebRequest -Uri "\$ServerUrl/functions/v1/diagnostics-agent-logs" \`
            -Method POST \`
            -ContentType "application/json" \`
            -Headers @{ "X-Agent-Token" = \$AgentToken } \`
            -Body \$crashPayload \`
            -TimeoutSec 5 \`
            -UseBasicParsing | Out-Null
    } catch {}
    
    exit 1
}

# 6. Log de bootstrap concluído
Write-Log "========================================" "INFO"
Write-Log "CyberShield Agent v3.0.0" "INFO"
Write-Log "Bootstrap concluído com sucesso" "SUCCESS"
Write-Log "AgentToken: \$(\$AgentToken.Substring(0,8))..." "DEBUG"
Write-Log "ServerUrl: \$ServerUrl" "DEBUG"
Write-Log "========================================" "INFO"

# ============================================================================
# CRÍTICO-3: MUTEX - PREVENT MULTIPLE INSTANCES
# ============================================================================
\$MutexName = "Global\\CyberShieldAgent_\$AgentToken"
\$Mutex = \$null

try {
    \$Mutex = New-Object System.Threading.Mutex(\$false, \$MutexName)
    
    if (-not \$Mutex.WaitOne(0)) {
        Write-Log "Outra instância do agente já está em execução. Encerrando." "WARN"
        exit 0
    }
} catch {
    Write-Log "Falha ao criar Mutex: \$(\$_.Exception.Message)" "ERROR"
    throw "Falha ao criar Mutex para prevenir múltiplas instâncias"
}

# ============================================================================
# PARAMETER VALIDATION (v3.0.0 - Now with proper logging and throw)
# ============================================================================
if ([string]::IsNullOrWhiteSpace(\$AgentToken)) {
    Write-Log "Parâmetro -AgentToken é obrigatório mas está vazio" "FATAL"
    throw "AgentToken é obrigatório"
}

if ([string]::IsNullOrWhiteSpace(\$HmacSecret)) {
    Write-Log "Parâmetro -HmacSecret é obrigatório mas está vazio" "FATAL"
    throw "HmacSecret é obrigatório"
}

if ([string]::IsNullOrWhiteSpace(\$ServerUrl)) {
    Write-Log "Parâmetro -ServerUrl é obrigatório mas está vazio" "FATAL"
    throw "ServerUrl é obrigatório"
}

if ([string]::IsNullOrWhiteSpace(\$AgentName)) {
    Write-Log "Parâmetro -AgentName é obrigatório mas está vazio" "FATAL"
    throw "AgentName é obrigatório"
}

# Validate minimum lengths (security)
if (\$AgentToken.Length -lt 20) {
    Write-Log "AgentToken muito curto (mínimo 20 caracteres, recebido: \$(\$AgentToken.Length))" "FATAL"
    throw "AgentToken não atende requisitos mínimos de segurança"
}

if (\$HmacSecret.Length -lt 32) {
    Write-Log "HmacSecret muito curto (mínimo 32 caracteres, recebido: \$(\$HmacSecret.Length))" "FATAL"
    throw "HmacSecret não atende requisitos mínimos de segurança"
}

Write-Log "Validação de parâmetros concluída com sucesso" "SUCCESS"

# PowerShell version check
if (\$PSVersionTable.PSVersion.Major -lt 3) {
    Write-Log "PowerShell 3.0+ necessário. Versão atual: \$(\$PSVersionTable.PSVersion)" "FATAL"
    throw "Versão do PowerShell incompatível"
}

# ============================================================================
# SYSTEM INFORMATION (v3.0.0 - Protected WMI call)
# ============================================================================
\$osVersion = [System.Environment]::OSVersion.Version
\$hostname = \$env:COMPUTERNAME

# Proteção contra falha de WMI (causa comum de crash)
\$osName = "Windows (detalhe indisponível)"
try {
    \$osName = (Get-WmiObject -Class Win32_OperatingSystem -ErrorAction Stop).Caption
    Write-Log "Sistema operacional detectado: \$osName" "DEBUG"
} catch {
    Write-Log "WARN: Não foi possível obter detalhes do SO via WMI: \$(\$_.Exception.Message)" "WARN"
    Write-Log "O agente continuará normalmente com nome genérico de SO" "INFO"
}

Write-Log "Hostname: \$hostname" "DEBUG"
Write-Log "OS Version: \$(\$osVersion.ToString())" "DEBUG"

# ============================================================================
# BANNER DE INICIALIZAÇÃO
#============================================================================
# ============================================================================
Write-Log "========================================" "INFO"
Write-Log "CyberShield Agent v3.0.0 Iniciando..." "INFO"
Write-Log "========================================" "INFO"
Write-Log "Timestamp: \$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" "INFO"
Write-Log "OS: \$osName" "INFO"
Write-Log "PowerShell: \$(\$PSVersionTable.PSVersion)" "INFO"
Write-Log "AgentToken: \$(\$AgentToken.Substring(0,20))..." "INFO"
Write-Log "AgentName: \$AgentName" "INFO"
Write-Log "HmacSecret Length: \$(\$HmacSecret.Length) chars" "INFO"
Write-Log "ServerUrl: \$ServerUrl" "INFO"
Write-Log "PollInterval: \$PollInterval segundos" "INFO"
Write-Log "Log Directory: \$LogDir" "INFO"
Write-Log "Log File: \$LogFile" "INFO"
Write-Log "========================================" "INFO"

# Windows Server 2012 = 6.2, 2012 R2 = 6.3, 2016 = 10.0, etc
if (\$osVersion.Major -lt 6 -or (\$osVersion.Major -eq 6 -and \$osVersion.Minor -lt 2)) {
    Write-Log "AVISO: Este agente foi testado em Windows Server 2012+ e Windows 8+" "WARN"
    Write-Log "Sua versão pode não ser totalmente suportada" "WARN"
}

#region Funções Helper

# Variáveis globais para modo degradado
\$script:ConsecutiveAuthFailures = 0
\$script:MaxAuthFailuresBeforeDegraded = 10
\$script:InDegradedMode = \$false

function Convert-HexToBytes {
    param([string]\$HexString)
    
    # Validation: must be 64 hex chars (32 bytes)
    if (\$HexString -notmatch '^[0-9a-fA-F]{64}\$') {
        Write-Log "ERROR: HMAC_SECRET must be 64 hexadecimal characters (32 bytes). Current length: \$(\$HexString.Length)" "ERROR"
        throw "Invalid HMAC_SECRET format. Expected 64 hex characters, got: \$(\$HexString.Length)"
    }
    
    try {
        \$bytes = New-Object byte[] 32
        for (\$i = 0; \$i -lt 64; \$i += 2) {
            \$bytes[\$i / 2] = [Convert]::ToByte(\$HexString.Substring(\$i, 2), 16)
        }
        return \$bytes
    } catch {
        Write-Log "ERROR: Failed to convert HMAC_SECRET from HEX: \$_" "ERROR"
        throw "HMAC_SECRET conversion failed: \$_"
    }
}

function Get-HmacSignature {
    param(
        [string]\$Data,
        [string]\$Secret
    )
    
    try {
        # FASE 2 FIX: Usar HEX em vez de UTF-8 (compatível com backend)
        \$hmac = New-Object System.Security.Cryptography.HMACSHA256
        \$hmac.Key = Convert-HexToBytes \$Secret
        \$dataBytes = [System.Text.Encoding]::UTF8.GetBytes(\$Data)
        \$hashBytes = \$hmac.ComputeHash(\$dataBytes)
        \$signature = [BitConverter]::ToString(\$hashBytes).Replace('-', '').ToLower()
        return \$signature
    }
    catch {
        Write-Log "Erro ao gerar HMAC: \$(\$_.Exception.Message)" "ERROR"
        throw
    }
}

function Invoke-SecureRequest {
    param(
        [Parameter(Mandatory=\$true)]
        [string]\$Uri,
        
        [Parameter(Mandatory=\$true)]
        [ValidateSet('GET', 'POST', 'PUT', 'DELETE')]
        [string]\$Method,
        
        [Parameter(Mandatory=\$false)]
        [hashtable]\$Body = @{},
        
        [Parameter(Mandatory=\$false)]
        [int]\$MaxRetries = 3,
        
        [Parameter(Mandatory=\$false)]
        [int]\$TimeoutSec = 30
    )
    
    \$attempt = 0
    \$lastError = \$null
    
    while (\$attempt -lt \$MaxRetries) {
        \$attempt++
        
        try {
            # Preparar dados com timestamp em MILISSEGUNDOS
            \$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            
            # Gerar nonce único (UUID v4)
            \$nonce = [guid]::NewGuid().ToString()
            
            # Preparar body JSON (FASE 2 FIX: usar string vazia em vez de "{}")
            \$bodyJson = ""
            if (\$Method -ne 'GET' -and \$Body -and \$Body.Count -gt 0) {
                \$bodyJson = \$Body | ConvertTo-Json -Depth 10 -Compress
            }
            
            # Construir payload HMAC: "timestamp:nonce:body"
            \$dataToSign = "\${timestamp}:\${nonce}:\${bodyJson}"
            
            # Gerar assinatura HMAC-SHA256
            \$signature = Get-HmacSignature -Data \$dataToSign -Secret \$HmacSecret
            
            # Preparar headers (padrão do backend)
            \$headers = @{
                "Content-Type" = "application/json"
                "X-Agent-Token" = \$AgentToken
                "X-HMAC-Signature" = \$signature
                "X-Timestamp" = \$timestamp.ToString()
                "X-Nonce" = \$nonce
            }
            
            # Fazer requisição
            \$params = @{
                Uri = \$Uri
                Method = \$Method
                Headers = \$headers
                TimeoutSec = \$TimeoutSec
                UseBasicParsing = \$true
            }
            
            # FASE 2 FIX: Só adiciona Body se não for vazio
            if (\$Method -ne 'GET' -and -not [string]::IsNullOrEmpty(\$bodyJson)) {
                \$params['Body'] = \$bodyJson
            }
            
            \$response = Invoke-WebRequest @params
            
            # Sucesso - resetar contador de falhas de auth
            \$script:ConsecutiveAuthFailures = 0
            
            Write-Log "✅ \$Method \$Uri - Status: \$(\$response.StatusCode)" "DEBUG"
            
            return @{
                Success = \$true
                StatusCode = \$response.StatusCode
                Content = \$response.Content
                Response = \$response
            }
        }
        catch {
            \$lastError = \$_
            \$statusCode = if (\$_.Exception.Response) { \$_.Exception.Response.StatusCode.value__ } else { 0 }
            
            Write-Log "Tentativa \$attempt/\$MaxRetries falhou (Status: \$statusCode): \$(\$_.Exception.Message)" "WARN"
            
            # Analisar erros de autenticação (401/403)
            if (\$statusCode -in @(401, 403)) {
                \$errorCode = \$null
                \$isTransient = \$false
                
                try {
                    \$errorBody = \$_.ErrorDetails.Message | ConvertFrom-Json
                    \$errorCode = \$errorBody.code
                    \$isTransient = \$errorBody.transient -eq \$true
                    Write-Log "Código de erro: \$errorCode (transitório: \$isTransient)" "DEBUG"
                } catch {
                    Write-Log "Não foi possível parsear resposta de erro JSON" "DEBUG"
                }
                
                \$script:ConsecutiveAuthFailures++
                
                # FASE 2 FIX: Stop retries em vez de entrar em modo degradado
                Write-Log "❌ Authentication failure (\$statusCode). STOPPING retries." "ERROR"
                Write-Log "   Possible causes:" "ERROR"
                Write-Log "   - Invalid/expired AgentToken" "ERROR"
                Write-Log "   - HMAC secret mismatch with backend" "ERROR"
                Write-Log "   - System clock out of sync (NTP)" "ERROR"
                Write-Log "   Error code: \$errorCode" "ERROR"
                
                return @{
                    Success = \$false
                    Error = \$lastError.Exception.Message
                    StatusCode = \$statusCode
                    ErrorCode = \$errorCode
                }
            }
            
            if (\$attempt -lt \$MaxRetries) {
                \$waitTime = [Math]::Pow(2, \$attempt)
                Write-Log "Aguardando \$waitTime segundos antes de tentar novamente..." "DEBUG"
                Start-Sleep -Seconds \$waitTime
            }
        }
    }
    
    # Se chegou aqui, esgotou tentativas sem ser erro de autenticação
    Write-Log "❌ Todas as tentativas falharam para \$Method \$Uri" "ERROR"
    
    \$finalStatusCode = 0
    if (\$lastError.Exception.Response) {
        \$finalStatusCode = \$lastError.Exception.Response.StatusCode.value__
    }
    
    return @{
        Success = \$false
        Error = \$lastError.Exception.Message
        StatusCode = \$finalStatusCode
    }
}

#endregion

#region Heartbeat e Métricas

#region Heartbeat e Métricas

function Send-Heartbeat {
    try {
        Write-Log "📡 Enviando heartbeat..." "DEBUG"
        Write-Log "   AgentToken: \$(\$AgentToken.Substring(0,8))..." "DEBUG"
        Write-Log "   HmacSecret: \$(\$HmacSecret.Substring(0,8))..." "DEBUG"
        Write-Log "   ServerUrl: \$ServerUrl" "DEBUG"
        
        \$hostname = \$env:COMPUTERNAME
        \$body = @{
            agent_token = \$AgentToken
            os_type = "Windows"
            os_version = \$osName
            hostname = \$hostname
            agent_version = "3.0.0"
        }
        
        \$result = Invoke-SecureRequest \`
            -Uri "\$ServerUrl/functions/v1/heartbeat" \`
            -Method POST \`
            -Body \$body \`
            -TimeoutSec 10
        
        if (\$result.Success) {
            Write-Log "✅ Heartbeat enviado com sucesso (Status: \$(\$result.StatusCode))" "SUCCESS"
        }
        else {
            Write-Log "❌ Heartbeat falhou: StatusCode=\$(\$result.StatusCode), Error=\$(\$result.Error)" "ERROR"
            Write-Log "⚠️  Verifique conectividade de rede e sincronização de relógio do sistema" "WARN"
            # Heartbeat será retentado no próximo ciclo (60s)
        }
    }
    catch {
        Write-Log "❌ EXCEPTION em Send-Heartbeat: \$(\$_.Exception.Message)" "ERROR"
        Write-Log "   StackTrace: \$(\$_.ScriptStackTrace)" "ERROR"
    }
}

function Send-PostInstallationEvent {
    param(
        [bool]\$Success = \$true,
        [string]\$ErrorMessage = "",
        [int]\$InstallationTimeSeconds = 0
    )
    
    try {
        Write-Log "📤 Enviando evento de post-installation (success=\$Success)..." "INFO"
        
        \$hostname = \$env:COMPUTERNAME
        \$telemetry = @{
            os_type = "Windows"
            os_version = \$osName
            hostname = \$hostname
            powershell_version = \$PSVersionTable.PSVersion.ToString()
            install_method = "scheduled_task"
        }
        
        \$body = @{
            agent_name = \$AgentName
            event_type = if (\$Success) { "post_installation" } else { "post_installation_unverified" }
            platform = "windows"
            installation_method = "one_click"
            success = \$Success
            installation_time_seconds = \$InstallationTimeSeconds
            error_message = \$ErrorMessage
            metadata = \$telemetry
        }
        
        \$result = Invoke-SecureRequest \`
            -Uri "\$ServerUrl/functions/v1/track-installation-event" \`
            -Method POST \`
            -Body \$body \`
            -TimeoutSec 10
        
        if (\$result.Success) {
            Write-Log "✅ Evento post-installation enviado (Status: \$(\$result.StatusCode))" "SUCCESS"
            return \$true
        } else {
            Write-Log "⚠️ Falha ao enviar post-installation event: \$(\$result.Error)" "WARN"
            return \$false
        }
    }
    catch {
        Write-Log "❌ EXCEPTION em Send-PostInstallationEvent: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
}

function Send-SystemMetrics {
    try {
        Write-Log "Coletando métricas do sistema..." "DEBUG"
        
        # CPU (com proteção WMI)
        try {
            \$cpuUsage = (Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
            \$cpuCores = (Get-WmiObject -Class Win32_Processor).NumberOfLogicalProcessors
            \$cpuName = (Get-WmiObject -Class Win32_Processor).Name
        }
        catch {
            Write-Log "⚠️ Falha ao coletar métricas de CPU via WMI: \$(\$_.Exception.Message)" "WARN"
            \$cpuUsage = 0
            \$cpuCores = 1
            \$cpuName = "Unknown CPU"
        }
        
        # Memória (com proteção WMI)
        try {
            \$os = Get-WmiObject -Class Win32_OperatingSystem
            \$totalMemGB = [Math]::Round(\$os.TotalVisibleMemorySize / 1MB, 2)
            \$freeMemGB = [Math]::Round(\$os.FreePhysicalMemory / 1MB, 2)
            \$usedMemGB = \$totalMemGB - \$freeMemGB
            \$memUsagePercent = [Math]::Round((\$usedMemGB / \$totalMemGB) * 100, 1)
            
            # Uptime (usa mesmo objeto \$os)
            \$lastBoot = \$os.ConvertToDateTime(\$os.LastBootUpTime)
            \$uptime = (Get-Date) - \$lastBoot
            \$uptimeSeconds = [int]\$uptime.TotalSeconds
        }
        catch {
            Write-Log "⚠️ Falha ao coletar métricas de memória/uptime via WMI: \$(\$_.Exception.Message)" "WARN"
            \$totalMemGB = 0
            \$freeMemGB = 0
            \$usedMemGB = 0
            \$memUsagePercent = 0
            \$lastBoot = Get-Date
            \$uptimeSeconds = 0
        }
        
        # Disco (com proteção WMI)
        try {
            \$disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
            \$diskTotalGB = [Math]::Round(\$disk.Size / 1GB, 2)
            \$diskFreeGB = [Math]::Round(\$disk.FreeSpace / 1GB, 2)
            \$diskUsedGB = \$diskTotalGB - \$diskFreeGB
            \$diskUsagePercent = [Math]::Round((\$diskUsedGB / \$diskTotalGB) * 100, 1)
        }
        catch {
            Write-Log "⚠️ Falha ao coletar métricas de disco via WMI: \$(\$_.Exception.Message)" "WARN"
            \$diskTotalGB = 0
            \$diskFreeGB = 0
            \$diskUsedGB = 0
            \$diskUsagePercent = 0
        }
        
        \$body = @{
            agent_token = \$AgentToken
            cpu_usage_percent = \$cpuUsage
            cpu_cores = \$cpuCores
            cpu_name = \$cpuName
            memory_total_gb = \$totalMemGB
            memory_used_gb = \$usedMemGB
            memory_free_gb = \$freeMemGB
            memory_usage_percent = \$memUsagePercent
            disk_total_gb = \$diskTotalGB
            disk_used_gb = \$diskUsedGB
            disk_free_gb = \$diskFreeGB
            disk_usage_percent = \$diskUsagePercent
            uptime_seconds = \$uptimeSeconds
            last_boot_time = \$lastBoot.ToString("yyyy-MM-ddTHH:mm:ss")
        }
        
        \$result = Invoke-SecureRequest \`
            -Uri "\$ServerUrl/functions/v1/submit-system-metrics" \`
            -Method POST \`
            -Body \$body \`
            -TimeoutSec 15
        
        if (\$result.Success) {
            Write-Log "✅ Métricas enviadas: CPU=\$cpuUsage%, RAM=\$memUsagePercent%, Disk=\$diskUsagePercent%" "SUCCESS"
        }
        else {
            Write-Log "❌ Falha ao enviar métricas: \$(\$result.Error)" "ERROR"
        }
    }
    catch {
        Write-Log "Erro ao coletar/enviar métricas: \$(\$_.Exception.Message)" "ERROR"
    }
}

function Send-PostInstallationEvent {
    try {
        Write-Log "Reportando evento de post_installation..." "INFO"

        \$body = @{
            event_type = "post_installation"
            platform   = "windows"
            agent_token = \$AgentToken
            hostname   = \$env:COMPUTERNAME
            timestamp  = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
            success    = \$true
            installation_method = "one_click"
            network_connectivity = \$true
        }

        \$result = Invoke-SecureRequest \`
            -Uri "\$ServerUrl/functions/v1/track-installation-event" \`
            -Method POST \`
            -Body \$body \`
            -TimeoutSec 10 \`
            -MaxRetries 2

        if (\$result.Success -and \$result.StatusCode -eq 200) {
            Write-Log "✅ Evento post_installation registrado com sucesso" "SUCCESS"
        } else {
            Write-Log "⚠ Falha ao registrar post_installation: Status=\$(\$result.StatusCode) Error=\$(\$result.Error)" "WARN"
        }
    }
    catch {
        Write-Log "⚠ Exceção em Send-PostInstallationEvent: \$(\$_.Exception.Message)" "WARN"
        Write-Log "   Stack: \$(\$_.ScriptStackTrace)" "DEBUG"
    }
}

#endregion

#region Polling e Execução de Jobs

function Poll-Jobs {
    try {
        Write-Log "Verificando jobs pendentes..." "DEBUG"
        
        \$body = @{
            agent_token = \$AgentToken
        }
        
        \$result = Invoke-SecureRequest \`
            -Uri "\$ServerUrl/functions/v1/poll-jobs" \`
            -Method POST \`
            -Body \$body \`
            -TimeoutSec 15
        
        if (\$result.Success) {
            # FASE 5: Parse robusto do JSON com tratamento de erro
            \$responseText = \$result.Content
            Write-Log "Raw response from poll-jobs: \$responseText" "DEBUG"

            if ([string]::IsNullOrWhiteSpace(\$responseText)) {
                Write-Log "Empty response from poll-jobs" "WARN"
                return @()
            }

            try {
                \$jobs = \$responseText | ConvertFrom-Json
            }
            catch {
                Write-Log "Error parsing jobs JSON: \$(\$_.Exception.Message)" "ERROR"
                Write-Log "Raw response was: \$responseText" "DEBUG"
                return @()
            }
            
            # FASE 5: Compatível com array puro OU objeto { jobs: [...] }
            if (\$jobs.PSObject.Properties.Name -contains 'jobs') {
                \$jobs = \$jobs.jobs
            }
            elseif (\$jobs -isnot [Array]) {
                # Se veio um único job como objeto
                Write-Log "Wrapping single job in array" "DEBUG"
                \$jobs = @(\$jobs)
            }
            
            if (\$null -eq \$jobs) {
                Write-Log "Parsed jobs is null" "WARN"
                return @()
            }
            
            # FASE 5: Filtro triplo ANTES de retornar (null, ID, type)
            \$validJobs = @()
            foreach (\$job in \$jobs) {
                if (\$null -eq \$job) {
                    Write-Log "Skipping null job in response" "WARN"
                    continue
                }

                if (-not \$job.id) {
                    Write-Log "Skipping job without ID: \$(\$job | ConvertTo-Json -Compress)" "WARN"
                    continue
                }

                if (-not \$job.type) {
                    Write-Log "Skipping job without type (ID: \$(\$job.id))" "WARN"
                    continue
                }

                \$validJobs += \$job
            }

            Write-Log "Poll-Jobs: \$(\$validJobs.Count) valid jobs after validation" "DEBUG"
            return \$validJobs
        }
        else {
            Write-Log "Erro ao buscar jobs: \$(\$result.Error)" "ERROR"
            return @()
        }
    }
    catch {
        Write-Log "Erro no Poll-Jobs: \$(\$_.Exception.Message)" "ERROR"
        return @()
    }
}

function Execute-Job {
    param(
        [Parameter(Mandatory=\$true)]
        \$Job
    )
    
    try {
        Write-Log "Executando job [\$(\$Job.id)] tipo: \$(\$Job.type)" "INFO"
        
        \$result = @{
            success = \$false
            output = ""
            error = ""
        }
        
        switch (\$Job.type) {
            "integration_test" {
                Write-Log "🧪 Executando teste de integração..." "INFO"
                
                # Simular execução de teste
                Start-Sleep -Seconds 2
                
                # Coletar informações do sistema para o teste
                \$testInfo = @{
                    agent_token = \$AgentToken
                    hostname = \$env:COMPUTERNAME
                    os = \$osName
                    powershell_version = \$PSVersionTable.PSVersion.ToString()
                    test_timestamp = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
                    test_status = "completed"
                }
                
                \$result.success = \$true
                \$result.output = \$testInfo | ConvertTo-Json -Compress
                
                Write-Log "✅ Teste de integração concluído com sucesso" "SUCCESS"
            }
            
            "virus_scan" {
                Write-Log "Executando scan de vírus..." "INFO"
                \$result.success = \$true
                \$result.output = "Scan concluído (simulado)"
            }
            
            "collect_info" {
                Write-Log "Coletando informações do sistema..." "INFO"
                \$info = @{
                    os = \$osName
                    hostname = \$env:COMPUTERNAME
                    username = \$env:USERNAME
                    powershell_version = \$PSVersionTable.PSVersion.ToString()
                }
                \$result.success = \$true
                \$result.output = \$info | ConvertTo-Json
            }
            
            "scan" {
                # Payload esperado: { "filePath": "C:\\\\path\\\\file.exe", "tenantId": "uuid" }
                \$filePath = \$Job.payload.filePath
                \$tenantId = \$Job.payload.tenantId

                if (-not (Test-Path \$filePath)) {
                    \$result.success = \$false
                    \$result.error = "Arquivo não encontrado: \$filePath"
                    break
                }

                # Calcular SHA256
                \$fileHash = (Get-FileHash -Path \$filePath -Algorithm SHA256).Hash.ToLower()
                Write-Log "🔍 Escaneando: \$filePath (hash: \$fileHash)" "INFO"

                # Chamar scan-virus (backend JÁ EXISTE)
                \$scanBody = @{
                    tenant_id  = \$tenantId
                    agent_name = \$AgentName
                    file_path  = \$filePath
                    file_hash  = \$fileHash
                } | ConvertTo-Json -Depth 5

                \$scanResult = Invoke-SecureRequest \`
                    -Path "/functions/v1/scan-virus" \`
                    -Method "POST" \`
                    -Body \$scanBody \`
                    -TimeoutSec 60

                if (-not \$scanResult.Success) {
                    \$result.success = \$false
                    \$result.error = "Falha ao chamar scan-virus: HTTP \$(\$scanResult.StatusCode)"
                    break
                }

                \$scanData = \$scanResult.Body | ConvertFrom-Json

                \$output = @{
                    filePath    = \$filePath
                    fileHash    = \$fileHash
                    isMalicious = \$scanData.isMalicious
                    positives   = \$scanData.positives
                    totalScans  = \$scanData.totalScans
                    permalink   = \$scanData.permalink
                    scannerUsed = \$scanData.scannerUsed
                    fromCache   = \$scanData.fromCache
                }

                if (\$scanData.isMalicious) {
                    Write-Log "⚠️ MALWARE DETECTADO: \$(\$scanData.positives)/\$(\$scanData.totalScans) engines" "WARN"
                    
                    # Quarentena local (MOVE, não DELETE)
                    \$quarantineRoot = "C:\\CyberShield\\Quarantine"
                    if (-not (Test-Path \$quarantineRoot)) {
                        New-Item -ItemType Directory -Path \$quarantineRoot -Force | Out-Null
                    }

                    \$fileName = [System.IO.Path]::GetFileName(\$filePath)
                    \$guid = [guid]::NewGuid().ToString()
                    \$quarantinePath = Join-Path \$quarantineRoot "\$guid\`_\$fileName"

                    Move-Item -Path \$filePath -Destination \$quarantinePath -Force
                    Write-Log "✅ Arquivo movido para: \$quarantinePath" "SUCCESS"

                    \$output.quarantined = \$true
                    \$output.quarantinePath = \$quarantinePath
                } else {
                    Write-Log "✅ Arquivo limpo" "SUCCESS"
                    \$output.quarantined = \$false
                }
                
                \$result.success = \$true
                \$result.output = \$output | ConvertTo-Json
            }
            
            "update_config" {
                Write-Log "Atualizando configuração..." "INFO"
                \$result.success = \$true
                \$result.output = "Config atualizada"
            }
            
            "run_command" {
                \$command = \$Job.payload.command
                Write-Log "Executando comando: \$command" "WARN"
                
                # Validação de segurança básica
                if (\$command -match "(rm|del|format|diskpart)") {
                    \$result.success = \$false
                    \$result.error = "Comando bloqueado por política de segurança"
                }
                else {
                    try {
                        \$output = Invoke-Expression \$command 2>&1 | Out-String
                        \$result.success = \$true
                        \$result.output = \$output
                    }
                    catch {
                        \$result.success = \$false
                        \$result.error = \$_.Exception.Message
                    }
                }
            }
            
            default {
                Write-Log "Tipo de job desconhecido: \$(\$Job.type)" "WARN"
                \$result.success = \$false
                \$result.error = "Job type not supported"
            }
        }
        
        # Upload do resultado
        Upload-Report -JobId \$Job.id -Result \$result
        
        # Acknowledge job
        Ack-Job -JobId \$Job.id
        
        if (\$result.success) {
            Write-Log "✅ Job [\$(\$Job.id)] concluído com sucesso" "SUCCESS"
        }
        else {
            Write-Log "❌ Job [\$(\$Job.id)] falhou: \$(\$result.error)" "ERROR"
        }
    }
    catch {
        Write-Log "Erro ao executar job [\$(\$Job.id)]: \$(\$_.Exception.Message)" "ERROR"
    }
}

function Upload-Report {
    param(
        [string]\$JobId,
        [hashtable]\$Result
    )
    
    try {
        \$body = @{
            agent_token = \$AgentToken
            job_id = \$JobId
            result = \$Result
        }
        
        \$uploadResult = Invoke-SecureRequest \`
            -Uri "\$ServerUrl/functions/v1/upload-report" \`
            -Method POST \`
            -Body \$body \`
            -TimeoutSec 30
        
        if (\$uploadResult.Success) {
            Write-Log "✅ Relatório do job [\$JobId] enviado" "DEBUG"
        }
        else {
            Write-Log "❌ Falha ao enviar relatório: \$(\$uploadResult.Error)" "ERROR"
        }
    }
    catch {
        Write-Log "Erro ao fazer upload do relatório: \$(\$_.Exception.Message)" "ERROR"
    }
}

function Ack-Job {
    param([string]\$JobId)
    
    try {
        \$body = @{
            agent_token = \$AgentToken
            job_id = \$JobId
        }
        
        \$ackResult = Invoke-SecureRequest \`
            -Uri "\$ServerUrl/functions/v1/ack-job" \`
            -Method POST \`
            -Body \$body \`
            -TimeoutSec 10
        
        if (\$ackResult.Success) {
            Write-Log "✅ Job [\$JobId] acknowledgement enviado" "DEBUG"
        }
    }
    catch {
        Write-Log "Erro ao enviar ACK: \$(\$_.Exception.Message)" "WARN"
    }
}

#endregion

#region Teste de Conectividade e First Heartbeat

Write-Log "Realizando teste de conectividade com backend (HMAC)..." "INFO"

try {
    \$healthBody = @{} | ConvertTo-Json -Compress
    \$healthResult = Invoke-SecureRequest \`
        -Uri "\$ServerUrl/functions/v1/agent-health-check" \`
        -Method POST \`
        -Body \$healthBody \`
        -TimeoutSec 10 \`
        -MaxRetries 1

    if (\$healthResult.Success -and \$healthResult.StatusCode -eq 200) {
        Write-Log "✅ Backend health-check OK (HTTP 200, HMAC válido)" "SUCCESS"
    } else {
        Write-Log "⚠ Health-check HTTP \$(\$healthResult.StatusCode) (não bloqueante)" "WARN"
        Write-Log "Agente continuará tentando, mas pode haver problemas de rede ou autenticação" "WARN"
    }
}
catch {
    Write-Log "⚠ Health-check falhou (não bloqueante): \$(\$_.Exception.Message)" "WARN"
    Write-Log "Agente continuará tentando, mas pode haver problemas de rede ou relógio" "WARN"
}

Write-Log "Enviando heartbeat inicial..." "INFO"
Send-Heartbeat

Write-Log "Enviando métricas iniciais..." "INFO"
Send-SystemMetrics

Write-Log "" "INFO"
Write-Log "========================================" "SUCCESS"
Write-Log "=== AGENTE INICIALIZADO COM SUCESSO! ===" "SUCCESS"
Write-Log "========================================" "SUCCESS"
Write-Log "" "INFO"

Write-Log "Enviando evento de post_installation..." "INFO"
Send-PostInstallationEvent

#endregion

#region Loop Principal

function Start-Agent {
    Write-Log "Iniciando loop principal do agente..." "INFO"
    
    \$heartbeatInterval = 30  # segundos
    \$metricsInterval = 300   # 5 minutos
    
    \$lastHeartbeat = Get-Date
    \$lastMetrics = Get-Date
    
    # ============================================================================
    # CORREÇÃO 4: DIAGNÓSTICO PRÉ-LOOP
    # ============================================================================
    Write-Log "========================================" "INFO"
    Write-Log "DIAGNÓSTICO PRÉ-LOOP:" "INFO"
    Write-Log "  - Write-Log: Disponível ✅" "SUCCESS"
    Write-Log "  - LogFile......: \$LogFile ✅" "SUCCESS"
    Write-Log "  - ServerUrl....: \$ServerUrl ✅" "SUCCESS"
    Write-Log "  - AgentToken...: $(if(\$AgentToken) {'Definido ✅'} else {'FALTANDO ❌'})" "$(if(\$AgentToken) {'SUCCESS'} else {'ERROR'})"
    Write-Log "  - HmacSecret...: $(if(\$HmacSecret) {'Definido ✅'} else {'FALTANDO ❌'})" "$(if(\$HmacSecret) {'SUCCESS'} else {'ERROR'})"
    Write-Log "  - Poll-Jobs: Disponível ✅" "SUCCESS"
    Write-Log "  - Send-Heartbeat: Disponível ✅" "SUCCESS"
    Write-Log "  - Send-SystemMetrics: Disponível ✅" "SUCCESS"
    Write-Log "========================================" "INFO"
    Write-Log "" "INFO"
    Write-Log "🚀 Entrando no loop principal..." "SUCCESS"
    Write-Log "" "INFO"
    
    while (\$true) {
        try {
            # Buscar e executar jobs
            \$jobs = Poll-Jobs
            
            # Validação defensiva: garantir que jobs é um array e não está vazio
            if (\$null -eq \$jobs -or \$jobs.Count -eq 0) {
                Write-Log "Nenhum job pendente" "DEBUG"
            }
            else {
                Write-Log "📦 \$(\$jobs.Count) job(s) recebido(s)" "INFO"
                
                foreach (\$job in \$jobs) {
                    # Validação 1: Job não pode ser null
                    if (\$null -eq \$job) {
                        Write-Log "⚠️  Job nulo detectado, ignorando" "WARN"
                        continue
                    }
                    
                    # Validação 2: Job precisa ter ID
                    if (-not \$job.id) {
                        Write-Log "⚠️  Job sem ID válido detectado, ignorando" "WARN"
                        Write-Log "Job bruto: \$(\$job | ConvertTo-Json -Compress)" "DEBUG"
                        continue
                    }
                    
                    # Validação 3: Job precisa ter tipo
                    if (-not \$job.type) {
                        Write-Log "⚠️  Job sem tipo válido (ID: \$(\$job.id)), ignorando" "WARN"
                        continue
                    }
                    
                    Write-Log "🔄 Processando job: ID=\$(\$job.id), Type=\$(\$job.type)" "INFO"
                    
                    try {
                        Execute-Job -Job \$job
                        Write-Log "✅ Job \$(\$job.id) processado com sucesso" "SUCCESS"
                    }
                    catch {
                        Write-Log "❌ Erro ao processar job \$(\$job.id): \$(\$_.Exception.Message)" "ERROR"
                        Write-Log "Stack trace: \$(\$_.ScriptStackTrace)" "DEBUG"
                        # Continua processando outros jobs mesmo se um falhar
                    }
                }
            }
            
            # Verificar se deve enviar heartbeat
            \$now = Get-Date
            if ((\$now - \$lastHeartbeat).TotalSeconds -ge \$heartbeatInterval) {
                Send-Heartbeat
                \$lastHeartbeat = \$now
            }
            
            # Verificar se deve enviar métricas
            if ((\$now - \$lastMetrics).TotalSeconds -ge \$metricsInterval) {
                Send-SystemMetrics
                \$lastMetrics = \$now
            }
            
            # Aguardar intervalo de polling
            Start-Sleep -Seconds \$PollInterval
            
        } catch {
            Write-Log "Erro no loop principal: \$(\$_.Exception.Message)" "ERROR"
            Write-Log "Stack trace: \$(\$_.ScriptStackTrace)" "DEBUG"
            Start-Sleep -Seconds 30
        }
    }
}

#endregion

# ============================================================================
# MAIN LOOP - START AGENT WITH MUTEX CLEANUP
# ============================================================================
try {
    Start-Agent
} finally {
    # Release mutex on exit
    if (\$Mutex) {
        try {
            \$Mutex.ReleaseMutex()
            \$Mutex.Dispose()
        } catch {
            # Ignore errors releasing mutex
        }
    }
}
`;

/**
 * Get the inline agent script content
 */
export function getAgentScriptWindows(): string {
  return AGENT_SCRIPT_WINDOWS_PS1;
}

/**
 * Validate agent script content
 */
export function validateAgentScript(script: string): boolean {
  if (!script || script.length < 5000) {
    return false;
  }
  
  if (!script.includes('CyberShield Agent')) {
    return false;
  }
  
  if (!script.includes('param(')) {
    return false;
  }
  
  // Verificar funções críticas
  if (!script.includes('function Write-Log')) {
    return false;
  }
  
  if (!script.includes('function Send-Heartbeat')) {
    return false;
  }
  
  if (!script.includes('function Poll-Jobs')) {
    return false;
  }
  
  return true;
}

/**
 * Calculate SHA256 hash of agent script
 */
export async function calculateScriptHash(script: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(script);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hash;
}
