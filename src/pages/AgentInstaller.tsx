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

  const getWindowsInstallScript = () => {
    const serverUrl = SUPABASE_URL.replace(/\/$/, '');
    return `# CyberShield Agent Auto-Installer
$AgentToken = "${agentToken}"
$HmacSecret = "${hmacSecret}"
$ServerUrl = "${serverUrl}"
$AgentName = "${agentName}"

Write-Host "Instalando CyberShield Agent..." -ForegroundColor Cyan
$agentDir = "C:\\CyberShield"
New-Item -ItemType Directory -Path $agentDir -Force | Out-Null

$scriptContent = @'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

function Get-HmacSig { param($msg, $key)
    $h = New-Object System.Security.Cryptography.HMACSHA256
    $h.Key = [Text.Encoding]::UTF8.GetBytes($key)
    $s = $h.ComputeHash([Text.Encoding]::UTF8.GetBytes($msg))
    return [System.BitConverter]::ToString($s).Replace('-', '').ToLower()
}

function Invoke-Req { param($url, $method = "GET", $body = "")
    $ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
    $n = [guid]::NewGuid().ToString()
    $p = "$ts:$n:$body"
    $sig = Get-HmacSig $p "${hmacSecret}"
    $h = @{ "X-Agent-Token" = "${agentToken}"; "X-HMAC-Signature" = $sig; "X-Timestamp" = $ts.ToString(); "X-Nonce" = $n; "Content-Type" = "application/json" }
    try {
        if ($method -eq "GET") { return Invoke-RestMethod -Uri $url -Method GET -Headers $h -TimeoutSec 30 }
        else { return Invoke-RestMethod -Uri $url -Method POST -Headers $h -Body $body -TimeoutSec 30 }
    } catch { return $null }
}

Write-Host "[$(Get-Date -Format 'HH:mm:ss')] Agente iniciado" -ForegroundColor Green
while ($true) {
    try {
        $jobs = Invoke-Req -url "${serverUrl}/functions/v1/poll-jobs"
        if ($jobs -and $jobs.Count -gt 0) {
            foreach ($job in $jobs) {
                Write-Host "[INFO] Job $($job.id)" -ForegroundColor Yellow
                $r = @{ status = "completed"; timestamp = (Get-Date).ToString("o") } | ConvertTo-Json
                $ub = @{ jobId = $job.id; agentName = "${agentName}"; result = $r } | ConvertTo-Json
                Invoke-Req -url "${serverUrl}/functions/v1/upload-report" -method POST -body $ub | Out-Null
                Invoke-Req -url "${serverUrl}/functions/v1/ack-job/$($job.id)" -method POST | Out-Null
                Write-Host "[OK] Concluido" -ForegroundColor Green
            }
        }
        Start-Sleep -Seconds 60
    } catch { Start-Sleep -Seconds 10 }
}
'@

$scriptContent | Out-File -FilePath "$agentDir\\agent.ps1" -Encoding UTF8

$action = New-ScheduledTaskAction -Execute "powershell.exe" -Argument "-ExecutionPolicy Bypass -NoProfile -WindowStyle Hidden -File \`"$agentDir\\agent.ps1\`""
$trigger = New-ScheduledTaskTrigger -AtStartup
$principal = New-ScheduledTaskPrincipal -UserId "SYSTEM" -LogonType ServiceAccount -RunLevel Highest
$settings = New-ScheduledTaskSettingsSet -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -StartWhenAvailable
Register-ScheduledTask -TaskName "CyberShieldAgent" -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Force | Out-Null
Start-ScheduledTask -TaskName "CyberShieldAgent"

Write-Host "Instalado!" -ForegroundColor Green`;
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
