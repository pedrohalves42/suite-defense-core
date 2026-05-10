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

// COST-OPT-V9: Polling retained with 10 min interval, paused when browser tab is inactive.
export const useSubscription = () => {
  const { user } = useAuth();
  const isVisible = usePageVisibility();

  const { data: subscription, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');
      return await callGateway<SubscriptionData>('billing', 'check-subscription');
    },
    enabled: !!user,
    staleTime: 5 * 60 * 1000,
    // COST-OPT-V9: Polling retained with 10 min interval, paused when browser tab is inactive (ADR-052).
    refetchInterval: isVisible ? 600_000 : false,
  });

  return {
    subscription,
    isLoading,
    refetch,
  };
};
