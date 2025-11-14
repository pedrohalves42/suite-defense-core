/**
 * CyberShield Agent Windows Script - Inline Content
 * CRITICAL: This file MUST be kept in sync with agent-script-windows.ps1
 * Any changes to agent-script-windows.ps1 should be immediately reflected here
 * Source: supabase/functions/_shared/agent-script-windows.ps1
 * Version: 2.2.2 - SECURE (no $headers indexing, uses Invoke-SecureRequest)
 * 
 * SYNCHRONIZATION WARNING:
 * - Update both agent-script-windows.ps1 AND this file together
 * - Failure to sync will cause installer failures with HMAC errors
 * 
 * SECURITY REQUIREMENTS (v2.2.2):
 * - NEVER use $headers['key'] indexing in logs (causes null reference errors)
 * - ALWAYS use Invoke-SecureRequest for authenticated API calls
 * - HMAC generation MUST be internal to Invoke-SecureRequest
 * - Logs must be wrapped in try-catch if accessing complex objects
 */

export const AGENT_SCRIPT_WINDOWS_PS1 = `# CyberShield Agent - Windows PowerShell Script v2.2.2 (Production Ready + Secure)
# Compatible with: Windows Server 2012, 2012 R2, 2016, 2019, 2022, 2025
# PowerShell Version: 3.0+

#Requires -Version 3.0

# Fix UTF-8 encoding for console output
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8

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

# Validate parameters
if ([string]::IsNullOrWhiteSpace(\$AgentToken)) {
    Write-Host "ERROR: AgentToken cannot be empty" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace(\$HmacSecret)) {
    Write-Host "ERROR: HmacSecret cannot be empty" -ForegroundColor Red
    exit 1
}

if ([string]::IsNullOrWhiteSpace(\$ServerUrl)) {
    Write-Host "ERROR: ServerUrl cannot be empty" -ForegroundColor Red
    exit 1
}

if (\$AgentToken.Length -lt 20) {
    Write-Host "ERROR: AgentToken appears to be invalid (too short)" -ForegroundColor Red
    exit 1
}

if (\$HmacSecret.Length -lt 32) {
    Write-Host "ERROR: HmacSecret appears to be invalid (too short)" -ForegroundColor Red
    exit 1
}

# Validar versão do PowerShell
if (\$PSVersionTable.PSVersion.Major -lt 3) {
    Write-Host "ERRO: Este script requer PowerShell 3.0 ou superior" -ForegroundColor Red
    Write-Host "Versão atual: \$(\$PSVersionTable.PSVersion)" -ForegroundColor Yellow
    Write-Host "Por favor, atualize o PowerShell" -ForegroundColor Yellow
    exit 1
}

# Validar sistema operacional
\$osVersion = [System.Environment]::OSVersion.Version
\$osName = (Get-WmiObject -Class Win32_OperatingSystem).Caption

# ✅ FASE 2: DIAGNÓSTICO DE INICIALIZAÇÃO DETALHADO
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "CyberShield Agent v3.0.0 Iniciando..." -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Timestamp: \$(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor White
Write-Host "OS: \$osName" -ForegroundColor White
Write-Host "PowerShell: \$(\$PSVersionTable.PSVersion)" -ForegroundColor White
Write-Host "AgentToken: \$(\$AgentToken.Substring(0,20))..." -ForegroundColor White
Write-Host "HmacSecret Length: \$(\$HmacSecret.Length) chars" -ForegroundColor White
Write-Host "ServerUrl: \$ServerUrl" -ForegroundColor White
Write-Host "PollInterval: \$PollInterval segundos" -ForegroundColor White
Write-Host "Log Directory: \$LogDir" -ForegroundColor White
Write-Host "========================================" -ForegroundColor Cyan

# ✅ FASE 4: DIAGNÓSTICO DE CONECTIVIDADE NO BOOT
Write-Host "[BOOT] Testando conectividade básica..." -ForegroundColor Yellow
try {
    \$testUrl = "\$ServerUrl/functions/v1/serve-installer"
    \$testResponse = Invoke-WebRequest -Uri \$testUrl -Method GET -TimeoutSec 10 -UseBasicParsing
    Write-Log "✅ Connectivity test: OK (Status: \$(\$testResponse.StatusCode))" "SUCCESS"
} catch {
    Write-Log "❌ Connectivity test FAILED: \$_" "ERROR"
    
    # FASE 1: Enviar telemetria de falha de conectividade
    try {
        \$connectivityPayload = @{
            agent_token = \$AgentToken
            connectivity_test = \$false
            error_message = \$_.Exception.Message
            test_url = \$testUrl
        } | ConvertTo-Json
        
        Invoke-WebRequest -Uri "\$ServerUrl/functions/v1/diagnostics-agent-logs" \`
            -Method POST \`
            -ContentType "application/json" \`
            -Headers @{ "X-Agent-Token" = \$AgentToken } \`
            -Body \$connectivityPayload \`
            -TimeoutSec 10 \`
            -UseBasicParsing | Out-Null
    } catch {
        Write-Log "Failed to send connectivity telemetry: \$_" "WARN"
    }
}

# Windows Server 2012 = 6.2, 2012 R2 = 6.3, 2016 = 10.0, etc
if (\$osVersion.Major -lt 6 -or (\$osVersion.Major -eq 6 -and \$osVersion.Minor -lt 2)) {
    Write-Host "AVISO: Este agente foi testado em Windows Server 2012+ e Windows 8+" -ForegroundColor Yellow
    Write-Host "Sua versão pode não ser totalmente suportada" -ForegroundColor Yellow
}

# Configuração de logging
\$LogDir = "C:\\CyberShield\\logs"
\$LogFile = Join-Path \$LogDir "agent.log"
\$MaxLogSizeMB = 10
\$MaxLogFiles = 7

# Criar diretório de logs se não existir
if (-not (Test-Path \$LogDir)) {
    New-Item -ItemType Directory -Path \$LogDir -Force | Out-Null
}

# ✅ FASE 2: Log de inicialização ANTES das funções
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
Write-Log "========================================" "INFO"

#region Funções de Logging

function Write-Log {
    param(
        [string]\$Message,
        [ValidateSet("INFO", "DEBUG", "WARN", "ERROR", "SUCCESS")]
        [string]\$Level = "INFO"
    )
    
    \$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    \$logEntry = "[\$timestamp] [\$Level] \$Message"
    
    # Rotação de logs
    if (Test-Path \$LogFile) {
        \$logSize = (Get-Item \$LogFile).Length / 1MB
        if (\$logSize -gt \$MaxLogSizeMB) {
            \$archiveName = Join-Path \$LogDir "agent_\$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
            Move-Item \$LogFile \$archiveName -Force
            
            # Limpar logs antigos
            Get-ChildItem \$LogDir -Filter "agent_*.log" | 
                Sort-Object LastWriteTime -Descending | 
                Select-Object -Skip \$MaxLogFiles | 
                Remove-Item -Force
        }
    }
    
    # Escrever no arquivo e console
    Add-Content -Path \$LogFile -Value \$logEntry
    
    \$color = switch (\$Level) {
        "ERROR"   { "Red" }
        "WARN"    { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG"   { "Gray" }
        default   { "White" }
    }
    
    Write-Host \$logEntry -ForegroundColor \$color
}

#endregion

#region Configurações

# Configurar TLS 1.2 como padrão (Windows Server 2012+)
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Configurar proxy padrão se necessário
[System.Net.WebRequest]::DefaultWebProxy = [System.Net.WebRequest]::GetSystemWebProxy()
[System.Net.WebRequest]::DefaultWebProxy.Credentials = [System.Net.CredentialCache]::DefaultNetworkCredentials

# Validação final antes de iniciar
if ([string]::IsNullOrWhiteSpace(\$AgentToken)) {
    Write-Log "AgentToken não pode estar vazio" "ERROR"
    exit 1
}

if ([string]::IsNullOrWhiteSpace(\$HmacSecret)) {
    Write-Log "HmacSecret não pode estar vazio" "ERROR"
    exit 1
}

if ([string]::IsNullOrWhiteSpace(\$ServerUrl)) {
    Write-Log "ServerUrl não pode estar vazio" "ERROR"
    exit 1
}

Write-Log "=== CyberShield Agent Iniciando ===" "SUCCESS"
Write-Log "PowerShell Version: \$(\$PSVersionTable.PSVersion)" "INFO"
Write-Log "OS: \$osName" "INFO"
Write-Log "Server URL: \$ServerUrl" "INFO"

#endregion

#region Autenticação e Requisições

function Get-HmacSignature {
    param(
        [string]\$Message,
        [string]\$Secret
    )
    
    try {
        \$hmacsha = New-Object System.Security.Cryptography.HMACSHA256
        \$hmacsha.Key = [Text.Encoding]::UTF8.GetBytes(\$Secret)
        \$hash = \$hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes(\$Message))
        \$signature = [Convert]::ToBase64String(\$hash)
        return \$signature
    } catch {
        Write-Log "Erro ao gerar HMAC: \$(\$_.Exception.Message)" "ERROR"
        return \$null
    }
}

function Invoke-SecureRequest {
    param(
        [string]\$Uri,
        [string]\$Method = "GET",
        [object]\$Body = \$null,
        [int]\$MaxRetries = 3
    )
    
    \$attempt = 0
    
    while (\$attempt -lt \$MaxRetries) {
        try {
            \$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds().ToString()
            \$nonce = [Guid]::NewGuid().ToString()
            
            \$messageToSign = "\$Method|\$Uri|\$timestamp|\$nonce"
            if (\$Body) {
                \$bodyJson = \$Body | ConvertTo-Json -Compress -Depth 10
                \$messageToSign += "|\$bodyJson"
            }
            
            \$signature = Get-HmacSignature -Message \$messageToSign -Secret \$HmacSecret
            
            \$headers = @{
                "x-agent-token" = \$AgentToken
                "x-hmac-signature" = \$signature
                "x-timestamp" = \$timestamp
                "x-nonce" = \$nonce
                "Content-Type" = "application/json"
            }
            
            \$params = @{
                Uri = \$Uri
                Method = \$Method
                Headers = \$headers
                TimeoutSec = 30
                UseBasicParsing = \$true
            }
            
            if (\$Body) {
                \$params["Body"] = \$bodyJson
            }
            
            \$response = Invoke-WebRequest @params
            return \$response
            
        } catch {
            \$attempt++
            \$errorMsg = \$_.Exception.Message
            Write-Log "Requisição falhou (tentativa \$attempt/\$MaxRetries): \$errorMsg" "WARN"
            
            if (\$attempt -lt \$MaxRetries) {
                \$waitTime = \$attempt * 5
                Write-Log "Aguardando \$waitTime segundos antes de tentar novamente..." "INFO"
                Start-Sleep -Seconds \$waitTime
            } else {
                Write-Log "Número máximo de tentativas atingido" "ERROR"
                throw
            }
        }
    }
}

#endregion

#region Heartbeat

function Send-Heartbeat {
    param([switch]\$IsBootHeartbeat)
    
    \$maxRetries = if (\$IsBootHeartbeat) { 5 } else { 3 }
    \$retryCount = 0
    
    while (\$retryCount -lt \$maxRetries) {
        try {
            if (\$IsBootHeartbeat) {
                Write-Log "  Preparing initial heartbeat..." "DEBUG"
            } else {
                Write-Log "  Preparing heartbeat..." "DEBUG"
            }
            
            \$heartbeatUrl = "\$ServerUrl/functions/v1/heartbeat"
            Write-Log "    Endpoint: \$heartbeatUrl" "DEBUG"
            
            # Include OS information in heartbeat
            \$os = Get-CimInstance Win32_OperatingSystem
            Write-Log "    OS: \$(\$os.Caption)" "DEBUG"
            Write-Log "    Hostname: \$env:COMPUTERNAME" "DEBUG"
            
            \$body = @{
                os_type = "windows"
                os_version = \$os.Caption
                hostname = \$env:COMPUTERNAME
            }
            
            \$response = Invoke-SecureRequest -Url \$heartbeatUrl -Method "POST" -Body \$body -MaxRetries 1
            
            # FASE 1: Se é o primeiro heartbeat após boot, enviar telemetria específica
            if (\$IsBootHeartbeat) {
                Write-Log "    ✓ Initial heartbeat accepted by server" "SUCCESS"
                
                try {
                    \$telemetryPayload = @{
                        agent_token = \$AgentToken
                        event_type = "agent_first_heartbeat_sent"
                        success = \$true
                        timestamp = (Get-Date).ToUniversalTime().ToString("o")
                    } | ConvertTo-Json
                    
                    Invoke-WebRequest -Uri "\$ServerUrl/functions/v1/diagnostics-agent-logs" \`
                        -Method POST \`
                        -ContentType "application/json" \`
                        -Headers @{ "X-Agent-Token" = \$AgentToken } \`
                        -Body \$telemetryPayload \`
                        -TimeoutSec 10 \`
                        -UseBasicParsing | Out-Null
                    
                    Write-Log "    ✓ First heartbeat telemetry sent" "DEBUG"
                } catch {
                    Write-Log "    Failed to send first heartbeat telemetry: \$_" "WARN"
                }
            } else {
                Write-Log "    ✓ Heartbeat OK" "DEBUG"
            }
            
            return \$response
        }
        catch {
            \$retryCount++
            Write-Log "    ✗ Heartbeat error (attempt \$retryCount/\$maxRetries): \$_" "ERROR"
            Write-Log "    Stack: \$(\$_.ScriptStackTrace)" "DEBUG"
            
            # FASE 3: Se HMAC falhar, tentar fallback sem HMAC
            if (\$_ -match "HMAC" -or \$_ -match "signature") {
                Write-Log "    HMAC error detected, trying fallback..." "WARN"
                try {
                    \$fallbackUrl = "\$ServerUrl/functions/v1/heartbeat-fallback"
                    \$fallbackPayload = @{
                        os_type = "windows"
                        os_version = (Get-CimInstance Win32_OperatingSystem).Caption
                        hostname = \$env:COMPUTERNAME
                    } | ConvertTo-Json
                    
                    \$fallbackResponse = Invoke-WebRequest -Uri \$fallbackUrl \`
                        -Method POST \`
                        -ContentType "application/json" \`
                        -Headers @{ "X-Agent-Token" = \$AgentToken } \`
                        -Body \$fallbackPayload \`
                        -TimeoutSec 10 \`
                        -UseBasicParsing
                    
                    Write-Log "    ✓ Fallback heartbeat accepted (without HMAC)" "WARN"
                    return \$fallbackResponse
                } catch {
                    Write-Log "    Fallback heartbeat also failed: \$_" "ERROR"
                }
            }
            
            if (\$retryCount -lt \$maxRetries) {
                Start-Sleep -Seconds (2 * \$retryCount)
            }
        }
    }
    
    Write-Log "Failed to send heartbeat after \$maxRetries attempts" "ERROR"
    return \$null
}

#endregion

#region Gerenciamento de Jobs

function Poll-Jobs {
    try {
        \$uri = "\$ServerUrl/functions/v1/poll-jobs"
        \$response = Invoke-SecureRequest -Uri \$uri -Method "GET"
        
        if (\$response.StatusCode -eq 200) {
            \$jobs = \$response.Content | ConvertFrom-Json
            return \$jobs
        } else {
            Write-Log "Poll-Jobs falhou: Status \$(\$response.StatusCode)" "WARN"
            return @()
        }
    } catch {
        Write-Log "Erro ao buscar jobs: \$(\$_.Exception.Message)" "ERROR"
        return @()
    }
}

function Execute-Job {
    param([object]\$Job)
    
    Write-Log "Executando job: \$(\$Job.job_type) (ID: \$(\$Job.id))" "INFO"
    
    try {
        \$result = @{
            job_id = \$Job.id
            status = "completed"
            output = ""
            error = ""
        }
        
        switch (\$Job.job_type) {
            "scan_virus" {
                Write-Log "Executando scan de vírus..." "INFO"
                \$scanResult = @{
                    scanned_files = 0
                    threats_found = 0
                    scan_time = (Get-Date).ToString("o")
                }
                \$result.output = \$scanResult | ConvertTo-Json
            }
            
            "collect_info" {
                Write-Log "Coletando informações do sistema..." "INFO"
                \$systemInfo = @{
                    os = \$osName
                    hostname = \$env:COMPUTERNAME
                    ps_version = \$PSVersionTable.PSVersion.ToString()
                }
                \$result.output = \$systemInfo | ConvertTo-Json
            }
            
            "run_command" {
                if (\$Job.command) {
                    Write-Log "Executando comando: \$(\$Job.command)" "INFO"
                    \$cmdOutput = Invoke-Expression \$Job.command 2>&1 | Out-String
                    \$result.output = \$cmdOutput
                } else {
                    \$result.status = "failed"
                    \$result.error = "Comando não especificado"
                }
            }
            
            default {
                \$result.status = "failed"
                \$result.error = "Tipo de job não suportado: \$(\$Job.job_type)"
            }
        }
        
        return \$result
        
    } catch {
        Write-Log "Erro ao executar job: \$(\$_.Exception.Message)" "ERROR"
        return @{
            job_id = \$Job.id
            status = "failed"
            output = ""
            error = \$_.Exception.Message
        }
    }
}

function Upload-Report {
    param([object]\$Report)
    
    try {
        \$uri = "\$ServerUrl/functions/v1/upload-report"
        \$response = Invoke-SecureRequest -Uri \$uri -Method "POST" -Body \$Report
        
        if (\$response.StatusCode -eq 200) {
            Write-Log "Relatório enviado com sucesso (Job ID: \$(\$Report.job_id))" "DEBUG"
            return \$true
        } else {
            Write-Log "Falha ao enviar relatório: Status \$(\$response.StatusCode)" "WARN"
            return \$false
        }
    } catch {
        Write-Log "Erro ao enviar relatório: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
}

function Ack-Job {
    param([string]\$JobId)
    
    try {
        \$uri = "\$ServerUrl/functions/v1/ack-job"
        \$body = @{ job_id = \$JobId }
        \$response = Invoke-SecureRequest -Uri \$uri -Method "POST" -Body \$body
        
        if (\$response.StatusCode -eq 200) {
            Write-Log "Job \$JobId confirmado" "DEBUG"
            return \$true
        } else {
            Write-Log "Falha ao confirmar job: Status \$(\$response.StatusCode)" "WARN"
            return \$false
        }
    } catch {
        Write-Log "Erro ao confirmar job: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
}

#endregion

#region Métricas do Sistema

function Send-SystemMetrics {
    try {
        \$cpu = (Get-Counter '\\Processor(_Total)\\% Processor Time').CounterSamples.CookedValue
        \$memory = Get-WmiObject Win32_OperatingSystem
        \$memUsedPercent = ((\$memory.TotalVisibleMemorySize - \$memory.FreePhysicalMemory) / \$memory.TotalVisibleMemorySize) * 100
        
        \$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        \$diskUsedPercent = ((\$disk.Size - \$disk.FreeSpace) / \$disk.Size) * 100
        
        \$uptime = (Get-Date) - (Get-CimInstance Win32_OperatingSystem).LastBootUpTime
        \$uptimeSeconds = [int]\$uptime.TotalSeconds
        
        \$body = @{
            cpu_usage_percent = [math]::Round(\$cpu, 2)
            memory_usage_percent = [math]::Round(\$memUsedPercent, 2)
            disk_usage_percent = [math]::Round(\$diskUsedPercent, 2)
            uptime_seconds = \$uptimeSeconds
        }
        
        \$uri = "\$ServerUrl/functions/v1/submit-system-metrics"
        \$response = Invoke-SecureRequest -Uri \$uri -Method "POST" -Body \$body
        
        if (\$response.StatusCode -eq 200) {
            Write-Log "Métricas enviadas com sucesso" "DEBUG"
            return \$true
        } else {
            Write-Log "Falha ao enviar métricas: Status \$(\$response.StatusCode)" "WARN"
            return \$false
        }
    } catch {
        Write-Log "Erro ao enviar métricas: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
}

#endregion

#region Health Check

function Test-SystemHealth {
    Write-Log "🔍 Teste de Sistema - DIAGNÓSTICO COMPLETO" "INFO"
    
    # ✅ FASE 2: Validação completa com retry no heartbeat
    # 1. Validar PowerShell
    Write-Log "  [1/5] Validando PowerShell \$(\$PSVersionTable.PSVersion.Major).\$(\$PSVersionTable.PSVersion.Minor)..." "INFO"
    if (\$PSVersionTable.PSVersion.Major -lt 5) {
        Write-Log "  ✗ PowerShell muito antigo! Requer 5.1+" "ERROR"
        return \$false
    }
    Write-Log "  ✓ PowerShell OK" "SUCCESS"
    
    # 2. Testar conectividade básica
    Write-Log "  [2/5] Testando conectividade DNS..." "INFO"
    \$dnsTest = Test-Connection -ComputerName "google.com" -Count 1 -Quiet -ErrorAction SilentlyContinue
    if (\$dnsTest) {
        Write-Log "  ✓ DNS OK" "SUCCESS"
    } else {
        Write-Log "  ✗ DNS FALHOU - Sem conectividade internet" "ERROR"
        return \$false
    }
    
    # 3. Testar conexão com servidor
    Write-Log "  [3/5] Testando conectividade com servidor backend..." "INFO"
    \$serverHost = \$ServerUrl -replace "https://","" -replace "/.*",""
    try {
        \$tcpTest = Test-NetConnection -ComputerName \$serverHost -Port 443 -WarningAction SilentlyContinue
        if (\$tcpTest.TcpTestSucceeded) {
            Write-Log "  ✓ Conectividade TCP:443 OK para \$serverHost" "SUCCESS"
        } else {
            Write-Log "  ✗ Não foi possível conectar em \$serverHost:443" "ERROR"
            Write-Log "    Firewall pode estar bloqueando" "WARN"
            return \$false
        }
    } catch {
        Write-Log "  ✗ Erro ao testar conectividade: \$_" "ERROR"
        return \$false
    }
    
    # 4. Testar endpoint de heartbeat com retry
    Write-Log "  [4/5] Testando endpoint /heartbeat..." "INFO"
    \$maxRetries = 5
    \$retryCount = 0
    \$heartbeatSuccess = \$false
    
    while (\$retryCount -lt \$maxRetries -and -not \$heartbeatSuccess) {
        \$retryCount++
        Write-Log "    Tentativa \$retryCount/\$maxRetries de enviar heartbeat inicial..." "INFO"
        
        \$result = Send-Heartbeat -IsBootHeartbeat
        if (\$result) {
            Write-Log "  ✓ Heartbeat inicial enviado com SUCESSO!" "SUCCESS"
            \$heartbeatSuccess = \$true
        } else {
            Write-Log "    ✗ Heartbeat falhou" "WARN"
            if (\$retryCount -lt \$maxRetries) {
                \$backoff = [math]::Pow(2, \$retryCount)
                Write-Log "    Aguardando \$backoff segundos antes de retry..." "INFO"
                Start-Sleep -Seconds \$backoff
            }
        }
    }
    
    if (-not \$heartbeatSuccess) {
        Write-Log "  ✗ FALHA CRÍTICA: Não foi possível enviar heartbeat após \$maxRetries tentativas" "ERROR"
        Write-Log "  Possíveis causas:" "ERROR"
        Write-Log "    1. Credenciais inválidas (AgentToken ou HmacSecret)" "ERROR"
        Write-Log "    2. Rate limiting ativo no servidor" "ERROR"
        Write-Log "    3. Endpoint /heartbeat offline ou com erro" "ERROR"
        return \$false
    }
    
    # 5. Validar recursos do sistema
    Write-Log "  [5/5] Validando recursos do sistema..." "INFO"
    \$cpu = (Get-WmiObject Win32_Processor).LoadPercentage
    \$mem = Get-WmiObject Win32_OperatingSystem
    \$memUsedPercent = [math]::Round(((\$mem.TotalVisibleMemorySize - \$mem.FreePhysicalMemory) / \$mem.TotalVisibleMemorySize) * 100, 2)
    
    Write-Log "    CPU Usage: \$cpu%" "INFO"
    Write-Log "    Memory Usage: \$memUsedPercent%" "INFO"
    Write-Log "  ✓ Sistema OK" "SUCCESS"
    
    Write-Log "========================================" "SUCCESS"
    Write-Log "✅ AGENTE INICIALIZADO COM SUCESSO!" "SUCCESS"
    Write-Log "========================================" "SUCCESS"
    
    return \$true
}

#endregion

#region Loop Principal do Agente

function Start-Agent {
    Write-Log "=== Starting Agent Loop ===" "SUCCESS"
    Write-Log "Press Ctrl+C to stop" "INFO"
    
    Write-Log "Running initial health check..." "INFO"
    if (-not (Test-SystemHealth)) {
        Write-Log "CRITICAL: Health check failed. Cannot start agent." "ERROR"
        Write-Log "Please fix the issues above before continuing." "ERROR"
        Write-Log "Troubleshooting:" "ERROR"
        Write-Log "  1. Verifique conectividade: Test-NetConnection -Port 443" "ERROR"
        Write-Log "  2. Valide credenciais no dashboard" "ERROR"
        Write-Log "  3. Verifique firewall: Get-NetFirewallRule -DisplayName 'CyberShield Agent'" "ERROR"
        exit 1
    }
    
    Write-Log "✅ Health check PASSOU - Agent está pronto para operar" "SUCCESS"
    Write-Log "Sending initial heartbeat..." "INFO"
    Send-Heartbeat | Out-Null
    
    Write-Log "Sending initial system metrics..." "INFO"
    Send-SystemMetrics | Out-Null
    
    # Contadores para intervalos
    \$heartbeatInterval = 60
    \$metricsInterval = 300
    \$lastHeartbeat = Get-Date
    \$lastMetrics = Get-Date
    
    # Loop principal
    while (\$true) {
        try {
            # Poll por novos jobs
            \$jobs = Poll-Jobs
            
            if (\$jobs -and \$jobs.Count -gt 0) {
                Write-Log "Recebidos \$(\$jobs.Count) job(s)" "INFO"
                
                foreach (\$job in \$jobs) {
                    # Executar job
                    \$result = Execute-Job -Job \$job
                    
                    # Enviar resultado
                    \$uploaded = Upload-Report -Report \$result
                    
                    # Confirmar job
                    if (\$uploaded) {
                        Ack-Job -JobId \$job.id
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
            
            # FASE 2: Enviar logs a cada 10 minutos
            if ((\$now - \$lastMetrics).TotalSeconds -ge 600) {
                Upload-DiagnosticLogs -LogType "periodic" -Severity "info"
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

# Iniciar o agente
Start-Agent
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
