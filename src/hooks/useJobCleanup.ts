import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';
import { useTenant } from './useTenant';

export interface CleanupFilters {
  status: string[];
  older_than_days: number;
  agent_name?: string;
  only_undelivered: boolean;
  require_no_executions: boolean;
}

export interface CleanupPreview {
  total: number;
  removable: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  oldestDate: string | null;
  newestDate: string | null;
  blockedByExecutions: number;
}

export interface CleanupResult {
  success: boolean;
  deleted_count: number;
  skipped_count: number;
  skipped_reason?: string | null;
  filters: CleanupFilters;
  requestId: string;
}

export function useJobCleanup() {
  const { tenant } = useTenant();
  const [filters, setFilters] = useState<CleanupFilters>({
    status: ['failed'],
    older_than_days: 1,
    only_undelivered: true,
    require_no_executions: true
  });

  // Query para preview de quantos jobs serão afetados
  const previewQuery = useQuery({
    queryKey: ['job-cleanup-preview', tenant?.id, filters],
    queryFn: async (): Promise<CleanupPreview> => {
      if (!tenant?.id) return { total: 0, removable: 0, byStatus: {}, byType: {}, oldestDate: null, newestDate: null, blockedByExecutions: 0 };
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.older_than_days);

      // V-1044 FIX: Add tenant_id filter
      let query = supabase
        .from('jobs')
        .select('id, status, type, created_at, delivered_at')
        .eq('tenant_id', tenant.id);

      if (filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters.older_than_days > 0) {
        query = query.lt('created_at', cutoffDate.toISOString());
      }

      if (filters.agent_name) {
        query = query.eq('agent_name', filters.agent_name);
      }

      // Apply undelivered filter if enabled
      if (filters.only_undelivered) {
        query = query.is('delivered_at', null);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('[useJobCleanup] Preview query failed', { error: error.message });
        throw error;
      }

      const jobs = data || [];
      const jobIds = jobs.map(j => j.id);
      
      // Check how many have executions (if filter is enabled)
      let blockedByExecutions = 0;
      let removableIds = new Set(jobIds);

      if (filters.require_no_executions && jobIds.length > 0) {
        // Query in batches to avoid too long IN clauses
        const BATCH_SIZE = 500;
        const jobsWithExecSet = new Set<string>();
        
        for (let i = 0; i < jobIds.length; i += BATCH_SIZE) {
          const batch = jobIds.slice(i, i + BATCH_SIZE);
          const { data: execData } = await supabase
            .from('job_executions')
            .select('job_id')
            .in('job_id', batch);
          
          (execData || []).forEach(e => jobsWithExecSet.add(e.job_id));
        }
        
        blockedByExecutions = jobsWithExecSet.size;
        removableIds = new Set(jobIds.filter(id => !jobsWithExecSet.has(id)));
      }

      // Aggregate by status and type (only for removable jobs)
      const byStatus: Record<string, number> = {};
      const byType: Record<string, number> = {};
      let oldestDate: string | null = null;
      let newestDate: string | null = null;

      jobs.forEach(job => {
        if (removableIds.has(job.id)) {
          byStatus[job.status] = (byStatus[job.status] || 0) + 1;
          byType[job.type] = (byType[job.type] || 0) + 1;
          
          if (!oldestDate || job.created_at < oldestDate) {
            oldestDate = job.created_at;
          }
          if (!newestDate || job.created_at > newestDate) {
            newestDate = job.created_at;
          }
        }
      });

      return {
        total: jobs.length,
        removable: removableIds.size,
        byStatus,
        byType,
        oldestDate,
        newestDate,
        blockedByExecutions
      };
    },
    staleTime: 30000,
  });

  // Mutation para executar a limpeza
  const cleanupMutation = useMutation({
    mutationFn: async (cleanupFilters: CleanupFilters): Promise<CleanupResult> => {
      logger.info('[useJobCleanup] Starting cleanup', { filters: cleanupFilters });

      const { data, error } = await supabase.functions.invoke('cleanup-jobs', {
        body: cleanupFilters
      });

      if (error) {
        logger.error('[useJobCleanup] Cleanup failed', { error: error.message });
        throw new Error(error.message || 'Falha ao executar limpeza');
      }

      if (data?.error) {
        throw new Error(data.error);
      }

      logger.info('[useJobCleanup] Cleanup completed', { 
        deletedCount: data?.deleted_count,
        skippedCount: data?.skipped_count,
        requestId: data?.requestId 
      });

      return data as CleanupResult;
    },
    onSuccess: (data) => {
      if (data.deleted_count > 0) {
        toast.success(`Limpeza concluída! ${data.deleted_count} jobs removidos.`);
      } else if (data.skipped_count > 0) {
        toast.warning(`Nenhum job removido. ${data.skipped_count} jobs bloqueados por política de auditoria.`);
      } else {
        toast.info('Nenhum job encontrado para remover com os filtros selecionados.');
      }
    },
    onError: (error: Error) => {
      if (error.message.includes('Forbidden') || error.message.includes('Admin')) {
        toast.error('Acesso negado. Você precisa ser administrador para executar esta ação.');
      } else if (error.message.includes('Unauthorized')) {
        toast.error('Sessão expirada. Faça login novamente.');
      } else {
        toast.error(`Erro na limpeza: ${error.message}`);
      }
    }
  });

  const executeCleanup = () => {
    cleanupMutation.mutate(filters);
  };

  const executeQuickCleanup = () => {
    const quickFilters: CleanupFilters = {
      status: ['failed'],
      older_than_days: 1,
      only_undelivered: true,
      require_no_executions: true
    };
    cleanupMutation.mutate(quickFilters);
  };

  return {
    filters,
    setFilters,
    preview: previewQuery.data,
    isLoadingPreview: previewQuery.isLoading,
    previewError: previewQuery.error,
    refetchPreview: previewQuery.refetch,
    executeCleanup,
    executeQuickCleanup,
    isExecuting: cleanupMutation.isPending,
    cleanupResult: cleanupMutation.data,
    cleanupError: cleanupMutation.error,
    resetCleanup: cleanupMutation.reset
  };
}
