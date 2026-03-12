/**
 * Hook para Resolução de DLQ com Trilha de Auditoria
 * PASSO 3: DLQ Auditável com Trilha de Decisão (+10 pts score)
 * 
 * Este hook implementa a resolução de itens da DLQ com:
 * - resolution_source explícito (human, system, auto_cleanup)
 * - resolution_notes obrigatórios para resolução humana
 * - decision_event criado automaticamente via trigger
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useTenant } from './useTenant';

export interface DlqItem {
  id: string;
  tenant_id: string;
  original_job_id: string | null;
  job_type: string;
  payload: Record<string, unknown>;
  error_message: string;
  retry_count: number;
  max_retries: number;
  status: 'pending' | 'resolved' | 'failed';
  review_required: boolean;
  resolution_notes: string | null;
  resolved_by: string | null;
  resolved_at: string | null;
  resolution_source: 'human' | 'system' | 'auto_cleanup' | null;
  decision_event_id: string | null;
  created_at: string;
  agent_id: string | null;
}

export interface ResolveDlqParams {
  dlqItemId: string;
  resolutionNotes: string;
  resolutionSource?: 'human' | 'system' | 'auto_cleanup';
}

export function useDlqItems(options: { status?: string; limit?: number } = {}) {
  const { tenant } = useTenant();
  const { status = 'pending', limit = 100 } = options;

  return useQuery({
    queryKey: ['dlq-items', tenant?.id, status, limit],
    queryFn: async () => {
      let query = supabase
        .from('failed_jobs_dlq')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (tenant?.id) {
        query = query.eq('tenant_id', tenant.id);
      }

      if (status !== 'all') {
        query = query.eq('status', status);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as DlqItem[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000, // COST-OPT: 30s → 5min
  });
}

export function useDlqPendingAttention() {
  const { tenant } = useTenant();

  return useQuery({
    queryKey: ['dlq-pending-attention', tenant?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('v_dlq_pending_attention')
        .select('*')
        .order('created_at', { ascending: true });

      if (error) throw error;
      return (data || []) as (DlqItem & { hours_pending: number })[];
    },
    enabled: !!tenant?.id,
    refetchInterval: 300000, // COST-OPT: 60s → 5min
  });
}

export function useResolveDlqItem() {
  const { tenant } = useTenant();
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dlqItemId, resolutionNotes, resolutionSource = 'human' }: ResolveDlqParams) => {
      if (!tenant?.id) throw new Error('Tenant not found');
      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // 2. Validate resolution notes for human resolution
      if (resolutionSource === 'human' && (!resolutionNotes || resolutionNotes.trim().length < 5)) {
        throw new Error('Notas de resolução são obrigatórias (mínimo 5 caracteres)');
      }

      // 3. Update the DLQ item - trigger will create decision_event automatically
      const { error: updateError } = await supabase
        .from('failed_jobs_dlq')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: resolutionNotes,
          resolution_source: resolutionSource,
        })
        .eq('id', dlqItemId)
        .eq('tenant_id', tenant.id); // V-1031 FIX: tenant isolation

      if (updateError) throw updateError;

      return { success: true, dlqItemId };
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['dlq-items'] });
      queryClient.invalidateQueries({ queryKey: ['dlq-pending-attention'] });
      queryClient.invalidateQueries({ queryKey: ['decision-events'] });
      toast.success('Item da DLQ resolvido com sucesso');
    },
    onError: (error) => {
      console.error('[useResolveDlqItem] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao resolver item da DLQ');
    },
  });
}

export function useResolveDlqBatch() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ dlqItemIds, resolutionNotes, resolutionSource = 'human' }: { 
      dlqItemIds: string[]; 
      resolutionNotes: string;
      resolutionSource?: 'human' | 'system' | 'auto_cleanup';
    }) => {
      // 1. Get current user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) throw new Error('User not authenticated');

      // 2. Validate
      if (resolutionSource === 'human' && (!resolutionNotes || resolutionNotes.trim().length < 5)) {
        throw new Error('Notas de resolução são obrigatórias (mínimo 5 caracteres)');
      }

      // 3. Update all items
      const { error: updateError } = await supabase
        .from('failed_jobs_dlq')
        .update({
          status: 'resolved',
          resolved_at: new Date().toISOString(),
          resolved_by: user.id,
          resolution_notes: resolutionNotes,
          resolution_source: resolutionSource,
        })
        .in('id', dlqItemIds);

      if (updateError) throw updateError;

      return { success: true, count: dlqItemIds.length };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['dlq-items'] });
      queryClient.invalidateQueries({ queryKey: ['dlq-pending-attention'] });
      queryClient.invalidateQueries({ queryKey: ['decision-events'] });
      toast.success(`${data.count} itens da DLQ resolvidos`);
    },
    onError: (error) => {
      console.error('[useResolveDlqBatch] Error:', error);
      toast.error(error instanceof Error ? error.message : 'Erro ao resolver itens da DLQ');
    },
  });
}

/**
 * Labels para status da DLQ
 */
export const DLQ_STATUS_LABELS: Record<string, string> = {
  pending: 'Pendente',
  resolved: 'Resolvido',
  failed: 'Falhou',
};

/**
 * Labels para source de resolução
 */
export const RESOLUTION_SOURCE_LABELS: Record<string, string> = {
  human: 'Humano',
  system: 'Sistema',
  auto_cleanup: 'Limpeza Automática',
};
