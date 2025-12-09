import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Crown, Building2, ArrowRight } from 'lucide-react';
import { CONTACT } from '@/constants/config';

export default function Pricing() {
  const plans = [
    {
      name: 'Free',
      description: 'Perfeito para testar',
      price: 'Grátis',
      priceNote: '14 dias para avaliar',
      icon: Zap,
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
      description: 'Ideal para micro-empresas',
      price: 'R$ 150',
      priceNote: '/mês • até 5 dispositivos',
      icon: Zap,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      popular: true,
      features: [
        'Até 5 dispositivos',
        'Dashboard avançado',
        'Relatórios de segurança',
        'Suporte por email',
        '14 dias de trial grátis',
      ],
      cta: 'Começar Trial Grátis',
      ctaVariant: 'default' as const,
    },
    {
      name: 'Business',
      description: 'Para pequenas empresas',
      price: 'R$ 450',
      priceNote: '/mês • até 25 dispositivos',
      icon: Crown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      features: [
        'Até 25 dispositivos',
        'Scans ilimitados',
        'Analytics avançado',
        'Suporte prioritário',
        'API access',
        'Relatórios customizados',
      ],
      cta: 'Começar Trial Grátis',
      ctaVariant: 'secondary' as const,
    },
    {
      name: 'Scale',
      description: 'Para médias empresas',
      price: 'R$ 1.200',
      priceNote: '/mês • até 100 dispositivos',
      icon: Crown,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      features: [
        'Até 100 dispositivos',
        'Todas as features Business',
        'SLA garantido',
        'Onboarding dedicado',
        'Suporte telefônico',
      ],
      cta: 'Começar Trial Grátis',
      ctaVariant: 'secondary' as const,
    },
    {
      name: 'Enterprise',
      description: 'Para grandes organizações',
      price: 'Sob consulta',
      icon: Building2,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      features: [
        'Dispositivos ilimitados',
        'Suporte 24/7',
        'SLA personalizado',
        'Integração customizada',
        'Gerente de conta dedicado',
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
          <Badge className="mb-4">Preços Simples</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            Proteção que cabe no seu bolso
          </h1>
          <p className="text-xl text-muted-foreground mb-8">
            Escolha o plano ideal para sua empresa. Todos incluem 14 dias de trial grátis.
          </p>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 max-w-7xl mx-auto">
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

      {/* Annual Discount */}
      <section className="py-12 px-4 bg-muted/50">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-4">💰 Economize com pagamento anual</h2>
          <p className="text-muted-foreground mb-6">
            Ganhe 2 meses grátis ao escolher o plano anual — equivale a 16% de desconto!
          </p>
          <Link to="/register">
            <Button size="lg">
              Começar Agora
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
              <h3 className="font-semibold mb-2">E se eu precisar de mais dispositivos?</h3>
              <p className="text-muted-foreground">
                Entre em contato com nossa equipe de vendas para planos customizados 
                que atendam às suas necessidades específicas.
              </p>
            </div>
            <div className="border rounded-lg p-6">
              <h3 className="font-semibold mb-2">Como funciona o suporte?</h3>
              <p className="text-muted-foreground">
                Todos os planos pagos incluem suporte por email. Planos Business e superiores 
                têm suporte prioritário com tempos de resposta mais rápidos.
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
