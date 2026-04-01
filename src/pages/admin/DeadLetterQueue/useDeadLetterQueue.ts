import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { toast } from 'sonner';

export interface DLQEntry {
  id: string;
  original_job_id: string;
  tenant_id: string;
  agent_name: string;
  job_type: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  payload: any | null;
  error_message: string | null;
  error_count: number;
  retry_count: number;
  max_retries: number;
  status: 'pending' | 'retrying' | 'exhausted' | 'resolved';
  first_failure_at: string;
  last_failure_at: string;
  next_retry_at: string | null;
  resolution_notes: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  metadata: any | null;
}

export function useDeadLetterQueue() {
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [selectedEntry, setSelectedEntry] = useState<DLQEntry | null>(null);
  const [resolveNotes, setResolveNotes] = useState('');
  const [showResolveDialog, setShowResolveDialog] = useState(false);
  const [showDetailsDialog, setShowDetailsDialog] = useState(false);

  const { data: entries, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['dlq-entries', statusFilter],
    queryFn: async () => {
      let query = supabase
        .from('failed_jobs_dlq')
        .select('id, original_job_id, tenant_id, agent_name, agent_id, job_type, payload, error_message, error_count, retry_count, failure_class, classification, status, first_failure_at, last_failure_at, next_retry_at, max_retries, flagged_suspicious, auto_flagged_reason, resolution_notes, resolved_at, resolved_by, metadata, created_at')
        .order('last_failure_at', { ascending: false })
        .limit(100);
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data as DLQEntry[];
    },
  });

  const resolveMutation = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      const { error } = await supabase
        .from('failed_jobs_dlq')
        .update({ status: 'resolved', resolved_at: new Date().toISOString(), resolved_by: user?.id, resolution_notes: notes })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Verificação marcada como resolvida');
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
      setShowResolveDialog(false);
      setResolveNotes('');
    },
    onError: (error) => { toast.error(`Failed to resolve: ${error.message}`); },
  });

  const retryMutation = useMutation({
    mutationFn: async (entry: DLQEntry) => {
      const { error: jobError } = await supabase.functions.invoke('create-job', {
        body: { agent_name: entry.agent_name, job_type: entry.job_type, payload: entry.payload },
      });
      if (jobError) throw jobError;
      const { error: dlqError } = await supabase
        .from('failed_jobs_dlq')
        .update({ status: 'retrying', retry_count: entry.retry_count + 1 })
        .eq('id', entry.id);
      if (dlqError) throw dlqError;
    },
    onSuccess: () => {
      toast.success('Verificação reenviada para execução');
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
    },
    onError: (error) => { toast.error(`Falha ao reenviar: ${error.message}`); },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('failed_jobs_dlq').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success('Entrada removida');
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
    },
    onError: (error) => { toast.error(`Falha ao remover: ${error.message}`); },
  });

  const bulkRetryMutation = useMutation({
    mutationFn: async () => {
      const pendingEntries = entries?.filter(e => e.status === 'pending' || e.status === 'exhausted') ?? [];
      let successCount = 0;
      for (const entry of pendingEntries.slice(0, 10)) {
        try {
          await supabase.functions.invoke('create-job', {
            body: { agent_name: entry.agent_name, job_type: entry.job_type, payload: entry.payload },
          });
          await supabase.from('failed_jobs_dlq')
            .update({ status: 'retrying', retry_count: entry.retry_count + 1 })
            .eq('id', entry.id);
          successCount++;
        } catch {
          logger.warn('[DLQ] Bulk retry failed for entry', { entryId: entry.id });
        }
      }
      return { successCount, total: pendingEntries.length };
    },
    onSuccess: ({ successCount, total }) => {
      toast.success(`${successCount} de ${Math.min(total, 10)} jobs reenviados`);
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
    },
    onError: () => { toast.error('Falha ao reenviar jobs em lote'); },
  });

  const triggerAutoRetry = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke('process-dlq-retries', { body: {} });
      if (error) throw error;
      toast.success(`Processamento automático: ${data?.results?.retried ?? 0} jobs reenviados`);
      queryClient.invalidateQueries({ queryKey: ['dlq-entries'] });
    } catch {
      toast.error('Falha ao processar retries automáticos');
    }
  }, [queryClient]);

  const statusCounts = entries?.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  const totalEntries = entries?.length ?? 0;
  const resolvedCount = statusCounts['resolved'] ?? 0;
  const resolutionRate = totalEntries > 0 ? Math.round((resolvedCount / totalEntries) * 100) : 0;

  return {
    entries, isLoading, refetch, isFetching,
    statusFilter, setStatusFilter,
    selectedEntry, setSelectedEntry,
    resolveNotes, setResolveNotes,
    showResolveDialog, setShowResolveDialog,
    showDetailsDialog, setShowDetailsDialog,
    resolveMutation, retryMutation, deleteMutation, bulkRetryMutation,
    triggerAutoRetry, statusCounts, resolutionRate,
  };
}
