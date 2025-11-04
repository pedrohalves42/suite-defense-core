import { useState } from "react";
import { Package, Download, Copy, CheckCircle2, Terminal, ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { useNavigate } from "react-router-dom";

const DOMAIN = "suite-defense-core.lovable.app";
const API_URL = `https://${DOMAIN}/functions/v1`;

const AgentInstaller = () => {
  const navigate = useNavigate();
  const [installType, setInstallType] = useState<"server" | "agent">("agent");
  const [agentName, setAgentName] = useState("AGENT-01");
  const [tenantId, setTenantId] = useState("production");
  const [enrollmentKey, setEnrollmentKey] = useState("");
  const [platform, setPlatform] = useState<"windows" | "linux">("windows");
  const [agentToken, setAgentToken] = useState("");
  const [isEnrolling, setIsEnrolling] = useState(false);
  const [serverPort, setServerPort] = useState("8080");

  const enrollAgent = async () => {
    if (!agentName.trim()) {
      toast.error("Nome do agente é obrigatório");
      return;
    }

    if (!enrollmentKey.trim()) {
      toast.error("Chave de enrollment é obrigatória");
      return;
    }

    setIsEnrolling(true);
    try {
      const res = await fetch(`${API_URL}/enroll-agent`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenantId: tenantId.trim(),
          enrollmentKey: enrollmentKey.trim(),
          agentName: agentName.trim(),
        }),
      });

      if (!res.ok) throw new Error("Falha na matrícula");

      const data = await res.json();
      setAgentToken(data.agentToken);
      toast.success("Token gerado com sucesso");
    } catch (error) {
      toast.error("Falha ao gerar token");
    } finally {
      setIsEnrolling(false);
    }
  };

  const windowsInstallScript = `# CyberShield ${installType === 'server' ? 'Server' : 'Agent'} - Windows Installer
# Execute como Administrador

$AgentName = "${agentName}"
$AgentToken = "${agentToken || 'SEU_TOKEN_AQUI'}"
$ServerUrl = "https://${DOMAIN}"
$ServerPort = "${serverPort}"

# Criar diretório do agente
$AgentDir = "C:\\Program Files\\CyberShield\\Agent"
New-Item -ItemType Directory -Force -Path $AgentDir | Out-Null

# Criar arquivo de configuração
$ConfigContent = @"
{
  "agentName": "$AgentName",
  "agentToken": "$AgentToken",
  "serverUrl": "$ServerUrl",
  "pollInterval": 30,
  "heartbeatInterval": 60
}
"@

$ConfigContent | Out-File -FilePath "$AgentDir\\config.json" -Encoding UTF8

# Criar script do agente (exemplo básico)
$AgentScript = @"
# CyberShield Agent Service
while ($true) {
    try {
        # Poll for jobs
        $headers = @{
            "X-Agent-Token" = "$AgentToken"
        }
        $jobs = Invoke-RestMethod -Uri "$ServerUrl/functions/v1/poll-jobs" -Headers $headers -Method GET
        
        if ($jobs.Count -gt 0) {
            Write-Host "Received $($jobs.Count) jobs"
            # Process jobs here
        }
        
        Start-Sleep -Seconds 30
    }
    catch {
        Write-Host "Error: $_"
        Start-Sleep -Seconds 60
    }
}
"@

$AgentScript | Out-File -FilePath "$AgentDir\\agent.ps1" -Encoding UTF8

Write-Host "✓ Agente instalado em: $AgentDir" -ForegroundColor Green
Write-Host "✓ Para iniciar: powershell -ExecutionPolicy Bypass -File '$AgentDir\\agent.ps1'" -ForegroundColor Green
`;

  const linuxInstallScript = `#!/bin/bash
# CyberShield ${installType === 'server' ? 'Server' : 'Agent'} - Linux Installer
# Execute com sudo

AGENT_NAME="${agentName}"
AGENT_TOKEN="${agentToken || 'SEU_TOKEN_AQUI'}"
SERVER_URL="https://${DOMAIN}"
SERVER_PORT="${serverPort}"

# Criar diretório do agente
AGENT_DIR="/opt/cybershield/agent"
mkdir -p "$AGENT_DIR"

# Criar arquivo de configuração
cat > "$AGENT_DIR/config.json" << EOF
{
  "agentName": "$AGENT_NAME",
  "agentToken": "$AGENT_TOKEN",
  "serverUrl": "$SERVER_URL",
  "pollInterval": 30,
  "heartbeatInterval": 60
}
EOF

# Criar script do agente
cat > "$AGENT_DIR/agent.sh" << 'EOF'
#!/bin/bash
# CyberShield Agent Service

while true; do
    # Poll for jobs
    JOBS=$(curl -s -H "X-Agent-Token: $AGENT_TOKEN" \\
        "$SERVER_URL/functions/v1/poll-jobs")
    
    if [ ! -z "$JOBS" ]; then
        echo "Received jobs: $JOBS"
        # Process jobs here
    fi
    
    sleep 30
done
EOF

chmod +x "$AGENT_DIR/agent.sh"

# Criar systemd service
cat > "/etc/systemd/system/cybershield-agent.service" << EOF
[Unit]
Description=CyberShield Security Agent
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$AGENT_DIR
ExecStart=$AGENT_DIR/agent.sh
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable cybershield-agent.service

echo "✓ Agente instalado em: $AGENT_DIR"
echo "✓ Para iniciar: systemctl start cybershield-agent"
echo "✓ Para ver logs: journalctl -u cybershield-agent -f"
`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado para a área de transferência`);
  };

  const downloadScript = (content: string, filename: string) => {
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Script ${filename} baixado`);
  };

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-5xl mx-auto space-y-6">
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => navigate("/")}
            className="shrink-0"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div className="p-3 bg-gradient-cyber rounded-xl border border-primary/20 shadow-glow-primary">
            <Package className="h-8 w-8 text-primary animate-pulse-glow" />
          </div>
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              CyberShield - Instalador Completo
            </h1>
            <p className="text-sm text-muted-foreground">Instalação de servidor e agentes | Domínio: {DOMAIN}</p>
          </div>
        </div>

        {/* Configuration Card */}
        <Card className="bg-gradient-card border-primary/20">
          <CardHeader>
            <CardTitle className="text-foreground">Configuração da Instalação</CardTitle>
            <CardDescription>Escolha o tipo e configure os parâmetros</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-2 gap-4 mb-4">
              <Button
                variant={installType === "server" ? "default" : "outline"}
                onClick={() => setInstallType("server")}
                className="h-16"
              >
                Servidor Central
              </Button>
              <Button
                variant={installType === "agent" ? "default" : "outline"}
                onClick={() => setInstallType("agent")}
                className="h-16"
              >
                Agente de Segurança
              </Button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {installType === "agent" && (
                <>
                  <div className="space-y-2">
                    <Label htmlFor="agentName">Nome do Agente</Label>
                    <Input
                      id="agentName"
                      placeholder="AGENT-01"
                      value={agentName}
                      onChange={(e) => setAgentName(e.target.value)}
                      className="bg-secondary border-border text-foreground"
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="tenantId">Tenant ID</Label>
                    <Input
                      id="tenantId"
                      placeholder="production"
                      value={tenantId}
                      onChange={(e) => setTenantId(e.target.value)}
                      className="bg-secondary border-border text-foreground"
                    />
                  </div>

                  <div className="space-y-2 md:col-span-2">
                    <Label htmlFor="enrollmentKey">Chave de Enrollment</Label>
                    <Input
                      id="enrollmentKey"
                      placeholder="XXXX-XXXX-XXXX-XXXX"
                      value={enrollmentKey}
                      onChange={(e) => setEnrollmentKey(e.target.value)}
                      className="bg-secondary border-border text-foreground"
                    />
                    <p className="text-xs text-muted-foreground">
                      Solicite uma chave de enrollment ao administrador do sistema
                    </p>
                  </div>
                </>
              )}
              
              {installType === "server" && (
                <div className="space-y-2">
                  <Label htmlFor="serverPort">Porta do Servidor</Label>
                  <Input
                    id="serverPort"
                    placeholder="8080"
                    value={serverPort}
                    onChange={(e) => setServerPort(e.target.value)}
                    className="bg-secondary border-border text-foreground"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="platform">Plataforma</Label>
                <Select value={platform} onValueChange={(value: "windows" | "linux") => setPlatform(value)}>
                  <SelectTrigger className="bg-secondary border-border text-foreground">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="windows">Windows</SelectItem>
                    <SelectItem value="linux">Linux</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              {installType === "agent" && (
                <div className="space-y-2">
                  <Label>&nbsp;</Label>
                  <Button onClick={enrollAgent} disabled={isEnrolling} className="w-full">
                    {isEnrolling ? "Gerando Token..." : "Gerar Token de Agente"}
                  </Button>
                </div>
              )}
            </div>

            {agentToken && (
              <div className="space-y-2 p-4 bg-secondary/50 rounded-lg border border-accent/20">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-success" />
                    <p className="text-sm font-semibold text-success">Token Gerado</p>
                  </div>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => copyToClipboard(agentToken, "Token")}
                    className="gap-2"
                  >
                    <Copy className="h-3 w-3" />
                    Copiar
                  </Button>
                </div>
                <code className="block text-xs font-mono break-all text-muted-foreground bg-background/50 p-2 rounded">
                  {agentToken}
                </code>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Installation Scripts */}
        <Card className="bg-gradient-card border-primary/20">
          <CardHeader>
            <CardTitle className="text-foreground flex items-center gap-2">
              <Terminal className="h-5 w-5 text-primary" />
              Scripts de Instalação
            </CardTitle>
            <CardDescription>Scripts prontos para deploy do agente</CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs value={platform} onValueChange={(value) => setPlatform(value as "windows" | "linux")}>
              <TabsList className="grid w-full grid-cols-2 bg-secondary">
                <TabsTrigger value="windows">Windows (PowerShell)</TabsTrigger>
                <TabsTrigger value="linux">Linux (Bash)</TabsTrigger>
              </TabsList>

              <TabsContent value="windows" className="space-y-3 mt-4">
                <div className="flex gap-2">
                  <Button
                    onClick={() => copyToClipboard(windowsInstallScript, "Script Windows")}
                    variant="secondary"
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar Script
                  </Button>
                  <Button
                    onClick={() => downloadScript(windowsInstallScript, `install-agent-${agentName}.ps1`)}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Baixar Script
                  </Button>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4 border border-border overflow-x-auto">
                  <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                    {windowsInstallScript}
                  </pre>
                </div>
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <p className="text-sm text-warning-foreground font-semibold">Instruções Windows:</p>
                  <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                    <li>Abra PowerShell como Administrador</li>
                    <li>Execute o script de instalação</li>
                    <li>O agente será instalado em C:\Program Files\CyberShield\Agent</li>
                    <li>Configure como serviço do Windows se necessário</li>
                  </ol>
                </div>
              </TabsContent>

              <TabsContent value="linux" className="space-y-3 mt-4">
                <div className="flex gap-2">
                  <Button
                    onClick={() => copyToClipboard(linuxInstallScript, "Script Linux")}
                    variant="secondary"
                    className="gap-2"
                  >
                    <Copy className="h-4 w-4" />
                    Copiar Script
                  </Button>
                  <Button
                    onClick={() => downloadScript(linuxInstallScript, `install-agent-${agentName}.sh`)}
                    className="gap-2"
                  >
                    <Download className="h-4 w-4" />
                    Baixar Script
                  </Button>
                </div>
                <div className="bg-secondary/30 rounded-lg p-4 border border-border overflow-x-auto">
                  <pre className="text-xs font-mono text-foreground whitespace-pre-wrap">
                    {linuxInstallScript}
                  </pre>
                </div>
                <div className="bg-warning/10 border border-warning/30 rounded-lg p-3">
                  <p className="text-sm text-warning-foreground font-semibold">Instruções Linux:</p>
                  <ol className="text-xs text-muted-foreground mt-2 space-y-1 list-decimal list-inside">
                    <li>Salve o script e torne-o executável: chmod +x install-agent.sh</li>
                    <li>Execute como root: sudo ./install-agent.sh</li>
                    <li>O agente será instalado em /opt/cybershield/agent</li>
                    <li>O serviço systemd será criado e habilitado automaticamente</li>
                  </ol>
                </div>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default AgentInstaller;
