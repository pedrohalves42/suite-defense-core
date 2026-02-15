/**
 * AgentSystemInfo - Shows essential agent system information
 * Used inside the AgentDetailsDrawer overview tab
 */

import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Monitor, 
  Cpu, 
  Clock, 
  Globe, 
  HardDrive, 
  Wifi,
  Calendar,
  Tag
} from 'lucide-react';
import { formatRelativeTime } from '@/lib/date-utils';

interface AgentSystemInfoProps {
  agentId: string;
  tenantId?: string;
}

interface AgentInfo {
  agent_name: string;
  hostname: string | null;
  os_type: string | null;
  os_version: string | null;
  agent_version: string | null;
  agent_version_code: number | null;
  last_heartbeat: string | null;
  enrolled_at: string | null;
  poll_interval_seconds: number | null;
  agent_mode: string | null;
  display_name: string | null;
  status: string | null;
  public_ip: string | null;
}

function InfoRow({ icon: Icon, label, value, badge }: { 
  icon: typeof Monitor; 
  label: string; 
  value: string | null | undefined;
  badge?: { text: string; variant?: 'default' | 'secondary' | 'destructive' | 'outline' };
}) {
  return (
    <div className="flex items-center justify-between py-2 px-1">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Icon className="h-3.5 w-3.5" />
        <span>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        {badge ? (
          <Badge variant={badge.variant || 'secondary'} className="text-xs">
            {badge.text}
          </Badge>
        ) : (
          <span className="text-sm font-medium text-foreground truncate max-w-[180px]">
            {value || '—'}
          </span>
        )}
      </div>
    </div>
  );
}

export function AgentSystemInfo({ agentId, tenantId }: AgentSystemInfoProps) {
  const { data: info, isLoading } = useQuery({
    queryKey: ['agent-system-info', agentId],
    queryFn: async (): Promise<AgentInfo | null> => {
      // Fetch agent basic data
      const { data: agent, error } = await supabase
        .from('agents_safe')
        .select('agent_name, hostname, os_type, os_version, agent_version, agent_version_code, last_heartbeat, enrolled_at, poll_interval_seconds, agent_mode, display_name, status')
        .eq('id', agentId)
        .maybeSingle();

      if (error || !agent) return null;

      // Fetch latest network info for public IP
      const { data: netInfo } = await supabase
        .from('agent_network_info')
        .select('public_ip')
        .eq('agent_id', agentId)
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        ...agent,
        public_ip: netInfo?.public_ip || null,
      };
    },
    enabled: !!agentId,
    refetchInterval: 30000,
  });

  if (isLoading) {
    return (
      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-full" />
        ))}
      </div>
    );
  }

  if (!info) return null;

  const getOsLabel = (osType: string | null, osVersion: string | null) => {
    if (!osType) return null;
    const label = osType === 'windows' ? 'Windows' : osType === 'linux' ? 'Linux' : osType === 'macos' ? 'macOS' : osType;
    return osVersion ? `${label} ${osVersion}` : label;
  };

  const getModeLabel = (mode: string | null) => {
    switch (mode) {
      case 'NORMAL': return 'Normal';
      case 'SAFE_MODE': return 'Modo Protegido';
      case 'LIGHT_MODE': return 'Modo Leve';
      default: return mode || 'Normal';
    }
  };

  const isOnline = info.last_heartbeat && 
    (Date.now() - new Date(info.last_heartbeat).getTime()) < 10 * 60 * 1000;

  return (
    <div className="rounded-lg border bg-card divide-y divide-border">
      <InfoRow 
        icon={Monitor} 
        label="Hostname" 
        value={info.hostname || info.agent_name} 
      />
      <InfoRow 
        icon={Cpu} 
        label="Sistema" 
        value={getOsLabel(info.os_type, info.os_version)} 
      />
      <InfoRow 
        icon={Tag} 
        label="Versão do Agente" 
        badge={info.agent_version ? { 
          text: info.agent_version, 
          variant: 'outline' 
        } : undefined}
        value={info.agent_version}
      />
      <InfoRow 
        icon={Wifi} 
        label="Conexão" 
        badge={{ 
          text: isOnline ? 'Online' : 'Offline', 
          variant: isOnline ? 'default' : 'destructive' 
        }}
        value={null}
      />
      <InfoRow 
        icon={Clock} 
        label="Último Contato" 
        value={info.last_heartbeat ? formatRelativeTime(info.last_heartbeat) : 'Nunca'} 
      />
      <InfoRow 
        icon={Globe} 
        label="IP Público" 
        value={info.public_ip} 
      />
      <InfoRow 
        icon={HardDrive} 
        label="Modo" 
        value={getModeLabel(info.agent_mode)} 
      />
      <InfoRow 
        icon={Calendar} 
        label="Instalado em" 
        value={info.enrolled_at ? new Date(info.enrolled_at).toLocaleDateString('pt-BR') : null} 
      />
      <InfoRow 
        icon={Clock} 
        label="Intervalo" 
        value={info.poll_interval_seconds ? `${info.poll_interval_seconds}s` : null} 
      />
    </div>
  );
}