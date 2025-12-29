import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  Monitor, Shield, FileSearch, Activity, Globe, Settings,
  CheckCircle, AlertCircle, Clock, Zap, Key, ChevronDown, ChevronUp
} from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface Feature {
  icon: React.ElementType;
  title: string;
  description: string;
  howItWorks: string[];
  autoRuns?: boolean;
  frequency?: string;
}

const features: Record<string, Feature[]> = {
  monitoramento: [
    {
      icon: Activity,
      title: 'Monitorar Saúde dos Computadores',
      description: 'Acompanhe em tempo real o status de CPU, memória e disco de todos os computadores.',
      howItWorks: [
        'O programa instalado coleta métricas a cada 10 minutos automaticamente',
        'Você vê os dados no painel principal',
        'Alertas são enviados se algo estiver fora do normal'
      ],
      autoRuns: true,
      frequency: 'A cada 10 minutos'
    },
    {
      icon: Clock,
      title: 'Verificar se Computador está Online',
      description: 'Saiba instantaneamente se algum computador parou de responder.',
      howItWorks: [
        'O programa envia um "sinal de vida" a cada 60 segundos',
        'Se não recebemos sinal por 5 minutos, marcamos como offline',
        'Você recebe alerta quando um computador fica offline'
      ],
      autoRuns: true,
      frequency: 'A cada 60 segundos'
    }
  ],
  seguranca: [
    {
      icon: Shield,
      title: 'Verificar Antivírus',
      description: 'Confirme se o antivírus está instalado, atualizado e funcionando em cada computador.',
      howItWorks: [
        'Clique em "Verificar Antivírus" no menu do computador',
        'O sistema verifica Windows Defender e outros antivírus',
        'Você vê o resultado em segundos'
      ],
      autoRuns: false
    },
    {
      icon: FileSearch,
      title: 'Buscar Vulnerabilidades',
      description: 'Encontre programas desatualizados que podem ser porta de entrada para ataques.',
      howItWorks: [
        'Clique em "Verificar Vulnerabilidades" no menu do computador',
        'O sistema compara versões instaladas com banco de dados de CVEs',
        'Vulnerabilidades são classificadas por gravidade'
      ],
      autoRuns: false
    },
    {
      icon: Globe,
      title: 'Bloquear Sites Perigosos',
      description: 'Impeça acesso a sites maliciosos ou não autorizados.',
      howItWorks: [
        'Vá em Segurança > Sites Bloqueados',
        'Adicione o domínio que deseja bloquear (ex: facebook.com)',
        'O programa impede acesso automaticamente'
      ],
      autoRuns: true,
      frequency: 'Aplicado em tempo real'
    }
  ],
  inventario: [
    {
      icon: Monitor,
      title: 'Listar Programas Instalados',
      description: 'Veja todos os softwares instalados em cada computador da sua rede.',
      howItWorks: [
        'Clique em "Coletar Inventário" no menu do computador',
        'O sistema lista todos os programas instalados',
        'Resultados aparecem em Segurança > Inventário de Software'
      ],
      autoRuns: false
    }
  ],
  automacao: [
    {
      icon: Zap,
      title: 'Atualização Automática do Programa',
      description: 'Mantenha todos os programas atualizados sem precisar visitar cada computador.',
      howItWorks: [
        'Quando lançamos uma atualização, você é notificado',
        'Clique em "Atualizar Todos" no painel de computadores',
        'O programa baixa e instala a nova versão automaticamente'
      ],
      autoRuns: false
    }
  ]
};

export default function ApiDocumentation() {
  const [expandedTech, setExpandedTech] = useState(false);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Como Funciona</h1>
        <p className="text-muted-foreground mt-2">
          Entenda o que o CyberShield faz para proteger seus computadores
        </p>
      </div>

      {/* Resumo Rápido */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card className="bg-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-primary/10">
                <Monitor className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">24/7</p>
                <p className="text-sm text-muted-foreground">Monitoramento</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-green-500/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-green-500/10">
                <Shield className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">Automático</p>
                <p className="text-sm text-muted-foreground">Proteção</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-blue-500/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-blue-500/10">
                <Activity className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">Tempo Real</p>
                <p className="text-sm text-muted-foreground">Alertas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-purple-500/5 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-full bg-purple-500/10">
                <FileSearch className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">Relatórios</p>
                <p className="text-sm text-muted-foreground">PDF/CSV</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="monitoramento" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="monitoramento" className="gap-2">
            <Activity className="h-4 w-4" />
            Monitoramento
          </TabsTrigger>
          <TabsTrigger value="seguranca" className="gap-2">
            <Shield className="h-4 w-4" />
            Segurança
          </TabsTrigger>
          <TabsTrigger value="inventario" className="gap-2">
            <Monitor className="h-4 w-4" />
            Inventário
          </TabsTrigger>
          <TabsTrigger value="automacao" className="gap-2">
            <Zap className="h-4 w-4" />
            Automação
          </TabsTrigger>
        </TabsList>

        {Object.entries(features).map(([category, items]) => (
          <TabsContent key={category} value={category} className="space-y-4 mt-4">
            {items.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <Card key={index}>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 rounded-lg bg-primary/10">
                          <Icon className="h-5 w-5 text-primary" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{feature.title}</CardTitle>
                          <CardDescription className="mt-1">
                            {feature.description}
                          </CardDescription>
                        </div>
                      </div>
                      {feature.autoRuns && (
                        <Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/30">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Automático
                        </Badge>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3">
                      <h4 className="font-medium text-sm">Como funciona:</h4>
                      <ol className="space-y-2">
                        {feature.howItWorks.map((step, stepIndex) => (
                          <li key={stepIndex} className="flex items-start gap-3 text-sm">
                            <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center text-xs font-medium">
                              {stepIndex + 1}
                            </span>
                            <span className="text-muted-foreground pt-0.5">{step}</span>
                          </li>
                        ))}
                      </ol>
                      {feature.frequency && (
                        <div className="flex items-center gap-2 mt-3 pt-3 border-t">
                          <Clock className="h-4 w-4 text-muted-foreground" />
                          <span className="text-sm text-muted-foreground">
                            Frequência: {feature.frequency}
                          </span>
                        </div>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </TabsContent>
        ))}
      </Tabs>

      {/* Seção Técnica Colapsável */}
      <Collapsible open={expandedTech} onOpenChange={setExpandedTech}>
        <Card>
          <CollapsibleTrigger asChild>
            <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Settings className="h-5 w-5 text-muted-foreground" />
                  <div>
                    <CardTitle className="text-base">Informações Técnicas</CardTitle>
                    <CardDescription>
                      Para desenvolvedores e integrações avançadas
                    </CardDescription>
                  </div>
                </div>
                <Button variant="ghost" size="sm">
                  {expandedTech ? (
                    <ChevronUp className="h-4 w-4" />
                  ) : (
                    <ChevronDown className="h-4 w-4" />
                  )}
                </Button>
              </div>
            </CardHeader>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <CardContent className="space-y-4 border-t pt-4">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Key className="h-4 w-4" />
                    Autenticação
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• Agentes usam HMAC-SHA256 para autenticação</li>
                    <li>• Tokens são gerados automaticamente na instalação</li>
                    <li>• Comunicação criptografada via HTTPS</li>
                  </ul>
                </div>
                <div className="space-y-2">
                  <h4 className="font-medium flex items-center gap-2">
                    <Activity className="h-4 w-4" />
                    Endpoints Principais
                  </h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    <li>• POST /heartbeat - Sinal de vida do agente</li>
                    <li>• GET /poll-jobs - Busca tarefas pendentes</li>
                    <li>• POST /submit-* - Envia resultados</li>
                  </ul>
                </div>
              </div>
              <div className="p-3 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  <AlertCircle className="h-4 w-4 inline mr-2" />
                  Para documentação técnica completa da API, entre em contato com nosso suporte técnico.
                </p>
              </div>
            </CardContent>
          </CollapsibleContent>
        </Card>
      </Collapsible>
    </div>
  );
}
