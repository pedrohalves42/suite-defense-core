import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { logger } from '@/lib/logger';
import { useAdaptivePolling } from '@/hooks/useAdaptivePolling';

interface SmartNotification {
  type: string;
  title: string;
  message: string;
  urgency: 'low' | 'medium' | 'high';
  action?: string;
  actionHref?: string;
}

/**
 * Hook for fetching smart notifications in simple business language
 * Designed for the Simple Mode dashboard
 */
export function useSmartNotifications() {
  const adaptiveInterval = useAdaptivePolling(300_000);
  const { tenant, loading: tenantLoading } = useTenant();

  const { data: notifications, isLoading, refetch } = useQuery({
    queryKey: ['smart-notifications', tenant?.id],
    queryFn: async () => {
      if (!tenant?.id) return [];
      
      const { data, error } = await supabase.rpc('get_smart_notifications', {
        p_tenant_id: tenant.id
      });
      
      if (error) {
        logger.error('[useSmartNotifications] Error', error);
        return [];
      }
      
      // Parse the jsonb array response
      if (Array.isArray(data)) {
        return data as unknown as SmartNotification[];
      }
      
      // If it's a single object or jsonb, wrap in array
      if (data && typeof data === 'object') {
        return [data] as unknown as SmartNotification[];
      }
      
      return [];
    },
    enabled: !tenantLoading && !!tenant?.id,
    refetchInterval: adaptiveInterval,
    staleTime: 120_000
  });

  return {
    notifications: notifications || [],
    isLoading: tenantLoading || isLoading,
    refetch
  };
}
