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

// COST-OPT-V9: Only hook that retains polling (10 min, paused when hidden)
export const useSubscription = () => {
  const { user } = useAuth();
  const isVisible = usePageVisibility();

  const { data: subscription, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const data = await callGateway<SubscriptionData>('billing', 'check-subscription');
      return data;
    },
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: isVisible ? 600_000 : false, // 10 min when visible, off when hidden
  });

  return {
    subscription,
    isLoading,
    refetch
  };
};
