/**
 * AgentSystemInfo - Shows essential agent system information
 * Used inside the AgentDetailsDrawer overview tab
 */

import { useQuery } from '@tanstack/react-query';
import { isAgentOnline } from '@/lib/agent-status-constants';
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
import { formatRelativeTime, formatBrazilDateTime } from '@/lib/date-utils';


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

function InfoRow({
  icon: Icon, label, value, badge }: { 
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
      // ADR-026: Use RPC with explicit tenant_id to bypass JWT sync issues
      const { data: agentsRaw } = await supabase.rpc('get_agents_list', {
        p_tenant_id: tenantId,
        p_include_archived: true,
      });
      const agents = (agentsRaw as unknown as Array<Record<string, unknown>>) || [];
      const agent = agents.find(a => a.id === agentId);

      if (!agent) return null;

      // Fetch latest network info for public IP
      const { data: netInfo } = await supabase
        .from('agent_network_info')
        .select('public_ip')
        .eq('agent_id', agentId)
        .order('collected_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      return {
        agent_name: agent.agent_name as string,
        hostname: (agent.hostname as string) || null,
        os_type: (agent.os_type as string) || null,
        os_version: (agent.os_version as string) || null,
        agent_version: (agent.agent_version as string) || null,
        agent_version_code: (agent.agent_version_code as number) || null,
        last_heartbeat: (agent.last_heartbeat as string) || null,
        enrolled_at: (agent.enrolled_at as string) || null,
        poll_interval_seconds: (agent.poll_interval_seconds as number) || null,
        agent_mode: (agent.agent_mode as string) || null,
        display_name: (agent.display_name as string) || null,
        status: (agent.status as string) || null,
        public_ip: netInfo?.public_ip || null,
      } as AgentInfo;
    },
    enabled: !!agentId,
    staleTime: 120_000,
    refetchInterval: adaptiveInterval,
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

  const isOnline = isAgentOnline(info.last_heartbeat);

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
        value={info.enrolled_at ? formatBrazilDateTime(info.enrolled_at, 'date') : null} 
      />
      <InfoRow 
        icon={Clock} 
        label="Intervalo" 
        value={info.poll_interval_seconds ? `${info.poll_interval_seconds}s` : null} 
      />
    </div>
  );
}