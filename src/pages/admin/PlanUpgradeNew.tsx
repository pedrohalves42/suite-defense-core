import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, Zap, Crown, Loader2, Building2, AlertTriangle, Monitor, Users, CalendarDays, Shield } from 'lucide-react';
import { PLAN_CONFIG } from '@/constants/plans';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useTenant } from '@/hooks/useTenant';
import { CONTACT } from '@/constants/config';
import { useEffect, useState } from 'react';
import { logger } from '@/lib/logger';
import { BillingPeriodSelector, type BillingPeriod, calculateSavings, PERIOD_CONFIG } from '@/components/admin/BillingPeriodSelector';
import { formatBrazilDateTime } from '@/lib/date-utils';

interface Plan {
  id: string;
  name: string;
  max_users: number;
  max_agents: number | null;
  max_scans_per_month: number | null;
  price_per_device: number;
  max_devices: number;
  stripe_price_id: string | null;
  trial_days: number | null;
}

const LOADING_TIMEOUT_MS = 15000; // 15 seconds timeout

export default function PlanUpgradeNew() {
  const { toast } = useToast();
  const { subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useSubscription();
  const { tenant, loading: tenantLoading } = useTenant();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('12m'); // Default to popular annual

  // Debug logging for loading states
  useEffect(() => {
    logger.debug('PlanUpgradeNew loading states', {
      subscriptionLoading,
      tenantLoading,
      hasSubscription: !!subscription,
      hasTenant: !!tenant,
    });
  }, [subscriptionLoading, tenantLoading, subscription, tenant]);

  // Loading timeout protection
  useEffect(() => {
    if (subscriptionLoading || tenantLoading) {
      const timeoutId = setTimeout(() => {
        logger.warn('PlanUpgradeNew loading timeout exceeded', {
          subscriptionLoading,
          tenantLoading,
          timeoutMs: LOADING_TIMEOUT_MS,
        });
        setLoadingTimedOut(true);
      }, LOADING_TIMEOUT_MS);

      return () => clearTimeout(timeoutId);
    } else {
      setLoadingTimedOut(false);
    }
  }, [subscriptionLoading, tenantLoading]);

  // Fetch all available plans
  const { data: allPlans = [], isLoading: plansLoading, error: plansError } = useQuery({
    queryKey: ['all-plans'],
    queryFn: async () => {
      logger.debug('Fetching subscription plans');
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('*')
        .order('price_per_device', { ascending: true });

      if (error) {
        logger.error('Failed to fetch plans', error);
        throw error;
      }
      logger.debug('Plans fetched successfully', { count: data?.length });
      return data as Plan[];
    },
  });

  // Create checkout session - V4: planName + billingPeriod for package discounts
  const createCheckout = useMutation({
    mutationFn: async ({ planName, period }: { planName: string; period: BillingPeriod }) => {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: { planName, billingPeriod: period },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        const periodLabel = PERIOD_CONFIG[billingPeriod].label;
        toast({
          title: 'Redirecionando para o checkout',
          description: `Plano ${periodLabel} selecionado. Você será redirecionado para completar o pagamento.`,
        });
        window.location.href = data.url;
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar checkout',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Setup Stripe products (one-time setup)
  const setupStripeProducts = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-stripe-products');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Produtos criados no Stripe!',
        description: `Starter, Business e Scale configurados com sucesso.`,
      });
      window.location.reload();
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao criar produtos',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  // Open customer portal
  const openPortal = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        toast({
          title: 'Redirecionando para o portal',
          description: 'Você será redirecionado para gerenciar sua assinatura.',
        });
        window.open(data.url, '_blank');
      } else if (data.trial) {
        toast({
          title: 'Período de Avaliação',
          description: data.error || 'Você está em período de avaliação. O portal estará disponível após escolher um plano.',
        });
      } else if (data.free) {
        toast({
          title: 'Plano Gratuito',
          description: 'Faça upgrade para um plano pago para acessar o portal de cobrança.',
        });
      } else if (data.error) {
        toast({
          title: 'Aviso',
          description: data.error,
          variant: 'destructive',
        });
      }
    },
    onError: (error: any) => {
      toast({
        title: 'Erro ao abrir portal',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const currentPlanName = subscription?.plan_name || 'free';
  const isSubscribed = subscription?.subscribed || false;

  // V4 Plan details with fixed pricing
  const planDetails: Record<string, {
    icon: typeof Zap;
    color: string;
    bgColor: string;
    description: string;
    price: string;
    priceNote?: string;
    features: string[];
    popular?: boolean;
  }> = {
    free: {
      icon: Zap,
      color: 'text-muted-foreground',
      bgColor: 'bg-muted',
      description: 'Perfeito para testar',
      price: 'Grátis',
      priceNote: '14 dias para avaliar',
      features: [
        'Até 3 dispositivos',
        'Dashboard básico',
        'Inventário de software',
        'Status do antivírus',
      ],
    },
    starter_compliance: {
      icon: Zap,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      description: 'Ideal para pequenas empresas',
      price: `R$ ${(PLAN_CONFIG.starter_compliance.basePriceCents / 100).toFixed(0)}`,
      priceNote: `/mês • até ${PLAN_CONFIG.starter_compliance.baseDevices} dispositivos base`,
      features: [...PLAN_CONFIG.starter_compliance.features],
      popular: true,
    },
    business: {
      icon: Crown,
      color: 'text-yellow-500',
      bgColor: 'bg-yellow-500/10',
      description: 'Para empresas em crescimento',
      price: `R$ ${(PLAN_CONFIG.business.basePriceCents / 100).toFixed(0)}`,
      priceNote: `/mês • até ${PLAN_CONFIG.business.baseDevices} dispositivos base`,
      features: [...PLAN_CONFIG.business.features],
    },
    enterprise: {
      icon: Building2,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      description: 'Para grandes organizações e MSPs',
      price: 'A partir de R$ 2.000/mês',
      features: [...PLAN_CONFIG.enterprise.features],
    },
  };

  // Order plans for display
  const planOrder = ['free', 'starter_compliance', 'business', 'enterprise'];
  const orderedPlans = planOrder
    .map(name => allPlans.find(p => p.name === name))
    .filter(Boolean) as Plan[];

  // Show timeout error if loading takes too long
  if (loadingTimedOut) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto" />
          <div>
            <h3 className="font-semibold text-lg">Carregamento demorado</h3>
            <p className="text-muted-foreground text-sm mt-1">
              O carregamento está demorando mais que o esperado.
            </p>
          </div>
          <Button 
            onClick={() => {
              setLoadingTimedOut(false);
              refetchSubscription();
              window.location.reload();
            }}
          >
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  if (tenantLoading || subscriptionLoading || plansLoading) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-3">
          <Loader2 className="h-8 w-8 animate-spin mx-auto text-primary" />
          <p className="text-muted-foreground">Carregando planos...</p>
          <p className="text-xs text-muted-foreground/60">
            {subscriptionLoading && 'Verificando assinatura... '}
            {tenantLoading && 'Carregando tenant... '}
            {plansLoading && 'Buscando planos...'}
          </p>
        </div>
      </div>
    );
  }

  if (plansError) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-destructive mx-auto" />
          <div>
            <h3 className="font-semibold text-lg">Erro ao carregar planos</h3>
            <p className="text-muted-foreground text-sm mt-1">
              {plansError instanceof Error ? plansError.message : 'Erro desconhecido'}
            </p>
          </div>
          <Button onClick={() => window.location.reload()}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  const needsSetup = allPlans.some(plan => 
    !plan.stripe_price_id && ['starter_compliance', 'business'].includes(plan.name)
  );

  return (
    <div className="space-y-6">
      {/* Setup Card - Only show if stripe_price_id is missing */}
      {needsSetup && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <Zap className="h-5 w-5" />
              Configuração Necessária
            </CardTitle>
            <CardDescription className="text-yellow-700 dark:text-yellow-300">
              Os planos ainda não estão conectados ao Stripe. Clique abaixo para criar os produtos automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={() => setupStripeProducts.mutate()}
              disabled={setupStripeProducts.isPending}
              className="w-full"
            >
              {setupStripeProducts.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Criando produtos no Stripe...
                </>
              ) : (
                <>
                  <Zap className="h-4 w-4 mr-2" />
                  Configurar Produtos Stripe Agora
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Planos e Preços</h1>
        <p className="text-muted-foreground">
          Escolha o plano ideal para sua equipe • Todos com 14 dias de trial grátis
        </p>
      </div>

      {/* Billing Period Selector */}
      <Card className="p-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-center">Escolha o período de pagamento</h3>
          <BillingPeriodSelector 
            value={billingPeriod} 
            onChange={setBillingPeriod} 
            basePrice={PLAN_CONFIG.starter_compliance.basePriceCents}
          />
        </div>
      </Card>

      {isSubscribed && subscription && (
        <Card className="border-primary">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <CardTitle className="text-lg">Plano Atual: {subscription.plan_name.toUpperCase()}</CardTitle>
                  <CardDescription>
                    Status: <Badge variant={subscription.status === 'active' ? 'default' : 'secondary'} className="ml-1 text-xs">
                      {subscription.status === 'trialing' ? 'Em teste' : subscription.status === 'active' ? 'Ativo' : subscription.status}
                    </Badge>
                  </CardDescription>
                </div>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Monitor className="h-3.5 w-3.5" />
                  Agentes Instalados
                </div>
                <p className="text-xl font-bold">{subscription.installed_agents ?? '—'}</p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Users className="h-3.5 w-3.5" />
                  Slots Disponíveis
                </div>
                <p className="text-xl font-bold text-primary">{subscription.available_slots ?? '—'}</p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <Monitor className="h-3.5 w-3.5" />
                  Máx. Dispositivos
                </div>
                <p className="text-xl font-bold">{subscription.max_devices ?? subscription.device_quantity ?? '—'}</p>
              </div>
              <div className="space-y-1 p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                  <CalendarDays className="h-3.5 w-3.5" />
                  {subscription.trial_end && new Date(subscription.trial_end) > new Date() ? 'Trial até' : 'Expira em'}
                </div>
                <p className="text-sm font-bold">
                  {subscription.trial_end && new Date(subscription.trial_end) > new Date()
                    ? formatBrazilDateTime(subscription.trial_end, 'date')
                    : subscription.current_period_end
                      ? formatBrazilDateTime(subscription.current_period_end, 'date')
                      : 'Sem expiração'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {orderedPlans.map((plan) => {
          const details = planDetails[plan.name];
          if (!details) return null;

          const Icon = details.icon;
          const isCurrent = plan.name === currentPlanName;
          const isPopular = details.popular;
          const isPaidPlan = ['starter_compliance', 'business'].includes(plan.name);
          const isEnterprise = plan.name === 'enterprise';

          return (
            <Card
              key={plan.id}
              className={`relative flex flex-col ${
                isPopular ? 'border-primary shadow-lg ring-2 ring-primary/20' : ''
              } ${isCurrent ? 'border-2 border-primary' : ''}`}
            >
              {isPopular && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary">
                  Mais Popular
                </Badge>
              )}
              {isCurrent && (
                <Badge className="absolute -top-3 left-1/2 -translate-x-1/2" variant="secondary">
                  Plano Atual
                </Badge>
              )}
              <CardHeader className="pb-2">
                <div className={`w-10 h-10 rounded-lg ${details.bgColor} flex items-center justify-center mb-2`}>
                  <Icon className={`h-5 w-5 ${details.color}`} />
                </div>
                <CardTitle className="text-xl capitalize">{plan.name === 'starter_compliance' ? 'Starter Compliance' : plan.name}</CardTitle>
                <CardDescription className="text-xs">{details.description}</CardDescription>
                
                <div className="mt-2">
                  <span className="text-2xl font-bold">{details.price}</span>
                  {details.priceNote && (
                    <p className="text-xs text-muted-foreground">{details.priceNote}</p>
                  )}
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <ul className="space-y-2 mb-4 flex-1">
                  {details.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-2">
                      <Check className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                      <span className="text-xs">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                {isPaidPlan && !isCurrent ? (
                  <div className="space-y-2">
                    {billingPeriod !== 'monthly' && (
                      <div className="text-center">
                        <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                          💰 -{PERIOD_CONFIG[billingPeriod].discountPct}% aplicado
                        </span>
                      </div>
                    )}
                    <Button
                      className="w-full"
                      variant={isPopular ? 'default' : 'secondary'}
                      onClick={() => createCheckout.mutate({ planName: plan.name, period: billingPeriod })}
                      disabled={createCheckout.isPending || !plan.stripe_price_id}
                    >
                      {createCheckout.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
                      {!plan.stripe_price_id ? 'Configurar Stripe' : 'Começar Trial Grátis'}
                    </Button>
                  </div>
                ) : isEnterprise ? (
                  <Button
                    className="w-full"
                    variant="outline"
                    onClick={() => window.open(CONTACT.WHATSAPP_LINK, '_blank')}
                  >
                    Falar com Vendas
                  </Button>
                ) : (
                  <Button className="w-full" variant="outline" disabled={isCurrent}>
                    {isCurrent ? 'Plano Atual' : 'Grátis'}
                  </Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Package discount info */}
      <Card className="bg-gradient-to-r from-green-500/5 to-green-500/10 border-green-500/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            💰 Economize com pacotes pré-pagos
          </CardTitle>
          <CardDescription>
            <ul className="space-y-1 mt-2 text-sm">
              <li>• <strong>6 meses:</strong> 4% de desconto</li>
              <li>• <strong>12 meses:</strong> 8% de desconto ⭐ Mais popular</li>
              <li>• <strong>24 meses:</strong> 16% de desconto 💎 Melhor valor</li>
            </ul>
          </CardDescription>
        </CardHeader>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Precisa de mais dispositivos?</CardTitle>
          <CardDescription>
            Entre em contato para planos customizados ou recursos adicionais
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button 
            variant="outline"
            onClick={() => window.open(CONTACT.WHATSAPP_LINK, '_blank')}
          >
            Falar com Vendas
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
