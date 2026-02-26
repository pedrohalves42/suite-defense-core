import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from './useAuth';

/**
 * Hook for admin access to full agent release data including sensitive fields.
 * Uses Edge Function to bypass column-level restrictions.
 * SECURITY: Only accessible to authenticated admins via get-agent-script-content function.
 */
export const useAdminAgentReleases = () => {
  const { user } = useAuth();
  
  const { data: releases = [], isLoading, error, refetch } = useQuery({
    queryKey: ['admin-agent-releases', user?.id],
    enabled: !!user,
    queryFn: async () => {
      // Use Edge Function to get full release data for admin
      const { data, error } = await supabase.functions.invoke('get-agent-script-content', {
        body: { action: 'list-all' },
      });
      
      if (error) throw error;
      return data?.releases || [];
    },
    refetchInterval: 300000, // COST-OPT: 30s → 5min
    refetchOnWindowFocus: true,
  });

  return {
    releases,
    isLoading,
    error,
    refetch,
  };
};
