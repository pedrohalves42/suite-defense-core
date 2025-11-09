import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ShieldAlert, FileWarning, AlertTriangle, Server } from 'lucide-react';
import { useTenant } from '@/hooks/useTenant';

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
}

export const NotificationSystem = () => {
  const { tenant, loading } = useTenant();
  const [quarantineCount, setQuarantineCount] = useState(0);

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
          setQuarantineCount(prev => prev + 1);
        }
      )
      .subscribe();

    // Subscribe to agent status changes
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
          
          // Agent went offline
          if (oldAgent.status === 'active' && newAgent.status === 'inactive') {
            toast.warning(
              `Agente Offline`,
              {
                description: `${newAgent.agent_name} está desconectado`,
                icon: <Server className="h-5 w-5" />,
                duration: 8000
              }
            );
          }
          
          // Agent came back online
          if (oldAgent.status === 'inactive' && newAgent.status === 'active') {
            toast.success(
              `Agente Reconectado`,
              {
                description: `${newAgent.agent_name} voltou online`,
                icon: <Server className="h-5 w-5" />,
                duration: 5000
              }
            );
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
          const scan = payload.new as any;
          
          // Only notify for malicious files
          if (scan.is_malicious && scan.positives > 0) {
            toast.warning(
              `Ameaça Detectada`,
              {
                description: `${scan.file_path} - ${scan.positives}/${scan.total_scans} detecções`,
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
          const job = payload.new as any;
          
          if (job.status === 'failed') {
            toast.error(
              `Job Falhou`,
              {
                description: `${job.type} no agente ${job.agent_name}`,
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
  }, [tenant?.id, loading]);

  return null; // Este componente não renderiza nada, apenas gerencia notificações
};
