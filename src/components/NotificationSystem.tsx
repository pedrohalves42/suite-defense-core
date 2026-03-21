import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShieldAlert, FileWarning, AlertTriangle, Server, ShieldOff, WifiOff } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';
import { getJobTypeLabelNoEmoji } from '@/lib/job-labels';
import { deriveAgentState, getStateDescription, type AgentState } from '@/lib/agent-state-machine';
import { usePushNotifications } from '@/hooks/usePushNotifications';

interface QuarantinedFile {
  id: string;
  file_path: string;
  agent_name: string;
  positives: number;
  total_scans: number;
  quarantined_at: string;
}

interface Agent {
  agent_name: string;
  status: string;
  is_isolated: boolean | null;
  is_throttled: boolean | null;
  safe_mode_reason: string | null;
  safe_mode_entered_at: string | null;
  last_heartbeat: string | null;
  force_update_version: string | null;
  force_update_at: string | null;
  agent_state: string | null;
}

// Map states to notification configurations
const STATE_NOTIFICATIONS: Record<AgentState, { 
  icon: React.ComponentType<{ className?: string }>;
  type: 'success' | 'warning' | 'error' | 'info';
} | null> = {
  healthy: { icon: Server, type: 'success' },
  degraded: { icon: AlertTriangle, type: 'warning' },
  safe_mode: { icon: ShieldAlert, type: 'warning' },
  updating: null, // Don't notify for updates
  rollback: { icon: AlertTriangle, type: 'warning' },
  isolated: { icon: ShieldOff, type: 'error' },
  offline: { icon: WifiOff, type: 'warning' },
  quarantined: { icon: ShieldOff, type: 'error' },
  shutdown: null, // Don't notify for shutdown (terminal state)
};

export const NotificationSystem = () => {
  const { tenant, loading } = useTenant();
  const [quarantineCount, setQuarantineCount] = useState(0);
  const { isGranted, showNotification } = usePushNotifications();

  useEffect(() => {
    if (!tenant?.id || loading) return;

    // Subscribe to quarantined files
    const quarantineChannel = supabase
      .channel('quarantine-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'quarantined_files',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          const file = payload.new as QuarantinedFile;
          toast.error(
            `Arquivo Malicioso Detectado`,
            {
              description: `${file.file_path} no agente ${file.agent_name}`,
              icon: <ShieldAlert className="h-5 w-5" />,
              duration: 10000,
              action: {
                label: 'Ver Quarentena',
                onClick: () => window.location.href = '/quarantine'
              }
            }
          );
          // Push notification for background alerts
          if (isGranted) {
            showNotification({
              title: '🛡️ Arquivo Malicioso Detectado',
              body: `${file.file_path} no agente ${file.agent_name}`,
              tag: `quarantine-${file.id}`,
            });
          }
          setQuarantineCount(prev => prev + 1);
        }
      )
      .subscribe();

    // Subscribe to agent status changes - use formal state machine
    const agentsChannel = supabase
      .channel('agents-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'agents',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          const oldAgent = payload.old as Agent;
          const newAgent = payload.new as Agent;
          
          // Derive formal states
          const oldState = deriveAgentState(oldAgent);
          const newState = deriveAgentState(newAgent);
          
          // Only notify if state actually changed
          if (oldState === newState) return;
          
          const stateDesc = getStateDescription(newState);
          const notification = STATE_NOTIFICATIONS[newState];
          
          if (!notification) return;
          
          const Icon = notification.icon;
          
          // Use appropriate toast type
          const toastFn = notification.type === 'success' ? toast.success
            : notification.type === 'error' ? toast.error
            : notification.type === 'warning' ? toast.warning
            : toast.info;
          
          toastFn(
            `${newAgent.agent_name}: ${stateDesc.label}`,
            {
              description: stateDesc.description,
              icon: <Icon className="h-5 w-5" />,
              duration: notification.type === 'error' ? 10000 : 6000
            }
          );
          
          // Push notification for critical/error states
          if (isGranted && (notification.type === 'error' || notification.type === 'warning')) {
            showNotification({
              title: `⚠️ ${newAgent.agent_name}`,
              body: `${stateDesc.label}: ${stateDesc.description}`,
              tag: `agent-state-${newAgent.agent_name}`,
            });
          }
        }
      )
      .subscribe();

    // Subscribe to virus scans
    const scansChannel = supabase
      .channel('scans-notifications')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'virus_scans',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          const scan = payload.new as RealtimeVirusScan;
          
          // Only notify for malicious files
          if (scan.is_malicious && scan.positives > 0) {
            toast.warning(
              `Ameaca Detectada`,
              {
                description: `${scan.file_path} - ${scan.positives}/${scan.total_scans} deteccoes`,
                icon: <FileWarning className="h-5 w-5" />,
                duration: 8000
              }
            );
          }
        }
      )
      .subscribe();

    // Subscribe to failed jobs
    const jobsChannel = supabase
      .channel('jobs-notifications')
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'jobs',
          filter: `tenant_id=eq.${tenant.id}`
        },
        (payload) => {
          const job = payload.new as RealtimeJob;
          
          if (job.status === 'failed') {
            toast.error(
              `Job Falhou`,
              {
                description: `${getJobTypeLabelNoEmoji(job.type)} no agente ${job.agent_name}`,
                icon: <AlertTriangle className="h-5 w-5" />,
                duration: 6000
              }
            );
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(quarantineChannel);
      supabase.removeChannel(agentsChannel);
      supabase.removeChannel(scansChannel);
      supabase.removeChannel(jobsChannel);
    };
  }, [tenant?.id, loading, isGranted, showNotification]);

  return null; // Este componente nao renderiza nada, apenas gerencia notificacoes
};
