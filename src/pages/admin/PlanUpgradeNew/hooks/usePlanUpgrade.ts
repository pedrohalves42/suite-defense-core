import { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { useTenant } from '@/hooks/useTenant';
import { logger } from '@/lib/logger';
import { PERIOD_CONFIG, type BillingPeriod } from '@/components/admin/BillingPeriodSelector';
import type { Plan } from '../types';

const LOADING_TIMEOUT_MS = 15000;

export function usePlanUpgrade() {
  const { toast } = useToast();
  const { subscription, isLoading: subscriptionLoading, refetch: refetchSubscription } = useSubscription();
  const { tenant, loading: tenantLoading } = useTenant();
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [billingPeriod, setBillingPeriod] = useState<BillingPeriod>('12m');

  useEffect(() => {
    logger.debug('PlanUpgradeNew loading states', { subscriptionLoading, tenantLoading, hasSubscription: !!subscription, hasTenant: !!tenant });
  }, [subscriptionLoading, tenantLoading, subscription, tenant]);

  useEffect(() => {
    if (subscriptionLoading || tenantLoading) {
      const timeoutId = setTimeout(() => {
        logger.warn('PlanUpgradeNew loading timeout exceeded', { subscriptionLoading, tenantLoading, timeoutMs: LOADING_TIMEOUT_MS });
        setLoadingTimedOut(true);
      }, LOADING_TIMEOUT_MS);
      return () => clearTimeout(timeoutId);
    } else {
      setLoadingTimedOut(false);
    }
  }, [subscriptionLoading, tenantLoading]);

  const { data: allPlans = [], isLoading: plansLoading, error: plansError } = useQuery({
    queryKey: ['all-plans'],
    queryFn: async () => {
      logger.debug('Fetching subscription plans');
      const { data, error } = await supabase
        .from('subscription_plans')
        .select('id, name, max_users, max_agents, max_scans_per_month, price_per_device')
        .order('price_per_device', { ascending: true });
      if (error) { logger.error('Failed to fetch plans', error); throw error; }
      logger.debug('Plans fetched successfully', { count: data?.length });
      return data as Plan[];
    },
  });

  const createCheckout = useMutation({
    mutationFn: async ({ planName, period }: { planName: string; period: BillingPeriod }) => {
      const { data, error } = await supabase.functions.invoke('create-checkout', { body: { planName, billingPeriod: period } });
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        const periodLabel = PERIOD_CONFIG[billingPeriod].label;
        toast({ title: 'Redirecionando para o checkout', description: `Plano ${periodLabel} selecionado. Você será redirecionado para completar o pagamento.` });
        window.location.href = data.url;
      }
    },
    onError: (error: Error) => { toast({ title: 'Erro ao criar checkout', description: error.message, variant: 'destructive' }); },
  });

  const setupStripeProducts = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('create-stripe-products');
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      toast({ title: 'Produtos criados no Stripe!', description: 'Starter, Business e Scale configurados com sucesso.' });
      window.location.reload();
    },
    onError: (error: Error) => { toast({ title: 'Erro ao criar produtos', description: error.message, variant: 'destructive' }); },
  });

  const openPortal = useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.functions.invoke('customer-portal');
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      if (data.url) {
        toast({ title: 'Redirecionando para o portal', description: 'Você será redirecionado para gerenciar sua assinatura.' });
        window.open(data.url, '_blank');
      } else if (data.trial) {
        toast({ title: 'Período de Avaliação', description: data.error || 'Você está em período de avaliação. O portal estará disponível após escolher um plano.' });
      } else if (data.free) {
        toast({ title: 'Plano Gratuito', description: 'Faça upgrade para um plano pago para acessar o portal de cobrança.' });
      } else if (data.error) {
        toast({ title: 'Aviso', description: data.error, variant: 'destructive' });
      }
    },
    onError: (error: Error) => { toast({ title: 'Erro ao abrir portal', description: error.message, variant: 'destructive' }); },
  });

  const currentPlanName = subscription?.plan_name || 'free';
  const isSubscribed = subscription?.subscribed || false;
  const needsSetup = allPlans.some(plan => !plan.stripe_price_id && ['starter_compliance', 'business'].includes(plan.name));

  return {
    subscription, subscriptionLoading, refetchSubscription,
    tenantLoading, loadingTimedOut, setLoadingTimedOut,
    billingPeriod, setBillingPeriod,
    allPlans, plansLoading, plansError,
    createCheckout, setupStripeProducts, openPortal,
    currentPlanName, isSubscribed, needsSetup,
  };
}
