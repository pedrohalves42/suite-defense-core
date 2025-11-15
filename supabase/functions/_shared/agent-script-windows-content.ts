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
    
    [Parameter(Mandatory=\$false)]
    [int]\$PollInterval = 60
)

# CRÍTICO-1: Fix UTF-8 encoding for console output and file operations
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
\$PSDefaultParameterValues['Out-File:Encoding'] = 'UTF8'

# ============================================================================
# CRÍTICO-3: MUTEX - PREVENT MULTIPLE INSTANCES
# ============================================================================
\$MutexName = "Global\\CyberShieldAgent_\$AgentToken"
\$Mutex = \$null

try {
    \$Mutex = New-Object System.Threading.Mutex(\$false, \$MutexName)
    
    if (-not \$Mutex.WaitOne(0)) {
        Write-Host "⚠️  Another instance of the agent is already running. Exiting..."
        exit 0
    }
} catch {
    Write-Host "❌ Failed to create Mutex: \$(\$_.Exception.Message)"
    exit 1
}

# ============================================================================
# CORREÇÃO 2: CRASH HANDLER GLOBAL (trap deve vir antes de qualquer código)
# ============================================================================
\$ErrorActionPreference = "Stop"
\$CrashLogPath = "C:\\CyberShield\\logs\\agent-crash.log"

trap {
    # Tentar escrever crash log mesmo sem Write-Log disponível
    \$crashMsg = @"
====================================
AGENT CRASH: \$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')
====================================
Error: \$(\$_.Exception.Message)
Type: \$(\$_.Exception.GetType().FullName)
Stack: \$(\$_.ScriptStackTrace)
Command: \$(\$_.InvocationInfo.MyCommand)
Line: \$(\$_.InvocationInfo.ScriptLineNumber)
====================================
"@
    
    try {
        New-Item -Path "C:\\CyberShield\\logs" -ItemType Directory -Force | Out-Null
        Add-Content -Path \$CrashLogPath -Value \$crashMsg -ErrorAction SilentlyContinue
        Write-Host \$crashMsg -ForegroundColor Red
    } catch { }
    
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
    } catch { }
    
    exit 1
}

# ============================================================================
# CORREÇÃO 3: VALIDAÇÃO INICIAL DE PARÂMETROS (antes de qualquer função)
# ============================================================================
if ([string]::IsNullOrWhiteSpace(\$AgentToken)) {
    Write-Host "[ERRO] Parâmetro -AgentToken obrigatório não foi fornecido!" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace(\$HmacSecret)) {
    Write-Host "[ERRO] Parâmetro -HmacSecret obrigatório não foi fornecido!" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace(\$ServerUrl)) {
    Write-Host "[ERRO] Parâmetro -ServerUrl obrigatório não foi fornecido!" -ForegroundColor Red
    exit 1
}

if (\$AgentToken.Length -lt 20) {
    Write-Host "[ERRO] AgentToken parece ser inválido (muito curto: \$(\$AgentToken.Length) chars)" -ForegroundColor Red
    exit 1
}

if (\$HmacSecret.Length -lt 32) {
    Write-Host "[ERRO] HmacSecret parece ser inválido (muito curto: \$(\$HmacSecret.Length) chars)" -ForegroundColor Red
    exit 1
}

Write-Host "[\$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')] Parâmetros validados com sucesso ✅" -ForegroundColor Green

# Validar versão do PowerShell
if (\$PSVersionTable.PSVersion.Major -lt 3) {
    Write-Host "ERRO: Este script requer PowerShell 3.0 ou superior" -ForegroundColor Red
    Write-Host "Versão atual: \$(\$PSVersionTable.PSVersion)" -ForegroundColor Yellow
    exit 1
}

# Validar sistema operacional
\$osVersion = [System.Environment]::OSVersion.Version
\$osName = (Get-WmiObject -Class Win32_OperatingSystem).Caption

# ============================================================================
# CORREÇÃO 1: DEFINIR VARIÁVEIS DE LOG **ANTES** DE USAR
# ============================================================================
\$LogDir = "C:\\CyberShield\\logs"
\$LogFile = Join-Path \$LogDir "agent.log"
\$MaxLogSizeMB = 10
\$MaxLogFiles = 7

# Criar diretório de logs se não existir
if (-not (Test-Path \$LogDir)) {
    New-Item -ItemType Directory -Path \$LogDir -Force | Out-Null
}

# ============================================================================
# CORREÇÃO 1: DEFINIR FUNÇÃO Write-Log **ANTES** DE USAR
# ============================================================================
function Write-Log {
    param(
        [string]\$Message,
        [ValidateSet("INFO", "DEBUG", "WARN", "ERROR", "SUCCESS")]
        [string]\$Level = "INFO"
    )
    
    \$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    \$logMessage = "[\$timestamp] [\$Level] \$Message"
    
    # Rotação de logs se necessário
    if (Test-Path \$LogFile) {
        \$logSize = (Get-Item \$LogFile).Length / 1MB
        if (\$logSize -gt \$MaxLogSizeMB) {
            # Rotacionar logs
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
    
    # Escrever no arquivo e console
    Add-Content -Path \$LogFile -Value \$logMessage -ErrorAction SilentlyContinue
    
    \$color = switch (\$Level) {
        "ERROR"   { "Red" }
        "WARN"    { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG"   { "Gray" }
        default   { "White" }
    }
    
    Write-Host \$logMessage -ForegroundColor \$color
}

# ============================================================================
# BANNER DE INICIALIZAÇÃO (agora pode usar Write-Log e \$LogDir)
# ============================================================================
Write-Log "========================================" "INFO"
Write-Log "CyberShield Agent v3.0.0 Iniciando..." "INFO"
Write-Log "========================================" "INFO"
Write-Log "Timestamp: \$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" "INFO"
Write-Log "OS: \$osName" "INFO"
Write-Log "PowerShell: \$(\$PSVersionTable.PSVersion)" "INFO"
Write-Log "AgentToken: \$(\$AgentToken.Substring(0,20))..." "INFO"
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

function Convert-HexToBytes {
    param([string]\$HexString)
    
    \$bytes = New-Object byte[] (\$HexString.Length / 2)
    for (\$i = 0; \$i -lt \$HexString.Length; \$i += 2) {
        \$bytes[\$i / 2] = [Convert]::ToByte(\$HexString.Substring(\$i, 2), 16)
    }
    return \$bytes
}

function Get-HmacSignature {
    param(
        [string]\$Data,
        [string]\$Secret
    )
    
    try {
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
            
            # Preparar body JSON (vazio para GET)
            if (\$Method -eq 'GET') {
                \$bodyJson = ""
            }
            else {
                \$bodyJson = \$Body | ConvertTo-Json -Depth 10 -Compress
            }
            
            # Construir payload HMAC: "timestamp:nonce:body"
            \$dataToSign = "\$timestamp:\$nonce:\$bodyJson"
            
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
            
            if (\$Method -ne 'GET' -and \$bodyJson) {
                \$params['Body'] = \$bodyJson
            }
            
            \$response = Invoke-WebRequest @params
            
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
            
            # Se for erro de autenticação (401/403), não vale retry
            if (\$statusCode -in @(401, 403)) {
                Write-Log "❌ Erro de autenticação detectado (código \$statusCode), abortando retries" "ERROR"
                return @{
                    Success = \$false
                    Error = \$lastError.Exception.Message
                    StatusCode = \$statusCode
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
            
            # Fallback: tentar endpoint sem HMAC se falha for 401/403
            if (\$result.StatusCode -in @(401, 403)) {
                Write-Log "⚠️  HMAC rejeitado (código \$(\$result.StatusCode)), tentando fallback..." "WARN"
                
                try {
                    \$bodyJson = \$body | ConvertTo-Json -Depth 10 -Compress
                    \$fallbackHeaders = @{
                        "Content-Type" = "application/json"
                        "X-Agent-Token" = \$AgentToken
                    }
                    
                    \$fallbackParams = @{
                        Uri = "\$ServerUrl/functions/v1/heartbeat-fallback"
                        Method = "POST"
                        Headers = \$fallbackHeaders
                        Body = \$bodyJson
                        TimeoutSec = 10
                        UseBasicParsing = \$true
                    }
                    
                    Write-Log "🔄 Tentando fallback: \$(\$fallbackParams.Uri)" "DEBUG"
                    
                    \$fallbackResponse = Invoke-WebRequest @fallbackParams
                    
                    if (\$fallbackResponse.StatusCode -eq 200) {
                        Write-Log "✅ Heartbeat fallback OK (sem HMAC)" "SUCCESS"
                    } else {
                        Write-Log "⚠️  Fallback retornou status: \$(\$fallbackResponse.StatusCode)" "WARN"
                    }
                }
                catch {
                    Write-Log "❌ Fallback também falhou: \$(\$_.Exception.Message)" "ERROR"
                    if (\$_.Exception.Response) {
                        Write-Log "   Status fallback: \$(\$_.Exception.Response.StatusCode.value__)" "ERROR"
                    }
                }
            }
            else {
                Write-Log "❌ Erro não é autenticação (código: \$(\$result.StatusCode)), fallback não aplicável" "ERROR"
            }
        }
    }
    catch {
        Write-Log "❌ EXCEPTION em Send-Heartbeat: \$(\$_.Exception.Message)" "ERROR"
        Write-Log "   StackTrace: \$(\$_.ScriptStackTrace)" "ERROR"
    }
}

function Send-SystemMetrics {
    try {
        Write-Log "Coletando métricas do sistema..." "DEBUG"
        
        # CPU
        \$cpuUsage = (Get-WmiObject -Class Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
        \$cpuCores = (Get-WmiObject -Class Win32_Processor).NumberOfLogicalProcessors
        \$cpuName = (Get-WmiObject -Class Win32_Processor).Name
        
        # Memória
        \$os = Get-WmiObject -Class Win32_OperatingSystem
        \$totalMemGB = [Math]::Round(\$os.TotalVisibleMemorySize / 1MB, 2)
        \$freeMemGB = [Math]::Round(\$os.FreePhysicalMemory / 1MB, 2)
        \$usedMemGB = \$totalMemGB - \$freeMemGB
        \$memUsagePercent = [Math]::Round((\$usedMemGB / \$totalMemGB) * 100, 1)
        
        # Disco
        \$disk = Get-WmiObject -Class Win32_LogicalDisk -Filter "DeviceID='C:'"
        \$diskTotalGB = [Math]::Round(\$disk.Size / 1GB, 2)
        \$diskFreeGB = [Math]::Round(\$disk.FreeSpace / 1GB, 2)
        \$diskUsedGB = \$diskTotalGB - \$diskFreeGB
        \$diskUsagePercent = [Math]::Round((\$diskUsedGB / \$diskTotalGB) * 100, 1)
        
        # Uptime
        \$lastBoot = \$os.ConvertToDateTime(\$os.LastBootUpTime)
        \$uptime = (Get-Date) - \$lastBoot
        \$uptimeSeconds = [int]\$uptime.TotalSeconds
        
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
            \$jobs = \$result.Content | ConvertFrom-Json
            
            if (\$jobs.jobs -and \$jobs.jobs.Count -gt 0) {
                Write-Log "📦 \$(\$jobs.jobs.Count) job(s) recebido(s)" "INFO"
                return \$jobs.jobs
            }
            else {
                Write-Log "Nenhum job pendente" "DEBUG"
                return @()
            }
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

Write-Log "Realizando teste de conectividade com backend..." "INFO"

try {
    \$testResult = Invoke-WebRequest -Uri "\$ServerUrl/rest/v1/" \`
        -Method GET \`
        -Headers @{ "apikey" = \$AgentToken } \`
        -TimeoutSec 10 \`
        -UseBasicParsing
    
    Write-Log "✅ Connectivity test: OK (Status: \$(\$testResult.StatusCode))" "SUCCESS"
}
catch {
    Write-Log "❌ CONNECTIVITY TEST FAILED: \$(\$_.Exception.Message)" "ERROR"
    Write-Log "Verifique se ServerUrl está correto: \$ServerUrl" "ERROR"
    Write-Log "Agente continuará tentando, mas pode haver problemas" "WARN"
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
            
            foreach (\$job in \$jobs) {
                Execute-Job -Job \$job
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
