import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Crown, Building2, ArrowRight, Shield, Monitor } from 'lucide-react';
import { CONTACT } from '@/constants/config';
import { SEOHead } from '@/components/SEOHead';

export default function Pricing() {
  const { t } = useTranslation();

  const plans = [
    {
      key: 'free',
      icon: Shield,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      ctaVariant: 'outline' as const,
    },
    {
      key: 'starter',
      icon: Zap,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      ctaVariant: 'default' as const,
    },
    {
      key: 'business',
      icon: Crown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      popular: true,
      ctaVariant: 'secondary' as const,
    },
    {
      key: 'enterprise',
      icon: Building2,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      ctaVariant: 'outline' as const,
      isEnterprise: true,
    },
  ];

  const faqKeys = ['trial', 'changePlan', 'extraDevice', 'support', 'performance'] as const;

  return (
    <>
      <SEOHead 
        title="Precos e Planos - CyberShield | Seguranca Cibernetica para PMEs"
        description="Planos de seguranca cibernetica a partir de R$499/mes. RMM + EDR + Compliance unificados. Proteja sua empresa com monitoramento 24/7 e conformidade LGPD. Avaliação gratuita em 48h."
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
              <Button variant="ghost">{t('pricingPage.login')}</Button>
            </Link>
            <Link to="/register">
              <Button>{t('pricingPage.createAccount')}</Button>
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="py-16 px-4">
        <div className="container mx-auto text-center max-w-3xl">
          <Badge className="mb-4">{t('pricingPage.badge')}</Badge>
          <h1 className="text-4xl md:text-5xl font-bold mb-4">
            {t('pricingPage.title')}
          </h1>
          <p className="text-xl text-muted-foreground mb-4">
            {t('pricingPage.subtitle')}
          </p>
          <p className="text-lg text-muted-foreground mb-8">
            {t('pricingPage.subtitle2')}
          </p>
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Monitor className="h-4 w-4" />
            <span>{t('pricingPage.trialNote')}</span>
          </div>
        </div>
      </section>

      {/* Pricing Cards */}
      <section className="pb-16 px-4">
        <div className="container mx-auto">
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6 max-w-6xl mx-auto">
            {plans.map((plan) => {
              const Icon = plan.icon;
              const planData = t(`pricingPage.${plan.key}`, { returnObjects: true }) as Record<string, string>;
              const features = t(`pricingPage.features.${plan.key}`, { returnObjects: true }) as string[];
              const cta = t(`pricingPage.cta.${plan.key}`);
              
              return (
                <Card
                  key={plan.key}
                  className={`relative flex flex-col ${
                    plan.popular ? 'border-primary shadow-xl ring-2 ring-primary/20 scale-105' : ''
                  }`}
                >
                  {plan.popular && (
                    <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                      {t('pricingPage.recommended')}
                    </Badge>
                  )}
                  <CardHeader className="pb-2">
                    <div className={`w-12 h-12 rounded-lg ${plan.bgColor} flex items-center justify-center mb-3`}>
                      <Icon className={`h-6 w-6 ${plan.color}`} />
                    </div>
                    <CardTitle className="text-xl">{planData.name}</CardTitle>
                    <CardDescription className="min-h-[40px]">{planData.description}</CardDescription>
                    
                    <div className="mt-4">
                      <span className="text-3xl font-bold">{planData.price}</span>
                      {planData.priceNote && (
                        <p className="text-sm text-muted-foreground">{planData.priceNote}</p>
                      )}
                      {planData.priceExtra && (
                        <p className="text-xs text-primary font-medium mt-1">{planData.priceExtra}</p>
                      )}
                      {planData.maxDevices && (
                        <p className="text-xs text-muted-foreground mt-1">{planData.maxDevices}</p>
                      )}
                    </div>
                  </CardHeader>
                  <CardContent className="flex-1 flex flex-col">
                    <ul className="space-y-3 mb-6 flex-1">
                      {features.map((feature, index) => (
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
                        {cta}
                      </Button>
                    ) : (
                      <Link to="/register" className="w-full">
                        <Button className="w-full" variant={plan.ctaVariant}>
                          {cta}
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
          <h2 className="text-2xl font-bold text-center mb-8">{t('pricingPage.investmentExamples')}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              { count: 10, price: 'R$ 244', detail: 'Plano Starter: R$ 149 + 5×R$ 19' },
              { count: 50, price: 'R$ 824', detail: 'Plano Business: R$ 399 + 25×R$ 17' },
              { count: 100, price: 'R$ 1.674', detail: 'Plano Business: R$ 399 + 75×R$ 17' },
            ].map((example) => (
              <Card key={example.count}>
                <CardContent className="pt-6 text-center">
                  <p className="text-4xl font-bold text-primary">{example.count}</p>
                  <p className="text-muted-foreground mb-4">{t('pricingPage.computers')}</p>
                  <p className="text-2xl font-bold">{example.price}/mês</p>
                  <p className="text-xs text-muted-foreground">{example.detail}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Annual Discount */}
      <section className="py-12 px-4 bg-primary/5">
        <div className="container mx-auto max-w-3xl text-center">
          <h2 className="text-2xl font-bold mb-4">💰 {t('pricingPage.annualDiscount')}</h2>
          <p className="text-muted-foreground mb-6">
            {t('pricingPage.annualDiscountDesc')}
          </p>
          <Link to="/register">
            <Button size="lg">
              {t('pricingPage.startDiagnostic')}
              <ArrowRight className="h-4 w-4 ml-2" />
            </Button>
          </Link>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-4">
        <div className="container mx-auto max-w-3xl">
          <h2 className="text-3xl font-bold text-center mb-12">{t('pricingPage.faq')}</h2>
          <div className="space-y-6">
            {faqKeys.map((key) => (
              <div key={key} className="border rounded-lg p-6">
                <h3 className="font-semibold mb-2">{t(`pricingPage.faqItems.${key}.q`)}</h3>
                <p className="text-muted-foreground">
                  {t(`pricingPage.faqItems.${key}.a`)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8 px-4">
        <div className="container mx-auto text-center text-muted-foreground">
          <p>© {new Date().getFullYear()} CyberShield. {t('pricingPage.footer')}</p>
        </div>
      </footer>
      </div>
    </>
  );
}
