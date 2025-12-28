import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export interface CleanupFilters {
  status: string[];
  older_than_days: number;
  agent_name?: string;
}

export interface CleanupPreview {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  oldestDate: string | null;
  newestDate: string | null;
}

export function useJobCleanup() {
  const [filters, setFilters] = useState<CleanupFilters>({
    status: ['failed'],
    older_than_days: 1
  });

  // Query para preview de quantos jobs serão afetados
  const previewQuery = useQuery({
    queryKey: ['job-cleanup-preview', filters],
    queryFn: async (): Promise<CleanupPreview> => {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - filters.older_than_days);

      let query = supabase
        .from('jobs')
        .select('id, status, type, created_at');

      if (filters.status.length > 0) {
        query = query.in('status', filters.status);
      }

      if (filters.older_than_days > 0) {
        query = query.lt('created_at', cutoffDate.toISOString());
      }

      if (filters.agent_name) {
        query = query.eq('agent_name', filters.agent_name);
      }

      const { data, error } = await query;

      if (error) {
        logger.error('[useJobCleanup] Preview query failed', { error: error.message });
        throw error;
      }

      const jobs = data || [];
      
      // Aggregate by status
      const byStatus: Record<string, number> = {};
      const byType: Record<string, number> = {};
      let oldestDate: string | null = null;
      let newestDate: string | null = null;

      jobs.forEach(job => {
        byStatus[job.status] = (byStatus[job.status] || 0) + 1;
        byType[job.type] = (byType[job.type] || 0) + 1;
        
        if (!oldestDate || job.created_at < oldestDate) {
          oldestDate = job.created_at;
        }
        if (!newestDate || job.created_at > newestDate) {
          newestDate = job.created_at;
        }
      });

      return {
        total: jobs.length,
        byStatus,
        byType,
        oldestDate,
        newestDate
      };
    },
    staleTime: 30000, // 30 seconds
  });

  // Mutation para executar a limpeza
  const cleanupMutation = useMutation({
    mutationFn: async (cleanupFilters: CleanupFilters) => {
      logger.info('[useJobCleanup] Starting cleanup', { filters: cleanupFilters });

      const { data, error } = await supabase.functions.invoke('cleanup-jobs', {
        body: cleanupFilters
      });

      if (error) {
        logger.error('[useJobCleanup] Cleanup failed', { error: error.message });
        throw new Error(error.message || 'Falha ao executar limpeza');
      }

      // Check for error in response body
      if (data?.error) {
        throw new Error(data.error);
      }

      logger.info('[useJobCleanup] Cleanup completed', { 
        deletedCount: data?.deleted_count,
        requestId: data?.requestId 
      });

      return data;
    },
    onSuccess: (data) => {
      toast.success(`Limpeza concluída! ${data.deleted_count} jobs removidos.`);
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

  return {
    filters,
    setFilters,
    preview: previewQuery.data,
    isLoadingPreview: previewQuery.isLoading,
    previewError: previewQuery.error,
    refetchPreview: previewQuery.refetch,
    executeCleanup,
    isExecuting: cleanupMutation.isPending,
    cleanupResult: cleanupMutation.data,
    cleanupError: cleanupMutation.error
  };
}
