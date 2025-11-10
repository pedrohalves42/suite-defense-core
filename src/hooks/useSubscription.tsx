import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

interface SubscriptionFeature {
  enabled: boolean;
  quota_limit: number | null;
  quota_used: number;
}

interface SubscriptionData {
  subscribed: boolean;
  plan_name: string;
  device_quantity: number;
  status: string;
  trial_end: string | null;
  current_period_end: string | null;
  features: Record<string, SubscriptionFeature>;
}

export const useSubscription = () => {
  const { user } = useAuth();

  const { data: subscription, isLoading, refetch } = useQuery<SubscriptionData>({
    queryKey: ['subscription', user?.id],
    queryFn: async () => {
      if (!user) throw new Error('Not authenticated');

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        headers: {
          Authorization: `Bearer ${(await supabase.auth.getSession()).data.session?.access_token}`,
        },
      });

      if (error) throw error;
      return data as SubscriptionData;
    },
    enabled: !!user,
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  return {
    subscription,
    isLoading,
    refetch,
  };
};
