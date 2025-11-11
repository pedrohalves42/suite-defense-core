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

  const startConnectionMonitoring = (agentId: string) => {
    let checkCount = 0;
    const maxChecks = 12;
    
    const checkInterval = setInterval(async () => {
      checkCount++;
      console.log(`[AgentInstaller] Connection check ${checkCount}/${maxChecks} for agent:`, agentId);
      
      try {
        const { data: agent, error } = await supabase
          .from('agents')
          .select('last_heartbeat, status')
          .eq('id', agentId)
          .single();
        
        if (error) {
          console.error('[AgentInstaller] Error checking agent:', error);
          return;
        }
        
        if (agent && agent.last_heartbeat) {
          const heartbeatTime = new Date(agent.last_heartbeat);
          const now = new Date();
          const timeDiff = now.getTime() - heartbeatTime.getTime();
          
          if (timeDiff < 120000) {
            clearInterval(checkInterval);
            setIsConnected(true);
            toast.success("✅ Agente conectado com sucesso!");
            console.log('[AgentInstaller] Agent connected successfully');
          }
        }
        
        if (checkCount >= maxChecks) {
          clearInterval(checkInterval);
          console.warn('[AgentInstaller] Connection monitoring timed out');
          toast.warning("Agente instalado, mas ainda não conectado. Verifique os logs do agente.");
        }
      } catch (err) {
        console.error('[AgentInstaller] Error in connection monitoring:', err);
      }
    }, 10000);
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
      toast.success("Credenciais geradas com sucesso!");
      
      if (data.agentId) {
        console.log('[AgentInstaller] Starting connection monitoring for agent:', data.agentId);
        startConnectionMonitoring(data.agentId);
      }
    } catch (error: any) {
      if (error?.message?.includes('Failed to fetch') && retryCount < 2) {
        await new Promise(resolve => setTimeout(resolve, 500 * (retryCount + 1)));
        return generateCredentialsWithRetry(retryCount + 1);
      }

      let errorMessage = 'Erro ao gerar credenciais';
      if (/unauthorized|invalid token/i.test(error?.message)) {
        errorMessage = 'Erro de autenticação. Por favor, faça login novamente.';
      }
      toast.error(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCredentials = () => generateCredentialsWithRetry(0);

  const generateLinuxInstaller = async () => {
    if (!agentToken || !hmacSecret) {
      toast.error("Credenciais não geradas ainda");
      return;
    }

    try {
      const [templateRes, agentScriptRes] = await Promise.all([
        fetch('/templates/install-linux-template.sh'),
        fetch('/agent-scripts/cybershield-agent-linux.sh')
      ]);

      if (!templateRes.ok || !agentScriptRes.ok) {
        throw new Error('Failed to load installation templates');
      }

      let template = await templateRes.text();
      const agentScript = await agentScriptRes.text();

      template = template
        .replace(/{{TIMESTAMP}}/g, new Date().toISOString())
        .replace(/{{AGENT_TOKEN}}/g, agentToken)
        .replace(/{{HMAC_SECRET}}/g, hmacSecret)
        .replace(/{{SERVER_URL}}/g, SUPABASE_URL.replace(/\/$/, ''))
        .replace(/{{AGENT_SCRIPT_CONTENT}}/g, agentScript);

      const blob = new Blob([template], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cybershield-installer-linux-${agentName}.sh`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Script Linux baixado com sucesso!");
      setCurrentStep(3);
    } catch (error) {
      console.error('Error generating Linux installer:', error);
      toast.error("Erro ao gerar instalador Linux");
    }
  };

  const generateWindowsInstaller = async () => {
    if (!agentToken || !hmacSecret) {
      toast.error("Credenciais não geradas ainda");
      return;
    }

    try {
      const [templateRes, agentScriptRes] = await Promise.all([
        fetch('/templates/install-windows-template.ps1'),
        fetch('/agent-scripts/cybershield-agent-windows.ps1')
      ]);

      if (!templateRes.ok || !agentScriptRes.ok) {
        throw new Error('Failed to load installation templates');
      }

      let template = await templateRes.text();
      const agentScript = await agentScriptRes.text();

      template = template
        .replace(/{{TIMESTAMP}}/g, new Date().toISOString())
        .replace(/{{AGENT_TOKEN}}/g, agentToken)
        .replace(/{{HMAC_SECRET}}/g, hmacSecret)
        .replace(/{{SERVER_URL}}/g, SUPABASE_URL.replace(/\/$/, ''))
        .replace(/{{AGENT_SCRIPT_CONTENT}}/g, agentScript);

      const blob = new Blob([template], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `cybershield-installer-windows-${agentName}.ps1`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Script Windows baixado com sucesso!");
      setCurrentStep(3);
    } catch (error) {
      console.error('Error generating Windows installer:', error);
      toast.error("Erro ao gerar instalador Windows");
    }
  };

  const downloadInstaller = () => {
    if (platform === "linux") {
      generateLinuxInstaller();
    } else {
      generateWindowsInstaller();
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl">
      <Card>
        <CardHeader>
          <div className="flex items-center gap-3">
            <Package className="h-8 w-8" />
            <div>
              <CardTitle>Instalador de Agente</CardTitle>
              <CardDescription>
                Configure e instale o agente de monitoramento CyberShield
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {currentStep === 1 && (
            <div className="space-y-6">
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="agentName">Nome do Agente</Label>
                  <Input
                    id="agentName"
                    placeholder="Ex: SERVIDOR-WEB-01"
                    value={agentName}
                    onChange={(e) => setAgentName(e.target.value.toUpperCase())}
                    className="font-mono"
                  />
                  <p className="text-sm text-muted-foreground">
                    Use letras maiúsculas, números e hífens. Este nome identificará o agente no dashboard.
                  </p>
                </div>

                <div className="space-y-2">
                  <Label>Plataforma</Label>
                  <div className="grid grid-cols-2 gap-4">
                    <Card
                      className={`cursor-pointer transition-all ${
                        platform === "windows" ? "border-primary ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setPlatform("windows")}
                    >
                      <CardContent className="p-4 text-center">
                        <Terminal className="h-8 w-8 mx-auto mb-2" />
                        <p className="font-semibold">Windows</p>
                        <p className="text-sm text-muted-foreground">Server 2012+</p>
                      </CardContent>
                    </Card>
                    <Card
                      className={`cursor-pointer transition-all ${
                        platform === "linux" ? "border-primary ring-2 ring-primary" : ""
                      }`}
                      onClick={() => setPlatform("linux")}
                    >
                      <CardContent className="p-4 text-center">
                        <Terminal className="h-8 w-8 mx-auto mb-2" />
                        <p className="font-semibold">Linux</p>
                        <p className="text-sm text-muted-foreground">Ubuntu, CentOS, Debian</p>
                      </CardContent>
                    </Card>
                  </div>
                </div>

                <Button
                  onClick={generateCredentials}
                  disabled={isGenerating || !agentName.trim()}
                  className="w-full"
                  size="lg"
                >
                  {isGenerating ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Gerando...
                    </>
                  ) : (
                    <>
                      <Play className="mr-2 h-4 w-4" />
                      Gerar Instalador
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {currentStep === 2 && (
            <div className="space-y-6">
              <div className="flex items-center justify-center mb-4">
                <CheckCircle2 className="h-16 w-16 text-green-500" />
              </div>

              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">Credenciais Geradas!</h3>
                <p className="text-muted-foreground">
                  Baixe o instalador e execute no servidor destino
                </p>
              </div>

              <div className="space-y-4 p-4 bg-muted rounded-lg">
                <div>
                  <Label className="text-xs text-muted-foreground">Agent Token</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 p-2 bg-background rounded border text-xs break-all">
                      {agentToken}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(agentToken);
                        toast.success("Token copiado!");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                <div>
                  <Label className="text-xs text-muted-foreground">HMAC Secret</Label>
                  <div className="flex items-center gap-2 mt-1">
                    <code className="flex-1 p-2 bg-background rounded border text-xs break-all">
                      {hmacSecret}
                    </code>
                    <Button
                      variant="outline"
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(hmacSecret);
                        toast.success("Secret copiado!");
                      }}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              <div className="space-y-2">
                <Button onClick={downloadInstaller} className="w-full" size="lg">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Instalador {platform === "windows" ? "Windows" : "Linux"}
                </Button>

                <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg">
                  <h4 className="font-semibold mb-2 flex items-center gap-2">
                    <Terminal className="h-4 w-4" />
                    Como Instalar:
                  </h4>
                  {platform === "windows" ? (
                    <ol className="text-sm space-y-1 list-decimal list-inside">
                      <li>Copie o arquivo .ps1 para o servidor Windows</li>
                      <li>Abra PowerShell como Administrador</li>
                      <li>Execute: <code className="bg-background px-1 py-0.5 rounded">.\cybershield-installer-windows-{agentName}.ps1</code></li>
                      <li>Aguarde a conclusão da instalação</li>
                    </ol>
                  ) : (
                    <ol className="text-sm space-y-1 list-decimal list-inside">
                      <li>Copie o arquivo .sh para o servidor Linux</li>
                      <li>Dê permissão de execução: <code className="bg-background px-1 py-0.5 rounded">chmod +x cybershield-installer-linux-{agentName}.sh</code></li>
                      <li>Execute como root: <code className="bg-background px-1 py-0.5 rounded">sudo ./cybershield-installer-linux-{agentName}.sh</code></li>
                      <li>Aguarde a conclusão da instalação</li>
                    </ol>
                  )}
                </div>

                <Button variant="outline" onClick={() => setCurrentStep(1)} className="w-full">
                  Voltar
                </Button>
              </div>
            </div>
          )}

          {currentStep === 3 && (
            <div className="space-y-6">
              <div className="text-center mb-6">
                <h3 className="text-2xl font-bold mb-2">Instalação Iniciada</h3>
                <p className="text-muted-foreground">
                  Aguardando conexão do agente...
                </p>
              </div>

              <Card className="border-2">
                <CardContent className="pt-6">
                  <div className="flex flex-col items-center justify-center gap-4 min-h-[200px]">
                    {isConnected ? (
                      <>
                        <Wifi className="h-16 w-16 text-green-500" />
                        <div className="text-center">
                          <h3 className="text-xl font-bold text-green-500">Conectado!</h3>
                          <p className="text-sm text-muted-foreground">
                            O agente está online e enviando dados
                          </p>
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
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentInstaller;
