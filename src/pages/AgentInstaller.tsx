import { useState, useEffect } from "react";
import { Package, Download, Copy, CheckCircle2, Terminal, Loader2, Wifi, WifiOff, Play } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

type Step = 1 | 2 | 3;

const linuxAgentScript = `# Agent script embedded from agent-scripts/cybershield-agent-linux.sh

# Função para gerar assinatura HMAC
generate_hmac_signature() {
    local message="$$1"
    local secret="$$2"
    echo -n "$$message" | openssl dgst -sha256 -hmac "$$secret" | awk '{print $$2}'
}

# Função para fazer requisição com HMAC
secure_request() {
    local url="$$1"
    local method="$${2:-GET}"
    local body="$${3:-}"
    
    local timestamp=$$(date +%s%3N)
    local nonce=$$(uuidgen)
    local payload="$${timestamp}:$${nonce}:$${body}"
    local signature=$$(generate_hmac_signature "$$payload" "$$HMAC_SECRET")
    
    if [ "$$method" == "GET" ]; then
        curl -s -X GET "$$url" \\
            -H "X-Agent-Token: $$AGENT_TOKEN" \\
            -H "X-HMAC-Signature: $$signature" \\
            -H "X-Timestamp: $$timestamp" \\
            -H "X-Nonce: $$nonce" \\
            -H "Content-Type: application/json"
    else
        curl -s -X POST "$$url" \\
            -H "X-Agent-Token: $$AGENT_TOKEN" \\
            -H "X-HMAC-Signature: $$signature" \\
            -H "X-Timestamp: $$timestamp" \\
            -H "X-Nonce: $$nonce" \\
            -H "Content-Type: application/json" \\
            -d "$$body"
    fi
}

# Função para polling de jobs
poll_jobs() {
    secure_request "$${SERVER_URL}/functions/v1/poll-jobs" "GET"
}

# Função para executar job
execute_job() {
    local job_id="$$1"
    local job_type="$$2"
    local job_payload="$$3"
    
    echo "[INFO] Executando job: $$job_id - Tipo: $$job_type"
    
    case "$$job_type" in
        "scan")
            echo "[INFO] Executando scan de segurança..."
            ;;
        "update")
            echo "[INFO] Executando atualização..."
            ;;
        "report")
            echo "[INFO] Gerando relatório..."
            ;;
        "config")
            echo "[INFO] Aplicando configuração..."
            ;;
        *)
            echo "[WARN] Tipo de job desconhecido: $$job_type"
            ;;
    esac
}

# Função para ACK do job
ack_job() {
    local job_id="$$1"
    local url="$${SERVER_URL}/functions/v1/ack-job/$${job_id}"
    
    local response=$$(secure_request "$$url" "POST")
    
    if echo "$$response" | grep -q '"ok":true'; then
        echo "[INFO] Job $$job_id confirmado"
        return 0
    else
        echo "[ERRO] Falha ao confirmar job $$job_id"
        return 1
    fi
}

# Função principal
start_agent() {
    echo "==================================="
    echo "CyberShield Agent v2.1.0 - Iniciando"
    echo "==================================="
    echo "Servidor: $$SERVER_URL"
    echo "Intervalo: $$POLL_INTERVAL segundos"
    echo "HMAC: Habilitado"
    echo ""
    
    while true; do
        # Polling de jobs
        jobs=$$(poll_jobs 2>/dev/null || echo "[]")
        
        job_count=$$(echo "$$jobs" | jq 'length' 2>/dev/null || echo "0")
        
        if [ "$$job_count" -gt 0 ]; then
            echo "[INFO] $$job_count job(s) recebido(s)"
            
            echo "$$jobs" | jq -c '.[]' | while read -r job; do
                job_id=$$(echo "$$job" | jq -r '.id')
                job_type=$$(echo "$$job" | jq -r '.type')
                job_payload=$$(echo "$$job" | jq -r '.payload // "{}"')
                
                # Executar job
                execute_job "$$job_id" "$$job_type" "$$job_payload"
                
                # Confirmar job
                ack_job "$$job_id"
            done
        fi
        
        # Aguardar próximo polling
        sleep $$POLL_INTERVAL
    done
}
`;

const AgentInstaller = () => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [agentName, setAgentName] = useState("AGENT-01");
  const [platform, setPlatform] = useState<"windows" | "linux">("windows");
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentToken, setAgentToken] = useState("");
  const [hmacSecret, setHmacSecret] = useState("");
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [isConnected, setIsConnected] = useState(false);
  const [checkingConnection, setCheckingConnection] = useState(false);

  useEffect(() => {
    if (currentStep === 3 && agentName) {
      checkAgentConnection();
      const interval = setInterval(checkAgentConnection, 5000);
      return () => clearInterval(interval);
    }
  }, [currentStep, agentName]);

  const checkAgentConnection = async () => {
    if (!agentName) return;
    
    setCheckingConnection(true);
    try {
      const { data } = await supabase
        .from('agents')
        .select('status, last_heartbeat')
        .eq('agent_name', agentName)
        .single();

      if (data?.last_heartbeat) {
        const lastHeartbeat = new Date(data.last_heartbeat);
        const now = new Date();
        const diff = now.getTime() - lastHeartbeat.getTime();
        setIsConnected(diff < 5 * 60 * 1000);
      }
    } catch (error) {
      console.error('Error checking connection:', error);
    } finally {
      setCheckingConnection(false);
    }
  };

  const generateCredentialsWithRetry = async (retryCount = 0): Promise<void> => {
    if (!agentName.trim()) {
      toast.error("Nome do agente é obrigatório");
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('auto-generate-enrollment', {
        body: { agentName: agentName.trim() }
      });

      if (error) throw error;
      if (!data) throw new Error('Resposta vazia da função');

      setAgentToken(data.agentToken);
      setHmacSecret(data.hmacSecret);
      setEnrollmentKey(data.enrollmentKey);
      setCurrentStep(2);
      toast.success("Instalador gerado com sucesso!");
    } catch (error: any) {
      if (error?.message?.includes('Failed to fetch') && retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return generateCredentialsWithRetry(retryCount + 1);
      }

      let errorMessage = 'Erro ao gerar instalador';
      if (/unauthorized|invalid token/i.test(error?.message)) {
        errorMessage = 'Erro de autenticação. Por favor, faça login novamente.';
      }
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCredentials = () => generateCredentialsWithRetry(0);

  const generateLinuxInstaller = () => {
    if (!agentToken || !hmacSecret) {
      toast.error("Credenciais não geradas ainda");
      return;
    }

    const linuxScript = `#!/bin/bash
# CyberShield Agent - Linux Installation Script
# Version: 2.1.0
# Auto-generated: ${new Date().toISOString()}

AGENT_TOKEN="${agentToken}"
HMAC_SECRET="${hmacSecret}"
SERVER_URL="${SUPABASE_URL.replace(/\/$/, '')}"
POLL_INTERVAL=60

${linuxAgentScript}
`;

    const blob = new Blob([linuxScript], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cybershield-agent-linux-${agentName}.sh`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    toast.success("Script Linux baixado com sucesso!");
  };

  const getWindowsInstallScript = () => {
    const serverUrl = SUPABASE_URL.replace(/\/$/, '');
    
    // Complete production agent script embedded
    const agentScriptContent = `# CyberShield Agent - Windows PowerShell Script v2.0.0 (Production Ready)

param(
    [Parameter(Mandatory=$$true)]
    [string]$$AgentToken,
    
    [Parameter(Mandatory=$$true)]
    [string]$$HmacSecret,
    
    [Parameter(Mandatory=$$true)]
    [string]$$ServerUrl,
    
    [Parameter(Mandatory=$$false)]
    [int]$$PollInterval = 60
)

# Configuração de logging
$$LogDir = "C:\\CyberShield\\logs"
$$LogFile = Join-Path $$LogDir "agent.log"
$$MaxLogSizeMB = 10
$$MaxLogFiles = 7

# Criar diretório de logs se não existir
if (-not (Test-Path $$LogDir)) {
    New-Item -ItemType Directory -Path $$LogDir -Force | Out-Null
}

#region Funções de Logging

function Write-Log {
    param(
        [string]$$Message,
        [ValidateSet("INFO", "DEBUG", "WARN", "ERROR", "SUCCESS")]
        [string]$$Level = "INFO"
    )
    
    $$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
    $$logEntry = "[$$timestamp] [$$Level] $$Message"
    
    # Rotação de logs
    if (Test-Path $$LogFile) {
        $$logSize = (Get-Item $$LogFile).Length / 1MB
        if ($$logSize -gt $$MaxLogSizeMB) {
            $$archiveName = Join-Path $$LogDir "agent_$$(Get-Date -Format 'yyyyMMdd_HHmmss').log"
            Move-Item $$LogFile $$archiveName -Force
            
            # Limpar logs antigos
            Get-ChildItem $$LogDir -Filter "agent_*.log" | 
                Sort-Object LastWriteTime -Descending | 
                Select-Object -Skip $$MaxLogFiles | 
                Remove-Item -Force
        }
    }
    
    # Escrever no arquivo e console
    Add-Content -Path $$LogFile -Value $$logEntry
    
    $$color = switch ($$Level) {
        "ERROR"   { "Red" }
        "WARN"    { "Yellow" }
        "SUCCESS" { "Green" }
        "DEBUG"   { "Gray" }
        default   { "White" }
    }
    
    Write-Host $$logEntry -ForegroundColor $$color
}

#endregion

#region Configurações

if ([string]::IsNullOrWhiteSpace($$AgentToken) -or [string]::IsNullOrWhiteSpace($$HmacSecret) -or [string]::IsNullOrWhiteSpace($$ServerUrl)) {
    Write-Log "Parâmetros obrigatórios ausentes" "ERROR"
    exit 1
}

$$ServerUrl = $$ServerUrl.TrimEnd('/')

Write-Log "=== CyberShield Agent v2.0.0 iniciado ===" "SUCCESS"
Write-Log "Server URL: $$ServerUrl" "INFO"
Write-Log "Poll Interval: $$PollInterval segundos" "INFO"
Write-Log "Log Directory: $$LogDir" "INFO"

#endregion

#region Funções de Autenticação

function Get-HmacSignature {
    param([string]$$Message, [string]$$Secret)
    $$hmacsha = New-Object System.Security.Cryptography.HMACSHA256
    $$hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($$Secret)
    $$signature = $$hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($$Message))
    return [System.BitConverter]::ToString($$signature).Replace('-', '').ToLower()
}

function Invoke-SecureRequest {
    param(
        [string]$$Url,
        [string]$$Method = "GET",
        [object]$$Body = $$null,
        [int]$$MaxRetries = 3,
        [int]$$InitialRetryDelay = 2
    )
    
    Write-Log "Request: $$Method $$Url" "DEBUG"
    $$retryCount = 0
    $$retryDelay = $$InitialRetryDelay
    
    while ($$retryCount -lt $$MaxRetries) {
        try {
            $$timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
            $$nonce = [guid]::NewGuid().ToString()
            
            $$bodyJson = if ($$Body) { $$Body | ConvertTo-Json -Compress } else { "{}" }
            $$message = "$$timestamp:$$nonce:$$bodyJson"
            $$signature = Get-HmacSignature -Message $$message -Secret $$HmacSecret
            
            $$headers = @{
                "X-Agent-Token" = $$AgentToken
                "X-HMAC-Signature" = $$signature
                "X-Timestamp" = $$timestamp
                "X-Nonce" = $$nonce
                "Content-Type" = "application/json"
            }
            
            Write-Log "Headers: Token=$$($$AgentToken.Substring(0,8))..., Sig=$$($$signature.Substring(0,16))..." "DEBUG"
            
            $$params = @{
                Uri = $$Url
                Method = $$Method
                Headers = $$headers
                ErrorAction = "Stop"
            }
            
            if ($$Body) {
                $$params.Body = $$bodyJson
            }
            
            $$response = Invoke-RestMethod @params
            Write-Log "Request successful: $$Method $$Url" "SUCCESS"
            return $$response
        }
        catch {
            $$retryCount++
            $$errorDetails = $$_.Exception.Message
            $$statusCode = $$_.Exception.Response.StatusCode.value__
            
            Write-Log "Request error (attempt $$retryCount/$$MaxRetries): $$errorDetails" "ERROR"
            if ($$statusCode) {
                Write-Log "Status Code: $$statusCode" "ERROR"
            }
            
            if ($$retryCount -ge $$MaxRetries) {
                Write-Log "Failed after $$MaxRetries attempts" "ERROR"
                throw
            }
            
            Write-Log "Waiting $$retryDelay seconds before retry..." "WARN"
            Start-Sleep -Seconds $$retryDelay
            $$retryDelay *= 2
        }
    }
}

#endregion

#region Heartbeat

function Send-Heartbeat {
    try {
        Write-Log "Sending heartbeat..." "DEBUG"
        $$heartbeatUrl = "$$ServerUrl/functions/v1/heartbeat"
        $$response = Invoke-SecureRequest -Url $$heartbeatUrl -Method "POST" -Body @{}
        Write-Log "Heartbeat sent successfully" "SUCCESS"
        return $$response
    }
    catch {
        Write-Log "Heartbeat error: $$_" "ERROR"
        return $$null
    }
}

#endregion

#region Gerenciamento de Jobs

function Poll-Jobs {
    try {
        Write-Log "Polling jobs..." "DEBUG"
        $$pollUrl = "$$ServerUrl/functions/v1/poll-jobs"
        $$jobs = Invoke-SecureRequest -Url $$pollUrl -Method "GET"
        
        if ($$jobs -and $$jobs.Count -gt 0) {
            Write-Log "Received $$($$jobs.Count) job(s)" "INFO"
        } else {
            Write-Log "No pending jobs" "DEBUG"
        }
        
        return $$jobs
    }
    catch {
        Write-Log "Poll error: $$_" "ERROR"
        return $$null
    }
}

function Execute-Job {
    param($$Job)
    
    Write-Log "Executing job: $$($$Job.id) - Type: $$($$Job.type)" "INFO"
    
    $$result = @{
        status = "completed"
        timestamp = (Get-Date).ToString("o")
        job_type = $$Job.type
        data = @{}
    }
    
    try {
        switch ($$Job.type) {
            "scan_virus" {
                if ($$Job.payload.file_path) {
                    $$filePath = $$Job.payload.file_path
                    if (Test-Path $$filePath) {
                        $$fileHash = (Get-FileHash -Path $$filePath -Algorithm SHA256).Hash
                        $$fileSize = (Get-Item $$filePath).Length
                        $$result.data = @{
                            file_path = $$filePath
                            file_hash = $$fileHash
                            file_size = $$fileSize
                            scan_initiated = $$true
                        }
                        Write-Log "Virus scan initiated for: $$filePath" "SUCCESS"
                    } else {
                        $$result.status = "failed"
                        $$result.error = "File not found: $$filePath"
                    }
                }
            }
            
            "collect_info" {
                $$os = Get-CimInstance Win32_OperatingSystem
                $$cpu = Get-CimInstance Win32_Processor | Select-Object -First 1
                $$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
                
                $$result.data = @{
                    os_name = $$os.Caption
                    os_version = $$os.Version
                    hostname = $$env:COMPUTERNAME
                    cpu_name = $$cpu.Name
                    cpu_cores = $$cpu.NumberOfCores
                    total_memory_gb = [math]::Round($$os.TotalVisibleMemorySize/1MB, 2)
                    free_memory_gb = [math]::Round($$os.FreePhysicalMemory/1MB, 2)
                    disk_free_gb = [math]::Round($$disk.FreeSpace/1GB, 2)
                    disk_total_gb = [math]::Round($$disk.Size/1GB, 2)
                }
                Write-Log "System info collected" "SUCCESS"
            }
            
            "update_config" {
                if ($$Job.payload.poll_interval) {
                    $$script:PollInterval = $$Job.payload.poll_interval
                    $$result.data = @{
                        new_poll_interval = $$script:PollInterval
                        config_updated = $$true
                    }
                    Write-Log "Config updated" "SUCCESS"
                }
            }
            
            "run_command" {
                $$allowedCommands = @("ipconfig", "systeminfo", "tasklist", "netstat", "hostname", "whoami")
                $$command = $$Job.payload.command
                
                if ($$allowedCommands -contains $$command) {
                    $$output = & $$command 2>&1 | Out-String
                    $$result.data = @{
                        command = $$command
                        output = $$output
                        exit_code = $$LASTEXITCODE
                    }
                    Write-Log "Command executed: $$command" "SUCCESS"
                } else {
                    $$result.status = "failed"
                    $$result.error = "Command not allowed"
                }
            }
            
            default {
                $$result.status = "failed"
                $$result.error = "Unknown job type"
            }
        }
    }
    catch {
        $$result.status = "failed"
        $$result.error = $$_.Exception.Message
        Write-Log "Job execution error: $$_" "ERROR"
    }
    
    return $$result
}

function Upload-Report {
    param([string]$$JobId, [object]$$Result)
    
    try {
        $$reportData = @{
            job_id = $$JobId
            result = $$Result
            timestamp = (Get-Date).ToString("o")
        } | ConvertTo-Json -Depth 10
        
        $$url = "$$ServerUrl/functions/v1/upload-report"
        Invoke-SecureRequest -Url $$url -Method "POST" -Body $$reportData | Out-Null
        Write-Log "Report uploaded for job $$JobId" "SUCCESS"
        return $$true
    }
    catch {
        Write-Log "Report upload failed for job $$JobId : $$_" "ERROR"
        return $$false
    }
}

function Ack-Job {
    param([string]$$JobId)
    
    Write-Log "Acknowledging job $$JobId..." "INFO"
    
    $$maxAttempts = 5
    $$attempt = 0
    
    while ($$attempt -lt $$maxAttempts) {
        $$attempt++
        
        try {
            $$ackUrl = "$$ServerUrl/functions/v1/ack-job/$$JobId"
            Write-Log "ACK attempt $$attempt/$$maxAttempts: POST $$ackUrl" "DEBUG"
            
            $$response = Invoke-SecureRequest -Url $$ackUrl -Method "POST" -Body @{} -MaxRetries 1
            
            if ($$response) {
                if ($$response.ok -eq $$true) {
                    Write-Log "Job $$JobId acknowledged successfully (ok=true)" "SUCCESS"
                    return $$true
                } elseif ($$response.error) {
                    if ($$response.error -match "já foi confirmado|already") {
                        Write-Log "Job $$JobId already acknowledged (idempotent)" "INFO"
                        return $$true
                    } else {
                        Write-Log "Server error: $$($$response.error)" "ERROR"
                    }
                } else {
                    Write-Log "Unexpected response: $$($$response | ConvertTo-Json -Compress)" "WARN"
                }
            } else {
                Write-Log "Empty response from server" "WARN"
            }
            
            if ($$attempt -lt $$maxAttempts) {
                $$waitTime = [Math]::Pow(2, $$attempt)
                Write-Log "Waiting $$waitTime seconds before retry..." "WARN"
                Start-Sleep -Seconds $$waitTime
            }
        }
        catch {
            Write-Log "ACK attempt $$attempt error: $$_" "ERROR"
            
            if ($$attempt -lt $$maxAttempts) {
                $$waitTime = [Math]::Pow(2, $$attempt)
                Write-Log "Waiting $$waitTime seconds before retry..." "WARN"
                Start-Sleep -Seconds $$waitTime
            }
        }
    }
    
    Write-Log "CRITICAL: Could not acknowledge job $$JobId after $$maxAttempts attempts" "ERROR"
    Write-Log "ACTION REQUIRED: Check server logs and connectivity" "ERROR"
    return $$false
}

#endregion

#region System Health

function Test-SystemHealth {
    Write-Log "=== Starting System Health Check ===" "INFO"
    
    $$psVersion = $$PSVersionTable.PSVersion
    Write-Log "PowerShell Version: $$psVersion" "INFO"
    if ($$psVersion.Major -lt 5) {
        Write-Log "WARNING: PowerShell 5.1+ recommended" "WARN"
    }
    
    try {
        Write-Log "Testing server connectivity..." "INFO"
        $$testUrl = "$$ServerUrl/functions/v1/poll-jobs"
        $$testResponse = Invoke-SecureRequest -Url $$testUrl -Method "GET" -MaxRetries 2
        Write-Log "Server connectivity: OK" "SUCCESS"
    }
    catch {
        Write-Log "CRITICAL: Cannot connect to server" "ERROR"
        Write-Log "URL tested: $$testUrl" "ERROR"
        Write-Log "Error: $$_" "ERROR"
        return $$false
    }
    
    try {
        Write-Log "Testing heartbeat endpoint..." "INFO"
        $$heartbeatResponse = Send-Heartbeat
        if ($$heartbeatResponse) {
            Write-Log "Heartbeat: OK" "SUCCESS"
        } else {
            Write-Log "Heartbeat: FAILED (non-critical)" "WARN"
        }
    }
    catch {
        Write-Log "Heartbeat test error: $$_" "WARN"
    }
    
    $$os = Get-CimInstance Win32_OperatingSystem
    Write-Log "OS: $$($$os.Caption) $$($$os.Version)" "INFO"
    Write-Log "Free Memory: $$([math]::Round($$os.FreePhysicalMemory/1MB, 2)) GB" "INFO"
    
    $$disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='C:'"
    Write-Log "Free Disk C:: $$([math]::Round($$disk.FreeSpace/1GB, 2)) GB" "INFO"
    
    Write-Log "=== Health Check Completed Successfully ===" "SUCCESS"
    return $$true
}

#endregion

#region Main Agent Loop

function Start-Agent {
    Write-Log "=== Starting Agent Loop ===" "SUCCESS"
    Write-Log "Press Ctrl+C to stop" "INFO"
    
    Write-Log "Running initial health check..." "INFO"
    if (-not (Test-SystemHealth)) {
        Write-Log "CRITICAL: Health check failed. Cannot start agent." "ERROR"
        Write-Log "Please fix the issues above before continuing." "ERROR"
        exit 1
    }
    
    Write-Log "Sending initial heartbeat..." "INFO"
    Send-Heartbeat | Out-Null
    
    $$lastHeartbeat = Get-Date
    $$heartbeatInterval = 60
    
    while ($$true) {
        try {
            $$now = Get-Date
            if (($$now - $$lastHeartbeat).TotalSeconds -ge $$heartbeatInterval) {
                Send-Heartbeat | Out-Null
                $$lastHeartbeat = $$now
            }
            
            Write-Log "Fetching new jobs..." "INFO"
            
            $$jobs = Poll-Jobs
            
            if ($$jobs -and $$jobs.Count -gt 0) {
                Write-Log "Found $$($$jobs.Count) job(s) to execute" "SUCCESS"
                
                foreach ($$job in $$jobs) {
                    Write-Log "========================================" "INFO"
                    Write-Log "Executing job: $$($$job.id)" "INFO"
                    Write-Log "Type: $$($$job.type)" "INFO"
                    Write-Log "Payload: $$($$job.payload | ConvertTo-Json -Compress)" "DEBUG"
                    
                    $$result = Execute-Job -Job $$job
                    
                    if ($$result) {
                        Write-Log "Uploading result..." "INFO"
                        Upload-Report -JobId $$job.id -Result $$result
                    }
                    
                    $$ackSuccess = Ack-Job -JobId $$job.id
                    
                    if ($$ackSuccess) {
                        Write-Log "Job $$($$job.id) completed and acknowledged successfully" "SUCCESS"
                    } else {
                        Write-Log "WARNING: Job $$($$job.id) executed but ACK failed!" "WARN"
                    }
                    
                    Write-Log "========================================" "INFO"
                }
            } else {
                Write-Log "No pending jobs" "DEBUG"
            }
            
            Write-Log "Waiting $$PollInterval seconds until next poll..." "DEBUG"
            Start-Sleep -Seconds $$PollInterval
        }
        catch {
            Write-Log "Main loop error: $$_" "ERROR"
            Write-Log "Stack Trace: $$($$_.ScriptStackTrace)" "ERROR"
            Write-Log "Waiting $$PollInterval seconds before continuing..." "WARN"
            Start-Sleep -Seconds $$PollInterval
        }
    }
}

#endregion

Start-Agent`;

    // Installer wrapper script
    return `# CyberShield Agent - Instalador Automático
# Gerado em: ${new Date().toISOString()}
# Compatible with: Windows Server 2012, 2012 R2, 2016, 2019, 2022, 2025
# PowerShell Version: 3.0+

#Requires -Version 3.0

$$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  CyberShield Agent Installer v2.1.0" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Validar versão do PowerShell
if ($$PSVersionTable.PSVersion.Major -lt 3) {
    Write-Host "ERRO: Este script requer PowerShell 3.0 ou superior" -ForegroundColor Red
    Write-Host "Versão atual: $$($$PSVersionTable.PSVersion)" -ForegroundColor Yellow
    Write-Host "Por favor, atualize o PowerShell" -ForegroundColor Yellow
    Read-Host "Pressione ENTER para sair"
    exit 1
}

# Validar sistema operacional
$$osVersion = [System.Environment]::OSVersion.Version
$$osName = (Get-WmiObject -Class Win32_OperatingSystem).Caption

Write-Host "Sistema: $$osName" -ForegroundColor Cyan
Write-Host "PowerShell: $$($$PSVersionTable.PSVersion)" -ForegroundColor Cyan
Write-Host ""

# Windows Server 2012 = 6.2, 2012 R2 = 6.3, 2016 = 10.0, etc
if ($$osVersion.Major -lt 6 -or ($$osVersion.Major -eq 6 -and $$osVersion.Minor -lt 2)) {
    Write-Host "AVISO: Este agente foi testado em Windows Server 2012+ e Windows 8+" -ForegroundColor Yellow
    Write-Host "Sua versão pode não ser totalmente suportada" -ForegroundColor Yellow
    Write-Host ""
}

# Configurações
$$AgentToken = "${agentToken}"
$$HmacSecret = "${hmacSecret}"
$$ServerUrl = "${serverUrl}"
$$AgentDir = "C:\\CyberShield"
$$LogDir = "$$AgentDir\\logs"
$$ScriptPath = "$$AgentDir\\agent.ps1"

# Validação de privilégios administrativos
Write-Host "[0/5] Validando permissões..." -ForegroundColor Yellow

$$isAdmin = ([Security.Principal.WindowsPrincipal] [Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $$isAdmin) {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ✗ ERRO: Privilégios Administrativos" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Este script precisa ser executado como Administrador." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Como executar:" -ForegroundColor Cyan
    Write-Host "  1. Clique com botão direito no arquivo .ps1" -ForegroundColor White
    Write-Host "  2. Selecione 'Executar como Administrador'" -ForegroundColor White
    Write-Host ""
    Write-Host "Ou execute no PowerShell Admin:" -ForegroundColor Cyan
    Write-Host "  Start-Process powershell -Verb RunAs -ArgumentList '-ExecutionPolicy Bypass -File install.ps1'" -ForegroundColor Gray
    Write-Host ""
    Read-Host "Pressione ENTER para sair"
    exit 1
}

Write-Host "      ✓ Privilégios de administrador confirmados" -ForegroundColor Green

try {
    Write-Host "[1/5] Criando diretórios..." -ForegroundColor Yellow
    New-Item -ItemType Directory -Path $$AgentDir -Force | Out-Null
    New-Item -ItemType Directory -Path $$LogDir -Force | Out-Null
    Write-Host "      ✓ Diretórios criados" -ForegroundColor Green
    
    Write-Host "[2/5] Instalando script do agente..." -ForegroundColor Yellow
    $$agentScript = @'
${agentScriptContent}
'@
    
    $$agentScript | Out-File -FilePath $$ScriptPath -Encoding UTF8 -Force
    Write-Host "      ✓ Script instalado: $$ScriptPath" -ForegroundColor Green
    
    Write-Host "[3/5] Configurando tarefa agendada..." -ForegroundColor Yellow
    
    # Remover tarefa existente se houver
    Get-ScheduledTask -TaskName "CyberShieldAgent" -ErrorAction SilentlyContinue | Unregister-ScheduledTask -Confirm:$$false -ErrorAction SilentlyContinue
    
    $$action = New-ScheduledTaskAction -Execute "powershell.exe" \`
        -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$$ScriptPath\`" -AgentToken \`"$$AgentToken\`" -HmacSecret \`"$$HmacSecret\`" -ServerUrl \`"$$ServerUrl\`""
    
    $$trigger = New-ScheduledTaskTrigger -AtStartup
    $$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
    $$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
    
    Register-ScheduledTask -TaskName "CyberShieldAgent" \`
        -Action $$action \`
        -Trigger $$trigger \`
        -Principal $$principal \`
        -Settings $$settings \`
        -Description "CyberShield Security Agent" \`
        -Force | Out-Null
    
    Write-Host "      ✓ Tarefa registrada" -ForegroundColor Green
    
    # Validar que a tarefa foi criada
    $$taskCreated = Get-ScheduledTask -TaskName "CyberShieldAgent" -ErrorAction SilentlyContinue
    if (-not $$taskCreated) {
        throw "Falha ao criar tarefa agendada. Verifique se o Windows Task Scheduler está funcionando."
    }
    
    Write-Host "      ✓ Tarefa validada no Task Scheduler" -ForegroundColor Green
    
    Write-Host "[4/5] Iniciando agente..." -ForegroundColor Yellow
    Start-ScheduledTask -TaskName "CyberShieldAgent"
    Start-Sleep -Seconds 2
    Write-Host "      ✓ Agente iniciado" -ForegroundColor Green
    
    Write-Host "[5/5] Testando conectividade..." -ForegroundColor Yellow
    try {
        $$testUrl = "$$ServerUrl/functions/v1/heartbeat"
        $$testHeaders = @{
            "X-Agent-Token" = $$AgentToken
            "Content-Type" = "application/json"
        }
        
        $$response = Invoke-WebRequest -Uri $$testUrl -Method POST -Headers $$testHeaders -TimeoutSec 10 -ErrorAction Stop
        
        if ($$response.StatusCode -eq 200) {
            Write-Host "      ✓ Servidor acessível" -ForegroundColor Green
        } else {
            Write-Host "      ⚠ Servidor retornou status: $$($$response.StatusCode)" -ForegroundColor Yellow
        }
    } catch {
        Write-Host "      ⚠ Não foi possível conectar ao servidor" -ForegroundColor Yellow
        Write-Host "        Erro: $$($$_.Exception.Message)" -ForegroundColor Gray
        Write-Host "        O agente tentará conectar automaticamente" -ForegroundColor Gray
    }
    
    Start-Sleep -Seconds 3
    
    # Verificar se logs foram criados
    if (Test-Path "$$LogDir\\agent.log") {
        Write-Host "      ✓ Logs criados com sucesso" -ForegroundColor Green
        Write-Host ""
        Write-Host "Últimas linhas do log:" -ForegroundColor Cyan
        Get-Content "$$LogDir\\agent.log" -Tail 5 | ForEach-Object { Write-Host "      $$_" -ForegroundColor Gray }
    } else {
        Write-Host "      ⚠ Logs ainda não criados (aguarde 30s)" -ForegroundColor Yellow
    }
    
    # Verificar status da tarefa
    $$task = Get-ScheduledTask -TaskName "CyberShieldAgent"
    if ($$task.State -eq "Running") {
        Write-Host "      ✓ Status: Executando" -ForegroundColor Green
    } else {
        Write-Host "      ⚠ Status: $$($$task.State)" -ForegroundColor Yellow
    }
    
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Green
    Write-Host "  ✓ INSTALAÇÃO CONCLUÍDA COM SUCESSO!" -ForegroundColor Green
    Write-Host "========================================" -ForegroundColor Green
    Write-Host ""
    Write-Host "Próximos passos:" -ForegroundColor Cyan
    Write-Host "  1. O agente está rodando em segundo plano" -ForegroundColor White
    Write-Host "  2. Aguarde 30-60 segundos para primeiro heartbeat" -ForegroundColor White
    Write-Host "  3. Verifique o status no dashboard web" -ForegroundColor White
    Write-Host ""
    Write-Host "Logs do agente: $$LogDir\\agent.log" -ForegroundColor Gray
    Write-Host "Para visualizar logs: Get-Content '$$LogDir\\agent.log' -Tail 20 -Wait" -ForegroundColor Gray
    Write-Host ""
}
catch {
    Write-Host ""
    Write-Host "========================================" -ForegroundColor Red
    Write-Host "  ✗ ERRO NA INSTALAÇÃO" -ForegroundColor Red
    Write-Host "========================================" -ForegroundColor Red
    Write-Host ""
    Write-Host "Erro: $$_" -ForegroundColor Red
    Write-Host ""
    Write-Host "Stack Trace:" -ForegroundColor Yellow
    Write-Host $$_.ScriptStackTrace -ForegroundColor Gray
    Write-Host ""
    Write-Host "Diagnóstico Detalhado:" -ForegroundColor Yellow
    Write-Host "  ✓ Execute como Administrador" -ForegroundColor White
    Write-Host "  ✓ Verifique conexão com internet" -ForegroundColor White
    Write-Host "  ✓ Verifique se porta 443 está liberada no firewall" -ForegroundColor White
    Write-Host "  ✓ Desabilite temporariamente o antivírus" -ForegroundColor White
    Write-Host "  ✓ Verifique se Windows Task Scheduler está ativo:" -ForegroundColor White
    Write-Host "     Get-Service -Name Schedule" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Logs salvos em: $$LogDir" -ForegroundColor Cyan
    Write-Host ""
    Write-Host "Para suporte, envie:" -ForegroundColor Yellow
    Write-Host "  - Esta mensagem de erro" -ForegroundColor White
    Write-Host "  - Arquivo de log (se existir): $$LogDir\\agent.log" -ForegroundColor White
    Write-Host "  - Resultado de: Get-Service -Name Schedule" -ForegroundColor White
    Write-Host ""
    exit 1
}`;
  };

  const getLinuxInstallScript = () => {
    const serverUrl = SUPABASE_URL.replace(/\/$/, '');
    return `#!/bin/bash
set -e
if [ "$EUID" -ne 0 ]; then echo "Execute: sudo bash install.sh"; exit 1; fi

echo "Instalando CyberShield Agent..."
apt-get update && apt-get install -y curl jq 2>/dev/null || yum install -y curl jq 2>/dev/null || true
mkdir -p /opt/cybershield

cat > /opt/cybershield/agent.sh << 'EOF'
#!/bin/bash
AGENT_TOKEN="${agentToken}"
HMAC_SECRET="${hmacSecret}"
SERVER_URL="${serverUrl}"
AGENT_NAME="${agentName}"

gen_hmac() { echo -n "$1" | openssl dgst -sha256 -hmac "$2" | awk '{print $2}'; }
req() {
    local url="$1" method="\${2:-GET}" body="\${3:-}"
    local ts=$(date +%s%3N) n=$(cat /proc/sys/kernel/random/uuid 2>/dev/null || uuidgen)
    local sig=$(gen_hmac "\${ts}:\${n}:\${body}" "$HMAC_SECRET")
    if [ "$method" == "GET" ]; then
        curl -s -X GET "$url" -H "X-Agent-Token: $AGENT_TOKEN" -H "X-HMAC-Signature: $sig" -H "X-Timestamp: $ts" -H "X-Nonce: $n" -H "Content-Type: application/json"
    else
        curl -s -X POST "$url" -H "X-Agent-Token: $AGENT_TOKEN" -H "X-HMAC-Signature: $sig" -H "X-Timestamp: $ts" -H "X-Nonce: $n" -H "Content-Type: application/json" -d "$body"
    fi
}

echo "[$(date '+%H:%M:%S')] Agente iniciado"
while true; do
    jobs=$(req "$SERVER_URL/functions/v1/poll-jobs" "GET" 2>/dev/null)
    if [ -n "$jobs" ] && [ "$jobs" != "[]" ]; then
        echo "$jobs" | jq -c '.[]' 2>/dev/null | while read -r job; do
            jid=$(echo "$job" | jq -r '.id')
            echo "[INFO] Job $jid"
            r='{"status":"completed","timestamp":"'$(date -Iseconds)'"}'
            ub='{"jobId":"'$jid'","agentName":"'$AGENT_NAME'","result":'$r'}'
            req "$SERVER_URL/functions/v1/upload-report" "POST" "$ub" >/dev/null 2>&1
            req "$SERVER_URL/functions/v1/ack-job/$jid" "POST" >/dev/null 2>&1
            echo "[OK] Concluido"
        done
    fi
    sleep 60
done
EOF

chmod +x /opt/cybershield/agent.sh

cat > /etc/systemd/system/cybershield-agent.service << EOF
[Unit]
Description=CyberShield Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=/bin/bash /opt/cybershield/agent.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cybershield-agent
systemctl start cybershield-agent
echo "Instalado!"`;
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const downloadScript = (script: string, filename: string) => {
    const blob = new Blob([script], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`${filename} baixado!`);
  };

  const StepIndicator = () => (
    <div className="flex justify-center items-center mb-8">
      {([1, 2, 3] as Step[]).map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-bold transition-all ${
              currentStep >= step
                ? "bg-primary text-primary-foreground"
                : "bg-secondary text-muted-foreground"
            }`}
          >
            {step}
          </div>
          {step < 3 && (
            <div
              className={`w-16 h-1 mx-2 transition-colors ${
                currentStep > step ? "bg-primary" : "bg-secondary"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20">
          <Package className="h-8 w-8 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Instalador Simplificado de Agente
          </h1>
          <p className="text-sm text-muted-foreground">Instale o agente com 1 clique - tudo automático!</p>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <StepIndicator />

          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Configure o Agente</h2>
                <p className="text-muted-foreground">Nome e plataforma</p>
              </div>

              <div className="max-w-md mx-auto space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agentName">Nome do Agente</Label>
                  <Input
                    id="agentName"
                    placeholder="AGENT-01"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value.toUpperCase())}
                    className="text-center font-mono text-lg"
                  />
                </div>

                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <div className="grid grid-cols-2 gap-3">
                    <Button
                      variant={platform === "windows" ? "default" : "outline"}
                      onClick={() => setPlatform("windows")}
                      className="h-20"
                    >
                      <div className="flex flex-col items-center">
                        <Terminal className="h-6 w-6 mb-2" />
                        Windows
                      </div>
                    </Button>
                    <Button
                      variant={platform === "linux" ? "default" : "outline"}
                      onClick={() => setPlatform("linux")}
                      className="h-20"
                    >
                      <div className="flex flex-col items-center">
                        <Terminal className="h-6 w-6 mb-2" />
                        Linux
                      </div>
                    </Button>
                  </div>
                </div>

                <Button
                  onClick={generateCredentials}
                  disabled={isGenerating}
                  className="w-full h-12 text-lg"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    "Gerar Instalador →"
                  )}
                </Button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2 flex items-center justify-center gap-2">
                  <CheckCircle2 className="h-6 w-6 text-green-500" />
                  Instalador Pronto!
                </h2>
                <p className="text-muted-foreground">Baixe e execute o script - tudo automático</p>
              </div>

              <div className="max-w-2xl mx-auto space-y-6">
                <div className="bg-gradient-to-r from-primary/10 to-primary/5 p-6 rounded-lg border-2 border-primary/20">
                  <h3 className="font-semibold text-lg mb-3 flex items-center gap-2">
                    <Play className="w-5 h-5 text-primary" />
                    Instalação Automática
                  </h3>
                  <p className="text-sm text-muted-foreground mb-4">
                    O instalador vai automaticamente:
                  </p>
                  <ul className="text-sm space-y-1 mb-4 ml-4">
                    <li>✓ Criar diretório e configurar credenciais</li>
                    <li>✓ Instalar como serviço/tarefa agendada</li>
                    <li>✓ Iniciar agente em segundo plano</li>
                    <li>✓ Configurar reinício automático</li>
                  </ul>
                  
                  <div className="flex gap-2">
                    <Button
                      className="flex-1"
                      size="lg"
                      onClick={() => downloadScript(
                        platform === "windows" ? getWindowsInstallScript() : getLinuxInstallScript(),
                        platform === "windows" ? "install.ps1" : "install.sh"
                      )}
                    >
                      <Download className="w-4 h-4 mr-2" />
                      Baixar Instalador {platform === "windows" ? "Windows" : "Linux"}
                    </Button>
                    <Button
                      variant="outline"
                      size="lg"
                      onClick={() => copyToClipboard(
                        platform === "windows" ? getWindowsInstallScript() : getLinuxInstallScript(),
                        "Script"
                      )}
                    >
                      <Copy className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                <div className="bg-muted/50 p-4 rounded-lg border">
                  <h4 className="font-medium mb-3 flex items-center gap-2 text-sm">
                    <Terminal className="w-4 h-4" />
                    Como Executar
                  </h4>
                  
                  {platform === "windows" ? (
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Baixe o arquivo <code className="bg-background px-2 py-1 rounded">install.ps1</code></li>
                      <li>Clique com botão direito → <strong>Executar com PowerShell</strong></li>
                      <li>Pronto! O agente roda em segundo plano automaticamente</li>
                    </ol>
                  ) : (
                    <ol className="list-decimal list-inside space-y-2 text-sm text-muted-foreground">
                      <li>Baixe o arquivo <code className="bg-background px-2 py-1 rounded">install.sh</code></li>
                      <li>Execute: <code className="bg-background px-2 py-1 rounded">sudo bash install.sh</code></li>
                      <li>Pronto! O agente roda como serviço systemd</li>
                    </ol>
                  )}
                </div>

                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setCurrentStep(1)} className="flex-1">
                    ← Voltar
                  </Button>
                  <Button onClick={() => setCurrentStep(3)} className="flex-1">
                    Verificar Conexão →
                  </Button>
                </div>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Verificando Conexão</h2>
                <p className="text-muted-foreground">Aguardando o agente conectar...</p>
              </div>

              <div className="max-w-md mx-auto">
                <Card className={isConnected ? "border-green-500 bg-green-500/5" : "border-orange-500 bg-orange-500/5"}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center gap-4">
                      {isConnected ? (
                        <>
                          <Wifi className="h-16 w-16 text-green-500" />
                          <div className="text-center">
                            <h3 className="text-xl font-bold text-green-500">Conectado!</h3>
                            <p className="text-sm text-muted-foreground">O agente está online e funcionando</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <WifiOff className="h-16 w-16 text-orange-500" />
                          <div className="text-center">
                            <h3 className="text-xl font-bold text-orange-500">Aguardando Conexão</h3>
                            <p className="text-sm text-muted-foreground">
                              Execute o instalador no servidor para conectar
                            </p>
                            {checkingConnection && (
                              <Loader2 className="h-6 w-6 animate-spin mx-auto mt-3" />
                            )}
                          </div>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>

                <div className="mt-6 space-y-2">
                  <Button
                    variant="outline"
                    onClick={checkAgentConnection}
                    disabled={checkingConnection}
                    className="w-full"
                  >
                    {checkingConnection ? "Verificando..." : "Verificar Agora"}
                  </Button>
                  <Button variant="ghost" onClick={() => setCurrentStep(1)} className="w-full">
                    Voltar ao Início
                  </Button>
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentInstaller;
