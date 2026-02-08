import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Crown, Building2, ArrowRight, Shield, Monitor } from 'lucide-react';
import { CONTACT } from '@/constants/config';
import { SEOHead } from '@/components/SEOHead';

export default function Pricing() {
  const plans = [
    {
      name: 'Free',
      description: 'Para conhecer o sistema',
      price: 'Grátis',
      priceNote: '3 computadores',
      icon: Shield,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      features: [
        'Até 3 computadores',
        'Visibilidade básica de riscos',
        'Inventário de software',
        'Status do antivírus',
      ],
      cta: 'Começar Grátis',
      ctaVariant: 'outline' as const,
    },
    {
      name: 'Starter',
      description: 'Para empresas que querem saber se está tudo bem — sem olhar painel todo dia.',
      price: 'R$ 149',
      priceNote: '/mês • 5 computadores',
      priceExtra: '+R$ 19 por computador adicional',
      maxDevices: 'Até 30 computadores',
      icon: Zap,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      features: [
        '5 computadores inclusos',
        '+R$ 19/computador adicional',
        'Verificações automáticas de segurança',
        'Alertas por email',
        'Relatórios de risco mensais',
        'Suporte por email',
        '14 dias de trial grátis',
      ],
      cta: 'Começar diagnóstico gratuito',
      ctaVariant: 'default' as const,
    },
    {
      name: 'Business',
      description: 'Para empresas que não podem ser surpreendidas por falhas invisíveis.',
      price: 'R$ 399',
      priceNote: '/mês • 25 computadores',
      priceExtra: '+R$ 17 por computador adicional',
      maxDevices: 'Até 200 computadores',
      icon: Crown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      popular: true,
      features: [
        '25 computadores inclusos',
        '+R$ 17/computador adicional',
        'Tudo do Starter, mais:',
        'Verificações em tempo real',
        'Relatórios de risco para gestão',
        'Bloqueio de sites perigosos',
        'Suporte prioritário',
        'API para integrações',
      ],
      cta: 'Começar diagnóstico gratuito',
      ctaVariant: 'secondary' as const,
    },
    {
      name: 'Enterprise',
      description: 'Para empresas onde um incidente vira problema jurídico, financeiro ou reputacional.',
      price: 'Sob consulta',
      icon: Building2,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      features: [
        'Computadores ilimitados',
        'Tudo do Business, mais:',
        'Suporte 24/7',
        'SLA personalizado',
        'Integração customizada',
        'Gerente de conta dedicado',
        'Relatórios de compliance',
      ],
      cta: 'Falar com Especialista',
      ctaVariant: 'outline' as const,
      isEnterprise: true,
    },
  ];

  return (
    <>
      <SEOHead 
        title="Precos e Planos - CyberShield | Seguranca Cibernetica para PMEs"
        description="Planos de seguranca cibernetica a partir de R$149/mes. Proteja sua empresa com antivirus, monitoramento 24/7 e compliance LGPD. Trial gratuito de 14 dias."
        keywords="preco antivirus empresarial, planos seguranca cibernetica, cybershield precos, protecao PME Brasil"
        canonicalUrl="/pricing"
      />
      <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4 flex items-center justify-between">
          <Link to="/" className="text-2xl font-bold text-primary">
            CyberShield
          </Link>
          <div className="flex items-center gap-4">
            <Link to="/login">
              <Button variant="ghost">Entrar</Button>
            </Link>
            <Link to="/register">
              <Button>Criar Conta</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <Badge className="mb-4">Proteção para empresas sem equipe de TI</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Proteção que cabe no orçamento da sua empresa
          </h1>
          <p className="text-xl text-muted-foreground mb-4">
            Inventário, antivírus, vulnerabilidades, navegação web, desempenho — tudo em um painel.
          </p>
          <p className="text-lg text-muted-foreground mb-8">
            Configure em 3 minutos. Agente leve — não deixa o computador lento.
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Monitor className="h-4 w-4" />
            <span>14 dias de trial grátis (cartão requerido)</span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {plans.map((plan) => {
              const Icon = plan.icon;
              return (
                <Card
                  key={plan.name}
                  className={`relative flex flex-col ${
                    plan.popular ? 'border-primary shadow-xl ring-2 ring-primary/20 scale-105' : ''
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                      Recomendado
                    </Badge>
                  )}
                  <CardHeader className="pb-2">
                    <div className={`w-12 h-12 rounded-lg ${plan.bgColor} flex items-center justify-center mb-3`}>
                      <Icon className={`h-6 w-6 ${plan.color}`} />
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription className="min-h-[40px]">{plan.description}</CardDescription>
                    
                    <div className="mt-4">
                      <span className="text-3xl font-bold">{plan.price}</span>
                      {plan.priceNote && (
                        <p className="text-sm text-muted-foreground">{plan.priceNote}</p>
                      )}
                      {plan.priceExtra && (
                        <p className="text-xs text-primary font-medium mt-1">{plan.priceExtra}</p>
                      )}
                      {plan.maxDevices && (
                        <p className="text-xs text-muted-foreground mt-1">{plan.maxDevices}</p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-3 mb-6 flex-1">
                      {plan.features.map((feature, index) => (
                        <li key={index} className="flex items-start gap-2">
                          <Check className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                          <span className="text-sm">{feature}</span>
                        </li>
                      ))}
                    </ul>
                    
                    {plan.isEnterprise ? (
                      <Button
                        className="w-full"
                        variant={plan.ctaVariant}
                        onClick={() => window.open(CONTACT.WHATSAPP_LINK, '_blank')}
                      >
                        {plan.cta}
                      </Button>
                    ) : (
                      <Link to="/register" className="w-full">
                        <Button className="w-full" variant={plan.ctaVariant}>
                          {plan.cta}
                          <ArrowRight className="h-4 w-4 ml-2" />
                        </Button>
                      </Link>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      {/* Pricing Calculator Example */}
      <section className="py-12 px-4 bg-muted/30">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-2xl font-bold text-center mb-8">Exemplos de Investimento</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-4xl font-bold text-primary">10</p>
                <p className="text-muted-foreground mb-4">computadores</p>
                <p className="text-2xl font-bold">R$ 244/mês</p>
                <p className="text-xs text-muted-foreground">Plano Starter: R$ 149 + 5×R$ 19</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-4xl font-bold text-primary">50</p>
                <p className="text-muted-foreground mb-4">computadores</p>
                <p className="text-2xl font-bold">R$ 824/mês</p>
                <p className="text-xs text-muted-foreground">Plano Business: R$ 399 + 25×R$ 17</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-4xl font-bold text-primary">100</p>
                <p className="text-muted-foreground mb-4">computadores</p>
                <p className="text-2xl font-bold">R$ 1.674/mês</p>
                <p className="text-xs text-muted-foreground">Plano Business: R$ 399 + 75×R$ 17</p>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Annual Discount */}
      <section className="py-12 px-4 bg-primary/5">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-4">💰 Economize com pagamento anual</h2>
          <p className="text-muted-foreground mb-6">
            Ganhe 2 meses grátis ao escolher o plano anual — equivale a 16% de desconto!
          </p>
          <Link to="/register">
            <Button size="lg">
              Começar diagnóstico gratuito
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-12">Perguntas Frequentes</h2>
          <div className="space-y-6">
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Como funciona o diagnóstico gratuito de 14 dias?</h3>
              <p className="text-muted-foreground">
                Você pode testar todas as funcionalidades do plano escolhido por 14 dias. 
                Coletamos os dados do cartão no início, mas só cobramos após o período de teste.
              </p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Posso mudar de plano depois?</h3>
              <p className="text-muted-foreground">
                Sim! Você pode fazer upgrade ou downgrade a qualquer momento através do portal do cliente.
              </p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Como funciona o preço por computador adicional?</h3>
              <p className="text-muted-foreground">
                Cada plano inclui uma quantidade base de computadores. Se precisar de mais, 
                você paga um valor fixo por computador adicional: R$ 19 no Starter (até 30) 
                ou R$ 17 no Business (até 200).
              </p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Como funciona o suporte?</h3>
              <p className="text-muted-foreground">
                Todos os planos pagos incluem suporte por email. Planos Business e superiores 
                têm suporte prioritário com tempos de resposta mais rápidos.
              </p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">O sistema deixa o computador lento?</h3>
              <p className="text-muted-foreground">
                Não! O agente CyberShield é extremamente leve e otimizado para rodar em segundo plano
                sem impactar o desempenho do computador.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>© {new Date().getFullYear()} CyberShield. Todos os direitos reservados.</p>
        </div>
      </footer>
      </div>
    </>
  );
}