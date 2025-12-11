import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Crown, Building2, ArrowRight, Shield, Monitor } from 'lucide-react';
import { CONTACT } from '@/constants/config';

export default function Pricing() {
  const plans = [
    {
      name: 'Free',
      description: 'Perfeito para testar',
      price: 'Grátis',
      priceNote: '3 dispositivos',
      icon: Shield,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      features: [
        'Até 3 dispositivos',
        'Dashboard básico',
        'Inventário de software',
        'Status do antivírus',
      ],
      cta: 'Começar Grátis',
      ctaVariant: 'outline' as const,
    },
    {
      name: 'Starter',
      description: 'Micro e pequenas empresas',
      price: 'R$ 150',
      priceNote: '/mês • 5 dispositivos base',
      priceExtra: '+R$ 20 por dispositivo adicional',
      maxDevices: 'Até 30 dispositivos',
      icon: Zap,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      popular: true,
      features: [
        'Base: 5 dispositivos inclusos',
        '+R$ 20/dispositivo adicional (até 30)',
        'Dashboard avançado',
        'Monitoramento em tempo real',
        'Inventário de software',
        'Status do antivírus',
        'Suporte por email',
        '14 dias de trial grátis',
      ],
      cta: 'Iniciar teste grátis – 14 dias',
      ctaVariant: 'default' as const,
    },
    {
      name: 'Business',
      description: 'Pequenas e médias empresas',
      price: 'R$ 450',
      priceNote: '/mês • 25 dispositivos base',
      priceExtra: '+R$ 18 por dispositivo adicional',
      maxDevices: 'Até 200 dispositivos',
      icon: Crown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      features: [
        'Base: 25 dispositivos inclusos',
        '+R$ 18/dispositivo adicional (até 200)',
        'Tudo do Starter, mais:',
        'Scans avançados ilimitados',
        'Analytics avançado',
        'Suporte prioritário',
        'API access',
        'Relatórios customizados',
      ],
      cta: 'Iniciar teste grátis – 14 dias',
      ctaVariant: 'secondary' as const,
    },
    {
      name: 'Enterprise',
      description: 'Grandes organizações',
      price: 'Sob consulta',
      icon: Building2,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      features: [
        'Dispositivos ilimitados',
        'Tudo do Business, mais:',
        'Suporte 24/7',
        'SLA personalizado',
        'Integração customizada',
        'Gerente de conta dedicado',
        'Onboarding dedicado',
      ],
      cta: 'Falar com Vendas',
      ctaVariant: 'outline' as const,
      isEnterprise: true,
    },
  ];

  return (
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
          <Badge className="mb-4">Proteção completa sem equipe de TI</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Proteção que cabe no seu bolso
          </h1>
          <p className="text-xl text-muted-foreground mb-4">
            Inventário, antivírus, vulnerabilidades, web, desempenho — tudo em um painel.
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
                      Mais Popular
                    </Badge>
                  )}
                  <CardHeader className="pb-2">
                    <div className={`w-12 h-12 rounded-lg ${plan.bgColor} flex items-center justify-center mb-3`}>
                      <Icon className={`h-6 w-6 ${plan.color}`} />
                    </div>
                    <CardTitle className="text-xl">{plan.name}</CardTitle>
                    <CardDescription>{plan.description}</CardDescription>
                    
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
          <h2 className="text-2xl font-bold text-center mb-8">Exemplos de Preço</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-4xl font-bold text-primary">10</p>
                <p className="text-muted-foreground mb-4">dispositivos</p>
                <p className="text-2xl font-bold">R$ 250/mês</p>
                <p className="text-xs text-muted-foreground">Plano Starter: R$ 150 + 5×R$ 20</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-4xl font-bold text-primary">50</p>
                <p className="text-muted-foreground mb-4">dispositivos</p>
                <p className="text-2xl font-bold">R$ 900/mês</p>
                <p className="text-xs text-muted-foreground">Plano Business: R$ 450 + 25×R$ 18</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6 text-center">
                <p className="text-4xl font-bold text-primary">100</p>
                <p className="text-muted-foreground mb-4">dispositivos</p>
                <p className="text-2xl font-bold">R$ 1.800/mês</p>
                <p className="text-xs text-muted-foreground">Plano Business: R$ 450 + 75×R$ 18</p>
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
              Iniciar teste grátis – 14 dias
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
              <h3 className="font-semibold mb-2">Como funciona o trial de 14 dias?</h3>
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
              <h3 className="font-semibold mb-2">Como funciona o preço por dispositivo adicional?</h3>
              <p className="text-muted-foreground">
                Cada plano inclui uma quantidade base de dispositivos. Se precisar de mais, 
                você paga um valor fixo por dispositivo adicional: R$ 20 no Starter (até 30) 
                ou R$ 18 no Business (até 200).
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
              <h3 className="font-semibold mb-2">O agente deixa o computador lento?</h3>
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
  );
}