import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export type SystemMode = 'normal' | 'restricted' | 'emergency_stop';

export interface SystemState {
  mode: SystemMode;
  triggered_at: string | null;
  reason: string | null;
  triggered_by: string | null;
  expires_at: string | null;
}

export function useSystemMode() {
  return useQuery({
    queryKey: ['system-mode'],
    queryFn: async () => {
      // get_system_mode() returns just the enum value (string), not a full object
      const { data: modeValue, error } = await supabase.rpc('get_system_mode');
      
      if (error) throw error;
      
      // If no active state exists, or mode is just a string, construct a SystemState
      const mode = (typeof modeValue === 'string' ? modeValue : 'normal') as SystemMode;
      
      // Only fetch full state details if NOT normal
      if (mode !== 'normal') {
        const { data: stateRow } = await supabase
          .from('system_global_state')
          .select('mode, triggered_at, reason, triggered_by, expires_at')
          .order('triggered_at', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        if (stateRow) {
          return {
            mode: stateRow.mode as SystemMode,
            triggered_at: stateRow.triggered_at,
            reason: stateRow.reason,
            triggered_by: stateRow.triggered_by,
            expires_at: stateRow.expires_at,
          } as SystemState;
        }
      }
      
      return {
        mode: 'normal',
        triggered_at: null,
        reason: null,
        triggered_by: null,
        expires_at: null,
      } as SystemState;
    },
    refetchInterval: 120000, // COST-OPT: 30s → 2min
    staleTime: 10000,
  });
}

export function useActivateKillSwitch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ 
      mode, 
      reason, 
      expiresAt 
    }: { 
      mode: SystemMode; 
      reason: string; 
      expiresAt?: string;
    }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('User not authenticated');
      
      const { data, error } = await supabase
        .from('system_global_state')
        .insert({
          mode,
          reason,
          triggered_by: user.id,
          expires_at: expiresAt || null,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['system-mode'] });
      
      const modeLabels: Record<SystemMode, string> = {
        normal: 'Normal',
        restricted: 'Restrito',
        emergency_stop: 'Parada de Emergência',
      };
      
      toast.success(`Sistema alterado para modo: ${modeLabels[variables.mode]}`);
    },
    onError: (error) => {
      logger.error('Error activating kill switch:', error);
      toast.error('Erro ao alterar estado do sistema');
    },
  });
}

export function useDeactivateKillSwitch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (!user) throw new Error('User not authenticated');
      
      // Insert a 'normal' state to override the current emergency state
      const { data, error } = await supabase
        .from('system_global_state')
        .insert({
          mode: 'normal',
          reason: 'Kill switch deactivated by administrator',
          triggered_by: user.id,
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-mode'] });
      toast.success('Sistema restaurado para operação normal');
    },
    onError: (error) => {
      logger.error('Error deactivating kill switch:', error);
      toast.error('Erro ao restaurar sistema');
    },
  });
}
