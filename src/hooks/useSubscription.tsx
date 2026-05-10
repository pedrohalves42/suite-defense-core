import { useQuery } from '@tanstack/react-query';
import { useAuth } from './useAuth';
import { callGateway } from '@/lib/gateway';
import { usePageVisibility } from './usePageVisibility';

interface SubscriptionFeature {
  enabled: boolean;
  quota_limit: number | null;
  quota_used: number;
}

interface SubscriptionData {
  subscribed: boolean;
  plan_name: string;
  base_devices: number;
  addon_devices: number;
  total_devices: number;
  device_quantity: number;
  max_devices: number;
  installed_agents: number;
  available_slots: number;
  status: string;
  is_legacy: boolean;
  trial_end: string | null;
  current_period_end: string | null;
  features?: Record<string, SubscriptionFeature>;
}

// ADR-052: Managed subscription lifecycle with visibility-aware polling (FinOps).
export const useSubscription = () => {
  const { user, loading: authLoading } = useAuth();
  const isVisible = usePageVisibility();

  const { data: subscription, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      return await callGateway<SubscriptionData>('billing', 'check-subscription');
    },
    enabled: !!user && !authLoading,
    staleTime: 5 * 60 * 1000,
    // ADR-052: Polling active ONLY when tab is visible to optimize infra costs (FinOps).
    // UX FIX: Small random jitter (30s) prevents synchronized "thundering herd" spikes.
    refetchInterval: isVisible ? (600_000 + Math.floor(Math.random() * 30000)) : false,
  });

  return {
    subscription,
    isLoading,
    refetch,
  };
};
