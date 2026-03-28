import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { PitchSlide } from '@/components/pitch/PitchSlide';
import { 
  ChevronLeft, ChevronRight, Download, Shield, Target, Users, 
  TrendingUp, DollarSign, Brain, CheckCircle, AlertTriangle,
  Zap, Globe, Lock, Server, BarChart3, Rocket, CreditCard
} from 'lucide-react';

const TOTAL_SLIDES = 10;

export default function PitchDeck() {
  const [currentSlide, setCurrentSlide] = useState(1);

  // Fetch real metrics
  const { data: metrics } = useQuery({
    queryKey: ['pitch-metrics'],
    queryFn: async () => {
      // ADR-026: Super-admin context — cross-tenant aggregation is acceptable
      const [tenants, agents, jobs, subscriptions] = await Promise.all([
        supabase.from('tenants').select('id, created_at'),
        supabase.from('agents_safe').select('id, status'),
        supabase.from('jobs').select('id, status'),
        supabase.from('tenant_subscriptions').select('id, status, device_quantity, plan_id, subscription_plans(price)')
      ]);

      const activeAgents = agents.data?.filter(a => a.status === 'active').length || 0;
      const completedJobs = jobs.data?.filter(j => j.status === 'completed').length || 0;
      const totalJobs = jobs.data?.length || 0;
      const successRate = totalJobs > 0 ? (completedJobs / totalJobs * 100) : 0;
      const activeSubs = subscriptions.data?.filter(s => s.status === 'active' || s.status === 'trialing') || [];
      const mrr = activeSubs.reduce((sum, s) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const price = (s.subscription_plans as any)?.price || 0;
        return sum + (price * (s.device_quantity || 1));
      }, 0);

      return {
        totalTenants: tenants.data?.length || 0,
        totalAgents: agents.data?.length || 0,
        activeAgents,
        totalJobs,
        successRate: successRate.toFixed(1),
        activeSubs: activeSubs.length,
        mrr
      };
    }
  });

  const nextSlide = () => setCurrentSlide(prev => Math.min(prev + 1, TOTAL_SLIDES));
  const prevSlide = () => setCurrentSlide(prev => Math.max(prev - 1, 1));

  const handleExportPDF = () => {
    window.print();
  };

  const renderSlide = () => {
    switch (currentSlide) {
      case 1:
        return (
          <PitchSlide slideNumber={1} title="CyberShield" subtitle="Proteção Inteligente para PMEs Brasileiras">
            <div className="flex flex-col items-center justify-center h-full text-center space-y-8">
              <div className="w-32 h-32 rounded-2xl bg-primary/20 flex items-center justify-center">
                <Shield className="w-16 h-16 text-primary" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-foreground mb-4">
                  Segurança Empresarial com IA
                </h1>
                <p className="text-xl text-muted-foreground max-w-2xl">
                  Plataforma SaaS de cibersegurança projetada para pequenas e médias empresas brasileiras, 
                  com inteligência artificial integrada e preços acessíveis.
                </p>
              </div>
              <div className="flex gap-4">
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  <Brain className="w-4 h-4 mr-2" />
                  IA Nativa
                </Badge>
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  <Globe className="w-4 h-4 mr-2" />
                  100% Brasil
                </Badge>
                <Badge variant="secondary" className="text-lg px-4 py-2">
                  <Lock className="w-4 h-4 mr-2" />
                  Multi-Tenant
                </Badge>
              </div>
            </div>
          </PitchSlide>
        );

      case 2:
        return (
          <PitchSlide slideNumber={2} title="O Problema" subtitle="PMEs são alvos fáceis">
            <div className="grid grid-cols-2 gap-8 h-full">
              <div className="space-y-6">
                <Card className="bg-destructive/10 border-destructive/30">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <AlertTriangle className="w-8 h-8 text-destructive flex-shrink-0" />
                      <div>
                        <h3 className="font-bold text-lg">60% das PMEs</h3>
                        <p className="text-muted-foreground">fecham em 6 meses após um ataque cibernético</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-destructive/10 border-destructive/30">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <AlertTriangle className="w-8 h-8 text-destructive flex-shrink-0" />
                      <div>
                        <h3 className="font-bold text-lg">R$ 15.000+</h3>
                        <p className="text-muted-foreground">custo médio por incidente para pequenas empresas</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="bg-destructive/10 border-destructive/30">
                  <CardContent className="pt-6">
                    <div className="flex items-start gap-4">
                      <AlertTriangle className="w-8 h-8 text-destructive flex-shrink-0" />
                      <div>
                        <h3 className="font-bold text-lg">43% dos ataques</h3>
                        <p className="text-muted-foreground">miram pequenas empresas (menos proteção)</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
              <div className="flex flex-col justify-center space-y-4">
                <h3 className="text-2xl font-bold">Por que PMEs são vulneráveis?</h3>
                <ul className="space-y-3 text-lg">
                  <li className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-destructive" />
                    Soluções enterprise são caras demais (R$ 500+/mês)
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-destructive" />
                    Falta de equipe técnica dedicada
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-destructive" />
                    Interfaces complexas em inglês
                  </li>
                  <li className="flex items-center gap-3">
                    <span className="w-2 h-2 rounded-full bg-destructive" />
                    Sem visibilidade sobre riscos
                  </li>
                </ul>
              </div>
            </div>
          </PitchSlide>
        );

      case 3:
        return (
          <PitchSlide slideNumber={3} title="A Solução" subtitle="Segurança simples, inteligente e acessível">
            <div className="grid grid-cols-3 gap-6 h-full">
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <Shield className="w-12 h-12 text-primary mb-2" />
                  <CardTitle>Proteção Completa</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Inventário de software automático</p>
                  <p>• Detecção de vulnerabilidades</p>
                  <p>• Status de antivírus em tempo real</p>
                  <p>• Monitoramento de atividade web</p>
                  <p>• Diagnóstico de rede e firewall</p>
                </CardContent>
              </Card>
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <Brain className="w-12 h-12 text-primary mb-2" />
                  <CardTitle>IA Integrada</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Análise inteligente de riscos</p>
                  <p>• Recomendações automatizadas</p>
                  <p>• Insights proativos</p>
                  <p>• Gemini/GPT nativos</p>
                  <p>• Sem API keys extras</p>
                </CardContent>
              </Card>
              <Card className="bg-primary/5 border-primary/20">
                <CardHeader>
                  <Zap className="w-12 h-12 text-primary mb-2" />
                  <CardTitle>Instalação 1-Click</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm text-muted-foreground">
                  <p>• Deploy em 60 segundos</p>
                  <p>• Comando único PowerShell</p>
                  <p>• Auto-update inteligente</p>
                  <p>• Zero configuração manual</p>
                  <p>• Dashboard em português</p>
                </CardContent>
              </Card>
            </div>
          </PitchSlide>
        );

      case 4:
        return (
          <PitchSlide slideNumber={4} title="Mercado" subtitle="TAM / SAM / SOM">
            <div className="grid grid-cols-2 gap-8 h-full">
              <div className="space-y-6">
                <div className="space-y-4">
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-medium">TAM - Total</span>
                      <span className="text-2xl font-bold text-primary">R$ 8 Bi</span>
                    </div>
                    <Progress value={100} className="h-3" />
                    <p className="text-sm text-muted-foreground mt-1">Mercado de cibersegurança PME Brasil</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-medium">SAM - Acessível</span>
                      <span className="text-2xl font-bold text-primary">R$ 1.2 Bi</span>
                    </div>
                    <Progress value={15} className="h-3" />
                    <p className="text-sm text-muted-foreground mt-1">PMEs 10-200 funcionários, SP/MG/RJ</p>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-lg font-medium">SOM - Alvo 5 anos</span>
                      <span className="text-2xl font-bold text-primary">R$ 50 Mi</span>
                    </div>
                    <Progress value={4} className="h-3" />
                    <p className="text-sm text-muted-foreground mt-1">0.6% do SAM - meta conservadora</p>
                  </div>
                </div>
              </div>
              <div className="flex flex-col justify-center">
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Target className="w-5 h-5" />
                      Segmento Alvo
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex justify-between items-center py-2 border-b">
                      <span>Empresas</span>
                      <Badge variant="secondary">10-50 PCs</Badge>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span>Setores</span>
                      <Badge variant="secondary">Comércio, Serviços</Badge>
                    </div>
                    <div className="flex justify-between items-center py-2 border-b">
                      <span>Região</span>
                      <Badge variant="secondary">Sudeste Brasil</Badge>
                    </div>
                    <div className="flex justify-between items-center py-2">
                      <span>Ticket Médio</span>
                      <Badge variant="secondary">R$ 500-1500/mês</Badge>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          </PitchSlide>
        );

      case 5:
        return (
          <PitchSlide slideNumber={5} title="Produto" subtitle="Arquitetura e tecnologia">
            <div className="grid grid-cols-2 gap-8 h-full">
              <div className="space-y-4">
                <h3 className="text-xl font-bold mb-4">Stack Tecnológico</h3>
                <div className="grid grid-cols-2 gap-3">
                  {[
                    { label: 'Frontend', value: 'React + TypeScript' },
                    { label: 'Backend', value: 'Supabase Edge Functions' },
                    { label: 'Database', value: 'PostgreSQL + RLS' },
                    { label: 'Agent', value: 'PowerShell Windows' },
                    { label: 'Auth', value: 'JWT + HMAC' },
                    { label: 'AI', value: 'Gemini/GPT Nativo' },
                  ].map((item, i) => (
                    <Card key={i} className="p-3">
                      <p className="text-xs text-muted-foreground">{item.label}</p>
                      <p className="font-medium text-sm">{item.value}</p>
                    </Card>
                  ))}
                </div>
              </div>
              <div className="space-y-4">
                <h3 className="text-xl font-bold mb-4">Métricas de Qualidade (ao vivo)</h3>
                <div className="space-y-4">
                  <Card className="p-4 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Taxa de Sucesso Jobs</span>
                      <span className="text-2xl font-bold text-primary">{metrics?.successRate || 0}%</span>
                    </div>
                  </Card>
                  <Card className="p-4 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Agentes Ativos</span>
                      <span className="text-2xl font-bold text-primary">{metrics?.activeAgents || 0}</span>
                    </div>
                  </Card>
                  <Card className="p-4 bg-primary/5">
                    <div className="flex items-center justify-between">
                      <span className="text-muted-foreground">Jobs Processados</span>
                      <span className="text-2xl font-bold text-primary">{metrics?.totalJobs || 0}</span>
                    </div>
                  </Card>
                </div>
              </div>
            </div>
          </PitchSlide>
        );

      case 6:
        return (
          <PitchSlide slideNumber={6} title="Tração" subtitle="Validação de mercado">
            <div className="grid grid-cols-4 gap-6 mb-8">
              {[
                { label: 'Tenants', value: metrics?.totalTenants || 0, icon: Users },
                { label: 'Agentes', value: metrics?.totalAgents || 0, icon: Server },
                { label: 'Subscrições', value: metrics?.activeSubs || 0, icon: CreditCard },
                { label: 'MRR', value: `R$ ${metrics?.mrr || 0}`, icon: DollarSign },
              ].map((item, i) => (
                <Card key={i} className="text-center p-6">
                  <item.icon className="w-8 h-8 mx-auto text-primary mb-2" />
                  <p className="text-3xl font-bold">{item.value}</p>
                  <p className="text-sm text-muted-foreground">{item.label}</p>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-6">
              <Card className="p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-500" />
                  Marcos Alcançados
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Produto 95% pronto para produção
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Primeiro cliente confirmado (trial 45 dias)
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    Auditoria de segurança completa
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-green-500" />
                    RLS multi-tenant validado
                  </li>
                </ul>
              </Card>
              <Card className="p-6">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                  <Rocket className="w-5 h-5 text-primary" />
                  Próximos Passos
                </h3>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    Primeira venda - Q1 2025
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    Alertas WhatsApp/Telegram
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    Agente Linux/macOS
                  </li>
                  <li className="flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-primary" />
                    EDR básico (processo monitoring)
                  </li>
                </ul>
              </Card>
            </div>
          </PitchSlide>
        );

      case 7:
        return (
          <PitchSlide slideNumber={7} title="Modelo de Negócio" subtitle="SaaS B2B com unit economics saudáveis">
            <div className="grid grid-cols-2 gap-8 h-full">
              <div className="space-y-6">
                <h3 className="text-xl font-bold">Planos de Preço</h3>
                {[
                  { name: 'Starter Compliance', price: 'R$ 499/mês', devices: '10 PCs base (+R$39/extra)', features: 'RMM + EDR + Compliance básico' },
                  { name: 'Business', price: 'R$ 899/mês', devices: '20 PCs base (+R$24/extra)', features: '+ Scans ilimitados, Relatórios, Analytics' },
                  { name: 'Enterprise / MSP', price: 'A partir de R$ 2.000/mês', devices: '+200 PCs / Ilimitado', features: '+ SLA, Multi-tenant, API, White label' },
                ].map((plan, i) => (
                  <Card key={i} className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-bold">{plan.name}</span>
                      <Badge variant={i === 1 ? 'default' : 'secondary'}>{plan.price}</Badge>
                    </div>
                    <p className="text-sm text-muted-foreground">{plan.devices} - {plan.features}</p>
                  </Card>
                ))}
              </div>
              <div className="space-y-6">
                <h3 className="text-xl font-bold">Unit Economics</h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
                    <span>LTV/CAC</span>
                    <span className="text-2xl font-bold text-primary">12x</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
                    <span>Gross Margin</span>
                    <span className="text-2xl font-bold text-primary">80%+</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
                    <span>Churn Target</span>
                    <span className="text-2xl font-bold text-primary">&lt;5%</span>
                  </div>
                  <div className="flex items-center justify-between p-4 bg-primary/5 rounded-lg">
                    <span>Payback</span>
                    <span className="text-2xl font-bold text-primary">3-4 meses</span>
                  </div>
                </div>
              </div>
            </div>
          </PitchSlide>
        );

      case 8:
        return (
          <PitchSlide slideNumber={8} title="Time" subtitle="Fundador dedicado">
            <div className="flex flex-col items-center justify-center h-full space-y-8">
              <div className="w-32 h-32 rounded-full bg-primary/20 flex items-center justify-center">
                <Users className="w-16 h-16 text-primary" />
              </div>
              <div className="text-center max-w-2xl">
                <h3 className="text-2xl font-bold mb-4">Solo Founder</h3>
                <p className="text-lg text-muted-foreground mb-6">
                  Desenvolvedor full-stack com experiência em segurança, 
                  800-1200 horas dedicadas ao CyberShield.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <Card className="p-4 text-center">
                    <p className="text-2xl font-bold text-primary">5+</p>
                    <p className="text-sm text-muted-foreground">Anos XP Dev</p>
                  </Card>
                  <Card className="p-4 text-center">
                    <p className="text-2xl font-bold text-primary">1000+</p>
                    <p className="text-sm text-muted-foreground">Horas no Projeto</p>
                  </Card>
                  <Card className="p-4 text-center">
                    <p className="text-2xl font-bold text-primary">100%</p>
                    <p className="text-sm text-muted-foreground">Dedicação</p>
                  </Card>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4 w-full max-w-xl">
                <Card className="p-4">
                  <h4 className="font-bold mb-2">Competências</h4>
                  <p className="text-sm text-muted-foreground">
                    React, TypeScript, Supabase, PowerShell, Segurança, IA
                  </p>
                </Card>
                <Card className="p-4">
                  <h4 className="font-bold mb-2">Hiring Plan</h4>
                  <p className="text-sm text-muted-foreground">
                    Vendas (Q2), DevOps (Q3), Suporte (Q4)
                  </p>
                </Card>
              </div>
            </div>
          </PitchSlide>
        );

      case 9:
        return (
          <PitchSlide slideNumber={9} title="Financeiro" subtitle="Projeções 12 meses">
            <div className="grid grid-cols-2 gap-8 h-full">
              <div className="space-y-6">
                <h3 className="text-xl font-bold">Cenários de Crescimento</h3>
                <div className="space-y-4">
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Conservador</span>
                      <Badge variant="secondary">50% a.a.</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ARR 12m</span>
                      <span className="font-bold">R$ 72.000</span>
                    </div>
                  </Card>
                  <Card className="p-4 border-primary">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Realista</span>
                      <Badge>100% a.a.</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ARR 12m</span>
                      <span className="font-bold text-primary">R$ 120.000</span>
                    </div>
                  </Card>
                  <Card className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <span className="font-medium">Agressivo</span>
                      <Badge variant="secondary">200% a.a.</Badge>
                    </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">ARR 12m</span>
                      <span className="font-bold">R$ 180.000</span>
                    </div>
                  </Card>
                </div>
              </div>
              <div className="space-y-6">
                <h3 className="text-xl font-bold">Uso do Investimento</h3>
                <div className="space-y-3">
                  {[
                    { label: 'Desenvolvimento (Linux/macOS, EDR)', percent: 40 },
                    { label: 'Marketing & Vendas', percent: 30 },
                    { label: 'Infraestrutura & Cloud', percent: 15 },
                    { label: 'Reserva & Legal', percent: 15 },
                  ].map((item, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span>{item.label}</span>
                        <span className="font-bold">{item.percent}%</span>
                      </div>
                      <Progress value={item.percent} className="h-2" />
                    </div>
                  ))}
                </div>
                <Card className="p-4 bg-primary/10 border-primary/30">
                  <h4 className="font-bold mb-2">Runway com R$ 100k</h4>
                  <p className="text-2xl font-bold text-primary">12-18 meses</p>
                  <p className="text-sm text-muted-foreground">até break-even ou próxima rodada</p>
                </Card>
              </div>
            </div>
          </PitchSlide>
        );

      case 10:
        return (
          <PitchSlide slideNumber={10} title="Ask" subtitle="Oportunidade de investimento">
            <div className="flex flex-col items-center justify-center h-full space-y-8">
              <div className="text-center">
                <h2 className="text-5xl font-bold text-primary mb-4">R$ 100.000</h2>
                <p className="text-xl text-muted-foreground">por 10-12.5% equity</p>
              </div>
              <div className="grid grid-cols-2 gap-8 w-full max-w-3xl">
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-4">Valuation</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Pre-money</span>
                      <span className="font-bold">R$ 700k - R$ 1M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Post-money</span>
                      <span className="font-bold">R$ 800k - R$ 1.1M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Metodologia</span>
                      <span className="font-bold">3 métodos</span>
                    </div>
                  </div>
                </Card>
                <Card className="p-6">
                  <h3 className="font-bold text-lg mb-4">Retorno Potencial</h3>
                  <div className="space-y-3">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Exit 3 anos (5x)</span>
                      <span className="font-bold text-primary">R$ 500k</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Exit 5 anos (10x)</span>
                      <span className="font-bold text-primary">R$ 1M</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Tipo</span>
                      <span className="font-bold">Equity / SAFE</span>
                    </div>
                  </div>
                </Card>
              </div>
              <div className="flex gap-4 mt-4">
                <Badge variant="outline" className="text-lg px-4 py-2">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                  Produto Validado
                </Badge>
                <Badge variant="outline" className="text-lg px-4 py-2">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                  Cliente Confirmado
                </Badge>
                <Badge variant="outline" className="text-lg px-4 py-2">
                  <CheckCircle className="w-4 h-4 mr-2 text-green-500" />
                  Arquitetura Escalável
                </Badge>
              </div>
            </div>
          </PitchSlide>
        );

      default:
        return null;
    }
  };

  return (
    <div className="container mx-auto py-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Pitch Deck</h1>
          <p className="text-muted-foreground">Apresentação para investidores</p>
        </div>
        <Button onClick={handleExportPDF} variant="outline">
          <Download className="w-4 h-4 mr-2" />
          Exportar PDF
        </Button>
      </div>

      {/* Progress */}
      <div className="flex items-center gap-2">
        {Array.from({ length: TOTAL_SLIDES }).map((_, i) => (
          <button
            key={i}
            onClick={() => setCurrentSlide(i + 1)}
            className={`h-2 flex-1 rounded-full transition-colors ${
              i + 1 === currentSlide ? 'bg-primary' : i + 1 < currentSlide ? 'bg-primary/50' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      {/* Slide Content */}
      <div className="print:break-after-page">
        {renderSlide()}
      </div>

      {/* Navigation */}
      <div className="flex items-center justify-between">
        <Button
          variant="outline"
          onClick={prevSlide}
          disabled={currentSlide === 1}
        >
          <ChevronLeft className="w-4 h-4 mr-2" />
          Anterior
        </Button>
        <span className="text-sm text-muted-foreground">
          {currentSlide} de {TOTAL_SLIDES}
        </span>
        <Button
          variant="outline"
          onClick={nextSlide}
          disabled={currentSlide === TOTAL_SLIDES}
        >
          Próximo
          <ChevronRight className="w-4 h-4 ml-2" />
        </Button>
      </div>

      {/* Print Styles */}
      <style>{`
        @media print {
          .print\\:break-after-page { break-after: page; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>
    </div>
  );
}
