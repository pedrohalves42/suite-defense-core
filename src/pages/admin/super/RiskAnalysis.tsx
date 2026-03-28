import React from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { 
  AlertTriangle, CheckCircle, Shield, Users, TrendingUp, 
  Scale, Server, DollarSign, UserX, Swords, Cpu, Receipt, FileCheck
} from 'lucide-react';

interface Risk {
  id: string;
  title: string;
  severity: 'high' | 'medium' | 'low';
  probability: number;
  impact: number;
  description: string;
  mitigations: { text: string; implemented: boolean }[];
  investorQuestion: string;
  suggestedAnswer: string;
  icon: React.ElementType;
}

const risks: Risk[] = [
  {
    id: 'solo-founder',
    title: 'Dependência de Fundador Solo',
    severity: 'high',
    probability: 70,
    impact: 90,
    description: 'O projeto depende atualmente de um único desenvolvedor. Se o fundador ficar indisponível, o projeto pode parar.',
    mitigations: [
      { text: 'Documentação completa (ARCHITECTURE_OVERVIEW.md)', implemented: true },
      { text: 'Código limpo com TypeScript tipado', implemented: true },
      { text: 'Arquitetura modular e desacoplada', implemented: true },
      { text: 'Plano de contratação no roadmap', implemented: false },
      { text: 'Vesting schedule para retenção', implemented: false },
    ],
    investorQuestion: 'O que acontece se você ficar doente ou sair do projeto?',
    suggestedAnswer: 'A arquitetura foi projetada para ser mantida por outros devs. Temos documentação completa, código tipado, e o investimento permite contratar ao menos 1 dev adicional em 6 meses. Também considero equity para key hires.',
    icon: UserX,
  },
  {
    id: 'competition',
    title: 'Mercado Competitivo',
    severity: 'medium',
    probability: 60,
    impact: 70,
    description: 'Existem players estabelecidos como Kaspersky, Norton, Bitdefender que podem oferecer soluções similares.',
    mitigations: [
      { text: 'Foco nicho: PMEs Brasil (10-50 PCs)', implemented: true },
      { text: 'Preço 70% menor que enterprise', implemented: true },
      { text: 'Interface 100% em português', implemented: true },
      { text: 'IA integrada sem custo extra', implemented: true },
      { text: 'Instalação 1-click simplificada', implemented: true },
    ],
    investorQuestion: 'Como você compete com Kaspersky, Norton, etc?',
    suggestedAnswer: 'Não competimos diretamente. Eles focam em enterprise (R$500+/mês) ou consumer (antivírus básico). Nós atacamos o gap: PMEs que precisam de segurança enterprise mas não têm orçamento. Nosso diferencial é IA nativa, preço acessível (R$60-150/dispositivo), e UX em português.',
    icon: Swords,
  },
  {
    id: 'scalability',
    title: 'Escalabilidade Técnica',
    severity: 'medium',
    probability: 40,
    impact: 60,
    description: 'A arquitetura atual pode enfrentar limitações ao escalar para milhares de agentes.',
    mitigations: [
      { text: 'Supabase auto-scaling habilitado', implemented: true },
      { text: 'Edge Functions serverless', implemented: true },
      { text: 'RLS multi-tenant desde o início', implemented: true },
      { text: 'Job queue com retry e DLQ', implemented: true },
      { text: 'Particionamento de métricas planejado', implemented: false },
    ],
    investorQuestion: 'A arquitetura aguenta 10.000 agentes?',
    suggestedAnswer: 'Sim. Usamos Supabase (Postgres + auto-scaling), Edge Functions serverless, e multi-tenancy nativo com RLS. Testes com 100 agentes simultâneos não mostraram degradação. Para 10k+, o roadmap inclui particionamento de métricas, já documentado.',
    icon: Server,
  },
  {
    id: 'cac',
    title: 'CAC Elevado no Brasil',
    severity: 'medium',
    probability: 50,
    impact: 50,
    description: 'Custo de aquisição de clientes pode ser alto devido à baixa maturidade digital das PMEs.',
    mitigations: [
      { text: 'Trial 15 dias gratuito (low-friction)', implemented: true },
      { text: 'Integração WhatsApp planejada', implemented: false },
      { text: 'Parcerias com contadores/MSPs', implemented: false },
      { text: 'Conteúdo educativo inbound', implemented: false },
      { text: 'Referral program', implemented: false },
    ],
    investorQuestion: 'Como vocês vão adquirir clientes no Brasil?',
    suggestedAnswer: 'Estratégia híbrida: trial gratuito para converter inbound (SEO, conteúdo), parcerias com escritórios de contabilidade e MSPs que já atendem PMEs, e alertas WhatsApp que viralizam organicamente. LTV/CAC projetado de 12x permite CAC de até R$500.',
    icon: DollarSign,
  },
  {
    id: 'lgpd',
    title: 'Compliance LGPD',
    severity: 'low',
    probability: 30,
    impact: 80,
    description: 'A coleta de dados de endpoints pode gerar preocupações com privacidade e LGPD.',
    mitigations: [
      { text: 'RLS isola dados por tenant', implemented: true },
      { text: 'Não armazenamos conteúdo de arquivos', implemented: true },
      { text: 'Logs de auditoria completos', implemented: true },
      { text: 'Autenticação HMAC para agentes', implemented: true },
      { text: 'DPA template para clientes', implemented: false },
    ],
    investorQuestion: 'Como vocês lidam com LGPD?',
    suggestedAnswer: 'Arquitetura privacy-by-design: RLS garante isolamento total entre tenants, não armazenamos conteúdo de arquivos (apenas metadados), logs de auditoria rastreiam toda ação, e HMAC previne agentes não autorizados. Estamos preparando DPA templates para clientes enterprise.',
    icon: FileCheck,
  },
];

const getSeverityColor = (severity: string) => {
  switch (severity) {
    case 'high': return 'destructive';
    case 'medium': return 'secondary';
    case 'low': return 'outline';
    default: return 'secondary';
  }
};

const getSeverityLabel = (severity: string) => {
  switch (severity) {
    case 'high': return 'Alto';
    case 'medium': return 'Médio';
    case 'low': return 'Baixo';
    default: return severity;
  }
};

export default function RiskAnalysis() {
  const implementedCount = risks.reduce((acc, risk) => 
    acc + risk.mitigations.filter(m => m.implemented).length, 0
  );
  const totalMitigations = risks.reduce((acc, risk) => 
    acc + risk.mitigations.length, 0
  );
  const mitigationProgress = (implementedCount / totalMitigations) * 100;

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold">Análise de Riscos</h1>
        <p className="text-muted-foreground">5 principais riscos e mitigações para investidores</p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-destructive/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-destructive" />
              </div>
              <div>
                <p className="text-2xl font-bold">{risks.filter(r => r.severity === 'high').length}</p>
                <p className="text-sm text-muted-foreground">Riscos Altos</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-yellow-500/10 flex items-center justify-center">
                <AlertTriangle className="w-6 h-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{risks.filter(r => r.severity === 'medium').length}</p>
                <p className="text-sm text-muted-foreground">Riscos Médios</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-green-500/10 flex items-center justify-center">
                <CheckCircle className="w-6 h-6 text-green-500" />
              </div>
              <div>
                <p className="text-2xl font-bold">{implementedCount}</p>
                <p className="text-sm text-muted-foreground">Mitigações Ativas</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center">
                <Shield className="w-6 h-6 text-primary" />
              </div>
              <div>
                <p className="text-2xl font-bold">{mitigationProgress.toFixed(0)}%</p>
                <p className="text-sm text-muted-foreground">Cobertura</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Risk Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Matriz de Riscos</CardTitle>
          <CardDescription>Probabilidade vs Impacto</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="relative h-64 border rounded-lg p-4">
            {/* Grid lines */}
            <div className="absolute inset-4 grid grid-cols-4 grid-rows-4 gap-px">
              {Array.from({ length: 16 }).map((_, i) => (
                <div key={i} className="bg-muted/20" />
              ))}
            </div>
            {/* Axis labels */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -rotate-90 text-xs text-muted-foreground">
              Impacto →
            </div>
            <div className="absolute bottom-0 left-1/2 -translate-x-1/2 text-xs text-muted-foreground">
              Probabilidade →
            </div>
            {/* Risk dots */}
            {risks.map((risk) => (
              <div
                key={risk.id}
                className="absolute w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer transition-transform hover:scale-125"
                style={{
                  left: `calc(${risk.probability}% - 16px)`,
                  bottom: `calc(${risk.impact}% - 16px)`,
                  backgroundColor: risk.severity === 'high' ? 'hsl(var(--destructive))' : 
                                   risk.severity === 'medium' ? 'hsl(45 100% 50%)' : 'hsl(142 76% 36%)',
                  color: 'white',
                }}
                title={risk.title}
              >
                {risk.id.charAt(0).toUpperCase()}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Detailed Risks */}
      <div className="space-y-4">
        {risks.map((risk, index) => (
          <Card key={risk.id} className="overflow-hidden">
            <CardHeader className="bg-muted/30">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-lg bg-background flex items-center justify-center">
                    <risk.icon className="w-6 h-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle className="flex items-center gap-2">
                      <span className="text-muted-foreground mr-2">#{index + 1}</span>
                      {risk.title}
                    </CardTitle>
                    <CardDescription>{risk.description}</CardDescription>
                  </div>
                </div>
                <Badge variant={getSeverityColor(risk.severity) as "default" | "destructive" | "outline" | "secondary"}>
                  {getSeverityLabel(risk.severity)}
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {/* Probability/Impact bars */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Probabilidade</span>
                    <span className="font-medium">{risk.probability}%</span>
                  </div>
                  <Progress value={risk.probability} className="h-2" />
                </div>
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-muted-foreground">Impacto</span>
                    <span className="font-medium">{risk.impact}%</span>
                  </div>
                  <Progress value={risk.impact} className="h-2" />
                </div>
              </div>

              {/* Mitigations */}
              <div>
                <h4 className="font-medium mb-3">Mitigações</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {risk.mitigations.map((mitigation, i) => (
                    <div 
                      key={i} 
                      className={`flex items-center gap-2 p-2 rounded-lg text-sm ${
                        mitigation.implemented ? 'bg-green-500/10' : 'bg-muted/30'
                      }`}
                    >
                      {mitigation.implemented ? (
                        <CheckCircle className="w-4 h-4 text-green-500 flex-shrink-0" />
                      ) : (
                        <div className="w-4 h-4 rounded-full border-2 border-muted-foreground/30 flex-shrink-0" />
                      )}
                      <span className={mitigation.implemented ? '' : 'text-muted-foreground'}>
                        {mitigation.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Q&A */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 border-t">
                <div className="p-4 bg-destructive/5 rounded-lg">
                  <h4 className="font-medium text-destructive mb-2 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Pergunta do Investidor
                  </h4>
                  <p className="text-sm italic">"{risk.investorQuestion}"</p>
                </div>
                <div className="p-4 bg-green-500/5 rounded-lg">
                  <h4 className="font-medium text-green-600 mb-2 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Resposta Sugerida
                  </h4>
                  <p className="text-sm">{risk.suggestedAnswer}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Summary */}
      <Card className="bg-primary/5 border-primary/20">
        <CardContent className="pt-6">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
              <Scale className="w-6 h-6 text-primary" />
            </div>
            <div>
              <h3 className="font-bold text-lg mb-2">Conclusão</h3>
              <p className="text-muted-foreground">
                Os riscos identificados são típicos de uma startup early-stage e estão sendo ativamente 
                mitigados. O risco mais crítico (fundador solo) será endereçado com o investimento através 
                de contratação. Os demais riscos têm mitigações técnicas já implementadas ou no roadmap 
                imediato. O perfil de risco é <strong>moderado</strong> com potencial de retorno 
                <strong> 5-10x em 3-5 anos</strong>.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
