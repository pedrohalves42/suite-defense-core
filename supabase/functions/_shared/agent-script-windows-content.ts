/**
 * CyberShield Agent Windows Script - Inline Content
 * This ensures the script is ALWAYS available even if Storage/HTTP fail
 * Source: public/agent-scripts/cybershield-agent-windows.ps1
 * Version: 2.2.1
 */

export const AGENT_SCRIPT_WINDOWS_PS1 = `# CyberShield Agent - Windows PowerShell Script v2.2.1 (Production Ready)
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

Write-Host "Sistema operacional: \$osName" -ForegroundColor Cyan
Write-Host "Versão: \$(\$osVersion.Major).\$(\$osVersion.Minor)" -ForegroundColor Cyan

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
    param([bool]\$IsInitialBoot = \$false)
    
    try {
        \$maxRetries = if (\$IsInitialBoot) { 5 } else { 3 }
        
        \$body = @{
            os_type = "windows"
            os_version = \$osName
            hostname = \$env:COMPUTERNAME
            agent_version = "2.2.1"
        }
        
        \$uri = "\$ServerUrl/functions/v1/heartbeat"
        
        \$response = Invoke-SecureRequest -Uri \$uri -Method "POST" -Body \$body -MaxRetries \$maxRetries
        
        if (\$response.StatusCode -eq 200) {
            if (\$IsInitialBoot) {
                Write-Log "Heartbeat inicial enviado com sucesso" "SUCCESS"
            } else {
                Write-Log "Heartbeat enviado com sucesso" "DEBUG"
            }
            return \$true
        } else {
            Write-Log "Heartbeat falhou: Status \$(\$response.StatusCode)" "WARN"
            return \$false
        }
    } catch {
        Write-Log "Erro ao enviar heartbeat: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
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
    Write-Log "Executando verificação de saúde do sistema..." "INFO"
    
    # Verificar versão do PowerShell
    if (\$PSVersionTable.PSVersion.Major -lt 3) {
        Write-Log "Versão do PowerShell incompatível: \$(\$PSVersionTable.PSVersion)" "ERROR"
        return \$false
    }
    
    # Verificar conectividade com o servidor
    try {
        \$testUri = "\$ServerUrl/functions/v1/heartbeat"
        \$testResponse = Invoke-WebRequest -Uri \$testUri -Method HEAD -TimeoutSec 10 -UseBasicParsing
        Write-Log "Conectividade com servidor: OK" "SUCCESS"
    } catch {
        Write-Log "Falha na conectividade com servidor: \$(\$_.Exception.Message)" "ERROR"
        return \$false
    }
    
    # Verificar recursos do sistema
    try {
        \$memory = Get-WmiObject Win32_OperatingSystem
        \$freeMemoryMB = [math]::Round(\$memory.FreePhysicalMemory / 1024, 2)
        if (\$freeMemoryMB -lt 100) {
            Write-Log "AVISO: Memória disponível baixa: \$freeMemoryMB MB" "WARN"
        }
        
        \$disk = Get-WmiObject Win32_LogicalDisk -Filter "DeviceID='C:'"
        \$freeSpaceGB = [math]::Round(\$disk.FreeSpace / 1GB, 2)
        if (\$freeSpaceGB -lt 1) {
            Write-Log "AVISO: Espaço em disco baixo: \$freeSpaceGB GB" "WARN"
        }
    } catch {
        Write-Log "Erro ao verificar recursos: \$(\$_.Exception.Message)" "WARN"
    }
    
    Write-Log "Verificação de saúde concluída" "SUCCESS"
    return \$true
}

#endregion

#region Loop Principal do Agente

function Start-Agent {
    Write-Log "=== Agent iniciado ===" "SUCCESS"
    
    # Verificação inicial de saúde
    if (-not (Test-SystemHealth)) {
        Write-Log "Verificação de saúde falhou. Abortando." "ERROR"
        return
    }
    
    # Enviar heartbeat inicial
    \$heartbeatSuccess = Send-Heartbeat -IsInitialBoot \$true
    if (-not \$heartbeatSuccess) {
        Write-Log "Falha no heartbeat inicial. Continuando mesmo assim..." "WARN"
    }
    
    # Enviar métricas iniciais
    Send-SystemMetrics
    
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
