import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { useTenant } from '@/hooks/useTenant';
import { realtimeChannelManager } from '@/lib/realtime-manager';
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

    const currentTenantId = tenant.id;
    const instanceId = `global-job-watcher-${currentTenantId}`;

    logger.info('[GlobalJobWatcher] Iniciando monitoramento de jobs via manager', { tenantId: currentTenantId });

    realtimeChannelManager.subscribe(
      instanceId,
      'jobs',
      `tenant_id=eq.${currentTenantId}`,
      (payload) => {
        // V-FIX: Manager uses '*', so we filter for UPDATE here
        if (payload.eventType !== 'UPDATE') return;

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
    );

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
      realtimeChannelManager.unsubscribe(instanceId, 'jobs', `tenant_id=eq.${currentTenantId}`);
      clearInterval(cleanupInterval);
    };
  }, [tenant?.id, navigate]);

  // Invisible component
  return null;
};
