import { useState, useEffect } from "react";
import { Package, Download, Terminal, CheckCircle2, Monitor, Server, Loader2, Copy, AlertTriangle, Shield, Clock, FileCheck, BookOpen, HelpCircle, Zap } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

// Retry with exponential backoff: 2s, 4s, 8s
const retryWithBackoff = async <T,>(
  fn: () => Promise<T>,
  maxRetries = 3,
  initialDelay = 2000
): Promise<T> => {
  let lastError: any;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      
      if (attempt < maxRetries - 1) {
        const delay = initialDelay * Math.pow(2, attempt);
        toast.info(`Tentativa ${attempt + 1}/${maxRetries} falhou. Tentando novamente em ${delay/1000}s...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
};

const AgentInstaller = () => {
  const [agentName, setAgentName] = useState("");
  const [platform, setPlatform] = useState<"windows" | "linux">("windows");
  const [isGenerating, setIsGenerating] = useState(false);
  const [showCopyPaste, setShowCopyPaste] = useState(false);
  const [installCommand, setInstallCommand] = useState("");
  const [agentNameError, setAgentNameError] = useState("");
  const [previewCredentials, setPreviewCredentials] = useState<{
    agentId?: string;
    expiresAt?: string;
  } | null>(null);

  // Validação em tempo real do nome do agente
  useEffect(() => {
    if (!agentName) {
      setAgentNameError("");
      return;
    }

    const invalidChars = /[^a-zA-Z0-9\-_]/;
    if (invalidChars.test(agentName)) {
      setAgentNameError("❌ Use apenas letras, números, hífens e underscores");
    } else if (agentName.length < 3) {
      setAgentNameError("⚠️ Mínimo de 3 caracteres");
    } else if (agentName.length > 50) {
      setAgentNameError("⚠️ Máximo de 50 caracteres");
    } else {
      setAgentNameError("✓ Nome válido");
    }
  }, [agentName]);

  const isNameValid = agentName.length >= 3 && agentName.length <= 50 && !/[^a-zA-Z0-9\-_]/.test(agentName);

  const generateInstaller = async () => {
    if (!isNameValid) {
      toast.error("Nome do agente inválido");
      return;
    }

    setIsGenerating(true);
    
    try {
      // 1. Gerar credenciais através do auto-generate-enrollment com retry
      toast.info("Gerando credenciais do agente...");
      const { data: credentials, error: credError } = await retryWithBackoff(
        () => supabase.functions.invoke('auto-generate-enrollment', {
          body: { agentName: agentName.trim() }
        })
      );

      if (credError) throw credError;
      if (!credentials) throw new Error("Nenhuma credencial foi retornada");

      setPreviewCredentials({
        agentId: credentials.agentId,
        expiresAt: credentials.expiresAt
      });

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

      // Track download event
      await supabase.functions.invoke('track-installation-event', {
        body: {
          agent_name: agentName.trim(),
          event_type: 'downloaded',
          platform: platform,
          installation_method: 'download'
        }
      }).catch(err => console.error('Failed to track download event:', err));

      toast.success(`✅ Instalador gerado e baixado com sucesso!`, {
        description: `Arquivo: ${fileName}`
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
    if (!isNameValid) {
      toast.error("Nome do agente inválido");
      return;
    }

    setIsGenerating(true);
    
    try {
      // Gerar credenciais e enrollment key com retry
      toast.info("Gerando link temporário...");
      const { data: credentials, error: credError } = await retryWithBackoff(
        () => supabase.functions.invoke('auto-generate-enrollment', {
          body: { agentName: agentName.trim() }
        })
      );

      if (credError) throw credError;
      if (!credentials) throw new Error("Nenhuma credencial foi retornada");

      setPreviewCredentials({
        agentId: credentials.agentId,
        expiresAt: credentials.expiresAt
      });

      // Gerar comando copy-paste com o enrollment key
      const installUrl = `${SUPABASE_URL}/functions/v1/serve-installer/${credentials.enrollmentKey}`;
      
      const command = platform === 'windows'
        ? `irm ${installUrl} | iex`
        : `curl -sL ${installUrl} | sudo bash`;

      setInstallCommand(command);
      setShowCopyPaste(true);

      // Track generation event
      await supabase.functions.invoke('track-installation-event', {
        body: {
          agent_name: agentName.trim(),
          event_type: 'generated',
          platform: platform,
          installation_method: 'one_click'
        }
      }).catch(err => console.error('Failed to track generation event:', err));

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

  const copyToClipboard = async () => {
    navigator.clipboard.writeText(installCommand);
    
    // Track copy event
    await supabase.functions.invoke('track-installation-event', {
      body: {
        agent_name: agentName.trim(),
        event_type: 'command_copied',
        platform: platform,
        installation_method: 'one_click'
      }
    }).catch(err => console.error('Failed to track copy event:', err));
    
    toast.success("Comando copiado!", {
      description: "Cole no terminal do servidor"
    });
  };

  const downloadValidationScript = () => {
    const a = document.createElement('a');
    a.href = '/scripts/post-installation-validation.ps1';
    a.download = 'post-installation-validation.ps1';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast.success("Script de validação baixado!");
  };

  return (
    <div className="container mx-auto p-6 max-w-5xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div className="p-3 bg-primary/10 rounded-lg">
          <Package className="h-10 w-10 text-primary" />
        </div>
        <div>
          <h1 className="text-3xl font-bold">Gerador de Instaladores CyberShield</h1>
          <p className="text-muted-foreground">
            Instalação simplificada em 1 comando - sem configuração manual
          </p>
        </div>
      </div>

      {/* Alert de Nova Funcionalidade */}
      <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
        <Zap className="h-4 w-4 text-green-600" />
        <AlertDescription className="text-green-800 dark:text-green-200">
          <strong>✨ Instalação One-Click:</strong> Agora você pode instalar o agente em 1 comando! 
          Credenciais são geradas automaticamente e configuradas no instalador.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="generator" className="space-y-6">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="generator">
            <Zap className="h-4 w-4 mr-2" />
            Gerar Instalador
          </TabsTrigger>
          <TabsTrigger value="tutorial">
            <BookOpen className="h-4 w-4 mr-2" />
            Tutorial
          </TabsTrigger>
          <TabsTrigger value="faq">
            <HelpCircle className="h-4 w-4 mr-2" />
            FAQ
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: GERADOR */}
        <TabsContent value="generator" className="space-y-6">
          {/* Pré-requisitos */}
          <Card className="border-blue-500 bg-blue-50 dark:bg-blue-950">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-blue-600" />
                Pré-requisitos
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid md:grid-cols-2 gap-4 text-sm">
                <div className="space-y-2">
                  <p className="font-semibold">Windows:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Windows Server 2012+ ou Windows 10/11</li>
                    <li>• PowerShell 5.1 ou superior</li>
                    <li>• Privilégios de Administrador</li>
                    <li>• Conexão com a internet</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <p className="font-semibold">Linux:</p>
                  <ul className="space-y-1 text-muted-foreground">
                    <li>• Ubuntu 18.04+, Debian 10+, CentOS 7+</li>
                    <li>• Bash 4.0 ou superior</li>
                    <li>• Acesso root (sudo)</li>
                    <li>• Conexão com a internet</li>
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Formulário de Geração */}
          <Card>
            <CardHeader>
              <CardTitle>Configurar Novo Agente</CardTitle>
              <CardDescription>
                Informe o nome do agente e escolha a plataforma
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Nome do Agente com Validação */}
              <div className="space-y-2">
                <Label htmlFor="agentName">Nome do Agente *</Label>
                <Input
                  id="agentName"
                  placeholder="ex: servidor-web-01, backup-server, database-prod"
                  value={agentName}
                  onChange={(e) => setAgentName(e.target.value)}
                  disabled={isGenerating}
                  className={agentNameError.includes("❌") ? "border-red-500" : agentNameError.includes("✓") ? "border-green-500" : ""}
                />
                {agentNameError && (
                  <p className={`text-xs ${agentNameError.includes("❌") ? "text-red-600" : agentNameError.includes("⚠️") ? "text-yellow-600" : "text-green-600"}`}>
                    {agentNameError}
                  </p>
                )}
                <p className="text-xs text-muted-foreground">
                  Use apenas letras, números, hífens (-) e underscores (_)
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
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent transition-colors">
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
                  <div className="flex items-center space-x-2 p-3 border rounded-lg hover:bg-accent transition-colors">
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

              {/* Preview de Credenciais */}
              {previewCredentials && (
                <Alert className="border-primary">
                  <Shield className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-1">
                      <p className="font-semibold">Credenciais Geradas:</p>
                      <p className="text-xs font-mono">Agent ID: {previewCredentials.agentId}</p>
                      <p className="text-xs flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        Expira em: {new Date(previewCredentials.expiresAt!).toLocaleString()}
                      </p>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {/* Botões de Gerar */}
              <div className="space-y-3">
                <Button 
                  onClick={generateCopyPasteCommand} 
                  disabled={isGenerating || !isNameValid}
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
                      <Zap className="h-4 w-4 mr-2" />
                      Gerar Comando One-Click (Recomendado)
                    </>
                  )}
                </Button>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                  </div>
                  <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                      Ou baixe o instalador
                    </span>
                  </div>
                </div>

                <Button 
                  onClick={generateInstaller} 
                  disabled={isGenerating || !isNameValid}
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
                      <Download className="h-4 w-4 mr-2" />
                      Baixar Instalador (.ps1/.sh)
                    </>
                  )}
                </Button>
              </div>

              {/* Comando Copy-Paste */}
              {showCopyPaste && installCommand && (
                <Alert className="border-green-500 bg-green-50 dark:bg-green-950">
                  <Terminal className="h-4 w-4 text-green-600" />
                  <AlertDescription>
                    <div className="space-y-3">
                      <div>
                        <strong className="block mb-2 text-green-800 dark:text-green-200">
                          ✨ Comando pronto para usar:
                        </strong>
                        <div className="relative">
                          <pre className="bg-muted p-3 rounded text-sm overflow-x-auto font-mono">
                            {installCommand}
                          </pre>
                          <Button
                            size="sm"
                            variant="ghost"
                            className="absolute top-2 right-2"
                            onClick={copyToClipboard}
                          >
                            <Copy className="h-4 w-4 mr-1" />
                            Copiar
                          </Button>
                        </div>
                      </div>
                      <div className="text-sm space-y-2">
                        <p className="font-semibold">Como usar:</p>
                        <ol className="list-decimal list-inside space-y-1 text-xs">
                          <li>Copie o comando acima</li>
                          <li>Abra {platform === 'windows' ? 'PowerShell como Administrador' : 'terminal como root'} no servidor</li>
                          <li>Cole e pressione Enter</li>
                          <li>Aguarde a instalação automática (≈30 segundos)</li>
                        </ol>
                      </div>
                      <Alert className="bg-yellow-50 dark:bg-yellow-950 border-yellow-500">
                        <AlertTriangle className="h-4 w-4 text-yellow-600" />
                        <AlertDescription className="text-xs text-yellow-800 dark:text-yellow-200">
                          <strong>Segurança:</strong> O link expira em 24 horas. Não compartilhe este comando.
                        </AlertDescription>
                      </Alert>
                    </div>
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* Validação Pós-Instalação */}
          <Card className="border-purple-500 bg-purple-50 dark:bg-purple-950">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <FileCheck className="h-5 w-5 text-purple-600" />
                Validação Pós-Instalação
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm">
                Após instalar o agente, você pode validar se está funcionando 100%:
              </p>
              <Button 
                variant="outline" 
                onClick={downloadValidationScript}
                className="w-full"
              >
                <Download className="h-4 w-4 mr-2" />
                Baixar Script de Validação (Windows)
              </Button>
              <div className="text-xs text-muted-foreground space-y-1">
                <p>Este script verifica:</p>
                <ul className="list-disc list-inside space-y-1 ml-2">
                  <li>Instalação correta dos arquivos</li>
                  <li>Tarefa agendada funcionando</li>
                  <li>Envio de heartbeats</li>
                  <li>Coleta de métricas</li>
                </ul>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 2: TUTORIAL */}
        <TabsContent value="tutorial" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Tutorial Passo-a-Passo</CardTitle>
              <CardDescription>
                Siga este guia para instalar o agente sem erros
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-4">
                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    1
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">Configure o Agente</h3>
                    <p className="text-sm text-muted-foreground">
                      Na aba "Gerar Instalador", informe um nome descritivo para o agente (ex: servidor-web-01) e selecione a plataforma (Windows ou Linux).
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    2
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">Gere o Comando One-Click (Recomendado)</h3>
                    <p className="text-sm text-muted-foreground">
                      Clique em "Gerar Comando One-Click" para obter um comando pronto para copiar e colar. Este é o método mais fácil e rápido.
                    </p>
                    <Alert className="mt-2 bg-green-50 dark:bg-green-950 border-green-500">
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                      <AlertDescription className="text-xs">
                        <strong>Vantagem:</strong> Instalação em 1 comando, sem downloads ou edição de arquivos.
                      </AlertDescription>
                    </Alert>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    3
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">Execute no Servidor</h3>
                    <p className="text-sm text-muted-foreground mb-2">
                      Copie o comando gerado e execute no servidor de destino:
                    </p>
                    <div className="bg-muted p-3 rounded text-xs space-y-2">
                      <p><strong>Windows:</strong> Abra PowerShell como Administrador e cole o comando</p>
                      <p><strong>Linux:</strong> Abra terminal como root (sudo) e cole o comando</p>
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-primary text-primary-foreground rounded-full flex items-center justify-center font-bold">
                    4
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">Aguarde a Instalação</h3>
                    <p className="text-sm text-muted-foreground">
                      O processo leva aproximadamente 30 segundos. Você verá mensagens de progresso no terminal.
                    </p>
                  </div>
                </div>

                <div className="flex gap-4">
                  <div className="flex-shrink-0 w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center font-bold">
                    ✓
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold mb-2">Verifique no Dashboard</h3>
                    <p className="text-sm text-muted-foreground">
                      Após alguns segundos, o agente aparecerá no Dashboard de Monitoramento enviando heartbeats e métricas.
                    </p>
                  </div>
                </div>
              </div>

              <Alert>
                <BookOpen className="h-4 w-4" />
                <AlertDescription className="space-y-2">
                  <p className="font-semibold">Documentação Adicional:</p>
                  <div className="flex flex-col gap-1 text-sm">
                    <Button variant="link" className="p-0 h-auto justify-start" asChild>
                      <a href="/docs/exe-build" target="_blank" rel="noopener noreferrer">
                        📖 Como compilar instalador para EXE (Windows)
                      </a>
                    </Button>
                  </div>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* TAB 3: FAQ */}
        <TabsContent value="faq" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>Perguntas Frequentes (FAQ)</CardTitle>
              <CardDescription>
                Respostas para dúvidas comuns sobre instalação e uso
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Accordion type="single" collapsible className="w-full">
                <AccordionItem value="faq-1">
                  <AccordionTrigger>Como instalar sem ser técnico?</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm mb-2">Use o método "Comando One-Click":</p>
                    <ol className="list-decimal list-inside text-sm space-y-1 ml-2">
                      <li>Preencha o nome do agente</li>
                      <li>Clique em "Gerar Comando One-Click"</li>
                      <li>Copie o comando que aparece</li>
                      <li>No servidor, clique com botão direito no PowerShell/Terminal e selecione "Colar"</li>
                      <li>Pressione Enter e aguarde</li>
                    </ol>
                    <p className="text-sm mt-2 text-muted-foreground">
                      Não precisa editar arquivos ou entender código!
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-2">
                  <AccordionTrigger>O que fazer se der erro na instalação?</AccordionTrigger>
                  <AccordionContent>
                    <div className="text-sm space-y-2">
                      <p><strong>1. Verifique privilégios:</strong></p>
                      <ul className="list-disc list-inside ml-4">
                        <li>Windows: Execute como Administrador</li>
                        <li>Linux: Use sudo ou root</li>
                      </ul>
                      <p><strong>2. Verifique conectividade:</strong></p>
                      <ul className="list-disc list-inside ml-4">
                        <li>Teste: <code className="bg-muted px-1">ping google.com</code></li>
                        <li>Firewall pode estar bloqueando</li>
                      </ul>
                      <p><strong>3. Verifique PowerShell (Windows):</strong></p>
                      <ul className="list-disc list-inside ml-4">
                        <li>Execute: <code className="bg-muted px-1">$PSVersionTable</code></li>
                        <li>Versão deve ser 5.1 ou superior</li>
                      </ul>
                      <p className="mt-2">
                        <strong>Ainda com problemas?</strong> Contate o suporte:
                      </p>
                      <ul className="list-disc list-inside ml-4">
                        <li>Email: gamehousetecnologia@gmail.com</li>
                        <li>WhatsApp: (34) 98443-2835</li>
                      </ul>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-3">
                  <AccordionTrigger>Como validar se o agente está funcionando?</AccordionTrigger>
                  <AccordionContent>
                    <div className="text-sm space-y-2">
                      <p><strong>Método 1: Dashboard (Recomendado)</strong></p>
                      <ul className="list-disc list-inside ml-4">
                        <li>Acesse Dashboard de Monitoramento</li>
                        <li>Verifique se o agente aparece com status "online"</li>
                        <li>Confirme heartbeats e métricas sendo recebidos</li>
                      </ul>
                      <p><strong>Método 2: Script de Validação (Windows)</strong></p>
                      <ul className="list-disc list-inside ml-4">
                        <li>Baixe o script de validação na aba "Gerar Instalador"</li>
                        <li>Execute: <code className="bg-muted px-1">.\post-installation-validation.ps1</code></li>
                        <li>Aguarde o relatório completo de testes</li>
                      </ul>
                      <p><strong>Método 3: Logs Manuais</strong></p>
                      <ul className="list-disc list-inside ml-4">
                        <li>Windows: <code className="bg-muted px-1">Get-Content C:\CyberShield\logs\agent.log -Tail 50</code></li>
                        <li>Linux: <code className="bg-muted px-1">tail -f /opt/cybershield/logs/agent.log</code></li>
                      </ul>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-4">
                  <AccordionTrigger>O link do comando expira?</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm mb-2">
                      Sim, por segurança o link expira em <strong>24 horas</strong>.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Se você precisar instalar depois de 24h, basta gerar um novo comando. 
                      Isso evita que links antigos sejam usados indevidamente.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-5">
                  <AccordionTrigger>Posso usar o mesmo comando em vários servidores?</AccordionTrigger>
                  <AccordionContent>
                    <p className="text-sm mb-2">
                      <strong>Não recomendado.</strong> Cada servidor deve ter seu próprio agente com nome único.
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Gere um comando separado para cada servidor com nomes descritivos diferentes 
                      (ex: web-01, web-02, database-01). Isso facilita identificação e gerenciamento.
                    </p>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-6">
                  <AccordionTrigger>Quanto tempo leva a instalação?</AccordionTrigger>
                  <AccordionContent>
                    <div className="text-sm space-y-2">
                      <p><strong>Tempo médio: 30 segundos</strong></p>
                      <p>Etapas:</p>
                      <ul className="list-disc list-inside ml-4 space-y-1">
                        <li>Download do agente: ~5 segundos</li>
                        <li>Configuração de segurança: ~10 segundos</li>
                        <li>Criação de tarefas/serviços: ~10 segundos</li>
                        <li>Primeiro heartbeat: ~5 segundos</li>
                      </ul>
                      <p className="text-muted-foreground mt-2">
                        Pode variar conforme velocidade da internet e recursos do servidor.
                      </p>
                    </div>
                  </AccordionContent>
                </AccordionItem>

                <AccordionItem value="faq-7">
                  <AccordionTrigger>Como desinstalar o agente?</AccordionTrigger>
                  <AccordionContent>
                    <div className="text-sm space-y-2">
                      <p><strong>Windows:</strong></p>
                      <code className="block bg-muted p-2 rounded">
                        Unregister-ScheduledTask -TaskName "CyberShield Agent" -Confirm:$false<br/>
                        Remove-Item -Path "C:\CyberShield" -Recurse -Force
                      </code>
                      <p><strong>Linux:</strong></p>
                      <code className="block bg-muted p-2 rounded">
                        sudo systemctl stop cybershield-agent<br/>
                        sudo systemctl disable cybershield-agent<br/>
                        sudo rm -rf /opt/cybershield
                      </code>
                    </div>
                  </AccordionContent>
                </AccordionItem>
              </Accordion>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* O que acontece após a instalação */}
      <Card className="border-primary">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5 text-primary" />
            O que acontece após a instalação?
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-4 text-sm">
            <div className="space-y-2">
              <p className="font-semibold">Monitoramento Automático:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  Heartbeats a cada 60 segundos
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  Métricas (CPU/RAM/Disco) a cada 5 minutos
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  Alertas automáticos se recursos &gt; 80%
                </li>
              </ul>
            </div>
            <div className="space-y-2">
              <p className="font-semibold">Recursos Disponíveis:</p>
              <ul className="space-y-1 text-muted-foreground">
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  Dashboard em tempo real
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  Execução remota de jobs
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-green-600 flex-shrink-0" />
                  Histórico de atividades e logs
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentInstaller;
