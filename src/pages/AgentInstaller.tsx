import { useState } from "react";
import { Package, Download, Terminal, CheckCircle2, Monitor, Server, Loader2, Copy } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const AgentInstaller = () => {
  const [agentName, setAgentName] = useState("");
  const [platform, setPlatform] = useState<"windows" | "linux">("windows");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCopyPaste, setShowCopyPaste] = useState(false);
  const [installCommand, setInstallCommand] = useState("");

  const generateInstaller = async () => {
    if (!agentName.trim()) {
      toast.error("Por favor, informe o nome do agente");
      return;
    }

    setIsGenerating(true);
    
    try {
      // 1. Gerar credenciais através do auto-generate-enrollment
      toast.info("Gerando credenciais do agente...");
      const { data: credentials, error: credError } = await supabase.functions.invoke(
        'auto-generate-enrollment',
        {
          body: { agentName: agentName.trim() }
        }
      );

      if (credError) throw credError;
      if (!credentials) throw new Error("Nenhuma credencial foi retornada");

      toast.success("Credenciais geradas com sucesso!");

      // 2. Baixar template da plataforma
      const templatePath = platform === 'windows' 
        ? '/templates/install-windows-template.ps1'
        : '/templates/install-linux-template.sh';
      
      const agentScriptPath = platform === 'windows'
        ? '/agent-scripts/cybershield-agent-windows.ps1'
        : '/agent-scripts/cybershield-agent-linux.sh';

      toast.info("Baixando templates...");
      const [templateResponse, agentScriptResponse] = await Promise.all([
        fetch(templatePath),
        fetch(agentScriptPath)
      ]);

      if (!templateResponse.ok || !agentScriptResponse.ok) {
        throw new Error('Falha ao baixar templates');
      }

      let templateContent = await templateResponse.text();
      const agentScriptContent = await agentScriptResponse.text();

      // 3. Substituir placeholders no template
      toast.info("Configurando instalador...");
      templateContent = templateContent
        .replace(/\{\{AGENT_TOKEN\}\}/g, credentials.agentToken)
        .replace(/\{\{HMAC_SECRET\}\}/g, credentials.hmacSecret)
        .replace(/\{\{SERVER_URL\}\}/g, SUPABASE_URL)
        .replace(/\{\{AGENT_SCRIPT_CONTENT\}\}/g, agentScriptContent)
        .replace(/\{\{TIMESTAMP\}\}/g, new Date().toISOString());

      // 4. Criar arquivo para download
      const fileName = platform === 'windows'
        ? `install-${agentName}-windows.ps1`
        : `install-${agentName}-linux.sh`;

      const blob = new Blob([templateContent], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`✅ Instalador gerado e baixado com sucesso!`, {
        description: `Arquivo: ${fileName}`
      });

      // Mostrar informações úteis
      toast.info(`Agente ID: ${credentials.agentId}`, {
        description: "Credenciais válidas até: " + new Date(credentials.expiresAt).toLocaleString(),
        duration: 10000
      });

    } catch (error: any) {
      console.error('Erro ao gerar instalador:', error);
      toast.error("Erro ao gerar instalador", {
        description: error.message || "Tente novamente"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const generateCopyPasteCommand = async () => {
    if (!agentName.trim()) {
      toast.error("Por favor, informe o nome do agente");
      return;
    }

    setIsGenerating(true);
    
    try {
      // Gerar credenciais e enrollment key
      toast.info("Gerando link temporário...");
      const { data: credentials, error: credError } = await supabase.functions.invoke(
        'auto-generate-enrollment',
        {
          body: { agentName: agentName.trim() }
        }
      );

      if (credError) throw credError;
      if (!credentials) throw new Error("Nenhuma credencial foi retornada");

      // Gerar comando copy-paste com o enrollment key
      const installUrl = `${SUPABASE_URL}/functions/v1/serve-installer/${credentials.enrollmentKey}`;
      
      const command = platform === 'windows'
        ? `irm ${installUrl} | iex`
        : `curl -sL ${installUrl} | sudo bash`;

      setInstallCommand(command);
      setShowCopyPaste(true);

      toast.success("Comando gerado com sucesso!", {
        description: "Copie e cole no servidor para instalar"
      });

    } catch (error: any) {
      console.error('Erro ao gerar comando:', error);
      toast.error("Erro ao gerar comando", {
        description: error.message || "Tente novamente"
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const copyToClipboard = () => {
    navigator.clipboard.writeText(installCommand);
    toast.success("Comando copiado!", {
      description: "Cole no terminal do servidor"
    });
  };

  return (
    <div className="container mx-auto p-6 max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Package className="h-10 w-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Gerador de Instaladores</h1>
          <p className="text-muted-foreground">
            Crie instaladores prontos para usar com credenciais já configuradas
          </p>
        </div>
      </div>

      {/* Alert de Nova Funcionalidade */}
      <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
        <CheckCircle2 className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800 dark:text-green-200">
          <strong>✨ Novo:</strong> Agora o instalador é gerado automaticamente com credenciais já configuradas! 
          Não é mais necessário editar placeholders manualmente.
        </AlertDescription>
      </Alert>

      {/* Formulário de Geração */}
      <Card>
        <CardHeader>
          <CardTitle>Configurar Novo Agente</CardTitle>
          <CardDescription>
            Informe o nome do agente e escolha a plataforma para gerar o instalador
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Nome do Agente */}
          <div className="space-y-2">
            <Label htmlFor="agentName">Nome do Agente *</Label>
            <Input
              id="agentName"
              placeholder="ex: servidor-web-01, backup-server, database-prod"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              disabled={isGenerating}
            />
            <p className="text-xs text-muted-foreground">
              Use um nome descritivo para identificar facilmente o servidor
            </p>
          </div>

          {/* Plataforma */}
          <div className="space-y-3">
            <Label>Plataforma *</Label>
            <RadioGroup 
              value={platform} 
              onValueChange={(value) => setPlatform(value as "windows" | "linux")}
              disabled={isGenerating}
            >
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent">
                <RadioGroupItem value="windows" id="windows" />
                <Label htmlFor="windows" className="flex items-center gap-2 flex-1 cursor-pointer">
                  <Monitor className="h-4 w-4" />
                  <div>
                    <div className="font-semibold">Windows</div>
                    <div className="text-xs text-muted-foreground">
                      Windows Server 2012+, Windows 10/11
                    </div>
                  </div>
                  <Badge variant="outline" className="ml-auto">PowerShell</Badge>
                </Label>
              </div>
              <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent">
                <RadioGroupItem value="linux" id="linux" />
                <Label htmlFor="linux" className="flex items-center gap-2 flex-1 cursor-pointer">
                  <Server className="h-4 w-4" />
                  <div>
                    <div className="font-semibold">Linux</div>
                    <div className="text-xs text-muted-foreground">
                      Ubuntu, Debian, CentOS, RHEL
                    </div>
                  </div>
                  <Badge variant="outline" className="ml-auto">Bash</Badge>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {/* Botões de Gerar */}
          <div className="space-y-3">
            <Button 
              onClick={generateInstaller} 
              disabled={isGenerating || !agentName.trim()}
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Download className="h-4 w-4 mr-2" />
                  Gerar e Baixar Instalador (.ps1/.sh)
                </>
              )}
            </Button>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <span className="w-full border-t" />
              </div>
              <div className="relative flex justify-center text-xs uppercase">
                <span className="bg-background px-2 text-muted-foreground">
                  Ou use instalação simplificada
                </span>
              </div>
            </div>

            <Button 
              onClick={generateCopyPasteCommand} 
              disabled={isGenerating || !agentName.trim()}
              variant="outline"
              className="w-full"
              size="lg"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Gerando...
                </>
              ) : (
                <>
                  <Terminal className="h-4 w-4 mr-2" />
                  Gerar Comando One-Click
                </>
              )}
            </Button>
          </div>

          {/* Comando Copy-Paste */}
          {showCopyPaste && installCommand && (
            <Alert className="border-primary bg-primary/5">
              <Terminal className="h-4 w-4" />
              <AlertDescription>
                <div className="space-y-3">
                  <div>
                    <strong className="block mb-2">✨ Comando pronto para usar:</strong>
                    <div className="relative">
                      <pre className="bg-muted p-3 rounded text-sm overflow-x-auto">
                        {installCommand}
                      </pre>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="absolute top-2 right-2"
                        onClick={copyToClipboard}
                      >
                        📋 Copiar
                      </Button>
                    </div>
                  </div>
                  <div className="text-sm space-y-1">
                    <p className="font-semibold">Como usar:</p>
                    <ol className="list-decimal list-inside space-y-1 text-xs">
                      <li>Copie o comando acima</li>
                      <li>Abra {platform === 'windows' ? 'PowerShell como Administrador' : 'terminal como root'} no servidor</li>
                      <li>Cole e pressione Enter</li>
                      <li>Aguarde a instalação automática (≈30 segundos)</li>
                    </ol>
                    <p className="text-xs text-muted-foreground mt-2">
                      ⚠️ O link expira em 24 horas por segurança
                    </p>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Instruções de Instalação */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Terminal className="h-4 w-4" />
            Como Instalar o Agente
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {platform === "windows" ? (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Passos para Windows:</h4>
              <ol className="text-sm space-y-2 list-decimal list-inside">
                <li>Clique em <strong>"Gerar e Baixar Instalador"</strong> acima</li>
                <li>Copie o arquivo <code className="bg-muted px-1 py-0.5 rounded">.ps1</code> para o servidor Windows</li>
                <li>Clique com botão direito no arquivo e selecione <strong>"Executar com PowerShell"</strong></li>
                <li>Ou abra PowerShell como Administrador e execute:
                  <code className="block bg-muted px-2 py-1 rounded mt-1">.\install-{agentName || 'agente'}-windows.ps1</code>
                </li>
                <li>Aguarde a conclusão da instalação (≈30 segundos)</li>
                <li>O agente iniciará automaticamente e aparecerá no dashboard</li>
              </ol>
            </div>
          ) : (
            <div className="space-y-3">
              <h4 className="font-semibold text-sm">Passos para Linux:</h4>
              <ol className="text-sm space-y-2 list-decimal list-inside">
                <li>Clique em <strong>"Gerar e Baixar Instalador"</strong> acima</li>
                <li>Copie o arquivo <code className="bg-muted px-1 py-0.5 rounded">.sh</code> para o servidor Linux</li>
                <li>Dê permissão de execução:
                  <code className="block bg-muted px-2 py-1 rounded mt-1">chmod +x install-{agentName || 'agente'}-linux.sh</code>
                </li>
                <li>Execute como root:
                  <code className="block bg-muted px-2 py-1 rounded mt-1">sudo ./install-{agentName || 'agente'}-linux.sh</code>
                </li>
                <li>Aguarde a conclusão da instalação</li>
                <li>O agente iniciará automaticamente e aparecerá no dashboard</li>
              </ol>
            </div>
          )}

          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <strong>✅ Pronto para usar:</strong> O instalador gerado já contém todas as credenciais necessárias.
              Não é necessário editar nenhum arquivo ou configurar manualmente.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      {/* O que acontece após a instalação */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📊 O que acontece após a instalação?</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm">
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>O agente envia <strong>heartbeats a cada 60 segundos</strong> confirmando que está online</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Métricas do sistema (CPU, RAM, Disco) são coletadas <strong>a cada 5 minutos</strong></span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>O agente busca <strong>jobs pendentes</strong> para executar automaticamente</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Alertas são gerados caso recursos do sistema ultrapassem limites (&gt;80% CPU/RAM/Disco)</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 flex-shrink-0" />
              <span>Você pode visualizar tudo em tempo real no <strong>Dashboard de Monitoramento</strong></span>
            </li>
          </ul>

          <div className="mt-4 pt-4 border-t">
            <Button variant="link" className="p-0 h-auto" asChild>
              <a href="/docs/exe-build" target="_blank" rel="noopener noreferrer">
                📖 Como compilar o instalador para EXE (Windows)
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentInstaller;
