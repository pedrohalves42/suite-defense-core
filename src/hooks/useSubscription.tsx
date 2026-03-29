import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
import { usePageVisibility } from './usePageVisibility';

interface SubscriptionFeature {
  enabled: boolean;
  quota_limit: number | null;
  quota_used: number;
}

interface SubscriptionData {
  subscribed: boolean;
  plan_name: string;
  device_quantity: number;
  max_devices: number;
  installed_agents: number;
  available_slots: number;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  features: Record<string, SubscriptionFeature>;
}

// COST-OPT-V9: Only hook that retains polling (10 min, paused when hidden)
export const useSubscription = () => {
  const { user } = useAuth();
  const isVisible = usePageVisibility();

  const { data: subscription, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`
        }
      });

      if (error) throw error;
      return data as SubscriptionData;
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
