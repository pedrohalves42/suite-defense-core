import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import {
  ArrowRight, CheckCircle2, Circle, Copy, Check, Shield,
  Monitor, BarChart3, HelpCircle, Phone, Mail, MessageCircle,
  ExternalLink, AlertTriangle, Terminal, Download, RefreshCw,
} from 'lucide-react';

interface OnboardingContentProps {
  user: unknown;
  agentCount: number;
  hasOnlineAgent: boolean;
  copied: boolean;
  copyCommand: (cmd: string) => void;
}

export function OnboardingContent({ user, agentCount, hasOnlineAgent, copied, copyCommand }: OnboardingContentProps) {
  return (
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
                <CardDescription>Configure a proteção dos seus computadores em menos de 15 minutos</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-2 gap-4">
              {[
                { title: 'Monitoramento em tempo real', desc: 'CPU, memória e disco' },
                { title: 'Inventário de software', desc: 'Lista completa automática' },
                { title: 'Status do antivírus', desc: 'Defender e terceiros' },
                { title: 'Relatórios automáticos', desc: 'PDF e CSV' },
              ].map((item) => (
                <div key={item.title} className="flex items-start gap-3 p-4 bg-muted/50 rounded-lg">
                  <CheckCircle2 className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-sm text-muted-foreground">{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Requirements */}
      <section id="requirements">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5" /> Requisitos
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
                  {[
                    ['💻 Computador', 'Windows 10/11 ou Windows Server 2016+'],
                    ['🌐 Internet', 'Conexão ativa'],
                    ['⏱️ Tempo', '5-10 minutos'],
                    ['👤 Acesso', 'Administrador do computador'],
                  ].map(([req, detail], i, arr) => (
                    <tr key={req} className={i < arr.length - 1 ? 'border-b' : ''}>
                      <td className="py-3">{req}</td>
                      <td className="py-3">{detail}</td>
                    </tr>
                  ))}
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
              <Download className="h-5 w-5" /> Instalação em 5 Passos
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <InstallStep num={1} title="Faça Login no Painel">
              <p className="text-sm text-muted-foreground mb-3">Acesse o painel do CyberShield com seu email e senha.</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/login">Ir para Login <ExternalLink className="h-3 w-3 ml-2" /></Link>
              </Button>
            </InstallStep>
            <Separator />
            <InstallStep num={2} title="Gere uma Chave de Instalação">
              <p className="text-sm text-muted-foreground mb-3">No menu "Instalador de Agentes", digite um nome para o computador e clique em "Gerar Instalador".</p>
              <div className="bg-muted/50 p-3 rounded-lg text-sm">
                <p className="font-medium mb-1">💡 Dica para nomes:</p>
                <p className="text-muted-foreground">Use nomes descritivos como <code className="bg-muted px-1 rounded">PC-Joao</code>, <code className="bg-muted px-1 rounded">Notebook-Vendas</code></p>
              </div>
              <Button asChild size="sm" variant="outline" className="mt-3">
                <Link to="/installer">Ir para Instalador <ArrowRight className="h-3 w-3 ml-2" /></Link>
              </Button>
            </InstallStep>
            <Separator />
            <InstallStep num={3} title="Abra o PowerShell como Administrador">
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
                  <p className="text-amber-600 dark:text-amber-400"><strong>Importante:</strong> O PowerShell DEVE ser aberto como Administrador!</p>
                </div>
              </div>
            </InstallStep>
            <Separator />
            <InstallStep num={4} title="Execute o Comando de Instalação">
              <p className="text-sm text-muted-foreground mb-3">Cole o comando copiado no PowerShell e pressione Enter.</p>
              <div className="bg-zinc-900 rounded-lg p-4 font-mono text-sm text-zinc-100">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-zinc-400 text-xs">PowerShell (Admin)</span>
                  <Terminal className="h-4 w-4 text-zinc-400" />
                </div>
                <code className="text-green-400"># O comando será gerado no passo anterior</code>
              </div>
              <p className="text-sm text-muted-foreground mt-3">Aguarde 30-60 segundos para a instalação completar.</p>
            </InstallStep>
            <Separator />
            <InstallStep num={5} title="Verifique a Instalação">
              <p className="text-sm text-muted-foreground mb-3">Volte ao Dashboard e confirme que o computador aparece com status verde.</p>
              <Button asChild size="sm" variant="outline">
                <Link to="/dashboard">Ir para Dashboard <ArrowRight className="h-3 w-3 ml-2" /></Link>
              </Button>
            </InstallStep>
          </CardContent>
        </Card>
      </section>

      {/* Verification Checklist */}
      <section id="verification">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Monitor className="h-5 w-5" /> Checklist de Verificação</CardTitle>
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
                <div key={index} className={`flex items-center gap-3 p-3 rounded-lg ${item.done ? 'bg-green-500/10' : 'bg-muted/50'}`}>
                  {item.done ? <CheckCircle2 className="h-5 w-5 text-green-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                  <span className={item.done ? 'text-green-700 dark:text-green-400' : ''}>{item.label}</span>
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
            <CardTitle className="flex items-center gap-2"><BarChart3 className="h-5 w-5" /> Próximos Passos</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground mb-4">Após a instalação, o agente coleta dados automaticamente:</p>
            <div className="grid sm:grid-cols-2 gap-3">
              {[
                { to: '/monitoring', icon: BarChart3, title: 'Monitoramento', desc: 'CPU, RAM, Disco em tempo real' },
                { to: '/admin/software-inventory', icon: Download, title: 'Inventário de Software', desc: 'Lista de programas instalados' },
                { to: '/admin/reports', icon: RefreshCw, title: 'Relatórios', desc: 'PDF e CSV automáticos' },
                { to: '/installer', icon: Monitor, title: 'Adicionar Computadores', desc: 'Instalar em mais máquinas' },
              ].map((item) => (
                <Link key={item.to} to={item.to} className="flex items-center gap-3 p-4 bg-muted/50 rounded-lg hover:bg-muted transition-colors">
                  <item.icon className="h-5 w-5 text-primary" />
                  <div>
                    <p className="font-medium">{item.title}</p>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                </Link>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      {/* Troubleshooting */}
      <section id="troubleshooting">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><AlertTriangle className="h-5 w-5" /> Problemas Comuns</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {[
              { title: '🔴 "O comando deu erro"', items: ['Verifique se abriu PowerShell como <strong>Administrador</strong>', 'Gere uma nova chave (elas expiram em 24h)', 'Verifique se o firewall não está bloqueando'] },
              { title: '🔴 "Computador não aparece"', items: ['Aguarde 2 minutos e atualize a página (F5)', 'Verifique a conexão com internet', 'Execute o comando novamente'] },
              { title: '🔴 "Status Desconectado"', items: ['Verifique se o computador está ligado', 'Adicione exceção no antivírus para <code class="bg-muted px-1 rounded">C:\\CyberShield\\</code>', 'Reinicie o computador'] },
            ].map((problem) => (
              <div key={problem.title} className="border rounded-lg p-4">
                <h4 className="font-medium text-red-500 mb-2">{problem.title}</h4>
                <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                  {problem.items.map((item, i) => (
                    <li key={i} dangerouslySetInnerHTML={{ __html: item }} />
                  ))}
                </ul>
              </div>
            ))}
            <div className="border rounded-lg p-4">
              <h4 className="font-medium text-amber-500 mb-2">⚠️ Erro de SSL/TLS</h4>
              <p className="text-sm text-muted-foreground mb-2">Execute este comando antes da instalação:</p>
              <div className="bg-zinc-900 rounded p-3 font-mono text-xs text-zinc-100 flex items-center justify-between">
                <code>[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12</code>
                <Button size="sm" variant="ghost" className="h-6 px-2" onClick={() => copyCommand('[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12')}>
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
            <CardTitle className="flex items-center gap-2"><HelpCircle className="h-5 w-5" /> Precisa de Ajuda?</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid sm:grid-cols-3 gap-4">
              <a href="https://wa.me/5534984432835" target="_blank" rel="noopener noreferrer" className="flex flex-col items-center gap-2 p-4 bg-green-500/10 rounded-lg hover:bg-green-500/20 transition-colors text-center">
                <Phone className="h-6 w-6 text-green-500" />
                <span className="font-medium">WhatsApp</span>
                <span className="text-xs text-muted-foreground">+55 34 98443-2835</span>
              </a>
              <a href="mailto:suporte@cybershield.com.br" className="flex flex-col items-center gap-2 p-4 bg-blue-500/10 rounded-lg hover:bg-blue-500/20 transition-colors text-center">
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
  );
}

function InstallStep({ num, title, children }: { num: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="flex-shrink-0 w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold">
        {num}
      </div>
      <div className="flex-1">
        <h4 className="font-semibold mb-2">{title}</h4>
        {children}
      </div>
    </div>
  );
}
