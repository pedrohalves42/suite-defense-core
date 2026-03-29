import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';
// COST-OPT-V9: Only hook that retains polling (10 min interval)
export const useSubscription = () => {
  const { user } = useAuth();

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
    staleTime: 2 * 60 * 1000, // 2 minutes - subscription data doesn't change frequently
    refetchInterval: adaptiveInterval,
  });

  return {
    subscription,
    isLoading,
    refetch
  };
};
