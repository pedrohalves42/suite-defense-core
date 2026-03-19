import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from './useTenant';
import { toast } from 'sonner';
import type { Json } from '@/integrations/supabase/types';

export interface ForensicSnapshot {
  id: string;
  agent_id: string;
  tenant_id: string;
  trigger_reason: string;
  config_snapshot: Json;
  process_snapshot: Json;
  network_snapshot: Json;
  system_liveness_snapshot: Json;
  created_at: string;
  expires_at: string;
  metadata: Json;
}

export const useForensicSnapshots = (agentId?: string) => {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['forensic-snapshots', tenant?.id, agentId],
    queryFn: async (): Promise<ForensicSnapshot[]> => {
      if (!tenant?.id) return [];

      let query = supabase
        .from('forensic_snapshots')
        .select('id, agent_id, tenant_id, trigger_reason, created_at, expires_at, metadata')
        .eq('tenant_id', tenant.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (agentId) {
        query = query.eq('agent_id', agentId);
      }

      const { data, error } = await query;

      if (error) throw error;
      return (data || []) as unknown as ForensicSnapshot[];
    },
    enabled: !!tenant?.id
  });
};

export const useCreateForensicSnapshot = () => {
  const queryClient = useQueryClient();
  const { tenant } = useTenant();

  return useMutation({
    mutationFn: async ({
      agentId,
      triggerReason,
      configSnapshot,
      processSnapshot,
      networkSnapshot,
      systemLivenessSnapshot,
      metadata
    }: {
      agentId: string;
      triggerReason: string;
      configSnapshot?: Json;
      processSnapshot?: Json;
      networkSnapshot?: Json;
      systemLivenessSnapshot?: Json;
      metadata?: Json;
    }) => {
      if (!tenant?.id) throw new Error('Tenant not found');

      const { data, error } = await supabase
        .rpc('create_forensic_snapshot' as any, {
          p_agent_id: agentId,
          p_tenant_id: tenant.id,
          p_trigger_reason: triggerReason,
          p_config_snapshot: configSnapshot || {},
          p_process_snapshot: processSnapshot || {},
          p_network_snapshot: networkSnapshot || {},
          p_system_liveness_snapshot: systemLivenessSnapshot || {},
          p_metadata: metadata || {}
        });

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['forensic-snapshots'] });
      toast.success('Snapshot forense criado com sucesso');
    },
    onError: (error) => {
      toast.error('Erro ao criar snapshot: ' + (error as Error).message);
    }
  });
};

export const useForensicSnapshotById = (snapshotId: string) => {
  return useQuery({
    queryKey: ['forensic-snapshot', snapshotId],
    queryFn: async (): Promise<ForensicSnapshot | null> => {
      if (!snapshotId) return null;
      
      const { data, error } = await supabase
        .from('forensic_snapshots')
        .select('*')
        .eq('id', snapshotId)
        .maybeSingle();

      if (error) throw error;
      return (data as unknown as ForensicSnapshot) || null;
    },
    enabled: !!snapshotId
  });
};
