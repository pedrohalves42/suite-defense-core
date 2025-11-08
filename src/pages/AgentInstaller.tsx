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

const DOMAIN = "suite-defense-core.lovable.app";

type Step = 1 | 2 | 3;

const AgentInstaller = () => {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState<Step>(1);
  const [agentName, setAgentName] = useState("AGENT-01");
  const [platform, setPlatform] = useState<"windows" | "linux">("windows");
  const [isGenerating, setIsGenerating] = useState(false);
  const [agentToken, setAgentToken] = useState("");
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

  const generateCredentials = async () => {
    if (!agentName.trim()) {
      toast.error("Nome do agente é obrigatório");
      return;
    }

    setIsGenerating(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      
      const res = await fetch(`https://${DOMAIN}/functions/v1/auto-generate-enrollment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${session?.access_token}`,
        },
        body: JSON.stringify({ agentName: agentName.trim() }),
      });

      if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || "Falha ao gerar credenciais");
      }

      const data = await res.json();
      setAgentToken(data.agentToken);
      setEnrollmentKey(data.enrollmentKey);
      setCurrentStep(2);
      toast.success("Credenciais geradas com sucesso!");
    } catch (error: any) {
      toast.error(error.message || "Erro ao gerar credenciais");
    } finally {
      setIsGenerating(false);
    }
  };

  const windowsInstallScript = `# CyberShield Agent - Windows Installer
# Execute como Administrador

$AgentName = "${agentName}"
$AgentToken = "${agentToken}"
$ServerUrl = "https://${DOMAIN}"

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

Write-Host "✓ Agente instalado em: $AgentDir" -ForegroundColor Green
Write-Host "✓ Configuração salva com sucesso!" -ForegroundColor Green
`;

  const linuxInstallScript = `#!/bin/bash
# CyberShield Agent - Linux Installer
# Execute com sudo

AGENT_NAME="${agentName}"
AGENT_TOKEN="${agentToken}"
SERVER_URL="https://${DOMAIN}"

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

chmod +x "$AGENT_DIR/agent.sh"

echo "✓ Agente instalado em: $AGENT_DIR"
echo "✓ Configuração salva com sucesso!"
`;

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast.success(`${label} copiado!`);
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
            Instalador de Agente
          </h1>
          <p className="text-sm text-muted-foreground">Configuração simplificada em 3 passos</p>
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
                <h2 className="text-2xl font-bold mb-2">Passo 2: Download do Script</h2>
                <p className="text-muted-foreground">Baixe e execute o instalador</p>
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
