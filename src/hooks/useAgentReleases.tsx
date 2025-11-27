import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export const useAgentReleases = () => {
  const queryClient = useQueryClient();

  const { data: releases = [], isLoading, error, refetch } = useQuery({
    queryKey: ['agent-releases'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('agent_releases')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return data;
    },
    refetchInterval: 10000, // Auto-refresh every 10 seconds
    refetchOnWindowFocus: true, // Refetch when tab gets focus
    staleTime: 5000, // Keep data fresh for 5 seconds
  });

  const registerRelease = useMutation({
    mutationFn: async ({
      version,
      platform,
      script_content,
      release_notes,
      channel = 'stable',
      manual_sha256,
    }: {
      version: string;
      platform: string;
      script_content: string;
      release_notes?: string;
      channel?: string;
      manual_sha256?: string;
    }) => {
      // Use manual SHA256 if provided (for backwards compatibility)
      // Otherwise calculate SHA256 WITHOUT BOM (standard for v3.10.12+ agents)
      let sha256: string;
      if (manual_sha256) {
        sha256 = manual_sha256;
        console.log('[useAgentReleases] Using manual SHA256:', sha256.substring(0, 16) + '...');
      } else {
        // Calculate SHA256 WITHOUT BOM (v3.10.12+ uses WriteAllText without BOM)
        const encoder = new TextEncoder();
        const contentBytes = encoder.encode(script_content);
        const hashBuffer = await crypto.subtle.digest('SHA-256', contentBytes);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        sha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
        console.log('[useAgentReleases] Calculated SHA256 WITHOUT BOM:', sha256.substring(0, 16) + '...');
      }

      // Call register-agent-release Edge Function
      const { data: result, error } = await supabase.functions.invoke('register-agent-release', {
        body: {
          version,
          platform,
          script_content,
          sha256,
          manual_sha256,
          release_notes,
          channel,
        },
      });

      if (error) throw error;
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-releases'] });
      toast.success('Release registrada com sucesso');
    },
    onError: (error) => {
      console.error('Error registering release:', error);
      toast.error(`Erro ao registrar release: ${error.message || 'Unknown error'}`);
    },
  });

  return {
    releases,
    isLoading,
    error,
    refetch,
    registerRelease: registerRelease.mutate,
    isRegistering: registerRelease.isPending,
  };
};
