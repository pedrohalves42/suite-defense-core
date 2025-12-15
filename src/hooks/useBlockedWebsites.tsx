import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface BlockedWebsite {
  id: string;
  tenant_id: string;
  domain_pattern: string;
  reason: string | null;
  blocked_by: string | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

interface BlockWebsiteParams {
  domain_pattern: string;
  reason?: string;
  autoSync?: boolean; // Auto-sync with online agents after blocking
}

// Helper to sync blocked websites with agents
async function syncWithAgents(): Promise<{ jobsCreated: number; agentNames: string[] }> {
  const { data, error } = await supabase.functions.invoke('sync-blocked-websites', {
    method: 'POST',
  });
  
  if (error) {
    console.error('Failed to sync blocked websites:', error);
    throw error;
  }
  
  return {
    jobsCreated: data?.jobs_created || 0,
    agentNames: data?.agent_names || [],
  };
}

export function useBlockedWebsites() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: blockedWebsites, isLoading, error } = useQuery({
    queryKey: ['blocked-websites'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('blocked_websites')
        .select('*')
        .eq('is_active', true)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data as BlockedWebsite[];
    },
  });

  const blockWebsite = useMutation({
    mutationFn: async ({ domain_pattern, reason, autoSync = true }: BlockWebsiteParams) => {
      // Get current user's tenant_id
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user?.id) throw new Error('User not authenticated');

      const { data: userRole } = await supabase
        .from('user_roles')
        .select('tenant_id')
        .eq('user_id', userData.user.id)
        .single();

      if (!userRole?.tenant_id) throw new Error('Tenant not found');

      const normalizedDomain = domain_pattern.toLowerCase().trim();

      // Check if already exists (active or inactive)
      const { data: existing } = await supabase
        .from('blocked_websites')
        .select('id, is_active')
        .eq('tenant_id', userRole.tenant_id)
        .eq('domain_pattern', normalizedDomain)
        .maybeSingle();

      let result;
      if (existing) {
        // Update existing record
        const { data, error } = await supabase
          .from('blocked_websites')
          .update({
            is_active: true,
            reason: reason || null,
            blocked_by: userData.user.id,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id)
          .select()
          .single();

        if (error) throw error;
        result = data;
      } else {
        // Insert new record
        const { data, error } = await supabase
          .from('blocked_websites')
          .insert({
            tenant_id: userRole.tenant_id,
            domain_pattern: normalizedDomain,
            reason: reason || null,
            blocked_by: userData.user.id,
            is_active: true,
          })
          .select()
          .single();

        if (error) throw error;
        result = data;
      }

      // Auto-sync with online agents if enabled
      if (autoSync) {
        try {
          const syncResult = await syncWithAgents();
          return { ...result, syncResult };
        } catch (syncError) {
          console.warn('Auto-sync failed, site blocked but agents not synced:', syncError);
          return { ...result, syncResult: null };
        }
      }

      return result;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['blocked-websites'] });
      
      const syncInfo = data?.syncResult;
      if (syncInfo && syncInfo.jobsCreated > 0) {
        toast({
          title: 'Site bloqueado e sincronizado',
          description: `Domínio bloqueado e enviado para ${syncInfo.jobsCreated} computador(es) online.`,
        });
      } else {
        toast({
          title: 'Site bloqueado',
          description: 'Domínio adicionado à lista. Clique em "Sincronizar" para enviar aos computadores.',
        });
      }
    },
    onError: (error) => {
      toast({
        title: 'Erro ao bloquear site',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const unblockWebsite = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('blocked_websites')
        .update({ is_active: false })
        .eq('id', id);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['blocked-websites'] });
      toast({
        title: 'Site desbloqueado',
        description: 'O domínio foi removido da lista de bloqueio.',
      });
    },
    onError: (error) => {
      toast({
        title: 'Erro ao desbloquear site',
        description: error instanceof Error ? error.message : 'Erro desconhecido',
        variant: 'destructive',
      });
    },
  });

  const isBlocked = (domain: string) => {
    if (!blockedWebsites) return false;
    const normalizedDomain = domain.toLowerCase().trim();
    return blockedWebsites.some(site => {
      const pattern = site.domain_pattern.toLowerCase();
      // Support wildcard patterns like *.facebook.com
      if (pattern.startsWith('*.')) {
        const suffix = pattern.slice(2);
        return normalizedDomain === suffix || normalizedDomain.endsWith('.' + suffix);
      }
      return normalizedDomain === pattern || normalizedDomain.endsWith('.' + pattern);
    });
  };

  return {
    blockedWebsites,
    isLoading,
    error,
    blockWebsite,
    unblockWebsite,
    isBlocked,
  };
}
