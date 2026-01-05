import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { toast } from 'sonner';
import { getJobTypeLabel } from '@/lib/job-labels';
import { logger } from '@/lib/logger';

/**
 * GlobalJobWatcher - Componente invisível que monitora jobs em background
 * 
 * Permite que o usuário navegue livremente enquanto verificações são executadas.
 * Quando um job termina (sucesso ou falha), exibe um toast persistente.
 */
export const GlobalJobWatcher = () => {
  const navigate = useNavigate();
  const { tenant } = useTenant();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  // Track jobs we've already notified about to avoid duplicates
  const notifiedJobsRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!tenant?.id) return;

    // Cleanup previous channel if exists
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    logger.info('[GlobalJobWatcher] Iniciando monitoramento de jobs', { tenantId: tenant.id });

    const channel = supabase
      .channel(`global-jobs-${tenant.id}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          const job = payload.new as {
            id: string;
            agent_name: string;
            type: string;
            status: string;
            error_message?: string | null;
          };

          // Skip if we've already notified about this job completion
          if (notifiedJobsRef.current.has(job.id)) {
            return;
          }

          const jobLabel = getJobTypeLabel(job.type);

          if (job.status === 'completed') {
            notifiedJobsRef.current.add(job.id);
            logger.info('[GlobalJobWatcher] Job concluído', { jobId: job.id, type: job.type });
            
            toast.success(`${jobLabel} concluída!`, {
              description: `Computador: ${job.agent_name}`,
              duration: 8000,
              action: {
                label: 'Ver Painel',
                onClick: () => navigate('/dashboard')
              }
            });
          }

          if (job.status === 'failed') {
            notifiedJobsRef.current.add(job.id);
            logger.warn('[GlobalJobWatcher] Job falhou', { jobId: job.id, type: job.type, error: job.error_message });
            
            toast.error(`${jobLabel} falhou`, {
              description: job.error_message || `Erro ao executar em ${job.agent_name}`,
              duration: 10000,
              action: {
                label: 'Ver Detalhes',
                onClick: () => navigate('/tasks')
              }
            });
          }
        }
      )
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          logger.info('[GlobalJobWatcher] Subscrito com sucesso');
        }
      });

    channelRef.current = channel;

    // Cleanup notified jobs set periodically to prevent memory leak
    const cleanupInterval = setInterval(() => {
      if (notifiedJobsRef.current.size > 100) {
        notifiedJobsRef.current.clear();
        logger.info('[GlobalJobWatcher] Limpeza de cache de notificações');
      }
    }, 60000); // Every minute

    return () => {
      clearInterval(cleanupInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [tenant?.id, navigate]);

  // Invisible component
  return null;
};
