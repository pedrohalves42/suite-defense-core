import { useState } from "react";
import { Package, Download, Terminal, CheckCircle2, AlertCircle, FileText, Monitor, Server } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;

const AgentInstaller = () => {
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  const downloadFile = async (type: 'windows-template' | 'linux-template' | 'windows-agent' | 'linux-agent' | 'validation') => {
    setIsDownloading(type);
    try {
      let filePath = '';
      let fileName = '';

      switch (type) {
        case 'windows-template':
          filePath = '/templates/install-windows-template.ps1';
          fileName = 'install-windows-template.ps1';
          break;
        case 'linux-template':
          filePath = '/templates/install-linux-template.sh';
          fileName = 'install-linux-template.sh';
          break;
        case 'windows-agent':
          filePath = '/agent-scripts/cybershield-agent-windows.ps1';
          fileName = 'cybershield-agent-windows.ps1';
          break;
        case 'linux-agent':
          filePath = '/agent-scripts/cybershield-agent-linux.sh';
          fileName = 'cybershield-agent-linux.sh';
          break;
        case 'validation':
          // Abre o link do GitHub para o script de validação
          const validationUrl = 'https://raw.githubusercontent.com/seu-repo/main/tests/post-installation-validation.ps1';
          window.open(validationUrl, '_blank');
          toast.success("Link de validação aberto! Salve o arquivo no servidor.");
          setIsDownloading(null);
          return;
      }

      const response = await fetch(filePath);
      if (!response.ok) throw new Error('Falha ao baixar arquivo');

      const content = await response.text();
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`${fileName} baixado com sucesso!`);
    } catch (error) {
      console.error('Erro ao baixar arquivo:', error);
      toast.error("Erro ao baixar arquivo");
    } finally {
      setIsDownloading(null);
    }
  };

  return (
    <div className="container mx-auto p-6 max-w-6xl space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Package className="h-10 w-10 text-primary" />
        <div>
          <h1 className="text-3xl font-bold">Instaladores CyberShield Agent</h1>
          <p className="text-muted-foreground">
            Baixe e configure os agentes de monitoramento para Windows e Linux
          </p>
        </div>
      </div>

      {/* Alert de Informações Importantes */}
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>
          <strong>Importante:</strong> Antes de instalar, você precisa configurar as credenciais do agente.
          Os templates precisam ser editados com <code className="bg-muted px-1 py-0.5 rounded">AGENT_TOKEN</code>, <code className="bg-muted px-1 py-0.5 rounded">HMAC_SECRET</code> e <code className="bg-muted px-1 py-0.5 rounded">SERVER_URL</code>.
        </AlertDescription>
      </Alert>

      <Tabs defaultValue="windows" className="w-full">
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="windows">
            <Monitor className="h-4 w-4 mr-2" />
            Windows
          </TabsTrigger>
          <TabsTrigger value="linux">
            <Server className="h-4 w-4 mr-2" />
            Linux
          </TabsTrigger>
          <TabsTrigger value="validation">
            <CheckCircle2 className="h-4 w-4 mr-2" />
            Validação
          </TabsTrigger>
        </TabsList>

        {/* Windows Tab */}
        <TabsContent value="windows" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Monitor className="h-5 w-5" />
                Instalador Windows
                <Badge variant="outline">PowerShell</Badge>
              </CardTitle>
              <CardDescription>
                Compatível com Windows Server 2012+, Windows 10/11
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Template de Instalação */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Template de Instalação
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Script principal que instala e configura o agente no Windows
                    </p>
                  </div>
                  <Button
                    onClick={() => downloadFile('windows-template')}
                    disabled={isDownloading === 'windows-template'}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isDownloading === 'windows-template' ? 'Baixando...' : 'Baixar Template'}
                  </Button>
                </div>
              </div>

              {/* Script do Agente */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Script do Agente
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Script que executa continuamente no servidor (heartbeats, métricas, jobs)
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => downloadFile('windows-agent')}
                    disabled={isDownloading === 'windows-agent'}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isDownloading === 'windows-agent' ? 'Baixando...' : 'Baixar Agent'}
                  </Button>
                </div>
              </div>

              {/* Instruções */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Como Instalar:
                </h4>
                <ol className="text-sm space-y-2 list-decimal list-inside">
                  <li>Baixe o <strong>Template de Instalação</strong></li>
                  <li>Edite o template e substitua os placeholders:
                    <ul className="ml-6 mt-1 space-y-1">
                      <li><code className="bg-background px-1 py-0.5 rounded">{'{{AGENT_TOKEN}}'}</code> - Token único do agente</li>
                      <li><code className="bg-background px-1 py-0.5 rounded">{'{{HMAC_SECRET}}'}</code> - Chave HMAC para autenticação</li>
                      <li><code className="bg-background px-1 py-0.5 rounded">{'{{SERVER_URL}}'}</code> - URL do servidor: <code className="bg-background px-1 py-0.5 rounded">{SUPABASE_URL}</code></li>
                    </ul>
                  </li>
                  <li>Copie o arquivo .ps1 editado para o servidor Windows</li>
                  <li>Abra <strong>PowerShell como Administrador</strong></li>
                  <li>Execute: <code className="bg-background px-1 py-0.5 rounded">.\install-windows-template.ps1</code></li>
                  <li>Aguarde a conclusão da instalação</li>
                </ol>
              </div>

              {/* Build EXE */}
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  <strong>Compilar para EXE:</strong> Para criar um instalador executável, veja o guia completo em <code className="bg-muted px-1 py-0.5 rounded">EXE_BUILD_INSTRUCTIONS.md</code>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Linux Tab */}
        <TabsContent value="linux" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Server className="h-5 w-5" />
                Instalador Linux
                <Badge variant="outline">Bash</Badge>
              </CardTitle>
              <CardDescription>
                Compatível com Ubuntu, Debian, CentOS, RHEL
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Template de Instalação */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Template de Instalação
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Script principal que instala e configura o agente no Linux
                    </p>
                  </div>
                  <Button
                    onClick={() => downloadFile('linux-template')}
                    disabled={isDownloading === 'linux-template'}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isDownloading === 'linux-template' ? 'Baixando...' : 'Baixar Template'}
                  </Button>
                </div>
              </div>

              {/* Script do Agente */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Script do Agente
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Script que executa continuamente no servidor (heartbeats, métricas, jobs)
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    onClick={() => downloadFile('linux-agent')}
                    disabled={isDownloading === 'linux-agent'}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isDownloading === 'linux-agent' ? 'Baixando...' : 'Baixar Agent'}
                  </Button>
                </div>
              </div>

              {/* Instruções */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Como Instalar:
                </h4>
                <ol className="text-sm space-y-2 list-decimal list-inside">
                  <li>Baixe o <strong>Template de Instalação</strong></li>
                  <li>Edite o template e substitua os placeholders:
                    <ul className="ml-6 mt-1 space-y-1">
                      <li><code className="bg-background px-1 py-0.5 rounded">{'{{AGENT_TOKEN}}'}</code> - Token único do agente</li>
                      <li><code className="bg-background px-1 py-0.5 rounded">{'{{HMAC_SECRET}}'}</code> - Chave HMAC para autenticação</li>
                      <li><code className="bg-background px-1 py-0.5 rounded">{'{{SERVER_URL}}'}</code> - URL do servidor: <code className="bg-background px-1 py-0.5 rounded">{SUPABASE_URL}</code></li>
                    </ul>
                  </li>
                  <li>Copie o arquivo .sh editado para o servidor Linux</li>
                  <li>Dê permissão de execução: <code className="bg-background px-1 py-0.5 rounded">chmod +x install-linux-template.sh</code></li>
                  <li>Execute como root: <code className="bg-background px-1 py-0.5 rounded">sudo ./install-linux-template.sh</code></li>
                  <li>Aguarde a conclusão da instalação</li>
                </ol>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Validation Tab */}
        <TabsContent value="validation" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5" />
                Script de Validação Pós-Instalação
                <Badge variant="outline">Windows</Badge>
              </CardTitle>
              <CardDescription>
                Valida se o agente está funcionando 100% após a instalação
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Script de Validação */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="font-semibold flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Script de Validação
                    </h4>
                    <p className="text-sm text-muted-foreground">
                      Verifica instalação, heartbeats, métricas e funcionamento completo
                    </p>
                  </div>
                  <Button
                    onClick={() => downloadFile('validation')}
                    disabled={isDownloading === 'validation'}
                  >
                    <Download className="h-4 w-4 mr-2" />
                    {isDownloading === 'validation' ? 'Abrindo...' : 'Baixar Script'}
                  </Button>
                </div>
              </div>

              {/* O que o script verifica */}
              <div className="p-4 bg-muted rounded-lg space-y-2">
                <h4 className="font-semibold">✅ O que é validado:</h4>
                <ul className="text-sm space-y-1 list-disc list-inside">
                  <li>Instalação dos diretórios e arquivos</li>
                  <li>Tarefa agendada no Windows (Task Scheduler)</li>
                  <li>Regras de firewall</li>
                  <li>Arquivo de log e crescimento ativo</li>
                  <li>Processos PowerShell em execução</li>
                  <li><strong>Heartbeats sendo enviados</strong> (60s)</li>
                  <li><strong>Métricas do sistema</strong> (5min)</li>
                </ul>
              </div>

              {/* Instruções */}
              <div className="p-4 bg-blue-50 dark:bg-blue-950 rounded-lg space-y-3">
                <h4 className="font-semibold flex items-center gap-2">
                  <Terminal className="h-4 w-4" />
                  Como Usar:
                </h4>
                <ol className="text-sm space-y-2 list-decimal list-inside">
                  <li>Aguarde <strong>2 minutos</strong> após a instalação</li>
                  <li>Baixe o script de validação</li>
                  <li>Execute como <strong>Administrador</strong>:
                    <br />
                    <code className="bg-background px-1 py-0.5 rounded mt-1 inline-block">.\post-installation-validation.ps1</code>
                  </li>
                  <li>O script fará <strong>7 verificações</strong> + monitoramento de 3 minutos</li>
                  <li>Resultado:
                    <ul className="ml-6 mt-1 space-y-1">
                      <li>✅ <strong>Exit Code 0</strong> = 100% funcionando</li>
                      <li>⚠️ <strong>Exit Code 1</strong> = Parcialmente funcionando</li>
                      <li>❌ <strong>Exit Code 2</strong> = Não funcionando</li>
                    </ul>
                  </li>
                </ol>
              </div>

              {/* Documentação */}
              <Alert>
                <FileText className="h-4 w-4" />
                <AlertDescription>
                  <strong>Documentação completa:</strong> Veja <code className="bg-muted px-1 py-0.5 rounded">tests/README-validation.md</code> e <code className="bg-muted px-1 py-0.5 rounded">VALIDATION_GUIDE.md</code>
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Links Rápidos */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">📚 Documentação Adicional</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Button variant="outline" className="h-auto py-3" asChild>
              <a href="/EXE_BUILD_INSTRUCTIONS.md" target="_blank" rel="noopener noreferrer">
                <div className="text-left">
                  <div className="font-semibold">Build EXE Windows</div>
                  <div className="text-xs text-muted-foreground">Como compilar o instalador</div>
                </div>
              </a>
            </Button>
            <Button variant="outline" className="h-auto py-3" asChild>
              <a href="/VALIDATION_GUIDE.md" target="_blank" rel="noopener noreferrer">
                <div className="text-left">
                  <div className="font-semibold">Guia de Validação</div>
                  <div className="text-xs text-muted-foreground">Troubleshooting completo</div>
                </div>
              </a>
            </Button>
            <Button variant="outline" className="h-auto py-3" asChild>
              <a href="/INSTALLATION_GUIDE.md" target="_blank" rel="noopener noreferrer">
                <div className="text-left">
                  <div className="font-semibold">Guia de Instalação</div>
                  <div className="text-xs text-muted-foreground">Documentação detalhada</div>
                </div>
              </a>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AgentInstaller;
