import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2, Zap, AlertTriangle } from 'lucide-react';
import { PLAN_CONFIG } from '@/constants/plans';
import { CONTACT } from '@/constants/config';
import { BillingPeriodSelector } from '@/components/admin/BillingPeriodSelector';
import { usePlanUpgrade } from './hooks/usePlanUpgrade';
import { PlanCard } from './components/PlanCard';
import { CurrentPlanCard } from './components/CurrentPlanCard';
import { PLAN_DETAILS, PLAN_ORDER } from './types';
import type { Plan } from './types';

export default function PlanUpgradeNew() {
  const {
    subscription, subscriptionLoading, refetchSubscription,
    tenantLoading, loadingTimedOut, setLoadingTimedOut,
    billingPeriod, setBillingPeriod,
    allPlans, plansLoading, plansError,
    createCheckout, setupStripeProducts,
    currentPlanName, isSubscribed, needsSetup,
  } = usePlanUpgrade();

  if (loadingTimedOut) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <AlertTriangle className="h-10 w-10 text-yellow-500 mx-auto" />
          <div>
            <h3 className="font-semibold text-lg">Carregamento demorado</h3>
            <p className="text-muted-foreground text-sm mt-1">O carregamento está demorando mais que o esperado.</p>
          </div>
          <Button onClick={() => { setLoadingTimedOut(false); refetchSubscription(); window.location.reload(); }}>
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
            <p className="text-muted-foreground text-sm mt-1">{plansError instanceof Error ? plansError.message : 'Erro desconhecido'}</p>
          </div>
          <Button onClick={() => window.location.reload()}>Tentar novamente</Button>
        </div>
      </div>
    );
  }

  const orderedPlans = PLAN_ORDER.map(name => allPlans.find(p => p.name === name)).filter(Boolean) as Plan[];

  return (
    <div className="space-y-6">
      {needsSetup && (
        <Card className="border-yellow-500 bg-yellow-50 dark:bg-yellow-950">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-yellow-800 dark:text-yellow-200">
              <Zap className="h-5 w-5" /> Configuração Necessária
            </CardTitle>
            <CardDescription className="text-yellow-700 dark:text-yellow-300">
              Os planos ainda não estão conectados ao Stripe. Clique abaixo para criar os produtos automaticamente.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={() => setupStripeProducts.mutate()} disabled={setupStripeProducts.isPending} className="w-full">
              {setupStripeProducts.isPending ? (
                <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Criando produtos no Stripe...</>
              ) : (
                <><Zap className="h-4 w-4 mr-2" /> Configurar Produtos Stripe Agora</>
              )}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Planos e Preços</h1>
        <p className="text-muted-foreground">Escolha o plano ideal para sua equipe • Todos com 14 dias de trial grátis</p>
      </div>

      <Card className="p-4">
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-center">Escolha o período de pagamento</h3>
          <BillingPeriodSelector value={billingPeriod} onChange={setBillingPeriod} basePrice={PLAN_CONFIG.starter_compliance.basePriceCents} />
        </div>
      </Card>

      {isSubscribed && subscription && <CurrentPlanCard subscription={subscription} />}

      <div className="grid md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-4">
        {orderedPlans.map((plan) => {
          const details = PLAN_DETAILS[plan.name];
          if (!details) return null;
          return (
            <PlanCard
              key={plan.id}
              plan={plan}
              details={details}
              isCurrent={plan.name === currentPlanName}
              billingPeriod={billingPeriod}
              isCheckoutPending={createCheckout.isPending}
              onCheckout={(planName, period) => createCheckout.mutate({ planName, period })}
            />
          );
        })}
      </div>

      <Card className="bg-gradient-to-r from-green-500/5 to-green-500/10 border-green-500/20">
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">💰 Economize com pacotes pré-pagos</CardTitle>
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
          <CardDescription>Entre em contato para planos customizados ou recursos adicionais</CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" onClick={() => window.open(CONTACT.WHATSAPP_LINK, '_blank')}>Falar com Vendas</Button>
        </CardContent>
      </Card>
    </div>
  );
}
