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

    let isSubscribed = true;
    const currentTenantId = tenant.id;

    const setupChannel = async () => {
      // Cleanup previous channel if exists
      if (channelRef.current) {
        await supabase.removeChannel(channelRef.current);
      }

      if (!isSubscribed) return;

      logger.info('[GlobalJobWatcher] Iniciando monitoramento de jobs', { tenantId: currentTenantId });

      const channel = supabase
        .channel(`global-jobs-${currentTenantId}`)
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'jobs',
            filter: `tenant_id=eq.${currentTenantId}`
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
                  onClick: () => navigate('/admin/tasks')
                }
              });
            }
          }
        )
        .subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            logger.info('[GlobalJobWatcher] Subscrito com sucesso');
          }
          if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            logger.error('[GlobalJobWatcher] Erro na subscrição', { status });
            // Exponential backoff or retry could be added here
          }
        });

      channelRef.current = channel;
    };

    setupChannel();

    // Cleanup notified jobs set periodically to prevent memory leak
    const cleanupInterval = setInterval(() => {
      // Keep only recent jobs, don't just wipe everything
      if (notifiedJobsRef.current.size > 200) {
        const jobsArray = Array.from(notifiedJobsRef.current);
        const toKeep = jobsArray.slice(-50); // Keep last 50
        notifiedJobsRef.current = new Set(toKeep);
        logger.info('[GlobalJobWatcher] Limpeza parcial de cache de notificações');
      }
    }, 300000); // Every 5 minutes

    return () => {
      isSubscribed = false;
      clearInterval(cleanupInterval);
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current).then(() => {
          channelRef.current = null;
        });
      }
    };
  }, [tenant?.id, navigate]);

  // Invisible component
  return null;
};
