import { useState, useEffect } from "react";
import { Package, Download, Copy, CheckCircle2, Terminal, Loader2, Wifi, WifiOff } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

type Step = 1 | 2 | 3;

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
        setIsConnected(diff < 5 * 60 * 1000); // 5 minutes
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

      setAgentToken(data.agentToken);
      setHmacSecret(data.hmacSecret);
      setEnrollmentKey(data.enrollmentKey);
      setCurrentStep(2);
      toast.success("Credenciais geradas com sucesso!");
    } catch (error: any) {
      // Retry logic for network errors
      if (error.message?.includes('Failed to fetch') && retryCount < 2) {
        console.log(`Retrying... Attempt ${retryCount + 1}/2`);
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return generateCredentialsWithRetry(retryCount + 1);
      }
      
      toast.error(error.message || "Erro ao gerar credenciais");
      console.error('Error generating credentials:', error);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCredentials = () => generateCredentialsWithRetry(0);

  const windowsInstallScript = `# CyberShield Agent - Windows PowerShell Script com HMAC
# Versão: 2.0 com autenticação HMAC e rate limiting
# Execute como Administrador

param(
    [Parameter(Mandatory=$false)]
    [string]$AgentToken = "${agentToken}",
    
    [Parameter(Mandatory=$false)]
    [string]$HmacSecret = "${hmacSecret}",
    
    [Parameter(Mandatory=$false)]
    [string]$ServerUrl = "${SUPABASE_URL}",
    
    [Parameter(Mandatory=$false)]
    [int]$PollInterval = 60
)

$ErrorActionPreference = "Stop"

# Forçar TLS 1.2 para conexões HTTPS
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Normalizar ServerUrl removendo barra final
if ($ServerUrl.EndsWith("/")) {
    $ServerUrl = $ServerUrl.TrimEnd("/")
}

# Função para gerar assinatura HMAC
function Get-HmacSignature {
    param(
        [string]$Message,
        [string]$Secret
    )
    
    $hmacsha = New-Object System.Security.Cryptography.HMACSHA256
    $hmacsha.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
    $signature = $hmacsha.ComputeHash([Text.Encoding]::UTF8.GetBytes($Message))
    return [System.BitConverter]::ToString($signature).Replace('-', '').ToLower()
}

# Função para fazer requisição com HMAC
function Invoke-SecureRequest {
    param(
        [string]$Url,
        [string]$Method = "GET",
        [string]$Body = ""
    )
    
    try {
        $timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
        $nonce = [guid]::NewGuid().ToString()
        $payload = "\${timestamp}:\${nonce}:\${Body}"
        $signature = Get-HmacSignature -Message $payload -Secret $HmacSecret
        
        $headers = @{
            "X-Agent-Token" = $AgentToken
            "X-HMAC-Signature" = $signature
            "X-Timestamp" = $timestamp.ToString()
            "X-Nonce" = $nonce
            "Content-Type" = "application/json"
        }
        
        if ($Method -eq "GET") {
            return Invoke-RestMethod -Uri $Url -Method GET -Headers $headers -TimeoutSec 30
        } else {
            return Invoke-RestMethod -Uri $Url -Method POST -Headers $headers -Body $Body -TimeoutSec 30
        }
    } catch {
        Write-Host "[ERRO] Falha na requisição para $Url : $($_.Exception.Message)"
        throw
    }
}

# Função para polling de jobs
function Poll-Jobs {
    try {
        $jobs = Invoke-SecureRequest -Url "$ServerUrl/functions/v1/poll-jobs"
        return $jobs
    } catch {
        Write-Host "[ERRO] Falha ao fazer polling: $($_.Exception.Message)"
        return @()
    }
}

# Função para executar job
function Execute-Job {
    param($Job)
    
    Write-Host "[INFO] Executando job: $($Job.id) - Tipo: $($Job.type)"
    
    $result = $null
    
    switch ($Job.type) {
        "scan" {
            $result = @{
                status = "completed"
                data = @{
                    timestamp = (Get-Date).ToString("o")
                    type = "security_scan"
                }
            }
        }
        "update" {
            $result = @{
                status = "completed"
                data = @{
                    updated = $true
                }
            }
        }
        "report" {
            $result = @{
                status = "completed"
                data = @{
                    report_generated = $true
                }
            }
        }
        "config" {
            $result = @{
                status = "completed"
                data = @{
                    configured = $true
                }
            }
        }
        default {
            $result = @{
                status = "unknown_type"
            }
        }
    }
    
    return $result
}

# Função para ACK do job
function Ack-Job {
    param([string]$JobId)
    
    try {
        $url = "$ServerUrl/functions/v1/ack-job/$JobId"
        $response = Invoke-SecureRequest -Url $url -Method POST
        Write-Host "[INFO] Job $JobId confirmado"
        return $true
    } catch {
        Write-Host "[ERRO] Falha ao confirmar job $JobId : $($_.Exception.Message)"
        return $false
    }
}

# Função para calcular hash SHA256
function Get-FileHashSHA256 {
    param([string]$FilePath)
    
    $hash = Get-FileHash -Path $FilePath -Algorithm SHA256
    return $hash.Hash.ToLower()
}

# Função para scan de vírus
function Scan-File {
    param(
        [string]$FilePath
    )
    
    if (-not (Test-Path $FilePath)) {
        Write-Host "[ERRO] Arquivo não encontrado: $FilePath"
        return $null
    }
    
    try {
        $fileHash = Get-FileHashSHA256 -FilePath $FilePath
        
        $body = @{
            filePath = $FilePath
            fileHash = $fileHash
        } | ConvertTo-Json
        
        $result = Invoke-SecureRequest \`
            -Url "$ServerUrl/functions/v1/scan-virus" \`
            -Method POST \`
            -Body $body
        
        if ($result.isMalicious) {
            Write-Host "[ALERTA] Arquivo malicioso detectado!"
            Write-Host "  Arquivo: $FilePath"
            Write-Host "  Hash: $fileHash"
            Write-Host "  Detecções: $($result.positives)/$($result.totalScans)"
            Write-Host "  Link: $($result.permalink)"
        } else {
            Write-Host "[OK] Arquivo limpo: $FilePath"
        }
        
        return $result
    } catch {
        Write-Host "[ERRO] Falha ao escanear arquivo: $($_.Exception.Message)"
        return $null
    }
}

# Função principal
function Start-Agent {
    Write-Host "==================================="
    Write-Host "CyberShield Agent v2.0 - Iniciando"
    Write-Host "==================================="
    Write-Host "Servidor: $ServerUrl"
    Write-Host "Intervalo: $PollInterval segundos"
    Write-Host "HMAC: Habilitado"
    Write-Host ""
    
    while ($true) {
        try {
            # Polling de jobs
            $jobs = Poll-Jobs
            
            if ($jobs -and $jobs.Count -gt 0) {
                Write-Host "[INFO] $($jobs.Count) job(s) recebido(s)"
                
                foreach ($job in $jobs) {
                    # Executar job
                    $result = Execute-Job -Job $job
                    
                    # Confirmar job
                    Ack-Job -JobId $job.id
                }
            }
            
            # Aguardar próximo polling
            Start-Sleep -Seconds $PollInterval
        } catch {
            Write-Host "[ERRO] Erro no loop principal: $_"
            Start-Sleep -Seconds 10
        }
    }
}

# Instalar como serviço (opcional)
function Install-Service {
    $serviceName = "CyberShieldAgent"
    $scriptPath = $MyInvocation.MyCommand.Path
    
    $service = Get-Service -Name $serviceName -ErrorAction SilentlyContinue
    
    if ($service) {
        Write-Host "Serviço já existe. Removendo..."
        Stop-Service -Name $serviceName -Force
        sc.exe delete $serviceName
        Start-Sleep -Seconds 2
    }
    
    Write-Host "Instalando serviço..."
    
    $params = "-AgentToken \`"$AgentToken\`" -HmacSecret \`"$HmacSecret\`" -ServerUrl \`"$ServerUrl\`" -PollInterval $PollInterval"
    
    New-Service -Name $serviceName \`
        -BinaryPathName "powershell.exe -ExecutionPolicy Bypass -File \`"$scriptPath\`" $params" \`
        -DisplayName "CyberShield Security Agent" \`
        -Description "Agente de segurança CyberShield com autenticação HMAC" \`
        -StartupType Automatic
    
    Start-Service -Name $serviceName
    
    Write-Host "Serviço instalado e iniciado com sucesso!"
}

# Iniciar agente
Start-Agent
`;

  const linuxInstallScript = `#!/bin/bash
# CyberShield Agent - Linux Bash Script com HMAC
# Versão: 2.0 com autenticação HMAC e rate limiting
# Execute com sudo

set -e

# Parâmetros
AGENT_TOKEN="${agentToken}"
HMAC_SECRET="${hmacSecret}"
SERVER_URL="${SUPABASE_URL}"
POLL_INTERVAL="\${1:-60}"

# Normalizar BASE_URL removendo barra final
BASE_URL="\${SERVER_URL%/}"

# Função para gerar assinatura HMAC
generate_hmac_signature() {
    local message="$1"
    local secret="$2"
    echo -n "$message" | openssl dgst -sha256 -hmac "$secret" | awk '{print $2}'
}

# Função para fazer requisição com HMAC
secure_request() {
    local url="$1"
    local method="\${2:-GET}"
    local body="\${3:-}"
    
    local timestamp=$(date +%s%3N)
    local nonce=$(cat /proc/sys/kernel/random/uuid)
    local payload="\${timestamp}:\${nonce}:\${body}"
    local signature=$(generate_hmac_signature "$payload" "$HMAC_SECRET")
    
    local response
    local http_code
    
    if [ "$method" == "GET" ]; then
        response=$(curl -fSL --connect-timeout 5 --max-time 20 -w "\\n%{http_code}" -X GET "$url" \\
            -H "X-Agent-Token: $AGENT_TOKEN" \\
            -H "X-HMAC-Signature: $signature" \\
            -H "X-Timestamp: $timestamp" \\
            -H "X-Nonce: $nonce" \\
            -H "Content-Type: application/json" 2>&1)
    else
        response=$(curl -fSL --connect-timeout 5 --max-time 20 -w "\\n%{http_code}" -X POST "$url" \\
            -H "X-Agent-Token: $AGENT_TOKEN" \\
            -H "X-HMAC-Signature: $signature" \\
            -H "X-Timestamp: $timestamp" \\
            -H "X-Nonce: $nonce" \\
            -H "Content-Type: application/json" \\
            -d "$body" 2>&1)
    fi
    
    http_code=$(echo "$response" | tail -n1)
    body_response=$(echo "$response" | sed '$d')
    
    if [ "$http_code" -ge 400 ]; then
        echo "[ERRO] HTTP $http_code: $body_response" >&2
        return 1
    fi
    
    echo "$body_response"
}

# Função para polling de jobs
poll_jobs() {
    secure_request "\${BASE_URL}/functions/v1/poll-jobs" "GET"
}

# Função para executar job
execute_job() {
    local job_id="$1"
    local job_type="$2"
    local job_payload="$3"
    
    echo "[INFO] Executando job: $job_id - Tipo: $job_type"
    
    case "$job_type" in
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
            echo "[WARN] Tipo de job desconhecido: $job_type"
            ;;
    esac
}

# Função para ACK do job
ack_job() {
    local job_id="$1"
    local url="\${BASE_URL}/functions/v1/ack-job/\${job_id}"
    
    local response=$(secure_request "$url" "POST" 2>&1)
    
    if echo "$response" | grep -q '"ok":true'; then
        echo "[INFO] Job $job_id confirmado"
        return 0
    else
        echo "[ERRO] Falha ao confirmar job $job_id: $response"
        return 1
    fi
}

# Função para calcular hash SHA256
get_file_hash() {
    local file_path="$1"
    sha256sum "$file_path" | awk '{print $1}'
}

# Função para scan de vírus
scan_file() {
    local file_path="$1"
    
    if [ ! -f "$file_path" ]; then
        echo "[ERRO] Arquivo não encontrado: $file_path"
        return 1
    fi
    
    local file_hash=$(get_file_hash "$file_path")
    
    local body=$(cat <<EOF
{
    "filePath": "$file_path",
    "fileHash": "$file_hash"
}
EOF
)
    
    local result=$(secure_request "\${BASE_URL}/functions/v1/scan-virus" "POST" "$body" 2>&1)
    
    if echo "$result" | grep -q '"isMalicious":true'; then
        echo "[ALERTA] Arquivo malicioso detectado!"
        echo "  Arquivo: $file_path"
        echo "  Hash: $file_hash"
        echo "$result" | jq '.' 2>/dev/null || echo "$result"
    else
        echo "[OK] Arquivo limpo: $file_path"
    fi
    
    echo "$result"
}

# Função principal
start_agent() {
    echo "==================================="
    echo "CyberShield Agent v2.0 - Iniciando"
    echo "==================================="
    echo "Servidor: $BASE_URL"
    echo "Intervalo: $POLL_INTERVAL segundos"
    echo "HMAC: Habilitado"
    echo ""
    
    while true; do
        # Polling de jobs
        jobs=$(poll_jobs 2>/dev/null || echo "[]")
        
        job_count=$(echo "$jobs" | jq 'length' 2>/dev/null || echo "0")
        
        if [ "$job_count" -gt 0 ]; then
            echo "[INFO] $job_count job(s) recebido(s)"
            
            echo "$jobs" | jq -c '.[]' | while read -r job; do
                job_id=$(echo "$job" | jq -r '.id')
                job_type=$(echo "$job" | jq -r '.type')
                job_payload=$(echo "$job" | jq -r '.payload // "{}"')
                
                # Executar job
                execute_job "$job_id" "$job_type" "$job_payload"
                
                # Confirmar job
                ack_job "$job_id"
            done
        fi
        
        # Aguardar próximo polling
        sleep $POLL_INTERVAL
    done
}

# Instalar como systemd service
install_service() {
    local service_name="cybershield-agent"
    local script_path="$(readlink -f "$0")"
    
    echo "Instalando serviço systemd..."
    
    cat > /etc/systemd/system/\${service_name}.service <<EOF
[Unit]
Description=CyberShield Security Agent
After=network.target

[Service]
Type=simple
User=root
ExecStart=/bin/bash "$script_path" "$AGENT_TOKEN" "$HMAC_SECRET" "$SERVER_URL" $POLL_INTERVAL
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF
    
    systemctl daemon-reload
    systemctl enable $service_name
    systemctl start $service_name
    
    echo "Serviço instalado e iniciado com sucesso!"
    systemctl status $service_name
}

# Verificar dependências
if ! command -v jq &> /dev/null; then
    echo "[WARN] jq não encontrado, instalando..."
    if command -v apt-get &> /dev/null; then
        apt-get update && apt-get install -y jq
    elif command -v yum &> /dev/null; then
        yum install -y jq
    fi
fi

# Iniciar agente
start_agent
`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
  };

  const downloadScript = (content: string, filename: string) => {
    const mimeType = filename.endsWith('.ps1') ? 'application/x-powershell' : 'application/x-sh';
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Script baixado!");
  };

  const StepIndicator = () => (
    <div className="flex items-center justify-center gap-4 mb-8">
      {[1, 2, 3].map((step) => (
        <div key={step} className="flex items-center">
          <div
            className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold transition-colors ${
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
        <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
          <Package className="h-8 w-8 text-primary animate-pulse-glow" />
        </div>
        <div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
            Instalador de Agente de Monitoramento
          </h1>
          <p className="text-sm text-muted-foreground">Configure e instale o agente no seu servidor em 3 passos</p>
        </div>
      </div>

      <Card className="bg-gradient-card border-primary/20">
        <CardContent className="pt-6">
          <StepIndicator />

          {/* Step 1: Configuração */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Passo 1: Configuração</h2>
                <p className="text-muted-foreground">Configure o nome do agente e plataforma</p>
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
                  <p className="text-xs text-muted-foreground text-center">
                    Use apenas letras maiúsculas, números e hífens
                  </p>
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

          {/* Step 2: Download */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Passo 2: Download do Agente</h2>
                <p className="text-muted-foreground">Baixe e execute o instalador no servidor que será monitorado</p>
                <p className="text-xs text-muted-foreground mt-2">
                  Nota: Você está instalando o <strong>agente de monitoramento</strong> no seu servidor. O backend já está ativo.
                </p>
              </div>

              <div className="max-w-2xl mx-auto">
                <Tabs value={platform} onValueChange={(v) => setPlatform(v as "windows" | "linux")}>
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="windows">Windows</TabsTrigger>
                    <TabsTrigger value="linux">Linux</TabsTrigger>
                  </TabsList>

                  <TabsContent value="windows" className="space-y-4 mt-4">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => downloadScript(windowsInstallScript, `install-${agentName}.ps1`)}
                        className="flex-1 h-14"
                        size="lg"
                      >
                        <Download className="mr-2 h-5 w-5" />
                        Baixar Script Windows
                      </Button>
                      <Button
                        onClick={() => copyToClipboard(windowsInstallScript, "Script")}
                        variant="outline"
                        size="lg"
                      >
                        <Copy className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                      <p className="font-semibold mb-2">📋 Instruções:</p>
                      <ol className="text-sm space-y-1 list-decimal list-inside">
                        <li>Baixe o script acima</li>
                        <li>Clique com botão direito → "Executar como Administrador"</li>
                        <li>Aguarde a instalação concluir</li>
                        <li>Clique em "Verificar Conexão" no próximo passo</li>
                      </ol>
                    </div>
                  </TabsContent>

                  <TabsContent value="linux" className="space-y-4 mt-4">
                    <div className="flex gap-2">
                      <Button
                        onClick={() => downloadScript(linuxInstallScript, `install-${agentName}.sh`)}
                        className="flex-1 h-14"
                        size="lg"
                      >
                        <Download className="mr-2 h-5 w-5" />
                        Baixar Script Linux
                      </Button>
                      <Button
                        onClick={() => copyToClipboard(linuxInstallScript, "Script")}
                        variant="outline"
                        size="lg"
                      >
                        <Copy className="h-5 w-5" />
                      </Button>
                    </div>

                    <div className="bg-warning/10 border border-warning/30 rounded-lg p-4">
                      <p className="font-semibold mb-2">📋 Instruções:</p>
                      <ol className="text-sm space-y-1 list-decimal list-inside">
                        <li>Baixe o script acima</li>
                        <li>Torne executável: chmod +x install-{agentName}.sh</li>
                        <li>Execute como root: sudo ./install-{agentName}.sh</li>
                        <li>Clique em "Verificar Conexão" no próximo passo</li>
                      </ol>
                    </div>
                  </TabsContent>
                </Tabs>

                <div className="flex gap-3 mt-6">
                  <Button
                    variant="outline"
                    onClick={() => setCurrentStep(1)}
                    className="flex-1"
                  >
                    ← Voltar
                  </Button>
                  <Button onClick={() => setCurrentStep(3)} className="flex-1">
                    Próximo: Verificar Conexão →
                  </Button>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Verificação */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h2 className="text-2xl font-bold mb-2">Passo 3: Verificação de Conexão</h2>
                <p className="text-muted-foreground">Aguardando o agente se conectar...</p>
              </div>

              <div className="max-w-md mx-auto">
                <Card className={isConnected ? "border-success" : "border-warning"}>
                  <CardContent className="pt-6">
                    <div className="flex flex-col items-center text-center space-y-4">
                      {isConnected ? (
                        <>
                          <div className="p-4 bg-success/10 rounded-full">
                            <Wifi className="h-12 w-12 text-success" />
                          </div>
                          <div>
                            <h3 className="text-xl font-bold text-success mb-1">
                              ✓ Agente Conectado!
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              O agente {agentName} está online e funcionando
                            </p>
                          </div>
                          <Button
                            onClick={() => {
                              setCurrentStep(1);
                              setAgentName("AGENT-01");
                              setAgentToken("");
                              setHmacSecret("");
                              setEnrollmentKey("");
                              setIsConnected(false);
                            }}
                            className="w-full"
                          >
                            Configurar Novo Agente
                          </Button>
                        </>
                      ) : (
                        <>
                          <div className="p-4 bg-warning/10 rounded-full">
                            {checkingConnection ? (
                              <Loader2 className="h-12 w-12 text-warning animate-spin" />
                            ) : (
                              <WifiOff className="h-12 w-12 text-warning" />
                            )}
                          </div>
                          <div>
                            <h3 className="text-xl font-bold mb-1">
                              Aguardando Conexão...
                            </h3>
                            <p className="text-sm text-muted-foreground">
                              Execute o script de instalação no servidor
                            </p>
                          </div>
                          <Button
                            onClick={checkAgentConnection}
                            variant="outline"
                            className="w-full"
                            disabled={checkingConnection}
                          >
                            {checkingConnection ? (
                              <>
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                Verificando...
                              </>
                            ) : (
                              "Verificar Novamente"
                            )}
                          </Button>
                          <Button
                            variant="ghost"
                            onClick={() => setCurrentStep(2)}
                            className="w-full"
                          >
                            ← Voltar ao Download
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentInstaller;
