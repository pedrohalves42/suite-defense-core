import { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Separator } from '@/components/ui/separator';
import { ScrollArea } from '@/components/ui/scroll-area';
import { 
  ArrowLeft, 
  ArrowRight, 
  CheckCircle2, 
  Circle, 
  Copy, 
  Check,
  Rocket,
  Monitor,
  Shield,
  BarChart3,
  HelpCircle,
  Phone,
  Mail,
  MessageCircle,
  ExternalLink,
  AlertTriangle,
  Terminal,
  Download,
  RefreshCw
} from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import type { RpcAgentRow } from '@/types/rpc';
import { logger } from '@/lib/logger';
import { useAuth } from '@/hooks/useAuth';

const ClientOnboarding = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const [copied, setCopied] = useState(false);
  const [agentCount, setAgentCount] = useState(0);
  const [hasOnlineAgent, setHasOnlineAgent] = useState(false);
  const [activeSection, setActiveSection] = useState('intro');

  useEffect(() => {
    if (user) {
      fetchAgentStats();
    }
  }, [user]);

  const fetchAgentStats = async () => {
    try {
      // ADR-026: Need tenant_id for RPC - get from user_roles as fallback
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      
      const { data: role } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', user.id)
        .limit(1)
        .single();
      
      if (!role?.tenant_id) return;

      const { data: agents } = await supabase.rpc('get_agents_list', {
        p_tenant_id: role.tenant_id,
        p_include_archived: false
      });
      
      const agentsList = (agents || []) as unknown as RpcAgentRow[];
      setAgentCount(agentsList.length);
      const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
      setHasOnlineAgent(agentsList.some((a) => a.last_heartbeat && a.last_heartbeat > fiveMinutesAgo));
    } catch (error) {
      logger.error('Error fetching agent stats:', error);
    }
  };

  const copyCommand = (command: string) => {
    navigator.clipboard.writeText(command);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast({
      title: 'Comando copiado!',
      description: 'Cole no PowerShell como Administrador',
    });
  };

  const sections = [
    { id: 'intro', label: 'Introdução', icon: Rocket },
    { id: 'requirements', label: 'Requisitos', icon: CheckCircle2 },
    { id: 'installation', label: 'Instalação', icon: Download },
    { id: 'verification', label: 'Verificação', icon: Monitor },
    { id: 'next-steps', label: 'Próximos Passos', icon: BarChart3 },
    { id: 'troubleshooting', label: 'Problemas', icon: AlertTriangle },
    { id: 'support', label: 'Suporte', icon: HelpCircle },
  ];

  const onboardingProgress = () => {
    let progress = 0;
    if (user) progress += 25; // Logged in
    if (agentCount > 0) progress += 50; // Has agents
    if (hasOnlineAgent) progress += 25; // Has online agent
    return progress;
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => navigate(-1)}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Guia de Início Rápido</h1>
              <p className="text-xs text-muted-foreground">CyberShield • Documentação</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={hasOnlineAgent ? 'default' : 'secondary'}>
              {agentCount} agente{agentCount !== 1 ? 's' : ''} instalado{agentCount !== 1 ? 's' : ''}
            </Badge>
            <Button asChild size="sm">
              <Link to="/installer">
                <Download className="h-4 w-4 mr-2" />
                Instalar Agente
              </Link>
            </Button>
          </div>
        </div>
      </header>

      <div className="container py-6">
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Sidebar Navigation */}
          <aside className="lg:col-span-1">
            <Card className="sticky top-20">
              <CardHeader className="pb-3">
                <CardTitle className="text-sm">Seu Progresso</CardTitle>
                <Progress value={onboardingProgress()} className="h-2" />
                <CardDescription className="text-xs">
                  {onboardingProgress()}% concluído
                </CardDescription>
              </CardHeader>
              <CardContent className="pt-0">
                <nav className="space-y-1">
                  {sections.map((section) => (
                    <button
                      key={section.id}
                      onClick={() => {
                        setActiveSection(section.id);
                        document.getElementById(section.id)?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-sm rounded-md transition-colors ${
                        activeSection === section.id
                          ? 'bg-primary text-primary-foreground'
                          : 'hover:bg-muted text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <section.icon className="h-4 w-4" />
                      {section.label}
                    </button>
                  ))}
                </nav>
              </CardContent>
            </Card>
          </aside>

          {/* Main Content */}
          <main className="lg:col-span-3 space-y-8">
            {/* Introduction */}
            <section id="intro">
              <Card>
                <CardHeader>
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-primary/10 rounded-lg">
                      <Shield className="h-6 w-6 text-primary" />
                    </div>
                    <div>
                      <CardTitle>Bem-vindo ao CyberShield!</CardTitle>
                      <CardDescription>
                        Configure a proteção dos seus computadores em menos de 15 minutos
                      </CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Monitoramento em tempo real</p>
                        <p className="text-sm text-muted-foreground">CPU, memória e disco</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Inventário de software</p>
                        <p className="text-sm text-muted-foreground">Lista completa automática</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Status do antivírus</p>
                        <p className="text-sm text-muted-foreground">Defender e terceiros</p>
                      </div>
                    </div>
                    <div className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                      <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                      <div>
                        <p className="font-medium">Relatórios automáticos</p>
                        <p className="text-sm text-muted-foreground">PDF e CSV</p>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Requirements */}
            <section id="requirements">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5" />
                    Requisitos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="overflow-x-auto">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b">
                          <th className="text-left py-2 font-medium">Requisito</th>
                          <th className="text-left py-2 font-medium">Detalhes</th>
                        </tr>
                      </thead>
                      <tbody className="text-sm">
                        <tr className="border-b">
                          <td className="py-3">💻 Computador</td>
                          <td className="py-3">Windows 10/11 ou Windows Server 2016+</td>
                        </tr>
                        <tr className="border-b">
                          <td className="py-3">🌐 Internet</td>
                          <td className="py-3">Conexão ativa</td>
                        </tr>
                        <tr className="border-b">
                          <td className="py-3">⏱️ Tempo</td>
                          <td className="py-3">5-10 minutos</td>
                        </tr>
                        <tr>
                          <td className="py-3">👤 Acesso</td>
                          <td className="py-3">Administrador do computador</td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Installation Steps */}
            <section id="installation">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Download className="h-5 w-5" />
                    Instalação em 5 Passos
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                  {/* Step 1 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      1
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Faça Login no Painel</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Acesse o painel do CyberShield com seu email e senha.
                      </p>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/login">
                          Ir para Login
                          <ExternalLink className="h-3 w-3 ml-2" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Step 2 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      2
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Gere uma Chave de Instalação</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        No menu "Instalador de Agentes", digite um nome para o computador e clique em "Gerar Instalador".
                      </p>
                      <div className="bg-muted/50 p-3 rounded-lg text-sm">
                        <p className="font-medium mb-1">💡 Dica para nomes:</p>
                        <p className="text-muted-foreground">
                          Use nomes descritivos como <code className="bg-muted px-1 rounded">PC-Joao</code>, <code className="bg-muted px-1 rounded">Notebook-Vendas</code>
                        </p>
                      </div>
                      <Button asChild size="sm" variant="outline" className="mt-3">
                        <Link to="/installer">
                          Ir para Instalador
                          <ArrowRight className="h-3 w-3 ml-2" />
                        </Link>
                      </Button>
                    </div>
                  </div>

                  <Separator />

                  {/* Step 3 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      3
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Abra o PowerShell como Administrador</h4>
                      <div className="space-y-3 text-sm">
                        <div className="bg-muted/50 p-3 rounded-lg">
                          <p className="font-medium mb-1">Windows 10/11:</p>
                          <ol className="list-decimal list-inside text-muted-foreground space-y-1">
                            <li>Clique com botão direito no botão Iniciar</li>
                            <li>Selecione "Windows PowerShell (Admin)" ou "Terminal (Admin)"</li>
                            <li>Clique em "Sim" na janela de confirmação</li>
                          </ol>
                        </div>
                        <div className="bg-amber-500/10 border border-amber-500/20 p-3 rounded-lg flex gap-2">
                          <AlertTriangle className="h-4 w-4 text-amber-500 flex-shrink-0 mt-0.5" />
                          <p className="text-amber-600 dark:text-amber-400">
                            <strong>Importante:</strong> O PowerShell DEVE ser aberto como Administrador!
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Step 4 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      4
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Execute o Comando de Instalação</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Cole o comando copiado no PowerShell e pressione Enter.
                      </p>
                      <div className="bg-zinc-900 rounded-lg p-4 font-mono text-sm text-zinc-100">
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-zinc-400 text-xs">PowerShell (Admin)</span>
                          <Terminal className="h-4 w-4 text-zinc-400" />
                        </div>
                        <code className="text-green-400">
                          # O comando será gerado no passo anterior
                        </code>
                      </div>
                      <p className="text-sm text-muted-foreground mt-3">
                        Aguarde 30-60 segundos para a instalação completar.
                      </p>
                    </div>
                  </div>

                  <Separator />

                  {/* Step 5 */}
                  <div className="flex gap-4">
                    <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
                      5
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold mb-2">Verifique a Instalação</h4>
                      <p className="text-sm text-muted-foreground mb-3">
                        Volte ao Dashboard e confirme que o computador aparece com status verde.
                      </p>
                      <Button asChild size="sm" variant="outline">
                        <Link to="/dashboard">
                          Ir para Dashboard
                          <ArrowRight className="h-3 w-3 ml-2" />
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Verification Checklist */}
            <section id="verification">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Monitor className="h-5 w-5" />
                    Checklist de Verificação
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    {[
                      { label: 'Login realizado no painel', done: !!user },
                      { label: 'Chave de instalação gerada', done: false },
                      { label: 'PowerShell aberto como Administrador', done: false },
                      { label: 'Comando executado sem erros', done: agentCount > 0 },
                      { label: 'Computador aparece no Dashboard', done: agentCount > 0 },
                      { label: 'Status mostra "Conectado" (verde)', done: hasOnlineAgent },
                      { label: 'Métricas sendo exibidas', done: hasOnlineAgent },
                    ].map((item, index) => (
                      <div 
                        key={index} 
                        className={`flex items-center gap-3 p-3 rounded-lg ${
                          item.done ? 'bg-green-500/10' : 'bg-muted/50'
                        }`}
                      >
                        {item.done ? (
                          <CheckCircle2 className="h-5 w-5 text-green-500" />
                        ) : (
                          <Circle className="h-5 w-5 text-muted-foreground" />
                        )}
                        <span className={item.done ? 'text-green-700 dark:text-green-400' : ''}>
                          {item.label}
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Next Steps */}
            <section id="next-steps">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <BarChart3 className="h-5 w-5" />
                    Próximos Passos
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground mb-4">
                    Após a instalação, o agente coleta dados automaticamente:
                  </p>
                  <div className="grid sm:grid-cols-2 gap-3">
                    <Link 
                      to="/monitoring" 
                      className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <BarChart3 className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Monitoramento</p>
                        <p className="text-xs text-muted-foreground">CPU, RAM, Disco em tempo real</p>
                      </div>
                    </Link>
                    <Link 
                      to="/admin/software-inventory" 
                      className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Download className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Inventário de Software</p>
                        <p className="text-xs text-muted-foreground">Lista de programas instalados</p>
                      </div>
                    </Link>
                    <Link 
                      to="/admin/reports" 
                      className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <RefreshCw className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Relatórios</p>
                        <p className="text-xs text-muted-foreground">PDF e CSV automáticos</p>
                      </div>
                    </Link>
                    <Link 
                      to="/installer" 
                      className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors"
                    >
                      <Monitor className="h-5 w-5 text-primary" />
                      <div>
                        <p className="font-medium">Adicionar Computadores</p>
                        <p className="text-xs text-muted-foreground">Instalar em mais máquinas</p>
                      </div>
                    </Link>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Troubleshooting */}
            <section id="troubleshooting">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-5 w-5" />
                    Problemas Comuns
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-red-500 mb-2">🔴 "O comando deu erro"</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Verifique se abriu PowerShell como <strong>Administrador</strong></li>
                      <li>Gere uma nova chave (elas expiram em 24h)</li>
                      <li>Verifique se o firewall não está bloqueando</li>
                    </ul>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-red-500 mb-2">🔴 "Computador não aparece"</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Aguarde 2 minutos e atualize a página (F5)</li>
                      <li>Verifique a conexão com internet</li>
                      <li>Execute o comando novamente</li>
                    </ul>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-red-500 mb-2">🔴 "Status Desconectado"</h4>
                    <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                      <li>Verifique se o computador está ligado</li>
                      <li>Adicione exceção no antivírus para <code className="bg-muted px-1 rounded">C:\CyberShield\</code></li>
                      <li>Reinicie o computador</li>
                    </ul>
                  </div>

                  <div className="border rounded-lg p-4">
                    <h4 className="font-medium text-amber-500 mb-2">⚠️ Erro de SSL/TLS</h4>
                    <p className="text-sm text-muted-foreground mb-2">Execute este comando antes da instalação:</p>
                    <div className="bg-zinc-900 rounded p-3 font-mono text-xs text-zinc-100 flex items-center justify-between">
                      <code>[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12</code>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-6 px-2"
                        onClick={() => copyCommand('[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12')}
                      >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </section>

            {/* Support */}
            <section id="support">
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <HelpCircle className="h-5 w-5" />
                    Precisa de Ajuda?
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="grid sm:grid-cols-3 gap-4">
                    <a 
                      href="https://wa.me/5534984432835" 
                      target="_blank" 
                      rel="noopener noreferrer"
                      className="flex flex-col items-center gap-2 p-4 bg-green-500/10 rounded-lg hover:bg-green-500/20 transition-colors text-center"
                    >
                      <Phone className="h-6 w-6 text-green-500" />
                      <span className="font-medium">WhatsApp</span>
                      <span className="text-xs text-muted-foreground">+55 34 98443-2835</span>
                    </a>
                    <a 
                      href="mailto:suporte@cybershield.com.br"
                      className="flex flex-col items-center gap-2 p-4 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition-colors text-center"
                    >
                      <Mail className="h-6 w-6 text-blue-500" />
                      <span className="font-medium">Email</span>
                      <span className="text-xs text-muted-foreground">suporte@cybershield.com.br</span>
                    </a>
                    <div className="flex flex-col items-center gap-2 p-4 bg-purple-500/10 rounded-lg text-center">
                      <MessageCircle className="h-6 w-6 text-purple-500" />
                      <span className="font-medium">Chat</span>
                      <span className="text-xs text-muted-foreground">Disponível no painel</span>
                    </div>
                  </div>
                  <div className="mt-4 p-3 bg-muted/50 rounded-lg text-center text-sm text-muted-foreground">
                    <strong>Horário:</strong> Segunda a Sexta 8h-18h • Sábado 8h-12h
                  </div>
                </CardContent>
              </Card>
            </section>
          </main>
        </div>
      </div>
    </div>
  );
};

export default ClientOnboarding;
